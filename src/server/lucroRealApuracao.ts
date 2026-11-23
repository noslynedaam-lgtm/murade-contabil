// Lucro Real — IRPJ e CSLL calculados SOZINHOS a partir da contabilidade (balancete) + e-Lalur/e-Lacs (Parte A e Parte B), com a mesma
// conta das linhas da ECF que o Contábil já usa (src/services/ecfRealService.ts e ecfRealPeriodosService.ts). A contadora confere e
// confirma; o DARF é um documento para conferência (o sistema não paga, não transmite e não consulta o Serpro).
//
// FONTES OFICIAIS (conferidas em 22/11/2026):
// - Lei 9.430/1996, arts. 1º, 2º e 5º/6º: período trimestral, ou pagamento mensal por estimativa com ajuste anual; Lei 8.981/1995,
//   art. 35 (balancete de suspensão ou redução: pode pagar menos ou suspender quando o imposto do período em curso, pelo balancete
//   acumulado, for menor que o já pago); Lei 9.249/1995, art. 3º §1º (15% + adicional de 10% acima de R$ 20.000 × meses).
// - Lei 9.065/1995, arts. 15 e 16 (camara.leg.br, texto atualizado): prejuízo fiscal e base negativa da CSLL compensáveis até 30% do
//   lucro líquido ajustado; quem compensa mantém os livros e documentos (Parte B do e-Lalur/e-Lacs).
// - Lei 9.249/1995, art. 9º (planalto): JCP limitado à TJLP pro rata sobre as contas do PL do §8º; dedução condicionada a lucros do
//   período (antes dos juros) ou lucros acumulados e reservas de lucros de pelo menos 2× os juros (§1º); IRRF de 17,5% (§2º, redação
//   da LC 224/2025, art. 8º, desde 01/01/2026; 15% antes).
// - DARF (Agenda Tributária da Receita Federal, gov.br, 28/11/2025 e 25/11/2025): IRPJ estimativa 2362 "Demais Entidades" (obrigadas ao
//   Lucro Real) ou 5993 "Optantes pelo Lucro Real"; IRPJ trimestral 0220 (demais) ou 3373 (optantes); CSLL estimativa 2484 e trimestral
//   6012 (demais entidades); vencimento no último dia útil do mês seguinte ao período. IRRF sobre JCP 5706: 3º dia útil depois do
//   decêndio do pagamento (ex. oficial: 2º decêndio de nov/2025 → 25/11/2025).
// - Saldo do ajuste anual (Agenda Tributária, dia 31/03/2025; Perguntas e Respostas PJ, cap. XV, pergs. 001 e 003): IRPJ 2430
//   ("outras obrigadas ao lucro real") ou 2456 (optantes, "demais entidades"); CSLL 6773 ("demais entidades"); quota única até o
//   último dia útil de março do ano seguinte, com juros Selic a partir de 1º de fevereiro.
// - Lei 8.981/1995, art. 35 (planalto, redação da Lei 9.065/1995): o balancete de suspensão/redução compara o já pago com o imposto
//   do período em curso; deve seguir as leis comerciais e fiscais e ser transcrito no Diário (§1º, a); só vale para o próprio ano (§1º, b).
//
// O QUE O SISTEMA NÃO PRESUME (fica "revisar" ou "a confirmar"):
// - competência ainda não fechada na contabilidade: o cálculo sai como PRÉVIA e não pode ser confirmado;
// - conta de resultado sem classificação na DRE (o resultado do período não é certo);
// - se a empresa é obrigada ao Lucro Real ou optante (muda o código do DARF do IRPJ): cadastre;
// - adições e exclusões (cada uma com o código da tabela M300A/M350A da ECF e o motivo) e o saldo de prejuízo de antes do sistema;
import { calcularLucroRealAnual, type LancamentoLalur, type ResultadoLucroRealAnual } from "../services/ecfRealService";
import { calcularEstimativaMensal, type MesEstimativa, type ResultadoMesEstimativa } from "../services/ecfRealPeriodosService";
import { mapaCategorias } from "../utils/demonstracoesAvancadas";
import { gerarRelatoriosContabeis } from "../utils/livrosContabeis";
import { diaUtilDepois, ultimoDiaUtilDoMes } from "../utils/prazosFederaisContabil";

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const dois = (n: number) => String(n).padStart(2, "0");
const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------------------------------------------------------------------------------------------
// Configuração da empresa
// ---------------------------------------------------------------------------------------------
export type AtividadeEstimativa = "comercio" | "industria" | "combustiveis" | "transporte_carga" | "servicos_hospitalares" | "transporte_passageiros" | "servicos" | "esc";
/** Presunção da estimativa pela receita bruta (Lei 9.430/96, art. 2º, com os percentuais do art. 15 e 20 da Lei 9.249/95). */
export const BUCKET_ESTIMATIVA: Record<AtividadeEstimativa, { irpj: "p16" | "p8" | "p16b" | "p32" | "p384"; csll: "p12" | "p32" | "p384"; rotulo: string }> = {
  comercio: { irpj: "p8", csll: "p12", rotulo: "Comércio — IRPJ 8% / CSLL 12%" }, industria: { irpj: "p8", csll: "p12", rotulo: "Indústria — IRPJ 8% / CSLL 12%" },
  combustiveis: { irpj: "p16", csll: "p12", rotulo: "Revenda de combustível — IRPJ 1,6% / CSLL 12%" }, transporte_carga: { irpj: "p8", csll: "p12", rotulo: "Transporte de cargas — IRPJ 8% / CSLL 12%" },
  servicos_hospitalares: { irpj: "p8", csll: "p12", rotulo: "Serviços hospitalares — IRPJ 8% / CSLL 12%" }, transporte_passageiros: { irpj: "p16b", csll: "p12", rotulo: "Transporte de passageiros — IRPJ 16% / CSLL 12%" },
  servicos: { irpj: "p32", csll: "p32", rotulo: "Serviços em geral — IRPJ 32% / CSLL 32%" }, esc: { irpj: "p384", csll: "p384", rotulo: "Empresa Simples de Crédito — 38,4%" },
};
export interface ConfigLucroReal {
  forma: "trimestral" | "estimativa";
  /** true = obrigada ao Lucro Real (DARF "Demais Entidades"); false = optante; null = não informado (DARF do IRPJ fica sem código). */
  obrigada: boolean | null;
  indAliquotaCsll: "1" | "3" | "4";
  atividadeEstimativa: AtividadeEstimativa;
  /** Saldos da Parte B de antes do sistema (prejuízo fiscal e base negativa da CSLL) no início de `anoInicial`, em centavos. */
  anoInicial: number | null; saldoPrejuizoInicialCentavos: number; saldoBaseNegativaInicialCentavos: number;
  /** Estimativa: mês (1-12) → modo forçado pela contadora ('E' receita bruta ou 'B' balancete). Sem entrada: o menor dos dois. */
  modoForcado: Record<string, "E" | "B">;
}
export const CONFIG_LR_PADRAO: ConfigLucroReal = { forma: "trimestral", obrigada: null, indAliquotaCsll: "1", atividadeEstimativa: "comercio", anoInicial: null, saldoPrejuizoInicialCentavos: 0, saldoBaseNegativaInicialCentavos: 0, modoForcado: {} };

// ---------------------------------------------------------------------------------------------
// Contabilidade → números do mês
// ---------------------------------------------------------------------------------------------
export interface MesContabil { mes: number; resultadoCentavos: number; receitaBrutaCentavos: number; acrescimosCentavos: number; irpjCentavos: number; csllCentavos: number; naoClassificadoCentavos: number }
/** Movimento de cada mês do ano pelas contas de resultado (lançamentos válidos, sem o encerramento). Credor positivo. */
export function mesesDaContabilidade(payload: Record<string, any>, ano: number): MesContabil[] {
  const contas = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos = (Array.isArray(payload?.lancamentos) ? payload.lancamentos : []).filter((l: any) => l?.tipoEspecial !== "encerramento");
  const cats = mapaCategorias(contas, payload?.empresa?.classificacaoDemonstracoes);
  const meses: MesContabil[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, resultadoCentavos: 0, receitaBrutaCentavos: 0, acrescimosCentavos: 0, irpjCentavos: 0, csllCentavos: 0, naoClassificadoCentavos: 0 }));
  const descricao = new Map<string, string>(contas.map((c: any) => [c.codigo, c.descricao]));
  const resultado = new Set(["receita_bruta", "deducao", "custo", "despesa", "depreciacao", "receita_financeira", "despesa_financeira", "outras_receitas", "tributos_lucro"]);
  for (const l of gerarRelatoriosContabeis(contas, lancamentos, "todos").validos as any[]) {
    if (String(l.dataISO).slice(0, 4) !== String(ano)) continue;
    const m = meses[Number(String(l.dataISO).slice(5, 7)) - 1]; if (!m) continue;
    for (const [conta, sinal] of [[l.credito, 1], [l.debito, -1]] as const) {
      const cod = conta?.codigo; const cat = cats.get(cod); const v = sinal * Number(l.valorCentavos);
      if (!cat) continue;
      if (cat === "nao_classificada") { if (/receita|despesa|custo/.test(sem(descricao.get(cod) || ""))) { m.naoClassificadoCentavos += v; m.resultadoCentavos += v; } continue; }
      if (!resultado.has(cat)) continue;
      m.resultadoCentavos += v;
      if (cat === "receita_bruta") m.receitaBrutaCentavos += v;
      if (cat === "receita_financeira" || cat === "outras_receitas") m.acrescimosCentavos += v;
      if (cat === "tributos_lucro") { if (/\bcsll\b|contribuicao social/.test(sem(descricao.get(cod) || ""))) m.csllCentavos -= v; else m.irpjCentavos -= v; }
    }
  }
  return meses;
}

// ---------------------------------------------------------------------------------------------
// e-Lalur / e-Lacs — Parte A (lançamentos) e cálculo dos períodos (puro)
// ---------------------------------------------------------------------------------------------
export type TipoLancLalur = "adicao" | "exclusao" | "irrf_retido" | "csll_retida" | "deducao_receita_bruta";
export interface LancamentoParteA { id: string; ano: number; mes: number; tributo: "irpj" | "csll" | "ambos"; tipo: TipoLancLalur; codigo: string; descricao: string; valorCentavos: number; justificativa: string; contaParteB?: string | null }
const reais = (c: number) => c / 100;
function lalurDosMeses(lanc: LancamentoParteA[], meses: number[]) {
  const doPeriodo = lanc.filter((l) => meses.includes(l.mes));
  const lista = (tipo: "adicao" | "exclusao", trib: "irpj" | "csll"): LancamentoLalur[] => doPeriodo.filter((l) => l.tipo === tipo && (l.tributo === trib || l.tributo === "ambos")).map((l) => ({ codigo: l.codigo, descricao: l.descricao, valor: reais(l.valorCentavos) }));
  const soma = (tipo: TipoLancLalur) => doPeriodo.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valorCentavos, 0);
  return { adicoesIrpj: lista("adicao", "irpj"), exclusoesIrpj: lista("exclusao", "irpj"), adicoesCsll: lista("adicao", "csll"), exclusoesCsll: lista("exclusao", "csll"), irrf: soma("irrf_retido"), csllRet: soma("csll_retida"), deducaoReceita: soma("deducao_receita_bruta") };
}
const somaMeses = (ms: MesContabil[], meses: number[], k: keyof MesContabil) => ms.filter((m) => meses.includes(m.mes)).reduce((s, m) => s + (m[k] as number), 0);

export interface PeriodoCalculado {
  periodo: string; meses: number[]; forma: "trimestral" | "estimativa" | "anual";
  irpjCentavos: number; csllCentavos: number; modo?: "E" | "B"; alternativaCentavos?: number;
  /** IRRF e CSLL retidos no período (antecipações já no ativo): a provisão do período = DARF + retido. */
  retencaoIrpjCentavos: number; retencaoCsllCentavos: number;
  saldoPrejuizoInicialCentavos?: number; saldoBaseNegativaInicialCentavos?: number; saldoPrejuizoFinalCentavos?: number; saldoBaseNegativaFinalCentavos?: number;
  detalhe: ResultadoLucroRealAnual | ResultadoMesEstimativa; avisos: string[];
}

/** Trimestres do ano, levando o saldo de prejuízo fiscal e de base negativa de um trimestre para o seguinte (Lei 9.065/95, arts. 15 e 16). */
export function calcularTrimestres(ano: number, ms: MesContabil[], lanc: LancamentoParteA[], cfg: ConfigLucroReal, saldoInicial: { prejuizo: number; baseNegativa: number }, ate: number): PeriodoCalculado[] {
  const out: PeriodoCalculado[] = []; let sp = saldoInicial.prejuizo, sb = saldoInicial.baseNegativa;
  for (let q = 1; q <= 4 && q * 3 <= ate; q += 1) {
    const meses = [q * 3 - 2, q * 3 - 1, q * 3]; const la = lalurDosMeses(lanc, meses);
    const r = calcularLucroRealAnual({
      anoCalendario: ano, meses: 3, indAliquotaCsll: cfg.indAliquotaCsll,
      resultadoContabil: reais(somaMeses(ms, meses, "resultadoCentavos")), irpjContabilizado: reais(somaMeses(ms, meses, "irpjCentavos")), csllContabilizada: reais(somaMeses(ms, meses, "csllCentavos")),
      adicoesIrpj: la.adicoesIrpj, exclusoesIrpj: la.exclusoesIrpj, adicoesCsll: la.adicoesCsll, exclusoesCsll: la.exclusoesCsll,
      saldoPrejuizoFiscal: reais(sp), saldoBaseNegativaCsll: reais(sb),
      deducoesIrpj: la.irrf ? { "20": reais(la.irrf) } : undefined, deducoesCsll: la.csllRet ? { "17": reais(la.csllRet) } : undefined,
    });
    out.push({ periodo: `T0${q}`, meses, forma: "trimestral", retencaoIrpjCentavos: la.irrf, retencaoCsllCentavos: la.csllRet, irpjCentavos: Math.round(r.irpjAPagar * 100), csllCentavos: Math.round(r.csllAPagar * 100), saldoPrejuizoInicialCentavos: sp, saldoBaseNegativaInicialCentavos: sb, saldoPrejuizoFinalCentavos: Math.round(r.saldoPrejuizoFinal * 100), saldoBaseNegativaFinalCentavos: Math.round(r.saldoBaseNegativaFinal * 100), detalhe: r, avisos: r.avisos });
    sp = Math.round(r.saldoPrejuizoFinal * 100); sb = Math.round(r.saldoBaseNegativaFinal * 100);
  }
  return out;
}

/**
 * Estimativas mensais até o mês `ate`. Em cada mês o sistema calcula pela receita bruta (E) e pelo balancete acumulado de suspensão/
 * redução (B — Lei 8.981/95, art. 35) e fica com o MENOR (empate: receita bruta), salvo se a contadora forçou um dos dois.
 */
export function calcularEstimativas(ano: number, ms: MesContabil[], lanc: LancamentoParteA[], cfg: ConfigLucroReal, saldoInicial: { prejuizo: number; baseNegativa: number }, ate: number): PeriodoCalculado[] {
  const b = BUCKET_ESTIMATIVA[cfg.atividadeEstimativa] ?? BUCKET_ESTIMATIVA.comercio;
  const escolhidos: MesEstimativa[] = []; const out: PeriodoCalculado[] = [];
  for (let m = 1; m <= ate; m += 1) {
    const la = lalurDosMeses(lanc, [m]);
    const rb = reais(Math.max(0, ms[m - 1].receitaBrutaCentavos - la.deducaoReceita));
    const zero = { p16: 0, p8: 0, p16b: 0, p32: 0, p384: 0 }; const zc = { p12: 0, p32: 0, p384: 0 };
    const e: MesEstimativa = { mes: m, modo: "E", receita: { irpj: { ...zero, [b.irpj]: rb }, csll: { ...zc, [b.csll]: rb }, acrescimos: reais(Math.max(0, ms[m - 1].acrescimosCentavos)) } as any, retencoesIrpj: la.irrf ? { "21": reais(la.irrf) } : undefined, retencoesCsll: la.csllRet ? { "16": reais(la.csllRet) } : undefined };
    const acum = Array.from({ length: m }, (_, i) => i + 1); const lAc = lalurDosMeses(lanc, acum);
    const balancete = calcularLucroRealAnual({
      anoCalendario: ano, meses: m, indAliquotaCsll: cfg.indAliquotaCsll,
      resultadoContabil: reais(somaMeses(ms, acum, "resultadoCentavos")), irpjContabilizado: reais(somaMeses(ms, acum, "irpjCentavos")), csllContabilizada: reais(somaMeses(ms, acum, "csllCentavos")),
      adicoesIrpj: lAc.adicoesIrpj, exclusoesIrpj: lAc.exclusoesIrpj, adicoesCsll: lAc.adicoesCsll, exclusoesCsll: lAc.exclusoesCsll,
      saldoPrejuizoFiscal: reais(saldoInicial.prejuizo), saldoBaseNegativaCsll: reais(saldoInicial.baseNegativa),
    });
    const bm: MesEstimativa = { mes: m, modo: "B", baseIrpjAcumulada: balancete.baseIrpj, baseCsllAcumulada: balancete.baseCsll, retencoesIrpj: e.retencoesIrpj, retencoesCsll: e.retencoesCsll };
    const comE = calcularEstimativaMensal({ anoCalendario: ano, indAliquotaCsll: cfg.indAliquotaCsll }, [...escolhidos, e]).at(-1)!;
    const comB = calcularEstimativaMensal({ anoCalendario: ano, indAliquotaCsll: cfg.indAliquotaCsll }, [...escolhidos, bm]).at(-1)!;
    const total = (x: ResultadoMesEstimativa) => Math.max(0, x.irpjDevido) + Math.max(0, x.csllDevida);
    const forcado = cfg.modoForcado?.[String(m)];
    const usarB = forcado ? forcado === "B" : total(comB) < total(comE);
    const r = usarB ? comB : comE; const alt = usarB ? comE : comB;
    escolhidos.push(usarB ? bm : e);
    const avisos = [...r.avisos];
    if (usarB && !forcado) avisos.push(`Pelo balancete de suspensão/redução o mês sai menor (${total(comB) === 0 ? "suspenso" : "reduzido"}): guarde o balancete transcrito no livro Diário (Lei 8.981/95, art. 35).`);
    out.push({ periodo: `A${dois(m)}`, meses: [m], forma: "estimativa", retencaoIrpjCentavos: la.irrf, retencaoCsllCentavos: la.csllRet, modo: usarB ? "B" : "E", irpjCentavos: Math.max(0, Math.round(r.irpjDevido * 100)), csllCentavos: Math.max(0, Math.round(r.csllDevida * 100)), alternativaCentavos: Math.round(total(alt) * 100), detalhe: r, avisos });
  }
  return out;
}

/** Ajuste anual de quem paga por estimativa: Lucro Real do ano − estimativas devidas (N630 l.24 / N670 l.19). */
export function calcularAjusteAnual(ano: number, ms: MesContabil[], lanc: LancamentoParteA[], cfg: ConfigLucroReal, saldoInicial: { prejuizo: number; baseNegativa: number }, estimativas: PeriodoCalculado[]): PeriodoCalculado {
  const todos = Array.from({ length: 12 }, (_, i) => i + 1); const la = lalurDosMeses(lanc, todos);
  const estIr = estimativas.reduce((s, p) => s + p.irpjCentavos, 0); const estCs = estimativas.reduce((s, p) => s + p.csllCentavos, 0);
  const r = calcularLucroRealAnual({
    anoCalendario: ano, meses: 12, indAliquotaCsll: cfg.indAliquotaCsll,
    resultadoContabil: reais(somaMeses(ms, todos, "resultadoCentavos")), irpjContabilizado: reais(somaMeses(ms, todos, "irpjCentavos")), csllContabilizada: reais(somaMeses(ms, todos, "csllCentavos")),
    adicoesIrpj: la.adicoesIrpj, exclusoesIrpj: la.exclusoesIrpj, adicoesCsll: la.adicoesCsll, exclusoesCsll: la.exclusoesCsll,
    saldoPrejuizoFiscal: reais(saldoInicial.prejuizo), saldoBaseNegativaCsll: reais(saldoInicial.baseNegativa),
    deducoesIrpj: { "20": reais(la.irrf), "24": reais(estIr) }, deducoesCsll: { "17": reais(la.csllRet), "19": reais(estCs) },
  });
  const avisos = [...r.avisos];
  if (r.irpjAPagar < 0 || r.csllAPagar < 0) avisos.push("Saldo negativo no ano (estimativas e retenções maiores que o devido): fica para compensação (PER/DCOMP).");
  if (r.irpjAPagar > 0 || r.csllAPagar > 0) avisos.push("Saldo a pagar do ajuste anual: quota única até o último dia útil de março do ano seguinte; pago depois de 31/01 tem juros Selic a partir de 1º de fevereiro (Perguntas e Respostas PJ, cap. XV, perg. 001) — calcule os juros no Sicalc na data do pagamento.");
  return { periodo: "ANUAL", meses: todos, forma: "anual", retencaoIrpjCentavos: la.irrf, retencaoCsllCentavos: la.csllRet, irpjCentavos: Math.round(r.irpjAPagar * 100), csllCentavos: Math.round(r.csllAPagar * 100), saldoPrejuizoInicialCentavos: saldoInicial.prejuizo, saldoBaseNegativaInicialCentavos: saldoInicial.baseNegativa, saldoPrejuizoFinalCentavos: Math.round(r.saldoPrejuizoFinal * 100), saldoBaseNegativaFinalCentavos: Math.round(r.saldoBaseNegativaFinal * 100), detalhe: r, avisos };
}

// ---------------------------------------------------------------------------------------------
// DARF (documento para conferência) e JCP
// ---------------------------------------------------------------------------------------------
export interface CampoDarfReal { tributo: "irpj" | "csll"; codigo: string | null; descricao: string; periodoApuracao: string; vencimento: string; valorCentavos: number; fonte: string }
export function darfsDoPeriodo(ano: number, p: PeriodoCalculado, obrigada: boolean | null): CampoDarfReal[] {
  if (p.forma === "anual") {
    // Saldo positivo de 31/12 (Agenda Tributária 31/03/2025): IRPJ 2430 (obrigadas) ou 2456 (optantes); CSLL 6773; vence no último dia útil de março.
    const venc = ultimoDiaUtilDoMes(ano + 1, 3);
    const fonte = "Receita Federal — Agenda Tributária, dia 31/03/2025 (códigos do ano-calendário) e Perguntas e Respostas PJ, cap. XV, perg. 003";
    const out: CampoDarfReal[] = [];
    if (p.irpjCentavos > 0) out.push({ tributo: "irpj", codigo: obrigada === null ? null : obrigada ? "2430" : "2456", descricao: obrigada === null ? "IRPJ Lucro Real - saldo do ajuste anual (informe se a empresa é obrigada ou optante para saber o código)" : obrigada ? "IRPJ - Outras obrigadas ao lucro real - ajuste anual" : "IRPJ - Demais entidades (optantes) - ajuste anual", periodoApuracao: `${ano}-12-31`, vencimento: venc, valorCentavos: p.irpjCentavos, fonte });
    if (p.csllCentavos > 0) out.push({ tributo: "csll", codigo: "6773", descricao: "CSLL - Demais entidades - ajuste anual", periodoApuracao: `${ano}-12-31`, vencimento: venc, valorCentavos: p.csllCentavos, fonte });
    return out;
  }
  const ultimoMes = p.meses[p.meses.length - 1];
  const fim = `${ano}-${dois(ultimoMes)}-${dois(new Date(Date.UTC(ano, ultimoMes, 0)).getUTCDate())}`;
  const seg = ultimoMes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: ultimoMes + 1 };
  const venc = ultimoDiaUtilDoMes(seg.a, seg.m);
  const est = p.forma === "estimativa";
  const fonte = "Receita Federal — Agenda Tributária (gov.br/receitafederal, assuntos/agenda-tributaria)";
  const codIr = obrigada === null ? null : est ? (obrigada ? "2362" : "5993") : (obrigada ? "0220" : "3373");
  const descIr = est ? (obrigada === false ? "IRPJ Optantes pelo Lucro Real - Estimativa Mensal" : "IRPJ Demais Entidades - Estimativa Mensal") : (obrigada === false ? "IRPJ Optantes pelo Lucro Real - Balanço Trimestral" : "IRPJ Demais Entidades - Balanço Trimestral");
  return [
    { tributo: "irpj", codigo: codIr, descricao: obrigada === null ? "IRPJ Lucro Real (informe se a empresa é obrigada ou optante para saber o código)" : descIr, periodoApuracao: fim, vencimento: venc, valorCentavos: p.irpjCentavos, fonte },
    { tributo: "csll", codigo: est ? "2484" : "6012", descricao: est ? "CSLL Demais Entidades - Estimativa Mensal" : "CSLL Demais Entidades - Balanço Trimestral", periodoApuracao: fim, vencimento: venc, valorCentavos: p.csllCentavos, fonte },
  ];
}

export interface EntradaJcp { ano: number; dataPagamento: string; dias: number; taxaTjlpPeriodoPercentual: number; fonteTjlp: string; basePlCentavos: number; lucroPeriodoAntesJcpCentavos: number; lucrosAcumuladosReservasCentavos: number; valorPretendidoCentavos?: number }
export interface ResultadoJcp { maximoTjlpCentavos: number; limiteLucrosCentavos: number; jcpDedutivelCentavos: number; aliquotaIrrfPercentual: number; irrfCentavos: number; liquidoCentavos: number; vencimentoIrrf: string; codigoDarf: string; avisos: string[] }
/**
 * Juros sobre capital próprio (Lei 9.249/95, art. 9º): TJLP do período (informada pela contadora, com a fonte) × PL do §8º; dedução até
 * metade do maior entre o lucro do período antes dos juros e os lucros acumulados + reservas de lucros (§1º: lucro ≥ 2× os juros).
 * IRRF 17,5% desde 2026 (LC 224/2025, art. 8º); vencimento: 3º dia útil depois do decêndio do pagamento (Agenda Tributária, código 5706).
 */
export function calcularJcp(e: EntradaJcp): ResultadoJcp {
  const avisos: string[] = [];
  if (!(e.taxaTjlpPeriodoPercentual >= 0) || !String(e.fonteTjlp || "").trim()) throw new Error("Informe a TJLP do período (em %) e de onde veio (publicação oficial).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento)) throw new Error("Informe a data do pagamento ou crédito dos juros.");
  const maximoTjlp = Math.round((e.basePlCentavos * e.taxaTjlpPeriodoPercentual) / 100);
  const limiteLucros = Math.floor(Math.max(e.lucroPeriodoAntesJcpCentavos, e.lucrosAcumuladosReservasCentavos) / 2);
  let jcp = Math.max(0, Math.min(maximoTjlp, limiteLucros));
  if (e.valorPretendidoCentavos !== undefined) { if (e.valorPretendidoCentavos > jcp) avisos.push(`O valor pretendido passa do limite dedutível (${(jcp / 100).toFixed(2).replace(".", ",")}): o excesso não é dedutível e deve ser adicionado no e-Lalur/e-Lacs.`); jcp = Math.min(jcp, Math.max(0, e.valorPretendidoCentavos)); }
  const ano = Number(e.dataPagamento.slice(0, 4));
  const aliquota = ano >= 2026 ? 17.5 : 15;
  const irrf = Math.round((jcp * aliquota * 10) / 1000);
  const dia = Number(e.dataPagamento.slice(8, 10));
  const fimDecendio = `${e.dataPagamento.slice(0, 8)}${dia <= 10 ? "10" : dia <= 20 ? "20" : dois(new Date(Date.UTC(ano, Number(e.dataPagamento.slice(5, 7)), 0)).getUTCDate())}`;
  return { maximoTjlpCentavos: maximoTjlp, limiteLucrosCentavos: limiteLucros, jcpDedutivelCentavos: jcp, aliquotaIrrfPercentual: aliquota, irrfCentavos: irrf, liquidoCentavos: jcp - irrf, vencimentoIrrf: diaUtilDepois(fimDecendio, 3), codigoDarf: "5706", avisos };
}

// ---------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------
let pronta: Promise<void> | null = null;
export function prepararLucroReal(consultar: Consultar): Promise<void> {
  pronta ??= (async () => {
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_lucro_real_config (cnpj text PRIMARY KEY, dados jsonb NOT NULL, atualizado_por text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_lalur_lancamentos (id text PRIMARY KEY, cnpj text NOT NULL, ano int NOT NULL, mes int NOT NULL, tributo text NOT NULL, tipo text NOT NULL, codigo text NOT NULL, descricao text NOT NULL, valor_centavos bigint NOT NULL, justificativa text NOT NULL, criado_por text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now())`);
    await consultar(`CREATE INDEX IF NOT EXISTS contabil_lalur_lancamentos_cnpj ON contabil_lalur_lancamentos (cnpj, ano)`);
    // Parte B — outras contas (Decreto-Lei 1.598/1977, art. 8º, I, "c"): valores que vão influenciar o lucro real de períodos futuros.
    await consultar(`ALTER TABLE contabil_lalur_lancamentos ADD COLUMN IF NOT EXISTS conta_parte_b text`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_lalur_parte_b_contas (id text PRIMARY KEY, cnpj text NOT NULL, codigo text NOT NULL, descricao text NOT NULL, tributo text NOT NULL, natureza text NOT NULL, ano_inicial int NOT NULL, saldo_inicial_centavos bigint NOT NULL DEFAULT 0, criado_por text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now())`);
    await consultar(`CREATE INDEX IF NOT EXISTS contabil_lalur_parte_b_contas_cnpj ON contabil_lalur_parte_b_contas (cnpj)`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_lucro_real_apuracoes (id text PRIMARY KEY, cnpj text NOT NULL, ano int NOT NULL, periodo text NOT NULL, status text NOT NULL, irpj_centavos bigint NOT NULL DEFAULT 0, csll_centavos bigint NOT NULL DEFAULT 0, resultado jsonb, revisar jsonb, calculado_em timestamptz NOT NULL DEFAULT now(), confirmado_por text, confirmado_em timestamptz)`);
    await consultar(`CREATE INDEX IF NOT EXISTS contabil_lucro_real_apuracoes_cnpj ON contabil_lucro_real_apuracoes (cnpj, ano)`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_lucro_real_pagamentos (id text PRIMARY KEY, cnpj text NOT NULL, ano int NOT NULL, periodo text NOT NULL, tributo text NOT NULL, data_pagamento text NOT NULL, valor_pago_centavos bigint NOT NULL, principal_centavos bigint NOT NULL, registrado_por text NOT NULL, registrado_em timestamptz NOT NULL DEFAULT now())`);
    await consultar(`CREATE INDEX IF NOT EXISTS contabil_lucro_real_pagamentos_cnpj ON contabil_lucro_real_pagamentos (cnpj, ano)`);
  })().catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheLucroRealParaTeste(): void { pronta = null; }
const json = <T>(v: unknown, p: T): T => { if (v === null || v === undefined) return p; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return p; } } return v as T; };

export async function lerConfigLucroReal(consultar: Consultar, cnpj: string): Promise<ConfigLucroReal | null> {
  await prepararLucroReal(consultar);
  const r = await consultar(`SELECT dados FROM contabil_lucro_real_config WHERE cnpj=$1`, [cnpj]);
  return r.rows[0] ? { ...CONFIG_LR_PADRAO, ...json<Partial<ConfigLucroReal>>(r.rows[0].dados, {}) } : null;
}
export async function salvarConfigLucroReal(consultar: Consultar, cnpj: string, c: Partial<ConfigLucroReal>, por: string): Promise<ConfigLucroReal> {
  await prepararLucroReal(consultar);
  const atual = (await lerConfigLucroReal(consultar, cnpj)) ?? CONFIG_LR_PADRAO;
  const n: ConfigLucroReal = { ...atual, ...c };
  if (!["trimestral", "estimativa"].includes(n.forma)) throw new Error("Forma de apuração inválida (trimestral ou estimativa).");
  if (!["1", "3", "4"].includes(n.indAliquotaCsll)) throw new Error("Alíquota da CSLL inválida (9%, 15% ou 20%).");
  if (!(n.atividadeEstimativa in BUCKET_ESTIMATIVA)) throw new Error("Atividade da estimativa inválida.");
  if (n.obrigada !== null && typeof n.obrigada !== "boolean") throw new Error("Informe se a empresa é obrigada ao Lucro Real.");
  for (const v of [n.saldoPrejuizoInicialCentavos, n.saldoBaseNegativaInicialCentavos]) if (!Number.isSafeInteger(v) || v < 0) throw new Error("Saldos iniciais inválidos.");
  if (n.anoInicial !== null && !(Number.isInteger(n.anoInicial) && n.anoInicial >= 2000 && n.anoInicial <= 2100)) throw new Error("Ano inicial inválido.");
  for (const [m, v] of Object.entries(n.modoForcado || {})) if (!(Number(m) >= 1 && Number(m) <= 12) || !["E", "B"].includes(v)) throw new Error("Modo da estimativa inválido.");
  await consultar(`INSERT INTO contabil_lucro_real_config (cnpj, dados, atualizado_por, atualizado_em) VALUES ($1,$2::jsonb,$3,now()) ON CONFLICT (cnpj) DO UPDATE SET dados=$2::jsonb, atualizado_por=$3, atualizado_em=now()`, [cnpj, JSON.stringify(n), por]);
  return n;
}

const linhaLanc = (l: any): LancamentoParteA => ({ id: l.id, ano: Number(l.ano), mes: Number(l.mes), tributo: l.tributo, tipo: l.tipo, codigo: l.codigo, descricao: l.descricao, valorCentavos: Number(l.valor_centavos), justificativa: l.justificativa, contaParteB: l.conta_parte_b ?? null });
export async function listarLancamentosLalur(consultar: Consultar, cnpj: string, ano: number): Promise<LancamentoParteA[]> {
  await prepararLucroReal(consultar);
  return (await consultar(`SELECT * FROM contabil_lalur_lancamentos WHERE cnpj=$1 AND ano=$2 ORDER BY mes, criado_em`, [cnpj, ano])).rows.map(linhaLanc);
}
/** Período (trimestre/estimativa/anual) que já está confirmado e contém o mês. */
async function periodoConfirmadoDoMes(consultar: Consultar, cnpj: string, ano: number, mes: number): Promise<string | null> {
  const ids = [`${cnpj}:${ano}:T0${Math.ceil(mes / 3)}`, `${cnpj}:${ano}:A${dois(mes)}`, `${cnpj}:${ano}:ANUAL`];
  const r = await consultar(`SELECT periodo FROM contabil_lucro_real_apuracoes WHERE status='confirmado' AND id IN ($1,$2,$3)`, ids);
  return r.rows[0]?.periodo ?? null;
}
export async function adicionarLancamentoLalur(consultar: Consultar, cnpj: string, l: Omit<LancamentoParteA, "id">, por: string): Promise<LancamentoParteA> {
  await prepararLucroReal(consultar);
  if (!Number.isInteger(l.ano) || !(l.mes >= 1 && l.mes <= 12)) throw new Error("Informe o ano e o mês do lançamento.");
  if (!["irpj", "csll", "ambos"].includes(l.tributo)) throw new Error("Tributo inválido (IRPJ, CSLL ou ambos).");
  if (!["adicao", "exclusao", "irrf_retido", "csll_retida", "deducao_receita_bruta"].includes(l.tipo)) throw new Error("Tipo de lançamento inválido.");
  if ((l.tipo === "adicao" || l.tipo === "exclusao") && !String(l.codigo || "").trim()) throw new Error("Adição e exclusão precisam do código da tabela M300A/M350A da ECF (ex.: 8.60 multas por infrações fiscais).");
  if (!Number.isSafeInteger(l.valorCentavos) || l.valorCentavos <= 0) throw new Error("Valor inválido.");
  if (String(l.justificativa || "").trim().length < 5) throw new Error("Diga de onde vem o valor (documento, conta, motivo).");
  const conf = await periodoConfirmadoDoMes(consultar, cnpj, l.ano, l.mes);
  if (conf) throw new Error(`O período ${conf} de ${l.ano} já está confirmado: reabra antes de lançar.`);
  const contaB = l.contaParteB ? (await listarContasParteB(consultar, cnpj)).find((c) => c.id === l.contaParteB) : null;
  if (l.contaParteB) {
    if (!contaB) throw new Error("Conta da Parte B não encontrada nesta empresa.");
    if (l.tipo !== "adicao" && l.tipo !== "exclusao") throw new Error("Só adição e exclusão movimentam conta da Parte B.");
    if (l.ano < contaB.anoInicial) throw new Error(`A conta ${contaB.codigo} começa em ${contaB.anoInicial}.`);
    if (contaB.tributo !== "ambos" && l.tributo !== contaB.tributo) throw new Error(`A conta ${contaB.codigo} é só de ${contaB.tributo.toUpperCase()}: use o mesmo tributo no lançamento.`);
    if (efeitoNaContaB(contaB, l.tipo) === -1) {
      const s = saldosParteB([contaB], await lancamentosDaConta(consultar, cnpj, contaB.id), l.ano)[0];
      if (l.valorCentavos > s.saldoFinalCentavos) throw new Error(`O valor passa do saldo da conta ${contaB.codigo} na Parte B (${(s.saldoFinalCentavos / 100).toFixed(2).replace(".", ",")}): não dá para realizar mais do que foi controlado.`);
    }
  }
  const id = `LALUR-${cnpj}-${l.ano}-${dois(l.mes)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await consultar(`INSERT INTO contabil_lalur_lancamentos (id, cnpj, ano, mes, tributo, tipo, codigo, descricao, valor_centavos, justificativa, criado_por, conta_parte_b) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, cnpj, l.ano, l.mes, l.tributo, l.tipo, String(l.codigo || "").trim().slice(0, 20), String(l.descricao || "").trim().slice(0, 200) || l.tipo, l.valorCentavos, String(l.justificativa).trim().slice(0, 500), por, contaB ? contaB.id : null]);
  return { ...l, contaParteB: contaB ? contaB.id : null, id };
}
// ---------------------------------------------------------------------------------------------
// Parte B — outras contas (Decreto-Lei 1.598/1977, art. 8º, I, "c": "outros valores que devam influenciar a determinação do lucro real
// de exercício futuro e não constem de escrituração comercial"). Duas naturezas:
//  - "a_excluir": o valor foi ADICIONADO agora e será EXCLUÍDO no futuro (ex.: provisão não dedutível; a exclusão vem quando ela se realiza).
//  - "a_adicionar": o valor foi EXCLUÍDO agora e será ADICIONADO no futuro (ex.: exclusão temporária que volta depois).
// Cada adição/exclusão da Parte A pode apontar a conta: a que forma o saldo aumenta; a que realiza diminui, e nunca deixa o saldo negativo.
// ---------------------------------------------------------------------------------------------
export interface ContaParteB { id: string; codigo: string; descricao: string; tributo: "irpj" | "csll" | "ambos"; natureza: "a_excluir" | "a_adicionar"; anoInicial: number; saldoInicialCentavos: number }
const linhaContaB = (r: any): ContaParteB => ({ id: r.id, codigo: r.codigo, descricao: r.descricao, tributo: r.tributo, natureza: r.natureza, anoInicial: Number(r.ano_inicial), saldoInicialCentavos: Number(r.saldo_inicial_centavos) });
export async function listarContasParteB(consultar: Consultar, cnpj: string): Promise<ContaParteB[]> {
  await prepararLucroReal(consultar);
  return (await consultar(`SELECT * FROM contabil_lalur_parte_b_contas WHERE cnpj=$1 ORDER BY codigo`, [cnpj])).rows.map(linhaContaB);
}
export async function criarContaParteB(consultar: Consultar, cnpj: string, c: Omit<ContaParteB, "id">, por: string): Promise<ContaParteB> {
  await prepararLucroReal(consultar);
  const codigo = String(c.codigo || "").trim().slice(0, 30), descricao = String(c.descricao || "").trim().slice(0, 200);
  if (!codigo || descricao.length < 3) throw new Error("Informe o código e a descrição da conta da Parte B.");
  if (!["irpj", "csll", "ambos"].includes(c.tributo)) throw new Error("Tributo inválido (IRPJ, CSLL ou ambos).");
  if (!["a_excluir", "a_adicionar"].includes(c.natureza)) throw new Error("Natureza inválida: valor a excluir no futuro ou a adicionar no futuro.");
  if (!Number.isInteger(c.anoInicial) || c.anoInicial < 2000 || c.anoInicial > 2100) throw new Error("Informe o ano de início do controle.");
  if (!Number.isSafeInteger(c.saldoInicialCentavos) || c.saldoInicialCentavos < 0) throw new Error("Saldo inicial inválido (zero ou mais; o da última ECF).");
  if ((await listarContasParteB(consultar, cnpj)).some((x) => x.codigo === codigo)) throw new Error("Já existe uma conta da Parte B com este código.");
  const id = `LALURB-${cnpj}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await consultar(`INSERT INTO contabil_lalur_parte_b_contas (id, cnpj, codigo, descricao, tributo, natureza, ano_inicial, saldo_inicial_centavos, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, cnpj, codigo, descricao, c.tributo, c.natureza, c.anoInicial, c.saldoInicialCentavos, por]);
  return { ...c, codigo, descricao, id };
}
/** Exclui UMA conta, só se nenhum lançamento usa ela. */
export async function excluirContaParteB(consultar: Consultar, cnpj: string, id: string): Promise<void> {
  await prepararLucroReal(consultar);
  const usados = await consultar(`SELECT id FROM contabil_lalur_lancamentos WHERE cnpj=$1 AND conta_parte_b=$2 LIMIT 1`, [cnpj, id]);
  if (usados.rows.length) throw new Error("A conta tem lançamentos na Parte A: exclua os lançamentos antes.");
  await consultar(`DELETE FROM contabil_lalur_parte_b_contas WHERE id=$1 AND cnpj=$2`, [id, cnpj]);
}
/** Efeito de um lançamento no saldo da conta: forma (+) ou realiza (−). */
export function efeitoNaContaB(conta: Pick<ContaParteB, "natureza">, tipo: TipoLancLalur): 1 | -1 | 0 {
  if (tipo !== "adicao" && tipo !== "exclusao") return 0;
  return conta.natureza === "a_excluir" ? (tipo === "adicao" ? 1 : -1) : (tipo === "exclusao" ? 1 : -1);
}
export interface SaldoContaB { conta: ContaParteB; saldoInicialAnoCentavos: number; formadoCentavos: number; realizadoCentavos: number; saldoFinalCentavos: number }
/** Saldos de cada conta no ano: saldo inicial (o informado + o que veio dos anos anteriores), formado, realizado e final. Puro. */
export function saldosParteB(contas: ContaParteB[], lancTodos: LancamentoParteA[], ano: number): SaldoContaB[] {
  return contas.filter((c) => c.anoInicial <= ano).map((c) => {
    const meus = lancTodos.filter((l) => l.contaParteB === c.id && l.ano >= c.anoInicial);
    const soma = (ls: LancamentoParteA[], sinal: 1 | -1) => ls.filter((l) => efeitoNaContaB(c, l.tipo) === sinal).reduce((a, l) => a + l.valorCentavos, 0);
    const antes = meus.filter((l) => l.ano < ano), doAno = meus.filter((l) => l.ano === ano);
    const ini = c.saldoInicialCentavos + soma(antes, 1) - soma(antes, -1);
    const formado = soma(doAno, 1), realizado = soma(doAno, -1);
    return { conta: c, saldoInicialAnoCentavos: ini, formadoCentavos: formado, realizadoCentavos: realizado, saldoFinalCentavos: ini + formado - realizado };
  });
}
async function lancamentosDaConta(consultar: Consultar, cnpj: string, contaId: string): Promise<LancamentoParteA[]> {
  return (await consultar(`SELECT * FROM contabil_lalur_lancamentos WHERE cnpj=$1 AND conta_parte_b=$2`, [cnpj, contaId])).rows.map(linhaLanc);
}

/** Exclui UM lançamento (nunca vários de uma vez), se o período dele não estiver confirmado. */
export async function excluirLancamentoLalur(consultar: Consultar, cnpj: string, id: string): Promise<void> {
  await prepararLucroReal(consultar);
  const r = await consultar(`SELECT * FROM contabil_lalur_lancamentos WHERE id=$1 AND cnpj=$2`, [id, cnpj]);
  const l = r.rows[0]; if (!l) throw new Error("Lançamento não encontrado.");
  const conf = await periodoConfirmadoDoMes(consultar, cnpj, Number(l.ano), Number(l.mes));
  if (conf) throw new Error(`O período ${conf} já está confirmado: reabra antes de excluir.`);
  if (l.conta_parte_b) {
    // Tirar um lançamento que formou saldo não pode deixar negativo um saldo que já foi realizado depois.
    const conta = (await listarContasParteB(consultar, cnpj)).find((c) => c.id === l.conta_parte_b);
    if (conta) {
      const resto = (await lancamentosDaConta(consultar, cnpj, conta.id)).filter((x) => x.id !== id);
      const ultimo = Math.max(Number(l.ano), ...resto.map((x) => x.ano));
      for (let a = Number(l.ano); a <= ultimo; a++) if (saldosParteB([conta], resto, a)[0].saldoFinalCentavos < 0) throw new Error(`Sem este lançamento, o saldo da conta ${conta.codigo} na Parte B ficaria negativo em ${a}: exclua antes a realização (o lançamento que usou o saldo).`);
    }
  }
  await consultar(`DELETE FROM contabil_lalur_lancamentos WHERE id=$1 AND cnpj=$2`, [id, cnpj]);
}

export interface LinhaApuracaoReal { id: string; cnpj: string; ano: number; periodo: string; status: "calculado" | "previa" | "revisar" | "confirmado"; irpjCentavos: number; csllCentavos: number; resultado: Record<string, any>; revisar: string[]; calculadoEm: string; confirmadoPor: string | null; confirmadoEm: string | null }
const linhaAp = (l: any): LinhaApuracaoReal => ({ id: l.id, cnpj: l.cnpj, ano: Number(l.ano), periodo: l.periodo, status: l.status, irpjCentavos: Number(l.irpj_centavos), csllCentavos: Number(l.csll_centavos), resultado: json(l.resultado, {}), revisar: json(l.revisar, []), calculadoEm: l.calculado_em, confirmadoPor: l.confirmado_por ?? null, confirmadoEm: l.confirmado_em ?? null });
export async function listarApuracoesReal(consultar: Consultar, cnpj: string, ano: number): Promise<LinhaApuracaoReal[]> {
  await prepararLucroReal(consultar);
  return (await consultar(`SELECT * FROM contabil_lucro_real_apuracoes WHERE cnpj=$1 AND ano=$2 ORDER BY periodo`, [cnpj, ano])).rows.map(linhaAp);
}

/** Saldo da Parte B no começo do ano: o informado (ano inicial) ou o final do ano anterior já apurado. */
async function saldoInicialDoAno(consultar: Consultar, cnpj: string, ano: number, cfg: ConfigLucroReal): Promise<{ prejuizo: number; baseNegativa: number; origem: string } | { erro: string }> {
  if (cfg.anoInicial === null || ano === cfg.anoInicial) return { prejuizo: cfg.saldoPrejuizoInicialCentavos, baseNegativa: cfg.saldoBaseNegativaInicialCentavos, origem: cfg.anoInicial === null ? "saldo informado (sem ano inicial: confira)" : `saldo informado para ${ano}` };
  if (ano < cfg.anoInicial) return { erro: `O controle da Parte B começa em ${cfg.anoInicial}.` };
  const ant = await listarApuracoesReal(consultar, cnpj, ano - 1);
  const ultimo = ant.find((a) => a.periodo === "ANUAL") ?? ant.filter((a) => a.periodo.startsWith("T")).sort((a, b) => a.periodo.localeCompare(b.periodo)).at(-1);
  if (!ultimo || ultimo.status !== "confirmado" || (ultimo.periodo !== "ANUAL" && ultimo.periodo !== "T04")) return { erro: `Para saber o saldo de prejuízo fiscal e base negativa de ${ano}, confirme antes o fechamento de ${ano - 1} (4º trimestre ou ajuste anual).` };
  return { prejuizo: Number(ultimo.resultado.saldoPrejuizoFinalCentavos) || 0, baseNegativa: Number(ultimo.resultado.saldoBaseNegativaFinalCentavos) || 0, origem: `saldo final de ${ano - 1}` };
}

export interface DepsLucroReal { consultar: Consultar; lerWorkspace: (cnpj: string) => Promise<Record<string, any> | null>; competenciasFechadas: (cnpj: string, ano: number) => Promise<Set<string>>; hoje: () => string }

/** Apura (e grava, sem mexer no que está confirmado) todos os períodos do ano até o último mês já terminado. */
export async function apurarAnoLucroReal(deps: DepsLucroReal, cnpj: string, ano: number): Promise<{ periodos: LinhaApuracaoReal[]; avisos: string[] }> {
  const { consultar } = deps; await prepararLucroReal(consultar);
  const cfg = await lerConfigLucroReal(consultar, cnpj);
  if (!cfg) return { periodos: await listarApuracoesReal(consultar, cnpj, ano), avisos: ["Configure a apuração do Lucro Real da empresa (forma, obrigada/optante, saldos de prejuízo) antes de calcular."] };
  const payload = await deps.lerWorkspace(cnpj);
  if (!payload) return { periodos: [], avisos: ["Empresa sem contabilidade no Murade Contábil."] };
  const hoje = deps.hoje(); const anoHoje = Number(hoje.slice(0, 4)); const mesHoje = Number(hoje.slice(5, 7));
  const ate = ano < anoHoje ? 12 : ano === anoHoje ? mesHoje - 1 : 0;
  const avisos: string[] = [];
  if (ate <= 0) return { periodos: await listarApuracoesReal(consultar, cnpj, ano), avisos: ["Nenhum mês deste ano terminou ainda."] };
  const saldo = await saldoInicialDoAno(consultar, cnpj, ano, cfg);
  if ("erro" in saldo) return { periodos: await listarApuracoesReal(consultar, cnpj, ano), avisos: [saldo.erro] };
  const ms = mesesDaContabilidade(payload, ano); const lanc = await listarLancamentosLalur(consultar, cnpj, ano);
  const fechadas = await deps.competenciasFechadas(cnpj, ano);
  const calculados = cfg.forma === "trimestral" ? calcularTrimestres(ano, ms, lanc, cfg, saldo, ate) : calcularEstimativas(ano, ms, lanc, cfg, saldo, ate);
  if (cfg.forma === "estimativa" && ate === 12) calculados.push(calcularAjusteAnual(ano, ms, lanc, cfg, saldo, calculados));
  const atuais = new Map((await listarApuracoesReal(consultar, cnpj, ano)).map((a) => [a.periodo, a]));
  for (const p of calculados) {
    const atual = atuais.get(p.periodo); if (atual?.status === "confirmado") continue;
    const revisar: string[] = [];
    const abertos = p.meses.flatMap((m) => (cfg.forma === "estimativa" && p.forma === "estimativa" ? Array.from({ length: m }, (_, i) => i + 1) : [m])).map((m) => `${ano}-${dois(m)}`).filter((c, i, a) => a.indexOf(c) === i && !fechadas.has(c));
    const naoClass = p.meses.reduce((s, m) => s + ms[m - 1].naoClassificadoCentavos, 0);
    if (naoClass !== 0) revisar.push("Há conta de resultado sem classificação na DRE: classifique (tela Demonstrações) para o resultado do período ficar certo.");
    if (cfg.obrigada === null && p.forma !== "anual") revisar.push("Informe se a empresa é OBRIGADA ao Lucro Real ou OPTANTE: o código do DARF do IRPJ muda (2362/0220 ou 5993/3373).");
    const status = revisar.length ? "revisar" : abertos.length ? "previa" : "calculado";
    if (abertos.length) revisar.push(`Prévia: ${abertos.join(", ")} ainda não fechada(s) na contabilidade — feche a competência para confirmar.`);
    const resultado = { ...p, detalhe: p.detalhe, darfs: darfsDoPeriodo(ano, p, cfg.obrigada), saldoInicialOrigem: saldo.origem };
    await consultar(`INSERT INTO contabil_lucro_real_apuracoes (id, cnpj, ano, periodo, status, irpj_centavos, csll_centavos, resultado, revisar, calculado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,now())
      ON CONFLICT (id) DO UPDATE SET status=$5, irpj_centavos=$6, csll_centavos=$7, resultado=$8::jsonb, revisar=$9::jsonb, calculado_em=now() WHERE contabil_lucro_real_apuracoes.status <> 'confirmado'`,
      [`${cnpj}:${ano}:${p.periodo}`, cnpj, ano, p.periodo, status, p.irpjCentavos, p.csllCentavos, JSON.stringify(resultado), JSON.stringify(revisar)]);
  }
  return { periodos: await listarApuracoesReal(consultar, cnpj, ano), avisos };
}

export async function confirmarApuracaoReal(consultar: Consultar, cnpj: string, ano: number, periodo: string, por: string): Promise<LinhaApuracaoReal | null> {
  await prepararLucroReal(consultar);
  const r = await consultar(`UPDATE contabil_lucro_real_apuracoes SET status='confirmado', confirmado_por=$2, confirmado_em=now() WHERE id=$1 AND status='calculado' RETURNING *`, [`${cnpj}:${ano}:${periodo}`, por]);
  return r.rows[0] ? linhaAp(r.rows[0]) : null;
}
/** Reabre um período. Não reabre se um período SEGUINTE do mesmo ano (ou o ano seguinte) já foi confirmado — ele usou os saldos deste. */
export async function reabrirApuracaoReal(consultar: Consultar, cnpj: string, ano: number, periodo: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  await prepararLucroReal(consultar);
  if ((await listarPagamentosReal(consultar, cnpj, ano)).some((p) => p.periodo === periodo)) return { ok: false, motivo: "Este período já tem pagamento de DARF registrado: o valor pago foi para a contabilidade. Para mudar a apuração, fale com o administrador do sistema." };
  const lista = await listarApuracoesReal(consultar, cnpj, ano);
  if (lista.some((a) => a.status === "confirmado" && a.periodo !== periodo && (a.periodo > periodo || a.periodo === "ANUAL"))) return { ok: false, motivo: "Um período seguinte já está confirmado e usou os saldos deste: reabra ele primeiro." };
  if ((await listarApuracoesReal(consultar, cnpj, ano + 1)).some((a) => a.status === "confirmado")) return { ok: false, motivo: `O ano ${ano + 1} já tem período confirmado que usou o saldo final deste ano.` };
  const r = await consultar(`UPDATE contabil_lucro_real_apuracoes SET status='calculado', confirmado_por=NULL, confirmado_em=NULL WHERE id=$1 AND status='confirmado'`, [`${cnpj}:${ano}:${periodo}`]);
  return (r.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, motivo: "Este período não está confirmado." };
}

/**
 * Provisão para o Contábil (pré-lançamento para aprovação, como as apurações do Fiscal): despesa de IRPJ/CSLL × a recolher, pelo
 * imposto do período ANTES das retenções (DARF + retido; o retido já está no ativo como antecipação). Ajuste anual: só o saldo
 * positivo (o que passa das estimativas já provisionadas). Competência: último mês do período.
 */
export function itensProvisaoReal(l: LinhaApuracaoReal): Array<{ referencia: string; tributo: string; competencia: string; valorCentavos: number; baseCentavos: number | null; situacao: string; versaoOrigem: string }> {
  const r = l.resultado || {}; const meses: number[] = r.meses || []; const ultimo = meses[meses.length - 1];
  if (!ultimo) return [];
  const competencia = `${l.ano}-${dois(ultimo)}`; const versaoOrigem = l.confirmadoEm || new Date().toISOString();
  const ir = l.irpjCentavos + (Number(r.retencaoIrpjCentavos) || 0); const cs = l.csllCentavos + (Number(r.retencaoCsllCentavos) || 0);
  return ([["IRPJ_REAL", ir], ["CSLL_REAL", cs]] as const).filter(([, v]) => v > 0).map(([tributo, v]) => ({ referencia: `LR:${tributo}:${l.ano}-${l.periodo}`, tributo, competencia, valorCentavos: v, baseCentavos: null, situacao: "confirmado", versaoOrigem }));
}

// ---------------------------------------------------------------------------------------------
// Pagamento do DARF do Lucro Real (o DARF nasce aqui no Contábil): registra a data e o valor pago e manda ao mesmo caminho das
// apurações, como os DARF do Fiscal. O principal baixa o IRPJ/CSLL a recolher contra o banco; multa e juros vão à parte.
// ---------------------------------------------------------------------------------------------
export interface PagamentoReal { ano: number; periodo: string; tributo: "irpj" | "csll"; dataPagamento: string; valorPagoCentavos: number; principalCentavos: number; registradoPor: string; registradoEm: string }
export async function listarPagamentosReal(consultar: Consultar, cnpj: string, ano: number): Promise<PagamentoReal[]> {
  await prepararLucroReal(consultar);
  return (await consultar(`SELECT * FROM contabil_lucro_real_pagamentos WHERE cnpj=$1 AND ano=$2 ORDER BY periodo, tributo`, [cnpj, ano])).rows.map((r: any) => ({ ano: Number(r.ano), periodo: r.periodo, tributo: r.tributo, dataPagamento: r.data_pagamento, valorPagoCentavos: Number(r.valor_pago_centavos), principalCentavos: Number(r.principal_centavos), registradoPor: r.registrado_por, registradoEm: String(r.registrado_em) }));
}
export type ItemApuracaoContabil = ReturnType<typeof itensProvisaoReal>[number];
/** Valida e monta o pagamento. Só período confirmado com DARF a pagar; data não futura; valor pago não menor que o principal. */
export function montarPagamentoReal(l: LinhaApuracaoReal | undefined, tributo: string, dataPagamento: string, valorPagoCentavos: number | null, hoje: string): { erro: string } | { principal: number; item: ItemApuracaoContabil } {
  if (!l) return { erro: "Período não encontrado." };
  if (l.status !== "confirmado") return { erro: "Confirme a apuração do período antes de registrar o pagamento." };
  if (tributo !== "irpj" && tributo !== "csll") return { erro: "Tributo inválido (irpj ou csll)." };
  const d = (l.resultado?.darfs || []).find((x: any) => x.tributo === tributo);
  if (!d || !(Number(d.valorCentavos) > 0)) return { erro: "Este período não tem DARF a pagar para este tributo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || new Date(`${dataPagamento}T00:00:00Z`).toISOString().slice(0, 10) !== dataPagamento) return { erro: "Informe a data do pagamento (AAAA-MM-DD)." };
  if (dataPagamento > hoje) return { erro: "A data do pagamento não pode ser no futuro." };
  const principal = Number(d.valorCentavos);
  if (valorPagoCentavos === null || !Number.isSafeInteger(valorPagoCentavos) || valorPagoCentavos < principal) return { erro: `O valor pago não pode ser menor que o valor do DARF (${(principal / 100).toFixed(2).replace(".", ",")}). Se pagou com multa e juros, informe o total pago.` };
  const trib = tributo === "irpj" ? "IRPJ_REAL_PAGO" : "CSLL_REAL_PAGO";
  return { principal, item: { referencia: `LR:${trib}:${l.ano}-${l.periodo}`, tributo: trib, competencia: dataPagamento.slice(0, 7), valorCentavos: valorPagoCentavos, baseCentavos: principal, situacao: "confirmado", versaoOrigem: `pago:${dataPagamento}:${valorPagoCentavos}` } };
}
export async function registrarPagamentoReal(consultar: Consultar, cnpj: string, ano: number, periodo: string, tributo: string, dataPagamento: string, valorPagoCentavos: number | null, por: string, hoje: string, enviar: (cnpj: string, itens: ItemApuracaoContabil[]) => Promise<unknown>): Promise<{ erro: string } | { pagamento: PagamentoReal }> {
  await prepararLucroReal(consultar);
  const l = (await listarApuracoesReal(consultar, cnpj, ano)).find((p) => p.periodo === periodo);
  const m = montarPagamentoReal(l, tributo, dataPagamento, valorPagoCentavos, hoje);
  if ("erro" in m) return m;
  const id = `${cnpj}:${ano}:${periodo}:${tributo}`;
  const ja = await consultar(`SELECT id FROM contabil_lucro_real_pagamentos WHERE id=$1`, [id]);
  if (ja.rows.length) return { erro: "O pagamento deste DARF já foi registrado." };
  await enviar(cnpj, [m.item]); // primeiro a contabilidade: se falhar, nada fica registrado pela metade
  await consultar(`INSERT INTO contabil_lucro_real_pagamentos (id, cnpj, ano, periodo, tributo, data_pagamento, valor_pago_centavos, principal_centavos, registrado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, cnpj, ano, periodo, tributo, dataPagamento, valorPagoCentavos, m.principal, por]);
  return { pagamento: { ano, periodo, tributo: tributo as "irpj" | "csll", dataPagamento, valorPagoCentavos: valorPagoCentavos!, principalCentavos: m.principal, registradoPor: por, registradoEm: new Date().toISOString() } };
}

/** Saldos da Parte B (prejuízo fiscal e base negativa) período a período, para a tela e para a Agente. */
export function parteBDoAno(periodos: LinhaApuracaoReal[]) {
  return periodos.filter((p) => p.resultado?.saldoPrejuizoFinalCentavos !== undefined).map((p) => ({ periodo: p.periodo, status: p.status, prejuizoFiscal: { inicial: p.resultado.saldoPrejuizoInicialCentavos, final: p.resultado.saldoPrejuizoFinalCentavos, compensado: Math.round(((p.resultado.detalhe?.compensacaoPrejuizo) || 0) * 100) }, baseNegativa: { inicial: p.resultado.saldoBaseNegativaInicialCentavos, final: p.resultado.saldoBaseNegativaFinalCentavos, compensado: Math.round(((p.resultado.detalhe?.compensacaoBaseNegativa) || 0) * 100) } }));
}

/** Robô: apura o ano corrente (e o anterior até março, para o ajuste anual) de cada empresa do Lucro Real. Nunca transmite nem confirma. */
export async function rodarRoboLucroReal(deps: DepsLucroReal, empresas: () => Promise<string[]>): Promise<{ empresas: number; periodos: number; prontos: number; revisar: number; resumo: string }> {
  await prepararLucroReal(deps.consultar);
  const cnpjs = await empresas(); const hoje = deps.hoje(); const ano = Number(hoje.slice(0, 4)); const mes = Number(hoje.slice(5, 7));
  let periodos = 0, prontos = 0, revisar = 0;
  for (const cnpj of cnpjs) {
    for (const a of mes <= 3 ? [ano - 1, ano] : [ano]) {
      try {
        const r = await apurarAnoLucroReal(deps, cnpj, a);
        for (const p of r.periodos) { periodos += 1; if (p.status === "calculado") prontos += 1; if (p.status === "revisar") revisar += 1; }
      } catch (e) { revisar += 1; console.error(`Robô do Lucro Real: falha em ${cnpj}/${a}:`, e instanceof Error ? e.message : e); }
    }
  }
  return { empresas: cnpjs.length, periodos, prontos, revisar, resumo: cnpjs.length ? `${cnpjs.length} empresa(s) do Lucro Real: ${periodos} período(s) apurado(s), ${prontos} pronto(s) para a sua confirmação, ${revisar} para revisar.` : "Nenhuma empresa do Lucro Real configurada." };
}
