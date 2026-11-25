import React, { useEffect, useState } from 'react';

// Online / offline dos escritórios clientes e de cada usuário, para o DONO DO SISTEMA (só ele chama /api/auth/tenants/presenca).
// Verde: "Online agora" (sinal nos últimos 2 min). Amarela: "Ativo há X min" (até 15 min). Cinza: "Offline — visto por último em DD/MM HH:MM".
// Mostra também em qual sistema a pessoa está (DP, Fiscal, Contábil) e o nome da tela, quando o sinal tem essa informação.

export type EstadoOnline = 'online' | 'ativo' | 'offline';
type SistemaNoUsuario = { sistema: string; tela: string | null; estado: EstadoOnline; texto: string };
type UsuarioOnline = { login: string; papel: 'dono' | 'equipe' | 'cliente'; estado: EstadoOnline; texto: string; sistemas: SistemaNoUsuario[] };
export type EscritorioOnline = { login: string; estado: EstadoOnline; texto: string; online: number; ativos: number; totalUsuarios: number; usuarios: UsuarioOnline[] };
export type PainelOnline = { geradoEm: string; sistemas: Array<{ sistema: string; ok: boolean; motivo?: string }>; escritorios: Record<string, EscritorioOnline> };

const COR: Record<EstadoOnline, string> = { online: 'bg-green-500', ativo: 'bg-yellow-400', offline: 'bg-slate-400' };
const PAPEL: Record<UsuarioOnline['papel'], string> = { dono: 'dono do escritório', equipe: 'equipe', cliente: 'cliente de empresa' };

export function Bolinha({ estado, titulo }: { estado: EstadoOnline; titulo?: string }) {
  return <span aria-hidden="true" title={titulo} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COR[estado]} ${estado === 'online' ? 'ring-2 ring-green-200' : ''}`} />;
}

/** Busca o painel a cada 30 s enquanto a tela está aberta e visível. */
export function usePainelOnline(): { painel: PainelOnline | null; erro: string } {
  const [painel, setPainel] = useState<PainelOnline | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await fetch('/api/auth/tenants/presenca', { credentials: 'include', cache: 'no-store' });
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.ok && d.sucesso === true) { setPainel(d as PainelOnline); setErro(''); } else setErro(d.motivo || 'Não foi possível ver quem está online.');
      } catch { if (vivo) setErro('Sem conexão para ver quem está online.'); }
    };
    void carregar();
    const t = window.setInterval(() => { void carregar(); }, 30_000);
    const aoVoltar = () => { if (document.visibilityState === 'visible') void carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
  }, []);
  return { painel, erro };
}

/** Linha curta ao lado do nome do escritório: bolinha + "2 online agora" (ou "Ativo há X min" / "Offline — visto por último em ..."). */
export function ResumoOnlineEscritorio({ dados }: { dados: EscritorioOnline | undefined }) {
  if (!dados) return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Bolinha estado="offline" /> Offline — ainda não entrou</span>;
  const extra = dados.ativos ? ` · ${dados.ativos} ativo(s) há pouco` : '';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-700">
      <Bolinha estado={dados.estado} titulo={dados.texto} />
      <span><strong>{dados.online}</strong> de {dados.totalUsuarios} online{extra}{dados.online === 0 ? ` · ${dados.texto}` : ''}</span>
    </span>
  );
}

/** Lista dos usuários do escritório com a bolinha de cada um, o sistema e a tela. */
export function UsuariosOnlineEscritorio({ dados }: { dados: EscritorioOnline | undefined }) {
  if (!dados || !dados.usuarios.length) return <p className="py-1 text-xs text-slate-500">Nenhum usuário deste escritório entrou ainda.</p>;
  return (
    <ul className="space-y-1 py-1">
      {dados.usuarios.map((u) => (
        <li key={u.login} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
          <span className="mt-0.5"><Bolinha estado={u.estado} titulo={u.texto} /></span>
          <span className="min-w-0 break-all font-medium text-slate-800">{u.login}</span>
          <span className="text-slate-500">({PAPEL[u.papel]})</span>
          <span className={u.estado === 'online' ? 'font-semibold text-green-800' : u.estado === 'ativo' ? 'font-semibold text-yellow-800' : 'text-slate-500'}>{u.texto}</span>
          {u.sistemas.filter((s) => s.estado !== 'offline').map((s) => (
            <span key={s.sistema} className="w-full pl-4 text-slate-600 sm:w-auto sm:pl-0">· {s.sistema}{s.tela ? ` — tela ${s.tela}` : ''} ({s.texto.toLowerCase()})</span>
          ))}
          {u.estado === 'offline' && u.sistemas[0] && <span className="text-slate-500">· último sistema: {u.sistemas[0].sistema}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Aviso discreto quando algum sistema não respondeu (o painel mostra só o que chegou). */
export function AvisoSistemasOnline({ painel, erro }: { painel: PainelOnline | null; erro: string }) {
  if (erro) return <p className="mt-1 text-xs text-red-700">{erro}</p>;
  const falhas = painel?.sistemas.filter((s) => !s.ok) || [];
  if (!painel) return <p className="mt-1 text-xs text-slate-500">Carregando quem está online…</p>;
  return (
    <p className="mt-1 text-xs text-slate-600">
      <Bolinha estado="online" /> Online agora (últimos 2 min) · <Bolinha estado="ativo" /> Ativo há até 15 min · <Bolinha estado="offline" /> Offline. Atualiza sozinho a cada 30 segundos.
      {falhas.length > 0 && <span className="block text-amber-800">Sem resposta agora de: {falhas.map((s) => `${s.sistema} (${s.motivo || 'sem resposta'})`).join(', ')}.</span>}
    </p>
  );
}
