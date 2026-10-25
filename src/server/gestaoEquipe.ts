import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { emailConfigurado, enviarEmail } from './emailMurade';

// Gestão da equipe do escritório: convites pendentes (reenviar/cancelar), nova senha, bloquear e excluir.
// Só o administrador do escritório age, e só sobre quem é da própria equipe.
export type ConfigGestaoEquipe = {
  pool: () => Pool;
  tabelas: { usuarios: string; sessoes: string; convites: string };
  sessao: (req: Request) => { userId: string; admin: boolean } | undefined;
  preparar: () => Promise<void>;
  middlewares?: Array<(req: Request, res: Response, next: NextFunction) => unknown>;
  origem?: (req: Request, res: Response, next: NextFunction) => unknown;
};

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (s: string, salt: string) => new Promise<Buffer>((ok, err) => crypto.scrypt(s, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? err(e) : ok(k)));
const urlBase = (req: Request) => process.env.PUBLIC_APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || `${req.protocol}://${req.get('host')}`;
function linkConvite(req: Request, token: string, login: string) {
  const u = new URL('/', urlBase(req)); u.hash = new URLSearchParams({ convite: token, login }).toString(); return u.toString();
}

export function registrarGestaoEquipe(app: Express, cfg: ConfigGestaoEquipe, parte: 'tudo' | 'redefinir' | 'rotas' = 'tudo'): void {
  const T = cfg.tabelas; const db = () => cfg.pool();
  const tabelaReset = `${T.usuarios.replace(/_users$/, '')}_senha_resets`;
  let pronto: Promise<void> | null = null;
  const garantir = async () => { await cfg.preparar(); pronto ??= db().query(`CREATE TABLE IF NOT EXISTS ${tabelaReset} (token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`).then(() => undefined).catch((e) => { pronto = null; throw e; }); await pronto; };
  const mid = cfg.middlewares || [];
  const admin = (req: Request, res: Response) => { const s = cfg.sessao(req); if (!s?.admin) { res.status(403).json({ sucesso: false, motivo: 'Somente o administrador do escritório gerencia a equipe.' }); return null; } return s; };
  const falha = (res: Response, e: unknown) => { console.error('Gestão de equipe:', e); res.status(503).json({ sucesso: false, motivo: 'Não foi possível concluir agora. Tente de novo.' }); };
  const login = (req: Request) => String(req.params.login || '').trim().toLowerCase();
  const o = cfg.origem ? [cfg.origem] : [];

  if (parte !== 'rotas') // Redefinir senha: o mesmo link de convite (#convite=...) serve; este trecho atende antes do cadastro normal.
  app.post('/api/auth/redeem', ...o, async (req, res, next) => {
    try {
      const token = String(req.body?.convite || ''); const lg = String(req.body?.login || '').trim().toLowerCase(); const senha = String(req.body?.senha || '');
      if (!token || token.length > 128) return next();
      await garantir();
      const r = await db().query(`SELECT r.user_id FROM ${tabelaReset} r JOIN ${T.usuarios} u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.expires_at>now() AND u.login=$2 AND u.disabled=false`, [hash(token), lg]);
      if (!r.rowCount) return next();
      if (senha.length < 12 || senha.length > 256) { res.status(400).json({ sucesso: false, motivo: 'A senha precisa ter de 12 a 256 caracteres.' }); return; }
      const salt = crypto.randomBytes(16).toString('hex'); const dig = (await scrypt(senha, salt)).toString('hex');
      await db().query(`UPDATE ${T.usuarios} SET password_salt=$1, password_hash=$2 WHERE id=$3`, [salt, dig, r.rows[0].user_id]);
      await db().query(`DELETE FROM ${T.sessoes} WHERE user_id=$1`, [r.rows[0].user_id]);
      await db().query(`DELETE FROM ${tabelaReset} WHERE user_id=$1`, [r.rows[0].user_id]);
      res.setHeader('Cache-Control', 'no-store'); res.status(201).json({ sucesso: true, usuario: lg, cnpjs: [], senhaRedefinida: true });
    } catch (e) { falha(res, e); }
  });

  // Esqueci minha senha: envia por e-mail um link de uso único (24 h). A resposta é sempre a mesma, exista ou não a conta.
  const tentativasEmail = new Map<string, number[]>();
  if (parte !== 'rotas') app.post('/api/auth/esqueci-senha', ...o, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!emailConfigurado()) { res.status(503).json({ sucesso: false, motivo: 'A recuperação por e-mail ainda não foi ativada neste sistema. Peça ao administrador do escritório para gerar um link de nova senha.' }); return; }
    const lg = String(req.body?.login || '').trim().toLowerCase();
    const resposta = { sucesso: true, mensagem: 'Se este e-mail estiver cadastrado, enviamos um link para criar a nova senha. Confira também a caixa de spam.' };
    const agora = Date.now(); const ip = req.ip || 'x'; const chaves = [`ip:${ip}`, `lg:${lg}`];
    for (const k of chaves) { const l = (tentativasEmail.get(k) || []).filter((t) => agora - t < 15 * 60_000); if (l.length >= (k.startsWith('ip:') ? 10 : 3)) { res.status(429).json({ sucesso: false, motivo: 'Muitas tentativas. Aguarde alguns minutos.' }); return; } l.push(agora); tentativasEmail.set(k, l); }
    if (tentativasEmail.size > 5000) tentativasEmail.clear();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lg) || lg.length > 120) { res.json(resposta); return; }
    try {
      await garantir();
      const u = await db().query(`SELECT id FROM ${T.usuarios} WHERE login=$1 AND disabled=false`, [lg]);
      if (u.rowCount) {
        const token = crypto.randomBytes(32).toString('base64url');
        await db().query(`DELETE FROM ${tabelaReset} WHERE user_id=$1`, [u.rows[0].id]);
        await db().query(`INSERT INTO ${tabelaReset}(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')`, [hash(token), u.rows[0].id]);
        await enviarEmail(lg, 'Murade: criar nova senha', `Olá!\n\nRecebemos um pedido para criar uma nova senha no Murade.\nAbra o link abaixo (vale 24 horas e só pode ser usado uma vez):\n\n${linkConvite(req, token, lg)}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`);
      }
      res.json(resposta);
    } catch (e) { console.error('Falha no envio de recuperação de senha:', e instanceof Error ? e.message : e); res.json(resposta); }
  });

  if (parte === 'redefinir') return;
  // Lista completa: membros (inclusive bloqueados) e convites pendentes.
  app.get('/api/auth/team/detalhes', ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return;
    try {
      await garantir();
      const m = await db().query(`SELECT login, disabled FROM ${T.usuarios} WHERE office_owner=$1 ORDER BY login`, [s.userId]);
      const c = await db().query(`SELECT login, expires_at, (expires_at<=now()) AS vencido FROM ${T.convites} WHERE office_owner=$1 AND expires_at>now()-interval '30 days' ORDER BY created_at DESC`, [s.userId]); // vencidos continuam na lista (30 dias) para poder reenviar
      res.setHeader('Cache-Control', 'no-store');
      res.json({ sucesso: true, membros: m.rows.map((x) => ({ login: x.login, bloqueado: x.disabled === true })), convites: c.rows.map((x) => ({ login: x.login, expiraEm: x.expires_at, vencido: x.vencido === true })) });
    } catch (e) { falha(res, e); }
  });

  // Reenviar: troca o link do convite pendente por um novo (o antigo deixa de valer) e renova por 30 dias.
  app.post('/api/auth/team/:login/reenviar', ...o, ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return;
    try {
      await garantir(); const token = crypto.randomBytes(32).toString('base64url');
      const r = await db().query(`UPDATE ${T.convites} SET token_hash=$1, expires_at=now()+interval '30 days' WHERE login=$2 AND office_owner=$3 RETURNING login`, [hash(token), login(req), s.userId]);
      if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Não há convite pendente para este usuário. Gere um convite novo.' }); return; }
      res.setHeader('Cache-Control', 'no-store'); res.json({ sucesso: true, login: login(req), conviteUrl: linkConvite(req, token, login(req)), expiraEmHoras: 720 });
    } catch (e) { falha(res, e); }
  });

  app.delete('/api/auth/team/:login/convite', ...o, ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return;
    try {
      await garantir();
      const r = await db().query(`DELETE FROM ${T.convites} WHERE login=$1 AND office_owner=$2 RETURNING login`, [login(req), s.userId]);
      if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Convite não encontrado (talvez já tenha sido usado ou cancelado).' }); return; }
      res.json({ sucesso: true, login: login(req) });
    } catch (e) { falha(res, e); }
  });

  // Nova senha: gera link de uso único; a pessoa escolhe a própria senha, e as sessões abertas dela são encerradas ao concluir.
  app.post('/api/auth/team/:login/nova-senha', ...o, ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return;
    try {
      await garantir();
      const u = await db().query(`SELECT id FROM ${T.usuarios} WHERE login=$1 AND office_owner=$2 AND disabled=false`, [login(req), s.userId]);
      if (!u.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Esse usuário não é da sua equipe (ou está bloqueado).' }); return; }
      const token = crypto.randomBytes(32).toString('base64url');
      await db().query(`DELETE FROM ${tabelaReset} WHERE user_id=$1`, [u.rows[0].id]);
      await db().query(`INSERT INTO ${tabelaReset}(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')`, [hash(token), u.rows[0].id]);
      res.setHeader('Cache-Control', 'no-store'); res.status(201).json({ sucesso: true, login: login(req), conviteUrl: linkConvite(req, token, login(req)), expiraEmHoras: 720 });
    } catch (e) { falha(res, e); }
  });

  app.post('/api/auth/team/:login/bloqueio', ...o, ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return; const bloquear = req.body?.bloqueado !== false;
    try {
      await garantir();
      const r = await db().query(`UPDATE ${T.usuarios} SET disabled=$1 WHERE login=$2 AND office_owner=$3 RETURNING id`, [bloquear, login(req), s.userId]);
      if (!r.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Esse usuário não é da sua equipe.' }); return; }
      if (bloquear) await db().query(`DELETE FROM ${T.sessoes} WHERE user_id=$1`, [r.rows[0].id]);
      res.json({ sucesso: true, login: login(req), bloqueado: bloquear });
    } catch (e) { falha(res, e); }
  });

  // Excluir: apaga a conta e os acessos. Se o histórico impedir, a conta fica bloqueada para sempre (nada se perde).
  app.post('/api/auth/team/:login/excluir', ...o, ...mid, async (req, res) => {
    const s = admin(req, res); if (!s) return;
    try {
      await garantir();
      const u = await db().query(`SELECT id FROM ${T.usuarios} WHERE login=$1 AND office_owner=$2 AND id<>$3`, [login(req), s.userId, s.userId]);
      if (!u.rowCount) { res.status(404).json({ sucesso: false, motivo: 'Esse usuário não é da sua equipe.' }); return; }
      const id = u.rows[0].id; const c = await db().connect();
      try {
        await c.query('BEGIN'); await c.query(`DELETE FROM ${T.sessoes} WHERE user_id=$1`, [id]); await c.query(`DELETE FROM ${tabelaReset} WHERE user_id=$1`, [id]);
        await c.query(`DELETE FROM ${T.usuarios} WHERE id=$1`, [id]); await c.query('COMMIT');
        res.json({ sucesso: true, login: login(req), excluido: true });
      } catch {
        await c.query('ROLLBACK').catch(() => undefined);
        await db().query(`UPDATE ${T.usuarios} SET login=left(login,40)||'#removido-'||extract(epoch from now())::bigint::text, disabled=true, office_owner=$2 WHERE id=$1`, [id, s.userId]);
        await db().query(`DELETE FROM ${T.sessoes} WHERE user_id=$1`, [id]);
        res.json({ sucesso: true, login: login(req), excluido: false, bloqueado: true, aviso: 'O histórico impediu apagar a conta por completo; ela ficou sem acesso e o e-mail está livre para um novo cadastro.' });
      } finally { c.release(); }
    } catch (e) { falha(res, e); }
  });
}
