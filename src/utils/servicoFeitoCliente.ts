import { confirmarNaTela } from './dialogoNaTela';

// Cliente do anti-retrabalho: lê as respostas 409 do servidor ("já foi feito" / "alguém está fazendo") e mostra o aviso
// com o nome de quem fez. Nada aqui decide sozinho: quem decide é o servidor (src/server/servicoFeito.ts).
export const EVENTO_AVISO_SERVICO = 'murade:aviso-servico';

export interface AvisoServico { titulo: string; texto: string; tom: 'bloqueio' | 'andamento' }

export function mostrarAvisoServico(aviso: AvisoServico): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<AvisoServico>(EVENTO_AVISO_SERVICO, { detail: aviso }));
}

/** true quando a resposta era um bloqueio de duplicidade (ou um cancelamento da pessoa) e já foi mostrada; o chamador só encerra. */
export function tratarBloqueioServico(resultado: any): boolean {
  if (resultado?.codigo === 'servico_ja_feito' && typeof resultado.motivo === 'string') {
    mostrarAvisoServico({ titulo: 'Este serviço já foi feito', texto: resultado.motivo, tom: 'bloqueio' });
    return true;
  }
  return resultado?.codigo === 'servico_cancelado';
}

/**
 * fetch que, quando o servidor avisa que OUTRA pessoa está fazendo o mesmo serviço agora, pergunta se quer continuar
 * e só então repete o pedido com confirmarFazendo. Qualquer outra resposta passa direto, sem mudança.
 */
export async function fetchComGuarda(url: string, init: RequestInit): Promise<Response> {
  const resposta = await fetch(url, init);
  if (resposta.status !== 409) return resposta;
  const dados = await resposta.clone().json().catch(() => ({}));
  if (dados?.codigo !== 'servico_em_andamento') return resposta;
  const seguir = await confirmarNaTela(`${dados.motivo}\n\nContinuar mesmo assim?`);
  if (!seguir) return new Response(JSON.stringify({ sucesso: false, codigo: 'servico_cancelado', motivo: 'Você preferiu não continuar.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  let corpo: Record<string, unknown> = {};
  try { corpo = JSON.parse(String(init.body ?? '{}')); } catch { /* corpo não JSON: reenvia só a confirmação */ }
  return fetch(url, { ...init, body: JSON.stringify({ ...corpo, confirmarFazendo: true }) });
}
