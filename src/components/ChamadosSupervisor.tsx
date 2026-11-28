import React, { useCallback, useEffect, useState } from 'react';
import { confirmarNaTela } from '../utils/dialogoNaTela';

// Chamados para o supervisor — o mesmo arquivo existe no DP, no Fiscal e no Contábil (mesmo nome e mesmo lugar na tela).
// Pedido do Beny (28/11/2026): quando a Murad diz "vou chamar meu supervisor", isso tem de chegar ao dono NA HORA.
//  - SinoChamadosSupervisor: só o dono do sistema. Botão pequeno no canto de baixo, à esquerda: "Chamados para o supervisor (N)".
//    Aparece só quando há chamado aberto (não ocupa a tela do celular à toa). Abre a lista com Responder e Resolvido.
//    O aviso no aparelho (push) abre o sistema em /#chamados-supervisor e a lista já abre sozinha.
//  - RespostasDoSupervisor: para quem perguntou. Na próxima vez que abrir o sistema, a resposta do dono aparece como mensagem da Murad.

type Contexto = { escritorio?: string | null; empresaCnpj?: string | null; empresaNome?: string | null; tela?: string | null; origem?: 'ferramenta' | 'automatico'; respostaMurad?: string | null; sistema?: string } | null;
export type ChamadoTela = {
  id: string; sistema: string; login: string; cnpj: string | null; pergunta: string; contexto: Contexto; resolvida: boolean; em: string;
  vistoEm: string | null; avisosEnviados: number; aparelhosAvisados: number; resposta: string | null; respondidaEm: string | null; respostaLidaEm: string | null;
};

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

async function postar(url: string, corpo: object = {}): Promise<any> {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível concluir.');
  return d;
}

/** Lista dos chamados com Responder e Resolvido (só o dono do sistema). Ao abrir, marca os abertos como vistos. */
export function PainelChamadosSupervisor({ ativarAvisos, aoMudar }: { ativarAvisos?: React.ReactNode; aoMudar?: () => void }) {
  const [chamados, setChamados] = useState<ChamadoTela[]>([]);
  const [todas, setTodas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState('');
  const [textos, setTextos] = useState<Record<string, string>>({});
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/auth/duvidas-supervisor${todas ? '?todas=1' : ''}`, { credentials: 'include', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível carregar os chamados.');
      setChamados(Array.isArray(d.duvidas) ? d.duvidas : []); setMsg('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível carregar os chamados.'); }
    finally { setCarregando(false); }
  }, [todas]);
  useEffect(() => { void postar('/api/auth/duvidas-supervisor/vistos').then(() => aoMudar?.()).catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(); const t = window.setInterval(() => void carregar(), 60_000); return () => window.clearInterval(t); }, [carregar]);

  const responder = async (c: ChamadoTela) => {
    const texto = (textos[c.id] || '').trim();
    if (texto.length < 2) { setMsg('Escreva a resposta no campo "Sua resposta" antes de clicar em Responder.'); return; }
    try {
      const d = await postar(`/api/auth/duvidas-supervisor/${encodeURIComponent(c.id)}/responder`, { resposta: texto });
      setTextos((t) => ({ ...t, [c.id]: '' }));
      setMsg(`Resposta enviada para ${c.login}. Ela aparece como mensagem da Murad na próxima vez que a pessoa abrir o sistema${d.avisouAparelho ? ' (e já foi avisada no aparelho)' : ''}.`);
      await carregar(); aoMudar?.();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível responder.'); }
  };
  const resolver = async (c: ChamadoTela) => {
    if (!await confirmarNaTela(`Marcar como resolvido o chamado de ${c.login}? Ele sai da lista de abertos (fica guardado em "Ver também os resolvidos").`)) return;
    try { await postar(`/api/auth/duvidas-supervisor/${encodeURIComponent(c.id)}/resolver`); await carregar(); aoMudar?.(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível marcar como resolvido.'); }
  };

  return (
    <div id="chamados-supervisor">
      <p className="mb-2 text-xs text-slate-700">Quando a Murad de algum escritório não sabe resolver um pedido, ela registra aqui e avisa a pessoa que levou ao supervisor — você. Escreva a resposta e clique em <strong>Responder</strong>: ela volta para a pessoa como mensagem da Murad. Depois clique em <strong>Resolvido</strong>.</p>
      {ativarAvisos && <div className="mb-2">{ativarAvisos}</div>}
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver também os resolvidos</label>
      {msg && <p role="status" className="mb-2 rounded border border-sky-200 bg-white p-2 text-sm text-slate-800">{msg}</p>}
      {carregando && <p className="text-sm text-slate-500">Carregando…</p>}
      {!carregando && chamados.length === 0 && <p className="text-sm text-slate-500">Nenhum chamado {todas ? '' : 'em aberto '}agora.</p>}
      {chamados.map((c) => {
        const ctx = c.contexto || {};
        return (
          <div key={c.id} className="border-t border-slate-200 py-2 text-sm">
            <p className="text-xs text-slate-600">
              <strong className="text-slate-900">{c.login}</strong>
              {ctx.escritorio && ctx.escritorio !== c.login ? ` · escritório ${ctx.escritorio}` : ''} · {c.sistema}
              {ctx.empresaNome || c.cnpj ? ` · empresa ${ctx.empresaNome || ''}${c.cnpj ? ` (CNPJ ${c.cnpj})` : ''}` : ''}
              {ctx.tela ? ` · tela ${ctx.tela}` : ''} · {hora(c.em)}
              {ctx.origem === 'automatico' ? ' · registrado pelo servidor (a Murad prometeu e não tinha registrado)' : ''}
              {c.resolvida ? ' · RESOLVIDO' : ''}
            </p>
            <p className="mt-1 font-medium text-slate-900">{c.pergunta}</p>
            {ctx.respostaMurad && <p className="mt-1 text-xs text-slate-600">A Murad respondeu: {ctx.respostaMurad}</p>}
            {c.resposta && <p className="mt-1 rounded bg-green-50 p-2 text-xs text-green-900">Sua resposta ({hora(c.respondidaEm)}): {c.resposta} {c.respostaLidaEm ? `· a pessoa já viu (${hora(c.respostaLidaEm)})` : '· a pessoa ainda não abriu o sistema'}</p>}
            {!c.resolvida && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <textarea aria-label={`Sua resposta para ${c.login}`} placeholder="Sua resposta" value={textos[c.id] || ''} onChange={(e) => setTextos((t) => ({ ...t, [c.id]: e.target.value }))} rows={2} maxLength={2000} className="min-w-0 flex-1 rounded border p-2 text-sm" />
                <div className="flex gap-2 sm:flex-col">
                  <button type="button" onClick={() => void responder(c)} className="rounded bg-sky-700 px-3 py-1.5 font-semibold text-white">Responder</button>
                  <button type="button" onClick={() => void resolver(c)} className="rounded border border-slate-400 px-3 py-1.5 text-slate-800">Resolvido</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Contador do dono (canto de baixo, à esquerda). Some para quem não é o dono e quando não há chamado aberto. */
export function SinoChamadosSupervisor({ ativarAvisos }: { ativarAvisos?: React.ReactNode }) {
  const [n, setN] = useState<{ abertos: number; novos: number } | null>(null);
  const [aberto, setAberto] = useState(false);
  const contar = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/duvidas-supervisor/contagem', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) { setN(null); return; }
      const d = await r.json().catch(() => ({}));
      setN(d.sucesso === true && d.dono === true ? { abertos: Number(d.abertos || 0), novos: Number(d.novos || 0) } : null);
    } catch { /* sem rede: tenta de novo no próximo minuto */ }
  }, []);
  useEffect(() => {
    void contar();
    const t = window.setInterval(() => void contar(), 60_000);
    const abrirPeloAviso = () => { if (window.location.hash === '#chamados-supervisor') setAberto(true); };
    abrirPeloAviso();
    window.addEventListener('hashchange', abrirPeloAviso);
    return () => { window.clearInterval(t); window.removeEventListener('hashchange', abrirPeloAviso); };
  }, [contar]);
  if (!n) return null;
  if (!aberto && n.abertos === 0) return null;
  return (
    <>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} title="Chamados para o supervisor: pedidos que a Murad não soube resolver"
          className={`fixed bottom-3 left-3 z-[2147483000] rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-lg ${n.novos ? 'animate-pulse bg-red-700' : 'bg-sky-800'}`}>
          🔔 <span className="hidden sm:inline">Chamados para o supervisor </span>({n.abertos})
        </button>
      )}
      {aberto && (
        <div role="dialog" aria-modal="true" aria-label="Chamados para o supervisor" className="fixed inset-0 z-[2147483000] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setAberto(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-sky-50 p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Chamados para o supervisor ({n.abertos})</h3>
              <button type="button" onClick={() => { setAberto(false); if (window.location.hash === '#chamados-supervisor') history.replaceState(null, '', window.location.pathname + window.location.search); }} className="rounded border border-slate-400 px-3 py-1 text-sm">Fechar</button>
            </div>
            <PainelChamadosSupervisor ativarAvisos={ativarAvisos} aoMudar={() => void contar()} />
          </div>
        </div>
      )}
    </>
  );
}

/** Para quem perguntou: a resposta do supervisor aparece como mensagem da Murad na próxima vez que abrir o sistema. */
export function RespostasDoSupervisor() {
  const [respostas, setRespostas] = useState<Array<{ id: string; pergunta: string; resposta: string; respondidaEm: string }>>([]);
  const buscar = useCallback(async () => {
    try {
      const r = await fetch('/api/ai/agente/respostas-supervisor', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json().catch(() => ({}));
      if (d.sucesso === true && Array.isArray(d.respostas)) setRespostas(d.respostas);
    } catch { /* sem rede: tenta de novo depois */ }
  }, []);
  useEffect(() => { void buscar(); const t = window.setInterval(() => void buscar(), 5 * 60_000); return () => window.clearInterval(t); }, [buscar]);
  const lida = async (id: string) => {
    setRespostas((l) => l.filter((x) => x.id !== id));
    try { await postar(`/api/ai/agente/respostas-supervisor/${encodeURIComponent(id)}/lida`); } catch { void buscar(); }
  };
  if (!respostas.length) return null;
  const r = respostas[0];
  return (
    <div role="status" aria-live="polite" className="fixed bottom-3 left-3 right-3 z-[2147482999] mx-auto max-w-md rounded-xl border-2 border-sky-300 bg-white p-3 text-sm shadow-xl">
      <p className="font-semibold text-sky-900">Murad: chegou a resposta do meu supervisor{respostas.length > 1 ? ` (1 de ${respostas.length})` : ''}</p>
      <p className="mt-1 text-xs text-slate-600">Você perguntou: {r.pergunta}</p>
      <p className="mt-1 whitespace-pre-wrap text-slate-900">{r.resposta}</p>
      <div className="mt-2 flex justify-end"><button type="button" onClick={() => void lida(r.id)} className="rounded bg-sky-700 px-3 py-1.5 font-semibold text-white">Entendi</button></div>
    </div>
  );
}
