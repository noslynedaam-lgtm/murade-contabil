// CNPJ do escritório (cada escritório cliente informa o seu) e liberação do adicional "Consultor Murade completo".
// Isolado por escritório: cada sessão só lê e grava o CNPJ do PRÓPRIO escritório (tenant). Nada aqui fica preso a um
// escritório ou empresa específicos.
import type { Express, Request, RequestHandler } from 'express';
import { FRASE_NAO_LIBERADO, consultorLiberado, type OpcoesConsultor } from './consultorMurade';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface SessaoEscritorio { tenantId: string; podeEditar: boolean }

/** CNPJ com dígitos verificadores válidos (só números). */
export function cnpjValido(v: unknown): string | null {
  const c = String(v ?? '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return null;
  const dv = (base: string) => { const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = base.split('').reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]) ? c : null;
}

export function criarStoreEscritorio(consultar: Consultar) {
  let pronta: Promise<void> | null = null;
  const garantir = () => { pronta ??= consultar('CREATE TABLE IF NOT EXISTS contabil_escritorio_cnpj (tenant_id text PRIMARY KEY, cnpj text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())').then(() => undefined).catch((e) => { pronta = null; throw e; }); return pronta; };
  const cache = new Map<string, { cnpj: string | null; ate: number }>();
  return {
    async ler(tenantId: string): Promise<string | null> {
      const c = cache.get(tenantId); if (c && c.ate > Date.now()) return c.cnpj;
      await garantir();
      const r = await consultar('SELECT cnpj FROM contabil_escritorio_cnpj WHERE tenant_id=$1', [tenantId]);
      const cnpj = r.rows[0]?.cnpj ? String(r.rows[0].cnpj) : null;
      if (cache.size > 1000) cache.clear();
      cache.set(tenantId, { cnpj, ate: Date.now() + 60_000 });
      return cnpj;
    },
    async gravar(tenantId: string, cnpj: string): Promise<void> {
      await garantir();
      await consultar('INSERT INTO contabil_escritorio_cnpj(tenant_id,cnpj,atualizado_em) VALUES($1,$2,now()) ON CONFLICT (tenant_id) DO UPDATE SET cnpj=EXCLUDED.cnpj, atualizado_em=now()', [tenantId, cnpj]);
      cache.delete(tenantId);
    },
  };
}
export type StoreEscritorio = ReturnType<typeof criarStoreEscritorio>;

export function registrarRotasEscritorioConsultor(app: Express, mw: { exigirSessao: RequestHandler; exigirOrigem: RequestHandler }, deps: { store: StoreEscritorio; sessao: (req: Request) => SessaoEscritorio | undefined; opcoes?: () => OpcoesConsultor }): void {
  app.get('/api/escritorio/cnpj', mw.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    try { res.json({ sucesso: true, cnpj: await deps.store.ler(s.tenantId), podeEditar: s.podeEditar }); } catch { res.json({ sucesso: true, cnpj: null, podeEditar: s.podeEditar, indisponivel: true }); }
  });
  app.post('/api/escritorio/cnpj', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    if (!s.podeEditar) { res.status(403).json({ sucesso: false, motivo: 'Só o administrador do escritório informa o CNPJ do escritório.' }); return; }
    const cnpj = cnpjValido(req.body?.cnpj);
    if (!cnpj) { res.status(400).json({ sucesso: false, motivo: 'CNPJ inválido. Confira os 14 números.' }); return; }
    try { await deps.store.gravar(s.tenantId, cnpj); res.json({ sucesso: true, cnpj, mensagem: 'CNPJ do escritório gravado.' }); } catch { res.status(503).json({ sucesso: false, motivo: 'Não consegui gravar agora. Tente de novo.' }); }
  });
  // Liberação do adicional para o escritório de quem chama (a Agente e a tela usam). Falha = não liberado, sem erro.
  app.get('/api/consultor/liberado', mw.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    let cnpj: string | null = null;
    try { cnpj = await deps.store.ler(s.tenantId); } catch { cnpj = null; }
    const liberado = cnpj ? await consultorLiberado(cnpj, deps.opcoes?.() ?? {}).catch(() => false) : false;
    res.json({ sucesso: true, liberado, escritorio: cnpj, ...(liberado ? {} : { frase: FRASE_NAO_LIBERADO, semCnpjDoEscritorio: !cnpj || undefined }) });
  });
}
