// Contexto que dá acesso, de qualquer tela, à "alça" da assistente de voz (abrir/falar/perguntar),
// sem precisar passar props por várias camadas de componente. Usado pelo detector de dificuldade
// e pelo guia passo a passo para abrir a conversa e falar com a pessoa quando ela parece travada.
import React, { createContext, useContext, useRef, type RefObject } from 'react';
import type { AssistenteHandle } from '../types/assistenteHandle';

const AssistenteContext = createContext<RefObject<AssistenteHandle | null> | null>(null);

export const AssistenteProvider: React.FC<{ assistenteRef: RefObject<AssistenteHandle | null>; children: React.ReactNode }> = ({
  assistenteRef,
  children,
}) => <AssistenteContext.Provider value={assistenteRef}>{children}</AssistenteContext.Provider>;

/** Devolve a alça da assistente, ou null se ainda não estiver montada/disponível nesta tela. Nunca
 * lança erro — quem usa deve conferir null antes de chamar (ex.: `assistente?.falar('...')`). */
export function useAssistenteOpcional(): AssistenteHandle | null {
  const ref = useContext(AssistenteContext);
  return ref?.current ?? null;
}

/** Hook utilitário só para criar e manter o ref que o App.tsx passa pro AssistenteProvider e pro
 * componente <IAAssistenteDrBeni ref={...} />. */
export function useAssistenteRef(): RefObject<AssistenteHandle | null> {
  return useRef<AssistenteHandle | null>(null);
}
