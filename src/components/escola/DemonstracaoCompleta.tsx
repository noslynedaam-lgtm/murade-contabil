// ESCOLA MURADE — "▶ Demonstração completa com a IA" (igual no Fiscal e no Contábil; nasceu no Murade DP).
// A Agente faz o serviço do mês na TELA DE TREINO (réplica fiel das telas reais: mesmos menus, campos e botões), com cursor
// animado, destaque pulsando, campo digitado letra a letra, troca de tela animada e confete ao terminar cada etapa.
// Depois: "Agora é a sua vez!" (prática guiada que já existe + achar o botão certo) e a prova (a que já existe).
//
// SEGURANÇA: o único pedido ao servidor que a demonstração faz é o cálculo de TREINO (/api/escola/simular, que só calcula) e o
// registro de que a pessoa assistiu (/api/escola/demonstracao, tabela da Escola). Botões de salvar/emitir/transmitir/gerar da
// réplica NUNCA executam nada: a seta mostra e a Agente diz "aqui você clicaria".
// PARAR: botão Parar, tecla Esc e os eventos EVENTO_DEMO_COMANDO / EVENTO_AGENTE_PARAR / EVENTO_AGENTE_PAROU (controlador PARAR da Agente) (ponto para o comando de voz da Agente).
// O que muda de um sistema para o outro (voz) fica em ./escolaAdaptador; o roteiro, em src/data/escolaDemonstracao.ts.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ETAPAS_DEMO, EVENTO_AGENTE_PARAR, EVENTO_AGENTE_PAROU, EVENTO_DEMO_COMANDO, NOME_SISTEMA_DEMO, TITULO_DEMO, VELOCIDADES, avaliarCliqueSuaVez, botoesSuaVez, etapaDemoPorId, etapaDoCalculo, etapasSuaVez,
  passosDaEtapa, tempoDeFalaDemo, transicaoDemo, valoresParaMotor, type CampoDemo, type ComandoDemo, type EstadoDemo, type EtapaDemo, type VelocidadeDemo,
} from '../../data/escolaDemonstracao';
import { AVISO_TREINO, EMPRESA_TREINO, formatarResultado, praticaPorId, valorParaLer } from '../../data/escolaPratica';
import { useVozDaEscola } from './escolaAdaptador';
import { SimuladorEscola } from './SimuladorEscola';

type Modo = 'intro' | 'demo' | 'fim_demo' | 'sua_vez' | 'prova';
type TipoDestaque = 'campo' | 'sim' | 'nao' | 'clique' | 'menu';
interface Destaque { alvo: string; tipo: TipoDestaque }
class Interrompido extends Error {}

const espera = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
/** Como o valor aparece digitado na tela (data dd/mm/aaaa, dinheiro 1.800,00, opção pelo rótulo). */
export function valorNaTela(c: CampoDemo): string {
  if (c.tipo === 'select') return c.opcoes?.find((o) => o.valor === c.valor)?.rotulo || c.valor;
  return valorParaLer({ id: c.id, rotulo: c.rotulo, tipo: c.tipo }, c.valor).replace(/^R\$ /, '');
}
const formatar = (_chave: string, v: unknown): string => formatarResultado(v);
const menusDoTour = [...new Set(ETAPAS_DEMO.map((e) => e.menu))];

const CSS = `
@keyframes escdemo-entra { from { opacity: 0; transform: translateX(28px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes escdemo-pulso-sim { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,.7); } 50% { box-shadow: 0 0 0 9px rgba(16,185,129,0); } }
@keyframes escdemo-pulso-nao { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.7); } 50% { box-shadow: 0 0 0 9px rgba(220,38,38,0); } }
@keyframes escdemo-pulso-campo { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.75); } 50% { box-shadow: 0 0 0 7px rgba(245,158,11,0); } }
@keyframes escdemo-clique { from { transform: translate(-50%,-50%) scale(.3); opacity: .85; } to { transform: translate(-50%,-50%) scale(2.4); opacity: 0; } }
@keyframes escdemo-caret { 50% { opacity: 0; } }
@keyframes escdemo-confete { 0% { transform: translateY(-12px) rotate(0); opacity: 1; } 100% { transform: translateY(220px) rotate(600deg); opacity: 0; } }
.escdemo-entra { animation: escdemo-entra .45s ease-out both; }
.escdemo-sim { animation: escdemo-pulso-sim 1.1s ease-in-out infinite; outline: 3px solid #10b981; outline-offset: 2px; }
.escdemo-nao { animation: escdemo-pulso-nao 1.1s ease-in-out infinite; outline: 3px solid #dc2626; outline-offset: 2px; }
.escdemo-campo { animation: escdemo-pulso-campo 1.1s ease-in-out infinite; outline: 3px solid #f59e0b; outline-offset: 1px; transform: scale(1.03); }
.escdemo-caret { display: inline-block; width: 2px; height: 1em; margin-left: 1px; background: #1d4ed8; vertical-align: -2px; animation: escdemo-caret .8s step-end infinite; }
.escdemo-cursor { transition: transform .65s cubic-bezier(.22,.9,.3,1); }
.escdemo-onda { position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(37,99,235,.45); animation: escdemo-clique .5s ease-out forwards; pointer-events: none; }
.escdemo-confete { position: absolute; top: 0; width: 8px; height: 12px; border-radius: 2px; animation: escdemo-confete 1.4s ease-in forwards; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .escdemo-entra, .escdemo-sim, .escdemo-nao, .escdemo-campo, .escdemo-caret, .escdemo-confete, .escdemo-onda { animation: none !important; } .escdemo-cursor { transition: none !important; } }
`;
const CORES_CONFETE = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

// ---------------------------------------------------------------- a "tela" de treino (réplica)
const TelaReplica: React.FC<{
  etapa: EtapaDemo; valores: Record<string, string>; aberto: boolean; digitando: string | null; destaque: Destaque | null; resultado: Record<string, unknown> | null;
  interativo?: boolean; onBotao?: (rotulo: string) => void;
}> = ({ etapa, valores, aberto, digitando, destaque, resultado, interativo, onBotao }) => {
  const classe = (alvo: string) => (destaque?.alvo === alvo ? (destaque.tipo === 'sim' ? 'escdemo-sim' : destaque.tipo === 'nao' ? 'escdemo-nao' : destaque.tipo === 'campo' ? 'escdemo-campo' : 'escdemo-sim') : '');
  const etiqueta = (alvo: string) => (destaque?.alvo === alvo && (destaque.tipo === 'sim' || destaque.tipo === 'nao')
    ? <span className={`absolute -top-3 right-1 z-10 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow ${destaque.tipo === 'sim' ? 'bg-emerald-600' : 'bg-red-600'}`}>{destaque.tipo === 'sim' ? '✔ aqui SIM você clica' : '✖ aqui NÃO'}</span> : null);
  const botoes = interativo ? botoesSuaVez(etapa) : [...etapa.nao.map((b) => b.rotulo), ...etapa.sim.map((b) => b.rotulo)];
  const corBotao = (r: string) => (etapa.sim.some((b) => b.rotulo === r) ? 'bg-blue-700 text-white' : etapa.nao.some((b) => b.rotulo === r) ? 'bg-white text-slate-700 border border-slate-300' : 'bg-slate-700 text-white');
  return (
    <div key={etapa.id} className="escdemo-entra">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-extrabold text-slate-900 sm:text-lg">{etapa.titulo}</h4>
        {etapa.abrir && (
          <span className="relative">
            {etiqueta(etapa.abrir.rotulo)}
            <button type="button" tabIndex={-1} aria-disabled="true" data-demo-botao={etapa.abrir.rotulo} className={`rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white ${classe(etapa.abrir.rotulo)}`}>{etapa.abrir.rotulo}</button>
          </span>
        )}
      </div>
      {!aberto ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-6 text-center text-sm text-slate-500">Clique em "{etapa.abrir?.rotulo}" para abrir.</p>
      ) : (
        <>
          {etapa.campos.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {etapa.campos.map((c) => (
                <div key={c.id} className="block text-[11px] font-semibold text-slate-700">
                  {c.rotulo}{c.fixo ? <span className="font-normal text-slate-500"> (já vem preenchido)</span> : null}
                  <div data-demo-campo={c.id} className={`mt-1 min-h-[34px] w-full rounded-lg border px-2 py-1.5 text-sm transition-transform ${c.fixo ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-slate-300 bg-white text-slate-900'} ${classe(c.id)}`}>
                    {valores[c.id] || <span className="text-slate-400">{c.tipo === 'data' ? 'dd/mm/aaaa' : c.tipo === 'competencia' ? 'mm/aaaa' : c.tipo === 'select' ? 'Escolha…' : ''}</span>}
                    {digitando === c.id && <span className="escdemo-caret" />}
                  </div>
                </div>
              ))}
            </div>
          )}
          {resultado && (
            <div className="escdemo-entra mt-3 rounded-lg bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200" data-demo-resultado="1">
              <p className="mb-1 text-[11px] font-bold uppercase text-emerald-800">{etapa.resultado.origem === 'propria' ? 'Calculado pelo motor do sistema (treino)' : 'Do cálculo que o sistema fez antes (treino)'}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {etapa.resultado.itens.filter((i) => resultado[i.chave] !== undefined).map((i) => (
                  <React.Fragment key={i.chave}><dt className="text-slate-700">{i.rotulo}</dt><dd className="text-right font-bold text-slate-900">{formatar(i.chave, resultado[i.chave])}</dd></React.Fragment>
                ))}
              </dl>
            </div>
          )}
          {botoes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {botoes.map((r) => (
                <span key={r} className="relative">
                  {etiqueta(r)}
                  <button type="button" data-demo-botao={r} tabIndex={interativo ? 0 : -1} aria-disabled={interativo ? undefined : 'true'}
                    onClick={interativo ? () => onBotao?.(r) : undefined}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${corBotao(r)} ${classe(r)} ${interativo ? 'hover:brightness-110' : 'cursor-default'}`}>{r}</button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- componente principal
export const DemonstracaoCompleta: React.FC<{ onFechar: () => void; onMudou?: () => void }> = ({ onFechar, onMudou }) => {
  const voz = useVozDaEscola();
  const [modo, setModo] = useState<Modo>('intro');
  const [estado, setEstadoTela] = useState<EstadoDemo>('pronto');
  const [velocidade, setVelocidadeTela] = useState<VelocidadeDemo>('normal');
  const [etapaIdx, setEtapaIdx] = useState(0);
  const [telaId, setTelaId] = useState<string | null>(null);
  const [aberto, setAberto] = useState(true);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [digitando, setDigitando] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<Destaque | null>(null);
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null);
  const [legenda, setLegenda] = useState<{ texto: string; tipo: 'info' | 'sim' | 'nao' | 'ok' }>({ texto: '', tipo: 'info' });
  const [feitas, setFeitas] = useState<string[]>([]);
  const [puladas, setPuladas] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number; visivel: boolean }>({ x: 24, y: 24, visivel: false });
  const [ondas, setOndas] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [confete, setConfete] = useState(0);
  // "sua vez" e prova
  const [vezIdx, setVezIdx] = useState(0);
  const [vezFeita, setVezFeita] = useState(false);
  const [vezMsg, setVezMsg] = useState<{ texto: string; certo: boolean } | null>(null);
  const [provaDe, setProvaDe] = useState<string | null>(null);

  const estadoRef = useRef<EstadoDemo>('pronto');
  const velocidadeRef = useRef<VelocidadeDemo>('normal');
  const geracao = useRef(0);
  const pular = useRef(false);
  const calculos = useRef<Record<string, Record<string, unknown>>>({});
  const frameRef = useRef<HTMLDivElement | null>(null);
  const feitasRef = useRef<string[]>([]);
  const ondaId = useRef(0);

  const mudarEstado = (ev: Parameters<typeof transicaoDemo>[1]) => { estadoRef.current = transicaoDemo(estadoRef.current, ev); setEstadoTela(estadoRef.current); };
  const setVelocidade = (v: VelocidadeDemo) => { velocidadeRef.current = v; setVelocidadeTela(v); };
  const calar = () => voz.parar();
  const falar = (t: string) => { if (t) voz.falar(t); };
  const registrar = (evento: 'etapa' | 'completa' | 'sua_vez', etapa?: string) => {
    void fetch('/api/escola/demonstracao', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evento, etapa }) })
      .then(() => onMudou?.()).catch(() => undefined);
  };

  // ------------------------------------------------ portão de pausa / parar / pular
  const checar = async (ger: number) => {
    while (estadoRef.current === 'pausado' && ger === geracao.current && !pular.current) await espera(150);
    if (ger !== geracao.current || estadoRef.current === 'parado') throw new Interrompido('parado');
    if (pular.current) throw new Interrompido('pular');
  };
  const dormir = async (ms: number, ger: number) => { const fim = Date.now() + ms; while (Date.now() < fim) { await checar(ger); await espera(Math.min(120, Math.max(0, fim - Date.now()))); } await checar(ger); };
  const esperarFala = async (texto: string, ger: number) => {
    await dormir(tempoDeFalaDemo(texto, velocidadeRef.current), ger);
    for (let i = 0; i < 80 && voz.falando(); i += 1) await dormir(150, ger);
  };
  const dizer = async (texto: string, tipo: 'info' | 'sim' | 'nao' | 'ok', ger: number) => {
    if (!texto) return;
    setLegenda({ texto, tipo }); falar(texto); await esperarFala(texto, ger);
  };

  // ------------------------------------------------ cursor e rolagem (celular: rola até o campo)
  const moverCursor = async (seletor: string, clicar: boolean, ger: number) => {
    const frame = frameRef.current; if (!frame) return;
    const el = frame.querySelector<HTMLElement>(seletor); if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch { /* ok */ }
    await dormir(260, ger);
    const fr = frame.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const x = r.left - fr.left + Math.min(r.width * 0.7, r.width - 8); const y = r.top - fr.top + r.height * 0.6;
    setCursor({ x, y, visivel: true });
    await dormir(Math.round(700 * VELOCIDADES[velocidadeRef.current].fatorFala), ger);
    if (clicar) { const id = ++ondaId.current; setOndas((o) => [...o, { id, x, y }]); window.setTimeout(() => setOndas((o) => o.filter((w) => w.id !== id)), 600); await dormir(280, ger); }
  };

  const calcular = async (e: EtapaDemo): Promise<Record<string, unknown> | null> => {
    const origem = etapaDoCalculo(e);
    if (!origem || !origem.praticaId) return null;
    if (calculos.current[origem.id]) return calculos.current[origem.id];
    const v = valoresParaMotor(origem); if (!v) return null;
    try {
      const r = await fetch('/api/escola/simular', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ praticaId: origem.praticaId, valores: v }) });
      const c = await r.json().catch(() => ({}));
      if (!c.sucesso) { setLegenda({ texto: String(c.motivo || 'Não foi possível calcular.'), tipo: 'nao' }); return null; }
      calculos.current[origem.id] = c.resultado;
      return c.resultado;
    } catch { setLegenda({ texto: 'Sem conexão com o servidor para calcular.', tipo: 'nao' }); return null; }
  };

  // ------------------------------------------------ uma etapa
  const rodarEtapa = async (e: EtapaDemo, ger: number) => {
    const vel = () => VELOCIDADES[velocidadeRef.current];
    const atual: Record<string, string> = {};
    for (const p of passosDaEtapa(e)) {
      await checar(ger);
      switch (p.tipo) {
        case 'falar': await dizer(p.texto, 'info', ger); break;
        case 'menu': {
          setDestaque({ alvo: `menu:${e.menu}`, tipo: 'menu' });
          await moverCursor(`[data-demo-menu="${e.menu}"]`, true, ger);
          setTelaId(e.id); setAberto(!e.abrir); setValores({}); setResultado(null); setDestaque(null);
          setLegenda({ texto: p.texto, tipo: 'info' });
          await dormir(vel().passoMs + 300, ger);
          break;
        }
        case 'abrir': {
          setDestaque({ alvo: p.alvo, tipo: 'sim' });
          await moverCursor(`[data-demo-botao="${p.alvo}"]`, true, ger);
          setAberto(true); setDestaque(null);
          await dizer(p.texto, 'info', ger);
          break;
        }
        case 'preencher': {
          const c = e.campos.find((x) => x.id === p.alvo)!;
          setDestaque({ alvo: c.id, tipo: 'campo' });
          await moverCursor(`[data-demo-campo="${c.id}"]`, !c.fixo, ger);
          const texto = valorNaTela(c);
          if (p.texto) { setLegenda({ texto: `${c.rotulo}: ${texto}. ${p.texto}`, tipo: 'info' }); falar(`${c.rotulo}: ${valorParaLer({ id: c.id, rotulo: c.rotulo, tipo: c.tipo, opcoes: c.opcoes }, c.valor)}. ${p.texto}`); }
          else setLegenda({ texto: `${c.rotulo}: ${texto}`, tipo: 'info' });
          if (c.fixo || c.tipo === 'select') { atual[c.id] = texto; setValores({ ...atual }); await dormir(vel().passoMs, ger); }
          else {
            setDigitando(c.id);
            for (let i = 1; i <= texto.length; i += 1) { await checar(ger); atual[c.id] = texto.slice(0, i); setValores({ ...atual }); await espera(vel().letraMs); }
            setDigitando(null);
          }
          if (p.texto) await esperarFala(p.texto, ger); else await dormir(vel().passoMs, ger);
          setDestaque(null);
          break;
        }
        case 'resultado': {
          setLegenda({ texto: 'Calculando no motor do sistema…', tipo: 'info' });
          const r = await calcular(e);
          await checar(ger);
          if (r) { setResultado(r); await dormir(300, ger); await moverCursor('[data-demo-resultado="1"]', false, ger); await dizer(p.texto, 'ok', ger); }
          break;
        }
        case 'mostrar_nao': {
          setDestaque({ alvo: p.alvo, tipo: 'nao' });
          await moverCursor(`[data-demo-botao="${p.alvo}"]`, false, ger);
          await dizer(p.texto, 'nao', ger);
          setDestaque(null);
          break;
        }
        case 'mostrar_sim': {
          // NUNCA clica: só aponta. "Aqui você clicaria."
          setDestaque({ alvo: p.alvo, tipo: 'sim' });
          await moverCursor(`[data-demo-botao="${p.alvo}"]`, false, ger);
          await dizer(p.texto, 'sim', ger);
          setDestaque(null);
          break;
        }
        case 'concluir': {
          setConfete((n) => n + 1);
          await dizer(p.texto, 'ok', ger);
          break;
        }
        default: break;
      }
    }
  };

  // ------------------------------------------------ a demonstração inteira
  const rodar = async (inicio: number) => {
    const ger = ++geracao.current;
    pular.current = false;
    estadoRef.current = 'pronto'; mudarEstado('iniciar');
    setModo('demo');
    if (inicio === 0) {
      feitasRef.current = []; setFeitas([]); setPuladas([]); calculos.current = {};
      try { await dizer(`Vou fazer tudo na ${EMPRESA_TREINO.nome.split(' (')[0]}, tela por tela. Acompanhe: eu mostro onde clicar e onde não clicar. Nada é gravado.`, 'info', ger); }
      catch (e) { if (!(e instanceof Interrompido) || ger !== geracao.current || estadoRef.current === 'parado') return; pular.current = false; }
    }
    for (let i = inicio; i < ETAPAS_DEMO.length; i += 1) {
      const e = ETAPAS_DEMO[i];
      setEtapaIdx(i);
      try {
        await rodarEtapa(e, ger);
        feitasRef.current = [...new Set([...feitasRef.current, e.id])]; setFeitas(feitasRef.current);
        registrar('etapa', e.id);
      } catch (err) {
        if (!(err instanceof Interrompido)) { setLegenda({ texto: (err as Error).message || 'Algo deu errado na demonstração.', tipo: 'nao' }); }
        if (ger !== geracao.current || estadoRef.current === 'parado') return;
        if (pular.current) { pular.current = false; calar(); setDigitando(null); setDestaque(null); setPuladas((x) => [...new Set([...x, e.id])]); if (estadoRef.current === 'pausado') mudarEstado('continuar'); continue; }
        return;
      }
    }
    if (ger !== geracao.current) return;
    mudarEstado('concluir'); setDestaque(null); setCursor((c) => ({ ...c, visivel: false })); setConfete((n) => n + 1);
    if (ETAPAS_DEMO.every((e) => feitasRef.current.includes(e.id))) registrar('completa');
    setModo('fim_demo');
    const t = 'Pronto, fiz tudo! Agora é a sua vez de fazer. Eu vou acompanhar cada clique.';
    setLegenda({ texto: t, tipo: 'ok' }); falar(t);
  };

  const parar = useCallback(() => {
    geracao.current += 1; pular.current = false; mudarEstado('parar'); calar();
    setDigitando(null); setDestaque(null); setCursor((c) => ({ ...c, visivel: false }));
    setLegenda({ texto: 'Parei. Nada foi salvo nem enviado.', tipo: 'info' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pausar = () => { if (estadoRef.current === 'rodando') { mudarEstado('pausar'); calar(); setLegenda((l) => ({ ...l, texto: `⏸ Pausado. ${l.texto}` })); } };
  const continuar = () => { if (estadoRef.current === 'pausado') { mudarEstado('continuar'); setLegenda((l) => ({ ...l, texto: l.texto.replace(/^⏸ Pausado\. /, '') })); } };
  const pularEtapa = () => { if (estadoRef.current === 'rodando' || estadoRef.current === 'pausado') { pular.current = true; calar(); } };

  // Esc, botão PARAR e comando de voz (eventos) — enquanto a demonstração estiver aberta.
  useEffect(() => {
    const comando = (c: ComandoDemo) => { if (c === 'parar') parar(); else if (c === 'pausar') pausar(); else if (c === 'continuar') continuar(); else if (c === 'pular') pularEtapa(); };
    const aoTeclar = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && (estadoRef.current === 'rodando' || estadoRef.current === 'pausado')) { ev.preventDefault(); parar(); } };
    const aoComando = (ev: Event) => { const a = (ev as CustomEvent).detail?.acao; if (a === 'parar' || a === 'pausar' || a === 'continuar' || a === 'pular') comando(a); };
    const aoPararAgente = () => { if (estadoRef.current === 'rodando' || estadoRef.current === 'pausado') parar(); };
    window.addEventListener('keydown', aoTeclar);
    window.addEventListener(EVENTO_DEMO_COMANDO, aoComando);
    window.addEventListener(EVENTO_AGENTE_PARAR, aoPararAgente);
    window.addEventListener(EVENTO_AGENTE_PAROU, aoPararAgente);
    return () => { window.removeEventListener('keydown', aoTeclar); window.removeEventListener(EVENTO_DEMO_COMANDO, aoComando); window.removeEventListener(EVENTO_AGENTE_PARAR, aoPararAgente); window.removeEventListener(EVENTO_AGENTE_PAROU, aoPararAgente); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { geracao.current += 1; voz.parar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ "Agora é a sua vez"
  const listaVez = etapasSuaVez();
  const comecarSuaVez = (i = 0) => {
    geracao.current += 1; calar(); setModo('sua_vez'); setVezIdx(i); setVezFeita(false); setVezMsg(null);
    const item = listaVez[i];
    setTelaId(item.etapa.id); setAberto(true); setResultado(null); setDestaque(null); setDigitando(null); setCursor((c) => ({ ...c, visivel: false }));
    setValores(Object.fromEntries(item.etapa.campos.map((c) => [c.id, valorNaTela(c)])));
    if (item.modo === 'botao') { const t = item.etapa.suaVez!.pergunta; setLegenda({ texto: t, tipo: 'info' }); falar(t); }
    else setLegenda({ texto: `Sua vez: ${item.etapa.titulo}. Faça campo por campo; eu aviso na hora se errar.`, tipo: 'info' });
  };
  const vezConcluida = (id: string) => { setVezFeita(true); registrar('sua_vez', id); setConfete((n) => n + 1); };
  const cliqueSuaVez = (rotulo: string) => {
    const item = listaVez[vezIdx]; const av = avaliarCliqueSuaVez(item.etapa, rotulo);
    setVezMsg({ texto: av.mensagem, certo: av.certo }); falar(av.mensagem);
    setDestaque({ alvo: rotulo, tipo: av.certo ? 'sim' : 'nao' });
    if (av.certo) vezConcluida(item.etapa.id);
  };
  const proximaVez = () => {
    if (vezIdx + 1 < listaVez.length) comecarSuaVez(vezIdx + 1);
    else { setModo('prova'); const t = 'Você fez todas as etapas! Agora a prova: escolha uma e clique em "Fazer a prova". Aí eu não vou mais interferir.'; setLegenda({ texto: t, tipo: 'ok' }); falar(t); }
  };

  // ------------------------------------------------ desenho
  const etapaTela = telaId ? etapaDemoPorId(telaId) : null;
  const rodando = estado === 'rodando' || estado === 'pausado';
  const corLegenda = legenda.tipo === 'nao' ? 'bg-red-100 text-red-900' : legenda.tipo === 'sim' ? 'bg-emerald-100 text-emerald-900' : legenda.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-blue-50 text-blue-900';

  const progresso = (
    <div className="mb-2">
      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(feitas.length / ETAPAS_DEMO.length) * 100}%` }} /></div>
      <ol className="flex gap-1 overflow-x-auto pb-1 text-[11px] font-bold" aria-label="Etapas da demonstração">
        {ETAPAS_DEMO.map((e, i) => {
          const atual = modo === 'demo' && i === etapaIdx;
          const ok = feitas.includes(e.id); const pulou = puladas.includes(e.id);
          return <li key={e.id} className={`whitespace-nowrap rounded-full px-2 py-1 ${atual ? 'bg-blue-700 text-white escdemo-campo' : ok ? 'bg-emerald-100 text-emerald-900' : pulou ? 'bg-slate-200 text-slate-500 line-through' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{ok ? '✓ ' : `${i + 1}. `}{e.titulo}</li>;
        })}
      </ol>
    </div>
  );

  return (
    <div className="rounded-xl border-2 border-blue-300 bg-gradient-to-b from-blue-50 to-white p-3 shadow-sm sm:p-4" data-testid="demonstracao-completa">
      <style>{CSS}</style>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-blue-800">{TITULO_DEMO} · {EMPRESA_TREINO.nome}</p>
          <h3 className="text-lg font-extrabold text-slate-900">{modo === 'sua_vez' ? 'Agora é a sua vez!' : modo === 'prova' ? 'A prova' : 'A Agente faz, você assiste'}</h3>
        </div>
        <button type="button" onClick={() => { parar(); onFechar(); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Fechar demonstração</button>
      </div>
      <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900">{AVISO_TREINO} A demonstração nunca clica em Salvar, Gravar, Emitir, Transmitir ou Gerar: ela mostra onde você clicaria.</p>

      {progresso}

      {/* Controles */}
      {(modo === 'demo' || modo === 'intro') && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {modo === 'intro' || estado === 'parado' || estado === 'concluido' ? (
            <>
              <button type="button" onClick={() => void rodar(0)} className="rounded-full bg-blue-700 px-4 py-2 text-white shadow">▶ {estado === 'parado' ? 'Começar de novo' : 'Começar a demonstração'}</button>
              {estado === 'parado' && etapaIdx > 0 && <button type="button" onClick={() => void rodar(etapaIdx)} className="rounded-full border border-blue-300 bg-white px-3 py-2 text-blue-800">Continuar de "{ETAPAS_DEMO[etapaIdx].titulo}"</button>}
              <button type="button" onClick={() => comecarSuaVez(0)} className="rounded-full border border-emerald-300 bg-white px-3 py-2 text-emerald-800">Ir direto para a minha vez</button>
            </>
          ) : (
            <>
              {estado === 'pausado'
                ? <button type="button" onClick={continuar} className="rounded-full bg-blue-700 px-3 py-2 text-white">▶ Continuar</button>
                : <button type="button" onClick={pausar} className="rounded-full bg-white px-3 py-2 text-blue-800 ring-1 ring-blue-300">⏸ Pausar</button>}
              <button type="button" onClick={pularEtapa} className="rounded-full bg-white px-3 py-2 text-slate-700 ring-1 ring-slate-300">⏭ Pular etapa</button>
              <button type="button" onClick={parar} className="rounded-full bg-red-600 px-3 py-2 text-white" title="Parar (tecla Esc)">■ Parar</button>
            </>
          )}
          <label className="ml-auto flex items-center gap-1 font-semibold text-slate-700">Velocidade
            <select aria-label="Velocidade da demonstração" value={velocidade} onChange={(e) => setVelocidade(e.target.value as VelocidadeDemo)} className="rounded-lg border border-slate-300 bg-white px-2 py-1">
              {(Object.keys(VELOCIDADES) as VelocidadeDemo[]).map((v) => <option key={v} value={v}>{VELOCIDADES[v].rotulo}</option>)}
            </select>
          </label>
        </div>
      )}

      {legenda.texto && modo !== 'prova' && <p role="status" aria-live="polite" className={`mb-2 rounded-lg px-3 py-2 text-sm font-medium ${corLegenda}`}>{legenda.tipo === 'nao' ? '✖ ' : legenda.tipo === 'sim' ? '✔ ' : '🗣️ '}{legenda.texto}</p>}

      {modo === 'intro' && (
        <div className="rounded-lg bg-white p-3 text-sm text-slate-800 shadow-sm">
          <p>A Agente vai fazer, na empresa de treino, o serviço do mês no {NOME_SISTEMA_DEMO} — tela por tela, campo por campo — e mostrar <b className="text-emerald-700">onde SIM clicar</b> e <b className="text-red-700">onde NÃO clicar</b>. Depois é a sua vez, com ela acompanhando, e no fim a prova.</p>
          <p className="mt-1 text-xs text-slate-600">Você pode pausar, pular etapa ou parar a qualquer momento (tecla Esc também para).</p>
        </div>
      )}

      {/* A tela de treino (réplica do sistema) */}
      {(modo === 'demo' || modo === 'fim_demo' || (modo === 'sua_vez' && listaVez[vezIdx]?.modo === 'botao')) && (
        <div ref={frameRef} className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-inner" data-testid="tela-treino">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200">
            <span className="h-2 w-2 rounded-full bg-red-400" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="truncate font-semibold">{NOME_SISTEMA_DEMO} · {EMPRESA_TREINO.nome}{etapaTela ? ` › ${etapaTela.menu}` : ''}</span>
          </div>
          <div className="flex flex-col sm:flex-row">
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-1.5 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r" aria-label="Menu (treino)">
              {menusDoTour.map((m) => (
                <span key={m} data-demo-menu={m} className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold ${etapaTela?.menu === m ? 'bg-blue-700 text-white' : 'text-slate-700'} ${destaque?.alvo === `menu:${m}` ? 'escdemo-sim' : ''}`}>{m}</span>
              ))}
            </nav>
            <div className="min-h-[260px] flex-1 p-3">
              {etapaTela
                ? <TelaReplica etapa={etapaTela} valores={valores} aberto={aberto} digitando={digitando} destaque={destaque} resultado={resultado} interativo={modo === 'sua_vez'} onBotao={cliqueSuaVez} />
                : <p className="py-10 text-center text-sm text-slate-500">Início (treino)</p>}
            </div>
          </div>
          {/* cursor animado */}
          <div aria-hidden="true" className="escdemo-cursor pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)`, opacity: cursor.visivel ? 1 : 0 }}>
            <svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11 3 2z" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </div>
          {ondas.map((o) => <span key={o.id} className="escdemo-onda z-10" style={{ left: o.x, top: o.y }} />)}
          {confete > 0 && <div key={confete} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0">{Array.from({ length: 18 }, (_, i) => <span key={i} className="escdemo-confete" style={{ left: `${(i * 53) % 100}%`, background: CORES_CONFETE[i % CORES_CONFETE.length], animationDelay: `${(i % 6) * 70}ms` }} />)}</div>}
        </div>
      )}

      {modo === 'fim_demo' && (
        <div className="escdemo-entra mt-3 rounded-xl bg-emerald-600 p-4 text-center text-white shadow">
          <p className="text-xl font-extrabold">🎉 Agora é a sua vez!</p>
          <p className="text-sm">Você faz as mesmas etapas, na mesma ordem, e a Agente acompanha cada clique.</p>
          <button type="button" onClick={() => comecarSuaVez(0)} className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-extrabold text-emerald-800">Começar a minha vez</button>
        </div>
      )}

      {modo === 'sua_vez' && listaVez[vezIdx] && (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-bold text-slate-700">Etapa {vezIdx + 1} de {listaVez.length}: {listaVez[vezIdx].etapa.titulo}</p>
          {listaVez[vezIdx].modo === 'pratica' && praticaPorId(listaVez[vezIdx].etapa.praticaId!) && (
            <SimuladorEscola key={listaVez[vezIdx].etapa.id} pratica={praticaPorId(listaVez[vezIdx].etapa.praticaId!)!} falar={falar} faseInicial="guiada"
              onGuiadaConcluida={() => vezConcluida(listaVez[vezIdx].etapa.id)} onFechar={() => setModo('fim_demo')} />
          )}
          {listaVez[vezIdx].modo === 'botao' && vezMsg && <p role="status" className={`rounded-lg px-3 py-2 text-sm font-semibold ${vezMsg.certo ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{vezMsg.certo ? '✅ ' : '⚠️ '}{vezMsg.texto}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!vezFeita} onClick={proximaVez} className="rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{vezIdx + 1 < listaVez.length ? 'Próxima etapa ▶' : 'Ir para a prova ▶'}</button>
            <button type="button" onClick={proximaVez} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-300">Pular esta etapa</button>
          </div>
        </div>
      )}

      {modo === 'prova' && (
        <div className="mt-2 space-y-2">
          {!provaDe ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {listaVez.filter((x) => x.modo === 'pratica').map((x) => (
                <button key={x.etapa.id} type="button" onClick={() => setProvaDe(x.etapa.praticaId)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm font-bold text-blue-900 hover:bg-blue-50">📝 Fazer a prova: {x.etapa.titulo}</button>
              ))}
            </div>
          ) : praticaPorId(provaDe) && (
            <>
              <button type="button" onClick={() => setProvaDe(null)} className="text-xs font-semibold text-blue-800">‹ Escolher outra prova</button>
              <SimuladorEscola key={`prova-${provaDe}`} pratica={praticaPorId(provaDe)!} falar={falar} faseInicial="prova" onFechar={() => setProvaDe(null)} onProvaEntregue={onMudou} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
