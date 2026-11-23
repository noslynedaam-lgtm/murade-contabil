// Contábil: provisões do Lucro Arbitrado e da COFINS da entidade vindas do Fiscal (pré-lançamento, sem duplicar), título da DRE da
// entidade e a marca de entidade circulando entre Fiscal, DP e Contábil (em branco recebe; diferente vira aviso; nunca sobrescreve).
import assert from "node:assert/strict";
import test from "node:test";
import { gerarRascunhosApuracoes, mesclarRascunhosNoWorkspace } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";
import { ORIGEM_POR_TRIBUTO, origemDaReferencia } from "../../src/utils/origensContabeis";
import { rotulosDreDaEmpresa } from "../../src/utils/planoEntidade";
import { htmlRelatorioCliente, svgEvolucao } from "../../src/utils/relatorioCliente";
import { conferirSincroniaEntidadesContabil, decidirSincronia, limparCacheSincroniaEntidadeContabilParaTeste, marcaFeitaAqui, marcaLocalDoContabil, sincronizarEntidadesContabil } from "../../src/server/entidadeSincroniaContabil";
import { kitContabil } from "../../src/server/agenteContabil";

const cnpj = "11497078000180"; const agora = "2026-11-23T12:00:00.000Z";
const ap = (tributo: string, competencia: string, referencia: string, valorCentavos: number): ApuracaoFiscalArmazenada => ({ cnpj, tributo, competencia, referencia, valorCentavos, baseCentavos: null, situacao: "confirmado", versaoOrigem: `v:${valorCentavos}:`, recebidoEm: agora, atualizadoEm: agora });

test("arbitrado e COFINS da entidade viram provisão no último dia do mês, pela origem própria, e reenvio não duplica", () => {
  for (const t of ["IRPJ_ARBITRADO", "CSLL_ARBITRADO", "PIS_ARBITRADO", "COFINS_ARBITRADO", "COFINS_ENTIDADE"]) assert.ok(ORIGEM_POR_TRIBUTO[t], t);
  const contas = [{ codigo: "4.1", tipo: "analitica" }, { codigo: "2.1", tipo: "analitica" }];
  const maps = ["fiscal_irpj_arbitrado", "fiscal_cofins_entidade"].map((origem) => ({ origem, contaDebitoCodigo: "4.1", contaCreditoCodigo: "2.1" }));
  const r = gerarRascunhosApuracoes(cnpj, [ap("IRPJ_ARBITRADO", "2026-09", "ARB:irpj:2026-T3", 144_000), ap("COFINS_ENTIDADE", "2026-10", "ENT:cofins:2026-10", 3_000), ap("CSLL_ARBITRADO", "2026-09", "ARB:csll:2026-T3", 108_000)], contas, maps, agora);
  assert.equal(r.length, 2); // CSLL sem mapeamento: espera a contadora escolher as contas
  assert.equal(r[0].valor, 1440); assert.equal(r[0].data, "2026-09-30"); assert.match(r[0].historico, /Lucro Arbitrado/);
  assert.equal(r[1].data, "2026-10-31"); assert.match(r[1].historico, /COFINS da entidade/);
  assert.equal(origemDaReferencia(r[0].referenciaOrigem)?.id, "fiscal_irpj_arbitrado");
  const ws = { mapeamentosOrigem: maps, lancamentos: [], preLancamentos: [] };
  const m1 = mesclarRascunhosNoWorkspace(cnpj, ws, r); assert.equal(m1.criados, 2);
  const m2 = mesclarRascunhosNoWorkspace(cnpj, m1.workspace, r); assert.equal(m2.criados, 0); assert.equal(m2.atualizados, 0);
  // valor mudou no Fiscal (mais notas no trimestre): o mesmo pré-lançamento é atualizado, não duplica
  const r3 = gerarRascunhosApuracoes(cnpj, [ap("IRPJ_ARBITRADO", "2026-09", "ARB:irpj:2026-T3", 150_000)], contas, maps, agora);
  const m3 = mesclarRascunhosNoWorkspace(cnpj, m2.workspace, r3); assert.equal(m3.criados, 0); assert.equal(m3.atualizados, 1);
  assert.equal((m3.workspace.preLancamentos as any[]).length, 2);
});

test("DRE da entidade: título Demonstração do Superávit ou Déficit; demais empresas continuam com DRE gerencial", () => {
  assert.equal(rotulosDreDaEmpresa("Entidade imune").titulo, "Demonstração do Superávit ou Déficit");
  assert.equal(rotulosDreDaEmpresa("Entidade isenta").resultado, "Superávit ou déficit do período");
  assert.equal(rotulosDreDaEmpresa("Lucro Presumido").titulo, "DRE gerencial");
  assert.equal(rotulosDreDaEmpresa("Lucro Arbitrado").titulo, "DRE gerencial");
  // Relatório para o cliente: na entidade, superávit/déficit no lugar de lucro/prejuízo (ITG 2002 (R1), item 23).
  const dre: any = { receitaBruta: 100000, deducoes: 0, receitaLiquida: 100000, custos: 0, lucroBruto: 100000, despesas: 130000, depreciacao: 0, resultadoFinanceiro: 0, outrasReceitas: 0, resultadoAntesTributos: -30000, tributosLucro: 0, lucroLiquido: -30000 };
  const bal: any = { ativoCirculante: 0, disponivel: 0, estoques: 0, ativoNaoCirculante: 0, ativoTotal: 0, passivoCirculante: 0, passivoNaoCirculante: 0, patrimonioLiquido: 0, passivoMaisPl: 0 };
  const html = (regime: string) => htmlRelatorioCliente({ empresa: { razaoSocial: "X", cnpj, regime } as any, competencia: "2026-10", balanco: bal, dre, indices: [], serie: [] });
  assert.match(html("Entidade isenta"), /Demonstração do Superávit ou Déficit \(janeiro a 10\/2026\)/);
  assert.match(html("Entidade isenta"), /Déficit do período/);
  assert.doesNotMatch(html("Entidade isenta"), /Prejuízo|Lucro líquido|Lucro bruto|lucro ou prejuízo/);
  assert.match(html("Lucro Presumido"), /Resultado do ano/);
  assert.match(html("Lucro Presumido"), /Prejuízo/);
  assert.match(svgEvolucao([], 640, 240, true), /superávit ou déficit/);
});

test("decisão e marca local do Contábil", () => {
  assert.equal(marcaLocalDoContabil({ regime: "Lucro Arbitrado" }).outroRegime, "Lucro Arbitrado");
  assert.deepEqual(decidirSincronia({ tipo: null, outroRegime: null, certificada: false, certificacaoValidade: null }, [{ tipo: "isenta", certificada: false, certificacaoValidade: null, origem: "dp" }]).aplicar, { tipo: "isenta", origem: "dp" });
  assert.equal(decidirSincronia({ tipo: "imune", outroRegime: null, certificada: false, certificacaoValidade: null }, [{ tipo: "isenta", certificada: false, certificacaoValidade: null, origem: "fiscal" }]).divergencias.length, 1);
  assert.equal(marcaFeitaAqui({ regime: "Entidade imune", entidadeSincronizada: { tipo: "imune", certificada: false, certificacaoValidade: null } }), false);
});

const IGREJA = "11222333000181"; const CLUBE = "22333444000192"; const ASSOC = "55666777000125";
test("robô: preenche o que está em branco (versão como trava), guarda a divergência, não cria empresa e manda ao Fiscal a marca daqui", async () => {
  limparCacheSincroniaEntidadeContabilParaTeste();
  // Banco falso com só os comandos que o módulo usa (mesma semântica do PostgreSQL para eles).
  const ws = new Map<string, { payload: any; version: number }>(); const div = new Map<string, { cnpj: string; motivo: string; desde: Date }>();
  const c = (async (sql: string, p: any[] = []) => {
    if (sql.startsWith("CREATE TABLE")) return { rows: [] };
    if (sql.startsWith("SELECT cnpj, payload, version FROM contabil_company_workspaces")) return { rows: (p[0] as string[]).filter((x) => ws.has(x)).map((x) => ({ cnpj: x, ...structuredClone(ws.get(x)!) })) };
    if (sql.startsWith("UPDATE contabil_company_workspaces")) { const l = ws.get(p[0]); if (!l || l.version !== p[2]) return { rows: [], rowCount: 0 }; ws.set(p[0], { payload: JSON.parse(p[1]), version: l.version + 1 }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith("DELETE FROM contabil_entidade_divergencias")) { for (const [k, v] of div) if (v.cnpj === p[0] && !(p[1] as string[]).includes(v.motivo)) div.delete(k); return { rows: [] }; }
    if (sql.startsWith("INSERT INTO contabil_entidade_divergencias")) { const k = `${p[0]}|${p[1]}`; if (!div.has(k)) div.set(k, { cnpj: p[0], motivo: p[1], desde: new Date() }); return { rows: [] }; }
    if (sql.startsWith("SELECT cnpj, desde FROM contabil_entidade_divergencias")) return { rows: [...div.values()] };
    throw new Error(`SQL não previsto no teste: ${sql}`);
  }) as any;
  const empresaWs = (empresa: any, version: number) => ({ payload: { empresa, contas: [], lancamentos: [] }, version });
  ws.set(IGREJA, empresaWs({ razaoSocial: "Igreja", regime: "" }, 3));
  ws.set(CLUBE, empresaWs({ razaoSocial: "Clube", regime: "Lucro Presumido" }, 1));
  ws.set(ASSOC, empresaWs({ razaoSocial: "Associação", regime: "Entidade isenta", entidadeCertificada: true, entidadeCertificacaoValidade: "2027-06-30" }, 1));
  const enviados: any[] = [];
  const fiscal = [
    { cnpj: IGREJA, entidadeMarcas: [{ origem: "fiscal", tipo: "imune" }, { origem: "dp", tipo: "imune", certificada: true, certificacaoValidade: "2027-01-31" }] },
    { cnpj: CLUBE, entidadeMarcas: [{ origem: "dp", tipo: "isenta" }] },
    { cnpj: ASSOC, entidadeMarcas: [{ origem: "contabil", tipo: "isenta", certificada: true, certificacaoValidade: "2027-06-30" }] },
    { cnpj: "99888777000166", entidadeMarcas: [{ origem: "fiscal", tipo: "imune" }] },
  ];
  const o = { buscarFiscal: async () => ({ ok: true, empresas: fiscal }), enviarFiscal: async (b: any) => { enviados.push(b); return { ok: true }; } };
  const r = await sincronizarEntidadesContabil(c, o);
  assert.deepEqual(r.aplicadas, [IGREJA]); assert.equal(r.divergentes, 1); assert.equal(r.conferidas, 3);
  const linha = async (x: string) => ws.get(x)!;
  const ig = await linha(IGREJA);
  assert.equal(ig.payload.empresa.regime, "Entidade imune"); assert.equal(ig.payload.empresa.entidadeCertificada, true); assert.equal(ig.payload.empresa.entidadeCertificacaoValidade, "2027-01-31");
  assert.equal(ig.payload.empresa.razaoSocial, "Igreja"); assert.equal(ig.version, 4); assert.deepEqual(ig.payload.contas, []);
  assert.equal((await linha(CLUBE)).payload.empresa.regime, "Lucro Presumido");
  assert.equal(ws.size, 3); assert.equal(div.size, 1);
  assert.deepEqual(enviados[0].marcas, [{ cnpj: ASSOC, tipo: "isenta", certificada: true, certificacaoValidade: "2027-06-30" }]);
  assert.deepEqual(enviados[0].retirar, [CLUBE]);
  const r2 = await sincronizarEntidadesContabil(c, o); assert.deepEqual(r2.aplicadas, []); assert.equal((await linha(IGREJA)).version, 4);
  const cf = await conferirSincroniaEntidadesContabil(c, { em: new Date().toISOString(), ok: true });
  assert.equal(cf.divergentes, 1); assert.equal(cf.atencao, true);
});

test("Agente IA: sincronizar_entidades é ação com cartão de confirmação", () => {
  const f = kitContabil.ferramentas.find((x: any) => x.declaracao.name === "sincronizar_entidades");
  assert.ok(f); assert.equal(f!.tipo, "acao");
});
