// Cartão compacto (sem faixa fixa nem janela que bloqueia) da apresentação falada: oferta "Quer que eu te conte tudo?" e o tocador
// com legenda, Pausar/Continuar/Pular/Parar e "Me mostra onde" (piloto visível). Tudo é texto fixo: não chama IA.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PERGUNTA_APRESENTACAO, blocosDoAssunto } from '../data/apresentacaoSistema';
import { rotuloDaTela } from '../data/jeitoPadraoContabil';
import { EVENTO_APRESENTACAO, TocadorApresentacao, definirEstadoApresentacao, pedirApresentacao, type PedidoApresentacao } from '../utils/apresentacaoCliente';
import { chamarJeito } from '../utils/meuJeitoCliente';
import { falarHumana, pararHumana } from '../utils/vozHumana';
import { enviarAoPiloto } from './PilotoVisivel';
import type { AssistenteHandle } from '../types/assistenteHandle';

type Props = { assistenteRef: React.MutableRefObject<AssistenteHandle | null>; ehDono: boolean };

export const ApresentacaoSistema: React.FC<Props> = ({ assistenteRef, ehDono }) => {
  const [oferta, setOferta] = useState(false);
  const [, forcar] = useState(0);
  const donoRef = useRef(ehDono); donoRef.current = ehDono;
  const ofertaRef = useRef(false);
  const tocador = useMemo(() => new TocadorApresentacao({
    falar: (texto, fim) => { void falarHumana(texto, fim); },
    calar: () => { pararHumana(); window.speechSynthesis?.cancel(); },
    agendar: (ms, f) => window.setTimeout(f, ms),
    cancelar: (id) => window.clearTimeout(id),
    vozLigada: () => assistenteRef.current?.vozLigada?.() ?? true,
  }), [assistenteRef]);

  useEffect(() => tocador.ouvir(() => { definirEstadoApresentacao({ tocando: tocador.ativo() }); forcar((n) => n + 1); }), [tocador]);
  useEffect(() => () => tocador.parar(false), [tocador]);

  const responder = (r: 'sim' | 'nao' | 'depois') => {
    ofertaRef.current = false; setOferta(false); definirEstadoApresentacao({ ofertaPendente: false });
    void chamarJeito('/api/meu-jeito/apresentacao/resposta', 'POST', { resposta: r }).catch(() => undefined);
    if (r === 'sim') tocador.iniciar(blocosDoAssunto({}, donoRef.current));
  };

  useEffect(() => {
    const ouvir = (e: Event) => {
      const p = (e as CustomEvent<PedidoApresentacao>).detail; if (!p) return;
      if (p.acao === 'oferta') { ofertaRef.current = true; setOferta(true); definirEstadoApresentacao({ ofertaPendente: true }); return; }
      if (p.acao === 'sim' || p.acao === 'nao' || p.acao === 'depois') { if (ofertaRef.current) responder(p.acao); return; }
      if (p.acao === 'iniciar') { ofertaRef.current = false; setOferta(false); definirEstadoApresentacao({ ofertaPendente: false }); tocador.iniciar(blocosDoAssunto({ secao: p.secao, modulo: p.modulo }, donoRef.current)); return; }
      if (p.acao === 'pausar') tocador.pausar();
      else if (p.acao === 'continuar') tocador.continuar();
      else if (p.acao === 'pular') tocador.pular();
      else if (p.acao === 'parar') tocador.parar();
      else if (p.acao === 'mostrar_onde') mostrarOnde();
    };
    window.addEventListener(EVENTO_APRESENTACAO, ouvir);
    return () => window.removeEventListener(EVENTO_APRESENTACAO, ouvir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocador]);

  const snap = tocador.instantaneo();
  const mostrarOnde = () => {
    const b = tocador.instantaneo().bloco; if (!b?.tela) return;
    tocador.pausar();
    // O piloto visível leva a pessoa à tela (menu, rolagem e seta). Depois ela diz "continua".
    enviarAoPiloto({ titulo: `Mostrando: ${rotuloDaTela(b.tela)}`, passos: [{ tipo: 'navegar', alvo: `#btn-menu-${b.tela}`, legenda: `Abrindo a tela ${rotuloDaTela(b.tela)}` }] });
  };

  useEffect(() => { if (snap.estado !== 'fim') return undefined; const id = window.setTimeout(() => tocador.parar(), 3000); return () => window.clearTimeout(id); }, [snap.estado, tocador]);
  if (!oferta && !tocador.ativo() && snap.estado !== 'fim') return null;
  const caixa = 'fixed bottom-[9rem] left-3 z-[105] w-[min(92vw,360px)] rounded-xl border border-blue-300 bg-white p-3 shadow-2xl';
  if (oferta) return (
    <div role="dialog" aria-label="Apresentação do sistema" className={caixa}>
      <p className="text-sm font-semibold text-slate-900">{PERGUNTA_APRESENTACAO}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => responder('sim')} className="flex-1 rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white">Sim, me conte</button>
        <button type="button" onClick={() => responder('depois')} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Agora não</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Você pode pedir quando quiser: "o que o sistema faz?".</p>
    </div>
  );
  const b = snap.bloco;
  return (
    <div role="region" aria-label="Apresentação do sistema" aria-live="polite" className={caixa}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">{b?.titulo ?? 'Apresentação'} · {Math.min(snap.indice + 1, snap.total)}/{snap.total}</p>
        <button type="button" onClick={() => tocador.parar()} aria-label="Fechar a apresentação" className="h-8 w-8 rounded-lg border border-slate-300 text-sm font-bold">×</button>
      </div>
      <p className="mt-1 text-sm text-slate-900">{b?.falar ?? 'Fim da apresentação.'}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {snap.estado === 'pausado'
          ? <button type="button" onClick={() => tocador.continuar()} className="rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-bold text-white">Continuar</button>
          : <button type="button" onClick={() => tocador.pausar()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">Pausar</button>}
        <button type="button" onClick={() => tocador.pular()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">Pular bloco</button>
        {b?.tela && <button type="button" onClick={mostrarOnde} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-900">Me mostra onde</button>}
      </div>
    </div>
  );
};
export { pedirApresentacao };
