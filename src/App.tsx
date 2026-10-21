import React, { useState } from "react";
import { TabId, OrgaoConectado, EmpresaDados, LancamentoContabil, ContaPlano, LivroContabil, LembreteItem, CentroCustoContabil, MapeamentoOrigemContabil, PreLancamentoContabil } from "./types";
import { initialEmpresa, orgaosIniciais, planoContasPadrao } from "./data/mockData";
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
import { AgendaTab } from "./components/tabs/AgendaTab";
import { CalculadoraTab } from "./components/tabs/CalculadoraTab";
import { FluxoPreviticoTab } from "./components/tabs/FluxoPreviticoTab";
import { ModulosFinaisTab } from "./components/tabs/ModulosFinaisTab";
import { MigracaoContabilTab } from "./components/tabs/MigracaoContabilTab";
import { RevisaoOrigensTab } from "./components/tabs/RevisaoOrigensTab";
import { IAFloatingButton } from "./components/IAFloatingButton";
import { IAMuradModal } from "./components/IAMuradModal";
import { ordenarContasPorSequenciaNumerica } from "./utils/planoContasUtils";
import { ModalConexaoMuradFiscal } from "./components/modals/ModalConexaoMuradFiscal";
import { conectarEPuxarEmpresaMuradFiscal, conectarMuradDP } from "./services/integracaoMuradService";
import { CheckCircle2, X } from "lucide-react";
import { ContabilAccessGate, useContabilAuth } from "./components/ContabilAccessGate";

export default function App() {
  return <ContabilAccessGate><AppWorkspace /></ContabilAccessGate>;
}

function AppWorkspace() {
  const auth = useContabilAuth();
  const versoesWorkspaceRef = React.useRef(new Map<string, number | null>());
  const filaGravacaoWorkspaceRef = React.useRef<Promise<boolean>>(Promise.resolve(true));
  const workspacePendenteRef = React.useRef<{ cnpj: string; dados: Record<string, unknown> } | null>(null);
  const workspaceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushWorkspaceRef = React.useRef<() => Promise<boolean>>(async () => true);
  const workspaceSnapshotPersistidoRef = React.useRef<string | null>(null);
  const [assistenteAberta, setAssistenteAberta] = useState(false);
  const [tabAtiva, setTabAtiva] = useState<TabId>("inicio");
  // Uma IA só: os atalhos antigos "IA Premium" abrem o mesmo assistente da tela.
  React.useEffect(() => {
    if (tabAtiva === "ia-premium") {
      setAssistenteAberta(true);
      setTabAtiva("inicio");
    }
  }, [tabAtiva]);
  const [empresa, setEmpresa] = useState<EmpresaDados>(initialEmpresa);
  const [orgaos, setOrgaos] = useState<OrgaoConectado[]>(() => orgaosIniciais.map((org) => ({
    ...org,
    status: "offline",
    pingMs: undefined,
    statusCode: undefined,
    statusTexto: "Não verificado",
    tls: undefined,
    ambiente: "Não configurado",
    ultimaVerificacao: "Ainda não consultado",
    detalhes: "Integração autenticada ainda não configurada.",
    descricao: "Canal oficial listado; autenticação e integração de dados ainda não configuradas.",
    autenticacao: "Não configurada",
    credencialTipo: undefined,
  })));
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>([]);
  const [contas, setContas] = useState<ContaPlano[]>(() =>
    ordenarContasPorSequenciaNumerica(planoContasPadrao)
  );
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoContabil[]>([]);
  const [mapeamentosOrigem, setMapeamentosOrigem] = useState<MapeamentoOrigemContabil[]>([]);
  const [preLancamentos, setPreLancamentos] = useState<PreLancamentoContabil[]>([]);
  const [livros, setLivros] = useState<LivroContabil[]>([]);
  const [competenciasFechadas, setCompetenciasFechadas] = useState<string[]>([]);
  const [lembretes, setLembretes] = useState<LembreteItem[]>([]);
  const [dadosEmpresaCarregadosCnpj, setDadosEmpresaCarregadosCnpj] = useState("");
  const [workspacePersistido, setWorkspacePersistido] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Estados de controle e feedback
  const [isTestingOrgaos, setIsTestingOrgaos] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);
  const [empresaFiscalDetectada, setEmpresaFiscalDetectada] = useState<EmpresaDados | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "info" } | null>(null);

  React.useLayoutEffect(() => {
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    const dadosVazios = () => {
      setWorkspacePersistido(false);
      setContas(ordenarContasPorSequenciaNumerica(planoContasPadrao));
      setCentrosCusto([]);
      setMapeamentosOrigem([]);
      setPreLancamentos([]);
      setLancamentos([]);
      setLivros([]);
      setCompetenciasFechadas([]);
      setLembretes([]);
    };

    // Não permita que o conjunto da empresa anterior permaneça visível enquanto
    // outra empresa está sendo carregada ou quando o cadastro ainda não tem CNPJ.
    setDadosEmpresaCarregadosCnpj("");
    setWorkspacePersistido(false);
    if (!cnpj) {
      dadosVazios();
      return;
    }
    if (!auth.cnpjs.includes(cnpj)) {
      dadosVazios();
      return;
    }
    let ativo = true;
    void (async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}`, { credentials: "include", cache: "no-store" });
        const remote = await response.json().catch(() => ({}));
        if (!response.ok || remote.sucesso !== true) throw new Error(remote.motivo || "Não foi possível carregar a empresa do banco.");
        let dados = remote.dados;
        versoesWorkspaceRef.current.set(cnpj, Number.isSafeInteger(remote.versao) ? remote.versao : null);
        if (!dados) {
          // Migração de compatibilidade: importa somente dados locais da empresa
          // autorizada e mantém o navegador como cópia após a confirmação do PG.
          try {
            const salvo = localStorage.getItem(`murade_contabil_dados_${cnpj}`);
            if (salvo) dados = JSON.parse(salvo);
          } catch (error) {
            console.warn("Dados locais antigos da empresa não puderam ser lidos:", error);
          }
          dados = {
            empresa: { ...empresa, certificadoAtivo: false, certificadoNomeArquivo: undefined },
            contas: Array.isArray(dados?.contas) ? dados.contas : ordenarContasPorSequenciaNumerica(planoContasPadrao),
            centrosCusto: Array.isArray(dados?.centrosCusto) ? dados.centrosCusto : [],
            mapeamentosOrigem: Array.isArray(dados?.mapeamentosOrigem) ? dados.mapeamentosOrigem : [],
            preLancamentos: Array.isArray(dados?.preLancamentos) ? dados.preLancamentos : [],
            lancamentos: Array.isArray(dados?.lancamentos) ? dados.lancamentos.map((item: LancamentoContabil) =>
              (item.origem === "Manual" || item.estornoDe) && !item.statusManual
                ? { ...item, statusManual: "pendente_aprovacao" as const }
                : item) : [],
            livros: Array.isArray(dados?.livros) ? dados.livros : [],
            lembretes: Array.isArray(dados?.lembretes) ? dados.lembretes : [],
          };
          const migracao = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}`, {
            method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ dados, versaoAnterior: null }),
          });
          const confirmacao = await migracao.json().catch(() => ({}));
          if (!migracao.ok || confirmacao.sucesso !== true) throw new Error(confirmacao.motivo || "O banco não confirmou a migração dos dados locais.");
          versoesWorkspaceRef.current.set(cnpj, confirmacao.versao);
        }
        const respostaFechamentos = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}/fechamentos`, { credentials: "include", cache: "no-store" });
        const dadosFechamentos = await respostaFechamentos.json().catch(() => ({}));
        if (!respostaFechamentos.ok || dadosFechamentos.sucesso !== true) throw new Error(dadosFechamentos.motivo || "Não foi possível consultar os fechamentos da empresa.");
        if (!ativo) return;
        if (dados.empresa && String(dados.empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() === cnpj) {
          setEmpresa((anterior) => ({ ...anterior, ...dados.empresa, certificadoAtivo: false, certificadoNomeArquivo: undefined }));
        }
        setContas(Array.isArray(dados.contas) ? ordenarContasPorSequenciaNumerica(dados.contas) : ordenarContasPorSequenciaNumerica(planoContasPadrao));
        setCentrosCusto(Array.isArray(dados.centrosCusto) ? dados.centrosCusto : []);
        setMapeamentosOrigem(Array.isArray(dados.mapeamentosOrigem) ? dados.mapeamentosOrigem : []);
        setPreLancamentos(Array.isArray(dados.preLancamentos) ? dados.preLancamentos : []);
        setLancamentos(Array.isArray(dados.lancamentos) ? dados.lancamentos : []);
        setLivros(Array.isArray(dados.livros) ? dados.livros : []);
        setLembretes(Array.isArray(dados.lembretes) ? dados.lembretes : []);
        setCompetenciasFechadas(Array.isArray(dadosFechamentos.fechamentos) ? dadosFechamentos.fechamentos.map((item: { competencia?: unknown }) => String(item.competencia || "")) : []);
        setDadosEmpresaCarregadosCnpj(cnpj);
        setWorkspacePersistido(true);
      } catch (error) {
        if (!ativo) return;
        console.warn("Não foi possível carregar dados persistentes do Contábil:", error);
        dadosVazios();
        showToast("O banco não confirmou a leitura desta empresa. Os dados não foram apresentados para evitar mistura entre CNPJs.", "info");
      }
    })();
    return () => { ativo = false; };
  }, [empresa.cnpj, auth.cnpjs.join(",")]);

  React.useEffect(() => {
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    // A hidratação roda antes da persistência. Esta trava impede gravar o estado
    // antigo no CNPJ novo durante a troca de empresa.
    if (!cnpj || dadosEmpresaCarregadosCnpj !== cnpj) return;
    if (!auth.cnpjs.includes(cnpj)) return;
    const dados = { empresa: { ...empresa, certificadoAtivo: false, certificadoNomeArquivo: undefined }, contas, centrosCusto, mapeamentosOrigem, preLancamentos, lancamentos, livros, lembretes };
    if (workspaceSnapshotPersistidoRef.current === JSON.stringify(dados)) {
      workspaceSnapshotPersistidoRef.current = null;
      return;
    }
    try {
      localStorage.setItem(`murade_contabil_dados_${cnpj}`, JSON.stringify(dados));
      localStorage.setItem("murad_empresa_salva", JSON.stringify(dados.empresa));
    } catch (error) {
      console.warn("Não foi possível manter cópia local dos dados contábeis:", error);
    }
    workspacePendenteRef.current = { cnpj, dados };
    setWorkspacePersistido(false);
    if (workspaceTimerRef.current) clearTimeout(workspaceTimerRef.current);
    workspaceTimerRef.current = setTimeout(() => {
      workspaceTimerRef.current = null;
      void flushWorkspaceRef.current();
    }, 600);
  }, [empresa, dadosEmpresaCarregadosCnpj, contas, centrosCusto, mapeamentosOrigem, preLancamentos, lancamentos, livros, lembretes, auth.cnpjs.join(",")]);

  React.useEffect(() => {
    const analiticas = new Set(contas.filter((conta) => conta.tipo === "analitica").map((conta) => conta.codigo));
    setMapeamentosOrigem((atuais) => {
      const validos = atuais.filter((item) => analiticas.has(item.contaDebitoCodigo) && analiticas.has(item.contaCreditoCodigo));
      return validos.length === atuais.length ? atuais : validos;
    });
  }, [contas]);

  const handleImportarDadosContabeis = async (dados: { contas: ContaPlano[]; centrosCusto: CentroCustoContabil[]; lancamentos: LancamentoContabil[] }): Promise<boolean> => {
    const workspaceAnteriorSalvo = await flushWorkspaceRef.current();
    if (!workspaceAnteriorSalvo) {
      showToast("Há alterações anteriores sem confirmação do PostgreSQL. A migração foi interrompida para evitar sobrescrever dados.", "info");
      return false;
    }
    const contasPorCodigo = new Map<string, ContaPlano>(contas.map((item) => [item.codigo, item]));
    dados.contas.forEach((item) => contasPorCodigo.set(item.codigo, item));
    const centrosPorCodigo = new Map<string, CentroCustoContabil>(centrosCusto.map((item) => [item.codigo, item]));
    dados.centrosCusto.forEach((item) => centrosPorCodigo.set(item.codigo, item));
    const chaveLancamento = (item: LancamentoContabil) => [item.data, item.documentoRef || "", item.contaDebitoCodigo, item.contaCreditoCodigo, item.valor.toFixed(2), item.historico].join("|");
    const lancamentosPorChave = new Map<string, LancamentoContabil>(lancamentos.map((item) => [chaveLancamento(item), item]));
    dados.lancamentos.forEach((item) => {
      const chave = chaveLancamento(item);
      if (!lancamentosPorChave.has(chave)) lancamentosPorChave.set(chave, item);
    });
    const novasContas = ordenarContasPorSequenciaNumerica([...contasPorCodigo.values()]);
    const novosCentros = [...centrosPorCodigo.values()];
    const novosLancamentos = [...lancamentosPorChave.values()];
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    if (!cnpj || !auth.cnpjs.includes(cnpj) || dadosEmpresaCarregadosCnpj !== cnpj) {
      showToast("A empresa ainda não está carregada e autorizada no banco. A migração não foi aplicada.", "info");
      return false;
    }
    const dadosWorkspace = {
      empresa: { ...empresa, certificadoAtivo: false, certificadoNomeArquivo: undefined },
      contas: novasContas,
      centrosCusto: novosCentros,
      mapeamentosOrigem,
      preLancamentos,
      lancamentos: novosLancamentos,
      livros,
      lembretes,
    };
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ dados: dadosWorkspace, versaoAnterior: versoesWorkspaceRef.current.get(cnpj) ?? null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true || !Number.isSafeInteger(result.versao)) {
        showToast(result.motivo || "O PostgreSQL não confirmou a migração. Os dados continuam na etapa de revisão.", "info");
        return false;
      }
      versoesWorkspaceRef.current.set(cnpj, result.versao);
      workspaceSnapshotPersistidoRef.current = JSON.stringify(dadosWorkspace);
      setContas(novasContas);
      setCentrosCusto(novosCentros);
      setLancamentos(novosLancamentos);
      setWorkspacePersistido(true);
      try {
        localStorage.setItem(`murade_contabil_dados_${cnpj}`, JSON.stringify(dadosWorkspace));
      } catch {
        console.warn("PostgreSQL confirmou a migração, mas o navegador não atualizou a cópia local de compatibilidade.");
      }
      return true;
    } catch (error) {
      console.warn("Falha ao confirmar a migração contábil no PostgreSQL:", error);
      showToast("O PostgreSQL não confirmou a migração. Os dados continuam na etapa de revisão.", "info");
      return false;
    }
  };

  const showToast = (text: string, type: "success" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  flushWorkspaceRef.current = async () => {
    if (workspaceTimerRef.current) clearTimeout(workspaceTimerRef.current);
    workspaceTimerRef.current = null;
    const pendente = workspacePendenteRef.current;
    workspacePendenteRef.current = null;
    if (!pendente) {
      const persistido = await filaGravacaoWorkspaceRef.current;
      if (!workspacePendenteRef.current && !workspaceTimerRef.current) setWorkspacePersistido(persistido);
      return persistido;
    }
    filaGravacaoWorkspaceRef.current = filaGravacaoWorkspaceRef.current.then(async () => {
      const versaoAnterior = versoesWorkspaceRef.current.get(pendente.cnpj) ?? null;
      const body = JSON.stringify({ dados: pendente.dados, versaoAnterior });
      const response = await fetch(`/api/workspaces/${encodeURIComponent(pendente.cnpj)}`, {
        method: "PUT", credentials: "include", keepalive: body.length <= 60_000,
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body,
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        showToast("Os dados mudaram em outra sessão. Recarregue esta empresa antes de continuar, para evitar sobrescrever alterações.", "info");
        return false;
      }
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Persistência não confirmada.");
      versoesWorkspaceRef.current.set(pendente.cnpj, result.versao);
      return true;
    }).catch((error) => {
      console.warn("Falha ao persistir dados contábeis no PostgreSQL:", error);
      showToast("Alterações guardadas neste navegador, mas o PostgreSQL não confirmou a gravação.", "info");
      return false;
    });
    const persistido = await filaGravacaoWorkspaceRef.current;
    if (!workspacePendenteRef.current && !workspaceTimerRef.current) setWorkspacePersistido(persistido);
    return persistido;
  };

  const workspaceCnpjAtual = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  const workspaceAutorizado = auth.cnpjs.includes(workspaceCnpjAtual);
  React.useEffect(() => () => {
    if (workspacePendenteRef.current?.cnpj === workspaceCnpjAtual) void flushWorkspaceRef.current();
  }, [workspaceCnpjAtual, workspaceAutorizado]);

  const autorizarCnpj = async (valor: unknown): Promise<boolean> => {
    const cnpj = String(valor || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
    if (auth.cnpjs.includes(cnpj)) return true;
    try {
      const response = await fetch("/api/auth/companies", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ cnpj }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "CNPJ não autorizado.");
      await auth.atualizarAcesso();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Não foi possível liberar acesso a este CNPJ.", "info");
      return false;
    }
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
          setEmpresa({ ...initialEmpresa, cnpj: auth.cnpjs[0] || "" });
        } else if (parsed.razaoSocial || parsed.cnpj) {
          const cnpjSalvo = String(parsed.cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
          if (!auth.cnpjs.includes(cnpjSalvo)) {
            setEmpresa({ ...initialEmpresa, cnpj: auth.cnpjs[0] || "" });
            return;
          }
          setEmpresa((prev) => ({ ...prev, ...parsed }));
        }
      } else if (auth.cnpjs[0]) setEmpresa({ ...initialEmpresa, cnpj: auth.cnpjs[0] });
    } catch (e) {
      console.warn("Erro ao restaurar do localStorage:", e);
    }
  }, [auth.cnpjs.join(",")]);

  // 1. Testar conexões com todos os órgãos em TEMPO REAL (Chamada ao Gateway Oficial)
  const handleTestarConexoes = async () => {
    setIsTestingOrgaos(true);
    showToast("Verificando resposta de rede dos endereços oficiais listados. Isso não testa certificado, login, consulta fiscal nem transmissão.", "info");

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
                status: real.status === "conectado" ? "alerta" : real.status,
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
    showToast(`Verificando resposta de rede do endereço listado para '${id}'. Isso não testa certificado, login, consulta fiscal nem transmissão.`, "info");
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
                    status: item.status === "conectado" ? "alerta" : item.status,
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

  const handleContabilizarPreLancamentos = async (referencias: string[]): Promise<boolean> => {
    const empresaCnpj = empresa.cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const workspaceAtualSalvo = await flushWorkspaceRef.current();
    if (!workspaceAtualSalvo) {
      showToast("Não foi possível confirmar os dados atuais no PostgreSQL. Atualize a empresa e tente novamente.", "info");
      return false;
    }
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/contabilizar`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ referencias }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true || result.persistencia !== "postgresql" || !result.dados) {
        throw new Error(result.motivo || "O servidor não confirmou a aprovação contábil.");
      }
      versoesWorkspaceRef.current.set(empresaCnpj, Number(result.versao));
      setLancamentos(Array.isArray(result.dados.lancamentos) ? result.dados.lancamentos : []);
      setContas(Array.isArray(result.dados.contas) ? result.dados.contas : []);
      setPreLancamentos(Array.isArray(result.dados.preLancamentos) ? result.dados.preLancamentos : []);
      showToast(`${result.contabilizados} lançamento(s) foram validados e contabilizados no servidor por ${result.aprovadosPor}.`, "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Falha ao confirmar a aprovação no servidor.", "info");
      return false;
    }
  };

  const handleDecidirLancamentoManual = async (id: string, decisao: "aprovar" | "rejeitar", motivo?: string): Promise<boolean> => {
    const empresaCnpj = empresa.cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const workspaceAtualSalvo = await flushWorkspaceRef.current();
    if (!workspaceAtualSalvo) {
      showToast("A proposta ainda não foi confirmada no banco. Aguarde a gravação antes de decidir.", "info");
      return false;
    }
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/lancamentos-manuais/${encodeURIComponent(id)}/decisao`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decisao, motivo }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true || result.persistencia !== "postgresql" || !result.dados) {
        throw new Error(result.motivo || "O servidor não confirmou a decisão do lançamento manual.");
      }
      versoesWorkspaceRef.current.set(empresaCnpj, Number(result.versao));
      setLancamentos(Array.isArray(result.dados.lancamentos) ? result.dados.lancamentos : []);
      showToast(decisao === "aprovar" ? `Lançamento aprovado por ${result.decididoPor} e incluído nos livros.` : `Lançamento rejeitado por ${result.decididoPor}; a proposta permanece no histórico.`, "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Falha ao registrar a decisão no servidor.", "info");
      return false;
    }
  };

  const handleEstornarLancamento = (id: string) => {
    const original = lancamentos.find((item) => item.id === id);
    if (!original || original.statusManual === "pendente_aprovacao" || original.statusManual === "rejeitado" || original.estornoDe || lancamentos.some((item) => item.estornoDe === original.id)) return;
    const agora = new Date();
    const data = `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
    const referencia = original.documentoRef || original.id;
    const estorno: LancamentoContabil = {
      ...original,
      id: `estorno-${crypto.randomUUID()}`,
      data,
      competencia: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`,
      contaDebitoCodigo: original.contaCreditoCodigo,
      contaDebitoNome: original.contaCreditoNome,
      contaCreditoCodigo: original.contaDebitoCodigo,
      contaCreditoNome: original.contaDebitoNome,
      historico: `Estorno do lançamento ${referencia} — ${original.historico}`,
      documentoRef: `ESTORNO-${referencia}-${crypto.randomUUID()}`,
      estornoDe: original.id,
      origem: original.origem,
      statusManual: "pendente_aprovacao",
    };
    setLancamentos((prev) => [...prev, estorno]);
    showToast("Estorno enviado para aprovação; o lançamento original foi preservado.", "info");
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
  const handleFecharMes = async (competencia: string): Promise<boolean> => {
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    if (!cnpj || dadosEmpresaCarregadosCnpj !== cnpj || !workspacePersistido || !auth.cnpjs.includes(cnpj)) {
      showToast("Fechamento bloqueado: aguarde o carregamento e a confirmação do banco desta empresa.", "info");
      return false;
    }
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}/fechamentos`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "O PostgreSQL não confirmou o fechamento.");
      if (Number.isSafeInteger(result.versao)) versoesWorkspaceRef.current.set(cnpj, result.versao);
      setCompetenciasFechadas((atual) => Array.from(new Set([...atual, competencia])).sort());
      showToast(`Competência ${competencia} fechada e bloqueada no PostgreSQL.`, "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "O fechamento não foi confirmado. Nenhum período foi bloqueado.", "info");
      return false;
    }
  };

  // 8. CONECTAR AO MURADE FISCAL E PUXAR EMPRESA REAL DO MURADE FISCAL
  const handleConectarMuradFiscal = async () => {
    showToast("🔄 Conectando ao Murade Fiscal e buscando empresa cadastrada...", "info");
    try {
      const res = await conectarEPuxarEmpresaMuradFiscal();
      if (res.sucesso && res.empresa) {
        if (!await autorizarCnpj(res.empresa.cnpj)) throw new Error("Este CNPJ não foi autorizado na sessão do Contábil.");
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
              e.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "") !== res.empresa.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "")
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
      const res = await conectarMuradDP(empresa.cnpj);
      showToast(res.mensagem, "info");
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
          usuario={auth.usuario}
          empresaNome={empresa.razaoSocial || null}
          empresaCnpj={String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() || null}
          onLogout={auth.sair}
        />

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


              {tabAtiva === "conexoes" && (
                <ConexoesTab
                  orgaos={orgaos}
                  onTestarTodas={handleTestarConexoes}
                  onTestarIndividual={handleTestarOrgaoIndividual}
                  isTesting={isTestingOrgaos}
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "empresa" && (
                <EmpresaTab
                  empresa={empresa}
                  cnpjsAutorizados={auth.cnpjs}
                  onAutorizarCnpj={autorizarCnpj}
                  onRemoverEmpresa={async (cnpj) => {
                    try {
                      const response = await fetch(`/api/auth/companies/${encodeURIComponent(cnpj)}`, {
                        method: "DELETE", credentials: "include", headers: { Accept: "application/json" },
                      });
                      const result = await response.json().catch(() => ({}));
                      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Não foi possível remover o acesso.");
                      await auth.atualizarAcesso();
                      return true;
                    } catch (error) {
                      showToast(error instanceof Error ? error.message : "Não foi possível remover o acesso da empresa.", "info");
                      return false;
                    }
                  }}
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
                  empresa={empresa}
                  lancamentos={lancamentos}
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
                  onEstornarLancamento={handleEstornarLancamento}
                  workspacePersistido={workspacePersistido}
                  onDecidirLancamentoManual={handleDecidirLancamentoManual}
                />
              )}

              {tabAtiva === "balancete" && (
                <BalanceteTab
                  cnpj={empresa.cnpj}
                  competencia={empresa.competencia}
                  lancamentos={lancamentos}
                  contas={contas}
                  workspaceCarregado={dadosEmpresaCarregadosCnpj === String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase()}
                  workspacePersistido={workspacePersistido}
                  competenciasFechadas={competenciasFechadas}
                  onFecharMes={handleFecharMes}
                />
              )}

              {tabAtiva === "livros" && (
                <LivrosTab
                  empresa={empresa}
                  workspaceCarregado={Boolean(empresa.cnpj) && dadosEmpresaCarregadosCnpj === String(empresa.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}
                  workspacePersistido={workspacePersistido}
                  lancamentos={lancamentos}
                  contas={contas}
                  preLancamentos={preLancamentos}
                  livros={livros}
                  onDefinirContasDisponibilidades={(codigos) => setEmpresa((prev) => ({ ...prev, contasDisponibilidadesCodigo: codigos }))}
                />
              )}

              {tabAtiva === "plano-contas" && (
                <PlanoContasTab
                  contas={contas}
                  empresa={empresa}
                  lancamentos={lancamentos}
                  onDefinirContrapartidaAbertura={(codigo) => setEmpresa((prev) => ({ ...prev, contaContrapartidaAberturaCodigo: codigo || undefined }))}
                  onAdicionarLancamento={(novo) => setLancamentos((prev) => [...prev, novo])}
                  onEditarDescricao={(codigo, descricao) => {
                    setContas((prev) => prev.map((conta) => conta.codigo === codigo ? { ...conta, descricao } : conta));
                    showToast(`Nome da conta ${codigo} atualizado para esta empresa.`);
                  }}
                  onEditarSaldoInicial={(codigo, saldoInicial, competencia) => {
                    setContas((prev) => prev.map((conta) => {
                      if (conta.codigo !== codigo) return conta;
                      const atualizada = { ...conta };
                      if (saldoInicial === undefined) {
                        delete atualizada.saldoInicial;
                        delete atualizada.saldoInicialCompetencia;
                      } else {
                        atualizada.saldoInicial = saldoInicial;
                        if (competencia) atualizada.saldoInicialCompetencia = competencia;
                        else delete atualizada.saldoInicialCompetencia;
                      }
                      return atualizada;
                    }));
                    showToast(saldoInicial === undefined ? `Saldo inicial da conta ${codigo} removido.` : `Saldo inicial da conta ${codigo} atualizado${competencia ? " para " + competencia : ""}.`);
                  }}
                  onAdicionarConta={(nova) => {
                    setContas((prev) => ordenarContasPorSequenciaNumerica([...prev, nova]));
                    showToast(
                      `✅ Conta ${nova.codigo} — "${nova.descricao}" inserida com êxito na sequência numérica!`
                    );
                  }}
                />
              )}

              {tabAtiva === "migracao" && (
                <MigracaoContabilTab
                  empresa={empresa}
                  contas={contas}
                  centrosCusto={centrosCusto}
                  lancamentos={lancamentos}
                  onImportar={handleImportarDadosContabeis}
                  onNotificar={(mensagem) => showToast(mensagem, "info")}
                />
              )}

              {tabAtiva === "integracao" && (
                <IntegracaoTab
                  empresa={empresa}
                  onConectarFiscal={handleConectarMuradFiscal}
                  onConectarDP={handleConectarMuradDP}
                />
              )}

              {tabAtiva === "revisao-origens" && <RevisaoOrigensTab cnpj={empresa.cnpj} regime={empresa.regime} workspaceCarregado={dadosEmpresaCarregadosCnpj === empresa.cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "")} contas={contas} mapeamentos={mapeamentosOrigem} onSalvarMapeamentos={setMapeamentosOrigem} preLancamentos={preLancamentos} lancamentos={lancamentos} onSalvarPreLancamentos={setPreLancamentos} onContabilizar={handleContabilizarPreLancamentos} />}

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
      <IAFloatingButton onOpenIA={() => setAssistenteAberta(true)} />
      <IAMuradModal
        isOpen={assistenteAberta}
        onClose={() => setAssistenteAberta(false)}
        empresa={empresa}
        lancamentos={lancamentos}
      />
    </div>
  );
}
