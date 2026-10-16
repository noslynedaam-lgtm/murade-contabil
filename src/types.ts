export type TabId =
  | "inicio"
  | "conexoes"
  | "empresa"
  | "migracao"
  | "agenda"
  | "lancamentos"
  | "balancete"
  | "livros"
  | "plano-contas"
  | "calculadora"
  | "fluxo-previtico"
  | "modulos-finais"
  | "integracao"
  | "revisao-origens"
  | "agente"
  | "ia-premium";

export interface OrgaoConectado {
  id: string;
  nome: string;
  sigla: string;
  descricao: string;
  status: "conectado" | "sincronizando" | "alerta" | "offline";
  autenticacao: string;
  detalhes: string;
  ultimaVerificacao: string;
  pingMs: number;
  esfera?: "Federal" | "Estadual" | "Municipal" | "Fisco e DP" | "Murade Fiscal" | "Murade DP" | "Murade Fisco IA";
  url?: string;
  statusCode?: number;
  statusTexto?: string;
  tls?: string;
  credencialTipo?: string;
  credencialStatus?: string;
  ambiente?: "Produção" | "Homologação";
}

export interface EmpresaDados {
  id?: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  regime: "Lucro Presumido" | "Lucro Real" | "Simples Nacional" | "MEI" | string;
  municipio: string;
  uf: string;
  competencia: string;
  ibsAliquota: number;
  cbsAliquota: number;
  cnae: string;
  situacaoCadastral: string;
  dataSituacao?: string;
  dataAbertura?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  naturezaJuridica?: string;
  endereco?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidadeUf?: string;
  whatsapp?: string;
  telefone?: string;
  email?: string;
  capitalSocial?: number;
  capitalSocialFormatado?: string;
  cnaesSecundarios?: string[];
  qsa?: Array<{ nome: string; qualificacao: string; faixaEtaria?: string }>;
  responsavelNome?: string;
  responsavelCpf?: string;
  contadorNome?: string;
  contadorCrc?: string;
  fonteDados?: string;
  ultimaConsultaReceita?: string;
  certificadoAtivo?: boolean;
  certificadoNomeArquivo?: string;
  certificadoValidade?: string;
  certificadoTipo?: string;
  certificadoEmissor?: string;
  certificadoTamanho?: string;
  certificadoDataUpload?: string;
  configuracaoFiscal?: {
    seriesEmissao: Array<{ serie: string; ultimoNumeroEmitido: string }>;
    modelosDocumento: string[];
    fontesEntrada: string[];
    fontesSaida: string[];
    identificadorEmissor?: string;
  };
  dadosFiscais?: {
    documentosCapturados?: number;
    nfeEmitidas?: number;
    nfeRecebidas?: number;
    faturamentoBruto?: number;
    icmsApurado?: number;
    ibsTeste?: number;
    cbsTeste?: number;
    statusSefaz?: string;
    ultimaVarredura?: string;
  };
  dadosDP?: {
    funcionariosAtivos?: number;
    folhaBruta?: number;
    inssPatronalRetido?: number;
    fgtsDigital?: number;
    eventosEsocial?: string;
    statusEsocial?: string;
  };
}

export interface LancamentoContabil {
  id: string;
  data: string;
  contaDebitoCodigo: string;
  contaDebitoNome: string;
  contaCreditoCodigo: string;
  contaCreditoNome: string;
  valor: number;
  historico: string;
  origem: "Cadastro" | "Fiscal — NFe Entrada" | "Fiscal — NFe Saída" | "Fiscal — Apuração ICMS" | "DP — Folha" | "DP — INSS" | "DP — IRRF" | "DP — FGTS" | "Financeiro / Bancos" | "Manual";
  documentoRef?: string;
  competencia?: string;
  centroCustoCodigo?: string;
  centroCustoNome?: string;
  centroCustoDebitoCodigo?: string;
  centroCustoCreditoCodigo?: string;
}

export interface CentroCustoContabil {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  centroPaiCodigo?: string;
}

export interface ContaPlano {
  codigo: string;
  descricao: string;
  nivel: 1 | 2 | 3 | 4 | 5;
  tipo: "sintetica" | "analitica";
  natureza: "D" | "C";
  saldoInicial?: number;
}

export type OrigemMapeadaContabil =
  | "fiscal_entrada"
  | "fiscal_saida"
  | "dp_folha_bruta"
  | "dp_descontos_inss"
  | "dp_descontos_irrf"
  | "dp_fgts";

export interface MapeamentoOrigemContabil {
  origem: OrigemMapeadaContabil;
  contaDebitoCodigo: string;
  contaCreditoCodigo: string;
  revisadoEm: string;
}

export interface PreLancamentoContabil {
  id: string;
  referenciaOrigem: string;
  competencia: string;
  data: string;
  origem: "DP — Folha" | "DP — INSS" | "DP — IRRF" | "DP — FGTS" | "Fiscal — Entrada" | "Fiscal — Saída";
  contaDebitoCodigo: string;
  contaCreditoCodigo: string;
  valor: number;
  historico: string;
  status: "pendente_conferencia" | "contabilizado";
  criadoEm: string;
  contabilizadoEm?: string;
}

export interface BalanceteItem {
  codigo: string;
  descricao: string;
  nivel: number;
  tipo: "sintetica" | "analitica";
  debito: number;
  credito: number;
  saldoAtual: number;
  natureza: "D" | "C";
}

export interface LivroContabil {
  id: string;
  titulo: string;
  descricao: string;
  status: "pronto" | "pendente" | "transmitido";
  tipo: "contabil" | "fiscal" | "obrigacao";
  orgaoDestino: string;
  competencia: string;
  hashTransmissao?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ia";
  text: string;
  timestamp: string;
  sources?: { title: string; url: string }[];
}

export interface SistemaConectavel {
  id: string;
  numero: number;
  nome: string;
  tipo: string;
  status: "conectado" | "pendente" | "desconectado" | "local";
  statusTexto: string;
  isPrincipal?: boolean;
  isReservado?: boolean;
  placeholder?: string;
}

export interface LembreteItem {
  id: string;
  nome: string;
  data: string;
  dataVencimento: string; // Ex: "20/08/2026", "19/09/2026", "15/09/2026"
  diaDoMes: number; // 15, 18, 19, 20, 25, 30, etc.
  tipo: "vencido" | "hoje" | "proximo" | "futuro";
  statusTexto: string;
  origem: string;
  corTag: string;
  acaoTexto1: string; // "Ver" | "Apurar" | "Preparar"
  acaoTexto2: string; // "Pagar" | "Gerar Guia" | "Gerar DARF" | "Transmitir" | "Enviar"
  valor?: number;
  codigoReceita?: string;
  competencia?: string;
  linhaDigitavel?: string;
  detalhes?: string;
  chaveAcesso?: string;
  statusExecucao?: "pendente" | "apurado" | "gerado" | "transmitido" | "pago";
  protocolo?: string;
  observacoes?: string;
}
