import { EmpresaDados, LancamentoContabil } from "../types";

export interface RespostaConexaoFiscal {
  sucesso: boolean;
  empresa: EmpresaDados;
  mensagem: string;
  origem: string;
  lancamentosFiscais?: LancamentoContabil[];
}

export interface RespostaConexaoDP {
  sucesso: true;
  cnpj: string;
  folhasRecebidas: number;
  ultimoRecebimento: string | null;
  mensagem: string;
}

function normalizarEmpresa(raw: Partial<EmpresaDados>): EmpresaDados {
  return {
    id: raw.id,
    cnpj: raw.cnpj || "",
    razaoSocial: raw.razaoSocial || "",
    nomeFantasia: raw.nomeFantasia || raw.razaoSocial || "",
    regime: raw.regime || "",
    inscricaoEstadual: raw.inscricaoEstadual,
    inscricaoMunicipal: raw.inscricaoMunicipal,
    naturezaJuridica: raw.naturezaJuridica,
    cnae: raw.cnae || "",
    endereco: raw.endereco,
    logradouro: raw.logradouro,
    numero: raw.numero,
    complemento: raw.complemento,
    bairro: raw.bairro,
    municipio: raw.municipio || "",
    uf: raw.uf || "",
    cep: raw.cep,
    cidadeUf: raw.cidadeUf,
    telefone: raw.telefone,
    whatsapp: raw.whatsapp,
    email: raw.email,
    capitalSocial: raw.capitalSocial,
    capitalSocialFormatado: raw.capitalSocialFormatado,
    responsavelNome: raw.responsavelNome,
    contadorNome: raw.contadorNome,
    contadorCrc: raw.contadorCrc,
    situacaoCadastral: raw.situacaoCadastral || "",
    competencia: raw.competencia || "",
    ibsAliquota: raw.ibsAliquota ?? 0,
    cbsAliquota: raw.cbsAliquota ?? 0,
    certificadoAtivo: raw.certificadoAtivo ?? false,
    certificadoNomeArquivo: raw.certificadoNomeArquivo,
    certificadoValidade: raw.certificadoValidade,
    certificadoTipo: raw.certificadoTipo,
    certificadoEmissor: raw.certificadoEmissor,
    certificadoTamanho: raw.certificadoTamanho,
    configuracaoFiscal: raw.configuracaoFiscal,
    fonteDados: raw.fonteDados || "Cadastro local; não consultado em fonte externa",
    dadosFiscais: raw.dadosFiscais,
    dadosDP: raw.dadosDP,
  };
}

export async function conectarEPuxarEmpresaMuradFiscal(): Promise<RespostaConexaoFiscal> {
  const response = await fetch("/api/integracao/fiscal/empresa-ativa");
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || "Integração com Murad Fiscal indisponível.");
  }
  const data = await response.json();
  if (!data.empresa) throw new Error("Nenhuma empresa foi retornada pelo Murad Fiscal.");
  return {
    sucesso: true,
    empresa: normalizarEmpresa(data.empresa),
    mensagem: data.mensagem || "Empresa carregada do módulo Fiscal.",
    origem: data.origem || "Murad Fiscal",
    lancamentosFiscais: data.lancamentosFiscais,
  };
}

/** Reads only company-scoped aggregates already persisted by the authenticated DP→Contábil flow. */
export async function conectarMuradDP(cnpj: string): Promise<RespostaConexaoDP> {
  const normalizado = String(cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(normalizado)) throw new Error("Selecione uma empresa com CNPJ válido antes de consultar os dados do DP.");

  const query = new URLSearchParams({ cnpj: normalizado });
  const response = await fetch(`/api/integracao/status?${query.toString()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.sucesso !== true) throw new Error(data.motivo || "Não foi possível consultar o estado do DP para esta empresa.");
  if (String(data.cnpjEmpresa || "").replace(/[^0-9a-z]/gi, "").toUpperCase() !== normalizado) {
    throw new Error("O servidor não confirmou o CNPJ solicitado; nenhum dado foi exibido.");
  }

  const estadoDP = data.departamentoPessoal && typeof data.departamentoPessoal === "object" ? data.departamentoPessoal : {};
  if (estadoDP.disponivel !== true) throw new Error("O servidor não confirmou o armazenamento persistente dos resumos do DP para esta consulta.");
  const folhasRecebidas = Number.isSafeInteger(estadoDP.folhasRecebidas) && estadoDP.folhasRecebidas >= 0 ? estadoDP.folhasRecebidas : 0;
  const ultimoRecebimento = typeof estadoDP.ultimoRecebimento === "string" ? estadoDP.ultimoRecebimento : null;
  return {
    sucesso: true,
    cnpj: normalizado,
    folhasRecebidas,
    ultimoRecebimento,
    mensagem: folhasRecebidas
      ? `${folhasRecebidas} resumo(s) agregado(s) do DP estão persistidos para esta empresa${ultimoRecebimento ? `; último recebimento em ${new Date(ultimoRecebimento).toLocaleString("pt-BR")}` : ""}. Nenhum lançamento definitivo foi criado.`
      : "Consulta concluída para esta empresa; ainda não há resumo agregado do DP persistido no Contábil.",
  };
}

/** Salva somente no navegador atual; não representa sincronização com outros módulos. */
export async function sincronizarEmpresaComModulos(empresa: EmpresaDados): Promise<void> {
  localStorage.setItem("murad_empresa_salva", JSON.stringify(empresa));
}
