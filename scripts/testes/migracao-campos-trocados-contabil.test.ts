// Migração pelo backup do sistema anterior (Contábil): campo com o SENTIDO trocado, conferido no backup real (26/11/2026).
// A marca "empresa ativa" (wphd.empresa.stativa) vinha ao contrário (o DP achou pela folha e o Fiscal pelas notas). No Contábil o
// movimento contábil decide o SENTIDO da marca no backup (maioria das empresas); a empresa recebe a marca já no sentido certo, e a
// conferência campo a campo e a remigração leem o sentido guardado (bloco marca_ativa). Sem a decisão: lida como está (como antes).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { aplicarSentidoAtiva, montarDadosEmpresa, sentidoDaMarcaAtiva, type EmpresaDoBackup } from '../../src/server/migracaoSistemaAnterior/conversor';
import { cadastroDoBackup, conferirCamposMigrados, sentidoDoBloco } from '../../src/server/migracaoSistemaAnterior/camposSistemaAnterior';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql');
async function abrir() {
  const idx = await indexarDump(FIXTURE);
  const cache = new Map<string, any>();
  return async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
}

test('sentido da marca "ativa": a maioria das empresas com movimento decide; empate ou sem prova = lida como está', () => {
  // Como no backup real: marca "sim" em quem parou de lançar há anos e "não" em quem lançou no último ano.
  assert.equal(sentidoDaMarcaAtiva([
    { marca: true, ultimoMes: '2018-02' }, { marca: true, ultimoMes: '2020-12' }, { marca: true, ultimoMes: '2016-10' },
    { marca: false, ultimoMes: '2025-09' }, { marca: false, ultimoMes: '2017-01' }, { marca: false, ultimoMes: '' }, { marca: null, ultimoMes: '2013-01' },
  ]), 'invertido');
  assert.equal(sentidoDaMarcaAtiva([{ marca: true, ultimoMes: '2025-09' }, { marca: false, ultimoMes: '2019-01' }]), 'direto');
  assert.equal(sentidoDaMarcaAtiva([{ marca: true, ultimoMes: '' }]), 'direto', 'sem movimento não dá para provar: como antes');
  assert.equal(sentidoDaMarcaAtiva([{ marca: true, ultimoMes: '2025-01' }, { marca: true, ultimoMes: '2018-01' }]), 'direto', 'empate: como antes');
  const lista = [{ cdempresa: 6, ativa: false }, { cdempresa: 23, ativa: true }, { cdempresa: 1, ativa: null }] as EmpresaDoBackup[];
  assert.deepEqual(aplicarSentidoAtiva(lista, 'invertido').map((e) => e.ativa), [true, false, null]);
  assert.deepEqual(aplicarSentidoAtiva(lista, 'direto').map((e) => e.ativa), [false, true, null]);
});

test('cadastro: "Cliente ativo no escritório" sai no sentido decidido, fica guardado e a conferência não acusa diferença', async () => {
  const ler = await abrir();
  const antes = await montarDadosEmpresa(ler, 23);
  assert.equal(antes.empresa.ativaNoEscritorio, true, 'sem a decisão: como antes (marca como está)');
  assert.equal(antes.blocos.marca_ativa, undefined);
  const d = await montarDadosEmpresa(ler, 23, { sentidoMarcaAtiva: 'invertido' });
  assert.equal(d.empresa.ativaNoEscritorio, false, 'marca "sim" lida ao contrário');
  assert.equal(d.blocos.marca_ativa?.[0]?.sentido, 'invertido');
  assert.equal(d.blocos.cadastro_empresa[0].stativa, true, 'o original guardado continua idêntico');
  assert.equal(sentidoDoBloco(d.blocos), 'invertido');
  const r = conferirCamposMigrados({ cdempresa: 23, blocos: d.blocos, mapaContas: d.mapaContas, payload: { empresa: d.empresa, contas: d.contas, lancamentos: d.lancamentos } });
  assert.equal(r.pendencias.filter((p) => /ativo/.test(p.rotulo)).length, 0);
  // Remigração/completar pelo registro: o mesmo sentido.
  const campos = cadastroDoBackup({ empresa: d.blocos.cadastro_empresa[0], sociosEmpresa: [], socios: [], mapaContas: {}, sentidoMarcaAtiva: sentidoDoBloco(d.blocos) });
  assert.equal(campos.find((c) => c.campo === 'ativaNoEscritorio')?.valor, false);
  const direto = await montarDadosEmpresa(ler, 23, { sentidoMarcaAtiva: 'direto' });
  assert.equal(direto.empresa.ativaNoEscritorio, true);
});
