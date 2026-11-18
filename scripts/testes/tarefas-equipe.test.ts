// Tarefas da equipe (pedido da administradora à equipe). A parte de integração precisa de um Postgres de teste em
// TEST_DATABASE_URL (mesma convenção dos outros testes: esquema de verdade, ids aleatórios, nunca DROP/TRUNCATE).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { Pool } from 'pg';
import {
  acharEmpresa, acharPessoa, criarServicoTarefas, horasUteisEntre, montarMensagemPedido, prazoValido, registrarRotasTarefasEquipe,
  TABELA_AVISOS, type Pessoa, type SessaoTarefas,
} from '../../src/server/tarefasEquipe';
import { montarFraseParaAgente, rotuloCaixaPedir } from '../../src/utils/pedirParaAlguem';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';

const equipe: Pessoa[] = [
  { id: 'u1', login: 'malba@escritorio.com', nome: 'Malba' },
  { id: 'u2', login: 'nilva.souza@escritorio.com', nome: 'Nilva' },
  { id: 'u3', login: 'nilton@escritorio.com', nome: null },
  { id: 'u4', login: 'joao.silva@escritorio.com', nome: 'João Silva' },
  { id: 'u5', login: 'joao.santos@escritorio.com', nome: 'João Santos' },
];

// ------------------------------------------------------------------ puros
test('nome: sem acento, maiúscula ou nome parcial acham a pessoa certa', () => {
  assert.equal((acharPessoa(equipe, 'NILVA') as any).item.id, 'u2');
  assert.equal((acharPessoa(equipe, 'nilva souza') as any).item.id, 'u2');
  assert.equal((acharPessoa(equipe, 'silva') as any).item.id, 'u4');
  assert.equal((acharPessoa(equipe, 'joão santos') as any).item.id, 'u5');
  assert.equal((acharPessoa(equipe, 'Joao Silva') as any).item.id, 'u4');
  assert.equal((acharPessoa(equipe, 'nilva.souza@escritorio.com') as any).item.id, 'u2');
});
test('nome ambíguo nunca escolhe: devolve as opções', () => {
  const a = acharPessoa(equipe, 'joão');
  assert.equal(a.tipo, 'ambiguo');
  assert.deepEqual((a as any).itens.map((p: Pessoa) => p.id).sort(), ['u4', 'u5']);
  assert.equal(acharPessoa(equipe, 'nil').tipo, 'ambiguo'); // Nilva e Nilton
});
test('nome inexistente ou vazio não acha ninguém', () => {
  assert.equal(acharPessoa(equipe, 'Zuleide').tipo, 'nenhum');
  assert.equal(acharPessoa(equipe, '').tipo, 'nenhum');
  assert.equal(acharPessoa(equipe, 'a').tipo, 'nenhum');
});
test('empresa por CNPJ ou por nome; CNPJ de fora não acha', () => {
  const emp = [{ cnpj: '12345678000190', nome: 'Mural Alimentos Ltda' }, { cnpj: '11222333000181', nome: 'Mural Bebidas Ltda' }];
  assert.equal((acharEmpresa(emp, '12.345.678/0001-90') as any).item.nome, 'Mural Alimentos Ltda');
  assert.equal(acharEmpresa(emp, 'mural').tipo, 'ambiguo');
  assert.equal((acharEmpresa(emp, 'alimentos') as any).item.cnpj, '12345678000190');
  assert.equal(acharEmpresa(emp, '99999999000199').tipo, 'nenhum');
});
test('mensagem pronta, com empresa e prazo', () => {
  assert.equal(montarMensagemPedido({ destinatario: 'Nilva', pedinte: 'Malba', servico: 'conciliar o banco', empresa: 'Mural Alimentos', prazo: '2026-11-20' }),
    'Nilva, a contadora Malba pediu para você: conciliar o banco — empresa Mural Alimentos — prazo 20/11/2026');
  assert.equal(montarMensagemPedido({ destinatario: 'Nilva', pedinte: 'Malba', servico: 'conciliar o banco' }), 'Nilva, a contadora Malba pediu para você: conciliar o banco');
});
test('horas úteis: segunda a sexta, 8h às 18h de Brasília', () => {
  assert.equal(horasUteisEntre(new Date('2026-11-13T20:00:00Z'), new Date('2026-11-16T12:00:00Z')), 2); // sex 17h -> seg 9h
  assert.equal(horasUteisEntre(new Date('2026-11-16T11:00:00Z'), new Date('2026-11-16T13:30:00Z')), 2.5);
  assert.equal(horasUteisEntre(new Date('2026-11-14T13:00:00Z'), new Date('2026-11-15T20:00:00Z')), 0); // fim de semana
  assert.equal(horasUteisEntre(new Date('2026-11-16T01:00:00Z'), new Date('2026-11-16T05:00:00Z')), 0); // madrugada
});
test('prazo aceita dd/mm/aaaa e AAAA-MM-DD; recusa data impossível', () => {
  assert.equal(prazoValido('20/11/2026'), '2026-11-20');
  assert.equal(prazoValido('2026-11-20'), '2026-11-20');
  assert.equal(prazoValido('2026-02-30'), null);
  assert.equal(prazoValido('sexta'), null);
});
test('caixinha da tela inicial: administradora pede para alguém; funcionário só anota para si', () => {
  assert.equal(rotuloCaixaPedir(true).titulo, 'Pedir para alguém');
  assert.equal(rotuloCaixaPedir(false).titulo, 'Anotar tarefa para mim');
  assert.equal(montarFraseParaAgente('  peça para a Nilva conciliar o banco  ', true), 'peça para a Nilva conciliar o banco');
  assert.match(montarFraseParaAgente('conciliar o banco', false), /só para mim/);
  assert.equal(montarFraseParaAgente('   ', true), '');
});

// ------------------------------------------------------------------ Agente IA (ferramenta delegar_tarefa)
const EMPRESAS = [{ cnpj: '12345678000190', razaoSocial: 'Mural Alimentos Ltda' }, { cnpj: '11222333000181', razaoSocial: 'Padaria Sol' }];
function montar(podeDelegar: boolean, falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>) {
  const chamadasApi: Array<[string, string, unknown]> = [];
  const api: ChamarApi = async (m, c, b) => {
    chamadasApi.push([m, c, b]);
    if (c === '/api/tarefas-equipe/equipe') return { status: 200, corpo: { sucesso: true, podeDelegar, eu: 'u1', equipe: equipe.map((p) => ({ id: p.id, login: p.login, nome: p.nome || p.login })) } };
    if (c === '/api/workspaces') return { status: 200, corpo: { sucesso: true, empresas: EMPRESAS } };
    if (c === '/api/tarefas-equipe' && m === 'POST') return { status: 201, corpo: { sucesso: true, avisado: true, tarefa: { origem: 'delegada', titulo: (b as any).titulo, destinatario: { nome: 'Nilva' }, mensagem: 'Nilva, a contadora Malba pediu para você: conciliar o banco — empresa Mural Alimentos Ltda' } } };
    return { status: 404, corpo: {} };
  };
  let i = 0;
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'malba@escritorio.com', nomeUsuario: 'Malba', hoje: '2026-11-17', chamarApi: api, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadasApi };
}
const pedir = (args: any) => [{ chamadas: [{ nome: 'delegar_tarefa', args }] }, { texto: 'ok' }];

test('Agente: a ferramenta existe no kit e o prompt a explica', () => {
  assert.ok(kitContabil.ferramentas.some((f) => f.declaracao.name === 'delegar_tarefa'));
  assert.match(kitContabil.instrucao, /delegar_tarefa/);
});
test('Agente: pedido da administradora vira cartão com a mensagem pronta; nada grava antes de confirmar', async () => {
  const { ctx, modelo, chamadasApi } = montar(true, pedir({ destinatario: 'nilva', servico: 'conciliar o banco', empresa: 'mural alimentos', prazo: '2026-11-20' }));
  const r = await conversar(ctx, modelo, 'peça para a Nilva conciliar o banco da Mural', []);
  assert.equal(r.acoes.length, 1);
  assert.match(r.acoes[0].titulo, /Pedir a Nilva/);
  assert.ok(r.acoes[0].descricao.some((l) => l.includes('Nilva, a contadora Malba pediu para você: conciliar o banco — empresa Mural Alimentos Ltda — prazo 20/11/2026')));
  assert.equal(chamadasApi.some(([m, c]) => m === 'POST' && c === '/api/tarefas-equipe'), false);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, true);
  const post = chamadasApi.find(([m, c2]) => m === 'POST' && c2 === '/api/tarefas-equipe')!;
  assert.deepEqual(post[2], { destinatarioLogin: 'nilva.souza@escritorio.com', titulo: 'conciliar o banco', cnpj: '12345678000190', prazo: '2026-11-20' });
});
test('Agente: nome ambíguo ou inexistente não gera cartão', async () => {
  for (const nome of ['joão', 'nil', 'Zuleide']) {
    const { ctx, modelo } = montar(true, pedir({ destinatario: nome, servico: 'conciliar o banco' }));
    assert.equal((await conversar(ctx, modelo, 'x', [])).acoes.length, 0, nome);
  }
});
test('Agente: funcionário comum não pede para outra pessoa, mas anota para si', async () => {
  const a = montar(false, pedir({ destinatario: 'Nilva', servico: 'conciliar o banco' }));
  assert.equal((await conversar(a.ctx, a.modelo, 'x', [])).acoes.length, 0);
  const b = montar(false, pedir({ servico: 'conciliar o banco' }));
  const r = await conversar(b.ctx, b.modelo, 'x', []);
  assert.equal(r.acoes.length, 1);
  assert.match(r.acoes[0].titulo, /Anotar tarefa para você/);
  const c = montar(false, pedir({ destinatario: 'para mim', servico: 'conciliar o banco' }));
  assert.equal((await conversar(c.ctx, c.modelo, 'x', [])).acoes.length, 1);
});
test('Agente: empresa de fora, prazo vencido e prazo inválido são recusados', async () => {
  for (const extra of [{ empresa: '99999999000199' }, { empresa: 'Inexistente SA' }, { prazo: '2026-11-10' }, { prazo: 'sexta' }]) {
    const { ctx, modelo } = montar(true, pedir({ destinatario: 'Nilva', servico: 'conciliar o banco', ...extra }));
    assert.equal((await conversar(ctx, modelo, 'x', [])).acoes.length, 0, JSON.stringify(extra));
  }
});

// ------------------------------------------------------------------ banco (integração)
const urlBanco = process.env.TEST_DATABASE_URL;
async function banco() {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const consultar = (sql: string, params: unknown[] = []) => pool.query(sql, params) as any;
  return { pool, consultar };
}
async function escritorio(consultar: any, nomes: Array<[string, string | null]>) {
  const tenant = crypto.randomUUID(); const sufixo = tenant.slice(0, 8);
  const sessoes: SessaoTarefas[] = [];
  for (let i = 0; i < nomes.length; i += 1) {
    const id = i === 0 ? tenant : crypto.randomUUID(); const login = `${nomes[i][0]}.${sufixo}@teste.murade`;
    await consultar(`INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,tenant_id,office_owner,nome_tratamento) VALUES($1,$2,'s','h',$3,$4,$5,$6)`, [id, login, i === 0, tenant, i === 0 ? null : tenant, nomes[i][1]]);
    sessoes.push({ userId: id, login, tenantId: tenant, escritorioDe: i === 0 ? undefined : tenant, administrador: i === 0, cnpjs: ['12345678000190'] });
  }
  return { tenant, sessoes };
}

test('delegar: grava, monta a mensagem, avisa quem recebeu e quem pediu acompanha visto/feito', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoTarefas(consultar);
    const { sessoes: [malba, nilva] } = await escritorio(consultar, [['malba', 'Malba'], ['nilva', 'Nilva']]);
    const r = await svc.criar(malba, { titulo: 'conciliar o banco', destinatario: 'nilva', cnpj: '12.345.678/0001-90', prazo: '2099-12-31' });
    assert.equal(r.tarefa.origem, 'delegada');
    assert.equal(r.tarefa.mensagem, 'Nilva, a contadora Malba pediu para você: conciliar o banco — empresa 12.345.678/0001-90 — prazo 31/12/2099');
    assert.equal((await svc.listar(nilva, 'para-mim')).length, 1);
    assert.equal((await svc.listar(malba, 'que-pedi')).length, 1);
    assert.equal((await svc.listar(malba, 'para-mim')).length, 0);
    assert.equal((await svc.avisosPendentes(nilva))[0].tipo, 'nova');
    assert.equal((await svc.avisosPendentes(malba)).length, 0);
    const vista = await svc.marcarVista(nilva, r.tarefa.id);
    assert.ok(vista.vistoEm);
    assert.match((await svc.avisosPendentes(malba))[0].texto, /Nilva viu o seu pedido/);
    await assert.rejects(() => svc.marcarVista(malba, r.tarefa.id), /Só quem recebeu/);
    const feita = await svc.concluir(nilva, r.tarefa.id);
    assert.ok(feita.concluidaEm);
    assert.ok((await svc.avisosPendentes(malba)).some((a) => /Nilva concluiu/.test(a.texto)));
    const idAviso = (await svc.avisosPendentes(nilva))[0].id;
    await svc.marcarAvisoLido(nilva, idAviso);
    assert.ok(!(await svc.avisosPendentes(nilva)).some((a) => a.id === idAviso));
  } finally { await pool.end(); }
});

test('permissão: funcionário comum só cria para si; ambíguo e inexistente são recusados no servidor', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoTarefas(consultar);
    const { sessoes: [malba, nilva, nilton] } = await escritorio(consultar, [['malba', 'Malba'], ['nilva', 'Nilva'], ['nilton', 'Nilton']]);
    await assert.rejects(() => svc.criar(nilva, { titulo: 'fazer a folha', destinatario: 'Nilton' }), (e: any) => e.status === 403);
    const propria = await svc.criar(nilva, { titulo: 'conferir extratos' });
    assert.equal(propria.tarefa.origem, 'propria');
    assert.equal((await svc.avisosPendentes(nilva)).length, 0);
    await assert.rejects(() => svc.criar(malba, { titulo: 'fazer a folha', destinatario: 'nil' }), (e: any) => e.status === 409 && e.candidatos.length === 2);
    await assert.rejects(() => svc.criar(malba, { titulo: 'fazer a folha', destinatario: 'Zuleide' }), (e: any) => e.status === 404);
    await assert.rejects(() => svc.criar(malba, { titulo: 'fazer a folha', destinatario: 'Nilton', cnpj: '99999999000199' }), (e: any) => e.status === 403);
    await assert.rejects(() => svc.criar(malba, { titulo: 'fazer a folha', destinatario: 'Nilton', prazo: '2020-01-01' }), (e: any) => e.status === 400);
    await assert.rejects(() => svc.criar(malba, { titulo: 'ab', destinatario: 'Nilton' }), (e: any) => e.status === 400);
    // quem só recebeu não exclui o pedido da administradora; quem pediu exclui uma a uma
    const r = await svc.criar(malba, { titulo: 'fazer a folha', destinatario: 'Nilton' });
    await assert.rejects(() => svc.excluir(nilton, r.tarefa.id), (e: any) => e.status === 403);
    await svc.excluir(malba, r.tarefa.id);
    assert.equal((await svc.listar(nilton, 'para-mim')).length, 0);
  } finally { await pool.end(); }
});

test('isolamento: outro escritório não vê, não conclui, não exclui e não recebe pedido', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoTarefas(consultar);
    const A = await escritorio(consultar, [['adm', 'Ana'], ['func', 'Nilva']]);
    const B = await escritorio(consultar, [['adm', 'Bia'], ['func', 'Nilva']]);
    const r = await svc.criar(A.sessoes[0], { titulo: 'conciliar o banco', destinatario: 'Nilva' });
    assert.equal((await svc.listar(B.sessoes[1], 'para-mim')).length, 0);
    assert.equal((await svc.listar(B.sessoes[0], 'que-pedi')).length, 0);
    assert.equal((await svc.avisosPendentes(B.sessoes[1])).length, 0);
    for (const intruso of [B.sessoes[0], B.sessoes[1]]) {
      await assert.rejects(() => svc.concluir(intruso, r.tarefa.id), (e: any) => e.status === 404);
      await assert.rejects(() => svc.excluir(intruso, r.tarefa.id), (e: any) => e.status === 404);
    }
    // o nome "Nilva" do escritório B não é alcançável pela administradora do A, e vice-versa
    const noB = await svc.criar(B.sessoes[0], { titulo: 'x servico', destinatario: 'Nilva' });
    assert.equal(noB.tarefa.destinatario.login, B.sessoes[1].login);
    assert.equal((await svc.listar(A.sessoes[1], 'para-mim')).length, 1);
    await assert.rejects(() => svc.criar(A.sessoes[0], { titulo: 'x servico', destinatario: B.sessoes[0].login }), (e: any) => e.status === 404);
  } finally { await pool.end(); }
});

test('rotas: sessão, isolamento e exclusão uma a uma pelo HTTP', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  const svc = criarServicoTarefas(consultar);
  const A = await escritorio(consultar, [['adm', 'Ana'], ['func', 'Nilva']]);
  const B = await escritorio(consultar, [['adm', 'Bia']]);
  const todas = [...A.sessoes, ...B.sessoes];
  const app = express(); app.use(express.json());
  const porId = (req: express.Request) => todas.find((s) => s.userId === req.headers['x-u']);
  registrarRotasTarefasEquipe(app, { servico: svc, exigirSessao: (_q, _r, n) => n(), exigirOrigem: (_q, _r, n) => n(), sessao: porId });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}/api/tarefas-equipe`;
  const h = (s?: SessaoTarefas) => ({ 'content-type': 'application/json', ...(s ? { 'x-u': s.userId } : {}) });
  try {
    assert.equal((await fetch(base, { headers: h() })).status, 401);
    const criada = await (await fetch(base, { method: 'POST', headers: h(A.sessoes[0]), body: JSON.stringify({ titulo: 'conciliar o banco', destinatario: 'nilva' }) })).json();
    assert.equal(criada.sucesso, true);
    const id = criada.tarefa.id;
    assert.equal((await (await fetch(`${base}?visao=para-mim`, { headers: h(A.sessoes[1]) })).json()).tarefas.length, 1);
    assert.equal((await (await fetch(`${base}?visao=para-mim`, { headers: h(B.sessoes[0]) })).json()).tarefas.length, 0);
    assert.equal((await fetch(`${base}/${id}/concluir`, { method: 'POST', headers: h(B.sessoes[0]), body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/${id}`, { method: 'DELETE', headers: h(A.sessoes[1]) })).status, 403);
    assert.equal((await fetch(`${base}/abc`, { method: 'DELETE', headers: h(A.sessoes[0]) })).status, 400);
    const eq = await (await fetch(`${base}/equipe`, { headers: h(A.sessoes[0]) })).json();
    assert.equal(eq.podeDelegar, true); assert.equal(eq.equipe.length, 2);
    assert.equal((await (await fetch(`${base}/equipe`, { headers: h(A.sessoes[1]) })).json()).podeDelegar, false);
    assert.equal((await fetch(`${base}/${id}`, { method: 'DELETE', headers: h(A.sessoes[0]) })).status, 200);
    assert.equal((await (await fetch(`${base}?visao=que-pedi`, { headers: h(A.sessoes[0]) })).json()).tarefas.length, 0);
  } finally { srv.close(); await pool.end(); }
});

test('robô: lembra pedido não visto há mais de 2 h úteis, avisa prazo vencido, não repete no mesmo dia e não mexe na tarefa', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const agora = new Date('2026-11-17T15:00:00Z'); // terça 12h (Brasília)
    const svc = criarServicoTarefas(consultar, () => agora);
    const { sessoes: [malba, nilva] } = await escritorio(consultar, [['malba', 'Malba'], ['nilva', 'Nilva']]);
    const velha = (await svc.criar(malba, { titulo: 'conciliar o banco', destinatario: 'Nilva' })).tarefa.id;
    const recente = (await svc.criar(malba, { titulo: 'enviar relatório', destinatario: 'Nilva' })).tarefa.id;
    const vencida = (await svc.criar(malba, { titulo: 'fechar o mês', destinatario: 'Nilva', prazo: '2026-11-17' })).tarefa.id;
    await consultar(`UPDATE contabil_tarefas_equipe SET criada_em='2026-11-17T11:00:00Z' WHERE id=$1`, [velha]); // 08h: 4 h úteis
    await consultar(`UPDATE contabil_tarefas_equipe SET criada_em='2026-11-17T14:30:00Z', visto_em='2026-11-17T14:40:00Z' WHERE id=$1`, [recente]);
    await consultar(`UPDATE contabil_tarefas_equipe SET criada_em='2026-11-17T14:00:00Z', visto_em='2026-11-17T14:10:00Z', prazo='2026-11-16' WHERE id=$1`, [vencida]);
    const tipos = async (id: string, user: string) => (await consultar(`SELECT tipo FROM ${TABELA_AVISOS} WHERE tarefa_id=$1 AND user_id=$2 ORDER BY id`, [id, user])).rows.map((x: any) => x.tipo);
    const r1 = await svc.conferir();
    assert.ok(r1.naoVistas >= 1 && r1.vencidas >= 1);
    assert.match(r1.resumo, /em aberto/);
    assert.deepEqual((await tipos(velha, nilva.userId)).sort(), ['lembrete', 'nova']);
    assert.deepEqual(await tipos(velha, malba.userId), ['alerta']);
    assert.deepEqual(await tipos(recente, nilva.userId), ['nova']); // visto e recente: sem lembrete
    assert.deepEqual((await tipos(vencida, nilva.userId)).sort(), ['nova', 'vencida']);
    assert.deepEqual(await tipos(vencida, malba.userId), ['vencida']);
    await svc.conferir();
    assert.deepEqual((await tipos(velha, nilva.userId)).sort(), ['lembrete', 'nova']); // sem repetir
    const linha = (await consultar(`SELECT concluida_em, visto_em FROM contabil_tarefas_equipe WHERE id=$1`, [velha])).rows[0];
    assert.equal(linha.concluida_em, null); assert.equal(linha.visto_em, null);
    // concluída não gera mais aviso
    await svc.concluir(nilva, vencida);
    const antes = (await tipos(vencida, nilva.userId)).length;
    await svc.conferir();
    assert.equal((await tipos(vencida, nilva.userId)).length, antes);
  } finally { await pool.end(); }
});

test('falha ao avisar nunca perde a tarefa; o robô refaz o aviso depois', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    let quebrar = true;
    const instavel = (sql: string, p?: unknown[]) => (quebrar && sql.includes(`INSERT INTO ${TABELA_AVISOS}`) ? Promise.reject(new Error('banco caiu')) : consultar(sql, p));
    const svc = criarServicoTarefas(instavel as any);
    const { sessoes: [malba, nilva] } = await escritorio(consultar, [['malba', 'Malba'], ['nilva', 'Nilva']]);
    const r = await svc.criar(malba, { titulo: 'conciliar o banco', destinatario: 'Nilva' });
    assert.equal(r.avisado, false);
    assert.equal((await svc.listar(nilva, 'para-mim')).length, 1); // a tarefa existe
    assert.equal((await svc.avisosPendentes(nilva)).length, 0);
    const falho = await svc.conferir(); // ainda quebrado: conta a falha, não perde nada
    assert.ok(falho.falhas >= 1);
    assert.equal((await svc.listar(nilva, 'para-mim')).length, 1);
    quebrar = false;
    await svc.conferir();
    assert.equal((await svc.avisosPendentes(nilva))[0].tipo, 'nova');
  } finally { await pool.end(); }
});
