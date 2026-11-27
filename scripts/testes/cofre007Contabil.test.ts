// Cofre cifrado do Agente 007 no Contábil (27/11/2026), com dados FICTÍCIOS:
//  • cifra do registro do sistema anterior: ida e volta, bloco não troca por outro (AAD), chave derivada de MURADE_BACKUP_MASTER_KEY;
//  • leitura compatível (aberta ou cifrada) e gravação pela migração já cifrada, com a conferência do balancete batendo;
//  • robô que cifra o que já estava aberto: um bloco por transação, pula empresa em uso e com migração gravando, não muda dado;
//  • cofre por coluna (murad_007_cofre, cifrado, por escritório), painel do dono sem dado, implantação só no cadastro e só no vazio
//    (nunca em lançamento/competência), exclusão em cascata sem bloquear o CNPJ.
// As partes com banco usam um Postgres de teste em TEST_DATABASE_URL (mesma convenção dos outros testes de integração); sem ele, pulam.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import {
  chaveDoRegistro, cifraRegistro, criarCifraRegistro, definirCifraRegistroParaTeste, idRegistro, inserirBloco, linhasDoRegistro,
  migrarCifraSistemaAnteriorContabil, textoCifrarAntigos, ErroCifraRegistro,
} from '../../src/server/migracaoSistemaAnterior/cifraRegistro';
import { conferirEmpresaMigrada, gravarEmpresaMigrada, lerBlocoSistemaAnterior, lerRegistroSistemaAnterior, prepararTabelaSistemaAnterior } from '../../src/server/migracaoSistemaAnterior/banco';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { montarDadosEmpresa } from '../../src/server/migracaoSistemaAnterior/conversor';
import { workspaceValido } from '../../src/server/authContabil';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import { etapas007Contabil, implantadores007Contabil, itensCofreContabil, painelCofre007ContabilDoCofre, tabelaDoBloco, valorComDado } from '../../src/server/agente007Contabil';
import { implantarDoCofre007, repo007Postgres, fonteDoCofre } from '../../src/server/agente007';
import { gerarBackupEmpresaGrande } from './apoio/backupEmpresaGrande';

const CNPJ = '11222333000181';
const cifraTeste = () => criarCifraRegistro(crypto.createHash('sha256').update('chave fictícia do teste contábil').digest());

test('cifra do registro (Contábil): ida e volta; o bloco cifrado não serve para outro bloco nem outro CNPJ', () => {
  const c = cifraTeste(); const linhas = [{ idconta: '101', nmconta: 'CAIXA INVENTADO' }];
  const e = c.cifrar(CNPJ, idRegistro('plano_contas'), linhas);
  assert.ok(!e.ciphertext.toString('utf8').includes('INVENTADO'));
  assert.deepEqual(c.decifrar(CNPJ, idRegistro('plano_contas'), e.ciphertext, e.iv, e.tag), linhas);
  assert.throws(() => c.decifrar(CNPJ, idRegistro('lotes'), e.ciphertext, e.iv, e.tag));
  assert.throws(() => c.decifrar('44555666000181', idRegistro('plano_contas'), e.ciphertext, e.iv, e.tag));
});

test('chave (Contábil): derivada de MURADE_BACKUP_MASTER_KEY (a que o Contábil já usa); sem ela grava aberto', () => {
  assert.equal(chaveDoRegistro({}), null);
  const k = chaveDoRegistro({ MURADE_BACKUP_MASTER_KEY: 'c3'.repeat(32) })!;
  assert.equal(k.length, 32); assert.ok(!k.equals(Buffer.from('c3'.repeat(32), 'hex')), 'não usa a mestra crua');
  definirCifraRegistroParaTeste(null); assert.equal(cifraRegistro(), null); definirCifraRegistroParaTeste(undefined);
});

test('leitura compatível (Contábil): aberto e cifrado dão o mesmo; sem a chave, avisa', () => {
  const c = cifraTeste(); definirCifraRegistroParaTeste(c);
  try {
    const linhas = [{ a: '1' }]; const e = c.cifrar(CNPJ, idRegistro('lotes'), linhas);
    assert.deepEqual(linhasDoRegistro({ cnpj: CNPJ, bloco: 'lotes', linhas }), linhas);
    assert.deepEqual(linhasDoRegistro({ cnpj: CNPJ, bloco: 'lotes', linhas: null, cifra: e.ciphertext, cifra_iv: e.iv, cifra_tag: e.tag }), linhas);
    definirCifraRegistroParaTeste(null);
    assert.throws(() => linhasDoRegistro({ cnpj: CNPJ, bloco: 'lotes', linhas: null, cifra: e.ciphertext, cifra_iv: e.iv, cifra_tag: e.tag }), ErroCifraRegistro);
  } finally { definirCifraRegistroParaTeste(undefined); }
});

test('cofre (Contábil): tabela do bloco, valor com dado, textos e ordem das etapas', async () => {
  assert.equal(tabelaDoBloco('cadastro_empresa').tabela, 'wphd.empresa');
  assert.equal(tabelaDoBloco('lancamentos_originais_2024').tabela, tabelaDoBloco('lancamentos_originais').tabela);
  assert.equal(tabelaDoBloco('bloco_inventado').destino, null);
  for (const v of ['', '0', 'N', null, '\\N']) assert.equal(valorComDado(v), false);
  assert.equal(valorComDado('X'), true);
  assert.match(textoCifrarAntigos({ situacao: 'terminou', blocos: 2, pulados: 0, faltam: 0 }), /tudo o que veio do sistema anterior está cifrado/);
  const etapas = etapas007Contabil({ consultar: async () => ({ rows: [] }), banco: () => ({} as any), workspaceValido: () => true, pesadas: [] });
  assert.deepEqual(etapas.map((e) => e.id), ['completar', 'balancete', 'campo_a_campo', 'cofre']);
  assert.match(String((await etapas[3].rodar({ tenantId: 't', cnpj: CNPJ, motivo: '' })).nota), /sem a chave mestra/);
});

// ---------------------------------------------------------------------------------------------------- com banco
const url = process.env.TEST_DATABASE_URL;
const U1 = '00000000-0000-4000-8000-000000000001'; const U2 = '00000000-0000-4000-8000-000000000002';
const QUEM = { userId: U1, login: 'contadora', escritorioId: U1, tenantId: U1 };
async function bancoDeTeste() {
  const schema = `t007c_${process.pid}_${Date.now().toString(36)}`;
  const admin = new Pool({ connectionString: url, max: 1 }); await admin.query(`CREATE SCHEMA ${schema}`); await admin.end();
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  const consultar = (sql: string, p: unknown[] = []) => pool.query(sql, p as any[]);
  const transacao = async <T>(fn: (q: any) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const r = await fn((s: string, p: unknown[] = []) => c.query(s, p as any[])); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  };
  await consultar(`CREATE TABLE contabil_auth_users (id uuid PRIMARY KEY, tenant_id uuid)`);
  await consultar(`CREATE TABLE contabil_auth_company_access (user_id uuid NOT NULL, cnpj text NOT NULL, role text NOT NULL DEFAULT 'operator', PRIMARY KEY (user_id, cnpj))`);
  await consultar(`CREATE TABLE contabil_empresas_compartilhadas (cnpj text PRIMARY KEY, dados jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await consultar(`CREATE TABLE contabil_company_workspaces (cnpj text PRIMARY KEY, payload jsonb NOT NULL, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`);
  await consultar(`CREATE TABLE contabil_period_closures (cnpj text NOT NULL, competencia text NOT NULL, user_id uuid, PRIMARY KEY (cnpj, competencia))`);
  await consultar(`INSERT INTO contabil_auth_users (id, tenant_id) VALUES ($1, $1), ($2, $2)`, [U1, U2]);
  // O núcleo do 007 confere a tabela em public.murad_007_rodadas (produção): aqui o esquema é o do teste.
  const consultar007 = (sql: string, p: unknown[] = []) => consultar(sql.replace(/'public\.murad_007_/g, `'${schema}.murad_007_`), p);
  const fim = async () => { await pool.end(); const a = new Pool({ connectionString: url, max: 1 }); await a.query(`DROP SCHEMA ${schema} CASCADE`); await a.end(); };
  return { consultar, consultar007, transacao, pool, banco: { consultar: consultar as any, transacao }, fim };
}
async function dadosInventados() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre007c-')); const arq = path.join(pasta, 'backup.sql');
  gerarBackupEmpresaGrande(arq, 300);
  const idx = await indexarDump(arq);
  const d = await montarDadosEmpresa(async (nome: string, manter?: (l: any) => boolean) => carregarTabelaDump(idx, nome.toLowerCase(), manter), 7);
  return { d, limpar: () => fs.rmSync(pasta, { recursive: true, force: true }) };
}
const validar = (p: Record<string, unknown>) => workspaceValido(p);
const gravar = (b: Awaited<ReturnType<typeof bancoDeTeste>>, d: any) => gravarEmpresaMigrada(b.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: new Date('2026-11-27T12:00:00Z') });

test('gravação (Contábil) já cifrada: todo bloco do backup sem texto aberto (menos as decisões), e a conferência e a tela leem igual', { skip: !url }, async () => {
  const b = await bancoDeTeste(); const { d, limpar } = await dadosInventados(); definirCifraRegistroParaTeste(cifraTeste());
  try {
    const r = await gravar(b, d);
    assert.equal(r.conferencia.bate, true, r.conferencia.resumo);
    const reg = (await b.consultar(`SELECT * FROM contabil_sistema_anterior WHERE cnpj=$1`, [CNPJ])).rows;
    assert.ok(reg.length >= 2 && reg.every((x) => x.cifra && x.linhas === null), 'registro e resumo cifrados');
    assert.ok(!/INVENTADO/.test(JSON.stringify(reg)), 'nada do backup em texto aberto');
    const { resumo, blocos } = await lerRegistroSistemaAnterior(b.consultar as any, CNPJ);
    assert.equal(resumo?.cdempresa, 7); assert.ok(blocos.length >= 1);
    const um = blocos.find((x) => x.quantidade > 1)!;
    const pag = await lerBlocoSistemaAnterior(b.consultar as any, CNPJ, um.bloco, 1, 2);
    assert.equal(pag.total, um.quantidade); assert.equal(pag.linhas.length, 2);
    assert.deepEqual(pag.linhas, (linhasDoRegistro(reg.find((x) => x.bloco === um.bloco)) as any[]).slice(1, 3));
    const c = await conferirEmpresaMigrada(b.consultar as any, CNPJ);
    assert.equal(c?.bate, true, c?.resumo);
  } finally { definirCifraRegistroParaTeste(undefined); limpar(); await b.fim(); }
});

test('robô da cifra (Contábil): cifra o antigo um bloco por vez, pula empresa em uso e com migração gravando, e nada muda', { skip: !url }, async () => {
  const b = await bancoDeTeste(); const { d, limpar } = await dadosInventados();
  try {
    definirCifraRegistroParaTeste(null); await gravar(b, d); // gravação antiga: tudo aberto
    await b.consultar(`INSERT INTO contabil_sistema_anterior(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,'__decisoes','{"x":{"decisao":"manter"}}'::jsonb,1,'t') ON CONFLICT DO NOTHING`, [CNPJ]);
    const antes = (await b.consultar(`SELECT bloco, linhas FROM contabil_sistema_anterior ORDER BY bloco`)).rows;
    const conf0 = await conferirEmpresaMigrada(b.consultar as any, CNPJ);
    definirCifraRegistroParaTeste(cifraTeste());
    assert.equal((await migrarCifraSistemaAnteriorContabil({ consultar: b.consultar as any, transacao: b.transacao, migracaoGravando: () => true })).situacao, 'migracao_gravando');
    const outra = await b.pool.connect();
    try {
      await outra.query('BEGIN'); await outra.query('SELECT pg_advisory_xact_lock(hashtext($1))', [CNPJ]);
      const r = await migrarCifraSistemaAnteriorContabil({ consultar: b.consultar as any, transacao: b.transacao, migracaoGravando: () => false, lote: 2 });
      assert.equal(r.blocos, 0); assert.ok(r.pulados > 0); assert.ok(r.faltam > 0);
    } finally { await outra.query('ROLLBACK'); outra.release(); }
    let n = 0;
    let r = await migrarCifraSistemaAnteriorContabil({ consultar: b.consultar as any, transacao: b.transacao, migracaoGravando: () => ++n > 2, lote: 1 });
    assert.equal(r.situacao, 'migracao_gravando'); assert.ok(r.blocos >= 1 && r.faltam > 0);
    assert.equal((await conferirEmpresaMigrada(b.consultar as any, CNPJ))?.resumo, conf0?.resumo, 'meio cifrado, meio aberto: lê igual');
    r = await migrarCifraSistemaAnteriorContabil({ consultar: b.consultar as any, transacao: b.transacao, migracaoGravando: () => false, lote: 3 });
    assert.equal(r.situacao, 'terminou'); assert.equal(r.faltam, 0);
    const depois = (await b.consultar(`SELECT * FROM contabil_sistema_anterior ORDER BY bloco`)).rows;
    assert.deepEqual(depois.map((x) => linhasDoRegistro(x)), antes.map((x) => x.linhas), 'conteúdo idêntico');
    const dec = depois.find((x) => x.bloco === '__decisoes'); assert.ok(dec && !dec.cifra, 'as decisões do contador ficam abertas');
    assert.ok(depois.filter((x) => x.bloco !== '__decisoes').every((x) => x.cifra && x.linhas === null));
    assert.equal((await conferirEmpresaMigrada(b.consultar as any, CNPJ))?.resumo, conf0?.resumo);
  } finally { definirCifraRegistroParaTeste(undefined); limpar(); await b.fim(); }
});

test('cofre (Contábil): por coluna e cifrado; painel sem dado; implantação só no cadastro e no vazio; exclusão em cascata', { skip: !url }, async () => {
  const b = await bancoDeTeste(); const { d, limpar } = await dadosInventados(); const cifra = cifraTeste(); definirCifraRegistroParaTeste(cifra);
  try {
    await gravar(b, d);
    await inserirBloco(b.consultar as any, cifra, { cnpj: CNPJ, bloco: 'bloco_inventado', linhas: [{ id: '1', parametro_sem_lugar: 'VALOR SEM LUGAR 77', flag: 'N' }], quantidade: 1, por: 't' });
    const itens = await itensCofreContabil(b.consultar as any, CNPJ);
    const p1 = itens.find((i) => i.tabela === 'bloco_inventado' && i.coluna === 'parametro_sem_lugar');
    assert.ok(p1); assert.equal(p1!.registro, 'bloco_inventado;id=1'); assert.ok(!itens.some((i) => i.coluna === 'flag'));
    for (const i of itens) { const t = tabelaDoBloco(i.tabela).destino; if (t) assert.equal((t.colunas[i.coluna.toLowerCase()] || t.padrao).tipo, 'consulta', `${i.tabela}.${i.coluna} tem campo`); }
    const repo = repo007Postgres(b.consultar007 as any, cifra);
    const etapa = etapas007Contabil({ consultar: b.consultar as any, banco: () => b.banco as any, workspaceValido: validar as any, pesadas: [], guardarCofre: (x) => repo.guardarCofre(x) }).find((e) => e.id === 'cofre')!;
    assert.equal((await etapa.rodar({ tenantId: U1, cnpj: CNPJ, motivo: 't' })).cofre, itens.length);
    assert.ok(!/VALOR SEM LUGAR/.test(JSON.stringify((await b.consultar(`SELECT * FROM murad_007_cofre`)).rows)), 'cofre cifrado');
    const painel = painelCofre007ContabilDoCofre(await repo.linhasCofre('contabil'));
    const l = painel.find((x) => x.tabela === 'bloco_inventado' && x.coluna === 'parametro_sem_lugar')!;
    assert.equal(l.situacao, 'sem_lugar'); assert.equal(l.formato, 'AAAAA AAA AAAAA 99'); assert.ok(!JSON.stringify(painel).includes(CNPJ));
    // Implantação (lista fictícia): só onde está vazio, com a fonte; nunca em lançamento/competência; só no escritório dono.
    const escritorio = async (c: string) => (c === CNPJ ? U1 : 'sem-escritorio');
    const lista = [{ tabela: 'bloco_inventado', coluna: 'parametro_sem_lugar', campo: 'campoNovoTeste', rotulo: 'teste' }];
    const base = { sistema: 'contabil' as const, repo, versaoMapa: 'v1', log: () => undefined };
    const versao0 = Number((await b.consultar(`SELECT version FROM contabil_company_workspaces WHERE cnpj=$1`, [CNPJ])).rows[0].version);
    assert.equal((await implantarDoCofre007(base, implantadores007Contabil(() => b.banco as any, validar as any, escritorio, lista))).implantados, 1);
    const ws = (await b.consultar(`SELECT payload, version FROM contabil_company_workspaces WHERE cnpj=$1`, [CNPJ])).rows[0];
    assert.equal(ws.payload.empresa.campoNovoTeste, 'VALOR SEM LUGAR 77'); assert.equal(ws.payload.empresa.fontes007.campoNovoTeste, fonteDoCofre('bloco_inventado', 'parametro_sem_lugar'));
    assert.equal(validar(ws.payload), true, 'o documento continua válido');
    assert.equal(Number(ws.version), versao0 + 1);
    assert.equal(painelCofre007ContabilDoCofre(await repo.linhasCofre('contabil')).find((x) => x.coluna === 'parametro_sem_lugar')!.situacao, 'implantado');
    // Campo já preenchido (digitado): não sobrescreve. Lançamento/competência: nunca.
    await repo.guardarCofre([{ tenantId: U1, cnpj: CNPJ, sistema: 'contabil', tabela: 'bloco_inventado', coluna: 'outra', registro: 'r', valor: 'OUTRO' }, { tenantId: U1, cnpj: CNPJ, sistema: 'contabil', tabela: 'bloco_inventado', coluna: 'lanc', registro: 'r', valor: '1' }]);
    await implantarDoCofre007({ ...base, versaoMapa: 'v2' }, implantadores007Contabil(() => b.banco as any, validar as any, escritorio, [
      { tabela: 'bloco_inventado', coluna: 'outra', campo: 'campoNovoTeste', rotulo: 'x' }, { tabela: 'bloco_inventado', coluna: 'lanc', campo: 'lancamentos', rotulo: 'x' }]));
    const ws2 = (await b.consultar(`SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1`, [CNPJ])).rows[0].payload;
    assert.equal(ws2.empresa.campoNovoTeste, 'VALOR SEM LUGAR 77', 'nunca sobrescreve');
    assert.equal(ws2.empresa.lancamentos, undefined);
    assert.ok(Array.isArray(ws2.lancamentos), 'lançamentos intactos');
    assert.equal((await repo.linhasCofre('contabil')).find((x) => x.coluna === 'lanc')!.implantado, false, 'lançamento não é implantado');
    // Exclusão: cofre da empresa sai (sem lápide de CNPJ); exclusão do escritório leva só o cofre dele.
    assert.ok((await repo.apagarEmpresa(CNPJ)) > 0);
    assert.equal(Number((await b.consultar(`SELECT count(*)::int AS n FROM murad_007_cofre`)).rows[0].n), 0);
    await repo.guardarCofre([{ tenantId: U2, cnpj: '44555666000181', sistema: 'contabil', tabela: 't', coluna: 'c', registro: 'r', valor: 'v' }, { tenantId: U1, cnpj: '44555666000181', sistema: 'contabil', tabela: 't', coluna: 'c', registro: 'r', valor: 'v' }]);
    await repo.apagarTenant(U2);
    assert.deepEqual((await b.consultar(`SELECT DISTINCT tenant_id FROM murad_007_cofre`)).rows.map((x) => x.tenant_id), [U1]);
  } finally { definirCifraRegistroParaTeste(undefined); limpar(); await b.fim(); }
});

test('colunas da cifra (Contábil) criadas uma vez (preparo idempotente)', { skip: !url }, async () => {
  const b = await bancoDeTeste();
  try {
    await prepararTabelaSistemaAnterior(b.consultar as any); await prepararTabelaSistemaAnterior(b.consultar as any);
    assert.equal(Number((await b.consultar(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='contabil_sistema_anterior' AND column_name IN ('cifra','cifra_iv','cifra_tag')`)).rows[0].n), 3);
  } finally { await b.fim(); }
});
