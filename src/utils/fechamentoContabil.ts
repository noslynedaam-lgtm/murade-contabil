import type { ContaPlano, LancamentoContabil, PreLancamentoContabil } from "../types";
import { gerarRelatoriosContabeis, normalizarDataContabil } from "./livrosContabeis";
import { grupoDemonstracao } from "./analiseContabil";
import { totalQuotasDoMes, type BemImobilizado } from "./imobilizado";

export type ItemFechamento = { id: string; titulo: string; tipo: "automatico" | "manual"; ok: boolean; bloqueia: boolean; detalhe: string };
export const CONFIRMACOES_MANUAIS = [
  { id: "banco", titulo: "Banco conciliado", detalhe: "Confirme que o extrato do mês foi conferido com os lançamentos (use a conciliação desta tela)." },
  { id: "pagar_receber", titulo: "Contas a pagar e a receber conciliadas", detalhe: "Confirme a conferência feita no financeiro (se a empresa não usa os Títulos a pagar e receber do sistema)." },
  { id: "folha", titulo: "Folha integrada", detalhe: "Confirme que os resumos do DP da competência foram conferidos e contabilizados." },
  { id: "impostos", titulo: "Impostos calculados", detalhe: "Confirme que a apuração dos impostos do mês foi feita e lançada." },
] as const;

/** Título a pagar/receber no formato mínimo que o fechamento precisa (o mesmo de GET /api/workspaces/:cnpj/titulos). */
export type TituloFechamento = { id: string; tipo: "pagar" | "receber"; numero?: string; participanteNome?: string; vencimento?: string; valorCentavos: number; baixas?: Array<{ valorCentavos: number }>; provisoes?: unknown[] };

const ultimoDiaCompetencia = (competencia: string) => {
  const [a, m] = competencia.split("-").map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** Títulos vencidos até o fim da competência, ainda sem baixa total e sem provisão: o que falta conferir no a pagar/receber. */
export function titulosPendentesNoFechamento(titulos: TituloFechamento[], competencia: string): TituloFechamento[] {
  const fim = ultimoDiaCompetencia(competencia);
  return titulos.filter((t) => {
    const pago = (t.baixas || []).reduce((s, b) => s + (Number(b.valorCentavos) || 0), 0);
    return !!t.vencimento && t.vencimento <= fim && pago < t.valorCentavos && !(t.provisoes || []).length;
  });
}

export const referenciaDepreciacao = (competencia: string) => `DEPREC:${competencia}`;

export function conferirFechamento(p: {
  competencia: string; contas: ContaPlano[]; lancamentos: LancamentoContabil[]; preLancamentos: PreLancamentoContabil[]; bens: BemImobilizado[]; confirmacoes: Record<string, boolean>;
  /** Títulos a pagar e receber da empresa: com eles, a conferência do a pagar/receber é automática. */
  titulos?: TituloFechamento[] | null;
}): { itens: ItemFechamento[]; podeFechar: boolean } {
  const { competencia, contas, lancamentos, preLancamentos, bens, confirmacoes, titulos } = p;
  const itens: ItemFechamento[] = [];
  const rel = gerarRelatoriosContabeis(contas, lancamentos, competencia);
  const diferenca = rel.totalSaldoDevedorCentavos - rel.totalSaldoCredorCentavos;
  const doMes = rel.doPeriodo.length;
  itens.push({ id: "movimento", titulo: "Há lançamentos válidos na competência", tipo: "automatico", ok: doMes > 0, bloqueia: true, detalhe: doMes ? `${doMes} lançamento(s) válido(s).` : "Nenhum lançamento válido neste mês." });
  itens.push({ id: "invalidos", titulo: "Sem lançamentos inválidos", tipo: "automatico", ok: rel.invalidos.length === 0, bloqueia: true, detalhe: rel.invalidos.length ? `${rel.invalidos.length} lançamento(s) com data, valor, histórico ou conta inválidos.` : "Nenhum lançamento inválido." });
  itens.push({ id: "partidas", titulo: "Débitos e créditos fecham", tipo: "automatico", ok: diferenca === 0 && rel.totalDebitosCentavos === rel.totalCreditosCentavos, bloqueia: true, detalhe: diferenca === 0 ? "Sem diferença entre saldos devedores e credores." : `Diferença de ${(diferenca / 100).toFixed(2)} no balancete.` });
  itens.push({ id: "saldos", titulo: "Saldos iniciais com competência-base", tipo: "automatico", ok: rel.saldosIniciaisPendentes.length === 0, bloqueia: true, detalhe: rel.saldosIniciaisPendentes.length ? `${rel.saldosIniciaisPendentes.length} conta(s) com saldo inicial sem competência-base.` : "Nenhuma pendência." });
  const pendAprov = lancamentos.filter((l) => l.statusManual === "pendente_aprovacao" && normalizarDataContabil(l.data)?.slice(0, 7) === competencia).length;
  itens.push({ id: "aprovacao", titulo: "Sem lançamentos aguardando aprovação", tipo: "automatico", ok: pendAprov === 0, bloqueia: true, detalhe: pendAprov ? `${pendAprov} lançamento(s) pendente(s) de aprovação neste mês.` : "Nenhum pendente." });
  const pendPre = preLancamentos.filter((l) => l.status === "pendente_conferencia" && l.competencia === competencia).length;
  itens.push({ id: "prelancamentos", titulo: "Rascunhos do Fiscal e do DP conferidos", tipo: "automatico", ok: pendPre === 0, bloqueia: true, detalhe: pendPre ? `${pendPre} rascunho(s) aguardando conferência.` : "Nenhum rascunho pendente." });
  const quotas = totalQuotasDoMes(bens, competencia);
  if (quotas.total > 0) {
    const ref = referenciaDepreciacao(competencia);
    const lancada = lancamentos.some((l) => l.documentoRef === ref && l.statusManual !== "rejeitado");
    itens.push({ id: "depreciacao", titulo: "Depreciação do mês lançada", tipo: "automatico", ok: lancada, bloqueia: true, detalhe: lancada ? "Lançamento de depreciação encontrado." : `Há ${quotas.itens.length} bem(ns) com depreciação no mês e nenhum lançamento correspondente.` });
  }
  const foraDaClassificacao = rel.balancete.filter((b) => b.conta.tipo === "analitica" && grupoDemonstracao(b.conta, contas) === null && (b.debitoPeriodoCentavos || b.creditoPeriodoCentavos)).length;
  itens.push({ id: "classificacao", titulo: "Contas movimentadas classificadas nas demonstrações", tipo: "automatico", ok: foraDaClassificacao === 0, bloqueia: false, detalhe: foraDaClassificacao ? `${foraDaClassificacao} conta(s) ficam fora da DRE/Balanço gerenciais (aviso, não impede o fechamento).` : "Todas classificadas." });
  // A pagar/receber: com títulos cadastrados, confere sozinho (vencidos sem baixa nem provisão); a confirmação manual
  // continua como opção (vale como "conferi no financeiro") e deixa de ser obrigatória quando a conferência automática passa.
  const usaTitulos = Array.isArray(titulos) && titulos.length > 0;
  if (usaTitulos) {
    const pend = titulosPendentesNoFechamento(titulos!, competencia);
    const exemplos = pend.slice(0, 3).map((t) => `${t.tipo === "pagar" ? "pagar" : "receber"} ${t.numero || ""} ${t.participanteNome || ""}`.replace(/\s+/g, " ").trim()).join("; ");
    itens.push({ id: "titulos", titulo: "Títulos a pagar e receber em dia", tipo: "automatico", ok: pend.length === 0 || confirmacoes.pagar_receber === true, bloqueia: true,
      detalhe: pend.length ? `${pend.length} título(s) vencido(s) até o fim do mês sem baixa nem provisão${exemplos ? ` (${exemplos}${pend.length > 3 ? "…" : ""})` : ""}. Dê a baixa ou a provisão em Títulos a pagar e receber, ou confirme abaixo a conferência no financeiro.` : "Nenhum título vencido sem baixa ou provisão." });
  }
  for (const c of CONFIRMACOES_MANUAIS) {
    const opcional = c.id === "pagar_receber" && usaTitulos;
    itens.push({ id: c.id, titulo: opcional ? `${c.titulo} (opcional)` : c.titulo, tipo: "manual", ok: confirmacoes[c.id] === true || opcional, bloqueia: !opcional, detalhe: opcional ? "Opcional: marque se conferiu no financeiro (vale também para liberar títulos pendentes acima)." : c.detalhe });
  }
  return { itens, podeFechar: itens.every((i) => !i.bloqueia || i.ok) };
}
