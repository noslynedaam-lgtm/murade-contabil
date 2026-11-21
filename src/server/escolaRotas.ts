// Rotas da Escola Murade e a rotina do Robô Conferidor da Escola. Registradas por UMA chamada em server.ts.
// Liberação: adicional pago, conferido no consultor (Agente IA) pelo CNPJ do escritório; o escritório do dono do sistema usa
// sempre (é o próprio produto). Gestor = administrador do escritório (ou o dono do sistema).
import type { Request, RequestHandler } from 'express';
import { AULAS, GLOSSARIO, TRILHAS, aulaPorId, buscarGlossario, corrigirQuestionario } from '../data/escolaConteudo';
import { PRATICAS, corrigirProva, nivelGeral, praticaPorId, type AcaoAluno } from '../data/escolaPratica';
import { exemploEscola, IDS_EXEMPLOS, resultadoDoCenario, simularPratica } from './escolaExemplos';
import {
  atribuirTrilha, aulaSemRespostas, avisosNaoLidos, consultarLiberacaoEscola, criarAviso, desatribuirTrilha, equipeDoTenant, marcarAvisoLido, ondeMaisErra, prepararEscola,
  progressoDoTenant, registrarAulaVista, registrarProva, registrarQuiz, rodarConferidorEscola, alunosParados, type Consultar, type DepsLiberacao, type Quem,
  demonstracoesDoTenant, registrarDemonstracao,
} from './escola';
import { registroDemoValido } from '../data/escolaDemonstracao';

export interface SessaoEscola { userId: string; login: string; tenantId?: string; administrador?: boolean; donoSistema?: boolean }
type Rota = (caminho: string, ...h: RequestHandler[]) => unknown;
export interface DepsEscola {
  app: { get: Rota; post: Rota };
  exigirSessao: RequestHandler;
  sessao(req: Request): SessaoEscola | undefined;
  consultar: Consultar;
  bancoConfigurado(): boolean;
  liberacao: DepsLiberacao;
  /** CNPJ do escritório (cadastrado pelo dono do sistema ou pelo administrador). */
  cnpjDoEscritorio(tenantId: string): Promise<string | null>;
  /** O escritório é o do dono do sistema (usa a Escola sempre). */
  escritorioDoDono(tenantId: string): Promise<boolean>;
}

export const ID_ROBO_ESCOLA = 'conferidor_escola';
export const ROTAS_ESCOLA = /^(GET|POST) \/api\/escola(\/|$)/;

export function quemDaSessao(s: SessaoEscola): Quem { return { tenantId: String(s.tenantId || s.userId), userId: String(s.userId), login: String(s.login) }; }
/** Administrador do escritório (a conta do escritório) ou o dono do sistema. */
export function ehGestorEscola(s: SessaoEscola): boolean { return s.donoSistema === true || s.administrador === true; }

export async function liberacaoDaSessao(s: SessaoEscola, d: Pick<DepsEscola, 'liberacao' | 'cnpjDoEscritorio' | 'escritorioDoDono'>): Promise<{ liberado: boolean; motivo: string }> {
  if (s.donoSistema === true) return { liberado: true, motivo: 'Dono do sistema.' };
  const tenant = quemDaSessao(s).tenantId;
  try { if (await d.escritorioDoDono(tenant)) return { liberado: true, motivo: 'Escritório do dono do sistema.' }; } catch { /* segue para o consultor */ }
  let cnpj: string | null = null;
  try { cnpj = await d.cnpjDoEscritorio(tenant); } catch { cnpj = null; }
  return consultarLiberacaoEscola(cnpj, d.liberacao);
}

export function registrarRotasEscola(d: DepsEscola): { rodarRobo: (tenantSo?: string) => Promise<{ resumo: string }> } {
  const erro = (res: any, e: unknown, padrao: string, codigo = 400) => res.status(codigo).json({ sucesso: false, motivo: e instanceof Error ? e.message : padrao });
  // Guarda: sessão + banco + Escola liberada. Devolve o contexto ou já respondeu.
  const contexto = async (req: Request, res: any, exigeGestor = false) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return null; }
    if (!d.bancoConfigurado()) { res.status(503).json({ sucesso: false, motivo: 'Banco de dados não configurado.' }); return null; }
    const lib = await liberacaoDaSessao(s, d);
    if (!lib.liberado) { res.status(402).json({ sucesso: false, liberado: false, motivo: lib.motivo }); return null; }
    if (exigeGestor && !ehGestorEscola(s)) { res.status(403).json({ sucesso: false, motivo: 'Só o administrador do escritório vê o painel do gestor.' }); return null; }
    await prepararEscola(d.consultar);
    return { s, q: quemDaSessao(s) };
  };

  d.app.get('/api/escola/estado', d.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const lib = await liberacaoDaSessao(s, d);
    return res.json({ sucesso: true, liberado: lib.liberado, motivo: lib.motivo, gestor: ehGestorEscola(s), trilhas: TRILHAS.map((t) => ({ ...t, aulas: AULAS.filter((a) => a.trilha === t.id).length })) });
  });

  d.app.get('/api/escola/conteudo', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const [meu] = await progressoDoTenant(d.consultar, ctx.q.tenantId, ctx.q.userId);
      const demonstracao = (await demonstracoesDoTenant(d.consultar, ctx.q.tenantId, ctx.q.userId)).get(ctx.q.userId) || null;
      return res.json({ sucesso: true, demonstracao, trilhas: TRILHAS, aulas: AULAS.map(aulaSemRespostas), glossario: GLOSSARIO, praticas: PRATICAS.map((p) => p.id),
        progresso: meu || { aulas: [], provas: [], atribuicoes: [], nivel: 'Iniciante', ultimaAtividade: null }, gestor: ehGestorEscola(ctx.s) });
    } catch (e) { return erro(res, e, 'Não foi possível abrir a Escola.', 503); }
  });

  d.app.get('/api/escola/exemplo/:id', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const ex = exemploEscola(String(req.params.id || ''));
      return ex ? res.json({ sucesso: true, exemplo: ex }) : res.status(404).json({ sucesso: false, motivo: 'Exemplo não encontrado.' });
    } catch (e) { return erro(res, e, 'Não foi possível calcular o exemplo.'); }
  });

  d.app.get('/api/escola/glossario', d.exigirSessao, async (req, res) => {
    try { const ctx = await contexto(req, res); if (!ctx) return; return res.json({ sucesso: true, termos: buscarGlossario(String(req.query.q || ''), 30) }); }
    catch (e) { return erro(res, e, 'Não foi possível buscar.'); }
  });

  d.app.post('/api/escola/aula-vista', d.exigirSessao, async (req, res) => {
    try { const ctx = await contexto(req, res); if (!ctx) return; await registrarAulaVista(d.consultar, ctx.q, String(req.body?.aulaId || '')); return res.json({ sucesso: true }); }
    catch (e) { return erro(res, e, 'Não foi possível registrar.'); }
  });

  d.app.post('/api/escola/quiz', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const aula = aulaPorId(String(req.body?.aulaId || '')); if (!aula) return res.status(404).json({ sucesso: false, motivo: 'Aula não encontrada.' });
      const respostas = Array.isArray(req.body?.respostas) ? req.body.respostas.map((x: unknown) => Number(x)) : [];
      if (respostas.length !== aula.perguntas.length) return res.status(400).json({ sucesso: false, motivo: 'Responda todas as perguntas.' });
      const r = corrigirQuestionario(aula, respostas);
      await registrarQuiz(d.consultar, ctx.q, aula.id, r.nota, r.erradas.map((x) => aula.perguntas[x.indice].pergunta));
      return res.json({ sucesso: true, ...r, certas: aula.perguntas.map((p) => p.certa) });
    } catch (e) { return erro(res, e, 'Não foi possível corrigir.'); }
  });

  // Simulador da empresa de TREINO: motor real, nada gravado.
  d.app.post('/api/escola/simular', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      return res.json({ sucesso: true, treino: true, resultado: simularPratica(String(req.body?.praticaId || ''), req.body?.valores || {}) });
    } catch (e) { return erro(res, e, 'Não foi possível calcular.', 422); }
  });

  // "▶ Demonstração completa com a IA": registra etapa assistida, etapa feita na "sua vez" e demonstração completa (painel do gestor).
  // Só grava na tabela da Escola; a demonstração em si nunca grava nada do sistema.
  d.app.post('/api/escola/demonstracao', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const r = registroDemoValido(req.body?.evento, req.body?.etapa);
      if (!r) return res.status(400).json({ sucesso: false, motivo: 'Registro da demonstração inválido.' });
      const primeiraVez = await registrarDemonstracao(d.consultar, ctx.q, r.evento, r.etapa);
      if (primeiraVez && ctx.q.userId !== ctx.q.tenantId) {
        await criarAviso(d.consultar, ctx.q.tenantId, ctx.q.tenantId, 'demonstracao', `${ctx.q.login} assistiu a demonstração completa com a IA (do lançamento até a ECD).`, `demo:${ctx.q.userId}`);
      }
      return res.json({ sucesso: true });
    } catch (e) { return erro(res, e, 'Não foi possível registrar.'); }
  });

  d.app.get('/api/escola/prova/:praticaId', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const p = praticaPorId(String(req.params.praticaId || '')); if (!p) return res.status(404).json({ sucesso: false, motivo: 'Prática não encontrada.' });
      // Sorteia uma prova diferente da última feita pela pessoa, quando possível.
      const ultima = (await d.consultar('SELECT cenario_id FROM contabil_escola_provas WHERE tenant_id=$1 AND user_id=$2 AND pratica_id=$3 ORDER BY criado_em DESC LIMIT 1', [ctx.q.tenantId, ctx.q.userId, p.id])).rows[0]?.cenario_id;
      const opcoes = p.provas.filter((x) => x.id !== ultima); const lista = opcoes.length ? opcoes : p.provas;
      const c = lista[Math.floor(Math.random() * lista.length)];
      return res.json({ sucesso: true, cenario: { id: c.id, enunciado: c.enunciado } });
    } catch (e) { return erro(res, e, 'Não foi possível abrir a prova.'); }
  });

  // Correção da prova no SERVIDOR (não confia em nota vinda da tela): campos, ordem, clique e resultado do motor real.
  d.app.post('/api/escola/prova', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const b = req.body || {};
      const p = praticaPorId(String(b.praticaId || '')); if (!p) return res.status(404).json({ sucesso: false, motivo: 'Prática não encontrada.' });
      const cenario = p.provas.find((x) => x.id === String(b.cenarioId || '')); if (!cenario) return res.status(400).json({ sucesso: false, motivo: 'Prova não encontrada.' });
      const acoes: AcaoAluno[] = (Array.isArray(b.acoes) ? b.acoes : []).slice(0, 500).filter((a: any) => a && ['foco', 'preencher', 'clicar'].includes(a.tipo) && typeof a.alvo === 'string')
        .map((a: any) => ({ tipo: a.tipo, alvo: String(a.alvo).slice(0, 60), valor: a.valor === undefined ? undefined : String(a.valor).slice(0, 120) }));
      const valores: Record<string, string> = {}; for (const c of p.campos) valores[c.id] = String(b.valores?.[c.id] ?? '').slice(0, 120);
      let obtido: Record<string, unknown> | null = null; try { obtido = simularPratica(p.id, valores); } catch { obtido = null; }
      const r = corrigirProva(p, cenario, acoes, valores, { esperado: resultadoDoCenario(p.id, cenario.valores), obtido });
      const duracaoMs = Number.isFinite(Number(b.duracaoMs)) ? Math.min(Math.max(0, Math.round(Number(b.duracaoMs))), 6 * 3600_000) : null;
      await registrarProva(d.consultar, ctx.q, { praticaId: p.id, cenarioId: cenario.id, nota: r.nota, nivel: r.nivel, duracaoMs, erros: r.erros, acertos: r.acertos });
      const [meu] = await progressoDoTenant(d.consultar, ctx.q.tenantId, ctx.q.userId);
      const nivel = meu ? meu.nivel : nivelGeral([]);
      // A gestora do escritório recebe aviso quando alguém termina uma prova (não avisa a si mesma).
      if (ctx.q.userId !== ctx.q.tenantId) {
        const min = duracaoMs ? Math.max(1, Math.round(duracaoMs / 60000)) : null;
        await criarAviso(d.consultar, ctx.q.tenantId, ctx.q.tenantId, 'prova', `${ctx.q.login} terminou a prova "${p.titulo}": nota ${r.nota.toFixed(1).replace('.', ',')}${min ? ` em ${min} min` : ''}, nível ${r.nivel}.${r.erros[0] ? ` Erro principal: ${r.erros[0]}` : ''}`, `prova:${ctx.q.userId}:${Date.now()}`);
      }
      return res.json({ sucesso: true, resultado: r, obtido, nivelGeral: nivel });
    } catch (e) { return erro(res, e, 'Não foi possível corrigir a prova.'); }
  });

  d.app.get('/api/escola/gestor', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res, true); if (!ctx) return;
      const [equipe, alunos, demos] = await Promise.all([equipeDoTenant(d.consultar, ctx.q.tenantId), progressoDoTenant(d.consultar, ctx.q.tenantId), demonstracoesDoTenant(d.consultar, ctx.q.tenantId)]);
      const porId = new Map(alunos.map((a) => [a.userId, a]));
      const parados = alunosParados(alunos);
      const lista = equipe.map((u) => {
        const a = porId.get(u.userId);
        const comNota = a ? a.aulas.filter((x) => x.quizNota !== null) : [];
        return { userId: u.userId, login: u.login, aulasFeitas: a ? a.aulas.filter((x) => x.concluida).length : 0, totalAulas: AULAS.length,
          mediaQuiz: comNota.length ? Math.round((comNota.reduce((s, x) => s + (x.quizNota as number), 0) / comNota.length) * 10) / 10 : null,
          nivel: a ? a.nivel : 'Iniciante', provas: a ? a.provas.slice(0, 30) : [], aulas: a ? a.aulas : [], atribuicoes: a ? a.atribuicoes : [], ondeMaisErra: a ? ondeMaisErra(a) : [],
          ultimaAtividade: a?.ultimaAtividade || null, parado: parados.filter((p) => p.userId === u.userId), demonstracao: demos.get(u.userId) || null };
      });
      return res.json({ sucesso: true, alunos: lista, trilhas: TRILHAS });
    } catch (e) { return erro(res, e, 'Não foi possível abrir o painel do gestor.', 503); }
  });

  d.app.post('/api/escola/atribuir', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res, true); if (!ctx) return;
      const login = String(req.body?.login || '').trim().toLowerCase();
      const aluno = (await equipeDoTenant(d.consultar, ctx.q.tenantId)).find((u) => u.login.toLowerCase() === login);
      if (!aluno) return res.status(404).json({ sucesso: false, motivo: 'Essa pessoa não está na equipe do escritório.' });
      const nova = await atribuirTrilha(d.consultar, ctx.q, aluno, String(req.body?.trilhaId || ''));
      return res.json({ sucesso: true, nova, mensagem: nova ? `Trilha atribuída. ${aluno.login} vai ver o aviso ao entrar.` : 'Essa trilha já estava atribuída.' });
    } catch (e) { return erro(res, e, 'Não foi possível atribuir.'); }
  });

  // Tirar a trilha de um aluno: uma por vez, com confirmação explícita (a tela pede as duas etapas).
  d.app.post('/api/escola/desatribuir', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res, true); if (!ctx) return;
      if (req.body?.confirmar !== true) return res.status(422).json({ sucesso: false, motivo: 'Confirme para tirar a trilha.' });
      const login = String(req.body?.login || '').trim().toLowerCase();
      const aluno = (await equipeDoTenant(d.consultar, ctx.q.tenantId)).find((u) => u.login.toLowerCase() === login);
      if (!aluno) return res.status(404).json({ sucesso: false, motivo: 'Essa pessoa não está na equipe do escritório.' });
      return (await desatribuirTrilha(d.consultar, ctx.q.tenantId, aluno.userId, String(req.body?.trilhaId || ''))) ? res.json({ sucesso: true }) : res.status(404).json({ sucesso: false, motivo: 'Atribuição não encontrada.' });
    } catch (e) { return erro(res, e, 'Não foi possível tirar a trilha.'); }
  });

  // Avisos da Escola (trilha atribuída, prova terminada, aluno parado). Só as tabelas da Escola: não consulta o consultor.
  d.app.get('/api/escola/avisos', d.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    if (!d.bancoConfigurado()) return res.json({ sucesso: true, avisos: [] });
    try { await prepararEscola(d.consultar); return res.json({ sucesso: true, avisos: await avisosNaoLidos(d.consultar, quemDaSessao(s)) }); }
    catch { return res.json({ sucesso: true, avisos: [] }); }
  });
  d.app.post('/api/escola/avisos/lido', d.exigirSessao, async (req, res) => {
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { await marcarAvisoLido(d.consultar, quemDaSessao(s), String(req.body?.id || '')); return res.json({ sucesso: true }); }
    catch (e) { return erro(res, e, 'Não foi possível marcar.'); }
  });

  const rodarRobo = async (tenantSo?: string) => rodarConferidorEscola(d.consultar, IDS_EXEMPLOS, tenantSo);
  // "Rodar agora" do gestor: a mesma conferência do robô, só para o escritório dele.
  d.app.post('/api/escola/robo/rodar-agora', d.exigirSessao, async (req, res) => {
    try {
      const ctx = await contexto(req, res, true); if (!ctx) return;
      const r = await rodarRobo(ctx.q.tenantId);
      return res.json({ sucesso: true, resumo: r.resumo, conteudo: r.conteudo, parados: r.parados });
    } catch (e) { return erro(res, e, 'Não foi possível rodar o robô.', 503); }
  });
  return { rodarRobo };
}
