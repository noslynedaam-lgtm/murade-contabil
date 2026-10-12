import { ContaPlano } from "../types";

/**
 * Compara dois códigos contábeis respeitando a hierarquia e ordem numérica real.
 * Exemplo: "1.1.2" vem antes de "1.1.10", "1.1" vem antes de "1.1.1".
 */
export function compararCodigosContabeis(a: string, b: string): number {
  const partesA = a.trim().split(".").map((n) => parseInt(n, 10));
  const partesB = b.trim().split(".").map((n) => parseInt(n, 10));
  const len = Math.max(partesA.length, partesB.length);

  for (let i = 0; i < len; i++) {
    const valA = partesA[i];
    const valB = partesB[i];

    // Se uma conta for mais curta e idêntica até aqui (ex: 1.1 vs 1.1.1)
    if (valA === undefined) return -1;
    if (valB === undefined) return 1;

    if (isNaN(valA) && isNaN(valB)) continue;
    if (isNaN(valA)) return 1;
    if (isNaN(valB)) return -1;

    if (valA !== valB) {
      return valA - valB;
    }
  }

  return 0;
}

/**
 * Encontra a conta pai de um código contábil.
 * Ex: para "1.1.6", a conta pai é "1.1".
 * Para "1.1", a conta pai é "1".
 */
export function extrairCodigoPai(codigo: string): string | null {
  const partes = codigo.trim().split(".");
  if (partes.length <= 1) return null;
  return partes.slice(0, -1).join(".");
}

/**
 * Obtém todas as contas filhas diretas de um determinado código pai.
 */
export function obterFilhasDiretas(contas: ContaPlano[], codigoPai: string): ContaPlano[] {
  const prefixo = `${codigoPai}.`;
  return contas.filter((c) => {
    if (!c.codigo.startsWith(prefixo)) return false;
    const resto = c.codigo.slice(prefixo.length);
    // Deve ser filha direta (sem outros pontos)
    return !resto.includes(".");
  });
}

/**
 * Calcula o próximo código na sequência numérica exata para uma conta pai.
 * Exemplo: se 1.1 tem filhas 1.1.1, 1.1.2, 1.1.3, 1.1.4, 1.1.5,
 * o próximo código gerado será "1.1.6".
 */
export function calcularProximoCodigoSequencial(
  contas: ContaPlano[],
  codigoPai: string
): { proximoCodigo: string; ultimoExistente: string | null; numeroSequencial: number } {
  const filhas = obterFilhasDiretas(contas, codigoPai);

  if (filhas.length === 0) {
    return {
      proximoCodigo: `${codigoPai}.1`,
      ultimoExistente: null,
      numeroSequencial: 1,
    };
  }

  // Extrai os números finais de cada filha direta
  const numeros = filhas
    .map((f) => {
      const partes = f.codigo.split(".");
      const ultimo = parseInt(partes[partes.length - 1], 10);
      return isNaN(ultimo) ? 0 : ultimo;
    })
    .filter((n) => n > 0);

  const maiorNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
  const proximoNumero = maiorNumero + 1;
  const ultimaConta = filhas.find((f) => f.codigo === `${codigoPai}.${maiorNumero}`);

  return {
    proximoCodigo: `${codigoPai}.${proximoNumero}`,
    ultimoExistente: ultimaConta ? `${ultimaConta.codigo} — ${ultimaConta.descricao}` : null,
    numeroSequencial: proximoNumero,
  };
}

/**
 * Validação detalhada para garantir que uma conta manual siga rigorosamente
 * a sequência numérica de sua respectiva conta pai.
 */
export interface ValidacaoSequencia {
  valido: boolean;
  mensagem: string;
  tipo: "ok" | "aviso" | "erro";
  proximoRecomendado?: string;
  contaPaiCodigo?: string;
}

export function validarSequenciaManual(
  contas: ContaPlano[],
  codigoManual: string,
  codigoPaiSelecionado?: string
): ValidacaoSequencia {
  const codLimpo = codigoManual.trim();
  if (!codLimpo) {
    return {
      valido: false,
      mensagem: "Informe o código da conta contábil.",
      tipo: "erro",
    };
  }

  // Verifica se já existe
  const contaExistente = contas.find((c) => c.codigo === codLimpo);
  if (contaExistente) {
    return {
      valido: false,
      mensagem: `O código ${codLimpo} já está cadastrado ("${contaExistente.descricao}"). Escolha o próximo na sequência numérica.`,
      tipo: "erro",
    };
  }

  // Determina a conta pai (por seleção explícita ou por dedução das partes)
  const paiDeduzido = codigoPaiSelecionado || extrairCodigoPai(codLimpo);
  if (!paiDeduzido) {
    return {
      valido: true,
      mensagem: "Conta de nível raiz (Grupo principal).",
      tipo: "ok",
    };
  }

  // Verifica se a conta pai existe no plano
  const contaPai = contas.find((c) => c.codigo === paiDeduzido);
  if (!contaPai) {
    return {
      valido: false,
      mensagem: `A conta pai "${paiDeduzido}" não existe no Plano de Contas. Cadastre primeiro a conta pai sintética.`,
      tipo: "erro",
      contaPaiCodigo: paiDeduzido,
    };
  }

  // Calcula qual deveria ser o próximo número sequencial
  const { proximoCodigo, ultimoExistente, numeroSequencial } = calcularProximoCodigoSequencial(
    contas,
    paiDeduzido
  );

  // Se o código digitado for exatamente o próximo da sequência
  if (codLimpo === proximoCodigo) {
    return {
      valido: true,
      mensagem: `Perfeito! O código segue rigorosamente a sequência numérica da conta "${contaPai.descricao}" (Nº ${numeroSequencial}).`,
      tipo: "ok",
      proximoRecomendado: proximoCodigo,
      contaPaiCodigo: paiDeduzido,
    };
  }

  // Se não começa com o prefixo da conta pai
  if (!codLimpo.startsWith(`${paiDeduzido}.`)) {
    return {
      valido: false,
      mensagem: `O código deve começar com "${paiDeduzido}." para pertencer à mesma conta pai da sequência numérica.`,
      tipo: "erro",
      proximoRecomendado: proximoCodigo,
      contaPaiCodigo: paiDeduzido,
    };
  }

  // Se pertence à conta pai mas pulou ou quebrou a sequência
  return {
    valido: false,
    mensagem: `Atenção à sequência numérica: O próximo número sequencial sob "${contaPai.descricao}" é ${proximoCodigo}${
      ultimoExistente ? ` (último cadastrado: ${ultimoExistente})` : ""
    }.`,
    tipo: "aviso",
    proximoRecomendado: proximoCodigo,
    contaPaiCodigo: paiDeduzido,
  };
}

/**
 * Ordena a lista de contas contábeis em estrita ordem numérica hierárquica.
 */
export function ordenarContasPorSequenciaNumerica(contas: ContaPlano[]): ContaPlano[] {
  return [...contas].sort((a, b) => compararCodigosContabeis(a.codigo, b.codigo));
}
