// Situação do limite de R$ 1.250.000 por trimestre da LC 224/25 (Lucro Presumido), a partir da receita da contabilidade.
import { situacaoLimiteLc224 } from '../services/ecfPresumidoService';
import { gerarRelatoriosContabeis } from '../utils/livrosContabeis';
import { grupoDemonstracao } from '../utils/analiseContabil';

export function limiteLc224Workspace(payload: Record<string, any>, ano: number) {
  const contas = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  if (!contas.length) return { erro: 'Plano de contas vazio.' };
  const tri = [0, 0, 0, 0];
  for (const l of gerarRelatoriosContabeis(contas, lancamentos, 'todos').validos) {
    if (l.dataISO.slice(0, 4) !== String(ano)) continue;
    const q = Math.floor((Number(l.dataISO.slice(5, 7)) - 1) / 3);
    for (const [conta, sinal] of [[l.credito, 1], [l.debito, -1]] as const) {
      if (grupoDemonstracao(conta, contas) === 'receita') tri[q] += sinal * l.valorCentavos;
    }
  }
  const comMovimento = tri.map((v) => v > 0);
  const sit = situacaoLimiteLc224(tri.map((v, i) => (comMovimento[i] ? v / 100 : (undefined as unknown as number))));
  return {
    ano, ...sit,
    aplicavel: ano >= 2026,
    observacao: 'Considera como receita todas as contas de receita da contabilidade (inclui receitas que não entram na base da presunção). Vale para Lucro Presumido a partir de 2026; o adicional sai da tela ECF Lucro Presumido.',
  };
}
