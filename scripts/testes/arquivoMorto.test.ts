// Arquivo morto (empresa excluída): guarda cifrada por escritório, recuperação só pelo admin, prazo legal e robô que apaga com aviso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.env.MURADE_BACKUP_MASTER_KEY = '22'.repeat(32);
import { guardarNoArquivoMorto, recuperarDoArquivoMorto, rodarRoboPrazoGuarda, guardarAte, marcarManter, TABELA_ARQUIVO_MORTO, ANOS_GUARDA, FONTE_GUARDA } from '../../src/server/arquivoMorto';
import { escritoriosPermitidos } from '../../src/server/arquivoMortoRotas';

const CNPJ = '10368859000101';
function banco(tenant = 'esc-A') {
  const morto: any[] = []; const sqls: string[] = []; const inseridos: Array<{ tabela: string; linhas: any[] }> = [];
  const viva: Record<string, any[]> = { contabil_period_closures: [{ cnpj: CNPJ, competencia: '2026-03', total_debitos: 10 }] };
  let workspace: any = { payload: { lancamentos: [{ id: 'L1', origem: 'manual' }, { id: 'sa-1', origem: 'Sistema anterior' }] }, version: 3 };
  const q = async (sql: string, p: any[] = []): Promise<any> => {
    sqls.push(sql);
    if (/^(CREATE|SAVEPOINT|RELEASE|ROLLBACK TO)/.test(sql.trim()) || sql.includes('pg_advisory')) return { rows: [] };
    if (sql.includes('JOIN contabil_auth_users u')) return { rows: [{ t: tenant }] };
    const g = /to_regclass\('(\w+)'\)/.exec(sql); if (g) return { rows: [{ t: viva[g[1]] ? g[1] : null }] };
    const s = /^SELECT \* FROM (\w+) WHERE cnpj=\$1/.exec(sql); if (s) return { rows: (viva[s[1]] || []).filter((x) => x.cnpj === p[0]) };
    const d = /^DELETE FROM (\w+) WHERE cnpj=\$1/.exec(sql); if (d && viva[d[1]]) { const n = viva[d[1]].length; viva[d[1]] = []; return { rows: [], rowCount: n }; }
    if (sql.startsWith('SELECT payload,version FROM contabil_company_workspaces')) return { rows: workspace ? [workspace] : [] };
    if (sql.startsWith('SELECT payload FROM contabil_company_workspaces')) return { rows: workspace ? [workspace] : [] };
    if (sql.startsWith('SELECT dados FROM contabil_empresas_compartilhadas')) return { rows: [] };
    if (sql.startsWith('INSERT INTO contabil_company_workspaces')) { workspace = { payload: JSON.parse(p[1]), version: 1 }; return { rows: [], rowCount: 1 }; }
    if (sql.startsWith(`INSERT INTO ${TABELA_ARQUIVO_MORTO}`)) { morto.push({ id: p[0], tenant_id: p[1], cnpj: p[2], guardar_ate: p[4], conteudo: p[6] }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith(`SELECT id, conteudo FROM ${TABELA_ARQUIVO_MORTO}`)) return { rows: morto.filter((m) => m.tenant_id === p[0] && m.cnpj === p[1]) };
    if (sql.startsWith(`DELETE FROM ${TABELA_ARQUIVO_MORTO} WHERE id=$1`)) { const i = morto.findIndex((m) => m.id === p[0]); morto.splice(i, 1); return { rows: [], rowCount: 1 }; }
    const ins = /^INSERT INTO (\w+) SELECT \* FROM jsonb_populate_recordset/.exec(sql); if (ins) { const linhas = JSON.parse(p[0]); inseridos.push({ tabela: ins[1], linhas }); (viva[ins[1]] ||= []).push(...linhas); return { rows: [], rowCount: linhas.length }; }
    if (sql.startsWith(`UPDATE ${TABELA_ARQUIVO_MORTO} SET manter`)) return { rows: [], rowCount: morto.filter((m) => m.tenant_id === p[0] && m.cnpj === p[1]).length };
    if (sql.startsWith(`UPDATE ${TABELA_ARQUIVO_MORTO} SET aviso_em`) || sql.startsWith(`DELETE FROM ${TABELA_ARQUIVO_MORTO} WHERE manter=false`)) return { rows: [], rowCount: 0 };
    if (sql.startsWith(`SELECT count(*)::int AS n FROM ${TABELA_ARQUIVO_MORTO}`)) return { rows: [{ n: 0 }] };
    if (sql.startsWith('DELETE FROM contabil_ai_agent_log')) return { rows: [], rowCount: 0 };
    throw new Error(`SQL não previsto: ${sql.slice(0, 80)}`);
  };
  return { q, morto, sqls, viva, inseridos, ws: () => workspace, setWs: (w: any) => { workspace = w; }, banco: { consultar: q, transacao: async (fn: any) => fn(q) } };
}

test('prazo de guarda pela regra do CTN: decadência (5 anos a partir de 1º de janeiro seguinte) + prescrição (5) — até 31/12 do ano + 10', () => {
  assert.equal(ANOS_GUARDA, 10); assert.equal(guardarAte(2026), '2036-12-31');
  assert.match(FONTE_GUARDA, /173, I/); assert.match(FONTE_GUARDA, /195/); assert.match(FONTE_GUARDA, /8\.212\/1991, art\. 32, § 11/);
});

test('guarda cifrado com a chave do escritório, sem os dados da migração do sistema anterior, e recupera só para o mesmo escritório', async () => {
  const b = banco();
  const g = await guardarNoArquivoMorto(b.q, CNPJ, { por: 'ana' }, new Date('2026-11-23T12:00:00Z'));
  assert.equal(g.guardados, 2); assert.equal(b.morto.length, 1); assert.equal(b.morto[0].guardar_ate, '2036-12-31');
  assert.equal(b.viva.contabil_period_closures.length, 0);
  // outro escritório não consegue abrir (a chave é do escritório)
  await assert.rejects(recuperarDoArquivoMorto(b.banco as any, 'esc-B', CNPJ, 'intruso').then((r) => { if (r.recuperados === 0) throw new Error('nada'); }), /nada/);
  b.morto[0].tenant_id = 'esc-B'; await assert.rejects(recuperarDoArquivoMorto(b.banco as any, 'esc-B', CNPJ, 'intruso'), /outro escritório/); b.morto[0].tenant_id = 'esc-A';
  // recadastro sem lançamentos: o admin recupera tudo e o item sai do arquivo morto
  b.setWs({ payload: { lancamentos: [] }, version: 1 });
  const r = await recuperarDoArquivoMorto(b.banco as any, 'esc-A', CNPJ, 'admin');
  assert.equal(r.workspace, 'recuperado'); assert.deepEqual(r.porTabela, { contabil_period_closures: 1 }); assert.equal(r.pendencias.length, 0);
  assert.deepEqual(b.ws().payload.lancamentos.map((l: any) => l.id), ['L1'], 'migração do sistema anterior não vai para o arquivo morto');
  assert.equal(b.morto.length, 0);
});

test('recadastro com lançamentos novos: a escrituração guardada não é misturada e continua guardada (pendência)', async () => {
  const b = banco();
  await guardarNoArquivoMorto(b.q, CNPJ, {}, new Date('2026-11-23T12:00:00Z'));
  b.setWs({ payload: { lancamentos: [{ id: 'novo' }] }, version: 1 });
  const r = await recuperarDoArquivoMorto(b.banco as any, 'esc-A', CNPJ, 'admin');
  assert.equal(r.workspace, 'ja_tinha_lancamentos'); assert.equal(r.pendencias.length, 1); assert.equal(b.morto.length, 1);
  assert.deepEqual(b.ws().payload.lancamentos.map((l: any) => l.id), ['novo']);
});

test('robô do prazo: avisa 60 dias antes, apaga só o vencido avisado há 30 dias ou mais e nunca o marcado "manter"', async () => {
  const b = banco();
  const r = await rodarRoboPrazoGuarda(b.q, '2036-12-31');
  const sqlAviso = b.sqls.find((s) => s.startsWith(`UPDATE ${TABELA_ARQUIVO_MORTO} SET aviso_em`))!;
  const sqlApaga = b.sqls.find((s) => s.startsWith(`DELETE FROM ${TABELA_ARQUIVO_MORTO} WHERE manter=false`))!;
  assert.match(sqlAviso, /aviso_em IS NULL AND guardar_ate <= \(\$1::date \+ 60\)/);
  assert.match(sqlApaga, /manter=false AND guardar_ate < \$1::date AND aviso_em IS NOT NULL AND aviso_em <= \(\$1::date - 30\)/);
  assert.match(r.resumo, /CTN/);
  await assert.rejects(marcarManter(b.q, 'esc-A', CNPJ, true, '', 'admin'), /motivo/);
});

test('quem pode recuperar: só administrador do escritório (o dono do sistema também os "sem escritório"); recadastro não puxa nada sozinho', () => {
  assert.deepEqual(escritoriosPermitidos(undefined), []);
  assert.deepEqual(escritoriosPermitidos({ tenantId: 'A', administrador: false, donoSistema: false, cnpjs: [], login: 'x' }), []);
  assert.deepEqual(escritoriosPermitidos({ tenantId: 'A', administrador: true, donoSistema: false, cnpjs: [], login: 'x' }), ['A']);
  assert.deepEqual(escritoriosPermitidos({ tenantId: 'D', administrador: true, donoSistema: true, cnpjs: [], login: 'x' }), ['D', 'sem-escritorio']);
  const codigo = ['src/server/authContabil.ts', 'src/components/tabs/EmpresaTab.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/recuperarDoArquivoMorto|arquivo-morto\/[^']*recuperar/.test(codigo.replace(/DocumentosGuardadosPainel/g, '')), 'o cadastro da empresa não chama a recuperação');
  const srv = readFileSync('server.ts', 'utf8');
  assert.match(srv, /registrarRobo\(\{ id: "prazo_guarda"/); assert.match(srv, /registrarRotinaManual\("prazo_guarda"/);
});
