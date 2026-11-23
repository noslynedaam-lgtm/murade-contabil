// Multa e juros de mora de débito FEDERAL pago em atraso (cálculo puro, em centavos inteiros).
//
// FONTE OFICIAL (conferida no Planalto, texto compilado da Lei nº 9.430/1996 — planalto.gov.br/ccivil_03/leis/L9430compilada.htm):
//  - art. 61, caput: débitos com a União de tributos administrados pela Receita Federal, não pagos no prazo, têm multa de mora
//    de 0,33% (trinta e três centésimos por cento) por dia de atraso;
//  - art. 61, § 1º: a multa conta a partir do primeiro dia seguinte ao vencimento até o dia do pagamento;
//  - art. 61, § 2º: a multa fica limitada a 20%;
//  - art. 61, § 3º (com o art. 5º, § 3º): juros de mora pela taxa Selic acumulada mensalmente, do primeiro dia do mês seguinte ao
//    vencimento até o último dia do mês anterior ao pagamento, mais 1% no mês do pagamento.
// Taxa Selic mensal: Banco Central do Brasil, SGS série 4390 ("Taxa de juros - Selic acumulada no mês", % a.m.).
//
// É ESTIMATIVA: a guia oficial com o valor atualizado continua sendo emitida no Sicalc (Receita Federal). Este cálculo não trata
// redução de multa, parcelamento, denúncia espontânea com particularidades, nem débito de outros entes (DARE-GO, DAS) — esses
// têm regra e emissor próprios. Sem a Selic de algum mês necessário, NÃO calcula: devolve os meses que faltam.

export const FONTE_ACRESCIMOS_FEDERAIS = 'Lei nº 9.430/1996, art. 61, caput e §§ 1º a 3º, e art. 5º, § 3º (Planalto); Selic mensal: Banco Central do Brasil, SGS série 4390 (Selic acumulada no mês, % a.m.)';
export const MULTA_DIA_CENTESIMOS = 33; // 0,33% = 33 centésimos de ponto percentual
export const MULTA_TETO_CENTESIMOS = 2000; // 20%

/** Taxa Selic do mês, em percentual ao mês, por competência 'aaaa-mm'. */
export type TabelaSelic = Record<string, number>;

export interface EntradaAcrescimos { principalCentavos: number; vencimento: string; pagamento: string; selic: TabelaSelic }
export type ResultadoAcrescimos =
  | { ok: true; emDia: true; principalCentavos: number; multaCentavos: 0; jurosCentavos: 0; totalCentavos: number; diasAtraso: 0; multaPercentual: 0; jurosPercentual: 0; mesesSelic: []; fonte: string; aviso: string }
  | { ok: true; emDia: false; principalCentavos: number; multaCentavos: number; jurosCentavos: number; totalCentavos: number; diasAtraso: number; multaPercentual: number; jurosPercentual: number; mesesSelic: Array<{ competencia: string; taxa: number }>; fonte: string; aviso: string }
  | { ok: false; motivo: string; faltamMeses?: string[] };

export const AVISO_ESTIMATIVA = 'Estimativa pela Lei 9.430/1996, art. 61. A guia oficial com o valor atualizado é emitida no Sicalc da Receita Federal; confira lá antes de pagar.';

const dataValida = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
export const proximaCompetencia = (c: string): string => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

/** Meses cuja Selic entra no cálculo: do mês seguinte ao vencimento até o mês anterior ao pagamento (pode ser lista vazia). */
export function mesesDeSelic(vencimento: string, pagamento: string): string[] {
  const fim = pagamento.slice(0, 7); const lista: string[] = [];
  for (let c = proximaCompetencia(vencimento.slice(0, 7)); c < fim; c = proximaCompetencia(c)) { lista.push(c); if (lista.length > 600) break; }
  return lista;
}

/** Arredonda percentual × centavos para centavos inteiros (meio para cima), sem acumular erro de ponto flutuante. */
function aplicarPercentual(centavos: number, percentualEmMilionesimos: number): number {
  // percentual em milionésimos de ponto percentual (1% = 1_000_000) -> centavos * p / 100_000_000
  return Number((BigInt(centavos) * BigInt(percentualEmMilionesimos) + 50_000_000n) / 100_000_000n);
}
const emMilionesimos = (percentual: number) => Math.round(percentual * 1_000_000);

export function calcularAcrescimosFederais(e: EntradaAcrescimos): ResultadoAcrescimos {
  if (!Number.isSafeInteger(e.principalCentavos) || e.principalCentavos <= 0) return { ok: false, motivo: 'Informe o valor principal da guia (maior que zero).' };
  if (!dataValida(e.vencimento)) return { ok: false, motivo: 'Vencimento inválido (use aaaa-mm-dd).' };
  if (!dataValida(e.pagamento)) return { ok: false, motivo: 'Data de pagamento inválida (use aaaa-mm-dd).' };
  const dias = diasEntre(e.vencimento, e.pagamento);
  if (dias <= 0) return { ok: true, emDia: true, principalCentavos: e.principalCentavos, multaCentavos: 0, jurosCentavos: 0, totalCentavos: e.principalCentavos, diasAtraso: 0, multaPercentual: 0, jurosPercentual: 0, mesesSelic: [], fonte: FONTE_ACRESCIMOS_FEDERAIS, aviso: 'Pago até o vencimento: sem multa e sem juros.' };
  if (dias > 365 * 30) return { ok: false, motivo: 'Atraso maior que 30 anos: confira as datas.' };
  const multaCentesimos = Math.min(dias * MULTA_DIA_CENTESIMOS, MULTA_TETO_CENTESIMOS);
  const meses = mesesDeSelic(e.vencimento, e.pagamento);
  const faltam = meses.filter((c) => !(typeof e.selic[c] === 'number' && Number.isFinite(e.selic[c]) && e.selic[c] >= 0 && e.selic[c] < 100));
  if (faltam.length) return { ok: false, motivo: `Falta a taxa Selic oficial de ${faltam.map((c) => `${c.slice(5)}/${c.slice(0, 4)}`).join(', ')}. Sem ela o sistema não calcula os juros (nada é chutado).`, faltamMeses: faltam };
  // Mês do pagamento depois do mês do vencimento: + 1%. Pago no mesmo mês do vencimento: não há mês "seguinte ao vencimento", sem juros.
  const umPorCentoNoMes = pagamentoEmMesPosterior(e.vencimento, e.pagamento);
  const jurosMilionesimos = meses.reduce((s, c) => s + emMilionesimos(e.selic[c]), 0) + (umPorCentoNoMes ? 1_000_000 : 0);
  const multaCentavos = aplicarPercentual(e.principalCentavos, multaCentesimos * 10_000);
  const jurosCentavos = aplicarPercentual(e.principalCentavos, jurosMilionesimos);
  return {
    ok: true, emDia: false, principalCentavos: e.principalCentavos, multaCentavos, jurosCentavos, totalCentavos: e.principalCentavos + multaCentavos + jurosCentavos, diasAtraso: dias,
    multaPercentual: multaCentesimos / 100, jurosPercentual: jurosMilionesimos / 1_000_000, mesesSelic: meses.map((c) => ({ competencia: c, taxa: e.selic[c] })),
    fonte: FONTE_ACRESCIMOS_FEDERAIS, aviso: AVISO_ESTIMATIVA,
  };
}
const pagamentoEmMesPosterior = (venc: string, pag: string) => pag.slice(0, 7) > venc.slice(0, 7);

/** Lê a resposta da API oficial do BCB (SGS série 4390): [{ data: 'dd/mm/aaaa', valor: '0.97' }]. Linha que não bate no formato é ignorada. */
export function lerSerieSelicBcb(json: unknown): Array<{ competencia: string; taxa: number }> {
  if (!Array.isArray(json)) throw new Error('Resposta do Banco Central fora do formato esperado (não é uma lista).');
  const saida: Array<{ competencia: string; taxa: number }> = [];
  for (const l of json) {
    const data = String((l as any)?.data ?? ''); const valor = String((l as any)?.valor ?? '').trim();
    const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m || !/^\d{1,2}(\.\d{1,6})?$/.test(valor)) continue;
    const taxa = Number(valor);
    if (!Number.isFinite(taxa) || taxa < 0 || taxa >= 100) continue;
    saida.push({ competencia: `${m[3]}-${m[2]}`, taxa });
  }
  return saida;
}
