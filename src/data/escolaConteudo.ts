// ESCOLA MURADE (Murade Contábil) — trilhas, aulas, perguntas e o glossário "O que é isso?".
// Arquivo PURO: o navegador mostra, o servidor confere (Robô Conferidor da Escola) e a Agente usa.
//
// Regras deste arquivo (conferidas por scripts/testes/escola.test.ts e pelo Robô Conferidor da Escola):
//  - Regra de lei SÓ com fonte oficial (Planalto, Câmara, Receita/SPED, CFC) e a data em que foi conferida. As aulas de
//    "Primeiros passos" explicam o próprio sistema: a fonte delas é o mapa de telas do Murade Contábil.
//  - Números de exemplo NUNCA são escritos aqui: cada aula aponta para um exemplo que o SERVIDOR calcula com o motor do sistema
//    (livrosContabeis.ts, analiseContabil.ts, extratoBancario.ts, fechamentoContabil.ts, imobilizado.ts, livroCaixa.ts,
//    escrituracaoAvancada.ts, demonstracoesExtras.ts, ecdService.ts).
//  - "Me mostra no sistema" aponta para uma tela que existe no mapa (src/data/mapaTelasContabil.ts): só mostra, não grava.
//  - 3 a 5 perguntas por aula, cada uma com a explicação para quando a pessoa errar.
//  - Nunca escrever o nome do sistema concorrente (o texto visível diz "sistema anterior").
import { buscarAulaEm, buscarNoGlossario, normalizarEscola, q, type AulaEscola, type FonteAula, type TermoGlossario, type TrilhaEscola } from './escolaNucleo';

export * from './escolaNucleo';

export const SISTEMA_ESCOLA = 'Murad Contábil';
export const DATA_CONFERENCIA = '2026-11-20';

// ---------------------------------------------------------------- fontes oficiais (uma vez só, reaproveitadas)
const lei = (nome: string, url: string): FonteAula => ({ nome, url, tipo: 'lei' });
const manual = (nome: string, url: string): FonteAula => ({ nome, url, tipo: 'manual_oficial' });
const F = {
  cc: lei('Código Civil — Lei nº 10.406/2002, arts. 1.179 a 1.189 (escrituração; Planalto)', 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm'),
  lei6404: lei('Lei nº 6.404/1976 — Sociedades por Ações, demonstrações financeiras (Planalto)', 'https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm'),
  lc123: lei('Lei Complementar nº 123/2006 — Simples Nacional (Planalto)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm'),
  lei4506: lei('Lei nº 4.506/1964 — imposto de renda, depreciação (Planalto)', 'https://www.planalto.gov.br/ccivil_03/leis/l4506.htm'),
  lei8981: lei('Lei nº 8.981/1995 — Lucro Presumido e livro caixa (Planalto)', 'https://www.planalto.gov.br/ccivil_03/leis/l8981.htm'),
  dec6022: lei('Decreto nº 6.022/2007 — institui o SPED (Planalto)', 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6022.htm'),
  cfc: { nome: 'Conselho Federal de Contabilidade — obrigatoriedade da escrituração contábil e ITG 2000 (R1)', url: 'https://cfc.org.br/tecnica/perguntas-frequentes/obrigatoriedade-de-escrituracao-contabil/', tipo: 'norma' } as FonteAula,
  sped: manual('Portal do SPED (Receita Federal) — ECD e ECF, manuais e prazos', 'https://sped.rfb.gov.br/'),
  sistema: { nome: 'Mapa de telas do Murad Contábil (o próprio sistema)', url: 'murade:mapaTelasContabil', tipo: 'sistema' } as FonteAula,
};

/** Domínios aceitos como fonte oficial (o robô da Escola recusa qualquer outro). */
export const DOMINIOS_OFICIAIS = ['planalto.gov.br', 'www.planalto.gov.br', 'www2.camara.leg.br', 'legis.senado.leg.br', 'www.gov.br', 'gov.br', 'sped.rfb.gov.br', 'www8.receita.fazenda.gov.br', 'cfc.org.br'];

export const TRILHAS: TrilhaEscola[] = [
  { id: 'primeiros-passos', titulo: 'Primeiros passos no Murad Contábil', resumo: 'Empresa ativa, menu, robôs, aprovação e a Agente por voz.', icone: '🚀' },
  { id: 'plano-partidas', titulo: 'Plano de contas e partidas dobradas', resumo: 'Grupos do plano, contas sintéticas e analíticas, débito e crédito.', icone: '🗂️' },
  { id: 'lancamentos', titulo: 'Lançamentos', resumo: 'Os que vêm do Fiscal e do DP, os manuais e os recorrentes.', icone: '✍️' },
  { id: 'conciliacao', titulo: 'Conciliação bancária', resumo: 'Extrato do banco x razão da conta: o que casa e o que falta.', icone: '🏦' },
  { id: 'fechamento', titulo: 'Fechamento do mês', resumo: 'O que conferir antes de fechar e a depreciação do imobilizado.', icone: '🔒' },
  { id: 'demonstracoes', titulo: 'Balancete, DRE e Balanço', resumo: 'Balancete de verificação, resultado do período e balanço patrimonial.', icone: '📑' },
  { id: 'livro-caixa', titulo: 'Livro Caixa do Simples', resumo: 'Quem precisa, o que entra e quando a escrituração completa dispensa.', icone: '📒' },
  { id: 'ecd-ecf', titulo: 'ECD e ECF', resumo: 'A escrituração contábil digital e a escrituração fiscal no SPED.', icone: '💾' },
  { id: 'encerramento', titulo: 'Encerramento do exercício', resumo: 'Zerar as contas de resultado e levar o lucro ou prejuízo ao PL.', icone: '🏁' },
];

export const AULAS: AulaEscola[] = [
  // ======================================================== PRIMEIROS PASSOS (o próprio sistema)
  { id: 'como-funciona', trilha: 'primeiros-passos', titulo: 'Como o Murad Contábil funciona',
    oQueE: 'O Murad Contábil faz a escrituração das empresas do escritório: plano de contas, lançamentos, conciliação, fechamento, balancete, livros, ECD e ECF. Quase toda tela trabalha com a EMPRESA ativa, escolhida no cabeçalho.',
    porQue: 'Cada empresa tem o próprio plano, lançamentos e fechamento. Conferir a empresa antes de lançar evita lançar no cliente errado.',
    regras: ['O menu da esquerda leva a cada tela; no celular ele abre pelo botão do menu.', 'Em Cadastro de Empresa você cadastra e escolhe as empresas; as que já estão no Murad Fiscal são trazidas pelo robô.', 'Nada é apagado de uma vez: excluir é um item por vez, em duas etapas.'],
    fontes: [F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'empresa', legenda: 'Aqui ficam as empresas. Escolha a empresa antes de lançar.' }, pratica: null,
    perguntas: [
      q('Antes de lançar, o que precisa estar certo?', ['A cor do menu', 'A empresa ativa', 'O tamanho da tela'], 1, 'As telas mostram os dados da empresa ativa. Confira sempre antes de lançar.'),
      q('As empresas que já estão no Murad Fiscal:', ['Precisam ser digitadas de novo', 'São trazidas pelo robô', 'Não podem ser usadas'], 1, 'O Robô de Empresas do Fiscal traz as empresas que ainda não estão no Contábil.'),
      q('Como funciona excluir algo no sistema?', ['Um botão apaga tudo', 'Um item por vez, em duas etapas', 'Só o robô apaga'], 1, 'Para ninguém errar, excluir é um item por vez e pede duas confirmações.'),
    ] },
  { id: 'robos-aprovar', trilha: 'primeiros-passos', titulo: 'Os robôs e a tela "Aprovar lançamentos"',
    oQueE: 'O Robô Reconciliador traz do Fiscal e do DP os dados novos e prepara pré-lançamentos. Lançamento manual e rascunho só viram definitivos depois de uma pessoa aprovar, na tela "Aprovar lançamentos". O Revisor revisa cada empresa no mês e lista o que corrigir.',
    porQue: 'O robô adianta o trabalho, mas quem responde pela escrituração é o contador. Por isso nada entra nos livros sem a aprovação de uma pessoa.',
    regras: ['O Robô Contabilizador não roda sozinho, de propósito: definitivo só depois da aprovação.', 'Em "Aprovar lançamentos" ficam os lançamentos manuais e os serviços que a Agente preparou para você conferir.', 'O Revisor nunca aprova nem fecha nada: ele confere e aponta.'],
    fontes: [F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'aprovacoes', legenda: 'Esta é a tela Aprovar lançamentos: o que espera o seu OK.' }, pratica: null,
    perguntas: [
      q('Um lançamento manual entra nos livros:', ['Na hora em que é digitado', 'Depois de aprovado', 'Nunca'], 1, 'Os manuais só entram nos livros depois de aprovados.'),
      q('Quem traz os dados do Fiscal e do DP?', ['O Robô Reconciliador', 'O cliente por e-mail', 'Ninguém'], 0, 'O Reconciliador traz os dados novos e prepara pré-lançamentos para conferência.'),
      q('O Revisor fecha o mês sozinho?', ['Sim', 'Não: ele confere e aponta', 'Só em dezembro'], 1, 'O Revisor nunca aprova nem fecha nada.'),
    ] },
  { id: 'agente-voz', trilha: 'primeiros-passos', titulo: 'A Agente IA por voz',
    oQueE: 'A Agente IA é a assistente do sistema. Fale ou digite: "onde fica o balancete?", "me mostra como lançar", "me explica partidas dobradas". Ela responde, abre a tela e mostra com a seta onde clicar.',
    porQue: 'Para o iniciante não ficar travado: em vez de procurar, pergunte. A Agente também prepara serviços inteiros, sempre com um cartão para você confirmar.',
    regras: ['Tudo que a Agente altera passa por um cartão: só acontece depois do seu "Confirmar".', 'Para parar o que ela está mostrando, diga "para" ou "cancela", ou toque na tela.', 'Peça "me explica X" para ouvir o termo do glossário desta Escola.'],
    fontes: [F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'inicio', legenda: 'Na Tela Inicial ficam os atalhos; a Agente fica no botão do canto da tela.' }, pratica: null,
    perguntas: [
      q('A Agente quer lançar algo por você. O que acontece?', ['Lança na hora', 'Mostra um cartão e só faz depois do seu "Confirmar"', 'Manda para a Receita'], 1, 'Toda alteração feita pela Agente passa por um cartão de confirmação.'),
      q('Você não sabe o que é DRE. O que pode pedir?', ['"Me explica o que é DRE"', 'Nada', '"Apaga a DRE"'], 0, 'A Agente usa o glossário da Escola para explicar, com a fonte.'),
      q('Como interromper o piloto da Agente?', ['Desligar o computador', 'Dizer "para" ou tocar na tela', 'Não dá'], 1, 'Toque na tela ou diga "para"/"cancela": o piloto pausa e entrega o controle.'),
    ] },

  // ======================================================== PLANO DE CONTAS E PARTIDAS DOBRADAS
  { id: 'plano-de-contas', trilha: 'plano-partidas', titulo: 'Plano de contas: grupos, sintéticas e analíticas',
    oQueE: 'O plano de contas é a lista organizada das contas da empresa: Ativo (bens e direitos), Passivo (obrigações), Patrimônio Líquido, Receitas e Despesas. As contas SINTÉTICAS só agrupam; os lançamentos vão sempre nas contas ANALÍTICAS, o último nível.',
    porQue: 'É o plano que dá forma ao balanço e à DRE. Conta criada no grupo errado faz o balanço mostrar a coisa errada.',
    regras: ['No balanço, o ativo se divide em circulante e não circulante; o passivo, em circulante, não circulante e patrimônio líquido (Lei nº 6.404/1976, art. 178, §§ 1º e 2º).', 'Lançamento só em conta analítica: o sistema recusa débito ou crédito em conta sintética.', 'Cada conta tem natureza devedora (D) ou credora (C): o ativo e as despesas aumentam a débito; passivo, PL e receitas, a crédito.'],
    fontes: [F.lei6404, F.cfc], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'plano-contas', alvo: '#btn-nova-conta', legenda: 'No Plano de Contas, o botão "+ Nova Conta na Sequência" cria a conta já no lugar certo.' }, pratica: null,
    perguntas: [
      q('Em qual conta se lança?', ['Na sintética', 'Na analítica (último nível)', 'Em qualquer uma'], 1, 'As sintéticas só agrupam; o lançamento vai na analítica.'),
      q('Natureza de uma conta de receita:', ['Devedora', 'Credora', 'Não tem'], 1, 'Receita aumenta a crédito: natureza credora.'),
      q('O passivo se divide em:', ['Circulante, não circulante e patrimônio líquido', 'Só circulante', 'Receitas e despesas'], 0, 'Lei 6.404/1976, art. 178, § 2º.'),
    ] },
  { id: 'partidas-dobradas', trilha: 'plano-partidas', titulo: 'Partidas dobradas: débito e crédito',
    oQueE: 'Todo lançamento tem pelo menos uma conta a DÉBITO e uma a CRÉDITO, com o mesmo valor. Na venda à vista, por exemplo, o Caixa (ativo) é debitado e a Receita é creditada.',
    porQue: 'É o que garante que a contabilidade fecha: a soma dos débitos é sempre igual à soma dos créditos, e o balancete confere.',
    regras: ['A escrituração é feita em forma contábil, em ordem cronológica e sem rasuras (Código Civil, art. 1.183), com base em documento (art. 1.184).', 'A ITG 2000 (R1), do Conselho Federal de Contabilidade, vale para todas as entidades, de qualquer porte (CFC).', 'No sistema, débito e crédito na mesma conta, valor zero ou histórico vazio tornam o lançamento inválido.'],
    fontes: [F.cc, F.cfc], conferidoEm: DATA_CONFERENCIA, exemplo: 'partida-dobrada',
    meMostra: { tela: 'lancamentos', alvo: '#btn-novo-lancamento', legenda: 'Em Lançamentos, o botão "+ Lançamento Manual" abre o débito, o crédito, o valor e o histórico.' }, pratica: 'lancamento',
    perguntas: [
      q('Venda à vista: o Caixa vai a:', ['Débito', 'Crédito', 'Nenhum dos dois'], 0, 'Entrou dinheiro: o Caixa (ativo) aumenta a débito; a receita vai a crédito.'),
      q('Soma dos débitos x soma dos créditos:', ['Sempre iguais', 'Débitos sempre maiores', 'Tanto faz'], 0, 'Partidas dobradas: o débito é igual ao crédito em todo lançamento.'),
      q('Pode lançar débito e crédito na mesma conta?', ['Sim', 'Não', 'Só no fim do mês'], 1, 'Débito e crédito na mesma conta não movimenta nada e o sistema recusa.'),
      q('O lançamento precisa de documento?', ['Não', 'Sim: o lançamento se baseia no documento', 'Só se o cliente quiser'], 1, 'Código Civil, art. 1.184: individuação, clareza e caracterização do documento.'),
    ] },

  // ======================================================== LANÇAMENTOS
  { id: 'lancamentos-integrados', trilha: 'lancamentos', titulo: 'Lançamentos que vêm do Fiscal e do DP',
    oQueE: 'As notas do Murad Fiscal (entradas, saídas, impostos) e a folha do Murad DP (salários, INSS, FGTS, IRRF) chegam ao Contábil como pré-lançamentos, já com as contas pelo mapeamento do escritório. Você revisa e aprova.',
    porQue: 'Evita redigitar: o que já foi feito no Fiscal e no DP vira contabilidade, no mês certo (regime de competência).',
    regras: ['As mutações patrimoniais são registradas pelo regime de competência (Lei nº 6.404/1976, art. 177).', 'A escrituração tem de corresponder à documentação (Código Civil, art. 1.179).', 'No sistema, o rascunho do Fiscal e do DP fica em "Revisar dados recebidos" até você conferir; o mês não fecha com rascunho pendente.'],
    fontes: [F.lei6404, F.cc, F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'revisao-origens', alvo: 'texto:Prévia contábil das notas', legenda: 'Em "Revisar dados recebidos" ficam as prévias das notas e da folha para você conferir.' }, pratica: null,
    perguntas: [
      q('A folha de outubro paga em novembro é contabilizada em:', ['Outubro (competência)', 'Novembro', 'Dezembro'], 0, 'Regime de competência (Lei 6.404, art. 177): no mês a que se refere.'),
      q('Os dados do Fiscal e do DP entram nos livros:', ['Sozinhos, sem conferência', 'Depois de revisados e aprovados', 'Nunca'], 1, 'Chegam como pré-lançamentos e você confere antes.'),
      q('O mês fecha com rascunho do DP pendente?', ['Sim', 'Não', 'Só se for pequeno'], 1, 'O fechamento guiado bloqueia enquanto há rascunho pendente.'),
    ] },
  { id: 'lancamento-manual', trilha: 'lancamentos', titulo: 'Lançamento manual e estorno',
    oQueE: 'Lançamento manual é o que você digita: data, valor, conta a débito, conta a crédito e histórico. Lançamento errado não se apaga nem se rasura: corrige-se com um ESTORNO (lançamento inverso) e, se for o caso, um lançamento novo.',
    porQue: 'A escrituração não pode ter rasura nem emenda. O estorno deixa o caminho da correção registrado.',
    regras: ['Escrituração sem borrões, rasuras, emendas ou transportes para as margens (Código Civil, art. 1.183).', 'Lançamentos com individuação, clareza e caracterização do documento (Código Civil, art. 1.184).', 'No sistema, o manual fica "pendente de aprovação" e só entra nos livros depois de aprovado.'],
    fontes: [F.cc, F.cfc], conferidoEm: DATA_CONFERENCIA, exemplo: 'partida-dobrada',
    meMostra: { tela: 'lancamentos', alvo: '#btn-novo-lancamento', legenda: 'Clique aqui para abrir o lançamento manual.' }, pratica: 'lancamento',
    perguntas: [
      q('Lançou na conta errada. O certo é:', ['Apagar o lançamento', 'Estornar e lançar de novo', 'Rasurar'], 1, 'Corrige-se com estorno: a escrituração não pode ter rasura (CC, art. 1.183).'),
      q('O histórico do lançamento serve para:', ['Nada', 'Explicar a operação e o documento', 'Enfeitar'], 1, 'CC, art. 1.184: individuação e clareza, com o documento.'),
      q('O lançamento manual entra nos livros quando?', ['Na hora', 'Depois de aprovado', 'No fim do ano'], 1, 'Fica pendente de aprovação até alguém aprovar.'),
    ] },
  { id: 'recorrentes', trilha: 'lancamentos', titulo: 'Lançamentos recorrentes (padrão)',
    oQueE: 'Lançamento padrão é o que se repete todo mês com as mesmas contas, como aluguel e honorários. Você cadastra uma vez, com o dia do mês, e o robô prepara a cada mês como pendente para você aprovar.',
    porQue: 'Poupa tempo e evita esquecer um lançamento fixo. Como fica pendente, você ainda confere o valor do mês.',
    regras: ['Mesmo recorrente, o lançamento precisa corresponder ao documento do mês (Código Civil, art. 1.179).', 'O Robô dos Lançamentos Padrão prepara o mês sem duplicar e nunca aprova sozinho.', 'Histórico padrão pode usar a competência no texto, e o sistema troca pelo mês certo.'],
    fontes: [F.cc, F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'lancamentos', alvo: 'texto:Lançamentos padrão', legenda: 'No quadro "Lançamentos padrão" você cadastra os lançamentos que se repetem.' }, pratica: null,
    perguntas: [
      q('O robô aprova o lançamento padrão sozinho?', ['Sim', 'Não: deixa pendente para você aprovar', 'Só em janeiro'], 1, 'Ele prepara como pendente; aprovar é com você.'),
      q('Um bom exemplo de lançamento padrão:', ['Aluguel mensal', 'Venda de um imóvel', 'Multa única'], 0, 'O que se repete todo mês com as mesmas contas.'),
      q('Recorrente dispensa o documento do mês?', ['Sim', 'Não', 'Às vezes'], 1, 'CC, art. 1.179: a escrituração corresponde à documentação.'),
    ] },

  // ======================================================== CONCILIAÇÃO BANCÁRIA
  { id: 'conciliacao', trilha: 'conciliacao', titulo: 'Conciliação bancária: extrato x razão',
    oQueE: 'Conciliar é comparar o extrato do banco com o razão da conta Banco na contabilidade: cada movimento do extrato tem de ter um lançamento de mesmo valor e sentido. O que sobra de um lado ou do outro é o que precisa ser lançado ou corrigido.',
    porQue: 'Saldo de banco que não bate com o extrato é sinal de lançamento faltando, duplicado ou errado. E o fechamento do mês pede o banco conciliado.',
    regras: ['A escrituração tem de corresponder à documentação — o extrato é o documento do banco (Código Civil, art. 1.179).', 'A ME e a EPP do Simples mantêm escriturada a movimentação financeira e bancária (LC nº 123/2006, art. 26, § 2º).', 'No sistema, o extrato (OFX, CSV ou planilha) casa por valor e sentido: mesma data = "exata"; até 3 dias = "provável", que você confirma.'],
    fontes: [F.cc, F.lc123], conferidoEm: DATA_CONFERENCIA, exemplo: 'conciliacao',
    meMostra: { tela: 'gestao-contabil', alvo: '[data-campo=gestao-aba-extrato]', legenda: 'Na Gestão contábil, a aba "Extrato e conciliação" importa o extrato e mostra o que casa.' }, pratica: null,
    perguntas: [
      q('Um depósito no extrato sem lançamento correspondente indica:', ['Que está tudo certo', 'Lançamento faltando na contabilidade', 'Erro do banco sempre'], 1, 'Movimento sem lançamento: falta lançar (ou o lançamento está com valor/data diferente).'),
      q('Entrada no extrato casa com lançamento:', ['A débito no Banco', 'A crédito no Banco', 'Em qualquer conta'], 0, 'Entrou dinheiro: o Banco (ativo) é debitado.'),
      q('Um casamento "provável" deve ser:', ['Ignorado', 'Confirmado por você', 'Apagado'], 1, 'Datas diferentes até 3 dias: o sistema sugere e você confirma.'),
    ] },

  // ======================================================== FECHAMENTO DO MÊS
  { id: 'fechamento-mes', trilha: 'fechamento', titulo: 'O fechamento guiado do mês',
    oQueE: 'Fechar o mês é conferir que a contabilidade da competência está completa e certa e travar o mês contra mudança. O fechamento guiado mostra cada ponto: há lançamentos válidos, débitos e créditos fecham, nada pendente de aprovação, rascunhos do Fiscal e do DP conferidos, depreciação lançada e as confirmações do banco, contas a pagar e receber, folha e impostos.',
    porQue: 'Mês aberto vira bagunça: um lançamento a mais muda balancete e livro já entregues. Fechar no ponto certo dá segurança.',
    regras: ['Registro pelo regime de competência (Lei nº 6.404/1976, art. 177).', 'Os lançamentos do mês, dia a dia, com o documento (Código Civil, art. 1.184).', 'No sistema, o mês só fecha com todos os itens que bloqueiam conferidos; mês fechado não recebe lançamento.'],
    fontes: [F.lei6404, F.cc, F.sistema], conferidoEm: DATA_CONFERENCIA, exemplo: 'fechamento',
    meMostra: { tela: 'gestao-contabil', alvo: '[data-campo=gestao-aba-fechamento]', legenda: 'Na Gestão contábil, a aba "Fechamento guiado" mostra o que falta para fechar.' }, pratica: null,
    perguntas: [
      q('Pode fechar o mês com lançamento pendente de aprovação?', ['Sim', 'Não', 'Só se for de pouco valor'], 1, 'O fechamento guiado bloqueia enquanto há pendente de aprovação.'),
      q('Depois de fechado, o mês:', ['Recebe qualquer lançamento', 'Fica travado para mudanças', 'Some do sistema'], 1, 'Mês fechado não recebe lançamento.'),
      q('Qual destes é confirmação manual no fechamento?', ['Banco conciliado', 'Débitos = créditos', 'Lançamento inválido'], 0, 'O banco conciliado você confirma; débito = crédito o sistema confere sozinho.'),
    ] },
  { id: 'depreciacao', trilha: 'fechamento', titulo: 'Depreciação do imobilizado',
    oQueE: 'Depreciação é a perda de valor dos bens do imobilizado (móveis, máquinas, veículos) pelo uso e pelo tempo. Todo mês, uma parte do custo vai para a despesa de depreciação e se acumula numa conta redutora do ativo.',
    porQue: 'Sem depreciação, o balanço mostra o bem pelo custo de compra para sempre e o resultado do mês fica maior do que é.',
    regras: ['A diminuição de valor do imobilizado é registrada periodicamente em depreciação (Lei nº 6.404/1976, art. 183, § 2º, "a").', 'A depreciação pelo desgaste, uso e obsolescência pode ser computada como custo ou encargo (Lei nº 4.506/1964, art. 57).', 'No sistema: linear, começa no mês em que o bem entra em uso, nunca passa do custo menos o valor residual, e terreno fica como não depreciável.'],
    fontes: [F.lei6404, F.lei4506], conferidoEm: DATA_CONFERENCIA, exemplo: 'depreciacao',
    meMostra: { tela: 'gestao-contabil', alvo: '[data-campo=gestao-aba-imobilizado]', legenda: 'Na Gestão contábil, a aba "Ativo imobilizado" cadastra os bens e lança a depreciação do mês.' }, pratica: 'depreciacao',
    perguntas: [
      q('A depreciação acumulada é uma conta:', ['Redutora do ativo', 'De receita', 'Do passivo'], 0, 'Ela reduz o valor do bem no ativo.'),
      q('Quando começa a depreciação?', ['Na compra da nota', 'No mês em que o bem entra em uso', 'No fim do ano'], 1, 'Começa quando o bem é posto em uso.'),
      q('A depreciação pode passar do custo do bem?', ['Sim', 'Não', 'Só em veículo'], 1, 'Nunca passa do custo menos o valor residual.'),
    ] },

  // ======================================================== BALANCETE, DRE E BALANÇO
  { id: 'balancete', trilha: 'demonstracoes', titulo: 'Balancete de verificação',
    oQueE: 'O balancete lista todas as contas com o que foi debitado e creditado no período e o saldo de cada uma. Se as partidas dobradas foram respeitadas, a soma dos saldos devedores é igual à dos saldos credores.',
    porQue: 'É a primeira conferência do mês: balancete que não fecha mostra lançamento errado ou faltando.',
    regras: ['A escrituração em forma contábil, pelas partidas dobradas, deixa a soma dos débitos igual à dos créditos (ITG 2000 (R1), CFC).', 'O Diário recebe as operações dia a dia (Código Civil, art. 1.184); o balancete resume o Diário.', 'No sistema, lançamento inválido (conta sintética, valor zero, sem histórico) fica fora e é apontado.'],
    fontes: [F.cfc, F.cc], conferidoEm: DATA_CONFERENCIA, exemplo: 'balancete-mes',
    meMostra: { tela: 'balancete', alvo: 'texto:Balancete local', legenda: 'Aqui está o balancete do mês, com débitos, créditos e saldos.' }, pratica: null,
    perguntas: [
      q('No balancete, saldos devedores x credores:', ['Devem ser iguais', 'Devedores sempre maiores', 'Não importa'], 0, 'Com as partidas dobradas, os totais fecham.'),
      q('Para que serve o balancete?', ['Conferir o mês e ver os saldos', 'Pagar imposto', 'Emitir nota'], 0, 'É a conferência dos saldos de todas as contas.'),
      q('Lançamento em conta sintética aparece no balancete?', ['Sim, normal', 'Não: é inválido e é apontado', 'Só no fim do ano'], 1, 'O sistema deixa fora e mostra para corrigir.'),
    ] },
  { id: 'dre', trilha: 'demonstracoes', titulo: 'DRE: o resultado do período',
    oQueE: 'A Demonstração do Resultado do Exercício (DRE) mostra receitas menos deduções, custos e despesas, até chegar ao lucro ou prejuízo do período.',
    porQue: 'É o que o cliente quer saber: a empresa ganhou ou perdeu dinheiro? E é base para impostos e distribuição de lucros.',
    regras: ['A DRE discrimina a receita bruta, deduções, custos, lucro bruto, despesas e o resultado do exercício (Lei nº 6.404/1976, art. 187).', 'O balanço patrimonial e o de resultado econômico são levantados anualmente (Código Civil, art. 1.179).', 'No sistema, as contas entram na DRE pelo grupo do plano (Receita, Despesa, Custo); o encerramento fica fora da DRE.'],
    fontes: [F.lei6404, F.cc], conferidoEm: DATA_CONFERENCIA, exemplo: 'dre-mes',
    meMostra: { tela: 'livros', alvo: 'texto:DRE gerencial', legenda: 'Em Livros Fiscais & ECD fica a DRE gerencial.' }, pratica: 'resultado',
    perguntas: [
      q('Resultado = ', ['Receitas − custos e despesas', 'Ativo − passivo', 'Caixa − banco'], 0, 'A DRE vai da receita ao resultado, descontando custos e despesas.'),
      q('Qual lei descreve a DRE?', ['Lei nº 6.404/1976, art. 187', 'CLT', 'Lei do Inquilinato'], 0, 'Lei 6.404/1976, art. 187.'),
      q('Pagamento de empréstimo (principal) entra na DRE como despesa?', ['Sim', 'Não: é baixa de passivo', 'Só os juros e o principal'], 1, 'O principal reduz o passivo; só os juros são despesa.'),
    ] },
  { id: 'balanco', trilha: 'demonstracoes', titulo: 'Balanço patrimonial',
    oQueE: 'O balanço mostra, numa data, o que a empresa tem (ativo) e o que deve (passivo), e a diferença, que é o patrimônio líquido. Ativo = Passivo + Patrimônio Líquido.',
    porQue: 'É a fotografia da empresa: banco, cliente, crédito, contador e sócio olham o balanço para decidir.',
    regras: ['As contas são agrupadas em ativo (circulante e não circulante) e passivo (circulante, não circulante e patrimônio líquido) (Lei nº 6.404/1976, art. 178).', 'O balanço patrimonial exprime, com fidelidade e clareza, a situação real da empresa (Código Civil, art. 1.188).', 'As demonstrações do fim do exercício incluem balanço, DLPA, DRE, fluxo de caixa e, para as companhias abertas, DVA (Lei nº 6.404/1976, art. 176).'],
    fontes: [F.lei6404, F.cc], conferidoEm: DATA_CONFERENCIA, exemplo: 'balancete-mes',
    meMostra: { tela: 'livros', alvo: 'texto:Balanço Patrimonial', legenda: 'Em Livros Fiscais & ECD fica o Balanço Patrimonial.' }, pratica: null,
    perguntas: [
      q('Equação do balanço:', ['Ativo = Passivo + Patrimônio Líquido', 'Ativo = Receita', 'Passivo = Despesa'], 0, 'O que a empresa tem é igual ao que deve mais o que é dos sócios.'),
      q('O balanço mostra a situação:', ['De um período inteiro', 'Numa data', 'Só do caixa'], 1, 'É a posição numa data; a DRE é que mostra o período.'),
      q('Patrimônio líquido fica em qual lado?', ['No ativo', 'Junto do passivo', 'Na DRE'], 1, 'Lei 6.404, art. 178, § 2º: no lado do passivo.'),
    ] },

  // ======================================================== LIVRO CAIXA DO SIMPLES
  { id: 'livro-caixa', trilha: 'livro-caixa', titulo: 'Livro Caixa do Simples Nacional',
    oQueE: 'O Livro Caixa registra a movimentação financeira e bancária da empresa: o que entrou e o que saiu do caixa e dos bancos, com o saldo de cada mês.',
    porQue: 'A ME e a EPP do Simples têm de manter o Livro Caixa (ou a escrituração contábil completa). E ele ajuda a mostrar que a receita declarada no PGDAS-D bate com o dinheiro que entrou.',
    regras: ['A ME e a EPP do Simples mantêm o livro-caixa com a movimentação financeira e bancária (LC nº 123/2006, art. 26, § 2º).', 'A escrituração contábil é obrigatória para todas as entidades, inclusive ME e EPP, pela ITG 2000 (R1) e pelo Código Civil, art. 1.179 (CFC).', 'No sistema, o Livro Caixa sai dos lançamentos aprovados nas contas de Caixa e Bancos marcadas; quem tem Diário e Razão completos é avisado pelo robô de que o Livro Caixa fica dispensado.'],
    fontes: [F.lc123, F.cfc, F.cc], conferidoEm: DATA_CONFERENCIA, exemplo: 'livro-caixa',
    meMostra: { tela: 'livros', alvo: 'texto:Livro Caixa (Simples)', legenda: 'Em Livros Fiscais & ECD fica o Livro Caixa do Simples, por período.' }, pratica: null,
    perguntas: [
      q('O que o Livro Caixa registra?', ['A movimentação financeira e bancária', 'Só as notas de saída', 'A folha de pagamento'], 0, 'LC 123, art. 26, § 2º: movimentação financeira e bancária.'),
      q('A escrituração contábil é obrigatória para ME e EPP?', ['Não', 'Sim, pelo CFC (ITG 2000) e pelo Código Civil', 'Só acima de R$ 4,8 milhões'], 1, 'O CFC orienta que a escrituração é obrigatória para todas as entidades.'),
      q('De onde o sistema tira o Livro Caixa?', ['Dos lançamentos aprovados nas contas de Caixa e Bancos', 'Da internet', 'Do e-mail do cliente'], 0, 'Usa os lançamentos aprovados nas contas marcadas como disponibilidades.'),
    ] },

  // ======================================================== ECD E ECF
  { id: 'ecd', trilha: 'ecd-ecf', titulo: 'ECD: a escrituração contábil digital',
    oQueE: 'A ECD é o Livro Diário (com razão auxiliar, balancetes e demonstrações) em arquivo digital, assinado e transmitido ao SPED. Quem é obrigado depende do regime da empresa.',
    porQue: 'Sem ECD, quem é obrigado toma multa e fica sem livro autenticado. É ela que dá validade aos livros contábeis digitais.',
    regras: ['O SPED foi instituído pelo Decreto nº 6.022/2007; a ECD segue a IN RFB nº 2.003/2021 (Portal do SPED).', 'Lucro Real entrega; Lucro Presumido fica dispensado se escritura só o livro caixa (Lei nº 8.981/1995, art. 45, parágrafo único) e não distribui lucro acima da base sem IRRF; o Simples é dispensado, salvo exceções.', 'Prazo: último dia útil de junho do ano seguinte (IN RFB nº 2.003/2021, art. 5º) — o sistema calcula e você confere feriados.'],
    fontes: [F.dec6022, F.sped, F.lei8981], conferidoEm: DATA_CONFERENCIA, exemplo: 'ecd-obrigatoriedade',
    meMostra: { tela: 'livros', alvo: '[data-campo=ecd-ano]', legenda: 'Em Livros Fiscais & ECD você escolhe o ano-calendário e gera a ECD.' }, pratica: 'ecd',
    perguntas: [
      q('Empresa do Lucro Real entrega a ECD?', ['Sim', 'Não', 'Só se quiser'], 0, 'Lucro Real é obrigado a entregar a ECD.'),
      q('Qual decreto instituiu o SPED?', ['Decreto nº 6.022/2007', 'Decreto nº 3.000/1999', 'Nenhum'], 0, 'O SPED foi instituído pelo Decreto nº 6.022/2007.'),
      q('Presumido com livro caixa e sem distribuir lucro acima da base:', ['Obrigado à ECD', 'Dispensado (entrega facultativa)', 'Proibido de entregar'], 1, 'Fica dispensado; a entrega é facultativa.'),
    ] },
  { id: 'ecf', trilha: 'ecd-ecf', titulo: 'ECF: a escrituração contábil fiscal',
    oQueE: 'A ECF traz ao SPED a apuração do IRPJ e da CSLL do ano (Lucro Real ou Presumido) e informações econômicas da empresa. Ela usa os saldos da ECD quando a empresa tem ECD.',
    porQue: 'É a declaração anual do imposto de renda da pessoa jurídica no SPED. Diferença entre ECD e ECF chama a atenção do fisco.',
    regras: ['A ECF segue a IN RFB nº 2.004/2021 e é entregue no SPED (Portal do SPED).', 'O optante do Simples Nacional não entrega a ECF (IN RFB nº 2.004/2021; Portal do SPED).', 'Os blocos de Lucro Real e Presumido do sistema partem dos saldos aprovados e o arquivo é conferido antes de gerar.'],
    fontes: [F.sped, F.dec6022], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'livros', legenda: 'A ECD e a ECF ficam em Livros Fiscais & ECD.' }, pratica: null,
    perguntas: [
      q('O que a ECF apura?', ['IRPJ e CSLL do ano', 'Só o ICMS', 'A folha'], 0, 'A ECF traz a apuração do IRPJ e da CSLL.'),
      q('Optante do Simples entrega ECF?', ['Sim', 'Não', 'Só no primeiro ano'], 1, 'O Simples Nacional não entrega a ECF.'),
      q('A ECF usa os saldos de onde, quando há ECD?', ['Da ECD', 'De um palpite', 'Do extrato do banco'], 0, 'A ECF recupera os saldos contábeis da ECD.'),
    ] },

  // ======================================================== ENCERRAMENTO DO EXERCÍCIO
  { id: 'encerramento', trilha: 'encerramento', titulo: 'Encerramento do resultado do exercício',
    oQueE: 'No fim do ano, as contas de receita e despesa são zeradas e o saldo delas (lucro ou prejuízo) vai para uma conta do Patrimônio Líquido. Assim o ano novo começa com as contas de resultado zeradas.',
    porQue: 'Sem o encerramento, o lucro de um ano se mistura com o do outro e o balanço não mostra o resultado acumulado certo.',
    regras: ['O exercício social dura um ano (Lei nº 6.404/1976, art. 175); ao fim dele se levantam as demonstrações (art. 176).', 'Balanço patrimonial e de resultado econômico, todo ano (Código Civil, art. 1.179).', 'No sistema, o encerramento é um lote de 31/12 pendente de aprovação, só com lançamentos aprovados; se o ano mudar depois, o robô avisa que o encerramento não bate mais.'],
    fontes: [F.lei6404, F.cc], conferidoEm: DATA_CONFERENCIA, exemplo: 'encerramento',
    meMostra: { tela: 'livros', alvo: 'texto:Encerramento do resultado', legenda: 'Em Livros Fiscais & ECD fica o Encerramento do resultado do ano.' }, pratica: null,
    perguntas: [
      q('No encerramento, as contas de receita e despesa:', ['São zeradas contra o PL', 'Ficam como estão', 'São apagadas'], 0, 'O saldo delas vai para a conta de lucros ou prejuízos no PL.'),
      q('Quanto dura o exercício social?', ['Um ano', 'Um mês', 'Cinco anos'], 0, 'Lei 6.404/1976, art. 175: um ano.'),
      q('Pode encerrar com lançamento do ano pendente de aprovação?', ['Sim', 'Não', 'Só se for pequeno'], 1, 'O sistema pede para aprovar ou rejeitar antes de encerrar.'),
    ] },
  { id: 'dlpa', trilha: 'encerramento', titulo: 'DLPA: o que aconteceu com os lucros',
    oQueE: 'A Demonstração de Lucros ou Prejuízos Acumulados (DLPA) mostra o saldo inicial de lucros ou prejuízos, o resultado do ano, as distribuições e o saldo final.',
    porQue: 'Mostra ao sócio quanto do lucro ficou na empresa e quanto foi distribuído.',
    regras: ['A DLPA é uma das demonstrações do fim do exercício (Lei nº 6.404/1976, art. 176, II).', 'Ela discrimina o saldo do início, os ajustes, as reversões, o lucro ou prejuízo do exercício, as transferências e o saldo ao fim (Lei nº 6.404/1976, art. 186).', 'No sistema, a DLPA sai das contas de lucros/prejuízos acumulados, com os lançamentos aprovados.'],
    fontes: [F.lei6404], conferidoEm: DATA_CONFERENCIA, exemplo: null,
    meMostra: { tela: 'livros', legenda: 'As demonstrações do ano ficam em Livros Fiscais & ECD.' }, pratica: null,
    perguntas: [
      q('A DLPA mostra:', ['O caminho dos lucros acumulados no ano', 'O estoque', 'A folha'], 0, 'Saldo inicial, resultado, distribuições e saldo final.'),
      q('Qual artigo descreve a DLPA?', ['Lei 6.404/1976, art. 186', 'CLT, art. 7º', 'Nenhum'], 0, 'Lei 6.404/1976, art. 186.'),
      q('Lucro distribuído aos sócios aparece na DLPA?', ['Sim, como redução', 'Não', 'Como receita'], 0, 'A distribuição reduz os lucros acumulados.'),
    ] },
];

export const GLOSSARIO: TermoGlossario[] = [
  { termo: 'Partidas dobradas', sinonimos: ['partida dobrada', 'metodo das partidas dobradas'], explicacao: 'Todo lançamento tem débito e crédito de mesmo valor; por isso a soma dos débitos é igual à dos créditos.', fonte: F.cfc, aula: 'partidas-dobradas' },
  { termo: 'Débito', sinonimos: ['debitar', 'a debito'], explicacao: 'Lado do lançamento que aumenta ativo e despesa (e diminui passivo, PL e receita).', fonte: F.cfc, aula: 'partidas-dobradas' },
  { termo: 'Crédito', sinonimos: ['creditar', 'a credito'], explicacao: 'Lado do lançamento que aumenta passivo, PL e receita (e diminui ativo e despesa).', fonte: F.cfc, aula: 'partidas-dobradas' },
  { termo: 'Plano de contas', sinonimos: ['plano', 'elenco de contas'], explicacao: 'A lista organizada das contas da empresa, em grupos (ativo, passivo, PL, receitas, despesas).', fonte: F.lei6404, aula: 'plano-de-contas' },
  { termo: 'Conta sintética', sinonimos: ['sintetica', 'conta de grupo'], explicacao: 'Conta que só agrupa outras; não recebe lançamento.', fonte: F.cfc, aula: 'plano-de-contas' },
  { termo: 'Conta analítica', sinonimos: ['analitica', 'conta de lancamento'], explicacao: 'Conta do último nível do plano: é nela que se lança.', fonte: F.cfc, aula: 'plano-de-contas' },
  { termo: 'Natureza da conta', sinonimos: ['natureza devedora', 'natureza credora'], explicacao: 'Devedora (D) ou credora (C): o lado em que o saldo da conta normalmente fica.', fonte: F.cfc, aula: 'plano-de-contas' },
  { termo: 'Ativo', sinonimos: ['bens e direitos'], explicacao: 'O que a empresa tem: caixa, bancos, clientes a receber, estoque, imobilizado (Lei 6.404, art. 178).', fonte: F.lei6404, aula: 'balanco' },
  { termo: 'Passivo', sinonimos: ['obrigacoes', 'dividas'], explicacao: 'O que a empresa deve: fornecedores, salários, impostos, empréstimos (Lei 6.404, art. 178).', fonte: F.lei6404, aula: 'balanco' },
  { termo: 'Patrimônio líquido', sinonimos: ['pl', 'patrimonio liquido'], explicacao: 'Ativo menos passivo: capital dos sócios, reservas e lucros ou prejuízos acumulados.', fonte: F.lei6404, aula: 'balanco' },
  { termo: 'Livro Diário', sinonimos: ['diario'], explicacao: 'Livro obrigatório com todas as operações, dia a dia, com o documento (Código Civil, arts. 1.180 e 1.184).', fonte: F.cc, aula: 'partidas-dobradas' },
  { termo: 'Livro Razão', sinonimos: ['razao', 'razao da conta'], explicacao: 'Os lançamentos organizados por conta, com o saldo de cada uma.', fonte: F.cfc, aula: 'conciliacao' },
  { termo: 'Balancete', sinonimos: ['balancete de verificacao'], explicacao: 'Lista das contas com débitos, créditos e saldos do período; devedores = credores.', fonte: F.cfc, aula: 'balancete' },
  { termo: 'DRE', sinonimos: ['demonstracao do resultado', 'demonstracao do resultado do exercicio'], explicacao: 'Receitas menos deduções, custos e despesas, até o lucro ou prejuízo (Lei 6.404, art. 187).', fonte: F.lei6404, aula: 'dre' },
  { termo: 'Balanço patrimonial', sinonimos: ['balanco', 'bp'], explicacao: 'Ativo, passivo e patrimônio líquido numa data (Lei 6.404, art. 178; Código Civil, art. 1.188).', fonte: F.lei6404, aula: 'balanco' },
  { termo: 'DLPA', sinonimos: ['demonstracao de lucros ou prejuizos acumulados'], explicacao: 'Mostra o caminho dos lucros acumulados no ano (Lei 6.404, art. 186).', fonte: F.lei6404, aula: 'dlpa' },
  { termo: 'Regime de competência', sinonimos: ['competencia'], explicacao: 'Registrar receita e despesa no mês a que se referem, e não no mês do pagamento (Lei 6.404, art. 177).', fonte: F.lei6404, aula: 'lancamentos-integrados' },
  { termo: 'Estorno', sinonimos: ['estornar', 'lancamento de estorno'], explicacao: 'Lançamento inverso que anula um lançamento errado, sem rasura (Código Civil, art. 1.183).', fonte: F.cc, aula: 'lancamento-manual' },
  { termo: 'Pré-lançamento', sinonimos: ['prelancamento', 'rascunho contabil'], explicacao: 'Lançamento preparado pelo robô a partir do Fiscal ou do DP, que espera a sua conferência.', fonte: F.sistema, aula: 'lancamentos-integrados' },
  { termo: 'Lançamento padrão', sinonimos: ['lancamento recorrente', 'recorrente'], explicacao: 'Lançamento que se repete todo mês com as mesmas contas (aluguel, honorários).', fonte: F.sistema, aula: 'recorrentes' },
  { termo: 'Conciliação bancária', sinonimos: ['conciliacao', 'conciliar o banco'], explicacao: 'Comparar o extrato do banco com o razão da conta Banco, movimento por movimento.', fonte: F.cc, aula: 'conciliacao' },
  { termo: 'OFX', sinonimos: ['arquivo ofx', 'extrato ofx'], explicacao: 'Formato de arquivo de extrato que o banco fornece e o sistema importa para conciliar.', fonte: F.sistema, aula: 'conciliacao' },
  { termo: 'Depreciação', sinonimos: ['depreciar', 'depreciacao acumulada'], explicacao: 'Perda de valor do imobilizado pelo uso e pelo tempo, lançada todo mês (Lei 6.404, art. 183, § 2º).', fonte: F.lei6404, aula: 'depreciacao' },
  { termo: 'Imobilizado', sinonimos: ['ativo imobilizado', 'bens do ativo'], explicacao: 'Bens usados na atividade por mais de um ano: móveis, máquinas, veículos, imóveis.', fonte: F.lei6404, aula: 'depreciacao' },
  { termo: 'Livro Caixa', sinonimos: ['livro-caixa', 'livro caixa do simples'], explicacao: 'Registro da movimentação financeira e bancária da ME/EPP do Simples (LC 123, art. 26, § 2º).', fonte: F.lc123, aula: 'livro-caixa' },
  { termo: 'ECD', sinonimos: ['sped contabil', 'escrituracao contabil digital'], explicacao: 'O Livro Diário e as demonstrações em arquivo digital, transmitidos ao SPED (IN RFB 2.003/2021).', fonte: F.sped, aula: 'ecd' },
  { termo: 'ECF', sinonimos: ['escrituracao contabil fiscal'], explicacao: 'A apuração anual do IRPJ e da CSLL no SPED (IN RFB 2.004/2021).', fonte: F.sped, aula: 'ecf' },
  { termo: 'SPED', sinonimos: ['sistema publico de escrituracao digital'], explicacao: 'Sistema de escrituração digital do governo (Decreto nº 6.022/2007).', fonte: F.dec6022, aula: 'ecd' },
  { termo: 'Encerramento do exercício', sinonimos: ['encerramento', 'apuracao do resultado', 'zerar as contas de resultado'], explicacao: 'Zerar as receitas e despesas do ano contra o patrimônio líquido, em 31/12.', fonte: F.lei6404, aula: 'encerramento' },
  { termo: 'Exercício social', sinonimos: ['exercicio', 'ano contabil'], explicacao: 'O período de um ano ao fim do qual se levantam as demonstrações (Lei 6.404, art. 175).', fonte: F.lei6404, aula: 'encerramento' },
];

// ---------------------------------------------------------------- funções puras sobre este conteúdo
export { normalizarEscola };
export function aulaPorId(id: string): AulaEscola | undefined { return AULAS.find((a) => a.id === id); }
export function aulasDaTrilha(trilha: string): AulaEscola[] { return AULAS.filter((a) => a.trilha === trilha); }
export function trilhaPorId(id: string): TrilhaEscola | undefined { return TRILHAS.find((t) => t.id === id); }
export function buscarGlossario(texto: string, limite = 8): TermoGlossario[] { return buscarNoGlossario(GLOSSARIO, texto, limite); }
export function buscarAula(texto: string): AulaEscola | null { return buscarAulaEm(AULAS, TRILHAS, texto); }
