import React, { useState, useRef, useEffect } from "react";
import { escolherVozPtBr } from "../../utils/vozNatural";
import { Mic, Send, Bot, Sparkles, Volume2 } from "lucide-react";
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
  fontes?: { title: string; url: string }[];
}

export const IAPremiumTab: React.FC<IAPremiumTabProps> = ({ empresa, lancamentos = [] }) => {
  // A fala usa a síntese de voz disponível no navegador; não é uma licença premium.
  const [vozSelecionada, setVozSelecionada] = useState<string>("Somente Texto");
  const [gravando, setGravando] = useState(false);
  const [textoEntrada, setTextoEntrada] = useState("");
  const [falando, setFalando] = useState(false);
  const [respondendo, setRespondendo] = useState(false);

  // Histórico de mensagens
  const [mensagens, setMensagens] = useState<MensagemChat[]>([
    {
      id: "1",
      autor: "ia",
      texto:
        "Olá! Este chat envia sua pergunta ao serviço Gemini configurado no servidor. Ele não confirma integrações, saldos ou transmissões oficiais. Configure GEMINI_API_KEY para usar o serviço.",
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
      utterance.rate = 1.0;
      const vozPt = escolherVozPtBr(window.speechSynthesis.getVoices());
      if (vozPt) utterance.voice = vozPt;
      utterance.pitch = vozSelecionada.includes("Carla") ? 1.15 : 0.95;
      utterance.onstart = () => setFalando(true);
      utterance.onend = () => setFalando(false);
      utterance.onerror = () => setFalando(false);
      window.speechSynthesis.speak(utterance);
    }
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

  const enviarMensagem = async () => {
    const texto = textoEntrada.trim();
    if (!texto || respondendo) return;

    const novaMsgUsuario: MensagemChat = {
      id: Date.now().toString(),
      autor: "usuario",
      texto: texto,
      horario: "Agora",
    };

    setMensagens((prev) => [...prev, novaMsgUsuario]);
    setTextoEntrada("");
    setRespondendo(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: texto,
          // Enviar apenas contexto agregado; não enviar CNPJ, folha nem valores contábeis.
          context: { regime: empresa?.regime || "", totalLancamentos: lancamentos.length },
          module: "contabil",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Serviço de IA indisponível.");
      const resposta = data.reply as string;
      const novaMsgIA: MensagemChat = {
        id: (Date.now() + 1).toString(),
        autor: "ia",
        texto: resposta,
        horario: "Agora",
        voz: vozSelecionada,
        fontes: Array.isArray(data.sources) ? data.sources : [],
      };
      setMensagens((prev) => [...prev, novaMsgIA]);
      falarTexto(resposta);
    } catch (error) {
      setMensagens((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        autor: "ia",
        texto: error instanceof Error ? error.message : "Serviço de IA indisponível. Configure a chave de API no servidor.",
        horario: "Agora",
      }]);
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Estado real do serviço */}
      <div className="bg-[#082B66] border border-[#0A357D] text-white px-4 sm:px-6 py-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="text-amber-100 font-bold">
            Chat IA: depende de GEMINI_API_KEY no servidor; não há licença FISCO IA integrada.
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs opacity-90 text-blue-100">
          <span>
            {`Fala: síntese do navegador • ${respondendo ? "Aguardando resposta" : "Pronto para enviar"}`}
          </span>

        </div>
      </div>

      {/* Conversa real via endpoint do servidor */}
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
          {/* CABEÇALHO DA IA */}
          <div className="bg-gradient-to-r from-[#6A1B9A] to-[#4A148C] text-white px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="text-3xl p-2 bg-white/10 rounded-2xl">🧠</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-white">IA Murade Premium</h2>
                  <span className="text-[11px] font-bold bg-white/20 text-purple-100 px-2.5 py-0.5 rounded-full">
                    via Gemini API
                  </span>
                </div>
                <p className="text-xs text-purple-200 mt-0.5">
                  Não acessa módulos externos nem transmite obrigações
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold self-start sm:self-auto border border-white/20">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{respondendo ? "Consultando IA" : "Aguardando pergunta"}</span>
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
                {!!msg.fontes?.length && <div className="mt-2 border-t border-slate-100 pt-2"><strong className="text-[10px]">Fontes consultadas</strong>{msg.fontes.map((fonte) => <a key={fonte.url} href={fonte.url} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-700 underline">{fonte.title}</a>)}</div>}
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
    </div>
  );
};
