import React, { useCallback, useEffect, useState } from 'react';
import { confirmarNaTela } from '../../utils/dialogoNaTela';
import { useContabilAuth } from '../ContabilAccessGate';

// Tarefas da equipe: "Pedidos para mim" (o que a contadora pediu) e "Que eu pedi" (acompanhar se foi visto e feito).
// Excluir é sempre uma tarefa por vez, com segunda confirmação. Não existe botão de apagar tudo.
type Tarefa = {
  id: string; titulo: string; empresaCnpj: string | null; empresaNome: string | null; prazo: string | null;
  criadaPor: { login: string; nome: string }; destinatario: { login: string; nome: string };
  origem: 'delegada' | 'propria'; mensagem: string; vistoEm: string | null; concluidaEm: string | null; criadaEm: string; vencida: boolean;
};
type Pessoa = { id: string; login: string; nome: string };
type Empresa = { cnpj: string; nome: string };

const dh = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const dia = (iso: string) => iso.split('-').reverse().join('/');
async function chamar(url: string, metodo = 'GET', corpo?: object) {
  const r = await fetch(url, { method: metodo, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível concluir. Tente de novo.');
  return d;
}

export function TarefasEquipeTab() {
  const auth = useContabilAuth();
  const [visao, setVisao] = useState<'para-mim' | 'que-pedi'>('para-mim');
  const [itens, setItens] = useState<Tarefa[]>([]);
  const [aberta, setAberta] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(false);
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [eu, setEu] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [dest, setDest] = useState(''); const [servico, setServico] = useState(''); const [cnpj, setCnpj] = useState(''); const [prazo, setPrazo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try { const d = await chamar(`/api/tarefas-equipe?visao=${visao}`); setItens(d.tarefas); setMsg(''); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Falha ao carregar.'); }
    finally { setCarregando(false); }
  }, [visao]);
  useEffect(() => { setCarregando(true); void carregar(); const t = setInterval(() => { if (!document.hidden) void carregar(); }, 60_000); return () => clearInterval(t); }, [carregar]);
  useEffect(() => {
    void chamar('/api/tarefas-equipe/equipe').then((d) => { setEquipe(d.equipe); setEu(d.eu); setDest(d.eu); }).catch(() => undefined);
    void fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((d) => setEmpresas((d.empresas || []).map((e: any) => ({ cnpj: String(e.cnpj), nome: String(e.razaoSocial || e.nomeFantasia || e.cnpj) })))).catch(() => undefined);
  }, []);

  const agir = async (url: string, metodo = 'POST') => { try { await chamar(url, metodo); setMsg(''); await carregar(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Falha.'); } };
  const abrir = async (t: Tarefa) => {
    const abrindo = aberta !== t.id; setAberta(abrindo ? t.id : '');
    if (abrindo && t.destinatario.login === auth.usuario && !t.vistoEm && !t.concluidaEm) await agir(`/api/tarefas-equipe/${t.id}/vista`);
  };
  const excluir = async (t: Tarefa) => {
    if (!await confirmarNaTela(`EXCLUIR a tarefa "${t.titulo}"? Só esta tarefa será apagada.`)) return;
    if (!await confirmarNaTela(`Segunda confirmação: EXCLUIR "${t.titulo}" de verdade? Não dá para desfazer.`)) return;
    await agir(`/api/tarefas-equipe/${t.id}`, 'DELETE');
  };
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setMsg('');
    try {
      const pessoa = equipe.find((p) => p.id === dest);
      await chamar('/api/tarefas-equipe', 'POST', { titulo: servico, destinatarioLogin: pessoa?.login, cnpj: cnpj || undefined, prazo: prazo || undefined });
      setServico(''); setCnpj(''); setPrazo(''); setForm(false); setVisao(pessoa && pessoa.id !== eu ? 'que-pedi' : 'para-mim'); await carregar();
    } catch (er) { setMsg(er instanceof Error ? er.message : 'Falha.'); } finally { setEnviando(false); }
  };

  const adm = auth.administrador;
  const abertas = itens.filter((t) => !t.concluidaEm);
  const feitas = itens.filter((t) => t.concluidaEm);
  const cartao = (t: Tarefa) => {
    const souDest = t.destinatario.login === auth.usuario;
    const podeExcluir = t.criadaPor.login === auth.usuario || adm;
    const estado = t.concluidaEm ? `Feita em ${dh(t.concluidaEm)}` : t.vistoEm ? `Vista em ${dh(t.vistoEm)}` : t.origem === 'delegada' ? 'Ainda não vista' : 'Anotada';
    return (
      <article key={t.id} className={`rounded-lg border p-2.5 ${t.concluidaEm ? 'border-slate-200 bg-slate-50' : t.vencida ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'}`}>
        <button type="button" onClick={() => void abrir(t)} className="block w-full text-left" aria-expanded={aberta === t.id}>
          <span className={`block text-sm font-bold ${t.concluidaEm ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{t.titulo}</span>
          <span className="mt-0.5 block text-xs text-slate-600">
            {visao === 'que-pedi' ? `Para ${t.destinatario.nome}` : t.origem === 'delegada' ? `Pedido de ${t.criadaPor.nome}` : 'Tarefa sua'}
            {t.empresaCnpj ? ` · ${t.empresaNome || t.empresaCnpj}` : ''}
            {t.prazo ? ` · prazo ${dia(t.prazo)}` : ''}
          </span>
          <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold">
            <span className={`rounded px-1.5 py-0.5 ${t.concluidaEm ? 'bg-emerald-100 text-emerald-800' : t.vistoEm ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}`}>{estado}</span>
            {t.vencida && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">Prazo vencido</span>}
          </span>
        </button>
        {aberta === t.id && (
          <div className="mt-2 border-t pt-2 text-sm">
            <p className="whitespace-pre-wrap text-slate-800">{t.mensagem}</p>
            <p className="mt-1 text-xs text-slate-500">Criada em {dh(t.criadaEm)}{t.vistoEm ? ` · vista em ${dh(t.vistoEm)}` : ''}{t.concluidaEm ? ` · feita em ${dh(t.concluidaEm)}` : ''}</p>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void abrir(t)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">{aberta === t.id ? 'Fechar' : 'Abrir'}</button>
          {souDest && !t.vistoEm && !t.concluidaEm && <button type="button" onClick={() => void agir(`/api/tarefas-equipe/${t.id}/vista`)} className="rounded-lg border border-sky-700 px-3 py-2 text-xs font-bold text-sky-800">Marcar como vista</button>}
          {souDest && !t.concluidaEm && <button type="button" onClick={() => void agir(`/api/tarefas-equipe/${t.id}/concluir`)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Marcar como feita</button>}
          {podeExcluir && <button type="button" onClick={() => void excluir(t)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700">Excluir</button>}
        </div>
      </article>
    );
  };

  return (
    <section className="space-y-2 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-slate-900">Tarefas da equipe</h2>
        <button type="button" onClick={() => setForm((v) => !v)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">{form ? 'Fechar' : adm ? 'Pedir para alguém' : 'Anotar para mim'}</button>
      </div>
      {form && (
        <form onSubmit={enviar} className="space-y-2 rounded-xl border border-slate-300 bg-white p-3">
          {adm && <label className="block text-xs font-semibold">Quem vai fazer
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm">{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu ? ' (eu mesma)' : ''}</option>)}</select>
          </label>}
          <label className="block text-xs font-semibold">Serviço
            <input required minLength={3} maxLength={200} value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: conciliar o banco" className="mt-1 w-full rounded-lg border p-2 text-sm" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold">Empresa (opcional)
              <select value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="">Nenhuma</option>{empresas.map((e) => <option key={e.cnpj} value={e.cnpj}>{e.nome}</option>)}</select>
            </label>
            <label className="block text-xs font-semibold">Prazo (opcional)
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" />
            </label>
          </div>
          <button disabled={enviando} className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">{enviando ? 'Enviando…' : adm ? 'Enviar pedido' : 'Anotar'}</button>
        </form>
      )}
      {adm && (
        <div className="flex gap-1.5" role="tablist">
          {(['para-mim', 'que-pedi'] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold sm:flex-none ${visao === v ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white'}`}>{v === 'para-mim' ? 'Pedidos para mim' : 'Que eu pedi'}</button>)}
        </div>
      )}
      {msg && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-800">{msg}</p>}
      {carregando && <p className="text-sm text-slate-500">Carregando…</p>}
      {!carregando && !itens.length && !msg && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">{visao === 'que-pedi' ? 'Você ainda não pediu nenhum serviço.' : 'Nenhum pedido para você agora.'}</p>}
      {visao === 'para-mim' && abertas.some((t) => t.origem === 'delegada') && <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Pedidos da contadora</h3>}
      <div className="space-y-2">{(visao === 'para-mim' ? abertas.filter((t) => t.origem === 'delegada') : abertas).map(cartao)}</div>
      {visao === 'para-mim' && abertas.some((t) => t.origem === 'propria') && <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Minhas tarefas</h3>}
      {visao === 'para-mim' && <div className="space-y-2">{abertas.filter((t) => t.origem === 'propria').map(cartao)}</div>}
      {feitas.length > 0 && <details className="pt-1"><summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Concluídas ({feitas.length})</summary><div className="mt-2 space-y-2">{feitas.map(cartao)}</div></details>}
    </section>
  );
}
