import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpDown, CheckCircle2, Download, Lock, RefreshCw } from "lucide-react";
import { ContaPlano, LancamentoContabil } from "../../types";

interface BalanceteTabProps {
  competencia: string;
  lancamentos: LancamentoContabil[];
  contas: ContaPlano[];
  onFecharMes: () => void;
}

interface LinhaBalancete {
  codigo: string;
  descricao: string;
  nivel: number;
  tipo: ContaPlano["tipo"];
  movimentosDebito: number;
  movimentosCredito: number;
  saldoDevedor: number;
  saldoCredor: number;
}

function obterCompetencia(data: string): string {
  const valor = String(data || "").trim();
  const iso = /^(\d{4})-(\d{2})/.exec(valor);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = /^(\d{2})\/(\d{4})$/.exec(valor);
  return br ? `${br[2]}-${br[1]}` : "";
}

function centavos(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function moeda(valorEmCentavos: number): string {
  return (valorEmCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escaparCsv(valor: string): string {
  return `"${String(valor).replace(/"/g, '""')}"`;
}

export const BalanceteTab: React.FC<BalanceteTabProps> = ({ competencia, lancamentos, contas, onFecharMes }) => {
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState(competencia || "");
  const [modoVisualizacao, setModoVisualizacao] = useState<"resumido" | "analitico">("analitico");
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [feedbackExportacao, setFeedbackExportacao] = useState<string | null>(null);

  const resumo = useMemo(() => {
    const contasPorCodigo = new Map(contas.map((conta) => [conta.codigo, conta]));
    const movimentos = new Map<string, { debito: number; credito: number }>();
    const doPeriodo = lancamentos.filter((lancamento) => !competenciaSelecionada || obterCompetencia(lancamento.data) === competenciaSelecionada);
    let lancamentosValidos = 0;
    let lancamentosInvalidos = 0;
    let totalDebitos = 0;
    let totalCreditos = 0;

    const adicionar = (codigo: string, debito: number, credito: number) => {
      const atual = movimentos.get(codigo) || { debito: 0, credito: 0 };
      atual.debito += debito;
      atual.credito += credito;
      movimentos.set(codigo, atual);
    };

    for (const conta of contas) {
      const saldoInicial = centavos(conta.saldoInicial || 0);
      if (saldoInicial > 0) adicionar(conta.codigo, conta.natureza === "D" ? saldoInicial : 0, conta.natureza === "C" ? saldoInicial : 0);
    }

    for (const lancamento of doPeriodo) {
      const valor = centavos(lancamento.valor);
      const debitoExiste = contasPorCodigo.has(lancamento.contaDebitoCodigo);
      const creditoExiste = contasPorCodigo.has(lancamento.contaCreditoCodigo);
      if (valor <= 0 || !debitoExiste || !creditoExiste) {
        lancamentosInvalidos += 1;
        continue;
      }
      adicionar(lancamento.contaDebitoCodigo, valor, 0);
      adicionar(lancamento.contaCreditoCodigo, 0, valor);
      totalDebitos += valor;
      totalCreditos += valor;
      lancamentosValidos += 1;
    }

    const linhas: LinhaBalancete[] = contas.map((conta) => {
      let movimentosDaConta = { ...(movimentos.get(conta.codigo) || { debito: 0, credito: 0 }) };
      for (const filha of contas) {
        if (filha.codigo.startsWith(`${conta.codigo}.`)) {
          const movimentoFilha = movimentos.get(filha.codigo);
          if (movimentoFilha) {
            movimentosDaConta.debito += movimentoFilha.debito;
            movimentosDaConta.credito += movimentoFilha.credito;
          }
        }
      }
      const saldo = movimentosDaConta.debito - movimentosDaConta.credito;
      return {
        codigo: conta.codigo,
        descricao: conta.descricao,
        nivel: conta.nivel,
        tipo: conta.tipo,
        movimentosDebito: movimentosDaConta.debito,
        movimentosCredito: movimentosDaConta.credito,
        saldoDevedor: Math.max(0, saldo),
        saldoCredor: Math.max(0, -saldo),
      };
    });

    const contasAnaliticas = linhas.filter((linha) => linha.tipo === "analitica");
    const totalSaldoDevedor = contasAnaliticas.reduce((total, linha) => total + linha.saldoDevedor, 0);
    const totalSaldoCredor = contasAnaliticas.reduce((total, linha) => total + linha.saldoCredor, 0);
    const temSaldosIniciais = contas.some((conta) => centavos(conta.saldoInicial || 0) > 0);
    const temDados = lancamentosValidos > 0 || temSaldosIniciais;
    return {
      linhas,
      doPeriodo: doPeriodo.length,
      lancamentosValidos,
      lancamentosInvalidos,
      totalDebitos,
      totalCreditos,
      totalSaldoDevedor,
      totalSaldoCredor,
      temDados,
      diferencaSaldos: Math.abs(totalSaldoDevedor - totalSaldoCredor),
    };
  }, [competenciaSelecionada, contas, lancamentos]);

  const linhasVisiveis = resumo.linhas.filter((linha) => modoVisualizacao === "analitico" || linha.tipo === "sintetica");
  const equilibrado = resumo.temDados && resumo.lancamentosInvalidos === 0 && resumo.diferencaSaldos === 0;

  const exportarCsv = () => {
    if (!resumo.temDados || resumo.lancamentosInvalidos > 0) {
      setFeedbackExportacao("Não exportei: confira os lançamentos inválidos e informe dados contábeis válidos.");
      return;
    }
    const linhasCsv = [
      ["Balancete local — não é documento oficial"],
      [`Competência;${competenciaSelecionada || "Todas"}`],
      ["Conta", "Descrição", "Movimentos débito", "Movimentos crédito", "Saldo devedor", "Saldo credor"],
      ...resumo.linhas.filter((linha) => linha.tipo === "analitica").map((linha) => [
        escaparCsv(linha.codigo), escaparCsv(linha.descricao),
        (linha.movimentosDebito / 100).toFixed(2), (linha.movimentosCredito / 100).toFixed(2),
        (linha.saldoDevedor / 100).toFixed(2), (linha.saldoCredor / 100).toFixed(2),
      ]),
      ["Totais", "", (resumo.totalDebitos / 100).toFixed(2), (resumo.totalCreditos / 100).toFixed(2), (resumo.totalSaldoDevedor / 100).toFixed(2), (resumo.totalSaldoCredor / 100).toFixed(2)],
    ].map((linha) => linha.join(";"));
    const blob = new Blob(["\uFEFF", linhasCsv.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `balancete-local-${competenciaSelecionada || "todas"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedbackExportacao("Arquivo CSV local baixado. Ele não é assinado, transmitido ou validado por órgão oficial.");
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">📊 Balancete local de verificação</h3>
          <p className="mt-1 text-xs text-slate-600">Calculado dos lançamentos e saldos iniciais registrados neste Contábil. Não consulta Fiscal, DP, bancos ou órgãos oficiais.</p>
        </div>
        <button type="button" onClick={() => setModoVisualizacao((atual) => atual === "analitico" ? "resumido" : "analitico")} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          <ArrowUpDown className="h-3.5 w-3.5 text-blue-600" /> {modoVisualizacao === "analitico" ? "Visão analítica" : "Visão sintética"}
        </button>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-bold text-slate-700">Competência
          <input type="month" value={competenciaSelecionada} onChange={(evento) => setCompetenciaSelecionada(evento.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setGeradoEm(new Date().toISOString())} className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-xs font-bold text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar balancete
          </button>
          <button type="button" onClick={onFecharMes} className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            <Lock className="h-3.5 w-3.5" /> Fechar mês
          </button>
        </div>
      </section>

      {geradoEm && <p role="status" className="text-xs text-slate-600">Resumo local atualizado em {new Date(geradoEm).toLocaleString("pt-BR")}.</p>}
      {feedbackExportacao && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">{feedbackExportacao}</p>}

      <section className={`rounded-lg border p-3 ${equilibrado ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-2">
          {equilibrado ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />}
          <div className="text-xs">
            <strong>{equilibrado ? "Movimentos locais equilibrados" : resumo.temDados ? "Balancete local requer conferência" : "Sem dados contábeis para calcular"}</strong>
            <p className="mt-1 text-slate-700">Competência {competenciaSelecionada || "não selecionada"} · {resumo.lancamentosValidos} lançamento(s) válidos · {resumo.lancamentosInvalidos} inválido(s) · {resumo.doPeriodo} no período.</p>
            {resumo.temDados && <p className="mt-1 text-slate-700">Saldo devedor {moeda(resumo.totalSaldoDevedor)} · saldo credor {moeda(resumo.totalSaldoCredor)} · diferença {moeda(resumo.diferencaSaldos)}.</p>}
            {!resumo.temDados && <p className="mt-1 text-slate-700">Um balancete vazio não confirma que a contabilidade esteja regular ou sem pendências.</p>}
          </div>
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[650px] border-collapse text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Mov. débito</th><th className="px-3 py-2 text-right">Mov. crédito</th><th className="px-3 py-2 text-right">Saldo devedor</th><th className="px-3 py-2 text-right">Saldo credor</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhasVisiveis.filter((linha) => linha.movimentosDebito || linha.movimentosCredito).map((linha) => (
              <tr key={linha.codigo}>
                <td className="px-3 py-2 font-mono">{linha.codigo}</td>
                <td className="px-3 py-2" style={{ paddingLeft: `${12 + (linha.nivel - 1) * 16}px` }}>{linha.descricao}</td>
                <td className="px-3 py-2 text-right">{moeda(linha.movimentosDebito)}</td>
                <td className="px-3 py-2 text-right">{moeda(linha.movimentosCredito)}</td>
                <td className="px-3 py-2 text-right">{moeda(linha.saldoDevedor)}</td>
                <td className="px-3 py-2 text-right">{moeda(linha.saldoCredor)}</td>
              </tr>
            ))}
            {linhasVisiveis.every((linha) => !linha.movimentosDebito && !linha.movimentosCredito) && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nenhum movimento ou saldo inicial informado para esta competência.</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
            <tr><td colSpan={2} className="px-3 py-2">Totais dos movimentos do período</td><td className="px-3 py-2 text-right">{moeda(resumo.totalDebitos)}</td><td className="px-3 py-2 text-right">{moeda(resumo.totalCreditos)}</td><td className="px-3 py-2 text-right">{moeda(resumo.totalSaldoDevedor)}</td><td className="px-3 py-2 text-right">{moeda(resumo.totalSaldoCredor)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={exportarCsv} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">
          <Download className="h-3.5 w-3.5" /> Exportar CSV local
        </button>
      </div>
    </div>
  );
};
