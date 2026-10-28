// Apuração trimestral e estimativa mensal do Lucro Real a partir da contabilidade, para a Agente (voz) e o robô.
// É uma estimativa: sem adições, exclusões, compensação inicial de prejuízo, incentivos e retenções (o contador informa na tela da ECF).
import { calcularEstimativaMensal, calcularLucroRealTrimestral } from '../services/ecfRealPeriodosService';
import { gerarRelatoriosContabeis } from '../utils/livrosContabeis';
import { grupoDemonstracao } from '../utils/analiseContabil';

export function apuracaoPeriodosRealWorkspace(payload: Record<string, any>, ano: number, tipo: 'trimestral' | 'estimativa', atividade: 'comercio' | 'servicos') {
  const contas = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  if (!contas.length) return { erro: 'Plano de contas vazio.' };
  const validos = gerarRelatoriosContabeis(contas, lancamentos, 'todos').validos.filter((l) => l.dataISO.slice(0, 4) === String(ano));
  const receitaMes = Array(12).fill(0);
  const tri = [0, 1, 2, 3].map(() => ({ resultado: 0, irpj: 0, csll: 0 }));
  for (const l of validos) {
    const mes = Number(l.dataISO.slice(5, 7)) - 1, q = Math.floor(mes / 3);
    for (const [conta, sinal] of [[l.credito, 1], [l.debito, -1]] as const) {
      const g = grupoDemonstracao(conta, contas);
      if (g !== 'receita' && g !== 'despesa') continue;
      const v = sinal * l.valorCentavos;
      tri[q].resultado += v;
      if (g === 'receita') receitaMes[mes] += v;
      else {
        const nome = (conta.descricao || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        if (/\birpj\b|imposto\s+de\s+renda/.test(nome)) tri[q].irpj -= v;
        else if (/\bcsll\b|contribuicao\s+social/.test(nome)) tri[q].csll -= v;
      }
    }
  }
  const regime = payload?.empresa?.regime || null;
  if (tipo === 'trimestral') {
    const itens = (['T01', 'T02', 'T03', 'T04'] as const).map((p, i) => ({ p, d: tri[i] })).filter((x) => x.d.resultado !== 0 || x.d.irpj !== 0).map((x) => ({
      periodo: x.p, resultadoContabil: x.d.resultado / 100, irpjContabilizado: x.d.irpj / 100, csllContabilizada: x.d.csll / 100,
      adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [],
    }));
    const r = calcularLucroRealTrimestral({ anoCalendario: ano, indAliquotaCsll: '1', saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0 }, itens);
    return {
      ano, regime, tipo,
      trimestres: r.map((x) => ({ periodo: x.periodo, baseIrpj: x.baseIrpj, irpj: x.irpjAPagar, baseCsll: x.baseCsll, csll: x.csllAPagar })),
      observacao: 'Estimativa a partir do resultado contábil, sem adições, exclusões, saldo de prejuízo anterior, incentivos e retenções; CSLL a 9%. IRPJ/CSLL já contabilizados voltam ao lucro antes do imposto. O valor final sai do painel ECF Lucro Real.',
    };
  }
  const meses = receitaMes.map((c, i) => ({ c, i })).filter((x) => x.c > 0).map((x) => {
    const rec = x.c / 100;
    return {
      mes: x.i + 1, modo: 'E' as const,
      receita: atividade === 'servicos'
        ? { irpj: { p16: 0, p8: 0, p16b: 0, p32: rec, p384: 0 }, csll: { p12: 0, p32: rec, p384: 0 } }
        : { irpj: { p16: 0, p8: rec, p16b: 0, p32: 0, p384: 0 }, csll: { p12: rec, p32: 0, p384: 0 } },
    };
  });
  const r = calcularEstimativaMensal({ anoCalendario: ano, indAliquotaCsll: '1' }, meses);
  return {
    ano, regime, tipo, atividade,
    meses: r.map((x) => ({ mes: x.mes, baseIrpj: x.baseIrpj, irpj: x.irpjDevido, baseCsll: x.baseCsll, csll: x.csllDevida })),
    observacao: 'Estimativa pela receita bruta das contas de receita da contabilidade, sem retenções, acréscimos e atividades mistas; CSLL a 9%. O valor final sai do painel ECF Lucro Real (estimativa mensal).',
  };
}
