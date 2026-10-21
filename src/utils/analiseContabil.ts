import type { CentroCustoContabil, ContaPlano, LancamentoContabil } from "../types";
import { gerarRelatoriosContabeis, moedaContabil, normalizarDataContabil, converterCentavos } from "./livrosContabeis";

export type GrupoDemonstracao = "receita" | "despesa" | "ativo" | "passivo" | "patrimonio" | null;

// Classificação pelo caminho de descrições do plano (mesma regra usada nas demonstrações gerenciais dos Livros).
export function grupoDemonstracao(conta: ContaPlano, contas: ContaPlano[]): GrupoDemonstracao {
  const caminho = contas
    .filter((item) => item.codigo === conta.codigo || conta.codigo.startsWith(`${item.codigo}.`))
    .sort((a, b) => a.codigo.length - b.codigo.length)
    .map((item) => item.descricao || "")
    .join(" ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/patrimonio\s+liquido|capital\s+social|reservas?\s+(de\s+)?lucros?/.test(caminho)) return "patrimonio";
  if (/receita|faturamento/.test(caminho)) return "receita";
  if (/despesa|custo/.test(caminho)) return "despesa";
  if (/ativo/.test(caminho)) return "ativo";
  if (/passivo|obrigacoes|fornecedores|impostos\s+a\s+recolher|salarios\s+a\s+pagar|emprestimos/.test(caminho)) return "passivo";
  return null;
}

export type ResultadoConta = { codigo: string; descricao: string; grupo: "receita" | "despesa"; centavos: number };
export type ResultadoPeriodo = { contas: ResultadoConta[]; receitas: number; despesas: number; resultado: number };

// Resultado do mês (YYYY-MM) a partir dos lançamentos definitivos válidos. Receita = créditos − débitos; despesa = débitos − créditos.
export function resultadoDoPeriodo(contas: ContaPlano[], lancamentos: LancamentoContabil[], periodo: string): ResultadoPeriodo {
  const rel = gerarRelatoriosContabeis(contas, lancamentos, periodo);
  const mapa = new Map<string, ResultadoConta>();
  const grupos = new Map<string, "receita" | "despesa" | null>();
  const grupoDe = (c: ContaPlano) => { if (!grupos.has(c.codigo)) { const g = grupoDemonstracao(c, contas); grupos.set(c.codigo, g === "receita" || g === "despesa" ? g : null); } return grupos.get(c.codigo)!; };
  for (const item of rel.doPeriodo) {
    for (const [conta, sinal] of [[item.debito, -1], [item.credito, 1]] as const) {
      if (conta.tipo !== "analitica") continue;
      const g = grupoDe(conta);
      if (!g) continue;
      const atual = mapa.get(conta.codigo) ?? { codigo: conta.codigo, descricao: conta.descricao, grupo: g, centavos: 0 };
      // receita cresce com crédito; despesa cresce com débito
      atual.centavos += g === "receita" ? sinal * item.valorCentavos : -sinal * item.valorCentavos;
      mapa.set(conta.codigo, atual);
    }
  }
  const lista = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const receitas = lista.filter((c) => c.grupo === "receita").reduce((t, c) => t + c.centavos, 0);
  const despesas = lista.filter((c) => c.grupo === "despesa").reduce((t, c) => t + c.centavos, 0);
  return { contas: lista, receitas, despesas, resultado: receitas - despesas };
}

export function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
export function mesmoMesAnoAnterior(periodo: string): string {
  const [a, m] = periodo.split("-");
  return `${Number(a) - 1}-${m}`;
}

// Variação percentual; null quando a base é zero (não existe percentual definido).
export function variacaoPercentual(atual: number, base: number): number | null {
  if (base === 0) return null;
  return Math.round(((atual - base) / Math.abs(base)) * 1000) / 10;
}

export type LinhaComparativo = { codigo: string; descricao: string; grupo: "receita" | "despesa"; atual: number; mesAnterior: number; anoAnterior: number; varMes: number | null; varAno: number | null };
export type Comparativo = { periodo: string; periodoMesAnterior: string; periodoAnoAnterior: string; linhas: LinhaComparativo[]; totais: { receitas: [number, number, number]; despesas: [number, number, number]; resultado: [number, number, number] } };

export function compararPeriodos(contas: ContaPlano[], lancamentos: LancamentoContabil[], periodo: string): Comparativo {
  const pAnt = mesAnterior(periodo), pAno = mesmoMesAnoAnterior(periodo);
  const a = resultadoDoPeriodo(contas, lancamentos, periodo), b = resultadoDoPeriodo(contas, lancamentos, pAnt), c = resultadoDoPeriodo(contas, lancamentos, pAno);
  const codigos = new Set([...a.contas, ...b.contas, ...c.contas].map((x) => x.codigo));
  const val = (r: ResultadoPeriodo, cod: string) => r.contas.find((x) => x.codigo === cod)?.centavos ?? 0;
  const info = (cod: string) => [...a.contas, ...b.contas, ...c.contas].find((x) => x.codigo === cod)!;
  const linhas = [...codigos].sort().map((cod) => ({ codigo: cod, descricao: info(cod).descricao, grupo: info(cod).grupo, atual: val(a, cod), mesAnterior: val(b, cod), anoAnterior: val(c, cod), varMes: variacaoPercentual(val(a, cod), val(b, cod)), varAno: variacaoPercentual(val(a, cod), val(c, cod)) }));
  return { periodo, periodoMesAnterior: pAnt, periodoAnoAnterior: pAno, linhas, totais: { receitas: [a.receitas, b.receitas, c.receitas], despesas: [a.despesas, b.despesas, c.despesas], resultado: [a.resultado, b.resultado, c.resultado] } };
}

// Explicações simples e verificáveis: só descrevem a variação numérica, sem inventar causa.
export function explicarVariacoes(comp: Comparativo, limitePercentual = 10, minimoCentavos = 10000): string[] {
  const out: string[] = [];
  for (const l of comp.linhas) {
    const tipo = l.grupo === "receita" ? "A receita" : "A despesa";
    const diff = l.atual - l.mesAnterior;
    if (l.mesAnterior === 0 && l.atual !== 0 && Math.abs(l.atual) >= minimoCentavos) { out.push(`${tipo} "${l.descricao}" não tinha movimento no mês anterior e teve ${moedaContabil(l.atual)} neste mês.`); continue; }
    if (l.varMes === null || Math.abs(diff) < minimoCentavos || Math.abs(l.varMes) < limitePercentual) continue;
    out.push(`${tipo} "${l.descricao}" ${diff > 0 ? "aumentou" : "diminuiu"} ${Math.abs(l.varMes).toLocaleString("pt-BR")}% em relação ao mês anterior (de ${moedaContabil(l.mesAnterior)} para ${moedaContabil(l.atual)}).`);
  }
  return out;
}

export type ResultadoCentro = { centro: string; nome: string; receitas: number; despesas: number; resultado: number };
// Resultado por centro de custo: cada ponta do lançamento usa o centro do débito/crédito, ou o centro único do lançamento.
export function resultadoPorCentroCusto(contas: ContaPlano[], lancamentos: LancamentoContabil[], centros: CentroCustoContabil[], periodo: string): ResultadoCentro[] {
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
  const nomes = new Map(centros.map((c) => [c.codigo, c.nome]));
  const acc = new Map<string, ResultadoCentro>();
  const tocar = (cod: string) => { if (!acc.has(cod)) acc.set(cod, { centro: cod, nome: cod ? (nomes.get(cod) ?? cod) : "Sem centro de custo", receitas: 0, despesas: 0, resultado: 0 }); return acc.get(cod)!; };
  for (const l of lancamentos) {
    if (l.statusManual === "pendente_aprovacao" || l.statusManual === "rejeitado") continue;
    const data = normalizarDataContabil(l.data);
    const valor = converterCentavos(l.valor);
    if (!data || valor === null || valor <= 0 || data.slice(0, 7) !== periodo) continue;
    const pontas: Array<[string | undefined, string | undefined, number]> = [
      [l.contaDebitoCodigo, l.centroCustoDebitoCodigo ?? l.centroCustoCodigo, -1],
      [l.contaCreditoCodigo, l.centroCustoCreditoCodigo ?? l.centroCustoCodigo, 1],
    ];
    for (const [codConta, centro, sinal] of pontas) {
      const conta = codConta ? porCodigo.get(codConta) : undefined;
      if (!conta || conta.tipo !== "analitica") continue;
      const g = grupoDemonstracao(conta, contas);
      if (g !== "receita" && g !== "despesa") continue;
      const r = tocar(centro ?? "");
      if (g === "receita") r.receitas += sinal * valor; else r.despesas += -sinal * valor;
    }
  }
  return [...acc.values()].map((r) => ({ ...r, resultado: r.receitas - r.despesas })).sort((a, b) => a.nome.localeCompare(b.nome));
}
