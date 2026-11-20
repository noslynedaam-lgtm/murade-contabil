// Aviso da Escola Murade ao entrar: trilha atribuída ("você vai estudar isto"), prova terminada por alguém da equipe e aluno
// parado há 7 dias (para o administrador). Cartão pequeno embaixo (no celular não ocupa o topo). Falha de rede nunca atrapalha.
import React, { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';

interface Aviso { id: string; tipo: string; texto: string }

export const AvisoEscola: React.FC<{ onAbrir: () => void }> = ({ onAbrir }) => {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  useEffect(() => {
    let vivo = true;
    const buscar = () => fetch('/api/escola/avisos', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json()).then((c) => { if (vivo && c?.sucesso && Array.isArray(c.avisos)) setAvisos(c.avisos); }).catch(() => undefined);
    const t0 = window.setTimeout(buscar, 4000);
    const t = window.setInterval(buscar, 10 * 60_000);
    return () => { vivo = false; window.clearTimeout(t0); window.clearInterval(t); };
  }, []);
  const lido = (id: string) => {
    setAvisos((a) => a.filter((x) => x.id !== id));
    void fetch('/api/escola/avisos/lido', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => undefined);
  };
  const a = avisos[0];
  if (!a) return null;
  return (
    <div role="status" className="fixed left-3 right-3 z-[55] mx-auto max-w-md rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-800 shadow-2xl sm:left-auto sm:right-4"
      style={{ bottom: 'calc(7.5rem + env(safe-area-inset-bottom, 0px))' }}>
      <p className="flex items-start gap-2"><GraduationCap size={18} className="mt-0.5 shrink-0 text-blue-700" /><span>{a.texto}</span></p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => lido(a.id)} className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Ok</button>
        <button type="button" onClick={() => { lido(a.id); onAbrir(); }} className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-bold text-white">Abrir a Escola</button>
      </div>
      {avisos.length > 1 && <p className="mt-1 text-[11px] text-slate-500">+{avisos.length - 1} aviso(s)</p>}
    </div>
  );
};
