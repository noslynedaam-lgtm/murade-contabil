export type TabId =
  | "inicio"
  | "conexoes"
  | "empresa"
  | "migracao"
  | "agenda"
  | "lancamentos"
  | "aprovacoes"
  | "balancete"
  | "livros"
  | "demonstracoes"
  | "plano-contas"
  | "calculadora"
  | "fluxo-previtico"
  | "modulos-finais"
  | "gestao-contabil"
  | "integracao"
  | "revisao-origens"
  | "vigencia-obrigacoes"
  | "agente"
  | "ia-premium"
  | "backups"
  | "tarefas-equipe"
  | "meu-jeito"
  | "revisor"
  | "escola";

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
  esfera?: "Federal" | "Estadual" | "Municipal" | "Fisco e DP" | "Murad Fiscal" | "Murad DP" | "Murad Fisco IA";
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
  /** Entidade imune/isenta: certificação de entidade beneficente (LC 187/2021) e validade (AAAA-MM-DD). */
  entidadeCertificada?: boolean;
  entidadeCertificacaoValidade?: string;
  /** Última marca gravada pelo Robô de Sincronia de Entidades (para saber o que foi marcado à mão aqui). */
  entidadeSincronizada?: unknown;
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
  qsa?: Array<{ nome: string; qualificacao: string; faixaEtaria?: string; cpf?: string; participacaoPercentual?: number; capitalCentavos?: number; dataEntrada?: string }>;
  responsavelNome?: string;
  responsavelCpf?: string;
  contadorNome?: string;
  contadorCrc?: string;
  contadorCpf?: string;
  contadorUfCrc?: string;
  contadorEmail?: string;
  contadorFone?: string;
  /** Certidão de regularidade profissional, formato UF/ano/número. */
  contadorCertidao?: string;
  contadorCertidaoData?: string;
  /** Dados complementares do cadastro (vêm do backup do sistema anterior; opcionais e editáveis). */
  codigoSistemaAnterior?: string;
  descricaoAtividade?: string;
  fax?: string;
  /** Data do registro na Junta Comercial (arquivamento dos atos). O número é o NIRE. */
  juntaComercialData?: string;
  responsavelNascimento?: string;
  inicioServicoContabil?: string;
  ativaNoEscritorio?: boolean;
  observacoes?: string;
  contadorRg?: string;
  contadorRgOrgao?: string;
  contadorRgData?: string;
  /** "Contador" ou "Técnico em contabilidade". */
  contadorCategoria?: string;
  /** Numeração dos livros: página do Diário (o número do Diário é ecdNumeroLivro) e livro/página do Razão e do Caixa. */
  livrosNumeracao?: { diarioPagina?: number; razao?: { livro?: number; pagina?: number }; caixa?: { livro?: number; pagina?: number } };
  /** Máscara do código das contas (ex.: 9-9-99-99-99) e contas de apuração/lucro/prejuízo do plano. */
  planoMascara?: string;
  contaApuracaoResultadoCodigo?: string;
  contaLucroCodigo?: string;
  contaPrejuizoCodigo?: string;
  historicoCnae?: Array<{ data: string; cnae: string }>;
  historicoNire?: Array<{ data: string; numero: string }>;
  /** Dados da escrituração (ECD) guardados uma vez por empresa. */
  nire?: string;
  responsavelQualificacao?: string;
  ecdNaturezaLivro?: string;
  ecdNumeroLivro?: number;
  ecdCodigoMunicipioIbge?: string;
  /** Lucro presumido: optou pelo livro caixa (art. 45 da Lei 8.981/1995)? */
  presumidoLivroCaixa?: boolean;
  /** Lucro presumido: distribuiu lucros acima da base de cálculo sem IRRF? */
  presumidoDistribuiuLucroAcimaBase?: boolean;
  /** Simples Nacional: recebeu aporte de capital (arts. 61-A a 61-D da LC 123)? */
  simplesAporteCapital?: boolean;
  /** Vínculo das contas analíticas com o plano referencial da RFB: código da conta → código referencial. */
  mapeamentoReferencial?: Record<string, string>;
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
  contaContrapartidaAberturaCodigo?: string;
  contasDisponibilidadesCodigo?: string[];
  /** Classificação das contas para DFC, DMPL e índices escolhida pela contadora (código da conta → categoria). Sem escolha, vale a sugestão do sistema. */
  classificacaoDemonstracoes?: Record<string, string>;
  /** Notas explicativas por ano (modelo simples ME/EPP editado pela contadora). */
  notasExplicativas?: Record<string, import("./utils/demonstracoesAvancadas").NotasExplicativas>;
  /** ECF: Bloco Y (Y540/Y600) e Parte B do e-Lalur/e-Lacs por ano. */
  ecfComplementos?: import("./services/ecfComplementosService").ComplementosEcf;
  /** Entregas de ECD/ECF marcadas pela equipe (chave "ECD-2025", "ECF-2025"), para o painel do escritório. */
  entregasSped?: Record<string, { entregueEm: string; recibo?: string; marcadoPor?: string; arquivoRecibo?: string }>;
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
  origem: "Cadastro" | "Fiscal — NFe Entrada" | "Fiscal — NFe Saída" | "Fiscal — Apuração ICMS" | "DP — Folha" | "DP — INSS" | "DP — INSS patronal" | "DP — IRRF" | "DP — FGTS" | "Financeiro / Bancos" | "Manual" | "Sistema anterior";
  documentoRef?: string;
  competencia?: string;
  centroCustoCodigo?: string;
  centroCustoNome?: string;
  centroCustoDebitoCodigo?: string;
  centroCustoCreditoCodigo?: string;
  estornoDe?: string;
  statusManual?: "pendente_aprovacao" | "aprovado" | "rejeitado";
  saldoInicialContaCodigo?: string;
  /** Import source is descriptive only; it is not proof of historical approval. */
  sistemaMigracao?: "ALTERDATA" | "DOMINIO" | "ATRON" | "CSV";
  classificacaoDeclaradaArquivo?: string;
  /** Lançamento com várias partidas (1 débito x N créditos ou N x 1): cada par fica num registro e todos têm o mesmo loteId. Aprovar/rejeitar vale para o lote inteiro. */
  loteId?: string;
  /** Encerramento do resultado do exercício gravado no sistema (contas de resultado contra a conta de lucros/prejuízos). Fica fora da DRE. */
  tipoEspecial?: "encerramento";
  /** Lançamento padrão (recorrente) que gerou este pré-lançamento. */
  recorrenteDe?: string;
  /** Descrição do lote e número sequencial do lançamento (vindos do sistema anterior). */
  loteDescricao?: string;
  numeroSequencial?: number;
}

/** Histórico padrão cadastrável por empresa. Aceita {mes} (MM/AAAA), {competencia} (AAAA-MM) e {ano}. */
export interface HistoricoPadrao {
  id: string;
  codigo: string;
  texto: string;
  /** Pede complemento ao lançar (ex.: número da nota). */
  exigeComplemento?: boolean;
}

/** Lançamento padrão (recorrente): o robô prepara todo mês como pré-lançamento para aprovação. */
export interface LancamentoPadrao {
  id: string;
  nome: string;
  ativo: boolean;
  /** Dia do mês do lançamento (1 a 31; em meses mais curtos vale o último dia). */
  dia: number;
  historico: string;
  /** "1xN": a conta única é debitada e as partidas creditadas; "Nx1": as partidas são debitadas e a conta única creditada. */
  forma: "1xN" | "Nx1";
  contaUnica: string;
  partidas: Array<{ conta: string; valorCentavos: number }>;
  /** Primeira competência (AAAA-MM) em que o robô prepara. */
  inicio: string;
  /** Última competência (AAAA-MM), opcional. */
  fim?: string;
  criadoEm: string;
  /** "modelo": modelo para o lançamento manual (botão "Usar modelo"); o robô não prepara e o valor (fixo) é opcional. */
  uso?: "recorrente" | "modelo";
  /** Código do modelo (ex.: 00047), histórico padrão usado e se pede complemento no histórico. */
  codigo?: string;
  historicoPadraoCodigo?: string;
  pedeComplemento?: boolean;
}

/** Regra de conciliação bancária: quando o histórico do extrato tiver o texto, sugere a conta. */
export interface RegraConciliacao {
  id: string;
  contem: string;
  contaCodigo: string;
  sentido: "entrada" | "saida" | "ambos";
  ativo: boolean;
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
  saldoInicialCompetencia?: string;
  saldoInicialConvertidoEm?: string;
  /** Código reduzido (atalho de digitação), com os zeros como estão. */
  codigoReduzido?: string;
}

export type OrigemMapeadaContabil =
  | "fiscal_entrada"
  | "fiscal_saida"
  | "dp_folha_bruta"
  | "dp_descontos_inss"
  | "dp_inss_patronal"
  | "dp_descontos_irrf"
  | "dp_fgts"
  | "dp_multa_fgts_rescisoria"
  | "dp_salario_familia"
  | "dp_desconto_faltas"
  | "dp_desconto_vt"
  | "dp_desconto_pensao"
  | "dp_desconto_adiantamento"
  | "dp_desconto_consignado"
  | "dp_desconto_emprestimo_empresa"
  | "dp_desconto_convenio"
  | "dp_desconto_outros_autorizados"
  | "dp_provisao_ferias"
  | "dp_provisao_13"
  | "dp_provisao_encargos"
  | "dp_ferias"
  | "fiscal_difal_consumo"
  | "fiscal_difal_ativo"
  | "fiscal_irpj_presumido"
  | "fiscal_csll_presumido"
  | "fiscal_pis_presumido"
  | "fiscal_cofins_presumido"
  | "fiscal_pis_nc"
  | "fiscal_cofins_nc"
  | "fiscal_pis_nc_credito"
  | "fiscal_cofins_nc_credito"
  | "fiscal_das_simples"
  | "fiscal_das_simples_pago"
  | "fiscal_irpj_presumido_pago"
  | "fiscal_csll_presumido_pago"
  | "fiscal_pis_presumido_pago"
  | "fiscal_cofins_presumido_pago"
  | "fiscal_pis_nc_pago"
  | "fiscal_cofins_nc_pago"
  | "fiscal_darf_encargos"
  | "contabil_irpj_real"
  | "contabil_csll_real"
  | "contabil_irpj_real_pago"
  | "contabil_csll_real_pago"
  | "dp_cprb"
  | "fiscal_irpj_arbitrado"
  | "fiscal_csll_arbitrado"
  | "fiscal_pis_arbitrado"
  | "fiscal_cofins_arbitrado"
  | "fiscal_cofins_entidade"
  | "fiscal_iss_proprio"
  | "fiscal_iss_retido_tomador"
  | "fiscal_das_simples_encargos";

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
  origem: "DP — Folha" | "DP — INSS" | "DP — INSS patronal" | "DP — IRRF" | "DP — FGTS" | "DP — Multa FGTS rescisória" | "DP — Salário-família" | "DP — Faltas e DSR" | "DP — Desconto de vale-transporte" | "DP — Pensão alimentícia" | "DP — Adiantamento" | "DP — Provisão de férias" | "DP — Provisão de 13º" | "DP — Encargos sobre provisões" | "DP — Férias" | "Fiscal — Entrada" | "Fiscal — Saída" | "Fiscal — DIFAL (uso/consumo)" | "Fiscal — DIFAL (ativo imobilizado)" | "Fiscal — IRPJ Presumido" | "Fiscal — CSLL Presumido" | "Fiscal — PIS Presumido" | "Fiscal — COFINS Presumido" | "Fiscal — DAS Simples (provisão)" | "Fiscal — DAS Simples (pagamento)" | "Fiscal — DAS Simples (multa e juros)";
  contaDebitoCodigo: string;
  contaCreditoCodigo: string;
  valor: number;
  historico: string;
  status: "pendente_conferencia" | "contabilizado";
  criadoEm: string;
  contabilizadoEm?: string;
  geradoAutomaticamente?: true;
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
  acoes?: AcaoAgenteCartao[];
}

export interface AcaoAgenteCartao {
  id: string;
  titulo: string;
  descricao: string[];
  aviso: string | null;
  irreversivel: boolean;
  /** Exclusão: duas confirmações (Continuar, depois "Sim, excluir"). */
  duasEtapas?: boolean;
  /** Na segunda etapa o botão vermelho só vale depois de um instante (toque duplo nunca confirma). */
  liberada?: boolean;
  estado: "pendente" | "etapa2" | "executando" | "confirmada" | "falhou" | "recusada";
  resultado?: string;
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

/** Função que chama as rotas da escrituração avançada no servidor. Exclusão (método de apagar) só depois do pedir() das duas etapas, na tela. */
export type MetodoRota = "GET" | "POST" | "DELETE";
export type RotaEscrituracao = (metodo: MetodoRota, caminho: string, corpo?: unknown) => Promise<{ ok: boolean; corpo: any }>;
