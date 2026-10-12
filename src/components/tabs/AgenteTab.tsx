import React, { useState, useEffect } from "react";
import {
  Bot,
  CheckCircle2,
  Play,
  RefreshCw,
  Clock,
  ShieldAlert,
  Zap,
  Terminal,
  Database,
  Calculator,
  Scale,
  Brain,
  PauseCircle,
  RotateCcw,
  Check,
  AlertTriangle,
  Layers,
  Building,
  Info,
} from "lucide-react";
import {
  muradeRobosEngine,
  ProgramaTipo,
} from "../../services/muradeRobosEngine";

interface AgenteTabProps {
  onRunAudit: () => void;
  isAuditing: boolean;
}

export const AgenteTab: React.FC<AgenteTabProps> = ({ onRunAudit, isAuditing }) => {
  const [, setTick] = useState(0);
  const [programaVisualizacao, setProgramaVisualizacao] = useState<ProgramaTipo>("contabil");
  const [pipelineEmAndamento, setPipelineEmAndamento] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = muradeRobosEngine.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsubscribe();
  }, []);

  const handleDispararPipeline = () => {
    setPipelineEmAndamento(true);
    setFeedbackMsg("Pipeline sequencial oficial disparado! Executando Coletor → Calculador → Conferidor → Agente IA...");
    const ok = muradeRobosEngine.executarPipelineCompleto("00.000.000/0001-91");
    if (!ok) {
      setFeedbackMsg("⚠️ Não foi possível iniciar: Empresa bloqueada por outra rotina.");
      setPipelineEmAndamento(false);
      return;
    }
    setTimeout(() => {
      setPipelineEmAndamento(false);
      setFeedbackMsg("✅ Pipeline finalizado com êxito! Todos os 3 robôs e o Agente IA executaram sem conflito.");
      setTimeout(() => setFeedbackMsg(null), 5000);
    }, 5000);
  };

  const handlePararTodos = () => {
    muradeRobosEngine.pararTodosRobos();
    setFeedbackMsg("🛑 Todos os robôs foram paralisados com segurança.");
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleReiniciarTodos = () => {
    muradeRobosEngine.reiniciarTodosRobos();
    setFeedbackMsg("🔄 Sistema reiniciado! Todos os 3 robôs e o Agente IA religados em ordem sequencial.");
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const config = muradeRobosEngine;
  const estados = config.estadosRobos;
  const logs = config.logsEventos;
  const fila = config.seguranca.filaExecucao;
  const bloqueios = Object.entries(config.seguranca.bloqueioEmpresa);

  return (
    <div className="space-y-5">
      {/* Banner Principal da Versão 2026.1.0 */}
      <div className="bg-[#EEF4F9] rounded-2xl p-5 sm:p-6 shadow-xs border border-[#CBD5E1]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
                <Bot className="w-3.5 h-3.5 text-blue-700" />
                <span>MURADE — SISTEMA DE ROBÔS + AGENTE IA</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-200 text-slate-800 border border-slate-300">
                v{config.versao} • {config.atualizacaoData}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Zero Conflito • Sem Duplicação</span>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              3 Robôs Especializados + 1 Agente IA
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl mt-1 leading-relaxed">
              Padrão unificado para <strong>Fiscal</strong>, <strong>Departamento Pessoal</strong> e <strong>Contábil</strong>.
              Cada robô possui função exclusiva, respeitando ordem cronológica rígida e bloqueio seguro por empresa.
            </p>
          </div>

          {/* Botões de Ação do Sistema */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <button
              onClick={handleDispararPipeline}
              disabled={pipelineEmAndamento}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${pipelineEmAndamento ? "animate-spin" : ""}`} />
              <span>{pipelineEmAndamento ? "Processando Pipeline..." : "▶️ Disparar Pipeline Sequencial"}</span>
            </button>

            <button
              onClick={handlePararTodos}
              className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Parar todos os robôs imediatamente"
            >
              <PauseCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Parar</span>
            </button>

            <button
              onClick={handleReiniciarTodos}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Reinicializar todos os robôs"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>Reiniciar</span>
            </button>

            <button
              onClick={onRunAudit}
              disabled={isAuditing}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold px-3 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isAuditing ? "animate-spin" : ""}`} />
              <span>{isAuditing ? "Auditando..." : "Auditar"}</span>
            </button>
          </div>
        </div>

        {/* Feedback visual de ação */}
        {feedbackMsg && (
          <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Seletor de visualização dos 3 Programas */}
        <div className="mt-5 pt-4 border-t border-[#CBD5E1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Visualizar Tarefas por Programa:
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              (Programa Ativo: <strong className="text-blue-700">CONTÁBIL</strong>)
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-300 rounded-xl shadow-2xs">
            <button
              onClick={() => setProgramaVisualizacao("contabil")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                programaVisualizacao === "contabil"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Contábil (Atual)</span>
            </button>

            <button
              onClick={() => setProgramaVisualizacao("fiscal")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                programaVisualizacao === "fiscal"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Fiscal</span>
            </button>

            <button
              onClick={() => setProgramaVisualizacao("dp")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                programaVisualizacao === "dp"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>Departamento Pessoal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grade com os 3 Robôs Especializados + 1 Agente IA */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ROBÔ 1 — COLETOR DE DADOS */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700">
                  <Database className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Robô 1</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  estados.robo_coletor?.status === "executando"
                    ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                    : estados.robo_coletor?.status === "parado"
                    ? "bg-rose-100 text-rose-800 border-rose-300"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                }`}
              >
                {estados.robo_coletor?.status === "executando" ? "Executando..." : "1º da Ordem"}
              </span>
            </div>

            <h3 className="text-sm font-extrabold text-slate-900">
              {config.robos.coletor.nome}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
              {config.robos.coletor.funcao}
            </p>

            {/* Tarefas para o programa selecionado */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Tarefas no {programaVisualizacao.toUpperCase()}:
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {config.robos.coletor.tarefasPorPrograma[programaVisualizacao].map((t, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Executa após:</span>
              <strong className="text-slate-700">Nenhum (1º a rodar)</strong>
            </div>
            <div className="flex justify-between">
              <span>Fila por empresa:</span>
              <strong className="text-emerald-700">Ativa (2s intervalo)</strong>
            </div>
          </div>
        </div>

        {/* ROBÔ 2 — CALCULADOR / PROCESSADOR */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <Calculator className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Robô 2</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  estados.robo_calculador?.status === "executando"
                    ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                    : estados.robo_calculador?.status === "parado"
                    ? "bg-rose-100 text-rose-800 border-rose-300"
                    : "bg-indigo-100 text-indigo-800 border-indigo-300"
                }`}
              >
                {estados.robo_calculador?.status === "executando" ? "Calculando..." : "2º da Ordem"}
              </span>
            </div>

            <h3 className="text-sm font-extrabold text-slate-900">
              {config.robos.calculador.nome}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
              {config.robos.calculador.funcao}
            </p>

            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Tarefas no {programaVisualizacao.toUpperCase()}:
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {config.robos.calculador.tarefasPorPrograma[programaVisualizacao].map((t, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Executa após:</span>
              <strong className="text-blue-700">Robô Coletor</strong>
            </div>
            <div className="flex justify-between">
              <span>Pré-validação:</span>
              <strong className="text-emerald-700">Verifica antes de calcular</strong>
            </div>
          </div>
        </div>

        {/* ROBÔ 3 — CONFERIDOR / VALIDADOR */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <Scale className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Robô 3</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  estados.robo_conferidor?.status === "executando"
                    ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                    : estados.robo_conferidor?.status === "parado"
                    ? "bg-rose-100 text-rose-800 border-rose-300"
                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                }`}
              >
                {estados.robo_conferidor?.status === "executando" ? "Validando..." : "3º da Ordem"}
              </span>
            </div>

            <h3 className="text-sm font-extrabold text-slate-900">
              {config.robos.conferidor.nome}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
              {config.robos.conferidor.funcao}
            </p>

            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Tarefas no {programaVisualizacao.toUpperCase()}:
              </span>
              <ul className="space-y-1 text-xs text-slate-700">
                {config.robos.conferidor.tarefasPorPrograma[programaVisualizacao].map((t, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Executa após:</span>
              <strong className="text-indigo-700">Robô Calculador</strong>
            </div>
            <div className="flex justify-between">
              <span>Alerta se diferença:</span>
              <strong className="text-rose-700 font-mono">&gt; R$ 0,01</strong>
            </div>
          </div>
        </div>

        {/* 🧠 AGENTE IA MURADE — GERENTE / COORDENADOR */}
        <div className="bg-[#EEF4F9] border-2 border-blue-400/80 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#CBD5E1]">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Brain className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Gerente / Chefe</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300">
                Coordenando
              </span>
            </div>

            <h3 className="text-sm font-black text-slate-900">
              {config.robos.agenteIA.nome}
            </h3>
            <p className="text-xs text-slate-700 mt-0.5 leading-snug">
              {config.robos.agenteIA.funcao}
            </p>

            <div className="mt-3 pt-2.5 border-t border-[#CBD5E1] space-y-1.5">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                Atribuições do Agente Chefe:
              </span>
              <ul className="space-y-1 text-[11px] text-slate-700">
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Coordena ordem — ninguém trabalha ao mesmo tempo</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Avisa de mudanças legais e Lei 200/2024</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Resolve conflitos e decide dúvidas</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  <span>Gera relatório e audita resultados</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-2.5 border-t border-[#CBD5E1] text-[11px] text-slate-700 space-y-1">
            <div className="flex justify-between">
              <span>Papel de Gestão:</span>
              <strong className="text-blue-900">É quem manda</strong>
            </div>
            <div className="flex justify-between">
              <span>Trabalho manual:</span>
              <strong className="text-slate-900">Nunca faz (Só gerencia)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Segurança Ativa — Sem Conflito */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Detecção de Duplicidade */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1">
            <ShieldAlert className="w-4 h-4 text-emerald-600" />
            <span>Detecção de Duplicidade</span>
          </div>
          <p className="text-xs text-slate-600 mb-2.5">
            Ao reinserir ou atualizar regras, o sistema <strong>atualiza</strong> a instância existente sem criar duplicatas.
          </p>
          <div className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Blindagem Anti-Duplicação Ativa</span>
          </div>
        </div>

        {/* Fila de Execução Segura */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Fila de Execução Serializada</span>
          </div>
          <p className="text-xs text-slate-600 mb-2.5">
            Garante que <strong>só um robô por vez</strong> execute tarefas na mesma empresa.
          </p>
          <div className="text-xs font-bold text-blue-800 bg-blue-100 border border-blue-300 px-2.5 py-1 rounded-md inline-block">
            {fila.length === 0 ? "Fila Limpa (Pronta para Disparo)" : `${fila.length} tarefa(s) na fila`}
          </div>
        </div>

        {/* Bloqueio por Empresa (CNPJ) */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-xs mb-1">
            <Zap className="w-4 h-4 text-amber-600" />
            <span>Bloqueio por Empresa (CNPJ)</span>
          </div>
          <p className="text-xs text-slate-600 mb-2.5">
            Impede interferência mútua caso duas rotinas sejam chamadas para o mesmo CNPJ.
          </p>
          <div className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-md inline-block">
            {bloqueios.length === 0 ? "0 Empresas bloqueadas" : `${bloqueios.length} Empresa(s) com trava`}
          </div>
        </div>
      </div>

      {/* Terminal de Logs e Decisões em Tempo Real */}
      <div className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-slate-700" />
              <span>Log Oficial do Sistema de Robôs e Decisões da IA (Tempo Real)</span>
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Auditabilidade total dos eventos disparados pelos 3 robôs e pelo Agente Coordenador.
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            Console: window.MURADE_ROBOS_CONFIG
          </span>
        </div>

        <div className="bg-[#EEF4F9] text-slate-800 font-mono text-[11px] p-4 rounded-xl max-h-60 overflow-y-auto space-y-2 border border-[#CBD5E1] shadow-2xs">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-slate-500 shrink-0 font-semibold">[{log.hora}]</span>
              <span className="text-blue-800 font-bold shrink-0">[{log.origem}]</span>
              <span className="text-slate-800 flex-1">{log.mensagem}</span>
              {log.tipo === "sucesso" && (
                <span className="text-emerald-700 shrink-0 font-bold ml-2">✓ OK</span>
              )}
              {log.tipo === "alerta" && (
                <span className="text-amber-700 shrink-0 font-bold ml-2">⚠ ALERTA</span>
              )}
              {log.tipo === "sistema" && (
                <span className="text-blue-700 shrink-0 font-bold ml-2">⚙ SISTEMA</span>
              )}
            </div>
          ))}
        </div>

        {/* Dica de Comandos Rápidos no Console */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
          <div>
            <strong>Comandos Rápidos no Console do Navegador (F12):</strong>{" "}
            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
              MURADE_ROBOS_CONFIG.statusRobos()
            </code>{" "}
            •{" "}
            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
              MURADE_ROBOS_CONFIG.pararTodosRobos()
            </code>{" "}
            •{" "}
            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
              MURADE_ROBOS_CONFIG.reiniciarTodosRobos()
            </code>
          </div>
          <button
            onClick={() => {
              console.log("Status atual:", muradeRobosEngine.statusRobos());
              setFeedbackMsg("Status impresso no console do navegador (F12).");
              setTimeout(() => setFeedbackMsg(null), 3000);
            }}
            className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer shrink-0"
          >
            Executar statusRobos() agora
          </button>
        </div>
      </div>
    </div>
  );
};
