import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// Banco de verdade (TEST_DATABASE_URL): nome de tratamento e "uma saudação por dia" ficam gravados no usuário, sem IA.
const urlBanco = process.env.TEST_DATABASE_URL;

test('Contábil: nome e saudação do dia gravados por usuário', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco!;
  const a = await import('../../src/server/authContabil');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: urlBanco });
  await a.prepararAuthContabil();
  const sufixo = crypto.randomBytes(3).toString('hex');
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [i, id] of ids.entries()) await pool.query('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash) VALUES($1,$2,$3,$4)', [id, `saud${i}${sufixo}@teste.com`, 'x', 'x']);
  try {
    assert.deepEqual(await a.lerPerfilSaudacaoContabil(ids[0]), { nome: null, saudadoHoje: false });
    await a.gravarNomeTratamentoContabil(ids[0], 'Herbert');
    assert.deepEqual(await a.lerPerfilSaudacaoContabil(ids[0]), { nome: 'Herbert', saudadoHoje: false });
    await a.marcarSaudadoHojeContabil(ids[0]);
    assert.deepEqual(await a.lerPerfilSaudacaoContabil(ids[0]), { nome: 'Herbert', saudadoHoje: true });
    // O outro usuário do mesmo sistema não é afetado: cada dono tem o seu nome.
    assert.deepEqual(await a.lerPerfilSaudacaoContabil(ids[1]), { nome: null, saudadoHoje: false });
    await a.gravarNomeTratamentoContabil(ids[1], 'Aldair');
    assert.equal((await a.lerPerfilSaudacaoContabil(ids[0])).nome, 'Herbert');
    assert.equal((await a.lerPerfilSaudacaoContabil(ids[1])).nome, 'Aldair');
    // Dia seguinte: a saudação volta a valer.
    await pool.query(`UPDATE contabil_auth_users SET ultima_saudacao = (current_date - 1) WHERE id=$1`, [ids[0]]);
    assert.equal((await a.lerPerfilSaudacaoContabil(ids[0])).saudadoHoje, false);
    // Usuário inexistente: sem nome e sem saudação, sem erro.
    assert.deepEqual(await a.lerPerfilSaudacaoContabil(crypto.randomUUID()), { nome: null, saudadoHoje: false });
  } finally {
    await pool.query('DELETE FROM contabil_auth_users WHERE id = ANY($1::uuid[])', [ids]);
    await pool.end();
  }
});
