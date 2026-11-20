// "A conferir": serviços completos que a Agente fez para o contador (fechamento do mês, ECD, encerramento, balancete para o
// cliente). Fica no topo da tela Aprovar lançamentos. Mostra cada etapa (pronto, preparado, depende de você, o sistema ainda não
// faz) e deixa o contador abrir a tela da etapa, marcar "Já conferi" ou pedir de novo. Aprovar e fechar continuam nos botões
// de sempre: este painel não aprova nada.
import React, { useCallback, useEffect, useState } from "react";
import { Bell, ClipboardCheck, RotateCcw } from "lucide-react";
import { darOkNoServidor, pedidoDeContinuar } from "../utils/servicoCompletoCliente";

type Etapa = { id: string; titulo: string; situacao: string; detalhe: string; tela?: string };
type Servico = { cnpj: string; roteiro: string; referencia: string; estado: string; titulo: string; resumo: string; etapas: Etapa[]; porNome: string | null; porLogin: string | null; atualizadoEm: string; aviso: string | null; pontoOk?: string | null };

const SELO: Record<string, { texto: string; cor: string }> = {
  feito: { texto: "pronto", cor: "bg-emerald-100 text-emerald-900" },
  preparado: { texto: "preparado", cor: "bg-blue-100 text-blue-900" },
  a_preparar: { texto: "falta o sim do preparo", cor: "bg-amber-100 text-amber-900" },
  contador: { texto: "depende de você", cor: "bg-violet-100 text-violet-900" },
  nada: { texto: "não se aplica", cor: "bg-slate-100 text-slate-600" },
  falta_sistema: { texto: "o sistema ainda não faz", cor: "bg-rose-100 text-rose-900" },
  aviso: { texto: "atenção", cor: "bg-amber-100 text-amber-900" },
};
const ESTADO: Record<string, string> = {
  em_andamento: "a Agente está fazendo (pode usar o sistema)",
  aguardando_ok: "esperando você conferir e dar o OK",
  ok_dado: "OK recebido: a Agente está continuando",
  aguardando_preparo: "esperando o seu sim no cartão da Agente",
  pronto_para_conferir: "pronto para você conferir",
  parado: "parado",
};

export const ServicosAgentePainel: React.FC<{ cnpj: string; onNavegar?: (tela: string) => void; onPedirAgente?: (texto: string) => void }> = ({ cnpj, onNavegar, onPedirAgente }) => {
  const limpo = String(cnpj || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [lembretes, setLembretes] = useState<Array<{ titulo: string; aviso: string }>>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const carregar = useCallback(() => {
    if (limpo.length !== 14) return;
    fetch(`/api/servico-completo?cnpj=${encodeURIComponent(limpo)}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (j?.sucesso) { setServicos((j.servicos || []).filter((s: Servico) => s.estado !== "conferido" && s.estado !== "concluido")); setLembretes(j.lembretes || []); } })
      .catch(() => undefined);
  }, [limpo]);
  useEffect(() => { carregar(); const t = window.setInterval(carregar, 60_000); return () => window.clearInterval(t); }, [carregar]);

  const conferido = async (s: Servico) => {
    setMsg("");
    try {
      const r = await fetch("/api/servico-completo/conferido", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: s.cnpj, roteiro: s.roteiro, referencia: s.referencia }) });
      const j = await r.json().catch(() => ({}));
      setMsg(j?.mensagem || j?.motivo || "");
      if (r.ok) carregar();
    } catch { setMsg("Não consegui marcar agora. Tente de novo."); }
  };
  const refazer = (s: Servico) => onPedirAgente?.(pedidoDeContinuar(s, false));
  const darOk = async (s: Servico) => {
    setMsg("");
    const r = await darOkNoServidor(s);
    setMsg(r.mensagem);
    if (r.ok) { carregar(); onPedirAgente?.(pedidoDeContinuar(s, true)); }
  };

  if (!servicos.length && !lembretes.length) return null;
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><ClipboardCheck size={16} />Serviços preparados pela Agente — A conferir</h2>
      {lembretes.map((l, i) => <p key={i} className="mt-1 text-xs text-amber-900">{l.aviso}</p>)}
      <ul className="mt-2 space-y-2">
        {servicos.map((s) => {
          const chave = `${s.roteiro}|${s.referencia}`;
          return (
            <li key={chave} className="rounded-lg border border-indigo-100 bg-white p-3 text-xs">
              <button type="button" onClick={() => setAberto(aberto === chave ? null : chave)} className="w-full text-left" aria-expanded={aberto === chave}>
                <div className="flex items-center gap-1 font-semibold text-slate-900">{s.estado === "aguardando_ok" && <Bell size={14} className="text-amber-600" aria-label="Esperando o seu OK" />}{s.titulo}</div>
                {s.estado === "aguardando_ok" && s.pontoOk && <div className="mt-0.5 font-semibold text-amber-900">{s.pontoOk}</div>}
                <div className="text-slate-600">{ESTADO[s.estado] || s.estado}{s.porNome || s.porLogin ? ` · pedido por ${s.porNome || s.porLogin}` : ""} · {new Date(s.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                {s.resumo && <div className="mt-0.5 text-slate-700">{s.resumo}</div>}
                {s.aviso && <div className="mt-0.5 text-amber-900">{s.aviso}</div>}
              </button>
              {aberto === chave && (
                <ul className="mt-2 space-y-1.5">
                  {s.etapas.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-start gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${(SELO[e.situacao] || SELO.aviso).cor}`}>{(SELO[e.situacao] || SELO.aviso).texto}</span>
                      <span className="min-w-0 flex-1"><strong>{e.titulo}</strong> — {e.detalhe}</span>
                      {e.tela && onNavegar && <button type="button" onClick={() => onNavegar(e.tela!)} className="shrink-0 rounded border border-slate-300 px-2 py-0.5 font-semibold">Abrir tela</button>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {s.estado === "aguardando_ok" && onPedirAgente && <button type="button" onClick={() => void darOk(s)} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Conferi, pode seguir</button>}
                {s.estado === "aguardando_ok" && onNavegar && <button type="button" onClick={() => onNavegar((s.etapas.find((e) => e.situacao === "contador" && e.tela)?.tela) || "aprovacoes")} className="min-h-10 rounded-lg border border-amber-400 bg-white px-3 text-xs font-bold text-amber-900">Corrigir</button>}
                {s.estado === "pronto_para_conferir" && <button type="button" onClick={() => void conferido(s)} className="min-h-10 rounded-lg bg-indigo-700 px-3 text-xs font-bold text-white">Já conferi</button>}
                {(s.estado === "parado" || s.estado === "aguardando_preparo") && onPedirAgente && <button type="button" onClick={() => refazer(s)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-bold text-indigo-900"><RotateCcw size={14} />Fazer de novo</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {msg && <p className="mt-2 text-xs text-slate-700">{msg}</p>}
    </section>
  );
};
