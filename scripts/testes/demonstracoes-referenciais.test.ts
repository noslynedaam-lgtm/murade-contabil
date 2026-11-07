import test from "node:test";
import assert from "node:assert/strict";
import { demonstracoesPorReferencial, resumoDemonstracoesReferenciais } from "../../src/utils/demonstracoesReferenciais";
import type { LinhaBalanceteContabil } from "../../src/utils/livrosContabeis";

const conta = (codigo: string, descricao: string, tipo: "analitica" | "sintetica" = "analitica") => ({ codigo, descricao, nivel: 2 as const, tipo, natureza: "D" as const });
const linha = (codigo: string, descricao: string, deb: number, cred: number, sd: number, sc: number): LinhaBalanceteContabil =>
  ({ conta: conta(codigo, descricao), debitoPeriodoCentavos: deb, creditoPeriodoCentavos: cred, saldoDevedorCentavos: sd, saldoCredorCentavos: sc });

// Capital 1.000,00 em caixa; receita 500,00 em caixa; salários 100,00 pagos do caixa.
const balancete: LinhaBalanceteContabil[] = [
  linha("1.1.01", "Caixa", 150000, 10000, 140000, 0),
  linha("2.3.01", "Capital", 0, 100000, 0, 100000),
  linha("3.1.01", "Receita de serviços", 0, 50000, 0, 50000),
  linha("4.1.01", "Salários", 10000, 0, 10000, 0),
];
const mapa = {
  "1.1.01": "1.01.01.01.01",
  "2.3.01": "2.03.01.01.01",
  "3.1.01": "3.01.01.01.01.06",
  "4.1.01": "3.01.01.07.01.02",
};

test("Balanço e DRE pelo plano referencial: grupos vêm do vínculo e fecham ao centavo", () => {
  const d = demonstracoesPorReferencial({ regime: "real", balancete, mapa });
  assert.deepEqual(d.pendencias, []);
  assert.equal(d.totais.ativo, 140000);
  assert.equal(d.totais.passivo, 0);
  assert.equal(d.totais.patrimonioLiquido, 100000);
  assert.equal(d.totais.resultadoPeriodo, 40000); // 500 − 100
  assert.equal(d.totais.resultadoNaoEncerrado, 40000);
  assert.equal(d.totais.diferenca, 0);
  assert.equal(d.completo, true);
  // a conta sintética pai acumula o valor da filha
  const caixaPai = d.balanco.find((l) => l.codigo === "1.01.01.01")!;
  assert.equal(caixaPai.tipo, "S");
  assert.equal(caixaPai.apresentado, 140000);
  // despesa aparece negativa na apresentação da DRE, receita positiva
  assert.equal(d.dre.find((l) => l.codigo === "3.01.01.01.01.06")!.apresentado, 50000);
  assert.equal(d.dre.find((l) => l.codigo === "3.01.01.07.01.02")!.apresentado, -10000);
  assert.match(resumoDemonstracoesReferenciais(d), /Fecha sem diferença/);
});

test("conta com movimento e sem vínculo não é adivinhada: vira pendência e a demonstração fica incompleta", () => {
  const { ["4.1.01"]: _fora, ...semSalarios } = mapa;
  const d = demonstracoesPorReferencial({ regime: "real", balancete, mapa: semSalarios });
  assert.equal(d.completo, false);
  assert.deepEqual(d.pendencias.map((p) => [p.contaCodigo, p.motivo, p.saldo]), [["4.1.01", "sem-vinculo", 10000]]);
  assert.equal(d.totais.resultadoPeriodo, 50000);
  assert.notEqual(d.totais.diferenca, 0);
  assert.match(resumoDemonstracoesReferenciais(d), /Incompleto/);
});

test("vínculo inexistente ou sintético é recusado", () => {
  const d = demonstracoesPorReferencial({ regime: "real", balancete, mapa: { ...mapa, "1.1.01": "1.01.01.01", "2.3.01": "9.99.99" } });
  const motivos = Object.fromEntries(d.pendencias.map((p) => [p.contaCodigo, p.motivo]));
  assert.equal(motivos["1.1.01"], "vinculo-sintetico");
  assert.equal(motivos["2.3.01"], "vinculo-inexistente");
  assert.equal(d.completo, false);
});

test("conta sem movimento nem saldo não gera pendência", () => {
  const d = demonstracoesPorReferencial({ regime: "presumido", balancete: [...balancete, linha("1.1.99", "Conta zerada", 0, 0, 0, 0)], mapa });
  assert.deepEqual(d.pendencias, []);
  assert.equal(d.completo, true);
});

test("balancete que não fecha aparece como diferença, não é escondido", () => {
  const torto = balancete.map((l) => (l.conta.codigo === "1.1.01" ? { ...l, saldoDevedorCentavos: 140001 } : l));
  const d = demonstracoesPorReferencial({ regime: "real", balancete: torto, mapa });
  assert.equal(d.totais.diferenca, 1);
  assert.equal(d.completo, false);
});
