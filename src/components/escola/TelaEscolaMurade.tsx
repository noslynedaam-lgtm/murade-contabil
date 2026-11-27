// ESCOLA MURADE — aba própria para ensinar iniciantes. Trilhas → aulas → progresso, glossário "O que é isso?" e o painel do
// gestor. Adicional pago: sem liberação mostra só a apresentação e o aviso para falar com o fornecedor.
// Celular: sem faixa fixa no topo; abas roláveis e listas em uma coluna.
import React, { useEffect, useState } from 'react';
import { GraduationCap, Search } from 'lucide-react';
import { SISTEMA_ESCOLA, TRILHAS as TRILHAS_DO_SISTEMA, type TermoGlossario, type TrilhaEscola } from '../../data/escolaConteudo';
import { AulaEscolaView, type AulaSemRespostas } from './AulaEscola';
import { PainelGestorEscola } from './PainelGestorEscola';
import { useFalarNaEscola } from './escolaAdaptador';
import { DemonstracaoCompleta } from './DemonstracaoCompleta';
import { ETAPAS_DEMO, TITULO_DEMO } from '../../data/escolaDemonstracao';
import { EVENTO_ABRIR_AULA, ROTULO_BOTAO_TOUR } from '../../data/tourMurad';
import { consumirAulaPendente, iniciarTour } from '../../utils/tourMuradBarramento';

interface Progresso { aulas: Array<{ aulaId: string; quizNota: number | null; concluida: boolean }>; provas: Array<{ praticaId: string; nota: number }>; atribuicoes: Array<{ trilhaId: string }>; nivel: string }
interface Demonstracao { etapas: string[]; suaVez: string[]; completaEm: string | null; totalEtapas: number }
interface Conteudo { trilhas: TrilhaEscola[]; aulas: AulaSemRespostas[]; glossario: TermoGlossario[]; progresso: Progresso; gestor: boolean; demonstracao?: Demonstracao | null }

const MSG_ADICIONAL = 'A Escola Murad é um adicional. Fale com o seu fornecedor para liberar.';
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const TelaEscolaMurade: React.FC<{ onVoltar?: () => void }> = ({ onVoltar }) => {
  const falar = useFalarNaEscola();
  const [estado, setEstado] = useState<{ liberado: boolean; motivo: string } | null>(null);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [aba, setAba] = useState<'trilhas' | 'glossario' | 'gestor'>('trilhas');
  const [aulaAberta, setAulaAberta] = useState<string | null>(null);
  const [demoAberta, setDemoAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');

  const carregar = async () => {
    try {
      const r = await fetch('/api/escola/estado', { credentials: 'same-origin', cache: 'no-store' });
      const e = await r.json().catch(() => ({}));
      setEstado({ liberado: e.liberado === true, motivo: String(e.motivo || MSG_ADICIONAL) });
      if (e.liberado !== true) return;
      const rc = await fetch('/api/escola/conteudo', { credentials: 'same-origin', cache: 'no-store' });
      const c = await rc.json().catch(() => ({}));
      if (c.sucesso) setConteudo(c); else setErro(String(c.motivo || 'Não foi possível abrir a Escola.'));
    } catch { setErro('Sem conexão com o servidor.'); }
  };
  useEffect(() => { void carregar(); }, []);
  // Aula pedida de fora (oferta "Quer uma aula rápida desta tela?" ou a Murad): abre assim que as aulas carregam.
  useEffect(() => {
    if (!conteudo) return undefined;
    const abrir = (id: string | null) => { if (id && conteudo.aulas.some((a) => a.id === id)) { setDemoAberta(false); setAba('trilhas'); setAulaAberta(id); } };
    abrir(consumirAulaPendente());
    const ouvir = (e: Event) => { abrir(consumirAulaPendente() || String((e as CustomEvent<{ id?: string }>).detail?.id || '') || null); };
    window.addEventListener(EVENTO_ABRIR_AULA, ouvir);
    return () => window.removeEventListener(EVENTO_ABRIR_AULA, ouvir);
  }, [conteudo]);

  const cabecalho = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {onVoltar && <button type="button" onClick={onVoltar} className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-800 hover:bg-blue-50">‹ Voltar</button>}
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 sm:text-xl"><GraduationCap size={22} className="text-blue-700" /> Escola Murad</h2>
    </div>
  );

  if (!estado) return <div className="p-3 sm:p-5" data-campo="escola-painel">{cabecalho}<p className="text-sm text-slate-600">{erro || 'Abrindo a Escola…'}</p></div>;

  if (!estado.liberado) return (
    <div className="mx-auto max-w-3xl p-3 sm:p-5" data-campo="escola-painel" data-testid="escola-nao-liberada">
      {cabecalho}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-800">A Escola Murad ensina quem está começando — o funcionário novo do escritório e o contador iniciante — a trabalhar no {SISTEMA_ESCOLA} e a entender o básico de cada assunto.</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
          <li>Trilhas curtas: {TRILHAS_DO_SISTEMA.map((t) => t.titulo).join('; ')}.</li>
          <li>Cada regra com a lei e a fonte oficial; exemplos calculados pelo próprio sistema.</li>
          <li>"Me mostra no sistema" com a seta, perguntas, prática com a Agente e prova numa empresa de treino que nunca grava dado real.</li>
          <li>Painel do gestor com notas, nível e onde cada um mais erra.</li>
        </ul>
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">{MSG_ADICIONAL}</p>
        {estado.motivo !== MSG_ADICIONAL && <p className="mt-1 text-xs text-slate-500">{estado.motivo}</p>}
        <button id="escola-fazer-tour" type="button" onClick={() => iniciarTour()} className="mt-3 rounded-full bg-amber-400 px-4 py-2 text-sm font-extrabold text-slate-900 shadow hover:bg-amber-300">🧭 {ROTULO_BOTAO_TOUR} pelo sistema</button>
      </section>
    </div>
  );

  if (!conteudo) return <div className="p-3 sm:p-5" data-campo="escola-painel">{cabecalho}<p className="text-sm text-slate-600">{erro || 'Carregando as aulas…'}</p></div>;

  const aula = aulaAberta ? conteudo.aulas.find((a) => a.id === aulaAberta) : null;
  const prog = (id: string) => conteudo.progresso.aulas.find((a) => a.aulaId === id);
  const concluidas = conteudo.progresso.aulas.filter((a) => a.concluida).length;
  const atribuidas = new Set(conteudo.progresso.atribuicoes.map((a) => a.trilhaId));
  const termos = busca.trim()
    ? conteudo.glossario.filter((g) => [g.termo, ...g.sinonimos, g.explicacao].some((x) => semAcento(x).includes(semAcento(busca.trim()))))
    : conteudo.glossario;
  const abaBtn = (id: typeof aba, rotulo: string) => (
    <button type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`rounded-full px-3 py-1.5 whitespace-nowrap ${aba === id ? 'bg-blue-700 text-white' : 'bg-white text-slate-700'}`}>{rotulo}</button>
  );

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5" data-campo="escola-painel">
      {cabecalho}
      {/* Topo da Escola: a demonstração completa com a IA (a Agente faz tudo na tela de treino; depois é a sua vez). */}
      {!aula && demoAberta && <div className="mb-3"><DemonstracaoCompleta onFechar={() => { setDemoAberta(false); void carregar(); }} onMudou={() => void carregar()} /></div>}
      {!aula && !demoAberta && (
        <section className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 p-3 text-white shadow">
          <div className="min-w-0">
            <p className="font-extrabold">{TITULO_DEMO}</p>
            <p className="text-xs text-blue-100">A Agente faz na tela de treino, campo a campo: {ETAPAS_DEMO.map((e) => e.titulo).join(' → ')}. Depois é a sua vez.</p>
            {conteudo.demonstracao && <p className="mt-0.5 text-[11px] font-bold text-amber-200">{conteudo.demonstracao.completaEm ? '✅ Você já assistiu a demonstração completa.' : `Você assistiu ${conteudo.demonstracao.etapas.length} de ${conteudo.demonstracao.totalEtapas} etapas.`}{conteudo.demonstracao.suaVez.length ? ` Fez ${conteudo.demonstracao.suaVez.length} na sua vez.` : ''}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button id="escola-demo-completa" type="button" onClick={() => { setAba('trilhas'); setDemoAberta(true); }} className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-blue-800 shadow hover:bg-blue-50">▶ Assistir</button>
            {/* Tour guiado: a Murad passeia pelas telas de verdade, só abrindo e destacando (nunca clica em nada). */}
            <button id="escola-fazer-tour" type="button" title="A Murad mostra as telas do sistema, uma por vez" onClick={() => iniciarTour()} className="rounded-full bg-amber-400 px-4 py-2 text-sm font-extrabold text-slate-900 shadow hover:bg-amber-300">🧭 {ROTULO_BOTAO_TOUR}</button>
          </div>
        </section>
      )}
      {!aula && !demoAberta && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-blue-100 px-2 py-1 font-bold text-blue-900">{concluidas}/{conteudo.aulas.length} aulas concluídas</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-900">Nível: {conteudo.progresso.nivel}</span>
          </div>
          <div className="mb-3 flex gap-1 overflow-x-auto text-sm font-bold" role="tablist">
            {abaBtn('trilhas', 'Trilhas')}
            {abaBtn('glossario', 'O que é isso?')}
            {conteudo.gestor && abaBtn('gestor', 'Painel do gestor')}
          </div>
        </>
      )}

      {aula && <AulaEscolaView key={aula.id} aula={aula} falar={falar} onVoltar={() => { setAulaAberta(null); void carregar(); }} onMudou={() => void carregar()} />}

      {!aula && !demoAberta && aba === 'trilhas' && (
        <div className="space-y-3">
          {conteudo.trilhas.map((t) => {
            const aulas = conteudo.aulas.filter((a) => a.trilha === t.id);
            const feitas = aulas.filter((a) => prog(a.id)?.concluida).length;
            return (
              <section key={t.id} className={`rounded-xl bg-white p-3 shadow-sm ${atribuidas.has(t.id) ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold text-slate-900">{t.icone} {t.titulo}</h3>
                  <span className="text-xs font-semibold text-slate-500">{feitas}/{aulas.length}{atribuidas.has(t.id) ? ' · você vai estudar isto' : ''}</span>
                </div>
                <p className="text-xs text-slate-600">{t.resumo}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${aulas.length ? (feitas / aulas.length) * 100 : 0}%` }} /></div>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {aulas.map((a) => {
                    const p = prog(a.id);
                    return (
                      <li key={a.id}>
                        <button id={`escola-aula-${a.id}`} type="button" onClick={() => setAulaAberta(a.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-2 text-left text-sm hover:bg-blue-50">
                          <span>{p?.concluida ? '✅' : '📘'} {a.titulo}{a.pratica ? ' · prática' : ''}</span>
                          {p?.quizNota !== null && p?.quizNota !== undefined && <span className="text-xs font-bold text-slate-600">{String(p.quizNota).replace('.', ',')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!aula && !demoAberta && aba === 'glossario' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5">
            <Search size={16} className="text-slate-500" />
            <input aria-label="Buscar termo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar termo" className="w-full text-sm outline-none" />
          </label>
          <p className="text-[11px] text-slate-500">Dica: peça à Agente "me explica …" que ela responde usando este glossário.</p>
          {termos.map((g) => (
            <div key={g.termo} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="font-bold text-slate-900">{g.termo}</p>
              <p className="text-sm text-slate-800">{g.explicacao}</p>
              <p className="mt-1 text-[11px] text-slate-500">Fonte: {g.fonte.tipo === 'sistema' ? g.fonte.nome : <a href={g.fonte.url} target="_blank" rel="noreferrer" className="underline">{g.fonte.nome}</a>}
                {g.aula && <> · <button type="button" className="font-semibold text-blue-800 underline" onClick={() => { setAba('trilhas'); setAulaAberta(g.aula!); }}>abrir a aula</button></>}</p>
            </div>
          ))}
          {termos.length === 0 && <p className="text-sm text-slate-600">Nenhum termo encontrado.</p>}
        </div>
      )}

      {!aula && !demoAberta && aba === 'gestor' && conteudo.gestor && <PainelGestorEscola />}
    </div>
  );
};
