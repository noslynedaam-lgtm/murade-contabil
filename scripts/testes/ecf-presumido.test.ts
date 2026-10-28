import test from "node:test";
import assert from "node:assert/strict";
import { calcularTrimestrePresumido, calcularAnoPresumido, registrosBlocoPTrimestre } from "../../src/services/ecfPresumidoService";

const par = { anoCalendario: 2025, indAliquotaCsll: "1" };

test("comércio (8% / 12%): serviços (32% / 32%) no mesmo trimestre", () => {
  const r = calcularTrimestrePresumido(par, {
    periodo: "T01",
    receitaIrpj: { p16: 0, p8: 100000, p16b: 0, p32: 50000, p384: 0 },
    receitaCsll: { p12: 100000, p32: 50000, p384: 0 },
  });
  // IRPJ: 100000*8% + 50000*32% = 8000 + 16000 = 24000
  assert.equal(r.baseIrpj, 24000);
  assert.equal(r.p200.find((l) => l.codigo === "10")!.valor, 24000);
  // 15% = 3600; adicional = (24000 - 60000) < 0 → 0
  assert.equal(r.irpjAPagar, 3600);
  // CSLL: 100000*12% + 50000*32% = 12000 + 16000 = 28000; 9% = 2520
  assert.equal(r.baseCsll, 28000);
  assert.equal(r.csllAPagar, 2520);
});

test("adicional de 10% sobre o que excede R$ 60.000 no trimestre", () => {
  const r = calcularTrimestrePresumido(par, {
    periodo: "T02",
    receitaIrpj: { p16: 0, p8: 0, p16b: 0, p32: 300000, p384: 0 },
    receitaCsll: { p12: 0, p32: 300000, p384: 0 },
  });
  assert.equal(r.baseIrpj, 96000);
  assert.equal(r.p300.find((l) => l.codigo === "3")!.valor, 14400);
  assert.equal(r.p300.find((l) => l.codigo === "4")!.valor, 3600); // (96000-60000)*10%
  assert.equal(r.irpjAPagar, 18000);
});

test("outras receitas somam na base; retenções abatem o imposto; CSLL 15% e 20% conforme IND_ALIQ_CSLL", () => {
  const e = {
    periodo: "T03" as const,
    receitaIrpj: { p16: 0, p8: 100000, p16b: 0, p32: 0, p384: 0 },
    receitaCsll: { p12: 100000, p32: 0, p384: 0 },
    outrasReceitas: { "11": 1000, "20": 500 },
    deducoesImposto: { "10": 200 } as const,
  };
  const r = calcularTrimestrePresumido(par, e);
  assert.equal(r.baseIrpj, 9500); // 8000 + 1000 + 500
  assert.equal(r.irpjAPagar, 1225); // 9500*15% = 1425 - 200
  assert.equal(r.baseCsll, 13500); // 12000 + 1000 (P200/11) + 500 (P200/20)
  assert.equal(r.csllAPagar, 1215); // 9%
  assert.equal(calcularTrimestrePresumido({ ...par, indAliquotaCsll: "4" }, e).csllAPagar, 2025);
  assert.equal(calcularTrimestrePresumido({ ...par, indAliquotaCsll: "3" }, e).csllAPagar, 2700);
});

test("recusa 2026 em diante (Lei Complementar 224/25 ainda não implementada)", () => {
  assert.throws(() => calcularTrimestrePresumido({ anoCalendario: 2026, indAliquotaCsll: "1" }, { periodo: "T01", receitaIrpj: { p16: 0, p8: 1, p16b: 0, p32: 0, p384: 0 }, receitaCsll: { p12: 1, p32: 0, p384: 0 } }), /224/);
});

test("registros do bloco P: P030 e linhas com vírgula decimal", () => {
  const r = calcularTrimestrePresumido(par, { periodo: "T04", receitaIrpj: { p16: 0, p8: 100000, p16b: 0, p32: 0, p384: 0 }, receitaCsll: { p12: 100000, p32: 0, p384: 0 } });
  const l = registrosBlocoPTrimestre(2025, r);
  assert.equal(l[0], "|P030|01102025|31122025|T04|");
  assert.ok(l.includes("|P200|26|BASE DE CÁLCULO DO IMPOSTO SOBRE O LUCRO PRESUMIDO|8000,00|"));
  assert.ok(l.includes("|P300|15|IMPOSTO DE RENDA A PAGAR|1200,00|"));
  assert.ok(l.includes("|P500|13|CSLL A PAGAR|1080,00|"));
});

const par26 = { anoCalendario: 2026, indAliquotaCsll: "1" };
const serv = (periodo: "T01" | "T02" | "T03" | "T04", v: number) => ({
  periodo, receitaIrpj: { p16: 0, p8: 0, p16b: 0, p32: v, p384: 0 }, receitaCsll: { p12: 0, p32: v, p384: 0 },
});

test("2026: receita até R$ 1.250.000 no trimestre não tem adicional", () => {
  const [r] = calcularAnoPresumido(par26, [serv("T01", 1_000_000)]);
  assert.equal(r.baseIrpj, 320000);
  assert.equal(r.p200.find((l) => l.codigo === "25200")!.valor, 0);
});

test("2026: excedente de R$ 250.000 em serviços (32%) soma 3,2% ao IRPJ; CSLL só a partir de abril", () => {
  const [t1, t2] = calcularAnoPresumido(par26, [serv("T01", 1_500_000), serv("T02", 1_500_000)]);
  // T01: limite 1.250.000 → excedente 250.000 → adicional 250.000×32%×10% = 8.000
  assert.equal(t1.p200.find((l) => l.codigo === "25150")!.valor, 250000);
  assert.equal(t1.baseIrpj, 480000 + 8000);
  assert.equal(t1.p400.find((l) => l.codigo === "20110"), undefined); // CSLL ainda sem a regra no 1º trimestre
  assert.equal(t1.baseCsll, 480000);
  // T02: CSLL passa a valer, adicional 250.000×32%×10%
  assert.equal(t2.p400.find((l) => l.codigo === "20150")!.valor, 250000);
  assert.ok(t2.baseCsll > 480000); // o valor exato segue a fórmula 20200 da tabela (último período)
});

test("2026: variação positiva do limite num trimestre fraco amplia o limite do seguinte", () => {
  const [t1, t2] = calcularAnoPresumido(par26, [serv("T01", 1_000_000), serv("T02", 1_500_000)]);
  assert.equal(t1.p200.find((l) => l.codigo === "25170")!.valor, 250000);
  assert.equal(t2.p200.find((l) => l.codigo === "25140")!.valor, 1_500_000);
  assert.equal(t2.p200.find((l) => l.codigo === "25200")!.valor, 0);
  assert.equal(t2.baseIrpj, 480000);
});

test("antes de 2026 o cálculo trimestral continua igual e o trimestre sozinho em 2026 é recusado", () => {
  assert.throws(() => calcularTrimestrePresumido(par26, serv("T01", 100)), /224\/25/);
  const [r] = calcularAnoPresumido({ anoCalendario: 2025, indAliquotaCsll: "1" }, [serv("T01", 1_500_000)]);
  assert.equal(r.baseIrpj, 480000);
});

import { limiteLc224Workspace } from "../../src/server/limiteLc224";
test("limite LC 224/25 a partir da contabilidade (voz/robô)", () => {
  const contas = [
    { codigo: "4.1.01", descricao: "Receita de serviços", natureza: "credora", tipo: "analitica", grupo: "receita" },
    { codigo: "1.1.01", descricao: "Caixa", natureza: "devedora", tipo: "analitica", grupo: "ativo" },
  ];
  const r: any = limiteLc224Workspace({ contas, lancamentos: [] }, 2026);
  assert.equal(r.limiteAnual, 0);
  assert.equal(r.aplicavel, true);
});
