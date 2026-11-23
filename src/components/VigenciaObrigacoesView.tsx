import React, { useCallback, useEffect, useState } from 'react';

// Tela "Vigência das obrigações" (a mesma nos três sistemas Murad): o que começa, o que muda e o que acaba, com a fonte oficial;
// "Obrigações encerradas" escondida (períodos antigos para retificar, consultar e entregar em atraso) e o "Rodar agora" do robô.
interface Fonte { nome: string; url: string }
interface Item {
  id: string; nome: string; tipo: string; sistemas: string[]; inicio: string | null; fim: string | null; estado: 'futura' | 'vigente' | 'encerrada' | 'expirada';
  encerraEm: string | null; saiDeVezEm: string | null; fonteInicio: Fonte | null; fonteFim: Fonte | null; mudanca: { em: string; texto: string; fonte: Fonte } | null;
  continua: string | null; substituidaPor: string | null; pendencia: string | null; prazoReforma: string | null; desteSistema: boolean;
}
interface Encerrada { id: string; nome: string; ultimoPeriodo: string; encerradaEm: string; disponivelDe: string; disponivelAte: string; saiDeVezEm: string; continua: string | null; substituidaPor: string | null; fonte: Fonte | null }
interface Aviso { chave: string; id: string; tipo: string; data: string; dias: number; titulo: string; texto: string; fonte: Fonte | null; prazoReforma: string | null }
interface Dados { hoje: string; itens: Item[]; encerradas: Encerrada[]; avisos: Aviso[]; historico: Array<{ titulo: string; texto: string; data: string; criadoEm: string }>; ultimaRodada: { resumo: string; em: string } | null; ultimaConferencia: { resumo: string; em: string; atencao: boolean } | null; prazoGuarda: Fonte }

const NOME_SISTEMA: Record<string, string> = { fiscal: 'Fiscal', dp: 'DP', contabil: 'Contábil' };
const br = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const comp = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : '—');
const botao = 'rounded-lg border border-[#0F2B5B] bg-[#0F2B5B] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 cursor-pointer';
const botaoClaro = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer disabled:opacity-50';
async function chamar(caminho: string, metodo = 'GET', corpo?: unknown): Promise<any> {
  try {
    const r = await fetch(caminho, { method: metodo, credentials: 'include', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    return await r.json().catch(() => ({ sucesso: false, motivo: 'Resposta inesperada do servidor.' }));
  } catch { return { sucesso: false, motivo: 'Sem conexão com o servidor.' }; }
}
const Barra: React.FC<{ etapa: number; total: number; texto: string }> = ({ etapa, total, texto }) => {
  const pct = Math.max(5, Math.min(100, Math.round((etapa / total) * 100)));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento do Robô de Vigência" className="rounded-lg border border-sky-200 bg-sky-50 p-2">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-sky-900"><span>{texto}</span><span className="shrink-0">{etapa} de {total}</span></div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sky-100"><div className="h-2 animate-pulse rounded-full bg-[#165DFF] transition-all duration-500" style={{ width: `${pct}%` }} /></div>
    </div>
  );
};
const LinkFonte: React.FC<{ f: Fonte | null }> = ({ f }) => (f ? <a className="underline text-slate-600" href={f.url} target="_blank" rel="noreferrer">{f.nome}</a> : <span className="text-slate-500">sem fonte oficial</span>);
const situacao = (i: Item) => i.estado === 'futura' ? `Começa no período ${comp(i.inicio)}` : i.estado === 'encerrada' ? `Encerrada: último período ${comp(i.fim)}` : i.estado === 'expirada' ? 'Saiu de vez (prazo de 5 anos passou)' : i.fim ? `Vigente; último período ${comp(i.fim)} (sai em ${br(i.encerraEm)})` : 'Vigente, sem fim com fonte oficial';
const corSituacao = (i: Item) => i.estado === 'encerrada' ? 'bg-slate-100 text-slate-700' : i.estado === 'futura' ? 'bg-sky-100 text-sky-900' : i.fim ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';

export const VigenciaObrigacoesView: React.FC<{
  /** Abre a tela onde o período antigo é retificado/consultado (id do item → id da tela deste sistema). */
  telas?: Record<string, string>; onNavegar?: (tela: string) => void; onVoltar?: () => void;
  /** Fiscal: abre o Planejamento da Reforma (os avisos de CBS/IBS apontam para ele, sem repetir). */
  abrirReforma?: () => void;
}> = ({ telas = {}, onNavegar, abrirReforma }) => {
  const [dados, setDados] = useState<Dados | null>(null); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
  const [andamento, setAndamento] = useState<{ etapa: number; texto: string } | null>(null);
  const carregar = useCallback(async () => { const r = await chamar('/api/vigencia-obrigacoes'); if (!r.sucesso) { setErro(r.motivo || 'Não foi possível carregar.'); return; } setErro(''); setDados(r); }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const rodarAgora = async () => {
    setMsg(''); setAndamento({ etapa: 1, texto: 'Lendo a lista de vigência…' });
    const t = setTimeout(() => setAndamento({ etapa: 2, texto: 'Conferindo o que começa, o que acaba e se algum robô gera obrigação encerrada…' }), 700);
    const r = await chamar('/api/vigencia-obrigacoes/rodar', 'POST', {}); clearTimeout(t);
    if (!r.sucesso) { setAndamento(null); setMsg(r.motivo || 'Não foi possível rodar agora.'); return; }
    setAndamento({ etapa: 3, texto: 'Gravando os avisos…' }); await new Promise((ok) => setTimeout(ok, 400));
    setAndamento({ etapa: 4, texto: 'Atualizando a tela…' }); await carregar(); setAndamento(null); setMsg(r.mensagem || 'Pronto.');
  };
  const deste = dados?.itens.filter((i) => i.desteSistema) ?? []; const outros = dados?.itens.filter((i) => !i.desteSistema) ?? [];
  const semFonte = deste.filter((i) => i.pendencia);
  return (
    <div data-campo="vigencia-obrigacoes-painel" className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-[#0F2B5B]">Vigência das obrigações</h1>
        <button type="button" data-campo="vigencia-rodar-agora" className={botao} disabled={andamento !== null} onClick={rodarAgora}>Rodar agora</button>
      </div>
      <p className="text-xs text-slate-600">O que acaba sai sozinho dos períodos novos (menu, vencimentos, robôs e avisos). Os períodos antigos ficam em "Obrigações encerradas", para retificar, consultar e entregar em atraso, até o prazo de 5 anos do CTN. Nada é apagado. Só entra data de fim com fonte oficial.</p>
      {andamento && <Barra etapa={andamento.etapa} total={4} texto={andamento.texto} />}
      {msg && <p role="status" className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">{msg}</p>}
      {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">{erro}</p>}
      {dados && <>
        {dados.avisos.length > 0 && <section aria-label="Avisos dos próximos 30 dias" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
          <b className="text-[11px] uppercase">Próximos 30 dias</b>
          {dados.avisos.map((a) => <div key={a.chave}><b>{a.titulo}</b> — faltam {a.dias} dia(s). {a.texto} <LinkFonte f={a.fonte} />
            {a.prazoReforma && abrirReforma && <button type="button" className="ml-1 underline font-semibold" onClick={abrirReforma}>Ver no Planejamento da Reforma</button>}</div>)}
        </section>}
        <section aria-label="Obrigações deste sistema" className="space-y-2">
          {deste.map((i) => <div key={i.id} data-campo={`vigencia-item-${i.id}`} className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-1"><b className="text-sm">{i.nome}</b><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${corSituacao(i)}`}>{situacao(i)}</span></div>
            {i.mudanca && <p className="mt-1">{i.mudanca.texto} <LinkFonte f={i.mudanca.fonte} /></p>}
            {i.continua && <p className="mt-1 text-slate-600">{i.continua}</p>}
            {i.substituidaPor && <p className="text-slate-600">No lugar: {i.substituidaPor}.</p>}
            <p className="mt-1 text-[11px]">{i.inicio && <>Início: <LinkFonte f={i.fonteInicio} />. </>}{i.fim && <>Fim: <LinkFonte f={i.fonteFim} />.</>}</p>
            {i.pendencia && <p className="mt-1 rounded border border-amber-200 bg-amber-50 p-1 text-amber-950"><b>Sem fonte oficial:</b> {i.pendencia}</p>}
            {i.prazoReforma && abrirReforma && <button type="button" className="mt-1 underline font-semibold" onClick={abrirReforma}>Ver no Planejamento da Reforma</button>}
          </div>)}
        </section>
        <details data-campo="vigencia-encerradas" className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-800">
          <summary className="cursor-pointer font-semibold">Obrigações encerradas ({dados.encerradas.length})</summary>
          {!dados.encerradas.length && <p className="mt-1 text-slate-600">Nenhuma obrigação deste sistema está encerrada hoje.</p>}
          <ul className="mt-1 space-y-2">{dados.encerradas.map((e) => <li key={e.id} className="rounded border border-slate-200 bg-white p-2">
            <b>{e.nome}</b>: períodos de {comp(e.disponivelDe)} a {comp(e.disponivelAte)} ainda disponíveis para retificar, consultar e entregar em atraso, até {br(e.saiDeVezEm)}. {e.continua} <LinkFonte f={e.fonte} />
            {telas[e.id] && onNavegar && <div className="mt-1"><button type="button" data-campo={`vigencia-abrir-${e.id}`} className={botaoClaro} onClick={() => onNavegar(telas[e.id])}>Abrir os períodos antigos</button></div>}
          </li>)}</ul>
        </details>
        {semFonte.length > 0 && <p className="text-[11px] text-slate-600">{semFonte.length} item(ns) sem fonte oficial de fim: continuam no sistema até haver fonte.</p>}
        {outros.length > 0 && <details className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
          <summary className="cursor-pointer font-semibold">Dos outros sistemas Murad ({outros.length})</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">{outros.map((i) => <li key={i.id}><b>{i.nome}</b> ({i.sistemas.map((s) => NOME_SISTEMA[s] || s).join(', ')}): {situacao(i)}.</li>)}</ul>
        </details>}
        {dados.historico.length > 0 && <details className="text-[11px] text-slate-600"><summary className="cursor-pointer font-semibold">Avisos já dados ({dados.historico.length})</summary>
          <ul className="mt-1 list-disc pl-5">{dados.historico.map((h, k) => <li key={k}>{br(h.criadoEm)}: {h.titulo}</li>)}</ul></details>}
        <p className="text-[11px] text-slate-500">Robô: {dados.ultimaRodada ? `${dados.ultimaRodada.resumo} (${new Date(dados.ultimaRodada.em).toLocaleString('pt-BR')})` : 'ainda não rodou desde a última atualização do sistema.'}</p>
        <p className={`text-[11px] ${dados.ultimaConferencia?.atencao ? 'font-semibold text-red-800' : 'text-slate-500'}`}>Conferidor: {dados.ultimaConferencia ? dados.ultimaConferencia.resumo : 'ainda não rodou desde a última atualização do sistema.'}</p>
        <p className="text-[11px] text-slate-500">Prazo de 5 anos: <LinkFonte f={dados.prazoGuarda} /> (contado pelo art. 173, I, a partir do vencimento).</p>
      </>}
    </div>
  );
};
export default VigenciaObrigacoesView;
