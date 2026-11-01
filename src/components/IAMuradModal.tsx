import React, { useState, useEffect, useRef } from "react";
import { escolherVozPtBr } from "../utils/vozNatural";
import { Mic, MicOff, Volume2, VolumeX, Send, Bot, Sparkles, X, RotateCcw } from "lucide-react";
import { AcaoAgenteCartao, ChatMessage, EmpresaDados, LancamentoContabil } from "../types";

interface IAMuradModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  empresa: EmpresaDados;
  lancamentos: LancamentoContabil[];
}

const textoParaFala = (t: string): string => String(t || '')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
  .replace(/https?:\/\/\S+/g, 'o link na tela')
  .replace(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g, '$1, $2, $3, $4, $5')
  .replace(/\b(\d{3})\.(\d{3})\.(\d{3})-(\d{2})\b/g, '$1, $2, $3, $4')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
  .replace(/^\s*[-*•]\s+/gm, '')
  .replace(/[*_`#>|~]/g, ' ')
  .replace(/\s*\n+\s*/g, '. ')
  .replace(/\s{2,}/g, ' ')
  .trim();
const textoSemMarcas = (t: string): string => String(t || '')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
  .replace(/[*_`#>|~]/g, '')
  .replace(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/gu, '')
  .trim();
const limparTextoVoz = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const COMANDO_PARAR = /^(para|pare|parar|espera|espere|calma|silencio|cancela|cancelar|chega)( ja| agora| ai| por favor)?$/;

export const IAMuradModal: React.FC<IAMuradModalProps> = ({
  isOpen,
  onClose,
  onOpen,
  empresa,
  lancamentos,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-0",
      sender: "ia",
      text: "Olá, quem fala é o Murade Contábil. O que você deseja? Sou sua inteligência tributária e contábil. Posso analisar balancetes, explicar lançamentos de partidas dobradas, orientar sobre o IBS e CBS da Reforma Tributária 2026 ou auditar suas transmissões para a Receita e SEFAZ. Como posso ajudar agora?",
      timestamp: "Agora",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [vozAtiva, setVozAtiva] = useState(true);
  const [gravandoVoz, setGravandoVoz] = useState(false);
  const [falando, setFalando] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  // Chamada por voz: basta falar "Contábil" e pedir. A janela só abre quando há algo para confirmar.
  const [chamadaPorVoz, setChamadaPorVoz] = useState<boolean>(() => {
    try { return localStorage.getItem("murade_chamada_voz") !== "0"; } catch { return false; }
  });
  const [avisoVoz, setAvisoVoz] = useState("");
  const tempoAvisoRef = useRef<number | undefined>(undefined);
  const chamadaRef = useRef<any>(null);
  const aguardandoComandoRef = useRef(false);
  const ultimaFalaRef = useRef(0);
  const textoFaladoRef = useRef("");
  const geracaoRef = useRef(0);
  const janelaConversaRef = useRef(0);
  const pararRef = useRef<() => void>(() => {});
  const falandoRef = useRef(false);
  const enviarRef = useRef<(t: string) => void>(() => {});
  const falarRef = useRef<(t: string) => void>(() => {});
  const mostrarAviso = (texto: string) => {
    const limpo = textoSemMarcas(texto);
    setAvisoVoz(limpo.length > 420 ? `${limpo.slice(0, 417)}…` : limpo);
    window.clearTimeout(tempoAvisoRef.current);
    tempoAvisoRef.current = window.setTimeout(() => setAvisoVoz(""), 14000);
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Sintetizador de voz natural em português
  const falarTexto = (texto: string) => {
    if (!vozAtiva || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel(); // Para falas anteriores
    textoFaladoRef.current = limparTextoVoz(textoParaFala(texto));
    const utterance = new SpeechSynthesisUtterance(textoParaFala(texto));
    utterance.lang = "pt-BR";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Tentar selecionar voz brasileira natural
    const ptVoice = escolherVozPtBr(window.speechSynthesis.getVoices());
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    utterance.onstart = () => { falandoRef.current = true; setFalando(true); };
    utterance.onend = () => { falandoRef.current = false; ultimaFalaRef.current = Date.now(); janelaConversaRef.current = Date.now() + 20000; setFalando(false); };
    utterance.onerror = () => { falandoRef.current = false; setFalando(false); };

    window.speechSynthesis.speak(utterance);
  };

  // Reconhecimento de voz por microfone
  const toggleGravacao = () => {
    if (gravandoVoz) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setGravandoVoz(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Seu navegador não possui suporte nativo à gravação de voz contínua. Você pode digitar sua pergunta abaixo!");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setGravandoVoz(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setGravandoVoz(false);
        enviarMensagem(transcript);
      };
      recognition.onerror = () => setGravandoVoz(false);
      recognition.onend = () => setGravandoVoz(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setGravandoVoz(false);
    }
  };

  const enviarMensagem = async (textoEnviar?: string) => {
    const texto = (textoEnviar || input).trim();
    if (!texto || loading) return;
    const minhaGeracao = geracaoRef.current;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: texto,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const historico = messages
        .filter((m) => m.id !== "msg-0")
        .slice(-10)
        .map((m) => ({ papel: m.sender === "user" ? "usuario" : "ia", texto: m.text }));
      // Dúvidas (perguntas) vão direto para a resposta rápida; pedidos de ação passam pela agente.
      const ehDuvida = /^(como|o que|oque|qual|quais|quando|por que|porque|explique|me explique|me fale|fale sobre)\b/i.test(texto) && !/\b(lance|lancar|emita|gere|gerar|cadastre|exclua|apague|crie|importe|feche|transmita|envie)\b/i.test(texto);
      let res: Response = new Response(null, { status: 204 });
      let data: any = {};
      if (!ehDuvida) {
        res = await fetch("/api/ai/agente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ message: texto, historico }),
          signal: AbortSignal.timeout(25_000),
        });
        data = await res.json().catch(() => ({}));
      }
      let respostaTexto: string = data.resposta;
      let acoes: AcaoAgenteCartao[] = [];
      if (res.ok && !ehDuvida && typeof respostaTexto === "string" && respostaTexto.trim()) {
        acoes = Array.isArray(data.acoes)
          ? data.acoes
              .filter((a: any) => a && typeof a.id === "string" && typeof a.titulo === "string")
              .map((a: any) => ({ id: a.id, titulo: a.titulo, descricao: Array.isArray(a.descricao) ? a.descricao.map(String) : [], aviso: typeof a.aviso === "string" ? a.aviso : null, irreversivel: a.irreversivel === true, estado: "pendente" as const }))
          : [];
      } else if (res.status === 401 || res.status === 429) {
        throw new Error(data.error || "Não foi possível usar a agente agora.");
      } else {
        // Agente indisponível (ex.: sem chave de IA): mantém a pesquisa de dúvidas como antes.
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ message: texto, context: { regime: empresa.regime, totalLancamentos: lancamentos.length }, module: "contabil" }),
          signal: AbortSignal.timeout(30_000),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Serviço de IA indisponível.");
        respostaTexto = data.reply;
      }

      const iaMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "ia",
        text: respostaTexto,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: Array.isArray(data.sources) ? data.sources : [],
        acoes,
      };

      setMessages((prev) => [...prev, iaMsg]);
      if (minhaGeracao !== geracaoRef.current) return;
      falarTexto(respostaTexto);
      mostrarAviso(respostaTexto);
      if (acoes.length) onOpen?.();
    } catch (err) {
      const erroMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "ia",
        text: err instanceof Error ? err.message : "Serviço de IA indisponível. Confira a configuração do servidor.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, erroMsg]);
      falarTexto(erroMsg.text);
      mostrarAviso(erroMsg.text);
    } finally {
      setLoading(false);
    }
  };

  const atualizarAcao = (acaoId: string, mudanca: Partial<AcaoAgenteCartao>) => {
    setMessages((prev) => prev.map((m) => (m.acoes ? { ...m, acoes: m.acoes.map((a) => (a.id === acaoId ? { ...a, ...mudanca } : a)) } : m)));
  };
  const responderComoIA = (texto: string) => {
    setMessages((prev) => [...prev, { id: `msg-${Date.now()}`, sender: "ia", text: texto, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    falarTexto(texto);
  };
  const confirmarAcao = async (acaoId: string) => {
    atualizarAcao(acaoId, { estado: "executando" });
    try {
      const response = await fetch("/api/ai/agente/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id: acaoId }) });
      const data = await response.json().catch(() => ({}));
      const mensagem = typeof data.mensagem === "string" && data.mensagem ? data.mensagem : `O sistema respondeu com erro (HTTP ${response.status}).`;
      const deuCerto = response.ok && data.sucesso === true;
      atualizarAcao(acaoId, { estado: deuCerto ? "confirmada" : "falhou", resultado: mensagem });
      responderComoIA(deuCerto ? `Feito. ${mensagem}` : `Não foi feito. ${mensagem}`);
    } catch {
      atualizarAcao(acaoId, { estado: "falhou", resultado: "Sem resposta do servidor. Confira a tela antes de tentar de novo." });
      responderComoIA("Não consegui falar com o servidor. Confira a tela antes de tentar de novo.");
    }
  };
  const recusarAcao = async (acaoId: string) => {
    atualizarAcao(acaoId, { estado: "recusada" });
    try {
      await fetch("/api/ai/agente/recusar", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ id: acaoId }) });
    } catch { /* a ação expira sozinha em 15 minutos */ }
  };

  enviarRef.current = (t: string) => { void enviarMensagem(t); };
  falarRef.current = (t: string) => falarTexto(t);
  pararRef.current = () => { geracaoRef.current += 1; window.speechSynthesis?.cancel(); falandoRef.current = false; setFalando(false); aguardandoComandoRef.current = false; setAvisoVoz(""); };

  useEffect(() => {
    try { localStorage.setItem("murade_chamada_voz", chamadaPorVoz ? "1" : "0"); } catch { /* ignora */ }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // Não compete com o botão de microfone da janela.
    if (!chamadaPorVoz || !SR || gravandoVoz) return;
    const limpar = limparTextoVoz;
    const chamada = /\b(contabil|contabilidade|contabi)\b/;
    let ativo = true;
    let tempoComando: number | undefined;
    const iniciar = () => {
      if (!ativo) return;
      const rec = new SR();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (ev: any) => {
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          if (!ev.results[i].isFinal) continue;
          const bruto = String(ev.results[i][0].transcript || "");
          const texto = limpar(bruto);
          if (!texto) continue;
          // "Para" / "espera": interrompe a fala e cancela o pedido em andamento.
          if (COMANDO_PARAR.test(texto)) { pararRef.current(); continue; }
          // Ignora o que o próprio sistema está falando (e o eco dele), para não se chamar sozinho.
          if (falandoRef.current || window.speechSynthesis?.speaking || Date.now() - ultimaFalaRef.current < 1500) continue;
          const faladas = new Set(textoFaladoRef.current.split(" "));
          const palavrasDita = texto.split(" ");
          if (Date.now() - ultimaFalaRef.current < 15000 && textoFaladoRef.current && (texto === "pois nao" || (palavrasDita.length >= 2 && palavrasDita.filter((w) => faladas.has(w)).length / palavrasDita.length >= 0.75))) continue;
          if (aguardandoComandoRef.current || Date.now() < janelaConversaRef.current) {
            // Logo depois de uma resposta (20 s) a conversa continua sem precisar chamar de novo.
            if (/^(obrigad[oa]|valeu|ok|certo|beleza|tchau|tudo bem|ta bom)$/.test(texto) || (chamada.test(texto) && texto.split(" ").length <= 2)) continue;
            aguardandoComandoRef.current = false;
            janelaConversaRef.current = 0;
            window.clearTimeout(tempoComando);
            enviarRef.current(bruto.trim());
          } else if (chamada.test(texto)) {
            const resto = bruto.replace(/^[\s,.!?]*(contábil|contabil|contabilidade)[\s,.!?:-]*/i, "").trim();
            if (resto.split(" ").length >= 3) enviarRef.current(resto);
            else {
              falarRef.current("Pois não?");
              aguardandoComandoRef.current = true;
              tempoComando = window.setTimeout(() => { aguardandoComandoRef.current = false; }, 12000);
            }
          }
        }
      };
      rec.onerror = (e: any) => { if (e?.error === "not-allowed" || e?.error === "service-not-allowed") { ativo = false; setChamadaPorVoz(false); } };
      rec.onend = () => { if (ativo) window.setTimeout(iniciar, 150); };
      chamadaRef.current = rec;
      try { rec.start(); } catch { /* já iniciado */ }
    };
    iniciar();
    return () => { ativo = false; window.clearTimeout(tempoComando); try { chamadaRef.current?.stop(); } catch { /* ignora */ } };
  }, [chamadaPorVoz, gravandoVoz]);

  if (!isOpen) {
    return (
      <>
        {avisoVoz && (
          <div role="status" onClick={() => setAvisoVoz("")} className="fixed bottom-14 right-3 z-40 max-w-[min(86vw,360px)] cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xl" title="Toque para fechar">{avisoVoz}</div>
        )}
        <div className="fixed bottom-3 right-3 z-40 flex items-center gap-1.5" id="btn-ia-flutuante">
          <button
            type="button"
            onClick={() => onOpen?.()}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-300 bg-white/90 text-base text-slate-700 shadow-lg transition active:scale-95"
            title="Abrir a conversa escrita"
            aria-label="Abrir a conversa com a assistente"
          >
            💬
          </button>
          <button
            type="button"
            onClick={() => { if (chamadaPorVoz) pararRef.current(); setChamadaPorVoz((v) => !v); }}
            aria-pressed={chamadaPorVoz}
            className={`flex h-9 min-w-[3.6rem] items-center justify-center gap-1 rounded-full border-2 px-2 text-xs font-bold shadow-lg transition active:scale-95 ${chamadaPorVoz ? "border-emerald-400 bg-[#0a2342] text-white" : "border-rose-300 bg-white/95 text-rose-700"}`}
            title={chamadaPorVoz ? "Escutando. Toque para DESLIGAR a voz." : "Voz desligada. Toque para LIGAR."}
            aria-label={chamadaPorVoz ? "Desligar a voz da assistente" : "Ligar a voz da assistente"}
          >
            {chamadaPorVoz ? "👂 ligada" : "🔇 desligada"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full h-[88vh] max-h-[700px] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Topo do Modal */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 text-white px-5 py-3.5 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30 text-white">
                <Bot className="w-5 h-5 text-amber-300" />
              </div>
              {falando && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="font-extrabold text-sm flex items-center gap-1.5">
                <span>IA Murade</span>
                <span className="text-[10px] font-semibold bg-emerald-500 text-white px-1.5 py-0.2 rounded-xs">
                  Voz Natural
                </span>
              </div>
              <div className="text-[11px] text-blue-100 flex items-center gap-1">
                <span>{falando ? "🔊 Sintetizando fala..." : loading ? "Pesquisando fontes atuais..." : "Agente contábil: consulta e executa"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (falando) window.speechSynthesis?.cancel();
                setVozAtiva(!vozAtiva);
              }}
              className={`p-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
                vozAtiva ? "bg-white/20 text-white hover:bg-white/30" : "bg-white/10 text-white/60"
              }`}
              title={vozAtiva ? "Desativar voz automática" : "Ativar voz automática"}
            >
              {vozAtiva ? <Volume2 className="w-4 h-4 text-amber-300" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setChamadaPorVoz((v) => !v)}
              aria-pressed={chamadaPorVoz}
              className={`p-2 rounded-lg text-xs font-semibold cursor-pointer transition ${chamadaPorVoz ? "bg-emerald-500/30 text-white" : "bg-white/10 text-white/60"}`}
              title={chamadaPorVoz ? 'Chamada por voz LIGADA: diga "Contábil". Toque para desligar.' : 'Ligar chamada por voz: diga "Contábil" para chamar.'}
            >
              {chamadaPorVoz ? "👂 ligada" : "👂 desligada"}
            </button>

            <button
              onClick={() => {
                window.speechSynthesis?.cancel();
                onClose();
              }}
              className="p-2 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Área de Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                  m.sender === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>
                {!!m.sources?.length && <div className="mt-2 border-t border-slate-100 pt-2"><strong className="text-[10px]">Fontes consultadas</strong>{m.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-700 underline">{source.title}</a>)}</div>}
                {!!m.acoes?.length && m.acoes.map((a) => (
                  <div key={a.id} className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-slate-800">
                    <div className="text-xs font-bold">{a.titulo}</div>
                    {a.descricao.map((d, i) => <div key={i} className="text-[11px] mt-0.5">{d}</div>)}
                    {a.aviso && <div className="text-[11px] mt-1 font-semibold text-amber-800">{a.aviso}</div>}
                    {a.irreversivel && <div className="text-[11px] mt-1 font-bold text-rose-700">Não dá para desfazer.</div>}
                    {a.estado === "pendente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => confirmarAcao(a.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer">Confirmar</button>
                        <button type="button" onClick={() => recusarAcao(a.id)} className="bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer">Cancelar</button>
                      </div>
                    )}
                    {a.estado === "executando" && <div className="mt-2 text-[11px] font-semibold">Executando…</div>}
                    {a.estado === "confirmada" && <div className="mt-2 text-[11px] font-bold text-emerald-700">Confirmada: {a.resultado}</div>}
                    {a.estado === "falhou" && <div className="mt-2 text-[11px] font-bold text-rose-700">Não foi feito: {a.resultado}</div>}
                    {a.estado === "recusada" && <div className="mt-2 text-[11px] font-semibold text-slate-500">Cancelada.</div>}
                  </div>
                ))}
                <div
                  className={`text-[10px] mt-1.5 text-right font-medium ${
                    m.sender === "user" ? "text-blue-200" : "text-slate-400"
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 rounded-bl-none text-xs text-slate-600 flex items-center gap-2 shadow-2xs">
                <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
                <span>Agente Murade consultando base legal e cruzando dados...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Perguntas Rápidas */}
        <div className="px-4 py-2 bg-slate-100/80 border-t border-slate-200 flex gap-2 overflow-x-auto text-[11px] whitespace-nowrap shrink-0">
          <button
            onClick={() => enviarMensagem("O que está pendente de conferência no Contábil?")}
            className="bg-white hover:bg-blue-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full cursor-pointer transition"
          >
            ✅ Pendências de conferência
          </button>
          <button
            onClick={() => enviarMensagem("Como estão os robôs e as integrações com o Fiscal e o DP?")}
            className="bg-white hover:bg-blue-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full cursor-pointer transition"
          >
            🤖 Robôs e integrações
          </button>
          <button
            onClick={() => enviarMensagem("Como funciona o IBS e CBS da Reforma Tributária em 2026?")}
            className="bg-white hover:bg-blue-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full cursor-pointer transition"
          >
            ⚖️ Reforma 2026: IBS/CBS
          </button>
          <button
            onClick={() => enviarMensagem("Qual a situação do balancete e das partidas dobradas?")}
            className="bg-white hover:bg-blue-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full cursor-pointer transition"
          >
            📊 Status do Balancete (D = C)
          </button>
          <button
            onClick={() => enviarMensagem("Quais os livros contábeis e fiscais prontos para envio?")}
            className="bg-white hover:bg-blue-50 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-full cursor-pointer transition"
          >
            📖 Livros e Obrigações SPED
          </button>
        </div>

        {/* Campo de Digitação e Microfone */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviarMensagem();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleGravacao}
              className={`p-2.5 rounded-xl cursor-pointer transition flex items-center justify-center shrink-0 ${
                gravandoVoz
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              title={gravandoVoz ? "Ouvindo... Clique para parar" : "Falar pelo Microfone"}
            >
              {gravandoVoz ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-blue-600" />}
            </button>

            <input
              type="text"
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
              placeholder={gravandoVoz ? "Ouvindo sua voz..." : "Digite sua dúvida contábil ou fiscal..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 shrink-0"
              title="Enviar mensagem"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
