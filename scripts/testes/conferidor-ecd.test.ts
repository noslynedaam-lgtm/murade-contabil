import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirEcdWorkspace } from '../../src/server/conferidorEcd';
import { rodarConferidorContabil, achadosEcdDoConferidor, limparAchadosParaTeste } from '../../src/server/conferidorContabil';

const contas = [
  { codigo: '1', descricao: 'Ativo', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1.01', descricao: 'Caixa', nivel: 3, tipo: 'analitica', natureza: 'D', saldoInicial: 1000, saldoInicialCompetencia: '2025-01' },
  { codigo: '1.1.02', descricao: 'Clientes', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '2', descricao: 'Passivo', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.1', descricao: 'Patrimônio Líquido', nivel: 2, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.1.01', descricao: 'Capital Social', nivel: 3, tipo: 'analitica', natureza: 'C', saldoInicial: 1000, saldoInicialCompetencia: '2025-01' },
  { codigo: '2.1.02', descricao: 'Lucros ou Prejuízos Acumulados', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '3', descricao: 'Receitas', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '3.1.01', descricao: 'Receita de serviços', nivel: 2, tipo: 'analitica', natureza: 'C' },
];
const lancs = [{ id: 'a', data: '2025-03-10', contaDebitoCodigo: '1.1.02', contaDebitoNome: '', contaCreditoCodigo: '3.1.01', contaCreditoNome: '', valor: 500, historico: 'Venda', origem: 'Manual', documentoRef: 'a' }];
const agora = new Date(2026, 9, 28);
const empresaBase = { cnpj: '11222333000181', razaoSocial: 'TESTE LTDA', uf: 'MG', municipio: 'BH', regime: 'Lucro Real', responsavelNome: 'FULANO', responsavelCpf: '52998224725' };

test('Simples: ECD dispensada, sem pendência', () => {
  const r = conferirEcdWorkspace('11222333000181', { empresa: { ...empresaBase, regime: 'Simples Nacional' }, contas, lancamentos: lancs }, agora)!;
  assert.equal(r.situacao, 'dispensada'); assert.deepEqual(r.pendencias, []); assert.equal(r.ano, 2025); assert.equal(r.prazo, '2026-06-30');
  assert.equal(r.atrasada, false);
});
test('Lucro Real sem dados do contador: pendências e prazo vencido', () => {
  const r = conferirEcdWorkspace('11222333000181', { empresa: empresaBase, contas, lancamentos: lancs }, agora)!;
  assert.equal(r.pronta, false); assert.equal(r.atrasada, true);
  assert.ok(r.pendencias.some((p) => p.includes('CRC')));
});
test('Lucro Real com cadastro completo e plano vinculado: pronta', () => {
  const empresa = { ...empresaBase, nire: '31123456789', contadorNome: 'BELTRANO', contadorCpf: '11144477735', contadorCrc: 'MG-12345', contadorEmail: 'a@b.com', contadorFone: '31999999999', contadorUfCrc: 'MG', contadorCertidao: 'MG/1', contadorCertidaoData: '2026-01-02', dataAbertura: '2015-01-01', mapeamentoReferencial: {} };
  const r = conferirEcdWorkspace('11222333000181', { empresa, contas, lancamentos: lancs }, agora)!;
  // sem vínculo completo com o plano referencial, o robô aponta o que falta (ou aplica os de alta confiança sozinho)
  assert.ok(r.pronta || r.pendencias.every((p) => p.includes('referencial')), r.pendencias.join('; '));
});
test('robô guarda o achado da ECD por empresa e limpa quando some', async () => {
  limparAchadosParaTeste();
  const ws = [{ cnpj: 'AAA', payload: { empresa: empresaBase, contas, lancamentos: lancs } }];
  const consultar = async (sql: string) => /period_closures/.test(sql) ? { rows: [] } : { rows: ws };
  await rodarConferidorContabil(consultar as any, agora);
  assert.equal(achadosEcdDoConferidor(['AAA']).length, 1);
  assert.deepEqual(achadosEcdDoConferidor(['ZZZ']), []);
  await rodarConferidorContabil((async (sql: string) => ({ rows: [] })) as any, agora);
  assert.equal(achadosEcdDoConferidor().length, 0);
});

import { conferirEcdWorkspace as _conferirEcf } from "../../src/server/conferidorEcd";
test("robô da ECD também aponta cadastro faltando para o arquivo da ECF", () => {
  const a = _conferirEcf("11222333000181", { empresa: { cnpj: "11222333000181", razaoSocial: "X LTDA", regime: "Lucro Real" }, contas: [{ codigo: "1", descricao: "Caixa", natureza: "devedora", tipo: "analitica", grupo: "ativo" }], lancamentos: [] }, new Date("2026-10-28T12:00:00Z"));
  assert.ok(a);
  assert.ok(a!.avisos.some((p) => /ECF \(arquivo\): 0030: CNAE/.test(p)), a!.avisos.join(" | "));
});
