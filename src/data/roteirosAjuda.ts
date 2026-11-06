// Roteiros de ajuda passo a passo (com seta na tela) para o Contábil.
// Cada chave corresponde ao identificador do elemento que a pessoa tentou
// clicar várias vezes sem conseguir (ver useDetectorDificuldade.ts).
// Vai sendo preenchido conforme identificamos os pontos onde o contador
// ou seu funcionário mais têm dificuldade (pedido do dono, 06/11/2026).
import type { PassoGuia } from '../components/GuiaPassoAPasso';

export const ROTEIROS_AJUDA: Record<string, PassoGuia[]> = {};

export function roteiroParaChave(chave: string): PassoGuia[] | null {
  return ROTEIROS_AJUDA[chave] ?? null;
}
