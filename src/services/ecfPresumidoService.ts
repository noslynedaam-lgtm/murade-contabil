/**
 * Apuração do IRPJ e da CSLL pelo Lucro Presumido (ECF, Bloco P) — Leiaute 12.
 * Fonte: Tabelas Dinâmicas ECF Leiaute 12 (RFB, 24/09/2026), abas P200, P300, P400 e P500.
 *
 * Cobre períodos até 31/12/2025 (ano-calendário 2025 e anteriores). A partir de 01/01/2026 a tabela traz regras
 * da Lei Complementar 224/25 (linhas 25.1xx do P200 e 20.1xx do P400) que ainda não foram implementadas:
 * o cálculo recusa esses períodos em vez de gerar números incompletos.
 * Não cobre isenção/redução (P130/P230), redução por reinvestimento nem os ajustes especiais das linhas "E" raras.
 */

export type PeriodoPresumido = "T01" | "T02" | "T03" | "T04";

export interface EntradaTrimestrePresumido {
  periodo: PeriodoPresumido;
  /** Receita bruta por percentual de presunção do IRPJ (P200 linhas 2, 4, 6, 8 e 9). */
  receitaIrpj: { p16: number; p8: number; p16b: number; p32: number; p384: number };
  /** Receita bruta por percentual de presunção da CSLL (P400 linhas 2, 4 e 5). */
  receitaCsll: { p12: number; p32: number; p384: number };
  /** Demais receitas do P200 (linhas 11 a 20 e 20.01). Chave = código da linha. */
  outrasReceitas?: Partial<Record<"11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "20.01", number>>;
  /** Deduções do P200 (linhas 22 a 25.02). */
  deducoes?: Partial<Record<"22" | "23" | "24" | "25" | "25.01" | "25.02", number>>;
  /** IRRF e outros valores a deduzir do imposto (P300 linhas 7 e 10 a 14). */
  deducoesImposto?: Partial<Record<"7" | "10" | "11" | "12" | "13" | "14", number>>;
  /** Deduções da CSLL (P500 linhas 7 a 12). */
  deducoesCsll?: Partial<Record<"7" | "8" | "9" | "10" | "11" | "12", number>>;
  /** Linhas P400 que não vêm do P200: 9 (diferido) e 11 (preços de transferência). */
  csllExtras?: { diferido?: number; precosTransferencia?: number };
}

export interface ParametrosPresumido {
  anoCalendario: number;
  /** Alíquota da CSLL conforme 0020.IND_ALIQ_CSLL: "1" = 9%, "3" = 20%, demais = 15% (regra da tabela P500/2). */
  indAliquotaCsll: string;
}

export interface LinhaECF {
  codigo: string;
  descricao: string;
  valor: number | null;
}

export interface ResultadoTrimestrePresumido {
  periodo: PeriodoPresumido;
  p200: LinhaECF[];
  p300: LinhaECF[];
  p400: LinhaECF[];
  p500: LinhaECF[];
  irpjAPagar: number;
  csllAPagar: number;
  baseIrpj: number;
  baseCsll: number;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

export function datasDoTrimestre(ano: number, periodo: PeriodoPresumido): { ini: string; fim: string; meses: number } {
  const i = Number(periodo.slice(2));
  const mesIni = (i - 1) * 3 + 1;
  const ult = new Date(Date.UTC(ano, mesIni + 2, 0)).getUTCDate();
  const p = (x: number) => String(x).padStart(2, "0");
  return { ini: `01${p(mesIni)}${ano}`, fim: `${p(ult)}${p(mesIni + 2)}${ano}`, meses: 3 };
}

export function calcularTrimestrePresumido(par: ParametrosPresumido, e: EntradaTrimestrePresumido): ResultadoTrimestrePresumido {
  if (par.anoCalendario >= 2026) {
    throw new Error("Apuração a partir de 2026 usa as regras da Lei Complementar 224/25, ainda não implementadas neste cálculo.");
  }
  const oi = e.outrasReceitas || {};
  const dd = e.deducoes || {};
  const di = e.deducoesImposto || {};
  const dc = e.deducoesCsll || {};
  const ri = e.receitaIrpj;
  const rc = e.receitaCsll;

  // ---- P200 ----
  const l10 = Math.max(0, r2(n(ri.p16) * 0.016 + n(ri.p8) * 0.08 + n(ri.p16b) * 0.16 + n(ri.p32) * 0.32 + n(ri.p384) * 0.384));
  const somaOutras = (["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "20.01"] as const).reduce((s, k) => s + n(oi[k]), 0);
  const somaDeducoes = (["22", "23", "24", "25", "25.01", "25.02"] as const).reduce((s, k) => s + n(dd[k]), 0);
  const baseIrpj = Math.max(0, r2(l10 + somaOutras - somaDeducoes));
  const p200: LinhaECF[] = [
    { codigo: "2", descricao: "Receita Bruta Sujeita ao Percentual de 1,6%", valor: n(ri.p16) },
    { codigo: "4", descricao: "Receita Bruta Sujeita ao Percentual de 8%", valor: n(ri.p8) },
    { codigo: "6", descricao: "Receita Bruta Sujeita ao Percentual de 16%", valor: n(ri.p16b) },
    { codigo: "8", descricao: "Receita Bruta Sujeita ao Percentual de 32%", valor: n(ri.p32) },
    { codigo: "9", descricao: "Receita Bruta Sujeita ao Percentual de 38,4%", valor: n(ri.p384) },
    { codigo: "10", descricao: "RESULTADO DA APLICAÇÃO DOS PERCENTUAIS SOBRE A RECEITA BRUTA", valor: l10 },
    ...(["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "20.01"] as const).filter((k) => oi[k] !== undefined).map((k) => ({ codigo: k, descricao: `Linha P200/${k}`, valor: n(oi[k]) })),
    ...(["22", "23", "24", "25", "25.01", "25.02"] as const).filter((k) => dd[k] !== undefined).map((k) => ({ codigo: k, descricao: `(-) Linha P200/${k}`, valor: n(dd[k]) })),
    { codigo: "26", descricao: "BASE DE CÁLCULO DO IMPOSTO SOBRE O LUCRO PRESUMIDO", valor: baseIrpj },
  ];

  // ---- P300 ----
  const imp15 = baseIrpj > 0 ? r2(baseIrpj * 0.15) : 0;
  const limite = 20000 * 3; // R$ 20.000 × meses do período (trimestre = 3)
  const adicional = baseIrpj <= limite ? 0 : r2((baseIrpj - limite) * 0.1);
  const somaDedImp = (["7", "10", "11", "12", "13", "14"] as const).reduce((s, k) => s + n(di[k]), 0);
  const irpj = r2(imp15 + adicional - somaDedImp);
  const p300: LinhaECF[] = [
    { codigo: "1", descricao: "BASE DE CÁLCULO DO IMPOSTO SOBRE O LUCRO PRESUMIDO", valor: baseIrpj },
    { codigo: "3", descricao: "À Alíquota de 15%", valor: imp15 },
    { codigo: "4", descricao: "Adicional", valor: adicional },
    ...(["7", "10", "11", "12", "13", "14"] as const).filter((k) => di[k] !== undefined).map((k) => ({ codigo: k, descricao: `(-) Linha P300/${k}`, valor: n(di[k]) })),
    { codigo: "15", descricao: "IMPOSTO DE RENDA A PAGAR", valor: irpj },
  ];

  // ---- P400 ----
  const c6 = Math.max(0, r2(n(rc.p12) * 0.12 + n(rc.p32) * 0.32 + n(rc.p384) * 0.384));
  const espelho: Array<[string, string, number | undefined]> = [
    ["7", "11", oi["11"]], ["8", "12", oi["12"]], ["10", "14", oi["14"]], ["12", "16", oi["16"]], ["13", "17", oi["17"]],
    ["14", "18", oi["18"]], ["15", "19", oi["19"]], ["16", "20", oi["20"]], ["16.01", "20.01", oi["20.01"]],
  ];
  const somaP400Receitas = c6 + espelho.reduce((s, [, , v]) => s + n(v), 0) + n(e.csllExtras?.diferido) + n(e.csllExtras?.precosTransferencia);
  const somaP400Ded = n(dd["22"]) + n(dd["23"]) + n(dd["25.01"]) + n(dd["25.02"]) + n(dd["24"]);
  const baseCsll = r2(somaP400Receitas - somaP400Ded);
  const p400: LinhaECF[] = [
    { codigo: "2", descricao: "Receita Bruta Sujeita ao Percentual de 12%", valor: n(rc.p12) },
    { codigo: "4", descricao: "Receita Bruta Sujeita ao Percentual de 32%", valor: n(rc.p32) },
    { codigo: "5", descricao: "Receita Bruta Sujeita ao Percentual de 38,4%", valor: n(rc.p384) },
    { codigo: "6", descricao: "RESULTADO DA APLICAÇÃO DOS PERCENTUAIS SOBRE A RECEITA BRUTA", valor: c6 },
    ...espelho.filter(([, origem]) => oi[origem as keyof typeof oi] !== undefined).map(([k, origem, v]) => ({ codigo: k, descricao: `Linha P200/${origem}`, valor: n(v) })),
    ...(e.csllExtras?.diferido !== undefined ? [{ codigo: "9", descricao: "Realização de Valores cuja Tributação Tenha Sido Diferida", valor: n(e.csllExtras.diferido) }] : []),
    ...(e.csllExtras?.precosTransferencia !== undefined ? [{ codigo: "11", descricao: "Ajustes Decorrentes de Métodos - Preços de Transferências", valor: n(e.csllExtras.precosTransferencia) }] : []),
    ...(dd["22"] !== undefined ? [{ codigo: "18", descricao: "(-) Excedente de Variação Cambial", valor: n(dd["22"]) }] : []),
    ...(dd["23"] !== undefined ? [{ codigo: "19", descricao: "(-) Variações Cambiais Ativas", valor: n(dd["23"]) }] : []),
    ...(dd["25.01"] !== undefined ? [{ codigo: "19.01", descricao: "(-) Receitas Financeiras Relativas às Variações Monetárias", valor: n(dd["25.01"]) }] : []),
    ...(dd["25.02"] !== undefined ? [{ codigo: "19.02", descricao: "(-) Receita Reconhecida pela Construção, Recuperação, Reforma", valor: n(dd["25.02"]) }] : []),
    ...(dd["24"] !== undefined ? [{ codigo: "20", descricao: "(-) Resultados Não Tributáveis de Sociedades Cooperativas", valor: n(dd["24"]) }] : []),
    { codigo: "21", descricao: "BASE DE CÁLCULO DA CSLL", valor: baseCsll },
  ];

  // ---- P500 ----
  const aliquota = par.indAliquotaCsll === "1" ? 0.09 : par.indAliquotaCsll === "3" ? 0.2 : 0.15;
  const csllApurada = baseCsll < 0 ? 0 : r2(baseCsll * aliquota);
  const somaDedCsll = (["7", "8", "9", "10", "11", "12"] as const).reduce((s, k) => s + n(dc[k]), 0);
  const csll = r2(csllApurada - somaDedCsll);
  const p500: LinhaECF[] = [
    { codigo: "1", descricao: "BASE DE CÁLCULO DA CSLL", valor: baseCsll },
    { codigo: "2", descricao: "CSLL Apurada", valor: csllApurada },
    { codigo: "4", descricao: "TOTAL DA CONTRIBUIÇÃO SOCIAL SOBRE O LUCRO LÍQUIDO", valor: csllApurada },
    ...(["7", "8", "9", "10", "11", "12"] as const).filter((k) => dc[k] !== undefined).map((k) => ({ codigo: k, descricao: `(-) Linha P500/${k}`, valor: n(dc[k]) })),
    { codigo: "13", descricao: "CSLL A PAGAR", valor: csll },
  ];

  return { periodo: e.periodo, p200, p300, p400, p500, irpjAPagar: irpj, csllAPagar: csll, baseIrpj, baseCsll };
}

const fmt = (v: number | null) => (v === null ? "" : r2(v).toFixed(2).replace(".", ","));

/** Texto dos registros P030/P200/P300/P400/P500 de um trimestre (sem P100/P150, que dependem da ECD e do plano referencial). */
export function registrosBlocoPTrimestre(ano: number, r: ResultadoTrimestrePresumido): string[] {
  const d = datasDoTrimestre(ano, r.periodo);
  const linhas = [`|P030|${d.ini}|${d.fim}|${r.periodo}|`];
  for (const [reg, itens] of [["P200", r.p200], ["P300", r.p300], ["P400", r.p400], ["P500", r.p500]] as const) {
    for (const l of itens) linhas.push(`|${reg}|${l.codigo}|${l.descricao.replace(/\|/g, " ")}|${fmt(l.valor)}|`);
  }
  return linhas;
}
