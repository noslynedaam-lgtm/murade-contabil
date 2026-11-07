// Fonte única das origens dos pré-lançamentos (DP e Fiscal): rótulo mostrado ao contador, id do mapeamento de contas
// e o formato das referências. Antes cada arquivo tinha a sua cópia da lista, e as cópias estavam diferentes: o validador
// do workspace recusava os rascunhos de 13º, rescisão, pró-labore e das apurações do Fiscal (eles eram gerados e nunca gravados).
// Módulo puro (sem dependências de servidor) para servir ao servidor, à tela e à migração.

export const ORIGENS = [
  { id: "fiscal_entrada", rotulo: "Fiscal — Entrada" },
  { id: "fiscal_saida", rotulo: "Fiscal — Saída" },
  { id: "dp_folha_bruta", rotulo: "DP — Folha" },
  { id: "dp_descontos_inss", rotulo: "DP — INSS" },
  { id: "dp_inss_patronal", rotulo: "DP — INSS patronal" },
  { id: "dp_descontos_irrf", rotulo: "DP — IRRF" },
  { id: "dp_fgts", rotulo: "DP — FGTS" },
  { id: "dp_multa_fgts_rescisoria", rotulo: "DP — Multa FGTS rescisória" },
  { id: "dp_salario_familia", rotulo: "DP — Salário-família" },
  { id: "dp_desconto_faltas", rotulo: "DP — Faltas e DSR" },
  { id: "dp_desconto_vt", rotulo: "DP — Desconto de vale-transporte" },
  { id: "dp_desconto_pensao", rotulo: "DP — Pensão alimentícia" },
  { id: "dp_desconto_adiantamento", rotulo: "DP — Adiantamento" },
  { id: "dp_provisao_ferias", rotulo: "DP — Provisão de férias" },
  { id: "dp_provisao_13", rotulo: "DP — Provisão de 13º" },
  { id: "dp_provisao_encargos", rotulo: "DP — Encargos sobre provisões" },
  { id: "dp_ferias", rotulo: "DP — Férias" },
  { id: "fiscal_difal_consumo", rotulo: "Fiscal — DIFAL (uso/consumo)" },
  { id: "fiscal_difal_ativo", rotulo: "Fiscal — DIFAL (ativo imobilizado)" },
  { id: "fiscal_irpj_presumido", rotulo: "Fiscal — IRPJ Presumido" },
  { id: "fiscal_csll_presumido", rotulo: "Fiscal — CSLL Presumido" },
  { id: "fiscal_pis_presumido", rotulo: "Fiscal — PIS Presumido" },
  { id: "fiscal_cofins_presumido", rotulo: "Fiscal — COFINS Presumido" },
] as const;

export type IdOrigem = (typeof ORIGENS)[number]["id"];
export type RotuloOrigem = (typeof ORIGENS)[number]["rotulo"];

export const ROTULO_PARA_ID: Record<string, IdOrigem> = Object.fromEntries(ORIGENS.map((o) => [o.rotulo, o.id])) as Record<string, IdOrigem>;
export const ID_PARA_ROTULO: Record<string, RotuloOrigem> = Object.fromEntries(ORIGENS.map((o) => [o.id, o.rotulo])) as Record<string, RotuloOrigem>;
export const IDS_ORIGEM = new Set<string>(ORIGENS.map((o) => o.id));
export const ROTULOS_ORIGEM = new Set<string>(ORIGENS.map((o) => o.rotulo));

/** Tributo (contrato com o Fiscal) → id da origem. */
export const ORIGEM_POR_TRIBUTO: Record<string, IdOrigem> = {
  ICMS_DIFAL_ATIVO: "fiscal_difal_ativo",
  ICMS_DIFAL_CONSUMO: "fiscal_difal_consumo",
  IRPJ_PRESUMIDO: "fiscal_irpj_presumido",
  CSLL_PRESUMIDO: "fiscal_csll_presumido",
  PIS_PRESUMIDO: "fiscal_pis_presumido",
  COFINS_PRESUMIDO: "fiscal_cofins_presumido",
};

// ---------------------------------------------------------------- folha mensal do DP
/** Campos da folha agregada que viram partida. `classificado` = desconto/provento que explica a diferença entre bruto e líquido. */
export const ITENS_FOLHA_DP = [
  { campo: "folhaBruta", origem: "dp_folha_bruta", titulo: "Folha bruta" },
  { campo: "descontosINSS", origem: "dp_descontos_inss", titulo: "INSS descontado do empregado" },
  { campo: "inssPatronal", origem: "dp_inss_patronal", titulo: "INSS patronal", opcional: true },
  { campo: "descontosIRRF", origem: "dp_descontos_irrf", titulo: "IRRF descontado" },
  { campo: "fgts", origem: "dp_fgts", titulo: "FGTS informado pelo DP" },
  // Provisões mensais (competência): independentes do líquido; sem conta mapeada, só elas ficam de fora.
  { campo: "provisaoFerias", origem: "dp_provisao_ferias", titulo: "Provisão de férias + 1/3", opcional: true },
  { campo: "provisao13", origem: "dp_provisao_13", titulo: "Provisão de 13º salário", opcional: true },
  { campo: "encargosOutros", origem: "dp_provisao_encargos", titulo: "FGTS e INSS patronal sobre as provisões", opcional: true },
  { campo: "salarioFamilia", origem: "dp_salario_familia", titulo: "Salário-família (compensação na GPS)", classificado: true },
  { campo: "descontosFaltas", origem: "dp_desconto_faltas", titulo: "Desconto de faltas e DSR", classificado: true },
  { campo: "descontosVT", origem: "dp_desconto_vt", titulo: "Desconto do vale-transporte", classificado: true },
  { campo: "descontosPensao", origem: "dp_desconto_pensao", titulo: "Pensão alimentícia descontada", classificado: true },
  { campo: "descontosAdiantamento", origem: "dp_desconto_adiantamento", titulo: "Adiantamento descontado", classificado: true },
] as const;
export type ItemFolhaDP = (typeof ITENS_FOLHA_DP)[number];

/** Descontos que, somados, precisam fechar com `descontosOutros`. */
export const CAMPOS_DESCONTOS_CLASSIFICADOS = ["descontosFaltas", "descontosVT", "descontosPensao", "descontosAdiantamento"] as const;
export const CAMPOS_OPCIONAIS_RESUMO_DP = ["salarioFamilia", ...CAMPOS_DESCONTOS_CLASSIFICADOS] as const;

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Confere se o resumo da folha fecha: bruto − INSS − IRRF − outros descontos + salário-família = líquido,
 * e se os descontos classificados explicam exatamente "outros descontos". Sem isso nenhum rascunho é gerado.
 */
export function conciliarResumoFolhaDP(v: Record<string, unknown>): { ok: true } | { ok: false; motivo: string } {
  const bruto = num(v.folhaBruta), inss = num(v.descontosINSS), irrf = num(v.descontosIRRF), outros = num(v.descontosOutros), liquido = num(v.liquidoFolha);
  if ([bruto, inss, irrf, outros, liquido].some((x) => x === null) || num(v.fgts) === null) return { ok: false, motivo: "Há totais essenciais não apurados; nenhuma partida foi montada." };
  let sf = 0;
  if (v.salarioFamilia !== undefined) { const x = num(v.salarioFamilia); if (x === null || x < 0) return { ok: false, motivo: "Salário-família inválido no resumo." }; sf = x; }
  let classificados = 0;
  for (const campo of CAMPOS_DESCONTOS_CLASSIFICADOS) {
    if (v[campo] === undefined) continue;
    const x = num(v[campo]);
    if (x === null || x < 0) return { ok: false, motivo: `Valor inválido no resumo: ${campo}.` };
    classificados += x;
  }
  if (Math.abs(r2(classificados) - r2(outros!)) > 0.01) {
    return { ok: false, motivo: outros! > 0 && classificados === 0
      ? "Há outros descontos que o DP não classificou (resumo no formato antigo); reenvie a folha pelo DP atualizado para gerar as partidas."
      : "Os descontos classificados (faltas, vale-transporte, pensão e adiantamento) não somam o total de outros descontos." };
  }
  if (Math.abs(r2(bruto! - inss! - irrf! - outros! + sf) - r2(liquido!)) > 0.01) return { ok: false, motivo: "Bruto, descontos e salário-família não fecham com o líquido da folha." };
  return { ok: true };
}

// ---------------------------------------------------------------- referências
// DP mensal:    DP:<cnpj>:AAAA-MM:<campo>                       (campo da folha ou do pró-labore)
// DP evento:    DP:<cnpj>:decimo|rescisao|ferias:<referência>:<campo>  (13º, rescisão e férias pagos)
// Fiscal nota:  FISCAL:<cnpj>:AAAA-MM:Entrada|Saida:<chave>
// Fiscal apur.: FISCAL:<cnpj>:AAAA-MM:APURACAO:<TRIBUTO>:<referência>
const CAMPO_DP_MENSAL: Record<string, IdOrigem> = {
  folhaBruta: "dp_folha_bruta", descontosINSS: "dp_descontos_inss", inssPatronal: "dp_inss_patronal", descontosIRRF: "dp_descontos_irrf", fgts: "dp_fgts",
  salarioFamilia: "dp_salario_familia", descontosFaltas: "dp_desconto_faltas", descontosVT: "dp_desconto_vt", descontosPensao: "dp_desconto_pensao", descontosAdiantamento: "dp_desconto_adiantamento",
  provisaoFerias: "dp_provisao_ferias", provisao13: "dp_provisao_13", encargosOutros: "dp_provisao_encargos",
  proLabore: "dp_folha_bruta", inssSocio: "dp_descontos_inss", irrfSocio: "dp_descontos_irrf",
};
const CAMPO_DP_EVENTO: Record<string, IdOrigem> = {
  bruto: "dp_folha_bruta", descontosINSS: "dp_descontos_inss", inssPatronal: "dp_inss_patronal", descontosIRRF: "dp_descontos_irrf", fgts: "dp_fgts", multaFgts: "dp_multa_fgts_rescisoria",
};
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const CNPJ = /^[A-Z0-9]{12}\d{2}$/;

export interface OrigemDaReferencia { id: IdOrigem; rotulo: RotuloOrigem; competencia: string | null; sistema: "DP" | "FISCAL" }

export function origemDaReferencia(referencia: string): OrigemDaReferencia | null {
  const p = String(referencia || "").split(":");
  if (p.length < 4 || (p[0] !== "DP" && p[0] !== "FISCAL") || !CNPJ.test(p[1])) return null;
  const monta = (id: IdOrigem | undefined, competencia: string | null): OrigemDaReferencia | null => (id ? { id, rotulo: ID_PARA_ROTULO[id], competencia, sistema: p[0] as "DP" | "FISCAL" } : null);
  if (p[0] === "DP") {
    if (COMP.test(p[2])) return p.length === 4 ? monta(CAMPO_DP_MENSAL[p[3]], p[2]) : null;
    if ((p[2] === "decimo" || p[2] === "rescisao" || p[2] === "ferias") && p.length >= 5 && p[3]) {
      const campo = p[p.length - 1];
      // O bruto das férias tem conta própria: é pago contra a provisão de férias (quando a empresa provisiona), não contra a despesa de folha.
      if (p[2] === "ferias" && campo === "bruto") return monta("dp_ferias", null);
      return monta(CAMPO_DP_EVENTO[campo], null);
    }
    return null;
  }
  if (!COMP.test(p[2])) return null;
  if ((p[3] === "Entrada" || p[3] === "Saida") && p.length >= 5 && p[4]) return monta(p[3] === "Entrada" ? "fiscal_entrada" : "fiscal_saida", p[2]);
  if (p[3] === "APURACAO" && p.length >= 6 && p[5]) return monta(ORIGEM_POR_TRIBUTO[p[4]], p[2]);
  return null;
}
