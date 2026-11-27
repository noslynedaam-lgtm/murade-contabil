// Paradas do TOUR GUIADO do Murad Contábil ("Murad, me mostra o sistema"). Arquivo puro.
// Ordem: a do menu lateral (Sidebar), conferida pelo teste scripts/testes/tourContabil.test.ts. Destinos: as telas do mapa
// (TELAS_CONTABIL). Ficam de fora a própria Escola (o fim do tour convida para ela) e "IA Murad Premium" (só abre a conversa).
// A frase de cada tela é curta e foi escrita a partir do que a tela tem (nomes e palavras da busca do topo do App).
import { TELAS_CONTABIL } from './mapaTelasContabil';
import { montarParadas, type ParadaTour } from './tourMurad';

export const AREA_PRINCIPAL_CONTABIL = '#conteudo-principal-contabil';
export const ROTA_ESCOLA_CONTABIL = 'escola';
/** Itens do menu que não são parada do tour: a Escola (convite do fim) e o atalho que só abre a conversa com a Murad. */
export const FORA_DO_TOUR_CONTABIL = [ROTA_ESCOLA_CONTABIL, 'ia-premium'];

/** Ordem do menu lateral (Sidebar.tsx). */
export const ORDEM_MENU_CONTABIL = [
  'inicio', 'empresa', 'agenda', 'fluxo-previtico', 'modulos-finais', 'gestao-contabil', 'conexoes', 'lancamentos', 'aprovacoes', 'balancete', 'livros',
  'demonstracoes', 'plano-contas', 'migracao', 'integracao', 'revisao-origens', 'vigencia-obrigacoes', 'calculadora', 'agente', 'revisor', 'tarefas-equipe',
  'backups', 'meu-jeito', 'ia-premium', 'escola',
];

/** Uma frase por tela (o nome da tela é falado antes). */
export const FALAS_TOUR_CONTABIL: Record<string, string> = {
  inicio: 'O resumo do dia, com as pendências e os lembretes.',
  empresa: 'O cadastro da empresa: CNPJ, regime e certificado digital.',
  agenda: 'Os prazos e lembretes da contabilidade.',
  'fluxo-previtico': 'A projeção de entradas, saídas e saldo.',
  'modulos-finais': 'As obrigações acessórias, como ECD, ECF e DEFIS.',
  'gestao-contabil': 'O fechamento da competência, a conciliação bancária e o imobilizado.',
  conexoes: 'A situação da conexão com a Receita, a SEFAZ e o Serpro.',
  lancamentos: 'Os lançamentos contábeis, em partidas dobradas.',
  aprovacoes: 'Os pré-lançamentos que esperam a sua aprovação.',
  balancete: 'O balancete de verificação, com os saldos das contas.',
  livros: 'O Diário, o Razão, o Balanço, a DRE e a ECD.',
  demonstracoes: 'DFC, DMPL, notas explicativas, índices e relatório do cliente.',
  'plano-contas': 'O plano de contas, com os saldos iniciais.',
  migracao: 'Trazer o plano, os lançamentos e os saldos do sistema anterior.',
  integracao: 'A integração com o Murad Fiscal e o Murad DP.',
  'revisao-origens': 'A conferência do que chegou do Fiscal e do DP antes de lançar.',
  'vigencia-obrigacoes': 'O que começa, muda e acaba nas obrigações, com a fonte oficial.',
  calculadora: 'Uma calculadora de tributos.',
  agente: 'Os robôs que trabalham sozinhos e o que cada um fez.',
  revisor: 'A revisão do mês de cada empresa: certo, risco e falta.',
  'tarefas-equipe': 'Os pedidos feitos à equipe e a você.',
  backups: 'O backup do escritório: agendar, guardar e restaurar.',
  'meu-jeito': 'As suas preferências e o que você ensinou à Murad.',
};

const porId = new Map(TELAS_CONTABIL.map((t) => [t.id, t]));
const ordem = (id: string) => { const i = ORDEM_MENU_CONTABIL.indexOf(id); return i < 0 ? 999 : i; };

export const PARADAS_TOUR_CONTABIL: ParadaTour[] = montarParadas(
  [...TELAS_CONTABIL].sort((a, b) => ordem(a.id) - ordem(b.id)).map((t) => ({
    rota: t.id, nome: t.rotulo, menu: `#btn-menu-${t.id}`, texto: t.rotulo, fala: FALAS_TOUR_CONTABIL[t.id],
  })),
  FORA_DO_TOUR_CONTABIL,
);

/** Destinos válidos: as telas do mapa e a Escola (mesmos ids do menu e do App). */
export const ROTAS_VALIDAS_CONTABIL: string[] = [...porId.keys(), ROTA_ESCOLA_CONTABIL];
