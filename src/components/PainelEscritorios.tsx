import React, { useEffect, useState } from 'react';

// Só o dono do sistema vê este painel: contrata (convida), bloqueia e exclui escritórios.
// Não mostra empresas nem documentos de nenhum escritório, apenas a contratação.
type Escritorio = { login: string; disabled: boolean; created_at: string; empresas: number; usuarios: number; max_usuarios: number | null };

export function PainelEscritorios() {
  const [lista, setLista] = useState<Escritorio[]>([]);
  const [login, setLogin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [conta, setConta] = useState<{ login: string; escritorio: boolean; ehVoce: boolean; empresas: number } | null>(null);
  const carregar = () => fetch('/api/auth/tenants', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((d) => setLista(Array.isArray(d.escritorios) ? d.escritorios : [])).catch(() => setLista([]));
  useEffect(() => { void carregar(); }, []);
  const chamar = async (url: string, corpo: object) => {
    const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível concluir.');
    return d;
  };
  const convidar = async (e?: React.FormEvent) => {
    e?.preventDefault(); setMsg(''); setLink(''); setConta(null);
    try { const d = await chamar('/api/auth/tenants/invite', { login }); setLink(d.conviteUrl); setLogin(''); } catch (c) {
      const texto = c instanceof Error ? c.message : 'Falha.'; setMsg(texto);
      if (/já existe/i.test(texto)) {
        // Mostra o que é essa conta e oferece apagá-la, para o e-mail poder ser cadastrado de novo.
        try { const r = await fetch(`/api/auth/usuarios/${encodeURIComponent(login.trim().toLowerCase())}/resumo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const d = await r.json();
          if (d.sucesso === true && d.existe) setConta({ login: login.trim().toLowerCase(), escritorio: d.escritorio === true, ehVoce: d.ehVoce === true, empresas: Number(d.empresas || 0) }); } catch { /* sem detalhes: a mensagem acima basta */ }
      }
    }
  };
  const excluirConta = async (c: { login: string; empresas: number }) => {
    if (!window.confirm(`EXCLUIR a conta ${c.login}? Ela tem acesso a ${c.empresas} empresa(s) e perde esse acesso. Não tem volta. Os dados das empresas não são apagados. Depois o e-mail fica livre para cadastrar de novo.`)) return;
    try { await chamar(`/api/auth/usuarios/${encodeURIComponent(c.login)}/excluir`, { confirmar: true }); setConta(null); setMsg(''); await convidar(); } catch (x) { setMsg(x instanceof Error ? x.message : 'Não foi possível excluir a conta.'); }
  };
  const definirLimite = async (e: Escritorio) => {
    const atual = e.max_usuarios == null ? '' : String(e.max_usuarios);
    const resp = window.prompt(`Quantos usuários o escritório ${e.login} contratou (dono incluso)? Deixe vazio para sem limite.`, atual);
    if (resp === null) return;
    const limite = resp.trim() === '' ? null : Number(resp);
    try { await chamar(`/api/auth/tenants/${encodeURIComponent(e.login)}/limite`, { limite }); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Não foi possível definir o limite.'); }
  };
  const alternar = async (e: Escritorio) => {
    const bloquear = !e.disabled;
    if (!window.confirm(bloquear ? `Bloquear o escritório ${e.login} e toda a equipe e clientes dele? Os dados ficam guardados.` : `Liberar o escritório ${e.login}?`)) return;
    try { await chamar(`/api/auth/tenants/${encodeURIComponent(e.login)}/bloqueio`, { bloqueado: bloquear }); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const excluir = async (e: Escritorio) => {
    if (!window.confirm(`EXCLUIR de vez o escritório ${e.login}? A conta do dono e de toda a equipe é apagada e não tem volta. O e-mail e os CNPJs ficam livres para cadastrar de novo.`)) return;
    if (window.prompt(`Para confirmar, digite o usuário do escritório: ${e.login}`)?.trim().toLowerCase() !== e.login.toLowerCase()) { setMsg('Exclusão cancelada: o usuário digitado não confere.'); return; }
    setMsg('');
    try { const d = await chamar(`/api/auth/tenants/${encodeURIComponent(e.login)}/excluir`, { confirmar: true }); setMsg(d.aviso || `Escritório ${e.login} excluído. O e-mail já pode ser cadastrado de novo.`); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Não foi possível excluir.'); }
  };
  return (
    <div className="mb-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <h3 className="mb-1 font-semibold">Escritórios que contrataram o sistema</h3>
      <p className="mb-2 text-xs text-slate-700">Cada escritório tem a própria conta, cadastra as próprias empresas e só vê o que é dele. Você não vê as empresas deles; só contrata e bloqueia.</p>
      <form onSubmit={convidar} className="flex gap-2">
        <input required value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Usuário (e-mail) do dono do escritório" className="min-w-0 flex-1 rounded-lg border p-2" />
        <button className="rounded-lg bg-slate-800 px-3 text-white">Gerar convite do escritório</button>
      </form>
      {link && <div className="mt-2 break-all rounded-lg border border-green-300 bg-green-50 p-3 text-sm"><strong>Link de uso único:</strong> <a className="text-blue-800 underline" href={link}>{link}</a> <button type="button" className="ml-2 rounded bg-green-800 px-2 py-1 text-white" onClick={() => void navigator.clipboard.writeText(link)}>Copiar</button></div>}
      {msg && <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p>}
      {conta && <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm">{conta.ehVoce ? <p>Esta é a sua própria conta; use outro e-mail para o escritório.</p> : conta.escritorio ? <p>Este e-mail é dono de um escritório. Use o botão <strong>Excluir</strong> na lista de escritórios abaixo para apagar o escritório inteiro e liberar o e-mail.</p> : <><p>Esta conta já existe e tem acesso a <strong>{conta.empresas}</strong> empresa(s). Para cadastrar este e-mail como escritório, apague a conta antiga primeiro.</p><button type="button" onClick={() => void excluirConta(conta)} className="mt-2 rounded bg-red-700 px-3 py-1.5 font-semibold text-white">Excluir esta conta e liberar o e-mail</button></>}</div>}
      {lista.length > 0 && <div className="mt-3">{lista.map((e) => <div key={e.login} className="flex items-center justify-between border-t py-2 text-sm"><span>{e.login} <span className="text-slate-500">· {e.empresas} empresa(s) · {e.usuarios + 1} de {e.max_usuarios ?? 'sem limite'} usuário(s) {e.disabled && <strong className="text-red-700">· BLOQUEADO</strong>}</span></span><span className="flex gap-3"><button onClick={() => void definirLimite(e)} className="text-blue-800 hover:underline">Limite</button><button onClick={() => void alternar(e)} className={e.disabled ? 'text-green-800 hover:underline' : 'text-red-700 hover:underline'}>{e.disabled ? 'Liberar' : 'Bloquear'}</button><button onClick={() => void excluir(e)} className="text-red-900 font-semibold hover:underline">Excluir</button></span></div>)}</div>}
    </div>
  );
}
