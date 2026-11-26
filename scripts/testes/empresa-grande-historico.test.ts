// Empresa grande (26/11/2026): o documento da empresa guardava até 20.000 lançamentos / 4 MB e a migração de um supermercado
// com anos de movimento era recusada. Agora os exercícios antigos ficam no HISTÓRICO GUARDADO (tabela própria, mês a mês) e o
// documento fica com os exercícios em aberto e o saldo transportado. Aqui, com dados INVENTADOS (nenhum dado de cliente):
//  1. 200 mil lançamentos em 10 anos: migra (lido ano a ano), a conferência bate, o balancete de CADA mês bate com a tabela de
//     saldos do backup, o razão de uma conta bate, e a memória do Node fica abaixo de 400 MB;
//  2. antes x depois: o balancete e o razão de cada mês são IGUAIS aos de quando todos os lançamentos estavam num documento só;
//  3. dia a dia: guardar e trazer de volta um exercício não muda nenhum número;
//  4. o salvar do navegador não mexe no histórico, a validação do documento e o robô conferidor (que refaz o transporte sozinho).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { montarDadosEmpresa } from '../../src/server/migracaoSistemaAnterior/conversor';
import { gravarEmpresaMigrada, conferirEmpresaMigrada } from '../../src/server/migracaoSistemaAnterior/banco';
import { juntarComHistorico } from '../../src/server/migracaoSistemaAnterior/historicoMigracao';
import { mesclarMigracao } from '../../src/server/migracaoSistemaAnterior/mesclagem';
import { workspaceValido, conferirHistoricoNoSalvar } from '../../src/server/authContabil';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import { gerarRelatoriosContabeis } from '../../src/utils/livrosContabeis';
import { lerExercicioDoHistorico, visaoDoExercicio } from '../../src/server/historicoLancamentosStore';
import { conferirHistoricoEmpresa, guardarExerciciosNoHistorico, refazerTransporte, trazerExercicioDeVolta, rotinaRoboHistorico, ID_ROBO_HISTORICO } from '../../src/server/historicoLancamentos';
import { semDadosDoSistemaAnterior } from '../../src/server/arquivoMorto';
import { kitContabil } from '../../src/server/agenteContabil';
import { ROBOS_APRESENTACAO } from '../../src/data/apresentacaoSistema';
import type { ContaPlano, LancamentoContabil } from '../../src/types';
import { gerarBackupEmpresaGrande } from './apoio/backupEmpresaGrande';
import { bancoHistoricoFalso } from './apoio/bancoHistoricoFalso';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const QUEM = { userId: 'u1', login: 'contadora', escritorioId: 'e1', tenantId: 'e1' };
const validar = (p: Record<string, unknown>) => workspaceValido(p);
const NOV26 = new Date('2026-11-26T15:00:00Z');

async function abrir(n: number) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'murade-empresa-grande-'));
  const arq = path.join(pasta, 'backup.sql');
  const g = gerarBackupEmpresaGrande(arq, n);
  const idx = await indexarDump(arq);
  const ler = async (nome: string, manter?: (l: any) => boolean) => carregarTabelaDump(idx, nome.toLowerCase(), manter);
  return { pasta, ler, g, limpar: () => fs.rmSync(pasta, { recursive: true, force: true }) };
}
const meses = () => { const m: string[] = []; for (let a = 2017; a <= 2026; a++) for (let i = 1; i <= 12; i++) { if (a === 2026 && i > 11) break; m.push(`${a}-${String(i).padStart(2, '0')}`); } return m; };
/** Números do balancete por conta analítica (movimento e saldo devedor − credor). */
function numeros(contas: ContaPlano[], lancs: LancamentoContabil[], periodo: string) {
  const r = gerarRelatoriosContabeis(contas, lancs, periodo);
  return { r, mapa: new Map(r.balancete.map((b) => [b.conta.codigo, { d: b.debitoPeriodoCentavos, c: b.creditoPeriodoCentavos, s: b.saldoDevedorCentavos - b.saldoCredorCentavos }])) };
}

test('empresa com 200 mil lançamentos em 10 anos: migra inteira, cada mês do balancete bate com o backup, o razão bate e a memória fica abaixo de 400 MB', { timeout: 560_000 }, async (t) => {
  const { ler, g, limpar } = await abrir(200000);
  const f = bancoHistoricoFalso();
  try {
    let pico = 0; const medir = setInterval(() => { pico = Math.max(pico, process.memoryUsage().rss); }, 10);
    const d = await montarDadosEmpresa(ler, 7);
    assert.ok(d.partes, 'empresa grande é lida ano a ano');
    assert.equal(d.lancamentos.length, 0, 'os lançamentos não ficam todos na memória');
    const r = await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: NOV26 });
    clearInterval(medir);
    t.diagnostic(`memória do Node (RSS) no pico da migração: ${Math.round(pico / 1048576)} MB`);
    assert.ok(pico < 400 * 1024 * 1024, `memória do Node no pico: ${Math.round(pico / 1048576)} MB`);
    assert.equal(r.lancamentos, g.partidas, 'todos os lançamentos do arquivo foram gravados (documento + histórico)');
    assert.equal(r.conferencia.bate, true, r.conferencia.resumo);
    assert.equal(r.conferencia.lancamentosNoMurade, g.partidas);
    const doc = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.ok(validar(doc), 'o documento passa na validação');
    assert.equal(doc.historicoArquivado.ateCompetencia, '2025-12', 'só o exercício de 2026 fica no documento (2025 + 2026 passariam da folga)');
    assert.ok(doc.lancamentos.length < 25000 && Buffer.byteLength(JSON.stringify(doc)) < 8_000_000, `documento: ${doc.lancamentos.length} lançamentos`);
    const transporte = doc.lancamentos.filter((l: any) => l.transporteHistorico);
    const doDoc = doc.lancamentos.length - transporte.length;
    assert.equal(doc.historicoArquivado.quantidade + doDoc, g.partidas, 'documento + histórico = arquivo inteiro');
    assert.ok(f.t.registro.filter((x) => x.bloco.startsWith('lancamentos_originais_')).reduce((s, x) => s + x.quantidade, 0) === g.linhas, 'cada linha original do arquivo está no registro do sistema anterior');
    // A conferência guardada (robô, tela) soma o documento e o histórico mês a mês.
    const c2 = await conferirEmpresaMigrada(f.consultar, d.cnpj);
    assert.equal(c2?.bate, true, c2?.resumo);
    const ch = await conferirHistoricoEmpresa(f.consultar, d.cnpj);
    assert.equal(ch.bate, true, ch.resumo);

    // Balancete de CADA mês x tabela de saldos do backup (total do mês por conta, independente da conversão).
    const contas: ContaPlano[] = doc.contas;
    const esperado = new Map(d.esperado.map((e) => [`${e.codigo}|${e.competencia}`, e]));
    const analiticas = contas.filter((c) => c.tipo === 'analitica').map((c) => c.codigo);
    const acumulado = new Map<string, number>();
    let conferidos = 0;
    let visao: LancamentoContabil[] = [];
    for (const comp of meses()) {
      if (comp.endsWith('-01') || comp === '2017-01') visao = comp <= '2025-12' ? (await lerExercicioDoHistorico(f.consultar, d.cnpj, Number(comp.slice(0, 4)), contas)).lancamentos : doc.lancamentos;
      const { mapa } = numeros(contas, visao, comp);
      for (const k of analiticas) {
        const e = esperado.get(`${k}|${comp}`); const m = mapa.get(k)!;
        const saldo = (acumulado.get(k) || 0) + (e ? e.debitoCentavos - e.creditoCentavos : 0);
        acumulado.set(k, saldo);
        assert.equal(m.d, e?.debitoCentavos || 0, `${k} ${comp}: débito do mês`);
        assert.equal(m.c, e?.creditoCentavos || 0, `${k} ${comp}: crédito do mês`);
        assert.equal(m.s, saldo, `${k} ${comp}: saldo`);
        conferidos++;
      }
    }
    assert.equal(conferidos, analiticas.length * 119);
    for (const [k, v] of Object.entries(d.saldoFinalEsperado)) assert.equal(acumulado.get(k) || 0, v, `${k}: saldo final`);

    // Razão do BANCO 1 num mês guardado (2019-06) e num mês em aberto (2026-06): saldo anterior, cada lançamento e saldo final.
    const banco = contas.find((c) => c.descricao === 'BANCO 1')!.codigo;
    for (const [comp, lancs] of [['2019-06', (await lerExercicioDoHistorico(f.consultar, d.cnpj, 2019, contas)).lancamentos], ['2026-06', doc.lancamentos]] as const) {
      const razao = gerarRelatoriosContabeis(contas, lancs as LancamentoContabil[], comp).razao.filter((x) => x.conta.codigo === banco);
      const doMes = (lancs as LancamentoContabil[]).filter((l) => !l.transporteHistorico && l.data.slice(0, 7) === comp && (l.contaDebitoCodigo === banco || l.contaCreditoCodigo === banco));
      let antes = 0; for (const x of meses()) { if (x >= comp) break; const e = esperado.get(`${banco}|${x}`); if (e) antes += e.debitoCentavos - e.creditoCentavos; }
      assert.equal(razao[0].historico, 'Saldo anterior'); assert.equal(razao[0].saldoDevedorCentavos - razao[0].saldoCredorCentavos, antes, `${comp}: saldo anterior`);
      assert.equal(razao.length - 1, doMes.length, `${comp}: cada lançamento do mês no razão`);
      const e = esperado.get(`${banco}|${comp}`)!;
      const ult = razao[razao.length - 1];
      assert.equal(ult.saldoDevedorCentavos - ult.saldoCredorCentavos, antes + e.debitoCentavos - e.creditoCentavos, `${comp}: saldo final do razão`);
    }
    // Robôs da ECD/demonstrações/DVA: o ano anterior (2025, guardado) vem do histórico com o saldo transportado.
    const v2025 = await visaoDoExercicio(f.consultar, d.cnpj, doc, 2025);
    assert.ok(v2025.lancamentos.some((l: any) => l.data.startsWith('2025-')) && !v2025.lancamentos.some((l: any) => l.data.startsWith('2026-')));
  } finally { f.limpar(); limpar(); }
});

test('antes x depois: com o histórico guardado, o balancete e o razão de cada mês são IGUAIS aos de quando tudo estava num documento só', { timeout: 300_000 }, async () => {
  const { ler, limpar } = await abrir(24000);
  const f = bancoHistoricoFalso();
  try {
    const d = await montarDadosEmpresa(ler, 7);
    assert.ok(!d.partes, 'empresa média: lida de uma vez');
    const tudo = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11', semLimiteDeTamanho: true }).payload!;
    const r = await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: NOV26 });
    assert.equal(r.conferencia.bate, true, r.conferencia.resumo);
    const doc = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.equal(doc.historicoArquivado.ateCompetencia, '2024-12', '2025 e 2026 cabem com folga no documento');
    assert.deepEqual(doc.contas, tudo.contas, 'o plano de contas é o mesmo');
    const so = (rel: ReturnType<typeof gerarRelatoriosContabeis>) => ({
      balancete: rel.balancete.map((b) => [b.conta.codigo, b.debitoPeriodoCentavos, b.creditoPeriodoCentavos, b.saldoDevedorCentavos, b.saldoCredorCentavos]),
      razao: rel.razao.map((x) => [x.conta.codigo, x.dataISO, x.referencia, x.historico, x.debitoCentavos, x.creditoCentavos, x.saldoDevedorCentavos, x.saldoCredorCentavos]),
      totais: [rel.totalDebitosCentavos, rel.totalSaldoDevedorCentavos, rel.totalSaldoCredorCentavos, rel.invalidos.length],
    });
    for (const comp of meses().filter((m) => ['2017', '2020', '2024', '2025', '2026'].includes(m.slice(0, 4)))) {
      const lancs = comp <= '2024-12' ? (await lerExercicioDoHistorico(f.consultar, d.cnpj, Number(comp.slice(0, 4)), doc.contas)).lancamentos : doc.lancamentos;
      assert.deepEqual(so(gerarRelatoriosContabeis(doc.contas, lancs, comp)), so(gerarRelatoriosContabeis(tudo.contas, tudo.lancamentos, comp)), comp);
    }
    // "Todos": o saldo de cada conta é o mesmo (o movimento dos anos guardados fica no histórico).
    const a = gerarRelatoriosContabeis(doc.contas, doc.lancamentos, 'todos'); const b = gerarRelatoriosContabeis(tudo.contas, tudo.lancamentos, 'todos');
    assert.deepEqual(a.balancete.map((x) => [x.conta.codigo, x.saldoDevedorCentavos, x.saldoCredorCentavos]), b.balancete.map((x) => [x.conta.codigo, x.saldoDevedorCentavos, x.saldoCredorCentavos]));
    // Remigrar não duplica nada (documento, histórico e registro).
    const antes = { doc: doc.lancamentos.length, linhas: f.t.historico.size, q: doc.historicoArquivado.quantidade, reg: f.t.registro.length };
    const r2 = await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: NOV26 });
    const doc2 = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.equal(r2.conferencia.bate, true);
    assert.deepEqual({ doc: doc2.lancamentos.length, linhas: f.t.historico.size, q: doc2.historicoArquivado.quantidade, reg: f.t.registro.length }, antes);

    // Dia a dia: guardar 2025 e trazer de volta não muda nenhum número de 2026 nem de 2025.
    const ref2026 = so(gerarRelatoriosContabeis(doc2.contas, doc2.lancamentos, '2026-03'));
    const ref2025 = so(gerarRelatoriosContabeis(doc2.contas, doc2.lancamentos, '2025-07'));
    const g1 = await guardarExerciciosNoHistorico(f.banco, d.cnpj, 2025, 'contadora', validar, NOV26);
    assert.match(g1.mensagem, /guardados no histórico/);
    const doc3 = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.equal(doc3.historicoArquivado.ateCompetencia, '2025-12');
    assert.ok(!doc3.lancamentos.some((l: any) => !l.transporteHistorico && l.data < '2026-01-01'));
    assert.deepEqual(so(gerarRelatoriosContabeis(doc3.contas, doc3.lancamentos, '2026-03')), ref2026, '2026 igual depois de guardar 2025');
    assert.deepEqual(so(gerarRelatoriosContabeis(doc3.contas, (await lerExercicioDoHistorico(f.consultar, d.cnpj, 2025, doc3.contas)).lancamentos, '2025-07')), ref2025, '2025 consultado no histórico = 2025 no documento');
    assert.equal((await conferirHistoricoEmpresa(f.consultar, d.cnpj)).bate, true);
    await assert.rejects(() => guardarExerciciosNoHistorico(f.banco, d.cnpj, 2026, 'contadora', validar, NOV26), /anteriores a 2026/);
    const v = await trazerExercicioDeVolta(f.banco, d.cnpj, 'contadora', validar, NOV26);
    assert.match(v.mensagem, /voltou/);
    const doc4 = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.deepEqual(doc4.historicoArquivado.ateCompetencia, '2024-12');
    assert.deepEqual(doc4.lancamentos.filter((l: any) => l.transporteHistorico), doc2.lancamentos.filter((l: any) => l.transporteHistorico), 'o transporte volta a ser exatamente o de antes');
    assert.deepEqual(new Set(doc4.lancamentos.map((l: any) => l.id)), new Set(doc2.lancamentos.map((l: any) => l.id)), 'os mesmos lançamentos voltaram');
    assert.deepEqual(so(gerarRelatoriosContabeis(doc4.contas, doc4.lancamentos, '2025-07')), ref2025);
  } finally { f.limpar(); limpar(); }
});

test('salvar do navegador: marca e transporte são do servidor; nada novo entra no exercício guardado; saldo inicial e conta com saldo transportado protegidos', async () => {
  const { ler, limpar } = await abrir(24000);
  const f = bancoHistoricoFalso();
  try {
    const d = await montarDadosEmpresa(ler, 7);
    await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: NOV26 });
    const atual = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    const doNavegador = () => { const p = JSON.parse(JSON.stringify(atual)); delete p.historicoArquivado; return p; };
    // 1) o navegador não manda a marca: o servidor junta a gravada e passa.
    const ok = doNavegador();
    assert.equal(workspaceValido(ok, { historicoConferidoDepois: true }), true);
    assert.equal(workspaceValido(ok), false, 'transporte sem a marca não vale');
    assert.equal(conferirHistoricoNoSalvar(atual, ok), null);
    assert.deepEqual(ok.historicoArquivado, atual.historicoArquivado);
    // 2) mexer no transporte: recusado.
    const t1 = doNavegador(); t1.lancamentos.find((l: any) => l.transporteHistorico).valor += 1;
    assert.match(String(conferirHistoricoNoSalvar(atual, t1)), /saldo transportado/);
    const t2 = doNavegador(); t2.lancamentos = t2.lancamentos.filter((l: any) => !l.transporteHistorico);
    assert.match(String(conferirHistoricoNoSalvar(atual, t2)), /saldo transportado/);
    // 3) lançamento novo num exercício guardado: recusado com explicação.
    const c = atual.contas.filter((x: any) => x.tipo === 'analitica');
    const t3 = doNavegador(); t3.lancamentos.push({ id: 'man-1', data: '2023-05-10', contaDebitoCodigo: c[0].codigo, contaDebitoNome: '', contaCreditoCodigo: c[1].codigo, contaCreditoNome: '', valor: 10, historico: 'teste', origem: 'Manual', statusManual: 'pendente_aprovacao' });
    assert.match(String(conferirHistoricoNoSalvar(atual, t3)), /guardados no histórico e ficam fechados/);
    // 4) rascunho automático de exercício guardado preparado no salvar dos mapeamentos: sai sozinho.
    const t4 = doNavegador(); t4.preLancamentos = [{ referenciaOrigem: `FISCAL:${d.cnpj}:2023-02:Entrada:1`, competencia: '2023-02', status: 'pendente_conferencia', geradoAutomaticamente: true }];
    assert.equal(conferirHistoricoNoSalvar(atual, t4), null); assert.equal(t4.preLancamentos.length, 0);
    // 5) saldo inicial numa competência guardada e conta com saldo transportado virando sintética: recusados.
    const t5 = doNavegador(); Object.assign(t5.contas.find((x: any) => x.codigo === c[2].codigo), { saldoInicial: 100, saldoInicialCompetencia: '2022-01' });
    assert.match(String(conferirHistoricoNoSalvar(atual, t5)), /saldo inicial/);
    const comTransporte = atual.lancamentos.find((l: any) => l.transporteHistorico).contaDebitoCodigo;
    const t6 = doNavegador(); t6.contas.find((x: any) => x.codigo === comTransporte).tipo = 'sintetica';
    assert.match(String(conferirHistoricoNoSalvar(atual, t6)), /saldo transportado do histórico/);
    // 6) estorno do saldo transportado: recusado (para mudar um exercício guardado, traz de volta).
    const tr = atual.lancamentos.find((l: any) => l.transporteHistorico);
    const t7 = doNavegador(); t7.lancamentos.push({ ...tr, id: 'est-1', transporteHistorico: undefined, data: '2026-02-01', competencia: '2026-02', estornoDe: tr.id, contaDebitoCodigo: tr.contaCreditoCodigo, contaCreditoCodigo: tr.contaDebitoCodigo, statusManual: 'pendente_aprovacao' });
    delete t7.lancamentos[t7.lancamentos.length - 1].transporteHistorico;
    assert.match(String(conferirHistoricoNoSalvar(atual, t7)), /não se estorna/);
    // 7) documento sem histórico: nada muda (nenhuma marca é criada pelo navegador).
    const semHist = { ...JSON.parse(JSON.stringify(atual)), historicoArquivado: undefined }; delete semHist.historicoArquivado; semHist.lancamentos = semHist.lancamentos.filter((l: any) => !l.transporteHistorico);
    const prop = JSON.parse(JSON.stringify(semHist)); prop.historicoArquivado = atual.historicoArquivado;
    assert.equal(conferirHistoricoNoSalvar(semHist, prop), null); assert.equal(prop.historicoArquivado, undefined);
  } finally { f.limpar(); limpar(); }
});

test('Robô Conferidor do Histórico: acha o transporte mexido e refaz sozinho a partir do histórico; registrado, com ferramenta da Agente', async () => {
  const { ler, limpar } = await abrir(24000);
  const f = bancoHistoricoFalso();
  try {
    const d = await montarDadosEmpresa(ler, 7);
    await gravarEmpresaMigrada(f.banco, d, QUEM, { modelo: planoContasModelo, validar, competenciaAtual: '2026-11', agora: NOV26 });
    const w = f.t.workspaces.get(d.cnpj)!; const certo = JSON.parse(w.payload);
    // Restauração de cópia antiga (sem a marca e sem o transporte): o histórico está inteiro, então dá para refazer.
    const semTransporte = { ...certo, lancamentos: certo.lancamentos.filter((l: any) => !l.transporteHistorico) }; delete semTransporte.historicoArquivado;
    w.payload = JSON.stringify(semTransporte);
    const c = await conferirHistoricoEmpresa(f.consultar, d.cnpj);
    assert.equal(c.bate, false); assert.equal(c.refazivel, true); assert.match(c.resumo, /NÃO confere/);
    const avisos: string[] = [];
    await rotinaRoboHistorico({ banco: () => f.banco, consultar: f.consultar, validar, bancoConfigurado: () => true, agora: () => NOV26,
      robos: { executarRobo: async (_id, fn) => fn(), registrarResultadoRobo: (_id, t) => { avisos.push(t); }, definirAlertaRobo: () => undefined } })();
    assert.match(avisos[0], /Refiz sozinho o saldo transportado/);
    const refeito = JSON.parse(f.t.workspaces.get(d.cnpj)!.payload);
    assert.deepEqual(refeito.lancamentos.filter((l: any) => l.transporteHistorico), certo.lancamentos.filter((l: any) => l.transporteHistorico));
    assert.equal((await conferirHistoricoEmpresa(f.consultar, d.cnpj)).bate, true);
    assert.equal(await refazerTransporte(f.banco, d.cnpj, validar, NOV26), false, 'já confere: nada a refazer');
    // Cópia para o arquivo morto: sem a migração, sem o transporte e sem a marca (o robô refaz com o que o escritório guardou).
    const copia = semDadosDoSistemaAnterior(refeito);
    assert.ok(!copia.historicoArquivado && !copia.lancamentos.some((l: any) => l.transporteHistorico));
    // Registros: robô no servidor e na apresentação; ferramentas da Agente (leitura e ação com cartão).
    const server = fs.readFileSync(path.join(AQUI, '..', '..', 'server.ts'), 'utf8');
    assert.match(server, /id: "conferidor_historico_guardado"/); assert.equal(ID_ROBO_HISTORICO, "conferidor_historico_guardado"); assert.match(server, /registrarRotinaManual\(ID_ROBO_HISTORICO/);
    assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === ID_ROBO_HISTORICO));
    const fer = (n: string) => kitContabil.ferramentas.find((x) => x.declaracao.name === n);
    assert.equal(fer('conferir_historico_guardado')?.tipo, 'leitura'); assert.equal(fer('exercicios_guardados')?.tipo, 'leitura');
    assert.equal(fer('guardar_exercicios_no_historico')?.tipo, 'acao'); assert.equal(fer('trazer_exercicio_de_volta')?.tipo, 'acao');
    const tela = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'components', 'SeletorExercicioHistorico.tsx'), 'utf8');
    assert.ok(!/alterdata/i.test(tela));
  } finally { f.limpar(); limpar(); }
});

test('relatórios: o saldo transportado entra no saldo e nunca no movimento do período (nem em "todos")', () => {
  const contas: ContaPlano[] = [
    { codigo: '1', descricao: 'ATIVO', nivel: 1, tipo: 'sintetica', natureza: 'D' }, { codigo: '1.1', descricao: 'CAIXA', nivel: 2, tipo: 'analitica', natureza: 'D' },
    { codigo: '2', descricao: 'PL', nivel: 1, tipo: 'sintetica', natureza: 'C' }, { codigo: '2.1', descricao: 'CAPITAL', nivel: 2, tipo: 'analitica', natureza: 'C' },
  ];
  const t: LancamentoContabil = { id: 'hist-transporte-2025-12-s-1', data: '2025-12-31', competencia: '2025-12', contaDebitoCodigo: '1.1', contaDebitoNome: 'CAIXA', contaCreditoCodigo: '2.1', contaCreditoNome: 'CAPITAL', valor: 1000, historico: 'Saldo transportado', origem: 'Cadastro', transporteHistorico: true };
  const l: LancamentoContabil = { id: 'm1', data: '2026-01-05', contaDebitoCodigo: '1.1', contaDebitoNome: 'CAIXA', contaCreditoCodigo: '2.1', contaCreditoNome: 'CAPITAL', valor: 50, historico: 'Aporte', origem: 'Manual' };
  const jan = gerarRelatoriosContabeis(contas, [t, l], '2026-01');
  const caixa = jan.balancete.find((b) => b.conta.codigo === '1.1')!;
  assert.deepEqual([caixa.debitoPeriodoCentavos, caixa.saldoDevedorCentavos], [5000, 105000]);
  assert.equal(jan.totalDebitosCentavos, 5000);
  const todos = gerarRelatoriosContabeis(contas, [t, l], 'todos');
  assert.deepEqual([todos.balancete.find((b) => b.conta.codigo === '1.1')!.debitoPeriodoCentavos, todos.balancete.find((b) => b.conta.codigo === '1.1')!.saldoDevedorCentavos], [5000, 105000]);
  const razao = todos.razao.filter((x) => x.conta.codigo === '1.1');
  assert.deepEqual(razao.map((x) => [x.historico, x.saldoDevedorCentavos]), [['Saldo anterior', 100000], ['Aporte', 105000]]);
  // Empresa sem histórico: nada muda.
  const sem = gerarRelatoriosContabeis(contas, [l], 'todos');
  assert.deepEqual(sem.razao.filter((x) => x.conta.codigo === '1.1').map((x) => x.historico), ['Aporte']);
});

test('empresa que cabia: a junção nova dá exatamente o documento de antes (sem histórico, sem transporte)', async () => {
  const { ler, limpar } = await abrir(9000);
  try {
    const d = await montarDadosEmpresa(ler, 7);
    const antes = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
    const depois = await juntarComHistorico(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
    assert.equal(JSON.stringify(depois.payload), JSON.stringify(antes.payload));
    assert.equal(depois.historico, null);
    assert.equal(depois.conferencia?.bate, true, depois.conferencia?.resumo);
  } finally { limpar(); }
});
