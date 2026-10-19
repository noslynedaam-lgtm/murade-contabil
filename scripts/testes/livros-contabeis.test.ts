import test from "node:test";
import assert from "node:assert/strict";
import { converterCentavos, normalizarDataContabil, gerarRelatoriosContabeis } from "../../src/utils/livrosContabeis";
import type { ContaPlano, LancamentoContabil } from "../../src/types";

const contas: ContaPlano[] = [
  { codigo: "1", descricao: "Ativo", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1.01", descricao: "Caixa", nivel: 3, tipo: "analitica", natureza: "D" },
  { codigo: "3.1.01", descricao: "Receita de serviços", nivel: 3, tipo: "analitica", natureza: "C" },
  { codigo: "4.1.01", descricao: "Despesa de aluguel", nivel: 3, tipo: "analitica", natureza: "D" },
];

const lanc = (id: string, data: string, d: string, c: string, valor: number, historico = "Teste"): LancamentoContabil => ({
  id, data, contaDebitoCodigo: d, contaDebitoNome: d, contaCreditoCodigo: c, contaCreditoNome: c, valor, historico, origem: "Manual",
});

test("converterCentavos arredonda meio centavo para cima, sem ruído binário", () => {
  assert.equal(converterCentavos(10.075), 1008);
  assert.equal(converterCentavos(1.005), 101);
  assert.equal(converterCentavos(0.1 + 0.2), 30);
  assert.equal(converterCentavos(19.99), 1999);
  assert.equal(converterCentavos(-10.075), -1008);
  assert.equal(converterCentavos(-0.001), 0);
  assert.equal(converterCentavos("abc"), null);
  assert.equal(converterCentavos(Infinity), null);
});

test("normalizarDataContabil rejeita datas impossíveis", () => {
  assert.equal(normalizarDataContabil("2026-02-31"), null);
  assert.equal(normalizarDataContabil("31/02/2026"), null);
  assert.equal(normalizarDataContabil("29/02/2028"), "2028-02-29");
  assert.equal(normalizarDataContabil("05/10/2026"), "2026-10-05");
  assert.equal(normalizarDataContabil(""), null);
});

test("lançamentos válidos fecham: débitos = créditos e balancete equilibrado", () => {
  const r = gerarRelatoriosContabeis(contas, [
    lanc("1", "2026-10-02", "1.1.01", "3.1.01", 1500.5),
    lanc("2", "2026-10-05", "4.1.01", "1.1.01", 400.25),
  ], "2026-10");
  assert.equal(r.invalidos.length, 0);
  assert.equal(r.totalDebitosCentavos, 190075);
  assert.equal(r.totalDebitosCentavos, r.totalCreditosCentavos);
  assert.equal(r.totalSaldoDevedorCentavos, r.totalSaldoCredorCentavos);
  const caixa = r.balancete.find((l) => l.conta.codigo === "1.1.01");
  assert.equal(caixa?.saldoDevedorCentavos, 110025);
});

test("lançamentos inválidos são separados e não entram nos totais", () => {
  const r = gerarRelatoriosContabeis(contas, [
    lanc("ok", "2026-10-02", "1.1.01", "3.1.01", 100),
    lanc("mesma", "2026-10-02", "1.1.01", "1.1.01", 100),
    lanc("zero", "2026-10-02", "1.1.01", "3.1.01", 0),
    lanc("sintetica", "2026-10-02", "1", "3.1.01", 100),
    lanc("data", "2026-02-31", "1.1.01", "3.1.01", 100),
    lanc("sem-historico", "2026-10-02", "1.1.01", "3.1.01", 100, "  "),
    lanc("conta-inexistente", "2026-10-02", "9.9.99", "3.1.01", 100),
  ], "2026-10");
  assert.deepEqual(r.invalidos.map((l) => l.id).sort(), ["conta-inexistente", "data", "mesma", "sem-historico", "sintetica", "zero"]);
  assert.equal(r.totalDebitosCentavos, 10000);
});

test("lançamento manual pendente ou rejeitado não entra nos livros", () => {
  const pendente = { ...lanc("p", "2026-10-02", "1.1.01", "3.1.01", 100), statusManual: "pendente_aprovacao" } as LancamentoContabil;
  const rejeitado = { ...lanc("r", "2026-10-02", "1.1.01", "3.1.01", 100), statusManual: "rejeitado" } as LancamentoContabil;
  const r = gerarRelatoriosContabeis(contas, [pendente, rejeitado], "2026-10");
  assert.equal(r.validos.length, 0);
  assert.equal(r.totalDebitosCentavos, 0);
});
