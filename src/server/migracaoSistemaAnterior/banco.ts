// Gravação da migração do sistema anterior no banco do Contábil, numa transação por empresa:
// workspace (plano, históricos, lançamentos), acesso da empresa no escritório de quem migra e o registro
// "do sistema anterior" (tudo o que veio do arquivo, por bloco, para consulta). Tudo ou nada.
import type { ContaPlano } from '../../types';
import type { BancoTransacional, ConsultaSql } from '../exclusaoEmpresaCascata';
import { urlDoSistema } from '../agentesEntreSistemas';
import type { DadosContabeisEmpresa } from './conversor';
import { AcumuladorConferencia, conferirMigracao, type ReferenciaConferencia, type ResultadoConferencia } from './conferencia';
import { apagarHistorico, gravarMesHistorico, lerHistoricoDoEscritorio, percorrerHistorico, prepararTabelaHistorico, resumoHistorico } from '../historicoLancamentosStore';
import { juntarComHistorico } from './historicoMigracao';
import { gravarTitulosECartoesMigrados, listarCartoes, listarTitulos } from '../titulosCartoesStore';
import { bensDoBackup, cadastroDoBackup, cartoesDoBackup, conferirCamposMigrados, modelosDoBackup, sentidoDoBloco, titulosDoBackup, txt, type ResultadoCampos } from './camposSistemaAnterior';
import { analisarMigracao, aplicarAcaoAchado, resumoAnalise, type AchadoMigracao } from './analiseSistemaAnterior';
import { converterClassificacao } from './conversor';
import { gravarRegrasIntegracaoMigradas, listarRegrasIntegracaoFiscal } from '../regrasIntegracaoFiscalStore';
import { compararRegras, regrasIntegracaoDoBackup } from './integracaoFiscal';

export const TABELA_SISTEMA_ANTERIOR = 'contabil_sistema_anterior';
export const BLOCO_RESUMO = '__migracao';
/** Decisões do contador sobre a análise do que veio (aceitar a sugestão / manter como veio). */
export const BLOCO_DECISOES = '__decisoes';
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
  /** idconta do sistema anterior → código no Murade (para o conferidor campo a campo). Migrações antigas não têm. */
  mapaContas?: Record<string, string>;
  /** Plano da empresa no sistema anterior e quantas regras de integração Fiscal → Contábil vieram (migrações a partir de 26/11/2026). */
  idPlano?: number | null;
  regrasIntegracao?: number;
  /** Empresa grande: até onde os exercícios ficaram no histórico guardado e quantos lançamentos do arquivo foram para lá. */
  historicoGuardado?: { ateCompetencia: string; lancamentos: number; doSistemaAnterior: number };
}

export async function prepararTabelaSistemaAnterior(consultar: ConsultaSql): Promise<void> { await consultar(SQL_TABELA); }

/** Teste grátis: limite de empresas do escritório em teste (o server.ts liga; sem ele, nada muda). */
let limiteTesteMigracao: ((escritorioId: string, cnpj: string) => Promise<string | null>) | null = null;
export function definirLimiteTesteMigracaoContabil(fn: typeof limiteTesteMigracao): void { limiteTesteMigracao = fn; }

/** Grava UMA empresa. Lança ErroMigracao com o motivo (em português) quando a empresa não pode ser gravada; nada fica pela metade. */
export async function gravarEmpresaMigrada(
  banco: BancoTransacional, dados: DadosContabeisEmpresa, quem: QuemMigra,
  opcoes: { modelo: ContaPlano[]; validar: (payload: Record<string, unknown>) => boolean; competenciaAtual: string; agora?: Date },
): Promise<ResultadoGravacaoEmpresa> {
  const cnpj = dados.cnpj;
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) throw new ErroMigracao('CNPJ inválido para gravar.');
  if (limiteTesteMigracao) { const motivo = await limiteTesteMigracao(quem.escritorioId, cnpj); if (motivo) throw new ErroMigracao(motivo); }
  await prepararTabelaSistemaAnterior(banco.consultar);
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const outro = await q('SELECT 1 FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND COALESCE(u.tenant_id,u.id)::text<>$2 LIMIT 1', [cnpj, quem.tenantId]);
    if (outro.rows.length) throw new ErroMigracao('Este CNPJ já está cadastrado em outro escritório. Cada empresa pertence a um único escritório; nada foi gravado.');
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    const fechadas = new Set((await q('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj])).rows.map((r) => String(r.competencia)));
    const comp = ws.rows.length ? null : (await q('SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1', [cnpj])).rows[0]?.dados ?? null;
    // Histórico guardado: o que a equipe guardou volta para a junção; tudo é regravado conforme a junção nova (na mesma transação).
    await prepararTabelaHistorico(q);
    const historicoEscritorio = await lerHistoricoDoEscritorio(q, cnpj);
    const migradosAntes = (await resumoHistorico(q, cnpj)).anos.reduce((n, a) => n + a.migracao, 0);
    await apagarHistorico(q, cnpj);
    await q(`DELETE FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco<>$2`, [cnpj, BLOCO_DECISOES]);
    let linhasOriginaisEmPartes = 0; let blocosEmPartes = 0;
    const m = await juntarComHistorico(ws.rows[0]?.payload ?? null, dados, { modelo: opcoes.modelo, cadastroCompartilhado: comp, competenciaAtual: opcoes.competenciaAtual, fechadas, historicoEscritorio, agora: opcoes.agora }, {
      gravarMes: async (mes) => { await gravarMesHistorico(q, cnpj, mes, quem.login); },
      // Empresa lida em partes: as linhas originais de cada ano vão para o registro do sistema anterior (nada fica para trás).
      gravarOriginais: async (ano, linhas) => {
        if (!linhas.length) return;
        await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, `lancamentos_originais_${ano || 'sem_data'}`, JSON.stringify(linhas), linhas.length, quem.login]);
        linhasOriginaisEmPartes += linhas.length; blocosEmPartes++;
      },
    });
    if (!m.payload) throw new ErroMigracao(m.bloqueio || 'Não foi possível juntar os dados com o que já existe no Murad.');
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
    // Conferência do documento + histórico (a junção somou lançamento a lançamento).
    const conferencia = m.conferencia!;
    const resumo: ResumoMigracaoGuardado = {
      cdempresa: dados.cdempresa, nomePlano: dados.nomePlano, migradoEm: (opcoes.agora || new Date()).toISOString(), migradoPor: quem.login, lidos: dados.lidos,
      esperado: dados.esperado, esperadoLancamentos: dados.esperadoLancamentos, saldoFinalEsperado: dados.saldoFinalEsperado,
      lancamentosGravados: m.lancamentosGravados, semSaldosParaConferir: dados.semSaldosParaConferir, linhasQueNaoEntraram: m.naoEntraram.length,
      naoEntraram: m.naoEntraram, avisos: [...dados.avisos, ...m.avisos], conferenciaNaGravacao: conferencia.resumo, mapaContas: dados.mapaContas,
      ...(dados.regrasIntegracao ? { idPlano: dados.idPlano, regrasIntegracao: dados.regrasIntegracao.length } : {}),
      ...(m.historico ? { historicoGuardado: { ateCompetencia: m.historico.ateCompetencia, lancamentos: m.historico.lancamentos, doSistemaAnterior: m.historico.doSistemaAnterior } } : {}),
    };
    let linhasGuardadas = linhasOriginaisEmPartes;
    const blocos = Object.entries(dados.blocos);
    for (const [bloco, linhas] of blocos) {
      await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, bloco, JSON.stringify(linhas), linhas.length, quem.login]);
      linhasGuardadas += linhas.length;
    }
    await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, BLOCO_RESUMO, JSON.stringify(resumo), 1, quem.login]);
    if ((dados.titulos || []).length || (dados.cartoes || []).length) await gravarTitulosECartoesMigrados(q, cnpj, dados.titulos || [], dados.cartoes || []);
    // Regras de integração Fiscal → Contábil (de-para): tabela própria; confere a quantidade gravada antes de confirmar.
    if (dados.regrasIntegracao) {
      const gravadas = await gravarRegrasIntegracaoMigradas(q, cnpj, dados.regrasIntegracao);
      if (gravadas !== dados.regrasIntegracao.length) throw new ErroMigracao(`As regras de integração do sistema anterior não bateram (${dados.regrasIntegracao.length} lidas, ${gravadas} gravadas); nada foi gravado.`);
    }
    return {
      cnpj, contasNovas: m.contasNovas, contasAtualizadas: m.contasAtualizadas, contasDoModeloRetiradas: m.contasDoModeloRetiradas, historicosNovos: m.historicosNovos,
      lancamentos: m.lancamentosGravados, lancamentosSubstituidos: m.lancamentosSubstituidos + migradosAntes, lancamentosDaEquipe: m.lancamentosDaEquipe,
      blocos: blocos.length + blocosEmPartes, linhasGuardadas, versao, avisos: resumo.avisos, conferencia,
    };
  });
}

/** Registro do sistema anterior de uma empresa: blocos e quantidades (sem as linhas), mais o resumo da migração. */
export async function lerRegistroSistemaAnterior(consultar: ConsultaSql, cnpj: string): Promise<{ resumo: ResumoMigracaoGuardado | null; blocos: Array<{ bloco: string; quantidade: number; migradoEm: string }> }> {
  const existe = await consultar(`SELECT to_regclass('${TABELA_SISTEMA_ANTERIOR}') AS t`, []);
  if (!existe.rows[0]?.t) return { resumo: null, blocos: [] };
  const r = await consultar(`SELECT bloco, quantidade, migrado_em, CASE WHEN bloco=$2 THEN linhas END AS resumo FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 ORDER BY bloco`, [cnpj, BLOCO_RESUMO]);
  const resumo = r.rows.find((x) => x.bloco === BLOCO_RESUMO)?.resumo ?? null;
  return { resumo, blocos: r.rows.filter((x) => x.bloco !== BLOCO_RESUMO && x.bloco !== BLOCO_DECISOES).map((x) => ({ bloco: String(x.bloco), quantidade: Number(x.quantidade), migradoEm: new Date(x.migrado_em).toISOString() })) };
}

/** Linhas de um bloco, paginadas (consulta na tela e pela Agente). */
export async function lerBlocoSistemaAnterior(consultar: ConsultaSql, cnpj: string, bloco: string, deslocamento = 0, limite = 100): Promise<{ total: number; linhas: any[] }> {
  if (bloco === BLOCO_RESUMO || bloco === BLOCO_DECISOES) return { total: 0, linhas: [] };
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
  return conferirComHistorico(consultar, cnpj, payload, resumo);
}

/** Conferência da migração somando o documento e o histórico guardado (mês a mês, sem carregar tudo de uma vez). */
export async function conferirComHistorico(consultar: ConsultaSql, cnpj: string, payload: Record<string, any>, ref: ReferenciaConferencia): Promise<ResultadoConferencia> {
  const acc = new AcumuladorConferencia(Array.isArray(payload.contas) ? payload.contas : []);
  if (payload.historicoArquivado) await percorrerHistorico(consultar, cnpj, (_c, l) => { for (const x of l) acc.adicionar(x); });
  acc.adicionarTodos(payload.lancamentos);
  return acc.resultado(ref);
}

/** Blocos usados pelo conferidor campo a campo. */
export const BLOCOS_CONFERENCIA_CAMPOS: string[] = ['cadastro_empresa', 'marca_ativa', 'empresa_contabil', 'contador', 'socios_empresa', 'socios', 'municipio', 'plano_cadastro', 'plano_contas', 'historicos_padrao', 'lotes', 'lancamentos_originais', 'imobilizado_bens', 'cadastro_historico_cnae', 'historico_nire', 'titulos', 'titulos_baixas', 'titulos_provisao', 'cartao_estabelecimentos', 'cartao_movimentos', 'cartao_operadoras', 'lancamentos_automaticos', 'lancamentos_automaticos_contas'];

/** Conferência campo a campo de uma empresa já migrada: cada campo preenchido no backup x o que está no Murade hoje. Só lê. */
export async function conferirCamposEmpresaMigrada(consultar: ConsultaSql, cnpj: string): Promise<ResultadoCampos | null> {
  const { resumo } = await lerRegistroSistemaAnterior(consultar, cnpj);
  if (!resumo) return null;
  const r = await consultar(`SELECT bloco, linhas FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, BLOCOS_CONFERENCIA_CAMPOS]);
  const blocos: Record<string, any[]> = {};
  for (const x of r.rows) blocos[String(x.bloco)] = Array.isArray(x.linhas) ? x.linhas : [];
  const ws = await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]);
  const payload = ws.rows[0]?.payload || {};
  let mapa = resumo.mapaContas;
  const registroAntigo = !mapa;
  if (!mapa) { // migração gravada antes do mapa: o código é a classificação do sistema anterior
    mapa = {};
    for (const c of blocos.plano_contas || []) { const cod = converterClassificacao(c.cdclassinterna); if (cod) mapa[String(Number(c.idconta))] = cod; }
  }
  const temTitulos = (blocos.titulos || []).length > 0; const temCartoes = (blocos.cartao_estabelecimentos || []).length > 0;
  const titulos = temTitulos ? await listarTitulos(consultar, cnpj).catch(() => []) : undefined;
  const cartoes = temCartoes ? await listarCartoes(consultar, cnpj).catch(() => []) : undefined;
  return conferirCamposMigrados({ cdempresa: Number(resumo.cdempresa), blocos, mapaContas: mapa, payload, registroAntigo, titulos, cartoes });
}

export interface ConferenciaRegrasIntegracao { cnpj: string; bate: boolean; regras: number; comConta: number; contaComProblema: number; foraDoGrupo: number; diferencas: string[]; resumo: string }
/** Conferência das regras de integração Fiscal → Contábil de uma empresa migrada: o registro guardado do sistema anterior, convertido de
 * novo, tem de dar as mesmas regras gravadas; e cada conta usada tem de existir, analítica, no plano de hoje. Só lê. */
export async function conferirRegrasIntegracaoEmpresa(consultar: ConsultaSql, cnpj: string): Promise<ConferenciaRegrasIntegracao | null> {
  const { resumo } = await lerRegistroSistemaAnterior(consultar, cnpj);
  if (!resumo || resumo.regrasIntegracao === undefined) return null;
  const r = await consultar(`SELECT bloco, linhas FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, ['plano_contas', 'integracao_fornecedores', 'integracao_codigos_fiscais', 'integracao_configuracao']]);
  const b: Record<string, any[]> = {};
  for (const x of r.rows) b[String(x.bloco)] = Array.isArray(x.linhas) ? x.linhas : [];
  const idPlano = resumo.idPlano ?? null;
  const ws = (await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj])).rows[0]?.payload || {};
  const tipos = new Map<string, string>((Array.isArray(ws.contas) ? ws.contas : []).map((c: any) => [String(c?.codigo), String(c?.tipo)]));
  const esperado = regrasIntegracaoDoBackup({
    idPlano, frninteg: b.integracao_fornecedores || [], cadfism: b.integracao_codigos_fiscais || [], cfg: b.integracao_configuracao || [],
    contasDoPlano: (b.plano_contas || []).filter((c) => idPlano !== null && Number(c.idplanodecontas) === idPlano), mapaContas: resumo.mapaContas || {}, tipoConta: (c) => tipos.get(c),
  }).regras;
  const lista = await listarRegrasIntegracaoFiscal(consultar as any, cnpj);
  const gravadas = lista.regras.filter((x) => x.origem === 'sistema_anterior');
  const diferencas = compararRegras(esperado, gravadas);
  if (esperado.length !== resumo.regrasIntegracao) diferencas.unshift(`na migração vieram ${resumo.regrasIntegracao} regra(s); o registro guardado dá ${esperado.length}`);
  if (gravadas.length !== esperado.length) diferencas.push(`${gravadas.length} regra(s) gravada(s) para ${esperado.length} do sistema anterior`);
  const problemas = gravadas.filter((x) => x.conta && !x.tipo.startsWith('grupo_') && x.contaNoPlano !== 'ok');
  for (const x of problemas.slice(0, 20)) diferencas.push(`${x.tipo === 'fornecedor' ? 'fornecedor' : 'CFOP'} ${x.chave}: a conta ${x.conta} ${x.contaNoPlano === 'nao_existe' ? 'não existe mais no plano' : 'deixou de ser analítica'} (a nota usa a conta do mapeamento)`);
  const comConta = gravadas.filter((x) => x.conta).length;
  const foraDoGrupo = gravadas.filter((x) => x.foraDoGrupo).length;
  const bate = diferencas.length === 0;
  const aviso = foraDoGrupo ? ` ${foraDoGrupo} fornecedor(es) com conta fora do grupo de fornecedores do plano (como era no sistema anterior): confira.` : '';
  return { cnpj, bate, regras: gravadas.length, comConta, contaComProblema: problemas.length, foraDoGrupo, diferencas,
    resumo: (bate ? `${gravadas.length} regra(s) de integração do sistema anterior batem com o backup e as contas estão no plano.` : `Regras de integração: ${diferencas.slice(0, 3).join('; ')}`) + aviso };
}

async function carregarParaAnalise(consultar: ConsultaSql, cnpj: string, payloadAtual?: Record<string, any>) {
  const { resumo } = await lerRegistroSistemaAnterior(consultar, cnpj);
  if (!resumo) return null;
  const nomes = [...BLOCOS_CONFERENCIA_CAMPOS, 'lancamentos_lote_aberto', 'lancamentos_automaticos', 'lancamentos_automaticos_contas', BLOCO_DECISOES];
  const r = await consultar(`SELECT bloco, linhas FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, nomes]);
  const blocos: Record<string, any[]> = {}; let decisoes: Record<string, any> = {};
  for (const x of r.rows) { if (x.bloco === BLOCO_DECISOES) decisoes = x.linhas && typeof x.linhas === 'object' && !Array.isArray(x.linhas) ? x.linhas : {}; else blocos[String(x.bloco)] = Array.isArray(x.linhas) ? x.linhas : []; }
  const payload = payloadAtual || (await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj])).rows[0]?.payload || {};
  let mapa = resumo.mapaContas;
  if (!mapa) { mapa = {}; for (const c of blocos.plano_contas || []) { const cod = converterClassificacao(c.cdclassinterna); if (cod) mapa[String(Number(c.idconta))] = cod; } }
  // Histórico guardado (empresa grande): somado uma vez; as ações da análise só mudam o documento.
  const doHistorico = new AcumuladorConferencia(Array.isArray(payload.contas) ? payload.contas : []);
  if (payload.historicoArquivado) await percorrerHistorico(consultar, cnpj, (_c, l) => { for (const x of l) doHistorico.adicionar(x); });
  return { resumo, blocos, decisoes, payload, mapa, doHistorico };
}

/** Conferência do documento de agora + o histórico guardado (já somado). */
function conferirAgora(c: { payload: Record<string, any>; resumo: ReferenciaConferencia; doHistorico: AcumuladorConferencia }, payload = c.payload): ResultadoConferencia {
  const acc = c.doHistorico.clonar();
  acc.adicionarTodos(payload.lancamentos);
  return acc.resultado(c.resumo);
}

function analisar(c: NonNullable<Awaited<ReturnType<typeof carregarParaAnalise>>>): AchadoMigracao[] {
  const conferencia = conferirAgora(c);
  return analisarMigracao({ cdempresa: Number(c.resumo.cdempresa), blocos: c.blocos, mapaContas: c.mapa, payload: c.payload, naoEntraram: c.resumo.naoEntraram || [], conferencia, decisoes: c.decisoes });
}

/** Análise do que veio errado do sistema anterior (correções automáticas, itens para o contador, ajustes propostos). Só lê. */
export async function analisarEmpresaMigrada(consultar: ConsultaSql, cnpj: string): Promise<{ achados: AchadoMigracao[]; resumo: string } | null> {
  const c = await carregarParaAnalise(consultar, cnpj);
  if (!c) return null;
  const achados = analisar(c);
  return { achados, resumo: resumoAnalise(achados) };
}

export type AcaoAchado = 'corrigir' | 'desfazer' | 'aceitar' | 'manter' | 'lancar_ajuste' | 'desfazer_ajuste' | 'corrigir_todos';

/** Executa UMA ação do contador sobre a análise (ou "Corrigir agora" para todas as correções automáticas), numa transação. */
export async function aplicarAchadoEmpresaMigrada(banco: BancoTransacional, cnpj: string, id: string, acao: AcaoAchado, quem: string, validar: (p: Record<string, unknown>) => boolean): Promise<{ mensagem: string; achados: AchadoMigracao[]; resumo: string; conferencia: ResultadoConferencia }> {
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    if (!ws.rows.length) throw new ErroMigracao('A empresa não tem escrituração no Contábil.');
    const c = await carregarParaAnalise(q, cnpj, ws.rows[0].payload);
    if (!c) throw new ErroMigracao('Esta empresa não tem migração do sistema anterior registrada.');
    const fechadas = new Set((await q('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj])).rows.map((r) => String(r.competencia)));
    const achados = analisar(c);
    let payload = c.payload; let mensagem = '';
    const alvos = acao === 'corrigir_todos' ? achados.filter((a) => a.tipo === 'corrigido' && a.situacao === 'desfeito') : achados.filter((a) => a.id === id);
    if (!alvos.length) throw new ErroMigracao(acao === 'corrigir_todos' ? 'Não há correção automática para refazer: todas já estão aplicadas.' : 'Este item não está mais na análise (pode já ter sido resolvido).');
    for (const a of alvos) {
      const comp = a.ajuste?.competencia || '';
      const lancsAlvo = a.alvo?.tipo === 'lancamentos' ? (payload.lancamentos || []).filter((l: any) => (a.alvo!.ids || []).includes(l.id)) : [];
      if ((comp && fechadas.has(comp)) || lancsAlvo.some((l: any) => fechadas.has(String(l.data).slice(0, 7)))) throw new ErroMigracao('A competência está fechada no Murad. Reabra a competência para mudar este item.');
      if (acao === 'manter') { mensagem = 'Mantido como veio do sistema anterior.'; continue; }
      payload = aplicarAcaoAchado(payload, a, acao === 'corrigir_todos' ? 'corrigir' : acao, quem);
    }
    if (acao === 'aceitar' || acao === 'manter') {
      const decisoes = { ...c.decisoes, [id]: { decisao: acao === 'aceitar' ? 'aceito' : 'mantido', por: quem, em: new Date().toISOString() } };
      await q(`DELETE FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco=$2`, [cnpj, BLOCO_DECISOES]);
      await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, BLOCO_DECISOES, JSON.stringify(decisoes), Object.keys(decisoes).length, quem]);
      c.decisoes = decisoes;
    }
    if (payload !== c.payload) {
      if (!validar(payload)) throw new ErroMigracao('A mudança não passou na validação do Contábil; nada foi alterado.');
      await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1', [cnpj, JSON.stringify(payload)]);
    }
    const depois = analisar({ ...c, payload });
    const conferencia = conferirAgora(c, payload);
    if (!mensagem) mensagem = acao === 'lancar_ajuste' ? `Ajuste lançado. Conferência de novo: ${conferencia.bate ? 'agora bate exatamente.' : conferencia.resumo}`
      : acao === 'desfazer_ajuste' ? 'Ajuste estornado (o lançamento continua no Diário, com o estorno).' : acao === 'desfazer' ? 'Desfeito: voltou como veio do sistema anterior.'
        : acao === 'corrigir_todos' ? `${alvos.length} correção(ões) aplicada(s).` : acao === 'aceitar' ? 'Sugestão aceita e aplicada.' : 'Corrigido.';
    return { mensagem, achados: depois, resumo: resumoAnalise(depois), conferencia };
  });
}

/** Decisões em grupo ainda valendo (para o "Desfazer do grupo" na tela). */
export async function lotesDaAnalise(consultar: ConsultaSql, cnpj: string): Promise<Array<{ lote: string; decisao: string; quantidade: number; em: string; por: string }>> {
  const r = await consultar(`SELECT bloco, linhas FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, [BLOCO_DECISOES]]).catch(() => ({ rows: [] as any[] }));
  const m = new Map<string, { lote: string; decisao: string; quantidade: number; em: string; por: string }>();
  const linhas = r.rows.find((x: any) => x.bloco === BLOCO_DECISOES)?.linhas;
  for (const d of Object.values<any>(linhas && typeof linhas === 'object' && !Array.isArray(linhas) ? linhas : {})) { if (!d?.lote) continue; const x = m.get(d.lote) ?? { lote: d.lote, decisao: String(d.decisao), quantidade: 0, em: String(d.em || ''), por: String(d.por || '') }; x.quantidade++; m.set(d.lote, x); }
  return [...m.values()].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 20);
}

/**
 * "Decidir para todas" de um grupo da análise (mesmo tipo de item): aceitar a sugestão (só os que têm o que aplicar) ou manter como veio,
 * numa transação. Os ids são os que a pessoa viu e confirmou duas vezes: se algum já não está pendente, recusa. Fica um lote para o
 * "Desfazer do grupo". Nada é apagado.
 */
export async function decidirGrupoEmpresaMigrada(banco: BancoTransacional, cnpj: string, ids: string[], acao: 'aceitar' | 'manter', quem: string, validar: (p: Record<string, unknown>) => boolean): Promise<{ lote: string; alteradas: number; puladas: number; mensagem: string }> {
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    if (!ws.rows.length) throw new ErroMigracao('A empresa não tem escrituração no Contábil.');
    const c = await carregarParaAnalise(q, cnpj, ws.rows[0].payload);
    if (!c) throw new ErroMigracao('Esta empresa não tem migração do sistema anterior registrada.');
    const fechadas = new Set((await q('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj])).rows.map((r) => String(r.competencia)));
    const quer = new Set(ids);
    const alvos = analisar(c).filter((a) => quer.has(a.id) && a.situacao === 'pendente' && (a.tipo === 'conferir' || a.tipo === 'verificar'));
    if (alvos.length !== quer.size) throw new ErroMigracao(`O grupo mudou desde que você abriu (agora são ${alvos.length} pendente(s)). Abra de novo e confira antes de decidir.`);
    const lote = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; const em = new Date().toISOString();
    let payload = c.payload; let puladas = 0; const decisoes = { ...c.decisoes } as Record<string, any>;
    for (const a of alvos) {
      const lancs = a.alvo?.tipo === 'lancamentos' ? (payload.lancamentos || []).filter((l: any) => (a.alvo!.ids || []).includes(l.id)) : [];
      if (lancs.some((l: any) => fechadas.has(String(l.data).slice(0, 7)))) { puladas++; continue; }
      if (acao === 'aceitar') { if (!a.alvo) { puladas++; continue; } payload = aplicarAcaoAchado(payload, a, 'aceitar', quem); }
      decisoes[a.id] = { decisao: acao === 'aceitar' ? 'aceito' : 'mantido', por: quem, em, lote };
    }
    const alteradas = alvos.length - puladas;
    await q(`DELETE FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco=$2`, [cnpj, BLOCO_DECISOES]);
    await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, BLOCO_DECISOES, JSON.stringify(decisoes), Object.keys(decisoes).length, quem]);
    if (payload !== c.payload) {
      if (!validar(payload)) throw new ErroMigracao('A mudança não passou na validação do Contábil; nada foi alterado.');
      await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1', [cnpj, JSON.stringify(payload)]);
    }
    return { lote, alteradas, puladas, mensagem: `${alteradas} item(ns) ${acao === 'aceitar' ? 'aceito(s) e corrigido(s)' : 'mantido(s) como vieram'}${puladas ? `; ${puladas} ficaram como estavam (sem o que aplicar ou competência fechada)` : ''}. Dá para voltar com "Desfazer do grupo".` };
  });
}

/** "Desfazer do grupo": tira as decisões do lote e, nas aceitas, volta o valor que veio do sistema anterior. */
export async function desfazerGrupoEmpresaMigrada(banco: BancoTransacional, cnpj: string, lote: string, quem: string, validar: (p: Record<string, unknown>) => boolean): Promise<{ desfeitas: number; mensagem: string }> {
  if (!/^g[a-z0-9]{6,30}$/.test(lote)) throw new ErroMigracao('Grupo de decisão inválido.');
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    if (!ws.rows.length) throw new ErroMigracao('A empresa não tem escrituração no Contábil.');
    const c = await carregarParaAnalise(q, cnpj, ws.rows[0].payload);
    if (!c) throw new ErroMigracao('Esta empresa não tem migração do sistema anterior registrada.');
    const doLote = Object.entries(c.decisoes as Record<string, any>).filter(([, d]) => d?.lote === lote);
    if (!doLote.length) throw new ErroMigracao('Não há nada deste grupo para desfazer.');
    const achados = new Map(analisar(c).map((a) => [a.id, a]));
    let payload = c.payload; const decisoes = { ...c.decisoes } as Record<string, any>;
    for (const [id, d] of doLote) {
      const a = achados.get(id);
      if (d.decisao === 'aceito' && a?.alvo && a.valorVeio !== undefined) payload = aplicarAcaoAchado(payload, { ...a, tipo: 'corrigido' }, 'desfazer', quem);
      delete decisoes[id];
    }
    await q(`DELETE FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco=$2`, [cnpj, BLOCO_DECISOES]);
    await q(`INSERT INTO ${TABELA_SISTEMA_ANTERIOR}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [cnpj, BLOCO_DECISOES, JSON.stringify(decisoes), Object.keys(decisoes).length, quem]);
    if (payload !== c.payload) {
      if (!validar(payload)) throw new ErroMigracao('A mudança não passou na validação do Contábil; nada foi alterado.');
      await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1', [cnpj, JSON.stringify(payload)]);
    }
    return { desfeitas: doLote.length, mensagem: `${doLote.length} item(ns) voltaram como estavam.` };
  });
}

const semValor = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Completa, a partir do registro guardado do sistema anterior, os campos que ficaram VAZIOS no Murade (empresas migradas
 * antes de existirem os campos novos). Nunca sobrescreve nada; não mexe em lançamento de competência fechada. Pura.
 */
export function completarPayloadDoRegistro(payload: Record<string, any>, blocos: Record<string, any[]>, mapa: Record<string, string>, cdempresa: number, fechadas: Set<string> = new Set()): { payload: Record<string, any>; preenchidos: string[] } {
  const p = JSON.parse(JSON.stringify(payload || {}));
  const preenchidos: string[] = [];
  p.empresa = p.empresa && typeof p.empresa === 'object' ? p.empresa : {};
  const contas: any[] = Array.isArray(p.contas) ? p.contas : [];
  const porCodigo = new Map(contas.map((c) => [String(c.codigo), c]));
  if (blocos.cadastro_empresa?.length || blocos.contador?.length || blocos.empresa_contabil?.length) {
    const campos = cadastroDoBackup({
      empresa: blocos.cadastro_empresa?.[0], empcont: blocos.empresa_contabil?.[0], contador: blocos.contador?.[0], sociosEmpresa: blocos.socios_empresa || [], socios: blocos.socios || [],
      municipio: blocos.municipio?.[0], pcont: blocos.plano_cadastro?.[0], mapaContas: mapa, tipoConta: (c) => porCodigo.get(c)?.tipo,
      historicoCnae: blocos.cadastro_historico_cnae || [], historicoNire: blocos.historico_nire || [], sentidoMarcaAtiva: sentidoDoBloco(blocos),
    });
    for (const c of campos) if (c.campo !== 'cnpj' && semValor(p.empresa[c.campo])) { p.empresa[c.campo] = c.valor; preenchidos.push(`empresa.${String(c.campo)}`); }
  }
  for (const c of blocos.plano_contas || []) {
    const codigo = mapa[String(Number(c.idconta))]; const red = txt(c.cdchamada);
    const m = codigo ? porCodigo.get(codigo) : undefined;
    if (m && red && semValor(m.codigoReduzido)) { m.codigoReduzido = red.slice(0, 40); preenchidos.push(`conta ${codigo}: código reduzido`); }
  }
  const hist: any[] = Array.isArray(p.historicosPadrao) ? p.historicosPadrao : [];
  for (const h of blocos.historicos_padrao || []) {
    if (txt(h.stcomplemento).toUpperCase() !== 'S') continue;
    const codigo = (txt(h.cdchamada) || txt(h.idhistoricopadrao)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12);
    const m = hist.find((x) => String(x.id) === `sa-hist-${txt(h.idhistoricopadrao).slice(0, 40)}` || String(x.codigo).toUpperCase() === codigo.toUpperCase());
    if (m && m.exigeComplemento === undefined) { m.exigeComplemento = true; preenchidos.push(`histórico ${codigo}: pede complemento`); }
  }
  const lotePorId = new Map((blocos.lotes || []).map((l) => [txt(l.idlote), l]));
  const linhaPorId = new Map((blocos.lancamentos_originais || []).map((m) => [txt(m.idmovimento), m]));
  const prefixo = `sa-${cdempresa}-`;
  let nLanc = 0;
  for (const l of Array.isArray(p.lancamentos) ? p.lancamentos : []) {
    if (l?.origem !== 'Sistema anterior' || !String(l.id || '').startsWith(prefixo) || fechadas.has(String(l.data || '').slice(0, 7))) continue;
    const resto = String(l.id).slice(prefixo.length);
    const linha = linhaPorId.get(resto) || linhaPorId.get(resto.replace(/-\d+$/, ''));
    if (!linha) continue;
    const lote = lotePorId.get(txt(linha.idlote));
    let mudou = false;
    if (lote && txt(lote.dslote) && semValor(l.loteDescricao)) { l.loteDescricao = txt(lote.dslote).slice(0, 200); mudou = true; }
    const seq = Number(linha.identificador_sequencial);
    if (Number.isInteger(seq) && seq > 0 && l.numeroSequencial === undefined) { l.numeroSequencial = seq; mudou = true; }
    if (mudou) nLanc++;
  }
  if (nLanc) preenchidos.push(`${nLanc} lançamento(s): descrição do lote / número sequencial`);
  const bens: any[] = Array.isArray(p.bensImobilizado) ? p.bensImobilizado : [];
  for (const b of bensDoBackup(cdempresa, blocos.imobilizado_bens || [], mapa).bens) {
    const m = bens.find((x) => x.id === b.id);
    if (!m) { if (!bens.some((x) => txt(x.descricao) === b.descricao)) { bens.push(b); preenchidos.push(`bem ${b.descricao}`); } continue; }
    for (const [k, v] of Object.entries(b)) if (m[k] === undefined) { m[k] = v; preenchidos.push(`bem ${b.descricao}: ${k}`); }
  }
  if (bens.length) p.bensImobilizado = bens;
  const padroes: any[] = Array.isArray(p.lancamentosPadrao) ? p.lancamentosPadrao : [];
  const nomes = new Set(padroes.map((x) => String(x?.nome || '').trim().toUpperCase()));
  let nMod = 0;
  for (const m of modelosDoBackup(blocos, mapa, (c) => porCodigo.get(c)?.tipo, new Date().toISOString().slice(0, 7)).modelos) {
    if (padroes.length >= 200 || padroes.some((x) => x.id === m.id) || nomes.has(m.nome.trim().toUpperCase())) continue;
    padroes.push(m); nMod++;
  }
  if (nMod) { p.lancamentosPadrao = padroes; preenchidos.push(`${nMod} modelo(s) de lançamento`); }
  return { payload: p, preenchidos };
}

const BLOCOS_COMPLETAR = ['marca_ativa', 'lancamentos_automaticos', 'lancamentos_automaticos_contas', 'titulos', 'titulos_baixas', 'titulos_provisao', 'cartao_estabelecimentos', 'cartao_movimentos', 'cartao_operadoras', 'cadastro_empresa', 'empresa_contabil', 'contador', 'socios_empresa', 'socios', 'municipio', 'plano_cadastro', 'plano_contas', 'historicos_padrao', 'lotes', 'lancamentos_originais', 'imobilizado_bens', 'cadastro_historico_cnae', 'historico_nire'];

/** Robô: completa os campos vazios de UMA empresa migrada a partir do registro guardado (transação; nunca sobrescreve). */
export async function completarEmpresaMigrada(banco: BancoTransacional, cnpj: string, validar: (p: Record<string, unknown>) => boolean): Promise<string[]> {
  return banco.transacao(async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
    const { resumo } = await lerRegistroSistemaAnterior(q, cnpj);
    if (!resumo) return [];
    const ws = await q('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
    if (!ws.rows.length) return [];
    const r = await q(`SELECT bloco, linhas FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, BLOCOS_COMPLETAR]);
    const blocos: Record<string, any[]> = {};
    for (const x of r.rows) blocos[String(x.bloco)] = Array.isArray(x.linhas) ? x.linhas : [];
    let mapa = resumo.mapaContas;
    if (!mapa) { mapa = {}; for (const c of blocos.plano_contas || []) { const cod = converterClassificacao(c.cdclassinterna); if (cod) mapa[String(Number(c.idconta))] = cod; } }
    const fechadas = new Set((await q('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj])).rows.map((x) => String(x.competencia)));
    const c = completarPayloadDoRegistro(ws.rows[0].payload, blocos, mapa, Number(resumo.cdempresa), fechadas);
    // Títulos e cartões (antiga DIRF) de empresas migradas antes destes módulos: entram nas tabelas próprias.
    const titulos = titulosDoBackup(Number(resumo.cdempresa), blocos, mapa); const cartoes = cartoesDoBackup(Number(resumo.cdempresa), blocos);
    if (titulos.length || cartoes.length) {
      await gravarTitulosECartoesMigrados(q, cnpj, [], []).catch(() => undefined); // garante as tabelas
      const ja = new Set((await q("SELECT id FROM contabil_titulos WHERE cnpj=$1 UNION ALL SELECT id FROM contabil_cartoes WHERE cnpj=$1", [cnpj])).rows.map((x) => String(x.id)));
      const faltamT = titulos.filter((t) => !ja.has(t.id)); const faltamC = cartoes.filter((x) => !ja.has(x.id));
      for (const t of faltamT) await q("INSERT INTO contabil_titulos(cnpj,id,dados,origem) VALUES($1,$2,$3::jsonb,'sistema_anterior') ON CONFLICT (cnpj,id) DO NOTHING", [cnpj, t.id, JSON.stringify(t)]);
      for (const x of faltamC) await q("INSERT INTO contabil_cartoes(cnpj,id,dados,origem) VALUES($1,$2,$3::jsonb,'sistema_anterior') ON CONFLICT (cnpj,id) DO NOTHING", [cnpj, x.id, JSON.stringify(x)]);
      if (faltamT.length) c.preenchidos.push(`${faltamT.length} título(s)`);
      if (faltamC.length) c.preenchidos.push(`${faltamC.length} estabelecimento(s) de cartão`);
    }
    if (!c.preenchidos.length) return [];
    if (JSON.stringify(c.payload) === JSON.stringify(ws.rows[0].payload)) return c.preenchidos;
    if (!validar(c.payload)) { console.error(`Completar campos da migração: ${cnpj} não passou na validação; nada foi gravado.`); return []; }
    await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1', [cnpj, JSON.stringify(c.payload)]);
    return c.preenchidos;
  });
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
