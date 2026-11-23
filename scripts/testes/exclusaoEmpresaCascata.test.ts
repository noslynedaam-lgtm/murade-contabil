// Exclusão de empresa em cascata (lado do Contábil): remoção por CNPJ para todos os usuários, preservação da escrituração,
// segurança do token, idempotência, aviso ao hub do Fiscal e o robô conferidor. Sem banco real: o banco é simulado em memória.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { avisarHubFiscal, PRESERVADOS, removerEmpresaCompleta, sobrasDeEmpresasExcluidas, type BancoTransacional, type ConsultaSql } from '../../src/server/exclusaoEmpresaCascata';
import { TABELA_ARQUIVO_MORTO, TABELAS_GUARDA, recuperarDoArquivoMorto, rodarRoboPrazoGuarda, guardarAte } from '../../src/server/arquivoMorto';
import { cnpjsExcluidosNoFiscal } from '../../src/server/empresasDoFiscal';

process.env.MURADE_BACKUP_MASTER_KEY = '11'.repeat(32);
const ALVO = '10368859000101';
const OUTRA = '11222333000181';

/** Banco em memória que entende só os comandos que a exclusão usa e registra todo SQL recebido. */
function bancoFalso() {
  const t = {
    acesso: [{ user_id: 'u1', cnpj: ALVO }, { user_id: 'u2', cnpj: ALVO }, { user_id: 'u3', cnpj: ALVO }, { user_id: 'u1', cnpj: OUTRA }],
    compartilhadas: [{ cnpj: ALVO, dados: { razaoSocial: 'TESTE' } }, { cnpj: OUTRA, dados: {} }],
    workspaces: [{ cnpj: ALVO, payload: { lancamentos: [{ id: 1 }] }, version: 7 }, { cnpj: OUTRA, payload: {}, version: 1 }],
    atividade: [{ cnpj: ALVO }, { cnpj: ALVO }, { cnpj: OUTRA }],
    sistemaAnterior: [{ cnpj: ALVO, bloco: 'lotes' }, { cnpj: ALVO, bloco: '__migracao' }, { cnpj: OUTRA, bloco: 'lotes' }],
    morto: [] as any[],
    guarda: { contabil_period_closures: [{ cnpj: ALVO, competencia: '2026-01' }, { cnpj: OUTRA, competencia: '2026-01' }], murade_documentos_fiscais_origem: [{ cnpj: ALVO, chave: 'N1' }], contabil_ai_agent_log: [{ cnpj: ALVO, texto: 'log' }] } as Record<string, any[]>,
  };
  const sqls: string[] = [];
  let begin = 0, commit = 0, rollback = 0; let falharEm: string | null = null;
  const consultar: ConsultaSql = async (sql, p = []) => {
    sqls.push(sql);
    if (falharEm && sql.includes(falharEm)) throw new Error('falha simulada');
    const cnpj = p[0];
    const apagar = <T extends { cnpj: string }>(lista: T[]) => { const antes = lista.length; const resto = lista.filter((x) => x.cnpj !== cnpj); lista.length = 0; lista.push(...resto); return { rows: [], rowCount: antes - resto.length }; };
    if (/^CREATE (TABLE|INDEX)/i.test(sql.trim())) return { rows: [] };
    if (sql.includes('FROM contabil_auth_company_access a JOIN contabil_auth_users u')) return { rows: [{ t: 'escritorio-1' }] };
    if (sql.includes(`INSERT INTO ${TABELA_ARQUIVO_MORTO}`)) { t.morto.push({ id: p[0], tenant_id: p[1], cnpj: p[2], guardar_ate: p[4], conteudo: p[6], itens: p[8] }); return { rows: [], rowCount: 1 }; }
    const g = /to_regclass\('(\w+)'\)/.exec(sql); if (g && ((TABELAS_GUARDA as readonly string[]).includes(g[1]) || g[1] === 'contabil_ai_agent_log')) return { rows: [{ t: (t.guarda as any)[g[1]] ? g[1] : null }] };
    const gs = /^SELECT \* FROM (\w+) WHERE cnpj=\$1/.exec(sql); if (gs && (t.guarda as any)[gs[1]]) return { rows: (t.guarda as any)[gs[1]].filter((x: any) => x.cnpj === cnpj) };
    const gd = /^DELETE FROM (\w+) WHERE cnpj=\$1/.exec(sql); if (gd && (t.guarda as any)[gd[1]]) return apagar((t.guarda as any)[gd[1]]);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.startsWith('SELECT payload,version FROM contabil_company_workspaces')) { const w = t.workspaces.find((x) => x.cnpj === cnpj); return { rows: w ? [w] : [] }; }
    if (sql.startsWith('SELECT dados FROM contabil_empresas_compartilhadas')) { const c = t.compartilhadas.find((x) => x.cnpj === cnpj); return { rows: c ? [c] : [] }; }
    if (sql.startsWith('DELETE FROM contabil_auth_company_access')) return apagar(t.acesso as any);
    if (sql.startsWith('DELETE FROM contabil_empresas_compartilhadas')) return apagar(t.compartilhadas);
    if (sql.startsWith('DELETE FROM contabil_company_workspaces')) return apagar(t.workspaces);
    if (sql.includes("to_regclass('contabil_atividade_equipe')")) return { rows: [{ t: 'contabil_atividade_equipe' }] };
    if (sql.startsWith('DELETE FROM contabil_atividade_equipe')) return apagar(t.atividade);
    if (sql.includes("to_regclass('contabil_sistema_anterior')")) return { rows: [{ t: 'contabil_sistema_anterior' }] };
    if (sql.startsWith('DELETE FROM contabil_sistema_anterior')) return apagar(t.sistemaAnterior);
    if (/to_regclass\('contabil_(titulos|cartoes|extrato_movimentos)'\)/.test(sql)) return { rows: [{ t: (t as any).extras ? 'sim' : null }] };
    if (/^DELETE FROM contabil_(titulos|cartoes|extrato_movimentos)/.test(sql)) return { rows: [], rowCount: 1 };
    const lr = /to_regclass\('(contabil_lucro_real_\w+|contabil_lalur_\w+)'\)/.exec(sql); if (lr) return { rows: [{ t: (t as any).lucroReal ? lr[1] : null }] };
    const lrSel = /^SELECT \* FROM (contabil_lucro_real_\w+|contabil_lalur_\w+) WHERE cnpj=\$1/.exec(sql); if (lrSel) return { rows: ((t as any).lucroReal?.[lrSel[1]] || []).filter((x: any) => x.cnpj === cnpj) };
    const lrDel = /^DELETE FROM (contabil_lucro_real_\w+|contabil_lalur_\w+) WHERE cnpj=\$1/.exec(sql); if (lrDel) { const l = (t as any).lucroReal?.[lrDel[1]] || []; return apagar(l); }
    throw new Error(`SQL não previsto no teste: ${sql.slice(0, 80)}`);
  };
  const banco: BancoTransacional = {
    consultar,
    async transacao(fn) {
      begin++;
      const copia = JSON.stringify(t);
      try { const r = await fn(consultar); commit++; return r; }
      catch (e) { rollback++; const antes = JSON.parse(copia); for (const k of Object.keys(antes)) { if (Array.isArray(antes[k])) { (t as any)[k].length = 0; (t as any)[k].push(...antes[k]); } else (t as any)[k] = antes[k]; } throw e; }
    },
  };
  return { banco, t, sqls, contagem: () => ({ begin, commit, rollback }), falharEm: (x: string) => { falharEm = x; } };
}

test('remove a empresa de TODOS os usuários, do cadastro compartilhado, do workspace e da atividade; outra empresa não é tocada', async () => {
  const f = bancoFalso();
  const r = await removerEmpresaCompleta(f.banco, '10.368.859/0001-01', { por: 'dono', origem: 'fiscal' });
  assert.equal(r.sucesso, true); assert.equal(r.cnpj, ALVO);
  assert.deepEqual(r.apagados, { acessosDeUsuarios: 3, empresaCompartilhada: 1, workspace: 1, atividadeEquipe: 2, sistemaAnterior: 2, titulos: 0, cartoes: 0, extrato: 0, guardadosNoArquivoMorto: 3, operacionais: 1 });
  assert.deepEqual(f.t.sistemaAnterior, [{ cnpj: OUTRA, bloco: 'lotes' }], 'o registro do sistema anterior sai junto e a outra empresa fica');
  assert.equal(r.jaNaoExistia, false);
  assert.deepEqual(f.t.acesso, [{ user_id: 'u1', cnpj: OUTRA }]);
  assert.deepEqual(f.t.compartilhadas.map((x) => x.cnpj), [OUTRA]);
  assert.deepEqual(f.t.workspaces.map((x) => x.cnpj), [OUTRA]);
  assert.deepEqual(f.t.atividade, [{ cnpj: OUTRA }]);
});

test('o que tem guarda legal vai CIFRADO para o arquivo morto do escritório e sai das tabelas vivas; o operacional sai sem cópia; outra empresa fica', async () => {
  const f = bancoFalso();
  const r = await removerEmpresaCompleta(f.banco, ALVO, { por: 'ana', origem: 'contabil' });
  assert.equal(f.t.morto.length, 1);
  const m = f.t.morto[0];
  assert.equal(m.tenant_id, 'escritorio-1'); assert.equal(m.cnpj, ALVO); assert.equal(m.guardar_ate, guardarAte(new Date().getUTCFullYear()));
  assert.equal(m.itens, 3, 'workspace + 1 fechamento + 1 documento de origem');
  assert.ok(Buffer.isBuffer(m.conteudo) && !m.conteudo.toString('latin1').includes('N1'), 'o conteúdo está cifrado');
  assert.deepEqual(f.t.guarda.contabil_period_closures, [{ cnpj: OUTRA, competencia: '2026-01' }]);
  assert.deepEqual(f.t.guarda.murade_documentos_fiscais_origem, []); assert.deepEqual(f.t.guarda.contabil_ai_agent_log, []);
  assert.ok(f.sqls.findIndex((x) => x.includes(`INSERT INTO ${TABELA_ARQUIVO_MORTO}`)) < f.sqls.findIndex((x) => x.startsWith('DELETE FROM contabil_period_closures')), 'guarda antes de apagar');
  assert.ok(f.sqls.findIndex((x) => x.includes('JOIN contabil_auth_users u')) < f.sqls.findIndex((x) => x.startsWith('DELETE FROM contabil_auth_company_access')), 'descobre o escritório antes de tirar o vínculo');
  assert.equal(r.preservados.length, PRESERVADOS.length);
});

test('sem a chave dos backups a exclusão é recusada e nada é apagado (guarda legal não se perde)', async () => {
  const f = bancoFalso(); const antes = process.env.MURADE_BACKUP_MASTER_KEY; delete process.env.MURADE_BACKUP_MASTER_KEY;
  try { await assert.rejects(() => removerEmpresaCompleta(f.banco, ALVO), /MURADE_BACKUP_MASTER_KEY/); } finally { process.env.MURADE_BACKUP_MASTER_KEY = antes; }
  assert.equal(f.t.acesso.filter((x) => x.cnpj === ALVO).length, 3); assert.equal(f.t.morto.length, 0);
});

test('é idempotente: repetir devolve zeros e não cria outra cópia; CNPJ inexistente também não dá erro', async () => {
  const f = bancoFalso();
  await removerEmpresaCompleta(f.banco, ALVO);
  const de_novo = await removerEmpresaCompleta(f.banco, ALVO);
  assert.deepEqual(de_novo.apagados, { acessosDeUsuarios: 0, empresaCompartilhada: 0, workspace: 0, atividadeEquipe: 0, sistemaAnterior: 0, titulos: 0, cartoes: 0, extrato: 0, guardadosNoArquivoMorto: 0, operacionais: 0 });
  assert.equal(de_novo.jaNaoExistia, true); assert.equal(f.t.morto.length, 1);
  assert.equal((await removerEmpresaCompleta(f.banco, '99999999000199')).jaNaoExistia, true);
});

test('é tudo ou nada: se um passo falha, a transação volta e nada fica apagado pela metade', async () => {
  const f = bancoFalso(); f.falharEm('DELETE FROM contabil_company_workspaces');
  await assert.rejects(() => removerEmpresaCompleta(f.banco, ALVO), /falha simulada/);
  assert.equal(f.contagem().rollback, 1); assert.equal(f.contagem().commit, 0);
  assert.equal(f.t.acesso.filter((x) => x.cnpj === ALVO).length, 3); assert.equal(f.t.morto.length, 0);
});

test('nunca bloqueia CNPJ nem e-mail: a exclusão não grava lista de bloqueio e não mexe em usuários', async () => {
  const f = bancoFalso(); await removerEmpresaCompleta(f.banco, ALVO);
  const todo = f.sqls.join('\n');
  assert.ok(!/bloque|blocklist|lapide|INSERT INTO contabil_auth_users|DELETE FROM contabil_auth_users|UPDATE contabil_auth_users/i.test(todo));
  const codigo = readFileSync('src/server/exclusaoEmpresaCascata.ts', 'utf8');
  assert.ok(!/INSERT INTO/.test(codigo), 'a exclusão não grava nada além do arquivo morto (em arquivoMorto.ts), que não impede cadastrar de novo');
});

// ---- hub do Fiscal
test('chama o hub do Fiscal: DELETE com Bearer e corpo {origem, por}; best-effort, nunca lança', async () => {
  let visto: any = null;
  const ok = await avisarHubFiscal(ALVO, 'ana', { MURADE_INTEGRATION_TOKEN: 'seg', MURADE_FISCAL_URL: 'https://fiscal.teste/' }, (async (url: any, init: any) => { visto = { url, init }; return new Response(JSON.stringify({ sucesso: true, cascata: ['dp'] }), { status: 200 }); }) as any);
  assert.equal(ok.avisado, true);
  assert.equal(visto.url, `https://fiscal.teste/api/integracao/empresa/${ALVO}`);
  assert.equal(visto.init.method, 'DELETE'); assert.equal(visto.init.headers.authorization, 'Bearer seg');
  assert.deepEqual(JSON.parse(visto.init.body), { origem: 'contabil', por: 'ana', administrador: true }); assert.ok(visto.init.signal, 'tem timeout');
  const erro = await avisarHubFiscal(ALVO, 'ana', { MURADE_INTEGRATION_TOKEN: 'seg' }, (async () => new Response('{}', { status: 502 })) as any);
  assert.equal(erro.avisado, false); assert.equal(erro.status, 502);
  const caiu = await avisarHubFiscal(ALVO, 'ana', { MURADE_INTEGRATION_TOKEN: 'seg' }, (async () => { throw new Error('rede'); }) as any);
  assert.equal(caiu.avisado, false); assert.match(caiu.motivo || '', /não respondeu/);
  const semToken = await avisarHubFiscal(ALVO, 'ana', {}, (async () => { throw new Error('não deveria chamar'); }) as any);
  assert.equal(semToken.avisado, false);
});

// ---- robô conferidor
test('robô: acha sobras de empresas excluídas no Fiscal e lê a lápide em vários formatos', async () => {
  assert.deepEqual(cnpjsExcluidosNoFiscal({ excluidas: [ALVO, { cnpj: '11.222.333/0001-81' }, 'lixo', ALVO] }), [ALVO, OUTRA]);
  assert.deepEqual(cnpjsExcluidosNoFiscal({ lapides: [ALVO] }), [ALVO]); assert.deepEqual(cnpjsExcluidosNoFiscal({}), []);
  let recebido: unknown[] = [];
  const consultar: ConsultaSql = async (sql, p) => { recebido = p || []; assert.ok(/^\s*SELECT/i.test(sql) && !/DELETE|UPDATE|INSERT/i.test(sql), 'só lê'); return { rows: [{ cnpj: ALVO }] }; };
  assert.deepEqual(await sobrasDeEmpresasExcluidas(consultar, [ALVO, OUTRA]), [ALVO]); assert.deepEqual(recebido, [[ALVO, OUTRA]]);
  assert.deepEqual(await sobrasDeEmpresasExcluidas(async () => { throw new Error('não deve consultar'); }, []), []);
  const srv = readFileSync('server.ts', 'utf8');
  assert.match(srv, /registrarRobo\(\{ id: "empresas_excluidas"/); assert.match(srv, /registrarRotinaManual\("empresas_excluidas"/);
  assert.match(srv, /lapides\.has\(e\.cnpj\)/, 'o robô de importação nunca recria empresa com lápide');
});

// ---- rota real (processo do servidor, sem banco): segurança do token
test('rota DELETE /api/integracao/empresa/:cnpj: sem token 401, token errado 401, CNPJ inválido 400, sem banco 503', async () => {
  const porta = 4300 + Math.floor(Math.random() * 500);
  const filho = spawn('npx', ['tsx', 'server.ts'], { env: { ...process.env, PORT: String(porta), MURADE_INTEGRATION_TOKEN: 'token-de-teste-longo', DATABASE_URL: '' }, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${porta}`;
    let pronto = false;
    for (let i = 0; i < 80 && !pronto; i++) { try { await fetch(`${base}/api/integracao/empresa/x`, { method: 'DELETE' }); pronto = true; } catch { await new Promise((r) => setTimeout(r, 500)); } }
    assert.ok(pronto, 'servidor subiu');
    const del = (caminho: string, auth?: string) => fetch(`${base}/api/integracao/empresa/${caminho}`, { method: 'DELETE', headers: auth ? { authorization: auth } : {} });
    assert.equal((await del(ALVO)).status, 401);
    assert.equal((await del(ALVO, 'Bearer errado')).status, 401);
    assert.equal((await del(ALVO, 'Bearer token-de-teste-longo-')).status, 401, 'token com tamanho diferente');
    assert.equal((await del('123', 'Bearer token-de-teste-longo')).status, 400);
    assert.equal((await del(ALVO, 'Bearer token-de-teste-longo')).status, 503);
    assert.equal((await fetch(`${base}/api/integracao/empresa/${ALVO}`, { method: 'GET' })).status === 200, false, 'GET não apaga nada');
  } finally { filho.kill('SIGKILL'); }
});

// ---- tela e voz
test('botão da tela: duas etapas já existem, o texto avisa a cascata; a rota manda o aviso ao Fiscal e devolve o resultado', () => {
  const tela = readFileSync('src/components/tabs/EmpresaTab.tsx', 'utf8');
  assert.match(tela, /Excluir esta empresa\?/); assert.match(tela, /O Fiscal é avisado e apaga a empresa também/); assert.match(tela, /O CNPJ não fica bloqueado/);
  const auth = readFileSync('src/server/authContabil.ts', 'utf8');
  assert.match(auth, /removerEmpresaCompleta\(bancoTransacionalContabil\(\)/); assert.match(auth, /avisarHubFiscal\(/); assert.match(auth, /cascata: hub/);
});

test('Agente por voz: apagar_empresa é UMA empresa, com nome e CNPJ no cartão, duas confirmações e chama a mesma rota do botão', async () => {
  const { ArmazemAcoesPendentes, avancarAcao, confirmarAcao, conversar, MENSAGEM_FALTA_ETAPA_1 } = await import('../../src/server/agenteMotor');
  const { kitContabil } = await import('../../src/server/agenteContabil');
  const chamadas: Array<[string, string]> = [];
  const api = async (m: string, c: string) => { chamadas.push([m, c]); if (m === 'GET') return { status: 200, corpo: { empresas: [{ cnpj: ALVO, razaoSocial: 'EMPRESA TESTE LTDA' }, { cnpj: OUTRA, razaoSocial: 'OUTRA SA' }] } }; return { status: 200, corpo: { sucesso: true, cascata: { avisado: true } } }; };
  const falas = [{ chamadas: [{ nome: 'apagar_empresa', args: { empresa: 'empresa teste' } }] }, { texto: 'ok' }]; let i = 0;
  const modelo = (async () => { const f: any = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; }) as any;
  const ctx: any = { sessaoHash: 's', login: 'a@b.c', hoje: '2026-11-19', chamarApi: api, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  const r = await conversar(ctx, modelo, 'apaga a empresa teste', []);
  assert.equal(r.acoes.length, 1); assert.equal(r.acoes[0].duasEtapas, true);
  assert.match(r.acoes[0].titulo, /EMPRESA TESTE LTDA/); assert.match(r.acoes[0].titulo, new RegExp(ALVO));
  const pulou = await confirmarAcao(ctx, r.acoes[0].id); assert.equal(pulou.mensagem, MENSAGEM_FALTA_ETAPA_1);
  assert.equal(chamadas.filter(([m]) => m === 'DELETE').length, 0, 'sem as duas confirmações nada é apagado');
  assert.equal((await avancarAcao(ctx, r.acoes[0].id)).sucesso, true);
  assert.equal((await confirmarAcao(ctx, r.acoes[0].id)).sucesso, true);
  assert.deepEqual(chamadas.filter(([m]) => m === 'DELETE'), [['DELETE', `/api/auth/companies/${ALVO}`]]);
});
test('Agente por voz: nome ambíguo ou inexistente não escolhe sozinho; não existe ferramenta em lote', async () => {
  const { kitContabil } = await import('../../src/server/agenteContabil');
  const ferr: any = kitContabil.ferramentas.find((f: any) => f.declaracao.name === 'apagar_empresa');
  assert.ok(ferr && ferr.exclusao === true);
  const ctx: any = { chamarApi: async () => ({ status: 200, corpo: { empresas: [{ cnpj: ALVO, razaoSocial: 'ALFA COMERCIO' }, { cnpj: OUTRA, razaoSocial: 'ALFA SERVICOS' }] } }) };
  assert.match((await ferr.preparar(ctx, { empresa: 'alfa' })).erro, /mais de uma empresa/);
  assert.match((await ferr.preparar(ctx, { empresa: 'zeta' })).erro, /Não encontrei/);
  assert.match((await ferr.preparar(ctx, {})).erro, /Diga qual empresa/);
  assert.ok(!kitContabil.ferramentas.some((f: any) => /todas|lote/i.test(f.declaracao.name)));
});

