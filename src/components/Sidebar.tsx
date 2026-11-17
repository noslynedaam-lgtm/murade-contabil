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
  Database,
  ClipboardCheck,
  ShieldHalf,
} from "lucide-react";

interface SidebarProps {
  tabAtiva: TabId;
  onSelectTab: (tab: TabId) => void;
  pendentesAprovacao?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ tabAtiva, onSelectTab, pendentesAprovacao = 0 }) => {
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
      id: "gestao-contabil" as TabId,
      label: "Gestão contábil",
      icon: Briefcase,
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
      id: "aprovacoes" as TabId,
      label: "Aprovar lançamentos",
      icon: FileText,
      ...(pendentesAprovacao > 0 ? { badge: String(pendentesAprovacao), badgeColor: "bg-amber-400 text-slate-950 font-bold" } : {}),
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
      id: "migracao" as TabId,
      label: "Migração Contábil",
      icon: Database,
      badge: "4 etapas",
      badgeColor: "bg-cyan-300 text-cyan-950 font-bold",
    },
    {
      id: "integracao" as TabId,
      label: "Integrações",
      icon: Network,
      badge: "Pendente",
      badgeColor: "bg-amber-400/25 text-amber-100",
    },
    {
      id: "revisao-origens" as TabId,
      label: "Revisar dados recebidos",
      icon: ClipboardCheck,
      badge: "Fiscal + DP",
      badgeColor: "bg-cyan-300 text-cyan-950 font-bold",
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
      id: "backups" as TabId,
      label: "Backups",
      icon: ShieldHalf,
      badge: "Mensal",
      badgeColor: "bg-emerald-400/30 text-emerald-100",
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
    <aside className="w-52 bg-[var(--marca-fundo)] text-white flex flex-col shrink-0 border-r border-[var(--marca-borda)] select-none h-full max-h-screen shadow-md overflow-hidden">
      {/* Topo da Barra Lateral: Marca Murade */}
      <div className="px-3 py-2 border-b border-[var(--marca-borda)] bg-[var(--marca-fundo)] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white text-[var(--marca-fundo)] flex items-center justify-center font-black text-sm border border-amber-300 relative group ring-2 ring-[var(--marca)] shadow-[0_0_10px_2px_rgba(217,119,6,0.65)]">
            <span>MC</span>
            <Scale className="w-3.5 h-3.5 text-[var(--marca-escura)] ml-0.5" title="Símbolo Oficial da Contabilidade" />
          </div>
          <div>
            <h1 className="text-xs font-black text-white tracking-tight flex items-center gap-1">
              <span>MURADE CONTÁBIL</span>
            </h1>
            <span className="mt-0.5 inline-block rounded-sm bg-[var(--marca-escura)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">Contábil</span>

          </div>
        </div>

        {/* Código de Ligação Rápido */}
        <div
          onClick={copiarCodigo}
          title="Clique para copiar código de ligação dos sistemas"
          className="mt-2 bg-[var(--marca-fundo-2)] hover:bg-[var(--marca-fundo-2)] border border-amber-400/30 rounded-md px-2 py-1.5 flex items-center justify-between cursor-pointer transition group shadow-2xs"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-300">🔑</span>
            <span className="font-mono font-bold text-amber-200 tracking-wider text-[11px]">
              MURADE-2026-GO
            </span>
          </div>
          <Copy className="w-3.5 h-3.5 text-amber-200 group-hover:text-amber-200 transition" />
        </div>
      </div>

      {/* Navegação Principal Lateral com Rolagem Independente */}
      <div className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto overscroll-contain bg-[var(--marca-fundo)] sidebar-scroll">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
          Navegação Geral
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = tabAtiva === item.id;
          const isRobo = item.id === "agente";

          return (
            <button
              key={item.id}
              id={`btn-menu-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer text-left ${
                isActive
                  ? "bg-[var(--marca-clara)] text-[var(--marca-fundo)] shadow-md font-bold border-l-4 border-[var(--marca)]"
                  : isRobo
                  ? "bg-[var(--marca-fundo-2)] text-white hover:bg-[var(--marca-fundo-2)] border border-amber-400/30 shadow-2xs"
                  : "text-amber-50 hover:bg-[var(--marca-fundo-2)] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? "text-[var(--marca-fundo)]"
                      : isRobo
                      ? "text-amber-200"
                      : "text-amber-200"
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
                        : "bg-amber-100 text-[var(--marca-fundo)] font-bold"
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
      <div className="p-2 border-t border-[var(--marca-borda)] bg-[var(--marca-fundo)] shrink-0">
        <div className="bg-[var(--marca-fundo-2)] border border-amber-400/30 rounded-lg p-2 text-[11px] text-white flex items-center justify-between">
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
