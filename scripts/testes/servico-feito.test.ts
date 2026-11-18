import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { criarGuardaServico, criarServicoFeito, decidir, dataHoraBR, resumoReferencias, TEMPO_FAZENDO_MS, type RegistroServico } from '../../src/server/servicoFeito';
import { conferirBackupsEscritorios } from '../../src/server/conferidorBackupsContabil';

const T0 = new Date('2026-11-17T16:37:00Z'); // 13:37 em Brasília
const base = (o: Partial<RegistroServico> = {}): RegistroServico => ({
  tenantId: 'T1', chave: 'fechamento:periodo|X|2026-10', tipo: 'fechamento:periodo', cnpj: 'X', referencia: '2026-10', estado: 'concluido',
  porUserId: 'u-malba', porLogin: 'malba@x.com', porNome: 'Malba', porOrigem: 'pessoa', em: T0, expiraEm: null, detalhe: null, atualizadoEm: T0, ...o,
});
const nilva = { userId: 'u-nilva', login: 'nilva@x.com', nome: 'Nilva' };
const depois = (min: number) => new Date(T0.getTime() + min * 60_000);

test('decidir: sem registro e falhou liberam', () => {
  assert.equal(decidir(null, nilva, T0).acao, 'liberar');
  assert.equal(decidir(undefined, nilva, T0).acao, 'liberar');
  assert.equal(decidir(base({ estado: 'falhou' }), nilva, T0).acao, 'liberar');
});
test('decidir: concluído bloqueia com nome, data e hora de Brasília', () => {
  const d = decidir(base(), nilva, depois(5));
  assert.equal(d.acao, 'bloquear_ja_feito');
  assert.equal(d.mensagem, 'Malba já fechou isto em 17/11 às 13:37. Não precisa fazer de novo.');
  assert.equal(d.feitoPor, 'Malba');
});
test('decidir: sem nome guardado usa o login; robô vira "O robô"; a própria pessoa vira "Você"', () => {
  assert.match(decidir(base({ porNome: null }), nilva, T0).mensagem, /^malba@x\.com já fechou/);
  assert.match(decidir(base({ porOrigem: 'robo', porNome: null, porLogin: 'robo' }), nilva, T0).mensagem, /^O robô já fez isto em 17\/11 às 13:37/);
  assert.match(decidir(base(), { userId: 'u-malba', login: 'malba@x.com' }, T0).mensagem, /^Você já fechou/);
});
test('decidir: fazendo por outra pessoa avisa; vencido ou da própria pessoa libera', () => {
  const fazendo = base({ estado: 'fazendo', em: T0, expiraEm: new Date(T0.getTime() + TEMPO_FAZENDO_MS), porNome: 'Nilva', porUserId: 'u-nilva' });
  const d = decidir(fazendo, { userId: 'u-malba', login: 'm' }, depois(3));
  assert.equal(d.acao, 'avisar_fazendo');
  assert.equal(d.mensagem, 'Nilva está fechando isto agora (desde 13:37).');
  assert.equal(decidir(fazendo, nilva, depois(3)).acao, 'liberar');
  assert.equal(decidir(fazendo, { userId: 'u-malba', login: 'm' }, depois(16)).acao, 'liberar');
  assert.match(decidir({ ...fazendo, porOrigem: 'robo', porUserId: null }, nilva, depois(1)).mensagem, /^O robô está fechando isto agora/);
});
test('dataHoraBR usa o fuso de Brasília', () => assert.equal(dataHoraBR(new Date('2026-11-17T02:30:00Z')), '16/11 às 23:30'));

// Banco falso mínimo: entende só as consultas deste módulo.
function bancoFalso() {
  const linhas = new Map<string, any>(); let derrubado = false;
  const consultar = async (sql: string, p: unknown[] = []) => {
    if (derrubado) throw new Error('banco fora do ar');
    if (/CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/^\s*SELECT \* FROM contabil_servico_registro WHERE tenant_id=\$1 AND chave=\$2/i.test(sql)) { const l = linhas.get(`${p[0]}|${p[1]}`); return { rows: l ? [l] : [] }; }
    if (/^\s*INSERT/i.test(sql)) {
      const k = `${p[0]}|${p[1]}`; const antes = linhas.get(k);
      linhas.set(k, { tenant_id: p[0], chave: p[1], tipo: p[2], cnpj: p[3], referencia: p[4], estado: p[5], por_user_id: p[6], por_login: p[7], por_nome: p[8], por_origem: p[9], em: p[5] === 'fazendo' || !antes ? p[10] : antes.em, expira_em: p[11], detalhe: p[12] ?? antes?.detalhe ?? null, atualizado_em: p[10] });
      return { rows: [] };
    }
    if (/^\s*UPDATE/i.test(sql)) { let n = 0; for (const l of linhas.values()) if (l.estado === 'fazendo' && l.expira_em && l.expira_em <= p[0]) { l.estado = 'falhou'; n++; } return { rows: [], rowCount: n }; }
    if (/^\s*DELETE/i.test(sql)) { let n = 0; for (const [k, l] of linhas) if (l.atualizado_em < (p[0] as Date)) { linhas.delete(k); n++; } return { rows: [], rowCount: n }; }
    if (/^\s*SELECT \*/i.test(sql)) return { rows: [...linhas.values()].filter((l) => l.tenant_id === p[0] && l.estado !== 'falhou') };
    return { rows: [] };
  };
  return { consultar, linhas, derrubar: () => { derrubado = true; } };
}

async function subir(banco: ReturnType<typeof bancoFalso>, opcoes: { handler?: express.RequestHandler } = {}) {
  const servico = criarServicoFeito(banco.consultar);
  const usuarios: Record<string, any> = {
    malba: { userId: 'u-malba', login: 'malba@x.com', tenantId: 'T1', administrador: true },
    nilva: { userId: 'u-nilva', login: 'nilva@x.com', tenantId: 'T1', administrador: false },
    outra: { userId: 'u-out', login: 'o@y.com', tenantId: 'T2', administrador: true },
  };
  const nomes: Record<string, string> = { 'u-malba': 'Malba', 'u-nilva': 'Nilva' };
  const guarda = criarGuardaServico({ servico, sessao: (req) => usuarios[String(req.headers['x-u'])], nomeDe: async (id) => nomes[id] ?? null })({
    tipo: 'fechamento:periodo', chave: (req) => ({ cnpj: 'X', referencia: String(req.body?.competencia) }),
  });
  const app = express(); app.use(express.json());
  let execucoes = 0;
  app.post('/f', guarda, opcoes.handler ?? ((_req, res) => { execucoes += 1; res.status(201).json({ sucesso: true }); }));
  const srv = await new Promise<import('node:http').Server>((ok) => { const s = app.listen(0, () => ok(s)); });
  const porta = (srv.address() as any).port;
  const chamar = async (quem: string, corpo: any = { competencia: '2026-10' }) => { const r = await fetch(`http://127.0.0.1:${porta}/f`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-u': quem }, body: JSON.stringify(corpo) }); return { status: r.status, corpo: await r.json() as any }; };
  const esperar = () => new Promise((ok) => setTimeout(ok, 30));
  return { chamar, esperar, servico, execucoes: () => execucoes, fechar: () => srv.close() };
}

test('ponto guardado: Malba fecha, Nilva tenta e recebe 409 com o nome; falha libera; outro escritório não é afetado', async () => {
  const banco = bancoFalso(); const s = await subir(banco);
  try {
    const a = await s.chamar('malba'); assert.equal(a.status, 201); await s.esperar();
    const b = await s.chamar('nilva');
    assert.equal(b.status, 409);
    assert.equal(b.corpo.codigo, 'servico_ja_feito');
    assert.match(b.corpo.motivo, /^Malba já fechou isto em \d\d\/\d\d às \d\d:\d\d\. Não precisa fazer de novo\.$/);
    assert.equal(b.corpo.feitoPor, 'Malba'); assert.ok(b.corpo.feitoEm);
    assert.equal(b.corpo.podeRefazer, false);
    assert.equal(s.execucoes(), 1, 'o serviço de Nilva não pode ter rodado');
    const o = await s.chamar('outra'); assert.equal(o.status, 201, 'tenant diferente não é barrado'); // isolamento
    const outroMes = await s.chamar('nilva', { competencia: '2026-11' }); assert.equal(outroMes.status, 201);
  } finally { s.fechar(); }
});

test('ponto guardado: "fazendo" avisa com confirmação; confirmar segue; falha do serviço libera depois', async () => {
  const banco = bancoFalso(); let liberar: () => void = () => undefined; let primeira = true;
  const s = await subir(banco, { handler: (_req, res) => { if (primeira) { primeira = false; return void (liberar = () => res.status(503).json({ sucesso: false })); } res.status(201).json({ sucesso: true }); } });
  try {
    const emAndamento = s.chamar('malba'); await s.esperar();
    const aviso = await s.chamar('nilva');
    assert.equal(aviso.status, 409); assert.equal(aviso.corpo.codigo, 'servico_em_andamento'); assert.equal(aviso.corpo.requerConfirmacao, true);
    assert.match(aviso.corpo.motivo, /^Malba está fechando isto agora \(desde \d\d:\d\d\)\.$/);
    const forcado = await s.chamar('nilva', { competencia: '2026-10', confirmarFazendo: true }); assert.equal(forcado.status, 201);
    liberar(); assert.equal((await emAndamento).status, 503); await s.esperar();
    // A Nilva concluiu depois que a Malba falhou: o registro final é dela (concluído) e a Malba é barrada com o nome dela.
    const m = await s.chamar('malba'); assert.equal(m.status, 409); assert.match(m.corpo.motivo, /^Nilva já fechou/);
  } finally { s.fechar(); }
});

test('refazer não é aceito em ponto que não o permite, mesmo enviado pelo administrador', async () => {
  const banco = bancoFalso(); const s = await subir(banco);
  try {
    await s.chamar('malba'); await s.esperar();
    const r = await s.chamar('malba', { competencia: '2026-10', refazer: true, motivoRefazer: 'conferir' });
    assert.equal(r.status, 409);
  } finally { s.fechar(); }
});

test('fail-open: banco fora do ar não impede o serviço', async () => {
  const banco = bancoFalso(); const s = await subir(banco); banco.derrubar();
  try { const r = await s.chamar('nilva'); assert.equal(r.status, 201); assert.ok(s.servico.contadores.liberadosPorFalha > 0); } finally { s.fechar(); }
});

test('refazer: administrador com motivo passa; não administrador é barrado; sem motivo é recusado', async () => {
  const banco = bancoFalso(); const servico = criarServicoFeito(banco.consultar);
  const usuarios: Record<string, any> = { malba: { userId: 'u-malba', login: 'm', tenantId: 'T1', administrador: true }, nilva: { userId: 'u-nilva', login: 'n', tenantId: 'T1', administrador: false } };
  const guarda = criarGuardaServico({ servico, sessao: (req) => usuarios[String(req.headers['x-u'])], nomeDe: async () => null })({ tipo: 'fechamento:periodo', permiteRefazer: true, chave: () => ({ cnpj: 'X', referencia: '2026-10' }) });
  const app = express(); app.use(express.json()); app.post('/f', guarda, (_q, r) => void r.status(201).json({ sucesso: true }));
  const srv = await new Promise<import('node:http').Server>((ok) => { const s = app.listen(0, () => ok(s)); });
  const chamar = async (q: string, c: any = {}) => { const r = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/f`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-u': q }, body: JSON.stringify(c) }); return { status: r.status, corpo: await r.json() as any }; };
  try {
    assert.equal((await chamar('malba')).status, 201); await new Promise((ok) => setTimeout(ok, 30));
    const b = await chamar('nilva'); assert.equal(b.status, 409);
    assert.equal((await chamar('nilva', { refazer: true, motivoRefazer: 'retificar' })).status, 403);
    assert.equal((await chamar('malba', { refazer: true })).status, 400);
    assert.equal((await chamar('malba', { refazer: true, motivoRefazer: 'retificar saldo' })).status, 201);
  } finally { srv.close(); }
});

test('robô: pula quando uma pessoa já concluiu e conta; sem pessoa, faz e registra concluído por robô', async () => {
  const banco = bancoFalso(); const servico = criarServicoFeito(banco.consultar);
  const def = { chave: 'backup:escritorio||2026-11', tipo: 'backup:escritorio', referencia: '2026-11' };
  await servico.gravar('T1', def, 'concluido', { userId: 'u-malba', login: 'm', nome: 'Malba', origem: 'pessoa' });
  let rodou = 0;
  const pulou = await servico.executarComoRobo('T1', def, async () => { rodou += 1; });
  assert.deepEqual(pulou, { pulado: true, por: 'Malba' }); assert.equal(rodou, 0);
  const outro = { ...def, chave: 'backup:escritorio||2026-12', referencia: '2026-12' };
  const fez = await servico.executarComoRobo('T1', outro, async () => { rodou += 1; return 7; });
  assert.deepEqual(fez, { pulado: false, valor: 7 }); assert.equal(rodou, 1);
  const reg = await servico.ler('T1', outro.chave); assert.equal(reg?.porOrigem, 'robo'); assert.equal(reg?.estado, 'concluido');
  assert.match(decidir(reg, nilva, new Date()).mensagem, /^O robô já fez isto/);
  await assert.rejects(servico.executarComoRobo('T1', { ...def, chave: 'k3' }, async () => { throw new Error('x'); }));
  assert.equal((await servico.ler('T1', 'k3'))?.estado, 'falhou');
});

test('robô de backups mensais não refaz o que uma pessoa já gerou (e continua mandando o aviso)', async () => {
  // Reaproveita o gancho: com o banco falso o gerador real não roda; o caminho de pulo precisa achar o backup pronto.
  const registroBackup = { id: 'b1', tenant_id: 'T1', periodo: '2026-11', nome_arquivo: 'a', tamanho_bytes: 1, checksum_sha256: 'c', tabelas: {}, status: 'ok', verificado: true, email_enviado: true, erro: null, criado_em: new Date() };
  const consultar = async (sql: string) => (/FROM murade_contabil_backups/i.test(sql) && /SELECT/i.test(sql) ? { rows: [registroBackup] } : { rows: [] });
  let perguntou = 0;
  const r = await conferirBackupsEscritorios(consultar, [{ id: 'T1', cnpjs: ['X'] }], new Date('2026-11-17T12:00:00Z'), { jaFeitoPorPessoa: async () => { perguntou += 1; return true; } });
  assert.equal(perguntou, 1);
  assert.equal(r.falhas, 0);
});

test('manutenção: vence "fazendo" esquecido e apaga registros com mais de 120 dias', async () => {
  const banco = bancoFalso(); let agora = new Date('2026-01-01T00:00:00Z');
  const servico = criarServicoFeito(banco.consultar, { agora: () => agora });
  const u = { userId: 'u', login: 'l', nome: 'N', origem: 'pessoa' as const };
  await servico.gravar('T1', { chave: 'a', tipo: 'fechamento:periodo' }, 'fazendo', u);
  await servico.gravar('T1', { chave: 'b', tipo: 'fechamento:periodo' }, 'concluido', u);
  agora = new Date('2026-01-01T00:20:00Z');
  const m1 = await servico.manter(); assert.equal(m1.expirados, 1); assert.equal(m1.apagados, 0);
  agora = new Date('2026-06-01T00:00:00Z');
  const m2 = await servico.manter(); assert.equal(m2.apagados, 2);
});

test('resumoReferencias é estável e não depende da ordem', () => {
  assert.equal(resumoReferencias(['b', 'a']), resumoReferencias(['a', 'b']));
  assert.notEqual(resumoReferencias(['a']), resumoReferencias(['a', 'b']));
});
