// ESCOLA MURADE (Murade Contábil) — práticas em 3 fases no SIMULADOR (empresa de treino que NUNCA grava dado real).
//   1) DEMONSTRAÇÃO: "Vou fazer a primeira parte" — a Agente preenche o simulador campo por campo, falando o porquê.
//   2) PRÁTICA GUIADA: "Agora é a sua vez, eu vou te acompanhar" — cada clique/campo é conferido na hora (avaliarAcaoGuiada).
//   3) PROVA: "Não vou mais interferir" — dados diferentes, sem dica; corrigida no SERVIDOR (corrigirProva), com nota e nível.
//
// Por que simulador e não uma empresa de treino gravada no banco: uma empresa "de verdade" marcada como treino entraria nos
// robôs (Reconciliador, Conferidor, Revisor, Livro Caixa, Encerramento, backups) e nos livros. O simulador imita os campos da tela
// real, usa o MESMO motor de cálculo do sistema (src/server/escolaExemplos.ts) com o plano de contas modelo e guarda só o
// resultado da aula, nas tabelas da Escola. Os valores dos exercícios são FICTÍCIOS (empresa de treino).
import type { PraticaSim } from './escolaNucleo';

export * from './escolaNucleo';

export const EMPRESA_TREINO = { nome: 'TREINO — Comércio Escola Ltda (empresa fictícia, plano de contas modelo)', cnpj: 'TREINO', regime: 'Simples Nacional' };
export const AVISO_TREINO = 'Empresa de TREINO: dados fictícios. Nada aqui é gravado nos lançamentos, no plano de contas, nos livros, na ECD ou na ECF das empresas reais.';

const SIM_NAO = [{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }];

export const PRATICAS: PraticaSim[] = [
  {
    id: 'lancamento', titulo: 'Fazer um lançamento manual (partida dobrada)', telaReal: 'lancamentos',
    campos: [
      { id: 'data', rotulo: 'Data do lançamento', tipo: 'data' },
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
      { id: 'debito', rotulo: 'Conta a débito (código)', tipo: 'codigo' },
      { id: 'credito', rotulo: 'Conta a crédito (código)', tipo: 'codigo' },
      { id: 'historico', rotulo: 'Histórico da operação', tipo: 'texto' },
    ],
    botao: { id: 'gravar', rotulo: 'Gravar lançamento (treino)', porque: 'O sistema confere as partidas dobradas: contas analíticas, débito diferente do crédito, valor e histórico, e mostra o balancete do mês.' },
    resultados: [{ chave: 'partidasFecham', rotulo: 'Débitos = créditos' }, { chave: 'saldoDebito', rotulo: 'Saldo da conta debitada' }, { chave: 'saldoCredito', rotulo: 'Saldo da conta creditada' }],
    demo: { id: 'demo', enunciado: 'Venda à vista (TREINO) de R$ 1.500,00 em 05/10/2026: débito no Caixa (1.1.01.01.01) e crédito em Revenda de Mercadorias (3.1.01.01.02). Histórico: "Venda à vista".',
      valores: { data: '2026-10-05', valor: '1500', debito: '1.1.01.01.01', credito: '3.1.01.01.02', historico: 'Venda à vista' },
      porque: { data: 'A data do documento: a venda aconteceu em 05/10/2026.', valor: 'O valor da nota de venda.', debito: 'Entrou dinheiro no caixa: o Caixa (ativo) aumenta a débito.', credito: 'A receita da venda aumenta a crédito.', historico: 'O histórico explica a operação (Código Civil, art. 1.184).' } },
    guiada: { id: 'guiada', enunciado: 'Pagamento do aluguel (TREINO) de R$ 2.000,00 pelo Banco do Brasil em 10/10/2026: débito em Aluguel (4.3.03.01.01) e crédito em Banco do Brasil (1.1.01.02.01). Histórico: "Pagamento do aluguel".',
      valores: { data: '2026-10-10', valor: '2000', debito: '4.3.03.01.01', credito: '1.1.01.02.01', historico: 'Pagamento do aluguel' },
      porque: { debito: 'Despesa aumenta a débito.', credito: 'Saiu dinheiro do banco: o Banco (ativo) diminui a crédito.' } },
    provas: [
      { id: 'prova-1', enunciado: 'Recebimento de duplicata (TREINO) de R$ 3.200,00 no Banco do Brasil em 15/10/2026: débito em Banco do Brasil (1.1.01.02.01) e crédito em Duplicatas a receber (1.1.04.01.01). Histórico: "Recebimento de duplicata".', valores: { data: '2026-10-15', valor: '3200', debito: '1.1.01.02.01', credito: '1.1.04.01.01', historico: 'Recebimento de duplicata' } },
      { id: 'prova-2', enunciado: 'Compra de móveis a prazo (TREINO) de R$ 850,00 em 20/10/2026: débito em Móveis e Utensílios (1.2.03.05.01) e crédito em Fornecedores de Bens (2.1.03.01.01). Histórico: "Compra de móveis a prazo".', valores: { data: '2026-10-20', valor: '850', debito: '1.2.03.05.01', credito: '2.1.03.01.01', historico: 'Compra de móveis a prazo' } },
    ],
  },
  {
    id: 'depreciacao', titulo: 'Calcular a depreciação do mês', telaReal: 'gestao-contabil',
    campos: [
      { id: 'custo', rotulo: 'Custo de aquisição', tipo: 'moeda' },
      { id: 'residual', rotulo: 'Valor residual', tipo: 'moeda' },
      { id: 'vidaUtil', rotulo: 'Vida útil (meses)', tipo: 'numero' },
      { id: 'inicio', rotulo: 'Mês em que entrou em uso', tipo: 'competencia' },
      { id: 'competencia', rotulo: 'Competência do cálculo', tipo: 'competencia' },
    ],
    botao: { id: 'calcular', rotulo: 'Calcular depreciação (treino)', porque: 'O sistema divide (custo − residual) pela vida útil, mês a mês, desde o mês em que o bem entrou em uso, sem passar do custo.' },
    resultados: [{ chave: 'quota', rotulo: 'Depreciação do mês' }, { chave: 'acumulada', rotulo: 'Depreciação acumulada' }, { chave: 'liquido', rotulo: 'Valor contábil líquido' }],
    demo: { id: 'demo', enunciado: 'Móveis (TREINO) de R$ 12.000,00, sem valor residual, vida útil de 120 meses, em uso desde 01/2026. Depreciação de 10/2026.',
      valores: { custo: '12000', residual: '0', vidaUtil: '120', inicio: '2026-01', competencia: '2026-10' },
      porque: { custo: 'O custo de compra do bem.', residual: 'O valor que se espera ter no fim da vida útil; aqui, zero.', vidaUtil: 'Em quantos meses o bem se desgasta.', inicio: 'A depreciação começa no mês em que o bem entra em uso.', competencia: 'O mês que estamos fechando.' } },
    guiada: { id: 'guiada', enunciado: 'Veículo (TREINO) de R$ 60.000,00, valor residual de R$ 12.000,00, vida útil de 60 meses, em uso desde 03/2026. Depreciação de 10/2026.',
      valores: { custo: '60000', residual: '12000', vidaUtil: '60', inicio: '2026-03', competencia: '2026-10' } },
    provas: [
      { id: 'prova-1', enunciado: 'Computadores (TREINO) de R$ 9.000,00, sem valor residual, vida útil de 60 meses, em uso desde 06/2026. Depreciação de 12/2026.', valores: { custo: '9000', residual: '0', vidaUtil: '60', inicio: '2026-06', competencia: '2026-12' } },
      { id: 'prova-2', enunciado: 'Máquina (TREINO) de R$ 45.000,00, valor residual de R$ 5.000,00, vida útil de 48 meses, em uso desde 02/2026. Depreciação de 11/2026.', valores: { custo: '45000', residual: '5000', vidaUtil: '48', inicio: '2026-02', competencia: '2026-11' } },
    ],
  },
  {
    id: 'resultado', titulo: 'Apurar o resultado do mês (DRE)', telaReal: 'livros',
    campos: [
      { id: 'competencia', rotulo: 'Competência', tipo: 'competencia' },
      { id: 'receita', rotulo: 'Receita de vendas do mês', tipo: 'moeda' },
      { id: 'aluguel', rotulo: 'Despesa de aluguel', tipo: 'moeda' },
      { id: 'salarios', rotulo: 'Despesa de salários', tipo: 'moeda' },
    ],
    botao: { id: 'apurar', rotulo: 'Apurar resultado (treino)', porque: 'O sistema lança a receita e as despesas pelas partidas dobradas e soma pelo grupo do plano: receitas menos despesas (Lei 6.404, art. 187).' },
    resultados: [{ chave: 'receitas', rotulo: 'Receitas' }, { chave: 'despesas', rotulo: 'Despesas' }, { chave: 'resultado', rotulo: 'Resultado do mês' }],
    demo: { id: 'demo', enunciado: 'Outubro/2026 (TREINO): vendas de R$ 50.000,00, aluguel de R$ 4.000,00 e salários de R$ 18.000,00.',
      valores: { competencia: '2026-10', receita: '50000', aluguel: '4000', salarios: '18000' },
      porque: { competencia: 'A DRE é do período: o mês de outubro.', receita: 'A receita bruta do mês.', aluguel: 'Despesa do mês pelo regime de competência.', salarios: 'Os salários do mês, mesmo que pagos no mês seguinte.' } },
    guiada: { id: 'guiada', enunciado: 'Setembro/2026 (TREINO): vendas de R$ 30.000,00, aluguel de R$ 3.500,00 e salários de R$ 20.000,00.',
      valores: { competencia: '2026-09', receita: '30000', aluguel: '3500', salarios: '20000' } },
    provas: [
      { id: 'prova-1', enunciado: 'Agosto/2026 (TREINO): vendas de R$ 80.000,00, aluguel de R$ 6.000,00 e salários de R$ 35.000,00.', valores: { competencia: '2026-08', receita: '80000', aluguel: '6000', salarios: '35000' } },
      { id: 'prova-2', enunciado: 'Julho/2026 (TREINO): vendas de R$ 20.000,00, aluguel de R$ 4.500,00 e salários de R$ 19.000,00.', valores: { competencia: '2026-07', receita: '20000', aluguel: '4500', salarios: '19000' } },
    ],
  },
  {
    id: 'ecd', titulo: 'Saber se a empresa entrega a ECD e o prazo', telaReal: 'livros',
    campos: [
      { id: 'regime', rotulo: 'Regime tributário', tipo: 'select', opcoes: [{ valor: 'Simples Nacional', rotulo: 'Simples Nacional' }, { valor: 'Lucro Presumido', rotulo: 'Lucro Presumido' }, { valor: 'Lucro Real', rotulo: 'Lucro Real' }] },
      { id: 'livroCaixa', rotulo: 'Escritura só o livro caixa? (Presumido)', tipo: 'select', opcoes: SIM_NAO },
      { id: 'distribuiu', rotulo: 'Distribuiu lucro acima da base sem IRRF? (Presumido)', tipo: 'select', opcoes: SIM_NAO },
      { id: 'ano', rotulo: 'Ano-calendário', tipo: 'numero' },
    ],
    botao: { id: 'conferir', rotulo: 'Conferir obrigatoriedade (treino)', porque: 'O sistema aplica a regra do manual da ECD por regime e calcula o prazo (último dia útil de junho do ano seguinte).' },
    resultados: [{ chave: 'situacaoEcd', rotulo: 'ECD' }, { chave: 'prazo', rotulo: 'Prazo de entrega' }],
    demo: { id: 'demo', enunciado: 'Empresa (TREINO) do Lucro Real, ano-calendário 2026. Ela entrega a ECD? Até quando?',
      valores: { regime: 'Lucro Real', livroCaixa: 'nao', distribuiu: 'nao', ano: '2026' },
      porque: { regime: 'O regime decide a obrigatoriedade.', livroCaixa: 'No Lucro Real não existe a opção de só livro caixa.', distribuiu: 'Só importa para o Presumido.', ano: 'O ano dos lançamentos; a entrega é no ano seguinte.' } },
    guiada: { id: 'guiada', enunciado: 'Empresa (TREINO) do Lucro Presumido que escritura só o livro caixa e NÃO distribuiu lucro acima da base, ano-calendário 2026.',
      valores: { regime: 'Lucro Presumido', livroCaixa: 'sim', distribuiu: 'nao', ano: '2026' } },
    provas: [
      { id: 'prova-1', enunciado: 'Empresa (TREINO) do Lucro Presumido que escritura só o livro caixa, mas distribuiu lucro acima da base sem IRRF, ano-calendário 2025.', valores: { regime: 'Lucro Presumido', livroCaixa: 'sim', distribuiu: 'sim', ano: '2025' } },
      { id: 'prova-2', enunciado: 'Empresa (TREINO) do Simples Nacional, sem aporte de capital, ano-calendário 2026 (livro caixa: não; distribuição acima da base: não).', valores: { regime: 'Simples Nacional', livroCaixa: 'nao', distribuiu: 'nao', ano: '2026' } },
    ],
  },
];

export function praticaPorId(id: string): PraticaSim | undefined { return PRATICAS.find((p) => p.id === id); }
