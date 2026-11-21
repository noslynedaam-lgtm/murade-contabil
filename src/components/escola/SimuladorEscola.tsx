// Simulador da Escola Murade: a "empresa de TREINO". Imita os campos e o botão da tela real, calcula com o motor real
// do servidor (/api/escola/simular) e NUNCA grava em empresa, nota, apuração, guia, lançamento, SEFAZ, Receita ou Contábil.
// Três fases: demonstração (a Agente faz e fala o porquê), prática guiada (confere cada clique/campo na hora) e prova
// (sem dica; corrigida no servidor, com nota, nível e aviso ao gestor).
import React, { useEffect, useRef, useState } from 'react';
import { registrarParador } from '../../utils/agenteParar';
import { AVISO_TREINO, EMPRESA_TREINO, avaliarAcaoGuiada, formatarResultado, passosDaPratica, valorParaLer, type AcaoAluno, type PraticaSim, type ResultadoProva } from '../../data/escolaPratica';

type Fase = 'inicio' | 'demo' | 'guiada' | 'prova' | 'fim';
interface Msg { texto: string; tipo: 'ok' | 'erro' | 'info' }

const espera = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const tempoDeFala = (t: string) => Math.min(9000, Math.max(1800, t.length * 45));
const ROTULOS: Record<string, string> = {
  faixa: 'Faixa', aliquotaEfetiva: 'Alíquota efetiva', das: 'DAS estimado', percentual: 'Fator R', anexo: 'Anexo', janela: 'Meses usados', situacao: 'Situação', classificacao: 'Parcela do PGDAS-D', aviso: 'Aviso',
  trimestre: 'Trimestre', baseIrpj: 'Base do IRPJ', irpj: 'IRPJ (15%)', adicional: 'Adicional do IRPJ', baseCsll: 'Base da CSLL', csll: 'CSLL (9%)', total: 'Total', aliquotaInterestadual: 'Alíquota interestadual',
  aliquotaInterna: 'Alíquota interna', difal: 'DIFAL', diasAtraso: 'Dias de atraso', multaPercentual: 'Multa (%)', multa: 'Multa', juros: 'Juros', obrigacao: 'Obrigação', vencimento: 'Vence em', regra: 'Regra',
  partidasFecham: 'Débitos = créditos', totalDebitos: 'Total a débito', totalCreditos: 'Total a crédito', saldoDebito: 'Saldo da conta debitada', saldoCredito: 'Saldo da conta creditada',
  quota: 'Depreciação do mês', acumulada: 'Depreciação acumulada', liquido: 'Valor contábil líquido', receitas: 'Receitas', despesas: 'Despesas', resultado: 'Resultado do mês',
  situacaoEcd: 'ECD', motivo: 'Motivo', prazo: 'Prazo de entrega',
};

export const SimuladorEscola: React.FC<{ pratica: PraticaSim; falar: (t: string) => void; onFechar: () => void; onProvaEntregue?: () => void }> = ({ pratica, falar, onFechar, onProvaEntregue }) => {
  const [fase, setFase] = useState<Fase>('inicio');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [destaque, setDestaque] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [indice, setIndice] = useState(0);
  const [calc, setCalc] = useState<Record<string, unknown> | null>(null);
  const [erroCalc, setErroCalc] = useState('');
  const [prova, setProva] = useState<{ cenarioId: string; enunciado: string; inicio: number } | null>(null);
  const [resultadoProva, setResultadoProva] = useState<{ r: ResultadoProva; nivelGeral: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const acoes = useRef<AcaoAluno[]>([]);
  const cancelado = useRef(false);
  // "Para" durante a demonstração falada: pausa na hora; "continua" segue do mesmo campo.
  const demoRodando = useRef(false);
  const demoPausada = useRef(false);
  const livre = async () => { while (demoPausada.current && !cancelado.current) await espera(150); };
  const esperaDemo = async (ms: number) => { const fim = Date.now() + ms; while (Date.now() < fim && !cancelado.current) { await livre(); await espera(Math.min(150, Math.max(0, fim - Date.now()))); } };
  useEffect(() => registrarParador({
    id: 'escola-demonstracao',
    ativo: () => demoRodando.current && !demoPausada.current && !cancelado.current,
    parar: () => { if (!demoRodando.current || demoPausada.current || cancelado.current) return false; demoPausada.current = true; return { retomavel: true }; },
    continuar: () => { demoPausada.current = false; },
  }), []);
  const ultimoValor = useRef<Record<string, string>>({});

  useEffect(() => () => { cancelado.current = true; }, []);
  const limpar = () => { setValores({}); ultimoValor.current = {}; setCalc(null); setErroCalc(''); setDestaque(null); setIndice(0); acoes.current = []; setResultadoProva(null); };

  const calcular = async (v: Record<string, string>) => {
    setErroCalc(''); setCalc(null);
    try {
      const r = await fetch('/api/escola/simular', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ praticaId: pratica.id, valores: v }) });
      const c = await r.json().catch(() => ({}));
      if (c.sucesso) { setCalc(c.resultado); return true; }
      setErroCalc(String(c.motivo || 'Não foi possível calcular.')); return false;
    } catch { setErroCalc('Sem conexão com o servidor.'); return false; }
  };

  // ---------------------------------------------------------------- fase 1: demonstração
  const demonstrar = async () => {
    limpar(); cancelado.current = false; demoPausada.current = false; demoRodando.current = true; setFase('demo');
    try {
    const abertura = 'Vou fazer a primeira parte. Acompanhe cada campo: eu explico o porquê.';
    setMsg({ texto: abertura, tipo: 'info' }); falar(abertura); await esperaDemo(tempoDeFala(abertura));
    const atual: Record<string, string> = {};
    for (const c of pratica.campos) {
      await livre();
      if (cancelado.current) return;
      setDestaque(c.id);
      const valor = pratica.demo.valores[c.id];
      const fala = `${c.rotulo}: ${valorParaLer(c, valor)}. ${pratica.demo.porque?.[c.id] || ''}`.trim();
      setMsg({ texto: fala, tipo: 'info' }); falar(fala);
      const mostrado = c.tipo === 'select' ? valor : valorParaLer(c, valor).replace(/^R\$ /, '');
      if (c.tipo === 'select') { atual[c.id] = mostrado; setValores({ ...atual }); }
      else for (let i = 1; i <= mostrado.length && !cancelado.current; i += 1) { await livre(); atual[c.id] = mostrado.slice(0, i); setValores({ ...atual }); await espera(70); }
      await esperaDemo(tempoDeFala(fala));
    }
    await livre();
    if (cancelado.current) return;
    setDestaque(pratica.botao.id);
    const fb = `Agora clico em "${pratica.botao.rotulo}". ${pratica.botao.porque}`;
    setMsg({ texto: fb, tipo: 'info' }); falar(fb);
    await calcular(atual); await esperaDemo(tempoDeFala(fb));
    setDestaque(null);
    if (!cancelado.current) setMsg({ texto: 'Pronto! Este é o resultado calculado pelo sistema. Quando quiser, clique em "Agora é a sua vez".', tipo: 'ok' });
    } finally { demoRodando.current = false; demoPausada.current = false; }
  };

  // ---------------------------------------------------------------- fase 2: prática guiada
  const comecarGuiada = () => {
    cancelado.current = true; limpar(); cancelado.current = false; setFase('guiada');
    const t = `Agora é a sua vez, eu vou te acompanhar. ${pratica.guiada.enunciado} Comece pelo campo "${pratica.campos[0].rotulo}".`;
    setMsg({ texto: t, tipo: 'info' }); setDestaque(pratica.campos[0].id); falar(t);
  };
  const aplicar = (av: ReturnType<typeof avaliarAcaoGuiada>) => {
    if (!av.mensagem) return;
    setMsg({ texto: av.mensagem, tipo: av.certo ? 'ok' : 'erro' }); falar(av.mensagem);
    if (!av.certo) setDestaque(av.alvoCerto);
  };
  const aoFocar = (id: string) => {
    if (fase === 'prova') { acoes.current.push({ tipo: 'foco', alvo: id, em: Date.now() }); return; }
    if (fase !== 'guiada') return;
    const av = avaliarAcaoGuiada(pratica, pratica.guiada, indice, { tipo: 'foco', alvo: id });
    if (!av.certo) aplicar(av); else setDestaque(id);
  };
  const aoConcluirCampo = (id: string, valor: string) => {
    if (ultimoValor.current[id] === valor) return; // nada mudou
    ultimoValor.current[id] = valor;
    if (fase === 'prova') { acoes.current.push({ tipo: 'preencher', alvo: id, valor, em: Date.now() }); return; }
    if (fase !== 'guiada' || !valor.trim()) return;
    const av = avaliarAcaoGuiada(pratica, pratica.guiada, indice, { tipo: 'preencher', alvo: id, valor });
    aplicar(av);
    if (av.avancar) { const prox = passosDaPratica(pratica)[indice + 1]; setIndice(indice + 1); setDestaque(prox ? prox.alvo : null); }
    else if (!av.certo) ultimoValor.current[id] = ''; // deixa conferir de novo depois de corrigir
  };
  const aoClicarBotao = async () => {
    if (fase === 'prova') { acoes.current.push({ tipo: 'clicar', alvo: pratica.botao.id, em: Date.now() }); await calcular(valores); return; }
    if (fase !== 'guiada') return;
    const av = avaliarAcaoGuiada(pratica, pratica.guiada, indice, { tipo: 'clicar', alvo: pratica.botao.id });
    aplicar(av);
    if (!av.avancar) return;
    setIndice(indice + 1); setDestaque(null);
    if (await calcular(valores)) {
      const t = 'Você conseguiu! Confira o resultado. Quando estiver pronta, clique em "Fazer a prova": aí eu não vou mais interferir.';
      window.setTimeout(() => { setMsg({ texto: t, tipo: 'ok' }); falar(t); }, 2500);
    }
  };

  // ---------------------------------------------------------------- fase 3: prova
  const comecarProva = async () => {
    cancelado.current = true; limpar(); setOcupado(true);
    try {
      const r = await fetch(`/api/escola/prova/${encodeURIComponent(pratica.id)}`, { credentials: 'same-origin' });
      const c = await r.json().catch(() => ({}));
      if (!c.sucesso) { setMsg({ texto: String(c.motivo || 'Não foi possível abrir a prova.'), tipo: 'erro' }); return; }
      setProva({ cenarioId: c.cenario.id, enunciado: c.cenario.enunciado, inicio: Date.now() });
      setFase('prova');
      const t = 'Agora vou te passar uma prova. Não vou mais interferir. Quando terminar, clique em "Entregar prova".';
      setMsg({ texto: t, tipo: 'info' }); falar(t);
    } catch { setMsg({ texto: 'Sem conexão com o servidor.', tipo: 'erro' }); } finally { setOcupado(false); }
  };
  const entregar = async () => {
    if (!prova) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/escola/prova', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ praticaId: pratica.id, cenarioId: prova.cenarioId, acoes: acoes.current.map(({ tipo, alvo, valor }) => ({ tipo, alvo, valor })), valores, duracaoMs: Date.now() - prova.inicio }) });
      const c = await r.json().catch(() => ({}));
      if (!c.sucesso) { setMsg({ texto: String(c.motivo || 'Não foi possível entregar.'), tipo: 'erro' }); return; }
      setResultadoProva({ r: c.resultado, nivelGeral: c.nivelGeral }); setFase('fim'); setDestaque(null);
      const t = `Prova entregue. Sua nota foi ${String(c.resultado.nota).replace('.', ',')}. Nível: ${c.resultado.nivel}.`;
      setMsg({ texto: t, tipo: c.resultado.nota >= 8 ? 'ok' : 'info' }); falar(t);
      onProvaEntregue?.();
    } catch { setMsg({ texto: 'Sem conexão com o servidor.', tipo: 'erro' }); } finally { setOcupado(false); }
  };

  const enunciado = fase === 'demo' ? pratica.demo.enunciado : fase === 'guiada' ? pratica.guiada.enunciado : fase === 'prova' || fase === 'fim' ? prova?.enunciado : null;
  const anel = (id: string) => (destaque === id ? 'ring-4 ring-amber-400 ring-offset-1' : '');
  const bloqueado = fase === 'demo' || fase === 'fim' || fase === 'inicio';
  const botaoFase = (ativo: boolean) => `rounded-full px-3 py-1.5 ${ativo ? 'bg-blue-700 text-white' : 'bg-white text-blue-800 border border-blue-200'}`;

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/40 p-3 sm:p-4" data-testid="simulador-escola">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-800">Simulador · {EMPRESA_TREINO.nome}</p>
          <h4 className="text-base font-bold text-slate-800">Prática: {pratica.titulo}</h4>
        </div>
        <button type="button" onClick={() => { cancelado.current = true; onFechar(); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Fechar prática</button>
      </div>
      <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900">{AVISO_TREINO}</p>

      <div className="mb-3 flex flex-wrap gap-1.5 text-xs font-bold">
        <button type="button" onClick={() => void demonstrar()} className={botaoFase(fase === 'demo')}>1 · Começar a demonstração</button>
        <button type="button" onClick={comecarGuiada} className={botaoFase(fase === 'guiada')}>2 · Agora é a sua vez</button>
        <button type="button" disabled={ocupado} onClick={() => void comecarProva()} className={botaoFase(fase === 'prova' || fase === 'fim')}>3 · Fazer a prova</button>
      </div>

      {enunciado && <p className="mb-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"><b>Tarefa:</b> {enunciado}</p>}
      {msg && fase !== 'prova' && (
        <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${msg.tipo === 'erro' ? 'bg-red-100 text-red-900' : msg.tipo === 'ok' ? 'bg-emerald-100 text-emerald-900' : 'bg-blue-50 text-blue-900'}`}>{msg.tipo === 'erro' ? '⚠️ ' : msg.tipo === 'ok' ? '✅ ' : '🗣️ '}{msg.texto}</p>
      )}
      {fase === 'prova' && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">Prova: sem dicas. O sistema confere os campos, a ordem dos passos e o resultado do cálculo quando você entregar.</p>}
      {fase === 'inicio' && <p className="mb-3 text-sm text-slate-700">Escolha a fase: primeiro veja a demonstração, depois faça com o meu acompanhamento e, por fim, a prova.</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pratica.campos.map((c) => (
          <label key={c.id} className="block text-xs font-semibold text-slate-700">
            {c.rotulo}{c.dica ? <span className="font-normal text-slate-500"> ({c.dica})</span> : null}
            {c.tipo === 'select' ? (
              <select id={`sim-${c.id}`} data-sim={c.id} disabled={bloqueado} value={valores[c.id] || ''}
                onFocus={() => aoFocar(c.id)}
                onChange={(e) => { const v = e.target.value; setValores((x) => ({ ...x, [c.id]: v })); aoConcluirCampo(c.id, v); }}
                className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm ${anel(c.id)}`}>
                <option value="">Escolha…</option>
                {c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : (
              <input id={`sim-${c.id}`} data-sim={c.id} disabled={bloqueado} value={valores[c.id] || ''} inputMode={['numero', 'moeda', 'percentual'].includes(c.tipo) ? 'decimal' : undefined}
                placeholder={c.tipo === 'data' ? 'dd/mm/aaaa' : c.tipo === 'competencia' ? 'mm/aaaa' : c.tipo === 'moeda' ? '0,00' : ''}
                onFocus={() => aoFocar(c.id)}
                onChange={(e) => { const v = e.target.value; setValores((x) => ({ ...x, [c.id]: v })); }}
                onBlur={(e) => aoConcluirCampo(c.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className={`mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm ${anel(c.id)}`} />
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button id={`sim-${pratica.botao.id}`} type="button" disabled={bloqueado} onClick={() => void aoClicarBotao()}
          className={`rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${anel(pratica.botao.id)}`}>{pratica.botao.rotulo}</button>
        {fase === 'prova' && <button type="button" disabled={ocupado} onClick={() => void entregar()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Entregar prova</button>}
      </div>

      {erroCalc && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{erroCalc}</p>}
      {calc && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm shadow-sm">
          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Resultado do motor de cálculo do sistema (treino)</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {Object.entries(calc).filter(([, v]) => v !== undefined && typeof v !== 'object').map(([k, v]) => (
              <React.Fragment key={k}><dt className="text-slate-600">{ROTULOS[k] || k}</dt><dd className="text-right font-semibold text-slate-900">{formatarResultado(v)}</dd></React.Fragment>
            ))}
          </dl>
        </div>
      )}

      {fase === 'fim' && resultadoProva && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm shadow-sm" data-testid="resultado-prova">
          <p className="text-lg font-extrabold text-slate-900">Nota {String(resultadoProva.r.nota).replace('.', ',')} · {resultadoProva.r.nivel}</p>
          <p className="text-xs text-slate-600">Seu nível geral na Escola: <b>{resultadoProva.nivelGeral}</b>. A nota foi enviada ao administrador do escritório.</p>
          {resultadoProva.r.erros.length > 0 && (<><p className="mt-2 font-bold text-red-800">O que errou</p><ul className="list-disc pl-5 text-red-900">{resultadoProva.r.erros.map((e) => <li key={e}>{e}</li>)}</ul></>)}
          {resultadoProva.r.acertos.length > 0 && (<><p className="mt-2 font-bold text-emerald-800">O que acertou</p><ul className="list-disc pl-5 text-emerald-900">{resultadoProva.r.acertos.map((e) => <li key={e}>{e}</li>)}</ul></>)}
          <button type="button" onClick={() => void comecarProva()} className="mt-3 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-bold text-blue-800">Fazer outra prova</button>
        </div>
      )}
    </div>
  );
};
