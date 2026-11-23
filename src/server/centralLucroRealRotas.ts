// Rotas da Central do Lucro Real: mesmo controle de acesso das outras telas do Lucro Real (só empresas da sessão; somente leitura não grava).
import type express from "express";
import { acessoEmpresa } from "./escrituracaoRotas";
import { normalizarCnpjAcesso } from "./authContabil";
import { darBaixa, decidirDivergencia, painelCentral, conferirEmpresaLucroReal, type DepsCentral } from "./centralLucroReal";

type Mw = express.RequestHandler;
const anoDe = (v: unknown) => { const a = Number(v); return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null; };

export function registrarRotasCentralLucroReal(app: express.Express, mw: { exigirSessao: Mw; exigirOrigem: Mw }, deps: DepsCentral & { sessao: (req: express.Request) => { cnpjs: string[] } | undefined; empresasLucroReal: (cnpjs: string[]) => Promise<string[]> }): void {
  const falha = (res: express.Response, e: any) => { console.error("[central-lucro-real]", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler a Central do Lucro Real agora. Tente de novo." }); };
  app.get("/api/workspaces/:cnpj/lucro-real/central", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = anoDe(req.query.ano) ?? Number(deps.hoje().slice(0, 4));
    try { return res.json({ sucesso: true, ano, ...(await painelCentral(deps, a.cnpj, ano)) }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/central/conferir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = anoDe(req.body?.ano) ?? Number(deps.hoje().slice(0, 4));
    try { await conferirEmpresaLucroReal(deps, a.cnpj, ano); return res.json({ sucesso: true, ano, ...(await painelCentral(deps, a.cnpj, ano)) }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/divergencias/decidir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try { const r = await decidirDivergencia(deps.consultar, a.cnpj, String(req.body?.id ?? ""), String(req.body?.motivo ?? ""), a.sessao.login); return "erro" in r ? res.status(400).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/baixa", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try { const r = await darBaixa(deps.consultar, a.cnpj, String(req.body?.obrigacaoId ?? ""), String(req.body?.recibo ?? ""), a.sessao.login, req.body?.desfazer === true); return "erro" in r ? res.status(400).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true }); } catch (e) { return falha(res, e); }
  });
  // Faixa da tela e Agente: avisos vermelhos de TODAS as empresas do Lucro Real da sessão (só título e texto; nada de outro escritório).
  app.get("/api/lucro-real/avisos", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try {
      const ano = Number(deps.hoje().slice(0, 4)); const avisos: Array<{ cnpj: string; nivel: string; titulo: string; texto: string; estimativa: string | null }> = [];
      for (const cnpj of await deps.empresasLucroReal(s.cnpjs.map(normalizarCnpjAcesso).slice(0, 300))) {
        for (const al of (await painelCentral(deps, cnpj, ano)).alertas) avisos.push({ cnpj, nivel: al.nivel, titulo: al.titulo, texto: al.texto, estimativa: al.estimativa });
      }
      return res.json({ sucesso: true, avisos: avisos.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === "vermelho" ? -1 : 1)) });
    } catch (e) { return falha(res, e); }
  });
}
