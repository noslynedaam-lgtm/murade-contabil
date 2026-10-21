import type { NextFunction, Request, Response } from 'express';

// Registro de atividade da equipe do escritório: quem fez qual alteração, quando e em qual empresa.
// Guarda só metadados (usuário, ação, rota, CNPJ, resultado). Nunca guarda o conteúdo enviado.
// Falhar ao registrar nunca derruba a requisição do usuário.
export type SessaoAtividade = { userId: string; login: string; tenantId?: string; escritorioDe?: string };
export type DependenciasAtividade = {
  consultar: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
  tabela: string;
  sessao: (req: Request) => SessaoAtividade | undefined;
  podeVer: (req: Request) => boolean;
};

const IGNORAR = [/^\/api\/auth\/(login|logout|session|status|bootstrap|redeem|tenants|atividade)/, /^\/api\/integracao\//, /^\/api\/health/, /^\/api\/robos/];
const ROTULOS: Array<[RegExp, string]> = [
  [/auth\/team\/invite/, 'Convidou funcionário para a equipe'], [/auth\/team/, 'Alterou a equipe do escritório'],
  [/ai\/agente\/confirmar/, 'Confirmou uma ação sugerida pela IA'], [/ai\/agente\/recusar/, 'Recusou uma ação sugerida pela IA'],
  [/esocial/, 'Movimentou eSocial'], [/folha|payroll/, 'Alterou folha de pagamento'], [/funcionario|employee/, 'Alterou cadastro de funcionário'],
  [/guia|guide/, 'Alterou guia'], [/certificado/, 'Alterou certificado digital'], [/lancamento|journal|partida/, 'Alterou lançamento contábil'],
  [/nfe|nota|documento/, 'Movimentou documento fiscal'], [/empresa|company|workspace/, 'Alterou cadastro de empresa'],
  [/acesso|access/, 'Alterou acessos'], [/fechamento|closure|periodo/, 'Alterou fechamento de período'],
];
const VERBO: Record<string, string> = { POST: 'Registrou', PUT: 'Alterou', PATCH: 'Alterou', DELETE: 'Removeu' };

export function descreverAcao(metodo: string, rota: string): string {
  const achado = ROTULOS.find(([re]) => re.test(rota.toLowerCase()));
  if (achado) return metodo === 'DELETE' ? achado[1].replace(/^(Alterou|Movimentou)/, 'Removeu em') : achado[1];
  return `${VERBO[metodo] || 'Alterou'} dados (${rota.replace(/^\/api\//, '').slice(0, 80)})`;
}

function cnpjDaRequisicao(req: Request): string | null {
  const bruto = (req.body && typeof req.body === 'object' ? (req.body as any).cnpj : undefined) ?? (req.params as any)?.cnpj ?? (req.query as any)?.cnpj;
  const limpo = typeof bruto === 'string' ? bruto.replace(/[^0-9A-Za-z]/g, '').toUpperCase() : '';
  return limpo.length === 14 ? limpo : null;
}

export function criarAtividadeEscritorio(deps: DependenciasAtividade) {
  let pronta: Promise<void> | null = null;
  const garantirTabela = () => {
    pronta ??= deps.consultar(`
      CREATE TABLE IF NOT EXISTS ${deps.tabela} (
        id bigserial PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL, login text NOT NULL,
        metodo text NOT NULL, rota text NOT NULL, acao text NOT NULL, cnpj text, status integer NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ${deps.tabela}_tenant_idx ON ${deps.tabela}(tenant_id, id DESC);
    `).then(() => undefined).catch((erro) => { pronta = null; throw erro; });
    return pronta;
  };

  const registrar = (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    res.on('finish', () => {
      void (async () => {
        try {
          if (res.statusCode >= 400) return;
          const rota = req.originalUrl.split('?')[0];
          if (IGNORAR.some((re) => re.test(rota))) return;
          const sessao = deps.sessao(req);
          if (!sessao) return;
          const tenant = sessao.tenantId || sessao.escritorioDe || sessao.userId;
          await garantirTabela();
          await deps.consultar(
            `INSERT INTO ${deps.tabela}(tenant_id,user_id,login,metodo,rota,acao,cnpj,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [tenant, sessao.userId, sessao.login, req.method, rota.slice(0, 200), descreverAcao(req.method, rota), cnpjDaRequisicao(req), res.statusCode],
          );
          if (Math.random() < 0.01) await deps.consultar(`DELETE FROM ${deps.tabela} WHERE criado_em < now() - interval '180 days'`);
        } catch (erro) { console.error('Atividade da equipe não registrada:', erro instanceof Error ? erro.message : erro); }
      })();
    });
    next();
  };

  const listar = async (req: Request, res: Response) => {
    const sessao = deps.sessao(req);
    if (!sessao || !deps.podeVer(req)) { res.status(403).json({ sucesso: false, motivo: 'Somente o responsável do escritório consulta a atividade da equipe.' }); return; }
    const tenant = sessao.tenantId || sessao.escritorioDe || sessao.userId;
    const usuario = typeof req.query.usuario === 'string' ? req.query.usuario.trim().toLowerCase() : '';
    const limite = Math.max(1, Math.min(200, Number(req.query.limite) || 100));
    try {
      await garantirTabela();
      const r = await deps.consultar(
        `SELECT login, acao, cnpj, criado_em FROM ${deps.tabela} WHERE tenant_id=$1 AND ($2='' OR login=$2) ORDER BY id DESC LIMIT $3`,
        [tenant, usuario, limite],
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ sucesso: true, atividades: r.rows.map((x) => ({ usuario: String(x.login), acao: String(x.acao), cnpj: x.cnpj ? String(x.cnpj) : null, quando: new Date(x.criado_em).toISOString() })) });
    } catch { res.status(503).json({ sucesso: false, motivo: 'Não foi possível carregar a atividade da equipe.' }); }
  };

  return { registrar, listar };
}
