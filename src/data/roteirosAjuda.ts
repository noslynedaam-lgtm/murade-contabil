// Roteiros de ajuda passo a passo (com seta na tela) para o Contábil.
// Cada chave corresponde ao identificador do elemento que a pessoa tentou
// clicar várias vezes sem conseguir (ver useDetectorDificuldade.ts).
// Vai sendo preenchido conforme identificamos os pontos onde o contador
// ou seu funcionário mais têm dificuldade (pedido do dono, 06/11/2026).
import type { PassoGuia } from '../components/GuiaPassoAPasso';

export const ROTEIROS_AJUDA: Record<string, PassoGuia[]> = {
  // Prioridade do dono (06/11/2026): área de cadastramento primeiro (DP e Fiscal já receberam os
  // primeiros roteiros; agora é a vez do Contábil). "Empresa" é onde a empresa é cadastrada/editada.
  'id:btn-menu-empresa': [
    {
      seletor: '#btn-menu-empresa',
      texto: 'Para cadastrar ou editar uma empresa, clique aqui no menu lateral, onde está escrito "Empresa". Dá pra consultar o CNPJ direto na Receita Federal e o CEP preenche o endereço automaticamente.',
    },
  ],
};

export function roteiroParaChave(chave: string): PassoGuia[] | null {
  return ROTEIROS_AJUDA[chave] ?? null;
}
