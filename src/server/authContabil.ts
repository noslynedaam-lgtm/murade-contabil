import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Pool, type PoolClient } from "pg";
import { gerarRelatoriosContabeis, normalizarDataContabil } from "../utils/livrosContabeis";

const COOKIE = "murade_contabil_session";
const SESSION_SECONDS = 8 * 60 * 60;
let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;
let ultimaLimpezaSessao = 0;

export type SessaoContabil = { userId: string; login: string; cnpjs: string[]; memberships: Array<{ cnpj: string; role: 'admin' | 'operator' | 'viewer' }>; administrador: boolean; escritorioDe?: string; tenantId?: string; donoSistema?: boolean };

function obterBanco(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL não configurada no Contábil.");
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export function contabilAuthBancoConfigurado(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function verificarCnpjAutorizadoContabil(cnpj: string): Promise<boolean> {
  const normalizado = normalizarCnpjAcesso(cnpj);
  if (!cnpjContabilValido(normalizado)) return false;
  await prepararAuthContabil();
  const result = await obterBanco().query("SELECT 1 FROM contabil_auth_company_access WHERE cnpj=$1 LIMIT 1", [normalizado]);
  return Boolean(result.rowCount);
}

export async function prepararAuthContabil(): Promise<void> {
  if (!contabilAuthBancoConfigurado()) throw new Error("DATABASE_URL não configurada no Contábil.");
  schemaPromise ??= obterBanco().query(`
    CREATE TABLE IF NOT EXISTS contabil_auth_users (
      id uuid PRIMARY KEY,
      login text NOT NULL UNIQUE,
      password_salt text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      disabled boolean NOT NULL DEFAULT false,
      global_admin boolean NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS contabil_auth_company_access (
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id) ON DELETE CASCADE,
      cnpj text NOT NULL,
      role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator','viewer')),
      PRIMARY KEY (user_id, cnpj)
    );
    CREATE TABLE IF NOT EXISTS contabil_auth_sessions (
      token_hash char(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS contabil_auth_sessions_expiry_idx ON contabil_auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS contabil_auth_invites (
      token_hash char(64) PRIMARY KEY, login text NOT NULL, cnpjs text[] NOT NULL,
      role text NOT NULL CHECK (role IN ('admin','operator','viewer')),
      created_by uuid NOT NULL REFERENCES contabil_auth_users(id), expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contabil_company_workspaces (
      cnpj text PRIMARY KEY CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      payload jsonb NOT NULL,
      version bigint NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contabil_accounting_approval_audit (
      cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      referencia text NOT NULL,
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id),
      login text NOT NULL,
      valor numeric(14,2) NOT NULL CHECK (valor > 0),
      conta_debito text NOT NULL,
      conta_credito text NOT NULL,
      aprovado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cnpj, referencia)
    );
    CREATE TABLE IF NOT EXISTS contabil_manual_journal_audit (
      cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      lancamento_id text NOT NULL,
      evento text NOT NULL CHECK (evento IN ('lancamento_manual', 'estorno_manual')),
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id),
      login text NOT NULL,
      lancamento jsonb NOT NULL,
      registrado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cnpj, lancamento_id)
    );
    CREATE TABLE IF NOT EXISTS contabil_manual_journal_events (
      evento_id bigserial PRIMARY KEY,
      cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      lancamento_id text NOT NULL,
      evento text NOT NULL CHECK (evento IN ('lancamento_manual_pendente','lancamento_manual_aprovado','lancamento_manual_rejeitado','estorno_manual_pendente','estorno_manual_aprovado','estorno_manual_rejeitado','lancamento_manual','estorno_manual')),
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id),
      login text NOT NULL,
      lancamento jsonb NOT NULL,
      motivo text,
      registrado_em timestamptz NOT NULL DEFAULT now(),
      chave_legada text UNIQUE
    );
    CREATE TABLE IF NOT EXISTS contabil_opening_balance_audit (
      cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      conta_codigo text NOT NULL,
      evento text NOT NULL CHECK (evento IN ('saldo_inicial_cadastrado', 'saldo_inicial_alterado')),
      saldo_anterior numeric(16,2),
      saldo_novo numeric(16,2) NOT NULL,
      competencia text CHECK (competencia IS NULL OR competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id),
      login text NOT NULL,
      registrado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (cnpj, conta_codigo, registrado_em)
    );
    CREATE TABLE IF NOT EXISTS contabil_period_closures (
      cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      competencia text NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      user_id uuid NOT NULL REFERENCES contabil_auth_users(id),
      login text NOT NULL,
      fechado_em timestamptz NOT NULL DEFAULT now(),
      quantidade_lancamentos integer NOT NULL CHECK (quantidade_lancamentos >= 0),
      total_debitos numeric(16,2) NOT NULL CHECK (total_debitos >= 0),
      PRIMARY KEY (cnpj, competencia)
    );
  `).then(async () => {
    await obterBanco().query("ALTER TABLE contabil_auth_users ADD COLUMN IF NOT EXISTS global_admin boolean NOT NULL DEFAULT false");
    await obterBanco().query(`
      ALTER TABLE contabil_auth_users ADD COLUMN IF NOT EXISTS office_owner uuid REFERENCES contabil_auth_users(id) ON DELETE SET NULL;
      ALTER TABLE contabil_auth_invites ADD COLUMN IF NOT EXISTS office_owner uuid;
      ALTER TABLE contabil_auth_users ADD COLUMN IF NOT EXISTS tenant_id uuid;
      ALTER TABLE contabil_auth_users ADD COLUMN IF NOT EXISTS max_usuarios integer CHECK (max_usuarios IS NULL OR max_usuarios BETWEEN 1 AND 1000);
      ALTER TABLE contabil_auth_invites ADD COLUMN IF NOT EXISTS novo_escritorio boolean NOT NULL DEFAULT false;
      UPDATE contabil_auth_users SET tenant_id=id WHERE tenant_id IS NULL AND global_admin=true;
      UPDATE contabil_auth_users SET tenant_id=office_owner WHERE tenant_id IS NULL AND office_owner IS NOT NULL;
    `);
    await obterBanco().query("ALTER TABLE contabil_company_workspaces ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1");
    await obterBanco().query("ALTER TABLE contabil_opening_balance_audit ADD COLUMN IF NOT EXISTS competencia text");
    await obterBanco().query(`
      INSERT INTO contabil_manual_journal_events(cnpj,lancamento_id,evento,user_id,login,lancamento,registrado_em,chave_legada)
      SELECT cnpj,lancamento_id,evento,user_id,login,lancamento,registrado_em,
        concat(cnpj,':',lancamento_id,':',evento,':',registrado_em::text)
      FROM contabil_manual_journal_audit
      ON CONFLICT (chave_legada) DO NOTHING
    `);
    await obterBanco().query("DELETE FROM contabil_auth_sessions WHERE expires_at <= now()");
  }).then(() => undefined).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

export function normalizarCnpjAcesso(valor: unknown): string {
  return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function cnpjContabilValido(valor: unknown): boolean {
  const cnpj = normalizarCnpjAcesso(valor);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  const calcularDv = (base: string) => {
    let soma = 0;
    let peso = 2;
    for (let indice = base.length - 1; indice >= 0; indice -= 1) {
      soma += (base.charCodeAt(indice) - 48) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcularDv(cnpj.slice(0, 12));
  const segundo = calcularDv(`${cnpj.slice(0, 12)}${primeiro}`);
  return cnpj.slice(12) === `${primeiro}${segundo}`;
}

function senhaHash(senha: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(senha, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

function cookieDaRequisicao(req: Request): string {
  const item = (req.header("cookie") || "").split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith(`${COOKIE}=`));
  if (!item) return "";
  try { return decodeURIComponent(item.slice(COOKIE.length + 1)); } catch { return ""; }
}

function gravarCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Strict${secure}`);
}

function apagarCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`);
}

export async function obterSessaoContabil(req: Request): Promise<SessaoContabil | null> {
  const token = cookieDaRequisicao(req);
  if (!token || token.length > 128 || !contabilAuthBancoConfigurado()) return null;
  await prepararAuthContabil();
  if (Date.now() - ultimaLimpezaSessao > 60_000) {
    ultimaLimpezaSessao = Date.now();
    await obterBanco().query(`
      DELETE FROM contabil_auth_sessions
      WHERE token_hash IN (
        SELECT token_hash FROM contabil_auth_sessions WHERE expires_at <= now() LIMIT 100
      )
    `);
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await obterBanco().query(`
    SELECT u.id, u.login, u.global_admin, u.office_owner, u.tenant_id FROM contabil_auth_sessions s
    JOIN contabil_auth_users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled = false
  `, [tokenHash]);
  if (!user.rowCount) return null;
  return montarSessaoContabil(user.rows[0]);
}

async function ehDonoDoSistemaContabil(userId: string, login: string): Promise<boolean> {
  const lista = (process.env.MURADE_DONO_SISTEMA || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (lista.length) return lista.includes(login);
  const primeiro = await obterBanco().query("SELECT id FROM contabil_auth_users WHERE global_admin=true ORDER BY created_at, id LIMIT 1");
  return String(primeiro.rows[0]?.id) === String(userId);
}

/** Acesso efetivo: empresas próprias + (se for equipe do escritório) todas as empresas do dono do escritório. */
async function montarSessaoContabil(user: { id: string; login: string; global_admin: boolean; office_owner?: string | null; tenant_id?: string | null }): Promise<SessaoContabil> {
  const access = await obterBanco().query("SELECT cnpj,role FROM contabil_auth_company_access WHERE user_id = $1 ORDER BY cnpj", [user.id]);
  const porCnpj = new Map<string, 'admin' | 'operator' | 'viewer'>();
  let escritorioDe: string | undefined;
  if (user.office_owner && user.global_admin !== true) {
    const dono = await obterBanco().query("SELECT 1 FROM contabil_auth_users WHERE id=$1 AND disabled=false AND global_admin=true", [user.office_owner]);
    if (dono.rowCount) {
      escritorioDe = String(user.office_owner);
      const empresas = await obterBanco().query("SELECT cnpj FROM contabil_auth_company_access WHERE user_id=$1", [user.office_owner]);
      for (const row of empresas.rows) porCnpj.set(String(row.cnpj).trim(), "operator");
    }
  }
  for (const row of access.rows) porCnpj.set(String(row.cnpj).trim(), row.role as 'admin' | 'operator' | 'viewer');
  const memberships = [...porCnpj.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cnpj, role]) => ({ cnpj, role }));
  return {
    userId: user.id,
    login: user.login,
    cnpjs: memberships.map((item) => item.cnpj),
    memberships,
    administrador: user.global_admin === true,
    escritorioDe,
    tenantId: String(user.tenant_id || escritorioDe || user.id),
    donoSistema: user.global_admin === true && await ehDonoDoSistemaContabil(user.id, user.login),
  };
}

export async function exigirSessaoContabil(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessao = await obterSessaoContabil(req);
    if (!sessao) { res.status(401).json({ sucesso: false, motivo: "Entre para acessar os dados contábeis." }); return; }
    (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil = sessao;
    next();
  } catch (error) {
    console.error("Falha ao validar sessão do Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Autenticação indisponível: confira o PostgreSQL do Contábil." });
  }
}

export function sessaoDaRequisicaoContabil(req: Request): SessaoContabil | undefined {
  return (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
}

export async function statusAuthContabil(_req: Request, res: Response): Promise<void> {
  try {
    await prepararAuthContabil();
    const result = await obterBanco().query("SELECT count(*)::int AS total FROM contabil_auth_users");
    const primeiroAcesso = Number(result.rows[0]?.total) === 0 && Buffer.byteLength(process.env.CONTABIL_AUTH_BOOTSTRAP_TOKEN?.trim() || '', 'utf8') >= 32;
    res.setHeader("Cache-Control", "no-store");
    res.json({ disponivel: true, primeiroAcesso, configuracaoNecessaria: Number(result.rows[0]?.total) === 0 && !primeiroAcesso });
  } catch (error) {
    console.error("Falha ao consultar autenticação do Contábil:", error);
    res.status(503).json({ disponivel: false, motivo: "Não foi possível acessar o banco persistente do Contábil." });
  }
}

const falhasLogin = new Map<string, { count: number; until: number }>();

export async function bootstrapAuthContabil(req: Request, res: Response): Promise<void> {
  const esperado = process.env.CONTABIL_AUTH_BOOTSTRAP_TOKEN || "";
  const recebido = typeof req.body?.token === "string" ? req.body.token : "";
  const a = Buffer.from(esperado); const b = Buffer.from(recebido);
  if (a.length < 32 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(403).json({ sucesso: false, motivo: "Código temporário inválido. Configure um token aleatório com pelo menos 32 caracteres." }); return; }
  const login = String(req.body?.login || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  const cnpjs = Array.isArray(req.body?.cnpjs) ? [...new Set(req.body.cnpjs.map(normalizarCnpjAcesso))] : [];
  if (login.length < 3 || login.length > 80 || !/^[a-z0-9._@+-]+$/.test(login)) { res.status(400).json({ sucesso: false, motivo: "Informe um usuário válido." }); return; }
  if (senha.length < 12 || senha.length > 256) { res.status(400).json({ sucesso: false, motivo: "A senha precisa ter entre 12 e 256 caracteres." }); return; }
  if (!cnpjs.length || cnpjs.length > 500 || cnpjs.some((cnpj) => !cnpjContabilValido(cnpj))) { res.status(400).json({ sucesso: false, motivo: "Informe ao menos um CNPJ com formato e dígitos verificadores válidos." }); return; }
  try {
    await prepararAuthContabil();
    const client = await obterBanco().connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE contabil_auth_users IN EXCLUSIVE MODE");
      const total = await client.query("SELECT count(*)::int AS total FROM contabil_auth_users");
      if (Number(total.rows[0]?.total) !== 0) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "O primeiro acesso já foi configurado." }); return; }
      const id = crypto.randomUUID();
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = (await senhaHash(senha, salt)).toString("hex");
      await client.query("INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin) VALUES($1,$2,$3,$4,true)", [id, login, salt, hash]);
      for (const cnpj of cnpjs) await client.query("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'admin')", [id, cnpj]);
      await client.query("COMMIT");
      res.status(201).json({ sucesso: true, usuario: login, empresasAutorizadas: cnpjs.length, aviso: "Acesso criado. Remova CONTABIL_AUTH_BOOTSTRAP_TOKEN das variáveis do Render após entrar." });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) {
    console.error("Falha ao criar primeiro acesso do Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível concluir o primeiro acesso." });
  }
}

export async function loginAuthContabil(req: Request, res: Response): Promise<void> {
  const ip = req.ip || "unknown";
  const state = falhasLogin.get(ip);
  if (state && state.until > Date.now() && state.count >= 8) { res.status(429).json({ sucesso: false, motivo: "Muitas tentativas. Aguarde 15 minutos." }); return; }
  const login = String(req.body?.login || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  try {
    await prepararAuthContabil();
    const result = await obterBanco().query("SELECT id,login,password_salt,password_hash,global_admin,office_owner,tenant_id FROM contabil_auth_users WHERE login=$1 AND disabled=false", [login]);
    const row = result.rows[0];
    const salt = row?.password_salt || "murade-contabil-dummy-salt";
    const calculated = await senhaHash(senha.slice(0, 256), salt);
    const expected = Buffer.from(row?.password_hash || "0".repeat(128), "hex");
    const valid = Boolean(row) && calculated.length === expected.length && crypto.timingSafeEqual(calculated, expected);
    if (!valid) {
      const current = falhasLogin.get(ip);
      const next = current && current.until > Date.now() ? { count: current.count + 1, until: current.until } : { count: 1, until: Date.now() + 15 * 60_000 };
      falhasLogin.set(ip, next);
      res.status(401).json({ sucesso: false, motivo: "Usuário ou senha incorretos." }); return;
    }
    falhasLogin.delete(ip);
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await obterBanco().query("INSERT INTO contabil_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + ($3 * interval '1 second'))", [hash, row.id, SESSION_SECONDS]);
    gravarCookie(res, token);
    res.setHeader("Cache-Control", "no-store");
    const completa = await montarSessaoContabil(row);
    res.json({ sucesso: true, usuario: row.login, cnpjs: completa.cnpjs, memberships: completa.memberships, administrador: row.global_admin === true, escritorio: Boolean(completa.escritorioDe), donoSistema: completa.donoSistema === true });
  } catch (error) {
    console.error("Falha no login do Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Autenticação indisponível: confira o PostgreSQL do Contábil." });
  }
}

export async function sessaoAtualContabil(req: Request, res: Response): Promise<void> {
  try {
    const sessao = await obterSessaoContabil(req);
    res.setHeader("Cache-Control", "no-store");
    if (!sessao) { res.json({ autenticado: false }); return; }
    res.json({ autenticado: true, usuario: sessao.login, cnpjs: sessao.cnpjs, memberships: sessao.memberships, administrador: sessao.administrador, escritorio: Boolean(sessao.escritorioDe), donoSistema: sessao.donoSistema === true });
  } catch (error) {
    console.error("Falha ao consultar sessão do Contábil:", error);
    res.status(503).json({ autenticado: false, motivo: "Autenticação indisponível." });
  }
}

export async function adicionarEmpresaAcessoContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
  if (!sessao || (!sessao.administrador && !sessao.escritorioDe)) { res.status(403).json({ sucesso: false, motivo: "Somente o administrador ou a equipe do escritório pode cadastrar uma nova empresa." }); return; }
  if (!cnpjContabilValido(cnpj)) { res.status(400).json({ sucesso: false, motivo: "Informe um CNPJ com formato e dígitos verificadores válidos." }); return; }
  try {
    const outro = await obterBanco().query("SELECT 1 FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND u.tenant_id IS NOT NULL AND u.tenant_id<>$2 LIMIT 1", [cnpj, sessao.tenantId]);
    if (outro.rowCount) { res.status(409).json({ sucesso: false, motivo: "Este CNPJ já está cadastrado em outro escritório. Cada empresa pertence a um único escritório." }); return; }
    await obterBanco().query("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'admin') ON CONFLICT(user_id,cnpj) DO UPDATE SET role='admin'", [sessao.escritorioDe || sessao.userId, cnpj]);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ sucesso: true, cnpj, mensagem: "Empresa cadastrada no escritório. Toda a equipe passa a enxergá-la." });
  } catch (error) {
    console.error("Falha ao autorizar CNPJ no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível atualizar o acesso à empresa." });
  }
}

function usuarioPodeAdministrarCnpj(sessao: SessaoContabil, cnpj: string): boolean {
  return sessao.memberships.some((item) => item.cnpj === cnpj && item.role === 'admin');
}

export async function criarConviteUsuarioContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const login = String(req.body?.login || '').trim().toLowerCase();
  const role = req.body?.role === 'admin' || req.body?.role === 'viewer' ? req.body.role : 'operator';
  const cnpjs: string[] = Array.isArray(req.body?.cnpjs) ? [...new Set<string>(req.body.cnpjs.map((value: unknown) => normalizarCnpjAcesso(value)))] : [normalizarCnpjAcesso(req.body?.cnpj)];
  if (!sessao || login.length < 3 || login.length > 80 || !/^[a-z0-9._@+-]+$/.test(login)) { res.status(400).json({ sucesso: false, motivo: 'Informe um usuário válido.' }); return; }
  if (!cnpjs.length || cnpjs.length > 100 || cnpjs.some((cnpj) => !cnpjContabilValido(cnpj) || !usuarioPodeAdministrarCnpj(sessao, cnpj))) {
    res.status(403).json({ sucesso: false, motivo: 'Você precisa ser administrador de cada empresa escolhida.' }); return;
  }
  try {
    const existe = await obterBanco().query('SELECT 1 FROM contabil_auth_users WHERE login=$1', [login]);
    if (existe.rowCount) { res.status(409).json({ sucesso: false, motivo: 'Este usuário já existe. Não alteramos a senha existente; peça que ele entre e vincule a empresa com um administrador.' }); return; }
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await obterBanco().query("INSERT INTO contabil_auth_invites(token_hash,login,cnpjs,role,created_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours')", [tokenHash, login, cnpjs, role, sessao.userId]);
    res.setHeader('Cache-Control', 'no-store');
    const base = process.env.PUBLIC_APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const conviteUrl = new URL('/', base);
    conviteUrl.hash = new URLSearchParams({ convite: token, login }).toString();
    res.status(201).json({ sucesso: true, convite: token, conviteUrl: conviteUrl.toString(), login, cnpjs, expiraEmHoras: 24, mensagem: 'Convite de uso único. Envie o link em particular; a pessoa escolherá sua própria senha.' });
  } catch (error) { console.error('Falha ao criar convite no Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível criar o convite.' }); }
}

export async function vincularUsuarioExistenteContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.body?.cnpj); const login = String(req.body?.login || '').trim().toLowerCase();
  const role = req.body?.role === 'admin' || req.body?.role === 'viewer' ? req.body.role : 'operator';
  if (!sessao || !cnpjContabilValido(cnpj) || login.length < 3 || login.length > 80 || !/^[a-z0-9._@+-]+$/.test(login) || !usuarioPodeAdministrarCnpj(sessao, cnpj)) {
    res.status(403).json({ sucesso: false, motivo: 'Você precisa administrar esta empresa e informar usuário e CNPJ válidos.' }); return;
  }
  try {
    const user = await obterBanco().query('SELECT id FROM contabil_auth_users WHERE login=$1 AND disabled=false', [login]);
    if (!user.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Usuário não encontrado. Envie um convite para ele criar a conta e a própria senha.' }); return; }
    await obterBanco().query('INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,$3) ON CONFLICT(user_id,cnpj) DO UPDATE SET role=EXCLUDED.role', [user.rows[0].id, cnpj, role]);
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login, cnpj, role, senhaAlterada: false });
  } catch (error) { console.error('Falha ao vincular usuário existente no Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível atualizar o acesso do usuário.' }); }
}

export async function resgatarConviteUsuarioContabil(req: Request, res: Response): Promise<void> {
  const token = String(req.body?.convite || ''); const login = String(req.body?.login || '').trim().toLowerCase(); const senha = String(req.body?.senha || '');
  if (!token || token.length > 128 || login.length < 3 || login.length > 80 || !/^[a-z0-9._@+-]+$/.test(login) || senha.length < 12 || senha.length > 256) { res.status(400).json({ sucesso: false, motivo: 'Confira o convite, o usuário e a senha (mínimo 12 caracteres).' }); return; }
  let client: PoolClient | undefined;
  try {
    await prepararAuthContabil(); client = await obterBanco().connect(); await client.query('BEGIN');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const convite = await client.query('SELECT login,cnpjs,role,office_owner,novo_escritorio,created_by FROM contabil_auth_invites WHERE token_hash=$1 AND expires_at>now() FOR UPDATE', [tokenHash]);
    if (!convite.rowCount || convite.rows[0].login !== login) { await client.query('ROLLBACK'); res.status(400).json({ sucesso: false, motivo: 'Convite inválido, expirado ou destinado a outro usuário.' }); return; }
    const existente = await client.query('SELECT 1 FROM contabil_auth_users WHERE login=$1', [login]);
    if (existente.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ sucesso: false, motivo: 'Este usuário já está cadastrado.' }); return; }
    const id = crypto.randomUUID(); const salt = crypto.randomBytes(16).toString('hex'); const hash = (await senhaHash(senha, salt)).toString('hex');
    const cv = convite.rows[0]; let tenantId: string = id; const donoDoEscritorio = cv.novo_escritorio === true;
    if (!donoDoEscritorio) {
      if (cv.office_owner) tenantId = String(cv.office_owner);
      else { const criador = await client.query('SELECT tenant_id FROM contabil_auth_users WHERE id=$1', [cv.created_by]); tenantId = String(criador.rows[0]?.tenant_id || cv.created_by); }
    }
    await client.query('INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,office_owner,global_admin,tenant_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, login, salt, hash, cv.office_owner || null, donoDoEscritorio, tenantId]);
    for (const cnpj of convite.rows[0].cnpjs as string[]) await client.query('INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,$3)', [id, cnpj, convite.rows[0].role]);
    await client.query('DELETE FROM contabil_auth_invites WHERE token_hash=$1', [tokenHash]); await client.query('COMMIT');
    res.status(201).json({ sucesso: true, usuario: login, cnpjs: convite.rows[0].cnpjs });
  } catch (error) { await client?.query('ROLLBACK').catch(() => undefined); console.error('Falha ao ativar convite no Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível ativar esta conta.' }); }
  finally { client?.release(); }
}

export async function listarUsuariosEmpresaContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const cnpj = normalizarCnpjAcesso(req.query.cnpj);
  if (!sessao || !cnpjContabilValido(cnpj) || !usuarioPodeAdministrarCnpj(sessao, cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Somente um administrador desta empresa pode consultar os acessos.' }); return; }
  try {
    const result = await obterBanco().query('SELECT u.login,a.role FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND u.disabled=false ORDER BY u.login', [cnpj]);
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, cnpj, usuarios: result.rows });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível consultar os usuários.' }); }
}

export async function revogarUsuarioEmpresaContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const cnpj = normalizarCnpjAcesso(req.query.cnpj); const login = String(req.params.login || '').trim().toLowerCase();
  if (!sessao || !cnpjContabilValido(cnpj) || !usuarioPodeAdministrarCnpj(sessao, cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Somente um administrador desta empresa pode revogar acessos.' }); return; }
  try {
    const result = await obterBanco().query("DELETE FROM contabil_auth_company_access a USING contabil_auth_users u WHERE a.user_id=u.id AND u.login=$1 AND a.cnpj=$2 AND u.global_admin=false RETURNING a.user_id", [login, cnpj]);
    if (!result.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Usuário ou acesso não encontrado; a conta administradora principal não pode ser removida daqui.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, cnpj, usuario: login, dadosPreservados: true });
  } catch (error) { console.error('Falha ao revogar acesso no Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível revogar o acesso.' }); }
}

export async function removerEmpresaAcessoContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  let client: PoolClient | undefined;
  try {
    client = await obterBanco().connect();
    await client.query("BEGIN");
    await client.query("DELETE FROM contabil_auth_company_access WHERE user_id=$1 AND cnpj=$2", [sessao.userId, cnpj]);
    await client.query("COMMIT");
    res.setHeader("Cache-Control", "no-store");
    res.json({ sucesso: true, cnpj, dadosPreservados: true });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao revogar acesso da empresa no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível remover o acesso da empresa." });
  } finally { client?.release(); }
}

function loginValidoContabil(login: string): boolean { return login.length >= 3 && login.length <= 80 && /^[a-z0-9._@+-]+$/.test(login); }
function hashTokenContabil(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }

// ---- Equipe do escritório: vê todas as empresas do escritório (inclusive as futuras) ----
export async function listarEquipeContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  if (!sessao?.administrador) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório consulta a equipe.' }); return; }
  try {
    const r = await obterBanco().query('SELECT login FROM contabil_auth_users WHERE office_owner=$1 AND disabled=false ORDER BY login', [sessao.userId]);
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, equipe: r.rows.map((row) => row.login) });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível listar a equipe.' }); }
}

// Limite de usuários contratado pelo escritório (dono + equipe). Sem limite definido, não bloqueia.
async function limiteEquipeAtingidoContabil(donoId: string): Promise<string | null> {
  const r = await obterBanco().query(`SELECT o.max_usuarios,
    (SELECT count(*)::int FROM contabil_auth_users t WHERE t.tenant_id=o.id AND t.id<>o.id AND t.disabled=false)
    + (SELECT count(*)::int FROM contabil_auth_invites i WHERE i.office_owner=o.id AND i.expires_at>now()) AS equipe
    FROM contabil_auth_users o WHERE o.id=$1`, [donoId]);
  const linha = r.rows[0]; if (!linha || linha.max_usuarios == null) return null;
  const usados = 1 + Number(linha.equipe);
  return usados >= Number(linha.max_usuarios) ? `O plano deste escritório permite ${linha.max_usuarios} usuário(s) (dono incluso) e todos já estão em uso. Fale com o fornecedor para ampliar.` : null;
}

export async function definirLimiteEscritorioContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.params.login || '').trim().toLowerCase();
  const bruto = req.body?.limite; const limite = bruto === null ? null : Number(bruto);
  if (!sessao?.donoSistema) { res.status(403).json({ sucesso: false, motivo: 'Somente o dono do sistema define o limite de usuários.' }); return; }
  if (limite !== null && (!Number.isInteger(limite) || limite < 1 || limite > 1000)) { res.status(400).json({ sucesso: false, motivo: 'Informe um limite de 1 a 1000 usuários (ou vazio para sem limite).' }); return; }
  try {
    const r = await obterBanco().query('UPDATE contabil_auth_users SET max_usuarios=$1 WHERE login=$2 AND global_admin=true AND tenant_id=id AND id<>$3 RETURNING login', [limite, login, sessao.userId]);
    if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Escritório não encontrado.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login, limite });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível definir o limite.' }); }
}

export async function convidarEquipeContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.body?.login || '').trim().toLowerCase();
  if (!sessao?.administrador) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório convida a equipe.' }); return; }
  try { const cheio = await limiteEquipeAtingidoContabil(sessao.userId); if (cheio) { res.status(409).json({ sucesso: false, motivo: cheio }); return; } } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível conferir o limite de usuários.' }); return; }
  if (!loginValidoContabil(login)) { res.status(400).json({ sucesso: false, motivo: 'Informe um nome de usuário válido.' }); return; }
  try {
    const exists = await obterBanco().query('SELECT 1 FROM contabil_auth_users WHERE login=$1', [login]);
    if (exists.rowCount) { res.status(409).json({ sucesso: false, motivo: 'Este usuário já existe. Use "Adicionar conta existente à equipe".' }); return; }
    const token = crypto.randomBytes(32).toString('base64url');
    await obterBanco().query("INSERT INTO contabil_auth_invites(token_hash,login,cnpjs,role,created_by,expires_at,office_owner) VALUES($1,$2,'{}','operator',$3,now()+interval '24 hours',$3)", [hashTokenContabil(token), login, sessao.userId]);
    const base = process.env.PUBLIC_APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const conviteUrl = new URL('/', base); conviteUrl.hash = new URLSearchParams({ convite: token, login }).toString();
    res.setHeader('Cache-Control', 'no-store'); res.status(201).json({ sucesso: true, conviteUrl: conviteUrl.toString(), login, expiraEmHoras: 24 });
  } catch (error) { console.error('Falha ao convidar equipe Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível criar o convite da equipe.' }); }
}

export async function adicionarEquipeContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.body?.login || '').trim().toLowerCase();
  if (!sessao?.administrador) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório altera a equipe.' }); return; }
  try { const cheio = await limiteEquipeAtingidoContabil(sessao.userId); if (cheio) { res.status(409).json({ sucesso: false, motivo: cheio }); return; } } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível conferir o limite de usuários.' }); return; }
  try {
    const r = await obterBanco().query('UPDATE contabil_auth_users SET office_owner=$1, tenant_id=$1 WHERE login=$2 AND disabled=false AND global_admin=false AND office_owner IS NULL AND (tenant_id IS NULL OR tenant_id=$1) RETURNING login', [sessao.userId, login]);
    if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Usuário não encontrado, já pertence a outro escritório ou é administrador. Gere um convite para ele criar a conta.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível adicionar à equipe.' }); }
}

export async function removerEquipeContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.params.login || '').trim().toLowerCase();
  if (!sessao?.administrador) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório altera a equipe.' }); return; }
  try {
    const r = await obterBanco().query('UPDATE contabil_auth_users SET office_owner=NULL WHERE login=$1 AND office_owner=$2 RETURNING login', [login, sessao.userId]);
    if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Esse usuário não é da sua equipe.' }); return; }
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login, dadosPreservados: true });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível remover da equipe.' }); }
}


// ---- Dono do sistema: contrata/bloqueia escritórios, sem acesso às empresas deles ----
export async function convidarEscritorioContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.body?.login || '').trim().toLowerCase();
  if (!sessao?.donoSistema) { res.status(403).json({ sucesso: false, motivo: 'Somente o dono do sistema convida novos escritórios.' }); return; }
  if (!loginValidoContabil(login)) { res.status(400).json({ sucesso: false, motivo: 'Informe um nome de usuário válido.' }); return; }
  try {
    const exists = await obterBanco().query('SELECT 1 FROM contabil_auth_users WHERE login=$1', [login]);
    if (exists.rowCount) { res.status(409).json({ sucesso: false, motivo: 'Este usuário já existe.' }); return; }
    const token = crypto.randomBytes(32).toString('base64url');
    await obterBanco().query("INSERT INTO contabil_auth_invites(token_hash,login,cnpjs,role,created_by,expires_at,novo_escritorio) VALUES($1,$2,'{}','admin',$3,now()+interval '24 hours',true)", [hashTokenContabil(token), login, sessao.userId]);
    const base = process.env.PUBLIC_APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const conviteUrl = new URL('/', base); conviteUrl.hash = new URLSearchParams({ convite: token, login }).toString();
    res.setHeader('Cache-Control', 'no-store'); res.status(201).json({ sucesso: true, conviteUrl: conviteUrl.toString(), login, expiraEmHoras: 24 });
  } catch (error) { console.error('Falha ao convidar escritório Contábil:', error); res.status(503).json({ sucesso: false, motivo: 'Não foi possível criar o convite do escritório.' }); }
}

export async function listarEscritoriosContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  if (!sessao?.donoSistema) { res.status(403).json({ sucesso: false, motivo: 'Somente o dono do sistema consulta os escritórios.' }); return; }
  try {
    // Só dados de contratação: usuário, situação e quantidades. Nunca nomes de empresas nem documentos.
    const r = await obterBanco().query(`SELECT u.login, u.disabled, u.created_at, u.max_usuarios,
      (SELECT count(*)::int FROM contabil_auth_company_access a WHERE a.user_id=u.id) AS empresas,
      (SELECT count(*)::int FROM contabil_auth_users t WHERE t.tenant_id=u.id AND t.id<>u.id) AS usuarios
      FROM contabil_auth_users u WHERE u.global_admin=true AND u.tenant_id=u.id AND u.id<>$1 ORDER BY u.created_at`, [sessao.userId]);
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, escritorios: r.rows });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível listar os escritórios.' }); }
}

export async function bloquearEscritorioContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil; const login = String(req.params.login || '').trim().toLowerCase(); const bloquear = req.body?.bloqueado === true;
  if (!sessao?.donoSistema) { res.status(403).json({ sucesso: false, motivo: 'Somente o dono do sistema bloqueia escritórios.' }); return; }
  try {
    const alvo = await obterBanco().query('SELECT id FROM contabil_auth_users WHERE login=$1 AND global_admin=true AND tenant_id=id AND id<>$2', [login, sessao.userId]);
    if (!alvo.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Escritório não encontrado.' }); return; }
    const tenant = alvo.rows[0].id;
    await obterBanco().query('UPDATE contabil_auth_users SET disabled=$1 WHERE tenant_id=$2', [bloquear, tenant]);
    if (bloquear) await obterBanco().query('DELETE FROM contabil_auth_sessions WHERE user_id IN (SELECT id FROM contabil_auth_users WHERE tenant_id=$1)', [tenant]);
    res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login, bloqueado: bloquear, dadosPreservados: true });
  } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível alterar o bloqueio.' }); }
}

const CAMPOS_WORKSPACE = new Set(["empresa", "contas", "centrosCusto", "mapeamentosOrigem", "preLancamentos", "lancamentos", "livros", "lembretes", "bensImobilizado"]);
const ORIGENS_MAPEAVEIS = new Set(["fiscal_entrada", "fiscal_saida", "dp_folha_bruta", "dp_descontos_inss", "dp_inss_patronal", "dp_descontos_irrf", "dp_fgts"]);
const ORIGENS_PRELANCAMENTO = new Set(["DP — Folha", "DP — INSS", "DP — INSS patronal", "DP — IRRF", "DP — FGTS", "Fiscal — Entrada", "Fiscal — Saída"]);
const CHAVES_CERTIFICADO_INFORMATIVAS = new Set([
  "certificadoativo", "certificadonomearquivo", "certificadovalidade", "certificadotipo",
  "certificadoemissor", "certificadotamanho", "certificadodataupload",
]);

function chaveContemSegredo(chave: string): boolean {
  const normalizada = chave.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (CHAVES_CERTIFICADO_INFORMATIVAS.has(normalizada)) return false;
  return /(senha|password|secret|token|apikey|authorization|privatekey|chaveprivada|certificado|certificate|pkcs12|pfxdata|base64)/i.test(normalizada);
}

function workspaceValido(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !CAMPOS_WORKSPACE.has(key))) return false;
  const arrays = ["contas", "centrosCusto", "lancamentos", "livros", "lembretes"];
  if (arrays.some((key) => !Array.isArray(payload[key]) || (payload[key] as unknown[]).length > 20000)) return false;
  if (payload.bensImobilizado !== undefined) {
    if (!Array.isArray(payload.bensImobilizado) || payload.bensImobilizado.length > 5000) return false;
    const camposBem = ["id", "descricao", "filial", "custoCentavos", "residualCentavos", "vidaUtilMeses", "inicioDepreciacao", "depreciavel", "baixa", "transferencias"];
    const idsBens = new Set<string>();
    for (const item of payload.bensImobilizado) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const bem = item as Record<string, unknown>;
      if (Object.keys(bem).some((key) => !camposBem.includes(key))) return false;
      if (typeof bem.id !== "string" || !bem.id || bem.id.length > 64 || idsBens.has(bem.id)) return false;
      if (typeof bem.descricao !== "string" || bem.descricao.length > 240) return false;
      if (bem.filial !== undefined && (typeof bem.filial !== "string" || bem.filial.length > 120)) return false;
      if (!Number.isSafeInteger(bem.custoCentavos) || (bem.custoCentavos as number) <= 0 || !Number.isSafeInteger(bem.residualCentavos) || (bem.residualCentavos as number) < 0) return false;
      if (!Number.isInteger(bem.vidaUtilMeses) || (bem.vidaUtilMeses as number) < 0 || (bem.vidaUtilMeses as number) > 1200) return false;
      if (typeof bem.inicioDepreciacao !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(bem.inicioDepreciacao) || typeof bem.depreciavel !== "boolean") return false;
      if (bem.baixa !== undefined) {
        const b = bem.baixa as Record<string, unknown>;
        if (!b || typeof b !== "object" || typeof b.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.competencia) || !Number.isSafeInteger(b.valorVendaCentavos) || (b.valorVendaCentavos as number) < 0 || !["venda", "baixa"].includes(String(b.motivo))) return false;
      }
      if (bem.transferencias !== undefined && (!Array.isArray(bem.transferencias) || bem.transferencias.length > 200 || bem.transferencias.some((t) => !t || typeof t !== "object" || typeof (t as any).competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test((t as any).competencia) || typeof (t as any).para !== "string" || (t as any).para.length > 120))) return false;
      idsBens.add(bem.id);
    }
  }
  if (payload.mapeamentosOrigem !== undefined) {
    if (!Array.isArray(payload.mapeamentosOrigem) || payload.mapeamentosOrigem.length > ORIGENS_MAPEAVEIS.size) return false;
    const contasAnaliticas = new Set((payload.contas as Array<Record<string, unknown>>).filter((conta) => conta && conta.tipo === "analitica" && typeof conta.codigo === "string").map((conta) => conta.codigo as string));
    const origensVistas = new Set<string>();
    for (const item of payload.mapeamentosOrigem) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const mapping = item as Record<string, unknown>;
      if (Object.keys(mapping).some((key) => !["origem", "contaDebitoCodigo", "contaCreditoCodigo", "revisadoEm"].includes(key))) return false;
      if (typeof mapping.origem !== "string" || !ORIGENS_MAPEAVEIS.has(mapping.origem) || origensVistas.has(mapping.origem)) return false;
      if (typeof mapping.contaDebitoCodigo !== "string" || mapping.contaDebitoCodigo.length > 64 || typeof mapping.contaCreditoCodigo !== "string" || mapping.contaCreditoCodigo.length > 64 || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)) return false;
      if (typeof mapping.revisadoEm !== "string" || !Number.isFinite(Date.parse(mapping.revisadoEm))) return false;
      origensVistas.add(mapping.origem);
    }
  }
  if (payload.preLancamentos !== undefined) {
    if (!Array.isArray(payload.preLancamentos) || payload.preLancamentos.length > 20000) return false;
    const contasAnaliticas = new Set((payload.contas as Array<Record<string, unknown>>).filter((conta) => conta && conta.tipo === "analitica" && typeof conta.codigo === "string").map((conta) => conta.codigo as string));
    const referencias = new Set<string>();
    for (const item of payload.preLancamentos) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const lancamento = item as Record<string, unknown>;
      const camposPermitidos = ["id", "referenciaOrigem", "competencia", "data", "origem", "contaDebitoCodigo", "contaCreditoCodigo", "valor", "historico", "status", "criadoEm", "contabilizadoEm", "geradoAutomaticamente"];
      if (Object.keys(lancamento).some((key) => !camposPermitidos.includes(key))) return false;
      const referencia = typeof lancamento.referenciaOrigem === "string" ? lancamento.referenciaOrigem : "";
      const referenciaDP = /^DP:[A-Z0-9]{12}\d{2}:\d{4}-(0[1-9]|1[0-2]):(folhaBruta|descontosINSS|inssPatronal|descontosIRRF|fgts)$/.test(referencia);
      const referenciaFiscal = /^FISCAL:[A-Z0-9]{12}\d{2}:\d{4}-(0[1-9]|1[0-2]):(Entrada|Saida):[A-Za-z0-9:_-]{1,128}$/.test(referencia);
      if ((!referenciaDP && !referenciaFiscal) || referencias.has(referencia) || lancamento.id !== referencia) return false;
      if (typeof lancamento.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(lancamento.competencia) || !referencia.includes(`:${lancamento.competencia}:`)) return false;
      if (typeof lancamento.data !== "string" || (referenciaDP && lancamento.data !== `${lancamento.competencia}-01`) || (referenciaFiscal && (!/^\d{4}-\d{2}-\d{2}$/.test(lancamento.data) || lancamento.data.slice(0, 7) !== lancamento.competencia))) return false;
      if (typeof lancamento.origem !== "string" || !ORIGENS_PRELANCAMENTO.has(lancamento.origem)) return false;
      const campoOrigem = referenciaDP ? referencia.slice(referencia.lastIndexOf(":") + 1) : referencia.split(":")[3];
      const origemEsperada = referenciaFiscal
        ? campoOrigem === "Entrada" ? "Fiscal — Entrada" : campoOrigem === "Saida" ? "Fiscal — Saída" : ""
        : campoOrigem === "folhaBruta" ? "DP — Folha" : campoOrigem === "descontosINSS" ? "DP — INSS" : campoOrigem === "inssPatronal" ? "DP — INSS patronal" : campoOrigem === "descontosIRRF" ? "DP — IRRF" : "DP — FGTS";
      if (!origemEsperada || lancamento.origem !== origemEsperada) return false;
      if (typeof lancamento.contaDebitoCodigo !== "string" || typeof lancamento.contaCreditoCodigo !== "string" || lancamento.contaDebitoCodigo === lancamento.contaCreditoCodigo || !contasAnaliticas.has(lancamento.contaDebitoCodigo) || !contasAnaliticas.has(lancamento.contaCreditoCodigo)) return false;
      if (typeof lancamento.valor !== "number" || !Number.isFinite(lancamento.valor) || lancamento.valor <= 0 || lancamento.valor > 999999999999) return false;
      if (typeof lancamento.historico !== "string" || lancamento.historico.length > 240 || !["pendente_conferencia", "contabilizado"].includes(String(lancamento.status))) return false;
      if (typeof lancamento.criadoEm !== "string" || !Number.isFinite(Date.parse(lancamento.criadoEm))) return false;
      if (lancamento.geradoAutomaticamente !== undefined && lancamento.geradoAutomaticamente !== true) return false;
      if (lancamento.status === "contabilizado" && (typeof lancamento.contabilizadoEm !== "string" || !Number.isFinite(Date.parse(lancamento.contabilizadoEm)))) return false;
      if (lancamento.status === "pendente_conferencia" && lancamento.contabilizadoEm !== undefined) return false;
      referencias.add(referencia);
    }
    const lancamentos = payload.lancamentos as Array<Record<string, unknown>>;
    const lancamentosPorReferencia = new Map(lancamentos.filter((item) => item && typeof item === "object" && typeof item.documentoRef === "string").map((item) => [String(item.documentoRef), item]));
    for (const item of payload.preLancamentos as Array<Record<string, unknown>>) {
      const referencia = String(item.referenciaOrigem);
      const lancamento = lancamentosPorReferencia.get(referencia);
      if (item.status === "contabilizado" && (!lancamento || lancamento.id !== referencia || lancamento.valor !== item.valor || lancamento.data !== item.data || lancamento.competencia !== item.competencia || lancamento.contaDebitoCodigo !== item.contaDebitoCodigo || lancamento.contaCreditoCodigo !== item.contaCreditoCodigo || lancamento.origem !== item.origem)) return false;
      if (item.status === "pendente_conferencia" && lancamento) return false;
    }
  }
  if (payload.empresa !== undefined && (!payload.empresa || typeof payload.empresa !== "object" || Array.isArray(payload.empresa))) return false;
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > 4_000_000) return false;
  const inspect = (item: unknown, depth = 0): boolean => {
    if (depth > 20) return false;
    if (Array.isArray(item)) return item.every((child) => inspect(child, depth + 1));
    if (item && typeof item === "object") return Object.entries(item).every(([key, child]) => !chaveContemSegredo(key) && inspect(child, depth + 1));
    return true;
  };
  return inspect(payload);
}

function jsonCanonico(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonCanonico).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${jsonCanonico(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function referenciaIntegrada(value: unknown): boolean {
  const referencia = String(value || "");
  return referencia.startsWith("DP:") || referencia.startsWith("FISCAL:");
}

function competenciaLancamento(item: Record<string, unknown>): string {
  const competencia = String(item.competencia || "");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return competencia;
  return normalizarDataContabil(String(item.data || ""))?.slice(0, 7) || "";
}

function dadosCompetencia(payload: Record<string, unknown>, competencia: string): Record<string, unknown> {
  const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos as Array<Record<string, unknown>> : [];
  const preLancamentos = Array.isArray(payload.preLancamentos) ? payload.preLancamentos as Array<Record<string, unknown>> : [];
  const livros = Array.isArray(payload.livros) ? payload.livros as Array<Record<string, unknown>> : [];
  return {
    lancamentos: lancamentos.filter((item) => competenciaLancamento(item) === competencia),
    preLancamentos: preLancamentos.filter((item) => String(item.competencia || "") === competencia),
    livros: livros.filter((item) => String(item.competencia || "") === competencia),
  };
}

function planoContasCompatívelComFechamentos(atual: unknown, proximo: unknown): boolean {
  if (!Array.isArray(atual) || !Array.isArray(proximo)) return false;
  const atuais = new Map(atual.map((item) => [String((item as Record<string, unknown>)?.codigo || ""), item]));
  const novos = new Map(proximo.map((item) => [String((item as Record<string, unknown>)?.codigo || ""), item]));
  for (const [codigo, conta] of atuais) {
    if (!novos.has(codigo) || jsonCanonico(conta) !== jsonCanonico(novos.get(codigo))) return false;
  }
  for (const [codigo, conta] of novos) {
    if (atuais.has(codigo)) continue;
    const dadosConta = conta as Record<string, unknown>;
    const saldo = Number(dadosConta?.saldoInicial ?? 0);
    if (!Number.isFinite(saldo) || saldo !== 0) return false;
    if (Array.from(atuais.keys()).some((existente) => existente.startsWith(`${codigo}.`))) return false;
  }
  return true;
}

function alteracaoIntegradaPermitida(atual: Record<string, unknown>, proximo: Record<string, unknown>, permitirNovosRascunhosServidor: boolean): boolean {
  const antigosRascunhos = new Map((Array.isArray(atual.preLancamentos) ? atual.preLancamentos : [])
    .filter((item: any) => referenciaIntegrada(item?.referenciaOrigem)).map((item: any) => [String(item.referenciaOrigem), item]));
  const novosRascunhos = new Map((Array.isArray(proximo.preLancamentos) ? proximo.preLancamentos : [])
    .filter((item: any) => referenciaIntegrada(item?.referenciaOrigem)).map((item: any) => [String(item.referenciaOrigem), item]));
  for (const [referencia, antigo] of antigosRascunhos) {
    const novo = novosRascunhos.get(referencia);
    if (!novo) return false;
    if ((antigo as any).status === "contabilizado" && jsonCanonico(antigo) !== jsonCanonico(novo)) return false;
    if ((antigo as any).status === "pendente_conferencia" && !permitirNovosRascunhosServidor && jsonCanonico(antigo) !== jsonCanonico(novo)) return false;
    if ((novo as any).status === "contabilizado" && (antigo as any).status !== "contabilizado") return false;
  }
  for (const [referencia, novo] of novosRascunhos) {
    if (!antigosRascunhos.has(referencia) && (!permitirNovosRascunhosServidor || (novo as any).status !== "pendente_conferencia" || (novo as any).geradoAutomaticamente !== true)) return false;
  }

  const antigosLancamentos = new Map((Array.isArray(atual.lancamentos) ? atual.lancamentos : [])
    .filter((item: any) => referenciaIntegrada(item?.documentoRef) || referenciaIntegrada(item?.id))
    .map((item: any) => [String(item.documentoRef || item.id), item]));
  const novosLancamentos = new Map((Array.isArray(proximo.lancamentos) ? proximo.lancamentos : [])
    .filter((item: any) => referenciaIntegrada(item?.documentoRef) || referenciaIntegrada(item?.id))
    .map((item: any) => [String(item.documentoRef || item.id), item]));
  for (const [referencia, antigo] of antigosLancamentos) {
    const novo = novosLancamentos.get(referencia);
    if (!novo || jsonCanonico(antigo) !== jsonCanonico(novo)) return false;
  }
  for (const referencia of novosLancamentos.keys()) if (!antigosLancamentos.has(referencia)) return false;
  return true;
}

export type RascunhoAutomaticoContabil = {
  id: string;
  referenciaOrigem: string;
  competencia: string;
  data: string;
  origem: string;
  contaDebitoCodigo: string;
  contaCreditoCodigo: string;
  valor: number;
  historico: string;
  criadoEm: string;
};

/** Applies the accountant's explicit approval on the server after revalidating current source data. */
export async function contabilizarRascunhosAutomaticosContabil(
  req: Request,
  res: Response,
  candidatosAtuais: RascunhoAutomaticoContabil[],
  referenciasSolicitadas: unknown,
): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  if (!sessao.administrador && sessao.memberships.find((item) => item.cnpj === cnpj)?.role === "viewer") { res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." }); return; }
  if (!Array.isArray(referenciasSolicitadas) || referenciasSolicitadas.length < 1 || referenciasSolicitadas.length > 500
    || referenciasSolicitadas.some((item) => typeof item !== "string" || !item.startsWith(`DP:${cnpj}:`) && !item.startsWith(`FISCAL:${cnpj}:`))) {
    res.status(400).json({ sucesso: false, motivo: "Informe de 1 a 500 referências válidas desta empresa para aprovação." }); return;
  }
  const referencias = [...new Set(referenciasSolicitadas as string[])];
  if (referencias.length !== referenciasSolicitadas.length) { res.status(400).json({ sucesso: false, motivo: "A lista contém referências duplicadas." }); return; }

  let client: PoolClient | undefined;
  try {
    await prepararAuthContabil();
    client = await obterBanco().connect();
    await client.query("BEGIN");
    const selecionado = await client.query("SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE", [cnpj]);
    if (!selecionado.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ sucesso: false, motivo: "Workspace da empresa não encontrado." }); return; }
    const fechamento = await client.query("SELECT 1 FROM contabil_period_closures WHERE cnpj=$1 AND competencia=ANY($2::text[]) LIMIT 1", [cnpj, referencias.map((referencia) => referencia.split(":")[2]).filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item))]);
    if (fechamento.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "Há referência de competência fechada. Nenhum rascunho foi contabilizado." }); return; }
    const payload = selecionado.rows[0].payload as Record<string, any>;
    const rascunhos = Array.isArray(payload.preLancamentos) ? [...payload.preLancamentos] : [];
    const lancamentos = Array.isArray(payload.lancamentos) ? [...payload.lancamentos] : [];
    const contas = Array.isArray(payload.contas) ? payload.contas : [];
    const mapas = Array.isArray(payload.mapeamentosOrigem) ? payload.mapeamentosOrigem : [];
    const porReferenciaCandidato = new Map(candidatosAtuais.map((item) => [item.referenciaOrigem, item]));
    const agora = new Date().toISOString();
    const aprovacoes: Array<{ referencia: string; valor: number; debito: string; credito: string; origem: string; data: string; competencia: string; historico: string }> = [];

    for (const referencia of referencias) {
      const indice = rascunhos.findIndex((item: any) => item.referenciaOrigem === referencia);
      const rascunho = indice < 0 ? null : rascunhos[indice];
      const candidato = porReferenciaCandidato.get(referencia);
      if (!rascunho || rascunho.status !== "pendente_conferencia" || rascunho.geradoAutomaticamente !== true || !candidato) {
        throw Object.assign(new Error("Um ou mais rascunhos já não atendem às regras atuais. Atualize os dados e revise novamente."), { status: 409 });
      }
      const origemMapeamento: Record<string, string> = {
        "Fiscal — Entrada": "fiscal_entrada", "Fiscal — Saída": "fiscal_saida",
        "DP — Folha": "dp_folha_bruta", "DP — INSS": "dp_descontos_inss",
        "DP — INSS patronal": "dp_inss_patronal",
        "DP — IRRF": "dp_descontos_irrf", "DP — FGTS": "dp_fgts",
      };
      const mapping = mapas.find((item: any) => item.origem === origemMapeamento[rascunho.origem]);
      const analiticas = new Set(contas.filter((item: any) => item?.tipo === "analitica").map((item: any) => String(item.codigo)));
      const confereAtual = rascunho.referenciaOrigem === candidato.referenciaOrigem
        && rascunho.competencia === candidato.competencia && rascunho.data === candidato.data
        && rascunho.origem === candidato.origem && rascunho.contaDebitoCodigo === candidato.contaDebitoCodigo
        && rascunho.contaCreditoCodigo === candidato.contaCreditoCodigo && rascunho.valor === candidato.valor
        && mapping?.contaDebitoCodigo === candidato.contaDebitoCodigo && mapping?.contaCreditoCodigo === candidato.contaCreditoCodigo
        && analiticas.has(candidato.contaDebitoCodigo) && analiticas.has(candidato.contaCreditoCodigo)
        && Number.isFinite(candidato.valor) && candidato.valor > 0 && !lancamentos.some((item: any) => item.documentoRef === referencia || item.id === referencia);
      if (!confereAtual) throw Object.assign(new Error("Os dados de origem, o valor ou o mapeamento mudaram. Atualize e confira o rascunho antes de aprovar."), { status: 409 });
      const contaNome = (codigo: string) => String(contas.find((item: any) => String(item.codigo) === codigo)?.descricao || "Conta sem descrição");
      lancamentos.push({
        id: referencia, data: candidato.data, competencia: candidato.competencia,
        contaDebitoCodigo: candidato.contaDebitoCodigo, contaDebitoNome: contaNome(candidato.contaDebitoCodigo),
        contaCreditoCodigo: candidato.contaCreditoCodigo, contaCreditoNome: contaNome(candidato.contaCreditoCodigo),
        valor: candidato.valor, historico: candidato.historico.replace("pré-lançamento para conferência", "aprovado pelo contador"),
        origem: candidato.origem, documentoRef: referencia,
      });
      rascunhos[indice] = { ...rascunho, status: "contabilizado", contabilizadoEm: agora };
      aprovacoes.push({ referencia, valor: candidato.valor, debito: candidato.contaDebitoCodigo, credito: candidato.contaCreditoCodigo, origem: candidato.origem, data: candidato.data, competencia: candidato.competencia, historico: candidato.historico });
    }

    const novoPayload = { ...payload, lancamentos, preLancamentos: rascunhos };
    if (!workspaceValido(novoPayload)) throw new Error("O workspace resultante não passou na validação; nada foi contabilizado.");
    const atualizado = await client.query("UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1 RETURNING updated_at,version", [cnpj, JSON.stringify(novoPayload)]);
    for (const item of aprovacoes) {
      await client.query("INSERT INTO contabil_accounting_approval_audit(cnpj,referencia,user_id,login,valor,conta_debito,conta_credito,aprovado_em) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [cnpj, item.referencia, sessao.userId, sessao.login, item.valor, item.debito, item.credito, agora]);
    }
    await client.query("COMMIT");
    res.setHeader("Cache-Control", "no-store");
    res.json({ sucesso: true, persistencia: "postgresql", cnpj, contabilizados: aprovacoes.length, aprovadosPor: sessao.login, aprovadoEm: agora, atualizadoEm: new Date(atualizado.rows[0].updated_at).toISOString(), versao: Number(atualizado.rows[0].version), dados: novoPayload });
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha na aprovação server-side dos rascunhos contábeis:", error);
    res.status(error?.status || 503).json({ sucesso: false, motivo: error?.status ? error.message : "Não foi possível confirmar a aprovação no PostgreSQL." });
  } finally { client?.release(); }
}

export async function decidirLancamentoManualContabil(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  const id = String(req.params.id || "").trim();
  const decisao = req.body?.decisao === "aprovar" || req.body?.decisao === "rejeitar" ? req.body.decisao : "";
  const motivo = String(req.body?.motivo || "").trim();
  if (!cnpjContabilValido(cnpj) || !id || id.length > 200) { res.status(400).json({ sucesso: false, motivo: "Empresa ou identificador do lançamento inválido." }); return; }
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  if (!sessao.administrador && sessao.memberships.find((item) => item.cnpj === cnpj)?.role === "viewer") { res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." }); return; }
  if (!decisao || (decisao === "rejeitar" && (!motivo || motivo.length > 1000))) { res.status(400).json({ sucesso: false, motivo: "Escolha aprovar ou rejeitar; a rejeição exige um motivo de até 1.000 caracteres." }); return; }

  let client: PoolClient | undefined;
  try {
    await prepararAuthContabil();
    client = await obterBanco().connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [cnpj]);
    const row = await client.query("SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE", [cnpj]);
    if (!row.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ sucesso: false, motivo: "Workspace da empresa não encontrado." }); return; }
    const payload = row.rows[0].payload as Record<string, any>;
    const lancamentos: Array<Record<string, any>> = Array.isArray(payload.lancamentos) ? [...payload.lancamentos] : [];
    const indice = lancamentos.findIndex((item) => String(item.id || "") === id);
    const item = indice >= 0 ? lancamentos[indice] : null;
    if (!item || (item.origem !== "Manual" && !item.estornoDe && !item.saldoInicialContaCodigo) || item.statusManual !== "pendente_aprovacao") {
      await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "O lançamento não está pendente de aprovação ou já recebeu uma decisão." }); return;
    }
    const data = normalizarDataContabil(String(item.data || ""));
    const valorCentavos = Number.isFinite(Number(item.valor)) ? Math.round(Number(item.valor) * 100) : 0;
    const contas = Array.isArray(payload.contas) ? payload.contas : [];
    const analiticas = new Set(contas.filter((conta: any) => conta?.tipo === "analitica").map((conta: any) => String(conta.codigo || "")));
    if (!data || valorCentavos <= 0 || !String(item.historico || "").trim()
      || !analiticas.has(String(item.contaDebitoCodigo || "")) || !analiticas.has(String(item.contaCreditoCodigo || ""))
      || item.contaDebitoCodigo === item.contaCreditoCodigo) {
      await client.query("ROLLBACK"); res.status(422).json({ sucesso: false, motivo: "A proposta está incompleta ou suas contas já não são analíticas. Corrija os dados e envie uma nova proposta." }); return;
    }
    const competencia = data.slice(0, 7);
    const fechado = await client.query("SELECT 1 FROM contabil_period_closures WHERE cnpj=$1 AND competencia=$2", [cnpj, competencia]);
    if (fechado.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "A competência deste lançamento está fechada. Nenhuma decisão foi aplicada." }); return; }
    if (item.estornoDe) {
      const original = lancamentos.find((lancamento) => String(lancamento.id || "") === String(item.estornoDe));
      const jaEstornado = lancamentos.some((lancamento) => String(lancamento.estornoDe || "") === String(item.estornoDe));
      if (!original || original.statusManual === "pendente_aprovacao" || original.statusManual === "rejeitado" || jaEstornado
        || Math.round(Number(original.valor) * 100) !== valorCentavos
        || String(original.contaDebitoCodigo || "") !== String(item.contaCreditoCodigo || "")
        || String(original.contaCreditoCodigo || "") !== String(item.contaDebitoCodigo || "")
        || String(original.origem || "") !== String(item.origem || "")) {
        await client.query("ROLLBACK"); res.status(422).json({ sucesso: false, motivo: "O estorno não corresponde a uma partida vigente, com mesmo valor e contas invertidas." }); return;
      }
    }
    if (decisao === "aprovar" && item.saldoInicialContaCodigo && !item.estornoDe) {
      const contaAbertura = contas.find((conta: any) => String(conta?.codigo || "") === String(item.saldoInicialContaCodigo));
      const contaContrapartidaCodigo = String(item.contaDebitoCodigo) === String(item.saldoInicialContaCodigo)
        ? String(item.contaCreditoCodigo) : String(item.contaDebitoCodigo);
      const contaContrapartida = contas.find((conta: any) => String(conta?.codigo || "") === contaContrapartidaCodigo);
      const contaContrapartidaAtual = payload.empresa?.contaContrapartidaAberturaCodigo;
      const saldoCentavos = Number.isFinite(Number(contaAbertura?.saldoInicial)) ? Math.round(Number(contaAbertura.saldoInicial) * 100) : 0;
      const naturezaEsperada = contaAbertura?.natureza === "D"
        ? String(item.contaDebitoCodigo) === String(contaAbertura.codigo)
        : String(item.contaCreditoCodigo) === String(contaAbertura?.codigo);
      if (item.origem !== "Cadastro" || !contaAbertura || contaAbertura.tipo !== "analitica" || contaAbertura.saldoInicialConvertidoEm
        || !contaContrapartida || contaContrapartida.tipo !== "analitica" || Number(contaContrapartida.saldoInicial || 0) !== 0
        || saldoCentavos !== valorCentavos || String(contaAbertura.saldoInicialCompetencia || "") !== competencia
        || data !== `${competencia}-01` || contaContrapartidaAtual !== contaContrapartidaCodigo || !naturezaEsperada) {
        await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "A proposta de abertura não corresponde mais ao saldo, à competência-base ou à conta de contrapartida configurada. Atualize a proposta antes de aprovar." }); return;
      }
      if (decisao === "aprovar") contaAbertura.saldoInicialConvertidoEm = new Date().toISOString();
    }
    if (item.estornoDe && decisao === "aprovar") {
      const original = lancamentos.find((lancamento) => String(lancamento.id || "") === String(item.estornoDe));
      if (original?.saldoInicialContaCodigo) {
        const contaAbertura = contas.find((conta: any) => String(conta?.codigo || "") === String(original.saldoInicialContaCodigo));
        if (!contaAbertura?.saldoInicialConvertidoEm) {
          await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "O saldo de abertura associado ao lançamento não está convertido. Atualize a empresa antes de aprovar este estorno." }); return;
        }
        delete contaAbertura.saldoInicialConvertidoEm;
      }
    }
    const statusManual = decisao === "aprovar" ? "aprovado" : "rejeitado";
    const decidido = { ...item, statusManual };
    lancamentos[indice] = decidido;
    const novoPayload = { ...payload, lancamentos };
    const evento = item.estornoDe
      ? (decisao === "aprovar" ? "estorno_manual_aprovado" : "estorno_manual_rejeitado")
      : (decisao === "aprovar" ? "lancamento_manual_aprovado" : "lancamento_manual_rejeitado");
    if (decisao === "aprovar") {
      await client.query(`
        INSERT INTO contabil_manual_journal_audit(cnpj,lancamento_id,evento,user_id,login,lancamento)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)
      `, [cnpj, id, item.estornoDe ? "estorno_manual" : "lancamento_manual", sessao.userId, sessao.login, JSON.stringify(decidido)]);
    }
    await client.query(`
      INSERT INTO contabil_manual_journal_events(cnpj,lancamento_id,evento,user_id,login,lancamento,motivo)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)
    `, [cnpj, id, evento, sessao.userId, sessao.login, JSON.stringify(decidido), decisao === "rejeitar" ? motivo : null]);
    const atualizado = await client.query("UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1 RETURNING version,updated_at", [cnpj, JSON.stringify(novoPayload)]);
    await client.query("COMMIT");
    res.json({ sucesso: true, cnpj, decisao, decididoPor: sessao.login, dados: novoPayload, versao: Number(atualizado.rows[0].version), atualizadoEm: new Date(atualizado.rows[0].updated_at).toISOString(), persistencia: "postgresql" });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao decidir lançamento manual contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível registrar a decisão manual no PostgreSQL." });
  } finally { client?.release(); }
}

export async function listarHistoricoAprovacoesContabil(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!cnpjContabilValido(cnpj)) { res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." }); return; }
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  const limiteSolicitado = req.query.limite == null ? 100 : Number(req.query.limite);
  if (!Number.isInteger(limiteSolicitado) || limiteSolicitado < 1 || limiteSolicitado > 200) {
    res.status(400).json({ sucesso: false, motivo: "O limite deve estar entre 1 e 200 registros." }); return;
  }
  try {
    await prepararAuthContabil();
    const result = await obterBanco().query(`
      SELECT referencia, login, valor::text AS valor, conta_debito AS "contaDebito",
        conta_credito AS "contaCredito", aprovado_em AS "aprovadoEm"
      FROM contabil_accounting_approval_audit
      WHERE cnpj=$1
      ORDER BY aprovado_em DESC, referencia DESC
      LIMIT $2
    `, [cnpj, limiteSolicitado]);
    const auditoriaCompleta = await obterBanco().query(`
      SELECT referencia, valor::text AS valor, conta_debito AS "contaDebito",
        conta_credito AS "contaCredito"
      FROM contabil_accounting_approval_audit WHERE cnpj=$1
    `, [cnpj]);
    const workspace = await obterBanco().query("SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj]);
    const payload = workspace.rows[0]?.payload as Record<string, unknown> | undefined;
    const lancamentos = Array.isArray(payload?.lancamentos) ? payload.lancamentos as Array<Record<string, unknown>> : [];
    const preLancamentos = Array.isArray(payload?.preLancamentos) ? payload.preLancamentos as Array<Record<string, unknown>> : [];
    const lancamentosIntegrados = lancamentos.filter((item) => {
      const referencia = String(item.documentoRef || item.id || "");
      return (referencia.startsWith(`DP:${cnpj}:`) || referencia.startsWith(`FISCAL:${cnpj}:`)) && item.estornado !== true;
    });
    const auditoriaPorReferencia = new Map(auditoriaCompleta.rows.map((item) => [String(item.referencia), item]));
    const lancamentoPorReferencia = new Map(lancamentosIntegrados.map((item) => [String(item.documentoRef || item.id), item]));
    const aprovacoesSemLancamento = auditoriaCompleta.rows.filter((item) => {
      const lancamento = lancamentoPorReferencia.get(String(item.referencia));
      return !lancamento || Number(lancamento.valor) !== Number(item.valor)
        || String(lancamento.contaDebitoCodigo || "") !== String(item.contaDebito)
        || String(lancamento.contaCreditoCodigo || "") !== String(item.contaCredito);
    }).map((item) => String(item.referencia));
    const lancamentosSemAuditoria = lancamentosIntegrados.filter((item) => !auditoriaPorReferencia.has(String(item.documentoRef || item.id)))
      .map((item) => String(item.documentoRef || item.id));
    const statusContabilizadosSemLancamento = preLancamentos.filter((item) => item.status === "contabilizado"
      && !lancamentoPorReferencia.has(String(item.referenciaOrigem || "")))
      .map((item) => String(item.referenciaOrigem || "")).filter(Boolean);
    const todosLancamentosManuais = lancamentos.filter((item) => item.origem === "Manual" || Boolean(item.estornoDe) || Boolean(item.saldoInicialContaCodigo));
    const lancamentosManuais = todosLancamentosManuais.filter((item) =>
      item.statusManual !== "pendente_aprovacao" && item.statusManual !== "rejeitado");
    const auditoriaManualCompleta = await obterBanco().query(`
      SELECT lancamento_id AS "lancamentoId", evento, login, lancamento, motivo,
        registrado_em AS "registradoEm"
      FROM contabil_manual_journal_events WHERE cnpj=$1
      ORDER BY registrado_em DESC, evento_id DESC LIMIT $2
    `, [cnpj, limiteSolicitado]);
    const auditoriaManualTodas = await obterBanco().query(`
      SELECT lancamento_id AS "lancamentoId", lancamento
      FROM contabil_manual_journal_audit WHERE cnpj=$1
    `, [cnpj]);
    const eventosManuaisTodas = await obterBanco().query(`
      SELECT lancamento_id AS "lancamentoId", evento, lancamento
      FROM contabil_manual_journal_events WHERE cnpj=$1
      ORDER BY registrado_em DESC, evento_id DESC
    `, [cnpj]);
    const auditoriaSaldosAbertura = await obterBanco().query(`
      SELECT conta_codigo AS "contaCodigo", evento, saldo_anterior::text AS "saldoAnterior",
        saldo_novo::text AS "saldoNovo", competencia, login, registrado_em AS "registradoEm"
      FROM contabil_opening_balance_audit WHERE cnpj=$1
      ORDER BY registrado_em DESC LIMIT $2
    `, [cnpj, limiteSolicitado]);
    const lancamentoManualPorId = new Map(todosLancamentosManuais.map((item) => [String(item.id || ""), item]));
    const auditoriaManualPorId = new Map(auditoriaManualTodas.rows.map((item) => [String(item.lancamentoId), item.lancamento]));
    const lancamentosManuaisSemAuditoria = lancamentosManuais
      .filter((item) => !auditoriaManualPorId.has(String(item.id || "")))
      .map((item) => String(item.id || "")).filter(Boolean);
    const auditoriasManuaisSemLancamento = auditoriaManualTodas.rows
      .filter((item) => !lancamentoManualPorId.has(String(item.lancamentoId))
        || jsonCanonico(lancamentoManualPorId.get(String(item.lancamentoId))) !== jsonCanonico(item.lancamento))
      .map((item) => String(item.lancamentoId));
    const eventoMaisRecentePorId = new Map<string, Record<string, any>>();
    for (const evento of eventosManuaisTodas.rows) {
      const id = String(evento.lancamentoId || "");
      if (id && !eventoMaisRecentePorId.has(id)) eventoMaisRecentePorId.set(id, evento);
    }
    const lancamentosComTrilhaInconsistente = todosLancamentosManuais
      .filter((item) => {
        const id = String(item.id || "");
        const evento = eventoMaisRecentePorId.get(id);
        const tipo = item.estornoDe ? "estorno_manual" : "lancamento_manual";
        const sufixo = item.statusManual === "pendente_aprovacao" ? "_pendente"
          : item.statusManual === "aprovado" ? "_aprovado"
            : item.statusManual === "rejeitado" ? "_rejeitado" : "";
        return !evento || evento.evento !== `${tipo}${sufixo}`
          || jsonCanonico(evento.lancamento) !== jsonCanonico(item);
      })
      .map((item) => String(item.id || "")).filter(Boolean);
    const eventosManuaisSemLancamento = [...new Set(eventosManuaisTodas.rows
      .filter((item) => !lancamentoManualPorId.has(String(item.lancamentoId || "")))
      .map((item) => String(item.lancamentoId || "")).filter(Boolean))];
    const conferido = aprovacoesSemLancamento.length === 0 && lancamentosSemAuditoria.length === 0
      && statusContabilizadosSemLancamento.length === 0 && lancamentosManuaisSemAuditoria.length === 0
      && auditoriasManuaisSemLancamento.length === 0 && lancamentosComTrilhaInconsistente.length === 0
      && eventosManuaisSemLancamento.length === 0;
    res.json({ sucesso: true, cnpj, aprovacoes: result.rows, conferenciaIntegridade: {
      status: conferido ? "consistente" : "revisar",
      aprovacoesSemLancamento,
      lancamentosSemAuditoria,
      statusContabilizadosSemLancamento,
      lancamentosManuaisSemAuditoria,
      auditoriasManuaisSemLancamento,
      lancamentosComTrilhaInconsistente,
      eventosManuaisSemLancamento,
    }, lancamentosManuais: auditoriaManualCompleta.rows, lancamentosManuaisSemAuditoria, saldosAbertura: auditoriaSaldosAbertura.rows });
  } catch (error) {
    console.error("Falha ao consultar histórico de aprovações contábeis:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar o histórico persistido." });
  }
}

export async function listarFechamentosContabil(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!cnpjContabilValido(cnpj)) { res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." }); return; }
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  try {
    await prepararAuthContabil();
    const result = await obterBanco().query(`SELECT competencia,login,"fechado_em" AS "fechadoEm",quantidade_lancamentos AS "quantidadeLancamentos",total_debitos::text AS "totalDebitos" FROM contabil_period_closures WHERE cnpj=$1 ORDER BY competencia DESC`, [cnpj]);
    res.json({ sucesso: true, cnpj, fechamentos: result.rows });
  } catch (error) {
    console.error("Falha ao listar fechamentos contábeis:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar os fechamentos persistidos." });
  }
}

export async function fecharCompetenciaContabil(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  const competencia = String(req.body?.competencia || "");
  if (!cnpjContabilValido(cnpj)) { res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." }); return; }
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  if (!sessao.administrador && sessao.memberships.find((item) => item.cnpj === cnpj)?.role === "viewer") { res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." }); return; }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) { res.status(400).json({ sucesso: false, motivo: "Informe uma competência válida no formato AAAA-MM." }); return; }

  let client: PoolClient | undefined;
  try {
    await prepararAuthContabil();
    client = await obterBanco().connect();
    await client.query("BEGIN");
    const atual = await client.query("SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE", [cnpj]);
    if (!atual.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ sucesso: false, motivo: "Workspace da empresa não encontrado no PostgreSQL." }); return; }
    const jaFechado = await client.query("SELECT 1 FROM contabil_period_closures WHERE cnpj=$1 AND competencia=$2", [cnpj, competencia]);
    if (jaFechado.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "Esta competência já está fechada." }); return; }
    const payload = atual.rows[0].payload as Record<string, any>;
    const contas = Array.isArray(payload.contas) ? payload.contas : [];
    const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
    const preLancamentos = Array.isArray(payload.preLancamentos) ? payload.preLancamentos : [];
    const pendentes = preLancamentos.filter((item: any) => item?.competencia === competencia && item?.status === "pendente_conferencia");
    const manuaisPendentes = lancamentos.filter((item: any) => item?.statusManual === "pendente_aprovacao"
      && normalizarDataContabil(String(item?.data || ""))?.slice(0, 7) === competencia);
    if (pendentes.length || manuaisPendentes.length) {
      await client.query("ROLLBACK");
      res.status(409).json({ sucesso: false, motivo: `Fechamento bloqueado: ${pendentes.length} pré-lançamento(s) e ${manuaisPendentes.length} lançamento(s) manual(is) aguardam conferência nesta competência.` });
      return;
    }
    const relatorios = gerarRelatoriosContabeis(contas, lancamentos, competencia);
    const invalidosCompetencia = relatorios.invalidos.filter((item: any) => {
      const data = normalizarDataContabil(String(item.data || ""));
      return String(item.competencia || data?.slice(0, 7) || "") === competencia;
    });
    if (invalidosCompetencia.length) {
      await client.query("ROLLBACK");
      res.status(409).json({ sucesso: false, motivo: `Fechamento bloqueado: ${invalidosCompetencia.length} lançamento(s) definitivo(s) desta competência têm inconsistências.` });
      return;
    }
    const saldosSemDataBase = relatorios.saldosIniciaisPendentes;
    if (saldosSemDataBase.length) {
      await client.query("ROLLBACK");
      res.status(409).json({ sucesso: false, motivo: `Fechamento bloqueado: ${saldosSemDataBase.length} saldo(s) inicial(is) têm valor ou competência-base pendente/inconsistente. Confira-os antes de fechar.` });
      return;
    }
    const haDadosNaCompetencia = relatorios.doPeriodo.length > 0
      || relatorios.totalSaldoDevedorCentavos > 0 || relatorios.totalSaldoCredorCentavos > 0;
    if (!haDadosNaCompetencia) {
      await client.query("ROLLBACK");
      res.status(409).json({ sucesso: false, motivo: "Fechamento bloqueado: nenhum movimento ou saldo inicial foi informado para comprovar os dados desta competência." });
      return;
    }
    if (relatorios.totalSaldoDevedorCentavos !== relatorios.totalSaldoCredorCentavos) {
      await client.query("ROLLBACK");
      res.status(409).json({ sucesso: false, motivo: "Fechamento bloqueado: os saldos devedores e credores do balancete não estão iguais. Confira os saldos iniciais e lançamentos antes de fechar." });
      return;
    }
    const totalDebitos = relatorios.totalDebitosCentavos / 100;
    const versao = await client.query("UPDATE contabil_company_workspaces SET version=version+1,updated_at=now() WHERE cnpj=$1 RETURNING version", [cnpj]);
    await client.query("INSERT INTO contabil_period_closures(cnpj,competencia,user_id,login,quantidade_lancamentos,total_debitos) VALUES($1,$2,$3,$4,$5,$6)", [cnpj, competencia, sessao.userId, sessao.login, relatorios.doPeriodo.length, totalDebitos]);
    await client.query("COMMIT");
    res.status(201).json({ sucesso: true, cnpj, competencia, fechadoPor: sessao.login, fechadoEm: new Date().toISOString(), quantidadeLancamentos: relatorios.doPeriodo.length, totalDebitos: totalDebitos.toFixed(2), versao: Number(versao.rows[0].version), persistencia: "postgresql" });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao fechar competência contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível confirmar o fechamento no PostgreSQL." });
  } finally { client?.release(); }
}

export async function lerWorkspaceInternoContabil(cnpj: string): Promise<Record<string, unknown> | null> {
  const normalizado = normalizarCnpjAcesso(cnpj);
  if (!cnpjContabilValido(normalizado)) return null;
  await prepararAuthContabil();
  const row = await obterBanco().query("SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1", [normalizado]);
  return row.rowCount ? row.rows[0].payload as Record<string, unknown> : null;
}

export async function listarCnpjsComMapeamentoContabil(): Promise<string[]> {
  await prepararAuthContabil();
  const result = await obterBanco().query(`
    SELECT cnpj
    FROM contabil_company_workspaces
    WHERE CASE WHEN jsonb_typeof(payload->'mapeamentosOrigem')='array'
      THEN jsonb_array_length(payload->'mapeamentosOrigem') > 0 ELSE false END
    ORDER BY updated_at DESC
  `);
  return result.rows.map((row) => String(row.cnpj));
}

/** Atomically stores generated drafts while preserving finalized entries and user workspace changes. */
export async function mesclarRascunhosAutomaticosContabil(
  cnpj: string,
  candidatos: RascunhoAutomaticoContabil[],
): Promise<{ criados: number; atualizados: number }> {
  const normalizado = normalizarCnpjAcesso(cnpj);
  if (!cnpjContabilValido(normalizado) || candidatos.length === 0) return { criados: 0, atualizados: 0 };
  if (candidatos.length > 700) throw new Error("Lote automático de rascunhos excede o limite permitido.");
  await prepararAuthContabil();

  const client = await obterBanco().connect();
  let criados = 0;
  let atualizados = 0;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE", [normalizado]);
    if (!result.rowCount) { await client.query("COMMIT"); return { criados: 0, atualizados: 0 }; }

    const payload = result.rows[0].payload as Record<string, unknown>;
    const mapeamentos = Array.isArray(payload.mapeamentosOrigem) ? payload.mapeamentosOrigem as Array<Record<string, unknown>> : [];
    const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos as Array<Record<string, unknown>> : [];
    const existentes = Array.isArray(payload.preLancamentos) ? payload.preLancamentos as Array<Record<string, unknown>> : [];
    const atualizadosWorkspace = [...existentes];
    const fechados = new Set((await client.query("SELECT competencia FROM contabil_period_closures WHERE cnpj=$1", [normalizado])).rows.map((row) => String(row.competencia)));

    for (const candidato of candidatos) {
      const referencia = candidato.referenciaOrigem;
      if (!referencia.startsWith(`DP:${normalizado}:`) && !referencia.startsWith(`FISCAL:${normalizado}:`)) continue;
      if (fechados.has(candidato.competencia)) continue;
      if (lancamentos.some((item) => item.documentoRef === referencia || item.id === referencia)) continue;
      const campoOrigem = referencia.startsWith("DP:") ? referenceDpOrigem(referencia) : referenceFiscalOrigem(referencia);
      const mapeamento = mapeamentos.find((item) => item.origem === campoOrigem);
      if (!mapeamento || mapeamento.contaDebitoCodigo !== candidato.contaDebitoCodigo || mapeamento.contaCreditoCodigo !== candidato.contaCreditoCodigo) continue;

      const indice = atualizadosWorkspace.findIndex((item) => item.referenciaOrigem === referencia);
      const existente = indice < 0 ? undefined : atualizadosWorkspace[indice];
      if (existente?.status === "contabilizado") continue;
      const draft = {
        ...candidato,
        criadoEm: typeof existente?.criadoEm === "string" ? existente.criadoEm : candidato.criadoEm,
        status: "pendente_conferencia" as const,
        geradoAutomaticamente: true as const,
      };
      if (existente && existente.data === draft.data && existente.competencia === draft.competencia
        && existente.origem === draft.origem && existente.contaDebitoCodigo === draft.contaDebitoCodigo
        && existente.contaCreditoCodigo === draft.contaCreditoCodigo && existente.valor === draft.valor
        && existente.historico === draft.historico) continue;
      if (indice < 0) {
        atualizadosWorkspace.push(draft);
        criados += 1;
      } else {
        atualizadosWorkspace[indice] = draft;
        atualizados += 1;
      }
    }

    if (criados || atualizados) {
      const novoPayload = { ...payload, preLancamentos: atualizadosWorkspace };
      if (!workspaceValido(novoPayload)) throw new Error("Workspace inválido ao salvar os rascunhos automáticos; nenhum lançamento foi criado.");
      await client.query("UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1", [normalizado, JSON.stringify(novoPayload)]);
    }
    await client.query("COMMIT");
    return { criados, atualizados };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function referenceDpOrigem(referencia: string): string {
  const campo = referencia.split(":").at(-1);
  return campo === "folhaBruta" ? "dp_folha_bruta" : campo === "descontosINSS" ? "dp_descontos_inss"
    : campo === "inssPatronal" ? "dp_inss_patronal"
    : campo === "descontosIRRF" ? "dp_descontos_irrf" : campo === "fgts" ? "dp_fgts" : "";
}

function referenceFiscalOrigem(referencia: string): string {
  const tipo = referencia.split(":")[3];
  return tipo === "Entrada" ? "fiscal_entrada" : tipo === "Saida" ? "fiscal_saida" : "";
}

export async function lerWorkspaceContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  try {
    const row = await obterBanco().query("SELECT payload,updated_at,version FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj]);
    res.setHeader("Cache-Control", "no-store");
    if (!row.rowCount) { res.json({ sucesso: true, cnpj, dados: null, atualizadoEm: null, versao: null }); return; }
    res.json({ sucesso: true, cnpj, dados: row.rows[0].payload, atualizadoEm: new Date(row.rows[0].updated_at).toISOString(), versao: Number(row.rows[0].version) });
  } catch (error) {
    console.error("Falha ao ler dados persistidos da empresa no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível carregar os dados persistentes desta empresa." });
  }
}

export async function listarWorkspacesContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  if (!sessao?.cnpjs.length) { res.status(403).json({ sucesso: false, motivo: "Nenhuma empresa está autorizada nesta sessão." }); return; }
  try {
    const result = await obterBanco().query("SELECT cnpj,payload->'empresa' AS empresa,updated_at FROM contabil_company_workspaces WHERE cnpj=ANY($1::text[]) ORDER BY cnpj", [sessao.cnpjs]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ sucesso: true, empresas: result.rows.map((row) => ({ ...row.empresa, cnpj: row.cnpj, certificadoAtivo: false, certificadoNomeArquivo: undefined, workspaceAtualizadoEm: new Date(row.updated_at).toISOString() })) });
  } catch (error) {
    console.error("Falha ao listar empresas autorizadas do Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível carregar a lista de empresas persistida." });
  }
}

export async function salvarWorkspaceContabil(req: Request, res: Response, opcoes: { dadosPropostosPeloCliente?: unknown; permitirRascunhosServidor?: boolean } = {}): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
  if (!sessao.administrador && sessao.memberships.find((item) => item.cnpj === cnpj)?.role === 'viewer') { res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." }); return; }
  if (!workspaceValido(req.body?.dados)) { res.status(422).json({ sucesso: false, motivo: "Workspace inválido, acima do limite ou contendo campos não permitidos." }); return; }
  const cnpjDados = normalizarCnpjAcesso((req.body.dados as any).empresa?.cnpj);
  if (cnpjDados && cnpjDados !== cnpj) { res.status(422).json({ sucesso: false, motivo: "Os dados da empresa não correspondem ao CNPJ autorizado." }); return; }
  if (Array.isArray((req.body.dados as any).preLancamentos) && (req.body.dados as any).preLancamentos.some((item: any) => {
    const referencia = String(item?.referenciaOrigem || "");
    return !referencia.startsWith(`DP:${cnpj}:`) && !referencia.startsWith(`FISCAL:${cnpj}:`);
  })) {
    res.status(422).json({ sucesso: false, motivo: "Um pré-lançamento não pertence ao CNPJ autorizado." }); return;
  }
  const versaoAnterior = req.body?.versaoAnterior;
  if (versaoAnterior !== null && (!Number.isSafeInteger(versaoAnterior) || versaoAnterior < 1)) {
    res.status(400).json({ sucesso: false, motivo: "Informe a versão atual do workspace antes de salvar." }); return;
  }
  let client: PoolClient | null = null;
  try {
    await prepararAuthContabil();
    client = await obterBanco().connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [cnpj]);
    const atual = await client.query("SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE", [cnpj]);
    const payloadAtual = atual.rowCount ? atual.rows[0].payload as Record<string, unknown> : {};
    const versaoAtual = atual.rowCount ? Number(atual.rows[0].version) : null;
    if (versaoAtual !== versaoAnterior) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, conflito: true, motivo: "Os dados desta empresa mudaram em outra sessão. Atualize a empresa antes de salvar." }); return; }
    const propostaCliente = opcoes.dadosPropostosPeloCliente ?? req.body.dados;
    const fechamentos = await client.query("SELECT competencia FROM contabil_period_closures WHERE cnpj=$1", [cnpj]);
    const fechadoAtual = fechamentos.rows.map((row) => String(row.competencia));
    const payloadProposto = propostaCliente as Record<string, unknown>;
    const payloadFinal = req.body.dados as Record<string, unknown>;
    const contasAtuaisAbertura = Array.isArray(payloadAtual.contas) ? payloadAtual.contas as Array<Record<string, unknown>> : [];
    const contasNovasAbertura = Array.isArray(payloadFinal.contas) ? payloadFinal.contas as Array<Record<string, unknown>> : [];
    const contasAtuaisAberturaPorCodigo = new Map(contasAtuaisAbertura.map((conta) => [String(conta.codigo || ""), conta]));
    for (const contaNova of contasNovasAbertura.filter((conta) => Boolean(conta.saldoInicialConvertidoEm))) {
      const contaAtual = contasAtuaisAberturaPorCodigo.get(String(contaNova.codigo || ""));
      if (!contaAtual?.saldoInicialConvertidoEm) {
        await client.query("ROLLBACK"); res.status(403).json({ sucesso: false, motivo: "A conversão de saldo inicial só pode ser registrada pela aprovação autenticada da partida correspondente." }); return;
      }
    }
    for (const contaAtual of contasAtuaisAbertura.filter((conta) => Boolean(conta.saldoInicialConvertidoEm))) {
      const contaNova = contasNovasAbertura.find((conta) => String(conta.codigo || "") === String(contaAtual.codigo || ""));
      if (!contaNova || jsonCanonico({ saldoInicial: contaAtual.saldoInicial, competencia: contaAtual.saldoInicialCompetencia, convertidoEm: contaAtual.saldoInicialConvertidoEm })
        !== jsonCanonico({ saldoInicial: contaNova.saldoInicial, competencia: contaNova.saldoInicialCompetencia, convertidoEm: contaNova.saldoInicialConvertidoEm })) {
        await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: `O saldo inicial convertido da conta ${String(contaAtual.codigo || "")} está protegido. Use um estorno aprovado para corrigir a partida.` }); return;
      }
    }
    if (fechadoAtual.length && [payloadProposto, payloadFinal].some((payload) => !planoContasCompatívelComFechamentos(payloadAtual.contas || [], payload.contas || []))) {
      await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "Há competência fechada. Contas usadas no histórico não podem ser alteradas ou removidas; é permitido acrescentar contas sem saldo inicial, desde que não alterem a hierarquia existente." }); return;
    }
    for (const competencia of fechadoAtual) {
      if ([payloadProposto, payloadFinal].some((payload) => jsonCanonico(dadosCompetencia(payloadAtual, competencia)) !== jsonCanonico(dadosCompetencia(payload, competencia)))) {
        await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, competenciaFechada: competencia, motivo: `A competência ${competencia} está fechada. Lançamentos, pré-lançamentos e registros do período permanecem bloqueados.` }); return;
      }
    }
    if (!alteracaoIntegradaPermitida(payloadAtual, propostaCliente as Record<string, unknown>, false)) {
      await client.query("ROLLBACK"); res.status(403).json({ sucesso: false, motivo: "Rascunhos e lançamentos vindos do Fiscal/DP só podem ser alterados pela validação automática ou pela aprovação autenticada do contador." }); return;
    }
    if (opcoes.permitirRascunhosServidor && !alteracaoIntegradaPermitida(payloadAtual, req.body.dados as Record<string, unknown>, true)) {
      await client.query("ROLLBACK"); res.status(403).json({ sucesso: false, motivo: "A preparação automática tentou alterar um lançamento integrado já protegido." }); return;
    }
    const lancamentosAtuais = Array.isArray(payloadAtual.lancamentos) ? payloadAtual.lancamentos as Array<Record<string, unknown>> : [];
    const lancamentosNovos = Array.isArray(payloadFinal.lancamentos) ? payloadFinal.lancamentos as Array<Record<string, unknown>> : [];
    const lancamentosSolicitadosCliente = Array.isArray(payloadProposto.lancamentos) ? payloadProposto.lancamentos as Array<Record<string, unknown>> : [];
    const lancamentosAtuaisPorId = new Map(lancamentosAtuais.map((item) => [String(item.id || ""), item]));
    const lancamentosNovosPorId = new Map(lancamentosNovos.map((item) => [String(item.id || ""), item]));
    const novasPartidasCliente = lancamentosSolicitadosCliente.filter((item) => !lancamentosAtuaisPorId.has(String(item.id || "")));
    if (new Set(novasPartidasCliente.map((item) => String(item.id || ""))).size !== novasPartidasCliente.length) {
      await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, motivo: "A solicitação contém partidas repetidas. Atualize a tela e tente novamente." }); return;
    }
    if (novasPartidasCliente.some((item) => !((item.origem === "Manual" && !item.estornoDe && item.statusManual === "pendente_aprovacao")
      || (item.origem === "Cadastro" && item.saldoInicialContaCodigo && item.statusManual === "pendente_aprovacao" && !item.estornoDe)))) {
      await client.query("ROLLBACK"); res.status(403).json({ sucesso: false, motivo: "Partidas definitivas não podem ser inseridas pelo navegador. Envie lançamentos manuais pendentes ou propostas de abertura para aprovação." }); return;
    }
    for (const antigo of lancamentosAtuais.filter((item) => item.origem === "Manual" || Boolean(item.estornoDe) || Boolean(item.saldoInicialContaCodigo))) {
      const novo = lancamentosNovosPorId.get(String(antigo.id || ""));
      if (!novo || jsonCanonico(antigo) !== jsonCanonico(novo)) {
        await client.query("ROLLBACK");
        res.status(409).json({ sucesso: false, motivo: "Lançamentos manuais salvos são preservados no histórico. Para corrigir um lançamento, registre um estorno e crie a partida correta." }); return;
      }
    }
    const adicoesManuais = lancamentosSolicitadosCliente.filter((item) => (item.origem === "Manual" || Boolean(item.saldoInicialContaCodigo)) && !item.estornoDe && !lancamentosAtuaisPorId.has(String(item.id || "")));
    const adicoesEstorno = lancamentosSolicitadosCliente.filter((item) => Boolean(item.estornoDe) && !lancamentosAtuaisPorId.has(String(item.id || "")));
    const contasParaValidacao = Array.isArray(payloadFinal.contas) ? payloadFinal.contas as Array<Record<string, unknown>> : [];
    const analiticasParaValidacao = new Set(contasParaValidacao.filter((conta) => conta.tipo === "analitica").map((conta) => String(conta.codigo || "")));
    for (const item of adicoesManuais) {
      if (!String(item.id || "").trim() || !normalizarDataContabil(String(item.data || ""))
        || !Number.isFinite(Number(item.valor)) || Number(item.valor) <= 0
        || !analiticasParaValidacao.has(String(item.contaDebitoCodigo || "")) || !analiticasParaValidacao.has(String(item.contaCreditoCodigo || ""))
        || item.contaDebitoCodigo === item.contaCreditoCodigo || item.statusManual !== "pendente_aprovacao"
        || !String(item.historico || "").trim()) {
        await client.query("ROLLBACK");
        res.status(422).json({ sucesso: false, motivo: "Lançamento manual inválido: informe data real, valor positivo, duas contas analíticas diferentes e histórico. Lançamentos novos precisam aguardar aprovação." }); return;
      }
    }
    for (const estorno of adicoesEstorno) {
      const original = lancamentosAtuaisPorId.get(String(estorno.estornoDe || ""));
      const centavos = (value: unknown) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : NaN;
      const jaEstornado = lancamentosAtuais.some((item) => String(item.estornoDe || "") === String(estorno.estornoDe || ""));
      if (!original || original.statusManual === "pendente_aprovacao" || original.statusManual === "rejeitado" || jaEstornado || estorno.statusManual !== "pendente_aprovacao" || centavos(original.valor) !== centavos(estorno.valor)
        || String(original.contaDebitoCodigo || "") !== String(estorno.contaCreditoCodigo || "")
        || String(original.contaCreditoCodigo || "") !== String(estorno.contaDebitoCodigo || "")
        || String(original.origem || "") !== String(estorno.origem || "")
        || !analiticasParaValidacao.has(String(estorno.contaDebitoCodigo || "")) || !analiticasParaValidacao.has(String(estorno.contaCreditoCodigo || ""))
        || !normalizarDataContabil(String(estorno.data || "")) || !String(estorno.historico || "").trim()) {
        await client.query("ROLLBACK");
        res.status(422).json({ sucesso: false, motivo: "O estorno não corresponde a uma partida existente, não estornada, com mesmo valor e contas invertidas." }); return;
      }
    }
    for (const item of [...adicoesManuais, ...adicoesEstorno]) {
      const salvo = lancamentosNovosPorId.get(String(item.id || ""));
      if (!salvo || jsonCanonico(salvo) !== jsonCanonico(item)) {
        await client.query("ROLLBACK");
        res.status(422).json({ sucesso: false, motivo: "O lançamento pendente não corresponde ao conteúdo que será salvo." }); return;
      }
      await client.query(`
        INSERT INTO contabil_manual_journal_events(cnpj,lancamento_id,evento,user_id,login,lancamento)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)
      `, [cnpj, String(item.id), item.estornoDe ? "estorno_manual_pendente" : "lancamento_manual_pendente", sessao.userId, sessao.login, JSON.stringify(item)]);
    }
    const contasAtuais = Array.isArray(payloadAtual.contas) ? payloadAtual.contas as Array<Record<string, unknown>> : [];
    const contasPropostas = Array.isArray(payloadFinal.contas) ? payloadFinal.contas as Array<Record<string, unknown>> : [];
    const contasAtuaisPorCodigo = new Map(contasAtuais.map((item) => [String(item.codigo || ""), item]));
    for (const conta of contasPropostas) {
      const codigo = String(conta.codigo || "");
      const saldoNovo = Number(conta.saldoInicial ?? 0);
      const competenciaNova = String(conta.saldoInicialCompetencia || "") || null;
      const saldoAnteriorRaw = contasAtuaisPorCodigo.get(codigo)?.saldoInicial;
      const saldoAnterior = saldoAnteriorRaw == null ? null : Number(saldoAnteriorRaw);
      const competenciaAnterior = String(contasAtuaisPorCodigo.get(codigo)?.saldoInicialCompetencia || "") || null;
      if (!Number.isFinite(saldoNovo) || (saldoAnterior !== null && !Number.isFinite(saldoAnterior))) continue;
      if ((saldoAnterior === null ? saldoNovo !== 0 : Math.round(saldoAnterior * 100) !== Math.round(saldoNovo * 100))
        || competenciaAnterior !== competenciaNova) {
        await client.query(`
          INSERT INTO contabil_opening_balance_audit(cnpj,conta_codigo,evento,saldo_anterior,saldo_novo,competencia,user_id,login)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        `, [cnpj, codigo, saldoAnterior === null ? "saldo_inicial_cadastrado" : "saldo_inicial_alterado", saldoAnterior, saldoNovo, competenciaNova, sessao.userId, sessao.login]);
      }
    }
    const result = await client.query(`
      INSERT INTO contabil_company_workspaces(cnpj,payload,version) VALUES($1,$2::jsonb,1)
      ON CONFLICT(cnpj) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),version=contabil_company_workspaces.version+1
      WHERE $3::bigint IS NOT NULL AND contabil_company_workspaces.version=$3::bigint
      RETURNING updated_at,version
    `, [cnpj, JSON.stringify(req.body.dados), versaoAnterior]);
    res.setHeader("Cache-Control", "no-store");
    if (!result.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ sucesso: false, conflito: true, motivo: "Os dados desta empresa mudaram em outra sessão. Atualize a empresa antes de salvar para evitar sobrescrever alterações." }); return; }
    await client.query("COMMIT");
    res.json({ sucesso: true, persistencia: "postgresql", cnpj, atualizadoEm: new Date(result.rows[0].updated_at).toISOString(), versao: Number(result.rows[0].version) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao salvar dados persistidos da empresa no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível persistir os dados contábeis desta empresa." });
  } finally { client?.release(); }
}

export async function logoutAuthContabil(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = cookieDaRequisicao(req);
    if (token && contabilAuthBancoConfigurado()) {
      await prepararAuthContabil();
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      await obterBanco().query("DELETE FROM contabil_auth_sessions WHERE token_hash=$1", [hash]);
    }
    apagarCookie(res);
    res.setHeader("Cache-Control", "no-store");
    res.json({ sucesso: true });
  } catch (error) {
    apagarCookie(res);
    console.error("Falha ao encerrar sessão do Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível encerrar a sessão." });
  }
}

/** Acesso genérico ao banco do Contábil para módulos próprios (protocolo entre agentes, auditoria da Agente IA). */
export function consultaBancoContabil(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  return obterBanco().query(sql, params as any[]);
}
export function bancoContabilConfigurado(): boolean { return Boolean(process.env.DATABASE_URL?.trim()); }
/** Identificador não reversível da sessão atual (para vincular ações pendentes a quem as pediu). */
export function hashSessaoContabil(req: Request): string {
  return crypto.createHash("sha256").update(cookieDaRequisicao(req)).digest("hex").slice(0, 32);
}

let tabelaAgenteIAContabil: Promise<void> | null = null;
export async function registrarAcaoAgenteIAContabil(login: string, e: { evento: string; ferramenta: string; cnpj: string | null; resumo: string; resultado?: string }): Promise<void> {
  if (!bancoContabilConfigurado()) return;
  tabelaAgenteIAContabil ??= obterBanco().query(`
    CREATE TABLE IF NOT EXISTS contabil_ai_agent_log (
      id BIGSERIAL PRIMARY KEY, login TEXT NOT NULL, cnpj TEXT, event TEXT NOT NULL, tool TEXT NOT NULL,
      summary TEXT NOT NULL, result TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`).then(() => undefined).catch((erro) => { tabelaAgenteIAContabil = null; throw erro; });
  await tabelaAgenteIAContabil;
  await obterBanco().query('INSERT INTO contabil_ai_agent_log (login,cnpj,event,tool,summary,result) VALUES ($1,$2,$3,$4,$5,$6)',
    [String(login).slice(0, 120), e.cnpj ? normalizarCnpjAcesso(e.cnpj) : null, e.evento.slice(0, 40), e.ferramenta.slice(0, 60), e.resumo.slice(0, 300), e.resultado ? e.resultado.slice(0, 300) : null]);
}

export async function listarRegistroAgenteIAContabil(req: Request, limiteInformado: unknown = 30): Promise<any[]> {
  const sessao = sessaoDaRequisicaoContabil(req);
  if (!sessao) throw new Error("Sessão não autorizada.");
  if (!bancoContabilConfigurado()) return [];
  const limite = Math.max(1, Math.min(100, Number(limiteInformado) || 30));
  try {
  const r = await obterBanco().query(
    "SELECT id, login, cnpj, event, tool, summary, result, created_at FROM contabil_ai_agent_log WHERE (cnpj = ANY($1::text[]) OR (cnpj IS NULL AND login=$2)) ORDER BY id DESC LIMIT $3",
    [sessao.cnpjs, sessao.login, limite]);
  return r.rows.map((x) => ({ id: String(x.id), usuario: x.login, cnpj: x.cnpj, evento: x.event, ferramenta: x.tool, resumo: x.summary, resultado: x.result, em: new Date(x.created_at).toISOString() }));
  } catch { return []; /* tabela ainda não criada: nenhuma ação registrada */ }
}
