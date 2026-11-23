import React, { useCallback, useEffect, useState } from "react";
import { perguntarNaTela } from "../utils/dialogoNaTela";

// Central do Lucro Real da empresa: todas as obrigações com vencimento, avisos, diferenças entre Fiscal, DP e Contábil (que
// bloqueiam a guia) e as pendências conhecidas. Botões: "Conferir agora", "Aceitar a diferença" e "Dar baixa".
const reais = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (d: string) => (d ? d.split("-").reverse().join("/") : "");
const COR: Record<string, string> = { aguardando_apuracao: "bg-red-100 text-red-900", conferir: "bg-amber-100 text-amber-900", confirmada: "bg-sky-100 text-sky-900", baixada: "bg-emerald-100 text-emerald-900" };
const NOME: Record<string, string> = { aguardando_apuracao: "Aguardando apuração", conferir: "Conferir e confirmar", confirmada: "Confirmada — falta a baixa", baixada: "Baixada" };

export const CentralLucroRealPainel: React.FC<{ cnpj: string; ano: number }> = ({ cnpj, ano }) => {
  const limpo = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    if (limpo.length !== 14) return;
    try { const r = await fetch(`/api/workspaces/${limpo}/lucro-real/central?ano=${ano}`, { credentials: "include", cache: "no-store" }); const j = await r.json().catch(() => ({})); setD(r.ok && j.sucesso ? j : null); } catch { setD(null); }
  }, [limpo, ano]);
  useEffect(() => { void carregar(); }, [carregar]);
  const post = async (url: string, corpo: any, ok: string) => {
    setOcupado(true); setMsg("");
    try { const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); const j = await r.json().catch(() => ({})); setMsg(r.ok && j.sucesso ? ok : j.motivo || "Não foi possível."); if (j.obrigacoes) setD(j); else await carregar(); }
    finally { setOcupado(false); }
  };
  if (!d) return null;
  const abertas = (d.divergencias || []).filter((x: any) => x.estado === "aberta");
  return (
    <section className="space-y-2 rounded-xl border border-[#E5E6EB] bg-white p-3" data-campo="central-lucro-real">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold">Central do Lucro Real — {ano}</h3><p className="text-[11px] text-[#86909C]">Tudo o que a empresa tem de pagar e entregar, com vencimento e fonte. O robô confere de 2 em 2 horas; os avisos só param com a confirmação e a baixa.</p></div>
        <button type="button" disabled={ocupado} className="min-h-10 rounded-lg bg-[#0F2B5B] px-3 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => void post(`/api/workspaces/${limpo}/lucro-real/central/conferir`, { ano }, "Conferido agora.")}>{ocupado ? "Conferindo…" : "Conferir agora"}</button>
      </div>
      {abertas.length > 0 && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs text-red-950">
        <p className="font-bold">Diferença entre os sistemas — a guia do período fica BLOQUEADA até você decidir</p>
        <ul className="mt-1 space-y-2">{abertas.map((x: any) => <li key={x.id} className="rounded bg-white p-2"><b>{x.competencia}</b> · {x.explicacao}
          <div className="mt-1"><button type="button" disabled={ocupado} className="min-h-10 rounded border-2 border-red-400 bg-white px-3 py-1 font-bold" onClick={async () => { const m = await perguntarNaTela(`Por que a diferença de ${x.competencia} está certa? (fica registrado com o seu nome)`); if (m) void post(`/api/workspaces/${limpo}/lucro-real/divergencias/decidir`, { id: x.id, motivo: m }, "Diferença aceita e registrada."); }}>Conferi: a diferença está certa</button>
            <span className="ml-2 text-[11px]">Ou corrija na origem (Fiscal, DP ou lançamentos) e clique em "Conferir agora".</span></div></li>)}</ul></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs"><thead><tr className="text-left text-[#4E5969]"><th className="p-1">Obrigação</th><th className="p-1">Vencimento</th><th className="p-1">Valor</th><th className="p-1">DARF</th><th className="p-1">Situação</th><th className="p-1">O que falta</th></tr></thead>
        <tbody>{(d.obrigacoes || []).map((o: any) => <tr key={o.id} className="border-t align-top"><td className="p-1">{o.descricao}{o.bloqueada && <span className="ml-1 rounded bg-red-600 px-1 font-bold text-white">BLOQUEADA</span>}</td><td className="p-1">{dataBR(o.vencimento)}</td><td className="p-1">{reais(o.valorCentavos)}</td><td className="p-1">{o.codigoDarf || "—"}</td>
          <td className="p-1"><span className={`rounded px-1 font-semibold ${COR[o.estado] || ""}`}>{NOME[o.estado] || o.estado}</span></td>
          <td className="p-1">{o.oQueFalta}{(o.tipo === "dctfweb" || o.tipo === "efd_contribuicoes") && <button type="button" disabled={ocupado} className="ml-1 underline font-semibold" onClick={async () => { if (o.estado === "baixada") { void post(`/api/workspaces/${limpo}/lucro-real/baixa`, { obrigacaoId: o.id, desfazer: true }, "Baixa desfeita."); return; } const rec = await perguntarNaTela(`Dar baixa em "${o.descricao}"? Digite o número do recibo (pode deixar em branco).`); if (rec !== null) void post(`/api/workspaces/${limpo}/lucro-real/baixa`, { obrigacaoId: o.id, recibo: rec }, "Baixa registrada."); }}>{o.estado === "baixada" ? "Desfazer baixa" : "Dar baixa"}</button>}</td></tr>)}</tbody></table></div>
      {msg && <p role="status" className="text-xs font-semibold">{msg}</p>}
      <details className="text-[11px] text-[#4E5969]"><summary className="cursor-pointer font-semibold">O que ainda não está aqui (pendências conhecidas)</summary><ul className="ml-4 list-disc">{(d.pendenciasConhecidas || []).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></details>
    </section>
  );
};
