// TOUR GUIADO DA MURAD e OFERTA DE AULA NA PRIMEIRA SEMANA (igual no DP, Fiscal e Contábil). Arquivo PURO: o navegador e os
// testes usam o mesmo código; nada aqui toca em tela, servidor ou banco.
//
// Pedido do dono (27/11/2026):
//  1) "Murad, me mostra o sistema": a Murad passeia sozinha pelas telas do menu principal, uma por vez. Em cada tela ela destaca a
//     área principal com a seta, fala UMA frase curta (só o resumo) e avança sozinha em 4 a 6 segundos. Tem Pausar, Próxima e
//     Sair do tour; se a pessoa mexer, pausa e volta sozinha depois de ~5 s parada. O tour SÓ NAVEGA E DESTACA: nunca clica em
//     botão (nem de abrir, nem de salvar, excluir, enviar ou fechar). No fim: "Quer uma aula de alguma tela? É só pedir."
//     As paradas vêm do mapa de telas de cada sistema (só destinos válidos; o teste e o robô conferidor do piloto conferem).
//  2) Nos primeiros 7 dias do escritório (data de criação do escritório, por escritório), ao abrir uma tela que tem aula na Escola,
//     um balãozinho discreto pergunta "Quer uma aula rápida desta tela?" [Sim] [Agora não] [Não perguntar mais]. Uma vez por tela
//     por usuário; a escolha fica guardada no aparelho, separada por escritório e por usuário.
import { semAcentoAgil } from './agenteAgil';

/** Texto sem acento e sem o "Murad" (e variações do reconhecimento de voz) do começo. */
function semChamada(texto: string): string {
  return semAcentoAgil(texto).replace(/^(ei |oi |o |ola )?(m[ou]u?rr?a(de|di|dy|d|te|ti|t|ch|j)|mu rade|mu rad|mo rad)\b\s*/, '').trim();
}

// ------------------------------------------------------------------------------------------------ eventos e frases
export const EVENTO_TOUR_INICIAR = 'murad:tour-iniciar';
export const EVENTO_TOUR_COMANDO = 'murad:tour-comando';
export const EVENTO_TOUR_MUDOU = 'murad:tour-mudou';
export const EVENTO_ABRIR_AULA = 'murad:escola-abrir-aula';

export const FRASE_INICIO_TOUR = 'Vou te mostrar o sistema, tela por tela. Para parar, diga "para" ou toque em Sair do tour.';
export const FRASE_FIM_TOUR = 'Quer uma aula de alguma tela? É só pedir.';
export const FRASE_OFERTA_AULA = 'Quer uma aula rápida desta tela?';
export const ROTULO_BOTAO_TOUR = 'Fazer tour';

/** Tempo de cada tela: 4 a 6 segundos, conforme o tamanho da frase. */
export const TOUR_MS_MIN = 4000;
export const TOUR_MS_MAX = 6000;
/** Pausou porque a pessoa mexeu: volta sozinho depois deste tempo parada (igual ao piloto). */
export const TOUR_RETOMAR_MS = 5000;
/** Frase de cada parada: curta (a voz fala só o resumo). */
export const TOUR_FALA_MAX = 120;

export function tempoDaParada(fala: string): number {
  const n = String(fala || '').length;
  return Math.max(TOUR_MS_MIN, Math.min(TOUR_MS_MAX, 2500 + n * 30));
}

// ------------------------------------------------------------------------------------------------ "me mostra o sistema"
const SISTEMA = '(o |a )?(sistema|programa|murad|murade|fiscal|dp|departamento pessoal|contabil|contabilidade)';
const RESTO = '( (todo|todinho|inteiro|completo|por inteiro|tela por tela|todas as telas))?( (pra|para) (mim|gente|nos))?( por favor| ai| agora)?';
const ABERTURA = '^(oi |ola |ei |ok |entao |por favor |agora )*';
const RE_TOUR = [
  new RegExp(`${ABERTURA}(me |nos )?(mostra|mostre|mostrar|apresenta|apresente|apresentar)( (pra|para) (mim|gente|nos))? ${SISTEMA}${RESTO}$`),
  new RegExp(`${ABERTURA}(me |nos )?(mostra|mostre|mostrar) (todas )?as telas( (do|da) (sistema|programa|murad|murade))?${RESTO}$`),
  new RegExp(`${ABERTURA}(quero |queria |preciso |vamos |bora )?(conhecer|ver) ${SISTEMA}( (todo|inteiro|completo|tela por tela))?( por favor)?$`),
  /\b(faz|faca|fazer|faze|quero|queria|comeca|comecar|inicia|iniciar|abre|abrir|vamos|bora|me da|da)( um| o| uma)? (tour|passeio|visita guiada)\b/,
  /^(o |um )?(tour|passeio)( guiado| pelo sistema| do sistema| pelas telas)?( por favor)?$/,
];
/** "Murad, me mostra o sistema", "mostra o sistema todo", "me apresenta o sistema", "faz um tour"... (não confunde com "me mostra onde fica"). */
export function ehPedidoDeTour(texto: string): boolean {
  const t = semChamada(texto);
  if (!t || t.split(' ').length > 12) return false;
  // "o que o sistema faz" é a apresentação falada (outra função); "me mostra onde" é o "me leva lá".
  if (/\b(o que|oque|oq|onde|aonde|como)\b/.test(t)) return false;
  return RE_TOUR.some((re) => re.test(t));
}

export type ComandoTour = 'pausar' | 'continuar' | 'proxima' | 'anterior' | 'sair';
/** Comandos falados ou digitados com o tour andando ("próxima", "volta", "sair do tour"). "Para" e "continua" passam pelo PARAR da Agente. */
export function comandoDoTour(texto: string): ComandoTour | null {
  const t = semChamada(texto);
  if (!t || t.split(' ').length > 6) return null;
  if (/^(sai|sair|saia|termina|terminar|encerra|encerrar|fecha|fechar|acaba|acabar|cancela|cancelar|chega)( d[oe]| o)?( (tour|passeio))?( por favor)?$/.test(t)) return 'sair';
  if (/^(proxima|proximo|pula|pular|pule|avanca|avancar|avance|passa|passar|passe|segue|seguinte)( tela| pagina| essa| esta)?( por favor)?$/.test(t)) return 'proxima';
  if (/^(volta|voltar|volte|anterior|tela anterior|a anterior)( uma)?( tela)?( por favor)?$/.test(t)) return 'anterior';
  if (/^(pausa|pausar|pause|pausa o tour|espera|espere)( ai| um pouco| o tour)?$/.test(t)) return 'pausar';
  if (/^(continua|continuar|continue|pode continuar|retoma|retomar|segue o tour|continua o tour)( o tour| por favor)?$/.test(t)) return 'continuar';
  return null;
}
export const FRASE_DO_COMANDO: Record<ComandoTour, string> = {
  pausar: 'Pausei o tour. Diga "continua" quando quiser.',
  continuar: 'Certo, continuando o tour.',
  proxima: 'Próxima tela.',
  anterior: 'Voltando uma tela.',
  sair: 'Certo, saí do tour.',
};

// ------------------------------------------------------------------------------------------------ paradas
export interface ParadaTour {
  /** Id da tela (o mesmo que o sistema usa para navegar). */
  rota: string;
  /** Nome que aparece no menu. */
  nome: string;
  /** Uma frase curta: o que é a tela. */
  fala: string;
  /** Seletor do item do menu (só para a seta passar por ele; o tour nunca clica). */
  menu?: string | null;
  /** Seletor da área principal desta tela (painel), quando o mapa tem um. Sem ele, destaca a área de conteúdo do sistema. */
  destaque?: string | null;
}
export interface ItemParaTour { rota: string; nome: string; texto: string; menu?: string | null; destaque?: string | null; fala?: string }

/** Primeira frase, cortada em até `max` letras (sem cortar palavra), terminando com ponto. */
export function falaCurta(texto: string, max = TOUR_FALA_MAX): string {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return '';
  const primeira = (/^(.+?[.!?])(\s|$)/.exec(limpo)?.[1] || limpo).trim();
  if (primeira.length <= max) return /[.!?]$/.test(primeira) ? primeira : `${primeira}.`;
  const corte = primeira.slice(0, max);
  const ate = Math.max(corte.lastIndexOf(','), corte.lastIndexOf(';'), corte.lastIndexOf(':'));
  const base = (ate > max * 0.5 ? corte.slice(0, ate) : corte.slice(0, corte.lastIndexOf(' ') > 0 ? corte.lastIndexOf(' ') : max)).replace(/[\s,;:(–-]+$/, '');
  return `${base}.`;
}

/** Monta as paradas na ordem do menu, sem repetir tela e sem as que ficaram de fora (restritas, a própria Escola...). */
export function montarParadas(itens: ItemParaTour[], pular: Iterable<string> = []): ParadaTour[] {
  const fora = new Set(pular);
  const vistos = new Set<string>();
  const paradas: ParadaTour[] = [];
  for (const i of itens) {
    if (!i.rota || fora.has(i.rota) || vistos.has(i.rota)) continue;
    vistos.add(i.rota);
    paradas.push({ rota: i.rota, nome: i.nome, fala: falaCurta(i.fala || i.texto), menu: i.menu ?? null, destaque: i.destaque ?? null });
  }
  return paradas;
}

/** O que está errado nas paradas (vazio = tudo certo): destino que não existe, repetido, sem nome ou com frase vazia/longa. */
export function conferirParadasTour(paradas: ParadaTour[], rotasValidas: Iterable<string>): string[] {
  const validas = new Set(rotasValidas);
  const problemas: string[] = [];
  const vistas = new Set<string>();
  if (!paradas.length) problemas.push('Tour sem nenhuma parada.');
  for (const p of paradas) {
    if (!validas.has(p.rota)) problemas.push(`Tour: a parada "${p.nome || p.rota}" aponta para a tela "${p.rota}", que não existe.`);
    if (vistas.has(p.rota)) problemas.push(`Tour: a tela "${p.rota}" aparece duas vezes.`);
    vistas.add(p.rota);
    if (!String(p.nome || '').trim()) problemas.push(`Tour: a parada "${p.rota}" está sem nome.`);
    if (!String(p.fala || '').trim()) problemas.push(`Tour: a parada "${p.rota}" está sem frase.`);
    else if (p.fala.length > TOUR_FALA_MAX + 1) problemas.push(`Tour: a frase da parada "${p.rota}" passou de ${TOUR_FALA_MAX} letras.`);
  }
  return problemas;
}

/** Aulas cujo "Me mostra" aponta para tela que não existe (vazio = tudo certo). */
export function conferirAulasNasTelas(aulas: Array<{ id: string; meMostra: { tela: string } }>, rotasValidas: Iterable<string>): string[] {
  const validas = new Set(rotasValidas);
  return aulas.filter((a) => !validas.has(a.meMostra.tela)).map((a) => `Aula "${a.id}": o "Me mostra" aponta para a tela "${a.meMostra.tela}", que não existe.`);
}

// ------------------------------------------------------------------------------------------------ máquina do tour
export type EstadoTour = 'inativo' | 'andando' | 'pausado' | 'fim';
export interface SituacaoTour { estado: EstadoTour; indice: number; total: number; /** Pausou porque a pessoa mexeu (volta sozinho). */ pausaPorMexer: boolean }
export type EventoTour = 'iniciar' | 'tempo' | 'mexeu' | 'retomar_sozinho' | 'encerrar' | ComandoTour;
export const SITUACAO_INICIAL: SituacaoTour = { estado: 'inativo', indice: 0, total: 0, pausaPorMexer: false };

export function transicaoTour(s: SituacaoTour, e: EventoTour, total: number = s.total): SituacaoTour {
  if (e === 'iniciar') return total > 0 ? { estado: 'andando', indice: 0, total, pausaPorMexer: false } : { ...SITUACAO_INICIAL };
  if (s.estado === 'inativo') return s;
  if (e === 'sair' || e === 'encerrar') return { ...SITUACAO_INICIAL };
  if (s.estado === 'fim') return s;
  const avancar = (): SituacaoTour => (s.indice + 1 >= s.total ? { ...s, estado: 'fim', pausaPorMexer: false } : { ...s, indice: s.indice + 1, estado: 'andando', pausaPorMexer: false });
  switch (e) {
    case 'tempo': return s.estado === 'andando' ? avancar() : s;
    case 'proxima': return avancar();
    case 'anterior': return { ...s, indice: Math.max(0, s.indice - 1), estado: 'andando', pausaPorMexer: false };
    case 'pausar': return s.estado === 'andando' || s.pausaPorMexer ? { ...s, estado: 'pausado', pausaPorMexer: false } : s;
    case 'mexeu': return s.estado === 'andando' ? { ...s, estado: 'pausado', pausaPorMexer: true } : s;
    case 'retomar_sozinho': return s.estado === 'pausado' && s.pausaPorMexer ? { ...s, estado: 'andando', pausaPorMexer: false } : s;
    case 'continuar': return s.estado === 'pausado' ? { ...s, estado: 'andando', pausaPorMexer: false } : s;
    default: return s;
  }
}
/** Volta sozinho: pausou porque a pessoa mexeu, ela ficou ~5 s parada e não está digitando num campo. */
export function tourPodeRetomar(s: SituacaoTour, msDesdeUltimaInteracao: number, digitandoEmCampo: boolean): boolean {
  return s.estado === 'pausado' && s.pausaPorMexer && !digitandoEmCampo && msDesdeUltimaInteracao >= TOUR_RETOMAR_MS;
}

// ------------------------------------------------------------------------------------------------ oferta de aula (primeira semana)
export const OFERTA_AULA_DIAS = 7;
export type RespostaOfertaAula = 'sim' | 'agora_nao' | 'nunca' | 'mostrada';
export interface EstadoOfertaAula { telas: Record<string, RespostaOfertaAula>; nunca: boolean }
export const chaveOfertaAula = (escritorio: string, usuario: string): string => `murad_oferta_aula_v1:${escritorio || 'escritorio'}:${usuario || 'aparelho'}`;
export function lerEstadoOfertaAula(json: string | null | undefined): EstadoOfertaAula {
  try {
    const s = JSON.parse(String(json || 'null'));
    if (s && typeof s === 'object') return { telas: s.telas && typeof s.telas === 'object' ? s.telas : {}, nunca: s.nunca === true };
  } catch { /* guardado estragado: começa de novo */ }
  return { telas: {}, nunca: false };
}
export function dentroDaPrimeiraSemana(criadoEmIso: string | null | undefined, agoraMs: number): boolean {
  const t = Date.parse(String(criadoEmIso || ''));
  if (!Number.isFinite(t)) return false; // sem a data do escritório não oferece (não chuta)
  return agoraMs >= t - 60_000 && agoraMs - t <= OFERTA_AULA_DIAS * 24 * 60 * 60_000;
}
export function deveOferecerAula(p: { criadoEm: string | null | undefined; agoraMs: number; tela: string; temAula: boolean; estado: EstadoOfertaAula; ocupado: boolean }): boolean {
  if (!p.tela || !p.temAula || p.ocupado || p.estado.nunca) return false;
  if (p.estado.telas[p.tela]) return false; // uma vez por tela por usuário
  return dentroDaPrimeiraSemana(p.criadoEm, p.agoraMs);
}
export function registrarRespostaOfertaAula(e: EstadoOfertaAula, tela: string, r: RespostaOfertaAula): EstadoOfertaAula {
  return { telas: { ...e.telas, [tela]: r }, nunca: e.nunca || r === 'nunca' };
}
/** A aula da tela: a primeira aula da Escola cujo "Me mostra" abre esta tela. */
export function aulaDaTela<T extends { id: string; meMostra: { tela: string } }>(aulas: readonly T[], tela: string): T | null {
  return aulas.find((a) => a.meMostra.tela === tela) || null;
}
