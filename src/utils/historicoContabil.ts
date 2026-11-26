// Histórico guardado da escrituração (exercícios antigos fora do documento da empresa).
//
// Empresa grande (anos de movimento) não cabe num documento só. Os exercícios antigos ficam numa tabela própria do banco
// (contabil_lancamentos_historico, por empresa e mês) e o documento da empresa fica com os exercícios em aberto. Para os
// relatórios dos exercícios em aberto darem exatamente os mesmos números, o documento recebe o SALDO TRANSPORTADO: por conta,
// a soma de tudo o que ficou no histórico, em partidas datadas no último dia do último mês guardado. Regras:
//  - o transporte entra no saldo (saldo anterior, balancete, balanço, razão) e nunca no movimento de um período;
//  - o que no histórico era encerramento do exercício vira transporte marcado como encerramento (quem tira o encerramento
//    da conta, como a DRE e a análise, tira exatamente o mesmo valor);
//  - a regra de quais lançamentos contam é a mesma dos relatórios (classificarLancamentoContabil);
//  - os exercícios guardados são consultados ano a ano (lançamentos do ano + transporte até o ano anterior).
// Funções puras: valem no navegador e no servidor.
import type { ContaPlano, LancamentoContabil } from "../types";
import { classificarLancamentoContabil, converterCentavos, ehTransporteHistorico } from "./livrosContabeis";

export const PREFIXO_TRANSPORTE = "hist-transporte-";
export { ehTransporteHistorico };

/** Marca, no documento da empresa, do que está guardado no histórico. Gravada só pelo servidor. */
export interface MarcadorHistorico {
  /** Último mês guardado no histórico (AAAA-MM, sempre dezembro: o corte é no fim do exercício). */
  ateCompetencia: string;
  /** Primeiro mês com lançamento no histórico. */
  desdeCompetencia: string;
  /** Lançamentos guardados (todos, inclusive os que não contam nos relatórios). */
  quantidade: number;
  /** Soma dos débitos dos lançamentos que contam, em centavos (conferência). */
  debitosCentavos: number;
  /** Partidas de transporte no documento. */
  transportes: number;
  atualizadoEm: string;
  /** "migracao" (veio do backup) ou "exercicio" (exercício antigo guardado pelo escritório/robô). */
  motivo: "migracao" | "exercicio";
}

const RE_COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

export function ultimoDiaDaCompetencia(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Competência-base efetiva da abertura da conta (a mesma regra do balancete: saldo inicial diferente de zero e competência válida). */
export function baseAberturaConta(conta: Pick<ContaPlano, "saldoInicial" | "saldoInicialCompetencia"> | undefined): string | null {
  if (!conta) return null;
  const saldo = converterCentavos(conta.saldoInicial ?? 0) ?? 0;
  const c = String(conta.saldoInicialCompetencia || "");
  return saldo !== 0 && RE_COMP.test(c) ? c : null;
}

/**
 * Soma, por conta, o que fica no histórico até o corte. Lança erro quando um lançamento não pode ser resumido sem mudar
 * o balancete (conta com saldo inicial informado numa competência até o corte e lançamento anterior a ela: o balancete
 * ignora esse lado, e o transporte não teria como ignorar).
 */
export class AcumuladorHistorico {
  readonly normal = new Map<string, number>();
  readonly encerramento = new Map<string, number>();
  quantidade = 0;
  contam = 0;
  ignorados = 0;
  invalidos = 0;
  debitosCentavos = 0;
  desde = "";
  ate = "";
  /** Lados que o balancete ignora por causa do saldo inicial (o histórico não pode ser resumido assim). */
  ladosForaDaAbertura: Array<{ conta: string; data: string; id: string }> = [];
  private readonly porCodigo: Map<string, ContaPlano>;
  private readonly base = new Map<string, string>();

  constructor(contas: ContaPlano[], private readonly corte: string) {
    this.porCodigo = new Map(contas.map((c) => [c.codigo, c]));
    for (const c of contas) { const b = baseAberturaConta(c); if (b && b <= corte) this.base.set(c.codigo, b); }
  }

  adicionar(l: LancamentoContabil): void {
    this.quantidade++;
    const comp = String(l?.data || "").slice(0, 7);
    if (RE_COMP.test(comp)) { if (!this.desde || comp < this.desde) this.desde = comp; if (comp > this.ate) this.ate = comp; }
    const c = classificarLancamentoContabil(l, this.porCodigo);
    if (c === "ignorado") { this.ignorados++; return; }
    if (c === "invalido") { this.invalidos++; return; }
    this.contam++;
    this.debitosCentavos += c.valorCentavos;
    const mes = c.dataISO.slice(0, 7);
    for (const lado of [c.debito.codigo, c.credito.codigo]) {
      const b = this.base.get(lado);
      if (b && mes < b) this.ladosForaDaAbertura.push({ conta: lado, data: c.dataISO, id: String(l.id) });
    }
    const mapa = l.tipoEspecial === "encerramento" ? this.encerramento : this.normal;
    mapa.set(c.debito.codigo, (mapa.get(c.debito.codigo) || 0) + c.valorCentavos);
    mapa.set(c.credito.codigo, (mapa.get(c.credito.codigo) || 0) - c.valorCentavos);
  }

  /** Saldo (débito − crédito, em centavos) de cada conta no histórico, somando normal e encerramento. */
  saldos(): Map<string, number> {
    const s = new Map<string, number>();
    for (const m of [this.normal, this.encerramento]) for (const [k, v] of m) s.set(k, (s.get(k) || 0) + v);
    for (const [k, v] of s) if (!v) s.delete(k);
    return s;
  }
}

/** Partidas que fazem, conta a conta, o mesmo saldo (débito − crédito) do mapa, sem conta técnica: devedoras contra credoras. */
function parear(saldos: Map<string, number>): Array<{ debito: string; credito: string; centavos: number }> {
  const ord = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }) || a[0].localeCompare(b[0]);
  const dev = [...saldos].filter(([, v]) => v > 0).sort(ord).map(([k, v]) => ({ k, v }));
  const cre = [...saldos].filter(([, v]) => v < 0).sort(ord).map(([k, v]) => ({ k, v: -v }));
  const saida: Array<{ debito: string; credito: string; centavos: number }> = [];
  let i = 0; let j = 0;
  while (i < dev.length && j < cre.length) {
    const v = Math.min(dev[i].v, cre[j].v);
    saida.push({ debito: dev[i].k, credito: cre[j].k, centavos: v });
    dev[i].v -= v; cre[j].v -= v;
    if (!dev[i].v) i++;
    if (!cre[j].v) j++;
  }
  if (i < dev.length || j < cre.length) throw new Error("O histórico não fecha débito com crédito; o saldo não pode ser transportado.");
  return saida;
}

const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

/** Partidas de transporte (no documento) do que está no histórico até o corte. */
export function partidasDeTransporte(acc: AcumuladorHistorico, contas: ContaPlano[], corte: string): LancamentoContabil[] {
  if (!RE_COMP.test(corte)) throw new Error("Corte do histórico inválido.");
  if (acc.ladosForaDaAbertura.length) {
    const x = acc.ladosForaDaAbertura[0];
    throw new Error(`A conta ${x.conta} tem saldo inicial informado depois de lançamentos que ficariam no histórico (ex.: ${x.data.split("-").reverse().join("/")}). Confira o saldo inicial no Plano de Contas antes de guardar esses exercícios.`);
  }
  const nome = new Map(contas.map((c) => [c.codigo, c.descricao]));
  const data = ultimoDiaDaCompetencia(corte);
  const saida: LancamentoContabil[] = [];
  for (const [tipo, mapa] of [["s", acc.normal], ["e", acc.encerramento]] as const) {
    const limpo = new Map([...mapa].filter(([, v]) => v !== 0));
    let n = 0;
    for (const p of parear(limpo)) {
      const l: LancamentoContabil = {
        id: `${PREFIXO_TRANSPORTE}${corte}-${tipo}-${++n}`, data, competencia: corte,
        contaDebitoCodigo: p.debito, contaDebitoNome: nome.get(p.debito) || p.debito,
        contaCreditoCodigo: p.credito, contaCreditoNome: nome.get(p.credito) || p.credito,
        valor: p.centavos / 100,
        historico: tipo === "e" ? `Saldo transportado do histórico guardado (encerramentos até ${mesAno(corte)})` : `Saldo transportado do histórico guardado (até ${mesAno(corte)})`,
        origem: "Cadastro", documentoRef: `HISTORICO:${corte}`, transporteHistorico: true,
      };
      if (tipo === "e") l.tipoEspecial = "encerramento";
      saida.push(l);
    }
  }
  return saida;
}

/** Saldo de cada conta pelas partidas de transporte (para conferir com o histórico). */
export function saldosDoTransporte(lancamentos: Array<Partial<LancamentoContabil>>): { normal: Map<string, number>; encerramento: Map<string, number> } {
  const normal = new Map<string, number>(); const encerramento = new Map<string, number>();
  for (const l of lancamentos) {
    if (!ehTransporteHistorico(l as LancamentoContabil)) continue;
    const c = converterCentavos(l.valor) ?? 0;
    const m = l.tipoEspecial === "encerramento" ? encerramento : normal;
    m.set(String(l.contaDebitoCodigo), (m.get(String(l.contaDebitoCodigo)) || 0) + c);
    m.set(String(l.contaCreditoCodigo), (m.get(String(l.contaCreditoCodigo)) || 0) - c);
  }
  for (const m of [normal, encerramento]) for (const [k, v] of m) if (!v) m.delete(k);
  return { normal, encerramento };
}

export function mapasIguais(a: Map<string, number>, b: Map<string, number>): Array<{ conta: string; esperado: number; atual: number }> {
  const dif: Array<{ conta: string; esperado: number; atual: number }> = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) || 0) !== (b.get(k) || 0)) dif.push({ conta: k, esperado: a.get(k) || 0, atual: b.get(k) || 0 });
  return dif.sort((x, y) => x.conta.localeCompare(y.conta));
}

/** Limites do documento da empresa (o resto fica no histórico guardado). */
export const LIMITES_DOCUMENTO = {
  /** Até aqui a empresa fica inteira no documento, como sempre foi (nada muda para quem já cabia). */
  lancamentosSemHistorico: 20000,
  bytesSemHistorico: 3_900_000,
  /** Teto do documento (validação do servidor). */
  lancamentos: 40000,
  bytes: 12_000_000,
  /** Com histórico guardado, os exercícios em aberto ficam até aqui (folga para o dia a dia). */
  lancamentosAlvo: 25000,
  bytesAlvo: 8_000_000,
} as const;

/**
 * Escolhe o corte (fim de exercício) para uma empresa que não cabe inteira no documento (quem chama já conferiu): fica no
 * documento o ano atual e o anterior quando cabem com folga; senão, só o ano atual. Devolve null quando esses anos já são todos
 * os anos da empresa (nada vai para o histórico) e { erro } quando nem o ano atual cabe no teto do documento.
 */
export function escolherCorte(porAno: Map<number, { quantidade: number; bytes: number }>, anoAtual: number, extraDocumento = { quantidade: 0, bytes: 0 }): { corte: string } | { erro: string } | null {
  const desde = (ano: number) => { let q = extraDocumento.quantidade; let b = extraDocumento.bytes; for (const [a, v] of porAno) if (a >= ano) { q += v.quantidade; b += v.bytes; } return { q, b }; };
  const anos = [...porAno.keys()].filter((a) => a > 0); // ano 0 = linhas sem data (não entram)
  const menor = anos.length ? Math.min(...anos) : anoAtual;
  for (const ano of [anoAtual - 1, anoAtual]) {
    const { q, b } = desde(ano);
    if (q <= LIMITES_DOCUMENTO.lancamentosAlvo && b <= LIMITES_DOCUMENTO.bytesAlvo) return ano <= menor ? null : { corte: `${ano - 1}-12` };
  }
  const { q, b } = desde(anoAtual);
  if (q <= LIMITES_DOCUMENTO.lancamentos && b <= LIMITES_DOCUMENTO.bytes) return { corte: `${anoAtual - 1}-12` };
  return { erro: `Só o exercício de ${anoAtual} já tem ${q} lançamentos (${(b / 1e6).toFixed(1)} MB) e passa do que o documento da empresa guarda (${LIMITES_DOCUMENTO.lancamentos} lançamentos ou ${LIMITES_DOCUMENTO.bytes / 1e6} MB).` };
}

/** Tamanho em bytes de um lançamento no documento (para dividir sem montar o documento inteiro). */
export function bytesDoLancamento(l: unknown): number {
  return new TextEncoder().encode(JSON.stringify(l)).length + 1;
}
