// "Quer que eu ajuste?" no fechamento: acha a causa, deixa o ajuste pronto, só faz no Sim, confere de novo e desfaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analisarFechamento, aplicarPropostaFechamento } from '../../src/utils/ajustesFechamento';
import { gerarRelatoriosContabeis } from '../../src/utils/livrosContabeis';
import { workspaceValido } from '../../src/server/authContabil';
import { kitContabil } from '../../src/server/agenteContabil';
import { ROBOS_APRESENTACAO } from '../../src/data/apresentacaoSistema';
import { completarPayloadDoRegistro } from '../../src/server/migracaoSistemaAnterior/banco';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { montarDadosEmpresa } from '../../src/server/migracaoSistemaAnterior/conversor';
import { mesclarMigracao } from '../../src/server/migracaoSistemaAnterior/mesclagem';
import { planoContasModelo } from '../../src/data/planoContasModelo';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const contas: any[] = [
  { codigo: '1', descricao: 'Ativo', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1', descricao: 'Caixa e bancos', nivel: 2, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1.01', descricao: 'Caixa', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.1.02', descricao: 'Banco', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.2', descricao: 'Estoques', nivel: 2, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.2.01', descricao: 'Mercadorias', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '2', descricao: 'Passivo', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.3', descricao: 'Patrimônio líquido', nivel: 2, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.3.01', descricao: 'Capital social', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3.02', descricao: 'Lucros acumulados', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3.03', descricao: 'Ajustes de abertura', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '3', descricao: 'Receitas', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '3.1.01', descricao: 'Receita de vendas', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '4', descricao: 'Despesas', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '4.1.01', descricao: 'Despesa de aluguel', nivel: 3, tipo: 'analitica', natureza: 'D' },
];
const L = (id: string, data: string, d: string, c: string, valor: number, extra: any = {}) => ({ id, data, competencia: data.slice(0, 7), contaDebitoCodigo: d, contaDebitoNome: d, contaCreditoCodigo: c, contaCreditoNome: c, valor, historico: `Teste ${id}`, origem: 'Manual', statusManual: 'aprovado', ...extra });
const ws = (lancamentos: any[], cs: any[] = contas, empresa: any = {}) => ({ empresa: { cnpj: '11222333000181', ...empresa }, contas: JSON.parse(JSON.stringify(cs)), centrosCusto: [], lancamentos, livros: [], lembretes: [] });
const analisar = (p: any, competencia?: string) => analisarFechamento({ contas: p.contas, lancamentos: p.lancamentos, empresa: p.empresa, competencia });

test('saldos iniciais sem contrapartida: propõe o saldo na contrapartida da abertura, só no Sim, e o balancete passa a fechar', () => {
  const cs = contas.map((c) => c.codigo === '1.1.01' ? { ...c, saldoInicial: 1500, saldoInicialCompetencia: '2026-01' } : c.codigo === '2.3.01' ? { ...c, saldoInicial: 1000, saldoInicialCompetencia: '2026-01' } : c);
  const p = ws([L('a', '2026-01-10', '4.1.01', '1.1.01', 100)], cs, { contaContrapartidaAberturaCodigo: '2.3.03' });
  const rel = gerarRelatoriosContabeis(p.contas, p.lancamentos, '2026-01');
  assert.notEqual(rel.totalSaldoDevedorCentavos, rel.totalSaldoCredorCentavos, 'antes não fecha');
  const prop = analisar(p).find((x) => x.id === 'saldo-inicial:2026-01')!;
  assert.equal(prop.tipo, 'saldo_inicial'); assert.equal(prop.situacao, 'pendente');
  assert.deepEqual(prop.saldoInicial, { conta: '2.3.03', valorCentavos: 50000, competencia: '2026-01' });
  assert.match(prop.pergunta, /Quer que eu ajuste\?/); assert.match(prop.base, /ITG 2000/);
  const q = aplicarPropostaFechamento(p, prop, 'executar', 'contadora');
  assert.equal(p.contas.find((c: any) => c.codigo === '2.3.03').saldoInicial, undefined, 'trabalha numa cópia');
  const rel2 = gerarRelatoriosContabeis(q.contas, q.lancamentos, '2026-01');
  assert.equal(rel2.totalSaldoDevedorCentavos, rel2.totalSaldoCredorCentavos, 'depois fecha exatamente');
  assert.ok(workspaceValido(q));
  const feito = analisar(q).find((x) => x.id === prop.id)!;
  assert.equal(feito.situacao, 'feito');
  const volta = aplicarPropostaFechamento(q, feito, 'desfazer', 'contadora');
  assert.equal(volta.contas.find((c: any) => c.codigo === '2.3.03').saldoInicial, undefined, 'Desfazer volta como era');
  assert.equal(analisar(volta).find((x) => x.id === prop.id)!.situacao, 'pendente');
  // Sem contrapartida escolhida: só "verificar", nada pronto para lançar.
  const sem = analisar(ws([], cs)).find((x) => x.id === 'saldo-inicial:2026-01')!;
  assert.equal(sem.tipo, 'verificar');
  assert.throws(() => aplicarPropostaFechamento(ws([], cs), sem, 'executar', 'x'), /escolha da pessoa/);
});

test('lançamento fora do Diário: conta sintética com uma analítica, competência diferente da data e fração de centavo', () => {
  const p = ws([
    L('s', '2026-02-05', '1.2', '1.1.01', 50),
    L('c', '2026-02-06', '4.1.01', '1.1.01', 30, { competencia: '2026-03' }),
    L('f', '2026-02-07', '4.1.01', '1.1.02', 10.005),
    L('m', '2026-02-08', '1.1', '1.1.01', 5),
  ]);
  const a = analisar(p, '2026-02');
  const sint = a.find((x) => x.id === 's' || x.id === 'sintetica:s:contaDebitoCodigo')!;
  assert.equal(sint.tipo, 'alterar_lancamento'); assert.deepEqual(sint.alteracao, { lancamentoId: 's', campo: 'contaDebitoCodigo', de: '1.2', para: '1.2.01' });
  assert.match(sint.base, /I250/);
  assert.equal(a.find((x) => x.id === 'sintetica:m:contaDebitoCodigo')!.tipo, 'verificar', 'com duas analíticas abaixo é escolha da pessoa');
  const comp = a.find((x) => x.id === 'competencia:c')!;
  assert.deepEqual(comp.alteracao, { lancamentoId: 'c', campo: 'competencia', de: '2026-03', para: '2026-02' });
  const cent = a.find((x) => x.id === 'centavo:f')!;
  assert.equal(cent.alteracao!.para, 10.01);
  let q: any = p;
  for (const x of [sint, comp, cent]) q = aplicarPropostaFechamento(q, x, 'executar', 'contadora');
  const rel = gerarRelatoriosContabeis(q.contas, q.lancamentos, '2026-02');
  assert.equal(rel.invalidos.filter((l) => l.id !== 'm').length, 0, 'voltaram para o Diário e o Razão');
  assert.equal(q.lancamentos.find((l: any) => l.id === 's').contaDebitoNome, 'Mercadorias');
  const depois = analisar(q, '2026-02');
  assert.equal(depois.find((x) => x.id === sint.id)!.situacao, 'feito', 'continua na lista com Desfazer');
  const v = aplicarPropostaFechamento(q, depois.find((x) => x.id === sint.id)!, 'desfazer', 'contadora');
  assert.equal(v.lancamentos.find((l: any) => l.id === 's').contaDebitoCodigo, '1.2');
  assert.ok(!('ajustesFechamento' in v.lancamentos.find((l: any) => l.id === 's')));
});

test('encerramento que não zerou: partida complementar pronta, só no Sim; confere de novo; desfazer é estorno', () => {
  const enc = (id: string, d: string, c: string, v: number) => L(id, '2025-12-31', d, c, v, { tipoEspecial: 'encerramento', loteId: 'ENC-1', documentoRef: 'ENCERRAMENTO:2025:ENC-1' });
  const p = ws([
    L('v', '2025-03-10', '1.1.01', '3.1.01', 1000), L('d', '2025-04-10', '4.1.01', '1.1.01', 300),
    enc('e1', '3.1.01', '2.3.02', 1000), enc('e2', '2.3.02', '4.1.01', 300),
    L('depois', '2025-12-20', '4.1.01', '1.1.01', 50), // lançado depois do encerramento
  ]);
  const prop = analisar(p).find((x) => x.id === 'encerramento:2025:4.1.01')!;
  assert.equal(prop.tipo, 'lancamento'); assert.equal(prop.situacao, 'pendente');
  assert.deepEqual({ ...prop.lancamento, historico: undefined }, { data: '2025-12-31', competencia: '2025-12', contaDebito: '2.3.02', contaCredito: '4.1.01', valorCentavos: 5000, historico: undefined, encerramento: true });
  assert.match(prop.pergunta, /Vou lançar: D 2\.3\.02 \/ C 4\.1\.01/);
  assert.equal(analisar(p).filter((x) => x.id.startsWith('encerramento:')).length, 1, 'a receita zerou: só a despesa');
  const q: any = aplicarPropostaFechamento(p, prop, 'executar', 'contadora');
  assert.ok(workspaceValido(JSON.parse(JSON.stringify(q))));
  assert.equal(q.lancamentos.length, p.lancamentos.length + 1);
  const depois = analisar(q).find((x) => x.id === prop.id)!;
  assert.equal(depois.situacao, 'feito');
  assert.throws(() => aplicarPropostaFechamento(q, depois, 'executar', 'x'), /já foi lançado/);
  const est: any = aplicarPropostaFechamento(q, depois, 'desfazer', 'contadora');
  assert.equal(est.lancamentos.length, q.lancamentos.length + 1, 'estorno, não apaga');
  assert.equal(analisar(est).find((x) => x.id === prop.id)!.situacao, 'pendente');
  // "Manter" fica registrado e não some.
  const m = aplicarPropostaFechamento(p, prop, 'manter', 'contadora');
  assert.equal(analisar(m).find((x) => x.id === prop.id)!.situacao, 'mantido');
});

test('tudo fecha: nenhuma proposta; robô, rotas, tela e Agente registrados', () => {
  const p = ws([L('v', '2026-03-10', '1.1.01', '3.1.01', 1000)]);
  assert.deepEqual(analisar(p, '2026-03').filter((x) => x.situacao === 'pendente' && x.tipo !== 'verificar'), []);
  const server = fs.readFileSync(path.join(AQUI, '..', '..', 'server.ts'), 'utf8');
  assert.match(server, /registrarRobo\(\{ id: "ajustes_fechamento"/); assert.match(server, /registrarRotinaManual\("ajustes_fechamento"/);
  assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === 'ajustes_fechamento'));
  const rotas = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'server', 'escrituracaoRotas.ts'), 'utf8');
  assert.match(rotas, /app\.get\("\/api\/workspaces\/:cnpj\/ajustes-fechamento"/); assert.match(rotas, /app\.post\("\/api\/workspaces\/:cnpj\/ajustes-fechamento", origem, sessaoMw/);
  assert.equal(kitContabil.ferramentas.find((f) => f.declaracao.name === 'ajustes_fechamento')?.tipo, 'leitura');
  assert.equal(kitContabil.ferramentas.find((f) => f.declaracao.name === 'decidir_ajuste_fechamento')?.tipo, 'acao');
  const tela = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'components', 'tabs', 'GestaoContabilTab.tsx'), 'utf8');
  assert.match(tela, /<AjustesFechamentoPainel/);
});

test('empresa migrada antes dos campos novos: o robô completa só o que está vazio, a partir do registro, sem sobrescrever', async () => {
  const idx = await indexarDump(path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql'));
  const cache = new Map<string, any>();
  const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
  const d = await montarDadosEmpresa(ler, 49);
  const cheio: any = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' }).payload;
  // Como ficava numa migração antiga: sem os campos novos; e um campo que a equipe já digitou.
  const antigo = JSON.parse(JSON.stringify(cheio));
  for (const k of ['nire', 'contadorRg', 'contadorCategoria', 'livrosNumeracao', 'planoMascara', 'qsa', 'responsavelNascimento']) delete antigo.empresa[k];
  antigo.empresa.telefone = '(62) 9999-0000';
  for (const c of antigo.contas) delete c.codigoReduzido;
  for (const l of antigo.lancamentos) { delete l.loteDescricao; delete l.numeroSequencial; }
  antigo.bensImobilizado = [];
  const r = completarPayloadDoRegistro(antigo, JSON.parse(JSON.stringify(d.blocos)), d.mapaContas, 49);
  assert.ok(r.preenchidos.length > 5, r.preenchidos.join(', '));
  assert.equal(r.payload.empresa.nire, cheio.empresa.nire);
  assert.equal(r.payload.empresa.contadorRg, '1112223');
  assert.deepEqual(r.payload.empresa.qsa, cheio.empresa.qsa);
  assert.equal(r.payload.empresa.telefone, '(62) 9999-0000', 'o que a equipe digitou fica');
  assert.deepEqual(r.payload.contas.map((c: any) => c.codigoReduzido), cheio.contas.map((c: any) => c.codigoReduzido));
  assert.deepEqual(r.payload.bensImobilizado, cheio.bensImobilizado);
  assert.ok(workspaceValido(r.payload));
  // Rodar de novo não muda nada; competência fechada não é tocada.
  assert.deepEqual(completarPayloadDoRegistro(r.payload, JSON.parse(JSON.stringify(d.blocos)), d.mapaContas, 49).preenchidos, []);
  const fechadas = new Set(antigo.lancamentos.map((l: any) => String(l.data).slice(0, 7)));
  const f = completarPayloadDoRegistro(antigo, JSON.parse(JSON.stringify(d.blocos)), d.mapaContas, 49, fechadas as Set<string>);
  assert.ok(f.payload.lancamentos.every((l: any) => l.numeroSequencial === undefined && l.loteDescricao === undefined));
});

test('títulos e cartões do backup: vêm idênticos, com as contas pelos lançamentos que o sistema anterior fez; senha nunca vem', async () => {
  const idx = await indexarDump(path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql'));
  const cache = new Map<string, any>();
  const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
  const d = await montarDadosEmpresa(ler, 49);
  assert.equal(d.titulos.length, 2);
  const t = d.titulos.find((x) => x.numero === '000739')!;
  assert.equal(t.tipo, 'pagar'); assert.equal(t.serie, 'D-1'); assert.equal(t.modelo, '55');
  assert.equal(t.participanteNome, 'FORNECEDOR . TESTE IND COM LTDA-EPP', 'ponto e hífen');
  assert.equal(t.participanteDocumento, '99888777/0001-66', 'sem CNPJ, vale o código formatado');
  assert.equal(t.valorCentavos, 14520); assert.equal(t.dataEmissao, '2023-09-15');
  assert.equal(t.contaTitulo, d.mapaContas['188']); assert.equal(t.baixas[0].contaDisponibilidade, d.mapaContas['164']);
  assert.deepEqual({ ...t.baixas[0], contaDisponibilidade: undefined }, { id: 'sa-bx-ZZZTESTEBX000000000000000000000B1', data: '2023-09-30', valorCentavos: 14520, origem: 'sistema_anterior', origemId: 'ZZZTESTEBX000000000000000000000B1', documento: '1175', historico: 'Compra de mercadoria avista conforme NF.', tipo: 'B', situacao: 'C', contaDisponibilidade: undefined, lancamentosSistemaAnterior: ['990cf740-437a-44bf-9aa8-3e287ca7ecb1', '946876be-e243-4dd3-b648-3be7ddc3c4e3'] });
  assert.equal(t.provisoes.length, 1);
  const r = d.titulos.find((x) => x.numero === '10051')!;
  assert.equal(r.tipo, 'receber'); assert.equal(r.participanteNome, 'CLIENTE TESTE, ME', 'vírgula'); assert.equal(r.participanteDocumento, '99888777000166');
  assert.equal(d.cartoes.length, 1);
  const c = d.cartoes[0];
  assert.equal(c.operadora, 'Cielo'); assert.equal(c.codigoEstabelecimento, '0001032745', 'zeros à esquerda'); assert.equal(c.agencia, '0667');
  assert.deepEqual(c.movimentos.map((m) => [m.referencia, m.rendimentoCentavos, m.irCentavos, m.beneficiarioNome]), [['2023-01-31', 150, 2, 'BANCO TESTE S/A'], ['2023-02-28', 1107, 16, 'BANCO TESTE S/A']]);
  assert.ok(!JSON.stringify(d.blocos.cartao_estabelecimentos).includes('senha-secreta'), 'senha nunca é guardada');
  assert.ok(!JSON.stringify(d.cartoes).includes('usuario-secreto'));
  // Conferidor campo a campo: igual quando gravado; aponta o que faltou.
  const { conferirCamposMigrados } = await import('../../src/server/migracaoSistemaAnterior/camposSistemaAnterior');
  const payload: any = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' }).payload;
  const base = { cdempresa: 49, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload };
  assert.deepEqual(conferirCamposMigrados({ ...base, titulos: d.titulos, cartoes: d.cartoes }).pendencias.filter((p) => p.grupo === 'titulos' || p.grupo === 'cartoes'), []);
  const faltou = conferirCamposMigrados({ ...base, titulos: [{ ...t, numero: '739' }], cartoes: [] }).pendencias;
  assert.ok(faltou.some((p) => p.grupo === 'titulos' && p.rotulo === 'numero' && p.noSistemaAnterior === '000739'), 'zero à esquerda conta');
  assert.ok(faltou.some((p) => p.grupo === 'titulos' && p.rotulo === 'título' && p.tipo === 'faltou'));
  assert.ok(faltou.some((p) => p.grupo === 'cartoes' && p.tipo === 'faltou'));
});

test('título no Murade: baixa e provisão viram lançamento pendente de aprovação com as contas certas; lembrete de vencimento', async () => {
  const { lancamentoDaBaixa, lancamentoDaProvisao, lembreteDoTitulo, situacaoTitulo, validarTitulo } = await import('../../src/server/titulosCartoesStore');
  const { lembretesDeTitulos } = await import('../../src/server/titulosCartoesRotas');
  const p = ws([]);
  const t = validarTitulo({ id: 'T1', tipo: 'pagar', numero: '123', participanteNome: 'Fornecedor X', dataEmissao: '2026-11-10', vencimento: '2026-11-25', valorCentavos: 50000, contaTitulo: '2.3.03', contaContrapartida: '4.1.01', baixas: [], provisoes: [], origem: 'murade' });
  const prov = lancamentoDaProvisao(p, t);
  assert.deepEqual([prov.contaDebitoCodigo, prov.contaCreditoCodigo, prov.valor, prov.statusManual, prov.documentoRef], ['4.1.01', '2.3.03', 500, 'pendente_aprovacao', 'TITULO:T1:PROVISAO']);
  const bx = lancamentoDaBaixa(p, t, { id: 'B1', data: '2026-11-20', valorCentavos: 20000, contaDisponibilidade: '1.1.02', origem: 'murade' });
  assert.deepEqual([bx.contaDebitoCodigo, bx.contaCreditoCodigo, bx.valor, bx.statusManual], ['2.3.03', '1.1.02', 200, 'pendente_aprovacao']);
  const receber = { ...t, tipo: 'receber' as const, contaTitulo: '1.1.01', contaContrapartida: '3.1.01' };
  assert.deepEqual([lancamentoDaProvisao(p, receber).contaDebitoCodigo, lancamentoDaProvisao(p, receber).contaCreditoCodigo], ['1.1.01', '3.1.01']);
  assert.throws(() => lancamentoDaBaixa(p, t, { id: 'B2', data: '2026-11-20', valorCentavos: 1, contaDisponibilidade: '1.1', origem: 'murade' }), /caixa ou banco/);
  assert.equal(situacaoTitulo({ ...t, baixas: [{ id: 'x', data: '2026-11-20', valorCentavos: 20000, origem: 'murade' }] }, '2026-11-22'), 'parcial');
  assert.equal(situacaoTitulo(t, '2026-11-26'), 'vencido');
  assert.equal(lembreteDoTitulo(t, '2026-11-22')!.tipo, 'proximo');
  assert.equal(lembreteDoTitulo({ ...t, baixas: [{ id: 'x', data: '2026-11-20', valorCentavos: 50000, origem: 'murade' }] }, '2026-11-22'), null, 'baixado sai da Agenda');
  const comLembrete = lembretesDeTitulos({ ...p, lembretes: [{ id: 'outro' }] }, [t], '2026-11-22')!;
  assert.equal(comLembrete.lembretes.length, 2);
  assert.equal(lembretesDeTitulos(comLembrete, [t], '2026-11-23'), null, 'a contagem de dias não reescreve o workspace');
  assert.throws(() => validarTitulo({ id: 'T2', tipo: 'pagar', participanteNome: '', dataEmissao: 'x', valorCentavos: 0 }), /Confira/);
});

test('modelo de lançamento automático com o mesmo significado de uma origem do DP vira sugestão de integração (aceitar aplica)', async () => {
  const { analisarMigracao, aplicarAcaoAchado } = await import('../../src/server/migracaoSistemaAnterior/analiseSistemaAnterior');
  const idx = await indexarDump(path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql'));
  const cache = new Map<string, any>();
  const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
  const d = await montarDadosEmpresa(ler, 49);
  const payload: any = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' }).payload;
  const a = analisarMigracao({ cdempresa: 49, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload, naoEntraram: [], conferencia: null, decisoes: {}, hoje: '2026-11-22' });
  const m = a.find((x) => x.id === 'mapeamento:dp_fgts')!;
  assert.ok(m, 'FGTS casou'); assert.equal(m.tipo, 'conferir');
  assert.ok(!a.some((x) => x.id.startsWith('mapeamento:fiscal')), '"Venda à vista" não é igual a nenhuma origem: não sugere');
  const q: any = aplicarAcaoAchado(payload, m, 'aceitar', 'contadora');
  assert.deepEqual(q.mapeamentosOrigem.find((x: any) => x.origem === 'dp_fgts') && [q.mapeamentosOrigem.find((x: any) => x.origem === 'dp_fgts').contaDebitoCodigo, q.mapeamentosOrigem.find((x: any) => x.origem === 'dp_fgts').contaCreditoCodigo], [d.mapaContas['188'], d.mapaContas['164']]);
  assert.ok(workspaceValido(JSON.parse(JSON.stringify(q))));
  assert.ok(!analisarMigracao({ cdempresa: 49, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload: q, naoEntraram: [], conferencia: null, decisoes: {}, hoje: '2026-11-22' }).some((x) => x.id === m.id), 'aceito, some');
  const kitNomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ['listar_titulos', 'baixar_titulo', 'gerar_provisao_titulo', 'informacoes_cartoes']) assert.ok(kitNomes.includes(n), n);
  const server = fs.readFileSync(path.join(AQUI, '..', '..', 'server.ts'), 'utf8');
  assert.match(server, /registrarRobo\(\{ id: "titulos"/); assert.match(server, /registrarRotinaManual\("titulos"/); assert.match(server, /registrarRotasTitulosCartoes\(app/);
  assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === 'titulos'));
});
