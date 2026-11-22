// Ferramentas da Agente IA (voz ou texto) para a migração da parte contábil do sistema anterior. Só leitura:
//  - situacao_migracao_sistema_anterior: se há um arquivo enviado em andamento e quantas empresas estão na prévia.
//  - conferir_migracao_sistema_anterior: de UMA empresa migrada, o que veio (blocos e quantidades) e se o balancete do
//    Murade bate com os saldos e lançamentos do sistema anterior.
//  - ver_registro_sistema_anterior: as linhas de um bloco guardado (ex.: lotes abertos, títulos, bens), em páginas.
// Gravar a migração é sempre pela tela (a pessoa escolhe o arquivo, confere a prévia e confirma).
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const NOMES_BLOCOS_SISTEMA_ANTERIOR: Record<string, string> = {
  empresa_contabil: 'Configuração contábil da empresa (livros, contador, fechamento)',
  plano_cadastro: 'Cadastro do plano de contas (máscara, contas de lucro/prejuízo)',
  plano_contas: 'Plano de contas original (com código reduzido e todas as colunas)',
  historicos_padrao: 'Históricos padrão',
  lotes: 'Lotes de lançamento',
  lancamentos_originais: 'Lançamentos originais (cada linha do arquivo)',
  saldos: 'Saldos por conta e data',
  lancamentos_lote_aberto: 'Lançamentos em lote aberto (não efetivados lá)',
  lancamentos_automaticos: 'Lançamentos automáticos (modelos)',
  lancamentos_automaticos_contas: 'Contas dos lançamentos automáticos',
  titulos: 'Títulos (contas a pagar/receber)',
  titulos_baixas: 'Baixas de títulos',
  titulos_provisao: 'Provisões de títulos',
  cartao_estabelecimentos: 'Estabelecimentos de cartão de crédito (sem senha)',
  cartao_movimentos: 'Movimentos de cartão de crédito (DIRF)',
  identificador_sequencial: 'Numeração sequencial dos lançamentos',
  ecf_linhas_contas: 'Contas ligadas às linhas da ECF',
  ecf_configuracao_contas: 'Configuração das contas para a ECF (Parte A/B)',
  demonstracoes_configuracao: 'Configuração das demonstrações (DFC/DMPL/DRE)',
  demonstracoes_modelos: 'Modelos de demonstração',
  demonstracoes_modelos_analise: 'Grupos dos modelos de demonstração',
  contador: 'Contador responsável',
  imobilizado_empresa: 'Configuração do imobilizado',
  imobilizado_configuracao: 'Método de depreciação por ano',
  imobilizado_bens: 'Bens do imobilizado',
};

export const INSTRUCAO_MIGRACAO_SISTEMA_ANTERIOR = `
MIGRAÇÃO DO SISTEMA ANTERIOR (parte contábil): a pessoa traz tudo do sistema anterior pela tela "Migração" do Contábil (botão "Escolher o arquivo de backup", depois "Transportar tudo" ou "Não, quero escolher", prévia e "Confirmar e gravar agora"). Você NÃO grava a migração: para fazer, abra a tela Migração e explique passo a passo onde clicar. Para saber como está, use situacao_migracao_sistema_anterior; para conferir uma empresa já migrada (se o balancete bate com o sistema anterior), use conferir_migracao_sistema_anterior; para mostrar o que ficou guardado (lotes abertos, títulos, bens, cartões...), use ver_registro_sistema_anterior. Nunca escreva o nome comercial do sistema anterior: diga "sistema anterior".`;

export const FERRAMENTAS_MIGRACAO_SISTEMA_ANTERIOR: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'situacao_migracao_sistema_anterior', description: 'Mostra se há uma migração do sistema anterior em andamento para este usuário (arquivo enviado, quantas empresas no arquivo e na prévia, há quantos minutos). Use para "como está a migração?". Só lê.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/migracao-sistema-anterior/situacao');
      return ok(r) ? { emAndamento: r.corpo.emAndamento, empresasNoArquivo: r.corpo.empresasNoArquivo, empresasNaPrevia: r.corpo.empresasNaPrevia, minutosDesdeEnvio: r.corpo.minutosDesdeEnvio, tela: 'Migração' } : erroApi(r);
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'conferir_migracao_sistema_anterior', description: 'De UMA empresa migrada do sistema anterior: quando e por quem foi migrada, quantos lançamentos, contas e históricos vieram, os blocos guardados para consulta e se o balancete do Murade bate com os saldos e com os lançamentos originais do sistema anterior (por conta e competência). Use para "a migração da empresa X bateu?", "o que veio do sistema anterior?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres). Obtenha em listar_empresas.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/migracao-sistema-anterior/registro/${q(cnpj)}`);
      if (!ok(r)) return erroApi(r);
      if (!r.corpo.resumo) return { cnpj, migrada: false, mensagem: 'Esta empresa não tem migração do sistema anterior registrada.' };
      const s = r.corpo.resumo;
      return {
        cnpj, migrada: true, migradaEm: s.migradoEm, migradaPor: s.migradoPor, lancamentos: s.lancamentosGravados, lidos: s.lidos,
        linhasQueNaoEntraram: s.linhasQueNaoEntraram, conferenciaAgora: r.corpo.conferencia?.resumo, bate: r.corpo.conferencia?.bate,
        primeirasDiferencas: (r.corpo.conferencia?.diferencas || []).slice(0, 5),
        blocos: (r.corpo.blocos || []).map((b: any) => ({ bloco: b.bloco, nome: NOMES_BLOCOS_SISTEMA_ANTERIOR[b.bloco] || b.bloco, quantidade: b.quantidade })),
        avisos: (s.avisos || []).slice(0, 8),
      };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'ver_registro_sistema_anterior', description: 'Mostra as linhas de um bloco guardado do sistema anterior de uma empresa migrada (ex.: lancamentos_lote_aberto, titulos, imobilizado_bens, cartao_movimentos, lotes, plano_contas), 20 por vez. Use para "mostra os lançamentos que estavam em lote aberto", "quais bens vieram do sistema anterior". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, bloco: { type: 'STRING', description: 'Nome do bloco (veja conferir_migracao_sistema_anterior).' }, desde: { type: 'NUMBER', description: 'Opcional: quantas linhas pular (para ver as próximas).' } }, required: ['cnpj', 'bloco'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const bloco = String(args.bloco ?? '').trim().toLowerCase().replace(/[^a-z_]/g, '');
      if (!bloco) return { erro: 'Informe o bloco.' };
      const desde = Math.max(0, Math.floor(Number(args.desde) || 0));
      const r = await ctx.chamarApi('GET', `/api/migracao-sistema-anterior/registro/${q(cnpj)}/bloco/${q(bloco)}?desde=${desde}&limite=20`);
      return ok(r) ? { cnpj, bloco, nome: NOMES_BLOCOS_SISTEMA_ANTERIOR[bloco] || bloco, total: r.corpo.total, desde, linhas: r.corpo.linhas } : erroApi(r);
    },
  },
];
