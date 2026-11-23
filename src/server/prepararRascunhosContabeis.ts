import type { OrigemMapeadaContabil } from "../types";
import { vigenteNaCompetencia } from "../utils/vigenciaObrigacoes";
import { ROTULO_PARA_ID, ID_PARA_ROTULO, ORIGEM_POR_TRIBUTO as ORIGEM_POR_TRIBUTO_ID, ITENS_FOLHA_DP, SUFIXO_ENCARGOS_DAS, TRIBUTOS_DARF_PAGO, conciliarResumoFolhaDP } from "../utils/origensContabeis";
import { lerTodosDocumentosFiscais, fiscalStoreConfigurado } from "./documentosFiscaisStore";
import { lerApuracoesFiscais, apuracoesStoreConfigurado, type ApuracaoFiscalArmazenada } from "./apuracoesFiscaisStore";
import { lerResumosDP, dpStoreConfigurado } from "./dadosDpStore";
import { lerResumosProLaboreDP } from "./dadosProLaboreStore";
import { lerEventosDP, type EventoDPLido, type TipoEventoDP } from "./dadosDpEventosStore";
import { lerWorkspaceInternoContabil, mesclarRascunhosAutomaticosContabil, tratarNotasSemValorContabil, type RascunhoAutomaticoContabil } from "./authContabil";
import { contasDoRascunhoFiscal, contasDoRascunhoConferem, ehChaveNfce } from "../utils/contasRascunhoFiscal";

type Registro = Record<string, any>;
type ResumoFolha = { competencia: string; calculadoEm?: string; atualizadoEm?: string; recebidoEm?: string; resumo?: Record<string, unknown> };

const mapeamentosOrigem: Record<string, OrigemMapeadaContabil> = ROTULO_PARA_ID;

/** Tributo (contrato de integração com o Fiscal — ver apuracoesContabilOutbox.ts lá) → rótulo da origem mapeável aqui. */
const ORIGEM_POR_TRIBUTO: Record<string, string> = Object.fromEntries(Object.entries(ORIGEM_POR_TRIBUTO_ID).map(([tributo, id]) => [tributo, ID_PARA_ROTULO[id]]));

const valorNumerico = (valor: unknown): number | null => typeof valor === "number" && Number.isFinite(valor) ? valor : null;

function dataCompetencia(valor: unknown): { data: string; competencia: string } | null {
  const texto = String(valor || "").trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const ano = br?.[3] || iso?.[1] || "";
  const mes = br?.[2] || iso?.[2] || "";
  const dia = br?.[1] || iso?.[3] || "01";
  const competencia = ano && mes ? `${ano}-${mes}` : "";
  const data = ano && mes ? `${ano}-${mes}-${dia}` : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(data)) return null;
  const dataObjeto = new Date(`${data}T00:00:00Z`);
  const valida = Number.isFinite(dataObjeto.getTime()) && dataObjeto.toISOString().slice(0, 10) === data;
  return valida && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? { data, competencia } : null;
}

/**
 * Nota que deixou de valer (ou nunca valeu): cancelada, substituída (NFS-e: Resolução CGNFS-e 3/2023, art. 7º e 8º — a substituta
 * cancela a anterior), denegada ou inutilizada, ou com evento de cancelamento confirmado (110111/110112). Nunca vira pré-lançamento,
 * lançamento, balancete nem DRE. Mesma regra do Fiscal (conferenciaEntregaNotas.ts → notaSemValorFiscal).
 */
export function notaSemValor(documento: Registro): boolean {
  if (!documento) return false;
  return /cancelad|substitu[ií]d|denegad|inutilizad/i.test(String(documento.statusSefaz || ""))
    || Boolean(documento.substituidaPor)
    || (Array.isArray(documento.eventosSefaz) && documento.eventosSefaz.some((evento: Registro) =>
      evento?.confirmado === true && (/(cancelamento|cancelada)/i.test(String(evento.descricao || ""))
        || ["110111", "110112"].includes(String(evento.tipoEvento || ""))
      ),
    ));
}
const cancelado = notaSemValor;

/** Texto curto de por que a nota não vale (para o alerta do contador). */
export function motivoNotaSemValor(documento: Registro): string {
  const st = String(documento?.statusSefaz || "");
  if (documento?.substituidaPor || /substitu/i.test(st) || /substitu/i.test(String(documento?.motivoCancelamento || ""))) return "substituída por outra NFS-e";
  if (/denegad/i.test(st)) return "denegada";
  if (/inutilizad/i.test(st)) return "inutilizada";
  return "cancelada";
}

/** NFS-e: o Fiscal guarda com modelo "NFS-e Municipal" (ambiente nacional ou XML importado). */
export function ehNfseDocumento(documento: Registro): boolean {
  return String(documento?.modelo || "") === "NFS-e Municipal";
}

/**
 * Nota que pode virar pré-lançamento.
 *  - NF-e, NFC-e e CT-e: autorizada e com a situação CONFIRMADA na SEFAZ (statusVerificadoSefaz). A nota "Pendente" de confirmação
 *    (ex.: histórico anterior a 01/09/2026, que o dono decidiu não conferir) não entra: pode ter sido rejeitada ou cancelada.
 *  - NFS-e: a prefeitura/ambiente nacional não devolve "autorizada" como a SEFAZ; vale a mesma regra que o Fiscal usa para a receita
 *    do PGDAS-D (pgdasdApuracao.ts): entra se não estiver cancelada ou substituída. Assim a contabilidade e o DAS contam a mesma nota.
 */
export function fiscalAutorizado(documento: Registro): boolean {
  if (cancelado(documento)) return false;
  if (ehNfseDocumento(documento)) return true;
  return documento.statusVerificadoSefaz === true && /autorizad/i.test(String(documento.statusSefaz || ""));
}

/** Regime informado no cadastro da empresa. No Simples Nacional o imposto destacado em nota não gera crédito/débito próprio: o pré-lançamento usa o valor bruto. */
export function regimeSimplesNacional(regime: unknown): boolean {
  return /^\s*simples\s+nacional/i.test(String(regime || ""));
}

/** CFOPs (sufixo de 3 dígitos, qualquer prefixo 1/2/5/6) que representam compra de mercadoria/insumo para estoque. */
const SUFIXOS_COMPRA_ESTOQUE = new Set(["101", "102", "111", "113", "116", "118", "120", "122", "401", "403", "405"]);

/** Entrada sem CFOP reconhecível como compra (devolução, remessa, uso/consumo, vazio) não vira pré-lançamento automático: fica para o contador. */
export function entradaEhCompraParaEstoque(cfop: unknown): boolean {
  const digitos = String(cfop ?? "").replace(/\D/g, "");
  return digitos.length === 4 && "1256".includes(digitos[0]) && SUFIXOS_COMPRA_ESTOQUE.has(digitos.slice(1));
}

/** NFC-e (modelo 65 na chave) é venda de balcão: recebida na hora, não gera conta a receber de Clientes. */
export function ehNfce(referencia: string): boolean {
  return ehChaveNfce(referencia);
}

/** Nome curto do documento para o histórico (antes tudo saía como "NF-e"). */
export function rotuloDocumento(documento: Registro, referencia: string): string {
  if (ehNfseDocumento(documento)) return "NFS-e";
  if (ehChaveNfce(referencia)) return "NFC-e";
  if (/^\d{44}$/.test(referencia) && ["57", "67"].includes(referencia.slice(20, 22))) return "CT-e";
  return "NF-e";
}

/** Por que uma nota do Fiscal não virou pré-lançamento (null = virou). Textos curtos para a pendência do contador. */
export type MotivoSemRascunho =
  | "outra_empresa" | "nao_confirmada" | "cancelada" | "tipo" | "sem_data_ou_valor" | "sem_dados_tributarios" | "imposto_fora_do_simples"
  | "sem_mapeamento" | "entrada_nao_compra" | "servico_tomado" | "sem_conta_servicos";
export const TEXTO_MOTIVO: Record<MotivoSemRascunho, string> = {
  outra_empresa: "a nota é de outro CNPJ",
  nao_confirmada: "a situação da nota não foi confirmada na SEFAZ (pode ter sido rejeitada ou cancelada)",
  cancelada: "nota cancelada, substituída, denegada ou inutilizada: não entra na contabilidade",
  tipo: "a nota não é de entrada nem de saída",
  sem_data_ou_valor: "a nota está sem data ou com valor zerado",
  sem_dados_tributarios: "o Fiscal ainda não leu os impostos da nota",
  imposto_fora_do_simples: "a empresa não é do Simples e a nota tem imposto destacado: lance com a separação dos impostos",
  sem_mapeamento: "falta mapear as contas de notas da empresa (Revisão das origens)",
  entrada_nao_compra: "entrada que não é compra para estoque (devolução, remessa, uso e consumo ou sem CFOP): classifique a conta",
  servico_tomado: "nota de serviço tomado (despesa): classifique a conta",
  sem_conta_servicos: "o plano não tem conta de receita de prestação de serviços no grupo da receita de vendas",
};

export type DiagnosticoNota = { referenciaDocumento: string; competencia: string | null; tipo: string; valorCentavos: number | null; rascunho: RascunhoAutomaticoContabil | null; motivo: MotivoSemRascunho | null };

/** Uma nota → o pré-lançamento ou o motivo de não haver. Quem gera e o conferidor usam esta mesma função. */
/** Identificador do documento dentro da referência do pré-lançamento (chave de acesso; NFS-e sem chave nacional usa o id do Fiscal). */
export function documentoDaReferencia(documento: Registro): string {
  return String((ehNfseDocumento(documento) && !/^\d{50}$/.test(String(documento?.chaveAcesso || "")) ? documento?.id : documento?.chaveAcesso) || documento?.id || "").trim();
}

/** Referência FISCAL:<cnpj>:<competência>:<Entrada|Saida>:<documento> da nota, ou null quando falta data/tipo/identificador. */
export function referenciaDaNotaFiscal(cnpj: string, documento: Registro): string | null {
  const doc = documentoDaReferencia(documento);
  const periodo = dataCompetencia(documento?.dataEmissao || documento?.emissao);
  if (!doc || doc.length > 128 || !periodo || (documento?.tipo !== "Entrada" && documento?.tipo !== "Saída")) return null;
  return `FISCAL:${cnpj}:${periodo.competencia}:${documento.tipo === "Entrada" ? "Entrada" : "Saida"}:${doc}`;
}

export type NotaSemValorParaContabil = { referencia: string; rotulo: string; numero: string; valor: number; competencia: string; motivo: string; tipo: "Entrada" | "Saída" };

/** Notas do CNPJ que não valem e que já podem ter virado pré-lançamento ou lançamento (para retirar ou alertar). */
export function notasSemValorDoCnpj(cnpj: string, documentos: Registro[]): NotaSemValorParaContabil[] {
  const saida: NotaSemValorParaContabil[] = [];
  for (const documento of documentos) {
    if (!documento || documento.cnpjEmpresa?.toUpperCase().replace(/[^A-Z0-9]/g, "") !== cnpj || !notaSemValor(documento)) continue;
    const referencia = referenciaDaNotaFiscal(cnpj, documento);
    if (!referencia) continue;
    const valor = valorNumerico(documento.valorTotal) ?? Number(documento.valorTotal);
    saida.push({
      referencia, rotulo: rotuloDocumento(documento, documentoDaReferencia(documento)), numero: String(documento.numero ?? "").slice(0, 20),
      valor: Number.isFinite(valor) ? Math.round((valor + Number.EPSILON) * 100) / 100 : 0, competencia: referencia.split(":")[2],
      motivo: motivoNotaSemValor(documento), tipo: documento.tipo,
    });
  }
  return saida;
}

export function diagnosticarNotaFiscal(cnpj: string, documento: Registro, contas: Registro[], mapeamentos: Registro[], agora: string, simplesNacional = false): DiagnosticoNota {
  const referenciaDocumento = documentoDaReferencia(documento || {});
  const periodo = dataCompetencia(documento?.dataEmissao || documento?.emissao);
  const valor = valorNumerico(documento?.valorTotal);
  const base: DiagnosticoNota = { referenciaDocumento, competencia: periodo?.competencia ?? null, tipo: String(documento?.tipo || ""), valorCentavos: valor === null ? null : Math.round((valor + Number.EPSILON) * 100), rascunho: null, motivo: null };
  const fim = (motivo: MotivoSemRascunho): DiagnosticoNota => ({ ...base, motivo });
  if (!documento || documento.cnpjEmpresa?.toUpperCase().replace(/[^A-Z0-9]/g, "") !== cnpj) return fim("outra_empresa");
  if (documento.tipo !== "Entrada" && documento.tipo !== "Saída") return fim("tipo");
  if (cancelado(documento)) return fim("cancelada");
  if (!fiscalAutorizado(documento)) return fim("nao_confirmada");
  if (!referenciaDocumento || referenciaDocumento.length > 128 || !periodo || valor === null || valor <= 0) return fim("sem_data_ou_valor");
  if (documento.dadosTributariosDisponiveis !== true) return fim("sem_dados_tributarios");
  const tributarios = ["valorIcms", "valorIpi", "valorPis", "valorCofins", "valorIss"];
  if (!simplesNacional && tributarios.some((campo) => valorNumerico(documento[campo]) !== 0)) return fim("imposto_fora_do_simples");
  const nfse = ehNfseDocumento(documento);
  if (documento.tipo === "Entrada" && nfse) return fim("servico_tomado");
  if (documento.tipo === "Entrada" && !entradaEhCompraParaEstoque(documento.cfop)) return fim("entrada_nao_compra");

  const origem = (documento.tipo === "Entrada" ? "Fiscal — Entrada" : "Fiscal — Saída") as keyof typeof mapeamentosOrigem;
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const mapping = mapeamentos.find((item) => item.origem === mapeamentosOrigem[origem]);
  if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
    || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) return fim("sem_mapeamento");

  const tipoReferencia = documento.tipo === "Entrada" ? "Entrada" : "Saida";
  const referencia = `FISCAL:${cnpj}:${periodo.competencia}:${tipoReferencia}:${referenciaDocumento}`;
  const par = contasDoRascunhoFiscal(referencia, mapping, contas);
  if (!par) return fim(nfse ? "sem_conta_servicos" : "sem_mapeamento");
  const rotulo = rotuloDocumento(documento, referenciaDocumento);
  return { ...base, rascunho: {
    id: referencia,
    referenciaOrigem: referencia,
    competencia: periodo.competencia,
    data: periodo.data,
    origem,
    contaDebitoCodigo: par.debito,
    contaCreditoCodigo: par.credito,
    valor: Math.round((valor + Number.EPSILON) * 100) / 100,
    // Texto igual ao de antes para NF-e/NFC-e (mudar o histórico reescreveria pré-lançamentos já preparados); NFS-e ganha o rótulo e o número.
    historico: rotulo === "NFS-e"
      ? `${origem} NFS-e ${referenciaDocumento}${documento.numero ? ` nº ${String(documento.numero).slice(0, 20)}` : ""} — valor bruto, pré-lançamento para conferência`
      : `${origem} NF-e ${referenciaDocumento} — valor bruto, pré-lançamento para conferência`,
    criadoEm: agora,
  } };
}

export function gerarRascunhosFiscal(cnpj: string, documentos: Registro[], contas: Registro[], mapeamentos: Registro[], agora: string, simplesNacional = false): RascunhoAutomaticoContabil[] {
  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const documento of documentos) {
    const d = diagnosticarNotaFiscal(cnpj, documento, contas, mapeamentos, agora, simplesNacional);
    if (d.rascunho) candidatos.push(d.rascunho);
  }
  return candidatos;
}

const HISTORICO_POR_TRIBUTO: Record<string, string> = {
  ICMS_DIFAL_ATIVO: "DIFAL do ICMS (ativo imobilizado) confirmado no Fiscal",
  ICMS_DIFAL_CONSUMO: "DIFAL do ICMS (uso/consumo) confirmado no Fiscal",
  IRPJ_PRESUMIDO: "IRPJ do Lucro Presumido (trimestre) confirmado no Fiscal",
  CSLL_PRESUMIDO: "CSLL do Lucro Presumido (trimestre) confirmado no Fiscal",
  PIS_PRESUMIDO: "PIS do Lucro Presumido (mês) confirmado no Fiscal",
  COFINS_PRESUMIDO: "COFINS do Lucro Presumido (mês) confirmado no Fiscal",
  DAS_SIMPLES: "DAS do Simples Nacional (provisão do período) confirmado no Fiscal",
  IRPJ_REAL: "IRPJ do Lucro Real (provisão do período) confirmado na Apuração do Lucro Real",
  CSLL_REAL: "CSLL do Lucro Real (provisão do período) confirmada na Apuração do Lucro Real",
  PIS_NAO_CUMULATIVO: "PIS não cumulativo (débito do mês) confirmado no Fiscal",
  COFINS_NAO_CUMULATIVA: "COFINS não cumulativa (débito do mês) confirmada no Fiscal",
  PIS_NC_CREDITO: "Créditos de PIS não cumulativo do mês confirmados no Fiscal",
  COFINS_NC_CREDITO: "Créditos de COFINS não cumulativa do mês confirmados no Fiscal",
  DAS_SIMPLES_PAGO: "Pagamento do DAS do Simples Nacional confirmado no Fiscal",
  IRPJ_PRESUMIDO_PAGO: "IRPJ do Lucro Presumido — pagamento do DARF registrado no Fiscal",
  CSLL_PRESUMIDO_PAGO: "CSLL do Lucro Presumido — pagamento do DARF registrado no Fiscal",
  PIS_PRESUMIDO_PAGO: "PIS do Lucro Presumido — pagamento do DARF registrado no Fiscal",
  COFINS_PRESUMIDO_PAGO: "COFINS do Lucro Presumido — pagamento do DARF registrado no Fiscal",
  PIS_NC_PAGO: "PIS não cumulativo — pagamento do DARF 6912 registrado no Fiscal",
  COFINS_NC_PAGO: "COFINS não cumulativa — pagamento do DARF 5856 registrado no Fiscal",
  IRPJ_REAL_PAGO: "IRPJ do Lucro Real — pagamento do DARF registrado na Apuração do Lucro Real",
  CSLL_REAL_PAGO: "CSLL do Lucro Real — pagamento do DARF registrado na Apuração do Lucro Real",
  CPRB: "CPRB do mês (desoneração da folha) calculada no DP",
  IRPJ_ARBITRADO: "IRPJ do Lucro Arbitrado (trimestre) marcado no Fiscal",
  CSLL_ARBITRADO: "CSLL do Lucro Arbitrado (trimestre) marcada no Fiscal",
  PIS_ARBITRADO: "PIS do Lucro Arbitrado (mês, cumulativo) calculado no Fiscal",
  COFINS_ARBITRADO: "COFINS do Lucro Arbitrado (mês, cumulativa) calculada no Fiscal",
  COFINS_ENTIDADE: "COFINS da entidade sobre receita não própria (mês) confirmada no Fiscal",
  ISS_PROPRIO: "ISS a recolher do mês (NFS-e prestadas) apurado no Fiscal",
  ISS_RETIDO_TOMADOR: "ISS retido de prestadores (empresa tomadora) apurado no Fiscal",

};

const mapeamentoValido = (mapeamentos: Registro[], idOrigem: string, analiticas: Set<unknown>) => {
  const m = mapeamentos.find((item) => item.origem === idOrigem);
  return m && analiticas.has(m.contaDebitoCodigo) && analiticas.has(m.contaCreditoCodigo) && m.contaDebitoCodigo !== m.contaCreditoCodigo ? m : null;
};

/**
 * Data do pré-lançamento da apuração. Provisão do DAS: último dia do período de apuração. Pagamento do DAS: a data do pagamento,
 * que o Fiscal manda na versão de origem ("pago:AAAA-MM-DD:<valor>"), se cair no mês do pagamento — vale também para o pagamento dos
 * DARF (tributos *_PAGO). Provisões do Lucro Presumido e do PIS/COFINS não cumulativos: último dia do mês da competência (o tributo é
 * do período; para IRPJ/CSLL a competência é o último mês do trimestre). As demais (DIFAL) seguem no dia 1º.
 */
const PROVISAO_NO_FIM_DO_MES = new Set(["ISS_PROPRIO", "ISS_RETIDO_TOMADOR", "IRPJ_ARBITRADO", "CSLL_ARBITRADO", "PIS_ARBITRADO", "COFINS_ARBITRADO", "COFINS_ENTIDADE", "CPRB", "IRPJ_REAL", "CSLL_REAL", "IRPJ_PRESUMIDO", "CSLL_PRESUMIDO", "PIS_PRESUMIDO", "COFINS_PRESUMIDO", "PIS_NAO_CUMULATIVO", "COFINS_NAO_CUMULATIVA", "PIS_NC_CREDITO", "COFINS_NC_CREDITO"]);
export function dataDaApuracao(apuracao: Pick<ApuracaoFiscalArmazenada, "tributo" | "competencia" | "versaoOrigem">): string {
  if (apuracao.tributo === "DAS_SIMPLES" || PROVISAO_NO_FIM_DO_MES.has(apuracao.tributo)) {
    const [a, m] = apuracao.competencia.split("-").map(Number);
    return `${apuracao.competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  }
  if (apuracao.tributo === "DAS_SIMPLES_PAGO" || TRIBUTOS_DARF_PAGO.has(apuracao.tributo)) {
    const d = /^pago:(\d{4}-\d{2}-\d{2}):/.exec(String(apuracao.versaoOrigem || ""))?.[1];
    if (d && d.slice(0, 7) === apuracao.competencia && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d) return d;
  }
  return `${apuracao.competencia}-01`;
}

/**
 * Pagamento do DAS: o valor pago pode trazer multa e juros. Quando o Fiscal informa o principal (baseCentavos) e ele é menor que o
 * valor pago, o principal baixa o "Simples a recolher" e a diferença (multa + juros) vai para a origem própria de encargos.
 * Sem o principal, vai o valor pago inteiro. Tudo ou nada: com encargos e sem conta de encargos mapeada, o pagamento não sai pela metade.
 */
export function partesDoPagamentoDas(valorPagoCentavos: number, principalCentavos: number | null): Array<{ parte: "principal" | "encargos"; centavos: number }> {
  if (principalCentavos !== null && Number.isSafeInteger(principalCentavos) && principalCentavos > 0 && principalCentavos < valorPagoCentavos) {
    return [{ parte: "principal", centavos: principalCentavos }, { parte: "encargos", centavos: valorPagoCentavos - principalCentavos }];
  }
  return [{ parte: "principal", centavos: valorPagoCentavos }];
}

/**
 * Apurações de tributo (DIFAL, IRPJ/CSLL, PIS/COFINS do Lucro Presumido, DAS do Simples) já confirmadas pela
 * contadora no Fiscal — ver apuracoesFiscaisStore.ts. Diferente das notas fiscais, aqui não há
 * documento para reler: o valor já vem fechado e só falta o mapeamento de contas desta empresa.
 * Só entra apuração com situação "confirmado" (o store já filtra isso na gravação; a conferência
 * aqui é defensiva, nunca gera rascunho de algo em revisão ou ainda não confirmado).
 */
/** Tributo vindo do Fiscal/DP → item da lista de vigência (src/utils/vigenciaObrigacoes.ts). Sem item: sem fim conhecido. */
export const vigenciaDoTributoContabil = (tributo: string): string | null => (/^(PIS|COFINS)_/.test(String(tributo)) ? "pis_cofins" : tributo === "CPRB" ? "cprb" : /^ISS_/.test(String(tributo)) ? "iss" : null);
export function tributoVigenteNaCompetencia(tributo: string, competencia: string): boolean { const id = vigenciaDoTributoContabil(tributo); return !id || vigenteNaCompetencia(id, competencia); }

export function gerarRascunhosApuracoes(cnpj: string, apuracoes: ApuracaoFiscalArmazenada[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const candidatos: RascunhoAutomaticoContabil[] = [];
  const reais = (c: number) => Math.round((c / 100 + Number.EPSILON) * 100) / 100;
  for (const apuracao of apuracoes) {
    if (apuracao.situacao !== "confirmado") continue;
    const origem = ORIGEM_POR_TRIBUTO[apuracao.tributo];
    if (!origem) continue;
    const valor = valorNumerico(apuracao.valorCentavos);
    if (valor === null || valor <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(apuracao.competencia)) continue;
    // Vigência: PIS/Cofins depois de dez/2026 (EC 132/2023, art. 126, II) e CPRB depois de dez/2027 (Lei 12.546/2011, art. 9º-A) não viram provisão nova.
    if (!tributoVigenteNaCompetencia(apuracao.tributo, apuracao.competencia)) continue;
    const mapping = mapeamentoValido(mapeamentos, mapeamentosOrigem[origem], contasAnaliticas);
    if (!mapping) continue;
    const referencia = `FISCAL:${cnpj}:${apuracao.competencia}:APURACAO:${apuracao.tributo}:${apuracao.referencia}`;
    const base = { competencia: apuracao.competencia, data: dataDaApuracao(apuracao), criadoEm: agora };
    if (apuracao.tributo === "DAS_SIMPLES_PAGO" || TRIBUTOS_DARF_PAGO.has(apuracao.tributo)) {
      const ehDas = apuracao.tributo === "DAS_SIMPLES_PAGO";
      const origemEnc = ehDas ? "fiscal_das_simples_encargos" : "fiscal_darf_encargos";
      const partes = partesDoPagamentoDas(valor, valorNumerico(apuracao.baseCentavos));
      const mapEnc = mapeamentoValido(mapeamentos, origemEnc, contasAnaliticas);
      if (partes.length > 1 && !mapEnc) continue; // não lança o pagamento pela metade
      for (const p of partes) {
        const ref = p.parte === "principal" ? referencia : `${referencia}:${SUFIXO_ENCARGOS_DAS}`;
        const m = p.parte === "principal" ? mapping : mapEnc!;
        candidatos.push({ id: ref, referenciaOrigem: ref, ...base, origem: p.parte === "principal" ? origem : ID_PARA_ROTULO[origemEnc],
          contaDebitoCodigo: String(m.contaDebitoCodigo), contaCreditoCodigo: String(m.contaCreditoCodigo), valor: reais(p.centavos),
          historico: p.parte === "principal"
            ? `${HISTORICO_POR_TRIBUTO[apuracao.tributo]}${partes.length === 1 && apuracao.baseCentavos == null ? " (valor pago; o Fiscal não informou o principal)" : ""} — pré-lançamento para conferência`
            : `Multa e juros ${ehDas ? "do DAS do Simples Nacional" : "do DARF"} pagos em atraso — pré-lançamento para conferência` });
      }
      continue;
    }
    candidatos.push({
      id: referencia,
      referenciaOrigem: referencia,
      ...base,
      origem,
      contaDebitoCodigo: String(mapping.contaDebitoCodigo),
      contaCreditoCodigo: String(mapping.contaCreditoCodigo),
      valor: reais(valor),
      historico: `${HISTORICO_POR_TRIBUTO[apuracao.tributo] || apuracao.tributo} — pré-lançamento para conferência`,
      criadoEm: agora,
    });
  }
  return candidatos;
}

export function gerarRascunhosFolha(cnpj: string, folhas: ResumoFolha[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const porCompetencia = new Map<string, ResumoFolha>();
  for (const folha of [...folhas].sort((a, b) => String(b.atualizadoEm || b.calculadoEm || b.recebidoEm || "").localeCompare(String(a.atualizadoEm || a.calculadoEm || a.recebidoEm || "")))) {
    if (!porCompetencia.has(folha.competencia)) porCompetencia.set(folha.competencia, folha);
  }

  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const folha of porCompetencia.values()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(folha.competencia) || !folha.resumo) continue;
    const valores = folha.resumo;
    // Só gera quando a folha fecha: bruto − INSS − IRRF − descontos classificados + salário-família = líquido.
    if (!conciliarResumoFolhaDP(valores).ok) continue;

    // Várias partidas por folha (multipartida): cada item é um par débito/crédito balanceado, na ordem do contrato.
    const lote: RascunhoAutomaticoContabil[] = [];
    let completo = true;
    for (const item of ITENS_FOLHA_DP) {
      const valor = valorNumerico(valores[item.campo]);
      const opcional = ("opcional" in item && item.opcional) || ("classificado" in item && item.classificado);
      if (valor === null && opcional) continue;
      if (valor === null || valor < 0) { completo = false; break; }
      if (valor === 0) continue;
      const mapping = mapeamentos.find((candidate) => candidate.origem === item.origem);
      if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
        || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) {
        // INSS patronal ausente continua opcional (como antes). Desconto ou provento classificado sem conta trava a folha toda:
        // lançar só uma parte deixaria "salários a pagar" diferente do líquido.
        if ("opcional" in item && item.opcional) continue;
        completo = false;
        break;
      }
      const referencia = `DP:${cnpj}:${folha.competencia}:${item.campo}`;
      lote.push({
        id: referencia,
        referenciaOrigem: referencia,
        competencia: folha.competencia,
        data: `${folha.competencia}-01`,
        origem: ID_PARA_ROTULO[item.origem],
        contaDebitoCodigo: String(mapping.contaDebitoCodigo),
        contaCreditoCodigo: String(mapping.contaCreditoCodigo),
        valor: Math.round((valor + Number.EPSILON) * 100) / 100,
        historico: `${item.titulo} — pré-lançamento para conferência`,
        criadoEm: agora,
      });
    }
    if (completo) candidatos.push(...lote);
  }
  return candidatos;
}

/**
 * 13º e rescisão confirmados como pagos no DP. Reaproveita as mesmas contas já configuradas para
 * "DP — Folha" / INSS / INSS patronal / IRRF / FGTS (ambos são, contabilmente, despesa de pessoal
 * e seus encargos), exceto a multa de 40% do FGTS na rescisão, que usa uma conta própria — não é
 * razoável presumir que ela usa a mesma conta do FGTS mensal. Cada evento gera seu próprio
 * pré-lançamento (referenciaOrigem inclui o tipo e a referência do evento, nunca a competência
 * isolada), então nunca é descartado por outro evento ou pela folha do mesmo mês.
 */
export function gerarRascunhosEventosDP(cnpj: string, eventos: EventoDPLido[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const titulos: Record<TipoEventoDP, string> = { decimo: "13º salário", rescisao: "Rescisão", ferias: "Férias" };
  const origens = [
    { campo: "bruto", origem: "DP — Folha" as const },
    { campo: "descontosINSS", origem: "DP — INSS" as const },
    { campo: "inssPatronal", origem: "DP — INSS patronal" as const, opcional: true },
    { campo: "descontosIRRF", origem: "DP — IRRF" as const },
    { campo: "fgts", origem: "DP — FGTS" as const },
    { campo: "multaFgts", origem: "DP — Multa FGTS rescisória" as const, opcional: true },
  ];
  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const evento of eventos) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(evento.competencia) || !evento.resumo) continue;
    const valores = evento.resumo;
    const tituloBase = titulos[evento.tipo];
    for (const itemBase of origens) {
      // O bruto das férias usa a conta própria "DP — Férias" (pago contra a provisão), não a da folha mensal.
      const item = evento.tipo === "ferias" && itemBase.campo === "bruto" ? { ...itemBase, origem: "DP — Férias" as const } : itemBase;
      if (!(item.campo in valores)) continue; // multaFgts só existe em rescisão
      const valor = valorNumerico(valores[item.campo]);
      if (valor === null) { if ("opcional" in item && item.opcional) continue; break; }
      if (valor === 0) continue;
      const mapping = mapeamentos.find((candidate) => candidate.origem === mapeamentosOrigem[item.origem]);
      if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
        || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) continue;
      const referencia = `DP:${cnpj}:${evento.tipo}:${evento.referencia}:${item.campo}`;
      candidatos.push({
        id: referencia, referenciaOrigem: referencia, competencia: evento.competencia, data: `${evento.competencia}-01`,
        origem: item.origem, contaDebitoCodigo: String(mapping.contaDebitoCodigo), contaCreditoCodigo: String(mapping.contaCreditoCodigo),
        valor: Math.round((valor + Number.EPSILON) * 100) / 100,
        historico: `${tituloBase} confirmado no DP — ${item.campo === "bruto" ? "valor bruto" : item.campo === "multaFgts" ? "multa do FGTS (40%)" : item.origem.replace("DP — ", "")} — pré-lançamento para conferência`,
        criadoEm: agora,
      });
    }
  }
  return candidatos;
}

/** Pró-labore dos sócios: mesmas contas da folha (despesa com pessoal / salários a pagar; INSS e IRRF retidos a recolher). Tudo ou nada por competência. */
export function gerarRascunhosProLabore(cnpj: string, resumos: Array<{ competencia: string; resumo: Record<string, number> }>, contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const itens = [
    { campo: "proLabore", origem: "DP — Folha", titulo: "Pró-labore dos sócios", obrigatorio: true },
    { campo: "inssSocio", origem: "DP — INSS", titulo: "INSS retido do pró-labore (11%)", obrigatorio: true },
    { campo: "irrfSocio", origem: "DP — IRRF", titulo: "IRRF retido do pró-labore", obrigatorio: false },
    // CPP de 20% da empresa sobre o pró-labore (Lei 8.212/91, art. 22, III). Opcional: o DP antigo não mandava; sem conta mapeada, fica de fora.
    { campo: "inssPatronalSocio", origem: "DP — INSS patronal", titulo: "INSS patronal (CPP) sobre o pró-labore", obrigatorio: false },
  ] as const;
  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const r of resumos) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.competencia) || !r.resumo) continue;
    const bruto = valorNumerico(r.resumo.proLabore); const inss = valorNumerico(r.resumo.inssSocio); const irrf = valorNumerico(r.resumo.irrfSocio); const liquido = valorNumerico(r.resumo.liquido);
    if (bruto === null || inss === null || irrf === null || liquido === null || bruto <= 0) continue;
    if (Math.abs(Math.round((bruto - inss - irrf + Number.EPSILON) * 100) / 100 - liquido) > 0.01) continue;
    const lote: RascunhoAutomaticoContabil[] = []; let completo = true;
    for (const item of itens) {
      if (!item.obrigatorio && !(item.campo in r.resumo)) continue; // campo opcional que o DP antigo não mandava
      const valor = valorNumerico(r.resumo[item.campo]);
      if (valor === null || valor < 0) { completo = false; break; }
      if (valor === 0) continue;
      const mapping = mapeamentos.find((m) => m.origem === mapeamentosOrigem[item.origem]);
      if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo) || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) {
        if (!item.obrigatorio) continue;
        completo = false; break;
      }
      const referencia = `DP:${cnpj}:${r.competencia}:${item.campo}`;
      lote.push({ id: referencia, referenciaOrigem: referencia, competencia: r.competencia, data: `${r.competencia}-01`, origem: item.origem,
        contaDebitoCodigo: String(mapping.contaDebitoCodigo), contaCreditoCodigo: String(mapping.contaCreditoCodigo),
        valor: Math.round((valor + Number.EPSILON) * 100) / 100, historico: `${item.titulo} — pré-lançamento para conferência`, criadoEm: agora });
    }
    if (completo) candidatos.push(...lote);
  }
  return candidatos;
}

/** Prepares and saves drafts after an authenticated source update; never posts definitive entries. */
/**
 * Nota que veio do backup do sistema anterior pelo Fiscal (origemDocumento "sistema-anterior") numa competência que JÁ tem
 * lançamentos migrados do sistema anterior aqui no Contábil não gera pré-lançamento: ela já está contabilizada pela migração
 * contábil (seria lançamento em dobro). Fica só para consulta e conferência. Competência sem contabilidade migrada segue o fluxo
 * normal Fiscal → Contábil (pré-lançamento para aprovação). Notas de outras origens não mudam nada.
 */
export function notasSemLancamentoEmDobro(documentos: Registro[], workspace: Record<string, unknown>): Registro[] {
  const lancamentos = Array.isArray(workspace.lancamentos) ? workspace.lancamentos as Registro[] : [];
  const migradas = new Set<string>();
  for (const l of lancamentos) if (l?.origem === "Sistema anterior") { const c = String(l.competencia || l.data || "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(c)) migradas.add(c); }
  if (!migradas.size) return documentos;
  return documentos.filter((d) => {
    if (d?.origemDocumento !== "sistema-anterior") return true;
    const c = dataCompetencia(d.dataEmissao || d.emissao)?.competencia;
    return !(c && migradas.has(c));
  });
}

export async function gerarCandidatosRascunhosAutomaticos(cnpj: string, workspaceOverride?: Record<string, unknown>): Promise<RascunhoAutomaticoContabil[]> {
  return (await gerarCandidatosEDocumentos(cnpj, workspaceOverride)).candidatos;
}

/** Candidatos e as notas lidas (o preparo usa as notas para tirar o que deixou de valer, sem ler o banco duas vezes). */
export async function gerarCandidatosEDocumentos(cnpj: string, workspaceOverride?: Record<string, unknown>): Promise<{ candidatos: RascunhoAutomaticoContabil[]; documentos: Registro[] }> {
  if (!fiscalStoreConfigurado() || !dpStoreConfigurado()) return { candidatos: [], documentos: [] };
  const workspace = workspaceOverride || await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return { candidatos: [], documentos: [] };
  const contas = Array.isArray(workspace.contas) ? workspace.contas as Registro[] : [];
  const mapeamentos = Array.isArray(workspace.mapeamentosOrigem) ? workspace.mapeamentosOrigem as Registro[] : [];
  if (!mapeamentos.length) return { candidatos: [], documentos: fiscalStoreConfigurado() ? await lerTodosDocumentosFiscais(cnpj) as Registro[] : [] };

  const [documentos, folhas, proLabores, eventos, apuracoes] = await Promise.all([
    lerTodosDocumentosFiscais(cnpj),
    lerResumosDP(cnpj, "", "", 200) as Promise<ResumoFolha[]>,
    lerResumosProLaboreDP(cnpj, 200).catch(() => []),
    lerEventosDP(cnpj, undefined, 200).catch(() => []),
    apuracoesStoreConfigurado() ? lerApuracoesFiscais(cnpj, "", "", 500).catch(() => []) : Promise.resolve([]),
  ]);
  const agora = new Date().toISOString();
  const candidatos = [
    ...gerarRascunhosFiscal(cnpj, notasSemLancamentoEmDobro(documentos as Registro[], workspace), contas, mapeamentos, agora, regimeSimplesNacional((workspace.empresa as Registro | undefined)?.regime)),
    ...gerarRascunhosFolha(cnpj, folhas, contas, mapeamentos, agora),
    ...gerarRascunhosProLabore(cnpj, proLabores, contas, mapeamentos, agora),
    ...gerarRascunhosEventosDP(cnpj, eventos, contas, mapeamentos, agora),
    ...gerarRascunhosApuracoes(cnpj, apuracoes, contas, mapeamentos, agora),
  ];
  return { candidatos, documentos: documentos as Registro[] };
}

export function mesclarRascunhosNoWorkspace(
  cnpj: string,
  workspace: Record<string, unknown>,
  candidatos: RascunhoAutomaticoContabil[],
): { workspace: Record<string, unknown>; criados: number; atualizados: number } {
  const normalizado = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const mapeamentos = Array.isArray(workspace.mapeamentosOrigem) ? workspace.mapeamentosOrigem as Registro[] : [];
  const lancamentos = Array.isArray(workspace.lancamentos) ? workspace.lancamentos as Registro[] : [];
  const preLancamentos = Array.isArray(workspace.preLancamentos) ? workspace.preLancamentos as Registro[] : [];
  const mesclados = [...preLancamentos];
  let criados = 0;
  let atualizados = 0;
  for (const candidato of candidatos) {
    const referencia = candidato.referenciaOrigem;
    if (!referencia.startsWith(`DP:${normalizado}:`) && !referencia.startsWith(`FISCAL:${normalizado}:`)) continue;
    if (lancamentos.some((item) => item.documentoRef === referencia || item.id === referencia)) continue;
    const mappingKey = mapeamentosOrigem[candidato.origem as keyof typeof mapeamentosOrigem];
    const mapping = mapeamentos.find((item) => item.origem === mappingKey);
    if (!contasDoRascunhoConferem(candidato, mapping, Array.isArray(workspace.contas) ? workspace.contas as Registro[] : [])) continue;
    const indice = mesclados.findIndex((item) => item.referenciaOrigem === referencia);
    const existente = indice < 0 ? undefined : mesclados[indice];
    if (existente?.status === "contabilizado") continue;
    const proximo = {
      ...candidato,
      criadoEm: typeof existente?.criadoEm === "string" ? existente.criadoEm : candidato.criadoEm,
      status: "pendente_conferencia" as const,
      geradoAutomaticamente: true as const,
    };
    if (existente && existente.data === proximo.data && existente.competencia === proximo.competencia
      && existente.origem === proximo.origem && existente.contaDebitoCodigo === proximo.contaDebitoCodigo
      && existente.contaCreditoCodigo === proximo.contaCreditoCodigo && existente.valor === proximo.valor
      && existente.historico === proximo.historico) continue;
    if (indice < 0) { mesclados.push(proximo); criados += 1; }
    else { mesclados[indice] = proximo; atualizados += 1; }
  }
  return { workspace: criados || atualizados ? { ...workspace, preLancamentos: mesclados } : workspace, criados, atualizados };
}

export async function prepararRascunhosContabeisAutomaticos(cnpj: string): Promise<{ criados: number; atualizados: number; retirados: number; alertasEstorno: number }> {
  const workspace = await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return { criados: 0, atualizados: 0, retirados: 0, alertasEstorno: 0 };
  const { candidatos, documentos } = await gerarCandidatosEDocumentos(cnpj, workspace);
  // A gravação aceita no máximo 700 por vez: empresa com muitas notas vai em partes, sem perder nenhuma.
  let criados = 0, atualizados = 0;
  for (let i = 0; i < candidatos.length; i += TAMANHO_LOTE_RASCUNHOS) {
    const r = await mesclarRascunhosAutomaticosContabil(cnpj, candidatos.slice(i, i + TAMANHO_LOTE_RASCUNHOS));
    criados += r.criados; atualizados += r.atualizados;
  }
  // Nota que deixou de valer depois de virar pré-lançamento: o pendente sai; o já contabilizado vira alerta vermelho com estorno sugerido.
  const semValor = notasSemValorDoCnpj(cnpj, documentos);
  const tratado = await tratarNotasSemValorContabil(cnpj, semValor);
  return { criados, atualizados, retirados: tratado.retirados, alertasEstorno: tratado.alertasAbertos };
}
export const TAMANHO_LOTE_RASCUNHOS = 600;
