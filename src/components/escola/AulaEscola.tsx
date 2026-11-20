// Uma aula da Escola Murade: o que é, por que existe, a regra com a lei, exemplo calculado pelo sistema, "Me mostra no sistema",
// perguntas (corrigidas no servidor) e a prática em 3 fases no simulador de treino.
import React, { useEffect, useState } from 'react';
import type { AulaEscola as Aula } from '../../data/escolaNucleo';
import { praticaPorId } from '../../data/escolaPratica';
import { mostrarNoSistema } from './escolaAdaptador';
import { SimuladorEscola } from './SimuladorEscola';

export type AulaSemRespostas = Omit<Aula, 'perguntas'> & { perguntas: Array<{ pergunta: string; opcoes: string[] }> };
interface Exemplo { titulo: string; dados: string; linhas: Array<{ rotulo: string; valor: string }>; observacao: string; motor: string }
interface Correcao { acertos: number; total: number; nota: number; erradas: Array<{ indice: number; explicacao: string; certa: string }>; certas: number[] }

export const AulaEscolaView: React.FC<{ aula: AulaSemRespostas; falar: (t: string) => void; onVoltar: () => void; onMudou: () => void }> = ({ aula, falar, onVoltar, onMudou }) => {
  const [exemplo, setExemplo] = useState<Exemplo | null>(null);
  const [erroExemplo, setErroExemplo] = useState('');
  const [respostas, setRespostas] = useState<number[]>(() => aula.perguntas.map(() => -1));
  const [correcao, setCorrecao] = useState<Correcao | null>(null);
  const [msg, setMsg] = useState('');
  const [praticando, setPraticando] = useState(false);
  const pratica = aula.pratica ? praticaPorId(aula.pratica) : undefined;

  useEffect(() => { void fetch('/api/escola/aula-vista', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aulaId: aula.id }) }).catch(() => undefined); }, [aula.id]);

  const verExemplo = async () => {
    setErroExemplo('');
    try {
      const r = await fetch(`/api/escola/exemplo/${encodeURIComponent(aula.exemplo || '')}`, { credentials: 'same-origin' });
      const c = await r.json().catch(() => ({}));
      if (c.sucesso) setExemplo(c.exemplo); else setErroExemplo(String(c.motivo || 'Não foi possível calcular.'));
    } catch { setErroExemplo('Sem conexão com o servidor.'); }
  };
  const meMostra = () => { if (!mostrarNoSistema(aula.meMostra, aula.titulo)) setMsg('Não achei essa tela no mapa do sistema.'); };
  const corrigir = async () => {
    if (respostas.some((r) => r < 0)) { setMsg('Responda todas as perguntas antes de conferir.'); return; }
    setMsg('');
    try {
      const r = await fetch('/api/escola/quiz', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aulaId: aula.id, respostas }) });
      const c = await r.json().catch(() => ({}));
      if (c.sucesso) { setCorrecao(c); onMudou(); } else setMsg(String(c.motivo || 'Não foi possível corrigir.'));
    } catch { setMsg('Sem conexão com o servidor.'); }
  };

  return (
    <article className="space-y-3">
      <button type="button" onClick={onVoltar} className="text-sm font-semibold text-blue-800">‹ Voltar às trilhas</button>
      <h3 className="text-xl font-extrabold text-slate-900">{aula.titulo}</h3>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-xs font-bold uppercase text-blue-700">O que é isso?</p>
        <p className="text-sm text-slate-800">{aula.oQueE}</p>
        <p className="mt-2 text-xs font-bold uppercase text-blue-700">Por que existe?</p>
        <p className="text-sm text-slate-800">{aula.porQue}</p>
        <p className="mt-2 text-xs font-bold uppercase text-blue-700">A regra (com a lei)</p>
        <ul className="list-disc pl-5 text-sm text-slate-800">{aula.regras.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="mt-2 text-[11px] text-slate-500">
          Fonte: {aula.fontes.map((f, i) => (<React.Fragment key={f.url}>{i > 0 ? '; ' : ''}{f.tipo === 'sistema' ? f.nome : <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.nome}</a>}</React.Fragment>))}. Conferido em {aula.conferidoEm.split('-').reverse().join('/')}.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {aula.exemplo && <button type="button" onClick={() => void verExemplo()} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-bold text-white">Ver exemplo calculado pelo sistema</button>}
        <button type="button" onClick={meMostra} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-slate-900">👉 Me mostra no sistema</button>
        {pratica && <button type="button" onClick={() => setPraticando(true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Praticar</button>}
      </div>
      <p className="text-[11px] text-slate-500">"Me mostra no sistema" abre a tela de verdade e a seta mostra onde clicar. Só mostra: nada é salvo.</p>
      {msg && <p role="status" className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-900">{msg}</p>}

      {erroExemplo && <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">{erroExemplo}</p>}
      {exemplo && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-bold uppercase text-indigo-700">Exemplo · {exemplo.titulo}</p>
          <p className="text-sm text-slate-700">{exemplo.dados}</p>
          <dl className="mt-2 divide-y text-sm">{exemplo.linhas.map((l) => <div key={l.rotulo} className="flex flex-wrap justify-between gap-x-3 py-1"><dt className="text-slate-700">{l.rotulo}</dt><dd className="font-semibold text-slate-900">{l.valor}</dd></div>)}</dl>
          <p className="mt-1 text-xs text-slate-600">{exemplo.observacao}</p>
          <p className="text-[11px] text-slate-400">Calculado agora pelo motor do sistema ({exemplo.motor}), com dados de treino.</p>
        </section>
      )}

      {praticando && pratica && <SimuladorEscola pratica={pratica} falar={falar} onFechar={() => setPraticando(false)} onProvaEntregue={onMudou} />}

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-xs font-bold uppercase text-blue-700">Responder as perguntas</p>
        {aula.perguntas.map((p, i) => {
          const errada = correcao?.erradas.find((e) => e.indice === i);
          return (
            <fieldset key={p.pergunta} className="mt-2">
              <legend className="text-sm font-semibold text-slate-800">{i + 1}. {p.pergunta}</legend>
              <div className="mt-1 grid gap-1">
                {p.opcoes.map((o, j) => (
                  <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 text-sm ${correcao ? (correcao.certas[i] === j ? 'border-emerald-400 bg-emerald-50' : respostas[i] === j ? 'border-red-400 bg-red-50' : 'border-slate-200') : respostas[i] === j ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                    <input type="radio" name={`q-${aula.id}-${i}`} checked={respostas[i] === j} disabled={!!correcao} onChange={() => setRespostas((r) => r.map((x, k) => (k === i ? j : x)))} className="mt-1" />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
              {errada && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-900">Resposta certa: <b>{errada.certa}</b>. {errada.explicacao}</p>}
            </fieldset>
          );
        })}
        {!correcao ? (
          <button type="button" onClick={() => void corrigir()} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">Conferir respostas</button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900">Você acertou {correcao.acertos} de {correcao.total} (nota {String(correcao.nota).replace('.', ',')}).</p>
            <button type="button" onClick={() => { setCorrecao(null); setRespostas(aula.perguntas.map(() => -1)); }} className="rounded-lg border border-blue-300 px-3 py-1 text-xs font-bold text-blue-800">Tentar de novo</button>
          </div>
        )}
      </section>
    </article>
  );
};
