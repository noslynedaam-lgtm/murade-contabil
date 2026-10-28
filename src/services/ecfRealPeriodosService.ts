/**
 * Lucro Real: apuração TRIMESTRAL (N630/N670 com T01 a T04) e ESTIMATIVA MENSAL (N620/N660 com A01 a A12).
 * Fontes: Manual da ECF Leiaute 12 (jul/2026) e Tabelas Dinâmicas (RFB, 24/09/2026), abas N620, N660, N630A, N670, N500 e N650.
 *
 * Trimestral: cada trimestre usa o mesmo cálculo do anual, com limite do adicional de R$ 60.000 (20.000 × 3), compensação
 * limitada a 30% e saldo de prejuízo/base negativa que passa de um trimestre para o seguinte.
 * Estimativa mensal: modo "E" (receita bruta e acréscimos, por percentual de presunção; adicional sobre o que passa de R$ 20.000
 * no mês) ou modo "B" (balanço/balancete de suspensão ou redução; informe a base acumulada de janeiro até o mês — adicional sobre
 * 20.000 × meses). Não calcula N610 (isenção/redução, reinvestimento) nem CSLL com alíquotas 5 a 8.
 */
import { calcularLucroRealAnual, EntradaLucroRealAnual, ResultadoLucroRealAnual, registrosLucroRealAnual } from "./ecfRealService";
import { calcularIncentivosIrpj } from "./ecfIncentivosService";
import type { LinhaECF } from "./ecfPresumidoService";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

// ------------------------------------------------------------------------------------------------- trimestral
export type TrimestreReal = Omit<EntradaLucroRealAnual, "anoCalendario" | "indAliquotaCsll" | "meses" | "saldoPrejuizoFiscal" | "saldoBaseNegativaCsll"> & { periodo: "T01" | "T02" | "T03" | "T04" };

export interface ResultadoTrimestreReal extends ResultadoLucroRealAnual { periodo: "T01" | "T02" | "T03" | "T04" }

/** Calcula os trimestres informados, em ordem, levando o saldo de prejuízo e de base negativa de um para o outro. */
export function calcularLucroRealTrimestral(
  base: { anoCalendario: number; indAliquotaCsll: string; saldoPrejuizoFiscal: number; saldoBaseNegativaCsll: number },
  trimestres: TrimestreReal[],
): ResultadoTrimestreReal[] {
  const ordem = ["T01", "T02", "T03", "T04"];
  const lista = [...trimestres].sort((a, b) => ordem.indexOf(a.periodo) - ordem.indexOf(b.periodo));
  if (new Set(lista.map((t) => t.periodo)).size !== lista.length) throw new Error("Trimestre repetido.");
  let saldoP = base.saldoPrejuizoFiscal, saldoB = base.saldoBaseNegativaCsll;
  return lista.map((t) => {
    const { periodo, ...resto } = t;
    const r = calcularLucroRealAnual({ ...resto, anoCalendario: base.anoCalendario, indAliquotaCsll: base.indAliquotaCsll, meses: 3, saldoPrejuizoFiscal: saldoP, saldoBaseNegativaCsll: saldoB });
    saldoP = r.saldoPrejuizoFinal; saldoB = r.saldoBaseNegativaFinal;
    return { ...r, periodo };
  });
}

const DT: Record<string, [string, string]> = { T01: ["0101", "3103"], T02: ["0104", "3006"], T03: ["0107", "3009"], T04: ["0110", "3112"] };
export function registrosLucroRealTrimestral(ano: number, itens: ResultadoTrimestreReal[]): string[] {
  const l: string[] = [];
  for (const it of itens) {
    const [i, f] = DT[it.periodo];
    l.push(`|M030|${i}${ano}|${f}${ano}|${it.periodo}|`);
    l.push(`|N030|${i}${ano}|${f}${ano}|${it.periodo}|`);
    l.push(...registrosLucroRealAnual(it));
  }
  return l;
}

// ------------------------------------------------------------------------------------------------- estimativa mensal
export interface ReceitaEstimativa {
  /** Receita bruta por percentual de presunção (IRPJ): 1,6%, 8%, 16%, 32%, 38,4%. */
  irpj: { p16: number; p8: number; p16b: number; p32: number; p384: number };
  /** CSLL: 12%, 32%, 38,4%. */
  csll: { p12: number; p32: number; p384: number };
  /** Ganhos de capital e demais receitas/rendimentos que entram na base (somados sem percentual). */
  acrescimos?: number;
}

export interface MesEstimativa {
  mes: number; // 1..12
  modo: "E" | "B";
  /** Modo E: receita do mês. */
  receita?: ReceitaEstimativa;
  /** Modo B: base do IRPJ e da CSLL apuradas no balancete acumulado de janeiro até o mês (pode ser negativa). */
  baseIrpjAcumulada?: number;
  baseCsllAcumulada?: number;
  /** Incentivos (por código da N620) e retenções/pagamentos (N620 21 a 25.99). */
  incentivosIrpj?: Record<string, number>;
  retencoesIrpj?: Partial<Record<"21" | "22" | "23" | "24" | "25" | "25.01" | "25.02" | "25.99", number>>;
  /** N660 13 a 17.99. */
  retencoesCsll?: Partial<Record<"13" | "14" | "15" | "16" | "17" | "17.01" | "17.02" | "17.99", number>>;
}

export interface ResultadoMesEstimativa {
  mes: number;
  periodo: string;
  modo: "E" | "B";
  baseIrpj: number; irpjDevido: number; baseCsll: number; csllDevida: number;
  n620: LinhaECF[]; n660: LinhaECF[]; n500: LinhaECF[]; n650: LinhaECF[];
  avisos: string[];
}

const PCT_IRPJ: Array<[keyof ReceitaEstimativa["irpj"], number]> = [["p16", 0.016], ["p8", 0.08], ["p16b", 0.16], ["p32", 0.32], ["p384", 0.384]];
const PCT_CSLL: Array<[keyof ReceitaEstimativa["csll"], number]> = [["p12", 0.12], ["p32", 0.32], ["p384", 0.384]];

const DESC_RET_IR: Record<string, string> = {
  "21": "(-) Imposto de Renda Retido na Fonte", "22": "(-) Imposto Pago no Exterior sobre Lucros, Rendimentos e Ganhos de Capital",
  "23": "(-) Imposto de Renda Retido na Fonte por Órgãos, Autarquias e Fundações Federais (Lei nº 9.430/1996, art. 64)",
  "24": "(-) Imposto de Renda Retido na Fonte pelas Demais Entidades da Administração Pública Federal (Lei n° 10.833/2003, art. 34)",
  "25": "(-) Imposto de Renda Pago sobre Ganhos no Mercado de Renda Variável",
  "25.01": "(-) Imposto Sobre a Renda Pago no Exterior pela Controlada Direta ou Indireta, no Caso do Art. 87 da Lei nº 12.973/2014",
  "25.02": "(-) Imposto Sobre a Renda Retido na Fonte no Exterior Incidente Sobre os Dividendos no Caso do Art. 88 da Lei nº 12.973/2014",
  "25.99": "(-) Outras - Retenções e Pagamentos",
};
const DESC_RET_CS: Record<string, string> = {
  "13": "(-) Imposto Pago no Exterior sobre Lucros, Rendimentos e Ganhos de Capital (MP nº 1.858-6/1999, art. 19)",
  "14": "(-) CSLL Retida na Fonte por Órgãos, Autarquias e Fundações Federais (Lei nº 9.430/1996, art. 64)",
  "15": "(-) CSLL Retida na Fonte pelas Demais Entidades da Administração Pública Federal (Lei n° 10.833/2003, art. 34)",
  "16": "(-) CSLL Retida na Fonte por Pessoas Jurídicas de Direito Privado (Lei n° 10.833/2003, art. 30)",
  "17": "(-) CSLL Retida na Fonte por Órgãos, Autarquias e Fundações dos Estados, Distrito Federal e Municípios (Lei n° 10.833/2003, art. 33)",
  "17.01": "(-) Imposto Sobre a Renda Pago no Exterior pela Controlada Direta ou Indireta, no Caso do Art. 87 da Lei nº 12.973/2014",
  "17.02": "(-) Imposto Sobre a Renda Retido na Fonte no Exterior Incidente Sobre os Dividendos no Caso do Art. 88 da Lei nº 12.973/2014",
  "17.99": "(-) Outras Deduções",
};

export function calcularEstimativaMensal(
  par: { anoCalendario: number; indAliquotaCsll: string },
  meses: MesEstimativa[],
): ResultadoMesEstimativa[] {
  if (!["1", "3", "4"].includes(par.indAliquotaCsll)) throw new Error("Alíquota da CSLL não suportada na estimativa (só 9%, 15% ou 20%).");
  const aliq = par.indAliquotaCsll === "1" ? 0.09 : par.indAliquotaCsll === "3" ? 0.2 : 0.15;
  const lista = [...meses].sort((a, b) => a.mes - b.mes);
  if (new Set(lista.map((m) => m.mes)).size !== lista.length) throw new Error("Mês repetido.");
  let devidoIrAnterior = 0, devidoCsAnterior = 0;
  return lista.map((m) => {
    if (!Number.isInteger(m.mes) || m.mes < 1 || m.mes > 12) throw new Error("Mês inválido (use 1 a 12).");
    const avisos: string[] = [];
    const periodo = `A${String(m.mes).padStart(2, "0")}`;
    const nMeses = m.modo === "B" ? m.mes : 1;
    let baseIr: number, baseCs: number;
    if (m.modo === "E") {
      const r = m.receita;
      if (!r) throw new Error(`Mês ${m.mes}: informe a receita para a estimativa pela receita bruta.`);
      for (const v of [...Object.values(r.irpj), ...Object.values(r.csll), n(r.acrescimos)]) if (!(v >= 0)) throw new Error(`Mês ${m.mes}: receitas devem ser positivas.`);
      baseIr = r2(PCT_IRPJ.reduce((s, [k, p]) => s + n(r.irpj[k]) * p, 0) + n(r.acrescimos));
      baseCs = r2(PCT_CSLL.reduce((s, [k, p]) => s + n(r.csll[k]) * p, 0) + n(r.acrescimos));
    } else {
      if (m.baseIrpjAcumulada === undefined || m.baseCsllAcumulada === undefined) throw new Error(`Mês ${m.mes}: informe as bases acumuladas do balancete.`);
      baseIr = r2(m.baseIrpjAcumulada); baseCs = r2(m.baseCsllAcumulada);
    }
    // ---- IRPJ (N620)
    const imp15 = baseIr > 0 ? r2(baseIr * 0.15) : 0;
    const limiteAdic = 20000 * nMeses;
    const adicional = baseIr > limiteAdic ? r2((baseIr - limiteAdic) * 0.1) : 0;
    const inc = calcularIncentivosIrpj("N620", par.anoCalendario, imp15, m.incentivosIrpj || {});
    avisos.push(...inc.avisos);
    const linha20 = m.modo === "B" ? r2(devidoIrAnterior) : 0;
    const devido2001 = Math.max(0, r2(imp15 + adicional - (inc.totalDeduzido + linha20)));
    const ret = m.retencoesIrpj || {};
    const chavesIr = ["21", "22", "23", "24", "25", "25.01", "25.02", "25.99"] as const;
    const somaRet = chavesIr.reduce((s, k) => s + n(ret[k]), 0);
    const irDevido = r2(imp15 + adicional - inc.totalDeduzido - linha20 - somaRet);
    const n620: LinhaECF[] = [
      { codigo: "1", descricao: "Base de Cálculo do Imposto de Renda", valor: baseIr },
      { codigo: "3", descricao: "A Alíquota de 15%", valor: imp15 },
      { codigo: "4", descricao: "Adicional", valor: adicional },
      ...inc.linhas,
      ...(m.modo === "B" ? [{ codigo: "20", descricao: "(-) Imposto de Renda Devido em Meses Anteriores", valor: linha20 }] : []),
      { codigo: "20.01", descricao: "(-) Imposto de Renda Devido no Mês Antes de Retenções e Pagamentos", valor: devido2001 },
      ...chavesIr.filter((k) => ret[k] !== undefined).map((k) => ({ codigo: k, descricao: DESC_RET_IR[k], valor: n(ret[k]) })),
      { codigo: "26", descricao: "IMPOSTO DE RENDA DEVIDO NO MÊS", valor: irDevido },
    ];
    // ---- CSLL (N660)
    const csApurada = baseCs > 0 ? r2(baseCs * aliq) : 0;
    const linha12 = m.modo === "B" ? r2(devidoCsAnterior) : 0;
    const rc = m.retencoesCsll || {};
    const chavesCs = ["13", "14", "15", "16", "17", "17.01", "17.02", "17.99"] as const;
    const somaRc = chavesCs.reduce((s, k) => s + n(rc[k]), 0);
    // A tabela deixa a fórmula da linha 12.01 em branco; seguimos a lógica da 20.01 do IRPJ (valor devido antes de retenções e pagamentos).
    const devido1201 = Math.max(0, r2(csApurada - linha12));
    const csDevida = r2(csApurada - linha12 - somaRc);
    const n660: LinhaECF[] = [
      { codigo: "2", descricao: "Base de Cálculo da CSLL", valor: baseCs },
      { codigo: "3", descricao: "CSLL Apurada", valor: csApurada },
      ...(m.modo === "B" ? [{ codigo: "12", descricao: "(-) CSLL Devida em Meses Anteriores", valor: linha12 }] : []),
      { codigo: "12.01", descricao: "CSLL Devida no Mês Antes de Retenções e Pagamentos", valor: devido1201 },
      ...chavesCs.filter((k) => rc[k] !== undefined).map((k) => ({ codigo: k, descricao: DESC_RET_CS[k], valor: n(rc[k]) })),
      { codigo: "18", descricao: "CSLL DEVIDA NO MÊS", valor: csDevida },
    ];
    devidoIrAnterior += devido2001; devidoCsAnterior += devido1201;
    if (m.modo === "E" && baseIr <= 0 && baseCs <= 0) avisos.push(`Mês ${m.mes}: sem base de cálculo.`);
    if (m.modo === "B" && (baseIr < 0 || baseCs < 0)) avisos.push(`Mês ${m.mes}: balancete com prejuízo acumulado; sem estimativa a pagar.`);
    if (irDevido < 0) avisos.push(`Mês ${m.mes}: retenções superam o IRPJ do mês.`);
    if (csDevida < 0) avisos.push(`Mês ${m.mes}: retenções superam a CSLL do mês.`);
    const n500: LinhaECF[] = m.modo === "E" ? [{ codigo: "2", descricao: "Valor da base de cálculo do IRPJ - Estimativa com base na receita bruta", valor: baseIr }] : [];
    const n650: LinhaECF[] = m.modo === "E" ? [{ codigo: "2", descricao: "Valor da Base de Cálculo da CSLL - Estimativa com Base na Receita Bruta", valor: baseCs }] : [];
    return { mes: m.mes, periodo, modo: m.modo, baseIrpj: baseIr, irpjDevido: irDevido, baseCsll: baseCs, csllDevida: csDevida, n620, n660, n500, n650, avisos };
  });
}

const fmt = (v: number) => r2(v).toFixed(2).replace(".", ",");
const limpa = (s: string) => s.replace(/\|/g, " ");
const ULT = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function registrosEstimativaMensal(ano: number, itens: ResultadoMesEstimativa[]): string[] {
  const l: string[] = [];
  for (const it of itens) {
    const mm = String(it.mes).padStart(2, "0");
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    const ultimo = it.mes === 2 && bissexto ? 29 : ULT[it.mes - 1];
    l.push(`|N030|0101${ano}|${String(ultimo).padStart(2, "0")}${mm}${ano}|${it.periodo}|`);
    for (const [reg, linhas] of [["N500", it.n500], ["N620", it.n620], ["N650", it.n650], ["N660", it.n660]] as const) {
      for (const x of linhas) l.push(`|${reg}|${x.codigo}|${limpa(x.descricao)}|${fmt(x.valor)}|`);
    }
  }
  return l;
}
