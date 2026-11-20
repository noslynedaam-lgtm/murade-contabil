// Serviço completo: animação que vira segundo plano quando o contador mexe, Consultor Murade (fetch simulado) e
// isolamento por escritório/CNPJ das rotas de "A conferir".
import test from 'node:test';
import assert from 'node:assert/strict';
import { MSG_INTERFERENCIA, MSG_SERVICO_SEGUE, PilotoExecutor, validarPlanoPiloto, type AmbientePiloto, type PlanoPiloto } from '../../src/utils/pilotoVisivel';
import { ArmazemAcoesPendentes, conversar, type ChamarApi, type ContextoAgente, type EventoAuditoria, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { aguardarServicosEmSegundoPlano } from '../../src/server/servicoCompleto';
import { CACHE_LIBERACAO_MS, consultorLiberado, limparCacheLiberacaoParaTeste, opcoesConsultorParaTeste, perguntarAoConsultor, regimeParaConsultor, type Fetch } from '../../src/server/consultorMurade';
import { cnpjValido, registrarRotasEscritorioConsultor, type StoreEscritorio } from '../../src/server/escritorioConsultor';
import { registrarRotasServicoCompleto, type StoreServicoCompleto } from '../../src/server/servicoCompletoStore';

// ------------------------------------------------------------------ piloto: interferência vira segundo plano
function ambiente(): AmbientePiloto & { log: string[] } {
  const log: string[] = []; let tela = 'inicio';
  return {
    log,
    resolver: (a) => ({ a }), aguardar: async (a) => ({ a }), ehSensivel: () => false, ehDesabilitado: () => false, modoDoCampo: () => 'digitar', temOpcao: () => true,
    ehCampoEditavel: () => true, podeClicarParaAbrir: () => true, tipoDeBotaoFinal: () => 'irreversivel', rolarAte: () => undefined,
    destacar: (e: any) => { log.push(`destacar:${e.a}`); }, limparDestaque: () => { log.push('limpar'); }, definirValor: () => undefined, focar: () => undefined,
    clicar: (e: any) => { log.push(`clicar:${e.a}`); }, aoClicarUmaVez: () => () => undefined, navegarPara: (t) => { tela = t; log.push(`navegar:${t}`); return true; },
    selecionarEmpresa: () => true, telaAtual: () => tela, empresaAtual: () => '', empresaPronta: () => true, executarApi: async () => ({ ok: false }),
    esperar: async () => { await Promise.resolve(); },
  };
}
const passos: PlanoPiloto['passos'] = [
  { tipo: 'navegar', alvo: '#btn-menu-revisao-origens', legenda: 'Abrindo' },
  { tipo: 'destacar', alvo: 'texto:Prévia contábil das notas', legenda: 'Rascunhos' },
  { tipo: 'navegar', alvo: '#btn-menu-aprovacoes', legenda: 'Abrindo' },
  { tipo: 'parar_no_botao', alvo: '[data-campo=aprovacao-aprovar]', legenda: 'Aprovar' },
];
const ocioso = async (n = 30) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

test('serviço completo: se o contador mexe, a animação se recolhe e o serviço segue (não pausa)', async () => {
  const v = validarPlanoPiloto({ titulo: 'Serviço completo: x', passos, segundoPlanoAoInterferir: true });
  assert.ok(v.ok && v.plano.segundoPlanoAoInterferir === true);
  const falas: string[] = []; const amb = ambiente();
  const exec = new PilotoExecutor((v as any).plano, amb, { aoFalar: (t) => falas.push(t) });
  void exec.iniciar(); exec.interferir('toque');
  await ocioso();
  assert.equal(exec.getEstado(), 'cancelado');
  assert.deepEqual(falas, [MSG_SERVICO_SEGUE]);
  assert.equal(exec.resultado().usouSegundoPlano, true);
  assert.ok(!amb.log.some((l) => l.startsWith('clicar:[data-campo')), 'nunca clica no botão final');
  // plano comum continua pausando como antes
  const exec2 = new PilotoExecutor({ titulo: 'Comum', passos }, ambiente(), { aoFalar: (t) => falas.push(t) });
  void exec2.iniciar(); exec2.interferir('toque'); await ocioso();
  assert.equal(exec2.getEstado(), 'pausado');
  assert.equal(falas[falas.length - 1], MSG_INTERFERENCIA);
});

test('serviço completo sem interferência: a animação passa pelas telas e para no Aprovar', async () => {
  const amb = ambiente();
  const exec = new PilotoExecutor({ titulo: 'Serviço completo: x', passos, segundoPlanoAoInterferir: true }, amb);
  void exec.iniciar(); await ocioso(80);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.ok(amb.log.includes('navegar:aprovacoes'));
});

// ------------------------------------------------------------------ Consultor Murade (fetch simulado)
const CNPJ = '11222333000181';
function agente(falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>, liberado = true) {
  const chamadas: Array<[string, string, any]> = []; const eventos: EventoAuditoria[] = []; let i = 0;
  const api: ChamarApi = async (m, c, b) => {
    chamadas.push([m, c, b]);
    if (c === '/api/consultor/liberado') return { status: 200, corpo: liberado ? { liberado: true, escritorio: '11444777000161' } : { liberado: false } };
    if (c === '/api/workspaces') return { status: 200, corpo: { empresas: [{ cnpj: CNPJ, razaoSocial: 'Loja A' }] } };
    if (m === 'GET' && c === `/api/workspaces/${CNPJ}`) return { status: 200, corpo: { dados: { empresa: { regime: 'Simples Nacional', cnae: '4744-0/01', uf: 'GO', municipio: 'Goiânia' }, contas: [], lancamentos: [], preLancamentos: [] } } };
    if (c === '/api/ai/chat') return { status: 200, corpo: { reply: 'resposta antiga', sources: [] } };
    return { status: 200, corpo: { sucesso: true } };
  };
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'ok' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's', login: 'ana', hoje: '2026-11-20', chamarApi: api, registrar: (e) => { eventos.push(e); }, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadas, eventos };
}
function fetchSimulado(resposta: (url: string, corpo: any) => { status: number; json: any } | 'erro') {
  const pedidos: Array<{ url: string; headers: Record<string, string>; corpo: any }> = [];
  const f: Fetch = async (url, init) => { const corpo = JSON.parse(init.body); pedidos.push({ url, headers: init.headers, corpo }); const r = resposta(url, corpo); if (r === 'erro') throw new Error('fora do ar'); return { status: r.status, json: async () => r.json }; };
  return { f, pedidos };
}
const RESPOSTA_OK = { resposta: 'O encerramento vai para Lucros ou Prejuízos Acumulados.', area: 'contabil', fontes: [{ titulo: 'Lei 6.404/76', url: 'https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm' }], confianca: 'alta', encaminharContador: false, acoesSugeridas: [{ ferramenta: 'fazer_servico_completo', descricao: 'Encerrar o resultado', argumentos: { servico: 'encerramento_resultado', ano: '2025' } }, { ferramenta: 'ferramenta_que_nao_existe', descricao: 'x', argumentos: {} }], avisoResponsabilidade: 'A decisão final é do contador responsável (CRC).' };

test('consultar_legislacao usa o Consultor primeiro: token, sistema contabil, contexto da empresa e ferramentas; mostra fontes, aviso e oferece fazer', async (t) => {
  const { f, pedidos } = fetchSimulado(() => ({ status: 200, json: RESPOSTA_OK }));
  opcoesConsultorParaTeste.atual = { fetch: f, env: { MURADE_CONSULTOR_TOKEN: 'segredo', MURADE_CONSULTOR_URL: 'https://consultor.exemplo.gov.br/' } };
  t.after(() => { opcoesConsultorParaTeste.atual = {}; });
  let resultado: any = null;
  const m = agente([{ chamadas: [{ nome: 'consultar_legislacao', args: { pergunta: 'Para onde vai o resultado?', cnpj: CNPJ } }] }, { texto: 'ok' }]);
  const modeloEspiao: ModeloIA = async (e) => { const r = await m.modelo(e); const ult = e.conteudos[e.conteudos.length - 1]; if (ult?.parts?.[0]?.functionResponse) resultado = ult.parts[0].functionResponse.response; return r; };
  await conversar(m.ctx, modeloEspiao, 'para onde vai o resultado?', []);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, 'https://consultor.exemplo.gov.br/api/consultor/perguntar');
  assert.equal(pedidos[0].headers['x-murade-consultor-token'], 'segredo');
  assert.equal(pedidos[0].corpo.sistema, 'contabil');
  assert.deepEqual({ regime: pedidos[0].corpo.contextoEmpresa.regime, uf: pedidos[0].corpo.contextoEmpresa.uf, cnae: pedidos[0].corpo.contextoEmpresa.cnaePrincipal }, { regime: 'simples', uf: 'GO', cnae: '4744-0/01' });
  assert.ok(pedidos[0].corpo.ferramentasDisponiveis.some((x: any) => x.nome === 'fazer_servico_completo'));
  assert.equal(pedidos[0].corpo.escritorio, '11444777000161', 'escritório = CNPJ do escritório');
  assert.equal(pedidos[0].corpo.usuario, 'ana');
  assert.equal(resultado.fonte, 'Consultor Murade');
  assert.equal(resultado.fontesOficiais[0].url, RESPOSTA_OK.fontes[0].url);
  assert.match(resultado.avisoResponsabilidade, /contador responsável/);
  assert.deepEqual(resultado.acoesSugeridas.map((a: any) => a.ferramenta), ['fazer_servico_completo'], 'só ferramenta que existe aqui');
  assert.match(resultado.instrucao, /Quer que eu faça para você/);
  assert.ok(!m.chamadas.some(([, c]) => c === '/api/ai/chat'), 'não usou a consulta antiga');
});

test('Consultor sem variável, fora do ar ou com erro: cai na consulta de sempre, sem erro', async (t) => {
  t.after(() => { opcoesConsultorParaTeste.atual = {}; });
  for (const opc of [{ env: {} }, { fetch: fetchSimulado(() => 'erro').f, env: { MURADE_CONSULTOR_TOKEN: 'x' } }, { fetch: fetchSimulado(() => ({ status: 503, json: { erro: 'não configurado' } })).f, env: { MURADE_CONSULTOR_TOKEN: 'x' } }]) {
    opcoesConsultorParaTeste.atual = opc;
    const m = agente([{ chamadas: [{ nome: 'consultar_legislacao', args: { pergunta: 'prazo da ECD?' } }] }, { texto: 'ok' }]);
    await conversar(m.ctx, m.modelo, 'prazo da ECD?', []);
    assert.ok(m.chamadas.some(([, c]) => c === '/api/ai/chat'));
  }
  // demora: o tempo-limite também devolve null
  const lento: Fetch = (_u, init) => new Promise((_r, rej) => { const vivo = setTimeout(() => rej(new Error('nunca')), 5_000); init.signal?.addEventListener('abort', () => { clearTimeout(vivo); rej(new Error('tempo esgotado')); }); });
  assert.equal(await perguntarAoConsultor({ pergunta: 'x' }, { fetch: lento, env: { MURADE_CONSULTOR_TOKEN: 'x' }, timeoutMs: 20 }), null);
  assert.equal(regimeParaConsultor('Lucro Presumido'), 'presumido');
  assert.equal(regimeParaConsultor('MEI'), 'mei');
});

test('divergência confirmada: registra a decisão no Consultor e no resumo/histórico (fora e dentro do serviço completo)', async (t) => {
  const { f, pedidos } = fetchSimulado(() => ({ status: 201, json: { ok: true } }));
  opcoesConsultorParaTeste.atual = { fetch: f, env: { MURADE_CONSULTOR_TOKEN: 'segredo' } };
  t.after(() => { opcoesConsultorParaTeste.atual = {}; });
  const a = agente([{ chamadas: [{ nome: 'registrar_decisao_contador', args: { pergunta: 'Prazo da rescisão', orientacao: 'Pagar em até 10 dias (CLT, art. 477, § 6º).', fonte_titulo: 'CLT', fonte_url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm', escolha_do_contador: 'Pagar no 12º dia.' } }] }, { texto: 'ok' }]);
  await conversar(a.ctx, a.modelo, 'faz do meu jeito', []);
  assert.equal(pedidos[0].url, 'https://murade-agente-ia.onrender.com/api/consultor/registrar-decisao');
  assert.equal(pedidos[0].corpo.sistema, 'contabil');
  assert.equal(pedidos[0].corpo.escolhaDoContador, 'Pagar no 12º dia.');
  assert.ok(a.eventos.some((e) => /Decisão e responsabilidade do contador/.test(e.resumo)));
  const b = agente([{ chamadas: [{ nome: 'fazer_servico_completo', args: { servico: 'balancete_cliente', competencia: '2026-10', decisao_do_contador: { pedido: 'mandar sem fechar o mês', orientacao_do_sistema: 'fechar antes de mandar', fonte: 'ITG 2000' } } }] }, { texto: 'ok' }]);
  await conversar(b.ctx, b.modelo, 'manda mesmo assim', []);
  await aguardarServicosEmSegundoPlano();
  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[1].corpo.escolhaDoContador, 'mandar sem fechar o mês');
  const reg = b.chamadas.find(([m, c]) => m === 'POST' && c === '/api/servico-completo')!;
  assert.ok(reg[2].etapas.some((e: any) => e.id === 'decisao-contador'));
});

// ------------------------------------------------------------------ isolamento por escritório e CNPJ
test('rotas de "A conferir": cada escritório só vê e grava as próprias empresas; leitura não grava', async () => {
  const rotas = new Map<string, Function>();
  const app: any = { get: (p: string, ...h: Function[]) => rotas.set(`GET ${p}`, h[h.length - 1]), post: (p: string, ...h: Function[]) => rotas.set(`POST ${p}`, h[h.length - 1]) };
  const listados: Array<[string, string[]]> = []; const gravados: any[] = [];
  const store = { listar: async (t: string, c: string[]) => { listados.push([t, c]); return []; }, gravar: async (r: any) => { gravados.push(r); }, mudarEstado: async () => 1 } as unknown as StoreServicoCompleto;
  const sessoes: Record<string, any> = {
    a: { userId: 'u1', login: 'ana', cnpjs: ['11222333000181'], tenantId: 'esc-A', podeEscrever: () => true },
    b: { userId: 'u2', login: 'bia', cnpjs: ['44555666000172'], tenantId: 'esc-B', podeEscrever: () => false },
  };
  registrarRotasServicoCompleto(app, { exigirSessao: (_q: any, _s: any, n: any) => n(), exigirOrigem: (_q: any, _s: any, n: any) => n() } as any, { store, sessao: (req: any) => sessoes[req.quem], normalizarCnpj: (v) => String(v ?? '').replace(/\D/g, '') });
  const chamar = async (rota: string, req: any) => { let status = 200; let corpo: any; const res: any = { setHeader: () => undefined, status: (s: number) => { status = s; return res; }, json: (j: any) => { corpo = j; } }; await rotas.get(rota)!({ query: {}, body: {}, ...req }, res); return { status, corpo }; };
  assert.equal((await chamar('GET /api/servico-completo', { quem: 'a', query: { cnpj: '44555666000172' } })).status, 403, 'empresa de outro escritório');
  await chamar('GET /api/servico-completo', { quem: 'a' });
  assert.deepEqual(listados.pop(), ['esc-A', ['11222333000181']]);
  const corpo = { cnpj: '44555666000172', roteiro: 'fechamento_mensal', referencia: '2026-10', estado: 'em_andamento', titulo: 'x' };
  assert.equal((await chamar('POST /api/servico-completo', { quem: 'a', body: corpo })).status, 403, 'não grava em empresa de outro escritório');
  assert.equal((await chamar('POST /api/servico-completo', { quem: 'b', body: corpo })).status, 403, 'acesso somente leitura não grava');
  assert.equal((await chamar('POST /api/servico-completo', { quem: 'a', body: { ...corpo, cnpj: '11222333000181' } })).status, 200);
  assert.equal(gravados[0].tenantId, 'esc-A');
  assert.equal((await chamar('GET /api/servico-completo', {})).status, 401);
});

test('consultar_legislacao com o adicional NÃO liberado: não chama o Consultor e segue com a consulta de sempre', async (t) => {
  const { f, pedidos } = fetchSimulado(() => ({ status: 200, json: RESPOSTA_OK }));
  opcoesConsultorParaTeste.atual = { fetch: f, env: { MURADE_CONSULTOR_TOKEN: 'segredo' } };
  t.after(() => { opcoesConsultorParaTeste.atual = {}; });
  const m = agente([{ chamadas: [{ nome: 'consultar_legislacao', args: { pergunta: 'prazo da ECD?' } }] }, { texto: 'ok' }], false);
  await conversar(m.ctx, m.modelo, 'prazo da ECD?', []);
  assert.equal(pedidos.length, 0);
  assert.ok(m.chamadas.some(([, c]) => c === '/api/ai/chat'));
});

test('liberação do adicional: liberado, não liberado, fora do ar e sem variável; cache de 10 minutos por escritório', async () => {
  limparCacheLiberacaoParaTeste();
  let n = 0; const urls: string[] = [];
  const f: Fetch = async (url, init) => { n += 1; urls.push(url); assert.equal(init.headers['x-murade-consultor-token'], 'tk'); return { status: 200, json: async () => ({ liberado: url.endsWith('11444777000161') }) }; };
  const o = { fetch: f, env: { MURADE_CONSULTOR_TOKEN: 'tk' } };
  assert.equal(await consultorLiberado('11.444.777/0001-61', o, 0), true);
  assert.equal(await consultorLiberado('11444777000161', o, 1000), true);
  assert.equal(n, 1, 'segunda vez veio do cache');
  assert.equal(urls[0], 'https://murade-agente-ia.onrender.com/api/consultor/liberado?escritorio=11444777000161');
  assert.equal(await consultorLiberado('11444777000161', o, CACHE_LIBERACAO_MS + 1), true);
  assert.equal(n, 2, 'passados 10 minutos, pergunta de novo');
  assert.equal(await consultorLiberado('22333444000181', o, 0), false, 'outro escritório: não liberado');
  limparCacheLiberacaoParaTeste();
  assert.equal(await consultorLiberado('11444777000161', { fetch: async () => { throw new Error('fora'); }, env: { MURADE_CONSULTOR_TOKEN: 'tk' } }), false, 'fora do ar = não liberado');
  limparCacheLiberacaoParaTeste();
  assert.equal(await consultorLiberado('11444777000161', { fetch: f, env: {} }), false, 'sem variável = não liberado');
  assert.equal(await consultorLiberado(null, o), false, 'sem CNPJ do escritório = não liberado');
});

test('CNPJ do escritório: cada escritório lê e grava só o seu; só o administrador grava; liberação usa o CNPJ do próprio escritório', async () => {
  assert.equal(cnpjValido('11.444.777/0001-61'), '11444777000161');
  assert.equal(cnpjValido('11444777000162'), null);
  const dados = new Map<string, string>();
  const store = { ler: async (t: string) => dados.get(t) ?? null, gravar: async (t: string, c: string) => { dados.set(t, c); } } as unknown as StoreEscritorio;
  const rotas = new Map<string, Function>();
  const app: any = { get: (p: string, ...h: Function[]) => rotas.set(`GET ${p}`, h[h.length - 1]), post: (p: string, ...h: Function[]) => rotas.set(`POST ${p}`, h[h.length - 1]) };
  const sessoes: Record<string, any> = { adminA: { tenantId: 'A', podeEditar: true }, equipeA: { tenantId: 'A', podeEditar: false }, adminB: { tenantId: 'B', podeEditar: true } };
  const consultados: string[] = [];
  const f: Fetch = async (url) => { consultados.push(url); return { status: 200, json: async () => ({ liberado: true }) }; };
  limparCacheLiberacaoParaTeste();
  registrarRotasEscritorioConsultor(app, { exigirSessao: ((_q: any, _s: any, n: any) => n()) as any, exigirOrigem: ((_q: any, _s: any, n: any) => n()) as any }, { store, sessao: (req: any) => sessoes[req.quem], opcoes: () => ({ fetch: f, env: { MURADE_CONSULTOR_TOKEN: 'tk' } }) });
  const chamar = async (rota: string, req: any) => { let status = 200; let corpo: any; const res: any = { setHeader: () => undefined, status: (x: number) => { status = x; return res; }, json: (j: any) => { corpo = j; } }; await rotas.get(rota)!({ query: {}, body: {}, ...req }, res); return { status, corpo }; };
  assert.equal((await chamar('POST /api/escritorio/cnpj', { quem: 'equipeA', body: { cnpj: '11444777000161' } })).status, 403);
  assert.equal((await chamar('POST /api/escritorio/cnpj', { quem: 'adminA', body: { cnpj: '11444777000162' } })).status, 400);
  assert.equal((await chamar('POST /api/escritorio/cnpj', { quem: 'adminA', body: { cnpj: '11.444.777/0001-61' } })).status, 200);
  assert.equal((await chamar('GET /api/escritorio/cnpj', { quem: 'equipeA' })).corpo.cnpj, '11444777000161');
  assert.equal((await chamar('GET /api/escritorio/cnpj', { quem: 'adminB' })).corpo.cnpj, null, 'o escritório B não vê o CNPJ do A');
  const b = await chamar('GET /api/consultor/liberado', { quem: 'adminB' });
  assert.equal(b.corpo.liberado, false); assert.match(b.corpo.frase, /adicional/);
  assert.equal(consultados.length, 0, 'sem CNPJ do escritório nem pergunta ao Consultor');
  const a = await chamar('GET /api/consultor/liberado', { quem: 'equipeA' });
  assert.equal(a.corpo.liberado, true);
  assert.match(consultados[0], /escritorio=11444777000161$/);
});
