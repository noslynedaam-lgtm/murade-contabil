// "Meu jeito" do Murade Contábil: o jeito PADRÃO de cada módulo, num arquivo de dados único.
// É daqui que saem as boas-vindas da Agente IA e a ferramenta explicar_jeito_padrao (sem chamar IA, sem gastar crédito).
// O teste scripts/testes/meu-jeito.test.ts confere este arquivo contra as telas reais (menu, nomes e títulos das seções):
// se uma tela for renomeada, o teste (e o Robô Conferidor "Meu jeito") avisam. Não escreva aqui o que o sistema não faz.
// O jeito PADRÃO vale para todos os escritórios e evolui por atualização; o jeito de cada pessoa é só uma camada por cima.

export type TelaJeito = {
  id: string;
  /** Mesmo nome que aparece no menu lateral. */
  rotulo: string;
  /** Como o módulo funciona por padrão, em uma frase (verificada contra a tela). */
  resumo: string;
  /** Arquivo da tela, para o teste conferir os títulos das seções. */
  arquivo: string | null;
};

export const MODULOS_JEITO_PADRAO: TelaJeito[] = [
  { id: 'inicio', rotulo: 'Tela Inicial', resumo: 'Painel de entrada: mostra o estado das integrações com o Fiscal, o Departamento Pessoal e os órgãos, e tem a caixinha "Pedir para alguém" para passar serviço à equipe.', arquivo: 'InicioTab' },
  { id: 'empresa', rotulo: 'Cadastro de Empresa', resumo: 'Cadastro e gestão das empresas do escritório (CNPJ, regime e dados fiscais); também puxa as empresas do Murade Fiscal e do DP.', arquivo: 'EmpresaTab' },
  { id: 'agenda', rotulo: 'Agenda & Lembretes', resumo: 'Calendário de obrigações e lembretes de vencimento, com cadastro de novo lembrete.', arquivo: 'AgendaTab' },
  { id: 'fluxo-previtico', rotulo: 'Fluxo Prevítico', resumo: 'Fluxo de caixa editável na tela; foto ou arquivo anexado fica só no navegador, sem leitura automática, e nada vira lançamento sozinho.', arquivo: 'FluxoPreviticoTab' },
  { id: 'modulos-finais', rotulo: 'Obrigações & Gestão', resumo: 'Painel das obrigações e da gestão da empresa a partir dos lançamentos definitivos; o Contábil não consulta a SEFAZ, só recebe o que o Fiscal capturou.', arquivo: 'ModulosFinaisTab' },
  { id: 'gestao-contabil', rotulo: 'Gestão contábil', resumo: 'Comparativos entre períodos, centros de custo, ativo imobilizado, extrato bancário e o fechamento guiado do mês.', arquivo: 'GestaoContabilTab' },
  { id: 'conexoes', rotulo: 'Conexão Órgãos', resumo: 'Mostra o estado das conexões com o Fiscal, o Departamento Pessoal e os órgãos públicos.', arquivo: 'ConexoesTab' },
  { id: 'lancamentos', rotulo: 'Lançamentos', resumo: 'Lançamentos por partida dobrada; os manuais só entram nos livros depois de aprovados.', arquivo: 'LancamentosTab' },
  { id: 'aprovacoes', rotulo: 'Aprovar lançamentos', resumo: 'Aprovar ou rejeitar os lançamentos que aguardam decisão; a rejeição pede o motivo, que fica no histórico.', arquivo: 'AprovacoesTab' },
  { id: 'balancete', rotulo: 'Balancete', resumo: 'Balancete local de verificação por competência, com exportação em CSV e o botão de fechar o mês.', arquivo: 'BalanceteTab' },
  { id: 'livros', rotulo: 'Livros Fiscais & ECD', resumo: 'Livro Diário, Livro Razão, Balancete, Balanço e DRE gerenciais como relatórios internos, mais a preparação da ECD.', arquivo: 'LivrosTab' },
  { id: 'plano-contas', rotulo: 'Plano de Contas', resumo: 'Plano de contas e saldos iniciais; os saldos geram partidas dobradas que aguardam aprovação.', arquivo: 'PlanoContasTab' },
  { id: 'migracao', rotulo: 'Migração Contábil', resumo: 'Importação de plano de contas, centros de custo e lançamentos de outros sistemas em 4 etapas, com validação antes de gravar.', arquivo: 'MigracaoContabilTab' },
  { id: 'integracao', rotulo: 'Integrações', resumo: 'Estado da recepção do Fiscal e do DP e da preparação automática de rascunhos, com botões para reprocessar a recepção.', arquivo: 'IntegracaoTab' },
  { id: 'revisao-origens', rotulo: 'Revisar dados recebidos', resumo: 'Revisão do que veio do Fiscal e do DP: mapeamento de contas, prévias contábeis das notas e da folha, conciliação e aprovação final.', arquivo: 'RevisaoOrigensTab' },
  { id: 'calculadora', rotulo: 'Calculadora 3D', resumo: 'Calculadora com teclas compactas e acumulado por empresa.', arquivo: 'CalculadoraTab' },
  { id: 'agente', rotulo: 'Agentes & Robô', resumo: 'Painel dos robôs e da Agente IA, com a missão e o estado de cada um.', arquivo: 'AgenteTab' },
  { id: 'tarefas-equipe', rotulo: 'Tarefas da equipe', resumo: 'Pedidos feitos à equipe, com acompanhamento de quando foram vistos e concluídos.', arquivo: 'TarefasEquipeTab' },
  { id: 'backups', rotulo: 'Backups', resumo: 'Uma cópia cifrada por mês, só com os dados do escritório, gerada sozinha pelo robô conferidor.', arquivo: 'BackupsTab' },
  { id: 'meu-jeito', rotulo: 'Meu jeito', resumo: 'O que a Agente aprendeu do seu jeito de trabalhar: você vê, muda ou volta ao jeito padrão, uma regra por vez.', arquivo: 'MeuJeitoTab' },
];

export const IDS_TELAS_JEITO: string[] = MODULOS_JEITO_PADRAO.map((m) => m.id);
export const rotuloDaTela = (id: string): string => MODULOS_JEITO_PADRAO.find((m) => m.id === id)?.rotulo ?? id;

/** Seções de uma tela que a pessoa pode pedir para "destacar" ao abrir a tela. `texto` precisa aparecer na tela (o teste confere). */
export type SecaoJeito = { id: string; tela: string; rotulo: string; texto: string };
export const SECOES_DESTACAVEIS: SecaoJeito[] = [
  { id: 'balancete-verificacao', tela: 'balancete', rotulo: 'Balancete de verificação', texto: 'Balancete local de verificação' },
  { id: 'livro-diario', tela: 'livros', rotulo: 'Livro Diário', texto: 'Livro Diário' },
  { id: 'livro-razao', tela: 'livros', rotulo: 'Livro Razão', texto: 'Livro Razão' },
  { id: 'dre-gerencial', tela: 'livros', rotulo: 'DRE gerencial', texto: 'DRE gerencial' },
  { id: 'autenticacao-ecd', tela: 'livros', rotulo: 'Autenticação oficial da ECD', texto: 'Autenticação oficial da ECD' },
  { id: 'partidas-saldos-iniciais', tela: 'plano-contas', rotulo: 'Partidas dobradas dos saldos iniciais', texto: 'Partidas dobradas dos saldos iniciais' },
  { id: 'mapeamento-contas', tela: 'revisao-origens', rotulo: 'Mapeamento de contas por empresa', texto: 'Mapeamento de contas por empresa' },
  { id: 'previa-folha', tela: 'revisao-origens', rotulo: 'Prévia contábil da folha', texto: 'Prévia contábil da folha' },
  { id: 'previa-notas', tela: 'revisao-origens', rotulo: 'Prévia contábil das notas fiscais', texto: 'Prévia contábil das notas fiscais' },
  { id: 'manuais-estornos', tela: 'revisao-origens', rotulo: 'Lançamentos manuais e estornos', texto: 'Lançamentos manuais e estornos' },
  { id: 'trilha-auditoria', tela: 'revisao-origens', rotulo: 'Histórico e trilha de auditoria', texto: 'Histórico persistente e trilha de auditoria' },
];

/** Perguntas fixas (somente consulta) que uma regra pode pedir à Agente. Usam crédito de IA, por isso só rodam se a pessoa ensinou a regra. */
export type AssuntoAgente = { id: string; rotulo: string; frase: string };
export const ASSUNTOS_AGENTE: AssuntoAgente[] = [
  { id: 'pendencias', rotulo: 'pendências de conferência e aprovação', frase: 'Quais são as minhas pendências de conferência e aprovação?' },
  { id: 'achados-conferidor', rotulo: 'o que o Robô Conferidor achou', frase: 'O que o Robô Conferidor achou nas minhas empresas?' },
  { id: 'status-robos', rotulo: 'como estão os robôs', frase: 'Como estão os robôs do Contábil?' },
  { id: 'vencimentos', rotulo: 'o que vence hoje e nos próximos dias', frase: 'O que vence hoje e nos próximos dias?' },
];

/** O que o "jeito" NUNCA muda. Mostrado quando a pessoa pede algo assim e na tela "Meu jeito". */
export const PROTECOES_FIXAS: string[] = [
  'confirmação antes de lançar de forma definitiva, encerrar período, fechar balanço, enviar, pagar, excluir (com segunda confirmação) e estornar',
  'cálculos exatos',
  'obrigações legais e robôs conferidores',
  'a trava contra serviço em duplicidade',
  'consulta paga ao SERPRO só quando a pessoa clica',
  'nada de apagar tudo de uma vez: sempre uma coisa por vez',
];
export const TEXTO_PROTECAO = `Isso eu mantenho por segurança, e o seu jeito não muda: ${PROTECOES_FIXAS.join('; ')}.`;

/** Quantas aberturas diferentes recebem as boas-vindas; depois disso a Agente não repete sozinha. */
export const SESSOES_COM_BOAS_VINDAS = 5;

const DICAS = [
  'por exemplo, me diga qual tela você quer ao entrar',
  'por exemplo, peça para eu responder mais curto ou mais detalhado',
  'por exemplo, me ensine uma regra: quando abrir o Balancete, destacar o Balancete de verificação',
  'e esta é a última vez que eu lembro sozinha; depois é só pedir "mostra meu jeito"',
];

/** Texto fixo (sem IA). Sessão 1: o jeito padrão e o convite. Sessões 2 a 5: lembrete curto. Depois: nada. */
export function textoBoasVindas(sessao: number, legado = false): string | null {
  if (!Number.isInteger(sessao) || sessao < 1 || sessao > SESSOES_COM_BOAS_VINDAS) return null;
  // Quem já usava o sistema antes do "Meu jeito" conta como já tendo passado por 4 aberturas: vê UMA vez, e com o texto completo.
  if (sessao === 1 || legado) {
    return 'Boas-vindas ao Murade Contábil! Aqui funciona assim: o Fiscal e o DP mandam os dados, você confere em Revisar dados recebidos, aprova os lançamentos, acompanha o Balancete e fecha o mês na Gestão contábil. Mas cada contador trabalha de um jeito, e eu posso aprender o seu: é só me contar como prefere trabalhar, que eu salvo e passo a trabalhar sempre do seu jeito.';
  }
  return `Que bom ter você de volta! Lembre que eu posso aprender o seu jeito de trabalhar, ${DICAS[sessao - 2]}. Para ver o que eu já sei, diga: mostra meu jeito.`;
}
