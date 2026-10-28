import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import { ErroValidacaoDocumentoFiscal, fiscalStoreConfigurado, gravarDocumentosFiscais, lerDocumentosFiscais, lerVersoesDocumentoFiscal, verificarEstadoStoreFiscal } from "./src/server/documentosFiscaisStore";
import { dpStoreConfigurado, ErroConflitoResumoDP, ErroValidacaoResumoDP, gravarResumoDP, lerResumosDP, verificarEstadoStoreDP } from "./src/server/dadosDpStore";
import { registrarGestaoEquipe } from "./src/server/gestaoEquipe";
import { prepararAuthContabil, configGestaoEquipeContabil, adicionarEmpresaAcessoContabil, adicionarEquipeContabil, bloquearEscritorioContabil, definirLimiteEscritorioContabil, convidarEquipeContabil, convidarEscritorioContabil, listarEquipeContabil, listarEscritoriosContabil, removerEquipeContabil, bootstrapAuthContabil, contabilizarRascunhosAutomaticosContabil, cnpjContabilValido, criarConviteUsuarioContabil, decidirLancamentoManualContabil, exigirSessaoContabil, sessaoDaRequisicaoContabil, fecharCompetenciaContabil, lerWorkspaceContabil, lerWorkspaceInternoContabil, listarCnpjsComMapeamentoContabil, listarFechamentosContabil, listarHistoricoAprovacoesContabil, listarUsuariosEmpresaContabil, listarWorkspacesContabil, loginAuthContabil, logoutAuthContabil, normalizarCnpjAcesso, removerEmpresaAcessoContabil, resgatarConviteUsuarioContabil, revogarUsuarioEmpresaContabil, salvarWorkspaceContabil, sessaoAtualContabil, statusAuthContabil, verificarCnpjAutorizadoContabil, vincularUsuarioExistenteContabil, importarCnpjsCompartilhados } from "./src/server/authContabil";
import { ArmazemAcoesPendentes, confirmarAcao as confirmarAcaoAgenteIA, conversar as conversarAgenteIA, recusarAcao as recusarAcaoAgenteIA, type ChamarApi, type ContextoAgente, type ModeloIA } from "./src/server/agenteMotor";
import { kitContabil } from "./src/server/agenteContabil";
import { ArmazemPedidosMemoria, ArmazemPedidosPg, CentralDePedidos, tokenValido } from "./src/server/agentesEntreSistemas";
import { criarAtividadeEscritorio } from './src/server/atividadeEscritorio';
import type { SessaoContabil } from './src/server/authContabil';
import { listarRegistroAgenteIAContabil, bancoContabilConfigurado, consultaBancoContabil, hashSessaoContabil, registrarAcaoAgenteIAContabil } from "./src/server/authContabil";
import { executarRobo, registrarResultadoRobo, registrarRobo, statusRobos } from "./src/server/robosStatus";
import { buscarEmpresasDoFiscal, cnpjsValidosDoFiscal } from "./src/server/empresasDoFiscal";
import { resumoRelatorioAcessos, rodarConferidorAcessos } from "./src/server/conferidorAcessos";
import { achadosEcdDoConferidor, rodarConferidorContabil } from "./src/server/conferidorContabil";
import { gerarCandidatosRascunhosAutomaticos, mesclarRascunhosNoWorkspace, prepararRascunhosContabeisAutomaticos } from "./src/server/prepararRascunhosContabeis";
import { omitirXmlOriginal, resumirCoberturaXmlFiscal } from "./src/server/coberturaXmlFiscal";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (e) {
      console.error("Erro ao inicializar GoogleGenAI:", e);
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const reconciliacaoRascunhosStatus: {
    iniciouEm: string | null;
    concluiuEm: string | null;
    empresas: number;
    criados: number;
    atualizados: number;
    falhas: number;
    emCurso: boolean;
  } = { iniciouEm: null, concluiuEm: null, empresas: 0, criados: 0, atualizados: 0, falhas: 0, emCurso: false };

  type EstadoOrigemRemota = { disponivel: boolean; mensagem: string; verificadoEm: string };
  const consultarOrigemRemota = async (url: string, sistemaEsperado: "Murade Fiscal" | "Murade Departamento Pessoal"): Promise<EstadoOrigemRemota> => {
    const verificadoEm = new Date().toISOString();
    const token = process.env.MURADE_INTEGRATION_TOKEN?.trim();
    if (!token) return { disponivel: false, mensagem: "Token de integração não configurado no Contábil.", verificadoEm };
    try {
      const destino = new URL(url);
      const hostsPermitidos = new Set(["murade-fiscal-1.onrender.com", "murade-dp.onrender.com"]);
      if (destino.protocol !== "https:" || !hostsPermitidos.has(destino.hostname) || destino.username || destino.password) {
        return { disponivel: false, mensagem: "Endereço do serviço fora da lista permitida.", verificadoEm };
      }
      const resposta = await fetch(destino, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      const payload = await resposta.json().catch(() => ({})) as Record<string, unknown>;
      if (!resposta.ok || payload.conectado !== true || payload.sistema !== sistemaEsperado) {
        return {
          disponivel: false,
          mensagem: !resposta.ok ? `O serviço respondeu HTTP ${resposta.status}.` : "O serviço não confirmou a identidade e a conexão esperadas.",
          verificadoEm,
        };
      }
      return { disponivel: true, mensagem: "API autenticada respondeu; isso não confirma recebimento de novos dados.", verificadoEm };
    } catch (erro) {
      const timeout = erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
      return { disponivel: false, mensagem: timeout ? "Tempo limite ao consultar o serviço." : "Não foi possível alcançar o serviço remoto.", verificadoEm };
    }
  };

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Cabeçalhos de proteção. Sem CSP de propósito: precisa ser testada no navegador antes de ativar.
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=()");
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  // O corpo é lido antes de checar o login, então o limite padrão é menor para reduzir abuso.
  // Só o workspace da empresa e o recebimento de documentos fiscais precisam de corpo grande.
  // O analisador específico vem primeiro: o geral não relê um corpo já lido.
  app.use(["/api/workspaces", "/api/integracao/fiscal/documentos"], express.json({ limit: "20mb" }));
  app.use(express.json({ limit: "2mb" }));
  const sessaoAtividade = (req: express.Request) => (req as express.Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const atividadeEquipe = criarAtividadeEscritorio({ consultar: consultaBancoContabil, tabela: "contabil_atividade_equipe", sessao: sessaoAtividade, podeVer: (req) => sessaoAtividade(req)?.administrador === true });
  app.use("/api", atividadeEquipe.registrar);

  // Limite simples por IP para rotas públicas que consultam serviços externos.
  const usoPublico = new Map<string, { inicio: number; total: number }>();
  const limitarUsoPublico = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const agora = Date.now();
    const chave = req.ip || "desconhecido";
    const atual = usoPublico.get(chave);
    if (!atual || agora - atual.inicio > 60_000) {
      if (usoPublico.size > 5000) usoPublico.clear();
      usoPublico.set(chave, { inicio: agora, total: 1 });
      return next();
    }
    atual.total += 1;
    if (atual.total > 30) return res.status(429).json({ sucesso: false, error: "Muitas consultas. Aguarde um minuto." });
    next();
  };
  app.use(["/api/receita", "/api/orgaos/status"], limitarUsoPublico);

  const integracaoAutorizada = (req: express.Request): boolean => {
    const expected = process.env.MURADE_INTEGRATION_TOKEN || "";
    const authorization = req.get("authorization") || "";
    const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    return Boolean(expectedBytes.length && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes));
  };

  const negarIntegracao = (req: express.Request, res: express.Response): boolean => {
    if (!process.env.MURADE_INTEGRATION_TOKEN) {
      res.status(503).json({ sucesso: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado no Contábil." });
      return true;
    }
    if (!integracaoAutorizada(req)) {
      res.status(401).json({ sucesso: false, motivo: "Credencial de integração inválida." });
      return true;
    }
    return false;
  };

  const exigirOrigemNavegador = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.get("origin");
    const expected = `${req.protocol}://${req.get("host")}`;
    try {
      if (!origin || new URL(origin).origin !== expected) return res.status(403).json({ sucesso: false, motivo: "Origem da requisição não autorizada." });
      next();
    } catch {
      return res.status(403).json({ sucesso: false, motivo: "Origem da requisição não autorizada." });
    }
  };

  app.get("/api/auth/status", statusAuthContabil);
  app.get("/api/auth/session", sessaoAtualContabil);
  app.post("/api/auth/bootstrap", exigirOrigemNavegador, bootstrapAuthContabil);
  app.post("/api/auth/login", exigirOrigemNavegador, loginAuthContabil);
  app.post("/api/auth/logout", exigirOrigemNavegador, logoutAuthContabil);
  registrarGestaoEquipe(app, configGestaoEquipeContabil(exigirSessaoContabil, exigirOrigemNavegador));
  app.post("/api/auth/redeem", exigirOrigemNavegador, resgatarConviteUsuarioContabil);
  app.post("/api/auth/companies", exigirOrigemNavegador, exigirSessaoContabil, adicionarEmpresaAcessoContabil);
  app.delete("/api/auth/companies/:cnpj", exigirOrigemNavegador, exigirSessaoContabil, removerEmpresaAcessoContabil);
  app.post("/api/auth/invites", exigirOrigemNavegador, exigirSessaoContabil, criarConviteUsuarioContabil);
  app.post("/api/auth/access", exigirOrigemNavegador, exigirSessaoContabil, vincularUsuarioExistenteContabil);
  app.get("/api/auth/users", exigirSessaoContabil, listarUsuariosEmpresaContabil);
  app.delete("/api/auth/users/:login", exigirOrigemNavegador, exigirSessaoContabil, revogarUsuarioEmpresaContabil);
  app.get("/api/auth/team", exigirSessaoContabil, listarEquipeContabil);
  app.get("/api/auth/atividade", exigirSessaoContabil, atividadeEquipe.listar);
  app.post("/api/auth/team/invite", exigirOrigemNavegador, exigirSessaoContabil, convidarEquipeContabil);
  app.post("/api/auth/team", exigirOrigemNavegador, exigirSessaoContabil, adicionarEquipeContabil);
  app.delete("/api/auth/team/:login", exigirOrigemNavegador, exigirSessaoContabil, removerEquipeContabil);
  app.get("/api/auth/tenants", exigirSessaoContabil, listarEscritoriosContabil);
  app.post("/api/auth/tenants/invite", exigirOrigemNavegador, exigirSessaoContabil, convidarEscritorioContabil);
  app.post("/api/auth/tenants/:login/bloqueio", exigirOrigemNavegador, exigirSessaoContabil, bloquearEscritorioContabil);
  app.post("/api/auth/tenants/:login/limite", exigirOrigemNavegador, exigirSessaoContabil, definirLimiteEscritorioContabil);
  app.get("/api/workspaces", exigirSessaoContabil, listarWorkspacesContabil);
  app.get("/api/workspaces/:cnpj", exigirSessaoContabil, lerWorkspaceContabil);
  app.get("/api/workspaces/:cnpj/historico-aprovacoes", exigirSessaoContabil, listarHistoricoAprovacoesContabil);
  app.get("/api/workspaces/:cnpj/fechamentos", exigirSessaoContabil, listarFechamentosContabil);
  app.post("/api/workspaces/:cnpj/fechamentos", exigirOrigemNavegador, exigirSessaoContabil, fecharCompetenciaContabil);
  // Licença por empresa: cadastrada e gerenciada no Murade DP; aqui só se lê (servidor a servidor).
  app.get("/api/licenca", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const cnpj = String(req.query.cnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (cnpj.length !== 14) return res.status(400).json({ motivo: "CNPJ inválido." });
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao || !sessao.cnpjs.includes(cnpj)) return res.status(403).json({ motivo: "Este CNPJ não está vinculado ao seu acesso." });
    const token = process.env.MURADE_INTEGRATION_TOKEN;
    if (!token) return res.json({ indisponivel: true, motivo: "Integração com o DP não configurada neste sistema." });
    const base = (process.env.MURADE_DP_URL || "https://murade-dp.onrender.com").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/integracao/licenca?cnpj=${encodeURIComponent(cnpj)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.json({ indisponivel: true, motivo: "O DP não respondeu à consulta de licença." });
      return res.json({ licenca: (await r.json()).licenca });
    } catch {
      return res.json({ indisponivel: true, motivo: "Não foi possível falar com o DP agora." });
    }
  });

  app.get("/api/integracao/status", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = (req as express.Request & { sessaoContabil?: { cnpjs: string[] } }).sessaoContabil;
    const cnpjs = (sessao?.cnpjs || []).map(normalizarCnpjAcesso).filter(cnpjContabilValido);
    if (!cnpjs.length) return res.status(403).json({ sucesso: false, motivo: "Sua sessão não tem empresas autorizadas." });
    const cnpjSolicitado = req.query.cnpj ? normalizarCnpjAcesso(req.query.cnpj) : "";
    if (cnpjSolicitado && (!cnpjContabilValido(cnpjSolicitado) || !cnpjs.includes(cnpjSolicitado))) {
      return res.status(403).json({ sucesso: false, motivo: "A empresa solicitada não está autorizada nesta sessão." });
    }
    const escopoCnpjs = cnpjSolicitado ? [cnpjSolicitado] : cnpjs;
    try {
      const [fiscal, dp, apiFiscal, apiDp] = await Promise.all([
        verificarEstadoStoreFiscal(escopoCnpjs),
        verificarEstadoStoreDP(escopoCnpjs),
        consultarOrigemRemota("https://murade-fiscal-1.onrender.com/api/integracao/contabil/status", "Murade Fiscal"),
        consultarOrigemRemota("https://murade-dp.onrender.com/api/integracao/contabil/ping", "Murade Departamento Pessoal"),
      ]);
      return res.json({
        sucesso: true,
        escopo: cnpjSolicitado ? "Empresa selecionada e autorizada nesta sessão" : "Empresas autorizadas nesta sessão",
        cnpjEmpresa: cnpjSolicitado || null,
        armazenamento: fiscal.disponivel && dp.disponivel ? "postgresql" : "indisponível",
        tokenServicoConfigurado: Boolean(process.env.MURADE_INTEGRATION_TOKEN?.trim()),
        fiscal,
        departamentoPessoal: dp,
        apiFiscal,
        apiDepartamentoPessoal: apiDp,
        reconciliacaoRascunhos: { ...reconciliacaoRascunhosStatus },
        rascunhosAguardamConferencia: true,
        transmissaoAutomaticaHabilitada: false,
        consultadoEm: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Falha ao consultar estado das integrações do Contábil:", error);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar o estado das integrações no PostgreSQL." });
    }
  });
  app.put("/api/workspaces/:cnpj", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    const cnpj = normalizarCnpjAcesso(req.params.cnpj);
    const workspaceEnviado = req.body?.dados;
    let permitirRascunhosServidor = false;
    try {
      const workspaceAtual = await lerWorkspaceInternoContabil(cnpj);
      const mapasAtuais = JSON.stringify(workspaceAtual?.mapeamentosOrigem || []);
      const mapasEnviados = JSON.stringify(workspaceEnviado?.mapeamentosOrigem || []);
      if (workspaceEnviado && mapasAtuais !== mapasEnviados && fiscalStoreConfigurado() && dpStoreConfigurado()) {
        const candidatos = await gerarCandidatosRascunhosAutomaticos(cnpj, workspaceEnviado);
        const mesclado = mesclarRascunhosNoWorkspace(cnpj, workspaceEnviado, candidatos);
        req.body.dados = mesclado.workspace;
        permitirRascunhosServidor = true;
        res.setHeader("X-Murade-Rascunhos-Preparados", String(mesclado.criados));
      }
    } catch (error) {
      console.error("Falha ao preparar rascunhos durante atualização dos mapeamentos:", error);
    }
    await salvarWorkspaceContabil(req, res, { dadosPropostosPeloCliente: workspaceEnviado, permitirRascunhosServidor });
  });
  app.post("/api/workspaces/:cnpj/contabilizar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    const cnpj = normalizarCnpjAcesso(req.params.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (!Array.isArray(req.body?.referencias) || req.body.referencias.length < 1 || req.body.referencias.length > 500) return res.status(400).json({ sucesso: false, motivo: "Selecione de 1 a 500 rascunhos para conferência." });
    try {
      const candidatos = await gerarCandidatosRascunhosAutomaticos(cnpj);
      await contabilizarRascunhosAutomaticosContabil(req, res, candidatos, req.body.referencias);
    } catch (error) {
      console.error("Falha ao revalidar origens para contabilização:", error);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível revalidar os dados de origem. Nenhum lançamento foi contabilizado." });
    }
  });
  app.post("/api/workspaces/:cnpj/lancamentos-manuais/:id/decisao", exigirOrigemNavegador, exigirSessaoContabil, (req, res) => {
    void decidirLancamentoManualContabil(req, res);
  });
  app.get("/api/revisao/origens", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = (req as express.Request & { sessaoContabil?: { cnpjs: string[] } }).sessaoContabil;
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    const desde = String(req.query.desde || "");
    const ate = String(req.query.ate || "");
    const limiteFiscal = req.query.limiteFiscal == null ? 200 : Number(req.query.limiteFiscal);
    const limiteDP = req.query.limiteDP == null ? 50 : Number(req.query.limiteDP);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (!sessao?.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." });
    if ((desde && !/^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) || (ate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(ate)) || (desde && ate && desde > ate)) {
      return res.status(400).json({ sucesso: false, motivo: "Período inválido; use AAAA-MM." });
    }
    if (!Number.isInteger(limiteFiscal) || limiteFiscal < 1 || limiteFiscal > 500 || !Number.isInteger(limiteDP) || limiteDP < 1 || limiteDP > 200) {
      return res.status(400).json({ sucesso: false, motivo: "Limites inválidos." });
    }
    if (!fiscalStoreConfigurado() || !dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "O PostgreSQL não está configurado para as duas origens." });
    try {
      const [documentos, folhas] = await Promise.all([
        lerDocumentosFiscais(cnpj, desde, ate, limiteFiscal),
        lerResumosDP(cnpj, desde, ate, limiteDP),
      ]);
      const coberturaXmlFiscal = resumirCoberturaXmlFiscal(documentos);
      return res.json({
        sucesso: true,
        cnpj,
        periodo: { desde: desde || null, ate: ate || null },
        documentos: documentos.map(omitirXmlOriginal),
        coberturaXmlFiscal,
        folhas,
        lancamentosGerados: 0,
        revisaoNecessaria: true,
      });
    } catch (error: any) {
      console.error("Falha ao montar fila de revisão das origens:", error);
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível carregar os dados recebidos." });
    }
  });

  // API Health
  app.get("/api/health", (req, res) => {
    // Resposta pública sem dados de clientes, consultada pelo painel central entre domínios.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({
      status: "ok",
      system: "Murad Contábil",
      version: "2026.2",
      preparacaoAutomaticaRascunhos: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Authenticated server-to-server handshake used by Murade Fiscal.
  app.get("/api/integracao/fiscal/status", async (req, res) => {
    const expected = process.env.MURADE_INTEGRATION_TOKEN;
    if (!expected) {
      return res.status(503).json({ conectado: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado." });
    }

    const authorization = req.get("authorization") || "";
    const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    const autorizado = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
    if (!autorizado) {
      return res.status(401).json({ conectado: false, motivo: "Credencial de integração inválida." });
    }

    let armazenamento: { disponivel: boolean; documentosRecebidos: number; ultimoRecebimento: string | null };
    try {
      armazenamento = await verificarEstadoStoreFiscal();
    } catch {
      armazenamento = { disponivel: false, documentosRecebidos: 0, ultimoRecebimento: null };
    }
    return res.json({
      conectado: true,
      sistema: "Murade Contábil",
      integracao: "Murade Fiscal",
      dadosCompartilhados: armazenamento.documentosRecebidos > 0,
      recebimentoFiscalConfigurado: armazenamento.disponivel,
      documentosFiscaisRecebidos: armazenamento.documentosRecebidos,
      ultimoRecebimentoFiscal: armazenamento.ultimoRecebimento,
      timestamp: new Date().toISOString(),
    });
  });

  // Receives source fiscal documents from the authenticated Fiscal service.
  // Documents are stored per CNPJ and idempotently by access key; they are not
  // turned into journal entries until an accountant maps the accounts.
  app.post("/api/integracao/fiscal/documentos", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!fiscalStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil para receber documentos com persistência." });
    }
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (req.body?.versaoContrato !== 1) return res.status(400).json({ sucesso: false, motivo: "Versão de contrato de integração não suportada." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const resultado = await gravarDocumentosFiscais(cnpj, req.body?.documentos);
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try {
        const preparado = await prepararRascunhosContabeisAutomaticos(cnpj);
        rascunhos = { ...preparado, disponivel: true };
      } catch (error) {
        rascunhos = { criados: 0, atualizados: 0, disponivel: false };
        console.error("Documentos fiscais salvos; a preparação automática de rascunhos ficou pendente:", error);
      }
      return res.json({
        sucesso: true,
        persistencia: "postgresql",
        cnpj,
        ...resultado,
        lancamentosContabeisGerados: 0,
        rascunhosContabeis: rascunhos,
        pendente: "Os rascunhos aguardam conferência e aprovação do contador; nenhum lançamento definitivo foi criado.",
        recebidoEm: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error instanceof ErroValidacaoDocumentoFiscal ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível persistir o lote fiscal no PostgreSQL." });
    }
  });

  // Authenticated readback for server-to-server reconciliation only.
  app.get("/api/integracao/fiscal/documentos", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!fiscalStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    }
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    const desde = String(req.query.desde || "");
    const ate = String(req.query.ate || "");
    const limite = req.query.limite == null ? 200 : Number(req.query.limite);
    if ((desde && !/^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) || (ate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(ate)) || (desde && ate && desde > ate)) {
      return res.status(400).json({ sucesso: false, motivo: "Período inválido; use AAAA-MM." });
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 500) return res.status(400).json({ sucesso: false, motivo: "Limite deve estar entre 1 e 500." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const documentos = await lerDocumentosFiscais(cnpj, desde, ate, limite);
      return res.json({ sucesso: true, cnpj, retornados: documentos.length, documentos });
    } catch (error: any) {
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível consultar documentos armazenados." });
    }
  });

  // Historical fiscal document versions are available only to authenticated
  // server-to-server callers and only within the authorized company scope.
  app.get("/api/integracao/fiscal/documentos/versoes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!fiscalStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    }
    // Reject repeated/structured query parameters instead of coercing them to
    // strings (for example ?cnpj[]=... or ?chave=a&chave=b).
    if (typeof req.query.cnpj !== "string" || typeof req.query.chave !== "string") {
      return res.status(400).json({ sucesso: false, motivo: "Informe um único CNPJ e uma única chave de documento." });
    }
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    const chave = req.query.chave.trim();
    const limite = req.query.limite == null ? 10 : Number(req.query.limite);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (!chave || chave.length > 128) return res.status(400).json({ sucesso: false, motivo: "Informe uma chave de documento válida." });
    if (!Number.isInteger(limite) || limite < 1 || limite > 10) return res.status(400).json({ sucesso: false, motivo: "Limite deve estar entre 1 e 10 versões." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const versoes = await lerVersoesDocumentoFiscal(cnpj, chave, limite);
      return res.json({ sucesso: true, cnpj, chave, retornadas: versoes.length, versoes });
    } catch (error: any) {
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível consultar as versões arquivadas." });
    }
  });

  // Authenticated server-to-server status used by Murade Departamento Pessoal.
  app.get("/api/integracao/dp/status", async (req, res) => {
    const expected = process.env.MURADE_INTEGRATION_TOKEN;
    if (!expected) {
      return res.status(503).json({ conectado: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado." });
    }

    const authorization = req.get("authorization") || "";
    const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    const autorizado = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
    if (!autorizado) {
      return res.status(401).json({ conectado: false, motivo: "Credencial de integração inválida." });
    }

    let armazenamento: { disponivel: boolean; folhasRecebidas: number; ultimoRecebimento: string | null };
    try {
      armazenamento = await verificarEstadoStoreDP();
    } catch {
      armazenamento = { disponivel: false, folhasRecebidas: 0, ultimoRecebimento: null };
    }
    return res.json({
      conectado: true,
      sistema: "Murade Contábil",
      integracao: "Murade Departamento Pessoal",
      recebimentoDPConfigurado: armazenamento.disponivel,
      dadosCompartilhados: armazenamento.folhasRecebidas > 0,
      folhasDPRecebidas: armazenamento.folhasRecebidas,
      ultimoRecebimentoDP: armazenamento.ultimoRecebimento,
      timestamp: new Date().toISOString(),
    });
  });

  // Accepts only accounting aggregates. Employee identifiers, names, CPF and
  // bank details are rejected by the payload validator and never persisted.
  app.post("/api/integracao/dp/folhas", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!dpStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil para receber folhas agregadas com persistência." });
    }
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const resultado = await gravarResumoDP(cnpj, req.body);
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try {
        const preparado = await prepararRascunhosContabeisAutomaticos(cnpj);
        rascunhos = { ...preparado, disponivel: true };
      } catch (error) {
        rascunhos = { criados: 0, atualizados: 0, disponivel: false };
        console.error("Resumo do DP salvo; a preparação automática de rascunhos ficou pendente:", error);
      }
      return res.json({
        sucesso: true,
        persistencia: "postgresql",
        cnpj,
        novo: resultado.novo,
        registro: resultado.registro,
        lancamentosContabeisGerados: 0,
        rascunhosContabeis: rascunhos,
        pendente: "Os rascunhos aguardam conferência e aprovação do contador; nenhum lançamento definitivo foi criado.",
      });
    } catch (error: any) {
      const status = error instanceof ErroConflitoResumoDP ? 409 : error instanceof ErroValidacaoResumoDP ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível persistir o resumo agregado do DP." });
    }
  });

  // Authenticated readback for DP-to-Accounting reconciliation.
  app.get("/api/integracao/dp/folhas", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!dpStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    }
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    const desde = String(req.query.desde || "");
    const ate = String(req.query.ate || "");
    const limite = req.query.limite == null ? 50 : Number(req.query.limite);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if ((desde && !/^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) || (ate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(ate)) || (desde && ate && desde > ate)) {
      return res.status(400).json({ sucesso: false, motivo: "Período inválido; use AAAA-MM." });
    }
    if (!Number.isInteger(limite) || limite < 1 || limite > 200) return res.status(400).json({ sucesso: false, motivo: "Limite deve estar entre 1 e 200." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const folhas = await lerResumosDP(cnpj, desde, ate, limite);
      return res.json({ sucesso: true, cnpj, retornados: folhas.length, folhas });
    } catch (error: any) {
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível consultar folhas agregadas do DP." });
    }
  });

  // In-memory store for shared Murad companies across Fiscal, DP and Contábil
  let empresasMuradFiscal: Array<Record<string, any>> = [];


  // API de Integração Murad Fiscal: Listar empresas
  app.get("/api/integracao/fiscal/empresas", (req, res) => {
    res.json({
      origem: "MURAD FISCAL",
      status: "desconectado",
      total: empresasMuradFiscal.length,
      empresas: empresasMuradFiscal,
      timestamp: new Date().toISOString(),
    });
  });

  // API de Integração Murad Fiscal: Puxar empresa ativa
  app.get("/api/integracao/fiscal/empresa-ativa", (req, res) => {
    const empresa = empresasMuradFiscal[0] || null;
    if (!empresa) {
      return res.status(404).json({ error: "Nenhuma empresa cadastrada no Murad Fiscal." });
    }
    res.json({
      origem: "MURAD FISCAL",
      status: "desconectado",
      mensagem: "Empresa recuperada com sucesso do módulo Murad Fiscal.",
      empresa,
      timestamp: new Date().toISOString(),
    });
  });

  // API de Integração Murad Fiscal: Conectar e sincronizar
  app.post("/api/integracao/fiscal/conectar", (req, res) => {
    res.status(503).json({ error: "Integração com Murad Fiscal ainda não configurada. Nenhum documento foi sincronizado." });
  });

  // API de Integração Murad DP: Dados de folha e funcionários
  app.get("/api/integracao/dp/dados", (req, res) => {
    res.status(503).json({ error: "Integração com Murad DP ainda não configurada. Nenhum dado de folha foi importado." });
  });

  // API de Integração Murad DP: Conectar
  app.post("/api/integracao/dp/conectar", (req, res) => {
    res.status(503).json({ error: "Integração com Murad DP ainda não configurada. Nenhum evento do eSocial foi transmitido ou importado." });
  });

  // Escrita persistente exige autenticação, autorização por empresa e banco de dados.
  app.post("/api/integracao/empresas", (_req, res) => {
    res.status(503).json({ error: "Cadastro compartilhado indisponível. Não há autenticação nem banco de dados configurados." });
  });

  // API de Consulta CNPJ Real na Receita Federal (BrasilAPI + ReceitaWS como contingência)
  app.get("/api/receita/cnpj/:cnpj", async (req, res) => {
    const rawCnpj = (req.params.cnpj || "").replace(/\D/g, "");
    if (rawCnpj.length !== 14) {
      return res.status(400).json({ error: "CNPJ inválido. Informe 14 dígitos numéricos." });
    }

    try {
      // 1. Consulta primária: BrasilAPI (base oficial da Receita Federal)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);

      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`, {
        signal: controller.signal,
        headers: { "User-Agent": "MuradContabil-RFB-Connector/2026.1" },
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const d = await resp.json();
        const cleanCep = (d.cep || "").replace(/\D/g, "");
        const formattedCep = cleanCep.length === 8 ? `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}` : d.cep;
        const formattedCnpj = `${rawCnpj.slice(0, 2)}.${rawCnpj.slice(2, 5)}.${rawCnpj.slice(5, 8)}/${rawCnpj.slice(8, 12)}-${rawCnpj.slice(12)}`;

        // Determinar Regime Tributário
        // Capital social não determina Lucro Real ou Lucro Presumido.
        let regimeTributario = "Não informado pela consulta cadastral";
        if (d.opcao_pelo_mei) regimeTributario = "MEI (opção cadastral informada pela fonte)";
        else if (d.opcao_pelo_simples) regimeTributario = "Simples Nacional (opção cadastral informada pela fonte)";

        const dataAberturaFormatada = d.data_inicio_atividade
          ? d.data_inicio_atividade.split("-").reverse().join("/")
          : "Não informada";

        const dataSituacaoFormatada = d.data_situacao_cadastral
          ? d.data_situacao_cadastral.split("-").reverse().join("/")
          : "Não informada";

        const telefoneFormatado = d.ddd_telefone_1 ? `(${d.ddd_telefone_1.slice(0, 2)}) ${d.ddd_telefone_1.slice(2)}` : "";

        return res.json({
          cnpj: formattedCnpj,
          razaoSocial: d.razao_social || "",
          nomeFantasia: d.nome_fantasia || d.razao_social || "",
          situacao: d.descricao_situacao_cadastral || "ATIVA",
          dataSituacao: dataSituacaoFormatada,
          dataAbertura: dataAberturaFormatada,
          regimeTributario,
          naturezaJuridica: d.natureza_juridica || "",
          cnaePrincipal: `${d.cnae_fiscal || ""} - ${d.cnae_fiscal_descricao || ""}`,
          cnaesSecundarios: (d.cnaes_secundarios || []).map((c: any) => `${c.codigo} - ${c.descricao}`),
          capitalSocial: d.capital_social || 0,
          capitalSocialFormatado: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.capital_social || 0),
          endereco: {
            logradouro: d.logradouro || "",
            numero: d.numero || "",
            complemento: d.complemento || "",
            bairro: d.bairro || "",
            municipio: d.municipio || "",
            uf: d.uf || "",
            cep: formattedCep,
            completo: `${d.logradouro || ""}${d.numero ? ", " + d.numero : ""}${d.complemento ? " - " + d.complemento : ""}, ${d.bairro || ""}`,
          },
          contato: {
            telefone: telefoneFormatado,
            email: d.email ? d.email.toLowerCase() : "",
          },
          qsa: (d.qsa || []).map((socio: any) => ({
            nome: socio.nome_socio || socio.nome || "",
            qualificacao: socio.qualificacao_socio || socio.qualificacao || "Sócio / Administrador",
            faixaEtaria: socio.faixa_etaria || "",
          })),
          fonte: "BrasilAPI (consulta cadastral pública; validar com a Receita Federal)",
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Contingência ReceitaWS se BrasilAPI falhar
      const controllerWs = new AbortController();
      const timeoutWs = setTimeout(() => controllerWs.abort(), 6500);
      const wsResp = await fetch(`https://receitaws.com.br/v1/cnpj/${rawCnpj}`, {
        signal: controllerWs.signal,
      });
      clearTimeout(timeoutWs);

      if (wsResp.ok) {
        const ws = await wsResp.json();
        if (ws.status !== "ERROR") {
          return res.json({
            cnpj: ws.cnpj || req.params.cnpj,
            razaoSocial: ws.nome || "",
            nomeFantasia: ws.fantasia || ws.nome || "",
            situacao: ws.situacao || "ATIVA",
            dataSituacao: ws.data_situacao || "",
            dataAbertura: ws.abertura || "",
            regimeTributario: ws.simples?.optante ? "Simples Nacional (opção cadastral informada pela fonte)" : "Não informado pela consulta cadastral",
            naturezaJuridica: ws.natureza_juridica || "",
            cnaePrincipal: ws.atividade_principal?.[0] ? `${ws.atividade_principal[0].code} - ${ws.atividade_principal[0].text}` : "",
            cnaesSecundarios: (ws.atividades_secundarias || []).map((a: any) => `${a.code} - ${a.text}`),
            capitalSocial: parseFloat(ws.capital_social || "0"),
            capitalSocialFormatado: ws.capital_social ? `R$ ${ws.capital_social}` : "R$ 0,00",
            endereco: {
              logradouro: ws.logradouro || "",
              numero: ws.numero || "",
              complemento: ws.complemento || "",
              bairro: ws.bairro || "",
              municipio: ws.municipio || "",
              uf: ws.uf || "",
              cep: ws.cep || "",
              completo: `${ws.logradouro || ""}${ws.numero ? ", " + ws.numero : ""}, ${ws.bairro || ""}`,
            },
            contato: {
              telefone: ws.telefone || "",
              email: ws.email ? ws.email.toLowerCase() : "",
            },
            qsa: (ws.qsa || []).map((q: any) => ({
              nome: q.nome || "",
              qualificacao: q.qual || "Sócio",
            })),
            fonte: "ReceitaWS (consulta cadastral de terceiros)",
            timestamp: new Date().toISOString(),
          });
        }
      }

      return res.status(404).json({ error: "CNPJ não localizado na base pública da Receita Federal." });
    } catch (err: any) {
      console.error("Erro na consulta CNPJ:", err);
      return res.status(500).json({ error: "Falha ao conectar com a base da Receita Federal. Tente novamente." });
    }
  });

  // API de Consulta CEP Real
  app.get("/api/receita/cep/:cep", async (req, res) => {
    const rawCep = (req.params.cep || "").replace(/\D/g, "");
    if (rawCep.length !== 8) {
      return res.status(400).json({ error: "CEP inválido. Informe 8 dígitos." });
    }

    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cep/v1/${rawCep}`);
      if (resp.ok) {
        const data = await resp.json();
        return res.json({
          cep: `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
          logradouro: data.street || "",
          bairro: data.neighborhood || "",
          cidade: data.city || "",
          uf: data.state || "",
          fonte: "BrasilAPI / Correios",
        });
      }

      // Fallback ViaCEP
      const viaCepResp = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
      if (viaCepResp.ok) {
        const v = await viaCepResp.json();
        if (!v.erro) {
          return res.json({
            cep: v.cep || `${rawCep.slice(0, 5)}-${rawCep.slice(5)}`,
            logradouro: v.logradouro || "",
            bairro: v.bairro || "",
            cidade: v.localidade || "",
            uf: v.uf || "",
            fonte: "ViaCEP / Correios",
          });
        }
      }

      return res.status(404).json({ error: "CEP não encontrado." });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao consultar CEP." });
    }
  });

  // API de Teste de Conexão Real com Portais Governamentais
  app.get("/api/orgaos/status", async (req, res) => {
    const endpointsParaTestar = [
      { id: "rfb", nome: "Receita Federal do Brasil", url: "https://servicos.receita.fazenda.gov.br", timeoutMs: 3500 },
      { id: "serpro", nome: "SERPRO / gov.br", url: "https://www.gov.br/pt-br", timeoutMs: 3500 },
      { id: "pgfn", nome: "PGFN — Regularize", url: "https://www.regularize.pgfn.gov.br", timeoutMs: 3500 },
      { id: "fgts-caixa", nome: "Caixa / FGTS Digital", url: "https://www.caixa.gov.br", timeoutMs: 3500 },
      { id: "sefaz", nome: "Portal NF-e / SEFAZ Nacional", url: "https://www.nfe.fazenda.gov.br", timeoutMs: 3500 },
      { id: "sintegra", nome: "Sintegra / Cadastro CCC", url: "https://dfe-portal.svrs.rs.gov.br", timeoutMs: 3500 },
      { id: "esocial", nome: "Portal eSocial Oficial", url: "https://www.gov.br/esocial/pt-br", timeoutMs: 3500 },
      { id: "simples", nome: "Simples Nacional", url: "https://www8.receita.fazenda.gov.br/SimplesNacional", timeoutMs: 3500 },
    ];

    const resultados = await Promise.all(
      endpointsParaTestar.map(async (item) => {
        const inicio = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), item.timeoutMs);

        try {
          const resp = await fetch(item.url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });
          clearTimeout(timer);
          const duracao = Date.now() - inicio;

          // Se retornou código HTTP (200, 301, 302, 403 de WAF governamental, etc.), o servidor está online e respondeu
          const online = resp.status >= 200 && resp.status < 500;
          return {
            id: item.id,
            nome: item.nome,
            url: item.url,
            // HTTP response is only reachability; it does not establish authentication/integration.
            status: online ? "alerta" : "offline",
            statusCode: resp.status,
            statusTexto: resp.statusText || (online ? "OK" : "Indisponível"),
            pingMs: duracao,
            tls: "HTTPS respondeu; autenticação e integração não verificadas",
            verificadoEm: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            autenticacaoValida: false,
          };
        } catch (err: any) {
          clearTimeout(timer);
          const duracao = Date.now() - inicio;
          return {
            id: item.id,
            nome: item.nome,
            url: item.url,
            status: "offline",
            statusTexto: err?.name === "AbortError" ? "Tempo limite excedido" : "Não foi possível conectar",
            pingMs: duracao,
            tls: "Não verificado",
            verificadoEm: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            autenticacaoValida: false,
          };
        }
      })
    );

    // SERPRO/Integra Contador: lê do Fisco IA (token de integração) só se as variáveis existem lá. Não autentica nada.
    const todosResultados: any[] = resultados;
    try {
      const token = process.env.MURADE_INTEGRATION_TOKEN?.trim();
      const base = (process.env.MURADE_FISCO_IA_URL || "https://murade-fisco-ia.onrender.com").trim().replace(/\/$/, "");
      const alvo = todosResultados.find((r) => r.id === "serpro");
      if (token && alvo) {
        const r = await fetch(`${base}/api/serpro/status-integracao`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const j: any = await r.json();
          const faltam = [
            !j?.producao?.consumerKey && "SERPRO_PRODUCAO_CONSUMER_KEY",
            !j?.producao?.consumerSecret && "SERPRO_PRODUCAO_CONSUMER_SECRET",
            !j?.certificadoEscritorio && "SERPRO_CERT_PFX_BASE64 / SERPRO_CERT_PFX_SENHA",
            !j?.cnpjContratante && "SERPRO_CONTRATANTE_CNPJ",
          ].filter(Boolean);
          alvo.detalhes = faltam.length
            ? `Credenciais no Fisco IA: faltam ${faltam.join(", ")}. Mesmo completas, contrato, escopos e procuração não são confirmados por este teste.`
            : "Credenciais SERPRO presentes no Fisco IA. Contrato, escopos e procuração ainda não são confirmados por este teste.";
        } else {
          alvo.detalhes = "Não foi possível ler o estado das credenciais no Fisco IA agora.";
        }
      }
    } catch {
      /* sem leitura: mantém o texto padrão */
    }

    res.json({
      timestamp: new Date().toISOString(),
      totalTestados: todosResultados.length,
      conectados: todosResultados.filter((r) => r.status === "conectado").length,
      resultados: todosResultados,
    });
  });

  // API do Agente IA Murad (Contabilidade, Fisco e Reforma Tributária 2026)
  // ==================================================
  // AGENTE IA DO CONTÁBIL — executa pedidos dentro do sistema
  // ==================================================
  // Cada ferramenta chama uma rota existente com a sessão (cookie) do próprio usuário: escopo por empresa,
  // perfil somente leitura e travas de conferência/fechamento continuam valendo.
  const acoesPendentesAgenteIA = new ArmazemAcoesPendentes();
  const usoAgenteIAPorSessao = new Map<string, number[]>();

  const centralDePedidos = new CentralDePedidos(
    "contabil",
    bancoContabilConfigurado() ? new ArmazemPedidosPg(consultaBancoContabil) : new ArmazemPedidosMemoria(),
    {
      robos: async () => statusRobos(),
      resumo: async () => ({ sistema: "Contábil", reconciliacaoRascunhos: { ...reconciliacaoRascunhosStatus }, robos: statusRobos().robos.map((r) => ({ nome: r.nome, estado: r.estado })) }),
    },
  );

  const chamarApiComoUsuario = (req: express.Request): ChamarApi => {
    const cookie = req.headers.cookie || "";
    return async (metodo, caminho, corpo) => {
      if (!/^\/api\/[A-Za-z0-9/_\-.?=&%:]*$/.test(caminho)) throw new Error("Caminho interno inválido.");
      const resposta = await fetch(`http://127.0.0.1:${PORT}${caminho}`, {
        method: metodo,
        headers: { cookie, "Content-Type": "application/json", Accept: "application/json", Origin: `http://127.0.0.1:${PORT}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(45_000),
      });
      const texto = await resposta.text();
      let json: any = {};
      try { json = JSON.parse(texto); } catch { /* resposta não JSON: o status basta */ }
      return { status: resposta.status, corpo: json };
    };
  };

  const contextoAgenteIA = (req: express.Request): ContextoAgente | null => {
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return null;
    return {
      sessaoHash: hashSessaoContabil(req),
      login: sessao.login,
      hoje: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
      chamarApi: chamarApiComoUsuario(req),
      registrar: (evento) => registrarAcaoAgenteIAContabil(sessao.login, evento),
      pendentes: acoesPendentesAgenteIA,
      kit: kitContabil,
      central: centralDePedidos,
    };
  };

  const limiteUsoAgenteIA = (sessaoHash: string): boolean => {
    const agora = Date.now();
    const recentes = (usoAgenteIAPorSessao.get(sessaoHash) || []).filter((t) => agora - t < 10 * 60_000);
    if (recentes.length >= 40) { usoAgenteIAPorSessao.set(sessaoHash, recentes); return false; }
    recentes.push(agora);
    usoAgenteIAPorSessao.set(sessaoHash, recentes);
    if (usoAgenteIAPorSessao.size > 500) for (const [chave, lista] of usoAgenteIAPorSessao) if (!lista.some((t) => agora - t < 10 * 60_000)) usoAgenteIAPorSessao.delete(chave);
    return true;
  };

  const modeloGeminiAgente = (): ModeloIA => async ({ instrucao, conteudos, declaracoes }) => {
    const ai = getAI();
    if (!ai) throw new Error("GEMINI_API_KEY não configurada.");
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: conteudos as any,
      config: { systemInstruction: instrucao, tools: [{ functionDeclarations: declaracoes as any }], temperature: 0.2 },
    });
    const turno: any = response.candidates?.[0]?.content;
    const partes: any[] = Array.isArray(turno?.parts) ? turno.parts : [];
    return {
      texto: partes.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join(""),
      chamadas: partes.filter((p) => p?.functionCall?.name).map((p) => ({ nome: String(p.functionCall.name), args: (p.functionCall.args || {}) as Record<string, any> })),
      turnoModelo: turno,
    };
  };

  app.post("/api/ai/agente", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ error: "Entre novamente para continuar." });
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "Digite seu pedido." });
    if (message.length > 4000) return res.status(413).json({ error: "O pedido deve ter até 4.000 caracteres." });
    if (!getAI()) return res.status(503).json({ error: "Agente indisponível: configure GEMINI_API_KEY no servidor." });
    if (!limiteUsoAgenteIA(ctx.sessaoHash)) return res.status(429).json({ error: "Muitos pedidos em pouco tempo. Aguarde alguns minutos." });
    const historico = Array.isArray(req.body?.historico)
      ? req.body.historico.filter((t: any) => t && (t.papel === "usuario" || t.papel === "ia") && typeof t.texto === "string").slice(-10)
      : [];
    try {
      return res.json({ sucesso: true, ...(await conversarAgenteIA(ctx, modeloGeminiAgente(), message, historico)) });
    } catch (error) {
      console.error("Falha na Agente IA do Contábil:", error instanceof Error ? error.message : error);
      return res.status(502).json({ error: "Não foi possível falar com o serviço de IA agora. Tente novamente." });
    }
  });
  app.post("/api/ai/agente/confirmar", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false, mensagem: "Entre novamente para continuar." });
    const resultado = await confirmarAcaoAgenteIA(ctx, String(req.body?.id || ""));
    return res.status(resultado.sucesso ? 200 : 422).json(resultado);
  });
  app.post("/api/ai/agente/recusar", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false });
    return res.json(await recusarAcaoAgenteIA(ctx, String(req.body?.id || "")));
  });
  app.get("/api/ai/agente/registro", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { return res.json({ sucesso: true, registros: await listarRegistroAgenteIAContabil(req, req.query.limite) }); }
    catch (error) { console.error("Falha ao ler o registro da Agente IA:", error instanceof Error ? error.message : error); return res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar o registro." }); }
  });
  app.get("/api/conferidor/ecd", exigirSessaoContabil, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const cnpj = String(req.query.cnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    const sessao = sessaoDaRequisicaoContabil(req);
    if (cnpj.length !== 14 || !sessao || !sessao.cnpjs.includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Este CNPJ não está vinculado ao seu acesso." });
    return res.json({ sucesso: true, ecd: achadosEcdDoConferidor([cnpj])[0] || null });
  });
  app.get("/api/robos/status", exigirSessaoContabil, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ sucesso: true, ...statusRobos() });
  });
  // Mensagens entre Agentes IA dos sistemas Murade (token de integração).
  app.post("/api/integracao/agente/mensagem", async (req, res) => {
    if (negarIntegracao(req, res)) return;
    try { const r = await centralDePedidos.receber(req.body); return res.status(r.status).json(r.corpo); }
    catch { return res.status(503).json({ ok: false, erro: "Não foi possível registrar agora." }); }
  });

  registrarRobo({ id: "reconciliador", nome: "Robô Reconciliador", posto: "integrador", missao: "Trazer do Fiscal e do DP os dados novos e preparar pré-lançamentos para conferência.", intervaloMs: 60_000 });
  registrarRobo({ id: "contabilizador", nome: "Robô Contabilizador", posto: "calculador", missao: "Transformar pré-lançamentos em lançamentos definitivos.", motivoSemRotina: "Sem rotina automática por regra: lançamento definitivo só nasce depois da aprovação de uma pessoa." });
  registrarRobo({ id: "mensageiro", nome: "Robô Mensageiro", posto: "integrador", missao: "Reenviar pedidos entre as Agentes dos sistemas Murade que não chegaram ao destino.", intervaloMs: 60_000 });
  registrarRobo({ id: "conferidor", nome: "Robô Conferidor", posto: "conferidor", missao: "Conferir todas as empresas: o que falta para fechar o mês (aprovações, rascunhos do Fiscal e do DP, depreciação, partidas) e se a ECD do ano anterior já está pronta para o contador (Balanço, DRE, assinaturas, plano referencial), deixando o resultado para a tela e para a Agente.", intervaloMs: 30 * 60_000 });
  const rodarConferidor = () => executarRobo("conferidor", () => rodarConferidorContabil((sql, params) => consultaBancoContabil(sql, params))).catch((e) => console.error("Falha no Robô Conferidor:", e?.message || e));
  setTimeout(() => void rodarConferidor(), 45_000).unref();
  setInterval(() => void rodarConferidor(), 30 * 60_000).unref();
  registrarRobo({ id: "empresas_fiscal", nome: "Robô de Empresas do Fiscal", posto: "integrador", missao: "Trazer do Murade Fiscal as empresas que ainda não estão no Contábil, para a equipe não cadastrar duas vezes. Não altera o que já existe e não leva certificado nem senha.", intervaloMs: 60 * 60_000 });
  const sincronizarEmpresasDoFiscal = async () => {
    const f = await buscarEmpresasDoFiscal();
    if (!f.ok) return { ok: false, motivo: f.motivo || "Fiscal indisponível.", criadas: [] as string[] };
    const r = await importarCnpjsCompartilhados(cnpjsValidosDoFiscal(f.empresas, cnpjContabilValido));
    const motivo = `${r.criadas.length} empresa(s) nova(s) vinda(s) do Fiscal; ${r.jaExistiam} já existiam${r.semEscritorio.length ? `; ${r.semEscritorio.length} aguardam o escritório ter no Contábil um administrador com o mesmo login do Fiscal` : ""}${r.semDono ? "; sem administrador dono do sistema no Contábil" : ""}.`;
    return { ok: true, motivo, criadas: r.criadas };
  };
  const rodarEmpresasFiscal = () => bancoContabilConfigurado() ? executarRobo("empresas_fiscal", async () => { const r = await sincronizarEmpresasDoFiscal(); registrarResultadoRobo("empresas_fiscal", r.motivo); }).catch((e) => console.error("Falha no Robô de Empresas do Fiscal:", e?.message || e)) : undefined;
  setTimeout(() => void rodarEmpresasFiscal(), 120_000).unref();
  setInterval(() => void rodarEmpresasFiscal(), 60 * 60_000).unref();
  app.post("/api/empresas/importar-do-fiscal", exigirSessaoContabil, async (req, res) => {
    if (!sessaoDaRequisicaoContabil(req)?.donoSistema) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema pode trazer as empresas do Fiscal." });
    try { const r = await sincronizarEmpresasDoFiscal(); return res.status(r.ok ? 200 : 502).json({ sucesso: r.ok, ...r }); }
    catch (e: any) { return res.status(500).json({ sucesso: false, motivo: e?.message || "Falha ao importar." }); }
  });
  registrarRobo({ id: "acessos", nome: "Robô Conferidor de Acessos", posto: "conferidor", missao: "Conferir se contas e escritórios excluídos ou bloqueados não deixaram acesso nem sessão aberta, mantendo os e-mails livres para novo cadastro.", intervaloMs: 60 * 60_000 });
  const rodarConferidorDeAcessos = () => bancoContabilConfigurado() ? executarRobo("acessos", async () => {
    await prepararAuthContabil();
    const relatorio = await rodarConferidorAcessos((sql, params) => consultaBancoContabil(sql, params), { usuarios: "contabil_auth_users", acesso: "contabil_auth_company_access", sessoes: "contabil_auth_sessions", colunaEscritorio: "global_admin" });
    registrarResultadoRobo("acessos", resumoRelatorioAcessos(relatorio));
  }).catch((e) => console.error("Falha no Robô Conferidor de Acessos:", e?.message || e)) : undefined;
  setTimeout(() => void rodarConferidorDeAcessos(), 90_000).unref();
  setInterval(() => void rodarConferidorDeAcessos(), 60 * 60_000).unref();
  const timerMensageiro = setInterval(() => { executarRobo("mensageiro", () => centralDePedidos.reenviarPendentes()).catch((e) => console.error("Falha ao reenviar pedidos entre agentes:", e?.message || e)); }, 60_000);
  timerMensageiro.unref();

  app.post("/api/ai/chat", exigirSessaoContabil, async (req, res) => {
    const { message, context, module: requestedModule } = req.body;
    const moduleName = requestedModule === "fiscal" || requestedModule === "dp" ? requestedModule : "contabil";

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem não fornecida." });
    }
    if (message.length > 4000) return res.status(413).json({ error: "Mensagem excede o limite de 4.000 caracteres." });

    const ai = getAI();

    // Contexto base de especialista contábil brasileiro
    const systemInstruction = `Você é a Assistente Murade, trabalhando no módulo ${moduleName === "dp" ? "Departamento Pessoal" : moduleName === "fiscal" ? "Fiscal" : "Contábil"}, para profissionais brasileiros. Responda em português do Brasil, com tom calmo, direto e prático. Para legislação, prazos, alíquotas, obrigações, tabelas e procedimentos sujeitos a mudança, pesquise informações atuais pela ferramenta de busca. Baseie conclusões legais apenas em fontes oficiais brasileiras: Receita Federal, Portal SPED, eSocial, SEFAZ, Planalto e prefeituras/portais oficiais. Não use páginas comerciais como autoridade legal. Explique a causa provável e a solução em etapas. Não invente dados de empresas, trabalhadores, folha, saldos, transmissões, integrações, alíquotas ou prazos; peça UF, município, regime e competência quando necessário. Não afirme que uma ação foi executada ou que uma conexão existe sem confirmação. Se não localizar fonte oficial atual ou não puder confirmar, diga claramente que ainda vai verificar e identifique o órgão que deve ser consultado. Respostas são orientação informativa, não substituem conferência do contador responsável.`;

    if (!ai) return res.status(503).json({ error: "Assistente IA indisponível. Configure uma GEMINI_API_KEY válida." });
    try {
        const response = await ai.models.generateContent({
          model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
          config: { systemInstruction, tools: [{ googleSearch: {} }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Contexto contábil atual do sistema:\n${JSON.stringify(context || {}).slice(0, 4000)}\n\nPergunta do usuário: ${message}`,
                },
              ],
            },
          ],
        });

        if (!response.text) return res.status(502).json({ error: "O provedor de IA não retornou uma resposta." });
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources = chunks.flatMap((chunk: any) => {
          const web = chunk.web;
          if (!web?.uri || !/^https:\/\//i.test(web.uri)) return [];
          const host = new URL(web.uri).hostname.toLowerCase();
          if (!(host === "gov.br" || host.endsWith(".gov.br") || host === "gov" || host.endsWith(".gov") || host.endsWith(".leg.br") || host.endsWith(".jus.br"))) return [];
          return [{ title: String(web.title || "Fonte consultada"), url: String(web.uri) }];
        }).filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index).slice(0, 6);
        const requiresOfficialSource = /(folha|trabalh|sal[aá]rio|inss|irrf|fgts|e-?social|nota|rejei|sefaz|tribut|imposto|icms|iss|ipi|ibs|cbs|sped|ecd|ecf|efd|dctf|dirf|prazo|venc|al[ií]quota|legisla|feriado|f[eé]rias|rescis[aã]o|encargo)/i.test(message);
        const reply = requiresOfficialSource && sources.length === 0
          ? "Ainda não consegui confirmar uma fonte oficial atual para essa pergunta. Para evitar passar regra, valor ou prazo incorreto, confira o órgão oficial responsável. Informe a competência e, quando aplicável, UF, município, regime ou código do erro para eu refazer a busca."
          : response.text;
        return res.json({ reply, sources, searched: Boolean(response.candidates?.[0]?.groundingMetadata) });
    } catch (err: any) {
      console.error("Erro na chamada Gemini:", err);
      return res.status(502).json({ error: "Não foi possível obter resposta do provedor de IA." });
    }
  });

  // Vite middleware em desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    app.use("/api", (_req, res) => {
      return res.status(404).json({ sucesso: false, error: "Endpoint da API não encontrado." });
    });
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use("/api", (_req, res) => {
      return res.status(404).json({ sucesso: false, error: "Endpoint da API não encontrado." });
    });
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Erros não tratados nas rotas viram resposta JSON, sem vazar detalhes internos.
  app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    const status = Number(error?.status || error?.statusCode);
    if (status === 413) return res.status(413).json({ sucesso: false, motivo: "O envio é maior que o limite permitido." });
    if (status >= 400 && status < 500) return res.status(status).json({ sucesso: false, motivo: "Pedido inválido." });
    console.error("[Murad Contábil] Erro não tratado na API:", error?.message || error);
    return res.status(500).json({ sucesso: false, motivo: "Erro interno. Tente novamente em instantes." });
  });

  // Promessa rejeitada sem tratamento derrubaria o processo no Node 24.
  process.on("unhandledRejection", (motivo) => console.error("[Murad Contábil] Promessa rejeitada sem tratamento:", (motivo as any)?.message || motivo));
  // Exceção síncrona fora de qualquer tratador: estado incerto; o Render reinicia o serviço.
  process.on("uncaughtException", (error) => { console.error("[Murad Contábil] Exceção não capturada; reiniciando:", error?.message || error); process.exit(1); });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Murad Contábil] Servidor ativo em http://localhost:${PORT}`);
    let reconciliacaoEmCurso = false;
    const reconciliarRascunhos = async () => {
      if (reconciliacaoEmCurso) return;
      reconciliacaoEmCurso = true;
      reconciliacaoRascunhosStatus.emCurso = true;
      reconciliacaoRascunhosStatus.iniciouEm = new Date().toISOString();
      let empresasProcessadas = 0;
      try {
        const cnpjs = await listarCnpjsComMapeamentoContabil();
        let criados = 0;
        let atualizados = 0;
        let falhas = 0;
        for (const cnpj of cnpjs) {
          try {
            const resultado = await prepararRascunhosContabeisAutomaticos(cnpj);
            criados += resultado.criados;
            atualizados += resultado.atualizados;
            empresasProcessadas += 1;
          } catch (error) {
            falhas += 1;
            console.error(`[Murad Contábil] Falha ao reconciliar rascunhos do CNPJ autorizado ${cnpj}:`, error);
          }
        }
        reconciliacaoRascunhosStatus.empresas = empresasProcessadas;
        reconciliacaoRascunhosStatus.criados = criados;
        reconciliacaoRascunhosStatus.atualizados = atualizados;
        reconciliacaoRascunhosStatus.falhas = falhas;
        if (cnpjs.length || falhas) console.log(`[Murad Contábil] Reconciliação automática: ${cnpjs.length} empresa(s), ${criados} rascunho(s) criado(s), ${atualizados} atualizado(s), ${falhas} falha(s); nenhum lançamento definitivo foi confirmado.`);
      } catch (error) {
        reconciliacaoRascunhosStatus.falhas += 1;
        console.error("[Murad Contábil] Reconciliação automática indisponível; nova tentativa ocorrerá no próximo ciclo:", error);
      } finally {
        reconciliacaoRascunhosStatus.concluiuEm = new Date().toISOString();
        reconciliacaoRascunhosStatus.emCurso = false;
        reconciliacaoEmCurso = false;
      }
    };
    const primeiraRecon = setTimeout(() => void executarRobo("reconciliador", reconciliarRascunhos), 1_000);
    primeiraRecon.unref();
    const reconciliacaoPeriodica = setInterval(() => void executarRobo("reconciliador", reconciliarRascunhos), 60_000);
    reconciliacaoPeriodica.unref();
    console.log("[Murad Contábil] Reconciliação de rascunhos habilitada a cada 60 segundos; lançamentos definitivos continuam exigindo aprovação.");
  });
}

startServer();
