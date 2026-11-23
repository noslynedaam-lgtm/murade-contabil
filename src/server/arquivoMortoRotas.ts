// Rotas do arquivo morto: só o ADMINISTRADOR do escritório (ou o dono do sistema, para os guardados sem escritório) vê se há algo
// guardado de uma empresa que ele já recadastrou, recupera (com a segunda confirmação na tela) e marca "manter guardado".
import type express from 'express';
import { avisosDoEscritorio, marcarManter, recuperarDoArquivoMorto, resumoGuardados, type BancoTx } from './arquivoMorto';

export interface SessaoArquivo { tenantId: string; administrador: boolean; donoSistema: boolean; cnpjs: string[]; login: string }
export interface DepsArquivoMortoRotas {
  banco: BancoTx;
  sessao: (req: express.Request) => SessaoArquivo | undefined;
  exigirSessao: express.RequestHandler;
  exigirOrigem: express.RequestHandler;
  hoje: () => string;
}
const cnpjDe = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Escritórios cujos guardados esta pessoa pode recuperar (o dela; o dono do sistema também os "sem-escritorio"). Vazio = sem permissão. */
export function escritoriosPermitidos(s: SessaoArquivo | undefined): string[] {
  if (!s || !(s.administrador || s.donoSistema)) return [];
  return s.donoSistema ? [s.tenantId, 'sem-escritorio'] : [s.tenantId];
}

export function registrarRotasArquivoMorto(app: express.Express, d: DepsArquivoMortoRotas): void {
  const acesso = (req: express.Request, res: express.Response, exigirCadastro = true): { s: SessaoArquivo; cnpj: string; tenants: string[] } | null => {
    const s = d.sessao(req); const tenants = escritoriosPermitidos(s);
    if (!s || !tenants.length) { res.status(403).json({ sucesso: false, motivo: 'Só o administrador do escritório pode ver ou recuperar documentos guardados.' }); return null; }
    const cnpj = cnpjDe(req.params.cnpj);
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) { res.status(400).json({ sucesso: false, motivo: 'CNPJ inválido.' }); return null; }
    if (exigirCadastro && !s.donoSistema && !s.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Cadastre a empresa de novo antes de recuperar os documentos guardados.' }); return null; }
    return { s, cnpj, tenants };
  };
  app.get('/api/arquivo-morto/:cnpj', d.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const a = acesso(req, res); if (!a) return;
    try {
      let itens = 0; let guardarAte: string | null = null; let manter = false;
      for (const t of a.tenants) { const r = await resumoGuardados(d.banco.consultar, t, a.cnpj); itens += r.itens; if (r.guardarAte && (!guardarAte || r.guardarAte > guardarAte)) guardarAte = r.guardarAte; manter = manter || r.manter; }
      return res.json({ sucesso: true, cnpj: a.cnpj, itens, guardarAte, manter });
    } catch { return res.status(503).json({ sucesso: false, motivo: 'Não foi possível consultar agora.' }); }
  });
  app.post('/api/arquivo-morto/:cnpj/recuperar', d.exigirOrigem, d.exigirSessao, async (req, res) => {
    const a = acesso(req, res); if (!a) return;
    if (req.body?.confirmar !== true) return res.status(400).json({ sucesso: false, motivo: 'Confirme a recuperação (segunda confirmação).' });
    try {
      const total = { recuperados: 0, porTabela: {} as Record<string, number>, jaExistiam: 0, workspace: 'sem_workspace' as string, pendencias: [] as string[] };
      for (const t of a.tenants) {
        const r = await recuperarDoArquivoMorto(d.banco, t, a.cnpj, a.s.login);
        total.recuperados += r.recuperados; total.jaExistiam += r.jaExistiam; total.pendencias.push(...r.pendencias);
        for (const [k, v] of Object.entries(r.porTabela)) total.porTabela[k] = (total.porTabela[k] || 0) + v;
        if (r.workspace !== 'sem_workspace') total.workspace = r.workspace;
      }
      return res.json({ sucesso: true, ...total });
    } catch (e: any) { console.error('Arquivo morto: falha ao recuperar', a.cnpj, e?.message || e); return res.status(503).json({ sucesso: false, motivo: 'Não foi possível recuperar agora. Nada foi alterado pela metade: tente de novo.' }); }
  });
  // "Manter guardado" vale também para empresa ainda não recadastrada (o aviso do prazo chega antes do recadastro).
  app.post('/api/arquivo-morto/:cnpj/manter', d.exigirOrigem, d.exigirSessao, async (req, res) => {
    const a = acesso(req, res, false); if (!a) return;
    try { let n = 0; for (const t of a.tenants) n += await marcarManter(d.banco.consultar, t, a.cnpj, req.body?.manter === true, String(req.body?.motivo ?? ''), a.s.login); return res.json({ sucesso: true, alterados: n }); }
    catch (e: any) { return res.status(400).json({ sucesso: false, motivo: e?.message || 'Não foi possível salvar.' }); }
  });
  // Avisos de prazo de guarda vencendo (só CNPJ e data) para o administrador, em todas as empresas excluídas do escritório.
  app.get('/api/arquivo-morto-avisos', d.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req); const tenants = escritoriosPermitidos(s);
    if (!tenants.length) return res.json({ sucesso: true, avisos: [] });
    try { const avisos = []; for (const t of tenants) avisos.push(...await avisosDoEscritorio(d.banco.consultar, t, d.hoje())); return res.json({ sucesso: true, avisos }); }
    catch { return res.json({ sucesso: true, avisos: [] }); }
  });
}
