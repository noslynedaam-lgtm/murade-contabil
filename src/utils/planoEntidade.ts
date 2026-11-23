// Plano de contas da entidade sem finalidade de lucros (igrejas, associações, entidades beneficentes, sindicatos, partidos, fundações).
// Norma: ITG 2002 (R1) do Conselho Federal de Contabilidade e a norma que ela substituiu (NBC T 10.19 / Entidade sem finalidade de lucros,
// CFC — https://cfc.org.br/wp-content/uploads/2016/02/Entidadesemfinalidadedelucro.pdf):
//  - a conta Capital passa a se chamar Patrimônio Social, e lucro/prejuízo passa a ser superávit ou déficit (item 27; DRE, DMPL e DFC
//    com "superávit ou déficit", itens 28, 30 e 31);
//  - doações, subvenções e contribuições para fins específicos em contas separadas (item 18); convênios e subvenções sujeitos a prestação
//    de contas em contas separadas (item 19); enquanto não cumpridas as condições, a contrapartida fica em conta específica do passivo (item 16);
//  - receitas e despesas segregadas por tipo de atividade (itens 17 e 29); gratuidades registradas à parte, podendo usar contas de
//    compensação (itens 20 e 25, "b").
// O trabalho voluntário (ITG 2002 (R1), item 19) entra como conta própria; o valor é reconhecido pelo valor justo — confira a norma.
// Só ACRESCENTA contas e renomeia as duas contas do modelo padrão; nunca apaga conta nem mexe em lançamento.
import type { ContaPlano } from "../types";

export const FONTE_PLANO_ENTIDADE = { nome: "CFC — ITG 2002 (R1) e norma de Entidade sem finalidade de lucros (itens 16 a 31)", url: "https://cfc.org.br/wp-content/uploads/2016/02/Entidadesemfinalidadedelucro.pdf" };
export const ehRegimeEntidade = (regime: unknown) => /entidade\s+(imune|isenta)|\bimune\b|\bisenta\b|sem\s+fins\s+lucrativos/i.test(String(regime || ""));

const NOVAS: ContaPlano[] = [
  { codigo: "2.1.11", descricao: "Recursos com restrição a aplicar (doações, subvenções e convênios)", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1.11.01", descricao: "Subvenções e convênios públicos a aplicar", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "2.1.11.02", descricao: "Doações com restrição a aplicar", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4", descricao: "Receitas da entidade sem finalidade de lucros", nivel: 2, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.01", descricao: "Receitas das atividades próprias", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.01.01", descricao: "Contribuições e mensalidades de associados", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.01.02", descricao: "Dízimos e ofertas", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.01.03", descricao: "Receitas de serviços da atividade própria", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.02", descricao: "Doações", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.02.01", descricao: "Doações sem restrição", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.02.02", descricao: "Doações com restrição (fins específicos)", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.03", descricao: "Subvenções e convênios", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.03.01", descricao: "Subvenções e convênios públicos", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.04", descricao: "Trabalho voluntário (valor justo)", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.04.01", descricao: "Receita de trabalho voluntário", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "3.4.05", descricao: "Receitas que não são da atividade própria (sujeitas à COFINS)", nivel: 3, tipo: "sintetica", natureza: "C" },
  { codigo: "3.4.05.01", descricao: "Vendas de mercadorias e outras receitas não próprias", nivel: 4, tipo: "analitica", natureza: "C" },
  { codigo: "4.8", descricao: "Despesas da entidade sem finalidade de lucros", nivel: 2, tipo: "sintetica", natureza: "D" },
  { codigo: "4.8.01", descricao: "Gratuidades concedidas", nivel: 3, tipo: "sintetica", natureza: "D" },
  { codigo: "4.8.01.01", descricao: "Gratuidades — educação, saúde e assistência social", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "4.8.02", descricao: "Trabalho voluntário", nivel: 3, tipo: "sintetica", natureza: "D" },
  { codigo: "4.8.02.01", descricao: "Despesa de trabalho voluntário (valor justo)", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "4.8.03", descricao: "Aplicação de recursos com restrição", nivel: 3, tipo: "sintetica", natureza: "D" },
  { codigo: "4.8.03.01", descricao: "Despesas com recursos de subvenções e convênios", nivel: 4, tipo: "analitica", natureza: "D" },
];
const RENOMEAR: Array<{ de: RegExp; para: string }> = [
  { de: /^capital social$/i, para: "Patrimônio Social" },
  { de: /^preju[ií]zos\/d[eé]ficits acumulados ou resultado$/i, para: "Superávit ou Déficit Acumulado" },
];

export interface ResultadoPlanoEntidade { contas: ContaPlano[]; acrescentadas: string[]; renomeadas: Array<{ codigo: string; de: string; para: string }>; mudou: boolean }

/** Acrescenta as contas que faltam e renomeia Capital Social → Patrimônio Social (só nomes do modelo padrão). Idempotente. */
export function adaptarPlanoParaEntidade(contas: ContaPlano[]): ResultadoPlanoEntidade {
  const out = contas.map((c) => ({ ...c }));
  const codigos = new Set(out.map((c) => c.codigo));
  const renomeadas: ResultadoPlanoEntidade["renomeadas"] = [];
  for (const c of out) for (const r of RENOMEAR) if (r.de.test(String(c.descricao || "").trim())) { renomeadas.push({ codigo: c.codigo, de: c.descricao, para: r.para }); c.descricao = r.para; }
  const acrescentadas: string[] = [];
  for (const n of NOVAS) {
    if (codigos.has(n.codigo)) continue;
    const pai = n.codigo.split(".").slice(0, -1).join(".");
    if (pai && !codigos.has(pai) && !NOVAS.some((x) => x.codigo === pai)) continue; // sem a conta-mãe no plano: não inventa a estrutura
    out.push({ ...n }); codigos.add(n.codigo); acrescentadas.push(n.codigo);
  }
  return { contas: out, acrescentadas, renomeadas, mudou: acrescentadas.length > 0 || renomeadas.length > 0 };
}

/** Já está no formato da entidade? (tem Patrimônio Social e as receitas da entidade). */
export function planoEstaComoEntidade(contas: ContaPlano[]): boolean {
  return contas.some((c) => /patrim[oô]nio social/i.test(String(c.descricao))) && contas.some((c) => c.codigo === "3.4");
}

/** Nome das demonstrações para a entidade (superávit/déficit no lugar de lucro/prejuízo). */
export const NOMES_DEMONSTRACOES_ENTIDADE = { dre: "Demonstração do Superávit ou Déficit do Período", dmpl: "Demonstração das Mutações do Patrimônio Social", resultado: "Superávit ou Déficit do Exercício" } as const;
