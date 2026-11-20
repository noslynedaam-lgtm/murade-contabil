// ESCOLA MURADE (Murade Contábil) — exemplos das aulas e cálculo do simulador, SEMPRE pelo motor de cálculo real do sistema.
// Nenhum número de exemplo é escrito à mão: cada exemplo monta lançamentos de TREINO no plano de contas modelo do sistema e chama
// livrosContabeis.ts, analiseContabil.ts, extratoBancario.ts, fechamentoContabil.ts, imobilizado.ts, livroCaixa.ts,
// escrituracaoAvancada.ts ou ecdService.ts. Nada é gravado: são funções puras (sem banco, sem rede).
import type { ContaPlano, LancamentoContabil } from '../types';
import { planoContasModelo } from '../data/planoContasModelo';
import { gerarRelatoriosContabeis } from '../utils/livrosContabeis';
import { resultadoDoPeriodo } from '../utils/analiseContabil';
import { conciliar, type MovimentoExtrato } from '../utils/extratoBancario';
import { conferirFechamento } from '../utils/fechamentoContabil';
import { depreciacaoAcumulada, quotaDoMes, valorContabilLiquido, type BemImobilizado } from '../utils/imobilizado';
import { gerarLivroCaixa } from '../utils/livroCaixa';
import { calcularEncerramento } from '../utils/escrituracaoAvancada';
import { analisarObrigatoriedadeECD, prazoEntregaECD } from '../services/ecdService';
import { praticaPorId, numeroBR, dataISO, competenciaISO } from '../data/escolaPratica';

export interface LinhaExemplo { rotulo: string; valor: string }
export interface ExemploEscola { id: string; titulo: string; dados: string; linhas: LinhaExemplo[]; observacao: string; motor: string }

const PLANO: ContaPlano[] = planoContasModelo;
const CONTA = { caixa: '1.1.01.01.01', banco: '1.1.01.02.01', duplicatas: '1.1.04.01.01', moveis: '1.2.03.05.01', fornecedores: '2.1.03.01.01', salariosPagar: '2.1.06.01.01', capital: '2.3.01', resultadoPl: '2.3.03.02.01', revenda: '3.1.01.01.02', aluguel: '4.3.03.01.01', salarios: '4.3.01.02.01' };
const centavos = (reais: number) => Math.round((reais + Number.EPSILON) * 100);
const brl = (c: number) => `${c < 0 ? '-' : ''}R$ ${(Math.abs(c) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const br = (iso: string) => String(iso || '').split('-').reverse().join('/');
const digitos = (v: unknown) => String(v ?? '').replace(/[^0-9A-Za-z]/g, '');
const contaPorCodigo = (cod: string): ContaPlano | undefined => PLANO.find((c) => digitos(c.codigo) === digitos(cod));
const nome = (cod: string) => contaPorCodigo(cod)?.descricao || cod;
let seq = 0;
function lanc(data: string, valor: number, debito: string, credito: string, historico: string): LancamentoContabil {
  seq += 1;
  return { id: `treino-${seq}`, data, valor, contaDebitoCodigo: debito, contaDebitoNome: nome(debito), contaCreditoCodigo: credito, contaCreditoNome: nome(credito), historico, origem: 'Manual', competencia: data.slice(0, 7) };
}
/** Saldo de uma conta no balancete, com o lado (D/C). */
function saldoNoBalancete(rel: ReturnType<typeof gerarRelatoriosContabeis>, codigo: string): string {
  const l = rel.balancete.find((b) => b.conta.codigo === codigo);
  if (!l) return 'R$ 0,00';
  return l.saldoDevedorCentavos ? `${brl(l.saldoDevedorCentavos)} D` : `${brl(l.saldoCredorCentavos)} C`;
}

// ---------------------------------------------------------------- simulador (motor real com o que foi digitado)
export function lancamentoTreino(v: { data: string; valor: number; debito: string; credito: string; historico: string }) {
  const d = contaPorCodigo(v.debito); const c = contaPorCodigo(v.credito);
  if (!d) throw new Error(`A conta a débito ${v.debito} não existe no plano de contas.`);
  if (!c) throw new Error(`A conta a crédito ${v.credito} não existe no plano de contas.`);
  if (d.tipo !== 'analitica' || c.tipo !== 'analitica') throw new Error('Lançamento só em conta analítica (o último nível do plano).');
  if (d.codigo === c.codigo) throw new Error('Débito e crédito não podem ser na mesma conta.');
  if (!v.historico.trim()) throw new Error('Escreva o histórico da operação.');
  const comp = v.data.slice(0, 7);
  const rel = gerarRelatoriosContabeis(PLANO, [lanc(v.data, v.valor, d.codigo, c.codigo, v.historico)], comp);
  if (rel.invalidos.length) throw new Error('O lançamento ficou inválido: confira data, valor, contas e histórico.');
  return { partidasFecham: rel.totalDebitosCentavos === rel.totalCreditosCentavos ? 'Sim' : 'Não', totalDebitos: brl(rel.totalDebitosCentavos), totalCreditos: brl(rel.totalCreditosCentavos),
    saldoDebito: `${d.descricao}: ${saldoNoBalancete(rel, d.codigo)}`, saldoCredito: `${c.descricao}: ${saldoNoBalancete(rel, c.codigo)}` };
}
export function depreciacaoTreino(v: { custo: number; residual: number; vidaUtil: number; inicio: string; competencia: string }) {
  const b: BemImobilizado = { id: 'treino', descricao: 'Bem de treino', custoCentavos: centavos(v.custo), residualCentavos: centavos(v.residual), vidaUtilMeses: Math.round(v.vidaUtil), inicioDepreciacao: v.inicio, depreciavel: true };
  if (!(b.custoCentavos > 0) || b.residualCentavos >= b.custoCentavos || !(b.vidaUtilMeses > 0)) throw new Error('Confira: custo maior que zero, residual menor que o custo e vida útil em meses.');
  if (v.competencia < v.inicio) throw new Error('A competência é antes do bem entrar em uso: ainda não há depreciação.');
  return { quota: brl(quotaDoMes(b, v.competencia)), acumulada: brl(depreciacaoAcumulada(b, v.competencia)), liquido: brl(valorContabilLiquido(b, v.competencia)) };
}
export function resultadoTreino(v: { competencia: string; receita: number; aluguel: number; salarios: number }) {
  const dia = (d: string) => `${v.competencia}-${d}`;
  const lista = [
    ...(v.receita > 0 ? [lanc(dia('10'), v.receita, CONTA.caixa, CONTA.revenda, 'Vendas do mês')] : []),
    ...(v.aluguel > 0 ? [lanc(dia('10'), v.aluguel, CONTA.aluguel, CONTA.caixa, 'Aluguel do mês')] : []),
    ...(v.salarios > 0 ? [lanc(dia('28'), v.salarios, CONTA.salarios, CONTA.salariosPagar, 'Salários do mês')] : []),
  ];
  if (!lista.length) throw new Error('Informe ao menos a receita ou uma despesa.');
  const r = resultadoDoPeriodo(PLANO, lista, v.competencia);
  return { receitas: brl(r.receitas), despesas: brl(r.despesas), resultado: `${brl(r.resultado)} (${r.resultado >= 0 ? 'lucro' : 'prejuízo'})` };
}
export function ecdTreino(v: { regime: string; livroCaixa: string; distribuiu: string; ano: number }) {
  if (!['Simples Nacional', 'Lucro Presumido', 'Lucro Real'].includes(v.regime)) throw new Error('Escolha o regime.');
  if (!['sim', 'nao'].includes(v.livroCaixa) || !['sim', 'nao'].includes(v.distribuiu)) throw new Error('Responda Sim ou Não.');
  if (!(v.ano >= 2000 && v.ano <= 2100)) throw new Error('Informe o ano-calendário (ex.: 2026).');
  const a = analisarObrigatoriedadeECD({ regime: v.regime, presumidoLivroCaixa: v.livroCaixa === 'sim', presumidoDistribuiuLucroAcimaBase: v.distribuiu === 'sim', simplesAporteCapital: false });
  return { situacaoEcd: a.titulo, motivo: a.motivo, prazo: prazoEntregaECD(Math.round(v.ano)) };
}

/** Roda o motor certo para a prática com os valores digitados (texto da tela). Lança erro com a explicação se os dados não servem. */
export function simularPratica(praticaId: string, valores: Record<string, unknown>): Record<string, unknown> {
  const p = praticaPorId(praticaId); if (!p) throw new Error('Prática não encontrada.');
  const rot = (k: string) => p.campos.find((c) => c.id === k)?.rotulo || k;
  const n = (k: string) => { const x = numeroBR(valores[k]); if (!Number.isFinite(x) || x < 0) throw new Error(`Preencha "${rot(k)}" com um número.`); return x; };
  const d = (k: string) => { const x = dataISO(valores[k]); if (!x) throw new Error(`Preencha "${rot(k)}" com uma data (dd/mm/aaaa).`); return x; };
  const c = (k: string) => { const x = competenciaISO(valores[k]); if (!x) throw new Error(`Preencha "${rot(k)}" (mm/aaaa).`); return x; };
  const s = (k: string) => String(valores[k] ?? '').trim();
  switch (praticaId) {
    case 'lancamento': return lancamentoTreino({ data: d('data'), valor: n('valor'), debito: s('debito'), credito: s('credito'), historico: s('historico') });
    case 'depreciacao': return depreciacaoTreino({ custo: n('custo'), residual: n('residual'), vidaUtil: n('vidaUtil'), inicio: c('inicio'), competencia: c('competencia') });
    case 'resultado': return resultadoTreino({ competencia: c('competencia'), receita: n('receita'), aluguel: n('aluguel'), salarios: n('salarios') });
    case 'ecd': return ecdTreino({ regime: s('regime'), livroCaixa: s('livroCaixa'), distribuiu: s('distribuiu'), ano: n('ano') });
    default: throw new Error('Prática sem motor de cálculo.');
  }
}

/** Resultado esperado de um cenário (para corrigir a prova) — o mesmo motor, com os dados certos. */
export function resultadoDoCenario(praticaId: string, valores: Record<string, string>): Record<string, unknown> | null {
  try { return simularPratica(praticaId, valores); } catch { return null; }
}

// ---------------------------------------------------------------- mês de treino usado nos exemplos
function mesDeTreino(): LancamentoContabil[] {
  return [
    lanc('2026-10-01', 20000, CONTA.banco, CONTA.capital, 'Integralização de capital'),
    lanc('2026-10-05', 1500, CONTA.caixa, CONTA.revenda, 'Venda à vista'),
    lanc('2026-10-08', 4800, CONTA.duplicatas, CONTA.revenda, 'Venda a prazo'),
    lanc('2026-10-10', 2000, CONTA.aluguel, CONTA.banco, 'Pagamento do aluguel'),
    lanc('2026-10-28', 3000, CONTA.salarios, CONTA.salariosPagar, 'Salários do mês'),
  ];
}

// ---------------------------------------------------------------- exemplos das aulas
const EXEMPLOS: Record<string, () => ExemploEscola> = {
  'partida-dobrada': () => {
    const r = lancamentoTreino({ data: '2026-10-05', valor: 1500, debito: CONTA.caixa, credito: CONTA.revenda, historico: 'Venda à vista' });
    return { id: 'partida-dobrada', titulo: 'Uma venda à vista em partidas dobradas', dados: 'Venda à vista de R$ 1.500,00 em 05/10/2026, numa empresa de TREINO com o plano de contas modelo.',
      linhas: [{ rotulo: `Débito: ${nome(CONTA.caixa)} (${CONTA.caixa})`, valor: r.totalDebitos }, { rotulo: `Crédito: ${nome(CONTA.revenda)} (${CONTA.revenda})`, valor: r.totalCreditos }, { rotulo: 'Débitos = créditos', valor: r.partidasFecham }, { rotulo: 'Saldo do Caixa no balancete', valor: r.saldoDebito }],
      observacao: 'Entrou dinheiro: Caixa a débito. Ganhou receita: Revenda de Mercadorias a crédito.', motor: 'livrosContabeis.ts (gerarRelatoriosContabeis)' };
  },
  'balancete-mes': () => {
    const rel = gerarRelatoriosContabeis(PLANO, mesDeTreino(), '2026-10');
    const linhas = rel.balancete.filter((b) => b.conta.tipo === 'analitica' && (b.debitoPeriodoCentavos || b.creditoPeriodoCentavos))
      .map((b) => ({ rotulo: `${b.conta.codigo} ${b.conta.descricao}`, valor: b.saldoDevedorCentavos ? `${brl(b.saldoDevedorCentavos)} D` : `${brl(b.saldoCredorCentavos)} C` }));
    return { id: 'balancete-mes', titulo: 'Balancete de outubro/2026 (treino)', dados: 'Cinco lançamentos de TREINO: capital, venda à vista, venda a prazo, aluguel e salários.',
      linhas: [...linhas, { rotulo: 'Total dos saldos devedores', valor: brl(rel.totalSaldoDevedorCentavos) }, { rotulo: 'Total dos saldos credores', valor: brl(rel.totalSaldoCredorCentavos) }],
      observacao: 'Os totais devedor e credor são iguais: as partidas dobradas fecham. Ativo = Passivo + PL + (receitas − despesas do período).', motor: 'livrosContabeis.ts (gerarRelatoriosContabeis)' };
  },
  'dre-mes': () => {
    const r = resultadoDoPeriodo(PLANO, mesDeTreino(), '2026-10');
    return { id: 'dre-mes', titulo: 'Resultado de outubro/2026 (treino)', dados: 'Os mesmos lançamentos de TREINO do balancete.',
      linhas: [...r.contas.map((c) => ({ rotulo: `${c.grupo === 'receita' ? '(+)' : '(−)'} ${c.descricao}`, valor: brl(c.centavos) })), { rotulo: 'Receitas', valor: brl(r.receitas) }, { rotulo: 'Despesas', valor: brl(r.despesas) }, { rotulo: 'Resultado', valor: brl(r.resultado) }],
      observacao: 'Capital e recebimentos não são receita: só entram na DRE as contas de receita e despesa.', motor: 'analiseContabil.ts (resultadoDoPeriodo)' };
  },
  conciliacao: () => {
    const lista = [lanc('2026-10-01', 20000, CONTA.banco, CONTA.capital, 'Integralização de capital'), lanc('2026-10-10', 2000, CONTA.aluguel, CONTA.banco, 'Pagamento do aluguel')];
    const movs: MovimentoExtrato[] = [
      { fitid: 'T1', dataISO: '2026-10-01', valorCentavos: 2_000_000, memo: 'DEPOSITO' },
      { fitid: 'T2', dataISO: '2026-10-12', valorCentavos: -200_000, memo: 'PAGTO ALUGUEL' },
      { fitid: 'T3', dataISO: '2026-10-20', valorCentavos: -4_500, memo: 'TARIFA BANCARIA' },
    ];
    const r = conciliar(movs, lista, CONTA.banco, '2026-10');
    const txt = (m: MovimentoExtrato) => `${br(m.dataISO)} ${m.memo} ${brl(m.valorCentavos)}`;
    return { id: 'conciliacao', titulo: 'Extrato x razão do Banco (treino)', dados: 'Três movimentos no extrato de outubro e dois lançamentos na conta Banco do Brasil.',
      linhas: [...r.conciliados.map((x) => ({ rotulo: txt(x.movimento), valor: x.certeza === 'exata' ? 'casou (mesma data)' : 'casou provável (você confirma)' })), ...r.semLancamento.map((m) => ({ rotulo: txt(m), valor: 'sem lançamento: falta lançar' }))],
      observacao: 'A tarifa do banco ainda não foi lançada: é o que a conciliação mostra para corrigir.', motor: 'extratoBancario.ts (conciliar)' };
  },
  fechamento: () => {
    const r = conferirFechamento({ competencia: '2026-10', contas: PLANO, lancamentos: mesDeTreino(), preLancamentos: [], bens: [], confirmacoes: { banco: true, pagar_receber: true, folha: true, impostos: false } });
    return { id: 'fechamento', titulo: 'Fechamento guiado de outubro/2026 (treino)', dados: 'Mês de TREINO com os lançamentos do balancete; o contador ainda não confirmou "Impostos calculados".',
      linhas: [...r.itens.map((i) => ({ rotulo: i.titulo, valor: i.ok ? 'ok' : i.bloqueia ? 'falta (bloqueia o fechamento)' : 'aviso' })), { rotulo: 'Pode fechar o mês?', valor: r.podeFechar ? 'Sim' : 'Ainda não' }],
      observacao: 'Basta um item que bloqueia em aberto para o mês não fechar.', motor: 'fechamentoContabil.ts (conferirFechamento)' };
  },
  depreciacao: () => {
    const r = depreciacaoTreino({ custo: 12000, residual: 0, vidaUtil: 120, inicio: '2026-01', competencia: '2026-10' });
    return { id: 'depreciacao', titulo: 'Depreciação de móveis (treino)', dados: 'Móveis de R$ 12.000,00, sem residual, vida útil de 120 meses, em uso desde 01/2026; competência 10/2026.',
      linhas: [{ rotulo: 'Depreciação do mês', valor: r.quota }, { rotulo: 'Depreciação acumulada (jan a out)', valor: r.acumulada }, { rotulo: 'Valor contábil líquido', valor: r.liquido }],
      observacao: 'Lançamento do mês: débito em Depreciações (despesa) e crédito na Depreciação acumulada (redutora do ativo).', motor: 'imobilizado.ts (quotaDoMes, depreciacaoAcumulada)' };
  },
  'livro-caixa': () => {
    // A empresa de treino abriu em 10/2026: Caixa e Banco com saldo inicial zero nessa competência-base.
    const contas = PLANO.map((c) => ([CONTA.caixa, CONTA.banco].includes(c.codigo) ? { ...c, saldoInicial: 0, saldoInicialCompetencia: '2026-10' } : c));
    const l = gerarLivroCaixa({ contas, lancamentos: mesDeTreino(), codigosCaixa: [CONTA.caixa, CONTA.banco], de: '2026-10', ate: '2026-10' });
    if (!l.disponivel) throw new Error(l.motivo);
    const m = l.meses[0];
    return { id: 'livro-caixa', titulo: 'Livro Caixa de outubro/2026 (treino)', dados: 'Empresa de TREINO aberta em 10/2026 (Caixa e Banco do Brasil com saldo inicial zero, marcados como disponibilidades) e os lançamentos do mês.',
      linhas: [{ rotulo: 'Saldo inicial', valor: brl(m.saldoInicialCentavos) }, { rotulo: 'Entradas', valor: brl(m.entradasCentavos) }, { rotulo: 'Saídas', valor: brl(m.saidasCentavos) }, { rotulo: 'Saldo final', valor: brl(m.saldoFinalCentavos) }],
      observacao: 'A venda a prazo e os salários a pagar não entram: o Livro Caixa só registra o que passou pelo caixa e pelos bancos.', motor: 'livroCaixa.ts (gerarLivroCaixa)' };
  },
  'ecd-obrigatoriedade': () => {
    const casos: Array<[string, string, string]> = [['Lucro Real', 'nao', 'nao'], ['Lucro Presumido', 'sim', 'nao'], ['Lucro Presumido', 'sim', 'sim'], ['Simples Nacional', 'nao', 'nao']];
    const rot = (c: [string, string, string]) => c[0] === 'Lucro Presumido' ? `${c[0]} (só livro caixa; ${c[2] === 'sim' ? 'distribuiu acima da base' : 'sem distribuir acima da base'})` : c[0];
    return { id: 'ecd-obrigatoriedade', titulo: 'Quem entrega a ECD de 2026', dados: 'Quatro empresas de TREINO, ano-calendário 2026.',
      linhas: [...casos.map((c) => ({ rotulo: rot(c), valor: String(ecdTreino({ regime: c[0], livroCaixa: c[1], distribuiu: c[2], ano: 2026 }).situacaoEcd) })), { rotulo: 'Prazo da ECD de 2026', valor: br(prazoEntregaECD(2026)) }],
      observacao: 'O prazo considera só sábado e domingo: confira feriados.', motor: 'ecdService.ts (analisarObrigatoriedadeECD, prazoEntregaECD)' };
  },
  encerramento: () => {
    const r = calcularEncerramento({ contas: PLANO, lancamentos: mesDeTreino(), ano: 2026, contaDestino: CONTA.resultadoPl });
    if ('erro' in r) throw new Error(r.erro);
    return { id: 'encerramento', titulo: 'Encerramento do resultado de 2026 (treino)', dados: 'Ano de TREINO com os lançamentos do balancete de outubro.',
      linhas: [...r.partidas.map((p) => ({ rotulo: `Zerar ${p.conta.descricao}`, valor: `${brl(Math.abs(p.saldoCentavos))} ${p.saldoCentavos < 0 ? '(D na receita, C no PL)' : '(D no PL, C na despesa)'}` })), { rotulo: `Resultado levado a ${r.destino.descricao}`, valor: `${brl(r.resultadoCentavos)} (${r.resultadoCentavos >= 0 ? 'lucro' : 'prejuízo'})` }],
      observacao: 'Depois do encerramento as contas de receita e despesa ficam zeradas para o ano seguinte.', motor: 'escrituracaoAvancada.ts (calcularEncerramento)' };
  },
};

export const IDS_EXEMPLOS = Object.keys(EXEMPLOS);
export function exemploEscola(id: string): ExemploEscola | null {
  const f = EXEMPLOS[id];
  return f ? f() : null;
}
