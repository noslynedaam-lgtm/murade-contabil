// Apresentação falada do Contábil no navegador: o tocador (pausar, continuar, pular, parar, "me mostra onde") e o entendimento
// das frases curtas por voz ou texto, SEM chamar IA. Os textos vêm de src/data/apresentacaoSistema.ts (fixos e conferidos).
import type { BlocoApresentacao, SecaoApresentacao } from '../data/apresentacaoSistema';

export type EstadoTocador = 'parado' | 'tocando' | 'pausado' | 'fim';
export type Ambiente = {
  /** Fala o texto e chama `aoTerminar` quando acabar. Sem voz ligada, chama `aoTerminar` depois de um tempo de leitura. */
  falar: (texto: string, aoTerminar: () => void) => void;
  calar: () => void;
  agendar: (ms: number, f: () => void) => number;
  cancelar: (id: number) => void;
  vozLigada: () => boolean;
};
export const MS_LEITURA_POR_CARACTERE = 55;
export const MS_LEITURA_MINIMA = 4000;

export class TocadorApresentacao {
  private blocos: BlocoApresentacao[] = []; private i = 0; private estado: EstadoTocador = 'parado'; private geracao = 0; private timer: number | null = null;
  private ouvintes = new Set<() => void>();
  constructor(private amb: Ambiente) {}
  ouvir(f: () => void): () => void { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; }
  private avisar(): void { this.ouvintes.forEach((f) => f()); }
  instantaneo() { return { estado: this.estado, indice: this.i, total: this.blocos.length, bloco: this.blocos[this.i] ?? null }; }
  ativo(): boolean { return this.estado === 'tocando' || this.estado === 'pausado'; }

  iniciar(blocos: BlocoApresentacao[]): void {
    this.parar(false);
    if (!blocos.length) return;
    this.blocos = blocos; this.i = 0; this.estado = 'tocando'; this.tocar();
  }
  private tocar(): void {
    const g = ++this.geracao; this.limparTimer();
    const b = this.blocos[this.i];
    if (!b) { this.estado = 'fim'; this.avisar(); return; }
    this.avisar();
    const seguir = () => { if (g !== this.geracao || this.estado !== 'tocando') return; this.i += 1; this.tocar(); };
    if (this.amb.vozLigada()) this.amb.falar(b.falar, seguir);
    else this.timer = this.amb.agendar(Math.max(MS_LEITURA_MINIMA, b.falar.length * MS_LEITURA_POR_CARACTERE), seguir);
  }
  private limparTimer(): void { if (this.timer !== null) { this.amb.cancelar(this.timer); this.timer = null; } }
  pausar(): void { if (this.estado !== 'tocando') return; this.estado = 'pausado'; this.geracao += 1; this.limparTimer(); this.amb.calar(); this.avisar(); }
  /** Retoma no começo do bloco em que parou (a fala é curta). */
  continuar(): void { if (this.estado !== 'pausado') return; this.estado = 'tocando'; this.tocar(); }
  pular(): void { if (!this.ativo()) return; this.geracao += 1; this.limparTimer(); this.amb.calar(); this.i += 1; if (this.estado === 'pausado') { if (this.i >= this.blocos.length) { this.estado = 'fim'; } this.avisar(); } else this.tocar(); }
  parar(avisar = true): void { this.geracao += 1; this.limparTimer(); if (this.estado !== 'parado') this.amb.calar(); this.estado = 'parado'; this.blocos = []; this.i = 0; if (avisar) this.avisar(); }
}

export type IntencaoApresentacao = 'iniciar' | 'integracoes' | 'automatico' | 'pausar' | 'continuar' | 'pular' | 'parar' | 'mostrar_onde' | 'sim' | 'nao' | 'depois';
const limpo = (t: string): string => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Frases curtas de controle (só valem enquanto a apresentação toca) e de pedido (valem sempre). Devolve null se não for nada disso. */
export function intencaoApresentacao(texto: string, contexto: { tocando: boolean; ofertaPendente: boolean }): IntencaoApresentacao | null {
  const t = limpo(texto);
  if (!t || t.length > 70) return null;
  if (contexto.ofertaPendente) {
    if (/^(sim|quero|claro|pode|pode sim|pode contar|vamos|bora|manda ver|quero sim|conta|me conta)( por favor)?$/.test(t)) return 'sim';
    if (/^(depois|mais tarde|agora nao|nao agora|talvez depois|outra hora|outro dia)$/.test(t)) return 'depois';
    if (/^(nao|nao quero|nao obrigado|nao obrigada|dispenso)$/.test(t)) return 'nao';
  }
  if (contexto.tocando) {
    if (/^(para|pare|parar|pausa|pausar|espera|espere|calma)( ai| um pouco| um pouquinho)?$/.test(t)) return 'pausar';
    if (/^(continua|continue|continuar|segue|siga|pode continuar|retoma|retomar|prossiga|pode seguir)$/.test(t)) return 'continuar';
    if (/^(pula|pule|pular|proximo|proximo bloco|pula esse|pula esse bloco|pule esse bloco|pula este bloco|pular esse bloco|pula este)$/.test(t)) return 'pular';
    if (/^(chega|cancela|cancelar|encerra|encerrar|sair|para tudo|pode parar|ja chega|ja deu)$/.test(t)) return 'parar';
    if (/^(me mostra onde|mostra onde|me mostra|onde fica|onde fica isso|me leva la|me leva ate la|mostra na tela|mostra isso na tela)$/.test(t)) return 'mostrar_onde';
  }
  if (/\b(o que|oque) (e|eh) (integrado|que integra)\b|\bintegracoes?\b.{0,25}\b(sistema|contabil|fiscal|dp)\b|\bcom quem (o )?(sistema|contabil)\b.{0,20}\b(conversa|integra|fala)/.test(t)) return 'integracoes';
  if (/\b(o que|oque) (e|eh) automatico\b|\bo que (os )?robos? (faz|fazem)\b|\bo que roda sozinho\b/.test(t)) return 'automatico';
  if (/\b(o que|oque) (o )?(sistema|contabil|murade|murade contabil) faz\b|\bme (conta|conte|fala|fale) (tudo|o que o (sistema|contabil))\b|\b(apresenta|apresente|apresentacao)\b.{0,20}\b(sistema|contabil)\b|\bfala isso (para|pra) mim\b|\bconta tudo\b/.test(t)) return 'iniciar';
  return null;
}
export const secaoDaIntencao = (i: IntencaoApresentacao): SecaoApresentacao | undefined => (i === 'integracoes' ? 'integracoes' : i === 'automatico' ? 'automatico' : undefined);

// ---- Ponte entre a janela de conversa (voz/texto) e o cartão da apresentação ----
export const EVENTO_APRESENTACAO = 'murade:apresentacao';
export type PedidoApresentacao = { acao: 'iniciar'; secao?: SecaoApresentacao; modulo?: string } | { acao: 'oferta' } | { acao: 'sim' | 'nao' | 'depois' | 'pausar' | 'continuar' | 'pular' | 'parar' | 'mostrar_onde' };
export const pedirApresentacao = (p: PedidoApresentacao): void => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_APRESENTACAO, { detail: p })); };

const estadoGlobal = { tocando: false, ofertaPendente: false };
export const definirEstadoApresentacao = (e: Partial<typeof estadoGlobal>): void => { Object.assign(estadoGlobal, e); };
/** Chamada pela janela de conversa ANTES de perguntar à IA: se a frase for da apresentação, trata aqui (sem custo) e devolve true. */
export function tratarFraseDaApresentacao(texto: string): boolean {
  const i = intencaoApresentacao(texto, estadoGlobal);
  if (!i) return false;
  if (i === 'iniciar' || i === 'integracoes' || i === 'automatico') pedirApresentacao({ acao: 'iniciar', secao: secaoDaIntencao(i) });
  else pedirApresentacao({ acao: i });
  return true;
}
