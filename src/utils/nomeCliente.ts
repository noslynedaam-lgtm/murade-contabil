// Pergunta do nome na primeira entrada ("Como posso te chamar?"): a ponte entre a janela de conversa (voz ou texto) e o cartão pequeno.
// Texto fixo, sem IA. Se a frase dita não parecer um nome (ex.: uma pergunta qualquer), NÃO é tratada aqui e segue o fluxo normal da conversa.
import { extrairNomeDaResposta } from '../server/agenteSaudacao';

export const EVENTO_NOME = 'murade:nome';
const estado = { aberta: false };
export const definirPerguntaDoNomeAberta = (v: boolean): void => { estado.aberta = v; };
export const perguntaDoNomeAberta = (): boolean => estado.aberta;

/** Chamada pela janela de conversa ANTES de perguntar à IA: se o cartão do nome está aberto e a frase é um nome, entrega ao cartão e devolve true. */
export function tratarRespostaDoNome(texto: string): boolean {
  if (!estado.aberta || typeof window === 'undefined') return false;
  const nome = extrairNomeDaResposta(texto);
  if (!nome) return false;
  window.dispatchEvent(new CustomEvent(EVENTO_NOME, { detail: { nome } }));
  return true;
}
