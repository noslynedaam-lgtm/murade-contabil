/**
 * Apuração do IRPJ e da CSLL pelo Lucro Presumido (ECF, Bloco P) — Leiaute 12.
 * Fonte: Tabelas Dinâmicas ECF Leiaute 12 (RFB, 24/09/2026), abas P200, P300, P400 e P500.
 *
 * Cobre todos os períodos. A partir de 01/01/2026 a tabela traz as regras da Lei Complementar 224/25 (linhas 25xxx do P200,
 * 18xxx do P300, 20xxx do P400 e 18xxx do P500): adicional de 10% sobre o percentual de presunção da receita que passa de
 * R$ 1.250.000 por trimestre (com compensação entre trimestres e limite anual). Para a CSLL as linhas valem a partir de 01/04/2026.
 * Como as regras dependem dos trimestres do ano, use calcularAnoPresumido() para 2026 em diante.
 * Não cobre isenção/redução (P130/P230), redução por reinvestimento, cooperativas (24xxx/20010-20030) nem os ajustes
 * especiais das linhas "E" raras. A linha P300 14.10 (tributo pago pela LC 224/25) não é oferecida, porque a fórmula da
 * linha 15 da tabela soma só as linhas 7 a 14.
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

/** Linhas e valores da LC 224/25 de um trimestre (calculados por calcularAnoPresumido). */
export interface DadosLc224Trimestre {
  p200: LinhaECF[];
  adicionalIrpj: number;
  p300: LinhaECF[];
  p400: LinhaECF[];
  adicionalCsll: number;
  p500: LinhaECF[];
}

export function calcularTrimestrePresumido(par: ParametrosPresumido, e: EntradaTrimestrePresumido, lc?: DadosLc224Trimestre): ResultadoTrimestrePresumido {
  if (par.anoCalendario >= 2026 && !lc) {
    throw new Error("A partir de 2026 vale a Lei Complementar 224/25, que depende dos trimestres do ano: use calcularAnoPresumido().");
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
  const subtotalIrpj = r2(l10 + somaOutras - somaDeducoes);
  const baseIrpj = lc ? (subtotalIrpj > 0 ? r2(subtotalIrpj + lc.adicionalIrpj) : 0) : Math.max(0, subtotalIrpj);
  const p200: LinhaECF[] = [
    { codigo: "2", descricao: "Receita Bruta Sujeita ao Percentual de 1,6%", valor: n(ri.p16) },
    { codigo: "4", descricao: "Receita Bruta Sujeita ao Percentual de 8%", valor: n(ri.p8) },
    { codigo: "6", descricao: "Receita Bruta Sujeita ao Percentual de 16%", valor: n(ri.p16b) },
    { codigo: "8", descricao: "Receita Bruta Sujeita ao Percentual de 32%", valor: n(ri.p32) },
    { codigo: "9", descricao: "Receita Bruta Sujeita ao Percentual de 38,4%", valor: n(ri.p384) },
    { codigo: "10", descricao: "RESULTADO DA APLICAÇÃO DOS PERCENTUAIS SOBRE A RECEITA BRUTA", valor: l10 },
    ...(["11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "20.01"] as const).filter((k) => oi[k] !== undefined).map((k) => ({ codigo: k, descricao: `Linha P200/${k}`, valor: n(oi[k]) })),
    ...(["22", "23", "24", "25", "25.01", "25.02"] as const).filter((k) => dd[k] !== undefined).map((k) => ({ codigo: k, descricao: `(-) Linha P200/${k}`, valor: n(dd[k]) })),
    ...(lc ? lc.p200 : []),
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
    ...(lc ? lc.p300 : []),
  ];

  // ---- P400 ----
  const c6 = Math.max(0, r2(n(rc.p12) * 0.12 + n(rc.p32) * 0.32 + n(rc.p384) * 0.384));
  const espelho: Array<[string, string, number | undefined]> = [
    ["7", "11", oi["11"]], ["8", "12", oi["12"]], ["10", "14", oi["14"]], ["12", "16", oi["16"]], ["13", "17", oi["17"]],
    ["14", "18", oi["18"]], ["15", "19", oi["19"]], ["16", "20", oi["20"]], ["16.01", "20.01", oi["20.01"]],
  ];
  const somaP400Receitas = c6 + espelho.reduce((s, [, , v]) => s + n(v), 0) + n(e.csllExtras?.diferido) + n(e.csllExtras?.precosTransferencia);
  const somaP400Ded = n(dd["22"]) + n(dd["23"]) + n(dd["25.01"]) + n(dd["25.02"]) + n(dd["24"]);
  const subtotalCsll = r2(somaP400Receitas - somaP400Ded);
  const baseCsll = lc ? (subtotalCsll > 0 ? r2(subtotalCsll + lc.adicionalCsll) : 0) : subtotalCsll;
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
    ...(lc ? lc.p400 : []),
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
    ...(lc ? lc.p500 : []),
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


// ---------------------------------------------------------------------------------------------------------------------
// Lei Complementar 224/25 (A partir de 01/01/2026) — adicional sobre a receita que excede R$ 1.250.000 por trimestre.
// Fórmulas: tabelas dinâmicas P200 (25100–25250), P300 (18100–18500), P400 (20100–20230) e P500 (18100–18500).
// ---------------------------------------------------------------------------------------------------------------------
const LIMITE_TRIMESTRE = 1_250_000;
const PERIODOS: PeriodoPresumido[] = ["T01", "T02", "T03", "T04"];

interface SerieLimite {
  r110: number[]; r120: number[]; r130: number[]; r140: number[]; r150: number[]; r160: number[]; r170: number[]; r180: number; r190: number; r200: number[];
  ultimo: number;
}

/** Linhas 110 a 200 (P200 25.xxx / P400 20.xxx). `receita[q]` e `presente[q]`/`ativo[q]` indexados por trimestre 0..3. */
function limitesLc224(receita: number[], presente: boolean[], ativo: boolean[]): SerieLimite {
  const idx = [0, 1, 2, 3];
  const pres = idx.filter((q) => presente[q]);
  const primeiro = pres[0];
  const ultimo = pres[pres.length - 1];
  const r110 = idx.map((q) => (presente[q] ? receita[q] : 0));
  const r120 = idx.map((q) => idx.filter((k) => k < q && presente[k]).reduce((a, k) => a + r110[k], 0));
  const r130 = idx.map((q) => r110[q] + r120[q]);
  const r170 = [0, 0, 0, 0], r140 = [0, 0, 0, 0], r150 = [0, 0, 0, 0], r160 = [0, 0, 0, 0], r200 = [0, 0, 0, 0];
  for (const q of idx) {
    if (!presente[q] || !ativo[q]) continue;
    r140[q] = r110[q] > 0 ? (q === primeiro ? LIMITE_TRIMESTRE : LIMITE_TRIMESTRE + (q > 0 ? r170[q - 1] : 0)) : 0;
    r150[q] = r110[q] > LIMITE_TRIMESTRE && r110[q] > r140[q] ? r110[q] - r140[q] : 0;
    r160[q] = q !== primeiro ? idx.filter((k) => k >= primeiro && k < q).reduce((a, k) => a + r150[k], 0) : 0;
    r170[q] = LIMITE_TRIMESTRE > r110[q] && r110[q] > 0 ? LIMITE_TRIMESTRE - r110[q] : 0;
  }
  const r180 = pres.length * LIMITE_TRIMESTRE;
  const r190 = r130[ultimo] > r180 ? r130[ultimo] - r180 : 0;
  for (const q of idx) {
    if (!presente[q] || !ativo[q]) continue;
    if (q !== ultimo) r200[q] = r110[q] > r140[q] ? r110[q] - r140[q] : 0;
    else if (r130[ultimo] > r180 && r150[ultimo] > r160[ultimo]) r200[q] = r130[ultimo] - r180;
    else if (r150[q] > r160[q]) r200[q] = r110[q] > r140[q] ? r110[q] - r140[q] : r130[q] > r180 ? r130[q] - r180 : 0;
    else r200[q] = 0;
  }
  return { r110, r120, r130, r140, r150, r160, r170, r180, r190, r200, ultimo };
}

const sub = (v: number) => r2(v);

export function calcularAnoPresumido(par: ParametrosPresumido, entradas: EntradaTrimestrePresumido[]): ResultadoTrimestrePresumido[] {
  if (par.anoCalendario < 2026) return entradas.map((e) => calcularTrimestrePresumido(par, e));
  if (!["1", "3", "4"].includes(par.indAliquotaCsll)) throw new Error("Alíquota da CSLL não suportada (só 9%, 15% ou 20%); alíquotas múltiplas exigem o programa da ECF.");
  const q = (e: EntradaTrimestrePresumido) => PERIODOS.indexOf(e.periodo);
  const porQ: Array<EntradaTrimestrePresumido | undefined> = [0, 1, 2, 3].map((i) => entradas.find((e) => q(e) === i));
  const presente = porQ.map((e) => !!e);
  const irpjBuckets = (e?: EntradaTrimestrePresumido) => [n(e?.receitaIrpj.p16), n(e?.receitaIrpj.p8), n(e?.receitaIrpj.p16b), n(e?.receitaIrpj.p32), n(e?.receitaIrpj.p384)];
  const csllBuckets = (e?: EntradaTrimestrePresumido) => [n(e?.receitaCsll.p12), n(e?.receitaCsll.p32), n(e?.receitaCsll.p384)];
  const PCT_IRPJ = [0.016, 0.08, 0.16, 0.32, 0.384];
  const PCT_CSLL = [0.12, 0.32, 0.384];
  const PCT_CSLL_TABELA_18200 = [0.12, 0.32, 0.348]; // exatamente como na tabela P500 18200 (RFB)
  const NOME_IRPJ = ["1,6%", "8%", "16%", "32%", "38,4%"];
  const NOME_IRPJ_ADIC = ["0,16%", "0,8%", "1,6%", "3,2%", "3,84%"];
  const NOME_CSLL_ADIC = ["1,2%", "3,2%", "3,84%"];
  const ativoCsll = [0, 1, 2, 3].map((i) => presente[i] && (par.anoCalendario > 2026 || i >= 1)); // CSLL: linhas valem a partir de 01/04/2026

  const rIrpj = [0, 1, 2, 3].map((i) => irpjBuckets(porQ[i]).reduce((a, b) => a + b, 0));
  const rCsll = [0, 1, 2, 3].map((i) => csllBuckets(porQ[i]).reduce((a, b) => a + b, 0));
  const li = limitesLc224(rIrpj, presente, presente);
  const lcs = limitesLc224(rCsll, presente, ativoCsll);

  // P200(25.210–25.250) e P300(18.xxx)
  const adicIrpj = [0, 1, 2, 3].map((i) => (rIrpj[i] > 0 ? irpjBuckets(porQ[i]).map((b, k) => ((b / rIrpj[i]) * li.r200[i]) * PCT_IRPJ[k] * 0.1) : [0, 0, 0, 0, 0]));
  const ultimo = li.ultimo;
  const r18100 = (i: number) => (li.r160[ultimo] > 0 ? (li.r190 > li.r160[ultimo] ? 0 : li.r200[i] - (li.r150[i] / li.r160[ultimo]) * li.r190) : 0);
  const resultados = [0, 1, 2, 3].filter((i) => presente[i]).map((i) => {
    const e = porQ[i]!;
    const lc: DadosLc224Trimestre = {
      adicionalIrpj: sub(adicIrpj[i].reduce((a, b) => a + b, 0)),
      adicionalCsll: ativoCsll[i] ? sub((csllBuckets(e).map((b, k) => (rCsll[i] > 0 ? ((b / rCsll[i]) * lcs.r200[i]) * PCT_CSLL[k] * 0.1 : 0))).reduce((a, b) => a + b, 0)) : 0,
      p200: [], p300: [], p400: [], p500: [],
    };
    lc.p200 = [
      { codigo: "25110", descricao: "Total de Receita Bruta no Trimestre", valor: sub(li.r110[i]) },
      { codigo: "25120", descricao: "Total de Receita Bruta Acumulada - Período(s) Anterior(es)", valor: sub(li.r120[i]) },
      { codigo: "25130", descricao: "Total de Receita Bruta Acumulada", valor: sub(li.r130[i]) },
      { codigo: "25140", descricao: "Limite Individual no Trimestre", valor: sub(li.r140[i]) },
      { codigo: "25150", descricao: "Parcela Excedente ao Limite Individual no Trimestre", valor: sub(li.r150[i]) },
      { codigo: "25160", descricao: "Parcela Excedente ao Limite no(s) Trimestre(s) Anterior(es)", valor: sub(li.r160[i]) },
      { codigo: "25170", descricao: "Variação Positiva do Limite no Trimestre", valor: sub(li.r170[i]) },
      { codigo: "25180", descricao: "Limite Anual", valor: sub(li.r180) },
      { codigo: "25190", descricao: "Parcela Excedente ao Limite Anual", valor: sub(li.r190) },
      { codigo: "25200", descricao: "Base de Cálculo do Adicional da Receita Bruta", valor: sub(li.r200[i]) },
      ...adicIrpj[i].map((v, k) => ({ codigo: `252${(k + 1)}0`, descricao: `Adicional - Receita Bruta Sujeita ao Percentual de ${NOME_IRPJ_ADIC[k]}`, valor: sub(v) })),
    ];
    // P300 18xxx
    const b18100 = r18100(i);
    const b18200 = b18100 > 0 && rIrpj[i] > 0 ? irpjBuckets(e).reduce((a, b, k) => a + ((b / rIrpj[i]) * b18100) * PCT_IRPJ[k] * 0.1, 0) : 0;
    lc.p300 = [
      { codigo: "18100", descricao: "Receita Bruta Adicionada a Maior no Trimestre", valor: sub(b18100) },
      { codigo: "18200", descricao: "Base de Cálculo Adicionado a Maior no Trimestre", valor: sub(b18200) },
    ];
    // P400 20xxx
    if (ativoCsll[i]) {
      lc.p400 = [
        { codigo: "20110", descricao: "Total de Receita Bruta no Trimestre", valor: sub(lcs.r110[i]) },
        { codigo: "20120", descricao: "Total de Receita Bruta Acumulada - Período(s) Anterior(es)", valor: sub(lcs.r120[i]) },
        { codigo: "20130", descricao: "Total de Receita Bruta Acumulada", valor: sub(lcs.r130[i]) },
        { codigo: "20140", descricao: "Limite Individual no Trimestre", valor: sub(lcs.r140[i]) },
        { codigo: "20150", descricao: "Parcela Excedente ao Limite Individual no Trimestre", valor: sub(lcs.r150[i]) },
        { codigo: "20160", descricao: "Parcela Excedente ao Limite no(s) Trimestre(s) Anterior(es)", valor: sub(lcs.r160[i]) },
        { codigo: "20170", descricao: "Variação Positiva do Limite no Trimestre", valor: sub(lcs.r170[i]) },
        { codigo: "20180", descricao: "Limite Anual", valor: sub(lcs.r180) },
        { codigo: "20190", descricao: "Parcela Excedente ao Limite Anual", valor: sub(lcs.r190) },
        { codigo: "20200", descricao: "Base de Cálculo do Adicional da Receita Bruta", valor: sub(lcs.r200[i]) },
        ...csllBuckets(e).map((b, k) => ({ codigo: `202${(k + 1)}0`, descricao: `Adicional - Receita Bruta Sujeita ao Percentual de ${NOME_CSLL_ADIC[k]}`, valor: sub(rCsll[i] > 0 ? ((b / rCsll[i]) * lcs.r200[i]) * PCT_CSLL[k] * 0.1 : 0) })),
      ];
      const c18100 = lcs.r160[lcs.ultimo] > 0 ? (lcs.r190 > lcs.r160[lcs.ultimo] ? 0 : lcs.r200[i] - (lcs.r150[i] / lcs.r160[lcs.ultimo]) * lcs.r190) : 0;
      const c18200 = c18100 > 0 && rCsll[i] > 0 ? csllBuckets(e).reduce((a, b, k) => a + ((b / rCsll[i]) * c18100) * PCT_CSLL_TABELA_18200[k] * 0.1, 0) : 0;
      lc.p500 = [
        { codigo: "18100", descricao: "Receita Bruta Adicionada a Maior no Trimestre", valor: sub(c18100) },
        { codigo: "18200", descricao: "Base de Cálculo Adicionado a Maior no Trimestre", valor: sub(c18200) },
      ];
    }
    void NOME_IRPJ;
    return { i, e, lc };
  });

  const base = resultados.map(({ e, lc }) => calcularTrimestrePresumido(par, e, lc));

  // 18.300 e 18.500 (tributo pago a maior) dependem do resultado de cada trimestre
  const aliqCsll = par.indAliquotaCsll === "1" ? 0.09 : par.indAliquotaCsll === "3" ? 0.2 : 0.15;
  let totalIrpjMaior = 0, totalCsllMaior = 0;
  const ext = base.map((r, pos) => {
    const { i, lc } = resultados[pos];
    const b18200 = lc.p300.find((l) => l.codigo === "18200")!.valor || 0;
    const p300_3 = r.p300.find((l) => l.codigo === "3")!.valor || 0;
    const p300_4 = r.p300.find((l) => l.codigo === "4")!.valor || 0;
    const base1 = r.baseIrpj;
    const b18300 = p300_3 + p300_4 > 0 && b18200 > 0 ? Math.round(((p300_3 + p300_4) - (((base1 - b18200) * 0.15) + (((base1 - b18200) - 3 * 20000) * 0.1))) * 100) / 100 : 0;
    totalIrpjMaior += b18300;
    let c18300 = 0;
    if (ativoCsll[i]) {
      const c18200 = lc.p500.find((l) => l.codigo === "18200")!.valor || 0;
      const p500_2 = r.p500.find((l) => l.codigo === "2")!.valor || 0;
      if (p500_2 > 0 && c18200 > 0) c18300 = Math.round((p500_2 - (r.baseCsll - c18200) * aliqCsll) * 100) / 100;
    }
    totalCsllMaior += c18300;
    return { i, b18300, c18300, ativo: ativoCsll[i] };
  });
  return base.map((r, pos) => {
    const x = ext[pos];
    r.p300.push({ codigo: "18300", descricao: "Tributo Pago a Maior no Trimestre", valor: sub(x.b18300) }, { codigo: "18500", descricao: "Total do Tributo Pago a Maior", valor: sub(totalIrpjMaior) });
    if (x.ativo) r.p500.push({ codigo: "18300", descricao: "Tributo Pago a Maior no Trimestre", valor: sub(x.c18300) }, { codigo: "18500", descricao: "Total do Tributo Pago a Maior", valor: sub(totalCsllMaior) });
    return r;
  });
}

/** Situação do limite da LC 224/25 por trimestre (só receita): usada pela Agente de voz e pelo robô, sem depender de atividade. */
export function situacaoLimiteLc224(receitaPorTrimestre: number[]): { trimestres: Array<{ periodo: PeriodoPresumido; receita: number; limite: number; excedente: number }>; limiteAnual: number; receitaAcumulada: number; excedenteAnual: number } {
  const presente = receitaPorTrimestre.map((v) => v !== undefined);
  const s = limitesLc224(receitaPorTrimestre.map((v) => n(v)), presente, presente);
  return {
    trimestres: PERIODOS.map((periodo, i) => ({ periodo, receita: r2(s.r110[i]), limite: r2(s.r140[i]), excedente: r2(s.r150[i]) })),
    limiteAnual: r2(s.r180), receitaAcumulada: r2(s.r130[s.ultimo]), excedenteAnual: r2(s.r190),
  };
}
