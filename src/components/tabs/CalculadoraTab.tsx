import React, { useState, useEffect } from "react";
import {
  Calculator,
  Building2,
  Plus,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  TrendingUp,
} from "lucide-react";

interface CalculadoraTabProps {
  empresaPadrao?: string;
  onAdicionarLancamento?: (valor: number, empresa: string) => void;
}

export const CalculadoraTab: React.FC<CalculadoraTabProps> = ({ empresaPadrao }) => {
  const [valorAtual, setValorAtual] = useState<string>("0");
  const [valorAnterior, setValorAnterior] = useState<string>("");
  const [operacao, setOperacao] = useState<string>("");
  const [empresaAtual, setEmpresaAtual] = useState<string>(empresaPadrao || "");
  const [historicoPorEmpresa, setHistoricoPorEmpresa] = useState<Record<string, number>>({});
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setEmpresaAtual(empresaPadrao || "");
  }, [empresaPadrao]);

  // Total geral calculado dinamicamente
  const totalGeral: number = (Object.values(historicoPorEmpresa) as number[]).reduce(
    (acc: number, curr: number) => acc + curr,
    0
  );
  const totalEmpresaAtual: number = historicoPorEmpresa[empresaAtual] || 0;

  // Formatação de moeda BRL
  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  // Inserção de dígitos
  const inserirNumero = (num: string) => {
    setValorAtual((prev) => {
      if (prev === "0" && num !== ",") {
        return num;
      }
      if (num === "," && prev.includes(",")) {
        return prev;
      }
      return prev + num;
    });
  };

  // Inserção de operadores
  const inserirOperador = (op: string) => {
    if (valorAtual !== "") {
      if (valorAnterior && operacao) {
        calcularResultado(op);
      } else {
        setValorAnterior(valorAtual);
        setValorAtual("0");
        setOperacao(op);
      }
    }
  };

  // Execução do cálculo aritmético
  const calcularResultado = (proximaOperacao = "") => {
    if (!valorAnterior || !operacao || valorAtual === "") return;

    const ant = parseFloat(valorAnterior.replace(/\./g, "").replace(",", "."));
    const atu = parseFloat(valorAtual.replace(/\./g, "").replace(",", "."));
    let resultado = 0;

    switch (operacao) {
      case "+":
        resultado = ant + atu;
        break;
      case "-":
        resultado = ant - atu;
        break;
      case "*":
        resultado = ant * atu;
        break;
      case "/":
        resultado = atu !== 0 ? ant / atu : 0;
        break;
      case "%":
        resultado = ant * (atu / 100);
        break;
      default:
        return;
    }

    const resFormatado = resultado.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

    setValorAtual(resFormatado);
    setValorAnterior(proximaOperacao ? resFormatado : "");
    setOperacao(proximaOperacao);
  };

  // Limpar visor da calculadora
  const limparCalc = () => {
    setValorAtual("0");
    setValorAnterior("");
    setOperacao("");
  };

  // Somar valor calculado no total da empresa atual
  const somarNaEmpresa = () => {
    if (!empresaAtual.trim()) {
      alert("⚠️ Digite ou selecione o nome da empresa primeiro!");
      return;
    }

    const num = parseFloat(valorAtual.replace(/\./g, "").replace(",", "."));
    if (isNaN(num) || num === 0) return;

    setHistoricoPorEmpresa((prev) => ({
      ...prev,
      [empresaAtual]: (prev[empresaAtual] || 0) + num,
    }));

    setValorAtual("0");
    setValorAnterior("");
    setOperacao("");
  };

  // Zerar histórico da empresa atual
  const zerarEmpresaAtual = () => {
    if (!empresaAtual) return;
    setHistoricoPorEmpresa((prev) => {
      const novo = { ...prev };
      delete novo[empresaAtual];
      return novo;
    });
  };

  // Copiar resumo
  const copiarResumo = () => {
    const texto = `MURADE CONTÁBIL — RESUMO CALCULADORA 3D\n` +
      `Empresa: ${empresaAtual}\n` +
      `Total Acumulado: ${formatarMoeda(totalEmpresaAtual)}\n` +
      `Total Geral de Todas as Empresas: ${formatarMoeda(totalGeral)}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  // Suporte a atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver digitando no input da empresa
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      if (e.key >= "0" && e.key <= "9") {
        inserirNumero(e.key);
      } else if (e.key === "," || e.key === ".") {
        inserirNumero(",");
      } else if (e.key === "+") {
        inserirOperador("+");
      } else if (e.key === "-") {
        inserirOperador("-");
      } else if (e.key === "*") {
        inserirOperador("*");
      } else if (e.key === "/") {
        e.preventDefault();
        inserirOperador("/");
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        calcularResultado();
      } else if (e.key === "Escape" || e.key.toLowerCase() === "c") {
        limparCalc();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [valorAtual, valorAnterior, operacao]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Aba */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#6A1B9A] to-[#4A148C] text-white flex items-center justify-center shadow-md shadow-purple-500/20">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Calculadora 3D Contábil</span>
              <span className="text-[11px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full uppercase">
                Acumulador Pro
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Cálculos aritméticos e acumulados temporários organizados por empresa neste navegador
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copiarResumo}
            className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-300/60"
          >
            {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span>{copiado ? "Resumo Copiado!" : "Copiar Resumo"}</span>
          </button>
        </div>
      </div>

      {/* Grid Principal: Calculadora 3D e Painel Lateral de Totais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna da Calculadora 3D */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-[425px] bg-gradient-to-br from-[#2A1B3D] via-[#1E1230] to-[#120A1D] rounded-[22px] p-4 sm:p-5 shadow-[0_20px_50px_rgba(106,27,154,0.35),0_8px_20px_rgba(0,0,0,0.4)] border border-purple-500/20 relative overflow-hidden transition-all duration-300">
            {/* Efeito de Reflexo Superior */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/10 to-transparent rounded-t-[22px] pointer-events-none" />

            {/* Marca Superior */}
            <div className="text-center text-[#B39DDB] text-[11px] font-black tracking-[3px] uppercase mb-3 opacity-90">
              MURADE • CONTÁBIL 3D
            </div>

            {/* Empresa ativa cadastrada na tela de empresa */}
            <div className="mb-3">
              <label htmlFor="empresa-calculadora" className="flex items-center gap-1.5 text-[11px] font-bold text-purple-200 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#CE93D8]" />
                  <span>Empresa para este acumulado:</span>
                </span>
              </label>
              <input
                id="empresa-calculadora"
                type="text"
                value={empresaAtual}
                onChange={(e) => setEmpresaAtual(e.target.value)}
                placeholder="Cadastre uma empresa ou digite o nome para organizar o acumulado"
                className="w-full h-9 px-3 bg-white/10 border border-white/20 rounded-lg text-white text-xs sm:text-sm font-semibold placeholder:text-purple-300/70 outline-none focus:border-[#CE93D8] focus:bg-white/15 transition shadow-inner"
              />
            </div>

            {/* Visor Digital da Calculadora */}
            <div className="bg-[#150A21] rounded-xl p-3 sm:p-3.5 mb-3.5 shadow-[inset_0_4px_12px_rgba(0,0,0,0.6)] border border-white/10">
              <div className="text-[#CE93D8] text-xs font-semibold truncate mb-0.5 flex items-center justify-between">
                <span className="truncate flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-[#CE93D8]" />
                  <span className="font-bold">
                    {empresaAtual || "— Nenhuma empresa selecionada"}
                  </span>
                </span>
                <span className="text-[10px] text-purple-300/70 font-mono ml-2">BRL</span>
              </div>

              {/* Expressão anterior */}
              <div className="text-[#9575CD] text-xs text-right min-h-[16px] font-mono opacity-80">
                {valorAnterior} {operacao}
              </div>

              {/* Valor Principal com brilho contábil */}
              <div className="text-white text-2xl sm:text-3xl font-extrabold text-right font-mono tracking-tight drop-shadow-[0_0_10px_rgba(206,147,216,0.4)] my-0.5 overflow-x-auto select-all">
                {valorAtual}
              </div>

              {/* Barra de Total da Empresa Atual */}
              <div className="bg-gradient-to-r from-[#2E7D32] to-[#1B5E20] text-white px-3 py-1.5 rounded-lg mt-2 flex items-center justify-between font-bold text-xs shadow-md border border-emerald-400/30">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Total desta Empresa:</span>
                </span>
                <span className="font-mono text-emerald-100">{formatarMoeda(totalEmpresaAtual)}</span>
              </div>
            </div>

            {/* Grid dos Botões Táteis com Teclas Reduzidas/Compactas Conforme Solicitado */}
            <div className="grid grid-cols-4 gap-2">
              {/* Linha 1 */}
              <button
                onClick={limparCalc}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#D32F2F] to-[#B71C1C] hover:from-[#E53935] hover:to-[#C62828] text-white font-black text-sm shadow-[0_3px_0_#7F0000,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#7F0000] transition cursor-pointer"
              >
                C
              </button>
              <button
                onClick={() => inserirOperador("%")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FF9800] to-[#E68900] hover:from-[#FFA726] hover:to-[#F57C00] text-white font-black text-sm shadow-[0_3px_0_#B26A00,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                %
              </button>
              <button
                onClick={() => inserirOperador("/")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FF9800] to-[#E68900] hover:from-[#FFA726] hover:to-[#F57C00] text-white font-black text-sm shadow-[0_3px_0_#B26A00,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                ÷
              </button>
              <button
                onClick={() => inserirOperador("*")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FF9800] to-[#E68900] hover:from-[#FFA726] hover:to-[#F57C00] text-white font-black text-sm shadow-[0_3px_0_#B26A00,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                ×
              </button>

              {/* Linha 2 */}
              <button
                onClick={() => inserirNumero("7")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                7
              </button>
              <button
                onClick={() => inserirNumero("8")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                8
              </button>
              <button
                onClick={() => inserirNumero("9")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                9
              </button>
              <button
                onClick={() => inserirOperador("-")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FF9800] to-[#E68900] hover:from-[#FFA726] hover:to-[#F57C00] text-white font-black text-sm shadow-[0_3px_0_#B26A00,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                −
              </button>

              {/* Linha 3 */}
              <button
                onClick={() => inserirNumero("4")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                4
              </button>
              <button
                onClick={() => inserirNumero("5")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                5
              </button>
              <button
                onClick={() => inserirNumero("6")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                6
              </button>
              <button
                onClick={() => inserirOperador("+")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FF9800] to-[#E68900] hover:from-[#FFA726] hover:to-[#F57C00] text-white font-black text-sm shadow-[0_3px_0_#B26A00,0_4px_6px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                +
              </button>

              {/* Linha 4 + Botão Somar na Empresa */}
              <button
                onClick={() => inserirNumero("1")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                1
              </button>
              <button
                onClick={() => inserirNumero("2")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                2
              </button>
              <button
                onClick={() => inserirNumero("3")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                3
              </button>

              <button
                onClick={somarNaEmpresa}
                title="Acumular valor na empresa selecionada"
                className="row-span-2 rounded-lg bg-gradient-to-b from-[#2E7D32] via-[#256B29] to-[#1B5E20] hover:from-[#388E3C] hover:to-[#2E7D32] text-white font-black text-xs shadow-[0_4px_0_#0F3813,0_6px_10px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#0F3813] transition flex flex-col items-center justify-center gap-1 cursor-pointer border border-emerald-400/40 p-1.5"
              >
                <Plus className="w-4 h-4 text-emerald-200" />
                <span className="leading-tight text-center">Somar Empresa</span>
              </button>

              {/* Linha 5 */}
              <button
                onClick={() => inserirNumero("0")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                0
              </button>
              <button
                onClick={() => inserirNumero("00")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                00
              </button>
              <button
                onClick={() => inserirNumero(",")}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#4A3070] to-[#3A2560] hover:from-[#5A4080] hover:to-[#4A3570] text-white font-bold text-sm shadow-[0_3px_0_#2A1846,0_4px_6px_rgba(0,0,0,0.35)] active:translate-y-0.5 active:shadow-[0_1px_0_#2A1846] border border-white/10 transition cursor-pointer"
              >
                ,
              </button>
              <button
                onClick={() => calcularResultado()}
                className="py-2.5 rounded-lg bg-gradient-to-b from-[#FFD700] via-[#FFB800] to-[#FF9800] hover:brightness-110 text-slate-950 font-black text-lg shadow-[0_3px_0_#B26A00,0_5px_8px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-[0_1px_0_#B26A00] transition cursor-pointer"
              >
                =
              </button>
            </div>

            {/* Total Geral no Rodapé da Calculadora */}
            <div className="bg-gradient-to-r from-[#6A1B9A] via-[#7B1FA2] to-[#8E24AA] text-white p-3 rounded-xl mt-3.5 shadow-md flex items-center justify-between border border-purple-300/30">
              <div>
                <div className="text-[10px] text-purple-200 uppercase font-bold tracking-wider">
                  🏆 TOTAL GERAL (Todas Empresas):
                </div>
                <div className="text-lg sm:text-xl font-black font-mono mt-0.5">
                  {formatarMoeda(totalGeral)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                  {Object.keys(historicoPorEmpresa).length} empresas
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Histórico Discriminado por Empresa e Controles */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card de Resumo Acumulado por Empresa */}
          <div className="bg-white rounded-xl p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span>Acumulado por Empresa</span>
              </h3>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                {Object.keys(historicoPorEmpresa).length} Lançadas
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {Object.entries(historicoPorEmpresa).length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 italic">
                  Nenhuma soma registrada ainda. Selecione uma empresa e clique em "Somar na Empresa".
                </div>
              ) : (
                (Object.entries(historicoPorEmpresa) as [string, number][]).map(([emp, tot]) => {
                  const isSelecionada = emp === empresaAtual;
                  const percentual = totalGeral > 0 ? ((tot / totalGeral) * 100).toFixed(1) : "0.0";
                  return (
                    <div
                      key={emp}
                      onClick={() => setEmpresaAtual(emp)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                        isSelecionada
                          ? "bg-purple-50/80 border-purple-400/60 shadow-xs"
                          : "bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/60"
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {isSelecionada && <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />}
                          <span className="truncate">{emp}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {percentual}% do total
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-extrabold text-slate-900 text-sm">
                          {formatarMoeda(tot)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Ações Rápidas */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={zerarEmpresaAtual}
                disabled={!historicoPorEmpresa[empresaAtual]}
                className="flex-1 py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 border border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Zerar Selecionada</span>
              </button>

              <button
                onClick={() => setHistoricoPorEmpresa({})}
                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Tudo</span>
              </button>
            </div>
          </div>

          {/* Card Explicativo: Guia da Calculadora Contábil */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 rounded-xl p-5 border border-purple-200/70 shadow-xs">
            <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-2">
              💡 Como Funciona o Acumulador Contábil
            </h4>
            <ul className="space-y-2 text-xs text-purple-900/80 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">1.</span>
                <span><strong>Informe a empresa:</strong> use a empresa ativa cadastrada ou digite um nome para organizar este acumulado.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">2.</span>
                <span><strong>Faça contas com teclas compactas:</strong> Teclas otimizadas para agilidade em cálculos contábeis diários.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">3.</span>
                <span><strong>Botão "➕ Somar":</strong> adiciona o valor ao acumulado temporário da empresa informado.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-purple-600 font-bold">4.</span>
                <span><strong>Teclado Numérico:</strong> Suporta atalhos do teclado físico, Enter para igual e Esc para limpar.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};
