import test from "node:test";
import assert from "node:assert/strict";
import { gerarRascunhosFiscal, regimeSimplesNacional } from "../../src/server/prepararRascunhosContabeis";

const cnpj = "11497078000180";
const contas = [
  { codigo: "1.2.1", tipo: "analitica" }, { codigo: "2.1.1", tipo: "analitica" },
  { codigo: "1.1.5", tipo: "analitica" }, { codigo: "4.1.1", tipo: "analitica" },
];
const mapeamentos = [
  { origem: "fiscal_entrada", contaDebitoCodigo: "1.2.1", contaCreditoCodigo: "2.1.1" },
  { origem: "fiscal_saida", contaDebitoCodigo: "1.1.5", contaCreditoCodigo: "4.1.1" },
];
const nota = (extra: Record<string, unknown> = {}) => ({
  cnpjEmpresa: cnpj, tipo: "Entrada", chaveAcesso: "52261061064838002420550010003081441050382396",
  dataEmissao: "16/10/2026", valorTotal: 2658.37, statusSefaz: "Autorizada", statusVerificadoSefaz: true,
  dadosTributariosDisponiveis: true, valorIcms: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, ...extra,
});
const agora = "2026-10-20T12:00:00.000Z";

test("reconhece o regime Simples Nacional do cadastro", () => {
  assert.equal(regimeSimplesNacional("Simples Nacional (opção cadastral informada pela fonte)"), true);
  assert.equal(regimeSimplesNacional("Lucro Presumido"), false);
  assert.equal(regimeSimplesNacional(""), false);
  assert.equal(regimeSimplesNacional(undefined), false);
});

test("nota com impostos destacados continua ignorada fora do Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ valorIcms: 100 })], contas, mapeamentos, agora, false).length, 0);
});

test("no Simples Nacional a nota com impostos destacados vira rascunho pelo valor bruto", () => {
  const r = gerarRascunhosFiscal(cnpj, [nota({ valorIcms: 100, valorPis: 10, valorCofins: 46 })], contas, mapeamentos, agora, true);
  assert.equal(r.length, 1);
  assert.equal(r[0].valor, 2658.37);
  assert.equal(r[0].contaDebitoCodigo, "1.2.1");
  assert.equal(r[0].contaCreditoCodigo, "2.1.1");
});

test("resumo sem dados tributários nunca vira rascunho, nem no Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ dadosTributariosDisponiveis: false })], contas, mapeamentos, agora, true).length, 0);
});

test("nota não verificada ou cancelada nunca vira rascunho, nem no Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ statusVerificadoSefaz: false })], contas, mapeamentos, agora, true).length, 0);
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ statusSefaz: "Cancelada" })], contas, mapeamentos, agora, true).length, 0);
});

test("sem mapeamento de contas não há rascunho", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota()], contas, [], agora, true).length, 0);
});
