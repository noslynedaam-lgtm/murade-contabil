// OFERTA DE AULA NA PRIMEIRA SEMANA (igual no DP, Fiscal e Contábil).
// Nos primeiros 7 dias do escritório (data de criação do escritório, que vem do servidor), ao abrir uma tela que tem aula na
// Escola, um balãozinho pequeno pergunta "Quer uma aula rápida desta tela?" [Sim] [Agora não] [Não perguntar mais].
// Uma vez por tela por usuário; a escolha fica neste aparelho, separada por escritório e por usuário. Não é janela que trava a tela.
// Só aparece com a Escola liberada para o escritório, sem tour andando e sem a Murad falando ou agindo.
import React, { useEffect, useRef, useState } from 'react';
import {
  FRASE_OFERTA_AULA, aulaDaTela, chaveOfertaAula, deveOferecerAula, lerEstadoOfertaAula, registrarRespostaOfertaAula,
  type EstadoOfertaAula, type RespostaOfertaAula,
} from '../data/tourMurad';
import { pedirAberturaDeAula, tourAtivo } from '../utils/tourMuradBarramento';
import { agenteAgindo, usuarioDaVozAtual } from '../utils/agenteParar';

interface AulaComTela { id: string; titulo: string; meMostra: { tela: string } }
interface Props {
  tela: string;
  /** Abre a tela da Escola (a aula pedida abre sozinha lá). */
  abrirEscola: () => void;
  rotaEscola?: string;
}
interface EstadoEscritorio { liberado: boolean; criadoEm: string | null; escritorio: string; usuario: string; aulas: AulaComTela[] }

const ESPERA_ANTES_MS = 1500;
const SOME_SOZINHO_MS = 15000;

export const OfertaAulaTela: React.FC<Props> = ({ tela, abrirEscola, rotaEscola = 'escola' }) => {
  const [esc, setEsc] = useState<EstadoEscritorio | null>(null);
  const [oferta, setOferta] = useState<{ tela: string; aulaId: string; titulo: string } | null>(null);
  const chave = esc ? chaveOfertaAula(esc.escritorio, esc.usuario || usuarioDaVozAtual()) : '';

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/escola/estado', { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) return;
        const e = await r.json().catch(() => ({}));
        if (vivo) setEsc({ liberado: e.liberado === true, criadoEm: typeof e.escritorioCriadoEm === 'string' ? e.escritorioCriadoEm : null, escritorio: String(e.escritorioChave || ''), usuario: String(e.usuarioChave || ''),
          aulas: Array.isArray(e.aulasPorTela) ? e.aulasPorTela.filter((a: any) => a && typeof a.id === 'string' && typeof a.tela === 'string').map((a: any) => ({ id: a.id, titulo: String(a.titulo || ''), meMostra: { tela: a.tela } })) : [] });
      } catch { /* sem servidor: não oferece */ }
    })();
    return () => { vivo = false; };
  }, []);

  const ler = (): EstadoOfertaAula => { try { return lerEstadoOfertaAula(localStorage.getItem(chave)); } catch { return lerEstadoOfertaAula(null); } };
  const gravar = (e: EstadoOfertaAula) => { try { localStorage.setItem(chave, JSON.stringify(e)); } catch { /* sem armazenamento: só não lembra */ } };
  const responder = (r: RespostaOfertaAula) => {
    if (!oferta) return;
    gravar(registrarRespostaOfertaAula(ler(), oferta.tela, r));
    const id = oferta.aulaId;
    setOferta(null);
    if (r === 'sim') { pedirAberturaDeAula(id); abrirEscola(); }
  };

  // Abriu uma tela: espera um pouco (a tela carregar) e oferece, se for o caso. Trocou de tela: a oferta anterior some.
  const telaRef = useRef(tela); telaRef.current = tela;
  useEffect(() => {
    setOferta(null);
    if (!esc?.liberado || !esc.escritorio || !tela || tela === rotaEscola) return undefined;
    const aula: AulaComTela | null = aulaDaTela<AulaComTela>(esc.aulas, tela);
    const t = window.setTimeout(() => {
      if (telaRef.current !== tela) return;
      const estado = ler();
      if (!deveOferecerAula({ criadoEm: esc.criadoEm, agoraMs: Date.now(), tela, temAula: !!aula, estado, ocupado: tourAtivo() || agenteAgindo() })) return;
      gravar(registrarRespostaOfertaAula(estado, tela, 'mostrada')); // uma vez por tela, mesmo que a pessoa ignore
      setOferta({ tela, aulaId: aula!.id, titulo: aula!.titulo });
    }, ESPERA_ANTES_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, esc, rotaEscola]);

  useEffect(() => {
    if (!oferta) return undefined;
    const t = window.setTimeout(() => setOferta(null), SOME_SOZINHO_MS);
    return () => window.clearTimeout(t);
  }, [oferta]);

  if (!oferta) return null;
  const b = 'rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-[11px]';
  return (
    <div role="status" data-piloto-ui="1" data-piloto-ignorar="1" data-oferta-aula="1"
      className="fixed bottom-16 left-3 z-[9998] flex max-w-[86vw] flex-wrap items-center gap-1.5 rounded-2xl bg-[#0a2342] px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg sm:max-w-sm">
      <span className="min-w-0 basis-full sm:basis-auto" title={oferta.titulo}>{FRASE_OFERTA_AULA}</span>
      <button type="button" className={`${b} bg-amber-400 text-slate-900`} onClick={() => responder('sim')}>Sim</button>
      <button type="button" className={`${b} bg-white/20`} onClick={() => responder('agora_nao')}>Agora não</button>
      <button type="button" className={`${b} bg-white/10 text-blue-100`} onClick={() => responder('nunca')}>Não perguntar mais</button>
    </div>
  );
};
