// ESCOLA MURADE (Murade Contábil) — roteiro da "▶ Demonstração completa com a IA":
// Lançamentos → Conciliação → Fechamento → Balancete/DRE → ECD, na empresa de TREINO (plano de contas modelo).
// Os nomes de menu, campos e botões são os das telas reais (o teste confere cada um no arquivo da tela). Os números vêm dos
// cenários de demonstração das práticas (já conferidos no motor pelos testes), nunca escritos à mão no resultado.
import { PRATICAS, praticaPorId } from './escolaPratica';
import { criarRoteiroDemo, valoresDemo, type EtapaDemo } from './escolaDemonstracaoNucleo';

export * from './escolaDemonstracaoNucleo';
export const SISTEMA_DEMO = 'contabil';
export const NOME_SISTEMA_DEMO = 'Murade Contábil';

const campoDaPratica = (praticaId: string, id: string, extra: { rotulo?: string; porque?: string; fixo?: boolean } = {}) => {
  const p = praticaPorId(praticaId)!; const c = p.campos.find((x) => x.id === id)!;
  return { id, rotulo: extra.rotulo || c.rotulo, tipo: c.tipo, valor: valoresDemo(p)[id], opcoes: c.opcoes, porque: extra.porque ?? p.demo.porque?.[id], ...(extra.fixo ? { fixo: true } : {}) };
};
const camposDa = (praticaId: string) => praticaPorId(praticaId)!.campos.map((c) => campoDaPratica(praticaId, c.id));

export const ETAPAS_DEMO: EtapaDemo[] = [
  {
    id: 'lancamentos', titulo: 'Lançamentos', menu: 'Lançamentos', tela: 'lancamentos', arquivos: ['src/components/tabs/LancamentosTab.tsx', 'src/components/PadroesLancamentoPainel.tsx'], praticaId: 'lancamento',
    fala: 'Esta é a tela de Lançamentos. Os rascunhos do Fiscal e do DP chegam sozinhos; aqui você faz o lançamento manual, sempre em partidas dobradas: débito igual a crédito.',
    abrir: { rotulo: '+ Lançamento Manual', porque: 'Clico em mais Lançamento Manual: abre o formulário.' },
    campos: camposDa('lancamento'),
    resultado: { origem: 'propria', itens: [{ chave: 'partidasFecham', rotulo: 'Débitos = créditos' }, { chave: 'saldoDebito', rotulo: 'Saldo da conta debitada' }, { chave: 'saldoCredito', rotulo: 'Saldo da conta creditada' }] },
    nao: [{ rotulo: 'Cadastrar lançamento padrão', porque: 'Aqui NÃO: lançamento padrão é só para o que se repete todo mês, como o aluguel.' }],
    sim: [{ rotulo: 'Gravar Lançamento', porque: 'Conferiu débito, crédito, valor e histórico? Aqui SIM você clica para gravar. Na demonstração eu não gravo: é treino.' }],
    fecho: 'Lançamento conferido. Agora a conciliação bancária.',
  },
  {
    id: 'conciliacao', titulo: 'Conciliação bancária', menu: 'Gestão contábil', tela: 'gestao-contabil', arquivos: ['src/components/tabs/GestaoContabilTab.tsx', 'src/components/ConciliacaoBancariaPainel.tsx'], praticaId: null,
    fala: 'Esta é a Gestão contábil, na aba Extrato e conciliação. Aqui o extrato do banco é comparado com a contabilidade, linha por linha.',
    abrir: { rotulo: 'Extrato e conciliação', porque: 'Abro a aba Extrato e conciliação.' },
    campos: [{ id: 'banco', rotulo: 'Conta do banco no plano', tipo: 'select', valor: '1.1.01.02.01', opcoes: [{ valor: '1.1.01.02.01', rotulo: '1.1.01.02.01 Banco do Brasil' }], porque: 'A conta do plano que corresponde a este banco.' }],
    resultado: { origem: 'propria', itens: [] },
    nao: [{ rotulo: 'Desfazer conciliação', porque: 'Aqui NÃO: desfazer é só quando uma linha foi conciliada errado.' }],
    sim: [{ rotulo: 'Aceitar sugestões dos marcados', porque: 'Depois de conferir cada linha marcada, aqui SIM você aceita as sugestões do sistema.' }],
    fecho: 'Banco conciliado. Agora o fechamento do mês.',
    suaVez: { pergunta: 'Sua vez: as linhas marcadas estão conferidas. Clique no botão certo para aceitar as sugestões.', certo: 'Aceitar sugestões dos marcados' },
  },
  {
    id: 'fechamento', titulo: 'Fechamento do mês', menu: 'Gestão contábil', tela: 'gestao-contabil', arquivos: ['src/components/tabs/GestaoContabilTab.tsx'], praticaId: 'depreciacao',
    fala: 'No fechamento, primeiro a depreciação do ativo imobilizado; depois o Fechamento guiado confere tudo e fecha a competência.',
    abrir: { rotulo: 'Ativo imobilizado', porque: 'Abro a aba Ativo imobilizado.' },
    campos: camposDa('depreciacao'),
    resultado: { origem: 'propria', itens: [{ chave: 'quota', rotulo: 'Depreciação do mês' }, { chave: 'acumulada', rotulo: 'Depreciação acumulada' }, { chave: 'liquido', rotulo: 'Valor contábil líquido' }] },
    nao: [{ rotulo: 'Vender', porque: 'Aqui NÃO: Vender é só quando o bem foi vendido de verdade.' }],
    sim: [
      { rotulo: 'Lançar depreciação do mês', porque: 'Conferiu a quota? Aqui SIM você lança a depreciação do mês.' },
      { rotulo: 'Fechar competência', porque: 'No Fechamento guiado, sem pendências, aqui você fecha a competência: o servidor bloqueia alterações no mês.' },
    ],
    fecho: 'Mês pronto para fechar. Agora o balancete e a DRE.',
  },
  {
    id: 'balancete', titulo: 'Balancete e DRE', menu: 'Balancete', tela: 'balancete', arquivos: ['src/components/tabs/BalanceteTab.tsx', 'src/components/tabs/LivrosTab.tsx'], praticaId: 'resultado',
    fala: 'Este é o Balancete: o saldo de cada conta no mês. Da mesma base sai a DRE gerencial: receitas menos despesas.',
    campos: [
      campoDaPratica('resultado', 'competencia'),
      campoDaPratica('resultado', 'receita', { fixo: true, porque: 'A receita vem dos lançamentos do mês.' }),
      campoDaPratica('resultado', 'aluguel', { fixo: true }),
      campoDaPratica('resultado', 'salarios', { fixo: true, porque: 'Os salários vêm da folha do DP.' }),
    ],
    resultado: { origem: 'propria', itens: [{ chave: 'receitas', rotulo: 'Receitas' }, { chave: 'despesas', rotulo: 'Despesas' }, { chave: 'resultado', rotulo: 'Resultado do mês' }] },
    nao: [],
    sim: [
      { rotulo: 'Atualizar balancete', porque: 'Aqui SIM você atualiza o balancete depois dos últimos lançamentos.' },
      { rotulo: 'Imprimir / Salvar PDF', porque: 'Nos livros, aqui você imprime ou salva a DRE em PDF.' },
    ],
    fecho: 'Resultado do mês apurado. Por último, a ECD.',
  },
  {
    id: 'ecd', titulo: 'ECD', menu: 'Livros Fiscais & ECD', tela: 'livros', arquivos: ['src/components/tabs/LivrosTab.tsx', 'src/components/EcdGeradorPainel.tsx'], praticaId: 'ecd',
    fala: 'Esta é a tela de Livros e ECD. Primeiro o sistema confere se a empresa entrega a ECD e o prazo; vamos ver o caso de uma empresa do Lucro Real.',
    campos: camposDa('ecd'),
    resultado: { origem: 'propria', itens: [{ chave: 'situacaoEcd', rotulo: 'ECD' }, { chave: 'prazo', rotulo: 'Prazo de entrega' }] },
    nao: [],
    sim: [{ rotulo: 'Baixar arquivo ECD', porque: 'Com a conferência prévia sem erro, aqui SIM você baixa o arquivo da ECD para validar e transmitir no programa oficial.' }],
    fecho: 'Pronto! Fiz o mês inteiro do Contábil, do lançamento até a ECD.',
  },
];

const roteiro = criarRoteiroDemo(ETAPAS_DEMO, PRATICAS);
export const IDS_ETAPAS_DEMO = roteiro.ids;
export const etapaDemoPorId = roteiro.etapaPorId;
export const valoresParaMotor = roteiro.valoresParaMotor;
export const etapaDoCalculo = roteiro.etapaDoCalculo;
export const etapasSuaVez = roteiro.etapasSuaVez;
export const registroDemoValido = roteiro.registroValido;
export const conferirRoteiroDemo = roteiro.conferir;
