// ==========================================================
// MURADE — SISTEMA DE ROBÔS + AGENTE IA
// VERSÃO: 2026.1.0 | PADRÃO PARA TODOS OS 3 PROGRAMAS
// FISCAL • DEPARTAMENTO PESSOAL • CONTÁBIL
// 3 Robôs Especializados + 1 Agente IA — SEM CONFLITO
// ==========================================================

export type ProgramaTipo = "fiscal" | "dp" | "contabil" | "geral";

export interface RoboConfig {
  id: string;
  nome: string;
  funcao: string;
  tarefasPorPrograma: {
    fiscal: string[];
    dp: string[];
    contabil: string[];
  };
  regras: {
    executaApos: string[];
    nuncaSobrepoe: boolean;
    filaPorEmpresa: boolean;
    maxTentativas?: number;
    intervaloEntreEmpresas?: number;
    verificaAntesDeCalcular?: boolean;
    alertaSeDiferencaMaiorQue?: number;
  };
}

export interface AgenteIAConfig {
  id: string;
  nome: string;
  funcao: string;
  tarefas: string[];
  regras: {
    eChefe: boolean;
    nuncaFazTrabalhoManual: boolean;
    sempreRespondeAoUsuario: boolean;
    registraTodasDecisoes: boolean;
  };
}

export interface TarefaFila {
  id: string;
  nome: string;
  roboId: string;
  cnpj?: string;
  tempo?: number;
  executar?: () => Promise<void> | void;
}

export interface RoboStatusItem {
  id: string;
  chave: string;
  nome: string;
  funcao: string;
  ativo: boolean;
  status: "inativo" | "ativo" | "executando" | "coordenando" | "parado" | "concluido";
  ultimaAcao?: string;
  ultimoTimestamp?: string;
}

type Listener = () => void;

class MuradeRobosEngine {
  public versao = "2026.1.0";
  public atualizacaoData = "15/09/2026";
  public programaAtual: ProgramaTipo = "contabil";

  private listeners: Set<Listener> = new Set();
  private processamentoId = 0;

  public robos: {
    coletor: RoboConfig;
    calculador: RoboConfig;
    conferidor: RoboConfig;
    agenteIA: AgenteIAConfig;
  } = {
    // 🤖 ROBÔ 1 — COLETOR DE DADOS
    coletor: {
      id: "robo_coletor",
      nome: "Robô Coletor de Dados",
      funcao: "Busca e coleta dados externos — gov, SEFAZ, eSocial, Serpro",
      tarefasPorPrograma: {
        fiscal: ["Baixar NF-e entrada/saída", "Consultar SEFAZ", "Buscar guias de ICMS/ISS"],
        dp: ["Buscar dados eSocial", "Importar folha de pagamento", "Consultar CAGED, SEFIP"],
        contabil: ["Receber dados do DP e Fiscal", "Importar extratos bancários", "Buscar saldos"],
      },
      regras: {
        executaApos: [], // Primeiro a rodar
        nuncaSobrepoe: true,
        filaPorEmpresa: true,
        maxTentativas: 3,
        intervaloEntreEmpresas: 2000, // 2 segundos entre empresas
      },
    },

    // 🤖 ROBÔ 2 — CALCULADOR / PROCESSADOR
    calculador: {
      id: "robo_calculador",
      nome: "Robô Calculador",
      funcao: "Processa e calcula os valores — impostos, folha, lançamentos",
      tarefasPorPrograma: {
        fiscal: ["Calcular ICMS/ST/PIS/COFINS/IPI", "Apurar impostos", "Calcular créditos"],
        dp: ["Calcular salário", "INSS/FGTS/IRRF", "Férias, 13º, rescisão", "Horas extras"],
        contabil: ["Fazer lançamentos contábeis automáticos", "Fechar balancete", "Calcular saldos"],
      },
      regras: {
        executaApos: ["robo_coletor"], // SÓ roda DEPOIS que o Coletor terminou
        nuncaSobrepoe: true,
        filaPorEmpresa: true,
        verificaAntesDeCalcular: true,
      },
    },

    // 🤖 ROBÔ 3 — CONFERIDOR / VALIDADOR
    conferidor: {
      id: "robo_conferidor",
      nome: "Robô Conferidor",
      funcao: "Confere, valida e avisa de erros antes de finalizar",
      tarefasPorPrograma: {
        fiscal: ["Conferir apuração com guia", "Verificar CST/CSOSN", "Avisar de divergências"],
        dp: ["Conferir cálculo de INSS/IRRF", "Verificar base de cálculo", "Conferir valores finais"],
        contabil: ["Conferir débito = crédito", "Verificar contas", "Balancete conferência"],
      },
      regras: {
        executaApos: ["robo_calculador"], // SÓ roda DEPOIS que o Calculador terminou
        nuncaSobrepoe: true,
        filaPorEmpresa: true,
        alertaSeDiferencaMaiorQue: 0.01, // Avisa se diferença > R$0,01
      },
    },

    // 🧠 AGENTE IA — GERENTE / COORDENADOR
    agenteIA: {
      id: "agente_ia_murade",
      nome: "Agente IA Murade",
      funcao: "Coordena os 3 robôs, responde dúvidas, toma decisões, avisa de mudanças",
      tarefas: [
        "Coordena ordem dos robôs — ninguém trabalha ao mesmo tempo",
        "Responde perguntas do usuário sobre o sistema",
        "Avisa quando muda lei/alíquota/regra do governo",
        "Resolve conflitos entre robôs se houver",
        "Decide o que fazer quando encontra dúvida",
        "Gera relatório do que foi feito",
      ],
      regras: {
        eChefe: true, // É quem manda — resolve qualquer conflito
        nuncaFazTrabalhoManual: true, // Não coleta nem calcula — só gerencia
        sempreRespondeAoUsuario: true,
        registraTodasDecisoes: true,
      },
    },
  };

  // ==========================================================
  // SISTEMA DE SEGURANÇA — NUNCA DÁ CONFLITO
  // ==========================================================
  public seguranca = {
    // DETECÇÃO DE DUPLICAÇÃO — SE COLOCAR DE NOVO, SÓ ATUALIZA
    detectarDuplicidade: (nomeRobo: string) => {
      const existente = typeof document !== "undefined" ? document.querySelector(`[data-robo="${nomeRobo}"]`) : null;
      if (existente) {
        console.log(`♻️ ${nomeRobo} já existe — ATUALIZANDO, não duplicando`);
        existente.remove();
        return true;
      }
      return false;
    },

    // FILA DE EXECUÇÃO — SÓ UM POR VEZ NA MESMA EMPRESA
    filaExecucao: [] as TarefaFila[],
    emExecucao: false,

    adicionarNaFila: (tarefa: TarefaFila) => {
      this.seguranca.filaExecucao.push(tarefa);
      this.emitChange();
      this.seguranca.processarFila();
    },

    processarFila: () => {
      if (this.seguranca.emExecucao || this.seguranca.filaExecucao.length === 0) return;

      this.seguranca.emExecucao = true;
      const proxima = this.seguranca.filaExecucao.shift();
      if (!proxima) {
        this.seguranca.emExecucao = false;
        return;
      }

      console.log(`▶️ Executando: ${proxima.nome}`);
      this.atualizarStatusRobo(proxima.roboId, "executando", `Executando: ${proxima.nome}`);

      const processamentoId = this.processamentoId;
      const tempo = proxima.tempo ?? 0;
      void (async () => {
        try {
          if (tempo > 0) await new Promise((resolve) => setTimeout(resolve, tempo));
          if (processamentoId !== this.processamentoId) return;
          await proxima.executar?.();
          if (processamentoId === this.processamentoId) {
            this.atualizarStatusRobo(proxima.roboId, "concluido", `Conferência local concluída: ${proxima.nome}`);
          }
        } catch (error) {
          console.error("Erro na tarefa:", error);
          this.atualizarStatusRobo(proxima.roboId, "parado", `Falha: ${proxima.nome}`);
          this.registrarLog("Sistema de Segurança", `A tarefa '${proxima.nome}' falhou. Verifique os dados e tente novamente.`, "alerta");
        } finally {
          if (processamentoId === this.processamentoId) {
            this.seguranca.emExecucao = false;
            this.emitChange();
            this.seguranca.processarFila();
          }
        }
      })();
    },

    // BLOQUEIO POR EMPRESA — NUNCA DOIS ROBÔS NA MESMA EMPRESA AO MESMO TEMPO
    bloqueioEmpresa: {} as Record<string, string>,

    podeExecutarNaEmpresa: (cnpj: string, roboId: string): boolean => {
      const bloqueio = this.seguranca.bloqueioEmpresa[cnpj];
      if (!bloqueio) return true;
      if (bloqueio === roboId) return true;
      return false; // Outro robô tá trabalhando nela — espera
    },

    bloquearEmpresa: (cnpj: string, roboId: string) => {
      this.seguranca.bloqueioEmpresa[cnpj] = roboId;
      this.emitChange();
    },

    desbloquearEmpresa: (cnpj: string) => {
      delete this.seguranca.bloqueioEmpresa[cnpj];
      this.emitChange();
    },
  };

  public estadosRobos: Record<string, RoboStatusItem> = {
    robo_coletor: {
      id: "robo_coletor",
      chave: "coletor",
      nome: "Robô Coletor de Dados",
      funcao: "Busca e coleta dados externos — gov, SEFAZ, eSocial, Serpro",
      ativo: false,
      status: "inativo",
      ultimaAcao: "Aguardando dados; fontes externas não configuradas",
    },
    robo_calculador: {
      id: "robo_calculador",
      chave: "calculador",
      nome: "Robô Calculador",
      funcao: "Processa e calcula os valores — impostos, folha, lançamentos",
      ativo: false,
      status: "inativo",
      ultimaAcao: "Aguardando lançamentos locais",
    },
    robo_conferidor: {
      id: "robo_conferidor",
      chave: "conferidor",
      nome: "Robô Conferidor",
      funcao: "Confere, valida e avisa de erros antes de finalizar",
      ativo: false,
      status: "inativo",
      ultimaAcao: "Aguardando lançamentos locais",
    },
    agente_ia_murade: {
      id: "agente_ia_murade",
      chave: "agenteIA",
      nome: "Agente IA Murade",
      funcao: "Coordena os 3 robôs, responde dúvidas, toma decisões, avisa de mudanças",
      ativo: false,
      status: "inativo",
      ultimaAcao: "Aguardando configuração",
    },
  };

  public logsEventos: Array<{
    id: string;
    hora: string;
    origem: string;
    tipo: "info" | "sucesso" | "alerta" | "sistema";
    mensagem: string;
  }> = [
    {
      id: "init_1",
      hora: "14:30:00",
      origem: "Sistema Murade",
      tipo: "info",
      mensagem: "Modo de demonstração. Nenhuma rotina ou integração foi executada automaticamente.",
    },
  ];

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange() {
    this.listeners.forEach((l) => l());
  }

  public registrarLog(origem: string, mensagem: string, tipo: "info" | "sucesso" | "alerta" | "sistema" = "info") {
    const agora = new Date();
    const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.logsEventos.unshift({
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      hora,
      origem,
      tipo,
      mensagem,
    });
    if (this.logsEventos.length > 50) this.logsEventos.pop();
    this.emitChange();
  }

  public atualizarStatusRobo(roboId: string, status: RoboStatusItem["status"], ultimaAcao?: string) {
    if (this.estadosRobos[roboId]) {
      this.estadosRobos[roboId].status = status;
      if (ultimaAcao) {
        this.estadosRobos[roboId].ultimaAcao = ultimaAcao;
        this.estadosRobos[roboId].ultimoTimestamp = "Agora mesmo";
      }
      this.emitChange();
    }
  }

  // ==========================================================
  // DETECÇÃO AUTOMÁTICA DO PROGRAMA
  // ==========================================================
  public detectarPrograma(): ProgramaTipo {
    if (typeof window !== "undefined") {
      const url = window.location.href.toLowerCase();
      if (url.includes("fiscal")) return "fiscal";
      if (url.includes("dp") || url.includes("pessoal")) return "dp";
      if (url.includes("contabil")) return "contabil";
    }
    return "contabil";
  }

  // ==========================================================
  // INICIALIZAÇÃO — SEGURA, SEM DUPLICAÇÃO
  // ==========================================================
  public inicializar(programaEspecifico: ProgramaTipo | null = null) {
    this.programaAtual = programaEspecifico || this.detectarPrograma();

    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🤖 MURADE — SISTEMA DE ROBÔS + AGENTE IA v${this.versao}       ║
║   Programa: ${this.programaAtual.toUpperCase().padEnd(43)}║
║                                                          ║
║   🤖 Robô 1 → Coletor (busca dados)                      ║
║   🤖 Robô 2 → Calculador (processa)                      ║
║   🤖 Robô 3 → Conferidor (valida)                        ║
║   🧠 Agente IA → Coordena tudo                          ║
║                                                          ║
║   ✅ Sem conflito • Sem duplicação • Seguro              ║
╚══════════════════════════════════════════════════════════╝
    `);

    if (typeof window !== "undefined") {
      const win = window as any;
      if (win.muradeRobosInicializado) {
        console.log("♻️ Sistema já estava ativo — ATUALIZANDO configurações");
        win.MURADE_ROBOS_CONFIG = this;
        this.registrarLog("🧠 Agente IA Murade", "Configurações de robôs recarregadas sem duplicação.", "info");
        return { acao: "ATUALIZADO", programa: this.programaAtual };
      }

      win.muradeRobosInicializado = true;
      win.MURADE_ROBOS_CONFIG = this;
    }

    this.registrarLog("Sistema Murade", "Pronto para conferências locais. Robôs externos não iniciam sem fonte de dados configurada.", "info");
    return { acao: "AGUARDANDO_DADOS", programa: this.programaAtual };
  }

  public iniciarRobo(nomeRobo: "coletor" | "calculador" | "conferidor") {
    const robo = this.robos[nomeRobo];
    console.log(`✅ ${robo.nome} ATIVO — ${robo.funcao}`);

    this.atualizarStatusRobo(robo.id, "ativo", "Ativo e sincronizado");
    this.registrarLog(`🤖 ${robo.nome}`, `Inicializado em ordem sequencial (${robo.funcao})`, "sucesso");

    if (typeof document !== "undefined") {
      if (!document.querySelector(`[data-robo="${robo.id}"]`)) {
        const el = document.createElement("div");
        el.setAttribute("data-robo", robo.id);
        el.style.display = "none";
        el.dataset.status = "ativo";
        document.body.appendChild(el);
      }
    }
  }

  public iniciarAgenteIA() {
    const agente = this.robos.agenteIA;
    console.log(`🧠 ${agente.nome} ATIVO — ${agente.funcao}`);

    this.atualizarStatusRobo(agente.id, "coordenando", "Coordenação ativa em tempo real");
    this.registrarLog(`🧠 ${agente.nome}`, "Chefe/Coordenador ativo — garantindo zero concorrência entre robôs", "sucesso");

    if (typeof document !== "undefined") {
      if (!document.querySelector(`[data-robo="${agente.id}"]`)) {
        const el = document.createElement("div");
        el.setAttribute("data-robo", agente.id);
        el.style.display = "none";
        el.dataset.status = "coordenando";
        document.body.appendChild(el);
      }
    }
  }

  // ==========================================================
  // DISPARO DE PIPELINE COMPLETO EM SEQUÊNCIA (SEM CONFLITO)
  // ==========================================================
  public executarPipelineCompleto(
    cnpjEmpresa = "local",
    lancamentos: Array<{ valor: number; contaDebitoCodigo: string; contaCreditoCodigo: string }> = []
  ) {
    if (this.seguranca.bloqueioEmpresa[cnpjEmpresa]) {
      this.registrarLog(
        "🧠 Agente IA Murade",
        `Já existe um processamento para ${cnpjEmpresa}. Aguarde a fila atual terminar.`,
        "alerta"
      );
      return false;
    }

    this.seguranca.bloquearEmpresa(cnpjEmpresa, "pipeline");
    this.registrarLog(
      "🧠 Agente IA Murade",
      `Iniciando conferência local de ${lancamentos.length} lançamento(s). Nenhuma fonte externa será consultada.`,
      "sistema"
    );

    let invalidos: typeof lancamentos = [];

    // 1. Robô Coletor
    this.seguranca.adicionarNaFila({
      id: "task_coletor_" + Date.now(),
      nome: "Robô 1: Preparar registros locais",
      roboId: "robo_coletor",
      cnpj: cnpjEmpresa,
      tempo: 350,
      executar: () => {
        this.registrarLog(
          "🤖 Robô Coletor",
          `${lancamentos.length} lançamento(s) recebido(s) da tela atual. Fiscal, bancos e Departamento Pessoal não foram consultados.`,
          "info"
        );
      },
    });

    // 2. Robô Calculador (roda estritamente APÓS o coletor)
    this.seguranca.adicionarNaFila({
      id: "task_calculador_" + Date.now(),
      nome: "Robô 2: Validar campos dos lançamentos",
      roboId: "robo_calculador",
      cnpj: cnpjEmpresa,
      tempo: 350,
      executar: () => {
        invalidos = lancamentos.filter((item) =>
          !Number.isFinite(item.valor) || item.valor <= 0 || !item.contaDebitoCodigo || !item.contaCreditoCodigo
        );
        this.registrarLog(
          "🤖 Robô Calculador",
          `Validação básica concluída. ${invalidos.length} registro(s) com valor ou conta inválidos. Não foram calculados tributos ou folha.`,
          invalidos.length ? "alerta" : "info"
        );
      },
    });

    // 3. Robô Conferidor (roda estritamente APÓS o calculador)
    this.seguranca.adicionarNaFila({
      id: "task_conferidor_" + Date.now(),
      nome: "Robô 3: Relatar integridade básica",
      roboId: "robo_conferidor",
      cnpj: cnpjEmpresa,
      tempo: 350,
      executar: () => {
        this.registrarLog(
          "🤖 Robô Conferidor",
          lancamentos.length === 0
            ? "Nenhum lançamento disponível para auditar."
            : `${lancamentos.length - invalidos.length} de ${lancamentos.length} lançamento(s) têm valor positivo e códigos de conta preenchidos. Isso não confirma D = C.`,
          invalidos.length === 0 && lancamentos.length > 0 ? "info" : "alerta"
        );
      },
    });

    // 4. Finalização pelo Agente IA
    this.seguranca.adicionarNaFila({
      id: "task_agente_" + Date.now(),
      nome: "Agente IA: Encerrar conferência local",
      roboId: "agente_ia_murade",
      cnpj: cnpjEmpresa,
      tempo: 350,
      executar: () => {
        this.seguranca.desbloquearEmpresa(cnpjEmpresa);
        this.registrarLog(
          "🧠 Agente IA Murade",
          "Conferência local encerrada. Nenhum livro foi fechado ou transmitido.",
          "info"
        );
      },
    });

    return true;
  }

  // ==========================================================
  // COMANDOS EXTERNOS — VOCÊ CONTROLA TUDO
  // ==========================================================
  public pararTodosRobos() {
    console.log("🛑 PARANDO TODOS OS ROBÔS...");
    this.processamentoId += 1;
    this.seguranca.emExecucao = false;
    this.seguranca.filaExecucao = [];
    this.seguranca.bloqueioEmpresa = {};

    Object.keys(this.estadosRobos).forEach((id) => {
      this.atualizarStatusRobo(id, "parado", "Interrompido manualmente pelo usuário");
    });

    if (typeof document !== "undefined") {
      document.querySelectorAll("[data-robo]").forEach((el: any) => {
        el.dataset.status = "parado";
      });
    }

    this.registrarLog("🛑 Sistema de Segurança", "Todos os robôs foram paralisados. Fila esvaziada.", "alerta");
    return { status: "TODOS_PARADOS" };
  }

  public reiniciarTodosRobos() {
    console.log("🔄 REINICIANDO TODOS OS ROBÔS...");
    this.pararTodosRobos();
    Object.keys(this.estadosRobos).forEach((id) => {
      this.atualizarStatusRobo(id, "inativo", "Aguardando novos dados e integrações configuradas");
    });
    this.registrarLog("Sistema de Segurança", "Fila limpa. Os robôs aguardam um novo processamento manual.", "info");
    return { status: "AGUARDANDO_DADOS" };
  }

  public statusRobos() {
    const status: Record<string, any> = {};
    Object.entries(this.robos).forEach(([chave, robo]) => {
      status[chave] = {
        nome: robo.nome,
        ativo: this.estadosRobos[robo.id]?.ativo ?? false,
        status: this.estadosRobos[robo.id]?.status || "inativo",
        funcao: robo.funcao,
      };
    });
    return status;
  }
}

// Instância Singleton Oficial
export const muradeRobosEngine = new MuradeRobosEngine();

// Registra o serviço para a UI, sem iniciar tarefas automáticas.
if (typeof window !== "undefined") {
  const win = window as any;
  win.MURADE_ROBOS_CONFIG = muradeRobosEngine;

  muradeRobosEngine.inicializar();
}
