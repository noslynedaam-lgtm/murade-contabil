/**
 * Plano de contas referencial da RFB (ECF Leiaute 12, tabelas dinâmicas de 24/09/2026):
 * L100A/L300A (Lucro Real — PJ em geral) e P100A/P150A (Lucro Presumido — PJ em geral).
 * Sugere o vínculo de cada conta analítica da empresa com uma conta referencial. O vínculo sempre pode ser
 * revisado pelo contador; a sugestão só é marcada como "alta confiança" quando a descrição é muito parecida.
 */
import dados from "../data/planoReferencial.json";
import { ContaPlano } from "../types";

export type RegimeReferencial = "real" | "presumido";
export type GrupoReferencial = "patrimonial" | "resultado";

export interface ContaReferencial { codigo: string; descricao: string; tipo: "S" | "A"; natureza: string; superior: string }
export interface SugestaoReferencial {
  contaCodigo: string;
  candidatos: Array<{ codigo: string; descricao: string; pontuacao: number }>;
  /** "alta" = escolha automática segura; "revisar" = o contador precisa escolher. */
  confianca: "alta" | "revisar" | "sem-sugestao";
}

const bruto = dados as unknown as Record<string, Record<string, string[][]>>;
export const FONTE_PLANO_REFERENCIAL = String((dados as unknown as { fonte: string }).fonte);

export function regimeReferencial(regime: string): RegimeReferencial | null {
  const r = String(regime || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/lucro\s+real/.test(r)) return "real";
  if (/lucro\s+presumido/.test(r)) return "presumido";
  return null;
}

/** Código do campo 0000.COD_PLAN_REF da ECD para o regime (1 = PJ em geral – Lucro Real, 2 = PJ em geral – Lucro Presumido). */
export function codPlanRefECD(regime: RegimeReferencial): "1" | "2" { return regime === "real" ? "1" : "2"; }

export function contasReferenciais(regime: RegimeReferencial, grupo: GrupoReferencial): ContaReferencial[] {
  return (bruto[regime]?.[grupo] || []).map(([codigo, descricao, tipo, superior, natureza]) => ({ codigo, descricao, tipo: tipo === "A" ? "A" : "S", natureza, superior: superior || "" }));
}

export function existeContaReferencialAnalitica(regime: RegimeReferencial, codigo: string): boolean {
  return (["patrimonial", "resultado"] as GrupoReferencial[]).some((g) => contasReferenciais(regime, g).some((c) => c.codigo === codigo && c.tipo === "A"));
}

const STOP = new Set(["de", "da", "do", "das", "dos", "a", "o", "e", "em", "no", "na", "nos", "nas", "para", "por", "com", "a", "s", "ltda"]);
function tokens(texto: string): string[] {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((t) => t && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}
function pontuar(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const inter = a.filter((t) => sb.has(t)).length;
  const jaccard = inter / (new Set([...a, ...b]).size);
  const cobertura = inter / a.length; // quanto da descrição da conta da empresa aparece na referencial
  return Math.round((jaccard * 0.5 + cobertura * 0.5) * 1000) / 1000;
}

/** Natureza ECD (COD_NAT) → grupo do plano referencial: Ativo/Passivo/PL = patrimonial; Resultado = resultado. */
export function grupoPorNaturezaECD(codNat: string): GrupoReferencial | null {
  if (["01", "02", "03"].includes(codNat)) return "patrimonial";
  if (codNat === "04") return "resultado";
  return null;
}

export function sugerirMapeamento(
  contas: ContaPlano[],
  regime: RegimeReferencial,
  naturezaPorConta: Map<string, string>,
  jaMapeadas: Record<string, string> = {},
): SugestaoReferencial[] {
  const cache = new Map<GrupoReferencial, Array<ContaReferencial & { tk: string[] }>>();
  const base = (g: GrupoReferencial) => {
    if (!cache.has(g)) cache.set(g, contasReferenciais(regime, g).filter((c) => c.tipo === "A").map((c) => ({ ...c, tk: tokens(c.descricao) })));
    return cache.get(g)!;
  };
  const resultado: SugestaoReferencial[] = [];
  for (const conta of contas.filter((c) => c.tipo === "analitica")) {
    if (jaMapeadas[conta.codigo]) continue;
    const grupo = grupoPorNaturezaECD(naturezaPorConta.get(conta.codigo) || "");
    if (!grupo) { resultado.push({ contaCodigo: conta.codigo, candidatos: [], confianca: "sem-sugestao" }); continue; }
    const tk = tokens(conta.descricao);
    const candidatos = base(grupo)
      .map((c) => ({ codigo: c.codigo, descricao: c.descricao, pontuacao: pontuar(tk, c.tk) }))
      .filter((c) => c.pontuacao > 0)
      .sort((a, b) => b.pontuacao - a.pontuacao || a.codigo.localeCompare(b.codigo))
      .slice(0, 5);
    const [p, s] = candidatos;
    const confianca: SugestaoReferencial["confianca"] = !p ? "sem-sugestao" : p.pontuacao >= 0.75 && (!s || p.pontuacao - s.pontuacao >= 0.15) ? "alta" : "revisar";
    resultado.push({ contaCodigo: conta.codigo, candidatos, confianca });
  }
  return resultado;
}
