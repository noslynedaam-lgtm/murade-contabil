import React, { useEffect, useState } from 'react';
import { confirmarNaTela } from '../utils/dialogoNaTela';

// Só o dono do sistema: perguntas que a Agente IA de QUALQUER escritório não conseguiu resolver
// sozinha e disse à pessoa que ia "chamar o supervisor" — é aqui que isso chega de verdade, para
// o dono responder (pedido do dono, 06/11/2026: a promessa da IA precisa ser verdadeira).
type DuvidaSupervisor = { id: string; login: string; cnpj: string | null; pergunta: string; resolvida: boolean; em: string };

export function PainelDuvidasSupervisor() {
  const [duvidas, setDuvidas] = useState<DuvidaSupervisor[]>([]);
  const [msg, setMsg] = useState('');

  const carregar = () => fetch('/api/auth/duvidas-supervisor', { credentials: 'include', cache: 'no-store' })
    .then((r) => r.json()).then((d) => setDuvidas(Array.isArray(d.duvidas) ? d.duvidas : [])).catch(() => setDuvidas([]));
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 60_000); return () => clearInterval(t); }, []);

  const resolver = async (d: DuvidaSupervisor) => {
    setMsg('');
    if (!await confirmarNaTela('Marcar esta dúvida como resolvida? Use depois de dar o retorno ao escritório.')) return;
    try {
      const r = await fetch(`/api/auth/duvidas-supervisor/${encodeURIComponent(d.id)}/resolver`, { method: 'POST', credentials: 'include' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.sucesso !== true) throw new Error(data.motivo || 'Não foi possível concluir.');
      await carregar();
    } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha ao marcar como resolvido.'); }
  };

  if (duvidas.length === 0) return null;
  return (
    <section className="mb-5 rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
      <h3 className="mb-1 font-semibold">🧑‍💼 Dúvidas que a Agente IA levou ao supervisor ({duvidas.length})</h3>
      <p className="mb-2 text-xs text-slate-700">Quando a IA de algum escritório não sabe resolver um pedido, ela avisa a pessoa que vai chamar o supervisor — isto é, você. Marque como resolvida depois de dar o retorno ao escritório.</p>
      {msg && <p role="alert" className="mb-2 text-sm text-red-800">{msg}</p>}
      <div>
        {duvidas.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-3 border-t border-slate-200 py-2 text-sm">
            <span>
              <strong>{d.login}</strong>{d.cnpj ? ` · CNPJ ${d.cnpj}` : ''} · <span className="text-slate-500">{new Date(d.em).toLocaleString('pt-BR')}</span>
              <br />{d.pergunta}
            </span>
            <button type="button" onClick={() => void resolver(d)} className="shrink-0 whitespace-nowrap text-blue-800 hover:underline">Marcar como resolvida</button>
          </div>
        ))}
      </div>
    </section>
  );
}
