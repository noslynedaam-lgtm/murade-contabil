import React, { useRef, useState } from 'react';
import { useContabilAuth } from './ContabilAccessGate';
import { montarFraseParaAgente, rotuloCaixaPedir } from '../utils/pedirParaAlguem';

// Caixinha da tela inicial: a pessoa escreve ou fala o pedido, sem entrar em nenhum módulo. A frase vai para a mesma Agente IA
// (ferramenta delegar_tarefa), que mostra o cartão de confirmação. Para funcionário comum vira "Anotar tarefa para mim".
export function CaixaPedirParaAlguem({ onEnviar }: { onEnviar: (frase: string) => void }) {
  const auth = useContabilAuth();
  const rot = rotuloCaixaPedir(auth.administrador);
  const [texto, setTexto] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const reconhecimento = useRef<any>(null);
  const enviar = (t: string) => { const frase = montarFraseParaAgente(t, auth.administrador); if (!frase) return; onEnviar(frase); setTexto(''); setAviso('Enviado para a Agente IA. Confirme no cartão que ela mostrar.'); };
  const falar = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setAviso('Este aparelho não tem reconhecimento de voz. Digite o pedido.'); return; }
    if (ouvindo) { reconhecimento.current?.stop(); return; }
    const r = new SR(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1; reconhecimento.current = r;
    r.onstart = () => { setOuvindo(true); setAviso('Estou ouvindo…'); };
    r.onresult = (e: any) => { const t = String(e.results?.[0]?.[0]?.transcript || '').trim(); if (t) { setTexto(t); enviar(t); } };
    r.onerror = () => setAviso('Não consegui ouvir. Tente de novo ou digite.');
    r.onend = () => setOuvindo(false);
    try { r.start(); } catch { setOuvindo(false); }
  };
  // Só o administrador do escritório (quem pode pedir serviço à equipe) vê a caixa, igual ao DP; o funcionário usa a Agente IA.
  if (!auth.administrador) return null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="rounded-xl border border-sky-200 bg-sky-50 p-2.5" aria-label={rot.titulo}>
      <label htmlFor="caixa-pedir" className="block text-xs font-extrabold text-sky-900">{rot.titulo}</label>
      <div className="mt-1 flex gap-1.5">
        <input id="caixa-pedir" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder={rot.dica} className="min-w-0 flex-1 rounded-lg border border-sky-300 bg-white p-2 text-sm" />
        <button type="button" onClick={falar} aria-label={ouvindo ? 'Parar de ouvir' : 'Falar o pedido'} title="Falar o pedido" className={`h-10 w-10 shrink-0 rounded-lg border text-base ${ouvindo ? 'border-red-400 bg-red-100' : 'border-sky-300 bg-white'}`}>🎤</button>
        <button className="shrink-0 rounded-lg bg-sky-800 px-3 text-sm font-bold text-white">{rot.botao}</button>
      </div>
      {aviso && <p role="status" className="mt-1 text-xs text-sky-900">{aviso}</p>}
    </form>
  );
}
