// Backup agendado ligado aos dados reais do Contábil (Postgres de teste em TEST_DATABASE_URL): o arquivo .murade leva só as
// empresas do escritório e sem certificado; a restauração devolve cadastro e escrituração, mantém o certificado de hoje,
// sobe a versão do workspace e NÃO restaura empresa com período fechado depois do backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { reporCamposCertificado } from '../../src/server/backupAgendadoContabil';

const urlBanco = process.env.TEST_DATABASE_URL;
const cnpjTeste = () => String(Math.floor(Math.random() * 1e14)).padStart(14, '0');

test('Contábil: repor os campos do certificado de hoje no dado do backup', () => {
  const r = reporCamposCertificado({ empresa: { razaoSocial: 'A' }, contas: [] }, { empresa: { razaoSocial: 'B', certificadoAtivo: true }, certificadoX: 1 });
  assert.deepEqual(r, { empresa: { razaoSocial: 'A', certificadoAtivo: true }, contas: [], certificadoX: 1 });
});

test('Contábil: backup agendado e restauração da escrituração, preservando período fechado', { skip: !urlBanco }, async () => {
  process.env.DATABASE_URL = urlBanco;
  process.env.MURADE_BACKUP_MASTER_KEY = 'f'.repeat(64);
  const { prepararAuthContabil, consultaBancoContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const consultar = (sql: string, params: unknown[] = []) => consultaBancoContabil(sql, params) as any;
  const { servicoBackupAgendadoContabil: servico } = await import('../../src/server/backupAgendadoContabil');

  const tenantId = crypto.randomUUID();
  await consultar(`INSERT INTO contabil_auth_users (id, login, password_salt, password_hash, global_admin, tenant_id) VALUES ($1,$2,'s','h',true,$1)`, [tenantId, `bkp-${tenantId}@murade.test`]);
  const workspace = (razao: string, valor: number) => ({
    empresa: { razaoSocial: razao, certificadoAtivo: true, certificadoNomeArquivo: 'cert-sigiloso.pfx' },
    contas: [{ codigo: '1', nome: 'Caixa' }], centrosCusto: [], livros: [], lembretes: [],
    lancamentos: [{ id: 'L1', valor, contaDebitoCodigo: '1', contaCreditoCodigo: '2' }],
  });
  const cnpjs = [cnpjTeste(), cnpjTeste()];
  for (const cnpj of cnpjs) {
    await consultar(`INSERT INTO contabil_auth_company_access (user_id, cnpj, role) VALUES ($1,$2,'admin')`, [tenantId, cnpj]);
    await consultar('INSERT INTO contabil_empresas_compartilhadas (cnpj, dados) VALUES ($1,$2::jsonb)', [cnpj, JSON.stringify({ razaoSocial: `Empresa ${cnpj}` })]);
    await consultar('INSERT INTO contabil_company_workspaces (cnpj, payload) VALUES ($1,$2::jsonb)', [cnpj, JSON.stringify(workspace(`Empresa ${cnpj}`, 100))]);
  }
  const r = await servico.executar(tenantId, { tipo: 'completo', origem: 'manual', usuario: 'teste' });
  assert.ok(r.ok, (r as any).motivo);
  if (!r.ok) return;
  const arq = (await servico.arquivoDe(tenantId, r.registro.id))!;
  assert.equal(arq.includes(Buffer.from('cert-sigiloso')), false);

  // Os lançamentos mudam nas duas empresas; a segunda tem período fechado DEPOIS do backup.
  for (const cnpj of cnpjs) await consultar(`UPDATE contabil_company_workspaces SET payload = $2::jsonb, version = version + 1 WHERE cnpj = $1`, [cnpj, JSON.stringify(workspace(`Empresa ${cnpj}`, 999))]);
  await consultar(`INSERT INTO contabil_period_closures (cnpj, competencia, user_id, login, quantidade_lancamentos, total_debitos) VALUES ($1,'2026-10',$2,'teste',1,999)`, [cnpjs[1], tenantId]);

  const pv = await servico.previaRestauracao(tenantId, 'teste', { id: r.registro.id });
  const ws = pv.itens.find((i) => i.nome === 'workspaces_contabeis')!;
  assert.equal(ws.alterar, 1);
  assert.match(ws.observacao || '', /Período fechado depois do backup/);
  const versaoAntes = (await consultar('SELECT version FROM contabil_company_workspaces WHERE cnpj = $1', [cnpjs[0]])).rows[0].version;
  const fim = await servico.confirmarRestauracao(tenantId, 'teste', pv.token, 'RESTAURAR');
  assert.equal(fim.ok, true, (fim as any).motivo);
  const w0 = (await consultar('SELECT payload, version FROM contabil_company_workspaces WHERE cnpj = $1', [cnpjs[0]])).rows[0];
  assert.equal(w0.payload.lancamentos[0].valor, 100);
  assert.equal(w0.payload.empresa.certificadoNomeArquivo, 'cert-sigiloso.pfx', 'o certificado de hoje continua');
  assert.equal(Number(w0.version), Number(versaoAntes) + 1);
  const w1 = (await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj = $1', [cnpjs[1]])).rows[0];
  assert.equal(w1.payload.lancamentos[0].valor, 999, 'empresa com período fechado depois do backup fica como está');
});
