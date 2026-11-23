// AUDITORIA DOS REGIMES (23/11/2026) — Lucro Real conferido com valores CALCULADOS À MÃO, multa por atraso da ECD/ECF/DCTFWeb na
// Central do Lucro Real e o texto do painel da ECD (o gerador já monta J100/J150/I052 e o I051 das contas vinculadas).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { calcularTrimestres, calcularEstimativas, calcularJcp, CONFIG_LR_PADRAO } from '../../src/server/lucroRealApuracao';
import { alertasDasObrigacoes, estimativaMultaDeclaracaoLR } from '../../src/server/centralLucroReal';

const raiz = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '../..');
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');
const mes = (m: number, res = 0, rb = 0) => ({ mes: m, resultadoCentavos: res, receitaBrutaCentavos: rb, acrescimosCentavos: 0, irpjCentavos: 0, csllCentavos: 0, naoClassificadoCentavos: 0 });
const ms = Array.from({ length: 12 }, (_, i) => mes(i + 1, i < 3 ? 10_000_000 : 0, i < 3 ? 100_000_000 : 0));

test('Lucro Real trimestral: adição, exclusão, compensação limitada a 30%, adicional e IRRF', () => {
  // Lucro 300.000 + adição 20.000 − exclusão 10.000 = 310.000; compensa 30% = 93.000 (saldo 500.000) → base 217.000.
  // IRPJ 15% = 32.550 + adicional (217.000 − 60.000) × 10% = 15.700 → 48.250 − IRRF 1.500 = 46.750. CSLL 9% × 217.000 = 19.530.
  const lanc = [
    { id: 'a', ano: 2026, mes: 2, tributo: 'ambos' as const, tipo: 'adicao' as const, codigo: '93', descricao: 'multa indedutível', valorCentavos: 2_000_000, justificativa: 'x' },
    { id: 'e', ano: 2026, mes: 3, tributo: 'ambos' as const, tipo: 'exclusao' as const, codigo: '170', descricao: 'reversão', valorCentavos: 1_000_000, justificativa: 'x' },
    { id: 'r', ano: 2026, mes: 3, tributo: 'irpj' as const, tipo: 'irrf_retido' as const, codigo: '', descricao: 'IRRF', valorCentavos: 150_000, justificativa: 'x' },
  ];
  const [t1] = calcularTrimestres(2026, ms, lanc, { ...CONFIG_LR_PADRAO }, { prejuizo: 50_000_000, baseNegativa: 50_000_000 }, 3);
  assert.deepEqual([t1.irpjCentavos, t1.csllCentavos, t1.saldoPrejuizoFinalCentavos], [4_675_000, 1_953_000, 40_700_000]);
});

test('Lucro Real por estimativa: receita bruta × balancete de redução, fica com o menor', () => {
  // Receita 1.000.000 (comércio): base 80.000 → 12.000 + adicional 6.000 = 18.000; CSLL 12% × 1.000.000 × 9% = 10.800 → 28.800.
  // Balancete: lucro 100.000 → 15.000 + 8.000 + CSLL 9.000 = 32.000 → fica a receita bruta.
  const [jan] = calcularEstimativas(2026, ms, [], { ...CONFIG_LR_PADRAO, forma: 'estimativa' }, { prejuizo: 0, baseNegativa: 0 }, 1);
  assert.deepEqual([jan.modo, jan.irpjCentavos, jan.csllCentavos, jan.alternativaCentavos], ['E', 1_800_000, 1_080_000, 3_200_000]);
});

test('JCP: limite da TJLP e de metade do lucro, IRRF de 17,5% (LC 224/2025) e DARF 5706 no 3º dia útil depois do decêndio', () => {
  // TJLP 0,7% × PL 1.000.000 = 7.000; limite metade do lucro 10.000 = 5.000 → 5.000; IRRF 875; decêndio até 20/11 (feriado) → 23, 24, 25/11.
  const j = calcularJcp({ ano: 2026, dataPagamento: '2026-11-15', dias: 30, taxaTjlpPeriodoPercentual: 0.7, fonteTjlp: 'BNDES', basePlCentavos: 100_000_000, lucroPeriodoAntesJcpCentavos: 1_000_000, lucrosAcumuladosReservasCentavos: 0 });
  assert.deepEqual([j.jcpDedutivelCentavos, j.irrfCentavos, j.vencimentoIrrf, j.codigoDarf], [500_000, 87_500, '2026-11-25', '5706']);
});

test('Central do Lucro Real: ECD, ECF e DCTFWeb em atraso trazem a multa por atraso estimada com a fonte (nada de "há multa" genérico)', () => {
  // ECD do ano 2025 vencida em 30/06/2026, hoje 10/07/2026 (10 dias) e receita bruta 2.000.000,00 → 0,2% = 4.000,00.
  const ecd = estimativaMultaDeclaracaoLR({ tipo: 'ecd', periodo: '2025', vencimento: '2026-06-30' } as any, '2026-07-10', { receitaBrutaPorAno: { 2025: 200_000_000 } });
  assert.match(ecd, /R\$ 4\.000,00/); assert.match(ecd, /Lei 8\.218\/1991, art\. 12/);
  // ECF do Lucro Real: lucro 1.000.000,00, 46 dias → 0,5% = 5.000,00; redução de 75% → 1.250,00; receita de 2024 até 3,6 mi (teto 100 mil).
  const ecf = estimativaMultaDeclaracaoLR({ tipo: 'ecf', periodo: '2025', vencimento: '2026-07-31' } as any, '2026-09-15', { lucroAntesIrpjCsllPorAno: { 2025: 100_000_000 }, receitaBrutaPorAno: { 2024: 300_000_000 } });
  assert.match(ecf, /R\$ 5\.000,00/); assert.match(ecf, /R\$ 1\.250,00/);
  // DCTFWeb sem o valor informado: diz a regra e o mínimo de R$ 500,00, sem inventar.
  assert.match(estimativaMultaDeclaracaoLR({ tipo: 'dctfweb', periodo: '2026-09', vencimento: '2026-10-30' } as any, '2026-11-23'), /mínimo de R\$ 500,00/);
  // EFD-Contribuições: regra não conferida — sem número.
  assert.match(estimativaMultaDeclaracaoLR({ tipo: 'efd_contribuicoes', periodo: '2026-09', vencimento: '2026-11-13' } as any, '2026-11-23'), /ainda não foi conferida/);
  const al = alertasDasObrigacoes([{ id: 'ecd:2025', tipo: 'ecd', periodo: '2025', descricao: 'ECD do ano-calendário 2025', vencimento: '2026-06-30', valorCentavos: null, codigoDarf: null, estado: 'confirmada', oQueFalta: 'Transmita', fonte: 'x', guia: false, bloqueada: false } as any], '2026-07-10', {}, { receitaBrutaPorAno: { 2025: 200_000_000 } });
  assert.match(al[0].estimativa!, /R\$ 4\.000,00/);
});

test('Central: pendência visível — acréscimo da LC 224 não aplicado à estimativa do Lucro Real (sem texto oficial)', () => {
  assert.match(ler('src/server/centralLucroReal.ts'), /acréscimo de 10% da LC 224\/2025 .*NÃO é aplicado/);
});

test('painel da ECD: diz o que o gerador já monta (J100, J150, I052 e I051 das contas vinculadas)', () => {
  const painel = ler('src/components/EcdGeradorPainel.tsx');
  assert.ok(!/Ainda não inclui Balanço\/DRE/.test(painel)); assert.ok(!/mapeamento I051 ainda não incluído/.test(painel));
  assert.match(painel, /Balanço Patrimonial \(J100\), DRE \(J150\) e aglutinação \(I052\)/);
  assert.match(ler('src/services/ecdService.ts'), /Inclui Balanço Patrimonial \(J100\), DRE \(J150\), aglutinação \(I052\)/);
});
