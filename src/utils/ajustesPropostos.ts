// Ajuste proposto ao contador ("Quer que eu ajuste?"): um só jeito de montar, lançar, achar e desfazer (estorno) o
// lançamento de ajuste, usado pela migração do sistema anterior e pelo fechamento (Diário, Razão, balancete, Balanço/DRE).
// Funções puras sobre uma cópia do workspace; quem grava é a rota (com a confirmação do contador, uma por vez).
import type { LancamentoContabil } from "../types";

export interface LancamentoProposto {
  data: string;            // AAAA-MM-DD
  competencia: string;     // AAAA-MM
  contaDebito: string;
  contaCredito: string;
  valorCentavos: number;
  historico: string;
  /** Partida de encerramento do exercício (fica fora da DRE). */
  encerramento?: boolean;
}

const reaisTexto = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Texto da pergunta mostrada na tela e lida pela Agente IA. */
export function perguntaAjuste(p: LancamentoProposto, causa: string): string {
  return `Quer que eu ajuste? Diferença de ${reaisTexto(p.valorCentavos)} em ${p.competencia.slice(5, 7)}/${p.competencia.slice(0, 4)}, causa: ${causa}. Vou lançar: D ${p.contaDebito} / C ${p.contaCredito}, histórico: "${p.historico}".`;
}

/** O ajuste com esta referência já foi lançado (e não foi estornado)? */
export function ajusteLancado(lancamentos: LancamentoContabil[], referencia: string): LancamentoContabil | undefined {
  const l = lancamentos.find((x) => String(x?.documentoRef || "") === referencia && !x.estornoDe);
  return l && !lancamentos.some((x) => x?.estornoDe === l.id) ? l : undefined;
}

/** Lança o ajuste (o "Sim" do contador é a aprovação; o nome dele fica no histórico). */
export function lancarAjuste(payload: Record<string, any>, referencia: string, p: LancamentoProposto, quem: string, agora = new Date()): Record<string, any> {
  const lancamentos: LancamentoContabil[] = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
  if (ajusteLancado(lancamentos, referencia)) throw new Error("Este ajuste já foi lançado.");
  if (!(p.valorCentavos > 0) || !Number.isSafeInteger(p.valorCentavos)) throw new Error("Valor do ajuste inválido.");
  if (p.contaDebito === p.contaCredito) throw new Error("O ajuste precisa de duas contas diferentes.");
  const contas: any[] = Array.isArray(payload.contas) ? payload.contas : [];
  const conta = (c: string) => contas.find((x) => x.codigo === c);
  for (const c of [p.contaDebito, p.contaCredito]) if (conta(c)?.tipo !== "analitica") throw new Error(`A conta ${c} não é analítica ou não existe mais no plano.`);
  const novo: LancamentoContabil = {
    id: `AJ-${p.competencia}-${agora.getTime()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 64), data: p.data, competencia: p.competencia,
    contaDebitoCodigo: p.contaDebito, contaDebitoNome: conta(p.contaDebito).descricao, contaCreditoCodigo: p.contaCredito, contaCreditoNome: conta(p.contaCredito).descricao,
    valor: p.valorCentavos / 100, historico: `${p.historico} — confirmado por ${quem}`.slice(0, 240), origem: "Manual", documentoRef: referencia, statusManual: "aprovado",
  };
  if (p.encerramento) novo.tipoEspecial = "encerramento";
  return { ...payload, lancamentos: [...lancamentos, novo] };
}

/** Desfaz por estorno (partida invertida, mesma data); o lançamento original continua no Diário. */
export function estornarAjuste(payload: Record<string, any>, referencia: string): Record<string, any> {
  const lancamentos: LancamentoContabil[] = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
  const l = ajusteLancado(lancamentos, referencia);
  if (!l) throw new Error("Não há ajuste lançado para desfazer.");
  const estorno: LancamentoContabil = {
    ...l, id: `EST-${l.id}`.slice(0, 64), contaDebitoCodigo: l.contaCreditoCodigo, contaDebitoNome: l.contaCreditoNome, contaCreditoCodigo: l.contaDebitoCodigo, contaCreditoNome: l.contaDebitoNome,
    historico: `Estorno: ${l.historico}`.slice(0, 240), estornoDe: l.id, documentoRef: `${referencia}:ESTORNO`,
  };
  return { ...payload, lancamentos: [...lancamentos, estorno] };
}
