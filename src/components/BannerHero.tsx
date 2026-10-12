import React from "react";
import { CheckCircle2, Bot, Clock } from "lucide-react";

interface BannerHeroProps {
  onAbaClick?: (aba: string) => void;
}

export const BannerHero: React.FC<BannerHeroProps> = () => {
  return (
    <div className="bg-[#082B66] border border-[#0A357D] text-white rounded-xl py-2 px-3.5 sm:px-4 mb-3 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
          <CheckCircle2 className="w-3 h-3 text-emerald-300" />
          <span>100% CONECTADO</span>
        </span>
        <h1 className="font-extrabold text-white text-xs sm:text-sm tracking-tight">
          Murade Contábil — Agente Autônomo + Integração Federal e Estadual
        </h1>
        <span className="text-blue-200 hidden md:inline text-[11px]">
          (Receita • SEFAZ • Murade Fiscal • Murade DP • Murade Fisco IA)
        </span>
      </div>

      <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end text-[11px] shrink-0 border-t sm:border-t-0 border-[#0A357D] pt-1 sm:pt-0">
        <div className="flex items-center gap-1.5 bg-[#06214E] border border-blue-400/30 px-2.5 py-1 rounded-lg text-emerald-200 font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
          <span>Robô Murade Online 24h</span>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-blue-200 text-[10px] bg-[#06214E] border border-blue-400/20 px-2 py-1 rounded-lg">
          <Clock className="w-3 h-3 text-blue-300" />
          <span>Fechamento: <strong>Dia 25 • 02h</strong></span>
        </div>
      </div>
    </div>
  );
};
