import type { MapeamentoOrigemContabil, OrigemMapeadaContabil } from "../types";

type ParConta = [string, RegExp];
type RegraOrigem = { debito: ParConta; credito: ParConta };

/**
 * Cada origem pode ter mais de uma regra candidata, porque escritórios usam planos de contas
 * diferentes para empresas diferentes. Cada regra só é aplicada se código E descrição baterem
 * exatamente com uma conta analítica do plano da empresa — nunca se adivinha conta.
 * A primeira regra que bater integralmente (débito e crédito) é usada; as demais são ignoradas.
 */
export const SUGESTOES_CONTAS_POR_ORIGEM: Record<OrigemMapeadaContabil, RegraOrigem[]> = {
  fiscal_entrada: [
    // Plano simples (ex.: Ferragista JE)
    { debito: ["1.2.1", /estoque/i], credito: ["2.1.1", /fornecedor/i] },
    // Plano padrão de comércio (5 níveis, 572 contas)
    { debito: ["1.1.08.01.07", /produtos para mercadorias e venda/i], credito: ["2.1.03.01.01", /fornecedores de bens/i] },
  ],
  fiscal_saida: [
    { debito: ["1.1.5", /cliente/i], credito: ["4.1.1", /receita.*venda/i] },
    { debito: ["1.1.04.01.01", /duplicatas a receber/i], credito: ["3.1.01.01.02", /revenda de mercadorias/i] },
  ],
  dp_folha_bruta: [
    { debito: ["5.2.1", /pessoal/i], credito: ["2.1.2", /sal[áa]rio/i] },
    { debito: ["4.3.01.02.01", /sal[áa]rios e ordenados/i], credito: ["2.1.06.01.01", /sal[áa]rios a pagar/i] },
  ],
  dp_descontos_inss: [
    { debito: ["2.1.2", /sal[áa]rio/i], credito: ["2.2.1", /inss/i] },
    { debito: ["2.1.06.01.01", /sal[áa]rios a pagar/i], credito: ["2.1.05.01.05", /contribui[çc][õo]es previdenci[áa]rias/i] },
  ],
  dp_inss_patronal: [
    { debito: ["5.2.1", /pessoal/i], credito: ["2.2.1", /inss/i] },
    { debito: ["4.3.01.04.01", /previd[êe]ncia social/i], credito: ["2.1.05.01.05", /contribui[çc][õo]es previdenci[áa]rias/i] },
  ],
  dp_descontos_irrf: [
    { debito: ["2.1.2", /sal[áa]rio/i], credito: ["2.1.3", /obriga[çc][õo]es fiscais|tribut/i] },
    { debito: ["2.1.06.01.01", /sal[áa]rios a pagar/i], credito: ["2.1.05.02.01", /imposto de renda retido na fonte.*funcion[áa]rios/i] },
  ],
  dp_fgts: [
    { debito: ["5.2.1", /pessoal/i], credito: ["2.2.2", /fgts/i] },
    { debito: ["4.3.01.04.02", /^fgts$/i], credito: ["2.1.05.01.06", /fgts a recolher/i] },
  ],
  // Sem regra padrão: a multa de 40% do FGTS na rescisão não é um encargo comum a todo plano de
  // contas (muitos planos nem separam essa conta). Fica só para preenchimento manual na revisão.
  dp_multa_fgts_rescisoria: [],
  // Salário-família é compensado na GPS: débito no INSS a recolher, crédito em salários a pagar (o valor é pago ao empregado e abatido da guia).
  dp_salario_familia: [
    { debito: ["2.2.1", /inss/i], credito: ["2.1.2", /sal[áa]rio/i] },
    { debito: ["2.1.05.01.05", /contribui[çc][õo]es previdenci[áa]rias/i], credito: ["2.1.06.01.01", /sal[áa]rios a pagar/i] },
  ],
  // Faltas e DSR descontados estornam a despesa já lançada na folha bruta: o inverso da conta "Folha bruta".
  dp_desconto_faltas: [
    { debito: ["2.1.2", /sal[áa]rio/i], credito: ["5.2.1", /pessoal/i] },
    { debito: ["2.1.06.01.01", /sal[áa]rios a pagar/i], credito: ["4.3.01.02.01", /sal[áa]rios e ordenados/i] },
  ],
  // Sem regra padrão: a contrapartida varia por empresa (VT: recuperação da despesa com vale-transporte; pensão: pensão a pagar;
  // adiantamento: adiantamentos a empregados). Não se chuta conta que pode nem existir no plano.
  dp_desconto_vt: [],
  dp_desconto_pensao: [],
  dp_desconto_adiantamento: [],
  // Consignado descontado: débito em salários a pagar; crédito na conta onde a empresa registra o consignado a repassar ao banco. Varia por plano; sem regra padrão.
  dp_desconto_consignado: [],
  dp_desconto_emprestimo_empresa: [],
  dp_desconto_convenio: [],
  dp_desconto_outros_autorizados: [],
  // Provisões: a conta de despesa e a de passivo variam por plano (provisão de férias/13º a pagar, encargos sobre provisões); sem regra padrão.
  dp_provisao_ferias: [],
  dp_provisao_13: [],
  dp_provisao_encargos: [],
  // Férias pagas: debita a provisão de férias (ou a despesa, se a empresa não provisiona). Depende do plano; sem regra padrão.
  dp_ferias: [],
  // DIFAL, IRPJ/CSLL e PIS/COFINS do Lucro Presumido: sem regra padrão também. Nenhum dos dois
  // planos de contas conhecidos (Ferragista JE / plano padrão de comércio) tem conta específica
  // para esses tributos cadastrada hoje; inventar um código aqui seria "chutar" uma conta que pode
  // nem existir no plano da empresa. Fica só para preenchimento manual na revisão, com a orientação
  // contábil (débito/crédito) explicada na tela — ver RevisaoOrigensTab.tsx.
  fiscal_difal_consumo: [],
  fiscal_difal_ativo: [],
  fiscal_irpj_presumido: [],
  fiscal_csll_presumido: [],
  fiscal_pis_presumido: [],
  fiscal_cofins_presumido: [],
  fiscal_pis_nc: [],
  fiscal_cofins_nc: [],
  fiscal_pis_nc_credito: [],
  fiscal_cofins_nc_credito: [],
  // DAS do Simples: não usa regra de código fixo; as contas são procuradas pelo NOME no plano da empresa
  // (ver contasDasSimples, mais abaixo). Pagamento e multa/juros só quando a empresa já tem conta de caixa/banco mapeada.
  fiscal_das_simples: [],
  fiscal_das_simples_pago: [],
  fiscal_das_simples_encargos: [],
  fiscal_irpj_presumido_pago: [],
  fiscal_csll_presumido_pago: [],
  fiscal_pis_presumido_pago: [],
  fiscal_cofins_presumido_pago: [],
  fiscal_pis_nc_pago: [],
  fiscal_cofins_nc_pago: [],
  fiscal_darf_encargos: [],
  contabil_irpj_real: [],
  contabil_csll_real: [],
  contabil_irpj_real_pago: [],
  contabil_csll_real_pago: [],
  dp_cprb: [],
  // Arbitrado e COFINS da entidade: mesma orientação do Presumido (sem código fixo; a contadora escolhe as contas na revisão).
  fiscal_irpj_arbitrado: [],
  fiscal_csll_arbitrado: [],
  fiscal_pis_arbitrado: [],
  fiscal_cofins_arbitrado: [],
  fiscal_cofins_entidade: [],
  // ISS municipal: sem código fixo; a contadora escolhe as contas na revisão das origens.
  fiscal_iss_proprio: [],
  // Parcelamentos: sem código fixo; a contadora escolhe as contas na revisão das origens.
  fiscal_parcelamento_adesao: [],
  fiscal_parcelamento_parcela: [],
  fiscal_parcelamento_juros: [],
  fiscal_iss_retido_tomador: [],
  // IPI e ICMS-ST: sem código fixo; a contadora escolhe as contas na revisão das origens.
  fiscal_ipi_recolher: [],
  fiscal_icms_st_entrada: [],
  fiscal_icms_st_recuperar: [],
};

/** Mantido por compatibilidade: primeira regra de cada origem (plano simples/Ferragista). */
export const SUGESTOES_CONTAS: Record<OrigemMapeadaContabil, RegraOrigem> = Object.fromEntries(
  (Object.keys(SUGESTOES_CONTAS_POR_ORIGEM) as OrigemMapeadaContabil[]).map((origem) => [origem, SUGESTOES_CONTAS_POR_ORIGEM[origem][0]]),
) as Record<OrigemMapeadaContabil, RegraOrigem>;

/**
 * Sugere mapeamento só para as origens ainda sem mapeamento, testando cada regra candidata na
 * ordem até achar uma que bata integralmente (débito e crédito, código e descrição) no plano desta
 * empresa. Nunca altera um mapeamento existente. Débito e crédito precisam ser contas analíticas e
 * diferentes. Origens sem nenhuma regra correspondente ao plano desta empresa ficam de fora e
 * continuam disponíveis para preenchimento manual na tela de revisão.
 */
export function sugerirMapeamentosPadrao(
  contas: Array<{ codigo?: unknown; descricao?: unknown; tipo?: unknown }>,
  mapeamentos: Array<{ origem?: unknown; contaDebitoCodigo?: unknown; contaCreditoCodigo?: unknown }>,
  agoraIso: string,
): MapeamentoOrigemContabil[] {
  return [...sugerirPorCodigo(contas, mapeamentos, agoraIso), ...sugerirDasSimples(contas, mapeamentos, agoraIso)];
}

function sugerirPorCodigo(
  contas: Array<{ codigo?: unknown; descricao?: unknown; tipo?: unknown }>,
  mapeamentos: Array<{ origem?: unknown }>,
  agoraIso: string,
): MapeamentoOrigemContabil[] {
  const analiticas = contas.filter((c) => c && c.tipo === "analitica");
  const novos: MapeamentoOrigemContabil[] = [];
  for (const origem of Object.keys(SUGESTOES_CONTAS_POR_ORIGEM) as OrigemMapeadaContabil[]) {
    if (mapeamentos.some((m) => m.origem === origem)) continue;
    for (const regra of SUGESTOES_CONTAS_POR_ORIGEM[origem]) {
      const debito = analiticas.find((c) => c.codigo === regra.debito[0] && regra.debito[1].test(String(c.descricao || "")));
      const credito = analiticas.find((c) => c.codigo === regra.credito[0] && regra.credito[1].test(String(c.descricao || "")));
      if (!debito || !credito || debito.codigo === credito.codigo) continue;
      novos.push({ origem, contaDebitoCodigo: String(debito.codigo), contaCreditoCodigo: String(credito.codigo), revisadoEm: agoraIso });
      break;
    }
  }
  return novos;
}

// ===== DAS do Simples Nacional (LC 123/2006, art. 18 e art. 21) =====
// Apuração (competência): D despesa do Simples Nacional (resultado) / C Simples Nacional a recolher (passivo circulante).
// Pagamento: D Simples Nacional a recolher / C caixa ou banco. Multa e juros do pagamento em atraso: D encargos sobre tributos / C caixa ou banco.
// Regime de competência (NBC TG 1000 / ITG 1000): a despesa é reconhecida no mês do faturamento, o pagamento só baixa o passivo.

type ContaLeve = { codigo?: unknown; descricao?: unknown; tipo?: unknown; nivel?: unknown; natureza?: unknown };
const txt = (v: unknown) => String(v ?? "");
const analiticasDe = (contas: ContaLeve[]) => contas.filter((c) => c && c.tipo === "analitica");
const unica = <T,>(lista: T[]): T | null => (lista.length === 1 ? lista[0] : null);

/** Contas do DAS achadas pelo nome no plano da empresa. Só devolve quando há exatamente uma candidata (nunca adivinha entre duas). */
export function contasDasSimples(contas: ContaLeve[]): { despesa: string | null; aRecolher: string | null; encargos: string | null } {
  const a = analiticasDe(contas);
  const aRecolher = unica(a.filter((c) => txt(c.codigo).startsWith("2.") && /simples\s+nacional/i.test(txt(c.descricao)) && /recolher|a\s+pagar/i.test(txt(c.descricao))));
  const despesa = unica(a.filter((c) => /^[34]\./.test(txt(c.codigo)) && /simples\s+nacional/i.test(txt(c.descricao))));
  // Juros/multa sobre tributos: analítica de despesa cujo grupo (conta pai pelo código) fala em encargos sobre tributos.
  const porCodigo = new Map(contas.map((c) => [txt(c.codigo), c]));
  const pai = (codigo: string) => porCodigo.get(codigo.split(".").slice(0, -1).join("."));
  const encargos = unica(a.filter((c) => txt(c.codigo).startsWith("4.") && /encargos\s+sobre\s+tributos/i.test(txt(pai(txt(c.codigo))?.descricao)) && /juros/i.test(txt(c.descricao))));
  return { despesa: despesa ? txt(despesa.codigo) : null, aRecolher: aRecolher ? txt(aRecolher.codigo) : null, encargos: encargos ? txt(encargos.codigo) : null };
}

/** Conta de caixa/banco que a empresa JÁ usa em algum mapeamento (é a de pagamento). Uma só; se houver duas diferentes, não escolhe. */
export function contaPagamentoJaMapeada(contas: ContaLeve[], mapeamentos: Array<{ contaDebitoCodigo?: unknown; contaCreditoCodigo?: unknown }>): string | null {
  const disponiveis = new Set(analiticasDe(contas).filter((c) => txt(c.codigo).startsWith("1.") && /caixa|banco/i.test(txt(c.descricao))).map((c) => txt(c.codigo)));
  const usadas = new Set<string>();
  for (const m of mapeamentos) for (const k of [m.contaDebitoCodigo, m.contaCreditoCodigo]) if (disponiveis.has(txt(k))) usadas.add(txt(k));
  return usadas.size === 1 ? [...usadas][0] : null;
}

function sugerirDasSimples(contas: ContaLeve[], mapeamentos: Array<{ origem?: unknown; contaDebitoCodigo?: unknown; contaCreditoCodigo?: unknown }>, agoraIso: string): MapeamentoOrigemContabil[] {
  const tem = (o: string) => mapeamentos.some((m) => m.origem === o);
  const { despesa, aRecolher, encargos } = contasDasSimples(contas);
  const novos: MapeamentoOrigemContabil[] = [];
  const add = (origem: OrigemMapeadaContabil, d: string | null, c: string | null) => {
    if (!tem(origem) && d && c && d !== c) novos.push({ origem, contaDebitoCodigo: d, contaCreditoCodigo: c, revisadoEm: agoraIso });
  };
  // A conta a recolher pode já estar mapeada pela equipe na provisão: o pagamento baixa essa mesma conta.
  const recolherUsado = txt(mapeamentos.find((m) => m.origem === "fiscal_das_simples")?.contaCreditoCodigo) || aRecolher;
  const pagamento = txt(mapeamentos.find((m) => m.origem === "fiscal_das_simples_pago")?.contaCreditoCodigo) || contaPagamentoJaMapeada(contas, mapeamentos);
  add("fiscal_das_simples", despesa, aRecolher);
  add("fiscal_das_simples_pago", recolherUsado, pagamento);
  add("fiscal_das_simples_encargos", encargos, pagamento);
  return novos;
}

/** Contas do DAS que o plano padrão do Murade tem e que faltam num plano antigo do mesmo modelo (572 contas). */
export const CONTAS_DAS_PLANO_PADRAO = [
  { codigo: "2.1.05.01.09", descricao: "Simples Nacional a Recolher", nivel: 5, tipo: "analitica", natureza: "C", pai: ["2.1.05.01", /tributos e contribui/i] },
  { codigo: "4.3.06.01", descricao: "Tributos sobre o Faturamento", nivel: 4, tipo: "sintetica", natureza: "D", pai: ["4.3.06", /despesas com tributos/i] },
  { codigo: "4.3.06.01.01", descricao: "Simples Nacional - DAS", nivel: 5, tipo: "analitica", natureza: "D", pai: ["4.3.06.01", /tributos sobre o faturamento/i] },
] as const;

/**
 * Só ACRESCENTA: devolve as contas do DAS que faltam num plano do modelo padrão. Não cria nada quando o plano já tem uma conta de
 * Simples Nacional (achada pelo nome), quando o código já está ocupado ou quando o grupo pai não é o do modelo padrão.
 */
export function contasDasParaCompletar(contas: ContaLeve[]): Array<{ codigo: string; descricao: string; nivel: 4 | 5; tipo: "sintetica" | "analitica"; natureza: "D" | "C" }> {
  const porCodigo = new Map(contas.map((c) => [txt(c.codigo), c]));
  const achadas = contasDasSimples(contas);
  const faltam: Array<{ codigo: string; descricao: string; nivel: 4 | 5; tipo: "sintetica" | "analitica"; natureza: "D" | "C" }> = [];
  const jaTemSimples = (prefixo: string) => analiticasDe(contas).some((c) => txt(c.codigo).startsWith(prefixo) && /simples\s+nacional/i.test(txt(c.descricao)));
  for (const conta of CONTAS_DAS_PLANO_PADRAO) {
    if (porCodigo.has(conta.codigo)) continue;
    if (conta.codigo.startsWith("2.") && (achadas.aRecolher || jaTemSimples("2."))) continue;
    if (conta.codigo.startsWith("4.") && (achadas.despesa || jaTemSimples("3.") || jaTemSimples("4."))) continue;
    const pai = porCodigo.get(conta.pai[0]) ?? faltam.find((f) => f.codigo === conta.pai[0]);
    if (!pai || pai.tipo !== "sintetica" || !conta.pai[1].test(txt(pai.descricao))) continue;
    faltam.push({ codigo: conta.codigo, descricao: conta.descricao, nivel: conta.nivel, tipo: conta.tipo, natureza: conta.natureza });
  }
  // A analítica 4.3.06.01.01 sem o grupo 4.3.06.01 não entra (e vice-versa): ou entram as duas, ou nenhuma.
  const temGrupo = faltam.some((f) => f.codigo === "4.3.06.01") || porCodigo.has("4.3.06.01");
  return faltam.filter((f) => f.codigo !== "4.3.06.01.01" || temGrupo).filter((f) => f.codigo !== "4.3.06.01" || faltam.some((x) => x.codigo === "4.3.06.01.01"));
}

/** Origens que o robô sabe mapear sozinho (por código ou pelo nome da conta): só estas entram na conferência de "falta mapeamento padrão". */
export const ORIGENS_COM_MAPEAMENTO_PADRAO: OrigemMapeadaContabil[] = [
  ...(Object.keys(SUGESTOES_CONTAS_POR_ORIGEM) as OrigemMapeadaContabil[]).filter((o) => SUGESTOES_CONTAS_POR_ORIGEM[o].length > 0),
  "fiscal_das_simples", "fiscal_das_simples_pago", "fiscal_das_simples_encargos",
];
