import type { RotaEscrituracao } from "../types";
// Livro Caixa do Simples Nacional e Encerramento do resultado — opções manuais na tela Livros, ao lado dos robôs
// "Robô do Livro Caixa (Simples)" e "Robô do Encerramento do Resultado" e das ferramentas de voz da Agente.
import React, { useMemo, useState } from "react";
import type { ContaPlano, EmpresaDados, LancamentoContabil, LivroContabil } from "../types";
import { gerarLivroCaixa, idLivroCaixa, termosLivroCaixa, ehSimplesNacional } from "../utils/livroCaixa";
import { dataLegivelContabil, gerarWorkbookExcel, moedaContabil } from "../utils/livrosContabeis";
import { calcularEncerramento, contaApuracaoPadrao, ehErro, encerramentoGravadoConfere, encerramentosDoAno } from "../utils/escrituracaoAvancada";
import { naturezasDasContas } from "../services/ecdService";
import { confirmarNaTela } from "../utils/dialogoNaTela";

type Rota = RotaEscrituracao;
const escapar = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mesAno = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob(["﻿", conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const LivroCaixaPainel: React.FC<{ empresa: EmpresaDados; contas: ContaPlano[]; lancamentos: LancamentoContabil[]; livros: LivroContabil[]; competenciaInicial: string; podeGravar: boolean; onRota?: Rota }> = ({ empresa, contas, lancamentos, livros, competenciaInicial, podeGravar, onRota }) => {
  const [de, setDe] = useState(competenciaInicial);
  const [ate, setAte] = useState(competenciaInicial);
  const livro = useMemo(() => gerarLivroCaixa({ contas, lancamentos, codigosCaixa: empresa.contasDisponibilidadesCodigo, de, ate }), [contas, lancamentos, empresa.contasDisponibilidadesCodigo, de, ate]);
  const termos = livro.disponivel ? termosLivroCaixa(empresa, livro) : null;
  const registrados = livro.meses.filter((m) => livros.some((l) => l.id === idLivroCaixa(m.competencia))).length;
  const registrar = async () => { if (onRota && livro.disponivel) await onRota("POST", "livro-caixa/registrar", { de, ate }); };

  const imprimir = () => {
    if (!livro.disponivel || !termos) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const meses = livro.meses.map((m) => `<h2>${mesAno(m.competencia)}</h2><table><thead><tr><th>Data</th><th>Histórico</th><th>Contrapartida</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>
      <tr><td colspan="3"><b>Saldo anterior</b></td><td colspan="2" class="v"><b>${moedaContabil(m.saldoInicialCentavos)}</b></td></tr>
      ${m.linhas.map((l) => `<tr><td>${dataLegivelContabil(l.dataISO)}</td><td>${escapar(l.historico)}<br><small>${escapar(l.referencia)}</small></td><td>${escapar(l.contraparte)}</td><td class="v">${l.entrada ? moedaContabil(l.entrada) : ""}</td><td class="v">${l.saida ? moedaContabil(l.saida) : ""}</td></tr>`).join("")}
      ${m.linhas.length ? "" : `<tr><td colspan="5">Sem movimento no mês.</td></tr>`}
      <tr><td colspan="3"><b>Totais do mês</b></td><td class="v"><b>${moedaContabil(m.entradasCentavos)}</b></td><td class="v"><b>${moedaContabil(m.saidasCentavos)}</b></td></tr>
      <tr><td colspan="3"><b>Saldo final</b></td><td colspan="2" class="v"><b>${moedaContabil(m.saldoFinalCentavos)}</b></td></tr></tbody></table>`).join("");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Livro Caixa ${escapar(empresa.razaoSocial)}</title><style>body{font:12px Arial,sans-serif;margin:24px}h1{font-size:16px}h2{font-size:13px;margin-top:18px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:3px 5px;text-align:left}.v{text-align:right;white-space:nowrap}.termo{border:1px solid #333;padding:10px;margin:12px 0}.ass{margin-top:36px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #333;padding-top:4px}@media print{.quebra{page-break-before:always}}</style></head><body>
      <h1>LIVRO CAIXA — ${escapar(empresa.razaoSocial)} — CNPJ ${escapar(empresa.cnpj)}</h1>
      <div class="termo">${escapar(termos.abertura)}</div>
      <p>Contas de Caixa/Bancos: ${livro.contas.map((c) => `${escapar(c.codigo)} ${escapar(c.descricao)}`).join("; ")}</p>
      ${meses}
      <div class="termo quebra">${escapar(termos.encerramento)}</div>
      <div class="ass">${termos.assinaturas.map((a) => `<div>${escapar(a)}</div>`).join("")}</div>
      <p><small>Gerado pelo Murade Contábil em ${new Date().toLocaleString("pt-BR")} a partir de lançamentos aprovados. Res. CGSN nº 140/2018, art. 63.</small></p>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
    void registrar();
  };
  const excel = () => {
    if (!livro.disponivel || !termos) return;
    const linhas: (string | number)[][] = [
      ["LIVRO CAIXA — SIMPLES NACIONAL (Res. CGSN 140/2018, art. 63)"],
      [empresa.razaoSocial || "", `CNPJ: ${empresa.cnpj}`, `${mesAno(de)} a ${mesAno(ate)}`],
      ["Competência", "Data", "Histórico", "Referência", "Contrapartida", "Entrada (R$)", "Saída (R$)", "Saldo (R$)"],
    ];
    for (const m of livro.meses) {
      let saldo = m.saldoInicialCentavos;
      linhas.push([mesAno(m.competencia), "", "Saldo anterior", "", "", "", "", saldo / 100]);
      for (const l of m.linhas) { saldo += l.entrada - l.saida; linhas.push([mesAno(m.competencia), dataLegivelContabil(l.dataISO), l.historico, l.referencia, l.contraparte, l.entrada / 100, l.saida / 100, saldo / 100]); }
      linhas.push([mesAno(m.competencia), "", "Totais do mês", "", "", m.entradasCentavos / 100, m.saidasCentavos / 100, m.saldoFinalCentavos / 100]);
    }
    linhas.push([termos.abertura], [termos.encerramento], ...termos.assinaturas.map((a) => [a]));
    baixar(`livro-caixa-${String(empresa.cnpj).replace(/\W/g, "")}-${de}-a-${ate}.xls`, gerarWorkbookExcel([{ nome: "Livro Caixa", linhas }]), "application/vnd.ms-excel;charset=utf-8");
    void registrar();
  };

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
        <strong>Livro Caixa do Simples Nacional.</strong> Toda a movimentação financeira e bancária da empresa (Res. CGSN nº 140/2018, art. 63, I), com termos de abertura e de encerramento para o representante legal e o contabilista assinarem (§ 7º). Quem mantém a escrituração contábil (Diário e Razão) está dispensado do Livro Caixa (§ 3º); com aporte de capital, a empresa mantém ECD (§ 4º). Usa as mesmas contas de Caixa/Bancos marcadas na aba "Fluxo de caixa interno".
        {!ehSimplesNacional(empresa.regime) && <span className="mt-1 block font-bold">Esta empresa não está cadastrada no Simples Nacional; o relatório sai mesmo assim, para conferência.</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 font-bold">De<input type="month" data-campo="livro-caixa-de" value={de} onChange={(e) => setDe(e.target.value)} className="rounded border px-2 py-1" /></label>
        <label className="grid gap-1 font-bold">Até<input type="month" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded border px-2 py-1" /></label>
        <button type="button" disabled={!livro.disponivel} onClick={imprimir} className="rounded bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-40">Imprimir / Salvar PDF</button>
        <button type="button" disabled={!livro.disponivel} onClick={excel} className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 font-bold text-emerald-900 disabled:opacity-40">Exportar Excel</button>
        {onRota && <button type="button" disabled={!livro.disponivel || !podeGravar} onClick={() => void registrar()} className="rounded border px-3 py-2 font-bold disabled:opacity-40">Registrar como emitido</button>}
      </div>
      {!livro.disponivel && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">Livro Caixa pendente: {livro.motivo}</p>}
      {livro.disponivel && <>
        <p className="text-slate-600">{registrados} de {livro.meses.length} mês(es) já registrado(s) como emitido(s). Imprimir ou exportar também registra.</p>
        <div className="grid gap-2 sm:grid-cols-4"><div className="rounded border p-2">Saldo inicial<strong className="block">{moedaContabil(livro.saldoInicialCentavos)}</strong></div><div className="rounded border p-2">Entradas<strong className="block text-emerald-700">{moedaContabil(livro.entradasCentavos)}</strong></div><div className="rounded border p-2">Saídas<strong className="block text-rose-700">{moedaContabil(livro.saidasCentavos)}</strong></div><div className="rounded border p-2">Saldo final<strong className="block">{moedaContabil(livro.saldoFinalCentavos)}</strong></div></div>
        {livro.meses.map((m) => <div key={m.competencia} className="overflow-x-auto rounded border">
          <div className="bg-slate-50 px-2 py-1 font-bold">{mesAno(m.competencia)} · saldo anterior {moedaContabil(m.saldoInicialCentavos)} · saldo final {moedaContabil(m.saldoFinalCentavos)}</div>
          <table className="w-full min-w-[620px] text-left"><thead><tr><th className="px-2 py-1">Data</th><th className="px-2 py-1">Histórico</th><th className="px-2 py-1">Contrapartida</th><th className="px-2 py-1 text-right">Entrada</th><th className="px-2 py-1 text-right">Saída</th></tr></thead>
            <tbody>{m.linhas.map((l, i) => <tr key={`${l.referencia}-${i}`} className="border-t"><td className="px-2 py-1">{dataLegivelContabil(l.dataISO)}</td><td className="px-2 py-1">{l.historico}</td><td className="px-2 py-1">{l.contraparte}</td><td className="px-2 py-1 text-right">{l.entrada ? moedaContabil(l.entrada) : "—"}</td><td className="px-2 py-1 text-right">{l.saida ? moedaContabil(l.saida) : "—"}</td></tr>)}
              {!m.linhas.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-slate-500">Sem movimento no mês.</td></tr>}</tbody></table>
        </div>)}
        {termos && <div className="space-y-1 rounded border border-slate-300 bg-white p-2 text-[11px] text-slate-700"><p>{termos.abertura}</p><p>{termos.encerramento}</p></div>}
      </>}
    </div>
  );
};

export const EncerramentoPainel: React.FC<{ contas: ContaPlano[]; lancamentos: LancamentoContabil[]; podeGravar: boolean; onRota?: Rota }> = ({ contas, lancamentos, podeGravar, onRota }) => {
  const [ano, setAno] = useState(new Date().getFullYear() - 1);
  const padrao = useMemo(() => contaApuracaoPadrao(contas)?.codigo || "", [contas]);
  const [destino, setDestino] = useState("");
  const naturezas = useMemo(() => naturezasDasContas(contas), [contas]);
  const contasPL = contas.filter((c) => c.tipo === "analitica" && naturezas.get(c.codigo) === "03");
  const contaDestino = destino || padrao;
  const calc = useMemo(() => calcularEncerramento({ contas, lancamentos, ano, contaDestino, naturezaEcd: naturezas }), [contas, lancamentos, ano, contaDestino, naturezas]);
  const ex = useMemo(() => encerramentosDoAno(lancamentos, ano), [lancamentos, ano]);
  const confere = !ehErro(calc) && ex.ativos.length > 0 && encerramentoGravadoConfere(calc, ex.ativos);
  const preparar = async () => {
    if (!onRota || ehErro(calc)) return;
    if (!await confirmarNaTela(`Preparar o encerramento de ${ano}: ${calc.partidas.length} conta(s) de resultado zeradas em 31/12/${ano} contra ${contaDestino} (${calc.resultadoCentavos >= 0 ? "lucro" : "prejuízo"} de ${moedaContabil(Math.abs(calc.resultadoCentavos))})? Fica pendente de aprovação.`)) return;
    await onRota("POST", "encerramento", { ano, contaDestino });
  };
  const estornar = async () => {
    const lote = ex.ativos[0]?.[0]?.loteId;
    if (!onRota || !lote) return;
    if (!await confirmarNaTela(`Estornar o encerramento de ${ano}? As partidas vão invertidas em 31/12/${ano}, pendentes de aprovação; o encerramento original continua no histórico.`)) return;
    await onRota("POST", `lotes/${encodeURIComponent(lote)}/estornar`, {});
  };
  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950"><strong>Encerramento do resultado gravado no sistema.</strong> Zera as contas de resultado do ano contra a conta de Lucros ou Prejuízos Acumulados (ou de Apuração do Resultado), em 31/12, como lançamento pendente de aprovação. Depois de aprovado, o balancete mostra o resultado já no Patrimônio Líquido; a DRE continua mostrando receitas e despesas. A ECD usa este encerramento (confere com os saldos e não duplica o lançamento tipo E). Pode ser estornado.</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 font-bold">Ano<input type="number" data-campo="encerramento-ano" min={2000} max={2100} value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-24 rounded border px-2 py-1" /></label>
        <label className="grid gap-1 font-bold">Conta que recebe o resultado<select value={contaDestino} onChange={(e) => setDestino(e.target.value)} className="max-w-[300px] rounded border px-2 py-1 font-mono"><option value="">Escolha…</option>{contasPL.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}</select></label>
        {onRota && <button type="button" disabled={!podeGravar || ehErro(calc) || ex.ativos.length > 0 || ex.pendentes.length > 0} onClick={() => void preparar()} className="rounded bg-blue-700 px-3 py-2 font-bold text-white disabled:opacity-40">Preparar encerramento</button>}
        {onRota && ex.ativos.length > 0 && <button type="button" disabled={!podeGravar} onClick={() => void estornar()} className="rounded border border-amber-400 bg-amber-50 px-3 py-2 font-bold text-amber-950 disabled:opacity-40">Estornar encerramento</button>}
      </div>
      {ex.pendentes.length > 0 && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">O encerramento de {ano} está preparado e aguarda aprovação (tela Aprovar lançamentos).</p>}
      {ex.ativos.length > 0 && <p className={`rounded border p-2 ${confere ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-rose-300 bg-rose-50 text-rose-950"}`}>{confere ? `Resultado de ${ano} encerrado e conferido com os saldos.` : `O encerramento gravado de ${ano} não bate mais com as contas de resultado (houve lançamento depois dele). Estorne e prepare de novo.`}</p>}
      {ehErro(calc) ? <p className="rounded border border-slate-300 bg-slate-50 p-2">{calc.erro}</p> : <div className="overflow-x-auto rounded border">
        <div className="bg-slate-50 px-2 py-1 font-bold">{calc.resultadoCentavos >= 0 ? "Lucro" : "Prejuízo"} de {ano}: {moedaContabil(Math.abs(calc.resultadoCentavos))} → {calc.destino.codigo} {calc.destino.descricao}</div>
        <table className="w-full min-w-[480px] text-left"><thead><tr><th className="px-2 py-1">Conta de resultado</th><th className="px-2 py-1 text-right">Saldo no ano</th><th className="px-2 py-1">Encerramento</th></tr></thead>
          <tbody>{calc.partidas.map((p) => <tr key={p.conta.codigo} className="border-t"><td className="px-2 py-1">{p.conta.codigo} — {p.conta.descricao}</td><td className="px-2 py-1 text-right">{moedaContabil(Math.abs(p.saldoCentavos))} {p.saldoCentavos > 0 ? "D" : "C"}</td><td className="px-2 py-1">{p.saldoCentavos < 0 ? `D ${p.conta.codigo} / C ${calc.destino.codigo}` : `D ${calc.destino.codigo} / C ${p.conta.codigo}`}</td></tr>)}</tbody></table>
      </div>}
    </div>
  );
};
