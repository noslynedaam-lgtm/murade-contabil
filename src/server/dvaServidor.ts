// DVA no servidor: Robô Conferidor da DVA (de 6 em 6 horas, só lê), "Rodar agora" com barra (só as empresas da sessão), a DVA de uma
// empresa para a tela e para a Agente e a escolha da linha de UMA conta (cartão da Agente). Cálculo em src/utils/dva.ts (CPC 09 (R1) e
// Lei 6.404/1976, art. 176, V, e art. 188, II). Nada aqui lança, aprova ou apaga; a escolha de linha só muda empresa.classificacaoDva.
import type express from "express";
import type { ContaPlano, EmpresaDados, LancamentoContabil } from "../types";
import { calcularDva, ehLinhaDva, FONTES_DVA, linhasDaDva, resumoDva, ROTULO_DVA, type Dva } from "../utils/dva";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
export type AchadoDva = { cnpj: string; ano: number; fecha: boolean; completa: boolean; obrigatoria: boolean; nivel: "ok" | "atencao" | "falta"; texto: string; verificadoEm: string };

/** Confere a DVA do ano de UMA empresa. null = sem movimento de resultado no ano (nada a conferir). */
export function conferirDvaWorkspace(cnpj: string, payload: Record<string, any>, ano: number, agora = new Date()): AchadoDva | null {
  const contas: ContaPlano[] = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos: LancamentoContabil[] = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  const empresa = (payload?.empresa || {}) as EmpresaDados;
  if (!contas.length || !lancamentos.some((l) => String(l?.data || "").startsWith(`${ano}-`))) return null;
  const d = calcularDva({ contas, lancamentos, de: `${ano}-01`, ate: `${ano}-12`, empresa });
  if (!d.contas.length) return null;
  const nivel: AchadoDva["nivel"] = d.completa ? "ok" : d.obrigatoria ? "falta" : "atencao";
  const texto = d.completa ? `DVA ${ano}: ${resumoDva(d)}`
    : `DVA ${ano} não fecha${d.obrigatoria ? " (obrigatória: companhia aberta, Lei 6.404/1976, art. 176, V)" : ""}: ${resumoDva(d).replace(/^DVA não fecha: /, "")} Abra Demonstrações e relatórios › DVA e escolha a linha das contas pendentes.`;
  return { cnpj, ano, fecha: d.fecha, completa: d.completa, obrigatoria: d.obrigatoria, nivel, texto, verificadoEm: agora.toISOString() };
}

const achados = new Map<string, AchadoDva>();
export const achadosDva = (cnpjs?: string[]) => [...achados.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj));
export const limparAchadosDvaParaTeste = () => achados.clear();
const anoDoRobo = (agora: Date) => agora.getFullYear() - 1;

/** Robô Conferidor da DVA: todas as empresas (ou só as indicadas), ano anterior. Só lê. */
export async function rodarConferidorDva(consultar: Consultar, o: { cnpjs?: string[]; ano?: number; agora?: Date; aoAndar?: (feito: number, total: number) => void } = {}): Promise<{ conferidas: number; naoFecham: AchadoDva[]; resumo: string }> {
  const agora = o.agora ?? new Date(); const ano = o.ano ?? anoDoRobo(agora);
  const filtro = o.cnpjs ? o.cnpjs.filter((c) => /^[0-9A-Z]{14}$/.test(c)) : null;
  if (filtro && !filtro.length) return { conferidas: 0, naoFecham: [], resumo: "Nenhuma empresa para conferir." };
  const total = filtro ? filtro.length : Number((await consultar("SELECT count(*)::int AS n FROM contabil_company_workspaces")).rows[0]?.n || 0);
  let conferidas = 0, feito = 0, desloc = 0; const naoFecham: AchadoDva[] = [];
  for (;;) {
    const lote = filtro
      ? await consultar("SELECT cnpj, payload FROM contabil_company_workspaces WHERE cnpj = ANY($1::text[]) ORDER BY cnpj LIMIT 25 OFFSET $2", [filtro, desloc])
      : await consultar("SELECT cnpj, payload FROM contabil_company_workspaces ORDER BY cnpj LIMIT 25 OFFSET $1", [desloc]);
    if (!lote.rows.length) break;
    for (const row of lote.rows) {
      const cnpj = String(row.cnpj).trim(); feito += 1; o.aoAndar?.(feito, Math.max(total, feito));
      try {
        const a = conferirDvaWorkspace(cnpj, row.payload || {}, ano, agora);
        if (a) { achados.set(cnpj, a); conferidas += 1; if (!a.completa) naoFecham.push(a); } else achados.delete(cnpj);
      } catch (e: any) { console.error(`Conferidor da DVA falhou para ${cnpj}:`, e?.message || e); }
    }
    desloc += lote.rows.length;
    if (lote.rows.length < 25) break;
  }
  const obrig = naoFecham.filter((a) => a.obrigatoria).length;
  const resumo = !conferidas ? `Nenhuma empresa com movimento de resultado em ${ano}.`
    : `${obrig ? "ATENÇÃO: " : ""}DVA ${ano} conferida em ${conferidas} empresa(s): ${conferidas - naoFecham.length} fecham (distribuído = gerado)${naoFecham.length ? `; ${naoFecham.length} não fecham${obrig ? ` (${obrig} companhia(s) aberta(s), onde a DVA é obrigatória)` : ""}` : ""}.`;
  return { conferidas, naoFecham, resumo };
}

type Sessao = { userId: string; login: string; tenant: string; cnpjs: string[]; podeEscrever: (cnpj: string) => boolean };
type Deps = {
  sessao: (req: express.Request) => Sessao | undefined;
  normalizarCnpj: (v: unknown) => string;
  consultar: Consultar;
  lerWorkspace: (cnpj: string) => Promise<Record<string, any> | null>;
  alterarWorkspace: <T>(cnpj: string, alterar: (payload: Record<string, any>, ctx: { fechadas: Set<string> }) => { payload: Record<string, any> | null; resultado: T }) => Promise<{ resultado: T; dados: Record<string, any> | null; versao: number | null }>;
};

export function dvaParaResposta(d: Dva) {
  return { ...d, linhasModelo: linhasDaDva(d), resumo: resumoDva(d), fontes: FONTES_DVA, rotulos: ROTULO_DVA };
}

export function registrarRotasDva(app: express.Express, mw: { exigirSessao: express.RequestHandler; exigirOrigem: express.RequestHandler }, d: Deps): void {
  const semCache = (res: express.Response) => res.setHeader("Cache-Control", "private, no-store");
  const cnpjDoAcesso = (s: Sessao, v: unknown) => { const c = d.normalizarCnpj(v); return c.length === 14 && s.cnpjs.includes(c) ? c : null; };

  app.get("/api/demonstracoes/:cnpj/dva", mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const cnpj = cnpjDoAcesso(s, req.params.cnpj); if (!cnpj) return res.status(403).json({ sucesso: false, motivo: "Este CNPJ não está vinculado ao seu acesso." });
    const ano = Number(req.query.ano); if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ sucesso: false, motivo: "Ano inválido." });
    const payload = await d.lerWorkspace(cnpj);
    if (!payload) return res.status(404).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados contábeis salvos." });
    const dva = calcularDva({ contas: payload.contas || [], lancamentos: payload.lancamentos || [], de: `${ano}-01`, ate: `${ano}-12`, empresa: payload.empresa || {} });
    return res.json({ sucesso: true, ano, dva: dvaParaResposta(dva), achado: achados.get(cnpj) || null });
  });

  // Escolha da linha de UMA conta (a tela grava pela própria empresa; esta rota é a da Agente, depois do cartão). linha "" volta à sugestão.
  app.post("/api/demonstracoes/:cnpj/dva/classificar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const cnpj = cnpjDoAcesso(s, req.params.cnpj); if (!cnpj) return res.status(403).json({ sucesso: false, motivo: "Este CNPJ não está vinculado ao seu acesso." });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é só de leitura." });
    const conta = String(req.body?.conta || "").trim().slice(0, 40); const linha = String(req.body?.linha || "").trim();
    if (!conta || (linha && !ehLinhaDva(linha))) return res.status(400).json({ sucesso: false, motivo: "Informe a conta e uma linha válida da DVA." });
    try {
      const r = await d.alterarWorkspace(cnpj, (payload) => {
        const c = (payload.contas || []).find((x: any) => x?.codigo === conta && x?.tipo === "analitica");
        if (!c) return { payload: null, resultado: "sem_conta" as const };
        const empresa = { ...(payload.empresa || {}) } as EmpresaDados & { classificacaoDva?: Record<string, string> };
        const atual = { ...(empresa.classificacaoDva || {}) };
        if (linha) atual[conta] = linha; else delete atual[conta];
        empresa.classificacaoDva = atual;
        return { payload: { ...payload, empresa }, resultado: "ok" as const };
      });
      if (r.resultado === "sem_conta") return res.status(404).json({ sucesso: false, motivo: "Não achei essa conta analítica no plano." });
      return res.json({ sucesso: true, mensagem: linha ? `Conta ${conta} na linha "${ROTULO_DVA[linha as keyof typeof ROTULO_DVA]}" da DVA.` : `Conta ${conta} voltou para a sugestão do sistema.`, dados: r.dados, versao: r.versao });
    } catch (e: any) {
      if (e?.name === "ErroAlteracaoWorkspace") return res.status(Number(e.status) || 409).json({ sucesso: false, motivo: String(e.message) });
      console.error("Falha ao gravar a linha da DVA:", e?.message || e);
      return res.status(503).json({ sucesso: false, motivo: "Não consegui gravar agora. Tente de novo em instantes." });
    }
  });

  // "Rodar agora" do Conferidor da DVA, com barra: só as empresas da sessão (isolado por escritório).
  const rodadas = new Map<string, { inicio: number; fase: string; feito: number; total: number; fim?: number; resultado?: string; erro?: string; naoFecham?: AchadoDva[] }>();
  app.post("/api/demonstracoes/dva/conferir-agora", mw.exigirOrigem, mw.exigirSessao, (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const atual = rodadas.get(s.tenant);
    if (atual && !atual.fim && Date.now() - atual.inicio < 10 * 60_000) return res.json({ sucesso: true, jaRodando: true, progresso: atual });
    const ano = Number(req.body?.ano);
    const st = { inicio: Date.now(), fase: "Conferindo a DVA", feito: 0, total: Math.max(1, s.cnpjs.length) } as NonNullable<ReturnType<typeof rodadas.get>>; rodadas.set(s.tenant, st);
    void rodarConferidorDva(d.consultar, { cnpjs: s.cnpjs.slice(0, 2000), ...(Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? { ano } : {}), aoAndar: (f, t) => { st.feito = f; st.total = Math.max(1, t); } })
      .then((r) => { st.resultado = r.resumo; st.naoFecham = r.naoFecham; st.fase = "Pronto"; st.feito = st.total; })
      .catch((e) => { st.erro = String(e?.message || e).slice(0, 200); st.fase = "Falhou"; })
      .finally(() => { st.fim = Date.now(); });
    return res.json({ sucesso: true, progresso: st });
  });
  app.get("/api/demonstracoes/dva/conferir-agora", mw.exigirSessao, (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const st = rodadas.get(s.tenant) || null; const meus = new Set(s.cnpjs);
    return res.json({ sucesso: true, progresso: st ? { ...st, naoFecham: (st.naoFecham || []).filter((a) => meus.has(a.cnpj)) } : null });
  });
}
