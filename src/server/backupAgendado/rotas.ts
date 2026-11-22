// Rotas da tela "Backup" do escritório (iguais nos três sistemas Murade; muda só o prefixo, ex.: /api/dp/backup-agendado).
// Quem pode o quê (decisão do dono):
//  - ver a tela, a lista, o relatório e baixar: qualquer pessoa do escritório;
//  - "Fazer backup agora": administrador ou equipe do escritório;
//  - mudar agenda, opções, nuvem e RESTAURAR: só o administrador do escritório.
// Tudo é do escritório da sessão (tenantId): não existe parâmetro para escolher outro escritório.
import express from 'express';
import type { ServicoBackupAgendado } from './servico';
import { ErroArquivoBackup } from './formato';

export interface SessaoBackup { tenantId: string; login: string; administrador: boolean; equipe: boolean }

export function montarRotasBackupAgendado(
  app: express.Express, base: string, servico: ServicoBackupAgendado,
  sessaoDe: (req: express.Request) => SessaoBackup | null,
  protecao: { leitura: express.RequestHandler[]; escrita: express.RequestHandler[] },
): void {
  const semCache = (_req: express.Request, res: express.Response, next: express.NextFunction) => { res.setHeader('Cache-Control', 'private, no-store'); next(); };
  const exigir = (nivel: 'qualquer' | 'equipe' | 'admin') => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const s = sessaoDe(req);
    if (!s?.tenantId) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    if (nivel === 'admin' && !s.administrador) return res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório muda a agenda, o destino e restaura backup.' });
    if (nivel === 'equipe' && !s.administrador && !s.equipe) return res.status(403).json({ sucesso: false, motivo: 'Somente o administrador ou a equipe do escritório faz backup.' });
    (req as any).sessaoBackup = s;
    next();
  };
  const sessao = (req: express.Request): SessaoBackup => (req as any).sessaoBackup;
  const falha = (res: express.Response, rotulo: string, e: any) => {
    if (e instanceof ErroArquivoBackup) return res.status(400).json({ sucesso: false, motivo: e.message });
    console.error(`[Backup ${servico.sistema}] ${rotulo}:`, String(e?.message || e).slice(0, 300));
    return res.status(503).json({ sucesso: false, motivo: String(e?.message || 'Não foi possível agora. Tente de novo em instantes.').slice(0, 300) });
  };
  const L = [semCache, ...protecao.leitura];
  const E = [semCache, ...protecao.escrita];

  app.get(`${base}/resumo`, ...L, exigir('qualquer'), async (req, res) => {
    try { const s = sessao(req); return res.json({ sucesso: true, ...(await servico.resumo(s.tenantId)), voce: { login: s.login, administrador: s.administrador, equipe: s.equipe } }); }
    catch (e) { return falha(res, 'resumo', e); }
  });
  app.get(`${base}/lista`, ...L, exigir('qualquer'), async (req, res) => {
    try {
      const s = sessao(req);
      const [execucoes, mensais] = await Promise.all([servico.listarExecucoes(s.tenantId, 100), servico.listarMensais(s.tenantId).catch(() => [])]);
      return res.json({ sucesso: true, execucoes, mensais });
    } catch (e) { return falha(res, 'lista', e); }
  });
  app.get(`${base}/relatorio`, ...L, exigir('qualquer'), async (req, res) => {
    try { return res.json({ sucesso: true, ...(await servico.relatorio(sessao(req).tenantId, String(req.query.de || ''), String(req.query.ate || ''))) }); }
    catch (e) { return falha(res, 'relatório', e); }
  });
  app.get(`${base}/aviso`, ...L, exigir('qualquer'), async (req, res) => {
    try { const s = sessao(req); return res.json({ sucesso: true, ...(await servico.aviso(s.tenantId, s.login, req.query.momento === 'sair' ? 'sair' : 'entrar')) }); }
    catch (e) { return falha(res, 'aviso', e); }
  });
  app.get(`${base}/usuarios`, ...L, exigir('admin'), async (req, res) => {
    try { return res.json({ sucesso: true, usuarios: await servico.usuarios(sessao(req).tenantId) }); }
    catch (e) { return falha(res, 'usuários', e); }
  });
  app.post(`${base}/config`, ...E, exigir('admin'), async (req, res) => {
    try {
      const s = sessao(req);
      const r = await servico.salvarConfig(s.tenantId, req.body || {}, s.login);
      if (r.ok === false) return res.status(400).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true, config: r.config, mensagem: 'Agenda e opções do backup gravadas.' });
    } catch (e) { return falha(res, 'config', e); }
  });
  app.post(`${base}/perfis`, ...E, exigir('admin'), async (req, res) => {
    try {
      const s = sessao(req);
      const r = await servico.adicionarPerfil(s.tenantId, req.body || {}, s.login);
      if (r.ok === false) return res.status(400).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true, perfil: r.perfil, config: r.config, mensagem: 'Agendamento incluído.' });
    } catch (e) { return falha(res, 'perfil', e); }
  });
  app.post(`${base}/nuvem`, ...E, exigir('admin'), async (req, res) => {
    try {
      const s = sessao(req);
      const r = await servico.salvarNuvem(s.tenantId, req.body || {}, s.login);
      return res.status(r.ok ? 200 : 400).json({ sucesso: r.ok, motivo: r.ok ? undefined : r.mensagem, mensagem: r.mensagem, nuvem: r.nuvem });
    } catch (e) { return falha(res, 'nuvem', e); }
  });
  app.post(`${base}/nuvem/testar`, ...E, exigir('admin'), async (req, res) => {
    try { const r = await servico.testarNuvem(sessao(req).tenantId, req.body || {}); return res.status(r.ok ? 200 : 400).json({ sucesso: r.ok, motivo: r.ok ? undefined : r.mensagem, mensagem: r.mensagem }); }
    catch (e) { return falha(res, 'teste da nuvem', e); }
  });
  app.post(`${base}/executar`, ...E, exigir('equipe'), async (req, res) => {
    try {
      const s = sessao(req);
      const tipo = req.body?.tipo === 'alteracoes' ? 'alteracoes' : 'completo';
      const origem = req.body?.origem === 'agente' ? 'agente' : 'manual';
      const r = servico.iniciar(s.tenantId, { tipo, origem, usuario: s.login });
      if (r.ok === false) return res.status(409).json({ sucesso: false, motivo: r.motivo });
      return res.status(202).json({ sucesso: true, mensagem: `Backup ${tipo === 'completo' ? 'completo' : 'só das alterações'} iniciado. Leva de alguns segundos a poucos minutos; o resultado aparece na lista.` });
    } catch (e) { return falha(res, 'executar', e); }
  });
  app.get(`${base}/:id/arquivo`, ...L, exigir('qualquer'), async (req, res) => {
    try {
      const s = sessao(req);
      const reg = await servico.obterExecucao(s.tenantId, String(req.params.id));
      const arquivo = reg ? await servico.arquivoDe(s.tenantId, reg.id) : null;
      if (!reg || !arquivo) return res.status(404).json({ sucesso: false, motivo: 'Backup não encontrado para o seu escritório (ou o arquivo já saiu pela retenção).' });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${(reg.nomeArquivo || `${reg.id}.murade`).replace(/[^A-Za-z0-9._-]/g, '')}"`);
      return res.send(arquivo);
    } catch (e) { return falha(res, 'baixar', e); }
  });
  app.post(`${base}/:id/salvo-na-pasta`, ...E, exigir('qualquer'), async (req, res) => {
    try { return res.json({ sucesso: await servico.marcarSalvoNaPasta(sessao(req).tenantId, String(req.params.id)) }); }
    catch (e) { return falha(res, 'salvo na pasta', e); }
  });
  app.post(`${base}/restaurar/previa`, ...E, exigir('admin'), async (req, res) => {
    try {
      const s = sessao(req);
      const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
      const mensalId = typeof req.body?.mensalId === 'string' ? req.body.mensalId : undefined;
      if (!id && !mensalId) return res.status(400).json({ sucesso: false, motivo: 'Escolha o backup a restaurar.' });
      return res.json({ sucesso: true, ...(await servico.previaRestauracao(s.tenantId, s.login, { id, mensalId })) });
    } catch (e) { return falha(res, 'prévia', e); }
  });
  app.post(`${base}/restaurar/previa-arquivo`, ...E, exigir('admin'), express.raw({ type: () => true, limit: '200mb' }), async (req, res) => {
    try {
      const s = sessao(req);
      const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (corpo.length < 20) return res.status(400).json({ sucesso: false, motivo: 'Escolha o arquivo .murade do backup.' });
      return res.json({ sucesso: true, ...(await servico.previaRestauracao(s.tenantId, s.login, { arquivo: corpo })) });
    } catch (e) { return falha(res, 'prévia do arquivo', e); }
  });
  app.post(`${base}/restaurar/confirmar`, ...E, exigir('admin'), async (req, res) => {
    try {
      const s = sessao(req);
      const r = await servico.confirmarRestauracao(s.tenantId, s.login, String(req.body?.token || ''), String(req.body?.confirmacao || ''));
      if (r.ok === false) return res.status(400).json({ sucesso: false, motivo: r.motivo });
      console.log(`[Backup ${servico.sistema}] restauração feita por ${s.login}`);
      return res.json({ sucesso: true, ...r });
    } catch (e) { return falha(res, 'restaurar', e); }
  });
}
