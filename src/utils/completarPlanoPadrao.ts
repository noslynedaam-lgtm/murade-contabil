// Completar o plano de contas de uma empresa com o plano padrão do Murad — SÓ ACRESCENTA (regra do dono, 23/11/2026).
//
// Nunca troca, renomeia nem apaga conta existente. Uma conta do padrão só entra quando:
//  1. o código dela ainda não existe no plano da empresa;
//  2. o grupo de 1º nível tem o MESMO significado nos dois planos (ex.: "1 Ativo" × "1 ATIVO"). Na Ferragista o "3" é Patrimônio
//     Líquido e o "4" é Receitas, enquanto no padrão "3" é Receita e "4" é Despesas: misturar poria receita dentro do PL. Esses grupos
//     ficam de fora e o conferidor avisa a contadora;
//  3. todo ancestral que já existe na empresa é sintético (conta analítica não pode ganhar filha);
//  4. o assunto do 2º nível do padrão não existe como grupo próprio na empresa (ex.: "2.3 Patrimônio líquido" do padrão não entra
//     quando a empresa já tem "3 PATRIMÔNIO LÍQUIDO"), para não criar dois PL.
import { planoContasModelo } from "../data/planoContasModelo";
import type { ContaPlano } from "../types";

type ContaLeve = { codigo?: unknown; descricao?: unknown; nome?: unknown; tipo?: unknown; nivel?: unknown };

const normal = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const raiz = (t: string) => t.replace(/s$/, "");

/** Mesmo significado no 1º nível: a primeira palavra (sem plural) de uma descrição aparece na outra. */
export function mesmoGrupo(a: unknown, b: unknown): boolean {
  const x = normal(a), y = normal(b);
  if (!x || !y) return false;
  const px = raiz(x.split(" ")[0]), py = raiz(y.split(" ")[0]);
  return px === py || y.split(" ").map(raiz).includes(px) || x.split(" ").map(raiz).includes(py);
}

const ancestrais = (codigo: string): string[] => { const p = codigo.split("."); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join(".")); };

export type ResultadoCompletarPlano = { acrescentar: ContaPlano[]; gruposForaDoPadrao: string[] };

/** Regra pura: o que acrescentar ao plano da empresa. `padrao` existe para teste; o padrão de verdade é o planoContasModelo. */
export function contasParaCompletarPlano(contas: ContaLeve[], padrao: ContaPlano[] = planoContasModelo): ResultadoCompletarPlano {
  const porCodigo = new Map(contas.map((c) => [String(c.codigo ?? "").trim(), c]));
  const descricao = (c: ContaLeve | undefined) => c?.descricao ?? c?.nome ?? "";
  const nivel1Empresa = contas.filter((c) => !String(c.codigo ?? "").includes("."));
  const padraoPorCodigo = new Map(padrao.map((c) => [c.codigo, c]));
  const gruposForaDoPadrao = new Set<string>();
  const acrescentar: ContaPlano[] = [];
  const acrescentados = new Set<string>();
  for (const conta of padrao) {
    if (porCodigo.has(conta.codigo)) continue;
    const anc = ancestrais(conta.codigo);
    const g1 = anc[0] ?? conta.codigo;
    const daEmpresa = porCodigo.get(g1);
    if (daEmpresa && !mesmoGrupo(descricao(daEmpresa), padraoPorCodigo.get(g1)?.descricao)) { gruposForaDoPadrao.add(`${g1} ${String(descricao(daEmpresa)).trim()}`); continue; }
    if (anc.some((a) => porCodigo.has(a) && porCodigo.get(a)?.tipo !== "sintetica")) continue;
    const g2 = padraoPorCodigo.get(anc[1] ?? (anc.length === 1 ? conta.codigo : ""));
    if (g2 && nivel1Empresa.some((c) => String(c.codigo) !== g1 && normal(descricao(c)) === normal(g2.descricao))) continue;
    if (anc.some((a) => !porCodigo.has(a) && !acrescentados.has(a))) continue; // o pai foi barrado acima: a filha também fica de fora
    acrescentar.push({ ...conta });
    acrescentados.add(conta.codigo);
  }
  return { acrescentar, gruposForaDoPadrao: [...gruposForaDoPadrao] };
}

/** Plano "provisório" (pequeno e sem nenhum lançamento definitivo): pode ser completado sozinho pelo robô. Os outros só com o clique. */
export function podeCompletarSozinho(totalContas: number, totalLancamentos: number): boolean {
  return totalLancamentos === 0 && totalContas > 0 && totalContas < 100;
}
