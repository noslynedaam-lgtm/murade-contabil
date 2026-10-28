import React, { useEffect, useState } from 'react';

// Faixa vermelha fininha: só aparece quando a ECD é obrigatória e o Robô Conferidor achou pendências para o contador.
// Lê o que o robô já conferiu (/api/conferidor/ecd); se a consulta falhar ou não houver achado, não mostra nada.
interface Achado { ano: number; situacao: string; prazo: string; diasParaPrazo: number; pronta: boolean; atrasada: boolean; pendencias: string[] }

export function FaixaEcd({ cnpj, onAbrir }: { cnpj: string; onAbrir?: () => void }) {
  const [a, setA] = useState<Achado | null>(null);
  useEffect(() => {
    const doc = String(cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (doc.length !== 14) { setA(null); return; }
    let ativo = true;
    const consultar = () => fetch(`/api/conferidor/ecd?cnpj=${encodeURIComponent(doc)}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (ativo) setA(d?.sucesso ? d.ecd : null); }).catch(() => undefined);
    consultar();
    const t = setInterval(consultar, 10 * 60_000);
    return () => { ativo = false; clearInterval(t); };
  }, [cnpj]);
  if (!a || a.situacao === 'dispensada' || a.situacao === 'facultativa' || (a.pronta && !a.pendencias.length)) return null;
  const [y, m, d] = a.prazo.split('-');
  return (
    <div role="alert" className="mx-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[12px] text-red-950">
      <span><strong>ECD {a.ano}:</strong> faltam {a.pendencias.length} item(ns) para o contador — prazo {d}/{m}/{y}{a.atrasada ? ' (vencido)' : ` (${a.diasParaPrazo} dia(s))`}.</span>
      <span className="hidden truncate text-red-800 md:inline">{a.pendencias[0]}</span>
      {onAbrir && <button type="button" onClick={onAbrir} className="ml-auto rounded border border-red-300 bg-white px-2 py-0.5 font-bold hover:bg-red-100">Ver em Livros → ECD</button>}
    </div>
  );
}
