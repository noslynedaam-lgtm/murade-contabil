import React, { useState } from "react";
import { TabId, EmpresaDados, LancamentoContabil, OrgaoConectado, LembreteItem } from "../../types";
import {
  Home,
  Zap,
  Globe,
  Building2,
  FileSpreadsheet,
  Scale,
  Sparkles,
  Calculator,
  Calendar,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Bot,
  ArrowRight,
  Clock,
  Layers,
  Eye,
  CreditCard,
  Send,
  Cpu,
  Trash2,
  AlertTriangle,
  Users,
} from "lucide-react";
import { IbsCbsReformaCard } from "../IbsCbsReformaCard";
import { lembretesIniciais } from "../../data/mockData";
import {
  VisualizarModal,
  ApurarModal,
  GerarGuiaModal,
  PrepararModal,
  TransmitirModal,
  PagarModal,
  ExcluirModal,
} from "../modals/ObrigacoesModals";

interface InicioTabProps {
  empresa: EmpresaDados;
  lancamentos: LancamentoContabil[];
  orgaos: OrgaoConectado[];
  lembretes?: LembreteItem[];
  setLembretes?: React.Dispatch<React.SetStateAction<LembreteItem[]>>;
  onNavigateTab: (tab: TabId) => void;
  onRunAudit?: () => void;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
}

export const InicioTab: React.FC<InicioTabProps> = ({
  empresa,
  lancamentos,
  orgaos,
  lembretes: lembretesProp,
  setLembretes: setLembretesProp,
  onNavigateTab,
  onRunAudit,
  onConectarFiscal,
  onConectarDP,
}) => {
  // Lembretes com fallback
  const [internalLembretes, setInternalLembretes] = useState<LembreteItem[]>(lembretesIniciais);
  const lembretes = lembretesProp || internalLembretes;
  const setLembretes = setLembretesProp || setInternalLembretes;

  // Modais de Ação Direta
  const [modalAtivo, setModalAtivo] = useState<"ver" | "apurar" | "gerar" | "preparar" | "transmitir" | "pagar" | "excluir" | null>(null);
  const [itemSelecionado, setItemSelecionado] = useState<LembreteItem | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleExcluirLembrete = () => {
    if (!itemSelecionado) return;
    const nome = itemSelecionado.nome;
    setLembretes((prev) => prev.filter((i) => i.id !== itemSelecionado.id));
    setModalAtivo(null);
    setItemSelecionado(null);
    showToast(`🗑️ Lembrete '${nome}' excluído com sucesso!`);
  };

  const handleConcluirPreparacao = () => {
    if (!itemSelecionado) return;
    showToast("Preparação de SPED indisponível: fonte de dados e validador oficial não configurados.");
  };

  const handleConcluirTransmissao = (_protocolo: string) => {
    if (!itemSelecionado) return;
    showToast("Transmissão indisponível: integração oficial, certificado e procuração não configurados.");
  };

  const handleConcluirPagamento = () => {
    if (!itemSelecionado) return;
    showToast("O sistema não consulta bancos nem confirma pagamentos. Nenhum status foi alterado.");
  };

  // Contadores dinâmicos
  const totalConectados = orgaos.filter((o) => o.status === "conectado").length;
  const totalLancamentos = lancamentos.length;

  const totalVencidos = lembretes.filter((l) => l.tipo === "vencido").length;
  const totalHoje = lembretes.filter((l) => l.tipo === "hoje").length;
  const totalProximos = lembretes.filter((l) => l.tipo === "proximo").length;

  const modulosPrincipais: Array<{
    id: TabId;
    titulo: string;
    subtitulo: string;
    icone: React.FC<{ className?: string }>;
    tag: string;
    tagCor: string;
  }> = [
    {
      id: "fluxo-previtico",
      titulo: "Fluxo Prevítico",
      subtitulo: "Projeção inteligente de 90 dias, controle de saldo e upload de NF-e/boletos por OCR.",
      icone: Zap,
      tag: "Módulo local",
      tagCor: "bg-slate-100 text-slate-700 border-slate-300",
    },
    {
      id: "conexoes",
      titulo: "Conexões & Órgãos",
      subtitulo: "Configuração das integrações externas e credenciais por empresa.",
      icone: Globe,
      tag: "Não configurados",
      tagCor: "bg-amber-100 text-amber-900 border-amber-300",
    },
    {
      id: "empresa",
      titulo: "Cadastro de Empresa",
      subtitulo: "Configuração de CNPJ, alíquotas da Reforma 2026, certificado digital e regime fiscal.",
      icone: Building2,
      tag: "CNPJ / A1",
      tagCor: "bg-slate-100 text-slate-700 border-slate-300",
    },
    {
      id: "lancamentos",
      titulo: "Lançamentos Contábeis",
      subtitulo: "Escrituração por partidas dobradas com importação direta dos módulos Fiscal e DP.",
      icone: FileSpreadsheet,
      tag: `${totalLancamentos} Lançamentos`,
      tagCor: "bg-sky-100 text-sky-800 border-sky-300",
    },
    {
      id: "balancete",
      titulo: "Balancete de Verificação",
      subtitulo: "Fechamento mensal automatizado com conferência de débitos e créditos em tempo real.",
      icone: Scale,
      tag: "Aguardando dados",
      tagCor: "bg-amber-100 text-amber-900 border-amber-300",
    },
    {
      id: "ia-premium",
      titulo: "IA Murade Premium",
      subtitulo: "Assistente contábil e tributário com interação por voz, pareceres e diagnósticos.",
      icone: Sparkles,
      tag: "Voz v3.0",
      tagCor: "bg-amber-100 text-amber-800 border-amber-300",
    },
    {
      id: "calculadora",
      titulo: "Calculadora 3D",
      subtitulo: "Simulador tridimensional com cálculo avançado de impostos, juros e margens.",
      icone: Calculator,
      tag: "3D Interativo",
      tagCor: "bg-indigo-100 text-indigo-800 border-indigo-300",
    },
    {
      id: "agenda",
      titulo: "Agenda & Lembretes",
      subtitulo: "Cronograma de prazos tributários (DCTFWeb, EFD-Reinf, FGTS, SPED) com alertas.",
      icone: Calendar,
      tag: "Prazos 2026",
      tagCor: "bg-rose-100 text-rose-800 border-rose-300",
    },
    {
      id: "integracao",
      titulo: "Integrações de Sistemas",
      subtitulo: "Configuração das conexões externas; sincronização ainda não disponível.",
      icone: Layers,
      tag: "Pendente",
      tagCor: "bg-amber-100 text-amber-900 border-amber-300",
    },
  ];

  return (
    <div className="space-y-5 text-slate-800">
      {/* Cabeçalho de Boas-Vindas da Tela Inicial */}
      <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                <Home className="w-3.5 h-3.5 text-blue-600" />
                <span>Painel Principal</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-700" />
                <span>Robôs aguardando fontes</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Bem-vindo à Tela Inicial do Murade Contábil</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Visão geral centralizada para gerenciar a escrituração, conciliação bancária,
              projeções do <strong>Fluxo Prevítico</strong> e conferência tributária da Reforma 2026.
            </p>
          </div>

          {/* Card Resumo da Empresa Ativa */}
          <div className="bg-white border border-slate-300/80 rounded-xl p-3.5 sm:p-4 shadow-2xs shrink-0 min-w-[260px]">
            <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Empresa Ativa</span>
              <button
                onClick={() => onNavigateTab("empresa")}
                className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold cursor-pointer"
              >
                {empresa.razaoSocial || empresa.cnpj ? "Trocar / Editar →" : "+ Cadastrar Empresa →"}
              </button>
            </div>
            {empresa.razaoSocial || empresa.cnpj ? (
              <>
                <div className="font-extrabold text-slate-900 text-sm truncate" title={empresa.nomeFantasia || empresa.razaoSocial}>
                  {empresa.nomeFantasia || empresa.razaoSocial}
                </div>
                <div className="text-xs text-slate-600 font-mono mt-0.5 flex items-center justify-between">
                  <span>CNPJ: {empresa.cnpj || "Não informado"}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded border border-amber-300">
                    Integrações pendentes
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-100 text-slate-500">
                  <span>{empresa.regime || "Regime não informado"}</span>
                  <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">Comp. {empresa.competencia || "Não definida"}</span>
                </div>
              </>
            ) : (
              <div className="py-1 text-center space-y-2">
                <div className="text-xs font-bold text-slate-600">Nenhuma empresa ativa</div>
                <div className="flex flex-col gap-1.5">
                  {onConectarFiscal && (
                    <button
                      type="button"
                      onClick={onConectarFiscal}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-black transition cursor-pointer shadow-2xs flex items-center justify-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>Verificar conexão com Murade Fiscal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigateTab("empresa")}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition cursor-pointer shadow-2xs inline-block"
                  >
                    + Cadastrar Manualmente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BARRAMENTO DE CONEXÃO MURADE: FISCAL • DP • GOV (RECEITA, SEFAZ, SERPRO) */}
      <div className="bg-[#082B66] text-white rounded-xl p-4 sm:p-5 shadow-sm border border-[#0A357D]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 text-white flex items-center justify-center shrink-0 border border-white/20 shadow-xs">
              <Zap className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>Integrações: Murade Fiscal • Murade DP • Órgãos Públicos</span>
                </h3>
                <span className="text-[10px] bg-amber-300 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Integrações pendentes
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Conexões com Murade Fiscal, Departamento Pessoal e órgãos públicos aguardam URLs, autenticação e configuração.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            {onConectarFiscal && (
              <button
                id="btn-puxar-empresa-fiscal-banner"
                onClick={onConectarFiscal}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Zap className="w-3.5 h-3.5 text-slate-950" />
                <span>Verificar Murade Fiscal</span>
              </button>
            )}

            {onConectarDP && (
              <button
                id="btn-conectar-dp-banner"
                onClick={onConectarDP}
                className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-white/20"
              >
                <Users className="w-3.5 h-3.5 text-blue-200" />
                <span>Consultar resumos do DP</span>
              </button>
            )}

            <button
              onClick={() => onNavigateTab("conexoes")}
              className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-white/20"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-300" />
              <span>Ver Status dos Órgãos</span>
            </button>
          </div>
        </div>

        {/* Indicadores rápidos de canais ativos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 text-xs">
          <div className="bg-black/20 rounded-lg p-2.5 border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-bold">Mural do Fiscal</div>
              <div className="font-bold text-white">Aguardando conexão</div>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          </div>

          <div className="bg-black/20 rounded-lg p-2.5 border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-bold">Mural do DP</div>
              <div className="font-bold text-white">Aguardando conexão</div>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          </div>

          <div className="bg-black/20 rounded-lg p-2.5 border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-bold">Receita Federal / SERPRO</div>
              <div className="font-bold text-white">Certificado não configurado</div>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          </div>

          <div className="bg-black/20 rounded-lg p-2.5 border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-blue-200 uppercase font-bold">SEFAZ Estadual</div>
              <div className="font-bold text-white">Não conectado</div>
            </div>
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          </div>
        </div>
      </div>

      {/* 4 Cards de Indicadores Rápidos (Resumo Geral) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Fluxo Prevítico */}
        <div
          onClick={() => onNavigateTab("fluxo-previtico")}
          className="bg-[#EEF4F9] border border-[#CBD5E1] hover:border-blue-400 rounded-xl p-4 transition cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>Fluxo Prevítico</span>
              </span>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded">
              Sem dados
              </span>
            </div>
            <div className="text-lg font-black text-slate-900 font-mono">
              Aguardando lançamentos
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              Cadastre informações financeiras para habilitar uma projeção.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-300/80 flex items-center justify-between text-xs font-semibold text-blue-700 group-hover:text-blue-900">
            <span>Acessar Fluxo</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 2: Conexões com Órgãos */}
        <div
          onClick={() => onNavigateTab("conexoes")}
          className="bg-[#EEF4F9] border border-[#CBD5E1] hover:border-blue-400 rounded-xl p-4 transition cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-600" />
                <span>Órgãos & APIs</span>
              </span>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded">
                {totalConectados} endereços respondendo
              </span>
            </div>
            <div className="text-lg font-black text-slate-900">
              Integrações não configuradas
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              O teste de alcance HTTP não confirma autenticação nem acesso a dados.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-300/80 flex items-center justify-between text-xs font-semibold text-blue-700 group-hover:text-blue-900">
            <span>Ver Conexões</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 3: Conformidade Contábil */}
        <div
          onClick={() => onNavigateTab("balancete")}
          className="bg-[#EEF4F9] border border-[#CBD5E1] hover:border-blue-400 rounded-xl p-4 transition cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-blue-600" />
                <span>Balancete Geral</span>
              </span>
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded">
              Não verificado
              </span>
            </div>
            <div className="text-lg font-black text-emerald-700">
              {totalLancamentos > 0 ? "Aguardando conferência" : "Sem lançamentos"}
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              {totalLancamentos} lançamento(s) cadastrado(s). A conferência ainda não foi executada.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-300/80 flex items-center justify-between text-xs font-semibold text-blue-700 group-hover:text-blue-900">
            <span>Emitir Balancete</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 4: 3 Robôs + Agente IA */}
        <div
          onClick={() => onNavigateTab("agente")}
          className="bg-[#EEF4F9] border border-[#CBD5E1] hover:border-blue-400 rounded-xl p-4 transition cursor-pointer shadow-xs group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-blue-600" />
                <span>3 Robôs + 1 Agente IA</span>
              </span>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded font-mono">
                v2026.1.0
              </span>
            </div>
            <div className="text-lg font-black text-slate-900">
              Aguardando dados
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-snug">
              A conferência local só pode rodar depois que houver registros.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-300/80 flex items-center justify-between text-xs font-semibold text-blue-700 group-hover:text-blue-900">
            <span>Abrir Painel dos Robôs</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </div>

      {/* TOAST FEEDBACK */}
      {toastMsg && (
        <div className="p-3 bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-slate-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* SESSÃO: LEMBRETES FISCAIS & VENCIMENTOS IMINENTES          */}
      {/* Lembretes e rotinas disponíveis */}
      {/* ========================================================= */}
      <div className="bg-white border border-purple-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-purple-100 text-purple-900 rounded-lg">
                <Calendar className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Lembretes Fiscais & Vencimentos Iminentes
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento e execução imediata de guias, declarações e apurações da empresa.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {totalVencidos > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                {totalVencidos} Vencido{totalVencidos > 1 ? "s" : ""}
              </span>
            )}
            {totalHoje > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                {totalHoje} Vence Hoje
              </span>
            )}
            {totalProximos > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                {totalProximos} A Vencer
              </span>
            )}
            <button
              onClick={() => onNavigateTab("agenda")}
              className="text-xs font-bold text-[#6A1B9A] hover:text-[#4A148C] bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition cursor-pointer flex items-center gap-1"
            >
              <span>Abrir Agenda Completa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* LISTAGEM DE CARDS COM AÇÕES DIRETAS FUNCIONANDO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lembretes.slice(0, 4).map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border-l-4 border transition flex flex-col justify-between gap-3 ${item.corTag}`}
            >
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                    {item.nome}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 border border-slate-300 shrink-0">
                    {item.statusTexto}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{item.data}</span>
                </div>
                {item.valor && item.valor > 0 && (
                  <div className="text-xs font-mono font-bold text-slate-800">
                    Valor: R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div className="text-[10px] text-slate-500 font-medium">
                  {item.origem}
                </div>
              </div>

              {/* Ações de lembrete */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                <div className="flex items-center gap-1.5">
                  {/* Ação 1 (Ver / Apurar / Preparar) */}
                  <button
                    onClick={() => {
                      setItemSelecionado(item);
                      const acao = item.acaoTexto1.toLowerCase();
                      if (acao.includes("apurar")) {
                        setModalAtivo("apurar");
                      } else if (acao.includes("preparar")) {
                        setModalAtivo("preparar");
                      } else {
                        setModalAtivo("ver");
                      }
                    }}
                    className={`px-2.5 py-1 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs flex items-center gap-1 ${
                      item.acaoTexto1 === "Apurar"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : item.acaoTexto1 === "Preparar"
                        ? "bg-purple-700 hover:bg-purple-800"
                        : "bg-[#082B66] hover:bg-[#0A357D]"
                    }`}
                  >
                    {item.acaoTexto1 === "Apurar" ? (
                      <Cpu className="w-3 h-3" />
                    ) : item.acaoTexto1 === "Preparar" ? (
                      <Layers className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    <span>{item.acaoTexto1}</span>
                  </button>

                  {/* Ação 2 (Pagar / Gerar Guia / Transmitir / Enviar) */}
                  <button
                    onClick={() => {
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
                    }}
                    className={`px-2.5 py-1 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-2xs flex items-center gap-1 ${
                      item.acaoTexto2 === "Pagar"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : item.acaoTexto2.includes("Gerar")
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-indigo-700 hover:bg-indigo-800"
                    }`}
                  >
                    {item.acaoTexto2 === "Pagar" ? (
                      <CreditCard className="w-3 h-3" />
                    ) : item.acaoTexto2.includes("Gerar") ? (
                      <FileSpreadsheet className="w-3 h-3" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>{item.acaoTexto2}</span>
                  </button>
                </div>

                {/* Lixeira para Excluir */}
                <button
                  onClick={() => {
                    setItemSelecionado(item);
                    setModalAtivo("excluir");
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                  title="Excluir este lembrete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade de Navegação Rápida aos Módulos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              Acesso Rápido a Todos os Módulos
            </h2>
            <p className="text-xs text-slate-500">
              Clique em qualquer módulo para abrir diretamente a respectiva tela de trabalho.
            </p>
          </div>
          {onRunAudit && (
            <button
              onClick={onRunAudit}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition cursor-pointer shadow-xs hidden sm:flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Rodar Auditoria</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modulosPrincipais.map((mod) => {
            const Icon = mod.icone;
            return (
              <div
                key={mod.id}
                onClick={() => onNavigateTab(mod.id)}
                className="bg-white border border-slate-300/80 hover:border-blue-500 hover:shadow-xs p-4 rounded-xl transition cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[#EEF4F9] border border-[#CBD5E1] flex items-center justify-center text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mod.tagCor}`}>
                      {mod.tag}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-blue-700 transition">
                    {mod.titulo}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {mod.subtitulo}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700 group-hover:text-blue-900">
                  <span>Abrir tela</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Módulo Especial: Reforma Tributária IBS / CBS 2026 */}
      <div className="pt-1">
        <IbsCbsReformaCard />
      </div>

      {/* Dica Operacional e Atalhos */}
      <div className="bg-[#EEF4F9] border border-[#CBD5E1] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-700">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            <strong>Dica de Produtividade:</strong> A qualquer momento, clique em <strong>"Tela Inicial"</strong> na barra superior ou no menu lateral para retornar a este painel geral.
          </span>
        </div>
        <button
          onClick={() => onNavigateTab("fluxo-previtico")}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 shadow-xs"
        >
          Ir para Fluxo Prevítico →
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODAIS INTERATIVOS (AÇÕES REAIS DA TELA INICIAL)          */}
      {/* ========================================================= */}
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

      {modalAtivo === "excluir" && itemSelecionado && (
        <ExcluirModal
          item={itemSelecionado}
          onClose={() => {
            setModalAtivo(null);
            setItemSelecionado(null);
          }}
          onConfirmar={handleExcluirLembrete}
        />
      )}
    </div>
  );
};
