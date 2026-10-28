import React, { useState } from "react";
import { Bot, CheckCircle2, RefreshCw, AlertCircle, ArrowUpRight } from "lucide-react";

interface RobotSidebarProps {
  onRunAudit: () => void;
  isAuditing: boolean;
  onNavigateTab: (tab: any) => void;
}

export const RobotSidebar: React.FC<RobotSidebarProps> = ({
  onRunAudit,
  isAuditing,
  onNavigateTab,
}) => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={aberto ? "Minimizar Agente e Robô Murade" : "Abrir Agente e Robô Murade"}
        className="fixed bottom-6 left-4 z-40 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur hover:shadow-blue-500/20 lg:left-[13.5rem]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white"><Bot className="h-4 w-4" /></span>
        <span className="hidden sm:inline">Robôs</span>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </button>
      {aberto && (
    <div className="fixed bottom-20 left-4 z-40 max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-xl shadow-2xl lg:left-[13.5rem]">
      {/* Card Principal do Robô — Tema Claro em Cinza Meio Azulado */}
      <div className="bg-gradient-to-b from-[#EEF4F9] via-[#E8EFF6] to-[#DEE8F3] text-slate-800 rounded-xl p-5 shadow-xs border border-[#CBD5E1]">
        <h3 className="text-sm font-extrabold text-slate-900 text-center uppercase tracking-wider mb-3 flex items-center justify-center gap-1.5">
          <Bot className="w-4 h-4 text-blue-600" />
          <span>Agente & Robô Murade</span>
        </h3>

        {/* Avatar Animado que sobe e desce */}
        <div className="relative w-14 h-14 mx-auto mb-2">
          <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md border-2 border-white">
            <Bot className="w-10 h-10 text-white animate-pulse" />
          </div>
          <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-600 border-2 border-white rounded-full flex items-center justify-center shadow-xs">
            <span className="w-2 h-2 bg-white rounded-full" />
          </span>
        </div>

        <div className="text-center mb-4">
          <div className="font-bold text-slate-900 text-sm">Murade Robôs + Agente IA</div>
          <div className="text-[11px] text-blue-700 font-mono font-bold">Padrão Unificado v2026.1.0</div>
          <div className="text-xs text-emerald-700 font-semibold flex items-center justify-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pipeline local • fontes não conectadas</span>
          </div>
        </div>

        {/* Quadro dos 3 Robôs + Agente IA */}
        <div className="bg-white/90 border border-slate-300 rounded-lg p-2.5 mb-3 text-[11px] space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>1. Coletor (Gov/Extratos):</span>
            </span>
            <span className="font-bold text-amber-800">Aguardando integração</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              <span>2. Calculador (Partidas):</span>
            </span>
            <span className="font-bold text-indigo-800">Não executado</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>3. Conferidor (D = C):</span>
            </span>
            <span className="font-bold text-amber-800">Aguardando dados</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-slate-700 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>🧠 Agente IA Coordenador:</span>
            </span>
            <span className="font-bold text-slate-900">Sob demanda</span>
          </div>
        </div>

        {/* Indicadores de Status */}
        <div className="space-y-2.5 text-xs border-t border-b border-slate-300/80 py-3 mb-3 text-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-slate-600">Conformidade Contábil:</span>
              <span className="font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-sm">Não verificado</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600">Partidas Dobradas:</span>
            <span className="font-semibold text-slate-900">Aguardando dados confiáveis</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-600">Competência Vigente:</span>
            <span className="font-semibold text-blue-900 font-mono">Não definida</span>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-600">Progresso do Fechamento:</span>
              <span className="font-bold text-slate-600">Pendente</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden border border-slate-300">
              <div className="bg-slate-400 h-2 rounded-full transition-all duration-500" style={{ width: "0%" }} />
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="space-y-2">
          <button
            onClick={() => onNavigateTab("ia-premium")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>🧠 Abrir IA Murade Premium (Voz v3.0)</span>
          </button>

          <button
            id="btn-sidebar-auditoria"
            onClick={onRunAudit}
            disabled={isAuditing}
            className="w-full bg-white hover:bg-slate-100 text-slate-800 font-semibold py-2 px-3 rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-2xs border border-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isAuditing ? "animate-spin" : ""}`} />
            <span>{isAuditing ? "Auditoria em Execução..." : "🔍 Rodar Auditoria Completa"}</span>
          </button>

          <button
            onClick={() => onNavigateTab("agente")}
            className="w-full bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-300 font-bold py-2 px-3 rounded-lg text-xs transition flex items-center justify-between cursor-pointer shadow-2xs"
          >
            <span className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-blue-700" />
              <span>Painel 3 Robôs + Agente IA</span>
            </span>
            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-mono font-bold">
              v2026.1.0
            </span>
          </button>

          <button
            onClick={() => onNavigateTab("conexoes")}
            className="w-full bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold py-2 px-3 rounded-lg text-xs transition flex items-center justify-between cursor-pointer shadow-2xs"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Integrações não configuradas</span>
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
              Aguardando credenciais
            </span>
          </button>

          <button
            onClick={() => onNavigateTab("integracao")}
            className="w-full bg-white hover:bg-slate-100 text-slate-700 font-medium py-2 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-300 shadow-2xs"
          >
            <span>Ver Fluxo Módulos</span>
            <ArrowUpRight className="w-3 h-3 text-slate-500" />
          </button>
        </div>

        {/* Status Modo Autônomo */}
        <div className="mt-4 pt-3 border-t border-slate-300/80 flex items-center justify-between text-xs">
          <span className="text-slate-600">Agendamento Automático (não configurado):</span>
          <button
            disabled
            className="font-semibold px-2.5 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-700 border border-slate-300"
          >
            Não configurado
          </button>
        </div>
      </div>

      {/* Card Rápido: Reforma Tributária 2026 */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 shadow-xs">
        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs mb-1">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <span>Reforma Tributária 2026 (IBS / CBS)</span>
        </div>
        <p className="text-[12px] text-amber-900/90 leading-relaxed mb-2">
          Em 2026, as alíquotas de teste gerais são IBS 0,1% e CBS 0,9%. Este protótipo não calcula tributos nem lança créditos automaticamente; valide regras e enquadramento.
        </p>
        <button
          onClick={() => onNavigateTab("empresa")}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
        >
          <span>Conferir Parâmetros Fiscais</span> →
        </button>
      </div>
    </div>
      )}
    </>
  );
};
