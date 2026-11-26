// Conferência da migração: o balancete do Murade (só os lançamentos que vieram do sistema anterior) por conta e
// competência tem de bater com os saldos gravados no sistema anterior. Função pura, usada na prévia, logo depois de
// gravar, pelo Robô Conferidor da Migração e pela Agente IA. Só lê.
import type { ContaPlano } from '../../types';
import { classificarLancamentoContabil } from '../../utils/livrosContabeis';
import type { EsperadoConferencia } from './conversor';
import { ORIGEM_SISTEMA_ANTERIOR, PREFIXO_ID_MIGRACAO } from './conversor';
import { PREFIXO_AJUSTE } from './analiseSistemaAnterior';

export interface DiferencaConferencia { codigo: string; competencia: string; debitoMurade: number; debitoAnterior: number; creditoMurade: number; creditoAnterior: number }
export interface ReferenciaConferencia {
  esperado: EsperadoConferencia[];
  esperadoLancamentos: EsperadoConferencia[];
  saldoFinalEsperado: Record<string, number>;
  lancamentosGravados: number;
  semSaldosParaConferir?: boolean;
  /** Linhas do arquivo que não puderam virar lançamento (ficam no registro do sistema anterior). */
  linhasQueNaoEntraram?: number;
}
export interface ResultadoConferencia {
  bate: boolean;
  /** O Murade tem, por conta e mês, exatamente o que estava nos lançamentos originais do arquivo. */
  bateComLancamentosOriginais: boolean;
  /** O Murade bate com a tabela de saldos do sistema anterior. */
  bateComSaldos: boolean;
  /** As diferenças com a tabela de saldos são só em meses em que o sistema anterior não gravou o total do mês (saldo antigo não recalculado lá). */
  saldosAntigosDesatualizadosNoSistemaAnterior: number;
  linhasQueNaoEntraram: number;
  lancamentosEsperados: number;
  lancamentosNoMurade: number;
  lancamentosInvalidos: number;
  contasConferidas: number;
  competenciasConferidas: number;
  diferencas: DiferencaConferencia[];
  diferencasLancamentosOriginais: DiferencaConferencia[];
  saldosFinaisDiferentes: Array<{ codigo: string; murade: number; anterior: number }>;
  semSaldosParaConferir: boolean;
  resumo: string;
}

export function ehLancamentoDoSistemaAnterior(l: any): boolean {
  return Boolean(l) && l.origem === ORIGEM_SISTEMA_ANTERIOR && String(l.id || '').startsWith(PREFIXO_ID_MIGRACAO);
}

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function comparar(murade: Map<string, { d: number; c: number }>, esperado: EsperadoConferencia[], peloSaldo = false): Array<DiferencaConferencia & { semTotalDoMes?: boolean }> {
  const mapa = new Map(esperado.map((e) => [`${e.codigo}|${e.competencia}`, e]));
  const saida: Array<DiferencaConferencia & { semTotalDoMes?: boolean }> = [];
  for (const k of new Set([...murade.keys(), ...mapa.keys()])) {
    const m = murade.get(k) || { d: 0, c: 0 }; const e = mapa.get(k);
    const [codigo, competencia] = k.split('|');
    const difere = peloSaldo ? m.d - m.c !== (e?.debitoCentavos || 0) - (e?.creditoCentavos || 0) : m.d !== (e?.debitoCentavos || 0) || m.c !== (e?.creditoCentavos || 0);
    if (difere) saida.push({ codigo, competencia, debitoMurade: m.d, debitoAnterior: e?.debitoCentavos || 0, creditoMurade: m.c, creditoAnterior: e?.creditoCentavos || 0, ...(e?.semTotalDoMes ? { semTotalDoMes: true } : {}) });
  }
  return saida.sort((a, b) => a.competencia.localeCompare(b.competencia) || a.codigo.localeCompare(b.codigo));
}

/**
 * Conferência acumulada lançamento a lançamento (o documento da empresa e, quando há, o histórico guardado mês a mês): a mesma
 * conta de antes, sem precisar de todos os lançamentos na memória ao mesmo tempo.
 */
export class AcumuladorConferencia {
  private readonly porCodigo: Map<string, ContaPlano>;
  readonly murade = new Map<string, { d: number; c: number }>();
  readonly saldo = new Map<string, number>();
  migrados = 0;
  ajustes = 0;
  invalidos = 0;
  constructor(contas: ContaPlano[]) { this.porCodigo = new Map((Array.isArray(contas) ? contas : []).map((c) => [c.codigo, c])); }
  private contar(l: any): void {
    const v = classificarLancamentoContabil(l, this.porCodigo);
    if (v === 'ignorado') return;
    if (v === 'invalido') { this.invalidos++; return; }
    const comp = v.dataISO.slice(0, 7);
    const kd = `${v.debito.codigo}|${comp}`; const kc = `${v.credito.codigo}|${comp}`;
    this.murade.set(kd, { d: (this.murade.get(kd)?.d || 0) + v.valorCentavos, c: this.murade.get(kd)?.c || 0 });
    this.murade.set(kc, { d: this.murade.get(kc)?.d || 0, c: (this.murade.get(kc)?.c || 0) + v.valorCentavos });
    this.saldo.set(v.debito.codigo, (this.saldo.get(v.debito.codigo) || 0) + v.valorCentavos);
    this.saldo.set(v.credito.codigo, (this.saldo.get(v.credito.codigo) || 0) - v.valorCentavos);
  }
  adicionar(l: any): void {
    if (ehLancamentoDoSistemaAnterior(l)) { this.migrados++; this.contar(l); }
    // Ajustes de migração que o contador confirmou (e os estornos deles) entram no balancete conferido.
    if (String(l?.documentoRef || '').startsWith(PREFIXO_AJUSTE)) { this.ajustes++; this.contar(l); }
  }
  adicionarTodos(lancamentos: unknown): void { for (const l of Array.isArray(lancamentos) ? lancamentos : []) this.adicionar(l); }
  /** Cópia das somas (o histórico é somado uma vez; o documento, a cada mudança). */
  clonar(): AcumuladorConferencia {
    const c = Object.create(AcumuladorConferencia.prototype) as AcumuladorConferencia;
    Object.assign(c, { porCodigo: this.porCodigo, murade: new Map([...this.murade].map(([k, v]) => [k, { ...v }])), saldo: new Map(this.saldo), migrados: this.migrados, ajustes: this.ajustes, invalidos: this.invalidos });
    return c;
  }
  resultado(ref: ReferenciaConferencia): ResultadoConferencia { return resultadoConferencia(this, ref); }
}

export function conferirMigracao(contas: ContaPlano[], lancamentos: any[], ref: ReferenciaConferencia): ResultadoConferencia {
  const acc = new AcumuladorConferencia(contas);
  acc.adicionarTodos(lancamentos);
  return acc.resultado(ref);
}

function resultadoConferencia(acc: AcumuladorConferencia, ref: ReferenciaConferencia): ResultadoConferencia {
  const { murade, saldo } = acc;
  const migrados = { length: acc.migrados };
  const ajustes = { length: acc.ajustes };
  const rel = { invalidos: { length: acc.invalidos } };
  const semSaldos = Boolean(ref.semSaldosParaConferir);
  // Com ajuste de migração confirmado pelo contador, a conta/mês confere pelo efeito no saldo (débito − crédito).
  const peloSaldo = ajustes.length > 0;
  const difOriginais = comparar(murade, ref.esperadoLancamentos || [], peloSaldo);
  const difSaldos = semSaldos ? [] : comparar(murade, ref.esperado || [], peloSaldo);
  const saldosFinaisDiferentes: ResultadoConferencia['saldosFinaisDiferentes'] = [];
  if (!semSaldos) {
    for (const codigo of new Set([...saldo.keys(), ...Object.keys(ref.saldoFinalEsperado || {})])) {
      const m = saldo.get(codigo) || 0; const a = ref.saldoFinalEsperado?.[codigo] || 0;
      if (m !== a) saldosFinaisDiferentes.push({ codigo, murade: m, anterior: a });
    }
  }
  const faltam = ref.lancamentosGravados - migrados.length;
  const bateComLancamentosOriginais = faltam === 0 && rel.invalidos.length === 0 && difOriginais.length === 0;
  const bateComSaldos = difSaldos.length === 0 && saldosFinaisDiferentes.length === 0;
  // Diferença só em mês sem total gravado lá, com os lançamentos originais batendo: o saldo antigo do sistema anterior é que ficou desatualizado.
  const soMesesSemTotal = !bateComSaldos && difSaldos.every((d) => d.semTotalDoMes) && bateComLancamentosOriginais;
  const contasDesatualizadas = soMesesSemTotal ? new Set([...difSaldos.map((d) => d.codigo), ...saldosFinaisDiferentes.map((d) => d.codigo)]).size : 0;
  const naoEntraram = Number(ref.linhasQueNaoEntraram || 0);
  const bate = naoEntraram === 0 && bateComLancamentosOriginais && (bateComSaldos || soMesesSemTotal);
  const chaves = new Set([...murade.keys(), ...(ref.esperadoLancamentos || []).map((e) => `${e.codigo}|${e.competencia}`)]);
  const contasConferidas = new Set([...chaves].map((k) => k.split('|')[0])).size;
  const competenciasConferidas = new Set([...chaves].map((k) => k.split('|')[1])).size;
  let resumo: string;
  if (bate) {
    resumo = `Bate: ${migrados.length} lançamento(s) do sistema anterior; débitos e créditos de ${contasConferidas} conta(s) em ${competenciasConferidas} competência(s) iguais aos lançamentos originais`;
    if (semSaldos) resumo += ' (o backup não tinha a tabela de saldos para comparar).';
    else if (bateComSaldos) resumo += ' e aos saldos do sistema anterior, inclusive o saldo final de cada conta.';
    else resumo += `. Atenção: em ${contasDesatualizadas} conta(s) a tabela de saldos antiga do próprio sistema anterior estava desatualizada (meses sem total gravado lá); o Murad seguiu os lançamentos, que são a fonte.`;
  } else {
    const partes: string[] = [];
    if (naoEntraram) partes.push(`${naoEntraram} linha(s) de lançamento do arquivo não puderam entrar (estão no registro do sistema anterior, com o motivo)`);
    if (faltam > 0) partes.push(`faltam ${faltam} lançamento(s) do sistema anterior`);
    if (faltam < 0) partes.push(`há ${-faltam} lançamento(s) a mais do que o gravado na migração`);
    if (rel.invalidos.length) partes.push(`${rel.invalidos.length} lançamento(s) inválido(s) (conta inexistente ou sintética, data ou histórico)`);
    const d = difOriginais[0] || difSaldos[0];
    if (difOriginais.length || difSaldos.length) partes.push(`${Math.max(difOriginais.length, difSaldos.length)} conta/competência com valor diferente (ex.: ${d.codigo} em ${d.competencia}: débito ${reais(d.debitoMurade)} x ${reais(d.debitoAnterior)}, crédito ${reais(d.creditoMurade)} x ${reais(d.creditoAnterior)})`);
    if (saldosFinaisDiferentes.length) partes.push(`${saldosFinaisDiferentes.length} saldo(s) final(is) diferente(s)`);
    resumo = `NÃO bate: ${partes.join('; ')}.`;
  }
  const limpar = (x: Array<DiferencaConferencia & { semTotalDoMes?: boolean }>) => x.slice(0, 200).map(({ semTotalDoMes: _s, ...r }) => r);
  return {
    bate, bateComLancamentosOriginais, bateComSaldos, linhasQueNaoEntraram: naoEntraram, saldosAntigosDesatualizadosNoSistemaAnterior: contasDesatualizadas,
    lancamentosEsperados: ref.lancamentosGravados, lancamentosNoMurade: migrados.length, lancamentosInvalidos: rel.invalidos.length,
    contasConferidas, competenciasConferidas, diferencas: limpar(difSaldos), diferencasLancamentosOriginais: limpar(difOriginais),
    saldosFinaisDiferentes: saldosFinaisDiferentes.slice(0, 200), semSaldosParaConferir: semSaldos, resumo,
  };
}
