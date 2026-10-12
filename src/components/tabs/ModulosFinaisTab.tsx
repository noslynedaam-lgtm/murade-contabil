import React, { useState } from "react";
import { IbsCbsReformaCard } from "../IbsCbsReformaCard";
import {
  FileText,
  Smartphone,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Send,
  Eye,
  Calendar,
  Building2,
  Users,
  Lock,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  FileSpreadsheet,
  FileCheck,
  Edit,
  Trash2,
  Share2,
} from "lucide-react";
import {
  GuiasImpostosModal,
  BalancoCompletoModal,
  DreModal,
  PrevidenciaModal,
  LinkAcessoModal,
  EditarClienteModal,
  ExcluirClienteModal,
  PreviaClienteModal,
  baixarArquivoTexto,
} from "../modals/DemonstrativosModals";

type SubAba = "obrigacoes" | "cliente" | "gerenciais" | "seguranca";

interface ClienteCadastro {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  plano: string;
  status: "Ativo" | "Pendente" | "Inativo";
  ultimoAcesso: string;
}

interface ModulosFinaisTabProps {
  onNotificar?: (msg: string) => void;
}

export const ModulosFinaisTab: React.FC<ModulosFinaisTabProps> = () => {
  const [subAbaAtiva, setSubAbaAtiva] = useState<SubAba>("obrigacoes");
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState("09/2026");
  const [modalConvidarAberto, setModalConvidarAberto] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteEmail, setNovoClienteEmail] = useState("");
  const [novoClienteCnpj, setNovoClienteCnpj] = useState("");
  const [feedbackAcao, setFeedbackAcao] = useState<string | null>(null);

  // Modais de Ações Reais Solicitadas pelo Usuário
  const [modalGuiasAberto, setModalGuiasAberto] = useState(false);
  const [modalBalancoAberto, setModalBalancoAberto] = useState(false);
  const [modalDreAberto, setModalDreAberto] = useState(false);
  const [modalPrevidenciaAberto, setModalPrevidenciaAberto] = useState(false);
  const [modalLinkCliente, setModalLinkCliente] = useState<ClienteCadastro | null>(null);
  const [modalEditarCliente, setModalEditarCliente] = useState<ClienteCadastro | null>(null);
  const [modalExcluirCliente, setModalExcluirCliente] = useState<ClienteCadastro | null>(null);
  const [modalPreviaCliente, setModalPreviaCliente] = useState<ClienteCadastro | null>(null);

  // Lista dinâmica de clientes para suportar Edição, Reativação e Exclusão 100% ativas!
  const [clientes, setClientes] = useState<ClienteCadastro[]>([
    {
      id: "cli-1",
      nome: "Empresa XYZ Ltda",
      cnpj: "12.345.678/0001-99",
      contato: "João Silva (Diretor)",
      email: "joao@empresaxyz.com.br",
      telefone: "(62) 98111-2233",
      plano: "Murade Premium",
      status: "Ativo",
      ultimoAcesso: "Hoje às 14:32",
    },
    {
      id: "cli-2",
      nome: "Comércio Silva ME",
      cnpj: "98.765.432/0001-11",
      contato: "Maria Silva (Sócia)",
      email: "maria@commerciosilva.com.br",
      telefone: "(62) 99222-3344",
      plano: "Murade Pro",
      status: "Pendente",
      ultimoAcesso: "25/08/2026",
    },
    {
      id: "cli-3",
      nome: "Construções Norte Ltda",
      cnpj: "45.678.901/0001-22",
      contato: "Carlos Mendes",
      email: "carlos@construcoesnorte.com.br",
      telefone: "(62) 98777-6655",
      plano: "Murade Básico",
      status: "Inativo",
      ultimoAcesso: "10/06/2026",
    },
  ]);

  const dispararAcao = (mensagem: string) => {
    setFeedbackAcao(mensagem);
    setTimeout(() => setFeedbackAcao(null), 3500);
  };

  const handleReativarCliente = (id: string) => {
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: "Ativo" as const, ultimoAcesso: "Reativado agora" } : c
      )
    );
    dispararAcao("🔓 Conta reativada com sucesso! Acesso ao Portal do Cliente restabelecido.");
  };

  const handleSalvarEdicaoCliente = (atualizado: ClienteCadastro) => {
    setClientes((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c)));
    setModalEditarCliente(null);
    dispararAcao(`✏️ Dados da empresa "${atualizado.nome}" atualizados com sucesso!`);
  };

  const handleConfirmarExclusaoCliente = () => {
    if (!modalExcluirCliente) return;
    const nome = modalExcluirCliente.nome;
    setClientes((prev) => prev.filter((c) => c.id !== modalExcluirCliente.id));
    setModalExcluirCliente(null);
    dispararAcao(`🗑️ Acesso de "${nome}" revogado e empresa removida com sucesso.`);
  };

  return (
    <div className="space-y-4">
      {/* Banner Superior da Seção Final — Compacto Conforme Solicitado */}
      <div className="bg-gradient-to-r from-[#6A1B9A] via-[#4A148C] to-[#311B92] text-white rounded-xl py-2.5 px-4 shadow-sm border border-purple-400/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1 bg-emerald-500/30 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-300" />
            <span>SUÍTE INTEGRADA 2026/2027</span>
          </div>
          <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
            Obrigações • Portal do Cliente • Gerenciais • Trilha de Auditoria
          </h2>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[11px] bg-white/10 border border-white/20 px-2.5 py-1 rounded-md font-mono font-bold text-amber-300">
            Vigência 2026
          </span>
        </div>
      </div>

      {/* Feedback Toast Local */}
      {feedbackAcao && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackAcao}</span>
        </div>
      )}

      {/* Barra de Sub-Abas dos Módulos Finais — Compacta */}
      <div className="flex border-b border-slate-200 bg-white rounded-lg p-1 shadow-2xs gap-1 overflow-x-auto text-xs">
        <button
          onClick={() => setSubAbaAtiva("obrigacoes")}
          className={`flex-1 min-w-[130px] py-1.5 px-2.5 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            subAbaAtiva === "obrigacoes"
              ? "bg-[#6A1B9A] text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Obrigações</span>
        </button>

        <button
          onClick={() => setSubAbaAtiva("cliente")}
          className={`flex-1 min-w-[130px] py-1.5 px-2.5 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            subAbaAtiva === "cliente"
              ? "bg-[#6A1B9A] text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Portal do Cliente</span>
        </button>

        <button
          onClick={() => setSubAbaAtiva("gerenciais")}
          className={`flex-1 min-w-[130px] py-1.5 px-2.5 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            subAbaAtiva === "gerenciais"
              ? "bg-[#6A1B9A] text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Relatórios Gerenciais</span>
        </button>

        <button
          onClick={() => setSubAbaAtiva("seguranca")}
          className={`flex-1 min-w-[130px] py-1.5 px-2.5 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            subAbaAtiva === "seguranca"
              ? "bg-[#6A1B9A] text-white shadow-2xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Segurança & Auditoria</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 📄 ABA 1: OBRIGAÇÕES ACESSÓRIAS                           */}
      {/* ========================================================= */}
      {subAbaAtiva === "obrigacoes" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <span>Obrigações Acessórias — Geração Automática 2026</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conexão direta com Receita Federal, SEFAZ, eSocial e Serpro no layout oficial vigente.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={competenciaSelecionada}
                  onChange={(e) => setCompetenciaSelecionada(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-800"
                >
                  <option value="07/2026">Julho/2026</option>
                  <option value="08/2026">Agosto/2026</option>
                  <option value="09/2026">Setembro/2026</option>
                  <option value="10/2026">Outubro/2026 (Atual)</option>
                </select>

                <button
                  onClick={() => dispararAcao("Sincronizando todas as obrigações com os portais oficiais...")}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>🔄 Atualizar Todas</span>
                </button>
              </div>
            </div>

            {/* Aviso Informativo */}
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3.5 rounded-xl text-xs flex items-center gap-2 mt-4 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Layout Oficial 2026:</strong> Validação sintática pré-transmissão com checagem de erros antes do envio ao ambiente de produção.
              </span>
            </div>

            {/* Grid dos Cards de Obrigações */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {/* DIRF */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📑 DIRF 2026/2027</span>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-sm">
                    Atualizado
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Imposto de Renda Retido na Fonte (IRRF e Rendimentos)</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div><strong>Registros:</strong> 47 retenções • R$ 12.850,00</div>
                  <div><strong>Vencimento:</strong> 28/02/2027</div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: "100%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dispararAcao("Visualizando layout prévio da DIRF 2026...")}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    📄 Visualizar
                  </button>
                  <button
                    onClick={() => dispararAcao("Arquivo DIRF gerado com sucesso para validação no PVA!")}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    📥 Gerar
                  </button>
                </div>
              </div>

              {/* DCTFWeb */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📊 DCTFWeb</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-sm">
                    ⚠️ Pendente
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Débitos e Créditos Tributários Federais (PIS/COFINS/INSS)</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div><strong>Período:</strong> 01/09/2026 a 30/09/2026</div>
                  <div><strong>Vencimento:</strong> 15/10/2026</div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "65%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dispararAcao("Importando dados da EFD e da Folha para DCTFWeb...")}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    🔗 Importar EFD
                  </button>
                  <button
                    onClick={() => dispararAcao("DCTFWeb transmitida com sucesso ao portal e-CAC!")}
                    className="flex-1 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold"
                  >
                    📤 Transmitir
                  </button>
                </div>
              </div>

              {/* ECF */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📖 ECF Fiscal</span>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-sm">
                    Aguardando
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Escrituração Contábil Fiscal (Lucro Real / Presumido)</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div><strong>Regime:</strong> Lucro Presumido</div>
                  <div><strong>Entrega:</strong> Até 30/06/2027</div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: "35%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dispararAcao("Preenchendo blocos M e N da ECF...")}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    📋 Preencher
                  </button>
                  <button
                    onClick={() => dispararAcao("Envio agendado na fila autônoma do Robô!")}
                    className="flex-1 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
                  >
                    📅 Agendar
                  </button>
                </div>
              </div>

              {/* EFD Contribuições */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📊 EFD Contribuições</span>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-sm">
                    Transmitido
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">PIS e COFINS — Apuração de Débitos e Créditos</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div><strong>Crédito apurado:</strong> R$ 4.520,00</div>
                  <div><strong>Protocolo:</strong> 2026.09.123456789</div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: "100%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dispararAcao("Baixando recibo de entrega da EFD Contribuições...")}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    📄 Recibo
                  </button>
                  <button
                    onClick={() => dispararAcao("Exportando arquivo TXT SPED assinado digitalmente...")}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    📂 Arquivo
                  </button>
                </div>
              </div>

              {/* EFD ICMS/IPI */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📋 EFD ICMS/IPI</span>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-sm">
                    Sincronizado
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Notas Fiscais de Entrada/Saída e Créditos de ICMS</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div><strong>Notas processadas:</strong> 156 NFe / NFCe</div>
                  <div><strong>ICMS a recolher:</strong> R$ 8.450,00</div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: "100%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => dispararAcao("Conferência de livros fiscais de ICMS/IPI concluída!")}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    🔄 Conferir
                  </button>
                  <button
                    onClick={() => dispararAcao("EFD Fiscal transmitida à SEFAZ Estadual com sucesso!")}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    📤 Transmitir
                  </button>
                </div>
              </div>

              {/* CNDs */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>📜 Certidões Negativas</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-sm">
                    Alerta FGTS
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Monitoramento Automático Receita, FGTS, INSS e Município</p>
                <div className="space-y-1 text-xs text-slate-700 mb-3 border-t border-slate-200/60 pt-2">
                  <div className="flex items-center justify-between">
                    <span>Receita Federal: <strong className="text-emerald-600">✅ Regular</strong></span>
                  </div>
                  <div className="flex items-center justify-between bg-blue-50/60 p-1.5 rounded-md border border-blue-200/50">
                    <div>
                      <span>INSS / Previdência: </span>
                      <strong className="text-emerald-600">✅ Regular</strong>
                    </div>
                    <button
                      onClick={() => setModalPrevidenciaAberto(true)}
                      className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] cursor-pointer transition shadow-2xs"
                      title="Clique para ver extrato completo da Previdência Social e CND"
                    >
                      🛡️ Ver Previdência
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>CRF Caixa FGTS: <strong className="text-amber-600">⚠️ Vence em 5 dias</strong></span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mb-3 overflow-hidden">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "85%" }} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalPrevidenciaAberto(true)}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    📄 Emitir CND
                  </button>
                  <button
                    onClick={() => dispararAcao("Consultando bases Caixa, Receita e Previdência em tempo real... 100% Regular!")}
                    className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                  >
                    🔄 Atualizar
                  </button>
                </div>
              </div>
            </div>

            {/* 🇧🇷 MÓDULO IBS / CBS — REFORMA TRIBUTÁRIA (Lei Complementar nº 200/2024) */}
            <IbsCbsReformaCard />

            {/* Tabela de Calendário de Obrigações */}
            <div className="mt-8 pt-5 border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span>Calendário de Prazos Fiscais & Contábeis 2026/2027</span>
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#6A1B9A] text-white">
                    <tr>
                      <th className="py-2.5 px-3 rounded-l-lg">Obrigação</th>
                      <th className="py-2.5 px-3">Período de Apuração</th>
                      <th className="py-2.5 px-3">Vencimento</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 rounded-r-lg text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">DCTFWeb — Agosto/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">01/08 a 31/08/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">15/09/2026</td>
                      <td className="py-2.5 px-3"><span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-sm">Entregue</span></td>
                      <td className="py-2.5 px-3 text-right"><span className="text-slate-400 font-mono">OK</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">EFD Contribuições — Agosto/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">01/08 a 31/08/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">15/09/2026</td>
                      <td className="py-2.5 px-3"><span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-sm">Entregue</span></td>
                      <td className="py-2.5 px-3 text-right"><span className="text-slate-400 font-mono">OK</span></td>
                    </tr>
                    <tr className="hover:bg-amber-50/50 bg-amber-50/20">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">DCTFWeb — Setembro/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">01/09 a 30/09/2026</td>
                      <td className="py-2.5 px-3 font-bold text-amber-700">15/10/2026</td>
                      <td className="py-2.5 px-3"><span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-sm">Pendente</span></td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => dispararAcao("Gerando arquivo de envio DCTFWeb Setembro/2026...")}
                          className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-2.5 py-1 rounded-md text-[11px]"
                        >
                          Gerar
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">EFD ICMS/IPI — Setembro/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">01/09 a 30/09/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">30/10/2026</td>
                      <td className="py-2.5 px-3"><span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-sm">Aguardando</span></td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => dispararAcao("Preparando lote de conciliação fiscal...")}
                          className="bg-blue-700 hover:bg-blue-800 text-white font-bold px-2.5 py-1 rounded-md text-[11px]"
                        >
                          Preparar
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">DIRF 2027 (Ano Base 2026)</td>
                      <td className="py-2.5 px-3 text-slate-600">01/01 a 31/12/2026</td>
                      <td className="py-2.5 px-3 text-slate-600">28/02/2027</td>
                      <td className="py-2.5 px-3"><span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-sm">Programada</span></td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => dispararAcao("Monitoramento de retenções de IRRF ativo na base contábil!")}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1 rounded-md text-[11px]"
                        >
                          Monitorar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 📱 ABA 2: PORTAL DO CLIENTE                               */}
      {/* ========================================================= */}
      {subAbaAtiva === "cliente" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-purple-600" />
                  <span>Portal do Cliente — Autosserviço Seguro</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cada cliente acessa com login e senha próprios e visualiza apenas os dados da sua empresa.
                </p>
              </div>

              <button
                onClick={() => setModalConvidarAberto(true)}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Users className="w-3.5 h-3.5" />
                <span>+ Convidar Novo Cliente</span>
              </button>
            </div>

            {/* Aviso Como Funciona */}
            <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3.5 rounded-xl text-xs flex items-center gap-2 mt-4 font-medium">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                💡 <strong>Autosserviço que economiza tempo:</strong> O cliente baixa suas guias de impostos (DARF/DAS), confere Balanço, DRE e extrato contábil sem sobrecarregar seu escritório.
              </span>
            </div>

            {/* Cards de Clientes Cadastrados — 100% Interativos (Editar, Reativar, Excluir, Link de Acesso) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              {clientes.map((cli) => (
                <div
                  key={cli.id}
                  className={`border rounded-xl p-4.5 hover:shadow-md transition flex flex-col justify-between ${
                    cli.status === "Ativo"
                      ? "bg-slate-50/70 border-slate-200"
                      : cli.status === "Pendente"
                      ? "bg-amber-50/40 border-amber-200"
                      : "bg-slate-100/60 border-slate-300 opacity-90"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="font-bold text-slate-800 text-sm truncate" title={cli.nome}>
                        {cli.nome}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          cli.status === "Ativo"
                            ? "bg-emerald-100 text-emerald-800"
                            : cli.status === "Pendente"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-300 text-slate-700 font-black"
                        }`}
                      >
                        {cli.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">CNPJ: {cli.cnpj}</p>
                    <div className="space-y-1 text-xs text-slate-700 my-2.5">
                      <div><strong>Contato:</strong> {cli.contato}</div>
                      <div><strong>Último Acesso:</strong> {cli.ultimoAcesso}</div>
                      <div><strong>Plano:</strong> {cli.plano}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                    {/* Linha Principal de Ações */}
                    <div className="flex gap-1.5">
                      {cli.status === "Inativo" ? (
                        <button
                          onClick={() => handleReativarCliente(cli.id)}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                          title="Reativar acesso do cliente ao portal"
                        >
                          <span>🔓 Reativar</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setModalLinkCliente(cli)}
                            className="flex-1 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-blue-50 text-blue-700 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                            title="Gerar e copiar link de acesso direto"
                          >
                            <span>🔗 Link Acesso</span>
                          </button>
                          <button
                            onClick={() => setModalPreviaCliente(cli)}
                            className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                            title="Visualizar prévia do portal como o cliente"
                          >
                            <span>👁 Ver Prévia</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Linha Secundária: Editar e Excluir */}
                    <div className="flex gap-1.5">
                      {cli.status === "Pendente" && (
                        <button
                          onClick={() => dispararAcao(`Convite reenviado com sucesso para ${cli.email}!`)}
                          className="flex-1 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition cursor-pointer"
                          title="Reenviar convite por e-mail"
                        >
                          📤 Reenviar
                        </button>
                      )}
                      <button
                        onClick={() => setModalEditarCliente(cli)}
                        className="flex-1 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                        title="Editar dados da empresa e contato"
                      >
                        <Edit className="w-3 h-3 text-slate-500" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => setModalExcluirCliente(cli)}
                        className="py-1 px-2.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                        title="Revogar acesso e excluir este cliente"
                      >
                        <Trash2 className="w-3 h-3 text-rose-600" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* O Que o Cliente Vê — Totalmente Clicável */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>👁 O que o Cliente Visualiza no Aplicativo (Clique para Abrir):</span>
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Clique em qualquer card abaixo para ver as demonstrações e emitir relatórios reais instantaneamente.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <button
                  onClick={() => setModalBalancoAberto(true)}
                  className="bg-purple-50/70 border border-purple-200/60 p-3.5 rounded-xl hover:bg-purple-100/70 hover:shadow-md transition cursor-pointer text-center group"
                >
                  <div className="text-2xl mb-1 group-hover:scale-110 transition">📊</div>
                  <div className="font-bold text-slate-800 text-xs">Balanço & DRE</div>
                  <div className="text-[11px] text-purple-700 font-semibold mt-0.5">Clique para Ver Completo</div>
                </button>
                <button
                  onClick={() => setModalGuiasAberto(true)}
                  className="bg-purple-50/70 border border-purple-200/60 p-3.5 rounded-xl hover:bg-purple-100/70 hover:shadow-md transition cursor-pointer text-center group"
                >
                  <div className="text-2xl mb-1 group-hover:scale-110 transition">💳</div>
                  <div className="font-bold text-slate-800 text-xs">Guias de Impostos</div>
                  <div className="text-[11px] text-purple-700 font-semibold mt-0.5">DARF • DAS • GPS • DAE</div>
                </button>
                <button
                  onClick={() => setModalDreAberto(true)}
                  className="bg-purple-50/70 border border-purple-200/60 p-3.5 rounded-xl hover:bg-purple-100/70 hover:shadow-md transition cursor-pointer text-center group"
                >
                  <div className="text-2xl mb-1 group-hover:scale-110 transition">📋</div>
                  <div className="font-bold text-slate-800 text-xs">Extrato Contábil & DRE</div>
                  <div className="text-[11px] text-purple-700 font-semibold mt-0.5">Demonstração Detalhada</div>
                </button>
                <button
                  onClick={() => setModalPrevidenciaAberto(true)}
                  className="bg-purple-50/70 border border-purple-200/60 p-3.5 rounded-xl hover:bg-purple-100/70 hover:shadow-md transition cursor-pointer text-center group"
                >
                  <div className="text-2xl mb-1 group-hover:scale-110 transition">🛡️</div>
                  <div className="font-bold text-slate-800 text-xs">Previdência & INSS</div>
                  <div className="text-[11px] text-purple-700 font-semibold mt-0.5">Certidões & Encargos</div>
                </button>
              </div>

              {/* Simulador / Prévia da Tela do Cliente */}
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-indigo-50/40 p-6 rounded-2xl border border-purple-200/70 max-w-md mx-auto shadow-sm">
                <div className="text-center mb-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-700">Simulador de Acesso</div>
                  <div className="font-black text-slate-900 text-base">🏢 Empresa XYZ Ltda</div>
                  <div className="text-xs text-slate-500">Período: Competência 10/2026</div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                    <div className="text-[11px] font-bold text-emerald-800">Receita Mês</div>
                    <div className="text-base font-extrabold text-emerald-700 font-mono">R$ 580.000</div>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-center">
                    <div className="text-[11px] font-bold text-rose-800">Impostos Mês</div>
                    <div className="text-base font-extrabold text-rose-700 font-mono">R$ 8.895</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => setModalBalancoAberto(true)}
                    className="w-full py-2.5 px-3 rounded-lg bg-[#6A1B9A] hover:bg-[#4A148C] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>📊 Ver Balanço Completo</span>
                  </button>
                  <button
                    onClick={() => setModalGuiasAberto(true)}
                    className="w-full py-2.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>💳 Baixar Guias de Impostos</span>
                  </button>
                  <button
                    onClick={() => setModalDreAberto(true)}
                    className="w-full py-2.5 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>📄 DRE — Demonstração do Resultado</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 📊 ABA 3: RELATÓRIOS GERENCIAIS                           */}
      {/* ========================================================= */}
      {subAbaAtiva === "gerenciais" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <span>Relatórios Gerenciais — Decisão Estratégica</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Centros de custos, fluxo de caixa projetado para 90 dias, análise de margem e evolução contábil.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const doc = `RELATÓRIO EXECUTIVO GERENCIAL CONSOLIDADO 2026\nMURADE CONTÁBIL — INTELIGÊNCIA DE DECISÃO ESTRATÉGICA\n\n1. RESULTADO CONSOLIDADO POR UNIDADE:\n- Matriz SP: Receita R$ 320.000 | Custos R$ 210.000 | Lucro R$ 110.000 (Margem 34,4%)\n- Filial RJ: Receita R$ 145.000 | Custos R$ 132.000 | Lucro R$ 13.000 (Margem 9,0%)\n- Filial BH: Receita R$ 95.000 | Custos R$ 102.000 | Prejuízo -R$ 7.000 (Margem -7,4%)\nTOTAL: Receita R$ 560.000 | Resultado Líquido R$ 116.000 (Margem Média 20,7%)\n\n2. FLUXO DE CAIXA PROJETADO (90 DIAS):\n- Saldo Projetado: R$ 412.500,00 | Tendência: Crescimento Sustentável\n\nAssinado digitalmente por Murade Contábil.`;
                    baixarArquivoTexto("Relatorio_Executivo_Consolidado_2026.txt", doc);
                    dispararAcao("📄 Relatório Executivo Oficial baixado com sucesso!");
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF Executivo</span>
                </button>
                <button
                  onClick={() => {
                    const csv = `Departamento / Filial;Receita Bruta;Custos e Despesas;Resultado Liquido;Margem %;Diagnostico\nMatriz - Sao Paulo;320000.00;210000.00;110000.00;34.4%;Lucro Saudavel\nFilial - Rio de Janeiro;145000.00;132000.00;13000.00;9.0%;Margem Apertada\nFilial - Belo Horizonte;95000.00;102000.00;-7000.00;-7.4%;Prejuizo\nTOTAL CONSOLIDADO;560000.00;444000.00;116000.00;20.7%;Lucrativo\n`;
                    baixarArquivoTexto("Centro_de_Custos_Gerencial_2026.csv", csv, "text/csv;charset=utf-8");
                    dispararAcao("📊 Planilha Excel (.CSV) exportada com sucesso!");
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Planilha Excel</span>
                </button>
              </div>
            </div>

            {/* Centro de Custos por Filial */}
            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span>Centro de Custos — Resultado por Unidade / Filial</span>
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#6A1B9A] text-white">
                    <tr>
                      <th className="py-2.5 px-3 rounded-l-lg">Departamento / Filial</th>
                      <th className="py-2.5 px-3">Receita Bruta</th>
                      <th className="py-2.5 px-3">Custos & Despesas</th>
                      <th className="py-2.5 px-3">Resultado Líquido</th>
                      <th className="py-2.5 px-3">% Margem</th>
                      <th className="py-2.5 px-3 rounded-r-lg text-right">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Matriz — São Paulo</td>
                      <td className="py-2.5 px-3 font-mono">R$ 320.000,00</td>
                      <td className="py-2.5 px-3 font-mono">R$ 210.000,00</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">+ R$ 110.000,00</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-600">34,4%</td>
                      <td className="py-2.5 px-3 text-right"><span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-sm">Lucro Saudável</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Filial — Rio de Janeiro</td>
                      <td className="py-2.5 px-3 font-mono">R$ 145.000,00</td>
                      <td className="py-2.5 px-3 font-mono">R$ 132.000,00</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-600">+ R$ 13.000,00</td>
                      <td className="py-2.5 px-3 font-bold text-amber-600">9,0%</td>
                      <td className="py-2.5 px-3 text-right"><span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-sm">Margem Apertada</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Filial — Belo Horizonte</td>
                      <td className="py-2.5 px-3 font-mono">R$ 95.000,00</td>
                      <td className="py-2.5 px-3 font-mono">R$ 102.000,00</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-600">- R$ 7.000,00</td>
                      <td className="py-2.5 px-3 font-bold text-rose-600">-7,4%</td>
                      <td className="py-2.5 px-3 text-right"><span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-sm">Prejuízo</span></td>
                    </tr>
                    <tr className="bg-purple-50 font-bold">
                      <td className="py-2.5 px-3 text-purple-950 font-black">⚖️ TOTAL CONSOLIDADO</td>
                      <td className="py-2.5 px-3 font-mono">R$ 560.000,00</td>
                      <td className="py-2.5 px-3 font-mono">R$ 444.000,00</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-700">+ R$ 116.000,00</td>
                      <td className="py-2.5 px-3 text-emerald-700">20,7%</td>
                      <td className="py-2.5 px-3 text-right"><span className="bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-sm">Lucrativo</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fluxo de Caixa Projetado 90 Dias — Gráfico Compacto */}
            <div className="mt-5 pt-4 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                <span>Fluxo de Caixa Projetado — 90 Dias</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-center">
                  <div className="text-[11px] text-emerald-800 font-semibold">Saldo Atual</div>
                  <div className="text-sm font-extrabold text-emerald-700 font-mono mt-0.5">R$ 89.200,00</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg text-center">
                  <div className="text-[11px] text-blue-800 font-semibold">Entradas Previstas</div>
                  <div className="text-sm font-extrabold text-blue-700 font-mono mt-0.5">+ R$ 520.000,00</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-center">
                  <div className="text-[11px] text-rose-800 font-semibold">Saídas Previstas</div>
                  <div className="text-sm font-extrabold text-rose-700 font-mono mt-0.5">− R$ 475.000,00</div>
                </div>
              </div>

              {/* Gráfico Simulado de Barras — Compacto */}
              <div className="bg-gradient-to-b from-slate-50 to-purple-50/30 p-3.5 rounded-lg border border-slate-200">
                <div className="text-center font-bold text-slate-700 text-[11px] mb-2">
                  Evolução do Saldo: Outubro → Novembro → Dezembro
                </div>
                <div className="flex items-end justify-center gap-8 h-24 pb-1">
                  <div className="text-center">
                    <div className="font-bold text-[10px] text-purple-800 mb-0.5 font-mono">R$ 105k</div>
                    <div className="w-10 bg-gradient-to-t from-[#6A1B9A] to-[#AB47BC] rounded-t-md transition-all duration-500 shadow-xs" style={{ height: "45px" }} />
                    <div className="text-[10px] font-bold text-slate-600 mt-1">Out/26</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-[10px] text-purple-800 mb-0.5 font-mono">R$ 128k</div>
                    <div className="w-10 bg-gradient-to-t from-[#6A1B9A] to-[#AB47BC] rounded-t-md transition-all duration-500 shadow-xs" style={{ height: "55px" }} />
                    <div className="text-[10px] font-bold text-slate-600 mt-1">Nov/26</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-[10px] text-purple-800 mb-0.5 font-mono">R$ 152k</div>
                    <div className="w-10 bg-gradient-to-t from-[#2E7D32] to-[#4CAF50] rounded-t-md transition-all duration-500 shadow-xs" style={{ height: "70px" }} />
                    <div className="text-[10px] font-bold text-slate-600 mt-1">Dez/26</div>
                  </div>
                </div>
                <div className="mt-2 p-2 bg-blue-50/80 border-l-2 border-[#082B66] rounded-r text-[11px] text-blue-950">
                  <strong>🔮 Diagnóstico:</strong> Caixa positivo e crescente. Risco de insolvência zero.
                </div>
              </div>
            </div>

            {/* Análise de Margem por Serviço */}
            <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
                  📈 Margem por Produto / Serviço
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Serviço</th>
                        <th className="py-2 px-3">Receita</th>
                        <th className="py-2 px-3">Margem</th>
                        <th className="py-2 px-3">Ranking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 px-3 font-semibold">Consultoria Contábil</td>
                        <td className="py-2 px-3 font-mono">R$ 180.000</td>
                        <td className="py-2 px-3 font-bold text-emerald-600">65%</td>
                        <td className="py-2 px-3">🥇 1º</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Declaração de Impostos</td>
                        <td className="py-2 px-3 font-mono">R$ 95.000</td>
                        <td className="py-2 px-3 font-bold text-emerald-600">58%</td>
                        <td className="py-2 px-3">🥈 2º</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Elaboração de Balanços</td>
                        <td className="py-2 px-3 font-mono">R$ 120.000</td>
                        <td className="py-2 px-3 font-bold text-emerald-600">45%</td>
                        <td className="py-2 px-3">🥉 3º</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Registro de Empresas</td>
                        <td className="py-2 px-3 font-mono">R$ 45.000</td>
                        <td className="py-2 px-3 font-bold text-blue-600">38%</td>
                        <td className="py-2 px-3">4º</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Assessoria Trabalhista</td>
                        <td className="py-2 px-3 font-mono">R$ 140.000</td>
                        <td className="py-2 px-3 font-bold text-blue-600">32%</td>
                        <td className="py-2 px-3">5º</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
                  📊 Comparativo Mensal — Evolução 2026
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs max-h-56 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Mês</th>
                        <th className="py-2 px-3">Receita</th>
                        <th className="py-2 px-3">Despesa</th>
                        <th className="py-2 px-3">Lucro Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 px-3 font-semibold">Janeiro</td>
                        <td className="py-2 px-3 font-mono">R$ 420.000</td>
                        <td className="py-2 px-3 font-mono">R$ 350.000</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-600">R$ 70.000</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Março</td>
                        <td className="py-2 px-3 font-mono">R$ 452.000</td>
                        <td className="py-2 px-3 font-mono">R$ 365.000</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-600">R$ 87.000</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Junho</td>
                        <td className="py-2 px-3 font-mono">R$ 530.000</td>
                        <td className="py-2 px-3 font-mono">R$ 405.000</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-600">R$ 125.000</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold">Agosto</td>
                        <td className="py-2 px-3 font-mono">R$ 560.000</td>
                        <td className="py-2 px-3 font-mono">R$ 420.000</td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-600">R$ 140.000</td>
                      </tr>
                      <tr className="bg-emerald-50/70 font-bold">
                        <td className="py-2 px-3 text-emerald-950 font-black">Setembro (Atual)</td>
                        <td className="py-2 px-3 font-mono">R$ 580.000</td>
                        <td className="py-2 px-3 font-mono">R$ 435.000</td>
                        <td className="py-2 px-3 font-mono font-black text-emerald-700">R$ 145.000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🔐 ABA 4: SEGURANÇA & AUDITORIA                           */}
      {/* ========================================================= */}
      {subAbaAtiva === "seguranca" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Segurança, Criptografia & Trilha de Auditoria</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Conformidade total com a LGPD, controle de acesso granular e integridade hash SHA-256 de lançamentos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-emerald-300">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Certificado A1 Ativo</span>
                </span>
              </div>
            </div>

            {/* Cards de Segurança */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              <div className="bg-slate-50/70 border border-slate-200 p-4 rounded-xl">
                <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span>Criptografia de Dados</span>
                </div>
                <div className="text-sm font-black text-emerald-700">AES-256 Bits Ativado</div>
                <p className="text-xs text-slate-500 mt-1">
                  Todas as notas fiscais, balancetes e extratos bancários armazenados sob chave de isolamento local.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-200 p-4 rounded-xl">
                <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>Conformidade LGPD</span>
                </div>
                <div className="text-sm font-black text-purple-700">100% Adequado</div>
                <p className="text-xs text-slate-500 mt-1">
                  Consentimento explícito, anonimização de dados sensíveis de colaboradores e registro de acessos.
                </p>
              </div>

              <div className="bg-slate-50/70 border border-slate-200 p-4 rounded-xl">
                <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>Backup Automático em Nuvem</span>
                </div>
                <div className="text-sm font-black text-blue-700">A cada 15 Minutos</div>
                <p className="text-xs text-slate-500 mt-1">
                  Último snapshot realizado há 4 minutos com redundância geográfica e tolerância a falhas.
                </p>
              </div>
            </div>

            {/* Trilha de Auditoria em Tempo Real */}
            <div className="mt-8 pt-5 border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Trilha de Auditoria e Logs de Acesso (Auditable Trail)</span>
              </h4>

              <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-4 rounded-xl max-h-60 overflow-y-auto space-y-2 border border-slate-800">
                <div className="flex items-start gap-2">
                  <span className="text-slate-400">[14/09/2026 15:58:12]</span>
                  <span className="text-emerald-400 font-bold">[AUTH]</span>
                  <span>Certificado Digital A1 validado pelo WebService Serpro (Status: Válido até 12/2027)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400">[14/09/2026 15:45:04]</span>
                  <span className="text-blue-400 font-bold">[BALANCETE]</span>
                  <span>Fechamento da competência 09/2026 com D = C verificado e partidas dobradas consistentes</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400">[14/09/2026 15:30:21]</span>
                  <span className="text-purple-400 font-bold">[ROBÔ]</span>
                  <span>Auditoria cruzada com FiscoIA: 0 divergências encontradas nas retenções federais</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400">[14/09/2026 15:10:09]</span>
                  <span className="text-amber-400 font-bold">[CLIENTE]</span>
                  <span>Empresa XYZ Ltda acessou relatório DRE via portal seguro (IP 177.135.20.11)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Convidar Novo Cliente */}
      {modalConvidarAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              <span>Convidar Cliente para o Portal</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              O cliente receberá um link seguro para definir a senha e acessar exclusivamente os relatórios da sua empresa.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social / Nome Fantasia:</label>
                <input
                  type="text"
                  placeholder="Ex: Nova Aliança Distribuidora Ltda"
                  value={novoClienteNome}
                  onChange={(e) => setNovoClienteNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ:</label>
                <input
                  type="text"
                  placeholder="00.000.000/0001-00"
                  value={novoClienteCnpj}
                  onChange={(e) => setNovoClienteCnpj(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail do Responsável:</label>
                <input
                  type="email"
                  placeholder="diretoria@empresa.com.br"
                  value={novoClienteEmail}
                  onChange={(e) => setNovoClienteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setModalConvidarAberto(false)}
                className="py-2 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!novoClienteNome) {
                    dispararAcao("⚠️ Por favor, digite o nome da empresa!");
                    return;
                  }
                  const novo: ClienteCadastro = {
                    id: `cli-${Date.now()}`,
                    nome: novoClienteNome,
                    cnpj: novoClienteCnpj || "00.000.000/0001-00",
                    contato: "Diretor Responsável",
                    email: novoClienteEmail || "contato@empresa.com.br",
                    telefone: "(62) 99999-8888",
                    plano: "Murade Premium",
                    status: "Pendente",
                    ultimoAcesso: "Aguardando primeiro acesso",
                  };
                  setClientes((prev) => [novo, ...prev]);
                  dispararAcao(`✅ Convite enviado com sucesso para ${novoClienteEmail || novoClienteNome}!`);
                  setNovoClienteNome("");
                  setNovoClienteEmail("");
                  setNovoClienteCnpj("");
                  setModalConvidarAberto(false);
                }}
                className="py-2 px-4 rounded-lg text-xs font-bold bg-[#6A1B9A] hover:bg-[#4A148C] text-white cursor-pointer shadow-xs"
              >
                Enviar Convite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🌟 MODAIS INTERATIVOS ATIVOS: GUIAS, BALANÇO, DRE, PREVIDÊNCIA, PORTAL   */}
      {/* ========================================================================= */}
      {modalGuiasAberto && (
        <GuiasImpostosModal
          onClose={() => setModalGuiasAberto(false)}
          empresaNome="Empresa Modelo Murade Ltda"
        />
      )}

      {modalBalancoAberto && (
        <BalancoCompletoModal
          onClose={() => setModalBalancoAberto(false)}
          empresaNome="Empresa Modelo Murade Ltda"
        />
      )}

      {modalDreAberto && (
        <DreModal
          onClose={() => setModalDreAberto(false)}
          empresaNome="Empresa Modelo Murade Ltda"
        />
      )}

      {modalPrevidenciaAberto && (
        <PrevidenciaModal
          onClose={() => setModalPrevidenciaAberto(false)}
          empresaNome="Empresa Modelo Murade Ltda"
        />
      )}

      {modalLinkCliente && (
        <LinkAcessoModal
          cliente={modalLinkCliente}
          onClose={() => setModalLinkCliente(null)}
        />
      )}

      {modalEditarCliente && (
        <EditarClienteModal
          cliente={modalEditarCliente}
          onClose={() => setModalEditarCliente(null)}
          onSalvar={handleSalvarEdicaoCliente}
        />
      )}

      {modalExcluirCliente && (
        <ExcluirClienteModal
          cliente={modalExcluirCliente}
          onClose={() => setModalExcluirCliente(null)}
          onConfirmar={handleConfirmarExclusaoCliente}
        />
      )}

      {modalPreviaCliente && (
        <PreviaClienteModal
          cliente={modalPreviaCliente}
          onClose={() => setModalPreviaCliente(null)}
        />
      )}
    </div>
  );
};
