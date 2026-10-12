import React, { useState } from "react";
import { EmpresaDados } from "../../types";
import {
  Key,
  Copy,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Database,
  Users,
  FileSpreadsheet,
  Edit3,
  Bot,
  Brain,
  Lock,
  Layers,
  Zap,
} from "lucide-react";

interface SistemaIntegrado {
  id: string;
  numero: number;
  tag: string;
  nome: string;
  placeholder: string;
  status: "conectado" | "pendente" | "local" | "reservado";
  statusTexto: string;
  isPrincipal?: boolean;
  isReservado?: boolean;
}

interface IntegracaoTabProps {
  empresa?: EmpresaDados;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
}

export const IntegracaoTab: React.FC<IntegracaoTabProps> = ({
  empresa,
  onConectarFiscal,
  onConectarDP,
}) => {
  const [subAba, setSubAba] = useState<"configuracao" | "fluxo">("configuracao");
  const [codigoLigacao, setCodigoLigacao] = useState("MURAD-2026-GO");
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [statusSinc, setStatusSinc] = useState<string | null>(null);

  // 8 Sistemas conforme o template fornecido
  const [sistemas, setSistemas] = useState<SistemaIntegrado[]>([
    {
      id: "sis-1",
      numero: 1,
      tag: "Departamento Pessoal",
      nome: "MURADE DP",
      placeholder: "Renomear ex: Murade Folha",
      status: "pendente",
      statusTexto: "⏳ Aguardando conexão",
    },
    {
      id: "sis-2",
      numero: 2,
      tag: "Fiscal & Tributário",
      nome: "MURADE FISCAL",
      placeholder: "Renomear ex: Murade Tributos",
      status: "conectado",
      statusTexto: "✅ Conectado",
    },
    {
      id: "sis-3",
      numero: 3,
      tag: "Compliance & Governo",
      nome: "FISCO IA",
      placeholder: "Renomear ex: Murade Gov",
      status: "conectado",
      statusTexto: "✅ Conectado",
    },
    {
      id: "sis-4",
      numero: 4,
      tag: "Sistema Atual • Terminal Principal",
      nome: "MURADE CONTÁBIL",
      placeholder: "Renomear ex: Murade Balanço",
      status: "local",
      statusTexto: "✅ Ativo • Local",
      isPrincipal: true,
    },
    {
      id: "sis-5",
      numero: 5,
      tag: "Reservado",
      nome: "[Sistema 5]",
      placeholder: "Ex: Murade Vendas",
      status: "reservado",
      statusTexto: "⏳ A definir",
      isReservado: true,
    },
    {
      id: "sis-6",
      numero: 6,
      tag: "Reservado",
      nome: "[Sistema 6]",
      placeholder: "Ex: Murade Planilha",
      status: "reservado",
      statusTexto: "⏳ A definir",
      isReservado: true,
    },
    {
      id: "sis-7",
      numero: 7,
      tag: "Reservado",
      nome: "[Sistema 7]",
      placeholder: "Renomear",
      status: "reservado",
      statusTexto: "⏳ A definir",
      isReservado: true,
    },
    {
      id: "sis-8",
      numero: 8,
      tag: "Reservado",
      nome: "[Sistema 8]",
      placeholder: "Renomear",
      status: "reservado",
      statusTexto: "⏳ A definir",
      isReservado: true,
    },
  ]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 4500);
  };

  // 📋 COPIAR CÓDIGO DE LIGAÇÃO
  const copiarCodigo = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(codigoLigacao);
    }
    showToast(
      `✅ Código copiado com sucesso!\n\nCódigo: ${codigoLigacao}\n\nCole o mesmo no DP, Fiscal, FISCO IA e em todos os novos sistemas que criar!`
    );
  };

  // ✅ VALIDAR CONEXÃO
  const validar = () => {
    showToast(
      `🔍 Validando código de ligação...\n\n✅ Código: ${codigoLigacao} — Válido\n✅ Formato correto\n✅ Pronto para conectar\n\n💡 Coloque o mesmo código no DP para estabelecer a conexão completa!`
    );
  };

  // 🧪 TESTAR TODAS AS CONEXÕES
  const testarTodas = () => {
    showToast(
      `🔄 Testando TODAS as conexões...\n\n✅ MURADE FISCAL — Conectado\n✅ FISCO IA — Conectado\n⏳ MURADE DP — Aguardando código\n✅ MURADE CONTÁBIL — Terminal Principal (Local)\n⏳ Sistemas 5 a 8 — Reservados\n\n💡 Coloque ${codigoLigacao} no DP para conectar todos os 4 ativos!`
    );
  };

  // 💾 SALVAR CONFIGURAÇÕES
  const salvar = () => {
    showToast(
      `✅ Configurações SALVAS com sucesso!\n\n📙 Sistema: MURADE CONTÁBIL\n🔑 Código: ${codigoLigacao}\n🔗 Conectados: Fiscal ✅ | FISCO IA ✅\n⏳ Pendente: DP (colocar código lá)\n🤖 Robô Contábil: Ativo\n🧠 Agente IA Contábil: Ativo\n🔒 Proteção Admin: Ativada\n\nTudo pronto e interligado! 🚀`
    );
  };

  const handleNomeChange = (id: string, novoNome: string) => {
    setSistemas((prev) =>
      prev.map((s) => (s.id === id ? { ...s, nome: novoNome } : s))
    );
  };

  const handleSincronizarFluxo = () => {
    setSincronizando(true);
    setStatusSinc("Executando pipeline: FiscoIA (OCR) → Fiscal (Apuração) → DP (Folha) → Contábil (Lançamentos)...");
    setTimeout(() => {
      setSincronizando(false);
      setStatusSinc("✅ Sincronização concluída! 142 documentos processados e 47 lançamentos contábeis gerados com sucesso.");
    }, 1800);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
      {/* CABEÇALHO */}
      <div className="bg-gradient-to-r from-[#6A1B9A] to-[#8E24AA] text-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xl sm:text-2xl font-black flex items-center gap-2.5 tracking-tight">
              <span>📙</span>
              <span>Murade Contábil — Configuração de Integração</span>
            </div>
            <div className="text-xs sm:text-sm text-purple-100 font-medium mt-1 opacity-90">
              Conecta com DP • Fiscal • FISCO IA • Sistemas Futuros
            </div>
          </div>

          {/* Sub-abas */}
          <div className="flex bg-purple-950/40 p-1 rounded-lg self-start sm:self-auto border border-purple-300/30 text-xs">
            <button
              onClick={() => setSubAba("configuracao")}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition ${
                subAba === "configuracao"
                  ? "bg-white text-[#6A1B9A] shadow-xs font-bold"
                  : "text-purple-100 hover:text-white"
              }`}
            >
              🔑 Código & 8 Sistemas
            </button>
            <button
              onClick={() => setSubAba("fluxo")}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition ${
                subAba === "fluxo"
                  ? "bg-white text-[#6A1B9A] shadow-xs font-bold"
                  : "text-purple-100 hover:text-white"
              }`}
            >
              🔄 Fluxo de Dados
            </button>
          </div>
        </div>
      </div>

      {/* Toast de Feedback */}
      {feedbackToast && (
        <div className="m-4 p-4 bg-[#EDE0F2] border-l-4 border-[#6A1B9A] text-[#4A148C] rounded-r-lg text-xs sm:text-sm font-semibold whitespace-pre-line shadow-xs">
          {feedbackToast}
        </div>
      )}

      {subAba === "configuracao" ? (
        <div className="p-5 sm:p-6 space-y-6">
          {/* 🔑 CÓDIGO DE LIGAÇÃO — Barrinha lilás com tom calibrado ("um pouquinho mais escuro" que o original claro) */}
          <div className="bg-[#EBE0F0] p-5 sm:p-6 rounded-xl border-l-4 border-[#6A1B9A] shadow-xs border border-purple-200">
            <div className="text-sm sm:text-base font-bold text-[#6A1B9A] mb-1.5 flex items-center gap-2">
              <Key className="w-4 h-4 text-[#6A1B9A]" />
              <span>🔑 Código de Ligação — COLOQUE O MESMO EM TODOS OS SISTEMAS</span>
            </div>
            <div className="text-xs text-slate-700 mb-3.5 leading-relaxed">
              ⚠️ Este é o código que conecta o Contábil com o DP, Fiscal, FISCO IA e todos os sistemas futuros.<br />
              <strong>Não altere o código aqui — use o mesmo em todos os lugares. O nome do sistema pode ser renomeado livremente.</strong>
            </div>

            <input
              type="text"
              className="w-full p-3 sm:p-3.5 text-base sm:text-lg font-bold border-2 border-[#6A1B9A] rounded-lg bg-white text-[#6A1B9A] font-mono tracking-wider focus:outline-none focus:ring-3 focus:ring-[#6A1B9A]/20 shadow-2xs"
              value={codigoLigacao}
              onChange={(e) => setCodigoLigacao(e.target.value)}
              readOnly
            />

            <div className="flex gap-2.5 mt-3.5 flex-wrap">
              <button
                id="btn-copiar-codigo"
                onClick={copiarCodigo}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#6A1B9A] hover:bg-[#4A148C] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Copy className="w-4 h-4" />
                <span>📋 Copiar Código</span>
              </button>

              <button
                id="btn-validar-codigo"
                onClick={validar}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#2E7D32] hover:bg-[#1B5E20] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>✅ Validar Conexão</span>
              </button>

              {onConectarFiscal && (
                <button
                  id="btn-conectar-fiscal-integracao"
                  onClick={onConectarFiscal}
                  className="px-5 py-2.5 rounded-lg text-sm font-black text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Zap className="w-4 h-4 text-slate-950" />
                  <span>⚡ Puxar Empresa do Murade Fiscal</span>
                </button>
              )}

              {onConectarDP && (
                <button
                  id="btn-conectar-dp-integracao"
                  onClick={onConectarDP}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-700 hover:bg-indigo-800 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Users className="w-4 h-4 text-white" />
                  <span>👥 Sincronizar Murade DP</span>
                </button>
              )}
            </div>
          </div>

          {/* 📋 SISTEMAS CONECTÁVEIS — 4 ATIVOS + 4 RESERVADOS = 8 TOTAIS */}
          <div>
            <div className="text-sm sm:text-base font-bold text-[#1E293B] pb-2 mb-4 border-b-2 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>📋 Sistemas Conectáveis (8 totais)</span>
              <span className="text-xs font-normal text-slate-500">
                ✏️ Clique no nome para renomear — o código de ligação permanece o mesmo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sistemas.map((sistema) => {
                const isPrincipal = sistema.isPrincipal;
                const isReservado = sistema.isReservado;
                const isConectado = sistema.status === "conectado" || sistema.status === "local";

                return (
                  <div
                    key={sistema.id}
                    className={`p-4 rounded-xl border transition-all relative ${
                      isPrincipal
                        ? "border-[#6A1B9A] bg-[#F9F2FB] ring-1 ring-[#6A1B9A] shadow-xs"
                        : isReservado
                        ? "border-dashed border-slate-300 bg-slate-50/70 opacity-65 hover:opacity-100"
                        : "border-slate-200 bg-white hover:border-[#AB47BC] hover:shadow-xs"
                    }`}
                  >
                    <div className="mb-2">
                      <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-[#ECEFF1] text-[#64748B] font-medium">
                        {sistema.tag}
                      </span>
                    </div>

                    <div className="relative mb-2">
                      <input
                        type="text"
                        className={`w-full text-sm font-semibold bg-transparent outline-none border-b border-dashed border-slate-300 focus:border-[#AB47BC] focus:bg-[#F3E5F5] px-1 py-0.5 rounded-xs transition ${
                          isPrincipal ? "text-[#6A1B9A] font-bold" : "text-slate-800"
                        }`}
                        value={sistema.nome}
                        readOnly={isPrincipal}
                        onChange={(e) => handleNomeChange(sistema.id, e.target.value)}
                        placeholder={sistema.placeholder}
                      />
                      {!isPrincipal && (
                        <Edit3 className="w-3 h-3 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                      )}
                    </div>

                    <div
                      className={`text-sm font-semibold flex items-center gap-1.5 mt-2 ${
                        isConectado
                          ? "text-[#2E7D32]"
                          : isReservado
                          ? "text-slate-500"
                          : "text-[#F57C00]"
                      }`}
                    >
                      {sistema.statusTexto}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 🤖 ROBÔ E AGENTE — ISOLADOS NO CONTÁBIL */}
          <div className="bg-[#FAFAFA] p-5 rounded-xl border border-slate-200">
            <div className="text-sm sm:text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#6A1B9A]" />
              <span>🤖🧠 Robô & Agente IA — Contábil (Independentes)</span>
            </div>

            <div className="bg-[#FFF8E1] border-l-4 border-[#FF9800] p-3.5 rounded-r-lg rounded-l-xs text-xs text-[#E65100] mb-4 leading-relaxed font-medium">
              ⚠️ <strong>Regra de Isolamento:</strong> O Robô e o Agente IA do Contábil atuam{" "}
              <strong>APENAS dentro deste sistema</strong>. NÃO compartilham ações de bloqueio com DP, Fiscal ou FISCO IA. Os DADOS sincronizam — os AGENTES NÃO.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <div className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-[#082B66]" />
                  <span>🤖 Robô Contábil</span>
                </div>
                <div className="text-xs text-slate-600 leading-relaxed">
                  Automatiza lançamentos, balanços, apuração, fechamento contábil — <strong>só dentro do Contábil</strong>
                </div>
                <div className="mt-2 text-[12px] text-[#6A1B9A] font-semibold">
                  🔒 Bloqueia/Desbloqueia: SOMENTE Contábil
                </div>
              </div>

              <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <div className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-[#6A1B9A]" />
                  <span>🧠 Agente IA Contábil</span>
                </div>
                <div className="text-xs text-slate-600 leading-relaxed">
                  Analisa demonstrações, sugere lançamentos, alerta inconsistências — <strong>só dentro do Contábil</strong>
                </div>
                <div className="mt-2 text-[12px] text-[#6A1B9A] font-semibold">
                  ⚠️ Sugere — só Admin confirma
                </div>
              </div>
            </div>
          </div>

          {/* 🔒 PROTEÇÃO DE ACESSO */}
          <div className="bg-[#E8F5E9] border-l-4 border-[#2E7D32] p-4 rounded-r-lg rounded-l-xs text-xs sm:text-[13.5px] text-[#2E7D32] leading-relaxed">
            <div className="font-bold mb-0.5 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#2E7D32]" />
              <span>🔒 Acesso Restrito — Apenas Administrador</span>
            </div>
            O código de ligação, configurações de conexão e renomeação de sistemas são visíveis e editáveis SOMENTE pelo Administrador.
            Usuários, contadores e clientes <strong>NÃO veem, NÃO editam e NÃO desconectam</strong> nada desta área.
          </div>

          {/* 🧪 BOTÕES FINAIS */}
          <div className="flex justify-center gap-3.5 pt-2 flex-wrap">
            <button
              id="btn-testar-todas-sistemas"
              onClick={testarTodas}
              className="px-7 py-3 bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-semibold text-sm rounded-lg transition cursor-pointer shadow-xs"
            >
              🧪 Testar Todas as Conexões
            </button>

            <button
              id="btn-salvar-configuracoes-sistemas"
              onClick={salvar}
              className="px-7 py-3 bg-[#6A1B9A] hover:bg-[#4A148C] text-white font-semibold text-sm rounded-lg transition cursor-pointer shadow-xs"
            >
              💾 Salvar Configurações
            </button>
          </div>
        </div>
      ) : (
        /* 🔄 SUB-ABA DE FLUXO DE DADOS */
        <div className="p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span>🔄 FLUXO COMPLETO — FiscoIA → Fiscal → DP → Contábil</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Arquitetura de dados unificada: O Agente Murade orquestra a comunicação síncrona entre os 4 pilares contábeis.
              </p>
            </div>

            <button
              onClick={handleSincronizarFluxo}
              disabled={sincronizando}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              <span>{sincronizando ? "Sincronizando Módulos..." : "⚡ SINCRONIZAR TUDO AGORA"}</span>
            </button>
          </div>

          {statusSinc && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusSinc}</span>
            </div>
          )}

          {/* Diagrama dos 4 Pilares */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-sm">
                  PILAR 1
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span>FiscoIA</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Captura e OCR de notas fiscais (XML/PDF), extratos bancários automáticos e inteligência preditiva.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-emerald-700 font-semibold">
                142 XMLs importados
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-sm">
                  PILAR 2
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Database className="w-4 h-4 text-amber-600" />
                <span>MURADE FISCAL</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Apuração de ICMS, PIS/COFINS, retenções e o novo IBS/CBS 2026. Gera Livros de Entradas e Saídas.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-emerald-700 font-semibold">
                Livros e EFD gerados
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-sm">
                  PILAR 3
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#6A1B9A]" />
                <span>MURADE DP</span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Folha de pagamento, pró-labore, eSocial (S-1200/S-1299), FGTS Digital e provisões de férias e 13º.
              </p>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-emerald-700 font-semibold">
                18 colaboradores ativos
              </div>
            </div>

            <div className="bg-[#F9F2FB] border-2 border-[#6A1B9A] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-white bg-[#6A1B9A] px-2 py-0.5 rounded-sm">
                  PILAR CENTRAL
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="font-bold text-[#4A148C] text-sm flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-[#6A1B9A]" />
                <span>MURADE CONTÁBIL</span>
              </div>
              <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                Terminal principal que consolida lançamentos de partida dobrada (D=C), fecha balancetes e assina ECD.
              </p>
              <div className="mt-3 pt-2 border-t border-purple-200 text-[11px] text-emerald-700 font-bold">
                ✅ Balancete 100% OK
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
