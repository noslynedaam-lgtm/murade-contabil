import test from 'node:test';
import assert from 'node:assert/strict';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import {
  balancoResumido, calcularDfc, calcularDmpl, calcularIndices, categoriaDaConta, dreResumida, ecfSeAplica, mesesEntre, modeloNotasExplicativas,
  normaSugerida, notasValidas, pendenciasDasNotas, prazoEntregaECF, serie12Meses, sugerirCategoria,
} from '../../src/utils/demonstracoesAvancadas';

const contas: any[] = [
  { codigo: '1', descricao: 'Ativo', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1', descricao: 'Ativo Circulante', nivel: 2, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.1.1', descricao: 'Caixa', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.1.2', descricao: 'Bancos conta movimento', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.1.3', descricao: 'Clientes', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.1.4', descricao: 'Estoques de mercadorias', nivel: 3, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.2', descricao: 'Ativo Não Circulante', nivel: 2, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.2.1', descricao: 'Imobilizado', nivel: 3, tipo: 'sintetica', natureza: 'D' },
  { codigo: '1.2.1.1', descricao: 'Máquinas', nivel: 4, tipo: 'analitica', natureza: 'D' },
  { codigo: '1.2.1.2', descricao: '(-) Depreciação acumulada de máquinas', nivel: 4, tipo: 'analitica', natureza: 'C' },
  { codigo: '2', descricao: 'Passivo', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.1', descricao: 'Passivo Circulante', nivel: 2, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.1.1', descricao: 'Fornecedores', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.1.2', descricao: 'Empréstimos bancários', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.1.3', descricao: 'Lucros a distribuir', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.2', descricao: 'Passivo Não Circulante', nivel: 2, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.2.1', descricao: 'Financiamentos de longo prazo', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3', descricao: 'Patrimônio Líquido', nivel: 2, tipo: 'sintetica', natureza: 'C' },
  { codigo: '2.3.1', descricao: 'Capital Social', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3.2', descricao: 'Reserva legal', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '2.3.3', descricao: 'Lucros ou prejuízos acumulados', nivel: 3, tipo: 'analitica', natureza: 'C' },
  { codigo: '3', descricao: 'Receitas', nivel: 1, tipo: 'sintetica', natureza: 'C' },
  { codigo: '3.1', descricao: 'Receita bruta de vendas', nivel: 2, tipo: 'analitica', natureza: 'C' },
  { codigo: '3.2', descricao: 'Deduções da receita - impostos sobre vendas', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '3.3', descricao: 'Receitas financeiras', nivel: 2, tipo: 'analitica', natureza: 'C' },
  { codigo: '4', descricao: 'Despesas e custos', nivel: 1, tipo: 'sintetica', natureza: 'D' },
  { codigo: '4.1', descricao: 'Custo das mercadorias vendidas', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '4.2', descricao: 'Despesas administrativas', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '4.3', descricao: 'Despesa de depreciação', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '4.4', descricao: 'Juros sobre empréstimos', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '4.5', descricao: 'IRPJ e CSLL', nivel: 2, tipo: 'analitica', natureza: 'D' },
  { codigo: '9', descricao: 'Algo sem nome reconhecível', nivel: 1, tipo: 'analitica', natureza: 'D' },
];
let n = 0;
const L = (data: string, d: string, c: string, valor: number, extra: any = {}) => ({ id: `l${++n}`, data, contaDebitoCodigo: d, contaDebitoNome: '', contaCreditoCodigo: c, contaCreditoNome: '', valor, historico: 'h', origem: 'Manual', ...extra });
const lancs: any[] = [
  L('2025-12-31', '1.1.2', '2.3.1', 10000),               // capital integralizado no ano anterior
  L('2025-12-31', '1.1.4', '2.3.3', 2000),                // lucro acumulado anterior (estoque)
  L('2026-01-10', '1.1.3', '3.1', 20000),                 // venda a prazo
  L('2026-01-10', '3.2', '2.1.1', 1000),                  // imposto sobre venda (a pagar)
  L('2026-01-10', '4.1', '1.1.4', 8000),                  // CMV
  L('2026-02-05', '1.1.2', '1.1.3', 15000),               // recebe clientes
  L('2026-02-06', '1.1.4', '2.1.1', 5000),                // compra a prazo
  L('2026-02-20', '2.1.1', '1.1.2', 4000),                // paga fornecedor
  L('2026-03-01', '1.2.1.1', '1.1.2', 6000),              // compra máquina
  L('2026-03-02', '1.1.2', '2.2.1', 3000),                // capta financiamento LP
  L('2026-03-31', '4.3', '1.2.1.2', 500),                 // depreciação
  L('2026-03-31', '4.2', '1.1.1', 700),                   // despesa paga em caixa
  L('2026-03-31', '1.1.1', '1.1.2', 2000),                // saque (transferência caixa/banco)
  L('2026-04-10', '4.4', '1.1.2', 100),                   // juros pagos
  L('2026-04-11', '1.1.2', '3.3', 50),                    // rendimento recebido
  L('2026-04-30', '4.5', '1.1.2', 300),                   // IR pago
  L('2026-05-10', '2.3.3', '2.1.3', 1500),                // distribui lucros (a pagar)
  L('2026-05-11', '2.1.3', '1.1.2', 1000),                // paga parte
  L('2026-06-30', '2.3.3', '2.3.2', 200),                 // constitui reserva
  L('2026-07-01', '1.1.2', '2.3.1', 5000),                // aumento de capital
  L('2026-07-02', '9', '1.1.2', 10),                      // conta sem classificação
  L('2026-01-15', '4.2', '1.1.2', 999, { statusManual: 'pendente_aprovacao' }), // pendente: fica fora
];

test('classificação sugerida pelas descrições', () => {
  const cat = (cod: string) => sugerirCategoria(contas.find((c) => c.codigo === cod), contas);
  assert.equal(cat('1.1.1'), 'caixa'); assert.equal(cat('1.1.3'), 'ac_operacional'); assert.equal(cat('1.1.4'), 'estoque');
  assert.equal(cat('1.2.1.1'), 'imobilizado'); assert.equal(cat('1.2.1.2'), 'depreciacao_acumulada');
  assert.equal(cat('2.1.1'), 'pc_operacional'); assert.equal(cat('2.1.2'), 'emprestimo_cp'); assert.equal(cat('2.1.3'), 'dividendos_pagar'); assert.equal(cat('2.2.1'), 'emprestimo_lp');
  assert.equal(cat('2.3.1'), 'capital'); assert.equal(cat('2.3.2'), 'reservas'); assert.equal(cat('2.3.3'), 'lucros_acumulados');
  assert.equal(cat('3.1'), 'receita_bruta'); assert.equal(cat('3.2'), 'deducao'); assert.equal(cat('3.3'), 'receita_financeira');
  assert.equal(cat('4.1'), 'custo'); assert.equal(cat('4.2'), 'despesa'); assert.equal(cat('4.3'), 'depreciacao'); assert.equal(cat('4.4'), 'despesa_financeira'); assert.equal(cat('4.5'), 'tributos_lucro');
  assert.equal(cat('9'), 'nao_classificada');
  // ajuste da contadora vence a sugestão; valor inválido é ignorado
  assert.equal(categoriaDaConta(contas.find((c) => c.codigo === '9'), contas, { '9': 'despesa' }), 'despesa');
  assert.equal(categoriaDaConta(contas.find((c) => c.codigo === '9'), contas, { '9': 'xyz' }), 'nao_classificada');
});

test('modelo de plano do sistema: grupos principais classificados', () => {
  const p = planoContasModelo as any[];
  const cat = (cod: string) => sugerirCategoria(p.find((c) => c.codigo === cod), p);
  const primeiraAnalitica = (prefixo: string) => (p.find((c) => c.tipo === 'analitica' && c.codigo.startsWith(`${prefixo}.`)) ?? p.find((c) => c.codigo === prefixo))?.codigo;
  assert.equal(cat(primeiraAnalitica('1.1.01')), 'caixa');
  assert.equal(cat(primeiraAnalitica('1.1.04')), 'ac_operacional');
  assert.equal(cat(primeiraAnalitica('1.1.08')), 'estoque');
  assert.equal(cat(primeiraAnalitica('1.2.03')), 'imobilizado');
  assert.equal(cat(primeiraAnalitica('1.2.04')), 'depreciacao_acumulada');
  assert.equal(cat(primeiraAnalitica('2.1.03')), 'pc_operacional');
  assert.equal(cat(primeiraAnalitica('2.1.01')), 'emprestimo_cp');
  assert.equal(cat(primeiraAnalitica('2.3.01')), 'capital');
  assert.equal(cat(primeiraAnalitica('3.1.01')), 'receita_bruta');
  assert.equal(cat(primeiraAnalitica('3.2.01')), 'deducao');
  assert.equal(cat(primeiraAnalitica('1.3.01')), 'ignorar');
  assert.equal(cat(primeiraAnalitica('5.1.01')), 'ignorar');
  assert.equal(cat(primeiraAnalitica('3.3.02')), 'receita_financeira');
  assert.equal(cat(primeiraAnalitica('3.3.04')), 'outras_receitas');
  assert.ok(!p.some((c) => c.tipo === 'analitica' && sugerirCategoria(c, p) === 'nao_classificada'));
});

test('DFC indireta e direta batem com a variação do caixa, centavo a centavo', () => {
  const d = calcularDfc(contas, lancs, '2026-01', '2026-12');
  assert.equal(d.caixaInicial, 1000000);
  // caixa: +15000 -4000 -6000 +3000 -700 -100 +50 -300 -1000 +5000 -10 = 10940
  assert.equal(d.variacaoCaixa, 1094000);
  assert.equal(d.indireto.soma, d.variacaoCaixa);
  assert.equal(d.direto.soma, d.variacaoCaixa);
  assert.equal(d.confere, true);
  // lucro: 20000 -1000 -8000 -500 -700 -100 +50 -300 = 9450
  assert.equal(d.indireto.lucroLiquido, 945000);
  const linha = (rot: RegExp) => d.indireto.linhas.find((l) => rot.test(l.rotulo))?.centavos;
  assert.equal(linha(/Depreciação/), 50000);
  assert.equal(linha(/clientes/), -500000);
  assert.equal(linha(/estoques/), 300000);  // -5000 +8000
  assert.equal(linha(/fornecedores/), 200000); // +1000 +5000 -4000
  assert.equal(d.indireto.totais.investimento, -600000);
  assert.equal(d.indireto.totais.financiamento, 300000 + 50000 + 500000 - 150000); // financ. LP + dividendos a pagar + capital − distribuição
  assert.equal(d.indireto.totais.nao_classificada, -1000);
  assert.ok(d.avisos.some((a) => /sem classificação/.test(a)));
  // direto: juros recebidos em investimento e pagos em financiamento (NBC TG 1001, 7.9)
  assert.equal(d.direto.totais.investimento, -600000 + 5000);
  assert.ok(d.direto.linhas.some((l) => l.secao === 'financiamento' && /Juros/.test(l.rotulo) && l.centavos === -10000));
  // transferência caixa ↔ banco não aparece
  assert.ok(!d.direto.linhas.some((l) => l.centavos === 200000 || l.centavos === -200000));
});

test('DFC ignora o encerramento do resultado (resultado aparece uma vez)', () => {
  const comEnc = [...lancs, L('2026-12-31', '3.1', '2.3.3', 20000, { tipoEspecial: 'encerramento' })];
  const d = calcularDfc(contas, comEnc, '2026-01', '2026-12');
  assert.equal(d.indireto.lucroLiquido, 945000);
  assert.equal(d.confere, true);
});

test('DMPL: saldos, resultado, distribuição, reserva, aumento de capital e conferência com o balanço', () => {
  const m = calcularDmpl(contas, lancs, 2026);
  assert.deepEqual(m.saldoInicial.valores, { capital: 1000000, reservas: 0, lucros_acumulados: 200000, pl_outros: 0 });
  assert.equal(m.resultado, 945000);
  const rot = (r: RegExp) => m.linhas.find((l) => r.test(l.rotulo));
  assert.equal(rot(/distribu/)!.valores.lucros_acumulados, -150000);
  assert.equal(rot(/reservas/i)!.valores.reservas, 20000);
  assert.equal(rot(/reservas/i)!.valores.lucros_acumulados, -20000);
  assert.equal(rot(/Aumento de capital/)!.valores.capital, 500000);
  assert.deepEqual(m.saldoFinal.valores, { capital: 1500000, reservas: 20000, lucros_acumulados: 200000 + 945000 - 150000 - 20000, pl_outros: 0 });
  assert.equal(m.confereComBalanco, true, m.avisos.join(' '));
  assert.equal(m.soDlpa, false);
});

test('DRE resumida, balanço resumido e índices', () => {
  const d = dreResumida(contas, lancs, '2026-01', '2026-12');
  assert.equal(d.receitaBruta, 2000000); assert.equal(d.deducoes, 100000); assert.equal(d.receitaLiquida, 1900000);
  assert.equal(d.custos, 800000); assert.equal(d.lucroBruto, 1100000); assert.equal(d.tributosLucro, 30000); assert.equal(d.lucroLiquido, 945000);
  const b = balancoResumido(contas, lancs, '2026-12');
  assert.equal(b.ativoTotal + b.naoClassificado, b.passivoMaisPl);
  const r = calcularIndices(contas, lancs, '2026-12');
  const ix = (id: string) => r.indices.find((i) => i.id === id)!.valor;
  assert.equal(ix('liquidez_corrente'), Math.round((b.ativoCirculante / b.passivoCirculante) * 10000) / 10000);
  assert.equal(ix('margem_liquida'), Math.round((945000 / 1900000) * 10000) / 10000);
  assert.ok(r.indices.every((i) => i.formula && i.explicacao && i.leitura));
  const vazio = calcularIndices(contas, [], '2026-12');
  assert.equal(vazio.indices.find((i) => i.id === 'liquidez_corrente')!.valor, null);
});

test('série de 12 meses', () => {
  const s = serie12Meses(contas, lancs, '2026-12');
  assert.equal(s.length, 12); assert.equal(s[0].competencia, '2026-01'); assert.equal(s[11].competencia, '2026-12');
  assert.equal(s[0].receitaLiquida, 1900000);
  assert.equal(s.reduce((t, p) => t + p.lucroLiquido, 0), 945000);
});

test('notas explicativas: modelo por norma, pendências e validação', () => {
  assert.equal(normaSugerida(100_000_00), 'NBC TG 1002'); assert.equal(normaSugerida(480_000_001), 'NBC TG 1001'); assert.equal(normaSugerida(8_000_000_000), 'NBC TG 1000');
  const n = modeloNotasExplicativas({ razaoSocial: 'Alfa Ltda', cnpj: '11222333000181', municipio: 'Goiânia', uf: 'GO', cnae: '4744001', regime: 'Simples Nacional' } as any, 2026, 'NBC TG 1002', { capitalSocialCentavos: 1500000 });
  assert.ok(n.secoes.some((s) => s.id === 'adocao'));
  assert.match(n.secoes.find((s) => s.id === 'conformidade')!.texto, /NBC TG 1002 – Contabilidade para Microentidades/);
  assert.match(n.secoes.find((s) => s.id === 'patrimonio')!.texto, /R\$\s?15\.000,00/);
  assert.ok(pendenciasDasNotas(n).includes('Continuidade'));
  assert.equal(notasValidas(n), true);
  assert.equal(notasValidas({ ...n, norma: 'X' }), false);
  const p1001 = modeloNotasExplicativas({ razaoSocial: 'B' } as any, 2026, 'NBC TG 1001');
  assert.ok(!p1001.secoes.some((s) => s.id === 'adocao'));
});

test('ECF: prazo (último dia útil de julho) e quem entrega', () => {
  assert.equal(prazoEntregaECF(2025), '2026-07-31');
  assert.equal(prazoEntregaECF(2026), '2027-07-30'); // 31/07/2027 é sábado
  assert.equal(ecfSeAplica('Simples Nacional'), 'nao'); assert.equal(ecfSeAplica('Lucro Presumido'), 'sim'); assert.equal(ecfSeAplica(''), 'depende');
  assert.deepEqual(mesesEntre('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('relatório para o cliente: HTML com DRE, gráfico, índices e texto escapado', async () => {
  const { htmlRelatorioCliente, svgEvolucao } = await import('../../src/utils/relatorioCliente');
  const r = calcularIndices(contas, lancs, '2026-12');
  const html = htmlRelatorioCliente({ empresa: { razaoSocial: 'Alfa <script>', cnpj: '11222333000181' } as any, competencia: '2026-12', balanco: r.balanco, dre: r.dre, indices: r.indices, serie: serie12Meses(contas, lancs, '2026-12'), observacao: 'Ok & <b>' });
  assert.ok(html.includes('Alfa &lt;script&gt;')); assert.ok(html.includes('Ok &amp; &lt;b&gt;'));
  assert.ok(html.includes('<svg')); assert.ok(html.includes('Liquidez corrente')); assert.ok(html.includes('Lucro líquido'));
  assert.equal((svgEvolucao(serie12Meses(contas, [], '2026-12')).match(/<rect /g) || []).length >= 12, true);
});
