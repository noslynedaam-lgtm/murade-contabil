// Rotas da migração da parte contábil pelo backup do sistema anterior e o Robô Conferidor da Migração.
// Enviar/prévia/gravar: só o administrador ou a equipe do escritório. Consultar o registro de uma empresa: quem tem acesso a ela.
import type express from 'express';
import type { ContaPlano } from '../../types';
import type { SessaoContabil } from '../authContabil';
import type { BancoTransacional, ConsultaSql } from '../exclusaoEmpresaCascata';
import {
  descartarMigracaoContabil, gerarPreviaContabil, gravarMigracaoContabil, iniciarLimpezaMigracaoContabil, listarEmpresasDoBackupContabil,
  receberArquivoContabil, situacaoMigracaoContabilDoUsuario,
} from './servico';
import { completarEmpresaMigrada, analisarEmpresaMigrada, aplicarAchadoEmpresaMigrada, type AcaoAchado, cnpjsMigrados, conferirCamposEmpresaMigrada, conferirEmpresaMigrada, empresaExcluidaAntes, ErroMigracao, gravarEmpresaMigrada, lerBlocoSistemaAnterior, lerRegistroSistemaAnterior } from './banco';

export interface DependenciasRotasMigracao {
  exigirSessao: express.RequestHandler;
  exigirOrigemNavegador: express.RequestHandler;
  consultar: ConsultaSql;
  banco: () => BancoTransacional;
  preparar: () => Promise<void>;
  bancoConfigurado: () => boolean;
  workspaceValido: (payload: unknown) => boolean;
  cnpjValido: (cnpj: unknown) => boolean;
  modelo: ContaPlano[];
  robos: {
    executarRobo: (id: string, fn: () => Promise<void>) => Promise<unknown>;
    registrarResultadoRobo: (id: string, texto: string) => void;
    definirAlertaRobo: (id: string, alerta: { nivel: 'aviso' | 'critico'; texto: string } | null) => void;
  };
}

const sessaoDe = (req: express.Request) => (req as express.Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
const motivo = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir esta etapa da migração.');
export const competenciaDoBrasil = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
const normalizar = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function registrarRotasMigracaoSistemaAnterior(app: express.Express, dep: DependenciasRotasMigracao): void {
  iniciarLimpezaMigracaoContabil();
  const base = '/api/migracao-sistema-anterior';
  const doEscritorio = (req: express.Request, res: express.Response): SessaoContabil | null => {
    const s = sessaoDe(req);
    if (!s || (!s.administrador && !s.escritorioDe)) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador ou a equipe do escritório pode migrar o backup do sistema anterior.' }); return null; }
    if (!dep.bancoConfigurado()) { res.status(503).json({ sucesso: false, motivo: 'Banco do Contábil não configurado.' }); return null; }
    return s;
  };
  const tenantDe = (s: SessaoContabil) => s.tenantId || s.escritorioDe || s.userId;
  const deOutroEscritorio = async (cnpj: string, s: SessaoContabil) => (await dep.consultar('SELECT 1 FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND COALESCE(u.tenant_id,u.id)::text<>$2 LIMIT 1', [cnpj, tenantDe(s)])).rows.length > 0;
  const excluida = (cnpj: string) => empresaExcluidaAntes(dep.consultar, cnpj);

  app.post(`${base}/arquivo`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = doEscritorio(req, res); if (!s) return;
    try { const r = await receberArquivoContabil(req, s.userId, String(req.query.compactado || '') === 'gzip'); res.json({ sucesso: true, ...r }); }
    catch (e) { res.status(400).json({ sucesso: false, motivo: motivo(e) }); }
  });
  app.post(`${base}/empresas`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = doEscritorio(req, res); if (!s) return;
    try { res.json({ sucesso: true, ...(await listarEmpresasDoBackupContabil(String(req.body?.token || ''), s.userId)) }); }
    catch (e) { res.status(400).json({ sucesso: false, motivo: motivo(e) }); }
  });
  app.post(`${base}/previa`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = doEscritorio(req, res); if (!s) return;
    try {
      await dep.preparar();
      const empresas = await gerarPreviaContabil(String(req.body?.token || ''), s.userId, req.body?.cdempresas, req.body?.cnpjs, {
        async lerAtual(cnpj) {
          const ws = await dep.consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]);
          const comp = ws.rows.length ? null : (await dep.consultar('SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1', [cnpj])).rows[0]?.dados ?? null;
          const f = await dep.consultar('SELECT competencia FROM contabil_period_closures WHERE cnpj=$1', [cnpj]);
          return { payload: ws.rows[0]?.payload ?? null, compartilhado: comp, fechadas: new Set(f.rows.map((r) => String(r.competencia))) };
        },
        deOutroEscritorio: (cnpj) => deOutroEscritorio(cnpj, s),
        excluidaAntes: excluida,
        cnpjValido: (c) => dep.cnpjValido(c),
        validarWorkspace: (p) => dep.workspaceValido(p),
        modelo: dep.modelo,
        competenciaAtual: competenciaDoBrasil(),
      });
      res.json({ sucesso: true, empresas });
    } catch (e) { res.status(400).json({ sucesso: false, motivo: motivo(e) }); }
  });
  app.post(`${base}/gravar`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = doEscritorio(req, res); if (!s) return;
    try {
      await dep.preparar();
      const resultados = await gravarMigracaoContabil(String(req.body?.token || ''), s.userId, req.body?.cdempresas, req.body?.escolhidasUmaAUma === true, async (dados) => {
        try {
          return await gravarEmpresaMigrada(dep.banco(), dados, { userId: s.userId, login: s.login, escritorioId: s.escritorioDe || s.userId, tenantId: tenantDe(s) }, {
            modelo: dep.modelo, validar: (p) => dep.workspaceValido(p), competenciaAtual: competenciaDoBrasil(),
          });
        } catch (e) {
          if (e instanceof ErroMigracao) throw e;
          console.error('Falha ao gravar empresa migrada no Contábil:', (e as Error)?.message || e);
          throw new Error('O banco não confirmou a gravação desta empresa; nada ficou pela metade. Tente de novo.');
        }
      }, excluida);
      res.json({ sucesso: true, resultados });
    } catch (e) { res.status(400).json({ sucesso: false, motivo: motivo(e) }); }
  });
  app.post(`${base}/descartar`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = doEscritorio(req, res); if (!s) return;
    descartarMigracaoContabil(String(req.body?.token || ''));
    res.json({ sucesso: true });
  });
  app.get(`${base}/situacao`, dep.exigirSessao, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = sessaoDe(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    res.json({ sucesso: true, ...situacaoMigracaoContabilDoUsuario(s.userId) });
  });
  app.get(`${base}/registro/:cnpj`, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = sessaoDe(req); const cnpj = normalizar(req.params.cnpj);
    if (!s || !s.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Empresa fora do seu acesso.' }); return; }
    try {
      const reg = await lerRegistroSistemaAnterior(dep.consultar, cnpj);
      const conferencia = reg.resumo ? await conferirEmpresaMigrada(dep.consultar, cnpj) : null;
      const campos = reg.resumo ? await conferirCamposEmpresaMigrada(dep.consultar, cnpj) : null;
      const analise = reg.resumo ? await analisarEmpresaMigrada(dep.consultar, cnpj) : null;
      const { esperado: _e, esperadoLancamentos: _l, saldoFinalEsperado: _s, mapaContas: _m, ...resumo } = (reg.resumo || {}) as any;
      res.json({ sucesso: true, cnpj, resumo: reg.resumo ? { ...resumo, naoEntraram: (resumo.naoEntraram || []).slice(0, 50) } : null, blocos: reg.blocos, conferencia,
        campos: campos ? { resumo: campos.resumo, conferidos: campos.conferidos, totalPendencias: campos.pendencias.length, pendencias: campos.pendencias.slice(0, 300), semCadastroNoRegistro: campos.semCadastroNoRegistro } : null,
        analise: analise ? { resumo: analise.resumo, achados: analise.achados.slice(0, 300).map(({ valorVeio: _v, valorCerto: _c, ...a }) => ({ ...a, alvo: a.alvo ? { tipo: a.alvo.tipo, campo: a.alvo.campo, codigo: a.alvo.codigo, quantidade: a.alvo.ids?.length } : undefined })) } : null });
    } catch (e) { console.error('Falha ao ler registro do sistema anterior:', (e as Error)?.message || e); res.status(503).json({ sucesso: false, motivo: 'Não foi possível ler o registro do sistema anterior agora.' }); }
  });
  const ACOES: AcaoAchado[] = ['corrigir', 'desfazer', 'aceitar', 'manter', 'lancar_ajuste', 'desfazer_ajuste', 'corrigir_todos'];
  app.post(`${base}/registro/:cnpj/achado`, dep.exigirOrigemNavegador, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = sessaoDe(req); const cnpj = normalizar(req.params.cnpj);
    if (!s || !s.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Empresa fora do seu acesso.' }); return; }
    if (!s.administrador && !s.escritorioDe) { res.status(403).json({ sucesso: false, motivo: 'Só a equipe do escritório decide os itens da migração.' }); return; }
    const acao = String(req.body?.acao || '') as AcaoAchado; const id = String(req.body?.id || '').slice(0, 200);
    if (!ACOES.includes(acao) || (acao !== 'corrigir_todos' && !id)) { res.status(400).json({ sucesso: false, motivo: 'Ação inválida.' }); return; }
    try {
      await dep.preparar();
      const r = await aplicarAchadoEmpresaMigrada(dep.banco(), cnpj, id, acao, s.login, (p) => dep.workspaceValido(p));
      res.json({ sucesso: true, mensagem: r.mensagem, resumo: r.resumo, bate: r.conferencia.bate, conferencia: r.conferencia.resumo });
    } catch (e) {
      if (e instanceof ErroMigracao || (e instanceof Error && !/connect|ECONN|timeout/i.test(e.message))) { res.status(409).json({ sucesso: false, motivo: motivo(e) }); return; }
      console.error('Falha ao aplicar item da análise da migração:', (e as Error)?.message || e);
      res.status(503).json({ sucesso: false, motivo: 'O banco não confirmou; nada foi alterado. Tente de novo.' });
    }
  });
  app.get(`${base}/registro/:cnpj/bloco/:bloco`, dep.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = sessaoDe(req); const cnpj = normalizar(req.params.cnpj);
    if (!s || !s.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Empresa fora do seu acesso.' }); return; }
    const bloco = String(req.params.bloco || '').toLowerCase().replace(/[^a-z_]/g, '');
    try { res.json({ sucesso: true, cnpj, bloco, ...(await lerBlocoSistemaAnterior(dep.consultar, cnpj, bloco, Number(req.query.desde) || 0, Number(req.query.limite) || 100)) }); }
    catch (e) { console.error('Falha ao ler bloco do sistema anterior:', (e as Error)?.message || e); res.status(503).json({ sucesso: false, motivo: 'Não foi possível ler este bloco agora.' }); }
  });
}

/** Rotina do Robô Conferidor da Migração do Sistema Anterior (registrado no server.ts). Só lê e avisa. */
export function rotinaConferidorMigracao(dep: Pick<DependenciasRotasMigracao, 'consultar' | 'preparar' | 'bancoConfigurado' | 'robos'> & { banco?: () => BancoTransacional; workspaceValido?: (p: unknown) => boolean }, id = 'conferidor_migracao_sistema_anterior'): () => Promise<unknown> | undefined {
  return () => dep.bancoConfigurado() ? dep.robos.executarRobo(id, async () => {
    await dep.preparar();
    const cnpjs = await cnpjsMigrados(dep.consultar);
    // Primeiro completa sozinho os campos que ficaram vazios (empresas migradas antes dos campos novos), sem sobrescrever.
    let completadas = 0; let camposCompletados = 0;
    if (dep.banco && dep.workspaceValido) {
      for (const cnpj of cnpjs) {
        try { const f = await completarEmpresaMigrada(dep.banco(), cnpj, (p) => dep.workspaceValido!(p)); if (f.length) { completadas++; camposCompletados += f.length; } }
        catch (e) { console.error(`Completar campos da migração falhou para ${cnpj}:`, (e as Error)?.message || e); }
      }
    }
    const problemas: string[] = [];
    const camposPendentes: string[] = [];
    let desatualizados = 0; let totalPendencias = 0; let totalConferir = 0; let totalAjustes = 0;
    const analises: string[] = [];
    for (const cnpj of cnpjs) {
      const c = await conferirEmpresaMigrada(dep.consultar, cnpj);
      if (!c) continue;
      if (!c.bate) problemas.push(`${cnpj}: ${c.resumo}`);
      else if (c.saldosAntigosDesatualizadosNoSistemaAnterior) desatualizados++;
      // Campo a campo: o que estava preenchido no sistema anterior e chegou vazio ou diferente no Murade.
      const an = await analisarEmpresaMigrada(dep.consultar, cnpj).catch(() => null);
      if (an) {
        const ajustes = an.achados.filter((a) => a.tipo === 'ajuste' && a.situacao === 'pendente').length;
        const conferir = an.achados.filter((a) => a.tipo === 'conferir' && a.situacao === 'pendente').length;
        if (ajustes || conferir) analises.push(`${cnpj}: ${conferir} item(ns) para o contador conferir${ajustes ? `, ${ajustes} ajuste(s) prontos esperando o "Sim"` : ''}`);
        totalConferir += conferir; totalAjustes += ajustes;
      }
      const f = await conferirCamposEmpresaMigrada(dep.consultar, cnpj).catch((e) => { console.error(`Conferidor campo a campo falhou para ${cnpj}:`, (e as Error)?.message || e); return null; });
      if (f?.pendencias.length) {
        totalPendencias += f.pendencias.length;
        const ex = f.pendencias[0];
        camposPendentes.push(`${cnpj}: ${f.pendencias.length} campo(s) (ex.: ${ex.item} › ${ex.rotulo}: "${ex.noSistemaAnterior.slice(0, 60)}" no sistema anterior, "${ex.noMurade.slice(0, 60)}" no Murade)`);
      }
    }
    let texto = !cnpjs.length ? 'Nenhuma empresa migrada pelo backup do sistema anterior ainda.'
      : problemas.length ? `${problemas.length} de ${cnpjs.length} empresa(s) migrada(s) não batem com o sistema anterior. ${problemas.slice(0, 3).join(' | ')}`
        : `${cnpjs.length} empresa(s) migrada(s) conferida(s): o balancete do Murade bate com o sistema anterior em todas${desatualizados ? ` (em ${desatualizados}, a tabela de saldos antiga do sistema anterior estava desatualizada e valeram os lançamentos de lá)` : ''}.`;
    if (cnpjs.length) texto += camposPendentes.length
      ? ` Campo a campo: ${totalPendencias} pendência(s) em ${camposPendentes.length} empresa(s) — ${camposPendentes.slice(0, 3).join(' | ')}. Veja na empresa › Migração › "O que veio do sistema anterior".`
      : ' Campo a campo: todos os campos preenchidos no sistema anterior estão iguais no Murade.';
    if (completadas) texto += ` Completei sozinho ${camposCompletados} campo(s) vazio(s) em ${completadas} empresa(s) a partir do registro do sistema anterior (nada foi sobrescrito).`;
    if (cnpjs.length && analises.length) texto += ` Análise do que veio errado do sistema anterior: ${totalConferir} item(ns) para o contador conferir${totalAjustes ? ` e ${totalAjustes} ajuste(s) prontos` : ''} — ${analises.slice(0, 3).join(' | ')}.`;
    dep.robos.registrarResultadoRobo(id, texto);
    dep.robos.definirAlertaRobo(id, problemas.length || camposPendentes.length || totalAjustes ? { nivel: 'aviso', texto } : null);
  }).catch((e) => console.error('Falha no Robô Conferidor da Migração do Sistema Anterior:', (e as Error)?.message || e)) : undefined;
}
