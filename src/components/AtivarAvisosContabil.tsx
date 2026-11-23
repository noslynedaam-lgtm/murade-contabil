import React, { useEffect, useState } from "react";

// Convite curtinho no Início (uma linha, não fixo no topo) para quem ainda não ativou o aviso de vencimento no celular. O aviso do
// Contábil chega pelo aplicativo do Murad Fiscal (mesmos aparelhos), então o botão abre o Murad Fiscal já no convite de ativar.
// Some quando a pessoa já tem aparelho ativado lá, quando não deu para conferir, ou por 7 dias com "Agora não".
const CHAVE_AGORA_NAO = "murad-contabil-aviso-celular-agora-nao";
const SETE_DIAS = 7 * 24 * 60 * 60_000;
export function AtivarAvisosContabil() {
  const [fiscal, setFiscal] = useState<string | null>(null);
  useEffect(() => {
    if (Date.now() - Number(localStorage.getItem(CHAVE_AGORA_NAO) || 0) < SETE_DIAS) return;
    void fetch("/api/alerta-urgente/aparelho", { credentials: "include", cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d?.sucesso && d.conferido && d.temConta && d.aparelhos === 0 && typeof d.fiscal === "string") setFiscal(d.fiscal); }).catch(() => undefined);
  }, []);
  if (!fiscal) return null;
  return (
    <div className="mx-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950" data-campo="ativar-avisos-celular">
      <span className="min-w-0 flex-1">🔔 Receba no celular os avisos de vencimento do Contábil (chegam pelo aplicativo do Murad Fiscal).</span>
      <a href={`${fiscal}#ativar-avisos`} target="_blank" rel="noopener noreferrer" className="rounded bg-slate-900 px-2 py-1 font-bold text-white">Ativar avisos neste aparelho</a>
      <button type="button" onClick={() => { localStorage.setItem(CHAVE_AGORA_NAO, String(Date.now())); setFiscal(null); }} className="rounded border border-amber-300 bg-white px-2 py-1">Agora não</button>
    </div>
  );
}
