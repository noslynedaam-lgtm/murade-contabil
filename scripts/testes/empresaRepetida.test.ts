import test from 'node:test';
import assert from 'node:assert/strict';
import { cnpjsRepetidos, dedupEmpresasPorCnpj } from '../../src/utils/dedupEmpresas';
import { analisarEmpresasRepetidas } from '../../src/server/conferidorEmpresaRepetida';

test('lista/seletor: a mesma empresa nunca aparece duas vezes (CNPJ com e sem pontuação, ids diferentes)', () => {
  const lista = [
    { id: 'a', cnpj: '11.222.333/0001-81', razaoSocial: 'AÇAÍ' },
    { id: 'b', cnpj: '11222333000181', razaoSocial: 'AÇAÍ (cópia)' },
    { id: 'c', cnpj: '44.555.666/0001-81', razaoSocial: 'OUTRA' },
    { id: 'd', cnpj: '', razaoSocial: 'SEM CNPJ 1' },
    { id: 'e', cnpj: '', razaoSocial: 'SEM CNPJ 2' },
    { id: 'd', cnpj: '', razaoSocial: 'SEM CNPJ 1 repetida' },
  ];
  const unica = dedupEmpresasPorCnpj(lista);
  assert.deepEqual(unica.map((e) => e.id), ['a', 'c', 'd', 'e']);
  assert.equal(unica[0].razaoSocial, 'AÇAÍ', 'fica a primeira (a que já estava)');
  assert.deepEqual(cnpjsRepetidos(lista), ['11222333000181']);
  assert.deepEqual(dedupEmpresasPorCnpj([]), []);
});

test('robô conferidor de empresa repetida: tudo certo não alerta; repetição é contada sem mostrar dados', () => {
  const ok = analisarEmpresasRepetidas(
    [{ cnpj: '11222333000181', tenant: 'escritorio-1' }, { cnpj: '11222333000181', tenant: 'escritorio-1' }, { cnpj: '44555666000181', tenant: 'escritorio-1' }],
    [{ cnpj: '11222333000181', cnpj_cadastro: '11.222.333/0001-81', id: 'x' }, { cnpj: '44555666000181', cnpj_cadastro: '44555666000181', id: 'y' }],
  );
  assert.equal(ok.alerta, false);
  assert.match(ok.resumo, /nenhuma repetida/);

  const ruim = analisarEmpresasRepetidas(
    [{ cnpj: '11222333000181', tenant: 'escritorio-1' }, { cnpj: '11222333000181', tenant: 'escritorio-2' }],
    [
      { cnpj: '11222333000181', cnpj_cadastro: '11222333000181', id: 'mesmo' },
      { cnpj: '11.222.333/0001-81', cnpj_cadastro: '11222333000181', id: 'outro' },
      { cnpj: '44555666000181', cnpj_cadastro: '99888777000166', id: 'mesmo' },
    ],
  );
  assert.equal(ruim.alerta, true);
  assert.equal(ruim.emDoisEscritorios, 1);
  assert.equal(ruim.chaveRepetida, 1);
  assert.equal(ruim.cnpjDiferenteDaChave, 1);
  assert.equal(ruim.idRepetido, 1);
  assert.equal(/\d{14}/.test(ruim.resumo), false, 'o aviso só conta: não mostra CNPJ de ninguém');
});
