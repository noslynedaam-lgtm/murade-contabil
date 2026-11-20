// "Confira e dê o OK": quando um serviço completo da Agente chega num passo que só o contador faz (aprovar, fechar,
// gerar o definitivo), este cartão aparece em qualquer tela, com o resumo e os botões "Conferi, pode seguir" e "Corrigir".
// Sem resposta, a Agente lembra por texto e voz depois de ~2 minutos com o sistema aberto e, depois, a cada 15 minutos.
// "Depois" recolhe o cartão num sininho (no celular ocupa pouco espaço). Não aprova nada: o OK só diz à Agente que pode seguir.
import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { FRASE_ESPERANDO_OK, darOkNoServidor, horaDeLembrar, pedidoDeContinuar } from "../utils/servicoCompletoCliente";
import { EVENTO_SERVICO_INICIADO } from "./AvisoServicoPronto";

type Etapa = { id: string; titulo: string; situacao: string; tela?: string };
type Servico = { cnpj: string; roteiro: string; referencia: string; estado: string; titulo: string; pontoOk: string | null; etapas: Etapa[] };

export const CartaoOkContador: React.FC<{ onNavegar: (tela: string, cnpj: string) => void; onFalar: (texto: string) => void; onPedirAgente: (texto: string) => void }> = ({ onNavegar, onFalar, onPedirAgente }) => {
  const [esperando, setEsperando] = useState<Servico[]>([]);
  const [recolhido, setRecolhido] = useState(false);
  const [msg, setMsg] = useState("");
  const visivelMsRef = useRef(0);
  const lembretesRef = useRef(0);
  const chaveRef = useRef("");
  const falarRef = useRef(onFalar); falarRef.current = onFalar;

  useEffect(() => {
    let parado = false;
    const carregar = () => fetch("/api/servico-completo?limite=20", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (parado || !j?.sucesso) return;
      const lista: Servico[] = (j.servicos || []).filter((s: Servico) => s.estado === "aguardando_ok");
      setEsperando(lista);
      const chave = lista.map((s) => `${s.cnpj}|${s.roteiro}|${s.referencia}`).join(",");
      if (chave !== chaveRef.current) { chaveRef.current = chave; visivelMsRef.current = 0; lembretesRef.current = 0; if (lista.length) setRecolhido(false); }
    }).catch(() => undefined);
    void carregar();
    const t = window.setInterval(carregar, 60_000);
    const rapido = () => { let n = 0; const r = window.setInterval(() => { n += 1; void carregar(); if (n > 40) window.clearInterval(r); }, 15_000); };
    window.addEventListener(EVENTO_SERVICO_INICIADO, rapido);
    return () => { parado = true; window.clearInterval(t); window.removeEventListener(EVENTO_SERVICO_INICIADO, rapido); };
  }, []);

  // Lembretes: só conta o tempo com o sistema aberto e visível.
  useEffect(() => {
    if (!esperando.length) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      visivelMsRef.current += 10_000;
      if (horaDeLembrar(visivelMsRef.current, lembretesRef.current)) {
        lembretesRef.current += 1;
        setRecolhido(false);
        falarRef.current(`${FRASE_ESPERANDO_OK} ${esperando[0].titulo}.`);
      }
    }, 10_000);
    return () => window.clearInterval(t);
  }, [esperando]);

  // Parecer do REVISOR para o mesmo serviço: "✅ conferi … ⚠️ atenção …" (só lê; não muda nada).
  const primeiro = esperando[0];
  const [parecer, setParecer] = useState<{ chave: string; conferidos: string[]; atencao: Array<{ regra: string; texto: string; nivel: string }> } | null>(null);
  useEffect(() => {
    if (!primeiro?.cnpj) { setParecer(null); return; }
    const chave = `${primeiro.cnpj}|${primeiro.roteiro}|${primeiro.referencia}`;
    const comp = /^\d{4}-\d{2}$/.test(primeiro.referencia) ? primeiro.referencia : "";
    let vivo = true;
    void fetch(`/api/revisor/parecer?cnpj=${encodeURIComponent(primeiro.cnpj)}${comp ? `&competencia=${comp}` : ""}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (vivo && d?.sucesso && d.parecer) setParecer({ chave, conferidos: d.parecer.conferidos || [], atencao: d.parecer.atencao || [] }); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [primeiro?.cnpj, primeiro?.roteiro, primeiro?.referencia]);

  if (!esperando.length) return null;
  const s = esperando[0];
  if (recolhido) return (
    <button type="button" data-piloto-ignorar="1" onClick={() => setRecolhido(false)} aria-label="Serviço esperando o seu OK" className="fixed bottom-20 left-3 z-[10000] flex items-center gap-1 rounded-full bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-xl">
      <Bell size={16} />{esperando.length} esperando seu OK
    </button>
  );
  const seguir = async () => {
    setMsg("");
    const r = await darOkNoServidor(s);
    if (!r.ok) { setMsg(r.mensagem); return; }
    setEsperando((l) => l.slice(1)); chaveRef.current = "";
    onPedirAgente(pedidoDeContinuar(s, true));
  };
  const corrigir = () => {
    const etapa = s.etapas.find((e) => e.situacao === "contador" && e.tela);
    onNavegar(etapa?.tela || "aprovacoes", s.cnpj);
    setRecolhido(true);
  };
  return (
    <div role="alertdialog" aria-label="Confira e dê o OK" data-piloto-ignorar="1" className="fixed bottom-20 left-3 z-[10000] w-[min(92vw,360px)] rounded-xl border-2 border-amber-400 bg-white p-3 text-sm shadow-2xl">
      <div className="flex items-start gap-2">
        <Bell size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">Confira e dê o OK</p>
          <p className="text-xs font-semibold text-slate-700">{s.titulo}</p>
          {s.pontoOk && <p className="mt-1 text-xs text-slate-700">{s.pontoOk}</p>}
          {parecer && parecer.chave === `${s.cnpj}|${s.roteiro}|${s.referencia}` && (
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-[11px]" data-campo="revisor-parecer">
              <p className="font-bold text-slate-900"><span aria-hidden>🔎</span> Parecer do Revisor</p>
              {parecer.conferidos.length > 0 && <p className="text-emerald-900"><span aria-hidden>✅</span> Conferi: {parecer.conferidos.join("; ")}.</p>}
              {parecer.atencao.length > 0
                ? <ul className="space-y-0.5 text-amber-950">{parecer.atencao.map((a) => <li key={a.regra}><span aria-hidden>{a.nivel === "bloqueia" ? "⛔" : "⚠️"}</span> {a.texto}</li>)}</ul>
                : <p className="text-slate-700"><span aria-hidden>⚠️</span> Atenção: nada a apontar.</p>}
            </div>
          )}
          {esperando.length > 1 && <p className="mt-1 text-[11px] text-slate-500">+ {esperando.length - 1} outro(s) esperando o seu OK em A conferir.</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void seguir()} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Conferi, pode seguir</button>
        <button type="button" onClick={corrigir} className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 text-xs font-bold text-amber-900">Corrigir</button>
        <button type="button" onClick={() => setRecolhido(true)} className="min-h-11 rounded-lg px-2 text-xs text-slate-500">Depois</button>
      </div>
      {msg && <p className="mt-1 text-xs text-rose-800">{msg}</p>}
    </div>
  );
};
