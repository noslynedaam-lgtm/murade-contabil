import test from "node:test";
import assert from "node:assert/strict";
import { calcularLucroRealAnual, registrosLucroRealAnual, type EntradaLucroRealAnual } from "../../src/services/ecfRealService";

const base = (o: Partial<EntradaLucroRealAnual> = {}): EntradaLucroRealAnual => ({
  anoCalendario: 2025, resultadoContabil: 500000, irpjContabilizado: 0, csllContabilizada: 0,
  adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [], saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0, indAliquotaCsll: "1", ...o,
});

test("lucro real simples: IRPJ 15% + adicional sobre o que excede 240 mil; CSLL 9%", () => {
  const r = calcularLucroRealAnual(base());
  assert.equal(r.baseIrpj, 500000);
  assert.equal(r.n630.find((x) => x.codigo === "3")!.valor, 75000);
  assert.equal(r.n630.find((x) => x.codigo === "4")!.valor, 26000); // (500000-240000)*10%
  assert.equal(r.irpjAPagar, 101000);
  assert.equal(r.csllAPagar, 45000);
});

test("adições/exclusões, CSLL contabilizada e deduções de retenções e estimativas", () => {
  const r = calcularLucroRealAnual(base({
    resultadoContabil: 200000, csllContabilizada: 18000,
    adicoesIrpj: [{ codigo: "8.60", descricao: "Multas por infrações fiscais", valor: 2000 }],
    exclusoesIrpj: [{ codigo: "167.01", descricao: "Outras exclusões", valor: 10000 }],
    adicoesCsll: [{ codigo: "8.60", descricao: "Multas por infrações fiscais", valor: 2000 }],
    deducoesIrpj: { "20": 1000, "24": 20000 }, deducoesCsll: { "17": 500, "19": 6000 },
  }));
  // IRPJ: 200000 + CSLL 18000 + 2000 - 10000 = 210000; sem adicional (<240000); 15% = 31500 - 21000
  assert.equal(r.lucroRealAntesCompensacao, 210000);
  assert.equal(r.irpjAPagar, 10500);
  // CSLL: 200000 + 18000 + 2000 = 220000 * 9% = 19800 - 6500
  assert.equal(r.baseCsll, 220000);
  assert.equal(r.csllAPagar, 13300);
  assert.equal(r.m300[0].codigo, "9");
});

test("compensação de prejuízo limitada a 30% do lucro real", () => {
  const r = calcularLucroRealAnual(base({ resultadoContabil: 100000, saldoPrejuizoFiscal: 80000, saldoBaseNegativaCsll: 10000 }));
  assert.equal(r.compensacaoPrejuizo, 30000);
  assert.deepEqual(r.m300.find((m) => m.tipo === "P"), { codigo: "173", descricao: "(-) Compensação de Prejuízos Fiscais de Períodos Anteriores - Atividades em Geral", tipo: "P", valor: 30000 });
  assert.equal(r.baseIrpj, 70000);
  assert.equal(r.compensacaoBaseNegativa, 10000);
  assert.equal(r.baseCsll, 90000);
  assert.ok(r.avisos.some((a) => a.includes("30%")));
});

test("prejuízo no ano: base negativa, sem imposto, e vira prejuízo fiscal a compensar", () => {
  const r = calcularLucroRealAnual(base({ resultadoContabil: -50000, saldoPrejuizoFiscal: 10000 }));
  assert.equal(r.compensacaoPrejuizo, 0);
  assert.equal(r.baseIrpj, -50000);
  assert.equal(r.prejuizoFiscalDoAno, 50000);
  assert.equal(r.baseNegativaCsllDoAno, 50000);
  assert.equal(r.irpjAPagar, 0);
  assert.equal(r.csllAPagar, 0);
});

test("alíquota de CSLL não suportada é recusada; lançamento sem código também", () => {
  assert.throws(() => calcularLucroRealAnual(base({ indAliquotaCsll: "7" })), /Alíquota/);
  assert.throws(() => calcularLucroRealAnual(base({ adicoesIrpj: [{ codigo: "", descricao: "x", valor: 1 }] })), /código/);
  assert.throws(() => calcularLucroRealAnual(base({ adicoesIrpj: [{ codigo: "8", descricao: "x", valor: -1 }] })), /sem sinal/);
});

test("registros no formato do manual", () => {
  const r = calcularLucroRealAnual(base({ resultadoContabil: 100000, adicoesIrpj: [{ codigo: "8.60", descricao: "Multas | fiscais", valor: 1500.5 }], deducoesIrpj: { "20": 100 } }));
  const l = registrosLucroRealAnual(r);
  assert.ok(l.includes("|M300|8.60|Multas   fiscais|A|4|1500,50||") || l.includes("|M300|8.60|Multas  fiscais|A|4|1500,50||"));
  assert.ok(l.includes("|N630|20|(-) Imposto de Renda Retido na Fonte|100,00|"));
  assert.ok(l.every((x) => x.startsWith("|") && x.endsWith("|")));
});

import { estimarLucroRealWorkspace } from "../../src/server/estimativaLucroReal";
test("estimativa do robô/voz: parte do resultado da contabilidade e devolve IRPJ/CSLL", () => {
  const contas = [
    { codigo: "1.1.01", descricao: "Caixa", nivel: 3, tipo: "analitica", natureza: "D" },
    { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
    { codigo: "3.1", descricao: "Receita de serviços", nivel: 2, tipo: "analitica", natureza: "C" },
    { codigo: "4", descricao: "Despesas", nivel: 1, tipo: "sintetica", natureza: "D" },
    { codigo: "4.1", descricao: "Despesa de pessoal", nivel: 2, tipo: "analitica", natureza: "D" },
  ];
  const l = (id: string, d: string, c: string, v: number) => ({ id, data: "2025-06-10", contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor: v, historico: "x", origem: "Manual", documentoRef: id });
  const r: any = estimarLucroRealWorkspace({ empresa: { regime: "Lucro Real" }, contas, lancamentos: [l("a", "1.1.01", "3.1", 600000), l("b", "4.1", "1.1.01", 100000)] }, 2025);
  assert.equal(r.resultadoContabil, 500000);
  assert.equal(r.irpjEstimado, 101000);
  assert.equal(r.csllEstimada, 45000);
});
