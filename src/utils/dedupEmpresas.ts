// Nenhum sistema mostra a mesma empresa duas vezes: uma por CNPJ (só letras e números, maiúsculas).
// A primeira que veio fica; a cópia repetida sai. Sem CNPJ, vale o id (não junta empresas diferentes sem CNPJ).

export function chaveCnpjEmpresa(cnpj: unknown): string {
  return String(cnpj ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function dedupEmpresasPorCnpj<T extends { cnpj?: string | null; id?: string | null }>(lista: readonly T[]): T[] {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const e of lista || []) {
    if (!e) continue;
    const chave = chaveCnpjEmpresa(e.cnpj) || `id:${e.id ?? ''}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(e);
  }
  return saida;
}

/** CNPJs que aparecem mais de uma vez numa lista (para o robô conferidor "empresa repetida"). */
export function cnpjsRepetidos(lista: readonly { cnpj?: string | null }[]): string[] {
  const conta = new Map<string, number>();
  for (const e of lista || []) { const c = chaveCnpjEmpresa(e?.cnpj); if (c) conta.set(c, (conta.get(c) || 0) + 1); }
  return [...conta.entries()].filter(([, n]) => n > 1).map(([c]) => c).sort();
}
