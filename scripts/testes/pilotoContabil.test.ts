import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, conversar, type ChamarApi, type ContextoAgente, type EventoAuditoria, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { dataParaTela, valorParaLegenda, valorParaTela } from '../../src/server/pilotoContabil';
import { validarPlanoPiloto, type PlanoPiloto } from '../../src/utils/pilotoVisivel';

const CNPJ_A = '12345678000190';
const CNPJ_B = '98765432000110';
const contas = [
  { codigo: '1', descricao: 'ATIVO', tipo: 'sintetica', nivel: 1 },
  { codigo: '1.1', descricao: 'Ativo Circulante', tipo: 'sintetica', nivel: 2 },
  { codigo: '1.1.01', descricao: 'Caixa', tipo: 'analitica', nivel: 3 },
  { codigo: '1.1.02', descricao: 'Bancos', tipo: 'analitica', nivel: 3 },
  { codigo: '4.1.01', descricao: 'Receita de vendas', tipo: 'analitica', nivel: 3 },
];

function montar(opcoes: { empresas?: string[]; fechadas?: string[] } = {}, falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }> = []) {
  const eventos: EventoAuditoria[] = []; const chamadas: Array<[string, string]> = []; let i = 0;
  const empresas = opcoes.empresas ?? [CNPJ_A];
  const api: ChamarApi = async (m, c) => {
    chamadas.push([m, c]);
    if (c === '/api/workspaces') return { status: 200, corpo: { sucesso: true, empresas: empresas.map((x) => ({ cnpj: x, razaoSocial: `Empresa ${x.slice(0, 4)}` })) } };
    if (c.endsWith('/fechamentos')) return { status: 200, corpo: { sucesso: true, fechamentos: (opcoes.fechadas || []).map((competencia) => ({ competencia })) } };
    const m2 = /^\/api\/workspaces\/([^/]+)$/.exec(c);
    if (m2) return empresas.includes(m2[1]) ? { status: 200, corpo: { sucesso: true, dados: { contas } } } : { status: 403, corpo: { motivo: 'Sem acesso a esta empresa.' } };
    return { status: 404, corpo: {} };
  };
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'ok' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's', login: 'ana', hoje: '2026-11-18', chamarApi: api, registrar: (e) => { eventos.push(e); }, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, eventos, chamadas };
}
const rodar = async (nome: string, args: any, opc: Parameters<typeof montar>[0] = {}) => {
  const m = montar(opc, [{ chamadas: [{ nome, args }] }, { texto: 'pronto' }]);
  const r = await conversar(m.ctx, m.modelo, 'x', []);
  return { r, ...m };
};
const plano = (r: any): PlanoPiloto => r.piloto as PlanoPiloto;

test('mostrar_na_tela: empresa, tela, competência e destaque viram passos, validados e com registro no log', async () => {
  const { r, eventos } = await rodar('mostrar_na_tela', { tela: 'balancete', cnpj: CNPJ_A, competencia: '2026-10', destaque: 'balancete-local' });
  const p = plano(r);
  assert.deepEqual(p.passos.map((s) => [s.tipo, s.alvo, s.valor]), [
    ['selecionar', '[data-campo=empresa-ativa]', CNPJ_A],
    ['navegar', '#btn-menu-balancete', undefined],
    ['selecionar', '[data-campo=balancete-competencia]', '2026-10'],
    ['destacar', 'texto:Balancete local', undefined],
  ]);
  assert.equal(validarPlanoPiloto(p).ok, true);
  assert.ok(eventos.some((e) => e.evento === 'piloto' && e.ferramenta === 'mostrar_na_tela' && e.cnpj === CNPJ_A));
  assert.ok(!JSON.stringify(eventos).includes('2026-10'), 'o log guarda só o título do roteiro, não os valores');
});

test('mostrar_na_tela: tela inexistente, competência em tela sem seletor e ponto desconhecido são recusados', async () => {
  assert.equal((await rodar('mostrar_na_tela', { tela: 'nao-existe' })).r.piloto ?? null, null);
  assert.equal((await rodar('mostrar_na_tela', { tela: 'lancamentos', competencia: '2026-10' })).r.piloto ?? null, null);
  assert.equal((await rodar('mostrar_na_tela', { tela: 'livros', destaque: 'lancamento-gravar' })).r.piloto ?? null, null, 'botão final nunca é ponto de destaque solto');
  assert.equal((await rodar('mostrar_na_tela', { tela: 'balancete', competencia: '2026-13' })).r.piloto ?? null, null);
});

test('isolamento por escritório: empresa que a sessão não enxerga não vira passo', async () => {
  for (const [nome, args] of [
    ['mostrar_na_tela', { tela: 'balancete', cnpj: CNPJ_B }],
    ['preencher_na_tela', { formulario: 'lancamento', cnpj: CNPJ_B, data: '05/11/2026', valor: '10', conta_debito: '1.1.01', conta_credito: '4.1.01', historico: 'Venda' }],
    ['preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_B, conta_pai: '1.1', descricao: 'Nova conta' }],
  ] as const) {
    const { r } = await rodar(nome, args, { empresas: [CNPJ_A] });
    assert.equal(r.piloto ?? null, null, `${nome} ${args.cnpj}`);
  }
  // E a empresa certa passa.
  assert.ok(plano((await rodar('mostrar_na_tela', { tela: 'balancete', cnpj: CNPJ_B }, { empresas: [CNPJ_B] })).r));
});

const LANC = { formulario: 'lancamento', cnpj: CNPJ_A, data: '2026-11-05', valor: '1500,50', conta_debito: '1.1.01', conta_credito: '4.1.01', historico: 'Venda à vista' };

test('preencher lançamento: passos na ordem, valores exatamente como informados e termina em parar_no_botao no Gravar', async () => {
  const { r } = await rodar('preencher_na_tela', LANC);
  const p = plano(r);
  assert.deepEqual(p.passos.map((s) => s.tipo), ['selecionar', 'navegar', 'navegar', 'preencher', 'preencher', 'preencher', 'preencher', 'preencher', 'parar_no_botao']);
  const v = Object.fromEntries(p.passos.filter((s) => s.tipo === 'preencher').map((s) => [s.alvo, s.valor]));
  assert.deepEqual(v, {
    '[data-campo=lancamento-data]': '05/11/2026', '[data-campo=lancamento-valor]': '1500.50', '[data-campo=lancamento-debito-codigo]': '1.1.01',
    '[data-campo=lancamento-credito-codigo]': '4.1.01', '[data-campo=lancamento-historico]': 'Venda à vista',
  });
  assert.equal(p.passos[2].alvo, '#btn-novo-lancamento');
  assert.equal(p.passos[8].alvo, '[data-campo=lancamento-gravar]');
  assert.equal(p.passos.filter((s) => s.tipo === 'parar_no_botao').length, 1);
  assert.ok(p.passos.some((s) => s.legenda === 'Estou preenchendo a conta de débito: 1.1.01 — Caixa'));
  assert.ok(p.passos.some((s) => /R\$ 1\.500,50/.test(s.legenda)));
  assert.equal(validarPlanoPiloto(p).ok, true);
});

test('preencher lançamento: dado faltando ou errado vira pergunta, nunca chute', async () => {
  const caso = async (mud: Record<string, unknown>) => (await rodar('preencher_na_tela', { ...LANC, ...mud })).r.piloto ?? null;
  assert.equal(await caso({ valor: '0' }), null);
  assert.equal(await caso({ valor: '1.500,00' }), null, 'milhar ambíguo: pergunta, não adivinha');
  assert.equal(await caso({ valor: '-5' }), null);
  assert.equal(await caso({ valor: undefined }), null);
  assert.equal(await caso({ data: '31/02/2026' }), null);
  assert.equal(await caso({ data: undefined }), null);
  assert.equal(await caso({ historico: '' }), null);
  assert.equal(await caso({ conta_debito: '9.9.99' }), null, 'conta que não existe no plano da empresa');
  assert.equal(await caso({ conta_debito: '1.1' }), null, 'conta sintética não recebe lançamento');
  assert.equal(await caso({ conta_credito: '1.1.01' }), null, 'débito e crédito iguais');
  const fechada = await rodar('preencher_na_tela', LANC, { fechadas: ['2026-11'] });
  assert.equal(fechada.r.piloto ?? null, null, 'competência fechada');
});

test('preencher conta: grupo sintético existente, código sai sozinho e termina no Gravar', async () => {
  const { r } = await rodar('preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_A, conta_pai: '1.1', descricao: 'Aplicações CDB', tipo: 'analitica', natureza: 'D' });
  const p = plano(r);
  assert.deepEqual(p.passos.map((s) => s.alvo), ['[data-campo=empresa-ativa]', '#btn-menu-plano-contas', '#btn-nova-conta', '[data-campo=conta-pai]', '[data-campo=conta-codigo]', '[data-campo=conta-descricao]', '[data-campo=conta-tipo]', '[data-campo=conta-natureza]', '[data-campo=conta-gravar]']);
  assert.equal(p.passos[4].tipo, 'destacar', 'o código travado é só destacado, nunca digitado');
  assert.match(p.passos[4].legenda, /1\.1\.03/);
  assert.equal(p.passos[p.passos.length - 1].tipo, 'parar_no_botao');
  assert.equal((await rodar('preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_A, conta_pai: '1.1.01', descricao: 'X conta' })).r.piloto ?? null, null, 'pai analítico');
  assert.equal((await rodar('preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_A, conta_pai: '1.1', descricao: 'ab' })).r.piloto ?? null, null);
  assert.equal((await rodar('preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_A, conta_pai: '1.1', descricao: 'Conta nova', natureza: 'X' })).r.piloto ?? null, null);
});

test('preencher empresa: campos informados, regime validado e termina em Salvar Empresa', async () => {
  const { r } = await rodar('preencher_na_tela', { formulario: 'empresa', cnpj_empresa: '11.222.333/0001-81', razao_social: 'Mural Ltda', regime: 'lucro presumido', email: 'a@b.com' });
  const p = plano(r);
  assert.deepEqual(p.passos.map((s) => s.alvo), ['#btn-menu-empresa', '[data-campo=empresa-cnpj]', '[data-campo=empresa-razao-social]', '[data-campo=empresa-regime]', '[data-campo=empresa-email]', '[data-campo=empresa-salvar]']);
  assert.equal(p.passos[3].valor, 'Lucro Presumido');
  assert.equal(p.passos[p.passos.length - 1].tipo, 'parar_no_botao');
  assert.equal((await rodar('preencher_na_tela', { formulario: 'empresa', regime: 'Outro' })).r.piloto ?? null, null);
  assert.equal((await rodar('preencher_na_tela', { formulario: 'empresa' })).r.piloto ?? null, null);
  assert.equal((await rodar('preencher_na_tela', { formulario: 'outro' })).r.piloto ?? null, null);
});

test('nenhum plano montado pelo servidor tem passo que clique, nem alvo de credencial, nem nada depois do botão', async () => {
  const planos = [
    (await rodar('preencher_na_tela', LANC)).r, (await rodar('preencher_na_tela', { formulario: 'conta', cnpj: CNPJ_A, conta_pai: '1.1', descricao: 'Aplicações CDB' })).r,
    (await rodar('preencher_na_tela', { formulario: 'empresa', razao_social: 'Mural' })).r, (await rodar('mostrar_na_tela', { tela: 'livros', destaque: 'dre' })).r,
  ].map(plano);
  for (const p of planos) {
    assert.ok(p.passos.every((s) => ['navegar', 'selecionar', 'rolar', 'destacar', 'preencher', 'parar_no_botao'].includes(s.tipo)));
    assert.ok(!p.passos.some((s) => /senha|token|certificad|banc/i.test(s.alvo)));
    const i = p.passos.findIndex((s) => s.tipo === 'parar_no_botao');
    assert.ok(i === -1 || i === p.passos.length - 1);
    for (const s of p.passos.filter((x) => x.tipo === 'navegar')) assert.match(s.alvo, /^#(btn-menu-[a-z-]+|btn-novo-lancamento|btn-nova-conta)$/, 'navegar só abre menu ou formulário');
  }
});

test('comandos continuar/segundo plano/cancelar chegam ao front como { comando } e ficam no log', async () => {
  for (const [nome, cmd] of [['continuar_piloto', 'continuar'], ['piloto_segundo_plano', 'segundo_plano'], ['cancelar_piloto', 'cancelar']] as const) {
    const { r, eventos } = await rodar(nome, {});
    assert.deepEqual(r.piloto, { comando: cmd });
    assert.ok(eventos.some((e) => e.evento === 'piloto' && e.resumo.includes(cmd)));
  }
});

test('o roteiro não vai para o modelo (só o status) e o kit mantém nomes únicos', async () => {
  const vistos: any[] = [];
  const m = montar({}, []);
  let i = 0;
  const modelo: ModeloIA = async ({ conteudos }) => { vistos.push(JSON.stringify(conteudos)); return i++ === 0 ? { texto: '', chamadas: [{ nome: 'mostrar_na_tela', args: { tela: 'livros' } }], turnoModelo: { role: 'model', parts: [{ text: '' }] } } : { texto: 'ok', chamadas: [] }; };
  const r = await conversar(m.ctx, modelo, 'mostre os livros', []);
  assert.ok(plano(r));
  assert.doesNotMatch(vistos[1], /btn-menu-livros/);
  assert.match(vistos[1], /piloto_preparado/);
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  assert.equal(new Set(nomes).size, nomes.length);
  for (const n of ['mostrar_na_tela', 'preencher_na_tela', 'continuar_piloto', 'piloto_segundo_plano', 'cancelar_piloto']) assert.ok(nomes.includes(n), n);
  for (const arq of ['src/utils/pilotoVisivel.ts', 'src/data/mapaTelasContabil.ts', 'src/server/pilotoContabil.ts', 'src/server/conferidorPiloto.ts', 'src/components/PilotoVisivel.tsx']) assert.doesNotMatch(readFileSync(arq, 'utf8'), /alterdata/i, arq);
});

test('valor: só troca vírgula por ponto, sem arredondar nem calcular; data real e legenda sem ponto flutuante', () => {
  assert.deepEqual(valorParaTela('1500,5'), { ok: true, valor: '1500.5' });
  assert.deepEqual(valorParaTela(1500.5), { ok: true, valor: '1500.5' });
  assert.deepEqual(valorParaTela('0.01'), { ok: true, valor: '0.01' });
  assert.equal(valorParaTela('10.123').ok, false, 'três casas: recusa, não arredonda');
  assert.equal(valorParaTela('1e3').ok, false);
  assert.equal(valorParaTela('').ok, false);
  assert.equal(valorParaLegenda('1234567.5'), '1.234.567,50');
  assert.equal(valorParaLegenda('7'), '7,00');
  assert.equal(dataParaTela('2026-02-29'), null);
  assert.equal(dataParaTela('29/02/2028'), '29/02/2028');
});
