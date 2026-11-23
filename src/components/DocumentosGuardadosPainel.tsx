import React, { useCallback, useEffect, useState } from "react";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { useContabilAuth } from "./ContabilAccessGate";

// "Recuperar documentos guardados": aparece SÓ para o administrador do escritório e SÓ quando a empresa ativa (recadastrada) tem
// documentos no arquivo morto. Não mostra o conteúdo. Recupera com segunda confirmação e barra de andamento.
export const DocumentosGuardadosPainel: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const auth = useContabilAuth();
  const limpo = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [info, setInfo] = useState<{ itens: number; guardarAte: string | null } | null>(null);
  const [andamento, setAndamento] = useState<{ etapa: number; texto: string } | null>(null);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const admin = auth.administrador || auth.donoSistema;
  const carregar = useCallback(async () => {
    if (!admin || limpo.length !== 14) { setInfo(null); return; }
    try {
      const r = await fetch(`/api/arquivo-morto/${limpo}`, { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setInfo(r.ok && d.sucesso && d.itens > 0 ? { itens: d.itens, guardarAte: d.guardarAte } : null);
    } catch { setInfo(null); }
  }, [admin, limpo]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (!info && !msg) return null;
  const recuperar = async () => {
    if (!await pedir({ titulo: "Recuperar documentos guardados?", oQue: `os documentos guardados da empresa ${cnpj} (${info?.itens} registro(s))`, consequencias: ["A escrituração, os fechamentos e os documentos voltam para esta empresa.", "O que já existe na empresa não é sobrescrito.", "Se a empresa já tem lançamentos novos, a escrituração guardada não é misturada e o sistema avisa."], rotuloFinal: "Sim, recuperar", irreversivel: false, comoVoltar: "Os documentos recuperados podem ser excluídos de novo junto com a empresa." })) return;
    setMsg(null); setAndamento({ etapa: 1, texto: "Abrindo o arquivo guardado (cifrado)…" });
    await new Promise((x) => setTimeout(x, 200));
    setAndamento({ etapa: 2, texto: "Devolvendo os registros para a empresa…" });
    const r = await fetch(`/api/arquivo-morto/${limpo}/recuperar`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: true }) });
    const d = await r.json().catch(() => ({}));
    setAndamento({ etapa: 3, texto: "Conferindo…" });
    await carregar(); setAndamento(null);
    setMsg(r.ok && d.sucesso ? { erro: (d.pendencias || []).length > 0, texto: `${d.recuperados} registro(s) recuperado(s).${(d.pendencias || []).length ? " " + d.pendencias.join(" ") : " Recarregue a página para ver a escrituração."}` } : { erro: true, texto: d.motivo || "Não foi possível recuperar." });
  };
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-campo="documentos-guardados">
      {dialogo}
      {info && <>
        <p className="font-bold">Esta empresa tem documentos guardados de quando foi excluída</p>
        <p className="mt-1 text-xs">{info.itens} registro(s), guardados até {String(info.guardarAte || "").split("-").reverse().join("/")} pelo prazo legal (CTN, arts. 173, 174 e 195). Só o administrador vê este aviso.</p>
        <button type="button" disabled={!!andamento} onClick={() => void recuperar()} className="mt-2 min-h-11 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Recuperar documentos guardados</button>
      </>}
      {andamento && <div role="progressbar" aria-valuenow={andamento.etapa * 33} className="mt-2"><p className="text-xs font-semibold">{andamento.texto}</p><div className="mt-1 h-2 rounded bg-amber-200"><div className="h-2 rounded bg-amber-700" style={{ width: `${andamento.etapa * 33}%` }} /></div></div>}
      {msg && <p role="status" className={`mt-2 text-xs font-semibold ${msg.erro ? "text-red-800" : "text-emerald-800"}`}>{msg.texto}</p>}
    </section>
  );
};

