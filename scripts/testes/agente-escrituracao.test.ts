// Ferramentas de voz da Agente para a escrituração avançada: todas viram cartão, nada é gravado antes do sim,
// e as que removem pedem duas confirmações.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, avancarAcao, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';

const CNPJ = '11222333000181';
function montar(api: ChamarApi, falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>) {
  const chamadas: Array<[string, string, unknown]> = []; let i = 0;
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'ana', hoje: '2026-11-20', chamarApi: async (m, c, b) => { chamadas.push([m, c, b]); return api(m, c, b); }, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadas };
}
const okApi: ChamarApi = async (m, c) => {
  if (m === 'GET' && c === `/api/workspaces/${CNPJ}`) return { status: 200, corpo: { dados: { historicosPadrao: [{ id: 'h1', codigo: 'ALUG', texto: 'Aluguel' }], lancamentosPadrao: [{ id: 'p1', nome: 'Aluguel da loja', ativo: true, dia: 10, forma: 'Nx1', contaUnica: '1.1.02', partidas: [{ conta: '4.1.01', valorCentavos: 250000 }], inicio: '2026-01' }], regrasConciliacao: [] } } };
  if (m === 'GET' && c.startsWith(`/api/workspaces/${CNPJ}/encerramento`)) return { status: 200, corpo: { sucesso: true, ano: 2026, contaDestino: '2.1.02', previa: { resultadoCentavos: 830045, partidas: [{ codigo: '3.1.01' }, { codigo: '4.1.01' }] }, gravados: { ativos: [], pendentes: [], estornados: 0 } } };
  return { status: 200, corpo: { sucesso: true, mensagem: 'ok' } };
};

test('as ferramentas novas existem no kit', () => {
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ['lancar_varias_partidas', 'listar_padroes_da_empresa', 'cadastrar_historico_padrao', 'remover_historico_padrao', 'cadastrar_lancamento_padrao', 'ligar_desligar_lancamento_padrao', 'remover_lancamento_padrao', 'preparar_lancamentos_padrao', 'consultar_encerramento', 'preparar_encerramento', 'estornar_encerramento', 'consultar_livro_caixa', 'emitir_livro_caixa', 'consultar_conciliacao_bancaria', 'aceitar_sugestoes_conciliacao', 'criar_regra_conciliacao', 'remover_regra_conciliacao', 'achados_escrituracao']) assert.ok(nomes.includes(n), n);
});
test('várias partidas por voz: total que não fecha é recusado; o que fecha vira cartão e só grava depois do sim', async () => {
  const errado = montar(okApi, [{ chamadas: [{ nome: 'lancar_varias_partidas', args: { cnpj: CNPJ, data: '15/03/2026', historico: 'x', forma: '1xN', conta_unica: '1.1.03', total: '10.000,00', partidas: [{ conta: '1.1.02', valor: '6.000,00' }, { conta: '3.1.01', valor: '3.999,99' }] } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(errado.ctx, errado.modelo, 'lança', [])).acoes.length, 0);
  const { ctx, modelo, chamadas } = montar(okApi, [{ chamadas: [{ nome: 'lancar_varias_partidas', args: { cnpj: CNPJ, data: '15/03/2026', historico: 'Recebimento', forma: '1xN', conta_unica: '1.1.03', total: '10.000,00', partidas: [{ conta: '1.1.02', valor: '6.000,00' }, { conta: '3.1.01', valor: '4.000,00' }] } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'lança', []);
  assert.equal(r.acoes.length, 1); assert.equal(chamadas.some(([m]) => m === 'POST'), false);
  assert.equal((await confirmarAcao(ctx, r.acoes[0].id)).sucesso, true);
  const post = chamadas.find(([m]) => m === 'POST')!;
  assert.equal(post[1], `/api/workspaces/${CNPJ}/lancamentos-compostos`);
});
test('preparar encerramento por voz: cartão com o resultado; remover lançamento padrão pede duas confirmações', async () => {
  const a = montar(okApi, [{ chamadas: [{ nome: 'preparar_encerramento', args: { cnpj: CNPJ, ano: 2026 } }] }, { texto: 'ok' }]);
  const r = await conversar(a.ctx, a.modelo, 'encerra 2026', []);
  assert.equal(r.acoes.length, 1); assert.match(r.acoes[0].descricao.join(' '), /Lucro de R\$\s?8\.300,45/);
  const b = montar(okApi, [{ chamadas: [{ nome: 'remover_lancamento_padrao', args: { cnpj: CNPJ, nome: 'aluguel' } }] }, { texto: 'ok' }]);
  const r2 = await conversar(b.ctx, b.modelo, 'tira o aluguel', []);
  assert.equal(r2.acoes[0].duasEtapas, true);
  assert.equal((await confirmarAcao(b.ctx, r2.acoes[0].id)).sucesso, false, 'sem o Continuar não remove');
  assert.equal((await avancarAcao(b.ctx, r2.acoes[0].id)).sucesso, true);
  assert.equal((await confirmarAcao(b.ctx, r2.acoes[0].id)).sucesso, true);
  assert.ok(b.chamadas.some(([m, c]) => m === 'DELETE' && c === `/api/workspaces/${CNPJ}/lancamentos-padrao/p1`));
});
