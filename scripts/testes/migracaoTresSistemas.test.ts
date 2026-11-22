// Migração dos três sistemas (o DP repassa a parte contábil do backup ao Contábil pelas rotas de integração).
//
// Parte 1 (sempre roda): token inválido/ausente, escritório que não existe no Contábil, login que não é administrador, isolamento
// entre escritórios e a conferência só responde CNPJs do próprio escritório.
// Parte 2 (local, com o backup real e um PostgreSQL LOCAL; roda com MIGRACAO_TRES_LOCAL=1): grava a mesma empresa pela tela do
// Contábil e pelo caminho único em dois bancos novos e compara TODAS as tabelas com CNPJ, campo a campo; depois migra de novo
// pelo caminho único e pela tela no mesmo banco e confere que nada duplicou (idempotência), e que o clique duplo é recusado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import express from 'express';
import pg from 'pg';
import { registrarRotasMigracaoSistemaAnterior, resolverEscritorioIntegracao } from '../../src/server/migracaoSistemaAnterior/rotas';
import type { SessaoContabil } from '../../src/server/authContabil';
import { workspaceValido, cnpjContabilValido } from '../../src/server/authContabil';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import type { BancoTransacional } from '../../src/server/exclusaoEmpresaCascata';

const TOKEN = 'token-de-integracao-de-teste-1234567890';
const sessaoDe = (id: string, login: string, cnpjs: string[] = [], administrador = true): SessaoContabil => ({ userId: id, login, administrador, tenantId: id, cnpjs, memberships: cnpjs.map((cnpj) => ({ cnpj, role: 'admin' as const })) });

function montarApp(o: { consultar: (s: string, p?: unknown[]) => Promise<any>; banco: BancoTransacional; sessaoTela?: SessaoContabil; escritorios: Record<string, SessaoContabil>; configurado?: boolean }) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const sessaoTela: express.RequestHandler = (req, res, next) => { if (!o.sessaoTela) { res.status(401).json({ sucesso: false }); return; } (req as any).sessaoContabil = o.sessaoTela; next(); };
  registrarRotasMigracaoSistemaAnterior(app, {
    exigirSessao: sessaoTela, exigirOrigemNavegador: (_q, _r, n) => n(), consultar: o.consultar as any, banco: () => o.banco, preparar: async () => undefined, bancoConfigurado: () => true,
    workspaceValido: (p) => workspaceValido(p), cnpjValido: (c) => cnpjContabilValido(c), modelo: planoContasModelo,
    integracao: { autorizado: (req) => String(req.get('authorization') || '') === `Bearer ${TOKEN}`, configurado: () => o.configurado !== false, sessaoDoEscritorio: async (l) => o.escritorios[l] ?? null },
    robos: { executarRobo: async (_i, fn) => fn(), registrarResultadoRobo: () => undefined, definirAlertaRobo: () => undefined },
  });
  return app;
}
async function ouvir(app: express.Express) {
  const srv = http.createServer(app); await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  return { url: `http://127.0.0.1:${(srv.address() as any).port}`, fechar: () => new Promise<void>((ok) => { srv.closeAllConnections?.(); srv.close(() => ok()); }) };
}
const integ = (url: string, etapa: string, corpo: unknown, token = TOKEN) => fetch(`${url}/api/integracao/migracao-sistema-anterior/${etapa}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) });
const vazio = async () => ({ rows: [] as any[] });
const bancoFalso: BancoTransacional = { consultar: vazio as any, transacao: async (fn: any) => fn(vazio) } as any;

test('token inválido, token não configurado, escritório inexistente e login que não é administrador são recusados', async () => {
  const s = await ouvir(montarApp({ consultar: vazio, banco: bancoFalso, escritorios: { abc: sessaoDe('u-abc', 'abc'), equipe: sessaoDe('u-eq', 'equipe', [], false) } }));
  try {
    assert.equal((await integ(s.url, 'escritorio', { escritorio: 'abc' }, 'errado')).status, 401);
    const r = await integ(s.url, 'escritorio', { escritorio: 'naoexiste' }); assert.equal(r.status, 409);
    const j = await r.json(); assert.equal(j.semEscritorio, true); assert.match(j.motivo, /Crie o acesso do escritório no Contábil/);
    assert.equal((await integ(s.url, 'escritorio', { escritorio: 'equipe' })).status, 403);
    assert.equal((await integ(s.url, 'escritorio', {})).status, 400);
    assert.equal((await (await integ(s.url, 'escritorio', { escritorio: 'abc' })).json()).login, 'abc');
    assert.equal((await fetch(`${s.url}/api/integracao/migracao-sistema-anterior/arquivo?escritorio=abc`, { method: 'POST', headers: { authorization: 'Bearer x' }, body: 'x'.repeat(1000) })).status, 401);
    // A tela continua exigindo a sessão do navegador (sem sessão: recusa).
    assert.equal((await fetch(`${s.url}/api/migracao-sistema-anterior/empresas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  } finally { await s.fechar(); }
  const sem = await ouvir(montarApp({ consultar: vazio, banco: bancoFalso, escritorios: {}, configurado: false }));
  try { assert.equal((await integ(sem.url, 'escritorio', { escritorio: 'abc' })).status, 503); } finally { await sem.fechar(); }
});

test('isolamento: o envio de um escritório não serve para outro, e a conferência só responde CNPJs do próprio escritório', async () => {
  const A = sessaoDe('u-a', 'esc-a', ['11222333000181']); const B = sessaoDe('u-b', 'esc-b', ['44555666000181']);
  const s = await ouvir(montarApp({ consultar: vazio, banco: bancoFalso, escritorios: { 'esc-a': A, 'esc-b': B } }));
  try {
    const env = await fetch(`${s.url}/api/integracao/migracao-sistema-anterior/arquivo?escritorio=esc-a`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream' }, body: `-- teste\n${'-- enchimento\n'.repeat(20)}` });
    const { token } = await env.json(); assert.ok(token);
    assert.match((await (await integ(s.url, 'empresas', { escritorio: 'esc-b', token })).json()).motivo, /não foi encontrado/);
    assert.doesNotMatch(String((await (await integ(s.url, 'empresas', { escritorio: 'esc-a', token })).json()).motivo), /não foi encontrado/);
    const conf = await (await integ(s.url, 'conferencia', { escritorio: 'esc-a', cnpjs: ['11222333000181', '44555666000181'] })).json();
    assert.deepEqual(conf.empresas.map((e: any) => [e.cnpj, e.doEscritorio]), [['11222333000181', true], ['44555666000181', false]]);
    await integ(s.url, 'descartar', { escritorio: 'esc-a', token });
  } finally { await s.fechar(); }
});

test('resolverEscritorioIntegracao: login vem da query (envio) ou do corpo, normalizado', async () => {
  const vistos: string[] = [];
  const i = { autorizado: () => true, configurado: () => true, sessaoDoEscritorio: async (l: string, d: boolean) => { vistos.push(`${l}|${d}`); return sessaoDe('x', l); } };
  await resolverEscritorioIntegracao({ query: { escritorio: ' ABC ' }, body: {} } as any, i);
  await resolverEscritorioIntegracao({ query: {}, body: { escritorio: 'Xyz', donoSistema: true } } as any, i);
  assert.deepEqual(vistos, ['abc|false', 'xyz|true']);
});

// ------------------------------------------------------------------------------------------------------------------------
const BACKUP = process.env.MIGRACAO_BACKUP || '/home/claude/alterdata-restore/ALTERDATA_PACK.backup';
const PG = process.env.MIGRACAO_PG || 'postgres://postgres:senha@127.0.0.1';
const local = process.env.MIGRACAO_TRES_LOCAL === '1' && fs.existsSync(BACKUP) && /@(127\.0\.0\.1|localhost)(:\d+)?$/.test(PG);

async function criarBanco(nome: string, modelo?: string) {
  const adm = new pg.Pool({ connectionString: `${PG}/postgres`, max: 1 });
  await adm.query(`DROP DATABASE IF EXISTS ${nome}`); await adm.query(modelo ? `CREATE DATABASE ${nome} TEMPLATE ${modelo}` : `CREATE DATABASE ${nome}`); await adm.end();
  return new pg.Pool({ connectionString: `${PG}/${nome}`, max: 4 });
}
const transacional = (p: pg.Pool): BancoTransacional => ({
  consultar: (s: string, v?: unknown[]) => p.query(s, v as any[]),
  async transacao(fn: any) { const c = await p.connect(); try { await c.query('BEGIN'); const x = await fn((s: string, v?: unknown[]) => c.query(s, v as any[])); await c.query('COMMIT'); return x; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } },
} as any);
async function retrato(p: pg.Pool, cnpj: string, idempotencia = false): Promise<Record<string, string[]>> {
  const tabelas = (await p.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='cnpj' ORDER BY 1`)).rows.map((r) => r.table_name);
  const semHora = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(semHora);
    if (v instanceof Date) return '(hora)';
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !/(_em|Em|_at)$/.test(k) && !(idempotencia && k === 'version')).map(([k, x]) => [k, semHora(x)]).sort(([a], [b]) => String(a).localeCompare(String(b))));
    return v;
  };
  const out: Record<string, string[]> = {};
  for (const t of tabelas) out[t] = (await p.query(`SELECT * FROM ${t} WHERE cnpj=$1`, [cnpj])).rows.map((r) => JSON.stringify(semHora(r))).sort();
  return out;
}
function diferencas(a: Record<string, string[]>, b: Record<string, string[]>): string {
  const out: string[] = [];
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = new Set(a[t] || []); const y = new Set(b[t] || []);
    const so1 = [...x].filter((l) => !y.has(l)); const so2 = [...y].filter((l) => !x.has(l));
    if (so1.length || so2.length || (a[t] || []).length !== (b[t] || []).length) out.push(`${t}: ${(a[t] || []).length} x ${(b[t] || []).length} linha(s); ${so1.length} só no primeiro, ${so2.length} só no segundo; ex.: ${String(so1[0] || '').slice(0, 300)} <> ${String(so2[0] || '').slice(0, 300)}`);
  }
  return out.join('\n');
}
async function migrar(url: string, prefixo: string, cab: Record<string, string>, extra: Record<string, unknown>, gz: string, cd: number) {
  const q = prefixo.includes('integracao') ? `&${new URLSearchParams(extra as any)}` : '';
  const j = await (await fetch(`${url}${prefixo}/arquivo?compactado=gzip${q}`, { method: 'POST', headers: { ...cab, 'content-type': 'application/octet-stream' }, body: fs.readFileSync(gz) })).json();
  assert.ok(j.sucesso, j.motivo);
  const chamar = async (e: string, c: Record<string, unknown>) => (await fetch(`${url}${prefixo}/${e}`, { method: 'POST', headers: { ...cab, 'content-type': 'application/json' }, body: JSON.stringify({ ...extra, token: j.token, ...c }) })).json();
  const l = await chamar('empresas', {}); assert.ok(l.sucesso, l.motivo);
  const pv = await chamar('previa', { cdempresas: [cd], cnpjs: {}, desfazerAjustes: [] }); assert.ok(pv.sucesso, pv.motivo); assert.equal(pv.empresas[0].podeGravar, true, pv.empresas[0].motivo);
  const duas = await Promise.all([1, 2].map(() => chamar('gravar', { cdempresas: [cd], escolhidasUmaAUma: true })));
  assert.equal(duas.filter((x) => x.sucesso).length, 1, `clique duplo: só uma gravação vale (${JSON.stringify(duas).slice(0, 300)})`);
  const g = duas.find((x) => x.sucesso);
  assert.equal(g.resultados[0].gravado, true, g.resultados[0].motivo);
  return { previa: pv.empresas[0], resultado: g.resultados[0] };
}

test('caminho único (DP → Contábil) grava EXATAMENTE o mesmo que a tela do Contábil, e migrar de novo não duplica', { skip: !local && 'precisa do backup e do PostgreSQL local (MIGRACAO_TRES_LOCAL=1)', timeout: 40 * 60_000 }, async () => {
  const { extrairTabelasContabeis } = await import('../../src/utils/leitorBackupCustom');
  const { indexarDump, carregarTabelaDump } = await import('../../src/server/migracaoSistemaAnterior/leitorDump');
  const { listarEmpresasContabeis } = await import('../../src/server/migracaoSistemaAnterior/conversor');
  const { prepararTabelasTitulosCartoes } = await import('../../src/server/titulosCartoesStore');
  const { prepararTabelaSistemaAnterior } = await import('../../src/server/migracaoSistemaAnterior/banco');
  const fd = fs.openSync(BACKUP, 'r'); const total = fs.fstatSync(fd).size;
  const r = await extrairTabelasContabeis(async (i, f) => { const b = Buffer.alloc(f - i); fs.readSync(fd, b, 0, f - i, i); return new Uint8Array(b); }, total, async (p) => new Uint8Array(zlib.inflateSync(Buffer.concat(p.map((x) => Buffer.from(x))))));
  fs.closeSync(fd);
  const sql = path.join(os.tmpdir(), `contabil-tres-${process.pid}.sql`); const o = fs.openSync(sql, 'w'); for (const x of r.partes) fs.writeSync(o, x); fs.closeSync(o); r.partes.length = 0;
  const gz = `${sql}.gz`; fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(sql), { level: 1 }));
  try {
    const idx = await indexarDump(sql);
    const ler = (n: string) => carregarTabelaDump(idx, n);
    const comDados = [...idx.tabelas.values()].filter((t) => t.fim > t.inicio).map((t) => t.nome);
    const empresas = listarEmpresasContabeis((await ler('wphd.empresa'))!, (await ler('wcont.empcont')) || [], comDados).filter((e) => !e.semCadastro && cnpjContabilValido(e.cnpj));
    const alvo = (process.env.MIGRACAO_CD ? empresas.find((e) => e.cdempresa === Number(process.env.MIGRACAO_CD)) : empresas[0])!;
    assert.ok(alvo, 'empresa com parte contábil no backup');
    // Banco-modelo com o esquema do Contábil (criado pelo próprio Contábil num processo à parte) e as tabelas da migração.
    const modelo = await criarBanco('mig3_contabil_modelo');
    execFileSync('npx', ['tsx', '-e', "import('./src/server/authContabil').then((m) => m.prepararAuthContabil()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })"], { env: { ...process.env, DATABASE_URL: `${PG}/mig3_contabil_modelo` }, stdio: 'inherit', cwd: process.cwd() });
    await prepararTabelasTitulosCartoes((s, v) => modelo.query(s, v as any[]) as any); await prepararTabelaSistemaAnterior((s, v) => modelo.query(s, v as any[]) as any);
    const id = (await modelo.query(`INSERT INTO contabil_auth_users (id, login, password_salt, password_hash, global_admin) VALUES (gen_random_uuid(), 'teste', 'x', 'x', true) RETURNING id`)).rows[0].id;
    await modelo.query('UPDATE contabil_auth_users SET tenant_id=id'); await modelo.end();
    const quem = sessaoDe(String(id), 'teste', [alvo.cnpj]);
    const A = await criarBanco('mig3_contabil_tela', 'mig3_contabil_modelo'); const B = await criarBanco('mig3_contabil_dp', 'mig3_contabil_modelo');
    const qA = (s: string, v?: unknown[]) => A.query(s, v as any[]); const qB = (s: string, v?: unknown[]) => B.query(s, v as any[]);
    const tela = await ouvir(montarApp({ consultar: qA, banco: transacional(A), sessaoTela: quem, escritorios: {} }));
    const dp = await ouvir(montarApp({ consultar: qB, banco: transacional(B), escritorios: { teste: quem } }));
    try {
      const pelaTela = await migrar(tela.url, '/api/migracao-sistema-anterior', {}, {}, gz, alvo.cdempresa);
      const peloDp = await migrar(dp.url, '/api/integracao/migracao-sistema-anterior', { authorization: `Bearer ${TOKEN}` }, { escritorio: 'teste' }, gz, alvo.cdempresa);
      assert.deepEqual(peloDp.resultado, pelaTela.resultado, 'mesmo resultado da gravação');
      assert.deepEqual(peloDp.previa, pelaTela.previa, 'mesma prévia');
      const rA = await retrato(A, alvo.cnpj); const rB = await retrato(B, alvo.cnpj);
      assert.ok((rA.contabil_company_workspaces || []).length === 1);
      assert.equal(diferencas(rA, rB), '', 'todas as tabelas com CNPJ iguais campo a campo');
      // Conferência final do caminho único: lidos = gravados.
      const conf = await (await integ(dp.url, 'conferencia', { escritorio: 'teste', cnpjs: [alvo.cnpj] })).json();
      assert.equal(conf.empresas[0].migrada, true); assert.equal(conf.empresas[0].lancamentosLidos, conf.empresas[0].lancamentosNoContabil, JSON.stringify(conf.empresas[0]));
      // Idempotência: de novo pelo DP, e depois pela tela do Contábil, no mesmo banco.
      const base = await retrato(B, alvo.cnpj, true);
      await migrar(dp.url, '/api/integracao/migracao-sistema-anterior', { authorization: `Bearer ${TOKEN}` }, { escritorio: 'teste' }, gz, alvo.cdempresa);
      assert.equal(diferencas(base, await retrato(B, alvo.cnpj, true)), '', 'segunda vez pelo DP não duplica');
      const telaB = await ouvir(montarApp({ consultar: qB, banco: transacional(B), sessaoTela: quem, escritorios: {} }));
      try { await migrar(telaB.url, '/api/migracao-sistema-anterior', {}, {}, gz, alvo.cdempresa); } finally { await telaB.fechar(); }
      assert.equal(diferencas(base, await retrato(B, alvo.cnpj, true)), '', 'DP e depois a tela do Contábil não duplica');
      console.log(`Contábil: empresa ${alvo.cdempresa}: ${pelaTela.resultado.lancamentos} lançamentos, ${pelaTela.resultado.contas} contas; conferência: ${pelaTela.resultado.conferencia}`);
    } finally { await tela.fechar(); await dp.fechar(); await A.end(); await B.end(); }
  } finally { fs.rmSync(sql, { force: true }); fs.rmSync(gz, { force: true }); }
});
