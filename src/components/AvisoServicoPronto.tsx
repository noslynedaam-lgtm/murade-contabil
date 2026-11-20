// Aviso "Seu pedido está pronto para você conferir": quando a Agente faz um serviço completo em segundo plano
// (src/server/servicoCompleto.ts), esta peça acompanha o registro e, ao ficar pronto, mostra o sininho em qualquer tela,
// fala pela voz da Agente e leva direto ao item em "A conferir" (tela Aprovar lançamentos). Não aprova nada.
import React, { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";

export const EVENTO_SERVICO_INICIADO = "murade:servico-completo-iniciado";
export const FRASE_PRONTO = "Seu pedido está pronto para você conferir.";
const INTERVALO_MS = 8_000;
const ACOMPANHAR_MS = 20 * 60_000;

type Pronto = { cnpj: string; roteiro: string; referencia: string; titulo: string };

export const AvisoServicoPronto: React.FC<{ onAbrir: (cnpj: string) => void; onFalar: (texto: string) => void }> = ({ onAbrir, onFalar }) => {
  const [prontos, setProntos] = useState<Pronto[]>([]);
  const desdeRef = useRef<number | null>(null);
  const avisadosRef = useRef(new Set<string>());
  const falarRef = useRef(onFalar); falarRef.current = onFalar;

  useEffect(() => {
    const iniciar = () => { desdeRef.current = Date.now() - 5_000; };
    window.addEventListener(EVENTO_SERVICO_INICIADO, iniciar);
    const t = window.setInterval(() => {
      const desde = desdeRef.current;
      if (desde === null) return;
      if (Date.now() - desde > ACOMPANHAR_MS) { desdeRef.current = null; return; }
      fetch("/api/servico-completo?limite=10", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => {
        if (!j?.sucesso) return;
        const novos: Pronto[] = (j.servicos || []).filter((s: any) => s.estado === "pronto_para_conferir" && Date.parse(s.atualizadoEm) >= desde && !avisadosRef.current.has(`${s.cnpj}|${s.roteiro}|${s.referencia}|${s.atualizadoEm}`));
        if (!novos.length) return;
        for (const s of j.servicos || []) if (novos.includes(s)) avisadosRef.current.add(`${s.cnpj}|${s.roteiro}|${s.referencia}|${s.atualizadoEm}`);
        const andando = (j.servicos || []).some((s: any) => s.estado === "em_andamento");
        if (!andando) desdeRef.current = null;
        setProntos((p) => [...p, ...novos.map((s) => ({ cnpj: s.cnpj, roteiro: s.roteiro, referencia: s.referencia, titulo: s.titulo }))].slice(-3));
        falarRef.current(`${FRASE_PRONTO} ${novos[0].titulo}. Está em A conferir, na tela Aprovar lançamentos.`);
      }).catch(() => undefined);
    }, INTERVALO_MS);
    return () => { window.removeEventListener(EVENTO_SERVICO_INICIADO, iniciar); window.clearInterval(t); };
  }, []);

  if (!prontos.length) return null;
  return (
    <div role="status" data-piloto-ignorar="1" className="fixed bottom-20 left-3 z-[10000] w-[min(88vw,320px)] space-y-2">
      {prontos.map((p) => (
        <div key={`${p.cnpj}|${p.roteiro}|${p.referencia}`} className="rounded-xl border border-indigo-200 bg-white p-3 text-sm shadow-2xl">
          <div className="flex items-start gap-2">
            <Bell size={18} className="mt-0.5 shrink-0 text-indigo-700" />
            <p className="flex-1 leading-snug"><strong>{FRASE_PRONTO}</strong> <span className="text-slate-600">{p.titulo}</span></p>
            <button type="button" aria-label="Fechar aviso" onClick={() => setProntos((l) => l.filter((x) => x !== p))} className="text-slate-400"><X size={16} /></button>
          </div>
          <button type="button" onClick={() => { onAbrir(p.cnpj); setProntos((l) => l.filter((x) => x !== p)); }} className="mt-2 min-h-10 w-full rounded-lg bg-indigo-700 px-3 text-xs font-bold text-white">Abrir A conferir</button>
        </div>
      ))}
    </div>
  );
};
