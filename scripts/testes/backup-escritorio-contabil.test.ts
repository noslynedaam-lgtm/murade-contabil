// Teste de integração: precisa de um Postgres de teste em TEST_DATABASE_URL (sem ele, os testes de banco são
// ignorados — mesma convenção dos demais testes de integração deste repositório). O módulo guarda o conteúdo
// cifrado em bytea e decifra de volta na própria conferência, algo que um banco de mentira não reproduz com
// fidelidade.
//
// Usa o esquema de verdade (prepararAuthContabil) e ids/CNPJs aleatórios por execução — nunca DROP/TRUNCATE em
// tabela compartilhada — porque outros testes de integração deste repositório usam o mesmo Postgres de teste.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import {
  gerarBackupEscritorio, listarBackupsEscritorio, baixarBackupEscritorio, prunarBackupsAntigos,
  nomeArquivoBackup, periodoDe, EXTENSAO_BACKUP, garantirTabelaBackups, limparCacheBackupsParaTeste,
  removerCamposCertificado, marcarEmailBackupEnviado,
} from '../../src/services/backupEscritorioContabilService';

const urlBanco = process.env.TEST_DATABASE_URL;
const CHAVE_MESTRA = 'a'.repeat(64); // 32 bytes em hexadecimal — só para teste.
const env = (chave: string | undefined = CHAVE_MESTRA) => ({ MURADE_BACKUP_MASTER_KEY: chave } as NodeJS.ProcessEnv);
const cnpjTeste = () => String(Math.floor(Math.random() * 1e14)).padStart(14, '0');

async function banco() {
  limparCacheBackupsParaTeste();
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const consultar = (sql: string, params: unknown[] = []) => pool.query(sql, params) as any;
  return { pool, consultar };
}

/** Cria um "escritório" de teste: usuário administrador dono (tenant_id = próprio id) com uma empresa vinculada,
 * já com um workspace contábil (plano de contas + lançamento) e cadastro informativo de certificado A1 — que o
 * backup nunca deve levar. */
async function cadastrarEmpresa(consultar: any, razaoSocial: string): Promise<{ tenantId: string; cnpj: string }> {
  const tenantId = crypto.randomUUID();
  const cnpj = cnpjTeste();
  await consultar(
    `INSERT INTO contabil_auth_users (id, login, password_salt, password_hash, global_admin, tenant_id) VALUES ($1,$2,'s','h',true,$1)`,
    [tenantId, `teste-${tenantId}@murade.test`],
  );
  await consultar(`INSERT INTO contabil_auth_company_access (user_id, cnpj, role) VALUES ($1,$2,'admin')`, [tenantId, cnpj]);
  await consultar('INSERT INTO contabil_empresas_compartilhadas (cnpj, dados) VALUES ($1,$2::jsonb)', [cnpj, JSON.stringify({ razaoSocial })]);
  await consultar(
    'INSERT INTO contabil_company_workspaces (cnpj, payload) VALUES ($1,$2::jsonb)',
    [cnpj, JSON.stringify({
      empresa: { razaoSocial, cnpj, certificadoAtivo: true, certificadoNomeArquivo: 'cert-sigiloso.pfx', certificadoValidade: '2030-01-01' },
      contas: [{ codigo: '1', nome: 'Caixa' }],
      lancamentos: [{ id: 'L1', valor: 100, contaDebitoCodigo: '1', contaCreditoCodigo: '2' }],
    })],
  );
  return { tenantId, cnpj };
}

test('gera, cifra e confere o backup de um escritório com sua empresa', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar, 'Empresa A Contabilidade');
    const periodo = periodoDe(new Date('2026-11-05T12:00:00Z'));
    const r = await gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());
    assert.equal(r.criado, true);
    assert.equal(r.motivo, 'gerado');
    assert.equal(r.registro?.status, 'ok');
    assert.equal(r.registro?.verificado, true);
    assert.equal(r.registro?.tabelas.empresas, 1);
    assert.equal(r.registro?.tabelas.workspaces_contabeis, 1);

    const baixado = await baixarBackupEscritorio(consultar, empresaA.tenantId, r.registro!.id);
    assert.ok(baixado);
    // O conteúdo baixado está cifrado: não pode conter o texto puro da razão social nem do certificado em
    // nenhum lugar do arquivo.
    assert.ok(!baixado!.conteudo.toString('latin1').includes('Empresa A Contabilidade'));
    assert.ok(!baixado!.conteudo.toString('latin1').includes('cert-sigiloso.pfx'));
    assert.ok(baixado!.nomeArquivo.endsWith(EXTENSAO_BACKUP));
  } finally { await pool.end(); }
});

test('nunca leva o certificado digital A1: campos "certificado*" são removidos antes de empacotar', () => {
  const limpo = removerCamposCertificado({
    empresa: { razaoSocial: 'Empresa X', certificadoAtivo: true, certificadoNomeArquivo: 'a.pfx', certificadoValidade: '2030-01-01' },
    contas: [{ codigo: '1', nome: 'Caixa' }],
  });
  assert.equal(limpo.empresa.razaoSocial, 'Empresa X');
  assert.equal(limpo.empresa.certificadoAtivo, undefined);
  assert.equal(limpo.empresa.certificadoNomeArquivo, undefined);
  assert.equal(limpo.empresa.certificadoValidade, undefined);
  assert.deepEqual(limpo.contas, [{ codigo: '1', nome: 'Caixa' }]);
});

test('isolamento: um escritório nunca lê nem baixa o backup de outro', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar, 'Empresa A');
    const empresaB = await cadastrarEmpresa(consultar, 'Empresa B Sigilosa');
    const periodo = periodoDe(new Date('2026-11-05T12:00:00Z'));
    const a = await gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());
    const b = await gerarBackupEscritorio(consultar, empresaB.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());

    // B não consegue baixar o backup de A, e vice-versa — mesmo sabendo o id.
    assert.equal(await baixarBackupEscritorio(consultar, empresaB.tenantId, a.registro!.id), null);
    assert.equal(await baixarBackupEscritorio(consultar, empresaA.tenantId, b.registro!.id), null);

    // A listagem de cada escritório só mostra o próprio backup.
    const listaA = await listarBackupsEscritorio(consultar, empresaA.tenantId);
    const listaB = await listarBackupsEscritorio(consultar, empresaB.tenantId);
    assert.equal(listaA.length, 1); assert.equal(listaB.length, 1);
    assert.notEqual(listaA[0].id, listaB[0].id);

    // O conteúdo decifrável do backup de A não contém nada da empresa de B.
    const baixadoA = await baixarBackupEscritorio(consultar, empresaA.tenantId, a.registro!.id);
    assert.ok(!baixadoA!.conteudo.toString('latin1').includes('Empresa B Sigilosa'));
    assert.ok(!baixadoA!.conteudo.toString('latin1').includes(empresaB.cnpj));
  } finally { await pool.end(); }
});

test('não gera de novo no mesmo período; detecta ausência de empresas', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar, 'Empresa A');
    const periodo = periodoDe(new Date('2026-11-05T12:00:00Z'));
    const primeiro = await gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());
    assert.equal(primeiro.criado, true);
    const segundo = await gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T13:00:00Z'), env());
    assert.equal(segundo.criado, false);
    assert.equal(segundo.motivo, 'ja_existe');

    const semEmpresa = await gerarBackupEscritorio(consultar, crypto.randomUUID(), periodo, new Date('2026-11-05T12:00:00Z'), env());
    assert.equal(semEmpresa.criado, false);
    assert.equal(semEmpresa.motivo, 'sem_empresas');
  } finally { await pool.end(); }
});

test('sem a chave mestra configurada, a geração falha com mensagem clara (nada fica gravado como pronto)', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar, 'Empresa A');
    const periodo = periodoDe(new Date('2026-11-05T12:00:00Z'));
    await assert.rejects(
      gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env('')),
      /MURADE_BACKUP_MASTER_KEY/,
    );
    const lista = await listarBackupsEscritorio(consultar, empresaA.tenantId);
    assert.equal(lista.length, 0);
  } finally { await pool.end(); }
});

test('retenção: mantém só o backup do mês corrente de cada escritório (decisão do dono de 06/11/2026)', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    await garantirTabelaBackups(consultar);
    const tenantId = crypto.randomUUID();
    const periodos: string[] = [];
    for (let i = 0; i < 3; i++) {
      const data = new Date(Date.UTC(2026, 10 - i, 1)); // 3 meses, terminando em novembro/2026
      const periodo = periodoDe(data);
      periodos.push(periodo);
      await consultar(
        `INSERT INTO murade_contabil_backups (id, tenant_id, periodo, nome_arquivo, iv, tag, conteudo_cifrado, tamanho_bytes, checksum_sha256, tabelas, status, verificado)
         VALUES ($1,$2,$3,$4,'00','00',$5,1,$6,'{}','ok',true)`,
        [crypto.randomUUID(), tenantId, periodo, `x${i}.mcbx`, Buffer.from([1]), 'f'.repeat(64)],
      );
    }
    const maisRecente = periodos[0];
    const apagados = await prunarBackupsAntigos(consultar, tenantId);
    assert.equal(apagados, 2);
    const restantes = await listarBackupsEscritorio(consultar, tenantId);
    assert.equal(restantes.length, 1);
    assert.equal(restantes[0].periodo, maisRecente);
  } finally { await pool.end(); }
});

test('email_enviado começa falso e só o próprio escritório marca o seu', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const empresaA = await cadastrarEmpresa(consultar, 'Empresa A');
    const empresaB = await cadastrarEmpresa(consultar, 'Empresa B');
    const periodo = periodoDe(new Date('2026-11-05T12:00:00Z'));
    const a = await gerarBackupEscritorio(consultar, empresaA.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());
    const b = await gerarBackupEscritorio(consultar, empresaB.tenantId, periodo, new Date('2026-11-05T12:00:00Z'), env());
    assert.equal(a.registro?.emailEnviado, false);
    assert.equal(b.registro?.emailEnviado, false);

    await marcarEmailBackupEnviado(consultar, crypto.randomUUID(), b.registro!.id);
    assert.equal((await listarBackupsEscritorio(consultar, empresaB.tenantId))[0].emailEnviado, false);

    await marcarEmailBackupEnviado(consultar, empresaB.tenantId, b.registro!.id);
    assert.equal((await listarBackupsEscritorio(consultar, empresaB.tenantId))[0].emailEnviado, true);
    assert.equal((await listarBackupsEscritorio(consultar, empresaA.tenantId))[0].emailEnviado, false);
  } finally { await pool.end(); }
});

test('nome do arquivo é opaco: sem palavras reveladoras, com extensão própria', () => {
  for (let i = 0; i < 20; i++) {
    const nome = nomeArquivoBackup();
    assert.ok(nome.endsWith(EXTENSAO_BACKUP));
    assert.doesNotMatch(nome.toLowerCase(), /backup|dump|sql|bak|banco/);
  }
});
