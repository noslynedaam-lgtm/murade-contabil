// Chamados para o supervisor (o dono do sistema) — o mesmo arquivo existe no DP, no Fiscal e no Contábil.
//
// Pedido do Beny (28/11/2026): a Murad disse a uma contadora "vou chamar meu supervisor", mas nada foi registrado e o dono não
// recebeu nada. Regra daqui em diante:
//  1) a Murad NUNCA promete chamar o supervisor sem registrar: se o modelo só escreveu, o servidor registra sozinho (com a pergunta
//     e o contexto: escritório, usuário, sistema, empresa, tela); se não der para registrar, a resposta deixa de prometer;
//  2) o dono é avisado NA HORA: notificação no aparelho (push) + contador "Chamados para o supervisor (N)" na tela;
//  3) o dono responde na tela; a resposta volta para a pessoa como mensagem da Murad na próxima vez que ela abrir o sistema;
//  4) robô conferidor: chamado aberto há mais de 2 horas sem o dono ver → reenvia o aviso (no máximo a cada 2 horas).
//
// Guarda tudo na mesma tabela de registro da Agente IA de cada sistema (dp_ai_agent_log, fiscal_ai_agent_log,
// contabil_ai_agent_log), com event = 'duvida_sem_resposta' (é o que as telas antigas já liam). Colunas novas são criadas sob demanda.
// Isolamento: a lista inteira só o dono do sistema vê (a rota confere); a resposta só volta para o próprio login que perguntou.

import type { Express, RequestHandler } from 'express';

export type ConsultarChamados = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type SistemaChamado = 'DP' | 'Fiscal' | 'Contábil';
export interface AvisoPushChamado { titulo: string; corpo: string; url?: string; tag?: string }

export interface DepsChamados {
  consultar: ConsultarChamados;
  /** Tabela de registro da Agente IA deste sistema. */
  tabela: string;
  sistema: SistemaChamado;
  /** Usuários "dono do sistema" (mesma regra da sessão: MURADE_DONO_SISTEMA ou o primeiro escritório). */
  donos: () => Promise<Array<{ id: string; login: string }>>;
  /** Push do próprio sistema (enviarPush/enviarPushAM/enviarAoUsuario). */
  enviarPush: (userId: string, aviso: AvisoPushChamado) => Promise<unknown>;
  /** Para avisar no aparelho a pessoa que perguntou, quando o dono responde (opcional). */
  idDoLogin?: (login: string) => Promise<string | null>;
}

export interface ContextoChamado {
  escritorio?: string | null;
  tenant?: string | null;
  empresaCnpj?: string | null;
  empresaNome?: string | null;
  tela?: string | null;
  /** 'ferramenta' = a Murad chamou chamar_supervisor; 'automatico' = ela só escreveu e o servidor registrou. */
  origem: 'ferramenta' | 'automatico';
  /** O que a Murad respondeu à pessoa (resumo), para o dono entender a conversa. */
  respostaMurad?: string | null;
}

export interface Chamado {
  id: string; sistema: SistemaChamado; login: string; cnpj: string | null; pergunta: string; contexto: ContextoChamado | null;
  resolvida: boolean; em: string; vistoEm: string | null; avisosEnviados: number; ultimoAvisoEm: string | null; aparelhosAvisados: number;
  resposta: string | null; respondidaEm: string | null; respostaLidaEm: string | null;
}

export const EVENTO_CHAMADO = 'duvida_sem_resposta';
export const HORAS_REENVIO = 2;
export const FRASE_SEM_REGISTRO = 'Não consegui registrar o seu pedido para o meu supervisor agora. Tente de novo daqui a alguns minutos; se continuar, fale direto com o escritório responsável pelo sistema.';

const semAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A resposta da Murad promete chamar/levar ao supervisor? (texto, não ferramenta.)
 * Não confunde com o "supervisor do estágio" (campo do cadastro de estagiário no DP).
 */
export function prometeuSupervisor(texto: string): boolean {
  const t = semAcento(String(texto || ''));
  if (!/\bsupervis(or|ora|ores|ao)\b/.test(t)) return false;
  const semEstagio = t.replace(/(cpf|nome|cargo|dados)\s+d[oa]\s+supervisora?\b/g, ' ').replace(/supervisora?\s+(d[oa]s?|de|na|no)\s+(estagi\w*|concedente|instituicao)/g, ' ').replace(/supervis(or|ora)\s*\(/g, ' ');
  if (!/\bsupervis(or|ora|ores|ao)\b/.test(semEstagio)) return false;
  return /\b(vou|vai|irei|iremos|vamos|levar|levo|levarei|levando|levei|chamar|chamo|chamarei|chamando|chamei|encaminh\w*|repass\w*|avis\w*|pergunt\w*|consult\w*|acion\w*|registr\w*|anot\w*|falar|falo|falarei|passar|passo|passei|enviar|envio|enviei|mandar|mando|mandei)\b/.test(semEstagio);
}

/**
 * Garante a promessa: se a resposta fala em chamar o supervisor e nada foi registrado nesta conversa, registra agora.
 * Se o registro falhar, troca a resposta por uma frase honesta (nunca promete sem registrar).
 */
export async function cumprirPromessaSupervisor(entrada: {
  resposta: string; jaRegistrado: boolean; pergunta: string; cnpj: string | null;
  registrar: (evento: { evento: 'duvida_sem_resposta'; ferramenta: string; cnpj: string | null; resumo: string; resultado?: string }) => Promise<void> | void;
}): Promise<{ resposta: string; registrouAgora: boolean }> {
  if (entrada.jaRegistrado || !prometeuSupervisor(entrada.resposta)) return { resposta: entrada.resposta, registrouAgora: false };
  const pergunta = String(entrada.pergunta || '').replace(/\s+/g, ' ').trim().slice(0, 280) || 'A pessoa pediu algo que a Murad não soube resolver (sem texto da pergunta).';
  try {
    await entrada.registrar({ evento: EVENTO_CHAMADO, ferramenta: 'chamar_supervisor_automatico', cnpj: entrada.cnpj, resumo: pergunta, resultado: `Murad respondeu: ${String(entrada.resposta).replace(/\s+/g, ' ').slice(0, 280)}` });
    return { resposta: entrada.resposta, registrouAgora: true };
  } catch (erro: any) {
    console.error('Chamado para o supervisor não registrado:', erro?.message || erro);
    return { resposta: FRASE_SEM_REGISTRO, registrouAgora: false };
  }
}

function tabelaSegura(nome: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nome)) throw new Error('Nome de tabela inválido.');
  return nome;
}

const preparadas = new Map<string, Promise<void>>();
export function limparPreparoChamadosParaTeste(): void { preparadas.clear(); }

export function prepararChamados(deps: DepsChamados): Promise<void> {
  const t = tabelaSegura(deps.tabela);
  let p = preparadas.get(t);
  if (!p) {
    p = (async () => {
      for (const sql of [
        `CREATE TABLE IF NOT EXISTS ${t} (id bigserial PRIMARY KEY, login text NOT NULL, cnpj text, event text NOT NULL, tool text NOT NULL, summary text NOT NULL, result text, created_at timestamptz NOT NULL DEFAULT now())`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS resolved_at timestamptz`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS context jsonb`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS push_at timestamptz`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS push_count integer NOT NULL DEFAULT 0`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS push_devices integer NOT NULL DEFAULT 0`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS answer text`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS answered_at timestamptz`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS answered_by text`,
        `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS answer_read_at timestamptz`,
        `CREATE INDEX IF NOT EXISTS ${t}_chamados_idx ON ${t}(event, resolved, id DESC)`,
      ]) await deps.consultar(sql);
    })().catch((erro) => { preparadas.delete(t); throw erro; });
    preparadas.set(t, p);
  }
  return p;
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as any).toISOString());
function contextoDe(v: unknown): ContextoChamado | null {
  if (!v) return null;
  if (typeof v === 'object') return v as ContextoChamado;
  try { return JSON.parse(String(v)) as ContextoChamado; } catch { return null; }
}
function paraChamado(sistema: SistemaChamado, row: any): Chamado {
  return {
    id: String(row.id), sistema, login: String(row.login), cnpj: row.cnpj ? String(row.cnpj) : null, pergunta: String(row.summary || ''), contexto: contextoDe(row.context),
    resolvida: row.resolved === true, em: iso(row.created_at) as string, vistoEm: iso(row.owner_seen_at), avisosEnviados: Number(row.push_count || 0), ultimoAvisoEm: iso(row.push_at),
    aparelhosAvisados: Number(row.push_devices || 0), resposta: row.answer == null ? null : String(row.answer), respondidaEm: iso(row.answered_at), respostaLidaEm: iso(row.answer_read_at),
  };
}
const COLUNAS = 'id, login, cnpj, summary, context, resolved, created_at, owner_seen_at, push_at, push_count, push_devices, answer, answered_at, answer_read_at';

function enviadosDe(r: unknown): number {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (typeof o.enviados === 'number') return o.enviados;
  }
  return 0;
}

/** Avisa no aparelho todos os donos do sistema. Nunca lança: o chamado já está guardado e aparece no contador da tela. */
export async function avisarDonos(deps: DepsChamados, chamado: { id: string; login: string; pergunta: string; contexto: ContextoChamado | null }, reenvio = false): Promise<{ donos: number; aparelhos: number }> {
  const t = tabelaSegura(deps.tabela);
  let donos: Array<{ id: string; login: string }> = [];
  try { donos = await deps.donos(); } catch (erro: any) { console.error(`Chamados (${deps.sistema}): não achei o dono do sistema:`, erro?.message || erro); }
  const quem = [chamado.login, chamado.contexto?.escritorio && chamado.contexto.escritorio !== chamado.login ? `escritório ${chamado.contexto.escritorio}` : ''].filter(Boolean).join(' · ');
  const aviso: AvisoPushChamado = {
    titulo: `${reenvio ? 'Ainda aberto — ' : ''}Chamado para o supervisor (${deps.sistema})`,
    corpo: `${quem}: ${chamado.pergunta}`.slice(0, 220),
    url: '/#chamados-supervisor',
    tag: `chamado-supervisor-${deps.sistema}-${chamado.id}`,
  };
  let aparelhos = 0;
  for (const d of donos) {
    try { aparelhos += enviadosDe(await deps.enviarPush(String(d.id), aviso)); }
    catch (erro: any) { console.error(`Chamados (${deps.sistema}): push ao dono falhou:`, erro?.message || erro); }
  }
  try { await deps.consultar(`UPDATE ${t} SET push_at = now(), push_count = push_count + 1, push_devices = $2 WHERE id = $1 RETURNING id`, [Number(chamado.id), aparelhos]); }
  catch (erro: any) { console.error(`Chamados (${deps.sistema}): não gravei o aviso:`, erro?.message || erro); }
  return { donos: donos.length, aparelhos };
}

/**
 * Registra o chamado e avisa o dono. Mesmo pedido da mesma pessoa em 30 minutos (ainda aberto) não duplica.
 * Lança se não conseguir gravar (quem chama decide: a Murad deixa de prometer).
 */
export async function registrarChamado(deps: DepsChamados, entrada: { login: string; cnpj: string | null; pergunta: string; contexto: ContextoChamado }): Promise<{ id: string; novo: boolean; aparelhos: number }> {
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const login = String(entrada.login || '').slice(0, 120);
  const pergunta = String(entrada.pergunta || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!login || !pergunta) throw new Error('Chamado sem usuário ou sem pergunta.');
  const igual = await deps.consultar(`SELECT id FROM ${t} WHERE event = $1 AND login = $2 AND summary = $3 AND resolved = false AND created_at > now() - interval '30 minutes' ORDER BY id DESC LIMIT 1`, [EVENTO_CHAMADO, login, pergunta]);
  if (igual.rows.length) return { id: String(igual.rows[0].id), novo: false, aparelhos: 0 };
  const contexto: ContextoChamado = { ...entrada.contexto, respostaMurad: entrada.contexto.respostaMurad ? String(entrada.contexto.respostaMurad).slice(0, 400) : null, tela: entrada.contexto.tela ? String(entrada.contexto.tela).slice(0, 80) : null };
  const r = await deps.consultar(
    `INSERT INTO ${t} (login, cnpj, event, tool, summary, result, context) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
    [login, entrada.cnpj, EVENTO_CHAMADO, contexto.origem === 'automatico' ? 'chamar_supervisor_automatico' : 'chamar_supervisor', pergunta, contexto.respostaMurad ? contexto.respostaMurad.slice(0, 300) : null, JSON.stringify({ sistema: deps.sistema, ...contexto })],
  );
  const id = String(r.rows[0].id);
  const aviso = await avisarDonos(deps, { id, login, pergunta, contexto });
  return { id, novo: true, aparelhos: aviso.aparelhos };
}

export async function listarChamados(deps: DepsChamados, opcoes: { todas?: boolean } = {}): Promise<Chamado[]> {
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(`SELECT ${COLUNAS} FROM ${t} WHERE event = $1 ${opcoes.todas ? '' : 'AND resolved = false'} ORDER BY id DESC LIMIT 100`, [EVENTO_CHAMADO]);
  return r.rows.map((row) => paraChamado(deps.sistema, row));
}

export async function contarChamados(deps: DepsChamados): Promise<{ abertos: number; novos: number; semResposta: number }> {
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(
    `SELECT count(*) FILTER (WHERE resolved = false) AS abertos, count(*) FILTER (WHERE resolved = false AND owner_seen_at IS NULL) AS novos,
            count(*) FILTER (WHERE resolved = false AND answer IS NULL) AS sem_resposta FROM ${t} WHERE event = $1`, [EVENTO_CHAMADO]);
  const l = r.rows[0] || {};
  return { abertos: Number(l.abertos || 0), novos: Number(l.novos || 0), semResposta: Number(l.sem_resposta || 0) };
}

/** O dono abriu a lista: os chamados abertos passam a "vistos" (o robô para de reenviar o aviso). */
export async function marcarChamadosVistos(deps: DepsChamados): Promise<number> {
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(`UPDATE ${t} SET owner_seen_at = now() WHERE event = $1 AND resolved = false AND owner_seen_at IS NULL RETURNING id`, [EVENTO_CHAMADO]);
  return r.rows.length;
}

export async function responderChamado(deps: DepsChamados, id: number, resposta: string, porLogin: string): Promise<{ ok: boolean; motivo?: string; avisouAparelho?: number }> {
  const texto = String(resposta || '').trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, motivo: 'Chamado inválido.' };
  if (texto.length < 2) return { ok: false, motivo: 'Escreva a resposta.' };
  if (texto.length > 2000) return { ok: false, motivo: 'Resposta muito longa (até 2.000 letras).' };
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(
    `UPDATE ${t} SET answer = $2, answered_at = now(), answered_by = $3, answer_read_at = NULL, owner_seen_at = COALESCE(owner_seen_at, now()) WHERE id = $1 AND event = $4 RETURNING login, summary`,
    [id, texto, String(porLogin || '').slice(0, 120), EVENTO_CHAMADO],
  );
  if (!r.rows.length) return { ok: false, motivo: 'Chamado não encontrado.' };
  let avisouAparelho = 0;
  if (deps.idDoLogin) {
    try {
      const userId = await deps.idDoLogin(String(r.rows[0].login));
      if (userId) avisouAparelho = enviadosDe(await deps.enviarPush(userId, { titulo: 'A Murad tem uma resposta para você', corpo: `Sobre: ${String(r.rows[0].summary).slice(0, 120)}`, url: '/', tag: `resposta-supervisor-${deps.sistema}-${id}` }));
    } catch (erro: any) { console.error(`Chamados (${deps.sistema}): aviso da resposta falhou:`, erro?.message || erro); }
  }
  return { ok: true, avisouAparelho };
}

export async function resolverChamado(deps: DepsChamados, id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(`UPDATE ${t} SET resolved = true, resolved_at = now(), owner_seen_at = COALESCE(owner_seen_at, now()) WHERE id = $1 AND event = $2 RETURNING id`, [id, EVENTO_CHAMADO]);
  return r.rows.length > 0;
}

/** Respostas do supervisor que a pessoa ainda não leu (só dela: mesmo login). */
export async function respostasParaUsuario(deps: DepsChamados, login: string): Promise<Array<{ id: string; pergunta: string; resposta: string; respondidaEm: string }>> {
  if (!login) return [];
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(`SELECT id, summary, answer, answered_at FROM ${t} WHERE event = $1 AND lower(login) = lower($2) AND answer IS NOT NULL AND answer_read_at IS NULL ORDER BY answered_at LIMIT 10`, [EVENTO_CHAMADO, login]);
  return r.rows.map((row) => ({ id: String(row.id), pergunta: String(row.summary), resposta: String(row.answer), respondidaEm: iso(row.answered_at) as string }));
}

export async function marcarRespostaLida(deps: DepsChamados, login: string, id: number): Promise<boolean> {
  if (!login || !Number.isInteger(id) || id <= 0) return false;
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const r = await deps.consultar(`UPDATE ${t} SET answer_read_at = now() WHERE id = $1 AND event = $2 AND lower(login) = lower($3) AND answer IS NOT NULL RETURNING id`, [id, EVENTO_CHAMADO, login]);
  return r.rows.length > 0;
}

/**
 * Robô conferidor dos chamados: chamado aberto há mais de 2 horas que o dono ainda não viu → reenvia o aviso
 * (no máximo um reenvio a cada 2 horas por chamado). Devolve o resumo para o painel dos robôs.
 */
export async function conferirChamados(deps: DepsChamados, horas = HORAS_REENVIO): Promise<{ abertos: number; semVer: number; reenviados: number; semAparelho: number; respostasNaoLidas: number; resumo: string; alerta: string | null }> {
  await prepararChamados(deps);
  const t = tabelaSegura(deps.tabela);
  const h = Math.max(1, Math.min(48, Math.round(horas)));
  const atrasados = await deps.consultar(
    `SELECT id, login, summary, context FROM ${t} WHERE event = $1 AND resolved = false AND owner_seen_at IS NULL
       AND created_at < now() - make_interval(hours => $2::int) AND (push_at IS NULL OR push_at < now() - make_interval(hours => $2::int)) ORDER BY id LIMIT 50`,
    [EVENTO_CHAMADO, h],
  );
  let reenviados = 0; let semAparelho = 0;
  for (const row of atrasados.rows) {
    const r = await avisarDonos(deps, { id: String(row.id), login: String(row.login), pergunta: String(row.summary), contexto: contextoDe(row.context) }, true);
    reenviados += 1; if (!r.aparelhos) semAparelho += 1;
  }
  const c = await contarChamados(deps);
  const lidas = await deps.consultar(`SELECT count(*) AS n FROM ${t} WHERE event = $1 AND answer IS NOT NULL AND answer_read_at IS NULL`, [EVENTO_CHAMADO]);
  const respostasNaoLidas = Number(lidas.rows[0]?.n || 0);
  const resumo = `${c.abertos} chamado(s) para o supervisor em aberto no ${deps.sistema}; ${c.novos} ainda não visto(s) pelo dono; ${reenviados} aviso(s) reenviado(s) (aberto há mais de ${h} h sem o dono ver)${semAparelho ? `; ${semAparelho} sem aparelho do dono com aviso ligado neste sistema` : ''}; ${respostasNaoLidas} resposta(s) do dono esperando a pessoa abrir o sistema.`;
  const alerta = semAparelho ? `Há chamado para o supervisor aberto há mais de ${h} h e nenhum aparelho do dono recebeu o aviso no ${deps.sistema}. Abra "Chamados para o supervisor" e ligue os avisos neste aparelho.` : null;
  return { abertos: c.abertos, semVer: c.novos, reenviados, semAparelho, respostasNaoLidas, resumo, alerta };
}

// ------------------------------------------------------------------------------------------------ rotas (iguais nos 3 sistemas)
type Manipulador = RequestHandler;
export interface ConfigRotasChamados {
  deps: DepsChamados;
  /** Sessão de quem chamou (login + se é o dono do sistema); null = sem sessão. */
  sessao: (req: any) => Promise<{ login: string; donoSistema: boolean } | null> | { login: string; donoSistema: boolean } | null;
  /** Middlewares das rotas de leitura (GET) e de gravação (POST) — os mesmos que o sistema já usa. */
  leitura?: Manipulador[];
  gravacao?: Manipulador[];
  bancoConfigurado: () => boolean;
}

/**
 * GET  /api/auth/duvidas-supervisor             (dono) lista; ?todas=1 inclui as resolvidas
 * GET  /api/auth/duvidas-supervisor/contagem    (qualquer sessão) dono:true + números; quem não é dono recebe dono:false
 * POST /api/auth/duvidas-supervisor/vistos      (dono) marca os abertos como vistos (o robô para de reenviar)
 * POST /api/auth/duvidas-supervisor/:id/responder {resposta}  (dono)
 * POST /api/auth/duvidas-supervisor/:id/resolver (dono)
 * GET  /api/ai/agente/respostas-supervisor      (a própria pessoa) respostas ainda não lidas
 * POST /api/ai/agente/respostas-supervisor/:id/lida
 */
export function registrarRotasChamados(app: Express, cfg: ConfigRotasChamados): void {
  const leitura = cfg.leitura || []; const gravacao = cfg.gravacao || [];
  const semCache = (res: any) => res.setHeader('Cache-Control', 'no-store');
  const dono = async (req: any, res: any): Promise<{ login: string } | null> => {
    const s = await cfg.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre novamente para continuar.' }); return null; }
    if (!s.donoSistema) { res.status(403).json({ sucesso: false, motivo: 'Somente o dono do sistema vê os chamados para o supervisor.' }); return null; }
    return s;
  };
  const falha = (res: any, erro: any) => { console.error(`Chamados (${cfg.deps.sistema}):`, erro?.message || erro); res.status(503).json({ sucesso: false, motivo: 'Não foi possível concluir agora. Tente de novo em instantes.' }); };

  app.get('/api/auth/duvidas-supervisor/contagem', ...leitura, async (req: any, res: any) => {
    semCache(res);
    try {
      const s = await cfg.sessao(req);
      if (!s) { res.status(401).json({ sucesso: false }); return; }
      if (!s.donoSistema) { res.json({ sucesso: true, dono: false }); return; }
      if (!cfg.bancoConfigurado()) { res.json({ sucesso: true, dono: true, sistema: cfg.deps.sistema, abertos: 0, novos: 0, semResposta: 0 }); return; }
      res.json({ sucesso: true, dono: true, sistema: cfg.deps.sistema, ...(await contarChamados(cfg.deps)) });
    } catch (e) { falha(res, e); }
  });
  app.get('/api/auth/duvidas-supervisor', ...leitura, async (req: any, res: any) => {
    semCache(res);
    if (!await dono(req, res)) return;
    if (!cfg.bancoConfigurado()) { res.json({ sucesso: true, sistema: cfg.deps.sistema, duvidas: [] }); return; }
    try { res.json({ sucesso: true, sistema: cfg.deps.sistema, duvidas: await listarChamados(cfg.deps, { todas: String(req.query?.todas || '') === '1' }) }); } catch (e) { falha(res, e); }
  });
  app.post('/api/auth/duvidas-supervisor/vistos', ...gravacao, async (req: any, res: any) => {
    semCache(res);
    if (!await dono(req, res)) return;
    try { res.json({ sucesso: true, vistos: cfg.bancoConfigurado() ? await marcarChamadosVistos(cfg.deps) : 0 }); } catch (e) { falha(res, e); }
  });
  app.post('/api/auth/duvidas-supervisor/:id/responder', ...gravacao, async (req: any, res: any) => {
    semCache(res);
    const s = await dono(req, res); if (!s) return;
    try {
      const r = await responderChamado(cfg.deps, Number(req.params?.id), String(req.body?.resposta || ''), s.login);
      if (!r.ok) { res.status(r.motivo === 'Chamado não encontrado.' ? 404 : 400).json({ sucesso: false, motivo: r.motivo }); return; }
      res.json({ sucesso: true, avisouAparelho: r.avisouAparelho || 0 });
    } catch (e) { falha(res, e); }
  });
  app.post('/api/auth/duvidas-supervisor/:id/resolver', ...gravacao, async (req: any, res: any) => {
    semCache(res);
    if (!await dono(req, res)) return;
    const id = Number(req.params?.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ sucesso: false, motivo: 'Id inválido.' }); return; }
    try { const ok = await resolverChamado(cfg.deps, id); if (!ok) { res.status(404).json({ sucesso: false, motivo: 'Chamado não encontrado.' }); return; } res.json({ sucesso: true }); } catch (e) { falha(res, e); }
  });
  app.get('/api/ai/agente/respostas-supervisor', ...leitura, async (req: any, res: any) => {
    semCache(res);
    const s = await cfg.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false }); return; }
    if (!cfg.bancoConfigurado()) { res.json({ sucesso: true, respostas: [] }); return; }
    try { res.json({ sucesso: true, respostas: await respostasParaUsuario(cfg.deps, s.login) }); } catch (e) { falha(res, e); }
  });
  app.post('/api/ai/agente/respostas-supervisor/:id/lida', ...gravacao, async (req: any, res: any) => {
    semCache(res);
    const s = await cfg.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false }); return; }
    try { res.json({ sucesso: true, marcada: await marcarRespostaLida(cfg.deps, s.login, Number(req.params?.id)) }); } catch (e) { falha(res, e); }
  });
}
