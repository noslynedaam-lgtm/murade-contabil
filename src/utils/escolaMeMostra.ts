// "Me mostra no sistema" da Escola Murade (Murade Contábil): transforma o MeMostra da aula num roteiro do Piloto Visível que SÓ
// abre a tela e destaca (nunca preenche, nunca para em botão de gravar). Quem conduz a tela é o PilotoVisivel já existente.
import type { MeMostra } from '../data/escolaNucleo';
import { IDS_DE_TELAS_CONTABIL, TELAS_CONTABIL } from '../data/mapaTelasContabil';
import { validarPlanoPiloto, type PlanoPiloto } from './pilotoVisivel';

function soMostra(bruto: unknown): PlanoPiloto | null {
  const v = validarPlanoPiloto(bruto);
  if (!('plano' in v)) return null;
  return v.plano.passos.every((p) => p.tipo === 'navegar' || p.tipo === 'destacar') ? v.plano : null;
}

export function pilotoDoMeMostra(m: MeMostra, titulo: string): PlanoPiloto | null {
  if (!IDS_DE_TELAS_CONTABIL.has(m.tela)) return null;
  const tela = TELAS_CONTABIL.find((t) => t.id === m.tela)!;
  return soMostra({ titulo: `Me mostra: ${titulo}`.slice(0, 120), passos: [
    { tipo: 'navegar', alvo: `#btn-menu-${tela.id}`, legenda: `Abrindo "${tela.rotulo}".` },
    { tipo: 'destacar', alvo: m.alvo || `#btn-menu-${tela.id}`, legenda: m.legenda },
  ] });
}

/** Roteiro da Agente para "abre a aula de X": destaca a aula na lista (só mostra). A Escola não fica no menu: já está aberta pelo link. */
export function pilotoAbrirAula(aulaId: string, tituloAula: string, legenda: string): PlanoPiloto | null {
  return soMostra({ titulo: `Aula: ${tituloAula}`.slice(0, 120), passos: [
    { tipo: 'destacar', alvo: `#escola-aula-${aulaId}`, legenda },
  ] });
}

/** Plano da Agente para "me mostra tudo": abre a Escola Murade e destaca o botão da demonstração completa (só mostra). */
export function pilotoAbrirDemonstracao(legenda: string): PlanoPiloto | null {
  return soMostra({ titulo: `Demonstração completa com a IA`.slice(0, 120), passos: [
    { tipo: 'destacar', alvo: '#escola-demo-completa', legenda },
  ] });
}
