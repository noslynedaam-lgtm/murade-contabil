// Plano de contas da entidade sem finalidade de lucros (ITG 2002 / CFC): renomeia Capital Social e acrescenta as contas, sem apagar nada.
import test from "node:test";
import assert from "node:assert/strict";
import { adaptarPlanoParaEntidade, ehRegimeEntidade, planoEstaComoEntidade } from "../../src/utils/planoEntidade";
import { planoContasInicialContabil, montarWorkspaceInicialContabil } from "../../src/utils/workspaceInicial";

test("adapta o plano padrão: Patrimônio Social, superávit/déficit, doações, subvenções, gratuidades; idempotente e sem apagar", () => {
  const base = planoContasInicialContabil();
  const a = adaptarPlanoParaEntidade(base);
  assert.equal(a.mudou, true);
  assert.equal(a.contas.find((c) => c.codigo === "2.3.01")!.descricao, "Patrimônio Social");
  assert.equal(a.contas.find((c) => c.codigo === "2.3.03")!.descricao, "Superávit ou Déficit Acumulado");
  for (const c of ["3.4", "3.4.02.02", "3.4.03.01", "4.8.01.01", "2.1.11.01"]) assert.ok(a.contas.some((x) => x.codigo === c), c);
  assert.ok(base.every((b) => a.contas.some((x) => x.codigo === b.codigo)), "nenhuma conta some");
  assert.equal(planoEstaComoEntidade(a.contas), true);
  assert.equal(adaptarPlanoParaEntidade(a.contas).mudou, false);
});
test("regime de entidade: workspace inicial já nasce com o plano da entidade; outros regimes não mudam", () => {
  assert.equal(ehRegimeEntidade("Entidade imune"), true); assert.equal(ehRegimeEntidade("Lucro Presumido"), false);
  assert.equal(planoEstaComoEntidade(montarWorkspaceInicialContabil({ regime: "Entidade isenta" }).contas), true);
  assert.equal(planoEstaComoEntidade(montarWorkspaceInicialContabil({ regime: "Simples Nacional" }).contas), false);
});
