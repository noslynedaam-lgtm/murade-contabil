import type { Express, NextFunction, Request, Response } from 'express';
import { acharPorNome, normalizarTexto } from './tarefasEquipe';
import {
  ASSUNTOS_AGENTE, IDS_TELAS_JEITO, MODULOS_JEITO_PADRAO, SECOES_DESTACAVEIS, SESSOES_COM_BOAS_VINDAS, TEXTO_PROTECAO, rotuloDaTela, textoBoasVindas,
} from '../data/jeitoPadraoContabil';

// "Meu jeito": preferências de USO de cada pessoa (e, se for administrador, o jeito padrão do escritório), por cima do jeito padrão do sistema.
// O jeito é uma camada: NUNCA desliga proteção (confirmações de ação irreversível, cálculos exatos, obrigações e robôs, anti-duplicidade,
// SERPRO só manual, nada de apagar em lote). O esquema abaixo é FECHADO: só existe o que está no catálogo; qualquer outra coisa é recusada.
// Não guarda conteúdo digitado, dado de empresa ou de lançamento: só nomes de telas, opções do catálogo e contagens de navegação.
// Tudo é isolado por escritório (tenant) e por pessoa: nenhuma consulta sai sem tenant e usuário da sessão.

export type SessaoJeito = { userId: string; login: string; tenantId?: string; escritorioDe?: string; administrador: boolean };
export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export const TABELA_JEITO = 'contabil_meu_jeito';
export const USUARIO_ESCRITORIO = '__escritorio__';
export const VERSAO_ESQUEMA = 1;
/** Nova "sessão" = outro login OU mais de 2 horas sem abrir a Agente (a pessoa pode ficar conectada por meses no celular). */
export const HORAS_ENTRE_SESSOES = 2;
export const MIN_REPETICOES_SUGESTAO = 5;
export const PROPORCAO_SUGESTAO = 0.6;
export const MAX_ACOES_POR_REGRA = 3;
export const MAX_FAVORITOS = 6;
export const DIAS_HASH_SESSAO = 7;

/** Sem strictNullChecks o TypeScript não estreita uniões por `ok`; este guarda faz o estreitamento. */
export const falhou = <T extends { ok: boolean }>(r: T): r is Extract<T, { ok: false }> => r.ok === false;
export const deu = <T extends { ok: boolean }>(r: T): r is Extract<T, { ok: true }> => r.ok === true;

export class ErroJeito extends Error { constructor(public status: number, mensagem: string, public protegido = false) { super(mensagem); } }

// ---------------------------------------------------------------------------------------------
// Proteções: o que o jeito nunca muda
// ---------------------------------------------------------------------------------------------
const semMarcas = (t: unknown): string => normalizarTexto(t).replace(/\s+/g, ' ');
const PADROES_PROTEGIDOS: RegExp[] = [
  /\b(nao|sem|nunca|pare de|deixa de|deixe de|dispens\w*|pul\w*|desativ\w*|desligu?\w*|tir\w*|remov\w*|esquec\w*)\b.{0,30}\b(confirma\w*|pergunt\w*|autoriza\w*|conferi\w*)/,
  /\b(automatic\w*|sozinh\w*)\b.{0,40}\b(lanc\w*|contabiliz\w*|fech\w*|encerr\w*|envi\w*|pag\w*|exclu\w*|apag\w*|estorn\w*|transmit\w*|aprov\w*)/,
  /\b(lanc\w*|contabiliz\w*|fech\w*|encerr\w*|envi\w*|pag\w*|exclu\w*|apag\w*|estorn\w*|transmit\w*|aprov\w*)\b.{0,40}\b(automaticamente|sozinh\w*|sem confirmar|sem confirmacao|sem pedir)/,
  /\b(apag\w*|exclu\w*|delet\w*|limp\w*|remov\w*)\b.{0,25}\b(tudo|todas?|todos?|em lote|de uma vez|de uma so vez)/,
  /\bserpro\b.{0,40}\b(robo|automatic\w*|sozinh\w*)|\b(robo|automatic\w*|sozinh\w*)\b.{0,40}\bserpro\b/,
  /\b(desligu?\w*|pausa\w*|desativ\w*|para\w*|cancel\w*|ignor\w*)\b.{0,30}\b(robo\w*|conferidor\w*|alerta\w*|obrigac\w*|prazo\w*|duplicidade|calculo\w*|trava\w*|protec\w*)/,
  /\b(arredond\w*|calculo\w*|imposto\w*)\b.{0,30}\b(aproxim\w*|estimad\w*|a meu jeito|do meu jeito|diferente)/,
];
/** Se a frase pede para desligar ou contornar uma proteção, devolve a explicação gentil; senão, null. Só serve para triagem: nada disso é guardado. */
export function detectarPedidoProtegido(texto: unknown): string | null {
  const t = semMarcas(texto);
  if (!t) return null;
  return PADROES_PROTEGIDOS.some((re) => re.test(t)) ? TEXTO_PROTECAO : null;
}
const CHAVE_PARECE_PROTECAO = /confirm|proteg|duplic|serpro|robo|calcul|exclu|apag|lote|obrig|lanc|fech|estorn|envi|pag|irrevers|seguranc|trava/;
const VALOR_DESLIGA = /^(nenhuma?|nada|sem|off|desligad[oa]|desativad[oa]|nao|false|automatic[oa]|pular|dispensar)$/;

// ---------------------------------------------------------------------------------------------
// Catálogo FECHADO de preferências
// ---------------------------------------------------------------------------------------------
type ResultadoValor = { ok: true; valor: unknown } | { ok: false; motivo: string; protegido?: boolean };
export type DefinicaoPreferencia = {
  chave: string; rotulo: string; descricao: string; padrao: unknown; escopoEscritorio: boolean;
  opcoes?: Array<{ valor: string; rotulo: string }>; lista?: { max: number };
  validar: (v: unknown) => ResultadoValor;
  texto: (v: unknown) => string;
};

const TELAS = MODULOS_JEITO_PADRAO.map((m) => ({ id: m.id, rotulo: m.rotulo }));
/** Acha a tela pelo id ou pelo nome do menu (sem acento, maiúscula ou nome parcial). Nunca escolhe entre duas. */
export function resolverTela(v: unknown): { ok: true; id: string } | { ok: false; motivo: string } {
  const bruto = String(v ?? '').trim();
  if (!bruto) return { ok: false, motivo: 'Diga qual tela.' };
  if (IDS_TELAS_JEITO.includes(bruto)) return { ok: true, id: bruto };
  const a = acharPorNome(TELAS, bruto, (t) => [t.rotulo, t.id.replace(/-/g, ' ')]);
  if (a.tipo === 'unico') return { ok: true, id: a.item.id };
  if (a.tipo === 'ambiguo') return { ok: false, motivo: `Há mais de uma tela parecida com "${bruto}": ${a.itens.map((t) => t.rotulo).join('; ')}. Pergunte qual delas.` };
  return { ok: false, motivo: `Não existe a tela "${bruto}". As telas são: ${TELAS.map((t) => t.rotulo).join('; ')}.` };
}
const resolverOpcao = (v: unknown, opcoes: Array<{ valor: string; rotulo: string }>, sinonimos: Record<string, string> = {}): string | null => {
  const t = semMarcas(v);
  const achou = opcoes.find((o) => semMarcas(o.valor) === t || semMarcas(o.rotulo) === t);
  return achou ? achou.valor : (sinonimos[t] ?? null);
};
const listaDe = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*(?:,|;|\be\b|\n)\s*/i).filter(Boolean) : []);

const OPCOES_NIVEL = [{ valor: 'curto', rotulo: 'Curto' }, { valor: 'detalhado', rotulo: 'Detalhado' }];
const OPCOES_VELOCIDADE = [{ valor: 'calma', rotulo: 'Calma' }, { valor: 'normal', rotulo: 'Normal' }, { valor: 'rapida', rotulo: 'Rápida' }];
const OPCOES_CONFIRMACAO = [{ valor: 'completa', rotulo: 'Completa (mostra todos os detalhes)' }, { valor: 'resumida', rotulo: 'Resumida (só o essencial)' }];
const OPCOES_BOOL = [{ valor: 'sim', rotulo: 'Ligado' }, { valor: 'nao', rotulo: 'Desligado' }];

export const PREFERENCIAS: Record<string, DefinicaoPreferencia> = {
  telaInicial: {
    chave: 'telaInicial', rotulo: 'Tela ao entrar', descricao: 'A tela que abre quando você entra no sistema.', padrao: 'inicio', escopoEscritorio: true,
    opcoes: TELAS.map((t) => ({ valor: t.id, rotulo: t.rotulo })),
    validar: (v) => { const r = resolverTela(v); return falhou(r) ? { ok: false, motivo: r.motivo } : { ok: true, valor: r.id }; },
    texto: (v) => rotuloDaTela(String(v)),
  },
  menuFavoritos: {
    chave: 'menuFavoritos', rotulo: 'Atalhos no topo do menu', descricao: `Até ${MAX_FAVORITOS} telas que aparecem primeiro no menu, na ordem que você escolher.`, padrao: [], escopoEscritorio: true,
    lista: { max: MAX_FAVORITOS }, opcoes: TELAS.map((t) => ({ valor: t.id, rotulo: t.rotulo })),
    validar: (v) => {
      const itens = listaDe(v); const ids: string[] = [];
      if (itens.length > MAX_FAVORITOS) return { ok: false, motivo: `São no máximo ${MAX_FAVORITOS} atalhos.` };
      for (const item of itens) { const r = resolverTela(item); if (falhou(r)) return { ok: false, motivo: r.motivo }; if (!ids.includes(r.id)) ids.push(r.id); }
      return { ok: true, valor: ids };
    },
    texto: (v) => (Array.isArray(v) && v.length ? v.map((x) => rotuloDaTela(String(x))).join(', ') : 'nenhum'),
  },
  nivelConversa: {
    chave: 'nivelConversa', rotulo: 'Conversa da Agente', descricao: 'Curto: respostas diretas. Detalhado: a Agente explica o porquê e o passo a passo.', padrao: 'curto', escopoEscritorio: true, opcoes: OPCOES_NIVEL,
    validar: (v) => { const o = resolverOpcao(v, OPCOES_NIVEL, { resumido: 'curto', breve: 'curto', direto: 'curto', completo: 'detalhado', longo: 'detalhado', explicado: 'detalhado' }); return o ? { ok: true, valor: o } : { ok: false, motivo: 'Escolha "curto" ou "detalhado".' }; },
    texto: (v) => (v === 'detalhado' ? 'detalhado' : 'curto'),
  },
  velocidadePiloto: {
    chave: 'velocidadePiloto', rotulo: 'Velocidade do piloto visível', descricao: 'O ritmo em que a Agente conduz a tela quando mostra algo à vista.', padrao: 'normal', escopoEscritorio: true, opcoes: OPCOES_VELOCIDADE,
    validar: (v) => { const o = resolverOpcao(v, OPCOES_VELOCIDADE, { lenta: 'calma', devagar: 'calma', rapido: 'rapida', veloz: 'rapida' }); return o ? { ok: true, valor: o } : { ok: false, motivo: 'Escolha "calma", "normal" ou "rápida".' }; },
    texto: (v) => (v === 'calma' ? 'calma' : v === 'rapida' ? 'rápida' : 'normal'),
  },
  confirmacaoNaoProtegida: {
    chave: 'confirmacaoNaoProtegida', rotulo: 'Cartão de confirmação (ações sem risco)', descricao: 'Só muda quanto detalhe o cartão mostra nas ações de baixo risco (pedir serviço à equipe, reprocessar a recepção). O cartão continua aparecendo e você continua confirmando; ações irreversíveis sempre mostram tudo.', padrao: 'completa', escopoEscritorio: false, opcoes: OPCOES_CONFIRMACAO,
    validar: (v) => {
      if (VALOR_DESLIGA.test(semMarcas(v))) return { ok: false, motivo: TEXTO_PROTECAO, protegido: true };
      const o = resolverOpcao(v, OPCOES_CONFIRMACAO, { detalhada: 'completa', detalhado: 'completa', resumido: 'resumida', curta: 'resumida', curto: 'resumida' });
      return o ? { ok: true, valor: o } : { ok: false, motivo: 'Escolha "completa" ou "resumida". Não dá para tirar o cartão de confirmação.' };
    },
    texto: (v) => (v === 'resumida' ? 'resumida' : 'completa'),
  },
  observarUso: {
    chave: 'observarUso', rotulo: 'Notar o meu jeito de usar', descricao: 'A Agente conta só por quais telas você costuma passar (nenhum conteúdo) para SUGERIR atalhos. Nada é salvo sem o seu sim. Ao desligar, o que foi contado é apagado.', padrao: true, escopoEscritorio: false, opcoes: OPCOES_BOOL,
    validar: (v) => {
      if (typeof v === 'boolean') return { ok: true, valor: v };
      const t = semMarcas(v);
      if (/^(sim|ligad[oa]|true|ligar|ativ\w*)$/.test(t)) return { ok: true, valor: true };
      if (/^(nao|desligad[oa]|false|desligar|desativ\w*)$/.test(t)) return { ok: true, valor: false };
      return { ok: false, motivo: 'Escolha ligado ou desligado.' };
    },
    texto: (v) => (v === false ? 'desligado' : 'ligado'),
  },
};
export const CHAVES_PREFERENCIA = Object.keys(PREFERENCIAS);
export const valoresPadrao = (): Record<string, unknown> => Object.fromEntries(CHAVES_PREFERENCIA.map((k) => [k, PREFERENCIAS[k].padrao]));

/** Esquema fechado: só chaves e valores do catálogo. Chave desconhecida é recusada; se parecer proteção, com a explicação gentil. */
export function validarPreferencia(chave: unknown, valor: unknown): { ok: true; chave: string; valor: unknown } | { ok: false; motivo: string; protegido?: boolean } {
  const k = String(chave ?? '').trim();
  const def = Object.prototype.hasOwnProperty.call(PREFERENCIAS, k) ? PREFERENCIAS[k] : undefined;
  if (!def) {
    if (CHAVE_PARECE_PROTECAO.test(semMarcas(k))) return { ok: false, motivo: TEXTO_PROTECAO, protegido: true };
    return { ok: false, motivo: `"${k.slice(0, 40)}" não é algo que eu consiga aprender. Eu aprendo: ${CHAVES_PREFERENCIA.map((c) => PREFERENCIAS[c].rotulo).join('; ')}; e regras do tipo "ao abrir uma tela, destacar uma parte, mostrar um atalho ou me perguntar algo".` };
  }
  const r = def.validar(valor);
  return falhou(r) ? r : { ok: true, chave: k, valor: r.valor };
}

// ---------------------------------------------------------------------------------------------
// Catálogo FECHADO de gatilhos e ações das receitas
// ---------------------------------------------------------------------------------------------
export type Gatilho = { tipo: 'entrar_no_sistema' } | { tipo: 'abrir_tela'; tela: string };
export type Acao =
  | { tipo: 'mostrar_atalho'; tela: string }
  | { tipo: 'destacar_secao'; tela: string; secao: string }
  | { tipo: 'perguntar_agente'; assunto: string };
export type Receita = { id: string; gatilho: Gatilho; acoes: Acao[]; origem: 'ensinada' | 'sugerida'; criadaEm: string; obsoleta?: boolean; motivoObsoleta?: string };

export const CATALOGO_GATILHOS = [
  { tipo: 'entrar_no_sistema', rotulo: 'ao entrar no sistema', parametros: [] as string[] },
  { tipo: 'abrir_tela', rotulo: 'ao abrir uma tela', parametros: ['tela'] },
];
export const CATALOGO_ACOES = [
  { tipo: 'mostrar_atalho', rotulo: 'mostrar um botão de atalho para outra tela (um toque; a Agente não troca de tela sozinha)', parametros: ['tela'], gatilhos: ['entrar_no_sistema', 'abrir_tela'] },
  { tipo: 'destacar_secao', rotulo: 'rolar até uma parte da tela e destacá-la', parametros: ['tela', 'secao'], gatilhos: ['abrir_tela'] },
  { tipo: 'perguntar_agente', rotulo: 'pedir à Agente uma consulta (só leitura; usa crédito de IA)', parametros: ['assunto'], gatilhos: ['entrar_no_sistema', 'abrir_tela'] },
];

const soChaves = (o: unknown, permitidas: string[]): string | null => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'formato inválido';
  const extra = Object.keys(o as object).filter((k) => !permitidas.includes(k));
  return extra.length ? `campo não permitido: ${extra.join(', ').slice(0, 60)}` : null;
};
const recusaFechada = (campos: string): { ok: false; motivo: string; protegido: boolean } => ({
  ok: false, protegido: CHAVE_PARECE_PROTECAO.test(semMarcas(campos)),
  motivo: CHAVE_PARECE_PROTECAO.test(semMarcas(campos)) ? TEXTO_PROTECAO : `Uma regra só pode usar o que está no catálogo (${campos}).`,
});

export const idDaReceita = (g: Gatilho): string => (g.tipo === 'entrar_no_sistema' ? 'entrar' : `abrir:${g.tela}`);
export const ID_RECEITA = /^(entrar|abrir:[a-z][a-z-]{1,30})$/;

function resolverSecao(tela: string, v: unknown): { ok: true; id: string } | { ok: false; motivo: string } {
  const doTela = SECOES_DESTACAVEIS.filter((s) => s.tela === tela);
  if (!doTela.length) return { ok: false, motivo: `A tela ${rotuloDaTela(tela)} não tem uma parte que eu consiga destacar.` };
  const bruto = String(v ?? '').trim();
  const exato = doTela.find((s) => s.id === bruto);
  if (exato) return { ok: true, id: exato.id };
  const a = acharPorNome(doTela, bruto, (s) => [s.rotulo, s.texto]);
  if (a.tipo === 'unico') return { ok: true, id: a.item.id };
  const opcoes = doTela.map((s) => s.rotulo).join('; ');
  return { ok: false, motivo: a.tipo === 'ambiguo' ? `Há mais de uma parte parecida com "${bruto}" em ${rotuloDaTela(tela)}: ${a.itens.map((s) => s.rotulo).join('; ')}. Pergunte qual.` : `Em ${rotuloDaTela(tela)} eu consigo destacar: ${opcoes}.` };
}
function resolverAssunto(v: unknown): { ok: true; id: string } | { ok: false; motivo: string } {
  const bruto = String(v ?? '').trim();
  const exato = ASSUNTOS_AGENTE.find((a) => a.id === bruto);
  if (exato) return { ok: true, id: exato.id };
  const a = acharPorNome(ASSUNTOS_AGENTE, bruto, (x) => [x.rotulo]);
  if (a.tipo === 'unico') return { ok: true, id: a.item.id };
  return { ok: false, motivo: `Consultas que uma regra pode pedir: ${ASSUNTOS_AGENTE.map((x) => x.rotulo).join('; ')}.` };
}

/** Valida e normaliza uma regra contra o catálogo fechado. Devolve a regra pronta (sem id de data/origem) ou o motivo da recusa. */
export function validarReceita(entrada: unknown): { ok: true; id: string; gatilho: Gatilho; acoes: Acao[] } | { ok: false; motivo: string; protegido?: boolean } {
  const e0 = soChaves(entrada, ['gatilho', 'acoes']);
  if (e0) return recusaFechada(e0);
  const { gatilho: g0, acoes: a0 } = entrada as { gatilho: unknown; acoes: unknown };
  const e1 = soChaves(g0, ['tipo', 'tela']);
  if (e1) return recusaFechada(e1);
  const tipoG = String((g0 as any).tipo ?? '');
  let gatilho: Gatilho;
  if (tipoG === 'entrar_no_sistema') {
    if ((g0 as any).tela !== undefined && (g0 as any).tela !== '') return { ok: false, motivo: 'O gatilho "ao entrar no sistema" não leva tela.' };
    gatilho = { tipo: 'entrar_no_sistema' };
  } else if (tipoG === 'abrir_tela') {
    const t = resolverTela((g0 as any).tela); if (falhou(t)) return { ok: false, motivo: t.motivo };
    gatilho = { tipo: 'abrir_tela', tela: t.id };
  } else return recusaFechada(`gatilho "${tipoG.slice(0, 30)}"`);
  if (!Array.isArray(a0) || a0.length < 1) return { ok: false, motivo: 'Diga o que fazer (pelo menos uma ação).' };
  if (a0.length > MAX_ACOES_POR_REGRA) return { ok: false, motivo: `Uma regra tem no máximo ${MAX_ACOES_POR_REGRA} passos.` };
  const acoes: Acao[] = [];
  for (const a of a0) {
    const tipo = String((a as any)?.tipo ?? '');
    let nova: Acao;
    if (tipo === 'mostrar_atalho') {
      const e = soChaves(a, ['tipo', 'tela']); if (e) return recusaFechada(e);
      const t = resolverTela((a as any).tela); if (falhou(t)) return { ok: false, motivo: t.motivo };
      if (gatilho.tipo === 'abrir_tela' && gatilho.tela === t.id) return { ok: false, motivo: 'O atalho precisa levar para outra tela, não para a própria.' };
      nova = { tipo, tela: t.id };
    } else if (tipo === 'destacar_secao') {
      const e = soChaves(a, ['tipo', 'tela', 'secao']); if (e) return recusaFechada(e);
      if (gatilho.tipo !== 'abrir_tela') return { ok: false, motivo: 'Destacar uma parte da tela só funciona em uma regra "ao abrir uma tela".' };
      const tela = (a as any).tela ? resolverTela((a as any).tela) : { ok: true as const, id: gatilho.tela };
      if (falhou(tela)) return { ok: false, motivo: tela.motivo };
      if (tela.id !== gatilho.tela) return { ok: false, motivo: 'A parte destacada precisa ser da mesma tela que a regra abre.' };
      const s = resolverSecao(tela.id, (a as any).secao); if (falhou(s)) return { ok: false, motivo: s.motivo };
      nova = { tipo, tela: tela.id, secao: s.id };
    } else if (tipo === 'perguntar_agente') {
      const e = soChaves(a, ['tipo', 'assunto']); if (e) return recusaFechada(e);
      const s = resolverAssunto((a as any).assunto); if (falhou(s)) return { ok: false, motivo: s.motivo };
      nova = { tipo, assunto: s.id };
    } else return recusaFechada(`ação "${tipo.slice(0, 30)}"`);
    if (acoes.some((x) => JSON.stringify(x) === JSON.stringify(nova))) return { ok: false, motivo: 'Há um passo repetido na regra.' };
    acoes.push(nova);
  }
  return { ok: true, id: idDaReceita(gatilho), gatilho, acoes };
}

export function descreverGatilho(g: Gatilho): string { return g.tipo === 'entrar_no_sistema' ? 'ao entrar no sistema' : `ao abrir ${rotuloDaTela(g.tela)}`; }
export function descreverAcao(a: Acao): string {
  if (a.tipo === 'mostrar_atalho') return `mostrar um atalho para ${rotuloDaTela(a.tela)}`;
  if (a.tipo === 'destacar_secao') return `destacar "${SECOES_DESTACAVEIS.find((s) => s.id === a.secao)?.rotulo ?? a.secao}"`;
  return `perguntar à Agente: ${ASSUNTOS_AGENTE.find((x) => x.id === a.assunto)?.rotulo ?? a.assunto}`;
}
export function descreverReceita(r: Pick<Receita, 'gatilho' | 'acoes'>): string {
  const d = `${descreverGatilho(r.gatilho)}: ${r.acoes.map(descreverAcao).join(', depois ')}`;
  return d.charAt(0).toUpperCase() + d.slice(1);
}
export const descreverPreferencia = (chave: string, valor: unknown): string => `${PREFERENCIAS[chave]?.rotulo ?? chave}: ${PREFERENCIAS[chave]?.texto(valor) ?? String(valor)}`;

/** Reconfere uma regra GUARDADA contra o catálogo de hoje (telas, partes e consultas podem mudar com atualizações). */
export function reavaliarReceita(r: any): { valida: boolean; motivo?: string; receita?: Receita } {
  const v = r && typeof r === 'object' ? validarReceita({ gatilho: r.gatilho, acoes: r.acoes }) : null;
  if (!v || falhou(v)) return { valida: false, motivo: v && falhou(v) ? v.motivo.slice(0, 200) : 'Regra ilegível.' };
  return { valida: true, receita: { id: v.id, gatilho: v.gatilho, acoes: v.acoes, origem: r.origem === 'sugerida' ? 'sugerida' : 'ensinada', criadaEm: String(r.criadaEm || '') } };
}

// ---------------------------------------------------------------------------------------------
// Observação (só sugerir) — puro e testável
// ---------------------------------------------------------------------------------------------
export type Sugestao = { id: string; de: string; para: string; vezes: number; texto: string; receita: { gatilho: Gatilho; acoes: Acao[] } };
const CHAVE_PAR = /^([a-z][a-z-]{1,30})>([a-z][a-z-]{1,30})$/;
export function parValido(de: unknown, para: unknown): boolean {
  return typeof de === 'string' && typeof para === 'string' && de !== para && IDS_TELAS_JEITO.includes(de) && IDS_TELAS_JEITO.includes(para) && de !== 'meu-jeito' && para !== 'meu-jeito';
}
export function calcularSugestoes(observacoes: Record<string, unknown>, receitas: Record<string, any>, dispensadas: string[]): Sugestao[] {
  const totais = new Map<string, number>();
  const pares: Array<{ de: string; para: string; n: number }> = [];
  for (const [k, v] of Object.entries(observacoes || {})) {
    const m = CHAVE_PAR.exec(k); const n = Number(v);
    if (!m || !parValido(m[1], m[2]) || !Number.isFinite(n) || n < 1) continue;
    totais.set(m[1], (totais.get(m[1]) || 0) + n);
    pares.push({ de: m[1], para: m[2], n });
  }
  const saida: Sugestao[] = [];
  for (const p of pares.sort((a, b) => b.n - a.n)) {
    const id = `atalho:${p.de}>${p.para}`;
    if (p.n < MIN_REPETICOES_SUGESTAO || p.n / (totais.get(p.de) || 1) < PROPORCAO_SUGESTAO || dispensadas.includes(id)) continue;
    const existente = receitas?.[`abrir:${p.de}`];
    const jaTem = Array.isArray(existente?.acoes) && existente.acoes.some((a: any) => a?.tipo === 'mostrar_atalho' && a.tela === p.para);
    if (jaTem) continue;
    const acoesAtuais: Acao[] = Array.isArray(existente?.acoes) && reavaliarReceita(existente).valida ? existente.acoes : [];
    if (acoesAtuais.length >= MAX_ACOES_POR_REGRA) continue;
    saida.push({
      id, de: p.de, para: p.para, vezes: p.n,
      texto: `Notei que, depois de abrir ${rotuloDaTela(p.de)}, você costuma ir para ${rotuloDaTela(p.para)}. Quer que eu mostre um atalho para isso?`,
      receita: { gatilho: { tipo: 'abrir_tela', tela: p.de }, acoes: [...acoesAtuais, { tipo: 'mostrar_atalho', tela: p.para }] },
    });
    if (saida.length >= 3) break;
  }
  return saida;
}

// ---------------------------------------------------------------------------------------------
// Serviço (banco)
// ---------------------------------------------------------------------------------------------
type Linha = Record<string, any>;
const tenantDe = (s: SessaoJeito): string => String(s.tenantId || s.escritorioDe || s.userId);
const jsonObj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const jsonArr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const iso = (v: unknown): string | null => (v ? new Date(v as any).toISOString() : null);

/** Valores válidos hoje (valor guardado fora do catálogo atual é ignorado: cai no padrão). */
function valoresValidos(pref: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(jsonObj(jsonObj(pref).valores))) {
    if (!Object.prototype.hasOwnProperty.call(PREFERENCIAS, k)) continue;
    const r = PREFERENCIAS[k].validar(v);
    if (r.ok) out[k] = r.valor;
  }
  return out;
}

export function criarServicoMeuJeito(consultar: Consultar, agora: () => Date = () => new Date()) {
  let pronta: Promise<void> | null = null;
  const garantirTabelas = (): Promise<void> => {
    pronta ??= consultar(`
      CREATE TABLE IF NOT EXISTS ${TABELA_JEITO} (
        tenant_id text NOT NULL, user_id text NOT NULL,
        preferencias jsonb NOT NULL DEFAULT '{"v":${VERSAO_ESQUEMA},"valores":{}}'::jsonb,
        versao integer NOT NULL DEFAULT 1,
        receitas jsonb NOT NULL DEFAULT '{}'::jsonb,
        sessoes integer NOT NULL DEFAULT 0,
        ultima_sessao_hash text, ultima_abertura timestamptz,
        observacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
        sugestoes_dispensadas jsonb NOT NULL DEFAULT '[]'::jsonb,
        avisos jsonb NOT NULL DEFAULT '[]'::jsonb,
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, user_id)
      );
    `).then(() => undefined).catch((e) => { pronta = null; throw e; });
    return pronta;
  };
  const garantirLinha = async (tenant: string, user: string): Promise<void> => {
    await consultar(`INSERT INTO ${TABELA_JEITO}(tenant_id,user_id) VALUES($1,$2) ON CONFLICT (tenant_id,user_id) DO NOTHING`, [tenant, user]);
  };
  const lerLinha = async (tenant: string, user: string): Promise<Linha | null> => (await consultar(`SELECT * FROM ${TABELA_JEITO} WHERE tenant_id=$1 AND user_id=$2`, [tenant, user])).rows[0] ?? null;

  function montarVisao(sessao: SessaoJeito, minha: Linha | null, escritorio: Linha | null) {
    const meus = valoresValidos(minha?.preferencias); const doEscritorio = valoresValidos(escritorio?.preferencias);
    const padrao = valoresPadrao(); const efetivo: Record<string, unknown> = {}; const origem: Record<string, 'voce' | 'escritorio' | 'padrao'> = {};
    for (const k of CHAVES_PREFERENCIA) {
      if (k in meus) { efetivo[k] = meus[k]; origem[k] = 'voce'; }
      else if (k in doEscritorio && PREFERENCIAS[k].escopoEscritorio) { efetivo[k] = doEscritorio[k]; origem[k] = 'escritorio'; }
      else { efetivo[k] = padrao[k]; origem[k] = 'padrao'; }
    }
    const rec = jsonObj(minha?.receitas);
    const receitas = Object.values(rec).map((r: any) => {
      const a = reavaliarReceita(r);
      const base = a.valida ? a.receita! : { id: String(r?.id ?? ''), gatilho: r?.gatilho, acoes: jsonArr(r?.acoes), origem: 'ensinada' as const, criadaEm: String(r?.criadaEm || '') };
      return {
        id: String(r?.id ?? base.id), origem: base.origem, criadaEm: base.criadaEm || null,
        descricao: a.valida ? descreverReceita(base) : 'Regra antiga, que não existe mais no sistema',
        gatilho: a.valida ? base.gatilho : null, acoes: a.valida ? base.acoes : [], obsoleta: !a.valida, motivoObsoleta: a.valida ? null : a.motivo ?? null,
      };
    }).filter((r) => ID_RECEITA.test(r.id)).sort((a, b) => a.id.localeCompare(b.id));
    const sugestoes = efetivo.observarUso === false ? [] : calcularSugestoes(jsonObj(minha?.observacoes), rec, jsonArr(minha?.sugestoes_dispensadas).map(String));
    return {
      sessoes: Number(minha?.sessoes ?? 0), podeEditarEscritorio: sessao.administrador === true,
      efetivo, origem, meus, escritorio: doEscritorio, padrao,
      preferencias: CHAVES_PREFERENCIA.map((k) => ({
        chave: k, rotulo: PREFERENCIAS[k].rotulo, descricao: PREFERENCIAS[k].descricao, valor: efetivo[k], valorTexto: PREFERENCIAS[k].texto(efetivo[k]), origem: origem[k],
        escopoEscritorio: PREFERENCIAS[k].escopoEscritorio, opcoes: PREFERENCIAS[k].opcoes ?? null, maxLista: PREFERENCIAS[k].lista?.max ?? null,
        valorEscritorio: k in doEscritorio ? doEscritorio[k] : null,
      })),
      receitas, sugestoes: sugestoes.map((s) => ({ id: s.id, texto: s.texto, vezes: s.vezes })),
      catalogo: {
        telas: TELAS, secoes: SECOES_DESTACAVEIS.map((s) => ({ id: s.id, tela: s.tela, rotulo: s.rotulo })), assuntos: ASSUNTOS_AGENTE.map((a) => ({ id: a.id, rotulo: a.rotulo, frase: a.frase })),
        gatilhos: CATALOGO_GATILHOS, acoes: CATALOGO_ACOES, maxAcoes: MAX_ACOES_POR_REGRA,
      },
    };
  }
  /** Só as regras que valem hoje, no formato que a tela executa (regra obsoleta nunca roda). */
  const receitasAtivas = (visao: ReturnType<typeof montarVisao>) => visao.receitas.filter((r) => !r.obsoleta).map((r) => ({ id: r.id, gatilho: r.gatilho, acoes: r.acoes }));

  async function ler(sessao: SessaoJeito) {
    await garantirTabelas();
    const tenant = tenantDe(sessao);
    const [minha, escritorio] = await Promise.all([lerLinha(tenant, sessao.userId), lerLinha(tenant, USUARIO_ESCRITORIO)]);
    const v = montarVisao(sessao, minha, escritorio);
    return { ...v, receitasAtivas: receitasAtivas(v), avisosPendentes: jsonArr(minha?.avisos).length };
  }

  /** Conta a abertura (uma nova "sessão" por login diferente ou por mais de 2 h parada) e devolve boas-vindas, avisos e a primeira sugestão. */
  async function abrir(sessao: SessaoJeito, hashSessao: string) {
    await garantirTabelas();
    const tenant = tenantDe(sessao); const t = agora();
    await garantirLinha(tenant, sessao.userId);
    const linha = (await lerLinha(tenant, sessao.userId))!;
    const parada = !linha.ultima_abertura || t.getTime() - new Date(linha.ultima_abertura).getTime() > HORAS_ENTRE_SESSOES * 3_600_000;
    const nova = String(linha.ultima_sessao_hash ?? '') !== String(hashSessao) || parada;
    const sessoes = Number(linha.sessoes) + (nova ? 1 : 0);
    // Regras que o sistema não reconhece mais (atualização) viram "obsoletas": param de rodar e a pessoa é avisada UMA vez.
    const rec = jsonObj(linha.receitas); const avisos = jsonArr(linha.avisos).slice(); let mudouRec = false;
    for (const [id, r] of Object.entries(rec)) {
      const a = reavaliarReceita(r);
      if (!a.valida && !(r as any).obsoleta) { rec[id] = { ...(r as any), obsoleta: true, motivoObsoleta: a.motivo }; avisos.push({ id: `obsoleta:${id}`, texto: `Uma regra sua ficou obsoleta porque o sistema mudou e eu a pausei: ${String((r as any)?.gatilho?.tipo === 'abrir_tela' ? `ao abrir ${rotuloDaTela((r as any).gatilho.tela)}` : 'ao entrar no sistema')}. Veja em Meu jeito.`, em: t.toISOString() }); mudouRec = true; }
      else if (a.valida && (r as any).obsoleta) { rec[id] = { ...a.receita, origem: a.receita!.origem }; mudouRec = true; }
    }
    await consultar(
      `UPDATE ${TABELA_JEITO} SET sessoes=$3, ultima_sessao_hash=$4, ultima_abertura=$5, avisos='[]'::jsonb${mudouRec ? ', receitas=$6::jsonb' : ''} WHERE tenant_id=$1 AND user_id=$2`,
      mudouRec ? [tenant, sessao.userId, sessoes, hashSessao, t.toISOString(), JSON.stringify(rec)] : [tenant, sessao.userId, sessoes, hashSessao, t.toISOString()]);
    const visao = montarVisao(sessao, { ...linha, receitas: rec, sessoes }, await lerLinha(tenant, USUARIO_ESCRITORIO));
    return {
      sessao: sessoes, novaSessao: nova,
      boasVindas: nova ? textoBoasVindas(sessoes) : null,
      avisos: avisos.map((a) => String(a?.texto ?? '')).filter(Boolean).slice(0, 5),
      sugestao: visao.sugestoes[0] ? { id: visao.sugestoes[0].id, texto: visao.sugestoes[0].texto } : null,
      efetivo: visao.efetivo, receitasAtivas: receitasAtivas(visao),
    };
  }

  async function salvarPreferencia(sessao: SessaoJeito, entrada: { chave: unknown; valor: unknown; escopo?: unknown }) {
    await garantirTabelas();
    const escopo = entrada.escopo === 'escritorio' ? 'escritorio' : 'usuario';
    const v = validarPreferencia(entrada.chave, entrada.valor);
    if (falhou(v)) throw new ErroJeito(400, v.motivo, v.protegido === true);
    if (escopo === 'escritorio') {
      if (!sessao.administrador) throw new ErroJeito(403, 'Só o administrador do escritório muda o jeito padrão do escritório.');
      if (!PREFERENCIAS[v.chave].escopoEscritorio) throw new ErroJeito(400, `"${PREFERENCIAS[v.chave].rotulo}" é pessoal e não pode virar padrão do escritório.`);
    }
    const tenant = tenantDe(sessao); const user = escopo === 'escritorio' ? USUARIO_ESCRITORIO : sessao.userId;
    await garantirLinha(tenant, user);
    await consultar(
      `UPDATE ${TABELA_JEITO} SET preferencias=jsonb_set(preferencias, ARRAY['valores',$3::text], $4::jsonb, true), versao=versao+1, atualizado_em=now()${v.chave === 'observarUso' && v.valor === false && escopo === 'usuario' ? `, observacoes='{}'::jsonb` : ''} WHERE tenant_id=$1 AND user_id=$2`,
      [tenant, user, v.chave, JSON.stringify(v.valor)]);
    return ler(sessao);
  }
  async function removerPreferencia(sessao: SessaoJeito, entrada: { chave: unknown; escopo?: unknown }) {
    await garantirTabelas();
    const k = String(entrada.chave ?? '');
    if (!Object.prototype.hasOwnProperty.call(PREFERENCIAS, k)) throw new ErroJeito(400, 'Não conheço essa preferência.');
    const escopo = entrada.escopo === 'escritorio' ? 'escritorio' : 'usuario';
    if (escopo === 'escritorio' && !sessao.administrador) throw new ErroJeito(403, 'Só o administrador do escritório muda o jeito padrão do escritório.');
    await consultar(
      `UPDATE ${TABELA_JEITO} SET preferencias=jsonb_set(preferencias, '{valores}', COALESCE(preferencias->'valores','{}'::jsonb) - $3::text, true), versao=versao+1, atualizado_em=now() WHERE tenant_id=$1 AND user_id=$2`,
      [tenantDe(sessao), escopo === 'escritorio' ? USUARIO_ESCRITORIO : sessao.userId, k]);
    return ler(sessao);
  }

  async function salvarReceita(sessao: SessaoJeito, entrada: { gatilho: unknown; acoes: unknown }, origem: 'ensinada' | 'sugerida' = 'ensinada') {
    await garantirTabelas();
    const v = validarReceita({ gatilho: entrada.gatilho, acoes: entrada.acoes });
    if (falhou(v)) throw new ErroJeito(400, v.motivo, v.protegido === true);
    const tenant = tenantDe(sessao);
    await garantirLinha(tenant, sessao.userId);
    const r: Receita = { id: v.id, gatilho: v.gatilho, acoes: v.acoes, origem, criadaEm: agora().toISOString() };
    await consultar(`UPDATE ${TABELA_JEITO} SET receitas=receitas || jsonb_build_object($3::text, $4::jsonb), atualizado_em=now() WHERE tenant_id=$1 AND user_id=$2`, [tenant, sessao.userId, r.id, JSON.stringify(r)]);
    return ler(sessao);
  }
  async function removerReceita(sessao: SessaoJeito, id: unknown) {
    await garantirTabelas();
    const rid = String(id ?? '');
    if (!ID_RECEITA.test(rid)) throw new ErroJeito(400, 'Regra inválida.');
    await consultar(`UPDATE ${TABELA_JEITO} SET receitas=receitas - $3::text, atualizado_em=now() WHERE tenant_id=$1 AND user_id=$2`, [tenantDe(sessao), sessao.userId, rid]);
    return ler(sessao);
  }

  /** Conta quantas vezes a pessoa foi de uma tela para outra. Só ids de telas do catálogo; nada digitado. */
  async function observar(sessao: SessaoJeito, pares: unknown): Promise<{ aceitos: number; ignorado: boolean }> {
    await garantirTabelas();
    const tenant = tenantDe(sessao);
    const linha = await lerLinha(tenant, sessao.userId);
    const efetivo = montarVisao(sessao, linha, await lerLinha(tenant, USUARIO_ESCRITORIO)).efetivo;
    if (efetivo.observarUso === false) return { aceitos: 0, ignorado: true };
    const soma = new Map<string, number>();
    for (const p of jsonArr(pares).slice(0, 50)) if (p && parValido(p.de, p.para)) soma.set(`${p.de}>${p.para}`, (soma.get(`${p.de}>${p.para}`) || 0) + 1);
    if (!soma.size) return { aceitos: 0, ignorado: false };
    await garantirLinha(tenant, sessao.userId);
    for (const [chave, n] of soma) {
      await consultar(`UPDATE ${TABELA_JEITO} SET observacoes=jsonb_set(observacoes, ARRAY[$3::text], to_jsonb(LEAST(10000, COALESCE((observacoes->>$3::text)::int,0)+$4::int)), true) WHERE tenant_id=$1 AND user_id=$2`, [tenant, sessao.userId, chave, n]);
    }
    return { aceitos: [...soma.values()].reduce((a, b) => a + b, 0), ignorado: false };
  }

  async function sugestaoPorId(sessao: SessaoJeito, id: unknown): Promise<Sugestao> {
    const tenant = tenantDe(sessao);
    const linha = await lerLinha(tenant, sessao.userId);
    const s = calcularSugestoes(jsonObj(linha?.observacoes), jsonObj(linha?.receitas), jsonArr(linha?.sugestoes_dispensadas).map(String)).find((x) => x.id === String(id ?? ''));
    if (!s) throw new ErroJeito(404, 'Essa sugestão não existe mais.');
    return s;
  }
  /** O "sim" da pessoa a uma sugestão: só aqui a sugestão vira regra. */
  async function aceitarSugestao(sessao: SessaoJeito, id: unknown) {
    await garantirTabelas();
    const s = await sugestaoPorId(sessao, id);
    return salvarReceita(sessao, s.receita, 'sugerida');
  }
  async function dispensarSugestao(sessao: SessaoJeito, id: unknown) {
    await garantirTabelas();
    const sid = String(id ?? '');
    if (!/^atalho:[a-z-]+>[a-z-]+$/.test(sid)) throw new ErroJeito(400, 'Sugestão inválida.');
    const tenant = tenantDe(sessao);
    await garantirLinha(tenant, sessao.userId);
    const linha = (await lerLinha(tenant, sessao.userId))!;
    const lista = jsonArr(linha.sugestoes_dispensadas).map(String);
    if (!lista.includes(sid)) await consultar(`UPDATE ${TABELA_JEITO} SET sugestoes_dispensadas=$3::jsonb WHERE tenant_id=$1 AND user_id=$2`, [tenant, sessao.userId, JSON.stringify([...lista, sid].slice(-50))]);
    return ler(sessao);
  }

  /** Instruções que a Agente recebe para trabalhar do jeito da pessoa (sem custo: só texto). */
  async function paraAgente(sessao: SessaoJeito): Promise<{ instrucao: string; confirmacaoResumida: boolean }> {
    const v = await ler(sessao);
    const detalhado = v.efetivo.nivelConversa === 'detalhado';
    return {
      instrucao: detalhado ? '\n\nJEITO DESTA PESSOA: ela prefere respostas mais detalhadas (explique o porquê e o passo a passo, em até 6 frases curtas), no lugar de respostas curtas. Isso não muda confirmações, cálculos nem proteções.' : '',
      confirmacaoResumida: v.efetivo.confirmacaoNaoProtegida === 'resumida',
    };
  }

  /**
   * Robô conferidor "meu_jeito": (1) confere as regras guardadas contra o catálogo de hoje (obsoleta: pausa e avisa na próxima abertura);
   * (2) limpa: pessoas que não existem mais, hash de sessão parado há mais de 7 dias, contagens de telas que não existem mais e sugestões velhas.
   * Nunca apaga regra nem preferência de quem ainda existe.
   */
  async function conferir() {
    await garantirTabelas();
    const t = agora();
    const linhas = (await consultar(`SELECT * FROM ${TABELA_JEITO} ORDER BY tenant_id, user_id LIMIT 20000`)).rows;
    let regras = 0; let novasObsoletas = 0; let voltaramAValer = 0; let avisosNovos = 0; let removidas = 0; let hashesLimpos = 0; let contagensLimpas = 0; let falhas = 0;
    const existentes = new Set((await consultar(`SELECT id::text AS id FROM contabil_auth_users`)).rows.map((r) => String(r.id)));
    for (const l of linhas) {
      try {
        const user = String(l.user_id); const tenant = String(l.tenant_id);
        if (user !== USUARIO_ESCRITORIO && !existentes.has(user)) {
          await consultar(`DELETE FROM ${TABELA_JEITO} WHERE tenant_id=$1 AND user_id=$2`, [tenant, user]); removidas += 1; continue;
        }
        const rec = jsonObj(l.receitas); const avisos = jsonArr(l.avisos).slice(); let mudou = false;
        for (const [id, r] of Object.entries(rec)) {
          regras += 1; const a = reavaliarReceita(r);
          if (!a.valida && !(r as any)?.obsoleta) { rec[id] = { ...(r as any), obsoleta: true, motivoObsoleta: a.motivo }; novasObsoletas += 1; mudou = true;
            const quando = (r as any)?.gatilho?.tipo === 'abrir_tela' ? `ao abrir ${rotuloDaTela((r as any).gatilho.tela)}` : 'ao entrar no sistema';
            if (!avisos.some((x) => x?.id === `obsoleta:${id}`)) { avisos.push({ id: `obsoleta:${id}`, texto: `Uma regra sua ficou obsoleta porque o sistema mudou e eu a pausei: ${quando}. Veja em Meu jeito.`, em: t.toISOString() }); avisosNovos += 1; } }
          else if (a.valida && (r as any)?.obsoleta) { rec[id] = a.receita; voltaramAValer += 1; mudou = true; }
        }
        const obs = jsonObj(l.observacoes); const obsLimpa: Record<string, number> = {}; let limpou = false;
        for (const [k, v] of Object.entries(obs)) { const m = CHAVE_PAR.exec(k); if (m && parValido(m[1], m[2]) && Number(v) >= 1) obsLimpa[k] = Number(v); else { limpou = true; contagensLimpas += 1; } }
        const disp = jsonArr(l.sugestoes_dispensadas).map(String); const dispLimpa = disp.filter((s) => { const m = /^atalho:([a-z-]+)>([a-z-]+)$/.exec(s); return Boolean(m && parValido(m[1], m[2])); });
        const hashVelho = Boolean(l.ultima_sessao_hash) && Boolean(l.ultima_abertura) && t.getTime() - new Date(l.ultima_abertura).getTime() > DIAS_HASH_SESSAO * 86_400_000;
        if (hashVelho) hashesLimpos += 1;
        if (mudou || limpou || dispLimpa.length !== disp.length || hashVelho) {
          await consultar(`UPDATE ${TABELA_JEITO} SET receitas=$3::jsonb, avisos=$4::jsonb, observacoes=$5::jsonb, sugestoes_dispensadas=$6::jsonb${hashVelho ? ', ultima_sessao_hash=NULL' : ''} WHERE tenant_id=$1 AND user_id=$2`,
            [tenant, user, JSON.stringify(rec), JSON.stringify(avisos), JSON.stringify(obsLimpa), JSON.stringify(dispLimpa)]);
        }
      } catch (e) { falhas += 1; console.error('Robô Meu jeito: falha ao conferir uma linha:', e instanceof Error ? e.message : e); }
    }
    const resumo = linhas.length === 0 ? 'Nenhum jeito salvo ainda.'
      : `${linhas.length} jeito(s) conferido(s), ${regras} regra(s); ${novasObsoletas} ficou(aram) obsoleta(s) e foi(ram) pausada(s) com aviso; ${voltaramAValer} voltou(aram) a valer; limpeza: ${removidas} de pessoa(s) que não existe(m) mais, ${hashesLimpos} sessão(ões) antiga(s), ${contagensLimpas} contagem(ns) inválida(s)${falhas ? `; ${falhas} falha(s)` : ''}.`;
    return { linhas: linhas.length, regras, novasObsoletas, voltaramAValer, avisosNovos, removidas, hashesLimpos, contagensLimpas, falhas, resumo };
  }

  return { garantirTabelas, ler, abrir, salvarPreferencia, removerPreferencia, salvarReceita, removerReceita, observar, aceitarSugestao, dispensarSugestao, paraAgente, conferir };
}

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------
export type DepsRotasJeito = {
  servico: ReturnType<typeof criarServicoMeuJeito>;
  exigirSessao: (req: Request, res: Response, next: NextFunction) => unknown;
  exigirOrigem: (req: Request, res: Response, next: NextFunction) => unknown;
  sessao: (req: Request) => SessaoJeito | undefined;
  hashSessao: (req: Request) => string;
};

export function registrarRotasMeuJeito(app: Express, d: DepsRotasJeito): void {
  const base = '/api/meu-jeito';
  const tratar = (fn: (s: SessaoJeito, req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    try { await fn(s, req, res); }
    catch (e) {
      if (e instanceof ErroJeito) { res.status(e.status).json({ sucesso: false, motivo: e.message, protegido: e.protegido || undefined }); return; }
      console.error('Meu jeito:', e instanceof Error ? e.message : e);
      res.status(503).json({ sucesso: false, motivo: 'Não foi possível concluir agora. Tente de novo.' });
    }
  };
  const corpo = (req: Request): Record<string, any> => (req.body && typeof req.body === 'object' ? req.body : {});

  app.get(base, d.exigirSessao, tratar(async (s, _req, res) => { res.json({ sucesso: true, jeito: await d.servico.ler(s) }); }));
  app.post(`${base}/abrir`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { res.json({ sucesso: true, ...(await d.servico.abrir(s, d.hashSessao(req))) }); }));
  app.post(`${base}/observar`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { res.json({ sucesso: true, ...(await d.servico.observar(s, corpo(req).pares)) }); }));
  // Tudo por POST (a Agente IA só chama GET e POST nas rotas internas). Uma preferência ou uma regra por vez; não existe rota que apague tudo.
  app.post(`${base}/preferencias`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { const b = corpo(req); res.json({ sucesso: true, jeito: await d.servico.salvarPreferencia(s, { chave: b.chave, valor: b.valor, escopo: b.escopo }) }); }));
  app.post(`${base}/preferencias/remover`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { const b = corpo(req); res.json({ sucesso: true, jeito: await d.servico.removerPreferencia(s, { chave: b.chave, escopo: b.escopo }) }); }));
  app.post(`${base}/receitas`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { const b = corpo(req); res.json({ sucesso: true, jeito: await d.servico.salvarReceita(s, { gatilho: b.gatilho, acoes: b.acoes }) }); }));
  app.post(`${base}/receitas/remover`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { res.json({ sucesso: true, jeito: await d.servico.removerReceita(s, corpo(req).id) }); }));
  app.post(`${base}/sugestoes/aceitar`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { res.json({ sucesso: true, jeito: await d.servico.aceitarSugestao(s, corpo(req).id) }); }));
  app.post(`${base}/sugestoes/dispensar`, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => { res.json({ sucesso: true, jeito: await d.servico.dispensarSugestao(s, corpo(req).id) }); }));
}

export { SESSOES_COM_BOAS_VINDAS };
