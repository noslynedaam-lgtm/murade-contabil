// Contábil: provisão do ISS a recolher e do ISS retido (empresa tomadora) vindas do Fiscal (apuração do ISS municipal pelas NFS-e):
// origem própria, último dia do mês, reenvio com valor novo atualiza o mesmo pré-lançamento (não duplica) e vigência do ISS até 12/2032.
import assert from "node:assert/strict";
import test from "node:test";
import { dataDaApuracao, gerarRascunhosApuracoes, mesclarRascunhosNoWorkspace, tributoVigenteNaCompetencia } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";
import { ORIGEM_POR_TRIBUTO, origemDaReferencia } from "../../src/utils/origensContabeis";

const cnpj = "11497078000180"; const agora = "2026-11-23T12:00:00.000Z";
const ap = (tributo: string, competencia: string, referencia: string, valorCentavos: number): ApuracaoFiscalArmazenada => ({ cnpj, tributo, competencia, referencia, valorCentavos, baseCentavos: null, situacao: "confirmado", versaoOrigem: `v:${valorCentavos}`, recebidoEm: agora, atualizadoEm: agora });

test("ISS a recolher e ISS retido viram provisão no último dia do mês, pela origem própria, sem duplicar", () => {
  assert.equal(ORIGEM_POR_TRIBUTO.ISS_PROPRIO, "fiscal_iss_proprio"); assert.equal(ORIGEM_POR_TRIBUTO.ISS_RETIDO_TOMADOR, "fiscal_iss_retido_tomador");
  const contas = [{ codigo: "3.1.2", tipo: "analitica" }, { codigo: "2.1.4", tipo: "analitica" }, { codigo: "2.1.1", tipo: "analitica" }];
  const maps = [{ origem: "fiscal_iss_proprio", contaDebitoCodigo: "3.1.2", contaCreditoCodigo: "2.1.4" }, { origem: "fiscal_iss_retido_tomador", contaDebitoCodigo: "2.1.1", contaCreditoCodigo: "2.1.4" }];
  const r = gerarRascunhosApuracoes(cnpj, [ap("ISS_PROPRIO", "2026-10", "ISS:proprio:5208707:2026-10", 5750), ap("ISS_RETIDO_TOMADOR", "2026-10", "ISS:retido:5208707:2026-10", 1235)], contas, maps, agora);
  assert.equal(r.length, 2);
  assert.equal(r[0].valor, 57.5); assert.equal(r[0].data, "2026-10-31"); assert.match(r[0].historico, /ISS a recolher/);
  assert.equal(r[1].valor, 12.35); assert.equal(r[1].contaDebitoCodigo, "2.1.1");
  assert.equal(origemDaReferencia(r[0].referenciaOrigem)?.id, "fiscal_iss_proprio");
  const ws = { mapeamentosOrigem: maps, lancamentos: [], preLancamentos: [] };
  const m1 = mesclarRascunhosNoWorkspace(cnpj, ws, r); assert.equal(m1.criados, 2);
  // Nota cancelada no Fiscal: o ISS de outubro cai para R$ 7,50 → o mesmo pré-lançamento é atualizado.
  const r2 = gerarRascunhosApuracoes(cnpj, [ap("ISS_PROPRIO", "2026-10", "ISS:proprio:5208707:2026-10", 750)], contas, maps, agora);
  const m2 = mesclarRascunhosNoWorkspace(cnpj, m1.workspace, r2); assert.equal(m2.criados, 0); assert.equal(m2.atualizados, 1);
  assert.equal((m2.workspace.preLancamentos as any[]).length, 2);
  assert.equal(dataDaApuracao({ tributo: "ISS_RETIDO_TOMADOR", competencia: "2026-02", versaoOrigem: "x" }), "2026-02-28");
});

test("vigência: ISS até 12/2032 (EC 132/2023, art. 129); depois disso não gera provisão nova", () => {
  assert.equal(tributoVigenteNaCompetencia("ISS_PROPRIO", "2032-12"), true);
  assert.equal(tributoVigenteNaCompetencia("ISS_PROPRIO", "2033-01"), false);
});
