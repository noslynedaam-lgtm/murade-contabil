import type { MapeamentoOrigemContabil, OrigemMapeadaContabil } from "../types";

/** Contas do plano padrão de comércio sugeridas por origem; só valem se código E descrição baterem com o plano da empresa (nunca se adivinha conta). */
export const SUGESTOES_CONTAS: Record<OrigemMapeadaContabil, { debito: [string, RegExp]; credito: [string, RegExp] }> = {
  fiscal_entrada: { debito: ["1.2.1", /estoque/i], credito: ["2.1.1", /fornecedor/i] },
  fiscal_saida: { debito: ["1.1.5", /cliente/i], credito: ["4.1.1", /receita.*venda/i] },
  dp_folha_bruta: { debito: ["5.2.1", /pessoal/i], credito: ["2.1.2", /sal[áa]rio/i] },
  dp_descontos_inss: { debito: ["2.1.2", /sal[áa]rio/i], credito: ["2.2.1", /inss/i] },
  dp_inss_patronal: { debito: ["5.2.1", /pessoal/i], credito: ["2.2.1", /inss/i] },
  dp_descontos_irrf: { debito: ["2.1.2", /sal[áa]rio/i], credito: ["2.1.3", /obriga[çc][õo]es fiscais|tribut/i] },
  dp_fgts: { debito: ["5.2.1", /pessoal/i], credito: ["2.2.2", /fgts/i] },
};

/** Sugere mapeamento só para as origens ainda sem mapeamento. Nunca altera um mapeamento existente. Débito e crédito precisam ser contas analíticas e diferentes. */
export function sugerirMapeamentosPadrao(
  contas: Array<{ codigo?: unknown; descricao?: unknown; tipo?: unknown }>,
  mapeamentos: Array<{ origem?: unknown }>,
  agoraIso: string,
): MapeamentoOrigemContabil[] {
  const analiticas = contas.filter((c) => c && c.tipo === "analitica");
  const novos: MapeamentoOrigemContabil[] = [];
  for (const origem of Object.keys(SUGESTOES_CONTAS) as OrigemMapeadaContabil[]) {
    if (mapeamentos.some((m) => m.origem === origem)) continue;
    const s = SUGESTOES_CONTAS[origem];
    const debito = analiticas.find((c) => c.codigo === s.debito[0] && s.debito[1].test(String(c.descricao || "")));
    const credito = analiticas.find((c) => c.codigo === s.credito[0] && s.credito[1].test(String(c.descricao || "")));
    if (!debito || !credito || debito.codigo === credito.codigo) continue;
    novos.push({ origem, contaDebitoCodigo: String(debito.codigo), contaCreditoCodigo: String(credito.codigo), revisadoEm: agoraIso });
  }
  return novos;
}
