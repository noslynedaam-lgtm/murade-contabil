import React, { useEffect, useRef, useState } from "react";
import { ambienteDoNavegador, apiDoSistema, aparelhoJaAtivo, ativarAvisosNoAparelho, comoLiberar, comTempo, type ResultadoAtivacao } from "../utils/ativarAvisosAparelho";

// Aviso curtinho no Início (uma linha, não fica fixo no topo) para quem ainda não ativou o aviso de vencimento NESTE aparelho.
// Some sozinho quando o aparelho já está ativado, quando o servidor não tem as chaves de aviso, ou por 7 dias com "Agora não".
// 25/11/2026 (celular do dono, Samsung/Android instalado): ao tocar em "Ativar", a faixa ficava "pensando" e não sumia — o
// aparelho não respondia à pergunta de permissão / ao serviço de avisos, e a tela esperava até 150 s. Agora, ao tocar:
//   1) o convite some na hora e vira uma linha curta "Ativando avisos…";
//   2) deu certo → "✓ Avisos ativados neste aparelho" (some em 5 s);
//   3) o aparelho recusou ou passou de 8 s → uma frase curta do motivo (some em 8 s ou no X) e a tela segue livre;
//      a ativação continua por trás: se o aparelho responder depois, mostra a confirmação.
// Não deu: o convite volta só no dia seguinte (o botão também fica na Central Anti-Multa, onde houver).
const CHAVE_AGORA_NAO = "murad-contabil-aviso-celular-agora-nao";
const SETE_DIAS = 7 * 24 * 60 * 60_000;
const UM_DIA = 24 * 60 * 60_000;
const BASE = "/api/avisos-aparelho";
/** Tempo máximo que a tela espera o aparelho antes de liberar a pessoa (a ativação segue por trás). */
export const ESPERA_TELA_MS = 8_000;
const ONDE_TENTAR = "amanhã, aqui no Início";

/** Frase curta do motivo (a explicação longa continua na Central Anti-Multa e nos logs). */
export function motivoCurto(r: ResultadoAtivacao | "tempo"): string {
  if (r === "tempo") return `O aparelho não respondeu a tempo. Tente de novo ${ONDE_TENTAR}.`;
  switch (r.etapa) {
    case "permissao_negada": case "permissao_fechada": return `O aparelho não liberou os avisos. Libere as notificações do Murad no navegador e tente de novo ${ONDE_TENTAR}.`;
    case "iphone_sem_instalar": return "No iPhone, instale o Murad na Tela de Início (Compartilhar › Adicionar à Tela de Início) e tente de novo.";
    case "sem_suporte": return "Este navegador não aceita avisos. Use o Chrome ou o Samsung Internet atualizados.";
    case "sem_sessao": return `Sem conexão com o servidor agora. Tente de novo ${ONDE_TENTAR}.`;
    default: return `Não deu para ativar agora. Tente de novo ${ONDE_TENTAR}.`;
  }
}

export function AtivarAvisosContabil() {
  const [estado, setEstado] = useState<"oculto" | "convite" | "ativando" | "ativado" | "falhou">("oculto");
  const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        // Link "#ativar-avisos": mostra mesmo se a pessoa tinha tocado em "Agora não".
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
    if (estado !== "ativado" && estado !== "falhou") return;
    const t = window.setTimeout(() => setEstado("oculto"), estado === "ativado" ? 5000 : 8000);
    return () => window.clearTimeout(t);
  }, [estado]);
  if (estado === "oculto") return null;
  if (estado === "ativado") return <div role="status" className="mx-2 mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900" data-campo="ativar-avisos-celular">✓ Avisos ativados neste aparelho</div>;
  if (estado === "ativando") return <div role="status" className="mx-2 mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" data-campo="ativar-avisos-celular">Ativando avisos… (o aparelho pode perguntar se permite)</div>;
  if (estado === "falhou") return (
    <div role="alert" className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs font-semibold text-red-800" data-campo="ativar-avisos-celular">
      <span className="min-w-0 flex-1">{msg}</span>
      <button type="button" aria-label="Fechar" onClick={() => setEstado("oculto")} className="shrink-0 rounded px-1 text-red-800">✕</button>
    </div>
  );
  const ativar = async () => {
    if (ocupado) return;
    setOcupado(true); setMsg("");
    setEstado("ativando"); // o convite some na hora, dê certo ou não
    let respondeu = false;
    // A ativação inteira (cada passo já tem tempo máximo; 150 s é o último cinto de segurança).
    const ativacao = comTempo(ativarAvisosNoAparelho(ambienteDoNavegador(), apiDoSistema(BASE)), 150_000, "ativação")
      .catch((): ResultadoAtivacao => ({ ok: false }));
    // Se o aparelho responder depois dos 8 s e der certo, ainda mostra a confirmação.
    void ativacao.then((r) => { if (respondeu || !montado.current) return; if (r.ok) setEstado("ativado"); });
    try {
      const r = await Promise.race([ativacao, new Promise<"tempo">((ok) => window.setTimeout(() => ok("tempo"), ESPERA_TELA_MS))]);
      if (r !== "tempo") respondeu = true;
      if (!montado.current) return;
      if (r !== "tempo" && r.ok) { setEstado("ativado"); return; }
      // Não deu (ou demorou): frase curta e o convite volta só amanhã.
      localStorage.setItem(CHAVE_AGORA_NAO, String(Date.now() - SETE_DIAS + UM_DIA));
      setMsg(motivoCurto(r)); setEstado("falhou");
    } finally { setOcupado(false); }
  };
  return (
    // No celular: no máximo 2 linhas (o texto numa, os botões na outra); no computador, uma linha só.
    <div className="mx-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950" data-campo="ativar-avisos-celular">
      <span className="min-w-0 basis-full truncate sm:basis-auto sm:flex-1" title="ECD, ECF, IRPJ/CSLL e JCP">🔔 Receber no celular os avisos de vencimento?</span>
      <button type="button" disabled={ocupado} onClick={() => void ativar()} className="whitespace-nowrap rounded bg-slate-900 px-2 py-1 font-bold text-white disabled:opacity-60">Ativar avisos neste aparelho</button>
      <button type="button" onClick={() => { localStorage.setItem(CHAVE_AGORA_NAO, String(Date.now())); setEstado("oculto"); }} className="whitespace-nowrap rounded border border-amber-300 bg-white px-2 py-1">Agora não</button>
      {msg && <p role="alert" className="w-full rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-800">{msg}</p>}
    </div>
  );
}
