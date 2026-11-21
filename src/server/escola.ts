// ESCOLA MURADE (Murade Contábil) — servidor: liberação do adicional pago, progresso, provas, atribuições, avisos e o
// Robô Conferidor da Escola. Tabelas PRÓPRIAS (contabil_escola_*), isoladas por escritório (tenant_id): a Escola nunca lê nem grava
// empresa, lançamento, plano de contas, fechamento, ECD, ECF ou os dados do Fiscal e do DP — a "empresa de treino" é o simulador (src/data/escolaPratica.ts).
import { AULAS, GLOSSARIO, TRILHAS, DOMINIOS_OFICIAIS, aulaPorId, type AulaEscola } from '../data/escolaConteudo';
import { PRATICAS, nivelGeral, type NivelAluno } from '../data/escolaPratica';
import { IDS_ETAPAS_DEMO, conferirRoteiroDemo, type EventoRegistroDemo } from '../data/escolaDemonstracao';
import { TELAS_CONTABIL } from '../data/mapaTelasContabil';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
/** Telas que o "Me mostra" pode abrir (as do menu que todo usuário vê). */
export const TELAS_ME_MOSTRA = TELAS_CONTABIL.map((t) => t.id);

// ---------------------------------------------------------------- liberação do adicional (Agente IA / consultor)
export interface DepsLiberacao { env: Record<string, string | undefined>; fetch: (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>; agora?: () => number }
export interface Liberacao { liberado: boolean; motivo: string }
const CACHE_MS = 10 * 60_000;
const cacheLiberacao = new Map<string, { r: Liberacao; em: number }>();
export function limparCacheLiberacao(): void { cacheLiberacao.clear(); }
export const MSG_NAO_LIBERADA = 'A Escola Murade é um adicional. Fale com o seu fornecedor para liberar.';

/** Pergunta ao consultor se o escritório (CNPJ) tem a Escola liberada. Sem variável, fora do ar ou resposta estranha = NÃO liberado. Cache de 10 minutos por CNPJ. */
export async function consultarLiberacaoEscola(cnpjEscritorio: string | null | undefined, deps: DepsLiberacao): Promise<Liberacao> {
  const cnpj = String(cnpjEscritorio || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cnpj.length !== 14) return { liberado: false, motivo: 'O CNPJ do escritório ainda não foi cadastrado. Sem ele não dá para conferir a liberação da Escola.' };
  const agora = (deps.agora || Date.now)();
  const c = cacheLiberacao.get(cnpj);
  if (c && agora - c.em < CACHE_MS) return c.r;
  const token = deps.env.MURADE_CONSULTOR_TOKEN;
  if (!token) return { liberado: false, motivo: MSG_NAO_LIBERADA };
  const base = String(deps.env.MURADE_CONSULTOR_URL || 'https://murade-agente-ia.onrender.com').replace(/\/+$/, '');
  try {
    const resp = await deps.fetch(`${base}/api/consultor/liberado?escritorio=${encodeURIComponent(cnpj)}&produto=escola`, { headers: { 'x-murade-consultor-token': token, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) { const r = { liberado: false, motivo: MSG_NAO_LIBERADA }; if (resp.status === 403 || resp.status === 404) cacheLiberacao.set(cnpj, { r, em: agora }); return r; }
    const corpo = await resp.json().catch(() => ({}));
    const r: Liberacao = corpo?.liberado === true ? { liberado: true, motivo: 'Escola liberada para este escritório.' } : { liberado: false, motivo: MSG_NAO_LIBERADA };
    cacheLiberacao.set(cnpj, { r, em: agora });
    if (cacheLiberacao.size > 2000) cacheLiberacao.clear();
    return r;
  } catch { return { liberado: false, motivo: MSG_NAO_LIBERADA }; }
}

// ---------------------------------------------------------------- tabelas
let preparado: Promise<void> | null = null;
export function prepararEscola(consultar: Consultar): Promise<void> {
  if (!preparado) preparado = (async () => {
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_escola_progresso (tenant_id text NOT NULL, user_id text NOT NULL, login text NOT NULL, aula_id text NOT NULL,
      quiz_nota numeric, quiz_tentativas int NOT NULL DEFAULT 0, erros jsonb NOT NULL DEFAULT '[]'::jsonb, concluida_em timestamptz, atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, user_id, aula_id))`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_escola_provas (id bigserial PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL, login text NOT NULL, pratica_id text NOT NULL, cenario_id text NOT NULL,
      nota numeric NOT NULL, nivel text NOT NULL, duracao_ms int, erros jsonb NOT NULL DEFAULT '[]'::jsonb, acertos jsonb NOT NULL DEFAULT '[]'::jsonb, criado_em timestamptz NOT NULL DEFAULT now())`);
    await consultar('CREATE INDEX IF NOT EXISTS contabil_escola_provas_tenant ON contabil_escola_provas (tenant_id, user_id, criado_em DESC)');
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_escola_atribuicoes (tenant_id text NOT NULL, user_id text NOT NULL, login text NOT NULL, trilha_id text NOT NULL, atribuido_por text NOT NULL,
      atribuido_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, user_id, trilha_id))`);
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_escola_avisos (id bigserial PRIMARY KEY, tenant_id text NOT NULL, para_user_id text NOT NULL, tipo text NOT NULL, texto text NOT NULL, chave text NOT NULL,
      criado_em timestamptz NOT NULL DEFAULT now(), lido_em timestamptz, UNIQUE (tenant_id, para_user_id, chave))`);
    // "▶ Demonstração completa com a IA": quais etapas a pessoa assistiu, quais fez na "sua vez" e quando assistiu tudo.
    await consultar(`CREATE TABLE IF NOT EXISTS contabil_escola_demonstracoes (tenant_id text NOT NULL, user_id text NOT NULL, login text NOT NULL,
      etapas jsonb NOT NULL DEFAULT '[]'::jsonb, sua_vez jsonb NOT NULL DEFAULT '[]'::jsonb, vezes int NOT NULL DEFAULT 0, completa_em timestamptz,
      atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, user_id))`);
  })().catch((e) => { preparado = null; throw e; });
  return preparado;
}

export interface Quem { tenantId: string; userId: string; login: string }

// ---------------------------------------------------------------- progresso das aulas
export async function registrarAulaVista(c: Consultar, q: Quem, aulaId: string): Promise<void> {
  if (!aulaPorId(aulaId)) throw new Error('Aula não encontrada.');
  await c(`INSERT INTO contabil_escola_progresso (tenant_id, user_id, login, aula_id) VALUES ($1,$2,$3,$4)
    ON CONFLICT (tenant_id, user_id, aula_id) DO UPDATE SET atualizado_em=now(), login=EXCLUDED.login`, [q.tenantId, q.userId, q.login, aulaId]);
}
export async function registrarQuiz(c: Consultar, q: Quem, aulaId: string, nota: number, erros: string[]): Promise<void> {
  await c(`INSERT INTO contabil_escola_progresso (tenant_id, user_id, login, aula_id, quiz_nota, quiz_tentativas, erros, concluida_em) VALUES ($1,$2,$3,$4,$5,1,$6::jsonb, CASE WHEN $5 >= 6 THEN now() END)
    ON CONFLICT (tenant_id, user_id, aula_id) DO UPDATE SET quiz_nota=EXCLUDED.quiz_nota, quiz_tentativas=contabil_escola_progresso.quiz_tentativas+1, erros=EXCLUDED.erros,
      concluida_em=COALESCE(contabil_escola_progresso.concluida_em, EXCLUDED.concluida_em), atualizado_em=now(), login=EXCLUDED.login`, [q.tenantId, q.userId, q.login, aulaId, nota, JSON.stringify(erros.slice(0, 10))]);
}
export async function registrarProva(c: Consultar, q: Quem, p: { praticaId: string; cenarioId: string; nota: number; nivel: string; duracaoMs: number | null; erros: string[]; acertos: string[] }): Promise<void> {
  await c(`INSERT INTO contabil_escola_provas (tenant_id, user_id, login, pratica_id, cenario_id, nota, nivel, duracao_ms, erros, acertos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
    [q.tenantId, q.userId, q.login, p.praticaId, p.cenarioId, p.nota, p.nivel, p.duracaoMs, JSON.stringify(p.erros.slice(0, 20)), JSON.stringify(p.acertos.slice(0, 20))]);
}

export interface ProgressoAluno {
  userId: string; login: string;
  aulas: Array<{ aulaId: string; quizNota: number | null; tentativas: number; concluida: boolean; atualizadoEm: string }>;
  provas: Array<{ praticaId: string; cenarioId: string; nota: number; nivel: string; duracaoMs: number | null; erros: string[]; em: string }>;
  atribuicoes: Array<{ trilhaId: string; atribuidoEm: string; atribuidoPor: string }>;
  nivel: NivelAluno;
  ultimaAtividade: string | null;
}

export async function progressoDoTenant(c: Consultar, tenantId: string, userId?: string): Promise<ProgressoAluno[]> {
  const filtroUser = userId ? ' AND user_id=$2' : '';
  const params = userId ? [tenantId, userId] : [tenantId];
  const [pg, pv, at] = await Promise.all([
    c(`SELECT user_id, login, aula_id, quiz_nota, quiz_tentativas, concluida_em, atualizado_em FROM contabil_escola_progresso WHERE tenant_id=$1${filtroUser}`, params),
    c(`SELECT user_id, login, pratica_id, cenario_id, nota, nivel, duracao_ms, erros, criado_em FROM contabil_escola_provas WHERE tenant_id=$1${filtroUser} ORDER BY criado_em DESC LIMIT 2000`, params),
    c(`SELECT user_id, login, trilha_id, atribuido_por, atribuido_em FROM contabil_escola_atribuicoes WHERE tenant_id=$1${filtroUser}`, params),
  ]);
  const alunos = new Map<string, ProgressoAluno>();
  const de = (u: string, login: string) => { let a = alunos.get(u); if (!a) { a = { userId: u, login, aulas: [], provas: [], atribuicoes: [], nivel: 'Iniciante', ultimaAtividade: null }; alunos.set(u, a); } return a; };
  const iso = (v: any) => (v ? new Date(v).toISOString() : '');
  const marcar = (a: ProgressoAluno, em: string) => { if (em && (!a.ultimaAtividade || em > a.ultimaAtividade)) a.ultimaAtividade = em; };
  for (const r of pg.rows) { const a = de(String(r.user_id), String(r.login)); const em = iso(r.atualizado_em); a.aulas.push({ aulaId: String(r.aula_id), quizNota: r.quiz_nota === null || r.quiz_nota === undefined ? null : Number(r.quiz_nota), tentativas: Number(r.quiz_tentativas) || 0, concluida: !!r.concluida_em, atualizadoEm: em }); marcar(a, em); }
  for (const r of pv.rows) { const a = de(String(r.user_id), String(r.login)); const em = iso(r.criado_em); a.provas.push({ praticaId: String(r.pratica_id), cenarioId: String(r.cenario_id), nota: Number(r.nota), nivel: String(r.nivel), duracaoMs: r.duracao_ms === null || r.duracao_ms === undefined ? null : Number(r.duracao_ms), erros: Array.isArray(r.erros) ? r.erros : [], em }); marcar(a, em); }
  for (const r of at.rows) { const a = de(String(r.user_id), String(r.login)); a.atribuicoes.push({ trilhaId: String(r.trilha_id), atribuidoEm: iso(r.atribuido_em), atribuidoPor: String(r.atribuido_por) }); }
  for (const a of alunos.values()) a.nivel = nivelGeral(a.provas.map((p) => ({ pratica: p.praticaId, nota: p.nota, em: p.em })));
  return [...alunos.values()];
}

// ---------------------------------------------------------------- demonstração completa com a IA
export interface DemonstracaoAluno { etapas: string[]; suaVez: string[]; vezes: number; completaEm: string | null; totalEtapas: number; atualizadoEm: string | null }
/** Registra o que a pessoa assistiu na demonstração. Devolve true quando é a PRIMEIRA vez que ela assiste tudo (para avisar o gestor). */
export async function registrarDemonstracao(c: Consultar, q: Quem, evento: EventoRegistroDemo, etapa: string | null): Promise<boolean> {
  if (etapa !== null && !IDS_ETAPAS_DEMO.includes(etapa)) throw new Error('Etapa da demonstração não encontrada.');
  await c(`INSERT INTO contabil_escola_demonstracoes (tenant_id, user_id, login) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, user_id) DO UPDATE SET login=EXCLUDED.login`, [q.tenantId, q.userId, q.login]);
  if (evento === 'etapa' || evento === 'sua_vez') {
    const col = evento === 'etapa' ? 'etapas' : 'sua_vez';
    await c(`UPDATE contabil_escola_demonstracoes SET ${col}=CASE WHEN ${col} ? $3 THEN ${col} ELSE ${col} || to_jsonb($3::text) END, atualizado_em=now() WHERE tenant_id=$1 AND user_id=$2`, [q.tenantId, q.userId, etapa]);
    return false;
  }
  const r = await c(`UPDATE contabil_escola_demonstracoes SET vezes=vezes+1, completa_em=COALESCE(completa_em, now()), atualizado_em=now() WHERE tenant_id=$1 AND user_id=$2 RETURNING vezes`, [q.tenantId, q.userId]);
  return Number(r.rows[0]?.vezes) === 1;
}
export async function demonstracoesDoTenant(c: Consultar, tenantId: string, userId?: string): Promise<Map<string, DemonstracaoAluno>> {
  const r = await c(`SELECT user_id, etapas, sua_vez, vezes, completa_em, atualizado_em FROM contabil_escola_demonstracoes WHERE tenant_id=$1${userId ? ' AND user_id=$2' : ''}`, userId ? [tenantId, userId] : [tenantId]);
  const m = new Map<string, DemonstracaoAluno>();
  for (const x of r.rows) {
    const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((id) => IDS_ETAPAS_DEMO.includes(id)) : []);
    m.set(String(x.user_id), { etapas: lista(x.etapas), suaVez: lista(x.sua_vez), vezes: Number(x.vezes) || 0, completaEm: x.completa_em ? new Date(x.completa_em).toISOString() : null, totalEtapas: IDS_ETAPAS_DEMO.length, atualizadoEm: x.atualizado_em ? new Date(x.atualizado_em).toISOString() : null });
  }
  return m;
}

/** Onde o aluno mais erra: aulas com nota de questionário mais baixa e as práticas com nota baixa, com o erro mais repetido. */
export function ondeMaisErra(a: ProgressoAluno): string[] {
  const saida: Array<{ texto: string; peso: number }> = [];
  for (const x of a.aulas) if (x.quizNota !== null && x.quizNota < 7) saida.push({ texto: `Questionário "${aulaPorId(x.aulaId)?.titulo || x.aulaId}": nota ${x.quizNota.toFixed(1).replace('.', ',')}`, peso: 10 - x.quizNota });
  const porPratica = new Map<string, { nota: number; erros: string[] }>();
  for (const p of a.provas) if (!porPratica.has(p.praticaId)) porPratica.set(p.praticaId, { nota: p.nota, erros: p.erros });
  for (const [id, p] of porPratica) if (p.nota < 8) saida.push({ texto: `Prova "${PRATICAS.find((x) => x.id === id)?.titulo || id}": nota ${p.nota.toFixed(1).replace('.', ',')}${p.erros[0] ? ` — ${p.erros[0]}` : ''}`, peso: 10 - p.nota });
  return saida.sort((x, y) => y.peso - x.peso).slice(0, 5).map((x) => x.texto);
}

// ---------------------------------------------------------------- equipe do escritório, atribuições e avisos
export async function equipeDoTenant(c: Consultar, tenantId: string): Promise<Array<{ userId: string; login: string }>> {
  const r = await c(`SELECT id::text AS id, login FROM contabil_auth_users WHERE disabled=false AND (id::text=$1 OR office_owner::text=$1 OR tenant_id::text=$1) ORDER BY login`, [tenantId]);
  return r.rows.map((x) => ({ userId: String(x.id), login: String(x.login) }));
}

export async function atribuirTrilha(c: Consultar, gestor: Quem, aluno: { userId: string; login: string }, trilhaId: string): Promise<boolean> {
  const t = TRILHAS.find((x) => x.id === trilhaId); if (!t) throw new Error('Trilha não encontrada.');
  const r = await c(`INSERT INTO contabil_escola_atribuicoes (tenant_id, user_id, login, trilha_id, atribuido_por) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, user_id, trilha_id) DO NOTHING RETURNING trilha_id`,
    [gestor.tenantId, aluno.userId, aluno.login, trilhaId, gestor.login]);
  const nova = (r.rowCount ?? r.rows.length) > 0;
  if (nova) await criarAviso(c, gestor.tenantId, aluno.userId, 'atribuicao', `Você vai estudar isto: trilha "${t.titulo}" na Escola Murade (pedido de ${gestor.login}).`, `atribuicao:${trilhaId}`);
  return nova;
}
export async function desatribuirTrilha(c: Consultar, tenantId: string, userId: string, trilhaId: string): Promise<boolean> {
  const r = await c('DELETE FROM contabil_escola_atribuicoes WHERE tenant_id=$1 AND user_id=$2 AND trilha_id=$3 RETURNING trilha_id', [tenantId, userId, trilhaId]);
  await c(`DELETE FROM contabil_escola_avisos WHERE tenant_id=$1 AND para_user_id=$2 AND chave=$3`, [tenantId, userId, `atribuicao:${trilhaId}`]);
  return (r.rowCount ?? r.rows.length) > 0;
}
export async function criarAviso(c: Consultar, tenantId: string, paraUserId: string, tipo: string, texto: string, chave: string): Promise<boolean> {
  const r = await c(`INSERT INTO contabil_escola_avisos (tenant_id, para_user_id, tipo, texto, chave) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, para_user_id, chave) DO NOTHING RETURNING id`, [tenantId, paraUserId, tipo, texto.slice(0, 500), chave.slice(0, 200)]);
  return (r.rowCount ?? r.rows.length) > 0;
}
export async function avisosNaoLidos(c: Consultar, q: Quem): Promise<Array<{ id: string; tipo: string; texto: string; em: string }>> {
  const r = await c('SELECT id, tipo, texto, criado_em FROM contabil_escola_avisos WHERE tenant_id=$1 AND para_user_id=$2 AND lido_em IS NULL ORDER BY criado_em DESC LIMIT 20', [q.tenantId, q.userId]);
  return r.rows.map((x) => ({ id: String(x.id), tipo: String(x.tipo), texto: String(x.texto), em: new Date(x.criado_em).toISOString() }));
}
export async function marcarAvisoLido(c: Consultar, q: Quem, id: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw new Error('Aviso inválido.');
  await c('UPDATE contabil_escola_avisos SET lido_em=now() WHERE id=$1 AND tenant_id=$2 AND para_user_id=$3', [id, q.tenantId, q.userId]);
}

// ---------------------------------------------------------------- Robô Conferidor da Escola (partes puras)
export interface AchadoConteudo { onde: string; problema: string }
const DIAS_PARA_RECONFERIR = 365;

/** Confere o conteúdo: toda regra com fonte oficial e data, perguntas bem formadas, exemplo/me-mostra/prática que existem. */
export function conferirConteudoEscola(idsExemplos: string[], hoje = new Date().toISOString().slice(0, 10)): AchadoConteudo[] {
  const achados: AchadoConteudo[] = [];
  const oficial = (url: string) => { try { return DOMINIOS_OFICIAIS.includes(new URL(url).hostname); } catch { return false; } };
  const ids = new Set<string>();
  for (const a of AULAS) {
    const onde = `aula "${a.titulo}"`;
    if (ids.has(a.id)) achados.push({ onde, problema: 'id repetido' }); ids.add(a.id);
    if (!TRILHAS.some((t) => t.id === a.trilha)) achados.push({ onde, problema: `trilha inexistente ${a.trilha}` });
    if (!a.fontes.length) achados.push({ onde, problema: 'sem fonte' });
    for (const f of a.fontes) if (f.tipo !== 'sistema' && !oficial(f.url)) achados.push({ onde, problema: `fonte fora dos sites oficiais: ${f.url}` });
    if (a.trilha !== 'primeiros-passos' && !a.fontes.some((f) => f.tipo !== 'sistema')) achados.push({ onde, problema: 'regra sem fonte oficial (só "sistema" vale nos primeiros passos)' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.conferidoEm)) achados.push({ onde, problema: 'sem data de conferência' });
    else if ((Date.parse(hoje) - Date.parse(a.conferidoEm)) / 86400000 > DIAS_PARA_RECONFERIR) achados.push({ onde, problema: `conferida em ${a.conferidoEm}: passou de 1 ano, reconferir na fonte oficial` });
    if (!a.regras.length) achados.push({ onde, problema: 'sem regra' });
    if (a.perguntas.length < 3 || a.perguntas.length > 5) achados.push({ onde, problema: 'precisa de 3 a 5 perguntas' });
    a.perguntas.forEach((p, i) => { if (!(p.certa >= 0 && p.certa < p.opcoes.length) || p.opcoes.length < 2 || !p.explicacao) achados.push({ onde, problema: `pergunta ${i + 1} mal formada` }); });
    if (a.exemplo && !idsExemplos.includes(a.exemplo)) achados.push({ onde, problema: `exemplo inexistente ${a.exemplo}` });
    if (a.pratica && !PRATICAS.some((p) => p.id === a.pratica)) achados.push({ onde, problema: `prática inexistente ${a.pratica}` });
    if (!TELAS_ME_MOSTRA.includes(a.meMostra.tela)) achados.push({ onde, problema: `o "Me mostra" aponta para a tela "${a.meMostra.tela}", que não existe no mapa de telas` });
  }
  for (const p of PRATICAS) if (!TELAS_ME_MOSTRA.includes(p.telaReal)) achados.push({ onde: `prática "${p.titulo}"`, problema: `tela real inexistente ${p.telaReal}` });
  for (const p of conferirRoteiroDemo()) achados.push({ onde: 'demonstração completa com a IA', problema: p });
  for (const g of GLOSSARIO) {
    if (g.fonte.tipo !== 'sistema' && !oficial(g.fonte.url)) achados.push({ onde: `glossário "${g.termo}"`, problema: 'fonte fora dos sites oficiais' });
    if (g.aula && !aulaPorId(g.aula)) achados.push({ onde: `glossário "${g.termo}"`, problema: `aula inexistente ${g.aula}` });
  }
  return achados;
}

/** Alunos com trilha atribuída e sem progresso há 7 dias (contados da atribuição ou da última atividade, o que for mais recente). */
export function alunosParados(alunos: ProgressoAluno[], agora = Date.now(), dias = 7): Array<{ userId: string; login: string; trilhaId: string; diasParado: number }> {
  const saida: Array<{ userId: string; login: string; trilhaId: string; diasParado: number }> = [];
  for (const a of alunos) for (const at of a.atribuicoes) {
    const aulasTrilha = AULAS.filter((x) => x.trilha === at.trilhaId).map((x) => x.id);
    const concluiu = aulasTrilha.length > 0 && aulasTrilha.every((id) => a.aulas.some((x) => x.aulaId === id && x.concluida));
    if (concluiu) continue;
    const ref = [at.atribuidoEm, a.ultimaAtividade || ''].filter(Boolean).sort().pop()!;
    const diasParado = Math.floor((agora - Date.parse(ref)) / 86400000);
    if (diasParado >= dias) saida.push({ userId: a.userId, login: a.login, trilhaId: at.trilhaId, diasParado });
  }
  return saida;
}

/** Semana do ano (para avisar o gestor no máximo uma vez por semana por aluno e trilha). */
export const semanaDe = (agora: number) => `${new Date(agora).getUTCFullYear()}-${Math.floor((agora - Date.UTC(new Date(agora).getUTCFullYear(), 0, 1)) / (7 * 86400000))}`;

/** Rodada do robô para UM escritório (o "Rodar agora" do gestor) ou para todos (agendador). Só lê e cria avisos da Escola. */
export async function rodarConferidorEscola(c: Consultar, idsExemplos: string[], tenantSo?: string, agora = Date.now()): Promise<{ resumo: string; conteudo: AchadoConteudo[]; parados: number; avisosCriados: number; limpos: number }> {
  await prepararEscola(c);
  const conteudo = conferirConteudoEscola(idsExemplos, new Date(agora).toISOString().slice(0, 10));
  const tenants = tenantSo ? [tenantSo] : (await c('SELECT DISTINCT tenant_id FROM contabil_escola_atribuicoes')).rows.map((r) => String(r.tenant_id));
  let parados = 0; let avisosCriados = 0; let limpos = 0;
  for (const t of tenants) {
    const lista = alunosParados(await progressoDoTenant(c, t), agora);
    parados += lista.length;
    for (const p of lista) {
      const trilha = TRILHAS.find((x) => x.id === p.trilhaId)?.titulo || p.trilhaId;
      if (await criarAviso(c, t, t, 'aluno_parado', `${p.login} está sem progresso há ${p.diasParado} dias na trilha "${trilha}" da Escola Murade.`, `parado:${p.userId}:${p.trilhaId}:${semanaDe(agora)}`)) avisosCriados += 1;
    }
  }
  // Quem saiu do sistema (conta apagada): tira as trilhas atribuídas a ele (o login fica livre para cadastrar de novo; nada é bloqueado).
  if (!tenantSo) {
    const r = await c(`DELETE FROM contabil_escola_atribuicoes a WHERE NOT EXISTS (SELECT 1 FROM contabil_auth_users u WHERE u.id::text=a.user_id) RETURNING 1`);
    limpos = r.rowCount ?? r.rows.length;
    const d = await c(`DELETE FROM contabil_escola_demonstracoes a WHERE NOT EXISTS (SELECT 1 FROM contabil_auth_users u WHERE u.id::text=a.user_id) RETURNING 1`);
    limpos += d.rowCount ?? d.rows.length;
  }
  const resumo = `${AULAS.length} aulas, ${PRATICAS.length} práticas e ${GLOSSARIO.length} termos conferidos (${conteudo.length ? `${conteudo.length} problema(s) no conteúdo` : 'conteúdo com fonte oficial e data'}); ${parados} aluno(s) sem progresso há 7 dias ou mais${avisosCriados ? `, ${avisosCriados} aviso(s) ao gestor` : ''}.`;
  return { resumo, conteudo, parados, avisosCriados, limpos };
}

/** Uma aula para a lista (sem as respostas certas, que só o servidor confere). */
export function aulaSemRespostas(a: AulaEscola) {
  return { ...a, perguntas: a.perguntas.map((p) => ({ pergunta: p.pergunta, opcoes: p.opcoes })) };
}
