// Exclusão COMPLETA de UMA empresa (um CNPJ) no Murade Contábil e aviso ao hub do Fiscal.
//
// Regras do dono dos sistemas Murade:
//  - apagar é UMA empresa por vez (nunca em lote) e com confirmação antes (tela e voz);
//  - nunca bloquear CNPJ nem e-mail: só apagar os registros, para poder cadastrar de novo no futuro;
//  - a escrituração (lançamentos, fechamentos, ECD e trilhas de auditoria) NÃO é perdida: ver PRESERVADOS.
import { urlDoSistema } from './agentesEntreSistemas';

export type ConsultaSql = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface BancoTransacional { transacao<T>(fn: (consultar: ConsultaSql) => Promise<T>): Promise<T>; consultar: ConsultaSql }

/** O que a exclusão apaga (chave = nome mostrado na resposta). */
export interface Apagados { acessosDeUsuarios: number; empresaCompartilhada: number; workspace: number; atividadeEquipe: number }

/** Tabelas por CNPJ que a exclusão NÃO toca. A escrituração mora no payload do workspace: por isso ele é copiado para o arquivo antes de apagar. */
export const PRESERVADOS = [
  'contabil_period_closures',
  'contabil_accounting_approval_audit',
  'contabil_manual_journal_audit',
  'contabil_manual_journal_events',
  'contabil_opening_balance_audit',
  'contabil_ai_agent_log',
  'murade_documentos_fiscais_origem',
  'murade_documentos_fiscais_versoes',
  'murade_apuracoes_fiscais_origem',
  'murade_folhas_dp_origem',
  'murade_eventos_dp_origem',
  'murade_prolabore_dp_origem',
  'contabil_empresas_excluidas_arquivo (cópia da escrituração e da ECD do workspace apagado)',
] as const;

export const TABELA_ARQUIVO = 'contabil_empresas_excluidas_arquivo';
const SQL_ARQUIVO = `CREATE TABLE IF NOT EXISTS ${TABELA_ARQUIVO} (
  id bigserial PRIMARY KEY, cnpj text NOT NULL, payload jsonb, versao bigint, cadastro_compartilhado jsonb,
  excluido_em timestamptz NOT NULL DEFAULT now(), excluido_por text, origem text
)`;

export function normalizarCnpjExclusao(v: unknown): string { return String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }

export interface ResultadoExclusao { sucesso: true; cnpj: string; apagados: Apagados; preservados: string[]; jaNaoExistia: boolean }

/** Remove a empresa de TODOS os usuários do Contábil. Idempotente: repetir devolve zeros e jaNaoExistia=true. */
export async function removerEmpresaCompleta(banco: BancoTransacional, cnpjBruto: string, quem: { por?: string; origem?: string } = {}): Promise<ResultadoExclusao> {
  const cnpj = normalizarCnpjExclusao(cnpjBruto);
  await banco.consultar(SQL_ARQUIVO);
  const apagados = await banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    // 1) copia a escrituração para o arquivo (só se o workspace existe), antes de apagar
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    if (ws.rows.length) {
      const comp = await q('SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1', [cnpj]);
      await q(`INSERT INTO ${TABELA_ARQUIVO}(cnpj,payload,versao,cadastro_compartilhado,excluido_por,origem) VALUES($1,$2::jsonb,$3,$4::jsonb,$5,$6)`,
        [cnpj, JSON.stringify(ws.rows[0].payload ?? null), ws.rows[0].version ?? null, comp.rows[0]?.dados ? JSON.stringify(comp.rows[0].dados) : null, quem.por ?? null, quem.origem ?? null]);
    }
    const n = async (sql: string) => Number((await q(sql, [cnpj])).rowCount ?? 0);
    const acessos = await n('DELETE FROM contabil_auth_company_access WHERE cnpj=$1');
    const comp = await n('DELETE FROM contabil_empresas_compartilhadas WHERE cnpj=$1');
    const work = await n('DELETE FROM contabil_company_workspaces WHERE cnpj=$1');
    // A tabela de atividade só existe depois do primeiro registro de atividade do escritório.
    const existe = await q("SELECT to_regclass('contabil_atividade_equipe') AS t", []);
    const ativ = existe.rows[0]?.t ? await n('DELETE FROM contabil_atividade_equipe WHERE cnpj=$1') : 0;
    return { acessosDeUsuarios: acessos, empresaCompartilhada: comp, workspace: work, atividadeEquipe: ativ } as Apagados;
  });
  const total = apagados.acessosDeUsuarios + apagados.empresaCompartilhada + apagados.workspace + apagados.atividadeEquipe;
  return { sucesso: true, cnpj, apagados, preservados: [...PRESERVADOS], jaNaoExistia: total === 0 };
}

export interface ResultadoHub { avisado: boolean; status?: number; motivo?: string; resposta?: unknown }

/** Avisa o hub do Fiscal (best-effort, timeout curto). Nunca lança: a exclusão local já foi feita. */
export async function avisarHubFiscal(cnpj: string, por: string, env: Record<string, string | undefined> = process.env, buscar: typeof fetch = fetch, limiteMs = 6000): Promise<ResultadoHub> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { avisado: false, motivo: 'MURADE_INTEGRATION_TOKEN não configurado: o Fiscal não foi avisado.' };
  try {
    const r = await buscar(`${urlDoSistema('fiscal', env)}/api/integracao/empresa/${encodeURIComponent(normalizarCnpjExclusao(cnpj))}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ origem: 'contabil', por }), signal: AbortSignal.timeout(limiteMs),
    });
    const corpo = await r.json().catch(() => null);
    return r.ok ? { avisado: true, status: r.status, resposta: corpo } : { avisado: false, status: r.status, motivo: `O Fiscal respondeu com erro (${r.status}).`, resposta: corpo };
  } catch { return { avisado: false, motivo: 'O Fiscal não respondeu a tempo; a empresa já foi removida do Contábil e o Robô Conferidor avisa se algo sobrar.' }; }
}

/** Robô conferidor: CNPJs que o Fiscal declara excluídos (lápide) mas que ainda têm acesso, cadastro ou workspace no Contábil. Só lê. */
export async function sobrasDeEmpresasExcluidas(consultar: ConsultaSql, excluidosNoFiscal: string[]): Promise<string[]> {
  const lista = [...new Set(excluidosNoFiscal.map(normalizarCnpjExclusao).filter((c) => c.length === 14))];
  if (!lista.length) return [];
  const r = await consultar(`SELECT cnpj FROM (
      SELECT cnpj FROM contabil_auth_company_access UNION SELECT cnpj FROM contabil_empresas_compartilhadas UNION SELECT cnpj FROM contabil_company_workspaces
    ) t WHERE cnpj = ANY($1::text[]) ORDER BY cnpj`, [lista]);
  return r.rows.map((x) => String(x.cnpj));
}
