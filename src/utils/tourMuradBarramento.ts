// Ponte entre o chat/voz da Murad, a Escola e o TOUR GUIADO (igual no DP, Fiscal e Contábil). Sem IA: frases reconhecidas por regra.
import {
  EVENTO_ABRIR_AULA, EVENTO_TOUR_COMANDO, EVENTO_TOUR_INICIAR, FRASE_DO_COMANDO, FRASE_INICIO_TOUR,
  comandoDoTour, ehPedidoDeTour, type ComandoTour,
} from '../data/tourMurad';

let ativo = false;
/** O componente do tour avisa quando está andando ou pausado (para o chat saber se "próxima" é comando do tour). */
export const definirTourAtivo = (v: boolean): void => { ativo = v; };
export const tourAtivo = (): boolean => ativo;

export function iniciarTour(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_TOUR_INICIAR));
}
export function comandarTour(c: ComandoTour): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_TOUR_COMANDO, { detail: c }));
}

/**
 * Chat e voz: devolve a frase curta para MOSTRAR no chat (a voz é do próprio tour, para não falarem duas ao mesmo tempo),
 * ou null quando a frase não é do tour. Comandos ("próxima", "volta", "sair do tour") só valem com o tour ligado.
 */
export function tratarFraseDoTour(texto: string): string | null {
  if (ativo) {
    const c = comandoDoTour(texto);
    if (c) { comandarTour(c); return FRASE_DO_COMANDO[c]; }
  }
  if (ehPedidoDeTour(texto)) { iniciarTour(); return FRASE_INICIO_TOUR; }
  return null;
}

// ------------------------------------------------------------------------------------------------ abrir uma aula da Escola
const CHAVE_AULA = 'murad_escola_abrir_aula_v1';
/** Pede para a Escola abrir esta aula assim que a tela da Escola estiver aberta (ou na hora, se já estiver). */
export function pedirAberturaDeAula(id: string): void {
  try { sessionStorage.setItem(CHAVE_AULA, id); } catch { /* sem armazenamento: o evento abaixo ainda abre se a Escola estiver na tela */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AULA, { detail: { id } }));
}
/** A Escola lê (e apaga) a aula pedida. */
export function consumirAulaPendente(): string | null {
  try { const id = sessionStorage.getItem(CHAVE_AULA); if (id) sessionStorage.removeItem(CHAVE_AULA); return id || null; } catch { return null; }
}
