import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Pool, type PoolClient } from "pg";

const COOKIE = "murade_contabil_session";
const SESSION_SECONDS = 8 * 60 * 60;
let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;
let ultimaLimpezaSessao = 0;

export type SessaoContabil = { userId: string; login: string; cnpjs: string[]; administrador: boolean };

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
    CREATE TABLE IF NOT EXISTS contabil_company_workspaces (
      cnpj text PRIMARY KEY CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
      payload jsonb NOT NULL,
      version bigint NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `).then(async () => {
    await obterBanco().query("ALTER TABLE contabil_auth_users ADD COLUMN IF NOT EXISTS global_admin boolean NOT NULL DEFAULT false");
    await obterBanco().query("ALTER TABLE contabil_company_workspaces ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1");
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
    SELECT u.id, u.login, u.global_admin FROM contabil_auth_sessions s
    JOIN contabil_auth_users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled = false
  `, [tokenHash]);
  if (!user.rowCount) return null;
  const memberships = await obterBanco().query("SELECT cnpj FROM contabil_auth_company_access WHERE user_id = $1 ORDER BY cnpj", [user.rows[0].id]);
  return {
    userId: user.rows[0].id,
    login: user.rows[0].login,
    cnpjs: memberships.rows.map((row) => row.cnpj),
    administrador: user.rows[0].global_admin === true,
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
    const primeiroAcesso = Number(result.rows[0]?.total) === 0 && Boolean(process.env.CONTABIL_AUTH_BOOTSTRAP_TOKEN);
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
  if (!esperado || a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(403).json({ sucesso: false, motivo: "Código temporário inválido." }); return; }
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
    const result = await obterBanco().query("SELECT id,login,password_salt,password_hash,global_admin FROM contabil_auth_users WHERE login=$1 AND disabled=false", [login]);
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
    const access = await obterBanco().query("SELECT cnpj FROM contabil_auth_company_access WHERE user_id=$1 ORDER BY cnpj", [row.id]);
    res.json({ sucesso: true, usuario: row.login, cnpjs: access.rows.map((item) => item.cnpj), administrador: row.global_admin === true });
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
    res.json({ autenticado: true, usuario: sessao.login, cnpjs: sessao.cnpjs, administrador: sessao.administrador });
  } catch (error) {
    console.error("Falha ao consultar sessão do Contábil:", error);
    res.status(503).json({ autenticado: false, motivo: "Autenticação indisponível." });
  }
}

export async function adicionarEmpresaAcessoContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
  if (!sessao?.administrador) { res.status(403).json({ sucesso: false, motivo: "Somente o administrador geral pode liberar outro CNPJ." }); return; }
  if (!cnpjContabilValido(cnpj)) { res.status(400).json({ sucesso: false, motivo: "Informe um CNPJ com formato e dígitos verificadores válidos." }); return; }
  try {
    await obterBanco().query("INSERT INTO contabil_auth_company_access(user_id,cnpj,role) VALUES($1,$2,'admin') ON CONFLICT(user_id,cnpj) DO NOTHING", [sessao.userId, cnpj]);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ sucesso: true, cnpj, mensagem: "CNPJ autorizado para este usuário. Cadastre ou selecione a empresa para continuar." });
  } catch (error) {
    console.error("Falha ao autorizar CNPJ no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível atualizar o acesso à empresa." });
  }
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
    const remaining = await client.query("SELECT 1 FROM contabil_auth_company_access WHERE cnpj=$1 LIMIT 1", [cnpj]);
    const workspaceExcluido = !remaining.rowCount;
    if (workspaceExcluido) await client.query("DELETE FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj]);
    await client.query("COMMIT");
    res.setHeader("Cache-Control", "no-store");
    res.json({ sucesso: true, cnpj, workspaceExcluido });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Falha ao revogar acesso da empresa no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível remover o acesso da empresa." });
  } finally { client?.release(); }
}

const CAMPOS_WORKSPACE = new Set(["empresa", "contas", "centrosCusto", "mapeamentosOrigem", "preLancamentos", "lancamentos", "livros", "lembretes"]);
const ORIGENS_MAPEAVEIS = new Set(["fiscal_entrada", "fiscal_saida", "dp_folha_bruta", "dp_descontos_inss", "dp_descontos_irrf", "dp_fgts"]);
const ORIGENS_PRELANCAMENTO = new Set(["DP — Folha", "DP — INSS", "DP — IRRF", "DP — FGTS", "Fiscal — Entrada", "Fiscal — Saída"]);
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
      const camposPermitidos = ["id", "referenciaOrigem", "competencia", "data", "origem", "contaDebitoCodigo", "contaCreditoCodigo", "valor", "historico", "status", "criadoEm", "contabilizadoEm"];
      if (Object.keys(lancamento).some((key) => !camposPermitidos.includes(key))) return false;
      const referencia = typeof lancamento.referenciaOrigem === "string" ? lancamento.referenciaOrigem : "";
      const referenciaDP = /^DP:[A-Z0-9]{12}\d{2}:\d{4}-(0[1-9]|1[0-2]):(folhaBruta|descontosINSS|descontosIRRF|fgts)$/.test(referencia);
      const referenciaFiscal = /^FISCAL:[A-Z0-9]{12}\d{2}:\d{4}-(0[1-9]|1[0-2]):(Entrada|Saida):[A-Za-z0-9:_-]{1,128}$/.test(referencia);
      if ((!referenciaDP && !referenciaFiscal) || referencias.has(referencia) || lancamento.id !== referencia) return false;
      if (typeof lancamento.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(lancamento.competencia) || !referencia.includes(`:${lancamento.competencia}:`)) return false;
      if (typeof lancamento.data !== "string" || (referenciaDP && lancamento.data !== `${lancamento.competencia}-01`) || (referenciaFiscal && (!/^\d{4}-\d{2}-\d{2}$/.test(lancamento.data) || lancamento.data.slice(0, 7) !== lancamento.competencia))) return false;
      if (typeof lancamento.origem !== "string" || !ORIGENS_PRELANCAMENTO.has(lancamento.origem)) return false;
      const campoOrigem = referenciaDP ? referencia.slice(referencia.lastIndexOf(":") + 1) : referencia.split(":")[3];
      const origemEsperada = referenciaFiscal
        ? campoOrigem === "Entrada" ? "Fiscal — Entrada" : campoOrigem === "Saida" ? "Fiscal — Saída" : ""
        : campoOrigem === "folhaBruta" ? "DP — Folha" : campoOrigem === "descontosINSS" ? "DP — INSS" : campoOrigem === "descontosIRRF" ? "DP — IRRF" : "DP — FGTS";
      if (!origemEsperada || lancamento.origem !== origemEsperada) return false;
      if (typeof lancamento.contaDebitoCodigo !== "string" || typeof lancamento.contaCreditoCodigo !== "string" || lancamento.contaDebitoCodigo === lancamento.contaCreditoCodigo || !contasAnaliticas.has(lancamento.contaDebitoCodigo) || !contasAnaliticas.has(lancamento.contaCreditoCodigo)) return false;
      if (typeof lancamento.valor !== "number" || !Number.isFinite(lancamento.valor) || lancamento.valor <= 0 || lancamento.valor > 999999999999) return false;
      if (typeof lancamento.historico !== "string" || lancamento.historico.length > 240 || !["pendente_conferencia", "contabilizado"].includes(String(lancamento.status))) return false;
      if (typeof lancamento.criadoEm !== "string" || !Number.isFinite(Date.parse(lancamento.criadoEm))) return false;
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

export async function salvarWorkspaceContabil(req: Request, res: Response): Promise<void> {
  const sessao = (req as Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao || !sessao.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return; }
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
  try {
    const result = await obterBanco().query(`
      INSERT INTO contabil_company_workspaces(cnpj,payload,version) VALUES($1,$2::jsonb,1)
      ON CONFLICT(cnpj) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),version=contabil_company_workspaces.version+1
      WHERE $3::bigint IS NOT NULL AND contabil_company_workspaces.version=$3::bigint
      RETURNING updated_at,version
    `, [cnpj, JSON.stringify(req.body.dados), versaoAnterior]);
    res.setHeader("Cache-Control", "no-store");
    if (!result.rowCount) { res.status(409).json({ sucesso: false, conflito: true, motivo: "Os dados desta empresa mudaram em outra sessão. Atualize a empresa antes de salvar para evitar sobrescrever alterações." }); return; }
    res.json({ sucesso: true, persistencia: "postgresql", cnpj, atualizadoEm: new Date(result.rows[0].updated_at).toISOString(), versao: Number(result.rows[0].version) });
  } catch (error) {
    console.error("Falha ao salvar dados persistidos da empresa no Contábil:", error);
    res.status(503).json({ sucesso: false, motivo: "Não foi possível persistir os dados contábeis desta empresa." });
  }
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
