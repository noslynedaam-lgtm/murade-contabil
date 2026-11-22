import type { RotaEscrituracao } from "../../types";
import { confirmarNaTela } from "../../utils/dialogoNaTela";
import React, { useState, useMemo } from "react";
import { LancamentoContabil, ContaPlano, HistoricoPadrao, LancamentoPadrao } from "../../types";
import { PadroesLancamentoPainel } from "../PadroesLancamentoPainel";
import { aplicarHistoricoPadrao, textoParaCentavos } from "../../utils/escrituracaoAvancada";
import { moedaContabil } from "../../utils/livrosContabeis";
import { revisarLancamento, revisarMultipartida } from "../../utils/revisorContabil";
import { useRevisor } from "../RevisorPainel";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Download,
  Sparkles,
  Filter,
  FileSpreadsheet,
  RotateCcw,
  ListTree,
  Hash,
  ArrowRightLeft,
} from "lucide-react";
import { ordenarContasPorSequenciaNumerica } from "../../utils/planoContasUtils";
import { normalizarDataContabil } from "../../utils/livrosContabeis";

interface LancamentosTabProps {
  lancamentos: LancamentoContabil[];
  contas?: ContaPlano[];
  centrosCusto?: Array<{ codigo: string; nome: string }>;
  onImportarFiscal: () => void;
  onImportarDP: () => void;
  onGerarTudo: () => void;
  onAdicionarLancamento: (lanc: LancamentoContabil) => void;
  onEstornarLancamento: (id: string) => void;
  workspacePersistido: boolean;
  onDecidirLancamentoManual: (id: string, decisao: "aprovar" | "rejeitar", motivo?: string) => Promise<boolean>;
  historicosPadrao?: HistoricoPadrao[];
  lancamentosPadrao?: LancamentoPadrao[];
  onRota?: RotaEscrituracao;
  /** Competências fechadas da empresa (o Revisor não deixa gravar nelas). */
  competenciasFechadas?: string[];
  /** CNPJ da empresa ativa (para o registro do "gravar mesmo assim" do Revisor). */
  cnpj?: string;
}

export const LancamentosTab: React.FC<LancamentosTabProps> = ({
  lancamentos,
  contas = [],
  centrosCusto = [],
  onImportarFiscal,
  onImportarDP,
  onGerarTudo,
  onAdicionarLancamento,
  onEstornarLancamento,
  workspacePersistido,
  onDecidirLancamentoManual,
  historicosPadrao = [],
  lancamentosPadrao = [],
  onRota,
  competenciasFechadas = [],
  cnpj = "",
}) => {
  const [modalNovo, setModalNovo] = useState(false);
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todos");

  // Contas analíticas ordenadas em estrita sequência numérica
  const contasAnaliticas = useMemo(() => {
    const analiticas = contas.filter((c) => c.tipo === "analitica");
    return ordenarContasPorSequenciaNumerica(analiticas);
  }, [contas]);

  // Form novo lançamento manual
  const [dataLan, setDataLan] = useState("");
  const [debitoCod, setDebitoCod] = useState("");
  const [debitoNome, setDebitoNome] = useState("");
  const [creditoCod, setCreditoCod] = useState("");
  const [creditoNome, setCreditoNome] = useState("");
  const [valorLan, setValorLan] = useState("");
  const [histLan, setHistLan] = useState("");
  const [centroLan, setCentroLan] = useState("");
  const [erroNovo, setErroNovo] = useState("");
  // Lançamento com várias partidas: 1 débito x N créditos ou N débitos x 1 crédito (o total tem que fechar).
  const [formaLan, setFormaLan] = useState<"simples" | "1xN" | "Nx1">("simples");
  const [contaUnica, setContaUnica] = useState("");
  const [linhasLan, setLinhasLan] = useState<Array<{ conta: string; valor: string }>>([{ conta: "", valor: "" }, { conta: "", valor: "" }]);
  const limparRascunhoManual = () => {
    setDataLan(""); setDebitoCod(""); setDebitoNome(""); setCreditoCod(""); setCreditoNome(""); setValorLan(""); setHistLan(""); setCentroLan(""); setErroNovo("");
    setFormaLan("simples"); setContaUnica(""); setLinhasLan([{ conta: "", valor: "" }, { conta: "", valor: "" }]);
  };
  const somaLinhasCentavos = linhasLan.reduce((t, l) => t + (textoParaCentavos(l.valor) || 0), 0);
  const totalInformadoCentavos = textoParaCentavos(valorLan);
  const usarHistoricoPadrao = (id: string) => {
    const h = historicosPadrao.find((x) => x.id === id);
    if (!h) return;
    const iso = normalizarDataContabil(dataLan);
    setHistLan(aplicarHistoricoPadrao(h.texto, iso ? iso.slice(0, 7) : new Date().toISOString().slice(0, 7)));
  };
  const tamanhoLote = (loteId?: string) => (loteId ? lancamentos.filter((x) => x.loteId === loteId).length : 1);

  // Atualizar conta a débito a partir da seleção no plano de contas sequencial
  const handleSelecionarDebito = (codigo: string) => {
    setDebitoCod(codigo);
    const contaEncontrada = contas.find((c) => c.codigo === codigo);
    if (contaEncontrada) {
      setDebitoNome(contaEncontrada.descricao);
    }
  };

  // Atualizar conta a crédito a partir da seleção no plano de contas sequencial
  const handleSelecionarCredito = (codigo: string) => {
    setCreditoCod(codigo);
    const contaEncontrada = contas.find((c) => c.codigo === codigo);
    if (contaEncontrada) {
      setCreditoNome(contaEncontrada.descricao);
    }
  };

  const lancamentosEfetivos = lancamentos.filter((l) => l.statusManual !== "pendente_aprovacao" && l.statusManual !== "rejeitado");
  const totalDebito = lancamentosEfetivos.reduce((acc, l) => acc + l.valor, 0);
  const totalCredito = lancamentosEfetivos.reduce((acc, l) => acc + l.valor, 0);
  const lancamentosComContaInvalida = lancamentos.filter((l) => {
    const debito = contas.find((conta) => conta.codigo === l.contaDebitoCodigo);
    const credito = contas.find((conta) => conta.codigo === l.contaCreditoCodigo);
    return !Number.isFinite(l.valor) || l.valor <= 0 || !debito || !credito || debito.tipo !== "analitica" || credito.tipo !== "analitica";
  }).length;

  // REVISOR: antes de gravar, confere data (formato, mês fechado, futura), valor, contas (existe? analítica? iguais?), histórico,
  // partida que não fecha e lançamento repetido. "Corrigir para mim" só arruma o que tem resposta certa (formato da data, conta pelo plano,
  // total pela soma das partidas); o que bloqueia não deixa gravar.
  const revisor = useRevisor();
  const handleSalvarNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = new Date(); const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ctx = { contas, lancamentos, fechadas: competenciasFechadas, hoje };
    const revisao = formaLan === "simples"
      ? revisarLancamento({ data: dataLan, valor: valorLan, debito: debitoCod.trim() || debitoNome, credito: creditoCod.trim() || creditoNome, historico: histLan }, ctx)
      : revisarMultipartida({ data: dataLan, historico: histLan, forma: formaLan, contaUnica, total: valorLan, partidas: linhasLan }, ctx, textoParaCentavos);
    const aplicar = (c: Record<string, string>) => {
      if (c.data !== undefined) setDataLan(c.data);
      if (c.debito !== undefined) handleSelecionarDebito(c.debito);
      if (c.credito !== undefined) handleSelecionarCredito(c.credito);
      if (c.historico !== undefined) setHistLan(c.historico);
      if (c.total !== undefined) setValorLan(c.total);
    };
    if (!revisor.conferir(revisao, { acao: formaLan === "simples" ? "lancamento" : "lancamento_multipartida", cnpj }, { aplicar, salvar: () => gravarNovo() })) return;
    await gravarNovo();
  };
  const gravarNovo = async () => {
    if (formaLan !== "simples") {
      if (!onRota) { setErroNovo("Lançamento com várias partidas indisponível nesta tela."); return; }
      if (!normalizarDataContabil(dataLan)) { setErroNovo("Informe uma data real no formato DD/MM/AAAA."); return; }
      if (totalInformadoCentavos === null || totalInformadoCentavos <= 0) { setErroNovo("Informe o total do lado único (ex.: 10.000,00)."); return; }
      if (totalInformadoCentavos !== somaLinhasCentavos) { setErroNovo(`O total não fecha: ${moedaContabil(totalInformadoCentavos)} de um lado e ${moedaContabil(somaLinhasCentavos)} nas partidas (diferença ${moedaContabil(totalInformadoCentavos - somaLinhasCentavos)}).`); return; }
      if (!histLan.trim()) { setErroNovo("Informe o histórico do lançamento."); return; }
      const r = await onRota("POST", "lancamentos-compostos", { data: dataLan, historico: histLan, forma: formaLan, contaUnica, totalCentavos: totalInformadoCentavos, total: valorLan, partidas: linhasLan.map((l) => ({ conta: l.conta, valorCentavos: textoParaCentavos(l.valor) })), ...(centroLan ? { centroCustoCodigo: centroLan } : {}) });
      if (!r.ok) { setErroNovo(String(r.corpo?.motivo || "O servidor não aceitou o lançamento.")); return; }
      limparRascunhoManual();
      setModalNovo(false);
      return;
    }
    const val = parseFloat(valorLan) || 0;
    const dataISO = normalizarDataContabil(dataLan);
    const debito = contas.find((conta) => conta.codigo === debitoCod && conta.tipo === "analitica");
    const credito = contas.find((conta) => conta.codigo === creditoCod && conta.tipo === "analitica");
    if (!Number.isFinite(val) || val <= 0) { setErroNovo("Informe um valor maior que zero."); return; }
    if (!dataISO) { setErroNovo("Informe uma data real no formato DD/MM/AAAA."); return; }
    if (!debito || !credito || debito.codigo === credito.codigo) { setErroNovo("Selecione duas contas analíticas diferentes."); return; }
    if (!histLan.trim()) { setErroNovo("Informe o histórico do lançamento."); return; }

    const novo: LancamentoContabil = {
      id: `lan-${crypto.randomUUID()}`,
      data: dataISO,
      contaDebitoCodigo: debitoCod,
      contaDebitoNome: debito.descricao,
      contaCreditoCodigo: creditoCod,
      contaCreditoNome: credito.descricao,
      valor: val,
      historico: histLan,
      origem: "Manual",
      documentoRef: `MAN-${crypto.randomUUID()}`,
      statusManual: "pendente_aprovacao",
      ...(centroLan ? { centroCustoCodigo: centroLan, centroCustoNome: centrosCusto.find((c) => c.codigo === centroLan)?.nome } : {}),
    };

    onAdicionarLancamento(novo);
    limparRascunhoManual();
    setModalNovo(false);
  };

  const lancamentosFiltrados = lancamentos.filter((l) => {
    if (filtroOrigem === "todos") return true;
    return l.origem.toLowerCase().includes(filtroOrigem.toLowerCase());
  });

  return (
    <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="text-xl">📝</span> Lançamentos contábeis registrados
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Exibe os lançamentos desta empresa. O Fiscal e o DP já mandam os dados e o Robô Reconciliador prepara sozinho os pré-lançamentos; eles aparecem aqui depois que você aprova na tela Revisar dados recebidos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>{lancamentos.length === 0 ? "Sem lançamentos para validar" : `${lancamentosComContaInvalida} lançamento(s) com conta/valor pendente de conferência`}</span>
          </span>
        </div>
      </div>

      {/* Barra de Ações Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            id="btn-importar-fiscal"
            type="button"
            onClick={onImportarFiscal}
            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Abre a tela Revisar dados recebidos, onde ficam os pré-lançamentos que vieram do Fiscal"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Rascunhos do Fiscal</span>
          </button>

          <button
            id="btn-importar-dp"
            type="button"
            onClick={onImportarDP}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Abre a tela Revisar dados recebidos, onde ficam os pré-lançamentos que vieram do DP"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Rascunhos do DP</span>
          </button>

          <button
            id="btn-gerar-tudo"
            type="button"
            onClick={onGerarTudo}
            className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Pede ao Robô Reconciliador para preparar agora os pré-lançamentos com o que o Fiscal e o DP já mandaram. Nada é aprovado sozinho."
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Preparar rascunhos agora</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 bg-white"
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
          >
            <option value="todos">Todas as origens</option>
            <option value="Fiscal">Módulo Fiscal</option>
            <option value="DP">Departamento Pessoal</option>
            <option value="Cadastro">Cadastro / Capital</option>
            <option value="Manual">Manual</option>
          </select>

          <button
            id="btn-novo-lancamento"
            data-piloto-abrir=""
            onClick={() => { limparRascunhoManual(); setModalNovo(true); }}
            className="bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-blue-700" />
            <span>+ Lançamento Manual</span>
          </button>
        </div>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[440px] overflow-y-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3">Data</th>
              <th className="py-2.5 px-3">Conta Débito</th>
              <th className="py-2.5 px-3">Conta Crédito</th>
              <th className="py-2.5 px-3">Histórico / Documento</th>
              <th className="py-2.5 px-3 text-right">Valor (R$)</th>
              <th className="py-2.5 px-3">Origem</th>
              <th className="py-2.5 px-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal text-slate-800">
            {lancamentosFiltrados.map((l) => {
              const estornado = Boolean(l.estornoDe) || lancamentos.some((outro) => outro.estornoDe === l.id);
              const manualPendente = l.statusManual === "pendente_aprovacao";
              const manualRejeitado = l.statusManual === "rejeitado";
              return (
              <tr key={l.id} className="hover:bg-blue-50/40 transition">
                <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">{l.data}</td>
                <td className="py-2.5 px-3 font-semibold text-rose-700">
                  <div className="font-mono">{l.contaDebitoCodigo}</div>
                  <div className="text-[11px] text-slate-500 font-normal truncate max-w-[170px]">
                    {l.contaDebitoNome}
                  </div>
                </td>
                <td className="py-2.5 px-3 font-semibold text-emerald-700">
                  <div className="font-mono">{l.contaCreditoCodigo}</div>
                  <div className="text-[11px] text-slate-500 font-normal truncate max-w-[170px]">
                    {l.contaCreditoNome}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-slate-700 max-w-[280px]">
                  <div className="truncate font-medium">{l.historico}</div>
                  {l.documentoRef && (
                    <span className="text-[10px] text-slate-400 font-mono">Ref: {l.documentoRef}</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                  {l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      l.origem.includes("Fiscal")
                        ? "bg-amber-100 text-amber-800"
                        : l.origem.includes("DP")
                        ? "bg-indigo-100 text-indigo-800"
                        : l.origem.includes("Cadastro")
                        ? "bg-slate-200 text-slate-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {l.origem}
                  </span>
                  {manualPendente && <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Aguardando aprovação</span>}
                  {l.loteId && <span className="ml-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900" title="Lançamento com várias partidas: aprovar, rejeitar e estornar valem para todas juntas">Várias partidas ({tamanhoLote(l.loteId)})</span>}
                  {l.tipoEspecial === "encerramento" && <span className="ml-1 inline-block rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-900">Encerramento do resultado</span>}
                  {l.recorrenteDe && <span className="ml-1 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900">Lançamento padrão</span>}
                  {l.sistemaMigracao && <span className="ml-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-900">Importado: {l.sistemaMigracao === "ALTERDATA" ? "sistema anterior" : l.sistemaMigracao}</span>}
                  {l.classificacaoDeclaradaArquivo && l.classificacaoDeclaradaArquivo !== "Manual" && <div className="mt-1 text-[10px] text-slate-500">Tipo informado no arquivo: {l.classificacaoDeclaradaArquivo} · não verificado</div>}
                  {manualRejeitado && <span className="ml-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900">Rejeitado</span>}
                  {l.statusManual === "aprovado" && <span className="ml-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">Aprovado</span>}
                </td>
                <td className="py-2.5 px-2 text-center">
                  {manualPendente ? <div className="flex justify-center gap-1">
                    <button type="button" disabled={!workspacePersistido} onClick={async () => { if (await confirmarNaTela(l.loteId ? `Aprovar as ${tamanhoLote(l.loteId)} partidas deste lançamento juntas e incluí-las nos livros? Confira os valores e as contas antes de continuar.` : "Aprovar este lançamento pendente e incluí-lo nos livros e relatórios? Confira os valores, as contas e a origem antes de continuar.")) await onDecidirLancamentoManual(l.id, "aprovar"); }} className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 disabled:opacity-40" title="Aprovar após conferir os dados">Aprovar</button>
                    <button type="button" disabled={!workspacePersistido} onClick={async () => { if (!await confirmarNaTela("Rejeitar este lançamento? Ele ficará no histórico, mas não entrará nos livros.")) return; const motivo = window.prompt("Informe o motivo da rejeição:")?.trim(); if (motivo) await onDecidirLancamentoManual(l.id, "rejeitar", motivo); }} className="rounded bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800 disabled:opacity-40">Rejeitar</button>
                  </div> : <button
                    onClick={async () => {
                      if (!estornado && !manualRejeitado && l.loteId && onRota) {
                        if (await confirmarNaTela(`O lançamento original (${tamanhoLote(l.loteId)} partidas) será preservado e um estorno de todas as partidas será registrado para aprovação, com débito e crédito invertidos. Continuar?`)) await onRota("POST", `lotes/${encodeURIComponent(l.loteId)}/estornar`, {});
                        return;
                      }
                      if (!estornado && !manualRejeitado && await confirmarNaTela("O lançamento original será preservado e uma partida de estorno será registrada para aprovação, com débito e crédito invertidos. Continuar?")) {
                        onEstornarLancamento(l.id);
                      }
                    }}
                    disabled={estornado || manualRejeitado}
                    className="text-slate-400 hover:text-amber-700 disabled:text-slate-300 disabled:cursor-not-allowed p-1 rounded-sm cursor-pointer transition"
                    title={estornado ? "Lançamento já estornado ou é um estorno" : "Registrar estorno para aprovação, sem apagar o original"}
                    aria-label={estornado ? "Lançamento já estornado" : "Registrar estorno"}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>}
                </td>
              </tr>
            );})}
            {lancamentosFiltrados.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Nenhum lançamento neste filtro. Novos lançamentos manuais só entram nos livros após aprovação.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Rodapé de Totalização e Partida Dobrada */}
      <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-slate-700">
            <strong>{lancamentos.length} lançamentos registrados</strong> · {lancamentos.filter((l) => l.statusManual === "pendente_aprovacao").length} aguardando aprovação · {lancamentosComContaInvalida} com conta ou valor inválido.
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="text-rose-700">
            Total Débito: R${" "}
            {totalDebito.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-emerald-700">
            Total Crédito: R${" "}
            {totalCredito.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {onRota && <PadroesLancamentoPainel contas={contas} historicosPadrao={historicosPadrao} lancamentosPadrao={lancamentosPadrao} onRota={onRota} podeGravar={workspacePersistido} />}

      {/* Modal de Novo Lançamento Manual */}
      {modalNovo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>Novo Lançamento Manual (Partida Dobrada)</span>
              </h4>
              <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                Plano de Contas Sequencial
              </span>
            </div>

            <form onSubmit={handleSalvarNovo} className="space-y-3.5 text-xs">
              {revisor.painel}
              {erroNovo && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{erroNovo}</div>}
              {onRota && <label className="block text-slate-700 font-semibold">Forma do lançamento
                <select data-campo="lancamento-forma" value={formaLan} onChange={(e) => setFormaLan(e.target.value as "simples" | "1xN" | "Nx1")} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-xs bg-white">
                  <option value="simples">1 débito x 1 crédito</option>
                  <option value="1xN">1 débito x vários créditos</option>
                  <option value="Nx1">vários débitos x 1 crédito</option>
                </select>
              </label>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Data do Lançamento</label>
                  <input
                    type="text"
                    placeholder="DD/MM/AAAA"
                    data-campo="lancamento-data"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    value={dataLan}
                    onChange={(e) => setDataLan(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">{formaLan === "simples" ? "Valor (R$)" : `Total do ${formaLan === "1xN" ? "débito" : "crédito"} (R$)`}</label>
                  <input
                    type={formaLan === "simples" ? "number" : "text"}
                    inputMode="decimal"
                    placeholder={formaLan === "simples" ? undefined : "10.000,00"}
                    data-campo="lancamento-valor"
                    required
                    min={formaLan === "simples" ? "0.01" : undefined}
                    step={formaLan === "simples" ? "0.01" : undefined}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                    value={valorLan}
                    onChange={(e) => setValorLan(e.target.value)}
                  />
                </div>
              </div>

{formaLan === "simples" && <>
              {/* Conta Débito com Seleção da Sequência Numérica */}
              <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-rose-900 font-bold">
                    Conta a Débito (Aplicação dos Recursos)
                  </label>
                  <span className="text-[10px] text-rose-700 font-mono font-semibold">
                    Seq: {debitoCod}
                  </span>
                </div>

                {/* Seletor rápido a partir da sequência de contas analíticas */}
                {contasAnaliticas.length > 0 && (
                  <select
                    className="w-full border border-rose-300 rounded-lg p-2 text-xs bg-white text-slate-800 font-mono"
                    value={debitoCod}
                    required
                    onChange={(e) => handleSelecionarDebito(e.target.value)}
                  >
                    <option value="" disabled>Selecione uma conta analítica</option>
                    {contasAnaliticas.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.descricao}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Código"
                    data-campo="lancamento-debito-codigo"
                    className="w-24 border border-rose-300 bg-white rounded-lg p-2 text-xs font-mono font-bold text-rose-700"
                    value={debitoCod}
                    onChange={(e) => handleSelecionarDebito(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Nome da Conta"
                    className="flex-1 border border-rose-300 bg-white rounded-lg p-2 text-xs text-slate-800"
                    value={debitoNome}
                    onChange={(e) => setDebitoNome(e.target.value)}
                  />
                </div>
              </div>

              {/* Conta Crédito com Seleção da Sequência Numérica */}
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-emerald-900 font-bold">
                    Conta a Crédito (Origem dos Recursos)
                  </label>
                  <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                    Seq: {creditoCod}
                  </span>
                </div>

                {/* Seletor rápido a partir da sequência de contas analíticas */}
                {contasAnaliticas.length > 0 && (
                  <select
                    className="w-full border border-emerald-300 rounded-lg p-2 text-xs bg-white text-slate-800 font-mono"
                    value={creditoCod}
                    required
                    onChange={(e) => handleSelecionarCredito(e.target.value)}
                  >
                    <option value="" disabled>Selecione uma conta analítica</option>
                    {contasAnaliticas.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.descricao}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Código"
                    data-campo="lancamento-credito-codigo"
                    className="w-24 border border-emerald-300 bg-white rounded-lg p-2 text-xs font-mono font-bold text-emerald-700"
                    value={creditoCod}
                    onChange={(e) => handleSelecionarCredito(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Nome da Conta"
                    className="flex-1 border border-emerald-300 bg-white rounded-lg p-2 text-xs text-slate-800"
                    value={creditoNome}
                    onChange={(e) => setCreditoNome(e.target.value)}
                  />
                </div>
              </div>

</>}
              {formaLan !== "simples" && <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
                <label className="block font-bold text-sky-900">{formaLan === "1xN" ? "Conta a débito (uma)" : "Conta a crédito (uma)"}
                  <select value={contaUnica} required onChange={(e) => setContaUnica(e.target.value)} className="mt-1 w-full rounded-lg border border-sky-300 bg-white p-2 font-mono text-xs"><option value="" disabled>Selecione uma conta analítica</option>{contasAnaliticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}</select>
                </label>
                {linhasLan.map((linha, i) => <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[160px] flex-1 font-semibold text-slate-700">{formaLan === "1xN" ? `Crédito ${i + 1}` : `Débito ${i + 1}`}
                    <select value={linha.conta} required onChange={(e) => setLinhasLan(linhasLan.map((x, j) => (j === i ? { ...x, conta: e.target.value } : x)))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs"><option value="" disabled>Conta</option>{contasAnaliticas.filter((c) => c.codigo !== contaUnica).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}</select>
                  </label>
                  <label className="font-semibold text-slate-700">Valor<input inputMode="decimal" required value={linha.valor} placeholder="0,00" onChange={(e) => setLinhasLan(linhasLan.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} className="mt-1 block w-28 rounded-lg border border-slate-300 p-2 text-right text-xs" /></label>
                  {linhasLan.length > 1 && <button type="button" onClick={() => setLinhasLan(linhasLan.filter((_, j) => j !== i))} className="rounded border px-2 py-1.5" aria-label="Tirar esta partida">×</button>}
                </div>)}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setLinhasLan([...linhasLan, { conta: "", valor: "" }])} className="rounded border border-sky-300 bg-white px-2 py-1 font-bold text-sky-900">+ partida</button>
                  <span className={`font-bold ${totalInformadoCentavos !== null && totalInformadoCentavos === somaLinhasCentavos ? "text-emerald-700" : "text-rose-700"}`}>Partidas: {moedaContabil(somaLinhasCentavos)} {totalInformadoCentavos !== null && totalInformadoCentavos === somaLinhasCentavos ? "· fecha com o total" : `· diferença ${moedaContabil((totalInformadoCentavos || 0) - somaLinhasCentavos)}`}</span>
                </div>
              </div>}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Histórico da Operação</label>
                {historicosPadrao.length > 0 && <select data-campo="lancamento-historico-padrao" value="" onChange={(e) => usarHistoricoPadrao(e.target.value)} className="mb-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"><option value="">Usar um histórico padrão…</option>{historicosPadrao.map((h) => <option key={h.id} value={h.id}>{h.codigo} — {h.texto}</option>)}</select>}
                <textarea
                  data-campo="lancamento-historico"
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  value={histLan}
                  required
                  onChange={(e) => setHistLan(e.target.value)}
                />
              </div>

              {centrosCusto.length > 0 && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Centro de custo (opcional)</label>
                  <select className="w-full border border-slate-300 rounded-lg p-2 text-xs" value={centroLan} onChange={(e) => setCentroLan(e.target.value)}>
                    <option value="">Sem centro de custo</option>
                    {centrosCusto.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>)}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Vinculado ao Plano de Contas Oficial</span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalNovo(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    data-campo="lancamento-gravar"
                    data-piloto-final="salvar"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Gravar Lançamento</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
