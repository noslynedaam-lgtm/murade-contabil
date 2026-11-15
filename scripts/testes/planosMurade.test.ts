import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSULTA_EXTRA, FAIXAS_PLANO, PONTO_EXTRA_MENSAL, reais, reaisInteiro } from '../../src/utils/planosMurade';

test('Tabela de planos: valores definidos pelo dono em 15/11/2026', () => {
  assert.deepEqual(FAIXAS_PLANO.map((f) => [f.de, f.ate, f.mensalidade, f.pontos]), [
    [10, 20, 350, 2], [21, 50, 550, 3], [51, 100, 700, 3], [101, 149, 850, 3], [150, 200, 1000, 3],
    [201, 300, 1350, 3], [301, 500, 1900, 3], [501, 1000, 3000, 3], [1001, null, 5000, 3],
  ]);
  assert.equal(PONTO_EXTRA_MENSAL, 100);
  assert.equal(CONSULTA_EXTRA, 1);
});

test('Tabela de planos: faixas seguidas, sem buraco nem sobreposição, e preço sempre sobe com o tamanho', () => {
  for (let i = 1; i < FAIXAS_PLANO.length; i++) {
    const anterior = FAIXAS_PLANO[i - 1];
    assert.notEqual(anterior.ate, null, 'só a última faixa pode ser sem limite');
    assert.equal(FAIXAS_PLANO[i].de, (anterior.ate as number) + 1);
    assert.ok(FAIXAS_PLANO[i].mensalidade > anterior.mensalidade);
  }
  assert.equal(FAIXAS_PLANO[FAIXAS_PLANO.length - 1].ate, null);
});

test('Tabela de planos: o preço por empresa cai conforme o escritório cresce (no topo de cada faixa)', () => {
  const porEmpresa = FAIXAS_PLANO.filter((f) => f.ate !== null).map((f) => f.mensalidade / (f.ate as number));
  for (let i = 1; i < porEmpresa.length; i++) assert.ok(porEmpresa[i] < porEmpresa[i - 1]);
});

test('Formato do dinheiro em reais', () => {
  assert.equal(reais(1), 'R$ 1,00');
  assert.equal(reais(100), 'R$ 100,00');
  assert.equal(reaisInteiro(1000), 'R$ 1.000');
  assert.equal(reaisInteiro(350), 'R$ 350');
  assert.equal(reaisInteiro(0.5), 'R$ 0,50');
});
