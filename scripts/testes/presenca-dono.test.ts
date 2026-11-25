import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { ATIVO_ATE_SEG, ONLINE_ATE_SEG, criarPresencaDono, dataHoraBrasilia, limparTela, montarPainelPresenca, sinaisValidos, situacaoPresenca, type SinalPresenca } from '../../src/server/presencaDono';
import { SQL_ESCRITORIOS_CONTABIL, SQL_ORFAOS_CONTABIL, SQL_SINAIS_CONTABIL, agruparEscritorios } from '../../src/server/presencaDonoContabil';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------- partes puras
test('bolinha: verde até 2 min, amarela até 15 min, cinza depois com DD/MM HH:MM de Brasília', () => {
  const agora = new Date('2026-11-25T04:10:00Z'); // 01:10 em Brasília
  const antes = (seg: number) => new Date(agora.getTime() - seg * 1000);
  assert.deepEqual(situacaoPresenca(antes(10), agora), { estado: 'online', texto: 'Online agora' });
  assert.equal(situacaoPresenca(antes(ONLINE_ATE_SEG), agora).estado, 'online');
  assert.deepEqual(situacaoPresenca(antes(ONLINE_ATE_SEG + 1), agora), { estado: 'ativo', texto: 'Ativo há 2 min' });
  assert.deepEqual(situacaoPresenca(antes(7 * 60 + 30), agora), { estado: 'ativo', texto: 'Ativo há 7 min' });
  assert.equal(situacaoPresenca(antes(ATIVO_ATE_SEG), agora).estado, 'ativo');
  assert.deepEqual(situacaoPresenca(antes(ATIVO_ATE_SEG + 1), agora), { estado: 'offline', texto: 'Offline — visto por último em 25/11 00:54' });
  assert.deepEqual(situacaoPresenca(null, agora), { estado: 'offline', texto: 'Offline — ainda não entrou' });
  assert.equal(situacaoPresenca('lixo', agora).estado, 'offline');
  // Virada do dia em Brasília (UTC-3): 02:30 UTC ainda é 23:30 do dia anterior.
  assert.equal(dataHoraBrasilia(new Date('2026-11-25T02:30:00Z')), '24/11 23:30');
});

test('nome da tela: só texto simples e curto', () => {
  assert.equal(limparTela('Folha de Pagamento'), 'Folha de Pagamento');
  assert.equal(limparTela('Férias / 13º Salário'), 'Férias / 13º Salário');
  assert.equal(limparTela('<script>alert(1)</script>'), 'scriptalert(1)/script');
  assert.equal(limparTela('x'.repeat(200))!.length, 60);
  assert.equal(limparTela(123), null);
  assert.equal(limparTela('   '), null);
});

test('painel: conta online por escritório, junta DP/Fiscal/Contábil e mostra sistema e tela', () => {
  const agora = new Date('2026-11-25T04:10:00Z');
  const s = (login: string, sistema: SinalPresenca['sistema'], segAtras: number, tela: string | null, escritorio = 'pontualcontabilidadego@gmail.com', papel: SinalPresenca['papel'] = 'equipe'): SinalPresenca =>
    ({ escritorio, login, papel, sistema, tela, ultimaEm: new Date(agora.getTime() - segAtras * 1000).toISOString() });
  const painel = montarPainelPresenca(
    [
      { login: 'PontualContabilidadeGO@gmail.com', usuarios: [{ login: 'pontualcontabilidadego@gmail.com', papel: 'dono' }, { login: 'ana@pontual.com', papel: 'equipe' }, { login: 'beto@pontual.com', papel: 'equipe' }] },
      { login: 'outro@escritorio.com', usuarios: [{ login: 'outro@escritorio.com', papel: 'dono' }] },
    ],
    [
      s('pontualcontabilidadego@gmail.com', 'DP', 30, 'Folha de Pagamento', undefined, 'dono'),
      s('pontualcontabilidadego@gmail.com', 'Fiscal', 400, 'Notas de entrada', undefined, 'dono'),
      s('ana@pontual.com', 'Contábil', 5 * 60, 'Balancete'),
      s('beto@pontual.com', 'DP', 3 * 3600, 'Férias'),
      s('so-no-fiscal@pontual.com', 'Fiscal', 20, 'Emitir NF-e'),
      s('intruso@x.com', 'DP', 5, 'Folha', 'escritorio-que-nao-esta-na-lista@x.com'),
    ],
    agora,
  );
  const p = painel['pontualcontabilidadego@gmail.com'];
  assert.ok(p, 'chave do escritório em minúsculas');
  assert.equal(p.online, 2); // dono (DP) + quem só usa o Fiscal
  assert.equal(p.ativos, 1); // ana há 5 min
  assert.equal(p.totalUsuarios, 4);
  assert.equal(p.texto, '2 online agora');
  assert.equal(p.estado, 'online');
  const dono = p.usuarios.find((u) => u.login === 'pontualcontabilidadego@gmail.com')!;
  assert.equal(dono.papel, 'dono');
  assert.equal(dono.texto, 'Online agora');
  assert.deepEqual(dono.sistemas.map((x) => [x.sistema, x.tela, x.estado]), [['DP', 'Folha de Pagamento', 'online'], ['Fiscal', 'Notas de entrada', 'ativo']]);
  const ana = p.usuarios.find((u) => u.login === 'ana@pontual.com')!;
  assert.equal(ana.texto, 'Ativo há 5 min');
  assert.equal(ana.sistemas[0].sistema, 'Contábil');
  const beto = p.usuarios.find((u) => u.login === 'beto@pontual.com')!;
  assert.equal(beto.texto, 'Offline — visto por último em 24/11 22:10');
  // Ordem: online primeiro.
  assert.deepEqual(p.usuarios.map((u) => u.estado), ['online', 'online', 'ativo', 'offline']);
  // Escritório sem nenhum sinal.
  const outro = painel['outro@escritorio.com'];
  assert.equal(outro.online, 0);
  assert.equal(outro.texto, 'Offline — ainda não entrou');
  // Sinal de escritório que não está na lista não aparece em lugar nenhum.
  assert.equal(Object.keys(painel).length, 2);
  assert.ok(!JSON.stringify(painel).includes('intruso'));
});

test('sinais de outro sistema: confere o formato e força o sistema de quem respondeu', () => {
  const lista = sinaisValidos({ sinais: [
    { escritorio: 'A@X.COM', login: 'B@X.COM', papel: 'equipe', sistema: 'DP', tela: '<b>Notas</b>', ultimaEm: '2026-11-25T04:00:00Z' },
    { escritorio: '', login: 'c@x.com', ultimaEm: '2026-11-25T04:00:00Z' },
    { escritorio: 'a@x.com', login: 'd@x.com', ultimaEm: 'ontem' },
    'lixo', null,
  ] }, 'Fiscal');
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], { escritorio: 'a@x.com', login: 'b@x.com', papel: 'equipe', sistema: 'Fiscal', tela: 'bNotas/b', ultimaEm: '2026-11-25T04:00:00.000Z' });
  assert.deepEqual(sinaisValidos(null, 'Contábil'), []);
  assert.deepEqual(sinaisValidos({ sinais: 'x' }, 'Contábil'), []);
});

// ---------------------------------------------------------------- módulo com banco falso (sem rede)
function bancoFalso() {
  const linhas = new Map<string, any>();
  const consultas: string[] = [];
  const consultar = async (sql: string, p: unknown[] = []) => {
    consultas.push(sql);
    if (/^\s*CREATE/.test(sql)) return { rows: [] };
    if (/^\s*INSERT INTO/.test(sql)) {
      const [user_id, tenant_id, login, tela, ultima_em] = p as string[];
      const ant = linhas.get(user_id);
      linhas.set(user_id, { user_id, tenant_id, login, tela: tela ?? ant?.tela ?? null, ultima_em: ant && ant.ultima_em > ultima_em ? ant.ultima_em : ultima_em });
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT 'sinais'/.test(sql)) return { rows: [...linhas.values()].map((l) => ({ escritorio: 'esc@x.com', login: l.login, papel: 'equipe', tela: l.tela, ultima_em: l.ultima_em })) };
    if (/^\s*DELETE/.test(sql)) return { rows: [], rowCount: 0 };
    if (/count\(\*\)/.test(sql)) return { rows: [{ n: [...linhas.values()].filter((l) => l.ultima_em >= String(p[0])).length }] };
    throw new Error(`SQL inesperado: ${sql}`);
  };
  return { linhas, consultas, consultar };
}

test('sinal: grava só usuário, escritório, tela e horário; repete no máximo a cada 20 s, salvo troca de tela; nunca lança erro', async () => {
  let t = new Date('2026-11-25T04:00:00Z');
  const b = bancoFalso();
  const pd = criarPresencaDono({ sistema: 'DP', consultar: b.consultar, tabela: 'dp_presenca_dono', sqlSinais: "SELECT 'sinais'", listarEscritorios: async () => [], outros: [], token: () => undefined, agora: () => t });
  assert.equal(await pd.registrarSinal({ userId: 'u1', tenantId: 't1', login: 'Ana@X.com' }, 'Folha de Pagamento'), true);
  assert.deepEqual(Object.keys(b.linhas.get('u1')).sort(), ['login', 'tela', 'tenant_id', 'ultima_em', 'user_id']);
  assert.equal(b.linhas.get('u1').login, 'ana@x.com');
  t = new Date(t.getTime() + 5_000);
  assert.equal(await pd.registrarSinal({ userId: 'u1', tenantId: 't1', login: 'ana@x.com' }, 'Folha de Pagamento'), false, 'colado: não grava');
  assert.equal(await pd.registrarSinal({ userId: 'u1', tenantId: 't1', login: 'ana@x.com' }, 'Férias'), true, 'trocou de tela: grava logo');
  assert.equal(b.linhas.get('u1').tela, 'Férias');
  t = new Date(t.getTime() + 25_000);
  assert.equal(await pd.registrarSinal({ userId: 'u1', tenantId: 't1', login: 'ana@x.com' }, undefined), true);
  assert.equal(b.linhas.get('u1').tela, 'Férias', 'sinal sem tela mantém a última');
  assert.equal(await pd.registrarSinal(undefined, 'x'), false);
  const quebrado = criarPresencaDono({ sistema: 'DP', consultar: async () => { throw new Error('banco fora'); }, tabela: 't', sqlSinais: '', listarEscritorios: async () => [], outros: [], token: () => undefined });
  assert.equal(await quebrado.registrarSinal({ userId: 'u', tenantId: 't', login: 'l' }, 'x'), false);
});

test('outros sistemas: manda o token, junta os sinais e avisa quem não respondeu (sem derrubar o painel)', async () => {
  const t = new Date('2026-11-25T04:00:00Z');
  const b = bancoFalso();
  const chamadas: Array<{ url: string; auth: string | null }> = [];
  const buscar = (async (url: URL | string, init?: RequestInit) => {
    chamadas.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
    if (String(url).startsWith('https://fiscal.test')) return new Response(JSON.stringify({ sucesso: true, sinais: [{ escritorio: 'esc@x.com', login: 'ana@x.com', papel: 'equipe', tela: 'Notas de entrada', ultimaEm: new Date(t.getTime() - 30_000).toISOString() }] }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const pd = criarPresencaDono({ sistema: 'DP', consultar: b.consultar, tabela: 'dp_presenca_dono', sqlSinais: "SELECT 'sinais'", listarEscritorios: async () => [{ login: 'esc@x.com', usuarios: [{ login: 'esc@x.com', papel: 'dono' }, { login: 'ana@x.com', papel: 'equipe' }] }], outros: [{ sistema: 'Fiscal', url: 'https://fiscal.test' }, { sistema: 'Contábil', url: 'https://contabil.test' }], token: () => 'segredo', agora: () => t, buscar });
  const r = await pd.painel();
  assert.deepEqual(chamadas.map((c) => c.url).sort(), ['https://contabil.test/api/integracao/presenca-dono', 'https://fiscal.test/api/integracao/presenca-dono']);
  assert.ok(chamadas.every((c) => c.auth === 'Bearer segredo'));
  assert.deepEqual(r.sistemas.find((s) => s.sistema === 'DP'), { sistema: 'DP', ok: true });
  assert.deepEqual(r.sistemas.find((s) => s.sistema === 'Fiscal'), { sistema: 'Fiscal', ok: true });
  assert.deepEqual(r.sistemas.find((s) => s.sistema === 'Contábil'), { sistema: 'Contábil', ok: false, motivo: 'ainda sem esta função publicada' });
  const ana = r.escritorios['esc@x.com'].usuarios.find((u) => u.login === 'ana@x.com')!;
  assert.equal(ana.estado, 'online');
  assert.deepEqual(ana.sistemas.map((s) => [s.sistema, s.tela]), [['Fiscal', 'Notas de entrada']]);
  assert.equal(r.escritorios['esc@x.com'].online, 1);
  // Sem token: nem tenta a rede.
  const semToken = criarPresencaDono({ sistema: 'DP', consultar: b.consultar, tabela: 'dp_presenca_dono', sqlSinais: "SELECT 'sinais'", listarEscritorios: async () => [], outros: [{ sistema: 'Fiscal', url: 'https://fiscal.test' }], token: () => undefined, buscar: (async () => { throw new Error('não devia chamar'); }) as typeof fetch });
  assert.deepEqual((await semToken.sinaisDosOutros()).sistemas, [{ sistema: 'Fiscal', ok: false, motivo: 'integração não configurada' }]);
});

// ---------------------------------------------------------------- banco de verdade (TEST_DATABASE_URL)
const urlBanco = process.env.TEST_DATABASE_URL;
test('banco real: SQL do Contábil junta escritório e papel, some com usuário excluído e o robô limpa', { skip: !urlBanco && 'TEST_DATABASE_URL não definido' }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: urlBanco });
  const esquema = `t_presdono_${crypto.randomBytes(4).toString('hex')}`;
  const cliente = await pool.connect();
  try {
    await cliente.query(`CREATE SCHEMA ${esquema}; SET search_path TO ${esquema}`);
    await cliente.query(`CREATE TABLE contabil_auth_users (id uuid PRIMARY KEY, login text NOT NULL, global_admin boolean NOT NULL DEFAULT false, office_owner uuid, tenant_id uuid, disabled boolean NOT NULL DEFAULT false)`);
    const esc = crypto.randomUUID(); const ana = crypto.randomUUID(); const cli = crypto.randomUUID(); const dono = crypto.randomUUID();
    await cliente.query(`INSERT INTO contabil_auth_users (id, login, global_admin, office_owner, tenant_id) VALUES
      ($1, 'pontualcontabilidadego@gmail.com', true, NULL, $1), ($2, 'ana@pontual.com', false, $1, $1), ($3, 'cliente@padaria.com', false, NULL, $1), ($4, 'dono@murad.com', true, NULL, $4)`, [esc, ana, cli, dono]);
    const consultar = (sql: string, p?: unknown[]) => cliente.query(sql, p as any[]);
    let t = new Date();
    const pd = criarPresencaDono({ sistema: 'Contábil', consultar, tabela: 'contabil_presenca_dono', sqlSinais: SQL_SINAIS_CONTABIL, sqlOrfaos: SQL_ORFAOS_CONTABIL, listarEscritorios: async () => agruparEscritorios((await consultar(SQL_ESCRITORIOS_CONTABIL)).rows), outros: [], token: () => undefined, agora: () => t });
    assert.equal(await pd.registrarSinal({ userId: esc, tenantId: esc, login: 'pontualcontabilidadego@gmail.com' }, 'Folha de Pagamento'), true);
    assert.equal(await pd.registrarSinal({ userId: ana, tenantId: esc, login: 'ana@pontual.com' }, 'Férias'), true);
    t = new Date(t.getTime() - 20 * 60_000); // sinal antigo do cliente (20 min atrás)
    assert.equal(await pd.registrarSinal({ userId: cli, tenantId: esc, login: 'cliente@padaria.com' }, 'Holerites'), true);
    t = new Date();
    const cols = (await cliente.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='contabil_presenca_dono' ORDER BY column_name`, [esquema])).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['login', 'tela', 'tenant_id', 'ultima_em', 'user_id'], 'só o necessário');
    const r = await pd.painel();
    const p = r.escritorios['pontualcontabilidadego@gmail.com'];
    assert.equal(p.online, 2);
    assert.equal(p.totalUsuarios, 3);
    assert.deepEqual(p.usuarios.map((u) => [u.login, u.papel, u.estado]), [['pontualcontabilidadego@gmail.com', 'dono', 'online'], ['ana@pontual.com', 'equipe', 'online'], ['cliente@padaria.com', 'cliente', 'offline']]);
    assert.equal(p.usuarios[1].sistemas[0].tela, 'Férias');
    assert.match(p.usuarios[2].texto, /^Offline — visto por último em \d{2}\/\d{2} \d{2}:\d{2}$/);
    assert.ok(r.escritorios['dono@murad.com'], 'lista também o escritório do dono (o painel mostra só os da lista de clientes)');
    // Uma linha por usuário: sobrescreve, não vira histórico.
    t = new Date(t.getTime() + 60_000);
    await pd.registrarSinal({ userId: ana, tenantId: esc, login: 'ana@pontual.com' }, 'Rescisão');
    assert.equal(Number((await cliente.query(`SELECT count(*)::int AS n FROM contabil_presenca_dono WHERE user_id=$1`, [ana])).rows[0].n), 1);
    // Excluir usuário: some do painel e o robô apaga o sinal (o e-mail pode ser cadastrado de novo).
    await cliente.query(`DELETE FROM contabil_auth_users WHERE id=$1`, [ana]);
    assert.equal((await pd.painel()).escritorios['pontualcontabilidadego@gmail.com'].usuarios.some((u) => u.login === 'ana@pontual.com'), false);
    const c = await pd.conferir();
    assert.equal(c.orfaos, 1);
    assert.equal(c.online, 1);
  } finally {
    await cliente.query(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`).catch(() => undefined);
    cliente.release(); await pool.end();
  }
});

// ---------------------------------------------------------------- rotas e acesso
test('Contábil: rotas protegidas — painel só do dono do sistema, integração só com token, sinal só com login', () => {
  const server = readFileSync('server.ts', 'utf8');
  assert.match(server, /app\.get\("\/api\/auth\/tenants\/presenca", exigirSessaoContabil,[\s\S]{0,200}donoSistema !== true\) return res\.status\(403\)/);
  assert.match(server, /app\.get\("\/api\/integracao\/presenca-dono"[\s\S]{0,300}tokenValido\(req\.header\("authorization"\), token\)/);
  assert.match(server, /app\.post\("\/api\/auth\/presenca", exigirOrigemNavegador, exigirSessaoContabil/);
  // O sinal é gravado só quando a resposta termina bem e há sessão (depois de exigirSessaoContabil).
  assert.match(server, /res\.on\("finish"[\s\S]{0,200}if \(s && res\.statusCode < 400\) void presencaDono\.registrarSinal\(/);
  // As rotas que usam exigirOrigemNavegador vêm depois da definição dele (sem erro na partida).
  assert.ok(server.indexOf('const exigirOrigemNavegador') < server.indexOf('app.post("/api/auth/presenca"'));
});
