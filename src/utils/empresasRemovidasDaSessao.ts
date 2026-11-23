// Empresa excluída (aqui, no Fiscal ou no DP) some da tela aberta sem precisar recarregar a página.
// O servidor já tira o acesso na hora; a tela aberta consulta a sessão de tempos em tempos e,
// quando a lista de empresas autorizadas muda, atualiza o seletor do topo e limpa a cópia
// guardada neste navegador das empresas que saíram.

const limpar = (v: unknown) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** true quando as duas listas têm exatamente os mesmos CNPJs (ordem não importa). */
export function mesmosCnpjs(a: string[], b: string[]): boolean {
  const x = new Set(a.map(limpar).filter(Boolean));
  const y = new Set(b.map(limpar).filter(Boolean));
  if (x.size !== y.size) return false;
  for (const c of x) if (!y.has(c)) return false;
  return true;
}

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Tira da cópia local (murad_empresas_lista e murad_empresa_salva) as empresas que não estão mais
 * autorizadas. Devolve quantas foram retiradas. Nunca lança erro (a cópia local é só conveniência).
 */
export function limparEmpresasRemovidasDoNavegador(cnpjsAutorizados: string[], armazenamento: Armazenamento): number {
  const autorizados = new Set(cnpjsAutorizados.map(limpar).filter(Boolean));
  let retiradas = 0;
  try {
    const bruto = armazenamento.getItem("murad_empresas_lista");
    if (bruto) {
      const lista = JSON.parse(bruto);
      if (Array.isArray(lista)) {
        const ficam = lista.filter((e: any) => autorizados.has(limpar(e?.cnpj)));
        retiradas += lista.length - ficam.length;
        if (ficam.length !== lista.length) armazenamento.setItem("murad_empresas_lista", JSON.stringify(ficam));
      }
    }
  } catch { /* cópia local ilegível: o servidor continua sendo a fonte */ }
  try {
    const salva = armazenamento.getItem("murad_empresa_salva");
    if (salva) {
      const e = JSON.parse(salva);
      const c = limpar(e?.cnpj);
      if (c && !autorizados.has(c)) { armazenamento.removeItem("murad_empresa_salva"); retiradas += 1; }
    }
  } catch { /* idem */ }
  return retiradas;
}

export const INTERVALO_CONFERIR_SESSAO_MS = 60_000;
