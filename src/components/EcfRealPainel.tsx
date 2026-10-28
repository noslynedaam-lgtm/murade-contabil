import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Download, Plus, Trash2 } from "lucide-react";
import { calcularLucroRealAnual, registrosLucroRealAnual, type LancamentoLalur } from "../services/ecfRealService";

interface Props {
  empresaRegime: string;
  cnpj: string;
  ano: number;
  /** Resultado do exercício na contabilidade (centavos), antes do encerramento; positivo = lucro. */
  resultadoContabilCentavos: number;
  /** Despesas de IRPJ e de CSLL já contabilizadas no ano (centavos), detectadas pelo nome das contas. */
  irpjContabilizadoCentavos: number;
  csllContabilizadaCentavos: number;
}

type Linha = { codigo: string; descricao: string; valor: string; ambos: boolean };
const CODIGOS_COMUNS: Array<{ c: string; t: string }> = [
  { c: "6", t: "Provisões ou perdas estimadas não dedutíveis" }, { c: "7", t: "Custos não dedutíveis" }, { c: "8", t: "Despesas não necessárias" },
  { c: "8.30", t: "Despesas com alimentação de sócios, acionistas e administradores" }, { c: "8.40", t: "Despesas financeiras - lucros e/ou dividendos" },
  { c: "8.45", t: "Doações" }, { c: "8.50", t: "Furto" }, { c: "8.60", t: "Multas por infrações fiscais" },
  { c: "8.65", t: "Multas impostas por transgressões de leis de natureza não tributária" }, { c: "8.70", t: "Pagamentos sem causa" },
  { c: "167.01", t: "(-) Outras exclusões - qualquer indicador de relacionamento" },
];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const vazioLinha = (): Linha => ({ codigo: "", descricao: "", valor: "", ambos: true });

export const EcfRealPainel: React.FC<Props> = ({ empresaRegime, cnpj, ano, resultadoContabilCentavos, irpjContabilizadoCentavos, csllContabilizadaCentavos }) => {
  const chave = `murade_ecf_real_${cnpj.replace(/\W/g, "")}_${ano}`;
  const vazio = () => ({ aliq: "1", prejuizo: "", baseNeg: "", adicoes: [] as Linha[], exclusoes: [] as Linha[], irrf: "", estimativaIr: "", csllRetida: "", estimativaCsll: "" });
  const [f, setF] = useState(vazio);
  useEffect(() => {
    try { const s = localStorage.getItem(chave); setF(s ? { ...vazio(), ...JSON.parse(s) } : vazio()); } catch { setF(vazio()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const ehReal = /real/i.test(empresaRegime || "");
  const toL = (ls: Linha[], so?: (l: Linha) => boolean): LancamentoLalur[] => ls.filter((l) => l.codigo.trim() && num(l.valor) !== 0 && (!so || so(l))).map((l) => ({ codigo: l.codigo.trim(), descricao: l.descricao.trim() || CODIGOS_COMUNS.find((x) => x.c === l.codigo.trim())?.t || l.codigo.trim(), valor: num(l.valor) }));

  const calculo = useMemo(() => {
    try {
      const r = calcularLucroRealAnual({
        anoCalendario: ano, resultadoContabil: resultadoContabilCentavos / 100, irpjContabilizado: irpjContabilizadoCentavos / 100, csllContabilizada: csllContabilizadaCentavos / 100,
        adicoesIrpj: toL(f.adicoes), exclusoesIrpj: toL(f.exclusoes), adicoesCsll: toL(f.adicoes, (l) => l.ambos), exclusoesCsll: toL(f.exclusoes, (l) => l.ambos),
        saldoPrejuizoFiscal: num(f.prejuizo), saldoBaseNegativaCsll: num(f.baseNeg), indAliquotaCsll: f.aliq,
        deducoesIrpj: { ...(num(f.irrf) ? { "20": num(f.irrf) } : {}), ...(num(f.estimativaIr) ? { "24": num(f.estimativaIr) } : {}) },
        deducoesCsll: { ...(num(f.csllRetida) ? { "17": num(f.csllRetida) } : {}), ...(num(f.estimativaCsll) ? { "19": num(f.estimativaCsll) } : {}) },
      });
      return { erro: null as string | null, r, linhas: registrosLucroRealAnual(r) };
    } catch (e: any) { return { erro: String(e?.message || e), r: null, linhas: [] as string[] }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, f, resultadoContabilCentavos, irpjContabilizadoCentavos, csllContabilizadaCentavos]);

  const baixar = () => {
    const url = URL.createObjectURL(new Blob([calculo.linhas.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `ECF-lucro-real-M-N-${cnpj.replace(/\W/g, "")}-${ano}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const campo = "mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1";
  const setLinha = (tipo: "adicoes" | "exclusoes", i: number, parte: Partial<Linha>) => setF((a) => ({ ...a, [tipo]: a[tipo].map((l, j) => (j === i ? { ...l, ...parte } : l)) }));
  const bloco = (tipo: "adicoes" | "exclusoes", titulo: string) => (
    <div className="mt-2">
      <p className="font-bold">{titulo}</p>
      {f[tipo].map((l, i) => (
        <div key={i} className="mt-1 flex flex-wrap items-center gap-1">
          <input list="ecf-real-codigos" className="w-24 rounded border border-amber-300 px-1 py-1" placeholder="código" value={l.codigo} onChange={(e) => setLinha(tipo, i, { codigo: e.target.value })} />
          <input className="min-w-[10rem] flex-1 rounded border border-amber-300 px-1 py-1" placeholder="descrição (preenche sozinha para códigos comuns)" value={l.descricao} onChange={(e) => setLinha(tipo, i, { descricao: e.target.value })} />
          <input className="w-28 rounded border border-amber-300 px-1 py-1" inputMode="decimal" placeholder="valor" value={l.valor} onChange={(e) => setLinha(tipo, i, { valor: e.target.value })} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={l.ambos} onChange={(e) => setLinha(tipo, i, { ambos: e.target.checked })} /> também na CSLL</label>
          <button type="button" aria-label="Remover linha" onClick={() => setF((a) => ({ ...a, [tipo]: a[tipo].filter((_, j) => j !== i) }))}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => setF((a) => ({ ...a, [tipo]: [...a[tipo], vazioLinha()] }))} className="mt-1 inline-flex items-center gap-1 rounded border border-amber-400 bg-white px-2 py-1 font-semibold"><Plus className="h-3 w-3" /> Adicionar</button>
    </div>
  );

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-white/80 p-3 text-xs">
      <h4 className="flex items-center gap-2 font-bold"><Calculator className="h-4 w-4" /> ECF — Lucro Real anual: e-Lalur, e-Lacs, IRPJ e CSLL ({ano})</h4>
      {!ehReal && <p className="mt-1 rounded bg-amber-50 p-2">Esta empresa está cadastrada como “{empresaRegime || "regime não informado"}”. A apuração abaixo só vale para Lucro Real.</p>}
      <p className="mt-1 text-[11px]">O resultado do exercício vem da contabilidade e o robô separa IRPJ e CSLL já lançados. Falta só você informar adições, exclusões e saldos de prejuízo (Parte B). Calcula M300, M350, N500, N630, N650 e N670 pelas tabelas da ECF Leiaute 12. Não calcula incentivos fiscais, lucro da exploração, apuração trimestral/estimativa, nem gera os blocos 0, C, L, X e Y: use o arquivo para conferir e importar no programa da ECF.</p>
      <datalist id="ecf-real-codigos">{CODIGOS_COMUNS.map((c) => <option key={c.c} value={c.c}>{c.t}</option>)}</datalist>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="rounded bg-amber-50 p-2">Resultado do exercício (contabilidade)<div className="font-bold">{brl(resultadoContabilCentavos / 100)}</div></div>
        <div className="rounded bg-amber-50 p-2">IRPJ já contabilizado<div className="font-bold">{brl(irpjContabilizadoCentavos / 100)}</div></div>
        <div className="rounded bg-amber-50 p-2">CSLL já contabilizada<div className="font-bold">{brl(csllContabilizadaCentavos / 100)}</div></div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label>Alíquota da CSLL<select className={campo} value={f.aliq} onChange={(e) => setF((a) => ({ ...a, aliq: e.target.value }))}><option value="1">9% (demais PJ)</option><option value="4">15%</option><option value="3">20%</option></select></label>
        <label>Saldo de prejuízo fiscal a compensar<input className={campo} inputMode="decimal" value={f.prejuizo} onChange={(e) => setF((a) => ({ ...a, prejuizo: e.target.value }))} /></label>
        <label>Saldo de base negativa da CSLL<input className={campo} inputMode="decimal" value={f.baseNeg} onChange={(e) => setF((a) => ({ ...a, baseNeg: e.target.value }))} /></label>
      </div>
      {bloco("adicoes", "Adições (e-Lalur/e-Lacs)")}
      {bloco("exclusoes", "Exclusões (e-Lalur/e-Lacs)")}
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <label>IRRF a deduzir (N630/20)<input className={campo} inputMode="decimal" value={f.irrf} onChange={(e) => setF((a) => ({ ...a, irrf: e.target.value }))} /></label>
        <label>IRPJ pago por estimativa (N630/24)<input className={campo} inputMode="decimal" value={f.estimativaIr} onChange={(e) => setF((a) => ({ ...a, estimativaIr: e.target.value }))} /></label>
        <label>CSLL retida (N670/17)<input className={campo} inputMode="decimal" value={f.csllRetida} onChange={(e) => setF((a) => ({ ...a, csllRetida: e.target.value }))} /></label>
        <label>CSLL paga por estimativa (N670/19)<input className={campo} inputMode="decimal" value={f.estimativaCsll} onChange={(e) => setF((a) => ({ ...a, estimativaCsll: e.target.value }))} /></label>
      </div>
      {calculo.erro && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-red-900">{calculo.erro}</p>}
      {calculo.r && (
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-left">
          <tbody>
            <tr><td className="p-1">Lucro real antes da compensação</td><td className="p-1 font-bold">{brl(calculo.r.lucroRealAntesCompensacao)}</td><td className="p-1">Base da CSLL antes da compensação</td><td className="p-1 font-bold">{brl(calculo.r.baseNegativaCsllAntesCompensacao)}</td></tr>
            <tr><td className="p-1">Compensação de prejuízo (máx. 30%)</td><td className="p-1">{brl(calculo.r.compensacaoPrejuizo)}</td><td className="p-1">Compensação de base negativa (máx. 30%)</td><td className="p-1">{brl(calculo.r.compensacaoBaseNegativa)}</td></tr>
            <tr><td className="p-1">Base do IRPJ</td><td className="p-1 font-bold">{brl(calculo.r.baseIrpj)}</td><td className="p-1">Base da CSLL</td><td className="p-1 font-bold">{brl(calculo.r.baseCsll)}</td></tr>
            <tr className="bg-amber-100"><td className="p-1 font-bold">IRPJ a pagar</td><td className="p-1 font-bold">{brl(calculo.r.irpjAPagar)}</td><td className="p-1 font-bold">CSLL a pagar</td><td className="p-1 font-bold">{brl(calculo.r.csllAPagar)}</td></tr>
          </tbody>
        </table></div>
      )}
      {calculo.r?.avisos.map((a, i) => <p key={i} className="mt-1 text-[11px]">• {a}</p>)}
      <button type="button" onClick={baixar} disabled={!calculo.r} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar registros M300, M350 e N (.txt)</button>
    </div>
  );
};
