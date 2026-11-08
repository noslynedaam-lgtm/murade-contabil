import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// Teste de ponta a ponta do login do Contábil com banco de verdade: senha → código de segurança → aparelho confiável → bloqueio → redefinição.
const urlBanco = process.env.TEST_DATABASE_URL;

const scrypt = (senha: string, salt: string) => new Promise<string>((ok, erro) => crypto.scrypt(senha, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? erro(e) : ok(k.toString('hex'))));

test('Contábil: login com código de segurança de ponta a ponta', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco!;
  process.env.MURADE_BACKUP_MASTER_KEY = crypto.randomBytes(32).toString('hex');
  delete process.env.MURADE_2FA_OBRIGATORIO_DONO;
  const sufixo = crypto.randomBytes(3).toString('hex');
  const donoLogin = `dono${sufixo}@teste.com`; const equipeLogin = `equipe${sufixo}@teste.com`; const outroLogin = `outro${sufixo}@teste.com`;
  process.env.MURADE_DONO_SISTEMA = donoLogin;
  const express = (await import('express')).default;
  const a = await import('../../src/server/authContabil');
  const s = await import('../../src/server/segurancaLogin');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: urlBanco });
  await a.prepararAuthContabil();
  await pool.query('DELETE FROM contabil_login_falhas');
  const senha = 'uma-senha-bem-longa-123';
  const criarUsuario = async (login: string, admin: boolean, escritorio?: string) => {
    const id = crypto.randomUUID(); const salt = crypto.randomBytes(16).toString('hex');
    await pool.query('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,office_owner,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, login, salt, await scrypt(senha, salt), admin, escritorio ?? null, escritorio ?? (admin ? id : null)]);
    return id;
  };
  const donoId = await criarUsuario(donoLogin, true);
  const equipeId = await criarUsuario(equipeLogin, false, donoId);
  const outroId = await criarUsuario(outroLogin, true);
  const equipeOutroLogin = `equipeoutro${sufixo}@teste.com`; const equipeOutroId = await criarUsuario(equipeOutroLogin, false, outroId);

  const app = express(); app.use(express.json());
  // Mesma regra de origem do server.ts (o navegador de mentira manda Origin igual ao host).
  const origemNavegador = (req: any, res: any, next: any) => { const origin = req.get('origin'); if (!origin || new URL(origin).origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ sucesso: false }); next(); };
  const proteger = a.exigirSessaoContabil;
  app.post('/api/auth/login', origemNavegador, a.loginAuthContabil);
  app.get('/api/workspaces', proteger, (_req, res) => { res.json({ ok: true }); });
  app.get('/api/auth/2fa', proteger, a.auth2faEstadoContabil);
  app.post('/api/auth/2fa/iniciar', origemNavegador, proteger, a.auth2faIniciarContabil);
  app.post('/api/auth/2fa/ativar', origemNavegador, proteger, a.auth2faAtivarContabil);
  app.post('/api/auth/2fa/desativar', origemNavegador, proteger, a.auth2faDesativarContabil);
  app.post('/api/auth/2fa/redefinir', origemNavegador, proteger, a.auth2faRedefinirContabil);
  app.get('/api/auth/2fa/resumo', proteger, a.auth2faResumoContabil);
  app.get('/api/auth/session', a.sessaoAtualContabil);
  const servidor = await new Promise<import('node:http').Server>((ok) => { const x = app.listen(0, '127.0.0.1', () => ok(x)); });
  const porta = (servidor.address() as any).port; const base = `http://127.0.0.1:${porta}`;

  // navegador de mentira: guarda cookies
  const navegador = () => {
    const jar = new Map<string, string>();
    const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
      const r = await fetch(base + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Origin: base, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      for (const c of r.headers.getSetCookie()) { const [par] = c.split(';'); const i = par.indexOf('='); const nome = par.slice(0, i); const valor = par.slice(i + 1); if (/Max-Age=0/.test(c) || valor === '') jar.delete(nome); else jar.set(nome, valor); }
      return { status: r.status, json: await r.json().catch(() => ({})) as any };
    };
    return { chamar, jar };
  };
  // O teste roda em um instante só; o relógio do código só aceita 3 passos. Para simular o tempo passando, recuamos o último passo gasto.
  const tempoPassou = (id: string, passoBase: number) => pool.query('UPDATE contabil_2fa SET ultimo_passo = $2 WHERE user_id = $1', [id, passoBase - 5]);

  try {
    // 1) dono ainda sem código: entra só com a senha, mas o sistema pede para ligar o código antes de qualquer outra coisa
    const nav = navegador();
    let r = await nav.chamar('POST', '/api/auth/login', { login: donoLogin, senha });
    assert.equal(r.status, 200); assert.equal(r.json.sucesso, true); assert.equal(r.json.precisaAtivar2fa, true); assert.equal(r.json.doisFatores, false);
    r = await nav.chamar('GET', '/api/workspaces');
    assert.equal(r.status, 403); assert.equal(r.json.precisaAtivar2fa, true, 'o resto do sistema espera');
    r = await nav.chamar('GET', '/api/auth/2fa'); assert.equal(r.status, 200); assert.equal(r.json.obrigatorio, true); assert.equal(r.json.ativo, false);

    // 2) ativar: código errado não liga, certo liga e entrega códigos de emergência
    r = await nav.chamar('POST', '/api/auth/2fa/iniciar', {}); assert.equal(r.status, 200); assert.match(r.json.qr, /^data:image\/png;base64,/); const segredo = r.json.segredo as string;
    r = await nav.chamar('POST', '/api/auth/2fa/ativar', { codigo: '000000' }); assert.equal(r.status, 400);
    const agora = Date.now(); const passo = s.passoDoInstante(agora);
    r = await nav.chamar('POST', '/api/auth/2fa/ativar', { codigo: s.codigoTotp(segredo, passo) });
    assert.equal(r.status, 200); assert.equal(r.json.codigosEmergencia.length, 8); const emergencia = r.json.codigosEmergencia as string[];
    assert.ok(nav.jar.has(s.NOME_COOKIE_APARELHO), 'o aparelho que ativou já fica confiável');
    r = await nav.chamar('GET', '/api/workspaces'); assert.equal(r.status, 200, 'depois de ligar, o sistema libera');
    r = await nav.chamar('POST', '/api/auth/2fa/desativar', { senha, codigo: '123456' }); assert.equal(r.status, 409, 'dono não pode desligar');
    assert.match(r.json.motivo, /obrigatório/);

    // 3) mesmo aparelho (cookie de aparelho) entra só com a senha
    const mesmo = navegador(); mesmo.jar.set(s.NOME_COOKIE_APARELHO, nav.jar.get(s.NOME_COOKIE_APARELHO)!);
    r = await mesmo.chamar('POST', '/api/auth/login', { login: donoLogin, senha }); assert.equal(r.status, 200); assert.equal(r.json.doisFatores, true); assert.equal(r.json.precisaAtivar2fa, false);

    // 4) aparelho novo: senha sozinha não basta; código errado falha; código certo entra e deixa o aparelho confiável
    const novo = navegador();
    r = await novo.chamar('POST', '/api/auth/login', { login: donoLogin, senha }); assert.equal(r.status, 401); assert.equal(r.json.precisaCodigo, true);
    assert.equal(novo.jar.has('murade_contabil_session'), false, 'sem código não existe sessão');
    r = await novo.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: '111111' }); assert.equal(r.status, 401); assert.equal(r.json.precisaCodigo, true);
    assert.equal(novo.jar.has('murade_contabil_session'), false);
    r = await novo.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: s.codigoTotp(segredo, passo) }); assert.equal(r.status, 401, 'o código usado na ativação não vale de novo');
    await tempoPassou(donoId, passo);
    r = await novo.chamar('POST', '/api/auth/login', { login: donoLogin, senha: 'senha-errada-123', codigo: s.codigoTotp(segredo, passo) }); assert.equal(r.status, 401, 'código certo com senha errada não entra');
    r = await novo.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: s.codigoTotp(segredo, passo) }); assert.equal(r.status, 200); assert.ok(novo.jar.has('murade_contabil_session')); assert.ok(novo.jar.has(s.NOME_COOKIE_APARELHO));
    r = await novo.chamar('GET', '/api/workspaces'); assert.equal(r.status, 200);
    const semConfiar = navegador();
    await tempoPassou(donoId, passo);
    r = await semConfiar.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: s.codigoTotp(segredo, passo), confiarAparelho: false }); assert.equal(r.status, 200); assert.equal(semConfiar.jar.has(s.NOME_COOKIE_APARELHO), false, 'quem não quer confiar no aparelho, não ganha o cookie');
    // código de emergência
    const emerg = navegador();
    r = await emerg.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: emergencia[0] }); assert.equal(r.status, 200);
    const emerg2 = navegador();
    r = await emerg2.chamar('POST', '/api/auth/login', { login: donoLogin, senha, codigo: emergencia[0] }); assert.equal(r.status, 401, 'emergência vale uma vez');

    // 5) redefinir: equipe do escritório não pode; administrador de outro escritório não pode; o dono pode
    const equipe = navegador(); r = await equipe.chamar('POST', '/api/auth/login', { login: equipeLogin, senha }); assert.equal(r.status, 200); assert.equal(r.json.precisaAtivar2fa, false, 'equipe: opcional');
    r = await equipe.chamar('POST', '/api/auth/2fa/redefinir', { login: donoLogin }); assert.equal(r.status, 403);
    const outro = navegador(); r = await outro.chamar('POST', '/api/auth/login', { login: outroLogin, senha }); assert.equal(r.status, 200); assert.equal(r.json.precisaAtivar2fa, false, 'escritório cliente: opcional');
    r = await outro.chamar('POST', '/api/auth/2fa/redefinir', { login: donoLogin }); assert.equal(r.status, 403);
    // equipe liga o próprio código e o dono do sistema redefine
    r = await equipe.chamar('POST', '/api/auth/2fa/iniciar', {}); const segEquipe = r.json.segredo as string;
    r = await equipe.chamar('POST', '/api/auth/2fa/ativar', { codigo: s.codigoTotp(segEquipe, passo) }); assert.equal(r.status, 200);
    const noEquipe = navegador(); r = await noEquipe.chamar('POST', '/api/auth/login', { login: equipeLogin, senha }); assert.equal(r.status, 401, 'equipe com código ligado também precisa dele'); assert.equal(r.json.precisaCodigo, true);
    // administrador do escritório redefine a equipe dele
    r = await nav.chamar('POST', '/api/auth/2fa/redefinir', { login: equipeLogin }); assert.equal(r.status, 200);
    r = await noEquipe.chamar('POST', '/api/auth/login', { login: equipeLogin, senha }); assert.equal(r.status, 200, 'redefinido: entra só com a senha');
    // a própria equipe pode desligar com senha + código
    r = await noEquipe.chamar('POST', '/api/auth/2fa/iniciar', {}); const seg2 = r.json.segredo as string;
    r = await noEquipe.chamar('POST', '/api/auth/2fa/ativar', { codigo: s.codigoTotp(seg2, passo) }); assert.equal(r.status, 200);
    await tempoPassou(equipeId, passo);
    r = await noEquipe.chamar('POST', '/api/auth/2fa/desativar', { senha: 'errada-errada-123', codigo: s.codigoTotp(seg2, passo) }); assert.equal(r.status, 400);
    r = await noEquipe.chamar('POST', '/api/auth/2fa/desativar', { senha, codigo: s.codigoTotp(seg2, passo) }); assert.equal(r.status, 200);
    r = await noEquipe.chamar('GET', '/api/auth/2fa'); assert.equal(r.json.ativo, false);

    // 5b) administrador de OUTRO escritório redefine só a própria equipe; nunca a do dono nem o dono
    r = await outro.chamar('POST', '/api/auth/2fa/redefinir', { login: equipeLogin }); assert.equal(r.status, 403, 'equipe de outro escritório');
    r = await outro.chamar('POST', '/api/auth/2fa/redefinir', { login: equipeOutroLogin }); assert.equal(r.status, 200, 'a própria equipe pode');
    r = await outro.chamar('POST', '/api/auth/2fa/redefinir', { login: `naoexiste${sufixo}@teste.com` }); assert.equal(r.status, 403);
    // sessão informa o estado do código; resumo é só do dono
    r = await nav.chamar('GET', '/api/auth/session'); assert.equal(r.json.doisFatores, true); assert.equal(r.json.doisFatoresDisponivel, true); assert.equal(r.json.precisaAtivar2fa, false);
    r = await nav.chamar('GET', '/api/auth/2fa/resumo'); assert.equal(r.status, 200); assert.equal(typeof r.json.texto, 'string'); assert.deepEqual(r.json.donosSemCodigo, []);
    r = await noEquipe.chamar('GET', '/api/auth/2fa/resumo'); assert.equal(r.status, 403, 'resumo é só do dono do sistema');
    // robô conferidor: dono sem código vira alerta (e só lê)
    await pool.query('DELETE FROM contabil_2fa WHERE user_id = $1', [donoId]);
    let resumoRobo = await a.resumoSegurancaContabil(1); assert.equal(resumoRobo.alerta, true); assert.deepEqual(resumoRobo.donosSemCodigo, [donoLogin]);
    // saída de emergência: com MURADE_2FA_OBRIGATORIO_DONO=nao o dono não é trancado nem alertado
    process.env.MURADE_2FA_OBRIGATORIO_DONO = 'nao';
    const semExigencia = navegador(); r = await semExigencia.chamar('POST', '/api/auth/login', { login: donoLogin, senha }); assert.equal(r.status, 200); assert.equal(r.json.precisaAtivar2fa, false);
    r = await semExigencia.chamar('GET', '/api/workspaces'); assert.equal(r.status, 200);
    resumoRobo = await a.resumoSegurancaContabil(1); assert.deepEqual(resumoRobo.donosSemCodigo, []);
    delete process.env.MURADE_2FA_OBRIGATORIO_DONO;
    // sem a chave-mestra o recurso fica indisponível e nada trava (nem a exigência do dono)
    const chaveGuardada = process.env.MURADE_BACKUP_MASTER_KEY; delete process.env.MURADE_BACKUP_MASTER_KEY;
    const semChave = navegador(); r = await semChave.chamar('POST', '/api/auth/login', { login: donoLogin, senha }); assert.equal(r.status, 200); assert.equal(r.json.doisFatoresDisponivel, false); assert.equal(r.json.precisaAtivar2fa, false);
    r = await semChave.chamar('GET', '/api/workspaces'); assert.equal(r.status, 200);
    r = await semChave.chamar('POST', '/api/auth/2fa/iniciar', {}); assert.equal(r.status, 503);
    process.env.MURADE_BACKUP_MASTER_KEY = chaveGuardada;

    // 6) bloqueio: 8 senhas erradas do mesmo aparelho trancam, mesmo com a senha certa depois; vale também depois de "reiniciar" (está no banco)
    await pool.query('DELETE FROM contabil_login_falhas'); // todos os testes saem do mesmo IP; recomeça a contagem
    const forca = navegador();
    for (let i = 0; i < 8; i++) { r = await forca.chamar('POST', '/api/auth/login', { login: outroLogin, senha: `errada-${i}-errada` }); assert.equal(r.status, 401); }
    r = await forca.chamar('POST', '/api/auth/login', { login: outroLogin, senha }); assert.equal(r.status, 429); assert.match(r.json.motivo, /15 minutos/);
    const resumo = await s.resumirSeguranca((q, p) => pool.query(q, p as any), 'contabil', 1);
    assert.ok(resumo.bloqueios >= 1 && resumo.senhasErradas >= 8);
    // nada do que foi pedido apareceu com e-mail inteiro no registro
    const eventos = await pool.query("SELECT login FROM contabil_eventos_seguranca WHERE login IS NOT NULL");
    assert.ok(eventos.rows.every((l) => /\*\*\*/.test(String(l.login))), 'o registro só tem e-mail mascarado');
  } finally {
    servidor.close();
    await pool.query('DELETE FROM contabil_auth_users WHERE id = ANY($1::uuid[])', [[donoId, equipeId, outroId, equipeOutroId]]);
    await pool.query('DELETE FROM contabil_login_falhas');
    await pool.end();
  }
});
