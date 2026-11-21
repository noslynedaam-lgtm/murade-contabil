import type React from 'react';
// Adaptador da Escola Murade para o Murade Contábil: o que muda de um sistema para o outro (voz, piloto e confirmação em duas
// etapas). Os componentes da Escola são iguais no Fiscal e no Contábil; só este arquivo é próprio de cada sistema.
import type { MeMostra } from '../../data/escolaNucleo';
import { pilotoDoMeMostra } from '../../utils/escolaMeMostra';
import { enviarAoPiloto } from '../PilotoVisivel';
import { useAssistenteOpcional } from '../../contexts/AssistenteContext';
import { useExclusaoDuasEtapas } from '../ConfirmaExclusaoDuasEtapas';
import { humanaFalando, pararHumana } from '../../utils/vozHumana';

/** A Agente fala (se a voz estiver ligada) pela mesma assistente do resto do sistema. */
export function useFalarNaEscola(): (texto: string) => void {
  const assistente = useAssistenteOpcional();
  return (texto: string) => { if (texto) assistente?.falar(texto); };
}
/** "Me mostra no sistema": o Piloto Visível abre a tela real e destaca. Só mostra; nunca preenche nem clica. */
export function mostrarNoSistema(m: MeMostra, titulo: string): boolean {
  const p = pilotoDoMeMostra(m, titulo);
  if (!p) return false;
  enviarAoPiloto(p);
  return true;
}
/** Confirmação em duas etapas para tirar uma trilha de um aluno (uma por vez). */
export function useConfirmarRemocao(): { pedir: (oQue: string, consequencias: string[]) => Promise<boolean>; dialogo: React.ReactNode } {
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  return { pedir: (oQue, consequencias) => pedir({ oQue, titulo: 'Tirar a trilha?', consequencias, rotuloFinal: 'Sim, tirar a trilha', irreversivel: false, comoVoltar: 'Atribua a trilha de novo no painel do gestor.' }), dialogo };
}
/** Voz da "▶ Demonstração completa com a IA": falar, parar na hora (Parar/Esc/comando de voz) e saber se ainda está falando. */
export function useVozDaEscola(): { falar: (texto: string) => void; parar: () => void; falando: () => boolean } {
  const assistente = useAssistenteOpcional();
  const falar = useFalarNaEscola();
  return { falar, parar: () => { try { assistente?.parar(); } catch { /* ok */ } pararHumana(); }, falando: () => humanaFalando() };
}
