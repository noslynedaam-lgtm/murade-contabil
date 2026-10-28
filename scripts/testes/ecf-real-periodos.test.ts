import test from "node:test";
import assert from "node:assert/strict";
import { calcularLucroRealTrimestral, calcularEstimativaMensal, registrosEstimativaMensal, registrosLucroRealTrimestral } from "../../src/services/ecfRealPeriodosService";
import { calcularLucroRealAnual } from "../../src/services/ecfRealService";
import { calcularIncentivosIrpj } from "../../src/services/ecfIncentivosService";

const tri = (periodo: "T01" | "T02" | "T03" | "T04", resultado: number) => ({
  periodo, resultadoContabil: resultado, irpjContabilizado: 0, csllContabilizada: 0,
  adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [],
});
const base = { anoCalendario: 2025, indAliquotaCsll: "1", saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0 };

test("trimestral: adicional sobre o que passa de R$ 60.000 e CSLL a 9%", () => {
  const [t1] = calcularLucroRealTrimestral(base, [tri("T01", 100000)]);
  assert.equal(t1.baseIrpj, 100000);
  assert.equal(t1.irpjAPagar, 15000 + 4000); // 15% + 10% × (100.000 − 60.000)
  assert.equal(t1.csllAPagar, 9000);
});

test("trimestral: prejuízo do 1º trimestre é compensado no 2º, limitado a 30%", () => {
  const [t1, t2] = calcularLucroRealTrimestral(base, [tri("T02", 100000), tri("T01", -50000)]);
  assert.equal(t1.periodo, "T01");
  assert.equal(t1.saldoPrejuizoFinal, 50000);
  assert.equal(t2.compensacaoPrejuizo, 30000); // 30% de 100.000
  assert.equal(t2.baseIrpj, 70000);
  assert.equal(t2.saldoPrejuizoFinal, 20000);
});

test("trimestral gera M030/N030 por trimestre", () => {
  const r = calcularLucroRealTrimestral(base, [tri("T01", 10000), tri("T02", 10000)]);
  const reg = registrosLucroRealTrimestral(2025, r);
  assert.ok(reg.includes("|N030|01012025|31032025|T01|"));
  assert.ok(reg.includes("|N030|01042025|30062025|T02|"));
  assert.equal(reg.filter((x) => x.startsWith("|M030|")).length, 2);
});

test("estimativa mensal pela receita bruta: serviços 32% com adicional acima de R$ 20.000", () => {
  const [m] = calcularEstimativaMensal({ anoCalendario: 2025, indAliquotaCsll: "1" }, [{
    mes: 3, modo: "E",
    receita: { irpj: { p16: 0, p8: 0, p16b: 0, p32: 200000, p384: 0 }, csll: { p12: 0, p32: 200000, p384: 0 } },
    retencoesIrpj: { "21": 1000 },
  }]);
  assert.equal(m.baseIrpj, 64000);
  // 15% = 9.600; adicional = (64.000 − 20.000) × 10% = 4.400; menos retenção 1.000
  assert.equal(m.irpjDevido, 9600 + 4400 - 1000);
  assert.equal(m.csllDevida, 5760); // 64.000 × 9%
  assert.equal(m.periodo, "A03");
});

test("estimativa por balancete: adicional sobre 20.000 × meses e desconta o devido em meses anteriores", () => {
  const r = calcularEstimativaMensal({ anoCalendario: 2025, indAliquotaCsll: "1" }, [
    { mes: 1, modo: "B", baseIrpjAcumulada: 50000, baseCsllAcumulada: 50000 },
    { mes: 2, modo: "B", baseIrpjAcumulada: 100000, baseCsllAcumulada: 100000 },
  ]);
  // janeiro: 15% = 7.500; adicional (50.000 − 20.000) × 10% = 3.000 → 10.500
  assert.equal(r[0].irpjDevido, 10500);
  // fevereiro: 15% = 15.000; adicional (100.000 − 40.000) × 10% = 6.000 → 21.000 − 10.500 (meses anteriores)
  assert.equal(r[1].irpjDevido, 10500);
  assert.equal(r[1].csllDevida, 9000 - 4500);
});

test("estimativa registra N030/N620/N660", () => {
  const r = calcularEstimativaMensal({ anoCalendario: 2024, indAliquotaCsll: "1" }, [{
    mes: 2, modo: "E", receita: { irpj: { p16: 0, p8: 10000, p16b: 0, p32: 0, p384: 0 }, csll: { p12: 10000, p32: 0, p384: 0 } },
  }]);
  const reg = registrosEstimativaMensal(2024, r);
  assert.equal(reg[0], "|N030|01012024|29022024|A02|");
  assert.ok(reg.some((x) => x.startsWith("|N620|26|IMPOSTO DE RENDA DEVIDO NO MÊS|120,00|")));
  assert.ok(reg.some((x) => x.startsWith("|N660|18|CSLL DEVIDA NO MÊS|108,00|")));
});

test("incentivos LC 224/25 (2026): limite de 90% e licença-maternidade a 90%", () => {
  const r = calcularIncentivosIrpj("N630", 2026, 15000, { "6": 5000, "11": 100, "16": 1000 });
  const val = (c: string) => r.linhas.find((l) => l.codigo === c)!.valor;
  assert.equal(val("6.1"), 540); // limite 4% × 15.000 × 0,9 = 540 < 5.000
  assert.equal(val("11.1"), 100); // abaixo do limite (1% × 15.000 × 0,9 = 135): deduz o valor
  assert.equal(val("16001"), 900);
  assert.equal(r.totalDeduzido, 1540);
  assert.ok(r.avisos.length >= 1);
  const antes = calcularIncentivosIrpj("N630", 2025, 15000, { "6": 5000 });
  assert.equal(antes.totalDeduzido, 5000);
  assert.equal(antes.linhas.length, 1);
});

test("incentivos entram no IRPJ do Lucro Real anual", () => {
  const r = calcularLucroRealAnual({
    anoCalendario: 2026, resultadoContabil: 1000000, irpjContabilizado: 0, csllContabilizada: 0,
    adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [], saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0,
    indAliquotaCsll: "1", incentivosIrpj: { "8": 100000 },
  });
  // 15% = 150.000; adicional = (1.000.000 − 240.000) × 10% = 76.000; PAT limitado a 4% × 150.000 × 0,9 = 5.400
  assert.equal(r.incentivosDeduzidos, 5400);
  assert.equal(r.irpjAPagar, 150000 + 76000 - 5400);
});

test("incentivo com código inexistente é recusado", () => {
  assert.throws(() => calcularIncentivosIrpj("N630", 2026, 1000, { "99": 10 }), /não existe/);
});

import { apuracaoPeriodosRealWorkspace } from "../../src/server/apuracaoLucroRealPeriodos";
import { conferirWorkspace } from "../../src/server/conferidorContabil";
test("apuração dos períodos a partir da contabilidade: plano vazio e plano sem movimento", () => {
  assert.deepEqual(apuracaoPeriodosRealWorkspace({ contas: [], lancamentos: [] }, 2026, "trimestral", "comercio"), { erro: "Plano de contas vazio." });
  const contas = [{ codigo: "4.1.01", descricao: "Receita", natureza: "credora", tipo: "analitica", grupo: "receita" }];
  const r: any = apuracaoPeriodosRealWorkspace({ contas, lancamentos: [] }, 2026, "estimativa", "servicos");
  assert.deepEqual(r.meses, []);
});
test("robô conferidor: Presumido sem movimento em 2026 não gera alerta de LC 224/25", () => {
  const a = conferirWorkspace("1", { empresa: { regime: "Lucro Presumido" }, contas: [{ codigo: "1", descricao: "x", natureza: "devedora", tipo: "analitica", grupo: "ativo" }], lancamentos: [{ id: "1" }] }, "2026-09");
  assert.ok(!a || !a.pendencias.some((p) => p.id === "lc224"));
});
