// Rotas da Apuração do Lucro Real (IRPJ/CSLL, e-Lalur/e-Lacs, JCP). Mesmo controle de acesso das outras telas: só empresas do
// escritório da pessoa; perfil somente leitura não grava; reabrir é do administrador.
import type express from "express";
import { acessoEmpresa } from "./escrituracaoRotas";
import {
  adicionarLancamentoLalur, apurarAnoLucroReal, calcularJcp, confirmarApuracaoReal, excluirLancamentoLalur, itensProvisaoReal, lerConfigLucroReal,
  listarApuracoesReal, listarLancamentosLalur, listarPagamentosReal, listarContasParteB, criarContaParteB, excluirContaParteB, saldosParteB, parteBDoAno, registrarPagamentoReal, reabrirApuracaoReal, salvarConfigLucroReal, BUCKET_ESTIMATIVA, CONFIG_LR_PADRAO, type DepsLucroReal,
} from "./lucroRealApuracao";

type Mw = express.RequestHandler;
export interface DepsRotasLucroReal extends DepsLucroReal {
  /** Grava a provisão confirmada no mesmo caminho das apurações do Fiscal (vira pré-lançamento para aprovação). */
  enviarProvisao: (cnpj: string, itens: ReturnType<typeof itensProvisaoReal>) => Promise<unknown>;
}
const centavos = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  let t = String(v ?? "").trim().replace(/^R\$\s*/, ""); if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t); if (!m) return null;
  const n = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")); return Number.isSafeInteger(n) ? n : null;
};
const anoDe = (v: unknown) => { const a = Number(v); return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null; };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };

export function registrarRotasLucroReal(app: express.Express, mw: { exigirSessao: Mw; exigirOrigem: Mw }, deps: DepsRotasLucroReal): void {
  const { consultar } = deps;
  const falha = (res: express.Response, e: any, padrao: string) => { const msg = e instanceof Error ? e.message : String(e); if (/inválid|Informe|precisa|já está confirmado|não encontrado|Diga de onde/.test(msg)) return res.status(400).json({ sucesso: false, motivo: msg }); console.error("[lucro-real]", msg); return res.status(503).json({ sucesso: false, motivo: padrao }); };
  // Saldos das outras contas da Parte B no ano (lê os lançamentos de todos os anos que usam alguma conta).
  const parteBContasDoAno = async (cnpj: string, ano: number) => {
    const contas = await listarContasParteB(consultar, cnpj);
    if (!contas.length) return [];
    const todos = (await consultar(`SELECT * FROM contabil_lalur_lancamentos WHERE cnpj=$1 AND conta_parte_b IS NOT NULL`, [cnpj])).rows.map((l: any) => ({ id: l.id, ano: Number(l.ano), mes: Number(l.mes), tributo: l.tributo, tipo: l.tipo, codigo: l.codigo, descricao: l.descricao, valorCentavos: Number(l.valor_centavos), justificativa: l.justificativa, contaParteB: l.conta_parte_b }));
    return saldosParteB(contas, todos as any, ano);
  };
  const painel = async (cnpj: string, ano: number) => {
    const periodos = await listarApuracoesReal(consultar, cnpj, ano);
    return { config: await lerConfigLucroReal(consultar, cnpj), padrao: CONFIG_LR_PADRAO, atividades: Object.entries(BUCKET_ESTIMATIVA).map(([id, b]) => ({ id, rotulo: b.rotulo })), periodos, parteB: parteBDoAno(periodos), lancamentos: await listarLancamentosLalur(consultar, cnpj, ano), pagamentos: await listarPagamentosReal(consultar, cnpj, ano), parteBContas: await parteBContasDoAno(cnpj, ano) };
  };

  app.get("/api/workspaces/:cnpj/lucro-real", mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = anoDe(req.query.ano); if (!ano) return res.status(400).json({ sucesso: false, motivo: "Informe o ano." });
    try { return res.json({ sucesso: true, ano, ...(await painel(a.cnpj, ano)) }); } catch (e) { return falha(res, e, "Não foi possível ler a apuração do Lucro Real."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/config", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const b = req.body || {};
    try {
      const c: Record<string, unknown> = {};
      if (b.forma !== undefined) c.forma = b.forma;
      if (b.obrigada !== undefined) c.obrigada = b.obrigada === "" || b.obrigada === null ? null : b.obrigada === true || b.obrigada === "true";
      if (b.indAliquotaCsll !== undefined) c.indAliquotaCsll = String(b.indAliquotaCsll);
      if (b.atividadeEstimativa !== undefined) c.atividadeEstimativa = b.atividadeEstimativa;
      if (b.anoInicial !== undefined) c.anoInicial = b.anoInicial === "" || b.anoInicial === null ? null : Number(b.anoInicial);
      for (const k of ["saldoPrejuizoInicial", "saldoBaseNegativaInicial"]) if (b[k] !== undefined) { const v = centavos(b[k] === "" ? "0" : b[k]); if (v === null) return res.status(400).json({ sucesso: false, motivo: "Saldo inválido (reais, ex.: 12.345,67)." }); c[`${k}Centavos`] = v; }
      if (b.modoForcado !== undefined) c.modoForcado = b.modoForcado || {};
      const config = await salvarConfigLucroReal(consultar, a.cnpj, c as any, a.sessao.login);
      return res.json({ sucesso: true, config });
    } catch (e) { return falha(res, e, "Não foi possível salvar a configuração."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/lancamentos", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const b = req.body || {}; const valor = centavos(b.valor);
    if (valor === null || valor <= 0) return res.status(400).json({ sucesso: false, motivo: "Valor inválido (reais, ex.: 1.234,56)." });
    try { const l = await adicionarLancamentoLalur(consultar, a.cnpj, { ano: Number(b.ano), mes: Number(b.mes), tributo: b.tributo, tipo: b.tipo, codigo: String(b.codigo ?? ""), descricao: String(b.descricao ?? ""), valorCentavos: valor, justificativa: String(b.justificativa ?? ""), contaParteB: b.contaParteB ? String(b.contaParteB) : null }, a.sessao.login); return res.json({ sucesso: true, lancamento: l }); }
    catch (e) { return falha(res, e, "Não foi possível gravar o lançamento."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/parte-b/contas", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const b = req.body || {}; const saldo = centavos(b.saldoInicial === "" || b.saldoInicial === undefined ? "0" : b.saldoInicial);
    if (saldo === null) return res.status(400).json({ sucesso: false, motivo: "Saldo inicial inválido (reais, ex.: 1.234,56)." });
    try { return res.json({ sucesso: true, conta: await criarContaParteB(consultar, a.cnpj, { codigo: String(b.codigo ?? ""), descricao: String(b.descricao ?? ""), tributo: String(b.tributo ?? "ambos") as any, natureza: String(b.natureza ?? "") as any, anoInicial: Number(b.anoInicial), saldoInicialCentavos: saldo }, a.sessao.login) }); }
    catch (e) { return falha(res, e, "Não foi possível criar a conta da Parte B."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/parte-b/contas/:id/excluir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try { await excluirContaParteB(consultar, a.cnpj, String(req.params.id)); return res.json({ sucesso: true }); } catch (e) { return falha(res, e, "Não foi possível excluir a conta."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/lancamentos/:id/excluir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    if (req.body?.confirmar !== true) return res.status(400).json({ sucesso: false, motivo: "Confirme a exclusão deste lançamento." });
    try { await excluirLancamentoLalur(consultar, a.cnpj, String(req.params.id)); return res.json({ sucesso: true }); } catch (e) { return falha(res, e, "Não foi possível excluir."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/apurar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const ano = anoDe(req.body?.ano); if (!ano) return res.status(400).json({ sucesso: false, motivo: "Informe o ano." });
    try { const r = await apurarAnoLucroReal(deps, a.cnpj, ano); return res.json({ sucesso: true, ano, avisos: r.avisos, ...(await painel(a.cnpj, ano)) }); } catch (e) { return falha(res, e, "Não foi possível apurar agora."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/confirmar", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const ano = anoDe(req.body?.ano); const periodo = String(req.body?.periodo ?? "");
    if (!ano || !/^(T0[1-4]|A(0[1-9]|1[0-2])|ANUAL)$/.test(periodo)) return res.status(400).json({ sucesso: false, motivo: "Informe o ano e o período." });
    try {
      const l = await confirmarApuracaoReal(consultar, a.cnpj, ano, periodo, a.sessao.login);
      if (!l) return res.status(409).json({ sucesso: false, motivo: "Não há cálculo pronto para confirmar (prévia de mês não fechado, item para revisar ou já confirmado)." });
      const itens = itensProvisaoReal(l);
      if (itens.length) await deps.enviarProvisao(a.cnpj, itens).catch((e) => console.error("[lucro-real] provisão não gravada:", e?.message || e));
      return res.json({ sucesso: true, apuracao: l, provisoes: itens.length });
    } catch (e) { return falha(res, e, "Não foi possível confirmar."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/reabrir", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    if (!a.sessao.administrador) return res.status(403).json({ sucesso: false, motivo: "Só o administrador do escritório reabre uma apuração confirmada." });
    const ano = anoDe(req.body?.ano); const periodo = String(req.body?.periodo ?? "");
    if (!ano || !periodo) return res.status(400).json({ sucesso: false, motivo: "Informe o ano e o período." });
    try { const r = await reabrirApuracaoReal(consultar, a.cnpj, ano, periodo); return "motivo" in r ? res.status(409).json({ sucesso: false, motivo: r.motivo }) : res.json({ sucesso: true }); } catch (e) { return falha(res, e, "Não foi possível reabrir."); }
  });
  // Pagamento do DARF (data e valor pago, com multa e juros se houver): vira pré-lançamento que baixa o IRPJ/CSLL a recolher.
  app.post("/api/workspaces/:cnpj/lucro-real/pagamento", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const b = req.body || {}; const ano = anoDe(b.ano);
    if (!ano || !b.periodo) return res.status(400).json({ sucesso: false, motivo: "Informe o ano e o período." });
    try {
      const r = await registrarPagamentoReal(consultar, a.cnpj, ano, String(b.periodo), String(b.tributo || ""), String(b.dataPagamento || ""), centavos(b.valorPago), a.sessao.login, deps.hoje(), deps.enviarProvisao as any);
      return "erro" in r ? res.status(409).json({ sucesso: false, motivo: r.erro }) : res.json({ sucesso: true, pagamento: r.pagamento });
    } catch (e) { return falha(res, e, "Não foi possível registrar o pagamento."); }
  });
  // Documento do DARF para conferência (não é a guia oficial: emita no Sicalc).
  app.get("/api/workspaces/:cnpj/lucro-real/darf/:ano/:periodo/:tributo", mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = anoDe(req.params.ano);
    try {
      const l = ano ? (await listarApuracoesReal(consultar, a.cnpj, ano)).find((p) => p.periodo === req.params.periodo) : undefined;
      const d = l?.resultado?.darfs?.find((x: any) => x.tributo === req.params.tributo);
      if (!l || !d) return res.status(404).json({ sucesso: false, motivo: "DARF não encontrado." });
      const linhas: Array<[string, string]> = [["CNPJ", a.cnpj], ["Período de apuração", dataBR(d.periodoApuracao)], ["Código da receita", d.codigo || "A INFORMAR (obrigada ou optante?)"], ["Descrição", d.descricao], ["Vencimento", dataBR(d.vencimento)], ["Valor principal", reais(d.valorCentavos)], ["Situação da apuração", l.status === "confirmado" ? "Confirmada" : "AINDA NÃO CONFIRMADA"]];
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DARF para conferência</title><style>body{font-family:sans-serif;max-width:640px;margin:24px auto}td{padding:6px;border-bottom:1px solid #ddd}.t{background:#fff3cd;padding:8px;border:1px solid #e0b000}</style></head><body><h2>DARF — ${esc(d.tributo.toUpperCase())} Lucro Real</h2><p class="t">Este documento NÃO é a guia oficial e não tem código de barras. Confira e emita a guia no Sicalc Web da Receita Federal. Fonte do código e do vencimento: ${esc(d.fonte)}.</p><table>${linhas.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table></body></html>`);
    } catch (e) { return falha(res, e, "Não foi possível montar o documento."); }
  });
  app.post("/api/workspaces/:cnpj/lucro-real/jcp", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const b = req.body || {};
    const c = (k: string) => centavos(b[k] === "" || b[k] === undefined ? "0" : b[k]);
    const base = c("basePl"), lucro = c("lucroPeriodoAntesJcp"), acum = c("lucrosAcumuladosReservas");
    if (base === null || lucro === null || acum === null) return res.status(400).json({ sucesso: false, motivo: "Valores inválidos (reais, ex.: 1.234,56)." });
    try {
      const r = calcularJcp({ ano: Number(String(b.dataPagamento || "").slice(0, 4)), dataPagamento: String(b.dataPagamento || ""), dias: Number(b.dias) || 0, taxaTjlpPeriodoPercentual: Number(String(b.taxaTjlp ?? "").replace(",", ".")), fonteTjlp: String(b.fonteTjlp || ""), basePlCentavos: base, lucroPeriodoAntesJcpCentavos: lucro, lucrosAcumuladosReservasCentavos: acum, valorPretendidoCentavos: b.valorPretendido ? centavos(b.valorPretendido) ?? undefined : undefined });
      return res.json({ sucesso: true, jcp: r });
    } catch (e) { return falha(res, e, "Não foi possível calcular os juros sobre capital próprio."); }
  });
}
