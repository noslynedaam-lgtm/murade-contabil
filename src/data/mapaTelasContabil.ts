// Mapa das telas do Murade Contábil para o PILOTO VISÍVEL.
// Cada tela, campo, botão e seção listada aqui precisa existir no código: o teste scripts/testes/mapaTelasContabil.test.ts
// e o robô conferidor "piloto" varrem os arquivos e avisam se algo foi renomeado. Não renomeie `data-campo` sem atualizar aqui.
// Nomes de data-campo só com letras minúsculas, números e hífen (o alvo vira [data-campo=x]).

export type TipoDeCampo = 'texto' | 'numero' | 'selecao' | 'area' | 'botao';

export interface TelaMapa {
  id: string;
  rotulo: string;
  /** Campo (data-campo) de competência da tela, se ela tiver um. */
  periodo?: string;
}

export interface CampoMapa {
  /** Valor do atributo data-campo (ou id, quando `porId`). */
  chave: string;
  tela: string;
  rotulo: string;
  arquivo: string;
  tipo: TipoDeCampo;
  /** Botão final: o piloto só destaca; quem clica é o contador. 'salvar' aceita "pode confirmar" por voz. */
  final?: 'salvar' | 'irreversivel';
  /** Botão que só ABRE um formulário (o piloto pode clicar). */
  abre?: boolean;
  /** O alvo é um id do elemento, não um data-campo. */
  porId?: boolean;
}

export interface SecaoMapa { chave: string; tela: string; texto: string; arquivo: string }

export const TELAS_CONTABIL: TelaMapa[] = [
  { id: 'inicio', rotulo: 'Tela Inicial' },
  { id: 'empresa', rotulo: 'Cadastro de Empresa' },
  { id: 'agenda', rotulo: 'Agenda & Lembretes' },
  { id: 'fluxo-previtico', rotulo: 'Fluxo Prevítico' },
  { id: 'modulos-finais', rotulo: 'Obrigações & Gestão' },
  { id: 'gestao-contabil', rotulo: 'Gestão contábil', periodo: 'gestao-periodo' },
  { id: 'conexoes', rotulo: 'Conexão Órgãos' },
  { id: 'lancamentos', rotulo: 'Lançamentos' },
  { id: 'aprovacoes', rotulo: 'Aprovar lançamentos' },
  { id: 'balancete', rotulo: 'Balancete', periodo: 'balancete-competencia' },
  { id: 'livros', rotulo: 'Livros Fiscais & ECD' },
  { id: 'plano-contas', rotulo: 'Plano de Contas' },
  { id: 'migracao', rotulo: 'Migração Contábil' },
  { id: 'integracao', rotulo: 'Integrações' },
  { id: 'revisao-origens', rotulo: 'Revisar dados recebidos' },
  { id: 'calculadora', rotulo: 'Calculadora 3D' },
  { id: 'agente', rotulo: 'Agentes & Robô' },
  { id: 'tarefas-equipe', rotulo: 'Tarefas da equipe' },
  { id: 'backups', rotulo: 'Backups' },
  { id: 'meu-jeito', rotulo: 'Meu jeito' },
];

const LANC = 'src/components/tabs/LancamentosTab.tsx';
const PLANO = 'src/components/tabs/PlanoContasTab.tsx';
const EMP = 'src/components/tabs/EmpresaTab.tsx';
const PADROES = 'src/components/PadroesLancamentoPainel.tsx';
const LIVRO_CAIXA = 'src/components/LivroCaixaEncerramento.tsx';
const CONCILIACAO = 'src/components/ConciliacaoBancariaPainel.tsx';
const GESTAO = 'src/components/tabs/GestaoContabilTab.tsx';

export const CAMPOS_CONTABIL: CampoMapa[] = [
  // Lançamento manual (abre pelo botão "+ Lançamento Manual")
  { chave: 'btn-novo-lancamento', tela: 'lancamentos', rotulo: '+ Lançamento Manual', arquivo: LANC, tipo: 'botao', abre: true, porId: true },
  { chave: 'lancamento-data', tela: 'lancamentos', rotulo: 'Data do lançamento', arquivo: LANC, tipo: 'texto' },
  { chave: 'lancamento-valor', tela: 'lancamentos', rotulo: 'Valor (R$)', arquivo: LANC, tipo: 'numero' },
  { chave: 'lancamento-debito-codigo', tela: 'lancamentos', rotulo: 'Conta a débito (código)', arquivo: LANC, tipo: 'texto' },
  { chave: 'lancamento-credito-codigo', tela: 'lancamentos', rotulo: 'Conta a crédito (código)', arquivo: LANC, tipo: 'texto' },
  { chave: 'lancamento-historico', tela: 'lancamentos', rotulo: 'Histórico da operação', arquivo: LANC, tipo: 'area' },
  { chave: 'lancamento-gravar', tela: 'lancamentos', rotulo: 'Gravar Lançamento', arquivo: LANC, tipo: 'botao', final: 'salvar' },
  { chave: 'lancamento-forma', tela: 'lancamentos', rotulo: 'Forma do lançamento (1x1, 1 débito x vários créditos, vários débitos x 1 crédito)', arquivo: LANC, tipo: 'selecao' },
  { chave: 'lancamento-historico-padrao', tela: 'lancamentos', rotulo: 'Usar um histórico padrão', arquivo: LANC, tipo: 'selecao' },
  // Históricos e lançamentos padrão (recorrentes), na mesma tela de Lançamentos (quadro recolhível)
  { chave: 'historico-padrao-codigo', tela: 'lancamentos', rotulo: 'Código do histórico padrão', arquivo: PADROES, tipo: 'texto' },
  { chave: 'historico-padrao-texto', tela: 'lancamentos', rotulo: 'Texto do histórico padrão', arquivo: PADROES, tipo: 'texto' },
  { chave: 'padrao-nome', tela: 'lancamentos', rotulo: 'Nome do lançamento padrão', arquivo: PADROES, tipo: 'texto' },
  { chave: 'padrao-dia', tela: 'lancamentos', rotulo: 'Dia do mês do lançamento padrão', arquivo: PADROES, tipo: 'numero' },
  { chave: 'padrao-gravar', tela: 'lancamentos', rotulo: 'Cadastrar lançamento padrão', arquivo: PADROES, tipo: 'botao' },
  // Livros: Livro Caixa do Simples e encerramento do resultado
  { chave: 'livro-caixa-de', tela: 'livros', rotulo: 'Livro Caixa: competência inicial', arquivo: LIVRO_CAIXA, tipo: 'texto' },
  { chave: 'encerramento-ano', tela: 'livros', rotulo: 'Encerramento do resultado: ano', arquivo: LIVRO_CAIXA, tipo: 'numero' },
  // Gestão contábil: extrato e conciliação
  { chave: 'extrato-conta', tela: 'gestao-contabil', rotulo: 'Conta do extrato no plano', arquivo: CONCILIACAO, tipo: 'selecao' },
  { chave: 'conciliacao-aceitar', tela: 'gestao-contabil', rotulo: 'Aceitar sugestões dos marcados', arquivo: CONCILIACAO, tipo: 'botao' },
  { chave: 'regra-texto', tela: 'gestao-contabil', rotulo: 'Regra de conciliação: quando o histórico tiver', arquivo: CONCILIACAO, tipo: 'texto' },
  // Plano de contas (abre pelo botão "+ Nova Conta na Sequência")
  { chave: 'btn-nova-conta', tela: 'plano-contas', rotulo: '+ Nova Conta na Sequência', arquivo: PLANO, tipo: 'botao', abre: true, porId: true },
  { chave: 'conta-pai', tela: 'plano-contas', rotulo: 'Conta pai / grupo', arquivo: PLANO, tipo: 'selecao' },
  { chave: 'conta-codigo', tela: 'plano-contas', rotulo: 'Código da conta', arquivo: PLANO, tipo: 'texto' },
  { chave: 'conta-descricao', tela: 'plano-contas', rotulo: 'Descrição da conta', arquivo: PLANO, tipo: 'texto' },
  { chave: 'conta-tipo', tela: 'plano-contas', rotulo: 'Tipo da conta', arquivo: PLANO, tipo: 'selecao' },
  { chave: 'conta-natureza', tela: 'plano-contas', rotulo: 'Natureza contábil', arquivo: PLANO, tipo: 'selecao' },
  { chave: 'conta-gravar', tela: 'plano-contas', rotulo: 'Gravar Conta na Sequência', arquivo: PLANO, tipo: 'botao', final: 'salvar' },
  // Cadastro de empresa
  { chave: 'empresa-cnpj', tela: 'empresa', rotulo: 'CNPJ', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-razao-social', tela: 'empresa', rotulo: 'Razão Social', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-nome-fantasia', tela: 'empresa', rotulo: 'Nome Fantasia', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-regime', tela: 'empresa', rotulo: 'Regime Tributário', arquivo: EMP, tipo: 'selecao' },
  { chave: 'empresa-ie', tela: 'empresa', rotulo: 'Inscrição Estadual', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-im', tela: 'empresa', rotulo: 'Inscrição Municipal', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-cep', tela: 'empresa', rotulo: 'CEP', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-cidade-uf', tela: 'empresa', rotulo: 'Cidade / UF', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-endereco', tela: 'empresa', rotulo: 'Endereço completo', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-telefone', tela: 'empresa', rotulo: 'Telefone / WhatsApp', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-email', tela: 'empresa', rotulo: 'E-mail de contato', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-responsavel', tela: 'empresa', rotulo: 'Responsável legal', arquivo: EMP, tipo: 'texto' },
  { chave: 'empresa-salvar', tela: 'empresa', rotulo: 'Salvar Empresa', arquivo: EMP, tipo: 'botao', final: 'salvar' },
  // Serviço completo da Agente (src/server/servicoCompleto.ts): abas que o piloto abre e botões onde ele PARA (o clique é do contador).
  { chave: 'gestao-aba-imobilizado', tela: 'gestao-contabil', rotulo: 'Aba Ativo imobilizado', arquivo: GESTAO, tipo: 'botao', abre: true },
  { chave: 'gestao-aba-extrato', tela: 'gestao-contabil', rotulo: 'Aba Extrato e conciliação', arquivo: GESTAO, tipo: 'botao', abre: true },
  { chave: 'gestao-aba-fechamento', tela: 'gestao-contabil', rotulo: 'Aba Fechamento guiado', arquivo: GESTAO, tipo: 'botao', abre: true },
  { chave: 'depreciacao-lancar', tela: 'gestao-contabil', rotulo: 'Lançar depreciação do mês', arquivo: GESTAO, tipo: 'botao' },
  { chave: 'fechamento-fechar', tela: 'gestao-contabil', rotulo: 'Fechar competência (Fechamento guiado)', arquivo: GESTAO, tipo: 'botao' },
  { chave: 'aprovacao-aprovar', tela: 'aprovacoes', rotulo: 'Aprovar (primeiro lançamento da fila)', arquivo: 'src/components/tabs/AprovacoesTab.tsx', tipo: 'botao' },
  { chave: 'balancete-exportar', tela: 'balancete', rotulo: 'Exportar CSV do balancete', arquivo: 'src/components/tabs/BalanceteTab.tsx', tipo: 'botao' },
  { chave: 'livros-pdf', tela: 'livros', rotulo: 'Imprimir / PDF dos livros', arquivo: 'src/components/tabs/LivrosTab.tsx', tipo: 'botao' },
  { chave: 'ecd-ano', tela: 'livros', rotulo: 'Ano-calendário da ECD', arquivo: 'src/components/tabs/LivrosTab.tsx', tipo: 'numero' },
  { chave: 'ecd-baixar', tela: 'livros', rotulo: 'Baixar arquivo ECD', arquivo: 'src/components/EcdGeradorPainel.tsx', tipo: 'botao' },
  // Competência das telas com período
  { chave: 'balancete-competencia', tela: 'balancete', rotulo: 'Competência do balancete', arquivo: 'src/components/tabs/BalanceteTab.tsx', tipo: 'selecao' },
  { chave: 'gestao-periodo', tela: 'gestao-contabil', rotulo: 'Competência da gestão contábil', arquivo: 'src/components/tabs/GestaoContabilTab.tsx', tipo: 'selecao' },
];

/** Seções que o piloto sabe achar pelo texto do título (mesmos textos da busca global). */
export const SECOES_CONTABIL: SecaoMapa[] = [
  { chave: 'livro-diario', tela: 'livros', texto: 'Livro Diário', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'livro-razao', tela: 'livros', texto: 'Livro Razão', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'balanco-patrimonial', tela: 'livros', texto: 'Balanço Patrimonial', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'dre', tela: 'livros', texto: 'DRE gerencial', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'fluxo-de-caixa', tela: 'livros', texto: 'Fluxo de Caixa', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'autenticacao-ecd', tela: 'livros', texto: 'Autenticação oficial da ECD', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'conferencia-ecd', tela: 'livros', texto: 'Conferência prévia', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'balancete-local', tela: 'balancete', texto: 'Balancete local', arquivo: 'src/components/tabs/BalanceteTab.tsx' },
  { chave: 'saldos-iniciais', tela: 'plano-contas', texto: 'Partidas dobradas dos saldos iniciais', arquivo: 'src/components/tabs/PlanoContasTab.tsx' },
  { chave: 'conciliacao-fiscal-dp', tela: 'revisao-origens', texto: 'Conciliação Fiscal/DP', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'mapeamento-contas', tela: 'revisao-origens', texto: 'Mapeamento de contas', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'previa-folha', tela: 'revisao-origens', texto: 'Prévia contábil da folha', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'previa-notas', tela: 'revisao-origens', texto: 'Prévia contábil das notas', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'conferencia-tributos', tela: 'revisao-origens', texto: 'Conferência de tributos', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'manuais-estornos', tela: 'revisao-origens', texto: 'Lançamentos manuais e estornos', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'trilha-auditoria', tela: 'revisao-origens', texto: 'trilha de auditoria', arquivo: 'src/components/tabs/RevisaoOrigensTab.tsx' },
  { chave: 'livro-caixa', tela: 'livros', texto: 'Livro Caixa (Simples)', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'encerramento-resultado', tela: 'livros', texto: 'Encerramento do resultado', arquivo: 'src/components/tabs/LivrosTab.tsx' },
  { chave: 'lancamentos-padrao', tela: 'lancamentos', texto: 'Lançamentos padrão', arquivo: 'src/components/PadroesLancamentoPainel.tsx' },
  { chave: 'regras-conciliacao', tela: 'gestao-contabil', texto: 'Regras de conciliação', arquivo: 'src/components/ConciliacaoBancariaPainel.tsx' },
  { chave: 'servicos-agente', tela: 'aprovacoes', texto: 'Serviços preparados pela Agente', arquivo: 'src/components/ServicosAgentePainel.tsx' },
];

export const IDS_DE_TELAS_CONTABIL: ReadonlySet<string> = new Set(TELAS_CONTABIL.map((t) => t.id));
export const campoDoMapa = (chave: string): CampoMapa | undefined => CAMPOS_CONTABIL.find((c) => c.chave === chave);
export const alvoDoCampo = (chave: string): string => { const c = campoDoMapa(chave); return c?.porId ? `#${chave}` : `[data-campo=${chave}]`; };
