import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Download, FileSpreadsheet, Printer } from "lucide-react";
import { ContaPlano, EmpresaDados, LancamentoContabil, LivroContabil, PreLancamentoContabil } from "../../types";
import {
  dataLegivelContabil,
  gerarRelatoriosContabeis,
  gerarWorkbookExcel,
  moedaContabil,
  PeriodoContabil,
} from "../../utils/livrosContabeis";

interface LivrosTabProps {
  empresa: EmpresaDados;
  workspaceCarregado: boolean;
  workspacePersistido: boolean;
  lancamentos: LancamentoContabil[];
  contas: ContaPlano[];
  preLancamentos: PreLancamentoContabil[];
  livros: LivroContabil[];
  onTransmitirTodos: () => void;
  isTransmitting: boolean;
}

type LivroVisivel = "diario" | "razao" | "balancete";

function competenciaInicial(valor: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(valor || "")) return valor;
  const br = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(valor || "");
  return br ? `${br[2]}-${br[1]}` : "todos";
}

function baixarArquivo(nome: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob(["\uFEFF", conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dinheiroExcel(centavos: number): number {
  return centavos / 100;
}

export const LivrosTab: React.FC<LivrosTabProps> = ({
  empresa,
  workspaceCarregado,
  workspacePersistido,
  lancamentos,
  contas,
  preLancamentos,
  livros,
  onTransmitirTodos,
  isTransmitting,
}) => {
  const [periodo, setPeriodo] = useState<PeriodoContabil>(() => competenciaInicial(empresa.competencia));
  const [livroVisivel, setLivroVisivel] = useState<LivroVisivel>("diario");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => setPeriodo(competenciaInicial(empresa.competencia)), [empresa.cnpj, empresa.competencia]);

  const relatorios = useMemo(
    () => gerarRelatoriosContabeis(contas, workspaceCarregado ? lancamentos : [], periodo),
    [contas, lancamentos, periodo, workspaceCarregado],
  );
  const pendentes = preLancamentos.filter((item) => item.status === "pendente_conferencia").length;
  const temSaldoInicial = contas.some((conta) => Number.isFinite(Number(conta.saldoInicial)) && Number(conta.saldoInicial) !== 0);
  const temDados = relatorios.doPeriodo.length > 0 || temSaldoInicial || relatorios.razao.length > 0;
  const exportacaoLiberada = workspaceCarregado && workspacePersistido && Boolean(empresa.cnpj) && temDados && relatorios.invalidos.length === 0;
  const periodoDescricao = periodo === "todos" ? "Todos os períodos" : `Competência ${periodo.split("-").reverse().join("/")}`;
  const competenciaEmpresa = competenciaInicial(empresa.competencia);
  const competenciasDisponiveis = Array.from(new Set<string>(relatorios.validos.map((item) => item.dataISO.slice(0, 7))));
  if (competenciaEmpresa !== "todos" && !competenciasDisponiveis.includes(competenciaEmpresa)) competenciasDisponiveis.push(competenciaEmpresa);
  competenciasDisponiveis.sort((a, b) => b.localeCompare(a));

  const exportarExcel = () => {
    if (!workspaceCarregado || !workspacePersistido || !empresa.cnpj) {
      setAviso("Aguarde a confirmação de gravação no PostgreSQL deste CNPJ antes de exportar os livros definitivos.");
      return;
    }
    if (!temDados || relatorios.invalidos.length) {
      setAviso(relatorios.invalidos.length
        ? `Exportação bloqueada: ${relatorios.invalidos.length} lançamento(s) definitivo(s) têm dados inválidos. Corrija a data, o histórico, o valor ou as contas antes de gerar os livros.`
        : "Não há lançamentos definitivos nem saldos iniciais para exportar neste período.");
      return;
    }

    const linhasDiario: (string | number)[][] = [
      ["LIVRO DIÁRIO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Data", "Documento / referência", "Histórico", "Conta débito", "Descrição débito", "Conta crédito", "Descrição crédito", "Valor (R$)", "Origem"],
      ...relatorios.doPeriodo.map((item) => [
        dataLegivelContabil(item.dataISO),
        String(item.original.documentoRef || item.original.id),
        item.original.historico,
        item.debito.codigo,
        item.debito.descricao,
        item.credito.codigo,
        item.credito.descricao,
        dinheiroExcel(item.valorCentavos),
        item.original.origem,
      ]),
    ];

    const linhasRazao: (string | number)[][] = [
      ["LIVRO RAZÃO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Conta", "Descrição", "Data", "Documento / referência", "Histórico", "Conta contrapartida", "Descrição contrapartida", "Débito (R$)", "Crédito (R$)", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...relatorios.razao.map((item) => [
        item.conta.codigo,
        item.conta.descricao,
        dataLegivelContabil(item.dataISO),
        item.referencia,
        item.historico,
        item.contraPartidaCodigo,
        item.contraPartidaNome,
        dinheiroExcel(item.debitoCentavos),
        dinheiroExcel(item.creditoCentavos),
        dinheiroExcel(item.saldoDevedorCentavos),
        dinheiroExcel(item.saldoCredorCentavos),
      ]),
    ];

    const linhasBalancete: (string | number)[][] = [
      ["BALANCETE DE VERIFICAÇÃO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Conta", "Descrição", "Tipo", "Movimento débito (R$)", "Movimento crédito (R$)", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...relatorios.balancete
        .filter((item) => item.conta.tipo === "analitica" && (item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos))
        .map((item) => [
          item.conta.codigo,
          item.conta.descricao,
          item.conta.tipo,
          dinheiroExcel(item.debitoPeriodoCentavos),
          dinheiroExcel(item.creditoPeriodoCentavos),
          dinheiroExcel(item.saldoDevedorCentavos),
          dinheiroExcel(item.saldoCredorCentavos),
        ]),
      ["Totais", "", "", dinheiroExcel(relatorios.totalDebitosCentavos), dinheiroExcel(relatorios.totalCreditosCentavos), dinheiroExcel(relatorios.totalSaldoDevedorCentavos), dinheiroExcel(relatorios.totalSaldoCredorCentavos)],
    ];

    const workbook = gerarWorkbookExcel([
      { nome: "Diário", linhas: linhasDiario },
      { nome: "Razão", linhas: linhasRazao },
      { nome: "Balancete", linhas: linhasBalancete },
    ]);
    baixarArquivo(`livros-contabeis-${empresa.cnpj.replace(/\D/g, "")}-${periodo === "todos" ? "todos-periodos" : periodo}.xls`, workbook, "application/vnd.ms-excel;charset=utf-8");
    setAviso("Arquivo Excel com três abas baixado: Diário, Razão e Balancete. Contém apenas lançamentos definitivos deste CNPJ; não é livro assinado nem obrigação transmitida.");
  };

  const imprimirPdf = () => {
    if (!workspaceCarregado || !workspacePersistido || !empresa.cnpj) {
      setAviso("Aguarde a confirmação de gravação no PostgreSQL deste CNPJ antes de imprimir os livros definitivos.");
      return;
    }
    if (!temDados || relatorios.invalidos.length) {
      setAviso(relatorios.invalidos.length
        ? `Impressão bloqueada: corrija ${relatorios.invalidos.length} lançamento(s) definitivo(s) inválido(s) antes de gerar os livros.`
        : "Não há lançamentos definitivos nem saldos iniciais para imprimir neste período.");
      return;
    }
    window.print();
  };

  const linhaRazao = (item: typeof relatorios.razao[number], indice: number, imprimir = false) => (
    <tr key={`${item.conta.codigo}-${item.dataISO}-${item.referencia}-${indice}`} className="border-t border-slate-100">
      <td className="px-2 py-2 whitespace-nowrap">{dataLegivelContabil(item.dataISO)}</td>
      <td className="px-2 py-2 font-mono">{item.conta.codigo}</td>
      <td className="px-2 py-2">{item.historico}{item.referencia ? <span className="block text-[10px] text-slate-500">{item.referencia} · {item.origem}</span> : null}</td>
      <td className="px-2 py-2">{item.contraPartidaCodigo ? `${item.contraPartidaCodigo} — ${item.contraPartidaNome}` : "—"}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.debitoCentavos)}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.creditoCentavos)}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.saldoDevedorCentavos || item.saldoCredorCentavos)} {item.saldoDevedorCentavos ? "D" : item.saldoCredorCentavos ? "C" : "—"}</td>
      {imprimir && <td className="px-2 py-2">{item.referencia || "Saldo anterior"}</td>}
    </tr>
  );

  const balanceteVisivel = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    ? item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos
    : item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen className="h-5 w-5 text-blue-700" /> Livros contábeis da empresa</h2>
          <p className="mt-1 text-xs text-slate-600">Diário, Razão e Balancete são montados a partir dos lançamentos definitivos persistidos no espaço deste CNPJ. Pré-lançamentos pendentes não entram nos livros.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={imprimirPdf} disabled={!exportacaoLiberada} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimir / Salvar PDF</button>
          <button type="button" onClick={exportarExcel} disabled={!exportacaoLiberada} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-bold text-slate-700">Competência
          <select value={periodo} onChange={(evento) => setPeriodo(evento.target.value as PeriodoContabil)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-medium">
            <option value="todos">Todos os períodos</option>
            {competenciasDisponiveis.map((item) => <option key={item} value={item}>{item.split("-").reverse().join("/")}</option>)}
          </select>
        </label>
        <div className="text-right text-xs text-slate-600">
          <div><strong>{empresa.razaoSocial || "Empresa sem razão social"}</strong> · CNPJ {empresa.cnpj || "não informado"}</div>
          <div>{relatorios.doPeriodo.length} lançamento(s) definitivo(s) neste período</div>
        </div>
      </div>

      {!workspaceCarregado && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Carregando os dados persistidos da empresa. A exportação fica bloqueada até confirmar a leitura do banco.</div>}
      {workspaceCarregado && !workspacePersistido && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Há alterações aguardando confirmação do PostgreSQL. Os relatórios podem ser conferidos na tela, mas a exportação só será liberada depois que a gravação permanente for confirmada.</div>}
      {pendentes > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>{pendentes} pré-lançamento(s) aguardam conferência.</strong> Eles não aparecem no Diário, Razão nem Balancete até que o contador os confira e confirme a contabilização na aba Revisão Fiscal e DP.</p></div>}
      {relatorios.invalidos.length > 0 && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"><strong>Há {relatorios.invalidos.length} lançamento(s) definitivo(s) com inconsistência.</strong> Eles não foram incluídos nos relatórios, e as exportações estão bloqueadas para evitar livros incompletos. Confira data, histórico, valor e contas analíticas.</div>}
      {aviso && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{aviso}</p>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Livros contábeis">
        {([ ["diario", "Livro Diário"], ["razao", "Livro Razão"], ["balancete", "Balancete"] ] as const).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={livroVisivel === id} onClick={() => setLivroVisivel(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${livroVisivel === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{nome}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {livroVisivel === "diario" && <table className="min-w-[900px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Documento / histórico</th><th className="px-3 py-2">Conta débito</th><th className="px-3 py-2">Conta crédito</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Origem</th></tr></thead>
          <tbody>{relatorios.doPeriodo.map((item) => <tr key={item.original.id} className="border-t border-slate-100"><td className="px-3 py-2 whitespace-nowrap">{dataLegivelContabil(item.dataISO)}</td><td className="px-3 py-2"><strong>{item.original.documentoRef || item.original.id}</strong><span className="block">{item.original.historico}</span></td><td className="px-3 py-2">{item.debito.codigo} — {item.debito.descricao}</td><td className="px-3 py-2">{item.credito.codigo} — {item.credito.descricao}</td><td className="px-3 py-2 text-right">{moedaContabil(item.valorCentavos)}</td><td className="px-3 py-2">{item.original.origem}</td></tr>)}
          {relatorios.doPeriodo.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum lançamento definitivo para esta competência. Rascunhos aguardando revisão ficam fora do Diário.</td></tr>}</tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold"><tr><td colSpan={4} className="px-3 py-2">Total dos lançamentos em partidas dobradas</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="px-3 py-2">Débitos e créditos equilibrados</td></tr></tfoot>
        </table>}

        {livroVisivel === "razao" && <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-2 py-2">Data</th><th className="px-2 py-2">Conta</th><th className="px-2 py-2">Histórico</th><th className="px-2 py-2">Contrapartida</th><th className="px-2 py-2 text-right">Débito</th><th className="px-2 py-2 text-right">Crédito</th><th className="px-2 py-2 text-right">Saldo</th></tr></thead>
          <tbody>{relatorios.razao.map((item, indice) => linhaRazao(item, indice))}
          {relatorios.razao.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhuma movimentação ou saldo inicial informado.</td></tr>}</tbody>
        </table>}

        {livroVisivel === "balancete" && <table className="min-w-[760px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Mov. débito</th><th className="px-3 py-2 text-right">Mov. crédito</th><th className="px-3 py-2 text-right">Saldo devedor</th><th className="px-3 py-2 text-right">Saldo credor</th></tr></thead>
          <tbody>{balanceteVisivel.map((item) => <tr key={item.conta.codigo} className={`border-t border-slate-100 ${item.conta.tipo === "sintetica" ? "font-semibold bg-slate-50" : ""}`}><td className="px-3 py-2 font-mono">{item.conta.codigo}</td><td className="px-3 py-2" style={{ paddingLeft: `${12 + (item.conta.nivel - 1) * 16}px` }}>{item.conta.descricao || "Nome não informado"}</td><td className="px-3 py-2 text-right">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.creditoPeriodoCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}
          {balanceteVisivel.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum movimento nem saldo inicial informado.</td></tr>}</tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold"><tr><td colSpan={2} className="px-3 py-2">Totais das contas analíticas</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalCreditosCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalSaldoDevedorCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalSaldoCredorCentavos)}</td></tr></tfoot>
        </table>}
      </div>

      <p className="text-[11px] text-slate-600">Relatórios internos do Contábil, gerados com lançamentos definitivos e plano de contas desta empresa. Não são livros autenticados, demonstrações assinadas ou arquivos ECD/ECF transmitidos.</p>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        <h3 className="font-bold">Assinatura e transmissão</h3>
        <p className="mt-1">A exportação ou impressão não autentica os livros nem transmite obrigações. A disponibilidade oficial de envio depende de integração, certificado, procuração, validação contábil e leiautes oficiais configurados.</p>
        <button type="button" onClick={onTransmitirTodos} disabled={isTransmitting} className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:opacity-50">{isTransmitting ? "Verificando configuração…" : "Verificar disponibilidade de transmissão"}</button>
      </section>

      {livros.length > 0 && <section className="rounded-lg border border-slate-200 p-3 text-xs text-slate-700"><h3 className="font-bold">Outras obrigações cadastradas</h3><ul className="mt-2 space-y-1">{livros.map((livro) => <li key={livro.id}>{livro.titulo} · {livro.competencia} · situação local: {livro.status}</li>)}</ul></section>}

      <div id="contabil-books-print" className="hidden">
        <div className="contabil-print-heading"><h1>Livros contábeis — relatório interno</h1><strong>{empresa.razaoSocial || "Empresa não informada"}</strong><div>CNPJ: {empresa.cnpj || "Não informado"} · {periodoDescricao}</div><div>Gerado em {new Date().toLocaleString("pt-BR")}</div></div>
        <section className="contabil-print-page"><h2>Livro Diário</h2><table><thead><tr><th>Data</th><th>Documento / histórico</th><th>Conta débito</th><th>Conta crédito</th><th>Valor</th><th>Origem</th></tr></thead><tbody>{relatorios.doPeriodo.map((item) => <tr key={`pdf-diario-${item.original.id}`}><td>{dataLegivelContabil(item.dataISO)}</td><td>{item.original.documentoRef || item.original.id}<br />{item.original.historico}</td><td>{item.debito.codigo} — {item.debito.descricao}</td><td>{item.credito.codigo} — {item.credito.descricao}</td><td className="valor">{moedaContabil(item.valorCentavos)}</td><td>{item.original.origem}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Total</td><td className="valor">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td /></tr></tfoot></table></section>
        <section className="contabil-print-page"><h2>Livro Razão</h2><table><thead><tr><th>Data</th><th>Conta</th><th>Histórico</th><th>Contrapartida</th><th>Débito</th><th>Crédito</th><th>Saldo</th></tr></thead><tbody>{relatorios.razao.map((item, indice) => <tr key={`pdf-razao-${item.conta.codigo}-${item.dataISO}-${item.referencia}-${indice}`}><td>{dataLegivelContabil(item.dataISO)}</td><td>{item.conta.codigo}</td><td>{item.historico}<br />{item.referencia}</td><td>{item.contraPartidaCodigo} {item.contraPartidaNome}</td><td className="valor">{moedaContabil(item.debitoCentavos)}</td><td className="valor">{moedaContabil(item.creditoCentavos)}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos || item.saldoCredorCentavos)} {item.saldoDevedorCentavos ? "D" : item.saldoCredorCentavos ? "C" : ""}</td></tr>)}</tbody></table></section>
        <section className="contabil-print-page"><h2>Balancete de Verificação</h2><table><thead><tr><th>Conta</th><th>Descrição</th><th>Mov. débito</th><th>Mov. crédito</th><th>Saldo devedor</th><th>Saldo credor</th></tr></thead><tbody>{balanceteVisivel.map((item) => <tr key={`pdf-balancete-${item.conta.codigo}`}><td>{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="valor">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="valor">{moedaContabil(item.creditoPeriodoCentavos)}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="valor">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Totais das contas analíticas</td><td className="valor">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalCreditosCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalSaldoDevedorCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalSaldoCredorCentavos)}</td></tr></tfoot></table></section>
        <p className="contabil-print-disclaimer">Relatório interno. Não é livro autenticado, demonstração assinada nem obrigação transmitida.</p>
      </div>
    </section>
  );
};
