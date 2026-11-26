// Migração contábil pelo backup: menos memória sem mudar o resultado (26/11/2026). O servidor morreu na prévia de um escritório
// grande. (1) Os lançamentos, saldos e lotes da empresa ficavam DUAS vezes na memória (a linha lida e a cópia guardada no registro):
// agora a linha lida é a guardada (mesmas colunas, na mesma ordem, datas em texto ISO, sem as colunas que nunca se guardam).
// (2) Empresa acima do limite de lançamentos recebe a mesma resposta, sem copiar antes todos os lançamentos.
// Dados INVENTADOS (nenhum dado de cliente).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { montarDadosEmpresa, type Linha } from '../../src/server/migracaoSistemaAnterior/conversor';
import { mesclarMigracao } from '../../src/server/migracaoSistemaAnterior/mesclagem';
import { planoContasModelo } from '../../src/data/planoContasModelo';

function bloco(nome: string, tipos: Record<string, string>, linhas: Array<Record<string, string | null>>): string {
  const cols = Object.keys(tipos);
  return `CREATE TABLE ${nome} (\n${cols.map((c) => `    ${c} ${tipos[c]}`).join(',\n')}\n);\n\nCOPY ${nome} (${cols.join(', ')}) FROM stdin;\n${linhas.map((l) => cols.map((c) => l[c] ?? '\\N').join('\t')).join('\n')}\n\\.\n\n`;
}
async function empresaInventada(lancamentos: number) {
  const mv: Array<Record<string, string | null>> = [];
  for (let i = 0; i < lancamentos; i++) {
    const dia = `2026-0${1 + (i % 9)}-1${i % 10}`;
    mv.push({ idmovimento: `D${i}`, idlote: 'L1', dtlancamento: `${dia} 00:00:00`, idlotelancamento: `P${i}`, idconta: '11', vllancamento: `-${10 + i}.5`, dshistorico: `Venda ${i}`, origemdatahora: '2026-02-03 10:11:12', usuario: 'NAO-GUARDAR', stencerramento: 'f' });
    mv.push({ idmovimento: `C${i}`, idlote: 'L1', dtlancamento: `${dia} 00:00:00`, idlotelancamento: `P${i}`, idconta: '12', vllancamento: `${10 + i}.5`, dshistorico: `Venda ${i}`, origemdatahora: '2026-02-03 10:11:12', usuario: 'NAO-GUARDAR', stencerramento: 'f' });
  }
  const texto = "SET client_encoding = 'UTF8';\n\n"
    + bloco('wphd.empresa', { cdempresa: 'integer', nmempresa: 'text', nrcgc: 'text' }, [{ cdempresa: '7', nmempresa: 'EMPRESA INVENTADA LTDA', nrcgc: '11222333000181' }])
    + bloco('wcont.empcont', { idempresa: 'integer', idplanodecontas: 'integer' }, [{ idempresa: '7', idplanodecontas: '1' }])
    + bloco('wcont.contas', { idconta: 'integer', idplanodecontas: 'integer', cdclassinterna: 'text', nmconta: 'text', tpconta: 'text', cdchamada: 'text' }, [
      { idconta: '10', idplanodecontas: '1', cdclassinterna: '1', nmconta: 'ATIVO', tpconta: 'S', cdchamada: '1' },
      { idconta: '11', idplanodecontas: '1', cdclassinterna: '1-1', nmconta: 'CAIXA', tpconta: 'A', cdchamada: '2' },
      { idconta: '12', idplanodecontas: '1', cdclassinterna: '1-2', nmconta: 'BANCO', tpconta: 'A', cdchamada: '3' },
    ])
    + bloco('wcont.mv00007', { idmovimento: 'text', idlote: 'text', dtlancamento: 'timestamp without time zone', idlotelancamento: 'text', idconta: 'integer', vllancamento: 'double precision', dshistorico: 'text', origemdatahora: 'timestamp without time zone', usuario: 'text', stencerramento: 'boolean' }, mv)
    + bloco('wcont.lt00007', { idlote: 'text', cdchamada: 'text', dslote: 'text', dtcriacao: 'timestamp without time zone' }, [{ idlote: 'L1', cdchamada: '00001', dslote: 'Lote inventado', dtcriacao: '2026-01-01 08:00:00' }])
    + bloco('wcont.sd00007', { idconta: 'integer', dtsaldo: 'timestamp without time zone', vlcredito: 'double precision', vldebito: 'double precision' }, [{ idconta: '11', dtsaldo: '2026-01-31 00:00:00', vlcredito: '0', vldebito: '-10.5' }]);
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-ct-mem-')), 'p.sql'); fs.writeFileSync(arq, texto);
  const idx = await indexarDump(arq);
  // Como no servidor: as tabelas comuns ficam na memória da sessão; as da empresa são lidas de novo a cada uso.
  const cache = new Map<string, any>();
  const ler = async (n: string) => { const por = /\d{5}$/.test(n); if (!por && cache.has(n)) return cache.get(n); const l = await carregarTabelaDump(idx, n); if (!por) cache.set(n, l); return l; };
  return { arq, idx, ler };
}

test('lançamentos, saldos e lotes guardados para o registro: iguais à cópia de antes (datas em texto, sem as colunas que nunca se guardam)', async () => {
  const { arq, idx, ler } = await empresaInventada(3);
  try {
    const d = await montarDadosEmpresa(ler, 7);
    // O que a cópia de antes guardava: cada coluna na mesma ordem, data em texto ISO, sem "usuario".
    const antes = (linhas: Linha[]) => linhas.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'usuario').map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));
    assert.equal(JSON.stringify(d.blocos.lancamentos_originais), JSON.stringify(antes((await carregarTabelaDump(idx, 'wcont.mv00007'))!)));
    assert.equal(JSON.stringify(d.blocos.saldos), JSON.stringify(antes((await carregarTabelaDump(idx, 'wcont.sd00007'))!)));
    assert.equal(JSON.stringify(d.blocos.lotes), JSON.stringify(antes((await carregarTabelaDump(idx, 'wcont.lt00007'))!)));
    assert.equal(d.blocos.lancamentos_originais[0].dtlancamento, '2026-01-10T00:00:00.000Z');
    assert.ok(!('usuario' in d.blocos.lancamentos_originais[0]));
    // Os lançamentos continuam saindo da data certa (a data do lançamento é lida antes e depois pelo mesmo dia).
    assert.deepEqual(d.lancamentos.map((l) => [l.data, l.contaDebitoCodigo, l.contaCreditoCodigo, l.valor]), [['2026-01-10', '1.1', '1.2', 10.5], ['2026-02-11', '1.1', '1.2', 11.5], ['2026-03-12', '1.1', '1.2', 12.5]]);
    assert.deepEqual(d.esperadoLancamentos.map((e) => [e.codigo, e.competencia, e.debitoCentavos, e.creditoCentavos]).sort(), [['1.1', '2026-01', 1050, 0], ['1.1', '2026-02', 1150, 0], ['1.1', '2026-03', 1250, 0], ['1.2', '2026-01', 0, 1050], ['1.2', '2026-02', 0, 1150], ['1.2', '2026-03', 0, 1250]]);
    // Ler a mesma empresa de novo dá o mesmo resultado (as linhas da empresa são lidas de novo do arquivo).
    assert.equal(JSON.stringify(await montarDadosEmpresa(ler, 7)), JSON.stringify(d));
  } finally { fs.rmSync(path.dirname(arq), { recursive: true, force: true }); }
});

test('empresa acima de 20.000 lançamentos: a mesma resposta de antes (nada gravado), sem copiar os lançamentos', async () => {
  const { arq, ler } = await empresaInventada(20001);
  try {
    const d = await montarDadosEmpresa(ler, 7);
    assert.equal(d.lancamentos.length, 20001);
    const m = mesclarMigracao(null, d, { modelo: planoContasModelo, cadastroCompartilhado: null, competenciaAtual: '2026-11', fechadas: new Set() });
    assert.equal(m.payload, null);
    assert.equal(m.bloqueio, 'Esta empresa ficaria com 20001 lançamentos e o Murad guarda até 20000 por empresa. Nada foi gravado; o caso foi registrado para o suporte ampliar o limite.');
    // Com 20.000 cabe (o limite continua o mesmo).
    const d2 = { ...d, lancamentos: d.lancamentos.slice(0, 20000) };
    assert.doesNotMatch(String(mesclarMigracao(null, d2, { modelo: planoContasModelo, cadastroCompartilhado: null, competenciaAtual: '2026-11', fechadas: new Set() }).bloqueio || ''), /lançamentos e o Murad guarda/);
  } finally { fs.rmSync(path.dirname(arq), { recursive: true, force: true }); }
});
