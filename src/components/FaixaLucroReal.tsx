import React, { useEffect, useState } from "react";

// Faixa vermelha fininha (economiza tela no celular): avisos vermelhos do Lucro Real de todas as empresas do acesso. Some sozinha só
// quando cada obrigação foi confirmada E baixada. Abre a Central em Livros › Apuração do Lucro Real.
interface Aviso { cnpj: string; nivel: string; titulo: string; texto: string; estimativa: string | null }
export function FaixaLucroReal({ onAbrir }: { onAbrir?: () => void }) {
  const [av, setAv] = useState<Aviso[]>([]); const [aberta, setAberta] = useState(false);
  useEffect(() => {
    let ativo = true;
    const ler = () => fetch("/api/lucro-real/avisos", { credentials: "include", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (ativo) setAv(d?.sucesso ? (d.avisos || []).filter((x: Aviso) => x.nivel === "vermelho") : []); }).catch(() => undefined);
    ler(); const t = setInterval(ler, 15 * 60_000);
    return () => { ativo = false; clearInterval(t); };
  }, []);
  if (!av.length) return null;
  return (
    <div role="alert" className="mx-2 mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-[12px] text-red-950" data-campo="faixa-lucro-real">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span><strong>Lucro Real:</strong> {av.length} aviso(s) — {av[0].titulo}</span>
        <button type="button" onClick={() => setAberta(!aberta)} className="rounded border border-red-300 bg-white px-2 py-0.5 font-bold hover:bg-red-100">{aberta ? "Esconder" : "Ver todos"}</button>
        {onAbrir && <button type="button" onClick={onAbrir} className="ml-auto rounded border border-red-300 bg-white px-2 py-0.5 font-bold hover:bg-red-100">Abrir a Central do Lucro Real</button>}
      </div>
      {aberta && <ul className="mt-1 max-h-60 space-y-1 overflow-y-auto">{av.map((a, i) => <li key={i} className="rounded bg-white p-1"><b>{a.cnpj}</b> · {a.titulo}<br /><span className="text-red-900">{a.texto}</span>{a.estimativa && <><br /><span className="text-red-800">{a.estimativa}</span></>}</li>)}</ul>}
    </div>
  );
}
