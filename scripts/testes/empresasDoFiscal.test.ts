import test from "node:test";
import assert from "node:assert/strict";
import { buscarEmpresasDoFiscal, cnpjsValidosDoFiscal } from "../../src/server/empresasDoFiscal";

test("filtra CNPJs do Fiscal: formato, validade e repetidos", () => {
  const r = cnpjsValidosDoFiscal([{ cnpj: "11.222.333/0001-81" }, { cnpj: "11222333000181" }, { cnpj: "123" }, { cnpj: "99999999999999" }, null], (c) => c !== "99999999999999");
  assert.deepEqual(r, ["11222333000181"]);
  assert.deepEqual(cnpjsValidosDoFiscal(undefined, () => true), []);
});

test("busca no Fiscal exige token e trata erro", async () => {
  assert.equal((await buscarEmpresasDoFiscal({})).ok, false);
  const ok = await buscarEmpresasDoFiscal({ MURADE_INTEGRATION_TOKEN: "t" }, (async (url: any, init: any) => {
    assert.match(String(url), /\/api\/integracao\/fiscal\/empresas$/); assert.equal(init.headers.authorization, "Bearer t");
    return new Response(JSON.stringify({ empresas: [{ cnpj: "11222333000181" }] }), { status: 200 });
  }) as any);
  assert.equal(ok.ok, true); assert.equal(ok.empresas.length, 1);
  assert.equal((await buscarEmpresasDoFiscal({ MURADE_INTEGRATION_TOKEN: "t" }, (async () => new Response("x", { status: 500 })) as any)).ok, false);
});
