import test from 'node:test';
import assert from 'node:assert/strict';
import { haQuanto, textoOrigem } from '../../src/utils/integracaoTexto';

const agora = new Date('2026-11-22T12:00:00Z');
test('integração: há quanto tempo', () => {
  assert.equal(haQuanto('2026-11-22T11:55:00Z', agora), 'há 5 min');
  assert.equal(haQuanto('2026-11-22T11:59:40Z', agora), 'agora há pouco');
  assert.equal(haQuanto('2026-11-22T09:00:00Z', agora), 'há 3 h');
  assert.equal(haQuanto('2026-11-20T12:00:00Z', agora), 'há 2 dias');
  assert.equal(haQuanto(null, agora), '');
});
test('integração: texto lido do estado real', () => {
  assert.deepEqual(textoOrigem('Murad Fiscal', { disponivel: true, ultimoRecebimento: '2026-11-22T11:55:00Z', documentosRecebidos: 10 }, agora), { texto: 'Murad Fiscal: conectado — última atualização há 5 min', ok: true });
  assert.equal(textoOrigem('Murad DP', { disponivel: true, ultimoRecebimento: null, folhasRecebidas: 0 }, agora).texto, 'Murad DP: ligado — aguardando o primeiro envio');
  assert.equal(textoOrigem('Murad DP', { disponivel: false }, agora).ok, false);
  assert.equal(textoOrigem('Murad DP', null, agora).ok, false);
});

test('fechamento: títulos vencidos sem baixa nem provisão conferidos sozinhos; manual continua opção', async () => {
  const { conferirFechamento, titulosPendentesNoFechamento } = await import('../../src/utils/fechamentoContabil');
  const titulos = [
    { id: 'a', tipo: 'pagar' as const, numero: '1', participanteNome: 'Fornecedor', vencimento: '2026-10-20', valorCentavos: 1000, baixas: [], provisoes: [] },
    { id: 'b', tipo: 'receber' as const, numero: '2', vencimento: '2026-10-21', valorCentavos: 500, baixas: [{ valorCentavos: 500 }], provisoes: [] },
    { id: 'c', tipo: 'pagar' as const, numero: '3', vencimento: '2026-10-22', valorCentavos: 700, baixas: [], provisoes: [{}] },
    { id: 'd', tipo: 'pagar' as const, numero: '4', vencimento: '2026-11-05', valorCentavos: 700, baixas: [], provisoes: [] },
  ];
  assert.deepEqual(titulosPendentesNoFechamento(titulos, '2026-10').map((t) => t.id), ['a']);
  const base = { competencia: '2026-10', contas: [], lancamentos: [], preLancamentos: [], bens: [] };
  const r1 = conferirFechamento({ ...base, confirmacoes: {}, titulos });
  const auto = r1.itens.find((i) => i.id === 'titulos')!;
  assert.equal(auto.ok, false); assert.equal(auto.bloqueia, true);
  assert.equal(r1.itens.find((i) => i.id === 'pagar_receber')!.bloqueia, false);
  const r2 = conferirFechamento({ ...base, confirmacoes: { pagar_receber: true }, titulos });
  assert.equal(r2.itens.find((i) => i.id === 'titulos')!.ok, true);
  const r3 = conferirFechamento({ ...base, confirmacoes: {} });
  assert.equal(r3.itens.some((i) => i.id === 'titulos'), false);
  assert.equal(r3.itens.find((i) => i.id === 'pagar_receber')!.bloqueia, true);
});
