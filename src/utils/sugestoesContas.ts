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
