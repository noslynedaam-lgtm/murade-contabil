import React from "react";
import { Menu, Zap } from "lucide-react";
import { MarcaMurad } from "./MarcaMurad";
import { TabId } from "../types";
import { CabecalhoPadrao } from "./CabecalhoPadrao";
import { BuscaGlobal, ItemBusca } from "./BuscaGlobal";
import { BotaoRobosCabecalho } from "./RobotSidebar";

interface HeaderProps {
  tabAtiva: TabId;
  onSelectTab?: (tab: TabId) => void;
  onToggleMobileSidebar?: () => void;
  onConectarFiscal?: () => void;
  usuario?: string;
  empresaNome?: string | null;
  empresaCnpj?: string | null;
  onTrocarEmpresa?: () => void;
  empresas?: { cnpj: string; nome: string }[];
  onEscolherEmpresa?: (cnpj: string) => void;
  itensBusca?: ItemBusca[];
  onLogout?: () => void;
}


export const Header: React.FC<HeaderProps> = ({
  tabAtiva,
  onSelectTab,
  onToggleMobileSidebar,
  onConectarFiscal,
  usuario,
  empresaNome,
  empresaCnpj,
  onTrocarEmpresa,
  empresas,
  onEscolherEmpresa,
  itensBusca,
  onLogout,
}) => {
  // Uma navegação principal só: o menu lateral (no celular, o botão ☰ abre o menu recolhível). A antiga linha de
  // botões repetia o menu inteiro; e-mail e Sair ficam só na faixa "Conta" do topo; a empresa, só no seletor daqui.
  return (
    <header className="bg-[#082B66] border-b border-[#0A357D] sticky top-0 z-30 text-white shadow-md shrink-0">
      <div className="px-2 sm:px-4 py-1 flex flex-wrap items-center justify-between gap-2 text-xs bg-[#082B66]">
        <div className="flex items-center gap-2">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-1.5 rounded-lg bg-[#06214E] text-white hover:bg-[#0A357D] cursor-pointer border border-blue-400/30"
              title="Abrir o menu"
              aria-label="Abrir o menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectTab && onSelectTab("inicio")}
            className="flex items-center gap-2 cursor-pointer hover:opacity-95 transition text-left"
            title="Ir para a Tela Inicial"
          >
            <MarcaMurad modulo="contabil" tamanho={30} />
          </button>
        </div>

        {itensBusca && itensBusca.length > 0 && (
          <div className="order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:max-w-md min-w-[200px]">
            <BuscaGlobal itens={itensBusca} />
          </div>
        )}
        <div className="flex items-center gap-2 font-medium text-[11px]">
          <BotaoRobosCabecalho />
          {onLogout && (
            <CabecalhoPadrao
              soEmpresa
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
              onClicarEmpresa={onTrocarEmpresa}
              empresas={empresas}
              onEscolherEmpresa={onEscolherEmpresa}
            />
          )}
          {onConectarFiscal && (
            <button
              onClick={onConectarFiscal}
              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Consultar a integração com o Murad Fiscal"
            >
              <Zap className="w-3.5 h-3.5 text-slate-950" />
              <span className="hidden sm:inline">Puxar do Fiscal</span>
              <span className="sm:hidden">Fiscal</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
