import React, { useState } from "react";
import { TabId, OrgaoConectado, EmpresaDados, LancamentoContabil, ContaPlano, LivroContabil, LembreteItem } from "./types";
import { initialEmpresa, orgaosIniciais, lancamentosIniciais, planoContasPadrao, livrosIniciais, lembretesIniciais } from "./data/mockData";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { BannerHero } from "./components/BannerHero";
import { RobotSidebar } from "./components/RobotSidebar";
import { InicioTab } from "./components/tabs/InicioTab";
import { ConexoesTab } from "./components/tabs/ConexoesTab";
import { EmpresaTab } from "./components/tabs/EmpresaTab";
import { LancamentosTab } from "./components/tabs/LancamentosTab";
import { BalanceteTab } from "./components/tabs/BalanceteTab";
import { LivrosTab } from "./components/tabs/LivrosTab";
import { PlanoContasTab } from "./components/tabs/PlanoContasTab";
import { IntegracaoTab } from "./components/tabs/IntegracaoTab";
import { AgenteTab } from "./components/tabs/AgenteTab";
import { IAPremiumTab } from "./components/tabs/IAPremiumTab";
import { AgendaTab } from "./components/tabs/AgendaTab";
import { CalculadoraTab } from "./components/tabs/CalculadoraTab";
import { FluxoPreviticoTab } from "./components/tabs/FluxoPreviticoTab";
import { ModulosFinaisTab } from "./components/tabs/ModulosFinaisTab";
import { ordenarContasPorSequenciaNumerica } from "./utils/planoContasUtils";
import { ModalConexaoMuradFiscal } from "./components/modals/ModalConexaoMuradFiscal";
import { conectarEPuxarEmpresaMuradFiscal, conectarMuradDP } from "./services/integracaoMuradService";
import { CheckCircle2, X } from "lucide-react";

export default function App() {
  const [tabAtiva, setTabAtiva] = useState<TabId>("inicio");
  const [empresa, setEmpresa] = useState<EmpresaDados>(initialEmpresa);
  const [orgaos, setOrgaos] = useState<OrgaoConectado[]>(orgaosIniciais);
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>(lancamentosIniciais);
  const [contas, setContas] = useState<ContaPlano[]>(() =>
    ordenarContasPorSequenciaNumerica(planoContasPadrao)
  );
  const [livros, setLivros] = useState<LivroContabil[]>(livrosIniciais);
  const [lembretes, setLembretes] = useState<LembreteItem[]>(lembretesIniciais);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Estados de controle e feedback
  const [isTestingOrgaos, setIsTestingOrgaos] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);
  const [empresaFiscalDetectada, setEmpresaFiscalDetectada] = useState<EmpresaDados | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "info" } | null>(null);

  const showToast = (text: string, type: "success" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Carregar dados salvos no localStorage na inicialização (expurgando mocks de teste)
  React.useEffect(() => {
    try {
      const savedEmpresa = localStorage.getItem("murad_empresa_salva");
      if (savedEmpresa) {
        const parsed = JSON.parse(savedEmpresa);
        if (
          parsed.razaoSocial?.includes("EMPRESA EXEMPLO") ||
          parsed.cnpj === "00.000.000/0001-00"
        ) {
          localStorage.removeItem("murad_empresa_salva");
          localStorage.removeItem("murad_empresas_lista");
          setEmpresa(initialEmpresa);
        } else if (parsed.razaoSocial || parsed.cnpj) {
          setEmpresa((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch (e) {
      console.warn("Erro ao restaurar do localStorage:", e);
    }
  }, []);

  // 1. Testar conexões com todos os órgãos em TEMPO REAL (Chamada ao Gateway Oficial)
  const handleTestarConexoes = async () => {
    setIsTestingOrgaos(true);
    showToast("Robô Murade: Executando handshake real com servidores da Receita Federal, SEFAZ, eSocial, PGFN e portais públicos...", "info");
    
    try {
      const resp = await fetch("/api/orgaos/status");
      if (resp.ok) {
        const data = await resp.json();
        const resultadosMap = new Map<string, any>();
        (data.resultados || []).forEach((r: any) => resultadosMap.set(r.id, r));

        setOrgaos((prev) =>
          prev.map((org) => {
            const real = resultadosMap.get(org.id);
            if (real) {
              return {
                ...org,
                status: real.status,
                pingMs: real.pingMs,
                statusCode: real.statusCode,
                statusTexto: real.statusTexto,
                tls: real.tls,
                ultimaVerificacao: `Hoje às ${real.verificadoEm}`,
              };
            }
            return org;
          })
        );
        showToast(`Verificação de alcance concluída: ${data.totalTestados ?? 0} endereços consultados. Isso não confirma autenticação nem integração.` , "info");
      } else {
        throw new Error("Resposta inválida");
      }
    } catch (err) {
      console.warn("Falha no teste de alcance dos órgãos:", err);
      setOrgaos((prev) =>
        prev.map((org) => ({
          ...org,
          status: "offline",
          statusTexto: "Não foi possível verificar",
          ultimaVerificacao: "Falha na consulta",
        }))
      );
      showToast("Não foi possível verificar os endereços. Nenhuma autenticação foi confirmada.", "info");
    } finally {
      setIsTestingOrgaos(false);
    }
  };

  // Testar conexão de órgão individual em tempo real
  const handleTestarOrgaoIndividual = async (id: string) => {
    showToast(`🔄 Robô Murade testando canal direto com órgão '${id}'...`, "info");
    try {
      const resp = await fetch("/api/orgaos/status");
      if (resp.ok) {
        const data = await resp.json();
        const item = (data.resultados || []).find((r: any) => r.id === id);
        if (item) {
          setOrgaos((prev) =>
            prev.map((o) =>
              o.id === id
                ? {
                    ...o,
                    status: item.status,
                    pingMs: item.pingMs,
                    statusCode: item.statusCode,
                    statusTexto: item.statusTexto,
                    ultimaVerificacao: `Hoje às ${item.verificadoEm}`,
                  }
                : o
            )
          );
          showToast(`${item.nome}: resposta HTTP ${item.statusCode}; autenticação e integração não foram verificadas.`, "info");
          return;
        }
      }
    } catch (e) {
      console.warn("Erro no teste individual:", e);
    }
    setOrgaos((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, status: "offline", statusTexto: "Não foi possível verificar", ultimaVerificacao: "Falha na consulta" }
          : o
      )
    );
    showToast("Não foi possível verificar o endereço deste órgão.", "info");
  };

  const handleAtualizarOrgao = (id: string, updates: Partial<OrgaoConectado>) => {
    setOrgaos((prev) =>
      prev.map((org) => (org.id === id ? { ...org, ...updates } : org))
    );
    showToast("⚙️ Configurações do órgão atualizadas e salvas com sucesso!");
  };

  // 2. Rodar Auditoria Completa pelo Robô
  const handleRunAudit = () => {
    setIsAuditing(true);
    const invalidos = lancamentos.filter((item) =>
      !Number.isFinite(item.valor) || item.valor <= 0 || !item.contaDebitoCodigo || !item.contaCreditoCodigo
    );
    setIsAuditing(false);
    showToast(
      invalidos.length === 0
        ? `Conferência local concluída: ${lancamentos.length} lançamentos têm valor positivo e contas preenchidas. Isso não valida impostos, SPED ou folha.`
        : `Conferência local encontrou ${invalidos.length} lançamento(s) com valor ou conta inválidos.`,
      invalidos.length === 0 ? "info" : "success"
    );
  };

  // 3. Importar do Fiscal
  const handleImportarFiscal = () => {
    showToast("Integração com o módulo Fiscal não configurada. Nenhum lançamento foi importado.", "info");
  };

  // 4. Importar do DP
  const handleImportarDP = () => {
    showToast("Integração com Departamento Pessoal não configurada. Nenhum lançamento foi importado.", "info");
  };

  // 5. Gerar Todos os Lançamentos Sozinho
  const handleGerarTudo = () => {
    showToast("Consolidação automática ainda não está disponível. Conecte e valide as fontes antes de gerar lançamentos.", "info");
  };

  // 6. Fechar Mês no Balancete
  const handleFecharMes = () => {
    showToast("Fechamento não realizado: conclua e confira os lançamentos antes de encerrar a competência.", "info");
  };

  // 7. Transmitir Todos os Livros
  const handleTransmitirTodos = () => {
    setIsTransmitting(false);
    showToast("Transmissão indisponível: configure certificado, procuração e integração oficial. Nada foi transmitido.", "info");
  };

  // 8. CONECTAR AO MURADE FISCAL E PUXAR EMPRESA REAL DO MURADE FISCAL
  const handleConectarMuradFiscal = async () => {
    showToast("🔄 Conectando ao Murade Fiscal e buscando empresa cadastrada...", "info");
    try {
      const res = await conectarEPuxarEmpresaMuradFiscal();
      if (res.sucesso && res.empresa) {
        setEmpresaFiscalDetectada(res.empresa);
        setEmpresa(res.empresa);
        setModalFiscalAberto(true);

        // Persistir localmente
        localStorage.setItem("murad_empresa_salva", JSON.stringify(res.empresa));
        try {
          const salvas = JSON.parse(localStorage.getItem("murad_empresas_lista") || "[]");
          const filtradas = salvas.filter(
            (e: any) =>
              e.cnpj &&
              res.empresa.cnpj &&
              e.cnpj.replace(/\D/g, "") !== res.empresa.cnpj.replace(/\D/g, "")
          );
          localStorage.setItem(
            "murad_empresas_lista",
            JSON.stringify([res.empresa, ...filtradas])
          );
        } catch (e) {
          console.warn("Erro ao atualizar lista:", e);
        }

        // Se vieram lançamentos fiscais vinculados
        if (res.lancamentosFiscais && res.lancamentosFiscais.length > 0) {
          setLancamentos((prev) => {
            const novos = res.lancamentosFiscais.filter(
              (nl: any) => !prev.some((p) => p.numeroDocumento === nl.numeroDocumento)
            );
            return [...novos, ...prev];
          });
        }

        showToast(res.mensagem, "info");
      } else {
        showToast("⚠️ Nenhuma empresa encontrada no Murade Fiscal.", "info");
      }
    } catch (e) {
      console.error("Erro ao conectar ao Murade Fiscal:", e);
      showToast(e instanceof Error ? e.message : "Integração com Murad Fiscal indisponível.", "info");
    }
  };

  // 9. CONECTAR AO MURADE DP (DEPARTAMENTO PESSOAL)
  const handleConectarMuradDP = async () => {
    showToast("Verificando a integração com Departamento Pessoal...", "info");
    try {
      const res = await conectarMuradDP();
      if (res.sucesso) {
        if (res.lancamentosDP && res.lancamentosDP.length > 0) {
          setLancamentos((prev) => {
            const novos = res.lancamentosDP.filter(
              (nl: any) => !prev.some((p) => p.numeroDocumento === nl.numeroDocumento)
            );
            return [...novos, ...prev];
          });
        }
        showToast("Integração com Departamento Pessoal consultada.", "info");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Integração com Murad DP indisponível.", "info");
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-[#F1F5F9] text-slate-800 flex font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. BARRA LATERAL NO LADO ESQUERDO (DESKTOP) — FIXA COM ROLAGEM INDEPENDENTE */}
      <div className="hidden lg:flex shrink-0 h-full">
        <Sidebar
          tabAtiva={tabAtiva}
          onSelectTab={(tab) => setTabAtiva(tab)}
        />
      </div>

      {/* BARRA LATERAL MOBILE (DRAWER COM OVERLAY) */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            <Sidebar
              tabAtiva={tabAtiva}
              onSelectTab={(tab) => {
                setTabAtiva(tab);
                setMobileSidebarOpen(false);
              }}
            />
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2.5 h-10 w-10 text-white bg-slate-900/80 m-2 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. ÁREA PRINCIPAL DA DIREITA (HEADER FIXO + CONTEÚDO ROLÁVEL INDEPENDENTE) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Barra Superior Fixa no Topo */}
        <Header
          tabAtiva={tabAtiva}
          onSelectTab={(tab) => setTabAtiva(tab)}
          onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
          onConectarFiscal={handleConectarMuradFiscal}
        />

        <div className="px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-950 text-xs font-semibold" role="status">
          Ambiente de demonstração: os registros iniciais são exemplos locais. Integrações, autenticação e transmissão oficial não estão configuradas.
        </div>

        {/* Notificação Toast */}
        {toastMessage && (
          <div className="fixed top-14 right-5 z-50 animate-bounce">
            <div className="bg-[#082B66] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-[#0A357D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        {/* CONTAINER DO CONTEÚDO CENTRAL COM ROLAGEM INDEPENDENTE (A BARRA LATERAL FICA FIXA) */}
        <div className="flex-1 overflow-y-auto overscroll-contain content-scroll">
          <main className="p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
            {/* Banner Principal Murad */}
            <BannerHero
              onAbaClick={(aba) => setTabAtiva(aba as TabId)}
            />

            {/* Grid Principal: 2 Colunas (Área de Trabalho + Sidebar do Robô) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {/* Coluna Esquerda: Conteúdo da Aba Selecionada */}
            <div className="xl:col-span-2 space-y-4">
              {tabAtiva === "inicio" && (
                <InicioTab
                  empresa={empresa}
                  lancamentos={lancamentos}
                  orgaos={orgaos}
                  lembretes={lembretes}
                  setLembretes={setLembretes}
                  onNavigateTab={(tab) => setTabAtiva(tab)}
                  onRunAudit={handleRunAudit}
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "ia-premium" && (
                <IAPremiumTab
                  empresa={empresa}
                  lancamentos={lancamentos}
                />
              )}

              {tabAtiva === "conexoes" && (
                <ConexoesTab
                  orgaos={orgaos}
                  onTestarTodas={handleTestarConexoes}
                  onTestarIndividual={handleTestarOrgaoIndividual}
                  onAtualizarOrgao={handleAtualizarOrgao}
                  isTesting={isTestingOrgaos}
                  empresa={empresa}
                  onUpdateEmpresa={(novosDados) =>
                    setEmpresa((prev) => ({ ...prev, ...novosDados }))
                  }
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "empresa" && (
                <EmpresaTab
                  empresa={empresa}
                  onVoltar={() => setTabAtiva("conexoes")}
                  onIrParaAgenda={() => setTabAtiva("agenda")}
                  onUpdateEmpresa={(novosDados) =>
                    setEmpresa((prev) => ({ ...prev, ...novosDados }))
                  }
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "agenda" && (
                <AgendaTab
                  onVoltar={() => setTabAtiva("empresa")}
                  onIrParaCadastro={() => setTabAtiva("empresa")}
                  lembretes={lembretes}
                  setLembretes={setLembretes}
                  empresa={empresa}
                />
              )}

              {tabAtiva === "fluxo-previtico" && (
                <FluxoPreviticoTab
                  empresaNome={empresa.nomeFantasia || empresa.razaoSocial}
                  lancamentos={lancamentos}
                  onAdicionarLancamento={(novo) => {
                    const novoCompleto = {
                      ...novo,
                      id: `lan-fluxo-${Date.now()}`,
                    };
                    setLancamentos((prev) => [novoCompleto, ...prev]);
                    showToast("Lançamento adicionado aos registros contábeis!");
                  }}
                  onVoltar={() => setTabAtiva("empresa")}
                />
              )}

              {tabAtiva === "calculadora" && (
                <CalculadoraTab
                  empresaPadrao={empresa.nomeFantasia || empresa.razaoSocial}
                />
              )}

              {tabAtiva === "modulos-finais" && (
                <ModulosFinaisTab
                  onNotificar={(msg) => showToast(msg)}
                />
              )}

              {tabAtiva === "lancamentos" && (
                <LancamentosTab
                  lancamentos={lancamentos}
                  contas={contas}
                  onImportarFiscal={handleImportarFiscal}
                  onImportarDP={handleImportarDP}
                  onGerarTudo={handleGerarTudo}
                  onAdicionarLancamento={(novo) =>
                    setLancamentos((prev) => [novo, ...prev])
                  }
                  onRemoverLancamento={(id) =>
                    setLancamentos((prev) => prev.filter((l) => l.id !== id))
                  }
                />
              )}

              {tabAtiva === "balancete" && (
                <BalanceteTab
                  competencia={empresa.competencia}
                  onFecharMes={handleFecharMes}
                  onGerarBalancete={() =>
                    showToast("Balancete recalculado com todos os lançamentos ativos!")
                  }
                />
              )}

              {tabAtiva === "livros" && (
                <LivrosTab
                  livros={livros}
                  onTransmitirTodos={handleTransmitirTodos}
                  isTransmitting={isTransmitting}
                />
              )}

              {tabAtiva === "plano-contas" && (
                <PlanoContasTab
                  contas={contas}
                  onAdicionarConta={(nova) => {
                    setContas((prev) => ordenarContasPorSequenciaNumerica([...prev, nova]));
                    showToast(
                      `✅ Conta ${nova.codigo} — "${nova.descricao}" inserida com êxito na sequência numérica!`
                    );
                  }}
                />
              )}

              {tabAtiva === "integracao" && (
                <IntegracaoTab
                  empresa={empresa}
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "agente" && (
                <AgenteTab
                  onRunAudit={handleRunAudit}
                  isAuditing={isAuditing}
                  cnpjEmpresa={empresa.cnpj}
                  lancamentos={lancamentos}
                />
              )}
            </div>

            {/* Coluna Direita: Robô Murade */}
            <div className="xl:col-span-1">
              <RobotSidebar
                onRunAudit={handleRunAudit}
                isAuditing={isAuditing}
                onNavigateTab={(tab) => setTabAtiva(tab)}
              />
            </div>
          </div>
        </main>
      </div>
    </div>

      {/* Modal de Exibição dos Dados Sincronizados do Murade Fiscal & DP */}
      <ModalConexaoMuradFiscal
        aberto={modalFiscalAberto}
        onFechar={() => setModalFiscalAberto(false)}
        empresa={empresaFiscalDetectada || empresa}
        onConfirmarAtivar={(emp) => {
          setEmpresa(emp);
          setModalFiscalAberto(false);
          showToast(`✅ Empresa '${emp.razaoSocial}' ativa e pronta para escrituração contábil!`);
        }}
      />
    </div>
  );
}
