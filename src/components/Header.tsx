import React from "react";
import {
  Activity,
  Menu,
  Sparkles,
  Zap,
  Calculator,
  FileText,
  Building2,
  Calendar,
  Globe,
  FileSpreadsheet,
  ClipboardCheck,
  Scale,
  Home,
} from "lucide-react";
import { TabId } from "../types";
import { CabecalhoPadrao } from "./CabecalhoPadrao";

interface HeaderProps {
  tabAtiva: TabId;
  onSelectTab?: (tab: TabId) => void;
  onToggleMobileSidebar?: () => void;
  onConectarFiscal?: () => void;
  usuario?: string;
  empresaNome?: string | null;
  empresaCnpj?: string | null;
  onLogout?: () => void;
}

const navBotoes: Array<{ id: TabId; label: string; icon: React.FC<{ className?: string }>; badge?: string; corBadge?: string }> = [
  { id: "inicio", label: "Tela Inicial", icon: Home, badge: "Início", corBadge: "bg-emerald-300 text-slate-950" },
  { id: "empresa", label: "Cadastro", icon: Building2 },
  { id: "agenda", label: "Agenda", icon: Calendar },
  { id: "fluxo-previtico", label: "Fluxo", icon: Zap, badge: "90D", corBadge: "bg-emerald-400 text-slate-950" },
  { id: "modulos-finais", label: "Obrigação & Gestão", icon: FileText, badge: "2026", corBadge: "bg-emerald-300 text-slate-950" },
  { id: "conexoes", label: "Operação (Órgãos)", icon: Globe },
  { id: "revisao-origens", label: "Revisão Fiscal + DP", icon: ClipboardCheck },
  { id: "lancamentos", label: "Lançamento", icon: FileSpreadsheet },
  { id: "calculadora", label: "Calculadora 3D", icon: Calculator, badge: "3D Pro" },
  { id: "ia-premium", label: "IA Murade Premium", icon: Sparkles, badge: "Voz v3", corBadge: "bg-amber-300 text-slate-900" },
];

export const Header: React.FC<HeaderProps> = ({
  tabAtiva,
  onSelectTab,
  onToggleMobileSidebar,
  onConectarFiscal,
  usuario,
  empresaNome,
  empresaCnpj,
  onLogout,
}) => {
  return (
    <header className="bg-[#082B66] border-b border-[#0A357D] sticky top-0 z-30 text-white shadow-md shrink-0">
      {/* Linha Superior: Logo/Status Compacto */}
      <div className="px-3 sm:px-5 py-2 flex items-center justify-between gap-2 border-b border-[#0A357D] text-xs bg-[#082B66]">
        <div className="flex items-center gap-2.5">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-1.5 rounded-lg bg-[#06214E] text-white hover:bg-[#0A357D] cursor-pointer border border-blue-400/30"
              title="Abrir Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => onSelectTab && onSelectTab("inicio")}
            className="flex items-center gap-2 cursor-pointer hover:opacity-95 transition text-left"
            title="Ir para Tela Inicial"
          >
            <div className="flex items-center gap-1 bg-[#06214E] px-2.5 py-1 rounded-md border border-blue-400/40 text-white shadow-xs">
              <span className="font-black text-xs tracking-wider">MC</span>
              <Scale className="w-3.5 h-3.5 text-amber-300" title="Símbolo Oficial da Contabilidade (Balança / Equilíbrio)" />
            </div>
            <span className="font-extrabold tracking-tight text-white text-sm sm:text-base flex items-center gap-1.5">
              <span>Murade Contábil</span>
              <Scale className="w-4 h-4 text-amber-300" title="Balança da Contabilidade" />
            </span>
            <span className="text-blue-300 hidden sm:inline">•</span>
            <span className="text-[11px] text-amber-200 hidden sm:flex items-center gap-1.5 font-semibold bg-[#06214E] px-2 py-0.5 rounded-full border border-amber-400/30">
              Integrações pendentes
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 font-medium text-[11px]">
          {onLogout && (
            <CabecalhoPadrao
          urlGerenciarLicenca="https://murade-dp.onrender.com"
              usuario={usuario || null}
              empresaNome={empresaNome || null}
              empresaCnpj={empresaCnpj || null}
              buscarLicenca={async (cnpj) => {
                const r = await fetch(`/api/licenca?cnpj=${encodeURIComponent(cnpj)}`, { credentials: "include" });
                const d = r.ok ? await r.json() : null;
                return d && d.licenca ? d.licenca : null;
              }}
              onSair={onLogout}
            />
          )}
          {onConectarFiscal && (
            <button
              onClick={onConectarFiscal}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Consultar a integração com Murade Fiscal"
            >
              <Zap className="w-3.5 h-3.5 text-slate-950 animate-bounce" />
              <span className="hidden sm:inline">Puxar do Fiscal / Órgãos</span>
              <span className="sm:hidden">Fiscal</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-1.5 bg-[#06214E] px-2.5 py-1 rounded-lg border border-blue-400/30 text-blue-100">
            <Activity className="w-3 h-3 text-amber-300" />
            <span>Gov Sync: não configurado</span>
            <span className="text-blue-400">|</span>
            <span className="text-amber-300 font-mono font-bold">{new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* Linha de Botões na Barra de Cima — Mesma Cor Azul #082B66 Conforme Solicitado */}
      <div className="px-2 sm:px-4 py-1.5 overflow-x-auto scrollbar-none flex items-center gap-1.5 bg-[#082B66]">
        {navBotoes.map((item) => {
          const Icon = item.icon;
          const isActive = tabAtiva === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab && onSelectTab(item.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? "bg-white text-[#082B66] shadow-xs font-black ring-1 ring-white/50"
                  : "bg-white/10 hover:bg-[#0A357D] text-white border border-white/10"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#082B66]" : "text-blue-200"}`} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-black tracking-tighter ${
                    isActive ? "bg-[#082B66] text-white" : item.corBadge || "bg-white/20 text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
