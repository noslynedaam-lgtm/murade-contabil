import { EmpresaDados, LancamentoContabil } from "../types";

export interface RespostaConexaoFiscal {
  sucesso: boolean;
  empresa: EmpresaDados;
  mensagem: string;
  origem: string;
  lancamentosFiscais?: LancamentoContabil[];
}

const CHAVES_EMPRESA = [
  "murad_fiscal_empresa",
  "murade_fiscal_empresa",
  "murad_fiscal_empresas",
  "murade_fiscal_empresas",
  "fiscal_empresa",
  "fiscal_empresas",
  "empresa_fiscal",
  "empresas_fiscal",
  "murad_empresa_ativa",
  "murad_empresa_salva",
  "murad_empresas_lista",
];

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
    fonteDados: raw.fonteDados || "Cadastro local; não consultado em fonte externa",
    dadosFiscais: raw.dadosFiscais,
    dadosDP: raw.dadosDP,
  };
}

/** Busca uma empresa já salva no navegador, sem preencher dados ausentes com exemplos. */
export function buscarEmpresasLocalStorageMurad(): EmpresaDados | null {
  if (typeof window === "undefined") return null;

  for (const chave of CHAVES_EMPRESA) {
    try {
      const value = localStorage.getItem(chave);
      if (!value) continue;
      const parsed: unknown = JSON.parse(value);
      const candidatos = Array.isArray(parsed) ? parsed : [parsed];
      const empresa = candidatos.find(
        (item): item is Partial<EmpresaDados> =>
          !!item && typeof item === "object" &&
          (typeof (item as Partial<EmpresaDados>).razaoSocial === "string" ||
            typeof (item as Partial<EmpresaDados>).cnpj === "string")
      );
      if (empresa) return normalizarEmpresa(empresa);
    } catch {
      // Uma chave local malformada não impede consultar as demais.
    }
  }
  return null;
}

export async function conectarEPuxarEmpresaMuradFiscal(): Promise<RespostaConexaoFiscal> {
  const empresa = buscarEmpresasLocalStorageMurad();
  if (empresa) {
    return {
      sucesso: true,
      empresa,
      mensagem: "Empresa carregada do armazenamento deste navegador. A conexão com o Murad Fiscal não foi verificada.",
      origem: "Armazenamento local do navegador",
    };
  }

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

export async function conectarMuradDP(): Promise<any> {
  const response = await fetch("/api/integracao/dp/dados");
  const details = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(details.error || "Integração com Murad DP indisponível.");
  throw new Error("O formato da integração Murad DP ainda não foi implementado.");
}

/** Salva somente no navegador atual; não representa sincronização com outros módulos. */
export async function sincronizarEmpresaComModulos(empresa: EmpresaDados): Promise<void> {
  localStorage.setItem("murad_empresa_salva", JSON.stringify(empresa));
}
