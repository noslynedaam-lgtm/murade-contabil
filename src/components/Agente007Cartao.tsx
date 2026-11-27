// Quadro discreto do "Agente 007 — conferidor do backup" na tela de Robôs (sem banner nem faixa fixa: no celular ocupa só o que precisa).
// Mostra a última rodada e o resumo curto de cada empresa do escritório que veio do backup; "Rodar agora" pede o OK antes.
// Para o DONO do sistema (só ele: o servidor devolve 403 para os escritórios clientes), mostra também "Campos do backup sem lugar no Murad".
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Play, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface Status007 { texto: string; ultima: string | null; aguardando: number; empresas: Array<{ cnpj: string; quando: string; texto: string; achados: number; pontos?: string[] }> }
interface LinhaCofre { tabela: string; coluna: string; registros: number; empresas: number; escritorios: number; formato: string; situacao: string; sugestao: string; implantados: number }

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ainda não rodou');
const SITUACAO: Record<string, string> = { sem_lugar: 'Sem campo no Murad (urgente)', campo_no_mapa_sem_implantador: 'Campo no mapa, falta implantar', implantado: 'Implantado' };

export const Agente007Cartao: React.FC = () => {
  const [st, setSt] = useState<Status007 | null>(null);
  const [cofre, setCofre] = useState<{ urgentes: number; linhas: LinhaCofre[] } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(async () => {
    try { const r = await fetch('/api/agente007/status', { credentials: 'include', cache: 'no-store' }); const d = await r.json(); if (d?.sucesso) setSt(d); } catch { /* sem rede: o quadro só não atualiza */ }
    try { const r = await fetch('/api/agente007/cofre', { credentials: 'include', cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d?.sucesso) setCofre({ urgentes: d.urgentes, linhas: d.linhas }); } } catch { /* só o dono vê */ }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const rodar = async () => {
    setConfirmar(false); setMsg('Pedindo ao 007…');
    try {
      const r = await fetch('/api/agente007/rodar-agora', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) });
      const d = await r.json(); setMsg(String(d?.mensagem || d?.motivo || 'Pedido enviado.'));
      setTimeout(() => { void carregar(); }, 15_000);
    } catch { setMsg('Sem conexão agora. Tente de novo.'); }
  };
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-3 text-sm" aria-label="Agente 007 — conferidor do backup">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck size={16} className="text-blue-700 shrink-0" />
          <h2 className="font-semibold text-slate-800 truncate">Agente 007 — conferidor do backup</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Última rodada: {dataHora(st?.ultima ?? null)}</span>
          {!confirmar ? (
            <button type="button" onClick={() => setConfirmar(true)} className="flex items-center gap-1 px-2.5 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold">
              <Play size={12} /> Rodar agora
            </button>
          ) : (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-slate-600">Conferir de novo o backup?</span>
              <button type="button" onClick={rodar} className="px-2 py-1 rounded bg-blue-700 text-white font-semibold">OK</button>
              <button type="button" onClick={() => setConfirmar(false)} className="px-2 py-1 rounded border border-slate-300">Cancelar</button>
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-slate-700">{st?.texto || 'O 007 começa sozinho quando a migração pelo backup grava a primeira empresa.'}</p>
      {msg && <p className="mt-1 text-xs text-blue-800">{msg}</p>}
      {Boolean(st?.empresas?.length) && (
        <button type="button" onClick={() => setAberto(!aberto)} className="mt-1 flex items-center gap-1 text-xs text-slate-600">
          {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberto ? 'Esconder' : 'Ver'} o relatório por empresa ({st!.empresas.length})
        </button>
      )}
      {aberto && st && (
        <ul className="mt-1 divide-y divide-slate-100 max-h-64 overflow-auto">
          {st.empresas.map((e) => (
            <li key={e.cnpj} className="py-1 text-xs flex flex-col sm:flex-row sm:gap-2">
              <span className="font-mono text-slate-500 shrink-0">{e.cnpj}</span>
              <span className="text-slate-700">{e.texto}{e.pontos?.length ? <span className="block text-slate-500">{e.pontos.join(' · ')}</span> : null}</span>
              <span className="text-slate-400 sm:ml-auto shrink-0">{dataHora(e.quando)}</span>
            </li>
          ))}
        </ul>
      )}
      {cofre && cofre.linhas.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <h3 className={`text-xs font-semibold flex items-center gap-1 ${cofre.urgentes ? 'text-red-700' : 'text-slate-700'}`}>
            {cofre.urgentes ? <AlertTriangle size={12} /> : null} Campos do backup sem lugar no Murad (só você vê) — {cofre.urgentes} para resolver
          </h3>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-[11px] mt-1">
              <thead><tr className="text-left text-slate-500"><th className="pr-2">Tabela.coluna</th><th className="pr-2">Registros</th><th className="pr-2">Empresas</th><th className="pr-2">Escritórios</th><th className="pr-2">Formato</th><th className="pr-2">Situação</th><th>Sugestão</th></tr></thead>
              <tbody>
                {cofre.linhas.map((l) => (
                  <tr key={`${l.tabela}.${l.coluna}`} className="border-t border-slate-100 align-top">
                    <td className="pr-2 font-mono">{l.tabela}.{l.coluna}</td><td className="pr-2">{l.registros}</td><td className="pr-2">{l.empresas}</td><td className="pr-2">{l.escritorios}</td>
                    <td className="pr-2 font-mono">{l.formato}</td><td className="pr-2">{SITUACAO[l.situacao] || l.situacao}</td><td>{l.sugestao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default Agente007Cartao;
