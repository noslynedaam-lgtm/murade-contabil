// Bens do imobilizado entregues ao Murad Fiscal (F120/F130 da EFD-Contribuições): só os dados do cadastro válido, sem cálculo.
import assert from "node:assert/strict";
import test from "node:test";
import { bensParaFiscal } from "../../src/server/imobilizadoParaFiscal";

test("bens do imobilizado para o Fiscal: cadastro válido vai com quota ajustada e contas; inválido fica de fora", () => {
  const payload = { bensImobilizado: [
    { id: "b1", descricao: "Torno CNC", custoCentavos: 12_000_000, residualCentavos: 0, vidaUtilMeses: 120, inicioDepreciacao: "2026-01", depreciavel: true, dataCompra: "2025-12-20", contaDepreciacaoCodigo: "4.1.05.010", contaBemCodigo: "1.2.03.001", ajustesQuota: { "2026-03": 50_000 }, baixa: { competencia: "2027-06", valorVendaCentavos: 0, motivo: "baixa" } },
    { id: "b2", descricao: "", custoCentavos: 100, residualCentavos: 0, vidaUtilMeses: 10, inicioDepreciacao: "2026-01", depreciavel: true },
    { id: "b3", descricao: "Terreno", custoCentavos: 5_000_000, residualCentavos: 0, vidaUtilMeses: 0, inicioDepreciacao: "2020-01", depreciavel: false },
  ] };
  const r = bensParaFiscal(payload);
  assert.equal(r.ignorados, 1);
  assert.deepEqual(r.bens.map((b) => b.id), ["b1", "b3"]);
  assert.deepEqual(r.bens[0], { id: "b1", descricao: "Torno CNC", codigo: "", custoCentavos: 12_000_000, residualCentavos: 0, vidaUtilMeses: 120, inicioDepreciacao: "2026-01", depreciavel: true, baixa: "2027-06", ajustesQuota: { "2026-03": 50_000 }, dataCompra: "2025-12-20", contaDepreciacaoCodigo: "4.1.05.010", contaBemCodigo: "1.2.03.001" });
  assert.equal(r.bens[1].depreciavel, false);
  assert.deepEqual(bensParaFiscal(null), { bens: [], ignorados: 0 });
});
