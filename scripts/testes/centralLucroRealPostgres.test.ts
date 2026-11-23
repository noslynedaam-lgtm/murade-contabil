// Central do Lucro Real com o Postgres de verdade (DISTINCT ON, to_regclass, jsonb): divergência aberta bloqueia a guia, a decisão
// do contador libera, valor novo reabre, baixa de declaração para o aviso; sem Postgres local o teste é pulado.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { darBaixa, decidirDivergencia, gravarDivergencias, limparCacheCentralParaTeste, painelCentral, periodoBloqueado } from "../../src/server/centralLucroReal";
import { limparCacheLucroRealParaTeste, prepararLucroReal } from "../../src/server/lucroRealApuracao";

const BIN = "/usr/lib/postgresql/16/bin";
const temPg = existsSync(`${BIN}/initdb`) && spawnSync("id", ["postgres"]).status === 0;
const C = "11222333000181";

test("divergência bloqueia a guia até a decisão; baixa para o aviso", { skip: !temPg && "sem Postgres local" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pglr-")); chmodSync(dir, 0o777);
  const porta = String(58000 + Math.floor(Math.random() * 1000));
  const comoPg = (cmd: string) => execFileSync("su", ["postgres", "-s", "/bin/sh", "-c", cmd], { stdio: "pipe" });
  comoPg(`${BIN}/initdb -D ${dir}/data -A trust -U postgres >/dev/null && ${BIN}/pg_ctl -D ${dir}/data -o '-p ${porta} -k ${dir}' -l ${dir}/log -w start >/dev/null`);
  const pool = new Pool({ host: dir, port: Number(porta), user: "postgres", database: "postgres" });
  try {
    limparCacheCentralParaTeste(); limparCacheLucroRealParaTeste();
    const q = (sql: string, p: unknown[] = []) => pool.query(sql, p as any[]) as any;
    await prepararLucroReal(q);
    await q(`INSERT INTO contabil_lucro_real_config (cnpj, dados, atualizado_por) VALUES ($1, $2::jsonb, 'x')`, [C, JSON.stringify({ forma: "estimativa", obrigada: true, indAliquotaCsll: "1", atividadeEstimativa: "comercio", anoInicial: null, saldoPrejuizoInicialCentavos: 0, saldoBaseNegativaInicialCentavos: 0, modoForcado: {} })]).catch(async () => {
      const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='contabil_lucro_real_config'`)).rows.map((x: any) => x.column_name); throw new Error(`colunas: ${cols}`);
    });
    await q(`INSERT INTO contabil_lucro_real_apuracoes (id, cnpj, ano, periodo, status, irpj_centavos, csll_centavos, resultado, revisar) VALUES ($1,$2,2026,'A02','calculado',1000,500,$3::jsonb,'[]'::jsonb)`, [`${C}:2026:A02`, C, JSON.stringify({ forma: "estimativa", meses: [2], darfs: [] })]);
    await gravarDivergencias(q, C, 2026, [{ id: "2026-02:notas_x_receita", competencia: "2026-02", tipo: "notas_x_receita", contabilCentavos: 100, outroCentavos: 90, explicacao: "x" }]);
    assert.match(String(await periodoBloqueado(q, C, 2026, "A02")), /diferença/);
    assert.equal(await periodoBloqueado(q, C, 2026, "A01"), null);
    assert.deepEqual(await decidirDivergencia(q, C, "2026-02:notas_x_receita", "curto", "ana"), { erro: "Explique por que a diferença está certa (pelo menos 10 letras): isso fica registrado com o seu nome." });
    assert.deepEqual(await decidirDivergencia(q, C, "2026-02:notas_x_receita", "nota de serviço lançada em março", "ana"), { ok: true });
    assert.equal(await periodoBloqueado(q, C, 2026, "A02"), null, "decidida: libera");
    await gravarDivergencias(q, C, 2026, [{ id: "2026-02:notas_x_receita", competencia: "2026-02", tipo: "notas_x_receita", contabilCentavos: 100, outroCentavos: 90, explicacao: "x" }]);
    assert.equal(await periodoBloqueado(q, C, 2026, "A02"), null, "mesmo valor: continua aceita");
    await gravarDivergencias(q, C, 2026, [{ id: "2026-02:notas_x_receita", competencia: "2026-02", tipo: "notas_x_receita", contabilCentavos: 100, outroCentavos: 80, explicacao: "x" }]);
    assert.match(String(await periodoBloqueado(q, C, 2026, "A02")), /diferença/, "valor mudou: reabre");
    await gravarDivergencias(q, C, 2026, []);
    assert.equal(await periodoBloqueado(q, C, 2026, "A02"), null, "sumiu: sai");
    // Painel: DCTFWeb de jan avisa no dia; com a baixa, para de avisar
    const deps = { consultar: q, hoje: () => "2026-02-27", lerWorkspace: async () => ({ empresa: {}, contas: [], lancamentos: [] }) };
    const antes = await painelCentral(deps, C, 2026);
    assert.ok(antes.alertas.some((a) => a.obrigacaoId === "dctfweb:2026-01"), "vence hoje");
    assert.ok(antes.alertas.some((a) => a.obrigacaoId === "irpj:2026:A01"), "A01 sem apuração: avisa todo dia");
    assert.deepEqual(await darBaixa(q, C, "dctfweb:2026-01", "REC123", "ana", false), { ok: true });
    assert.deepEqual(await darBaixa(q, C, "irpj:2026:A01", "", "ana", false), { erro: "Baixa aqui só para DCTFWeb e EFD-Contribuições. Guia: registre o pagamento; ECD/ECF: marque entregue em Demonstrações." });
    const depois = await painelCentral(deps, C, 2026);
    assert.equal(depois.alertas.some((a) => a.obrigacaoId === "dctfweb:2026-01"), false);
  } finally {
    await pool.end().catch(() => undefined);
    try { comoPg(`${BIN}/pg_ctl -D ${dir}/data -m immediate stop >/dev/null`); } catch { /* */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
