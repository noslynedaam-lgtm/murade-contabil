/**
 * Incentivos fiscais dedutíveis do IRPJ no Lucro Real (ECF N620 e N630) com a regra da Lei Complementar 224/25.
 * Fonte: Tabelas Dinâmicas da ECF Leiaute 12 (RFB, 24/09/2026), abas N630A e N620.
 *
 * Até 31/12/2025 o valor informado é deduzido como está (o limite legal é conferido pelo contador).
 * A partir de 01/01/2026 cada linha ganha uma linha de cálculo ".1" (CNA): se o valor informado for menor que
 * (percentual × imposto de 15% × 0,9), deduz-se o valor informado; senão, o limite × 0,9. A licença-maternidade/paternidade
 * deduz 90% do valor. As linhas de "Isenção e Redução" e "Redução por Reinvestimento" (N610) NÃO são calculadas aqui.
 */
import type { LinhaECF } from "./ecfPresumidoService";

interface DefIncentivo {
  codigo: string;
  descricao: string;
  /** Código da linha de cálculo da LC 224/25, quando existe. */
  codigoLc?: string;
  /** Percentual do imposto de 15% (linha 3) que limita a dedução; "x0,9" = deduz 90% do valor sem limite. */
  limite?: number | "x0,9";
  /** Último ano-calendário em que a linha existe. */
  ateAno?: number;
}

const N630: DefIncentivo[] = [
  { codigo: "6", descricao: "(-) Operações de Caráter Cultural e Artístico", codigoLc: "6.1", limite: 0.04 },
  { codigo: "8", descricao: "(-) Programa de Alimentação do Trabalhador", codigoLc: "8.1", limite: 0.04 },
  { codigo: "9", descricao: "(-) Desenvolvimento Tecnológico Industrial / Agropecuário" },
  { codigo: "10", descricao: "(-) Atividade Audiovisual", codigoLc: "10.1", limite: 0.04 },
  { codigo: "11", descricao: "(-) Fundos dos Direitos da Criança e do Adolescente", codigoLc: "11.1", limite: 0.01 },
  { codigo: "12", descricao: "(-) Fundos Nacional, Estaduais ou Municipais do Idoso (Lei nº 12.213/2010, art. 3º)", codigoLc: "12.1", limite: 0.01 },
  { codigo: "13", descricao: "(-) Atividades de Caráter Desportivo", codigoLc: "13.1", limite: 0.04 },
  { codigo: "14", descricao: "(-) Programa Nacional de Apoio à Atenção Oncológica - PRONON (Lei nº 12.715/2012, arts. 1º e 4º)", codigoLc: "14.1", limite: 0.01, ateAno: 2031 },
  { codigo: "15", descricao: "(-) Programa Nacional de Apoio à Atenção da Saúde da Pessoa com Deficiência - PRONAS/PCD (Lei nº 12.715/2012, arts. 3º e 4º)", codigoLc: "15.1", limite: 0.01, ateAno: 2031 },
  { codigo: "16", descricao: "(-) Valor da Remuneração da Prorrogação da Licença-Maternidade e da Licença-Paternidade (Lei nº 11.770/2008, art. 5º)", codigoLc: "16001", limite: "x0,9" },
  { codigo: "16.01", descricao: "(-) Crédito Presumido de 9% Sobre a Parcela dos Lucros Auferidos no Exterior (Art. 28, da Instrução Normativa 1.520/2014)" },
  { codigo: "16.04", descricao: "(-) Imposto Sobre a Renda Pago no Exterior pela Controlada Direta ou Indireta, no Caso do Art. 87 da Lei nº 12.973/2014" },
  { codigo: "16.05", descricao: "(-) Imposto Sobre a Renda Retido na Fonte no Exterior Incidente Sobre os Dividendos no Caso do Art. 88 da Lei nº 12.973/2014" },
  { codigo: "16.06", descricao: "(-) Programa Rota 2030 - Mobilidade e Logística - Despesa Operacional do Período (Art. 11 da Lei nº 13.755/2018)" },
  { codigo: "16.07", descricao: "(-) Programa Rota 2030 - Mobilidade e Logística - Parcela Excedente de Períodos Anteriores (Art. 11, § 3º da Lei nº 13.755/2018)" },
  { codigo: "16.10", descricao: "(-) Incentivo a Projetos de Reciclagem (Art. 3º, da Lei nº 14.260/2021)", codigoLc: "16.15", limite: 0.01 },
  { codigo: "16.50", descricao: "(-) Outras Deduções" },
];

const N620: DefIncentivo[] = [
  { codigo: "7", descricao: "(-) Operações de Caráter Cultural e Artístico", codigoLc: "7.1", limite: 0.04 },
  { codigo: "9", descricao: "(-) Programa de Alimentação do Trabalhador", codigoLc: "9.1", limite: 0.04 },
  { codigo: "10", descricao: "(-) Desenvolvimento Tecnológico Industrial / Agropecuário" },
  { codigo: "11", descricao: "(-) Atividade Audiovisual", codigoLc: "11.1", limite: 0.04 },
  { codigo: "12", descricao: "(-) Fundos dos Direitos da Criança e do Adolescente", codigoLc: "12.1", limite: 0.01 },
  { codigo: "13", descricao: "(-) Fundos Nacional, Estaduais ou Municipais do Idoso (Lei nº 12.213/2010, art. 3º)", codigoLc: "13.1", limite: 0.01 },
  { codigo: "14", descricao: "(-) Atividades de Caráter Desportivo", codigoLc: "14.1", limite: 0.04 },
  { codigo: "15", descricao: "(-) Programa Nacional de Apoio à Atenção Oncológica - PRONON (Lei nº 12.715/2012, arts. 1º e 4º)", codigoLc: "15.1", limite: 0.01, ateAno: 2026 },
  { codigo: "16", descricao: "(-) Programa Nacional de Apoio à Atenção da Saúde da Pessoa com Deficiência - PRONAS/PCD (Lei nº 12.715/2012, arts. 3º e 4º)", codigoLc: "16.1", limite: 0.01, ateAno: 2026 },
  { codigo: "17", descricao: "(-) Valor da Remuneração da Prorrogação da Licença-Maternidade e da Licença-Paternidade (Lei nº 11.770/2008, art. 5º)", codigoLc: "17001", limite: "x0,9" },
  { codigo: "17.01", descricao: "(-) Crédito Presumido de 9% Sobre a Parcela dos Lucros Auferidos no Exterior (Art. 28, da Instrução Normativa 1.520/2014)" },
  { codigo: "17.05", descricao: "(-) Programa Rota 2030 - Mobilidade e Logística - Despesa Operacional do Período (Art. 11 da Lei nº 13.755/2018)" },
  { codigo: "17.06", descricao: "(-) Programa Rota 2030 - Mobilidade e Logística - Parcela Excedente de Períodos Anteriores (Art. 11, § 3º da Lei nº 13.755/2018)" },
  { codigo: "17.50", descricao: "(-) Outras - Deduções" },
];

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const TABELAS = { N630, N620 } as const;

export function codigosIncentivo(tabela: "N620" | "N630") {
  return TABELAS[tabela].map((d) => ({ codigo: d.codigo, descricao: d.descricao }));
}

/** `imposto15` = linha 3 da tabela (IRPJ a 15%). Devolve as linhas (E e, de 2026 em diante, as de cálculo) e o total deduzido. */
export function calcularIncentivosIrpj(
  tabela: "N620" | "N630", ano: number, imposto15: number, valores: Record<string, number>,
): { linhas: LinhaECF[]; totalDeduzido: number; avisos: string[] } {
  const defs = TABELAS[tabela];
  const avisos: string[] = [];
  const validos = new Set(defs.map((d) => d.codigo));
  for (const k of Object.keys(valores)) {
    if (!validos.has(k)) throw new Error(`Incentivo fiscal com código ${k} não existe na tabela ${tabela} (confira o código).`);
    if (!(Number(valores[k]) >= 0)) throw new Error(`Incentivo ${k}: informe o valor sem sinal (positivo).`);
  }
  const linhas: LinhaECF[] = [];
  let total = 0;
  for (const d of defs) {
    const v = Number(valores[d.codigo]);
    if (valores[d.codigo] === undefined || !(v > 0)) continue;
    if (d.ateAno && ano > d.ateAno) throw new Error(`A linha ${tabela}/${d.codigo} só existe até o ano-calendário ${d.ateAno}.`);
    linhas.push({ codigo: d.codigo, descricao: d.descricao, valor: r2(v) });
    if (ano >= 2026 && d.codigoLc) {
      const ded = d.limite === "x0,9" ? v * 0.9 : v < (d.limite as number) * imposto15 * 0.9 ? v : (d.limite as number) * imposto15 * 0.9;
      linhas.push({ codigo: d.codigoLc, descricao: `${d.descricao.replace(/^\(-\)\s*/, "(-)")} - LC 224/25`, valor: r2(ded) });
      total += ded;
      if (v > ded + 0.005) avisos.push(`${tabela}/${d.codigo}: dedução limitada pela LC 224/25 (R$ ${r2(ded).toFixed(2).replace(".", ",")} de R$ ${r2(v).toFixed(2).replace(".", ",")} informados).`);
    } else total += v;
  }
  return { linhas, totalDeduzido: r2(total), avisos };
}
