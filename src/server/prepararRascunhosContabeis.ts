import type { OrigemMapeadaContabil } from "../types";
import { lerDocumentosFiscais, fiscalStoreConfigurado } from "./documentosFiscaisStore";
import { lerApuracoesFiscais, apuracoesStoreConfigurado, type ApuracaoFiscalArmazenada } from "./apuracoesFiscaisStore";
import { lerResumosDP, dpStoreConfigurado } from "./dadosDpStore";
import { lerResumosProLaboreDP } from "./dadosProLaboreStore";
import { lerEventosDP, type EventoDPLido, type TipoEventoDP } from "./dadosDpEventosStore";
import { lerWorkspaceInternoContabil, mesclarRascunhosAutomaticosContabil, type RascunhoAutomaticoContabil } from "./authContabil";

type Registro = Record<string, any>;
type ResumoFolha = { competencia: string; calculadoEm?: string; atualizadoEm?: string; recebidoEm?: string; resumo?: Record<string, unknown> };

const mapeamentosOrigem = {
  "Fiscal — Entrada": "fiscal_entrada",
  "Fiscal — Saída": "fiscal_saida",
  "DP — Folha": "dp_folha_bruta",
  "DP — INSS": "dp_descontos_inss",
  "DP — INSS patronal": "dp_inss_patronal",
  "DP — IRRF": "dp_descontos_irrf",
  "DP — FGTS": "dp_fgts",
  "DP — Multa FGTS rescisória": "dp_multa_fgts_rescisoria",
  "Fiscal — DIFAL (uso/consumo)": "fiscal_difal_consumo",
  "Fiscal — DIFAL (ativo imobilizado)": "fiscal_difal_ativo",
  "Fiscal — IRPJ Presumido": "fiscal_irpj_presumido",
  "Fiscal — CSLL Presumido": "fiscal_csll_presumido",
  "Fiscal — PIS Presumido": "fiscal_pis_presumido",
  "Fiscal — COFINS Presumido": "fiscal_cofins_presumido",
} satisfies Record<string, OrigemMapeadaContabil>;

/** Tributo (contrato de integração com o Fiscal — ver apuracoesContabilOutbox.ts lá) → origem mapeável aqui. */
const ORIGEM_POR_TRIBUTO: Record<string, keyof typeof mapeamentosOrigem> = {
  ICMS_DIFAL_ATIVO: "Fiscal — DIFAL (ativo imobilizado)",
  ICMS_DIFAL_CONSUMO: "Fiscal — DIFAL (uso/consumo)",
  IRPJ_PRESUMIDO: "Fiscal — IRPJ Presumido",
  CSLL_PRESUMIDO: "Fiscal — CSLL Presumido",
  PIS_PRESUMIDO: "Fiscal — PIS Presumido",
  COFINS_PRESUMIDO: "Fiscal — COFINS Presumido",
};

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

function fiscalAutorizado(documento: Registro): boolean {
  const cancelado = /cancelad/i.test(String(documento.statusSefaz || ""))
    || (Array.isArray(documento.eventosSefaz) && documento.eventosSefaz.some((evento: Registro) =>
      evento?.confirmado === true && (/(cancelamento|cancelada)/i.test(String(evento.descricao || ""))
        || ["110111", "110112"].includes(String(evento.tipoEvento || ""))
      ),
    ));
  return !cancelado && documento.statusVerificadoSefaz === true && /autorizad/i.test(String(documento.statusSefaz || ""));
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
  return /^\d{44}$/.test(referencia) && referencia.slice(20, 22) === "65";
}

export function gerarRascunhosFiscal(cnpj: string, documentos: Registro[], contas: Registro[], mapeamentos: Registro[], agora: string, simplesNacional = false): RascunhoAutomaticoContabil[] {
  const candidatos: RascunhoAutomaticoContabil[] = [];
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const tributarios = ["valorIcms", "valorIpi", "valorPis", "valorCofins", "valorIss"];
  for (const documento of documentos) {
    if (!documento || documento.cnpjEmpresa?.toUpperCase().replace(/[^A-Z0-9]/g, "") !== cnpj || !fiscalAutorizado(documento)) continue;
    if (documento.tipo !== "Entrada" && documento.tipo !== "Saída") continue;
    const referenciaDocumento = String(documento.chaveAcesso || documento.id || "").trim();
    const periodo = dataCompetencia(documento.dataEmissao || documento.emissao);
    const valor = valorNumerico(documento.valorTotal);
    if (!referenciaDocumento || referenciaDocumento.length > 128 || !periodo || valor === null || valor <= 0
      || documento.dadosTributariosDisponiveis !== true
      || (!simplesNacional && tributarios.some((campo) => valorNumerico(documento[campo]) !== 0))) continue;

    const origem = (documento.tipo === "Entrada" ? "Fiscal — Entrada" : "Fiscal — Saída") as keyof typeof mapeamentosOrigem;
    const mapping = mapeamentos.find((item) => item.origem === mapeamentosOrigem[origem]);
    if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
      || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) continue;
    if (documento.tipo === "Entrada" && !entradaEhCompraParaEstoque(documento.cfop)) continue;
    let debito = String(mapping.contaDebitoCodigo);
    if (documento.tipo === "Saída" && ehNfce(referenciaDocumento)) {
      const caixa = contas.find((c) => c?.tipo === "analitica" && /^1\.1\.[1-3]/.test(String(c.codigo)) && /caixa|banco|cart[ãa]o/i.test(String(c.nome || c.descricao || "")));
      if (caixa && caixa.codigo !== mapping.contaCreditoCodigo) debito = String(caixa.codigo);
    }

    const tipoReferencia = documento.tipo === "Entrada" ? "Entrada" : "Saida";
    const referencia = `FISCAL:${cnpj}:${periodo.competencia}:${tipoReferencia}:${referenciaDocumento}`;
    candidatos.push({
      id: referencia,
      referenciaOrigem: referencia,
      competencia: periodo.competencia,
      data: periodo.data,
      origem,
      contaDebitoCodigo: debito,
      contaCreditoCodigo: String(mapping.contaCreditoCodigo),
      valor: Math.round((valor + Number.EPSILON) * 100) / 100,
      historico: `${origem} NF-e ${referenciaDocumento} — valor bruto, pré-lançamento para conferência`,
      criadoEm: agora,
    });
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
};

/**
 * Apurações de tributo (DIFAL, IRPJ/CSLL, PIS/COFINS do Lucro Presumido) já confirmadas pela
 * contadora no Fiscal — ver apuracoesFiscaisStore.ts. Diferente das notas fiscais, aqui não há
 * documento para reler: o valor já vem fechado e só falta o mapeamento de contas desta empresa.
 * Só entra apuração com situação "confirmado" (o store já filtra isso na gravação; a conferência
 * aqui é defensiva, nunca gera rascunho de algo em revisão ou ainda não confirmado).
 */
export function gerarRascunhosApuracoes(cnpj: string, apuracoes: ApuracaoFiscalArmazenada[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const apuracao of apuracoes) {
    if (apuracao.situacao !== "confirmado") continue;
    const origem = ORIGEM_POR_TRIBUTO[apuracao.tributo];
    if (!origem) continue;
    const valor = valorNumerico(apuracao.valorCentavos);
    if (valor === null || valor <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(apuracao.competencia)) continue;
    const mapping = mapeamentos.find((item) => item.origem === mapeamentosOrigem[origem]);
    if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
      || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) continue;
    const referencia = `FISCAL:${cnpj}:${apuracao.competencia}:APURACAO:${apuracao.tributo}:${apuracao.referencia}`;
    candidatos.push({
      id: referencia,
      referenciaOrigem: referencia,
      competencia: apuracao.competencia,
      data: `${apuracao.competencia}-01`,
      origem,
      contaDebitoCodigo: String(mapping.contaDebitoCodigo),
      contaCreditoCodigo: String(mapping.contaCreditoCodigo),
      valor: Math.round((valor / 100 + Number.EPSILON) * 100) / 100,
      historico: `${HISTORICO_POR_TRIBUTO[apuracao.tributo] || apuracao.tributo} — pré-lançamento para conferência`,
      criadoEm: agora,
    });
  }
  return candidatos;
}

function gerarRascunhosFolha(cnpj: string, folhas: ResumoFolha[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const porCompetencia = new Map<string, ResumoFolha>();
  for (const folha of [...folhas].sort((a, b) => String(b.atualizadoEm || b.calculadoEm || b.recebidoEm || "").localeCompare(String(a.atualizadoEm || a.calculadoEm || a.recebidoEm || "")))) {
    if (!porCompetencia.has(folha.competencia)) porCompetencia.set(folha.competencia, folha);
  }

  const candidatos: RascunhoAutomaticoContabil[] = [];
  const origens = [
    { campo: "folhaBruta", origem: "DP — Folha", titulo: "Folha bruta" },
    { campo: "descontosINSS", origem: "DP — INSS", titulo: "INSS descontado do empregado" },
    { campo: "inssPatronal", origem: "DP — INSS patronal", titulo: "INSS patronal", opcional: true },
    { campo: "descontosIRRF", origem: "DP — IRRF", titulo: "IRRF descontado" },
    { campo: "fgts", origem: "DP — FGTS", titulo: "FGTS informado pelo DP" },
  ] as const;
  const obrigatorios = ["folhaBruta", "descontosINSS", "descontosIRRF", "descontosOutros", "liquidoFolha", "fgts"];

  for (const folha of porCompetencia.values()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(folha.competencia) || !folha.resumo) continue;
    const valores = folha.resumo;
    if (obrigatorios.some((campo) => valorNumerico(valores[campo]) === null)) continue;
    const folhaBruta = valorNumerico(valores.folhaBruta)!;
    const inss = valorNumerico(valores.descontosINSS)!;
    const irrf = valorNumerico(valores.descontosIRRF)!;
    const outros = valorNumerico(valores.descontosOutros)!;
    const liquido = valorNumerico(valores.liquidoFolha)!;
    if (outros !== 0 || Math.abs(Math.round((folhaBruta - inss - irrf + Number.EPSILON) * 100) / 100 - liquido) > 0.01) continue;

    const lote: RascunhoAutomaticoContabil[] = [];
    let completo = true;
    for (const item of origens) {
      const valor = valorNumerico(valores[item.campo]);
      if (valor === null && "opcional" in item && item.opcional) continue;
      if (valor === null || valor < 0) { completo = false; break; }
      if (valor === 0) continue;
      const mappingKey = mapeamentosOrigem[item.origem];
      const mapping = mapeamentos.find((candidate) => candidate.origem === mappingKey);
      if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
        || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) {
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
        origem: item.origem,
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
  const titulos: Record<TipoEventoDP, string> = { decimo: "13º salário", rescisao: "Rescisão" };
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
    for (const item of origens) {
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
  ] as const;
  const candidatos: RascunhoAutomaticoContabil[] = [];
  for (const r of resumos) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.competencia) || !r.resumo) continue;
    const bruto = valorNumerico(r.resumo.proLabore); const inss = valorNumerico(r.resumo.inssSocio); const irrf = valorNumerico(r.resumo.irrfSocio); const liquido = valorNumerico(r.resumo.liquido);
    if (bruto === null || inss === null || irrf === null || liquido === null || bruto <= 0) continue;
    if (Math.abs(Math.round((bruto - inss - irrf + Number.EPSILON) * 100) / 100 - liquido) > 0.01) continue;
    const lote: RascunhoAutomaticoContabil[] = []; let completo = true;
    for (const item of itens) {
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
export async function gerarCandidatosRascunhosAutomaticos(cnpj: string, workspaceOverride?: Record<string, unknown>): Promise<RascunhoAutomaticoContabil[]> {
  if (!fiscalStoreConfigurado() || !dpStoreConfigurado()) return [];
  const workspace = workspaceOverride || await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return [];
  const contas = Array.isArray(workspace.contas) ? workspace.contas as Registro[] : [];
  const mapeamentos = Array.isArray(workspace.mapeamentosOrigem) ? workspace.mapeamentosOrigem as Registro[] : [];
  if (!mapeamentos.length) return [];

  const [documentos, folhas, proLabores, eventos, apuracoes] = await Promise.all([
    lerDocumentosFiscais(cnpj, "", "", 500),
    lerResumosDP(cnpj, "", "", 200) as Promise<ResumoFolha[]>,
    lerResumosProLaboreDP(cnpj, 200).catch(() => []),
    lerEventosDP(cnpj, undefined, 200).catch(() => []),
    apuracoesStoreConfigurado() ? lerApuracoesFiscais(cnpj, "", "", 500).catch(() => []) : Promise.resolve([]),
  ]);
  const agora = new Date().toISOString();
  const candidatos = [
    ...gerarRascunhosFiscal(cnpj, documentos as Registro[], contas, mapeamentos, agora, regimeSimplesNacional((workspace.empresa as Registro | undefined)?.regime)),
    ...gerarRascunhosFolha(cnpj, folhas, contas, mapeamentos, agora),
    ...gerarRascunhosProLabore(cnpj, proLabores, contas, mapeamentos, agora),
    ...gerarRascunhosEventosDP(cnpj, eventos, contas, mapeamentos, agora),
    ...gerarRascunhosApuracoes(cnpj, apuracoes, contas, mapeamentos, agora),
  ];
  return candidatos;
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
    if (!mapping || mapping.contaDebitoCodigo !== candidato.contaDebitoCodigo || mapping.contaCreditoCodigo !== candidato.contaCreditoCodigo) continue;
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

export async function prepararRascunhosContabeisAutomaticos(cnpj: string): Promise<{ criados: number; atualizados: number }> {
  const workspace = await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return { criados: 0, atualizados: 0 };
  const candidatos = await gerarCandidatosRascunhosAutomaticos(cnpj, workspace);
  return mesclarRascunhosAutomaticosContabil(cnpj, candidatos);
}
