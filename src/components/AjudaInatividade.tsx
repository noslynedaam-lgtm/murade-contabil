// Dica discreta "Precisa de ajuda? É só dizer 'Murad'." (igual nos sistemas Murade). Só na primeira semana de uso, quando a pessoa
// fica 20 s parada numa tela, no máximo 1 vez por tela por dia, com "Não mostrar mais". Pequena (não ocupa a tela do celular).
import React, { useEffect, useRef, useState } from 'react';
import { AJUDA_PARADO_MS, FRASE_AJUDA, deveOferecerAjuda, type EstadoAjuda } from '../data/agenteAgil';

const CHAVE = 'murade_ajuda_inatividade_v1';
function ler(): EstadoAjuda {
  try { const s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (s && typeof s.primeiroUsoMs === 'number') return { primeiroUsoMs: s.primeiroUsoMs, ofertas: s.ofertas || {}, desligada: s.desligada === true }; } catch { /* ignora */ }
  const novo = { primeiroUsoMs: Date.now(), ofertas: {}, desligada: false };
  try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* ignora */ }
  return novo;
}
const gravar = (e: EstadoAjuda) => { try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ } };
const hoje = () => new Date().toLocaleDateString('sv-SE');

export const AjudaInatividade: React.FC<{ tela?: string }> = ({ tela }) => {
  const [visivel, setVisivel] = useState(false);
  const ultima = useRef(Date.now());
  const telaRef = useRef('');
  telaRef.current = tela || (typeof location !== 'undefined' ? `${location.pathname}${location.hash}` : '');
  useEffect(() => { ultima.current = Date.now(); setVisivel(false); }, [tela]);
  useEffect(() => {
    const mexeu = () => { ultima.current = Date.now(); };
    const eventos = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    eventos.forEach((ev) => window.addEventListener(ev, mexeu, { capture: true, passive: true }));
    const relogio = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const e = ler();
      if (!deveOferecerAjuda(e, telaRef.current, Date.now(), ultima.current, hoje())) return;
      e.ofertas = { ...e.ofertas, [telaRef.current]: hoje() };
      gravar(e);
      setVisivel(true);
      window.setTimeout(() => setVisivel(false), 8000);
    }, Math.min(5000, AJUDA_PARADO_MS));
    return () => { window.clearInterval(relogio); eventos.forEach((ev) => window.removeEventListener(ev, mexeu, true)); };
  }, []);
  if (!visivel) return null;
  return (
    <div role="status" data-piloto-ui="1" data-piloto-ignorar="1" className="fixed bottom-14 left-3 z-[9998] flex max-w-[78vw] items-center gap-2 rounded-full bg-[#0a2342] px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg">
      <span>{FRASE_AJUDA}</span>
      <button type="button" className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]" onClick={() => { const e = ler(); e.desligada = true; gravar(e); setVisivel(false); }}>Não mostrar mais</button>
      <button type="button" aria-label="Fechar" className="rounded-full bg-white/20 px-1.5 text-[10px]" onClick={() => setVisivel(false)}>✕</button>
    </div>
  );
};
