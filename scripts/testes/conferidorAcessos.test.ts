import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

// Teste de integração: precisa de um Postgres de teste em TEST_DATABASE_URL (sem ele, o teste é ignorado).
const urlBanco = process.env.TEST_DATABASE_URL;

test('Robô Conferidor de Acessos limpa o que contas excluídas ou bloqueadas deixaram para trás', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  const { rodarConferidorAcessos, resumoRelatorioAcessos } = await import('../../src/server/conferidorAcessos');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
  const sufixo = crypto.randomBytes(4).toString('hex');
  const excluida = crypto.randomUUID(); const bloqueada = crypto.randomUUID(); const normal = crypto.randomUUID();
  const cnpj = '11222333000181';
  const novo = (id: string, login: string, disabled: boolean) => q('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,disabled,tenant_id) VALUES($1,$2,$3,$4,$5,$1)', [id, login, 's', 'h', disabled]);
  const sessao = (id: string, salt: string) => q("INSERT INTO contabil_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [crypto.createHash('sha256').update(sufixo + salt).digest('hex'), id]);
  try {
    await novo(excluida, `x-${sufixo}#removido-1@teste.com`, true); await novo(bloqueada, `bloq-${sufixo}@teste.com`, true); await novo(normal, `ok-${sufixo}@teste.com`, false);
    await q("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'operator')", [excluida, cnpj]);
    await q("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'operator')", [normal, cnpj]);
    await sessao(excluida, 'a'); await sessao(bloqueada, 'b'); await sessao(normal, 'c');
    const relatorio = await rodarConferidorAcessos((sql, params) => q(sql, params), { usuarios: 'contabil_auth_users', acesso: 'contabil_auth_company_access', sessoes: 'contabil_auth_sessions', colunaEscritorio: 'global_admin' });
    assert.ok(relatorio.acessosRemovidosDeContasExcluidas >= 1); assert.ok(relatorio.sessoesEncerradasDeContasInativas >= 2);
    assert.equal((await q('SELECT 1 FROM contabil_auth_company_access WHERE user_id=$1', [excluida])).rowCount, 0, 'conta excluída não mantém acesso');
    assert.equal((await q('SELECT 1 FROM contabil_auth_sessions WHERE user_id=ANY($1::uuid[])', [[excluida, bloqueada]])).rowCount, 0, 'conta inativa não mantém sessão');
    assert.equal((await q('SELECT 1 FROM contabil_auth_company_access WHERE user_id=$1', [normal])).rowCount, 1, 'conta normal não é tocada');
    assert.equal((await q('SELECT 1 FROM contabil_auth_sessions WHERE user_id=$1', [normal])).rowCount, 1, 'sessão de conta normal não é tocada');
    assert.match(resumoRelatorioAcessos(relatorio), /Acessos conferidos/);
  } finally {
    await q('DELETE FROM contabil_auth_users WHERE id=ANY($1::uuid[])', [[excluida, bloqueada, normal]]).catch(() => undefined);
    await pool.end();
  }
});
