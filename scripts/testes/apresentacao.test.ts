// A apresentação do sistema precisa bater com o código: robô, rota de integração e tela novos sem bloco => falha; bloco que cita o que não existe => falha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conferirApresentacao, resumoRelatorioApresentacao, robosDoServidor, rotasDeIntegracaoDoServidor } from '../../src/server/conferidorApresentacao';
import { MODULOS_JEITO_PADRAO } from '../../src/data/jeitoPadraoContabil';
import { INTEGRACOES_APRESENTACAO, ROBOS_APRESENTACAO } from '../../src/data/apresentacaoSistema';

const lerReal = (c: string) => readFileSync(c, 'utf8');

test('apresentação: no código real nada falta e nada sobra', () => {
  const r = conferirApresentacao(lerReal);
  assert.deepEqual(r.problemas, [], r.problemas.map((p) => p.detalhe).join('\n'));
  assert.ok(r.verificados > 30);
  assert.match(resumoRelatorioApresentacao(r), /conferid/i);
});
test('apresentação: o servidor registra os robôs da lista e a lista não tem robô a mais', () => {
  const doCodigo = robosDoServidor(lerReal('server.ts')).map((x) => x.id).sort();
  assert.deepEqual(ROBOS_APRESENTACAO.map((x) => x.id).sort(), doCodigo);
  assert.ok(rotasDeIntegracaoDoServidor(lerReal('server.ts')).length >= INTEGRACOES_APRESENTACAO.length);
});
test('apresentação: robô novo no código sem bloco é apontado', () => {
  const lerComRoboNovo = (c: string) => (c === 'server.ts' ? `${lerReal(c)}\nregistrarRobo({ id: "robo_novo_teste", nome: "Robô novo", posto: "x", missao: "y", intervaloMs: 3600000 });\n` : lerReal(c));
  const r = conferirApresentacao(lerComRoboNovo);
  assert.ok(r.problemas.some((p) => /robo_novo_teste/.test(p.chave)), r.problemas.map((p) => p.detalhe).join('\n'));
});
test('apresentação: robô que deixou de existir no código (bloco sobrando) é apontado', () => {
  const semMeuJeito = (c: string) => (c === 'server.ts' ? lerReal(c).replace(/id: "meu_jeito"/g, 'id: "meu_jeito_renomeado"') : lerReal(c));
  const r = conferirApresentacao(semMeuJeito);
  assert.ok(r.problemas.some((p) => /meu_jeito/.test(p.chave)), r.problemas.map((p) => p.detalhe).join('\n'));
});
test('apresentação: rota de integração nova sem bloco é apontada', () => {
  const comRota = (c: string) => (c === 'server.ts' ? `${lerReal(c)}\napp.post("/api/integracao/rota-nova-teste", () => {});\n` : lerReal(c));
  const r = conferirApresentacao(comRota);
  assert.ok(r.problemas.some((p) => /rota-nova-teste/.test(p.chave)), r.problemas.map((p) => p.detalhe).join('\n'));
});
test('apresentação: bloco de tela que não existe no menu é apontado', () => {
  MODULOS_JEITO_PADRAO.push({ id: 'tela-fantasma-teste', rotulo: 'Fantasma', resumo: 'x'.repeat(30), arquivo: 'X' } as any);
  try {
    const r = conferirApresentacao(lerReal);
    assert.ok(r.problemas.some((p) => p.tipo === 'bloco_de_tela_inexistente' && p.chave === 'tela-fantasma-teste'));
  } finally { MODULOS_JEITO_PADRAO.pop(); }
  assert.deepEqual(conferirApresentacao(lerReal).problemas, []);
});
test('apresentação: tela do menu sem bloco é apontada', () => {
  const i = MODULOS_JEITO_PADRAO.findIndex((m) => m.id === 'balancete'); const [tirado] = MODULOS_JEITO_PADRAO.splice(i, 1);
  try { assert.ok(conferirApresentacao(lerReal).problemas.some((p) => p.tipo === 'tela_sem_bloco' && p.chave === 'balancete')); } finally { MODULOS_JEITO_PADRAO.splice(i, 0, tirado); }
});
