import React from "react";
import { TabId } from "../types";
import { ordenarMenu, useJeito } from "../utils/meuJeitoCliente";
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
  ListChecks,
  SlidersHorizontal,
  CalendarClock,
  GraduationCap,
} from "lucide-react";

interface SidebarProps {
  tabAtiva: TabId;
  onSelectTab: (tab: TabId) => void;
  pendentesAprovacao?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ tabAtiva, onSelectTab, pendentesAprovacao = 0 }) => {
  const jeito = useJeito();
  // Menu na ORDEM DO SERVIÇO (27/11/2026, pedido do Natan via dono): começa pelo que se faz primeiro e segue a sequência natural
  // da contabilidade, agrupado por etapa (campo `grupo` = título discreto da etapa, também no celular):
  // Cadastros → Lançamentos e importações → Fechamento → Obrigações → Relatórios → Robôs, revisão e tarefas → Ferramentas →
  // Configurações → Aprender (Escola sempre por último). Ids (btn-menu-<id>) e telas NÃO mudam: piloto, tour e testes continuam valendo.
  // A mesma ordem está em ORDEM_MENU_CONTABIL (tour), ETAPAS_MENU_CONTABIL (mapa) e MODULOS_JEITO_PADRAO (apresentação).
  const navItemsPadrao = [
    // Início (sem título)
    {
      id: "inicio" as TabId,
      label: "Tela Inicial",
      grupo: "",
      icon: Home,
      badge: "Início",
      badgeColor: "bg-emerald-300 text-slate-950 font-bold",
    },
    // Cadastros
    {
      id: "empresa" as TabId,
      label: "Cadastro de Empresa",
      grupo: "Cadastros",
      icon: Building2,
      badge: "CNPJ / A1",
      badgeColor: "bg-white/20 text-white",
    },
    {
      id: "plano-contas" as TabId,
      label: "Plano de Contas",
      grupo: "Cadastros",
      icon: FolderTree,
      badge: "CPC",
      badgeColor: "bg-white/20 text-white",
    },
    // Lançamentos e importações
    {
      id: "integracao" as TabId,
      label: "Integrações",
      grupo: "Lançamentos e importações",
      icon: Network,
    },
    {
      id: "revisao-origens" as TabId,
      label: "Revisar dados recebidos",
      grupo: "Lançamentos e importações",
      icon: ClipboardCheck,
      badge: "Fiscal + DP",
      badgeColor: "bg-cyan-300 text-cyan-950 font-bold",
    },
    {
      id: "lancamentos" as TabId,
      label: "Lançamentos",
      grupo: "Lançamentos e importações",
      icon: FileText,
    },
    {
      id: "aprovacoes" as TabId,
      label: "Aprovar lançamentos",
      grupo: "Lançamentos e importações",
      icon: FileText,
      ...(pendentesAprovacao > 0 ? { badge: String(pendentesAprovacao), badgeColor: "bg-amber-400 text-slate-950 font-bold" } : {}),
    },
    // Fechamento
    {
      id: "gestao-contabil" as TabId,
      label: "Gestão contábil",
      grupo: "Fechamento",
      icon: Briefcase,
    },
    {
      id: "balancete" as TabId,
      label: "Balancete",
      grupo: "Fechamento",
      icon: BarChart3,
    },
    {
      id: "livros" as TabId,
      label: "Livros Fiscais & ECD",
      grupo: "Fechamento",
      icon: BookOpen,
    },
    // Obrigações
    {
      id: "modulos-finais" as TabId,
      label: "Obrigações & Gestão",
      grupo: "Obrigações",
      icon: Briefcase,
    },
    {
      id: "agenda" as TabId,
      label: "Agenda & Lembretes",
      grupo: "Obrigações",
      icon: Calendar,
    },
    {
      id: "vigencia-obrigacoes" as TabId,
      label: "Vigência das obrigações",
      grupo: "Obrigações",
      icon: CalendarClock,
    },
    // Relatórios
    {
      id: "demonstracoes" as TabId,
      label: "Demonstrações e relatórios",
      grupo: "Relatórios",
      icon: BarChart3,
      badge: "DFC · índices",
      badgeColor: "bg-emerald-300 text-emerald-950 font-bold",
    },
    {
      id: "fluxo-previtico" as TabId,
      label: "Fluxo de Caixa Previsto",
      grupo: "Relatórios",
      icon: Zap,
    },
    // Robôs, revisão e tarefas
    {
      id: "agente" as TabId,
      label: "Robôs",
      grupo: "Robôs, revisão e tarefas",
      icon: Bot,
      badge: "",
      badgeColor: "bg-amber-400/30 text-amber-200",
    },
    {
      id: "revisor" as TabId,
      label: "Revisor",
      grupo: "Robôs, revisão e tarefas",
      icon: ShieldCheck,
      badge: "Corrigir",
      badgeColor: "bg-amber-300 text-amber-950 font-bold",
    },
    {
      id: "tarefas-equipe" as TabId,
      label: "Tarefas da equipe",
      grupo: "Robôs, revisão e tarefas",
      icon: ListChecks,
      badge: "Pedidos",
      badgeColor: "bg-sky-300 text-sky-950 font-bold",
    },
    // Ferramentas
    {
      id: "calculadora" as TabId,
      label: "Calculadora 3D",
      grupo: "Ferramentas",
      icon: Calculator,
      badge: "",
      badgeColor: "bg-purple-300 text-purple-950 font-bold",
    },
    {
      id: "ia-premium" as TabId,
      label: "IA Murad Premium",
      grupo: "Ferramentas",
      icon: Sparkles,
      badge: "Voz",
      badgeColor: "bg-amber-300 text-slate-950 font-bold",
    },
    {
      id: "migracao" as TabId,
      label: "Migração Contábil",
      grupo: "Ferramentas",
      icon: Database,
      badge: "4 etapas",
      badgeColor: "bg-cyan-300 text-cyan-950 font-bold",
    },
    {
      id: "backups" as TabId,
      label: "Backups",
      grupo: "Ferramentas",
      icon: ShieldHalf,
      badge: "Agenda",
      badgeColor: "bg-emerald-400/30 text-emerald-100",
    },
    // Configurações
    {
      id: "conexoes" as TabId,
      label: "Conexão Órgãos",
      grupo: "Configurações",
      icon: Plug,
      badge: "",
      badgeColor: "bg-white/10 text-blue-100",
    },
    {
      id: "meu-jeito" as TabId,
      label: "Meu jeito",
      grupo: "Configurações",
      icon: SlidersHorizontal,
      badge: "Pessoal",
      badgeColor: "bg-white/20 text-white",
    },
    // Aprender
    // Escola Murad (27/11/2026, dono): sempre o ÚLTIMO item do menu; o topo fica só para o serviço do dia a dia. O link #escola continua.
    {
      id: "escola" as TabId,
      label: "Aprender (Escola Murad)",
      grupo: "Aprender",
      icon: GraduationCap,
      badge: "",
      badgeColor: "",
    },
  ];

  // "Meu jeito": as telas favoritas da pessoa (ou do escritório) vêm primeiro, na ordem escolhida.
  const navItems = ordenarMenu(navItemsPadrao, jeito?.efetivo?.menuFavoritos);
  // Quantos favoritos ("Meu jeito") subiram para o começo: ficam juntos, sob o título "Favoritos"; o resto segue a ordem do serviço.
  const favoritosMenu: unknown = jeito?.efetivo?.menuFavoritos;
  const qtdFavoritos = Array.isArray(favoritosMenu) ? new Set(favoritosMenu.filter((id) => navItemsPadrao.some((x) => x.id === id))).size : 0;

  const copiarCodigo = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText("MURAD-2026-GO");
    }
  };

  return (
    <aside className="w-52 bg-[#082B66] text-white flex flex-col shrink-0 border-r border-[#0A357D] select-none h-full max-h-screen shadow-md overflow-hidden">
      {/* Topo da Barra Lateral: Marca Murade */}
      <div className="px-3 py-2 border-b border-[#0A357D] bg-[#082B66] shrink-0">
        {/* A marca MURAD fica uma vez só, no cabeçalho (aqui repetia o logo "MC"). */}
        {/* Código de Ligação Rápido */}
        <div
          onClick={copiarCodigo}
          title="Clique para copiar código de ligação dos sistemas"
          className="bg-[#06214E] hover:bg-[#0A357D] border border-blue-400/30 rounded-md px-2 py-1.5 flex items-center justify-between cursor-pointer transition group shadow-2xs"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-300">🔑</span>
            <span className="font-mono font-bold text-amber-200 tracking-wider text-[11px]">
              MURAD-2026-GO
            </span>
          </div>
          <Copy className="w-3.5 h-3.5 text-blue-200 group-hover:text-amber-200 transition" />
        </div>
      </div>

      {/* Navegação Principal Lateral com Rolagem Independente */}
      <div className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto overscroll-contain bg-[#082B66] sidebar-scroll">
        {navItems.map((item, indice) => {
          const Icon = item.icon;
          const isActive = tabAtiva === item.id;
          const isRobo = item.id === "agente";
          // Título discreto da etapa: aparece quando a etapa muda (no celular também, sem ocupar espaço de faixa).
          const grupoDe = (k: number) => (k < qtdFavoritos ? "Favoritos" : navItems[k].grupo);
          const mostrarTitulo = !!grupoDe(indice) && (indice === 0 || grupoDe(indice) !== grupoDe(indice - 1));

          return (
            <React.Fragment key={item.id}>
            {mostrarTitulo && (
              <div data-testid="titulo-etapa-menu" role="presentation" className="px-2 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider leading-none text-blue-200/90">
                {grupoDe(indice)}
              </div>
            )}
            <button
              key={item.id}
              id={`btn-menu-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer text-left ${
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
            </React.Fragment>
          );
        })}
      </div>

      {/* Rodapé da Barra Lateral */}
      <div className="p-2 border-t border-[#0A357D] bg-[#082B66] shrink-0">
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
