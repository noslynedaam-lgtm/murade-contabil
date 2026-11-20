// Painel do gestor da Escola Murade (só o administrador do escritório): quem fez quais aulas, notas, nível, histórico das
// provas, onde mais erra, trilhas atribuídas ("você vai estudar isto") e o "Rodar agora" do Robô Conferidor da Escola.
import React, { useEffect, useState } from 'react';
import { useConfirmarRemocao } from './escolaAdaptador';

interface Prova { praticaId: string; nota: number; nivel: string; duracaoMs: number | null; erros: string[]; em: string }
interface Aluno { userId: string; login: string; aulasFeitas: number; totalAulas: number; mediaQuiz: number | null; nivel: string; provas: Prova[]; atribuicoes: Array<{ trilhaId: string; atribuidoEm: string }>; ondeMaisErra: string[]; ultimaAtividade: string | null; parado: Array<{ trilhaId: string; diasParado: number }> }
interface Trilha { id: string; titulo: string }

const COR_NIVEL: Record<string, string> = { 'Iniciante': 'bg-slate-200 text-slate-800', 'Em formação': 'bg-amber-100 text-amber-900', 'Pronto para fazer com conferência': 'bg-blue-100 text-blue-900', 'Autônomo': 'bg-emerald-100 text-emerald-900' };
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export const PainelGestorEscola: React.FC = () => {
  const [alunos, setAlunos] = useState<Aluno[] | null>(null);
  const [trilhas, setTrilhas] = useState<Trilha[]>([]);
  const [msg, setMsg] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [robo, setRobo] = useState('');
  const confirmar = useConfirmarRemocao();

  const carregar = async () => {
    try {
      const r = await fetch('/api/escola/gestor', { credentials: 'same-origin' });
      const c = await r.json().catch(() => ({}));
      if (c.sucesso) { setAlunos(c.alunos); setTrilhas(c.trilhas); } else setMsg(String(c.motivo || 'Não foi possível abrir o painel.'));
    } catch { setMsg('Sem conexão com o servidor.'); }
  };
  useEffect(() => { void carregar(); }, []);

  const post = async (url: string, corpo: unknown) => {
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      return await r.json().catch(() => ({}));
    } catch { return { sucesso: false, motivo: 'Sem conexão com o servidor.' }; }
  };
  const atribuir = async (a: Aluno) => {
    const trilhaId = escolha[a.userId]; if (!trilhaId) { setMsg('Escolha a trilha.'); return; }
    const c = await post('/api/escola/atribuir', { login: a.login, trilhaId });
    setMsg(String(c.mensagem || c.motivo || '')); void carregar();
  };
  const tirar = async (a: Aluno, trilhaId: string) => {
    const nome = trilhas.find((t) => t.id === trilhaId)?.titulo || trilhaId;
    const ok = await confirmar.pedir(`a trilha "${nome}" de ${a.login}`, ['Só esta trilha deste aluno; as notas e o progresso continuam guardados.', 'Dá para atribuir de novo quando quiser.']);
    if (!ok) return;
    const c = await post('/api/escola/desatribuir', { login: a.login, trilhaId, confirmar: true });
    setMsg(c.sucesso ? 'Trilha retirada.' : String(c.motivo || 'Não foi possível.')); void carregar();
  };
  const rodarAgora = async () => {
    setRobo('Rodando…');
    const c = await post('/api/escola/robo/rodar-agora', {});
    setRobo(c.sucesso ? `${c.resumo}${c.conteudo?.length ? ` Problemas: ${c.conteudo.map((x: any) => `${x.onde}: ${x.problema}`).join('; ')}` : ''}` : String(c.motivo || 'Não foi possível rodar.'));
    void carregar();
  };

  if (!alunos) return <p className="text-sm text-slate-600">{msg || 'Carregando o painel…'}</p>;
  return (
    <div className="space-y-3">
      {confirmar.dialogo}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-900">Robô Conferidor da Escola</p>
          <p className="text-xs text-slate-600">Confere as aulas (fonte oficial e data) e avisa você quando alguém com trilha atribuída fica 7 dias sem progresso.</p>
        </div>
        <button type="button" onClick={() => void rodarAgora()} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">Rodar agora</button>
        {robo && <p className="w-full text-xs text-slate-700">{robo}</p>}
      </div>
      {msg && <p role="status" className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-900">{msg}</p>}
      {alunos.length === 0 && <p className="text-sm text-slate-600">Ninguém da equipe ainda. Convide pela tela de equipe do sistema.</p>}
      {alunos.map((a) => (
        <div key={a.userId} className="rounded-xl bg-white p-3 shadow-sm">
          <button type="button" onClick={() => setAberto(aberto === a.userId ? null : a.userId)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
            <span className="font-bold text-slate-900">{a.login}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_NIVEL[a.nivel] || ''}`}>{a.nivel}</span>
            <span className="w-full text-xs text-slate-600">Aulas concluídas {a.aulasFeitas}/{a.totalAulas} · média dos questionários {a.mediaQuiz === null ? '—' : String(a.mediaQuiz).replace('.', ',')} · provas {a.provas.length} · última atividade {data(a.ultimaAtividade)}{a.parado.length ? ' · ⚠️ parado há 7+ dias' : ''}</span>
          </button>
          {aberto === a.userId && (
            <div className="mt-2 space-y-2 border-t pt-2 text-sm">
              {a.ondeMaisErra.length > 0 && (<div><p className="text-xs font-bold uppercase text-red-700">Onde mais erra</p><ul className="list-disc pl-5 text-slate-800">{a.ondeMaisErra.map((e) => <li key={e}>{e}</li>)}</ul></div>)}
              <div>
                <p className="text-xs font-bold uppercase text-slate-600">Histórico das provas (evolução)</p>
                {a.provas.length === 0 ? <p className="text-xs text-slate-500">Nenhuma prova ainda.</p> : (
                  <ul className="text-xs text-slate-800">{a.provas.map((p) => <li key={p.em} className="flex flex-wrap justify-between gap-2 border-b py-1"><span>{data(p.em)} · {p.praticaId}</span><span>nota <b>{String(p.nota).replace('.', ',')}</b> · {p.nivel}{p.duracaoMs ? ` · ${Math.max(1, Math.round(p.duracaoMs / 60000))} min` : ''}</span>{p.erros[0] && <span className="w-full text-red-800">{p.erros[0]}</span>}</li>)}</ul>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-600">Trilhas atribuídas</p>
                {a.atribuicoes.length === 0 ? <p className="text-xs text-slate-500">Nenhuma.</p> : (
                  <ul className="text-xs">{a.atribuicoes.map((t) => <li key={t.trilhaId} className="flex items-center justify-between gap-2 py-0.5"><span>{trilhas.find((x) => x.id === t.trilhaId)?.titulo || t.trilhaId} (desde {data(t.atribuidoEm)})</span><button type="button" onClick={() => void tirar(a, t.trilhaId)} className="rounded px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">Tirar trilha</button></li>)}</ul>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  <select aria-label="Trilha" value={escolha[a.userId] || ''} onChange={(e) => setEscolha((x) => ({ ...x, [a.userId]: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    <option value="">Escolha a trilha…</option>
                    {trilhas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                  </select>
                  <button type="button" onClick={() => void atribuir(a)} className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-bold text-white">Atribuir trilha</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
