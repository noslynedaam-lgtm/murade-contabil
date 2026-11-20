// Demonstrações para o contador e para o cliente: DFC (indireto e direto), DMPL, índices, séries de 12 meses,
// DRE e balanço resumidos e o modelo simples de notas explicativas para ME/EPP.
//
// FONTES (CFC — Normas Brasileiras de Contabilidade):
//  - NBC TG 03 (R3) e NBC TG 1001, seção 7 (DFC): atividades operacionais (principais atividades geradoras de resultado),
//    de investimento (aquisição/alienação de ativos de uso e outros investimentos) e de financiamento (empréstimos e
//    capital próprio); método indireto parte do resultado e ajusta itens sem caixa e variações de capital de giro (7.6/7.7);
//    juros/dividendos pagos em financiamento e recebidos em investimento (NBC TG 1001, 7.9); IR/CSLL nas operacionais (7.10).
//  - NBC TG 26 (R5) e NBC TG 1001, seção 6 (DMPL): saldos iniciais, ajustes, resultado, dividendos, aumentos/reduções de
//    capital e saldos finais (6.1); só DLPA quando as mutações forem só em lucros acumulados (6.2).
//  - NBC TG 1002 (Microentidades): conjunto = Balanço, DRE e DLPA (3.6); notas não obrigatórias mas incentivadas (3.7);
//    declarar conformidade e a atividade (3.2), incertezas de continuidade (3.3), adoção da norma (35.5).
//  - NBC TG 1001 (Pequenas Empresas): conjunto completo inclui DMPL, DFC e notas (3.5); notas com base de elaboração,
//    políticas, estimativas e julgamentos (8.4) e declaração de conformidade (3.2).
// Índices (liquidez, endividamento, margens) são fórmulas usuais de análise das demonstrações: não são norma; a tela
// mostra a fórmula de cada um. Tudo aqui é cálculo puro e gerencial: nada é gravado e nada substitui a revisão do contador.
import type { ContaPlano, EmpresaDados, LancamentoContabil } from "../types";
import { gerarRelatoriosContabeis, type LancamentoValidado } from "./livrosContabeis";

const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

export function mesAnteriorDe(c: string): string {
  const [a, m] = c.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  if (!COMP.test(de) || !COMP.test(ate) || de > ate) return out;
  let c = de;
  while (c <= ate && out.length < 240) { out.push(c); const [a, m] = c.split("-").map(Number); c = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Classificação das contas para as demonstrações
// ---------------------------------------------------------------------------------------------------------------
export type CategoriaDemonstracao =
  | "caixa" | "ac_operacional" | "estoque" | "investimento_cp" | "rlp" | "investimento" | "imobilizado" | "depreciacao_acumulada"
  | "pc_operacional" | "emprestimo_cp" | "dividendos_pagar" | "pnc_operacional" | "emprestimo_lp"
  | "capital" | "reservas" | "lucros_acumulados" | "pl_outros"
  | "receita_bruta" | "deducao" | "custo" | "despesa" | "depreciacao" | "receita_financeira" | "despesa_financeira" | "outras_receitas" | "tributos_lucro"
  | "ignorar" | "nao_classificada";

export const ROTULO_CATEGORIA: Record<CategoriaDemonstracao, string> = {
  caixa: "Caixa e equivalentes de caixa",
  ac_operacional: "Ativo circulante operacional (clientes, adiantamentos, impostos a recuperar, despesas antecipadas)",
  estoque: "Estoques",
  investimento_cp: "Aplicações e títulos no circulante (atividade de investimento)",
  rlp: "Realizável a longo prazo",
  investimento: "Investimentos (participações e aplicações de longo prazo)",
  imobilizado: "Imobilizado e intangível (custo)",
  depreciacao_acumulada: "Depreciação / amortização acumulada",
  pc_operacional: "Passivo circulante operacional (fornecedores, tributos, salários, contas a pagar, provisões)",
  emprestimo_cp: "Empréstimos e financiamentos no circulante",
  dividendos_pagar: "Lucros / dividendos a pagar",
  pnc_operacional: "Passivo não circulante operacional",
  emprestimo_lp: "Empréstimos e financiamentos no não circulante",
  capital: "Capital social",
  reservas: "Reservas",
  lucros_acumulados: "Lucros ou prejuízos acumulados",
  pl_outros: "Outras contas do patrimônio líquido",
  receita_bruta: "Receita bruta",
  deducao: "Deduções da receita (devoluções, abatimentos, tributos sobre vendas)",
  custo: "Custos (CMV, CPV, custo dos serviços)",
  despesa: "Despesas operacionais",
  depreciacao: "Despesa de depreciação / amortização (não mexe no caixa)",
  receita_financeira: "Receitas financeiras",
  despesa_financeira: "Despesas financeiras (juros, tarifas)",
  outras_receitas: "Outras receitas",
  tributos_lucro: "IRPJ e CSLL sobre o lucro",
  ignorar: "Fora das demonstrações (contas de compensação e de apuração)",
  nao_classificada: "Não classificada — escolha a categoria",
};
export const CATEGORIAS_PATRIMONIAIS: CategoriaDemonstracao[] = ["caixa", "ac_operacional", "estoque", "investimento_cp", "rlp", "investimento", "imobilizado", "depreciacao_acumulada", "pc_operacional", "emprestimo_cp", "dividendos_pagar", "pnc_operacional", "emprestimo_lp", "capital", "reservas", "lucros_acumulados", "pl_outros"];
export const CATEGORIAS_RESULTADO: CategoriaDemonstracao[] = ["receita_bruta", "deducao", "custo", "despesa", "depreciacao", "receita_financeira", "despesa_financeira", "outras_receitas", "tributos_lucro"];
export const TODAS_CATEGORIAS: CategoriaDemonstracao[] = [...CATEGORIAS_PATRIMONIAIS, ...CATEGORIAS_RESULTADO, "ignorar"];
export const ehCategoriaValida = (v: unknown): v is CategoriaDemonstracao => typeof v === "string" && (TODAS_CATEGORIAS as string[]).includes(v);

const caminhoDe = (conta: ContaPlano, contas: ContaPlano[]): string => sem(contas
  .filter((item) => item.codigo === conta.codigo || conta.codigo.startsWith(`${item.codigo}.`))
  .sort((a, b) => a.codigo.length - b.codigo.length)
  .map((item) => item.descricao || "")
  .join(" | "));

/** Categoria sugerida pelo sistema, só pelas descrições da conta e dos grupos superiores. Sem certeza: "nao_classificada". */
export function sugerirCategoria(conta: ContaPlano, contas: ContaPlano[]): CategoriaDemonstracao {
  const c = caminhoDe(conta, contas);
  const d = sem(conta.descricao || "");
  if (/compensac|transitori|apuracao do resultado|apuracao de resultado|destinacao \/ apuracao|contas de destinacao/.test(c)) return "ignorar";
  // Patrimônio líquido (antes de "passivo", porque o PL costuma estar dentro do grupo 2 — Passivo)
  if (/patrimonio\s+liquido/.test(c) || /capital\s+social|reservas?\s+de\s+lucro|lucros?\s+(ou\s+prejuizos?\s+)?acumulad|prejuizos?\s+acumulad/.test(d)) {
    if (/capital/.test(d) && !/reserva/.test(d)) return "capital";
    if (/reserva/.test(d)) return "reservas";
    if (/lucro|prejuizo|resultado|deficit|superavit/.test(d)) return "lucros_acumulados";
    if (/capital/.test(c) && !/reserva/.test(c)) return "capital";
    if (/reserva/.test(c)) return "reservas";
    if (/lucro|prejuizo|resultado|deficit/.test(c)) return "lucros_acumulados";
    return "pl_outros";
  }
  const naoCirc = /nao\s+circulante|longo\s+prazo|exigivel a longo/.test(c);
  if (/^ativo|\| ?ativo|^1\b/.test(c) || /\bativo\b/.test(c)) {
    if (/deprecia|amortiza|exaust/.test(d) || /depreciacao acumulada|amortizacao acumulada/.test(c)) return "depreciacao_acumulada";
    if (/imobilizado|intangivel/.test(c)) return "imobilizado";
    if (/investimento/.test(c) && naoCirc) return "investimento";
    if (/realizavel a longo/.test(c)) return "rlp";
    if (naoCirc) return "rlp";
    if (/disponi|caixa|bancos?\s|banco\b|numerario|conta movimento/.test(c) && (!/aplicac/.test(d) || /liquidez imediata/.test(d))) return "caixa";
    if (/estoque|mercadoria.*revenda|materia.prima/.test(c)) return "estoque";
    if (/titulos e valores|aplicac(ao|oes) financeira/.test(c)) return "investimento_cp";
    if (/circulante/.test(c)) return "ac_operacional";
    return "nao_classificada";
  }
  if (/passivo|obrigacoes|exigivel/.test(c)) {
    const emprest = /emprestimo|financiamento/.test(c) && !/fornecedor/.test(d);
    if (/dividendo|lucros? a (pagar|distribuir)/.test(d)) return "dividendos_pagar";
    if (naoCirc) return emprest ? "emprestimo_lp" : "pnc_operacional";
    if (/circulante/.test(c)) return emprest ? "emprestimo_cp" : "pc_operacional";
    return "nao_classificada";
  }
  // Resultado
  if (/receita|faturamento/.test(c) && !/despesa|custo/.test(d)) {
    if (/deduc|devoluc|abatimento|cancelad|impostos? sobre (vendas|servicos)|tributos? sobre (vendas|receita)/.test(c)) return "deducao";
    const proximo = sem([conta, ...contas.filter((x) => conta.codigo.startsWith(`${x.codigo}.`) && x.nivel >= 3)].map((x) => x.descricao || "").join(" | "));
    if (/financeir|juros|rendimento|variac(ao|oes) monetaria|descontos obtidos/.test(proximo)) return "receita_financeira";
    if (/receita\s+bruta|vendas|servicos|faturamento/.test(c) && !/outras|patrimon/.test(c)) return "receita_bruta";
    return "outras_receitas";
  }
  if (/despesa|custo|deduc/.test(c)) {
    if (/deduc/.test(c)) return "deducao";
    if (/\birpj\b|\bcsll\b|imposto de renda|contribuicao social sobre o lucro|provisao para (ir|imposto de renda|csll)/.test(d)) return "tributos_lucro";
    if (/deprecia|amortiza|exaust/.test(d)) return "depreciacao";
    if (/financeir/.test(c) || /juros|tarifa bancaria|despesas bancarias|iof/.test(d)) return "despesa_financeira";
    if (/custo/.test(d) || (/custo/.test(c) && !/despesa/.test(d))) return "custo";
    return "despesa";
  }
  return "nao_classificada";
}

/** Categoria final: a escolhida pela contadora (empresa.classificacaoDemonstracoes) ou a sugerida pelo sistema. */
export function categoriaDaConta(conta: ContaPlano, contas: ContaPlano[], ajustes?: Record<string, string>): CategoriaDemonstracao {
  const escolhida = ajustes?.[conta.codigo];
  return ehCategoriaValida(escolhida) ? escolhida : sugerirCategoria(conta, contas);
}

export function mapaCategorias(contas: ContaPlano[], ajustes?: Record<string, string>): Map<string, CategoriaDemonstracao> {
  const m = new Map<string, CategoriaDemonstracao>();
  for (const c of contas) if (c.tipo === "analitica") m.set(c.codigo, categoriaDaConta(c, contas, ajustes));
  return m;
}

const ehResultado = (cat: CategoriaDemonstracao) => (CATEGORIAS_RESULTADO as string[]).includes(cat);

// ---------------------------------------------------------------------------------------------------------------
// Saldos (assinados: devedor positivo, credor negativo) no fim de uma competência, pelo mesmo cálculo do balancete
// ---------------------------------------------------------------------------------------------------------------
export function saldosNoFimDe(contas: ContaPlano[], lancamentos: LancamentoContabil[], competencia: string): Map<string, number> {
  const rel = gerarRelatoriosContabeis(contas, lancamentos, competencia);
  const m = new Map<string, number>();
  for (const l of rel.balancete) if (l.conta.tipo === "analitica") m.set(l.conta.codigo, l.saldoDevedorCentavos - l.saldoCredorCentavos);
  return m;
}

function validosDoIntervalo(contas: ContaPlano[], lancamentos: LancamentoContabil[], de: string, ate: string): LancamentoValidado[] {
  return gerarRelatoriosContabeis(contas, lancamentos, "todos").validos.filter((v) => v.dataISO.slice(0, 7) >= de && v.dataISO.slice(0, 7) <= ate);
}

const semEnc = (ls: LancamentoContabil[]) => ls.filter((l) => l?.tipoEspecial !== "encerramento");

/** Saldo inicial cadastrado (abertura) com competência-base dentro do intervalo: distorce variações; a tela avisa. */
function aberturasDentro(contas: ContaPlano[], de: string, ate: string): ContaPlano[] {
  return contas.filter((c) => c.tipo === "analitica" && Number(c.saldoInicial || 0) !== 0 && !c.saldoInicialConvertidoEm && COMP.test(String(c.saldoInicialCompetencia || "")) && String(c.saldoInicialCompetencia) > de && String(c.saldoInicialCompetencia) <= ate);
}

// ---------------------------------------------------------------------------------------------------------------
// DFC
// ---------------------------------------------------------------------------------------------------------------
export type SecaoDfc = "operacional" | "investimento" | "financiamento" | "nao_classificada";
export type LinhaDfc = { secao: SecaoDfc; rotulo: string; centavos: number; contas?: string[] };
export type Dfc = {
  de: string; ate: string;
  caixaInicial: number; caixaFinal: number; variacaoCaixa: number;
  indireto: { lucroLiquido: number; linhas: LinhaDfc[]; totais: Record<SecaoDfc, number>; soma: number };
  direto: { linhas: LinhaDfc[]; totais: Record<SecaoDfc, number>; soma: number };
  confere: boolean; diferenca: number;
  contasCaixa: string[]; naoClassificadas: Array<{ codigo: string; descricao: string; centavos: number }>;
  avisos: string[];
};

const SECAO_DA_CATEGORIA: Partial<Record<CategoriaDemonstracao, SecaoDfc>> = {
  ac_operacional: "operacional", estoque: "operacional", rlp: "operacional", pc_operacional: "operacional", pnc_operacional: "operacional",
  investimento_cp: "investimento", investimento: "investimento", imobilizado: "investimento",
  emprestimo_cp: "financiamento", emprestimo_lp: "financiamento", dividendos_pagar: "financiamento", capital: "financiamento", reservas: "financiamento", lucros_acumulados: "financiamento", pl_outros: "financiamento",
  depreciacao_acumulada: "operacional",
};
const ROTULO_INDIRETO: Partial<Record<CategoriaDemonstracao, string>> = {
  depreciacao_acumulada: "(+) Depreciação e amortização (não mexem no caixa)",
  ac_operacional: "(Aumento) / redução de clientes e outros créditos",
  estoque: "(Aumento) / redução de estoques",
  rlp: "(Aumento) / redução do realizável a longo prazo",
  pc_operacional: "Aumento / (redução) de fornecedores, tributos, salários e contas a pagar",
  pnc_operacional: "Aumento / (redução) de outras obrigações de longo prazo",
  investimento_cp: "Aplicações financeiras (aplicado) / resgatado",
  investimento: "Investimentos (aplicado) / recebido",
  imobilizado: "Compra de imobilizado e intangível / venda",
  emprestimo_cp: "Empréstimos e financiamentos de curto prazo (captados − pagos)",
  emprestimo_lp: "Empréstimos e financiamentos de longo prazo (captados − pagos)",
  dividendos_pagar: "Lucros / dividendos (a pagar: variação)",
  capital: "Aumento / (redução) de capital",
  reservas: "Movimentos em reservas",
  lucros_acumulados: "Lucros distribuídos e outros movimentos em lucros acumulados",
  pl_outros: "Outros movimentos do patrimônio líquido",
};
const zeros = (): Record<SecaoDfc, number> => ({ operacional: 0, investimento: 0, financiamento: 0, nao_classificada: 0 });

/**
 * DFC do intervalo de competências [de, ate]. Método indireto: resultado + ajustes por categoria (variação do saldo
 * de cada conta, com sinal de caixa). Método direto: cada movimento das contas de caixa pela categoria da contrapartida.
 * Encerramentos do resultado ficam de fora (o resultado é mostrado uma vez só). A soma das seções tem de bater com a variação do caixa.
 */
export function calcularDfc(contas: ContaPlano[], lancamentos: LancamentoContabil[], de: string, ate: string, ajustes?: Record<string, string>): Dfc {
  const avisos: string[] = [];
  const cats = mapaCategorias(contas, ajustes);
  const base = semEnc(lancamentos);
  const ini = saldosNoFimDe(contas, base, mesAnteriorDe(de));
  const fim = saldosNoFimDe(contas, base, ate);
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
  const caixaCodigos = [...cats].filter(([, c]) => c === "caixa").map(([k]) => k);
  if (!caixaCodigos.length) avisos.push("Nenhuma conta classificada como Caixa e equivalentes: confira a classificação das contas.");
  const delta = (cod: string) => (fim.get(cod) ?? 0) - (ini.get(cod) ?? 0);
  const caixaInicial = caixaCodigos.reduce((t, c) => t + (ini.get(c) ?? 0), 0);
  const caixaFinal = caixaCodigos.reduce((t, c) => t + (fim.get(c) ?? 0), 0);
  // Indireto
  let lucro = 0;
  const porCat = new Map<CategoriaDemonstracao, { v: number; contas: string[] }>();
  const naoClass: Dfc["naoClassificadas"] = [];
  for (const [cod, cat] of cats) {
    const d = delta(cod);
    if (!d || cat === "caixa" || cat === "ignorar") continue;
    if (ehResultado(cat)) { lucro -= d; continue; }
    if (cat === "nao_classificada") { naoClass.push({ codigo: cod, descricao: porCodigo.get(cod)?.descricao || "", centavos: -d }); continue; }
    const acc = porCat.get(cat) ?? { v: 0, contas: [] };
    acc.v += -d; acc.contas.push(cod); porCat.set(cat, acc);
  }
  const linhasInd: LinhaDfc[] = [{ secao: "operacional", rotulo: "Resultado (lucro ou prejuízo) do período", centavos: lucro }];
  const ordem: CategoriaDemonstracao[] = ["depreciacao_acumulada", "ac_operacional", "estoque", "rlp", "pc_operacional", "pnc_operacional", "investimento_cp", "investimento", "imobilizado", "emprestimo_cp", "emprestimo_lp", "dividendos_pagar", "capital", "reservas", "lucros_acumulados", "pl_outros"];
  for (const cat of ordem) { const x = porCat.get(cat); if (x && x.v) linhasInd.push({ secao: SECAO_DA_CATEGORIA[cat]!, rotulo: ROTULO_INDIRETO[cat]!, centavos: x.v, contas: x.contas }); }
  for (const n of naoClass) linhasInd.push({ secao: "nao_classificada", rotulo: `${n.codigo} ${n.descricao} (sem classificação)`, centavos: n.centavos, contas: [n.codigo] });
  const totInd = zeros();
  for (const l of linhasInd) totInd[l.secao] += l.centavos;
  const somaInd = totInd.operacional + totInd.investimento + totInd.financiamento + totInd.nao_classificada;
  // Direto
  const caixaSet = new Set(caixaCodigos);
  const acDir = new Map<string, LinhaDfc>();
  for (const v of validosDoIntervalo(contas, base, de, ate)) {
    const debCaixa = caixaSet.has(v.debito.codigo), credCaixa = caixaSet.has(v.credito.codigo);
    if (debCaixa === credCaixa) continue; // transferência entre caixa/bancos ou movimento sem caixa
    const contra = debCaixa ? v.credito : v.debito;
    const valor = debCaixa ? v.valorCentavos : -v.valorCentavos;
    const cat = cats.get(contra.codigo) ?? "nao_classificada";
    let secao: SecaoDfc; let rotulo: string;
    if (ehResultado(cat)) {
      secao = cat === "receita_financeira" ? "investimento" : cat === "despesa_financeira" ? "financiamento" : "operacional";
      rotulo = cat === "receita_bruta" || cat === "outras_receitas" ? "Recebimentos de vendas e serviços (direto na receita)"
        : cat === "receita_financeira" ? "Juros e rendimentos recebidos"
          : cat === "despesa_financeira" ? "Juros e encargos financeiros pagos"
            : cat === "tributos_lucro" ? "IRPJ e CSLL pagos" : "Pagamentos de custos e despesas (direto no resultado)";
    } else if (cat === "ac_operacional") { secao = "operacional"; rotulo = valor >= 0 ? "Recebimentos de clientes e outros créditos" : "Adiantamentos e outros créditos pagos"; }
    else if (cat === "estoque") { secao = "operacional"; rotulo = "Pagamentos de compras de estoque (à vista)"; }
    else if (cat === "pc_operacional" || cat === "pnc_operacional") { secao = "operacional"; rotulo = valor < 0 ? "Pagamentos a fornecedores, empregados, tributos e outras contas" : "Outros recebimentos operacionais"; }
    else if (cat === "rlp") { secao = "operacional"; rotulo = "Realizável a longo prazo (recebido / pago)"; }
    else if (cat === "nao_classificada" || cat === "ignorar" || cat === "depreciacao_acumulada") { secao = "nao_classificada"; rotulo = `${contra.codigo} ${contra.descricao}`; }
    else { secao = SECAO_DA_CATEGORIA[cat]!; rotulo = ROTULO_INDIRETO[cat]!.replace(/^\(\+\)\s*/, ""); }
    const chave = `${secao}|${rotulo}`;
    const atual = acDir.get(chave) ?? { secao, rotulo, centavos: 0 };
    atual.centavos += valor; acDir.set(chave, atual);
  }
  const linhasDir = [...acDir.values()].filter((l) => l.centavos !== 0);
  const ordemSec: SecaoDfc[] = ["operacional", "investimento", "financiamento", "nao_classificada"];
  linhasDir.sort((a, b) => ordemSec.indexOf(a.secao) - ordemSec.indexOf(b.secao) || b.centavos - a.centavos);
  const totDir = zeros();
  for (const l of linhasDir) totDir[l.secao] += l.centavos;
  const somaDir = totDir.operacional + totDir.investimento + totDir.financiamento + totDir.nao_classificada;
  const variacao = caixaFinal - caixaInicial;
  const abert = aberturasDentro(contas, de, ate);
  if (abert.length) avisos.push(`${abert.length} conta(s) têm saldo inicial cadastrado com competência dentro do período (${abert.slice(0, 3).map((c) => c.codigo).join(", ")}): as variações dessas contas incluem a abertura. Comece o período na competência da abertura.`);
  if (naoClass.length) avisos.push(`${naoClass.length} conta(s) com movimento estão sem classificação: classifique-as na aba "Classificação das contas" para a DFC ficar completa.`);
  const diferenca = somaInd - variacao;
  if (diferenca !== 0) avisos.push(`A soma das atividades difere da variação do caixa em ${(diferenca / 100).toFixed(2)}: há saldo inicial de abertura dentro do período ou lançamento que não fecha em partidas dobradas.`);
  return {
    de, ate, caixaInicial, caixaFinal, variacaoCaixa: variacao,
    indireto: { lucroLiquido: lucro, linhas: linhasInd, totais: totInd, soma: somaInd },
    direto: { linhas: linhasDir, totais: totDir, soma: somaDir },
    confere: diferenca === 0 && somaDir === variacao, diferenca, contasCaixa: caixaCodigos, naoClassificadas: naoClass, avisos,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// DMPL
// ---------------------------------------------------------------------------------------------------------------
export type ColunaDmpl = "capital" | "reservas" | "lucros_acumulados" | "pl_outros";
export const COLUNAS_DMPL: Array<{ id: ColunaDmpl; rotulo: string }> = [
  { id: "capital", rotulo: "Capital social" }, { id: "reservas", rotulo: "Reservas" }, { id: "lucros_acumulados", rotulo: "Lucros ou prejuízos acumulados" }, { id: "pl_outros", rotulo: "Outras contas do PL" },
];
export type LinhaDmpl = { rotulo: string; valores: Record<ColunaDmpl, number>; total: number };
export type Dmpl = { ano: number; linhas: LinhaDmpl[]; saldoInicial: LinhaDmpl; saldoFinal: LinhaDmpl; resultado: number; confereComBalanco: boolean; diferenca: number; soDlpa: boolean; avisos: string[] };

const vazio = (): Record<ColunaDmpl, number> => ({ capital: 0, reservas: 0, lucros_acumulados: 0, pl_outros: 0 });
const linha = (rotulo: string, valores: Record<ColunaDmpl, number>): LinhaDmpl => ({ rotulo, valores, total: valores.capital + valores.reservas + valores.lucros_acumulados + valores.pl_outros });

/** DMPL do ano (valores positivos = aumentam o PL). Encerramento fica fora; o resultado do ano entra em lucros acumulados uma vez. */
export function calcularDmpl(contas: ContaPlano[], lancamentos: LancamentoContabil[], ano: number, ajustes?: Record<string, string>): Dmpl {
  const avisos: string[] = [];
  const cats = mapaCategorias(contas, ajustes);
  const col = (cod: string): ColunaDmpl | null => { const c = cats.get(cod); return c === "capital" || c === "reservas" || c === "lucros_acumulados" || c === "pl_outros" ? c : null; };
  const de = `${ano}-01`, ate = `${ano}-12`;
  // Saldo inicial: com todos os lançamentos (encerramentos de anos anteriores já levaram o resultado para o PL)
  const ini = saldosNoFimDe(contas, lancamentos, mesAnteriorDe(de));
  const si = vazio();
  for (const [cod, s] of ini) { const c = col(cod); if (c) si[c] += -s; }
  // Movimentos do ano (sem encerramento)
  const grupos = new Map<string, Record<ColunaDmpl, number>>();
  const add = (rotulo: string, c: ColunaDmpl, v: number) => { const g = grupos.get(rotulo) ?? vazio(); g[c] += v; grupos.set(rotulo, g); };
  for (const v of validosDoIntervalo(contas, semEnc(lancamentos), de, ate)) {
    const cd = col(v.debito.codigo), cc = col(v.credito.codigo);
    if (!cd && !cc) continue;
    if (cd && cc) { // transferência entre contas do PL (constituição de reserva, aumento de capital com reservas/lucros)
      const rot = cc === "capital" ? "Aumento de capital com reservas/lucros" : cc === "reservas" ? "Constituição de reservas" : "Transferências entre contas do PL";
      add(rot, cd, -v.valorCentavos); add(rot, cc, v.valorCentavos); continue;
    }
    const c = (cc || cd)!; const sinal = cc ? 1 : -1;
    const contra = cc ? v.debito : v.credito;
    const catContra = cats.get(contra.codigo);
    let rot: string;
    if (catContra === "dividendos_pagar" || (sinal < 0 && c === "lucros_acumulados")) rot = "Lucros distribuídos / dividendos";
    else if (c === "capital") rot = sinal > 0 ? "Aumento de capital" : "Redução de capital";
    else if (catContra && ehResultado(catContra)) { rot = "Resultado lançado direto no PL (confira)"; avisos.push(`Lançamento de ${v.dataISO} entre o PL e conta de resultado (${contra.codigo}) fora do encerramento: confira se não é o encerramento sem a marca de encerramento.`); }
    else rot = c === "lucros_acumulados" ? "Ajustes de exercícios anteriores e outros" : c === "reservas" ? "Movimentos de reservas" : "Outros movimentos do PL";
    add(rot, c, sinal * v.valorCentavos);
  }
  // Resultado do ano
  const base = semEnc(lancamentos);
  const rIni = saldosNoFimDe(contas, base, mesAnteriorDe(de)), rFim = saldosNoFimDe(contas, base, ate);
  let resultado = 0;
  for (const [cod, cat] of cats) if (ehResultado(cat)) resultado -= (rFim.get(cod) ?? 0) - (rIni.get(cod) ?? 0);
  const linhas: LinhaDmpl[] = [];
  const res = vazio(); res.lucros_acumulados = resultado; linhas.push(linha(resultado >= 0 ? "Lucro líquido do exercício" : "Prejuízo do exercício", res));
  for (const [rot, vals] of grupos) linhas.push(linha(rot, vals));
  const sf = vazio();
  for (const k of Object.keys(sf) as ColunaDmpl[]) sf[k] = si[k] + linhas.reduce((t, l) => t + l.valores[k], 0);
  // Conferência com o balanço de 31/12: PL contábil + resultado ainda não encerrado nas contas de resultado
  const fimCompleto = saldosNoFimDe(contas, lancamentos, ate);
  let plBalanco = 0, resultadoAberto = 0;
  for (const [cod, s] of fimCompleto) { if (col(cod)) plBalanco += -s; const cat = cats.get(cod); if (cat && ehResultado(cat)) resultadoAberto += -s; }
  const totalFinal = sf.capital + sf.reservas + sf.lucros_acumulados + sf.pl_outros;
  const diferenca = totalFinal - (plBalanco + resultadoAberto);
  if (diferenca !== 0) avisos.push(`A DMPL difere do patrimônio líquido do balanço em ${(diferenca / 100).toFixed(2)}: pode haver resultado de anos anteriores nunca encerrado, conta do PL sem classificação ou saldo inicial pendente.`);
  if (resultadoAberto !== 0) avisos.push("O resultado ainda não foi encerrado nas contas: a coluna de lucros acumulados já mostra o resultado do ano, como fica depois do encerramento.");
  const soDlpa = linhas.every((l) => l.valores.capital === 0 && l.valores.reservas === 0 && l.valores.pl_outros === 0);
  return { ano, linhas, saldoInicial: linha("Saldo em 1º de janeiro", si), saldoFinal: linha("Saldo em 31 de dezembro", sf), resultado, confereComBalanco: diferenca === 0, diferenca, soDlpa, avisos };
}

// ---------------------------------------------------------------------------------------------------------------
// DRE e balanço resumidos, índices e séries
// ---------------------------------------------------------------------------------------------------------------
export type DreResumida = {
  receitaBruta: number; deducoes: number; receitaLiquida: number; custos: number; lucroBruto: number; despesas: number; depreciacao: number;
  resultadoFinanceiro: number; outrasReceitas: number; resultadoAntesTributos: number; tributosLucro: number; lucroLiquido: number; naoClassificado: number;
};
export function dreResumida(contas: ContaPlano[], lancamentos: LancamentoContabil[], de: string, ate: string, ajustes?: Record<string, string>): DreResumida {
  const cats = mapaCategorias(contas, ajustes);
  const base = semEnc(lancamentos);
  const a = saldosNoFimDe(contas, base, mesAnteriorDe(de)), b = saldosNoFimDe(contas, base, ate);
  const s: Partial<Record<CategoriaDemonstracao, number>> = {};
  let naoClass = 0;
  for (const [cod, cat] of cats) {
    const mov = -((b.get(cod) ?? 0) - (a.get(cod) ?? 0)); // credor positivo
    if (!mov) continue;
    if (cat === "nao_classificada") { const c = contas.find((x) => x.codigo === cod); if (c && /receita|despesa|custo/.test(sem(caminhoDe(c, contas)))) naoClass += mov; continue; }
    if (ehResultado(cat)) s[cat] = (s[cat] ?? 0) + mov;
  }
  const g = (k: CategoriaDemonstracao) => s[k] ?? 0;
  const receitaBruta = g("receita_bruta"), deducoes = -g("deducao"), receitaLiquida = receitaBruta - deducoes;
  const custos = -g("custo"), lucroBruto = receitaLiquida - custos;
  const despesas = -g("despesa"), depreciacao = -g("depreciacao");
  const resultadoFinanceiro = g("receita_financeira") + g("despesa_financeira");
  const outrasReceitas = g("outras_receitas");
  const resultadoAntesTributos = lucroBruto - despesas - depreciacao + resultadoFinanceiro + outrasReceitas + naoClass;
  const tributosLucro = -g("tributos_lucro");
  return { receitaBruta, deducoes, receitaLiquida, custos, lucroBruto, despesas, depreciacao, resultadoFinanceiro, outrasReceitas, resultadoAntesTributos, tributosLucro, lucroLiquido: resultadoAntesTributos - tributosLucro, naoClassificado: naoClass };
}

export type BalancoResumido = {
  ativoCirculante: number; disponivel: number; estoques: number; ativoNaoCirculante: number; ativoTotal: number;
  passivoCirculante: number; passivoNaoCirculante: number; patrimonioLiquido: number; resultadoNaoEncerrado: number; passivoMaisPl: number; naoClassificado: number;
};
export function balancoResumido(contas: ContaPlano[], lancamentos: LancamentoContabil[], competencia: string, ajustes?: Record<string, string>): BalancoResumido {
  const cats = mapaCategorias(contas, ajustes);
  const s = saldosNoFimDe(contas, lancamentos, competencia);
  const r: BalancoResumido = { ativoCirculante: 0, disponivel: 0, estoques: 0, ativoNaoCirculante: 0, ativoTotal: 0, passivoCirculante: 0, passivoNaoCirculante: 0, patrimonioLiquido: 0, resultadoNaoEncerrado: 0, passivoMaisPl: 0, naoClassificado: 0 };
  for (const [cod, cat] of cats) {
    const v = s.get(cod) ?? 0; if (!v) continue;
    switch (cat) {
      case "caixa": r.disponivel += v; r.ativoCirculante += v; break;
      case "estoque": r.estoques += v; r.ativoCirculante += v; break;
      case "ac_operacional": case "investimento_cp": r.ativoCirculante += v; break;
      case "rlp": case "investimento": case "imobilizado": case "depreciacao_acumulada": r.ativoNaoCirculante += v; break;
      case "pc_operacional": case "emprestimo_cp": case "dividendos_pagar": r.passivoCirculante += -v; break;
      case "pnc_operacional": case "emprestimo_lp": r.passivoNaoCirculante += -v; break;
      case "capital": case "reservas": case "lucros_acumulados": case "pl_outros": r.patrimonioLiquido += -v; break;
      case "ignorar": break;
      case "nao_classificada": r.naoClassificado += v; break;
      default: if (ehResultado(cat)) r.resultadoNaoEncerrado += -v;
    }
  }
  r.ativoTotal = r.ativoCirculante + r.ativoNaoCirculante;
  r.patrimonioLiquido += r.resultadoNaoEncerrado;
  r.passivoMaisPl = r.passivoCirculante + r.passivoNaoCirculante + r.patrimonioLiquido;
  return r;
}

export type Indice = { id: string; nome: string; valor: number | null; formato: "vezes" | "percentual"; formula: string; explicacao: string; leitura: string };
const div = (a: number, b: number): number | null => (b === 0 ? null : Math.round((a / b) * 10000) / 10000);

/** Índices no fim da competência (balanço) e margens do ano até a competência (DRE de janeiro até ela). */
export function calcularIndices(contas: ContaPlano[], lancamentos: LancamentoContabil[], competencia: string, ajustes?: Record<string, string>): { balanco: BalancoResumido; dre: DreResumida; indices: Indice[] } {
  const b = balancoResumido(contas, lancamentos, competencia, ajustes);
  const d = dreResumida(contas, lancamentos, `${competencia.slice(0, 4)}-01`, competencia, ajustes);
  const lc = div(b.ativoCirculante, b.passivoCirculante);
  const ls = div(b.ativoCirculante - b.estoques, b.passivoCirculante);
  const cats = mapaCategorias(contas, ajustes);
  const s = saldosNoFimDe(contas, lancamentos, competencia);
  let realizavelLP = 0; for (const [cod, cat] of cats) if (cat === "rlp") realizavelLP += s.get(cod) ?? 0;
  const lg = div(b.ativoCirculante + realizavelLP, b.passivoCirculante + b.passivoNaoCirculante);
  const end = div(b.passivoCirculante + b.passivoNaoCirculante, b.ativoTotal);
  const mb = div(d.lucroBruto, d.receitaLiquida);
  const ml = div(d.lucroLiquido, d.receitaLiquida);
  const leituraVezes = (v: number | null, bom: string, ruim: string) => (v === null ? "Sem base para calcular (divisor zero)." : v >= 1 ? bom : ruim);
  const indices: Indice[] = [
    { id: "liquidez_corrente", nome: "Liquidez corrente", valor: lc, formato: "vezes", formula: "Ativo circulante ÷ Passivo circulante", explicacao: "Quanto a empresa tem a receber e em caixa no curto prazo para cada R$ 1,00 de contas a pagar no curto prazo.", leitura: leituraVezes(lc, "Acima de 1: o que entra no curto prazo cobre as contas do curto prazo.", "Abaixo de 1: as contas de curto prazo são maiores do que o que a empresa tem para receber e em caixa.") },
    { id: "liquidez_seca", nome: "Liquidez seca", valor: ls, formato: "vezes", formula: "(Ativo circulante − Estoques) ÷ Passivo circulante", explicacao: "A mesma conta da liquidez corrente, mas sem contar o estoque (que ainda precisa ser vendido).", leitura: leituraVezes(ls, "Acima de 1: paga as contas de curto prazo mesmo sem vender o estoque.", "Abaixo de 1: depende de vender o estoque para pagar as contas de curto prazo.") },
    { id: "liquidez_geral", nome: "Liquidez geral", valor: lg, formato: "vezes", formula: "(Ativo circulante + Realizável a longo prazo) ÷ (Passivo circulante + Passivo não circulante)", explicacao: "Tudo o que a empresa tem para receber e em caixa (curto e longo prazo) para cada R$ 1,00 de dívida total.", leitura: leituraVezes(lg, "Acima de 1: os direitos cobrem todas as dívidas.", "Abaixo de 1: as dívidas totais passam dos direitos a receber e do caixa.") },
    { id: "endividamento", nome: "Endividamento geral", valor: end, formato: "percentual", formula: "(Passivo circulante + Passivo não circulante) ÷ Ativo total", explicacao: "Quanto do que a empresa tem foi pago com dinheiro de terceiros (fornecedores, bancos, impostos a pagar).", leitura: end === null ? "Sem base para calcular (ativo zero)." : end <= 0.5 ? "Até 50%: a maior parte do ativo é financiada pelos sócios." : end < 1 ? "Mais da metade do ativo é financiada por terceiros." : "As dívidas são iguais ou maiores que tudo o que a empresa tem (patrimônio líquido negativo ou zero)." },
    { id: "margem_bruta", nome: "Margem bruta", valor: mb, formato: "percentual", formula: "Lucro bruto ÷ Receita líquida (de janeiro até o mês)", explicacao: "De cada R$ 100,00 vendidos, quanto sobra depois de pagar o custo do que foi vendido.", leitura: mb === null ? "Sem receita no período." : mb > 0 ? "Positiva: a venda cobre o custo do produto ou serviço." : "Negativa: o custo do que foi vendido é maior que a venda." },
    { id: "margem_liquida", nome: "Margem líquida", valor: ml, formato: "percentual", formula: "Lucro líquido ÷ Receita líquida (de janeiro até o mês)", explicacao: "De cada R$ 100,00 vendidos, quanto sobra de lucro no fim, depois de todos os custos, despesas e impostos sobre o lucro.", leitura: ml === null ? "Sem receita no período." : ml > 0 ? "Positiva: a empresa teve lucro no período." : "Negativa: a empresa teve prejuízo no período." },
  ];
  return { balanco: b, dre: d, indices };
}

export type PontoSerie = { competencia: string; receitaLiquida: number; lucroLiquido: number };
/** Receita líquida e resultado mês a mês, nos 12 meses que terminam na competência. */
export function serie12Meses(contas: ContaPlano[], lancamentos: LancamentoContabil[], ate: string, ajustes?: Record<string, string>): PontoSerie[] {
  const meses: string[] = [];
  let c = ate; for (let i = 0; i < 12; i++) { meses.unshift(c); c = mesAnteriorDe(c); }
  const cats = mapaCategorias(contas, ajustes);
  const base = semEnc(lancamentos);
  const validos = gerarRelatoriosContabeis(contas, base, "todos").validos;
  const pontos = new Map(meses.map((m) => [m, { competencia: m, receitaLiquida: 0, lucroLiquido: 0 }]));
  for (const v of validos) {
    const p = pontos.get(v.dataISO.slice(0, 7)); if (!p) continue;
    for (const [conta, sinal] of [[v.credito, 1], [v.debito, -1]] as const) {
      const cat = cats.get(conta.codigo); if (!cat || !ehResultado(cat)) continue;
      const val = sinal * v.valorCentavos;
      p.lucroLiquido += val;
      if (cat === "receita_bruta" || cat === "deducao") p.receitaLiquida += val;
    }
  }
  return meses.map((m) => pontos.get(m)!);
}

// ---------------------------------------------------------------------------------------------------------------
// Notas explicativas — modelo simples para ME/EPP (editável pela contadora)
// ---------------------------------------------------------------------------------------------------------------
export type NormaPequenas = "NBC TG 1002" | "NBC TG 1001" | "NBC TG 1000";
export type SecaoNota = { id: string; titulo: string; texto: string; base: string };
export type NotasExplicativas = { ano: number; norma: NormaPequenas; secoes: SecaoNota[]; atualizadoEm: string; conferidoPeloContador?: boolean };

export function normaSugerida(receitaBrutaAnualCentavos: number | null): NormaPequenas {
  // NBC TG 1002: receita bruta anual até R$ 4,8 milhões; NBC TG 1001: acima de R$ 4,8 mi até R$ 78 mi (CFC, dez/2021).
  if (receitaBrutaAnualCentavos === null) return "NBC TG 1002";
  if (receitaBrutaAnualCentavos <= 480_000_000) return "NBC TG 1002";
  if (receitaBrutaAnualCentavos <= 7_800_000_000) return "NBC TG 1001";
  return "NBC TG 1000";
}

const NOME_NORMA: Record<NormaPequenas, string> = {
  "NBC TG 1002": "NBC TG 1002 – Contabilidade para Microentidades",
  "NBC TG 1001": "NBC TG 1001 – Contabilidade para Pequenas Empresas",
  "NBC TG 1000": "NBC TG 1000 (R1) – Contabilidade para Pequenas e Médias Empresas",
};

/** Monta o modelo: só usa dados que o sistema TEM; o que só a empresa sabe fica entre colchetes para a contadora completar. */
export function modeloNotasExplicativas(empresa: EmpresaDados, ano: number, norma: NormaPequenas, info: { capitalSocialCentavos?: number; imobilizado?: boolean; estoques?: boolean; emprestimos?: boolean } = {}): NotasExplicativas {
  const nome = empresa.razaoSocial || "[razão social]";
  const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const local = [empresa.municipio, empresa.uf].filter(Boolean).join("/") || "[município/UF]";
  const secoes: SecaoNota[] = [
    { id: "contexto", titulo: "Contexto operacional", base: `${norma}, item 3.2 (divulgar a atividade da entidade)`, texto: `${nome}, inscrita no CNPJ ${empresa.cnpj || "[CNPJ]"}, com sede em ${local}, tem como atividade principal ${empresa.cnae ? `a do CNAE ${empresa.cnae}` : "[descrever a atividade]"}${empresa.regime ? `, e é tributada pelo ${empresa.regime}` : ""}.` },
    { id: "conformidade", titulo: "Declaração de conformidade e base de elaboração", base: `${norma}, item 3.2 (declaração explícita e sem reservas)${norma === "NBC TG 1001" ? " e itens 3.6 e 8.4(a)" : ""}`, texto: `As demonstrações contábeis do exercício findo em 31 de dezembro de ${ano} foram elaboradas de acordo com a ${NOME_NORMA[norma]}, aprovada pelo Conselho Federal de Contabilidade, e estão apresentadas em reais (R$).` },
    { id: "politicas", titulo: "Principais práticas contábeis", base: norma === "NBC TG 1002" ? "NBC TG 1002, item 3.7 (notas incentivadas) — regime de competência" : `${norma}, item 8.4(a) (políticas contábeis)`, texto: [
      "a) Apuração do resultado: as receitas e despesas são reconhecidas pelo regime de competência.",
      "b) Caixa e equivalentes de caixa: saldos de caixa e depósitos bancários de livre movimentação.",
      info.estoques ? "c) Estoques: avaliados ao custo de aquisição ou ao valor realizável líquido, dos dois o menor. [confirme o critério usado pela empresa]" : "",
      info.imobilizado ? "d) Imobilizado: registrado ao custo de aquisição, deduzido da depreciação acumulada calculada pelo método linear de acordo com a vida útil estimada dos bens. [confirme as taxas usadas]" : "",
      info.emprestimos ? "e) Empréstimos e financiamentos: registrados pelo valor captado, acrescido dos encargos incorridos até a data do balanço." : "",
    ].filter(Boolean).join("\n") },
    { id: "patrimonio", titulo: "Patrimônio líquido", base: `${norma} — informação relevante para entender as demonstrações`, texto: `O capital social${info.capitalSocialCentavos ? ` é de ${reais(info.capitalSocialCentavos)}` : " é de [valor]"}, totalmente integralizado [confirme], dividido entre os sócios conforme o contrato social.` },
    { id: "continuidade", titulo: "Continuidade", base: `${norma}, item 3.3 (incertezas relevantes sobre a continuidade devem ser divulgadas)`, texto: "[A contadora confirma com a administração:] A administração não tem conhecimento de incertezas relevantes que levantem dúvida significativa sobre a capacidade da entidade de continuar operando." },
  ];
  if (norma === "NBC TG 1002") secoes.push({ id: "adocao", titulo: "Adoção da NBC TG 1002", base: "NBC TG 1002, item 35.5 (divulgar a adoção na adoção inicial e nas demonstrações posteriores)", texto: "A entidade adota a NBC TG 1002 – Contabilidade para Microentidades [desde o exercício de ____ (adoção inicial)]." });
  secoes.push({ id: "subsequentes", titulo: "Eventos subsequentes", base: "Informação relevante, se houver", texto: "[Não houve eventos subsequentes relevantes até a data de autorização destas demonstrações / descrever.]" });
  return { ano, norma, secoes, atualizadoEm: new Date().toISOString() };
}

/** Notas com texto entre colchetes ainda não foram completadas pela contadora. */
export const pendenciasDasNotas = (n: NotasExplicativas | undefined | null): string[] => (n ? n.secoes.filter((s) => /\[[^\]]+\]/.test(s.texto)).map((s) => s.titulo) : []);

export function notasValidas(v: unknown): v is NotasExplicativas {
  const n = v as NotasExplicativas;
  return Boolean(n && typeof n === "object" && Number.isInteger(n.ano) && ["NBC TG 1002", "NBC TG 1001", "NBC TG 1000"].includes(n.norma) && Array.isArray(n.secoes) && n.secoes.length <= 40
    && n.secoes.every((s) => s && typeof s.id === "string" && typeof s.titulo === "string" && s.titulo.length <= 200 && typeof s.texto === "string" && s.texto.length <= 20000));
}

// ---------------------------------------------------------------------------------------------------------------
// Prazos das escriturações (para o painel do escritório)
// ---------------------------------------------------------------------------------------------------------------
/** ECF: último dia útil de julho do ano seguinte (IN RFB 2.004/2021, art. 3º). Considera só sábado/domingo; confira feriados. */
export function prazoEntregaECF(ano: number): string {
  const d = new Date(Date.UTC(ano + 1, 6, 31));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** ECF: dispensa do Simples Nacional, órgãos públicos e inativas (IN RFB 2.004/2021, art. 1º). */
export function ecfSeAplica(regime: string | undefined): "sim" | "nao" | "depende" {
  const r = sem(regime || "");
  if (/simples|\bmei\b/.test(r)) return "nao";
  if (/real|presumido|arbitrado|imune|isenta/.test(r)) return "sim";
  return "depende";
}
