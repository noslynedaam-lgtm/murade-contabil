// Aulas da Escola por tela (Murad Contábil), para a oferta "Quer uma aula rápida desta tela?" e para o conferidor do piloto.
// Fica num arquivo à parte porque importa o conteúdo das aulas (com as respostas): só o SERVIDOR e os testes usam; o navegador
// recebe a lista pronta, sem respostas, em /api/escola/estado.
import { AULAS } from './escolaConteudo';

/** Aula oferecida primeiro em cada tela: a que explica a própria tela. As outras vêm depois. */
export const AULA_PRINCIPAL_DA_TELA: Record<string, string> = {
  migracao: 'migracao-pausa-continua',
};
export function aulasComTela(): Array<{ id: string; titulo: string; meMostra: { tela: string } }> {
  const todas = AULAS.map((a) => ({ id: a.id, titulo: a.titulo, meMostra: { tela: a.meMostra.tela } }));
  const principais = new Set(Object.values(AULA_PRINCIPAL_DA_TELA));
  return [...todas.filter((a) => principais.has(a.id)), ...todas.filter((a) => !principais.has(a.id))];
}
