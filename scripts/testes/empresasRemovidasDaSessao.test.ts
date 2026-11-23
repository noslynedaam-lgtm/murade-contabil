import test from 'node:test';
import assert from 'node:assert/strict';
import { limparEmpresasRemovidasDoNavegador, mesmosCnpjs } from '../../src/utils/empresasRemovidasDaSessao';

function memoria(inicial: Record<string, string>) {
  const m = new Map(Object.entries(inicial));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

test('mesmosCnpjs ignora máscara e ordem', () => {
  assert.equal(mesmosCnpjs(['15.267.243/0001-68', '11497078000180'], ['11497078000180', '15267243000168']), true);
  assert.equal(mesmosCnpjs(['15267243000168', '33062651000165'], ['15267243000168']), false);
});

test('empresa excluída sai da cópia local; as autorizadas ficam', () => {
  const s = memoria({
    murad_empresas_lista: JSON.stringify([{ cnpj: '15.267.243/0001-68', razaoSocial: 'MURAD' }, { cnpj: '33062651000165', razaoSocial: 'IMPACTO' }, { cnpj: '44167640000166', razaoSocial: 'ACAI' }]),
    murad_empresa_salva: JSON.stringify({ cnpj: '33062651000165', razaoSocial: 'IMPACTO' }),
  });
  const n = limparEmpresasRemovidasDoNavegador(['15267243000168'], s);
  assert.equal(n, 3);
  assert.deepEqual(JSON.parse(s.m.get('murad_empresas_lista')!).map((e: any) => e.razaoSocial), ['MURAD']);
  assert.equal(s.m.has('murad_empresa_salva'), false);
});

test('nada muda quando todas continuam autorizadas; cópia ilegível não quebra', () => {
  const lista = JSON.stringify([{ cnpj: '15267243000168' }]);
  const s = memoria({ murad_empresas_lista: lista, murad_empresa_salva: '{quebrado' });
  assert.equal(limparEmpresasRemovidasDoNavegador(['15267243000168'], s), 0);
  assert.equal(s.m.get('murad_empresas_lista'), lista);
});
