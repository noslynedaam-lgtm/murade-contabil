import type { RotaEscrituracao } from "../types";
// Históricos padrão e lançamentos padrão (recorrentes) da empresa — opção manual ao lado do Robô dos Lançamentos Padrão
// e das ferramentas de voz da Agente. Grava pelo servidor (mesmas rotas da Agente). Fica recolhido para economizar tela no celular.
import React, { useMemo, useState } from "react";
import type { ContaPlano, HistoricoPadrao, LancamentoPadrao } from "../types";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { textoParaCentavos } from "../utils/escrituracaoAvancada";
import { moedaContabil } from "../utils/livrosContabeis";

type Rota = RotaEscrituracao;
interface Props { contas: ContaPlano[]; historicosPadrao: HistoricoPadrao[]; lancamentosPadrao: LancamentoPadrao[]; onRota: Rota; podeGravar: boolean }

const mesAtual = () => new Date().toISOString().slice(0, 7);

export const PadroesLancamentoPainel: React.FC<Props> = ({ contas, historicosPadrao, lancamentosPadrao, onRota, podeGravar }) => {
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const analiticas = useMemo(() => contas.filter((c) => c.tipo === "analitica").sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })), [contas]);
  const nomeConta = (c: string) => contas.find((x) => x.codigo === c)?.descricao || "conta não encontrada";
  const [cod, setCod] = useState(""); const [txt, setTxt] = useState("");
  const [nome, setNome] = useState(""); const [dia, setDia] = useState("10"); const [forma, setForma] = useState<"1xN" | "Nx1">("1xN");
  const [unica, setUnica] = useState(""); const [hist, setHist] = useState(""); const [inicio, setInicio] = useState(mesAtual()); const [fim, setFim] = useState("");
  const [linhas, setLinhas] = useState<Array<{ conta: string; valor: string }>>([{ conta: "", valor: "" }]);
  const [compPreparar, setCompPreparar] = useState(mesAtual());
  const [erro, setErro] = useState("");

  const somaCentavos = linhas.reduce((t, l) => t + (textoParaCentavos(l.valor) || 0), 0);
  const gravarHistorico = async () => {
    setErro("");
    if (!cod.trim() || !txt.trim()) { setErro("Informe o código e o texto do histórico."); return; }
    const r = await onRota("POST", "historicos-padrao", { codigo: cod, texto: txt });
    if (r.ok) { setCod(""); setTxt(""); }
  };
  const tirarHistorico = async (h: HistoricoPadrao) => {
    if (!await pedir({ titulo: "Remover este histórico padrão?", oQue: `o histórico padrão ${h.codigo} ("${h.texto}")`, consequencias: ["Só este histórico sai da lista.", "Os lançamentos que já usaram o texto não mudam."], rotuloFinal: "Sim, remover" })) return;
    await onRota("DELETE", `historicos-padrao/${encodeURIComponent(h.id)}`);
  };
  const [ehModelo, setEhModelo] = useState(false);
  const gravarPadrao = async () => {
    setErro("");
    const partidas = linhas.map((l) => ({ conta: l.conta, valorCentavos: ehModelo && !l.valor.trim() ? 0 : textoParaCentavos(l.valor) }));
    if (!nome.trim() || !unica || !hist.trim() || partidas.some((p) => !p.conta || p.valorCentavos === null || (!ehModelo && !p.valorCentavos) || (p.valorCentavos || 0) < 0)) { setErro(ehModelo ? "Preencha nome, contas e histórico (o valor do modelo pode ficar em branco)." : "Preencha nome, conta, histórico e o valor de cada partida (ex.: 1.500,00)."); return; }
    const r = await onRota("POST", "lancamentos-padrao", { nome, dia: Number(dia), forma, contaUnica: unica, historico: hist, inicio, fim: fim || undefined, partidas, ...(ehModelo ? { uso: "modelo" } : {}) });
    if (r.ok) { setNome(""); setHist(""); setUnica(""); setLinhas([{ conta: "", valor: "" }]); setFim(""); }
  };
  const tirarPadrao = async (p: LancamentoPadrao) => {
    if (!await pedir({ titulo: "Remover este lançamento padrão?", oQue: `o lançamento padrão "${p.nome}"`, consequencias: ["O robô deixa de preparar este lançamento nos próximos meses.", "Os pré-lançamentos já preparados ou aprovados continuam como estão.", "Para só parar por um tempo, use Pausar."], rotuloFinal: "Sim, remover" })) return;
    await onRota("DELETE", `lancamentos-padrao/${encodeURIComponent(p.id)}`);
  };

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
      <summary className="cursor-pointer font-bold text-slate-800">Históricos padrão e lançamentos padrão (recorrentes) — {historicosPadrao.length} histórico(s), {lancamentosPadrao.filter((p) => p.ativo).length} lançamento(s) padrão ativo(s)</summary>
      {erro && <p role="alert" className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 font-semibold text-rose-800">{erro}</p>}

      <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="font-bold text-slate-900">Históricos padrão</h4>
        <p className="mt-1 text-slate-600">Textos prontos para escolher no lançamento. Use {"{mes}"} para o mês/ano da data (ex.: "Aluguel de {"{mes}"}").</p>
        <ul className="mt-2 space-y-1">{historicosPadrao.map((h) => <li key={h.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1"><span><strong className="font-mono">{h.codigo}</strong> — {h.texto}{h.exigeComplemento && <span className="ml-1 text-[10px] text-slate-500">(pede complemento)</span>}</span><button type="button" disabled={!podeGravar} onClick={() => void tirarHistorico(h)} className="rounded border border-rose-200 px-2 py-0.5 font-bold text-rose-800 disabled:opacity-40">Remover</button></li>)}
          {!historicosPadrao.length && <li className="text-slate-500">Nenhum histórico padrão cadastrado.</li>}</ul>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Código<input data-campo="historico-padrao-codigo" value={cod} onChange={(e) => setCod(e.target.value.toUpperCase())} maxLength={12} className="w-24 rounded border px-2 py-1 font-mono" /></label>
          <label className="grid flex-1 gap-1">Texto<input data-campo="historico-padrao-texto" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={240} className="min-w-[180px] rounded border px-2 py-1" /></label>
          <button type="button" disabled={!podeGravar} onClick={() => void gravarHistorico()} className="rounded bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Cadastrar histórico</button>
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="font-bold text-slate-900">Lançamentos padrão (aluguel, honorários…)</h4>
        <p className="mt-1 text-slate-600">O Robô dos Lançamentos Padrão prepara todo mês, como pré-lançamento para aprovação. Nada entra nos livros sem o seu "Aprovar".</p>
        <ul className="mt-2 space-y-1">{lancamentosPadrao.map((p) => {
          const total = p.partidas.reduce((t, x) => t + x.valorCentavos, 0);
          return <li key={p.id} className="flex flex-col gap-1 border-b border-slate-100 py-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{p.uso === "modelo" && <span className="mr-1 rounded bg-sky-100 px-1.5 font-bold text-sky-900">modelo{p.codigo ? ` ${p.codigo}` : ""}</span>}<strong>{p.nome}</strong> · {p.uso === "modelo" ? "lançamento manual" : `dia ${p.dia}`} · {moedaContabil(total)} · {p.forma === "1xN" ? `D ${p.contaUnica}` : `C ${p.contaUnica}`}{p.uso === "modelo" ? "" : ` · desde ${p.inicio.split("-").reverse().join("/")}${p.fim ? ` até ${p.fim.split("-").reverse().join("/")}` : ""}`} {p.uso === "modelo" ? null : p.ativo ? <span className="rounded bg-emerald-100 px-1.5 font-bold text-emerald-900">ativo</span> : <span className="rounded bg-slate-200 px-1.5 font-bold text-slate-700">pausado</span>}</span>
            <span className="flex gap-1">{p.uso !== "modelo" && <button type="button" disabled={!podeGravar} onClick={() => void onRota("POST", `lancamentos-padrao/${encodeURIComponent(p.id)}/ativo`, { ativo: !p.ativo })} className="rounded border px-2 py-0.5 font-bold disabled:opacity-40">{p.ativo ? "Pausar" : "Ligar"}</button>}<button type="button" disabled={!podeGravar} onClick={() => void tirarPadrao(p)} className="rounded border border-rose-200 px-2 py-0.5 font-bold text-rose-800 disabled:opacity-40">Remover</button></span>
          </li>;
        })}{!lancamentosPadrao.length && <li className="text-slate-500">Nenhum lançamento padrão cadastrado.</li>}</ul>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-300 p-2">
          <label className="grid gap-1">Competência<input type="month" value={compPreparar} onChange={(e) => setCompPreparar(e.target.value)} className="rounded border px-2 py-1" /></label>
          <button type="button" disabled={!podeGravar || !lancamentosPadrao.some((p) => p.ativo)} onClick={() => void onRota("POST", "lancamentos-padrao/preparar", { competencia: compPreparar })} className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 font-bold text-blue-900 disabled:opacity-40">Preparar agora (sem esperar o robô)</button>
        </div>
        <fieldset className="mt-3 grid gap-2 rounded border border-slate-200 p-2">
          <legend className="px-1 font-bold">Novo lançamento padrão</legend>
          <label className="flex items-center gap-2"><input type="checkbox" data-campo="padrao-modelo" checked={ehModelo} onChange={(e) => setEhModelo(e.target.checked)} /> Modelo para o lançamento manual (botão "Usar modelo"; o robô não prepara e o valor pode ficar em branco)</label>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="grid gap-1 sm:col-span-2">Nome<input data-campo="padrao-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Aluguel da loja" className="rounded border px-2 py-1" /></label>
            <label className="grid gap-1">Dia do mês<input data-campo="padrao-dia" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className="rounded border px-2 py-1" /></label>
            <label className="grid gap-1">Forma<select value={forma} onChange={(e) => setForma(e.target.value as "1xN" | "Nx1")} className="rounded border px-2 py-1"><option value="1xN">1 débito x vários créditos</option><option value="Nx1">vários débitos x 1 crédito</option></select></label>
          </div>
          <label className="grid gap-1">{forma === "1xN" ? "Conta a débito" : "Conta a crédito"}<select value={unica} onChange={(e) => setUnica(e.target.value)} className="rounded border px-2 py-1 font-mono"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}</select></label>
          {linhas.map((l, i) => <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="grid flex-1 gap-1">{forma === "1xN" ? `Crédito ${i + 1}` : `Débito ${i + 1}`}<select value={l.conta} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, conta: e.target.value } : x)))} className="min-w-[180px] rounded border px-2 py-1 font-mono"><option value="">Escolha…</option>{analiticas.filter((c) => c.codigo !== unica).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}</select></label>
            <label className="grid gap-1">Valor (R$)<input inputMode="decimal" value={l.valor} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} placeholder="1.500,00" className="w-28 rounded border px-2 py-1 text-right" /></label>
            {linhas.length > 1 && <button type="button" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} className="rounded border px-2 py-1" aria-label="Tirar esta linha">×</button>}
          </div>)}
          <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => setLinhas([...linhas, { conta: "", valor: "" }])} className="rounded border px-2 py-1 font-bold">+ partida</button><span className="font-bold">Total: {moedaContabil(somaCentavos)}{unica ? ` (${forma === "1xN" ? "débito" : "crédito"} em ${unica} — ${nomeConta(unica)})` : ""}</span></div>
          <label className="grid gap-1">Histórico (aceita {"{mes}"})<input value={hist} onChange={(e) => setHist(e.target.value)} maxLength={240} placeholder="Aluguel de {mes}" className="rounded border px-2 py-1" />
            {historicosPadrao.length > 0 && <select value="" onChange={(e) => { const h = historicosPadrao.find((x) => x.id === e.target.value); if (h) setHist(h.texto); }} className="rounded border px-2 py-1"><option value="">Usar um histórico padrão…</option>{historicosPadrao.map((h) => <option key={h.id} value={h.id}>{h.codigo} — {h.texto}</option>)}</select>}
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">A partir de<input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded border px-2 py-1" /></label>
            <label className="grid gap-1">Até (opcional)<input type="month" value={fim} onChange={(e) => setFim(e.target.value)} className="rounded border px-2 py-1" /></label>
          </div>
          <button type="button" data-campo="padrao-gravar" disabled={!podeGravar} onClick={() => void gravarPadrao()} className="justify-self-end rounded bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-40">Cadastrar lançamento padrão</button>
        </fieldset>
      </section>
      {dialogo}
    </details>
  );
};
