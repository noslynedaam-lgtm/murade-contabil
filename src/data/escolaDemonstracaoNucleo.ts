// ESCOLA MURADE — núcleo PURO da "▶ Demonstração completa com a IA" (igual no Fiscal e no Contábil; nasceu no Murade DP).
// O roteiro de cada sistema fica em src/data/escolaDemonstracao.ts; aqui ficam os tipos, os passos, os controles e a segurança.
//
// A Agente percorre o serviço do mês tela por tela, na TELA DE TREINO (réplica fiel: mesmos nomes de menu, campos e botões das
// telas reais — o teste confere cada nome no código da tela). Por que não nas telas reais: elas abrem a EMPRESA ATIVA do
// escritório, carregam os dados reais e os botões de salvar/transmitir/emitir gravam e enviam de verdade.
//
// SEGURANÇA: a demonstração só "clica" em item de menu, em botão de abrir aba/formulário e em botão que só calcula prévia —
// nunca em salvar, gravar, aprovar, fechar, enviar, transmitir, emitir, registrar, apagar ou reabrir. Nesses ela mostra a seta e
// diz "aqui você clicaria". O único pedido ao servidor é o cálculo de TREINO (e o registro de que a pessoa assistiu).
import type { CenarioSim, PraticaSim, TipoCampoSim } from './escolaNucleo';

/** Comando de voz/teclado para a demonstração. O controlador de fala da Agente (botão PARAR / "para") pode disparar
 *  `window.dispatchEvent(new CustomEvent(EVENTO_DEMO_COMANDO, { detail: { acao: 'parar' } }))` — ou o evento genérico
 *  EVENTO_AGENTE_PARAR — e a demonstração para na hora. Tecla Esc também para. */
export const EVENTO_DEMO_COMANDO = 'murade:escola-demo';
export const EVENTO_AGENTE_PARAR = 'murade:agente-parar';
export const TITULO_DEMO = '▶ Demonstração completa com a IA';
export type ComandoDemo = 'pausar' | 'continuar' | 'pular' | 'parar';

export interface CampoDemo {
  id: string;
  rotulo: string;
  tipo: TipoCampoSim;
  valor: string;
  opcoes?: Array<{ valor: string; rotulo: string }>;
  /** Frase curta que a Agente fala ao preencher (por que esse valor). */
  porque?: string;
  /** Já vem preenchido de outra tela/robô: aparece pronto, a Agente só aponta. */
  fixo?: boolean;
}
export interface BotaoDemo { rotulo: string; porque: string }
export interface EtapaDemo {
  id: string;
  titulo: string;
  /** Texto do item do menu real. */
  menu: string;
  /** Id da tela real (mapa de telas do sistema). */
  tela: string;
  /** Arquivos da tela real onde os nomes dos campos e botões aparecem (o teste e o robô conferem). */
  arquivos: string[];
  /** O que é esta tela, falado em uma ou duas frases. */
  fala: string;
  /** Botão de abrir formulário/aba (não grava nada): a demonstração clica. */
  abrir?: BotaoDemo;
  campos: CampoDemo[];
  /** Prática do simulador: motor real e prática guiada da "sua vez". null = etapa sem cálculo próprio. */
  praticaId: string | null;
  /** Resultado: do próprio cálculo ('propria') ou do cálculo de uma etapa anterior (id dela). */
  resultado: { origem: string; itens: Array<{ chave: string; rotulo: string }> };
  /** "Aqui NÃO". */
  nao: BotaoDemo[];
  /** "Aqui SIM você clica" — a demonstração NUNCA clica: mostra a seta e diz "aqui você clicaria". */
  sim: BotaoDemo[];
  fecho: string;
  /** "Sua vez" das etapas sem prática: a pessoa acha o botão certo entre os SIM/NÃO. */
  suaVez?: { pergunta: string; certo: string };
}

// ---------------------------------------------------------------- passos
export type TipoPassoDemo = 'falar' | 'menu' | 'abrir' | 'preencher' | 'resultado' | 'mostrar_nao' | 'mostrar_sim' | 'concluir';
export interface PassoDemo { tipo: TipoPassoDemo; alvo: string; texto: string; valor?: string }
/** Passos em que o cursor "clica" na réplica. Nenhum deles grava. */
export const PASSOS_QUE_CLICAM: TipoPassoDemo[] = ['menu', 'abrir'];
/** Palavras de botão que a demonstração NUNCA aperta. */
export const RE_BOTAO_PROIBIDO = /salvar|gravar|enviar|transmit|fechar|aprovar|registrar|apagar|excluir|reabrir|retirar|marcar|limpar|^sim\b|lan[cç]ar|emitir|pagar|assinar|confirmar|importar|aceitar|baixar|gerar|guardar|cadastrar|rejeitar|desfazer|remover|criar|preparar|calcular agora/i;
export const botaoPodeSerClicadoPelaDemo = (rotulo: string): boolean => !RE_BOTAO_PROIBIDO.test(rotulo);

export function passosDaEtapa(e: EtapaDemo): PassoDemo[] {
  const passos: PassoDemo[] = [{ tipo: 'falar', alvo: e.id, texto: e.fala }, { tipo: 'menu', alvo: e.menu, texto: `Clico em "${e.menu}" no menu.` }];
  if (e.abrir) passos.push({ tipo: 'abrir', alvo: e.abrir.rotulo, texto: e.abrir.porque });
  for (const c of e.campos) passos.push({ tipo: 'preencher', alvo: c.id, valor: c.valor, texto: c.porque || '' });
  if (e.resultado.itens.length) passos.push({ tipo: 'resultado', alvo: e.resultado.origem, texto: e.resultado.origem === 'propria' ? 'Pronto: este é o resultado calculado pelo motor do sistema.' : 'Estes valores vêm do cálculo que o sistema fez antes.' });
  for (const b of e.nao) passos.push({ tipo: 'mostrar_nao', alvo: b.rotulo, texto: b.porque });
  for (const b of e.sim) passos.push({ tipo: 'mostrar_sim', alvo: b.rotulo, texto: b.porque });
  passos.push({ tipo: 'concluir', alvo: e.id, texto: e.fecho });
  for (const p of passos) if (p.tipo === 'abrir' && !botaoPodeSerClicadoPelaDemo(p.alvo)) throw new Error(`A demonstração não pode clicar em "${p.alvo}".`);
  return passos;
}

// ---------------------------------------------------------------- velocidade e controles
export type VelocidadeDemo = 'lenta' | 'normal' | 'rapida';
export const VELOCIDADES: Record<VelocidadeDemo, { rotulo: string; letraMs: number; passoMs: number; fatorFala: number }> = {
  lenta: { rotulo: 'Lenta', letraMs: 120, passoMs: 1100, fatorFala: 1.3 },
  normal: { rotulo: 'Normal', letraMs: 60, passoMs: 600, fatorFala: 1 },
  rapida: { rotulo: 'Rápida', letraMs: 22, passoMs: 250, fatorFala: 0.7 },
};
export const tempoDeFalaDemo = (texto: string, v: VelocidadeDemo): number => (texto ? Math.round(Math.min(9000, Math.max(1200, texto.length * 45)) * VELOCIDADES[v].fatorFala) : 0);

export type EstadoDemo = 'pronto' | 'rodando' | 'pausado' | 'concluido' | 'parado';
export type EventoDemo = 'iniciar' | 'pausar' | 'continuar' | 'parar' | 'concluir';
export function transicaoDemo(atual: EstadoDemo, ev: EventoDemo): EstadoDemo {
  if (atual === 'concluido' || atual === 'parado') return ev === 'iniciar' ? 'rodando' : atual;
  switch (ev) {
    case 'iniciar': return atual === 'pronto' ? 'rodando' : atual;
    case 'pausar': return atual === 'rodando' ? 'pausado' : atual;
    case 'continuar': return atual === 'pausado' ? 'rodando' : atual;
    case 'parar': return 'parado';
    case 'concluir': return 'concluido';
    default: return atual;
  }
}
/** Reconhece comando falado/escrito durante a demonstração (para ligar no comando de voz da Agente). */
export function intencaoDemo(texto: string): ComandoDemo | null {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 6) return null;
  if (/^(agente )?(para|pare|parar|chega|encerra|encerrar|cancela|cancelar|sai|sair)( a demonstracao| tudo| agora| ja| por favor)*$/.test(t)) return 'parar';
  if (/^(agente )?(pausa|pausar|pause|espera|espere|calma)( ai| um pouco| agora| por favor)*$/.test(t)) return 'pausar';
  if (/^(agente )?(continua|continuar|continue|segue|seguir|pode seguir|vai)( ai| agora| por favor)*$/.test(t)) return 'continuar';
  if (/^(agente )?(pula|pular|pule|proxima|proxima etapa|passa|avanca)( essa| esta| etapa| essa etapa| por favor)*$/.test(t)) return 'pular';
  return null;
}

// ---------------------------------------------------------------- "Agora é a sua vez"
export function botoesSuaVez(e: EtapaDemo): string[] {
  const unicos = [...new Set([...e.sim.map((b) => b.rotulo), ...e.nao.map((b) => b.rotulo)])];
  return unicos.map((r, i) => ({ r, k: (i * 7 + e.id.length) % 5 })).sort((a, b) => a.k - b.k).map((x) => x.r);
}
export function avaliarCliqueSuaVez(e: EtapaDemo, rotulo: string): { certo: boolean; mensagem: string } {
  if (!e.suaVez) return { certo: false, mensagem: 'Esta etapa é feita no simulador.' };
  if (rotulo === e.suaVez.certo) {
    const porque = e.sim.find((b) => b.rotulo === rotulo)?.porque || '';
    return { certo: true, mensagem: `Isso mesmo! ${porque.replace(/^Aqui SIM você clica[^.]*\.\s*/i, '')}`.trim() };
  }
  const nao = e.nao.find((b) => b.rotulo === rotulo);
  return { certo: false, mensagem: `Não, aí está errado. Confere direito. ${nao ? nao.porque.replace(/^Aqui NÃO[,:]?\s*(ainda:)?\s*/i, '') : 'Esse botão não é o desta tarefa.'}`.trim() };
}

// ---------------------------------------------------------------- roteiro de um sistema
export type EventoRegistroDemo = 'etapa' | 'completa' | 'sua_vez';
export function criarRoteiroDemo(etapas: EtapaDemo[], praticas: PraticaSim[]) {
  const ids = etapas.map((e) => e.id);
  const pratica = (id: string | null) => (id ? praticas.find((p) => p.id === id) : undefined);
  const etapaPorId = (id: string) => etapas.find((e) => e.id === id);
  /** Valores que vão ao motor de treino: os campos da prática (os demais são só da tela). */
  const valoresParaMotor = (e: EtapaDemo): Record<string, string> | null => {
    const p = pratica(e.praticaId); if (!p) return null;
    const v: Record<string, string> = {};
    for (const c of p.campos) { const campo = e.campos.find((x) => x.id === c.id); v[c.id] = campo ? campo.valor : (p.demo.valores[c.id] ?? ''); }
    return v;
  };
  /** Etapa cujo cálculo alimenta o resultado mostrado (ela mesma ou uma anterior). */
  const etapaDoCalculo = (e: EtapaDemo): EtapaDemo | undefined => (e.resultado.origem === 'propria' ? e : etapaPorId(e.resultado.origem));
  const etapasSuaVez = () => etapas.filter((e) => e.praticaId || e.suaVez).map((e) => ({ etapa: e, modo: e.praticaId ? 'pratica' as const : 'botao' as const }));
  const registroValido = (evento: unknown, etapa: unknown): { evento: EventoRegistroDemo; etapa: string | null } | null => {
    if (evento === 'completa') return { evento, etapa: null };
    if ((evento === 'etapa' || evento === 'sua_vez') && typeof etapa === 'string' && ids.includes(etapa)) return { evento, etapa };
    return null;
  };
  /** Para o Robô Conferidor da Escola. */
  const conferir = (): string[] => {
    const problemas: string[] = [];
    const vistos = new Set<string>();
    etapas.forEach((e, i) => {
      if (vistos.has(e.id)) problemas.push(`etapa repetida ${e.id}`); vistos.add(e.id);
      if (e.praticaId && !pratica(e.praticaId)) problemas.push(`${e.id}: prática inexistente ${e.praticaId}`);
      if (!e.praticaId && !e.suaVez) problemas.push(`${e.id}: sem prática e sem "sua vez"`);
      if (e.suaVez && !e.sim.some((b) => b.rotulo === e.suaVez!.certo)) problemas.push(`${e.id}: a resposta da "sua vez" não é um botão SIM`);
      if (e.resultado.origem !== 'propria') {
        const o = etapas.findIndex((x) => x.id === e.resultado.origem);
        if (o < 0 || o >= i || !etapas[o].praticaId) problemas.push(`${e.id}: resultado vem de etapa inexistente ou posterior (${e.resultado.origem})`);
      } else if (e.resultado.itens.length && !e.praticaId) problemas.push(`${e.id}: resultado próprio sem prática`);
      try { passosDaEtapa(e); } catch (err) { problemas.push(`${e.id}: ${(err as Error).message}`); }
      const v = valoresParaMotor(e);
      if (e.praticaId && v && Object.values(v).some((x) => x === '')) problemas.push(`${e.id}: falta valor para o motor`);
    });
    return problemas;
  };
  return { ids, etapaPorId, valoresParaMotor, etapaDoCalculo, etapasSuaVez, registroValido, conferir, pratica };
}

/** Valores de um cenário de demonstração de uma prática (para montar o roteiro sem repetir números). */
export const valoresDemo = (p: PraticaSim | undefined): CenarioSim['valores'] => p?.demo.valores || {};
