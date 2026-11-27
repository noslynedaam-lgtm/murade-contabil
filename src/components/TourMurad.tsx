// TOUR GUIADO DA MURAD (igual no DP, Fiscal e Contábil): "Murad, me mostra o sistema".
// Passeia sozinho pelas telas do menu, uma por vez: abre a tela, a seta vai até a área principal (com um contorno), fala UMA frase
// curta e avança em 4 a 6 s. Pausar / Próxima / Sair do tour; a pessoa mexeu = pausa e volta sozinho depois de ~5 s parada.
// SEGURANÇA: o tour SÓ NAVEGA (pela função de navegação do sistema) e DESTACA. Nunca clica em nada da tela: nem menu, nem botão.
// A barra é pequena e fica embaixo (no celular não cobre a tela); some no fim.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EVENTO_TOUR_COMANDO, EVENTO_TOUR_INICIAR, EVENTO_TOUR_MUDOU, FRASE_FIM_TOUR, FRASE_INICIO_TOUR, SITUACAO_INICIAL,
  tempoDaParada, tourPodeRetomar, transicaoTour, type ComandoTour, type EventoTour, type ParadaTour, type SituacaoTour,
} from '../data/tourMurad';
import { definirTourAtivo } from '../utils/tourMuradBarramento';
import { esconderCursor, moverCursorAte, naTela } from '../utils/cursorPiloto';
import { falarHumana, humanaFalando, pararHumana } from '../utils/vozHumana';
import { avisarMudancaAgente, esquecerRetomada, registrarParador } from '../utils/agenteParar';

interface Props {
  paradas: ParadaTour[];
  /** Tela aberta agora (mesmo id das paradas). */
  telaAtual: string;
  /** Navegação do próprio sistema (não clica em nada). */
  navegar: (rota: string) => void;
  /** Seletor da área de conteúdo do sistema (destaque quando a tela não tem painel próprio no mapa). */
  areaPrincipal: string;
  /** Rota da Escola (botão "Abrir a Escola" no fim). */
  rotaEscola?: string;
}

const dorme = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const ID_CONTORNO = 'murad-tour-contorno';
const reduzido = () => { try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; } };

function contorno(alvo: Element | null): void {
  let el = document.getElementById(ID_CONTORNO) as HTMLDivElement | null;
  if (!alvo) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = ID_CONTORNO;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-piloto-ui', '1');
    el.setAttribute('data-tour-ui', '1');
    document.body.appendChild(el);
  }
  const r = alvo.getBoundingClientRect();
  const top = Math.max(4, r.top + 2); const left = Math.max(4, r.left + 2);
  const right = Math.min(window.innerWidth - 4, r.right - 2); const bottom = Math.min(window.innerHeight - 4, r.bottom - 2);
  el.style.cssText = `position:fixed;z-index:2147483500;pointer-events:none;border:3px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 4px rgba(245,158,11,.25);left:${left}px;top:${top}px;width:${Math.max(0, right - left)}px;height:${Math.max(0, bottom - top)}px;transition:${reduzido() ? 'none' : 'all .35s ease'}`;
}

/** Elemento da área principal desta parada: o painel do mapa (se estiver na tela) ou a área de conteúdo do sistema. */
function areaDaParada(p: ParadaTour, areaPrincipal: string): HTMLElement | null {
  const painel = p.destaque ? document.querySelector<HTMLElement>(p.destaque) : null;
  if (painel && painel.getBoundingClientRect().height > 0) return painel;
  return document.querySelector<HTMLElement>(areaPrincipal);
}
/** Onde a seta aponta: o título da tela dentro da área (ou o canto da área). */
function pontoDaSeta(area: HTMLElement): Element {
  const titulo = Array.from(area.querySelectorAll('h1, h2, h3')).find((h) => naTela(h));
  return titulo || area;
}
const digitandoEmCampo = (): boolean => {
  const a = document.activeElement as HTMLElement | null;
  if (!a || a.closest('[data-tour-ui]')) return false;
  return a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
};

export const TourMurad: React.FC<Props> = ({ paradas, telaAtual, navegar, areaPrincipal, rotaEscola = 'escola' }) => {
  const [sit, setSit] = useState<SituacaoTour>(SITUACAO_INICIAL);
  const sitRef = useRef(sit); sitRef.current = sit;
  const paradasRef = useRef(paradas); paradasRef.current = paradas;
  const telaRef = useRef(telaAtual); telaRef.current = telaAtual;
  const navegarRef = useRef(navegar); navegarRef.current = navegar;
  const geracao = useRef(0);
  const ultimaInteracao = useRef(0);
  const [fimVisivel, setFimVisivel] = useState(false);

  const enviar = useCallback((e: EventoTour) => {
    setSit((s) => transicaoTour(s, e, e === 'iniciar' ? paradasRef.current.length : s.total));
  }, []);

  // Liga/desliga para o chat e para o PARAR da Agente.
  useEffect(() => {
    const ligado = sit.estado === 'andando' || sit.estado === 'pausado';
    definirTourAtivo(ligado);
    avisarMudancaAgente();
    try { window.dispatchEvent(new CustomEvent(EVENTO_TOUR_MUDOU, { detail: { estado: sit.estado, indice: sit.indice, total: sit.total } })); } catch { /* ignora */ }
  }, [sit.estado, sit.indice, sit.total]);

  useEffect(() => registrarParador({
    id: 'tour',
    ativo: () => sitRef.current.estado === 'andando',
    parar: () => {
      const s = sitRef.current;
      if (s.estado !== 'andando' && s.estado !== 'pausado') return false;
      pararHumana();
      setSit((x) => transicaoTour(x, 'pausar'));
      return { retomavel: true };
    },
    continuar: () => setSit((x) => transicaoTour(x, 'continuar')),
  }), []);

  // Pedidos de fora: "me mostra o sistema" (chat/voz), botão "Fazer tour" da Escola e os comandos falados.
  useEffect(() => {
    const iniciar = () => { setFimVisivel(false); ultimaInteracao.current = 0; enviar('iniciar'); };
    const comando = (ev: Event) => { const c = (ev as CustomEvent<ComandoTour>).detail; if (c) enviar(c); };
    window.addEventListener(EVENTO_TOUR_INICIAR, iniciar);
    window.addEventListener(EVENTO_TOUR_COMANDO, comando as EventListener);
    return () => { window.removeEventListener(EVENTO_TOUR_INICIAR, iniciar); window.removeEventListener(EVENTO_TOUR_COMANDO, comando as EventListener); };
  }, [enviar]);

  // A pessoa mexeu (toque, clique, tecla, rolagem fora da barra do tour): pausa; parada ~5 s sem digitar: volta sozinho.
  useEffect(() => {
    if (sit.estado !== 'andando' && sit.estado !== 'pausado') return undefined;
    const mexeu = (e: Event) => {
      if (!e.isTrusted) return;
      const alvo = e.target as Element | null;
      if (alvo && typeof alvo.closest === 'function' && alvo.closest('[data-tour-ui]')) return;
      if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') return; // Esc é o PARAR da Agente
      ultimaInteracao.current = Date.now();
      if (sitRef.current.estado === 'andando') { pararHumana(); enviar('mexeu'); }
    };
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    eventos.forEach((ev) => window.addEventListener(ev, mexeu, { capture: true, passive: true }));
    const relogio = window.setInterval(() => {
      if (tourPodeRetomar(sitRef.current, Date.now() - ultimaInteracao.current, digitandoEmCampo())) enviar('retomar_sozinho');
    }, 500);
    return () => { eventos.forEach((ev) => window.removeEventListener(ev, mexeu, true)); window.clearInterval(relogio); };
  }, [sit.estado, enviar]);

  // Cada parada: abre a tela, destaca, fala e marca o tempo. Pausado: fica parado na tela (o contorno continua).
  useEffect(() => {
    const minha = ++geracao.current;
    const vale = () => minha === geracao.current;
    if (sit.estado === 'inativo') { contorno(null); esconderCursor(); return undefined; }
    if (sit.estado === 'fim') {
      contorno(null); esconderCursor();
      setFimVisivel(true);
      void falarHumana(FRASE_FIM_TOUR);
      const t = window.setTimeout(() => { if (vale()) { setFimVisivel(false); enviar('encerrar'); } }, 12000);
      return () => window.clearTimeout(t);
    }
    const p = paradasRef.current[sit.indice];
    if (!p) { enviar('encerrar'); return undefined; }
    if (sit.estado === 'pausado') return undefined;
    let tempo = 0;
    (async () => {
      // A seta passa pelo item do menu quando ele está à vista (só passa: quem abre a tela é a navegação do sistema).
      const menu = p.menu ? document.querySelector(p.menu) : null;
      if (menu && naTela(menu) && telaRef.current !== p.rota) { await moverCursorAte(menu); await dorme(250); }
      if (!vale()) return;
      if (telaRef.current !== p.rota) navegarRef.current(p.rota);
      await dorme(500);
      if (!vale()) return;
      const area = areaDaParada(p, areaPrincipal);
      if (area) {
        try { area.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch { /* sem rolagem */ }
        contorno(area);
        await moverCursorAte(pontoDaSeta(area));
      } else { contorno(null); esconderCursor(); }
      if (!vale()) return;
      const fala = `${sit.indice === 0 ? `${FRASE_INICIO_TOUR} ` : ''}${p.nome}. ${p.fala}`;
      let terminouFala = false;
      void falarHumana(fala, () => { terminouFala = true; });
      const espera = tempoDaParada(p.fala) + (sit.indice === 0 ? 3000 : 0);
      tempo = window.setTimeout(async () => {
        // Espera a frase terminar (no máximo mais 3 s) antes de passar para a próxima tela.
        for (let i = 0; i < 12 && !terminouFala && humanaFalando() && vale(); i += 1) await dorme(250);
        if (vale()) enviar('tempo');
      }, espera);
    })();
    return () => { if (tempo) window.clearTimeout(tempo); };
  }, [sit.estado, sit.indice, areaPrincipal, enviar]);

  // Contorno acompanha a rolagem e o tamanho da janela enquanto o tour está ligado.
  useEffect(() => {
    if (sit.estado !== 'andando' && sit.estado !== 'pausado') return undefined;
    const ajustar = () => { const p = paradasRef.current[sitRef.current.indice]; if (p && document.getElementById(ID_CONTORNO)) contorno(areaDaParada(p, areaPrincipal)); };
    window.addEventListener('resize', ajustar);
    window.addEventListener('scroll', ajustar, true);
    return () => { window.removeEventListener('resize', ajustar); window.removeEventListener('scroll', ajustar, true); };
  }, [sit.estado, areaPrincipal]);

  // Saiu do tour: tira o contorno, a seta e a voz.
  useEffect(() => () => { contorno(null); esconderCursor(); definirTourAtivo(false); }, []);
  const sair = () => { pararHumana(); esquecerRetomada('tour'); setFimVisivel(false); enviar('sair'); };

  if (sit.estado === 'inativo' && !fimVisivel) return null;
  const p = paradas[sit.indice];
  const botao = 'rounded-full px-2.5 py-1 text-[11px] font-bold sm:text-xs';
  return (
    <div role="status" aria-live="polite" data-piloto-ui="1" data-piloto-ignorar="1" data-tour-ui="1" id="murad-tour-barra"
      className="fixed bottom-2 left-2 right-2 z-[2147483550] mx-auto max-w-md rounded-2xl bg-[#0a2342]/95 px-3 py-2 text-white shadow-2xl sm:left-auto sm:right-4 sm:w-[24rem]">
      {sit.estado === 'fim' || fimVisivel ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-semibold sm:text-sm">{FRASE_FIM_TOUR}</p>
          <button type="button" className={`${botao} bg-amber-400 text-slate-900`} onClick={() => { setFimVisivel(false); enviar('encerrar'); navegarRef.current(rotaEscola); }}>Abrir a Escola</button>
          <button type="button" aria-label="Fechar" className={`${botao} bg-white/20`} onClick={sair}>Fechar</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-slate-900">{sit.indice + 1}/{sit.total}</span>
            <p className="min-w-0 flex-1 truncate text-xs font-extrabold sm:text-sm">{p?.nome}</p>
            {sit.estado === 'pausado' && <span className="shrink-0 text-[10px] font-semibold text-amber-200">{sit.pausaPorMexer ? 'pausado (volto sozinha)' : 'pausado'}</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-blue-100 sm:text-xs">{p?.fala}</p>
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            {sit.estado === 'pausado'
              ? <button type="button" className={`${botao} bg-emerald-500 text-white`} onClick={() => enviar('continuar')}>Continuar</button>
              : <button type="button" className={`${botao} bg-white/20`} onClick={() => { pararHumana(); enviar('pausar'); }}>Pausar</button>}
            <button type="button" className={`${botao} bg-white/20`} onClick={() => { pararHumana(); enviar('proxima'); }}>Próxima</button>
            <button type="button" className={`${botao} bg-red-500 text-white`} onClick={sair}>Sair do tour</button>
          </div>
        </>
      )}
    </div>
  );
};
