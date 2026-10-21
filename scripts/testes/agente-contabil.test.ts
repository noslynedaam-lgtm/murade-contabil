import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';

const CNPJ = '12345678000190';
const pre = (ref: string, valor: number, competencia = '2026-09') => ({ referenciaOrigem: ref, status: 'pendente_conferencia', geradoAutomaticamente: true, competencia, origem: 'DP — Folha', valor, historico: 'Folha' });

function montar(api: ChamarApi, falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>) {
  const chamadasApi: Array<[string, string, unknown]> = [];
  let i = 0;
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = {
    sessaoHash: 's1', login: 'ana', hoje: '2026-10-21',
    chamarApi: async (m, c, b) => { chamadasApi.push([m, c, b]); return api(m, c, b); },
    registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil,
  };
  return { ctx, modelo, chamadasApi };
}

const workspace = { status: 200, corpo: { dados: { preLancamentos: [pre(`DP:${CNPJ}:2026-09:1`, 1000), pre(`DP:${CNPJ}:2026-09:2`, 250.5), pre(`DP:${CNPJ}:2026-08:3`, 9, '2026-08')], lancamentos: [] } } };

test('contabilizar vira cartão; nada é gravado antes de confirmar; só a competência pedida', async () => {
  const api: ChamarApi = async (m, c) => (m === 'GET' && c.startsWith('/api/workspaces/') ? workspace : { status: 200, corpo: { sucesso: true } });
  const { ctx, modelo, chamadasApi } = montar(api, [{ chamadas: [{ nome: 'contabilizar_prelancamentos', args: { cnpj: CNPJ, competencia: '2026-09' } }] }, { texto: 'Pronto para confirmar.' }]);
  const r = await conversar(ctx, modelo, 'contabilize setembro', []);
  assert.equal(r.acoes.length, 1);
  assert.match(r.acoes[0].titulo, /2 pré-lançamento/);
  assert.equal(chamadasApi.some(([m]) => m === 'POST'), false);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, true);
  const post = chamadasApi.find(([m]) => m === 'POST')!;
  assert.deepEqual((post[2] as any).referencias, [`DP:${CNPJ}:2026-09:1`, `DP:${CNPJ}:2026-09:2`]);
});
test('competência já fechada e competência sem pendência são recusadas na proposta', async () => {
  const api: ChamarApi = async (m, c) => (c.endsWith('/fechamentos') ? { status: 200, corpo: { fechamentos: [{ competencia: '2026-09' }] } } : workspace);
  const { ctx, modelo } = montar(api, [{ chamadas: [{ nome: 'fechar_competencia', args: { cnpj: CNPJ, competencia: '2026-09' } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(ctx, modelo, 'feche setembro', [])).acoes.length, 0);
  const b = montar(api, [{ chamadas: [{ nome: 'contabilizar_prelancamentos', args: { cnpj: CNPJ, competencia: '2026-07' } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(b.ctx, b.modelo, 'x', [])).acoes.length, 0);
});
test('fechamento é irreversível e usa a rota existente; erro do servidor aparece com as palavras dele', async () => {
  const api: ChamarApi = async (m, c) => (m === 'POST' ? { status: 409, corpo: { motivo: 'Fechamento bloqueado: 2 pré-lançamento(s) aguardam conferência.' } } : { status: 200, corpo: { fechamentos: [] } });
  const { ctx, modelo } = montar(api, [{ chamadas: [{ nome: 'fechar_competencia', args: { cnpj: CNPJ, competencia: '2026-09' } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'feche', []);
  assert.equal(r.acoes[0].irreversivel, true);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, false);
  assert.match(c.mensagem, /Fechamento bloqueado/);
});
test('CNPJ ou competência inválidos não geram ação', async () => {
  const api: ChamarApi = async () => ({ status: 200, corpo: {} });
  const { ctx, modelo } = montar(api, [{ chamadas: [{ nome: 'fechar_competencia', args: { cnpj: '123', competencia: '2026-13' } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(ctx, modelo, 'x', [])).acoes.length, 0);
});
test('todas as ferramentas têm nome único e as de outros sistemas estão no kit', () => {
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  assert.equal(new Set(nomes).size, nomes.length);
  for (const n of ['perguntar_a_outro_sistema', 'pedir_a_outro_sistema', 'ver_pedidos_entre_sistemas', 'responder_pedido_de_outro_sistema']) assert.ok(nomes.includes(n), n);
});
