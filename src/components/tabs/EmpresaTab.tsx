import React, { useState, useEffect, useRef } from "react";
import { EmpresaDados } from "../../types";
import {
  ArrowLeft,
  Building2,
  Calendar as CalendarIcon,
  CheckCircle2,
  ShieldCheck,
  Search,
  Scale,
  Save,
  Trash2,
  Key,
  FolderOpen,
  UploadCloud,
  FileText,
  Settings,
  Sparkles,
  ExternalLink,
  Users,
  Edit,
  Plus,
  X,
  Lock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  UserCheck,
  Zap,
} from "lucide-react";
import { CertificadoDigitalModal } from "../modals/CertificadoDigitalModal";
import { ModalConexaoMuradFiscal } from "../modals/ModalConexaoMuradFiscal";
import { conectarEPuxarEmpresaMuradFiscal, conectarMuradDP } from "../../services/integracaoMuradService";
import { baixarPacoteEmpresasMurade, lerPacoteEmpresasMurade } from "../../services/migracaoEmpresaService";

const competenciaAtualISO = () => { const hoje = new Date(); return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`; };

interface EmpresaTabProps {
  empresa: EmpresaDados;
  onUpdateEmpresa: (dados: Partial<EmpresaDados>) => void;
  onVoltar?: () => void;
  onIrParaAgenda?: () => void;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
  cnpjsAutorizados?: string[];
  onAutorizarCnpj?: (cnpj: string) => Promise<boolean>;
  onRemoverEmpresa?: (cnpj: string) => Promise<boolean>;
}

export const EmpresaTab: React.FC<EmpresaTabProps> = ({
  empresa,
  onUpdateEmpresa,
  onVoltar,
  onIrParaAgenda,
  onConectarFiscal,
  onConectarDP,
  cnpjsAutorizados = [],
  onAutorizarCnpj,
  onRemoverEmpresa,
}) => {
  // Lista de empresas cadastradas no sistema (persistência real em localStorage)
  const [empresasCadastradas, setEmpresasCadastradas] = useState<EmpresaDados[]>(() => {
    try {
      const salvas = localStorage.getItem("murad_empresas_lista");
      if (salvas) {
        const parsed = JSON.parse(salvas);
        // Filtrar mocks antigos de teste se houver
        const limpas = (Array.isArray(parsed) ? parsed : []).filter(
          (e: EmpresaDados) =>
            !e.razaoSocial?.includes("EMPRESA EXEMPLO") &&
            e.cnpj !== "00.000.000/0001-00" &&
            (e.cnpj || e.razaoSocial)
        );
        return limpas.filter((item: EmpresaDados) => cnpjsAutorizados.includes(String(item.cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, ""))).map((item: EmpresaDados) => ({ ...item, certificadoAtivo: false }));
      }
    } catch (e) {
      console.warn("Erro ao carregar lista de empresas:", e);
    }
    // Se a empresa passada como prop for válida e não fake, incluir
    if (
      empresa &&
      (empresa.cnpj || empresa.razaoSocial) &&
      !empresa.razaoSocial.includes("EMPRESA EXEMPLO") &&
      empresa.cnpj !== "00.000.000/0001-00"
    ) {
      return [empresa];
    }
    return [];
  });

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const response = await fetch("/api/workspaces", { credentials: "include", cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.sucesso !== true || !Array.isArray(result.empresas)) return;
        if (!ativo) return;
        setEmpresasCadastradas((atuais) => {
          const porCnpj = new Map<string, EmpresaDados>();
          for (const item of atuais) {
            const cnpj = String(item.cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
            if (cnpjsAutorizados.includes(cnpj)) porCnpj.set(cnpj, item);
          }
          for (const item of result.empresas as EmpresaDados[]) {
            const cnpj = String(item.cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
            if (cnpjsAutorizados.includes(cnpj)) porCnpj.set(cnpj, { ...porCnpj.get(cnpj), ...item, certificadoAtivo: false });
          }
          const lista = [...porCnpj.values()];
          try { localStorage.setItem("murad_empresas_lista", JSON.stringify(lista)); } catch { /* dados permanecem no PostgreSQL */ }
          return lista;
        });
      } catch (error) {
        console.warn("Não foi possível sincronizar a lista de empresas do PostgreSQL:", error);
      }
    })();
    return () => { ativo = false; };
  }, [cnpjsAutorizados.join(",")]);

  // ID da empresa em modo de edição (null = novo cadastro limpo)
  const [modoEdicaoId, setModoEdicaoId] = useState<string | null>(null);

  // Controle de visibilidade do formulário
  // Se não houver empresa cadastrada, fica aberto por padrão. Se houver, fica disponível para novo cadastro ou edição.
  const [formularioAberto, setFormularioAberto] = useState<boolean>(true);

  // Estados dos campos do formulário (SEMPRE INICIAM LIMPOS se não estiver em edição)
  const [cnpj, setCnpj] = useState("");
  const [ie, setIe] = useState("");
  const [im, setIm] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [naturezaJuridica, setNaturezaJuridica] = useState("");
  const [regimeTributario, setRegimeTributario] = useState("");
  const [cnaePrincipal, setCnaePrincipal] = useState("");
  const [capitalSocial, setCapitalSocial] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [cidadeUf, setCidadeUf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [contadorNome, setContadorNome] = useState("");
  const [contadorCrc, setContadorCrc] = useState("");
  const [ibsAliquota, setIbsAliquota] = useState(0);
  const [cbsAliquota, setCbsAliquota] = useState(0);
  const [situacaoCadastral, setSituacaoCadastral] = useState("ATIVA");
  const [dataSituacao, setDataSituacao] = useState("");
  const [dataAbertura, setDataAbertura] = useState("");
  const [qsaList, setQsaList] = useState<Array<{ nome: string; qualificacao: string; faixaEtaria?: string }>>([]);
  const [fonteDados, setFonteDados] = useState("");

  // Certificado Digital no formulário
  const [formCertAtivo, setFormCertAtivo] = useState(false);
  const [formCertNome, setFormCertNome] = useState("");
  const [formCertTamanho, setFormCertTamanho] = useState("");
  const [formCertValidade, setFormCertValidade] = useState("");
  const [formCertTipo, setFormCertTipo] = useState("ICP-Brasil A1");
  const [formCertEmissor, setFormCertEmissor] = useState("AC SERPRO v5");

  // Feedback e Loading
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [modalCertificadoAberto, setModalCertificadoAberto] = useState(false);
  const [modalFiscalAberto, setModalFiscalAberto] = useState(false);
  const [empresaDetectadaModal, setEmpresaDetectadaModal] = useState<EmpresaDados | null>(null);
  const [isDraggingCert, setIsDraggingCert] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const migrationInputRef = useRef<HTMLInputElement | null>(null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Puxar empresa registrada no Mural de Fiscal
  const handlePuxarEmpresaDoMuradFiscal = async () => {
    setLoadingCnpj(true);
    showToast("🔄 Conectando ao Mural de Fiscal e buscando empresa cadastrada...");
    try {
      const res = await conectarEPuxarEmpresaMuradFiscal();
      if (res.sucesso && res.empresa) {
        if (onAutorizarCnpj && !await onAutorizarCnpj(res.empresa.cnpj)) throw new Error("A empresa do Fiscal não foi autorizada para este usuário do Contábil.");
        setEmpresaDetectadaModal(res.empresa);
        setModalFiscalAberto(true);

        // Atualiza a empresa ativa
        onUpdateEmpresa(res.empresa);
        localStorage.setItem("murad_empresa_salva", JSON.stringify(res.empresa));

        // Insere na lista se não estiver
        setEmpresasCadastradas((prev) => {
          const semEla = prev.filter(
            (e) => (e.cnpj && res.empresa.cnpj && e.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "") !== res.empresa.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "")) && e.id !== res.empresa.id
          );
          const nova = [res.empresa, ...semEla];
          persistirEmpresas(nova);
          return nova;
        });

        showToast(res.mensagem || `Empresa recebida: ${res.empresa.razaoSocial}. Dados fiscais e de DP não foram importados.`);
      } else {
        showToast("⚠️ Nenhuma empresa localizada no Mural de Fiscal.");
      }
    } catch (e) {
      console.warn("Erro ao puxar do Fiscal:", e);
      showToast(e instanceof Error ? e.message : "Integração com Murad Fiscal indisponível.");
    } finally {
      setLoadingCnpj(false);
    }
  };

  // Salvar a lista no localStorage sempre que mudar
  const persistirEmpresas = (lista: EmpresaDados[]) => {
    try {
      localStorage.setItem("murad_empresas_lista", JSON.stringify(lista));
    } catch (e) {
      console.warn("Erro ao salvar lista de empresas:", e);
    }
  };

  const handleImportarPacoteMurade = async (arquivo?: File) => {
    if (!arquivo) return;
    try {
      const pacote = await lerPacoteEmpresasMurade(arquivo);
      const importadas: EmpresaDados[] = pacote.map((item, index) => ({
        ...item,
        id: item.id || `mig-${item.cnpj.replace(/\W/g, '')}-${index}`,
        municipio: item.municipio || item.cidade || '', uf: item.uf || '', cidadeUf: [item.municipio || item.cidade, item.uf].filter(Boolean).join(' / '),
        razaoSocial: item.razaoSocial, nomeFantasia: item.nomeFantasia || item.razaoSocial,
        regime: item.regime || item.regimeTributario || '', competencia: '', ibsAliquota: 0, cbsAliquota: 0,
        cnae: '', situacaoCadastral: 'Não consultada', configuracaoFiscal: {
          seriesEmissao: item.configuracaoFiscal?.seriesEmissao || [],
          modelosDocumento: item.configuracaoFiscal?.modelosDocumento || [],
          fontesEntrada: item.configuracaoFiscal?.fontesEntrada || [],
          fontesSaida: item.configuracaoFiscal?.fontesSaida || [],
          identificadorEmissor: item.configuracaoFiscal?.identificadorEmissor,
        },
        inscricaoEstadual: item.inscricaoEstadual, inscricaoMunicipal: item.inscricaoMunicipal,
        endereco: item.endereco, cep: item.cep,
        certificadoNomeArquivo: item.certificado?.nomeArquivo,
        certificadoValidade: item.certificado?.validade,
        certificadoTipo: item.certificado?.tipo,
        certificadoAtivo: false,
      }));
      if (onAutorizarCnpj) {
        for (const item of importadas) {
          if (!await onAutorizarCnpj(item.cnpj)) throw new Error(`O CNPJ ${item.cnpj} não foi autorizado; o pacote não foi importado.`);
        }
      }
      const porCnpj = new Map<string, EmpresaDados>(empresasCadastradas.map((item) => [item.cnpj.replace(/\W/g, ''), item]));
      importadas.forEach((item) => {
        const chave = item.cnpj.replace(/\W/g, '');
        porCnpj.set(chave, { ...porCnpj.get(chave), ...item });
      });
      const atualizadas = [...porCnpj.values()];
      setEmpresasCadastradas(atualizadas);
      persistirEmpresas(atualizadas);
      if (importadas[0]) {
        onUpdateEmpresa(importadas[0]);
        localStorage.setItem('murad_empresa_salva', JSON.stringify(importadas[0]));
      }
      showToast(`${importadas.length} empresa(s) importada(s) do pacote Murade. Revise os campos fiscais antes de usar.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível importar o pacote Murade.');
    }
    if (migrationInputRef.current) migrationInputRef.current.value = '';
  };

  // Limpeza completa de todos os campos do formulário
  const limparFormulario = () => {
    setCnpj("");
    setIe("");
    setIm("");
    setRazaoSocial("");
    setNomeFantasia("");
    setNaturezaJuridica("");
    setRegimeTributario("");
    setCnaePrincipal("");
    setCapitalSocial("");
    setEndereco("");
    setCep("");
    setCidadeUf("");
    setWhatsapp("");
    setTelefone("");
    setEmail("");
    setResponsavelNome("");
    setContadorNome("");
    setContadorCrc("");
    setIbsAliquota(0);
    setCbsAliquota(0);
    setSituacaoCadastral("ATIVA");
    setDataSituacao("");
    setDataAbertura("");
    setQsaList([]);
    setFonteDados("");
    setFormCertAtivo(false);
    setFormCertNome("");
    setFormCertTamanho("");
    setFormCertValidade("");
    setFormCertTipo("ICP-Brasil A1");
    setFormCertEmissor("AC SERPRO v5");
    setModoEdicaoId(null);
  };

  // Carregar dados de uma empresa existente para edição
  const handleEditarEmpresa = (emp: EmpresaDados) => {
    setModoEdicaoId(emp.id || emp.cnpj || "emp-ativa");
    setCnpj(emp.cnpj || "");
    setIe(emp.inscricaoEstadual || "");
    setIm(emp.inscricaoMunicipal || "");
    setRazaoSocial(emp.razaoSocial || "");
    setNomeFantasia(emp.nomeFantasia || "");
    setNaturezaJuridica(emp.naturezaJuridica || "");
    setRegimeTributario(emp.regime || "");
    setCnaePrincipal(emp.cnae || "");
    setCapitalSocial(emp.capitalSocialFormatado || "");
    setEndereco(emp.endereco || "");
    setCep(emp.cep || "");
    setCidadeUf(emp.cidadeUf || "");
    setWhatsapp(emp.whatsapp || "");
    setTelefone(emp.telefone || "");
    setEmail(emp.email || "");
    setResponsavelNome(emp.responsavelNome || "");
    setContadorNome(emp.contadorNome || "");
    setContadorCrc(emp.contadorCrc || "");
    setIbsAliquota(emp.ibsAliquota ?? 0);
    setCbsAliquota(emp.cbsAliquota ?? 0);
    setSituacaoCadastral(emp.situacaoCadastral || "ATIVA");
    setDataSituacao(emp.dataSituacao || "");
    setDataAbertura(emp.dataAbertura || "");
    setQsaList(emp.qsa || []);
    setFonteDados(emp.fonteDados || "Dados da Empresa");

    // Certificado
    // A saved filename is not proof of upload, validation, or server-side storage.
    setFormCertAtivo(false);
    setFormCertNome(emp.certificadoNomeArquivo || "");
    setFormCertTamanho(emp.certificadoTamanho || "");
    setFormCertValidade("");
    setFormCertTipo("Não validado");
    setFormCertEmissor("");

    setFormularioAberto(true);

    // Scroll suave até o formulário
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    showToast(`✏️ Editando: "${emp.razaoSocial || emp.cnpj}". Altere os campos e clique em 'Salvar Alterações'.`);
  };

  // Cancelar a edição e limpar os campos
  const handleCancelarEdicao = () => {
    limparFormulario();
    showToast("Edição cancelada. Os campos foram limpos.");
  };

  // Estado do Modal de Confirmação de Exclusão In-App (sem window.confirm)
  const [empresaParaExcluir, setEmpresaParaExcluir] = useState<{ id: string; nome: string } | null>(null);

  // Excluir empresa cadastrada — Abre modal in-app
  const handleExcluirEmpresa = (empIdOuCnpj: string, empNome: string) => {
    setEmpresaParaExcluir({ id: empIdOuCnpj, nome: empNome });
  };

  const confirmarExclusaoEmpresa = async () => {
    if (!empresaParaExcluir) return;
    const { id: empIdOuCnpj, nome: empNome } = empresaParaExcluir;
    const registro = empresasCadastradas.find((e) => (e.id || e.cnpj) === empIdOuCnpj || e.cnpj === empIdOuCnpj);
    const cnpj = String(registro?.cnpj || (empIdOuCnpj.length >= 14 ? empIdOuCnpj : "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cnpj && onRemoverEmpresa && !await onRemoverEmpresa(cnpj)) return;
    const novaLista = empresasCadastradas.filter(
      (e) => (e.id || e.cnpj) !== empIdOuCnpj && e.cnpj !== empIdOuCnpj
    );
    setEmpresasCadastradas(novaLista);
    persistirEmpresas(novaLista);

    // Se a empresa excluída era a ativa
    if ((empresa.id || empresa.cnpj) === empIdOuCnpj || empresa.cnpj === empIdOuCnpj) {
      if (novaLista.length > 0) {
        const proxima = novaLista[0];
        onUpdateEmpresa(proxima);
        localStorage.setItem("murad_empresa_salva", JSON.stringify(proxima));
        showToast(`🗑️ Empresa excluída. A empresa '${proxima.razaoSocial}' agora está ativa.`);
      } else {
        // Nenhuma restante
        const limpa: EmpresaDados = {
          cnpj: "",
          razaoSocial: "",
          nomeFantasia: "",
          regime: "",
          municipio: "",
          uf: "",
          competencia: competenciaAtualISO(),
          ibsAliquota: 0,
          cbsAliquota: 0,
          cnae: "",
          situacaoCadastral: "",
          certificadoAtivo: false,
        };
        onUpdateEmpresa(limpa);
        localStorage.removeItem("murad_empresa_salva");
        showToast("🗑️ Empresa excluída. Nenhuma empresa cadastrada no momento.");
      }
    } else {
      showToast(`🗑️ Empresa '${empNome}' excluída com sucesso.`);
    }

    if (modoEdicaoId === empIdOuCnpj) {
      limparFormulario();
    }
    setEmpresaParaExcluir(null);
  };

  // Definir como empresa ativa
  const handleDefinirAtiva = (emp: EmpresaDados) => {
    onUpdateEmpresa(emp);
    try {
      localStorage.setItem("murad_empresa_salva", JSON.stringify(emp));
    } catch (e) {
      console.warn("Erro ao salvar empresa ativa:", e);
    }
    showToast(`⭐ Empresa '${emp.nomeFantasia || emp.razaoSocial}' definida como ATIVA no sistema!`);
  };

  // Upload direto do Certificado Digital do Computador
  const abrirSeletorArquivos = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const processarArquivoCertificado = (file: File) => {
    const tamanhoKb = (file.size / 1024).toFixed(1) + " KB";
    const nome = file.name;
    setFormCertAtivo(false);
    setFormCertNome(nome);
    setFormCertTamanho(tamanhoKb);
    setFormCertValidade("");
    setFormCertTipo("Não validado");
    setFormCertEmissor("");

    showToast(`Arquivo '${nome}' selecionado localmente; não foi enviado, validado ou ativado.`);
  };

  const handleDirectFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processarArquivoCertificado(e.target.files[0]);
    }
  };

  const handleDragOverCert = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCert(true);
  };

  const handleDragLeaveCert = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCert(false);
  };

  const handleDropCert = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCert(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processarArquivoCertificado(e.dataTransfer.files[0]);
    }
  };

  // Consulta real na Receita Federal
  const buscarDadosReceita = async () => {
    const rawCnpj = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^\d{14}$/.test(rawCnpj)) {
      showToast("A consulta automática por CNPJ alfanumérico ainda não é oferecida pelos provedores atuais. Você pode cadastrar a empresa manualmente.");
      return;
    }

    setLoadingCnpj(true);
    showToast("🔄 Consultando base oficial da Receita Federal...");

    try {
      let dados: any = null;
      try {
        const resp = await fetch(`/api/receita/cnpj/${rawCnpj}`);
        if (resp.ok) {
          dados = await resp.json();
        }
      } catch (err) {
        console.warn("Falha no proxy backend, tentando BrasilAPI direta...");
      }

      if (!dados) {
        const directResp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`);
        if (directResp.ok) {
          const d = await directResp.json();
          dados = {
            cnpj: cnpj,
            razaoSocial: d.razao_social || "",
            nomeFantasia: d.nome_fantasia || d.razao_social || "",
            situacao: d.descricao_situacao_cadastral || "ATIVA",
            dataSituacao: d.data_situacao_cadastral || "",
            dataAbertura: d.data_inicio_atividade || "",
            regimeTributario: d.opcao_pelo_simples ? "Simples Nacional" : "",
            naturezaJuridica: d.natureza_juridica || "",
            cnaePrincipal: `${d.cnae_fiscal || ""} - ${d.cnae_fiscal_descricao || ""}`,
            capitalSocialFormatado: d.capital_social
              ? `R$ ${Number(d.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              : "R$ 0,00",
            endereco: {
              completo: `${d.logradouro || ""}${d.numero ? ", " + d.numero : ""}${d.complemento ? " - " + d.complemento : ""}, ${d.bairro || ""}`,
              cep: d.cep || "",
              municipio: d.municipio || "",
              uf: d.uf || "",
            },
            contato: {
              telefone: d.ddd_telefone_1 ? `(${d.ddd_telefone_1.slice(0, 2)}) ${d.ddd_telefone_1.slice(2)}` : "",
              email: d.email ? d.email.toLowerCase() : "",
            },
            qsa: (d.qsa || []).map((s: any) => ({
              nome: s.nome_socio || "",
              qualificacao: s.qualificacao_socio || "Sócio",
              faixaEtaria: s.faixa_etaria || "",
            })),
            fonte: "Receita Federal do Brasil (BrasilAPI)",
          };
        }
      }

      if (dados && dados.razaoSocial) {
        setCnpj(dados.cnpj || cnpj);
        setRazaoSocial(dados.razaoSocial);
        setNomeFantasia(dados.nomeFantasia || dados.razaoSocial);
        setSituacaoCadastral(dados.situacao || "ATIVA");
        if (dados.dataSituacao) setDataSituacao(dados.dataSituacao);
        if (dados.dataAbertura) setDataAbertura(dados.dataAbertura);
        if (dados.naturezaJuridica) setNaturezaJuridica(dados.naturezaJuridica);
        if (dados.regimeTributario) setRegimeTributario(dados.regimeTributario);
        if (dados.cnaePrincipal) setCnaePrincipal(dados.cnaePrincipal);
        if (dados.capitalSocialFormatado) setCapitalSocial(dados.capitalSocialFormatado);

        const endTexto = typeof dados.endereco === "object" ? dados.endereco.completo : dados.endereco;
        if (endTexto) setEndereco(endTexto);
        const cepTexto = typeof dados.endereco === "object" ? dados.endereco.cep : "";
        if (cepTexto) setCep(cepTexto);
        const cidUfTexto =
          typeof dados.endereco === "object" ? `${dados.endereco.municipio || ""} / ${dados.endereco.uf || ""}` : "";
        if (cidUfTexto && cidUfTexto !== " / ") setCidadeUf(cidUfTexto);

        if (dados.contato?.telefone) setTelefone(dados.contato.telefone);
        if (dados.contato?.email) setEmail(dados.contato.email);
        if (dados.qsa) setQsaList(dados.qsa);
        setFonteDados(dados.fonte || "Receita Federal do Brasil");

        showToast(`✅ DADOS OFICIAIS LOCALIZADOS!\n"${dados.razaoSocial}" importada da Receita Federal.`);
      } else {
        showToast("⚠️ CNPJ não localizado na base pública. Você pode preencher os campos manualmente.");
      }
    } catch (err) {
      console.error(err);
      showToast("❌ Falha de comunicação com a Receita Federal. Você pode digitar os campos manualmente.");
    } finally {
      setLoadingCnpj(false);
    }
  };

  // Busca de CEP
  const buscarCepReal = async () => {
    const rawCep = cep.replace(/\D/g, "");
    if (rawCep.length !== 8) {
      showToast("⚠️ Digite um CEP com 8 dígitos para consultar.");
      return;
    }

    setLoadingCep(true);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cep/v1/${rawCep}`);
      if (resp.ok) {
        const d = await resp.json();
        if (d.street) setEndereco(`${d.street}${d.neighborhood ? ", " + d.neighborhood : ""}`);
        if (d.city && d.state) setCidadeUf(`${d.city} / ${d.state}`);
        showToast(`✅ Endereço localizado: ${d.street || ""} - ${d.city}/${d.state}`);
      } else {
        showToast("⚠️ CEP não localizado.");
      }
    } catch (e) {
      showToast("❌ Erro ao consultar CEP.");
    } finally {
      setLoadingCep(false);
    }
  };

  // SALVAR EMPRESA (COM LIMPEZA AUTOMÁTICA OBRIGATÓRIA PARA NÃO DUPLICAR)
  const handleSalvarEmpresa = async () => {
    if (!razaoSocial.trim() && !cnpj.trim()) {
      showToast("⚠️ Por favor, informe pelo menos a Razão Social ou o CNPJ da empresa.");
      return;
    }

    const idFinal = modoEdicaoId || `emp-${cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "") || Date.now()}`;
    const cnpjLimpo = cnpj.trim().toUpperCase();
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpjLimpo.replace(/[^0-9A-Z]/g, ""))) {
      showToast("⚠️ Informe um CNPJ com 14 caracteres para manter o cadastro separado por empresa.");
      return;
    }
    if (onAutorizarCnpj && !await onAutorizarCnpj(cnpjLimpo)) return;

    const dadosParaSalvar: EmpresaDados = {
      id: idFinal,
      cnpj: cnpjLimpo,
      razaoSocial: razaoSocial.trim(),
      nomeFantasia: (nomeFantasia.trim() || razaoSocial.trim()),
      regime: regimeTributario as any,
      inscricaoEstadual: ie.trim(),
      inscricaoMunicipal: im.trim(),
      naturezaJuridica: naturezaJuridica.trim(),
      cnae: cnaePrincipal.trim(),
      capitalSocialFormatado: capitalSocial.trim(),
      endereco: endereco.trim(),
      cep: cep.trim(),
      cidadeUf: cidadeUf.trim(),
      municipio: cidadeUf.split("/")[0]?.trim() || "",
      uf: cidadeUf.split("/")[1]?.trim() || "",
      whatsapp: whatsapp.trim(),
      telefone: telefone.trim(),
      email: email.trim(),
      responsavelNome: responsavelNome.trim(),
      contadorNome: contadorNome.trim(),
      contadorCrc: contadorCrc.trim(),
      ibsAliquota: Number(ibsAliquota),
      cbsAliquota: Number(cbsAliquota),
      situacaoCadastral: situacaoCadastral || "ATIVA",
      dataSituacao: dataSituacao.trim(),
      dataAbertura: dataAbertura.trim(),
      qsa: qsaList,
      certificadoAtivo: false,
      certificadoNomeArquivo: formCertNome || undefined,
      certificadoTamanho: formCertTamanho || undefined,
      certificadoValidade: undefined,
      certificadoTipo: "Não validado",
      certificadoEmissor: undefined,
      certificadoDataUpload: undefined,
      fonteDados: fonteDados || "Cadastrado pelo Usuário",
      competencia: competenciaAtualISO(),
    };

    // Atualizar lista: se já existe pelo id ou pelo mesmo CNPJ, ATUALIZA NO MESMO LUGAR (NUNCA DUPLICA!)
    let listaAtualizada: EmpresaDados[];
    const indexExistente = empresasCadastradas.findIndex(
      (e) =>
        (modoEdicaoId && (e.id === modoEdicaoId || e.cnpj === modoEdicaoId)) ||
        (cnpjLimpo && e.cnpj && e.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "") === cnpjLimpo.toUpperCase().replace(/[^0-9A-Z]/g, ""))
    );

    if (indexExistente >= 0) {
      // Atualiza existente sem criar duplicata
      listaAtualizada = [...empresasCadastradas];
      listaAtualizada[indexExistente] = { ...listaAtualizada[indexExistente], ...dadosParaSalvar };
    } else {
      // Adiciona como nova
      listaAtualizada = [dadosParaSalvar, ...empresasCadastradas];
    }

    setEmpresasCadastradas(listaAtualizada);
    persistirEmpresas(listaAtualizada);

    // Define como empresa ativa do sistema e propaga para todos os módulos (Murad DP, Fiscal, Fisco IA)
    onUpdateEmpresa(dadosParaSalvar);
    try {
      localStorage.setItem("murad_empresa_salva", JSON.stringify(dadosParaSalvar));
    } catch (e) {
      console.warn("Erro ao salvar empresa ativa:", e);
    }

    // REGRA DE OURO: LIMPAR AUTOMATICAMENTE TODOS OS CAMPOS DO FORMULÁRIO APÓS SALVAR
    limparFormulario();

    showToast(
      `✅ EMPRESA "${dadosParaSalvar.razaoSocial}" SALVA COM SUCESSO!\n\n✨ Os campos foram limpos automaticamente para evitar cadastros duplicados. Você pode editá-la quando quiser pelo botão "✏️ Editar Empresa".`
    );
    setFormularioAberto(false);
  };

  // Empresa ativa atual (prioridade para prop ou primeira da lista)
  const empresaAtivaExibicao: EmpresaDados | null =
    (empresa && (empresa.cnpj || empresa.razaoSocial))
      ? empresa
      : (empresasCadastradas.length > 0 ? empresasCadastradas[0] : null);

  return (
    <div className="space-y-5">
      {/* 🔙 CABEÇALHO DO MÓDULO */}
      <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              onClick={onVoltar}
              className="w-9 h-9 rounded-full bg-blue-100 hover:bg-blue-600 text-blue-800 hover:text-white flex items-center justify-center transition cursor-pointer font-bold shadow-2xs"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-700" />
                <span>Cadastro e Gestão de Empresas</span>
              </h1>
              <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                Módulo Central
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Cadastre suas empresas reais, vincule o certificado digital e sincronize com DP, Fiscal e Fisco IA.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input ref={migrationInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void handleImportarPacoteMurade(event.target.files?.[0])} />
          <button type="button" onClick={() => migrationInputRef.current?.click()} className="px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 text-blue-800 text-xs font-semibold">Importar pacote Murade</button>
          {empresasCadastradas.length > 0 && <button type="button" onClick={() => baixarPacoteEmpresasMurade(empresasCadastradas.map((item) => ({
            id: item.id, cnpj: item.cnpj, razaoSocial: item.razaoSocial, nomeFantasia: item.nomeFantasia,
            uf: item.uf, municipio: item.municipio, cidade: item.municipio, regime: item.regime,
            inscricaoEstadual: item.inscricaoEstadual, inscricaoMunicipal: item.inscricaoMunicipal,
            endereco: item.endereco, cep: item.cep, configuracaoFiscal: item.configuracaoFiscal,
            certificado: { nomeArquivo: item.certificadoNomeArquivo, validade: item.certificadoValidade, tipo: item.certificadoTipo },
          })))} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold">Exportar pacote</button>}
          {onIrParaAgenda && (
            <button
              onClick={onIrParaAgenda}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-blue-700" />
              <span>Ver Agenda</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Integrado a DP • Fiscal • FISCO IA</span>
          </div>
        </div>
      </div>

      {/* NOTIFICAÇÃO TOAST */}
      {toastMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2.5 shadow-md animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="whitespace-pre-line leading-relaxed">{toastMsg}</span>
        </div>
      )}

      {/* ⚡ BARRAMENTO DE INTEGRAÇÃO MURAD: FISCAL • DP • RECEITA / SEFAZ / SERPRO */}
      <div className="bg-[#082B66] text-white rounded-xl p-4 sm:p-5 shadow-sm border border-[#0A357D]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0 border border-white/20 shadow-xs">
              <Zap className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>Conexão Murad: Puxar Empresas do Mural Fiscal & DP</span>
                </h3>
                <span className="text-[10px] bg-amber-300 text-amber-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Não configurada
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Cadastro local e integração ainda não conectada. As rotas atuais de Fiscal e DP não fornecem uma leitura autenticada compartilhada.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            <button
              id="btn-puxar-empresa-fiscal"
              type="button"
              disabled={loadingCnpj}
              onClick={handlePuxarEmpresaDoMuradFiscal}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-2.5 rounded-lg transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-slate-950" />
              <span>{loadingCnpj ? "Consultando integração..." : "Verificar integração Fiscal"}</span>
            </button>

            {onConectarDP && (
              <button
                type="button"
                onClick={onConectarDP}
                className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3 py-2.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-white/20"
              >
                <Users className="w-3.5 h-3.5 text-blue-200" />
                <span>Consultar resumos do DP</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 text-xs">
          <div className="bg-black/20 rounded-lg p-2 border border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-blue-100">Murade Fiscal:</span>
            <span className="font-bold text-amber-200">Não conectado</span>
          </div>
          <div className="bg-black/20 rounded-lg p-2 border border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-blue-100">Mural DP:</span>
            <span className="font-bold text-amber-200">Não conectado</span>
          </div>
          <div className="bg-black/20 rounded-lg p-2 border border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-blue-100">Receita Federal:</span>
            <span className="font-bold text-amber-200">Não verificado</span>
          </div>
          <div className="bg-black/20 rounded-lg p-2 border border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-blue-100">SEFAZ Estadual:</span>
            <span className="font-bold text-amber-200">Não verificado</span>
          </div>
        </div>
      </div>

      {/* 🏢 SEÇÃO 1: EMPRESA(S) CADASTRADA(S) NO SISTEMA */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Empresas Cadastradas
              </h2>
              <p className="text-[11px] text-slate-500">
                {empresasCadastradas.length === 0
                  ? "Nenhuma empresa cadastrada no momento."
                  : `${empresasCadastradas.length} ${empresasCadastradas.length === 1 ? "empresa cadastrada" : "empresas cadastradas"}. Todas editáveis.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              limparFormulario();
              setFormularioAberto(true);
              setTimeout(() => {
                formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            }}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Cadastrar Nova Empresa</span>
          </button>
        </div>

        {/* SE NÃO HOUVER EMPRESA CADASTRADA */}
        {empresasCadastradas.length === 0 && (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 mx-auto flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                Tudo limpo! Nenhuma empresa cadastrada ainda.
              </h3>
              <p className="text-xs text-slate-500">
                Preencha o formulário abaixo com os dados da sua empresa ou consulte o CNPJ na Receita Federal. Ao salvar, a empresa ficará registrada aqui e todos os campos serão limpos automaticamente.
              </p>
            </div>
          </div>
        )}

        {/* SE HOUVER EMPRESAS CADASTRADAS: EXIBIR CARDS */}
        {empresasCadastradas.length > 0 && (
          <div className="space-y-3.5">
            {empresasCadastradas.map((emp, idx) => {
              const isAtiva =
                (empresa.cnpj && emp.cnpj && empresa.cnpj === emp.cnpj) ||
                (empresa.id && emp.id && empresa.id === emp.id) ||
                idx === 0;

              return (
                <div
                  key={emp.id || emp.cnpj || idx}
                  className={`p-4 sm:p-5 rounded-xl border transition-all ${
                    isAtiva
                      ? "bg-blue-50/40 border-blue-300 shadow-xs ring-1 ring-blue-200"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100 px-2.5 py-0.5 rounded border border-blue-200">
                          CNPJ: {emp.cnpj || "Sem CNPJ"}
                        </span>
                        {isAtiva ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>EMPRESA ATIVA</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDefinirAtiva(emp)}
                            className="text-[10px] font-bold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-2 py-0.5 rounded-full transition cursor-pointer border border-slate-200"
                          >
                            Tornar Ativa
                          </button>
                        )}
                        <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                          {emp.regime || "Não informado"}
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {emp.situacaoCadastral || "ATIVA"}
                        </span>
                      </div>

                      <h3 className="text-base font-black text-slate-900 tracking-tight">
                        {emp.razaoSocial || "Empresa sem Razão Social"}
                      </h3>

                      {emp.nomeFantasia && emp.nomeFantasia !== emp.razaoSocial && (
                        <p className="text-xs text-slate-600 font-medium">
                          Nome Fantasia: <strong className="text-slate-800">{emp.nomeFantasia}</strong>
                        </p>
                      )}
                    </div>

                    {/* BOTÕES DE AÇÃO: EDITAR E EXCLUIR */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditarEmpresa(emp)}
                        className="px-3.5 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        title="Carregar dados nos campos abaixo para editar"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Editar Empresa</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExcluirEmpresa(emp.id || emp.cnpj, emp.razaoSocial || emp.cnpj)}
                        className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Excluir esta empresa do sistema"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                    </div>
                  </div>

                  {/* GRID DE DETALHES DA EMPRESA CADASTRADA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 text-xs">
                    {/* Endereço */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        Endereço & Localização
                      </span>
                      <p className="font-semibold text-slate-800 truncate" title={emp.endereco || emp.cidadeUf}>
                        {emp.endereco || emp.cidadeUf || "Não informado"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {emp.cep ? `CEP: ${emp.cep} • ` : ""}{emp.cidadeUf || ""}
                      </p>
                    </div>

                    {/* Contatos & Responsável */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-slate-400" />
                        Responsável & Contato
                      </span>
                      <p className="font-semibold text-slate-800 truncate">
                        {emp.responsavelNome || "Não informado"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {emp.telefone || emp.whatsapp || emp.email || "Sem contato"}
                      </p>
                    </div>

                    {/* Contador & CRC */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-slate-400" />
                        Contabilidade Responsável
                      </span>
                      <p className="font-semibold text-slate-800 truncate">
                        {emp.contadorNome || "Murade Contábil"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        CRC: {emp.contadorCrc || "GO-024589/O-1"}
                      </p>
                    </div>

                    {/* Certificado Digital e Reforma */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Key className="w-3 h-3 text-slate-400" />
                        Certificado & Reforma 2026
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {emp.certificadoNomeArquivo ? (
                          <span className="font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px] flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>{emp.certificadoNomeArquivo} · não validado</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            Sem certificado
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                          IBS: {emp.ibsAliquota ?? 0}% | CBS: {emp.cbsAliquota ?? 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SÓCIOS / QSA SE HOUVER */}
                  {emp.qsa && emp.qsa.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="font-bold text-slate-600 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-purple-700" />
                        Sócios (QSA):
                      </span>
                      {emp.qsa.map((s, sIdx) => (
                        <span
                          key={sIdx}
                          className="bg-purple-50 text-purple-900 border border-purple-200 font-medium px-2 py-0.5 rounded-full"
                        >
                          {s.nome} ({s.qualificacao})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ✍️ SEÇÃO 2: FORMULÁRIO DE CADASTRO / EDIÇÃO */}
      <div
        ref={formSectionRef}
        className="bg-white rounded-xl p-5 sm:p-7 shadow-xs border border-slate-200 space-y-5"
      >
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
              modoEdicaoId ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"
            }`}>
              {modoEdicaoId ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                {modoEdicaoId ? "Editando Cadastro da Empresa" : "Cadastrar Nova Empresa"}
              </h2>
              <p className="text-[11px] text-slate-500">
                {modoEdicaoId
                  ? "Modifique qualquer campo abaixo. Ao salvar, os dados serão atualizados no mesmo cadastro sem duplicar."
                  : "Preencha os campos abaixo. Ao salvar, a empresa é gravada e todos os campos limpam automaticamente."}
              </p>
            </div>
          </div>

          {modoEdicaoId ? (
            <button
              type="button"
              onClick={handleCancelarEdicao}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar Edição</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={limparFormulario}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
              title="Limpar todos os campos"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpar Campos</span>
            </button>
          )}
        </div>

        {/* BANNER INFORMATIVO SE ESTIVER EM MODO DE EDIÇÃO */}
        {modoEdicaoId && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Modo de Edição Ativo:</strong> Você está editando os dados cadastrais. Clique em <strong>"Salvar Alterações"</strong> para atualizar o registro existente.
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancelarEdicao}
              className="text-xs font-bold text-amber-900 underline hover:text-amber-950 shrink-0 cursor-pointer"
            >
              Sair da Edição
            </button>
          </div>
        )}

        {/* GRID DE CAMPOS EDITÁVEIS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
          {/* CNPJ COM BOTÃO DE BUSCA NA RECEITA FEDERAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              CNPJ *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="flex-1 px-3.5 py-2.5 border-2 border-slate-200 bg-slate-50/50 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 font-mono font-medium transition"
              />
              <button
                type="button"
                onClick={buscarDadosReceita}
                disabled={loadingCnpj}
                className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Buscar dados oficiais na Receita Federal do Brasil"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{loadingCnpj ? "Buscando..." : "Buscar na Receita"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digite o CNPJ e clique em Buscar para preencher automaticamente via Receita Federal.
            </p>
          </div>

          {/* RAZÃO SOCIAL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-semibold text-slate-800">Razão Social *</label>
              {fonteDados && (
                <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-mono font-bold">
                  Fonte: {fonteDados}
                </span>
              )}
            </div>
            <input
              type="text"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Razão Social completa da empresa"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 font-bold transition"
            />
          </div>

          {/* NOME FANTASIA */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Nome Fantasia</label>
            <input
              type="text"
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              placeholder="Nome Fantasia comercial"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* REGIME TRIBUTÁRIO */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Regime Tributário</label>
            <select
              value={regimeTributario}
              onChange={(e) => setRegimeTributario(e.target.value)}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-blue-600 transition font-medium"
            >
              <option value="Simples Nacional">Simples Nacional (ME / EPP)</option>
              <option value="Lucro Presumido">Lucro Presumido</option>
              <option value="Lucro Real">Lucro Real</option>
              <option value="MEI">Microempreendedor Individual (MEI)</option>
            </select>
          </div>

          {/* INSCRIÇÃO ESTADUAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Inscrição Estadual (SEFAZ)</label>
            <input
              type="text"
              value={ie}
              onChange={(e) => setIe(e.target.value)}
              placeholder="Ex: 10.345.678-9 ou ISENTO"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* INSCRIÇÃO MUNICIPAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Inscrição Municipal (Prefeitura)</label>
            <input
              type="text"
              value={im}
              onChange={(e) => setIm(e.target.value)}
              placeholder="Ex: 245.890-1"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* NATUREZA JURÍDICA */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Natureza Jurídica</label>
            <input
              type="text"
              value={naturezaJuridica}
              onChange={(e) => setNaturezaJuridica(e.target.value)}
              placeholder="Ex: 206-2 - Sociedade Empresária Limitada"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* CNAE PRINCIPAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">CNAE Principal</label>
            <input
              type="text"
              value={cnaePrincipal}
              onChange={(e) => setCnaePrincipal(e.target.value)}
              placeholder="Ex: 4711-3/02 - Comércio varejista..."
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* CAPITAL SOCIAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Capital Social</label>
            <input
              type="text"
              value={capitalSocial}
              onChange={(e) => setCapitalSocial(e.target.value)}
              placeholder="Ex: R$ 50.000,00"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition font-mono"
            />
          </div>

          {/* SITUAÇÃO CADASTRAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Situação Cadastral</label>
            <select
              value={situacaoCadastral}
              onChange={(e) => setSituacaoCadastral(e.target.value)}
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-blue-600 transition font-medium"
            >
              <option value="ATIVA">ATIVA</option>
              <option value="SUSPENSA">SUSPENSA</option>
              <option value="INAPTA">INAPTA</option>
              <option value="BAIXADA">BAIXADA</option>
            </select>
          </div>

          {/* CEP COM BUSCA AUTOMÁTICA */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">CEP</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                placeholder="00000-000"
                className="flex-1 px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 font-mono transition"
              />
              <button
                type="button"
                onClick={buscarCepReal}
                disabled={loadingCep}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="Consultar endereço pelo CEP"
              >
                {loadingCep ? "..." : "Buscar CEP"}
              </button>
            </div>
          </div>

          {/* CIDADE / UF */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Cidade / UF</label>
            <input
              type="text"
              value={cidadeUf}
              onChange={(e) => setCidadeUf(e.target.value)}
              placeholder="Informe a cidade e a UF da empresa"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* ENDEREÇO COMPLETO */}
          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-800 mb-1">Endereço Completo (Logradouro, Número, Bairro)</label>
            <input
              type="text"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Logradouro, número, bairro e complemento"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* TELEFONE / WHATSAPP */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Telefone / WhatsApp</label>
            <input
              type="text"
              value={telefone}
              onChange={(e) => {
                setTelefone(e.target.value);
                setWhatsapp(e.target.value);
              }}
              placeholder="(00) 00000-0000"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition font-mono"
            />
          </div>

          {/* E-MAIL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">E-mail de Contato / Fiscal</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="fiscal@empresa.com.br"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* RESPONSÁVEL LEGAL */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Responsável Legal / Administrador</label>
            <input
              type="text"
              value={responsavelNome}
              onChange={(e) => setResponsavelNome(e.target.value)}
              placeholder="Nome do sócio-administrador"
              className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* CONTADOR E CRC */}
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Contador Responsável / CRC</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={contadorNome}
                onChange={(e) => setContadorNome(e.target.value)}
                placeholder="Nome do Contador"
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition"
              />
              <input
                type="text"
                value={contadorCrc}
                onChange={(e) => setContadorCrc(e.target.value)}
                placeholder="CRC (Ex: GO-024589)"
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 transition font-mono"
              />
            </div>
          </div>
        </div>

        {/* 🔐 CERTIFICADO DIGITAL ICP-BRASIL */}
        <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-700" />
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                Certificado Digital ICP-Brasil (e-CNPJ A1 / A3)
              </h4>
            </div>

            {formCertNome ? (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Selecionado; não enviado: {formCertNome}</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                Certificado ainda não conectado neste módulo
              </span>
            )}
          </div>

          {/* ÁREA DE SELEÇÃO / DRAG & DROP DO COMPUTADOR */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDirectFileInput}
            accept=".pfx,.p12,.cer,.pem"
            className="hidden"
          />

          <div
            onDragOver={handleDragOverCert}
            onDragLeave={handleDragLeaveCert}
            onDrop={handleDropCert}
            className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center transition ${
              isDraggingCert
                ? "border-blue-500 bg-blue-50"
                : "border-slate-300 hover:border-blue-400 bg-white"
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>

              {formCertNome ? (
                <div className="space-y-1">
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>{formCertNome}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({formCertTamanho || "arquivo"})</span>
                  </div>
                  <p className="text-[11px] text-amber-700 font-semibold">
                    Seleção local apenas. O certificado não foi enviado, validado nem armazenado pelo sistema.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={abrirSeletorArquivos}
                      className="text-xs text-blue-700 hover:underline font-semibold cursor-pointer"
                    >
                      Trocar Arquivo
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormCertAtivo(false);
                        setFormCertNome("");
                        setFormCertTamanho("");
                        showToast("Seleção local do arquivo removida.");
                      }}
                      className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold text-slate-800">
                    Arraste o arquivo do Certificado Digital (.pfx / .p12) aqui
                  </p>
                  <p className="text-[11px] text-slate-500">
                    A seleção não envia o certificado. Para usar A1, faça o vínculo no Murade Fiscal.
                  </p>
                  <button
                    type="button"
                    onClick={abrirSeletorArquivos}
                    className="mt-1 px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>📂 Buscar Arquivo no Meu Computador</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ⚖️ REFORMA TRIBUTÁRIA 2026 — IBS/CBS EDITÁVEIS */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 p-4 sm:p-5 rounded-xl border border-blue-200">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-blue-700" />
            <h4 className="text-xs sm:text-sm font-bold text-blue-950">
              ⚖️ Parâmetros Reforma Tributária 2026 (IBS / CBS Editáveis)
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-lg border border-blue-200">
              <label className="font-bold text-slate-800 block mb-1">
                IBS (Imposto sobre Bens e Serviços):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={ibsAliquota}
                  onChange={(e) => setIbsAliquota(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2.5 py-1.5 border-2 border-blue-200 rounded text-blue-900 font-bold focus:outline-none focus:border-blue-600"
                />
                <span className="font-bold text-blue-900">%</span>
              </div>
              <p className="text-slate-500 text-[11px] mt-1.5">Crédito financeiro no destino gerado no razonete contábil.</p>
            </div>
            <div className="bg-white p-3.5 rounded-lg border border-blue-200">
              <label className="font-bold text-slate-800 block mb-1">
                CBS (Contribuição sobre Bens e Serviços):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={cbsAliquota}
                  onChange={(e) => setCbsAliquota(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2.5 py-1.5 border-2 border-indigo-200 rounded text-indigo-900 font-bold focus:outline-none focus:border-indigo-600"
                />
                <span className="font-bold text-indigo-900">%</span>
              </div>
              <p className="text-slate-500 text-[11px] mt-1.5">Substituição não-cumulativa de PIS/COFINS pelo Robô Murad.</p>
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-slate-100">
          <div className="text-[11px] text-slate-500">
            ℹ️ Ao salvar, a empresa é gravada e o formulário limpa automaticamente.
          </div>

          <div className="flex items-center gap-2">
            {modoEdicaoId ? (
              <button
                type="button"
                onClick={handleCancelarEdicao}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                Cancelar Edição
              </button>
            ) : (
              <button
                type="button"
                onClick={limparFormulario}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                <span>Limpar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSalvarEmpresa}
              className="px-6 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold transition cursor-pointer shadow-sm flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{modoEdicaoId ? "💾 Salvar Alterações" : "💾 Salvar Empresa"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Exibição dos Dados Conectados do Murad Fiscal */}
      <ModalConexaoMuradFiscal
        aberto={modalFiscalAberto}
        onFechar={() => setModalFiscalAberto(false)}
        empresa={empresaDetectadaModal}
        onConfirmarAtivar={(emp) => {
          onUpdateEmpresa(emp);
          setModalFiscalAberto(false);
          showToast(`✅ Empresa '${emp.razaoSocial}' ativada no Contábil com sucesso!`);
        }}
      />

      {/* Modal In-App de Confirmação para Excluir Empresa */}
      {empresaParaExcluir && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Excluir Cadastro da Empresa?
                </h4>
                <p className="text-xs text-slate-500">Esta ação removerá a empresa do sistema.</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
              <strong>Empresa:</strong> {empresaParaExcluir.nome}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEmpresaParaExcluir(null)}
                className="py-2 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusaoEmpresa}
                className="py-2 px-4 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
              >
                Sim, Excluir Empresa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
