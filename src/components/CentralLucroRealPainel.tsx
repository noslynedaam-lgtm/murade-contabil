import React, { useCallback, useEffect, useState } from "react";
import { perguntarNaTela } from "../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";

// Central do Lucro Real da empresa: todas as obrigações com vencimento, avisos, diferenças entre Fiscal, DP e Contábil (que
// bloqueiam a guia) e as pendências conhecidas. Botões: "Conferir agora", "Aceitar a diferença" e "Dar baixa"; JCP pago ou creditado
// (vira o IRRF do DARF 5706), "Buscar retenções no Fiscal agora" e o aviso no celular (pelo aplicativo do Murad Fiscal).
const BAIXA_AQUI = new Set(["dctfweb", "efd_contribuicoes", "irrf_jcp", "irrf_tomador", "csrf_tomador"]);
const reais = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (d: string) => (d ? d.split("-").reverse().join("/") : "");
const COR: Record<string, string> = { aguardando_apuracao: "bg-red-100 text-red-900", conferir: "bg-amber-100 text-amber-900", confirmada: "bg-sky-100 text-sky-900", baixada: "bg-emerald-100 text-emerald-900" };
const NOME: Record<string, string> = { aguardando_apuracao: "Aguardando apuração", conferir: "Conferir e confirmar", confirmada: "Confirmada — falta a baixa", baixada: "Baixada" };

export const CentralLucroRealPainel: React.FC<{ cnpj: string; ano: number }> = ({ cnpj, ano }) => {
  const limpo = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  const [jcp, setJcp] = useState<any[]>([]); const [jData, setJData] = useState(""); const [jValor, setJValor] = useState(""); const [jBenef, setJBenef] = useState("");
  const [aviso, setAviso] = useState<any>(null);
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const carregar = useCallback(async () => {
    if (limpo.length !== 14) return;
    try { const r = await fetch(`/api/workspaces/${limpo}/lucro-real/central?ano=${ano}`, { credentials: "include", cache: "no-store" }); const j = await r.json().catch(() => ({})); setD(r.ok && j.sucesso ? j : null); } catch { setD(null); }
  }, [limpo, ano]);
  const carregarExtras = useCallback(async () => {
    if (limpo.length !== 14) return;
    try { const r = await fetch(`/api/workspaces/${limpo}/lucro-real/jcp-pagamentos?ano=${ano}`, { credentials: "include", cache: "no-store" }); const j = await r.json().catch(() => ({})); setJcp(r.ok && j.sucesso ? j.jcp || [] : []); } catch { setJcp([]); }
    try { const r = await fetch("/api/lucro-real/aviso-celular", { credentials: "include", cache: "no-store" }); const j = await r.json().catch(() => ({})); setAviso(r.ok && j.sucesso ? j : null); } catch { setAviso(null); }
  }, [limpo, ano]);
  useEffect(() => { void carregar(); void carregarExtras(); }, [carregar, carregarExtras]);
  const post = async (url: string, corpo: any, ok: string) => {
    setOcupado(true); setMsg("");
    try { const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }); const j = await r.json().catch(() => ({})); setMsg(r.ok && j.sucesso ? ok : j.motivo || "Não foi possível."); if (j.obrigacoes) setD(j); else await carregar(); }
    finally { setOcupado(false); void carregarExtras(); }
  };
  if (!d) return null;
  const abertas = (d.divergencias || []).filter((x: any) => x.estado === "aberta");
  return (
    <section className="space-y-2 rounded-xl border border-[#E5E6EB] bg-white p-3" data-campo="central-lucro-real">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold">Central do Lucro Real — {ano}</h3><p className="text-[11px] text-[#86909C]">Tudo o que a empresa tem de pagar e entregar, com vencimento e fonte. O robô confere de 2 em 2 horas; os avisos só param com a confirmação e a baixa.</p></div>
        <button type="button" disabled={ocupado} className="min-h-10 rounded-lg bg-[#0F2B5B] px-3 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => void post(`/api/workspaces/${limpo}/lucro-real/central/conferir`, { ano }, "Conferido agora.")}>{ocupado ? "Conferindo…" : "Conferir agora"}</button>
      </div>
      {abertas.length > 0 && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2 text-xs text-red-950">
        <p className="font-bold">Diferença entre os sistemas — a guia do período fica BLOQUEADA até você decidir</p>
        <ul className="mt-1 space-y-2">{abertas.map((x: any) => <li key={x.id} className="rounded bg-white p-2"><b>{x.competencia}</b> · {x.explicacao}
          <div className="mt-1"><button type="button" disabled={ocupado} className="min-h-10 rounded border-2 border-red-400 bg-white px-3 py-1 font-bold" onClick={async () => { const m = await perguntarNaTela(`Por que a diferença de ${x.competencia} está certa? (fica registrado com o seu nome)`); if (m) void post(`/api/workspaces/${limpo}/lucro-real/divergencias/decidir`, { id: x.id, motivo: m }, "Diferença aceita e registrada."); }}>Conferi: a diferença está certa</button>
            <span className="ml-2 text-[11px]">Ou corrija na origem (Fiscal, DP ou lançamentos) e clique em "Conferir agora".</span></div></li>)}</ul></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs"><thead><tr className="text-left text-[#4E5969]"><th className="p-1">Obrigação</th><th className="p-1">Vencimento</th><th className="p-1">Valor</th><th className="p-1">DARF</th><th className="p-1">Situação</th><th className="p-1">O que falta</th></tr></thead>
        <tbody>{(d.obrigacoes || []).map((o: any) => <tr key={o.id} className="border-t align-top"><td className="p-1">{o.descricao}{o.bloqueada && <span className="ml-1 rounded bg-red-600 px-1 font-bold text-white">BLOQUEADA</span>}</td><td className="p-1">{dataBR(o.vencimento)}</td><td className="p-1">{reais(o.valorCentavos)}</td><td className="p-1">{o.codigoDarf || "—"}</td>
          <td className="p-1"><span className={`rounded px-1 font-semibold ${COR[o.estado] || ""}`}>{NOME[o.estado] || o.estado}</span></td>
          <td className="p-1">{o.oQueFalta}{BAIXA_AQUI.has(o.tipo) && <button type="button" disabled={ocupado} className="ml-1 underline font-semibold" onClick={async () => { if (o.estado === "baixada") { void post(`/api/workspaces/${limpo}/lucro-real/baixa`, { obrigacaoId: o.id, desfazer: true }, "Baixa desfeita."); return; } const rec = await perguntarNaTela(o.guia ? `Dar baixa (DARF pago) em "${o.descricao}"? Digite o número ou a autenticação do pagamento (pode deixar em branco).` : `Dar baixa em "${o.descricao}"? Digite o número do recibo (pode deixar em branco).`); if (rec !== null) void post(`/api/workspaces/${limpo}/lucro-real/baixa`, { obrigacaoId: o.id, recibo: rec }, "Baixa registrada."); }}>{o.estado === "baixada" ? "Desfazer baixa" : "Dar baixa"}</button>}</td></tr>)}</tbody></table></div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-[#E5E6EB] p-2 text-xs" data-campo="jcp-pagamentos">
          <p className="font-bold">JCP pago ou creditado (IRRF — DARF 5706)</p>
          <p className="text-[11px] text-[#86909C]">17,5% desde 1º/01/2026 (LC 224/2025); vence no 3º dia útil depois do decêndio do pagamento (Lei 11.196/2005, art. 70, I, b). O cálculo do limite fica em "JCP" acima.</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <label className="flex flex-col">Data do pagamento ou crédito<input type="date" value={jData} onChange={(e) => setJData(e.target.value)} className="min-h-10 rounded border px-2" /></label>
            <label className="flex flex-col">Valor bruto do JCP (R$)<input inputMode="decimal" value={jValor} onChange={(e) => setJValor(e.target.value)} placeholder="10.000,00" className="min-h-10 w-32 rounded border px-2" /></label>
            <label className="flex flex-1 flex-col">Beneficiários (opcional)<input value={jBenef} onChange={(e) => setJBenef(e.target.value)} className="min-h-10 rounded border px-2" /></label>
          </div>
          <button type="button" disabled={ocupado || !jData || !jValor} className="mt-1 min-h-10 rounded-lg bg-[#0F2B5B] px-3 py-1 font-bold text-white disabled:opacity-50" onClick={() => void post(`/api/workspaces/${limpo}/lucro-real/jcp-pagamentos`, { dataPagamento: jData, valor: jValor, beneficiarios: jBenef }, "JCP registrado: o IRRF entrou na lista acima.").then(() => { setJValor(""); setJBenef(""); })}>Registrar JCP</button>
          {jcp.length > 0 && <ul className="mt-1 space-y-1">{jcp.map((j) => <li key={j.id} className="flex flex-wrap items-center gap-2 rounded bg-[#F7F8FA] p-1"><span>{dataBR(j.dataPagamento)} · {reais(j.valorCentavos)} · IRRF {reais(j.irrfCentavos)} ({String(j.aliquotaPercentual).replace(".", ",")}%) · vence {dataBR(j.vencimento)}</span>
            <button type="button" disabled={ocupado} className="ml-auto underline" onClick={async () => { if (!(await pedir({ titulo: "Apagar este JCP?", oQue: `o JCP de ${dataBR(j.dataPagamento)} (${reais(j.valorCentavos)})`, consequencias: ["Só este registro é apagado; os outros ficam.", "A obrigação do IRRF (DARF 5706) dele sai da Central.", "Para voltar, registre o JCP de novo."] }))) return; void post(`/api/workspaces/${limpo}/lucro-real/jcp-pagamentos/excluir`, { id: j.id }, "JCP apagado."); }}>Apagar este JCP</button></li>)}</ul>}
        </div>
        <div className="space-y-2 rounded-lg border border-[#E5E6EB] p-2 text-xs">
          <div data-campo="retencoes-tomador"><p className="font-bold">Retenções como tomadora (IRRF e CSRF 5952)</p>
            <p className="text-[11px] text-[#86909C]">Vêm sozinhas das NFS-e tomadas (rascunho da EFD-Reinf do Fiscal), de 2 em 2 horas. Vencimento: último dia útil do 2º decêndio do mês seguinte ao pagamento.</p>
            <button type="button" disabled={ocupado} className="mt-1 min-h-10 rounded-lg border-2 border-[#0F2B5B] px-3 py-1 font-bold" onClick={() => void post(`/api/workspaces/${limpo}/lucro-real/retencoes/atualizar`, { ano }, "Retenções lidas no Fiscal agora.")}>Buscar retenções no Fiscal agora</button></div>
          <div data-campo="aviso-celular-lucro-real"><p className="font-bold">Aviso no celular</p>
            <p className="text-[11px] text-[#86909C]">Chega pelo aplicativo do Murad Fiscal, uma vez por dia por empresa, a partir das 8h. Para ativar no seu celular: abra o Murad Fiscal › menu ESCRITURAÇÃO FISCAL › Federal & Simples › Central Anti-Multa › botão "Abrir" › botão "Ativar avisos neste aparelho" (no iPhone, com o aplicativo instalado na Tela de Início).</p>
            <p className="mt-1">{aviso ? (() => { const h = (aviso.hoje || []).filter((x: any) => x.cnpj === limpo); return h.length ? `Hoje: ${h[0].enviados} aparelho(s) receberam${h[0].semAparelho ? `; ${h[0].semAparelho} pessoa(s) sem aparelho ativado` : ""}${h[0].adiados ? `; ${h[0].adiados} adiado(s) pelo horário silencioso` : ""}.` : "Hoje ainda não saiu aviso desta empresa."; })() : "—"}</p>
            <button type="button" disabled={ocupado} className="mt-1 min-h-10 rounded-lg border-2 border-[#0F2B5B] px-3 py-1 font-bold" onClick={() => void post("/api/lucro-real/aviso-celular/enviar", { cnpj: limpo }, "Aviso mandado para o celular (se houver aviso hoje).")}>Mandar aviso para o celular agora</button></div>
        </div>
      </div>
      {msg && <p role="status" className="text-xs font-semibold">{msg}</p>}
      {dialogo}
      <details className="text-[11px] text-[#4E5969]"><summary className="cursor-pointer font-semibold">O que ainda não está aqui (pendências conhecidas)</summary><ul className="ml-4 list-disc">{(d.pendenciasConhecidas || []).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></details>
    </section>
  );
};
