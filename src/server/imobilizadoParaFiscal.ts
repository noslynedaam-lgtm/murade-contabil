// Bens do imobilizado para o Murad Fiscal (crédito de PIS/COFINS não cumulativos pela depreciação/amortização — registro F120 — ou pelo
// valor de aquisição — F130 — da EFD-Contribuições, Guia Prático 1.35). Só leitura: entrega os dados do cadastro (Gestão contábil ›
// Ativo imobilizado) sem calcular crédito; a classificação (tipo de crédito, uso do bem) é feita pela contadora no Fiscal.
// Bem com cadastro inválido (validarBem) não vai: o Fiscal não recebe dado que o próprio Contábil não aceita.
import { validarBem, type BemImobilizado } from "../utils/imobilizado";

export interface BemParaFiscal {
  id: string; descricao: string; codigo: string; custoCentavos: number; residualCentavos: number; vidaUtilMeses: number;
  inicioDepreciacao: string; depreciavel: boolean; baixa: string | null; ajustesQuota: Record<string, number>;
  dataCompra: string | null; contaDepreciacaoCodigo: string | null; contaBemCodigo: string | null;
}
export function bensParaFiscal(payload: Record<string, any> | null | undefined): { bens: BemParaFiscal[]; ignorados: number } {
  const lista: BemImobilizado[] = Array.isArray(payload?.bensImobilizado) ? payload!.bensImobilizado : [];
  const bens: BemParaFiscal[] = []; let ignorados = 0;
  for (const b of lista) {
    if (!b || typeof b !== "object" || !String(b.id || "").trim() || validarBem(b).length) { ignorados += 1; continue; }
    bens.push({
      id: String(b.id), descricao: String(b.descricao || "").trim(), codigo: String(b.codigo || ""), custoCentavos: b.custoCentavos, residualCentavos: b.residualCentavos,
      vidaUtilMeses: b.vidaUtilMeses, inicioDepreciacao: b.inicioDepreciacao, depreciavel: b.depreciavel !== false, baixa: b.baixa?.competencia ?? null,
      ajustesQuota: b.ajustesQuota && typeof b.ajustesQuota === "object" ? { ...b.ajustesQuota } : {},
      dataCompra: b.dataCompra ?? null, contaDepreciacaoCodigo: b.contaDepreciacaoCodigo ?? null, contaBemCodigo: b.contaBemCodigo ?? null,
    });
  }
  return { bens, ignorados };
}
