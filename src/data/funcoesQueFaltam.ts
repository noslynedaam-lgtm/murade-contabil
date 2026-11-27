// O que o Contábil ainda NÃO tem ou tem só em parte (levantamento de 27/11/2026, conferido no código). A Murad usa esta lista para
// responder com a verdade a "o sistema tem X?": nunca diz "tem sim" para o que está aqui. Quando uma função ficar pronta, tire daqui.
// Nunca escrever o nome do sistema concorrente.
import type { FuncaoQueFalta } from './agenteAgil';

export const FUNCOES_QUE_FALTAM: FuncaoQueFalta[] = [
  { id: 'lcdpr', tipo: 'nao_tem', nomes: ['lcdpr', 'livro caixa do produtor rural', 'produtor rural'], texto: 'o LCDPR, o livro caixa digital do produtor rural.' },
  { id: 'carne-leao', tipo: 'nao_tem', nomes: ['carne leao', 'livro caixa da pessoa fisica', 'profissional liberal'], texto: 'o carnê-leão e o livro caixa da pessoa física.' },
  { id: 'scp', tipo: 'nao_tem', nomes: ['scp', 'sociedade em conta de participacao'], texto: 'a contabilidade separada da SCP.' },
  { id: 'orcamento', tipo: 'nao_tem', nomes: ['orcamento', 'previsto x realizado', 'previsto e realizado', 'orcado'], texto: 'o orçamento com previsto e realizado.' },
  { id: 'moeda', tipo: 'nao_tem', nomes: ['moeda estrangeira', 'variacao cambial', 'dolar'], texto: 'a moeda estrangeira e a variação cambial.' },
  { id: 'bloco-k', tipo: 'nao_tem', nomes: ['bloco k da ecd', 'consolidacao de grupo', 'consolidacao'], texto: 'o Bloco K da ECD (consolidação de grupo).' },
  { id: 'diops-ibge', tipo: 'nao_tem', nomes: ['diops', 'pesquisa do ibge', 'ibge'], texto: 'o DIOPS da ANS e as pesquisas do IBGE.' },
  { id: 'patrimonio', tipo: 'parcial', nomes: ['reavaliacao', 'impairment', 'benfeitoria', 'depreciacao acelerada', 'inventario fisico', 'plaqueta'], texto: 'o patrimônio tem depreciação linear, baixa e venda com ganho ou perda, mas ainda não tem benfeitoria, reavaliação, depreciação acelerada nem inventário físico por plaqueta.' },
  { id: 'demonstrativo-proprio', tipo: 'parcial', nomes: ['relatorio gerencial proprio', 'montar meu relatorio', 'demonstrativo personalizado', 'balancete dinamico'], texto: 'as demonstrações saem prontas, mas o contador ainda não monta o próprio relatório gerencial.' },
];
