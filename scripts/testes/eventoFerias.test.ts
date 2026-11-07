import test from "node:test";
import assert from "node:assert/strict";
import { origemDaReferencia } from "../../src/utils/origensContabeis";
import { normalizarEventoDPContrato } from "../../src/server/dadosDpEventosStore";
import { ErroValidacaoResumoDP } from "../../src/server/dadosDpStore";
import { gerarRascunhosEventosDP } from "../../src/server/prepararRascunhosContabeis";
import { workspaceValido } from "../../src/server/authContabil";

const cnpj = "11497078000180";
const agora = "2026-11-07T12:00:00.000Z";
const referencia = "c3d4e5f6c3d4e5f6c3d4e5f6c3d4e5f6";
const processamentoId = "2b9c6f3a-50f1-4e52-8e3b-6a6a6a6a6a6a";
const contas = ["2.1.2", "2.2.1", "2.1.3", "2.2.2", "5.2.1", "2.3.1"].map((codigo) => ({ codigo, descricao: codigo, tipo: "analitica", nivel: 5, natureza: "D" }));
const mapa = (origem: string, d: string, c: string) => ({ origem, contaDebitoCodigo: d, contaCreditoCodigo: c, revisadoEm: agora });
const mapeamentos = [
  mapa("dp_folha_bruta", "5.2.1", "2.1.2"), mapa("dp_descontos_inss", "2.1.2", "2.2.1"), mapa("dp_descontos_irrf", "2.1.2", "2.1.3"), mapa("dp_fgts", "5.2.1", "2.2.2"),
  mapa("dp_ferias", "2.3.1", "2.1.2"), // débito na provisão de férias a pagar
];
// Recibo: férias 3.000,00 + 1/3 1.000,00 = bruto 4.000,00; INSS 320,00; IRRF 150,00; FGTS 320,00
const resumo = { bruto: 4000, descontosINSS: 320, inssPatronal: null, descontosIRRF: 150, fgts: 320 };
const envelope = (extra: Record<string, unknown> = {}, r: Record<string, unknown> = resumo) => ({
  versaoContrato: 1, cnpj, tipo: "ferias", referencia, competencia: "2026-11", processamentoId, calculadoEm: agora, resumo: r, ...extra,
});

test("contrato aceita evento de férias; recusa campo de rescisão e dado pessoal", () => {
  const ok = normalizarEventoDPContrato(cnpj, envelope());
  assert.equal(ok.tipo, "ferias");
  assert.equal(ok.resumo.bruto, 4000);
  assert.equal(ok.resumo.inssPatronal, null);
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelope({}, { ...resumo, multaFgts: 10 })), ErroValidacaoResumoDP);
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelope({ referencia: "12345678901" })), ErroValidacaoResumoDP);
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelope({ nomeFuncionario: "Fulano" })), ErroValidacaoResumoDP);
  assert.throws(() => normalizarEventoDPContrato(cnpj, envelope({}, { ...resumo, fgts: null })), ErroValidacaoResumoDP);
});

test("referência de férias: o bruto tem origem própria; INSS, IRRF e FGTS usam as da folha", () => {
  const o = (r: string) => origemDaReferencia(r)?.id;
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}:bruto`), "dp_ferias");
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}:descontosINSS`), "dp_descontos_inss");
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}:descontosIRRF`), "dp_descontos_irrf");
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}:fgts`), "dp_fgts");
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}:multaFgts`), "dp_multa_fgts_rescisoria"); // nunca é gerado para férias, mas a referência é reconhecida
  assert.equal(o(`DP:${cnpj}:ferias:${referencia}`), undefined);
});

const evento = { tipo: "ferias", referencia, competencia: "2026-11", calculadoEm: agora, atualizadoEm: agora, resumo } as any;

test("férias geram partidas separadas: bruto contra a provisão, INSS, IRRF e FGTS", () => {
  const r = gerarRascunhosEventosDP(cnpj, [evento], contas, mapeamentos, agora);
  const por = Object.fromEntries(r.map((x) => [x.referenciaOrigem.split(":").pop(), x]));
  assert.deepEqual(Object.keys(por).sort(), ["bruto", "descontosINSS", "descontosIRRF", "fgts"]);
  assert.equal(por.bruto.origem, "DP — Férias");
  assert.deepEqual([por.bruto.contaDebitoCodigo, por.bruto.contaCreditoCodigo, por.bruto.valor], ["2.3.1", "2.1.2", 4000]);
  assert.deepEqual([por.descontosINSS.contaDebitoCodigo, por.descontosINSS.contaCreditoCodigo, por.descontosINSS.valor], ["2.1.2", "2.2.1", 320]);
  assert.deepEqual([por.descontosIRRF.contaDebitoCodigo, por.descontosIRRF.contaCreditoCodigo, por.descontosIRRF.valor], ["2.1.2", "2.1.3", 150]);
  assert.equal(por.fgts.valor, 320);
  assert.ok(r.every((x) => x.referenciaOrigem.startsWith(`DP:${cnpj}:ferias:${referencia}:`) && x.historico.includes("Férias")));
  // líquido a pagar ao empregado = bruto − INSS − IRRF, saldo da conta "salários a pagar" (2.1.2): +4000 − 320 − 150
  const saldoSalariosAPagar = r.reduce((s, x) => s + (x.contaCreditoCodigo === "2.1.2" ? x.valor : 0) - (x.contaDebitoCodigo === "2.1.2" ? x.valor : 0), 0);
  assert.equal(saldoSalariosAPagar, 3530);
});

test("sem conta mapeada para 'DP — Férias' o bruto não é inventado; as retenções seguem", () => {
  const semFerias = mapeamentos.filter((m) => m.origem !== "dp_ferias");
  const r = gerarRascunhosEventosDP(cnpj, [evento], contas, semFerias, agora);
  assert.equal(r.some((x) => x.origem === "DP — Férias"), false);
  assert.equal(r.some((x) => x.origem === "DP — Folha"), false); // não cai na conta da folha mensal por engano
  assert.equal(r.length, 3);
});

test("evento de férias e o do mesmo mês na folha mensal não se sobrepõem; o validador aceita os rascunhos", () => {
  const r = gerarRascunhosEventosDP(cnpj, [evento], contas, mapeamentos, agora).map((x) => ({ ...x, status: "pendente_conferencia", geradoAutomaticamente: true }));
  assert.equal(new Set(r.map((x) => x.referenciaOrigem)).size, r.length);
  assert.equal(workspaceValido({ empresa: {}, contas, centrosCusto: [], mapeamentosOrigem: mapeamentos, preLancamentos: r, lancamentos: [], livros: [], lembretes: [] }), true);
});

test("férias de duas pessoas no mesmo mês geram referências distintas", () => {
  const outro = { ...evento, referencia: "d4e5f6a7d4e5f6a7d4e5f6a7d4e5f6a7" };
  const r = gerarRascunhosEventosDP(cnpj, [evento, outro], contas, mapeamentos, agora);
  assert.equal(r.length, 8);
  assert.equal(new Set(r.map((x) => x.referenciaOrigem)).size, 8);
});
