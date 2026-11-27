// Publicar no meio da gravação da migração pelo backup sem o cliente ver (pedido do dono, 27/11/2026): DDL de subida com
// lock_timeout, estado no banco, SIGTERM no meio desfaz a empresa da vez e devolve "pausado", o servidor novo (memória vazia)
// traz a sessão e o arquivo de volta e continua; empresa já gravada não é gravada de novo. PostgreSQL real criado na hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync, spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { limparPendentesDdl, protegerDdlNoPool, tentarPendentes } from '../../src/server/ddlProtegido';

const BIN = '/usr/lib/postgresql/16/bin';
const temPostgres = fs.existsSync(`${BIN}/initdb`) && spawnSync('id', ['postgres']).status === 0;
const PASTA_DISCO = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-disco-ct-'));
process.env.MURADE_MIGRACAO_DIR = PASTA_DISCO; // disco persistente simulado
let dir = ''; let pool: Pool | null = null;
function subirPostgres(): Pool {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgct-')); fs.chmodSync(dir, 0o777);
  const porta = String(55000 + Math.floor(Math.random() * 1000));
  execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', `${BIN}/initdb -D ${dir}/data -A trust -U postgres >/dev/null && ${BIN}/pg_ctl -D ${dir}/data -o '-p ${porta} -k ${dir}' -l ${dir}/log -w start >/dev/null`], { stdio: 'pipe' });
  return new Pool({ host: dir, port: Number(porta), user: 'postgres', database: 'postgres', max: 8 });
}
test.after(async () => {
  limparPendentesDdl(); await pool?.end().catch(() => undefined);
  if (dir) { try { execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', `${BIN}/pg_ctl -D ${dir}/data -m immediate stop >/dev/null`], { stdio: 'pipe' }); } catch { /* já parou */ } fs.rmSync(dir, { recursive: true, force: true }); }
  fs.rmSync(PASTA_DISCO, { recursive: true, force: true });
});
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function esperarAte(cond: () => boolean, ms = 15_000) { const fim = Date.now() + ms; while (Date.now() < fim) { if (cond()) return; await espera(30); } throw new Error('tempo esgotado'); }

test('DDL de subida com lock_timeout: adia sem travar e aplica depois', { skip: !temPostgres && 'sem PostgreSQL local', timeout: 60_000 }, async () => {
  pool = subirPostgres();
  const protegido = protegerDdlNoPool(new Pool({ host: dir, port: (pool as any).options.port, user: 'postgres', database: 'postgres', max: 3 }), 'teste-ct', { lockMs: 700, statementMs: 5000, repetirMs: 10, log: () => undefined });
  try {
    await pool.query('CREATE TABLE lanc (cnpj text, valor int)');
    const longa = await pool.connect(); await longa.query('BEGIN'); await longa.query(`INSERT INTO lanc VALUES ('1', 1)`);
    const t0 = Date.now();
    assert.equal((await protegido.query('ALTER TABLE lanc ADD COLUMN IF NOT EXISTS valor int')).command, 'SKIP');
    assert.equal((await protegido.query('CREATE INDEX IF NOT EXISTS lanc_cnpj_idx ON lanc (cnpj)')).command, 'ADIADO');
    assert.ok(Date.now() - t0 < 3000);
    await longa.query('COMMIT'); longa.release();
    assert.equal((await tentarPendentes(Date.now() + 600_000, 'teste-ct')).aplicados, 1);
    assert.equal((await pool.query(`SELECT to_regclass('lanc_cnpj_idx') IS NOT NULL AS ok`)).rows[0].ok, true);
  } finally { await protegido.end(); }
});

const CNPJS: Record<number, string> = { 1: '11222333000181', 2: '44555666000181', 3: '11444777000161' };
const dump = () => `CREATE TABLE wphd.empresa (\n    cdempresa text,\n    nmempresa text,\n    nrcgc text\n);\n\nCOPY wphd.empresa (cdempresa, nmempresa, nrcgc) FROM stdin;\n${[1, 2, 3].map((cd) => `${cd}\tEMPRESA ${cd}\t${CNPJS[cd]}`).join('\n')}\n\\.\n\n${'-- '.repeat(80)}\n`;

test('SIGTERM no meio: desfaz a empresa da vez, devolve "pausado"; servidor novo traz a sessão de volta e continua sem regravar', { skip: !temPostgres && 'sem PostgreSQL local', timeout: 60_000 }, async () => {
  pool ??= subirPostgres();
  await pool.query('CREATE TABLE IF NOT EXISTS gravado (cd int, n int)'); await pool.query('TRUNCATE gravado');
  const servico = await import('../../src/server/migracaoSistemaAnterior/servico');
  const q = (sql: string, p: unknown[] = []) => pool!.query(sql, p as any[]) as any;
  const transacao = async <T>(fn: (t: typeof q) => Promise<T>): Promise<T> => {
    const c = await pool!.connect();
    try { await c.query('BEGIN'); const r = await fn((s: string, p: unknown[] = []) => c.query(s, p as any[]) as any); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  };
  const banco = { consultar: q, transacao };
  const vezes: Record<number, number> = {}; const naTransacao: Record<number, number> = {};
  const gravar = async (dados: any, controle?: { desfazerAgora: () => boolean }) => {
    const cd = Number(Object.entries(CNPJS).find(([, c]) => c === dados.cnpj)?.[0]); vezes[cd] = (vezes[cd] ?? 0) + 1; naTransacao[cd] = 0;
    return servico.bancoInterrompivel(banco, () => controle?.desfazerAgora() === true).transacao(async (t: any) => {
      for (let i = 0; i < 10; i++) { await t('INSERT INTO gravado (cd, n) VALUES ($1,$2)', [cd, i]); naTransacao[cd] = i + 1; await espera(cd === 2 ? 150 : 5); }
      return { lancamentos: 10, contasNovas: 0, conferencia: { resumo: 'ok', bate: true } };
    });
  };
  const retomada = servico.configurarRetomadaContabil(() => q, { registrarNoDesligamento: false });
  const { token } = await servico.receberArquivoContabil(Readable.from([Buffer.from(dump())]) as any, 'u1', false);
  servico.definirPreviasContabilParaTeste(token, [1, 2, 3]);
  const lote = servico.gravarMigracaoContabil(token, 'u1', [1, 2, 3], false, gravar, async () => false);
  await esperarAte(() => (naTransacao[2] ?? 0) >= 2);
  await retomada.pausarParaDesligar(3000); // prazo curto: a empresa 2 é desfeita inteira
  const r1 = await lote;
  assert.deepEqual(r1.map((x: any) => [x.cdempresa, x.gravado, Boolean(x.pausado)]), [[1, true, false], [2, false, true], [3, false, true]]);
  assert.equal(Number((await pool.query('SELECT count(*)::int n FROM gravado WHERE cd=2')).rows[0].n), 0, 'nada da empresa 2 pela metade');
  const salvo = (await pool.query('SELECT estado, dados FROM murade_contabil_migracao_sessoes WHERE token=$1', [token])).rows[0];
  assert.equal(salvo.estado, 'gravando'); assert.deepEqual(Object.keys(salvo.dados.resultados), ['1']); assert.deepEqual(Object.keys(salvo.dados.previas).sort(), ['2', '3']);
  assert.equal(salvo.dados.arquivo.onde, 'disco'); assert.equal(salvo.dados.arquivo.pronto, true);
  const ativas = await servico.migracoesAtivasContabil();
  assert.equal(ativas.emAndamento, 1); assert.equal(ativas.guardadas[0].empresasFaltando, 2); assert.equal(JSON.stringify(ativas).includes(CNPJS[1]), false);
  // Servidor novo: memória vazia, pedido de pausa zerado. A tela repete o lote inteiro.
  servico.esquecerSessoesContabilParaTeste(); servico.configurarRetomadaContabil(() => q, { registrarNoDesligamento: false });
  const r2 = await servico.gravarMigracaoContabil(token, 'u1', [1, 2, 3], false, gravar, async () => false);
  assert.deepEqual(r2.map((x: any) => [x.cdempresa, x.gravado]), [[1, true], [2, true], [3, true]]);
  assert.equal(vezes[1], 1, 'a empresa 1 não foi gravada de novo');
  assert.deepEqual((await pool.query('SELECT cd, count(*)::int n FROM gravado GROUP BY cd ORDER BY cd')).rows, [{ cd: 1, n: 10 }, { cd: 2, n: 10 }, { cd: 3, n: 10 }]);
  assert.equal((await pool.query('SELECT estado FROM murade_contabil_migracao_sessoes WHERE token=$1', [token])).rows[0].estado, 'terminou');
  assert.equal(fs.existsSync(path.join(PASTA_DISCO, 'murade-contabil-migracao-sistema-anterior', `${token}.sql`)), false, 'arquivo apagado no fim');
  assert.equal((await servico.migracoesAtivasContabil()).emAndamento, 0);
});

test('sem o arquivo guardado, o servidor novo avisa para escolher o arquivo de novo (o que já gravou não duplica)', { skip: !temPostgres && 'sem PostgreSQL local', timeout: 30_000 }, async () => {
  pool ??= subirPostgres();
  const servico = await import('../../src/server/migracaoSistemaAnterior/servico');
  const q = (sql: string, p: unknown[] = []) => pool!.query(sql, p as any[]) as any;
  const retomada = servico.configurarRetomadaContabil(() => q, { registrarNoDesligamento: false });
  await retomada.salvar('c'.repeat(48), 'u2', 'gravando', { previas: { 5: { cnpjInformado: '', desfazerAjustes: false } }, resultados: {}, emAndamento: null, extras: {}, arquivo: { tamanho: 999, onde: '', chave: '', pronto: false } });
  servico.esquecerSessoesContabilParaTeste();
  await assert.rejects(servico.gravarMigracaoContabil('c'.repeat(48), 'u2', [5], false, async () => { throw new Error('não deveria gravar'); }, async () => false), /Escolha o arquivo de novo/);
  await assert.rejects(servico.gravarMigracaoContabil('c'.repeat(48), 'outro', [5], false, async () => { throw new Error('não deveria gravar'); }, async () => false), /não foi encontrado/);
});
