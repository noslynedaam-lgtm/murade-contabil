// "Quer que eu ajuste?" no Fechamento: o robô conferidor acha o que não fecha (Diário, Razão, balancete, Balanço/DRE),
// mostra a causa e o ajuste pronto; só faz depois do "Sim" do contador, um por vez, e tudo tem "Desfazer".
import React, { useCallback, useEffect, useState } from "react";
import type { RotaEscrituracao } from "../types";
import { confirmarNaTela } from "../utils/dialogoNaTela";

type Proposta = { id: string; tipo: "lancamento" | "saldo_inicial" | "alterar_lancamento" | "verificar"; situacao: "pendente" | "feito" | "mantido"; titulo: string; causa: string; base: string; pergunta: string; diferencaCentavos: number };

export const AjustesFechamentoPainel: React.FC<{ onRota: RotaEscrituracao; periodo: string; podeGravar: boolean; aoMudar?: () => void }> = ({ onRota, periodo, podeGravar }) => {
  const [lista, setLista] = useState<Proposta[] | null>(null);
  const [resumo, setResumo] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [todos, setTodos] = useState(false);
  const carregar = useCallback(async () => {
    const r = await onRota("GET", `ajustes-fechamento${todos ? "" : `?competencia=${encodeURIComponent(periodo)}`}`);
    if (r.ok) { setLista(r.corpo.propostas || []); setResumo(String(r.corpo.resumo || "")); }
  }, [onRota, periodo, todos]);
  useEffect(() => { void carregar(); }, [carregar]);
  const agir = async (p: Proposta, acao: "executar" | "desfazer" | "manter") => {
    const pergunta = acao === "executar" ? p.pergunta : acao === "desfazer" ? (p.tipo === "lancamento" ? "Desfazer o ajuste? Vou lançar o estorno (o lançamento continua no Diário, com a partida invertida)." : "Desfazer o ajuste e voltar o valor anterior?") : "Manter como está e marcar este item como conferido por você?";
    if (ocupado || !(await confirmarNaTela(pergunta))) return;
    setOcupado(p.id);
    const r = await onRota("POST", "ajustes-fechamento", { id: p.id, acao, competencia: todos ? undefined : periodo });
    setOcupado("");
    if (r.ok) { setLista(r.corpo.propostas || []); setResumo(String(r.corpo.resumo || "")); }
  };
  if (!lista) return null;
  const visiveis = lista.filter((p) => p.situacao !== "mantido" || p.tipo !== "verificar");
  return (
    <details data-campo="ajustes-fechamento" open={lista.some((p) => p.situacao === "pendente")} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
      <summary className="cursor-pointer min-h-[40px] flex items-center font-bold text-amber-900">Quer que eu ajuste? — {resumo}</summary>
      <label className="mt-1 flex items-center gap-2 text-slate-700"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Olhar todos os meses (não só {periodo})</label>
      {!visiveis.length && <p className="mt-1 text-emerald-800">Tudo fecha: Diário, Razão, balancete e Balanço/DRE.</p>}
      <ul className="mt-2 space-y-2">
        {visiveis.map((p) => (
          <li key={p.id} className="rounded border border-amber-200 bg-white p-2">
            <div className="font-bold text-slate-900">{p.titulo} <span className="font-normal text-slate-500">({p.situacao === "pendente" ? (p.tipo === "verificar" ? "verificar" : "esperando o seu Sim") : p.situacao === "feito" ? "ajustado" : "mantido"})</span></div>
            <div>Causa: {p.causa}</div>
            <div className="break-words">{p.pergunta}</div>
            <div className="text-[11px] text-slate-500">Base: {p.base}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {p.situacao === "pendente" && p.tipo !== "verificar" && <button type="button" disabled={!podeGravar || !!ocupado} onClick={() => void agir(p, "executar")} className="min-h-[40px] rounded border border-emerald-500 bg-emerald-50 px-3 font-bold text-emerald-900 disabled:opacity-40">Sim, ajustar</button>}
              {p.situacao === "pendente" && <button type="button" disabled={!podeGravar || !!ocupado} onClick={() => void agir(p, "manter")} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">{p.tipo === "verificar" ? "Já conferi" : "Não ajustar"}</button>}
              {p.situacao === "feito" && <button type="button" disabled={!podeGravar || !!ocupado} onClick={() => void agir(p, "desfazer")} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Desfazer{p.tipo === "lancamento" ? " (estorno)" : ""}</button>}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
};
