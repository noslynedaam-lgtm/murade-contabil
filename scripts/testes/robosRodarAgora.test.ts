import test from 'node:test';
import assert from 'node:assert/strict';
import { dispararRoboAgora, executarRobo, limparRobosParaTeste, registrarRobo, registrarRotinaManual, statusRobos } from '../../src/server/robosStatus';

const def = (id: string) => ({ id, nome: `Robô ${id}`, posto: 'conferidor' as const, missao: 'teste', intervaloMs: 60_000 });

test('rodar agora: robô desconhecido ou sem rotina manual é recusado e nada roda', () => {
  limparRobosParaTeste();
  registrarRobo(def('a'));
  assert.deepEqual(dispararRoboAgora('nao_existe'), { ok: false, codigo: 'desconhecido', motivo: 'Robô não encontrado.' });
  const r = dispararRoboAgora('a');
  assert.equal(r.ok, false);
  if ('codigo' in r) assert.equal(r.codigo, 'sem_rotina_manual');
  assert.equal(statusRobos().robos[0].podeRodarAgora, false);
});

test('rodar agora: dispara a rotina uma vez, no mesmo contador do agendador', async () => {
  limparRobosParaTeste();
  registrarRobo(def('b'));
  let chamadas = 0;
  registrarRotinaManual('b', () => void executarRobo('b', async () => { chamadas += 1; }));
  assert.equal(statusRobos().robos[0].podeRodarAgora, true);
  assert.deepEqual(dispararRoboAgora('b'), { ok: true });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(chamadas, 1);
  assert.equal(statusRobos().robos[0].execucoes, 1);
});

test('rodar agora: robô já rodando não é disparado de novo', async () => {
  limparRobosParaTeste();
  registrarRobo(def('c'));
  let liberar: () => void = () => undefined; let chamadas = 0;
  registrarRotinaManual('c', () => void executarRobo('c', () => new Promise<void>((ok) => { chamadas += 1; liberar = ok; })));
  assert.equal(dispararRoboAgora('c').ok, true);
  const segundo = dispararRoboAgora('c');
  assert.equal(segundo.ok, false);
  if ('codigo' in segundo) assert.equal(segundo.codigo, 'ja_rodando');
  liberar();
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(chamadas, 1);
});

test('rodar agora: rotina que lança erro não derruba o processo', () => {
  limparRobosParaTeste();
  registrarRobo(def('d'));
  registrarRotinaManual('d', () => { throw new Error('falhou'); });
  assert.deepEqual(dispararRoboAgora('d'), { ok: true });
});

test('rodar agora: rotina só se registra para robô existente', () => {
  limparRobosParaTeste();
  registrarRotinaManual('fantasma', () => undefined);
  assert.equal(dispararRoboAgora('fantasma').ok, false);
});
