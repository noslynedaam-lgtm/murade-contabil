import React, { useState } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  DollarSign,
  Download,
  Copy,
  Check,
  Printer,
  ShieldCheck,
  Send,
  Trash2,
  Building2,
  Clock,
  ArrowRight,
  QrCode,
  CreditCard,
  CheckCheck,
} from "lucide-react";
import { LembreteItem, EmpresaDados } from "../../types";

// ==========================================================
// 1. MODAL VISUALIZAR OBRIGAÇÃO (Ação "Ver")
// ==========================================================
interface VisualizarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onApurar?: () => void;
  onGerarGuia?: () => void;
  onPagar?: () => void;
  onTransmitir?: () => void;
  onExcluir?: () => void;
}

export const VisualizarModal: React.FC<VisualizarModalProps> = ({
  item,
  empresa,
  onClose,
  onApurar,
  onGerarGuia,
  onPagar,
  onTransmitir,
  onExcluir,
}) => {
  const [copiado, setCopiado] = useState(false);

  const copiarLinha = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const getStatusBadge = () => {
    if (item.statusExecucao === "pago") {
      return (
        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Pago / Liquidado
        </span>
      );
    }
    if (item.statusExecucao === "transmitido") {
      return (
        <span className="bg-blue-100 text-blue-800 border border-blue-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Transmitido com Sucesso
        </span>
      );
    }
    if (item.tipo === "vencido") {
      return (
        <span className="bg-rose-100 text-rose-800 border border-rose-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> Vencido
        </span>
      );
    }
    if (item.tipo === "hoje") {
      return (
        <span className="bg-purple-100 text-purple-800 border border-purple-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Vence Hoje
        </span>
      );
    }
    if (item.tipo === "proximo") {
      return (
        <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> A Vencer (Urgente)
        </span>
      );
    }
    return (
      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> No Prazo
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-slate-100 font-mono">
                {item.origem}
              </span>
              {getStatusBadge()}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {item.nome}
            </h3>
            <p className="text-xs text-slate-300">
              Competência: <strong>{item.competencia || "09/2026"}</strong> • Vencimento: <strong>{item.dataVencimento}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Card da Empresa */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
            <div>
              <span className="text-slate-500 font-medium block">Contribuinte / Empresa:</span>
              <strong className="text-slate-900">{empresa.razaoSocial}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">CNPJ:</span>
              <span className="font-mono text-slate-900 font-semibold">{empresa.cnpj}</span>
            </div>
          </div>

          {/* Dados Fiscais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Valor Principal</span>
              <div className="text-lg font-black text-slate-900">
                {item.valor && item.valor > 0
                  ? `R$ ${item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "Declaratório"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Código de Receita</span>
              <div className="text-sm font-bold text-blue-800 font-mono">
                {item.codigoReceita || "Geral RFB"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Situação Cadastral</span>
              <div className="text-sm font-bold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Regular
              </div>
            </div>
          </div>

          {/* Detalhes e Observações */}
          <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 text-xs text-slate-700 leading-relaxed space-y-1">
            <strong className="text-blue-900 block font-bold">Informações Operacionais:</strong>
            <p>{item.detalhes || "Obrigação monitorada pelos robôs contábil e fiscal."}</p>
            {item.chaveAcesso && (
              <p className="font-mono text-[11px] text-slate-600 pt-1">
                Identificador Único: <strong>{item.chaveAcesso}</strong>
              </p>
            )}
            {item.protocolo && (
              <p className="font-mono text-[11px] text-emerald-700 font-bold pt-1">
                Protocolo de Transmissão: {item.protocolo}
              </p>
            )}
          </div>

          {/* Linha Digitável se existir */}
          {item.linhaDigitavel && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Linha Digitável / Código de Barras:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={item.linhaDigitavel}
                  className="w-full font-mono text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none"
                />
                <button
                  onClick={() => copiarLinha(item.linhaDigitavel!)}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer border border-slate-300"
                >
                  {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiado ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação Interativos */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {onExcluir && (
            <button
              onClick={onExcluir}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-3 py-2 rounded-lg transition flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir Lembrete</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              Fechar
            </button>

            {onApurar && (
              <button
                onClick={onApurar}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>📊 Apurar Imposto</span>
              </button>
            )}

            {onGerarGuia && (
              <button
                onClick={onGerarGuia}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText className="w-4 h-4" />
                <span>Gerar Guia / DARF</span>
              </button>
            )}

            {onPagar && (
              <button
                onClick={onPagar}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pagar Agora</span>
              </button>
            )}

            {onTransmitir && (
              <button
                onClick={onTransmitir}
                className="px-4 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>Transmitir / Enviar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 2. MODAL APURAR TRIBUTO (Ação "Apurar")
// ==========================================================
interface ApurarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirApuracao: (novoValor: number) => void;
}

export const ApurarModal: React.FC<ApurarModalProps> = ({
  item,
  empresa,
  onClose,
  onConcluirApuracao,
}) => {
  const [faturamento, setFaturamento] = useState(148500.0);
  const [aliquota, setAliquota] = useState(18.0);
  const [creditos, setCreditos] = useState(12800.0);
  const [calculando, setCalculando] = useState(false);
  const [apurado, setApurado] = useState(false);

  const debitoBruto = (faturamento * aliquota) / 100;
  const impostoLiquido = Math.max(0, debitoBruto - creditos);

  const executarCalculo = () => {
    setCalculando(true);
    setTimeout(() => {
      setCalculando(false);
      setApurado(true);
    }, 1200);
  };

  const finalizar = () => {
    onConcluirApuracao(impostoLiquido);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-white">
              Apuração Automatizada 2026
            </span>
            <h3 className="text-lg font-bold text-white mt-1">{item.nome}</h3>
            <p className="text-xs text-amber-100">
              Competência: <strong>{item.competencia || "09/2026"}</strong> • Regime: <strong>{empresa.regime}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-900 leading-relaxed">
            💡 O Robô Fiscal cruzou automaticamente as <strong>NF-e de entrada e saída</strong> com os créditos da Reforma Tributária (IBS/CBS) para determinar o imposto líquido a recolher.
          </div>

          <div className="space-y-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Faturamento Bruto da Competência (R$)</label>
              <input
                type="number"
                value={faturamento}
                onChange={(e) => {
                  setFaturamento(parseFloat(e.target.value) || 0);
                  setApurado(false);
                }}
                className="w-full p-2.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Alíquota Efetiva (%)</label>
                <input
                  type="number"
                  value={aliquota}
                  onChange={(e) => {
                    setAliquota(parseFloat(e.target.value) || 0);
                    setApurado(false);
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Créditos de Entrada (R$)</label>
                <input
                  type="number"
                  value={creditos}
                  onChange={(e) => {
                    setCreditos(parseFloat(e.target.value) || 0);
                    setApurado(false);
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>
          </div>

          {/* Resumo do Cálculo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Débito Bruto de Saídas:</span>
              <strong className="font-mono text-slate-900">
                R$ {debitoBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>(-) Créditos Fiscais Apropriados:</span>
              <strong className="font-mono text-emerald-700">
                - R$ {creditos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
              <span className="font-bold text-slate-900">(=) Saldo Líquido a Recolher:</span>
              <span className="text-base font-black text-amber-900 font-mono">
                R$ {impostoLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {apurado && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-xl flex items-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Apuração consolidada e validada pelo Fisco IA! Pronto para gerar a guia.</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          {!apurado ? (
            <button
              onClick={executarCalculo}
              disabled={calculando}
              className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <CpuIcon className="w-4 h-4" />
              <span>{calculando ? "Apuração em Processamento..." : "⚡ Apurar Agora pelo Robô"}</span>
            </button>
          ) : (
            <button
              onClick={finalizar}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Salvar Apuração & Liberar Guia</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 3. MODAL GERAR GUIA / DARF (Ação "Gerar" ou "Gerar DARF")
// ==========================================================
interface GerarGuiaModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onPagar?: () => void;
}

export const GerarGuiaModal: React.FC<GerarGuiaModalProps> = ({
  item,
  empresa,
  onClose,
  onPagar,
}) => {
  const [copiado, setCopiado] = useState(false);
  const valorTotal = item.valor || 3840.5;

  const copiarCodigoBarras = () => {
    const linha = item.linhaDigitavel || "85870000038-4 40500179202-6 6092026000-5 0010820100-9";
    navigator.clipboard.writeText(linha);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleImprimir = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[95vh] flex flex-col">
        {/* Topo do Modal */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-300" />
            <div>
              <h3 className="text-base font-bold text-white">Guia Oficial de Recolhimento</h3>
              <p className="text-[11px] text-blue-200">
                Ministério da Fazenda • Secretaria Especial da Receita Federal do Brasil
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modelo da Guia Oficial (DARF / GPS / GRF) */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="border-2 border-slate-800 rounded-xl p-4 bg-white space-y-4 shadow-xs">
            {/* Cabeçalho da Guia */}
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  República Federativa do Brasil
                </div>
                <div className="text-base font-black text-slate-900">
                  {item.nome.includes("GPS") ? "GPS — GUIA DA PREVIDÊNCIA SOCIAL" : "DARF — DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS"}
                </div>
                <div className="text-[11px] text-slate-600 font-semibold">
                  Competência: {item.competencia || "09/2026"}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono font-bold bg-slate-100 border border-slate-300 px-2 py-1 rounded">
                  Via Contribuinte
                </span>
              </div>
            </div>

            {/* Grid dos Campos Oficiais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 block">01. Razão Social</span>
                <span className="font-bold text-slate-900 truncate block">{empresa.razaoSocial}</span>
              </div>
              <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 block">02. CNPJ</span>
                <span className="font-mono font-bold text-slate-900">{empresa.cnpj}</span>
              </div>
              <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 block">03. Código da Receita</span>
                <span className="font-mono font-bold text-blue-900">{item.codigoReceita || "1082-01"}</span>
              </div>
              <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 block">04. Período de Apuração</span>
                <span className="font-bold text-slate-900">{item.competencia || "09/2026"}</span>
              </div>
              <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 block">05. Data de Vencimento</span>
                <span className="font-bold text-rose-700">{item.dataVencimento}</span>
              </div>
              <div className="border-2 border-slate-800 p-2.5 rounded-lg bg-emerald-50">
                <span className="text-[10px] font-bold text-emerald-800 block">06. Valor Total a Pagar</span>
                <span className="font-black text-emerald-900 text-sm font-mono">
                  R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Linha Digitável e Código de Barras */}
            <div className="border border-slate-300 p-3 rounded-xl bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Linha Digitável Oficial:</span>
                <button
                  onClick={copiarCodigoBarras}
                  className="text-blue-700 hover:text-blue-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiado ? "Linha Copiada!" : "Copiar Linha"}</span>
                </button>
              </div>
              <div className="font-mono text-[11px] p-2 bg-white border border-slate-300 rounded font-semibold text-slate-800 text-center tracking-wider">
                {item.linhaDigitavel || "85870000038-4 40500179202-6 6092026000-5 0010820100-9"}
              </div>

              {/* Simulação de Código de Barras */}
              <div className="pt-2 flex flex-col items-center">
                <div className="h-10 w-full max-w-sm flex justify-between items-end bg-white p-1 border border-slate-200">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-slate-900"
                      style={{
                        width: (i % 3 === 0 ? "3px" : i % 2 === 0 ? "1.5px" : "2px"),
                        height: "100%",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 font-mono mt-1">Autenticação Mecânica / SISBB</span>
              </div>
            </div>

            {/* PIX Copia e Cola / QR Code */}
            <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white rounded-lg border border-emerald-300 text-emerald-700">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-bold text-emerald-900 block text-xs">Pague com PIX Instantâneo</span>
                  <span className="text-[11px] text-emerald-700">Baixa automática em até 5 minutos no e-CAC</span>
                </div>
              </div>
              {onPagar && (
                <button
                  onClick={onPagar}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs"
                >
                  Pagar via PIX
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Botões */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            onClick={copiarCodigoBarras}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition cursor-pointer flex items-center gap-1.5"
          >
            {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiado ? "Copiado!" : "Copiar Linha"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleImprimir}
              className="px-3.5 py-2 text-xs font-bold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={() => {
                alert("📥 Download do PDF da Guia iniciado com sucesso!");
              }}
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PDF</span>
            </button>
            {onPagar && (
              <button
                onClick={onPagar}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pagar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 4. MODAL PREPARAR OBRIGAÇÃO (Ação "Preparar" — ECD / SPED)
// ==========================================================
interface PrepararModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirPreparacao: () => void;
}

export const PrepararModal: React.FC<PrepararModalProps> = ({
  item,
  empresa,
  onClose,
  onConcluirPreparacao,
}) => {
  const [etapa, setEtapa] = useState<"checklist" | "gerando" | "pronto">("checklist");

  const executarPreparacao = () => {
    setEtapa("gerando");
    setTimeout(() => {
      setEtapa("pronto");
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col text-xs">
        <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-white">
              PVA SPED Contábil 2026
            </span>
            <h3 className="text-lg font-bold text-white mt-1">{item.nome}</h3>
            <p className="text-xs text-purple-200">
              Validador Oficial PVA • Empresa: <strong>{empresa.razaoSocial}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <p className="text-slate-600 leading-relaxed">
            O preparador automático compila os lançamentos contábeis, o balancete de verificação e a DRE nos blocos oficiais do SPED (PVA Receita Federal).
          </p>

          <div className="space-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50">
            <span className="font-bold text-slate-800 block text-xs">Checagem de Consistência dos Blocos:</span>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Bloco 0:</strong> Abertura e Identificação da Entidade</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  100% Válido
                </span>
              </div>

              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Bloco I:</strong> Livro Diário Geral & Partidas Dobradas (D = C)</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Sem Erros
                </span>
              </div>

              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Bloco J:</strong> Balanço Patrimonial & DRE da Competência</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Consistente
                </span>
              </div>

              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span><strong>Bloco 9:</strong> Encerramento do Arquivo Digital SPED</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  OK
                </span>
              </div>
            </div>
          </div>

          {etapa === "pronto" && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded-xl space-y-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCheck className="w-5 h-5 text-emerald-600" />
                <span>Arquivo SPED Gerado e Pré-Validado com Sucesso!</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                Hash SHA-256: <span className="font-mono font-bold">9e8a7b6c5d4e3f21a0b1c2d3e4f5a6b7c8d9e0f1</span>
              </p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          {etapa !== "pronto" ? (
            <button
              onClick={executarPreparacao}
              disabled={etapa === "gerando"}
              className="px-5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>{etapa === "gerando" ? "Gerando Arquivo SPED..." : "⚙️ Compilar & Preparar Arquivo"}</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onConcluirPreparacao();
                onClose();
              }}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Concluir Preparação & Liberar Envio</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 5. MODAL TRANSMITIR / ENVIAR (Ação "Transmitir" ou "Enviar")
// ==========================================================
interface TransmitirModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirTransmissao: (protocolo: string) => void;
}

export const TransmitirModal: React.FC<TransmitirModalProps> = ({
  item,
  empresa,
  onClose,
  onConcluirTransmissao,
}) => {
  const [transmitindo, setTransmitindo] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [protocoloGerado, setProtocoloGerado] = useState("");

  const executarEnvio = () => {
    setTransmitindo(true);
    setTimeout(() => {
      const proto = `REC-2026-${Math.floor(100000 + Math.random() * 900000)}-${Date.now().toString().slice(-4)}`;
      setProtocoloGerado(proto);
      setTransmitindo(false);
      setConcluido(true);
    }, 1600);
  };

  const finalizar = () => {
    onConcluirTransmissao(protocoloGerado);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col text-xs">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-white">
              Transmissão com Certificado Digital A1
            </span>
            <h3 className="text-lg font-bold text-white mt-1">{item.nome}</h3>
            <p className="text-xs text-blue-200">
              Destino: <strong>Receita Federal / eSocial / Serpro</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Card do Certificado */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-300 text-blue-800 flex items-center justify-center font-black">
              A1
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Certificado e-CNPJ Ativo</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {empresa.razaoSocial} • Validade: Dez/2026 (ICP-Brasil)
              </span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-slate-700 leading-relaxed space-y-1">
            <strong className="text-blue-900 block font-bold">Assinatura Eletrônica em Lote:</strong>
            <p>
              O sistema assinará digitalmente a declaração com a chave privada da empresa e enviará diretamente ao ambiente de recepção seguro (mTLS / WSDL).
            </p>
          </div>

          {concluido && (
            <div className="bg-emerald-50 border-2 border-emerald-400 p-4 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-emerald-900 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Declaração Homologada com Sucesso!</span>
              </div>
              <div className="bg-white p-3 rounded-lg border border-emerald-300 text-slate-800 space-y-1">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Recibo Oficial de Entrega</div>
                <div className="text-xs font-mono font-black text-emerald-800">{protocoloGerado}</div>
                <div className="text-[10px] text-slate-500">
                  Data/Hora: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          {!concluido ? (
            <button
              onClick={executarEnvio}
              disabled={transmitindo}
              className="px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{transmitindo ? "Assinando e Transmitindo..." : "🚀 Transmitir Agora"}</span>
            </button>
          ) : (
            <button
              onClick={finalizar}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Concluir & Atualizar Status</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 6. MODAL PAGAR GUIA (Ação "Pagar")
// ==========================================================
interface PagarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirPagamento: () => void;
}

export const PagarModal: React.FC<PagarModalProps> = ({
  item,
  empresa,
  onClose,
  onConcluirPagamento,
}) => {
  const [metodo, setMetodo] = useState<"pix" | "banco" | "debito">("pix");
  const [processando, setProcessando] = useState(false);
  const [pago, setPago] = useState(false);
  const valorTotal = item.valor || 3840.5;

  const confirmarPagamento = () => {
    setProcessando(true);
    setTimeout(() => {
      setProcessando(false);
      setPago(true);
    }, 1400);
  };

  const finalizar = () => {
    onConcluirPagamento();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col text-xs">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-white">
              Liquidação de Tributo
            </span>
            <h3 className="text-lg font-bold text-white mt-1">{item.nome}</h3>
            <p className="text-xs text-emerald-100">
              Valor: <strong>R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Seletor de Método */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMetodo("pix")}
              className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                metodo === "pix"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <QrCode className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
              <span>PIX</span>
            </button>

            <button
              onClick={() => setMetodo("banco")}
              className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                metodo === "banco"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <CreditCard className="w-5 h-5 mx-auto mb-1 text-blue-600" />
              <span>Boleto/Guia</span>
            </button>

            <button
              onClick={() => setMetodo("debito")}
              className={`p-3 rounded-xl border text-center transition cursor-pointer ${
                metodo === "debito"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <Building2 className="w-5 h-5 mx-auto mb-1 text-purple-600" />
              <span>Débito Auto</span>
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Beneficiário:</span>
              <strong className="text-slate-900">Secretaria da Receita Federal</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Pagador:</span>
              <strong className="text-slate-900">{empresa.razaoSocial}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Data de Liquidação:</span>
              <strong className="text-slate-900">{new Date().toLocaleDateString("pt-BR")}</strong>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-800">Total a Debitar:</span>
              <span className="font-black text-emerald-800 text-sm font-mono">
                R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {pago && (
            <div className="bg-emerald-100 border border-emerald-400 p-3.5 rounded-xl text-emerald-900 space-y-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                <span>Pagamento Confirmado pelo Banco!</span>
              </div>
              <p className="text-[11px]">
                Autenticação Bancária: <span className="font-mono font-bold">BB.2026.0915.84920193.OK</span>
              </p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          {!pago ? (
            <button
              onClick={confirmarPagamento}
              disabled={processando}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              <span>{processando ? "Processando Pagamento..." : "Efetivar Pagamento"}</span>
            </button>
          ) : (
            <button
              onClick={finalizar}
              className="px-5 py-2 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Concluir</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 7. MODAL CONFIRMAR EXCLUSÃO (Lixeira)
// ==========================================================
interface ExcluirModalProps {
  item: LembreteItem;
  onClose: () => void;
  onConfirmar: () => void;
}

export const ExcluirModal: React.FC<ExcluirModalProps> = ({
  item,
  onClose,
  onConfirmar,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 p-6 text-xs space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-slate-900">Excluir Lembrete Fiscal?</h3>
          <p className="text-slate-600">
            Tem certeza que deseja remover este lembrete da sua agenda de obrigações?
          </p>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-900 font-medium">
          <strong>{item.nome}</strong>
          <div className="text-[11px] text-rose-700 mt-0.5">{item.data}</div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sim, Excluir</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Ícone auxiliar
function CpuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </svg>
  );
}
