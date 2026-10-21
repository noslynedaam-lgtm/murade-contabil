import test from 'node:test';
import assert from 'node:assert/strict';
import { competenciaAnterior, conferirWorkspace, rodarConferidorContabil, achadosDoConferidor, limparAchadosParaTeste } from '../../src/server/conferidorContabil';
const contas = [
  { codigo: '1.1', descricao: 'Caixa', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '3.1', descricao: 'Receita de serviços', nivel: 2, tipo: 'analitica', natureza: 'C' },
];
const lanc = (extra: any = {}) => ({ id: 'a', data: '2026-09-10', contaDebitoCodigo: '1.1', contaDebitoNome: '', contaCreditoCodigo: '3.1', contaCreditoNome: '', valor: 100, historico: 'h', origem: 'Cadastro', ...extra });
test('competência anterior', () => { assert.equal(competenciaAnterior(new Date(2026, 9, 21)), '2026-09'); assert.equal(competenciaAnterior(new Date(2026, 0, 5)), '2025-12'); });
test('sem movimento: nada a conferir', () => assert.equal(conferirWorkspace('1', { contas, lancamentos: [] }, '2026-09'), null));
test('aponta aprovação e rascunhos por origem (DP e Fiscal)', () => {
  const a = conferirWorkspace('11222333000181', { contas, lancamentos: [lanc(), lanc({ id: 'b', statusManual: 'pendente_aprovacao', origem: 'Manual' })],
    preLancamentos: [{ status: 'pendente_conferencia', competencia: '2026-09', origem: 'DP — Folha' }, { status: 'pendente_conferencia', competencia: '2026-09', origem: 'Fiscal — Entrada' }, { status: 'contabilizado', competencia: '2026-09', origem: 'DP — FGTS' }] }, '2026-09')!;
  assert.equal(a.lancamentosAguardandoAprovacao, 1);
  assert.deepEqual(a.preLancamentosPendentesPorOrigem, { 'DP — Folha': 1, 'Fiscal — Entrada': 1 });
  assert.ok(a.pendencias.some((p) => p.id === 'aprovacao')); assert.ok(a.pendencias.some((p) => p.id === 'prelancamentos'));
  assert.ok(!a.pendencias.some((p) => p.id === 'banco'));
});
test('robô percorre workspaces, ignora fechadas e limpa sumidas', async () => {
  limparAchadosParaTeste();
  const ws = [{ cnpj: 'AAA', payload: { contas, lancamentos: [lanc()] } }, { cnpj: 'BBB', payload: { contas, lancamentos: [lanc()] } }];
  const consultar = async (sql: string) => /period_closures/.test(sql) ? { rows: [{ cnpj: 'BBB', competencia: '2026-09' }] } : { rows: ws };
  const r = await rodarConferidorContabil(consultar as any, new Date(2026, 9, 21));
  assert.equal(r.empresas, 1); assert.deepEqual(achadosDoConferidor().map((a) => a.cnpj), ['AAA']); assert.deepEqual(achadosDoConferidor(['ZZZ']), []);
});
