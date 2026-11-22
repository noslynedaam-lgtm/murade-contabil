import React, { useCallback, useEffect, useState } from "react";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";

// Livros → "Apuração do Lucro Real (IRPJ e CSLL)": o robô calcula sozinho pela contabilidade; aqui a contadora configura, lança as
// adições/exclusões (e-Lalur/e-Lacs Parte A), vê os saldos de prejuízo (Parte B), apura na hora, confirma, abre o DARF e calcula o JCP.

type P = Record<string, any>;
const reais = (c: number | null | undefined) => ((Number(c) || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
const entrada = "rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-sm";
const botao = "rounded-lg px-3 py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
const NOME_PERIODO = (p: string) => (p === "ANUAL" ? "Ajuste anual" : p.startsWith("T") ? `${p.slice(2)}º trimestre` : `Estimativa de ${p.slice(1)}`);
const SELO: Record<string, string> = { calculado: "Pronto para confirmar", previa: "Prévia (mês não fechado)", revisar: "Precisa de revisão", confirmado: "Confirmado" };
const TIPOS: Array<[string, string]> = [["adicao", "Adição (M300/M350)"], ["exclusao", "Exclusão (M300/M350)"], ["irrf_retido", "IRRF retido na fonte"], ["csll_retida", "CSLL retida na fonte"], ["deducao_receita_bruta", "Devolução/cancelamento/desconto (só estimativa pela receita)"]];

async function chamar(metodo: "GET" | "POST", url: string, corpo?: unknown): Promise<{ ok: boolean; dados: any }> {
  try {
    const r = await fetch(url, { method: metodo, credentials: "include", cache: "no-store", headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const dados = await r.json().catch(() => ({})); return { ok: r.ok && dados?.sucesso !== false, dados };
  } catch { return { ok: false, dados: { motivo: "Sem conexão com o servidor." } }; }
}

export const ApuracaoLucroRealPainel: React.FC<{ cnpj: string; ano: number; empresaRegime?: string }> = ({ cnpj, ano, empresaRegime }) => {
  const base = `/api/workspaces/${encodeURIComponent(cnpj)}/lucro-real`;
  const [d, setD] = useState<P | null>(null);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [andamento, setAndamento] = useState<{ etapa: number; texto: string } | null>(null);
  const [cfg, setCfg] = useState<P>({}); const [novo, setNovo] = useState<P>({ mes: "1", tributo: "ambos", tipo: "adicao" });
  const [jcp, setJcp] = useState<P>({}); const [resJcp, setResJcp] = useState<P | null>(null);
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const carregar = useCallback(async () => { const r = await chamar("GET", `${base}?ano=${ano}`); if (r.ok) { setD(r.dados); const c = r.dados.config || r.dados.padrao; setCfg({ ...c, obrigada: c.obrigada === null ? "" : String(c.obrigada), saldoPrejuizoInicial: ((c.saldoPrejuizoInicialCentavos || 0) / 100).toFixed(2).replace(".", ","), saldoBaseNegativaInicial: ((c.saldoBaseNegativaInicialCentavos || 0) / 100).toFixed(2).replace(".", ",") }); } else setMsg({ erro: true, texto: r.dados?.motivo || "Não foi possível carregar." }); }, [base, ano]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (empresaRegime && !/real/i.test(empresaRegime)) return null;
  const fazer = async (f: () => Promise<{ ok: boolean; dados: any }>, ok: string) => { setOcupado(true); setMsg(null); const r = await f(); setOcupado(false); setMsg({ erro: !r.ok, texto: r.ok ? ok : r.dados?.motivo || "Não foi possível concluir." }); if (r.ok) await carregar(); return r; };
  const apurar = async () => {
    setOcupado(true); setMsg(null);
    setAndamento({ etapa: 1, texto: "Lendo o balancete e o e-Lalur/e-Lacs…" });
    await new Promise((x) => setTimeout(x, 150));
    setAndamento({ etapa: 2, texto: "Calculando IRPJ e CSLL de cada período…" });
    const r = await chamar("POST", `${base}/apurar`, { ano });
    setAndamento({ etapa: 3, texto: "Atualizando a tela…" });
    if (r.ok) setD(r.dados);
    setOcupado(false); setAndamento(null);
    setMsg({ erro: !r.ok, texto: r.ok ? (r.dados.avisos?.length ? r.dados.avisos.join(" ") : "Apuração feita. Confira e confirme cada período.") : r.dados?.motivo || "Não foi possível apurar." });
  };
  const periodos: P[] = d?.periodos || [];
  return (
    <section className="space-y-3 rounded-xl border border-[#E5E6EB] bg-white p-3 sm:p-4" data-campo="apuracao-lucro-real">
      {dialogo}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="text-sm font-bold">Apuração do Lucro Real (IRPJ e CSLL) — {ano}</h3>
          <p className="text-[11px] text-[#86909C]">O robô calcula sozinho a cada 6 horas pela contabilidade. Aqui você configura, lança adições e exclusões, apura na hora e confirma. Nada é pago nem transmitido.</p></div>
        <button type="button" className={`${botao} bg-[#165DFF] text-white`} disabled={ocupado} onClick={() => void apurar()}>{ocupado && andamento ? "Apurando…" : "Apurar agora"}</button>
      </div>
      {andamento && (<div role="progressbar" aria-valuenow={andamento.etapa * 33} className="rounded-lg border border-sky-200 bg-sky-50 p-2"><div className="flex justify-between text-[11px] font-semibold text-sky-900"><span>{andamento.texto}</span><span>{andamento.etapa} de 3</span></div><div className="mt-1 h-2 rounded-full bg-sky-100"><div className="h-2 animate-pulse rounded-full bg-[#165DFF] transition-all" style={{ width: `${andamento.etapa * 33}%` }} /></div></div>)}
      {msg && <div role="status" className={`rounded-lg border p-2 text-xs font-semibold ${msg.erro ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{msg.texto}</div>}

      <details className="rounded-lg border border-[#E5E6EB] p-2.5" open={!d?.config} data-campo="lr-config">
        <summary className="cursor-pointer text-xs font-bold">1. Configuração da empresa {d?.config ? "" : "(falta configurar)"}</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2 text-[11px] font-semibold text-[#4E5969]">
          <label className="flex flex-col">Forma de pagamento<select className={entrada} value={cfg.forma || "trimestral"} onChange={(e) => setCfg({ ...cfg, forma: e.target.value })}><option value="trimestral">Trimestral</option><option value="estimativa">Estimativa mensal + ajuste anual</option></select></label>
          <label className="flex flex-col">Obrigada ou optante?<select className={entrada} value={cfg.obrigada ?? ""} onChange={(e) => setCfg({ ...cfg, obrigada: e.target.value })}><option value="">Escolha…</option><option value="true">Obrigada ao Lucro Real</option><option value="false">Optante pelo Lucro Real</option></select></label>
          <label className="flex flex-col">Atividade (estimativa pela receita)<select className={entrada} value={cfg.atividadeEstimativa || "comercio"} onChange={(e) => setCfg({ ...cfg, atividadeEstimativa: e.target.value })}>{(d?.atividades || []).map((a: P) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select></label>
          <label className="flex flex-col">Alíquota da CSLL<select className={entrada} value={cfg.indAliquotaCsll || "1"} onChange={(e) => setCfg({ ...cfg, indAliquotaCsll: e.target.value })}><option value="1">9%</option><option value="4">15%</option><option value="3">20%</option></select></label>
          <label className="flex flex-col">Ano em que o controle começa<input className={entrada} inputMode="numeric" value={cfg.anoInicial ?? ""} onChange={(e) => setCfg({ ...cfg, anoInicial: e.target.value })} /></label>
          <label className="flex flex-col">Prejuízo fiscal a compensar no início (R$)<input className={entrada} inputMode="decimal" value={cfg.saldoPrejuizoInicial ?? ""} onChange={(e) => setCfg({ ...cfg, saldoPrejuizoInicial: e.target.value })} /></label>
          <label className="flex flex-col">Base negativa da CSLL no início (R$)<input className={entrada} inputMode="decimal" value={cfg.saldoBaseNegativaInicial ?? ""} onChange={(e) => setCfg({ ...cfg, saldoBaseNegativaInicial: e.target.value })} /></label>
          <button type="button" className={`${botao} border border-[#CBD5E1] bg-white`} disabled={ocupado} onClick={() => void fazer(() => chamar("POST", `${base}/config`, { forma: cfg.forma, obrigada: cfg.obrigada, atividadeEstimativa: cfg.atividadeEstimativa, indAliquotaCsll: cfg.indAliquotaCsll, anoInicial: cfg.anoInicial, saldoPrejuizoInicial: cfg.saldoPrejuizoInicial, saldoBaseNegativaInicial: cfg.saldoBaseNegativaInicial }), "Configuração salva. Clique em Apurar agora.")}>Salvar configuração</button>
        </div>
        <p className="mt-1 text-[10px] text-[#86909C]">Obrigada/optante muda o código do DARF do IRPJ (2362/0220 ou 5993/3373 — Agenda Tributária da Receita). Saldo de prejuízo de antes do sistema: o da Parte B do e-Lalur da última ECF.</p>
      </details>

      <div className="rounded-lg border border-[#E5E6EB] p-2.5" data-campo="lr-periodos">
        <strong className="text-xs">2. Períodos apurados</strong>
        {periodos.length === 0 && <p className="mt-1 text-xs text-[#86909C]">Ainda não apurado. Clique em "Apurar agora".</p>}
        <div className="mt-2 space-y-2">{periodos.map((p) => (
          <div key={p.periodo} className="rounded-md border border-[#E5E6EB] bg-[#F8FAFC] p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{NOME_PERIODO(p.periodo)}{p.resultado?.modo ? ` — ${p.resultado.modo === "B" ? "pelo balancete (suspensão/redução)" : "pela receita bruta"}` : ""}</strong><span className="rounded-full border px-2 py-0.5 text-[11px] font-bold">{SELO[p.status] || p.status}</span></div>
            <div className="mt-1 flex flex-wrap gap-4"><span>IRPJ: <b>{reais(p.irpjCentavos)}</b></span><span>CSLL: <b>{reais(p.csllCentavos)}</b></span>{p.resultado?.alternativaCentavos !== undefined && <span className="text-[#86909C]">pelo outro jeito: {reais(p.resultado.alternativaCentavos)}</span>}</div>
            {(p.revisar || []).length > 0 && <ul className="mt-1 list-disc pl-4 text-red-800">{p.revisar.map((x: string) => <li key={x}>{x}</li>)}</ul>}
            {(p.resultado?.avisos || []).length > 0 && <ul className="mt-1 list-disc pl-4 text-[11px] text-[#4E5969]">{p.resultado.avisos.map((x: string) => <li key={x}>{x}</li>)}</ul>}
            {(p.resultado?.darfs || []).length > 0 && <div className="mt-1 flex flex-wrap gap-2">{p.resultado.darfs.map((x: P) => <a key={x.tributo} className="text-[11px] font-bold text-[#165DFF] underline" href={`${base}/darf/${ano}/${p.periodo}/${x.tributo}`} target="_blank" rel="noreferrer">DARF {x.tributo.toUpperCase()} {x.codigo || "(código a informar)"} — vence {dataBR(x.vencimento)}</a>)}</div>}
            <div className="mt-2 flex gap-2">
              {p.status === "calculado" && <button type="button" className={`${botao} bg-emerald-700 text-white`} disabled={ocupado} onClick={() => void fazer(() => chamar("POST", `${base}/confirmar`, { ano, periodo: p.periodo }), "Confirmado: a provisão foi para os pré-lançamentos (aprovar em Revisão).")}>Confirmar</button>}
              {p.status === "confirmado" && <button type="button" className={`${botao} border border-[#CBD5E1] bg-white`} disabled={ocupado} onClick={() => void fazer(() => chamar("POST", `${base}/reabrir`, { ano, periodo: p.periodo }), "Período reaberto.")}>Reabrir (administrador)</button>}
            </div>
          </div>))}</div>
        <p className="mt-1 text-[10px] text-[#86909C]">Fontes: Lei 9.430/1996 (trimestral ou estimativa), Lei 8.981/1995, art. 35 (balancete de suspensão/redução), Lei 9.249/1995, art. 3º (adicional), Lei 9.065/1995, arts. 15 e 16 (compensação até 30%).</p>
      </div>

      <div className="rounded-lg border border-[#E5E6EB] p-2.5" data-campo="lr-parte-b">
        <strong className="text-xs">3. Parte B — prejuízo fiscal e base negativa da CSLL</strong>
        <table className="mt-1 w-full text-[11px]"><thead><tr className="text-left text-[#86909C]"><th>Período</th><th>Prejuízo fiscal: início → compensado → fim</th><th>Base negativa: início → compensado → fim</th></tr></thead>
          <tbody>{(d?.parteB || []).map((x: P) => <tr key={x.periodo}><td>{NOME_PERIODO(x.periodo)}</td><td>{reais(x.prejuizoFiscal.inicial)} → {reais(x.prejuizoFiscal.compensado)} → <b>{reais(x.prejuizoFiscal.final)}</b></td><td>{reais(x.baseNegativa.inicial)} → {reais(x.baseNegativa.compensado)} → <b>{reais(x.baseNegativa.final)}</b></td></tr>)}</tbody></table>
      </div>

      <div className="rounded-lg border border-[#E5E6EB] p-2.5" data-campo="lr-parte-a">
        <strong className="text-xs">4. Parte A — adições, exclusões e retenções</strong>
        <div className="mt-2 flex flex-wrap items-end gap-2 text-[11px] font-semibold text-[#4E5969]">
          <label className="flex flex-col">Mês<select className={entrada} value={novo.mes} onChange={(e) => setNovo({ ...novo, mes: e.target.value })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, "0")}/{ano}</option>)}</select></label>
          <label className="flex flex-col">Tipo<select className={entrada} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="flex flex-col">Vale para<select className={entrada} value={novo.tributo} onChange={(e) => setNovo({ ...novo, tributo: e.target.value })}><option value="ambos">IRPJ e CSLL</option><option value="irpj">Só IRPJ</option><option value="csll">Só CSLL</option></select></label>
          <label className="flex flex-col">Código M300A/M350A<input className={entrada} placeholder="ex.: 8.60" value={novo.codigo || ""} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} /></label>
          <label className="flex flex-col">Descrição<input className={entrada} value={novo.descricao || ""} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} /></label>
          <label className="flex flex-col">Valor (R$)<input className={entrada} inputMode="decimal" value={novo.valor || ""} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} /></label>
          <label className="flex flex-col">De onde vem<input className={entrada} value={novo.justificativa || ""} onChange={(e) => setNovo({ ...novo, justificativa: e.target.value })} /></label>
          <button type="button" className={`${botao} border border-[#CBD5E1] bg-white`} disabled={ocupado} onClick={() => void fazer(() => chamar("POST", `${base}/lancamentos`, { ...novo, ano, mes: Number(novo.mes) }), "Lançamento gravado. Clique em Apurar agora.").then((r) => { if (r.ok) setNovo({ mes: novo.mes, tributo: "ambos", tipo: "adicao" }); })}>Lançar</button>
        </div>
        <ul className="mt-2 space-y-1 text-[11px]">{(d?.lancamentos || []).map((l: P) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-[#F2F3F5] p-1">
            <span>{String(l.mes).padStart(2, "0")}/{l.ano} · {TIPOS.find((t) => t[0] === l.tipo)?.[1]} {l.codigo && `(${l.codigo})`} · {l.descricao} · <b>{reais(l.valorCentavos)}</b> · {l.justificativa}</span>
            <button type="button" className="text-[11px] text-red-700 underline" disabled={ocupado} onClick={async () => {
              if (!await pedir({ titulo: "Excluir este lançamento do e-Lalur/e-Lacs?", oQue: `${l.descricao} de ${String(l.mes).padStart(2, "0")}/${l.ano} (${reais(l.valorCentavos)})`, consequencias: ["Só este lançamento é apagado; os outros ficam.", "A apuração do período muda: clique em Apurar agora depois."] })) return;
              void fazer(() => chamar("POST", `${base}/lancamentos/${encodeURIComponent(l.id)}/excluir`, { confirmar: true }), "Lançamento excluído.");
            }}>Excluir</button>
          </li>))}</ul>
      </div>

      <details className="rounded-lg border border-[#E5E6EB] p-2.5" data-campo="lr-jcp">
        <summary className="cursor-pointer text-xs font-bold">5. Juros sobre capital próprio (JCP)</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2 text-[11px] font-semibold text-[#4E5969]">
          {[["basePl", "Contas do PL (capital, reservas, lucros acumulados) — R$"], ["taxaTjlp", "TJLP do período (%)"], ["fonteTjlp", "De onde veio a TJLP"], ["lucroPeriodoAntesJcp", "Lucro do período antes dos juros — R$"], ["lucrosAcumuladosReservas", "Lucros acumulados + reservas de lucros — R$"], ["valorPretendido", "Quanto quer pagar (opcional) — R$"]].map(([k, t]) => (
            <label key={k} className="flex flex-col">{t}<input className={entrada} value={jcp[k] || ""} onChange={(e) => setJcp({ ...jcp, [k]: e.target.value })} /></label>))}
          <label className="flex flex-col">Data do pagamento/crédito<input type="date" className={entrada} value={jcp.dataPagamento || ""} onChange={(e) => setJcp({ ...jcp, dataPagamento: e.target.value })} /></label>
          <button type="button" className={`${botao} border border-[#CBD5E1] bg-white`} disabled={ocupado} onClick={() => void fazer(async () => { const r = await chamar("POST", `${base}/jcp`, jcp); if (r.ok) setResJcp(r.dados.jcp); return r; }, "JCP calculado.")}>Calcular</button>
        </div>
        {resJcp && <ul className="mt-2 list-disc pl-4 text-xs"><li>Máximo pela TJLP: {reais(resJcp.maximoTjlpCentavos)}; limite pelos lucros (metade): {reais(resJcp.limiteLucrosCentavos)}</li><li><b>JCP dedutível: {reais(resJcp.jcpDedutivelCentavos)}</b> · IRRF {resJcp.aliquotaIrrfPercentual}%: <b>{reais(resJcp.irrfCentavos)}</b> (DARF {resJcp.codigoDarf}, vence {dataBR(resJcp.vencimentoIrrf)}) · líquido ao sócio {reais(resJcp.liquidoCentavos)}</li>{(resJcp.avisos || []).map((x: string) => <li key={x} className="text-amber-900">{x}</li>)}</ul>}
        <p className="mt-1 text-[10px] text-[#86909C]">Lei 9.249/1995, art. 9º; IRRF de 17,5% desde 2026 (LC 224/2025, art. 8º); DARF 5706, 3º dia útil depois do decêndio do pagamento (Agenda Tributária). Se o JCP foi lançado contra lucros acumulados (e não como despesa), lance a exclusão na Parte A.</p>
      </details>
    </section>
  );
};
