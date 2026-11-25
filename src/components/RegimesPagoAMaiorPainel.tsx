// Gestão contábil › Regimes e pago a maior: quanto a empresa apurou e pagou nos últimos 12 meses no regime atual, estimativa do Lucro
// Presumido e do Lucro Real com os números da contabilidade, e o recolhimento a maior com a orientação de restituição/compensação.
// A simulação do Simples (tabelas da LC 123/2006) fica no Murad Fiscal (Tabela Tributária): o botão abre lá, sem duplicar as tabelas.
import React, { useCallback, useEffect, useState } from "react";
import type { RotaEscrituracao } from "../types";

const reais = (c: number | null | undefined) => (c === null || c === undefined ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const mesBr = (c: string) => c.split("-").reverse().join("/");

export const RegimesPagoAMaiorPainel: React.FC<{ onRota: RotaEscrituracao }> = ({ onRota }) => {
  const [atividade, setAtividade] = useState("");
  const [dados, setDados] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [conferencia, setConferencia] = useState("");
  const carregar = useCallback(async () => {
    setMsg("Montando a comparação…");
    const r = await onRota("GET", `comparacao-regimes${atividade ? `?atividade=${encodeURIComponent(atividade)}` : ""}`);
    if (r.ok) { setDados(r.corpo); setMsg(""); } else setMsg(String(r.corpo?.motivo || "Não consegui montar agora."));
  }, [onRota, atividade]);
  useEffect(() => { void carregar(); }, [carregar]);
  const conferirAgora = async () => {
    setConferencia("Conferindo…");
    const r = await fetch("/api/comparacao-regimes/conferir-agora", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
    setConferencia(String(r?.resumo || r?.motivo || "Não consegui conferir agora."));
  };
  if (!dados) return <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">{msg || "Carregando…"}</p>;
  const melhor = (dados.estimativas || []).filter((e: any) => e.podeOptar && e.totalCentavos !== null).sort((a: any, b: any) => a.totalCentavos - b.totalCentavos)[0];
  return (
    <div className="space-y-3 text-sm" data-painel="regimes-pago-a-maior">
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">Últimos 12 meses ({mesBr(dados.periodo.de)} a {mesBr(dados.periodo.ate)}) — regime atual: {dados.regimeAtual === "outro" ? "não informado no cadastro" : dados.regimeAtual}</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Receita bruta (contabilidade)</div><div className="font-bold">{reais(dados.receita12Centavos)}</div></div>
          <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Salários e pró-labore (DP)</div><div className="font-bold">{dados.folha12Centavos === null ? "sem dados do DP" : reais(dados.folha12Centavos)}</div></div>
          <div className="rounded-lg bg-slate-50 p-2"><div className="text-[11px] text-slate-500">Resultado contábil</div><div className="font-bold">{reais(dados.resultado12Centavos)}</div></div>
        </div>
        {(dados.avisos || []).map((a: string, i: number) => <p key={i} className="mt-1 text-xs text-amber-800">• {a}</p>)}
        {dados.atualApuradoPago?.length > 0 && (
          <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1">Tributo (regime atual)</th><th className="text-right">Apurado</th><th className="text-right">Pago</th></tr></thead>
            <tbody>{dados.atualApuradoPago.map((l: any, i: number) => <tr key={i} className="border-t border-slate-100"><td className="py-1">{l.tributo}</td><td className="text-right tabular-nums">{reais(l.apuradoCentavos)}</td><td className="text-right tabular-nums">{reais(l.pagoCentavos)}</td></tr>)}</tbody></table>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Quanto pagaria em cada regime (estimativa)</h3>
          <label className="grid gap-1 text-xs font-semibold">Atividade (presunção do Presumido)
            <select data-campo="regimes-atividade" value={atividade} onChange={(e) => setAtividade(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm"><option value="">Escolha…</option>{(dados.atividades || []).map((a: any) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select>
          </label>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {(dados.estimativas || []).map((e: any) => (
            <div key={e.regime} className={`rounded-lg border p-2 ${melhor && melhor.regime === e.regime ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2"><strong className="text-xs">{e.regime}{e.atual ? " (atual)" : ""}</strong><span className="font-bold tabular-nums">{e.totalCentavos === null ? "—" : reais(e.totalCentavos)}</span></div>
              {!e.podeOptar && <p className="mt-1 text-[11px] font-semibold text-rose-700">{e.motivo}</p>}
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-700">{(e.linhas || []).map((l: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{l.nome}{l.base ? <span className="text-slate-400"> ({l.base})</span> : null}</span><span className="tabular-nums">{reais(l.centavos)}</span></li>)}</ul>
              {(e.observacoes || []).map((o: string, i: number) => <p key={i} className="mt-1 text-[11px] text-slate-500">{o}</p>)}
              {e.regime === "Simples Nacional" && !e.atual && <a href={dados.simularSimplesNoFiscal} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded border border-blue-600 px-2 py-1 text-xs font-bold text-blue-800" data-campo="simular-simples-no-fiscal">Simular o Simples no Fiscal</a>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{dados.aviso}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Recolhimento a maior identificado: {reais(dados.totalAMaiorCentavos)}</h3>
          <button type="button" onClick={() => void conferirAgora()} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold" data-campo="conferir-pago-a-maior-agora">Rodar agora (conferidor)</button>
        </div>
        {conferencia && <p className="mt-1 text-xs text-slate-700">{conferencia}</p>}
        {(dados.pagoAMaior || []).length === 0 ? <p className="mt-1 text-xs text-slate-600">Nada pago a maior nos pagamentos de DAS e DARF que chegaram do Fiscal.</p> : (
          <ul className="mt-1 space-y-2">{dados.pagoAMaior.map((p: any, i: number) => (
            <li key={i} className={`rounded-lg border p-2 text-xs ${p.aConferir ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex flex-wrap justify-between gap-2"><strong>{p.tributo} — período {p.periodo.includes("-T") ? p.periodo : mesBr(p.periodo)}</strong><span className="font-bold">{p.aConferir ? "a conferir: " : ""}{reais(p.aMaiorCentavos)}</span></div>
              <p>Apurado {reais(p.apuradoCentavos)} · pago {reais(p.pagoCentavos)} em {p.pagoEm.map(mesBr).join(", ")}{p.foraDoPrazo ? " · fora do prazo de 5 anos" : ""}</p>
              <p className="text-slate-700">{p.motivo}</p>
              <p className="mt-1 text-slate-600">{p.orientacao}</p>
            </li>
          ))}</ul>
        )}
      </section>
      <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><summary className="cursor-pointer font-semibold">Base legal</summary><ul className="mt-1 list-disc pl-4">{(dados.baseLegal || []).map((b: string, i: number) => <li key={i}>{b}</li>)}</ul></details>
    </div>
  );
};
