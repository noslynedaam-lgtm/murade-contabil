import type { RotaEscrituracao } from "../types";
// Extrato e conciliação bancária (Gestão contábil): o extrato importado (OFX, CSV, Excel ou PDF com texto) fica GUARDADO no banco do
// servidor, com o que foi conciliado ou lançado. Concilia vários de uma vez e usa as regras "quando o histórico tiver X,
// usar a conta Y". O Robô da Conciliação Bancária prepara as sugestões; quem aceita é a pessoa. Nada vira definitivo sem aprovação.
// PDF: é lido NO SERVIDOR (src/server/extratoPdfServidor.ts) e só entra se saldo inicial + entradas − saídas = saldo final; PDF escaneado
// (imagem) não entra e a tela pede o OFX. O Robô Conferidor dos Extratos em PDF confere depois se nada sumiu e se falta extrato entre meses.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContaPlano, LancamentoContabil, RegraConciliacao } from "../types";
import { conciliar, lancamentoCasaComMovimento, lerCSVExtrato, lerHtmlExtrato, lerOFX, lerXlsxExtrato, regraQueSeAplica, sugerirContraPartida, type MovimentoExtrato } from "../utils/extratoBancario";
import { moedaContabil } from "../utils/livrosContabeis";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { useRevisor } from "./RevisorPainel";
import { revisarConciliacaoLancar } from "../utils/revisorContabil";

type Rota = RotaEscrituracao;
type ConferenciaPdf = { saldoInicialCentavos: number | null; saldoFinalCentavos: number | null; entradasCentavos: number; saidasCentavos: number; calculadoCentavos: number | null; bate: boolean; saldosConferidos: number; saldoInicialCalculado?: boolean };
type LeituraPdf = { movimentos: MovimentoExtrato[]; erros: string[]; motivo: string; banco: string | null; periodo: { de: string; ate: string } | null; conferencia: ConferenciaPdf; semTexto: boolean; paginas: number; pdfBase64: string };
type AndamentoPdf = { inicio: number; fase: string; feito: number; total: number; fim?: number; resultado?: string; erro?: string; achados?: Array<{ cnpj: string; contaBanco: string; nivel: string; texto: string }> };
const lerComoBase64 = (arquivo: File) => new Promise<string>((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result || "").replace(/^data:[^,]*,/, "")); r.onerror = () => falha(r.error); r.readAsDataURL(arquivo); });
const dataBr = (d: string) => d.split("-").reverse().join("/");
type Guardado = MovimentoExtrato & { situacao: "pendente" | "conciliado" | "lancado"; lancamentoId: string | null; sugestaoConta: string | null; sugestaoLancamentoId: string | null; sugestaoMotivo: string | null };

/** Lê o arquivo no navegador: OFX, CSV/TXT, XLSX ou a planilha HTML que alguns bancos salvam como .xls. */
export async function lerArquivoExtrato(arquivo: File): Promise<{ movimentos: MovimentoExtrato[]; erros: string[]; formato: string }> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".ofx")) return { ...lerOFX(await arquivo.text()), formato: "OFX" };
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return { ...lerCSVExtrato(await arquivo.text()), formato: "CSV" };
  if (nome.endsWith(".xlsx")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
    const planilhas = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (!planilhas.length) return { movimentos: [], erros: ["Não achei planilha dentro do arquivo XLSX."], formato: "XLSX" };
    const shared = zip.file("xl/sharedStrings.xml") ? await zip.file("xl/sharedStrings.xml")!.async("string") : "";
    return { ...lerXlsxExtrato(await zip.file(planilhas[0])!.async("string"), shared), formato: "XLSX" };
  }
  if (nome.endsWith(".xls")) {
    const texto = await arquivo.text();
    if (/<table/i.test(texto)) return { ...lerHtmlExtrato(texto), formato: "XLS" };
    return { movimentos: [], erros: ["Este .xls é do Excel antigo (binário). Abra no Excel e salve como .xlsx ou .csv, e importe de novo."], formato: "XLS" };
  }
  const texto = await arquivo.text();
  if (/<OFX>|<STMTTRN>/i.test(texto)) return { ...lerOFX(texto), formato: "OFX" };
  return { ...lerCSVExtrato(texto), formato: "CSV" };
}

export const ConciliacaoBancariaPainel: React.FC<{ contas: ContaPlano[]; lancamentos: LancamentoContabil[]; regras: RegraConciliacao[]; periodo: string; podeGravar: boolean; onRota: Rota; fechadas?: string[]; cnpj?: string }> = ({ contas, lancamentos, regras, periodo, podeGravar, onRota, fechadas = [], cnpj = "" }) => {
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const analiticas = useMemo(() => contas.filter((c) => c.tipo === "analitica"), [contas]);
  const analiticasSet = useMemo(() => new Set(analiticas.map((c) => c.codigo)), [analiticas]);
  const [banco, setBanco] = useState("");
  const [lidos, setLidos] = useState<{ movimentos: MovimentoExtrato[]; erros: string[]; formato: string; arquivo: string } | null>(null);
  const [pdf, setPdf] = useState<(LeituraPdf & { arquivo: string }) | null>(null);
  const [lendoPdf, setLendoPdf] = useState(false);
  const [andamentoPdf, setAndamentoPdf] = useState<AndamentoPdf | null>(null);
  const [movs, setMovs] = useState<Guardado[]>([]);
  const [resumo, setResumo] = useState<Array<{ contaBanco: string; pendentes: number; conciliados: number; lancados: number; comSugestao: number }>>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [contraLote, setContraLote] = useState("");
  const [msg, setMsg] = useState("");
  const [regraTexto, setRegraTexto] = useState(""); const [regraConta, setRegraConta] = useState(""); const [regraSentido, setRegraSentido] = useState<"entrada" | "saida" | "ambos">("ambos");

  const rotaRef = useRef(onRota); rotaRef.current = onRota;
  const carregar = useCallback(async () => {
    const r = await rotaRef.current("GET", `extratos${banco ? `?contaBanco=${encodeURIComponent(banco)}&competencia=${encodeURIComponent(periodo)}` : ""}`);
    if (r.ok) { setMovs(r.corpo?.movimentos || []); setResumo(r.corpo?.resumo || []); setMarcados(new Set()); }
  }, [banco, periodo]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Baixa das guias do aplicativo do cliente no Fiscal pelo extrato (só leitura; quem baixa é o Fiscal, só quando casa com uma guia).
  const [baixaGuias, setBaixaGuias] = useState<{ enviados: number; guiasBaixadas: number } | null>(null);
  useEffect(() => { void rotaRef.current("GET", "extratos/baixa-guias").then((r) => { if (r.ok) setBaixaGuias({ enviados: Number(r.corpo?.enviados || 0), guiasBaixadas: Number(r.corpo?.guiasBaixadas || 0) }); }).catch(() => undefined); }, [movs]);

  const ler = async (arquivo?: File | null) => {
    if (!arquivo) return;
    setPdf(null); setLidos(null);
    if (arquivo.name.toLowerCase().endsWith(".pdf") || arquivo.type === "application/pdf") { await lerPdf(arquivo); return; }
    try { const r = await lerArquivoExtrato(arquivo); setLidos({ ...r, arquivo: arquivo.name }); setMsg(`${r.movimentos.length} movimento(s) lido(s) do arquivo ${r.formato}. Confira e clique em Guardar extrato.`); }
    catch { setMsg("Não consegui ler o arquivo. Use OFX, CSV, XLSX ou PDF."); }
  };
  // PDF: o servidor lê e confere (nada é gravado); só depois do "Guardar extrato" ele lê e confere de novo e guarda.
  const lerPdf = async (arquivo: File) => {
    if (arquivo.size > 8 * 1024 * 1024) { setMsg("O PDF precisa ter até 8 MB."); return; }
    setLendoPdf(true); setMsg("Lendo o PDF e conferindo o saldo…");
    try {
      const pdfBase64 = await lerComoBase64(arquivo);
      const r = await onRota("POST", "extratos/ler-pdf", { pdfBase64 });
      const c = r.corpo || {};
      if (!c.conferencia) { setMsg(String(c.motivo || "Não consegui ler o PDF agora.")); return; }
      setPdf({ movimentos: c.movimentos || [], erros: c.erros || [], motivo: String(c.motivo || ""), banco: c.banco ?? null, periodo: c.periodo ?? null, conferencia: c.conferencia, semTexto: Boolean(c.semTexto), paginas: Number(c.paginas || 0), pdfBase64, arquivo: arquivo.name });
      setMsg(c.conferencia.bate && (c.movimentos || []).length ? `${c.movimentos.length} movimento(s) lido(s) do PDF${c.banco ? ` (${c.banco})` : ""} e o saldo fecha. Escolha a conta do banco e clique em Guardar extrato.` : "");
    } catch { setMsg("Não consegui ler o PDF. Baixe o extrato em OFX no internet banking e importe o OFX."); }
    finally { setLendoPdf(false); }
  };
  const guardarPdf = async () => {
    if (!pdf?.conferencia.bate || !pdf.movimentos.length || !banco) { setMsg("Escolha a conta do banco no plano e um PDF que fechou com o saldo."); return; }
    const r = await onRota("POST", "extratos/pdf", { contaBanco: banco, arquivo: pdf.arquivo, pdfBase64: pdf.pdfBase64 });
    if (r.ok) { setPdf(null); setMsg(String(r.corpo?.mensagem || "Extrato em PDF guardado.")); await carregar(); }
    else setMsg(String(r.corpo?.motivo || "O extrato em PDF não entrou."));
  };
  // Robô Conferidor dos Extratos em PDF: "Rodar agora" com barra (só as empresas da sua sessão).
  const rodarConferidorPdf = async () => {
    try {
      const r = await fetch("/api/extratos-pdf/conferir-agora", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
      const c = await r.json().catch(() => ({}));
      if (!r.ok || !c.progresso) { setMsg(String(c.motivo || "Não consegui iniciar a conferência agora.")); return; }
      setAndamentoPdf(c.progresso);
      for (let i = 0; i < 240; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        const g = await fetch("/api/extratos-pdf/conferir-agora", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } }).then((x) => x.json()).catch(() => null);
        if (g?.progresso) setAndamentoPdf(g.progresso);
        if (!g?.progresso || g.progresso.fim) break;
      }
    } catch { setMsg("Não consegui falar com o servidor agora. Tente de novo."); }
  };
  const guardar = async () => {
    if (pdf) { await guardarPdf(); return; }
    if (!lidos?.movimentos.length || !banco) { setMsg("Escolha a conta do banco no plano e um arquivo com movimentos."); return; }
    const r = await onRota("POST", "extratos", { contaBanco: banco, arquivo: lidos.arquivo, movimentos: lidos.movimentos });
    if (r.ok) { setLidos(null); setMsg(String(r.corpo?.mensagem || "Extrato guardado.")); await carregar(); }
  };
  const pendentes = movs.filter((m) => m.situacao === "pendente");
  const feitos = movs.filter((m) => m.situacao !== "pendente");
  const usadosIds = new Set(feitos.map((m) => m.lancamentoId).filter(Boolean) as string[]);
  const semExtrato = useMemo(() => (banco ? conciliar(movs, lancamentos, banco, periodo).lancamentosSemExtrato.filter((l) => !usadosIds.has(l.id)) : []), [movs, lancamentos, banco, periodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugestaoTela = (m: Guardado) => {
    if (m.sugestaoLancamentoId || m.sugestaoConta) return { conta: m.sugestaoConta, lancamento: m.sugestaoLancamentoId, motivo: m.sugestaoMotivo || "Sugestão do robô." };
    const r = regraQueSeAplica(m, regras as any, banco, analiticasSet);
    if (r) return { conta: r.contaCodigo, lancamento: null, motivo: `Regra: o histórico tem "${r.contem}" (o robô grava na próxima rodada).` };
    const s = sugerirContraPartida(m, banco, lancamentos);
    return s ? { conta: s.codigo, lancamento: null, motivo: s.motivo } : null;
  };
  const alternar = (fitid: string) => setMarcados((atual) => { const n = new Set(atual); if (n.has(fitid)) n.delete(fitid); else n.add(fitid); return n; });
  const aceitar = async () => {
    const fitids = pendentes.filter((m) => marcados.has(m.fitid) && (m.sugestaoConta || m.sugestaoLancamentoId)).map((m) => m.fitid);
    if (!fitids.length) { setMsg("Marque movimentos que já têm sugestão gravada pelo robô."); return; }
    const r = await onRota("POST", "extratos/aceitar-sugestoes", { contaBanco: banco, fitids });
    if (r.ok) await carregar();
  };
  // REVISOR antes de lançar: contrapartida que não existe, sintética ou igual ao banco, mês fechado, mesma contrapartida para entrada e
  // saída e movimento que já tem lançamento aprovado (lançar de novo duplica).
  const revisor = useRevisor();
  const lancarMarcados = async () => {
    const marcadosPend = pendentes.filter((m) => marcados.has(m.fitid));
    const itens = marcadosPend.map((m) => ({ fitid: m.fitid, contaContrapartida: contraLote || sugestaoTela(m)?.conta || "" }));
    if (!itens.length || itens.some((i) => !i.contaContrapartida)) { setMsg("Marque os movimentos e escolha a contrapartida (ou deixe a sugestão de cada um)."); return; }
    const revisao = revisarConciliacaoLancar(marcadosPend.map((m) => ({ fitid: m.fitid, dataISO: m.dataISO, valorCentavos: m.valorCentavos, memo: m.memo, contrapartida: contraLote || sugestaoTela(m)?.conta || "" })), { contas, contaBanco: banco, lancamentos, fechadas, contrapartidaUnica: Boolean(contraLote) }, lancamentoCasaComMovimento);
    if (!revisor.conferir(revisao, { acao: "conciliacao_lancar", cnpj, competencia: periodo }, { salvar: () => lancarDireto(itens) })) return;
    await lancarDireto(itens);
  };
  const lancarDireto = async (itens: Array<{ fitid: string; contaContrapartida: string }>) => {
    const r = await onRota("POST", "extratos/lancar", { contaBanco: banco, itens });
    if (r.ok) await carregar();
  };
  const desfazer = async (m: Guardado) => { const r = await onRota("POST", "extratos/desfazer", { contaBanco: banco, fitids: [m.fitid] }); if (r.ok) await carregar(); };
  const criarRegra = async () => {
    const r = await onRota("POST", "regras-conciliacao", { contem: regraTexto, contaCodigo: regraConta, sentido: regraSentido });
    if (r.ok) { setRegraTexto(""); setRegraConta(""); }
  };
  const tirarRegra = async (r: RegraConciliacao) => {
    if (!await pedir({ titulo: "Remover esta regra?", oQue: `a regra "quando o histórico tiver ${r.contem}, usar a conta ${r.contaCodigo}"`, consequencias: ["Só esta regra sai.", "Movimentos já conciliados ou lançados não mudam."], rotuloFinal: "Sim, remover" })) return;
    await onRota("DELETE", `regras-conciliacao/${encodeURIComponent(r.id)}`);
  };
  const nome = (c: string | null) => (c ? `${c} ${contas.find((x) => x.codigo === c)?.descricao || ""}` : "");

  return (
    <div className="space-y-3 text-xs">
      {revisor.painel}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Importar extrato bancário (OFX, CSV, Excel ou PDF)</h3>
        {baixaGuias && baixaGuias.enviados > 0 && <p data-campo="extrato-baixa-guias" className="mb-2 rounded bg-emerald-50 p-2 text-emerald-900">Guias do aplicativo do cliente (Murad Fiscal): {baixaGuias.enviados} movimento(s) conferido(s), {baixaGuias.guiasBaixadas} guia(s) dada(s) como paga(s) pelo extrato. Grátis; o que serve para duas guias fica para o contador.</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Conta do banco no plano<select data-campo="extrato-conta" value={banco} onChange={(e) => setBanco(e.target.value)} className="max-w-[260px] rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Arquivo<input data-campo="extrato-arquivo" type="file" accept=".ofx,.OFX,.csv,.txt,.xlsx,.xls,.pdf,.PDF,application/pdf" onChange={(e) => void ler(e.target.files?.[0])} /></label>
          <button type="button" data-campo="extrato-guardar" disabled={!podeGravar || !banco || lendoPdf || (pdf ? !(pdf.conferencia.bate && pdf.movimentos.length) : !lidos?.movimentos.length)} onClick={() => void guardar()} className="min-h-10 rounded bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Guardar extrato</button>
        </div>
        {msg && <p className="mt-1" role="status">{msg}</p>}
        {lidos?.erros.length ? <ul className="mt-1 max-h-24 overflow-y-auto text-amber-800">{lidos.erros.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
        {pdf && <div data-campo="extrato-pdf-conferencia" className={`mt-2 rounded-lg border p-2 ${pdf.conferencia.bate && pdf.movimentos.length ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role={pdf.conferencia.bate ? "status" : "alert"}>
          <p className="font-bold">{pdf.semTexto ? "Este PDF não entra: é uma imagem (escaneado)." : pdf.conferencia.bate && pdf.movimentos.length ? `PDF conferido${pdf.banco ? ` — ${pdf.banco}` : ""}: o saldo fecha.` : "Este extrato em PDF não entra: a conferência do saldo não fechou."}</p>
          {!pdf.semTexto && <p className="mt-0.5">Saldo inicial {pdf.conferencia.saldoInicialCentavos === null ? "não achado" : moedaContabil(pdf.conferencia.saldoInicialCentavos)}{pdf.conferencia.saldoInicialCalculado ? " (calculado pelo saldo do 1º dia)" : ""} + entradas {moedaContabil(pdf.conferencia.entradasCentavos)} − saídas {moedaContabil(pdf.conferencia.saidasCentavos)} = {pdf.conferencia.calculadoCentavos === null ? "—" : moedaContabil(pdf.conferencia.calculadoCentavos)}; saldo final do extrato {pdf.conferencia.saldoFinalCentavos === null ? "não achado" : moedaContabil(pdf.conferencia.saldoFinalCentavos)}.{pdf.periodo ? ` Período: ${dataBr(pdf.periodo.de)} a ${dataBr(pdf.periodo.ate)}.` : ""} {pdf.movimentos.length ? `${pdf.movimentos.length} movimento(s).` : ""}</p>}
          {pdf.motivo && <p className="mt-0.5">{pdf.motivo}</p>}
          {!pdf.conferencia.bate && pdf.erros.length > 1 && <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4">{pdf.erros.slice(1, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {(!pdf.conferencia.bate || pdf.semTexto) && <p className="mt-1 font-semibold">O que fazer: no internet banking do banco, baixe o extrato do mesmo período em OFX (procure "Exportar" ou "Salvar como OFX/Money") e importe o arquivo .ofx aqui.</p>}
        </div>}
        <p className="mt-2 text-slate-600">OFX, CSV e Excel são lidos no seu navegador; o PDF é lido no servidor e só entra se saldo inicial + entradas − saídas = saldo final (PDF escaneado não entra: use o OFX). O extrato fica guardado no servidor desta empresa: importar o mesmo arquivo de novo não duplica. CSV/Excel precisam das colunas Data e Valor (ou Crédito e Débito) e Histórico. Arquivos CNAB não são lidos.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" data-campo="extrato-pdf-rodar-agora" disabled={Boolean(andamentoPdf && !andamentoPdf.fim)} onClick={() => void rodarConferidorPdf()} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50">{andamentoPdf && !andamentoPdf.fim ? "Conferindo…" : "Rodar agora: conferir extratos em PDF"}</button>
          <span className="text-slate-600">O Robô Conferidor dos Extratos em PDF roda sozinho de 6 em 6 horas: confere se os movimentos guardados ainda somam o saldo de cada extrato e se falta extrato entre um mês e outro. Só lê.</span>
        </div>
        {andamentoPdf && !andamentoPdf.fim && <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((andamentoPdf.feito / Math.max(1, andamentoPdf.total)) * 100)} aria-label="Andamento da conferência dos extratos em PDF">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-2 rounded-full bg-blue-700 transition-all" style={{ width: `${Math.max(5, Math.round((andamentoPdf.feito / Math.max(1, andamentoPdf.total)) * 100))}%` }} /></div>
          <p className="mt-0.5 text-[11px] text-slate-600">{andamentoPdf.fase}: {andamentoPdf.feito} de {andamentoPdf.total} conta(s)…</p>
        </div>}
        {andamentoPdf?.fim && <div className={`mt-2 rounded-lg border p-2 ${andamentoPdf.erro || (andamentoPdf.achados || []).length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} role="status">
          <p>{andamentoPdf.erro ? `A conferência falhou: ${andamentoPdf.erro}` : andamentoPdf.resultado}</p>
          {(andamentoPdf.achados || []).length > 0 && <ul className="mt-1 list-disc pl-4">{(andamentoPdf.achados || []).slice(0, 20).map((a, i) => <li key={i}>{a.texto}</li>)}</ul>}
        </div>}
        {resumo.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{resumo.map((r) => <li key={r.contaBanco} className="rounded border px-2 py-1"><strong>{nome(r.contaBanco)}</strong>: {r.pendentes} pendente(s) ({r.comSugestao} com sugestão), {r.conciliados} conciliado(s), {r.lancados} lançado(s)</li>)}</ul>}
      </section>

      {banco && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Movimentos sem conciliação ({pendentes.length}) — {periodo.split("-").reverse().join("/")}</h3>
        {!pendentes.length ? <p>Nenhum movimento pendente neste mês.</p> : <>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => setMarcados(new Set(pendentes.map((m) => m.fitid)))} className="rounded border px-2 py-1 font-bold">Marcar todos</button>
            <button type="button" onClick={() => setMarcados(new Set())} className="rounded border px-2 py-1">Desmarcar</button>
            <button type="button" data-campo="conciliacao-aceitar" disabled={!podeGravar || !marcados.size} onClick={() => void aceitar()} className="rounded bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Aceitar sugestões dos marcados ({marcados.size})</button>
            <label className="grid gap-1">ou lançar os marcados contra<select value={contraLote} onChange={(e) => setContraLote(e.target.value)} className="max-w-[220px] rounded border px-1 py-0.5"><option value="">a sugestão de cada um</option>{analiticas.filter((c) => c.codigo !== banco).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
            <button type="button" disabled={!podeGravar || !marcados.size} onClick={() => void lancarMarcados()} className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 font-bold text-blue-900 disabled:opacity-40">Lançar marcados</button>
          </div>
          <div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[640px] text-left"><thead className="sticky top-0 bg-slate-50"><tr><th></th><th>Data</th><th className="text-right">Valor</th><th>Histórico</th><th>Sugestão</th></tr></thead>
            <tbody>{pendentes.map((m) => { const s = sugestaoTela(m); return <tr key={m.fitid} className="border-t">
              <td><input type="checkbox" aria-label="Marcar" checked={marcados.has(m.fitid)} onChange={() => alternar(m.fitid)} /></td>
              <td className="whitespace-nowrap">{m.dataISO.split("-").reverse().join("/")}</td>
              <td className={`whitespace-nowrap text-right font-bold ${m.valorCentavos > 0 ? "text-emerald-700" : "text-rose-700"}`}>{moedaContabil(m.valorCentavos)}</td>
              <td className="max-w-[220px] truncate" title={m.memo}>{m.memo}</td>
              <td>{s ? <span>{s.lancamento ? "Conciliar com lançamento aprovado" : `Conta ${nome(s.conta)}`}<span className="block text-slate-500">{s.motivo}{!m.sugestaoConta && !m.sugestaoLancamentoId ? " (ainda não gravada)" : ""}</span></span> : <span className="text-slate-500">sem sugestão</span>}</td>
            </tr>; })}</tbody></table></div>
        </>}
      </section>}

      {banco && feitos.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Conciliados ou lançados ({feitos.length})</h3>
        <ul className="max-h-60 space-y-1 overflow-y-auto">{feitos.map((m) => <li key={m.fitid} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-1"><span>{m.dataISO.split("-").reverse().join("/")} · {moedaContabil(m.valorCentavos)} · {m.memo} — {m.situacao === "conciliado" ? "conciliado" : "lançado (aguarda ou já teve aprovação)"}</span><button type="button" disabled={!podeGravar} onClick={() => void desfazer(m)} className="rounded border px-2 py-0.5 disabled:opacity-40">Desfazer conciliação</button></li>)}</ul>
        <p className="mt-1 text-slate-600">Desfazer só volta o movimento para pendente; lançamento criado continua e, se precisar, corrige-se por estorno.</p>
      </section>}

      {banco && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Lançamentos do banco sem movimento no extrato ({semExtrato.length})</h3>
        {!semExtrato.length ? <p>Nenhum.</p> : <ul className="space-y-1">{semExtrato.map((l) => <li key={l.id}>{l.data} · {moedaContabil(Math.round(l.valor * 100))} · {l.historico}</li>)}</ul>}
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Regras de conciliação ({regras.length})</h3>
        <p className="text-slate-600">Quando o histórico do extrato tiver o texto, o robô sugere a conta. A regra mais específica (texto maior) vale primeiro.</p>
        <ul className="mt-2 space-y-1">{regras.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1"><span>Quando tiver <strong>"{r.contem}"</strong> ({r.sentido}) → {nome(r.contaCodigo)}</span><button type="button" disabled={!podeGravar} onClick={() => void tirarRegra(r)} className="rounded border border-rose-200 px-2 py-0.5 font-bold text-rose-800 disabled:opacity-40">Remover</button></li>)}</ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Quando o histórico tiver<input data-campo="regra-texto" value={regraTexto} onChange={(e) => setRegraTexto(e.target.value)} maxLength={80} placeholder="TARIFA" className="rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Usar a conta<select value={regraConta} onChange={(e) => setRegraConta(e.target.value)} className="max-w-[220px] rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Sentido<select value={regraSentido} onChange={(e) => setRegraSentido(e.target.value as "entrada" | "saida" | "ambos")} className="rounded border px-2 py-1"><option value="ambos">entrada e saída</option><option value="entrada">só entrada</option><option value="saida">só saída</option></select></label>
          <button type="button" disabled={!podeGravar || regraTexto.trim().length < 3 || !regraConta} onClick={() => void criarRegra()} className="rounded bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Criar regra</button>
        </div>
      </section>
      {dialogo}
    </div>
  );
};
