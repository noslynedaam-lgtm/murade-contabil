export interface ItemFiltravel { id: string; rotulo: string; tipo: string; palavras?: string }

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Cada palavra digitada precisa começar uma palavra do item ("das" não acha "cadastrar"); palavra inteira vem primeiro. */
export function filtrarItensBusca<T extends ItemFiltravel>(itens: T[], texto: string): T[] {
  const termos = normalizar(texto).split(/\s+/).filter((t) => t.length >= 2);
  if (termos.length === 0) return itens.filter((i) => i.tipo === "Módulo").slice(0, 6);
  return itens
    .map((i) => {
      const palavras = normalizar(`${i.rotulo} ${i.palavras || ""}`).split(/[^a-z0-9]+/).filter(Boolean);
      if (!termos.every((t) => palavras.some((w) => w.startsWith(t)))) return null;
      const doRotulo = normalizar(i.rotulo).split(/[^a-z0-9]+/).filter(Boolean);
      // Palavra inteira no título pesa mais que nos sinônimos.
      return { i, exatas: termos.reduce((total, t) => total + (doRotulo.includes(t) ? 2 : palavras.includes(t) ? 1 : 0), 0) };
    })
    .filter((r): r is { i: T; exatas: number } => r !== null)
    .sort((a, b) => b.exatas - a.exatas)
    .slice(0, 8)
    .map((r) => r.i);
}
