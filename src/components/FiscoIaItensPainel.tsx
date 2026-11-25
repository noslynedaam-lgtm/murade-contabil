// Revisão das origens › Do Fisco IA: guias (DAS do MEI), dívida ativa e parcelamentos que alguém consultou POR CLIQUE no Fisco IA
// (Integra Contador) e viraram pré-lançamento aqui. Mostra a situação de cada item e o "Rodar agora" do conferidor. Não consulta o Serpro.
import React, { useCallback, useEffect, useState } from "react";

type Item = { origem: string; competencia: string; data: string; valorCentavos: number; situacao: string; detalhe: string };
const SIT: Record<string, { t: string; c: string }> = {
  pre_lancamento: { t: "para conferir", c: "text-amber-700" }, contabilizado: { t: "contabilizado", c: "text-emerald-700" },
  aguardando_mapeamento: { t: "falta mapear", c: "text-rose-700" }, duplicado_do_fiscal: { t: "já veio do Fiscal", c: "text-slate-500" },
};

export const FiscoIaItensPainel: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const [itens, setItens] = useState<Item[]>([]);
  const [resumo, setResumo] = useState("");
  const [rodando, setRodando] = useState(false);
  const carregar = useCallback(async () => {
    if (!cnpj) return;
    const r = await fetch(`/api/fiscoia-contabil/itens?cnpj=${encodeURIComponent(cnpj)}`, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } }).then((x) => x.json()).catch(() => null);
    if (r?.sucesso) { setItens(r.itens || []); setResumo(String(r.resumo || "")); }
  }, [cnpj]);
  useEffect(() => { void carregar(); }, [carregar]);
  const rodarAgora = async () => {
    setRodando(true);
    try {
      const r = await fetch("/api/fiscoia-contabil/conferir-agora", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
      setResumo(String(r?.resumo || r?.motivo || "Não consegui conferir agora.")); await carregar();
    } finally { setRodando(false); }
  };
  if (!itens.length && !resumo) return null;
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm" data-painel="itens-fisco-ia">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-violet-900">Do Fisco IA: guias, dívida ativa e parcelamentos ({itens.length})</h2>
        <button type="button" disabled={rodando} onClick={() => void rodarAgora()} className="rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-bold text-violet-900 disabled:opacity-50" data-campo="rodar-conferidor-fisco-ia">{rodando ? "Conferindo…" : "Rodar agora"}</button>
      </div>
      {resumo && <p className="mt-1 text-xs text-violet-900">{resumo}</p>}
      <ul className="mt-2 divide-y divide-violet-100">
        {itens.slice(0, 20).map((i, n) => (
          <li key={n} className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs">
            <span className="min-w-0 flex-1">{i.origem.replace(/^Fisco IA — /, "")} · {i.data.split("-").reverse().join("/")} · {(i.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            <span className={`font-semibold ${SIT[i.situacao]?.c || ""}`} title={i.detalhe}>{SIT[i.situacao]?.t || i.situacao}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-violet-800">Só entra o que alguém consultou por clique no Fisco IA. Mapeie as contas das origens "Fisco IA — …" abaixo para os pré-lançamentos saírem.</p>
    </section>
  );
};
