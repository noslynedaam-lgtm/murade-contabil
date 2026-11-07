import test from "node:test";
import assert from "node:assert/strict";
import { conciliarResumoFolhaDP, origemDaReferencia } from "../../src/utils/origensContabeis";
import { normalizarResumoDPContrato, ErroValidacaoResumoDP } from "../../src/server/dadosDpStore";
import { gerarRascunhosFolha, gerarRascunhosEventosDP, gerarRascunhosProLabore, gerarRascunhosApuracoes } from "../../src/server/prepararRascunhosContabeis";
import { workspaceValido } from "../../src/server/authContabil";

const cnpj = "11497078000180";
const agora = "2026-11-07T12:00:00.000Z";
const contas = ["2.1.2", "2.2.1", "2.1.3", "2.2.2", "5.2.1", "2.9.1", "2.9.2", "1.9.1", "2.9.3", "6.1.1", "6.1.2"].map((codigo) => ({ codigo, descricao: codigo, tipo: "analitica", nivel: 5, natureza: "D" }));
const mapa = (origem: string, d: string, c: string) => ({ origem, contaDebitoCodigo: d, contaCreditoCodigo: c, revisadoEm: agora });
const mapeamentos = [
  mapa("dp_folha_bruta", "5.2.1", "2.1.2"), mapa("dp_descontos_inss", "2.1.2", "2.2.1"), mapa("dp_descontos_irrf", "2.1.2", "2.1.3"), mapa("dp_fgts", "5.2.1", "2.2.2"),
  mapa("dp_salario_familia", "2.2.1", "2.1.2"), mapa("dp_desconto_faltas", "2.1.2", "5.2.1"), mapa("dp_desconto_vt", "2.1.2", "2.9.1"),
  mapa("dp_desconto_pensao", "2.1.2", "2.9.2"), mapa("dp_desconto_adiantamento", "2.1.2", "1.9.1"),
];
// Folha: bruto 10.000 (antes das faltas); INSS 800; IRRF 500; faltas 200; VT 180; pensão 600; adiantamento 300; SF 135,08 → líquido 7.555,08
const resumo = { quantidadeFuncionarios: 3, folhaBruta: 10000, outrosProventos: 0, descontosINSS: 800, descontosIRRF: 500, descontosOutros: 1280, liquidoFolha: 7555.08, fgts: 800, inssPatronal: null, provisaoFerias: null, provisao13: null, encargosOutros: null,
  salarioFamilia: 135.08, descontosFaltas: 200, descontosVT: 180, descontosPensao: 600, descontosAdiantamento: 300 };

test("conciliação: bruto − INSS − IRRF − descontos classificados + salário-família = líquido", () => {
  assert.deepEqual(conciliarResumoFolhaDP(resumo), { ok: true });
  assert.equal(conciliarResumoFolhaDP({ ...resumo, liquidoFolha: 7555 }).ok, false);                     // líquido não fecha
  assert.equal(conciliarResumoFolhaDP({ ...resumo, descontosVT: 100 }).ok, false);                       // classificados não somam "outros"
  assert.equal(conciliarResumoFolhaDP({ ...resumo, salarioFamilia: undefined, liquidoFolha: 7420 }).ok, true); // sem SF
});

test("resumo no formato antigo continua válido; com descontos sem classificação não gera partidas (nunca chuta)", () => {
  const antigo = { quantidadeFuncionarios: 1, folhaBruta: 5000, outrosProventos: 0, descontosINSS: 500, descontosIRRF: 100, descontosOutros: 0, liquidoFolha: 4400, fgts: 400, inssPatronal: null, provisaoFerias: null, provisao13: null, encargosOutros: null };
  assert.deepEqual(conciliarResumoFolhaDP(antigo), { ok: true });
  const comOutros = conciliarResumoFolhaDP({ ...antigo, descontosOutros: 200, liquidoFolha: 4200 });
  assert.equal(comOutros.ok, false);
  assert.match((comOutros as any).motivo, /não classificou/);
});

test("contrato do resumo: campos novos opcionais, validados e coerentes com 'outros descontos'", () => {
  const envelope = (r: Record<string, unknown>) => ({ versaoContrato: 1, cnpj, competencia: "2026-10", processamentoId: "2b9c6f3a-50f1-4e52-8e3b-6a6a6a6a6a6a", calculadoEm: agora, resumo: r });
  const ok = normalizarResumoDPContrato(cnpj, envelope(resumo));
  assert.equal(ok.resumo.salarioFamilia, 135.08); assert.equal(ok.resumo.descontosPensao, 600);
  const { salarioFamilia, descontosFaltas, descontosVT, descontosPensao, descontosAdiantamento, ...semNovos } = resumo; void salarioFamilia; void descontosFaltas; void descontosVT; void descontosPensao; void descontosAdiantamento;
  assert.doesNotThrow(() => normalizarResumoDPContrato(cnpj, envelope({ ...semNovos, descontosOutros: 0, liquidoFolha: 8700 })));
  assert.throws(() => normalizarResumoDPContrato(cnpj, envelope({ ...resumo, descontosVT: 1 })), ErroValidacaoResumoDP);       // não soma
  assert.throws(() => normalizarResumoDPContrato(cnpj, envelope({ ...resumo, salarioFamilia: -1 })), ErroValidacaoResumoDP);
  assert.throws(() => normalizarResumoDPContrato(cnpj, envelope({ ...resumo, nome: "Fulano" })), ErroValidacaoResumoDP);        // dado pessoal continua barrado
});

test("folha com SF, faltas, VT, pensão e adiantamento vira 9 partidas balanceadas (múltiplas partidas)", () => {
  const r = gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo } as any], contas, mapeamentos, agora);
  assert.equal(r.length, 9);
  const por = (campo: string) => r.find((x) => x.referenciaOrigem.endsWith(`:${campo}`))!;
  assert.deepEqual([por("salarioFamilia").contaDebitoCodigo, por("salarioFamilia").contaCreditoCodigo, por("salarioFamilia").valor], ["2.2.1", "2.1.2", 135.08]);
  assert.deepEqual([por("descontosFaltas").contaDebitoCodigo, por("descontosFaltas").contaCreditoCodigo], ["2.1.2", "5.2.1"]);
  assert.equal(por("descontosVT").contaCreditoCodigo, "2.9.1");
  // Saldo da conta "salários a pagar" (2.1.2) = líquido: crédito (bruto + SF) − débito (INSS + IRRF + faltas + VT + pensão + adiantamento)
  let saldo = 0;
  for (const x of r) { if (x.contaCreditoCodigo === "2.1.2") saldo += x.valor; if (x.contaDebitoCodigo === "2.1.2") saldo -= x.valor; }
  assert.equal(Math.round(saldo * 100) / 100, 7555.08);
});

test("sem a conta de uma partida classificada, a folha inteira fica de fora (não lança metade)", () => {
  const semVt = mapeamentos.filter((m) => m.origem !== "dp_desconto_vt");
  assert.equal(gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo } as any], contas, semVt, agora).length, 0);
  // se o VT for zero, o mapeamento dele não é exigido
  const semVtValor = { ...resumo, descontosVT: 0, descontosOutros: 1100, liquidoFolha: 7735.08 };
  assert.equal(gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo: semVtValor } as any], contas, semVt, agora).length, 8);
});

test("referências: mensal, 13º/rescisão, pró-labore e Fiscal (nota e apuração) apontam para a origem certa", () => {
  const o = (r: string) => origemDaReferencia(r)?.id;
  assert.equal(o(`DP:${cnpj}:2026-10:salarioFamilia`), "dp_salario_familia");
  assert.equal(o(`DP:${cnpj}:2026-10:descontosFaltas`), "dp_desconto_faltas");
  assert.equal(o(`DP:${cnpj}:2026-10:proLabore`), "dp_folha_bruta");
  assert.equal(o(`DP:${cnpj}:decimo:a1b2c3d4a1b2c3d4:bruto`), "dp_folha_bruta");
  assert.equal(o(`DP:${cnpj}:rescisao:a1b2c3d4a1b2c3d4:multaFgts`), "dp_multa_fgts_rescisoria");
  assert.equal(o(`FISCAL:${cnpj}:2026-10:Saida:${"1".repeat(44)}`), "fiscal_saida");
  assert.equal(o(`FISCAL:${cnpj}:2026-10:APURACAO:IRPJ_PRESUMIDO:2026-T3`), "fiscal_irpj_presumido");
  assert.equal(o(`DP:${cnpj}:2026-10:campoInventado`), undefined);
  assert.equal(o(`DP:123:2026-10:fgts`), undefined);
});

const base = (extra: Record<string, unknown>) => ({ empresa: {}, contas, centrosCusto: [], mapeamentosOrigem: mapeamentos, preLancamentos: [], lancamentos: [], livros: [], lembretes: [], ...extra });
const comoPre = (r: any) => ({ ...r, status: "pendente_conferencia", geradoAutomaticamente: true });

test("o validador do workspace aceita TODOS os rascunhos gerados (folha, 13º, rescisão, pró-labore, apuração do Fiscal)", () => {
  const folha = gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo } as any], contas, mapeamentos, agora).map(comoPre);
  assert.equal(workspaceValido(base({ preLancamentos: folha })), true);
  const map2 = [...mapeamentos, mapa("dp_multa_fgts_rescisoria", "6.1.1", "2.2.2"), mapa("fiscal_irpj_presumido", "6.1.2", "2.1.3"), mapa("dp_inss_patronal", "5.2.1", "2.2.1")];
  const ev = gerarRascunhosEventosDP(cnpj, [
    { tipo: "decimo", referencia: "a1b2c3d4a1b2c3d4", competencia: "2026-12", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 9000, descontosINSS: 700, inssPatronal: null, descontosIRRF: 200, fgts: 720 } },
    { tipo: "rescisao", referencia: "b2c3d4e5b2c3d4e5", competencia: "2026-11", calculadoEm: agora, atualizadoEm: agora, resumo: { bruto: 4000, descontosINSS: 300, inssPatronal: null, descontosIRRF: 0, fgts: 320, multaFgts: 1280 } },
  ] as any, contas, map2, agora).map(comoPre);
  assert.ok(ev.length >= 8);
  assert.equal(workspaceValido(base({ mapeamentosOrigem: map2, preLancamentos: ev })), true);
  const pl = gerarRascunhosProLabore(cnpj, [{ competencia: "2026-10", resumo: { proLabore: 3000, inssSocio: 330, irrfSocio: 0, liquido: 2670 } }], contas, mapeamentos, agora).map(comoPre);
  assert.equal(pl.length, 2);
  assert.equal(workspaceValido(base({ preLancamentos: pl })), true);
  const ap = gerarRascunhosApuracoes(cnpj, [{ tributo: "IRPJ_PRESUMIDO", competencia: "2026-09", referencia: "2026-T3", valorCentavos: 123456, situacao: "confirmado" } as any], contas, map2, agora).map(comoPre);
  assert.equal(ap.length, 1);
  assert.equal(workspaceValido(base({ mapeamentosOrigem: map2, preLancamentos: ap })), true);
});

test("o validador continua barrando rascunho adulterado (rótulo, referência ou competência trocados)", () => {
  const [x] = gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo } as any], contas, mapeamentos, agora).map(comoPre);
  assert.equal(workspaceValido(base({ preLancamentos: [{ ...x, origem: "DP — IRRF" }] })), false);              // rótulo não bate com a referência
  assert.equal(workspaceValido(base({ preLancamentos: [{ ...x, competencia: "2026-09" }] })), false);           // competência diferente da referência
  assert.equal(workspaceValido(base({ preLancamentos: [{ ...x, id: "outro" }] })), false);
  assert.equal(workspaceValido(base({ preLancamentos: [{ ...x, referenciaOrigem: "DP:1:2026-10:fgts", id: "DP:1:2026-10:fgts" }] })), false);
});

import { pendenciasFolhasDP } from "../../src/server/conferidorFolhaDP";

test("conferidor: folha do DP sem conta mapeada ou que não fecha aparece como pendência com o motivo", () => {
  const completo = { contas, mapeamentosOrigem: mapeamentos };
  assert.deepEqual(pendenciasFolhasDP(cnpj, [{ competencia: "2026-10", resumo }], completo), []);
  const semVt = pendenciasFolhasDP(cnpj, [{ competencia: "2026-10", resumo }], { contas, mapeamentosOrigem: mapeamentos.filter((m) => m.origem !== "dp_desconto_vt") });
  assert.equal(semVt.length, 1); assert.match(semVt[0].detalhe, /vale-transporte/);
  const naoFecha = pendenciasFolhasDP(cnpj, [{ competencia: "2026-09", resumo: { ...resumo, liquidoFolha: 1 } }], completo);
  assert.equal(naoFecha.length, 1); assert.match(naoFecha[0].detalhe, /não fecham/);
});

test("provisões mensais (férias, 13º, encargos) viram partidas próprias; sem a conta mapeada só elas ficam de fora", () => {
  const comProv = { ...resumo, provisaoFerias: 1333.32, provisao13: 1000, encargosOutros: 186.66 };
  const mapProv = [...mapeamentos, mapa("dp_provisao_ferias", "5.2.1", "6.1.1"), mapa("dp_provisao_13", "5.2.1", "6.1.2"), mapa("dp_provisao_encargos", "5.2.1", "2.2.2")];
  const r = gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo: comProv } as any], contas, mapProv, agora);
  assert.equal(r.length, 12);
  assert.equal(r.find((x) => x.referenciaOrigem.endsWith(":provisaoFerias"))!.valor, 1333.32);
  assert.equal(workspaceValido(base({ mapeamentosOrigem: mapProv, preLancamentos: r.map(comoPre) })), true);
  const semProv = gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo: comProv } as any], contas, mapeamentos, agora);
  assert.equal(semProv.length, 9); // folha completa continua saindo
  assert.equal(gerarRascunhosFolha(cnpj, [{ competencia: "2026-10", resumo: { ...resumo, provisaoFerias: null, provisao13: null, encargosOutros: null } } as any], contas, mapProv, agora).length, 9);
});
