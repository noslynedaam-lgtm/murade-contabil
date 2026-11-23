// Exclusão COMPLETA de UMA empresa (um CNPJ) no Murade Contábil e aviso ao hub do Fiscal.
//
// Regras do dono dos sistemas Murade:
//  - apagar é UMA empresa por vez (nunca em lote) e com confirmação antes (tela e voz);
//  - nunca bloquear CNPJ nem e-mail: só apagar os registros, para poder cadastrar de novo no futuro;
//  - o que a lei manda guardar vai cifrado para o ARQUIVO MORTO do escritório (arquivoMorto.ts); o operacional sai sem cópia.
import { urlDoSistema } from './agentesEntreSistemas';
import { guardarNoArquivoMorto } from './arquivoMorto';

export type ConsultaSql = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface BancoTransacional { transacao<T>(fn: (consultar: ConsultaSql) => Promise<T>): Promise<T>; consultar: ConsultaSql }

/** O que a exclusão apaga (chave = nome mostrado na resposta). */
export interface Apagados { acessosDeUsuarios: number; empresaCompartilhada: number; workspace: number; atividadeEquipe: number; sistemaAnterior: number; titulos: number; cartoes: number; extrato: number; guardadosNoArquivoMorto: number; operacionais: number }



/** O que tem guarda legal vai para o ARQUIVO MORTO cifrado do escritório (arquivoMorto.ts) e sai das tabelas vivas. Lista mostrada na resposta. */
export const PRESERVADOS = [
  'Arquivo morto cifrado do escritório (escondido; só o administrador recupera): escrituração do workspace, fechamentos, trilhas de aprovação e de lançamentos manuais, saldos de abertura, e-Lalur/e-Lacs e apuração do Lucro Real, e os documentos recebidos do Fiscal e do DP',
] as const;

export const TABELA_ARQUIVO = 'contabil_empresas_excluidas_arquivo';
const SQL_ARQUIVO = `CREATE TABLE IF NOT EXISTS ${TABELA_ARQUIVO} (
  id bigserial PRIMARY KEY, cnpj text NOT NULL, payload jsonb, versao bigint, cadastro_compartilhado jsonb,
  excluido_em timestamptz NOT NULL DEFAULT now(), excluido_por text, origem text
)`;

export { semDadosDoSistemaAnterior } from './arquivoMorto';

export function normalizarCnpjExclusao(v: unknown): string { return String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }

export interface ResultadoExclusao { sucesso: true; cnpj: string; apagados: Apagados; preservados: string[]; jaNaoExistia: boolean }

/** Remove a empresa de TODOS os usuários do Contábil. Idempotente: repetir devolve zeros e jaNaoExistia=true. */
export async function removerEmpresaCompleta(banco: BancoTransacional, cnpjBruto: string, quem: { por?: string; origem?: string } = {}): Promise<ResultadoExclusao> {
  const cnpj = normalizarCnpjExclusao(cnpjBruto);
  const apagados = await banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    // 1) copia a escrituração para o arquivo (só se o workspace existe), antes de apagar
    // 1) o que tem guarda legal vai cifrado para o arquivo morto do escritório e sai das tabelas vivas (antes de apagar o vínculo, que diz qual é o escritório)
    const guarda = await guardarNoArquivoMorto(q, cnpj, { por: quem.por });
    const n = async (sql: string) => Number((await q(sql, [cnpj])).rowCount ?? 0);
    const acessos = await n('DELETE FROM contabil_auth_company_access WHERE cnpj=$1');
    const comp = await n('DELETE FROM contabil_empresas_compartilhadas WHERE cnpj=$1');
    const work = await n('DELETE FROM contabil_company_workspaces WHERE cnpj=$1');
    // A tabela de atividade só existe depois do primeiro registro de atividade do escritório.
    const existe = await q("SELECT to_regclass('contabil_atividade_equipe') AS t", []);
    const ativ = existe.rows[0]?.t ? await n('DELETE FROM contabil_atividade_equipe WHERE cnpj=$1') : 0;
    // O que veio do sistema anterior (registro por bloco) sai junto: só existe depois da primeira migração.
    const existeAnterior = await q("SELECT to_regclass('contabil_sistema_anterior') AS t", []);
    const anterior = existeAnterior.rows[0]?.t ? await n('DELETE FROM contabil_sistema_anterior WHERE cnpj=$1') : 0;
    // Títulos, cartões (antiga DIRF) e extrato guardado também saem (cada tabela só existe depois do primeiro uso).
    const seExiste = async (tabela: string) => ((await q(`SELECT to_regclass('${tabela}') AS t`, [])).rows[0]?.t ? n(`DELETE FROM ${tabela} WHERE cnpj=$1`) : 0);
    const titulos = await seExiste('contabil_titulos');
    const cartoes = await seExiste('contabil_cartoes');
    const extrato = await seExiste('contabil_extrato_movimentos');
    return { acessosDeUsuarios: acessos, empresaCompartilhada: comp, workspace: work, atividadeEquipe: ativ, sistemaAnterior: anterior, titulos, cartoes, extrato, guardadosNoArquivoMorto: guarda.guardados, operacionais: guarda.operacionais } as Apagados;
  });
  const total = apagados.acessosDeUsuarios + apagados.empresaCompartilhada + apagados.workspace + apagados.atividadeEquipe + apagados.sistemaAnterior + apagados.titulos + apagados.cartoes + apagados.extrato + apagados.guardadosNoArquivoMorto + apagados.operacionais;
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
