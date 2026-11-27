import React, { useCallback, useEffect, useState } from 'react';
import { Agente007Cartao } from './Agente007Cartao';

interface Robo { id: string; nome: string; missao: string; estado: 'ativo' | 'parado' | 'aguardando_configuracao'; executando: boolean; podeRodarAgora?: boolean; intervaloSegundos: number | null; ultimaExecucao: string | null; execucoes: number; falhas: number; ultimoErro: string | null; ultimoResultado: string | null; motivoSemRotina: string | null; alerta?: { nivel: 'aviso' | 'critico'; texto: string } | null }

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const cadaQuanto = (s: number | null) => (s === null ? 'sem rotina automática' : s >= 3600 ? `automático a cada ${Math.round(s / 3600)} h` : `automático a cada ${Math.max(1, Math.round(s / 60))} min`);
const ROTULO = { ativo: 'Funcionando', parado: 'Parado', aguardando_configuracao: 'Sem rotina' } as const;

// Saúde dos robôs do Contábil: a rotina automática aparece ao lado do botão manual "Rodar agora" (só o dono do sistema vê o botão).
export function PainelRobos() {
  const [robos, setRobos] = useState<Robo[]>([]); const [erro, setErro] = useState(''); const [ehDono, setEhDono] = useState(false);
  const [disparando, setDisparando] = useState(''); const [aviso, setAviso] = useState('');
  const carregar = useCallback(async () => {
    try { const r = await fetch('/api/robos/status', { credentials: 'include', cache: 'no-store' }); const d = await r.json(); if (!r.ok || !d?.sucesso) throw new Error(); setRobos(d.robos); setEhDono(d.ehDono === true); setErro(''); }
    catch { setErro('Não consegui ler o estado dos robôs agora. Tente de novo em instantes.'); }
  }, []);
  useEffect(() => { void carregar(); const t = setInterval(carregar, 60_000); return () => clearInterval(t); }, [carregar]);
  const rodarAgora = async (robo: Robo) => {
    setDisparando(robo.id); setAviso('');
    try {
      const r = await fetch(`/api/robos/${encodeURIComponent(robo.id)}/rodar-agora`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json().catch(() => ({}));
      setAviso(r.ok && d?.sucesso ? `${robo.nome}: rodada disparada. O resultado aparece aqui em instantes.` : (d?.motivo || 'Não consegui disparar o robô agora.'));
      setTimeout(() => void carregar(), 4000);
    } catch { setAviso('Não consegui disparar o robô agora. Tente de novo.'); }
    finally { setDisparando(''); void carregar(); }
  };
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-base font-bold text-slate-900">Saúde dos robôs</h3><button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold" onClick={() => void carregar()}>Atualizar</button></div>
      <Agente007Cartao />
      {erro && <div className="rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-900">{erro}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-2 text-sm font-semibold text-sky-900">{aviso}</div>}
      {robos.map((r) => (
        <article key={r.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{r.nome}</b><span className={`text-xs font-bold ${r.estado === 'parado' ? 'text-red-700' : r.estado === 'ativo' ? 'text-emerald-700' : 'text-slate-500'}`}>{ROTULO[r.estado]} · {cadaQuanto(r.intervaloSegundos)} · última: {dataHora(r.ultimaExecucao)}</span></div>
          <p className="mt-1 text-xs text-slate-600">{r.missao}</p>
          {r.alerta && <p role="alert" className={`mt-1 rounded p-2 text-xs font-bold ${r.alerta.nivel === 'critico' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}>{r.alerta.texto}</p>}
          {r.ultimoResultado && <p className="mt-1 text-sm text-slate-800">{r.ultimoResultado}</p>}
          {r.ultimoErro && <p className="mt-1 text-xs font-semibold text-red-700">Último erro: {r.ultimoErro}</p>}
          {r.motivoSemRotina && <p className="mt-1 text-xs text-slate-500">Manual por regra: {r.motivoSemRotina}</p>}
          {ehDono && r.podeRodarAgora && <button type="button" className="mt-2 rounded-lg border border-blue-800 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 disabled:opacity-50" disabled={disparando === r.id || r.executando} onClick={() => void rodarAgora(r)}>{r.executando ? 'Rodando agora…' : disparando === r.id ? 'Disparando…' : 'Rodar agora'}</button>}
        </article>
      ))}
    </section>
  );
}
