import type { ContaPlano, LancamentoContabil } from "../types";
import { converterCentavos, gerarRelatoriosContabeis, normalizarDataContabil } from "./livrosContabeis";
import { resultadoDoPeriodo } from "./analiseContabil";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---- DLPA gerencial (Lei 6.404/1976, art. 186): saldo inicial, resultado do exercício, outros movimentos e saldo final ----
export type MovimentoLucros = { data: string; historico: string; contaContra: string; centavos: number }; // + aumenta lucros acumulados, − reduz
export type Dlpa = {
  ano: number; contasLucros: ContaPlano[]; saldoInicial: number; resultadoExercicio: number; outrosMovimentos: MovimentoLucros[]; totalOutros: number; saldoFinal: number;
  avisoEncerramento: boolean;
};

export function contasLucrosPrejuizos(contas: ContaPlano[]): ContaPlano[] {
  return contas.filter((c) => c.tipo === "analitica" && /(lucros?|prejuizos?)\s+acumulad/.test(sem(c.descricao || "")));
}

// Resultado do exercício = receitas − despesas do ano (DRE gerencial). Se já houve lançamento de encerramento nas contas de lucros acumulados
// (crédito vindo de apuração), o resultado apareceria duas vezes: por isso os créditos "Apuração/Resultado" são sinalizados em avisoEncerramento.
export function gerarDlpa(contas: ContaPlano[], lancamentos: LancamentoContabil[], ano: number): Dlpa {
  const lucros = contasLucrosPrejuizos(contas);
  const codigos = new Set(lucros.map((c) => c.codigo));
  const naturezaCredora = (cod: string) => (lucros.find((c) => c.codigo === cod)?.natureza ?? "C") === "C";
  const inicioAno = `${ano}-01-01`, fimAno = `${ano}-12-31`;
  // saldo inicial: lançamentos anteriores ao ano + saldo inicial cadastrado (via relatórios até dezembro do ano anterior)
  let saldoInicial = 0;
  const relAnt = gerarRelatoriosContabeis(contas, lancamentos, "todos");
  for (const item of relAnt.validos) {
    if (item.dataISO >= inicioAno) continue;
    if (codigos.has(item.credito.codigo)) saldoInicial += item.valorCentavos;
    if (codigos.has(item.debito.codigo)) saldoInicial -= item.valorCentavos;
  }
  for (const c of lucros) {
    if (c.saldoInicialConvertidoEm) continue;
    const s = converterCentavos(c.saldoInicial ?? 0) ?? 0;
    const comp = String(c.saldoInicialCompetencia || "");
    if (s && /^\d{4}-\d{2}$/.test(comp) && `${comp}-01` <= inicioAno) saldoInicial += c.natureza === "C" ? s : -s;
  }
  const outros: MovimentoLucros[] = [];
  let avisoEncerramento = false;
  for (const item of relAnt.validos) {
    if (item.dataISO < inicioAno || item.dataISO > fimAno) continue;
    const deb = codigos.has(item.debito.codigo), cre = codigos.has(item.credito.codigo);
    if (!deb && !cre) continue;
    const contra = cre ? item.debito : item.credito;
    const sinal = cre && !deb ? 1 : deb && !cre ? -1 : 0;
    if (sinal === 0) continue; // transferência entre contas de lucros/prejuízos: efeito nulo
    if (sinal === 1 && /(apuracao|resultado\s+do\s+exercicio|resultado\s+do\s+periodo)/.test(sem(contra.descricao || ""))) avisoEncerramento = true;
    outros.push({ data: item.dataISO, historico: item.original.historico, contaContra: `${contra.codigo} ${contra.descricao}`, centavos: sinal * item.valorCentavos });
  }
  // resultado do ano: soma dos 12 meses
  let resultado = 0;
  for (let m = 1; m <= 12; m++) resultado += resultadoDoPeriodo(contas, lancamentos, `${ano}-${String(m).padStart(2, "0")}`).resultado;
  const totalOutros = outros.reduce((t, x) => t + x.centavos, 0);
  void naturezaCredora; void normalizarDataContabil;
  return { ano, contasLucros: lucros, saldoInicial, resultadoExercicio: resultado, outrosMovimentos: outros, totalOutros, saldoFinal: saldoInicial + resultado + totalOutros, avisoEncerramento };
}

// ---- Provisões mensais de férias e 13º sobre a folha bruta do DP ----
// Férias: 1/12 da base + 1/3 constitucional (CF, art. 7º, XVII). 13º: 1/12 (Lei 4.749/1965). Encargos: % informado pelo usuário sobre as duas provisões.
export type ProvisaoFolha = { baseCentavos: number; ferias: number; tercoFerias: number; decimoTerceiro: number; encargos: number; totalFerias: number; totalDecimo: number; total: number };
export function baseFolhaBruta(lancamentos: LancamentoContabil[], competencia: string): number {
  let t = 0;
  for (const l of lancamentos) {
    if (l.origem !== "DP — Folha" || l.statusManual === "pendente_aprovacao" || l.statusManual === "rejeitado") continue;
    const d = normalizarDataContabil(l.data), v = converterCentavos(l.valor);
    if (d && v && v > 0 && d.slice(0, 7) === competencia) t += v;
  }
  return t;
}
export function calcularProvisaoFolha(baseCentavos: number, percentualEncargos: number): ProvisaoFolha {
  const base = Math.max(0, Math.round(baseCentavos));
  const ferias = Math.round(base / 12), terco = Math.round(ferias / 3), decimo = Math.round(base / 12);
  const pe = Math.max(0, percentualEncargos) / 100;
  const encFerias = Math.round((ferias + terco) * pe), encDecimo = Math.round(decimo * pe);
  return { baseCentavos: base, ferias, tercoFerias: terco, decimoTerceiro: decimo, encargos: encFerias + encDecimo, totalFerias: ferias + terco + encFerias, totalDecimo: decimo + encDecimo, total: ferias + terco + decimo + encFerias + encDecimo };
}
