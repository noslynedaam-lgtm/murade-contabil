import React from "react";
import { TabId } from "../types";
import {
  Plug,
  Building2,
  FileText,
  BarChart3,
  BookOpen,
  FolderTree,
  Network,
  Bot,
  ShieldCheck,
  Copy,
  Sparkles,
  Calendar,
  Calculator,
  Briefcase,
  Zap,
  Scale,
  Home,
} from "lucide-react";

interface SidebarProps {
  tabAtiva: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ tabAtiva, onSelectTab }) => {
  const navItems = [
    {
      id: "inicio" as TabId,
      label: "Tela Inicial",
      icon: Home,
      badge: "Início",
      badgeColor: "bg-emerald-300 text-slate-950 font-bold",
    },
    {
      id: "empresa" as TabId,
      label: "Cadastro de Empresa",
      icon: Building2,
      badge: "CNPJ / A1",
      badgeColor: "bg-white/20 text-white",
    },
    {
      id: "agenda" as TabId,
      label: "Agenda & Lembretes",
      icon: Calendar,
    },
    {
      id: "fluxo-previtico" as TabId,
      label: "Fluxo Prevítico",
      icon: Zap,
    },
    {
      id: "modulos-finais" as TabId,
      label: "Obrigações & Gestão",
      icon: Briefcase,
      badge: "Em configuração",
      badgeColor: "bg-amber-300 text-slate-950 font-bold",
    },
    {
      id: "conexoes" as TabId,
      label: "Conexão Órgãos",
      icon: Plug,
      badge: "Pendente",
      badgeColor: "bg-amber-500/25 text-amber-100",
    },
    {
      id: "lancamentos" as TabId,
      label: "Lançamentos",
      icon: FileText,
    },
    {
      id: "balancete" as TabId,
      label: "Balancete",
      icon: BarChart3,
    },
    {
      id: "livros" as TabId,
      label: "Livros Fiscais & ECD",
      icon: BookOpen,
    },
    {
      id: "plano-contas" as TabId,
      label: "Plano de Contas",
      icon: FolderTree,
      badge: "CPC",
      badgeColor: "bg-white/20 text-white",
    },
    {
      id: "integracao" as TabId,
      label: "Integrações",
      icon: Network,
      badge: "Pendente",
      badgeColor: "bg-amber-400/25 text-amber-100",
    },
    {
      id: "calculadora" as TabId,
      label: "Calculadora 3D",
      icon: Calculator,
      badge: "3D Pro",
      badgeColor: "bg-purple-300 text-purple-950 font-bold",
    },
    {
      id: "agente" as TabId,
      label: "Agentes & Robô",
      icon: Bot,
      badge: "Autônomo",
      badgeColor: "bg-amber-400/30 text-amber-200",
    },
    {
      id: "ia-premium" as TabId,
      label: "IA Murade Premium",
      icon: Sparkles,
      badge: "Voz v3.0",
      badgeColor: "bg-amber-300 text-slate-950 font-bold",
    },
  ];

  const copiarCodigo = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText("MURADE-2026-GO");
    }
  };

  return (
    <aside className="w-64 bg-[#082B66] text-white flex flex-col shrink-0 border-r border-[#0A357D] select-none h-full max-h-screen shadow-md overflow-hidden">
      {/* Topo da Barra Lateral: Marca Murade */}
      <div className="p-4 border-b border-[#0A357D] bg-[#082B66] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-[#082B66] flex items-center justify-center font-black text-sm shadow-md border border-blue-200 relative group">
            <span>MC</span>
            <Scale className="w-3.5 h-3.5 text-amber-600 ml-0.5" title="Símbolo Oficial da Contabilidade" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
              <span>MURADE CONTÁBIL</span>
              <Scale className="w-4 h-4 text-amber-300" title="Símbolo da Balança da Contabilidade" />
            </h1>
            <p className="text-[11px] text-blue-200 font-medium">
              Contabilidade Autônoma 2026
            </p>
          </div>
        </div>

        {/* Código de Ligação Rápido */}
        <div
          onClick={copiarCodigo}
          title="Clique para copiar código de ligação dos sistemas"
          className="mt-3.5 bg-[#06214E] hover:bg-[#0A357D] border border-blue-400/30 rounded-lg p-2.5 flex items-center justify-between cursor-pointer transition group shadow-2xs"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-300">🔑</span>
            <span className="font-mono font-bold text-amber-200 tracking-wider text-[11px]">
              MURADE-2026-GO
            </span>
          </div>
          <Copy className="w-3.5 h-3.5 text-blue-200 group-hover:text-amber-200 transition" />
        </div>
      </div>

      {/* Navegação Principal Lateral com Rolagem Independente */}
      <div className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto overscroll-contain bg-[#082B66] sidebar-scroll">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-200/90">
          Navegação Geral
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = tabAtiva === item.id;
          const isRobo = item.id === "agente";

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer text-left ${
                isActive
                  ? "bg-white text-[#082B66] shadow-md font-bold"
                  : isRobo
                  ? "bg-[#06214E] text-white hover:bg-[#0A357D] border border-blue-400/30 shadow-2xs"
                  : "text-blue-100 hover:bg-[#0A357D] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? "text-[#082B66]"
                      : isRobo
                      ? "text-blue-200"
                      : "text-blue-200"
                  }`}
                />
                <span className="truncate">
                  {item.label}
                </span>
              </div>

              {item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-xs shrink-0 font-medium ${
                    isActive
                      ? isRobo
                        ? "bg-emerald-400/20 text-emerald-800 border border-emerald-400/40 font-bold"
                        : "bg-blue-100 text-[#082B66] font-bold"
                      : isRobo
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-400/30"
                      : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Rodapé da Barra Lateral */}
      <div className="p-3 border-t border-[#0A357D] bg-[#082B66] shrink-0">
        <div className="bg-[#06214E] border border-blue-400/30 rounded-lg p-2 text-[11px] text-white flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="font-semibold text-white">Certificado A1</span>
          </div>
          <span className="text-amber-200 font-bold text-[10px] bg-amber-900/40 px-1.5 py-0.5 rounded-xs">Não configurado</span>
        </div>
      </div>
    </aside>
  );
};
