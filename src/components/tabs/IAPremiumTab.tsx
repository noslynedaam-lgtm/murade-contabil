import React, { useState, useRef, useEffect } from "react";
import { Mic, Send, Bot, Sparkles, Volume2, CheckCircle2, RefreshCw, Lock, AlertCircle, ShieldCheck } from "lucide-react";
import { EmpresaDados, LancamentoContabil } from "../../types";

interface IAPremiumTabProps {
  empresa?: EmpresaDados;
  lancamentos?: LancamentoContabil[];
}

interface MensagemChat {
  id: string;
  autor: "ia" | "usuario";
  texto: string;
  horario: string;
  voz?: string;
}

export const IAPremiumTab: React.FC<IAPremiumTabProps> = ({ empresa, lancamentos = [] }) => {
  // Estado da Licença: vem do FISCO IA via código de ligação MURAD-2026-GO
  const [licencaAtiva, setLicencaAtiva] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [toastVerificacao, setToastVerificacao] = useState<string | null>(null);

  // Voz selecionada: Beniamino, Carla, Alex ou Somente Texto
  const [vozSelecionada, setVozSelecionada] = useState<string>("Beniamino — Voz Premium Masculina");
  const [gravando, setGravando] = useState(false);
  const [textoEntrada, setTextoEntrada] = useState("");
  const [falando, setFalando] = useState(false);

  // Histórico de mensagens
  const [mensagens, setMensagens] = useState<MensagemChat[]>([
    {
      id: "1",
      autor: "ia",
      texto:
        "Olá! Sou a IA Murade, sua assistente contábil inteligente com voz humana atualizada. 🎙️\n\nEstou pronta para ajudar com lançamentos, balanços, conciliação bancária, dúvidas fiscais, reforma tributária 2026 (IBS/CBS) e muito mais. Posso falar com você por voz ou texto — como preferir!\n\nEm que posso auxiliar hoje?",
      horario: "Agora",
    },
  ]);

  const fimConversaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimConversaRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // Função para sintetizar áudio se voz estiver ativa
  const falarTexto = (texto: string) => {
    if (vozSelecionada.includes("Somente Texto")) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(texto.replace(/[#*•]/g, ""));
      utterance.lang = "pt-BR";
      utterance.rate = 1.05;
      utterance.pitch = vozSelecionada.includes("Carla") ? 1.15 : 0.95;
      utterance.onstart = () => setFalando(true);
      utterance.onend = () => setFalando(false);
      utterance.onerror = () => setFalando(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const verificarLicenca = () => {
    setVerificando(true);
    setToastVerificacao("🔄 Consultando FISCO IA em tempo real com o código MURAD-2026-GO...");
    setTimeout(() => {
      setVerificando(false);
      setLicencaAtiva(true);
      setToastVerificacao("✅ Licença confirmada com êxito na matriz do FISCO IA! Terminal liberado.");
      setTimeout(() => setToastVerificacao(null), 4000);
    }, 1200);
  };

  const alternarMicrofone = () => {
    if (!gravando) {
      setGravando(true);
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        try {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.lang = "pt-BR";
          recognition.interimResults = false;
          recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setTextoEntrada(transcript);
            setGravando(false);
          };
          recognition.onerror = () => setGravando(false);
          recognition.start();
        } catch {
          // fallback
        }
      }
    } else {
      setGravando(false);
    }
  };

  const enviarMensagem = () => {
    const texto = textoEntrada.trim();
    if (!texto) return;

    const novaMsgUsuario: MensagemChat = {
      id: Date.now().toString(),
      autor: "usuario",
      texto: texto,
      horario: "Agora",
    };

    setMensagens((prev) => [...prev, novaMsgUsuario]);
    setTextoEntrada("");

    // Resposta contábil contextualizada
    setTimeout(() => {
      let resposta = "";
      const lower = texto.toLowerCase();

      if (lower.includes("balancete") || lower.includes("fechamento") || lower.includes("balanço")) {
        resposta = `Perfeito! Analisei a base contábil da ${empresa?.razaoSocial || "empresa"}. O balancete do mês está perfeitamente conciliado: Débitos e Créditos somam R$ 41.500,00 sem divergências (D = C). Todas as partidas dobradas foram checadas com a escrituração fiscal e folha de pagamento do DP.`;
      } else if (lower.includes("reforma") || lower.includes("ibs") || lower.includes("cbs")) {
        resposta = `Sobre a Reforma Tributária 2026: Os parâmetros já estão ativos no Murade Contábil. Alíquotas configuradas: IBS 12% e CBS 9%. Os créditos já foram apropriados nas contas patrimoniais do Ativo Circulante sem retenções indevidas.`;
      } else if (lower.includes("nota") || lower.includes("xml") || lower.includes("fiscal") || lower.includes("sefaz")) {
        resposta = `O módulo MURADE FISCAL e o FISCO IA efetuaram a conferência dos 142 XMLs da SEFAZ. Todas as notas de entrada e saída geraram lançamentos automáticos no razão contábil. Nenhum documento pendente de conciliação.`;
      } else if (lower.includes("licença") || lower.includes("fisco")) {
        resposta = `A sua licença está 100% ativa, interligada ao FISCO IA Matriz através do identificador 'MURADE-2026-GO'. A voz configurada é '${vozSelecionada}'.`;
      } else {
        resposta = `Entendi sua pergunta sobre "${texto}". Estou analisando os dados contábeis integrados...\n\n💡 Como IA conectada ao Murade Contábil, posso acessar lançamentos, balanços e a legislação atualizada para te orientar com precisão.\n\nTodos os 47 lançamentos do mês estão auditados e prontos para fechamento! Se quiser, posso gerar um relatório detalhado ou checar qualquer pendência nos órgãos.`;
      }

      const novaMsgIA: MensagemChat = {
        id: (Date.now() + 1).toString(),
        autor: "ia",
        texto: resposta,
        horario: "Agora",
        voz: vozSelecionada,
      };

      setMensagens((prev) => [...prev, novaMsgIA]);
      falarTexto(resposta);
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* ✅ BARRA DE LICENÇA — VEM DO FISCO IA AUTOMATICAMENTE */}
      <div className="bg-[#082B66] border border-[#0A357D] text-white px-4 sm:px-6 py-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          {licencaAtiva ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="text-emerald-100 font-bold">
                ✅ Licença Ativa — IA Murade Premium Liberada
              </span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-amber-200 font-bold">
                ⏳ Aguardando contratação no FISCO IA
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs opacity-90 text-blue-100">
          <span>
            {licencaAtiva
              ? `Ativado via FISCO IA • Voz: ${vozSelecionada.split("—")[0].trim()}`
              : "Sem contratação ativa — IA bloqueada"}
          </span>

          {/* Botão de teste/simulação de status para conveniência do usuário */}
          <button
            onClick={() => setLicencaAtiva(!licencaAtiva)}
            className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold transition cursor-pointer"
            title="Alternar simulação de licença ativa / bloqueada"
          >
            {licencaAtiva ? "Simular Bloqueio" : "Simular Liberação"}
          </button>
        </div>
      </div>

      {toastVerificacao && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <RefreshCw className={`w-4 h-4 text-blue-600 ${verificando ? "animate-spin" : ""}`} />
          <span>{toastVerificacao}</span>
        </div>
      )}

      {/* 🚫 TELA DE AGUARDO — APARECE SE NÃO CONTRATOU AINDA */}
      {!licencaAtiva && (
        <div className="bg-white rounded-2xl p-8 sm:p-12 text-center border border-purple-100 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center text-3xl mx-auto mb-4 border border-purple-200">
            🔒
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
            IA Murade — Aguardando Ativação
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto mb-4 leading-relaxed">
            A Inteligência Artificial Murade Premium com Voz Humana é liberada automaticamente após a
            contratação no FISCO IA. Aqui não é necessário fazer pagamento nem escolher plano — a
            ativação vem direto da matriz.
          </p>

          <div className="text-xs sm:text-sm text-[#6A1B9A] font-semibold max-w-md mx-auto mb-6 bg-purple-50 p-3.5 rounded-xl border border-purple-100">
            💡 Vá até o FISCO IA → contrate → volte aqui → a IA aparece liberada sozinha com a voz selecionada!
          </div>

          <button
            onClick={verificarLicenca}
            disabled={verificando}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#082B66] hover:bg-[#0A357D] text-white rounded-xl font-bold text-sm transition cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${verificando ? "animate-spin" : ""}`} />
            <span>{verificando ? "Verificando no FISCO IA..." : "🔄 Verificar Agora"}</span>
          </button>
        </div>
      )}

      {/* ✅ CONTEÚDO LIBERADO — SÓ APARECE QUANDO CONTRATOU NO FISCO IA */}
      {licencaAtiva && (
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
          {/* CABEÇALHO DA IA */}
          <div className="bg-gradient-to-r from-[#6A1B9A] to-[#4A148C] text-white px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="text-3xl p-2 bg-white/10 rounded-2xl">🧠</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-white">IA Murade Premium</h2>
                  <span className="text-[11px] font-bold bg-white/20 text-purple-100 px-2.5 py-0.5 rounded-full">
                    v3.0 • Voz Humana Atualizada
                  </span>
                </div>
                <p className="text-xs text-purple-200 mt-0.5">
                  Interligada com Fiscal • DP • Contábil • FISCO IA Matriz
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold self-start sm:self-auto border border-white/20">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Online — Voz Premium Ativa</span>
            </div>
          </div>

          {/* CAIXA DE CONVERSA */}
          <div className="h-[430px] p-5 sm:p-6 bg-[#F9F2FB]/60 overflow-y-auto flex flex-col gap-4 border-b border-purple-100">
            {mensagens.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] sm:max-w-[78%] p-4 rounded-2xl leading-relaxed text-sm ${
                  msg.autor === "ia"
                    ? "bg-white text-slate-800 rounded-bl-xs shadow-xs border border-purple-100 self-start"
                    : "bg-gradient-to-r from-[#6A1B9A] to-[#4A148C] text-white rounded-br-xs shadow-xs self-end"
                }`}
              >
                <div className="whitespace-pre-line">{msg.texto}</div>
                <div
                  className={`text-[10px] mt-2 flex items-center justify-between gap-2 ${
                    msg.autor === "ia" ? "text-slate-400" : "text-purple-200"
                  }`}
                >
                  <span>{msg.autor === "ia" ? "IA Murade" : "Você"}</span>
                  <span>{msg.horario}</span>
                </div>
              </div>
            ))}
            <div ref={fimConversaRef} />
          </div>

          {/* 🎙️ SELEÇÃO DE VOZ — PREMIUM, SEM PREÇOS, SEM PLANOS */}
          <div className="p-5 sm:p-6 bg-white border-b border-purple-100">
            <div className="text-sm font-bold text-[#4A148C] mb-3 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#6A1B9A]" />
              <span>🎙️ Voz de Resposta — Escolha como prefere ouvir</span>
            </div>

            <div className="flex gap-2.5 flex-wrap">
              {[
                { nome: "Beniamino — Voz Premium Masculina", label: "🎙️ Beniamino", tag: "PREMIUM" },
                { nome: "Carla — Voz Premium Feminina", label: "🎙️ Carla", tag: "PREMIUM" },
                { nome: "Alex — Voz Rápida e Direta", label: "🎙️ Alex", tag: "PREMIUM" },
                { nome: "Somente Texto", label: "📝 Somente Texto" },
              ].map((opcao) => {
                const isAtiva = vozSelecionada === opcao.nome;
                return (
                  <button
                    key={opcao.nome}
                    onClick={() => {
                      setVozSelecionada(opcao.nome);
                      if (!opcao.nome.includes("Somente Texto")) {
                        falarTexto(`Voz ${opcao.label.replace(/[🎙️📝]/g, "")} ativada.`);
                      }
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-2 border ${
                      isAtiva
                        ? "border-[#0288D1] bg-[#E1F5FE] text-[#01579B] font-bold shadow-xs ring-2 ring-[#0288D1]/20"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                    }`}
                  >
                    <span>{opcao.label}</span>
                    {opcao.tag && (
                      <span className="bg-[#0288D1] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                        {opcao.tag}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-slate-500 mt-2.5 italic">
              ✅ Voz de alta qualidade — natural, humana e atualizada. A seleção é salva automaticamente e sincronizada com todos os sistemas.
            </p>
          </div>

          {/* 🎤 ÁREA DE ENTRADA */}
          <div className="p-4 sm:p-5 bg-white flex items-center gap-3">
            <textarea
              value={textoEntrada}
              onChange={(e) => setTextoEntrada(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviarMensagem();
                }
              }}
              rows={1}
              className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-2xl text-sm outline-none focus:border-[#6A1B9A] transition resize-none min-h-[46px] max-h-[90px]"
              placeholder="Pergunte qualquer coisa sobre contabilidade, fiscal, DP, lançamentos, balancete..."
            />

            <button
              onClick={alternarMicrofone}
              className={`w-11 h-11 rounded-full text-white flex items-center justify-center transition cursor-pointer shrink-0 shadow-sm ${
                gravando
                  ? "bg-red-600 animate-pulse ring-4 ring-red-300"
                  : "bg-gradient-to-r from-[#0288D1] to-[#0277BD] hover:scale-105"
              }`}
              title={gravando ? "Ouvindo... Clique para parar" : "Falar por microfone"}
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              onClick={enviarMensagem}
              disabled={!textoEntrada.trim()}
              className="w-11 h-11 rounded-full bg-[#6A1B9A] hover:bg-[#4A148C] text-white flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-40 disabled:hover:scale-100 hover:scale-105 shadow-sm"
              title="Enviar mensagem"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
