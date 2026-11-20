// REVISOR do Contábil (servidor): "não pode passar nada".
//  1) Conferência antes de fechar o mês (POST /api/revisor/conferir, acao=fechamento): fechamento guiado + o que só o servidor sabe
//     (extrato sem conciliação, folha do DP sem partida) + lançamento repetido e Caixa com saldo credor.
//  2) Parecer do cartão "Confira e dê o OK" (GET /api/revisor/parecer): "✅ conferi … ⚠️ atenção …" da empresa e competência.
//  3) Revisão geral do mês por empresa (GET /api/revisor/geral): certo / risco / falta.
//  4) Robô semanal "revisor": roda a revisão geral do mês anterior de cada escritório e joga o que achou na lista "Corrigir"
//     (tabela contabil_revisor_achados), com "Rodar agora".
//  5) "Corrigir para mim" de erro JÁ SALVO: só lançamento PENDENTE de aprovação em mês ABERTO, e só o determinístico (nome da conta
//     pelo plano, competência pela data, histórico sem espaços). Grava pelo mesmo caminho do servidor que respeita o mês fechado
//     (alterarWorkspaceNoServidorContabil). Nunca aprova, nunca fecha, nunca transmite nada.
import crypto from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import type { LancamentoContabil } from "../types";
import { ACOES_REVISADAS, correcoesDeLancamentosPendentes, fecharRevisao, parecerEmTexto, revisarFechamento, revisarMes, type AchadoRevisor, type AcaoRevisada, type ExtrasMes, type Revisao } from "../utils/revisorContabil";

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface SessaoRevisor { userId: string; login: string; tenantId: string; cnpjs: string[]; podeEscrever: (cnpj: string) => boolean }

export const INTERVALO_ROBO_REVISOR_MS = 6 * 60 * 60_000;
export const DIAS_ENTRE_REVISOES = 7;

export interface AchadoGeral extends AchadoRevisor { tela: string; corrigivel: boolean }
export interface RevisaoEmpresa { cnpj: string; nome: string; regime: string; competencia: string; certo: string[]; risco: AchadoGeral[]; falta: AchadoGeral[] }
export interface ItemCorrigir {
  id: string; cnpj: string; empresa: string; competencia: string; regra: string; nivel: string; tipo: string; texto: string; tela: string;
  correcao: { campo: string; valor: string; explicacao: string } | null; pergunta: string | null; origem: string; estado: string; criadoEm: string; atualizadoEm: string;
}

const soCnpj = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const ehCompetencia = (c: unknown): c is string => typeof c === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
const texto = (v: unknown, n = 600) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
export const competenciaAnterior = (hoje: string): string => { const [a, m] = hoje.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

/** Tela de cada regra (para "Me leva lá"). */
export function telaDaRegra(regra: string): string {
  if (/^fech_aprovacao|^pendentes_/.test(regra)) return "aprovacoes";
  if (/^fech_prelancamentos|^folha_dp/.test(regra)) return "revisao-origens";
  if (/^fech_saldos|^sem_plano|^fech_classificacao/.test(regra)) return "plano-contas";
  if (/^extrato|^fech_depreciacao/.test(regra)) return "gestao-contabil";
  if (/^fech_/.test(regra)) return "balancete";
  return "lancamentos";
}

export interface DepsRevisor {
  consultar: Consultar;
  agora?: () => Date;
  lerWorkspace: (cnpj: string) => Promise<Record<string, any> | null>;
  /** Grava pelo caminho do servidor que respeita mês fechado (alterarWorkspaceNoServidorContabil). */
  alterarWorkspace: <T>(cnpj: string, alterar: (payload: Record<string, any>, ctx: { fechadas: Set<string> }) => { payload: Record<string, any> | null; resultado: T }, autor?: { userId: string; login: string }) => Promise<{ resultado: T; dados: Record<string, any> | null; versao: number | null; atualizadoEm: string | null }>;
  /** Movimentos do extrato do mês sem conciliação (null = sem como conferir). */
  extratoPendentes?: (cnpj: string, competencia: string) => Promise<number | null>;
  /** Folhas do DP sem partida (conferidor de folha). */
  folhasDP?: (cnpj: string, payload: Record<string, any>) => Promise<Array<{ id: string; titulo: string; detalhe: string }>>;
  log?: (m: string, e?: unknown) => void;
}

export function criarRevisorContabil(deps: DepsRevisor) {
  const agora = () => deps.agora?.() ?? new Date();
  const log = (m: string, e?: unknown) => { try { (deps.log ?? ((msg, err) => console.error(`[revisor] ${msg}`, err instanceof Error ? err.message : err ?? "")))(m, e); } catch { /* nunca derruba */ } };
  let pronta: Promise<void> | null = null;
  const preparar = (): Promise<void> => {
    pronta ??= (async () => {
      await deps.consultar(`CREATE TABLE IF NOT EXISTS contabil_revisor_achados (
        id text PRIMARY KEY, tenant_id text NOT NULL, cnpj text NOT NULL, empresa text NOT NULL DEFAULT '', competencia text NOT NULL DEFAULT '',
        regra text NOT NULL, nivel text NOT NULL, tipo text NOT NULL, texto text NOT NULL, tela text NOT NULL DEFAULT '', correcao text, pergunta text,
        origem text NOT NULL, estado text NOT NULL, por text NOT NULL DEFAULT '', criado_em timestamptz NOT NULL, atualizado_em timestamptz NOT NULL,
        UNIQUE (tenant_id, cnpj, competencia, regra, origem))`);
      await deps.consultar(`CREATE TABLE IF NOT EXISTS contabil_revisor_rodadas (tenant_id text PRIMARY KEY, ultima_em timestamptz NOT NULL, resumo text NOT NULL DEFAULT '')`);
    })().catch((e) => { pronta = null; throw e; });
    return pronta;
  };
  async function fechadasDe(cnpj: string): Promise<Set<string>> {
    try { return new Set((await deps.consultar("SELECT competencia FROM contabil_period_closures WHERE cnpj=$1", [cnpj])).rows.map((r) => String(r.competencia))); }
    catch { return new Set(); }
  }
  async function extras(cnpj: string, competencia: string, payload: Record<string, any>): Promise<ExtrasMes> {
    const [extratoPendentes, folhasDP] = await Promise.all([
      deps.extratoPendentes ? deps.extratoPendentes(cnpj, competencia).catch(() => null) : Promise.resolve(null),
      deps.folhasDP ? deps.folhasDP(cnpj, payload).catch(() => null) : Promise.resolve(null),
    ]);
    return { extratoPendentes, folhasDP };
  }

  async function conferirAntes(acao: AcaoRevisada, cnpj: string, dados: any): Promise<Revisao> {
    if (acao !== "fechamento") return fecharRevisao(acao, []); // lançamento e conciliação são conferidos na própria tela (regras puras)
    const competencia = ehCompetencia(dados?.competencia) ? dados.competencia : "";
    if (!competencia) return fecharRevisao("fechamento", [{ regra: "competencia", nivel: "bloqueia", tipo: "falta", texto: "Está faltando a competência a fechar." }]);
    const payload = await deps.lerWorkspace(cnpj);
    if (!payload) return fecharRevisao("fechamento", [{ regra: "sem_dados", nivel: "bloqueia", tipo: "falta", texto: "Esta empresa ainda não tem dados contábeis salvos." }]);
    return revisarFechamento(payload, competencia, await fechadasDe(cnpj), await extras(cnpj, competencia, payload));
  }

  async function revisarEmpresa(cnpj: string, competencia: string): Promise<RevisaoEmpresa> {
    const c = soCnpj(cnpj);
    const payload = await deps.lerWorkspace(c);
    const nome = texto(payload?.empresa?.razaoSocial || payload?.empresa?.nomeFantasia || c, 160);
    const regime = String(payload?.empresa?.regime || payload?.empresa?.regimeTributario || "Não informado");
    if (!payload) return { cnpj: c, nome, regime, competencia, certo: [], risco: [], falta: [{ regra: "sem_dados", nivel: "bloqueia", tipo: "falta", texto: "Esta empresa ainda não tem dados contábeis salvos.", tela: "empresa", corrigivel: false }] };
    const m = revisarMes(payload, competencia, await fechadasDe(c), await extras(c, competencia, payload));
    const por = (x: AchadoRevisor): AchadoGeral => ({ ...x, tela: telaDaRegra(x.regra), corrigivel: Boolean(x.correcao) });
    return { cnpj: c, nome, regime, competencia, certo: m.certo, risco: m.risco.map(por), falta: m.falta.map(por) };
  }
  async function revisaoGeral(cnpjs: string[], competencia: string): Promise<RevisaoEmpresa[]> {
    const out: RevisaoEmpresa[] = [];
    for (const c of [...new Set(cnpjs.map(soCnpj).filter(Boolean))].slice(0, 300)) { try { out.push(await revisarEmpresa(c, competencia)); } catch (e) { log(`revisão da empresa ${c} falhou`, e); } }
    return out.sort((a, b) => (b.falta.length - a.falta.length) || (b.risco.length - a.risco.length) || a.nome.localeCompare(b.nome));
  }

  async function gravarAchados(tenantId: string, revisoes: RevisaoEmpresa[]): Promise<{ novos: number; abertos: number; resolvidos: number }> {
    await preparar(); const a = agora(); let novos = 0, abertos = 0, resolvidos = 0;
    for (const r of revisoes) {
      const achados = [...r.falta, ...r.risco];
      for (const x of achados) {
        const existe = (await deps.consultar("SELECT id, estado FROM contabil_revisor_achados WHERE tenant_id=$1 AND cnpj=$2 AND competencia=$3 AND regra=$4 AND origem='robo'", [tenantId, r.cnpj, r.competencia, x.regra])).rows[0];
        const correcao = x.corrigivel && x.correcao ? JSON.stringify(x.correcao) : null;
        if (existe) {
          if (existe.estado === "ignorado") continue;
          await deps.consultar("UPDATE contabil_revisor_achados SET nivel=$2, tipo=$3, texto=$4, tela=$5, correcao=$6, pergunta=$7, empresa=$8, estado='aberto', atualizado_em=$9 WHERE id=$1", [existe.id, x.nivel, x.tipo, texto(x.texto), x.tela, correcao, x.pergunta ?? null, r.nome, a]);
          abertos += 1; continue;
        }
        await deps.consultar(`INSERT INTO contabil_revisor_achados(id,tenant_id,cnpj,empresa,competencia,regra,nivel,tipo,texto,tela,correcao,pergunta,origem,estado,criado_em,atualizado_em)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'robo','aberto',$13,$13)`, [crypto.randomBytes(9).toString("base64url"), tenantId, r.cnpj, r.nome, r.competencia, x.regra, x.nivel, x.tipo, texto(x.texto), x.tela, correcao, x.pergunta ?? null, a]);
        novos += 1; abertos += 1;
      }
      const fechou = await deps.consultar(`UPDATE contabil_revisor_achados SET estado='resolvido', atualizado_em=$4 WHERE tenant_id=$1 AND cnpj=$2 AND competencia=$3 AND origem='robo' AND estado IN ('aberto','corrigido') AND NOT (regra = ANY($5::text[])) RETURNING id`, [tenantId, r.cnpj, r.competencia, a, achados.map((x) => x.regra)]);
      resolvidos += fechou.rows.length;
    }
    return { novos, abertos, resolvidos };
  }

  async function rodarRobo(opcoes: { escritorios: () => Promise<Array<{ id: string; cnpjs: string[] }>>; forcar?: boolean }): Promise<{ escritorios: number; revisados: number; empresas: number; novos: number; abertos: number; resolvidos: number; resumo: string; atencao: boolean }> {
    await preparar();
    const momento = agora(); const competencia = competenciaAnterior(diaSP(momento));
    const out = { escritorios: 0, revisados: 0, empresas: 0, novos: 0, abertos: 0, resolvidos: 0 };
    for (const e of await opcoes.escritorios()) {
      out.escritorios += 1;
      if (!opcoes.forcar) {
        const u = (await deps.consultar("SELECT ultima_em FROM contabil_revisor_rodadas WHERE tenant_id=$1", [e.id])).rows[0];
        if (u && momento.getTime() - new Date(u.ultima_em).getTime() < DIAS_ENTRE_REVISOES * 86_400_000) continue;
      }
      try {
        const revisoes = await revisaoGeral(e.cnpjs, competencia);
        const g = await gravarAchados(e.id, revisoes);
        out.revisados += 1; out.empresas += revisoes.length; out.novos += g.novos; out.abertos += g.abertos; out.resolvidos += g.resolvidos;
        const resumo = `${revisoes.length} empresa(s) revisada(s) em ${competencia}; ${g.abertos} item(ns) em Corrigir (${g.novos} novo(s)); ${g.resolvidos} resolvido(s).`;
        await deps.consultar("INSERT INTO contabil_revisor_rodadas(tenant_id, ultima_em, resumo) VALUES($1,$2,$3) ON CONFLICT (tenant_id) DO UPDATE SET ultima_em=$2, resumo=$3", [e.id, momento, resumo]);
      } catch (err) { log(`revisão do escritório ${e.id} falhou`, err); }
    }
    const resumo = out.revisados === 0 ? `Nenhum escritório precisava de revisão agora (a revisão geral roda uma vez por semana; ${out.escritorios} escritório(s) conferido(s)).`
      : `Revisão geral de ${competencia.slice(5)}/${competencia.slice(0, 4)}: ${out.revisados} escritório(s), ${out.empresas} empresa(s); ${out.abertos} item(ns) em Corrigir (${out.novos} novo(s)); ${out.resolvidos} resolvido(s) desde a última revisão.`;
    return { ...out, resumo, atencao: out.novos > 0 };
  }

  const paraItem = (l: any): ItemCorrigir => {
    let correcao: ItemCorrigir["correcao"] = null; try { correcao = l.correcao ? JSON.parse(String(l.correcao)) : null; } catch { correcao = null; }
    return { id: String(l.id), cnpj: String(l.cnpj), empresa: String(l.empresa || ""), competencia: String(l.competencia || ""), regra: String(l.regra), nivel: String(l.nivel), tipo: String(l.tipo), texto: String(l.texto), tela: String(l.tela || ""), correcao, pergunta: l.pergunta ?? null, origem: String(l.origem), estado: String(l.estado), criadoEm: new Date(l.criado_em).toISOString(), atualizadoEm: new Date(l.atualizado_em).toISOString() };
  };
  async function listarCorrigir(tenantId: string, cnpjs: string[], cnpj?: string): Promise<ItemCorrigir[]> {
    await preparar();
    const r = await deps.consultar("SELECT * FROM contabil_revisor_achados WHERE tenant_id=$1 AND origem='robo' AND estado='aberto' ORDER BY atualizado_em DESC LIMIT 500", [tenantId]);
    return r.rows.map(paraItem).filter((i) => cnpjs.includes(i.cnpj) && (!cnpj || i.cnpj === soCnpj(cnpj))).sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "bloqueia" ? -1 : 1));
  }
  async function ultimaRodada(tenantId: string): Promise<{ em: string; resumo: string } | null> {
    await preparar();
    const r = (await deps.consultar("SELECT ultima_em, resumo FROM contabil_revisor_rodadas WHERE tenant_id=$1", [tenantId])).rows[0];
    return r ? { em: new Date(r.ultima_em).toISOString(), resumo: String(r.resumo || "") } : null;
  }

  type Falha = { ok: false; status: number; motivo: string };
  async function itemDaSessao(s: SessaoRevisor, id: string, escrever: boolean): Promise<{ ok: true; item: ItemCorrigir } | Falha> {
    await preparar();
    const l = (await deps.consultar("SELECT * FROM contabil_revisor_achados WHERE id=$1 AND tenant_id=$2", [String(id).slice(0, 40), s.tenantId])).rows[0];
    if (!l) return { ok: false, status: 404, motivo: "Item não encontrado." };
    const item = paraItem(l);
    if (!s.cnpjs.includes(item.cnpj)) return { ok: false, status: 403, motivo: "Esta empresa não está no seu acesso." };
    if (escrever && !s.podeEscrever(item.cnpj)) return { ok: false, status: 403, motivo: "Seu acesso a esta empresa é somente leitura." };
    return { ok: true, item };
  }

  /** "Corrigir para mim": confere de novo, dentro da gravação, e só mexe em pendente de aprovação de mês aberto. */
  async function corrigir(s: SessaoRevisor, id: string): Promise<{ ok: true; mensagem: string; cnpj: string; dados: Record<string, any> | null; versao: number | null } | Falha> {
    const r = await itemDaSessao(s, id, true); if (r.ok === false) return r;
    const item = r.item;
    if (item.estado !== "aberto") return { ok: false, status: 409, motivo: "Este item já foi tratado." };
    if (item.correcao?.campo !== "lancamentos_pendentes") return { ok: false, status: 422, motivo: "Este item não tem correção automática: só você sabe o dado certo. Use \"Me leva lá\"." };
    const ids = new Set(item.correcao.valor.split(",").filter(Boolean));
    try {
      const g = await deps.alterarWorkspace(item.cnpj, (payload, { fechadas }) => {
        const contas = Array.isArray(payload.contas) ? payload.contas : [];
        const lancamentos: LancamentoContabil[] = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
        const atuais = correcoesDeLancamentosPendentes(contas, lancamentos, fechadas).filter((x) => ids.has(x.id));
        if (!atuais.length) return { payload: null, resultado: 0 };
        const porId = new Map(atuais.map((x) => [x.id, x.campos]));
        return { payload: { ...payload, lancamentos: lancamentos.map((l) => (porId.has(l.id) ? { ...l, ...porId.get(l.id) } : l)) }, resultado: atuais.length };
      }, { userId: s.userId, login: s.login });
      await deps.consultar(`UPDATE contabil_revisor_achados SET estado=$2, por=$3, atualizado_em=$4 WHERE id=$1`, [item.id, g.resultado ? "corrigido" : "resolvido", s.login, agora()]);
      if (!g.resultado) return { ok: false, status: 409, motivo: "Conferi de novo e esses lançamentos já estão certos (ou já foram aprovados, ou o mês foi fechado)." };
      return { ok: true, mensagem: `Corrigi ${g.resultado} lançamento(s) pendente(s) pelo plano de contas e pela data. Eles continuam esperando a sua aprovação.`, cnpj: item.cnpj, dados: g.dados, versao: g.versao };
    } catch (e: any) {
      const status = Number(e?.status) || 503;
      return { ok: false, status, motivo: status === 409 ? String(e?.message || "O mês está fechado; nada foi gravado.") : "Não consegui corrigir agora. Nada foi alterado." };
    }
  }

  async function ignorar(s: SessaoRevisor, id: string): Promise<{ ok: true } | Falha> {
    const r = await itemDaSessao(s, id, true); if (r.ok === false) return r;
    await deps.consultar(`UPDATE contabil_revisor_achados SET estado='ignorado', por=$2, atualizado_em=$3 WHERE id=$1`, [r.item.id, s.login, agora()]);
    return { ok: true };
  }

  async function registrarSalvoComAviso(s: SessaoRevisor, p: { acao: string; cnpj: string; competencia: string; achados: Array<{ regra: string; texto: string; nivel: string }> }): Promise<number> {
    await preparar(); const a = agora(); let n = 0;
    for (const x of p.achados.slice(0, 20)) {
      if (x.nivel === "bloqueia") continue;
      await deps.consultar(`INSERT INTO contabil_revisor_achados(id,tenant_id,cnpj,empresa,competencia,regra,nivel,tipo,texto,tela,origem,estado,por,criado_em,atualizado_em)
        VALUES($1,$2,$3,'',$4,$5,'atencao','risco',$6,$7,'salvar','salvo_com_aviso',$8,$9,$9)
        ON CONFLICT (tenant_id, cnpj, competencia, regra, origem) DO UPDATE SET texto=$6, por=$8, atualizado_em=$9`,
        [crypto.randomBytes(9).toString("base64url"), s.tenantId, p.cnpj, p.competencia, `${texto(p.acao, 30)}:${texto(x.regra, 60)}`, texto(x.texto), telaDaRegra(x.regra), s.login, a]);
      n += 1;
    }
    return n;
  }

  async function parecer(cnpj: string, competencia: string): Promise<{ conferidos: string[]; atencao: AchadoRevisor[]; texto: string }> {
    const r = await revisarEmpresa(cnpj, competencia);
    const atencao = [...r.falta, ...r.risco].slice(0, 8).map(({ tela: _t, corrigivel: _c, ...x }) => x);
    return { conferidos: r.certo, atencao, texto: parecerEmTexto(r.certo, atencao) };
  }

  return { preparar, conferirAntes, revisarEmpresa, revisaoGeral, gravarAchados, rodarRobo, listarCorrigir, ultimaRodada, corrigir, ignorar, registrarSalvoComAviso, parecer };
}
export type RevisorContabil = ReturnType<typeof criarRevisorContabil>;

// ------------------------------------------------------------------------------------------------
// Rotas
// ------------------------------------------------------------------------------------------------
export interface DepsRotasRevisor {
  revisor: RevisorContabil;
  sessao: (req: Request) => SessaoRevisor | undefined;
  /** Nome da empresa no acesso (para a busca por nome). */
  nomesDasEmpresas?: (cnpjs: string[]) => Promise<Array<{ cnpj: string; nome: string }>>;
  rodarAgora?: (s: SessaoRevisor, req: Request) => { ok: boolean; status?: number; motivo?: string };
  agora?: () => Date;
}

export function registrarRotasRevisor(app: Express, mw: { exigirSessao: RequestHandler; exigirOrigem: RequestHandler }, deps: DepsRotasRevisor): void {
  const sessao = (req: Request, res: Response): SessaoRevisor | null => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) { res.status(401).json({ sucesso: false, motivo: "Entre no sistema." }); return null; }
    return s;
  };
  const competenciaPedida = (v: unknown) => (ehCompetencia(v) ? v : competenciaAnterior(diaSP(deps.agora?.() ?? new Date())));
  const semAcento = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  app.post("/api/revisor/conferir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const acao = req.body?.acao;
    if (!(ACOES_REVISADAS as readonly string[]).includes(acao)) return res.status(400).json({ sucesso: false, motivo: "Ação desconhecida." });
    const cnpj = soCnpj(req.body?.cnpj);
    if (!cnpj || !s.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    try { return res.json({ sucesso: true, revisao: await deps.revisor.conferirAntes(acao, cnpj, req.body?.dados) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "O Revisor não conseguiu conferir agora." }); }
  });
  app.post("/api/revisor/salvo-com-aviso", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpj = soCnpj(req.body?.cnpj);
    if (!cnpj || !s.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    const achados = Array.isArray(req.body?.achados) ? req.body.achados.filter((x: any) => x && typeof x.regra === "string").map((x: any) => ({ regra: String(x.regra), texto: String(x.texto || ""), nivel: String(x.nivel || "atencao") })) : [];
    try { return res.json({ sucesso: true, registrados: await deps.revisor.registrarSalvoComAviso(s, { acao: String(req.body?.acao || ""), cnpj, competencia: ehCompetencia(req.body?.competencia) ? req.body.competencia : "", achados }) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui registrar o aviso agora." }); }
  });
  app.get("/api/revisor/geral", mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const competencia = competenciaPedida(req.query.competencia);
    const pedido = soCnpj(req.query.cnpj);
    if (pedido && !s.cnpjs.includes(pedido)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    try {
      const nome = typeof req.query.nome === "string" ? semAcento(req.query.nome.slice(0, 80)).trim() : "";
      let alvo = pedido ? [pedido] : s.cnpjs;
      if (!pedido && nome) {
        const nomes = deps.nomesDasEmpresas ? await deps.nomesDasEmpresas(s.cnpjs) : [];
        alvo = nomes.filter((x) => s.cnpjs.includes(x.cnpj) && semAcento(x.nome).includes(nome)).map((x) => x.cnpj);
        if (!alvo.length) return res.status(404).json({ sucesso: false, motivo: `Não achei empresa com "${String(req.query.nome).slice(0, 80)}" no nome entre as do seu acesso.` });
      }
      return res.json({ sucesso: true, competencia, empresas: await deps.revisor.revisaoGeral(alvo, competencia) });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui fazer a revisão agora." }); }
  });
  app.get("/api/revisor/parecer", mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpj = soCnpj(req.query.cnpj);
    if (!cnpj || !s.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    try { return res.json({ sucesso: true, parecer: await deps.revisor.parecer(cnpj, competenciaPedida(String(req.query.competencia || "").slice(0, 7))) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui montar o parecer agora." }); }
  });
  app.get("/api/revisor/corrigir", mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    try {
      const [itens, ultima] = await Promise.all([deps.revisor.listarCorrigir(s.tenantId, s.cnpjs, req.query.cnpj ? String(req.query.cnpj) : undefined), deps.revisor.ultimaRodada(s.tenantId)]);
      return res.json({ sucesso: true, itens, ultimaRodada: ultima });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui ler a lista Corrigir agora." }); }
  });
  app.post("/api/revisor/achados/:id/corrigir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    try {
      const r = await deps.revisor.corrigir(s, String(req.params.id));
      if (r.ok === false) return res.status(r.status).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true, mensagem: r.mensagem, cnpj: r.cnpj, dados: r.dados, versao: r.versao, persistencia: "postgresql" });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui corrigir agora. Nada foi alterado." }); }
  });
  app.post("/api/revisor/achados/:id/ignorar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    try {
      const r = await deps.revisor.ignorar(s, String(req.params.id));
      if (r.ok === false) return res.status(r.status).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não consegui guardar agora." }); }
  });
  app.post("/api/revisor/rodar-agora", mw.exigirOrigem, mw.exigirSessao, (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const r = deps.rodarAgora?.(s, req) ?? { ok: false, motivo: "A revisão na hora não está disponível agora." };
    if (!r.ok) return res.status(r.status ?? 409).json({ sucesso: false, motivo: r.motivo });
    return res.json({ sucesso: true, mensagem: "Revisão geral começou. Em alguns minutos a lista Corrigir é atualizada." });
  });
}
