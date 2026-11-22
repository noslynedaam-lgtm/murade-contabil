// Gravação da migração do sistema anterior no banco do Contábil, numa transação por empresa:
// workspace (plano, históricos, lançamentos), acesso da empresa no escritório de quem migra e o registro
// "do sistema anterior" (tudo o que veio do arquivo, por bloco, para consulta). Tudo ou nada.
import type { ContaPlano } from '../../types';
import type { BancoTransacional, ConsultaSql } from '../exclusaoEmpresaCascata';
import { urlDoSistema } from '../agentesEntreSistemas';
import type { DadosContabeisEmpresa } from './conversor';
import { conferirMigracao, type ReferenciaConferencia, type ResultadoConferencia } from './conferencia';
import { mesclarMigracao } from './mesclagem';

export const TABELA_SISTEMA_ANTERIOR = 'contabil_sistema_anterior';
export const BLOCO_RESUMO = '__migracao';
const SQL_TABELA = `CREATE TABLE IF NOT EXISTS ${TABELA_SISTEMA_ANTERIOR} (
  cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), bloco text NOT NULL, linhas jsonb NOT NULL, quantidade integer NOT NULL,
  migrado_em timestamptz NOT NULL DEFAULT now(), migrado_por text, PRIMARY KEY (cnpj, bloco)
)`;

export class ErroMigracao extends Error {}

export interface QuemMigra { userId: string; login: string; escritorioId: string; tenantId: string }
export interface ResultadoGravacaoEmpresa {
  cnpj: string; contasNovas: number; contasAtualizadas: number; contasDoModeloRetiradas: number; historicosNovos: number;
  lancamentos: number; lancamentosSubstituidos: number; lancamentosDaEquipe: number; blocos: number; linhasGuardadas: number;
  versao: number; avisos: string[]; conferencia: ResultadoConferencia;
}

export interface ResumoMigracaoGuardado extends ReferenciaConferencia {
  cdempresa: number; nomePlano: string; migradoEm: string; migradoPor: string; lidos: Record<string, number>;
  naoEntraram: DadosContabeisEmpresa['naoEntraram']; avisos: string[]; conferenciaNaGravacao: string;
}

export async function prepararTabelaSistemaAnterior(consultar: ConsultaSql): Promise<void> { await consultar(SQL_TABELA); }

/** Grava UMA empresa. Lança ErroMigracao com o motivo (em português) quando a empresa não pode ser gravada; nada fica pela metade. */
export async function gravarEmpresaMigrada(
  banco: BancoTransacional, dados: DadosContabeisEmpresa, quem: QuemMigra,
  opcoes: { modelo: ContaPlano[]; validar: (payload: Record<string, unknown>) => boolean; competenciaAtual: string; agora?: Date },
): Promise<ResultadoGravacaoEmpresa> {
  const cnpj = dados.cnpj;
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) throw new ErroMigracao('CNPJ inválido para gravar.');
  await prepararTabelaSistemaAnterior(banco.consultar);
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const outro = await q('SELECT 1 FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND COALESCE(u.tenant_id,u.id)::text<>$2 LIMIT 1', [cnpj, quem.tenantId]);
    if (outro.rows.length) throw new ErroMigracao('Este CNPJ já está cadastrado em outro escritório. Cada empresa pertence a um único escritório; nada foi gravado.');
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    const fechadas = new Set((await q('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj])).rows.map((r) => String(r.competencia)));
    const comp = ws.rows.length ? null : (await q('SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1', [cnpj])).rows[0]?.dados ?? null;
    const m = mesclarMigracao(ws.rows[0]?.payload ?? null, dados, { modelo: opcoes.modelo, cadastroCompartilhado: comp, competenciaAtual: opcoes.competenciaAtual, fechadas });
    if (!m.payload) throw new ErroMigracao(m.bloqueio || 'Não foi possível juntar os dados com o que já existe no Murade.');
    if (!opcoes.validar(m.payload)) throw new ErroMigracao('Os dados juntados não passaram na validação do Contábil; nada foi gravado.');
    let versao: number;
    if (ws.rows.length) {
      const r = await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1 RETURNING version', [cnpj, JSON.stringify(m.payload)]);
      versao = Number(r.rows[0].version);
    } else {
      const r = await q('INSERT INTO contabil_company_workspaces(cnpj,payload,version) VALUES($1,$2::jsonb,1) RETURNING version', [cnpj, JSON.stringify(m.payload)]);
      versao = Number(r.rows[0].version);
    }
    await q("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'admin') ON CONFLICT(user_id,cnpj) DO NOTHING", [quem.escritorioId, cnpj]);
    const conferencia = conferirMigracao(m.payload.contas, m.payload.lancamentos, {
      esperado: dados.esperado, esperadoLancamentos: dados.esperadoLancamentos, saldoFinalEsperado: dados.saldoFinalEsperado,
      lancamentosGravados: dados.lancamentos.length, semSaldosParaConferir: dados.semSaldosParaConferir, linhasQueNaoEntraram: dados.naoEntraram.length,
    });
    const resumo: ResumoMigracaoGuardado = {
      cdempresa: dados.cdempresa, nomePlano: dados.nomePlano, migradoEm: (opcoes.agora || new Date()).toISOString(), migradoPor: quem.login, lidos: dados.lidos,
      esperado: dados.esperado, esperadoLancamentos: dados.esperadoLancamentos, saldoFinalEsperado: dados.saldoFinalEsperado,
      lancamentosGravados: dados.lancamentos.length, semSaldosParaConferir: dados.semSaldosParaConferir, linhasQueNaoEntraram: dados.naoEntraram.length,
      naoEntraram: dados.naoEntraram, avisos: [...dados.avisos, ...m.avisos], conferenciaNaGravacao: conferencia.resumo,
    };
    await q(`DELETE FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1`, [cnpj]);
    let linhasGuardadas = 0;
    const blocos = Object.entries(dados.blocos);
    for (const [bloco, linhas] of blocos) {
      await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, bloco, JSON.stringify(linhas), linhas.length, quem.login]);
      linhasGuardadas += linhas.length;
    }
    await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, BLOCO_RESUMO, JSON.stringify(resumo), 1, quem.login]);
    return {
      cnpj, contasNovas: m.contasNovas, contasAtualizadas: m.contasAtualizadas, contasDoModeloRetiradas: m.contasDoModeloRetiradas, historicosNovos: m.historicosNovos,
      lancamentos: dados.lancamentos.length, lancamentosSubstituidos: m.lancamentosSubstituidos, lancamentosDaEquipe: m.lancamentosDaEquipe,
      blocos: blocos.length, linhasGuardadas, versao, avisos: resumo.avisos, conferencia,
    };
  });
}

/** Registro do sistema anterior de uma empresa: blocos e quantidades (sem as linhas), mais o resumo da migração. */
export async function lerRegistroSistemaAnterior(consultar: ConsultaSql, cnpj: string): Promise<{ resumo: ResumoMigracaoGuardado | null; blocos: Array<{ bloco: string; quantidade: number; migradoEm: string }> }> {
  const existe = await consultar(`SELECT to_regclass('${TABELA_SISTEMA_ANTERIOR}') AS t`, []);
  if (!existe.rows[0]?.t) return { resumo: null, blocos: [] };
  const r = await consultar(`SELECT bloco, quantidade, migrado_em, CASE WHEN bloco=$2 THEN linhas END AS resumo FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 ORDER BY bloco`, [cnpj, BLOCO_RESUMO]);
  const resumo = r.rows.find((x) => x.bloco === BLOCO_RESUMO)?.resumo ?? null;
  return { resumo, blocos: r.rows.filter((x) => x.bloco !== BLOCO_RESUMO).map((x) => ({ bloco: String(x.bloco), quantidade: Number(x.quantidade), migradoEm: new Date(x.migrado_em).toISOString() })) };
}

/** Linhas de um bloco, paginadas (consulta na tela e pela Agente). */
export async function lerBlocoSistemaAnterior(consultar: ConsultaSql, cnpj: string, bloco: string, deslocamento = 0, limite = 100): Promise<{ total: number; linhas: any[] }> {
  if (bloco === BLOCO_RESUMO) return { total: 0, linhas: [] };
  const existe = await consultar(`SELECT to_regclass('${TABELA_SISTEMA_ANTERIOR}') AS t`, []);
  if (!existe.rows[0]?.t) return { total: 0, linhas: [] };
  const lim = Math.max(1, Math.min(500, Math.floor(limite)));
  const desl = Math.max(0, Math.floor(deslocamento));
  const r = await consultar(`SELECT quantidade, (SELECT coalesce(jsonb_agg(e ORDER BY i), '[]'::jsonb) FROM jsonb_array_elements(linhas) WITH ORDINALITY AS x(e, i) WHERE i > $3 AND i <= $3 + $4) AS pagina FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco=$2`, [cnpj, bloco, desl, lim]);
  if (!r.rows.length) return { total: 0, linhas: [] };
  return { total: Number(r.rows[0].quantidade), linhas: r.rows[0].pagina || [] };
}

/** Conferência de uma empresa já migrada: o workspace de hoje x o que estava no arquivo. */
export async function conferirEmpresaMigrada(consultar: ConsultaSql, cnpj: string): Promise<ResultadoConferencia | null> {
  const { resumo } = await lerRegistroSistemaAnterior(consultar, cnpj);
  if (!resumo) return null;
  const ws = await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]);
  const payload = ws.rows[0]?.payload || { contas: [], lancamentos: [] };
  return conferirMigracao(Array.isArray(payload.contas) ? payload.contas : [], Array.isArray(payload.lancamentos) ? payload.lancamentos : [], resumo);
}

/** CNPJs com migração registrada (para o robô). */
export async function cnpjsMigrados(consultar: ConsultaSql): Promise<string[]> {
  const existe = await consultar(`SELECT to_regclass('${TABELA_SISTEMA_ANTERIOR}') AS t`, []);
  if (!existe.rows[0]?.t) return [];
  const r = await consultar(`SELECT cnpj FROM ${TABELA_SISTEMA_ANTERIOR} WHERE bloco=$1 ORDER BY cnpj`, [BLOCO_RESUMO]);
  return r.rows.map((x) => String(x.cnpj));
}

/** A empresa foi excluída antes? Lápide no hub do Fiscal ou cópia no arquivo de excluídas do próprio Contábil. */
export async function empresaExcluidaAntes(consultar: ConsultaSql, cnpj: string, env: Record<string, string | undefined> = process.env, buscar: typeof fetch = fetch): Promise<boolean> {
  try {
    const existe = await consultar("SELECT to_regclass('contabil_empresas_excluidas_arquivo') AS t", []);
    if (existe.rows[0]?.t) {
      const r = await consultar('SELECT 1 FROM contabil_empresas_excluidas_arquivo WHERE cnpj=$1 LIMIT 1', [cnpj]);
      if (r.rows.length) {
        // Excluída aqui e depois recadastrada pela equipe: já voltou, não é mais "excluída antes".
        const volta = await consultar('SELECT 1 FROM contabil_auth_company_access WHERE cnpj=$1 LIMIT 1', [cnpj]);
        if (!volta.rows.length) return true;
      }
    }
  } catch { /* segue para o Fiscal */ }
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return false;
  try {
    const r = await buscar(`${urlDoSistema('fiscal', env)}/api/integracao/empresa/${encodeURIComponent(cnpj)}/excluida`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const j: any = await r.json().catch(() => null);
    return r.ok && j?.excluida === true;
  } catch { return false; }
}
