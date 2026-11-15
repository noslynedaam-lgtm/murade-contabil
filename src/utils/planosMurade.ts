// Tabela comercial dos sistemas Murade (definida pelo dono do sistema em 15/11/2026).
// É só informação para o escritório ver na tela de equipe: quem LIMITA os pontos de cada escritório continua sendo o dono do sistema.
// O mesmo arquivo existe no DP, no Fiscal e no Contábil: se mudar um valor, mude nos três (há um teste que confere a coerência da tabela).

export interface FaixaPlano {
  /** Texto da faixa de empresas, como aparece na tela. */
  rotulo: string;
  de: number;
  /** null = sem limite de empresas. */
  ate: number | null;
  /** Mensalidade em reais. Na faixa sem limite é o valor "a partir de". */
  mensalidade: number;
  /** Pontos (pessoas com acesso, a contadora inclusa) que já vêm na mensalidade. */
  pontos: number;
}

export const FAIXAS_PLANO: readonly FaixaPlano[] = [
  { rotulo: '10 a 20', de: 10, ate: 20, mensalidade: 350, pontos: 2 },
  { rotulo: '21 a 50', de: 21, ate: 50, mensalidade: 550, pontos: 3 },
  { rotulo: '51 a 100', de: 51, ate: 100, mensalidade: 700, pontos: 3 },
  { rotulo: '101 a 149', de: 101, ate: 149, mensalidade: 850, pontos: 3 },
  { rotulo: '150 a 200', de: 150, ate: 200, mensalidade: 1000, pontos: 3 },
  { rotulo: '201 a 300', de: 201, ate: 300, mensalidade: 1350, pontos: 3 },
  { rotulo: '301 a 500', de: 301, ate: 500, mensalidade: 1900, pontos: 3 },
  { rotulo: '501 a 1.000', de: 501, ate: 1000, mensalidade: 3000, pontos: 3 },
  { rotulo: 'Ilimitada (sem limite de empresas)', de: 1001, ate: null, mensalidade: 5000, pontos: 3 },
];

/** Cada ponto além dos incluídos na faixa, por mês. */
export const PONTO_EXTRA_MENSAL = 100;
/** Cada consulta oficial acima da cota grátis da semana (1 por empresa), cobrada por fora da mensalidade. */
export const CONSULTA_EXTRA = 1;

export function reais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Mensalidade sem centavos quando é inteira (R$ 1.000), como na tabela. */
export function reaisInteiro(valor: number): string {
  return Number.isInteger(valor) ? `R$ ${valor.toLocaleString('pt-BR')}` : reais(valor);
}
