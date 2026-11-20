// ESCOLA MURADE — núcleo PURO (igual no Fiscal e no Contábil; nasceu no Murade DP). Sem importar nada do servidor:
// o navegador usa para conduzir a aula e o simulador, o servidor usa para corrigir de novo (nunca confia na nota da tela).
//
//  - Tipos das trilhas, aulas, perguntas, glossário e "Me mostra no sistema".
//  - Questionário: correção e explicação de quem errou.
//  - Simulador (empresa de TREINO, nunca grava dado real) em 3 fases:
//      1) DEMONSTRAÇÃO falada pela Agente; 2) PRÁTICA GUIADA (avaliarAcaoGuiada: "Não, aí está errado. Confere direito: o certo é…");
//      3) PROVA sem dica (corrigirProva: campos, ordem dos passos, clique e resultado do motor real), com nota e nível.

// ---------------------------------------------------------------- conteúdo
export type TipoFonte = 'lei' | 'manual_oficial' | 'norma' | 'sistema';
export interface FonteAula { nome: string; url: string; tipo: TipoFonte }
export interface PerguntaAula { pergunta: string; opcoes: string[]; certa: number; explicacao: string }
/** "Me mostra no sistema": abre a tela (id do mapa de telas) e destaca um alvo dela. Só mostra: nunca preenche nem clica. */
export interface MeMostra { tela: string; alvo?: string; legenda: string }
export interface AulaEscola {
  id: string;
  trilha: string;
  titulo: string;
  /** "O que é isso?" — explicação curta, em português simples. */
  oQueE: string;
  /** "Por que existe?" */
  porQue: string;
  /** A regra, com o artigo da lei, uma por linha. */
  regras: string[];
  fontes: FonteAula[];
  /** Data (AAAA-MM-DD) em que as regras foram conferidas na fonte oficial. */
  conferidoEm: string;
  /** Exemplo calculado pelo motor do sistema no servidor (src/server/escolaExemplos.ts). Nunca número escrito à mão. */
  exemplo: string | null;
  meMostra: MeMostra;
  /** Prática em 3 fases no simulador de treino (src/data/escolaPratica.ts). */
  pratica: string | null;
  perguntas: PerguntaAula[];
}
export interface TrilhaEscola { id: string; titulo: string; resumo: string; icone: string }
export interface TermoGlossario { termo: string; sinonimos: string[]; explicacao: string; fonte: FonteAula; aula?: string }

export const q = (pergunta: string, opcoes: string[], certa: number, explicacao: string): PerguntaAula => ({ pergunta, opcoes, certa, explicacao });
export const normalizarEscola = (t: unknown): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Busca no glossário: nome do termo, sinônimos e (por último) a explicação. Do mais certo para o menos certo. */
export function buscarNoGlossario(glossario: TermoGlossario[], texto: string, limite = 8): TermoGlossario[] {
  const t = normalizarEscola(texto).replace(/^(me )?(explica|explique|o que e|o que significa|que e)( o| a| um| uma| os| as)? /, '').trim();
  if (!t) return glossario.slice(0, limite);
  const pontos = glossario.map((g) => {
    const nomes = [g.termo, ...g.sinonimos].map(normalizarEscola);
    let p = 0;
    if (nomes.some((n) => n === t)) p = 100;
    else if (nomes.some((n) => t.includes(n) && n.length >= 3)) p = 60 + Math.max(...nomes.filter((n) => t.includes(n)).map((n) => n.length)) / 100;
    else if (nomes.some((n) => n.includes(t))) p = 40;
    else if (t.length >= 4 && normalizarEscola(g.explicacao).includes(t)) p = 10;
    return { g, p };
  }).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
  return pontos.slice(0, limite).map((x) => x.g);
}

const PARADAS_AULA = new Set(['quero', 'estudar', 'aprender', 'aula', 'aulas', 'abre', 'abrir', 'sobre', 'trilha', 'como', 'funciona', 'para', 'que', 'uma', 'das', 'dos']);
/** Busca aula pelo título, id ou palavras (para a Agente: "abre a aula de DIFAL"). */
export function buscarAulaEm(aulas: AulaEscola[], trilhas: TrilhaEscola[], texto: string): AulaEscola | null {
  const t = normalizarEscola(texto);
  if (!t) return null;
  const direto = aulas.find((a) => a.id === t || normalizarEscola(a.titulo) === t);
  if (direto) return direto;
  const palavras = t.split(' ').filter((p) => p.length >= 3 && !PARADAS_AULA.has(p));
  let melhor: { a: AulaEscola; n: number } | null = null;
  for (const a of aulas) {
    const titulo = normalizarEscola(a.titulo);
    const trilha = normalizarEscola(trilhas.find((x) => x.id === a.trilha)?.titulo || '');
    const corpo = normalizarEscola(a.oQueE);
    // Palavra no título da própria aula vale mais que no título da trilha (que é igual para todas as aulas dela).
    const n = palavras.reduce((s, p) => s + (titulo.includes(p) ? 4 : trilha.includes(p) ? 2 : corpo.includes(p) ? 1 : 0), 0) + (titulo.includes(t) ? 5 : 0);
    if (n > 0 && (!melhor || n > melhor.n)) melhor = { a, n };
  }
  return melhor ? melhor.a : null;
}

/** Corrige o questionário de uma aula. Respostas = índice escolhido por pergunta. Nota de 0 a 10. */
export function corrigirQuestionario(aula: AulaEscola, respostas: number[]): { acertos: number; total: number; nota: number; erradas: Array<{ indice: number; explicacao: string; certa: string }> } {
  const erradas: Array<{ indice: number; explicacao: string; certa: string }> = [];
  aula.perguntas.forEach((p, i) => { if (respostas[i] !== p.certa) erradas.push({ indice: i, explicacao: p.explicacao, certa: p.opcoes[p.certa] }); });
  const total = aula.perguntas.length; const acertos = total - erradas.length;
  return { acertos, total, nota: Math.round((acertos / total) * 100) / 10, erradas };
}

// ---------------------------------------------------------------- simulador
export type TipoCampoSim = 'texto' | 'codigo' | 'numero' | 'moeda' | 'percentual' | 'data' | 'competencia' | 'select';
export interface CampoSim { id: string; rotulo: string; tipo: TipoCampoSim; opcoes?: Array<{ valor: string; rotulo: string }>; dica?: string }
export interface CenarioSim {
  id: string;
  /** O que a pessoa precisa fazer (com os dados). */
  enunciado: string;
  valores: Record<string, string>;
  /** Por que cada campo leva esse valor (a Agente fala na demonstração e elogia na prática guiada). */
  porque?: Record<string, string>;
}
export interface PraticaSim {
  id: string;
  titulo: string;
  /** Tela real que o simulador imita (id do mapa de telas). */
  telaReal: string;
  campos: CampoSim[];
  botao: { id: string; rotulo: string; porque: string };
  /** Resultados do motor de cálculo que a prova compara (chaves do resultado de simularPratica). */
  resultados: Array<{ chave: string; rotulo: string }>;
  demo: CenarioSim;
  guiada: CenarioSim;
  provas: CenarioSim[];
}
export interface PassoSim { tipo: 'preencher' | 'clicar'; alvo: string; rotulo: string }
export function passosDaPratica(p: PraticaSim): PassoSim[] {
  return [...p.campos.map((c) => ({ tipo: 'preencher' as const, alvo: c.id, rotulo: c.rotulo })), { tipo: 'clicar', alvo: p.botao.id, rotulo: p.botao.rotulo }];
}

const semAcento = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** "2.500,00", "2500", "2500.5", "R$ 2.500", "18%" → número. Vazio/inválido → NaN. */
export function numeroBR(v: unknown): number {
  let s = String(v ?? '').replace(/R\$|%|\s/g, '').trim();
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
/** "10/03/2026" ou "2026-03-10" → "2026-03-10" (data que existe no calendário). */
export function dataISO(v: unknown): string {
  const s = String(v ?? '').trim();
  let iso = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  else { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (!iso) return '';
  const [a, mm, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(a, mm - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === d ? iso : '';
}
/** Competência "10/2026" ou "2026-10" → "2026-10". */
export function competenciaISO(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  const m = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(s); return m ? `${m[2]}-${m[1].padStart(2, '0')}` : '';
}
export function valorNormalizado(campo: CampoSim, v: unknown): string {
  if (campo.tipo === 'numero' || campo.tipo === 'moeda' || campo.tipo === 'percentual') { const n = numeroBR(v); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : ''; }
  if (campo.tipo === 'data') return dataISO(v);
  if (campo.tipo === 'competencia') return competenciaISO(v);
  if (campo.tipo === 'select') return String(v ?? '').trim();
  if (campo.tipo === 'codigo') return String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return semAcento(v);
}
export function valoresIguais(campo: CampoSim, digitado: unknown, esperado: unknown): boolean {
  const a = valorNormalizado(campo, digitado); const b = valorNormalizado(campo, esperado);
  return a !== '' && a === b;
}
const reaisBR = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
/** Valor esperado escrito do jeito que a pessoa lê (R$ 2.500,00; 18%; 10/03/2026; 10/2026; rótulo da opção). */
export function valorParaLer(campo: CampoSim, v: string): string {
  if (campo.tipo === 'moeda') return reaisBR(numeroBR(v));
  if (campo.tipo === 'percentual') return `${String(numeroBR(v)).replace('.', ',')}%`;
  if (campo.tipo === 'numero') return String(numeroBR(v)).replace('.', ',');
  if (campo.tipo === 'data') return dataISO(v).split('-').reverse().join('/');
  if (campo.tipo === 'competencia') return competenciaISO(v).split('-').reverse().join('/');
  if (campo.tipo === 'select') return campo.opcoes?.find((o) => o.valor === v)?.rotulo || v;
  return v;
}

// ---------------------------------------------------------------- fase 2: detector de clique/campo errado
export interface AcaoAluno { tipo: 'foco' | 'preencher' | 'clicar'; alvo: string; valor?: string; em?: number }
export interface Avaliacao { certo: boolean; avancar: boolean; mensagem: string; alvoCerto: string | null }
const ELOGIOS = ['Isso mesmo!', 'Muito bem!', 'Certinho!', 'Perfeito!', 'Mandou bem!'];

/**
 * Prática guiada: confere a ação da pessoa contra o passo esperado (índice = passo atual).
 *  - foco num campo fora de ordem → "Não, aí está errado. Confere direito: o certo agora é ..." (a seta vai para o certo);
 *  - campo certo com valor errado → diz o valor certo; com valor certo → elogia e avança;
 *  - botão antes da hora → diz o campo que falta; na hora → elogia e avança.
 */
export function avaliarAcaoGuiada(p: PraticaSim, cenario: CenarioSim, indice: number, acao: AcaoAluno): Avaliacao {
  const passos = passosDaPratica(p);
  if (indice >= passos.length) return { certo: true, avancar: false, mensagem: 'Você já terminou esta prática.', alvoCerto: null };
  const esperado = passos[Math.max(0, indice)];
  const elogio = ELOGIOS[indice % ELOGIOS.length];
  if (acao.alvo !== esperado.alvo) {
    const qual = esperado.tipo === 'clicar' ? `o botão "${esperado.rotulo}"` : `o campo "${esperado.rotulo}"`;
    if (acao.tipo === 'clicar' && esperado.tipo === 'preencher') return { certo: false, avancar: false, mensagem: `Não, ainda não é hora de clicar. Confere direito: falta preencher ${qual}.`, alvoCerto: esperado.alvo };
    return { certo: false, avancar: false, mensagem: `Não, aí está errado. Confere direito: o certo agora é ${qual}.`, alvoCerto: esperado.alvo };
  }
  if (esperado.tipo === 'clicar') return { certo: true, avancar: true, mensagem: `${elogio} ${p.botao.porque}`, alvoCerto: null };
  if (acao.tipo === 'foco') return { certo: true, avancar: false, mensagem: '', alvoCerto: null };
  const campo = p.campos.find((c) => c.id === esperado.alvo)!;
  const certoValor = cenario.valores[campo.id];
  if (!valoresIguais(campo, acao.valor, certoValor)) {
    return { certo: false, avancar: false, mensagem: `Não, aí está errado. Confere direito: o certo é ${valorParaLer(campo, certoValor)}.`, alvoCerto: campo.id };
  }
  const porque = cenario.porque?.[campo.id] || p.demo.porque?.[campo.id] || '';
  return { certo: true, avancar: true, mensagem: `${elogio}${porque ? ` ${porque}` : ''}`, alvoCerto: null };
}

// ---------------------------------------------------------------- fase 3: correção da prova
export type NivelAluno = 'Iniciante' | 'Em formação' | 'Pronto para fazer com conferência' | 'Autônomo';
export const NIVEIS: NivelAluno[] = ['Iniciante', 'Em formação', 'Pronto para fazer com conferência', 'Autônomo'];
export interface ResultadoProva { nota: number; pontos: number; total: number; erros: string[]; acertos: string[]; nivel: NivelAluno; ordemCerta: boolean; calculou: boolean; resultadoConfere: boolean | null }

/** Nível de UMA prova pela nota (0 a 10). */
export function nivelDaNota(nota: number): NivelAluno {
  if (nota >= 9.5) return 'Autônomo';
  if (nota >= 8) return 'Pronto para fazer com conferência';
  if (nota >= 5) return 'Em formação';
  return 'Iniciante';
}

/** Nível geral do aluno: pela ÚLTIMA nota de cada prática; "Autônomo" exige 3 práticas diferentes com 9,5 ou mais. */
export function nivelGeral(provas: Array<{ pratica: string; nota: number; em: string }>): NivelAluno {
  const ultima = new Map<string, { nota: number; em: string }>();
  for (const p of provas) { const u = ultima.get(p.pratica); if (!u || p.em > u.em) ultima.set(p.pratica, { nota: p.nota, em: p.em }); }
  const notas = [...ultima.values()].map((x) => x.nota);
  if (!notas.length) return 'Iniciante';
  const media = notas.reduce((a, b) => a + b, 0) / notas.length;
  const nivel = nivelDaNota(media);
  if (nivel === 'Autônomo' && notas.filter((n) => n >= 9.5).length < 3) return 'Pronto para fazer com conferência';
  return nivel;
}

function mesmoResultado(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.005;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Corrige a prova. Pontos: 1 por campo certo, 1 pela ordem dos passos, 1 por ter calculado e 2 pelo resultado do motor
 * (comparado com o resultado esperado do cenário; null = o cálculo não foi possível com o que a pessoa digitou).
 * Os erros só aparecem no fim (a prova não dá dica no meio).
 */
export function corrigirProva(p: PraticaSim, cenario: CenarioSim, acoes: AcaoAluno[], valoresFinais: Record<string, string>,
  resultados: { esperado: Record<string, unknown> | null; obtido: Record<string, unknown> | null }): ResultadoProva {
  const erros: string[] = []; const acertos: string[] = [];
  let pontos = 0;
  for (const c of p.campos) {
    if (valoresIguais(c, valoresFinais[c.id], cenario.valores[c.id])) { pontos += 1; acertos.push(`${c.rotulo} certo.`); }
    else erros.push(`${c.rotulo}: você colocou "${String(valoresFinais[c.id] ?? '').trim() || '(vazio)'}", o certo era ${valorParaLer(c, cenario.valores[c.id])}.`);
  }
  // Ordem: a sequência da 1ª vez em que cada campo foi preenchido precisa seguir a ordem da tela; o botão vem por último.
  const ordemTela = p.campos.map((c) => c.id);
  const primeiraVez: string[] = [];
  for (const a of acoes) if (a.tipo === 'preencher' && ordemTela.includes(a.alvo) && !primeiraVez.includes(a.alvo)) primeiraVez.push(a.alvo);
  const idxClique = acoes.findIndex((a) => a.tipo === 'clicar' && a.alvo === p.botao.id);
  const calculou = idxClique >= 0;
  const preencheuDepois = calculou && acoes.slice(idxClique + 1).some((a) => a.tipo === 'preencher');
  const naOrdem = primeiraVez.every((id, i) => i === 0 || ordemTela.indexOf(id) > ordemTela.indexOf(primeiraVez[i - 1]));
  const ordemCerta = naOrdem && primeiraVez.length === ordemTela.length && !preencheuDepois;
  if (ordemCerta) { pontos += 1; acertos.push('Passos na ordem certa.'); }
  else erros.push(primeiraVez.length < ordemTela.length ? 'Faltou preencher campo antes de terminar.' : preencheuDepois ? `Você mudou campo depois de clicar em "${p.botao.rotulo}": confira tudo antes de calcular.` : 'Os campos não foram preenchidos na ordem da tela.');
  if (calculou) { pontos += 1; acertos.push(`Clicou em "${p.botao.rotulo}".`); } else erros.push(`Faltou clicar em "${p.botao.rotulo}".`);
  let resultadoConfere: boolean | null = null;
  if (resultados.esperado && resultados.obtido && calculou) {
    const difs = p.resultados.filter((r) => !mesmoResultado(resultados.esperado![r.chave], resultados.obtido![r.chave]));
    resultadoConfere = difs.length === 0;
    if (resultadoConfere) { pontos += 2; acertos.push('O resultado do cálculo confere.'); }
    else erros.push(`O resultado não confere em: ${difs.map((d) => d.rotulo).join(', ')} (por causa dos dados digitados).`);
  } else if (calculou) { resultadoConfere = false; erros.push('Com os dados digitados o sistema não conseguiu calcular.'); }
  const total = p.campos.length + 4;
  const nota = Math.round((pontos / total) * 100) / 10;
  return { nota, pontos, total, erros, acertos, nivel: nivelDaNota(nota), ordemCerta, calculou, resultadoConfere };
}

/** Texto curto do valor de um resultado do motor (para a tela do simulador). */
export function formatarResultado(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 400 ? String(v) : reaisBR(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (v === null || v === undefined) return '—';
  return String(v);
}
