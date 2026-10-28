import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Download } from "lucide-react";
import { calcularAnoPresumido, calcularTrimestrePresumido, EntradaTrimestrePresumido, PeriodoPresumido, registrosBlocoPTrimestre } from "../services/ecfPresumidoService";
import { analisarObrigatoriedadeECD } from "../services/ecdService";

interface Props {
  /** Entrega os registros calculados (Bloco P) para o arquivo completo da ECF. */
  onRegistros?: (linhas: string[]) => void;
  empresaRegime: string;
  cnpj: string;
  ano: number;
  /** Receita bruta apurada na contabilidade por trimestre (centavos), contas de receita. */
  receitaContabilPorTrimestre: number[];
}

const PERIODOS: PeriodoPresumido[] = ["T01", "T02", "T03", "T04"];
const ATIVIDADES: Array<{ id: string; t: string; irpj: keyof EntradaTrimestrePresumido["receitaIrpj"]; csll: keyof EntradaTrimestrePresumido["receitaCsll"] }> = [
  { id: "a", t: "Comércio, indústria e demais — IRPJ 8% / CSLL 12%", irpj: "p8", csll: "p12" },
  { id: "b", t: "Serviços em geral — IRPJ 32% / CSLL 32%", irpj: "p32", csll: "p32" },
  { id: "c", t: "Transporte de cargas / serv. hospitalares — IRPJ 16%/8% / CSLL 12%/32% (informe nas linhas manuais)", irpj: "p8", csll: "p12" },
];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const EcfPresumidoPainel: React.FC<Props> = ({ empresaRegime, cnpj, ano, receitaContabilPorTrimestre, onRegistros }) => {
  const chave = `murade_ecf_presumido_${cnpj.replace(/\W/g, "")}_${ano}`;
  const vazio = () => ({ ativ: "a", aliq: "1", trimestres: PERIODOS.map(() => ({ irrf: "", outras: "" })) });
  const [f, setF] = useState(vazio);
  useEffect(() => {
    try { const s = localStorage.getItem(chave); setF(s ? { ...vazio(), ...JSON.parse(s) } : vazio()); } catch { setF(vazio()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const ehPresumido = /presumido/i.test(empresaRegime || "");
  const atividade = ATIVIDADES.find((a) => a.id === f.ativ) || ATIVIDADES[0];
  const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };

  const calculo = useMemo(() => {
    const entradas = PERIODOS.map((p, i) => {
      const receita = (receitaContabilPorTrimestre[i] || 0) / 100;
      const entrada: EntradaTrimestrePresumido = {
        periodo: p,
        receitaIrpj: { p16: 0, p8: 0, p16b: 0, p32: 0, p384: 0, [atividade.irpj]: receita },
        receitaCsll: { p12: 0, p32: 0, p384: 0, [atividade.csll]: receita },
        outrasReceitas: num(f.trimestres[i].outras) ? { "11": num(f.trimestres[i].outras) } : undefined,
        deducoesImposto: num(f.trimestres[i].irrf) ? { "10": num(f.trimestres[i].irrf) } : undefined,
      };
      return { entrada, usado: receita > 0 || num(f.trimestres[i].outras) > 0 || num(f.trimestres[i].irrf) > 0 };
    });
    // Em 2026 em diante, só entram os trimestres com movimento (o limite anual da LC 224/25 conta trimestres apurados).
    const lista = ano >= 2026 ? entradas.filter((x) => x.usado).map((x) => x.entrada) : entradas.map((x) => x.entrada);
    let itens: ReturnType<typeof calcularTrimestrePresumido>[] = [];
    try { itens = calcularAnoPresumido({ anoCalendario: ano, indAliquotaCsll: f.aliq }, lista); }
    catch (e) { return { erro: (e as Error).message, linhas: [] as string[], itens }; }
    return { erro: null as string | null, linhas: itens.flatMap((r) => registrosBlocoPTrimestre(ano, r)), itens };
  }, [ano, f, receitaContabilPorTrimestre, atividade]);

  useEffect(() => { onRegistros?.(calculo.erro ? [] : calculo.linhas); }, [calculo, onRegistros]);

  const baixar = () => {
    const url = URL.createObjectURL(new Blob([calculo.linhas.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `ECF-presumido-bloco-P-${cnpj.replace(/\W/g, "")}-${ano}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const campo = "mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1";
  const obrig = analisarObrigatoriedadeECD({ regime: empresaRegime }).situacao;

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-white/80 p-3 text-xs">
      <h4 className="flex items-center gap-2 font-bold"><Calculator className="h-4 w-4" /> ECF — Lucro Presumido: apuração de IRPJ e CSLL ({ano})</h4>
      {!ehPresumido && <p className="mt-1 rounded bg-amber-50 p-2">Esta empresa está cadastrada como “{empresaRegime || "regime não informado"}”. A apuração abaixo só vale para Lucro Presumido.</p>}
      <p className="mt-1 text-[11px]">Calcula o Bloco P (P200 a P500) pelas fórmulas da tabela dinâmica da ECF Leiaute 12 (inclui, de 2026 em diante, o adicional da Lei Complementar 224/25 sobre a receita que passa de R$ 1.250.000 por trimestre). A receita vem da contabilidade (contas de receita, por trimestre). Não inclui ainda P100/P150, blocos 0, C, X e Y do arquivo completo; use como conferência e para importar no programa da ECF.</p>
      {calculo.erro ? <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-red-900">{calculo.erro}</p> : (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label>Atividade (percentuais de presunção)<select className={campo} value={f.ativ} onChange={(e) => setF((a) => ({ ...a, ativ: e.target.value }))}>{ATIVIDADES.map((a) => <option key={a.id} value={a.id}>{a.t}</option>)}</select></label>
            <label>Alíquota da CSLL (0020.IND_ALIQ_CSLL)<select className={campo} value={f.aliq} onChange={(e) => setF((a) => ({ ...a, aliq: e.target.value }))}><option value="1">1 – 9% (demais PJ)</option><option value="4">4 – 15%</option><option value="3">3 – 20%</option></select></label>
          </div>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="bg-amber-100"><th className="p-1">Trimestre</th><th className="p-1">Receita bruta</th><th className="p-1">Outras receitas (P200/11)</th><th className="p-1">IRRF (P300/10)</th><th className="p-1">Base IRPJ</th><th className="p-1">IRPJ a pagar</th><th className="p-1">Base CSLL</th><th className="p-1">CSLL a pagar</th></tr></thead>
            <tbody>{calculo.itens.map((r, i) => (
              <tr key={r.periodo} className="border-t border-amber-100">
                <td className="p-1 font-bold">{r.periodo}</td>
                <td className="p-1">{brl((receitaContabilPorTrimestre[i] || 0) / 100)}</td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1" inputMode="decimal" value={f.trimestres[i].outras} onChange={(e) => setF((a) => ({ ...a, trimestres: a.trimestres.map((t, j) => (j === i ? { ...t, outras: e.target.value } : t)) }))} /></td>
                <td className="p-1"><input className="w-24 rounded border border-amber-300 px-1" inputMode="decimal" value={f.trimestres[i].irrf} onChange={(e) => setF((a) => ({ ...a, trimestres: a.trimestres.map((t, j) => (j === i ? { ...t, irrf: e.target.value } : t)) }))} /></td>
                <td className="p-1">{brl(r.baseIrpj)}</td><td className="p-1 font-bold">{brl(r.irpjAPagar)}</td><td className="p-1">{brl(r.baseCsll)}</td><td className="p-1 font-bold">{brl(r.csllAPagar)}</td>
              </tr>))}</tbody>
          </table></div>
          {obrig === "dispensada" && <p className="mt-2 text-[11px]">Atenção: pelo regime cadastrado a ECF pode estar dispensada; confira a obrigatoriedade antes.</p>}
          <button type="button" onClick={baixar} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold"><Download className="h-3.5 w-3.5" /> Baixar registros do Bloco P (.txt)</button>
        </>
      )}
    </div>
  );
};
