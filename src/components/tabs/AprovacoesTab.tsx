import React, { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { LancamentoContabil } from "../../types";

interface AprovacoesTabProps {
  lancamentos: LancamentoContabil[];
  empresaNome: string;
  workspacePersistido: boolean;
  onDecidirLancamentoManual: (id: string, decisao: "aprovar" | "rejeitar", motivo?: string) => Promise<boolean>;
}

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Fila de aprovação feita para o celular: cartões grandes, com tudo que o contador precisa conferir
// (valor, contas, histórico, origem) e botões com área de toque confortável.
// A decisão usa o mesmo caminho do servidor da aba Lançamentos: o servidor confere permissão e registra quem aprovou.
// Aprovar pede um segundo toque no próprio cartão ("Confirmar"), para um toque sem querer nunca lançar nos livros.
export const AprovacoesTab: React.FC<AprovacoesTabProps> = ({ lancamentos, empresaNome, workspacePersistido, onDecidirLancamentoManual }) => {
  const pendentes = lancamentos.filter((l) => l.statusManual === "pendente_aprovacao");
  const [aprovando, setAprovando] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const decidir = async (id: string, decisao: "aprovar" | "rejeitar") => {
    setOcupado(true);
    try {
      const ok = await onDecidirLancamentoManual(id, decisao, decisao === "rejeitar" ? motivo.trim() : undefined);
      if (ok) { setAprovando(null); setRejeitando(null); setMotivo(""); }
    } finally { setOcupado(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Aprovar lançamentos</h1>
        <p className="text-xs text-slate-600">{empresaNome} · {pendentes.length ? `${pendentes.length} aguardando sua decisão` : "nada aguardando aprovação"}</p>
      </div>
      {!workspacePersistido && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          Os dados desta empresa ainda não foram confirmados no banco. Aguarde a gravação para aprovar ou rejeitar.
        </div>
      )}
      {!pendentes.length && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
          <CheckCircle2 className="mx-auto mb-2" size={28} />
          Tudo em dia. Lançamentos novos que precisarem de aprovação aparecem aqui.
        </div>
      )}
      <ul className="space-y-3">
        {pendentes.map((l) => (
          <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{l.data} · {l.origem}{l.estornoDe ? " · estorno" : ""}</div>
                <div className="mt-0.5 break-words text-sm font-semibold text-slate-900">{l.historico}</div>
                {l.documentoRef && <div className="mt-0.5 break-all font-mono text-[10px] text-slate-400">Ref: {l.documentoRef}</div>}
              </div>
              <div className="shrink-0 text-right text-lg font-black text-slate-900">{dinheiro(l.valor)}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-rose-50 p-2"><div className="font-bold text-rose-800">Débito</div><div className="font-mono">{l.contaDebitoCodigo}</div><div className="text-slate-600">{l.contaDebitoNome}</div></div>
              <div className="rounded-lg bg-emerald-50 p-2"><div className="font-bold text-emerald-800">Crédito</div><div className="font-mono">{l.contaCreditoCodigo}</div><div className="text-slate-600">{l.contaCreditoNome}</div></div>
            </div>

            {aprovando === l.id ? (
              <div className="mt-3 space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-950">Confirma aprovar <strong>{dinheiro(l.valor)}</strong> (débito {l.contaDebitoCodigo}, crédito {l.contaCreditoCodigo})? Ele entra nos livros e relatórios, com o seu nome no registro.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado || !workspacePersistido} onClick={() => void decidir(l.id, "aprovar")} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white disabled:opacity-40">Sim, aprovar</button>
                  <button type="button" disabled={ocupado} onClick={() => setAprovando(null)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">Cancelar</button>
                </div>
              </div>
            ) : rejeitando === l.id ? (
              <div className="mt-3 space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
                <label className="block text-xs font-semibold text-rose-950" htmlFor={`motivo-${l.id}`}>Motivo da rejeição (fica no histórico)</label>
                <textarea id={`motivo-${l.id}`} value={motivo} maxLength={1000} onChange={(e) => setMotivo(e.target.value)} rows={2} className="w-full rounded border border-slate-300 p-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado || !motivo.trim() || !workspacePersistido} onClick={() => void decidir(l.id, "rejeitar")} className="min-h-11 flex-1 rounded-lg bg-rose-700 px-3 text-sm font-bold text-white disabled:opacity-40">Rejeitar</button>
                  <button type="button" disabled={ocupado} onClick={() => { setRejeitando(null); setMotivo(""); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={!workspacePersistido} onClick={() => { setRejeitando(null); setAprovando(l.id); }} className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40"><CheckCircle2 size={18} />Aprovar</button>
                <button type="button" disabled={!workspacePersistido} onClick={() => { setAprovando(null); setRejeitando(l.id); }} className="flex min-h-12 items-center justify-center gap-1 rounded-lg border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800 disabled:opacity-40"><XCircle size={18} />Rejeitar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
