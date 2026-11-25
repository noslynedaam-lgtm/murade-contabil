// DVA — Demonstração do Valor Adicionado, montada das contas de resultado (lançamentos aprovados), do vínculo com o plano
// referencial da Receita (quando a contadora já vinculou na ECD) e da DRE.
//
// FONTES OFICIAIS (conferidas em 25/11/2026):
//  - Lei 6.404/1976, art. 176, V (incluído pela Lei 11.638/2007): a DVA é obrigatória para a companhia aberta; art. 188, II: "o valor da
//    riqueza gerada pela companhia, a sua distribuição entre os elementos que contribuíram para a geração dessa riqueza, tais como
//    empregados, financiadores, acionistas, governo e outros, bem como a parcela da riqueza não distribuída" (planalto.gov.br).
//  - Pronunciamento Técnico CPC 09 (R1) — Demonstração do Valor Adicionado (cpc.org.br, aprovado em 10/11/2023; Resolução CVM 199/2024 e
//    NBC TG 09 (R1)), Modelo I: 1 Receitas (1.1 receita de contrato com cliente, COM os tributos sobre ela; 1.2 outras receitas; 1.3
//    construção de ativos próprios; 1.4 perdas estimadas com créditos de liquidação duvidosa), 2 Insumos adquiridos de terceiros (2.1
//    custo dos produtos, mercadorias e serviços vendidos — sem o pessoal próprio; 2.2 materiais, energia, serviços de terceiros e outros;
//    2.3 perda/recuperação de valores ativos; 2.4 outras), 3 = 1 − 2, 4 Depreciação, amortização e exaustão, 5 = 3 − 4, 6 Recebido em
//    transferência (6.1 equivalência patrimonial; 6.2 receitas financeiras; 6.3 outras), 7 = 5 + 6, 8 Distribuição (8.1 Pessoal:
//    remuneração direta, benefícios, FGTS; 8.2 Impostos, taxas e contribuições: federais — inclusive o INSS que é ônus do empregador —,
//    estaduais e municipais; 8.3 Capitais de terceiros: juros, aluguéis, outras; 8.4 Capitais próprios: JCP, dividendos, lucros retidos
//    ou prejuízo do exercício). "O total do item 8 deve ser exatamente igual ao item 7."
//  - CPC 09 (R1), item 14: insumos com os tributos incluídos no momento das compras; item 35 (base para conclusões): os tributos
//    recuperáveis aparecem pelo valor incidente nas vendas menos o incidente nos insumos.
//
// O QUE O SISTEMA FAZ: cada conta de resultado com movimento no período vai para uma linha da DVA — escolhida pela contadora, ou
// sugerida pelo vínculo com o plano referencial (L300A), ou pela descrição. Conta que o sistema não sabe classificar com segurança
// (ex.: "Demais impostos e taxas", que não diz se é federal, estadual ou municipal) fica PENDENTE e a DVA não fecha até ela ser
// escolhida. O lucro líquido vem da DRE (cálculo separado): por isso a conferência "distribuído = gerado" acusa qualquer conta de fora.
// Nada aqui é gravado; é cálculo puro.
import type { ContaPlano, EmpresaDados, LancamentoContabil } from "../types";
import { gerarRelatoriosContabeis } from "./livrosContabeis";
import { CATEGORIAS_RESULTADO, calcularDmpl, dreResumida, mapaCategorias, mesAnteriorDe, saldosNoFimDe, type CategoriaDemonstracao } from "./demonstracoesAvancadas";
import { regimeReferencial } from "../services/planoReferencialService";

export type LinhaDva =
  | "1.1" | "1.2" | "1.3" | "1.4"
  | "2.1" | "2.2" | "2.3" | "2.4"
  | "4"
  | "6.1" | "6.2" | "6.3"
  | "8.1.1" | "8.1.2" | "8.1.3"
  | "8.2.1" | "8.2.2" | "8.2.3"
  | "8.3.1" | "8.3.2" | "8.3.3"
  | "8.4.1";

export const ROTULO_DVA: Record<LinhaDva, string> = {
  "1.1": "Receita de contrato com cliente (vendas de mercadorias, produtos e serviços, com os tributos)",
  "1.2": "Outras receitas",
  "1.3": "Receitas relativas à construção de ativos próprios",
  "1.4": "Perdas estimadas com créditos de liquidação duvidosa (reversão/constituição)",
  "2.1": "Custos dos produtos, das mercadorias e dos serviços vendidos",
  "2.2": "Materiais, energia, serviços de terceiros e outros",
  "2.3": "Perda/recuperação de valores ativos",
  "2.4": "Outros insumos",
  "4": "Depreciação, amortização e exaustão",
  "6.1": "Resultado de equivalência patrimonial",
  "6.2": "Receitas financeiras",
  "6.3": "Outras transferências recebidas",
  "8.1.1": "Pessoal — remuneração direta",
  "8.1.2": "Pessoal — benefícios",
  "8.1.3": "Pessoal — FGTS",
  "8.2.1": "Impostos, taxas e contribuições — federais",
  "8.2.2": "Impostos, taxas e contribuições — estaduais",
  "8.2.3": "Impostos, taxas e contribuições — municipais",
  "8.3.1": "Remuneração de capitais de terceiros — juros",
  "8.3.2": "Remuneração de capitais de terceiros — aluguéis",
  "8.3.3": "Remuneração de capitais de terceiros — outras",
  "8.4.1": "Remuneração de capitais próprios — juros sobre o capital próprio",
};
export const LINHAS_DVA = Object.keys(ROTULO_DVA) as LinhaDva[];
export const ehLinhaDva = (v: unknown): v is LinhaDva => typeof v === "string" && (LINHAS_DVA as string[]).includes(v);
/** Linhas que entram na formação (1, 2, 4, 6); as demais são distribuição (8). */
const ehGeracao = (l: LinhaDva) => !l.startsWith("8");

export const FONTES_DVA = [
  { nome: "Lei 6.404/1976, art. 176, V, e art. 188, II (redação da Lei 11.638/2007)", url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm" },
  { nome: "CPC 09 (R1) — Demonstração do Valor Adicionado (Modelo I; itens 14, 15 e 35)", url: "https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=40" },
];

const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------------------------------------------------ plano referencial (L300A) → linha
// Prefixo do código referencial → linha. null = o próprio referencial não diz (ex.: "Demais impostos"): fica pendente.
const POR_REFERENCIAL: Array<[string, LinhaDva | null]> = [
  ["3.01.01.01.01", "1.1"],
  ["3.01.01.01.02.03", "8.2.2"], ["3.01.01.01.02.04", "8.2.1"], ["3.01.01.01.02.05", "8.2.1"], ["3.01.01.01.02.06", "8.2.3"], ["3.01.01.01.02.09", null],
  ["3.01.01.01.02", "1.1"], // devoluções, cancelamentos, descontos incondicionais, AVP e ajustes do CPC 47 reduzem a receita
  ["3.01.01.03", "2.1"],
  ["3.01.01.05.01.01", "6.2"], ["3.01.01.05.01.02", "6.2"], ["3.01.01.05.01.03", "6.2"], ["3.01.01.05.01.04", "6.3"], ["3.01.01.05.01.05", "6.2"],
  ["3.01.01.05.01.06", "6.1"], ["3.01.01.05.01.07", "6.1"], ["3.01.01.05.01.08", "6.2"], ["3.01.01.05.01.09", "2.3"], ["3.01.01.05.01.10", null],
  ["3.01.01.05.01.11", "6.2"], ["3.01.01.05.01.12", "1.2"], ["3.01.01.05.01.13", "1.2"], ["3.01.01.05.01.14", "6.2"], ["3.01.01.05.01.15", "6.2"],
  ["3.01.01.05.01.16", "6.2"], ["3.01.01.05.01.17", "6.3"], ["3.01.01.05.01.18", "6.1"], ["3.01.01.05.01.19", "6.3"], ["3.01.01.05.01.20", "6.3"],
  ["3.01.01.05.01.21", "1.2"], ["3.01.01.05.01.22", "1.2"], ["3.01.01.05.01.23", "1.2"], ["3.01.01.05.01.24", "1.2"], ["3.01.01.05.01.25", "6.3"],
  ["3.01.01.05.01.26", "6.2"], ["3.01.01.05.01.27", "6.2"], ["3.01.01.05.01.28", "6.2"], ["3.01.01.05.01.29", "6.2"], ["3.01.01.05.01.30", "6.2"],
  ["3.01.01.05.01.31", "6.2"], ["3.01.01.05.01.32", "6.2"], ["3.01.01.05.01.33", "6.2"], ["3.01.01.05.01.34", "6.2"], ["3.01.01.05.01.35", "6.2"],
  ["3.01.01.05.01.36", "6.2"], ["3.01.01.05.01.37", "6.2"], ["3.01.01.05.01.3", "1.2"], ["3.01.01.05.01.4", "1.2"], ["3.01.01.05.01.99", "1.2"],
  ["3.01.01.07.01.01", "8.1.1"], ["3.01.01.07.01.02", "8.1.1"], ["3.01.01.07.01.03", "8.1.2"], ["3.01.01.07.01.04", "2.2"], ["3.01.01.07.01.05", "8.2.1"],
  ["3.01.01.07.01.06", "8.1.3"], ["3.01.01.07.01.07", "8.2.1"], ["3.01.01.07.01.08", null], ["3.01.01.07.01.09", "8.1.2"], ["3.01.01.07.01.10", null],
  ["3.01.01.07.01.11", null], ["3.01.01.07.01.12", null], ["3.01.01.07.01.13", "8.1.2"], ["3.01.01.07.01.14", "8.2.1"], ["3.01.01.07.01.15", "8.2.1"],
  ["3.01.01.07.01.16", null], ["3.01.01.07.01.17", "8.3.2"], ["3.01.01.07.01.18", "8.3.2"], ["3.01.01.07.01.19", "2.2"], ["3.01.01.07.01.20", "2.2"],
  ["3.01.01.07.01.21", "2.2"], ["3.01.01.07.01.22", null], ["3.01.01.07.01.23", "4"], ["3.01.01.07.01.24", "4"], ["3.01.01.07.01.25", "1.4"],
  ["3.01.01.07.01.26", "8.1.1"], ["3.01.01.07.01.27", "8.1.1"], ["3.01.01.07.01.28", "2.3"], ["3.01.01.07.01.29", null], ["3.01.01.07.01.30", "8.1.1"],
  ["3.01.01.07.01.31", "2.2"], ["3.01.01.07.01.32", "2.2"], ["3.01.01.07.01.33", "8.1.2"], ["3.01.01.07.01.34", "2.2"], ["3.01.01.07.01.35", "2.2"],
  ["3.01.01.07.01.36", "2.2"], ["3.01.01.07.01.37", "2.2"], ["3.01.01.07.01.38", "2.2"], ["3.01.01.07.01.39", "2.2"], ["3.01.01.07.01.40", "2.2"],
  ["3.01.01.07.01.41", "8.1.2"], ["3.01.01.07.01.42", "8.1.2"], ["3.01.01.07.01.43", "8.1.2"], ["3.01.01.07.01.44", "2.2"],
  ["3.01.01.09.01.01", "8.3.1"], ["3.01.01.09.01.02", "6.2"], ["3.01.01.09.01.03", "6.2"], ["3.01.01.09.01.04", "8.4.1"], ["3.01.01.09.01.05", "8.3.1"],
  ["3.01.01.09.01.06", "8.3.1"], ["3.01.01.09.01.07", "8.3.1"], ["3.01.01.09.01.08", "8.3.1"], ["3.01.01.09.01.09", "6.1"], ["3.01.01.09.01.10", "6.1"],
  ["3.01.01.09.01.11", null], ["3.01.01.09.01.12", "2.3"], ["3.01.01.09.01.13", "6.2"], ["3.01.01.09.01.14", "6.2"], ["3.01.01.09.01.15", "8.3.1"],
  ["3.01.01.09.01.16", "4"], ["3.01.01.09.01.17", "6.1"], ["3.01.01.09.01.18", "8.3.2"], ["3.01.01.09.01.19", "8.3.2"], ["3.01.01.09.01.20", "8.3.1"],
  ["3.01.01.09.01.21", "2.2"], ["3.01.01.09.01.22", "8.3.1"], ["3.01.01.09.01.23", "8.3.1"], ["3.01.01.09.01.24", "8.3.1"], ["3.01.01.09.01.25", "8.3.1"],
  ["3.01.01.09.01.26", "6.2"], ["3.01.01.09.01.27", "6.2"], ["3.01.01.09.01.28", "6.2"], ["3.01.01.09.01.29", "6.2"], ["3.01.01.09.01.30", "6.2"],
  ["3.01.01.09.01.3", "2.3"], ["3.01.01.09.01.99", null],
  ["3.01.01.11", "1.2"], // alienação de bens (receita e valor contábil baixado) e operações descontinuadas: líquido em outras receitas
  ["3.01.05.01.01.02", "8.1.2"], ["3.01.05.01.01", "8.1.1"], ["3.01.05.01.03.01", "8.1.1"], ["3.01.05.01.03", "8.3.3"],
  ["3.02", "8.2.1"],
];
/** Linha pelo código referencial (o mais específico primeiro). undefined = o código não está na tabela. */
export function linhaPeloReferencial(codigo: string | null | undefined): LinhaDva | null | undefined {
  let c = String(codigo || "").trim(); if (!c.startsWith("3")) return undefined;
  if (c.startsWith("3.11.")) c = `3.01.${c.slice(5)}`; else if (c.startsWith("3.12")) c = "3.02";
  let melhor: [string, LinhaDva | null] | undefined;
  for (const par of POR_REFERENCIAL) if ((c === par[0] || c.startsWith(`${par[0]}.`) || (par[0].length > 14 && c.startsWith(par[0]))) && (!melhor || par[0].length > melhor[0].length)) melhor = par;
  return melhor ? melhor[1] : undefined;
}

/** Linha pela descrição da conta (e dos grupos acima) e pela categoria das demonstrações. null = não dá para ter certeza. */
export function linhaPelaDescricao(conta: ContaPlano, contas: ContaPlano[], categoria: CategoriaDemonstracao): LinhaDva | null {
  const d = sem(conta.descricao || "");
  const caminho = sem(contas.filter((x) => x.codigo === conta.codigo || conta.codigo.startsWith(`${x.codigo}.`)).sort((a, b) => a.codigo.length - b.codigo.length).map((x) => x.descricao || "").join(" | "));
  if (/juros sobre (o )?capital proprio/.test(d)) return categoria === "receita_financeira" || categoria === "outras_receitas" ? "6.3" : "8.4.1";
  if (categoria === "receita_bruta") return "1.1";
  if (categoria === "deducao") {
    if (/devoluc|cancelad|desconto|abatimento|ajuste a valor presente/.test(d)) return "1.1";
    if (/\bicms\b/.test(d)) return "8.2.2";
    if (/\biss\b|issqn/.test(d)) return "8.2.3";
    if (/\bpis\b|cofins|\bipi\b|\bcprb\b/.test(d)) return "8.2.1";
    return null; // "Simples Nacional/DAS" junta tributos federais, estaduais e municipais; "impostos sobre vendas" não diz o ente
  }
  if (categoria === "tributos_lucro") return "8.2.1";
  if (categoria === "depreciacao" || /deprecia|amortiza|exaust/.test(d)) return "4";
  if (categoria === "receita_financeira") return /equivalencia/.test(d) ? "6.1" : "6.2";
  if (categoria === "outras_receitas") {
    if (/equivalencia/.test(d)) return "6.1";
    if (/dividendo|aluguel|alugueis|locac/.test(d)) return "6.3";
    if (/financeir|juros|rendimento|variac.*cambia|desconto.? obtido/.test(d)) return "6.2";
    if (/revers.*(pecld|devedores duvidosos|liquidacao duvidosa|perdas? (estimadas|com creditos))/.test(d)) return "1.4";
    return "1.2";
  }
  if (categoria === "despesa_financeira") {
    if (/tarifa|despesas? bancaria|taxa bancaria|cesta de servic/.test(d)) return "2.2";
    if (/\biof\b/.test(d)) return "8.2.1";
    return "8.3.1";
  }
  if (categoria === "custo" || categoria === "despesa") {
    if (/beneficios? previdenciario|previdencia privada|\bfapi\b|\bpait\b/.test(d)) return "8.1.2";
    if (/\bfgts\b/.test(d)) return "8.1.3";
    if (/\binss\b|previdencia social|contribuic.*previdenciar|\brat\b|\bsat\b|\bfap\b|salario.educac|terceiros \(sistema s\)/.test(d)) return "8.2.1";
    if (/salario|ordenado|gratifica|pro.?labore|remuneracao|honorarios? (da diretoria|de administradores)|dirigente|ferias|\b13\s*[ºo°]?\s*salario|decimo terceiro|horas? extras?|aviso previo|indenizac.*trabalhist|participac.*(empregados|administradores)|adicional (noturno|de insalubridade|de periculosidade)|comissoes? (a|de) (empregados|vendedores)/.test(d)) return "8.1.1";
    if (/vale.?(transporte|refeicao|alimentacao)|alimentacao do trabalhador|assistencia medica|plano de saude|odontolog|seguro de vida|cesta basica/.test(d)) return "8.1.2";
    if (/aluguel|alugueis|arrendamento|locacao de (imove|maquina|equipamento|veiculo)/.test(d)) return "8.3.2";
    if (/\birpj\b|\bcsll\b|imposto de renda|contribuicao social sobre o lucro/.test(d)) return "8.2.1";
    if (/\bicms\b|\bipva\b/.test(d)) return "8.2.2";
    if (/\biptu\b|\biss\b|issqn|taxa de (licenca|localizacao|funcionamento)|alvara/.test(d)) return "8.2.3";
    if (/\bpis\b|cofins|\bipi\b|\biof\b|\bitr\b|\bcide\b/.test(d)) return "8.2.1";
    if (/imposto|taxas?\b|tributo|contribuic|multa|doac|patrocinio cultural|provis(ao|oes)\b/.test(d)) return null; // ente ou natureza não ditos
    if (/perdas? (estimadas|com creditos|em operac.*credito)|pecld|devedores duvidosos|liquidacao duvidosa/.test(d)) return "1.4";
    if (/impairment|recuperabilidade|perda.* estoque|obsolesc/.test(d)) return "2.3";
    if (/mao de obra|pessoal/.test(d) && categoria === "custo") return null; // custo com pessoal próprio não é insumo (CPC 09, item 14): escolha a linha de pessoal
    if (categoria === "custo") return "2.1";
    return /custo|despesa/.test(caminho) ? "2.2" : null;
  }
  return null;
}

export type ContaDva = { codigo: string; descricao: string; linha: LinhaDva | null; origem: "contadora" | "referencial" | "descricao" | "pendente"; referencial: string | null;
  /** Movimento do período: crédito − débito (receita positiva, despesa negativa), em centavos. */
  movimento: number;
  /** Valor como entra na linha (positivo aumenta a linha). */
  valor: number };
export type ItemDva = { linha: LinhaDva | "8.4.2" | "8.4.3" | "ajuste_recuperaveis"; rotulo: string; centavos: number };
export type Dva = {
  de: string; ate: string;
  receitas: number; insumos: number; valorAdicionadoBruto: number; depreciacao: number; valorAdicionadoLiquido: number; transferencias: number;
  totalADistribuir: number;
  pessoal: number; impostos: number; capitaisTerceiros: number; capitaisProprios: number; totalDistribuido: number;
  /** total distribuído − total a distribuir; 0 quando fecha. */
  diferenca: number; fecha: boolean; completa: boolean;
  linhas: Record<string, number>;
  lucroLiquidoDre: number; dividendos: number; lucrosRetidos: number;
  tributosRecuperaveis: { centavos: number; federais: number; estaduais: number; contas: string[] };
  contas: ContaDva[]; pendentes: ContaDva[];
  obrigatoria: boolean; avisos: string[];
};

const ehResultado = (c: CategoriaDemonstracao) => (CATEGORIAS_RESULTADO as string[]).includes(c);
/** Companhia aberta (natureza jurídica 204-6, Sociedade Anônima Aberta): a DVA é obrigatória (Lei 6.404/1976, art. 176, V). */
export const ehCompanhiaAberta = (empresa: Pick<EmpresaDados, "naturezaJuridica"> | undefined | null) => /204-?6|an[oô]nima aberta/i.test(String(empresa?.naturezaJuridica || ""));

/** Contas de crédito de tributo recuperável na compra (ICMS, IPI, PIS, COFINS a recuperar/compensar). */
const ehRecuperavel = (c: ContaPlano) => /\b(icms|ipi|pis|cofins)\b/.test(sem(c.descricao || "")) && /recuperar|compensar|credito/.test(sem(c.descricao || "")) && !/st\b|substituicao/.test(sem(c.descricao || ""));
const ehContaTributo = (c: ContaPlano) => /\b(icms|ipi|pis|cofins|iss|imposto|tribut|irpj|csll|simples)\b/.test(sem(c.descricao || ""));

export function calcularDva(p: {
  contas: ContaPlano[]; lancamentos: LancamentoContabil[]; de: string; ate: string; empresa?: EmpresaDados | null;
  /** Escolhas da contadora (código da conta → linha). */ classificacao?: Record<string, string> | null;
  /** Soma os créditos de ICMS/IPI/PIS/COFINS tomados nas compras aos insumos e tira dos impostos (CPC 09 (R1), itens 14 e 35). Padrão: sim. */
  incluirRecuperaveis?: boolean;
}): Dva {
  const { contas, de, ate } = p; const empresa = p.empresa ?? null;
  const ajustes = empresa?.classificacaoDemonstracoes;
  const base = (p.lancamentos || []).filter((l) => l?.tipoEspecial !== "encerramento");
  const cats = mapaCategorias(contas, ajustes);
  const ini = saldosNoFimDe(contas, base, mesAnteriorDe(de)), fim = saldosNoFimDe(contas, base, ate);
  const regime = regimeReferencial(String(empresa?.regime || ""));
  const mapaRef = empresa?.mapeamentoReferencial || {};
  const escolhas = p.classificacao || (empresa as any)?.classificacaoDva || {};
  const avisos: string[] = [];
  const contasDva: ContaDva[] = [];
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
  for (const [cod, cat] of cats) {
    const conta = porCodigo.get(cod)!;
    const ref = mapaRef[cod] ? String(mapaRef[cod]) : null;
    const resultado = ehResultado(cat) || (ref ? ref.startsWith("3") : false) || (cat === "nao_classificada" && /receita|despesa|custo/.test(sem(conta.descricao || "") + "|" + sem(contas.filter((x) => cod.startsWith(`${x.codigo}.`)).map((x) => x.descricao || "").join("|"))));
    if (!resultado || cat === "ignorar") continue;
    const movimento = -((fim.get(cod) ?? 0) - (ini.get(cod) ?? 0));
    if (!movimento) continue;
    let linha: LinhaDva | null = null; let origem: ContaDva["origem"] = "pendente";
    if (ehLinhaDva(escolhas[cod])) { linha = escolhas[cod] as LinhaDva; origem = "contadora"; }
    else {
      const r = regime && ref ? linhaPeloReferencial(ref) : undefined;
      if (r !== undefined) { linha = r; origem = r ? "referencial" : "pendente"; }
      else { linha = linhaPelaDescricao(conta, contas, cat); origem = linha ? "descricao" : "pendente"; }
    }
    const valor = linha ? (ehGeracao(linha) && (linha.startsWith("1") || linha.startsWith("6")) ? movimento : -movimento) : 0;
    contasDva.push({ codigo: cod, descricao: conta.descricao || "", linha, origem, referencial: ref, movimento, valor });
  }
  const linhas: Record<string, number> = Object.fromEntries(LINHAS_DVA.map((l) => [l, 0]));
  for (const c of contasDva) if (c.linha) linhas[c.linha] += c.valor;

  // Tributos recuperáveis nas compras (créditos tomados no período): somam aos insumos e saem dos impostos, sem mudar o total.
  const recup = { centavos: 0, federais: 0, estaduais: 0, contas: [] as string[] };
  if (p.incluirRecuperaveis !== false) {
    const rel = gerarRelatoriosContabeis(contas, base, "todos");
    for (const v of rel.validos) {
      const mes = v.dataISO.slice(0, 7); if (mes < de || mes > ate) continue;
      if (!ehRecuperavel(v.debito) || ehContaTributo(v.credito) || v.original?.tipoEspecial) continue;
      const estadual = /\bicms\b/.test(sem(v.debito.descricao || ""));
      if (estadual) recup.estaduais += v.valorCentavos; else recup.federais += v.valorCentavos;
      recup.centavos += v.valorCentavos; if (!recup.contas.includes(v.debito.codigo)) recup.contas.push(v.debito.codigo);
    }
    if (recup.centavos) {
      linhas["2.1"] += recup.centavos; linhas["8.2.1"] -= recup.federais; linhas["8.2.2"] -= recup.estaduais;
      avisos.push(`Tributos recuperáveis nas compras (${recup.contas.join(", ")}): ${(recup.centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} somados aos insumos e tirados dos impostos (CPC 09 (R1), itens 14 e 35). Os créditos são os tomados no período; confira se o estoque mudou muito.`);
    }
  }

  const receitas = linhas["1.1"] + linhas["1.2"] + linhas["1.3"] + linhas["1.4"];
  const insumos = linhas["2.1"] + linhas["2.2"] + linhas["2.3"] + linhas["2.4"];
  const valorAdicionadoBruto = receitas - insumos;
  const depreciacao = linhas["4"];
  const valorAdicionadoLiquido = valorAdicionadoBruto - depreciacao;
  const transferencias = linhas["6.1"] + linhas["6.2"] + linhas["6.3"];
  const totalADistribuir = valorAdicionadoLiquido + transferencias;

  const dre = dreResumida(contas, p.lancamentos || [], de, ate, ajustes);
  const lucroLiquidoDre = dre.lucroLiquido;
  // Dividendos do ano pela DMPL (só quando o período é um ano inteiro). CPC 09 (R1), item 15: só os do resultado do próprio exercício.
  let dividendos = 0;
  if (de.slice(5) === "01" && ate.slice(5) === "12" && de.slice(0, 4) === ate.slice(0, 4)) {
    const dmpl = calcularDmpl(contas, p.lancamentos || [], Number(de.slice(0, 4)), ajustes);
    const lin = dmpl.linhas.find((l) => /dividendos/i.test(l.rotulo));
    dividendos = lin ? Math.max(0, -lin.total) : 0;
    if (dividendos) avisos.push("Dividendos/lucros distribuídos lançados no ano (DMPL). Pelo CPC 09 (R1), item 15, só entram os distribuídos com base no resultado do próprio exercício: se parte for de lucros de anos anteriores, ajuste (a diferença vai para lucros retidos e o total não muda).");
  }
  const lucrosRetidos = lucroLiquidoDre - dividendos;
  const pessoal = linhas["8.1.1"] + linhas["8.1.2"] + linhas["8.1.3"];
  const impostos = linhas["8.2.1"] + linhas["8.2.2"] + linhas["8.2.3"];
  const capitaisTerceiros = linhas["8.3.1"] + linhas["8.3.2"] + linhas["8.3.3"];
  const capitaisProprios = linhas["8.4.1"] + dividendos + lucrosRetidos;
  const totalDistribuido = pessoal + impostos + capitaisTerceiros + capitaisProprios;
  const diferenca = totalDistribuido - totalADistribuir;
  const pendentes = contasDva.filter((c) => !c.linha);
  if (pendentes.length) avisos.unshift(`${pendentes.length} conta(s) de resultado com movimento sem linha da DVA (ex.: ${pendentes.slice(0, 3).map((c) => `${c.codigo} ${c.descricao}`).join("; ")}). Escolha a linha de cada uma: até lá a DVA não fecha.`);
  if (dre.naoClassificado) avisos.push("Há contas de resultado sem classificação na DRE (aba Classificação das contas): o lucro líquido da DRE pode estar incompleto.");
  const fecha = diferenca === 0;
  if (!fecha && !pendentes.length) avisos.unshift(`O valor distribuído (${(totalDistribuido / 100).toFixed(2)}) difere do valor a distribuir (${(totalADistribuir / 100).toFixed(2)}) em ${(diferenca / 100).toFixed(2)}: confira as contas de resultado sem classificação na DRE e lançamentos de encerramento sem a marca.`);
  return {
    de, ate, receitas, insumos, valorAdicionadoBruto, depreciacao, valorAdicionadoLiquido, transferencias, totalADistribuir,
    pessoal, impostos, capitaisTerceiros, capitaisProprios, totalDistribuido, diferenca, fecha, completa: fecha && !pendentes.length,
    linhas, lucroLiquidoDre, dividendos, lucrosRetidos, tributosRecuperaveis: recup, contas: contasDva, pendentes,
    obrigatoria: ehCompanhiaAberta(empresa), avisos,
  };
}

/** Linhas para tela, PDF e Excel, na ordem do Modelo I do CPC 09 (R1). */
export function linhasDaDva(d: Dva): Array<{ codigo: string; rotulo: string; centavos: number; total?: boolean }> {
  const L = (c: LinhaDva) => ({ codigo: c, rotulo: ROTULO_DVA[c].replace(/^(Pessoal|Impostos, taxas e contribuições|Remuneração de capitais de terceiros|Remuneração de capitais próprios) — /, ""), centavos: d.linhas[c] });
  return [
    { codigo: "1", rotulo: "Receitas", centavos: d.receitas, total: true }, L("1.1"), L("1.2"), L("1.3"), L("1.4"),
    { codigo: "2", rotulo: "Insumos adquiridos de terceiros", centavos: d.insumos, total: true }, L("2.1"), L("2.2"), L("2.3"), L("2.4"),
    { codigo: "3", rotulo: "Valor adicionado bruto (1 − 2)", centavos: d.valorAdicionadoBruto, total: true },
    { codigo: "4", rotulo: "Depreciação, amortização e exaustão", centavos: d.depreciacao, total: true },
    { codigo: "5", rotulo: "Valor adicionado líquido produzido pela entidade (3 − 4)", centavos: d.valorAdicionadoLiquido, total: true },
    { codigo: "6", rotulo: "Valor adicionado recebido em transferência", centavos: d.transferencias, total: true }, L("6.1"), L("6.2"), L("6.3"),
    { codigo: "7", rotulo: "Valor adicionado total a distribuir (5 + 6)", centavos: d.totalADistribuir, total: true },
    { codigo: "8", rotulo: "Distribuição do valor adicionado", centavos: d.totalDistribuido, total: true },
    { codigo: "8.1", rotulo: "Pessoal", centavos: d.pessoal, total: true }, L("8.1.1"), L("8.1.2"), L("8.1.3"),
    { codigo: "8.2", rotulo: "Impostos, taxas e contribuições", centavos: d.impostos, total: true }, L("8.2.1"), L("8.2.2"), L("8.2.3"),
    { codigo: "8.3", rotulo: "Remuneração de capitais de terceiros", centavos: d.capitaisTerceiros, total: true }, L("8.3.1"), L("8.3.2"), L("8.3.3"),
    { codigo: "8.4", rotulo: "Remuneração de capitais próprios", centavos: d.capitaisProprios, total: true }, L("8.4.1"),
    { codigo: "8.4.2", rotulo: "Dividendos", centavos: d.dividendos },
    { codigo: "8.4.3", rotulo: d.lucrosRetidos >= 0 ? "Lucros retidos" : "Prejuízo do exercício", centavos: d.lucrosRetidos },
  ];
}

export function resumoDva(d: Dva): string {
  const r = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (d.completa) return `DVA fecha: valor a distribuir ${r(d.totalADistribuir)} = valor distribuído ${r(d.totalDistribuido)} (pessoal ${r(d.pessoal)}, impostos ${r(d.impostos)}, terceiros ${r(d.capitaisTerceiros)}, próprios ${r(d.capitaisProprios)}).`;
  return `DVA não fecha: a distribuir ${r(d.totalADistribuir)}, distribuído ${r(d.totalDistribuido)} (diferença ${r(d.diferenca)})${d.pendentes.length ? `; ${d.pendentes.length} conta(s) sem linha da DVA` : ""}.`;
}
