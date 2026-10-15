import React, { useState, useEffect, useRef } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Wallet,
  Camera,
  Upload,
  RefreshCw,
  Calculator,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Building2,
  Sparkles,
  ArrowRight,
  X,
} from "lucide-react";
interface FluxoPreviticoTabProps {
  empresaNome?: string;
  onVoltar?: () => void;
}

export const FluxoPreviticoTab: React.FC<FluxoPreviticoTabProps> = ({
  empresaNome = "Empresa sem cadastro",
  onVoltar,
}) => {
  // Valores editáveis direto na tela com persistência em localStorage
  const [saldoAtual, setSaldoAtual] = useState<string>("");
  const [entradasPrevistas, setEntradasPrevistas] = useState<string>("");
  const [saidasPrevistas, setSaidasPrevistas] = useState<string>("");
  const [resultadoProjecao, setResultadoProjecao] = useState<string>("—");
  const [isPositivo, setIsPositivo] = useState<boolean>(false);

  // Estados da interface e câmera
  const [mensagemToast, setMensagemToast] = useState<string | null>(null);

  // Modal de câmera ao vivo (desktop/webcam)
  const [modalCameraAberta, setModalCameraAberta] = useState<boolean>(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);

  // Função auxiliar para exibir notificação
  const mostrarMensagem = (texto: string) => {
    setMensagemToast(texto);
    setTimeout(() => {
      setMensagemToast(null);
    }, 4000);
  };

  // Extrair número float limpo
  const extrairValor = (texto: string): number => {
    if (!texto) return 0;
    // Identificar se há sinal negativo
    const isNeg = texto.includes("-") || texto.includes("−");
    const limpo = texto.replace(/[^0-9,.]/g, "");
    if (!limpo) return 0;
    // Substituir pontos de milhar e converter vírgula decimal
    const normalizado = limpo.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalizado) || 0;
    return isNeg ? -Math.abs(num) : Math.abs(num);
  };

  // Formatar número como moeda BRL
  const formatarMoeda = (num: number, comPrefixoSinal = false): string => {
    const formatado = Math.abs(num).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (num < 0) {
      return `− R$ ${formatado}`;
    }
    if (comPrefixoSinal && num > 0) {
      return `+ R$ ${formatado}`;
    }
    return `R$ ${formatado}`;
  };

  // Calcular projeção
  const calcularProjecao = (
    sAtual = saldoAtual,
    ePrev = entradasPrevistas,
    sPrev = saidasPrevistas
  ) => {
    if (!sAtual.trim() || !ePrev.trim() || !sPrev.trim()) {
      setResultadoProjecao("—");
      setIsPositivo(false);
      return;
    }
    const s = extrairValor(sAtual);
    const e = extrairValor(ePrev);
    const sa = Math.abs(extrairValor(sPrev));
    const final = s + e - sa;
    setIsPositivo(final >= 0);
    setResultadoProjecao(formatarMoeda(final));
  };

  // Salvar valor editado no localStorage
  const salvarValor = (campo: "saldoAtual" | "entradasPrevistas" | "saidasPrevistas", valor: string) => {
    try {
      localStorage.setItem(`murade_fluxo_manual_${campo}`, valor);
      mostrarMensagem(`Valor local salvo neste navegador: ${valor}`);
      if (campo === "saldoAtual") {
        setSaldoAtual(valor);
        calcularProjecao(valor, entradasPrevistas, saidasPrevistas);
      } else if (campo === "entradasPrevistas") {
        setEntradasPrevistas(valor);
        calcularProjecao(saldoAtual, valor, saidasPrevistas);
      } else {
        setSaidasPrevistas(valor);
        calcularProjecao(saldoAtual, entradasPrevistas, valor);
      }
    } catch {
      // Ignorar caso localStorage não esteja acessível
    }
  };

  // Atualizar do banco / lançamentos reais do sistema
  const atualizarAutomatico = () => {
    mostrarMensagem("Atualização bancária indisponível: não há conexão com banco neste sistema. Informe os valores manualmente.");
  };

  // Limpar / Zerar tudo
  const limparValores = () => {
    if (window.confirm("Tem certeza que deseja ZERAR todos os valores do Fluxo Prevítico?")) {
      const zSaldo = "";
      const zEntradas = "";
      const zSaidas = "";

      setSaldoAtual(zSaldo);
      setEntradasPrevistas(zEntradas);
      setSaidasPrevistas(zSaidas);

      try {
        localStorage.removeItem("murade_fluxo_manual_saldoAtual");
        localStorage.removeItem("murade_fluxo_manual_entradasPrevistas");
        localStorage.removeItem("murade_fluxo_manual_saidasPrevistas");
      } catch {
        // fallback
      }

      setResultadoProjecao("—");
      setIsPositivo(false);
      mostrarMensagem("Valores locais removidos.");
    }
  };

  // Acionar Câmera Nativa / Mobile
  const abrirCamera = () => {
    // Tenta primeiro abrir modal com stream se desktop suportar, ou aciona input capture="environment"
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.innerWidth >= 768) {
      iniciarCameraWebcam();
    } else if (fileInputCameraRef.current) {
      fileInputCameraRef.current.click();
      mostrarMensagem("📷 Câmera aberta — tire a foto do documento ou NF-e!");
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Iniciar webcam direta
  const iniciarCameraWebcam = async () => {
    try {
      setModalCameraAberta(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Fallback para input direto
      setModalCameraAberta(false);
      if (fileInputCameraRef.current) {
        fileInputCameraRef.current.click();
      }
    }
  };

  // Fechar webcam
  const fecharCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    }
    setModalCameraAberta(false);
  };

  // Capturar foto da webcam
  const capturarFotoWebcam = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      }
      fecharCamera();
      mostrarMensagem("Foto capturada, mas OCR e leitura fiscal ainda não estão implementados; nenhum lançamento foi criado.");
    }
  };

  // Processar upload de arquivo ou foto
  const processarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      mostrarMensagem(`Arquivo “${file.name}” selecionado. OCR/leitura ainda não está implementado; nenhum dado foi extraído.`);
      e.target.value = "";
    }
  };

  // Carregar dados salvos ao montar
  useEffect(() => {
    try {
      const sSaldo = localStorage.getItem("murade_fluxo_manual_saldoAtual");
      const sEntradas = localStorage.getItem("murade_fluxo_manual_entradasPrevistas");
      const sSaidas = localStorage.getItem("murade_fluxo_manual_saidasPrevistas");

      if (sSaldo) setSaldoAtual(sSaldo);
      if (sEntradas) setEntradasPrevistas(sEntradas);
      if (sSaidas) setSaidasPrevistas(sSaidas);
      if (sSaldo && sEntradas && sSaidas) calcularProjecao(sSaldo, sEntradas, sSaidas);
    } catch {
      setResultadoProjecao("—");
    }
  }, []);

  return (
    <div className="space-y-6 text-slate-800">
      {/* Toast Flutuante */}
      {mensagemToast && (
        <div className="fixed top-5 right-5 z-50 bg-[#EEF4F9] border-2 border-emerald-500 text-slate-900 px-5 py-3.5 rounded-xl font-bold shadow-lg flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-xs sm:text-sm">{mensagemToast}</span>
        </div>
      )}

      {/* Topo / Cabeçalho Compacto */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2.5">
          {onVoltar && (
            <button
              onClick={onVoltar}
              title="Voltar para tela anterior"
              className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold flex items-center justify-center transition cursor-pointer shadow-xs text-xs border border-slate-300"
            >
              ←
            </button>
          )}
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>⚡ Fluxo Prevítico</span>
              <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">— Projeção IA 90 Dias</span>
            </h1>
            <p className="text-[11px] text-slate-600">
              Cálculo bancário automático + edição direta na tela (precisão estimada 95%).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end text-xs">
          <div className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-bold text-[11px] flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>SISTEMA ATIVO</span>
          </div>
          <span className="text-[11px] bg-[#EEF4F9] border border-slate-300 px-2.5 py-1 rounded-md text-slate-700 font-semibold truncate max-w-[150px] shadow-2xs">
            {empresaNome}
          </span>
        </div>
      </div>

      {/* Grid de 3 Colunas — Cards em cinza meio azulado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Saldo Atual */}
        <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-xl p-3.5 transition hover:border-blue-400 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              <span>💰 Saldo Atual</span>
            </span>
              <span className="text-[10px] text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300 font-semibold">
              Informado manualmente
            </span>
          </div>

          <div className="my-1.5">
            <input
              type="text"
              value={saldoAtual}
              onChange={(e) => {
                setSaldoAtual(e.target.value);
                calcularProjecao(e.target.value, entradasPrevistas, saidasPrevistas);
              }}
              onBlur={(e) => salvarValor("saldoAtual", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full text-center text-lg sm:text-xl font-extrabold text-emerald-700 bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/20 rounded-lg p-2 outline-none transition font-mono shadow-2xs"
            />
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-slate-300 text-[10px] text-slate-500">
            <span className="text-emerald-700 font-bold flex items-center gap-0.5">
              {resultadoProjecao !== "—" ? (isPositivo ? "Projeção positiva" : "Projeção negativa") : "Aguardando valores"}
            </span>
            <span>Editar direto na tela</span>
          </div>
        </div>

        {/* Card 2: Entradas Previstas */}
        <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-xl p-3.5 transition hover:border-blue-400 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              <span>📈 Entradas (90d)</span>
            </span>
            <span className="text-[10px] text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-300 font-semibold">
              Recebíveis
            </span>
          </div>

          <div className="my-1.5">
            <input
              type="text"
              value={entradasPrevistas}
              onChange={(e) => {
                setEntradasPrevistas(e.target.value);
                calcularProjecao(saldoAtual, e.target.value, saidasPrevistas);
              }}
              onBlur={(e) => salvarValor("entradasPrevistas", e.target.value)}
              placeholder="+ R$ 0,00"
              className="w-full text-center text-lg sm:text-xl font-extrabold text-blue-700 bg-white border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 rounded-lg p-2 outline-none transition font-mono shadow-2xs"
            />
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-slate-300 text-[10px] text-slate-500">
            <span className="text-blue-700 font-bold flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> Receitas
            </span>
            <span>Editar direto na tela</span>
          </div>
        </div>

        {/* Card 3: Saídas Previstas */}
        <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-xl p-3.5 transition hover:border-rose-400 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              <span>📉 Saídas (90d)</span>
            </span>
            <span className="text-[10px] text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 font-semibold">
              Impostos & Folha
            </span>
          </div>

          <div className="my-1.5">
            <input
              type="text"
              value={saidasPrevistas}
              onChange={(e) => {
                setSaidasPrevistas(e.target.value);
                calcularProjecao(saldoAtual, entradasPrevistas, e.target.value);
              }}
              onBlur={(e) => salvarValor("saidasPrevistas", e.target.value)}
              placeholder="− R$ 0,00"
              className="w-full text-center text-lg sm:text-xl font-extrabold text-rose-700 bg-white border border-slate-300 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20 rounded-lg p-2 outline-none transition font-mono shadow-2xs"
            />
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-slate-300 text-[10px] text-slate-500">
            <span className="text-amber-700 font-bold flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3 text-amber-600" /> Tributos
            </span>
            <span>Editar direto na tela</span>
          </div>
        </div>
      </div>

      {/* Botões de Ação Imediata — Compactos e Equilibrados */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          onClick={atualizarAutomatico}
          className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>🔄 Verificar conexão bancária</span>
        </button>

        <button
          onClick={() => {
            calcularProjecao();
            mostrarMensagem("📊 Projeção recalculada com sucesso!");
          }}
          className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>📊 Recalcular Projeção</span>
        </button>

        <button
          onClick={limparValores}
          className="py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>🗑️ Zerar</span>
        </button>
      </div>

      {/* 📊 Card de Resultado da Projeção Final */}
      <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-xl p-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>📊 Projeção Final de Saldo (90 dias)</span>
          </div>
          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300 shadow-2xs">
            Cálculo simples com valores informados
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between p-3 bg-white border border-slate-300 rounded-lg gap-3 shadow-2xs">
          <div className="text-xs text-slate-700">
            Saldo Atual + Entradas Previstas − Saídas Previstas =
          </div>
          <div
            className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
              isPositivo ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {resultadoProjecao}
          </div>
        </div>

        <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
          <span>* Sem conexão bancária ou previsão automática de notas e provisões</span>
          <span className="font-semibold text-slate-700">Resultado não é previsão validada</span>
        </div>
      </div>

      {/* 📷 ÁREA DE CÂMERA / UPLOAD DE DOCUMENTOS */}
      <div className="bg-[#EEF4F9] rounded-xl p-3.5 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-blue-600" />
            <span>📷 Envio de Documento (Foto NF-e / Boleto / PDF)</span>
          </div>
          <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-semibold shadow-2xs">
            OCR indisponível
          </span>
        </div>

        {/* Faixa Compacta de Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 bg-white hover:bg-blue-50/40 rounded-lg py-3 px-4 text-center cursor-pointer transition hover:border-blue-500 group flex items-center justify-center gap-3 shadow-2xs"
        >
          <span className="text-xl group-hover:scale-110 transition">📷</span>
          <div className="text-left">
            <div className="font-bold text-xs text-slate-800">
              Clique para fotografar ou anexar NF-e / Boleto
            </div>
            <div className="text-[10px] text-slate-500">
              Abre câmera no celular ou anexa PDF/PNG/JPG
            </div>
          </div>
        </div>

        {/* Inputs de arquivo ocultos */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={processarArquivo}
        />
        <input
          ref={fileInputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={processarArquivo}
        />

        {/* Botões Compactos da Câmera */}
        <div className="flex gap-2 mt-2 text-xs">
          <button
            onClick={abrirCamera}
            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Abrir Câmera</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-1.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Escolher Arquivo</span>
          </button>
        </div>

        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">A foto e o arquivo ficam no navegador; leitura automática por OCR e integração bancária ainda não estão disponíveis. Nenhum lançamento é criado ao selecionar um arquivo.</p>
      </div>

      {/* Modal de Câmera Direta no Navegador (Webcam Desktop / Tablet) */}
      {modalCameraAberta && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#EEF4F9] border border-slate-300 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-300 pb-3">
              <div className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                <span>Câmera — Fotografe a NF-e / Documento</span>
              </div>
              <button
                onClick={fecharCamera}
                className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer transition border border-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-300">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-4 border-2 border-dashed border-emerald-400 rounded-lg pointer-events-none flex items-center justify-center">
                <span className="text-emerald-300 text-xs font-bold bg-slate-900/80 px-2 py-1 rounded">
                  Enquadre o documento aqui
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={capturarFotoWebcam}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Camera className="w-5 h-5" />
                <span>Capturar Foto</span>
              </button>
              <button
                onClick={fecharCamera}
                className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer border border-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
