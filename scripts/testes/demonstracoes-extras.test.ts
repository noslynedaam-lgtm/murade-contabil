import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarDlpa, calcularProvisaoFolha, baseFolhaBruta, contasLucrosPrejuizos } from '../../src/utils/demonstracoesExtras';
const contas: any[] = [
  { codigo: '1.1', descricao: 'Caixa', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '2.3.1', descricao: 'Lucros Acumulados', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3.2', descricao: 'Dividendos a pagar', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '3', descricao: 'Receitas', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '3.1', descricao: 'Receita de serviços', nivel: 2, tipo: 'analitica', natureza: 'C' },
  { codigo: '4', descricao: 'Despesas', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '4.1', descricao: 'Despesa geral', nivel: 2, tipo: 'analitica', natureza: 'D' },
];
const L = (id: string, data: string, d: string, c: string, valor: number, extra: any = {}) => ({ id, data, contaDebitoCodigo: d, contaDebitoNome: '', contaCreditoCodigo: c, contaCreditoNome: '', valor, historico: 'h', origem: 'Cadastro', ...extra });
test('contas de lucros', () => assert.deepEqual(contasLucrosPrejuizos(contas).map((c) => c.codigo), ['2.3.1']));
test('DLPA: saldo inicial, resultado, dividendos e saldo final', () => {
  const lancs: any[] = [
    L('1', '2025-12-31', '1.1', '2.3.1', 1000),            // saldo anterior (lucros 1000)
    L('2', '2026-03-10', '1.1', '3.1', 5000), L('3', '2026-04-10', '4.1', '1.1', 2000),   // resultado 3000
    L('4', '2026-06-30', '2.3.1', '2.3.2', 800),           // dividendos
  ];
  const d = gerarDlpa(contas, lancs, 2026);
  assert.equal(d.saldoInicial, 100000); assert.equal(d.resultadoExercicio, 300000); assert.equal(d.totalOutros, -80000); assert.equal(d.saldoFinal, 320000); assert.equal(d.avisoEncerramento, false);
});
test('provisão sobre folha', () => {
  const p = calcularProvisaoFolha(1200000, 0);
  assert.deepEqual([p.ferias, p.tercoFerias, p.decimoTerceiro, p.total], [100000, 33333, 100000, 233333]);
  assert.equal(calcularProvisaoFolha(1200000, 8).encargos, Math.round(133333 * 0.08) + 8000);
});
test('base da folha só DP — Folha definitivo do mês', () => {
  const ls: any[] = [L('a', '2026-10-05', '4.1', '1.1', 100, { origem: 'DP — Folha' }), L('b', '2026-10-05', '4.1', '1.1', 50, { origem: 'DP — FGTS' }), L('c', '2026-09-05', '4.1', '1.1', 70, { origem: 'DP — Folha' }), L('d', '2026-10-06', '4.1', '1.1', 30, { origem: 'DP — Folha', statusManual: 'pendente_aprovacao' })];
  assert.equal(baseFolhaBruta(ls, '2026-10'), 10000);
});
