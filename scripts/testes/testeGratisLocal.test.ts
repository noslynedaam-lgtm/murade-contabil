import test from 'node:test';
import assert from 'node:assert/strict';
import * as tl from '../../src/server/testeGratisLocal';

// Banco de mentira só com o que as travas do teste leem (o mesmo arquivo é testado no Fiscal com Postgres em memória).
function banco(testes: Array<{ escritorio_id: string; login: string; situacao: string; fim: string | null; limite_empresas: number; serpro: boolean }>, acessos: Array<{ user_id: string; cnpj: string }>) {
  tl.esquecerPreparoTesteLocal();
  const sqls: string[] = [];
  const c: tl.Consultar = async (sql, params = []) => {
    sqls.push(sql);
    if (/^\s*CREATE TABLE/i.test(sql)) return { rows: [] };
    if (/FROM contabil_teste_gratis WHERE situacao IN/.test(sql)) return { rows: testes.filter((t) => ['ativo', 'encerrado'].includes(t.situacao)) };
    if (/SELECT DISTINCT cnpj FROM contabil_auth_company_access WHERE user_id::text=\$1/.test(sql)) return { rows: [...new Set(acessos.filter((a) => a.user_id === params[0]).map((a) => a.cnpj))].map((cnpj) => ({ cnpj })) };
    if (/SELECT count\(DISTINCT cnpj\)::int AS n FROM contabil_auth_company_access/.test(sql)) return { rows: [{ n: new Set(acessos.filter((a) => a.user_id === params[0]).map((a) => a.cnpj)).size }] };
    if (/user_id::text = ANY/.test(sql)) return { rows: acessos.filter((a) => (params[0] as string[]).includes(a.user_id)).map((a) => ({ cnpj: a.cnpj })) };
    throw new Error(`SQL inesperado no teste: ${sql}`);
  };
  return { c, sqls };
}
const somar = (n: number) => { const d = new Date(`${tl.hojeSP()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test('Contábil: 3ª empresa recusada no teste grátis; empresa do escritório segue; cliente fora de teste nunca é barrado', async () => {
  const { c } = banco([{ escritorio_id: 'esc-teste', login: 't@exemplo.com.br', situacao: 'ativo', fim: somar(29), limite_empresas: 2, serpro: false }],
    [{ user_id: 'esc-teste', cnpj: '11222333000181' }, { user_id: 'esc-teste', cnpj: '11444777000161' }, { user_id: 'contadora', cnpj: '45723174000110' }]);
  assert.equal(await tl.checarLimiteLocal(c, 'contabil', 'esc-teste', '45723174000110'), 'No teste grátis dá para usar até 2 empresas. Para mais, fale com a gente para contratar.');
  assert.equal(await tl.checarLimiteLocal(c, 'contabil', 'esc-teste', '11444777000161'), null);
  assert.equal(await tl.checarLimiteLocal(c, 'contabil', 'contadora', '99888777000166'), null);
  const s = await tl.situacaoLocal(c, 'contabil', 'esc-teste');
  assert.equal(s.mensagem, 'Teste grátis: faltam 30 dias'); assert.equal(s.empresasUsadas, 2);
  assert.deepEqual(await tl.situacaoLocal(c, 'contabil', 'contadora'), { emTeste: false });
});

test('Contábil: teste vencido fica só leitura (ver, baixar backup e sair continuam); outro escritório não é afetado', async () => {
  const { c } = banco([{ escritorio_id: 'esc-teste', login: 't@exemplo.com.br', situacao: 'ativo', fim: somar(-1), limite_empresas: 2, serpro: false }], []);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'esc-teste', 'POST', '/api/auth/companies'), tl.MSG_ENCERRADO);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'esc-teste', 'PUT', '/api/workspaces/11222333000181'), tl.MSG_ENCERRADO);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'esc-teste', 'GET', '/api/workspaces'), null);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'esc-teste', 'POST', '/api/auth/logout'), null);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'esc-teste', 'POST', '/api/contabil/backups/gerar'), null);
  assert.equal(await tl.travaEncerradoLocal(c, 'contabil', 'outro', 'POST', '/api/auth/companies'), null);
  assert.equal(await tl.checarLimiteLocal(c, 'contabil', 'esc-teste', '11222333000181'), tl.MSG_ENCERRADO);
  assert.equal((await tl.situacaoLocal(c, 'contabil', 'esc-teste')).situacao, 'encerrado');
});

test('Contábil: dias que faltam contam o último dia; Serpro bloqueado no teste por padrão', async () => {
  assert.equal(tl.diasRestantes(tl.hojeSP()), 1);
  assert.equal(tl.situacaoEfetiva('ativo', somar(-1)), 'encerrado');
  assert.equal(tl.situacaoEfetiva('ativo', tl.hojeSP()), 'ativo');
  const { c } = banco([{ escritorio_id: 'esc-teste', login: 't@exemplo.com.br', situacao: 'ativo', fim: somar(5), limite_empresas: 2, serpro: false }], []);
  assert.equal(await tl.serproBloqueadoNoTeste(c, 'contabil', 'esc-teste'), true);
  assert.equal(await tl.serproBloqueadoNoTeste(c, 'contabil', 'contadora'), false);
});
