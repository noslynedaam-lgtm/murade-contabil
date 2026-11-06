export interface AssistenteHandle {
  abrir: () => void;
  falar: (texto: string) => void;
  perguntar: (texto: string) => void;
  ocupado: () => boolean;
  parar: () => void;
}
