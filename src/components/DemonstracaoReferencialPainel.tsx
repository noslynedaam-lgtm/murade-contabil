import React, { useMemo } from "react";
import type { EmpresaDados } from "../types";
import type { LinhaBalanceteContabil } from "../utils/livrosContabeis";
import { moedaContabil } from "../utils/livrosContabeis";
import { demonstracoesPorReferencial, resumoDemonstracoesReferenciais, type LinhaDemonstracaoReferencial } from "../utils/demonstracoesReferenciais";
import { regimeReferencial } from "../services/planoReferencialService";

const ROTULO_MOTIVO = {
  "sem-vinculo": "sem vínculo com o plano referencial",
  "vinculo-inexistente": "conta referencial não existe na tabela do regime",
  "vinculo-sintetico": "conta referencial é sintética (use uma analítica)",
} as const;

function Tabela({ linhas }: { linhas: LinhaDemonstracaoReferencial[] }) {
  if (!linhas.length) return <p className="py-3 text-xs text-slate-500">Nada vinculado com valor neste período.</p>;
  return (
    <table className="w-full min-w-[560px] border-collapse text-left text-xs">
      <thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Conta referencial</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.codigo} className={`border-t border-slate-100 ${l.tipo === "S" ? "font-semibold" : ""}`}>
            <td className="px-3 py-1.5 font-mono">{l.codigo}</td>
            <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + (l.nivel - 1) * 0.75}rem` }}>{l.descricao}</td>
            <td className="px-3 py-1.5 text-right">{moedaContabil(l.apresentado)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Balanço ou DRE montados pelo vínculo com o plano referencial da Receita, sem adivinhar pela descrição. */
export function DemonstracaoReferencialPainel({ empresa, balancete, qual }: { empresa: EmpresaDados; balancete: LinhaBalanceteContabil[]; qual: "dre" | "balanco" }) {
  const regime = regimeReferencial(empresa.regime);
  const mapa = useMemo(() => empresa.mapeamentoReferencial || {}, [empresa.mapeamentoReferencial]);
  const vinculadas = Object.keys(mapa).length;
  const demo = useMemo(() => (regime && vinculadas ? demonstracoesPorReferencial({ regime, balancete, mapa }) : null), [regime, vinculadas, balancete, mapa]);

  if (!regime) return <p className="m-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">O plano referencial da Receita (usado na ECD e na ECF) só existe aqui para Lucro Real e Lucro Presumido; para o regime desta empresa vale a demonstração gerencial acima.</p>;
  if (!demo) return <p className="m-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Vincule as contas ao plano referencial (painel da ECD, mais abaixo) para ver {qual === "dre" ? "a DRE" : "o Balanço"} pelo plano da Receita.</p>;

  return (
    <section className="m-3 rounded-lg border border-emerald-300 bg-emerald-50/40 p-3" aria-label={qual === "dre" ? "DRE pelo plano referencial" : "Balanço pelo plano referencial"}>
      <h3 className="text-sm font-bold text-emerald-950">{qual === "dre" ? "DRE" : "Balanço"} pelo plano referencial da Receita ({regime === "real" ? "Lucro Real" : "Lucro Presumido"})</h3>
      <p className="mt-1 text-xs text-emerald-950">{resumoDemonstracoesReferenciais(demo)}</p>
      {demo.pendencias.length > 0 && (
        <div role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
          <p className="font-bold">Contas que ficaram de fora ({demo.pendencias.length}) — vincule para completar:</p>
          <ul className="mt-1 list-disc pl-4">
            {demo.pendencias.slice(0, 12).map((p) => <li key={p.contaCodigo}><span className="font-mono">{p.contaCodigo}</span> {p.descricao}: {ROTULO_MOTIVO[p.motivo]} ({moedaContabil(Math.abs(p.saldo))})</li>)}
            {demo.pendencias.length > 12 && <li>… e mais {demo.pendencias.length - 12}.</li>}
          </ul>
        </div>
      )}
      {demo.avisos.filter((a) => !a.startsWith(`${demo.pendencias.length} conta(s)`)).map((a) => <p key={a} className="mt-2 text-xs text-emerald-950">{a}</p>)}
      <div className="mt-2 overflow-x-auto"><Tabela linhas={qual === "dre" ? demo.dre : demo.balanco} /></div>
      <p className="mt-2 text-[11px] text-slate-600">Demonstração de conferência: usa só lançamentos definitivos e o vínculo gravado na ECD. Não substitui a revisão do contador nem as demonstrações assinadas.</p>
    </section>
  );
}
