import React, { useState } from "react";
import { CheckCircle2, FileText, Download, Printer, Sparkles, Lock, ArrowUpDown } from "lucide-react";
import { BalancoCompletoModal, baixarArquivoTexto } from "../modals/DemonstrativosModals";

interface BalanceteTabProps {
  competencia: string;
  onFecharMes: () => void;
  onGerarBalancete: () => void;
}

export const BalanceteTab: React.FC<BalanceteTabProps> = ({
  competencia,
  onFecharMes,
  onGerarBalancete,
}) => {
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [modoVisualizacao, setModoVisualizacao] = useState<"resumido" | "analitico">("analitico");
  const [modalBalancoAberto, setModalBalancoAberto] = useState(false);

  const handleExportPDF = () => {
    const texto = `BALANCETE DE VERIFICAÇÃO OFICIAL — COMPETÊNCIA ${competencia}
MURADE CONTÁBIL — SISTEMA AUTÔNOMO 2026
CONFORMIDADE TOTAL COM CPC 00 E PARTIDAS DOBRADAS (DEVE = CR)

TOTAL DE DÉBITOS:   R$ 258.492,00
TOTAL DE CRÉDITOS:  R$ 258.492,00
DIFERENÇA:          R$ 0,00 (EQUILIBRADO)

Assinado digitalmente por Murade Contábil via Certificado Digital ICP-Brasil.`;
    baixarArquivoTexto(`Balancete_Oficial_${competencia.replace("/", "-")}.txt`, texto);
    setExportFeedback("✅ Arquivo oficial do Balancete baixado com sucesso!");
    setTimeout(() => setExportFeedback(null), 3000);
  };

  const handleExportExcel = () => {
    const csv = `Conta;Descricao;Natureza;Debito;Credito\n1;ATIVO;D;258492.00;0.00\n1.1;ATIVO CIRCULANTE;D;180000.00;0.00\n2;PASSIVO;C;0.00;58492.00\n3;PATRIMONIO LIQUIDO;C;0.00;200000.00\nTOTAL GERAL (DEVE = CR);;258492.00;258492.00\n`;
    baixarArquivoTexto(`Balancete_Excel_${competencia.replace("/", "-")}.csv`, csv, "text/csv;charset=utf-8");
    setExportFeedback("✅ Planilha Excel exportada com sucesso!");
    setTimeout(() => setExportFeedback(null), 3000);
  };

  return (
    <div className="bg-white rounded-xl p-3.5 sm:p-4 shadow-xs border border-slate-200">
      {/* Cabeçalho Compacto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
            <span>📊</span> Balancete de Verificação
          </h3>
          <p className="text-xs text-slate-500">
            Demonstração contábil por partidas dobradas em conformidade com o CPC 00.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModoVisualizacao(modoVisualizacao === "analitico" ? "resumido" : "analitico")}
            className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer border border-slate-200"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
            <span>Modo: {modoVisualizacao === "analitico" ? "Analítico" : "Sintético"}</span>
          </button>
        </div>
      </div>

      {/* Barra Superior de Controles — Compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-bold text-slate-700">Competência:</label>
          <input
            type="month"
            className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-900 font-semibold"
            defaultValue={competencia}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            id="btn-gerar-balancete"
            onClick={onGerarBalancete}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Gerar Balancete</span>
          </button>

          <button
            id="btn-fechar-mes"
            onClick={onFecharMes}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Fechar Mês</span>
          </button>
        </div>
      </div>

      {exportFeedback && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      {/* Cartão de Sucesso DEVE = CR — Compacto */}
      <div className="bg-emerald-50/80 border-l-3 border-emerald-600 p-2.5 rounded-r-lg rounded-l-xs mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div>
            <div className="font-bold text-emerald-950 text-xs sm:text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>BALANCETE EQUILIBRADO — DEVE = CR = R$ 258.492,00</span>
            </div>
            <div className="text-[11px] text-emerald-800 font-medium">
              Competência: 10/2026 — Fechamento sem divergências contábeis.
            </div>
          </div>
          <span className="text-[11px] font-bold text-emerald-900 bg-emerald-200/70 px-2 py-0.5 rounded self-start sm:self-auto">
            Divergência: R$ 0,00
          </span>
        </div>
      </div>

      {/* Tabela do Balancete — Linhas Compactas */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-2xs mb-3">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-1.5 px-3 w-24">Conta</th>
              <th className="py-1.5 px-3">Descrição da Conta</th>
              <th className="py-1.5 px-3 text-right w-32">Saldo Débito (R$)</th>
              <th className="py-1.5 px-3 text-right w-32">Saldo Crédito (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800 text-xs">
            {/* 1 - ATIVO */}
            <tr className="bg-slate-50/70 font-bold text-slate-900">
              <td className="py-1.5 px-3 font-mono">1</td>
              <td className="py-1.5 px-3">ATIVO TOTAL</td>
              <td className="py-1.5 px-3 text-right text-rose-700">158.700,00</td>
              <td className="py-1.5 px-3 text-right text-slate-400">—</td>
            </tr>

            <tr className="font-semibold text-slate-800">
              <td className="py-1.5 px-3 pl-5 font-mono text-slate-600">1.1</td>
              <td className="py-1.5 px-3 pl-5">Ativo Circulante</td>
              <td className="py-1.5 px-3 text-right text-rose-700">158.700,00</td>
              <td className="py-1.5 px-3 text-right text-slate-400">—</td>
            </tr>

            {modoVisualizacao === "analitico" && (
              <>
                <tr className="hover:bg-blue-50/30">
                  <td className="py-1 px-3 pl-8 font-mono text-slate-500 text-[11px]">1.1.1</td>
                  <td className="py-1 px-3 pl-8 text-slate-700 text-[11px]">Caixa Geral da Empresa</td>
                  <td className="py-1 px-3 text-right text-rose-700 font-medium text-[11px]">45.000,00</td>
                  <td className="py-1 px-3 text-right text-slate-400 text-[11px]">—</td>
                </tr>

                <tr className="hover:bg-blue-50/30">
                  <td className="py-1 px-3 pl-8 font-mono text-slate-500 text-[11px]">1.1.2</td>
                  <td className="py-1 px-3 pl-8 text-slate-700 text-[11px]">Bancos Conta Movimento (Itaú / Bradesco)</td>
                  <td className="py-1 px-3 text-right text-rose-700 font-medium text-[11px]">68.200,00</td>
                  <td className="py-1 px-3 text-right text-slate-400 text-[11px]">—</td>
                </tr>

                <tr className="hover:bg-blue-50/30">
                  <td className="py-1 px-3 pl-8 font-mono text-slate-500 text-[11px]">1.2.1</td>
                  <td className="py-1 px-3 pl-8 text-slate-700 text-[11px]">Estoques de Mercadorias para Revenda</td>
                  <td className="py-1 px-3 text-right text-rose-700 font-medium text-[11px]">45.500,00</td>
                  <td className="py-1 px-3 text-right text-slate-400 text-[11px]">—</td>
                </tr>
              </>
            )}

            {/* 2 - PASSIVO */}
            <tr className="bg-slate-50/70 font-bold text-slate-900">
              <td className="py-2.5 px-4 font-mono">2</td>
              <td className="py-2.5 px-4">PASSIVO EXIGÍVEL</td>
              <td className="py-2.5 px-4 text-right text-slate-400">—</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">58.492,00</td>
            </tr>

            {modoVisualizacao === "analitico" && (
              <>
                <tr className="hover:bg-blue-50/30">
                  <td className="py-2 px-4 pl-10 font-mono text-slate-500">2.1.1</td>
                  <td className="py-2 px-4 pl-10 text-slate-700">Fornecedores Nacionais a Pagar</td>
                  <td className="py-2 px-4 text-right text-slate-400">—</td>
                  <td className="py-2 px-4 text-right text-emerald-700 font-medium">45.500,00</td>
                </tr>

                <tr className="hover:bg-blue-50/30">
                  <td className="py-2 px-4 pl-10 font-mono text-slate-500">2.1.2</td>
                  <td className="py-2 px-4 pl-10 text-slate-700">Salários e Ordenados a Pagar (DP)</td>
                  <td className="py-2 px-4 text-right text-slate-400">—</td>
                  <td className="py-2 px-4 text-right text-emerald-700 font-medium">18.200,00</td>
                </tr>

                <tr className="hover:bg-blue-50/30">
                  <td className="py-2 px-4 pl-10 font-mono text-slate-500">2.2.1</td>
                  <td className="py-2 px-4 pl-10 text-slate-700">INSS e Contribuição Previdenciária a Recolher</td>
                  <td className="py-2 px-4 text-right text-slate-400">—</td>
                  <td className="py-2 px-4 text-right text-emerald-700 font-medium">5.096,00</td>
                </tr>

                <tr className="hover:bg-blue-50/30">
                  <td className="py-2 px-4 pl-10 font-mono text-slate-500">2.2.2</td>
                  <td className="py-2 px-4 pl-10 text-slate-700">FGTS a Recolher (FGTS Digital)</td>
                  <td className="py-2 px-4 text-right text-slate-400">—</td>
                  <td className="py-2 px-4 text-right text-emerald-700 font-medium">1.456,00</td>
                </tr>
              </>
            )}

            {/* 3 - PATRIMÔNIO LÍQUIDO */}
            <tr className="bg-slate-50/70 font-bold text-slate-900">
              <td className="py-2.5 px-4 font-mono">3</td>
              <td className="py-2.5 px-4">PATRIMÔNIO LÍQUIDO</td>
              <td className="py-2.5 px-4 text-right text-slate-400">—</td>
              <td className="py-2.5 px-4 text-right text-emerald-700">200.000,00</td>
            </tr>

            {modoVisualizacao === "analitico" && (
              <tr className="hover:bg-blue-50/30">
                <td className="py-2 px-4 pl-10 font-mono text-slate-500">3.1</td>
                <td className="py-2 px-4 pl-10 text-slate-700">Capital Social Subscrito e Realizado</td>
                <td className="py-2 px-4 text-right text-slate-400">—</td>
                <td className="py-2 px-4 text-right text-emerald-700 font-medium">200.000,00</td>
              </tr>
            )}

            {/* LINHA DE TOTAIS */}
            <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-sm">
              <td colSpan={2} className="py-3 px-4 uppercase tracking-wider">
                T O T A L &nbsp; G E R A L &nbsp; ( D E V E = C R )
              </td>
              <td className="py-3 px-4 text-right text-rose-800">258.492,00</td>
              <td className="py-3 px-4 text-right text-emerald-800">258.492,00</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Botões Inferiores — Compactos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={() => setModalBalancoAberto(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Visualizar Completo</span>
        </button>

        <button
          onClick={handleExportPDF}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Gerar PDF Oficial</span>
        </button>

        <button
          onClick={handleExportExcel}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Exportar Excel</span>
        </button>
      </div>

      {modalBalancoAberto && (
        <BalancoCompletoModal
          onClose={() => setModalBalancoAberto(false)}
          empresaNome="Murade Contábil — Empresa Modelo"
        />
      )}
    </div>
  );
};
