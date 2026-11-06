// Detector de dificuldade: fica de olho nos cliques da pessoa em botões/links, e avisa quando ela
// clica MUITAS vezes no mesmo lugar em pouco tempo — sinal forte de que está travada ali (se tivesse
// funcionado de primeira, não clicaria de novo). Não precisa que cada tela "avise" quando falha —
// funciona em qualquer botão do sistema, sem precisar instrumentar tela por tela.
//
// Pedido do dono (06/11/2026): quando a pessoa tenta e não consegue por várias vezes, a IA deve
// oferecer ajuda e, se aceito, guiar passo a passo com uma seta na tela.
import { useEffect, useRef } from 'react';

export interface DificuldadeDetectada {
  /** Chave estável do elemento (id, data-guia-id, ou texto) — usada para achar um roteiro de ajuda. */
  chave: string;
  /** Texto visível do botão/link, para a IA poder comentar o que a pessoa está tentando fazer. */
  texto: string;
  /** O próprio elemento clicado, caso o guia precise usá-lo como ponto de partida. */
  elemento: HTMLElement;
}

interface OpcoesDetector {
  /** Quantos cliques no mesmo lugar, dentro da janela de tempo, contam como "travado". Padrão 4. */
  limiteTentativas?: number;
  /** Janela de tempo (ms) em que as tentativas são contadas. Padrão 90s. */
  janelaMs?: number;
  /** Tempo (ms) que a pessoa precisa esperar antes de receber uma nova oferta de ajuda no MESMO
   * lugar, depois de já ter recusado ou ignorado uma oferta ali. Padrão 10 min. */
  cooldownMs?: number;
  /** Chamado quando a dificuldade é detectada. */
  onDificuldade: (d: DificuldadeDetectada) => void;
  /** Liga/desliga o detector sem desmontar o hook (ex.: desligar enquanto o guia já está ativo). */
  ativo?: boolean;
}

const SELETOR_ACIONAVEL = 'button, a, [role="button"], input[type="submit"], input[type="button"]';

function chaveDoElemento(el: HTMLElement): string {
  const porId = el.id && el.id.trim();
  if (porId) return `id:${porId}`;
  const porGuia = el.getAttribute('data-guia-id');
  if (porGuia) return `guia:${porGuia}`;
  const rotulo = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  // Inclui a tela atual pra não confundir botões de nomes iguais em telas diferentes.
  return `txt:${location.hash || location.pathname}:${el.tagName}:${rotulo}`;
}

function textoDoElemento(el: HTMLElement): string {
  return (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Monta e desmonta sozinho um listener de clique global (fase de captura) enquanto `ativo` for true. */
export function useDetectorDificuldade({
  limiteTentativas = 4,
  janelaMs = 90_000,
  cooldownMs = 10 * 60_000,
  onDificuldade,
  ativo = true,
}: OpcoesDetector): void {
  const tentativasRef = useRef<Map<string, number[]>>(new Map());
  const ofertadoEmRef = useRef<Map<string, number>>(new Map());
  const callbackRef = useRef(onDificuldade);
  callbackRef.current = onDificuldade;

  useEffect(() => {
    if (!ativo) return;

    const aoClicar = (evento: MouseEvent) => {
      const alvo = evento.target as HTMLElement | null;
      const acionavel = alvo?.closest<HTMLElement>(SELETOR_ACIONAVEL);
      if (!acionavel) return;

      const chave = chaveDoElemento(acionavel);
      const agora = Date.now();

      const ultimaOferta = ofertadoEmRef.current.get(chave);
      if (ultimaOferta && agora - ultimaOferta < cooldownMs) return; // já ofereceu ajuda aqui recentemente

      const lista = tentativasRef.current.get(chave) ?? [];
      const dentroDaJanela = lista.filter((t) => agora - t < janelaMs);
      dentroDaJanela.push(agora);
      tentativasRef.current.set(chave, dentroDaJanela);

      if (dentroDaJanela.length >= limiteTentativas) {
        tentativasRef.current.set(chave, []); // zera pra não ficar oferecendo de novo a cada clique extra
        ofertadoEmRef.current.set(chave, agora);
        callbackRef.current({ chave, texto: textoDoElemento(acionavel), elemento: acionavel });
      }
    };

    document.addEventListener('click', aoClicar, { capture: true, passive: true });
    return () => document.removeEventListener('click', aoClicar, { capture: true });
  }, [ativo, limiteTentativas, janelaMs, cooldownMs]);
}
