import React from "react";
import { Mic } from "lucide-react";

interface IAFloatingButtonProps {
  onOpenIA: () => void;
}

export const IAFloatingButton: React.FC<IAFloatingButtonProps> = ({ onOpenIA }) => {
  return (
    <div className="fixed bottom-6 right-6 z-40 animate-floating">
      <div
        onClick={onOpenIA}
        className="bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-full shadow-2xl border border-slate-200 flex items-center gap-3 cursor-pointer hover:shadow-blue-500/20 hover:scale-105 transition-all group ring-2 ring-blue-500/20"
      >
        <button
          id="btn-ia-flutuante"
          className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md animate-pulse group-hover:rotate-12 transition"
        >
          <Mic className="w-5 h-5 text-amber-300" />
        </button>
        <div className="text-left pr-1 leading-tight">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
            <span>IA Murad</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div className="text-[11px] text-slate-500">Assistente com pesquisa atual</div>
        </div>
      </div>
    </div>
  );
};
