import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Download } from "lucide-react";
import {
  calcularEstimativaMensal, calcularLucroRealTrimestral, registrosEstimativaMensal, registrosLucroRealTrimestral,
  type MesEstimativa, type TrimestreReal,
} from "../services/ecfRealPeriodosService";

interface Props {
  empresaRegime: string;
  cnpj: string;
  ano: number;
  /** Receita da contabilidade por mês (centavos), jan a dez. */
  receitaPorMesCentavos: number[];
  /** Resultado do exercício, IRPJ e CSLL já contabilizados por trimestre (centavos). */
  resultadoPorTrimestre: Array<{ resultado: number; irpj: number; csll: number }>;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PER = ["T01", "T02", "T03", "T04"] as const;
type Aba = "estimativa" | "trimestral";

export const EcfRealPeriodosPainel: React.FC<Props> = ({ empresaRegime, cnpj, ano, receitaPorMesCentavos, resultadoPorTrimestre }) => {
  const chave = `murade_ecf_real_periodos_${cnpj.replace(/\W/g, "")}_${ano}`;
  const vazio = () => ({
    aba: "estimativa" as Aba, aliq: "1", ativ: "a", saldoPrejuizo: "", saldoBaseNeg: "",
    meses: MESES.map(() => ({ irrf: "", acresc: "" })),
    tri: PER.map(() => ({ adicoes: "", exclusoes: "" })),
  });
  const [f, setF] = useState(vazio);
  useEffect(() => {
    try { const s = localStorage.getItem(chave); setF(s ? { ...vazio(), ...JSON.parse(s) } : vazio()); } catch { setF(vazio()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const ehReal = /real/i.test(empresaRegime || "");
  const campo = "mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1";

  const estimativa = useMemo(() => {
    try {
      const entradas: MesEstimativa[] = MESES.map((_, i) => ({ i, rec: (receitaPorMesCentavos[i] || 0) / 100 }))
        .filter((x) => x.rec > 0 || num(f.meses[x.i]?.acresc || "") > 0)
        .map((x) => {
          const irpj = { p16: 0, p8: 0, p16b: 0, p32: 0, p384: 0 }, csll = { p12: 0, p32: 0, p384: 0 };
          if (f.ativ === "b") { irpj.p32 = x.rec; csll.p32 = x.rec; } else { irpj.p8 = x.rec; csll.p12 = x.rec; }
          return {
            mes: x.i + 1, modo: "E" as const,
            receita: { irpj, csll, acrescimos: num(f.meses[x.i]?.acresc || "") },
            retencoesIrpj: num(f.meses[x.i]?.irrf || "") ? { "21": num(f.meses[x.i].irrf) } : undefined,
          };
        });
      const r = calcularEstimativaMensal({ anoCalendario: ano, indAliquotaCsll: f.aliq }, entradas);
      return { erro: null as string | null, r, linhas: registrosEstimativaMensal(ano, r) };
    } catch (e: any) { return { erro: String(e?.message || e), r: [], linhas: [] as string[] }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, f, receitaPorMesCentavos]);

  const trimestral = useMemo(() => {
    try {
      const itens: TrimestreReal[] = PER.map((p, i) => ({ p, i, d: resultadoPorTrimestre[i] || { resultado: 0, irpj: 0, csll: 0 } }))
        .filter((x) => x.d.resultado !== 0 || x.d.irpj !== 0 || num(f.tri[x.i]?.adicoes || "") !== 0)
        .map((x) => ({
          periodo: x.p, resultadoContabil: x.d.resultado / 100, irpjContabilizado: x.d.irpj / 100, csllContabilizada: x.d.csll / 100,
          adicoesIrpj: num(f.tri[x.i].adicoes) > 0 ? [{ codigo: "8", descricao: "Despesas não necessárias (adições do trimestre)", valor: num(f.tri[x.i].adicoes) }] : [],
          exclusoesIrpj: num(f.tri[x.i].exclusoes) > 0 ? [{ codigo: "167.01", descricao: "(-) Outras exclusões - qualquer indicador de relacionamento", valor: num(f.tri[x.i].exclusoes) }] : [],
          adicoesCsll: num(f.tri[x.i].adicoes) > 0 ? [{ codigo: "8", descricao: "Despesas não necessárias (adições do trimestre)", valor: num(f.tri[x.i].adicoes) }] : [],
          exclusoesCsll: num(f.tri[x.i].exclusoes) > 0 ? [{ codigo: "167.01", descricao: "(-) Outras exclusões - qualquer indicador de relacionamento", valor: num(f.tri[x.i].exclusoes) }] : [],
        }));
      const r = calcularLucroRealTrimestral({ anoCalendario: ano, indAliquotaCsll: f.aliq, saldoPrejuizoFiscal: num(f.saldoPrejuizo), saldoBaseNegativaCsll: num(f.saldoBaseNeg) }, itens);
      return { erro: null as string | null, r, linhas: registrosLucroRealTrimestral(ano, r) };
    } catch (e: any) { return { erro: String(e?.message || e), r: [], linhas: [] as string[] }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, f, resultadoPorTrimestre]);

  const atual = f.aba === "estimativa" ? estimativa : trimestral;
  const baixar = () => {
    const url = URL.createObjectURL(new Blob([atual.linhas.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `ECF-lucro-real-${f.aba}-${cnpj.replace(/\W/g, "")}-${ano}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const botao = (id: Aba, t: string) => <button type="button" onClick={() => setF((a) => ({ ...a, aba: id }))} className={`rounded border px-2 py-1 font-semibold ${f.aba === id ? "border-amber-600 bg-amber-200" : "border-amber-300 bg-white"}`}>{t}</button>;

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-white/80 p-3 text-xs">
      <h4 className="flex items-center gap-2 font-bold"><Calculator className="h-4 w-4" /> ECF — Lucro Real: estimativa mensal e apuração trimestral ({ano})</h4>
      {!ehReal && <p className="mt-1 rounded bg-amber-50 p-2">Esta empresa está cadastrada como “{empresaRegime || "regime não informado"}”. Os cálculos abaixo só valem para Lucro Real.</p>}
      <div className="mt-2 flex flex-wrap gap-2">{botao("estimativa", "Estimativa mensal (receita bruta)")}{botao("trimestral", "Apuração trimestral")}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label>Alíquota da CSLL<select className={campo} value={f.aliq} onChange={(e) => setF((a) => ({ ...a, aliq: e.target.value }))}><option value="1">9% (demais PJ)</option><option value="4">15%</option><option value="3">20%</option></select></label>
        {f.aba === "estimativa" ? (
          <label>Atividade (percentuais de presunção)<select className={campo} value={f.ativ} onChange={(e) => setF((a) => ({ ...a, ativ: e.target.value }))}><option value="a">Comércio, indústria e demais — IRPJ 8% / CSLL 12%</option><option value="b">Serviços em geral — IRPJ 32% / CSLL 32%</option></select></label>
        ) : (<>
          <label>Saldo de prejuízo fiscal a compensar<input className={campo} inputMode="decimal" value={f.saldoPrejuizo} onChange={(e) => setF((a) => ({ ...a, saldoPrejuizo: e.target.value }))} /></label>
          <label>Saldo de base negativa da CSLL<input className={campo} inputMode="decimal" value={f.saldoBaseNeg} onChange={(e) => setF((a) => ({ ...a, saldoBaseNeg: e.target.value }))} /></label>
        </>)}
      </div>
      {f.aba === "estimativa" ? (
        <>
          <p className="mt-2 text-[11px]">A receita de cada mês vem da contabilidade. Informe só o IRRF do mês e, se houver, ganhos de capital/outras receitas (acréscimos). Atividades mistas (16%, 38,4%) e balancete de suspensão/redução: use as funções do robô ou o programa da ECF.</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="bg-amber-100"><th className="p-1">Mês</th><th className="p-1">Receita</th><th className="p-1">Acréscimos</th><th className="p-1">IRRF (N620/21)</th><th className="p-1">Base IRPJ</th><th className="p-1">IRPJ do mês</th><th className="p-1">Base CSLL</th><th className="p-1">CSLL do mês</th></tr></thead>
            <tbody>{MESES.map((m, i) => { const r = estimativa.r.find((x) => x.mes === i + 1); return (
              <tr key={m} className="border-t border-amber-100">
                <td className="p-1 font-bold">{m}</td><td className="p-1">{brl((receitaPorMesCentavos[i] || 0) / 100)}</td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1 py-0.5" inputMode="decimal" value={f.meses[i]?.acresc || ""} onChange={(e) => setF((a) => ({ ...a, meses: a.meses.map((x, j) => (j === i ? { ...x, acresc: e.target.value } : x)) }))} /></td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1 py-0.5" inputMode="decimal" value={f.meses[i]?.irrf || ""} onChange={(e) => setF((a) => ({ ...a, meses: a.meses.map((x, j) => (j === i ? { ...x, irrf: e.target.value } : x)) }))} /></td>
                <td className="p-1">{r ? brl(r.baseIrpj) : "—"}</td><td className="p-1 font-bold">{r ? brl(r.irpjDevido) : "—"}</td><td className="p-1">{r ? brl(r.baseCsll) : "—"}</td><td className="p-1 font-bold">{r ? brl(r.csllDevida) : "—"}</td>
              </tr>); })}</tbody>
          </table></div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[11px]">O resultado de cada trimestre vem da contabilidade. Informe adições e exclusões totais do trimestre (entram no e-Lalur e no e-Lacs com os códigos 8 e 167.01); para detalhar por código use o painel anual. O prejuízo de um trimestre é compensado nos seguintes, limitado a 30%.</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="bg-amber-100"><th className="p-1">Trimestre</th><th className="p-1">Resultado</th><th className="p-1">Adições</th><th className="p-1">Exclusões</th><th className="p-1">Base IRPJ</th><th className="p-1">IRPJ</th><th className="p-1">Base CSLL</th><th className="p-1">CSLL</th></tr></thead>
            <tbody>{PER.map((p, i) => { const r = trimestral.r.find((x) => x.periodo === p); return (
              <tr key={p} className="border-t border-amber-100">
                <td className="p-1 font-bold">{p}</td><td className="p-1">{brl((resultadoPorTrimestre[i]?.resultado || 0) / 100)}</td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1 py-0.5" inputMode="decimal" value={f.tri[i]?.adicoes || ""} onChange={(e) => setF((a) => ({ ...a, tri: a.tri.map((x, j) => (j === i ? { ...x, adicoes: e.target.value } : x)) }))} /></td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1 py-0.5" inputMode="decimal" value={f.tri[i]?.exclusoes || ""} onChange={(e) => setF((a) => ({ ...a, tri: a.tri.map((x, j) => (j === i ? { ...x, exclusoes: e.target.value } : x)) }))} /></td>
                <td className="p-1">{r ? brl(r.baseIrpj) : "—"}</td><td className="p-1 font-bold">{r ? brl(r.irpjAPagar) : "—"}</td><td className="p-1">{r ? brl(r.baseCsll) : "—"}</td><td className="p-1 font-bold">{r ? brl(r.csllAPagar) : "—"}</td>
              </tr>); })}</tbody>
          </table></div>
        </>
      )}
      {atual.erro && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-red-900">{atual.erro}</p>}
      {atual.r.flatMap((x: any) => x.avisos as string[]).map((a, i) => <p key={i} className="mt-1 text-[11px]">• {a}</p>)}
      <button type="button" onClick={baixar} disabled={!atual.linhas.length} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar registros (.txt)</button>
    </div>
  );
};
