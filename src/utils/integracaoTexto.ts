// Texto da situação REAL da ligação Fiscal→Contábil e DP→Contábil, lido de /api/integracao/status
// (o que de fato chegou e ficou gravado no Contábil), em vez de "pendente" fixo na tela.

export function haQuanto(iso: string | null | undefined, agora: Date = new Date()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export interface EstadoOrigem { disponivel?: boolean; ultimoRecebimento?: string | null; documentosRecebidos?: number; folhasRecebidas?: number }

/** "Murade Fiscal: conectado — última atualização há 5 min" / "aguardando o primeiro envio" / "não consegui confirmar". */
export function textoOrigem(nome: string, e: EstadoOrigem | null | undefined, agora: Date = new Date()): { texto: string; ok: boolean } {
  if (!e || e.disponivel !== true) return { texto: `${nome}: não consegui confirmar agora`, ok: false };
  const quando = haQuanto(e.ultimoRecebimento, agora);
  const qtd = Number(e.documentosRecebidos ?? e.folhasRecebidas ?? 0) || 0;
  if (!quando || qtd === 0) return { texto: `${nome}: ligado — aguardando o primeiro envio`, ok: true };
  return { texto: `${nome}: conectado — última atualização ${quando}`, ok: true };
}
