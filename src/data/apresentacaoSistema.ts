// Apresentação falada do Murade Contábil ("Quer que eu te conte tudo o que o Contábil faz?").
// TEXTO FIXO, sem IA e sem custo, igual para todos os escritórios. Cada fato abaixo vem de uma fonte real do código e é conferido:
//  - módulos: o menu (src/data/mapaTelasContabil.ts) e o jeito padrão (src/data/jeitoPadraoContabil.ts);
//  - robôs: os registrarRobo() do server.ts (id, nome e intervalo precisam ser iguais);
//  - integrações: as rotas /api/integracao/* do server.ts (toda rota existente precisa estar listada, e toda rota listada precisa existir);
//  - sistemas que conversam: SISTEMAS de src/server/agentesEntreSistemas.ts.
// O teste scripts/testes/apresentacao.test.ts e o Robô Conferidor da Apresentação falham/avisam se algo novo não tiver bloco ou se um bloco citar algo que não existe.
// Regra do dono: nada de promessa que o código não cumpra. Se um robô, tela ou integração mudar, mude o bloco junto.
import { MODULOS_JEITO_PADRAO } from './jeitoPadraoContabil';

export type SecaoApresentacao = 'abertura' | 'modulos' | 'automatico' | 'depende' | 'integracoes' | 'limites';
export type BlocoApresentacao = {
  id: string; secao: SecaoApresentacao; titulo: string;
  /** O que a Agente fala (e aparece na legenda). Curto: uma a três frases. */
  falar: string;
  /** Tela do menu para "me mostra onde" (piloto visível). */
  tela?: string;
  /** Só o dono do sistema vê (funções de administração não aparecem para escritórios clientes). */
  soDono?: boolean;
};

export type RoboApresentacao = { id: string; nome: string; intervaloMs: number | null; quando?: string; faz: string; soDono?: boolean };
/** Um item por registrarRobo() do server.ts. `intervaloMs` precisa ser igual ao do servidor (o teste confere). */
export const ROBOS_APRESENTACAO: RoboApresentacao[] = [
  { id: 'reconciliador', nome: 'Robô Reconciliador', intervaloMs: 60_000, faz: 'traz do Fiscal e do DP os dados novos e prepara pré-lançamentos para você conferir. Ele nunca aprova nada.' },
  { id: 'contabilizador', nome: 'Robô Contabilizador', intervaloMs: null, quando: 'não roda sozinho, de propósito', faz: 'transforma pré-lançamentos em lançamentos definitivos só depois da aprovação de uma pessoa; por regra, ele nunca decide sozinho.' },
  { id: 'mensageiro', nome: 'Robô Mensageiro', intervaloMs: 60_000, faz: 'reenvia os pedidos entre as Agentes dos sistemas Murade que não chegaram ao destino.' },
  { id: 'conferidor', nome: 'Robô Conferidor', intervaloMs: 30 * 60_000, faz: 'confere todas as empresas: o que falta para fechar o mês, como aprovações, rascunhos do Fiscal e do DP, depreciação e partidas, e se a ECD do ano anterior já está pronta para você.' },
  { id: 'empresas_fiscal', nome: 'Robô de Empresas do Fiscal', intervaloMs: 10 * 60_000, faz: 'traz do Murade Fiscal as empresas que ainda não estão no Contábil, para a equipe não cadastrar duas vezes. Não altera o que já existe e não leva certificado nem senha.' },
  { id: 'conferidor_migracao_sistema_anterior', nome: 'Robô Conferidor da Migração do Sistema Anterior', intervaloMs: 6 * 60 * 60_000, faz: 'confere, de 6 em 6 horas e só em leitura, cada empresa que veio do sistema anterior: o balancete conta por conta e mês a mês, e campo a campo (cadastro, contas, históricos, lançamentos, bens), mostrando o que ficou vazio ou diferente.' },
  { id: 'empresas_excluidas', nome: 'Robô Conferidor de Empresas Excluídas', intervaloMs: 60 * 60_000, soDono: true, faz: 'confere, só em leitura, se alguma empresa excluída no Fiscal ainda sobrou aqui no Contábil e avisa o dono. Ele nunca apaga nada sozinho: a exclusão é uma empresa por vez, com a sua confirmação.' },
  { id: 'acessos', nome: 'Robô Conferidor de Acessos', intervaloMs: 60 * 60_000, soDono: true, faz: 'confere se contas e escritórios excluídos ou bloqueados não deixaram acesso nem sessão aberta, mantendo os e-mails livres para novo cadastro.' },
  { id: 'seguranca_login', nome: 'Robô Conferidor de Segurança do Login', intervaloMs: 2 * 60 * 60_000, soDono: true, faz: 'confere, só em leitura, as últimas 24 horas do login e avisa quando algo foge do normal. Nunca bloqueia nem altera conta.' },
  { id: 'tarefas_equipe', nome: 'Robô de Tarefas da Equipe', intervaloMs: 15 * 60_000, faz: 'confere os pedidos feitos à equipe: refaz o aviso que não chegou, lembra quem não abriu o pedido em mais de 2 horas úteis e avisa quando o prazo vence. Nunca conclui nem apaga uma tarefa.' },
  { id: 'backups', nome: 'Robô de Backups Mensais', intervaloMs: 60 * 60_000, faz: 'confere se o seu escritório já tem o backup cifrado do mês, gera de novo sozinho quando falta ou falhou, e avisa por e-mail quando fica pronto. Fica só o backup do mês corrente.' },
  { id: 'backup_banco', nome: 'Robô de Backup do Banco', intervaloMs: 10 * 60_000, quando: 'todo dia, a partir das 3 horas da manhã', soDono: true, faz: 'faz o backup completo do banco, cifrado e fora do Render. Fica desligado até o dono configurar o destino.' },
  { id: 'piloto', nome: 'Robô Conferidor do Piloto Visível', intervaloMs: 24 * 60 * 60_000, soDono: true, faz: 'confere se cada tela, campo e botão que a Agente usa para mostrar e preencher na tela ainda existe no código.' },
  { id: 'servico_feito', nome: 'Robô Conferidor de Serviço Feito', intervaloMs: 15 * 60_000, faz: 'evita retrabalho entre quem trabalha na mesma empresa: libera os "estou fazendo" esquecidos depois de 15 minutos e apaga registros com mais de 120 dias.' },
  { id: 'meu_jeito', nome: 'Robô Conferidor do Meu Jeito', intervaloMs: 24 * 60 * 60_000, faz: 'confere se as regras que a Agente aprendeu de cada pessoa ainda existem no sistema (se não, pausa a regra e avisa na próxima abertura), se o nome pelo qual ela te chama está certo e igual em todo lugar, e limpa o que ficou velho. Nunca apaga o seu jeito.' },
  { id: 'apresentacao', nome: 'Robô Conferidor da Apresentação', intervaloMs: 24 * 60 * 60_000, soDono: true, faz: 'confere se esta apresentação ainda bate com o código e avisa o dono se algo novo ainda não tem bloco.' },
  { id: 'lancamentos_padrao', nome: 'Robô dos Lançamentos Padrão', intervaloMs: 60 * 60_000, faz: 'prepara todo mês os lançamentos padrão que você cadastrou, como aluguel e honorários, como pré-lançamento para você aprovar. Nunca prepara duas vezes o mesmo mês e nunca mexe em mês fechado.' },
  { id: 'livro_caixa', nome: 'Robô do Livro Caixa (Simples)', intervaloMs: 2 * 60 * 60_000, faz: 'confere as empresas do Simples no mês anterior: quem tem Diário e Razão está dispensado do Livro Caixa; sem lançamento no mês, ele emite sozinho o Livro Caixa sem movimento e avisa quando falta marcar as contas de caixa ou o saldo inicial.' },
  { id: 'encerramento', nome: 'Robô do Encerramento do Resultado', intervaloMs: 6 * 60 * 60_000, faz: 'confere se o resultado do ano anterior foi encerrado no sistema e se o encerramento ainda bate com as contas; quando janeiro a novembro estão fechados, prepara o encerramento para você aprovar.' },
  { id: 'conciliacao', nome: 'Robô da Conciliação Bancária', intervaloMs: 60 * 60_000, faz: 'olha o extrato guardado de cada empresa e sugere o lançamento que casa ou a conta pela regra do escritório. Só sugere: conciliar e lançar é sempre você.' },
  { id: 'servico_completo', nome: 'Robô Conferidor dos Serviços da Agente', intervaloMs: 2 * 60 * 60_000, faz: 'confere os serviços completos que eu fiz para você, como o fechamento do mês e a ECD: avisa o que ficou parado sem a sua confirmação do preparo, lembra o que espera a sua conferência há mais de 3 dias e dá como concluído o fechamento quando você fecha a competência. Confere também o cadastro do escritório feito no DP. Nunca aprova, fecha nem lança nada.' },
  { id: 'demonstracoes', nome: 'Robô Conferidor das Demonstrações', intervaloMs: 6 * 60 * 60_000, faz: 'confere as demonstrações do ano anterior de cada empresa: se a DFC fecha com o caixa, se a DMPL bate com o balanço, se falta classificar conta, se as notas explicativas existem e se a Parte B da ECF levou o saldo para o ano seguinte. Põe tudo no painel do escritório. Só lê; nunca altera nada.' },
  { id: 'revisor', nome: 'Robô do Revisor (revisão geral semanal)', intervaloMs: 6 * 60 * 60_000, quando: 'uma vez por semana', faz: 'revisa cada empresa no mês anterior (fechamento, lançamento repetido, Caixa com saldo credor, extrato sem conciliação, folha do DP sem partida) e põe o que achou em Corrigir, na tela Revisor. Antes de gravar, lançar pela conciliação ou fechar o mês, eu confiro e aviso o que falta ou está errado. Nunca aprovo nem fecho nada.' },
  { id: 'conferidor_escola', nome: 'Robô Conferidor da Escola Murade', intervaloMs: 6 * 60 * 60_000, faz: 'confere, só em leitura, se toda aula da Escola Murade tem fonte oficial e data, exemplo calculado pelo sistema e "Me mostra" que existe, e avisa o administrador do escritório quando alguém com trilha atribuída fica 7 dias sem estudar. A Escola é um adicional e nunca grava nos lançamentos nem nos livros.' },
];

export function falarIntervalo(ms: number | null): string {
  if (ms === null) return 'não roda sozinho';
  const min = Math.round(ms / 60_000);
  if (min <= 1) return 'roda a cada minuto';
  if (min === 60) return 'roda a cada hora';
  if (min === 24 * 60) return 'roda uma vez por dia';
  if (min % 60 === 0) return `roda a cada ${min / 60} horas`;
  return `roda a cada ${min} minutos`;
}

export type IntegracaoApresentacao = { id: string; titulo: string; falar: string; /** "METHOD /api/integracao/..." */ rotas: string[]; tela?: string; soDono?: boolean };
/** Toda rota /api/integracao/* do server.ts precisa estar em UMA destas listas (o teste confere nos dois sentidos). */
export const INTEGRACOES_APRESENTACAO: IntegracaoApresentacao[] = [
  {
    id: 'fiscal-notas', titulo: 'Do Fiscal: notas fiscais', tela: 'revisao-origens',
    falar: 'O Fiscal envia ao Contábil as notas fiscais e os XMLs autorizados de cada empresa, por uma fila autenticada que repete se falhar. O Contábil só guarda e usa para preparar rascunhos; quem consulta a SEFAZ é o Fiscal, o Contábil não.',
    rotas: ['POST /api/integracao/fiscal/documentos', 'GET /api/integracao/fiscal/documentos', 'GET /api/integracao/fiscal/documentos/versoes'],
  },
  {
    id: 'fiscal-apuracoes', titulo: 'Do Fiscal: apurações de tributo', tela: 'revisao-origens',
    falar: 'O Fiscal também envia as apurações de tributo que a contadora já confirmou, como o DIFAL do ICMS, o IRPJ, a CSLL, o PIS e a COFINS do Lucro Presumido e o DAS do Simples (provisão e pagamento). O Contábil grava por empresa, tributo e competência e prepara os pré-lançamentos para você aprovar.',
    rotas: ['POST /api/integracao/fiscal/apuracoes', 'GET /api/integracao/fiscal/apuracoes'],
  },
  {
    id: 'empresa-excluida', titulo: 'Exclusão de empresa entre os sistemas',
    falar: 'Quando uma empresa é excluída em um sistema Murade, a exclusão chega aos outros por uma rota autenticada, uma empresa por vez. No Contábil sai o acesso de todos os usuários, o cadastro compartilhado, a área de trabalho e o registro de atividade da empresa. Fechamentos de período, trilhas de auditoria e uma cópia da escrituração ficam guardados, e o CNPJ continua livre para cadastrar de novo.',
    rotas: ['DELETE /api/integracao/empresa/:cnpj'],
  },
  {
    id: 'dp-folha', titulo: 'Do DP: folha de pagamento', tela: 'revisao-origens',
    falar: 'O DP calcula a folha e manda ao Contábil só os totais da competência, sem nomes, CPF nem dados bancários. Com o mapeamento de contas revisado, o Contábil monta a prévia dos lançamentos da folha para você conferir.',
    rotas: ['POST /api/integracao/dp/folhas', 'GET /api/integracao/dp/folhas'],
  },
  {
    id: 'dp-prolabore', titulo: 'Do DP: pró-labore', tela: 'revisao-origens',
    falar: 'O pró-labore dos sócios, com o INSS e o IRRF retidos, chega do DP e vira rascunho de lançamento. Ele não é lançado sozinho: só vira lançamento definitivo quando você aprova, e só se o mapeamento de contas da empresa estiver revisado.',
    rotas: ['POST /api/integracao/dp/prolabore'],
  },
  {
    id: 'dp-eventos', titulo: 'Do DP: eventos como férias e rescisão', tela: 'revisao-origens',
    falar: 'O DP também envia eventos calculados, como férias e rescisão com a multa do FGTS. Entram como rascunhos para você conferir, nos casos que as regras atuais cobrem; o que não tem regra confiável fica como pendência.',
    rotas: ['POST /api/integracao/dp/eventos', 'GET /api/integracao/dp/eventos'],
  },
  {
    id: 'status', titulo: 'Estado das integrações', tela: 'integracao',
    falar: 'Na tela Integrações você vê o estado real do recebimento do Fiscal e do DP, e pode pedir para reprocessar a recepção de uma empresa. O Contábil nunca diz que está atualizado quando a origem falhou.',
    rotas: ['GET /api/integracao/status', 'GET /api/integracao/fiscal/status', 'GET /api/integracao/dp/status'],
  },
  {
    id: 'agentes', titulo: 'Conversa entre as Agentes', tela: 'inicio',
    falar: 'A Agente do Contábil conversa com as Agentes do Fiscal, do DP e do Fisco IA: pergunta, faz pedidos e responde pedidos. Isso é conversa entre Agentes; não leva dados do Fisco IA para dentro do Contábil.',
    rotas: ['POST /api/integracao/agente/mensagem'],
  },
  {
    id: 'conexoes-nao-configuradas', titulo: 'Conexões diretas ainda não configuradas', tela: 'conexoes',
    falar: 'Os botões antigos de conexão direta com o Fiscal e com o DP ainda não estão configurados e respondem que nada foi sincronizado. O que funciona de verdade é o recebimento pelas filas autenticadas, que eu acabei de contar.',
    rotas: ['GET /api/integracao/fiscal/empresas', 'GET /api/integracao/fiscal/empresa-ativa', 'POST /api/integracao/fiscal/conectar', 'GET /api/integracao/dp/dados', 'POST /api/integracao/dp/conectar', 'POST /api/integracao/empresas'],
  },
];
/** Sistemas com quem as Agentes conversam: precisam ser os de SISTEMAS (agentesEntreSistemas.ts), menos o próprio Contábil. */
export const SISTEMAS_QUE_CONVERSAM = ['dp', 'fiscal', 'fiscoia'];

type Fixo = { id: string; titulo: string; falar: string; tela?: string; soDono?: boolean };
export const ABERTURA: Fixo[] = [
  { id: 'abertura', titulo: 'Começando', falar: 'Vou contar em blocos curtos o que o Murade Contábil faz: os módulos, o que é automático, o que depende de você, o que é integrado e o que ele ainda não faz. A qualquer momento você pode dizer para, continua ou pula esse bloco.' },
];
export const DEPENDE_DO_CONTADOR: Fixo[] = [
  { id: 'depende-aprovar', titulo: 'Aprovar lançamentos', tela: 'aprovacoes', falar: 'Lançamento manual só entra nos livros depois de aprovado por uma pessoa, e a rejeição pede o motivo, que fica no histórico.' },
  { id: 'depende-contabilizar', titulo: 'Contabilizar os rascunhos', tela: 'revisao-origens', falar: 'Os pré-lançamentos que vêm do Fiscal e do DP só viram lançamento definitivo quando você contabiliza. O servidor revisa cada um com os dados atuais e recusa o que não bater.' },
  { id: 'depende-mapeamento', titulo: 'Mapear as contas', tela: 'revisao-origens', falar: 'Para os rascunhos saírem, você revisa o mapeamento de contas de cada empresa. Sem mapeamento revisado, nada é lançado.' },
  { id: 'depende-fechar', titulo: 'Fechar o período', tela: 'gestao-contabil', falar: 'Fechar a competência é você que decide, e não dá para desfazer. O sistema recusa se houver pendências.' },
  { id: 'depende-cartao', titulo: 'Ações da Agente', falar: 'Tudo o que eu proponho e altera dados vira um cartão na tela, e só vale depois do seu sim. Quando o pedido é para excluir ou remover algo, o cartão pede duas confirmações: Continuar e, depois, Sim, excluir. Eu nunca digo que fiz antes de você confirmar.' },
  { id: 'depende-exclusao', titulo: 'Excluir com segurança', falar: 'Em todo o sistema, excluir ou remover qualquer coisa pede duas confirmações: primeiro eu mostro o que será excluído e o que acontece; depois vem a última confirmação, com o botão vermelho Sim, excluir. Cancelar, Esc ou tocar fora desistem. Excluir empresa ou usuário não trava o CNPJ nem o e-mail. Nada apaga tudo de uma vez.' },
  { id: 'depende-servico-completo', titulo: 'Serviço completo pela Agente', tela: 'aprovacoes', falar: 'Com o adicional Consultor Murade completo, peça "fecha o mês da empresa X", "faz a ECD", "encerra o resultado" ou "balancete para o cliente": eu faço o serviço inteiro com a tela aberta, e você pode seguir usando o sistema que eu continuo em segundo plano. Deixo tudo pendente de aprovação e aviso quando está em A conferir. Aprovar e fechar é seu clique; se decidir diferente da norma, explico e faço do seu jeito.' },
  { id: 'depende-ecd', titulo: 'ECD e ECF', tela: 'livros', falar: 'O Murade monta os arquivos da ECD e da ECF e confere antes; a validação, a assinatura e a transmissão são suas, no programa da Receita. Ele não transmite SPED, ECD nem ECF.' },
  { id: 'depende-cadastro-escritorio', titulo: 'Cadastro do escritório', falar: 'O cadastro do escritório, com o CNPJ, os dados, o certificado do escritório e a lista das procurações de cada empresa, é feito uma vez no DP e vale para todos os sistemas. O CNPJ chega aqui sozinho, sem trocar o que você digitou. Pergunte qual a situação do cadastro do escritório.' },
  { id: 'depende-opcoes', titulo: 'O que você liga e desliga', falar: 'Você pode ligar o código de segurança do login, ligar ou desligar a minha voz e a chamada por voz, e no Meu jeito escolher como eu te chamo e como eu trabalho com você, uma regra por vez.' },
];
export const LIMITES: Fixo[] = [
  { id: 'limite-orgaos', titulo: 'O que não faz: órgãos', falar: 'O Contábil não consulta a SEFAZ e não transmite SPED, ECD nem ECF. Receber notas é com o Fiscal, e a folha é calculada no DP.' },
  { id: 'limite-rascunhos', titulo: 'O que não faz: rascunhos', falar: 'Os rascunhos automáticos cobrem só os casos das regras atuais. Classificação sem regra confiável fica pendente, e eu não invento valor.' },
  { id: 'limite-gerencial', titulo: 'O que não faz: relatórios', falar: 'Diário, Razão, Balancete, DRE e Balanço são relatórios internos gerenciais, com numeração interna; não são os livros oficiais. A DRE e o Balanço classificam as contas pela descrição, então confira o plano de contas.' },
  { id: 'limite-robos', titulo: 'O que não faz: horários dos robôs', falar: 'Os robôs rodam em temporizadores do próprio servidor. Se a hospedagem suspender o sistema, eles pausam até ele voltar, e eu não afirmo que está atualizado quando uma origem falhou.' },
  { id: 'limite-fiscoia', titulo: 'O que não é integrado', falar: 'O Fisco IA conversa com a minha Agente, mas não manda dados para o Contábil. As consultas pagas ao SERPRO nunca são feitas por robô: só quando uma pessoa clica.' },
];
export const LEMBRETE_PROCURACOES: Fixo = { id: 'lembrete-procuracoes', titulo: 'Procurações', falar: 'Para o sistema trabalhar sozinho, o contador precisa ter a procuração eletrônica de todas as empresas: e-CAC, eSocial e FGTS Digital. No cadastro do escritório tem a lista do que falta e o passo a passo.' };
export const ENCERRAMENTO: Fixo = { id: 'fim', titulo: 'Fim', falar: 'Era isso. Quando quiser ouvir de novo, é só pedir: o que o sistema faz, o que é automático ou o que é integrado. E se quiser que eu te mostre onde fica algo, é só dizer.' };

/** A apresentação completa, em ordem. `ehDono` filtra o que é só do dono do sistema. */
export function montarApresentacao(ehDono = false): BlocoApresentacao[] {
  const b: BlocoApresentacao[] = [];
  for (const a of ABERTURA) b.push({ ...a, secao: 'abertura' });
  for (const m of MODULOS_JEITO_PADRAO) b.push({ id: `modulo-${m.id}`, secao: 'modulos', titulo: m.rotulo, falar: `${m.rotulo}. ${m.resumo}`, tela: m.id });
  for (const r of ROBOS_APRESENTACAO) b.push({ id: `robo-${r.id}`, secao: 'automatico', titulo: r.nome, tela: 'agente', soDono: r.soDono, falar: `${r.nome}: ${r.quando ?? falarIntervalo(r.intervaloMs)}. ${r.faz.charAt(0).toUpperCase()}${r.faz.slice(1)}` });
  for (const d of DEPENDE_DO_CONTADOR) b.push({ ...d, secao: 'depende' });
  for (const i of INTEGRACOES_APRESENTACAO) b.push({ id: `integracao-${i.id}`, secao: 'integracoes', titulo: i.titulo, falar: i.falar, tela: i.tela, soDono: i.soDono });
  for (const l of LIMITES) b.push({ ...l, secao: 'limites' });
  b.push({ ...LEMBRETE_PROCURACOES, secao: 'limites' });
  b.push({ ...ENCERRAMENTO, secao: 'limites' });
  return b.filter((x) => ehDono || !x.soDono);
}

/** Blocos pedidos por assunto ("o que é automático?", "o que é integrado?", ou um módulo). */
export function blocosDoAssunto(assunto: { secao?: SecaoApresentacao; modulo?: string }, ehDono = false): BlocoApresentacao[] {
  const todos = montarApresentacao(ehDono);
  if (assunto.modulo) return todos.filter((b) => b.secao === 'modulos' && b.tela === assunto.modulo);
  if (assunto.secao) return todos.filter((b) => b.secao === assunto.secao);
  return todos;
}

/** A pergunta única da oferta (depois das boas-vindas). */
export const PERGUNTA_APRESENTACAO = 'Quer que eu te conte tudo o que o Contábil faz?';
