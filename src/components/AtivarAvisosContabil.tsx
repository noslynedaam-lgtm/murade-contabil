import React, { useEffect, useState } from "react";
import { ambienteDoNavegador, apiDoSistema, aparelhoJaAtivo, ativarAvisosNoAparelho, comoLiberar, comTempo } from "../utils/ativarAvisosAparelho";

// Convite curtinho no Início (uma linha, não fixo no topo) para quem ainda não ativou o aviso de vencimento NESTE aparelho.
// Ativa no próprio Murad Contábil (antes abria a página do Murad Fiscal): permissão do navegador, aplicativo do navegador
// (service worker), chave do servidor e gravação aqui. Ativou: a faixa vira "Avisos ativados neste aparelho" e some. Não deu:
// a faixa diz o motivo e o que fazer (permissão bloqueada, iPhone sem instalar na Tela de Início...). "Agora não" esconde por 7 dias.
const CHAVE_AGORA_NAO = "murad-contabil-aviso-celular-agora-nao";
const SETE_DIAS = 7 * 24 * 60 * 60_000;
const BASE = "/api/avisos-aparelho";

export function AtivarAvisosContabil() {
  const [estado, setEstado] = useState<"oculto" | "convite" | "ativado">("oculto");
  const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        if (!/(^|[#&])ativar-avisos(&|$)/.test(window.location.hash) && Date.now() - Number(localStorage.getItem(CHAVE_AGORA_NAO) || 0) < SETE_DIAS) return;
        const api = apiDoSistema(BASE);
        const c = await api.chave();
        if (!c.ativo || !c.chave) return; // servidor sem chaves: não há o que ativar
        const amb = ambienteDoNavegador();
        const sub = await aparelhoJaAtivo(amb);
        if (sub) { await api.assinar(sub.toJSON()).catch(() => undefined); return; } // já ativado: só confirma no servidor
        if (!ativo) return;
        if (amb.permissaoAtual() === "denied") setMsg(`O navegador está bloqueando os avisos do Murad. ${comoLiberar(amb)}`);
        setEstado("convite");
      } catch { /* sem rede ou sem sessão: não mostra */ }
    })();
    return () => { ativo = false; };
  }, []);
  useEffect(() => {
    if (estado !== "ativado") return;
    const t = window.setTimeout(() => setEstado("oculto"), 5000);
    return () => window.clearTimeout(t);
  }, [estado]);
  if (estado === "oculto") return null;
  if (estado === "ativado") return <div role="status" className="mx-2 mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900" data-campo="ativar-avisos-celular">✓ Avisos ativados neste aparelho</div>;
  const ativar = async () => {
    setMsg(""); setOcupado(true);
    try {
      // Cada passo já tem tempo máximo; este é o último cinto de segurança: o botão nunca fica preso em "Ativando…".
      const r = await comTempo(ativarAvisosNoAparelho(ambienteDoNavegador(), apiDoSistema(BASE)), 150_000, "ativação");
      if (r.ok) setEstado("ativado");
      else setMsg(r.mensagem || "Não foi possível ativar agora.");
    } catch {
      setMsg('O celular não respondeu a tempo. Feche e abra o Murad de novo e toque outra vez em "Ativar avisos neste aparelho".');
    } finally { setOcupado(false); }
  };
  return (
    // No celular: no máximo 2 linhas (o texto numa, os botões na outra); no computador, uma linha só.
    <div className="mx-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950" data-campo="ativar-avisos-celular">
      <span className="min-w-0 basis-full truncate sm:basis-auto sm:flex-1" title="ECD, ECF, IRPJ/CSLL e JCP">🔔 Receber no celular os avisos de vencimento?</span>
      <button type="button" disabled={ocupado} onClick={() => void ativar()} className="whitespace-nowrap rounded bg-slate-900 px-2 py-1 font-bold text-white disabled:opacity-60">{ocupado ? "Ativando…" : "Ativar avisos neste aparelho"}</button>
      <button type="button" onClick={() => { localStorage.setItem(CHAVE_AGORA_NAO, String(Date.now())); setEstado("oculto"); }} className="whitespace-nowrap rounded border border-amber-300 bg-white px-2 py-1">Agora não</button>
      {msg && <p role="alert" className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-800">{msg}</p>}
    </div>
  );
}
