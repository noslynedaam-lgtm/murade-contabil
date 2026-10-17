import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import { ErroValidacaoDocumentoFiscal, fiscalStoreConfigurado, gravarDocumentosFiscais, lerDocumentosFiscais, verificarEstadoStoreFiscal } from "./src/server/documentosFiscaisStore";
import { dpStoreConfigurado, ErroValidacaoResumoDP, gravarResumoDP, lerResumosDP, verificarEstadoStoreDP } from "./src/server/dadosDpStore";
import { adicionarEmpresaAcessoContabil, bootstrapAuthContabil, contabilizarRascunhosAutomaticosContabil, cnpjContabilValido, criarConviteUsuarioContabil, decidirLancamentoManualContabil, exigirSessaoContabil, fecharCompetenciaContabil, lerWorkspaceContabil, lerWorkspaceInternoContabil, listarCnpjsComMapeamentoContabil, listarFechamentosContabil, listarHistoricoAprovacoesContabil, listarUsuariosEmpresaContabil, listarWorkspacesContabil, loginAuthContabil, logoutAuthContabil, normalizarCnpjAcesso, removerEmpresaAcessoContabil, resgatarConviteUsuarioContabil, revogarUsuarioEmpresaContabil, salvarWorkspaceContabil, sessaoAtualContabil, statusAuthContabil, verificarCnpjAutorizadoContabil, vincularUsuarioExistenteContabil } from "./src/server/authContabil";
import { gerarCandidatosRascunhosAutomaticos, mesclarRascunhosNoWorkspace, prepararRascunhosContabeisAutomaticos } from "./src/server/prepararRascunhosContabeis";

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

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "20mb" }));

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
  app.post("/api/auth/redeem", exigirOrigemNavegador, resgatarConviteUsuarioContabil);
  app.post("/api/auth/companies", exigirOrigemNavegador, exigirSessaoContabil, adicionarEmpresaAcessoContabil);
  app.delete("/api/auth/companies/:cnpj", exigirOrigemNavegador, exigirSessaoContabil, removerEmpresaAcessoContabil);
  app.post("/api/auth/invites", exigirOrigemNavegador, exigirSessaoContabil, criarConviteUsuarioContabil);
  app.post("/api/auth/access", exigirOrigemNavegador, exigirSessaoContabil, vincularUsuarioExistenteContabil);
  app.get("/api/auth/users", exigirSessaoContabil, listarUsuariosEmpresaContabil);
  app.delete("/api/auth/users/:login", exigirOrigemNavegador, exigirSessaoContabil, revogarUsuarioEmpresaContabil);
  app.get("/api/workspaces", exigirSessaoContabil, listarWorkspacesContabil);
  app.get("/api/workspaces/:cnpj", exigirSessaoContabil, lerWorkspaceContabil);
  app.get("/api/workspaces/:cnpj/historico-aprovacoes", exigirSessaoContabil, listarHistoricoAprovacoesContabil);
  app.get("/api/workspaces/:cnpj/fechamentos", exigirSessaoContabil, listarFechamentosContabil);
  app.post("/api/workspaces/:cnpj/fechamentos", exigirOrigemNavegador, exigirSessaoContabil, fecharCompetenciaContabil);
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
      const [fiscal, dp] = await Promise.all([
        verificarEstadoStoreFiscal(escopoCnpjs),
        verificarEstadoStoreDP(escopoCnpjs),
      ]);
      return res.json({
        sucesso: true,
        escopo: cnpjSolicitado ? "Empresa selecionada e autorizada nesta sessão" : "Empresas autorizadas nesta sessão",
        cnpjEmpresa: cnpjSolicitado || null,
        armazenamento: fiscal.disponivel && dp.disponivel ? "postgresql" : "indisponível",
        tokenServicoConfigurado: Boolean(process.env.MURADE_INTEGRATION_TOKEN?.trim()),
        fiscal,
        departamentoPessoal: dp,
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
      return res.json({ sucesso: true, cnpj, periodo: { desde: desde || null, ate: ate || null }, documentos, folhas, lancamentosGerados: 0, revisaoNecessaria: true });
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
      const status = error instanceof ErroValidacaoResumoDP ? 422 : 503;
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

    const todosResultados = resultados;

    res.json({
      timestamp: new Date().toISOString(),
      totalTestados: todosResultados.length,
      conectados: todosResultados.filter((r) => r.status === "conectado").length,
      resultados: todosResultados,
    });
  });

  // API do Agente IA Murad (Contabilidade, Fisco e Reforma Tributária 2026)
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
    const primeiraRecon = setTimeout(() => void reconciliarRascunhos(), 1_000);
    primeiraRecon.unref();
    const reconciliacaoPeriodica = setInterval(() => void reconciliarRascunhos(), 60_000);
    reconciliacaoPeriodica.unref();
    console.log("[Murad Contábil] Reconciliação de rascunhos habilitada a cada 60 segundos; lançamentos definitivos continuam exigindo aprovação.");
  });
}

startServer();
