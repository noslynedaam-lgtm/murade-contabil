// Balãozinho que a assistente mostra sozinha quando o detector de dificuldade percebe que a pessoa
// tentou a mesma coisa várias vezes sem conseguir. Fica perto do botão flutuante da assistente
// (canto inferior direito), igual pedido pelo dono: "eu posso te ajudar? vi que você não está
// conseguindo fazer esse procedimento".
import React from 'react';

interface BalaoAjudaProativaProps {
  visivel: boolean;
  /** O que a pessoa parece estar tentando fazer, para o texto ficar específico (ex.: "Calculadora"). */
  textoAlvo: string;
  onAceitar: () => void;
  onRecusar: () => void;
}

export const BalaoAjudaProativa: React.FC<BalaoAjudaProativaProps> = ({ visivel, textoAlvo, onAceitar, onRecusar }) => {
  if (!visivel) return null;
  return (
    <div
      role="status"
      className="fixed bottom-24 right-3 z-[10000] w-[min(88vw,320px)] rounded-xl border border-blue-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-2xl animate-in fade-in"
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">🤖</span>
        <p className="flex-1 leading-snug">
          Posso te ajudar? Vi que você está tentando <strong>{textoAlvo || 'isso'}</strong> e não está conseguindo.
        </p>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onRecusar}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          Não, obrigado
        </button>
        <button
          type="button"
          onClick={onAceitar}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
        >
          Sim, me ajuda
        </button>
      </div>
    </div>
  );
};
