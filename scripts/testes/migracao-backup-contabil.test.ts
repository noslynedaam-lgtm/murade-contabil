// Migração da parte contábil pelo backup do sistema anterior: leitura, conversão, junção com o que já existe,
// conferência com os saldos de lá, gravação (banco simulado), fluxo da tela e exclusão.
// Usa linhas REAIS anonimizadas (scripts/testes/fixtures/backup-contabil-anonimizado.sql: nomes, históricos, documentos
// e CNPJs trocados). Se o backup completo estiver nesta máquina, confere também todas as empresas dele (lidos = gravados).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { centavos, converterClassificacao, listarEmpresasContabeis, montarDadosEmpresa, ORIGEM_SISTEMA_ANTERIOR, type DadosContabeisEmpresa } from '../../src/server/migracaoSistemaAnterior/conversor';
import { conferirMigracao } from '../../src/server/migracaoSistemaAnterior/conferencia';
import { mesclarMigracao } from '../../src/server/migracaoSistemaAnterior/mesclagem';
import { BLOCO_RESUMO, ErroMigracao, gravarEmpresaMigrada } from '../../src/server/migracaoSistemaAnterior/banco';
import { gerarPreviaContabil, gravarMigracaoContabil, listarEmpresasDoBackupContabil, receberArquivoContabil, situacaoMigracaoContabilDoUsuario } from '../../src/server/migracaoSistemaAnterior/servico';
import { tabelaContabilInteressa } from '../../src/utils/tabelasSistemaAnteriorContabil';
import { workspaceValido, cnpjContabilValido } from '../../src/server/authContabil';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import { semDadosDoSistemaAnterior } from '../../src/server/exclusaoEmpresaCascata';
import { kitContabil } from '../../src/server/agenteContabil';
import { ROBOS_APRESENTACAO } from '../../src/data/apresentacaoSistema';
import type { BancoTransacional, ConsultaSql } from '../../src/server/exclusaoEmpresaCascata';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql');
const BACKUP_REAL = '/home/claude/alterdata-restore/ALTERDATA_PACK.backup';

async function abrir(arquivo = FIXTURE) {
  const idx = await indexarDump(arquivo);
  const cache = new Map<string, any>();
  const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
  const comDados = [...idx.tabelas.values()].filter((t) => t.fim > t.inicio).map((t) => t.nome);
  const empresas = listarEmpresasContabeis((await ler('wphd.empresa')) || [], (await ler('wcont.empcont')) || [], comDados);
  return { idx, ler, empresas };
}
const referencia = (d: DadosContabeisEmpresa) => ({ esperado: d.esperado, esperadoLancamentos: d.esperadoLancamentos, saldoFinalEsperado: d.saldoFinalEsperado, lancamentosGravados: d.lancamentos.length, semSaldosParaConferir: d.semSaldosParaConferir, linhasQueNaoEntraram: d.naoEntraram.length });

test('só as tabelas da parte contábil são levadas (fixas e por empresa)', () => {
  for (const t of ['wcont.contas', 'wcont.mv00023', 'wcont.sd00001', 'wcont.lt00045', 'wativo.be00002', 'wphd.empresa', 'wcont.hist']) assert.ok(tabelaContabilInteressa(t.split('.')[0], t.split('.')[1]), t);
  for (const t of ['wdp.f00001', 'wcont.plano_ref', 'wcont.ecf_linha', 'wcont.mv0002', 'wcont.alterdatalock', 'wfiscal.empresa']) assert.ok(!tabelaContabilInteressa(t.split('.')[0], t.split('.')[1]), t);
  assert.equal(converterClassificacao('1-1-01-01-01'), '1.1.01.01.01');
  assert.equal(converterClassificacao('2-3-01'), '2.3.01');
  assert.equal(centavos(235451.47999999998), 23545148);
  assert.equal(centavos(-1319.06), -131906);
});

test('lista as empresas com parte contábil: com CNPJ e as que não têm mais cadastro (sem as empresas-modelo)', async () => {
  const { empresas } = await abrir();
  assert.deepEqual(empresas.filter((e) => !e.semCadastro).map((e) => e.cdempresa).sort((a, b) => a - b), [3, 8, 23, 49]);
  assert.deepEqual(empresas.filter((e) => e.semCadastro).map((e) => e.cdempresa).sort((a, b) => a - b), [1, 17]);
  assert.ok(empresas.every((e) => e.cdempresa < 99990));
  assert.ok(empresas.find((e) => e.cdempresa === 3)!.cnpj.length === 14);
});

test('sinal do sistema anterior: negativo = débito, positivo = crédito; cada par vira uma partida com histórico, lote e documento', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const mv = (await ler('wcont.mv00049'))!;
  assert.equal(d.lancamentos.length, mv.length / 2);
  const l = d.lancamentos[0];
  const pernas = mv.filter((m: any) => d.lancamentos[0].id.endsWith(String(m.idmovimento)) || (String(m.idlote) === String(mv.find((x: any) => l.id.endsWith(String(x.idmovimento)))?.idlote) && Number(m.idlotelancamento) === Number(mv.find((x: any) => l.id.endsWith(String(x.idmovimento)))?.idlotelancamento)));
  const deb = pernas.find((m: any) => m.vllancamento < 0); const cred = pernas.find((m: any) => m.vllancamento > 0);
  assert.ok(deb && cred);
  assert.equal(l.valor, cred.vllancamento);
  assert.equal(l.origem, ORIGEM_SISTEMA_ANTERIOR);
  assert.ok(l.historico.startsWith('Historico '));
  assert.match(String(l.documentoRef), /^Lote /);
  assert.ok(d.lancamentos.every((x) => x.competencia === x.data.slice(0, 7) && x.valor > 0 && x.contaDebitoCodigo !== x.contaCreditoCodigo));
});

test('código repetido no plano do sistema anterior ganha código livre (com aviso), nada some', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const codigos = d.contas.map((c) => c.codigo);
  assert.equal(new Set(codigos).size, codigos.length, 'códigos únicos no Murad');
  assert.ok(d.avisos.some((a) => /recebeu o código 1\.1\.04\.01\.\d+/.test(a)));
  assert.ok(d.contas.length >= 687);
});

test('conta de outro plano que a empresa usou antes: mesmo nome junta no mesmo código; nome diferente ganha código próprio', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 3);
  assert.equal(d.avisos.filter((a) => /veio de outro plano de contas/.test(a)).length, 1);
  const r = conferirMigracao(d.contas, d.lancamentos, referencia(d));
  assert.equal(r.bate, true, r.resumo);
  assert.equal(r.bateComSaldos, true);
});

test('lote de abertura com várias contas vira lançamento de várias partidas que fecha débito = crédito', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 23);
  const lotes = new Map<string, number>();
  for (const l of d.lancamentos.filter((x) => x.loteId)) lotes.set(l.loteId!, (lotes.get(l.loteId!) || 0) + 1);
  assert.ok(lotes.size >= 1, 'há partidas múltiplas');
  assert.equal(d.naoEntraram.length, 0);
  const r = conferirMigracao(d.contas, d.lancamentos, referencia(d));
  assert.equal(r.bate, true, r.resumo);
});

test('conferência: bate com saldos e com os lançamentos originais (inclusive saldos antigos sem total do mês)', async () => {
  const { ler } = await abrir();
  for (const cd of [3, 8, 23, 49]) {
    const d = await montarDadosEmpresa(ler, cd);
    const r = conferirMigracao(d.contas, d.lancamentos, referencia(d));
    assert.equal(r.bate, true, `${cd}: ${r.resumo}`);
    assert.equal(r.lancamentosNoMurade, d.lancamentos.length);
  }
});

test('conferência pega diferença: lançamento a menos, valor mudado e linha que não entrou', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const menos = conferirMigracao(d.contas, d.lancamentos.slice(1), referencia(d));
  assert.equal(menos.bate, false); assert.match(menos.resumo, /faltam 1/);
  const mudado = d.lancamentos.map((l, i) => (i === 0 ? { ...l, valor: l.valor + 0.01 } : l));
  const r = conferirMigracao(d.contas, mudado, referencia(d));
  assert.equal(r.bate, false); assert.ok(r.diferencas.length > 0 && r.diferencasLancamentosOriginais.length > 0);
  // Empresa sem plano no arquivo: as linhas ficam guardadas e a conferência diz que não bate.
  const orfa = await montarDadosEmpresa(ler, 1);
  assert.equal(orfa.naoEntraram.length, 46);
  assert.ok(orfa.naoEntraram.every((x) => /não existe/.test(x.motivo)));
  assert.equal(conferirMigracao(orfa.contas, orfa.lancamentos, referencia(orfa)).bate, false);
  assert.equal(orfa.blocos.lancamentos_originais.length, 46, 'as 46 linhas estão no registro do sistema anterior');
});

test('saldo antigo desatualizado no próprio sistema anterior: vale o lançamento de lá e a conferência explica', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 17);
  const r = conferirMigracao(d.contas, d.lancamentos, referencia(d));
  assert.equal(r.bateComLancamentosOriginais, true);
  assert.equal(r.bateComSaldos, false);
  assert.ok(r.saldosAntigosDesatualizadosNoSistemaAnterior > 0);
  assert.equal(r.bate, true); assert.match(r.resumo, /desatualizada/);
});

test('lançamentos em lote ABERTO no sistema anterior não entram no balancete: ficam no registro para consulta', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 3);
  assert.equal(d.blocos.lancamentos_lote_aberto.length, 16);
  assert.ok(d.avisos.some((a) => /lote ABERTO/.test(a)));
  assert.ok(!d.lancamentos.some((l) => d.blocos.lancamentos_lote_aberto.some((a: any) => l.id.includes(String(a.idlancamento)))));
  for (const b of ['plano_contas', 'lotes', 'lancamentos_originais', 'saldos', 'historicos_padrao']) assert.ok(d.blocos[b]?.length, b);
});

test('junção: empresa nova fica só com o plano real; empresa com o modelo sem uso troca as contas do modelo e passa na validação', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 23);
  const nova: any = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.ok(nova.payload && workspaceValido(nova.payload));
  assert.equal(nova.payload!.contas.length, d.contas.length);
  assert.equal(nova.payload!.empresa.cnpj, d.cnpj);
  const comModelo = { empresa: { cnpj: d.cnpj, razaoSocial: 'Já cadastrada' }, contas: JSON.parse(JSON.stringify(planoContasModelo)), centrosCusto: [], lancamentos: [], livros: [], lembretes: [] };
  const m: any = mesclarMigracao(comModelo, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.ok(m.payload && workspaceValido(m.payload));
  assert.equal(m.payload!.empresa.razaoSocial, 'Já cadastrada', 'cadastro preenchido não muda');
  assert.ok(m.contasDoModeloRetiradas > 0);
  assert.equal(conferirMigracao(m.payload!.contas, m.payload!.lancamentos, referencia(d)).bate, true);
});

test('junção não mexe no trabalho da equipe: lançamento, conta usada e histórico padrão ficam; remigrar não duplica', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const conta = d.contas.find((c) => c.tipo === 'analitica')!;
  const outra = d.contas.filter((c) => c.tipo === 'analitica')[1];
  const daEquipe = { id: 'man-1', data: '2026-10-05', contaDebitoCodigo: conta.codigo, contaDebitoNome: 'Nome da equipe', contaCreditoCodigo: outra.codigo, contaCreditoNome: outra.descricao, valor: 10, historico: 'Feito no Murad', origem: 'Manual', statusManual: 'aprovado' };
  const atual = { empresa: { cnpj: d.cnpj }, contas: [{ codigo: conta.codigo, descricao: 'Nome da equipe', nivel: conta.nivel, tipo: 'analitica', natureza: conta.natureza }, { ...outra }], centrosCusto: [], lancamentos: [daEquipe], livros: [], lembretes: [], historicosPadrao: [{ id: 'h1', codigo: d.historicosPadrao[0].codigo, texto: 'Texto da equipe' }] };
  const m = mesclarMigracao(atual, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.ok(m.payload, m.bloqueio);
  assert.deepEqual(m.payload!.lancamentos.find((l: any) => l.id === 'man-1'), daEquipe);
  assert.equal(m.payload!.contas.find((c: any) => c.codigo === conta.codigo).descricao, 'Nome da equipe');
  assert.equal(m.payload!.historicosPadrao.find((h: any) => h.codigo === d.historicosPadrao[0].codigo).texto, 'Texto da equipe');
  const de_novo = mesclarMigracao(m.payload, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.equal(de_novo.payload!.lancamentos.length, m.payload!.lancamentos.length, 'remigrar troca, não duplica');
  assert.equal(de_novo.lancamentosSubstituidos, d.lancamentos.length);
  // Conta usada pela equipe com o mesmo código mas de outro tipo: a empresa não é gravada e o motivo aparece.
  const sint = d.contas.find((c) => c.tipo === 'sintetica')!;
  const conflito = { ...atual, contas: [...atual.contas, { codigo: sint.codigo, descricao: 'Analítica da equipe', nivel: sint.nivel, tipo: 'analitica', natureza: 'D' }], lancamentos: [{ ...daEquipe, contaDebitoCodigo: sint.codigo }] };
  const b = mesclarMigracao(conflito, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.equal(b.payload, null); assert.match(String(b.bloqueio), /outro tipo/);
  // Competência fechada com lançamento do sistema anterior: não grava.
  const fechada = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11', fechadas: new Set([d.lancamentos[0].data.slice(0, 7)]) });
  assert.equal(fechada.payload, null); assert.match(String(fechada.bloqueio), /fechada/);
  // Estorno feito pela equipe num lançamento migrado: não remigra por cima.
  const comEstorno = { ...m.payload!, lancamentos: [...m.payload!.lancamentos, { ...daEquipe, id: 'est-1', estornoDe: d.lancamentos[0].id }] };
  assert.match(String(mesclarMigracao(comEstorno, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' }).bloqueio), /estornou/);
});

/** Banco simulado só com o que a gravação usa. */
function bancoFalso(opcoes: { outroEscritorio?: boolean; workspace?: any } = {}) {
  const t = { workspaces: new Map<string, { payload: any; version: number }>(), acesso: [] as any[], registro: [] as any[] };
  if (opcoes.workspace) t.workspaces.set(opcoes.workspace.empresa.cnpj, { payload: opcoes.workspace, version: 3 });
  const consultar: ConsultaSql = async (sql, p = []) => {
    const s = sql.trim();
    if (/^CREATE TABLE/i.test(s) || s.includes('pg_advisory_xact_lock')) return { rows: [] };
    // Histórico guardado (empresa grande): estas empresas cabem inteiras no documento, a tabela fica vazia.
    if (s.includes('contabil_lancamentos_historico')) return { rows: [], rowCount: 0 };
    if (s.includes('FROM contabil_auth_company_access a JOIN contabil_auth_users u')) return { rows: opcoes.outroEscritorio ? [{ '?column?': 1 }] : [] };
    if (s.startsWith('SELECT payload,version FROM contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0])); return { rows: w ? [w] : [] }; }
    if (s.startsWith('SELECT competencia FROM contabil_period_closures')) return { rows: [] };
    if (s.startsWith('SELECT dados FROM contabil_empresas_compartilhadas')) return { rows: [{ dados: { razaoSocial: 'Do Fiscal', regime: 'Simples Nacional' } }] };
    if (s.startsWith('UPDATE contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0]))!; w.payload = JSON.parse(String(p[1])); w.version++; return { rows: [{ version: w.version }] }; }
    if (s.startsWith('INSERT INTO contabil_company_workspaces')) { t.workspaces.set(String(p[0]), { payload: JSON.parse(String(p[1])), version: 1 }); return { rows: [{ version: 1 }] }; }
    if (s.startsWith('INSERT INTO contabil_auth_company_access')) { t.acesso.push({ user_id: p[0], cnpj: p[1] }); return { rows: [] }; }
    if (s.startsWith('DELETE FROM contabil_sistema_anterior')) { t.registro = t.registro.filter((r) => r.cnpj !== p[0]); return { rows: [] }; }
    if (s.startsWith('INSERT INTO contabil_sistema_anterior')) { t.registro.push({ cnpj: p[0], bloco: p[1], linhas: JSON.parse(String(p[2])), quantidade: p[3] }); return { rows: [] }; }
    // Regras de integração Fiscal → Contábil (tabela própria), em memória.
    if (s.includes('contabil_regras_integracao_fiscal') || s.startsWith("SELECT payload->'contas'")) {
      const R: any[] = ((t as any).regras ??= []);
      if (s.startsWith('DELETE FROM contabil_regras_integracao_fiscal')) { (t as any).regras = R.filter((r) => r.cnpj !== p[0] || (s.includes("origem='sistema_anterior'") && r.origem !== 'sistema_anterior')); return { rows: [] }; }
      if (s.startsWith('INSERT INTO contabil_regras_integracao_fiscal')) { for (const x of JSON.parse(String(p[1]))) if (!R.some((r) => r.cnpj === p[0] && r.tipo === x.t && r.chave === x.k)) R.push({ cnpj: p[0], tipo: x.t, chave: x.k, conta: x.c, descricao: x.d, origem: 'sistema_anterior', dados: x.x }); return { rows: [] }; }
      if (s.startsWith('SELECT count(*)::int AS n FROM contabil_regras_integracao_fiscal')) return { rows: [{ n: R.filter((r) => r.cnpj === p[0] && r.origem === 'sistema_anterior').length }] };
      if (s.startsWith('SELECT tipo, chave, conta, descricao, origem, dados FROM contabil_regras_integracao_fiscal')) return { rows: R.filter((r) => r.cnpj === p[0]) };
      if (s.startsWith('SELECT tipo, chave, conta FROM contabil_regras_integracao_fiscal')) return { rows: R.filter((r) => r.cnpj === p[0] && r.conta) };
      if (s.startsWith('SELECT DISTINCT cnpj FROM contabil_regras_integracao_fiscal')) return { rows: [...new Set(R.map((r) => r.cnpj))].map((cnpj) => ({ cnpj })) };
      if (s.startsWith("SELECT payload->'contas'")) { const w = t.workspaces.get(String(p[0])); return { rows: w ? [{ contas: w.payload?.contas }] : [] }; }
    }
    throw new Error(`SQL não previsto: ${s.slice(0, 90)}`);
  };
  const banco: BancoTransacional = { consultar, async transacao(fn) { const copia = JSON.stringify({ w: [...t.workspaces], a: t.acesso, r: t.registro }); try { return await fn(consultar); } catch (e) { const c = JSON.parse(copia); t.workspaces = new Map(c.w); t.acesso = c.a; t.registro = c.r; throw e; } } };
  return { banco, t };
}
const QUEM = { userId: 'u1', login: 'contadora', escritorioId: 'dono1', tenantId: 'dono1' };

test('gravação: workspace, acesso no escritório de quem migra e registro de todos os blocos, numa transação', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 3);
  const f = bancoFalso();
  const r = await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' });
  assert.equal(r.conferencia.bate, true, r.conferencia.resumo);
  const ws = f.t.workspaces.get(d.cnpj)!;
  assert.equal(ws.payload.lancamentos.length, d.lancamentos.length);
  assert.equal(ws.payload.empresa.razaoSocial, 'Do Fiscal', 'cadastro do Fiscal vale primeiro; o do backup só completa');
  assert.deepEqual(f.t.acesso, [{ user_id: 'dono1', cnpj: d.cnpj }]);
  const blocos = f.t.registro.map((x) => x.bloco).sort();
  assert.ok(blocos.includes(BLOCO_RESUMO) && blocos.includes('lancamentos_lote_aberto') && blocos.includes('saldos'));
  const linhasGuardadas = f.t.registro.filter((x) => x.bloco !== BLOCO_RESUMO).reduce((s, x) => s + x.quantidade, 0);
  assert.equal(linhasGuardadas, Object.values(d.blocos).reduce((s, l) => s + l.length, 0), 'lidos = guardados');
  // Remigrar: mesmo número de lançamentos e de blocos (sem duplicar).
  await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' });
  assert.equal(f.t.workspaces.get(d.cnpj)!.payload.lancamentos.length, d.lancamentos.length);
  assert.equal(f.t.registro.length, blocos.length);
});

test('gravação recusa CNPJ de outro escritório e não deixa nada pela metade', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const f = bancoFalso({ outroEscritorio: true });
  await assert.rejects(() => gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' }), (e: any) => e instanceof ErroMigracao && /outro escritório/.test(e.message));
  assert.equal(f.t.workspaces.size, 0); assert.equal(f.t.registro.length, 0); assert.equal(f.t.acesso.length, 0);
});

test('exclusão: a cópia de segurança da escrituração sai sem os lançamentos e históricos da migração', async () => {
  const { ler } = await abrir();
  const d = await montarDadosEmpresa(ler, 49);
  const m = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  const daEquipe = { id: 'man-1', origem: 'Manual' };
  const copia = semDadosDoSistemaAnterior({ ...m.payload, lancamentos: [...m.payload!.lancamentos, daEquipe] });
  assert.deepEqual(copia.lancamentos, [daEquipe]);
  assert.ok(!copia.historicosPadrao.some((h: any) => String(h.id).startsWith('sa-hist-')));
});

test('fluxo da tela: envia compactado, lista, prévia sem gravar, "Transportar tudo" não traz excluída, uma por uma traz; o arquivo é apagado no fim', async () => {
  const req = Readable.from([zlib.gzipSync(fs.readFileSync(FIXTURE))]) as any;
  const { token } = await receberArquivoContabil(req, 'u-tela', true);
  const lista = await listarEmpresasDoBackupContabil(token, 'u-tela');
  assert.equal(lista.empresas.length, 6);
  await assert.rejects(() => listarEmpresasDoBackupContabil(token, 'outro-usuario'), /não foi encontrado/);
  const cnpj23 = lista.empresas.find((e) => e.cdempresa === 23)!.cnpj;
  const dep = {
    lerAtual: async () => ({ payload: null, compartilhado: null, fechadas: new Set<string>() }),
    deOutroEscritorio: async () => false, excluidaAntes: async (c: string) => c === cnpj23,
    cnpjValido: cnpjContabilValido, validarWorkspace: workspaceValido, modelo: planoContasModelo, competenciaAtual: '2026-11',
  };
  const previa = await gerarPreviaContabil(token, 'u-tela', [3, 23, 49, 1], { 1: '' }, dep);
  assert.equal(previa.find((p) => p.cdempresa === 1)!.podeGravar, false, 'sem CNPJ, só se digitar');
  assert.ok(previa.filter((p) => p.cdempresa !== 1).every((p) => p.podeGravar && p.bate), JSON.stringify(previa.map((p) => [p.cdempresa, p.motivo, p.conferencia])));
  assert.equal(previa.find((p) => p.cdempresa === 23)!.excluidaAntes, true);
  const gravadas: string[] = [];
  const gravar = async (d: DadosContabeisEmpresa) => { gravadas.push(d.cnpj); return { lancamentos: d.lancamentos.length, contasNovas: 0, conferencia: { resumo: 'ok', bate: true } }; };
  const r1 = await gravarMigracaoContabil(token, 'u-tela', [3, 23], false, gravar, dep.excluidaAntes);
  assert.equal(r1.find((r) => r.cdempresa === 23)!.gravado, false);
  assert.match(String(r1.find((r) => r.cdempresa === 23)!.motivo), /uma por uma/);
  assert.equal(situacaoMigracaoContabilDoUsuario('u-tela').emAndamento, true, 'ainda há prévia para gravar');
  const r2 = await gravarMigracaoContabil(token, 'u-tela', [23, 49], true, gravar, dep.excluidaAntes);
  assert.ok(r2.every((r) => r.gravado));
  assert.equal(gravadas.length, 3);
  assert.equal(situacaoMigracaoContabilDoUsuario('u-tela').emAndamento, false, 'terminou: o arquivo foi apagado');
  const pasta = path.join(os.tmpdir(), 'murade-contabil-migracao-sistema-anterior');
  assert.ok(!fs.readdirSync(pasta).some((f) => f.startsWith(token)));
});

test('backup inteiro sem separar (navegador antigo) é recusado com explicação', async () => {
  const req = Readable.from([Buffer.from('PGDMP' + 'x'.repeat(500))]) as any;
  await assert.rejects(() => receberArquivoContabil(req, 'u-antigo', false), /Chrome ou o Edge/);
});

test('robô conferidor e Agente IA: estão registrados e a tela nova não escreve o nome do sistema anterior', () => {
  const server = fs.readFileSync(path.join(AQUI, '..', '..', 'server.ts'), 'utf8');
  assert.match(server, /registrarRobo\(\{ id: "conferidor_migracao_sistema_anterior"/);
  assert.match(server, /registrarRotinaManual\("conferidor_migracao_sistema_anterior"/);
  assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === 'conferidor_migracao_sistema_anterior'));
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ['situacao_migracao_sistema_anterior', 'conferir_migracao_sistema_anterior', 'ver_registro_sistema_anterior']) assert.ok(nomes.includes(n), n);
  assert.ok(kitContabil.ferramentas.filter((f) => /sistema_anterior/.test(f.declaracao.name) && f.declaracao.name !== 'decidir_item_migracao_sistema_anterior').every((f) => f.tipo === 'leitura'));
  assert.equal(kitContabil.ferramentas.find((f) => f.declaracao.name === 'decidir_item_migracao_sistema_anterior')?.tipo, 'acao', 'decidir é sempre por cartão');
  const tela = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'components', 'MigracaoBackupContabil.tsx'), 'utf8');
  assert.ok(!/alterdata/i.test(tela));
});

test('backup completo desta máquina (se existir): todas as empresas lidas = gravadas e o balancete bate', { skip: !fs.existsSync(BACKUP_REAL) }, async () => {
  const { extrairArquivo } = await import('../extrair-backup-contabil');
  const saida = path.join(os.tmpdir(), `murade-teste-contabil-${process.pid}.sql`);
  try {
    await extrairArquivo(BACKUP_REAL, saida);
    const { ler, empresas } = await abrir(saida);
    let lancamentos = 0;
    for (const e of empresas) {
      const d = await montarDadosEmpresa(ler, e.cdempresa);
      const mv = ((await ler(`wcont.mv${String(e.cdempresa).padStart(5, '0')}`)) || []) as any[];
      // Cada linha lida do arquivo está numa partida gravada (ou na lista do que não entrou, com o motivo).
      const somaPartidas = d.lancamentos.reduce((s, l) => s + Math.round(l.valor * 100), 0);
      const somaDebitos = mv.filter((m) => m.vllancamento < 0).reduce((s, m) => s + -centavos(m.vllancamento), 0);
      const naoEntrouDebito = d.naoEntraram.filter((x) => x.valorCentavos < 0).reduce((s, x) => s + -x.valorCentavos, 0);
      assert.equal(somaPartidas + naoEntrouDebito, somaDebitos, `${e.cdempresa}: débitos lidos = gravados + não entraram`);
      assert.equal(d.blocos.lancamentos_originais?.length || 0, mv.length, `${e.cdempresa}: todas as linhas guardadas`);
      if (!e.semCadastro) {
        const m: any = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
        assert.ok(m.payload && workspaceValido(m.payload), `${e.cdempresa}: ${m.bloqueio}`);
        const c = conferirMigracao(m.payload!.contas, m.payload!.lancamentos, referencia(d));
        assert.equal(c.bate, true, `${e.cdempresa}: ${c.resumo}`);
        lancamentos += d.lancamentos.length;
      }
    }
    assert.ok(lancamentos > 9000, `${lancamentos} lançamentos das empresas com CNPJ`);
  } finally { fs.rmSync(saida, { force: true }); }
});
