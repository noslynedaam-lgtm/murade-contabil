// Central do Lucro Real com o Postgres de verdade (DISTINCT ON, to_regclass, jsonb): divergência aberta bloqueia a guia, a decisão
// do contador libera, valor novo reabre, baixa de declaração para o aviso; sem Postgres local o teste é pulado.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { bloqueioPisCofinsLR, darBaixa, decidirDivergencia, gravarDivergencias, limparCacheCentralParaTeste, painelCentral, periodoBloqueado } from "../../src/server/centralLucroReal";
import { excluirJcp, gravarRetencoes, limparCacheExtrasParaTeste, registrarJcp } from "../../src/server/lucroRealObrigacoesExtras";
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
    limparCacheCentralParaTeste(); limparCacheLucroRealParaTeste(); limparCacheExtrasParaTeste();
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
    assert.deepEqual(await darBaixa(q, C, "irpj:2026:A01", "", "ana", false), { erro: "Baixa aqui só para DCTFWeb, EFD-Contribuições, IRRF do JCP e retenções como tomadora. IRPJ/CSLL: registre o pagamento; PIS/COFINS: no Fiscal; ECD/ECF: marque entregue em Demonstrações." });
    const depois = await painelCentral(deps, C, 2026);
    assert.equal(depois.alertas.some((a) => a.obrigacaoId === "dctfweb:2026-01"), false);
    // JCP registrado vira o IRRF 5706 na Central; a baixa encerra; apagar é um por vez.
    const j = await registrarJcp(q, C, { dataPagamento: "2026-02-15", valorCentavos: 1_000_000, beneficiarios: "Sócio A" }, "ana");
    assert.ok("jcp" in j); const idJ = (j as any).jcp.id as string;
    assert.equal((j as any).jcp.irrfCentavos, 175_000); assert.equal((j as any).jcp.vencimento, "2026-02-25");
    assert.deepEqual(await registrarJcp(q, C, { dataPagamento: "2026-02-30", valorCentavos: 1 }, "ana"), { erro: "Informe a data do pagamento ou do crédito dos juros (dia/mês/ano)." });
    let p = await painelCentral(deps, C, 2026);
    const oj = p.obrigacoes.find((o) => o.id === `irrf_jcp:${idJ}`)!; assert.equal(oj.codigoDarf, "5706"); assert.equal(oj.estado, "confirmada");
    assert.deepEqual(await darBaixa(q, C, `irrf_jcp:${idJ}`, "PAGO-1", "ana", false), { ok: true });
    p = await painelCentral(deps, C, 2026); assert.equal(p.obrigacoes.find((o) => o.id === `irrf_jcp:${idJ}`)!.estado, "baixada");
    assert.deepEqual(await excluirJcp(q, C, idJ), { ok: true });
    p = await painelCentral(deps, C, 2026); assert.equal(p.obrigacoes.some((o) => o.tipo === "irrf_jcp"), false);
    // Retenções como tomadora (vindas do Fiscal): IRRF e CSRF 5952 com o vencimento do 2º decêndio do mês seguinte.
    await gravarRetencoes(q, C, 2026, [{ competencia: "2026-01", irCentavos: 1500, csllCentavos: 1000, pisCentavos: 650, cofinsCentavos: 3000, prestadores: 1, pendencias: 0 }]);
    p = await painelCentral(deps, C, 2026);
    assert.equal(p.obrigacoes.find((o) => o.id === "csrf_tomador:2026-01")!.vencimento, "2026-02-20");
    assert.equal(p.obrigacoes.find((o) => o.id === "irrf_tomador:2026-01")!.valorCentavos, 1500);
    await gravarRetencoes(q, C, 2026, []);
    p = await painelCentral(deps, C, 2026); assert.equal(p.obrigacoes.some((o) => o.tipo === "csrf_tomador"), false, "o Fiscal não manda mais: sai");
    // Bloqueio do PIS/COFINS do Fiscal: sem contabilidade no Contábil = não conferido; diferença de receita aberta bloqueia; aceita libera.
    const semWs = { ...deps, lerWorkspace: async () => null };
    assert.match(String((await bloqueioPisCofinsLR(semWs, C, "2026-01")).motivo), /não tem a contabilidade/);
    const depsAgora = { ...deps, hoje: () => "2026-03-10" };
    await q(`DELETE FROM contabil_lr_conferencias`);
    const b1 = await bloqueioPisCofinsLR(depsAgora, C, "2026-01");
    assert.equal(b1.bloqueada, false, "conferiu agora, sem nota e sem receita: libera"); assert.ok(b1.conferidoEm);
    await gravarDivergencias(q, C, 2026, [{ id: "2026-01:notas_x_receita", competencia: "2026-01", tipo: "notas_x_receita", contabilCentavos: 0, outroCentavos: 500, explicacao: "x" }]);
    const b2 = await bloqueioPisCofinsLR(depsAgora, C, "2026-01", Date.parse(b1.conferidoEm!) + 60_000);
    assert.equal(b2.bloqueada, true); assert.match(String(b2.motivo), /1 diferença/);
    assert.deepEqual(await decidirDivergencia(q, C, "2026-01:notas_x_receita", "receita lançada em fevereiro por engano", "ana"), { ok: true });
    assert.equal((await bloqueioPisCofinsLR(depsAgora, C, "2026-01", Date.parse(b1.conferidoEm!) + 60_000)).bloqueada, false);
  } finally {
    await pool.end().catch(() => undefined);
    try { comoPg(`${BIN}/pg_ctl -D ${dir}/data -m immediate stop >/dev/null`); } catch { /* */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
