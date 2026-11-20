import { registrarRotaVozGemini } from './src/server/vozGeminiTTS';
import express from "express";
import path from "path";
import fsSync from "node:fs";
import { conferirMapaPiloto, resumoRelatorioPiloto } from "./src/server/conferidorPiloto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import { ErroValidacaoDocumentoFiscal, fiscalStoreConfigurado, gravarDocumentosFiscais, lerDocumentosFiscais, lerVersoesDocumentoFiscal, verificarEstadoStoreFiscal } from "./src/server/documentosFiscaisStore";
import { ErroValidacaoApuracaoFiscal, apuracoesStoreConfigurado, gravarApuracoesFiscais, lerApuracoesFiscais, verificarEstadoStoreApuracoes } from "./src/server/apuracoesFiscaisStore";
import { dpStoreConfigurado, ErroConflitoResumoDP, ErroValidacaoResumoDP, gravarResumoDP, lerResumosDP, verificarEstadoStoreDP } from "./src/server/dadosDpStore";
import { gravarResumoProLaboreDP } from "./src/server/dadosProLaboreStore";
import { gravarEventoDP, lerEventosDP } from "./src/server/dadosDpEventosStore";
import { registrarGestaoEquipe } from "./src/server/gestaoEquipe";
import { prepararAuthContabil, configGestaoEquipeContabil, adicionarEmpresaAcessoContabil, adicionarEquipeContabil, bloquearEscritorioContabil, definirLimiteEscritorioContabil, convidarEquipeContabil, convidarEscritorioContabil, reenviarAcessoEscritorioContabil, listarEquipeContabil, listarEscritoriosContabil, removerEquipeContabil, bootstrapAuthContabil, contabilizarRascunhosAutomaticosContabil, cnpjContabilValido, criarConviteUsuarioContabil, decidirLancamentoManualContabil, exigirSessaoContabil, sessaoDaRequisicaoContabil, fecharCompetenciaContabil, lerWorkspaceContabil, lerWorkspaceInternoContabil, listarCnpjsComMapeamentoContabil, listarCnpjsComOrigensSemMapeamentoContabil, aplicarMapeamentosPadraoContabil, listarFechamentosContabil, listarHistoricoAprovacoesContabil, listarUsuariosEmpresaContabil, listarWorkspacesContabil, loginAuthContabil, logoutAuthContabil, manterConectadoContabil, normalizarCnpjAcesso, removerEmpresaAcessoContabil, resgatarConviteUsuarioContabil, revogarUsuarioEmpresaContabil, salvarWorkspaceContabil, sessaoAtualContabil, statusAuthContabil, verificarCnpjAutorizadoContabil, vincularUsuarioExistenteContabil, importarCnpjsCompartilhados, auth2faEstadoContabil, auth2faIniciarContabil, auth2faAtivarContabil, auth2faDesativarContabil, auth2faRedefinirContabil, auth2faResumoContabil, resumoSegurancaContabil, alterarWorkspaceNoServidorContabil } from "./src/server/authContabil";
import { ArmazemDeEtapas, chaveDeEtapas, prepararPedido, limitarPedido, avisoDeTextoCortado } from "./src/server/agenteEtapas";
import { ArmazemAcoesPendentes, avancarAcao as avancarAcaoAgenteIA, confirmarAcao as confirmarAcaoAgenteIA, conversar as conversarAgenteIA, recusarAcao as recusarAcaoAgenteIA, type ChamarApi, type ContextoAgente, type ModeloIA } from "./src/server/agenteMotor";
import { kitContabil } from "./src/server/agenteContabil";
import { ArmazemPedidosMemoria, ArmazemPedidosPg, CentralDePedidos, tokenValido } from "./src/server/agentesEntreSistemas";
import { criarAtividadeEscritorio } from './src/server/atividadeEscritorio';
import { criarServicoTarefas, registrarRotasTarefasEquipe } from "./src/server/tarefasEquipe";
import { criarServicoMeuJeito, registrarRotasMeuJeito, type SessaoJeito } from "./src/server/meuJeito";
import { conferirApresentacao, resumoRelatorioApresentacao } from "./src/server/conferidorApresentacao";
import type { SessaoContabil } from './src/server/authContabil';
import { lerPerfilSaudacaoContabil, marcarSaudadoHojeContabil } from "./src/server/authContabil";
import { extrairNomeDaResposta, fraseDeSaudacao } from "./src/server/agenteSaudacao";
import { opcoesConexaoBancoContabil, bancoTransacionalContabil } from "./src/server/authContabil";
import { removerEmpresaCompleta, sobrasDeEmpresasExcluidas } from "./src/server/exclusaoEmpresaCascata";
import { listarRegistroAgenteIAContabil, bancoContabilConfigurado, consultaBancoContabil, hashSessaoContabil, registrarAcaoAgenteIAContabil, listarDuvidasSemRespostaDonoSistemaContabil, resolverDuvidaSemRespostaDonoSistemaContabil } from "./src/server/authContabil";
import { definirAlertaRobo, dispararRoboAgora, executarRobo, registrarResultadoRobo, registrarRobo, registrarRotinaManual, statusRobos } from "./src/server/robosStatus";
import { criarServicoBackupBanco } from "./src/server/backupBanco/servico";
import { buscarEmpresasDoFiscal, cnpjsValidosDoFiscal } from "./src/server/empresasDoFiscal";
import { resumoRelatorioAcessos, rodarConferidorAcessos } from "./src/server/conferidorAcessos";
import { achadosEcdDoConferidor, rodarConferidorContabil } from "./src/server/conferidorContabil";
import { conferirBackupsEscritorios } from "./src/server/conferidorBackupsContabil";
import { gerarBackupEscritorio, listarBackupsEscritorio, baixarBackupEscritorio, periodoDe } from "./src/services/backupEscritorioContabilService";
import { gerarCandidatosRascunhosAutomaticos, mesclarRascunhosNoWorkspace, prepararRascunhosContabeisAutomaticos } from "./src/server/prepararRascunhosContabeis";
import { respostaRapida } from "./src/server/respostasRapidas";
import { omitirXmlOriginal, resumirCoberturaXmlFiscal } from "./src/server/coberturaXmlFiscal";
import { montarServicoFeito } from "./src/server/servicoFeitoRotas";
import { criarStoreEscritorio, preencherCnpjsDosEscritorios, registrarRotasEscritorioConsultor } from "./src/server/escritorioConsultor";
import { conferirCadastrosDosEscritorios, registrarRotaCadastroEscritorioContabil } from "./src/server/cadastroEscritorioContabil";
import { criarStoreServicoCompleto, registrarRotasServicoCompleto, resumoRodadaServicos, rodarConferidorServicos, tenantServico, type ResultadoRodadaServicos } from "./src/server/servicoCompletoStore";
import { chaveServico, descreverRegistro, tenantDaSessao } from "./src/server/servicoFeito";
import { registrarRotasEscrituracao, roboConciliacao, roboEncerramento, roboLancamentosPadrao, roboLivroCaixa } from "./src/server/escrituracaoRotas";
import { criarRevisorContabil, registrarRotasRevisor, INTERVALO_ROBO_REVISOR_MS } from "./src/server/revisorContabil";
import { conferirFolhasDP } from "./src/server/conferidorFolhaDP";

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

// Chamada ao Gemini com tempo limite e modelos reserva (rápido primeiro), para não deixar o usuário esperando.
const MODELOS_RAPIDOS = () => [process.env.GEMINI_MODEL_RAPIDO || "gemini-3.1-flash-lite", process.env.GEMINI_MODEL || "gemini-3.8-flash"];
async function gerarComReserva(ai: GoogleGenAI, base: { contents: any; systemInstruction: string; tools?: any[]; temperature?: number }, limiteMs = 12_000): Promise<any> {
  let ultimoErro: unknown;
  const tentativas: { model: string; tools?: any[] }[] = [];
  for (const model of MODELOS_RAPIDOS()) {
    if (base.tools?.length) tentativas.push({ model, tools: base.tools });
    tentativas.push({ model });
  }
  for (const t of tentativas) {
    try {
      const chamada = ai.models.generateContent({
        model: t.model,
        contents: base.contents,
        config: { systemInstruction: base.systemInstruction, temperature: base.temperature ?? 0.2, ...(t.tools ? { tools: t.tools } : {}), thinkingConfig: { thinkingLevel: "LOW" as any } },
      });
      return await Promise.race([chamada, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), limiteMs).unref())]);
    } catch (e) {
      ultimoErro = e;
      console.error(`Gemini (${t.model}${t.tools ? " + busca" : ""}):`, e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  throw ultimoErro;
}

/** Ações de baixo risco cujo cartão pode ser mais curto no "Meu jeito". O cartão continua aparecendo e a pessoa continua confirmando. */
const CARTAO_PODE_SER_RESUMIDO = new Set(["delegar_tarefa", "reprocessar_recepcao"]);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  let ultimoMapeamentoAutomatico: { aplicados: number; semMapeamentoAinda?: number } = { aplicados: 0 };
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
  app.use(["/api/workspaces", "/api/integracao/fiscal/documentos", "/api/integracao/fiscal/apuracoes"], express.json({ limit: "20mb" }));
  // Agente IA: corpo maior para nunca recusar texto longo (até 500.000 caracteres + histórico; o servidor corta e avisa).
  app.use(["/api/ai/agente", "/api/ai/chat"], express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "2mb" }));
  const sessaoAtividade = (req: express.Request) => (req as express.Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const atividadeEquipe = criarAtividadeEscritorio({ consultar: consultaBancoContabil, tabela: "contabil_atividade_equipe", sessao: sessaoAtividade, podeVer: (req) => sessaoAtividade(req)?.administrador === true });
  app.use("/api", atividadeEquipe.registrar);
  // Anti-retrabalho (quem já fez / quem está fazendo). Fail-open: se o registro falhar, o serviço segue normalmente.
  const storeServicoCompleto = criarStoreServicoCompleto((sql, params) => consultaBancoContabil(sql, params));
  const storeEscritorio = criarStoreEscritorio((sql, params) => consultaBancoContabil(sql, params));
  let ultimaRodadaServicos: ResultadoRodadaServicos | null = null;
  const servicoFeito = montarServicoFeito({
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    sessao: (req) => (req as express.Request & { sessaoContabil?: SessaoContabil }).sessaoContabil,
    normalizarCnpj: normalizarCnpjAcesso,
    cnpjValido: cnpjContabilValido,
  });

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
  app.post("/api/auth/manter-conectado", exigirOrigemNavegador, manterConectadoContabil);
  app.get("/api/auth/2fa", exigirSessaoContabil, auth2faEstadoContabil);
  app.post("/api/auth/2fa/iniciar", exigirOrigemNavegador, exigirSessaoContabil, auth2faIniciarContabil);
  app.post("/api/auth/2fa/ativar", exigirOrigemNavegador, exigirSessaoContabil, auth2faAtivarContabil);
  app.post("/api/auth/2fa/desativar", exigirOrigemNavegador, exigirSessaoContabil, auth2faDesativarContabil);
  app.post("/api/auth/2fa/redefinir", exigirOrigemNavegador, exigirSessaoContabil, auth2faRedefinirContabil);
  app.get("/api/auth/2fa/resumo", exigirSessaoContabil, auth2faResumoContabil);
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
  app.post("/api/auth/tenants/:login/reenviar", exigirOrigemNavegador, exigirSessaoContabil, reenviarAcessoEscritorioContabil);
  app.post("/api/auth/tenants/:login/bloqueio", exigirOrigemNavegador, exigirSessaoContabil, bloquearEscritorioContabil);
  app.post("/api/auth/tenants/:login/limite", exigirOrigemNavegador, exigirSessaoContabil, definirLimiteEscritorioContabil);
  app.get("/api/auth/duvidas-supervisor", exigirSessaoContabil, listarDuvidasSemRespostaDonoSistemaContabil);
  app.post("/api/auth/duvidas-supervisor/:id/resolver", exigirOrigemNavegador, exigirSessaoContabil, resolverDuvidaSemRespostaDonoSistemaContabil);
  app.get("/api/workspaces", exigirSessaoContabil, listarWorkspacesContabil);
  app.get("/api/workspaces/:cnpj", exigirSessaoContabil, lerWorkspaceContabil);
  app.get("/api/workspaces/:cnpj/historico-aprovacoes", exigirSessaoContabil, listarHistoricoAprovacoesContabil);
  app.get("/api/workspaces/:cnpj/fechamentos", exigirSessaoContabil, listarFechamentosContabil);
  app.post("/api/workspaces/:cnpj/fechamentos", exigirOrigemNavegador, exigirSessaoContabil, servicoFeito.guardas.fechamento, fecharCompetenciaContabil);
  servicoFeito.registrarRotas(app, exigirSessaoContabil);
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
  app.post("/api/workspaces/:cnpj/contabilizar", exigirOrigemNavegador, exigirSessaoContabil, servicoFeito.guardas.contabilizacao, async (req, res) => {
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
  app.post("/api/workspaces/:cnpj/lancamentos-manuais/:id/decisao", exigirOrigemNavegador, exigirSessaoContabil, servicoFeito.guardas.decisaoLancamento, (req, res) => {
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
    let apuracoes: { disponivel: boolean; apuracoesRecebidas: number; ultimoRecebimento: string | null };
    try {
      apuracoes = await verificarEstadoStoreApuracoes();
    } catch {
      apuracoes = { disponivel: false, apuracoesRecebidas: 0, ultimoRecebimento: null };
    }
    return res.json({
      conectado: true,
      sistema: "Murade Contábil",
      integracao: "Murade Fiscal",
      dadosCompartilhados: armazenamento.documentosRecebidos > 0,
      recebimentoFiscalConfigurado: armazenamento.disponivel,
      documentosFiscaisRecebidos: armazenamento.documentosRecebidos,
      ultimoRecebimentoFiscal: armazenamento.ultimoRecebimento,
      apuracoesFiscaisRecebidas: apuracoes.apuracoesRecebidas,
      ultimoRecebimentoApuracoes: apuracoes.ultimoRecebimento,
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

  // Receives tax assessments (DIFAL; IRPJ/CSLL/PIS/COFINS of the Lucro Presumido regime) already
  // confirmed by the accountant in the authenticated Fiscal service. Separate contract from
  // /documentos above: there is no nota to re-read here, only the confirmed value itself. Storing
  // it never creates a journal entry by itself — see prepararRascunhosContabeis.ts.
  app.post("/api/integracao/fiscal/apuracoes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!apuracoesStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil para receber apurações com persistência." });
    }
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (req.body?.versaoContrato !== 1) return res.status(400).json({ sucesso: false, motivo: "Versão de contrato de integração não suportada." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const resultado = await gravarApuracoesFiscais(cnpj, req.body?.apuracoes);
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try {
        const preparado = await prepararRascunhosContabeisAutomaticos(cnpj);
        rascunhos = { ...preparado, disponivel: true };
      } catch (error) {
        rascunhos = { criados: 0, atualizados: 0, disponivel: false };
        console.error("Apurações fiscais salvas; a preparação automática de rascunhos ficou pendente:", error);
      }
      return res.json({
        sucesso: true,
        persistencia: "postgresql",
        cnpj,
        ...resultado,
        rascunhosContabeis: rascunhos,
        pendente: "Os rascunhos aguardam mapeamento de contas e aprovação do contador; nenhum lançamento definitivo foi criado.",
        recebidoEm: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error instanceof ErroValidacaoApuracaoFiscal ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível persistir o lote de apurações no PostgreSQL." });
    }
  });

  // Authenticated readback for server-to-server reconciliation only.
  app.get("/api/integracao/fiscal/apuracoes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!apuracoesStoreConfigurado()) {
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
      const apuracoes = await lerApuracoesFiscais(cnpj, desde, ate, limite);
      return res.json({ sucesso: true, cnpj, retornados: apuracoes.length, apuracoes });
    } catch (error: any) {
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível consultar apurações armazenadas." });
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

  // Pró-labore dos sócios (só totais do mês). Vira pré-lançamento pelas mesmas contas da folha.
  app.post("/api/integracao/dp/prolabore", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const resultado = await gravarResumoProLaboreDP(cnpj, req.body);
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try { rascunhos = { ...(await prepararRascunhosContabeisAutomaticos(cnpj)), disponivel: true }; }
      catch (error) { rascunhos = { criados: 0, atualizados: 0, disponivel: false }; console.error("Pró-labore salvo; a preparação automática de rascunhos ficou pendente:", error); }
      return res.json({ sucesso: true, persistencia: "postgresql", cnpj, novo: resultado.novo, rascunhosContabeis: rascunhos });
    } catch (error: any) {
      const status = error instanceof ErroConflitoResumoDP ? 409 : error instanceof ErroValidacaoResumoDP ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível persistir o pró-labore." });
    }
  });

  // 13º e rescisão confirmados como pagos no DP. Fila própria, separada da folha mensal (nunca
  // pode disputar com ela nem ser descartada ao gerar rascunhos): cada evento gera seu próprio
  // pré-lançamento. Nunca recebe nome, CPF ou qualquer identificador do funcionário.
  app.post("/api/integracao/dp/eventos", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const resultado = await gravarEventoDP(cnpj, req.body);
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try { rascunhos = { ...(await prepararRascunhosContabeisAutomaticos(cnpj)), disponivel: true }; }
      catch (error) { rascunhos = { criados: 0, atualizados: 0, disponivel: false }; console.error("Evento do DP salvo; a preparação automática de rascunhos ficou pendente:", error); }
      return res.json({
        sucesso: true, persistencia: "postgresql", cnpj, novo: resultado.novo,
        lancamentosContabeisGerados: 0, rascunhosContabeis: rascunhos,
        pendente: "Os rascunhos aguardam conferência e aprovação do contador; nenhum lançamento definitivo foi criado.",
      });
    } catch (error: any) {
      const status = error instanceof ErroConflitoResumoDP ? 409 : error instanceof ErroValidacaoResumoDP ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível persistir o evento do DP." });
    }
  });
  app.get("/api/integracao/dp/eventos", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    const tipo = req.query.tipo === "decimo" || req.query.tipo === "rescisao" || req.query.tipo === "ferias" ? req.query.tipo : undefined;
    const limite = req.query.limite == null ? 50 : Number(req.query.limite);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (!Number.isInteger(limite) || limite < 1 || limite > 200) return res.status(400).json({ sucesso: false, motivo: "Limite deve estar entre 1 e 200." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "CNPJ não autorizado no cadastro seguro do Contábil." });
      const eventos = await lerEventosDP(cnpj, tipo, limite);
      return res.json({ sucesso: true, cnpj, retornados: eventos.length, eventos });
    } catch (error: any) {
      return res.status(503).json({ sucesso: false, motivo: error?.message || "Não foi possível consultar eventos do DP." });
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

  // Hub de exclusão: o Fiscal (ou outro sistema Murade) manda apagar UMA empresa daqui. Idempotente e sem bloquear o CNPJ para novo cadastro.
  // Apaga acessos de todos os usuários, cadastro compartilhado, workspace e atividade da equipe; preserva fechamentos, auditorias e documentos de origem.
  app.delete("/api/integracao/empresa/:cnpj", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    const cnpj = normalizarCnpjAcesso(req.params.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    const por = typeof req.body?.por === "string" ? req.body.por.slice(0, 120) : undefined;
    const origem = typeof req.body?.origem === "string" ? req.body.origem.slice(0, 40) : "integracao";
    try {
      await prepararAuthContabil();
      const r = await removerEmpresaCompleta(bancoTransacionalContabil(), cnpj, { por, origem });
      return res.json({ sucesso: true, cnpj: r.cnpj, apagados: r.apagados, preservados: r.preservados, jaNaoExistia: r.jaNaoExistia });
    } catch (error) {
      console.error("Falha ao excluir empresa por integração:", error);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível excluir a empresa agora; nada foi apagado pela metade." });
    }
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

  // Meu jeito: preferências de uso de cada pessoa (camada por cima do jeito padrão; nunca desliga proteção). Isolado por escritório e por pessoa.
  const servicoMeuJeito = criarServicoMeuJeito((sql, params) => consultaBancoContabil(sql, params));
  const sessaoMeuJeito = (req: express.Request): SessaoJeito | undefined => { const x = sessaoDaRequisicaoContabil(req); return x ? { userId: x.userId, login: x.login, tenantId: x.tenantId, escritorioDe: x.escritorioDe, administrador: x.administrador === true, donoSistema: x.donoSistema === true } : undefined; };

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
    const response: any = await gerarComReserva(ai, { contents: conteudos as any, systemInstruction: instrucao, tools: [{ functionDeclarations: declaracoes as any }], temperature: 0.2 }, 15_000);
    const turno: any = response.candidates?.[0]?.content;
    const partes: any[] = Array.isArray(turno?.parts) ? turno.parts : [];
    return {
      texto: partes.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join(""),
      chamadas: partes.filter((p) => p?.functionCall?.name).map((p) => ({ nome: String(p.functionCall.name), args: (p.functionCall.args || {}) as Record<string, any> })),
      turnoModelo: turno,
    };
  };

  // Saudação do dia: "Bom dia, Herbert!" uma vez por dia por usuário. Se ainda não sabe o nome, pede. Sem IA, sem custo.
  app.post("/api/ai/agente/saudacao", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false });
    try {
      const perfil = await lerPerfilSaudacaoContabil(sessao.userId);
      // Sem nome conhecido: quem pergunta ("Como posso te chamar?") é o Meu jeito, uma vez só, na primeira entrada. Aqui não cumprimenta nem pergunta de novo.
      if (!perfil.nome) return res.json({ sucesso: true, precisaNome: false, saudar: false });
      if (perfil.saudadoHoje) return res.json({ sucesso: true, precisaNome: false, saudar: false, nome: perfil.nome });
      await marcarSaudadoHojeContabil(sessao.userId);
      return res.json({ sucesso: true, precisaNome: false, saudar: true, nome: perfil.nome, frase: fraseDeSaudacao(perfil.nome) });
    } catch (error) { console.error("Falha na saudação da Agente IA do Contábil:", error instanceof Error ? error.message : error); return res.json({ sucesso: false }); }
  });
  app.post("/api/ai/agente/nome", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false });
    const nome = extrairNomeDaResposta(typeof req.body?.texto === "string" ? req.body.texto : "");
    if (!nome) return res.json({ sucesso: false, mensagem: "Não entendi o nome. Pode repetir só o nome?" });
    try {
      await servicoMeuJeito.definirNome(sessaoMeuJeito(req)!, nome);
      await marcarSaudadoHojeContabil(sessao.userId);
      return res.json({ sucesso: true, nome, frase: `Prazer, ${nome}! Pode falar o que precisa.` });
    } catch (error) { console.error("Falha ao gravar o nome da Agente IA do Contábil:", error instanceof Error ? error.message : error); return res.status(503).json({ sucesso: false, mensagem: "Não consegui gravar o nome agora." }); }
  });

  // Pedidos longos por etapas: texto completo guardado na memória, por escritório/usuário/sessão, por algumas horas.
  const etapasAgenteIA = new ArmazemDeEtapas();
  app.post("/api/ai/agente", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ error: "Entre novamente para continuar." });
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "Digite seu pedido." });
    // Nunca recusa por tamanho: até 500.000 caracteres; acima disso lê o começo e avisa. Texto longo vai por etapas.
    if (!getAI()) return res.status(503).json({ error: "Agente indisponível: configure GEMINI_API_KEY no servidor." });
    if (!limiteUsoAgenteIA(ctx.sessaoHash)) return res.status(429).json({ error: "Muitos pedidos em pouco tempo. Aguarde alguns minutos." });
    const historico = Array.isArray(req.body?.historico)
      ? req.body.historico.filter((t: any) => t && (t.papel === "usuario" || t.papel === "ia") && typeof t.texto === "string").slice(-10)
      : [];
    try {
      try { const sessao = sessaoDaRequisicaoContabil(req); if (sessao) ctx.nomeUsuario = (await lerPerfilSaudacaoContabil(sessao.userId)).nome || undefined; } catch { /* sem o nome a conversa segue normal */ }
      // Meu jeito: a Agente trabalha do jeito da pessoa (conversa curta ou detalhada; cartão resumido SÓ nas ações de baixo risco). Se falhar, segue no jeito padrão.
      let confirmacaoResumida = false;
      try { const sj = sessaoMeuJeito(req); if (sj) { const j = await servicoMeuJeito.paraAgente(sj); if (j.instrucao) ctx.kit = { ...ctx.kit, instrucao: ctx.kit.instrucao + j.instrucao }; confirmacaoResumida = j.confirmacaoResumida; } } catch { /* jeito indisponível: jeito padrão */ }
      const pedido = prepararPedido(etapasAgenteIA, chaveDeEtapas("contabil", sessaoDaRequisicaoContabil(req)?.tenantId, ctx.login, ctx.sessaoHash), message);
      const conversa = await conversarAgenteIA(ctx, modeloGeminiAgente(), pedido.mensagem, historico);
      const resultado = { ...conversa, ...pedido.concluir(conversa.resposta) };
      if (confirmacaoResumida) resultado.acoes = resultado.acoes.map((a) => (CARTAO_PODE_SER_RESUMIDO.has(a.ferramenta) && !a.irreversivel ? { ...a, descricao: a.descricao.slice(0, 1) } : a));
      return res.json({ sucesso: true, ...resultado });
    } catch (error) {
      console.error("Falha na Agente IA do Contábil:", error instanceof Error ? error.message : error);
      return res.status(502).json({ error: "Não foi possível falar com o serviço de IA agora. Tente novamente." });
    }
  });
  // Exclusão por voz: primeira confirmação (Continuar). A segunda (/confirmar) é recusada sem esta.
  app.post("/api/ai/agente/continuar", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false, mensagem: "Entre novamente para continuar." });
    const resultado = await avancarAcaoAgenteIA(ctx, String(req.body?.id || ""));
    return res.status(resultado.sucesso ? 200 : 422).json(resultado);
  });
  app.post("/api/ai/agente/confirmar", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false, mensagem: "Entre novamente para continuar." });
    const resultado = await confirmarAcaoAgenteIA(ctx, String(req.body?.id || ""));
    return res.status(resultado.sucesso ? 200 : 422).json(resultado);
  });
  // Piloto Visível: o front avisa como o roteiro terminou. Só título e contagens vão para o log da Agente; nunca o que foi digitado.
  app.post("/api/ai/agente/piloto/registro", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false });
    const b = req.body || {};
    const estado = ["concluido", "cancelado", "erro", "aguardando_confirmacao", "pausado", "segundo_plano", "rodando"].includes(b.estado) ? b.estado : null;
    const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 999 ? (v as number) : 0);
    if (!estado || typeof b.titulo !== "string") return res.status(400).json({ sucesso: false });
    try {
      await ctx.registrar({ evento: "piloto", ferramenta: "piloto_visivel", cnpj: null, resumo: `Piloto ${estado}: ${b.titulo.replace(/\s+/g, " ").slice(0, 160)} (${n(b.passosFeitos)}/${n(b.total)} passos, ${n(b.interferencias)} interferência(s)${b.usouSegundoPlano === true ? ", segundo plano" : ""}${n(b.recusados) ? `, ${n(b.recusados)} campo(s) sigiloso(s) deixado(s) para o usuário` : ""})` });
    } catch { /* o log é só registro */ }
    return res.json({ sucesso: true });
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
  app.get("/api/robos/status", exigirSessaoContabil, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // O backup completo do banco é função de administração do sistema: só o dono vê esse robô (escritórios clientes não).
    const ehDono = sessaoDaRequisicaoContabil(req)?.donoSistema === true;
    const estado = statusRobos();
    return res.json({ sucesso: true, ...estado, robos: ehDono ? estado.robos : estado.robos.filter((r) => r.id !== "backup_banco"), ehDono });
  });
  // Botão manual ao lado da rotina automática: dispara agora a rodada de um robô (as mesmas rotinas do agendador, com a
  // mesma trava de sobreposição). Os robôs são do sistema todo, por isso só o dono do sistema dispara. O Contabilizador
  // fica de fora de propósito: lançamento definitivo só nasce com a aprovação de uma pessoa.
  app.post("/api/robos/:id/rodar-agora", exigirOrigemNavegador, exigirSessaoContabil, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!sessao.donoSistema) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema dispara os robôs na hora." });
    const id = String(req.params.id || "").slice(0, 60);
    const r = dispararRoboAgora(id);
    if ("codigo" in r) return res.status(r.codigo === "desconhecido" ? 404 : 409).json({ sucesso: false, motivo: r.motivo });
    console.log(`[Robôs] rodada manual de "${id}" pedida por ${sessao.login}`);
    return res.json({ sucesso: true, mensagem: "Robô disparado. O resultado aparece no painel em instantes." });
  });
  // Escrituração avançada: várias partidas, histórico e lançamento padrão, encerramento, Livro Caixa e conciliação bancária.
  registrarRotasEscrituracao(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params) });
  // CNPJ do escritório e liberação do adicional "Consultor Murade completo" (Consultor + serviço completo), por escritório.
  registrarRotasEscritorioConsultor(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    store: storeEscritorio,
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { tenantId: String(s.tenantId || s.escritorioDe || s.userId), podeEditar: s.administrador === true || s.donoSistema === true } : undefined; },
  });
  // Cadastro do escritório (o cadastro único é feito no DP): a Agente e a tela leem a situação daqui; o DP grava o CNPJ do escritório.
  registrarRotaCadastroEscritorioContabil(app, exigirSessaoContabil, {
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { tenantId: String(s.tenantId || s.escritorioDe || s.userId) } : undefined; },
    urlDP: () => (process.env.MURADE_DP_URL || "https://murade-dp.onrender.com").replace(/\/$/, ""),
  });
  // Serviço completo da Agente ("fecha o mês", "faz a ECD"...): resumo em "A conferir" (tela Aprovar lançamentos) e "serviço feito".
  registrarRotasServicoCompleto(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    store: storeServicoCompleto,
    normalizarCnpj: normalizarCnpjAcesso,
    sessao: (req) => {
      const s = sessaoDaRequisicaoContabil(req);
      if (!s) return undefined;
      const cnpjs = s.cnpjs.map(normalizarCnpjAcesso);
      return { userId: s.userId, login: s.login, cnpjs, tenantId: s.tenantId, escritorioDe: s.escritorioDe, podeEscrever: (c) => s.administrador || s.memberships.find((m) => normalizarCnpjAcesso(m.cnpj) === c)?.role !== "viewer" };
    },
    nomeDe: (userId) => servicoFeito.nomeDe(userId),
    marcarServicoFeito: async (s, r) => {
      const referencia = `${r.roteiro}:${r.referencia}`;
      await servicoFeito.servico.registrarSemErro(tenantServico(s), { chave: chaveServico("servico:completo", r.cnpj, referencia), tipo: "servico:completo", cnpj: r.cnpj, referencia }, "concluido", { userId: s.userId, login: s.login, nome: await servicoFeito.nomeDe(s.userId).catch(() => null), origem: "pessoa" }, `${r.titulo} — preparado pela Agente`);
    },
    achados: () => ultimaRodadaServicos?.achados || [],
  });
  // REVISOR: confere antes de gravar/fechar, parecer do cartão de OK, revisão geral do mês e lista "Corrigir" (robô semanal "revisor").
  const revisorContabil = criarRevisorContabil({
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    lerWorkspace: async (cnpj) => (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null,
    alterarWorkspace: (cnpj, alterar, autor) => alterarWorkspaceNoServidorContabil(cnpj, alterar, autor),
    extratoPendentes: async (cnpj, competencia) => {
      const r = await consultaBancoContabil("SELECT count(*)::int AS n FROM contabil_extrato_movimentos WHERE cnpj=$1 AND situacao='pendente' AND data >= $2::date AND data < ($2::date + interval '1 month')", [cnpj, `${competencia}-01`]).catch(() => null);
      return r ? Number(r.rows[0]?.n || 0) : null;
    },
    folhasDP: (cnpj, payload) => conferirFolhasDP((sql, params) => consultaBancoContabil(sql, params), cnpj, payload),
  });
  const sessaoRevisor = (req: express.Request) => {
    const s = sessaoDaRequisicaoContabil(req);
    if (!s) return undefined;
    const cnpjs = s.cnpjs.map(normalizarCnpjAcesso);
    return { userId: s.userId, login: s.login, cnpjs, tenantId: tenantServico(s), podeEscrever: (c: string) => s.administrador || s.memberships.find((m) => normalizarCnpjAcesso(m.cnpj) === c)?.role !== "viewer" };
  };
  const ultimoRevisorPorEscritorio = new Map<string, number>();
  registrarRotasRevisor(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    revisor: revisorContabil, sessao: sessaoRevisor,
    nomesDasEmpresas: async (cnpjs) => {
      const r = await consultaBancoContabil("SELECT cnpj, COALESCE(NULLIF(payload->'empresa'->>'razaoSocial',''), NULLIF(payload->'empresa'->>'nomeFantasia',''), cnpj) AS nome FROM contabil_company_workspaces WHERE cnpj = ANY($1::text[])", [cnpjs]);
      return r.rows.map((x: any) => ({ cnpj: String(x.cnpj), nome: String(x.nome || "") }));
    },
    rodarAgora: (s) => {
      if (!bancoContabilConfigurado()) return { ok: false, status: 503, motivo: "O banco do Contábil não está configurado." };
      const ultimo = ultimoRevisorPorEscritorio.get(s.tenantId) || 0;
      if (Date.now() - ultimo < 2 * 60_000) return { ok: false, status: 429, motivo: "A revisão acabou de ser pedida. Aguarde 2 minutos e tente de novo." };
      if (statusRobos().robos.find((x) => x.id === "revisor")?.executando) return { ok: false, status: 409, motivo: "A revisão já está rodando agora; aguarde terminar." };
      ultimoRevisorPorEscritorio.set(s.tenantId, Date.now());
      void executarRobo("revisor", async () => {
        const r = await revisorContabil.rodarRobo({ escritorios: async () => [{ id: s.tenantId, cnpjs: s.cnpjs }], forcar: true });
        registrarResultadoRobo("revisor", r.resumo);
      }).catch((e) => console.error("Falha na revisão geral pedida na hora:", e?.message || e));
      return { ok: true };
    },
  });
  // Reprocessar a recepção de UMA empresa (botão manual ao lado da retentativa automática de 60 s do Robô Reconciliador):
  // reaplica os mapeamentos padrão e prepara de novo os rascunhos com o que o Fiscal e o DP já mandaram. Idempotente; não aprova nada.
  app.post("/api/workspaces/:cnpj/reprocessar-recepcao", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    const cnpj = normalizarCnpjAcesso(req.params.cnpj);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!cnpjContabilValido(cnpj) || !sessao.cnpjs.map(normalizarCnpjAcesso).includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Este CNPJ não está vinculado ao seu acesso." });
    try {
      const mapeamentos = await aplicarMapeamentosPadraoContabil(cnpj);
      const r = await prepararRascunhosContabeisAutomaticos(cnpj);
      return res.json({ sucesso: true, mapeamentosAplicados: mapeamentos, criados: r.criados, atualizados: r.atualizados, mensagem: `Recepção reprocessada: ${r.criados} rascunho(s) novo(s), ${r.atualizados} atualizado(s). Nada foi aprovado.` });
    } catch (erro: any) {
      console.error("Falha ao reprocessar a recepção:", erro?.message || erro);
      return res.status(503).json({ sucesso: false, motivo: "Não consegui reprocessar agora. O robô tenta de novo sozinho a cada minuto." });
    }
  });
  // Conferência do fechamento do mês: roda sozinha a cada 30 min (Robô Conferidor); este botão confere na hora. Só leitura.
  let ultimaConferenciaManual = 0;
  app.post("/api/conferidor/conferir-agora", exigirOrigemNavegador, exigirSessaoContabil, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!sessaoDaRequisicaoContabil(req)) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (Date.now() - ultimaConferenciaManual < 60_000) return res.status(429).json({ sucesso: false, motivo: "A conferência acabou de rodar. Aguarde um minuto." });
    const r = dispararRoboAgora("conferidor");
    if ("codigo" in r) return res.status(409).json({ sucesso: false, motivo: r.motivo });
    ultimaConferenciaManual = Date.now();
    return res.json({ sucesso: true, mensagem: "Conferência iniciada. Os resultados aparecem em instantes." });
  });
  // Backups mensais cifrados do escritório — cada rota só lê/gera o backup do próprio tenant (sessao.tenantId).
  // Nível de escritório, não de uma empresa; qualquer pessoa da equipe vê, só admin/equipe do escritório gera.
  app.get("/api/contabil/backups", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.json({ sucesso: true, backups: [], periodoAtual: periodoDe(new Date()) });
    try {
      await prepararAuthContabil();
      const backups = await listarBackupsEscritorio((sql, params) => consultaBancoContabil(sql, params), String(sessao.tenantId));
      return res.json({ sucesso: true, backups, periodoAtual: periodoDe(new Date()) });
    } catch (erro: any) {
      console.error("Falha ao listar backups do escritório:", erro?.message || erro);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler os backups agora." });
    }
  });
  app.post("/api/contabil/backups/gerar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!sessao.administrador && !sessao.escritorioDe) return res.status(403).json({ sucesso: false, motivo: "Somente o administrador ou a equipe do escritório pode gerar o backup." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "PostgreSQL não configurado." });
    try {
      await prepararAuthContabil();
      const agora = new Date();
      const resultado = await gerarBackupEscritorio((sql, params) => consultaBancoContabil(sql, params), String(sessao.tenantId), periodoDe(agora), agora);
      if (resultado.motivo === "sem_empresas") return res.status(400).json({ sucesso: false, motivo: "Cadastre ao menos uma empresa antes de gerar o backup." });
      // Anti-retrabalho: guarda quem gerou; se já existia, diz quem fez (sem bloquear: gerar backup é idempotente).
      let jaFeito: string | undefined;
      try {
        const def = { chave: chaveServico("backup:escritorio", null, periodoDe(agora)), tipo: "backup:escritorio", referencia: periodoDe(agora) };
        const tenant = tenantDaSessao(sessao);
        if (resultado.criado) await servicoFeito.servico.registrarSemErro(tenant, def, "concluido", { userId: sessao.userId, login: sessao.login, nome: await servicoFeito.nomeDe(sessao.userId).catch(() => null), origem: "pessoa" });
        else { const anterior = await servicoFeito.servico.ler(tenant, def.chave); if (anterior?.estado === "concluido") jaFeito = descreverRegistro(anterior); }
      } catch (e) { servicoFeito.servico.falhaLiberada("backup", e); }
      return res.json({ sucesso: true, criadoAgora: resultado.criado, registro: resultado.registro, ...(jaFeito ? { jaFeito } : {}) });
    } catch (erro: any) {
      console.error("Falha ao gerar backup do escritório:", erro?.message || erro);
      return res.status(503).json({ sucesso: false, motivo: String(erro?.message || "Não foi possível gerar o backup agora.").slice(0, 200) });
    }
  });
  app.get("/api/contabil/backups/:id/download", exigirSessaoContabil, async (req, res) => {
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "PostgreSQL não configurado." });
    try {
      await prepararAuthContabil();
      const arquivo = await baixarBackupEscritorio((sql, params) => consultaBancoContabil(sql, params), String(sessao.tenantId), String(req.params.id));
      if (!arquivo) return res.status(404).json({ sucesso: false, motivo: "Backup não encontrado para o seu escritório." });
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename="${arquivo.nomeArquivo}"`);
      return res.send(arquivo.conteudo);
    } catch (erro: any) {
      console.error("Falha ao baixar backup do escritório:", erro?.message || erro);
      return res.status(503).json({ sucesso: false, motivo: "Não foi possível baixar o backup agora." });
    }
  });
  // Backup COMPLETO do banco (PostgreSQL) para fora do Render. Só o dono do sistema: escritórios clientes não veem nem chamam.
  // O backup mensal por escritório acima continua igual; este é o do sistema inteiro, cifrado, em destino S3-compatível.
  const servicoBackupBanco = criarServicoBackupBanco({ sistema: "contabil", nomeSistema: "Murade Contábil", consulta: (sql, params) => consultaBancoContabil(sql, params), conexaoBanco: () => opcoesConexaoBancoContabil() });
  const exigirDonoBackupBanco = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!sessao.donoSistema) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema acessa o backup completo do banco." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murade Contábil." });
    next();
  };
  app.get("/api/backup-banco/status", exigirSessaoContabil, exigirDonoBackupBanco, async (_req, res) => {
    try {
      const mensal = statusRobos().robos.find((r) => r.id === "backups");
      return res.json({ sucesso: true, ...(await servicoBackupBanco.status()), backupMensalEscritorios: mensal ? { estado: mensal.estado, ultimaExecucao: mensal.ultimaExecucao, resultado: mensal.ultimoResultado } : null });
    } catch (erro: any) { console.error("Falha ao ler o estado do backup do banco:", erro?.message || erro); return res.status(503).json({ sucesso: false, motivo: "Não consegui ler o estado do backup agora." }); }
  });
  app.get("/api/backup-banco/lista", exigirSessaoContabil, exigirDonoBackupBanco, async (_req, res) => {
    try { return res.json({ sucesso: true, backups: await servicoBackupBanco.listar() }); }
    catch (erro: any) { console.error("Falha ao listar backups do banco:", erro?.message || erro); return res.status(503).json({ sucesso: false, motivo: "Não consegui listar os backups no destino agora. Confira as variáveis do destino." }); }
  });
  app.post("/api/backup-banco/gerar", exigirOrigemNavegador, exigirSessaoContabil, exigirDonoBackupBanco, (req, res) => {
    const cfg = servicoBackupBanco.config();
    if (!cfg.configurado) return res.status(400).json({ sucesso: false, motivo: "Falta configurar o destino do backup (veja o passo a passo no painel)." });
    const r = dispararRoboAgora("backup_banco");
    if ("codigo" in r) return res.status(409).json({ sucesso: false, motivo: r.codigo === "ja_rodando" ? "Já existe um backup em andamento. Aguarde terminar." : r.motivo });
    console.log(`[Backup do banco] backup manual pedido por ${sessaoDaRequisicaoContabil(req)?.login}`);
    return res.status(202).json({ sucesso: true, mensagem: "Backup iniciado. Acompanhe aqui: ele leva de alguns segundos a poucos minutos." });
  });
  app.post("/api/backup-banco/validar", exigirOrigemNavegador, exigirSessaoContabil, exigirDonoBackupBanco, (req, res) => {
    if (!servicoBackupBanco.config().configurado) return res.status(400).json({ sucesso: false, motivo: "Falta configurar o destino do backup (veja o passo a passo no painel)." });
    const chave = typeof req.body?.chave === "string" ? req.body.chave.slice(0, 200) : undefined;
    void servicoBackupBanco.validar(chave).catch((e) => console.error("Falha ao conferir o backup do banco:", e?.message || e));
    return res.status(202).json({ sucesso: true, mensagem: "Conferência iniciada. O resultado aparece aqui em instantes." });
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
  const rodarConferidor = () => executarRobo("conferidor", async () => { const r = await rodarConferidorContabil((sql, params) => consultaBancoContabil(sql, params)); registrarResultadoRobo("conferidor", `${r.empresas} empresa(s) conferida(s) para o fechamento; ${r.comPendencia} com pendência.`); }).catch((e) => console.error("Falha no Robô Conferidor:", e?.message || e));
  setTimeout(() => void rodarConferidor(), 45_000).unref();
  setInterval(() => void rodarConferidor(), 30 * 60_000).unref();
  registrarRobo({ id: "empresas_fiscal", nome: "Robô de Empresas do Fiscal", posto: "integrador", missao: "Trazer do Murade Fiscal as empresas que ainda não estão no Contábil, para a equipe não cadastrar duas vezes. Não altera o que já existe e não leva certificado nem senha.", intervaloMs: 60 * 60_000 });
  const sincronizarEmpresasDoFiscal = async () => {
    const f = await buscarEmpresasDoFiscal();
    if (!f.ok) return { ok: false, motivo: f.motivo || "Fiscal indisponível.", criadas: [] as string[] };
    // Empresa excluída (lápide no Fiscal) nunca é recriada pelo robô, mesmo que ainda apareça na lista.
    const lapides = new Set(f.excluidas || []);
    const r = await importarCnpjsCompartilhados(cnpjsValidosDoFiscal(f.empresas, cnpjContabilValido).filter((e) => !lapides.has(e.cnpj)));
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
  // Robô Conferidor de Empresas Excluídas: se o Fiscal diz que uma empresa foi excluída (lápide) e ela ainda tem acesso, cadastro ou workspace aqui,
  // avisa o dono no painel de Saúde dos robôs. Só lê: apagar é sempre uma empresa por vez, com confirmação de uma pessoa.
  registrarRobo({ id: "empresas_excluidas", nome: "Robô Conferidor de Empresas Excluídas", posto: "conferidor", missao: "Conferir, só em leitura, se alguma empresa excluída no Murade Fiscal ainda sobrou no Contábil (acesso, cadastro ou workspace) e avisar o dono do sistema aqui. Nunca apaga nada sozinho: a exclusão é uma empresa por vez, com confirmação de uma pessoa, e nunca bloqueia o CNPJ para novo cadastro.", intervaloMs: 60 * 60_000 });
  const rodarEmpresasExcluidas = () => bancoContabilConfigurado() ? executarRobo("empresas_excluidas", async () => {
    await prepararAuthContabil();
    const f = await buscarEmpresasDoFiscal();
    if (!f.ok) { registrarResultadoRobo("empresas_excluidas", `Fiscal indisponível agora (${f.motivo || "sem resposta"}); confiro na próxima rodada.`); return; }
    const sobras = await sobrasDeEmpresasExcluidas((sql, params) => consultaBancoContabil(sql, params), f.excluidas || []);
    const texto = sobras.length ? `${sobras.length} empresa(s) excluída(s) no Fiscal ainda existem no Contábil: ${sobras.join(", ")}. Exclua uma por vez em Cadastro de Empresa (ou peça à Agente por voz).` : `Nenhuma sobra: ${(f.excluidas || []).length} empresa(s) excluída(s) no Fiscal conferida(s).`;
    registrarResultadoRobo("empresas_excluidas", texto);
    definirAlertaRobo("empresas_excluidas", sobras.length ? { nivel: "aviso", texto } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor de Empresas Excluídas:", e?.message || e)) : undefined;
  setTimeout(() => void rodarEmpresasExcluidas(), 150_000).unref();
  setInterval(() => void rodarEmpresasExcluidas(), 60 * 60_000).unref();
  registrarRobo({ id: "acessos", nome: "Robô Conferidor de Acessos", posto: "conferidor", missao: "Conferir se contas e escritórios excluídos ou bloqueados não deixaram acesso nem sessão aberta, mantendo os e-mails livres para novo cadastro.", intervaloMs: 60 * 60_000 });
  const rodarConferidorDeAcessos = () => bancoContabilConfigurado() ? executarRobo("acessos", async () => {
    await prepararAuthContabil();
    const relatorio = await rodarConferidorAcessos((sql, params) => consultaBancoContabil(sql, params), { usuarios: "contabil_auth_users", acesso: "contabil_auth_company_access", sessoes: "contabil_auth_sessions", colunaEscritorio: "global_admin" });
    registrarResultadoRobo("acessos", resumoRelatorioAcessos(relatorio));
  }).catch((e) => console.error("Falha no Robô Conferidor de Acessos:", e?.message || e)) : undefined;
  setTimeout(() => void rodarConferidorDeAcessos(), 90_000).unref();
  setInterval(() => void rodarConferidorDeAcessos(), 60 * 60_000).unref();
  registrarRobo({ id: "seguranca_login", nome: "Robô Conferidor de Segurança do Login", posto: "conferidor", missao: "Conferir, só em leitura, as últimas 24 horas do login: senhas e códigos errados, bloqueios por excesso de tentativas, códigos de emergência usados e se o dono do sistema está com o código de segurança ligado. Avisa quando algo foge do normal. Nunca bloqueia, libera nem altera nenhuma conta.", intervaloMs: 2 * 60 * 60_000 });
  const rodarSegurancaLogin = () => bancoContabilConfigurado() ? executarRobo("seguranca_login", async () => {
    const r = await resumoSegurancaContabil(1);
    registrarResultadoRobo("seguranca_login", r.texto);
    if (r.alerta) throw new Error(r.texto);
  }).catch((e) => console.error("Alerta do Robô Conferidor de Segurança do Login:", e?.message || e)) : undefined;
  setTimeout(() => void rodarSegurancaLogin(), 130_000).unref();
  setInterval(() => void rodarSegurancaLogin(), 2 * 60 * 60_000).unref();
  // Tarefas da equipe: a administradora pede serviço a alguém da equipe (tela, chat ou voz da Agente IA). Isolado por escritório.
  const servicoTarefasEquipe = criarServicoTarefas((sql, params) => consultaBancoContabil(sql, params));
  registrarRotasTarefasEquipe(app, { servico: servicoTarefasEquipe, exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador, sessao: (req) => { const x = sessaoDaRequisicaoContabil(req); return x ? { userId: x.userId, login: x.login, tenantId: x.tenantId, escritorioDe: x.escritorioDe, administrador: x.administrador === true, cnpjs: x.cnpjs } : undefined; } });
  registrarRobo({ id: "tarefas_equipe", nome: "Robô de Tarefas da Equipe", posto: "conferidor", missao: "Conferir os pedidos que a administradora fez à equipe: refaz o aviso que não chegou, lembra quem não abriu o pedido em mais de 2 horas úteis e avisa quem pediu e quem recebeu quando o prazo vence. Nunca altera, conclui nem apaga uma tarefa.", intervaloMs: 15 * 60_000 });
  const rodarTarefasEquipe = () => bancoContabilConfigurado() ? executarRobo("tarefas_equipe", async () => {
    const r = await servicoTarefasEquipe.conferir();
    registrarResultadoRobo("tarefas_equipe", r.resumo);
    if (r.falhas > 0) throw new Error(r.resumo);
  }).catch((e) => console.error("Alerta do Robô de Tarefas da Equipe:", e?.message || e)) : undefined;
  setTimeout(() => void rodarTarefasEquipe(), 150_000).unref();
  setInterval(() => void rodarTarefasEquipe(), 15 * 60_000).unref();
  registrarRotinaManual("tarefas_equipe", rodarTarefasEquipe);
  // Meu jeito: rotas autenticadas e Robô Conferidor (diário): confere as regras guardadas contra o catálogo de hoje e limpa o que ficou velho.
  registrarRotasMeuJeito(app, { servico: servicoMeuJeito, exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador, sessao: sessaoMeuJeito, hashSessao: hashSessaoContabil });
  registrarRobo({ id: "meu_jeito", nome: "Robô Conferidor do Meu Jeito", posto: "conferidor", missao: "Conferir todo dia se as regras que a Agente aprendeu de cada pessoa ainda existem no sistema (regra obsoleta é pausada e a pessoa é avisada na próxima abertura) e limpar o que ficou velho: jeito de quem não existe mais, sessões paradas e contagens inválidas. Nunca apaga o jeito de quem ainda existe.", intervaloMs: 24 * 60 * 60_000 });
  const rodarMeuJeito = () => bancoContabilConfigurado() ? executarRobo("meu_jeito", async () => {
    const r = await servicoMeuJeito.conferir();
    registrarResultadoRobo("meu_jeito", r.resumo);
    if (r.falhas > 0) throw new Error(r.resumo);
  }).catch((e) => console.error("Alerta do Robô Conferidor do Meu Jeito:", e?.message || e)) : undefined;
  setTimeout(() => void rodarMeuJeito(), 190_000).unref();
  setInterval(() => void rodarMeuJeito(), 24 * 60 * 60_000).unref();
  registrarRotinaManual("meu_jeito", rodarMeuJeito);
  // Apresentação falada do sistema: confere, só em leitura, se cada robô, rota de integração e tela ainda tem bloco e se nenhum bloco cita algo que não existe.
  registrarRobo({ id: "apresentacao", nome: "Robô Conferidor da Apresentação", posto: "conferidor", missao: "Conferir todo dia, só em leitura, se a apresentação falada do sistema (módulos, robôs, integrações e limites) ainda bate com o código. Se um robô, tela ou integração novo ainda não tem bloco, avisa o dono do sistema aqui. Nunca altera nada.", intervaloMs: 24 * 60 * 60_000 });
  const rodarApresentacao = () => executarRobo("apresentacao", async () => {
    if (!fsSync.existsSync(path.join(process.cwd(), "server.ts"))) { registrarResultadoRobo("apresentacao", "Código-fonte indisponível neste ambiente: a conferência roda na compilação (npm test)."); definirAlertaRobo("apresentacao", null); return; }
    const r = conferirApresentacao((c) => { try { return fsSync.readFileSync(path.join(process.cwd(), c), "utf8"); } catch { return null; } });
    registrarResultadoRobo("apresentacao", resumoRelatorioApresentacao(r));
    definirAlertaRobo("apresentacao", r.problemas.length ? { nivel: "aviso", texto: resumoRelatorioApresentacao(r) } : null);
    if (r.problemas.length) throw new Error(resumoRelatorioApresentacao(r));
  }).catch((e) => console.error("Alerta do Robô Conferidor da Apresentação:", e?.message || e));
  setTimeout(() => void rodarApresentacao(), 200_000).unref();
  setInterval(() => void rodarApresentacao(), 24 * 60 * 60_000).unref();
  registrarRotinaManual("apresentacao", rodarApresentacao);
  registrarRobo({ id: "backups", nome: "Robô de Backups Mensais", posto: "conferidor", missao: "Conferir se cada escritório com empresa cadastrada já tem o backup cifrado do mês corrente, gerado e conferido (checksum e reabertura do zip); gera de novo sozinho quando falta ou falhou, sem precisar do dono. Mantém só o backup do mês corrente (o anterior é apagado) e avisa o escritório por e-mail quando fica pronto.", intervaloMs: 60 * 60_000 });
  const escritoriosParaBackup = async (): Promise<{ id: string; login: string; cnpjs: string[] }[]> => {
    const r = await consultaBancoContabil(
      `SELECT u.id AS id, u.login AS login, array_agg(DISTINCT a.cnpj) AS cnpjs
       FROM contabil_auth_users u
       JOIN contabil_auth_company_access a ON a.user_id = u.id
       WHERE u.global_admin = true AND u.disabled = false
       GROUP BY u.id, u.login`,
    );
    return r.rows.map((row: any) => ({ id: String(row.id), login: String(row.login), cnpjs: (row.cnpjs || []).filter(Boolean).map((c: any) => String(c)) }));
  };
  const rodarConferidorBackups = () => bancoContabilConfigurado() ? executarRobo("backups", async () => {
    await prepararAuthContabil();
    const escritorios = await escritoriosParaBackup();
    const r = await conferirBackupsEscritorios((sql, params) => consultaBancoContabil(sql, params), escritorios, new Date(), {
      jaFeitoPorPessoa: async (tenantId, periodo) => Boolean(await servicoFeito.servico.jaConcluidoPorPessoa(tenantId, chaveServico("backup:escritorio", null, periodo))),
      aoGerar: (tenantId, periodo) => servicoFeito.servico.registrarSemErro(tenantId, { chave: chaveServico("backup:escritorio", null, periodo), tipo: "backup:escritorio", referencia: periodo }, "concluido", { origem: "robo", login: "robo" }),
    });
    registrarResultadoRobo("backups", r.resumo);
    if (r.atencao) console.warn(`Robô de Backups Mensais: ${r.resumo}`);
  }).catch((e) => console.error("Falha no Robô de Backups Mensais:", e?.message || e)) : undefined;
  setTimeout(() => void rodarConferidorBackups(), 150_000).unref();
  setInterval(() => void rodarConferidorBackups(), 60 * 60_000).unref();
  // Robô de Backup do Banco: backup completo e cifrado do PostgreSQL para fora do Render, todo dia a partir das 3h (Brasília).
  registrarRobo({ id: "backup_banco", nome: "Robô de Backup do Banco", posto: "conferidor", missao: "Fazer todo dia, a partir das 3h (Brasília), o backup COMPLETO do banco do Contábil (cifrado com a chave do dono, em destino fora do Render), guardar 7 diários, 4 semanais e 12 mensais (só apaga os próprios backups antigos) e avisar aqui se passar de 26 h sem backup. Desligado até o dono configurar o destino. Só lê o banco; nunca altera nem apaga dado do sistema.", ...(bancoContabilConfigurado() ? { intervaloMs: 10 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarBackupBanco = () => bancoContabilConfigurado() ? executarRobo("backup_banco", async () => {
    const r = await servicoBackupBanco.rodadaDoRobo();
    definirAlertaRobo("backup_banco", r.alerta); registrarResultadoRobo("backup_banco", r.resumo);
    if (r.falha) throw new Error(r.falha);
  }).catch((e) => console.error("Falha no Robô de Backup do Banco:", e?.message || e)) : undefined;
  // "Rodar agora": faz o backup na hora (manual), sem esperar as 3h; usa a mesma trava do robô.
  const rodarBackupBancoAgora = () => executarRobo("backup_banco", async () => {
    const r = await servicoBackupBanco.executar("manual");
    if (r.ok) { registrarResultadoRobo("backup_banco", `Backup manual do banco concluído: ${r.tabelas} tabelas, ${r.linhas} linhas.`); definirAlertaRobo("backup_banco", null); return; }
    if (r.codigo === "ja_rodando") return;
    throw new Error(r.motivo || "Falha no backup do banco.");
  }).catch((e) => console.error("Falha no backup manual do banco:", e?.message || e));
  if (bancoContabilConfigurado()) {
    setTimeout(() => void servicoBackupBanco.recuperarInterrompidos().then(() => rodarBackupBanco()), 120_000).unref();
    setInterval(() => void rodarBackupBanco(), 10 * 60_000).unref();
  }
  const timerMensageiro = setInterval(() => { executarRobo("mensageiro", () => centralDePedidos.reenviarPendentes()).catch((e) => console.error("Falha ao reenviar pedidos entre agentes:", e?.message || e)); }, 60_000);
  timerMensageiro.unref();
  // "Rodar agora" (manual) das rotinas automáticas acima; o Reconciliador registra o seu dentro do app.listen.
  registrarRotinaManual("mensageiro", () => executarRobo("mensageiro", () => centralDePedidos.reenviarPendentes()).catch((e) => console.error("Falha ao reenviar pedidos entre agentes:", e?.message || e)));
  registrarRotinaManual("conferidor", rodarConferidor);
  registrarRotinaManual("empresas_fiscal", rodarEmpresasFiscal);
  registrarRotinaManual("empresas_excluidas", rodarEmpresasExcluidas);
  registrarRotinaManual("acessos", rodarConferidorDeAcessos);
  registrarRotinaManual("seguranca_login", rodarSegurancaLogin);
  registrarRotinaManual("backups", rodarConferidorBackups);
  registrarRotinaManual("backup_banco", rodarBackupBancoAgora);
  // Robô Conferidor do Anti-retrabalho: vence "em andamento" esquecido, apaga registros com mais de 120 dias e relata bloqueios/avisos.
  // Piloto Visível: confere, só em leitura, se todo alvo do mapa de telas ainda existe no código e avisa o dono se algo foi renomeado.
  registrarRobo({ id: "piloto", nome: "Robô Conferidor do Piloto Visível", posto: "conferidor", missao: "Conferir todo dia, só em leitura, se cada tela, campo, botão e título que a Agente usa para mostrar e preencher na tela do contador ainda existe no código. Se algo for renomeado, avisa o dono do sistema aqui. Nunca altera tela, arquivo nem dado.", intervaloMs: 24 * 60 * 60_000 });
  const rodarConferidorPiloto = () => executarRobo("piloto", async () => {
    if (!fsSync.existsSync(path.join(process.cwd(), "src", "App.tsx"))) { registrarResultadoRobo("piloto", "Código-fonte indisponível neste ambiente: a conferência do mapa roda na compilação (npm test)."); definirAlertaRobo("piloto", null); return; }
    const r = conferirMapaPiloto((c) => { try { return fsSync.readFileSync(path.join(process.cwd(), c), "utf8"); } catch { return null; } });
    registrarResultadoRobo("piloto", resumoRelatorioPiloto(r));
    definirAlertaRobo("piloto", r.problemas.length ? { nivel: "critico", texto: resumoRelatorioPiloto(r) } : null);
    if (r.problemas.length) throw new Error(resumoRelatorioPiloto(r));
  }).catch((e) => console.error("Alerta do Robô Conferidor do Piloto Visível:", e?.message || e));
  setTimeout(() => void rodarConferidorPiloto(), 170_000).unref();
  setInterval(() => void rodarConferidorPiloto(), 24 * 60 * 60_000).unref();
  registrarRotinaManual("piloto", rodarConferidorPiloto);
  registrarRobo({ id: "servico_feito", nome: "Robô Conferidor de Serviço Feito", posto: "conferidor", missao: "Evitar retrabalho entre quem trabalha no mesmo escritório (e o robô): libera os \"estou fazendo\" esquecidos depois de 15 minutos, apaga registros com mais de 120 dias e relata quantas vezes avisou ou barrou um serviço repetido. Só mexe no próprio registro de quem fez o quê; nunca em lançamento, empresa ou nota.", intervaloMs: 15 * 60_000 });
  const rodarServicoFeito = () => bancoContabilConfigurado() ? executarRobo("servico_feito", async () => {
    registrarResultadoRobo("servico_feito", await servicoFeito.rodarConferidor());
    definirAlertaRobo("servico_feito", servicoFeito.servico.contadores.liberadosPorFalha > 0 ? { nivel: "aviso", texto: `O registro de "quem já fez" falhou ${servicoFeito.servico.contadores.liberadosPorFalha} vez(es) desde que o servidor iniciou; os serviços foram liberados normalmente (sem aviso de duplicidade).` } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor de Serviço Feito:", e?.message || e)) : undefined;
  setTimeout(() => void rodarServicoFeito(), 170_000).unref();
  setInterval(() => void rodarServicoFeito(), 15 * 60_000).unref();
  registrarRotinaManual("servico_feito", rodarServicoFeito);
  // Robô Conferidor dos Serviços da Agente: roteiros parados (cartão de preparo não confirmado), esperando conferência há dias
  // e concluídos (competência fechada). Só mexe no próprio resumo do serviço; nunca em lançamento, empresa ou competência.
  registrarRobo({ id: "servico_completo", nome: "Robô Conferidor dos Serviços da Agente", posto: "conferidor", missao: "Conferir a cada 2 horas os serviços completos que a Agente fez para o contador (fechamento do mês, ECD, encerramento, balancete para o cliente): marca como parado o que ficou no meio, lembra o que espera o OK ou a conferência do contador há mais de 3 dias, dá como concluído o fechamento cuja competência o contador fechou e preenche o CNPJ do escritório pelo DP/Fisco IA quando o dono é o mesmo. Nunca aprova, fecha nem lança nada.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarServicosAgente = () => bancoContabilConfigurado() ? executarRobo("servico_completo", async () => {
    const r = await rodarConferidorServicos(storeServicoCompleto, (sql, params) => consultaBancoContabil(sql, params));
    ultimaRodadaServicos = r;
    // CNPJ do escritório (adicional Consultor Murade): preenche sozinho pelo DP/Fisco IA quando o dono é o mesmo; nunca sobrescreve.
    const cnpjs = await preencherCnpjsDosEscritorios((sql, params) => consultaBancoContabil(sql, params), storeEscritorio).catch(() => ({ semCnpj: 0, preenchidos: 0 }));
    const cadastro = await conferirCadastrosDosEscritorios((sql, params) => consultaBancoContabil(sql, params)).catch(() => null);
    registrarResultadoRobo("servico_completo", `${resumoRodadaServicos(r)} CNPJ do escritório: ${cnpjs.preenchidos} de ${cnpjs.semCnpj} escritório(s) sem CNPJ preenchido(s) pelo DP/Fisco IA.${cadastro ? ` ${cadastro.texto}` : ""}`);
    definirAlertaRobo("servico_completo", r.parados ? { nivel: "aviso", texto: `${r.parados} serviço(s) da Agente ficaram parados sem a confirmação do preparo; o contador vê em "A conferir" e pode pedir de novo.` } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor dos Serviços da Agente:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarServicosAgente(), 230_000).unref();
    setInterval(() => void rodarServicosAgente(), 2 * 60 * 60_000).unref();
    registrarRotinaManual("servico_completo", rodarServicosAgente);
  }
  // Robô do Revisor: revisão geral semanal do mês anterior de cada escritório, lista "Corrigir" (só lê; corrigir é clique da pessoa).
  registrarRobo({ id: "revisor", nome: "Robô do Revisor (revisão geral semanal)", posto: "conferidor", missao: "Uma vez por semana (acorda a cada 6 horas e confere se já passou uma semana) faz, só em leitura, a revisão geral do mês anterior de cada empresa de cada escritório — fechamento guiado (partidas, inválidos, aprovações, rascunhos, saldos iniciais, depreciação), lançamento repetido, Caixa com saldo credor, extrato sem conciliação e folha do DP sem partida — e põe o que achou na lista Corrigir da tela Revisor. Corrigir sozinho, só com o clique da pessoa, só lançamento pendente de aprovação em mês aberto e só o determinístico; nunca aprova, nunca fecha e nunca transmite nada.", intervaloMs: 6 * 60 * 60_000 });
  const rodarRevisor = (forcar = false) => bancoContabilConfigurado() ? executarRobo("revisor", async () => {
    await prepararAuthContabil();
    const r = await revisorContabil.rodarRobo({ forcar, escritorios: async () => (await escritoriosParaBackup()).map((e) => ({ id: e.id, cnpjs: e.cnpjs.map(normalizarCnpjAcesso) })) });
    registrarResultadoRobo("revisor", r.resumo);
    definirAlertaRobo("revisor", r.novos ? { nivel: "aviso", texto: `O Revisor achou ${r.novos} item(ns) novo(s) para corrigir; estão na tela Revisor › Corrigir.` } : null);
  }).catch((e) => console.error("Falha no Robô do Revisor:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarRevisor(), 240_000).unref();
    setInterval(() => void rodarRevisor(), INTERVALO_ROBO_REVISOR_MS).unref();
    registrarRotinaManual("revisor", () => rodarRevisor(true));
  }

  // Robôs da escrituração avançada (todos os escritórios, empresa por empresa; nunca aprovam nada sozinhos).
  const consultarEscrituracao = (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params);
  registrarRobo({ id: "lancamentos_padrao", nome: "Robô dos Lançamentos Padrão", posto: "calculador", missao: "Preparar todo mês, como pré-lançamento pendente de aprovação, os lançamentos padrão (recorrentes) que cada empresa cadastrou, como aluguel e honorários. Nunca prepara duas vezes a mesma competência, nunca mexe em mês fechado e nunca aprova.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarLancamentosPadrao = () => bancoContabilConfigurado() ? executarRobo("lancamentos_padrao", async () => registrarResultadoRobo("lancamentos_padrao", await roboLancamentosPadrao())).catch((e) => console.error("Falha no Robô dos Lançamentos Padrão:", e?.message || e)) : undefined;
  registrarRobo({ id: "livro_caixa", nome: "Robô do Livro Caixa (Simples)", posto: "conferidor", missao: "Conferir as empresas do Simples Nacional no mês anterior: com escrituração contábil (Diário e Razão) o Livro Caixa é dispensado (Res. CGSN 140/2018, art. 63, § 3º); sem lançamento no mês, emite sozinho o Livro Caixa sem movimento quando as contas de Caixa/Bancos e o saldo inicial estão confirmados, e avisa quando falta algo.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarLivroCaixa = () => bancoContabilConfigurado() ? executarRobo("livro_caixa", async () => registrarResultadoRobo("livro_caixa", await roboLivroCaixa(consultarEscrituracao))).catch((e) => console.error("Falha no Robô do Livro Caixa:", e?.message || e)) : undefined;
  registrarRobo({ id: "encerramento", nome: "Robô do Encerramento do Resultado", posto: "conferidor", missao: "Conferir o encerramento do resultado do ano anterior em cada empresa: avisa quando falta ou quando o encerramento gravado não bate mais com as contas de resultado, e prepara o encerramento para aprovação quando janeiro a novembro já estão fechados. Nunca aprova nem estorna sozinho.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarEncerramento = () => bancoContabilConfigurado() ? executarRobo("encerramento", async () => registrarResultadoRobo("encerramento", await roboEncerramento(consultarEscrituracao))).catch((e) => console.error("Falha no Robô do Encerramento:", e?.message || e)) : undefined;
  registrarRobo({ id: "conciliacao", nome: "Robô da Conciliação Bancária", posto: "conferidor", missao: "Olhar o extrato guardado de cada empresa e sugerir, para cada movimento sem conciliação, o lançamento aprovado que casa (mesmo sentido e valor) ou a conta pela regra do escritório (quando o histórico tiver o texto) ou pelo histórico. Só grava sugestão: conciliar e lançar é sempre uma pessoa.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarConciliacao = () => bancoContabilConfigurado() ? executarRobo("conciliacao", async () => registrarResultadoRobo("conciliacao", await roboConciliacao(consultarEscrituracao))).catch((e) => console.error("Falha no Robô da Conciliação:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarLancamentosPadrao(), 150_000).unref(); setInterval(() => void rodarLancamentosPadrao(), 60 * 60_000).unref();
    setTimeout(() => void rodarLivroCaixa(), 170_000).unref(); setInterval(() => void rodarLivroCaixa(), 2 * 60 * 60_000).unref();
    setTimeout(() => void rodarEncerramento(), 190_000).unref(); setInterval(() => void rodarEncerramento(), 6 * 60 * 60_000).unref();
    setTimeout(() => void rodarConciliacao(), 210_000).unref(); setInterval(() => void rodarConciliacao(), 60 * 60_000).unref();
    registrarRotinaManual("lancamentos_padrao", rodarLancamentosPadrao);
    registrarRotinaManual("livro_caixa", rodarLivroCaixa);
    registrarRotinaManual("encerramento", rodarEncerramento);
    registrarRotinaManual("conciliacao", rodarConciliacao);
  }

  registrarRotaVozGemini(app, { obterIA: () => getAI(), autorizar: () => true, antes: [exigirSessaoContabil] });
  app.post("/api/ai/chat", exigirSessaoContabil, async (req, res) => {
    const { context, module: requestedModule } = req.body;
    const moduleName = requestedModule === "fiscal" || requestedModule === "dp" ? requestedModule : "contabil";

    if (typeof req.body?.message !== "string" || !req.body.message.trim()) {
      return res.status(400).json({ error: "Mensagem não fornecida." });
    }
    // Nunca recusa por tamanho: lê até 500.000 caracteres e avisa na resposta se o resto ficou de fora.
    const limitada = limitarPedido(req.body.message);
    const message = limitada.texto;

    const ai = getAI();

    // Contexto base de especialista contábil brasileiro
    const systemInstruction = `Você é a Assistente Murade, trabalhando no módulo ${moduleName === "dp" ? "Departamento Pessoal" : moduleName === "fiscal" ? "Fiscal" : "Contábil"}, para profissionais brasileiros. Responda em português do Brasil, com tom calmo, direto e prático. Para legislação, prazos, alíquotas, obrigações, tabelas e procedimentos sujeitos a mudança, pesquise informações atuais pela ferramenta de busca. Baseie conclusões legais apenas em fontes oficiais brasileiras: Receita Federal, Portal SPED, eSocial, SEFAZ, Planalto e prefeituras/portais oficiais. Não use páginas comerciais como autoridade legal. Explique a causa provável e a solução em etapas. Não invente dados de empresas, trabalhadores, folha, saldos, transmissões, integrações, alíquotas ou prazos; peça UF, município, regime e competência quando necessário. Não afirme que uma ação foi executada ou que uma conexão existe sem confirmação. Se não localizar fonte oficial atual ou não puder confirmar, diga claramente que ainda vai verificar e identifique o órgão que deve ser consultado. Respostas são orientação informativa, não substituem conferência do contador responsável. Nunca diga que a pergunta é grande ou longa demais: se vierem várias perguntas, liste-as numa linha curta, responda a primeira e termine com "Próximo: 2) … — quer que eu siga?".`;

    const rapida = respostaRapida(message);
    if (rapida) return res.json({ reply: rapida.reply, sources: rapida.sources, searched: false, rapida: true });

    if (!ai) return res.status(503).json({ error: "Assistente IA indisponível. Configure uma GEMINI_API_KEY válida." });
    try {
        const response = await gerarComReserva(ai, {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          contents: [{ role: "user", parts: [{ text: `Contexto contábil atual do sistema:\n${JSON.stringify(context || {}).slice(0, 4000)}\n\nPergunta do usuário: ${message}` }] }],
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
        return res.json({ reply: limitada.cortado ? `${reply}\n\n${avisoDeTextoCortado(limitada.tamanhoOriginal)}` : reply, sources, searched: Boolean(response.candidates?.[0]?.groundingMetadata), ...(limitada.cortado ? { textoCortado: true } : {}) });
    } catch (err: any) {
      console.error("Erro na chamada Gemini:", err);
      return res.status(502).json({ error: "A IA está com muita procura agora e não respondeu a tempo. Tente de novo em alguns segundos." });
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
        // Antes de gerar rascunhos: preenche sozinho as origens sem mapeamento com o plano padrão (só quando código e descrição batem).
        let mapeamentosAplicados = 0;
        for (const cnpjSem of await listarCnpjsComOrigensSemMapeamentoContabil()) {
          try { mapeamentosAplicados += await aplicarMapeamentosPadraoContabil(cnpjSem); }
          catch (error) { console.error(`[Murad Contábil] Falha ao aplicar mapeamentos padrão do CNPJ ${cnpjSem}:`, error); }
        }
        if (mapeamentosAplicados) console.log(`[Murad Contábil] Mapeamentos padrão aplicados automaticamente: ${mapeamentosAplicados}.`);
        const semMapeamentoAinda = (await listarCnpjsComOrigensSemMapeamentoContabil().catch(() => null))?.length;
        ultimoMapeamentoAutomatico = { aplicados: mapeamentosAplicados, semMapeamentoAinda };
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
        registrarResultadoRobo("reconciliador", `${cnpjs.length} empresa(s) com mapeamento reconciliada(s); ${criados} pré-lançamento(s) criado(s), ${atualizados} atualizado(s), ${falhas} falha(s). Mapeamentos padrão aplicados sozinhos neste ciclo: ${mapeamentosAplicados}${ultimoMapeamentoAutomatico.semMapeamentoAinda ? `; ${ultimoMapeamentoAutomatico.semMapeamentoAinda} empresa(s) ainda precisam de mapeamento manual (o plano de contas delas não bate com o padrão)` : ""}.`);
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
    registrarRotinaManual("reconciliador", () => executarRobo("reconciliador", reconciliarRascunhos).catch(() => undefined));
    console.log("[Murad Contábil] Reconciliação de rascunhos habilitada a cada 60 segundos; lançamentos definitivos continuam exigindo aprovação.");
  });
}

startServer();
