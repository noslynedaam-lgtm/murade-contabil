import React, { useState } from "react";
import { useFecharNoVoltar, useVoltarCelular } from "./hooks/useVoltarCelular";
import type { BemImobilizado } from "./utils/imobilizado";
import { conferirFechamento } from "./utils/fechamentoContabil";
import { GestaoContabilTab } from "./components/tabs/GestaoContabilTab";
import type { ItemBusca } from "./components/BuscaGlobal";
import { destacarCampo } from "./utils/destacarCampo";
import { TabId, OrgaoConectado, EmpresaDados, LancamentoContabil, ContaPlano, LivroContabil, LembreteItem, CentroCustoContabil, MapeamentoOrigemContabil, PreLancamentoContabil, HistoricoPadrao, LancamentoPadrao, RegraConciliacao, MetodoRota } from "./types";
import { initialEmpresa, orgaosIniciais, planoContasPadrao } from "./data/mockData";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { RobotSidebar } from "./components/RobotSidebar";
import { FaixaEcd } from "./components/FaixaEcd";
import { ErroTela } from "./components/ErroTela";
import { AvisoServicoFeito } from "./components/AvisoServicoFeito";
import { fetchComGuarda, tratarBloqueioServico } from "./utils/servicoFeitoCliente";
import { InicioTab } from "./components/tabs/InicioTab";
import { ConexoesTab } from "./components/tabs/ConexoesTab";
import { EmpresaTab } from "./components/tabs/EmpresaTab";
import { LancamentosTab } from "./components/tabs/LancamentosTab";
import { AprovacoesTab } from "./components/tabs/AprovacoesTab";
import { BalanceteTab } from "./components/tabs/BalanceteTab";
import { LivrosTab } from "./components/tabs/LivrosTab";
import { DemonstracoesTab } from "./components/tabs/DemonstracoesTab";
import { PlanoContasTab } from "./components/tabs/PlanoContasTab";
import { IntegracaoTab } from "./components/tabs/IntegracaoTab";
import { AgenteTab } from "./components/tabs/AgenteTab";
import { AgendaTab } from "./components/tabs/AgendaTab";
import { CalculadoraTab } from "./components/tabs/CalculadoraTab";
import { FluxoPreviticoTab } from "./components/tabs/FluxoPreviticoTab";
import { ModulosFinaisTab } from "./components/tabs/ModulosFinaisTab";
import { MigracaoContabilTab } from "./components/tabs/MigracaoContabilTab";
import { RevisaoOrigensTab } from "./components/tabs/RevisaoOrigensTab";
import { BackupsTab } from "./components/tabs/BackupsTab";
import { IAMuradModal } from "./components/IAMuradModal";
import { BalaoAjudaProativa } from "./components/BalaoAjudaProativa";
import { AvisoServicoPronto } from "./components/AvisoServicoPronto";
import { CartaoOkContador } from "./components/CartaoOkContador";
import { conferirNoServidor, useRevisor } from "./components/RevisorPainel";
import { revisarFechamento } from "./utils/revisorContabil";
import { RevisorTab } from "./components/tabs/RevisorTab";
import { ofertaDeServico, pedidoDaOferta } from "./utils/servicoCompletoCliente";
import { GuiaPassoAPasso, type PassoGuia } from "./components/GuiaPassoAPasso";
import { AssistenteProvider } from "./contexts/AssistenteContext";
import { useDetectorDificuldade, type DificuldadeDetectada } from "./hooks/useDetectorDificuldade";
import { roteiroParaChave } from "./data/roteirosAjuda";
import { BotaoPararAgente } from "./components/BotaoPararAgente";
import type { AssistenteHandle } from "./types/assistenteHandle";
import { ordenarContasPorSequenciaNumerica } from "./utils/planoContasUtils";
import { ModalConexaoMuradFiscal } from "./components/modals/ModalConexaoMuradFiscal";
import { conectarEPuxarEmpresaMuradFiscal, conectarMuradDP } from "./services/integracaoMuradService";
import { CheckCircle2, X } from "lucide-react";
import { ContabilAccessGate, useContabilAuth } from "./components/ContabilAccessGate";
import { AlertaRobosParados } from "./components/AlertaRobosParados";
import { AvisoTarefasEquipe } from "./components/AvisoTarefasEquipe";
import { MeuJeitoMotor } from "./components/MeuJeitoMotor";
import { ApresentacaoSistema } from "./components/ApresentacaoSistema";
import { MeuJeitoTab } from "./components/tabs/MeuJeitoTab";
import { TarefasEquipeTab } from "./components/tabs/TarefasEquipeTab";
import { CaixaPedirParaAlguem } from "./components/CaixaPedirParaAlguem";
import { PilotoVisivel } from "./components/PilotoVisivel";
import { IDS_DE_TELAS_CONTABIL } from "./data/mapaTelasContabil";
import { TelaEscolaMurade } from "./components/escola/TelaEscolaMurade";

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
  // A Escola Murade não fica no menu: abre só pelo link que o fornecedor manda (https://…/#escola).
  const [tabAtiva, setTabAtiva] = useState<TabId>(() => (typeof window !== "undefined" && /(^|[#&])escola(&|$)/.test(window.location.hash.replace(/^#/, "")) ? "escola" : "inicio"));
  const [ehDonoSistema, setEhDonoSistema] = useState(false);

  // Assistente de voz (ref para abrir/falar de fora, ex.: quando a pessoa parece travada) + detector
  // de dificuldade: oferece ajuda sozinha quando percebe cliques repetidos no mesmo lugar, e guia
  // passo a passo com uma seta quando a pessoa aceita (pedido do dono, 06/11/2026).
  const assistenteRef = React.useRef<AssistenteHandle | null>(null);
  const [dificuldadeAtual, setDificuldadeAtual] = useState<DificuldadeDetectada | null>(null);
  const [roteiroAtivo, setRoteiroAtivo] = useState<PassoGuia[] | null>(null);
  // Adicional "Consultor Murade completo" (por escritório): só oferece "faça para mim" quando liberado. Falha = não liberado.
  const [consultorLiberado, setConsultorLiberado] = useState(false);
  React.useEffect(() => {
    const conferir = () => fetch("/api/consultor/liberado", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => setConsultorLiberado(j?.liberado === true)).catch(() => setConsultorLiberado(false));
    void conferir(); const t = window.setInterval(conferir, 10 * 60_000); return () => window.clearInterval(t);
  }, []);
  useDetectorDificuldade({
    ativo: !roteiroAtivo,
    onDificuldade: (d) => setDificuldadeAtual(d),
  });
  const aceitarAjudaProativa = () => {
    if (!dificuldadeAtual) return;
    const roteiro = roteiroParaChave(dificuldadeAtual.chave);
    if (roteiro) {
      setRoteiroAtivo(roteiro);
    } else {
      assistenteRef.current?.abrir();
      assistenteRef.current?.falar(
        `Oi! Vi que você tentou "${dificuldadeAtual.texto}" algumas vezes e não conseguiu. Me conta o que você está tentando fazer, ou aperte o microfone e me explica, que eu te mostro o caminho.`
      );
    }
    setDificuldadeAtual(null);
  };
  // Uma IA só: os atalhos antigos "IA Premium" abrem o mesmo assistente da tela.
  React.useEffect(() => {
    if (tabAtiva === "ia-premium") {
      setAssistenteAberta(true);
      setTabAtiva("inicio");
    }
  }, [tabAtiva]);
  const [empresa, setEmpresa] = useState<EmpresaDados>(initialEmpresa);
  // Empresas do escritório, para o seletor da barra do topo
  const [listaEmpresas, setListaEmpresas] = useState<{ cnpj: string; nome: string; dados: EmpresaDados }[]>([]);
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
  const [bensImobilizado, setBensImobilizado] = useState<BemImobilizado[]>([]);
  const [confirmacoesFechamento, setConfirmacoesFechamento] = useState<Record<string, Record<string, boolean>>>({});
  const [mapeamentosOrigem, setMapeamentosOrigem] = useState<MapeamentoOrigemContabil[]>([]);
  const [preLancamentos, setPreLancamentos] = useState<PreLancamentoContabil[]>([]);
  const [livros, setLivros] = useState<LivroContabil[]>([]);
  const [competenciasFechadas, setCompetenciasFechadas] = useState<string[]>([]);
  const [lembretes, setLembretes] = useState<LembreteItem[]>([]);
  const [historicosPadrao, setHistoricosPadrao] = useState<HistoricoPadrao[]>([]);
  const [lancamentosPadrao, setLancamentosPadrao] = useState<LancamentoPadrao[]>([]);
  const [regrasConciliacao, setRegrasConciliacao] = useState<RegraConciliacao[]>([]);
  const [dadosEmpresaCarregadosCnpj, setDadosEmpresaCarregadosCnpj] = useState("");
  const [workspacePersistido, setWorkspacePersistido] = useState(false);
  const [tentativaOnline, setTentativaOnline] = useState(0);
  // Voltou a internet: tenta gravar de novo o que não foi confirmado no servidor.
  React.useEffect(() => { const f = () => setTentativaOnline((n) => n + 1); window.addEventListener('online', f); return () => window.removeEventListener('online', f); }, []);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Estados de controle e feedback
  const [isTestingOrgaos, setIsTestingOrgaos] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);
  const [empresaFiscalDetectada, setEmpresaFiscalDetectada] = useState<EmpresaDados | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "info" } | null>(null);

  // Botão VOLTAR do celular/navegador: volta para a tela anterior em vez de fechar o app; antes fecha o que estiver aberto por cima.
  useVoltarCelular({ telaAtual: tabAtiva, telaInicial: "inicio", irParaTela: (tela) => setTabAtiva(tela as TabId), telasSemHistorico: ["ia-premium"] });
  useFecharNoVoltar(mobileSidebarOpen, () => setMobileSidebarOpen(false));
  useFecharNoVoltar(modalFiscalAberto, () => setModalFiscalAberto(false));
  useFecharNoVoltar(!!dificuldadeAtual, () => setDificuldadeAtual(null));
  useFecharNoVoltar(!!roteiroAtivo, () => setRoteiroAtivo(null));

  React.useLayoutEffect(() => {
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    const dadosVazios = () => {
      setWorkspacePersistido(false);
      setContas(ordenarContasPorSequenciaNumerica(planoContasPadrao));
      setCentrosCusto([]);
      setBensImobilizado([]);
      setMapeamentosOrigem([]);
      setPreLancamentos([]);
      setLancamentos([]);
      setLivros([]);
      setCompetenciasFechadas([]);
      setLembretes([]);
      setHistoricosPadrao([]);
      setLancamentosPadrao([]);
      setRegrasConciliacao([]);
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
            bensImobilizado: Array.isArray(dados?.bensImobilizado) ? dados.bensImobilizado : [],
            mapeamentosOrigem: Array.isArray(dados?.mapeamentosOrigem) ? dados.mapeamentosOrigem : [],
            preLancamentos: Array.isArray(dados?.preLancamentos) ? dados.preLancamentos : [],
            lancamentos: Array.isArray(dados?.lancamentos) ? dados.lancamentos.map((item: LancamentoContabil) =>
              (item.origem === "Manual" || item.estornoDe) && !item.statusManual
                ? { ...item, statusManual: "pendente_aprovacao" as const }
                : item) : [],
            livros: Array.isArray(dados?.livros) ? dados.livros : [],
            lembretes: Array.isArray(dados?.lembretes) ? dados.lembretes : [],
            historicosPadrao: Array.isArray(dados?.historicosPadrao) ? dados.historicosPadrao : [],
            lancamentosPadrao: Array.isArray(dados?.lancamentosPadrao) ? dados.lancamentosPadrao : [],
            regrasConciliacao: Array.isArray(dados?.regrasConciliacao) ? dados.regrasConciliacao : [],
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
        setBensImobilizado(Array.isArray(dados.bensImobilizado) ? dados.bensImobilizado : []);
        setMapeamentosOrigem(Array.isArray(dados.mapeamentosOrigem) ? dados.mapeamentosOrigem : []);
        setPreLancamentos(Array.isArray(dados.preLancamentos) ? dados.preLancamentos : []);
        setLancamentos(Array.isArray(dados.lancamentos) ? dados.lancamentos : []);
        setLivros(Array.isArray(dados.livros) ? dados.livros : []);
        setLembretes(Array.isArray(dados.lembretes) ? dados.lembretes : []);
        setHistoricosPadrao(Array.isArray(dados.historicosPadrao) ? dados.historicosPadrao : []);
        setLancamentosPadrao(Array.isArray(dados.lancamentosPadrao) ? dados.lancamentosPadrao : []);
        setRegrasConciliacao(Array.isArray(dados.regrasConciliacao) ? dados.regrasConciliacao : []);
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
    const dados = { empresa: { ...empresa, certificadoAtivo: false, certificadoNomeArquivo: undefined }, contas, centrosCusto, bensImobilizado, mapeamentosOrigem, preLancamentos, lancamentos, livros, lembretes, historicosPadrao, lancamentosPadrao, regrasConciliacao };
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
  }, [empresa, dadosEmpresaCarregadosCnpj, contas, centrosCusto, bensImobilizado, mapeamentosOrigem, preLancamentos, lancamentos, livros, lembretes, historicosPadrao, lancamentosPadrao, regrasConciliacao, auth.cnpjs.join(","), tentativaOnline]);

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
      bensImobilizado,
      mapeamentosOrigem,
      preLancamentos,
      lancamentos: novosLancamentos,
      livros,
      lembretes,
      historicosPadrao,
      lancamentosPadrao,
      regrasConciliacao,
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

  // Lista de empresas para o seletor do topo (as autorizadas na sessão, com nome do cadastro quando houver)
  React.useEffect(() => {
    let ativo = true;
    void (async () => {
      const limpar = (v: unknown) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
      let cadastradas: EmpresaDados[] = [];
      try {
        const r = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.sucesso === true && Array.isArray(j.empresas)) cadastradas = j.empresas as EmpresaDados[];
      } catch { /* sem rede: o seletor mostra só os CNPJs autorizados */ }
      if (!ativo) return;
      const porCnpj = new Map<string, EmpresaDados>(cadastradas.map((e) => [limpar(e.cnpj), e]));
      setListaEmpresas(auth.cnpjs.map((c) => {
        const d = porCnpj.get(c);
        return { cnpj: c, nome: d?.razaoSocial || d?.nomeFantasia || c, dados: d ? { ...initialEmpresa, ...d } : { ...initialEmpresa, cnpj: c } };
      }));
    })();
    return () => { ativo = false; };
  }, [auth.cnpjs.join(",")]);

  // Troca a empresa ativa do sistema inteiro: substitui os dados (não mistura com os da empresa anterior)
  const trocarEmpresaAtiva = (nova: EmpresaDados) => {
    const dados: EmpresaDados = { ...initialEmpresa, ...nova, certificadoAtivo: false };
    setEmpresa(dados);
    try { localStorage.setItem("murad_empresa_salva", JSON.stringify(dados)); } catch { /* troca vale só nesta sessão */ }
  };
  const escolherEmpresaPeloCnpj = (cnpj: string) => {
    const alvo = listaEmpresas.find((e) => e.cnpj === cnpj);
    if (alvo) trocarEmpresaAtiva(alvo.dados);
  };

  // Itens da barra de pesquisa do topo: módulos, empresas do escritório e contas do plano
  const itensBusca = React.useMemo<ItemBusca[]>(() => {
    const modulos: [TabId, string, string][] = [
      ["inicio", "Tela Inicial", "home painel resumo inicio pendencias lembretes"],
      ["empresa", "Cadastro de Empresa", "empresas cnpj cadastrar cliente razao social certificado digital excluir apagar regime"],
      ["agenda", "Agenda & Lembretes", "prazos vencimentos calendario lembrete compromisso data"],
      ["fluxo-previtico", "Fluxo Prevítico", "fluxo de caixa projecao entradas saidas saldo zerar"],
      ["modulos-finais", "Obrigações & Gestão", "obrigacoes acessorias declaracoes ecd ecf sped dctf defis"],
      ["gestao-contabil", "Gestão contábil", "fechamento fechar competencia conciliacao bancaria extrato ofx imobilizado depreciacao"],
      ["conexoes", "Conexão Órgãos", "receita sefaz serpro ecac conexao orgaos status"],
      ["lancamentos", "Lançamentos", "lancamento contabil debito credito partida dobrada estorno historico manual"],
      ["aprovacoes", "Aprovar lançamentos", "aprovacao aprovar rejeitar pre-lancamentos pendentes"],
      ["balancete", "Balancete", "balancete verificacao saldo contas debito credito"],
      ["livros", "Livros Fiscais & ECD", "livro diario razao ecd balanco patrimonial dre demonstracao resultado"],
      ["demonstracoes", "Demonstrações e relatórios", "dfc fluxo de caixa dmpl mutacoes patrimonio notas explicativas indices liquidez endividamento margem graficos relatorio cliente painel escritorio ecf y600 socios parte b lalur"],
      ["plano-contas", "Plano de Contas", "contas contabeis plano saldo inicial codigo natureza sintetica analitica"],
      ["migracao", "Migração Contábil", "importar migrar migracao alterdata dominio atron saldos plano de contas centro de custo exportar txt csv"],
      ["integracao", "Integrações", "fiscal dp integracao enviar receber"],
      ["revisao-origens", "Revisar dados recebidos", "origens fiscal dp revisao notas folha conciliacao mapeamento"],
      ["calculadora", "Calculadora 3D", "calculadora tributos imposto calcular zerar historico"],
      ["agente", "Agentes & Robô", "robos agente conferidor automatico"],
      ["ia-premium", "IA Murade Premium", "inteligencia artificial assistente pergunta voz"],
    ];
    // Assuntos dentro das telas: abrem a tela e piscam o título da parte procurada.
    const assuntos: [TabId, string, string, string][] = [
      ["livros", "Livro Diário", "diario livro numeracao", "Livro Diário"],
      ["demonstracoes", "DFC — Demonstração dos Fluxos de Caixa", "dfc fluxo caixa indireto direto operacional investimento financiamento", "Demonstração dos Fluxos de Caixa"],
      ["demonstracoes", "Painel do escritório (fechamento, ECD e ECF)", "painel escritorio quem fechou pendencia ecd ecf entregar prazo", "Painel do escritório"],
      ["migracao", "Importar ECD de outro sistema", "importar ecd sped contabil txt alterdata dominio saldos lancamentos", "Arquivos e Leitura"],
      ["livros", "Livro Razão", "razao livro contas", "Livro Razão"],
      ["livros", "Balanço Patrimonial", "balanco patrimonial ativo passivo patrimonio liquido", "Balanço Patrimonial"],
      ["livros", "DRE (Demonstração do Resultado)", "dre resultado exercicio lucro prejuizo receitas despesas", "DRE gerencial"],
      ["livros", "Fluxo de Caixa interno", "fluxo caixa demonstracao", "Fluxo de Caixa"],
      ["livros", "Autenticação da ECD", "ecd autenticacao junta comercial termo", "Autenticação oficial da ECD"],
      ["livros", "Conferência prévia da ECD", "ecd conferencia previa sped contabil", "Conferência prévia"],
      ["livros", "Livro Caixa (Simples Nacional)", "livro caixa simples nacional movimentacao financeira bancaria termo abertura encerramento", "Livro Caixa (Simples)"],
      ["livros", "Encerramento do resultado", "encerramento zeramento apuracao resultado lucros prejuizos acumulados", "Encerramento do resultado"],
      ["lancamentos", "Lançamento com várias partidas", "varias partidas multiplas lote rateio um debito varios creditos", "Forma do lançamento"],
      ["lancamentos", "Lançamentos e históricos padrão", "lancamento padrao recorrente aluguel honorario historico padrao", "Lançamentos padrão"],
      ["gestao-contabil", "Conciliação bancária e regras", "conciliacao bancaria extrato csv excel xlsx ofx regra sugestao", "Regras de conciliação"],
      ["balancete", "Balancete de verificação", "balancete verificacao", "Balancete local"],
      ["plano-contas", "Saldos iniciais (partidas dobradas)", "saldo inicial abertura partida dobrada", "Partidas dobradas dos saldos iniciais"],
      ["revisao-origens", "Conciliação Fiscal/DP → Contábil", "conciliacao fiscal dp contabil", "Conciliação Fiscal/DP"],
      ["revisao-origens", "Mapeamento de contas por empresa", "mapeamento contas origem conta contabil", "Mapeamento de contas"],
      ["revisao-origens", "Prévia contábil da folha", "previa folha pagamento provisao salarios encargos", "Prévia contábil da folha"],
      ["revisao-origens", "Prévia contábil das notas fiscais", "previa notas fiscais compra venda lancamento nota", "Prévia contábil das notas"],
      ["revisao-origens", "Conferência de tributos por regime", "conferencia tributos regime simples presumido real", "Conferência de tributos"],
      ["revisao-origens", "Lançamentos manuais e estornos", "manual estorno estornar lancamento", "Lançamentos manuais e estornos"],
      ["revisao-origens", "Histórico e trilha de auditoria", "historico auditoria trilha log", "trilha de auditoria"],
      ["migracao", "Importar plano de contas do Alterdata", "importar plano contas alterdata exportacao txt exppcontas", "Arquivos e Leitura"],
      ["migracao", "Importar lançamentos / diário do Alterdata", "importar lancamentos diario alterdata txt modelo", "Arquivos e Leitura"],
    ];
    const itens: ItemBusca[] = modulos.map(([id, rotulo, palavras]) => ({ id: `m-${id}`, rotulo, tipo: "Módulo", palavras, acao: () => setTabAtiva(id) }));
    for (const [tab, rotulo, palavras, campo] of assuntos) itens.push({ id: `a-${tab}-${rotulo}`, rotulo, tipo: "Assunto", palavras, acao: () => { setTabAtiva(tab); destacarCampo(campo); } });
    for (const e of listaEmpresas) itens.push({ id: `e-${e.cnpj}`, rotulo: e.nome, tipo: "Empresa", palavras: e.cnpj, acao: () => escolherEmpresaPeloCnpj(e.cnpj) });
    for (const c of contas.slice(0, 2000)) itens.push({ id: `c-${c.codigo}`, rotulo: `${c.codigo} · ${c.descricao}`, tipo: "Conta", acao: () => setTabAtiva("plano-contas") });
    return itens;
  }, [listaEmpresas, contas]);

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
                detalhes: real.detalhes ?? org.detalhes,
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
                    tls: item.tls ?? o.tls,
                    detalhes: item.detalhes ?? o.detalhes,
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
      const response = await fetchComGuarda(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/contabilizar`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ referencias }),
      });
      const result = await response.json().catch(() => ({}));
      if (tratarBloqueioServico(result)) return false;
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
      const response = await fetchComGuarda(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/lancamentos-manuais/${encodeURIComponent(id)}/decisao`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decisao, motivo }),
      });
      const result = await response.json().catch(() => ({}));
      if (tratarBloqueioServico(result)) return false;
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

  /** Rotas da escrituração avançada (várias partidas, padrões, encerramento, Livro Caixa, conciliação): grava no servidor e traz os dados atualizados. */
  const executarRotaEscrituracao = async (metodo: MetodoRota, caminho: string, corpo?: unknown): Promise<{ ok: boolean; corpo: any }> => {
    const empresaCnpj = empresa.cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!empresaCnpj) return { ok: false, corpo: { motivo: "Escolha a empresa." } };
    if (metodo !== "GET" && !(await flushWorkspaceRef.current())) {
      showToast("As alterações anteriores ainda não foram confirmadas no banco. Aguarde e tente de novo.", "info");
      return { ok: false, corpo: { motivo: "Gravação anterior pendente." } };
    }
    try {
      const response = await fetchComGuarda(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/${caminho}`, {
        method: metodo, credentials: "include", cache: "no-store",
        headers: { Accept: "application/json", ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(metodo === "POST" ? { body: JSON.stringify(corpo ?? {}) } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (tratarBloqueioServico(result)) return { ok: false, corpo: result };
      if (!response.ok || result.sucesso === false) { if (metodo !== "GET") showToast(String(result.motivo || "O servidor não confirmou."), "info"); return { ok: false, corpo: result }; }
      if (result.dados && typeof result.dados === "object") {
        const d = result.dados;
        if (Number.isSafeInteger(Number(result.versao))) versoesWorkspaceRef.current.set(empresaCnpj, Number(result.versao));
        setLancamentos(Array.isArray(d.lancamentos) ? d.lancamentos : []);
        setLivros(Array.isArray(d.livros) ? d.livros : []);
        setHistoricosPadrao(Array.isArray(d.historicosPadrao) ? d.historicosPadrao : []);
        setLancamentosPadrao(Array.isArray(d.lancamentosPadrao) ? d.lancamentosPadrao : []);
        setRegrasConciliacao(Array.isArray(d.regrasConciliacao) ? d.regrasConciliacao : []);
      }
      if (metodo !== "GET" && result.mensagem) showToast(String(result.mensagem), "success");
      return { ok: true, corpo: result };
    } catch {
      if (metodo !== "GET") showToast("Não foi possível falar com o servidor agora.", "info");
      return { ok: false, corpo: { motivo: "Sem conexão com o servidor." } };
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

  // 3/4. Rascunhos do Fiscal e do DP: chegam sozinhos pelo Robô Reconciliador; a conferência fica em "Revisar dados recebidos".
  const handleImportarFiscal = () => setTabAtiva("revisao-origens");
  const handleImportarDP = () => setTabAtiva("revisao-origens");

  // 5. Preparar agora (botão manual ao lado do robô): reprocessa a recepção desta empresa. Nunca aprova nada.
  const handleGerarTudo = async () => {
    const empresaCnpj = empresa.cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!empresaCnpj) { showToast("Escolha a empresa antes de preparar os rascunhos.", "info"); return; }
    try {
      const response = await fetchComGuarda(`/api/workspaces/${encodeURIComponent(empresaCnpj)}/reprocessar-recepcao`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({}));
      if (tratarBloqueioServico(result)) return;
      showToast(String(result.mensagem || result.motivo || (response.ok ? "Recepção reprocessada." : "Não foi possível preparar agora.")), response.ok ? "success" : "info");
      if (response.ok && (Number(result.criados) || Number(result.atualizados))) setTabAtiva("revisao-origens");
    } catch {
      showToast("Não foi possível preparar agora. O robô tenta sozinho a cada minuto.", "info");
    }
  };

  // 6. Fechar Mês no Balancete
  // REVISOR antes de fechar: fechamento guiado + extrato sem conciliação, folha do DP sem partida, lançamento repetido e Caixa com
  // saldo credor (o servidor confere com o que está salvo). O que bloqueia não deixa fechar; o resto pode fechar mesmo assim, registrado.
  const revisorFechamento = useRevisor();
  const handleFecharMes = async (competencia: string): Promise<boolean> => {
    const cnpj = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
    if (!cnpj || dadosEmpresaCarregadosCnpj !== cnpj || !workspacePersistido || !auth.cnpjs.includes(cnpj)) {
      showToast("Fechamento bloqueado: aguarde o carregamento e a confirmação do banco desta empresa.", "info");
      return false;
    }
    const local = revisarFechamento({ contas, lancamentos, preLancamentos, bensImobilizado }, competencia, new Set(competenciasFechadas));
    const revisao = await conferirNoServidor("fechamento", cnpj, { competencia }, local);
    if (!revisorFechamento.conferir(revisao, { acao: "fechamento", cnpj, competencia }, { salvar: () => fecharMesDireto(cnpj, competencia) })) return false;
    return fecharMesDireto(cnpj, competencia);
  };
  const fecharMesDireto = async (cnpj: string, competencia: string): Promise<boolean> => {
    try {
      const response = await fetchComGuarda(`/api/workspaces/${encodeURIComponent(cnpj)}/fechamentos`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const result = await response.json().catch(() => ({}));
      if (tratarBloqueioServico(result)) { setCompetenciasFechadas((atual) => result.codigo === "servico_ja_feito" ? Array.from(new Set([...atual, competencia])).sort() : atual); return false; }
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
    <AssistenteProvider assistenteRef={assistenteRef}>
    <div className="h-screen w-full overflow-hidden bg-[#F1F5F9] text-slate-800 flex font-sans selection:bg-blue-600 selection:text-white">
      {/* 1. BARRA LATERAL NO LADO ESQUERDO (DESKTOP) — FIXA COM ROLAGEM INDEPENDENTE */}
      <div className="hidden lg:flex shrink-0 h-full">
        <Sidebar
          tabAtiva={tabAtiva}
          onSelectTab={(tab) => setTabAtiva(tab)}
          pendentesAprovacao={lancamentos.filter((l) => l.statusManual === "pendente_aprovacao").length}
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
              pendentesAprovacao={lancamentos.filter((l) => l.statusManual === "pendente_aprovacao").length}
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
          onTrocarEmpresa={() => setTabAtiva("empresa")}
          empresas={listaEmpresas.map(({ cnpj, nome }) => ({ cnpj, nome }))}
          onEscolherEmpresa={escolherEmpresaPeloCnpj}
          itensBusca={itensBusca}
          onLogout={auth.sair}
        />

        <AvisoServicoFeito />

        {/* Notificação Toast — embaixo e centralizada, para nunca ficar atrás das barras fixas do topo */}
        {toastMessage && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] w-[min(92vw,420px)] animate-bounce">
            <div className="bg-[#082B66] text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-[#0A357D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        {/* CONTAINER DO CONTEÚDO CENTRAL COM ROLAGEM INDEPENDENTE (A BARRA LATERAL FICA FIXA) */}
        <div className="flex-1 overflow-y-auto overscroll-contain content-scroll">
          <AlertaRobosParados />
          <FaixaEcd cnpj={empresa.cnpj} onAbrir={() => setTabAtiva("livros" as TabId)} />
          <main className="p-2 sm:p-3 w-full mx-auto">
            {/* Grid Principal: 2 Colunas (Área de Trabalho + Sidebar do Robô) */}
            <div className="grid grid-cols-1 gap-5 items-start">
            {/* Coluna Esquerda: Conteúdo da Aba Selecionada */}
            <div className="space-y-4 min-w-0">
              <ErroTela chave={String(tabAtiva)}>
              {tabAtiva === "inicio" && (
                <CaixaPedirParaAlguem onEnviar={(frase) => { assistenteRef.current?.abrir(); assistenteRef.current?.perguntar(frase); }} />
              )}
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
                  onTrocarEmpresaAtiva={trocarEmpresaAtiva}
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

              {tabAtiva === "gestao-contabil" && (
                <GestaoContabilTab
                  empresa={empresa}
                  contas={contas}
                  lancamentos={lancamentos}
                  preLancamentos={preLancamentos}
                  centrosCusto={centrosCusto}
                  onCentrosCusto={setCentrosCusto}
                  bens={bensImobilizado}
                  onBens={setBensImobilizado}
                  onAdicionarLancamento={(novo) => setLancamentos((prev) => [novo, ...prev])}
                  competenciasFechadas={competenciasFechadas}
                  onFecharMes={handleFecharMes}
                  workspacePersistido={workspacePersistido}
                  confirmacoes={confirmacoesFechamento}
                  onConfirmacoes={setConfirmacoesFechamento}
                  onRota={executarRotaEscrituracao}
                  regrasConciliacao={regrasConciliacao}
                />
              )}

              {tabAtiva === "lancamentos" && (
                <LancamentosTab
                  competenciasFechadas={competenciasFechadas}
                  cnpj={String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase()}
                  lancamentos={lancamentos}
                  contas={contas}
                  centrosCusto={centrosCusto}
                  onImportarFiscal={handleImportarFiscal}
                  onImportarDP={handleImportarDP}
                  onGerarTudo={handleGerarTudo}
                  onAdicionarLancamento={(novo) =>
                    setLancamentos((prev) => [novo, ...prev])
                  }
                  onEstornarLancamento={handleEstornarLancamento}
                  workspacePersistido={workspacePersistido}
                  onDecidirLancamentoManual={handleDecidirLancamentoManual}
                  historicosPadrao={historicosPadrao}
                  lancamentosPadrao={lancamentosPadrao}
                  onRota={executarRotaEscrituracao}
                />
              )}

              {tabAtiva === "aprovacoes" && (
                <AprovacoesTab
                  lancamentos={lancamentos}
                  empresaNome={empresa.razaoSocial || empresa.nomeFantasia || empresa.cnpj}
                  workspacePersistido={workspacePersistido}
                  onDecidirLancamentoManual={handleDecidirLancamentoManual}
                  cnpj={empresa.cnpj}
                  onNavegar={(tela) => setTabAtiva(tela as TabId)}
                  onPedirAgente={(texto) => { assistenteRef.current?.abrir(); assistenteRef.current?.perguntar(texto); }}
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
                  pendenciasFechamento={(comp) => conferirFechamento({ competencia: comp, contas, lancamentos, preLancamentos, bens: bensImobilizado, confirmacoes: confirmacoesFechamento[comp] ?? {} }).itens.filter((i) => i.bloqueia && !i.ok).map((i) => i.titulo)}
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
                  onMapeamentoReferencial={(mapa) => setEmpresa((prev) => ({ ...prev, mapeamentoReferencial: mapa }))}
                  onRota={executarRotaEscrituracao}
                />
              )}

              {tabAtiva === "demonstracoes" && (
                <DemonstracoesTab
                  empresa={empresa}
                  contas={contas}
                  lancamentos={lancamentos}
                  workspaceCarregado={Boolean(empresa.cnpj) && dadosEmpresaCarregadosCnpj === String(empresa.cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}
                  workspacePersistido={workspacePersistido}
                  onAtualizarEmpresa={(parcial) => setEmpresa((prev) => ({ ...prev, ...parcial }))}
                  onNavegar={(tela, cnpj) => { if (cnpj && String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) escolherEmpresaPeloCnpj(cnpj); setTabAtiva(tela as TabId); }}
                  onDadosAtualizados={(cnpj, d, versao) => {
                    // Entrega de ECD/ECF marcada no painel: só a parte do cadastro que o servidor gravou (sem sobrescrever o resto).
                    if (String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) return;
                    if (versao !== null) versoesWorkspaceRef.current.set(cnpj, versao);
                    setEmpresa((prev) => ({ ...prev, entregasSped: d?.empresa?.entregasSped, notasExplicativas: d?.empresa?.notasExplicativas ?? prev.notasExplicativas }));
                  }}
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

              {tabAtiva === "backups" && <BackupsTab />}
              {tabAtiva === "tarefas-equipe" && <TarefasEquipeTab />}
              {tabAtiva === "meu-jeito" && <MeuJeitoTab />}
              {tabAtiva === "escola" && <TelaEscolaMurade />}
              {tabAtiva === "revisor" && (
                <RevisorTab
                  onNavegar={(tela, cnpj) => { if (cnpj && String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) escolherEmpresaPeloCnpj(cnpj); setTabAtiva(tela as TabId); }}
                  onDadosAtualizados={(cnpj, d, versao) => {
                    // "Corrigir para mim" do Revisor na empresa aberta: a tela recebe o que o servidor gravou (sem sobrescrever).
                    if (String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) return;
                    if (versao !== null) versoesWorkspaceRef.current.set(cnpj, versao);
                    setLancamentos(Array.isArray(d.lancamentos) ? d.lancamentos : []);
                  }}
                />
              )}
              </ErroTela>
            </div>

            {/* Robô Murade: minimizado e flutuante (abre ao clicar) */}
            <RobotSidebar
              onRunAudit={handleRunAudit}
              isAuditing={isAuditing}
              onNavigateTab={(tab) => setTabAtiva(tab)}
            />
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
      <AvisoTarefasEquipe onAbrir={() => setTabAtiva("tarefas-equipe")} />
      <MeuJeitoMotor tabAtiva={tabAtiva} onNavegar={(tela) => setTabAtiva(tela as TabId)} assistenteRef={assistenteRef} onEhDono={setEhDonoSistema} />
      <ApresentacaoSistema assistenteRef={assistenteRef} ehDono={ehDonoSistema} />
      {/* Botão PARAR da Agente: só aparece enquanto ela fala ou age e quando não há outro PARAR à vista (Esc também para). */}
      <BotaoPararAgente variante="flutuante" />
      <IAMuradModal
        ref={assistenteRef}
        isOpen={assistenteAberta}
        onClose={() => setAssistenteAberta(false)}
        onOpen={() => setAssistenteAberta(true)}
        empresa={empresa}
        lancamentos={lancamentos}
      />
      <BalaoAjudaProativa
        visivel={!!dificuldadeAtual}
        textoAlvo={dificuldadeAtual?.texto || ''}
        onAceitar={aceitarAjudaProativa}
        onRecusar={() => setDificuldadeAtual(null)}
        servico={dificuldadeAtual && consultorLiberado ? ofertaDeServico(tabAtiva, dificuldadeAtual.texto)?.rotulo : undefined}
        onFazerServico={() => {
          const oferta = dificuldadeAtual ? ofertaDeServico(tabAtiva, dificuldadeAtual.texto) : null;
          setDificuldadeAtual(null);
          if (!oferta) return;
          assistenteRef.current?.abrir();
          assistenteRef.current?.perguntar(pedidoDaOferta(oferta, empresa));
        }}
      />
      {revisorFechamento.painel}
      <CartaoOkContador
        onNavegar={(tela, cnpj) => { if (String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) escolherEmpresaPeloCnpj(cnpj); setTabAtiva(tela as TabId); }}
        onFalar={(t) => assistenteRef.current?.falar(t)}
        onPedirAgente={(texto) => { assistenteRef.current?.abrir(); assistenteRef.current?.perguntar(texto); }}
      />
      <AvisoServicoPronto
        onAbrir={(cnpj) => { if (String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== cnpj) escolherEmpresaPeloCnpj(cnpj); setTabAtiva("aprovacoes"); }}
        onFalar={(t) => assistenteRef.current?.falar(t)}
      />
      <PilotoVisivel
        tabAtiva={tabAtiva}
        telasValidas={IDS_DE_TELAS_CONTABIL}
        navegarPara={(tela) => setTabAtiva(tela as TabId)}
        cnpjsPermitidos={auth.cnpjs}
        empresaAtual={String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase()}
        empresaPronta={dadosEmpresaCarregadosCnpj === String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase()}
        selecionarEmpresa={escolherEmpresaPeloCnpj}
        aoFalar={(t) => assistenteRef.current?.falar(t)}
      />
      <GuiaPassoAPasso
        passos={roteiroAtivo}
        onFalarPasso={(t) => assistenteRef.current?.falar(t)}
        onConcluir={() => setRoteiroAtivo(null)}
      />
    </div>
    </AssistenteProvider>
  );
}
