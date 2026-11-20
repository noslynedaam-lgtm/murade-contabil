import type { RotaEscrituracao } from "../types";
// Extrato e conciliação bancária (Gestão contábil): o extrato importado (OFX, CSV ou Excel) fica GUARDADO no banco do
// servidor, com o que foi conciliado ou lançado. Concilia vários de uma vez e usa as regras "quando o histórico tiver X,
// usar a conta Y". O Robô da Conciliação Bancária prepara as sugestões; quem aceita é a pessoa. Nada vira definitivo sem aprovação.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContaPlano, LancamentoContabil, RegraConciliacao } from "../types";
import { conciliar, lerCSVExtrato, lerHtmlExtrato, lerOFX, lerXlsxExtrato, regraQueSeAplica, sugerirContraPartida, type MovimentoExtrato } from "../utils/extratoBancario";
import { moedaContabil } from "../utils/livrosContabeis";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";

type Rota = RotaEscrituracao;
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

export const ConciliacaoBancariaPainel: React.FC<{ contas: ContaPlano[]; lancamentos: LancamentoContabil[]; regras: RegraConciliacao[]; periodo: string; podeGravar: boolean; onRota: Rota }> = ({ contas, lancamentos, regras, periodo, podeGravar, onRota }) => {
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const analiticas = useMemo(() => contas.filter((c) => c.tipo === "analitica"), [contas]);
  const analiticasSet = useMemo(() => new Set(analiticas.map((c) => c.codigo)), [analiticas]);
  const [banco, setBanco] = useState("");
  const [lidos, setLidos] = useState<{ movimentos: MovimentoExtrato[]; erros: string[]; formato: string; arquivo: string } | null>(null);
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

  const ler = async (arquivo?: File | null) => {
    if (!arquivo) return;
    try { const r = await lerArquivoExtrato(arquivo); setLidos({ ...r, arquivo: arquivo.name }); setMsg(`${r.movimentos.length} movimento(s) lido(s) do arquivo ${r.formato}. Confira e clique em Guardar extrato.`); }
    catch { setMsg("Não consegui ler o arquivo. Use OFX, CSV ou XLSX."); }
  };
  const guardar = async () => {
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
  const lancarMarcados = async () => {
    const itens = pendentes.filter((m) => marcados.has(m.fitid)).map((m) => ({ fitid: m.fitid, contaContrapartida: contraLote || sugestaoTela(m)?.conta || "" }));
    if (!itens.length || itens.some((i) => !i.contaContrapartida)) { setMsg("Marque os movimentos e escolha a contrapartida (ou deixe a sugestão de cada um)."); return; }
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
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold text-slate-900">Importar extrato bancário (OFX, CSV ou Excel)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Conta do banco no plano<select data-campo="extrato-conta" value={banco} onChange={(e) => setBanco(e.target.value)} className="max-w-[260px] rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Arquivo<input data-campo="extrato-arquivo" type="file" accept=".ofx,.OFX,.csv,.txt,.xlsx,.xls" onChange={(e) => void ler(e.target.files?.[0])} /></label>
          <button type="button" disabled={!podeGravar || !lidos?.movimentos.length || !banco} onClick={() => void guardar()} className="rounded bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Guardar extrato</button>
        </div>
        {msg && <p className="mt-1" role="status">{msg}</p>}
        {lidos?.erros.length ? <ul className="mt-1 max-h-24 overflow-y-auto text-amber-800">{lidos.erros.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
        <p className="mt-2 text-slate-600">O arquivo é lido no seu navegador e o extrato fica guardado no servidor desta empresa: importar o mesmo arquivo de novo não duplica. CSV/Excel precisam das colunas Data e Valor (ou Crédito e Débito) e Histórico. Arquivos CNAB não são lidos.</p>
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
