// Contagem de empresas do escritório — UMA função para todas as telas e para a Murad (o mesmo arquivo existe no DP e no Contábil).
// Pedido do Beny (28/11/2026): a contadora tem 20 empresas; 7 vieram do Fiscal e ainda não foram ativadas aqui. O painel e o app do
// celular mostravam 13 e a Murad dizia 20. Isso não pode acontecer: todo total mostra o número do escritório E a divisão
// ("20 empresas — 13 atendidas no DP, 7 ainda não ativadas aqui (só no Fiscal)"). Nunca esconder empresa sem dizer.

export type ServicoContagem = 'DP' | 'Contábil';
export interface ContagemEmpresas { total: number; atendidas: number; naoAtivadas: number }

const inteiro = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));

export function contagemDe(atendidas: number, naoAtivadas: number): ContagemEmpresas {
  const a = inteiro(atendidas); const n = inteiro(naoAtivadas);
  return { total: a + n, atendidas: a, naoAtivadas: n };
}

/** Conta uma lista pela marca: `naoAtivada(e)` = veio por cópia e ainda não foi ativada neste sistema. Uma por CNPJ. */
export function contarEmpresas<T extends { cnpj?: string | null }>(lista: T[], naoAtivada: (e: T) => boolean): ContagemEmpresas {
  const vistos = new Map<string, boolean>();
  lista.forEach((e, i) => {
    const chave = String(e?.cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || `sem-cnpj-${i}`;
    const nao = naoAtivada(e) === true;
    // A mesma empresa duas vezes: vale "atendida" se qualquer uma estiver ativa.
    vistos.set(chave, vistos.has(chave) ? (vistos.get(chave) as boolean) && nao : nao);
  });
  let n = 0; for (const v of vistos.values()) if (v) n += 1;
  return contagemDe(vistos.size - n, n);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase completa, igual na tela e na Murad. Ex.: "20 empresas — 13 atendidas no DP, 7 ainda não ativadas aqui (só no Fiscal)". */
export function textoContagemEmpresas(c: ContagemEmpresas, servico: ServicoContagem): string {
  if (c.total === 0) return 'Nenhuma empresa cadastrada';
  if (c.naoAtivadas === 0) return `${plural(c.total, 'empresa', 'empresas')}${c.total === 1 ? ' — atendida' : ' — todas atendidas'} no ${servico}`;
  return `${plural(c.total, 'empresa', 'empresas')} — ${plural(c.atendidas, 'atendida', 'atendidas')} no ${servico}, ${plural(c.naoAtivadas, 'ainda não ativada', 'ainda não ativadas')} aqui (só no Fiscal)`;
}

/** Para selo pequeno (menu, badge): "13 de 20" quando há não ativadas; senão só o total. */
export function seloContagemEmpresas(c: ContagemEmpresas): string {
  return c.naoAtivadas > 0 ? `${c.atendidas} de ${c.total}` : String(c.total);
}

/** Texto do atalho para ativar as que faltam (ou vazio quando não falta nenhuma). */
export function textoAtalhoAtivar(c: ContagemEmpresas): string {
  return c.naoAtivadas > 0 ? `Ver e ativar ${c.naoAtivadas === 1 ? 'a que falta' : `as ${c.naoAtivadas} que faltam`}` : '';
}

/** Hash que abre a tela de Empresas com o bloco "ainda não ativadas aqui" aberto. */
export const HASH_ATIVAR_EMPRESAS = 'empresas-nao-ativadas';
