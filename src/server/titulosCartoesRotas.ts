// Rotas e robô de Títulos a pagar/receber e de Cartões (antiga DIRF). Mesmo acesso das rotas da escrituração: o CNPJ
// tem de ser da sessão e quem só lê não grava. A Agente IA usa estas rotas (com cartão de confirmação).
import crypto from "node:crypto";
import type express from "express";
import { alterarWorkspaceNoServidorContabil, ErroAlteracaoWorkspace, percorrerWorkspacesContabil } from "./authContabil";
import { acessoEmpresa, erroHttp, respostaAlteracao } from "./escrituracaoRotas";
import {
  AVISO_DIRF, empresasComTitulos, ErroTitulos, excluirTitulo, gravarTitulo, lancamentoDaBaixa, lancamentoDaProvisao, lembreteDoTitulo, lerTitulo, listarCartoes, listarTitulos,
  situacaoTitulo, temProvisao, totalBaixado, validarTitulo, type BaixaTitulo, type Titulo,
} from "./titulosCartoesStore";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Mw = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;
const hojeBR = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const erro = (res: express.Response, e: any, padrao: string) => (e instanceof ErroTitulos ? res.status(e.status).json({ sucesso: false, motivo: e.message }) : erroHttp(res, e, padrao));

export function resumoTitulos(lista: Titulo[], hoje: string) {
  const abertos = lista.filter((t) => situacaoTitulo(t, hoje) !== "baixado");
  const soma = (tipo: string) => abertos.filter((t) => t.tipo === tipo).reduce((s, t) => s + t.valorCentavos - totalBaixado(t), 0);
  return { total: lista.length, abertos: abertos.length, vencidos: abertos.filter((t) => situacaoTitulo(t, hoje) === "vencido").length, aPagarCentavos: soma("pagar"), aReceberCentavos: soma("receber") };
}

/** Coloca/atualiza na Agenda (lembretes do workspace) os vencimentos dos títulos em aberto; tira os baixados. */
export function lembretesDeTitulos(payload: Record<string, any>, titulos: Titulo[], hoje: string): Record<string, any> | null {
  const atuais: any[] = Array.isArray(payload.lembretes) ? payload.lembretes : [];
  const outros = atuais.filter((l) => !String(l?.id || "").startsWith("TITULO:"));
  const novos = titulos.map((t) => lembreteDoTitulo(t, hoje)).filter(Boolean);
  const final = [...outros, ...novos];
  // Só grava quando muda o que importa (título, vencimento, valor): a contagem de dias não reescreve o workspace todo dia
  // (assim o robô não atrapalha quem está trabalhando na empresa).
  const chave = (l: any) => String(l?.id || "").startsWith("TITULO:") ? JSON.stringify([l.id, l.nome, l.dataVencimento, l.valor, l.acaoTexto2]) : JSON.stringify(l);
  return JSON.stringify(final.map(chave)) === JSON.stringify(atuais.map(chave)) ? null : { ...payload, lembretes: final };
}

export function registrarRotasTitulosCartoes(app: express.Express, deps: { exigirOrigemNavegador: Mw; exigirSessaoContabil: Mw; consultar: Consultar }): void {
  const { exigirOrigemNavegador: origem, exigirSessaoContabil: sessaoMw, consultar } = deps;
  const autor = (s: { userId: string; login: string }) => ({ userId: s.userId, login: s.login });

  app.get("/api/workspaces/:cnpj/titulos", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try {
      const hoje = hojeBR(); const lista = await listarTitulos(consultar, a.cnpj);
      return res.json({ sucesso: true, hoje, resumo: resumoTitulos(lista, hoje), titulos: lista.map((t) => ({ ...t, situacao: situacaoTitulo(t, hoje), baixadoCentavos: totalBaixado(t) })) });
    } catch (e) { return erro(res, e, "Não foi possível ler os títulos."); }
  });
  app.post("/api/workspaces/:cnpj/titulos", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try {
      const existente = req.body?.id ? await lerTitulo(consultar, a.cnpj, String(req.body.id)) : null;
      const base = existente || { id: `TIT-${crypto.randomUUID()}`, baixas: [], provisoes: [], origem: "murade", criadoEm: new Date().toISOString(), criadoPor: a.sessao.login };
      // A equipe edita os dados do título; baixas, provisões e origem não mudam por aqui.
      const t = validarTitulo({ ...base, ...req.body, id: base.id, baixas: base.baixas, provisoes: base.provisoes, origem: base.origem, origemId: (base as any).origemId, criadoEm: base.criadoEm, criadoPor: base.criadoPor,
        valorCentavos: Number.isSafeInteger(req.body?.valorCentavos) ? req.body.valorCentavos : (existente?.valorCentavos ?? NaN) });
      await gravarTitulo(consultar, a.cnpj, t);
      return res.json({ sucesso: true, titulo: t, mensagem: existente ? "Título atualizado." : "Título cadastrado." });
    } catch (e) { return erro(res, e, "Não foi possível gravar o título."); }
  });
  app.post("/api/workspaces/:cnpj/titulos/:id/baixa", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try {
      const t = await lerTitulo(consultar, a.cnpj, String(req.params.id));
      if (!t) return res.status(404).json({ sucesso: false, motivo: "Título não encontrado." });
      const valor = Number(req.body?.valorCentavos); const data = String(req.body?.data || "");
      const restante = t.valorCentavos - totalBaixado(t);
      if (!Number.isSafeInteger(valor) || valor <= 0) return res.status(422).json({ sucesso: false, motivo: "Informe o valor da baixa." });
      if (valor > restante) return res.status(422).json({ sucesso: false, motivo: `O valor passa do que falta no título (${(restante / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` });
      const conta = req.body?.contaTitulo ? String(req.body.contaTitulo) : t.contaTitulo;
      const b: BaixaTitulo = { id: `BX-${crypto.randomUUID()}`, data, valorCentavos: valor, documento: req.body?.documento ? String(req.body.documento).slice(0, 60) : undefined, historico: req.body?.historico ? String(req.body.historico).slice(0, 240) : undefined, contaDisponibilidade: String(req.body?.contaDisponibilidade || ""), origem: "murade", registradoPor: a.sessao.login };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(422).json({ sucesso: false, motivo: "Informe a data da baixa." });
      const tit: Titulo = { ...t, contaTitulo: conta };
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        if (fechadas.has(data.slice(0, 7))) throw new ErroAlteracaoWorkspace(409, `A competência ${data.slice(0, 7)} está fechada.`);
        let l; try { l = lancamentoDaBaixa(payload, tit, b); } catch (e: any) { throw new ErroAlteracaoWorkspace(e?.status || 422, e?.message || String(e)); }
        b.lancamentoId = l.id;
        return { payload: { ...payload, lancamentos: [...(payload.lancamentos || []), l] }, resultado: l };
      }, autor(a.sessao));
      await gravarTitulo(consultar, a.cnpj, { ...tit, baixas: [...t.baixas, b] });
      return res.json(respostaAlteracao(r, { mensagem: "Baixa registrada; o lançamento foi para aprovação (tela Aprovar lançamentos)." }));
    } catch (e) { return erro(res, e, "Não foi possível registrar a baixa."); }
  });
  app.post("/api/workspaces/:cnpj/titulos/:id/provisao", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try {
      const t = await lerTitulo(consultar, a.cnpj, String(req.params.id));
      if (!t) return res.status(404).json({ sucesso: false, motivo: "Título não encontrado." });
      if (temProvisao(t)) return res.status(409).json({ sucesso: false, motivo: t.provisoes.some((p) => p.origem === "sistema_anterior") ? "A provisão deste título já estava contabilizada no sistema anterior." : "A provisão deste título já foi gerada." });
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        if (fechadas.has(t.dataEmissao.slice(0, 7))) throw new ErroAlteracaoWorkspace(409, `A competência ${t.dataEmissao.slice(0, 7)} está fechada.`);
        let l; try { l = lancamentoDaProvisao(payload, t); } catch (e: any) { throw new ErroAlteracaoWorkspace(e?.status || 422, e?.message || String(e)); }
        return { payload: { ...payload, lancamentos: [...(payload.lancamentos || []), l] }, resultado: l };
      }, autor(a.sessao));
      await gravarTitulo(consultar, a.cnpj, { ...t, provisoes: [...t.provisoes, { origem: "murade", lancamentoId: r.resultado.id }] });
      return res.json(respostaAlteracao(r, { mensagem: "Provisão gerada; o lançamento foi para aprovação (tela Aprovar lançamentos)." }));
    } catch (e) { return erro(res, e, "Não foi possível gerar a provisão."); }
  });
  app.delete("/api/workspaces/:cnpj/titulos/:id", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try {
      const t = await lerTitulo(consultar, a.cnpj, String(req.params.id));
      if (!t) return res.status(404).json({ sucesso: false, motivo: "Título não encontrado." });
      if (t.baixas.some((b) => b.origem === "murade" && b.lancamentoId) || t.provisoes.some((p) => p.origem === "murade" && p.lancamentoId)) return res.status(409).json({ sucesso: false, motivo: "Este título já gerou lançamento no Murad. Estorne ou rejeite o lançamento antes de excluir o título." });
      await excluirTitulo(consultar, a.cnpj, t.id);
      return res.json({ sucesso: true, mensagem: "Título excluído (só este)." });
    } catch (e) { return erro(res, e, "Não foi possível excluir o título."); }
  });
  app.get("/api/workspaces/:cnpj/cartoes", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try { return res.json({ sucesso: true, aviso: AVISO_DIRF, estabelecimentos: await listarCartoes(consultar, a.cnpj) }); }
    catch (e) { return erro(res, e, "Não foi possível ler as informações de cartões."); }
  });
}

export type AchadoTitulos = { cnpj: string; vencidos: number; vencendo: number; provisoesGeradas: number; detalhe: string };
const achadosTitulos = new Map<string, AchadoTitulos>();
export const achadosDoRoboTitulos = (cnpjs?: string[]) => [...achadosTitulos.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj));

/**
 * Robô dos títulos: em cada empresa com títulos, (1) põe os vencimentos na Agenda; (2) avisa vencidos e os que vencem em
 * até 3 dias; (3) gera sozinho a provisão PENDENTE DE APROVAÇÃO dos títulos do Murade que já têm as duas contas e ainda não
 * têm provisão (nunca dos que vieram contabilizados do sistema anterior). Nunca aprova nada.
 */
export async function roboTitulos(consultar: Consultar, agora = new Date()): Promise<string> {
  const hoje = hojeBR(agora);
  const em3 = new Date(Date.parse(`${hoje}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  let empresas = 0, vencidos = 0, vencendo = 0, provisoes = 0, falhas = 0;
  for (const cnpj of await empresasComTitulos(consultar)) {
    empresas++;
    try {
      let lista = await listarTitulos(consultar, cnpj);
      let geradas = 0;
      for (const t of lista.filter((x) => x.origem === "murade" && !temProvisao(x) && x.contaTitulo && x.contaContrapartida)) {
        try {
          const r = await alterarWorkspaceNoServidorContabil(cnpj, (payload, { fechadas }) => {
            if (fechadas.has(t.dataEmissao.slice(0, 7))) return { payload: null, resultado: null };
            if ((payload.lancamentos || []).some((l: any) => l.documentoRef === `TITULO:${t.id}:PROVISAO`)) return { payload: null, resultado: null };
            const l = lancamentoDaProvisao(payload, t);
            return { payload: { ...payload, lancamentos: [...(payload.lancamentos || []), l] }, resultado: l };
          });
          if (r.resultado) { await gravarTitulo(consultar, cnpj, { ...t, provisoes: [...t.provisoes, { origem: "murade", lancamentoId: r.resultado.id }] }); geradas++; }
        } catch (e: any) { if (!(e instanceof ErroTitulos)) console.error(`Robô dos títulos: provisão de ${cnpj}/${t.id}:`, e?.message || e); }
      }
      if (geradas) lista = await listarTitulos(consultar, cnpj);
      await alterarWorkspaceNoServidorContabil(cnpj, (payload) => ({ payload: lembretesDeTitulos(payload, lista, hoje), resultado: null })).catch(() => undefined);
      const abertos = lista.filter((t) => situacaoTitulo(t, hoje) !== "baixado");
      const v = abertos.filter((t) => t.vencimento && t.vencimento < hoje).length;
      const p = abertos.filter((t) => t.vencimento && t.vencimento >= hoje && t.vencimento <= em3).length;
      vencidos += v; vencendo += p; provisoes += geradas;
      if (v || p || geradas) achadosTitulos.set(cnpj, { cnpj, vencidos: v, vencendo: p, provisoesGeradas: geradas, detalhe: `${v} vencido(s), ${p} vencendo em até 3 dias${geradas ? `, ${geradas} provisão(ões) preparada(s) para aprovação` : ""}.` });
      else achadosTitulos.delete(cnpj);
    } catch (e: any) { falhas++; console.error(`Robô dos títulos falhou para ${cnpj}:`, e?.message || e); }
  }
  void percorrerWorkspacesContabil;
  return `${empresas} empresa(s) com títulos; ${vencidos} vencido(s) e ${vencendo} vencendo em até 3 dias (na Agenda); ${provisoes} provisão(ões) preparada(s) para aprovação; ${falhas} falha(s).`;
}
