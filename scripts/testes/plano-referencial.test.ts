import test from "node:test";
import assert from "node:assert/strict";
import { codPlanRefECD, contasReferenciais, existeContaReferencialAnalitica, regimeReferencial, sugerirMapeamento } from "../../src/services/planoReferencialService";
import type { ContaPlano } from "../../src/types";

test("carrega os planos referenciais de Lucro Real e Presumido (PJ em geral)", () => {
  assert.ok(contasReferenciais("real", "patrimonial").length > 500);
  assert.ok(contasReferenciais("real", "resultado").length > 300);
  assert.ok(contasReferenciais("presumido", "patrimonial").length > 500);
  assert.ok(contasReferenciais("presumido", "resultado").length > 300);
  assert.equal(existeContaReferencialAnalitica("real", "1.01.01.01.01"), true); // Caixa Matriz
  assert.equal(existeContaReferencialAnalitica("real", "1.01.01.01"), false); // sintética
  assert.equal(regimeReferencial("Lucro Presumido"), "presumido");
  assert.equal(regimeReferencial("Simples Nacional"), null);
  assert.equal(codPlanRefECD("real"), "1");
  assert.equal(codPlanRefECD("presumido"), "2");
});

test("sugere vínculo pela descrição e respeita o grupo (patrimonial x resultado)", () => {
  const contas: ContaPlano[] = [
    { codigo: "1.1.01", descricao: "Caixa Matriz", nivel: 3, tipo: "analitica", natureza: "D" },
    { codigo: "1.1.02", descricao: "Bancos Conta Movimento", nivel: 3, tipo: "analitica", natureza: "D" },
    { codigo: "9.9.99", descricao: "Conta sem natureza", nivel: 3, tipo: "analitica", natureza: "D" },
  ];
  const nat = new Map([["1.1.01", "01"], ["1.1.02", "01"]]);
  const s = sugerirMapeamento(contas, "real", nat);
  const caixa = s.find((x) => x.contaCodigo === "1.1.01")!;
  assert.equal(caixa.candidatos[0].codigo, "1.01.01.01.01");
  assert.equal(caixa.confianca, "alta");
  const banco = s.find((x) => x.contaCodigo === "1.1.02")!;
  assert.ok(banco.candidatos.some((c) => c.descricao.startsWith("Bancos Conta Movimento")));
  assert.equal(s.find((x) => x.contaCodigo === "9.9.99")!.confianca, "sem-sugestao");
  // já mapeadas não aparecem
  assert.equal(sugerirMapeamento(contas, "real", nat, { "1.1.01": "1.01.01.01.01" }).some((x) => x.contaCodigo === "1.1.01"), false);
});
