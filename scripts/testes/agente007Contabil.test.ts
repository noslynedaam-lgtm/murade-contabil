// Agente 007 no Contábil: etapas, mapa do backup e regras (dados FICTÍCIOS). O núcleo tem o teste agente007Nucleo.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { achadosBalancete007, achadosCampos007, etapas007Contabil } from '../../src/server/agente007Contabil';
import { REGRAS_007_CONTABIL, versaoMapaBackupContabil, colunasSoConsulta } from '../../src/data/mapaBackupContabil';
import { DESTINO_COLUNAS } from '../../src/server/migracaoSistemaAnterior/camposSistemaAnterior';

const C1 = '11222333000181';

test('Contábil: balancete que não bate e campo a campo viram pontos para conferir; tudo certo não aponta nada', () => {
  assert.deepEqual(achadosBalancete007(C1, { bate: false, resumo: 'conta 1.1.01 difere em 12/2025' }).map((x) => x.chave), [`balancete|${C1}`]);
  assert.equal(achadosBalancete007(C1, { bate: true, resumo: '' }).length, 0);
  assert.equal(achadosBalancete007(C1, null).length, 0);
  const c = achadosCampos007(C1, [{ tipo: 'faltou', item: 'Empresa', rotulo: 'NIRE' }, { tipo: 'diferente', item: 'Conta 1.1', rotulo: 'Nome' }, { tipo: 'faltou', item: 'Empresa', rotulo: 'CRC' }]);
  assert.equal(c.length, 1); assert.match(c[0].texto, /2 campo\(s\) do backup não chegaram e 1 vieram diferentes/);
  assert.equal(achadosCampos007(C1, []).length, 0);
  for (const x of c) assert.ok(!/alterdata/i.test(x.texto + (x.comoCorrigir || '')));
});

test('Contábil: ordem das etapas — completar, balancete, campo a campo e depois os robôs (Fiscal → Contábil)', async () => {
  const ordem: string[] = [];
  const etapas = etapas007Contabil({ consultar: async () => ({ rows: [] }), banco: {} as any, workspaceValido: () => true, pesadas: [
    { id: 'dados_backup_fiscal', nome: 'a', rodar: async () => { ordem.push('fiscal'); } },
    { id: 'reconciliador', nome: 'b', rodar: async () => { ordem.push('reconciliador'); } },
  ] });
  assert.deepEqual(etapas.map((e) => e.id), ['completar', 'balancete', 'campo_a_campo', 'dados_backup_fiscal', 'reconciliador']);
  assert.deepEqual(etapas.filter((e) => e.pesada).map((e) => e.id), ['dados_backup_fiscal', 'reconciliador']);
  for (const e of etapas.filter((x) => x.pesada)) await e.rodar({ tenantId: '*', cnpj: '*', motivo: '' });
  assert.deepEqual(ordem, ['fiscal', 'reconciliador']);
});

test('Contábil: mapa do backup vem do catálogo da importação, tem versão e regras com fonte', () => {
  assert.match(versaoMapaBackupContabil(), /^[0-9a-f]{16}$/);
  const comConsulta = Object.keys(DESTINO_COLUNAS).find((t) => colunasSoConsulta(t).length);
  if (comConsulta) assert.ok(colunasSoConsulta(comConsulta).every((c) => c.coluna));
  const comBloco = Object.entries(DESTINO_COLUNAS).find(([, d]) => d.bloco && Object.values(d.colunas).some((x) => x.tipo === 'consulta'));
  if (comBloco) assert.ok(colunasSoConsulta(comBloco[1].bloco!).length > 0, 'acha pelo nome do bloco guardado');
  for (const r of REGRAS_007_CONTABIL) assert.ok(r.fonte && r.naImportacao && r.o007 && !/alterdata/i.test(JSON.stringify(r)), r.id);
});
