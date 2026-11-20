import test from "node:test";
import assert from "node:assert/strict";
import { conciliarResumoFolhaDP, ITENS_FOLHA_DP } from "../../src/utils/origensContabeis";

const base = { folhaBruta: 10000, descontosINSS: 900, descontosIRRF: 265.92, fgts: 800, salarioFamilia: 0 };

test("descontos combinados do DP (empréstimo da empresa, convênio, outros) fecham e são aceitos", () => {
  const r = { ...base, descontosEmprestimoEmpresa: 200, descontosConvenio: 150, descontosOutrosAutorizados: 50, descontosOutros: 400, liquidoFolha: 10000 - 900 - 265.92 - 400 };
  assert.deepEqual(conciliarResumoFolhaDP(r), { ok: true });
  for (const c of ["descontosEmprestimoEmpresa", "descontosConvenio", "descontosOutrosAutorizados"]) assert.ok(ITENS_FOLHA_DP.some((i) => i.campo === c));
});

test("resumo sem os campos novos continua valendo", () => {
  const r = { ...base, descontosOutros: 0, liquidoFolha: 10000 - 900 - 265.92 };
  assert.deepEqual(conciliarResumoFolhaDP(r), { ok: true });
});

test("desconto combinado negativo é recusado", () => {
  const r = { ...base, descontosConvenio: -1, descontosOutros: -1, liquidoFolha: 10000 - 900 - 265.92 + 1 };
  assert.equal(conciliarResumoFolhaDP(r).ok, false);
});
