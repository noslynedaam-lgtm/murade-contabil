import React, { useCallback, useEffect, useState } from "react";

// Faixa vermelha "URGENTE — vence hoje" do Contábil (Início e Central do Lucro Real), no mesmo padrão do Fiscal e do DP: o que vence
// hoje e o que já venceu (ECD, ECF, IRPJ/CSLL do Lucro Real, IRRF sobre JCP), com motivo, passo a passo e a multa se não resolver
// hoje. Não é fixa no topo e começa recolhida no celular (economiza tela). "Resolvido" para os avisos urgentes (dá para desfazer).
interface Item {
  chave: string; cnpj: string; razaoSocial: string; tipo: string; obrigacaoId: string; descricao: string; categoria: "guia" | "declaracao";
  vencimento: string; dias: number; codigoDarf: string | null; motivo: string; passos: string[]; multaSeAtrasar: string | null;
}
const fmt = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
export const ehUrgenteContabil = (i: Pick<Item, "dias">) => i.dias <= 0 && i.dias >= -30;

async function chamar(url: string, method = "GET", corpo?: unknown) {
  const r = await fetch(url, { method, credentials: "include", cache: "no-store", headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.sucesso === false) throw new Error(d?.motivo || "Não foi possível concluir agora.");
  return d;
}

export function FaixaUrgenteContabil({ onAbrirCentral, cnpj }: { onAbrirCentral?: () => void; cnpj?: string }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [aberto, setAberto] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [msg, setMsg] = useState(""); const [desfazer, setDesfazer] = useState<Item | null>(null);
  const carregar = useCallback(async () => { try { const d = await chamar("/api/alerta-urgente"); setItens(d.itens || []); } catch { /* sem rede: a faixa só não aparece */ } }, []);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 10 * 60_000); return () => clearInterval(t); }, [carregar]);
  const lista = itens.filter(ehUrgenteContabil).filter((i) => !cnpj || i.cnpj === cnpj).sort((a, b) => a.dias - b.dias);
  const marcar = async (i: Item, voltar: boolean) => {
    try {
      await chamar(`/api/workspaces/${encodeURIComponent(i.cnpj)}/alerta-urgente/resolvido`, "POST", { obrigacaoId: i.obrigacaoId, desfazer: voltar });
      setMsg(voltar ? `Avisos de ${i.descricao} (${i.razaoSocial}) voltaram.` : `${i.descricao} (${i.razaoSocial}) marcado como resolvido: os avisos urgentes param. ${i.categoria === "guia" ? "Para dar baixa no livro, registre o pagamento na Central do Lucro Real." : 'Para constar como entregue, marque "entregue" em Demonstrações com o recibo.'}`);
      setDesfazer(voltar ? null : i); await carregar();
    } catch (e: any) { setMsg(e.message); }
  };
  if (!lista.length && !msg) return null;
  const hoje = lista.filter((i) => i.dias === 0).length; const vencidos = lista.filter((i) => i.dias < 0).length;
  return (
    <section role="alert" aria-label="Vencimentos urgentes do Contábil" className="mx-2 mt-2 rounded-xl border-2 border-red-600 bg-red-50 p-2 text-red-950 sm:p-3" data-campo="faixa-urgente-contabil">
      {lista.length > 0 && <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white">Urgente{hoje ? " — vence hoje" : ""}</span>
        <span className="text-sm font-bold">{[hoje && `${hoje} vence(m) hoje`, vencidos && `${vencidos} vencido(s)`].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto text-xs underline">{aberto ? "Recolher" : "Ver o que fazer"}</span>
      </button>}
      {msg && <p role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded border border-red-200 bg-white p-2 text-xs">{msg}{desfazer && <button type="button" onClick={() => void marcar(desfazer, true)} className="rounded border border-slate-300 px-2 py-0.5 font-semibold">Desfazer</button>}<button type="button" onClick={() => { setMsg(""); setDesfazer(null); }} className="ml-auto text-slate-500" aria-label="Fechar">×</button></p>}
      {aberto && lista.length > 0 && <ul className="mt-2 space-y-2">
        {lista.slice(0, 20).map((i) => (
          <li key={i.chave} className="rounded-lg border border-red-300 bg-white p-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong className="text-sm">{i.descricao}{i.codigoDarf ? ` (DARF ${i.codigoDarf})` : ""}</strong><span>{i.razaoSocial}</span>
              <span className="ml-auto font-bold text-red-700">{i.dias < 0 ? `Vencido há ${-i.dias} dia(s)` : "Vence HOJE"}</span>
            </div>
            <div className="mt-0.5 text-slate-700">Vencimento <strong>{fmt(i.vencimento)}</strong></div>
            <p className="mt-1"><strong>Motivo:</strong> {i.motivo}.</p>
            {!!i.passos?.length && <details className="mt-1" open={lista.length <= 3}><summary className="cursor-pointer font-semibold">O que fazer agora (passo a passo)</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">{i.passos.map((p, n) => <li key={n}>{p}</li>)}</ol></details>}
            {i.multaSeAtrasar && <p className="mt-1 rounded border border-red-200 bg-red-50 p-1.5"><strong>{i.dias < 0 ? "Multa e juros:" : "Se não resolver hoje:"}</strong> {i.multaSeAtrasar}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void marcar(i, false)} className="rounded border border-emerald-600 bg-white px-2 py-1 font-bold text-emerald-900">{i.categoria === "declaracao" ? "Resolvido: já transmiti" : "Resolvido: já foi paga"}</button>
              {onAbrirCentral && i.tipo !== "CONTABIL_ECD" && i.tipo !== "CONTABIL_ECF" && <button type="button" onClick={onAbrirCentral} className="rounded border border-red-700 bg-red-700 px-2 py-1 font-bold text-white">Abrir a Central do Lucro Real</button>}
            </div>
          </li>
        ))}
      </ul>}
    </section>
  );
}
