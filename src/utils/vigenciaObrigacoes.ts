// Vigência das obrigações, guias e cálculos dos três sistemas Murad (Fiscal, DP e Contábil) — LISTA ÚNICA.
// O MESMO arquivo existe nos três repositórios (src/utils/vigenciaObrigacoes.ts); um teste em cada um confere que a lista é igual.
//
// Regras (pedido do dono):
// - Só fonte oficial. Sem fonte, NÃO se marca fim (fim = null): a obrigação continua como está.
// - O que acaba sai sozinho dos PERÍODOS NOVOS (menu, vencimentos, robôs de geração e avisos). Os períodos antigos ficam escondidos
//   em "Obrigações encerradas", disponíveis para retificar, consultar e entregar em atraso (ex.: a EFD-Contribuições de dez/2026
//   ainda é entregue em 2027).
// - Depois do prazo de 5 anos (CTN, art. 150, § 4º, e art. 173, I) o período sai de vez. O sistema conta pelo art. 173, I (o mais longo):
//   5 anos a partir do 1º dia do exercício seguinte ao do vencimento. Para não sair cedo, o ano do vencimento é estimado para o
//   caso mais tardio (até 2 meses depois da competência).
// - Nunca apaga código nem dado: só esconde e desliga por data.

export type SistemaMurad = 'fiscal' | 'dp' | 'contabil';
export type TipoItemVigencia = 'obrigacao' | 'guia' | 'calculo';
export interface FonteVigencia { nome: string; url: string }
export interface ItemVigencia {
  id: string; nome: string; tipo: TipoItemVigencia; sistemas: SistemaMurad[];
  /** Primeiro período de apuração (AAAA-MM) em que existe. null = já existia antes do sistema. */
  inicio: string | null;
  /** Último período de apuração (AAAA-MM). null = sem fim com fonte oficial (continua). */
  fim: string | null;
  fonteInicio: FonteVigencia | null; fonteFim: FonteVigencia | null;
  /** Mudança que não acaba com a obrigação (ex.: IPI a zero, menos na Zona Franca). */
  mudanca?: { em: string; texto: string; fonte: FonteVigencia };
  /** O que continua depois do fim (retificação, saldos, comprovante...). */
  continua?: string;
  substituidaPor?: string;
  /** O que ainda não tem fonte oficial clara (fica visível para o contador; nada é calculado com isso). */
  pendencia?: string;
  /** Item do Planejamento da Reforma (Fiscal, src/utils/prazosReforma.ts) que já fala desta data — o aviso aponta para ele, sem duplicar. */
  prazoReforma?: string;
}

export const FONTES_VIGENCIA = {
  nt11: { nome: 'Receita Federal (SPED) — Nota Técnica nº 011/2026: descontinuidade da EFD-Contribuições, orientações para os contribuintes do PIS/Cofins', url: 'https://www.gov.br/sped/pt-br/assuntos/comunicados/efd-contribuicoes' },
  ec132_126: { nome: 'Emenda Constitucional 132/2023, art. 126', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm' },
  ec132_127: { nome: 'Emenda Constitucional 132/2023, art. 127', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm' },
  ec132_129: { nome: 'Emenda Constitucional 132/2023, art. 129', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm' },
  dirf: { nome: 'Receita Federal (Agência Gov, 15/03/2024) — IN RFB 2.181/2024: a DIRF é substituída pelo eSocial e pela EFD-Reinf para os fatos a partir de 1º/01/2025', url: 'https://agenciagov.ebc.com.br/noticias/202403/comunicado-receita-federal-prorroga-para-2025-a-extincao-da-declaracao-do-imposto-sobre-a-renda-retido-na-fonte' },
  cprb: { nome: 'Lei 12.546/2011, arts. 9º-A e 9º-B (incluídos pela Lei 14.973/2024): CPRB nos exercícios de 2025 a 2027', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14973.htm' },
  ctn: { nome: 'Código Tributário Nacional, arts. 150, § 4º, e 173, I', url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm' },
} as const satisfies Record<string, FonteVigencia>;

export const VIGENCIA_OBRIGACOES: ItemVigencia[] = [
  { id: 'efd_contribuicoes', nome: 'EFD-Contribuições', tipo: 'obrigacao', sistemas: ['fiscal'], inicio: null, fim: '2026-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.nt11,
    continua: 'Entrega em atraso, retificação e consulta dos períodos até dezembro de 2026, e o controle dos saldos credores de PIS/Cofins gerados até 31/12/2026. A partir de janeiro de 2027 ela não é usada para fatos geradores novos; em 2027 só continua para casos específicos (receita pelo regime de caixa de fatos anteriores, saldos credores e créditos presumidos de CBS — Nota Técnica EFD-Contribuições nº 013/2026), que o calendário não cobra sozinho: confira se a empresa tem algum deles.', substituidaPor: 'CBS' },
  { id: 'pis_cofins', nome: 'PIS e Cofins (apuração, DARF e provisão no Contábil)', tipo: 'guia', sistemas: ['fiscal', 'dp', 'contabil'], inicio: null, fim: '2026-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.ec132_126,
    continua: 'Os períodos até dezembro de 2026 continuam: DARF em atraso, retificação e consulta.', substituidaPor: 'CBS', prazoReforma: 'inicio-2027' },
  { id: 'pis_folha', nome: 'PIS sobre a folha (entidade sem fins lucrativos)', tipo: 'guia', sistemas: ['dp'], inicio: null, fim: null, fonteInicio: null, fonteFim: null,
    pendencia: 'A EC 132/2023 (art. 126, II) extingue o PIS do art. 239 a partir de 2027, mas não achamos texto oficial que diga como fica o PIS de 1% sobre a folha das entidades. Sem fonte, ele continua no sistema até a Receita confirmar.' },
  { id: 'dirf', nome: 'DIRF', tipo: 'obrigacao', sistemas: ['dp', 'fiscal'], inicio: null, fim: '2024-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.dirf,
    continua: 'A DIRF do ano-calendário 2024 e anteriores ainda pode ser retificada ou entregue em atraso no programa da Receita. O comprovante de rendimentos ao funcionário continua obrigatório.', substituidaPor: 'eSocial e EFD-Reinf' },
  { id: 'cprb', nome: 'CPRB (desoneração da folha)', tipo: 'calculo', sistemas: ['dp', 'contabil'], inicio: null, fim: '2027-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.cprb,
    continua: 'Os meses até dezembro de 2027 continuam (DARF em atraso, retificação, consulta). De 2028 em diante a empresa volta a pagar a contribuição sobre a folha (Lei 8.212/1991, art. 22).', substituidaPor: 'Contribuição patronal sobre a folha (20%)' },
  { id: 'ipi', nome: 'IPI', tipo: 'calculo', sistemas: ['fiscal'], inicio: null, fim: null, fonteInicio: null, fonteFim: null,
    mudanca: { em: '2027-01', texto: 'A partir de 2027 as alíquotas do IPI são reduzidas a zero, exceto para os produtos com industrialização incentivada na Zona Franca de Manaus. O IPI não acaba: continua para esses produtos.', fonte: FONTES_VIGENCIA.ec132_126 } },
  { id: 'efd_icms_ipi', nome: 'EFD ICMS/IPI', tipo: 'obrigacao', sistemas: ['fiscal'], inicio: null, fim: null, fonteInicio: null, fonteFim: null,
    pendencia: 'O ICMS acaba a partir de 2033 (EC 132/2023, art. 129) e o IPI continua na Zona Franca, mas não há ato oficial sobre o fim da EFD ICMS/IPI: ela continua no sistema.' },
  { id: 'icms', nome: 'ICMS', tipo: 'calculo', sistemas: ['fiscal'], inicio: null, fim: '2032-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.ec132_129,
    continua: 'Os períodos até dezembro de 2032 continuam (retificação, consulta e recolhimento em atraso).', substituidaPor: 'IBS' },
  { id: 'iss', nome: 'ISS', tipo: 'calculo', sistemas: ['fiscal'], inicio: null, fim: '2032-12', fonteInicio: null, fonteFim: FONTES_VIGENCIA.ec132_129,
    continua: 'Os períodos até dezembro de 2032 continuam (retificação, consulta e recolhimento em atraso).', substituidaPor: 'IBS' },
  { id: 'cbs', nome: 'CBS (Contribuição sobre Bens e Serviços)', tipo: 'calculo', sistemas: ['fiscal', 'contabil'], inicio: '2027-01', fim: null, fonteInicio: FONTES_VIGENCIA.ec132_126, fonteFim: null, prazoReforma: 'inicio-2027' },
  { id: 'ibs', nome: 'IBS (Imposto sobre Bens e Serviços)', tipo: 'calculo', sistemas: ['fiscal', 'contabil'], inicio: '2027-01', fim: null, fonteInicio: FONTES_VIGENCIA.ec132_127, fonteFim: null, prazoReforma: 'inicio-2027',
    continua: 'Em 2027 e 2028: 0,05% estadual + 0,05% municipal (EC 132/2023, art. 127).' },
  { id: 'imposto_seletivo', nome: 'Imposto Seletivo', tipo: 'calculo', sistemas: ['fiscal'], inicio: '2027-01', fim: null, fonteInicio: FONTES_VIGENCIA.ec132_126, fonteFim: null, prazoReforma: 'inicio-2027' },
];

// ------------------------------------------------------------------------------------------------------------------------------
const somaMes = (comp: string, n: number) => { const [a, m] = comp.split('-').map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
/** Competência mensal (AAAA-MM) ou anual (AAAA = ano-calendário, tratada como dezembro). */
export function normalizarCompetencia(c: string): string | null {
  const s = String(c ?? '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return `${s}-12`;
  return null;
}
export const itemVigencia = (id: string) => VIGENCIA_OBRIGACOES.find((i) => i.id === id) ?? null;
export const itensDoSistema = (s: SistemaMurad) => VIGENCIA_OBRIGACOES.filter((i) => i.sistemas.includes(s));

/** Data (AAAA-MM-DD) em que a obrigação deixa de existir para períodos novos: 1º dia do mês seguinte ao último período. */
export const dataDoFim = (i: ItemVigencia) => (i.fim ? `${somaMes(i.fim, 1)}-01` : null);
/** Data em que o período sai de vez (art. 173, I, do CTN, contado do vencimento mais tardio). */
export function saiDeVezEm(competencia: string): string | null {
  const c = normalizarCompetencia(competencia); if (!c) return null;
  const anoVencimento = Number(somaMes(c, 2).slice(0, 4));
  return `${anoVencimento + 6}-01-01`;
}

/** O período existe para esta obrigação? (entre o início e o fim, quando houver). Item desconhecido: existe (nunca esconde sem fonte). */
export function vigenteNaCompetencia(id: string, competencia: string): boolean {
  const i = itemVigencia(id); const c = normalizarCompetencia(competencia);
  if (!i || !c) return true;
  if (i.inicio && c < i.inicio) return false;
  if (i.fim && c > i.fim) return false;
  return true;
}

export type EstadoVigencia = 'futura' | 'vigente' | 'encerrada' | 'expirada';
export function estadoNoDia(i: ItemVigencia, hoje: string): EstadoVigencia {
  if (i.inicio && hoje < `${i.inicio}-01`) return 'futura';
  const fim = dataDoFim(i);
  if (!fim || hoje < fim) return 'vigente';
  const saida = saiDeVezEm(i.fim!);
  return saida && hoje >= saida ? 'expirada' : 'encerrada';
}

/** Um período antigo (já encerrado) ainda pode ser consultado, retificado e entregue em atraso? Só dentro dos 5 anos. */
export function periodoAntigoDisponivel(id: string, competencia: string, hoje: string): boolean {
  const i = itemVigencia(id); const c = normalizarCompetencia(competencia);
  if (!i || !c) return true;
  if (!vigenteNaCompetencia(id, c)) return false;
  const saida = saiDeVezEm(c);
  return !saida || hoje < saida;
}

/** Aparece no menu, nos vencimentos novos, nos robôs de geração e nos avisos? (vigente hoje). Encerrada vai para "Obrigações encerradas". */
export function aparecePeriodosNovos(id: string, hoje: string): boolean {
  const i = itemVigencia(id); if (!i) return true;
  const e = estadoNoDia(i, hoje); return e === 'vigente';
}

export interface ObrigacaoEncerrada { id: string; nome: string; ultimoPeriodo: string; encerradaEm: string; disponivelDe: string; disponivelAte: string; saiDeVezEm: string; continua: string | null; substituidaPor: string | null; fonte: FonteVigencia | null }
/** "Obrigações encerradas" de um sistema: o que acabou e ainda tem período antigo disponível (até sair de vez). */
export function obrigacoesEncerradas(sistema: SistemaMurad, hoje: string): ObrigacaoEncerrada[] {
  const out: ObrigacaoEncerrada[] = [];
  for (const i of itensDoSistema(sistema)) {
    if (estadoNoDia(i, hoje) !== 'encerrada' || !i.fim) continue;
    // Primeiro período ainda disponível: o mais antigo cujo prazo de 5 anos não passou.
    let de = i.fim; for (let k = 0; k < 12 * 8; k++) { const ant = somaMes(de, -1); if ((i.inicio && ant < i.inicio) || !(hoje < (saiDeVezEm(ant) ?? '9999'))) break; de = ant; }
    out.push({ id: i.id, nome: i.nome, ultimoPeriodo: i.fim, encerradaEm: dataDoFim(i)!, disponivelDe: de, disponivelAte: i.fim, saiDeVezEm: saiDeVezEm(i.fim)!, continua: i.continua ?? null, substituidaPor: i.substituidaPor ?? null, fonte: i.fonteFim });
  }
  return out;
}

export type TipoAvisoVigencia = 'acaba' | 'nova' | 'mudanca';
export interface AvisoVigencia { chave: string; id: string; tipo: TipoAvisoVigencia; data: string; dias: number; titulo: string; texto: string; fonte: FonteVigencia | null; prazoReforma: string | null }
const br = (d: string) => d.split('-').reverse().join('/');
const compBr = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
/** Avisos ao contador: 30 dias antes de uma obrigação acabar, de uma nova entrar (CBS/IBS) ou de uma mudança (IPI a zero). */
export function avisosVigencia(sistema: SistemaMurad, hoje: string, antecedenciaDias = 30): AvisoVigencia[] {
  const out: AvisoVigencia[] = [];
  for (const i of itensDoSistema(sistema)) {
    const fim = dataDoFim(i);
    if (fim) { const d = diasEntre(hoje, fim); if (d >= 0 && d <= antecedenciaDias) out.push({ chave: `${i.id}|acaba|${fim}`, id: i.id, tipo: 'acaba', data: fim, dias: d, fonte: i.fonteFim, prazoReforma: i.prazoReforma ?? null,
      titulo: `${i.nome}: último período é ${compBr(i.fim!)}`, texto: `A partir de ${br(fim)} ${i.nome} deixa de existir para os períodos novos${i.substituidaPor ? ` (no lugar: ${i.substituidaPor})` : ''}. ${i.continua ?? ''} O sistema tira sozinho dos menus, vencimentos e robôs de geração dos períodos novos; os antigos ficam em "Obrigações encerradas".`.trim() }); }
    if (i.inicio) { const ini = `${i.inicio}-01`; const d = diasEntre(hoje, ini); if (d >= 0 && d <= antecedenciaDias) out.push({ chave: `${i.id}|nova|${ini}`, id: i.id, tipo: 'nova', data: ini, dias: d, fonte: i.fonteInicio, prazoReforma: i.prazoReforma ?? null,
      titulo: `${i.nome} começa em ${br(ini)}`, texto: `A partir do período ${compBr(i.inicio)} entra ${i.nome}.${i.continua ? ` ${i.continua}` : ''}` }); }
    if (i.mudanca) { const em = `${i.mudanca.em}-01`; const d = diasEntre(hoje, em); if (d >= 0 && d <= antecedenciaDias) out.push({ chave: `${i.id}|mudanca|${em}`, id: i.id, tipo: 'mudanca', data: em, dias: d, fonte: i.mudanca.fonte, prazoReforma: i.prazoReforma ?? null,
      titulo: `${i.nome} muda em ${br(em)}`, texto: i.mudanca.texto }); }
  }
  return out.sort((a, b) => a.dias - b.dias || a.id.localeCompare(b.id));
}

/** Resumo de um item para a tela e para a Agente. */
export function resumoItem(i: ItemVigencia, hoje: string) {
  const estado = estadoNoDia(i, hoje);
  return { id: i.id, nome: i.nome, tipo: i.tipo, sistemas: i.sistemas, inicio: i.inicio, fim: i.fim, estado, encerraEm: dataDoFim(i), saiDeVezEm: i.fim ? saiDeVezEm(i.fim) : null,
    fonteInicio: i.fonteInicio, fonteFim: i.fonteFim, mudanca: i.mudanca ?? null, continua: i.continua ?? null, substituidaPor: i.substituidaPor ?? null, pendencia: i.pendencia ?? null, prazoReforma: i.prazoReforma ?? null };
}

/** Impressão digital da lista (para o teste que confere que os três sistemas têm a mesma lista). */
export const ASSINATURA_VIGENCIA = VIGENCIA_OBRIGACOES.map((i) => `${i.id}:${i.inicio ?? '-'}:${i.fim ?? '-'}:${i.sistemas.join('+')}`).join('|');
