import test from "node:test";
import assert from "node:assert/strict";
import { normalizarEventoDPContrato } from "../../src/server/dadosDpEventosStore";
import { gerarRascunhosEventosDP } from "../../src/server/prepararRascunhosContabeis";
import { ErroValidacaoResumoDP } from "../../src/server/dadosDpStore";

const cnpj = "11497078000180";
const processamentoId = "2b9c6f3a-50f1-4e52-8e3b-6a6a6a6a6a6a";
const referenciaDecimo = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // hash de 32 hex, sem dado pessoal

function envelopeDecimo(extra: Record<string, unknown> = {}) {
  return {
    versaoContrato: 1, cnpj, tipo: "decimo", referencia: referenciaDecimo, competencia: "2026-12",
    processamentoId, calculadoEm: "2026-12-20T12:00:00.000Z",
    resumo: { bruto: 10000, descontosINSS: 900, inssPatronal: 2000, descontosIRRF: 300, fgts: 800, ...extra },
  };
}

test("normalizarEventoDPContrato aceita um evento de 13º completo", () => {
  const r = normalizarEventoDPContrato(cnpj, envelopeDecimo());
  assert.equal(r.tipo, "decimo");
  assert.equal(r.resumo.bruto, 10000);
  assert.equal(r.resumo.inssPatronal, 2000);
});

test("normalizarEventoDPContrato aceita INSS patronal null (ainda não apurado), mas não os demais", () => {
  const r = normalizarEventoDPContrato(cnpj, envelopeDecimo({ inssPatronal: null }));
  assert.equal(r.resumo.inssPatronal, null);
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelopeDecimo({ fgts: null })), ErroValidacaoResumoDP);
});

test("normalizarEventoDPContrato rejeita referência que parece CPF ou CNPJ", () => {
  assert.throws(() => normalizarEventoDPContrato(cnpj, { ...envelopeDecimo(), referencia: "12345678901" }), ErroValidacaoResumoDP);
});

test("normalizarEventoDPContrato rejeita campo de rescisão (multaFgts) num evento de 13º", () => {
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelopeDecimo({ multaFgts: 500 })), ErroValidacaoResumoDP);
});

test("normalizarEventoDPContrato exige multaFgts (mesmo que 0) numa rescisão", () => {
  const base = { versaoContrato: 1, cnpj, tipo: "rescisao", referencia: referenciaDecimo, competencia: "2026-07", processamentoId, calculadoEm: "2026-07-10T12:00:00.000Z" };
  assert.throws(() => normalizarEventoDPContrato(cnpj, { ...base, resumo: { bruto: 5000, descontosINSS: 400, inssPatronal: null, descontosIRRF: 100, fgts: 400 } }), ErroValidacaoResumoDP);
  const r = normalizarEventoDPContrato(cnpj, { ...base, resumo: { bruto: 5000, descontosINSS: 400, inssPatronal: null, descontosIRRF: 100, fgts: 400, multaFgts: 1600 } });
  assert.equal(r.resumo.multaFgts, 1600);
});

const contas = [
  { codigo: "5.2.1", tipo: "analitica" }, { codigo: "2.1.2", tipo: "analitica" },
  { codigo: "2.2.1", tipo: "analitica" }, { codigo: "2.1.3", tipo: "analitica" }, { codigo: "2.2.2", tipo: "analitica" },
  { codigo: "2.2.3", tipo: "analitica" },
];
const mapeamentos = [
  { origem: "dp_folha_bruta", contaDebitoCodigo: "5.2.1", contaCreditoCodigo: "2.1.2" },
  { origem: "dp_descontos_inss", contaDebitoCodigo: "2.1.2", contaCreditoCodigo: "2.2.1" },
  { origem: "dp_descontos_irrf", contaDebitoCodigo: "2.1.2", contaCreditoCodigo: "2.1.3" },
  { origem: "dp_fgts", contaDebitoCodigo: "5.2.1", contaCreditoCodigo: "2.2.2" },
  { origem: "dp_multa_fgts_rescisoria", contaDebitoCodigo: "5.2.1", contaCreditoCodigo: "2.2.3" },
];
const agora = "2026-12-20T12:00:00.000Z";

test("gerarRascunhosEventosDP usa as mesmas contas da folha para o 13º (sem INSS patronal configurado: fica fora, resto completo)", () => {
  const eventos = [{ tipo: "decimo" as const, referencia: referenciaDecimo, competencia: "2026-12", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 10000, descontosINSS: 900, inssPatronal: null, descontosIRRF: 300, fgts: 800 } }];
  const r = gerarRascunhosEventosDP(cnpj, eventos, contas, mapeamentos, agora);
  assert.equal(r.length, 4); // bruto, inss, irrf, fgts — sem inssPatronal (não mapeado) e sem multaFgts (não existe em 13º)
  assert.ok(r.every((item) => item.referenciaOrigem.startsWith(`DP:${cnpj}:decimo:${referenciaDecimo}:`)));
  const bruto = r.find((item) => item.referenciaOrigem.endsWith(":bruto"))!;
  assert.equal(bruto.valor, 10000); assert.equal(bruto.contaDebitoCodigo, "5.2.1"); assert.equal(bruto.contaCreditoCodigo, "2.1.2");
});

test("gerarRascunhosEventosDP gera a multa do FGTS da rescisão numa conta separada do FGTS mensal", () => {
  const referenciaRescisao = "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3";
  const eventos = [{ tipo: "rescisao" as const, referencia: referenciaRescisao, competencia: "2026-07", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 5000, descontosINSS: 400, inssPatronal: null, descontosIRRF: 100, fgts: 400, multaFgts: 1600 } }];
  const r = gerarRascunhosEventosDP(cnpj, eventos, contas, mapeamentos, agora);
  const multa = r.find((item) => item.origem === "DP — Multa FGTS rescisória")!;
  assert.ok(multa, "deveria gerar o rascunho da multa");
  assert.equal(multa.valor, 1600);
  assert.equal(multa.contaCreditoCodigo, "2.2.3");
  const fgts = r.find((item) => item.origem === "DP — FGTS")!;
  assert.equal(fgts.valor, 400);
  assert.notEqual(fgts.contaCreditoCodigo, multa.contaCreditoCodigo);
});

test("gerarRascunhosEventosDP nunca mistura dois eventos na mesma referência (não some um pelo outro no mesmo mês)", () => {
  const eventos = [
    { tipo: "rescisao" as const, referencia: "1111111111111111111111111111aaaa".slice(0, 32), competencia: "2026-07", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 5000, descontosINSS: 0, inssPatronal: null, descontosIRRF: 0, fgts: 400, multaFgts: 0 } },
    { tipo: "rescisao" as const, referencia: "2222222222222222222222222222bbbb".slice(0, 32), competencia: "2026-07", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 3000, descontosINSS: 0, inssPatronal: null, descontosIRRF: 0, fgts: 240, multaFgts: 0 } },
  ];
  const r = gerarRascunhosEventosDP(cnpj, eventos, contas, mapeamentos, agora);
  const brutos = r.filter((item) => item.referenciaOrigem.endsWith(":bruto"));
  assert.equal(brutos.length, 2);
  assert.deepEqual(brutos.map((item) => item.valor).sort(), [3000, 5000]);
});
