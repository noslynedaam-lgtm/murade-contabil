// Teste de integração: precisa de um Postgres de teste em TEST_DATABASE_URL (mesma convenção do
// backup-escritorio-contabil.test.ts — esquema de verdade, ids/CNPJs aleatórios, nunca DROP/TRUNCATE em tabela
// compartilhada).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { conferirBackupsEscritorios } from '../../src/server/conferidorBackupsContabil';
import { listarBackupsEscritorio, limparCacheBackupsParaTeste, periodoDe } from '../../src/services/backupEscritorioContabilService';

const urlBanco = process.env.TEST_DATABASE_URL;
process.env.MURADE_BACKUP_MASTER_KEY = process.env.MURADE_BACKUP_MASTER_KEY || 'b'.repeat(64);
const cnpjTeste = () => String(Math.floor(Math.random() * 1e14)).padStart(14, '0');

async function banco() {
  limparCacheBackupsParaTeste();
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const consultar = (sql: string, params: unknown[] = []) => pool.query(sql, params) as any;
  return { pool, consultar };
}

async function cadastrarEmpresa(consultar: any): Promise<{ tenantId: string; cnpj: string }> {
  const tenantId = crypto.randomUUID();
  const cnpj = cnpjTeste();
  await consultar(
    `INSERT INTO contabil_auth_users (id, login, password_salt, password_hash, global_admin, tenant_id) VALUES ($1,$2,'s','h',true,$1)`,
    [tenantId, `teste-${tenantId}@murade.test`],
  );
  await consultar(`INSERT INTO contabil_auth_company_access (user_id, cnpj, role) VALUES ($1,$2,'admin')`, [tenantId, cnpj]);
  await consultar('INSERT INTO contabil_empresas_compartilhadas (cnpj, dados) VALUES ($1,$2::jsonb)', [cnpj, JSON.stringify({ razaoSocial: 'Empresa' })]);
  return { tenantId, cnpj };
}

test('escritório sem empresa não entra na conta; com empresa, gera e depois fica em dia', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar);
    const escritorioVazio = crypto.randomUUID();
    const agora = new Date('2026-11-05T12:00:00Z');
    const r1 = await conferirBackupsEscritorios(consultar, [{ id: empresaA.tenantId, cnpjs: [empresaA.cnpj] }, { id: escritorioVazio, cnpjs: [] }], agora);
    assert.equal(r1.escritorios, 1); // escritório vazio não conta
    assert.equal(r1.gerados, 1);
    assert.equal(r1.emDia, 0);
    assert.equal(r1.atencao, false);

    const r2 = await conferirBackupsEscritorios(consultar, [{ id: empresaA.tenantId, cnpjs: [empresaA.cnpj] }], agora);
    assert.equal(r2.gerados, 0);
    assert.equal(r2.emDia, 1);
    assert.match(r2.resumo, /em dia/);

    const lista = await listarBackupsEscritorio(consultar, empresaA.tenantId);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].periodo, periodoDe(agora));
  } finally { await pool.end(); }
});

test('falha de um escritório não impede os demais, e gera ATENÇÃO no resumo', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar);
    const empresaB = await cadastrarEmpresa(consultar);
    const agora = new Date('2026-11-05T12:00:00Z');
    const chaveOriginal = process.env.MURADE_BACKUP_MASTER_KEY;
    delete process.env.MURADE_BACKUP_MASTER_KEY; // simula falta de configuração: toda geração vai falhar
    const r = await conferirBackupsEscritorios(consultar, [{ id: empresaA.tenantId, cnpjs: [empresaA.cnpj] }, { id: empresaB.tenantId, cnpjs: [empresaB.cnpj] }], agora);
    process.env.MURADE_BACKUP_MASTER_KEY = chaveOriginal;
    assert.equal(r.falhas, 2);
    assert.equal(r.atencao, true);
    assert.match(r.resumo, /ATENÇÃO/);
  } finally { await pool.end(); }
});
