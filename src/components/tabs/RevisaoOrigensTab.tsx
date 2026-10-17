import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ClipboardCheck, RefreshCw, Save } from "lucide-react";
import type { ContaPlano, MapeamentoOrigemContabil, OrigemMapeadaContabil, PreLancamentoContabil } from "../../types";

type DocumentoFiscal = Record<string, unknown>;
type ResumoFolha = { competencia: string; calculadoEm: string; recebidoEm: string; atualizadoEm?: string; resumo: Record<string, number | null> };
type LoteOrigens = { documentos: DocumentoFiscal[]; folhas: ResumoFolha[] };
type RascunhoMapeamento = { contaDebitoCodigo: string; contaCreditoCodigo: string };
type PreviaPartidaDP = { competencia: string; origem: string; contaDebitoCodigo: string; contaCreditoCodigo: string; valor: number; referencia: string };
type EstadoPreviaDP = { partidas: PreviaPartidaDP[]; pendencias: Array<{ competencia: string; motivo: string }> };
type PreviaPartidaFiscal = PreviaPartidaDP & { data: string; chave: string };
type EstadoPreviaFiscal = { partidas: PreviaPartidaFiscal[]; pendencias: Array<{ competencia: string; motivo: string }> };

const origensMapeaveis: Array<{ id: OrigemMapeadaContabil; titulo: string; descricao: string }> = [
  { id: "fiscal_entrada", titulo: "NF-e de entrada", descricao: "A conta de estoque/despesa varia por operação e CFOP; revise a conta de débito para esta empresa." },
  { id: "fiscal_saida", titulo: "NF-e de saída", descricao: "Mapeia o valor bruto da venda; tributos destacados exigem regras próprias antes de contabilizar." },
  { id: "dp_folha_bruta", titulo: "Folha bruta do DP", descricao: "Despesa de salários contra salários a pagar." },
  { id: "dp_descontos_inss", titulo: "INSS descontado do empregado", descricao: "Reduz salários a pagar e credita INSS a recolher; não inclui INSS patronal." },
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
  onSalvarPreLancamentos: (preLancamentos: PreLancamentoContabil[]) => void;
  onContabilizar: (referencias: string[]) => Promise<boolean>;
}> = ({ cnpj, regime, workspaceCarregado, contas, mapeamentos, onSalvarMapeamentos, preLancamentos, onSalvarPreLancamentos, onContabilizar }) => {
  const [desde, setDesde] = useState(competenciaAtual);
  const [ate, setAte] = useState(competenciaAtual);
  const [dados, setDados] = useState<LoteOrigens>({ documentos: [], folhas: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [mensagemPrevia, setMensagemPrevia] = useState("");
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
      setDados({ documentos: [], folhas: [] });
      setErro("Selecione ou cadastre uma empresa autorizada com CNPJ válido.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const query = new URLSearchParams({ cnpj: cnpjNormalizado, desde, ate });
      const response = await fetch(`/api/revisao/origens?${query}`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Não foi possível ler as origens persistidas.");
      setDados({ documentos: Array.isArray(result.documentos) ? result.documentos : [], folhas: Array.isArray(result.folhas) ? result.folhas : [] });
      setAtualizadoEm(new Date().toLocaleString("pt-BR"));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao consultar as origens.");
    } finally {
      setCarregando(false);
    }
  }, [cnpjNormalizado, cnpj, desde, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const totaisFiscal = useMemo(() => {
    const resumo = {
      entrada: { total: 0, autorizadas: 0, pendentes: 0, canceladas: 0, valorBruto: 0, valorBrutoIncompletos: 0, impostos: {} as Record<string, { total: number; incompletos: number }> },
      saida: { total: 0, autorizadas: 0, pendentes: 0, canceladas: 0, valorBruto: 0, valorBrutoIncompletos: 0, impostos: {} as Record<string, { total: number; incompletos: number }> },
    };
    for (const tributo of camposTributariosFiscal) {
      for (const grupo of [resumo.entrada, resumo.saida]) grupo.impostos[tributo.campo] = { total: 0, incompletos: 0 };
    }
    for (const doc of dados.documentos) {
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
  }, [dados.documentos]);

  const contasAnaliticas = useMemo(() => contas.filter((conta) => conta.tipo === "analitica"), [contas]);
  const contaNome = (codigo: string) => contasAnaliticas.find((conta) => conta.codigo === codigo)?.descricao || "Conta não encontrada no plano atual";
  const previaContabilDP = useMemo<EstadoPreviaDP>(() => {
    const partidas: PreviaPartidaDP[] = [];
    const pendencias: EstadoPreviaDP["pendencias"] = [];
    const porOrigem = new Map<OrigemMapeadaContabil, MapeamentoOrigemContabil>(mapeamentos.map((item) => [item.origem, item]));
    const origens = [
      { campo: "folhaBruta", origem: "dp_folha_bruta" as const, titulo: "Folha bruta" },
      { campo: "descontosINSS", origem: "dp_descontos_inss" as const, titulo: "INSS descontado do empregado" },
      { campo: "descontosIRRF", origem: "dp_descontos_irrf" as const, titulo: "IRRF descontado" },
      { campo: "fgts", origem: "dp_fgts" as const, titulo: "FGTS informado pelo DP" },
    ];
    const folhaMaisRecentePorCompetencia = new Map<string, ResumoFolha>();
    for (const folha of [...dados.folhas].sort((a, b) => String(b.atualizadoEm || b.calculadoEm || b.recebidoEm).localeCompare(String(a.atualizadoEm || a.calculadoEm || a.recebidoEm)))) {
      if (!folhaMaisRecentePorCompetencia.has(folha.competencia)) folhaMaisRecentePorCompetencia.set(folha.competencia, folha);
    }
    for (const folha of folhaMaisRecentePorCompetencia.values()) {
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
        const valor = valores[origem.campo] as number;
        if (valor < 0) { incompleta = true; break; }
        if (valor === 0) continue;
        const mapeamento = porOrigem.get(origem.origem);
        const debitoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaDebitoCodigo));
        const creditoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaCreditoCodigo));
        if (!mapeamento || !debitoExiste || !creditoExiste || mapeamento.contaDebitoCodigo === mapeamento.contaCreditoCodigo) {
          pendencias.push({ competencia: folha.competencia, motivo: `Mapeamento válido de débito e crédito pendente para ${origem.titulo}.` });
          incompleta = true;
          break;
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
  }, [dados.folhas, mapeamentos, contasAnaliticas, cnpjNormalizado]);

  const previaContabilFiscal = useMemo<EstadoPreviaFiscal>(() => {
    const partidas: PreviaPartidaFiscal[] = [];
    const pendencias: EstadoPreviaFiscal["pendencias"] = [];
    const porOrigem = new Map<OrigemMapeadaContabil, MapeamentoOrigemContabil>(mapeamentos.map((item) => [item.origem, item]));
    const camposTributarios = ["valorIcms", "valorIpi", "valorPis", "valorCofins", "valorIss"];
    for (const doc of dados.documentos) {
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
      if (!Number.isFinite(valor) || valor <= 0 || doc.dadosTributariosDisponiveis !== true || camposTributarios.some((campo) => typeof doc[campo] !== "number" || !Number.isFinite(doc[campo]) || doc[campo] !== 0)) {
        pendencias.push({ competencia, motivo: "Valor inválido, composição tributária incompleta ou tributo destacado. Revise o XML e faça a classificação fiscal antes de lançar." });
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
  }, [dados.documentos, mapeamentos, contasAnaliticas, cnpjNormalizado]);

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

  const contabilizarPendentes = async () => {
    const todosPendentes = preLancamentos.filter((item) => item.status === "pendente_conferencia");
    const pendentes = todosPendentes.filter((item) => referenciasElegiveis.has(item.referenciaOrigem));
    if (!pendentes.length) return;
    const bloqueados = todosPendentes.length - pendentes.length;
    const confirmado = window.confirm(`Conferiu os ${pendentes.length} pré-lançamento(s) elegíveis desta empresa e período? ${bloqueados ? `${bloqueados} rascunho(s) não atende(m) mais à prévia carregada e ficará(ão) bloqueado(s). ` : ""}A confirmação contabiliza apenas os elegíveis e atualiza o balancete após salvar no banco.`);
    if (!confirmado) return;
    setMensagemPrevia("Salvando os lançamentos aprovados no banco permanente…");
    const persistido = await onContabilizar(pendentes.map((item) => item.referenciaOrigem));
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
        <button type="button" onClick={() => void carregar()} disabled={carregando || !workspaceCarregado} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-semibold text-slate-600">Competência inicial<input type="month" value={desde} max={ate} onChange={(event) => setDesde(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Competência final<input type="month" value={ate} min={desde} onChange={(event) => setAte(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        {atualizadoEm && <span className="text-xs text-slate-500">Consultado em {atualizadoEm}</span>}
      </section>

      {erro && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}

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
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>{preLancamentos.filter((item) => item.status === "pendente_conferencia" && referenciasElegiveis.has(item.referenciaOrigem)).length} pendente(s) elegível(is), {preLancamentos.filter((item) => item.status === "pendente_conferencia" && !referenciasElegiveis.has(item.referenciaOrigem)).length} bloqueado(s) para revalidação e {preLancamentos.filter((item) => item.status === "contabilizado").length} contabilizado(s) no workspace desta empresa.</strong>
              {preLancamentos.some((item) => item.status === "pendente_conferencia" && referenciasElegiveis.has(item.referenciaOrigem)) && <button type="button" onClick={contabilizarPendentes} disabled={carregando || !workspaceCarregado} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Conferir e contabilizar elegíveis</button>}
            </div>
            <p className="mt-2">A contabilização requer confirmação do contador. Cada referência só pode ser lançada uma vez. Rascunhos bloqueados são mantidos no banco até nova validação dos dados de origem.</p>
          </div>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Notas fiscais no período" value={String(totaisFiscal.entrada.total + totaisFiscal.saida.total)} detail={`${totaisFiscal.entrada.total} entradas • ${totaisFiscal.saida.total} saídas`} />
        <Metric title="Resumos de folha recebidos" value={String(dados.folhas.length)} detail="Totais agregados por competência" />
        <Metric title="Lançamentos automáticos" value="0" detail="Aguardam mapeamento e aprovação" />
        <Metric title="Status da conferência" value="Pendente" detail="Revisão do contador necessária" />
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
          {regime === "Simples Nacional" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>DAS unificado pendente de integração.</strong> A apuração exige receita segregada por atividade/anexo, competência e demais informações validadas no PGDAS-D. Os valores destacados nas notas não substituem o DAS.</p>}
          {(regime === "Lucro Presumido" || regime === "Lucro Real") && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Os valores de ICMS, ISS, PIS e COFINS abaixo são apenas valores destacados nos documentos recebidos. Não representam saldo fiscal a recolher. IRPJ e CSLL dependem da apuração e bases próprias do regime, ainda não recebidas nesta integração.</p>}
          {!regime && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Informe e confira o regime tributário da empresa antes de preparar qualquer apuração.</p>}
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Tributo</th><th className="px-3 py-2 text-right">Notas de entrada</th><th className="px-3 py-2 text-right">Notas de saída</th><th className="px-3 py-2">Situação</th></tr></thead><tbody>
            {([ ["ICMS", "valorIcms"], ["PIS", "valorPis"], ["COFINS", "valorCofins"], ["ISS", "valorIss"] ] as const).map(([titulo, campo]) => {
              const totalDocs = totaisFiscal.entrada.autorizadas + totaisFiscal.saida.autorizadas;
              const incompletos = entrada.incompletos + saida.incompletos;
              const status = !totalDocs ? "Sem documentos autorizados" : incompletos ? `${incompletos} documento(s) sem valor tributário; conferência incompleta` : "Valores de origem disponíveis; apuração não realizada";
              const display = (grupo: typeof totaisFiscal.entrada) => !grupo.autorizadas ? "—" : grupo.impostos[campo].incompletos === grupo.autorizadas ? "Não apurado" : `${dinheiro(grupo.impostos[campo].total)}${grupo.impostos[campo].incompletos ? "*" : ""}`;
              return <tr key={titulo} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{titulo}</td><td className="px-3 py-2 text-right tabular-nums">{display(totaisFiscal.entrada)}</td><td className="px-3 py-2 text-right tabular-nums">{display(totaisFiscal.saida)}</td><td className="px-3 py-2 text-xs text-amber-800">{status}</td></tr>;
            })}
            {(["IRPJ", "CSLL"] as const).map((titulo) => <tr key={titulo} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{titulo}</td><td className="px-3 py-2 text-right">Não apurado</td><td className="px-3 py-2 text-right">Não apurado</td><td className="px-3 py-2 text-xs text-amber-800">Base de cálculo e apuração do regime não recebidas</td></tr>)}
          </tbody></table></div>
          <p className="text-[11px] text-slate-500">Nenhum valor ausente é tratado como zero. Vencimentos, saldo a recolher e links de emissão só serão preenchidos quando houver integração e dados oficiais suficientes.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ArrowDownToLine className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Documentos do Fiscal</h2></div>
        {dados.documentos.length === 0 ? <Empty text="Nenhuma nota fiscal persistida para a empresa e o período selecionados." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">Número / chave</th><th className="px-4 py-3">Participante</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Situação</th></tr></thead>
            <tbody>{dados.documentos.map((doc, index) => <tr key={`${texto(doc.chaveAcesso || doc.id)}-${index}`} className="border-t border-slate-100">
              <td className="px-4 py-3 font-semibold">{texto(doc.tipo)}</td><td className="px-4 py-3">{texto(doc.dataEmissao || doc.emissao)}</td>
              <td className="max-w-64 truncate px-4 py-3 font-mono text-xs">{texto(doc.numero || doc.numeroNota || doc.chaveAcesso || doc.id)}</td>
              <td className="max-w-64 truncate px-4 py-3">{texto(doc.destinatario || doc.remetente || doc.participante || doc.nomeParticipante)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{dinheiro(doc.valorTotal ?? doc.valor ?? doc.total)}</td>
              <td className={`px-4 py-3 ${documentoCancelado(doc) ? "font-semibold text-red-700" : documentoAutorizado(doc) ? "font-semibold text-emerald-700" : "text-amber-800"}`}>
                <div>{situacaoDocumento(doc)}</div>
                {Array.isArray(doc.eventosSefaz) && doc.eventosSefaz.length > 0 && <div className="mt-1 text-[11px] font-normal text-slate-500">{doc.eventosSefaz.length} evento(s) SEFAZ</div>}
              </td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ClipboardCheck className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Resumos agregados do DP</h2></div>
        {dados.folhas.length === 0 ? <Empty text="Nenhum resumo de folha persistido para a empresa e o período selecionados." /> : (
          <div className="divide-y divide-slate-100">{dados.folhas.map((folha) => <article key={`${folha.competencia}-${folha.calculadoEm}`} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Competência {folha.competencia}</h3><span className="text-xs text-slate-500">Recebido em {new Date(folha.recebidoEm).toLocaleString("pt-BR")}</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(folha.resumo || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{key}</div><div className="mt-1 font-bold text-slate-900">{key === "quantidadeFuncionarios" ? texto(value) : dinheiro(value)}</div></div>)}</div>
            <p className="mt-3 text-xs text-amber-800">Recebido para revisão; valores nulos continuam “não apurados” e não são contabilizados como zero.</p>
          </article>)}</div>
        )}
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">A integração preserva os dados por CNPJ. Antes de gerar partidas, é necessário revisar documento, competência, natureza, regime e contas contábeis; não há transmissão oficial nesta etapa.</div>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; detail: string }> = ({ title, value, detail }) => <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold text-slate-500">{title}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="p-5 text-sm text-slate-500">{text}</p>;
