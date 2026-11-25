import { confirmarNaTela } from "../utils/dialogoNaTela";
import React, { useEffect, useState } from 'react';
import { useExclusaoDuasEtapas } from './ConfirmaExclusaoDuasEtapas';
import { AvisoSistemasOnline, ResumoOnlineEscritorio, UsuariosOnlineEscritorio, usePainelOnline } from './PresencaEscritorios';

// Só o dono do sistema vê este painel: contrata (convida), bloqueia e exclui escritórios.
// Não mostra empresas nem documentos de nenhum escritório, apenas a contratação.
type Escritorio = { login: string; disabled: boolean; created_at: string; empresas: number; usuarios: number; max_usuarios: number | null };

export function PainelEscritorios() {
  const [lista, setLista] = useState<Escritorio[]>([]);
  const [login, setLogin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const [conta, setConta] = useState<{ login: string; escritorio: boolean; ehVoce: boolean; empresas: number } | null>(null);
  // Online / offline (só o dono do sistema vê este painel): bolinha de cada escritório e de cada usuário, atualiza a cada 30 s.
  const { painel: online, erro: erroOnline } = usePainelOnline();
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
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
    if (!await pedir({ titulo: 'Excluir esta conta?', oQue: `a conta ${c.login}, que tem acesso a ${c.empresas} empresa(s)`, consequencias: ['A conta é apagada e perde o acesso a essas empresas.', 'Os dados das empresas não são apagados.', 'Depois o e-mail fica livre para cadastrar de novo.'] })) return;
    try { await chamar(`/api/auth/usuarios/${encodeURIComponent(c.login)}/excluir`, { confirmar: true }); setConta(null); setMsg(''); await convidar(); } catch (x) { setMsg(x instanceof Error ? x.message : 'Não foi possível excluir a conta.'); }
  };
  const reenviar = async (loginAlvo: string) => {
    setMsg(''); setLink(''); setConta(null);
    try { const d = await chamar(`/api/auth/tenants/${encodeURIComponent(loginAlvo)}/reenviar`, {}); setLink(d.conviteUrl); }
    catch (c) { setMsg(c instanceof Error ? c.message : 'Não foi possível reenviar.'); }
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
    if (!await confirmarNaTela(bloquear ? `Bloquear o escritório ${e.login} e toda a equipe e clientes dele? Os dados ficam guardados.` : `Liberar o escritório ${e.login}?`)) return;
    try { await chamar(`/api/auth/tenants/${encodeURIComponent(e.login)}/bloqueio`, { bloqueado: bloquear }); await carregar(); } catch (c) { setMsg(c instanceof Error ? c.message : 'Falha.'); }
  };
  const excluir = async (e: Escritorio) => {
    if (!await pedir({ titulo: 'Excluir o escritório inteiro?', oQue: `o escritório ${e.login} (${e.empresas} empresa(s) e ${e.usuarios + 1} usuário(s), contando o dono)`, consequencias: ['A conta do dono e de toda a equipe do escritório é apagada.', 'O e-mail e os CNPJs ficam livres para cadastrar de novo.', 'Não dá para recuperar depois.'] })) return;
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
      {conta && <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm">{conta.ehVoce ? <p>Esta é a sua própria conta; use outro e-mail para o escritório.</p> : conta.escritorio ? <><p>Este e-mail já é dono de um escritório. Para mandar o acesso de novo para ele, use o botão <strong>Reenviar</strong> na lista de escritórios abaixo (não apaga nada). Só use <strong>Excluir</strong> se quiser apagar o escritório inteiro.</p><button type="button" onClick={() => void reenviar(conta.login)} className="mt-2 rounded bg-slate-800 px-3 py-1.5 font-semibold text-white">Reenviar o acesso deste escritório</button></> : <><p>Esta conta já existe e tem acesso a <strong>{conta.empresas}</strong> empresa(s). Para cadastrar este e-mail como escritório, apague a conta antiga primeiro.</p><button type="button" onClick={() => void excluirConta(conta)} className="mt-2 rounded bg-red-700 px-3 py-1.5 font-semibold text-white">Excluir esta conta e liberar o e-mail</button></>}</div>}
      {lista.length > 0 && <AvisoSistemasOnline painel={online} erro={erroOnline} />}
      {lista.length > 0 && <div className="mt-3">{lista.map((e) => { const dadosOnline = online?.escritorios[e.login.toLowerCase()]; return <div key={e.login} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"><span className="min-w-0"><span className="inline-flex flex-wrap items-center gap-x-2">{e.login} <ResumoOnlineEscritorio dados={dadosOnline} /></span> <span className="text-slate-500">· {e.empresas} empresa(s) · {e.usuarios + 1} de {e.max_usuarios ?? 'sem limite'} usuário(s) {e.disabled && <strong className="text-red-700">· BLOQUEADO</strong>}</span></span><span className="flex flex-wrap gap-3"><button onClick={() => void definirLimite(e)} className="text-blue-800 hover:underline">Limite</button><button onClick={() => void reenviar(e.login)} className="text-blue-800 hover:underline" title="Gera um link novo: convite, se ele ainda não aceitou, ou nova senha, se já tem conta. Não apaga nada.">Reenviar</button><button onClick={() => void alternar(e)} className={e.disabled ? 'text-green-800 hover:underline' : 'text-red-700 hover:underline'}>{e.disabled ? 'Liberar' : 'Bloquear'}</button><button onClick={() => setAbertos((a) => ({ ...a, [e.login]: !a[e.login] }))} className="text-blue-800 hover:underline" aria-expanded={abertos[e.login] === true} title="Quem deste escritório está online, em qual sistema e em qual tela">{abertos[e.login] ? 'Esconder quem está online' : 'Ver quem está online'}</button><button onClick={() => void excluir(e)} className="text-red-900 font-semibold hover:underline">Excluir</button></span>{abertos[e.login] && <div className="w-full rounded-lg bg-white/70 px-3"><UsuariosOnlineEscritorio dados={dadosOnline} /></div>}</div>; })}</div>}
      {dialogo}
    </div>
  );
}
