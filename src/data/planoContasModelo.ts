// Modelo padrão importado do arquivo ExpPContas.XLS, enviado pelo usuário.
// Preserva código, descrição, nível, classificação e natureza; não contém saldos.
import type { ContaPlano } from "../types";

export const planoContasModelo: ContaPlano[] = [
  {
    "codigo": "1",
    "descricao": "Ativo",
    "nivel": 1,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1",
    "descricao": "Circulante",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01",
    "descricao": "Disponível",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.01",
    "descricao": "Numerários em caixa",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.01.01",
    "descricao": "Caixa",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.02",
    "descricao": "Banco conta movimento",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.02.01",
    "descricao": "Banco do Brasil S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.02.02",
    "descricao": "Banco Itau S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.02.03",
    "descricao": "Bradesco",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.03",
    "descricao": "Aplicações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.03.01",
    "descricao": "Banco do Brasil S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.03.02",
    "descricao": "Banco Itau S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.03.03",
    "descricao": "Bradesco S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.01.03.06",
    "descricao": "Títulos de Renda Variável",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.04",
    "descricao": "Clientes",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.04.01",
    "descricao": "Recebimentos Pessoa Física e Jurídica",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.04.01.01",
    "descricao": "Duplicatas a receber",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.04.01.02",
    "descricao": "(-) Duplicatas descontadas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.04.01.03",
    "descricao": "(-) Provisão para créditos de liquidação duvidosa",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.04.01.04",
    "descricao": "(-) Ajuste a Valor Presente",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.05",
    "descricao": "Adiantamento",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.01",
    "descricao": "Adiantamento a fornecedor",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.01.01",
    "descricao": "Fornecedor A",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.02",
    "descricao": "Adiantamentos a Funcionários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.02.01",
    "descricao": "Salários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.02.02",
    "descricao": "Férias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.02.03",
    "descricao": "Décimo Terceiro Salário",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.02.04",
    "descricao": "Outros Adiantamentos a Funcionários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.03",
    "descricao": "Adiantamentos Diversos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.03.01",
    "descricao": "Adiantamentos para Viagens",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.03.02",
    "descricao": "Adiantamentos para Fornecedores",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.05.03.03",
    "descricao": "Outros Adiantamentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.06",
    "descricao": "Títulos a Receber",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.06.01",
    "descricao": "Títulos a Receber",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.06.01.01",
    "descricao": "Notas Promissórias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.06.01.02",
    "descricao": "Outros Títulos a Receber",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.06.01.03",
    "descricao": "(-) Ajuste a Valor Presente",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.06.01.04",
    "descricao": "(-) Provisão para Perdas Sobre Créditos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.07",
    "descricao": "Créditos a receber",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01",
    "descricao": "Créditos Tributários a Receber",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.01",
    "descricao": "Imposto de Renda Retido na Fonte - IRRF",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.02",
    "descricao": "Imposto de Renda a Compensar/Restituir",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.03",
    "descricao": "Antecipações de Imposto de Renda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.04",
    "descricao": "Contribuição Social Retida na Fonte",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.05",
    "descricao": "Contribuição Social a Compensar/Restituir",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.06",
    "descricao": "Antecipações da Contribuição Social",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.07",
    "descricao": "Crédito de Previdência Social",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.08",
    "descricao": "Créditos de PIS e COFINS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.09",
    "descricao": "Imposto Sobre Serviços - ISS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.01.10",
    "descricao": "Outros Créditos Tributários e Previdenciários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.02",
    "descricao": "Outros Créditos a Receber",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.02.01",
    "descricao": "(-) Ajuste a Valor Presente",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.07.02.02",
    "descricao": "(-) Provisão para Perdas Sobre Créditos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.07.03",
    "descricao": "Impostos e Contribuições a Recuperar",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.07.03.01",
    "descricao": "INSS A RECUPERAR",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08",
    "descricao": "Estoques",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01",
    "descricao": "Estoques  em trânsito",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.01",
    "descricao": "Produtos acabados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.02",
    "descricao": "Produtos em elaboração",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.03",
    "descricao": "Matéria prima",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.04",
    "descricao": "Material de embalagem",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.05",
    "descricao": "Materiais de Uso/Consumo",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.06",
    "descricao": "Almoxarifado",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.07",
    "descricao": "Produtos para Mercadorias e Venda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.08.01.08",
    "descricao": "(-) Provisão para Perdas de Estoques",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.1.09",
    "descricao": "Títulos e valores",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.09.01",
    "descricao": "Títulos e valores mobiliários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.09.01.01",
    "descricao": "Depósito para Incentivo Fiscal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.10",
    "descricao": "Despesas antecipadas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.10.01",
    "descricao": "Despesas antecipadas",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.10.01.01",
    "descricao": "Juros sobre empréstimo de capital de giro",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.10.01.02",
    "descricao": "Juros sobre financiamento Imobilizados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.1.10.01.03",
    "descricao": "Outras  Despesas Antecipadas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2",
    "descricao": "Ativo Não Circulante",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01",
    "descricao": "Realizável a longo prazo",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01.01",
    "descricao": "Aplicações em Incentivos Fiscais",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01.01.01",
    "descricao": "Ações de Incentivos Fiscais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01.01.02",
    "descricao": "Quotas de Fundos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01.01.03",
    "descricao": "Outros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.01.01.04",
    "descricao": "(-) Provisão para Desval. de Incentivos Fiscais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.02",
    "descricao": "Investimentos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.02.01",
    "descricao": "Investimentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.02.01.01",
    "descricao": "Participação empresas ações diversas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.02.01.02",
    "descricao": "Outros investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.02.01.03",
    "descricao": "Resultado do Método de Equiv. Patrimonial - MEP",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.02.01.04",
    "descricao": "(-) Provisão para Perdas em Investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.03",
    "descricao": "Imobilizado",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.01",
    "descricao": "Imóveis",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.01.01",
    "descricao": "Terrenos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.01.02",
    "descricao": "Edificações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.02",
    "descricao": "Instalações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.02.01",
    "descricao": "Aquisição Instalações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.03",
    "descricao": "Máquinas e equipamentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.03.01",
    "descricao": "Máquinas e equipamentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.04",
    "descricao": "Informática",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.04.01",
    "descricao": "Equipamentos de Processamento - Hardware",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.05",
    "descricao": "Móveis e utensílios",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.05.01",
    "descricao": "Móveis e Utensílios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.06",
    "descricao": "Veículos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.06.01",
    "descricao": "Veículos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.07",
    "descricao": "Imobilizações em curso",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.07.01",
    "descricao": "Bens em Uso na Fase da Implantação",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.07.02",
    "descricao": "Imóveis em Construção",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.07.03",
    "descricao": "Equipamentos, Máquinas e Aparelhos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.07.04",
    "descricao": "Outras Imobilizações em Curso",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.08",
    "descricao": "Outras imobilizações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.08.01",
    "descricao": "Benfeitorias em Imóveis de Terceiros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.03.08.02",
    "descricao": "Outras Imobilizações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.04",
    "descricao": "Depreciação Acumulada",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01",
    "descricao": "Depreciação Acumulada Imobilizado",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.01",
    "descricao": "(-) Depreciação Acum. Aquis. Imóveis",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.02",
    "descricao": "(-) Depreciação Acum. Aquis. Instalações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.03",
    "descricao": "(-) Depreciação Acum. Aquis. Máquinas e Equipament",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.04",
    "descricao": "(-) Depreciação Acum. Aquis. Hardware",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.05",
    "descricao": "(-) Depreciação Acum. Aquis. Móveis e Utensílios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.06",
    "descricao": "(-) Depreciação Acum. Aquis. Veículos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.07",
    "descricao": "(-) Depreciação Acum. Imobilizações em curso",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.04.01.08",
    "descricao": "(-) Provisão para Perdas Teste de Recuperabilidade",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.05",
    "descricao": "Intangível",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01",
    "descricao": "Aquisição Intangível",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01.01",
    "descricao": "Sistema de Computação",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01.02",
    "descricao": "Marcas Comerciais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01.03",
    "descricao": "Ágio por Expectativa Futura de Lucros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01.04",
    "descricao": "Outros Ativos Intangíveis",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.01.05",
    "descricao": "(-) Amortização Acumulada Intangível",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.05.02",
    "descricao": "Diferido",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.02.01",
    "descricao": "Despesas Pré operacionais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.02.02",
    "descricao": "Gastos com Reorganização",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.02.03",
    "descricao": "(-) Amortização Acumulada Diferido",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "1.2.05.03",
    "descricao": "Amortização",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.2.05.03.01",
    "descricao": "Amortização Acumulada",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.3",
    "descricao": "Contas de compensação",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.3.01",
    "descricao": "Compensação - Ativo",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.3.01.01",
    "descricao": "Compensação - Ativo",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "1.3.01.01.01",
    "descricao": "Outras",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "1.3.01.01.02",
    "descricao": "Contribuição Previdenciaria a compensar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "2",
    "descricao": "Passivo",
    "nivel": 1,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1",
    "descricao": "Circulante",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01",
    "descricao": "Empréstimo p/ capital de giro",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.01",
    "descricao": "Empréstimos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.01.01",
    "descricao": "Empréstimos Hipotecários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02",
    "descricao": "Empréstimos Bancários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02.01",
    "descricao": "Banco do Brasil S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02.02",
    "descricao": "Bradesco S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02.03",
    "descricao": "Banco Itau S/A.",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02.04",
    "descricao": "Banco Santander",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.02.05",
    "descricao": "Caixa Econômica Federal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.03",
    "descricao": "Outros  Empréstimos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.01.03.01",
    "descricao": "Outros  Empréstimos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.02",
    "descricao": "Financiamentos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.02.01",
    "descricao": "Financiamentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.02.01.01",
    "descricao": "Financiamentos para Aquisição de Ativos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.02.01.02",
    "descricao": "Outros Financiamentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.03",
    "descricao": "Fornecedores",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.03.01",
    "descricao": "Pessoa Física e Pessoa Jurídica",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.03.01.01",
    "descricao": "Fornecedores de Bens",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.03.01.02",
    "descricao": "Fornecedores de Serviços",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.03.01.03",
    "descricao": "Outros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05",
    "descricao": "Tributos e Contribuições",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01",
    "descricao": "Tributos e Contribuições",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.01",
    "descricao": "Imposto de Renda Pessoa Jurídica - IRPJ",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.02",
    "descricao": "Contribuição Social  Sobre o Lucro Líquido -CSSL",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.03",
    "descricao": "Imposto Sobre Serviços - ISS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.04",
    "descricao": "Imposto Sobre Operações Financeiras - IOF",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.05",
    "descricao": "Contribuições Previdenciárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.06",
    "descricao": "FGTS a Recolher",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.07",
    "descricao": "COFINS e PIS / PASEP",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.01.08",
    "descricao": "Outros Impostos e Contribuições a Recolher",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02",
    "descricao": "Retenções de Imposto e Contribuições",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.01",
    "descricao": "Imposto de Renda Retido na Fonte - de Funcionários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.02",
    "descricao": "Imposto de Renda Retido na Fonte - de Terceiros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.03",
    "descricao": "Imposto Sobre Serviços Retido na Fonte",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.04",
    "descricao": "Contribuição Social  Sobre o Lucro Líquido - CSSL",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.05",
    "descricao": "COFINS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.06",
    "descricao": "PIS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.07",
    "descricao": "Contribuições Previdenciárias Retidas de Terceiros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.02.08",
    "descricao": "Outros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03",
    "descricao": "Parcelamento de Tributos e Contribuições",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.01",
    "descricao": "Parcelamento de Tributos e Contribuições",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.02",
    "descricao": "Imposto de Renda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.03",
    "descricao": "Contribuição Social Sobre o Lucro Líquido - CSSL",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.04",
    "descricao": "Imposto Sobre Serviços - ISS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.05",
    "descricao": "COFINS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.06",
    "descricao": "PIS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.07",
    "descricao": "Contribuições Previdenciárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.05.03.08",
    "descricao": "Outros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06",
    "descricao": "Obrigações com Pessoal",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.01",
    "descricao": "Salários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.01.01",
    "descricao": "Salários a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.02",
    "descricao": "Gratificações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.02.01",
    "descricao": "Gratificações a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.03",
    "descricao": "Participações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.03.01",
    "descricao": "Participação nos Lucros a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.03.02",
    "descricao": "Dividendos a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.03.03",
    "descricao": "Participações em Lucros de Partes Beneficiárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.03.04",
    "descricao": "Outras Participações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.04",
    "descricao": "Honorários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.04.01",
    "descricao": "Honorários a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.05",
    "descricao": "Férias",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.05.01",
    "descricao": "Férias a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.05.02",
    "descricao": "Encargos Sobre Férias a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.05.03",
    "descricao": "1/3 de Férias Constitucional a pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.06",
    "descricao": "Décimo Terceiro Salário",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.06.01",
    "descricao": "Décimo Terceiro Salário a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.06.02",
    "descricao": "Encargos Sobre Décimo Terceiro a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.07",
    "descricao": "Juros Sobre Capital Próprio",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.07.01",
    "descricao": "Juros Sobre Capital Próprio a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.08",
    "descricao": "Outras Obrigações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.06.08.01",
    "descricao": "Outras Obrigações com Pessoal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.07",
    "descricao": "Títulos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.07.01",
    "descricao": "Títulos a pagar",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.07.01.01",
    "descricao": "Nota Promissória",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.08",
    "descricao": "Credores",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.08.01",
    "descricao": "Credores diversos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.08.01.01",
    "descricao": "Credores  Pessoa Física e Jurídica",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.09",
    "descricao": "Contas a pagar",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.09.01",
    "descricao": "Outros Contas a Pagar",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.09.01.01",
    "descricao": "Aluguéis a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.09.01.02",
    "descricao": "Outros Débitos a Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.09.01.03",
    "descricao": "Dividendos Propostos à Pagar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10",
    "descricao": "Provisões",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10.01",
    "descricao": "Provisões",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10.01.01",
    "descricao": "Décimo terceiro Salário",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10.01.02",
    "descricao": "Férias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10.01.03",
    "descricao": "Tributos e Contribuições",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.1.10.01.04",
    "descricao": "Parcelamento de Tributos e Contribuições",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2",
    "descricao": "Passivo Não Circulante",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01",
    "descricao": "Empréstimo e Financiamentos a Pagar",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.01",
    "descricao": "Empréstimos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.01.01",
    "descricao": "Empréstimos Hipotecários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.01.02",
    "descricao": "Empréstimos Bancários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.01.03",
    "descricao": "Outros  Empréstimos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.02",
    "descricao": "Financiamentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.02.01",
    "descricao": "Financiamentos para Aquisição de Ativos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.01.02.02",
    "descricao": "Outros Financiamentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.02",
    "descricao": "",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.02.01",
    "descricao": "",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.02.01.01",
    "descricao": "Capital Social - Cotas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.02.01.02",
    "descricao": "Ações Ordinárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.2.02.01.03",
    "descricao": "Ações Preferenciais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3",
    "descricao": "Patrimônio líquido",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.01",
    "descricao": "Capital Social",
    "nivel": 3,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02",
    "descricao": "Reservas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.01",
    "descricao": "Reservas de Capital/Reservas Patrimoniais",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.01.01",
    "descricao": "Reserva de Ágio na Subscrição de Ações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.01.02",
    "descricao": "Outras Reservas de Capital / Patrimoniais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.02",
    "descricao": "Reservas de Reavaliação",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.02.01",
    "descricao": "Reservas de Reavaliação - Ativos Próprios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.02.02",
    "descricao": "Reservas de Reavaliação - Coligadas e Controladas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.02.03",
    "descricao": "(-) Tributos Diferidos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "2.3.02.02.04",
    "descricao": "(-) Imposto de Renda Pessoa Jurídica - IRPJ",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "2.3.02.02.05",
    "descricao": "(-) Contribuição Social - CSLL",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "2.3.02.03",
    "descricao": "Reservas de Lucros / Sobras / Superávits",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.01",
    "descricao": "Reserva Legal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.02",
    "descricao": "Reservas Estatutárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.03",
    "descricao": "Reservas para Contingências",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.04",
    "descricao": "Reserva de Lucros a Realizar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.05",
    "descricao": "Reserva Especial para Dividendos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.06",
    "descricao": "Reserva de Retenção de Lucros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.07",
    "descricao": "Reserva de Incentivos Fiscais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.08",
    "descricao": "Reservas de Sobras",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.03.09",
    "descricao": "Outras Reservas de Lucros / Sobras / Superávits",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.04",
    "descricao": "Ajuste de Avaliação Patrimonial",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.04.01",
    "descricao": "Ganhos e Perdas com Títulos e Valores Mobiliários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.05",
    "descricao": "Outros Ajustes a Valor de Mercado",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.05.01",
    "descricao": "Outros Ajustes a Valor de Mercado",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.02.06",
    "descricao": "(-) Ações em Tesouraria",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "2.3.02.06.01",
    "descricao": "(-) Ações em Tesouraria",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "2.3.03",
    "descricao": "Prejuízos/Déficits Acumulados ou Resultado",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.01",
    "descricao": "Prejuízos/Déficits Acumulados",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.01.01",
    "descricao": "Lucros/Superávits Apurados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.01.02",
    "descricao": "Prejuízos/Déficits Apurados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.01.03",
    "descricao": "Dividendos Antecipados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.01.04",
    "descricao": "Juros Sobre Capital Próprio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.02",
    "descricao": "Resultado do Exercício",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.02.01",
    "descricao": "Resultado do Exercício no período",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.03",
    "descricao": "Ajustes de Exercícios Anteriores",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.3.03.03.01",
    "descricao": "Ajustes de Exercícios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "2.5",
    "descricao": "Contas de compensação",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.5.01",
    "descricao": "Compensação - Passivo",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.5.01.01",
    "descricao": "Compensação - Passivo",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "2.5.01.01.01",
    "descricao": "Outras",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3",
    "descricao": "Receita",
    "nivel": 1,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1",
    "descricao": "Receita Bruta Vendas e Serviços",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.01",
    "descricao": "Receita Bruta",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.01.01",
    "descricao": "Receita sobre Vendas",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.01.01.01",
    "descricao": "Venda de produtos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.01.01.02",
    "descricao": "Revenda de Mercadorias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.02",
    "descricao": "Receita sobre Serviços",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.02.01",
    "descricao": "Receita de serviços",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.1.02.01.01",
    "descricao": "Prestação de serviços",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.2",
    "descricao": "Dedução de receita",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01",
    "descricao": "Dedução de receita sobre vendas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01",
    "descricao": "Dedução da Receita",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01.01",
    "descricao": "Cancelamento e devoluções",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01.02",
    "descricao": "Abatimento incondicional",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01.03",
    "descricao": "Imposto sobre Circ. Mercadorias e Serviços - ICMS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01.04",
    "descricao": "PIS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.01.01.05",
    "descricao": "COFINS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.02",
    "descricao": "Dedução de receita sobre serviços",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.02.01",
    "descricao": "Dedução da Receita",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.02.01.01",
    "descricao": "Cancelamento e devoluções",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.02.01.02",
    "descricao": "Abatimento incondicional",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.2.02.01.03",
    "descricao": "Imposto Sobre Serviços - ISS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "3.3",
    "descricao": "Receita Operacional  / Financeira / Patrimoniais",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.01",
    "descricao": "Receita Operacional",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.01.01",
    "descricao": "Receita Operacional",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.01.01.01",
    "descricao": "Receita com Aluguel",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.01.01.02",
    "descricao": "Receita com Serviços",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02",
    "descricao": "Receita Financeira",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.01",
    "descricao": "Receitas com Depósitos e Empréstimos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.01.01",
    "descricao": "Juros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.01.02",
    "descricao": "Atualização Monetária",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.01.03",
    "descricao": "Outras Receitas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.02",
    "descricao": "Receitas com Créditos Tributários",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.02.01",
    "descricao": "Juros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.02.02",
    "descricao": "Atualização Monetária",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.02.03",
    "descricao": "Outras Receitas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.03",
    "descricao": "Receitas com Depósitos judiciais e Fiscais",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.03.01",
    "descricao": "Juros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.03.02",
    "descricao": "Atualização Monetária",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.03.03",
    "descricao": "Outras Receitas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.04",
    "descricao": "Receitas de Juros sobre Capital",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.04.01",
    "descricao": "Receitas de Juros sobre Capital Próprio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.05",
    "descricao": "Receitas Financeiras Diversas",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.05.01",
    "descricao": "Juros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.05.02",
    "descricao": "Atualização Monetária",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.02.05.03",
    "descricao": "Outras Receitas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03",
    "descricao": "Receitas Patrimoniais",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.01",
    "descricao": "Receitas com Imóveis de Renda",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.01.01",
    "descricao": "Aluguel",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.01.02",
    "descricao": "Outras Receitas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.02",
    "descricao": "Ajustes em  Investimentos Permanentes",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.02.01",
    "descricao": "Resultado de Equivalência Patrimonial",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.02.02",
    "descricao": "Amortização e Deságio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.02.03",
    "descricao": "Oscilação Cambial de Investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.03",
    "descricao": "Lucro na Alienação de Bens do Ativo Não Circulante",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.03.01",
    "descricao": "Investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.03.02",
    "descricao": "Imobilizado",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.04",
    "descricao": "Outros Investimentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.03.04.01",
    "descricao": "Dividendos e Rendimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.04",
    "descricao": "Outras Receitas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.04.01",
    "descricao": "Outras Receitas",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "C"
  },
  {
    "codigo": "3.3.04.01.01",
    "descricao": "Reversão de Provisão",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "C"
  },
  {
    "codigo": "4",
    "descricao": "Despesas",
    "nivel": 1,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1",
    "descricao": "Custos diretos da produção",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.01",
    "descricao": "Custos dos produtos vendidos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.01.01",
    "descricao": "Custos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.01.01.01",
    "descricao": "Diversos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.02",
    "descricao": "Outros materiais diretos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.02.01",
    "descricao": "Materiais Diretos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.02.01.01",
    "descricao": "Embalagens",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.03",
    "descricao": "Mão de obra direta",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.03.01",
    "descricao": "Pessoal",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.03.01.01",
    "descricao": "Salários e ordenados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.04",
    "descricao": "Outros custos diretos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.04.01",
    "descricao": "Custos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.1.04.01.01",
    "descricao": "Luz e força",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.2",
    "descricao": "Custos indiretos da produção",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.01",
    "descricao": "Materiais de consumo indireto",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.01.01",
    "descricao": "Custos indiretos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.01.01.01",
    "descricao": "Materiais auxiliares",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.02",
    "descricao": "Custos com venda",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.02.01",
    "descricao": "Custos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.02.01.02",
    "descricao": "Embalagens",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.07",
    "descricao": "Mão de obra indireta",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.07.01",
    "descricao": "Pessoal",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.2.07.01.13",
    "descricao": "Salários e ordenados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3",
    "descricao": "Despesas",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01",
    "descricao": "Despesas com Pessoal",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01",
    "descricao": "Despesas com Gestores/Diretoria",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.01",
    "descricao": "Honorários de Diretoria",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.02",
    "descricao": "Honorários do Conselho de Administração",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.03",
    "descricao": "Honorários do Conselho Consultivo",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.04",
    "descricao": "Honorários do Conselho Fiscal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.05",
    "descricao": "Representação Social",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.06",
    "descricao": "Ajuda de Custo",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.07",
    "descricao": "Gratificações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.08",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.01.09",
    "descricao": "Pro-labore",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02",
    "descricao": "Despesas com Empregados",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.01",
    "descricao": "Salários e Ordenados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.02",
    "descricao": "Serviços Extraordinários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.03",
    "descricao": "Gratificações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.04",
    "descricao": "13º Salário",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.05",
    "descricao": "Férias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.06",
    "descricao": "Ajuda de Custo",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.07",
    "descricao": "Abono Pecuniário",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.08",
    "descricao": "Representação Social",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.09",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.02.10",
    "descricao": "Provisão de 1/3 de férias Contitucional",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.03",
    "descricao": "Despesas com Indenizações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.03.01",
    "descricao": "Aviso Prévio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.03.02",
    "descricao": "Férias Indenizadas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.03.03",
    "descricao": "Indenizações Trabalhistas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.03.04",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.04",
    "descricao": "Despesas com Encargos Sociais",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.04.01",
    "descricao": "Previdência Social",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.04.02",
    "descricao": "FGTS",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.04.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.04.04",
    "descricao": "IRRF",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.05",
    "descricao": "Despesas com Formação Profissional",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.05.01",
    "descricao": "Formação Profissional",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.06",
    "descricao": "Despesas com prog. de Alimentação ao Trabalhador",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.06.01",
    "descricao": "Alimentação ao Trabalhador",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.07",
    "descricao": "Despesas com Transporte de Empregados",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.07.01",
    "descricao": "Vale Transporte",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.07.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.08",
    "descricao": "Outras Despesas com Pessoal",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.01.08.01",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02",
    "descricao": "Despesas com Serviços de Terceiros",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01",
    "descricao": "Remuneração por Serviços de Terceiros",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.01",
    "descricao": "Honorários Advocatícios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.02",
    "descricao": "Honorários de Auditoria",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.03",
    "descricao": "Honorários de Consultoria",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.04",
    "descricao": "Honorários de Serviços Técnicos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.05",
    "descricao": "Fretes e Carretos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.01.06",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.02",
    "descricao": "Encargos Sociais com Serviços de Terceiros",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.02.02.01",
    "descricao": "Encargos Sociais com Serviços de Terceiros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03",
    "descricao": "Despesas com Localização e Funcionamento",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01",
    "descricao": "Despesas com Localização e Manutenção",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.01",
    "descricao": "Aluguel",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.02",
    "descricao": "Arrendamento Mercantil",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.03",
    "descricao": "Condomínios e Taxas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.04",
    "descricao": "Água, Luz e telefone",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.05",
    "descricao": "Limpeza",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.06",
    "descricao": "Consertos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.01.07",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.02",
    "descricao": "Despesas com Expediente",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.02.01",
    "descricao": "Material de Expediente",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.02.02",
    "descricao": "Despesas Legais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.02.03",
    "descricao": "Despesas Bancárias",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.02.04",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03",
    "descricao": "Despesas com Utilização de Equipamentos e Veículos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03.01",
    "descricao": "Aluguel",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03.02",
    "descricao": "Arrendamento Mercantil",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03.03",
    "descricao": "Manutenção e Consertos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03.04",
    "descricao": "Combustível",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.03.05",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.04",
    "descricao": "Despesas com Comunicação",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.04.01",
    "descricao": "Malotes e Correspondências",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.04.02",
    "descricao": "Telefone e Telegramas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.04.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.05",
    "descricao": "Despesas com  Locação",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.05.01",
    "descricao": "Viagens",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.05.02",
    "descricao": "Conduções e Passagens Urbanas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.05.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06",
    "descricao": "Despesas com Seguros",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06.01",
    "descricao": "Bens Imóveis",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06.02",
    "descricao": "Veículos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06.03",
    "descricao": "Bens Móveis",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06.04",
    "descricao": "Responsabilidade Civil",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.06.05",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.07",
    "descricao": "Despesas com Bens de Uso Próprio",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.07.01",
    "descricao": "Depreciações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.08",
    "descricao": "Amortizações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.03.08.01",
    "descricao": "Amortizações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.04",
    "descricao": "Despesas com Vendas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.04.01",
    "descricao": "Publicidade e Propaganda",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.04.01.01",
    "descricao": "Brindes",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.04.01.02",
    "descricao": "Promoções",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.04.01.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05",
    "descricao": "Despesas Administrativas Diversas",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.01",
    "descricao": "Despesas com Publicações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.01.01",
    "descricao": "Publicações Legais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.01.02",
    "descricao": "Anúncios Diversos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.01.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.02",
    "descricao": "Despesas com Contribuições e Donativos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.02.01",
    "descricao": "Contribuições",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.02.02",
    "descricao": "Donativos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.02.03",
    "descricao": "Outras Despesas Assistenciais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.03",
    "descricao": "Despesas Judiciais",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.03.01",
    "descricao": "Despesas Judiciais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.04",
    "descricao": "Outras Despesas",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.04.01",
    "descricao": "Jornais e Revistas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.04.02",
    "descricao": "Multas e Acréscimos Moratórios",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.05.04.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.3.06",
    "descricao": "Despesas com Tributos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.4",
    "descricao": "",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01",
    "descricao": "Tributos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.01",
    "descricao": "Impostos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.01.01",
    "descricao": "IPVA",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.01.02",
    "descricao": "IPTU",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.02",
    "descricao": "Contribuições",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.02.01",
    "descricao": "PIS/PASEP",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.02.02",
    "descricao": "Contribuição Sindical Patronal",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.4.01.02.03",
    "descricao": "Outras Contribuições",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5",
    "descricao": "Despesas Financeiras",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.01",
    "descricao": "Despesas com Aplicações Financeiras",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.01.01",
    "descricao": "Despesas Financeiras com Títulos de Renda Fixa",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.01.01.01",
    "descricao": "Resultado na Venda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.01.01.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02",
    "descricao": "Despesas com Títulos de Renda Variável",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.01",
    "descricao": "Despesas com Ações",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.01.01",
    "descricao": "Resultado na Venda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.01.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.02",
    "descricao": "Despesas com Cotas de Fundos de Investimento",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.02.01",
    "descricao": "Oscilação do Valor de Cotas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.02.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.03",
    "descricao": "Despesas com Aplicações em Ouro",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.03.01",
    "descricao": "Resultado na Venda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.03.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.04",
    "descricao": "Despesas com Outros Títulos de Renda Variável",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.04.01",
    "descricao": "Resultado na Venda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.02.04.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03",
    "descricao": "Despesa com Empréstimos e Financiamentos",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.01",
    "descricao": "Despesa Financeira com Empréstimos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.01.01",
    "descricao": "Empréstimos Hipotecários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.01.02",
    "descricao": "Empréstimos Bancários",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.01.03",
    "descricao": "Outros  Empréstimos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.02",
    "descricao": "Despesa Financeira com Financiamentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.02.01",
    "descricao": "Financiamentos para Aquisição de Ativos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.02.02",
    "descricao": "Outros Financiamentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.03",
    "descricao": "Despesas De Ajustes A Valor Presente",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.03.03.01",
    "descricao": "Despesas de Ajuste a Valor Presente",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04",
    "descricao": "Outras Despesas Financeiras",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.01",
    "descricao": "Despesas Financeiras De Encargos Sobre Tributos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.01.01",
    "descricao": "Juros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.01.02",
    "descricao": "Atualização Monetária",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.01.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.02",
    "descricao": "Despesas de Juros de Capital Próprio",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.02.01",
    "descricao": "Juros de Capital Próprio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.03",
    "descricao": "Despesas por Pagamentos em Atraso",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.03.01",
    "descricao": "Despesas por Pagamentos em Atraso",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.04",
    "descricao": "Despesas Impostos e Contrib - Trans. Financeiras",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.04.01",
    "descricao": "Imposto de Renda",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.04.02",
    "descricao": "Imposto Sobre Operações Financeiras - IOF",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.5.04.04.03",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6",
    "descricao": "DESPESAS PATRIMONIAIS",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01",
    "descricao": "Despesas com Imóveis Destinados à Renda ou Venda",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01",
    "descricao": "Despesas com Serviços de Terceiros",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.01",
    "descricao": "Conservação e Reparos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.02",
    "descricao": "Impostos, Taxas e Seguros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.03",
    "descricao": "Condomínio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.04",
    "descricao": "Depreciações",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.05",
    "descricao": "Despesa com Provisão para Riscos Aluguel a Receber",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.06",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.01.07",
    "descricao": "(-) Recuperação de Despesas Patrimoniais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.02",
    "descricao": "Ajustes Negativos de Investimentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.02.01",
    "descricao": "Resultado de Equivalência Patrimonial",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.02.02",
    "descricao": "Amortização de Ágio",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.02.03",
    "descricao": "Oscilação Cambial de Investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.03",
    "descricao": "Prejuízo na Baixa de Bens do Ativo Não Circulante",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.03.01",
    "descricao": "Investimentos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.03.02",
    "descricao": "Imobilizado",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.03.03",
    "descricao": "Intangível",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.04",
    "descricao": "Outros Investimentos",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.04.01",
    "descricao": "Provisão para Desvalorização",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.01.04.02",
    "descricao": "Outras Despesas",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02",
    "descricao": "Contas de Destinação / Apuração de Resultado",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.01",
    "descricao": "Impostos e Contribuições Sobre o Lucro",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.01.01",
    "descricao": "Imposto de Renda da Pessoa Jurídica - IRPJ",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.01.02",
    "descricao": "Contribuição Social sobre o Lucro Líquido - CSLL",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.01.03",
    "descricao": "Impostos Diferidos",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.02",
    "descricao": "Despesas com Participação nos Lucros e Resultados",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.02.01",
    "descricao": "Administradores",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.02.02",
    "descricao": "Empregados",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.6.02.02.03",
    "descricao": "Outros",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "4.7",
    "descricao": "Outras Despesas",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.7.01",
    "descricao": "Despesas com Provisões",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.7.01.01",
    "descricao": "Despesas com Provisões",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "4.7.01.01.01",
    "descricao": "(-) Provisão para créditos de liquidação duvidosa",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "5",
    "descricao": "Contas Transitórias  - Apuração",
    "nivel": 1,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "5.1",
    "descricao": "Apuração do Resultado do Período",
    "nivel": 2,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01",
    "descricao": "Apuração do Resultado",
    "nivel": 3,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01",
    "descricao": "Exercício corrente",
    "nivel": 4,
    "tipo": "sintetica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01.01",
    "descricao": "Resultado do exercício",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01.02",
    "descricao": "Resultado de transações eventuais",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01.03",
    "descricao": "Resultado de conversão",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01.04",
    "descricao": "Resultado de deflação",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  },
  {
    "codigo": "5.1.01.01.05",
    "descricao": "Operações a classificar",
    "nivel": 5,
    "tipo": "analitica",
    "natureza": "D"
  }
];
