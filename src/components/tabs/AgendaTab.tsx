import React, { useState } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertCircle,
  FileText,
  Download,
  Share2,
  Eye,
  CreditCard,
  Send,
  Cpu,
  Check,
  Building2,
  CalendarCheck,
  AlertTriangle,
} from "lucide-react";
import { LembreteItem, EmpresaDados } from "../../types";
import { initialEmpresa, lembretesIniciais } from "../../data/mockData";
import {
  VisualizarModal,
  ApurarModal,
  GerarGuiaModal,
  PrepararModal,
  TransmitirModal,
  PagarModal,
  ExcluirModal,
} from "../modals/ObrigacoesModals";

interface AgendaTabProps {
  onVoltar?: () => void;
  onIrParaCadastro?: () => void;
  lembretes?: LembreteItem[];
  setLembretes?: React.Dispatch<React.SetStateAction<LembreteItem[]>>;
  empresa?: EmpresaDados;
}

export const AgendaTab: React.FC<AgendaTabProps> = ({
  onVoltar,
  onIrParaCadastro,
  lembretes: lembretesProp,
  setLembretes: setLembretesProp,
  empresa: empresaProp,
}) => {
  // Estado local com fallback para props
  const [internalLembretes, setInternalLembretes] = useState<LembreteItem[]>(lembretesIniciais);
  const lembretes = lembretesProp || internalLembretes;
  const setLembretes = setLembretesProp || setInternalLembretes;
  const empresa = empresaProp || initialEmpresa;

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Navegação de mês
  const [mesIndex, setMesIndex] = useState(() => new Date().getMonth());
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // Filtro de status: "todos" | "vencido" | "hoje" | "proximo" | "futuro"
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "vencido" | "hoje" | "proximo" | "futuro">("todos");

  // Dia selecionado no calendário interativo (null = nenhum específico)
  const [diaSelecionado, setDiaSelecionado] = useState<number | null>(null);

  // Estados dos Modais Interativos
  const [modalAtivo, setModalAtivo] = useState<"ver" | "apurar" | "gerar" | "preparar" | "transmitir" | "pagar" | "excluir" | "novo" | null>(null);
  const [itemSelecionado, setItemSelecionado] = useState<LembreteItem | null>(null);

  // Formulário do Modal "Novo Lembrete"
  const [novoNome, setNovoNome] = useState("");
  const [novaData, setNovaData] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  });
  const [novaOrigem, setNovaOrigem] = useState("contabil");
  const [novoValor, setNovoValor] = useState("0");
  const [novaObs, setNovaObs] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  // Contagens para os cards de filtro rápido
  const contagemVencidos = lembretes.filter((l) => l.tipo === "vencido").length;
  const contagemHoje = lembretes.filter((l) => l.tipo === "hoje").length;
  const contagemProximo = lembretes.filter((l) => l.tipo === "proximo").length;
  const contagemFuturo = lembretes.filter((l) => l.tipo === "futuro").length;
  const contagemTodos = lembretes.length;

  // Filtragem dos lembretes exibidos
  const lembretesFiltrados = lembretes.filter((item) => {
    // Se um dia específico do calendário estiver selecionado
    if (diaSelecionado !== null && item.diaDoMes && item.diaDoMes !== diaSelecionado) {
      return false;
    }
    if (filtroStatus === "todos") return true;
    return item.tipo === filtroStatus;
  });

  // Handler de Novo Lembrete
  const salvarNovoLembrete = () => {
    if (!novoNome.trim()) {
      showToast("⚠️ Preencha o título da obrigação!");
      return;
    }

    const origensMap: Record<string, string> = {
      contabil: "📙 Origem: MURADE Contábil",
      dp: "📘 Origem: MURADE DP",
      fiscal: "📕 Origem: MURADE FISCAL",
      fiscoia: "📗 Origem: FISCO IA",
    };

    const diaParsed = parseInt(novaData.split("-")[2], 10) || 15;
    const dataFormatada = novaData.split("-").reverse().join("/");

    const novoItem: LembreteItem = {
      id: `lembrete-${Date.now()}`,
      nome: `📌 ${novoNome}`,
      data: `Vencimento: ${dataFormatada} — No prazo`,
      dataVencimento: dataFormatada,
      diaDoMes: diaParsed,
      tipo: "futuro",
      statusTexto: "No prazo",
      origem: origensMap[novaOrigem] || "📙 Origem: MURADE Contábil",
      corTag: "border-[#2E7D32] bg-[#E8F5E9]",
      acaoTexto1: "Ver",
      acaoTexto2: "Gerar Guia",
      valor: parseFloat(novoValor) || 0,
      codigoReceita: "Geral",
      competencia: `${nomesMeses[mesIndex].slice(0, 3)}/${ano}`,
      detalhes: novaObs || "Obrigação cadastrada manualmente pelo usuário.",
      statusExecucao: "pendente",
    };

    setLembretes((prev) => [novoItem, ...prev]);
    setModalAtivo(null);
    setNovoNome("");
    setNovoValor("0");
    setNovaObs("");
    showToast(`✅ Lembrete '${novoNome}' cadastrado nesta agenda.`);
  };

  // Handler de Exclusão definitiva (Lixeira)
  const confirmarExclusao = () => {
    if (!itemSelecionado) return;
    const nomeExcluido = itemSelecionado.nome;
    setLembretes((prev) => prev.filter((item) => item.id !== itemSelecionado.id));
    setModalAtivo(null);
    setItemSelecionado(null);
    showToast(`🗑️ Lembrete '${nomeExcluido}' excluído com sucesso da agenda!`);
  };

  // Handler de Ação 1 (Ver, Apurar, Preparar)
  const executarAcao1 = (item: LembreteItem) => {
    setItemSelecionado(item);
    const acao = item.acaoTexto1.toLowerCase();
    if (acao.includes("apurar")) {
      setModalAtivo("apurar");
    } else if (acao.includes("preparar")) {
      setModalAtivo("preparar");
    } else {
      setModalAtivo("ver");
    }
  };

  // Handler de Ação 2 (Pagar, Gerar, Transmitir, Enviar)
  const executarAcao2 = (item: LembreteItem) => {
    setItemSelecionado(item);
    const acao = item.acaoTexto2.toLowerCase();
    if (acao.includes("pagar")) {
      setModalAtivo("pagar");
    } else if (acao.includes("gerar") || acao.includes("darf") || acao.includes("guia")) {
      setModalAtivo("gerar");
    } else if (acao.includes("transmitir") || acao.includes("enviar")) {
      setModalAtivo("transmitir");
    } else {
      setModalAtivo("ver");
    }
  };

  // Handler após conclusão de Apuração
  // Handler após conclusão de Preparação (ECD)
  const handleConcluirPreparacao = () => {
    if (!itemSelecionado) return;
    showToast("Preparação de SPED indisponível: fonte de dados e validador oficial não configurados. Nenhum arquivo foi gerado.");
  };

  // Handler após Transmissão
  const handleConcluirTransmissao = (_protocolo: string) => {
    if (!itemSelecionado) return;
    showToast("Transmissão indisponível: integração oficial, certificado e procuração não configurados. Nenhum protocolo foi emitido.");
  };

  // Handler após Pagamento
  const handleConcluirPagamento = () => {
    if (!itemSelecionado) return;
    showToast("O sistema não consulta bancos nem confirma pagamentos. Nenhum status de pagamento foi alterado.");
  };

  return (
    <div className="space-y-4">
      {/* 🔙 TOPO COM RETORNO & STATUS DE SINCRONIZAÇÃO */}
      <div className="bg-white rounded-xl p-3.5 sm:p-4 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className="w-9 h-9 rounded-full bg-purple-100 hover:bg-[#6A1B9A] text-[#6A1B9A] hover:text-white flex items-center justify-center transition cursor-pointer font-bold shadow-2xs"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Agenda & Lembretes Fiscais
              </h1>
              <span className="text-[11px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                Lembretes locais
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Controle unificado de vencimentos, guias, obrigações e prazos tributários de <strong>{empresa.razaoSocial}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onIrParaCadastro && (
            <button
              onClick={onIrParaCadastro}
              className="px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-900 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-purple-700" />
              <span>Ver Cadastro de Empresa</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold shrink-0" role="status">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
            <span className="hidden sm:inline">Agenda local · integrações não confirmadas</span>
            <span className="sm:hidden">Agenda local</span>
          </div>
        </div>
      </div>

      {/* TOAST FEEDBACK */}
      {toastMsg && (
        <div className="p-3 bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-slate-600 shrink-0" />
          <span className="whitespace-pre-line">{toastMsg}</span>
        </div>
      )}

      {/* PAINEL PRINCIPAL DA AGENDA */}
      <div className="bg-white rounded-xl p-5 sm:p-7 shadow-xs border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-[#4A148C] flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-[#6A1B9A]" />
            <span>Calendário Contábil & Obrigações Fiscais</span>
          </h2>

          <button
            onClick={() => setModalAtivo("novo")}
            className="px-4 py-2.5 bg-[#6A1B9A] hover:bg-[#4A148C] text-white rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-2 shadow-sm self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>➕ Novo Lembrete</span>
          </button>
        </div>

        {/* NOTA EXPLICATIVA */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50/60 p-4 rounded-xl border-l-4 border-[#6A1B9A] text-xs sm:text-sm text-slate-800 leading-relaxed flex items-start gap-3">
          <div className="p-1.5 bg-white rounded-lg border border-purple-200 text-[#6A1B9A] shrink-0 mt-0.5">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            Use os filtros para localizar lembretes por data. É possível consultar os dados cadastrados e calcular uma prévia matemática. Geração de guia, preparação SPED, transmissão e confirmação de pagamento ainda dependem de integrações não configuradas; nenhuma dessas ações será marcada como concluída.
          </div>
        </div>

        {/* ========================================================= */}
        {/* CARDS INTERATIVOS DE FILTRO RÁPIDO                        */}
        {/* (Atende diretamente ao pedido: "quando eu precisar clicar */}
        {/*  o que é que está vencido, o que é que vai vencer...")    */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* Vencidos */}
          <button
            onClick={() => {
              setFiltroStatus("vencido");
              setDiaSelecionado(null);
            }}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              filtroStatus === "vencido"
                ? "border-rose-600 bg-rose-50 shadow-xs ring-2 ring-rose-400"
                : "border-rose-200 bg-rose-50/40 hover:bg-rose-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Vencidos</span>
              <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-700">{contagemVencidos}</span>
              <span className="text-[11px] text-rose-600 font-semibold">guia pendente</span>
            </div>
          </button>

          {/* Vence Hoje */}
          <button
            onClick={() => {
              setFiltroStatus("hoje");
              setDiaSelecionado(null);
            }}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              filtroStatus === "hoje"
                ? "border-purple-600 bg-purple-50 shadow-xs ring-2 ring-purple-400"
                : "border-purple-200 bg-purple-50/40 hover:bg-purple-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Vence Hoje</span>
              <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-700">{contagemHoje}</span>
              <span className="text-[11px] text-purple-600 font-semibold">para pagar</span>
            </div>
          </button>

          {/* A Vencer (Próximos) */}
          <button
            onClick={() => {
              setFiltroStatus("proximo");
              setDiaSelecionado(null);
            }}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              filtroStatus === "proximo"
                ? "border-amber-600 bg-amber-50 shadow-xs ring-2 ring-amber-400"
                : "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">A Vencer</span>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-800">{contagemProximo}</span>
              <span className="text-[11px] text-amber-700 font-semibold">próx. dias</span>
            </div>
          </button>

          {/* No Prazo */}
          <button
            onClick={() => {
              setFiltroStatus("futuro");
              setDiaSelecionado(null);
            }}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              filtroStatus === "futuro"
                ? "border-emerald-600 bg-emerald-50 shadow-xs ring-2 ring-emerald-400"
                : "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">No Prazo</span>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-700">{contagemFuturo}</span>
              <span className="text-[11px] text-emerald-600 font-semibold">futuras</span>
            </div>
          </button>

          {/* Ver Todos */}
          <button
            onClick={() => {
              setFiltroStatus("todos");
              setDiaSelecionado(null);
            }}
            className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              filtroStatus === "todos" && diaSelecionado === null
                ? "border-blue-600 bg-blue-50 shadow-xs ring-2 ring-blue-400"
                : "border-slate-300 bg-slate-50 hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">Ver Todos</span>
              <Filter className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">{contagemTodos}</span>
              <span className="text-[11px] text-slate-500 font-semibold">obrigações</span>
            </div>
          </button>
        </div>

        {/* CABEÇALHO DO MÊS */}
        <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (mesIndex === 0) {
                  setMesIndex(11);
                  setAno(ano - 1);
                } else {
                  setMesIndex(mesIndex - 1);
                }
              }}
              className="w-8 h-8 rounded-full bg-white border border-slate-300 hover:bg-purple-100 hover:text-[#6A1B9A] flex items-center justify-center transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <h3 className="text-base sm:text-lg font-bold text-[#4A148C]">
              {nomesMeses[mesIndex]} de {ano}
            </h3>

            <button
              onClick={() => {
                if (mesIndex === 11) {
                  setMesIndex(0);
                  setAno(ano + 1);
                } else {
                  setMesIndex(mesIndex + 1);
                }
              }}
              className="w-8 h-8 rounded-full bg-white border border-slate-300 hover:bg-purple-100 hover:text-[#6A1B9A] flex items-center justify-center transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {diaSelecionado !== null && (
              <button
                onClick={() => setDiaSelecionado(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 font-bold hover:bg-purple-200 cursor-pointer transition flex items-center gap-1"
              >
                <span>Dia {diaSelecionado} Selecionado</span>
                <span className="text-purple-600">✕</span>
              </button>
            )}
            <button
              onClick={() => {
                setMesIndex(8);
                setAno(2026);
                setDiaSelecionado(null);
                setFiltroStatus("todos");
                showToast("📅 Retornado para a competência atual (Setembro/2026).");
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium cursor-pointer transition"
            >
              Mês Atual
            </button>
            <span className="text-xs text-slate-500 hidden md:inline">
              Competência ativa: <strong>{nomesMeses[mesIndex]}/{ano}</strong>
            </span>
          </div>
        </div>

        {/* CALENDÁRIO COMPLETO INTERATIVO (Cliques em qualquer dia funcionam) */}
        <div className="overflow-x-auto">
          <div className="min-w-[540px]">
            <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-xs text-slate-500 mb-1">
              <div className="py-1 text-rose-600">Dom</div>
              <div className="py-1">Seg</div>
              <div className="py-1">Ter</div>
              <div className="py-1">Qua</div>
              <div className="py-1">Qui</div>
              <div className="py-1">Sex</div>
              <div className="py-1">Sáb</div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {/* Dias vazios início de setembro (Terça começou dia 1) */}
              <div className="h-16 rounded-lg bg-slate-50/50 border border-slate-100" />
              <div className="h-16 rounded-lg bg-slate-50/50 border border-slate-100" />

              {/* Dias 1 a 30 gerados dinamicamente com interatividade */}
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
                // Descobre se tem obrigação neste dia
                const temICMS = d === 15;
                const temINSS = d === 18;
                const temFGTS = d === 19; // HOJE
                const temGPS = d === 20;
                const temESocial = d === 25;
                const temDIRF = d === 29;
                const temECD = d === 30;

                const isSelected = diaSelecionado === d;

                let borderStyle = "border-slate-200 bg-white border-l-4 border-l-[#2E7D32]";
                let badge = null;

                if (temFGTS) {
                  borderStyle = "border-2 border-[#6A1B9A] bg-purple-50/80 shadow-xs";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-[#6A1B9A] text-white truncate">
                      FGTS (HOJE)
                    </span>
                  );
                } else if (temICMS) {
                  borderStyle = "border border-amber-300 bg-amber-50/60 border-l-4 border-l-[#F57C00]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-amber-200 text-amber-900 truncate">
                      ICMS
                    </span>
                  );
                } else if (temINSS) {
                  borderStyle = "border border-amber-300 bg-amber-50/60 border-l-4 border-l-[#F57C00]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-amber-200 text-amber-900 truncate">
                      INSS
                    </span>
                  );
                } else if (temGPS) {
                  borderStyle = "border border-rose-300 bg-rose-50/60 border-l-4 border-l-[#D32F2F]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-rose-200 text-rose-900 truncate">
                      GPS / PIS
                    </span>
                  );
                } else if (temESocial) {
                  borderStyle = "border border-slate-200 bg-white border-l-4 border-l-[#2E7D32]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-emerald-100 text-emerald-800 truncate">
                      eSocial
                    </span>
                  );
                } else if (temDIRF) {
                  borderStyle = "border border-slate-200 bg-white border-l-4 border-l-[#2E7D32]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-emerald-100 text-emerald-800 truncate">
                      DIRF
                    </span>
                  );
                } else if (temECD) {
                  borderStyle = "border border-slate-200 bg-white border-l-4 border-l-[#2E7D32]";
                  badge = (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded-xs bg-emerald-100 text-emerald-800 truncate">
                      ECD
                    </span>
                  );
                }

                return (
                  <button
                    key={d}
                    onClick={() => {
                      if (diaSelecionado === d) {
                        setDiaSelecionado(null);
                      } else {
                        setDiaSelecionado(d);
                        // Se tem obrigação, avisa
                        if (temICMS || temINSS || temFGTS || temGPS || temESocial || temECD) {
                          showToast(`📅 Filtrando obrigações para o dia ${d} de ${nomesMeses[mesIndex]}.`);
                        }
                      }
                    }}
                    className={`h-16 p-1.5 rounded-lg transition flex flex-col justify-between text-left cursor-pointer ${borderStyle} ${
                      isSelected ? "ring-2 ring-blue-600 scale-[1.02] shadow-sm" : "hover:bg-purple-50/50"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${temFGTS ? "text-[#6A1B9A] font-black" : "text-slate-700"}`}>
                        {d}
                      </span>
                      {temFGTS && (
                        <span className="text-[8px] font-black bg-[#6A1B9A] text-white px-1 rounded-xs">HOJE</span>
                      )}
                    </div>
                    {badge}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* LISTA DE LEMBRETES & VENCIMENTOS COM TODOS OS BOTÕES FUNCIONANDO */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#4A148C] flex items-center gap-2">
              <span>📋</span>
              <span>
                Lembretes e Vencimentos ({lembretesFiltrados.length})
                {diaSelecionado !== null && ` — Exibindo Dia ${diaSelecionado}`}
              </span>
            </h3>

            {/* FILTROS RÁPIDOS DE STATUS */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Status:
              </span>
              {[
                { id: "todos", label: "Todos" },
                { id: "vencido", label: "Vencidos" },
                { id: "hoje", label: "Hoje" },
                { id: "proximo", label: "A Vencer" },
                { id: "futuro", label: "No Prazo" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFiltroStatus(f.id as any);
                    setDiaSelecionado(null);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition ${
                    filtroStatus === f.id
                      ? "bg-[#6A1B9A] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {lembretesFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-2">
                <div>Nenhuma obrigação encontrada para este filtro.</div>
                <button
                  onClick={() => {
                    setFiltroStatus("todos");
                    setDiaSelecionado(null);
                  }}
                  className="text-xs font-bold text-[#6A1B9A] hover:underline cursor-pointer"
                >
                  Limpar filtros e ver todas as obrigações
                </button>
              </div>
            ) : (
              lembretesFiltrados.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border-l-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:shadow-xs ${item.corTag}`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>{item.nome}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-300">
                        {item.statusTexto}
                      </span>
                      {item.valor && item.valor > 0 && (
                        <span className="text-xs font-mono font-bold text-slate-800 bg-white/70 px-2 py-0.5 rounded border border-slate-200">
                          R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{item.data}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {item.origem} • Código: {item.codigoReceita || "Geral"}
                    </div>
                  </div>

                  {/* Ações de lembrete e acesso às rotinas disponíveis */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Botão Ação 1 (Ver / Apurar / Preparar) */}
                    <button
                      onClick={() => executarAcao1(item)}
                      className={`px-3 py-1.5 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs flex items-center gap-1.5 ${
                        item.acaoTexto1 === "Apurar"
                          ? "bg-amber-600 hover:bg-amber-700"
                          : item.acaoTexto1 === "Preparar"
                          ? "bg-purple-700 hover:bg-purple-800"
                          : "bg-[#082B66] hover:bg-[#0A357D]"
                      }`}
                      title={`${item.acaoTexto1} detalhes da obrigação`}
                    >
                      {item.acaoTexto1 === "Apurar" ? (
                        <Cpu className="w-3.5 h-3.5" />
                      ) : item.acaoTexto1 === "Preparar" ? (
                        <FileText className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{item.acaoTexto1}</span>
                    </button>

                    {/* Botão Ação 2 (Pagar / Gerar Guia / Transmitir / Enviar) */}
                    <button
                      onClick={() => executarAcao2(item)}
                      className={`px-3 py-1.5 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs flex items-center gap-1.5 ${
                        item.acaoTexto2 === "Pagar"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : item.acaoTexto2.includes("Gerar")
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-indigo-700 hover:bg-indigo-800"
                      }`}
                      title={`${item.acaoTexto2} referente a esta obrigação`}
                    >
                      {item.acaoTexto2 === "Pagar" ? (
                        <CreditCard className="w-3.5 h-3.5" />
                      ) : item.acaoTexto2.includes("Gerar") ? (
                        <FileText className="w-3.5 h-3.5" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{item.acaoTexto2}</span>
                    </button>

                    {/* Botão Lixeira para Excluir com confirmação */}
                    <button
                      onClick={() => {
                        setItemSelecionado(item);
                        setModalAtivo("excluir");
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer border border-transparent hover:border-rose-200"
                      title="Excluir este lembrete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAIS INTERATIVOS (AÇÕES REAIS)                          */}
      {/* ========================================================= */}

      {/* 1. Modal Visualizar (Ação "Ver") */}
      {modalAtivo === "ver" && itemSelecionado && (
        <VisualizarModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onApurar={itemSelecionado.acaoTexto1 === "Apurar" ? () => setModalAtivo("apurar") : undefined}
          onGerarGuia={itemSelecionado.acaoTexto2.includes("Gerar") ? () => setModalAtivo("gerar") : undefined}
          onPagar={itemSelecionado.acaoTexto2 === "Pagar" ? () => setModalAtivo("pagar") : undefined}
          onTransmitir={itemSelecionado.acaoTexto2.includes("Transmitir") || itemSelecionado.acaoTexto2.includes("Enviar") ? () => setModalAtivo("transmitir") : undefined}
          onExcluir={() => setModalAtivo("excluir")}
        />
      )}

      {/* 2. Modal Apurar (Ação "Apurar") */}
      {modalAtivo === "apurar" && itemSelecionado && (
        <ApurarModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
        />
      )}

      {/* 3. Modal Gerar Guia / DARF (Ação "Gerar Guia" / "Gerar DARF") */}
      {modalAtivo === "gerar" && itemSelecionado && (
        <GerarGuiaModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onPagar={() => setModalAtivo("pagar")}
        />
      )}

      {/* 4. Modal Preparar (Ação "Preparar") */}
      {modalAtivo === "preparar" && itemSelecionado && (
        <PrepararModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onConcluirPreparacao={handleConcluirPreparacao}
        />
      )}

      {/* 5. Modal Transmitir / Enviar (Ação "Transmitir" / "Enviar") */}
      {modalAtivo === "transmitir" && itemSelecionado && (
        <TransmitirModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onConcluirTransmissao={handleConcluirTransmissao}
        />
      )}

      {/* 6. Modal Pagar (Ação "Pagar") */}
      {modalAtivo === "pagar" && itemSelecionado && (
        <PagarModal
          item={itemSelecionado}
          empresa={empresa}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onConcluirPagamento={handleConcluirPagamento}
        />
      )}

      {/* 7. Modal Excluir (Lixeira) */}
      {modalAtivo === "excluir" && itemSelecionado && (
        <ExcluirModal
          item={itemSelecionado}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onConfirmar={confirmarExclusao}
        />
      )}

      {/* 8. Modal Novo Lembrete */}
      {modalAtivo === "novo" && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-purple-100 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-[#4A148C] mb-4 flex items-center gap-2">
              <span>➕</span>
              <span>Novo Lembrete / Vencimento Fiscal</span>
            </h3>

            <div className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Título / Obrigação *</label>
                <input
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: DCTFWeb Mensal, PIS/Cofins, DAS Simples..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#6A1B9A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    value={novaData}
                    onChange={(e) => setNovaData(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#6A1B9A]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Sistema de Origem</label>
                  <select
                    value={novaOrigem}
                    onChange={(e) => setNovaOrigem(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#6A1B9A] bg-white cursor-pointer"
                  >
                    <option value="contabil">📙 MURADE Contábil</option>
                    <option value="dp">📘 MURADE Departamento Pessoal</option>
                    <option value="fiscal">📕 MURADE Fiscal</option>
                    <option value="fiscoia">📗 FISCO IA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Valor Previsto (R$)</label>
                <input
                  type="number"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#6A1B9A] font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">Observações</label>
                <textarea
                  rows={3}
                  value={novaObs}
                  onChange={(e) => setNovaObs(e.target.value)}
                  placeholder="Detalhes, códigos de receita ou orientações..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#6A1B9A] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setModalAtivo(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={salvarNovoLembrete}
                className="px-5 py-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>💾 Salvar e Sincronizar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
