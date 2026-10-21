import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaDoMes, depreciacaoAcumulada, valorContabilLiquido, resultadoDaBaixa, validarBem, filialAtual, totalQuotasDoMes, type BemImobilizado } from '../../src/utils/imobilizado';
const bem = (o: Partial<BemImobilizado> = {}): BemImobilizado => ({ id: '1', descricao: 'Veículo', custoCentavos: 6000000, residualCentavos: 0, vidaUtilMeses: 60, inicioDepreciacao: '2026-01', depreciavel: true, ...o });

test('quota linear e início só no mês de uso', () => {
  assert.equal(quotaDoMes(bem(), '2025-12'), 0);
  assert.equal(quotaDoMes(bem(), '2026-01'), 100000);
  assert.equal(quotaDoMes(bem(), '2030-12'), 100000);
  assert.equal(quotaDoMes(bem(), '2031-01'), 0);
});
test('acumulada nunca passa do custo menos residual', () => {
  const b = bem({ custoCentavos: 1000001, residualCentavos: 1, vidaUtilMeses: 3 });
  assert.equal(depreciacaoAcumulada(b, '2030-12'), 1000000);
  assert.equal([0, 1, 2].map((k) => quotaDoMes(b, `2026-0${k + 1}`)).reduce((a, c) => a + c, 0), 1000000);
});
test('terreno não deprecia', () => assert.equal(quotaDoMes(bem({ depreciavel: false, vidaUtilMeses: 0 }), '2026-05'), 0));
test('valor contábil líquido', () => assert.equal(valorContabilLiquido(bem(), '2026-12'), 6000000 - 12 * 100000));
test('baixa por venda: ganho/perda', () => {
  const b = bem({ baixa: { competencia: '2027-01', valorVendaCentavos: 5000000, motivo: 'venda' } });
  assert.equal(quotaDoMes(b, '2027-01'), 0);
  assert.equal(resultadoDaBaixa(b), 5000000 - (6000000 - 12 * 100000));
});
test('baixa sem venda é perda total do VCL', () => assert.equal(resultadoDaBaixa(bem({ baixa: { competencia: '2027-01', valorVendaCentavos: 0, motivo: 'baixa' } })), -(6000000 - 1200000)));
test('validação', () => {
  assert.ok(validarBem(bem({ custoCentavos: 0 })).length);
  assert.ok(validarBem(bem({ residualCentavos: 6000000 })).length);
  assert.ok(validarBem(bem({ inicioDepreciacao: '2026-13' })).length);
  assert.ok(validarBem(bem({ baixa: { competencia: '2025-01', valorVendaCentavos: 0, motivo: 'baixa' } })).length);
  assert.equal(validarBem(bem()).length, 0);
});
test('transferência entre filiais', () => {
  const b = bem({ filial: 'Matriz', transferencias: [{ competencia: '2026-06', para: 'Filial 2' }] });
  assert.equal(filialAtual(b, '2026-05'), 'Matriz'); assert.equal(filialAtual(b, '2026-06'), 'Filial 2');
});
test('total do mês', () => assert.equal(totalQuotasDoMes([bem(), bem({ id: '2', depreciavel: false })], '2026-02').total, 100000));
