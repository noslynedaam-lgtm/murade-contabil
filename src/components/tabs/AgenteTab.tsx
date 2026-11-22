import React from "react";
import { Bot } from "lucide-react";
import { PainelRobos } from "../PainelRobos";
import { LancamentoContabil } from "../../types";

interface AgenteTabProps {
  onRunAudit: () => void;
  isAuditing: boolean;
  cnpjEmpresa?: string;
  lancamentos: LancamentoContabil[];
}

// Tela "Robôs" do Contábil: mostra os robôs de verdade (o que cada um faz, quando rodou e o resultado).
// Antes havia aqui um painel de "3 robôs + 1 agente" de demonstração, que não rodava nada.
export const AgenteTab: React.FC<AgenteTabProps> = () => (
  <div className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><Bot className="h-5 w-5 text-blue-700" /> Robôs do Contábil</h2>
      <p className="mt-1 text-xs text-slate-600">Cada robô trabalha sozinho no horário dele: recebe as notas do Fiscal e a folha do DP, prepara os pré-lançamentos e confere. Nada vira lançamento definitivo sem a sua aprovação.</p>
    </div>
    <PainelRobos />
  </div>
);
