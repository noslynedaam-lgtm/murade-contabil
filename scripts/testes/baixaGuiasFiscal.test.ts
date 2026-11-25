// Contábil → Fiscal: o extrato importado vai ao Fiscal para a baixa das guias do aplicativo do cliente. Banco simulado (o Contábil não usa
// pg-mem; a conferência das guias, que é do Fiscal, é testada lá com pg-mem em scripts/testes/pagamentosInformados.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { destinoFiscal, enviarExtratoParaBaixa, idMovimento, reiniciarPreparoBaixaGuiasParaTeste, situacaoBaixaGuias } from "../../src/server/baixaGuiasFiscal";

function banco(movs: Array<{ cnpj: string; conta_banco: string; fitid: string; data_iso: string; valor_centavos: number; memo: string }>) {
  const envios = new Map<string, { casou: boolean; guia_tipo: string }>(); const sqls: Array<{ sql: string; p: unknown[] }> = [];
  const consultar = async (sql: string, p: unknown[] = []) => {
    sqls.push({ sql, p });
    if (/^CREATE TABLE/.test(sql)) return { rows: [] };
    if (/FROM contabil_extrato_movimentos m/.test(sql)) {
      const so = (p[1] as string[] | undefined);
      return { rows: movs.filter((m) => m.data_iso >= String(p[0]) && (!so || so.includes(m.cnpj)) && !(envios.get(`${m.cnpj}|${m.conta_banco}|${m.fitid}`)?.casou || envios.has(`${m.cnpj}|${m.conta_banco}|${m.fitid}`))) };
    }
    if (/^INSERT INTO contabil_extrato_baixa_envios/.test(sql)) { const k = `${p[0]}|${p[1]}|${p[2]}`; const ant = envios.get(k); envios.set(k, { casou: Boolean(p[3]) || Boolean(ant?.casou), guia_tipo: p[3] ? String(p[4]) : ant?.guia_tipo || "" }); return { rows: [] }; }
    if (/count\(\*\)::int AS n, count\(\*\) FILTER/.test(sql)) { const l = [...envios].filter(([k]) => k.startsWith(`${p[0]}|`)); return { rows: [{ n: l.length, c: l.filter(([, v]) => v.casou).length, u: new Date() }] }; }
    if (/GROUP BY guia_tipo/.test(sql)) { const m = new Map<string, number>(); for (const [k, v] of envios) if (k.startsWith(`${p[0]}|`) && v.casou) m.set(v.guia_tipo, (m.get(v.guia_tipo) || 0) + 1); return { rows: [...m].map(([guia_tipo, n]) => ({ guia_tipo, n })) }; }
    return { rows: [] };
  };
  return { consultar, envios, sqls };
}
const env = { MURADE_INTEGRATION_TOKEN: "tok", MURADE_FISCAL_URL: "https://murade-fiscal-1.onrender.com" } as any;
const CNPJ = "11222333000181";

test("manda ao Fiscal os movimentos dos últimos 60 dias, com credencial, e guarda quais baixaram guia", async () => {
  reiniciarPreparoBaixaGuiasParaTeste();
  const b = banco([
    { cnpj: CNPJ, conta_banco: "1.1.1.02", fitid: "a", data_iso: "2026-11-20", valor_centavos: -35000, memo: "DAS" },
    { cnpj: CNPJ, conta_banco: "1.1.1.02", fitid: "b", data_iso: "2026-11-21", valor_centavos: -1000, memo: "TARIFA" },
    { cnpj: CNPJ, conta_banco: "1.1.1.02", fitid: "velho", data_iso: "2026-08-01", valor_centavos: -1000, memo: "" },
  ]);
  const pedidos: any[] = [];
  const buscar = async (url: string, init: any) => { pedidos.push({ url, init, corpo: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ sucesso: true, baixadas: [{ fitid: idMovimento("1.1.1.02", "a"), guiaId: "g1", tipo: "DAS" }], ambiguos: 0 }) }; };
  const r = await enviarExtratoParaBaixa(b.consultar, { env, buscar, hoje: "2026-11-25" });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "https://murade-fiscal-1.onrender.com/api/integracao/fiscal/guias/baixa-extrato");
  assert.equal(pedidos[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(pedidos[0].corpo.movimentos.map((m: any) => m.fitid), ["1.1.1.02:a", "1.1.1.02:b"], "só os últimos 60 dias");
  assert.equal(pedidos[0].corpo.cnpj, CNPJ);
  assert.deepEqual([r.enviados, r.guiasBaixadas, r.falhas.length], [2, 1, 0]);
  assert.match(r.resumo, /1 guia\(s\) baixada\(s\)/);
  const s = await situacaoBaixaGuias(b.consultar, CNPJ);
  assert.deepEqual([s.enviados, s.guiasBaixadas, s.porTipo.DAS], [2, 1, 1]);
  // Segunda rodada logo depois: nada é reenviado.
  pedidos.length = 0; await enviarExtratoParaBaixa(b.consultar, { env, buscar, hoje: "2026-11-25" });
  assert.equal(pedidos.length, 0);
});

test("sem credencial ou com endereço inseguro não manda nada; Fiscal fora do ar não grava e repete depois", async () => {
  reiniciarPreparoBaixaGuiasParaTeste();
  const b = banco([{ cnpj: CNPJ, conta_banco: "x", fitid: "a", data_iso: "2026-11-20", valor_centavos: -100, memo: "" }]);
  let chamou = false; const buscar = async () => { chamou = true; return { ok: true, status: 200, json: async () => ({ sucesso: true }) }; };
  assert.equal((await enviarExtratoParaBaixa(b.consultar, { env: {} as any, buscar })).configurado, false);
  assert.equal(destinoFiscal({ MURADE_FISCAL_URL: "http://murade-fiscal-1.onrender.com" } as any), null);
  assert.equal(chamou, false);
  const fora = async () => ({ ok: false, status: 503, json: async () => ({ sucesso: false, motivo: "fora do ar" }) });
  const r = await enviarExtratoParaBaixa(b.consultar, { env, buscar: fora, hoje: "2026-11-25" });
  assert.equal(r.falhas.length, 1); assert.equal(r.atencao, true); assert.equal(b.envios.size, 0, "nada marcado como enviado");
});

test("só a empresa pedida (importação de um extrato) e fitid longo vira identificador curto", async () => {
  reiniciarPreparoBaixaGuiasParaTeste();
  const b = banco([{ cnpj: CNPJ, conta_banco: "c", fitid: "a", data_iso: "2026-11-20", valor_centavos: -100, memo: "" }, { cnpj: "22333444000172", conta_banco: "c", fitid: "a", data_iso: "2026-11-20", valor_centavos: -100, memo: "" }]);
  const pedidos: any[] = []; const buscar = async (_u: string, i: any) => { pedidos.push(JSON.parse(i.body)); return { ok: true, status: 200, json: async () => ({ sucesso: true, baixadas: [] }) }; };
  await enviarExtratoParaBaixa(b.consultar, { env, buscar, hoje: "2026-11-25", cnpjs: [CNPJ] });
  assert.deepEqual(pedidos.map((p) => p.cnpj), [CNPJ]);
  assert.ok(idMovimento("1.1", "x".repeat(200)).length <= 160);
});

test("robô registrado com Rodar agora, apresentação, Agente e gatilho na importação do extrato", async () => {
  const srv = readFileSync("server.ts", "utf8");
  assert.match(srv, /registrarRobo\(\{ id: "baixa_guias_extrato"/);
  assert.match(srv, /registrarRotinaManual\("baixa_guias_extrato", rodarBaixaGuiasExtrato\)/);
  assert.match(srv, /aoImportarExtrato: \(cnpj\) =>/);
  assert.doesNotMatch(readFileSync("src/server/baixaGuiasFiscal.ts", "utf8"), /chamarSerpro|Integra Contador|apiserpro/i, "nada de consulta paga");
  const rotas = readFileSync("src/server/escrituracaoRotas.ts", "utf8");
  assert.equal((rotas.match(/deps\.aoImportarExtrato\(a\.cnpj\)/g) || []).length, 2, "OFX/CSV e PDF disparam a conferência");
  const { ROBOS_APRESENTACAO } = await import("../../src/data/apresentacaoSistema");
  assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === "baixa_guias_extrato" && r.intervaloMs === 60 * 60_000));
  const { kitContabil } = await import("../../src/server/agenteContabil");
  assert.equal(kitContabil.ferramentas.find((f) => f.declaracao.name === "baixa_das_guias_pelo_extrato")?.tipo, "leitura");
});
