import test from 'node:test';
import assert from 'node:assert/strict';
import { brParaISO, isoParaBR, mascararDataBR } from '../../src/utils/dataBR';

test('campo de data: máscara dd/mm/aaaa', () => {
  assert.equal(mascararDataBR('0'), '0');
  assert.equal(mascararDataBR('0102'), '01/02');
  assert.equal(mascararDataBR('01022026'), '01/02/2026');
  assert.equal(mascararDataBR('01/02/2026999'), '01/02/2026');
  assert.equal(mascararDataBR('ab12c'), '12');
});

test('campo de data: converte e valida a data de verdade', () => {
  assert.equal(isoParaBR('2026-11-22'), '22/11/2026');
  assert.equal(isoParaBR('2026-11-22T10:00:00Z'), '22/11/2026');
  assert.equal(isoParaBR(''), '');
  assert.equal(isoParaBR(undefined), '');
  assert.equal(brParaISO('22/11/2026'), '2026-11-22');
  assert.equal(brParaISO('29/02/2024'), '2024-02-29');
  assert.equal(brParaISO('29/02/2026'), null);
  assert.equal(brParaISO('31/04/2026'), null);
  assert.equal(brParaISO('00/01/2026'), null);
  assert.equal(brParaISO('01/13/2026'), null);
  assert.equal(brParaISO('1/1/2026'), null);
  assert.equal(brParaISO(isoParaBR('1999-12-31')), '1999-12-31');
});

test('competência: mm/aaaa', async () => {
  const { mascararMesBR, isoMesParaBR, brParaISOMes } = await import('../../src/utils/dataBR');
  assert.equal(mascararMesBR('112026'), '11/2026');
  assert.equal(mascararMesBR('1'), '1');
  assert.equal(isoMesParaBR('2026-11'), '11/2026');
  assert.equal(isoMesParaBR(''), '');
  assert.equal(brParaISOMes('11/2026'), '2026-11');
  assert.equal(brParaISOMes('13/2026'), null);
  assert.equal(brParaISOMes('00/2026'), null);
});
