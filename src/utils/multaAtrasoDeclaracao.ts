// Multa por ATRASO NA ENTREGA de declaração (MAED e equivalentes) — cálculo puro, em centavos inteiros. ESTIMATIVA: o valor oficial
// vem na notificação da Receita (caixa postal do e-CAC / Portal do Simples Nacional). Mesmo arquivo nos três sistemas (Fiscal, Contábil
// e DP): mudou aqui, mude lá.
//
// REGRAS OFICIAIS CONFERIDAS EM 23/11/2026 (só estas são calculadas; o resto devolve "sem regra conferida" e nada é chutado):
//  - PGDAS-D: LC 123/2006, art. 38-A (planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm): 2% ao mês-calendário ou fração sobre o montante
//    dos tributos decorrentes das informações prestadas, ainda que pagos, limitada a 20%; mínimo de R$ 50,00 por mês de referência
//    (§ 2º); conta do dia seguinte ao fim do prazo até a entrega (inciso I); reduzida à metade se entregue antes de procedimento de
//    ofício (§ 3º, I).
//  - DEFIS e DASN-SIMEI: LC 123/2006, art. 38 (declaração do art. 25): 2% ao mês-calendário ou fração sobre os tributos informados,
//    limitada a 20%; mínimo de R$ 200,00 (§ 3º) e, para o MEI, R$ 50,00 (§ 6º); metade se entregue antes de procedimento de ofício.
//  - DCTFWeb: Receita Federal, Manual da DCTFWeb (atualização de janeiro/2025), itens 5.1 a 5.4, e Lei 10.426/2002, art. 7º: 2% ao
//    mês-calendário ou fração sobre as contribuições informadas, ainda que pagas, limitada a 20%; mínimo de R$ 200,00 sem fato gerador
//    e R$ 500,00 nos demais casos; a multa mínima é reduzida em 90% para o MEI e em 50% para ME/EPP do Simples (LC 123/2006, art. 38-B);
//    redução de 50% na entrega antes de procedimento de ofício.
//  - ECF do Lucro Real: IN RFB 2.004/2021, art. 6º, I, e Decreto-Lei 1.598/1977, art. 8º-A (incluído pela Lei 12.973/2014): 0,25% por
//    mês-calendário ou fração do lucro líquido antes do IRPJ e da CSLL, limitada a 10%; teto de R$ 100.000,00 (receita bruta do ano
//    anterior até R$ 3.600.000,00) ou R$ 5.000.000,00 (demais); redução de 90% até 30 dias, 75% até 60 dias e 50% depois, se antes de
//    procedimento de ofício (§ 2º). Sem lucro líquido no período, a lei manda usar o último lucro informado corrigido pela Selic (§ 4º):
//    o sistema não tem esse dado e não calcula.
//  - ECF das demais pessoas jurídicas (Presumido, Arbitrado, imunes e isentas): IN RFB 2.004/2021, art. 6º, II. ECD: IN RFB 2.003/2021,
//    art. 11. As duas remetem à Lei 8.218/1991, art. 12, III (redação da Lei 13.670/2018): 0,02% por dia de atraso sobre a receita bruta
//    do período da escrituração, limitada a 1%; reduzida à metade antes de procedimento de ofício (parágrafo único, I).
//  - SEM REGRA CONFERIDA (não calcula): EFD-Contribuições (o Parecer Normativo RFB 3/2013 aponta o art. 57 da MP 2.158-35/2001, mas a Lei
//    13.670/2018 deu ao art. 12 da Lei 8.218/1991 regra própria para quem usa o SPED; a IN da EFD-Contribuições não foi conferida),
//    EFD ICMS/IPI (a multa do ICMS é estadual) e EFD-Reinf (dispositivo da multa não conferido).
//
// "Mês-calendário ou fração": cada mês do calendário tocado entre o dia seguinte ao prazo e a entrega conta como um mês inteiro
// (leitura literal da lei; a Receita não publica exemplo com prazo no meio do mês). Por isso o valor é uma estimativa e o texto manda
// conferir a notificação oficial.

export type DeclaracaoMulta = 'pgdasd' | 'defis' | 'dasn_simei' | 'dctfweb' | 'ecf_real' | 'ecf_demais' | 'ecd' | 'efd_contribuicoes' | 'efd_icms_ipi' | 'efd_reinf';
export type PorteMulta = 'mei' | 'me_epp_simples' | 'demais';

export interface EntradaMultaDeclaracao {
  tipo: DeclaracaoMulta;
  /** Último dia do prazo (já ajustado a dia útil), AAAA-MM-DD. */
  prazo: string;
  /** Dia da entrega; se ainda não entregue, o dia de hoje. AAAA-MM-DD. */
  entrega: string;
  /**
   * Base da multa, em centavos: PGDAS-D/DEFIS/DASN-SIMEI/DCTFWeb = tributos informados; ECF do Lucro Real = lucro líquido antes do
   * IRPJ e da CSLL; ECF das demais e ECD = receita bruta do período. null = o sistema não sabe.
   */
  baseCentavos: number | null;
  /** DCTFWeb sem fato gerador (mínimo de R$ 200,00). */
  semMovimento?: boolean;
  porte?: PorteMulta;
  /** ECF do Lucro Real: receita bruta do ano anterior (teto de R$ 100 mil ou R$ 5 milhões). */
  receitaBrutaAnoAnteriorCentavos?: number | null;
}

export type ResultadoMultaDeclaracao =
  | { calculada: true; tipo: DeclaracaoMulta; emDia: true; multaCentavos: 0; texto: string; fonte: string }
  | {
      calculada: true; tipo: DeclaracaoMulta; emDia: false;
      /** Multa cheia (sem nenhuma redução por entrega espontânea). */
      multaCentavos: number;
      /** Multa entregando hoje, antes de qualquer intimação (com a redução da lei). */
      multaEntregandoAgoraCentavos: number;
      meses: number; dias: number; aplicouMinimo: boolean; texto: string; fonte: string;
    }
  | { calculada: false; tipo: DeclaracaoMulta; motivo: string; regra: string | null; fonte: string | null };

export const FONTES_MULTA_DECLARACAO: Record<DeclaracaoMulta, string | null> = {
  pgdasd: 'LC 123/2006, art. 38-A, I e §§ 2º e 3º',
  defis: 'LC 123/2006, art. 38, I e §§ 2º e 3º',
  dasn_simei: 'LC 123/2006, art. 38, I e §§ 2º e 6º',
  dctfweb: 'Receita Federal — Manual da DCTFWeb (jan/2025), itens 5.1 a 5.4; Lei 10.426/2002, art. 7º; LC 123/2006, art. 38-B',
  ecf_real: 'IN RFB 2.004/2021, art. 6º, I; Decreto-Lei 1.598/1977, art. 8º-A (Lei 12.973/2014)',
  ecf_demais: 'IN RFB 2.004/2021, art. 6º, II; Lei 8.218/1991, art. 12, III e parágrafo único (Lei 13.670/2018)',
  ecd: 'IN RFB 2.003/2021, art. 11; Lei 8.218/1991, art. 12, III e parágrafo único (Lei 13.670/2018)',
  efd_contribuicoes: null, efd_icms_ipi: null, efd_reinf: null,
};
const NOMES: Record<DeclaracaoMulta, string> = {
  pgdasd: 'PGDAS-D', defis: 'DEFIS', dasn_simei: 'DASN-SIMEI', dctfweb: 'DCTFWeb', ecf_real: 'ECF', ecf_demais: 'ECF', ecd: 'ECD',
  efd_contribuicoes: 'EFD-Contribuições', efd_icms_ipi: 'EFD ICMS/IPI', efd_reinf: 'EFD-Reinf',
};

const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const ms = (s: string) => Date.parse(`${s}T00:00:00Z`);
const somarDia = (s: string) => new Date(ms(s) + 86_400_000).toISOString().slice(0, 10);
const idxMes = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
/** Dias de atraso (entrega − prazo). */
export const diasDeAtraso = (prazo: string, entrega: string) => Math.max(0, Math.round((ms(entrega) - ms(prazo)) / 86_400_000));
/** Meses-calendário (ou fração) do dia seguinte ao prazo até a entrega, contando cada mês tocado como inteiro. 0 se em dia. */
export function mesesCalendarioDeAtraso(prazo: string, entrega: string): number {
  if (entrega <= prazo) return 0;
  return idxMes(entrega) - idxMes(somarDia(prazo)) + 1;
}
/** round(a × num / den), meio para cima, sem ponto flutuante. */
const pct = (a: number, num: number, den: number) => Number((BigInt(a) * BigInt(num) * 2n + BigInt(den)) / (2n * BigInt(den)));
export const reaisMulta = (c: number) => `R$ ${Math.floor(c / 100).toLocaleString('pt-BR')},${String(c % 100).padStart(2, '0')}`;

export function estimarMultaDeclaracao(e: EntradaMultaDeclaracao): ResultadoMultaDeclaracao {
  const fonte = FONTES_MULTA_DECLARACAO[e.tipo];
  const nome = NOMES[e.tipo];
  if (!dataValida(e.prazo) || !dataValida(e.entrega)) return { calculada: false, tipo: e.tipo, motivo: 'Data do prazo ou da entrega inválida.', regra: null, fonte };
  if (!fonte) {
    const motivo = e.tipo === 'efd_icms_ipi'
      ? 'A multa por atraso da EFD ICMS/IPI é estadual (SEFAZ) e a regra ainda não foi conferida: o sistema não estima. Transmita o quanto antes.'
      : `A regra oficial da multa por atraso da ${nome} ainda não foi conferida pelo sistema: não há estimativa. Transmita o quanto antes; o valor oficial vem na notificação da Receita.`;
    return { calculada: false, tipo: e.tipo, motivo, regra: null, fonte: null };
  }
  const dias = diasDeAtraso(e.prazo, e.entrega); const meses = mesesCalendarioDeAtraso(e.prazo, e.entrega);
  if (dias === 0) return { calculada: true, tipo: e.tipo, emDia: true, multaCentavos: 0, texto: `${nome} no prazo: sem multa por atraso.`, fonte };
  const base = e.baseCentavos;
  const baseOk = typeof base === 'number' && Number.isSafeInteger(base) && base >= 0;
  const aviso = 'Estimativa: o valor oficial vem na notificação da Receita (caixa postal do e-CAC ou do Portal do Simples).';

  if (e.tipo === 'pgdasd' || e.tipo === 'defis' || e.tipo === 'dasn_simei' || e.tipo === 'dctfweb') {
    const minimoBruto = e.tipo === 'pgdasd' ? 5_000 : e.tipo === 'dasn_simei' ? 5_000 : e.tipo === 'defis' ? (e.porte === 'mei' ? 5_000 : 20_000) : (e.semMovimento ? 20_000 : 50_000);
    // DCTFWeb: multa mínima reduzida em 90% (MEI) ou 50% (ME/EPP do Simples) — Manual da DCTFWeb, item 5.4; LC 123/2006, art. 38-B.
    const minimo = e.tipo === 'dctfweb' ? (e.porte === 'mei' ? minimoBruto / 10 : e.porte === 'me_epp_simples' ? minimoBruto / 2 : minimoBruto) : minimoBruto;
    const percentualBp = Math.min(meses * 200, 2000); // 2% ao mês, até 20% (em pontos-base)
    if (!baseOk) return { calculada: false, tipo: e.tipo, motivo: `${nome} em atraso (${meses} mês(es)-calendário): a multa é de ${percentualBp / 100}% dos tributos informados, com mínimo de ${reaisMulta(minimo)}. O sistema ainda não sabe o valor dos tributos dessa declaração para calcular.`, regra: `2% ao mês-calendário ou fração, até 20%, mínimo de ${reaisMulta(minimo)}`, fonte };
    const porPercentual = pct(base, percentualBp, 10_000);
    const multa = Math.max(porPercentual, minimo); const aplicouMinimo = porPercentual < minimo;
    // Redução à metade na entrega espontânea; quando vale o mínimo, o sistema não presume que a redução desce abaixo dele.
    const agora = aplicouMinimo ? multa : Math.floor(multa / 2);
    const reducao = aplicouMinimo
      ? 'A lei prevê redução à metade na entrega antes de intimação; como vale o mínimo, conte com ele até a notificação da Receita.'
      : `Entregando antes de qualquer intimação, a lei reduz a multa à metade (cerca de ${reaisMulta(agora)}).`;
    const texto = `Multa por atraso da ${nome} estimada em ${reaisMulta(multa)} (${percentualBp / 100}% de ${reaisMulta(base)}${aplicouMinimo ? `; vale o mínimo de ${reaisMulta(minimo)}` : ''}, ${meses} mês(es)-calendário). ${reducao} ${aviso}`;
    return { calculada: true, tipo: e.tipo, emDia: false, multaCentavos: multa, multaEntregandoAgoraCentavos: agora, meses, dias, aplicouMinimo, texto, fonte };
  }

  if (e.tipo === 'ecf_real') {
    if (!baseOk || base! <= 0) return { calculada: false, tipo: e.tipo, motivo: `ECF do Lucro Real em atraso (${meses} mês(es)-calendário): a multa é de 0,25% ao mês do lucro líquido antes do IRPJ e da CSLL, até 10%. ${baseOk ? 'Sem lucro no período, a lei manda usar o último lucro informado corrigido pela Selic, que o sistema não tem.' : 'O sistema ainda não sabe o lucro líquido do período.'}`, regra: '0,25% ao mês-calendário ou fração do lucro líquido antes do IRPJ e da CSLL, até 10%', fonte };
    const percentualE4 = Math.min(meses * 25, 1000); // 0,25% = 25/10.000; teto 10% = 1.000/10.000
    let multa = pct(base!, percentualE4, 10_000);
    const rbAnt = e.receitaBrutaAnoAnteriorCentavos;
    const teto = typeof rbAnt === 'number' && rbAnt >= 0 ? (rbAnt <= 360_000_000 ? 10_000_000 : 500_000_000) : null;
    if (teto !== null) multa = Math.min(multa, teto);
    const reducao = dias <= 30 ? 90 : dias <= 60 ? 75 : 50; // DL 1.598/1977, art. 8º-A, § 2º
    const agora = pct(multa, 100 - reducao, 100);
    const texto = `Multa por atraso da ECF estimada em ${reaisMulta(multa)} (${(percentualE4 / 100).toLocaleString('pt-BR')}% de ${reaisMulta(base!)} de lucro líquido, ${meses} mês(es)-calendário${teto === null ? '; o teto em reais depende da receita bruta do ano anterior' : ''}). Entregando agora, antes de intimação, a redução é de ${reducao}% (cerca de ${reaisMulta(agora)}). ${aviso}`;
    return { calculada: true, tipo: e.tipo, emDia: false, multaCentavos: multa, multaEntregandoAgoraCentavos: agora, meses, dias, aplicouMinimo: false, texto, fonte };
  }

  // ECF das demais e ECD: Lei 8.218/1991, art. 12, III.
  if (!baseOk) return { calculada: false, tipo: e.tipo, motivo: `${nome} em atraso (${dias} dia(s)): a multa é de 0,02% por dia da receita bruta do período, até 1%. O sistema ainda não sabe a receita bruta do período para calcular.`, regra: '0,02% por dia de atraso da receita bruta do período, até 1%', fonte };
  const percentualE4 = Math.min(dias * 2, 100); // 0,02% = 2/10.000; teto 1% = 100/10.000
  const multa = pct(base!, percentualE4, 10_000);
  const agora = Math.floor(multa / 2);
  const texto = `Multa por atraso da ${nome} estimada em ${reaisMulta(multa)} (${(percentualE4 / 100).toLocaleString('pt-BR')}% de ${reaisMulta(base!)} de receita bruta, ${dias} dia(s) de atraso). Entregando antes de qualquer intimação, a lei reduz à metade (cerca de ${reaisMulta(agora)}). ${aviso}`;
  return { calculada: true, tipo: e.tipo, emDia: false, multaCentavos: multa, multaEntregandoAgoraCentavos: agora, meses, dias, aplicouMinimo: false, texto, fonte };
}
