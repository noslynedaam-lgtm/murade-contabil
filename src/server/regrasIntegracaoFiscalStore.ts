// Regras de integração Fiscal → Contábil (de-para) vindas do sistema anterior pela migração do backup: fornecedor (CNPJ/CPF) → conta,
// código fiscal (CFOP) → contas, e os grupos sintéticos de clientes e de fornecedores do plano. Ficam numa tabela própria (o workspace
// da empresa tem formato fechado e a tela regrava o workspace inteiro), por empresa, com a origem. O reconciliador usa estas regras ao
// montar o pré-lançamento das notas do Fiscal (utils/contasRascunhoFiscal.ts); quem grava confere pela mesma regra.
import type { RegrasIntegracaoContas } from "../utils/contasRascunhoFiscal";

export type Consulta = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type TipoRegra = "fornecedor" | "cfop_entrada" | "cfop_saida" | "grupo_clientes" | "grupo_fornecedores";
export interface RegraIntegracaoLinha { tipo: TipoRegra; chave: string; conta: string; descricao: string; dados?: Record<string, unknown> }

export const TABELA_REGRAS_INTEGRACAO = "contabil_regras_integracao_fiscal";
export async function prepararRegrasIntegracaoFiscal(q: Consulta): Promise<void> {
  await q(`CREATE TABLE IF NOT EXISTS ${TABELA_REGRAS_INTEGRACAO} (cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), tipo text NOT NULL, chave text NOT NULL,
    conta text NOT NULL DEFAULT '', descricao text NOT NULL DEFAULT '', origem text NOT NULL DEFAULT 'sistema_anterior', dados jsonb NOT NULL DEFAULT '{}',
    atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, tipo, chave))`);
}
const existe = async (q: Consulta) => Boolean((await q(`SELECT to_regclass('${TABELA_REGRAS_INTEGRACAO}') AS t`)).rows[0]?.t);

/** Troca as regras que vieram do sistema anterior (as da equipe, se um dia existirem, ficam). Dentro da transação da migração. */
export async function gravarRegrasIntegracaoMigradas(q: Consulta, cnpj: string, regras: RegraIntegracaoLinha[]): Promise<number> {
  await prepararRegrasIntegracaoFiscal(q);
  await q(`DELETE FROM ${TABELA_REGRAS_INTEGRACAO} WHERE cnpj=$1 AND origem='sistema_anterior'`, [cnpj]);
  for (let i = 0; i < regras.length; i += 500) {
    const lote = regras.slice(i, i + 500).map((r) => ({ t: r.tipo, k: r.chave, c: r.conta, d: r.descricao, x: r.dados || {} }));
    await q(`INSERT INTO ${TABELA_REGRAS_INTEGRACAO} (cnpj, tipo, chave, conta, descricao, origem, dados)
      SELECT $1, x->>'t', x->>'k', x->>'c', x->>'d', 'sistema_anterior', x->'x' FROM jsonb_array_elements($2::jsonb) x
      ON CONFLICT (cnpj, tipo, chave) DO NOTHING`, [cnpj, JSON.stringify(lote)]);
  }
  return Number((await q(`SELECT count(*)::int AS n FROM ${TABELA_REGRAS_INTEGRACAO} WHERE cnpj=$1 AND origem='sistema_anterior'`, [cnpj])).rows[0]?.n ?? 0);
}

/** Regras da empresa no formato que o reconciliador usa (null = a empresa não tem regra). Só lê; não falha se a tabela não existe. */
export async function lerRegrasIntegracaoFiscal(q: Consulta, cnpj: string): Promise<RegrasIntegracaoContas | null> {
  if (!(await existe(q))) return null;
  const r = await q(`SELECT tipo, chave, conta FROM ${TABELA_REGRAS_INTEGRACAO} WHERE cnpj=$1 AND conta <> '' AND tipo IN ('fornecedor','cfop_entrada','cfop_saida')`, [cnpj]);
  if (!r.rows.length) return null;
  const out: RegrasIntegracaoContas = { fornecedores: {}, cfopEntrada: {}, cfopSaida: {} };
  for (const x of r.rows) {
    if (x.tipo === "fornecedor") out.fornecedores[String(x.chave)] = String(x.conta);
    else if (x.tipo === "cfop_entrada") out.cfopEntrada[String(x.chave)] = String(x.conta);
    else out.cfopSaida[String(x.chave)] = String(x.conta);
  }
  return out;
}

/** Todas as regras da empresa (tela e Agente IA), com a situação da conta no plano de hoje. */
export async function listarRegrasIntegracaoFiscal(q: Consulta, cnpj: string): Promise<{ regras: Array<RegraIntegracaoLinha & { origem: string; contaNoPlano: "ok" | "nao_existe" | "sintetica" | "sem_conta"; contaNome: string; foraDoGrupo: boolean }>; resumo: Record<string, number> }> {
  if (!(await existe(q))) return { regras: [], resumo: {} };
  const linhas = (await q(`SELECT tipo, chave, conta, descricao, origem, dados FROM ${TABELA_REGRAS_INTEGRACAO} WHERE cnpj=$1 ORDER BY tipo, chave`, [cnpj])).rows;
  const ws = (await q("SELECT payload->'contas' AS contas FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj]).catch(() => ({ rows: [] as any[] }))).rows[0]?.contas;
  const contas = new Map<string, any>((Array.isArray(ws) ? ws : []).map((c: any) => [String(c?.codigo), c]));
  const resumo: Record<string, number> = {};
  // Conta de fornecedor fora do grupo sintético de fornecedores do plano (ex.: em adiantamentos): vale como veio, mas fica para conferir.
  const grupoForn = String(linhas.find((x) => x.tipo === "grupo_fornecedores")?.conta || "");
  const regras = linhas.map((x) => {
    const c = contas.get(String(x.conta));
    const contaNoPlano = !x.conta ? "sem_conta" as const : !c ? "nao_existe" as const : c.tipo !== "analitica" ? "sintetica" as const : "ok" as const;
    resumo[x.tipo] = (resumo[x.tipo] || 0) + 1;
    if (contaNoPlano !== "ok" && x.tipo !== "grupo_clientes" && x.tipo !== "grupo_fornecedores" && x.conta) resumo.contaComProblema = (resumo.contaComProblema || 0) + 1;
    const foraDoGrupo = x.tipo === "fornecedor" && !!grupoForn && !!x.conta && !String(x.conta).startsWith(`${grupoForn}.`);
    if (foraDoGrupo) resumo.foraDoGrupoFornecedores = (resumo.foraDoGrupoFornecedores || 0) + 1;
    return { tipo: x.tipo, chave: x.chave, conta: x.conta, descricao: x.descricao, origem: x.origem, dados: x.dados || {}, contaNoPlano, contaNome: String(c?.descricao || ""), foraDoGrupo };
  });
  return { regras, resumo };
}

/** Empresas com regras (para o robô). */
export async function cnpjsComRegrasIntegracao(q: Consulta): Promise<string[]> {
  if (!(await existe(q))) return [];
  return (await q(`SELECT DISTINCT cnpj FROM ${TABELA_REGRAS_INTEGRACAO} ORDER BY 1`)).rows.map((x) => String(x.cnpj));
}

/** Exclusão da empresa: leva as regras junto. */
export async function apagarRegrasIntegracaoDaEmpresa(q: Consulta, cnpj: string): Promise<number> {
  if (!(await existe(q))) return 0;
  return Number((await q(`DELETE FROM ${TABELA_REGRAS_INTEGRACAO} WHERE cnpj=$1`, [cnpj])).rowCount ?? 0);
}
