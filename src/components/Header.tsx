import React, { useState } from "react";
import { Bot, Calculator, Menu, Search, Zap } from "lucide-react";
import { MenuContaContabil } from "./MenuContaContabil";
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
  onAbrirIA?: () => void;
  onAbrirCalculadora?: () => void;
  onAbrirMeuJeito?: () => void;
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
  onAbrirIA,
  onAbrirCalculadora,
  onAbrirMeuJeito,
}) => {
  void tabAtiva;
  const [buscaCelularAberta, setBuscaCelularAberta] = useState(false);
  const botaoTopo = "flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2 text-[11px] font-bold text-white transition cursor-pointer shadow-xs border";
  // Barra de cima igual à do DP (aprovada pelo dono, 25/11/2026): uma linha só no computador — marca, empresa, pesquisa,
  // Assistente IA, Robôs, Calculadora, Puxar do Fiscal e o menu da conta (e-mail, letra, usuários, segurança, Sair) — e duas
  // linhas no celular. A faixa preta "Conta" de cima saiu: tudo dela está no menu da conta.
  return (
    <header className="topo-seguro bg-[#082B66] border-b border-[#0A357D] sticky top-0 z-30 text-white shadow-md shrink-0">
      <div className="px-2 sm:px-3 py-1 flex flex-wrap lg:flex-nowrap items-center gap-x-2 gap-y-1 text-xs bg-[#082B66]">
        {/* Linha 1 (celular) / começo (computador): ☰, marca, empresa e (no celular) a conta */}
        <div className="flex min-w-0 flex-1 lg:flex-none items-center gap-1.5">
          {onToggleMobileSidebar && (
            <button
              id="btn-abrir-menu"
              onClick={onToggleMobileSidebar}
              className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25 cursor-pointer"
              title="Abrir o menu"
              aria-label="Abrir o menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onSelectTab && onSelectTab("inicio")}
            className="flex shrink-0 items-center cursor-pointer hover:opacity-95 transition text-left"
            title="Ir para a Tela Inicial"
          >
            <MarcaMurad modulo="contabil" tamanho={26} />
          </button>
          {onLogout && (
            <div className="min-w-0 flex-1 lg:flex-none">
              <CabecalhoPadrao
                soEmpresa
                semLetra
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
            </div>
          )}
          {onLogout && <div className="ml-auto lg:hidden"><MenuContaContabil onAbrirMeuJeito={onAbrirMeuJeito} /></div>}
        </div>

        {/* Pesquisa: campo no computador; no celular, a lupa abre o campo */}
        {itensBusca && itensBusca.length > 0 && (
          <div className={`${buscaCelularAberta ? "order-last basis-full" : "hidden"} lg:order-none lg:basis-auto lg:block min-w-0 lg:flex-1 lg:max-w-xs`}>
            <BuscaGlobal itens={itensBusca} />
          </div>
        )}

        {/* Linha 2 (celular) / fim (computador) */}
        <div className="flex w-full lg:w-auto lg:ml-auto items-center gap-1 sm:gap-1.5 font-medium text-[11px]">
          {itensBusca && itensBusca.length > 0 && (
            <button type="button" onClick={() => setBuscaCelularAberta((v) => !v)} className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md bg-white/10 hover:bg-white/20 cursor-pointer" aria-label="Pesquisar" title="Pesquisar módulo, empresa ou conta">
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
          {onAbrirIA && (
            <button type="button" onClick={onAbrirIA} className={`${botaoTopo} bg-indigo-700 hover:bg-indigo-600 border-indigo-500/50`} title="Pergunte à assistente Murad, com pesquisa e fontes" aria-label="Assistente IA">
              <Bot className="w-3.5 h-3.5 text-cyan-200" />
              <span className="hidden 2xl:inline">Assistente IA</span>
            </button>
          )}
          <BotaoRobosCabecalho />
          {onAbrirCalculadora && (
            <button type="button" id="btn-topo-calculadora" onClick={onAbrirCalculadora} className={`${botaoTopo} bg-blue-700/80 hover:bg-blue-700 border-blue-600/50 font-semibold`} title="Calculadora" aria-label="Calculadora">
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">Calculadora</span>
            </button>
          )}
          {onConectarFiscal && (
            <button
              onClick={onConectarFiscal}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition cursor-pointer shadow-xs"
              title="Consultar a integração com o Murad Fiscal"
            >
              <Zap className="w-3.5 h-3.5 text-slate-950" />
              <span className="hidden 2xl:inline">Puxar do Fiscal</span>
              <span className="2xl:hidden">Fiscal</span>
            </button>
          )}
          {onLogout && <div className="hidden lg:block"><MenuContaContabil onAbrirMeuJeito={onAbrirMeuJeito} /></div>}
        </div>
      </div>
    </header>
  );
};
