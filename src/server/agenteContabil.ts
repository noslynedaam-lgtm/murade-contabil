// Ferramentas da Agente IA do Murade Contábil. Cada ferramenta chama uma rota que já existe, com a
// sessão do próprio usuário, então escopo por empresa, perfil "somente leitura" e as travas de
// conferência/fechamento continuam valendo. A Agente nunca grava lançamento definitivo por conta própria.
import {
  erroApi, ok, q, reais,
  type Ferramenta, type KitAgente,
} from './agenteMotor';
import { achadosDoConferidor, achadosEcdDoConferidor } from './conferidorContabil';
import { conferirEcdWorkspace } from './conferidorEcd';
import { limiteLc224Workspace } from './limiteLc224';
import { apuracaoPeriodosRealWorkspace } from './apuracaoLucroRealPeriodos';
import { estimarLucroRealWorkspace } from './estimativaLucroReal';
import { conferirFechamento } from '../utils/fechamentoContabil';
import { compararPeriodos, explicarVariacoes } from '../utils/analiseContabil';
import { FERRAMENTAS_ENTRE_SISTEMAS, INSTRUCAO_ENTRE_SISTEMAS } from './ferramentasEntreSistemas';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); return d.length === 14 ? d : null; };
const competenciaDe = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim()) ? v.trim() : null);
const mesAno = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

const props = {
  cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres). Obtenha em listar_empresas.' },
  competencia: { type: 'STRING', description: 'Competência no formato AAAA-MM, por exemplo 2026-10.' },
};

async function lerWorkspace(ctx: Parameters<Extract<Ferramenta, { tipo: 'leitura' }>['executar']>[0], cnpj: string) {
  const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}`);
  if (!ok(r)) return { erro: erroApi(r).erro } as const;
  if (!r.corpo?.dados) return { erro: 'Esta empresa ainda não tem dados contábeis salvos.' } as const;
  return { dados: r.corpo.dados as Record<string, any> } as const;
}

const FERRAMENTAS: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'listar_empresas', description: 'Lista as empresas autorizadas para este usuário (CNPJ e nome).', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/workspaces');
      if (!ok(r)) return erroApi(r);
      return { empresas: (r.corpo?.empresas || []).map((e: any) => ({ cnpj: e.cnpj, nome: e.razaoSocial || e.nomeFantasia || e.nome || null, regime: e.regime || null })) };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_pendencias', description: 'Mostra o que está pendente na contabilidade da empresa: pré-lançamentos aguardando conferência (vindos do DP e do Fiscal), lançamentos manuais aguardando aprovação e competências já fechadas. Informe competência para filtrar.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const competencia = args.competencia ? competenciaDe(args.competencia) : null;
      if (args.competencia && !competencia) return { erro: 'Competência inválida. Use AAAA-MM.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const pre: any[] = Array.isArray(ws.dados.preLancamentos) ? ws.dados.preLancamentos : [];
      const pend = pre.filter((p) => p?.status === 'pendente_conferencia' && (!competencia || p.competencia === competencia));
      const manuais = (Array.isArray(ws.dados.lancamentos) ? ws.dados.lancamentos : []).filter((l: any) => l?.statusManual === 'pendente_aprovacao' && (!competencia || String(l.data || '').slice(0, 7) === competencia));
      const fech = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/fechamentos`);
      const porOrigem: Record<string, number> = {};
      for (const p of pend) porOrigem[p.origem] = (porOrigem[p.origem] || 0) + 1;
      return {
        cnpj, competencia: competencia || 'todas',
        preLancamentosPendentes: pend.length, totalPendente: reais(pend.reduce((s, p) => s + Number(p.valor || 0), 0)), porOrigem,
        amostra: pend.slice(0, 10).map((p) => ({ referencia: p.referenciaOrigem, competencia: p.competencia, origem: p.origem, valor: reais(Number(p.valor || 0)), historico: String(p.historico || '').slice(0, 80) })),
        lancamentosManuaisAguardandoAprovacao: manuais.length,
        competenciasFechadas: ok(fech) ? (fech.corpo?.fechamentos || []).map((f: any) => f.competencia) : erroApi(fech),
      };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_fechamentos', description: 'Lista as competências já fechadas da empresa, com quem fechou e quando.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/fechamentos`);
      return ok(r) ? { fechamentos: r.corpo?.fechamentos || [] } : erroApi(r);
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_historico_aprovacoes', description: 'Mostra as últimas aprovações (contabilizações) feitas na empresa e por quem.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/historico-aprovacoes?limite=15`);
      return ok(r) ? { aprovacoes: r.corpo?.aprovacoes || [], conferenciaIntegridade: r.corpo?.conferenciaIntegridade } : erroApi(r);
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'status_integracoes', description: 'Mostra se o Contábil está recebendo dados do Fiscal e do DP (armazenamento, conexão com as APIs, reconciliação automática de rascunhos).', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj } } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      const r = await ctx.chamarApi('GET', `/api/integracao/status${cnpj ? `?cnpj=${q(cnpj)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const c = r.corpo;
      return { armazenamento: c.armazenamento, tokenServicoConfigurado: c.tokenServicoConfigurado, fiscal: c.fiscal, departamentoPessoal: c.departamentoPessoal, apiFiscal: c.apiFiscal, apiDepartamentoPessoal: c.apiDepartamentoPessoal, reconciliacaoRascunhos: c.reconciliacaoRascunhos, transmissaoAutomaticaHabilitada: c.transmissaoAutomaticaHabilitada };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'status_robos', description: 'Mostra se os robôs do Contábil estão ativos, a missão de cada um, quando rodaram pela última vez e erros.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/robos/status');
      return ok(r) ? { robos: r.corpo?.robos, servidor: r.corpo?.servidor } : erroApi(r);
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'achados_do_conferidor', description: 'Mostra o que o Robô Conferidor encontrou nas empresas do usuário para fechar o mês anterior: pendências automáticas, rascunhos vindos do DP e do Fiscal ainda sem conferir e lançamentos aguardando aprovação.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const lista = await ctx.chamarApi('GET', '/api/workspaces');
      if (!ok(lista)) return erroApi(lista);
      const cnpjs = (lista.corpo?.empresas || []).map((e: any) => String(e.cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase());
      const itens = achadosDoConferidor(cnpjs);
      return { empresasConferidas: itens.length, achados: itens.map((a) => ({ cnpj: a.cnpj, competencia: a.competencia, verificadoEm: a.verificadoEm, pendencias: a.pendencias, rascunhosPendentesPorOrigem: a.preLancamentosPendentesPorOrigem, lancamentosAguardandoAprovacao: a.lancamentosAguardandoAprovacao })), ecd: achadosEcdDoConferidor(cnpjs).map((e) => ({ cnpj: e.cnpj, ano: e.ano, situacao: e.situacao, prazo: e.prazo, diasParaPrazo: e.diasParaPrazo, pronta: e.pronta, atrasada: e.atrasada, pendencias: e.pendencias.slice(0, 8), totalPendencias: e.pendencias.length })), observacao: itens.length ? undefined : 'O robô ainda não rodou ou nenhuma empresa tem movimento a conferir.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'conferir_fechamento', description: 'Confere, na hora, o que impede de fechar a competência da empresa (itens automáticos). Banco, contas a pagar/receber, folha e impostos dependem de confirmação do usuário na tela.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj), competencia = competenciaDe(args.competencia);
      if (!cnpj || !competencia) return { erro: 'Informe CNPJ e competência (AAAA-MM) válidos.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const r = conferirFechamento({ competencia, contas: ws.dados.contas || [], lancamentos: ws.dados.lancamentos || [], preLancamentos: ws.dados.preLancamentos || [], bens: ws.dados.bensImobilizado || [], confirmacoes: {} });
      return { cnpj, competencia, itensAutomaticos: r.itens.filter((i) => i.tipo === 'automatico').map((i) => ({ item: i.titulo, ok: i.ok, bloqueia: i.bloqueia, detalhe: i.detalhe })), confirmacoesDoUsuario: r.itens.filter((i) => i.tipo === 'manual').map((i) => i.titulo) };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'situacao_ecd', description: 'Diz, na hora, se a ECD (Escrituração Contábil Digital) da empresa está pronta: se é obrigatória para o regime, o prazo, e o que ainda falta para o contador (Balanço, DRE, encerramento do resultado, assinaturas, plano referencial). Considera o ano anterior.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const e = conferirEcdWorkspace(cnpj, ws.dados, new Date());
      if (!e) return { erro: 'A empresa ainda não tem cadastro salvo no Contábil.' };
      return { cnpj, ano: e.ano, situacao: e.situacao, titulo: e.titulo, prazo: e.prazo, diasParaPrazo: e.diasParaPrazo, pronta: e.pronta, atrasada: e.atrasada, pendencias: e.pendencias.slice(0, 12), totalPendencias: e.pendencias.length, avisos: e.avisos.slice(0, 4), observacao: 'O Murade monta o arquivo; a validação, a assinatura e a transmissão são feitas pelo contador no PGE do Sped Contábil.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'estimativa_lucro_real', description: 'Estima, na hora, o IRPJ e a CSLL do ano pelo Lucro Real a partir do resultado da contabilidade (sem adições, exclusões, compensação de prejuízo, incentivos e retenções, que o contador informa na tela da ECF). Use quando perguntarem quanto dá de imposto no Lucro Real no ano.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'STRING', description: 'Ano-calendário com 4 dígitos. Se omitido, usa o ano anterior.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const ano = /^\d{4}$/.test(String(args.ano || '')) ? Number(args.ano) : new Date().getFullYear() - 1;
      try { return { cnpj, ...estimarLucroRealWorkspace(ws.dados, ano) }; } catch (e: any) { return { erro: String(e?.message || e) }; }
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'limite_lc224', description: 'Mostra, por trimestre, a receita bruta contra o limite de R$ 1.250.000 da Lei Complementar 224/25 (Lucro Presumido, a partir de 2026) e o excedente que paga adicional. Use quando perguntarem se a empresa estourou o limite do presumido.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'STRING', description: 'Ano-calendário com 4 dígitos. Se omitido, usa o ano atual.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const ano = /^\d{4}$/.test(String(args.ano || '')) ? Number(args.ano) : new Date().getFullYear();
      try { return { cnpj, ...limiteLc224Workspace(ws.dados, ano) }; } catch (e: any) { return { erro: String(e?.message || e) }; }
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'apuracao_lucro_real_periodos', description: 'Calcula na hora o IRPJ e a CSLL do Lucro Real por trimestre (apuração trimestral) ou mês a mês pela estimativa da receita bruta, a partir da contabilidade. Use quando perguntarem quanto dá de imposto por trimestre ou de estimativa mensal no Lucro Real.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'STRING', description: 'Ano-calendário com 4 dígitos. Se omitido, usa o ano atual.' }, tipo: { type: 'STRING', description: 'trimestral ou estimativa.' }, atividade: { type: 'STRING', description: 'Só para estimativa: comercio (8% / 12%) ou servicos (32% / 32%). Padrão: comercio.' } }, required: ['cnpj', 'tipo'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const ano = /^\d{4}$/.test(String(args.ano || '')) ? Number(args.ano) : new Date().getFullYear();
      const tipo = String(args.tipo || '').toLowerCase().startsWith('tri') ? 'trimestral' : 'estimativa';
      const atividade = /serv/i.test(String(args.atividade || '')) ? 'servicos' : 'comercio';
      try { return { cnpj, ...apuracaoPeriodosRealWorkspace(ws.dados, ano, tipo, atividade) }; } catch (e: any) { return { erro: String(e?.message || e) }; }
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'comparar_periodos', description: 'Compara receitas e despesas do mês com o mês anterior e o mesmo mês do ano anterior e explica as variações relevantes.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj), competencia = competenciaDe(args.competencia);
      if (!cnpj || !competencia) return { erro: 'Informe CNPJ e competência (AAAA-MM) válidos.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const c = compararPeriodos(ws.dados.contas || [], ws.dados.lancamentos || [], competencia);
      const v = (n: number) => reais(n / 100);
      return { cnpj, competencia, mesAnterior: c.periodoMesAnterior, anoAnterior: c.periodoAnoAnterior, receitas: c.totais.receitas.map(v), despesas: c.totais.despesas.map(v), resultado: c.totais.resultado.map(v), explicacoes: explicarVariacoes(c) };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_legislacao', description: 'Responde dúvida contábil/tributária (SPED, ECD, ECF, ICMS, ISS, Simples, Reforma Tributária, prazos) pesquisando fontes oficiais.', parameters: { type: 'OBJECT', properties: { pergunta: { type: 'STRING', description: 'A dúvida completa, com competência, UF e município quando relevantes.' } }, required: ['pergunta'] } },
    async executar(ctx, args) {
      const pergunta = typeof args.pergunta === 'string' ? args.pergunta.trim().slice(0, 3900) : '';
      if (!pergunta) return { erro: 'Informe a pergunta.' };
      const r = await ctx.chamarApi('POST', '/api/ai/chat', { message: pergunta, module: 'contabil' });
      if (r.status < 200 || r.status >= 300 || typeof r.corpo?.reply !== 'string') return erroApi(r);
      return { resposta: r.corpo.reply, fontesOficiais: r.corpo.sources || [] };
    },
  },

  // ---------------------------------------------------------------- ações (exigem confirmação)
  {
    tipo: 'acao',
    declaracao: { name: 'trazer_empresas_do_fiscal', description: 'Propõe TRAZER para o Contábil as empresas cadastradas no Murade Fiscal que ainda não existem aqui. Não altera empresas já cadastradas, não leva certificado nem senha. Só o dono do sistema.', parameters: { type: 'OBJECT', properties: {}, required: [] } },
    async preparar() {
      return { params: {}, cnpj: '', titulo: 'Trazer as empresas do Fiscal para o Contábil', descricao: ['Cadastra no Contábil os CNPJs do Murade Fiscal que ainda não estão aqui, para ninguém cadastrar duas vezes.', 'Empresas já cadastradas não mudam.'], resumo: 'Trazer empresas do Fiscal' };
    },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/empresas/importar-do-fiscal', {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: r.corpo?.sucesso === true, mensagem: String(r.corpo?.motivo || 'Concluído.'), criadas: r.corpo?.criadas || [] };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'contabilizar_prelancamentos', description: 'Propõe contabilizar (aprovar) os pré-lançamentos pendentes de conferência de UMA competência de UMA empresa. Vira cartão de confirmação mostrando quantidade e total; o servidor revalida cada um com os dados atuais do Fiscal e do DP e recusa o que não bater. Só proponha quando o usuário pedir.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const competencia = competenciaDe(args.competencia);
      if (!cnpj || !competencia) return { erro: 'Informe CNPJ e competência (AAAA-MM) válidos.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return { erro: ws.erro };
      const pend = (Array.isArray(ws.dados.preLancamentos) ? ws.dados.preLancamentos : []).filter((p: any) => p?.status === 'pendente_conferencia' && p.geradoAutomaticamente === true && p.competencia === competencia && typeof p.referenciaOrigem === 'string');
      if (!pend.length) return { erro: `Não há pré-lançamentos pendentes de conferência em ${mesAno(competencia)}.` };
      if (pend.length > 500) return { erro: 'São mais de 500 pré-lançamentos; aprove em lotes pela tela.' };
      const total = pend.reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
      return {
        cnpj, params: { cnpj, referencias: pend.map((p: any) => p.referenciaOrigem) },
        titulo: `Contabilizar ${pend.length} pré-lançamento(s) de ${mesAno(competencia)}`,
        descricao: [`Total: ${reais(total)}`, ...pend.slice(0, 6).map((p: any) => `${p.origem}: ${reais(Number(p.valor || 0))} — ${String(p.historico || '').slice(0, 60)}`), ...(pend.length > 6 ? [`… e mais ${pend.length - 6}`] : [])],
        aviso: 'Vira lançamento definitivo no razão. O servidor revalida cada item e bloqueia se algo mudou.',
        irreversivel: true, resumo: `Contabilizar ${pend.length} pré-lançamentos ${competencia}`,
      };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(params.cnpj)}/contabilizar`, { referencias: params.referencias });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: String(r.corpo?.mensagem || `Pré-lançamentos contabilizados (${params.referencias.length}).`) };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'fechar_competencia', description: 'Propõe FECHAR a competência contábil da empresa. Irreversível. O servidor bloqueia se houver pré-lançamentos ou lançamentos manuais pendentes ou inconsistências. Só proponha quando o usuário pedir expressamente.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const competencia = competenciaDe(args.competencia);
      if (!cnpj || !competencia) return { erro: 'Informe CNPJ e competência (AAAA-MM) válidos.' };
      const f = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/fechamentos`);
      if (ok(f) && (f.corpo?.fechamentos || []).some((x: any) => x.competencia === competencia)) return { erro: `A competência ${mesAno(competencia)} já está fechada.` };
      return { cnpj, params: { cnpj, competencia }, titulo: `Fechar a competência ${mesAno(competencia)}`, descricao: ['Bloqueia o mês para novos lançamentos.', 'O sistema recusa se houver conferências pendentes.'], aviso: 'Não dá para desfazer.', irreversivel: true, resumo: `Fechar competência ${competencia}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(params.cnpj)}/fechamentos`, { competencia: params.competencia });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: String(r.corpo?.mensagem || `Competência ${mesAno(params.competencia)} fechada.`) };
    },
  },
];

const INSTRUCAO_BASE = `Você é a Agente IA do Murade Contábil. Trabalha dentro do sistema para o contador, em português do Brasil, com tom calmo, direto e prático. Respostas curtas.

COMO TRABALHAR
- Para saber qualquer coisa do sistema (empresas, pendências de conferência, fechamentos, integrações, robôs), use as ferramentas de consulta. Nunca responda de memória sobre dados do cliente.
- Para dúvidas de legislação, regra, alíquota ou prazo, use consultar_legislacao e repasse as fontes oficiais.
- Se o usuário tem uma única empresa, use-a. Se há várias e ele não disse qual, pergunte. Se não disse a competência (mês), pergunte antes de agir.
- Ações que alteram dados (contabilizar_prelancamentos, fechar_competencia) NÃO são executadas por você: viram um cartão de confirmação. Depois de chamar uma ação, diga em uma frase o que ficou pronto para ele confirmar. Nunca diga que algo foi feito antes de ele confirmar.
- Você não cria nem edita lançamentos manuais, plano de contas ou mapeamentos: isso é feito nas telas.

LIMITES (diga com clareza quando o pedido bater neles)
- Folha, guias de FGTS/INSS e eSocial são do Departamento Pessoal; DAS e notas fiscais são do Fiscal. Não os faça aqui: consulte ou peça à Agente do outro sistema pelas ferramentas de comunicação.
- O Murade não transmite SPED, ECD ou ECF automaticamente.
- Nunca invente valores, datas, protocolos ou status. Se uma ferramenta devolver erro, explique o motivo com as palavras do sistema e diga o que falta.`;

export const kitContabil: KitAgente = { ferramentas: [...FERRAMENTAS, ...FERRAMENTAS_ENTRE_SISTEMAS], instrucao: INSTRUCAO_BASE + INSTRUCAO_ENTRE_SISTEMAS };
