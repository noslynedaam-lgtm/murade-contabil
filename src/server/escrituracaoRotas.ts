// Rotas e robôs da escrituração avançada do Contábil (levantamento de 20/11/2026):
//  - lançamento com várias partidas, histórico padrão e lançamento padrão (recorrente);
//  - encerramento do resultado gravado no sistema (com estorno);
//  - Livro Caixa do Simples Nacional;
//  - extrato bancário guardado no banco, conciliação em lote e regras de conciliação.
// Tudo por empresa (CNPJ), com a sessão do usuário: a rota confere se o CNPJ é dele e se ele pode escrever. A Agente IA
// chama estas mesmas rotas (com cartão de confirmação). Nada vira lançamento definitivo sem aprovação de uma pessoa.
import crypto from "node:crypto";
import type express from "express";
import type { ContaPlano, HistoricoPadrao, LancamentoContabil, LancamentoPadrao, LivroContabil, RegraConciliacao } from "../types";
import {
  alterarWorkspaceNoServidorContabil, cnpjContabilValido, ErroAlteracaoWorkspace, lerWorkspaceInternoContabil, normalizarCnpjAcesso,
  percorrerWorkspacesContabil, sessaoDaRequisicaoContabil, type SessaoContabil,
} from "./authContabil";
import {
  agruparPorLote, calcularEncerramento, contaApuracaoPadrao, ehErro, encerramentoGravadoConfere, encerramentosDoAno, montarEstornoLote, montarLoteEncerramento,
  montarLoteMultipartida, prepararRecorrentesDoMes, textoParaCentavos, validarLancamentoPadrao,
} from "../utils/escrituracaoAvancada";
import { gerarLivroCaixa, competenciasEntre, idLivroCaixa, registroLivroCaixa, situacaoLivroCaixaDoMes, termosLivroCaixa } from "../utils/livroCaixa";
import { lancamentoCasaComMovimento, lancamentoDoMovimento, sugerirParaPendentes, type RegraConciliacaoExtrato } from "../utils/extratoBancario";
import {
  contasComPendentes, desfazerConciliacao, ErroExtrato, gravarMovimentosExtrato, gravarSugestoes, lerMovimentosExtrato, marcarConciliados,
  resumoExtratoEmpresa, validarMovimentosRecebidos,
} from "./extratoBancarioStore";
import { naturezasDasContas } from "../services/ecdService";
import { gerarRelatoriosContabeis, normalizarDataContabil } from "../utils/livrosContabeis";
import { analisarFechamento, aplicarPropostaFechamento, type PropostaFechamento } from "../utils/ajustesFechamento";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Mw = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;

const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const novoId = (prefixo: string) => () => `${prefixo}-${crypto.randomUUID()}`;
const competenciaDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const competenciaAnteriorDe = (d: Date) => (d.getMonth() === 0 ? `${d.getFullYear() - 1}-12` : `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`);
const analiticasDe = (payload: Record<string, any>) => new Set((Array.isArray(payload.contas) ? payload.contas : []).filter((c: any) => c?.tipo === "analitica").map((c: any) => String(c.codigo)));
const contasDe = (payload: Record<string, any>): ContaPlano[] => (Array.isArray(payload.contas) ? payload.contas : []);
const lancamentosDe = (payload: Record<string, any>): LancamentoContabil[] => (Array.isArray(payload.lancamentos) ? payload.lancamentos : []);

// ------------------------------------------------------------------ lógica pura dos robôs (testável)

/** Robô dos lançamentos padrão: o que preparar nesta competência para esta empresa. */
export function planejarRecorrentes(payload: Record<string, any>, competencia: string, fechadas: Set<string>) {
  const padroes: LancamentoPadrao[] = Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : [];
  if (!padroes.some((p) => p?.ativo)) return { novos: [] as LancamentoContabil[], avisos: [] as string[] };
  return prepararRecorrentesDoMes({ padroes, lancamentos: lancamentosDe(payload), contas: contasDe(payload), competencia, fechadas, novoId: novoId("rec") });
}

export type AchadoEscrituracao = { cnpj: string; tipo: "livro_caixa" | "encerramento" | "conciliacao" | "recorrentes" | "ajustes_fechamento"; titulo: string; detalhe: string; verificadoEm: string };
const achados = new Map<string, AchadoEscrituracao>(); // chave: tipo:cnpj
export const achadosEscrituracao = (cnpjs?: string[]): AchadoEscrituracao[] => [...achados.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj)).sort((a, b) => a.cnpj.localeCompare(b.cnpj) || a.tipo.localeCompare(b.tipo));
export const limparAchadosEscrituracaoParaTeste = () => achados.clear();
const guardarAchado = (a: AchadoEscrituracao | null, tipo: AchadoEscrituracao["tipo"], cnpj: string) => { if (a) achados.set(`${tipo}:${cnpj}`, a); else achados.delete(`${tipo}:${cnpj}`); };

/**
 * Robô do encerramento: a partir de janeiro, olha o ano anterior. Se janeiro a novembro desse ano estão fechados, dezembro
 * está aberto, não há encerramento gravado e o cálculo fecha, prepara o encerramento (pendente de aprovação). Senão só avisa.
 */
export function planejarEncerramento(payload: Record<string, any>, ano: number, fechadas: Set<string>): { acao: "nada" | "avisar" | "preparar"; detalhe: string; lote?: LancamentoContabil[] } {
  const lancamentos = lancamentosDe(payload);
  const contas = contasDe(payload);
  if (!contas.length || !lancamentos.some((l) => String(normalizarDataContabil(l.data) || "").startsWith(`${ano}-`))) return { acao: "nada", detalhe: "Sem movimento no ano." };
  const existentes = encerramentosDoAno(lancamentos, ano);
  const destino = contaApuracaoPadrao(contas);
  if (existentes.pendentes.length) return { acao: "avisar", detalhe: `O encerramento de ${ano} está preparado e aguarda aprovação (tela Aprovar lançamentos).` };
  const calc = destino ? calcularEncerramento({ contas, lancamentos, ano, contaDestino: destino.codigo, naturezaEcd: naturezasDasContas(contas) }) : { erro: "Não achei a conta de Lucros ou Prejuízos Acumulados no plano; escolha a conta na tela Livros → Encerramento." };
  if (existentes.ativos.length) {
    if (!ehErro(calc) && encerramentoGravadoConfere(calc, existentes.ativos)) return { acao: "nada", detalhe: `Resultado de ${ano} encerrado.` };
    if (ehErro(calc) && /aguardando aprovação/.test(calc.erro)) return { acao: "avisar", detalhe: calc.erro };
    return { acao: "avisar", detalhe: `O encerramento gravado de ${ano} não bate mais com as contas de resultado (houve lançamento depois dele). Estorne o encerramento e gere de novo (tela Livros → Encerramento).` };
  }
  if (ehErro(calc)) return /não têm saldo/.test(calc.erro) ? { acao: "nada", detalhe: calc.erro } : { acao: "avisar", detalhe: `Resultado de ${ano} ainda não encerrado no sistema. ${calc.erro}` };
  const mesesAteNov = Array.from({ length: 11 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  if (fechadas.has(`${ano}-12`)) return { acao: "avisar", detalhe: `Dezembro de ${ano} está fechado sem o encerramento gravado; a ECD monta o encerramento sozinha, mas o balancete do sistema continua com as contas de resultado abertas.` };
  if (!mesesAteNov.every((m) => fechadas.has(m))) return { acao: "avisar", detalhe: `Resultado de ${ano} ainda não encerrado no sistema (${calc.resultadoCentavos >= 0 ? "lucro" : "prejuízo"} de R$ ${(Math.abs(calc.resultadoCentavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}). Gere em Livros → Encerramento, ou feche janeiro a novembro que o robô prepara sozinho.` };
  const lote = montarLoteEncerramento(calc, ano, { loteId: `ENC-${ano}-${crypto.randomUUID()}`, novoId: novoId("enc") });
  return { acao: "preparar", detalhe: `Encerramento de ${ano} preparado para aprovação (${lote.length} partida(s), resultado R$ ${(calc.resultadoCentavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`, lote };
}

// ------------------------------------------------------------------ rotas

interface Deps { exigirOrigemNavegador: Mw; exigirSessaoContabil: Mw; consultar: Consultar }

function erroHttp(res: express.Response, erro: any, padrao: string) {
  const status = erro instanceof ErroAlteracaoWorkspace || erro instanceof ErroExtrato ? erro.status : 503;
  if (status === 503) console.error(padrao, erro?.message || erro);
  return res.status(status).json({ sucesso: false, motivo: status === 503 ? padrao : erro.message });
}

function acessoEmpresa(req: express.Request, res: express.Response, escrever: boolean): { sessao: SessaoContabil; cnpj: string } | null {
  res.setHeader("Cache-Control", "no-store");
  const sessao = sessaoDaRequisicaoContabil(req);
  const cnpj = normalizarCnpjAcesso(req.params.cnpj);
  if (!sessao) { res.status(401).json({ sucesso: false, motivo: "Entre no sistema." }); return null; }
  if (!cnpjContabilValido(cnpj) || !sessao.cnpjs.map(normalizarCnpjAcesso).includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." }); return null; }
  if (escrever && !sessao.administrador && sessao.memberships.find((m) => m.cnpj === cnpj)?.role === "viewer") { res.status(403).json({ sucesso: false, motivo: "Seu acesso a esta empresa é somente leitura." }); return null; }
  return { sessao, cnpj };
}

const respostaAlteracao = (r: { dados: Record<string, any> | null; versao: number | null; atualizadoEm: string | null }, extra: Record<string, unknown>) =>
  ({ sucesso: true, persistencia: "postgresql", alterado: Boolean(r.dados), dados: r.dados, versao: r.versao, atualizadoEm: r.atualizadoEm, ...extra });

function partidasDoCorpo(lista: unknown): Array<{ conta: string; valorCentavos: number; historico?: string }> | { erro: string } {
  if (!Array.isArray(lista)) return { erro: "Informe as partidas." };
  const saida: Array<{ conta: string; valorCentavos: number; historico?: string }> = [];
  for (const [i, p] of lista.entries()) {
    const valor = Number.isSafeInteger((p as any)?.valorCentavos) ? (p as any).valorCentavos : textoParaCentavos((p as any)?.valor);
    if (valor === null || !Number.isSafeInteger(valor)) return { erro: `Partida ${i + 1}: valor inválido (use 1.234,56).` };
    saida.push({ conta: String((p as any)?.conta || "").trim(), valorCentavos: valor, historico: (p as any)?.historico ? String((p as any).historico) : undefined });
  }
  return saida;
}

export function registrarRotasEscrituracao(app: express.Express, deps: Deps): void {
  const { exigirOrigemNavegador: origem, exigirSessaoContabil: sessaoMw, consultar } = deps;
  const autor = (s: SessaoContabil) => ({ userId: s.userId, login: s.login });

  // ---------- lançamento com várias partidas
  app.post("/api/workspaces/:cnpj/lancamentos-compostos", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const partidas = partidasDoCorpo(req.body?.partidas);
    if ("erro" in partidas) return res.status(400).json({ sucesso: false, motivo: partidas.erro });
    const total = req.body?.total === undefined || req.body?.total === null || req.body?.total === "" ? undefined : (Number.isSafeInteger(req.body?.totalCentavos) ? req.body.totalCentavos : textoParaCentavos(req.body.total));
    if (total === null) return res.status(400).json({ sucesso: false, motivo: "Total inválido (use 1.234,56)." });
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        const loteId = `LOTE-${crypto.randomUUID()}`;
        const lote = montarLoteMultipartida({ data: String(req.body?.data || ""), historico: String(req.body?.historico || ""), forma: req.body?.forma, contaUnica: String(req.body?.contaUnica || ""), partidas, totalCentavos: total, centroCustoCodigo: req.body?.centroCustoCodigo ? String(req.body.centroCustoCodigo) : undefined }, contasDe(payload), { loteId, novoId: novoId("lan"), documentoRef: `MAN-${loteId}` });
        if (ehErro(lote)) throw new ErroAlteracaoWorkspace(422, lote.erro);
        if (fechadas.has(lote[0].competencia!)) throw new ErroAlteracaoWorkspace(409, `A competência ${lote[0].competencia} está fechada.`);
        return { payload: { ...payload, lancamentos: [...lancamentosDe(payload), ...lote] }, resultado: { partidas: lote.length, loteId: lote[0].loteId || lote[0].id } };
      }, autor(a.sessao));
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Lançamento com ${r.resultado.partidas} partida(s) enviado para aprovação.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível gravar o lançamento com várias partidas."); }
  });

  // ---------- estornar um lote inteiro (lançamento com várias partidas ou encerramento)
  app.post("/api/workspaces/:cnpj/lotes/:loteId/estornar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const loteId = String(req.params.loteId || "").slice(0, 160);
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        const lancamentos = lancamentosDe(payload);
        const lote = lancamentos.filter((l) => l.loteId === loteId && !l.estornoDe);
        if (!lote.length) throw new ErroAlteracaoWorkspace(404, "Lote não encontrado.");
        if (lote.some((l) => lancamentos.some((x) => x.estornoDe === l.id && x.statusManual !== "rejeitado"))) throw new ErroAlteracaoWorkspace(409, "Este lote já tem estorno registrado.");
        const hoje = new Date().toISOString().slice(0, 10);
        const encerramento = lote.every((l) => l.tipoEspecial === "encerramento");
        const estorno = montarEstornoLote(lote, { loteId: `EST-${crypto.randomUUID()}`, novoId: novoId("estorno") }, encerramento ? undefined : hoje);
        if (ehErro(estorno)) throw new ErroAlteracaoWorkspace(409, estorno.erro);
        if (fechadas.has(String(estorno[0].competencia))) throw new ErroAlteracaoWorkspace(409, `A competência ${estorno[0].competencia} está fechada; o estorno não pode ser lançado nela.`);
        return { payload: { ...payload, lancamentos: [...lancamentos, ...estorno] }, resultado: { partidas: estorno.length } };
      }, autor(a.sessao));
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Estorno com ${r.resultado.partidas} partida(s) enviado para aprovação; o original fica preservado.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível registrar o estorno do lote."); }
  });

  // ---------- histórico padrão
  app.post("/api/workspaces/:cnpj/historicos-padrao", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const codigo = String(req.body?.codigo || "").trim().toUpperCase();
    const texto = String(req.body?.texto || "").trim();
    if (!/^[A-Z0-9._-]{1,12}$/.test(codigo)) return res.status(400).json({ sucesso: false, motivo: "Código do histórico: até 12 letras ou números." });
    if (!texto || texto.length > 240) return res.status(400).json({ sucesso: false, motivo: "Texto do histórico: de 1 a 240 caracteres." });
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const lista: HistoricoPadrao[] = Array.isArray(payload.historicosPadrao) ? payload.historicosPadrao : [];
        if (lista.some((h) => h.codigo.toUpperCase() === codigo)) throw new ErroAlteracaoWorkspace(409, `Já existe o histórico padrão ${codigo}.`);
        const novo = { id: `hist-${crypto.randomUUID()}`, codigo, texto };
        return { payload: { ...payload, historicosPadrao: [...lista, novo] }, resultado: { historico: novo } };
      });
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Histórico padrão ${codigo} cadastrado.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível cadastrar o histórico padrão."); }
  });
  app.delete("/api/workspaces/:cnpj/historicos-padrao/:id", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || "");
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const lista: HistoricoPadrao[] = Array.isArray(payload.historicosPadrao) ? payload.historicosPadrao : [];
        if (!lista.some((h) => h.id === id)) throw new ErroAlteracaoWorkspace(404, "Histórico padrão não encontrado.");
        return { payload: { ...payload, historicosPadrao: lista.filter((h) => h.id !== id) }, resultado: {} };
      });
      return res.json(respostaAlteracao(r, { mensagem: "Histórico padrão removido. Os lançamentos que já usaram o texto não mudam." }));
    } catch (e) { return erroHttp(res, e, "Não foi possível remover o histórico padrão."); }
  });

  // ---------- lançamento padrão (recorrente)
  app.post("/api/workspaces/:cnpj/lancamentos-padrao", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const partidas = partidasDoCorpo(req.body?.partidas);
    if ("erro" in partidas) return res.status(400).json({ sucesso: false, motivo: partidas.erro });
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const novo: LancamentoPadrao = {
          id: `padrao-${crypto.randomUUID()}`, nome: String(req.body?.nome || "").trim().slice(0, 80), ativo: req.body?.ativo !== false,
          dia: Number(req.body?.dia), historico: String(req.body?.historico || "").trim(), forma: req.body?.forma === "Nx1" ? "Nx1" : "1xN",
          contaUnica: String(req.body?.contaUnica || "").trim(), partidas: partidas.map((p) => ({ conta: p.conta, valorCentavos: p.valorCentavos })),
          inicio: String(req.body?.inicio || "").trim(), ...(req.body?.fim ? { fim: String(req.body.fim).trim() } : {}), criadoEm: new Date().toISOString(),
        };
        if (!validarLancamentoPadrao(novo, analiticasDe(payload))) throw new ErroAlteracaoWorkspace(422, "Confira o lançamento padrão: nome, dia (1 a 31), histórico, contas analíticas diferentes, valores maiores que zero e competência de início (AAAA-MM).");
        const lista: LancamentoPadrao[] = Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : [];
        return { payload: { ...payload, lancamentosPadrao: [...lista, novo] }, resultado: { padrao: novo } };
      });
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: "Lançamento padrão cadastrado. O robô prepara todo mês, para aprovação." }));
    } catch (e) { return erroHttp(res, e, "Não foi possível cadastrar o lançamento padrão."); }
  });
  app.post("/api/workspaces/:cnpj/lancamentos-padrao/:id/ativo", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || ""); const ativo = req.body?.ativo === true;
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const lista: LancamentoPadrao[] = Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : [];
        if (!lista.some((p) => p.id === id)) throw new ErroAlteracaoWorkspace(404, "Lançamento padrão não encontrado.");
        return { payload: { ...payload, lancamentosPadrao: lista.map((p) => (p.id === id ? { ...p, ativo } : p)) }, resultado: {} };
      });
      return res.json(respostaAlteracao(r, { mensagem: ativo ? "Lançamento padrão ligado." : "Lançamento padrão pausado: o robô não prepara mais até você ligar de novo." }));
    } catch (e) { return erroHttp(res, e, "Não foi possível alterar o lançamento padrão."); }
  });
  app.delete("/api/workspaces/:cnpj/lancamentos-padrao/:id", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || "");
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const lista: LancamentoPadrao[] = Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : [];
        if (!lista.some((p) => p.id === id)) throw new ErroAlteracaoWorkspace(404, "Lançamento padrão não encontrado.");
        return { payload: { ...payload, lancamentosPadrao: lista.filter((p) => p.id !== id) }, resultado: {} };
      });
      return res.json(respostaAlteracao(r, { mensagem: "Lançamento padrão removido. Os lançamentos já preparados continuam como estão." }));
    } catch (e) { return erroHttp(res, e, "Não foi possível remover o lançamento padrão."); }
  });
  // Botão manual ao lado do robô: prepara agora os lançamentos padrão de uma competência desta empresa.
  app.post("/api/workspaces/:cnpj/lancamentos-padrao/preparar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const competencia = String(req.body?.competencia || competenciaDe(new Date()));
    if (!COMP.test(competencia)) return res.status(400).json({ sucesso: false, motivo: "Competência inválida; use AAAA-MM." });
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        if (fechadas.has(competencia)) throw new ErroAlteracaoWorkspace(409, `A competência ${competencia} está fechada.`);
        const plano = planejarRecorrentes(payload, competencia, fechadas);
        return { payload: plano.novos.length ? { ...payload, lancamentos: [...lancamentosDe(payload), ...plano.novos] } : null, resultado: { preparados: plano.novos.length, avisos: plano.avisos } };
      }, autor(a.sessao));
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: r.resultado.preparados ? `${r.resultado.preparados} partida(s) de lançamento padrão preparada(s) para aprovação em ${competencia}.` : `Nada novo para preparar em ${competencia}.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível preparar os lançamentos padrão."); }
  });

  // ---------- encerramento do resultado
  app.get("/api/workspaces/:cnpj/encerramento", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const ano = Number(req.query.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ sucesso: false, motivo: "Ano inválido." });
    try {
      const payload = await lerWorkspaceInternoContabil(a.cnpj);
      if (!payload) return res.status(404).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados contábeis salvos." });
      const contas = contasDe(payload); const lancamentos = lancamentosDe(payload);
      const destino = String(req.query.contaDestino || "") || contaApuracaoPadrao(contas)?.codigo || "";
      const calc = calcularEncerramento({ contas, lancamentos, ano, contaDestino: destino, naturezaEcd: naturezasDasContas(contas) });
      const ex = encerramentosDoAno(lancamentos, ano);
      return res.json({
        sucesso: true, ano, contaDestino: destino || null,
        previa: ehErro(calc) ? null : { resultadoCentavos: calc.resultadoCentavos, partidas: calc.partidas.map((p) => ({ codigo: p.conta.codigo, descricao: p.conta.descricao, saldoCentavos: p.saldoCentavos })) },
        motivo: ehErro(calc) ? calc.erro : null,
        gravados: { ativos: ex.ativos.map((l) => ({ loteId: l[0].loteId, partidas: l.length })), pendentes: ex.pendentes.map((l) => ({ loteId: l[0].loteId, partidas: l.length })), estornados: ex.estornados.length },
      });
    } catch (e) { return erroHttp(res, e, "Não foi possível calcular o encerramento."); }
  });
  app.post("/api/workspaces/:cnpj/encerramento", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const ano = Number(req.body?.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ sucesso: false, motivo: "Ano inválido." });
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        const contas = contasDe(payload); const lancamentos = lancamentosDe(payload);
        if (fechadas.has(`${ano}-12`)) throw new ErroAlteracaoWorkspace(409, `Dezembro de ${ano} está fechado: o encerramento é lançado em 31/12 e não pode entrar num mês fechado.`);
        const ex = encerramentosDoAno(lancamentos, ano);
        if (ex.ativos.length || ex.pendentes.length) throw new ErroAlteracaoWorkspace(409, `Já existe encerramento de ${ano} ${ex.pendentes.length ? "aguardando aprovação" : "aprovado"}. Para refazer, estorne o atual primeiro.`);
        const destino = String(req.body?.contaDestino || "") || contaApuracaoPadrao(contas)?.codigo || "";
        const calc = calcularEncerramento({ contas, lancamentos, ano, contaDestino: destino, naturezaEcd: naturezasDasContas(contas) });
        if (ehErro(calc)) throw new ErroAlteracaoWorkspace(422, calc.erro);
        const lote = montarLoteEncerramento(calc, ano, { loteId: `ENC-${ano}-${crypto.randomUUID()}`, novoId: novoId("enc") });
        return { payload: { ...payload, lancamentos: [...lancamentos, ...lote] }, resultado: { partidas: lote.length, resultadoCentavos: calc.resultadoCentavos, loteId: lote[0].loteId } };
      }, autor(a.sessao));
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Encerramento de ${ano} preparado com ${r.resultado.partidas} partida(s) e enviado para aprovação.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível preparar o encerramento."); }
  });

  // ---------- Livro Caixa
  app.get("/api/workspaces/:cnpj/livro-caixa", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const de = String(req.query.de || ""); const ate = String(req.query.ate || de);
    try {
      const payload = await lerWorkspaceInternoContabil(a.cnpj);
      if (!payload) return res.status(404).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados contábeis salvos." });
      const empresa = payload.empresa as Record<string, any> || {};
      const livro = gerarLivroCaixa({ contas: contasDe(payload), lancamentos: lancamentosDe(payload), codigosCaixa: empresa.contasDisponibilidadesCodigo, de, ate });
      const situacoes = competenciasEntre(de, ate).slice(0, 24).map((c) => ({ competencia: c, ...situacaoLivroCaixaDoMes(payload, c) }));
      return res.json({ sucesso: true, livro: { ...livro, meses: livro.meses.map((m) => ({ ...m, linhas: m.linhas.slice(0, 300) })) }, termos: livro.disponivel ? termosLivroCaixa(empresa as any, livro) : null, situacoes: situacoes.map(({ registro: _r, ...s }: any) => s) });
    } catch (e) { return erroHttp(res, e, "Não foi possível montar o Livro Caixa."); }
  });
  app.post("/api/workspaces/:cnpj/livro-caixa/registrar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const de = String(req.body?.de || ""); const ate = String(req.body?.ate || de);
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        const empresa = payload.empresa as Record<string, any> || {};
        const livro = gerarLivroCaixa({ contas: contasDe(payload), lancamentos: lancamentosDe(payload), codigosCaixa: empresa.contasDisponibilidadesCodigo, de, ate });
        if (!livro.disponivel) throw new ErroAlteracaoWorkspace(422, livro.motivo);
        const livros: LivroContabil[] = Array.isArray(payload.livros) ? payload.livros : [];
        const novos: LivroContabil[] = []; const pulados: string[] = [];
        for (const m of livro.meses) {
          if (fechadas.has(m.competencia)) { pulados.push(m.competencia); continue; }
          novos.push(registroLivroCaixa(m));
        }
        const ids = new Set(novos.map((n) => n.id));
        const iguais = novos.every((n) => JSON.stringify(livros.find((l) => l.id === n.id)) === JSON.stringify(n));
        return { payload: novos.length && !iguais ? { ...payload, livros: [...livros.filter((l) => !ids.has(l.id)), ...novos] } : null, resultado: { registrados: novos.length, puladosFechados: pulados } };
      });
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Livro Caixa registrado em ${r.resultado.registrados} competência(s)${r.resultado.puladosFechados.length ? `; competências fechadas não mudam: ${r.resultado.puladosFechados.join(", ")}` : ""}.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível registrar o Livro Caixa."); }
  });

  // ---------- extrato bancário e conciliação
  const contaBancoValida = (payload: Record<string, any>, conta: string) => analiticasDe(payload).has(conta);
  app.get("/api/workspaces/:cnpj/extratos", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try {
      const contaBanco = req.query.contaBanco ? String(req.query.contaBanco) : undefined;
      const competencia = req.query.competencia ? String(req.query.competencia) : undefined;
      const [movimentos, resumo] = await Promise.all([
        contaBanco ? lerMovimentosExtrato(consultar, a.cnpj, { contaBanco, competencia }) : Promise.resolve([]),
        resumoExtratoEmpresa(consultar, a.cnpj),
      ]);
      return res.json({ sucesso: true, movimentos, resumo });
    } catch (e) { return erroHttp(res, e, "Não foi possível ler o extrato guardado."); }
  });
  app.post("/api/workspaces/:cnpj/extratos", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    try {
      const contaBanco = String(req.body?.contaBanco || "");
      const payload = await lerWorkspaceInternoContabil(a.cnpj);
      if (!payload || !contaBancoValida(payload, contaBanco)) return res.status(400).json({ sucesso: false, motivo: "Escolha a conta analítica do banco no plano de contas." });
      const movimentos = validarMovimentosRecebidos(req.body?.movimentos);
      const r = await gravarMovimentosExtrato(consultar, a.cnpj, contaBanco, movimentos, a.sessao.login, String(req.body?.arquivo || ""));
      return res.json({ sucesso: true, ...r, mensagem: `${r.novos} movimento(s) novo(s) guardado(s)${r.jaExistiam ? `; ${r.jaExistiam} já estavam guardados e não foram duplicados` : ""}. O Robô da Conciliação prepara as sugestões; você aprova.` });
    } catch (e) { return erroHttp(res, e, "Não foi possível guardar o extrato."); }
  });
  /** Concilia vários de uma vez com lançamentos aprovados (mesmo sentido e valor). */
  const conciliarItens = async (cnpj: string, contaBanco: string, itens: Array<{ fitid: string; lancamentoId: string }>, quem: string) => {
    const payload = await lerWorkspaceInternoContabil(cnpj);
    if (!payload) throw new ErroExtrato(404, "Esta empresa ainda não tem dados contábeis salvos.");
    const pendentes = new Map((await lerMovimentosExtrato(consultar, cnpj, { contaBanco, situacao: "pendente", limite: 5000 })).map((m) => [m.fitid, m]));
    const lancamentos = lancamentosDe(payload);
    const jaUsados = new Set((await lerMovimentosExtrato(consultar, cnpj, { contaBanco, limite: 5000 })).filter((m) => m.situacao !== "pendente" && m.lancamentoId).map((m) => String(m.lancamentoId)));
    const ok: Array<{ fitid: string; lancamentoId: string; situacao: "conciliado" }> = []; const recusados: string[] = [];
    for (const it of itens) {
      const mov = pendentes.get(it.fitid);
      const l = lancamentos.find((x) => x.id === it.lancamentoId);
      if (!mov || jaUsados.has(it.lancamentoId) || !lancamentoCasaComMovimento(l, mov, contaBanco)) { recusados.push(it.fitid); continue; }
      jaUsados.add(it.lancamentoId); ok.push({ fitid: it.fitid, lancamentoId: it.lancamentoId, situacao: "conciliado" });
    }
    const n = await marcarConciliados(consultar, cnpj, contaBanco, ok, quem);
    return { conciliados: n, recusados };
  };
  /** Lança vários de uma vez: cada movimento vira lançamento manual pendente de aprovação (banco x contrapartida). */
  const lancarItens = async (cnpj: string, contaBanco: string, itens: Array<{ fitid: string; contaContrapartida: string }>, sessao: SessaoContabil) => {
    const pendentes = new Map((await lerMovimentosExtrato(consultar, cnpj, { contaBanco, situacao: "pendente", limite: 5000 })).map((m) => [m.fitid, m]));
    const r = await alterarWorkspaceNoServidorContabil(cnpj, (payload, { fechadas }) => {
      const contas = contasDe(payload); const lancamentos = lancamentosDe(payload);
      const banco = contas.find((c) => c.codigo === contaBanco && c.tipo === "analitica");
      if (!banco) throw new ErroAlteracaoWorkspace(400, "Conta do banco inválida.");
      const refs = new Set(lancamentos.map((l) => String(l.documentoRef || "")));
      const novos: LancamentoContabil[] = []; const feitos: Array<{ fitid: string; lancamentoId: string; situacao: "lancado" }> = []; const recusados: string[] = [];
      for (const it of itens) {
        const mov = pendentes.get(it.fitid);
        const contra = contas.find((c) => c.codigo === it.contaContrapartida && c.tipo === "analitica");
        if (!mov || !contra || contra.codigo === banco.codigo || refs.has(`OFX:${mov.fitid}`) || fechadas.has(mov.dataISO.slice(0, 7))) { recusados.push(it.fitid); continue; }
        const l = lancamentoDoMovimento(mov, banco, contra);
        novos.push(l); refs.add(String(l.documentoRef)); feitos.push({ fitid: mov.fitid, lancamentoId: l.id, situacao: "lancado" });
      }
      return { payload: novos.length ? { ...payload, lancamentos: [...lancamentos, ...novos] } : null, resultado: { feitos, recusados } };
    }, { userId: sessao.userId, login: sessao.login });
    const n = await marcarConciliados(consultar, cnpj, contaBanco, r.resultado.feitos, sessao.login);
    return { r, lancados: n, recusados: r.resultado.recusados };
  };
  app.post("/api/workspaces/:cnpj/extratos/conciliar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 2000).map((x: any) => ({ fitid: String(x?.fitid || ""), lancamentoId: String(x?.lancamentoId || "") })) : [];
    if (!itens.length) return res.status(400).json({ sucesso: false, motivo: "Selecione os movimentos para conciliar." });
    try {
      const r = await conciliarItens(a.cnpj, String(req.body?.contaBanco || ""), itens, a.sessao.login);
      return res.json({ sucesso: true, ...r, mensagem: `${r.conciliados} movimento(s) conciliado(s)${r.recusados.length ? `; ${r.recusados.length} não bateram (valor, sentido ou lançamento já usado)` : ""}.` });
    } catch (e) { return erroHttp(res, e, "Não foi possível conciliar."); }
  });
  app.post("/api/workspaces/:cnpj/extratos/lancar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const itens = Array.isArray(req.body?.itens) ? req.body.itens.slice(0, 500).map((x: any) => ({ fitid: String(x?.fitid || ""), contaContrapartida: String(x?.contaContrapartida || "") })) : [];
    if (!itens.length) return res.status(400).json({ sucesso: false, motivo: "Selecione os movimentos para lançar." });
    try {
      const { r, lancados, recusados } = await lancarItens(a.cnpj, String(req.body?.contaBanco || ""), itens, a.sessao);
      return res.json(respostaAlteracao(r, { lancados, recusados, mensagem: `${lancados} lançamento(s) criado(s) e enviado(s) para aprovação${recusados.length ? `; ${recusados.length} ficaram de fora (conta inválida, já lançado ou mês fechado)` : ""}.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível lançar os movimentos."); }
  });
  /** Aceita as sugestões do robô dos movimentos escolhidos: concilia os que têm lançamento sugerido e lança os que têm conta sugerida. */
  app.post("/api/workspaces/:cnpj/extratos/aceitar-sugestoes", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const contaBanco = String(req.body?.contaBanco || "");
    const fitids = new Set(Array.isArray(req.body?.fitids) ? req.body.fitids.slice(0, 2000).map(String) : []);
    if (!fitids.size) return res.status(400).json({ sucesso: false, motivo: "Selecione os movimentos com sugestão." });
    try {
      const pendentes = (await lerMovimentosExtrato(consultar, a.cnpj, { contaBanco, situacao: "pendente", limite: 5000 })).filter((m) => fitids.has(m.fitid));
      const paraConciliar = pendentes.filter((m) => m.sugestaoLancamentoId).map((m) => ({ fitid: m.fitid, lancamentoId: String(m.sugestaoLancamentoId) }));
      const paraLancar = pendentes.filter((m) => !m.sugestaoLancamentoId && m.sugestaoConta).map((m) => ({ fitid: m.fitid, contaContrapartida: String(m.sugestaoConta) }));
      const c = paraConciliar.length ? await conciliarItens(a.cnpj, contaBanco, paraConciliar, a.sessao.login) : { conciliados: 0, recusados: [] as string[] };
      const l = paraLancar.length ? await lancarItens(a.cnpj, contaBanco, paraLancar, a.sessao) : null;
      const semSugestao = fitids.size - paraConciliar.length - paraLancar.length;
      return res.json({ sucesso: true, persistencia: "postgresql", alterado: Boolean(l?.r.dados), dados: l?.r.dados ?? null, versao: l?.r.versao ?? null, conciliados: c.conciliados, lancados: l?.lancados || 0, recusados: [...c.recusados, ...(l?.recusados || [])], mensagem: `${c.conciliados} conciliado(s) e ${l?.lancados || 0} lançado(s) para aprovação${semSugestao ? `; ${semSugestao} sem sugestão ficaram pendentes` : ""}.` });
    } catch (e) { return erroHttp(res, e, "Não foi possível aceitar as sugestões."); }
  });
  app.post("/api/workspaces/:cnpj/extratos/desfazer", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const fitids = Array.isArray(req.body?.fitids) ? req.body.fitids.slice(0, 500).map(String) : [];
    if (!fitids.length) return res.status(400).json({ sucesso: false, motivo: "Selecione os movimentos." });
    try {
      const n = await desfazerConciliacao(consultar, a.cnpj, String(req.body?.contaBanco || ""), fitids);
      return res.json({ sucesso: true, desfeitos: n, mensagem: `${n} movimento(s) voltaram para pendente. Lançamento já criado não é apagado: se precisar, estorne.` });
    } catch (e) { return erroHttp(res, e, "Não foi possível desfazer a conciliação."); }
  });

  // ---------- regras de conciliação
  app.post("/api/workspaces/:cnpj/regras-conciliacao", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const contem = String(req.body?.contem || "").trim();
    const contaCodigo = String(req.body?.contaCodigo || "").trim();
    const sentido = ["entrada", "saida", "ambos"].includes(req.body?.sentido) ? req.body.sentido : "ambos";
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        if (contem.length < 3 || contem.length > 80) throw new ErroAlteracaoWorkspace(400, "O texto da regra precisa ter de 3 a 80 caracteres.");
        if (!analiticasDe(payload).has(contaCodigo)) throw new ErroAlteracaoWorkspace(400, "Escolha uma conta analítica do plano para a regra.");
        const lista: RegraConciliacao[] = Array.isArray(payload.regrasConciliacao) ? payload.regrasConciliacao : [];
        if (lista.some((x) => x.contem.toLowerCase() === contem.toLowerCase() && x.sentido === sentido)) throw new ErroAlteracaoWorkspace(409, "Já existe uma regra com esse texto e sentido.");
        const nova: RegraConciliacao = { id: `regra-${crypto.randomUUID()}`, contem, contaCodigo, sentido, ativo: true };
        return { payload: { ...payload, regrasConciliacao: [...lista, nova] }, resultado: { regra: nova } };
      });
      return res.json(respostaAlteracao(r, { ...r.resultado, mensagem: `Regra criada: quando o histórico tiver "${contem}", sugerir a conta ${contaCodigo}.` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível criar a regra."); }
  });
  app.delete("/api/workspaces/:cnpj/regras-conciliacao/:id", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || "");
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const lista: RegraConciliacao[] = Array.isArray(payload.regrasConciliacao) ? payload.regrasConciliacao : [];
        if (!lista.some((x) => x.id === id)) throw new ErroAlteracaoWorkspace(404, "Regra não encontrada.");
        return { payload: { ...payload, regrasConciliacao: lista.filter((x) => x.id !== id) }, resultado: {} };
      });
      return res.json(respostaAlteracao(r, { mensagem: "Regra removida. Sugestões já gravadas continuam até a próxima rodada do robô." }));
    } catch (e) { return erroHttp(res, e, "Não foi possível remover a regra."); }
  });

  // ---------- "Quer que eu ajuste?" no fechamento: análise (só lê) e uma decisão por vez (Sim / Desfazer / Manter)
  const competenciaDoPedido = (v: unknown) => (COMP.test(String(v || "")) ? String(v) : undefined);
  app.get("/api/workspaces/:cnpj/ajustes-fechamento", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try {
      const payload = await lerWorkspaceInternoContabil(a.cnpj);
      if (!payload) return res.status(404).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados contábeis salvos." });
      const competencia = competenciaDoPedido(req.query.competencia);
      const propostas = analisarFechamento({ contas: contasDe(payload), lancamentos: lancamentosDe(payload), empresa: payload.empresa, competencia });
      return res.json({ sucesso: true, competencia: competencia || null, propostas, resumo: resumoAjustesFechamento(propostas) });
    } catch (e) { return erroHttp(res, e, "Não foi possível analisar o fechamento."); }
  });
  app.post("/api/workspaces/:cnpj/ajustes-fechamento", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.body?.id || "").slice(0, 200); const acao = String(req.body?.acao || "");
    if (!id || !["executar", "desfazer", "manter"].includes(acao)) return res.status(400).json({ sucesso: false, motivo: "Informe o item e a ação (executar, desfazer ou manter)." });
    const competencia = competenciaDoPedido(req.body?.competencia);
    try {
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload) => {
        const antes = analisarFechamento({ contas: contasDe(payload), lancamentos: lancamentosDe(payload), empresa: payload.empresa, competencia });
        const proposta = antes.find((x) => x.id === id);
        if (!proposta) throw new ErroAlteracaoWorkspace(404, "Este item não está mais na análise (pode já ter sido resolvido).");
        if (acao === "desfazer" && proposta.situacao !== "feito") throw new ErroAlteracaoWorkspace(409, "Este item ainda não foi ajustado.");
        let novo: Record<string, any>;
        try { novo = aplicarPropostaFechamento(payload, proposta, acao as "executar" | "desfazer" | "manter", a.sessao.login); }
        catch (e: any) { throw new ErroAlteracaoWorkspace(409, String(e?.message || e)); }
        const depois = analisarFechamento({ contas: contasDe(novo), lancamentos: lancamentosDe(novo), empresa: novo.empresa, competencia });
        const rel = gerarRelatoriosContabeis(contasDe(novo), lancamentosDe(novo), competencia || "todos");
        return { payload: novo, resultado: { depois, proposta, diferenca: rel.totalSaldoDevedorCentavos - rel.totalSaldoCredorCentavos } };
      }, autor(a.sessao));
      const { depois, proposta, diferenca } = r.resultado;
      const agora = depois.find((x) => x.id === id);
      const conferido = acao !== "executar" ? "" : agora && agora.situacao !== "feito" ? " Conferi de novo: ainda não bateu, veja o item." : ` Conferi de novo: ${diferenca === 0 ? "o balancete fecha exatamente" : `o balancete ainda tem diferença de R$ ${(Math.abs(diferenca) / 100).toFixed(2).replace(".", ",")}`}.`;
      const msg = acao === "manter" ? "Mantido como está (marcado como conferido)." : acao === "desfazer" ? (proposta.tipo === "lancamento" ? "Ajuste desfeito por estorno (o lançamento continua no Diário)." : "Desfeito: voltou o valor anterior.") : `Ajuste feito.${conferido}`;
      return res.json(respostaAlteracao(r, { mensagem: msg, propostas: depois, resumo: resumoAjustesFechamento(depois) }));
    } catch (e) { return erroHttp(res, e, "Não foi possível aplicar o ajuste."); }
  });

  // ---------- achados dos robôs desta escrituração (só as empresas da sessão)
  app.get("/api/escrituracao/achados", sessaoMw, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const cnpj = req.query.cnpj ? normalizarCnpjAcesso(req.query.cnpj) : "";
    const cnpjs = sessao.cnpjs.map(normalizarCnpjAcesso).filter((c) => !cnpj || c === cnpj);
    return res.json({ sucesso: true, achados: achadosEscrituracao(cnpjs) });
  });
}

// ------------------------------------------------------------------ robôs (rodam para todos os escritórios, empresa por empresa)

export async function roboLancamentosPadrao(agora = new Date()): Promise<string> {
  const competencia = competenciaDe(agora);
  let empresas = 0, preparados = 0, falhas = 0;
  for await (const { cnpj, payload } of percorrerWorkspacesContabil()) {
    if (!Array.isArray(payload.lancamentosPadrao) || !payload.lancamentosPadrao.some((p: any) => p?.ativo)) { guardarAchado(null, "recorrentes", cnpj); continue; }
    empresas += 1;
    try {
      const r = await alterarWorkspaceNoServidorContabil(cnpj, (p, { fechadas }) => {
        const plano = planejarRecorrentes(p, competencia, fechadas);
        return { payload: plano.novos.length ? { ...p, lancamentos: [...lancamentosDe(p), ...plano.novos] } : null, resultado: plano };
      });
      preparados += r.resultado.novos.length;
      guardarAchado(r.resultado.avisos.length ? { cnpj, tipo: "recorrentes", titulo: "Lançamento padrão com problema", detalhe: r.resultado.avisos.join(" "), verificadoEm: agora.toISOString() } : null, "recorrentes", cnpj);
    } catch (e: any) { falhas += 1; console.error(`Robô dos lançamentos padrão falhou para ${cnpj}:`, e?.message || e); }
  }
  return `${empresas} empresa(s) com lançamento padrão; ${preparados} partida(s) preparada(s) para aprovação em ${competencia}; ${falhas} falha(s).`;
}

export async function roboLivroCaixa(consultar: Consultar, agora = new Date()): Promise<string> {
  const competencia = competenciaAnteriorDe(agora);
  const fechadasPorCnpj = new Map<string, Set<string>>();
  for (const r of (await consultar("SELECT cnpj, competencia FROM contabil_period_closures WHERE competencia=$1", [competencia])).rows) {
    if (!fechadasPorCnpj.has(String(r.cnpj))) fechadasPorCnpj.set(String(r.cnpj), new Set());
    fechadasPorCnpj.get(String(r.cnpj))!.add(String(r.competencia));
  }
  let simples = 0, emitidos = 0, pendentes = 0;
  for await (const { cnpj, payload } of percorrerWorkspacesContabil()) {
    const s = situacaoLivroCaixaDoMes(payload, competencia);
    if (s.situacao === "nao_se_aplica") { guardarAchado(null, "livro_caixa", cnpj); continue; }
    simples += 1;
    if (s.situacao === "pode_emitir" && !fechadasPorCnpj.get(cnpj)?.has(competencia)) {
      try {
        await alterarWorkspaceNoServidorContabil(cnpj, (p) => {
          const livros: LivroContabil[] = Array.isArray(p.livros) ? p.livros : [];
          if (livros.some((l) => l.id === idLivroCaixa(competencia))) return { payload: null, resultado: null };
          return { payload: { ...p, livros: [...livros, s.registro] }, resultado: null };
        });
        emitidos += 1; guardarAchado(null, "livro_caixa", cnpj); continue;
      } catch (e: any) { console.error(`Robô do Livro Caixa falhou para ${cnpj}:`, e?.message || e); }
    }
    if (s.situacao === "pendente" || s.situacao === "pode_emitir") { pendentes += 1; guardarAchado({ cnpj, tipo: "livro_caixa", titulo: `Livro Caixa de ${competencia.slice(5)}/${competencia.slice(0, 4)} pendente`, detalhe: s.situacao === "pode_emitir" ? `${s.detalhe} A competência está fechada: emita o Livro Caixa pela tela Livros.` : s.detalhe, verificadoEm: agora.toISOString() }, "livro_caixa", cnpj); }
    else guardarAchado(null, "livro_caixa", cnpj);
  }
  return `${simples} empresa(s) do Simples conferida(s) para ${competencia}; ${emitidos} Livro(s) Caixa sem movimento emitido(s) sozinho(s); ${pendentes} pendente(s) (sem Diário/Razão e sem Livro Caixa).`;
}

export async function roboEncerramento(consultar: Consultar, agora = new Date()): Promise<string> {
  const ano = agora.getFullYear() - 1;
  const fechadasPorCnpj = new Map<string, Set<string>>();
  for (const r of (await consultar("SELECT cnpj, competencia FROM contabil_period_closures WHERE competencia LIKE $1", [`${ano}-%`])).rows) {
    if (!fechadasPorCnpj.has(String(r.cnpj))) fechadasPorCnpj.set(String(r.cnpj), new Set());
    fechadasPorCnpj.get(String(r.cnpj))!.add(String(r.competencia));
  }
  let conferidas = 0, preparados = 0, avisos = 0;
  for await (const { cnpj, payload } of percorrerWorkspacesContabil()) {
    conferidas += 1;
    const plano = planejarEncerramento(payload, ano, fechadasPorCnpj.get(cnpj) || new Set());
    if (plano.acao === "preparar") {
      try {
        await alterarWorkspaceNoServidorContabil(cnpj, (p, { fechadas }) => {
          const novo = planejarEncerramento(p, ano, fechadas); // recalcula dentro da transação
          return { payload: novo.acao === "preparar" && novo.lote ? { ...p, lancamentos: [...lancamentosDe(p), ...novo.lote] } : null, resultado: null };
        });
        preparados += 1;
        guardarAchado({ cnpj, tipo: "encerramento", titulo: `Encerramento de ${ano} aguardando aprovação`, detalhe: plano.detalhe, verificadoEm: agora.toISOString() }, "encerramento", cnpj);
      } catch (e: any) { console.error(`Robô do encerramento falhou para ${cnpj}:`, e?.message || e); }
      continue;
    }
    if (plano.acao === "avisar") { avisos += 1; guardarAchado({ cnpj, tipo: "encerramento", titulo: `Encerramento do resultado de ${ano}`, detalhe: plano.detalhe, verificadoEm: agora.toISOString() }, "encerramento", cnpj); }
    else guardarAchado(null, "encerramento", cnpj);
  }
  return `${conferidas} empresa(s) conferida(s) para o encerramento de ${ano}; ${preparados} encerramento(s) preparado(s) para aprovação; ${avisos} aviso(s).`;
}

export async function roboConciliacao(consultar: Consultar, agora = new Date()): Promise<string> {
  const lista = await contasComPendentes(consultar);
  let sugestoes = 0;
  const porCnpj = new Map<string, number>();
  for (const { cnpj, contaBanco, pendentes } of lista) {
    try {
      const payload = await lerWorkspaceInternoContabil(cnpj);
      if (!payload) continue;
      const movs = await lerMovimentosExtrato(consultar, cnpj, { contaBanco, limite: 5000 });
      const ja = new Set(movs.filter((m) => m.situacao !== "pendente" && m.lancamentoId).map((m) => String(m.lancamentoId)));
      const s = sugerirParaPendentes(movs.filter((m) => m.situacao === "pendente"), { lancamentos: lancamentosDe(payload), contaBanco, regras: (Array.isArray(payload.regrasConciliacao) ? payload.regrasConciliacao : []) as RegraConciliacaoExtrato[], contasAnaliticas: analiticasDe(payload), lancamentosJaConciliados: ja });
      sugestoes += await gravarSugestoes(consultar, cnpj, contaBanco, s);
      porCnpj.set(cnpj, (porCnpj.get(cnpj) || 0) + pendentes);
    } catch (e: any) { console.error(`Robô da conciliação falhou para ${cnpj}/${contaBanco}:`, e?.message || e); }
  }
  for (const [cnpj, n] of porCnpj) guardarAchado({ cnpj, tipo: "conciliacao", titulo: "Extrato com movimento sem conciliar", detalhe: `${n} movimento(s) do extrato ainda sem conciliação. Veja as sugestões em Gestão contábil → Extrato e conciliação.`, verificadoEm: agora.toISOString() }, "conciliacao", cnpj);
  for (const a of achadosEscrituracao()) if (a.tipo === "conciliacao" && !porCnpj.has(a.cnpj)) guardarAchado(null, "conciliacao", a.cnpj);
  return `${lista.length} conta(s) de banco com movimento pendente; ${sugestoes} sugestão(ões) nova(s) ou atualizada(s) para aprovação.`;
}

export { agruparPorLote };

export function resumoAjustesFechamento(p: PropostaFechamento[]): string {
  const pend = p.filter((x) => x.situacao === "pendente");
  const prontos = pend.filter((x) => x.tipo !== "verificar").length;
  if (!pend.length) return p.some((x) => x.situacao === "feito") ? "Fechamento: tudo fecha; os ajustes feitos podem ser desfeitos aqui." : "Fechamento: nada a ajustar.";
  return `Fechamento: ${prontos} ajuste(s) pronto(s) esperando o "Sim"${pend.length - prontos ? ` e ${pend.length - prontos} item(ns) para verificar` : ""}.`;
}

/** Robô conferidor do fechamento: em cada empresa, acha o que não fecha e deixa a proposta pronta (não lança nada). */
export async function roboAjustesFechamento(agora = new Date()): Promise<string> {
  let empresas = 0, comAjuste = 0, prontos = 0, verificar = 0;
  for await (const { cnpj, payload } of percorrerWorkspacesContabil()) {
    if (!contasDe(payload).length || !lancamentosDe(payload).length) { guardarAchado(null, "ajustes_fechamento", cnpj); continue; }
    empresas += 1;
    try {
      const p = analisarFechamento({ contas: contasDe(payload), lancamentos: lancamentosDe(payload), empresa: payload.empresa }).filter((x) => x.situacao === "pendente");
      const pr = p.filter((x) => x.tipo !== "verificar").length;
      prontos += pr; verificar += p.length - pr;
      if (p.length) comAjuste += 1;
      guardarAchado(p.length ? { cnpj, tipo: "ajustes_fechamento", titulo: pr ? `${pr} ajuste(s) pronto(s) — "Quer que eu ajuste?"` : `${p.length} item(ns) do fechamento para verificar`, detalhe: p.slice(0, 3).map((x) => `${x.titulo}: ${x.causa}`).join(" | "), verificadoEm: agora.toISOString() } : null, "ajustes_fechamento", cnpj);
    } catch (e: any) { console.error(`Robô dos ajustes do fechamento falhou para ${cnpj}:`, e?.message || e); }
  }
  return `${empresas} empresa(s) conferida(s); ${comAjuste} com algo que não fecha: ${prontos} ajuste(s) pronto(s) esperando o "Sim" do contador e ${verificar} item(ns) para verificar. Nada foi lançado sozinho.`;
}
