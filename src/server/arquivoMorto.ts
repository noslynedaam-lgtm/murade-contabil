// ARQUIVO MORTO da empresa excluída (decisão do Beny, 23/11/2026): ao excluir, o que é OPERACIONAL sai da base; os documentos que a lei
// manda guardar vão para um arquivo escondido, isolado por escritório e cifrado com a mesma chave dos backups do escritório
// (backupAgendado/formato.ts: AES-256-GCM, chave = HMAC(MURADE_BACKUP_MASTER_KEY, sistema + escritório)).
//  - Não aparece em nenhuma tela de trabalho, não entra em robô nem em conferidor (só o Robô do Prazo de Guarda lê a data de vencimento).
//  - Só o ADMINISTRADOR do escritório recupera ("Recuperar documentos guardados", com segunda confirmação), e só depois de a empresa
//    ser cadastrada de novo. O recadastro NUNCA puxa o arquivo sozinho. CNPJ e e-mail nunca ficam bloqueados.
//  - Prazo de guarda (fontes oficiais, planalto.gov.br, conferidas em 23/11/2026):
//      CTN, art. 195, parágrafo único: livros obrigatórios e comprovantes dos lançamentos "conservados até que ocorra a prescrição dos
//      créditos tributários"; art. 173, I: a Fazenda tem 5 anos, contados do primeiro dia do exercício seguinte, para lançar; art. 174:
//      a cobrança prescreve em 5 anos da constituição definitiva (e a prescrição pode ser interrompida). Lei 8.212/1991, art. 32, § 11:
//      documentos das contribuições "arquivados na empresa até que ocorra a prescrição".
//    O fim exato depende de quando o crédito foi constituído e de interrupções (processo, parcelamento): sem como saber, o sistema
//    guarda pelo MAIOR prazo que a regra permite calcular — decadência (5 anos a partir de 1º de janeiro do ano seguinte) + prescrição
//    (mais 5) a partir do ano da exclusão: até 31/12 do ano da exclusão + 10. Antes de apagar, avisa com 60 dias; quem tiver processo
//    ou parcelamento marca "manter guardado" e o robô não apaga.
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { abrirArquivo, chaveMestraConfigurada, selarArquivo, sha256 } from './backupAgendado/formato';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface BancoTx { transacao<T>(fn: (q: Q) => Promise<T>): Promise<T>; consultar: Q }

export const TABELA_ARQUIVO_MORTO = 'contabil_arquivo_morto';
export const FONTE_GUARDA = 'CTN (Lei 5.172/1966), arts. 173, I, 174 e 195, parágrafo único; Lei 8.212/1991, art. 32, § 11';
export const ANOS_GUARDA = 10;
export const DIAS_AVISO = 60;
export const DIAS_ENTRE_AVISO_E_APAGAR = 30;

/** Tabelas com guarda legal no Contábil (livros, fechamentos e trilhas da escrituração, e-Lalur/e-Lacs e os documentos de origem). */
export const TABELAS_GUARDA = [
  'contabil_period_closures', 'contabil_accounting_approval_audit', 'contabil_manual_journal_audit', 'contabil_manual_journal_events', 'contabil_opening_balance_audit',
  'contabil_lucro_real_config', 'contabil_lalur_lancamentos', 'contabil_lalur_parte_b_contas', 'contabil_lucro_real_apuracoes', 'contabil_lucro_real_pagamentos',
  'murade_documentos_fiscais_origem', 'murade_documentos_fiscais_versoes', 'murade_apuracoes_fiscais_origem', 'murade_folhas_dp_origem', 'murade_eventos_dp_origem', 'murade_prolabore_dp_origem',
] as const;
/** Operacional sem guarda legal: sai da base sem cópia. */
export const TABELAS_OPERACIONAIS = ['contabil_ai_agent_log'] as const;

/** Cópia da escrituração para o arquivo SEM o que veio da migração do sistema anterior (lançamentos e históricos da migração saem junto com a empresa). */
export function semDadosDoSistemaAnterior(payload: any): any {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const copia = { ...payload };
  if (Array.isArray(copia.lancamentos)) copia.lancamentos = copia.lancamentos.filter((l: any) => !(l && l.origem === 'Sistema anterior' && String(l.id || '').startsWith('sa-')));
  if (Array.isArray(copia.historicosPadrao)) copia.historicosPadrao = copia.historicosPadrao.filter((h: any) => !String(h?.id || '').startsWith('sa-hist-'));
  if (Array.isArray(copia.bensImobilizado)) copia.bensImobilizado = copia.bensImobilizado.filter((b: any) => !String(b?.id || '').startsWith('sa-bem-'));
  return copia;
}

export const guardarAte = (anoExclusao: number) => `${anoExclusao + ANOS_GUARDA}-12-31`;

export async function prepararArquivoMorto(q: Q): Promise<void> {
  await q(`CREATE TABLE IF NOT EXISTS ${TABELA_ARQUIVO_MORTO} (id uuid PRIMARY KEY, tenant_id text NOT NULL, cnpj text NOT NULL, tipo text NOT NULL,
    guardar_ate date NOT NULL, fonte text NOT NULL, conteudo bytea NOT NULL, sha256 text NOT NULL, itens int NOT NULL, excluida_em timestamptz NOT NULL DEFAULT now(),
    excluida_por text, aviso_em timestamptz, manter boolean NOT NULL DEFAULT false, manter_motivo text, manter_por text)`);
  await q(`CREATE INDEX IF NOT EXISTS ${TABELA_ARQUIVO_MORTO}_tenant ON ${TABELA_ARQUIVO_MORTO} (tenant_id, cnpj)`);
}

/** Escritório dono da empresa (para a chave e para quem pode recuperar). Sem vínculo: "sem-escritorio" (só o dono do sistema recupera). */
export async function escritorioDaEmpresa(q: Q, cnpj: string): Promise<string> {
  const r = await q(`SELECT COALESCE(u.tenant_id, u.id)::text AS t FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 ORDER BY (a.role='admin') DESC LIMIT 1`, [cnpj]);
  return String(r.rows[0]?.t || 'sem-escritorio');
}

export interface ConteudoArquivoMorto { versao: 1; cnpj: string; workspace: { payload: unknown; version: unknown } | null; compartilhada: unknown; tabelas: Record<string, any[]> }

/**
 * Dentro da transação da exclusão: copia (cifrado) o que tem guarda legal e apaga das tabelas vivas. Devolve quantas linhas foram guardadas.
 * Sem a chave mestra configurada, recusa (lança) — a exclusão inteira volta, e nada com guarda legal se perde.
 */
export async function guardarNoArquivoMorto(q: Q, cnpj: string, quem: { por?: string } = {}, agora = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<{ guardados: number; operacionais: number }> {
  await prepararArquivoMorto(q);
  const tabelas: Record<string, any[]> = {};
  for (const t of TABELAS_GUARDA) {
    if (!(await q(`SELECT to_regclass('${t}') AS t`, [])).rows[0]?.t) continue;
    const linhas = (await q(`SELECT * FROM ${t} WHERE cnpj=$1`, [cnpj])).rows;
    if (linhas.length) tabelas[t] = linhas;
  }
  const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]);
  const comp = await q('SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1', [cnpj]);
  const itens = Object.values(tabelas).reduce((a, l) => a + l.length, 0) + (ws.rows.length ? 1 : 0);
  let guardados = 0;
  if (itens > 0) {
    if (!chaveMestraConfigurada(env)) throw new Error('Configure MURADE_BACKUP_MASTER_KEY no Render: sem a chave dos backups, os documentos com guarda legal não podem ir para o arquivo morto e a empresa não é excluída.');
    const tenant = await escritorioDaEmpresa(q, cnpj);
    const conteudo: ConteudoArquivoMorto = { versao: 1, cnpj, workspace: ws.rows[0] ? { payload: semDadosDoSistemaAnterior(ws.rows[0].payload ?? null), version: ws.rows[0].version ?? null } : null, compartilhada: comp.rows[0]?.dados ?? null, tabelas };
    const bruto = gzipSync(Buffer.from(JSON.stringify(conteudo), 'utf8'));
    const id = randomUUID();
    const { arquivo } = selarArquivo(bruto, { sistema: 'contabil', id, tipo: 'completo', baseId: null, criadoEm: agora.toISOString() } as any, tenant, env);
    await q(`INSERT INTO ${TABELA_ARQUIVO_MORTO} (id, tenant_id, cnpj, tipo, guardar_ate, fonte, conteudo, sha256, itens, excluida_em, excluida_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, tenant, cnpj, 'escrituracao_e_documentos', guardarAte(agora.getUTCFullYear()), FONTE_GUARDA, arquivo, sha256(arquivo), itens, agora.toISOString(), quem.por ?? null]);
    for (const t of Object.keys(tabelas)) guardados += Number((await q(`DELETE FROM ${t} WHERE cnpj=$1`, [cnpj])).rowCount ?? 0);
    guardados += ws.rows.length;
  }
  let operacionais = 0;
  for (const t of TABELAS_OPERACIONAIS) if ((await q(`SELECT to_regclass('${t}') AS t`, [])).rows[0]?.t) operacionais += Number((await q(`DELETE FROM ${t} WHERE cnpj=$1`, [cnpj])).rowCount ?? 0);
  return { guardados, operacionais };
}

/** Quantos guardados o escritório tem desta empresa (só para o admin decidir se mostra o botão). Não devolve conteúdo. */
export async function resumoGuardados(q: Q, tenant: string, cnpj: string): Promise<{ itens: number; guardarAte: string | null; manter: boolean }> {
  await prepararArquivoMorto(q);
  const r = await q(`SELECT COALESCE(sum(itens),0)::int AS itens, max(guardar_ate)::text AS ate, bool_or(manter) AS manter FROM ${TABELA_ARQUIVO_MORTO} WHERE tenant_id=$1 AND cnpj=$2`, [tenant, cnpj]);
  return { itens: Number(r.rows[0]?.itens || 0), guardarAte: r.rows[0]?.ate ? String(r.rows[0].ate).slice(0, 10) : null, manter: r.rows[0]?.manter === true };
}

export interface ResultadoRecuperacao { recuperados: number; porTabela: Record<string, number>; jaExistiam: number; workspace: 'recuperado' | 'ja_tinha_lancamentos' | 'sem_workspace'; pendencias: string[] }

/** Recupera os documentos guardados de UMA empresa do escritório: volta cada linha para a tabela original (sem sobrescrever o que já existe). */
export async function recuperarDoArquivoMorto(banco: BancoTx, tenant: string, cnpj: string, por: string, env: NodeJS.ProcessEnv = process.env): Promise<ResultadoRecuperacao> {
  await prepararArquivoMorto(banco.consultar);
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`arquivo-morto:${cnpj}`]);
    const itens = (await q(`SELECT id, conteudo FROM ${TABELA_ARQUIVO_MORTO} WHERE tenant_id=$1 AND cnpj=$2 ORDER BY excluida_em`, [tenant, cnpj])).rows;
    const out: ResultadoRecuperacao = { recuperados: 0, porTabela: {}, jaExistiam: 0, workspace: 'sem_workspace', pendencias: [] };
    if (!itens.length) return out;
    for (const it of itens) {
      const { conteudo } = abrirArquivo(Buffer.from(it.conteudo), 'contabil', tenant, env);
      const c = JSON.parse(gunzipSync(conteudo).toString('utf8')) as ConteudoArquivoMorto;
      if (c.cnpj !== cnpj) throw new Error('O arquivo guardado não é desta empresa.');
      if (c.workspace) {
        const atual = await q('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
        const vazio = !atual.rows[0] || !Array.isArray(atual.rows[0].payload?.lancamentos) || atual.rows[0].payload.lancamentos.length === 0;
        if (vazio) {
          await q(`INSERT INTO contabil_company_workspaces (cnpj, payload, version) VALUES ($1,$2::jsonb,1) ON CONFLICT (cnpj) DO UPDATE SET payload=EXCLUDED.payload, version=contabil_company_workspaces.version+1`, [cnpj, JSON.stringify(c.workspace.payload ?? {})]);
          out.workspace = 'recuperado'; out.recuperados += 1;
        } else {
          out.workspace = 'ja_tinha_lancamentos';
          out.pendencias.push('A empresa recadastrada já tem lançamentos novos: a escrituração guardada NÃO foi misturada com eles. O arquivo continua guardado; fale com o suporte para juntar.');
        }
      }
      if (c.compartilhada) await q(`INSERT INTO contabil_empresas_compartilhadas (cnpj, dados) VALUES ($1,$2::jsonb) ON CONFLICT (cnpj) DO NOTHING`, [cnpj, JSON.stringify(c.compartilhada)]);
      for (const [t, linhas] of Object.entries(c.tabelas || {})) {
        if (!(TABELAS_GUARDA as readonly string[]).includes(t)) continue; // só volta para tabela conhecida
        if (!(await q(`SELECT to_regclass('${t}') AS t`, [])).rows[0]?.t) { out.pendencias.push(`A tabela ${t} ainda não existe neste servidor: ${linhas.length} registro(s) continuam guardados.`); continue; }
        await q(`SAVEPOINT rec`);
        try {
          const r = await q(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb) ON CONFLICT DO NOTHING`, [JSON.stringify(linhas)]);
          const n = Number(r.rowCount ?? 0);
          out.porTabela[t] = (out.porTabela[t] || 0) + n; out.recuperados += n; out.jaExistiam += linhas.length - n;
          await q(`RELEASE SAVEPOINT rec`);
        } catch (e: any) {
          await q(`ROLLBACK TO SAVEPOINT rec`);
          out.pendencias.push(`${t}: ${linhas.length} registro(s) não voltaram (${String(e?.message || e).slice(0, 120)}). Continuam guardados.`);
        }
      }
      // Tudo voltou para as tabelas: o item sai do arquivo morto. Se algo ficou pendente, o item continua guardado.
      if (!out.pendencias.length) await q(`DELETE FROM ${TABELA_ARQUIVO_MORTO} WHERE id=$1`, [it.id]);
    }
    console.info(`[arquivo morto] ${cnpj}: ${out.recuperados} registro(s) recuperado(s) por ${por}.`);
    return out;
  });
}

export async function marcarManter(q: Q, tenant: string, cnpj: string, manter: boolean, motivo: string, por: string): Promise<number> {
  await prepararArquivoMorto(q);
  if (manter && String(motivo || '').trim().length < 5) throw new Error('Diga o motivo (ex.: processo administrativo nº ..., parcelamento).');
  const r = await q(`UPDATE ${TABELA_ARQUIVO_MORTO} SET manter=$3, manter_motivo=$4, manter_por=$5 WHERE tenant_id=$1 AND cnpj=$2`, [tenant, cnpj, manter, manter ? String(motivo).trim().slice(0, 300) : null, por]);
  return Number(r.rowCount ?? 0);
}

/** Avisos do escritório: guardados que vencem nos próximos 60 dias (ou já avisados). Só CNPJ e data — nunca o conteúdo. */
export async function avisosDoEscritorio(q: Q, tenant: string, hoje: string): Promise<Array<{ cnpj: string; guardarAte: string; manter: boolean }>> {
  await prepararArquivoMorto(q);
  const r = await q(`SELECT cnpj, guardar_ate::text AS ate, manter FROM ${TABELA_ARQUIVO_MORTO} WHERE tenant_id=$1 AND guardar_ate <= ($2::date + ${DIAS_AVISO}) ORDER BY guardar_ate`, [tenant, hoje]);
  return r.rows.map((x) => ({ cnpj: String(x.cnpj), guardarAte: String(x.ate).slice(0, 10), manter: x.manter === true }));
}

/** Robô do Prazo de Guarda: avisa 60 dias antes; apaga de vez o que venceu, foi avisado há 30 dias ou mais e não está marcado "manter". */
export async function rodarRoboPrazoGuarda(q: Q, hoje: string): Promise<{ avisados: number; apagados: number; mantidos: number; resumo: string }> {
  await prepararArquivoMorto(q);
  const avisados = Number((await q(`UPDATE ${TABELA_ARQUIVO_MORTO} SET aviso_em=now() WHERE aviso_em IS NULL AND guardar_ate <= ($1::date + ${DIAS_AVISO})`, [hoje])).rowCount ?? 0);
  const apagados = Number((await q(`DELETE FROM ${TABELA_ARQUIVO_MORTO} WHERE manter=false AND guardar_ate < $1::date AND aviso_em IS NOT NULL AND aviso_em <= ($1::date - ${DIAS_ENTRE_AVISO_E_APAGAR})`, [hoje])).rowCount ?? 0);
  const mantidos = Number((await q(`SELECT count(*)::int AS n FROM ${TABELA_ARQUIVO_MORTO} WHERE manter=true AND guardar_ate < $1::date`, [hoje])).rows[0]?.n || 0);
  return { avisados, apagados, mantidos, resumo: `${avisados} aviso(s) de prazo de guarda vencendo em até ${DIAS_AVISO} dias; ${apagados} arquivo(s) vencido(s) apagado(s) de vez; ${mantidos} vencido(s) mantido(s) por processo/parcelamento. Fonte: ${FONTE_GUARDA}.` };
}

/** Cópias antigas (antes do arquivo morto), sem cifra, em contabil_empresas_excluidas_arquivo: passam para o arquivo morto cifrado
 *  (escritório desconhecido: "sem-escritorio", só o dono do sistema recupera) e saem da tabela antiga. */
export async function migrarArquivoAntigo(banco: BancoTx, env: NodeJS.ProcessEnv = process.env, limite = 20): Promise<number> {
  if (!chaveMestraConfigurada(env)) return 0;
  if (!(await banco.consultar(`SELECT to_regclass('contabil_empresas_excluidas_arquivo') AS t`, [])).rows[0]?.t) return 0;
  await prepararArquivoMorto(banco.consultar);
  const linhas = (await banco.consultar(`SELECT id, cnpj, payload, versao, cadastro_compartilhado, excluido_em, excluido_por FROM contabil_empresas_excluidas_arquivo ORDER BY id LIMIT ${Math.max(1, Math.min(100, limite))}`, [])).rows;
  let n = 0;
  for (const l of linhas) {
    await banco.transacao(async (q) => {
      const cnpj = String(l.cnpj).trim(); const quando = new Date(l.excluido_em || Date.now());
      const { lucroRealArquivado, ...payload } = (l.payload && typeof l.payload === 'object' ? l.payload : {}) as any;
      const conteudo: ConteudoArquivoMorto = { versao: 1, cnpj, workspace: { payload, version: l.versao ?? null }, compartilhada: l.cadastro_compartilhado ?? null, tabelas: lucroRealArquivado && typeof lucroRealArquivado === 'object' ? lucroRealArquivado : {} };
      const id = randomUUID();
      const { arquivo } = selarArquivo(gzipSync(Buffer.from(JSON.stringify(conteudo), 'utf8')), { sistema: 'contabil', id, tipo: 'completo', baseId: null, criadoEm: quando.toISOString() } as any, 'sem-escritorio', env);
      await q(`INSERT INTO ${TABELA_ARQUIVO_MORTO} (id, tenant_id, cnpj, tipo, guardar_ate, fonte, conteudo, sha256, itens, excluida_em, excluida_por) VALUES ($1,'sem-escritorio',$2,'escrituracao_e_documentos',$3,$4,$5,$6,1,$7,$8)`,
        [id, cnpj, guardarAte(quando.getUTCFullYear()), FONTE_GUARDA, arquivo, sha256(arquivo), quando.toISOString(), l.excluido_por ?? null]);
      await q(`DELETE FROM contabil_empresas_excluidas_arquivo WHERE id=$1`, [l.id]);
    });
    n += 1;
  }
  return n;
}
