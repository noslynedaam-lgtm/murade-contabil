// MIT da DCTFWeb: o Contábil entrega ao Fiscal só o IRPJ/CSLL do Lucro Real CONFIRMADO do mês (estimativa ou fim do trimestre).
import assert from "node:assert/strict";
import test from "node:test";
import { lucroRealParaMit } from "../../src/server/lucroRealMit";
import { limparCacheLucroRealParaTeste } from "../../src/server/lucroRealApuracao";

const CNPJ = "11222333000181";
function banco(cfg: Record<string, unknown> | null, apuracoes: any[], pagamentos: any[] = []) {
  return async (sql: string, p: unknown[] = []) => {
    if (/FROM contabil_lucro_real_config/.test(sql)) return { rows: cfg ? [{ dados: cfg }] : [] };
    if (/FROM contabil_lucro_real_apuracoes WHERE cnpj=\$1 AND ano=\$2/.test(sql)) return { rows: apuracoes.filter((a) => a.ano === p[1]) };
    if (/FROM contabil_lucro_real_pagamentos/.test(sql)) return { rows: pagamentos.filter((x) => x.ano === p[1]) };
    return { rows: [] };
  };
}
const ap = (ano: number, periodo: string, status: string, ir: number, cs: number, resultado: Record<string, unknown> = {}) => ({ id: `${CNPJ}:${ano}:${periodo}`, cnpj: CNPJ, ano, periodo, status, irpj_centavos: ir, csll_centavos: cs, resultado, revisar: [], calculado_em: new Date(), confirmado_por: null, confirmado_em: null });

test("sem configuração do Lucro Real: não configurado", async () => {
  limparCacheLucroRealParaTeste();
  const r = await lucroRealParaMit(banco(null, []), CNPJ, "2026-10");
  assert.equal(r.configurado, false); assert.equal(r.periodo, null);
});

test("estimativa: período A<MM> com o modo do balancete e os pagamentos do período", async () => {
  limparCacheLucroRealParaTeste();
  const r = await lucroRealParaMit(banco({ forma: "estimativa", obrigada: true }, [ap(2026, "A10", "confirmado", 150000, 90000, { modo: "B" })], [{ ano: 2026, periodo: "A10", tributo: "irpj", data_pagamento: "2026-11-30", valor_pago_centavos: 150000, principal_centavos: 150000, registrado_por: "ana", registrado_em: new Date() }]), CNPJ, "2026-10");
  assert.equal(r.forma, "estimativa"); assert.equal(r.obrigada, true); assert.equal(r.periodoEsperado, "A10");
  assert.deepEqual(r.periodo, { id: "A10", status: "confirmado", irpjCentavos: 150000, csllCentavos: 90000, modo: "B" });
  assert.equal(r.pagamentos.length, 1); assert.equal(r.pagamentos[0].principalCentavos, 150000);
});

test("trimestral: só no último mês do trimestre; ajuste anual do ano anterior de janeiro a março", async () => {
  limparCacheLucroRealParaTeste();
  const b = banco({ forma: "trimestral", obrigada: false }, [ap(2026, "T03", "confirmado", 500000, 200000), ap(2025, "ANUAL", "confirmado", 1000, -50)]);
  assert.equal((await lucroRealParaMit(b, CNPJ, "2026-08")).periodoEsperado, null);
  const set = await lucroRealParaMit(b, CNPJ, "2026-09");
  assert.equal(set.periodoEsperado, "T03"); assert.equal(set.periodo?.irpjCentavos, 500000);
  const fev = await lucroRealParaMit(b, CNPJ, "2026-02");
  assert.deepEqual(fev.ajusteAnualAnterior, { ano: 2025, status: "confirmado", irpjCentavos: 1000, csllCentavos: 0 });
});
