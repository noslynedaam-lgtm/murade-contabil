import React, { useCallback, useEffect, useState } from "react";

/** Avisos do Robô do Prazo de Guarda (só CNPJ e data) para o administrador, com "Manter guardado" para processo ou parcelamento. */
export const AvisosPrazoGuarda: React.FC = () => {
  const [avisos, setAvisos] = useState<Array<{ cnpj: string; guardarAte: string; manter: boolean }>>([]);
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const carregar = useCallback(async () => {
    try { const r = await fetch("/api/arquivo-morto-avisos", { credentials: "include", cache: "no-store" }); const d = await r.json().catch(() => ({})); setAvisos(Array.isArray(d.avisos) ? d.avisos : []); } catch { setAvisos([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  if (!avisos.length) return null;
  const manter = async (cnpj: string, sim: boolean) => {
    const r = await fetch(`/api/arquivo-morto/${cnpj}/manter`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manter: sim, motivo: motivo[cnpj] || "" }) });
    const d = await r.json().catch(() => ({})); setMsg(r.ok && d.sucesso ? (sim ? "Marcado para manter guardado." : "Marca retirada.") : d.motivo || "Não foi possível salvar."); await carregar();
  };
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" data-campo="avisos-prazo-guarda">
      <p className="text-sm font-bold">Documentos guardados de empresas excluídas perto do fim do prazo legal</p>
      <p className="mt-1">Depois da data, e 30 dias depois deste aviso, o Robô do Prazo de Guarda apaga de vez. Se houver processo ou parcelamento (a prescrição fica interrompida), marque "Manter guardado" com o motivo.</p>
      <ul className="mt-2 space-y-2">{avisos.map((a) => (
        <li key={a.cnpj} className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-white p-2">
          <span><b>{a.cnpj}</b> · guardado até {a.guardarAte.split("-").reverse().join("/")}{a.manter ? " · marcado para manter" : ""}</span>
          {a.manter ? <button type="button" className="rounded border px-2 py-1" onClick={() => void manter(a.cnpj, false)}>Tirar a marca</button>
            : <><input className="min-w-40 flex-1 rounded border px-2 py-1" placeholder="Motivo (processo nº, parcelamento)" value={motivo[a.cnpj] || ""} onChange={(e) => setMotivo({ ...motivo, [a.cnpj]: e.target.value })} /><button type="button" className="rounded bg-amber-700 px-2 py-1 font-bold text-white" onClick={() => void manter(a.cnpj, true)}>Manter guardado</button></>}
        </li>))}</ul>
      {msg && <p role="status" className="mt-2 font-semibold">{msg}</p>}
    </section>
  );
};
