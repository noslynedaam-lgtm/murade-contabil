import test from 'node:test';
import assert from 'node:assert/strict';
import { compararPeriodos, explicarVariacoes, resultadoDoPeriodo, resultadoPorCentroCusto, variacaoPercentual, mesAnterior, mesmoMesAnoAnterior } from '../../src/utils/analiseContabil';
import { conferirFechamento } from '../../src/utils/fechamentoContabil';
const contas: any[] = [
  { codigo: '1', descricao: 'Ativo', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1', descricao: 'Caixa', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '3', descricao: 'Receitas', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '3.1', descricao: 'Receita de serviços', nivel: 2, tipo: 'analitica', natureza: 'C' },
  { codigo: '4', descricao: 'Despesas', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '4.1', descricao: 'Energia elétrica', nivel: 2, tipo: 'analitica', natureza: 'D' },
];
const L = (id: string, data: string, d: string, c: string, valor: number, extra: any = {}) => ({ id, data, contaDebitoCodigo: d, contaDebitoNome: '', contaCreditoCodigo: c, contaCreditoNome: '', valor, historico: 'x', origem: 'Cadastro', ...extra });
const lancs: any[] = [
  L('1', '2026-09-10', '1.1', '3.1', 10000), L('2', '2026-09-12', '4.1', '1.1', 500),
  L('3', '2026-10-10', '1.1', '3.1', 12000), L('4', '2026-10-12', '4.1', '1.1', 600),
  L('5', '2025-10-10', '1.1', '3.1', 8000),
];
test('resultado do mês', () => { const r = resultadoDoPeriodo(contas, lancs, '2026-10'); assert.equal(r.receitas, 1200000); assert.equal(r.despesas, 60000); assert.equal(r.resultado, 1140000); });
test('períodos auxiliares', () => { assert.equal(mesAnterior('2026-01'), '2025-12'); assert.equal(mesmoMesAnoAnterior('2026-10'), '2025-10'); });
test('variação percentual', () => { assert.equal(variacaoPercentual(120, 100), 20); assert.equal(variacaoPercentual(5, 0), null); assert.equal(variacaoPercentual(80, 100), -20); });
test('comparativo 3 colunas e explicação', () => {
  const c = compararPeriodos(contas, lancs, '2026-10');
  const en = c.linhas.find((l) => l.codigo === '4.1')!;
  assert.deepEqual([en.atual, en.mesAnterior, en.anoAnterior, en.varMes, en.varAno], [60000, 50000, 0, 20, null]);
  const txt = explicarVariacoes(c, 10, 5000);
  assert.ok(txt.some((t) => t.includes('Energia elétrica') && t.includes('aumentou 20%')));
  assert.equal(explicarVariacoes(c, 50, 5000).filter((t) => t.includes('Energia')).length, 0);
});
test('centro de custo', () => {
  const l2: any[] = [L('a', '2026-10-01', '1.1', '3.1', 1000, { centroCustoCodigo: 'LOJA1' }), L('b', '2026-10-02', '4.1', '1.1', 300, { centroCustoCodigo: 'LOJA1' }), L('c', '2026-10-03', '4.1', '1.1', 200)];
  const r = resultadoPorCentroCusto(contas, l2, [{ id: '1', codigo: 'LOJA1', nome: 'Loja 1' }], '2026-10');
  const loja = r.find((x) => x.centro === 'LOJA1')!, sem = r.find((x) => x.centro === '')!;
  assert.deepEqual([loja.receitas, loja.despesas, loja.resultado], [100000, 30000, 70000]);
  assert.deepEqual([sem.nome, sem.despesas], ['Sem centro de custo', 20000]);
});
test('fechamento bloqueia sem confirmações e libera com tudo', () => {
  const base = { competencia: '2026-10', contas, lancamentos: lancs, preLancamentos: [], bens: [] as any[], confirmacoes: {} };
  const a = conferirFechamento(base);
  assert.equal(a.podeFechar, false);
  assert.equal(a.itens.find((i) => i.id === 'partidas')!.ok, true);
  const b = conferirFechamento({ ...base, confirmacoes: { banco: true, pagar_receber: true, folha: true, impostos: true } });
  assert.equal(b.podeFechar, true);
});
test('fechamento bloqueia por pendência de aprovação e depreciação não lançada', () => {
  const ok = { banco: true, pagar_receber: true, folha: true, impostos: true };
  const pend = conferirFechamento({ competencia: '2026-10', contas, lancamentos: [...lancs, L('p', '2026-10-20', '4.1', '1.1', 10, { statusManual: 'pendente_aprovacao' })], preLancamentos: [], bens: [], confirmacoes: ok });
  assert.equal(pend.podeFechar, false);
  const bem: any = { id: 'b', descricao: 'Máq', custoCentavos: 120000, residualCentavos: 0, vidaUtilMeses: 12, inicioDepreciacao: '2026-01', depreciavel: true };
  const dep = conferirFechamento({ competencia: '2026-10', contas, lancamentos: lancs, preLancamentos: [], bens: [bem], confirmacoes: ok });
  assert.equal(dep.itens.find((i) => i.id === 'depreciacao')!.ok, false); assert.equal(dep.podeFechar, false);
  const dep2 = conferirFechamento({ competencia: '2026-10', contas, lancamentos: [...lancs, L('d', '2026-10-31', '4.1', '1.1', 1000, { documentoRef: 'DEPREC:2026-10' })], preLancamentos: [], bens: [bem], confirmacoes: ok });
  assert.equal(dep2.itens.find((i) => i.id === 'depreciacao')!.ok, true);
});
