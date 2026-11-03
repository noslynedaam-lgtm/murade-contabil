import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { Pool } from 'pg';

// Teste de integração: precisa de um Postgres de teste em TEST_DATABASE_URL (sem ele, o teste é ignorado).
const urlBanco = process.env.TEST_DATABASE_URL;

test('reenviar acesso de escritório: convite pendente, conta já aceita e escritório bloqueado', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil, convidarEscritorioContabil, reenviarAcessoEscritorioContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
  const sufixo = crypto.randomBytes(4).toString('hex');
  const id = () => crypto.randomUUID();
  const dono = id();
  const login = (nome: string) => `${nome}-${sufixo}@teste.com`;
  await q('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,office_owner,tenant_id) VALUES($1,$2,$3,$4,true,null,$1)', [dono, login('dono'), 's', 'h']);

  const app = express(); app.use(express.json());
  let quem: string | null = dono;
  app.use((req: any, _res, next) => {
    req.sessaoContabil = quem ? { userId: quem, login: 'sessao-teste', memberships: [], cnpjs: [], administrador: true, donoSistema: quem === dono } : undefined;
    next();
  });
  app.post('/api/auth/tenants/invite', convidarEscritorioContabil);
  app.post('/api/auth/tenants/:login/reenviar', reenviarAcessoEscritorioContabil);
  const servidor = http.createServer(app); await new Promise<void>((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const post = (caminho: string, corpo: object = {}) => fetch(`${base}${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

  try {
    const pontual = login('pontual-contabil');

    // Sem sessão de dono do sistema: nunca reenvia.
    quem = null;
    assert.equal((await post(`/api/auth/tenants/${encodeURIComponent(pontual)}/reenviar`)).status, 403);

    // Ninguém convidado ainda: nada para reenviar, pede para gerar convite novo.
    quem = dono;
    const semNada = await post(`/api/auth/tenants/${encodeURIComponent(pontual)}/reenviar`);
    assert.equal(semNada.status, 404);
    assert.match((await semNada.json() as any).motivo, /Gere.*convite novo|Gerar convite/i);

    // Convida: gera o primeiro link.
    const primeiro = await post('/api/auth/tenants/invite', { login: pontual });
    assert.equal(primeiro.status, 201);
    const linkA = (await primeiro.json() as any).conviteUrl;

    // Reenviar com o convite ainda pendente (ele não aceitou): troca o token, link muda, continua havendo só 1 convite.
    const reenvio1 = await post(`/api/auth/tenants/${encodeURIComponent(pontual)}/reenviar`);
    assert.equal(reenvio1.status, 201);
    const d1 = await reenvio1.json() as any;
    assert.equal(d1.tipo, 'convite');
    assert.notEqual(d1.conviteUrl, linkA, 'o link antigo deve deixar de valer');
    assert.equal((await q('SELECT count(*)::int AS n FROM contabil_auth_invites WHERE login=$1', [pontual])).rows[0].n, 1);

    // Ele aceitou e já tem conta: reenviar agora gera link de NOVA SENHA, não convite novo.
    const contaId = id();
    await q('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,office_owner,tenant_id) VALUES($1,$2,$3,$4,true,null,$1)', [contaId, pontual, 's', 'h']);
    const reenvio2 = await post(`/api/auth/tenants/${encodeURIComponent(pontual)}/reenviar`);
    assert.equal(reenvio2.status, 201);
    const d2 = await reenvio2.json() as any;
    assert.equal(d2.tipo, 'nova_senha');
    assert.equal((await q('SELECT count(*)::int AS n FROM contabil_auth_senha_resets r JOIN contabil_auth_users u ON u.id=r.user_id WHERE u.login=$1', [pontual])).rows[0].n, 1);

    // Escritório bloqueado: não reenvia (não pode distribuir acesso a uma conta bloqueada).
    await q('UPDATE contabil_auth_users SET disabled=true WHERE id=$1', [contaId]);
    const bloqueado = await post(`/api/auth/tenants/${encodeURIComponent(pontual)}/reenviar`);
    assert.equal(bloqueado.status, 409);
    assert.match((await bloqueado.json() as any).motivo, /bloqueado/i);
  } finally {
    servidor.close();
    await q('DELETE FROM contabil_auth_senha_resets WHERE user_id IN (SELECT id FROM contabil_auth_users WHERE login LIKE $1)', [`%-${sufixo}@teste.com`]);
    await q('DELETE FROM contabil_auth_invites WHERE login LIKE $1', [`%-${sufixo}@teste.com`]);
    await q('DELETE FROM contabil_auth_users WHERE login LIKE $1', [`%-${sufixo}@teste.com`]);
    await pool.end();
  }
});
