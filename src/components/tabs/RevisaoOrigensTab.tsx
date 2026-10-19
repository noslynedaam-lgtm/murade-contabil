import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ClipboardCheck, Download, RefreshCw, Save } from "lucide-react";
import type { ContaPlano, LancamentoContabil, MapeamentoOrigemContabil, OrigemMapeadaContabil, PreLancamentoContabil } from "../../types";

type DocumentoFiscal = Record<string, unknown>;
type ResumoFolha = { competencia: string; processamentoId?: string; calculadoEm: string; recebidoEm: string; atualizadoEm?: string; resumo: Record<string, number | null> };
type CoberturaXmlFiscal = { documentosAnalisados: number; documentosSemXmlCompleto: number; documentosXmlInvalido: number; itens: number; itensComCfop: number; itensComNcm: number; itensComCstIcmsOuCsosn: number; itensComCstPis: number; itensComCstCofins: number };
type LoteOrigens = { documentos: DocumentoFiscal[]; folhas: ResumoFolha[]; coberturaXmlFiscal: CoberturaXmlFiscal };
type RascunhoMapeamento = { contaDebitoCodigo: string; contaCreditoCodigo: string };
type PreviaPartidaDP = { competencia: string; origem: string; contaDebitoCodigo: string; contaCreditoCodigo: string; valor: number; referencia: string };
type EstadoPreviaDP = { partidas: PreviaPartidaDP[]; pendencias: Array<{ competencia: string; motivo: string }> };
type PreviaPartidaFiscal = PreviaPartidaDP & { data: string; chave: string };
type EstadoPreviaFiscal = { partidas: PreviaPartidaFiscal[]; pendencias: Array<{ competencia: string; motivo: string }> };
type SomaTributoFiscal = { valor: number; incompletos: number; documentos: number };
type AprovacaoHistorico = { referencia: string; login: string; valor: string; contaDebito: string; contaCredito: string; aprovadoEm: string };
type AuditoriaLancamentoManual = { lancamentoId: string; evento: string; login: string; registradoEm: string; motivo?: string | null; lancamento: Record<string, unknown> };
type AuditoriaSaldoAbertura = { contaCodigo: string; evento: "saldo_inicial_cadastrado" | "saldo_inicial_alterado"; saldoAnterior: string | null; saldoNovo: string; competencia: string | null; login: string; registradoEm: string };
type ConferenciaIntegridade = { status: "consistente" | "revisar"; aprovacoesSemLancamento: string[]; lancamentosSemAuditoria: string[]; statusContabilizadosSemLancamento: string[]; lancamentosManuaisSemAuditoria: string[]; auditoriasManuaisSemLancamento: string[]; lancamentosComTrilhaInconsistente: string[]; eventosManuaisSemLancamento: string[] };

const origensMapeaveis: Array<{ id: OrigemMapeadaContabil; titulo: string; descricao: string }> = [
  { id: "fiscal_entrada", titulo: "NF-e de entrada", descricao: "A conta de estoque/despesa varia por operação e CFOP; revise a conta de débito para esta empresa." },
  { id: "fiscal_saida", titulo: "NF-e de saída", descricao: "Mapeia o valor bruto da venda; tributos destacados exigem regras próprias antes de contabilizar." },
  { id: "dp_folha_bruta", titulo: "Folha bruta do DP", descricao: "Despesa de salários contra salários a pagar." },
  { id: "dp_descontos_inss", titulo: "INSS descontado do empregado", descricao: "Reduz salários a pagar e credita INSS a recolher; não inclui INSS patronal." },
  { id: "dp_inss_patronal", titulo: "INSS patronal", descricao: "Encargo da empresa contra INSS patronal a recolher; usa somente o valor apurado e persistido pelo DP." },
  { id: "dp_descontos_irrf", titulo: "IRRF descontado", descricao: "Reduz salários a pagar e credita IRRF a recolher." },
  { id: "dp_fgts", titulo: "FGTS informado pelo DP", descricao: "Despesa de FGTS contra FGTS a recolher. Valores só chegam após cálculo persistido no DP." },
];

const competenciaAtual = () => new Date().toISOString().slice(0, 7);
const dinheiro = (value: unknown) => typeof value === "number" && Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  : value === null ? "Não apurado" : "—";
const texto = (value: unknown) => value == null || value === "" ? "—" : String(value);
const valorNumerico = (value: unknown): number | null => {
  const numero = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
};
const competenciaDeData = (value: unknown): string => {
  const textoData = String(value || "");
  const iso = /^(\d{4})-(\d{2})/.exec(textoData);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(textoData);
  return br ? `${br[3]}-${br[2]}` : "";
};
const eventoCancelamentoConfirmado = (doc: DocumentoFiscal) => Array.isArray(doc.eventosSefaz) && doc.eventosSefaz.some((evento: any) =>
  evento?.confirmado === true && (/(cancelamento|cancelada)/i.test(String(evento.descricao || "")) || ["110111", "110112"].includes(String(evento.tipoEvento || ""))),
);
const documentoCancelado = (doc: DocumentoFiscal) => /cancelad/i.test(String(doc.statusSefaz || "")) || eventoCancelamentoConfirmado(doc);
const documentoAutorizado = (doc: DocumentoFiscal) => doc.statusVerificadoSefaz === true && /autorizad/i.test(String(doc.statusSefaz || "")) && !documentoCancelado(doc);
const situacaoDocumento = (doc: DocumentoFiscal) => {
  if (documentoCancelado(doc)) return "Cancelada";
  if (doc.statusVerificadoSefaz === true && /autorizad/i.test(String(doc.statusSefaz || ""))) return "Autorizada (SEFAZ)";
  if (doc.statusVerificadoSefaz === true && doc.statusSefaz) return String(doc.statusSefaz);
  if (/autorizad/i.test(String(doc.statusSefaz || ""))) return "Autorização não confirmada";
  return String(doc.statusSefaz || "Pendente de conferência");
};
const tipoDocumentoFiscal = (doc: DocumentoFiscal): "entrada" | "saida" | null => {
  const tipo = String(doc.tipo || "").toLowerCase();
  if (tipo.includes("entrada")) return "entrada";
  if (tipo.includes("saída") || tipo.includes("saida")) return "saida";
  return null;
};
const camposTributariosFiscal = [
  { campo: "valorIcms", titulo: "ICMS" },
  { campo: "valorIss", titulo: "ISS" },
  { campo: "valorIpi", titulo: "IPI" },
  { campo: "valorPis", titulo: "PIS" },
  { campo: "valorCofins", titulo: "COFINS" },
] as const;

export const RevisaoOrigensTab: React.FC<{
  cnpj: string;
  regime: string;
  workspaceCarregado: boolean;
  contas: ContaPlano[];
  mapeamentos: MapeamentoOrigemContabil[];
  onSalvarMapeamentos: (mapeamentos: MapeamentoOrigemContabil[]) => void;
  preLancamentos: PreLancamentoContabil[];
  lancamentos: LancamentoContabil[];
  onSalvarPreLancamentos: (preLancamentos: PreLancamentoContabil[]) => void;
  onContabilizar: (referencias: string[]) => Promise<boolean>;
}> = ({ cnpj, regime, workspaceCarregado, contas, mapeamentos, onSalvarMapeamentos, preLancamentos, lancamentos, onSalvarPreLancamentos, onContabilizar }) => {
  const [desde, setDesde] = useState(competenciaAtual);
  const [ate, setAte] = useState(competenciaAtual);
  const [dados, setDados] = useState<LoteOrigens>({ documentos: [], folhas: [], coberturaXmlFiscal: { documentosAnalisados: 0, documentosSemXmlCompleto: 0, documentosXmlInvalido: 0, itens: 0, itensComCfop: 0, itensComNcm: 0, itensComCstIcmsOuCsosn: 0, itensComCstPis: 0, itensComCstCofins: 0 } });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [mensagemPrevia, setMensagemPrevia] = useState("");
  const [mensagemConciliacao, setMensagemConciliacao] = useState("");
  const [mensagemHistoricoDP, setMensagemHistoricoDP] = useState("");
  const [mensagemTributos, setMensagemTributos] = useState("");
  const [historicoAprovacoes, setHistoricoAprovacoes] = useState<AprovacaoHistorico[]>([]);
  const [historicoLancamentosManuais, setHistoricoLancamentosManuais] = useState<AuditoriaLancamentoManual[]>([]);
  const [historicoSaldosAbertura, setHistoricoSaldosAbertura] = useState<AuditoriaSaldoAbertura[]>([]);
  const [lancamentosManuaisSemAuditoria, setLancamentosManuaisSemAuditoria] = useState<string[]>([]);
  const [erroHistorico, setErroHistorico] = useState("");
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [integridadeAprovacoes, setIntegridadeAprovacoes] = useState<ConferenciaIntegridade | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoMapeamento>>(() => Object.fromEntries(
    mapeamentos.map((item) => [item.origem, { contaDebitoCodigo: item.contaDebitoCodigo, contaCreditoCodigo: item.contaCreditoCodigo }]),
  ));
  const cnpjNormalizado = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");

  useEffect(() => {
    setRascunhos(Object.fromEntries(mapeamentos.map((item) => [item.origem, {
      contaDebitoCodigo: item.contaDebitoCodigo,
      contaCreditoCodigo: item.contaCreditoCodigo,
    }])));
  }, [cnpjNormalizado, mapeamentos]);

  const carregar = useCallback(async () => {
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpjNormalizado)) {
      setDados({ documentos: [], folhas: [], coberturaXmlFiscal: { documentosAnalisados: 0, documentosSemXmlCompleto: 0, documentosXmlInvalido: 0, itens: 0, itensComCfop: 0, itensComNcm: 0, itensComCstIcmsOuCsosn: 0, itensComCstPis: 0, itensComCstCofins: 0 } });
      setErro("Selecione ou cadastre uma empresa autorizada com CNPJ válido.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const query = new URLSearchParams({ cnpj: cnpjNormalizado, desde, ate, limiteFiscal: "500", limiteDP: "200" });
      const response = await fetch(`/api/revisao/origens?${query}`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Não foi possível ler as origens persistidas.");
      setDados({
        documentos: Array.isArray(result.documentos) ? result.documentos : [],
        folhas: Array.isArray(result.folhas) ? result.folhas : [],
        coberturaXmlFiscal: result.coberturaXmlFiscal && typeof result.coberturaXmlFiscal === "object"
          ? result.coberturaXmlFiscal as CoberturaXmlFiscal
          : { documentosAnalisados: 0, documentosSemXmlCompleto: 0, documentosXmlInvalido: 0, itens: 0, itensComCfop: 0, itensComNcm: 0, itensComCstIcmsOuCsosn: 0, itensComCstPis: 0, itensComCstCofins: 0 },
      });
      setAtualizadoEm(new Date().toLocaleString("pt-BR"));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao consultar as origens.");
    } finally {
      setCarregando(false);
    }
  }, [cnpjNormalizado, cnpj, desde, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const carregarHistorico = useCallback(async () => {
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpjNormalizado)) {
      setHistoricoAprovacoes([]);
      setHistoricoLancamentosManuais([]);
      setHistoricoSaldosAbertura([]);
      setLancamentosManuaisSemAuditoria([]);
      setIntegridadeAprovacoes(null);
      setErroHistorico("");
      return;
    }
    setCarregandoHistorico(true);
    setErroHistorico("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(cnpjNormalizado)}/historico-aprovacoes?limite=100`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Não foi possível consultar o histórico de aprovações.");
      setHistoricoAprovacoes(Array.isArray(result.aprovacoes) ? result.aprovacoes : []);
      setHistoricoLancamentosManuais(Array.isArray(result.lancamentosManuais) ? result.lancamentosManuais : []);
      setHistoricoSaldosAbertura(Array.isArray(result.saldosAbertura) ? result.saldosAbertura : []);
      setLancamentosManuaisSemAuditoria(Array.isArray(result.lancamentosManuaisSemAuditoria) ? result.lancamentosManuaisSemAuditoria : []);
      setIntegridadeAprovacoes(result.conferenciaIntegridade && typeof result.conferenciaIntegridade === "object" ? result.conferenciaIntegridade as ConferenciaIntegridade : null);
    } catch (error) {
      setErroHistorico(error instanceof Error ? error.message : "Falha ao consultar o histórico de aprovações.");
    } finally {
      setCarregandoHistorico(false);
    }
  }, [cnpjNormalizado]);

  useEffect(() => { void carregarHistorico(); }, [carregarHistorico]);

  const analiseDuplicidadeFiscal = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const doc of dados.documentos) {
      const chave = String(doc.chaveAcesso || "").replace(/\s/g, "");
      if (/^\d{44}$/.test(chave)) contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
    const chavesDuplicadas = new Set([...contagem].filter(([, total]) => total > 1).map(([chave]) => chave));
    const duplicados = dados.documentos.filter((doc) => chavesDuplicadas.has(String(doc.chaveAcesso || "").replace(/\s/g, "")));
    return { chavesDuplicadas, duplicados, documentosSemDuplicidade: dados.documentos.filter((doc) => !chavesDuplicadas.has(String(doc.chaveAcesso || "").replace(/\s/g, ""))) };
  }, [dados.documentos]);

  const historicoFolhasDP = useMemo(() => {
    const porCompetencia = new Map<string, ResumoFolha[]>();
    for (const folha of dados.folhas) {
      const versoes = porCompetencia.get(folha.competencia) || [];
      versoes.push(folha);
      porCompetencia.set(folha.competencia, versoes);
    }
    const ordenar = (a: ResumoFolha, b: ResumoFolha) => String(b.atualizadoEm || b.calculadoEm || b.recebidoEm).localeCompare(String(a.atualizadoEm || a.calculadoEm || a.recebidoEm));
    return [...porCompetencia.entries()].map(([competencia, registros]) => {
      const ordenados = [...registros].sort(ordenar);
      const atual = ordenados[0];
      const anterior = ordenados[1];
      const campos = new Set([...Object.keys(anterior?.resumo || {}), ...Object.keys(atual?.resumo || {})]);
      const diferencas = anterior ? [...campos].filter((campo) => {
        const antigo = anterior.resumo?.[campo];
        const novo = atual.resumo?.[campo];
        if (antigo == null || novo == null) return antigo !== novo;
        return typeof antigo !== typeof novo || antigo !== novo;
      }).map((campo) => ({ campo, anterior: anterior.resumo?.[campo] ?? null, atual: atual.resumo?.[campo] ?? null })) : [];
      return { competencia, registros: ordenados, atual, anterior, diferencas };
    }).sort((a, b) => b.competencia.localeCompare(a.competencia));
  }, [dados.folhas]);

  const totaisFiscal = useMemo(() => {
    const resumo = {
      entrada: { total: 0, autorizadas: 0, pendentes: 0, canceladas: 0, valorBruto: 0, valorBrutoIncompletos: 0, impostos: {} as Record<string, { total: number; incompletos: number }> },
      saida: { total: 0, autorizadas: 0, pendentes: 0, canceladas: 0, valorBruto: 0, valorBrutoIncompletos: 0, impostos: {} as Record<string, { total: number; incompletos: number }> },
    };
    for (const tributo of camposTributariosFiscal) {
      for (const grupo of [resumo.entrada, resumo.saida]) grupo.impostos[tributo.campo] = { total: 0, incompletos: 0 };
    }
    for (const doc of analiseDuplicidadeFiscal.documentosSemDuplicidade) {
      const tipo = tipoDocumentoFiscal(doc);
      if (!tipo) continue;
      const grupo = resumo[tipo];
      grupo.total += 1;
      if (documentoCancelado(doc)) { grupo.canceladas += 1; continue; }
      if (!documentoAutorizado(doc)) { grupo.pendentes += 1; continue; }
      grupo.autorizadas += 1;
      const valorBruto = valorNumerico(doc.valorTotal ?? doc.valor ?? doc.total);
      if (valorBruto !== null) grupo.valorBruto = Math.round((grupo.valorBruto + valorBruto + Number.EPSILON) * 100) / 100;
      else grupo.valorBrutoIncompletos += 1;
      for (const tributo of camposTributariosFiscal) {
        const valor = doc.dadosTributariosDisponiveis === true ? valorNumerico(doc[tributo.campo]) : null;
        if (valor === null) grupo.impostos[tributo.campo].incompletos += 1;
        else grupo.impostos[tributo.campo].total = Math.round((grupo.impostos[tributo.campo].total + valor + Number.EPSILON) * 100) / 100;
      }
    }
    return resumo;
  }, [analiseDuplicidadeFiscal.documentosSemDuplicidade]);

  const resumoTributosCompetencia = useMemo(() => {
    type LinhaCompetencia = {
      fiscal: Record<"entrada" | "saida", Record<string, SomaTributoFiscal>>;
      folha?: ResumoFolha;
    };
    const campos = ["valorIcms", "valorPis", "valorCofins", "valorIss", "valorIpi"] as const;
    const porCompetencia = new Map<string, LinhaCompetencia>();
    const obterLinha = (competencia: string): LinhaCompetencia => {
      let linha = porCompetencia.get(competencia);
      if (!linha) {
        const grupo = () => Object.fromEntries(campos.map((campo) => [campo, { valor: 0, incompletos: 0, documentos: 0 }])) as Record<typeof campos[number], SomaTributoFiscal>;
        linha = { fiscal: { entrada: grupo(), saida: grupo() } };
        porCompetencia.set(competencia, linha);
      }
      return linha;
    };
    for (const doc of analiseDuplicidadeFiscal.documentosSemDuplicidade) {
      const tipo = tipoDocumentoFiscal(doc);
      const data = String(doc.dataEmissao || doc.emissao || "");
      const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
      const competencia = br ? `${br[3]}-${br[2]}` : iso ? `${iso[1]}-${iso[2]}` : "";
      if (!tipo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) || !documentoAutorizado(doc)) continue;
      const grupo = obterLinha(competencia).fiscal[tipo];
      for (const campo of campos) {
        const valor = doc.dadosTributariosDisponiveis === true ? valorNumerico(doc[campo]) : null;
        if (valor === null) grupo[campo].incompletos += 1;
        else grupo[campo].valor = Math.round((grupo[campo].valor + valor + Number.EPSILON) * 100) / 100;
        grupo[campo].documentos += 1;
      }
    }
    for (const item of historicoFolhasDP) {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(item.competencia) && item.atual) obterLinha(item.competencia).folha = item.atual;
    }
    const valorApurado = (valor: unknown) => typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;
    return [...porCompetencia.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([competencia, linha]) => ({
      competencia,
      fiscal: linha.fiscal,
      inssEmpregado: valorApurado(linha.folha?.resumo?.descontosINSS),
      inssPatronal: valorApurado(linha.folha?.resumo?.inssPatronal),
      fgts: valorApurado(linha.folha?.resumo?.fgts),
      temResumoDP: Boolean(linha.folha),
    }));
  }, [analiseDuplicidadeFiscal.documentosSemDuplicidade, historicoFolhasDP]);

  const contasAnaliticas = useMemo(() => contas.filter((conta) => conta.tipo === "analitica"), [contas]);
  const contaNome = (codigo: string) => contasAnaliticas.find((conta) => conta.codigo === codigo)?.descricao || "Conta não encontrada no plano atual";
  const previaContabilDP = useMemo<EstadoPreviaDP>(() => {
    const partidas: PreviaPartidaDP[] = [];
    const pendencias: EstadoPreviaDP["pendencias"] = [];
    const porOrigem = new Map<OrigemMapeadaContabil, MapeamentoOrigemContabil>(mapeamentos.map((item) => [item.origem, item]));
    const origens = [
      { campo: "folhaBruta", origem: "dp_folha_bruta" as const, titulo: "Folha bruta" },
      { campo: "descontosINSS", origem: "dp_descontos_inss" as const, titulo: "INSS descontado do empregado" },
      { campo: "inssPatronal", origem: "dp_inss_patronal" as const, titulo: "INSS patronal", opcional: true },
      { campo: "descontosIRRF", origem: "dp_descontos_irrf" as const, titulo: "IRRF descontado" },
      { campo: "fgts", origem: "dp_fgts" as const, titulo: "FGTS informado pelo DP" },
    ];
    for (const { atual: folha } of historicoFolhasDP) {
      if (!folha) continue;
      const valores = folha.resumo || {};
      const camposObrigatorios = ["folhaBruta", "descontosINSS", "descontosIRRF", "descontosOutros", "liquidoFolha", "fgts"];
      if (camposObrigatorios.some((campo) => typeof valores[campo] !== "number" || !Number.isFinite(valores[campo]))) {
        pendencias.push({ competencia: folha.competencia, motivo: "Há totais essenciais não apurados; nenhuma prévia foi montada." });
        continue;
      }
      const folhaBruta = valores.folhaBruta as number;
      const descontosINSS = valores.descontosINSS as number;
      const descontosIRRF = valores.descontosIRRF as number;
      const descontosOutros = valores.descontosOutros as number;
      const liquidoFolha = valores.liquidoFolha as number;
      const saldoLiquidoCalculado = Math.round((folhaBruta - descontosINSS - descontosIRRF - descontosOutros + Number.EPSILON) * 100) / 100;
      if (descontosOutros > 0 || Math.abs(saldoLiquidoCalculado - liquidoFolha) > 0.01) {
        pendencias.push({ competencia: folha.competencia, motivo: "Descontos ou líquido não conciliam com os mapeamentos disponíveis; classifique todos os descontos antes de preparar partidas." });
        continue;
      }
      const candidatas: PreviaPartidaDP[] = [];
      let incompleta = false;
      for (const origem of origens) {
        const valorRecebido = valores[origem.campo];
        if (valorRecebido == null && "opcional" in origem && origem.opcional) {
          pendencias.push({ competencia: folha.competencia, motivo: `${origem.titulo} não recebido do DP; nenhum valor foi presumido.` });
          continue;
        }
        const valor = valorRecebido as number;
        if (valor < 0) { incompleta = true; break; }
        if (valor === 0) continue;
        const mapeamento = porOrigem.get(origem.origem);
        const debitoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaDebitoCodigo));
        const creditoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaCreditoCodigo));
        if (!mapeamento || !debitoExiste || !creditoExiste || mapeamento.contaDebitoCodigo === mapeamento.contaCreditoCodigo) {
          pendencias.push({ competencia: folha.competencia, motivo: `Mapeamento válido de débito e crédito pendente para ${origem.titulo}.` });
          if (!("opcional" in origem && origem.opcional)) { incompleta = true; break; }
          continue;
        }
        candidatas.push({
          competencia: folha.competencia,
          origem: origem.titulo,
          contaDebitoCodigo: mapeamento.contaDebitoCodigo,
          contaCreditoCodigo: mapeamento.contaCreditoCodigo,
          valor,
          referencia: `DP:${cnpjNormalizado}:${folha.competencia}:${origem.campo}`,
        });
      }
      if (!incompleta) partidas.push(...candidatas);
    }
    return { partidas, pendencias };
  }, [historicoFolhasDP, mapeamentos, contasAnaliticas, cnpjNormalizado]);

  const previaContabilFiscal = useMemo<EstadoPreviaFiscal>(() => {
    const partidas: PreviaPartidaFiscal[] = [];
    const pendencias: EstadoPreviaFiscal["pendencias"] = [];
    const porOrigem = new Map<OrigemMapeadaContabil, MapeamentoOrigemContabil>(mapeamentos.map((item) => [item.origem, item]));
    for (const doc of analiseDuplicidadeFiscal.duplicados) {
      const chave = String(doc.chaveAcesso || "").replace(/\s/g, "");
      const data = String(doc.dataEmissao || doc.emissao || "");
      const competencia = competenciaDeData(data);
      pendencias.push({ competencia: competencia || "sem competência", motivo: `Chave NF-e ${chave} repetida na origem; todos os registros com essa chave foram excluídos da prévia até conferência.` });
    }
    for (const doc of analiseDuplicidadeFiscal.documentosSemDuplicidade) {
      const tipo = doc.tipo === "Entrada" ? "Entrada" : doc.tipo === "Saída" ? "Saida" : "";
      const chave = String(doc.chaveAcesso || doc.id || "").trim();
      const dataTexto = String(doc.dataEmissao || doc.emissao || "").trim();
      const dataBr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataTexto);
      const dataIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataTexto);
      const ano = dataBr?.[3] || dataIso?.[1] || "";
      const mes = dataBr?.[2] || dataIso?.[2] || "";
      const dia = dataBr?.[1] || dataIso?.[3] || "01";
      const competencia = ano && mes ? `${ano}-${mes}` : "";
      const data = ano && mes ? `${ano}-${mes}-${dia}` : "";
      const rotulo = tipo === "Entrada" ? "Fiscal — Entrada" : "Fiscal — Saída";
      const competenciaExibicao = competencia || "sem competência";
      const dataObjeto = new Date(`${data}T00:00:00Z`);
      const dataCalendarioValida = /^\d{4}-\d{2}-\d{2}$/.test(data) && Number.isFinite(dataObjeto.getTime()) && dataObjeto.toISOString().slice(0, 10) === data;
      const eventoCancelamento = eventoCancelamentoConfirmado(doc);
      if (!tipo || !chave || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) || !dataCalendarioValida) {
        pendencias.push({ competencia: competenciaExibicao, motivo: "Identificação ou data inválida; documento mantido fora da prévia fiscal." });
        continue;
      }
      if (!documentoAutorizado(doc) || eventoCancelamento) {
        pendencias.push({ competencia, motivo: `A NF-e não tem autorização oficial confirmada ou consta cancelamento${eventoCancelamento ? " registrado" : ""}; não foi preparada.` });
        continue;
      }
      const valor = Number(doc.valorTotal);
      const tributosAusentes = camposTributariosFiscal.filter(({ campo }) => typeof doc[campo] !== "number" || !Number.isFinite(Number(doc[campo])));
      const tributosInvalidos = camposTributariosFiscal.filter(({ campo }) => typeof doc[campo] === "number" && Number.isFinite(Number(doc[campo])) && Number(doc[campo]) < 0);
      const tributosDestacados = camposTributariosFiscal.filter(({ campo }) => typeof doc[campo] === "number" && Number.isFinite(Number(doc[campo])) && Number(doc[campo]) > 0);
      if (!Number.isFinite(valor) || valor <= 0) {
        pendencias.push({ competencia, motivo: "Valor total ausente ou inválido. Revise a origem fiscal; nenhum valor foi presumido." });
        continue;
      }
      if (doc.dadosTributariosDisponiveis !== true || tributosAusentes.length > 0) {
        const campos = tributosAusentes.map(({ titulo }) => titulo);
        pendencias.push({ competencia, motivo: `Composição tributária incompleta${campos.length ? `; campos sem valor informado: ${campos.join(", ")}` : " na origem"}. Revise o XML antes de preparar o lançamento.` });
        continue;
      }
      if (tributosInvalidos.length > 0) {
        pendencias.push({ competencia, motivo: `Valores tributários negativos em ${tributosInvalidos.map(({ titulo }) => titulo).join(", ")}; corrija a origem antes de lançar.` });
        continue;
      }
      if (tributosDestacados.length > 0) {
        const detalhamento = tributosDestacados.map(({ campo, titulo }) => `${titulo}: ${dinheiro(Number(doc[campo]))}`).join(" · ");
        pendencias.push({ competencia, motivo: `Tributos destacados impedem a prévia bruta de partida única (${detalhamento}). A nota permanece pendente de classificação contábil dos tributos.` });
        continue;
      }
      const origemMapeada: OrigemMapeadaContabil = tipo === "Entrada" ? "fiscal_entrada" : "fiscal_saida";
      const mapeamento = porOrigem.get(origemMapeada);
      const debitoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaDebitoCodigo));
      const creditoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaCreditoCodigo));
      if (!mapeamento || !debitoExiste || !creditoExiste || mapeamento.contaDebitoCodigo === mapeamento.contaCreditoCodigo) {
        pendencias.push({ competencia, motivo: `Mapeamento válido de débito e crédito pendente para ${rotulo}.` });
        continue;
      }
      const tipoReferencia = tipo === "Entrada" ? "Entrada" : "Saida";
      partidas.push({
        competencia,
        data,
        origem: rotulo,
        contaDebitoCodigo: mapeamento.contaDebitoCodigo,
        contaCreditoCodigo: mapeamento.contaCreditoCodigo,
        valor: Math.round((valor + Number.EPSILON) * 100) / 100,
        chave,
        referencia: `FISCAL:${cnpjNormalizado}:${competencia}:${tipoReferencia}:${chave}`,
      });
    }
    return { partidas, pendencias };
  }, [analiseDuplicidadeFiscal.duplicados, analiseDuplicidadeFiscal.documentosSemDuplicidade, mapeamentos, contasAnaliticas, cnpjNormalizado]);

  const selecionarConta = (origem: OrigemMapeadaContabil, lado: keyof RascunhoMapeamento, valor: string) => {
    const salvo = mapeamentos.find((item) => item.origem === origem);
    const atual = rascunhos[origem] || {
      contaDebitoCodigo: salvo?.contaDebitoCodigo || "",
      contaCreditoCodigo: salvo?.contaCreditoCodigo || "",
    };
    const proximo = { ...atual, [lado]: valor };
    setRascunhos((prev) => ({ ...prev, [origem]: proximo }));
    if (!proximo.contaDebitoCodigo || !proximo.contaCreditoCodigo) {
      if (salvo && (!proximo.contaDebitoCodigo || !proximo.contaCreditoCodigo)) {
        onSalvarMapeamentos(mapeamentos.filter((item) => item.origem !== origem));
      }
      return;
    }
    const debito = contasAnaliticas.find((conta) => conta.codigo === proximo.contaDebitoCodigo);
    const credito = contasAnaliticas.find((conta) => conta.codigo === proximo.contaCreditoCodigo);
    if (!debito || !credito || debito.codigo === credito.codigo) {
      if (salvo) onSalvarMapeamentos(mapeamentos.filter((item) => item.origem !== origem));
      return;
    }
    const mapeamento: MapeamentoOrigemContabil = {
      origem,
      contaDebitoCodigo: debito.codigo,
      contaCreditoCodigo: credito.codigo,
      revisadoEm: new Date().toISOString(),
    };
    onSalvarMapeamentos([...mapeamentos.filter((item) => item.origem !== origem), mapeamento]);
  };

  const referenciasElegiveis = useMemo(() => new Set([
    ...previaContabilDP.partidas.map((partida) => partida.referencia),
    ...previaContabilFiscal.partidas.map((partida) => partida.referencia),
  ]), [previaContabilDP.partidas, previaContabilFiscal.partidas]);
  const conciliacaoIntegracao = useMemo(() => {
    const candidatos = [...previaContabilDP.partidas, ...previaContabilFiscal.partidas];
    const linhasCandidatas = candidatos.map((candidato) => {
      const rascunho = preLancamentos.find((item) => item.referenciaOrigem === candidato.referencia);
      const definitivo = lancamentos.find((item) => item.id === candidato.referencia || item.documentoRef === candidato.referencia);
      if (definitivo) {
        const valorConfere = Math.round((Number(definitivo.valor) + Number.EPSILON) * 100) === Math.round((candidato.valor + Number.EPSILON) * 100);
        const contasConferem = definitivo.contaDebitoCodigo === candidato.contaDebitoCodigo && definitivo.contaCreditoCodigo === candidato.contaCreditoCodigo;
        const aprovado = rascunho?.status === "contabilizado";
        return { candidato, situacao: aprovado && valorConfere && contasConferem ? "Conciliado" : "Divergência", detalhe: !aprovado ? "Há lançamento definitivo sem rascunho marcado como contabilizado" : !valorConfere ? `Origem ${dinheiro(candidato.valor)} · Contábil ${dinheiro(definitivo.valor)}` : !contasConferem ? `Contas da origem ${candidato.contaDebitoCodigo} / ${candidato.contaCreditoCodigo} · Contábil ${definitivo.contaDebitoCodigo} / ${definitivo.contaCreditoCodigo}` : "Referência, valor e contas conferem" };
      }
      if (rascunho?.status === "pendente_conferencia") return { candidato, situacao: "Aguardando aprovação", detalhe: "Rascunho preservado; ainda não entra nos livros definitivos" };
      if (rascunho?.status === "contabilizado") return { candidato, situacao: "Divergência", detalhe: "Rascunho consta contabilizado, mas não foi localizado lançamento definitivo correspondente" };
      return { candidato, situacao: "Sem rascunho", detalhe: "Origem apta à prévia, mas não há rascunho persistido correspondente" };
    });
    const referenciasEncontradas = new Set(candidatos.map((item) => item.referencia));
    const aprovadosSemOrigem = lancamentos.filter((item) => {
      const referencia = String(item.documentoRef || item.id || "");
      if (item.estornoDe || !(referencia.startsWith(`DP:${cnpjNormalizado}:`) || referencia.startsWith(`FISCAL:${cnpjNormalizado}:`)) || referenciasEncontradas.has(referencia)) return false;
      const competencia = competenciaDeData(item.competencia) || competenciaDeData(item.data);
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) && competencia >= desde && competencia <= ate;
    }).map((item) => ({
      candidato: { competencia: competenciaDeData(item.competencia) || competenciaDeData(item.data), origem: item.origem, referencia: String(item.documentoRef || item.id), valor: item.valor },
      situacao: "Origem não localizada",
      detalhe: dados.documentos.length >= 500 || dados.folhas.length >= 200
        ? "Consulta atingiu o limite de registros; reduza o período e confira novamente antes de concluir"
        : "Lançamento definitivo sem proposta correspondente na origem atual; confira cancelamento, mudança de dados ou escopo da origem",
    }));
    const linhas = [...linhasCandidatas, ...aprovadosSemOrigem];
    return {
      linhas,
      conciliados: linhas.filter((item) => item.situacao === "Conciliado").length,
      pendentes: linhas.filter((item) => item.situacao === "Aguardando aprovação").length,
      divergencias: linhas.filter((item) => ["Divergência", "Sem rascunho", "Origem não localizada"].includes(item.situacao)).length,
    };
  }, [previaContabilDP.partidas, previaContabilFiscal.partidas, preLancamentos, lancamentos, cnpjNormalizado, dados.documentos.length, dados.folhas.length, desde, ate]);
  const consultaOrigensNoLimite = dados.documentos.length >= 500 || dados.folhas.length >= 200;
  const aguardandoContador = preLancamentos.filter((item) => item.status === "pendente_conferencia" && referenciasElegiveis.has(item.referenciaOrigem)).length;
  const bloqueadosRevalidacao = preLancamentos.filter((item) => item.status === "pendente_conferencia" && !referenciasElegiveis.has(item.referenciaOrigem)).length;
  const contabilizados = preLancamentos.filter((item) => item.status === "contabilizado").length;
  const aprovadosPeloRobo = previaContabilDP.partidas.length + previaContabilFiscal.partidas.length;
  const pendenciasRobo = previaContabilDP.pendencias.length + previaContabilFiscal.pendencias.length;

  const exportarConciliacao = () => {
    if (!workspaceCarregado) {
      setMensagemConciliacao("Aguarde a leitura do workspace desta empresa antes de exportar a conciliação.");
      return;
    }
    const escapar = (valor: unknown) => {
      const texto = String(valor ?? "");
      const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const linhas = [
      ["RELATÓRIO INTERNO DE CONCILIAÇÃO FISCAL/DP → CONTÁBIL"],
      [`Empresa CNPJ: ${cnpj}`, `Competências: ${desde} a ${ate}`, `Exportado em: ${new Date().toLocaleString("pt-BR")}`],
      ["Status da consulta", consultaOrigensNoLimite ? "INCOMPLETA — limite de registros atingido; conferir em períodos menores" : "Consulta abaixo dos limites configurados"],
      ["Competência", "Origem", "Referência", "Valor de origem", "Situação", "Detalhe"],
      ...conciliacaoIntegracao.linhas.map(({ candidato, situacao, detalhe }) => [candidato.competencia, candidato.origem, candidato.referencia, candidato.valor, situacao, detalhe]),
      ["Observação", "Relatório local para conferência. Não modifica lançamentos e não substitui revisão contábil, apuração fiscal nem validação de portal oficial."],
    ];
    const csv = `\uFEFF${linhas.map((linha) => linha.map(escapar).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `conciliacao-fiscal-dp-contabil-${cnpjNormalizado}-${desde}-${ate}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMensagemConciliacao("Relatório CSV interno exportado para conferência. Nenhum dado foi alterado.");
  };

  const exportarHistoricoDP = () => {
    if (!workspaceCarregado || !dados.folhas.length) {
      setMensagemHistoricoDP("Aguarde a leitura do workspace e o recebimento dos resumos do DP antes de exportar.");
      return;
    }
    const escapar = (valor: unknown) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
    const linhas: unknown[][] = [
      ["HISTÓRICO INTERNO DE RESUMOS AGREGADOS DO DP — NÃO É FOLHA OU GUIA OFICIAL"],
      [`CNPJ: ${cnpj}`, `Exportado em: ${new Date().toLocaleString("pt-BR")}`],
      ["Tipo de linha", "Competência", "Processamento", "Versão", "Calculado em", "Recebido em", "Atualizado em", "Campo", "Valor", "Valor anterior", "Valor atual", "Situação"],
    ];
    for (const grupo of historicoFolhasDP) {
      grupo.registros.forEach((registro, indice) => {
        const campos = Object.entries(registro.resumo || {});
        const versao = indice === 0 ? "Mais recente" : `Histórico ${indice}`;
        if (!campos.length) linhas.push(["Resumo", grupo.competencia, registro.processamentoId || "", versao, registro.calculadoEm, registro.recebidoEm, registro.atualizadoEm || "", "", "", "", "", "Sem campos recebidos"]);
        for (const [campo, valor] of campos) linhas.push(["Resumo", grupo.competencia, registro.processamentoId || "", versao, registro.calculadoEm, registro.recebidoEm, registro.atualizadoEm || "", campo, valor == null ? "" : valor, "", "", valor == null ? "Pendente/não informado" : "Valor recebido"]);
      });
      for (const diferenca of grupo.diferencas) linhas.push(["Comparação", grupo.competencia, grupo.atual?.processamentoId || "", "Atual vs. versão anterior", grupo.atual?.calculadoEm || "", grupo.atual?.recebidoEm || "", grupo.atual?.atualizadoEm || "", diferenca.campo, "", diferenca.anterior ?? "", diferenca.atual ?? "", "Diferença entre versões"]);
    }
    const csv = `\uFEFF${linhas.map((linha) => linha.map(escapar).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `historico-resumos-dp-${cnpjNormalizado}-${desde}-${ate}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMensagemHistoricoDP("Histórico CSV exportado. Inclui versões recebidas e diferenças, sem alterar os dados.");
  };

  const exportarMapaTributario = () => {
    if (!workspaceCarregado) {
      setMensagemTributos("Aguarde a leitura do workspace desta empresa antes de exportar.");
      return;
    }
    const escapar = (valor: unknown) => {
      const texto = String(valor ?? "");
      const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const campos = [
      ["ICMS", "valorIcms"], ["PIS", "valorPis"], ["COFINS", "valorCofins"], ["ISS", "valorIss"], ["IPI", "valorIpi"],
    ] as const;
    const valorFonte = (item: SomaTributoFiscal) => {
      if (!item.documentos) return { valor: "", status: "Sem documento autorizado na origem" };
      if (item.incompletos === item.documentos) return { valor: "", status: `Pendente: campo ausente em ${item.documentos} documento(s)` };
      return {
        valor: item.valor,
        status: item.incompletos ? `Parcial: ${item.incompletos} de ${item.documentos} documento(s) sem campo` : `Destaques recebidos em ${item.documentos} documento(s)`,
      };
    };
    const linhas: unknown[][] = [
      ["MAPA INTERNO DE CONFERÊNCIA TRIBUTÁRIA — NÃO É APURAÇÃO NEM GUIA OFICIAL"],
      [`Empresa: ${cnpj}`, `Regime cadastrado: ${regime || "não informado"}`, `Competências: ${desde} a ${ate}`, `Exportado em: ${new Date().toLocaleString("pt-BR")}`],
      ["Competência", "Tributo", "Valor fonte 1 (R$)", "Situação fonte 1", "Valor fonte 2 (R$)", "Situação fonte 2", "Valor devido", "Status da apuração", "Pendência / próximo passo"],
    ];
    for (const competencia of resumoTributosCompetencia) {
      for (const [tributo, campo] of campos) {
        const entrada = valorFonte(competencia.fiscal.entrada[campo]);
        const saida = valorFonte(competencia.fiscal.saida[campo]);
        const motivo = regime === "Simples Nacional" || regime === "MEI"
          ? "Apuração do regime e dados segregados não foram recebidos; conferir no PGDAS-D/portal aplicável."
          : regime === "Lucro Presumido" || regime === "Lucro Real"
            ? "Bases, ajustes, créditos e regras da competência não foram recebidos; destaque documental não é saldo devido."
            : "Regime tributário não informado; validar cadastro e origem oficial antes de apurar.";
        linhas.push([competencia.competencia, tributo, entrada.valor, entrada.status, saida.valor, saida.status, "", "PENDENTE — não apurado", motivo]);
      }
      for (const [tributo, valor] of [["INSS empregado", competencia.inssEmpregado], ["INSS patronal", competencia.inssPatronal], ["FGTS", competencia.fgts]] as const) {
        const recebido = valor !== null;
        linhas.push([competencia.competencia, tributo, recebido ? valor : "", recebido ? "Valor recebido no resumo do DP" : competencia.temResumoDP ? "Pendente: valor não informado no resumo do DP" : "Pendente: resumo do DP não recebido", "", "Não aplicável", "", "PENDENTE — não é guia", recebido ? "Conferir composição, fechamento da folha e origem oficial antes do recolhimento." : "Solicitar ou completar o dado na origem; nenhum valor ausente foi tratado como zero."]);
      }
    }
    linhas.push(["Observação", "Valores fiscais são somente destaques recebidos. Este arquivo não calcula imposto devido, compensações, vencimentos, juros ou guia e não substitui conferência profissional ou portal oficial."]);
    const csv = `\uFEFF${linhas.map((linha) => linha.map(escapar).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mapa-conferencia-tributaria-${cnpjNormalizado}-${desde}-${ate}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMensagemTributos("Mapa interno CSV exportado. Valores não apurados permanecem pendentes; nenhum lançamento foi alterado.");
  };

  const contabilizarPendentes = async () => {
    const todosPendentes = preLancamentos.filter((item) => item.status === "pendente_conferencia");
    const pendentes = todosPendentes.filter((item) => referenciasElegiveis.has(item.referenciaOrigem));
    if (!pendentes.length) return;
    const bloqueados = todosPendentes.length - pendentes.length;
    const confirmado = window.confirm(`Conferiu os ${pendentes.length} pré-lançamento(s) elegíveis desta empresa e período? ${bloqueados ? `${bloqueados} rascunho(s) não atende(m) mais à prévia carregada e ficará(ão) bloqueado(s). ` : ""}A confirmação contabiliza apenas os elegíveis e atualiza o balancete após salvar no banco.`);
    if (!confirmado) return;
    setMensagemPrevia("Salvando os lançamentos aprovados no banco permanente…");
    const persistido = await onContabilizar(pendentes.map((item) => item.referenciaOrigem));
    if (persistido) void carregarHistorico();
    setMensagemPrevia(persistido
      ? `${pendentes.length} lançamento(s) elegível(is) contabilizado(s) e confirmado(s) no PostgreSQL${bloqueados ? `; ${bloqueados} rascunho(s) preservado(s) para revisão` : ""}.`
      : "A gravação no PostgreSQL não foi confirmada. Os dados continuam apenas na cópia local; atualize a empresa antes de tentar novamente.");
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Dados recebidos • {cnpj || "sem empresa"}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Revisão Fiscal e Departamento Pessoal</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">O servidor prepara e persiste pré-lançamentos quando origem, autorização, dados e mapeamentos permitem, mesmo sem esta tela aberta. Tudo aguarda conferência e aprovação; esta tela não transmite obrigações.</p>
        </div>
        <button type="button" onClick={() => { void carregar(); void carregarHistorico(); }} disabled={carregando || carregandoHistorico || !workspaceCarregado} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-semibold text-slate-600">Competência inicial<input type="month" value={desde} max={ate} onChange={(event) => setDesde(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Competência final<input type="month" value={ate} min={desde} onChange={(event) => setAte(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        {atualizadoEm && <span className="text-xs text-slate-500">Consultado em {atualizadoEm}</span>}
      </section>

      {erro && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}
      {analiseDuplicidadeFiscal.duplicados.length > 0 && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>{analiseDuplicidadeFiscal.duplicados.length} registro(s) têm chave NF-e de 44 dígitos repetida.</strong> Todos os documentos dessas chaves foram mantidos visíveis, mas ficaram fora das somas fiscais e das prévias contábeis até a conferência. Nenhum registro foi apagado.</p></div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div><h2 className="font-bold text-slate-900">Histórico persistente e trilha de auditoria</h2><p className="mt-1 text-xs text-slate-600">Mostra aprovações integradas, lançamentos manuais, estornos e alterações de saldo inicial salvos no banco.</p></div>
          <button type="button" onClick={() => void carregarHistorico()} disabled={carregandoHistorico || !workspaceCarregado} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${carregandoHistorico ? "animate-spin" : ""}`} /> Atualizar histórico</button>
        </div>
        <div className="p-4">
          {erroHistorico && <div role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{erroHistorico}</div>}
          {integridadeAprovacoes && <div role="status" className={`mb-3 rounded-lg border p-3 text-sm ${integridadeAprovacoes.status === "consistente" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
            <strong>{integridadeAprovacoes.status === "consistente" ? "Vínculos auditados: sem divergência detectada" : "Vínculos auditados: requer revisão"}</strong>
            {integridadeAprovacoes.status === "revisar" && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {integridadeAprovacoes.aprovacoesSemLancamento.length > 0 && <li>{integridadeAprovacoes.aprovacoesSemLancamento.length} aprovação(ões) sem lançamento correspondente ou com valor/contas diferentes.</li>}
              {integridadeAprovacoes.lancamentosSemAuditoria.length > 0 && <li>{integridadeAprovacoes.lancamentosSemAuditoria.length} lançamento(s) integrado(s) sem registro de aprovação.</li>}
              {integridadeAprovacoes.statusContabilizadosSemLancamento.length > 0 && <li>{integridadeAprovacoes.statusContabilizadosSemLancamento.length} rascunho(s) marcados contabilizados sem lançamento correspondente.</li>}
              {integridadeAprovacoes.auditoriasManuaisSemLancamento.length > 0 && <li>{integridadeAprovacoes.auditoriasManuaisSemLancamento.length} evento(s) manual(is) sem lançamento correspondente ou com conteúdo diferente.</li>}
              {integridadeAprovacoes.lancamentosComTrilhaInconsistente.length > 0 && <li>{integridadeAprovacoes.lancamentosComTrilhaInconsistente.length} lançamento(s) manual(is) com situação ou conteúdo diferente do último evento registrado.</li>}
              {integridadeAprovacoes.eventosManuaisSemLancamento.length > 0 && <li>{integridadeAprovacoes.eventosManuaisSemLancamento.length} trilha(s) manual(is) sem lançamento correspondente.</li>}
            </ul>}
            <p className="mt-2 text-xs">A checagem compara aprovações integradas e verifica se o estado atual dos lançamentos manuais corresponde ao último evento da trilha. {lancamentosManuaisSemAuditoria.length > 0 ? `${lancamentosManuaisSemAuditoria.length} lançamento(s) manual(is) são anteriores à trilha e não têm autoria histórica recuperável.` : "Lançamentos manuais anteriores à ativação desta trilha não podem ter sua autoria retroativamente comprovada."} Não é conciliação completa dos documentos do Fiscal ou resumos do DP; nada é alterado ou apagado.</p>
          </div>}
          {carregandoHistorico && historicoAprovacoes.length === 0 ? <p className="text-sm text-slate-500">Consultando o histórico no banco…</p> : historicoAprovacoes.length === 0 ? <p className="text-sm text-slate-500">Ainda não há aprovações registradas para esta empresa.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Data e hora</th><th className="px-3 py-2">Aprovado por</th><th className="px-3 py-2">Referência</th><th className="px-3 py-2">Débito</th><th className="px-3 py-2">Crédito</th><th className="px-3 py-2 text-right">Valor</th></tr></thead><tbody>{historicoAprovacoes.map((item) => <tr key={item.referencia} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2">{new Date(item.aprovadoEm).toLocaleString("pt-BR")}</td><td className="px-3 py-2">{texto(item.login)}</td><td className="max-w-80 truncate px-3 py-2" title={item.referencia}>{item.referencia}</td><td className="px-3 py-2">{texto(item.contaDebito)}</td><td className="px-3 py-2">{texto(item.contaCredito)}</td><td className="px-3 py-2 text-right tabular-nums">{Number.isFinite(Number(item.valor)) ? Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não apurado"}</td></tr>)}</tbody></table></div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">Exibindo até 100 aprovações mais recentes. O histórico não altera lançamentos e não executa transmissões oficiais.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold text-slate-900">Lançamentos manuais e estornos</h2><p className="mt-1 text-xs text-slate-600">A autoria, o horário e o conteúdo são gravados junto com a alteração no PostgreSQL. Partidas já salvas ficam preservadas; correções são feitas por estorno.</p></div>
        <div className="overflow-x-auto p-4">
          {historicoLancamentosManuais.length === 0 ? <p className="text-sm text-slate-500">Ainda não há lançamentos manuais ou estornos registrados nesta trilha.</p> : <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Data e hora</th><th className="px-3 py-2">Ação / usuário</th><th className="px-3 py-2">Lançamento</th><th className="px-3 py-2">Débito / crédito</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Motivo</th></tr></thead><tbody>{historicoLancamentosManuais.map((item, index) => { const evento = item.evento.replaceAll("_", " "); const titulo = evento.includes("estorno") ? "Estorno" : item.lancamento.saldoInicialContaCodigo ? "Abertura de saldo inicial" : "Lançamento manual"; const decisao = evento.endsWith("pendente") ? "proposto" : evento.endsWith("aprovado") ? "aprovado" : evento.endsWith("rejeitado") ? "rejeitado" : "registrado"; return <tr key={`${item.lancamentoId}-${item.registradoEm}-${index}`} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2">{new Date(item.registradoEm).toLocaleString("pt-BR")}</td><td className="px-3 py-2">{titulo}: {decisao}<br/><span className="text-xs text-slate-500">{texto(item.login)}</span></td><td className="max-w-64 truncate px-3 py-2" title={item.lancamentoId}>{item.lancamentoId}</td><td className="px-3 py-2">{texto(item.lancamento.contaDebitoCodigo)} / {texto(item.lancamento.contaCreditoCodigo)}</td><td className="px-3 py-2 text-right tabular-nums">{dinheiro(item.lancamento.valor)}</td><td className="max-w-64 px-3 py-2 text-xs text-slate-600">{texto(item.motivo || "—")}</td></tr>; })}</tbody></table>}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold text-slate-900">Saldos iniciais das contas</h2><p className="mt-1 text-xs text-slate-600">Os saldos são base de abertura para os relatórios; não geram partidas por conta própria. Alterações ficam registradas abaixo.</p></div>
        <div className="overflow-x-auto p-4">
          {historicoSaldosAbertura.length === 0 ? <p className="text-sm text-slate-500">Ainda não há cadastro ou alteração de saldo inicial na trilha.</p> : <table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Data e hora</th><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Ação / usuário</th><th className="px-3 py-2">Competência-base</th><th className="px-3 py-2 text-right">Anterior</th><th className="px-3 py-2 text-right">Novo saldo</th></tr></thead><tbody>{historicoSaldosAbertura.map((item, index) => <tr key={`${item.contaCodigo}-${item.registradoEm}-${index}`} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2">{new Date(item.registradoEm).toLocaleString("pt-BR")}</td><td className="px-3 py-2">{item.contaCodigo}</td><td className="px-3 py-2">{item.evento === "saldo_inicial_cadastrado" ? "Cadastro inicial" : "Alteração"}<br/><span className="text-xs text-slate-500">{texto(item.login)}</span></td><td className="px-3 py-2">{texto(item.competencia)}</td><td className="px-3 py-2 text-right">{item.saldoAnterior == null ? "—" : dinheiro(Number(item.saldoAnterior))}</td><td className="px-3 py-2 text-right">{dinheiro(Number(item.saldoNovo))}</td></tr>)}</tbody></table>}
        </div>
      </section>

      <section aria-label="Etapas de conferência" className="grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Etapa 1 · Robô de conferência</p>
          <h2 className="mt-1 font-bold text-emerald-950">Validação automática dos dados disponíveis</h2>
          <p className="mt-2 text-sm text-emerald-900">O sistema confere autorização e cancelamento fiscal, CNPJ, datas, valores, composição informada, mapeamentos e conciliação dos totais da folha. É uma validação por regras explícitas; não inventa dados nem substitui a análise profissional.</p>
          <p className="mt-2 text-xs font-semibold text-emerald-900">{aprovadosPeloRobo} partida(s) passaram pelas regras para virar rascunho · {pendenciasRobo} pendência(s) bloqueiam preparação.</p>
        </article>
        <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-800">Etapa 2 · Contador responsável</p>
          <h2 className="mt-1 font-bold text-blue-950">Revisão e aprovação final</h2>
          <p className="mt-2 text-sm text-blue-900">O contador confere os rascunhos aprovados pela triagem automática. Só a ação explícita “Conferir e contabilizar elegíveis” cria lançamentos definitivos e os inclui nos relatórios.</p>
          <p className="mt-2 text-xs font-semibold text-blue-900">{aguardandoContador} aguardando conferência · {bloqueadosRevalidacao} bloqueado(s) para revalidação · {contabilizados} contabilizado(s).</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-blue-200 bg-white">
        <div className="flex items-center gap-2 border-b border-blue-100 px-4 py-3"><ClipboardCheck className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Prévia contábil das notas fiscais</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">A prévia usa o valor bruto da nota e o mapeamento selecionado para este CNPJ. Só entram NF-e oficialmente autorizadas, não canceladas, com composição tributária disponível e sem tributos destacados. As demais ficam listadas como pendência para classificação manual.</p>
          {previaContabilFiscal.pendencias.map((item, index) => <div key={`${item.competencia}-fiscal-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{item.competencia}:</strong> {item.motivo}</div>)}
          {previaContabilFiscal.partidas.length === 0 ? <Empty text="Nenhuma nota atende aos critérios para prévia fiscal no período e nos mapeamentos atuais." /> : <>
            <p className="text-xs text-blue-800">{previaContabilFiscal.partidas.length} partida(s) sugerida(s); os rascunhos são gerados e salvos automaticamente, sempre pendentes de conferência.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Origem / chave</th><th className="px-3 py-2">Débito</th><th className="px-3 py-2">Crédito</th><th className="px-3 py-2 text-right">Valor bruto</th></tr></thead><tbody>{previaContabilFiscal.partidas.map((partida) => <tr key={partida.referencia} className="border-t border-slate-100"><td className="px-3 py-2">{new Date(`${partida.data}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="max-w-72 truncate px-3 py-2" title={partida.chave}>{partida.origem} • {partida.chave}</td><td className="px-3 py-2">{partida.contaDebitoCodigo} — {contaNome(partida.contaDebitoCodigo)}</td><td className="px-3 py-2">{partida.contaCreditoCodigo} — {contaNome(partida.contaCreditoCodigo)}</td><td className="px-3 py-2 text-right tabular-nums">{dinheiro(partida.valor)}</td></tr>)}</tbody></table></div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Rascunho bruto: essa regra não separa estoque, custo, contas a receber/pagar ou tributos. Confira o documento e a classificação antes de contabilizar.</p>
          </>}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Save className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Mapeamento de contas por empresa</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">Escolha contas analíticas do plano desta empresa. O mapeamento fica salvo no espaço contábil do CNPJ. Ele prepara a classificação; não cria lançamentos automaticamente nem envia valores ao governo.</p>
          {origensMapeaveis.map((origem) => {
            const salvo = mapeamentos.find((item) => item.origem === origem.id);
            const rascunho = rascunhos[origem.id];
            const debito = rascunho?.contaDebitoCodigo ?? salvo?.contaDebitoCodigo ?? "";
            const credito = rascunho?.contaCreditoCodigo ?? salvo?.contaCreditoCodigo ?? "";
            const valido = Boolean(salvo && contasAnaliticas.some((conta) => conta.codigo === salvo.contaDebitoCodigo) && contasAnaliticas.some((conta) => conta.codigo === salvo.contaCreditoCodigo) && salvo.contaDebitoCodigo !== salvo.contaCreditoCodigo);
            return <article key={origem.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(180px,1fr)_1fr_1fr] md:items-end">
              <div><h3 className="text-sm font-bold text-slate-900">{origem.titulo}</h3><p className="mt-1 text-xs text-slate-500">{origem.descricao}</p><p className={`mt-2 text-xs font-semibold ${valido ? "text-emerald-700" : "text-amber-700"}`}>{valido ? `Revisado em ${new Date(salvo!.revisadoEm).toLocaleDateString("pt-BR")}` : "Pendente de mapeamento"}</p></div>
              <label className="text-xs font-semibold text-slate-600">Débito<select value={debito} onChange={(event) => selecionarConta(origem.id, "contaDebitoCodigo", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Selecione uma conta analítica</option>{contasAnaliticas.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {contaNome(conta.codigo)}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Crédito<select value={credito} onChange={(event) => selecionarConta(origem.id, "contaCreditoCodigo", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Selecione uma conta analítica</option>{contasAnaliticas.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {contaNome(conta.codigo)}</option>)}</select></label>
            </article>;
          })}
          <p className="text-xs text-slate-500">Contas sintéticas, contas removidas do plano e lançamentos com débito igual ao crédito não são aceitos como mapeamento válido.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white">
        <div className="flex items-center gap-2 border-b border-indigo-100 px-4 py-3"><ClipboardCheck className="h-4 w-4 text-indigo-700" /><h2 className="font-bold text-slate-900">Prévia contábil da folha</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">Sugestões calculadas a partir dos resumos persistidos e dos mapeamentos desta empresa. Os rascunhos elegíveis são salvos automaticamente; permanecem fora do balancete até a conferência do contador.</p>
          {previaContabilDP.pendencias.map((item, index) => <div key={`${item.competencia}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{item.competencia}:</strong> {item.motivo}</div>)}
          {previaContabilDP.partidas.length === 0 ? <Empty text="Ainda não há partidas de folha prontas para prévia com os dados e mapeamentos disponíveis." /> : (
            <>
            <p className="text-xs text-indigo-800">{previaContabilDP.partidas.length} partida(s) sugerida(s); os rascunhos são gerados e salvos automaticamente, sem alterar o balancete.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Competência</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Débito</th><th className="px-3 py-2">Crédito</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
              <tbody>{previaContabilDP.partidas.map((partida) => <tr key={partida.referencia} className="border-t border-slate-100"><td className="px-3 py-2">{partida.competencia}</td><td className="px-3 py-2">{partida.origem}</td><td className="px-3 py-2">{partida.contaDebitoCodigo} — {contaNome(partida.contaDebitoCodigo)}</td><td className="px-3 py-2">{partida.contaCreditoCodigo} — {contaNome(partida.contaCreditoCodigo)}</td><td className="px-3 py-2 text-right tabular-nums">{dinheiro(partida.valor)}</td></tr>)}</tbody>
            </table></div>
            </>
          )}
          {mensagemPrevia && <p role="status" className="text-xs text-indigo-800">{mensagemPrevia}</p>}
          {preLancamentos.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>{aguardandoContador} pendente(s) elegível(is), {bloqueadosRevalidacao} bloqueado(s) para revalidação e {contabilizados} contabilizado(s) no workspace desta empresa.</strong>
              {preLancamentos.some((item) => item.status === "pendente_conferencia" && referenciasElegiveis.has(item.referenciaOrigem)) && <button type="button" onClick={contabilizarPendentes} disabled={carregando || !workspaceCarregado} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Conferir e contabilizar elegíveis</button>}
            </div>
            <p className="mt-2">A contabilização requer confirmação do contador. Cada referência só pode ser lançada uma vez. Rascunhos bloqueados são mantidos no banco até nova validação dos dados de origem.</p>
          </div>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric title="Notas fiscais no período" value={String(totaisFiscal.entrada.total + totaisFiscal.saida.total)} detail={`${totaisFiscal.entrada.total} entradas • ${totaisFiscal.saida.total} saídas`} />
        <Metric title="Resumos de folha recebidos" value={String(dados.folhas.length)} detail="Totais agregados por competência" />
        <Metric title="Lançamentos definitivos automáticos" value="0" detail="Rascunhos aguardam revisão e aprovação" />
        <Metric title="Status da conferência" value="Pendente" detail="Revisão do contador necessária" />
        <Metric title="Documentos em duplicidade" value={String(analiseDuplicidadeFiscal.duplicados.length)} detail="Excluídos das somas e prévias até revisão" />
      </section>

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-100 px-4 py-3"><div><h2 className="font-bold text-slate-900">Conciliação Fiscal/DP → Contábil</h2><p className="mt-1 text-xs text-slate-600">Cruza as propostas atuais com os rascunhos e lançamentos definitivos desta empresa usando referência de origem, valor e contas. Não corrige nem altera registros.</p></div>
          <button type="button" onClick={exportarConciliacao} disabled={!workspaceCarregado || conciliacaoIntegracao.linhas.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Exportar CSV da conciliação</button>
          {consultaOrigensNoLimite && <p role="status" className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950"><strong>A consulta atingiu o limite de registros.</strong> A conciliação pode estar incompleta; reduza o intervalo de competências e atualize antes de concluir a revisão.</p>}
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          <Metric title="Conciliados" value={String(conciliacaoIntegracao.conciliados)} detail="Referência, valor e contas conferem" />
          <Metric title="Aguardando aprovação" value={String(conciliacaoIntegracao.pendentes)} detail="Continuam fora dos livros definitivos" />
          <Metric title="Revisar divergência" value={String(conciliacaoIntegracao.divergencias)} detail="Inclui origem apta sem rascunho" />
        </div>
        {mensagemConciliacao && <p role="status" className="px-4 pb-3 text-xs text-indigo-800">{mensagemConciliacao}</p>}
        {conciliacaoIntegracao.linhas.length === 0 ? <Empty text="Nenhuma proposta atual apta à conciliação. Origens incompletas continuam listadas como pendências nas seções do Fiscal e DP." /> : <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-4 py-2">Competência</th><th className="px-4 py-2">Origem</th><th className="px-4 py-2">Referência</th><th className="px-4 py-2 text-right">Valor da origem</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2">Conferência</th></tr></thead><tbody>
          {conciliacaoIntegracao.linhas.map(({ candidato, situacao, detalhe }) => <tr key={candidato.referencia} className="border-t border-slate-100"><td className="px-4 py-2">{candidato.competencia}</td><td className="px-4 py-2">{candidato.origem}</td><td className="max-w-72 truncate px-4 py-2 font-mono" title={candidato.referencia}>{candidato.referencia}</td><td className="px-4 py-2 text-right tabular-nums">{dinheiro(candidato.valor)}</td><td className={`px-4 py-2 font-semibold ${situacao === "Conciliado" ? "text-emerald-700" : situacao === "Aguardando aprovação" ? "text-amber-800" : "text-rose-700"}`}>{situacao}</td><td className="px-4 py-2">{detalhe}</td></tr>)}
        </tbody></table></div>}
        <p className="border-t border-indigo-100 px-4 py-3 text-[11px] text-slate-600">“Conciliado” é uma conferência local dos campos disponíveis, não valida classificação contábil, tributos, obrigação acessória nem aceite de portal. Qualquer divergência permanece apenas sinalizada para análise do contador.</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
        <div className="border-b border-emerald-100 px-4 py-3"><h2 className="font-bold text-slate-900">Resumo fiscal do período selecionado</h2><p className="mt-1 text-xs text-slate-600">Valores calculados a partir dos documentos persistidos para este CNPJ. Totais brutos e tributos destacados aparecem separados; notas sem autorização SEFAZ confirmada e canceladas ficam fora dos valores autorizados.</p></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {([ ["entrada", "Entradas"], ["saida", "Saídas"] ] as const).map(([tipo, titulo]) => {
            const grupo = totaisFiscal[tipo];
            return <article key={tipo} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-slate-900">Notas de {titulo.toLowerCase()}</h3><strong className="text-lg tabular-nums">{grupo.autorizadas === 0 ? "—" : grupo.valorBrutoIncompletos === grupo.autorizadas ? "Não apurado" : dinheiro(grupo.valorBruto)}{grupo.valorBrutoIncompletos > 0 && grupo.valorBrutoIncompletos < grupo.autorizadas ? "*" : ""}</strong></div>
              <p className="mt-1 text-xs text-slate-600">{grupo.autorizadas} autorizadas • {grupo.pendentes} pendentes/não confirmadas • {grupo.canceladas} canceladas • {grupo.total} no total</p>
              <p className="mt-1 text-[11px] text-slate-500">Soma bruta das notas com autorização confirmada. Não representa imposto apurado nem valor a pagar.{grupo.valorBrutoIncompletos > 0 && ` Valor ausente em ${grupo.valorBrutoIncompletos} nota(s).`}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{camposTributariosFiscal.map((tributo) => {
                const item = grupo.impostos[tributo.campo];
                const incompleto = item.incompletos > 0;
                const conhecidos = grupo.autorizadas - item.incompletos;
                const valorExibido = !grupo.autorizadas ? "—" : conhecidos === 0 ? "Não apurado" : `${dinheiro(item.total)}${incompleto ? "*" : ""}`;
                return <div key={tributo.campo} className="rounded bg-slate-50 p-2"><div className="text-slate-500">{tributo.titulo}{incompleto && conhecidos > 0 ? " • parcial" : ""}</div><div className="mt-1 font-semibold text-slate-800">{valorExibido}</div>{incompleto && <div className="mt-1 text-[10px] text-amber-800">Sem composição em {item.incompletos} autorizada(s)</div>}</div>;
              })}</div>
            </article>;
          })}
        </div>
        <p className="px-4 pb-4 text-[11px] text-slate-500">Os tributos são apenas valores destacados nos dados recebidos. Quando faltam campos, o total fica marcado como parcial; nenhum campo ausente é assumido como zero.</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-amber-300 bg-white">
        <div className="border-b border-amber-100 px-4 py-3"><h2 className="font-bold text-slate-900">Conferência de tributos por regime</h2><p className="mt-1 text-xs text-slate-600">Regime cadastrado: <strong>{regime || "Não informado"}</strong>. Esta conferência não calcula imposto devido nem emite guia.</p></div>
        <div className="space-y-3 p-4">
          {regime === "Simples Nacional" && <>
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>DAS unificado: apuração pendente.</strong> Antes de calcular, faltam receita bruta segregada por atividade/anexo e tratamento fiscal, competência e validações do PGDAS-D. Destaques de NF-e não substituem a declaração nem determinam sozinhos o DAS.</p>
            <p className="text-xs text-slate-600"><strong>Próximo passo seguro:</strong> completar/conferir os dados de receita e operação e comparar a apuração no PGDAS-D. O sistema ainda não recebe o resultado oficial nem emite a guia.</p>
          </>}
          {(regime === "Lucro Presumido" || regime === "Lucro Real") && <>
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Os valores de ICMS, ISS, PIS e COFINS abaixo são destaques dos documentos, não saldo a recolher. A apuração exige escrituração/base tributável, CST e natureza das operações, ajustes e créditos aplicáveis, além dos parâmetros válidos para a empresa e competência. IRPJ e CSLL dependem da base e forma de apuração próprias do regime, não recebidas nesta integração.</p>
            <p className="text-xs text-slate-600"><strong>Próximo passo seguro:</strong> completar e validar as escriturações fiscais e bases da competência, e então confrontar a apuração com os ambientes oficiais. O sistema ainda não recebe esses resultados oficiais nem emite guias.</p>
          </>}
          {!regime && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Informe e confira o regime tributário da empresa antes de preparar qualquer apuração.</p>}
          <nav aria-label="Fontes oficiais para conferência tributária" className="flex flex-wrap gap-2 text-xs">
            {regime === "Simples Nacional" && <a href="https://www.gov.br/pt-br/servicos/declarar-apuracoes-mensais-do-simples-nacional" target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900 underline">Serviço oficial PGDAS-D</a>}
            {(regime === "Lucro Presumido" || regime === "Lucro Real") && <>
              <a href="https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi" target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900 underline">EFD ICMS/IPI — SPED</a>
              <a href="https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes" target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900 underline">EFD-Contribuições — SPED</a>
            </>}
            <a href="https://servicos.receitafederal.gov.br/" target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900 underline">Serviços da Receita Federal</a>
            <span className="self-center text-[11px] text-slate-500">ISS: informe o município e confira o portal municipal correspondente.</span>
          </nav>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <h3 className="text-sm font-bold text-indigo-950">Cobertura dos XMLs para preparar a apuração</h3>
            <p className="mt-1 text-xs text-indigo-900">O servidor verifica os campos existentes nos itens dos XMLs completos. Isso mede a cobertura da origem; não valida enquadramento legal nem calcula imposto devido.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <CoberturaItem titulo="XMLs completos analisados" valor={String(dados.coberturaXmlFiscal.documentosAnalisados)} />
              <CoberturaItem titulo="Sem XML completo" valor={String(dados.coberturaXmlFiscal.documentosSemXmlCompleto)} pendente={dados.coberturaXmlFiscal.documentosSemXmlCompleto > 0} />
              <CoberturaItem titulo="XMLs inválidos/incompletos" valor={String(dados.coberturaXmlFiscal.documentosXmlInvalido)} pendente={dados.coberturaXmlFiscal.documentosXmlInvalido > 0} />
              <CoberturaItem titulo="Itens de nota encontrados" valor={String(dados.coberturaXmlFiscal.itens)} />
              <CoberturaItem titulo="Itens com CFOP" valor={`${dados.coberturaXmlFiscal.itensComCfop} / ${dados.coberturaXmlFiscal.itens}`} pendente={dados.coberturaXmlFiscal.itensComCfop < dados.coberturaXmlFiscal.itens} />
              <CoberturaItem titulo="Itens com NCM" valor={`${dados.coberturaXmlFiscal.itensComNcm} / ${dados.coberturaXmlFiscal.itens}`} pendente={dados.coberturaXmlFiscal.itensComNcm < dados.coberturaXmlFiscal.itens} />
              <CoberturaItem titulo="Itens com CST ICMS/CSOSN" valor={`${dados.coberturaXmlFiscal.itensComCstIcmsOuCsosn} / ${dados.coberturaXmlFiscal.itens}`} pendente={dados.coberturaXmlFiscal.itensComCstIcmsOuCsosn < dados.coberturaXmlFiscal.itens} />
              <CoberturaItem titulo="Itens com CST PIS / COFINS" valor={`${dados.coberturaXmlFiscal.itensComCstPis} / ${dados.coberturaXmlFiscal.itens} · ${dados.coberturaXmlFiscal.itensComCstCofins} / ${dados.coberturaXmlFiscal.itens}`} pendente={dados.coberturaXmlFiscal.itensComCstPis < dados.coberturaXmlFiscal.itens || dados.coberturaXmlFiscal.itensComCstCofins < dados.coberturaXmlFiscal.itens} />
            </div>
            {dados.documentos.length > 0 && dados.coberturaXmlFiscal.documentosAnalisados === 0 && <p className="mt-2 text-xs font-semibold text-amber-900">Ainda não há XML completo com itens para análise neste período. Resumos da SEFAZ não bastam para preparar a base detalhada.</p>}
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Tributo</th><th className="px-3 py-2 text-right">Notas de entrada</th><th className="px-3 py-2 text-right">Notas de saída</th><th className="px-3 py-2">Situação</th></tr></thead><tbody>
            {([ ["ICMS", "valorIcms"], ["PIS", "valorPis"], ["COFINS", "valorCofins"], ["ISS", "valorIss"] ] as const).map(([titulo, campo]) => {
              const totalDocs = totaisFiscal.entrada.autorizadas + totaisFiscal.saida.autorizadas;
              const incompletos = totaisFiscal.entrada.impostos[campo].incompletos + totaisFiscal.saida.impostos[campo].incompletos;
              const status = !totalDocs ? "Sem documentos autorizados" : incompletos ? `${incompletos} documento(s) sem valor tributário; conferência incompleta` : "Valores de origem disponíveis; apuração não realizada";
              const display = (grupo: typeof totaisFiscal.entrada) => !grupo.autorizadas ? "—" : grupo.impostos[campo].incompletos === grupo.autorizadas ? "Não apurado" : `${dinheiro(grupo.impostos[campo].total)}${grupo.impostos[campo].incompletos ? "*" : ""}`;
              return <tr key={titulo} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{titulo}</td><td className="px-3 py-2 text-right tabular-nums">{display(totaisFiscal.entrada)}</td><td className="px-3 py-2 text-right tabular-nums">{display(totaisFiscal.saida)}</td><td className="px-3 py-2 text-xs text-amber-800">{status}</td></tr>;
            })}
            {(["IRPJ", "CSLL"] as const).map((titulo) => <tr key={titulo} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{titulo}</td><td className="px-3 py-2 text-right">Não apurado</td><td className="px-3 py-2 text-right">Não apurado</td><td className="px-3 py-2 text-xs text-amber-800">Base de cálculo e apuração do regime não recebidas</td></tr>)}
          </tbody></table></div>
          <p className="text-[11px] text-slate-500">Nenhum valor ausente é tratado como zero. Vencimentos, saldo a recolher e links de emissão só serão preenchidos quando houver integração e dados oficiais suficientes.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-blue-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-blue-100 px-4 py-3"><div><h2 className="font-bold text-slate-900">Consolidação de valores por competência</h2><p className="mt-1 text-xs text-slate-600">Consolida somente valores explícitos dos documentos autorizados e do resumo mais recente da folha recebido do DP. Valores fiscais são destaques dos documentos, não apuração nem guia a pagar.</p></div><button type="button" onClick={exportarMapaTributario} disabled={!workspaceCarregado || !resumoTributosCompetencia.length} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Exportar mapa tributário CSV</button></div>
        {mensagemTributos && <p role="status" className="px-4 pt-3 text-xs text-blue-800">{mensagemTributos}</p>}
        {resumoTributosCompetencia.length === 0 ? <Empty text="Sem notas autorizadas ou resumos de folha no período selecionado." /> : <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="px-3 py-2">Competência</th><th className="px-3 py-2 text-right">ICMS destacado<br/>Entrada / Saída</th><th className="px-3 py-2 text-right">PIS destacado<br/>Entrada / Saída</th><th className="px-3 py-2 text-right">COFINS destacado<br/>Entrada / Saída</th><th className="px-3 py-2 text-right">ISS destacado<br/>Entrada / Saída</th><th className="px-3 py-2 text-right">IPI destacado<br/>Entrada / Saída</th><th className="px-3 py-2 text-right">INSS empregado</th><th className="px-3 py-2 text-right">INSS patronal</th><th className="px-3 py-2 text-right">FGTS</th><th className="px-3 py-2">DAS</th></tr></thead><tbody>
          {resumoTributosCompetencia.map((linha) => {
            const exibirFiscal = (campo: typeof camposTributariosFiscal[number]["campo"]) => {
              const entrada = linha.fiscal.entrada[campo];
              const saida = linha.fiscal.saida[campo];
              const formatar = (item: SomaTributoFiscal) => !item.documentos ? "—" : item.incompletos === item.documentos ? "Pendente" : `${dinheiro(item.valor)}${item.incompletos ? " *" : ""}`;
              return <>{formatar(entrada)} / {formatar(saida)}</>;
            };
            const folha = (valor: number | null) => !linha.temResumoDP ? "Sem resumo DP" : valor === null ? "Pendente" : dinheiro(valor);
            return <tr key={linha.competencia} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{linha.competencia.split("-").reverse().join("/")}</td><td className="px-3 py-2 text-right tabular-nums">{exibirFiscal("valorIcms")}</td><td className="px-3 py-2 text-right tabular-nums">{exibirFiscal("valorPis")}</td><td className="px-3 py-2 text-right tabular-nums">{exibirFiscal("valorCofins")}</td><td className="px-3 py-2 text-right tabular-nums">{exibirFiscal("valorIss")}</td><td className="px-3 py-2 text-right tabular-nums">{exibirFiscal("valorIpi")}</td><td className="px-3 py-2 text-right">{folha(linha.inssEmpregado)}</td><td className="px-3 py-2 text-right">{folha(linha.inssPatronal)}</td><td className="px-3 py-2 text-right">{folha(linha.fgts)}</td><td className="px-3 py-2 text-amber-800">{["Simples Nacional", "MEI"].includes(regime) ? "Pendente no portal oficial" : "Não aplicável"}</td></tr>;
          })}
        </tbody></table></div>}
        <p className="border-t border-blue-100 px-4 py-3 text-[11px] text-slate-600">“Pendente” significa que o campo não veio apurado; não é zero. O quadro não calcula saldo a recolher, compensações, vencimentos ou guia. DAS, INSS patronal e demais encargos só serão tratados como apurados quando a origem oficial fornecer valores completos e verificáveis.</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ArrowDownToLine className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Documentos do Fiscal</h2></div>
        {dados.documentos.length === 0 ? <Empty text="Nenhuma nota fiscal persistida para a empresa e o período selecionados." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">Número / chave</th><th className="px-4 py-3">Participante</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Situação</th></tr></thead>
            <tbody>{dados.documentos.map((doc, index) => <tr key={`${texto(doc.chaveAcesso || doc.id)}-${index}`} className="border-t border-slate-100">
              <td className="px-4 py-3 font-semibold">{texto(doc.tipo)}</td><td className="px-4 py-3">{texto(doc.dataEmissao || doc.emissao)}</td>
              <td className="max-w-64 truncate px-4 py-3 font-mono text-xs">{texto(doc.numero || doc.numeroNota || doc.chaveAcesso || doc.id)}{analiseDuplicidadeFiscal.chavesDuplicadas.has(String(doc.chaveAcesso || "").replace(/\s/g, "")) && <span className="ml-2 inline-flex rounded bg-rose-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-rose-800">CHAVE DUPLICADA</span>}</td>
              <td className="max-w-64 truncate px-4 py-3">{texto(doc.destinatario || doc.remetente || doc.participante || doc.nomeParticipante)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{dinheiro(doc.valorTotal ?? doc.valor ?? doc.total)}</td>
              <td className={`px-4 py-3 ${documentoCancelado(doc) ? "font-semibold text-red-700" : documentoAutorizado(doc) ? "font-semibold text-emerald-700" : "text-amber-800"}`}>
                <div>{analiseDuplicidadeFiscal.chavesDuplicadas.has(String(doc.chaveAcesso || "").replace(/\s/g, "")) ? "Duplicidade pendente de conferência" : situacaoDocumento(doc)}</div>
                {Array.isArray(doc.eventosSefaz) && doc.eventosSefaz.length > 0 && <div className="mt-1 text-[11px] font-normal text-slate-500">{doc.eventosSefaz.length} evento(s) SEFAZ</div>}
              </td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Resumos agregados do DP</h2></div><p className="mt-1 text-xs text-slate-600">Todas as versões recebidas ficam visíveis. A prévia contábil usa somente a versão mais recentemente atualizada por competência.</p></div>
          <button type="button" onClick={exportarHistoricoDP} disabled={!workspaceCarregado || !dados.folhas.length} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Exportar histórico CSV</button>
        </div>
        {mensagemHistoricoDP && <p role="status" className="px-4 pt-3 text-xs text-blue-800">{mensagemHistoricoDP}</p>}
        {dados.folhas.length === 0 ? <Empty text="Nenhum resumo de folha persistido para a empresa e o período selecionados." /> : (
          <div className="divide-y divide-slate-100">{dados.folhas.map((folha) => {
            const historico = historicoFolhasDP.find((item) => item.competencia === folha.competencia);
            const versaoAtual = historico?.atual === folha;
            return <article key={`${folha.competencia}-${folha.processamentoId || folha.calculadoEm}`} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Competência {folha.competencia} {versaoAtual ? <span className="ml-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">VERSÃO MAIS RECENTE</span> : <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">HISTÓRICO</span>}</h3><span className="text-xs text-slate-500">Recebido em {new Date(folha.recebidoEm).toLocaleString("pt-BR")}</span></div>
            {folha.processamentoId && <p className="mt-1 text-[11px] text-slate-500">Processamento de origem: {folha.processamentoId}</p>}
            {versaoAtual && historico && historico.registros.length > 1 && <div role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>{historico.registros.length} versões recebidas nesta competência.</strong> A versão atual é usada na prévia; as anteriores continuam preservadas para auditoria.
              {historico.diferencas.length > 0 ? <ul className="mt-2 list-inside list-disc">{historico.diferencas.map((diferenca) => <li key={diferenca.campo}><strong>{diferenca.campo}:</strong> anterior {diferenca.anterior == null ? "pendente/não informado" : texto(diferenca.anterior)} → atual {diferenca.atual == null ? "pendente/não informado" : texto(diferenca.atual)}</li>)}</ul> : <p className="mt-1">Os campos recebidos nas duas versões são iguais.</p>}
            </div>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(folha.resumo || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{key}</div><div className="mt-1 font-bold text-slate-900">{key === "quantidadeFuncionarios" ? texto(value) : dinheiro(value)}</div></div>)}</div>
            <p className="mt-3 text-xs text-amber-800">Recebido para revisão; valores nulos continuam “não apurados” e não são contabilizados como zero.</p>
          </article>})}</div>
        )}
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">A integração preserva os dados por CNPJ. Antes de gerar partidas, é necessário revisar documento, competência, natureza, regime e contas contábeis; não há transmissão oficial nesta etapa.</div>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; detail: string }> = ({ title, value, detail }) => <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold text-slate-500">{title}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
const CoberturaItem: React.FC<{ titulo: string; valor: string; pendente?: boolean }> = ({ titulo, valor, pendente = false }) => <div className={`rounded-md border p-2 ${pendente ? "border-amber-200 bg-amber-50" : "border-white bg-white"}`}><div className="text-[11px] text-slate-600">{titulo}</div><div className={`mt-1 text-sm font-bold tabular-nums ${pendente ? "text-amber-900" : "text-slate-900"}`}>{valor}</div></div>;
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="p-5 text-sm text-slate-500">{text}</p>;
