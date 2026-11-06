// Guia visual passo a passo: destaca o botão/campo certo na tela, com uma seta e uma legenda, e
// avança sozinho para o próximo passo quando a pessoa clica onde foi indicado. Pedido do dono
// (06/11/2026): "mostre o caminho, com a seta, você clica aqui, vai com a seta, você clica aqui".
import React, { useEffect, useState, useCallback } from 'react';

export interface PassoGuia {
  /** Seletor CSS do elemento a destacar neste passo (ex.: '#btn-menu-calculadora'). */
  seletor: string;
  /** O que dizer/mostrar para a pessoa neste passo. */
  texto: string;
}

interface GuiaPassoAPassoProps {
  /** Roteiro completo. Undefined/[] = nada para mostrar. */
  passos: PassoGuia[] | null;
  /** Chamado a cada passo (inclusive o primeiro), para a assistente poder falar o texto em voz alta. */
  onFalarPasso?: (texto: string) => void;
  /** Chamado quando o roteiro termina (concluído ou cancelado pela pessoa). */
  onConcluir: () => void;
}

interface RetanguloAlvo { top: number; left: number; width: number; height: number }

const MARGEM = 6;

export const GuiaPassoAPasso: React.FC<GuiaPassoAPassoProps> = ({ passos, onFalarPasso, onConcluir }) => {
  const [indice, setIndice] = useState(0);
  const [retangulo, setRetangulo] = useState<RetanguloAlvo | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const passoAtual = passos && passos[indice] ? passos[indice] : null;

  const medir = useCallback(() => {
    if (!passoAtual) { setRetangulo(null); return; }
    const el = document.querySelector<HTMLElement>(passoAtual.seletor);
    if (!el) { setNaoEncontrado(true); setRetangulo(null); return; }
    setNaoEncontrado(false);
    const r = el.getBoundingClientRect();
    setRetangulo({ top: r.top - MARGEM, left: r.left - MARGEM, width: r.width + MARGEM * 2, height: r.height + MARGEM * 2 });
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [passoAtual]);

  // Reinicia no passo 0 sempre que um roteiro NOVO começa (troca de array de passos).
  useEffect(() => { setIndice(0); }, [passos]);

  useEffect(() => {
    if (!passoAtual) return;
    medir();
    onFalarPasso?.(passoAtual.texto);

    const el = document.querySelector<HTMLElement>(passoAtual.seletor);
    const aoClicarNoAlvo = () => {
      if (indice + 1 < (passos?.length ?? 0)) setIndice((i) => i + 1);
      else onConcluir();
    };
    el?.addEventListener('click', aoClicarNoAlvo);

    const aoRolarOuRedimensionar = () => medir();
    window.addEventListener('scroll', aoRolarOuRedimensionar, true);
    window.addEventListener('resize', aoRolarOuRedimensionar);

    return () => {
      el?.removeEventListener('click', aoClicarNoAlvo);
      window.removeEventListener('scroll', aoRolarOuRedimensionar, true);
      window.removeEventListener('resize', aoRolarOuRedimensionar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passoAtual, indice]);

  if (!passoAtual) return null;

  const legendaTop = retangulo ? retangulo.top + retangulo.height + 10 : 0;

  return (
    <div className="fixed inset-0 z-[10001]" style={{ pointerEvents: 'none' }}>
      {/* Fundo escurecido, com um "buraco" recortado no lugar do elemento destacado */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={retangulo ? { WebkitMaskImage: maskComBuraco(retangulo), maskImage: maskComBuraco(retangulo) } : undefined}
      />

      {retangulo && (
        <>
          {/* Anel de destaque ao redor do elemento */}
          <div
            className="absolute rounded-lg border-[3px] border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.35)] animate-pulse"
            style={{ top: retangulo.top, left: retangulo.left, width: retangulo.width, height: retangulo.height }}
          />
          {/* Legenda com o texto do passo, abaixo do elemento (ou acima, se não houver espaço) */}
          <div
            className="absolute flex max-w-[min(90vw,340px)] flex-col items-start gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-2xl"
            style={{
              pointerEvents: 'auto',
              top: legendaTop + 140 > window.innerHeight ? Math.max(8, retangulo.top - 90) : legendaTop,
              left: Math.min(Math.max(8, retangulo.left), window.innerWidth - 300),
            }}
          >
            <div className="flex items-start gap-2">
              <span className="text-base leading-none">👉</span>
              <p className="leading-snug">{passoAtual.texto}</p>
            </div>
            <div className="flex w-full items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">
                Passo {indice + 1} de {passos?.length ?? 0}
              </span>
              <button
                type="button"
                onClick={onConcluir}
                className="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
              >
                Fechar guia
              </button>
            </div>
          </div>
        </>
      )}

      {naoEncontrado && (
        <div
          className="absolute bottom-24 right-3 max-w-[min(88vw,320px)] rounded-xl bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-2xl"
          style={{ pointerEvents: 'auto' }}
        >
          Não encontrei essa parte na tela agora. <button type="button" onClick={onConcluir} className="font-bold text-blue-700 underline cursor-pointer">Fechar guia</button>
        </div>
      )}
    </div>
  );
};

/** Gera uma máscara CSS que deixa tudo escurecido, menos o retângulo do elemento destacado (o "buraco"). */
function maskComBuraco(r: RetanguloAlvo): string {
  const raio = 10;
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'>` +
    `<rect width='100%' height='100%' fill='white'/>` +
    `<rect x='${r.left}' y='${r.top}' width='${r.width}' height='${r.height}' rx='${raio}' fill='black'/>` +
    `</svg>`
  )}")`;
}
