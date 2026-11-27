// Contábil ← Fiscal: dados do backup do sistema anterior completam só o vazio no cadastro (workspace.empresa), com a origem marcada;
// histórico do regime guardado para o Conferidor das Origens cobrar DAS só dos meses no Simples. Dados fictícios.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  aproveitarBackupDoFiscalContabil, camposParaPreencherContabil, esquecerPreparoDadosBackupFiscal, historicoRegimeGuardado, limparDadosBackupFiscal, ORIGEM_BACKUP_FISCAL, simplesNaCompetencia,
  type DadosBackupFiscal, type ResultadoBackupFiscal,
} from "../../src/server/dadosBackupDoFiscalContabil";
import { mesesSemDas } from "../../src/server/conferidorOrigens";

const ler = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const A = "12345678000195"; const B = "98765432000198"; const SEM_ACESSO = "11444777000161";
const HOJE = "2026-11-27";
const dados = (cnpj: string, extra: Partial<DadosBackupFiscal> = {}): DadosBackupFiscal => ({
  cnpj, temBackup: true, regimeHistorico: [{ regime: "Simples Nacional", inicio: "2026-03-01", fim: null, origem: "sistema_anterior" }],
  receitaMensal: [{ competencia: "2026-10", centavos: 100000, incompleto: false, fonte: "simples_indicadores" }],
  cadastro: { cnae: "6201501", inscricaoEstadual: "101234567", inscricaoMunicipal: "55443", cidade: "Goiânia", uf: "GO", endereco: "Rua Fictícia, 100", bairro: "Centro", cep: "74000000", dataAbertura: "2015-01-10", naturezaJuridica: "2062" }, ...extra,
});

/** Banco de mentira só com o que o robô usa (o Contábil não tem pg-mem): workspaces, acessos e a tabela dos dados do backup. */
async function banco() {
  esquecerPreparoDadosBackupFiscal();
  const ws = new Map<string, { cnpj: string; payload: any; version: number }>();
  const acessos: Array<{ user: string; cnpj: string }> = [];
  const guardados = new Map<string, any>();
  let tabelaCriada = false;
  const consultar = (async (sql: string, p: any[] = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("CREATE TABLE IF NOT EXISTS contabil_dados_backup_fiscal")) { tabelaCriada = true; return { rows: [] }; }
    if (q.startsWith("SELECT DISTINCT cnpj FROM contabil_auth_company_access")) return { rows: [...new Set(acessos.map((a) => a.cnpj))].map((cnpj) => ({ cnpj })) };
    if (q.startsWith("SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj=$1")) { const w = ws.get(p[0]); return { rows: w ? [JSON.parse(JSON.stringify(w))] : [] }; }
    if (q.startsWith("INSERT INTO contabil_dados_backup_fiscal")) { guardados.set(p[0], { regime_historico: JSON.parse(p[1]), receita_mensal: JSON.parse(p[2]) }); return { rows: [], rowCount: 1 }; }
    if (q.startsWith("UPDATE contabil_company_workspaces SET payload")) { const w = ws.get(p[0]); if (!w || w.version !== p[2]) return { rows: [], rowCount: 0 }; w.payload = JSON.parse(p[1]); w.version += 1; return { rows: [], rowCount: 1 }; }
    if (q.startsWith("SELECT to_regclass('contabil_dados_backup_fiscal')")) return { rows: [{ t: tabelaCriada ? "contabil_dados_backup_fiscal" : null }] };
    if (q.startsWith("SELECT regime_historico FROM contabil_dados_backup_fiscal")) { const g = guardados.get(p[0]); return { rows: g ? [g] : [] }; }
    throw new Error(`SQL não esperado no teste: ${q.slice(0, 80)}`);
  }) as any;
  const novo = (cnpj: string, empresa: Record<string, unknown>) => ws.set(cnpj, { cnpj, payload: { empresa: { cnpj, razaoSocial: "Empresa Fictícia", ...empresa }, contas: [], lancamentos: [] }, version: 1 });
  novo(A, { regime: "", cnae: "", municipio: "", uf: "" });
  novo(B, { regime: "Lucro Presumido", cnae: "4712100", logradouro: "Av. Digitada", municipio: "Anápolis", uf: "GO" });
  novo(SEM_ACESSO, { regime: "" });
  for (const [user, cnpj] of [["u1", A], ["u2", A], ["u1", B]]) acessos.push({ user, cnpj });
  return { consultar, ws };
}

test("contrato e regra pura: só vazio, endereço inteiro só sem endereço, data no formato da tela, regime coberto pelo histórico", () => {
  assert.equal(limparDadosBackupFiscal({ sucesso: true, cnpj: B, temBackup: true }, A).ok, false);
  const r = limparDadosBackupFiscal({ sucesso: true, cnpj: A, temBackup: true, cadastro: { cnae: "1", email: "x@y.test" } }, A);
  assert.deepEqual(r.ok && r.dados.cadastro, { cnae: "1" });
  const a = camposParaPreencherContabil({ regime: "", cnae: "" }, dados(A), HOJE);
  assert.equal(a.cnae, "6201501"); assert.equal(a.municipio, "Goiânia"); assert.equal(a.cidadeUf, "Goiânia / GO"); assert.equal(a.dataAbertura, "10/01/2015");
  assert.equal(a.logradouro, "Rua Fictícia"); assert.equal(a.numero, "100"); assert.equal(a.regime, "Simples Nacional"); assert.equal(a.naturezaJuridica, "2062");
  const b = camposParaPreencherContabil({ regime: "Lucro Presumido", cnae: "4712100", logradouro: "Av. Digitada", municipio: "Anápolis", uf: "GO" }, dados(B), HOJE);
  assert.equal(b.cnae, undefined); assert.equal(b.regime, undefined); assert.equal(b.logradouro, undefined); assert.equal(b.municipio, undefined);
});

test("simplesNaCompetencia e mesesSemDas: antes de entrar no Simples não cobra DAS; depois do histórico vale o cadastro; sem histórico, como antes", () => {
  const h = [{ regime: "Simples Nacional" as const, inicio: "2026-03-01", fim: "2026-08-31", origem: "sistema_anterior" }];
  assert.equal(simplesNaCompetencia(h, "2026-02", true), false, "antes de entrar");
  assert.equal(simplesNaCompetencia(h, "2026-05", false), true, "no período, mesmo com outro regime hoje");
  assert.equal(simplesNaCompetencia(h, "2026-10", true), true, "depois do histórico, vale o cadastro de hoje");
  assert.equal(simplesNaCompetencia(h, "2026-10", false), false);
  assert.equal(simplesNaCompetencia([], "2026-02", true), true);
  const notas = ["2026-02", "2026-05", "2026-10"].map((c) => ({ competencia: c, tipo: "Saída", copia: { qtd: 1 } })) as any;
  const semHist = mesesSemDas(notas, [], true, "2026-11");
  const comHist = mesesSemDas(notas, [], true, "2026-11", h);
  assert.equal(comHist.includes("2026-02"), false, "não cobra DAS de mês antes do Simples");
  assert.ok(semHist.length >= comHist.length);
  assert.deepEqual(mesesSemDas(notas, [], false, "2026-11"), [], "sem histórico e fora do Simples: nada, como antes");
});

test("robô: só empresas com acesso de escritório, completa o vazio com a origem, guarda o regime e o log só tem contagens", async () => {
  const { consultar } = await banco();
  const pedidos: string[] = [];
  const buscar = async (cnpj: string): Promise<ResultadoBackupFiscal> => { pedidos.push(cnpj); return { ok: true, dados: dados(cnpj) }; };
  const r = await aproveitarBackupDoFiscalContabil(consultar, { hoje: HOJE, buscar });
  assert.deepEqual(pedidos.sort(), [A, B].sort(), "empresa sem acesso de escritório não entra; a mesma empresa com dois usuários conta uma vez");
  assert.equal(r.empresas, 2); assert.equal(r.comBackup, 2); assert.equal(r.comRegime, 2);
  const a = (await consultar("SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj=$1", [A])).rows[0];
  assert.equal(a.payload.empresa.cnae, "6201501"); assert.equal(a.payload.empresa.regime, "Simples Nacional"); assert.equal(a.version, 2);
  assert.equal(a.payload.empresa.camposDoBackupFiscal.cnae.origem, ORIGEM_BACKUP_FISCAL);
  const b = (await consultar("SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj=$1", [B])).rows[0].payload.empresa;
  assert.equal(b.cnae, "4712100"); assert.equal(b.regime, "Lucro Presumido"); assert.equal(b.logradouro, "Av. Digitada"); assert.equal(b.inscricaoEstadual, "101234567");
  assert.equal((await historicoRegimeGuardado(consultar, A)).length, 1);
  assert.equal(/\d{14}|Goiânia|Fictícia/.test(r.resumo), false);
  const so = await aproveitarBackupDoFiscalContabil(consultar, { hoje: HOJE, cnpjs: [B], buscar: async (c) => ({ ok: true, dados: dados(c) }) });
  assert.equal(so.empresas, 1); assert.equal(so.empresasCompletadas, 0, "já completa: nada a fazer");
});

test("robô: Fiscal fora não insiste e diz que não veio; Fiscal antigo avisa para publicar", async () => {
  const { consultar } = await banco();
  let n = 0;
  const fora = await aproveitarBackupDoFiscalContabil(consultar, { hoje: HOJE, buscar: async () => { n += 1; return { ok: false, motivo: "O Murad Fiscal não respondeu a tempo." }; } });
  assert.equal(fora.ok, false); assert.ok(n <= 3);
  const antigo = await aproveitarBackupDoFiscalContabil(consultar, { hoje: HOJE, buscar: async () => ({ ok: false, naoTem: true, motivo: "x" }) });
  assert.match(antigo.resumo, /publique o Fiscal/);
});

test("ligação no servidor: robô com \"Rodar agora\", rota só das empresas da sessão e conferidor usando o histórico", () => {
  const s = ler("server.ts");
  assert.match(s, /registrarRobo\(\{ id: "dados_backup_fiscal"/);
  assert.match(s, /registrarRotinaManual\("dados_backup_fiscal", rodarDadosBackupFiscal\)/);
  assert.match(s, /app\.post\("\/api\/dados-backup-fiscal\/rodar", exigirOrigemNavegador, exigirSessaoContabil/);
  assert.match(ler("src/server/conferidorOrigens.ts"), /historicoRegimeGuardado\(deps\.consultar, cnpj\)/);
  assert.match(ler("src/components/tabs/EmpresaTab.tsx"), /<CamposDoBackupFiscalContabil cnpj=\{cnpj\} campos=\{camposDoBackup\} \/>/);
});
