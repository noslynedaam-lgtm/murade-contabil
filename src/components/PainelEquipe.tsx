import React, { useEffect, useState } from 'react';
import { PainelAtividade } from './PainelAtividade';

// Equipe do escritório: quem entra aqui enxerga TODAS as empresas do escritório (inclusive as cadastradas depois).
// Clientes continuam vendo só a própria empresa (convite normal, por empresa).
export function PainelEquipe() {
  const [equipe, setEquipe] = useState<Array<{ login: string; bloqueado: boolean }>>([]);
  const [login, setLogin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = () => fetch('/api/auth/team', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((d) => setEquipe(Array.isArray(d.membros) ? d.membros : (Array.isArray(d.equipe) ? d.equipe.map((login: string) => ({ login, bloqueado: false })) : []))).catch(() => setEquipe([]));
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
  const bloquear = async (u: string, bloqueado: boolean) => {
    const acao = bloqueado ? 'Desbloquear' : 'Bloquear';
    if (!window.confirm(`${acao} o acesso de ${u}? ${bloqueado ? 'A pessoa poderá entrar novamente.' : 'As sessões atuais serão encerradas.'}`)) return;
    try { await chamar(`/api/auth/team/${encodeURIComponent(u)}/bloqueio`, 'POST', { bloqueado: !bloqueado }); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const redefinirSenha = async (u: string) => {
    setMsg(''); setLink('');
    try { const d = await chamar(`/api/auth/team/${encodeURIComponent(u)}/redefinir-senha`, 'POST'); setLink(d.conviteUrl); setMsg(`Link de redefinição gerado para ${u}; envie-o em particular. Ele expira em 24 horas.`); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const remover = async (u: string) => {
    if (!window.confirm(`Tirar ${u} da equipe? O acesso às empresas do escritório será removido; os dados da pessoa não serão apagados.`)) return;
    try { await chamar(`/api/auth/team/${encodeURIComponent(u)}`, 'DELETE'); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  return (
    <div className="mb-5 rounded-xl border border-slate-200 p-4">
      <h3 className="mb-1 font-semibold">Equipe do escritório</h3>
      <p className="mb-2 text-xs text-slate-600">Quem está na equipe acessa todas as empresas do escritório, as de hoje e as futuras, de qualquer computador. Cliente não entra aqui: convide-o pela empresa dele, abaixo.</p>
      <form onSubmit={convidar} className="flex gap-2">
        <input required value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Usuário (e-mail) do funcionário" className="min-w-0 flex-1 rounded-lg border p-2" />
        <button className="rounded-lg bg-slate-800 px-3 text-white">Gerar convite</button>
        <button type="button" onClick={() => void adicionar()} className="rounded-lg border px-3" title="Para quem já tem conta neste sistema">Adicionar conta existente</button>
      </form>
      {link && <div className="mt-2 break-all rounded-lg border border-green-300 bg-green-50 p-3 text-sm"><strong>Link (24 horas):</strong> <a className="text-blue-800 underline" href={link}>{link}</a> <button type="button" className="ml-2 rounded bg-green-800 px-2 py-1 text-white" onClick={() => void navigator.clipboard.writeText(link)}>Copiar</button></div>}
      {msg && <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p>}
      {equipe.length > 0 && <div className="mt-3">{equipe.map((m) => <div key={m.login} className="flex items-center justify-between gap-3 border-t py-2 text-sm"><span>{m.login} {m.bloqueado && <strong className="ml-2 text-amber-700">Bloqueado</strong>}</span><div className="flex gap-3"><button type="button" onClick={() => void bloquear(m.login, m.bloqueado)} className="text-amber-700 hover:underline">{m.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>{!m.bloqueado && <button type="button" onClick={() => void redefinirSenha(m.login)} className="text-blue-700 hover:underline">Gerar novo link de senha</button>}<button type="button" onClick={() => void remover(m.login)} className="text-red-700 hover:underline">Remover</button></div></div>)}</div>
      <div className="mt-4"><PainelAtividade /></div>
    </div>
  );
}
