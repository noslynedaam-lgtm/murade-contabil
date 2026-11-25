// TESTE GRÁTIS — lado deste sistema (mesmo arquivo no Fiscal e no Contábil, só muda o prefixo das tabelas).
//
// O DP é a fonte da verdade do teste: quando alguém se cadastra pelo site, o DP chama a rota protegida de integração
// daqui (Bearer MURADE_INTEGRATION_TOKEN) e este sistema cria o escritório do mesmo jeito do convite do dono
// (administrador do escritório, tenant_id = id), com a MESMA senha (o DP manda só o resultado embaralhado — scrypt com
// os mesmos parâmetros dos três sistemas —, nunca a senha). Aqui ficam as travas do teste deste sistema:
// limite de empresas, "teste encerrado" (só leitura), Serpro desligado e a faixa "Teste grátis: faltam X dias".
import crypto from 'node:crypto';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type SituacaoLocal = 'ativo' | 'encerrado' | 'convertido';
/** Prefixo das tabelas de acesso deste sistema: 'murade_fiscal' (Fiscal) ou 'contabil' (Contábil). */
export type Prefixo = 'murade_fiscal' | 'contabil';

export const MSG_LIMITE_EMPRESAS = (n: number) => `No teste grátis dá para usar até ${n} empresa${n === 1 ? '' : 's'}. Para mais, fale com a gente para contratar.`;
export const MSG_ENCERRADO = 'Seu teste grátis terminou. Seus dados estão guardados e dá para ver e baixar tudo, mas para cadastrar, calcular ou transmitir é preciso contratar. Fale com a gente para continuar.';
export const MSG_SERPRO_TESTE = 'No teste grátis as consultas pagas ao Serpro (Receita) ficam desligadas. Para usar, fale com a gente para contratar.';

export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
export function diasRestantes(fim: string, agora: Date = new Date()): number {
  return Math.round((Date.parse(`${fim.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hojeSP(agora)}T00:00:00Z`)) / 86_400_000) + 1;
}
export function situacaoEfetiva(situacao: SituacaoLocal, fim: string | null, agora: Date = new Date()): SituacaoLocal {
  return situacao === 'ativo' && fim && diasRestantes(fim, agora) <= 0 ? 'encerrado' : situacao;
}
const dataTexto = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);

const tabelas = (p: Prefixo) => ({ usuarios: `${p}_auth_users`, acesso: `${p}_auth_company_access`, sessoes: `${p}_auth_sessions`, teste: `${p}_teste_gratis`, entradas: `${p}_teste_gratis_entradas` });

const prontas = new Map<string, Promise<void>>();
export function prepararTesteLocal(c: Consultar, p: Prefixo): Promise<void> {
  const chave = p; let pr = prontas.get(chave);
  if (!pr) {
    const t = tabelas(p);
    pr = (async () => {
      await c(`CREATE TABLE IF NOT EXISTS ${t.teste} (escritorio_id text PRIMARY KEY, login text NOT NULL, situacao text NOT NULL, fim text,
        limite_empresas integer NOT NULL DEFAULT 2, serpro boolean NOT NULL DEFAULT false, atualizado_em timestamptz NOT NULL DEFAULT now())`);
      await c(`CREATE TABLE IF NOT EXISTS ${t.entradas} (token_hash text PRIMARY KEY, user_id text NOT NULL, expira_em timestamptz NOT NULL, usado_em timestamptz)`);
    })().catch((e) => { prontas.delete(chave); throw e; });
    prontas.set(chave, pr);
  }
  return pr;
}
/** Só para os testes automatizados (banco novo a cada teste). */
export function esquecerPreparoTesteLocal(): void { prontas.clear(); cache.clear(); }

// ------------------------------------------------------------------ cache curto (60 s) dos escritórios em teste
type Info = { situacao: SituacaoLocal; fim: string | null; limite: number; serpro: boolean; login: string };
const cache = new Map<Prefixo, { em: number; mapa: Map<string, Info> }>();
export function limparCacheTesteLocal(p: Prefixo): void { cache.delete(p); }
async function mapa(c: Consultar, p: Prefixo): Promise<Map<string, Info>> {
  const atual = cache.get(p);
  if (atual && Date.now() - atual.em < 60_000) return atual.mapa;
  await prepararTesteLocal(c, p);
  const r = await c(`SELECT escritorio_id, login, situacao, fim, limite_empresas, serpro FROM ${tabelas(p).teste} WHERE situacao IN ('ativo','encerrado')`);
  const m = new Map<string, Info>(r.rows.map((x) => [String(x.escritorio_id), { situacao: String(x.situacao) as SituacaoLocal, fim: x.fim ? dataTexto(x.fim) : null, limite: Number(x.limite_empresas), serpro: x.serpro === true, login: String(x.login) }]));
  cache.set(p, { em: Date.now(), mapa: m });
  return m;
}

// ------------------------------------------------------------------ entrada de uso único (2 minutos)
export async function criarEntradaLocal(c: Consultar, p: Prefixo, userId: string): Promise<string> {
  await prepararTesteLocal(c, p);
  const t = tabelas(p);
  await c(`DELETE FROM ${t.entradas} WHERE expira_em < now() - interval '1 day'`).catch(() => undefined);
  const token = crypto.randomBytes(32).toString('base64url');
  await c(`INSERT INTO ${t.entradas} (token_hash, user_id, expira_em) VALUES ($1,$2, now() + interval '120 seconds')`, [crypto.createHash('sha256').update(token).digest('hex'), userId]);
  return token;
}
export async function trocarEntradaLocal(c: Consultar, p: Prefixo, token: unknown): Promise<string | null> {
  const s = String(token ?? '');
  if (!s || s.length > 128) return null;
  await prepararTesteLocal(c, p);
  const r = await c(`UPDATE ${tabelas(p).entradas} SET usado_em=now() WHERE token_hash=$1 AND usado_em IS NULL AND expira_em > now() RETURNING user_id`, [crypto.createHash('sha256').update(s).digest('hex')]);
  return r.rows[0] ? String(r.rows[0].user_id) : null;
}

// ------------------------------------------------------------------ rota de integração (DP → este sistema)
const LOGIN = /^[a-z0-9._@+-]{3,80}$/;
function blocoTeste(v: any): { situacao: SituacaoLocal; fim: string | null; limiteEmpresas: number; serpro: boolean } | null {
  const situacao = ['ativo', 'encerrado', 'convertido'].includes(String(v?.situacao)) ? String(v.situacao) as SituacaoLocal : null;
  const fim = v?.fim == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v.fim)) ? String(v.fim) : 'x';
  const limite = Number(v?.limiteEmpresas);
  if (!situacao || fim === 'x' || !Number.isInteger(limite) || limite < 1 || limite > 1000) return null;
  return { situacao, fim, limiteEmpresas: limite, serpro: v?.serpro === true };
}
async function gravarTeste(c: Consultar, p: Prefixo, escritorioId: string, login: string, b: NonNullable<ReturnType<typeof blocoTeste>>): Promise<void> {
  const t = tabelas(p);
  if (b.situacao === 'convertido') { await c(`DELETE FROM ${t.teste} WHERE escritorio_id=$1`, [escritorioId]); limparCacheTesteLocal(p); return; }
  const existe = (await c(`SELECT 1 FROM ${t.teste} WHERE escritorio_id=$1`, [escritorioId])).rows.length > 0;
  if (existe) await c(`UPDATE ${t.teste} SET login=$2, situacao=$3, fim=$4, limite_empresas=$5, serpro=$6, atualizado_em=now() WHERE escritorio_id=$1`, [escritorioId, login, b.situacao, b.fim, b.limiteEmpresas, b.serpro]);
  else await c(`INSERT INTO ${t.teste} (escritorio_id, login, situacao, fim, limite_empresas, serpro) VALUES ($1,$2,$3,$4,$5,$6)`, [escritorioId, login, b.situacao, b.fim, b.limiteEmpresas, b.serpro]);
  limparCacheTesteLocal(p);
}
async function donoDoEscritorio(c: Consultar, p: Prefixo, login: string): Promise<{ id: string } | null> {
  const r = await c(`SELECT id FROM ${tabelas(p).usuarios} WHERE lower(login)=$1 AND global_admin=true AND (tenant_id IS NULL OR tenant_id::text=id::text)`, [login]);
  return r.rows[0] ? { id: String(r.rows[0].id) } : null;
}

/** Corpo: { acao: 'criar'|'situacao'|'contar'|'entrada'|'remover', login, ... }. Devolve status + corpo para a rota. */
export async function receberIntegracaoTeste(c: Consultar, p: Prefixo, corpo: any): Promise<{ status: number; corpo: Record<string, unknown> }> {
  await prepararTesteLocal(c, p);
  const t = tabelas(p);
  const acao = String(corpo?.acao || ''); const login = String(corpo?.login || '').trim().toLowerCase();
  if (!LOGIN.test(login)) return { status: 400, corpo: { sucesso: false, motivo: 'Login inválido.' } };
  if (acao === 'criar') {
    const salt = String(corpo?.salt || ''); const hash = String(corpo?.hash || '');
    const b = blocoTeste(corpo?.teste); const limUsuarios = Number(corpo?.limiteUsuarios ?? 2);
    if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(hash) || !b || !Number.isInteger(limUsuarios) || limUsuarios < 1 || limUsuarios > 1000) return { status: 400, corpo: { sucesso: false, motivo: 'Dados do teste incompletos.' } };
    const existente = (await c(`SELECT id, global_admin, tenant_id FROM ${t.usuarios} WHERE lower(login)=$1`, [login])).rows[0];
    let id: string;
    if (existente) {
      const jaTeste = (await c(`SELECT 1 FROM ${t.teste} WHERE escritorio_id=$1`, [String(existente.id)])).rows.length > 0;
      // Conta que já existia por outro caminho (cliente, equipe): nunca muda senha nem vira teste.
      if (!jaTeste) return { status: 200, corpo: { sucesso: true, jaExistia: true } };
      id = String(existente.id);
    } else {
      id = crypto.randomUUID();
      await c(`INSERT INTO ${t.usuarios} (id, login, password_salt, password_hash, office_owner, global_admin, tenant_id, max_usuarios) VALUES ($1,$2,$3,$4,NULL,true,$1,$5)`, [id, login, salt, hash, limUsuarios]);
    }
    await gravarTeste(c, p, id, login, b);
    const entrada = corpo?.entrada === true ? await criarEntradaLocal(c, p, id) : undefined;
    return { status: existente ? 200 : 201, corpo: { sucesso: true, jaExistia: false, ...(entrada ? { entrada } : {}) } };
  }
  const dono = await donoDoEscritorio(c, p, login);
  if (!dono) return { status: 404, corpo: { sucesso: false, motivo: 'Não há escritório com este login aqui.' } };
  if (acao === 'situacao') {
    const b = blocoTeste(corpo?.teste); if (!b) return { status: 400, corpo: { sucesso: false, motivo: 'Situação do teste inválida.' } };
    const temTeste = (await c(`SELECT 1 FROM ${t.teste} WHERE escritorio_id=$1`, [dono.id])).rows.length > 0;
    if (!temTeste) return { status: 200, corpo: { sucesso: true, mensagem: 'Este escritório não está em teste aqui (nada mudou).' } };
    await gravarTeste(c, p, dono.id, login, b);
    if (b.situacao === 'convertido' && corpo?.limiteUsuarios !== undefined) {
      const lim = corpo.limiteUsuarios === null ? null : Number(corpo.limiteUsuarios);
      if (lim === null || (Number.isInteger(lim) && lim >= 1 && lim <= 1000)) await c(`UPDATE ${t.usuarios} SET max_usuarios=$2 WHERE id::text=$1`, [dono.id, lim]);
    }
    if (b.situacao === 'encerrado') await c(`DELETE FROM ${t.entradas} WHERE user_id=$1`, [dono.id]).catch(() => undefined);
    return { status: 200, corpo: { sucesso: true, mensagem: b.situacao === 'convertido' ? 'Agora é cliente.' : b.situacao === 'encerrado' ? 'Teste encerrado (só leitura).' : 'Teste atualizado.' } };
  }
  if (acao === 'contar') {
    const n = Number((await c(`SELECT count(DISTINCT cnpj)::int AS n FROM ${t.acesso} WHERE user_id::text=$1`, [dono.id])).rows[0]?.n || 0);
    return { status: 200, corpo: { sucesso: true, empresas: n } };
  }
  if (acao === 'entrada') {
    const teste = (await c(`SELECT situacao FROM ${t.teste} WHERE escritorio_id=$1`, [dono.id])).rows[0];
    if (!teste) return { status: 409, corpo: { sucesso: false, motivo: 'Este escritório não está em teste.' } };
    return { status: 200, corpo: { sucesso: true, entrada: await criarEntradaLocal(c, p, dono.id) } };
  }
  if (acao === 'remover') {
    const teste = (await c(`SELECT 1 FROM ${t.teste} WHERE escritorio_id=$1`, [dono.id])).rows.length > 0;
    if (!teste) return { status: 409, corpo: { sucesso: false, motivo: 'Este escritório não é um teste grátis aqui; não excluí.' } };
    const empresas = Number((await c(`SELECT count(*)::int AS n FROM ${t.acesso} WHERE user_id::text=$1`, [dono.id])).rows[0]?.n || 0);
    const equipe = Number((await c(`SELECT count(*)::int AS n FROM ${t.usuarios} WHERE tenant_id::text=$1 AND id::text<>$1`, [dono.id])).rows[0]?.n || 0);
    if (empresas || equipe) return { status: 409, corpo: { sucesso: false, motivo: `O escritório tem ${empresas} empresa(s) e ${equipe} pessoa(s) da equipe aqui; não excluí.` } };
    await c(`DELETE FROM ${t.sessoes} WHERE user_id::text=$1`, [dono.id]).catch(() => undefined);
    await c(`DELETE FROM ${t.entradas} WHERE user_id=$1`, [dono.id]).catch(() => undefined);
    await c(`DELETE FROM ${t.teste} WHERE escritorio_id=$1`, [dono.id]);
    try { await c(`DELETE FROM ${t.usuarios} WHERE id::text=$1`, [dono.id]); }
    catch { await c(`UPDATE ${t.usuarios} SET login=left(login,40)||'#removido-'||extract(epoch from now())::bigint::text, disabled=true WHERE id::text=$1`, [dono.id]); }
    limparCacheTesteLocal(p);
    return { status: 200, corpo: { sucesso: true, mensagem: 'Conta do teste excluída; o e-mail fica livre.' } };
  }
  return { status: 400, corpo: { sucesso: false, motivo: 'Ação desconhecida.' } };
}

// ------------------------------------------------------------------ travas e faixa
export interface SituacaoLocalEscritorio { emTeste: boolean; situacao?: SituacaoLocal; fim?: string; diasRestantes?: number; limiteEmpresas?: number; empresasUsadas?: number; serpro?: boolean; mensagem?: string }

export async function situacaoLocal(c: Consultar, p: Prefixo, escritorioId: string | null | undefined, agora = new Date()): Promise<SituacaoLocalEscritorio> {
  if (!escritorioId) return { emTeste: false };
  const m = (await mapa(c, p)).get(String(escritorioId));
  if (!m) return { emTeste: false };
  const situacao = situacaoEfetiva(m.situacao, m.fim, agora);
  const empresas = Number((await c(`SELECT count(DISTINCT cnpj)::int AS n FROM ${tabelas(p).acesso} WHERE user_id::text=$1`, [String(escritorioId)])).rows[0]?.n || 0);
  const dias = m.fim ? Math.max(0, diasRestantes(m.fim, agora)) : 0;
  return { emTeste: true, situacao, fim: m.fim || undefined, diasRestantes: dias, limiteEmpresas: m.limite, empresasUsadas: empresas, serpro: m.serpro,
    mensagem: situacao === 'encerrado' ? MSG_ENCERRADO : `Teste grátis: falta${dias === 1 ? '' : 'm'} ${dias} dia${dias === 1 ? '' : 's'}` };
}

export async function checarLimiteLocal(c: Consultar, p: Prefixo, escritorioId: string | null | undefined, cnpj: string, agora = new Date()): Promise<string | null> {
  if (!escritorioId) return null;
  const m = (await mapa(c, p)).get(String(escritorioId));
  if (!m) return null;
  if (situacaoEfetiva(m.situacao, m.fim, agora) === 'encerrado') return MSG_ENCERRADO;
  const r = await c(`SELECT DISTINCT cnpj FROM ${tabelas(p).acesso} WHERE user_id::text=$1`, [String(escritorioId)]);
  const cnpjs = r.rows.map((x) => String(x.cnpj).trim());
  if (cnpjs.includes(String(cnpj).trim())) return null;
  return cnpjs.length >= m.limite ? MSG_LIMITE_EMPRESAS(m.limite) : null;
}

const LIVRES_NO_ENCERRADO = /^(POST|PUT|DELETE|PATCH) \/api\/(auth\/(logout|login|presenca|manter-conectado|2fa|password|session)|teste-gratis\/|fiscal\/meu-jeito\/|meu-jeito\/|ai\/agente$|ai\/agente\/(saudacao|nome|recusar)$|ai\/chat$|apresentacao|fiscal\/backups?|backups?\/|contabil\/backups?)/;
export async function travaEncerradoLocal(c: Consultar, p: Prefixo, escritorioId: string | null | undefined, metodo: string, caminho: string, agora = new Date()): Promise<string | null> {
  if (!escritorioId || ['GET', 'HEAD', 'OPTIONS'].includes(metodo.toUpperCase())) return null;
  const m = (await mapa(c, p)).get(String(escritorioId));
  if (!m || situacaoEfetiva(m.situacao, m.fim, agora) !== 'encerrado') return null;
  return LIVRES_NO_ENCERRADO.test(`${metodo.toUpperCase()} ${caminho}`) ? null : MSG_ENCERRADO;
}

/** Serpro no teste: desligado, a menos que o dono tenha ligado no quadro "Teste grátis" do DP. Escritório fora de teste: não decide (false). */
export async function serproBloqueadoNoTeste(c: Consultar, p: Prefixo, escritorioId: string | null | undefined): Promise<boolean> {
  if (!escritorioId) return false;
  const m = (await mapa(c, p)).get(String(escritorioId));
  return Boolean(m) && (m!.serpro !== true || m!.situacao === 'encerrado');
}

/** Empresas dos escritórios com teste encerrado (os robôs que transmitem pulam estas). */
export async function cnpjsEncerradosLocal(c: Consultar, p: Prefixo, agora = new Date()): Promise<Set<string>> {
  const ids = [...(await mapa(c, p)).entries()].filter(([, m]) => situacaoEfetiva(m.situacao, m.fim, agora) === 'encerrado').map(([id]) => id);
  if (!ids.length) return new Set();
  const r = await c(`SELECT DISTINCT cnpj FROM ${tabelas(p).acesso} WHERE user_id::text = ANY($1::text[])`, [ids]);
  return new Set(r.rows.map((x) => String(x.cnpj).trim()));
}
