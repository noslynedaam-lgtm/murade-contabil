import React from "react";
import { ClipboardCheck, AlertTriangle, RefreshCw } from "lucide-react";

type EmpresaResumo = { cnpj: string; nome: string; temWorkspace: boolean; pendentes: number; contabilizados: number; ultimoPreparo: string | null; parada: string | null };

/**
 * Tela Início > "Prontos para conferir": o Robô Reconciliador prepara sozinho os pré-lançamentos do Fiscal e do DP de cada empresa;
 * aqui o escritório vê quantos estão esperando conferência por empresa e o que está parado. Tocar na empresa abre "Revisar dados recebidos".
 * Nada é aprovado daqui: o lançamento definitivo continua dependendo de uma pessoa.
 */
export function PainelProntosParaConferir({ onAbrir }: { onAbrir: (cnpj: string) => void }) {
  const [empresas, setEmpresas] = React.useState<EmpresaResumo[] | null>(null);
  const [erro, setErro] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [verTodas, setVerTodas] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/contabil/prontos-para-conferir", { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || "Não consegui consultar agora.");
      setEmpresas(Array.isArray(d.empresas) ? d.empresas : []);
      setErro("");
    } catch (e: any) {
      setErro(e?.message || "Não consegui consultar agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 120_000);
    return () => clearInterval(t);
  }, [carregar]);

  if (!empresas && !erro) return null;
  const lista = empresas ?? [];
  const total = lista.reduce((t, e) => t + e.pendentes, 0);
  const comAlgo = lista.filter((e) => e.pendentes > 0 || e.parada);
  const mostrar = verTodas ? lista : comAlgo;

  return (
    <section className="bg-white border border-emerald-200 rounded-2xl p-3 sm:p-4 shadow-xs" aria-label="Pré-lançamentos prontos para conferir">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
          <ClipboardCheck className="w-4 h-4 text-emerald-700" />
          <span>Prontos para conferir: {total} pré-lançamento(s)</span>
        </h2>
        <div className="flex items-center gap-2">
          {lista.length > comAlgo.length && (
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900">
              {verTodas ? "Só as que têm algo" : `Ver todas (${lista.length})`}
            </button>
          )}
          <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50" title="Atualizar">
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">O robô traz as notas do Fiscal e a folha do DP e prepara os pré-lançamentos sozinho. Toque na empresa para conferir e aprovar em "Revisar dados recebidos". Nada vira definitivo sem a sua aprovação.</p>
      {erro && <p className="mt-2 text-xs text-amber-800">{erro}</p>}
      {!erro && !mostrar.length && <p className="mt-2 text-xs text-slate-600">Nenhuma empresa com pré-lançamento esperando conferência agora.</p>}
      {mostrar.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {mostrar.map((e) => (
            <li key={e.cnpj}>
              <button type="button" onClick={() => onAbrir(e.cnpj)} className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-slate-50 rounded-lg px-1">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900 truncate">{e.nome || e.cnpj}</span>
                  {e.parada && <span className="flex items-center gap-1 text-[11px] text-amber-800"><AlertTriangle className="w-3 h-3 shrink-0" /> {e.parada}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${e.pendentes ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{e.pendentes} para conferir</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
