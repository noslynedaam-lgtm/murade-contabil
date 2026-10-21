import React, { useEffect, useState } from 'react';

// Equipe do escritório: quem entra aqui enxerga TODAS as empresas do escritório (inclusive as cadastradas depois).
// Clientes continuam vendo só a própria empresa (convite normal, por empresa).
export function PainelEquipe() {
  const [equipe, setEquipe] = useState<string[]>([]);
  const [login, setLogin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = () => fetch('/api/auth/team', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((d) => setEquipe(Array.isArray(d.equipe) ? d.equipe : [])).catch(() => setEquipe([]));
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
      {equipe.length > 0 && <div className="mt-3">{equipe.map((u) => <div key={u} className="flex justify-between border-t py-2 text-sm"><span>{u}</span><button onClick={() => void remover(u)} className="text-red-700 hover:underline">Tirar da equipe</button></div>)}</div>}
    </div>
  );
}
