export interface AssistenteHandle {
  abrir: () => void;
  falar: (texto: string) => void;
  perguntar: (texto: string) => void;
  ocupado: () => boolean;
  parar: () => void;
  /** A voz da Agente está ligada? (opcional: o tocador da apresentação usa para decidir entre falar e só mostrar a legenda). */
  vozLigada?: () => boolean;
}
