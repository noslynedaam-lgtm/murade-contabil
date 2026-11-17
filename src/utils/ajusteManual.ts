// Ajuste manual ao lado do automático (regra do dono: tudo que o sistema calcula pode ser corrigido à mão,
// marcado como "ajustado manualmente", e o recálculo automático não sobrescreve sem confirmação).
import type { LancamentoContabil } from "../types";

// Converte "1.234,56", "1234,56" ou "1234.56" em centavos, sem passar por ponto flutuante. Devolve null se inválido.
export function paraCentavos(texto: string | number | undefined | null): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  let s = String(texto ?? "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(v)) return null;
  return m[1] ? -v : v;
}

export function centavosParaTexto(c: number): string {
  const neg = c < 0, a = Math.abs(Math.round(c));
  return `${neg ? "-" : ""}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
}

// Valor em uso: o ajuste manual (se válido) vence o automático.
export function valorEfetivoCentavos(automatico: number, ajuste: string | undefined): number {
  if (ajuste === undefined) return automatico;
  const v = paraCentavos(ajuste);
  return v === null ? automatico : v;
}

export const estaAjustado = (ajuste: string | undefined) => ajuste !== undefined && paraCentavos(ajuste) !== null;
export const contarAjustes = (ajustes: Record<string, string> | undefined) => Object.values(ajustes || {}).filter((v) => estaAjustado(v)).length;

// Lançamento já feito (base) + complementos "AJ" = valor líquido já contabilizado para uma referência.
// Nunca apaga nada: a correção é um novo lançamento (pendente de aprovação) com a diferença.
export function liquidoLancado(lancamentos: LancamentoContabil[], refBase: string): { base?: LancamentoContabil; centavos: number; complementos: number } {
  const ativos = lancamentos.filter((l) => l.statusManual !== "rejeitado");
  const base = ativos.find((l) => l.documentoRef === refBase);
  if (!base) return { centavos: 0, complementos: 0 };
  let total = Math.round(base.valor * 100), n = 0;
  for (const l of ativos) {
    if (!String(l.documentoRef || "").startsWith(`${refBase}:AJ:`)) continue;
    n++;
    total += (l.contaDebitoCodigo === base.contaDebitoCodigo ? 1 : -1) * Math.round(l.valor * 100);
  }
  return { base, centavos: total, complementos: n };
}

export function montarComplemento(base: LancamentoContabil, refBase: string, diferencaCentavos: number, n: number, periodo: string, rotulo: string): LancamentoContabil | null {
  if (!Number.isSafeInteger(diferencaCentavos) || diferencaCentavos === 0) return null;
  const mesmo = diferencaCentavos > 0;
  const [dc, dn, cc, cn] = mesmo
    ? [base.contaDebitoCodigo, base.contaDebitoNome, base.contaCreditoCodigo, base.contaCreditoNome]
    : [base.contaCreditoCodigo, base.contaCreditoNome, base.contaDebitoCodigo, base.contaDebitoNome];
  const ref = `${refBase}:AJ:${n}`;
  return {
    id: ref, data: base.data, contaDebitoCodigo: dc, contaDebitoNome: dn, contaCreditoCodigo: cc, contaCreditoNome: cn,
    valor: Math.abs(diferencaCentavos) / 100, historico: `${rotulo} — ajuste de ${periodo} (${mesmo ? "complemento" : "redução"} após recálculo/ajuste manual)`,
    origem: "Manual", documentoRef: ref, competencia: periodo, statusManual: "pendente_aprovacao",
  };
}
