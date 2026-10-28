/**
 * Apuração anual do IRPJ e da CSLL pelo Lucro Real (ECF, Bloco M e N) — Leiaute 12.
 * Fontes: Manual de Orientação do Leiaute 12 da ECF (jul/2026) e Tabelas Dinâmicas (RFB, 24/09/2026), abas
 * M300A, M350A, N500, N630A, N650 e N670. Limite de 30% na compensação de prejuízo fiscal e de base negativa:
 * texto do próprio manual (itens sobre compensação de prejuízos fiscais).
 *
 * O que calcula: lucro líquido antes do IRPJ/CSLL → adições, exclusões → compensação (limite 30%) → base →
 * IRPJ 15% + adicional de 10% sobre o que excede R$ 20.000 × 12 meses → deduções de retenções e estimativas pagas;
 * CSLL a 9%, 15% ou 20% (IND_ALIQ_CSLL 1, 4 ou 3).
 * O que NÃO calcula (precisa do programa da ECF): incentivos fiscais (N630 linhas 6 a 16, 17, 18), lucro da
 * exploração (N600/N610), alíquotas múltiplas no ano (IND_ALIQ_CSLL 5 a 8), PJ financeiras/seguradoras,
 * apuração trimestral e por estimativa (N620/N660), e a conciliação conta a conta da Parte B do e-Lalur.
 */
import type { LinhaECF } from "./ecfPresumidoService";

export interface LancamentoLalur {
  /** Código da tabela dinâmica M300A/M350A (ex.: "8.60" multas por infrações fiscais; "167.01" outras exclusões). */
  codigo: string;
  descricao: string;
  valor: number;
}

export interface EntradaLucroRealAnual {
  anoCalendario: number;
  /** Resultado do exercício na contabilidade antes do encerramento (lucro positivo / prejuízo negativo), em reais. */
  resultadoContabil: number;
  /** Despesa de IRPJ já contabilizada no resultado (volta ao lucro antes do IRPJ). */
  irpjContabilizado: number;
  /** Despesa de CSLL já contabilizada no resultado (volta ao lucro antes da CSLL e é adicionada ao lucro real). */
  csllContabilizada: number;
  adicoesIrpj: LancamentoLalur[];
  exclusoesIrpj: LancamentoLalur[];
  adicoesCsll: LancamentoLalur[];
  exclusoesCsll: LancamentoLalur[];
  /** Saldo de prejuízo fiscal a compensar (Parte B do e-Lalur), em reais. */
  saldoPrejuizoFiscal: number;
  /** Saldo de base de cálculo negativa da CSLL a compensar, em reais. */
  saldoBaseNegativaCsll: number;
  /** N630 linhas 19 a 25 (valores positivos que reduzem o imposto). */
  deducoesIrpj?: Partial<Record<"19" | "20" | "21" | "22" | "23" | "24" | "25", number>>;
  /** N670 linhas 14, 15 a 20 (valores positivos que reduzem a CSLL). */
  deducoesCsll?: Partial<Record<"14" | "15" | "16" | "17" | "18" | "19" | "20", number>>;
  /** 0020.IND_ALIQ_CSLL: "1" = 9%, "4" = 15%, "3" = 20%. */
  indAliquotaCsll: string;
}

export interface ResultadoLucroRealAnual {
  lucroAntesIrpj: number;
  lucroAntesCsll: number;
  lucroRealAntesCompensacao: number;
  compensacaoPrejuizo: number;
  baseIrpj: number;
  baseNegativaCsllAntesCompensacao: number;
  compensacaoBaseNegativa: number;
  baseCsll: number;
  irpjAPagar: number;
  csllAPagar: number;
  /** Prejuízo fiscal / base negativa gerados no ano (positivo = valor do prejuízo). */
  prejuizoFiscalDoAno: number;
  baseNegativaCsllDoAno: number;
  m300: Array<{ codigo: string; descricao: string; tipo: "A" | "E" | "P"; valor: number }>;
  m350: Array<{ codigo: string; descricao: string; tipo: "A" | "E" | "P"; valor: number }>;
  n500: LinhaECF[];
  n630: LinhaECF[];
  n650: LinhaECF[];
  n670: LinhaECF[];
  avisos: string[];
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);
const soma = (l: LancamentoLalur[]) => r2(l.reduce((s, x) => s + n(x.valor), 0));
const LIMITE_COMPENSACAO = 0.3;
const IRPJ_LIMITE_ADICIONAL_ANUAL = 20000 * 12;

export function calcularLucroRealAnual(e: EntradaLucroRealAnual): ResultadoLucroRealAnual {
  const avisos: string[] = [];
  if (!["1", "3", "4"].includes(e.indAliquotaCsll)) {
    throw new Error("Alíquota da CSLL não suportada neste cálculo (só 9%, 15% ou 20%). Alíquotas múltiplas no ano exigem o programa da ECF.");
  }
  for (const l of [...e.adicoesIrpj, ...e.exclusoesIrpj, ...e.adicoesCsll, ...e.exclusoesCsll]) {
    if (!(n(l.valor) >= 0)) throw new Error(`Lançamento ${l.codigo || "(sem código)"}: informe o valor sem sinal (positivo).`);
    if (!l.codigo.trim()) throw new Error("Todo lançamento do e-Lalur/e-Lacs precisa do código da tabela dinâmica (M300A/M350A).");
  }

  // ---- e-Lalur (M300) ----
  const lucroAntesIrpj = r2(n(e.resultadoContabil) + n(e.irpjContabilizado));
  const adicoesIrpj = [...e.adicoesIrpj];
  if (n(e.csllContabilizada) > 0) adicoesIrpj.unshift({ codigo: "9", descricao: "Contribuição Social Sobre o Lucro Líquido - CSLL", valor: n(e.csllContabilizada) });
  const lucroRealAntes = r2(lucroAntesIrpj + soma(adicoesIrpj) - soma(e.exclusoesIrpj));
  let compPrejuizo = 0;
  if (lucroRealAntes > 0) compPrejuizo = r2(Math.min(Math.max(0, n(e.saldoPrejuizoFiscal)), lucroRealAntes * LIMITE_COMPENSACAO));
  if (lucroRealAntes > 0 && n(e.saldoPrejuizoFiscal) > compPrejuizo) avisos.push(`Prejuízo fiscal compensado limitado a 30% do lucro real: sobram ${(n(e.saldoPrejuizoFiscal) - compPrejuizo).toFixed(2).replace(".", ",")} para os próximos períodos.`);
  const baseIrpj = lucroRealAntes > 0 ? r2(lucroRealAntes - compPrejuizo) : lucroRealAntes;
  const prejuizoFiscalDoAno = lucroRealAntes < 0 ? r2(-lucroRealAntes) : 0;

  // ---- e-Lacs (M350) ----
  const lucroAntesCsll = r2(n(e.resultadoContabil) + n(e.csllContabilizada));
  const baseNegAntes = r2(lucroAntesCsll + soma(e.adicoesCsll) - soma(e.exclusoesCsll));
  let compBase = 0;
  if (baseNegAntes > 0) compBase = r2(Math.min(Math.max(0, n(e.saldoBaseNegativaCsll)), baseNegAntes * LIMITE_COMPENSACAO));
  if (baseNegAntes > 0 && n(e.saldoBaseNegativaCsll) > compBase) avisos.push(`Base negativa da CSLL compensada limitada a 30%: sobram ${(n(e.saldoBaseNegativaCsll) - compBase).toFixed(2).replace(".", ",")} para os próximos períodos.`);
  const baseCsll = baseNegAntes > 0 ? r2(baseNegAntes - compBase) : baseNegAntes;
  const baseNegativaCsllDoAno = baseNegAntes < 0 ? r2(-baseNegAntes) : 0;

  // ---- N630 ----
  const di = e.deducoesIrpj || {};
  const imp15 = baseIrpj > 0 ? r2(baseIrpj * 0.15) : 0;
  const adicional = baseIrpj <= IRPJ_LIMITE_ADICIONAL_ANUAL ? 0 : r2((baseIrpj - IRPJ_LIMITE_ADICIONAL_ANUAL) * 0.1);
  const chavesIr = ["19", "20", "21", "22", "23", "24", "25"] as const;
  const descIr: Record<(typeof chavesIr)[number], string> = {
    "19": "(-) Imposto Pago no Exterior sobre Lucros, Rendimentos e Ganhos de Capital",
    "20": "(-) Imposto de Renda Retido na Fonte",
    "21": "(-) Imposto de Renda Retido na Fonte por Órgãos, Autarquias e Fundações Federais (Lei nº 9.430/1996, art. 64)",
    "22": "(-) Imposto de Renda Retido na Fonte pelas Demais Entidades da Administração Pública Federal (Lei n° 10.833/2003, art. 34)",
    "23": "(-) Imposto Pago Incidente sobre Ganhos no Mercado de Renda Variável",
    "24": "(-) Imposto de Renda Mensal Efetivamente Pago por Estimativa",
    "25": "(-) Imposto de Renda Efetivamente Parcelado Referente a Estimativas Mensais",
  };
  const somaDedIr = chavesIr.reduce((s, k) => s + n(di[k]), 0);
  const irpj = r2(imp15 + adicional - somaDedIr);
  const n500: LinhaECF[] = [{ codigo: "1", descricao: "Valor da base de cálculo do IRPJ", valor: baseIrpj }];
  const n630: LinhaECF[] = [
    { codigo: "1", descricao: "BASE DE CÁLCULO DO IRPJ", valor: baseIrpj },
    { codigo: "3", descricao: "À Alíquota de 15%", valor: imp15 },
    { codigo: "4", descricao: "Adicional", valor: adicional },
    ...chavesIr.filter((k) => di[k] !== undefined).map((k) => ({ codigo: k, descricao: descIr[k], valor: n(di[k]) })),
    { codigo: "26", descricao: "IMPOSTO DE RENDA A PAGAR", valor: irpj },
  ];

  // ---- N650 / N670 ----
  const dc = e.deducoesCsll || {};
  const aliquota = e.indAliquotaCsll === "1" ? 0.09 : e.indAliquotaCsll === "3" ? 0.2 : 0.15;
  const csllApurada = baseCsll <= 0 ? 0 : r2(baseCsll * aliquota);
  const chavesCs = ["14", "15", "16", "17", "18", "19", "20"] as const;
  const descCs: Record<(typeof chavesCs)[number], string> = {
    "14": "(-) Imposto Pago no Exterior sobre Lucros, Rendimentos e Ganhos de Capital (MP nº 1.858-6/1999, art. 19)",
    "15": "(-) CSLL Retida na Fonte por Órgãos, Autarquias e Fundações Federais (Lei nº 9.430/1996, art. 64)",
    "16": "(-) CSLL Retida na Fonte pelas Demais Entidades da Administração Pública Federal (Lei n° 10.833/2003, art. 34)",
    "17": "(-) CSLL Retida na Fonte por Pessoas Jurídicas de Direito Privado (Lei n° 10.833/2003, art. 30)",
    "18": "(-) CSLL Retida na Fonte por Órgãos, Autarquias e Fundações dos Estados, Distrito Federal e Municípios (Lei n° 10.833/2003, art. 33)",
    "19": "(-) CSLL Mensal Efetivamente Paga por Estimativa",
    "20": "(-) CSLL Efetivamente Parcelada Referente a Estimativas Mensais",
  };
  const somaDedCs = chavesCs.reduce((s, k) => s + n(dc[k]), 0);
  const csll = r2(csllApurada - somaDedCs);
  const n650: LinhaECF[] = [{ codigo: "1", descricao: "Valor da Base de Cálculo da CSLL", valor: baseCsll }];
  const n670: LinhaECF[] = [
    { codigo: "1", descricao: "BASE DE CÁLCULO DA CSLL", valor: baseCsll },
    { codigo: "2", descricao: "Contribuição Social sobre o Lucro Líquido por Atividade", valor: csllApurada },
    { codigo: "4", descricao: "TOTAL DA CONTRIBUIÇÃO SOCIAL SOBRE O LUCRO LÍQUIDO", valor: csllApurada },
    ...chavesCs.filter((k) => dc[k] !== undefined).map((k) => ({ codigo: k, descricao: descCs[k], valor: n(dc[k]) })),
    { codigo: "21", descricao: "CSLL A PAGAR", valor: csll },
  ];

  if (irpj < 0) avisos.push("O IRPJ ficou negativo: retenções e estimativas pagas superam o imposto devido (saldo negativo a restituir/compensar).");
  if (csll < 0) avisos.push("A CSLL ficou negativa: retenções e estimativas pagas superam a contribuição devida (saldo negativo).");

  const m300 = [
    ...adicoesIrpj.map((l) => ({ codigo: l.codigo, descricao: l.descricao, tipo: "A" as const, valor: n(l.valor) })),
    ...e.exclusoesIrpj.map((l) => ({ codigo: l.codigo, descricao: l.descricao, tipo: "E" as const, valor: n(l.valor) })),
    ...(compPrejuizo > 0 ? [{ codigo: "173", descricao: "(-) Compensação de Prejuízos Fiscais de Períodos Anteriores - Atividades em Geral", tipo: "P" as const, valor: compPrejuizo }] : []),
  ];
  const m350 = [
    ...e.adicoesCsll.map((l) => ({ codigo: l.codigo, descricao: l.descricao, tipo: "A" as const, valor: n(l.valor) })),
    ...e.exclusoesCsll.map((l) => ({ codigo: l.codigo, descricao: l.descricao, tipo: "E" as const, valor: n(l.valor) })),
    ...(compBase > 0 ? [{ codigo: "173", descricao: "(-) Compensação de Base de Cálculo Negativa da CSLL de Períodos Anteriores - Atividades em Geral", tipo: "P" as const, valor: compBase }] : []),
  ];

  return {
    lucroAntesIrpj, lucroAntesCsll, lucroRealAntesCompensacao: lucroRealAntes, compensacaoPrejuizo: compPrejuizo, baseIrpj,
    baseNegativaCsllAntesCompensacao: baseNegAntes, compensacaoBaseNegativa: compBase, baseCsll,
    irpjAPagar: irpj, csllAPagar: csll, prejuizoFiscalDoAno, baseNegativaCsllDoAno, m300, m350, n500, n630, n650, n670, avisos,
  };
}

const fmt = (v: number | null) => (v === null ? "" : r2(v).toFixed(2).replace(".", ","));
const limpa = (s: string) => s.replace(/\|/g, " ");

/** Registros M300, M350, N500, N630, N650 e N670 (sem M305/M310: lançamentos sem relacionamento, IND_RELACAO = 4). */
export function registrosLucroRealAnual(r: ResultadoLucroRealAnual): string[] {
  const l: string[] = [];
  for (const m of r.m300) l.push(`|M300|${m.codigo}|${limpa(m.descricao)}|${m.tipo}|4|${fmt(m.valor)}||`);
  for (const m of r.m350) l.push(`|M350|${m.codigo}|${limpa(m.descricao)}|${m.tipo}|4|${fmt(m.valor)}||`);
  for (const [reg, itens] of [["N500", r.n500], ["N630", r.n630], ["N650", r.n650], ["N670", r.n670]] as const) {
    for (const x of itens) l.push(`|${reg}|${x.codigo}|${limpa(x.descricao)}|${fmt(x.valor)}|`);
  }
  return l;
}
