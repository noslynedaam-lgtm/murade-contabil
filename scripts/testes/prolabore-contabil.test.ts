import test from "node:test";
import assert from "node:assert/strict";
import { normalizarResumoProLaboreContrato } from "../../src/server/dadosProLaboreStore";
import { gerarRascunhosProLabore } from "../../src/server/prepararRascunhosContabeis";

const cnpj = "11497078000180";
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const envio = (resumo: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ versaoContrato: 1, cnpj, competencia: "2026-10", processamentoId: UUID, calculadoEm: "2026-11-03T12:00:00.000Z", resumo, ...extra });
const resumoOk = { quantidadeSocios: 2, proLabore: 6000, inssSocio: 660, irrfSocio: 380.02, liquido: 4959.98 };

test("contrato do pró-labore: aceita só totais e confere o líquido", () => {
  const r = normalizarResumoProLaboreContrato(cnpj, envio(resumoOk));
  assert.equal(r.competencia, "2026-10"); assert.equal(r.resumo.proLabore, 6000); assert.equal(r.resumo.liquido, 4959.98);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio({ ...resumoOk, liquido: 5000 })), /líquido/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio({ ...resumoOk, nomeSocio: "Maria" })), /somente/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio({ quantidadeSocios: 2, proLabore: 1 })), /somente/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio({ ...resumoOk, proLabore: -1 })), /inválido/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio(resumoOk, { cpf: "1" })), /campos adicionais/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio(resumoOk, { versaoContrato: 2 })), /Versão/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio(resumoOk, { cnpj: "22222222000191" })), /CNPJ/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio(resumoOk, { competencia: "2026-13" })), /Competência/);
  assert.throws(() => normalizarResumoProLaboreContrato(cnpj, envio(resumoOk, { processamentoId: "abc" })), /UUID/);
});

const contas = [{ codigo: "5.2.1", tipo: "analitica" }, { codigo: "2.1.2", tipo: "analitica" }, { codigo: "2.2.1", tipo: "analitica" }, { codigo: "2.1.3", tipo: "analitica" }];
const mapeamentos = [
  { origem: "dp_folha_bruta", contaDebitoCodigo: "5.2.1", contaCreditoCodigo: "2.1.2" },
  { origem: "dp_descontos_inss", contaDebitoCodigo: "2.1.2", contaCreditoCodigo: "2.2.1" },
  { origem: "dp_descontos_irrf", contaDebitoCodigo: "2.1.2", contaCreditoCodigo: "2.1.3" },
];
const agora = "2026-11-03T12:00:00.000Z";

test("pró-labore vira três pré-lançamentos com as contas da folha", () => {
  const r = gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: resumoOk }], contas, mapeamentos, agora);
  assert.equal(r.length, 3);
  const bruto = r.find((x) => x.referenciaOrigem.endsWith(":proLabore"))!; const inss = r.find((x) => x.referenciaOrigem.endsWith(":inssSocio"))!; const irrf = r.find((x) => x.referenciaOrigem.endsWith(":irrfSocio"))!;
  assert.deepEqual([bruto.contaDebitoCodigo, bruto.contaCreditoCodigo, bruto.valor], ["5.2.1", "2.1.2", 6000]);
  assert.deepEqual([inss.contaDebitoCodigo, inss.contaCreditoCodigo, inss.valor], ["2.1.2", "2.2.1", 660]);
  assert.deepEqual([irrf.contaDebitoCodigo, irrf.contaCreditoCodigo, irrf.valor], ["2.1.2", "2.1.3", 380.02]);
  assert.equal(bruto.referenciaOrigem, `DP:${cnpj}:2026-10:proLabore`); assert.equal(bruto.competencia, "2026-10"); assert.equal(bruto.data, "2026-10-01");
});

test("IRRF zero não gera lançamento; sem mapeamento do bruto ou do INSS não gera nada (tudo ou nada)", () => {
  const semIrrf = gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: { quantidadeSocios: 1, proLabore: 3000, inssSocio: 330, irrfSocio: 0, liquido: 2670 } }], contas, mapeamentos, agora);
  assert.deepEqual(semIrrf.map((x) => x.referenciaOrigem.split(":").at(-1)), ["proLabore", "inssSocio"]);
  const semInss = gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: resumoOk }], contas, mapeamentos.filter((m) => m.origem !== "dp_descontos_inss"), agora);
  assert.equal(semInss.length, 0);
  assert.equal(gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: resumoOk }], contas, [], agora).length, 0);
});

test("resumo incoerente ou vazio não gera lançamento", () => {
  assert.equal(gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: { ...resumoOk, liquido: 1 } }], contas, mapeamentos, agora).length, 0);
  assert.equal(gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: { quantidadeSocios: 1, proLabore: 0, inssSocio: 0, irrfSocio: 0, liquido: 0 } }], contas, mapeamentos, agora).length, 0);
  assert.equal(gerarRascunhosProLabore(cnpj, [{ competencia: "2026/10", resumo: resumoOk }], contas, mapeamentos, agora).length, 0);
});
