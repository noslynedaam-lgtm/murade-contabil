// Ferramentas da Agente IA (voz ou texto) para a migração da parte contábil do sistema anterior. Só leitura:
//  - situacao_migracao_sistema_anterior: se há um arquivo enviado em andamento e quantas empresas estão na prévia.
//  - conferir_migracao_sistema_anterior: de UMA empresa migrada, o que veio (blocos e quantidades) e se o balancete do
//    Murade bate com os saldos e lançamentos do sistema anterior.
//  - ver_registro_sistema_anterior: as linhas de um bloco guardado (ex.: lotes abertos, títulos, bens), em páginas.
//  - pendencias_campos_migracao_sistema_anterior: campo a campo, o que estava preenchido no sistema anterior e chegou
//    vazio ou diferente no Murade (cadastro, plano de contas, históricos, lançamentos, imobilizado).
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
  titulos: 'Títulos a pagar/receber (estão em Gestão › Títulos)',
  titulos_baixas: 'Baixas de títulos',
  titulos_provisao: 'Provisões de títulos',
  cartao_estabelecimentos: 'Estabelecimentos de cartão de crédito (sem senha)',
  cartao_movimentos: 'Informações de cartões (antiga DIRF; estão em Gestão › Cartões)',
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
  cadastro_empresa: 'Cadastro da empresa (endereço, inscrições, NIRE, CNAE, natureza jurídica, capital)',
  socios_empresa: 'Sócios da empresa (participação, responsável, qualificação)',
  socios: 'Cadastro dos sócios',
  municipio: 'Município (código IBGE)',
  cadastro_historico_cnae: 'Histórico de CNAE',
  historico_nire: 'Histórico de NIRE',
  historico_retencao: 'Histórico de retenção do IR dos sócios',
  trava_contabil: 'Data de trava do sistema anterior',
  textos_assinatura: 'Modelos de assinatura dos livros e do balanço',
  cartao_operadoras: 'Operadoras de cartão',
};

export const INSTRUCAO_MIGRACAO_SISTEMA_ANTERIOR = `
MIGRAÇÃO DO SISTEMA ANTERIOR (parte contábil): a pessoa traz tudo do sistema anterior pela tela "Migração" do Contábil (botão "Escolher o arquivo de backup", depois "Transportar tudo" ou "Não, quero escolher", prévia e "Confirmar e gravar agora"). Você NÃO grava a migração: para fazer, abra a tela Migração e explique passo a passo onde clicar. Para saber como está, use situacao_migracao_sistema_anterior; para conferir uma empresa já migrada (se o balancete bate com o sistema anterior), use conferir_migracao_sistema_anterior; para mostrar o que ficou guardado (lotes abertos, títulos, bens, cartões...), use ver_registro_sistema_anterior; para conferir CAMPO A CAMPO o que estava preenchido no sistema anterior e chegou vazio ou diferente no Murad (cadastro, contas, históricos, lançamentos, bens), use pendencias_campos_migracao_sistema_anterior e diga, para cada pendência, a tela e o campo onde corrigir. Para o que veio ERRADO do sistema anterior (regras oficiais), use analise_migracao_sistema_anterior e leia para a pessoa: "o backup veio assim: X; o certo é: Y; base: Z". Corrigir, desfazer, aceitar, manter ou lançar ajuste é sempre por decidir_item_migracao_sistema_anterior (cartão), um item por vez; ajuste de balancete só depois do "Sim" do contador, nunca por conta própria. Nunca escreva o nome comercial do sistema anterior: diga "sistema anterior".`;

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
    declaracao: { name: 'conferir_migracao_sistema_anterior', description: 'De UMA empresa migrada do sistema anterior: quando e por quem foi migrada, quantos lançamentos, contas e históricos vieram, os blocos guardados para consulta e se o balancete do Murad bate com os saldos e com os lançamentos originais do sistema anterior (por conta e competência). Use para "a migração da empresa X bateu?", "o que veio do sistema anterior?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres). Obtenha em listar_empresas.' } }, required: ['cnpj'] } },
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
        campoACampo: r.corpo.campos ? { resumo: r.corpo.campos.resumo, pendencias: r.corpo.campos.totalPendencias, primeiras: (r.corpo.campos.pendencias || []).slice(0, 5) } : null,
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
  {
    tipo: 'leitura',
    declaracao: { name: 'pendencias_campos_migracao_sistema_anterior', description: 'Conferência CAMPO A CAMPO de UMA empresa migrada do sistema anterior: cada campo que estava preenchido lá (cadastro da empresa, responsável, contador, plano de contas, históricos padrão, lançamentos, bens do imobilizado) e que está vazio ou diferente no Murad, com o valor de lá e o daqui. Use para "veio tudo do sistema anterior?", "faltou algum campo na migração?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres).' }, desde: { type: 'NUMBER', description: 'Opcional: quantas pendências pular (para ver as próximas).' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/migracao-sistema-anterior/registro/${q(cnpj)}`);
      if (!ok(r)) return erroApi(r);
      if (!r.corpo.resumo) return { cnpj, migrada: false, mensagem: 'Esta empresa não tem migração do sistema anterior registrada.' };
      const c = r.corpo.campos;
      if (!c) return { cnpj, migrada: true, mensagem: 'Não foi possível conferir campo a campo agora.' };
      const desde = Math.max(0, Math.floor(Number(args.desde) || 0));
      return { cnpj, resumo: c.resumo, conferidos: c.conferidos, totalPendencias: c.totalPendencias, desde, pendencias: (c.pendencias || []).slice(desde, desde + 30), ondeCorrigir: 'Cadastro: tela Empresa › Editar empresa. Contas: Plano de Contas. Históricos: Históricos padrão. Bens: Imobilizado. Lançamentos migrados: migre a empresa de novo pela tela Migração (troca só os do sistema anterior).' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'analise_migracao_sistema_anterior', description: 'ANÁLISE do que veio ERRADO do sistema anterior em UMA empresa migrada, pelas regras oficiais: o que o sistema já corrigiu sozinho (espaços nas pontas, zero do CPF, bairro cortado — com "Desfazer"), o que é para o contador conferir (natureza da conta diferente do grupo, saldo credor de caixa, CPF com dígito errado, histórico vazio, linha que não entrou) e os ajustes de balancete prontos quando algo não bate. Cada item tem: como veio, o certo e a base (norma). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, desde: { type: 'NUMBER', description: 'Opcional: quantos itens pular.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/migracao-sistema-anterior/registro/${q(cnpj)}`);
      if (!ok(r)) return erroApi(r);
      if (!r.corpo.resumo) return { cnpj, migrada: false, mensagem: 'Esta empresa não tem migração do sistema anterior registrada.' };
      const a = r.corpo.analise; const desde = Math.max(0, Math.floor(Number(args.desde) || 0));
      return a ? { cnpj, resumo: a.resumo, total: a.achados.length, desde, itens: a.achados.slice(desde, desde + 20).map((x: any) => ({ id: x.id, tipo: x.tipo, situacao: x.situacao, titulo: x.titulo, veio: x.veio, certo: x.certo, base: x.base, ajuste: x.ajuste })), comoDecidir: 'Para decidir um item use decidir_item_migracao_sistema_anterior (vira cartão de confirmação). Um por vez.' } : { cnpj, mensagem: 'Não foi possível analisar agora.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'decidir_item_migracao_sistema_anterior', description: 'MIGRAÇÃO: propõe decidir UM item da análise do que veio do sistema anterior: "corrigir" ou "desfazer" uma correção automática; "aceitar" a sugestão ou "manter" como veio num item para conferir; "lancar_ajuste" (lança o ajuste de balancete proposto) ou "desfazer_ajuste" (estorno); "corrigir_todos" refaz todas as correções automáticas desfeitas. Pegue o id em analise_migracao_sistema_anterior. Vira cartão; só executa depois do Sim.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING', description: 'id do item (não precisa em corrigir_todos).' }, acao: { type: 'STRING', description: 'corrigir, desfazer, aceitar, manter, lancar_ajuste, desfazer_ajuste ou corrigir_todos.' } }, required: ['cnpj', 'acao'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const acao = String(args.acao || '').trim(); const id = String(args.id || '').trim();
      if (!cnpj || !['corrigir', 'desfazer', 'aceitar', 'manter', 'lancar_ajuste', 'desfazer_ajuste', 'corrigir_todos'].includes(acao) || (acao !== 'corrigir_todos' && !id)) return { erro: 'Informe o CNPJ, a ação e o id do item.' };
      const r = await ctx.chamarApi('GET', `/api/migracao-sistema-anterior/registro/${q(cnpj)}`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const item = (r.corpo.analise?.achados || []).find((x: any) => x.id === id);
      if (acao !== 'corrigir_todos' && !item) return { erro: 'Não achei este item na análise desta empresa (pode já ter sido resolvido).' };
      const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const descricao = acao === 'corrigir_todos' ? ['Refaz as correções automáticas que foram desfeitas (só formatação; valores não mudam).']
        : acao === 'lancar_ajuste' && item.ajuste ? [item.titulo, `Vou lançar: D ${item.ajuste.contaDebito} / C ${item.ajuste.contaCredito} — ${reais(item.ajuste.valorCentavos)} em ${String(item.ajuste.data).split('-').reverse().join('/')}`, `Histórico: ${item.ajuste.historico}`, `Base: ${item.base}`]
          : [item.titulo, `Veio: ${item.veio}`, `${acao === 'desfazer' ? 'Volta a ficar como veio' : acao === 'manter' ? 'Fica como veio (marcado como conferido)' : `Fica: ${item.certo}`}`, `Base: ${item.base}`];
      const titulos: Record<string, string> = { corrigir: 'Corrigir agora', desfazer: 'Desfazer a correção', aceitar: 'Aceitar a sugestão e corrigir', manter: 'Manter como veio', lancar_ajuste: 'Quer que eu ajuste? Lançar o ajuste', desfazer_ajuste: 'Desfazer o ajuste (estorno)', corrigir_todos: 'Corrigir agora todas as correções automáticas' };
      return { cnpj, params: { cnpj, id, acao }, titulo: titulos[acao], descricao, resumo: `${titulos[acao]} ${cnpj} ${id}`.slice(0, 160) };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/migracao-sistema-anterior/registro/${q(String(params.cnpj))}/achado`, { id: params.id, acao: params.acao });
      return ok(r) ? { sucesso: true, mensagem: `${String(r.corpo?.mensagem || 'Feito.')} ${r.corpo?.resumo || ''}`.trim() } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
];
