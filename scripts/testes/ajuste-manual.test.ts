import test from 'node:test';
import assert from 'node:assert/strict';
import { paraCentavos, centavosParaTexto, valorEfetivoCentavos, liquidoLancado, montarComplemento, contarAjustes } from '../../src/utils/ajusteManual';
import { quotaDoMes, quotaAutomatica, depreciacaoAcumulada, definirAjusteQuota, removerAjusteQuota, validarBem, totalQuotasDoMes, type BemImobilizado } from '../../src/utils/imobilizado';
import type { LancamentoContabil } from '../../src/types';

const bem = (o: Partial<BemImobilizado> = {}): BemImobilizado => ({ id: '1', descricao: 'Veículo', custoCentavos: 6000000, residualCentavos: 0, vidaUtilMeses: 60, inicioDepreciacao: '2026-01', depreciavel: true, ...o });

test('paraCentavos é exato e aceita formatos brasileiros', () => {
  assert.equal(paraCentavos('1.234,56'), 123456);
  assert.equal(paraCentavos('1234,5'), 123450);
  assert.equal(paraCentavos('1234.56'), 123456);
  assert.equal(paraCentavos('0,29'), 29);
  assert.equal(paraCentavos('19,99'), 1999);
  assert.equal(paraCentavos('R$ 10,00'), 1000);
  assert.equal(paraCentavos('abc'), null);
  assert.equal(paraCentavos('1,234'), null);
  assert.equal(paraCentavos(''), null);
  assert.equal(centavosParaTexto(123456), '1234,56');
  assert.equal(centavosParaTexto(-5), '-0,05');
});
test('valor efetivo: ajuste vence, inválido cai no automático', () => {
  assert.equal(valorEfetivoCentavos(1000, undefined), 1000);
  assert.equal(valorEfetivoCentavos(1000, '20,00'), 2000);
  assert.equal(valorEfetivoCentavos(1000, 'x'), 1000);
  assert.equal(contarAjustes({ a: '1,00', b: 'x' }), 1);
});
test('sem ajuste, a depreciação é idêntica à automática', () => {
  const b = bem({ custoCentavos: 1000001, residualCentavos: 1, vidaUtilMeses: 3 });
  assert.equal(quotaDoMes(b, '2026-02'), quotaAutomatica(b, '2026-02'));
  assert.equal(depreciacaoAcumulada(b, '2030-12'), 1000000);
});
test('ajuste manual vale no mês e a última quota fecha o resto', () => {
  const b0 = bem({ custoCentavos: 1200000, vidaUtilMeses: 12 }); // 100000/mês
  const r = definirAjusteQuota(b0, '2026-03', 150000);
  assert.ok(r.bem && !r.erro);
  const b = r.bem!;
  assert.equal(quotaDoMes(b, '2026-02'), 100000);
  assert.equal(quotaDoMes(b, '2026-03'), 150000);
  assert.equal(quotaDoMes(b, '2026-04'), 100000);
  assert.equal(quotaDoMes(b, '2026-12'), 50000); // fecha: 1.200.000 − 11 × ... com o ajuste
  assert.equal(depreciacaoAcumulada(b, '2026-12'), 1200000);
  assert.equal(depreciacaoAcumulada(b, '2030-12'), 1200000);
  assert.equal(quotaDoMes(b, '2027-01'), 0);
  assert.equal(totalQuotasDoMes([b], '2026-03').total, 150000);
});
test('ajuste não pode passar do valor depreciável nem sair da vida útil', () => {
  const b = bem({ custoCentavos: 1200000, vidaUtilMeses: 12 });
  assert.ok(definirAjusteQuota(b, '2026-01', 1200001).erro);
  assert.ok(definirAjusteQuota(b, '2025-12', 1).erro);
  assert.ok(definirAjusteQuota(b, '2027-01', 1).erro);
  assert.ok(definirAjusteQuota(bem({ depreciavel: false, vidaUtilMeses: 0 }), '2026-01', 1).erro);
  assert.ok(definirAjusteQuota(b, '2026-01', -1).erro);
  assert.ok(!definirAjusteQuota(b, '2026-01', 1200000).erro);
});
test('voltar ao automático remove só o ajuste do mês', () => {
  let b = definirAjusteQuota(bem({ vidaUtilMeses: 12, custoCentavos: 1200000 }), '2026-03', 1)!.bem!;
  b = definirAjusteQuota(b, '2026-04', 2)!.bem!;
  const sem = removerAjusteQuota(b, '2026-03');
  assert.equal(quotaDoMes(sem, '2026-03'), 100000);
  assert.equal(quotaDoMes(sem, '2026-04'), 2);
  const nenhum = removerAjusteQuota(sem, '2026-04');
  assert.equal(nenhum.ajustesQuota, undefined);
  assert.equal(removerAjusteQuota(nenhum, '2026-04'), nenhum);
});
test('baixa continua parando a depreciação com ajustes', () => {
  const b = definirAjusteQuota(bem({ vidaUtilMeses: 12, custoCentavos: 1200000, baixa: { competencia: '2026-06', valorVendaCentavos: 0, motivo: 'baixa' } }), '2026-02', 300000)!.bem!;
  assert.equal(quotaDoMes(b, '2026-06'), 0);
  assert.equal(depreciacaoAcumulada(b, '2026-12'), 100000 + 300000 + 300000);
});
test('validação rejeita ajuste malformado', () => {
  assert.ok(validarBem(bem({ ajustesQuota: { '2026-13': 1 } })).length);
  assert.ok(validarBem(bem({ ajustesQuota: { '2026-01': -1 } })).length);
  assert.equal(validarBem(bem({ ajustesQuota: { '2026-01': 10 } })).length, 0);
});
test('complemento de lançamento: soma e inverte sem apagar nada', () => {
  const base: LancamentoContabil = { id: 'DEPREC-2026-03', data: '2026-03-28', contaDebitoCodigo: '3.1', contaDebitoNome: 'Desp', contaCreditoCodigo: '1.2', contaCreditoNome: 'Acum', valor: 1000, historico: 'x', origem: 'Manual', documentoRef: 'DEPREC:2026-03', competencia: '2026-03', statusManual: 'aprovado' };
  assert.equal(liquidoLancado([base], 'DEPREC:2026-03').centavos, 100000);
  const mais = montarComplemento(base, 'DEPREC:2026-03', 5000, 1, '2026-03', 'Depreciação')!;
  assert.equal(mais.contaDebitoCodigo, '3.1'); assert.equal(mais.valor, 50); assert.equal(mais.statusManual, 'pendente_aprovacao'); assert.equal(mais.documentoRef, 'DEPREC:2026-03:AJ:1');
  assert.equal(liquidoLancado([base, mais], 'DEPREC:2026-03').centavos, 105000);
  const menos = montarComplemento(base, 'DEPREC:2026-03', -2500, 2, '2026-03', 'Depreciação')!;
  assert.equal(menos.contaDebitoCodigo, '1.2'); assert.equal(menos.valor, 25);
  assert.equal(liquidoLancado([base, mais, menos], 'DEPREC:2026-03').centavos, 102500);
  assert.equal(liquidoLancado([base, { ...mais, statusManual: 'rejeitado' }], 'DEPREC:2026-03').centavos, 100000);
  assert.equal(montarComplemento(base, 'DEPREC:2026-03', 0, 1, '2026-03', 'x'), null);
  assert.equal(liquidoLancado([], 'DEPREC:2026-03').base, undefined);
});
