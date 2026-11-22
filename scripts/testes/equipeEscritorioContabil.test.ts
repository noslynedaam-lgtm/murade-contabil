// Trabalho da equipe chega igual ao do escritório (Contábil), com banco de verdade (TEST_DATABASE_URL; sem ele, pula):
// funcionária cadastra empresa → fica no escritório da dona (a dona e a equipe veem);
// integração/migração vinda de outro sistema com o login da funcionária grava no escritório da dona; outro escritório não vê nada.
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';

const urlBanco = process.env.TEST_DATABASE_URL;

function cnpjValido(base12: string): string {
  const calc = (s: string, pesos: number[]) => { const r = s.split('').reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

test('Contábil: equipe trabalha no escritório da dona; outro escritório não vê', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  delete process.env.MURADE_DONO_SISTEMA;
  const auth = await import('../../src/server/authContabil');
  const { Pool } = await import('pg');
  await auth.prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const sufixo = crypto.randomUUID().slice(0, 8);
  const dona = crypto.randomUUID(); const membro = crypto.randomUUID(); const outro = crypto.randomUUID();
  const loginDona = `dona-${sufixo}@teste.com`; const loginMembro = `membro-${sufixo}@teste.com`; const loginOutro = `outro-${sufixo}@teste.com`;
  const cnpjA = cnpjValido(`1${String(Date.now()).slice(-7)}0001`);
  const cnpjB = cnpjValido(`2${String(Date.now()).slice(-7)}0001`);
  const tokens: Record<string, string> = {};
  const req = (quem: string) => ({ header: (n: string) => (n.toLowerCase() === 'cookie' ? `murade_contabil_session=${tokens[quem]}` : undefined) }) as any;
  try {
    await pool.query(`INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,tenant_id) VALUES($1,$2,'s','h',true,$1),($3,$4,'s','h',true,$3)`, [dona, loginDona, outro, loginOutro]);
    await pool.query(`INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,office_owner,tenant_id) VALUES($1,$2,'s','h',false,$3,$3)`, [membro, loginMembro, dona]);
    for (const [quem, id] of [['dona', dona], ['membro', membro], ['outro', outro]] as const) {
      tokens[quem] = crypto.randomBytes(24).toString('hex');
      await pool.query(`INSERT INTO contabil_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`, [crypto.createHash('sha256').update(tokens[quem]).digest('hex'), id]);
    }

    // (a) A funcionária cadastra a empresa pela tela: o acesso fica no nome da DONA do escritório.
    const reqMembro = req('membro'); reqMembro.sessaoContabil = await auth.obterSessaoContabil(reqMembro); reqMembro.body = { cnpj: cnpjA };
    let status = 0; const res: any = { status: (s: number) => { status = s; return res; }, json: () => res, setHeader: () => res };
    await auth.adicionarEmpresaAcessoContabil(reqMembro, res);
    assert.equal(status, 201);
    const donos = (await pool.query('SELECT user_id::text FROM contabil_auth_company_access WHERE cnpj=$1', [cnpjA])).rows.map((r) => r.user_id);
    assert.deepEqual(donos, [dona], 'a empresa fica no escritório (dona), nunca no login da funcionária');

    const sDona = await auth.obterSessaoContabil(req('dona'));
    const sMembro = await auth.obterSessaoContabil(req('membro'));
    const sOutro = await auth.obterSessaoContabil(req('outro'));
    assert.ok(sDona!.cnpjs.includes(cnpjA), 'a dona vê a empresa cadastrada pela funcionária');
    assert.ok(sMembro!.cnpjs.includes(cnpjA), 'a funcionária continua vendo');
    assert.equal(sOutro!.cnpjs.includes(cnpjA), false, 'outro escritório não vê');

    // (b) Outro sistema (DP: migração ou cadastro) chega com o login da FUNCIONÁRIA: grava no escritório da dona.
    // Robô "empresas do Fiscal" / migração: item com o login da funcionária vai para o escritório da dona.
    const imp = await auth.importarCnpjsCompartilhados([{ cnpj: cnpjB, escritorio: loginMembro, donoSistema: false }]);
    assert.deepEqual(imp.criadas, [cnpjB]);
    assert.deepEqual(imp.semEscritorio, []);
    const donosB = (await pool.query('SELECT user_id::text FROM contabil_auth_company_access WHERE cnpj=$1', [cnpjB])).rows.map((r) => r.user_id);
    assert.deepEqual(donosB, [dona]);
    const sessaoIntegracao = await auth.sessaoDoEscritorioParaIntegracaoContabil(loginMembro, false);
    assert.equal(sessaoIntegracao?.userId, dona, 'migração dos três sistemas com login da equipe usa o escritório da dona');
    assert.equal(sessaoIntegracao?.administrador, true);
    // Login desconhecido continua sem escritório (nunca cai em outro escritório no lugar).
    assert.equal(await auth.sessaoDoEscritorioParaIntegracaoContabil(`ninguem-${sufixo}@teste.com`, false), null);
    // Login de membro desligado não resolve para ninguém.
    await pool.query('UPDATE contabil_auth_users SET disabled=true WHERE id=$1', [membro]);
    assert.equal(await auth.loginDoDonoDoEscritorioContabil(loginMembro), null);
  } finally {
    await pool.query('DELETE FROM contabil_auth_company_access WHERE cnpj = ANY($1)', [[cnpjA, cnpjB]]).catch(() => undefined);
    await pool.query('DELETE FROM contabil_auth_users WHERE id = ANY($1::uuid[])', [[membro, dona, outro]]).catch(() => undefined);
    await pool.end();
  }
});
