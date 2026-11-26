import { useEffect } from 'react';
import type React from 'react';

// Tela do sistema "presa" na altura visível do celular (pedido do dono, 25/11/2026: no Android instalado o topo ficava escondido
// atrás da barra de status). A página inteira nunca rola — só a barra lateral e o meio rolam, cada um sozinho. Se alguma coisa
// (teclado, rolagem automática para um campo, posição guardada ao recarregar) empurrar a página para cima, ela volta ao topo.
// O CSS da classe "tela-app-fixa" está no index.css (html/body sem rolagem; na impressão volta ao normal).
export function useTelaFixa(): void {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('tela-app-fixa');
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { /* navegador antigo */ }
    const voltarAoTopo = () => {
      if (window.scrollY || html.scrollTop || document.body.scrollTop || window.scrollX || html.scrollLeft || document.body.scrollLeft) { window.scrollTo(0, 0); html.scrollTop = 0; document.body.scrollTop = 0; html.scrollLeft = 0; document.body.scrollLeft = 0; }
    };
    voltarAoTopo();
    window.addEventListener('scroll', voltarAoTopo, { passive: true });
    return () => { html.classList.remove('tela-app-fixa'); window.removeEventListener('scroll', voltarAoTopo); };
  }, []);
}

/** onScroll da caixa de fora (a que segura topo + lateral + meio): ela nunca rola (nem para baixo nem para o lado), só as de dentro. */
export const travarRolagemDaCaixa = (e: React.UIEvent<HTMLElement>): void => {
  const el = e.currentTarget;
  if (el.scrollTop) el.scrollTop = 0;
  if (el.scrollLeft) el.scrollLeft = 0; // nem para o lado (a tela "ia para o lado" no celular)
};
