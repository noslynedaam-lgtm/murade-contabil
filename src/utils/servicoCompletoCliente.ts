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
