// Nota do backup do sistema anterior (vinda do Fiscal) não gera pré-lançamento em competência que já tem a contabilidade migrada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { notasSemLancamentoEmDobro } from '../../src/server/prepararRascunhosContabeis';

const ws = { lancamentos: [{ id: 'l1', origem: 'Sistema anterior', competencia: '2025-03', data: '2025-03-10' }, { id: 'l2', origem: 'Manual', competencia: '2025-05' }] };
const nota = (id: string, data: string, origemDocumento?: string) => ({ id, dataEmissao: data, ...(origemDocumento ? { origemDocumento } : {}) });

test('competência com lançamentos migrados: nota do sistema anterior fica só para conferência', () => {
  const r = notasSemLancamentoEmDobro([nota('a', '2025-03-15', 'sistema-anterior'), nota('b', '15/03/2025', 'sistema-anterior'), nota('c', '2025-03-20')], ws);
  assert.deepEqual(r.map((x) => x.id), ['c']);
});
test('competência sem contabilidade migrada: segue o fluxo normal (pré-lançamento)', () => {
  const r = notasSemLancamentoEmDobro([nota('a', '2025-04-01', 'sistema-anterior'), nota('b', '2025-05-02', 'sistema-anterior')], ws);
  assert.deepEqual(r.map((x) => x.id), ['a', 'b']);
});
test('sem nenhuma migração contábil: nada muda', () => {
  const docs = [nota('a', '2025-03-15', 'sistema-anterior')];
  assert.equal(notasSemLancamentoEmDobro(docs, { lancamentos: [] }), docs);
});
