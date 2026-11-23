// Rotas da Central do Lucro Real: mesmo controle de acesso das outras telas do Lucro Real (só empresas da sessão; somente leitura não grava).
import type express from "express";
import { acessoEmpresa } from "./escrituracaoRotas";
import { normalizarCnpjAcesso } from "./authContabil";
import { darBaixa, decidirDivergencia, painelCentral, conferirEmpresaLucroReal, bloqueioPisCofinsLR, type DepsCentral } from "./centralLucroReal";
import { excluirJcp, listarJcp, registrarJcp } from "./lucroRealObrigacoesExtras";
import { situacaoAvisosCelular, type ResumoAviso } from "./avisoCelularLucroReal";

type Mw = express.RequestHandler;
const anoDe = (v: unknown) => { const a = Number(v); return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null; };

export interface DepsRotasCentral extends DepsCentral {
  sessao: (req: express.Request) => { cnpjs: string[]; login?: string } | undefined; empresasLucroReal: (cnpjs: string[]) => Promise<string[]>;
  /** Integração servidor a servidor (Bearer MURADE_INTEGRATION_TOKEN): responde 401/503 e devolve true quando NÃO pode seguir. */
  negarIntegracao: (req: express.Request, res: express.Response) => boolean;
  /** Manda agora o aviso no celular das empresas indicadas (botão e Agente). */
  enviarAvisosAgora: (cnpjs: string[]) => Promise<ResumoAviso>;
  /** Busca agora no Fiscal as retenções do ano da empresa. */
  atualizarRetencoes: (cnpj: string, ano: number) => Promise<number>;
}
const centavosDe = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isSafeInteger(Math.round(v * 100)) && v >= 0 ? Math.round(v * 100) : null;
  let t = String(v ?? "").trim().replace(/^R\$\s*/, ""); if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t); if (!m) return null;
  const n = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")); return Number.isSafeInteger(n) ? n : null;
};

export function registrarRotasCentralLucroReal(app: express.Express, mw: { exigirSessao: Mw; exigirOrigem: Mw }, deps: DepsRotasCentral): void {
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
  // Fiscal pergunta, na hora de confirmar o PIS/COFINS não cumulativos do mês e de conferir o DARF 6912/5856, se a Central bloqueou.
  app.get("/api/integracao/lucro-real/bloqueio-pis-cofins", async (req, res) => {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Vary", "Authorization");
    if (deps.negarIntegracao(req, res)) return;
    const cnpj = normalizarCnpjAcesso(req.query.cnpj); const competencia = String(req.query.competencia || "");
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return res.status(400).json({ sucesso: false, motivo: "Informe o CNPJ e a competência (AAAA-MM)." });
    try { return res.json({ sucesso: true, cnpj, competencia, ...(await bloqueioPisCofinsLR(deps, cnpj, competencia)) }); }
    catch (e: any) { console.error("[central-lucro-real] bloqueio", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "A Central do Lucro Real não conseguiu conferir agora." }); }
  });
  // JCP pago ou creditado: vira a obrigação do IRRF (DARF 5706) na Central.
  app.get("/api/workspaces/:cnpj/lucro-real/jcp-pagamentos", mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try { return res.json({ sucesso: true, jcp: await listarJcp(deps.consultar, a.cnpj, anoDe(req.query.ano) ?? undefined) }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/jcp-pagamentos", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const valor = centavosDe(req.body?.valor);
    if (valor === null) return res.status(400).json({ sucesso: false, motivo: "Digite o valor bruto do JCP em reais (ex.: 10.000,00)." });
    try { const r = await registrarJcp(deps.consultar, a.cnpj, { dataPagamento: String(req.body?.dataPagamento || ""), valorCentavos: valor, beneficiarios: String(req.body?.beneficiarios || "") }, a.sessao.login); return "erro" in r ? res.status(400).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true, jcp: r.jcp }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/jcp-pagamentos/excluir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try { const r = await excluirJcp(deps.consultar, a.cnpj, String(req.body?.id || "")); return "erro" in r ? res.status(404).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true }); } catch (e) { return falha(res, e); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/retencoes/atualizar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = anoDe(req.body?.ano) ?? Number(deps.hoje().slice(0, 4));
    try { const n = await deps.atualizarRetencoes(a.cnpj, ano); return res.json({ sucesso: true, meses: n, ...(await painelCentral(deps, a.cnpj, ano)) }); }
    catch (e: any) { return res.status(503).json({ sucesso: false, motivo: `Não deu para ler as retenções no Fiscal agora: ${String(e?.message || e).slice(0, 120)}` }); }
  });
  // Aviso no celular (pelo mecanismo do Fiscal): situação de hoje e "Enviar agora" — só as empresas da sessão.
  app.get("/api/lucro-real/aviso-celular", mw.exigirSessao, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { const cnpjs = await deps.empresasLucroReal(s.cnpjs.map(normalizarCnpjAcesso).slice(0, 300)); return res.json({ sucesso: true, empresas: cnpjs.length, hoje: await situacaoAvisosCelular(deps.consultar, cnpjs, deps.hoje()) }); }
    catch (e) { return falha(res, e); }
  });
  app.post("/api/lucro-real/aviso-celular/enviar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const s = deps.sessao(req); if (!s) return res.status(401).json({ sucesso: false });
    try { const cnpjs = await deps.empresasLucroReal(s.cnpjs.map(normalizarCnpjAcesso).slice(0, 300)); const alvo = req.body?.cnpj ? cnpjs.filter((c) => c === normalizarCnpjAcesso(req.body.cnpj)) : cnpjs; return res.json({ sucesso: true, ...(await deps.enviarAvisosAgora(alvo)) }); }
    catch (e) { return falha(res, e); }
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
