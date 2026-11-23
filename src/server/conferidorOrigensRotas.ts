// Rotas da tela "Conferência Fiscal × DP × Contábil" (dentro de Revisão das origens) e da Agente IA.
// Cada pessoa só vê e roda as empresas da própria sessão: um escritório nunca vê nem mexe no de outro.
import type { Express, Request, RequestHandler, Response } from "express";
import { andamentoOrigens, lerResultadosOrigens, rodarConferenciaOrigens, type DepsConferidorOrigens } from "./conferidorOrigens";
import { completarPlanoPadraoContabil, listarAlertasNotaSemValorContabil, resolverAlertaNotaSemValorContabil } from "./authContabil";

export type SessaoOrigens = { login: string; cnpjs: string[]; tenantId: string; podeEscrever: (cnpj: string) => boolean };

const soCnpj = (v: unknown): string | null => { const d = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export function registrarRotasConferidorOrigens(app: Express, mw: { exigirSessao: RequestHandler; exigirOrigem: RequestHandler }, deps: { sessao: (req: Request) => SessaoOrigens | undefined; conferidor: () => DepsConferidorOrigens; aoTerminar?: (resumo: string) => void }): void {
  const sessao = (req: Request, res: Response): SessaoOrigens | null => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: "Entre no sistema." }); return null; }
    return s;
  };
  const escopo = (s: SessaoOrigens) => `esc:${s.tenantId}`;
  const alvo = (s: SessaoOrigens, v: unknown): string[] | null => {
    if (v === undefined || v === null || v === "") return s.cnpjs;
    const c = soCnpj(v);
    return c && s.cnpjs.includes(c) ? [c] : null;
  };

  app.get("/api/conferencia-origens", mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpjs = alvo(s, req.query.cnpj);
    if (!cnpjs) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    try {
      const d = deps.conferidor();
      const [resultados, alertas] = await Promise.all([lerResultadosOrigens(d.consultar, cnpjs), listarAlertasNotaSemValorContabil(cnpjs)]);
      return res.json({ sucesso: true, resultados, alertas, andamento: andamentoOrigens(escopo(s)), robo: andamentoOrigens("todas") });
    } catch (e: any) {
      console.error("Falha ao ler a conferência das origens:", e?.message || e);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler a conferência agora." });
    }
  });

  app.get("/api/conferencia-origens/andamento", mw.exigirSessao, (req, res) => {
    const s = sessao(req, res); if (!s) return;
    return res.json({ sucesso: true, andamento: andamentoOrigens(escopo(s)) });
  });

  // "Rodar agora": confere e corrige o seguro só nas empresas do escritório (ou numa delas). A tela acompanha pela barra de andamento.
  app.post("/api/conferencia-origens/rodar-agora", mw.exigirOrigem, mw.exigirSessao, (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpjs = alvo(s, req.body?.cnpj);
    if (!cnpjs) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    if (!cnpjs.length) return res.status(400).json({ sucesso: false, motivo: "Nenhuma empresa no seu acesso." });
    if (andamentoOrigens(escopo(s)).executando) return res.status(409).json({ sucesso: false, motivo: "A conferência já está rodando; acompanhe a barra de andamento." });
    void rodarConferenciaOrigens(deps.conferidor(), cnpjs, escopo(s))
      .then((p) => deps.aoTerminar?.(`Rodada pedida por um escritório: ${p.empresas} empresa(s), ${p.correcoes} correção(ões).`))
      .catch((e) => console.error("Falha na conferência das origens pedida na hora:", e?.message || e));
    return res.json({ sucesso: true, total: cnpjs.length, mensagem: `Conferência começou em ${cnpjs.length} empresa(s). Acompanhe a barra de andamento.` });
  });

  // O contador marca o alerta de nota cancelada já lançada como resolvido (ex.: estornou com outro histórico). Nada é lançado aqui.
  app.post("/api/conferencia-origens/alertas/resolver", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpj = soCnpj(req.body?.cnpj);
    const referencia = String(req.body?.referencia ?? "");
    if (!cnpj || !s.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." });
    if (!referencia.startsWith(`FISCAL:${cnpj}:`) || referencia.length > 220) return res.status(400).json({ sucesso: false, motivo: "Alerta inválido." });
    try {
      const ok = await resolverAlertaNotaSemValorContabil(cnpj, referencia, s.login);
      return ok ? res.json({ sucesso: true }) : res.status(404).json({ sucesso: false, motivo: "Alerta não encontrado ou já resolvido." });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível gravar agora." }); }
  });

  // Completar o plano de contas com o padrão — só acrescenta. Clique da pessoa (vale para qualquer plano); o robô só faz no plano provisório.
  app.post("/api/conferencia-origens/completar-plano", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = sessao(req, res); if (!s) return;
    const cnpj = soCnpj(req.body?.cnpj);
    if (!cnpj || !s.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Esta empresa não está no seu acesso." });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." });
    try {
      const r = await completarPlanoPadraoContabil(cnpj, false);
      if (r.motivo) return res.status(409).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true, ...r, mensagem: r.acrescentadas ? `${r.acrescentadas} conta(s) do plano padrão acrescentadas. Nenhuma conta existente foi mudada.` : "O plano já tem todas as contas do padrão que cabem nele." });
    } catch (e: any) {
      console.error("Falha ao completar o plano padrão:", e?.message || e);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível completar o plano agora." });
    }
  });
}
