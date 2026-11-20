// Serviço completo da Agente: "fecha o mês", "faz a ECD", "encerra o resultado", "balancete para o cliente".
// A Agente levanta tudo, mostra o piloto (que para antes de aprovar/fechar), prepara num cartão só e deixa em "A conferir".
// Nunca aprova, contabiliza nem fecha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type EventoAuditoria, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { FRASE_INICIO, aguardarServicosEmSegundoPlano, servicosEmSegundoPlano, etapaDecisaoDoContador, etapasDepoisDoPreparo, identificarRoteiro, levantarBalanceteCliente, levantarFechamentoMensal, montarPlano, competenciaAnterior } from '../../src/server/servicoCompleto';
import { avaliarRoteiro, referenciaValida, rodarConferidorServicos, sanearEtapas, type StoreServicoCompleto } from '../../src/server/servicoCompletoStore';
import { textoDeAcaoFinal, validarPlanoPiloto, type PlanoPiloto } from '../../src/utils/pilotoVisivel';
import { ofertaDeServico, pedidoDaOferta } from '../../src/utils/servicoCompletoCliente';
import { FRASE_NAO_LIBERADO } from '../../src/server/consultorMurade';

const CNPJ = '11222333000181';
const CNPJ2 = '44555666000172';
const contas = [
  { codigo: '1', descricao: 'ATIVO', tipo: 'sintetica', nivel: 1 },
  { codigo: '1.1.01', descricao: 'Caixa', tipo: 'analitica', nivel: 3 },
  { codigo: '1.1.02', descricao: 'Bancos', tipo: 'analitica', nivel: 3 },
  { codigo: '3', descricao: 'RECEITAS', tipo: 'sintetica', nivel: 1 },
  { codigo: '3.1.01', descricao: 'Receita de vendas', tipo: 'analitica', nivel: 3 },
  { codigo: '4', descricao: 'DESPESAS', tipo: 'sintetica', nivel: 1 },
  { codigo: '4.1.01', descricao: 'Despesa de aluguel', tipo: 'analitica', nivel: 3 },
];
const dados = () => ({
  empresa: { cnpj: CNPJ, razaoSocial: 'Loja A', regime: 'Lucro Presumido' },
  contas,
  lancamentos: [
    { id: 'l1', data: '05/10/2026', valor: 1000.1, contaDebitoCodigo: '1.1.02', contaCreditoCodigo: '3.1.01', historico: 'Venda', origem: 'Manual' },
    { id: 'l2', data: '12/10/2026', valor: 0.2, contaDebitoCodigo: '4.1.01', contaCreditoCodigo: '1.1.02', historico: 'Tarifa', origem: 'Manual', statusManual: 'pendente_aprovacao' },
  ],
  preLancamentos: [
    { referenciaOrigem: 'nfe-1', competencia: '2026-10', status: 'pendente_conferencia', origem: 'Fiscal — NFe Saída', valor: 150.15, geradoAutomaticamente: true },
    { referenciaOrigem: 'folha-1', competencia: '2026-10', status: 'pendente_conferencia', origem: 'DP — Folha', valor: 99.95, geradoAutomaticamente: true },
  ],
  lancamentosPadrao: [{ id: 'p1', nome: 'Aluguel', ativo: true, dia: 10, forma: 'Nx1', contaUnica: '1.1.02', historico: 'Aluguel {mes}', partidas: [{ conta: '4.1.01', valorCentavos: 250000 }], inicio: '2026-01' }],
  bensImobilizado: [],
});

function montar(falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>, opc: { empresas?: string[]; sugestoes?: boolean; registroFalha?: boolean; atrasoPreparoMs?: number; liberado?: boolean } = {}) {
  const chamadas: Array<[string, string, any]> = []; const eventos: EventoAuditoria[] = []; let i = 0;
  const empresas = opc.empresas ?? [CNPJ];
  const api: ChamarApi = async (m, c, b) => {
    chamadas.push([m, c, b]);
    if (c === '/api/consultor/liberado') return { status: 200, corpo: opc.liberado === false ? { sucesso: true, liberado: false } : { sucesso: true, liberado: true, escritorio: '11444777000161' } };
    if (c === '/api/workspaces') return { status: 200, corpo: { sucesso: true, empresas: empresas.map((x, n) => ({ cnpj: x, razaoSocial: n ? 'Padaria B' : 'Loja A' })) } };
    if (m === 'GET' && c === `/api/workspaces/${CNPJ}`) return { status: 200, corpo: { sucesso: true, dados: dados() } };
    if (c.endsWith('/fechamentos')) return { status: 200, corpo: { sucesso: true, fechamentos: [{ competencia: '2026-09' }] } };
    if (m === 'GET' && c === `/api/workspaces/${CNPJ}/extratos`) return { status: 200, corpo: { sucesso: true, resumo: [{ contaBanco: '1.1.02', pendentes: 3, conciliados: 0, lancados: 0, comSugestao: 2 }] } };
    if (m === 'GET' && c.startsWith(`/api/workspaces/${CNPJ}/extratos?`)) return { status: 200, corpo: { sucesso: true, movimentos: [
      { fitid: 'F1', situacao: 'pendente', valorCentavos: 100010, sugestaoLancamentoId: opc.sugestoes === false ? null : 'l1' },
      { fitid: 'F2', situacao: 'pendente', valorCentavos: -20, sugestaoConta: opc.sugestoes === false ? null : '4.1.01' },
      { fitid: 'F3', situacao: 'pendente', valorCentavos: -5000 },
    ] } };
    if (m === 'POST' && c === '/api/servico-completo') return opc.registroFalha ? { status: 503, corpo: { sucesso: false } } : { status: 200, corpo: { sucesso: true } };
    if (m === 'GET' && c.startsWith(`/api/workspaces/${CNPJ}/encerramento`)) return { status: 200, corpo: { sucesso: true, contaDestino: decodeURIComponent(/contaDestino=([^&]+)/.exec(c)?.[1] || '2.3.01'), previa: { resultadoCentavos: 99990, partidas: [{}, {}] }, gravados: { ativos: [], pendentes: [] } } };
    if (m === 'POST') { if (opc.atrasoPreparoMs) await new Promise((r) => setTimeout(r, opc.atrasoPreparoMs)); return { status: 200, corpo: { sucesso: true, mensagem: 'ok' } }; }
    return { status: 404, corpo: {} };
  };
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'pronto' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's', login: 'ana', hoje: '2026-11-20', chamarApi: api, registrar: (e) => { eventos.push(e); }, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadas, eventos };
}

test('as ferramentas do serviço completo estão no kit e a instrução fala delas', () => {
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ['fazer_servico_completo', 'preparar_servico_completo', 'servicos_da_agente']) assert.ok(nomes.includes(n), n);
  assert.match(kitContabil.instrucao, /SERVIÇO COMPLETO/);
  assert.match(kitContabil.instrucao, /decisao_do_contador/);
});

test('entende o pedido falado', () => {
  assert.equal(identificarRoteiro('fecha o mês da empresa X'), 'fechamento_mensal');
  assert.equal(identificarRoteiro('concilia o banco'), 'fechamento_mensal');
  assert.equal(identificarRoteiro('lança o que veio do Fiscal e do DP'), 'fechamento_mensal');
  assert.equal(identificarRoteiro('faz a ECD'), 'ecd_ano');
  assert.equal(identificarRoteiro('encerra o resultado de 2025'), 'encerramento_resultado');
  assert.equal(identificarRoteiro('monta o balancete e a DRE pro cliente'), 'balancete_cliente');
  assert.equal(identificarRoteiro('ecd_ano'), 'ecd_ano');
  assert.equal(identificarRoteiro('bom dia'), null);
  assert.equal(competenciaAnterior('2026-01-10'), '2025-12');
  assert.equal(competenciaAnterior('2026-11-20'), '2026-10');
});

test('fechamento: levanta tudo, prepara só o que existe por rota e o piloto para no botão sem clicar em ação final', () => {
  const l = levantarFechamentoMensal({ cnpj: CNPJ, nome: 'Loja A', competencia: '2026-10', dados: { ...dados(), bensImobilizado: [{ id: 'b1', descricao: 'Carro', custoCentavos: 6000000, residualCentavos: 0, vidaUtilMeses: 60, inicioDepreciacao: '2025-01', depreciavel: true }] }, fechadas: new Set(['2026-09']), extrato: { resumo: [{ contaBanco: '1.1.02', pendentes: 3, conciliados: 0, lancados: 0 }], pendentesPorConta: { '1.1.02': [{ fitid: 'F1', valorCentavos: 1, sugestaoLancamentoId: 'l1' }, { fitid: 'F3', valorCentavos: 2 }] } } });
  assert.deepEqual(l.preparo.map((p) => p.tipo), ['reprocessar_recepcao', 'lancamentos_padrao', 'conciliacao']);
  const conc = l.preparo.find((p) => p.tipo === 'conciliacao') as any;
  assert.deepEqual(conc.fitids, ['F1'], 'só aceita o que tem sugestão');
  const recepcao = l.etapas.find((e) => e.id === 'recepcao')!;
  assert.equal(recepcao.situacao, 'contador');
  assert.match(recepcao.detalhe, /2 rascunho\(s\).*Fiscal: 1, DP: 1.*R\$\s?250,10/);
  assert.equal(l.etapas.find((e) => e.id === 'aprovar-fechar')!.situacao, 'contador');
  const plano = montarPlano('t', l.passos) as PlanoPiloto;
  assert.ok(plano && validarPlanoPiloto(plano).ok);
  const ultimo = plano.passos[plano.passos.length - 1];
  assert.equal(ultimo.tipo, 'parar_no_botao');
  assert.equal(ultimo.alvo, '[data-campo=aprovacao-aprovar]', 'há lançamento pendente: para no Aprovar');
  // o piloto só "navega" (clica) em menu ou aba marcada para abrir; nunca em botão de ação final
  for (const p of plano.passos.filter((x) => x.tipo === 'navegar')) assert.ok(/^#btn-menu-|gestao-aba-/.test(p.alvo), p.alvo);
  assert.equal(plano.passos.filter((x) => x.tipo === 'parar_no_botao').length, 1);
});

test('fechamento sem pendência de aprovação termina parado no Fechar competência; depreciação sem rota aparece como falta do sistema', () => {
  const d = { ...dados(), lancamentos: dados().lancamentos.filter((l) => !l.statusManual), lancamentosPadrao: [], bensImobilizado: [{ id: 'b1', descricao: 'Carro', custoCentavos: 6000000, residualCentavos: 0, vidaUtilMeses: 60, inicioDepreciacao: '2025-01', depreciavel: true }] };
  const l = levantarFechamentoMensal({ cnpj: CNPJ, nome: 'Loja A', competencia: '2026-10', dados: d, fechadas: new Set(), extrato: { resumo: [], pendentesPorConta: {} } });
  const plano = montarPlano('t', l.passos)!;
  assert.equal(plano.passos[plano.passos.length - 1].alvo, '[data-campo=fechamento-fechar]');
  assert.equal(l.etapas.find((e) => e.id === 'conciliacao')!.situacao, 'contador', 'sem extrato: pede o OFX');
  assert.deepEqual(l.preparo.map((p) => p.tipo), ['reprocessar_recepcao']);
  const dep = l.etapas.find((e) => e.id === 'depreciacao')!;
  assert.equal(dep.situacao, 'contador');
  assert.match(dep.detalhe, /R\$\s?1\.000,00 de depreciação de 1 bem/);
  assert.ok(l.etapas.some((e) => e.id === 'depreciacao-servidor' && e.situacao === 'falta_sistema'));
  assert.ok(plano.passos.some((p) => p.alvo === '[data-campo=depreciacao-lancar]' && p.tipo === 'destacar'), 'só destaca o botão; não clica');
});

test('pela Agente: começa com a tela aberta, prepara SOZINHA no servidor (segundo plano) e nunca aprova, contabiliza nem fecha', async () => {
  const { ctx, modelo, chamadas, eventos } = montar([
    { chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'fecha o mês', competencia: '2026-10' } }] },
    { texto: `${FRASE_INICIO} Aprovar e fechar é com você.` },
  ]);
  const r = await conversar(ctx, modelo, 'fecha o mês da Loja A', []);
  assert.ok(r.piloto && 'passos' in r.piloto, 'animação enviada à tela');
  assert.equal((r.piloto as PlanoPiloto).segundoPlanoAoInterferir, true, 'se o contador mexer, segue em segundo plano');
  assert.equal(r.acoes.length, 0, 'não pergunta nada antes: sem cartão');
  assert.ok(r.resposta.startsWith(FRASE_INICIO));
  const registro1 = chamadas.find(([m, c]) => m === 'POST' && c === '/api/servico-completo')!;
  assert.equal(registro1[2].estado, 'em_andamento');
  await aguardarServicosEmSegundoPlano();
  const posts = chamadas.filter(([m]) => m === 'POST').map(([, url]) => url);
  assert.ok(posts.includes(`/api/workspaces/${CNPJ}/reprocessar-recepcao`));
  assert.ok(posts.includes(`/api/workspaces/${CNPJ}/lancamentos-padrao/preparar`));
  assert.ok(posts.includes(`/api/workspaces/${CNPJ}/extratos/aceitar-sugestoes`));
  assert.ok(!posts.some((u) => /fechamentos|contabilizar|decisao/.test(u)), 'nunca fecha, contabiliza nem aprova');
  const final = chamadas.filter(([m, u]) => m === 'POST' && u === '/api/servico-completo').pop()!;
  assert.equal(final[2].estado, 'pronto_para_conferir', 'a tela avisa "Seu pedido está pronto para você conferir"');
  assert.ok(final[2].etapas.some((e: any) => e.situacao === 'preparado'));
  assert.ok(eventos.some((e) => e.evento === 'confirmada' && e.ferramenta === 'fazer_servico_completo'), 'fica no histórico da Agente');
  assert.equal(servicosEmSegundoPlano(), 0);
});

test('modo manual (cartão) continua disponível: preparar_servico_completo só grava depois do sim', async () => {
  const { ctx, modelo, chamadas } = montar([{ chamadas: [{ nome: 'preparar_servico_completo', args: { servico: 'fechamento_mensal', cnpj: CNPJ, competencia: '2026-10' } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'prepara mas me deixa confirmar', []);
  assert.equal(r.acoes.length, 1);
  assert.equal(chamadas.filter(([m]) => m === 'POST').length, 0);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, true);
  assert.match(c.mensagem, /A conferir/);
  assert.ok(chamadas.some(([m, u]) => m === 'POST' && u.endsWith('/extratos/aceitar-sugestoes')));
});

test('o mesmo serviço não roda duas vezes ao mesmo tempo na mesma sessão', async () => {
  const { ctx, modelo, chamadas } = montar([
    { chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'fecha o mês', competencia: '2026-10' } }, { nome: 'fazer_servico_completo', args: { servico: 'fecha o mês', competencia: '2026-10' } }] },
    { texto: 'ok' },
  ], { atrasoPreparoMs: 80 });
  await conversar(ctx, modelo, 'fecha o mês', []);
  await aguardarServicosEmSegundoPlano();
  assert.equal(chamadas.filter(([m, u]) => m === 'POST' && u.endsWith('/reprocessar-recepcao')).length, 1);
});

test('pergunta uma vez só quando falta a empresa; usa o mês anterior quando o pedido não diz', async () => {
  const a = montar([{ chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'fecha o mês' } }] }, { texto: 'Para qual empresa?' }], { empresas: [CNPJ, CNPJ2] });
  const r = await conversar(a.ctx, a.modelo, 'fecha o mês', []);
  assert.equal(r.piloto, null);
  assert.equal(a.chamadas.filter(([m]) => m === 'POST').length, 0);
  const b = montar([{ chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'balancete para o cliente' } }] }, { texto: 'ok' }]);
  const r2 = await conversar(b.ctx, b.modelo, 'balancete pro cliente', []);
  const reg = b.chamadas.find(([m, c]) => m === 'POST' && c === '/api/servico-completo')!;
  assert.equal(reg[2].referencia, '2026-10');
  assert.equal(reg[2].estado, 'pronto_para_conferir', 'balancete não tem preparo: já fica em A conferir');
  assert.equal(r2.acoes.length, 0);
});

test('balancete para o cliente: valores exatos em centavos e o envio aparece como o que o sistema ainda não faz', () => {
  const l = levantarBalanceteCliente({ cnpj: CNPJ, nome: 'Loja A', competencia: '2026-10', dados: dados(), fechadas: new Set() });
  const dre = l.etapas.find((e) => e.id === 'dre')!;
  assert.match(dre.detalhe, /Receitas R\$\s?1\.000,10/);
  assert.equal(l.etapas.find((e) => e.id === 'envio')!.situacao, 'falta_sistema');
  assert.equal(l.etapas.find((e) => e.id === 'pendencias')!.situacao, 'aviso');
  const plano = montarPlano('t', l.passos)!;
  assert.equal(plano.passos[plano.passos.length - 1].alvo, '[data-campo=balancete-exportar]');
});

test('decisão do contador diferente da norma: faz do jeito dele e registra a orientação e a responsabilidade', async () => {
  assert.equal(etapaDecisaoDoContador({}), null);
  const e = etapaDecisaoDoContador({ decisao_do_contador: { pedido: 'encerrar contra a conta 2.3.05', orientacao_do_sistema: 'encerrar contra Lucros ou Prejuízos Acumulados', fonte: 'Lei 6.404/76, art. 186' } })!;
  assert.match(e.detalhe, /Feito como o contador decidiu: encerrar contra a conta 2\.3\.05\. A orientação do sistema era: encerrar contra Lucros ou Prejuízos Acumulados \(Lei 6\.404\/76, art\. 186\)\. Decisão e responsabilidade do contador\./);
  const d = { pedido: 'encerrar contra a conta 2.3.05', orientacao_do_sistema: 'Lucros ou Prejuízos Acumulados', fonte: 'NBC TG 26' };
  const { ctx, modelo, chamadas, eventos } = montar([
    { chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'encerramento_resultado', ano: '2025', conta_destino: '2.3.05', decisao_do_contador: d } }] },
    { texto: 'ok' },
  ]);
  await conversar(ctx, modelo, 'encerra contra a 2.3.05 mesmo', []);
  await aguardarServicosEmSegundoPlano();
  assert.ok(chamadas.some(([m, c]) => m === 'GET' && c.includes('contaDestino=2.3.05')), 'usa a conta escolhida pelo contador');
  assert.ok(eventos.some((x) => /Decisão e responsabilidade do contador/.test(x.resumo)), 'fica no histórico da Agente');
  const final = chamadas.filter(([m, u]) => m === 'POST' && u === '/api/servico-completo').pop()!;
  assert.ok(final[2].etapas.some((x: any) => x.id === 'decisao-contador'), 'fica no resumo de A conferir');
  const post = chamadas.find(([m, u]) => m === 'POST' && u === `/api/workspaces/${CNPJ}/encerramento`)!;
  assert.equal(post[2].contaDestino, '2.3.05');
});

test('sem o registro de "A conferir", o piloto não tenta destacar o painel (não para no meio)', async () => {
  const { ctx, modelo } = montar([{ chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'balancete_cliente', competencia: '2026-10' } }] }, { texto: 'ok' }], { registroFalha: true });
  const r = await conversar(ctx, modelo, 'x', []);
  assert.ok(r.piloto && 'passos' in r.piloto && !(r.piloto as PlanoPiloto).passos.some((p) => p.alvo === 'texto:Serviços preparados pela Agente'));
});

test('depois do preparo: etapa recusada pela rota vira aviso com o motivo; contador continua contador', () => {
  const etapas = sanearEtapas([{ id: 'padrao', titulo: 'Padrão', situacao: 'a_preparar', detalhe: 'x' }, { id: 'recepcao', titulo: 'Recepção', situacao: 'contador', detalhe: 'y' }, { id: 'conciliacao', titulo: 'C', situacao: 'a_preparar', detalhe: 'z' }]);
  const r = etapasDepoisDoPreparo(etapas, [
    { item: { tipo: 'lancamentos_padrao', etapa: 'padrao', descricao: '', competencia: '2026-10' }, ok: true, mensagem: '1 partida preparada.' },
    { item: { tipo: 'reprocessar_recepcao', etapa: 'recepcao', descricao: '' }, ok: true, mensagem: 'Recepção reprocessada.' },
    { item: { tipo: 'conciliacao', etapa: 'conciliacao', descricao: '', contaBanco: '1', fitids: ['a'] }, ok: false, mensagem: 'Competência fechada.' },
  ]);
  assert.deepEqual(r.map((x) => x.situacao), ['preparado', 'contador', 'aviso']);
  assert.match(r[2].detalhe, /Competência fechada/);
});

test('robô conferidor dos serviços: parado, lembrete, concluído e nada', async () => {
  const agora = new Date('2026-11-20T12:00:00Z');
  const base = { roteiro: 'fechamento_mensal' as const, referencia: '2026-10', titulo: 'Fechamento' };
  assert.equal(avaliarRoteiro({ ...base, estado: 'aguardando_preparo', atualizadoEm: '2026-11-20T11:00:00Z' }, false, agora).acao, 'parado');
  assert.equal(avaliarRoteiro({ ...base, estado: 'aguardando_preparo', atualizadoEm: '2026-11-20T11:50:00Z' }, false, agora).acao, 'nada');
  assert.equal(avaliarRoteiro({ ...base, estado: 'pronto_para_conferir', atualizadoEm: '2026-11-10T11:00:00Z' }, false, agora).acao, 'lembrar');
  assert.equal(avaliarRoteiro({ ...base, estado: 'pronto_para_conferir', atualizadoEm: '2026-11-19T11:00:00Z' }, true, agora).acao, 'concluido');
  assert.equal(avaliarRoteiro({ ...base, roteiro: 'ecd_ano', referencia: '2025', estado: 'pronto_para_conferir', atualizadoEm: '2026-11-19T11:00:00Z' }, true, agora).acao, 'nada');
  const mudancas: string[] = [];
  const store = {
    agora: () => agora,
    abertos: async () => [
      { tenantId: 't', cnpj: CNPJ, roteiro: 'fechamento_mensal', referencia: '2026-10', estado: 'pronto_para_conferir', titulo: 'F', resumo: '', etapas: [], porLogin: null, porNome: null, criadoEm: '', atualizadoEm: '2026-11-19T00:00:00Z', aviso: null },
      { tenantId: 't', cnpj: CNPJ, roteiro: 'ecd_ano', referencia: '2025', estado: 'aguardando_preparo', titulo: 'E', resumo: '', etapas: [], porLogin: null, porNome: null, criadoEm: '', atualizadoEm: '2026-11-19T00:00:00Z', aviso: null },
    ],
    mudarEstado: async (c: any, estado: string) => { mudancas.push(`${c.roteiro}:${estado}`); return 1; },
    apagarAntigos: async () => 2,
  } as unknown as StoreServicoCompleto;
  const r = await rodarConferidorServicos(store, async (sql) => (/period_closures/.test(sql) ? { rows: [{ cnpj: CNPJ, competencia: '2026-10' }] } : { rows: [] }));
  assert.deepEqual(mudancas.sort(), ['ecd_ano:parado', 'fechamento_mensal:concluido']);
  assert.equal(r.parados, 1); assert.equal(r.concluidos, 1); assert.equal(r.apagados, 2);
  assert.equal(referenciaValida('fechamento_mensal', '2026-13'), null);
  assert.equal(referenciaValida('ecd_ano', '2025'), '2025');
});

test('detector de dificuldade oferece o serviço certo e monta o pedido', () => {
  assert.equal(ofertaDeServico('gestao-contabil', 'Fechar competência')?.roteiro, 'fechamento_mensal');
  assert.equal(ofertaDeServico('livros', 'Baixar arquivo ECD (.txt)')?.roteiro, 'ecd_ano');
  assert.equal(ofertaDeServico('livros', 'Encerramento do resultado')?.roteiro, 'encerramento_resultado');
  assert.equal(ofertaDeServico('balancete', 'Exportar CSV local')?.roteiro, 'balancete_cliente');
  assert.equal(ofertaDeServico('empresa', 'Salvar Empresa'), null);
  assert.equal(pedidoDaOferta(ofertaDeServico('aprovacoes', 'Aprovar')!, { cnpj: '11.222.333/0001-81', razaoSocial: 'Loja A' }), 'Faça para mim o serviço completo: fecha o mês da empresa Loja A, CNPJ 11222333000181.');
  assert.equal(identificarRoteiro(pedidoDaOferta(ofertaDeServico('livros', 'ECD')!, {})), 'ecd_ano');
});

test('os botões onde o piloto para são tratados como ação final (só o clique do contador)', () => {
  for (const t of ['Aprovar', 'Fechar competência', 'Lançar depreciação do mês']) assert.ok(textoDeAcaoFinal(t), t);
});

test('adicional não liberado para o escritório: a Agente responde a frase do adicional e não faz nada', async () => {
  const { ctx, modelo, chamadas } = montar([{ chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'fecha o mês' } }, { nome: 'preparar_servico_completo', args: { servico: 'fecha o mês' } }] }, { texto: FRASE_NAO_LIBERADO }], { liberado: false });
  const r = await conversar(ctx, modelo, 'fecha o mês', []);
  assert.equal(r.piloto, null); assert.equal(r.acoes.length, 0);
  assert.equal(chamadas.filter(([m]) => m === 'POST').length, 0);
  assert.ok(!chamadas.some(([, c]) => c.startsWith('/api/workspaces/')), 'nem levanta nada');
  assert.equal(FRASE_NAO_LIBERADO, 'O Consultor Murade completo, que faz o serviço inteiro para você, é um adicional. Fale com o seu fornecedor para liberar.');
});
