// Gestão › Títulos a pagar e receber, e Gestão › Cartões (antiga DIRF). Telas discretas, em cartões (bom no celular).
// Baixa e provisão viram lançamento pendente de aprovação; excluir é um título por vez, com duas confirmações.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ContaPlano, RotaEscrituracao } from "../types";
import { confirmarNaTela } from "../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { moedaContabil } from "../utils/livrosContabeis";
import { textoParaCentavos } from "../utils/escrituracaoAvancada";

type Titulo = {
  id: string; tipo: "pagar" | "receber"; numero: string; serie?: string; modelo?: string; participanteDocumento?: string; participanteNome: string; dataEmissao: string; vencimento?: string;
  valorCentavos: number; historico?: string; contaTitulo?: string; contaContrapartida?: string; baixas: Array<{ id: string; data: string; valorCentavos: number; documento?: string; historico?: string; origem: string }>;
  provisoes: Array<{ origem: string }>; origem: "murade" | "sistema_anterior"; situacao: string; baixadoCentavos: number;
};
const br = (d?: string) => (d ? d.split("-").reverse().join("/") : "—");
const campo = "mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs";

const SeletorConta: React.FC<{ rotulo: string; valor: string; contas: ContaPlano[]; onChange: (v: string) => void }> = ({ rotulo, valor, contas, onChange }) => (
  <label className="text-[11px] text-slate-600">{rotulo}
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={campo}><option value="">Escolha…</option>{contas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select>
  </label>
);

export const TitulosPainel: React.FC<{ onRota: RotaEscrituracao; contas: ContaPlano[]; podeGravar: boolean }> = ({ onRota, contas, podeGravar }) => {
  const analiticas = useMemo(() => contas.filter((c) => c.tipo === "analitica"), [contas]);
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const [lista, setLista] = useState<Titulo[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [filtro, setFiltro] = useState<"abertos" | "todos">("abertos");
  const [tipo, setTipo] = useState<"" | "pagar" | "receber">("");
  const [aberto, setAberto] = useState<{ id: string; modo: "baixa" | "editar" } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState<Record<string, string>>({ tipo: "pagar" });
  const [msg, setMsg] = useState("");
  const carregar = useCallback(async () => { const r = await onRota("GET", "titulos"); if (r.ok) { setLista(r.corpo.titulos || []); setResumo(r.corpo.resumo); } }, [onRota]);
  useEffect(() => { void carregar(); }, [carregar]);
  const visiveis = lista.filter((t) => (filtro === "todos" || t.situacao !== "baixado") && (!tipo || t.tipo === tipo));
  const enviar = async (metodo: Parameters<RotaEscrituracao>[0], caminho: string, corpo?: unknown) => { setMsg(""); const r = await onRota(metodo, caminho, corpo); if (r.ok) { setMsg(String(r.corpo?.mensagem || "Feito.")); setAberto(null); await carregar(); } else setMsg(String(r.corpo?.motivo || "Não foi possível.")); return r.ok; };
  const cadastrar = async () => {
    const valor = textoParaCentavos(novo.valor);
    if (valor === null || valor <= 0) return setMsg("Informe o valor (ex.: 1.234,56).");
    if (await enviar("POST", "titulos", { tipo: novo.tipo, numero: novo.numero || "", serie: novo.serie || undefined, participanteNome: novo.participante || "", participanteDocumento: novo.documento || undefined, dataEmissao: novo.data || "", vencimento: novo.vencimento || undefined, valorCentavos: valor, contaTitulo: novo.contaTitulo || undefined, contaContrapartida: novo.contaContrapartida || undefined, historico: novo.historico || undefined })) setNovo({ tipo: novo.tipo });
  };
  const baixar = async (t: Titulo) => {
    const valor = textoParaCentavos(form.valor);
    if (valor === null || valor <= 0) return setMsg("Informe o valor da baixa.");
    if (!(await confirmarNaTela(`Registrar a baixa de ${moedaContabil(valor)} do título ${t.numero} (${t.participanteNome}) em ${br(form.data)}? O lançamento vai para aprovação.`))) return;
    await enviar("POST", `titulos/${encodeURIComponent(t.id)}/baixa`, { data: form.data, valorCentavos: valor, contaDisponibilidade: form.disp, contaTitulo: form.contaTitulo || undefined, documento: form.documento || undefined });
  };
  const salvarEdicao = async (t: Titulo) => {
    await enviar("POST", "titulos", { id: t.id, tipo: t.tipo, numero: form.numero ?? t.numero, serie: form.serie ?? t.serie, participanteNome: form.participante ?? t.participanteNome, participanteDocumento: form.documento ?? t.participanteDocumento, dataEmissao: t.dataEmissao, vencimento: form.vencimento ?? t.vencimento, valorCentavos: t.valorCentavos, contaTitulo: form.contaTitulo ?? t.contaTitulo, contaContrapartida: form.contaContrapartida ?? t.contaContrapartida, historico: form.historico ?? t.historico });
  };
  const provisao = async (t: Titulo) => { if (await confirmarNaTela(`Gerar a provisão do título ${t.numero} (${moedaContabil(t.valorCentavos)})? O lançamento vai para aprovação.`)) await enviar("POST", `titulos/${encodeURIComponent(t.id)}/provisao`, {}); };
  const excluir = async (t: Titulo) => {
    if (!(await pedir({ titulo: "Excluir este título?", oQue: `o título ${t.numero} de ${t.participanteNome} (${moedaContabil(t.valorCentavos)})`, consequencias: ["Só este título sai da lista.", "Lançamentos já aprovados não mudam."], rotuloFinal: "Sim, excluir" }))) return;
    await enviar("DELETE", `titulos/${encodeURIComponent(t.id)}`);
  };
  return (
    <section data-campo="gestao-titulos" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs">
      {dialogo}
      <h3 className="text-sm font-bold text-slate-900">Títulos a pagar e a receber</h3>
      {resumo && <p className="text-slate-700">{resumo.abertos} em aberto ({resumo.vencidos} vencido(s)) · a pagar {moedaContabil(resumo.aPagarCentavos)} · a receber {moedaContabil(resumo.aReceberCentavos)}. Os vencimentos vão para a Agenda.</p>}
      <div className="flex flex-wrap gap-2">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="rounded border px-2 py-2"><option value="abertos">Em aberto</option><option value="todos">Todos</option></select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="rounded border px-2 py-2"><option value="">Pagar e receber</option><option value="pagar">A pagar</option><option value="receber">A receber</option></select>
      </div>
      {msg && <p role="status" className="rounded border border-slate-200 bg-slate-50 p-2">{msg}</p>}
      <ul className="space-y-2">
        {visiveis.map((t) => {
          const falta = t.valorCentavos - t.baixadoCentavos;
          return (
            <li key={t.id} className="rounded border border-slate-200 p-2">
              <div className="flex flex-wrap justify-between gap-1"><strong>{t.tipo === "pagar" ? "Pagar" : "Receber"} · {t.participanteNome}</strong><span className={t.situacao === "vencido" ? "font-bold text-red-700" : t.situacao === "baixado" ? "text-emerald-700" : "text-slate-600"}>{t.situacao}</span></div>
              <div className="text-slate-600">Título {t.numero}{t.serie ? `/${t.serie}` : ""}{t.modelo ? ` (mod. ${t.modelo})` : ""} · {t.participanteDocumento || "sem documento"} · emissão {br(t.dataEmissao)} · vencimento {br(t.vencimento)}</div>
              <div>Valor {moedaContabil(t.valorCentavos)} · baixado {moedaContabil(t.baixadoCentavos)}{falta > 0 ? ` · falta ${moedaContabil(falta)}` : ""}{t.origem === "sistema_anterior" ? " · veio do sistema anterior (já contabilizado lá)" : ""}</div>
              {t.baixas.length > 0 && <details className="text-[11px] text-slate-600"><summary className="cursor-pointer">Baixas ({t.baixas.length})</summary>{t.baixas.map((b) => <div key={b.id}>{br(b.data)} · {moedaContabil(b.valorCentavos)}{b.documento ? ` · doc ${b.documento}` : ""}{b.historico ? ` · ${b.historico}` : ""}{b.origem === "sistema_anterior" ? " (sistema anterior)" : ""}</div>)}</details>}
              <div className="mt-1 flex flex-wrap gap-2">
                {falta > 0 && <button type="button" disabled={!podeGravar} onClick={() => { setAberto({ id: t.id, modo: "baixa" }); setForm({ valor: (falta / 100).toFixed(2).replace(".", ","), data: new Date().toISOString().slice(0, 10), contaTitulo: t.contaTitulo || "" }); }} className="min-h-[40px] rounded border border-emerald-500 px-3 font-bold text-emerald-900 disabled:opacity-40">Baixar</button>}
                {!t.provisoes.length && <button type="button" disabled={!podeGravar} onClick={() => void provisao(t)} className="min-h-[40px] rounded border border-blue-400 px-3 disabled:opacity-40">Gerar provisão</button>}
                <button type="button" disabled={!podeGravar} onClick={() => { setAberto({ id: t.id, modo: "editar" }); setForm({}); }} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Editar</button>
                <button type="button" disabled={!podeGravar} onClick={() => void excluir(t)} className="min-h-[40px] rounded border border-rose-200 px-3 text-rose-800 disabled:opacity-40">Excluir</button>
              </div>
              {aberto?.id === t.id && aberto.modo === "baixa" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] text-slate-600">Data<input type="date" value={form.data || ""} onChange={(e) => setForm({ ...form, data: e.target.value })} className={campo} /></label>
                  <label className="text-[11px] text-slate-600">Valor<input inputMode="decimal" value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={campo} /></label>
                  <SeletorConta rotulo="Caixa ou banco" valor={form.disp || ""} contas={analiticas} onChange={(v) => setForm({ ...form, disp: v })} />
                  {!t.contaTitulo && <SeletorConta rotulo={t.tipo === "pagar" ? "Conta do fornecedor" : "Conta do cliente"} valor={form.contaTitulo || ""} contas={analiticas} onChange={(v) => setForm({ ...form, contaTitulo: v })} />}
                  <label className="text-[11px] text-slate-600">Documento (opcional)<input value={form.documento || ""} onChange={(e) => setForm({ ...form, documento: e.target.value })} className={campo} /></label>
                  <button type="button" onClick={() => void baixar(t)} className="min-h-[40px] rounded bg-emerald-700 px-3 font-bold text-white">Registrar baixa</button>
                </div>
              )}
              {aberto?.id === t.id && aberto.modo === "editar" && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {([["numero", "Número", t.numero], ["serie", "Série", t.serie], ["participante", t.tipo === "pagar" ? "Fornecedor" : "Cliente", t.participanteNome], ["documento", "CNPJ/CPF", t.participanteDocumento], ["historico", "Histórico", t.historico]] as Array<[string, string, string | undefined]>).map(([k, rot, v]) => (
                    <label key={k} className="text-[11px] text-slate-600">{rot}<input value={form[k] ?? v ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={campo} /></label>
                  ))}
                  <label className="text-[11px] text-slate-600">Vencimento<input type="date" value={form.vencimento ?? t.vencimento ?? ""} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className={campo} /></label>
                  <SeletorConta rotulo={t.tipo === "pagar" ? "Conta do fornecedor" : "Conta do cliente"} valor={form.contaTitulo ?? t.contaTitulo ?? ""} contas={analiticas} onChange={(v) => setForm({ ...form, contaTitulo: v })} />
                  <SeletorConta rotulo={t.tipo === "pagar" ? "Conta da despesa/estoque" : "Conta da receita"} valor={form.contaContrapartida ?? t.contaContrapartida ?? ""} contas={analiticas} onChange={(v) => setForm({ ...form, contaContrapartida: v })} />
                  <button type="button" onClick={() => void salvarEdicao(t)} className="min-h-[40px] rounded bg-blue-700 px-3 font-bold text-white">Salvar</button>
                </div>
              )}
            </li>
          );
        })}
        {!visiveis.length && <li className="text-slate-500">Nenhum título {filtro === "abertos" ? "em aberto" : ""}.</li>}
      </ul>
      <details className="rounded border border-slate-200 p-2">
        <summary className="cursor-pointer min-h-[40px] flex items-center font-bold">Novo título</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-slate-600">Tipo<select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} className={campo}><option value="pagar">A pagar</option><option value="receber">A receber</option></select></label>
          {([["numero", "Número"], ["serie", "Série"], ["participante", "Fornecedor ou cliente"], ["documento", "CNPJ/CPF"], ["valor", "Valor (ex.: 1.234,56)"], ["historico", "Histórico (opcional)"]] as Array<[string, string]>).map(([k, rot]) => (
            <label key={k} className="text-[11px] text-slate-600">{rot}<input value={novo[k] || ""} inputMode={k === "valor" ? "decimal" : undefined} onChange={(e) => setNovo({ ...novo, [k]: e.target.value })} className={campo} /></label>
          ))}
          <label className="text-[11px] text-slate-600">Data<input type="date" value={novo.data || ""} onChange={(e) => setNovo({ ...novo, data: e.target.value })} className={campo} /></label>
          <label className="text-[11px] text-slate-600">Vencimento<input type="date" value={novo.vencimento || ""} onChange={(e) => setNovo({ ...novo, vencimento: e.target.value })} className={campo} /></label>
          <SeletorConta rotulo="Conta do fornecedor/cliente" valor={novo.contaTitulo || ""} contas={analiticas} onChange={(v) => setNovo({ ...novo, contaTitulo: v })} />
          <SeletorConta rotulo="Conta da despesa/receita" valor={novo.contaContrapartida || ""} contas={analiticas} onChange={(v) => setNovo({ ...novo, contaContrapartida: v })} />
          <button type="button" disabled={!podeGravar} onClick={() => void cadastrar()} className="min-h-[40px] rounded bg-blue-700 px-3 font-bold text-white disabled:opacity-40">Cadastrar título</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Com as duas contas preenchidas, o robô prepara a provisão para aprovação sozinho; você também pode clicar em "Gerar provisão".</p>
      </details>
    </section>
  );
};

export const CartoesPainel: React.FC<{ onRota: RotaEscrituracao }> = ({ onRota }) => {
  const [dados, setDados] = useState<{ aviso: string; estabelecimentos: any[] } | null>(null);
  useEffect(() => { void onRota("GET", "cartoes").then((r) => { if (r.ok) setDados({ aviso: r.corpo.aviso, estabelecimentos: r.corpo.estabelecimentos || [] }); }); }, [onRota]);
  if (!dados) return null;
  return (
    <section data-campo="gestao-cartoes" className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs">
      <h3 className="text-sm font-bold text-slate-900">Informações de cartões (antiga DIRF)</h3>
      <p className="text-slate-600">{dados.aviso}</p>
      {!dados.estabelecimentos.length && <p className="text-slate-500">Nenhuma informação de cartão guardada para esta empresa.</p>}
      {dados.estabelecimentos.map((e) => {
        const anos = new Map<string, { r: number; ir: number; n: number }>();
        for (const m of e.movimentos || []) { const a = String(m.referencia).slice(0, 4); const x = anos.get(a) || { r: 0, ir: 0, n: 0 }; x.r += m.rendimentoCentavos; x.ir += m.irCentavos; x.n++; anos.set(a, x); }
        return (
          <details key={e.id} className="rounded border border-slate-200 p-2">
            <summary className="cursor-pointer min-h-[40px] flex items-center font-bold">{e.operadora} · estabelecimento {e.codigoEstabelecimento}{e.inativo ? " (inativo)" : ""}</summary>
            <p className="text-slate-600">{[e.banco && `banco ${e.banco}`, e.agencia && `agência ${e.agencia}`, e.conta && `conta ${e.conta}`].filter(Boolean).join(" · ") || "sem banco informado"}</p>
            <ul>{[...anos.entries()].map(([a, x]) => <li key={a}>{a}: {x.n} mês(es) · rendimento {moedaContabil(x.r)} · IR {moedaContabil(x.ir)}</li>)}</ul>
            <details className="text-[11px]"><summary className="cursor-pointer">Ver mês a mês</summary>
              <table className="w-full text-left"><thead><tr><th>Mês</th><th>Fonte</th><th>Rendimento</th><th>IR</th></tr></thead>
                <tbody>{(e.movimentos || []).map((m: any, i: number) => <tr key={i}><td>{String(m.referencia).slice(5, 7)}/{String(m.referencia).slice(0, 4)}</td><td className="max-w-[10rem] truncate">{m.beneficiarioNome || m.beneficiarioDocumento || ""}</td><td>{moedaContabil(m.rendimentoCentavos)}</td><td>{moedaContabil(m.irCentavos)}</td></tr>)}</tbody></table>
            </details>
          </details>
        );
      })}
    </section>
  );
};
