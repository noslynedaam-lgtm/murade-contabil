import React, { useCallback, useEffect, useState } from 'react';
import { confirmarNaTela } from '../../utils/dialogoNaTela';
import { OpcaoVozAssistente } from '../OpcaoVozAssistente';
import { useExclusaoDuasEtapas } from '../ConfirmaExclusaoDuasEtapas';
import { PROTECOES_FIXAS, rotuloDaTela } from '../../data/jeitoPadraoContabil';
import { descreverReceita } from '../../server/meuJeito';
import { pedirApresentacao } from '../../utils/apresentacaoCliente';
import { chamarJeito, definirJeito, useJeito, type VisaoJeito } from '../../utils/meuJeitoCliente';

// Meu jeito: o que a Agente aprendeu de você. Compacto (celular): sem faixa fixa. Mudar ou voltar ao padrão é sempre UMA coisa por vez,
// com confirmação; não existe botão que apague tudo. O jeito nunca desliga as proteções do sistema.
const ORIGEM = { voce: 'seu', escritorio: 'do escritório', padrao: 'padrão' } as const;
type PassoForm = { acao: string; tela: string; secao: string; assunto: string };
const passoVazio: PassoForm = { acao: 'mostrar_atalho', tela: '', secao: '', assunto: 'pendencias' };

export function MeuJeitoTab() {
  const j = useJeito();
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const { pedir: pedirExclusao, dialogo: dialogoExclusao } = useExclusaoDuasEtapas();
  const [novo, setNovo] = useState(false);
  const [quando, setQuando] = useState<'entrar_no_sistema' | 'abrir_tela'>('abrir_tela');
  const [telaQuando, setTelaQuando] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [passos, setPassos] = useState<PassoForm[]>([{ ...passoVazio }]);

  const recarregar = useCallback(async () => { try { const d = await chamarJeito<{ jeito: VisaoJeito }>('/api/meu-jeito'); definirJeito(d.jeito); } catch (e) { setMsg(e instanceof Error ? e.message : 'Falha ao carregar.'); } }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const agir = async (url: string, corpo: object, ok: string) => {
    setOcupado(true); setMsg('');
    try { const d = await chamarJeito<{ jeito: VisaoJeito }>(url, 'POST', corpo); definirJeito(d.jeito); setMsg(ok); return true; }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
    finally { setOcupado(false); }
  };
  if (!j) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{msg || 'Carregando o seu jeito…'}</div>;

  const salvarPref = (chave: string, valor: unknown, escopo: 'usuario' | 'escritorio' = 'usuario') => agir('/api/meu-jeito/preferencias', { chave, valor, escopo }, escopo === 'escritorio' ? 'Salvo como padrão do escritório.' : 'Salvo. Agora eu trabalho assim com você.');
  const voltarPref = async (chave: string, rotulo: string, escopo: 'usuario' | 'escritorio' = 'usuario') => {
    if (!await pedirExclusao({ titulo: 'Voltar ao jeito padrão?', oQue: `o seu jeito salvo em "${rotulo}"${escopo === 'escritorio' ? ' (padrão de todo o escritório)' : ''}`, consequencias: ['Só esta parte volta ao jeito padrão do sistema.', 'As outras preferências e regras continuam como estão.'], rotuloFinal: 'Sim, voltar ao padrão', irreversivel: false, comoVoltar: 'Para ter de novo, será preciso configurar essa preferência outra vez.' })) return;
    await agir('/api/meu-jeito/preferencias/remover', { chave, escopo }, 'Pronto, voltei ao jeito padrão nessa parte.');
  };
  const removerRegra = async (id: string, descricao: string) => {
    if (!await pedirExclusao({ titulo: 'Remover esta regra?', oQue: `a regra: ${descricao}`, consequencias: ['A regra é apagada e o sistema volta ao jeito padrão nessa parte.', 'As outras regras ficam como estão.'], rotuloFinal: 'Sim, remover a regra', irreversivel: false, comoVoltar: 'Para ter a regra de novo, será preciso criá-la outra vez.' })) return;
    await agir('/api/meu-jeito/receitas/remover', { id }, 'Regra removida.');
  };
  const salvarNome = async () => {
    setOcupado(true); setMsg('');
    try { const r = await chamarJeito<{ nome: string }>('/api/meu-jeito/nome', 'POST', { nome: nomeNovo }); setNomeNovo(''); setMsg(`Combinado, vou te chamar de ${r.nome}.`); await recarregar(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Não foi possível guardar o nome.'); }
    finally { setOcupado(false); }
  };
  const secoesDa = (tela: string) => j.catalogo.secoes.filter((s) => s.tela === tela);
  const montarAcoes = () => passos.map((p) => (p.acao === 'mostrar_atalho' ? { tipo: p.acao, tela: p.tela } : p.acao === 'destacar_secao' ? { tipo: p.acao, tela: telaQuando, secao: p.secao } : { tipo: p.acao, assunto: p.assunto }));
  const gatilho = quando === 'entrar_no_sistema' ? { tipo: quando } : { tipo: quando, tela: telaQuando };
  const salvarRegra = async () => {
    const previa = (() => { try { return descreverReceita({ gatilho: gatilho as any, acoes: montarAcoes() as any }); } catch { return ''; } })();
    if (!await confirmarNaTela(`Entendi assim:\n\n${previa || 'regra incompleta'}\n\nSalvar esta regra? Ela nunca confirma nada por você.`)) return;
    if (await agir('/api/meu-jeito/receitas', { gatilho, acoes: montarAcoes() }, 'Regra salva.')) { setNovo(false); setPassos([{ ...passoVazio }]); }
  };
  const sel = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-blue-200 bg-white p-3">
        <h2 className="text-base font-bold text-slate-900">Meu jeito</h2>
        <p className="mt-1 text-sm text-slate-700">A Agente aprende como você prefere trabalhar e passa a trabalhar assim. Só guardo preferências de uso: nada do que você digita e nenhum dado de empresa ou lançamento. Você também pode ensinar falando com a Agente.</p>
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nomeNovo.trim()) void salvarNome(); }}>
          <label htmlFor="meu-jeito-nome" className="text-sm font-semibold text-slate-800">Como te chamar{j.nome ? `: ${j.nome}` : ''}</label>
          <input id="meu-jeito-nome" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value.slice(0, 60))} placeholder={j.nome ? 'Mudar meu nome' : 'Seu nome'} maxLength={60} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="submit" disabled={ocupado || !nomeNovo.trim()} className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-semibold text-blue-900 disabled:opacity-50">{j.nome ? 'Mudar meu nome' : 'Salvar nome'}</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => pedirApresentacao({ acao: 'iniciar' })} className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white">Me conte o que o sistema faz</button>
          <button type="button" onClick={() => pedirApresentacao({ acao: 'iniciar', secao: 'integracoes' })} className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-900">O que é integrado?</button>
        </div>
        <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">O que o meu jeito nunca muda</summary><ul className="mt-1 list-disc pl-5">{PROTECOES_FIXAS.map((p) => <li key={p}>{p}</li>)}</ul></details>
      </section>
      {msg && <p role="status" className="rounded-lg bg-slate-100 p-2 text-sm text-slate-800">{msg}</p>}

      {j.sugestoes.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h3 className="text-sm font-bold text-amber-900">Sugestões (só valem se você disser sim)</h3>
          {j.sugestoes.map((s) => (
            <div key={s.id} className="mt-2"><p className="text-sm text-slate-900">{s.texto}</p>
              <div className="mt-1 flex gap-2">
                <button type="button" disabled={ocupado} onClick={() => void agir('/api/meu-jeito/sugestoes/aceitar', { id: s.id }, 'Pronto, atalho salvo.')} className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-bold text-white">Sim, quero</button>
                <button type="button" disabled={ocupado} onClick={() => void agir('/api/meu-jeito/sugestoes/dispensar', { id: s.id }, 'Tudo bem, não sugiro de novo.')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Agora não</button>
              </div></div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">Como eu trabalho com você</h3>
        <div className="mt-2 space-y-3">
          {j.preferencias.map((p) => (
            <div key={p.chave} className="border-b border-slate-100 pb-2 last:border-0">
              <div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{p.rotulo}</p><span className="text-[11px] font-bold uppercase text-slate-500">{ORIGEM[p.origem]}</span></div>
              <p className="text-xs text-slate-600">{p.descricao}</p>
              {p.maxLista ? (
                <details className="mt-1"><summary className="cursor-pointer text-sm text-blue-900">Atual: {p.valorTexto}</summary>
                  <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {(p.opcoes || []).map((o) => { const marcado = (p.valor as string[]).includes(o.valor); return (
                      <label key={o.valor} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marcado} disabled={ocupado || (!marcado && (p.valor as string[]).length >= p.maxLista!)}
                        onChange={() => void salvarPref(p.chave, marcado ? (p.valor as string[]).filter((x) => x !== o.valor) : [...(p.valor as string[]), o.valor])} />{o.rotulo}</label>); })}
                  </div><p className="mt-1 text-[11px] text-slate-500">Até {p.maxLista} telas; a ordem é a que você marcou.</p></details>
              ) : (
                <select aria-label={p.rotulo} className={`${sel} mt-1`} disabled={ocupado} value={typeof p.valor === 'boolean' ? (p.valor ? 'sim' : 'nao') : String(p.valor)} onChange={(e) => void salvarPref(p.chave, e.target.value)}>
                  {(p.opcoes || []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                {p.origem === 'voce' && <button type="button" disabled={ocupado} onClick={() => void voltarPref(p.chave, p.rotulo)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Voltar ao padrão</button>}
                {j.podeEditarEscritorio && p.escopoEscritorio && <button type="button" disabled={ocupado} onClick={() => void salvarPref(p.chave, p.valor, 'escritorio')} className="rounded-lg border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-900">Usar como padrão do escritório</button>}
                {j.podeEditarEscritorio && p.valorEscritorio !== null && p.valorEscritorio !== undefined && <button type="button" disabled={ocupado} onClick={() => void voltarPref(p.chave, p.rotulo, 'escritorio')} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Tirar do padrão do escritório</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Voz da assistente: grátis, do próprio aparelho; automática = a mais natural. Guardada por usuário neste aparelho. */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900">
        <OpcaoVozAssistente />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Regras que eu aprendi</h3>
          <button type="button" onClick={() => setNovo(!novo)} className="rounded-lg border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-900">{novo ? 'Fechar' : 'Nova regra'}</button></div>
        {j.receitas.length === 0 && <p className="mt-1 text-sm text-slate-600">Nenhuma ainda. Diga à Agente, por exemplo: "quando eu abrir o Balancete, destaque o Balancete de verificação".</p>}
        {j.receitas.map((r) => (
          <div key={r.id} className="mt-2 rounded-lg border border-slate-200 p-2">
            <p className={`text-sm ${r.obsoleta ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{r.descricao}</p>
            {r.obsoleta && <p className="text-xs font-semibold text-amber-800">Obsoleta: o sistema mudou e a regra está pausada.</p>}
            <p className="text-[11px] text-slate-500">{r.origem === 'sugerida' ? 'Veio de uma sugestão que você aceitou.' : 'Você ensinou.'}</p>
            <button type="button" disabled={ocupado} onClick={() => void removerRegra(r.id, r.descricao)} className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Voltar ao padrão (remover)</button>
          </div>
        ))}
        {novo && (
          <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
            <label className="block text-xs font-semibold">Quando<select className={sel} value={quando} onChange={(e) => setQuando(e.target.value as any)}><option value="abrir_tela">ao abrir uma tela</option><option value="entrar_no_sistema">ao entrar no sistema</option></select></label>
            {quando === 'abrir_tela' && <label className="block text-xs font-semibold">Qual tela<select className={sel} value={telaQuando} onChange={(e) => setTelaQuando(e.target.value)}><option value="">Escolha…</option>{j.catalogo.telas.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select></label>}
            {passos.map((p, i) => (
              <div key={i} className="rounded-lg bg-white p-2"><p className="text-xs font-bold">Passo {i + 1}</p>
                <select aria-label={`Ação do passo ${i + 1}`} className={sel} value={p.acao} onChange={(e) => setPassos(passos.map((x, k) => (k === i ? { ...x, acao: e.target.value } : x)))}>
                  <option value="mostrar_atalho">mostrar um atalho para outra tela</option>
                  {quando === 'abrir_tela' && <option value="destacar_secao">destacar uma parte desta tela</option>}
                  <option value="perguntar_agente">pedir uma consulta à Agente (usa crédito de IA)</option>
                </select>
                {p.acao === 'mostrar_atalho' && <select aria-label="Tela do atalho" className={`${sel} mt-1`} value={p.tela} onChange={(e) => setPassos(passos.map((x, k) => (k === i ? { ...x, tela: e.target.value } : x)))}><option value="">Escolha a tela…</option>{j.catalogo.telas.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}</select>}
                {p.acao === 'destacar_secao' && <select aria-label="Parte a destacar" className={`${sel} mt-1`} value={p.secao} onChange={(e) => setPassos(passos.map((x, k) => (k === i ? { ...x, secao: e.target.value } : x)))}><option value="">{secoesDa(telaQuando).length ? 'Escolha a parte…' : `Em ${telaQuando ? rotuloDaTela(telaQuando) : 'esta tela'} não há parte para destacar`}</option>{secoesDa(telaQuando).map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</select>}
                {p.acao === 'perguntar_agente' && <select aria-label="Consulta" className={`${sel} mt-1`} value={p.assunto} onChange={(e) => setPassos(passos.map((x, k) => (k === i ? { ...x, assunto: e.target.value } : x)))}>{j.catalogo.assuntos.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select>}
                {passos.length > 1 && <button type="button" onClick={() => setPassos(passos.filter((_, k) => k !== i))} className="mt-1 text-xs font-semibold text-slate-600">Tirar este passo</button>}
              </div>
            ))}
            {passos.length < j.catalogo.maxAcoes && <button type="button" onClick={() => setPassos([...passos, { ...passoVazio }])} className="text-xs font-semibold text-blue-900">+ Mais um passo (na ordem)</button>}
            <button type="button" disabled={ocupado} onClick={() => void salvarRegra()} className="w-full rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white">Ver como entendi e salvar</button>
          </div>
        )}
      </section>
      {dialogoExclusao}
    </div>
  );
}
