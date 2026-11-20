// Detector de dificuldade → serviço completo: quando a pessoa tenta várias vezes e não consegue, a Agente oferece
// "Quer que eu faça esse serviço para você?" e, se aceito, pede o roteiro certo (src/server/servicoCompleto.ts).
// Puro: decide o roteiro pela tela atual e pelo texto do botão em que a pessoa travou.
export type RoteiroCliente = 'fechamento_mensal' | 'ecd_ano' | 'encerramento_resultado' | 'balancete_cliente';
export interface OfertaServico { roteiro: RoteiroCliente; rotulo: string; pedido: string }

const OFERTAS: Record<RoteiroCliente, Omit<OfertaServico, 'roteiro'>> = {
  fechamento_mensal: { rotulo: 'o fechamento do mês', pedido: 'fecha o mês' },
  ecd_ano: { rotulo: 'a ECD do ano', pedido: 'faz a ECD do ano' },
  encerramento_resultado: { rotulo: 'o encerramento do resultado', pedido: 'encerra o resultado do ano' },
  balancete_cliente: { rotulo: 'o balancete e a DRE para o cliente', pedido: 'monta o balancete e a DRE para o cliente' },
};
const TELAS_DO_FECHAMENTO = new Set(['gestao-contabil', 'aprovacoes', 'revisao-origens', 'lancamentos', 'balancete', 'livros']);

export function ofertaDeServico(tela: string, textoBotao: string): OfertaServico | null {
  const t = String(textoBotao || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const de = (r: RoteiroCliente): OfertaServico => ({ roteiro: r, ...OFERTAS[r] });
  if (/\becd\b|sped/.test(t)) return de('ecd_ano');
  if (/encerr/.test(t)) return de('encerramento_resultado');
  if (tela === 'balancete' && /export|csv|pdf|imprim|dre/.test(t)) return de('balancete_cliente');
  if (TELAS_DO_FECHAMENTO.has(tela)) return de('fechamento_mensal');
  return null;
}

/** Frase enviada à Agente quando a pessoa aceita a oferta. */
export function pedidoDaOferta(o: OfertaServico, empresa: { cnpj?: string; razaoSocial?: string; nomeFantasia?: string }): string {
  const cnpj = String(empresa.cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const nome = empresa.razaoSocial || empresa.nomeFantasia || '';
  return `Faça para mim o serviço completo: ${o.pedido}${cnpj.length === 14 ? ` da empresa ${nome ? `${nome}, ` : ''}CNPJ ${cnpj}` : ''}.`;
}

// ---------------------------------------------------------------------------------------------
// Ponto de OK do contador (cartão "Confira e dê o OK" e lembretes)
// ---------------------------------------------------------------------------------------------
export const FRASE_ESPERANDO_OK = 'Estou esperando você conferir e dar o OK para eu continuar.';
/** Primeiro lembrete depois de ~2 minutos com o cartão na tela; depois a cada 15 minutos enquanto a pessoa está no sistema. */
export const PRIMEIRO_LEMBRETE_MS = 2 * 60_000;
export const LEMBRETE_SEGUINTE_MS = 15 * 60_000;
/** Decide se é hora de lembrar, contando só o tempo com o sistema aberto e visível. */
export function horaDeLembrar(msVisivel: number, lembretesFeitos: number): boolean {
  return msVisivel >= PRIMEIRO_LEMBRETE_MS + lembretesFeitos * LEMBRETE_SEGUINTE_MS;
}

const PEDIDOS: Record<string, string> = { fechamento_mensal: 'fecha o mês', ecd_ano: 'faz a ECD do ano', encerramento_resultado: 'encerra o resultado do ano', balancete_cliente: 'monta o balancete e a DRE para o cliente' };
/** Frase enviada à Agente depois do "Conferi, pode seguir" (ou do "Fazer de novo"). */
export function pedidoDeContinuar(s: { roteiro: string; cnpj: string; referencia: string }, depoisDoOk: boolean): string {
  const ref = /^\d{4}-\d{2}$/.test(s.referencia) ? `competência ${s.referencia}` : `ano ${s.referencia}`;
  return `${depoisDoOk ? 'Conferi e dei o OK, pode seguir. Continue o serviço completo: ' : 'Faça de novo o serviço completo: '}${PEDIDOS[s.roteiro] || 'o serviço'} da empresa de CNPJ ${s.cnpj}, ${ref}.`;
}
/** "Conferi, pode seguir": registra o OK no servidor. */
export async function darOkNoServidor(s: { cnpj: string; roteiro: string; referencia: string }): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const r = await fetch('/api/servico-completo/ok', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj: s.cnpj, roteiro: s.roteiro, referencia: s.referencia }) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, mensagem: String(j?.mensagem || j?.motivo || '') };
  } catch { return { ok: false, mensagem: 'Não consegui registrar o OK agora. Tente de novo.' }; }
}
