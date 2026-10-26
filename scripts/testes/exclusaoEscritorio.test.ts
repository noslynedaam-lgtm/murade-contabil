import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { Pool } from 'pg';

// Teste de integração: precisa de um Postgres de teste em TEST_DATABASE_URL (sem ele, o teste é ignorado).
const urlBanco = process.env.TEST_DATABASE_URL;

test('dono do sistema exclui escritório de verdade e libera e-mails e CNPJ', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  const { registrarGestaoEquipe } = await import('../../src/server/gestaoEquipe');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
  const sufixo = crypto.randomBytes(4).toString('hex');
  const id = () => crypto.randomUUID();
  const dono = id(); const escritorio = id(); const equipe = id(); const auditado = id();
  const login = (nome: string) => `${nome}-${sufixo}@teste.com`;
  const cnpj = '11222333000181';
  const ins = (uid: string, lg: string, extra: { global?: boolean; office?: string | null; tenant: string }) => q(
    'INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,office_owner,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [uid, lg, 's', 'h', extra.global === true, extra.office ?? null, extra.tenant]);
  await ins(dono, login('dono'), { global: true, tenant: dono });
  await ins(escritorio, login('escritorio'), { global: true, tenant: escritorio });
  await ins(equipe, login('equipe'), { office: escritorio, tenant: escritorio });
  await ins(auditado, login('auditado'), { office: escritorio, tenant: escritorio });
  for (const uid of [escritorio, equipe]) await q("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'admin')", [uid, cnpj]);
  await q("INSERT INTO contabil_auth_invites(token_hash,login,cnpjs,role,created_by,expires_at,office_owner) VALUES($1,$2,'{}','operator',$3,now()+interval '30 days',$3)", [crypto.createHash('sha256').update(sufixo).digest('hex'), login('pendente'), escritorio]);
  await q("INSERT INTO contabil_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [crypto.createHash('sha256').update(sufixo + 'x').digest('hex'), equipe]);
  // Uma tabela de histórico que aponta para a conta impede apagá-la de verdade: ela deve virar conta sem acesso, com o e-mail livre.
  await q('CREATE TABLE IF NOT EXISTS teste_historico_conta (user_id uuid NOT NULL REFERENCES contabil_auth_users(id))');
  await q('INSERT INTO teste_historico_conta(user_id) VALUES($1)', [auditado]);

  const app = express(); app.use(express.json());
  let quem = dono;
  registrarGestaoEquipe(app, {
    pool: () => pool, tabelas: { usuarios: 'contabil_auth_users', sessoes: 'contabil_auth_sessions', convites: 'contabil_auth_invites' },
    preparar: prepararAuthContabil, colunaEscritorio: 'global_admin',
    sessao: () => ({ userId: quem, admin: true, donoSistema: quem === dono }),
  });
  const servidor = http.createServer(app); await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const chamar = (corpo: object) => fetch(`${base}/api/auth/tenants/${encodeURIComponent(login('escritorio'))}/excluir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  try {
    quem = escritorio; assert.equal((await chamar({ confirmar: true })).status, 403, 'quem não é dono do sistema não exclui escritório');
    quem = dono; assert.equal((await chamar({})).status, 400, 'exige confirmação');
    const resposta = await chamar({ confirmar: true }); const dados = await resposta.json() as any;
    assert.equal(resposta.status, 200, JSON.stringify(dados)); assert.equal(dados.excluido, true);
    assert.equal(dados.contasApagadas, 2); assert.equal(dados.contasSemAcesso, 1);
    for (const nome of ['escritorio', 'equipe', 'auditado']) assert.equal((await q('SELECT 1 FROM contabil_auth_users WHERE login=$1', [login(nome)])).rowCount, 0, `${nome} deve ficar livre para novo cadastro`);
    assert.equal((await q('SELECT 1 FROM contabil_auth_company_access WHERE cnpj=$1', [cnpj])).rowCount, 0, 'CNPJ não pode ficar preso ao escritório excluído');
    assert.equal((await q('SELECT 1 FROM contabil_auth_invites WHERE office_owner=$1', [escritorio])).rowCount, 0);
    assert.equal((await q('SELECT 1 FROM contabil_auth_sessions WHERE user_id=$1', [equipe])).rowCount, 0);
    assert.equal((await q('SELECT 1 FROM contabil_auth_users WHERE id=$1', [dono])).rowCount, 1, 'a conta do dono do sistema não é tocada');
    assert.equal((await q('SELECT 1 FROM contabil_auth_users u WHERE u.id=$1 AND u.global_admin=false AND u.disabled=true AND u.tenant_id IS NULL', [auditado])).rowCount, 1, 'conta com histórico fica sem acesso');
    const novo = id(); await ins(novo, login('escritorio'), { global: true, tenant: novo }); // o mesmo e-mail pode ser cadastrado de novo
    assert.equal((await chamar({ confirmar: true })).status, 200, 'escritório recadastrado pode ser excluído de novo');
  } finally {
    await new Promise((ok) => servidor.close(ok));
    await q('DROP TABLE IF EXISTS teste_historico_conta').catch(() => undefined);
    await q('DELETE FROM contabil_auth_users WHERE login LIKE $1 OR login LIKE $2 OR id=$3', [`%-${sufixo}@teste.com`, `%#removido-%`, dono]).catch(() => undefined);
    await pool.end();
  }
});

test('dono do sistema vê e exclui uma conta ativa com acesso a empresa, e o e-mail fica livre', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  const { registrarGestaoEquipe } = await import('../../src/server/gestaoEquipe');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
  const sufixo = crypto.randomBytes(4).toString('hex'); const cnpj = '11222333000181';
  const dono = crypto.randomUUID(); const antiga = crypto.randomUUID(); const escritorio = crypto.randomUUID();
  const lgAntiga = `antiga-${sufixo}@teste.com`; const lgEscritorio = `esc-${sufixo}@teste.com`;
  const ins = (uid: string, lg: string, global: boolean, tenant: string | null) => q('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,tenant_id) VALUES($1,$2,$3,$4,$5,$6)', [uid, lg, 's', 'h', global, tenant]);
  await ins(dono, `dono2-${sufixo}@teste.com`, true, dono); await ins(escritorio, lgEscritorio, true, escritorio);
  await ins(antiga, lgAntiga, false, null); // conta antiga: ativa, sem escritório, com acesso a uma empresa
  await q("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'operator')", [antiga, cnpj]);
  await q("INSERT INTO contabil_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [crypto.createHash('sha256').update(sufixo + 'z').digest('hex'), antiga]);
  const app = express(); app.use(express.json()); let quem = dono;
  registrarGestaoEquipe(app, { pool: () => pool, tabelas: { usuarios: 'contabil_auth_users', sessoes: 'contabil_auth_sessions', convites: 'contabil_auth_invites' }, preparar: prepararAuthContabil, colunaEscritorio: 'global_admin', sessao: () => ({ userId: quem, admin: true, donoSistema: quem === dono }) });
  const servidor = http.createServer(app); await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const resumo = async (lg: string) => (await fetch(`${base}/api/auth/usuarios/${encodeURIComponent(lg)}/resumo`)).json() as Promise<any>;
  const excluir = (lg: string, corpo: object) => fetch(`${base}/api/auth/usuarios/${encodeURIComponent(lg)}/excluir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  try {
    const r = await resumo(lgAntiga); assert.equal(r.existe, true); assert.equal(r.empresas, 1); assert.equal(r.escritorio, false);
    assert.equal((await resumo(`nao-existe-${sufixo}@teste.com`)).existe, false);
    assert.equal((await resumo(lgEscritorio)).escritorio, true);
    quem = antiga; assert.equal((await excluir(lgAntiga, { confirmar: true })).status, 403, 'quem não é dono do sistema não exclui contas');
    quem = dono; assert.equal((await excluir(lgAntiga, {})).status, 400, 'exige confirmação');
    assert.equal((await excluir(lgEscritorio, { confirmar: true })).status, 409, 'dono de escritório só sai pela exclusão do escritório');
    assert.equal((await excluir(`dono2-${sufixo}@teste.com`, { confirmar: true })).status, 400, 'não exclui a própria conta');
    const ok = await excluir(lgAntiga, { confirmar: true }); assert.equal(ok.status, 200);
    assert.equal((await q('SELECT 1 FROM contabil_auth_users WHERE login=$1', [lgAntiga])).rowCount, 0, 'e-mail livre para novo cadastro');
    assert.equal((await q('SELECT 1 FROM contabil_auth_company_access WHERE cnpj=$1', [cnpj])).rowCount, 0);
    assert.equal((await excluir(lgAntiga, { confirmar: true })).status, 404, 'já livre');
  } finally {
    await new Promise((ok) => servidor.close(ok));
    await q('DELETE FROM contabil_auth_users WHERE id=ANY($1::uuid[])', [[dono, antiga, escritorio]]).catch(() => undefined);
    await pool.end();
  }
});
