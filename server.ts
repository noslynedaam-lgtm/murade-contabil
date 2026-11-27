import { MAX_TURNOS_HISTORICO, aceitaTemperatura, configDoPerfil, fraseDaReconferencia, type PerfilPedido } from "./src/data/agenteAgil";
import { FERRAMENTAS_CONFERE } from "./src/server/agenteConfere";
import { respostaLevarContabil } from "./src/server/pilotoContabil";
import { enviarExtratoParaBaixa } from "./src/server/baixaGuiasFiscal";
import { registrarRotasCentralLucroReal } from "./src/server/centralLucroRealRotas";
import { atualizarSelicContabil, painelCentral, rodarCentralLucroReal, type DepsCentral } from "./src/server/centralLucroReal";
import { conferirAvisosCelular, enviarAvisosCelular, enviarPeloFiscal, type ItemAviso as ItemAvisoLR } from "./src/server/avisoCelularLucroReal";
import { registrarAlertaUrgenteContabil } from "./src/server/alertaUrgenteContabilRotas";
import { enviarUrgentePeloFiscal } from "./src/server/alertaUrgenteContabil";
import { aparelhosDoUsuario, assinarAparelho, cancelarAparelho, chavePublicaContabil, enviarAoUsuario, enviarUrgenteContabilEFiscal, pushConfiguradoContabil } from "./src/server/avisoAparelhoContabil";
import { linhaFalhaAvisoAparelho } from "./src/server/falhaAvisoAparelho";
import { buscarRetencoesNoFiscal, gravarRetencoes } from "./src/server/lucroRealObrigacoesExtras";
// Preenchido quando as rotas do Lucro Real são montadas (a saudação da Agente usa para lembrar os avisos vermelhos).
let centralLRParaSaudacao: { deps: DepsCentral; empresas: (cnpjs?: string[]) => Promise<string[]> } | null = null;
const depsCentralLRSaudacao = (): DepsCentral => { if (!centralLRParaSaudacao) throw new Error("Central do Lucro Real ainda não montada."); return centralLRParaSaudacao.deps; };
const empresasLucroRealSaudacao = async (cnpjs: string[]) => (centralLRParaSaudacao ? centralLRParaSaudacao.empresas(cnpjs) : []);
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
import { registrarRotasLucroReal } from "./src/server/lucroRealRotas";
import { rodarRoboLucroReal, listarApuracoesReal, listarPagamentosReal } from "./src/server/lucroRealApuracao";
import { registrarRotasDarfSerproLucroReal, pedirDarfAoFiscal, conferirDarfsSerpro } from "./src/server/darfSerproLucroReal";
import { acessoEmpresa } from "./src/server/escrituracaoRotas";
import { periodoBloqueado } from "./src/server/centralLucroReal";
import { ErroValidacaoApuracaoFiscal, apuracoesStoreConfigurado, gravarApuracoesFiscais, lerApuracoesFiscais, verificarEstadoStoreApuracoes } from "./src/server/apuracoesFiscaisStore";
import { dpStoreConfigurado, ErroConflitoResumoDP, ErroValidacaoResumoDP, gravarResumoDP, lerResumosDP, verificarEstadoStoreDP } from "./src/server/dadosDpStore";
import { gravarResumoProLaboreDP } from "./src/server/dadosProLaboreStore";
import { registrarRotasArquivoMorto } from "./src/server/arquivoMortoRotas";
import { migrarArquivoAntigo, rodarRoboPrazoGuarda, escritorioDaEmpresa } from "./src/server/arquivoMorto";
import { gravarEventoDP, lerEventosDP } from "./src/server/dadosDpEventosStore";
import { registrarGestaoEquipe } from "./src/server/gestaoEquipe";
import { prepararAuthContabil, configGestaoEquipeContabil, adicionarEmpresaAcessoContabil, adicionarEquipeContabil, bloquearEscritorioContabil, definirLimiteEscritorioContabil, convidarEquipeContabil, convidarEscritorioContabil, reenviarAcessoEscritorioContabil, listarEquipeContabil, listarEscritoriosContabil, removerEquipeContabil, bootstrapAuthContabil, contabilizarRascunhosAutomaticosContabil, cnpjContabilValido, criarConviteUsuarioContabil, decidirLancamentoManualContabil, exigirSessaoContabil, sessaoDaRequisicaoContabil, fecharCompetenciaContabil, lerWorkspaceContabil, lerWorkspaceInternoContabil, listarCnpjsComMapeamentoContabil, listarCnpjsComOrigensSemMapeamentoContabil, aplicarMapeamentosPadraoContabil, listarFechamentosContabil, listarHistoricoAprovacoesContabil, listarUsuariosEmpresaContabil, listarWorkspacesContabil, loginAuthContabil, logoutAuthContabil, manterConectadoContabil, normalizarCnpjAcesso, removerEmpresaAcessoContabil, resgatarConviteUsuarioContabil, revogarUsuarioEmpresaContabil, salvarWorkspaceContabil, sessaoAtualContabil, statusAuthContabil, verificarCnpjAutorizadoContabil, vincularUsuarioExistenteContabil, importarCnpjsCompartilhados, sessaoDoEscritorioParaIntegracaoContabil, auth2faEstadoContabil, auth2faIniciarContabil, auth2faAtivarContabil, auth2faDesativarContabil, auth2faRedefinirContabil, auth2faResumoContabil, resumoSegurancaContabil, alterarWorkspaceNoServidorContabil, criarWorkspacesQueFaltamContabil, resumoPreLancamentosPorEmpresaContabil, ORIGENS_BASICAS_CONTABIL } from "./src/server/authContabil";
import { ArmazemDeEtapas, chaveDeEtapas, prepararPedido, limitarPedido, avisoDeTextoCortado } from "./src/server/agenteEtapas";
import { ArmazemAcoesPendentes, avancarAcao as avancarAcaoAgenteIA, confirmarAcao as confirmarAcaoAgenteIA, conversar as conversarAgenteIA, recusarAcao as recusarAcaoAgenteIA, type ChamarApi, type ContextoAgente, type ModeloIA } from "./src/server/agenteMotor";
import { kitContabil } from "./src/server/agenteContabil";
import { registrarRotasEscola } from "./src/server/escolaRotas";
import { ArmazemPedidosMemoria, ArmazemPedidosPg, CentralDePedidos, tokenValido, urlDoSistema } from "./src/server/agentesEntreSistemas";
import { criarPresencaDono } from "./src/server/presencaDono";
import { SQL_ESCRITORIOS_CONTABIL, SQL_ORFAOS_CONTABIL, SQL_SINAIS_CONTABIL, agruparEscritorios as agruparEscritoriosPresenca } from "./src/server/presencaDonoContabil";
import { criarAtividadeEscritorio } from './src/server/atividadeEscritorio';
import { criarServicoTarefas, registrarRotasTarefasEquipe } from "./src/server/tarefasEquipe";
import { criarServicoMeuJeito, registrarRotasMeuJeito, type SessaoJeito } from "./src/server/meuJeito";
import { conferirApresentacao, resumoRelatorioApresentacao } from "./src/server/conferidorApresentacao";
import type { SessaoContabil } from './src/server/authContabil';
import { lerPerfilSaudacaoContabil, marcarSaudadoHojeContabil } from "./src/server/authContabil";
import { extrairNomeDaResposta, fraseDeApresentacao, fraseDeSaudacao } from "./src/server/agenteSaudacao";
import { opcoesConexaoBancoContabil, bancoTransacionalContabil } from "./src/server/authContabil";
import { removerEmpresaCompleta, sobrasDeEmpresasExcluidas } from "./src/server/exclusaoEmpresaCascata";
import { listarRegistroAgenteIAContabil, bancoContabilConfigurado, consultaBancoContabil, hashSessaoContabil, registrarAcaoAgenteIAContabil, listarDuvidasSemRespostaDonoSistemaContabil, resolverDuvidaSemRespostaDonoSistemaContabil } from "./src/server/authContabil";
import { definirTravasTesteContabil, criarSessaoPorIdContabil, sessaoDaRequisicaoContabil as sessaoTesteContabil } from "./src/server/authContabil";
import * as testeLocal from "./src/server/testeGratisLocal";
import { definirLimiteTesteMigracaoContabil } from "./src/server/migracaoSistemaAnterior/banco";
import { aproveitarBackupDoFiscalContabil } from "./src/server/dadosBackupDoFiscalContabil";
import { definirAlertaRobo, dispararRoboAgora, executarRobo, registrarResultadoRobo, registrarRobo, registrarRotinaManual, statusRobos, esperarRoboLivre, ultimoResultadoRobo } from "./src/server/robosStatus";
import { conferirEmpresasRepetidas } from "./src/server/conferidorEmpresaRepetida";
import { criarServicoBackupBanco } from "./src/server/backupBanco/servico";
import { buscarEmpresasDoFiscal, buscarResumoNotasFiscal, cnpjsValidosDoFiscal, pedirReenvioNotasFiscal } from "./src/server/empresasDoFiscal";
import { conferirVigencia, registrarRotasVigencia, rodarRoboVigencia, type EtapaVigencia } from "./src/server/vigenciaObrigacoesServidor";
import { conferenciasVigenciaContabil } from "./src/server/vigenciaConferenciasContabil";
import { conferirSincroniaEntidadesContabil, criarLigacaoFiscalEntidade, divergenciasEntidadeContabil, sincronizarEntidadesContabil } from "./src/server/entidadeSincroniaContabil";
import { rodarConferenciaOrigens, textoRoboOrigens, type DepsConferidorOrigens } from "./src/server/conferidorOrigens";
import { registrarRotasConferidorOrigens } from "./src/server/conferidorOrigensRotas";
import { completarPlanoPadraoContabil } from "./src/server/authContabil";
import { lerTodosDocumentosFiscais } from "./src/server/documentosFiscaisStore";
import { resumoRelatorioAcessos, rodarConferidorAcessos } from "./src/server/conferidorAcessos";
import { achadosEcdDoConferidor, rodarConferidorContabil } from "./src/server/conferidorContabil";
import { empresasParadas, situacaoEmpresasContabil, textoAvisoParadas } from "./src/server/conferidorEmpresasParadas";
import { registrarRotasDemonstracoes, rodarRoboDemonstracoes } from "./src/server/demonstracoesServidor";
import { registrarRotasDva, rodarConferidorDva } from "./src/server/dvaServidor";
import { conferirBackupsEscritorios } from "./src/server/conferidorBackupsContabil";
import { gerarBackupEscritorio, listarBackupsEscritorio, baixarBackupEscritorio, periodoDe } from "./src/services/backupEscritorioContabilService";
import { servicoBackupAgendadoContabil } from "./src/server/backupAgendadoContabil";
import { montarRotasBackupAgendado } from "./src/server/backupAgendado/rotas";
import { gerarCandidatosRascunhosAutomaticos, mesclarRascunhosNoWorkspace, prepararRascunhosContabeisAutomaticos } from "./src/server/prepararRascunhosContabeis";
import { respostaRapida } from "./src/server/respostasRapidas";
import { omitirXmlOriginal, resumirCoberturaXmlFiscal } from "./src/server/coberturaXmlFiscal";
import { montarServicoFeito } from "./src/server/servicoFeitoRotas";
import { criarStoreEscritorio, preencherCnpjsDosEscritorios, registrarRotasEscritorioConsultor } from "./src/server/escritorioConsultor";
import { conferirCadastrosDosEscritorios, registrarRotaCadastroEscritorioContabil } from "./src/server/cadastroEscritorioContabil";
import { criarStoreServicoCompleto, registrarRotasServicoCompleto, resumoRodadaServicos, rodarConferidorServicos, tenantServico, type ResultadoRodadaServicos } from "./src/server/servicoCompletoStore";
import { chaveServico, descreverRegistro, tenantDaSessao } from "./src/server/servicoFeito";
import { registrarRotasTitulosCartoes, roboTitulos } from "./src/server/titulosCartoesRotas";
import { conferirFiscoIaContabil, resumoConferidorFiscoIa } from "./src/server/conferidorFiscoIa";
import { conferirPagoAMaior, registrarRotasComparacaoRegimes, resumoPagoAMaior } from "./src/server/comparacaoRegimesServidor";
import { registrarRotasDocumentosLidos, conferirDocumentosLidos, resumoConferidorDocumentos, type LerComIA } from "./src/server/documentosLidosContabil";
import { registrarRotasEscrituracao, roboAjustesFechamento, roboConciliacao, roboConferidorExtratosPdf, roboEncerramento, roboLancamentosPadrao, roboLivroCaixa, roboPlanoEntidade } from "./src/server/escrituracaoRotas";
import { criarRevisorContabil, registrarRotasRevisor, INTERVALO_ROBO_REVISOR_MS } from "./src/server/revisorContabil";
import { conferirFolhasDP } from "./src/server/conferidorFolhaDP";
import { registrarRotasMigracaoSistemaAnterior, rotinaConferidorMigracao } from "./src/server/migracaoSistemaAnterior/rotas";
import { migracoesAtivasContabil, definirAoGravarEmpresaContabil } from "./src/server/migracaoSistemaAnterior/servico";
import { repo007Postgres, criarFila007, respostaMurad007, NOME_ROBO_007 } from "./src/server/agente007";
import { etapas007Contabil, assinatura007Contabil, painelCofre007Contabil } from "./src/server/agente007Contabil";
import { versaoMapaBackupContabil } from "./src/data/mapaBackupContabil";
import { descricaoGuarda } from "./src/server/migracaoRetomada";
import { estadoDdlProtegido } from "./src/server/ddlProtegido";
import { estaDesligando, instalarDesligamento } from "./src/server/desligamento";
import { obterSessaoContabil } from "./src/server/authContabil";
import { registrarRotasHistoricoContabil } from "./src/server/historicoLancamentosRotas";
import { ID_ROBO_HISTORICO, rotinaRoboHistorico } from "./src/server/historicoLancamentos";
import { workspaceValido } from "./src/server/authContabil";
import { planoContasModelo } from "./src/data/planoContasModelo";

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
// `perfil` (Agente): raciocínio e tamanho da resposta por tipo de pedido (src/data/agenteAgil.ts): mínimo nas perguntas simples.
async function gerarComReserva(ai: GoogleGenAI, base: { contents: any; systemInstruction: string; tools?: any[]; temperature?: number; perfil?: PerfilPedido; aoResponder?: (modelo: string) => void }, limiteMs = 12_000): Promise<any> {
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
        config: base.perfil
          ? (() => { const c = configDoPerfil(t.model, base.perfil); return { systemInstruction: base.systemInstruction, ...(aceitaTemperatura(t.model) ? { temperature: base.temperature ?? 0.2 } : {}), ...(t.tools ? { tools: t.tools } : {}), maxOutputTokens: c.maxOutputTokens, thinkingConfig: { thinkingLevel: c.thinkingLevel as any } }; })()
          : { systemInstruction: base.systemInstruction, temperature: base.temperature ?? 0.2, ...(t.tools ? { tools: t.tools } : {}), thinkingConfig: { thinkingLevel: "LOW" as any } },
      });
      const r = await Promise.race([chamada, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), base.perfil ? configDoPerfil(t.model, base.perfil).tempoRapidoMs : limiteMs).unref())]);
      base.aoResponder?.(t.model);
      return r;
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
  app.use("/api/painel-escritorio/entrega/recibo", express.json({ limit: "5mb" })); // recibo da ECD/ECF de até 3 MB, em base64
  app.use(express.json({ limit: "2mb" }));
  const sessaoAtividade = (req: express.Request) => (req as express.Request & { sessaoContabil?: SessaoContabil }).sessaoContabil;
  const atividadeEquipe = criarAtividadeEscritorio({ consultar: consultaBancoContabil, tabela: "contabil_atividade_equipe", sessao: sessaoAtividade, podeVer: (req) => sessaoAtividade(req)?.administrador === true });
  app.use("/api", atividadeEquipe.registrar);
  // Online / offline para o dono do sistema (Usuários e licenças › escritórios): último sinal de cada usuário logado.
  // Guarda só usuário, escritório, tela e horário (uma linha por usuário). Toda requisição com login conta como sinal
  // (gravado quando a resposta termina, depois de exigirSessaoContabil); o batimento POST /api/auth/presenca traz a tela.
  const presencaDono = criarPresencaDono({
    sistema: "Contábil", consultar: (sql, params) => consultaBancoContabil(sql, params ?? []), tabela: "contabil_presenca_dono",
    sqlSinais: SQL_SINAIS_CONTABIL, sqlOrfaos: SQL_ORFAOS_CONTABIL,
    listarEscritorios: async () => agruparEscritoriosPresenca((await consultaBancoContabil(SQL_ESCRITORIOS_CONTABIL, [])).rows),
    outros: [{ sistema: "DP", url: urlDoSistema("dp") }, { sistema: "Fiscal", url: urlDoSistema("fiscal") }],
    token: () => process.env.MURADE_INTEGRATION_TOKEN,
  });
  app.use("/api", (req, res, next) => {
    res.on("finish", () => {
      const s = sessaoAtividade(req);
      if (s && res.statusCode < 400) void presencaDono.registrarSinal({ userId: s.userId, tenantId: String(s.tenantId || s.escritorioDe || s.userId), login: s.login }, req.method === "POST" && req.path === "/auth/presenca" ? req.body?.tela : undefined);
    });
    next();
  });
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
  // Migração da parte contábil pelo backup do sistema anterior (tela Migração) + Robô Conferidor da Migração.
  registrarRotasMigracaoSistemaAnterior(app, {
    exigirSessao: exigirSessaoContabil, exigirOrigemNavegador, consultar: (sql, params) => consultaBancoContabil(sql, params),
    banco: bancoTransacionalContabil, preparar: prepararAuthContabil, bancoConfigurado: bancoContabilConfigurado,
    workspaceValido, cnpjValido: cnpjContabilValido, modelo: planoContasModelo,
    // Migração dos três sistemas: o DP repassa a parte contábil do backup (token de integração + login do dono do escritório).
    integracao: { autorizado: integracaoAutorizada, configurado: () => Boolean(process.env.MURADE_INTEGRATION_TOKEN), sessaoDoEscritorio: sessaoDoEscritorioParaIntegracaoContabil },
    robos: { executarRobo, registrarResultadoRobo, definirAlertaRobo },
  });
  registrarRobo({ id: "conferidor_migracao_sistema_anterior", nome: "Robô Conferidor da Migração do Sistema Anterior", posto: "conferidor", missao: "Conferir, em cada empresa migrada pelo backup do sistema anterior, se o balancete do Murad (lançamentos que vieram de lá) bate por conta e competência com os saldos e com os lançamentos originais do sistema anterior, e se nenhum lançamento migrado sumiu ou foi alterado; e, campo a campo, se cada campo preenchido no sistema anterior (cadastro da empresa, responsável, contador, contas, históricos, lançamentos e bens) chegou igual no Murad. Só lê e avisa; nunca altera nada.", intervaloMs: 6 * 60 * 60_000 });
  const rodarConferidorMigracao = rotinaConferidorMigracao({ consultar: (sql, params) => consultaBancoContabil(sql, params), preparar: prepararAuthContabil, bancoConfigurado: bancoContabilConfigurado, robos: { executarRobo, registrarResultadoRobo, definirAlertaRobo }, banco: bancoTransacionalContabil, workspaceValido });
  registrarRotinaManual("conferidor_migracao_sistema_anterior", rodarConferidorMigracao);
  setTimeout(() => void rodarConferidorMigracao(), 7 * 60_000).unref();
  setInterval(() => void rodarConferidorMigracao(), 6 * 60 * 60_000).unref();
  // Histórico guardado (empresa grande: exercícios antigos fora do documento) + Robô Conferidor do Histórico Guardado.
  registrarRotasHistoricoContabil(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params), banco: bancoTransacionalContabil, validar: (p) => workspaceValido(p) });
  registrarRobo({ id: "conferidor_historico_guardado", nome: "Robô Conferidor do Histórico Guardado", posto: "conferidor", missao: "Conferir, em cada empresa com exercícios antigos guardados no histórico (empresa grande), se o saldo transportado para os exercícios em aberto é exatamente a soma do histórico em todas as contas, se a marca do documento bate com o histórico e se nada do documento caiu no período guardado; refazer sozinho o saldo transportado quando o histórico está inteiro (é conta, não presunção); e guardar sozinho os exercícios de até dois anos atrás quando o documento da empresa passa de 85% do limite. Nunca apaga nada.", intervaloMs: 6 * 60 * 60_000 });
  const rodarRoboHistorico = rotinaRoboHistorico({ banco: bancoTransacionalContabil, consultar: (sql, params) => consultaBancoContabil(sql, params), validar: (p) => workspaceValido(p), bancoConfigurado: bancoContabilConfigurado, robos: { executarRobo, registrarResultadoRobo, definirAlertaRobo } });
  registrarRotinaManual(ID_ROBO_HISTORICO, rodarRoboHistorico);
  setTimeout(() => void rodarRoboHistorico(), 9 * 60_000).unref();
  setInterval(() => void rodarRoboHistorico(), 6 * 60 * 60_000).unref();
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
  app.post("/api/auth/presenca", exigirOrigemNavegador, exigirSessaoContabil, (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ sucesso: true }); });
  app.get("/api/auth/tenants/presenca", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (sessaoAtividade(req)?.donoSistema !== true) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema vê quem está online." });
    try { return res.json({ sucesso: true, ...(await presencaDono.painel()) }); }
    catch (erro) { console.error("Painel online/offline indisponível:", erro instanceof Error ? erro.message : erro); return res.status(503).json({ sucesso: false, motivo: "Não foi possível carregar quem está online." }); }
  });
  // Sinais do Contábil para o painel do dono no DP e no Fiscal. Só com o token de integração.
  app.get("/api/integracao/presenca-dono", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const token = process.env.MURADE_INTEGRATION_TOKEN;
    if (!token || !tokenValido(req.header("authorization"), token)) return res.status(token ? 401 : 503).json({ sucesso: false, motivo: "Credencial de integração inválida ou não configurada." });
    try { return res.json({ sucesso: true, sistema: "Contábil", sinais: await presencaDono.sinaisLocais(30) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Presença indisponível." }); }
  });
  // ---- TESTE GRÁTIS (o DP é a fonte da verdade; aqui: criar o escritório pela integração, entrada de uso único, faixa e travas) ----
  const consultarTesteContabil = (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params ?? []);
  if (bancoContabilConfigurado()) {
    definirTravasTesteContabil({
      limiteEmpresas: (escritorioId, cnpj) => testeLocal.checarLimiteLocal(consultarTesteContabil, "contabil", escritorioId, cnpj),
      encerrado: (escritorioId, metodo, caminho) => testeLocal.travaEncerradoLocal(consultarTesteContabil, "contabil", escritorioId, metodo, caminho),
    });
    definirLimiteTesteMigracaoContabil((escritorioId, cnpj) => testeLocal.checarLimiteLocal(consultarTesteContabil, "contabil", escritorioId, cnpj));
  }
  app.post("/api/integracao/teste-gratis/escritorio", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const token = process.env.MURADE_INTEGRATION_TOKEN;
    if (!token || !tokenValido(req.header("authorization"), token)) return res.status(token ? 401 : 503).json({ sucesso: false, motivo: "Credencial de integração inválida ou não configurada." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "O banco do Contábil não está configurado." });
    try { await prepararAuthContabil(); const r = await testeLocal.receberIntegracaoTeste(consultarTesteContabil, "contabil", req.body); return res.status(r.status).json(r.corpo); }
    catch (e: any) { console.error("Falha na integração do teste grátis (Contábil):", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "O Contábil não conseguiu concluir agora." }); }
  });
  app.get("/api/teste-gratis/entrar", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const userId = bancoContabilConfigurado() ? await testeLocal.trocarEntradaLocal(consultarTesteContabil, "contabil", req.query.t) : null;
      if (!userId || !(await criarSessaoPorIdContabil(req, res, userId))) return res.redirect(303, "/?teste=link-expirado");
      return res.redirect(303, "/");
    } catch (e: any) { console.error("Falha na entrada do teste grátis (Contábil):", e?.message || e); return res.redirect(303, "/?teste=link-expirado"); }
  });
  app.get("/api/teste-gratis/minha-situacao", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoTesteContabil(req);
    try { return res.json({ sucesso: true, ...(await testeLocal.situacaoLocal(consultarTesteContabil, "contabil", s ? String(s.tenantId || s.escritorioDe || s.userId) : null)) }); }
    catch { return res.json({ sucesso: true, emTeste: false }); }
  });
  app.post("/api/auth/tenants/invite", exigirOrigemNavegador, exigirSessaoContabil, convidarEscritorioContabil);
  app.post("/api/auth/tenants/:login/reenviar", exigirOrigemNavegador, exigirSessaoContabil, reenviarAcessoEscritorioContabil);
  app.post("/api/auth/tenants/:login/bloqueio", exigirOrigemNavegador, exigirSessaoContabil, bloquearEscritorioContabil);
  app.post("/api/auth/tenants/:login/limite", exigirOrigemNavegador, exigirSessaoContabil, definirLimiteEscritorioContabil);
  app.get("/api/auth/duvidas-supervisor", exigirSessaoContabil, listarDuvidasSemRespostaDonoSistemaContabil);
  app.post("/api/auth/duvidas-supervisor/:id/resolver", exigirOrigemNavegador, exigirSessaoContabil, resolverDuvidaSemRespostaDonoSistemaContabil);
  app.get("/api/workspaces", exigirSessaoContabil, listarWorkspacesContabil);
  // Painel "Prontos para conferir": por empresa do escritório (só os CNPJs da sessão), quantos pré-lançamentos o robô já preparou e o que está parado.
  app.get("/api/contabil/prontos-para-conferir", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "O banco do Contábil não está configurado." });
    try {
      const cnpjs = sessao.cnpjs.map(normalizarCnpjAcesso);
      const [resumo, situacao] = await Promise.all([resumoPreLancamentosPorEmpresaContabil(cnpjs), situacaoEmpresasContabil((sql, params) => consultaBancoContabil(sql, params), cnpjs)]);
      const paradas = new Map(empresasParadas(situacao).map((p) => [p.cnpj, p.motivo]));
      const empresas = resumo.map((e) => ({ ...e, parada: paradas.get(e.cnpj) ?? null }));
      return res.json({ sucesso: true, totalPendentes: empresas.reduce((t, e) => t + e.pendentes, 0), empresas });
    } catch (erro: any) {
      console.error("Falha ao montar o painel de pré-lançamentos:", erro?.message || erro);
      return res.status(503).json({ sucesso: false, motivo: "Não consegui consultar agora. Tente de novo em instantes." });
    }
  });
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

  // Rotina de publicar (e o dono): há gravação da migração pelo backup em andamento? E alteração de esquema adiada? Só números.
  // Bearer de integração (MURADE_INTEGRATION_TOKEN) ou sessão do dono do sistema.
  app.get("/api/manutencao/migracoes-ativas", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const dono = integracaoAutorizada(req) || (await obterSessaoContabil(req).catch(() => null))?.donoSistema === true;
    if (!dono) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema ou a integração consultam isto." });
    try {
      const m = await migracoesAtivasContabil();
      return res.json({ sucesso: true, sistema: "Murad Contábil", ...m, podePublicarSemPausar: m.emAndamento === 0, arquivoGuardadoEm: descricaoGuarda("contabil"), esquemaAdiado: estadoDdlProtegido(), desligando: estaDesligando() });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar agora." }); }
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
      integracao: "Murad Fiscal",
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil para receber documentos com persistência." });
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil para receber apurações com persistência." });
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

  // Do Fisco IA: guias, dívida ativa e parcelamentos que a pessoa consultou POR CLIQUE no Integra Contador (o Fisco IA lê a resposta oficial
  // e manda só os valores). Mesmo contrato e mesma guarda das apurações do Fiscal, com tributos próprios (FIA_*); vira pré-lançamento para
  // conferir na Revisão das origens, sem duplicar o que o Fiscal já mandou. Nunca cria lançamento definitivo.
  app.post("/api/integracao/fiscoia/apuracoes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!apuracoesStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
    const cnpj = normalizarCnpjAcesso(req.body?.cnpj);
    if (!cnpjContabilValido(cnpj)) return res.status(400).json({ sucesso: false, motivo: "CNPJ inválido." });
    if (req.body?.versaoContrato !== 1) return res.status(400).json({ sucesso: false, motivo: "Versão de contrato de integração não suportada." });
    try {
      if (!await verificarCnpjAutorizadoContabil(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Empresa não cadastrada no Contábil." });
      const resultado = await gravarApuracoesFiscais(cnpj, req.body?.apuracoes, "fiscoia");
      let rascunhos = { criados: 0, atualizados: 0, disponivel: true };
      try { rascunhos = { ...(await prepararRascunhosContabeisAutomaticos(cnpj)), disponivel: true }; }
      catch (error) { rascunhos = { criados: 0, atualizados: 0, disponivel: false }; console.error("Itens do Fisco IA salvos; a preparação dos pré-lançamentos ficou pendente:", error); }
      return res.json({ sucesso: true, cnpj, ...resultado, rascunhosContabeis: rascunhos, pendente: "Os pré-lançamentos aguardam o mapeamento de contas e a conferência do contador.", recebidoEm: new Date().toISOString() });
    } catch (error: any) {
      const status = error instanceof ErroValidacaoApuracaoFiscal ? 422 : 503;
      return res.status(status).json({ sucesso: false, motivo: error?.message || "Não foi possível guardar os itens do Fisco IA." });
    }
  });

  // Authenticated readback for server-to-server reconciliation only.
  app.get("/api/integracao/fiscal/apuracoes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");
    if (negarIntegracao(req, res)) return;
    if (!apuracoesStoreConfigurado()) {
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
      integracao: "Murad Departamento Pessoal",
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil para receber folhas agregadas com persistência." });
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
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
    if (!dpStoreConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
      return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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

  const modeloGeminiAgente = (): ModeloIA => async ({ instrucao, conteudos, declaracoes, perfil }) => {
    const ai = getAI();
    if (!ai) throw new Error("GEMINI_API_KEY não configurada.");
    let modelo = "";
    const response: any = await gerarComReserva(ai, { contents: conteudos as any, systemInstruction: instrucao, ...(declaracoes.length ? { tools: [{ functionDeclarations: declaracoes as any }] } : {}), temperature: 0.2, perfil: perfil || "simples", aoResponder: (m) => { modelo = m; } }, 15_000);
    const turno: any = response.candidates?.[0]?.content;
    const partes: any[] = Array.isArray(turno?.parts) ? turno.parts : [];
    return {
      texto: partes.filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join(""),
      chamadas: partes.filter((p) => p?.functionCall?.name).map((p) => ({ nome: String(p.functionCall.name), args: (p.functionCall.args || {}) as Record<string, any>, ...(p.functionCall.id ? { id: String(p.functionCall.id) } : {}) })),
      turnoModelo: turno,
      tokensPrompt: typeof response.usageMetadata?.promptTokenCount === "number" ? response.usageMetadata.promptTokenCount : undefined,
      modelo: modelo || undefined,
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
      // Central do Lucro Real: a Agente começa o dia pelos avisos vermelhos (sem confirmar, vencendo, vencidos, guia bloqueada).
      let lembreteLR = "";
      try {
        const ano = Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 4)); let n = 0; let primeiro = "";
        for (const cnpj of (await empresasLucroRealSaudacao(sessao.cnpjs.map((c: string) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "")))).slice(0, 50)) {
          const v = (await painelCentral(depsCentralLRSaudacao(), cnpj, ano)).alertas.filter((x) => x.nivel === "vermelho"); n += v.length; if (!primeiro && v[0]) primeiro = v[0].titulo;
        }
        if (n) lembreteLR = ` Atenção: ${n} aviso(s) vermelho(s) do Lucro Real. O primeiro: ${primeiro}. Quer que eu leia todos?`;
      } catch { /* a saudação nunca falha por causa do lembrete */ }
      return res.json({ sucesso: true, precisaNome: false, saudar: true, nome: perfil.nome, frase: fraseDeSaudacao(perfil.nome) + lembreteLR });
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
      return res.json({ sucesso: true, nome, frase: fraseDeApresentacao(nome) });
    } catch (error) { console.error("Falha ao gravar o nome da Agente IA do Contábil:", error instanceof Error ? error.message : error); return res.status(503).json({ sucesso: false, mensagem: "Não consegui gravar o nome agora." }); }
  });

  // Pedidos longos por etapas: texto completo guardado na memória, por escritório/usuário/sessão, por algumas horas.
  const etapasAgenteIA = new ArmazemDeEtapas();
  app.post("/api/ai/agente", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const inicioPedido = Date.now();
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ error: "Entre novamente para continuar." });
    ctx.inicioMs = inicioPedido;
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "Digite seu pedido." });
    const historico = Array.isArray(req.body?.historico)
      ? req.body.historico.filter((t: any) => t && (t.papel === "usuario" || t.papel === "ia") && typeof t.texto === "string").slice(-MAX_TURNOS_HISTORICO)
      : [];
    // "Me leva lá", "onde fica/como faço", "tem X?" e o "sim" depois de "Quer que eu te leve?": responde na hora, SEM IA. O plano só leva e destaca.
    const levarAgora = respostaLevarContabil(message, historico);
    if (levarAgora) {
      console.log(`[Agente tempo] sistema=contabil perfil=simples atalho=${levarAgora.levarAgora ? "levar" : "onde_fica"} total=${Date.now() - inicioPedido}ms modelo=0ms`);
      return res.json({ sucesso: true, resposta: levarAgora.resposta, acoes: [], whatsapp: [], ...(levarAgora.piloto ? (levarAgora.levarAgora ? { piloto: levarAgora.piloto } : { oferta: { rotulo: "Me leva lá", piloto: levarAgora.piloto } }) : {}) });
    }
    // Nunca recusa por tamanho: até 500.000 caracteres; acima disso lê o começo e avisa. Texto longo vai por etapas.
    if (!getAI()) return res.status(503).json({ error: "Agente indisponível: configure GEMINI_API_KEY no servidor." });
    if (!limiteUsoAgenteIA(ctx.sessaoHash)) return res.status(429).json({ error: "Muitos pedidos em pouco tempo. Aguarde alguns minutos." });
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
  // Depois do "faz certo": a tela pede para conferir de novo (só lê) e a Murad diz "Pronto, agora está certo." ou o que ainda falta.
  app.post("/api/ai/agente/reconferir", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const ctx = contextoAgenteIA(req);
    if (!ctx) return res.status(401).json({ sucesso: false });
    try {
      const r: any = await (FERRAMENTAS_CONFERE[0] as any).executar(ctx, { cnpj: String(req.body?.cnpj || "") });
      if (r?.erro) return res.json({ sucesso: false, frase: null });
      return res.json({ sucesso: true, frase: fraseDaReconferencia((r.achados || []).map((a: any) => String(a?.erro || a))) });
    } catch { return res.json({ sucesso: false, frase: null }); }
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
  // Extrato importado: na hora, confere os movimentos com as guias do aplicativo do cliente no Fiscal (baixa pelo extrato; ver baixaGuiasFiscal.ts).
  registrarRotasEscrituracao(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params), aoImportarExtrato: (cnpj) => { setTimeout(() => void enviarExtratoParaBaixa((sql, params) => consultaBancoContabil(sql, params), { cnpjs: [cnpj] }).catch((e) => console.error("Falha na baixa das guias pelo extrato:", e?.message || e)), 1_000).unref(); } });
  // Ler foto ou PDF de documento (recibo, boleto pago, nota de despesa, comprovante) → pré-lançamento para conferir (Lançamentos › Ler documento).
  // A IA só transcreve (modelo completo, temperatura 0); o servidor confere e o que não der para confiar fica em branco.
  const lerDocumentoComGemini = (): LerComIA | null => {
    const ai = getAI(); if (!ai) return null;
    return async (instrucao, arquivo) => {
      const chamada = ai.models.generateContent({
        model: process.env.GEMINI_MODEL_DOCUMENTO || process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: arquivo.mimeType, data: arquivo.dadosBase64 } }, { text: "Transcreva os dados deste documento conforme as regras." }] }] as any,
        config: { systemInstruction: instrucao, responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "MEDIUM" as any } },
      });
      const r: any = await Promise.race([chamada, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), 60_000).unref())]);
      return String(r?.text || "");
    };
  };
  // Comparação de regimes (estimativa) e recolhimento a maior: Gestão contábil › Regimes e pago a maior. A simulação do Simples fica no Fiscal.
  registrarRotasComparacaoRegimes(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params) });
  registrarRotasDocumentosLidos(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params), lerComIA: lerDocumentoComGemini });
  registrarRotasTitulosCartoes(app, { exigirOrigemNavegador, exigirSessaoContabil, consultar: (sql, params) => consultaBancoContabil(sql, params) });
  // Lucro Real: IRPJ/CSLL pela contabilidade + e-Lalur/e-Lacs (Partes A e B), estimativa (receita ou balancete) ou trimestral, DARF e JCP.
  const depsLucroReal = {
    consultar: (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params),
    lerWorkspace: async (cnpj: string) => (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null,
    competenciasFechadas: async (cnpj: string, ano: number) => new Set<string>((await consultaBancoContabil("SELECT competencia FROM contabil_period_closures WHERE cnpj=$1 AND competencia LIKE $2", [cnpj, `${ano}-%`])).rows.map((x: any) => String(x.competencia))),
    hoje: () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
    enviarProvisao: (cnpj: string, itens: any[]) => gravarApuracoesFiscais(cnpj, itens),
  };
  registrarRotasLucroReal(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, depsLucroReal);
  // DARF do Lucro Real com código de barras e PDF pelo Serpro: CONSOME CRÉDITO, só por clique depois do cartão. O pedido vai ao Murad
  // Fiscal (credencial e procuração ficam lá; o Fiscal só gera para o escritório dono da empresa). Ver src/server/darfSerproLucroReal.ts.
  registrarRotasDarfSerproLucroReal(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, acessoEmpresa, {
    consultar: depsLucroReal.consultar,
    periodo: async (cnpj, ano, periodo) => ({
      linha: (await listarApuracoesReal(depsLucroReal.consultar, cnpj, ano)).find((x) => x.periodo === periodo),
      tributosPagos: (await listarPagamentosReal(depsLucroReal.consultar, cnpj, ano)).filter((x) => x.periodo === periodo).map((x) => String(x.tributo)),
    }),
    bloqueio: (cnpj, ano, periodo) => periodoBloqueado(depsLucroReal.consultar, cnpj, ano, periodo),
    escritorioCnpj: async (tenantId) => { try { return String((await consultaBancoContabil("SELECT cnpj FROM contabil_escritorio_cnpj WHERE tenant_id=$1", [tenantId])).rows[0]?.cnpj || "") || null; } catch { return null; } },
    pedir: pedirDarfAoFiscal(),
  });
  // Arquivo morto das empresas excluídas (documentos com guarda legal, cifrados por escritório; só o admin recupera).
  registrarRotasArquivoMorto(app, {
    banco: bancoTransacionalContabil(), exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador, hoje: () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { tenantId: String(s.tenantId || s.escritorioDe || s.userId), administrador: s.administrador === true, donoSistema: s.donoSistema === true, cnpjs: s.cnpjs, login: s.login } : undefined; },
  });
  registrarRobo({ id: "prazo_guarda", nome: "Robô do Prazo de Guarda", posto: "conferidor", missao: "Uma vez por dia confere o prazo legal de guarda dos documentos das empresas excluídas (arquivo morto cifrado): avisa o administrador 60 dias antes de vencer e, vencido o prazo e passados 30 dias do aviso, apaga de vez — menos o que estiver marcado 'manter guardado' (processo ou parcelamento). Nunca abre nem mostra o conteúdo. Também passa as cópias antigas, sem cifra, para o arquivo morto.", intervaloMs: 24 * 60 * 60_000 });
  const rodarPrazoGuarda = () => void executarRobo("prazo_guarda", async () => {
    if (!bancoContabilConfigurado()) return;
    const banco = bancoTransacionalContabil();
    const migrados = await migrarArquivoAntigo(banco);
    const r = await rodarRoboPrazoGuarda(banco.consultar, new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));
    registrarResultadoRobo("prazo_guarda", `${r.resumo}${migrados ? ` ${migrados} cópia(s) antiga(s) passada(s) para o arquivo morto cifrado.` : ""}`);
  }).catch((e) => console.error("Falha no Robô do Prazo de Guarda:", e?.message || e));
  registrarRotinaManual("prazo_guarda", rodarPrazoGuarda);
  setTimeout(rodarPrazoGuarda, 170_000).unref();
  setInterval(rodarPrazoGuarda, 24 * 60 * 60_000).unref();
  // Central do Lucro Real: obrigações com vencimento, avisos que insistem até a confirmação e a baixa, conferidor Fiscal × DP × Contábil
  // (bloqueia a guia até o contador decidir) e o IRPJ/CSLL refeito por um segundo caminho.
  const empresasLucroReal = async (cnpjs?: string[]) => {
    const r = await consultaBancoContabil(`SELECT cnpj FROM contabil_company_workspaces WHERE (payload->'empresa'->>'regime') ILIKE '%real%'${cnpjs ? " AND cnpj = ANY($1::text[])" : ""} UNION SELECT cnpj FROM contabil_lucro_real_config${cnpjs ? " WHERE cnpj = ANY($1::text[])" : ""}`, cnpjs ? [cnpjs] : []).catch(() => ({ rows: [] as any[] }));
    return [...new Set(r.rows.map((x: any) => String(x.cnpj).trim()))];
  };
  const depsCentralLR = { consultar: depsLucroReal.consultar, hoje: depsLucroReal.hoje, lerWorkspace: depsLucroReal.lerWorkspace };
  centralLRParaSaudacao = { deps: depsCentralLR, empresas: empresasLucroReal };
  // Aviso no celular da Central (pelo mecanismo de aviso do Fiscal) e retenções como tomadora (rascunho da EFD-Reinf do Fiscal).
  const horaSP = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const itensAvisoLR = async (cnpjs: string[]): Promise<ItemAvisoLR[]> => {
    const ano = Number(depsLucroReal.hoje().slice(0, 4)); const out: ItemAvisoLR[] = [];
    for (const cnpj of cnpjs) {
      try { const p = await depsCentralLR.lerWorkspace(cnpj); out.push({ cnpj, razaoSocial: String(p?.empresa?.razaoSocial || p?.empresa?.nome || cnpj), alertas: (await painelCentral(depsCentralLR, cnpj, ano)).alertas }); }
      catch (e: any) { console.error("[aviso celular lucro real]", cnpj, e?.message || e); }
    }
    return out;
  };
  const enviarAvisosLR = async (cnpjs: string[], manual: boolean) => enviarAvisosCelular(depsLucroReal.consultar, await itensAvisoLR(cnpjs), enviarPeloFiscal(), depsLucroReal.hoje(), horaSP(), manual);
  const atualizarRetencoesLR = async (cnpj: string, ano: number) => { const meses = await buscarRetencoesNoFiscal(cnpj, ano); await gravarRetencoes(depsLucroReal.consultar, cnpj, ano, meses); return meses.length; };
  registrarRotasCentralLucroReal(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, { ...depsCentralLR, sessao: (req) => sessaoDaRequisicaoContabil(req) ?? undefined, empresasLucroReal: (cnpjs) => empresasLucroReal(cnpjs), negarIntegracao, enviarAvisosAgora: (cnpjs) => enviarAvisosLR(cnpjs, true), atualizarRetencoes: atualizarRetencoesLR });
  registrarRobo({ id: "aviso_celular_lucro_real", nome: "Robô do Aviso no Celular do Lucro Real", posto: "integrador", missao: "De 2 em 2 horas (a partir das 8h de Brasília), manda para o celular do contador, uma vez por dia por empresa, os avisos da Central do Lucro Real (sem confirmar, vencendo em 10, 5, 3 e 1 dia, no dia, atrasado, guia bloqueada) — sem valores na tela bloqueada. Usa o mesmo aviso do Murad Fiscal (Central Anti-Multa: mesmos aparelhos, silêncio e horário silencioso); cada escritório só recebe as suas empresas. Conferidor: depois das 10h, empresa com aviso vermelho sem aviso entregue ao Fiscal hoje, ou sem ninguém com o aviso ativado no aparelho, vira ATENÇÃO. Só avisa; nunca paga nem transmite.", intervaloMs: 2 * 60 * 60_000 });
  const rodarAvisoCelularLR = (manual = false) => void executarRobo("aviso_celular_lucro_real", async () => {
    if (!bancoContabilConfigurado()) return;
    const cnpjs = await empresasLucroReal(); const hoje = depsLucroReal.hoje(); const h = horaSP();
    const itens = await itensAvisoLR(cnpjs);
    const r = await enviarAvisosCelular(depsLucroReal.consultar, itens, enviarPeloFiscal(), hoje, h, manual);
    const c = await conferirAvisosCelular(depsLucroReal.consultar, itens, hoje, h);
    const partes = [`${r.empresas} empresa(s) do Lucro Real; ${r.comAviso} com aviso hoje; ${r.entregues} aviso(s) entregue(s) no celular agora; ${r.jaEnviados} já avisada(s) hoje.`];
    if (!manual && h < 8) partes.push("Antes das 8h de Brasília o aviso não sai (sai na primeira rodada depois das 8h).");
    if (r.falhasFiscal) partes.push(`${r.falhasFiscal} empresa(s) sem aviso porque o Fiscal não respondeu (${r.erros.join("; ")}); tenta de novo na próxima rodada.`);
    if (c.semEnvio.length) partes.push(`Conferidor: ${c.semEnvio.length} empresa(s) com aviso vermelho e sem aviso no celular hoje (${c.semEnvio.slice(0, 5).join(", ")}).`);
    if (c.semAparelho.length) partes.push(`Conferidor: ninguém ativou o aviso no aparelho para ${c.semAparelho.slice(0, 5).join(", ")} — ative em Murad Fiscal › Federal & Simples › Central Anti-Multa › "Ativar avisos neste aparelho".`);
    registrarResultadoRobo("aviso_celular_lucro_real", `${r.falhasFiscal || c.semEnvio.length || c.semAparelho.length ? "ATENÇÃO: " : ""}${partes.join(" ")}`);
  }).catch((e) => console.error("Falha no Robô do Aviso no Celular do Lucro Real:", e?.message || e));
  registrarRotinaManual("aviso_celular_lucro_real", () => rodarAvisoCelularLR(true));
  setTimeout(() => rodarAvisoCelularLR(false), 300_000).unref();
  setInterval(() => rodarAvisoCelularLR(false), 2 * 60 * 60_000).unref();
  registrarRobo({ id: "retencoes_lucro_real", nome: "Robô das Retenções do Lucro Real", posto: "coletor", missao: "De 2 em 2 horas busca no Murad Fiscal (rascunho da EFD-Reinf, R-4020, pelas NFS-e tomadas) o IRRF e a CSLL/COFINS/PIS retidos pela empresa do Lucro Real como tomadora de serviço, mês a mês, e põe na Central do Lucro Real como obrigação com o vencimento oficial (último dia útil do 2º decêndio do mês seguinte ao do pagamento — Lei 11.196/2005, art. 70, I, \"e\"; Lei 10.833/2003, art. 35). Conferidor: avisa quando o Fiscal não responde ou quando o rascunho tem nota com pendência. Só lê; nunca paga nem transmite.", intervaloMs: 2 * 60 * 60_000 });
  const rodarRetencoesLR = () => void executarRobo("retencoes_lucro_real", async () => {
    if (!bancoContabilConfigurado()) return;
    const ano = Number(depsLucroReal.hoje().slice(0, 4)); let ok = 0, falhas = 0, meses = 0, comPend = 0; const erros: string[] = [];
    const lista = await empresasLucroReal();
    for (const cnpj of lista) {
      for (const a of [ano - 1, ano]) {
        try { const m = await buscarRetencoesNoFiscal(cnpj, a); await gravarRetencoes(depsLucroReal.consultar, cnpj, a, m); meses += m.filter((x) => x.irCentavos + x.csllCentavos + x.pisCentavos + x.cofinsCentavos > 0).length; comPend += m.filter((x) => x.pendencias > 0).length; ok += 1; }
        catch (e: any) { falhas += 1; if (erros.length < 2) erros.push(String(e?.message || e).slice(0, 100)); }
      }
    }
    registrarResultadoRobo("retencoes_lucro_real", `${falhas || comPend ? "ATENÇÃO: " : ""}${lista.length} empresa(s) do Lucro Real; ${meses} mês(es) com retenção como tomadora na Central.${comPend ? ` ${comPend} mês(es) com nota pendente no rascunho da EFD-Reinf do Fiscal (tela SPED de lá).` : ""}${falhas ? ` ${falhas} leitura(s) sem resposta do Fiscal (${erros.join("; ")}); a Central mantém o último valor lido.` : ""}`);
  }).catch((e) => console.error("Falha no Robô das Retenções do Lucro Real:", e?.message || e));
  registrarRotinaManual("retencoes_lucro_real", rodarRetencoesLR);
  setTimeout(rodarRetencoesLR, 240_000).unref();
  setInterval(rodarRetencoesLR, 2 * 60 * 60_000).unref();
  registrarRobo({ id: "central_lucro_real", nome: "Robô Conferidor da Central do Lucro Real", posto: "conferidor", missao: "De 2 em 2 horas, em cada empresa do Lucro Real (cada escritório só vê as suas): lista todas as obrigações (IRPJ/CSLL, PIS/COFINS não cumulativos, DCTFWeb, EFD-Contribuições até 12/2026, ECD e ECF, IRRF sobre JCP registrado — DARF 5706 — e as retenções feitas como tomadora — IRRF e CSRF 5952) com vencimento e fonte; confere a receita do balancete com as notas de saída do Fiscal, a folha do DP com o contabilizado e se o PIS/COFINS do mês foi confirmado no Fiscal; refaz o IRPJ/CSLL por um segundo caminho e, se não der igual ao centavo, avisa. Diferença aberta BLOQUEIA a guia até o contador decidir (o IRPJ/CSLL aqui e o DARF de PIS/COFINS no Fiscal, que pergunta à Central antes de confirmar). Avisa todo dia o que não foi confirmado e aos 10, 5, 3 e 1 dia, no dia e todo dia de atraso (com multa e juros estimados, Lei 9.430/96, art. 61). Uma vez por dia lê a Selic oficial no Banco Central (SGS 4390). Só lê; nunca paga nem transmite.", intervaloMs: 2 * 60 * 60_000 });
  let ultimaSelicLR = "";
  const rodarCentralLR = () => void executarRobo("central_lucro_real", async () => {
    if (!bancoContabilConfigurado()) return;
    const hoje = depsLucroReal.hoje(); let selicTxt = "";
    if (ultimaSelicLR !== hoje) {
      try { const n = await atualizarSelicContabil(depsLucroReal.consultar, async (url) => { const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }); ultimaSelicLR = hoje; selicTxt = ` Selic oficial lida no Banco Central (${n} mês(es)).`; }
      catch (e: any) { selicTxt = ` A Selic do Banco Central não respondeu (${String(e?.message || e).slice(0, 80)}); juros de atraso podem ficar sem estimativa até a próxima rodada.`; }
    }
    const r = await rodarCentralLucroReal(depsCentralLR, () => empresasLucroReal());
    registrarResultadoRobo("central_lucro_real", `${r.alertasVermelhos || r.divergencias || r.doisCaminhos ? "ATENÇÃO: " : ""}${r.resumo}${selicTxt}`);
  }).catch((e) => console.error("Falha no Robô Conferidor da Central do Lucro Real:", e?.message || e));
  registrarRotinaManual("central_lucro_real", rodarCentralLR);
  setTimeout(rodarCentralLR, 260_000).unref();
  setInterval(rodarCentralLR, 2 * 60 * 60_000).unref();
  // Alerta urgente de vencimento do Contábil (ECD, ECF, IRPJ/CSLL do Lucro Real, IRRF sobre JCP): mesmo padrão do Fiscal e do DP —
  // equipe inteira pelo aviso no celular do Fiscal, insistência às 7h, 12h e 16h30 no dia, todo dia no atraso, multa se não resolver
  // hoje, "Resolvido" e liga/desliga por tipo em Configurações.
  const alertaUrgenteContabil = registrarAlertaUrgenteContabil(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    ...depsCentralLR,
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { cnpjs: s.cnpjs, login: s.login, tenantId: String(s.tenantId || s.escritorioDe || s.userId) } : undefined; },
    empresasLucroReal: (cnpjs) => empresasLucroReal(cnpjs),
    todasEmpresas: async (cnpjs) => [...new Set((await consultaBancoContabil(`SELECT cnpj FROM contabil_company_workspaces${cnpjs ? " WHERE cnpj = ANY($1::text[])" : ""}`, cnpjs ? [cnpjs] : []).catch(() => ({ rows: [] as any[] }))).rows.map((x: any) => String(x.cnpj).trim()))],
    // Primeiro os aparelhos ativados no próprio Contábil; quem não recebeu aqui recebe pelo Fiscal, como antes (sem aviso em dobro).
    enviar: () => enviarUrgenteContabilEFiscal(consultaBancoContabil, enviarUrgentePeloFiscal()),
  });
  // "Ativar avisos neste aparelho" do próprio Contábil (antes o botão abria o Murad Fiscal): chave pública, assinar, cancelar, testar
  // e o registro da etapa que falhou (só log, sem dado do aparelho). Cada pessoa só mexe nos próprios aparelhos.
  app.get("/api/avisos-aparelho/chave", exigirSessaoContabil, (_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.json({ sucesso: true, ativo: pushConfiguradoContabil(), chave: chavePublicaContabil() }); });
  app.get("/api/avisos-aparelho/situacao", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    try { return res.json({ sucesso: true, servidorConfigurado: pushConfiguradoContabil(), aparelhos: await aparelhosDoUsuario(consultaBancoContabil, s.userId) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível conferir agora." }); }
  });
  app.post("/api/avisos-aparelho/assinar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    try { await assinarAparelho(consultaBancoContabil, s.userId, req.body?.assinatura); return res.json({ sucesso: true }); }
    catch (e: any) { return res.status(400).json({ sucesso: false, motivo: e?.message || "Não foi possível ativar os avisos." }); }
  });
  app.post("/api/avisos-aparelho/cancelar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    try { await cancelarAparelho(consultaBancoContabil, s.userId, String(req.body?.endpoint || "")); return res.json({ sucesso: true }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível desativar." }); }
  });
  app.post("/api/avisos-aparelho/testar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    if (!pushConfiguradoContabil()) return res.json({ sucesso: false, motivo: "O servidor ainda não tem as chaves de aviso (VAPID) configuradas no Render." });
    try {
      const r = await enviarAoUsuario(consultaBancoContabil, s.userId, { titulo: "Teste do aviso do Murad Contábil", corpo: "Se você recebeu este aviso, este aparelho está pronto para os vencimentos do Contábil.", tag: "contabil-teste" });
      return res.json({ sucesso: r.enviados > 0, enviados: r.enviados, motivo: r.aparelhos === 0 ? "Este usuário ainda não ativou o aviso em nenhum aparelho." : r.enviados === 0 ? "O aviso não chegou ao aparelho; tente ativar de novo." : "" });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível enviar o teste." }); }
  });
  app.post("/api/avisos-aparelho/falha", exigirOrigemNavegador, exigirSessaoContabil, (req, res) => {
    console.warn(`[Avisos no aparelho] ${linhaFalhaAvisoAparelho(req.body, req.get("user-agent"))}`);
    return res.json({ sucesso: true });
  });
  registrarRobo({ id: "alerta_urgente_contabil", nome: "Robô do Alerta Urgente de Vencimento do Contábil", posto: "conferidor", missao: "De 30 em 30 minutos, em cada empresa (cada escritório só as suas), avisa a equipe inteira no celular (nos aparelhos ativados no próprio Contábil e, para quem ainda não ativou aqui, pelo aviso do Murad Fiscal, sem aviso em dobro) dos vencimentos do Contábil — ECD, ECF, IRPJ/CSLL do Lucro Real (DARF 2362, 2484, trimestrais e ajuste) e IRRF sobre JCP (DARF 5706): 7, 3 e 1 dia antes; no dia às 7h, ao meio-dia e às 16h30; e todo dia no atraso (até 30 dias), com o motivo, o passo a passo e a multa se não resolver hoje pelos cálculos oficiais. Respeita quem desligou o tipo em Configurações e o \"Resolvido\". Conferidor: vencimento sem aviso aceito pelo Fiscal ou sem ninguém com o aparelho ativado vira ATENÇÃO. Só avisa; nunca paga, transmite nem faz consulta paga.", intervaloMs: 30 * 60_000 });
  const rodarAlertaUrgenteContabil = () => void executarRobo("alerta_urgente_contabil", async () => {
    if (!bancoContabilConfigurado()) return;
    const t = await alertaUrgenteContabil.rodarRobo();
    definirAlertaRobo("alerta_urgente_contabil", t.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: t } : null);
    registrarResultadoRobo("alerta_urgente_contabil", t);
  }).catch((e) => console.error("Falha no Robô do Alerta Urgente do Contábil:", e?.message || e));
  registrarRotinaManual("alerta_urgente_contabil", rodarAlertaUrgenteContabil);
  setTimeout(rodarAlertaUrgenteContabil, 280_000).unref();
  setInterval(rodarAlertaUrgenteContabil, 30 * 60_000).unref();
  registrarRobo({ id: "lucro_real", nome: "Robô do Lucro Real", posto: "calculador", missao: "Apurar sozinho o IRPJ e a CSLL do Lucro Real de cada empresa configurada (estimativa mensal pela receita ou pelo balancete de suspensão/redução, ou trimestral), com e-Lalur/e-Lacs e saldos de prejuízo fiscal e base negativa, deixando tudo pronto para a contadora confirmar. Nunca confirma, paga nem transmite.", intervaloMs: 6 * 60 * 60_000 });
  const rodarRoboLucroRealAgora = () => void executarRobo("lucro_real", async () => {
    if (!bancoContabilConfigurado()) return;
    const r = await rodarRoboLucroReal(depsLucroReal, async () => (await consultaBancoContabil("SELECT cnpj FROM contabil_lucro_real_config", [])).rows.map((x: any) => String(x.cnpj)));
    registrarResultadoRobo("lucro_real", r.resumo);
  }).catch((e) => console.error("Falha no Robô do Lucro Real:", e?.message || e));
  registrarRotinaManual("lucro_real", rodarRoboLucroRealAgora);
  registrarRobo({ id: "conferidor_darf_serpro_lr", nome: "Robô Conferidor do DARF pelo Serpro (Lucro Real)", posto: "conferidor", missao: "De 2 em 2 horas confere se cada DARF do IRPJ/CSLL já gerado pelo Serpro ainda bate com a apuração confirmada (período reaberto ou valor mudado deixam o código de barras velho) e se algum vencido continua sem o pagamento registrado. Só lê e avisa: nunca gera DARF nem consulta o Serpro, que é só por clique.", intervaloMs: 2 * 60 * 60_000 });
  const rodarConferidorDarfSerpro = () => void executarRobo("conferidor_darf_serpro_lr", async () => {
    if (!bancoContabilConfigurado()) return;
    const r = await conferirDarfsSerpro((sql, params) => consultaBancoContabil(sql, params));
    registrarResultadoRobo("conferidor_darf_serpro_lr", r.resumo);
    if (r.alerta) console.warn(`Robô Conferidor do DARF pelo Serpro: ${r.resumo}`);
  }).catch((e) => console.error("Falha no Robô Conferidor do DARF pelo Serpro:", e?.message || e));
  registrarRotinaManual("conferidor_darf_serpro_lr", rodarConferidorDarfSerpro);
  setTimeout(rodarConferidorDarfSerpro, 19 * 60_000).unref();
  setInterval(rodarConferidorDarfSerpro, 2 * 60 * 60_000).unref();
  setTimeout(rodarRoboLucroRealAgora, 150_000).unref();
  setInterval(rodarRoboLucroRealAgora, 6 * 60 * 60_000).unref();
  // CNPJ do escritório e liberação do adicional "Consultor Murade completo" (Consultor + serviço completo), por escritório.
  registrarRotasEscritorioConsultor(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    store: storeEscritorio,
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { tenantId: String(s.tenantId || s.escritorioDe || s.userId), podeEditar: s.administrador === true || s.donoSistema === true } : undefined; },
  });
  // ESCOLA MURADE (adicional pago): trilhas, aulas, simulador de treino (nunca grava dado real), provas e painel do gestor.
  // Só tabelas contabil_escola_*; liberação pelo CNPJ do escritório no consultor (Agente IA), com cache de 10 minutos.
  const escolaMurade = registrarRotasEscola({
    app: { get: (c, ...h) => app.get(c, ...h), post: (c, ...h) => app.post(c, exigirOrigemNavegador, ...h) }, exigirSessao: exigirSessaoContabil,
    sessao: (req) => { const s = sessaoDaRequisicaoContabil(req); return s ? { userId: s.userId, login: s.login, tenantId: String(s.tenantId || s.escritorioDe || s.userId), administrador: s.administrador === true, donoSistema: s.donoSistema === true } : undefined; },
    consultar: (sql, params) => consultaBancoContabil(sql, params ?? []) as any, bancoConfigurado: bancoContabilConfigurado,
    liberacao: { env: process.env, fetch: (url, init) => fetch(url, init) as any },
    cnpjDoEscritorio: (tenantId) => storeEscritorio.lerOuDescobrir(tenantId),
    escritorioDoDono: async (tenantId) => {
      const lista = (process.env.MURADE_DONO_SISTEMA || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      const r = lista.length
        ? await consultaBancoContabil("SELECT 1 FROM contabil_auth_users WHERE id::text=$1 AND global_admin=true AND disabled=false AND lower(login)=ANY($2::text[])", [tenantId, lista])
        : await consultaBancoContabil("SELECT 1 FROM (SELECT id FROM contabil_auth_users WHERE global_admin=true ORDER BY created_at, id LIMIT 1) d WHERE d.id::text=$1", [tenantId]);
      return r.rows.length > 0;
    },
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
      await criarWorkspacesQueFaltamContabil([cnpj]); // empresa sem workspace ganha o plano padrão antes de reprocessar
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
  // Backup agendado do escritório (tela "Backup"): agenda todo dia/semana/mês, completo ou só alterações, arquivo próprio
  // .murade cifrado com a chave do escritório, conferência depois do backup, nuvem do cliente (S3), avisos e restauração.
  // Administrador do escritório = dono da conta do escritório (administrador e tenantId igual ao próprio id).
  montarRotasBackupAgendado(app, "/api/contabil/backup-agendado", servicoBackupAgendadoContabil, (req) => {
    const s = sessaoDaRequisicaoContabil(req);
    if (!s?.tenantId || !bancoContabilConfigurado()) return null;
    const administrador = s.administrador === true && String(s.tenantId) === String(s.userId);
    return { tenantId: String(s.tenantId), login: s.login, administrador, equipe: !administrador && Boolean(s.escritorioDe || s.administrador) };
  }, { leitura: [exigirSessaoContabil], escrita: [exigirOrigemNavegador, exigirSessaoContabil] });
  // O backup mensal por escritório acima continua igual; este é o do sistema inteiro, cifrado, em destino S3-compatível.
  const servicoBackupBanco = criarServicoBackupBanco({ sistema: "contabil", nomeSistema: "Murad Contábil", consulta: (sql, params) => consultaBancoContabil(sql, params), conexaoBanco: () => opcoesConexaoBancoContabil() });
  const exigirDonoBackupBanco = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "private, no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!sessao.donoSistema) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema acessa o backup completo do banco." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "Configure DATABASE_URL no serviço Murad Contábil." });
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
  registrarRobo({ id: "mensageiro", nome: "Robô Mensageiro", posto: "integrador", missao: "Reenviar pedidos entre as Agentes dos sistemas Murad que não chegaram ao destino.", intervaloMs: 60_000 });
  registrarRobo({ id: "conferidor", nome: "Robô Conferidor", posto: "conferidor", missao: "Conferir todas as empresas: o que falta para fechar o mês (aprovações, rascunhos do Fiscal e do DP, depreciação, partidas) e se a ECD do ano anterior já está pronta para o contador (Balanço, DRE, assinaturas, plano referencial), deixando o resultado para a tela e para a Agente.", intervaloMs: 30 * 60_000 });
  const rodarConferidor = () => executarRobo("conferidor", async () => {
    const r = await rodarConferidorContabil((sql, params) => consultaBancoContabil(sql, params));
    // Também confere se alguma empresa está parada no Contábil (sem workspace, ou com notas/folha e sem pré-lançamento).
    const paradas = empresasParadas(await situacaoEmpresasContabil((sql, params) => consultaBancoContabil(sql, params)).catch(() => []));
    definirAlertaRobo("conferidor", paradas.length ? { nivel: "aviso", texto: textoAvisoParadas(paradas) } : null);
    registrarResultadoRobo("conferidor", `${r.empresas} empresa(s) conferida(s) para o fechamento; ${r.comPendencia} com pendência; ${paradas.length} empresa(s) parada(s) no Contábil.`);
  }).catch((e) => console.error("Falha no Robô Conferidor:", e?.message || e));
  setTimeout(() => void rodarConferidor(), 45_000).unref();
  setInterval(() => void rodarConferidor(), 30 * 60_000).unref();
  // Robô Conferidor das Origens: Fiscal × DP × Contábil por empresa e mês, ao centavo, em TODAS as empresas de todos os escritórios.
  registrarRobo({ id: "conferidor_origens", nome: "Robô Conferidor das Origens (Fiscal × DP × Contábil)", posto: "conferidor", missao: "De hora em hora confere, empresa por empresa e mês a mês, se toda nota que vale no Fiscal chegou ao Contábil e virou pré-lançamento ou lançamento (contagem e total ao centavo), se cada nota de fora tem motivo, e se a folha do DP bate item a item com as partidas. Nota cancelada, substituída, denegada ou inutilizada nunca entra: o pré-lançamento pendente sai e a já lançada vira alerta vermelho com o estorno sugerido. Corrige sozinho só o seguro (pede de novo a nota ou a folha que não chegou, prepara o pré-lançamento que faltou, completa o plano provisório só acrescentando). Nunca aprova, lança, estorna nem apaga lançamento.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const depsConferidorOrigens = (): DepsConferidorOrigens => ({
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    lerWorkspace: async (cnpj) => (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null,
    lerDocumentos: async (cnpj) => (fiscalStoreConfigurado() ? await lerTodosDocumentosFiscais(cnpj) : []),
    resumoFiscal: (cnpj, competencia) => buscarResumoNotasFiscal(cnpj, competencia),
    reenviarFiscal: (cnpj, chaves) => pedirReenvioNotasFiscal(cnpj, chaves),
    preparar: (cnpj) => prepararRascunhosContabeisAutomaticos(cnpj),
    completarPlano: (cnpj, automatico) => completarPlanoPadraoContabil(cnpj, automatico),
  });
  const rodarConferidorOrigens = () => executarRobo("conferidor_origens", async () => {
    const r = await consultaBancoContabil("SELECT cnpj FROM contabil_company_workspaces UNION SELECT cnpj FROM contabil_auth_company_access ORDER BY 1", []);
    const cnpjs = [...new Set(r.rows.map((x: any) => normalizarCnpjAcesso(x.cnpj)).filter((c: string) => cnpjContabilValido(c)))];
    const placar = await rodarConferenciaOrigens(depsConferidorOrigens(), cnpjs, "todas");
    registrarResultadoRobo("conferidor_origens", textoRoboOrigens(placar));
    definirAlertaRobo("conferidor_origens", placar.alertasEstorno || placar.semExplicacao ? { nivel: "critico", texto: textoRoboOrigens(placar) } : placar.erro ? { nivel: "aviso", texto: textoRoboOrigens(placar) } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor das Origens:", e?.message || e));
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarConferidorOrigens(), 3 * 60_000).unref();
    setInterval(() => void rodarConferidorOrigens(), 60 * 60_000).unref();
  }
  registrarRotinaManual("conferidor_origens", rodarConferidorOrigens);
  registrarRotasConferidorOrigens(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    sessao: (req) => {
      const s = sessaoDaRequisicaoContabil(req);
      if (!s) return undefined;
      return { login: s.login, cnpjs: s.cnpjs.map(normalizarCnpjAcesso), tenantId: tenantServico(s), podeEscrever: (c: string) => s.administrador || s.memberships.find((m) => normalizarCnpjAcesso(m.cnpj) === c)?.role !== "viewer" };
    },
    conferidor: depsConferidorOrigens,
  });
  registrarRobo({ id: "empresas_fiscal", nome: "Robô de Empresas do Fiscal", posto: "integrador", missao: "Trazer do Murad Fiscal as empresas que ainda não estão no Contábil, para a equipe não cadastrar duas vezes. Não altera o que já existe e não leva certificado nem senha.", intervaloMs: 10 * 60_000 });
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
  setInterval(() => void rodarEmpresasFiscal(), 10 * 60_000).unref();
  app.post("/api/empresas/importar-do-fiscal", exigirSessaoContabil, async (req, res) => {
    if (!sessaoDaRequisicaoContabil(req)?.donoSistema) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema pode trazer as empresas do Fiscal." });
    try { const r = await sincronizarEmpresasDoFiscal(); return res.status(r.ok ? 200 : 502).json({ sucesso: r.ok, ...r }); }
    catch (e: any) { return res.status(500).json({ sucesso: false, motivo: e?.message || "Falha ao importar." }); }
  });
  // Marca de entidade imune/isenta (tipo, certificação e validade) entre Fiscal, DP e Contábil: em branco recebe; diferente vira aviso.
  let ultimaSincroniaEntidades: { em: string | null; ok: boolean } = { em: null, ok: false };
  registrarRobo({ id: "sincronia_entidades", nome: "Robô de Sincronia de Entidades (Fiscal, DP e Contábil)", posto: "integrador", missao: "De hora em hora lê no Murad Fiscal a marca de entidade imune ou isenta (com a certificação de entidade beneficente e a validade) feita no Fiscal ou no DP e preenche no Contábil só o que está em branco, na empresa que já existe (nunca cria nem duplica empresa). Se aqui foi marcado à mão algo diferente, não sobrescreve: guarda o aviso em Cadastro de Empresa. Manda ao Fiscal as marcas feitas no Contábil, para chegarem ao DP. Com a marca, o plano de contas da entidade e a Demonstração do Superávit ou Déficit vêm sozinhos. Nunca mexe em lançamento.", intervaloMs: 60 * 60_000 });
  const sincronizarEntidadesAgora = async (cnpjs?: string[]) => {
    const r = await sincronizarEntidadesContabil((sql, params) => consultaBancoContabil(sql, params), { ...criarLigacaoFiscalEntidade(), ...(cnpjs ? { cnpjs } : {}) });
    if (!cnpjs) ultimaSincroniaEntidades = { em: new Date().toISOString(), ok: r.ok };
    return r;
  };
  const rodarSincroniaEntidades = () => bancoContabilConfigurado() ? executarRobo("sincronia_entidades", async () => {
    const r = await sincronizarEntidadesAgora();
    registrarResultadoRobo("sincronia_entidades", r.motivo);
    if (!r.ok) throw new Error(r.motivo);
  }).catch((e) => console.error("Falha no Robô de Sincronia de Entidades:", e?.message || e)) : undefined;
  setTimeout(() => void rodarSincroniaEntidades(), 230_000).unref();
  setInterval(() => void rodarSincroniaEntidades(), 60 * 60_000).unref();
  registrarRobo({ id: "conferidor_sincronia_entidades", nome: "Robô Conferidor da Sincronia de Entidades", posto: "conferidor", missao: "De duas em duas horas confere, só em leitura, se a sincronia da marca de entidade imune/isenta com o Fiscal e o DP rodou com sucesso nas últimas 3 horas e se alguma empresa está com a marca diferente entre os sistemas (e há quanto tempo). Avisa no painel dos robôs e em Cadastro de Empresa. Nunca sobrescreve nada.", intervaloMs: 2 * 60 * 60_000 });
  const rodarConferidorSincroniaEntidades = () => bancoContabilConfigurado() ? executarRobo("conferidor_sincronia_entidades", async () => {
    const r = await conferirSincroniaEntidadesContabil((sql, params) => consultaBancoContabil(sql, params), ultimaSincroniaEntidades);
    registrarResultadoRobo("conferidor_sincronia_entidades", r.resumo);
    definirAlertaRobo("conferidor_sincronia_entidades", r.atencao ? { nivel: "aviso", texto: r.resumo } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor da Sincronia de Entidades:", e?.message || e)) : undefined;
  setTimeout(() => void rodarConferidorSincroniaEntidades(), 430_000).unref();
  setInterval(() => void rodarConferidorSincroniaEntidades(), 2 * 60 * 60_000).unref();
  app.get("/api/entidades/sincronia", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.json({ sucesso: true, divergencias: [], ultimaSincronia: null });
    const pedido = String(req.query.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cnpjs = pedido ? sessao.cnpjs.filter((c) => c === pedido) : sessao.cnpjs;
    try { return res.json({ sucesso: true, divergencias: await divergenciasEntidadeContabil((sql, params) => consultaBancoContabil(sql, params), cnpjs), ultimaSincronia: ultimaSincroniaEntidades.em }); }
    catch (e: any) { console.error("Falha ao ler a sincronia de entidades:", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "Não foi possível consultar agora." }); }
  });
  app.post("/api/entidades/sincronizar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "PostgreSQL não configurado." });
    const pedido = String(req.body?.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cnpjs = sessao.cnpjs.filter((c) => (sessao.administrador || sessao.memberships.find((m) => m.cnpj === c)?.role !== "viewer") && (!pedido || c === pedido));
    if (!cnpjs.length) return res.status(403).json({ sucesso: false, motivo: "Nenhuma empresa com acesso de edição para sincronizar." });
    try {
      const r = await sincronizarEntidadesAgora(cnpjs);
      const p = pedido ? (await consultaBancoContabil("SELECT payload->'empresa' AS empresa, version FROM contabil_company_workspaces WHERE cnpj=$1", [pedido])).rows[0] : null;
      const marcaAtual = p?.empresa ? { regime: String(p.empresa.regime || ""), entidadeCertificada: p.empresa.entidadeCertificada === true, entidadeCertificacaoValidade: String(p.empresa.entidadeCertificacaoValidade || ""), entidadeSincronizada: p.empresa.entidadeSincronizada ?? null, versao: Number(p.version) } : null;
      return res.status(r.ok ? 200 : 502).json({ sucesso: r.ok, ...r, mensagem: r.motivo, marcaAtual, divergencias: await divergenciasEntidadeContabil((sql, params) => consultaBancoContabil(sql, params), cnpjs) });
    } catch (e: any) { console.error("Falha na sincronia de entidades:", e?.message || e); return res.status(500).json({ sucesso: false, motivo: "Não foi possível sincronizar agora." }); }
  });
  // Contábil ← Fiscal: o que veio do backup do sistema anterior completa só o que está vazio no cadastro e dá o histórico do regime aos conferidores.
  registrarRobo({ id: "dados_backup_fiscal", nome: "Robô de Aproveitamento do Backup pelo Fiscal (Contábil)", posto: "integrador", missao: "De 6 em 6 horas (e no \"Rodar agora\") busca no Murad Fiscal o que veio do backup do sistema anterior de cada empresa (histórico do regime tributário, receita mensal e cadastro: CNAE, inscrições, natureza jurídica, abertura e endereço) e preenche no Contábil SÓ o que está vazio, marcando \"veio do backup do sistema anterior pelo Murad Fiscal — confira\". Guarda o histórico do regime e a receita para os conferidores: o Robô Conferidor das Origens só cobra DAS do Simples nos meses em que a empresa estava no Simples. Nunca troca o que alguém digitou, nunca cria empresa e não mexe em lançamento, plano de contas, fechamento nem guia. O log só tem contagens.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const hojeBackupFiscalContabil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const rodarDadosBackupFiscal = () => bancoContabilConfigurado() ? executarRobo("dados_backup_fiscal", async () => {
    const r = await aproveitarBackupDoFiscalContabil((sql, params) => consultaBancoContabil(sql, params), { hoje: hojeBackupFiscalContabil() });
    registrarResultadoRobo("dados_backup_fiscal", r.resumo);
    if (!r.ok) throw new Error(r.resumo);
  }).catch((e) => console.error("Falha no Robô de Aproveitamento do Backup pelo Fiscal:", e?.message || e)) : undefined;
  setTimeout(() => void rodarDadosBackupFiscal(), 340_000).unref();
  setInterval(() => void rodarDadosBackupFiscal(), 6 * 60 * 60_000).unref();
  registrarRotinaManual("dados_backup_fiscal", rodarDadosBackupFiscal);
  // ===== Agente 007 — conferidor do backup (pedido do dono, 27/11/2026): núcleo em src/server/agente007.ts (igual nos três sistemas) e etapas
  // do Contábil em src/server/agente007Contabil.ts. Cada empresa que termina de gravar na migração (também na retomada e na parte que vem do DP)
  // entra na fila dele (~90 s depois); os robôs que varrem o sistema rodam uma vez por lote, com a fila vazia e sem migração gravando.
  const consultar007Contabil = (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params as any[]) as any;
  const repo007Contabil = repo007Postgres(consultar007Contabil);
  const encadear007 = (id: string) => async () => { await esperarRoboLivre(id); const r = dispararRoboAgora(id); if (!r.ok) return undefined; await new Promise((ok) => setTimeout(ok, 300)); await esperarRoboLivre(id); return ultimoResultadoRobo(id)?.slice(0, 200) || undefined; };
  const fila007Contabil = bancoContabilConfigurado() ? criarFila007({
    sistema: "contabil", repo: repo007Contabil, versaoMapa: versaoMapaBackupContabil(), log: (l) => console.log(l),
    assinatura: (a) => assinatura007Contabil(consultar007Contabil, a.cnpj),
    migracaoGravando: async () => (await migracoesAtivasContabil().catch(() => ({ gravandoAgora: 0 }))).gravandoAgora > 0,
    etapas: etapas007Contabil({ consultar: consultar007Contabil, banco: bancoTransacionalContabil, workspaceValido, pesadas: [
      { id: "dados_backup_fiscal", nome: "Aproveitamento do backup pelo Fiscal", rodar: encadear007("dados_backup_fiscal") },
      { id: "reconciliador", nome: "Reconciliador (Fiscal e DP → pré-lançamentos)", rodar: encadear007("reconciliador") },
      { id: "conferidor_migracao_sistema_anterior", nome: "Conferidor da migração", rodar: encadear007("conferidor_migracao_sistema_anterior") },
    ] }),
  }, { aoTerminarLote: (rodadas, pesadas) => {
    const soma = (k: "organizados" | "pendencias") => rodadas.reduce((t, x) => t + x.resumo.contagem[k], 0);
    registrarResultadoRobo("agente_007", `${rodadas.length} empresa(s) conferida(s) depois da migração: ${soma("organizados")} campo(s) completado(s), ${soma("pendencias")} ponto(s) para conferir; robôs encadeados: ${pesadas.map((x) => `${x.id}${x.ok ? "" : " (não terminou)"}`).join(", ") || "nenhum"}.`);
  } }) : null;
  definirAoGravarEmpresaContabil((r) => {
    if (!fila007Contabil || !r?.cnpj) return;
    void escritorioDaEmpresa(consultar007Contabil, r.cnpj).then((tenantId) => { if (tenantId && tenantId !== "sem-escritorio") fila007Contabil.enfileirar({ tenantId, cnpj: r.cnpj, motivo: "empresa gravada pela migração do backup" }); }).catch(() => undefined);
  });
  registrarRobo({ id: "agente_007", nome: "Agente 007 — conferidor do backup", posto: "conferidor", missao: "Fica sabendo sozinho de cada empresa gravada pela migração do backup (e da retomada depois de uma publicação) e, ~90 s depois, organiza por trás dos panos, só o que mudou: completa os campos vazios pelo registro guardado do sistema anterior (sem sobrescrever e fora de competência fechada), confere o balancete com o backup e o campo a campo. Com a fila vazia e sem migração gravando, encadeia na ordem o Aproveitamento do Backup pelo Fiscal, o Reconciliador e o Conferidor da Migração. Uma vez por dia confere de novo onde algo mudou. Nunca transmite, não aprova lançamento e não exclui.", ...(bancoContabilConfigurado() ? { intervaloMs: 24 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodar007Diario = () => fila007Contabil ? executarRobo("agente_007", async () => {
    const r = await fila007Contabil.rodadaDiaria();
    if (!r.rodadas) registrarResultadoRobo("agente_007", `${r.empresas} empresa(s) migrada(s) acompanhada(s): nada mudou desde a última conferência.`);
  }).catch((e) => console.error("[007:contabil] rodada diária:", e?.message || e)) : undefined;
  registrarRotinaManual("agente_007", rodar007Diario);
  setTimeout(() => void rodar007Diario(), 17 * 60_000).unref();
  setInterval(() => void rodar007Diario(), 24 * 60 * 60_000).unref();
  const tenant007 = (s: any) => String(s.tenantId || s.escritorioDe || s.userId);
  app.get("/api/agente007/status", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    try {
      const visiveis = new Set((s.cnpjs || []).map((c: string) => String(c)));
      const rodadas = bancoContabilConfigurado() ? (await repo007Contabil.rodadasDoTenant(tenant007(s), "contabil", 500)).filter((r) => visiveis.has(r.cnpj)) : [];
      return res.json({ sucesso: true, nome: NOME_ROBO_007, texto: respostaMurad007(rodadas), ultima: rodadas[0]?.quando || null, aguardando: fila007Contabil?.aguardando() || 0,
        empresas: rodadas.slice(0, 100).map((r) => ({ cnpj: r.cnpj, quando: r.quando, texto: r.resumo.texto, achados: r.resumo.achados.length, pontos: r.resumo.achados.slice(0, 5).map((x) => x.texto.slice(0, 200)) })) });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler o relatório do 007 agora." }); }
  });
  app.post("/api/agente007/rodar-agora", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false });
    if (!s.administrador && !s.escritorioDe) return res.status(403).json({ sucesso: false, motivo: "Somente o responsável ou a equipe do escritório roda o Agente 007." });
    if (req.body?.ok !== true) return res.status(400).json({ sucesso: false, motivo: "Confirme no cartão (OK) para rodar o Agente 007 agora." });
    if (!fila007Contabil) return res.status(503).json({ sucesso: false, motivo: "Configure o PostgreSQL do Contábil." });
    const visiveis = new Set((s.cnpjs || []).map((c: string) => String(c)));
    const migradas = (await consultaBancoContabil("SELECT DISTINCT cnpj FROM contabil_sistema_anterior", []).catch(() => ({ rows: [] as any[] }))).rows.map((x: any) => String(x.cnpj)).filter((c: string) => visiveis.has(c));
    if (!migradas.length) return res.json({ sucesso: true, mensagem: "Nenhuma empresa deste escritório veio da migração pelo backup: o 007 não tem o que conferir." });
    void fila007Contabil.rodarTenant(tenant007(s), migradas).catch((e) => console.error("[007:contabil] rodar agora:", e?.message || e));
    return res.json({ sucesso: true, mensagem: `O 007 começou a conferir ${migradas.length} empresa(s) do backup. O resumo aparece em Robôs em instantes.` });
  });
  app.get("/api/agente007/cofre", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (sessaoDaRequisicaoContabil(req)?.donoSistema !== true) return res.status(403).json({ sucesso: false, motivo: "Somente o dono do sistema vê o cofre do backup." });
    const linhas = bancoContabilConfigurado() ? await painelCofre007Contabil(consultar007Contabil) : [];
    return res.json({ sucesso: true, versaoMapa: versaoMapaBackupContabil(), urgentes: linhas.length, linhas });
  });
  // Tela Empresa: "Completar agora" do escritório (só as empresas dele, com acesso de edição).
  app.post("/api/dados-backup-fiscal/rodar", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessao = sessaoDaRequisicaoContabil(req);
    if (!sessao) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!bancoContabilConfigurado()) return res.status(503).json({ sucesso: false, motivo: "PostgreSQL não configurado." });
    const pedido = String(req.body?.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cnpjs = sessao.cnpjs.filter((c) => (sessao.administrador || sessao.memberships.find((m) => m.cnpj === c)?.role !== "viewer") && (!pedido || c === pedido));
    if (!cnpjs.length) return res.status(403).json({ sucesso: false, motivo: "Nenhuma empresa com acesso de edição." });
    try {
      const r = await aproveitarBackupDoFiscalContabil((sql, params) => consultaBancoContabil(sql, params), { hoje: hojeBackupFiscalContabil(), cnpjs });
      return res.status(r.ok ? 200 : 502).json({ sucesso: r.ok, ...r, mensagem: r.resumo });
    } catch (e: any) { console.error("Falha ao completar pelo backup do Fiscal:", String(e?.message || e).slice(0, 160)); return res.status(500).json({ sucesso: false, motivo: "Não foi possível completar agora." }); }
  });
  // Robô Conferidor de Empresas Excluídas: se o Fiscal diz que uma empresa foi excluída (lápide) e ela ainda tem acesso, cadastro ou workspace aqui,
  // avisa o dono no painel de Saúde dos robôs. Só lê: apagar é sempre uma empresa por vez, com confirmação de uma pessoa.
  registrarRobo({ id: "empresas_excluidas", nome: "Robô Conferidor de Empresas Excluídas", posto: "conferidor", missao: "Conferir, só em leitura, se alguma empresa excluída no Murad Fiscal ainda sobrou no Contábil (acesso, cadastro ou workspace) e avisar o dono do sistema aqui. Nunca apaga nada sozinho: a exclusão é uma empresa por vez, com confirmação de uma pessoa, e nunca bloqueia o CNPJ para novo cadastro.", intervaloMs: 60 * 60_000 });
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
  registrarRobo({ id: "presenca_dono", nome: "Robô Conferidor do Online/Offline (dono do sistema)", posto: "conferidor", missao: "A cada 30 minutos: confere a tabela do último sinal de cada usuário (só usuário, escritório, tela e horário), apaga o que tem mais de 90 dias e o de usuários excluídos, conta quem está online agora e confere se o DP e o Fiscal estão respondendo o online/offline deles para o painel do dono. Só lê e apaga sinais antigos; nunca mexe em usuário nem em escritório.", intervaloMs: 30 * 60_000 });
  const rodarPresencaDono = () => bancoContabilConfigurado() ? executarRobo("presenca_dono", async () => {
    const r = await presencaDono.conferir();
    const outros = await presencaDono.sinaisDosOutros();
    const falhas = outros.sistemas.filter((x) => !x.ok);
    definirAlertaRobo("presenca_dono", falhas.length ? { nivel: "aviso", texto: `Online/offline sem resposta de: ${falhas.map((x) => `${x.sistema} (${x.motivo})`).join(", ")}. O painel do dono mostra só o que chegou.` } : null);
    registrarResultadoRobo("presenca_dono", `${r.online} usuário(s) online agora no Contábil; ${r.ativos} ativo(s) nos últimos 15 min; ${r.apagados} sinal(is) com mais de 90 dias e ${r.orfaos} de usuário(s) excluído(s) apagado(s); ${outros.sinais.length} sinal(is) do DP e do Fiscal.`);
  }).catch((e) => console.error("Falha no Robô Conferidor do Online/Offline:", e?.message || e)) : undefined;
  setTimeout(() => void rodarPresencaDono(), 170_000).unref();
  setInterval(() => void rodarPresencaDono(), 30 * 60_000).unref();
  registrarRotinaManual("presenca_dono", rodarPresencaDono);
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
  registrarRotinaManual("sincronia_entidades", rodarSincroniaEntidades);
  registrarRotinaManual("conferidor_sincronia_entidades", rodarConferidorSincroniaEntidades);
  // Vigência das obrigações (lista única nos três sistemas, src/utils/vigenciaObrigacoes.ts): PIS/Cofins depois de dez/2026 e CPRB depois
  // de dez/2027 não viram provisão nova; CBS e IBS começam em 2027. Os períodos antigos continuam (Obrigações encerradas) até os 5 anos do CTN.
  const hojeVigenciaContabil = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  registrarRobo({ id: "vigencia_obrigacoes", nome: "Robô de Vigência das Obrigações", posto: "conferidor", missao: "Uma vez por dia (e no \"Rodar agora\") confere, pela lista única com fonte oficial, o que acaba e o que começa no Contábil (provisão de PIS/Cofins depois de dez/2026, CPRB depois de dez/2027, CBS e IBS a partir de 2027) e avisa 30 dias antes na tela Vigência das obrigações e no painel dos robôs, uma vez só. O que acaba não vira provisão nova; os períodos antigos ficam em \"Obrigações encerradas\" até os 5 anos do CTN. Nunca apaga lançamento nem dado.", intervaloMs: 24 * 60 * 60_000 });
  registrarRobo({ id: "conferidor_vigencia", nome: "Robô Conferidor de Vigência", posto: "conferidor", missao: "De 6 em 6 horas confere, só em leitura, se o gerador de provisões, as apurações recebidas do Fiscal e do DP ou os pré-lançamentos ainda trazem obrigação encerrada nos períodos novos. Avisa no painel dos robôs; nunca apaga nada.", intervaloMs: 6 * 60 * 60_000 });
  const rodarVigenciaContabil = async (aoAndar?: (e: EtapaVigencia) => void) => {
    if (!bancoContabilConfigurado()) throw new Error("Configure o PostgreSQL do Contábil.");
    const hoje = hojeVigenciaContabil(); const banco = (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params);
    // O Contábil não tem aviso no celular: o aviso fica na tela Vigência das obrigações e no painel dos robôs.
    const robo = await rodarRoboVigencia(banco, { sistema: "contabil", hoje, aoAndar });
    registrarResultadoRobo("vigencia_obrigacoes", robo.resumo);
    definirAlertaRobo("vigencia_obrigacoes", robo.avisosAtivos.length ? { nivel: "aviso", texto: robo.avisosAtivos.map((a) => `${a.titulo} (faltam ${a.dias} dia(s))`).join("; ") } : null);
    const conferidor = await conferirVigencia(conferenciasVigenciaContabil(banco), hoje);
    registrarResultadoRobo("conferidor_vigencia", conferidor.resumo);
    definirAlertaRobo("conferidor_vigencia", conferidor.atencao ? { nivel: "aviso", texto: conferidor.resumo } : null);
    return { robo, conferidor };
  };
  const rodarVigenciaJob = () => bancoContabilConfigurado() ? executarRobo("vigencia_obrigacoes", async () => { await rodarVigenciaContabil(); }).catch((e) => console.error("Falha no Robô de Vigência das Obrigações:", e?.message || e)) : undefined;
  const rodarConferidorVigenciaJob = () => executarRobo("conferidor_vigencia", async () => {
    const r = await conferirVigencia(conferenciasVigenciaContabil(bancoContabilConfigurado() ? (sql, params) => consultaBancoContabil(sql, params) : null), hojeVigenciaContabil());
    registrarResultadoRobo("conferidor_vigencia", r.resumo);
    definirAlertaRobo("conferidor_vigencia", r.atencao ? { nivel: "aviso", texto: r.resumo } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor de Vigência:", e?.message || e));
  setTimeout(() => void rodarVigenciaJob(), 250_000).unref();
  setInterval(() => void rodarVigenciaJob(), 24 * 60 * 60_000).unref();
  setTimeout(() => void rodarConferidorVigenciaJob(), 310_000).unref();
  setInterval(() => void rodarConferidorVigenciaJob(), 6 * 60 * 60_000).unref();
  registrarRotinaManual("vigencia_obrigacoes", () => void rodarVigenciaJob());
  registrarRotinaManual("conferidor_vigencia", () => void rodarConferidorVigenciaJob());
  const exigirEscritaVigenciaContabil: express.RequestHandler = (req, res, next) => {
    const s = sessaoDaRequisicaoContabil(req); if (!s) return void res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    if (!s.administrador && s.memberships.length && s.memberships.every((m) => m.role === "viewer")) return void res.status(403).json({ sucesso: false, motivo: "Seu perfil é somente leitura." });
    next();
  };
  registrarRotasVigencia(app, { sistema: "contabil", consultar: bancoContabilConfigurado() ? (sql, params) => consultaBancoContabil(sql, params) : null, hoje: hojeVigenciaContabil,
    exigirLeitura: [exigirSessaoContabil], exigirEscrita: [exigirOrigemNavegador, exigirSessaoContabil, exigirEscritaVigenciaContabil], rodar: (aoAndar) => rodarVigenciaContabil(aoAndar) });
  registrarRotinaManual("empresas_excluidas", rodarEmpresasExcluidas);
  registrarRotinaManual("acessos", rodarConferidorDeAcessos);
  // Nenhuma empresa repetida (ver src/server/conferidorEmpresaRepetida.ts): só lê e conta; nunca apaga nem junta.
  registrarRobo({ id: "conferidor_empresa_repetida", nome: "Robô Conferidor de Empresa Repetida", posto: "conferidor", missao: "De 2 em 2 horas confere se alguma empresa aparece duas vezes: o mesmo CNPJ no acesso de mais de um escritório, gravado com e sem pontuação, cadastro com CNPJ diferente da chave ou o mesmo código interno em duas empresas. Só conta e avisa; nunca apaga nem junta empresa sozinho.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarConferidorEmpresaRepetida = () => { if (!bancoContabilConfigurado()) return; executarRobo("conferidor_empresa_repetida", async () => {
    await prepararAuthContabil();
    const r = await conferirEmpresasRepetidas((sql, params) => consultaBancoContabil(sql, (params ?? []) as any[]) as any, {
      acessos: "SELECT a.cnpj, COALESCE(u.tenant_id, u.office_owner, u.id)::text AS tenant FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE u.disabled=false",
      empresas: "SELECT cnpj, payload->'empresa'->>'cnpj' AS cnpj_cadastro, NULL::text AS id FROM contabil_company_workspaces",
    });
    registrarResultadoRobo("conferidor_empresa_repetida", r.resumo);
    definirAlertaRobo("conferidor_empresa_repetida", r.alerta ? { nivel: "aviso", texto: r.resumo } : null);
  }).catch((e) => console.error("Falha no Robô Conferidor de Empresa Repetida:", e?.message || e)); };
  registrarRotinaManual("conferidor_empresa_repetida", rodarConferidorEmpresaRepetida);
  setTimeout(rodarConferidorEmpresaRepetida, 13 * 60_000).unref();
  setInterval(rodarConferidorEmpresaRepetida, 2 * 60 * 60_000).unref();
  registrarRotinaManual("seguranca_login", rodarSegurancaLogin);
  registrarRotinaManual("backups", rodarConferidorBackups);
  // Robô de Backup Agendado (a cada 5 min) e o conferidor dele (de 2 em 2 horas): ver src/server/backupAgendado/servico.ts.
  registrarRobo({ id: "backup_agendado", nome: "Robô de Backup Agendado", posto: "conferidor", missao: "A cada 5 minutos faz os backups que cada escritório agendou na tela Backup (todo dia, semana ou mês; completo ou só alterações; quando dois coincidem vale o completo), confere cada arquivo logo depois (abre, decifra, checksum e contagens), envia para a nuvem do escritório quando configurada, reenvia o que falhou e aplica a retenção escolhida. Só lê os dados do escritório; nunca altera lançamento nem fechamento.", ...(bancoContabilConfigurado() ? { intervaloMs: 5 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  registrarRobo({ id: "conferidor_backup_agendado", nome: "Robô Conferidor do Backup Agendado", posto: "conferidor", missao: "De 2 em 2 horas confere, escritório por escritório, se o backup de cada horário agendado foi feito, conferido e enviado à nuvem do escritório; corrige sozinho o que dá (refaz o backup que ficou para trás, confere o que não foi conferido e reenvia à nuvem) e avisa o que sobrar. Só conta; não mostra dado de nenhum escritório.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  let ultimoResumoBackupAgendado = "";
  const rodarBackupAgendado = () => bancoContabilConfigurado() ? executarRobo("backup_agendado", async () => {
    const r = await servicoBackupAgendadoContabil.rodadaExecutor();
    // A cada 5 min a rodada sem nada para fazer repete a mesma frase: só grava no histórico quando algo muda.
    if (r.feitos || r.falhas || r.reenviados || r.presos || r.resumo !== ultimoResumoBackupAgendado) { ultimoResumoBackupAgendado = r.resumo; registrarResultadoRobo("backup_agendado", r.resumo); }
  }).catch((e) => console.error("Falha no Robô de Backup Agendado:", e?.message || e)) : undefined;
  const rodarConferidorBackupAgendado = () => bancoContabilConfigurado() ? executarRobo("conferidor_backup_agendado", async () => {
    const r = await servicoBackupAgendadoContabil.rodadaConferidor();
    definirAlertaRobo("conferidor_backup_agendado", r.alerta);
    registrarResultadoRobo("conferidor_backup_agendado", r.resumo);
  }).catch((e) => console.error("Falha no Robô Conferidor do Backup Agendado:", e?.message || e)) : undefined;
  setTimeout(() => void rodarBackupAgendado(), 160_000).unref();
  setInterval(() => void rodarBackupAgendado(), 5 * 60_000).unref();
  setTimeout(() => void rodarConferidorBackupAgendado(), 20 * 60_000).unref();
  setInterval(() => void rodarConferidorBackupAgendado(), 2 * 60 * 60_000).unref();
  registrarRotinaManual("backup_agendado", rodarBackupAgendado);
  registrarRotinaManual("conferidor_backup_agendado", rodarConferidorBackupAgendado);
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

  // Robô Conferidor da Escola Murade: conteúdo com fonte oficial e data; aluno com trilha atribuída e sem progresso há 7 dias avisa o gestor.
  registrarRobo({ id: "conferidor_escola", nome: "Robô Conferidor da Escola Murad", posto: "conferidor", missao: "A cada 6 horas confere, só em leitura, se toda aula da Escola Murad tem fonte oficial e data de conferência, perguntas bem formadas, exemplo calculado pelo motor do sistema e \"Me mostra\" apontando para tela que existe, e avisa o administrador do escritório quando um aluno com trilha atribuída está sem progresso há 7 dias. Nunca grava em lançamento, plano de contas, livro, ECD ou ECF.", intervaloMs: 6 * 60 * 60_000 });
  const rodarConferidorEscola = () => bancoContabilConfigurado() ? executarRobo("conferidor_escola", async () => { const r = await escolaMurade.rodarRobo(); registrarResultadoRobo("conferidor_escola", r.resumo); })
    .catch((e) => console.error("Falha no Robô Conferidor da Escola Murad:", e?.message || e)) : undefined;
  setTimeout(() => void rodarConferidorEscola(), 290_000).unref();
  setInterval(() => void rodarConferidorEscola(), 6 * 60 * 60_000).unref();
  registrarRotinaManual("conferidor_escola", () => void rodarConferidorEscola());

  // Robôs da escrituração avançada (todos os escritórios, empresa por empresa; nunca aprovam nada sozinhos).
  const consultarEscrituracao = (sql: string, params?: unknown[]) => consultaBancoContabil(sql, params);
  registrarRobo({ id: "lancamentos_padrao", nome: "Robô dos Lançamentos Padrão", posto: "calculador", missao: "Preparar todo mês, como pré-lançamento pendente de aprovação, os lançamentos padrão (recorrentes) que cada empresa cadastrou, como aluguel e honorários. Nunca prepara duas vezes a mesma competência, nunca mexe em mês fechado e nunca aprova.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarLancamentosPadrao = () => bancoContabilConfigurado() ? executarRobo("lancamentos_padrao", async () => registrarResultadoRobo("lancamentos_padrao", await roboLancamentosPadrao())).catch((e) => console.error("Falha no Robô dos Lançamentos Padrão:", e?.message || e)) : undefined;
  registrarRobo({ id: "livro_caixa", nome: "Robô do Livro Caixa (Simples)", posto: "conferidor", missao: "Conferir as empresas do Simples Nacional no mês anterior: com escrituração contábil (Diário e Razão) o Livro Caixa é dispensado (Res. CGSN 140/2018, art. 63, § 3º); sem lançamento no mês, emite sozinho o Livro Caixa sem movimento quando as contas de Caixa/Bancos e o saldo inicial estão confirmados, e avisa quando falta algo.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarLivroCaixa = () => bancoContabilConfigurado() ? executarRobo("livro_caixa", async () => registrarResultadoRobo("livro_caixa", await roboLivroCaixa(consultarEscrituracao))).catch((e) => console.error("Falha no Robô do Livro Caixa:", e?.message || e)) : undefined;
  registrarRobo({ id: "plano_entidade", nome: "Robô do Plano da Entidade (imunes e isentas)", posto: "conferidor", missao: "A cada 6 horas, nas empresas com regime de entidade imune ou isenta (igrejas, associações, beneficentes, sindicatos, partidos, fundações), ajusta sozinho o plano de contas à ITG 2002: Patrimônio Social no lugar de Capital Social, superávit ou déficit, doações com e sem restrição, subvenções e convênios, gratuidades e trabalho voluntário. Só acrescenta contas e renomeia as duas do modelo padrão; nunca apaga conta nem lançamento.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarPlanoEntidade = () => bancoContabilConfigurado() ? executarRobo("plano_entidade", async () => registrarResultadoRobo("plano_entidade", await roboPlanoEntidade())).catch((e) => console.error("Falha no Robô do Plano da Entidade:", e?.message || e)) : undefined;
  registrarRobo({ id: "encerramento", nome: "Robô do Encerramento do Resultado", posto: "conferidor", missao: "Conferir o encerramento do resultado do ano anterior em cada empresa: avisa quando falta ou quando o encerramento gravado não bate mais com as contas de resultado, e prepara o encerramento para aprovação quando janeiro a novembro já estão fechados. Nunca aprova nem estorna sozinho.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarEncerramento = () => bancoContabilConfigurado() ? executarRobo("encerramento", async () => registrarResultadoRobo("encerramento", await roboEncerramento(consultarEscrituracao))).catch((e) => console.error("Falha no Robô do Encerramento:", e?.message || e)) : undefined;
  registrarRobo({ id: "conciliacao", nome: "Robô da Conciliação Bancária", posto: "conferidor", missao: "Olhar o extrato guardado de cada empresa e sugerir, para cada movimento sem conciliação, o lançamento aprovado que casa (mesmo sentido e valor) ou a conta pela regra do escritório (quando o histórico tiver o texto) ou pelo histórico. Só grava sugestão: conciliar e lançar é sempre uma pessoa.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarConciliacao = () => bancoContabilConfigurado() ? executarRobo("conciliacao", async () => registrarResultadoRobo("conciliacao", await roboConciliacao(consultarEscrituracao))).catch((e) => console.error("Falha no Robô da Conciliação:", e?.message || e)) : undefined;
  registrarRobo({ id: "baixa_guias_extrato", nome: "Robô da Baixa das Guias pelo Extrato", posto: "integrador", missao: "De hora em hora (e logo depois de cada extrato importado) manda ao Murad Fiscal os movimentos dos últimos 60 dias do extrato bancário guardado de cada empresa. O Fiscal baixa a guia do aplicativo do cliente só quando o débito tem o mesmo valor e a mesma data da guia ou o código dela no histórico, e o honorário quando o crédito cai no extrato do banco do escritório. O que serve para mais de uma guia fica para o contador. Não mexe no extrato, na conciliação nem nos lançamentos e não consulta o Serpro.", ...(bancoContabilConfigurado() ? { intervaloMs: 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarBaixaGuiasExtrato = () => bancoContabilConfigurado() ? executarRobo("baixa_guias_extrato", async () => { const r = await enviarExtratoParaBaixa((sql, params) => consultaBancoContabil(sql, params)); definirAlertaRobo("baixa_guias_extrato", r.atencao ? { nivel: "aviso", texto: r.resumo } : null); registrarResultadoRobo("baixa_guias_extrato", r.resumo); }).catch((e) => console.error("Falha no Robô da Baixa das Guias pelo Extrato:", e?.message || e)) : undefined;
  registrarRobo({ id: "conferidor_extratos_pdf", nome: "Robô Conferidor dos Extratos em PDF", posto: "conferidor", missao: "De 6 em 6 horas, em cada empresa que importou extrato bancário em PDF, confere se os movimentos guardados de cada extrato ainda somam o saldo final menos o saldo inicial (nenhum sumiu) e se o saldo inicial de um extrato é o saldo final do anterior da mesma conta (sem extrato faltando no meio). Só lê; o extrato em PDF só entra quando saldo inicial + movimentos = saldo final.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarConferidorExtratosPdf = () => bancoContabilConfigurado() ? executarRobo("conferidor_extratos_pdf", async () => { const t = await roboConferidorExtratosPdf(consultarEscrituracao); definirAlertaRobo("conferidor_extratos_pdf", t.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: t } : null); registrarResultadoRobo("conferidor_extratos_pdf", t); }).catch((e) => console.error("Falha no Conferidor dos Extratos em PDF:", e?.message || e)) : undefined;
  // Fisco IA → Contábil: conferidor (só lê) dos itens recebidos (guias, dívida ativa e parcelamentos consultados por clique no Integra Contador).
  registrarRobo({ id: "conferidor_fiscoia", nome: "Robô Conferidor do Fisco IA → Contábil", posto: "conferidor", missao: "De 2 em 2 horas, em cada empresa que recebeu do Fisco IA guias, dívida ativa ou parcelamentos (consultados por clique no Integra Contador), confere se cada item virou pré-lançamento, se está esperando o mapeamento de contas ou se ficou de fora porque o Fiscal já tinha mandado o mesmo. Só lê; não consulta o Serpro e nunca lança.", intervaloMs: 2 * 60 * 60_000 });
  const rodarConferidorFiscoIa = () => bancoContabilConfigurado() ? executarRobo("conferidor_fiscoia", async () => { const t = resumoConferidorFiscoIa(await conferirFiscoIaContabil(consultarEscrituracao, null)); definirAlertaRobo("conferidor_fiscoia", t.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: t } : null); registrarResultadoRobo("conferidor_fiscoia", t); }).catch((e) => console.error("Falha no Conferidor do Fisco IA:", e?.message || e)) : undefined;
  app.get("/api/fiscoia-contabil/itens", exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    const cnpj = normalizarCnpjAcesso(req.query.cnpj);
    if (!cnpjContabilValido(cnpj) || !s.cnpjs.map(normalizarCnpjAcesso).includes(cnpj)) return res.status(403).json({ sucesso: false, motivo: "Empresa fora do seu acesso." });
    try { const r = await conferirFiscoIaContabil(consultarEscrituracao, [cnpj]); return res.json({ sucesso: true, ...r, resumo: resumoConferidorFiscoIa(r) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler os itens do Fisco IA agora." }); }
  });
  app.post("/api/fiscoia-contabil/conferir-agora", exigirOrigemNavegador, exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    try {
      // Antes de conferir, prepara de novo os pré-lançamentos das empresas da sessão que receberam itens do Fisco IA (não consulta o Serpro).
      const r0 = await conferirFiscoIaContabil(consultarEscrituracao, s.cnpjs.map(normalizarCnpjAcesso));
      for (const cnpj of new Set(r0.itens.map((i) => i.cnpj))) await prepararRascunhosContabeisAutomaticos(cnpj).catch(() => undefined);
      const r = await conferirFiscoIaContabil(consultarEscrituracao, s.cnpjs.map(normalizarCnpjAcesso));
      return res.json({ sucesso: true, ...r, resumo: resumoConferidorFiscoIa(r), conferidoEm: new Date().toISOString() });
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível conferir agora." }); }
  });
  registrarRobo({ id: "conferidor_pago_a_maior", nome: "Robô Conferidor do Recolhimento a Maior", posto: "conferidor", missao: "De 6 em 6 horas, em cada empresa com pagamento de DAS ou DARF recebido do Fiscal, confere se o principal pago passou do apurado no mesmo período ou se a mesma guia foi paga mais de uma vez, e deixa o valor com a orientação de restituição ou compensação (PER/DCOMP ou Minhas Restituições de DAS). O que pode ser multa e juros fica a conferir. Só lê; não consulta a Receita.", intervaloMs: 6 * 60 * 60_000 });
  const rodarConferidorPagoAMaior = () => bancoContabilConfigurado() ? executarRobo("conferidor_pago_a_maior", async () => { const t = resumoPagoAMaior(await conferirPagoAMaior(consultarEscrituracao, null)); definirAlertaRobo("conferidor_pago_a_maior", t.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: t } : null); registrarResultadoRobo("conferidor_pago_a_maior", t); }).catch((e) => console.error("Falha no Conferidor do Recolhimento a Maior:", e?.message || e)) : undefined;
  registrarRobo({ id: "conferidor_documentos_lidos", nome: "Robô Conferidor dos Documentos Lidos", posto: "conferidor", missao: "De 2 em 2 horas, em cada empresa que leu documento por foto ou PDF (recibo, boleto pago, nota de despesa, comprovante), confere se a leitura ficou parada sem gravar, se o lançamento gravado ainda existe e se não há duplicidade (mesmo arquivo lançado duas vezes ou outro lançamento igual). Só lê; nunca grava, aprova ou apaga.", intervaloMs: 2 * 60 * 60_000 });
  const rodarConferidorDocumentos = () => bancoContabilConfigurado() ? executarRobo("conferidor_documentos_lidos", async () => { const t = resumoConferidorDocumentos(await conferirDocumentosLidos(consultarEscrituracao, null)); definirAlertaRobo("conferidor_documentos_lidos", t.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: t } : null); registrarResultadoRobo("conferidor_documentos_lidos", t); }).catch((e) => console.error("Falha no Conferidor dos Documentos Lidos:", e?.message || e)) : undefined;
  registrarRobo({ id: "ajustes_fechamento", nome: "Robô Conferidor do Fechamento (ajustes)", posto: "conferidor", missao: "Conferir em cada empresa se Diário, Razão, balancete e Balanço/DRE fecham: saldos iniciais sem contrapartida, lançamento fora do Diário (conta sintética, competência diferente da data, fração de centavo), conta de resultado que não zerou no encerramento. Acha a causa e deixa o ajuste pronto para o contador dizer \"Sim\" na tela Fechamento ou pela Agente IA. Nunca lança sozinho.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarAjustesFechamento = () => bancoContabilConfigurado() ? executarRobo("ajustes_fechamento", async () => registrarResultadoRobo("ajustes_fechamento", await roboAjustesFechamento())).catch((e) => console.error("Falha no Robô dos ajustes do fechamento:", e?.message || e)) : undefined;
  registrarRobo({ id: "titulos", nome: "Robô dos Títulos a Pagar e Receber", posto: "calculador", missao: "Em cada empresa com títulos: põe os vencimentos na Agenda, avisa os vencidos e os que vencem em até 3 dias, e prepara sozinho, PENDENTE DE APROVAÇÃO, a provisão dos títulos cadastrados no Murad que já têm as duas contas. Nunca aprova nada e nunca lança de novo o que veio contabilizado do sistema anterior.", ...(bancoContabilConfigurado() ? { intervaloMs: 2 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarTitulos = () => bancoContabilConfigurado() ? executarRobo("titulos", async () => registrarResultadoRobo("titulos", await roboTitulos(consultarEscrituracao))).catch((e) => console.error("Falha no Robô dos Títulos:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarTitulos(), 270_000).unref(); setInterval(() => void rodarTitulos(), 2 * 60 * 60_000).unref();
    registrarRotinaManual("titulos", rodarTitulos);
    setTimeout(() => void rodarAjustesFechamento(), 250_000).unref(); setInterval(() => void rodarAjustesFechamento(), 2 * 60 * 60_000).unref();
    registrarRotinaManual("ajustes_fechamento", rodarAjustesFechamento);
    setTimeout(() => void rodarLancamentosPadrao(), 150_000).unref(); setInterval(() => void rodarLancamentosPadrao(), 60 * 60_000).unref();
    setTimeout(() => void rodarLivroCaixa(), 170_000).unref(); setInterval(() => void rodarLivroCaixa(), 2 * 60 * 60_000).unref();
    setTimeout(() => void rodarEncerramento(), 190_000).unref(); setInterval(() => void rodarEncerramento(), 6 * 60 * 60_000).unref();
    setTimeout(() => void rodarConciliacao(), 210_000).unref(); setInterval(() => void rodarConciliacao(), 60 * 60_000).unref();
    registrarRotinaManual("lancamentos_padrao", rodarLancamentosPadrao);
    registrarRotinaManual("livro_caixa", rodarLivroCaixa);
    setTimeout(() => void rodarPlanoEntidade(), 230_000).unref(); setInterval(() => void rodarPlanoEntidade(), 6 * 60 * 60_000).unref();
    registrarRotinaManual("plano_entidade", rodarPlanoEntidade);
    registrarRotinaManual("encerramento", rodarEncerramento);
    registrarRotinaManual("conciliacao", rodarConciliacao);
    setTimeout(() => void rodarConferidorExtratosPdf(), 215_000).unref(); setInterval(() => void rodarConferidorExtratosPdf(), 6 * 60 * 60_000).unref();
    registrarRotinaManual("conferidor_extratos_pdf", rodarConferidorExtratosPdf);
    setTimeout(() => void rodarConferidorDocumentos(), 225_000).unref(); setInterval(() => void rodarConferidorDocumentos(), 2 * 60 * 60_000).unref();
    registrarRotinaManual("conferidor_documentos_lidos", rodarConferidorDocumentos);
    setTimeout(() => void rodarConferidorFiscoIa(), 235_000).unref(); setInterval(() => void rodarConferidorFiscoIa(), 2 * 60 * 60_000).unref();
    registrarRotinaManual("conferidor_fiscoia", rodarConferidorFiscoIa);
    setTimeout(() => void rodarConferidorPagoAMaior(), 240_000).unref(); setInterval(() => void rodarConferidorPagoAMaior(), 6 * 60 * 60_000).unref();
    registrarRotinaManual("conferidor_pago_a_maior", rodarConferidorPagoAMaior);
    setTimeout(() => void rodarBaixaGuiasExtrato(), 225_000).unref(); setInterval(() => void rodarBaixaGuiasExtrato(), 60 * 60_000).unref();
    registrarRotinaManual("baixa_guias_extrato", rodarBaixaGuiasExtrato);
  }

  // Demonstrações e relatórios (DFC, DMPL, notas, índices, relatório para o cliente, painel do escritório, ECF Y/Parte B).
  registrarRobo({ id: "demonstracoes", nome: "Robô Conferidor das Demonstrações", posto: "conferidor", missao: "Conferir, só em leitura, as demonstrações do ano anterior de cada empresa: a DFC tem de fechar com a variação do caixa, a DMPL com o patrimônio líquido do balanço, contas com movimento precisam de classificação, as notas explicativas precisam existir e estar completas, e a Parte B da ECF precisa levar o saldo final de um ano para o seguinte. Põe o que achou no painel do escritório e na tela Demonstrações e relatórios. Nunca altera, lança nem transmite nada.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarDemonstracoes = () => bancoContabilConfigurado() ? executarRobo("demonstracoes", async () => registrarResultadoRobo("demonstracoes", await rodarRoboDemonstracoes((sql, params) => consultaBancoContabil(sql, params)))).catch((e) => console.error("Falha no Robô das Demonstrações:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarDemonstracoes(), 230_000).unref(); setInterval(() => void rodarDemonstracoes(), 6 * 60 * 60_000).unref();
    registrarRotinaManual("demonstracoes", rodarDemonstracoes);
  }
  registrarRotasDemonstracoes(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    bancoConfigurado: () => bancoContabilConfigurado(),
    sessao: (req) => {
      const s = sessaoDaRequisicaoContabil(req);
      if (!s) return undefined;
      return { userId: s.userId, login: s.login, cnpjs: s.cnpjs.map(normalizarCnpjAcesso), podeEscrever: (c) => s.administrador || s.memberships.find((m) => normalizarCnpjAcesso(m.cnpj) === c)?.role !== "viewer" };
    },
    normalizarCnpj: (v) => normalizarCnpjAcesso(String(v ?? "")),
    lerWorkspace: async (cnpj) => (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null,
    alterarWorkspace: (cnpj, alterar) => alterarWorkspaceNoServidorContabil(cnpj, alterar),
    dispararRobo: () => { const r = dispararRoboAgora("demonstracoes"); return "codigo" in r ? { ok: false, motivo: r.motivo } : { ok: true }; },
  });

  // DVA (CPC 09 (R1); Lei 6.404/1976, art. 176, V): conferidor de 6 em 6 horas (distribuído = gerado), "Rodar agora" com barra e rotas da tela e da Agente.
  registrarRobo({ id: "conferidor_dva", nome: "Robô Conferidor da DVA", posto: "conferidor", missao: "De 6 em 6 horas, monta a DVA do ano anterior de cada empresa (CPC 09 (R1), Modelo I) pelas contas, pelo plano referencial e pela DRE e confere se o valor distribuído é igual ao valor gerado; aponta as contas de resultado sem linha da DVA. Na companhia aberta a DVA é obrigatória (Lei 6.404/1976, art. 176, V) e o aviso é mais forte. Só lê; nunca lança nada.", ...(bancoContabilConfigurado() ? { intervaloMs: 6 * 60 * 60_000 } : { motivoSemRotina: "Configure o PostgreSQL do Contábil." }) });
  const rodarDva = () => bancoContabilConfigurado() ? executarRobo("conferidor_dva", async () => { const r = await rodarConferidorDva((sql, params) => consultaBancoContabil(sql, params)); definirAlertaRobo("conferidor_dva", r.resumo.startsWith("ATENÇÃO") ? { nivel: "aviso", texto: r.resumo } : null); registrarResultadoRobo("conferidor_dva", r.resumo); }).catch((e) => console.error("Falha no Conferidor da DVA:", e?.message || e)) : undefined;
  if (bancoContabilConfigurado()) {
    setTimeout(() => void rodarDva(), 245_000).unref(); setInterval(() => void rodarDva(), 6 * 60 * 60_000).unref();
    registrarRotinaManual("conferidor_dva", rodarDva);
  }
  registrarRotasDva(app, { exigirSessao: exigirSessaoContabil, exigirOrigem: exigirOrigemNavegador }, {
    sessao: (req) => {
      const s = sessaoDaRequisicaoContabil(req);
      if (!s) return undefined;
      return { userId: s.userId, login: s.login, tenant: String(s.tenantId || s.escritorioDe || s.userId), cnpjs: s.cnpjs.map(normalizarCnpjAcesso), podeEscrever: (c) => s.administrador || s.memberships.find((m) => normalizarCnpjAcesso(m.cnpj) === c)?.role !== "viewer" };
    },
    normalizarCnpj: (v) => normalizarCnpjAcesso(String(v ?? "")),
    consultar: (sql, params) => consultaBancoContabil(sql, params),
    lerWorkspace: async (cnpj) => (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null,
    alterarWorkspace: (cnpj, alterar) => alterarWorkspaceNoServidorContabil(cnpj, alterar),
  });

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
    const systemInstruction = `Você é a Assistente Murad, trabalhando no módulo ${moduleName === "dp" ? "Departamento Pessoal" : moduleName === "fiscal" ? "Fiscal" : "Contábil"}, para profissionais brasileiros. Responda em português do Brasil, com tom calmo, direto e prático. Para legislação, prazos, alíquotas, obrigações, tabelas e procedimentos sujeitos a mudança, pesquise informações atuais pela ferramenta de busca. Baseie conclusões legais apenas em fontes oficiais brasileiras: Receita Federal, Portal SPED, eSocial, SEFAZ, Planalto e prefeituras/portais oficiais. Não use páginas comerciais como autoridade legal. Explique a causa provável e a solução em etapas. Não invente dados de empresas, trabalhadores, folha, saldos, transmissões, integrações, alíquotas ou prazos; peça UF, município, regime e competência quando necessário. Não afirme que uma ação foi executada ou que uma conexão existe sem confirmação. Se não localizar fonte oficial atual ou não puder confirmar, diga claramente que ainda vai verificar e identifique o órgão que deve ser consultado. Respostas são orientação informativa, não substituem conferência do contador responsável. Nunca diga que a pergunta é grande ou longa demais: se vierem várias perguntas, liste-as numa linha curta, responda a primeira e termine com "Próximo: 2) … — quer que eu siga?".`;

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

  // Publicação (SIGTERM): a gravação da migração termina ou desfaz a empresa da vez e pausa; o servidor novo continua.
  instalarDesligamento();
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
        // Empresa que já está no Contábil (Fiscal, DP, migração ou cadastro manual) sem workspace ganha o workspace inicial
        // (plano padrão + mapeamentos padrão) para entrar na reconciliação. Nunca sobrescreve workspace existente.
        const novosWorkspaces = await criarWorkspacesQueFaltamContabil().catch((error) => { console.error("[Murad Contábil] Falha ao criar workspaces que faltam:", error); return { criados: [] as string[], falhas: [] as string[] }; });
        if (novosWorkspaces.criados.length) console.log(`[Murad Contábil] Workspace inicial criado sozinho para ${novosWorkspaces.criados.length} empresa(s): ${novosWorkspaces.criados.join(", ")}.`);
        // Antes de gerar rascunhos: preenche sozinho as origens sem mapeamento com o plano padrão (só quando código e descrição batem).
        let mapeamentosAplicados = 0;
        for (const cnpjSem of await listarCnpjsComOrigensSemMapeamentoContabil()) {
          try { mapeamentosAplicados += await aplicarMapeamentosPadraoContabil(cnpjSem); }
          catch (error) { console.error(`[Murad Contábil] Falha ao aplicar mapeamentos padrão do CNPJ ${cnpjSem}:`, error); }
        }
        if (mapeamentosAplicados) console.log(`[Murad Contábil] Mapeamentos padrão aplicados automaticamente: ${mapeamentosAplicados}.`);
        const semMapeamentoAinda = (await listarCnpjsComOrigensSemMapeamentoContabil(ORIGENS_BASICAS_CONTABIL).catch(() => null))?.length;
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
        registrarResultadoRobo("reconciliador", `${novosWorkspaces.criados.length ? `${novosWorkspaces.criados.length} empresa(s) nova(s) ganharam o plano padrão e entraram na reconciliação; ` : ""}${novosWorkspaces.falhas.length ? `${novosWorkspaces.falhas.length} empresa(s) não conseguiram workspace inicial (tenta de novo no próximo minuto); ` : ""}${cnpjs.length} empresa(s) com mapeamento reconciliada(s); ${criados} pré-lançamento(s) criado(s), ${atualizados} atualizado(s), ${falhas} falha(s). Mapeamentos padrão aplicados sozinhos neste ciclo: ${mapeamentosAplicados}${ultimoMapeamentoAutomatico.semMapeamentoAinda ? `; ${ultimoMapeamentoAutomatico.semMapeamentoAinda} empresa(s) ainda precisam de mapeamento manual (o plano de contas delas não bate com o padrão)` : ""}.`);
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
