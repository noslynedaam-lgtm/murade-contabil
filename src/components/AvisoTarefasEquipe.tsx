import React, { useCallback, useEffect, useRef, useState } from 'react';

// Aviso no canto direito: pedidos novos, lembretes e, para quem pediu, "foi visto" e "foi concluído".
// Sobe devagar, pode ser minimizado (vira uma bolinha com o número) ou fechado. Se a consulta falhar, não mostra nada.
type Aviso = { id: string; tarefaId: string; tipo: string; texto: string; criadoEm: string };

export function AvisoTarefasEquipe({ onAbrir }: { onAbrir: () => void }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [minimizado, setMinimizado] = useState(false);
  const dispensados = useRef(new Set<string>());
  const consultar = useCallback(() => {
    if (document.hidden) return;
    fetch('/api/tarefas-equipe/avisos', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.sucesso && Array.isArray(d.avisos)) setAvisos(d.avisos.filter((a: Aviso) => !dispensados.current.has(a.id))); })
      .catch(() => undefined);
  }, []);
  useEffect(() => { consultar(); const t = setInterval(consultar, 30_000); document.addEventListener('visibilitychange', consultar); return () => { clearInterval(t); document.removeEventListener('visibilitychange', consultar); }; }, [consultar]);
  const marcarLidos = (lista: Aviso[]) => {
    lista.forEach((a) => { dispensados.current.add(a.id); void fetch(`/api/tarefas-equipe/avisos/${a.id}/lido`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => dispensados.current.delete(a.id)); });
    setAvisos((atual) => atual.filter((a) => !lista.includes(a)));
  };
  if (!avisos.length) return null;
  const novo = avisos[0];
  return (
    <>
      <style>{'@keyframes tarefa-sobe{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}'}</style>
      {minimizado ? (
        <button type="button" onClick={() => setMinimizado(false)} aria-label={`Abrir avisos de tarefas (${avisos.length})`} className="fixed bottom-[9rem] right-3 z-[110] flex h-10 min-w-10 items-center justify-center rounded-full bg-sky-800 px-2 text-sm font-bold text-white shadow-xl" style={{ animation: 'tarefa-sobe 1.2s ease-out' }}>{avisos.length}</button>
      ) : (
        <div role="status" aria-live="polite" className="fixed bottom-[9rem] right-3 z-[110] w-[min(88vw,340px)] rounded-xl border border-sky-300 bg-white p-3 shadow-2xl" style={{ animation: 'tarefa-sobe 1.2s ease-out' }}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Tarefas da equipe{avisos.length > 1 ? ` (${avisos.length})` : ''}</p>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setMinimizado(true)} aria-label="Minimizar" title="Minimizar" className="h-8 w-8 rounded-lg border border-slate-300 text-sm font-bold">–</button>
              <button type="button" onClick={() => marcarLidos(avisos)} aria-label="Fechar" title="Fechar" className="h-8 w-8 rounded-lg border border-slate-300 text-sm font-bold">×</button>
            </div>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{novo.texto}</p>
          <button type="button" onClick={() => { marcarLidos([novo]); onAbrir(); }} className="mt-2 w-full rounded-lg bg-sky-800 px-3 py-2 text-sm font-bold text-white">Abrir</button>
        </div>
      )}
    </>
  );
}
