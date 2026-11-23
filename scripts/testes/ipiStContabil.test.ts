// Contábil: provisão do IPI a recolher e do ICMS-ST (devido na entrada e a recuperar) vindas do Fiscal: aceitas na recepção, origem própria,
// último dia do mês, reenvio com valor novo atualiza o mesmo pré-lançamento e vigência do ICMS até 12/2032 (IPI sem fim).
import assert from "node:assert/strict";
import test from "node:test";
import { dataDaApuracao, gerarRascunhosApuracoes, mesclarRascunhosNoWorkspace, tributoVigenteNaCompetencia } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";
import { ORIGEM_POR_TRIBUTO, origemDaReferencia } from "../../src/utils/origensContabeis";

const cnpj = "11497078000180"; const agora = "2026-11-23T12:00:00.000Z";
const ap = (tributo: string, competencia: string, referencia: string, valorCentavos: number): ApuracaoFiscalArmazenada => ({ cnpj, tributo, competencia, referencia, valorCentavos, baseCentavos: null, situacao: "confirmado", versaoOrigem: `v:${valorCentavos}`, recebidoEm: agora, atualizadoEm: agora });

test("IPI a recolher e ICMS-ST viram provisão no último dia do mês, pela origem própria, sem duplicar", () => {
  assert.equal(ORIGEM_POR_TRIBUTO.IPI_A_RECOLHER, "fiscal_ipi_recolher"); assert.equal(ORIGEM_POR_TRIBUTO.ICMS_ST_ENTRADA, "fiscal_icms_st_entrada"); assert.equal(ORIGEM_POR_TRIBUTO.ICMS_ST_RESSARCIR, "fiscal_icms_st_recuperar");
  const contas = [{ codigo: "1.1.5", tipo: "analitica" }, { codigo: "2.1.4", tipo: "analitica" }, { codigo: "1.1.4", tipo: "analitica" }, { codigo: "4.1.1", tipo: "analitica" }];
  const maps = [{ origem: "fiscal_ipi_recolher", contaDebitoCodigo: "1.1.5", contaCreditoCodigo: "2.1.4" }, { origem: "fiscal_icms_st_entrada", contaDebitoCodigo: "1.1.4", contaCreditoCodigo: "2.1.4" }, { origem: "fiscal_icms_st_recuperar", contaDebitoCodigo: "1.1.5", contaCreditoCodigo: "4.1.1" }];
  const r = gerarRascunhosApuracoes(cnpj, [ap("IPI_A_RECOLHER", "2026-10", "IPI:2026-10", 2500), ap("ICMS_ST_ENTRADA", "2026-10", "ICMSST:entrada:2026-10", 16899), ap("ICMS_ST_RESSARCIR", "2026-10", "ICMSST:recuperar:2026-10", 2000)], contas, maps, agora);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => [x.valor, x.data]), [[25, "2026-10-31"], [168.99, "2026-10-31"], [20, "2026-10-31"]]);
  assert.match(r[0].historico, /IPI a recolher/); assert.match(r[1].historico, /ICMS-ST devido na entrada/);
  assert.equal(origemDaReferencia(r[0].referenciaOrigem)?.id, "fiscal_ipi_recolher");
  const m1 = mesclarRascunhosNoWorkspace(cnpj, { mapeamentosOrigem: maps, lancamentos: [], preLancamentos: [] }, r); assert.equal(m1.criados, 3);
  // Nota nova no Fiscal: o IPI de outubro sobe para R$ 30,00 → o mesmo pré-lançamento é atualizado.
  const m2 = mesclarRascunhosNoWorkspace(cnpj, m1.workspace, gerarRascunhosApuracoes(cnpj, [ap("IPI_A_RECOLHER", "2026-10", "IPI:2026-10", 3000)], contas, maps, agora));
  assert.equal(m2.criados, 0); assert.equal(m2.atualizados, 1); assert.equal((m2.workspace.preLancamentos as any[]).length, 3);
  assert.equal(dataDaApuracao({ tributo: "ICMS_ST_ENTRADA", competencia: "2026-02", versaoOrigem: "x" }), "2026-02-28");
});

test("vigência: ICMS-ST até 12/2032 (EC 132/2023, art. 129); IPI sem data de fim", () => {
  assert.equal(tributoVigenteNaCompetencia("ICMS_ST_ENTRADA", "2032-12"), true); assert.equal(tributoVigenteNaCompetencia("ICMS_ST_RESSARCIR", "2033-01"), false);
  assert.equal(tributoVigenteNaCompetencia("IPI_A_RECOLHER", "2040-01"), true);
});
