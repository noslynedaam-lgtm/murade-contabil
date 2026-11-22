// Situação real das integrações na Tela Inicial: Fiscal e DP mostram o que de fato chegou (última atualização);
// o que ainda não está ligado (órgãos públicos) fica numa linha discreta só.
import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Globe, Users, Zap } from "lucide-react";
import { textoOrigem, type EstadoOrigem } from "../utils/integracaoTexto";

export const NOME_FISCAL = "Murad Fiscal";
export const NOME_DP = "Murad DP";

export function useEstadoIntegracoes() {
  const [estado, setEstado] = useState<{ fiscal: EstadoOrigem | null; dp: EstadoOrigem | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = () => fetch("/api/integracao/status", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setEstado(d?.sucesso ? { fiscal: d.fiscal || null, dp: d.departamentoPessoal || null } : { fiscal: null, dp: null }); })
      .catch(() => { if (vivo) setEstado({ fiscal: null, dp: null }); });
    void ler();
    const t = window.setInterval(ler, 5 * 60_000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  return estado;
}

export const PainelIntegracoesReais: React.FC<{ onConectarFiscal?: () => void; onConectarDP?: () => void; onVerOrgaos: () => void }> = ({ onConectarFiscal, onConectarDP, onVerOrgaos }) => {
  const estado = useEstadoIntegracoes();
  const linhas = estado ? [textoOrigem(NOME_FISCAL, estado.fiscal), textoOrigem(NOME_DP, estado.dp)] : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-2xs" data-testid="integracoes-reais">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="font-bold text-slate-900">Integrações</div>
          {!linhas && <div className="text-slate-500">Conferindo…</div>}
          {linhas?.map((l) => (
            <div key={l.texto} className={`flex items-center gap-1.5 ${l.ok ? "text-emerald-800" : "text-amber-800"}`}>
              {l.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              <span>{l.texto}</span>
            </div>
          ))}
          <div className="text-[11px] text-slate-500">Ainda a configurar: ligação direta com órgãos públicos (Receita/SERPRO e SEFAZ).</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onConectarFiscal && <button type="button" onClick={onConectarFiscal} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50"><Zap className="h-3.5 w-3.5" /> Atualizar do Fiscal</button>}
          {onConectarDP && <button type="button" onClick={onConectarDP} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50"><Users className="h-3.5 w-3.5" /> Resumos do DP</button>}
          <button type="button" onClick={onVerOrgaos} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50"><Globe className="h-3.5 w-3.5" /> Órgãos</button>
        </div>
      </div>
    </div>
  );
};
