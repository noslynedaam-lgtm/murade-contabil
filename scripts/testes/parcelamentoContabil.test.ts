// Contábil: parcelamento cadastrado no Fiscal (fluxo Fiscal → Contábil) — consolidação no dia da adesão e parcela paga separada em
// amortização (baixa "parcelamentos a pagar") e juros/encargos (despesa financeira), sem duplicar e sem lançar pela metade.
import assert from "node:assert/strict";
import test from "node:test";
import { dataDaApuracao, gerarRascunhosApuracoes, mesclarRascunhosNoWorkspace } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";
import { ORIGEM_POR_TRIBUTO, origemDaReferencia } from "../../src/utils/origensContabeis";

const cnpj = "11497078000180"; const agora = "2026-11-25T12:00:00.000Z";
const ap = (tributo: string, competencia: string, referencia: string, valorCentavos: number, baseCentavos: number | null, versaoOrigem: string): ApuracaoFiscalArmazenada => ({ cnpj, tributo, competencia, referencia, valorCentavos, baseCentavos, situacao: "confirmado", versaoOrigem, recebidoEm: agora, atualizadoEm: agora });
const contas = [{ codigo: "2.1.5", tipo: "analitica" }, { codigo: "2.1.9", tipo: "analitica" }, { codigo: "1.1.1", tipo: "analitica" }, { codigo: "3.4.1", tipo: "analitica" }];
const maps = [
  { origem: "fiscal_parcelamento_adesao", contaDebitoCodigo: "2.1.5", contaCreditoCodigo: "2.1.9" },
  { origem: "fiscal_parcelamento_parcela", contaDebitoCodigo: "2.1.9", contaCreditoCodigo: "1.1.1" },
  { origem: "fiscal_parcelamento_juros", contaDebitoCodigo: "3.4.1", contaCreditoCodigo: "1.1.1" },
];

test("adesão no dia informado e parcela paga separada em amortização e juros", () => {
  assert.equal(ORIGEM_POR_TRIBUTO.PARCELAMENTO_ADESAO, "fiscal_parcelamento_adesao");
  const r = gerarRascunhosApuracoes(cnpj, [
    ap("PARCELAMENTO_ADESAO", "2026-09", "PARC:p1:adesao", 1_200_000, null, "adesao:2026-09-15:1200000"),
    ap("PARCELAMENTO_PARCELA_PAGA", "2026-10", "PARC:p1:parcela:1", 20_350, 20_000, "pago:2026-10-30:20350"),
  ], contas, maps, agora);
  assert.equal(r.length, 3);
  assert.equal(r[0].data, "2026-09-15"); assert.equal(r[0].valor, 12000); assert.equal(r[0].contaCreditoCodigo, "2.1.9");
  assert.equal(r[1].data, "2026-10-30"); assert.equal(r[1].valor, 200); assert.equal(r[1].contaDebitoCodigo, "2.1.9");
  assert.equal(r[2].valor, 3.5); assert.equal(r[2].contaDebitoCodigo, "3.4.1"); assert.match(r[2].historico, /Juros e encargos/);
  assert.equal(origemDaReferencia(r[0].referenciaOrigem)?.id, "fiscal_parcelamento_adesao");
  const m1 = mesclarRascunhosNoWorkspace(cnpj, { mapeamentosOrigem: maps, lancamentos: [], preLancamentos: [] }, r); assert.equal(m1.criados, 3);
  const m2 = mesclarRascunhosNoWorkspace(cnpj, m1.workspace, r); assert.equal(m2.criados, 0);
  assert.equal(dataDaApuracao({ tributo: "PARCELAMENTO_PARCELA_PAGA", competencia: "2026-10", versaoOrigem: "pago:2026-11-02:1" }), "2026-10-01");
});

test("com juros e sem conta de juros mapeada, a parcela não sai pela metade", () => {
  const r = gerarRascunhosApuracoes(cnpj, [ap("PARCELAMENTO_PARCELA_PAGA", "2026-10", "PARC:p1:parcela:1", 20_350, 20_000, "pago:2026-10-30:20350")], contas, maps.slice(0, 2), agora);
  assert.equal(r.length, 0);
  const s = gerarRascunhosApuracoes(cnpj, [ap("PARCELAMENTO_PARCELA_PAGA", "2026-10", "PARC:p1:parcela:2", 20_000, 20_000, "pago:2026-10-30:20000")], contas, maps.slice(0, 2), agora);
  assert.equal(s.length, 1); assert.equal(s[0].valor, 200);
});
