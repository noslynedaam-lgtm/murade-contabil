import React, { useEffect, useState } from 'react';
import { PainelAtividade } from './PainelAtividade';

// Equipe do escritório: quem entra aqui enxerga TODAS as empresas do escritório (inclusive as cadastradas depois).
// Clientes continuam vendo só a própria empresa (convite normal, por empresa).
export function PainelEquipe() {
  const [equipe, setEquipe] = useState<string[]>([]);
  const [membros, setMembros] = useState<{ login: string; bloqueado: boolean }[]>([]);
  const [convites, setConvites] = useState<{ login: string; expiraEm: string }[]>([]);
  const [login, setLogin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = () => fetch('/api/auth/team/detalhes', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((d) => { setMembros(Array.isArray(d.membros) ? d.membros : []); setConvites(Array.isArray(d.convites) ? d.convites : []); setEquipe((d.membros || []).map((m: { login: string }) => m.login)); }).catch(() => { setEquipe([]); setMembros([]); setConvites([]); });
  useEffect(() => { void carregar(); }, []);
  const chamar = async (url: string, metodo: string, corpo?: object) => {
    const r = await fetch(url, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível concluir.');
    return d;
  };
  const convidar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(''); setLink('');
    try { const d = await chamar('/api/auth/team/invite', 'POST', { login }); setLink(d.conviteUrl); setLogin(''); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const adicionar = async () => {
    setMsg('');
    try { await chamar('/api/auth/team', 'POST', { login }); setLogin(''); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const remover = async (u: string) => {
    if (!window.confirm(`Tirar ${u} da equipe? Ele perde o acesso às empresas do escritório; nada é apagado.`)) return;
    try { await chamar(`/api/auth/team/${encodeURIComponent(u)}`, 'DELETE'); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const acao = async (url: string, metodo: string, corpo?: object, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return; setMsg(''); setLink('');
    try { const d = await chamar(url, metodo, corpo); if (d.conviteUrl) setLink(d.conviteUrl); if (d.aviso) setMsg(d.aviso); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const base = (u: string) => `/api/auth/team/${encodeURIComponent(u)}`;
  return (
    <div className="mb-5 rounded-xl border border-slate-200 p-4">
      <h3 className="mb-1 font-semibold">Equipe do escritório</h3>
      <p className="mb-2 text-xs text-slate-600">Quem está na equipe acessa todas as empresas do escritório, as de hoje e as futuras, de qualquer computador. Cliente não entra aqui: convide-o pela empresa dele, abaixo.</p>
      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><strong>Aplicativo instalado travou ou ficou desatualizado?</strong> Não precisa reenviar convite nem instalar de novo. Mande este link para a pessoa abrir uma vez; o usuário, a senha e os dados dela continuam iguais: <a className="break-all text-blue-800 underline" href="/reparar.html">{`${window.location.origin}/reparar.html`}</a> <button type="button" className="ml-2 rounded bg-blue-800 px-2 py-1 text-white" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/reparar.html`)}>Copiar</button></div>
      <form onSubmit={convidar} className="flex gap-2">
        <input required value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Usuário (e-mail) do funcionário" className="min-w-0 flex-1 rounded-lg border p-2" />
        <button className="rounded-lg bg-slate-800 px-3 text-white">Gerar convite</button>
        <button type="button" onClick={() => void adicionar()} className="rounded-lg border px-3" title="Para quem já tem conta neste sistema">Adicionar conta existente</button>
      </form>
      {link && <div className="mt-2 break-all rounded-lg border border-green-300 bg-green-50 p-3 text-sm"><strong>Link (24 horas):</strong> <a className="text-blue-800 underline" href={link}>{link}</a> <button type="button" className="ml-2 rounded bg-green-800 px-2 py-1 text-white" onClick={() => void navigator.clipboard.writeText(link)}>Copiar</button></div>}
      {msg && <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p>}
      <div className="mt-3"><p className="text-xs font-semibold text-slate-700">Convites pendentes (valem 24 horas)</p>{convites.length === 0 && <p className="border-t py-2 text-sm text-slate-500">Nenhum convite pendente.</p>}{convites.map((c) => <div key={c.login} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"><span>{c.login}</span><span className="flex gap-3"><button onClick={() => void acao(`${base(c.login)}/reenviar`, 'POST')} className="text-blue-800 hover:underline">Reenviar (novo link)</button><button onClick={() => void acao(`${base(c.login)}/convite`, 'DELETE', undefined, `Cancelar o convite de ${c.login}? O link deixa de funcionar.`)} className="text-red-700 hover:underline">Cancelar convite</button></span></div>)}</div>
      <div className="mt-3"><p className="text-xs font-semibold text-slate-700">Usuários da equipe</p>{membros.length === 0 && <p className="border-t py-2 text-sm text-slate-500">Nenhum usuário na equipe ainda. Gere um convite acima.</p>}{membros.map((m) => <div key={m.login} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"><span>{m.login}{m.bloqueado && <em className="ml-2 text-xs text-amber-700">bloqueado</em>}</span><span className="flex flex-wrap gap-3">
        {!m.bloqueado && <button onClick={() => void acao(`${base(m.login)}/nova-senha`, 'POST')} className="text-blue-800 hover:underline">Nova senha (gerar link)</button>}
        <button onClick={() => void acao(`${base(m.login)}/bloqueio`, 'POST', { bloqueado: !m.bloqueado }, m.bloqueado ? undefined : `Bloquear ${m.login}? Ele sai na hora e não consegue entrar até você desbloquear.`)} className="text-amber-700 hover:underline">{m.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
        <button onClick={() => void remover(m.login)} className="text-slate-700 hover:underline">Tirar da equipe</button>
        <button onClick={() => void acao(`${base(m.login)}/excluir`, 'POST', undefined, `EXCLUIR ${m.login}? A conta é apagada e não tem volta. As notas e dados das empresas não são apagados.`)} className="text-red-700 hover:underline">Excluir</button></span></div>)}</div>
      <div className="mt-4"><PainelAtividade /></div>
    </div>
  );
}
