import React, { useState, useMemo } from "react";
import { LancamentoContabil, ContaPlano } from "../../types";
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
  onImportarFiscal: () => void;
  onImportarDP: () => void;
  onGerarTudo: () => void;
  onAdicionarLancamento: (lanc: LancamentoContabil) => void;
  onEstornarLancamento: (id: string) => void;
}

export const LancamentosTab: React.FC<LancamentosTabProps> = ({
  lancamentos,
  contas = [],
  onImportarFiscal,
  onImportarDP,
  onGerarTudo,
  onAdicionarLancamento,
  onEstornarLancamento,
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
  const [erroNovo, setErroNovo] = useState("");
  const limparRascunhoManual = () => {
    setDataLan(""); setDebitoCod(""); setDebitoNome(""); setCreditoCod(""); setCreditoNome(""); setValorLan(""); setHistLan(""); setErroNovo("");
  };

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

  const totalDebito = lancamentos.reduce((acc, l) => acc + l.valor, 0);
  const totalCredito = lancamentos.reduce((acc, l) => acc + l.valor, 0);
  const lancamentosComContaInvalida = lancamentos.filter((l) => {
    const debito = contas.find((conta) => conta.codigo === l.contaDebitoCodigo);
    const credito = contas.find((conta) => conta.codigo === l.contaCreditoCodigo);
    return !Number.isFinite(l.valor) || l.valor <= 0 || !debito || !credito || debito.tipo !== "analitica" || credito.tipo !== "analitica";
  }).length;

  const handleSalvarNovo = (e: React.FormEvent) => {
    e.preventDefault();
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
            Exibe os registros locais desta empresa. As integrações automáticas com Fiscal e DP ainda não geram partidas contábeis.
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
            onClick={onImportarFiscal}
            disabled
            className="bg-slate-200 text-slate-600 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Fiscal: importação contábil indisponível</span>
          </button>

          <button
            id="btn-importar-dp"
            onClick={onImportarDP}
            disabled
            className="bg-slate-200 text-slate-600 text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>DP: folha ainda não disponível</span>
          </button>

          <button
            id="btn-gerar-tudo"
            onClick={onGerarTudo}
            disabled
            className="bg-slate-200 text-slate-600 text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-not-allowed shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Automação contábil não habilitada</span>
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
                </td>
                <td className="py-2.5 px-2 text-center">
                  <button
                    onClick={() => {
                      if (!estornado && window.confirm("O lançamento original será preservado e uma partida de estorno será registrada com débito e crédito invertidos. Continuar?")) {
                        onEstornarLancamento(l.id);
                      }
                    }}
                    disabled={estornado}
                    className="text-slate-400 hover:text-amber-700 disabled:text-slate-300 disabled:cursor-not-allowed p-1 rounded-sm cursor-pointer transition"
                    title={estornado ? "Lançamento já estornado ou é um estorno" : "Registrar estorno sem apagar o original"}
                    aria-label={estornado ? "Lançamento já estornado" : "Registrar estorno"}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );})}
            {lancamentosFiltrados.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Nenhum lançamento neste filtro. A integração fiscal atual persiste documentos de origem, mas ainda não os transforma em partidas.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Rodapé de Totalização e Partida Dobrada */}
      <div className="mt-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-slate-700">
            <strong>{lancamentos.length} lançamentos locais</strong> · {lancamentosComContaInvalida} com conta ou valor inválido · a validação estrutural não confirma classificação fiscal ou contábil.
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

      {/* Modal de Novo Lançamento Manual */}
      {modalNovo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
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
              {erroNovo && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{erroNovo}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Data do Lançamento</label>
                  <input
                    type="text"
                    placeholder="DD/MM/AAAA"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                    value={dataLan}
                    onChange={(e) => setDataLan(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900"
                    value={valorLan}
                    onChange={(e) => setValorLan(e.target.value)}
                  />
                </div>
              </div>

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

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Histórico da Operação</label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  value={histLan}
                  required
                  onChange={(e) => setHistLan(e.target.value)}
                />
              </div>

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
