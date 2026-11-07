/**
 * Balanço e DRE montados pelo plano de contas referencial da Receita (as mesmas tabelas L100A/L300A da ECF),
 * a partir do balancete dos lançamentos definitivos e do vínculo conta → conta referencial que o contador grava na ECD.
 *
 * Diferente da demonstração gerencial (que adivinha o grupo pela descrição da conta), aqui o grupo vem do próprio
 * vínculo: a conta referencial diz se é Ativo (natureza 01), Passivo (02), Patrimônio Líquido (03) ou Resultado (04).
 * Conta com movimento ou saldo e sem vínculo válido NÃO é inferida: vai para a lista de pendências e o resultado diz
 * que a demonstração está incompleta.
 *
 * Convenção de sinais (centavos): `saldo` = débito − crédito. `apresentado` é o valor como aparece na demonstração:
 * Ativo = saldo; Passivo e PL = −saldo (saldo credor positivo); Resultado = −saldo (receita positiva, custo/despesa negativa).
 */
import type { ContaPlano } from "../types";
import type { LinhaBalanceteContabil } from "./livrosContabeis";
import { contasReferenciais, type ContaReferencial, type RegimeReferencial } from "../services/planoReferencialService";

export interface LinhaDemonstracaoReferencial {
  codigo: string;
  descricao: string;
  tipo: "S" | "A";
  nivel: number;
  superior: string;
  natureza: "01" | "02" | "03" | "04";
  /** débito − crédito, em centavos. */
  saldo: number;
  /** Valor como se apresenta (ver convenção no topo do arquivo). */
  apresentado: number;
}

export interface PendenciaReferencial {
  contaCodigo: string;
  descricao: string;
  motivo: "sem-vinculo" | "vinculo-inexistente" | "vinculo-sintetico";
  /** Movimento do período (DRE) ou saldo (Balanço) que ficou de fora, débito − crédito. */
  saldo: number;
  referencial?: string;
}

export interface DemonstracoesReferenciais {
  balanco: LinhaDemonstracaoReferencial[];
  dre: LinhaDemonstracaoReferencial[];
  pendencias: PendenciaReferencial[];
  totais: {
    ativo: number;
    passivo: number;
    patrimonioLiquido: number;
    /** Resultado do período pela DRE: receitas menos custos e despesas. */
    resultadoPeriodo: number;
    /** Saldo acumulado das contas de resultado ainda não encerradas (crédito positivo). */
    resultadoNaoEncerrado: number;
    /** Ativo − Passivo − PL − resultado não encerrado; deve ser 0 quando tudo está vinculado e o balancete fecha. */
    diferenca: number;
  };
  /** true quando não há pendência e a diferença é zero. */
  completo: boolean;
  avisos: string[];
}

function nivelDe(codigo: string, porCodigo: Map<string, ContaReferencial>): number {
  let n = 1, atual = porCodigo.get(codigo);
  while (atual && atual.superior && porCodigo.has(atual.superior)) { n++; atual = porCodigo.get(atual.superior); }
  return n;
}

const naturezaDe = (c: ContaReferencial): "01" | "02" | "03" | "04" => c.natureza.padStart(2, "0") as "01" | "02" | "03" | "04";

export function demonstracoesPorReferencial(p: {
  regime: RegimeReferencial;
  balancete: LinhaBalanceteContabil[];
  mapa: Record<string, string>;
}): DemonstracoesReferenciais {
  const patrimonial = contasReferenciais(p.regime, "patrimonial");
  const resultado = contasReferenciais(p.regime, "resultado");
  const patPorCodigo = new Map(patrimonial.map((c) => [c.codigo, c]));
  const resPorCodigo = new Map(resultado.map((c) => [c.codigo, c]));

  const somaBal = new Map<string, number>();
  const somaDre = new Map<string, number>();
  const pendencias: PendenciaReferencial[] = [];
  let resultadoNaoEncerradoSaldo = 0;

  const acumular = (soma: Map<string, number>, tabela: Map<string, ContaReferencial>, folha: ContaReferencial, valor: number) => {
    let atual: ContaReferencial | undefined = folha;
    while (atual) {
      soma.set(atual.codigo, (soma.get(atual.codigo) || 0) + valor);
      atual = atual.superior ? tabela.get(atual.superior) : undefined;
    }
  };

  for (const item of p.balancete) {
    if (item.conta.tipo !== "analitica") continue;
    const saldo = item.saldoDevedorCentavos - item.saldoCredorCentavos;
    const movimento = item.debitoPeriodoCentavos - item.creditoPeriodoCentavos;
    const temAlgo = saldo !== 0 || movimento !== 0 || item.debitoPeriodoCentavos !== 0 || item.creditoPeriodoCentavos !== 0;
    if (!temAlgo) continue;
    const ref = p.mapa[item.conta.codigo];
    const descricao = item.conta.descricao || "Nome não informado";
    if (!ref) { pendencias.push({ contaCodigo: item.conta.codigo, descricao, motivo: "sem-vinculo", saldo: saldo !== 0 ? saldo : movimento }); continue; }
    const noPat = patPorCodigo.get(ref);
    const noRes = resPorCodigo.get(ref);
    const alvo = noPat || noRes;
    if (!alvo) { pendencias.push({ contaCodigo: item.conta.codigo, descricao, motivo: "vinculo-inexistente", saldo: saldo !== 0 ? saldo : movimento, referencial: ref }); continue; }
    if (alvo.tipo !== "A") { pendencias.push({ contaCodigo: item.conta.codigo, descricao, motivo: "vinculo-sintetico", saldo: saldo !== 0 ? saldo : movimento, referencial: ref }); continue; }
    if (noPat) {
      acumular(somaBal, patPorCodigo, noPat, saldo);
    } else if (noRes) {
      acumular(somaDre, resPorCodigo, noRes, movimento);
      resultadoNaoEncerradoSaldo += saldo;
    }
  }

  const montar = (tabela: ContaReferencial[], porCodigo: Map<string, ContaReferencial>, soma: Map<string, number>): LinhaDemonstracaoReferencial[] =>
    tabela.filter((c) => (soma.get(c.codigo) || 0) !== 0).map((c) => {
      const nat = naturezaDe(c);
      const saldo = soma.get(c.codigo)!;
      return { codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, nivel: nivelDe(c.codigo, porCodigo), superior: c.superior, natureza: nat, saldo, apresentado: nat === "01" ? saldo : -saldo };
    });

  const balanco = montar(patrimonial, patPorCodigo, somaBal);
  const dre = montar(resultado, resPorCodigo, somaDre);

  // Soma só das analíticas: as sintéticas repetem o valor das filhas.
  const analiticas = balanco.filter((l) => l.tipo === "A");
  const porNat = (nat: string) => analiticas.filter((l) => l.natureza === nat).reduce((a, l) => a + l.apresentado, 0);
  const ativo = porNat("01");
  const passivo = porNat("02");
  const patrimonioLiquido = porNat("03");
  const resultadoPeriodo = dre.filter((l) => l.tipo === "A").reduce((a, l) => a + l.apresentado, 0);
  const resultadoNaoEncerrado = -resultadoNaoEncerradoSaldo;
  const diferenca = ativo - passivo - patrimonioLiquido - resultadoNaoEncerrado;

  const avisos: string[] = [];
  if (pendencias.length) avisos.push(`${pendencias.length} conta(s) com movimento ou saldo sem vínculo válido com o plano referencial ficaram fora das demonstrações.`);
  if (diferenca !== 0) avisos.push(`Ativo − Passivo − PL − resultado ainda não encerrado = ${(diferenca / 100).toFixed(2)}: o balancete não fecha com as contas vinculadas.`);
  if (resultadoNaoEncerrado !== 0) avisos.push("Contas de resultado ainda não foram encerradas contra o Patrimônio Líquido; o Balanço mostra o saldo antes do encerramento.");

  return {
    balanco, dre, pendencias,
    totais: { ativo, passivo, patrimonioLiquido, resultadoPeriodo, resultadoNaoEncerrado, diferenca },
    completo: pendencias.length === 0 && diferenca === 0,
    avisos,
  };
}

/** Resumo em uma frase para mostrar ao contador e ao agente. */
export function resumoDemonstracoesReferenciais(d: DemonstracoesReferenciais): string {
  const r = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const base = `Ativo ${r(d.totais.ativo)} · Passivo ${r(d.totais.passivo)} · PL ${r(d.totais.patrimonioLiquido)} · resultado do período ${r(d.totais.resultadoPeriodo)}`;
  return d.completo ? `${base}. Fecha sem diferença.` : `${base}. Incompleto: ${d.avisos.join(" ")}`;
}

/** Contas que o contador precisa vincular para a demonstração ficar completa. */
export function contasParaVincular(d: DemonstracoesReferenciais, contas: ContaPlano[]): ContaPlano[] {
  const falta = new Set(d.pendencias.map((x) => x.contaCodigo));
  return contas.filter((c) => falta.has(c.codigo));
}
