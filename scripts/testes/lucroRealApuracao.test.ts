// Lucro Real no Contábil — IRPJ/CSLL pela contabilidade + e-Lalur/e-Lacs. Contas feitas à mão, com a fonte de cada regra.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  mesesDaContabilidade, calcularTrimestres, calcularEstimativas, calcularJcp, darfsDoPeriodo, CONFIG_LR_PADRAO, apurarAnoLucroReal, salvarConfigLucroReal,
  adicionarLancamentoLalur, excluirLancamentoLalur, confirmarApuracaoReal, reabrirApuracaoReal, itensProvisaoReal, listarApuracoesReal, parteBDoAno, type LancamentoParteA,
} from "../../src/server/lucroRealApuracao";

const CNPJ = "33444555000166";
const contas: any[] = [
  { codigo: "1", descricao: "Ativo", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1", descricao: "Bancos conta movimento", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "1.2", descricao: "Clientes", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "1.3", descricao: "Estoques de mercadorias", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "2", descricao: "Passivo", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1", descricao: "Impostos a recolher", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "3.1", descricao: "Receita bruta de vendas", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "4", descricao: "Despesas e custos", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "4.1", descricao: "Custo das mercadorias vendidas", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.2", descricao: "Despesas administrativas", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.5", descricao: "Provisão para IRPJ", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.6", descricao: "Provisão para CSLL", nivel: 2, tipo: "analitica", natureza: "D" },
];
let n = 0;
const L = (data: string, d: string, c: string, valor: number) => ({ id: `l${++n}`, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico: "h", origem: "Manual" });
// Janeiro/2026: venda 300.000, CMV 100.000, despesas 50.000, IRPJ contabilizado 10.000, CSLL 5.000 → resultado 135.000
const lucro = { contas, lancamentos: [L("2026-01-10", "1.2", "3.1", 300000), L("2026-01-10", "4.1", "1.3", 100000), L("2026-01-20", "4.2", "1.1", 50000), L("2026-01-31", "4.5", "2.1", 10000), L("2026-01-31", "4.6", "2.1", 5000)] };
// Janeiro/2026 com prejuízo: venda 300.000 e despesas 400.000
const prejuizo = { contas, lancamentos: [L("2026-01-10", "1.2", "3.1", 300000), L("2026-01-20", "4.2", "1.1", 400000)] };
/** Banco em memória só com as consultas do módulo (o Contábil não usa pg-mem). */
function bancoFalso() {
  const config = new Map<string, any>(); const lanc = new Map<string, any>(); const ap = new Map<string, any>();
  const consultar = async (sql: string, p: any[] = []): Promise<{ rows: any[]; rowCount: number }> => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (/^CREATE/.test(q)) return { rows: [], rowCount: 0 };
    if (q.startsWith("SELECT dados FROM contabil_lucro_real_config")) { const c = config.get(p[0]); return { rows: c ? [{ dados: c }] : [], rowCount: c ? 1 : 0 }; }
    if (q.startsWith("INSERT INTO contabil_lucro_real_config")) { config.set(p[0], JSON.parse(p[1])); return { rows: [], rowCount: 1 }; }
    if (q.startsWith("SELECT * FROM contabil_lucro_real_pagamentos")) return { rows: [], rowCount: 0 };
    if (q.startsWith("SELECT * FROM contabil_lalur_lancamentos WHERE cnpj=$1 AND ano=$2")) { const rows = [...lanc.values()].filter((l) => l.cnpj === p[0] && l.ano === p[1]); return { rows, rowCount: rows.length }; }
    if (q.startsWith("SELECT * FROM contabil_lalur_lancamentos WHERE id=$1")) { const l = lanc.get(p[0]); return { rows: l && l.cnpj === p[1] ? [l] : [], rowCount: l ? 1 : 0 }; }
    if (q.startsWith("INSERT INTO contabil_lalur_lancamentos")) { const [id, cnpj, ano, mes, tributo, tipo, codigo, descricao, valor_centavos, justificativa, criado_por] = p; lanc.set(id, { id, cnpj, ano, mes, tributo, tipo, codigo, descricao, valor_centavos, justificativa, criado_por }); return { rows: [], rowCount: 1 }; }
    if (q.startsWith("DELETE FROM contabil_lalur_lancamentos")) { lanc.delete(p[0]); return { rows: [], rowCount: 1 }; }
    if (q.startsWith("SELECT periodo FROM contabil_lucro_real_apuracoes WHERE status='confirmado'")) { const rows = p.map((id) => ap.get(id)).filter((a) => a && a.status === "confirmado"); return { rows, rowCount: rows.length }; }
    if (q.startsWith("SELECT * FROM contabil_lucro_real_apuracoes WHERE cnpj=$1 AND ano=$2")) { const rows = [...ap.values()].filter((a) => a.cnpj === p[0] && a.ano === p[1]).sort((a, b) => a.periodo.localeCompare(b.periodo)); return { rows, rowCount: rows.length }; }
    if (q.startsWith("INSERT INTO contabil_lucro_real_apuracoes")) {
      const [id, cnpj, ano, periodo, status, irpj, csll, resultado, revisar] = p; const atual = ap.get(id);
      if (atual?.status === "confirmado") return { rows: [], rowCount: 0 };
      ap.set(id, { id, cnpj, ano, periodo, status, irpj_centavos: irpj, csll_centavos: csll, resultado: JSON.parse(resultado), revisar: JSON.parse(revisar), calculado_em: "agora", confirmado_por: null, confirmado_em: null }); return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("UPDATE contabil_lucro_real_apuracoes SET status='confirmado'")) { const a = ap.get(p[0]); if (a && a.status === "calculado") { a.status = "confirmado"; a.confirmado_por = p[1]; a.confirmado_em = "2026-07-15T10:00:00Z"; return { rows: [a], rowCount: 1 }; } return { rows: [], rowCount: 0 }; }
    if (q.startsWith("UPDATE contabil_lucro_real_apuracoes SET status='calculado'")) { const a = ap.get(p[0]); if (a && a.status === "confirmado") { a.status = "calculado"; a.confirmado_por = null; a.confirmado_em = null; return { rows: [], rowCount: 1 }; } return { rows: [], rowCount: 0 }; }
    throw new Error(`consulta não prevista no teste: ${q.slice(0, 80)}`);
  };
  return { consultar, tabelas: { config, lanc, ap } };
}
const R = (reais: number) => Math.round(reais * 100);
const multa: LancamentoParteA = { id: "x", ano: 2026, mes: 1, tributo: "ambos", tipo: "adicao", codigo: "8.60", descricao: "Multas por infrações fiscais", valorCentavos: R(2000), justificativa: "auto de infração pago" };
const irrf: LancamentoParteA = { id: "y", ano: 2026, mes: 2, tributo: "irpj", tipo: "irrf_retido", codigo: "", descricao: "IRRF aplicação", valorCentavos: R(1000), justificativa: "informe do banco" };

test("contabilidade → mês: resultado, receita bruta e IRPJ/CSLL contabilizados separados", () => {
  const m = mesesDaContabilidade(lucro, 2026)[0];
  assert.deepEqual([m.resultadoCentavos, m.receitaBrutaCentavos, m.irpjCentavos, m.csllCentavos, m.naoClassificadoCentavos], [R(135000), R(300000), R(10000), R(5000), 0]);
});

test("trimestral: adições, compensação de prejuízo limitada a 30% (Lei 9.065/95, arts. 15 e 16), IRRF e saldo para o trimestre seguinte", () => {
  // IRPJ: 135.000 + IRPJ contab. 10.000 + CSLL contab. 5.000 (adição) + multa 2.000 = 152.000; compensa 30% = 45.600 (saldo 100.000)
  // base 106.400 → 15% = 15.960 + adicional 10% de 46.400 = 4.640 → 20.600 − IRRF 1.000 = 19.600
  // CSLL: 135.000 + 5.000 + multa 2.000 = 142.000 → 9% = 12.780 (sem base negativa)
  const ms = mesesDaContabilidade(lucro, 2026);
  const [t1, t2] = calcularTrimestres(2026, ms, [multa, irrf], { ...CONFIG_LR_PADRAO, obrigada: true }, { prejuizo: R(100000), baseNegativa: 0 }, 6);
  assert.deepEqual([t1.irpjCentavos, t1.csllCentavos, t1.saldoPrejuizoFinalCentavos, t1.retencaoIrpjCentavos], [R(19600), R(12780), R(54400), R(1000)]);
  assert.equal((t1.detalhe as any).compensacaoPrejuizo, 45600);
  assert.equal(t2.saldoPrejuizoInicialCentavos, R(54400)); assert.equal(t2.irpjCentavos, 0);
  // DARF: obrigada ao Lucro Real → 0220 / 6012, vence no último dia útil do mês seguinte ao trimestre (30/04/2026)
  const d = darfsDoPeriodo(2026, t1, true);
  assert.deepEqual(d.map((x) => [x.codigo, x.vencimento, x.valorCentavos]), [["0220", "2026-04-30", R(19600)], ["6012", "2026-04-30", R(12780)]]);
  assert.equal(darfsDoPeriodo(2026, t1, false)[0].codigo, "3373"); // optante
  assert.equal(darfsDoPeriodo(2026, t1, null)[0].codigo, null); // sem saber: não chuta
  // Ajuste anual (saldo de 31/12): 2430 obrigada / 2456 optante; CSLL 6773; vence no último dia útil de março (31/03/2027, quarta-feira)
  const anual = { ...t1, periodo: "ANUAL", forma: "anual" as const, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  assert.deepEqual(darfsDoPeriodo(2026, anual, true).map((x) => [x.codigo, x.periodoApuracao, x.vencimento, x.valorCentavos]), [["2430", "2026-12-31", "2027-03-31", R(19600)], ["6773", "2026-12-31", "2027-03-31", R(12780)]]);
  assert.equal(darfsDoPeriodo(2026, anual, false)[0].codigo, "2456");
  assert.equal(darfsDoPeriodo(2026, anual, null)[0].codigo, null);
  assert.deepEqual(darfsDoPeriodo(2026, { ...anual, irpjCentavos: -5, csllCentavos: 0 }, true), []); // saldo negativo: sem DARF (vai para PER/DCOMP)
});

test("estimativa mensal: calcula pela receita bruta e pelo balancete e fica com o menor (Lei 8.981/95, art. 35)", () => {
  // Receita bruta: comércio 8% de 300.000 = 24.000 → 3.600 + adicional 10% de 4.000 = 400 → 4.000; CSLL 12% = 36.000 → 3.240
  // Balancete: lucro real 106.400 (com a compensação) → 15.960 + 8.640 = 24.600; CSLL 12.780 → maior: fica a receita bruta
  const [jan] = calcularEstimativas(2026, mesesDaContabilidade(lucro, 2026), [multa], { ...CONFIG_LR_PADRAO, forma: "estimativa" }, { prejuizo: R(100000), baseNegativa: 0 }, 1);
  assert.deepEqual([jan.modo, jan.irpjCentavos, jan.csllCentavos, jan.alternativaCentavos], ["E", R(4000), R(3240), R(37380)]);
  const d = darfsDoPeriodo(2026, jan, true);
  assert.deepEqual(d.map((x) => [x.codigo, x.vencimento]), [["2362", "2026-02-27"], ["2484", "2026-02-27"]]); // 28/02/2026 é sábado
  // com prejuízo no balancete: suspensão (nada a pagar) em vez de 7.240 pela receita
  const [jp] = calcularEstimativas(2026, mesesDaContabilidade(prejuizo, 2026), [], { ...CONFIG_LR_PADRAO, forma: "estimativa" }, { prejuizo: 0, baseNegativa: 0 }, 1);
  assert.deepEqual([jp.modo, jp.irpjCentavos, jp.csllCentavos, jp.alternativaCentavos], ["B", 0, 0, R(7240)]);
  // a contadora pode forçar a receita bruta
  const [jf] = calcularEstimativas(2026, mesesDaContabilidade(prejuizo, 2026), [], { ...CONFIG_LR_PADRAO, forma: "estimativa", modoForcado: { "1": "E" } }, { prejuizo: 0, baseNegativa: 0 }, 1);
  assert.deepEqual([jf.modo, jf.irpjCentavos], ["E", R(4000)]);
});

test("JCP (Lei 9.249/95, art. 9º): TJLP × PL, limite de metade do lucro, IRRF 15% até 2025 e 17,5% desde 2026 (LC 224/25), DARF 5706", () => {
  // PL 1.000.000 × TJLP 1,8% = 18.000; lucro do período 30.000 → limite 15.000 → JCP 15.000
  const a = calcularJcp({ ano: 2025, dataPagamento: "2025-11-15", dias: 30, taxaTjlpPeriodoPercentual: 1.8, fonteTjlp: "BNDES", basePlCentavos: R(1_000_000), lucroPeriodoAntesJcpCentavos: R(30000), lucrosAcumuladosReservasCentavos: R(10000) });
  assert.deepEqual([a.maximoTjlpCentavos, a.limiteLucrosCentavos, a.jcpDedutivelCentavos, a.aliquotaIrrfPercentual, a.irrfCentavos, a.codigoDarf], [R(18000), R(15000), R(15000), 15, R(2250), "5706"]);
  assert.equal(a.vencimentoIrrf, "2025-11-25"); // exemplo da Agenda Tributária: 2º decêndio de nov/2025 → 25/11/2025
  const b = calcularJcp({ ano: 2026, dataPagamento: "2026-11-15", dias: 30, taxaTjlpPeriodoPercentual: 1.8, fonteTjlp: "BNDES", basePlCentavos: R(1_000_000), lucroPeriodoAntesJcpCentavos: R(30000), lucrosAcumuladosReservasCentavos: R(10000) });
  assert.deepEqual([b.aliquotaIrrfPercentual, b.irrfCentavos, b.vencimentoIrrf], [17.5, R(2625), "2026-11-25"]); // 20/11 é feriado: 23, 24, 25
  assert.throws(() => calcularJcp({ ano: 2026, dataPagamento: "2026-11-15", dias: 30, taxaTjlpPeriodoPercentual: 1.8, fonteTjlp: "", basePlCentavos: 1, lucroPeriodoAntesJcpCentavos: 1, lucrosAcumuladosReservasCentavos: 1 }), /TJLP/);
});

test("banco: configura, lança na Parte A, apura sozinho, prévia até fechar o mês, confirma, provisão e Parte B entre anos", async () => {
  const { consultar, tabelas } = bancoFalso(); const pool = { query: consultar };
  let fechadas = new Set<string>();
  const deps = { consultar, lerWorkspace: async () => lucro as any, competenciasFechadas: async () => fechadas, hoje: () => "2026-07-15" };
  assert.match((await apurarAnoLucroReal(deps, CNPJ, 2026)).avisos.join(), /Configure/);
  await salvarConfigLucroReal(consultar, CNPJ, { forma: "trimestral", obrigada: true, anoInicial: 2026, saldoPrejuizoInicialCentavos: R(100000) }, "maria");
  await adicionarLancamentoLalur(consultar, CNPJ, { ...multa }, "maria");
  await assert.rejects(adicionarLancamentoLalur(consultar, CNPJ, { ...multa, codigo: "" }, "maria"), /código/);
  await assert.rejects(adicionarLancamentoLalur(consultar, CNPJ, { ...multa, justificativa: "" }, "maria"), /de onde vem/);
  let r = await apurarAnoLucroReal(deps, CNPJ, 2026);
  let t1 = r.periodos.find((p) => p.periodo === "T01")!;
  assert.equal(t1.status, "previa"); assert.match(t1.revisar.join(), /não fechada/);
  assert.equal(await confirmarApuracaoReal(consultar, CNPJ, 2026, "T01", "maria"), null, "prévia não confirma");
  fechadas = new Set(["2026-01", "2026-02", "2026-03"]);
  r = await apurarAnoLucroReal(deps, CNPJ, 2026);
  t1 = r.periodos.find((p) => p.periodo === "T01")!;
  assert.deepEqual([t1.status, t1.irpjCentavos, t1.csllCentavos], ["calculado", R(20600), R(12780)]);
  const c = (await confirmarApuracaoReal(consultar, CNPJ, 2026, "T01", "maria"))!;
  assert.deepEqual(itensProvisaoReal(c).map((x) => [x.tributo, x.competencia, x.valorCentavos]), [["IRPJ_REAL", "2026-03", R(20600)], ["CSLL_REAL", "2026-03", R(12780)]]);
  await assert.rejects(adicionarLancamentoLalur(consultar, CNPJ, { ...multa, mes: 2 }, "maria"), /confirmado/);
  assert.equal(parteBDoAno(await listarApuracoesReal(consultar, CNPJ, 2026))[0].prejuizoFiscal.final, R(54400));
  // ano seguinte: sem o 4º trimestre de 2026 confirmado, não sabe o saldo — avisa em vez de chutar
  const deps27 = { ...deps, hoje: () => "2027-05-10" };
  assert.match((await apurarAnoLucroReal(deps27, CNPJ, 2027)).avisos.join(), /confirme antes o fechamento de 2026/);
  // reabrir: só sem período seguinte confirmado
  assert.equal((await reabrirApuracaoReal(consultar, CNPJ, 2026, "T01")).ok, true);
  const lanc = [...tabelas.lanc.values()][0].id;
  await excluirLancamentoLalur(consultar, CNPJ, lanc);
  assert.equal(tabelas.lanc.size, 0);
});

test("rotas: todas passam pelo controle de acesso por escritório; reabrir é do administrador; robô registrado com 'Rodar agora'", () => {
  const rotas = fs.readFileSync("src/server/lucroRealRotas.ts", "utf8");
  const blocos = rotas.split("app.").slice(1);
  assert.ok(blocos.length >= 9);
  for (const b of blocos) assert.match(b, /acessoEmpresa\(req, res, (true|false)\)/, b.slice(0, 60));
  assert.match(rotas, /reabrir[\s\S]*?administrador/);
  const servidor = fs.readFileSync("server.ts", "utf8");
  assert.match(servidor, /registrarRotasLucroReal\(app/); assert.match(servidor, /registrarRotinaManual\("lucro_real"/);
  const store = fs.readFileSync("src/server/apuracoesFiscaisStore.ts", "utf8");
  assert.match(store, /"IRPJ_REAL", "CSLL_REAL"/);
  const ag = fs.readFileSync("src/server/agenteLucroReal.ts", "utf8");
  for (const n of ["consultar_lucro_real", "apurar_lucro_real", "lancar_lalur", "confirmar_lucro_real"]) assert.equal(ag.split(`name: '${n}'`).length, 2, n);
  assert.match(fs.readFileSync("src/server/agenteContabil.ts", "utf8"), /\.\.\.FERRAMENTAS_LUCRO_REAL/);
  assert.ok(!/serpro/i.test(ag));
});

test("pagamento do DARF do Lucro Real: só período confirmado, data não futura, valor ≥ DARF; vai para a contabilidade e não repete", async () => {
  const { montarPagamentoReal, registrarPagamentoReal } = await import("../../src/server/lucroRealApuracao");
  const linha: any = { id: "x", cnpj: "C", ano: 2026, periodo: "T04", status: "confirmado", irpjCentavos: 19600_00, csllCentavos: 12780_00, resultado: { meses: [10, 11, 12], darfs: [{ tributo: "irpj", valorCentavos: 19600_00 }, { tributo: "csll", valorCentavos: 12780_00 }] }, revisar: [], calculadoEm: "", confirmadoPor: "a", confirmadoEm: "" };
  assert.match((montarPagamentoReal({ ...linha, status: "calculado" }, "irpj", "2027-01-29", 19600_00, "2027-02-01") as any).erro, /Confirme/);
  assert.match((montarPagamentoReal(linha, "irpj", "2027-03-01", 19600_00, "2027-02-01") as any).erro, /futuro/);
  assert.match((montarPagamentoReal(linha, "irpj", "2027-01-29", 19000_00, "2027-02-01") as any).erro, /menor que o valor do DARF/);
  const ok = montarPagamentoReal(linha, "irpj", "2027-01-29", 19796_00, "2027-02-01") as any;
  assert.deepEqual(ok.item, { referencia: "LR:IRPJ_REAL_PAGO:2026-T04", tributo: "IRPJ_REAL_PAGO", competencia: "2027-01", valorCentavos: 19796_00, baseCentavos: 19600_00, situacao: "confirmado", versaoOrigem: "pago:2027-01-29:1979600" });
  // banco falso: a apuração confirmada e a tabela de pagamentos
  const pagos: any[] = []; const enviados: any[] = [];
  const consultar = async (sql: string, p: any[] = []) => {
    if (sql.startsWith("CREATE")) return { rows: [] };
    if (sql.startsWith("SELECT * FROM contabil_lucro_real_apuracoes")) return { rows: [{ id: "C:2026:T04", cnpj: "C", ano: 2026, periodo: "T04", status: "confirmado", irpj_centavos: linha.irpjCentavos, csll_centavos: linha.csllCentavos, resultado: linha.resultado, revisar: [], calculado_em: "", confirmado_por: "a", confirmado_em: "" }] };
    if (sql.startsWith("SELECT id FROM contabil_lucro_real_pagamentos")) return { rows: pagos.filter((x) => x[0] === p[0]) };
    if (sql.startsWith("SELECT * FROM contabil_lucro_real_pagamentos")) return { rows: [] };
    if (sql.startsWith("INSERT INTO contabil_lucro_real_pagamentos")) { pagos.push(p); return { rows: [] }; }
    throw new Error(sql);
  };
  const r1 = await registrarPagamentoReal(consultar as any, "C", 2026, "T04", "csll", "2027-01-29", 12780_00, "ana", "2027-02-01", async (_c, itens) => { enviados.push(...itens); });
  assert.ok("pagamento" in r1); assert.equal(enviados[0].tributo, "CSLL_REAL_PAGO"); assert.equal(pagos.length, 1);
  const r2 = await registrarPagamentoReal(consultar as any, "C", 2026, "T04", "csll", "2027-01-29", 12780_00, "ana", "2027-02-01", async () => undefined);
  assert.match((r2 as any).erro, /já foi registrado/);
  // se a contabilidade falhar, nada fica registrado
  await assert.rejects(registrarPagamentoReal(consultar as any, "C", 2026, "T04", "irpj", "2027-01-29", 19600_00, "ana", "2027-02-01", async () => { throw new Error("fora"); }));
  assert.equal(pagos.length, 1);
});
