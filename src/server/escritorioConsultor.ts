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
  const garantir = () => {
    pronta ??= consultar('CREATE TABLE IF NOT EXISTS contabil_escritorio_cnpj (tenant_id text PRIMARY KEY, cnpj text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())')
      .then(() => consultar("ALTER TABLE contabil_escritorio_cnpj ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual'")).then(() => undefined)
      .catch((e) => { pronta = null; throw e; });
    return pronta;
  };
  const tentativas = new Map<string, number>();
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
    async gravar(tenantId: string, cnpj: string, origem: 'manual' | 'dp' | 'fiscoia' = 'manual'): Promise<void> {
      await garantir();
      if (origem === 'manual') await consultar("INSERT INTO contabil_escritorio_cnpj(tenant_id,cnpj,origem,atualizado_em) VALUES($1,$2,'manual',now()) ON CONFLICT (tenant_id) DO UPDATE SET cnpj=EXCLUDED.cnpj, origem='manual', atualizado_em=now()", [tenantId, cnpj]);
      // Automático: só preenche o que está VAZIO; nunca sobrescreve o que o escritório informou.
      else await consultar('INSERT INTO contabil_escritorio_cnpj(tenant_id,cnpj,origem,atualizado_em) VALUES($1,$2,$3,now()) ON CONFLICT (tenant_id) DO NOTHING', [tenantId, cnpj, origem]);
      cache.delete(tenantId);
    },
    /** Lê; se vazio, tenta descobrir pelos outros sistemas Murade (no máximo uma tentativa a cada 10 min por escritório). */
    async lerOuDescobrir(tenantId: string): Promise<string | null> {
      const atual = await this.ler(tenantId);
      if (atual) return atual;
      const ultima = tentativas.get(tenantId) ?? 0;
      if (Date.now() - ultima < 10 * 60_000) return null;
      tentativas.set(tenantId, Date.now());
      const d = await descobrirCnpjDoEscritorio(consultar, tenantId);
      if (!d.cnpj) return null;
      await this.gravar(tenantId, d.cnpj, d.origem!);
      return this.ler(tenantId);
    },
  };
}
export type StoreEscritorio = ReturnType<typeof criarStoreEscritorio>;

// ---------------------------------------------------------------------------------------------
// Descoberta automática do CNPJ do escritório nos outros sistemas Murade (mesmo banco PostgreSQL).
// Ligação segura: o DONO do escritório no Contábil (contabil_auth_users com id = tenant e global_admin) tem o MESMO login
// (e-mail, confirmado por convite) que o dono do escritório no outro sistema:
//  - DP: dp_auth_users.office_admin = true → dp_escritorio_perfil.cnpj do tenant dele (ou dp_auth_users.cnpj_escritorio);
//  - Fisco IA: fiscoia.users.email → fiscoia.tenant_memberships com papel OWNER → fiscoia.tenants.office_cnpj.
// Só vale com UM escritório encontrado em cada sistema, CNPJ com dígitos válidos, e quando DP e Fisco IA não discordam.
// Tabela ou permissão inexistente (outro banco) = sem ligação; o campo manual continua valendo. Só lê os outros sistemas.
// ---------------------------------------------------------------------------------------------
export type Descoberta = { cnpj: string | null; origem?: 'dp' | 'fiscoia'; motivo: string };
async function tentar(consultar: Consultar, sql: string, params: unknown[]): Promise<any[] | null> {
  try { return (await consultar(sql, params)).rows; } catch { return null; }
}
export async function descobrirCnpjDoEscritorio(consultar: Consultar, tenantId: string): Promise<Descoberta> {
  const dono = await tentar(consultar, 'SELECT login FROM contabil_auth_users WHERE id::text=$1 AND global_admin=true AND disabled=false', [tenantId]);
  const login = dono?.[0]?.login ? String(dono[0].login).trim().toLowerCase() : '';
  if (!login) return { cnpj: null, motivo: 'Não achei o dono deste escritório no Contábil; informe o CNPJ no campo manual.' };
  const achados: Array<{ origem: 'dp' | 'fiscoia'; cnpj: string }> = [];
  const dp = await tentar(consultar, `SELECT COALESCE(NULLIF(p.cnpj,''), u.cnpj_escritorio) AS cnpj FROM dp_auth_users u LEFT JOIN dp_escritorio_perfil p ON p.tenant_id = COALESCE(u.tenant_id, u.id)::text WHERE lower(u.login)=$1 AND u.office_admin=true AND u.disabled=false`, [login]);
  if (dp && dp.length === 1) { const c = cnpjValido(dp[0].cnpj); if (c) achados.push({ origem: 'dp', cnpj: c }); }
  const fi = await tentar(consultar, `SELECT DISTINCT t.office_cnpj AS cnpj FROM fiscoia.users u JOIN fiscoia.tenant_memberships m ON m.user_id=u.id AND m.role='OWNER' JOIN fiscoia.tenants t ON t.id=m.tenant_id WHERE lower(u.email)=$1`, [login]);
  if (fi && fi.length === 1) { const c = cnpjValido(fi[0].cnpj); if (c) achados.push({ origem: 'fiscoia', cnpj: c }); }
  const distintos = [...new Set(achados.map((a) => a.cnpj))];
  if (!distintos.length) return { cnpj: null, motivo: 'O dono do escritório ainda não informou o CNPJ do escritório no DP nem no Fisco IA (ou eles estão em outro banco); informe no campo manual.' };
  if (distintos.length > 1) return { cnpj: null, motivo: 'O DP e o Fisco IA têm CNPJs diferentes para este escritório; por segurança não preenchi. Informe no campo manual.' };
  return { cnpj: distintos[0], origem: achados[0].origem, motivo: `Preenchido pelo ${achados[0].origem === 'dp' ? 'DP' : 'Fisco IA'} (mesmo dono do escritório).` };
}

/** Rotina do robô: escritórios do Contábil sem CNPJ → tenta descobrir. Só preenche o vazio. */
export async function preencherCnpjsDosEscritorios(consultar: Consultar, store: StoreEscritorio): Promise<{ semCnpj: number; preenchidos: number }> {
  const donos = await tentar(consultar, `SELECT u.id::text AS tenant FROM contabil_auth_users u WHERE u.global_admin=true AND u.disabled=false AND COALESCE(u.tenant_id::text, u.id::text)=u.id::text AND NOT EXISTS (SELECT 1 FROM contabil_escritorio_cnpj e WHERE e.tenant_id=u.id::text) LIMIT 500`, []);
  let preenchidos = 0;
  for (const d of donos || []) {
    const r = await descobrirCnpjDoEscritorio(consultar, String(d.tenant));
    if (r.cnpj) { await store.gravar(String(d.tenant), r.cnpj, r.origem!); preenchidos += 1; }
  }
  return { semCnpj: (donos || []).length, preenchidos };
}

export function registrarRotasEscritorioConsultor(app: Express, mw: { exigirSessao: RequestHandler; exigirOrigem: RequestHandler }, deps: { store: StoreEscritorio; sessao: (req: Request) => SessaoEscritorio | undefined; opcoes?: () => OpcoesConsultor }): void {
  app.get('/api/escritorio/cnpj', mw.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    try { res.json({ sucesso: true, cnpj: await deps.store.lerOuDescobrir(s.tenantId), podeEditar: s.podeEditar }); } catch { res.json({ sucesso: true, cnpj: null, podeEditar: s.podeEditar, indisponivel: true }); }
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
    try { cnpj = await deps.store.lerOuDescobrir(s.tenantId); } catch { cnpj = null; }
    const liberado = cnpj ? await consultorLiberado(cnpj, deps.opcoes?.() ?? {}).catch(() => false) : false;
    res.json({ sucesso: true, liberado, escritorio: cnpj, ...(liberado ? {} : { frase: FRASE_NAO_LIBERADO, semCnpjDoEscritorio: !cnpj || undefined }) });
  });
}
