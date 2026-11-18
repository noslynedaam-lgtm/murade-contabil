// Regras da exclusão em DUAS ETAPAS (sem tela, para poder ser testada).
// Toda exclusão pedida por clique passa por aqui: etapa 1 diz O QUE será excluído e as consequências;
// etapa 2 é a "última confirmação". Só depois da etapa 2 a exclusão é feita.
// A tela (ConfirmaExclusaoDuasEtapas) e o cartão da Agente IA por voz usam estes mesmos textos e regras.

export interface OpcoesExclusao {
  /** O que será excluído, exatamente: nome, CNPJ, e-mail, quantidade. Ex.: 'a empresa ACME LTDA (CNPJ 12.345.678/0001-90)'. */
  oQue: string;
  /** Título curto da etapa 1. Padrão: 'Excluir?'. */
  titulo?: string;
  /** Consequências, uma por linha. */
  consequencias?: string[];
  /** Texto do botão vermelho da etapa 2. Padrão: 'Sim, excluir'. */
  rotuloFinal?: string;
  /** false quando dá para refazer (ex.: tirar alguém da equipe). Muda só o título da etapa 2; padrão true. */
  irreversivel?: boolean;
  /** Quando irreversivel é false: como voltar atrás (mostrado na etapa 2). */
  comoVoltar?: string;
}

export const ROTULO_CANCELAR = 'Cancelar';
export const ROTULO_CONTINUAR = 'Continuar';
export const ROTULO_FINAL_PADRAO = 'Sim, excluir';
export const ROTULO_VOLTAR_ETAPA2 = 'Não, cancelar';
export const TITULO_ETAPA2 = 'Última confirmação — isso não pode ser desfeito';
export const TITULO_ETAPA2_REFAZIVEL = 'Última confirmação';
/** Depois de aparecer a etapa 2, o botão vermelho ignora cliques por este tempo: um toque duplo no mesmo lugar nunca confirma. */
export const ATRASO_ETAPA2_MS = 700;

export type EtapaExclusao = 1 | 2 | 'fim';
export interface EstadoExclusao { etapa: EtapaExclusao; etapa2Desde: number; resultado: boolean | null }

export const iniciarExclusao = (): EstadoExclusao => ({ etapa: 1, etapa2Desde: 0, resultado: null });
/** Etapa 1 -> 2 (botão Continuar). */
export function continuarExclusao(e: EstadoExclusao, agora: number): EstadoExclusao {
  return e.etapa === 1 ? { etapa: 2, etapa2Desde: agora, resultado: null } : e;
}
/** Botão vermelho da etapa 2. Ignorado fora da etapa 2 e nos primeiros ATRASO_ETAPA2_MS. */
export function confirmarExclusao(e: EstadoExclusao, agora: number): EstadoExclusao {
  if (e.etapa !== 2 || agora - e.etapa2Desde < ATRASO_ETAPA2_MS) return e;
  return { etapa: 'fim', etapa2Desde: e.etapa2Desde, resultado: true };
}
/** Cancelar, Esc, clique fora ou sair da tela: vale em qualquer etapa. */
export function cancelarExclusao(e: EstadoExclusao): EstadoExclusao {
  return e.etapa === 'fim' ? e : { etapa: 'fim', etapa2Desde: e.etapa2Desde, resultado: false };
}

export const tituloEtapa1 = (o: OpcoesExclusao): string => (o.titulo || 'Excluir?').trim();
export const tituloEtapa2 = (o: OpcoesExclusao): string => (o.irreversivel === false ? TITULO_ETAPA2_REFAZIVEL : TITULO_ETAPA2);
export const rotuloFinal = (o: OpcoesExclusao): string => (o.rotuloFinal || ROTULO_FINAL_PADRAO).trim();
