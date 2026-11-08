import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, conversar, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { REGRAS_DE_ENTENDIMENTO } from '../../src/server/agenteEntendimento';

// O motor da Agente do Contábil anexa as regras de entendimento, a nota do "sim" curto e o nome da pessoa.
function capturar(nomeUsuario?: string) {
  const vistos: Array<{ instrucao: string; ultima: string }> = [];
  const modelo: ModeloIA = async ({ instrucao, conteudos }) => {
    vistos.push({ instrucao, ultima: String(conteudos[conteudos.length - 1]?.parts?.[0]?.text || '') });
    return { texto: 'ok', chamadas: [], turnoModelo: { role: 'model', parts: [{ text: 'ok' }] } };
  };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'ana', hoje: '2026-11-08', chamarApi: async () => ({ status: 200, corpo: {} }), registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil, nomeUsuario };
  return { vistos, modelo, ctx };
}

test('motor: regras de entendimento sempre na instrução; nome só quando existe', async () => {
  const a = capturar('Herbert');
  await conversar(a.ctx, a.modelo, 'qual o saldo do caixa?', []);
  assert.ok(a.vistos[0].instrucao.includes(REGRAS_DE_ENTENDIMENTO));
  assert.ok(a.vistos[0].instrucao.includes('se chama Herbert. Trate-a pelo nome'));
  const b = capturar();
  await conversar(b.ctx, b.modelo, 'qual o saldo do caixa?', []);
  assert.ok(b.vistos[0].instrucao.includes(REGRAS_DE_ENTENDIMENTO));
  assert.ok(!b.vistos[0].instrucao.includes('Trate-a pelo nome'));
});

test('motor: "sim" curto vem com a nota da última oferta da Agente', async () => {
  const a = capturar();
  await conversar(a.ctx, a.modelo, 'sim', [{ papel: 'ia', texto: 'Encontrei 3 pré-lançamentos de setembro. Quer que eu contabilize?' }]);
  assert.ok(a.vistos[0].ultima.includes('[Contexto da conversa'));
  assert.ok(a.vistos[0].ultima.trimEnd().endsWith('sim'));
  const b = capturar();
  await conversar(b.ctx, b.modelo, 'qual o saldo do caixa?', [{ papel: 'ia', texto: 'Quer que eu contabilize?' }]);
  assert.ok(!b.vistos[0].ultima.includes('[Contexto da conversa'));
});
