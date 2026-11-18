// Piloto Visível: recebe o roteiro da Agente IA (evento 'murade:piloto'), conduz a tela e mostra controles compactos
// (sem faixa fixa: um cartão pequeno no canto). Toda a lógica está em src/utils/pilotoVisivel.ts.
import React, { useEffect, useRef, useState } from 'react';
import {
  PilotoExecutor, aplicarIntencaoAoPiloto, criarAmbienteDom, pilotoAtivo, registrarPilotoAtivo, validarPlanoPiloto,
  type InstantaneoPiloto, type Ritmo, type RespostaPiloto,
} from '../utils/pilotoVisivel';

export const EVENTO_PILOTO = 'murade:piloto';
/** Envia um roteiro (ou comando) da Agente para o piloto. */
export const enviarAoPiloto = (r: RespostaPiloto): void => { window.dispatchEvent(new CustomEvent(EVENTO_PILOTO, { detail: r })); };

interface Props {
  tabAtiva: string;
  telasValidas: ReadonlySet<string>;
  navegarPara: (tela: string) => void;
  /** CNPJs (só caracteres) que a sessão pode usar; o piloto nunca escolhe empresa fora desta lista. */
  cnpjsPermitidos: string[];
  empresaAtual: string;
  empresaPronta: boolean;
  selecionarEmpresa: (cnpj: string) => void;
  /** A Agente fala (se a voz estiver ligada) e escreve a mensagem na conversa. */
  aoFalar: (texto: string) => void;
}

const RITMOS: Ritmo[] = ['devagar', 'normal', 'rapido'];
const ROTULO_RITMO: Record<Ritmo, string> = { devagar: 'Devagar', normal: 'Normal', rapido: 'Rápido' };
const lerRitmo = (): Ritmo => { try { const r = localStorage.getItem('murade_piloto_ritmo'); return r === 'devagar' || r === 'rapido' ? r : 'normal'; } catch { return 'normal'; } };

export const PilotoVisivel: React.FC<Props> = (props) => {
  const ref = useRef(props); ref.current = props;
  const execRef = useRef<PilotoExecutor | null>(null);
  const [snap, setSnap] = useState<InstantaneoPiloto | null>(null);
  const [oculto, setOculto] = useState(false);

  // A tela mudou: se não foi o piloto que mudou, é interferência do contador.
  useEffect(() => { execRef.current?.telaMudou(props.tabAtiva); }, [props.tabAtiva]);

  useEffect(() => {
    const aoReceber = (e: Event) => {
      const r = (e as CustomEvent).detail as RespostaPiloto;
      if (r && typeof r === 'object' && 'comando' in r) { aplicarIntencaoAoPiloto(r.comando); return; }
      const v = validarPlanoPiloto(r);
      if (!('plano' in v)) { ref.current.aoFalar('Não consegui preparar o roteiro na tela. Faça esta parte manualmente.'); return; }
      pilotoAtivo()?.cancelar();
      const permitido = (c: string) => ref.current.cnpjsPermitidos.includes(c);
      const amb = criarAmbienteDom({
        telasValidas: ref.current.telasValidas,
        navegarPara: (t) => ref.current.navegarPara(t),
        selecionarEmpresa: (c) => { if (!permitido(c)) return false; ref.current.selecionarEmpresa(c); return true; },
        telaAtual: () => ref.current.tabAtiva,
        empresaAtual: () => ref.current.empresaAtual,
        empresaPronta: () => ref.current.empresaPronta,
      });
      const exec = new PilotoExecutor(v.plano, amb, {
        ritmo: lerRitmo(),
        aoMudar: (i) => { setSnap(i); setOculto(false); },
        aoFalar: (t) => ref.current.aoFalar(t),
        aoFim: (res) => {
          // Registro no log de ações da Agente: só título, contagens e estado. Nunca valores digitados.
          void fetch('/api/ai/agente/piloto/registro', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: res.titulo, estado: res.estado, passosFeitos: res.passosFeitos, total: res.total, interferencias: res.interferencias, recusados: res.recusados, usouSegundoPlano: res.usouSegundoPlano }) }).catch(() => undefined);
          window.setTimeout(() => { if (execRef.current === exec) setOculto(true); }, res.estado === 'erro' ? 12000 : 3500);
        },
      });
      execRef.current = exec; registrarPilotoAtivo(exec);
      void exec.iniciar();
    };
    window.addEventListener(EVENTO_PILOTO, aoReceber);
    return () => window.removeEventListener(EVENTO_PILOTO, aoReceber);
  }, []);

  // Interferência: só sabemos QUE houve toque ou tecla (isTrusted = pessoa de verdade). Nunca lemos a tecla nem o campo.
  useEffect(() => {
    const dentro = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('[data-piloto-ignorar]');
    const toque = (e: Event) => { if (e.isTrusted && !dentro(e.target)) execRef.current?.interferir('toque'); };
    const tecla = (e: Event) => { if (e.isTrusted && !dentro(e.target)) execRef.current?.interferir('teclado'); };
    window.addEventListener('pointerdown', toque, true);
    window.addEventListener('keydown', tecla, true);
    return () => { window.removeEventListener('pointerdown', toque, true); window.removeEventListener('keydown', tecla, true); };
  }, []);

  const exec = execRef.current;
  if (!snap || !exec || oculto) return null;
  const e = snap.estado;
  if (e === 'cancelado') return null;
  const btn = 'min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold';
  const trocarRitmo = () => { const prox = RITMOS[(RITMOS.indexOf(snap.ritmo) + 1) % RITMOS.length]; try { localStorage.setItem('murade_piloto_ritmo', prox); } catch { /* vale só agora */ } exec.definirRitmo(prox); };

  if (e === 'segundo_plano') {
    return (
      <div data-piloto-ignorar="1" role="status" className="fixed bottom-3 left-3 z-[10060] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full bg-slate-900 py-1.5 pl-3 pr-1.5 text-xs font-semibold text-white shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
        <span className="truncate">Fazendo em segundo plano…</span>
        <button type="button" onClick={() => exec.cancelar()} className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">Cancelar</button>
      </div>
    );
  }

  return (
    <div data-piloto-ignorar="1" role="status" aria-live="polite" className="fixed bottom-3 left-3 z-[10060] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-slate-900 p-2.5 text-white shadow-2xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <p className="line-clamp-3 text-xs leading-snug">{snap.legenda || snap.titulo}</p>
      {e !== 'concluido' && <p className="mt-0.5 text-[10px] text-slate-400">Passo {snap.passo} de {snap.total}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {e === 'rodando' && (<>
          <button type="button" onClick={() => exec.pausarPeloBotao()} className={`${btn} bg-white/15 hover:bg-white/25`}>Pausar</button>
          <button type="button" onClick={trocarRitmo} className={`${btn} bg-white/15 hover:bg-white/25`} aria-label="Velocidade do piloto">{ROTULO_RITMO[snap.ritmo]}</button>
          <button type="button" onClick={() => exec.cancelar()} className={`${btn} text-rose-200 hover:bg-white/10`}>Cancelar</button>
        </>)}
        {e === 'pausado' && (<>
          <button type="button" onClick={() => exec.retomar()} className={`${btn} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}>Continuar de onde parou</button>
          <button type="button" onClick={() => exec.segundoPlano()} className={`${btn} bg-white/15 hover:bg-white/25`}>Em segundo plano</button>
          <button type="button" onClick={() => exec.cancelar()} className={`${btn} text-rose-200 hover:bg-white/10`}>Cancelar</button>
        </>)}
        {e === 'aguardando_confirmacao' && (<>
          {snap.botaoForaDaTela && <button type="button" onClick={() => exec.retomar()} className={`${btn} bg-emerald-500 text-slate-950 hover:bg-emerald-400`}>Ir ao botão</button>}
          <button type="button" onClick={() => exec.cancelar()} className={`${btn} text-rose-200 hover:bg-white/10`}>Cancelar</button>
          {!snap.botaoForaDaTela && <span className="text-[10px] text-slate-300">Ou diga: "pode confirmar"</span>}
        </>)}
        {(e === 'erro' || e === 'concluido') && <button type="button" onClick={() => setOculto(true)} className={`${btn} bg-white/15 hover:bg-white/25`}>Fechar</button>}
      </div>
    </div>
  );
};
