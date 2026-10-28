// Estimativa do IRPJ/CSLL do Lucro Real anual a partir da contabilidade, para o robô e para a Agente (voz).
// É uma estimativa: parte do resultado contábil e NÃO inclui adições, exclusões, compensação de prejuízo nem
// incentivos, que o contador informa na tela da ECF (Livros → ECF Lucro Real).
import { calcularLucroRealAnual } from '../services/ecfRealService';
import { gerarRelatoriosContabeis } from '../utils/livrosContabeis';
import { grupoDemonstracao } from '../utils/analiseContabil';

export function estimarLucroRealWorkspace(payload: Record<string, any>, ano: number) {
  const empresa = payload?.empresa || {};
  const contas = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  if (!contas.length) return { erro: 'Plano de contas vazio.' };
  const validos = gerarRelatoriosContabeis(contas, lancamentos, 'todos').validos.filter((l) => l.dataISO.slice(0, 4) === String(ano));
  let resultado = 0, irpj = 0, csll = 0;
  for (const l of validos) {
    for (const [conta, sinal] of [[l.credito, 1], [l.debito, -1]] as const) {
      const g = grupoDemonstracao(conta, contas);
      if (g !== 'receita' && g !== 'despesa') continue;
      const v = sinal * l.valorCentavos;
      resultado += v;
      if (g === 'despesa') {
        const nome = (conta.descricao || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        if (/\birpj\b|imposto\s+de\s+renda/.test(nome)) irpj -= v;
        else if (/\bcsll\b|contribuicao\s+social/.test(nome)) csll -= v;
      }
    }
  }
  const r = calcularLucroRealAnual({
    anoCalendario: ano, resultadoContabil: resultado / 100, irpjContabilizado: irpj / 100, csllContabilizada: csll / 100,
    adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [], saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0, indAliquotaCsll: '1',
  });
  return {
    ano, regime: empresa.regime || null,
    resultadoContabil: resultado / 100, irpjJaContabilizado: irpj / 100, csllJaContabilizada: csll / 100,
    baseIrpj: r.baseIrpj, irpjEstimado: r.irpjAPagar, baseCsll: r.baseCsll, csllEstimada: r.csllAPagar,
    observacao: 'Estimativa sem adições, exclusões, compensação de prejuízos, incentivos, retenções e estimativas já pagas; CSLL a 9%. O valor final sai da tela ECF Lucro Real, preenchida pelo contador.',
  };
}
