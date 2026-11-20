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
import { FERRAMENTAS_PILOTO, INSTRUCAO_PILOTO } from './pilotoContabil';
import { FERRAMENTAS_SERVICO_COMPLETO, INSTRUCAO_SERVICO_COMPLETO, liberacaoDoConsultor } from './servicoCompleto';
import { consultorConfigurado, opcoesConsultorParaTeste, perguntarAoConsultor, regimeParaConsultor, registrarDecisaoNoConsultor, type ContextoEmpresaConsultor } from './consultorMurade';
import { acharPessoa, acharPorNome, cnpjLimpo, formatarCnpj, formatarDataBr, montarMensagemPedido, nomeDaPessoa, normalizarTexto, prazoValido } from './tarefasEquipe';
import { CHAVES_PREFERENCIA, falhou, PREFERENCIAS, descreverPreferencia, descreverReceita, detectarPedidoProtegido, idDaReceita, resolverTela, sanearNome, validarPreferencia, validarReceita } from './meuJeito';
import { blocosDoAssunto, montarApresentacao, type SecaoApresentacao } from '../data/apresentacaoSistema';
import { MODULOS_JEITO_PADRAO, PROTECOES_FIXAS, TEXTO_PROTECAO } from '../data/jeitoPadraoContabil';

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
    declaracao: { name: 'consultar_legislacao', description: 'Responde dúvida contábil/tributária (SPED, ECD, ECF, ICMS, ISS, Simples, Reforma Tributária, prazos, normas NBC/ITG) com o Consultor Murade: o que é certo, por quê, fontes oficiais e aviso de responsabilidade; pode sugerir uma ação que a Agente faz. Também use quando o contador quiser fazer diferente da norma, para trazer a orientação e a fonte.', parameters: { type: 'OBJECT', properties: { pergunta: { type: 'STRING', description: 'A dúvida completa, com competência, UF e município quando relevantes.' }, cnpj: { type: 'STRING', description: 'Opcional: CNPJ da empresa, para a resposta considerar regime, CNAE, UF, município e pendências do fechamento.' } }, required: ['pergunta'] } },
    async executar(ctx, args) {
      const pergunta = typeof args.pergunta === 'string' ? args.pergunta.trim().slice(0, 3900) : '';
      if (!pergunta) return { erro: 'Informe a pergunta.' };
      // 1) Consultor Murade (quando configurado e no ar); 2) senão, a consulta de sempre.
      // O Consultor é parte do adicional pago por escritório: só com a liberação (senão, a consulta de sempre).
      const lib = consultorConfigurado(opcoesConsultorParaTeste.atual) ? await liberacaoDoConsultor(ctx) : { liberado: false, escritorio: null };
      if (lib.liberado) {
        let contextoEmpresa: ContextoEmpresaConsultor | undefined;
        const cnpj = args.cnpj ? cnpjDe(args.cnpj) : null;
        if (cnpj) {
          const ws = await lerWorkspace(ctx, cnpj);
          if (!('erro' in ws)) {
            const e = (ws.dados.empresa || {}) as Record<string, any>;
            const comp = (() => { const [a, m] = ctx.hoje.slice(0, 7).split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; })();
            const conf = conferirFechamento({ competencia: comp, contas: ws.dados.contas || [], lancamentos: ws.dados.lancamentos || [], preLancamentos: ws.dados.preLancamentos || [], bens: ws.dados.bensImobilizado || [], confirmacoes: {} });
            contextoEmpresa = { cnpj, razaoSocial: e.razaoSocial || undefined, regime: regimeParaConsultor(e.regime), cnaePrincipal: e.cnae || undefined, uf: e.uf || undefined, municipio: e.municipio || undefined, pendencias: conf.itens.filter((i) => i.tipo === 'automatico' && !i.ok && i.bloqueia).map((i) => `${mesAno(comp)}: ${i.titulo} — ${i.detalhe}`).slice(0, 6) };
          }
        }
        const c = await perguntarAoConsultor({ pergunta, contextoEmpresa, ferramentasDisponiveis: ctx.kit.ferramentas.map((f) => ({ nome: f.declaracao.name, descricao: f.declaracao.description })), usuario: ctx.login, escritorio: lib.escritorio || undefined }, opcoesConsultorParaTeste.atual);
        if (c) return {
          fonte: 'Consultor Murade', resposta: c.resposta, fontesOficiais: c.fontes, confianca: c.confianca, encaminharContador: c.encaminharContador || undefined, motivoEncaminhamento: c.motivoEncaminhamento,
          avisoResponsabilidade: c.avisoResponsabilidade, acoesSugeridas: c.acoesSugeridas.length ? c.acoesSugeridas : undefined, divergencia: c.divergencia, recusado: c.recusado,
          instrucao: [
            'Responda com a orientação, cite as fontes oficiais (título) e diga o aviso de responsabilidade em uma frase.',
            c.acoesSugeridas.length ? 'Ofereça: "Quer que eu faça para você?". Com o sim, chame a ferramenta sugerida com os argumentos (para serviço inteiro use fazer_servico_completo).' : '',
            c.divergencia ? 'Houve divergência: diga a orientação e a fonte em uma frase e pergunte se ele confirma fazer do jeito dele. Se confirmar e for um serviço completo, chame fazer_servico_completo com decisao_do_contador (pedido = escolha do contador, orientacao_do_sistema = orientação, fonte = título da fonte); fora do serviço completo, chame registrar_decisao_contador.' : '',
            c.recusado ? 'O pedido foi recusado por ser ilegal: explique a base legal e não ofereça fazer.' : '',
          ].filter(Boolean).join(' '),
        };
      }
      const r = await ctx.chamarApi('POST', '/api/ai/chat', { message: pergunta, module: 'contabil' });
      if (r.status < 200 || r.status >= 300 || typeof r.corpo?.reply !== 'string') return erroApi(r);
      return { resposta: r.corpo.reply, fontesOficiais: r.corpo.sources || [] };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'registrar_decisao_contador', description: 'Registra que o contador CONFIRMOU fazer diferente da orientação do Consultor/da norma (fora de um serviço completo; no serviço completo use decisao_do_contador em fazer_servico_completo). Vai para o registro de decisões do Consultor Murade e para o histórico da Agente: "decisão e responsabilidade do contador".', parameters: { type: 'OBJECT', properties: { pergunta: { type: 'STRING' }, orientacao: { type: 'STRING', description: 'A orientação dada (com a regra).' }, fonte_titulo: { type: 'STRING' }, fonte_url: { type: 'STRING', description: 'Link oficial da fonte, se houver.' }, escolha_do_contador: { type: 'STRING' }, cnpj: { type: 'STRING' } }, required: ['pergunta', 'orientacao', 'escolha_do_contador'] } },
    async executar(ctx, args) {
      const t = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
      const pergunta = t(args.pergunta, 500), orientacao = t(args.orientacao, 400), escolha = t(args.escolha_do_contador, 400);
      if (!pergunta || !orientacao || !escolha) return { erro: 'Faltam a pergunta, a orientação ou a escolha do contador.' };
      const fonte = args.fonte_url ? { titulo: t(args.fonte_titulo, 160) || t(args.fonte_url, 160), url: t(args.fonte_url, 500) } : undefined;
      const lib = await liberacaoDoConsultor(ctx);
      const noConsultor = lib.escritorio ? await registrarDecisaoNoConsultor({ escritorio: lib.escritorio, usuario: ctx.login, pergunta, orientacao, fonte, escolhaDoContador: escolha }, opcoesConsultorParaTeste.atual) : false;
      const resumo = `Feito como o contador decidiu: ${escolha}. A orientação era: ${orientacao}${fonte ? ` (${fonte.titulo})` : ''}. Decisão e responsabilidade do contador.`;
      try { await ctx.registrar({ evento: 'proposta', ferramenta: 'registrar_decisao_contador', cnpj: args.cnpj ? cnpjDe(args.cnpj) : null, resumo: resumo.slice(0, 280) }); } catch { /* histórico não trava */ }
      return { registrado: true, noConsultor, instrucao: 'Diga em uma frase que ficou registrado que a orientação foi outra e que a decisão é dele, e siga com o pedido do jeito dele.' };
    },
  },

  // ---------------------------------------------------------------- ações (exigem confirmação)
  {
    tipo: 'leitura',
    declaracao: { name: 'seguranca_login', description: 'Mostra a segurança do login das últimas 24 horas: senhas e códigos errados, bloqueios por excesso de tentativas, códigos de emergência usados, quantas contas têm o código de segurança ligado e se o dono do sistema está com ele ligado. Só o dono do sistema vê. Só lê; não bloqueia nem libera ninguém.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/auth/2fa/resumo');
      if (!ok(r)) return erroApi(r);
      return { situacao: r.corpo?.texto, alerta: r.corpo?.alerta === true, numeros: r.corpo?.resumo, donosSemCodigo: r.corpo?.donosSemCodigo };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'status_backup', description: 'Mostra o estado do backup COMPLETO do banco do Contábil (a cópia cifrada guardada fora do Render): se o destino está configurado, quando foi o último backup concluído, tamanho, se deu certo, a última conferência e se passou de 26 horas sem backup. Só o dono do sistema vê. Não confundir com o backup mensal de cada escritório.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/backup-banco/status');
      if (!ok(r)) return erroApi(r);
      const c = r.corpo || {};
      if (c.configurado !== true) return { situacao: 'Backup do banco DESLIGADO: falta configurar o destino.', faltando: (c.faltando || []).map((f: any) => f.variavel), observacao: 'O passo a passo está no painel "Backup completo do banco", na tela de Integração.' };
      const u = c.ultimoSucesso;
      return {
        situacao: c.alerta?.texto || 'Em dia.', alerta: c.alerta?.nivel || null, emAndamento: Boolean(c.emAndamento),
        ultimoBackup: u ? { quando: u.finalizadoEm, tamanhoBytes: u.tamanhoBytes, tabelas: u.tabelas, linhas: u.linhas, origem: u.origem, horasAtras: c.horasSemBackup, conferido: u.validadoEm ? (u.validacaoOk ? 'íntegro' : 'com problema') : 'ainda não conferido' } : null,
        ultimaTentativa: c.ultimo ? { resultado: c.ultimo.resultado, quando: c.ultimo.iniciadoEm, erro: c.ultimo.erro } : null,
        ultimaConferencia: c.ultimaConferencia ? { ok: c.ultimaConferencia.ok, mensagem: c.ultimaConferencia.mensagem } : null,
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'backup_agora', description: 'Propõe fazer AGORA o backup COMPLETO do banco do Contábil e enviar, cifrado, para o destino fora do Render (sem esperar o robô das 3h). Só o dono do sistema. Só lê o banco; não altera nem apaga nada. Use quando o dono pedir para fazer o backup do banco na hora.', parameters: { type: 'OBJECT', properties: {}, required: [] } },
    async preparar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/backup-banco/status');
      if (!ok(r)) return erroApi(r);
      if (r.corpo?.configurado !== true) return { erro: 'Falta configurar o destino do backup (variáveis MURADE_BACKUP_* no Render). O passo a passo está no painel "Backup completo do banco".' };
      if (r.corpo?.emAndamento) return { erro: 'Já existe um backup em andamento. Aguarde terminar.' };
      return { cnpj: '', params: {}, titulo: 'Fazer o backup completo do banco agora', descricao: ['Gera a cópia cifrada de todo o banco do Murade Contábil e envia para o destino configurado' + (r.corpo?.destino?.bucket ? ` (bucket ${r.corpo.destino.bucket})` : '') + '.', 'Só lê o banco: nada do sistema é alterado ou apagado. Leva de alguns segundos a poucos minutos.'], resumo: 'Fazer o backup completo do banco agora' };
    },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/backup-banco/gerar', {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: r.corpo?.mensagem || 'Backup iniciado.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'redefinir_codigo_usuario', description: 'Propõe redefinir o código de segurança de um usuário que perdeu o celular: o código é desligado, ele sai de todos os aparelhos e entra de novo só com a senha (depois pode ligar o código outra vez). O dono do sistema pode redefinir qualquer usuário; o administrador de um escritório, só os da própria equipe.', parameters: { type: 'OBJECT', properties: { login: { type: 'STRING', description: 'Usuário (e-mail) de quem perdeu o celular.' } }, required: ['login'] } },
    async preparar(_ctx, args) {
      const login = String(args.login || '').trim().toLowerCase();
      if (login.length < 3 || login.length > 80 || !/^[a-z0-9._@+-]+$/.test(login)) return { erro: 'Informe o usuário (e-mail) de quem perdeu o celular.' };
      return { cnpj: '', params: { login }, titulo: 'Redefinir código de segurança', descricao: [`Usuário ${login}`, 'O código de segurança dele é desligado e ele sai de todos os aparelhos. Entra de novo só com a senha e pode ligar o código outra vez.'], aviso: 'Confirme que é mesmo a pessoa quem pediu (por exemplo, por telefone), porque quem tiver só a senha passa a entrar sem o código até ele ligar de novo.', resumo: `Redefinir código de segurança de ${login}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/auth/2fa/redefinir', params);
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: r.corpo?.aviso || 'Código redefinido.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'rodar_robo_agora', description: 'Propõe rodar AGORA, sem esperar o próximo horário, a rodada de um robô do Contábil (por exemplo o Reconciliador que recebe do Fiscal e do DP, o Conferidor do fechamento, o de empresas do Fiscal, o de backups ou o de acessos). Só o dono do sistema pode. O Contabilizador não roda sozinho: lançamento definitivo só com aprovação de uma pessoa. Use status_robos para ver os nomes (id) dos robôs.', parameters: { type: 'OBJECT', properties: { robo: { type: 'STRING', description: 'Identificador do robô, como aparece em status_robos (ex.: reconciliador, conferidor, mensageiro, backups).' } }, required: ['robo'] } },
    async preparar(ctx, args) {
      const id = String(args.robo || '').trim().toLowerCase();
      if (!/^[a-z_]{2,40}$/.test(id)) return { erro: 'Diga qual robô rodar (use status_robos para ver a lista).' };
      const r = await ctx.chamarApi('GET', '/api/robos/status');
      if (!ok(r)) return erroApi(r);
      if (r.corpo?.ehDono !== true) return { erro: 'Somente o dono do sistema pode rodar os robôs na hora.' };
      const robo = (r.corpo?.robos || []).find((x: any) => x.id === id);
      if (!robo) return { erro: 'Não encontrei esse robô. Use status_robos para ver a lista.' };
      if (robo.podeRodarAgora !== true) return { erro: `${robo.nome} não pode ser disparado na hora (não tem rotina automática ou depende de aprovação de uma pessoa).` };
      return { cnpj: '', params: { robo: id }, titulo: `Rodar agora: ${robo.nome}`, descricao: [robo.nome, 'A rodada começa já, sem esperar o próximo horário. O agendamento normal continua igual.'], resumo: `Rodar agora o robô ${robo.nome}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/robos/${q(String(params.robo))}/rodar-agora`, {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: r.corpo?.mensagem || 'Robô disparado.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'reprocessar_recepcao', description: 'Propõe REPROCESSAR a recepção de uma empresa: refaz agora os rascunhos contábeis com o que o Fiscal e o DP já enviaram, sem esperar o robô (que tenta sozinho a cada minuto). Não aprova nem apaga nada. Use quando algo enviado pelo Fiscal ou pelo DP não apareceu para conferência.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj }, required: ['cnpj'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      return { cnpj, params: { cnpj }, titulo: 'Reprocessar a recepção do Fiscal e do DP', descricao: [`Empresa ${cnpj}`, 'Prepara de novo os rascunhos com os dados já recebidos. Nada é aprovado nem apagado.'], resumo: `Reprocessar recepção ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/reprocessar-recepcao`, {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Recepção reprocessada.') };
    },
  },
  {
    tipo: 'acao',
    exclusao: true, // apaga uma empresa de todos os sistemas: o cartão pede duas confirmações (Continuar, depois "Sim, excluir")
    declaracao: {
      name: 'apagar_empresa',
      description: 'Propõe EXCLUIR UMA empresa (acesso de todos os usuários, cadastro e área de trabalho no Contábil) e avisar o Fiscal para apagar também; o Fiscal avisa os outros sistemas. Uma empresa por vez, nunca em lote. Vira cartão de duas confirmações com nome e CNPJ; o CNPJ continua livre para cadastrar de novo e fechamentos e auditorias ficam guardados. Só proponha quando o usuário pedir expressamente; se o nome for ambíguo, pergunte qual.',
      parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, empresa: { type: 'STRING', description: 'Opcional. Nome da empresa como o usuário falou, se não souber o CNPJ.' } }, required: [] },
    },
    async preparar(ctx, args) {
      let cnpj = cnpjDe(args.cnpj);
      let nome = '';
      const emp = await ctx.chamarApi('GET', '/api/workspaces');
      const itens: Array<{ cnpj: string; razaoSocial?: string; nomeFantasia?: string }> = ok(emp) ? (emp.corpo?.empresas || emp.corpo?.workspaces || []) : [];
      if (!cnpj) {
        const falado = normalizarTexto(String(args.empresa || ''));
        if (!falado) return { erro: 'Diga qual empresa excluir (nome ou CNPJ). Pergunte ao usuário; não escolha por conta própria.' };
        const achadas = itens.filter((e) => normalizarTexto(`${e.razaoSocial || ''} ${e.nomeFantasia || ''}`).includes(falado));
        if (!achadas.length) return { erro: `Não encontrei "${args.empresa}" entre as empresas do escritório. Use listar_empresas e pergunte ao usuário qual é.` };
        if (achadas.length > 1) return { erro: `Há mais de uma empresa parecida com "${args.empresa}": ${achadas.map((e) => `${e.razaoSocial || e.nomeFantasia} (${e.cnpj})`).join('; ')}. Pergunte ao usuário qual; não escolha por conta própria.` };
        cnpj = cnpjDe(achadas[0].cnpj);
      }
      if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const achada = itens.find((e) => cnpjDe(e.cnpj) === cnpj);
      nome = String(achada?.razaoSocial || achada?.nomeFantasia || '').trim();
      return {
        cnpj, params: { cnpj },
        titulo: `Excluir a empresa ${nome ? `${nome} ` : ''}(CNPJ ${cnpj})`,
        descricao: ['Sai o acesso de todos os usuários a esta empresa, o cadastro e a área de trabalho dela no Contábil.', 'O Fiscal é avisado e apaga também; ele avisa os outros sistemas.', 'Fechamentos de período e trilhas de auditoria continuam guardados.', 'O CNPJ não fica bloqueado: dá para cadastrar de novo depois.'],
        aviso: 'Uma empresa por vez. Isso não pode ser desfeito pela tela.', irreversivel: true, resumo: `Excluir empresa ${cnpj}`,
      };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('DELETE', `/api/auth/companies/${q(String(params.cnpj))}`);
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      const hub = r.corpo?.cascata;
      const fiscal = hub?.avisado ? 'O Fiscal foi avisado.' : `O Fiscal não confirmou (${hub?.motivo || 'sem resposta'}); o Robô Conferidor de Empresas Excluídas avisa se algo sobrar.`;
      return { sucesso: true, mensagem: `Empresa ${params.cnpj} excluída do Contábil. ${fiscal}` };
    },
  },
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
      if (ok(f) && (f.corpo?.fechamentos || []).some((x: any) => x.competencia === competencia)) {
        // Diz quem fechou e quando (mesma decisão do servidor); se a consulta falhar, mantém a resposta simples.
        const quem = await ctx.chamarApi('GET', `/api/servico-feito?tipo=${q('fechamento:periodo')}&cnpj=${q(cnpj)}&referencia=${q(competencia)}`).catch(() => null);
        const msg = quem && ok(quem) ? (quem.corpo?.registros?.[0]?.mensagem as string | undefined) : undefined;
        return { erro: `A competência ${mesAno(competencia)} já está fechada.${msg ? ` ${msg}` : ''}` };
      }
      return { cnpj, params: { cnpj, competencia }, titulo: `Fechar a competência ${mesAno(competencia)}`, descricao: ['Bloqueia o mês para novos lançamentos.', 'O sistema recusa se houver conferências pendentes.'], aviso: 'Não dá para desfazer.', irreversivel: true, resumo: `Fechar competência ${competencia}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(params.cnpj)}/fechamentos`, { competencia: params.competencia });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: String(r.corpo?.mensagem || `Competência ${mesAno(params.competencia)} fechada.`) };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'delegar_tarefa',
      description: 'Propõe PEDIR um serviço a uma pessoa da equipe do escritório (ex.: "peça para a Nilva conciliar o banco da empresa X"). Vira cartão de confirmação; ao confirmar, a pessoa recebe a mensagem pronta no topo da tela e na lista Pedidos da contadora, e quem pediu vê quando foi visto e concluído. Só a administradora do escritório pede para OUTRA pessoa; funcionário comum só cria tarefa para si (deixe o destinatário vazio). Se o nome for ambíguo ou não existir, a ferramenta avisa: pergunte ao usuário, nunca escolha por conta própria. Funciona igual por voz e por chat.',
      parameters: { type: 'OBJECT', properties: {
        destinatario: { type: 'STRING', description: 'Nome (ou parte do nome) ou usuário da pessoa da equipe que vai fazer o serviço, como o usuário falou. Vazio ou "para mim" = tarefa para o próprio usuário.' },
        servico: { type: 'STRING', description: 'O serviço pedido, curto e no infinitivo, por exemplo "conciliar o banco".' },
        empresa: { type: 'STRING', description: 'Opcional. CNPJ ou nome da empresa do escritório a que o serviço se refere.' },
        prazo: { type: 'STRING', description: 'Opcional. Dia limite, só se o usuário disse, no formato AAAA-MM-DD (calcule a partir da data de hoje).' },
      }, required: ['servico'] },
    },
    async preparar(ctx, args) {
      const servico = String(args.servico || '').replace(/\s+/g, ' ').trim();
      if (servico.length < 3 || servico.length > 200) return { erro: 'Diga qual é o serviço a pedir.' };
      const eq = await ctx.chamarApi('GET', '/api/tarefas-equipe/equipe');
      if (!ok(eq)) return erroApi(eq);
      const equipe: Array<{ id: string; login: string; nome: string }> = eq.corpo?.equipe || [];
      const pessoas = equipe.map((p) => ({ id: p.id, login: p.login, nome: p.nome === p.login ? null : p.nome }));
      const eu = pessoas.find((p) => p.id === eq.corpo?.eu);
      if (!eu) return { erro: 'Não consegui identificar o seu usuário neste escritório.' };
      const falado = String(args.destinatario || '').trim();
      const ehEu = !falado || /^(eu|mim|para mim|pra mim|eu mesm[oa]|mim mesm[oa]|para mim mesm[oa]|pra mim mesm[oa])$/.test(normalizarTexto(falado));
      let alvo = eu;
      if (!ehEu) {
        const a = acharPessoa(pessoas, falado);
        if (a.tipo === 'nenhum') return { erro: `Não encontrei "${falado}" na equipe deste escritório. Pessoas da equipe: ${pessoas.map((p) => nomeDaPessoa(p)).join(', ')}. Pergunte ao usuário a quem se refere; não escolha por conta própria.` };
        if (a.tipo === 'ambiguo') return { erro: `Há mais de uma pessoa parecida com "${falado}": ${a.itens.map((p) => `${nomeDaPessoa(p)} (${p.login})`).join('; ')}. Pergunte ao usuário qual delas; não escolha por conta própria.` };
        alvo = a.item;
      }
      if (alvo.id !== eu.id && eq.corpo?.podeDelegar !== true) return { erro: 'Somente a administradora do escritório pede serviço para outra pessoa. Você pode criar a tarefa só para você mesmo.' };
      let cnpj: string | null = null; let empresaNome: string | null = null;
      if (String(args.empresa || '').trim()) {
        const lista = await ctx.chamarApi('GET', '/api/workspaces');
        if (!ok(lista)) return erroApi(lista);
        const empresas = (lista.corpo?.empresas || []).map((e: any) => ({ cnpj: String(e.cnpj || '').toUpperCase(), nome: String(e.razaoSocial || e.nomeFantasia || e.nome || ''), fantasia: String(e.nomeFantasia || '') }));
        const c = cnpjLimpo(args.empresa);
        const a = c ? (empresas.find((e: any) => e.cnpj === c) ? { tipo: 'unico' as const, item: empresas.find((e: any) => e.cnpj === c) } : { tipo: 'nenhum' as const }) : acharPorNome(empresas, String(args.empresa), (e: any) => [e.nome, e.fantasia]);
        if (a.tipo === 'nenhum') return { erro: `Não encontrei a empresa "${args.empresa}" entre as empresas do escritório. Use listar_empresas e pergunte ao usuário qual é.` };
        if (a.tipo === 'ambiguo') return { erro: `Há mais de uma empresa parecida com "${args.empresa}": ${a.itens.map((e: any) => `${e.nome} (${formatarCnpj(e.cnpj)})`).join('; ')}. Pergunte qual delas.` };
        cnpj = (a as any).item.cnpj; empresaNome = (a as any).item.nome || null;
      }
      let prazo: string | null = null;
      if (String(args.prazo || '').trim()) {
        prazo = prazoValido(args.prazo);
        if (!prazo) return { erro: 'Prazo inválido. Use o dia no formato AAAA-MM-DD.' };
        if (prazo < ctx.hoje) return { erro: 'O prazo já passou. Peça ao usuário um dia de hoje em diante.' };
      }
      const rotuloEmpresa = cnpj ? (empresaNome || formatarCnpj(cnpj)) : null;
      const pedinte = ctx.nomeUsuario || ctx.login;
      const previa = alvo.id === eu.id ? `Tarefa sua: ${servico}${rotuloEmpresa ? ` — empresa ${rotuloEmpresa}` : ''}${prazo ? ` — prazo ${formatarDataBr(prazo)}` : ''}` : montarMensagemPedido({ destinatario: nomeDaPessoa(alvo), pedinte, servico, empresa: rotuloEmpresa, prazo });
      return {
        cnpj: cnpj || '', params: { destinatarioLogin: alvo.login, titulo: servico, cnpj: cnpj || '', prazo: prazo || '' },
        titulo: alvo.id === eu.id ? `Anotar tarefa para você: ${servico}` : `Pedir a ${nomeDaPessoa(alvo)}: ${servico}`,
        descricao: [`Para: ${nomeDaPessoa(alvo)} (${alvo.login})`, `Serviço: ${servico}`, ...(rotuloEmpresa ? [`Empresa: ${rotuloEmpresa}`] : []), ...(prazo ? [`Prazo: ${formatarDataBr(prazo)}`] : []), `Mensagem: ${previa}`],
        resumo: `${alvo.id === eu.id ? 'Tarefa própria' : `Pedir a ${alvo.login}`}: ${servico}`.slice(0, 280),
      };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/tarefas-equipe', { destinatarioLogin: params.destinatarioLogin, titulo: params.titulo, cnpj: params.cnpj || undefined, prazo: params.prazo || undefined });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      const t = r.corpo?.tarefa;
      const aviso = r.corpo?.avisado === false ? ' O aviso na tela falhou agora, mas o pedido está guardado e o robô avisa em seguida.' : '';
      return { sucesso: true, mensagem: t?.origem === 'delegada' ? `Pedido registrado. ${t.destinatario?.nome} recebe: ${t.mensagem}.${aviso}` : `Tarefa anotada para você: ${t?.titulo || params.titulo}.` };
    },
  },
  // ---------------------------------------------------------------- Meu jeito (cada pessoa trabalha de um jeito)
  {
    tipo: 'acao',
    declaracao: {
      name: 'aprender_meu_jeito',
      description: 'Propõe SALVAR o jeito de trabalhar da pessoa (preferência de uso ou regra), depois que ela contou como prefere. Vira cartão de confirmação mostrando como você entendeu; só vale após o sim. tipo "preferencia": chave telaInicial (tela ao entrar), menuFavoritos (até 6 telas no topo do menu), nivelConversa (curto ou detalhado), velocidadePiloto (calma, normal ou rapida), confirmacaoNaoProtegida (completa ou resumida; só muda o detalhe do cartão, nunca tira a confirmação), observarUso (sim ou nao). tipo "regra": "ao entrar" ou "ao abrir uma tela", com até 3 passos em ordem: mostrar_atalho (botão para outra tela), destacar_secao (rolar até uma parte da tela aberta) ou perguntar_agente (consulta de leitura). tipo "sugestao": aceitar uma sugestão que mostrar_meu_jeito listou, usando o id dela. NUNCA use para desligar confirmação, proteção, robô, cálculo, anti-duplicidade ou regra do SERPRO, nem para apagar em lote: nesses casos explique com gentileza que o sistema mantém por segurança. Não guarda o que a pessoa digita nem dado de empresa ou lançamento.',
      parameters: { type: 'OBJECT', properties: {
        tipo: { type: 'STRING', description: 'preferencia, regra ou sugestao.' },
        chave: { type: 'STRING', description: 'Só para preferencia: telaInicial, menuFavoritos, nivelConversa, velocidadePiloto, confirmacaoNaoProtegida ou observarUso.' },
        valor: { type: 'STRING', description: 'Só para preferencia: o valor (nome da tela, lista de telas separadas por vírgula, curto/detalhado, calma/normal/rapida, completa/resumida, sim/nao).' },
        escopo: { type: 'STRING', description: 'usuario (padrão: só para esta pessoa) ou escritorio (padrão de todo o escritório; só a administradora, e só quando ela pedir isso).' },
        quando: { type: 'STRING', description: 'Só para regra: entrar (ao entrar no sistema) ou abrir_tela.' },
        tela_quando: { type: 'STRING', description: 'Só para regra com quando=abrir_tela: o nome da tela que dispara a regra.' },
        passos: { type: 'ARRAY', description: 'Só para regra: de 1 a 3 passos, na ordem em que a pessoa quer.', items: { type: 'OBJECT', properties: {
          acao: { type: 'STRING', description: 'mostrar_atalho, destacar_secao ou perguntar_agente.' },
          tela: { type: 'STRING', description: 'mostrar_atalho: a tela do atalho. destacar_secao: a tela aberta.' },
          secao: { type: 'STRING', description: 'destacar_secao: o título da parte da tela (ex.: Balancete de verificação).' },
          assunto: { type: 'STRING', description: 'perguntar_agente: pendencias, achados-conferidor, status-robos ou vencimentos.' },
        } } },
        sugestao_id: { type: 'STRING', description: 'Só para sugestao: o id que mostrar_meu_jeito devolveu.' },
        como_a_pessoa_pediu: { type: 'STRING', description: 'A frase da pessoa, resumida. Serve só para checar se ela pediu algo que o sistema protege; nunca é guardada.' },
      }, required: ['tipo'] },
    },
    async preparar(ctx, args) {
      const pediu = detectarPedidoProtegido(args.como_a_pessoa_pediu);
      if (pediu) return { erro: `${pediu} Explique isso com gentileza e não tente salvar de outro jeito; se não era isso que a pessoa pediu, peça para ela dizer de outro modo.` };
      const tipo = normalizarTexto(args.tipo);
      const jeito = await ctx.chamarApi('GET', '/api/meu-jeito');
      if (!ok(jeito)) return erroApi(jeito);
      const v = jeito.corpo?.jeito || {};
      if (tipo === 'preferencia') {
        const r = validarPreferencia(args.chave, args.valor);
        if (falhou(r)) return { erro: r.protegido ? `${r.motivo} Explique isso com gentileza ao usuário.` : r.motivo };
        const escopo = normalizarTexto(args.escopo) === 'escritorio' ? 'escritorio' : 'usuario';
        if (escopo === 'escritorio') {
          if (v.podeEditarEscritorio !== true) return { erro: 'Só a administradora do escritório muda o jeito padrão do escritório. Posso salvar só para esta pessoa.' };
          if (!PREFERENCIAS[r.chave].escopoEscritorio) return { erro: `"${PREFERENCIAS[r.chave].rotulo}" é pessoal e não pode virar padrão do escritório.` };
        }
        const dito = descreverPreferencia(r.chave, r.valor);
        return {
          cnpj: '', params: { tipo: 'preferencia', chave: r.chave, valor: r.valor, escopo },
          titulo: `Aprender o seu jeito: ${dito}`,
          descricao: [`Entendi assim: ${dito}`, escopo === 'escritorio' ? 'Vira o padrão de todas as pessoas do escritório (quem tiver o próprio jeito continua com o dele).' : 'Vale só para você.', 'Você volta ao jeito padrão quando quiser, uma regra por vez, em Meu jeito.'],
          resumo: `Meu jeito: ${dito}${escopo === 'escritorio' ? ' (escritório)' : ''}`.slice(0, 280),
        };
      }
      if (tipo === 'regra') {
        const quando = normalizarTexto(args.quando);
        const gatilho = quando.startsWith('entr') ? { tipo: 'entrar_no_sistema' } : { tipo: 'abrir_tela', tela: args.tela_quando };
        const acoes = (Array.isArray(args.passos) ? args.passos : []).slice(0, 6).map((p: any) => {
          const o: Record<string, unknown> = { tipo: String(p?.acao ?? '').trim() };
          if (p?.tela) o.tela = p.tela; if (p?.secao) o.secao = p.secao; if (p?.assunto) o.assunto = p.assunto;
          return o;
        });
        const r = validarReceita({ gatilho, acoes });
        if (falhou(r)) return { erro: r.protegido ? `${r.motivo} Explique isso com gentileza ao usuário.` : r.motivo };
        const dito = descreverReceita(r);
        const antiga = (v.receitas || []).find((x: any) => x.id === idDaReceita(r.gatilho) && !x.obsoleta);
        return {
          cnpj: '', params: { tipo: 'regra', gatilho: r.gatilho, acoes: r.acoes },
          titulo: `Aprender uma regra: ${dito}`.slice(0, 160),
          descricao: [`Entendi assim: ${dito}`, ...(antiga ? [`Isto troca a regra que você já tinha para este momento: ${antiga.descricao}`] : []), ...(r.acoes.some((a) => a.tipo === 'perguntar_agente') ? ['Perguntar à Agente usa crédito de IA a cada vez que a regra rodar.'] : []), 'Você remove ou muda a regra quando quiser, em Meu jeito. A regra nunca confirma nada por você.'],
          resumo: `Meu jeito (regra): ${dito}`.slice(0, 280),
        };
      }
      if (tipo === 'sugestao') {
        const id = String(args.sugestao_id ?? '');
        const s = (v.sugestoes || []).find((x: any) => x.id === id);
        if (!s) return { erro: 'Essa sugestão não existe mais. Use mostrar_meu_jeito para ver as sugestões de agora.' };
        return { cnpj: '', params: { tipo: 'sugestao', id }, titulo: 'Aceitar a sugestão de atalho', descricao: [s.texto, 'Só vale se você confirmar aqui.'], resumo: `Meu jeito: aceitar sugestão ${id}`.slice(0, 280) };
      }
      return { erro: 'Diga se é uma preferência, uma regra ou uma sugestão a aceitar.' };
    },
    async executar(ctx, params) {
      let r;
      if (params.tipo === 'preferencia') r = await ctx.chamarApi('POST', '/api/meu-jeito/preferencias', { chave: params.chave, valor: params.valor, escopo: params.escopo });
      else if (params.tipo === 'regra') r = await ctx.chamarApi('POST', '/api/meu-jeito/receitas', { gatilho: params.gatilho, acoes: params.acoes });
      else r = await ctx.chamarApi('POST', '/api/meu-jeito/sugestoes/aceitar', { id: params.id });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: 'Pronto, salvei o seu jeito. A partir de agora eu trabalho assim com você.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'mostrar_meu_jeito', description: 'Mostra o que a Agente já aprendeu do jeito de trabalhar DESTA pessoa (preferências, regras e sugestões) e de onde vem cada valor (dela, do escritório ou do padrão do sistema). Use quando perguntarem "o que você aprendeu de mim?", "mostra meu jeito" ou antes de aceitar uma sugestão.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/meu-jeito');
      if (!ok(r)) return erroApi(r);
      const j = r.corpo?.jeito || {};
      const quem: Record<string, string> = { voce: 'definido por você', escritorio: 'padrão do escritório', padrao: 'jeito padrão do sistema' };
      return {
        preferencias: (j.preferencias || []).map((p: any) => ({ nome: p.rotulo, valor: p.valorTexto, origem: quem[p.origem] || p.origem })),
        regras: (j.receitas || []).map((x: any) => ({ regra: x.descricao, situacao: x.obsoleta ? 'obsoleta (pausada: o sistema mudou)' : 'valendo' })),
        sugestoes: (j.sugestoes || []).map((s: any) => ({ id: s.id, texto: s.texto })),
        aberturasContadas: j.sessoes, podeMudarPadraoDoEscritorio: j.podeEditarEscritorio === true,
        observacao: 'Só guardo preferências de uso; nada do que a pessoa digita nem dado de empresa ou lançamento. Sugestões só viram regra se a pessoa disser sim (use aprender_meu_jeito com tipo sugestao).',
      };
    },
  },
  {
    tipo: 'acao',
    exclusao: true, // remove algo salvo: o cartão pede duas confirmações (Continuar, depois "Sim, excluir")
    declaracao: {
      name: 'esquecer_regra_do_jeito',
      description: 'Propõe VOLTAR AO JEITO PADRÃO em UMA coisa só: uma preferência (ex.: tela ao entrar) ou uma regra "ao abrir X". Vira cartão de confirmação. Uma por vez: se a pessoa pedir "apaga tudo", explique que o sistema desfaz uma regra por vez, para ninguém perder o que não queria, e pergunte qual.',
      parameters: { type: 'OBJECT', properties: {
        tipo: { type: 'STRING', description: 'preferencia ou regra.' },
        chave: { type: 'STRING', description: 'Para preferencia: a chave (telaInicial, menuFavoritos, nivelConversa, velocidadePiloto, confirmacaoNaoProtegida, observarUso) ou o nome dela.' },
        quando: { type: 'STRING', description: 'Para regra: entrar ou abrir_tela.' },
        tela_quando: { type: 'STRING', description: 'Para regra com quando=abrir_tela: a tela.' },
        escopo: { type: 'STRING', description: 'usuario (padrão) ou escritorio (só a administradora).' },
      }, required: ['tipo'] },
    },
    async preparar(ctx, args) {
      if (/\b(tudo|todas?|todos?)\b/.test(normalizarTexto(args.chave)) || /\b(tudo|todas?|todos?)\b/.test(normalizarTexto(args.tela_quando))) return { erro: 'O sistema desfaz uma regra por vez, para ninguém perder o que queria manter. Pergunte ao usuário qual delas.' };
      const r = await ctx.chamarApi('GET', '/api/meu-jeito');
      if (!ok(r)) return erroApi(r);
      const j = r.corpo?.jeito || {};
      const tipo = normalizarTexto(args.tipo);
      const escopo = normalizarTexto(args.escopo) === 'escritorio' ? 'escritorio' : 'usuario';
      if (tipo === 'preferencia') {
        const alvo = CHAVES_PREFERENCIA.length ? acharPorNome(CHAVES_PREFERENCIA.map((k) => ({ k, rotulo: PREFERENCIAS[k].rotulo })), String(args.chave ?? ''), (x) => [x.k, x.rotulo]) : { tipo: 'nenhum' as const };
        if (alvo.tipo !== 'unico') return { erro: `Qual preferência? ${CHAVES_PREFERENCIA.map((k) => PREFERENCIAS[k].rotulo).join('; ')}.` };
        const k = alvo.item.k; const p = (j.preferencias || []).find((x: any) => x.chave === k);
        if (escopo === 'escritorio') {
          if (j.podeEditarEscritorio !== true) return { erro: 'Só a administradora do escritório muda o jeito padrão do escritório.' };
          if (!p || p.valorEscritorio === null || p.valorEscritorio === undefined) return { erro: `O escritório não tem um padrão salvo para "${PREFERENCIAS[k].rotulo}".` };
        } else if (!p || p.origem !== 'voce') return { erro: `Você não tem "${PREFERENCIAS[k].rotulo}" salvo no seu jeito; já está no ${p?.origem === 'escritorio' ? 'padrão do escritório' : 'jeito padrão do sistema'}.` };
        return { cnpj: '', params: { tipo: 'preferencia', chave: k, escopo }, titulo: `Voltar ao jeito padrão: ${PREFERENCIAS[k].rotulo}`, descricao: [`Desfaz só isto: ${descreverPreferencia(k, escopo === 'escritorio' ? p.valorEscritorio : p.valor)}`, 'As outras coisas do seu jeito continuam como estão.'], resumo: `Meu jeito: voltar ao padrão em ${PREFERENCIAS[k].rotulo}`.slice(0, 280) };
      }
      if (tipo === 'regra') {
        const quando = normalizarTexto(args.quando);
        let id = 'entrar';
        if (!quando.startsWith('entr')) { const t = resolverTela(args.tela_quando); if (falhou(t)) return { erro: t.motivo }; id = `abrir:${t.id}`; }
        const regra = (j.receitas || []).find((x: any) => x.id === id);
        if (!regra) return { erro: 'Você não tem uma regra salva para esse momento. Use mostrar_meu_jeito para ver as regras.' };
        return { cnpj: '', params: { tipo: 'regra', id }, titulo: 'Voltar ao jeito padrão: remover uma regra', descricao: [`Remove só esta regra: ${regra.descricao}`, 'As outras regras e preferências continuam como estão.'], resumo: `Meu jeito: remover regra ${id}`.slice(0, 280) };
      }
      return { erro: 'Diga se é uma preferência ou uma regra.' };
    },
    async executar(ctx, params) {
      const r = params.tipo === 'preferencia'
        ? await ctx.chamarApi('POST', '/api/meu-jeito/preferencias/remover', { chave: params.chave, escopo: params.escopo })
        : await ctx.chamarApi('POST', '/api/meu-jeito/receitas/remover', { id: params.id });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: 'Pronto, voltei ao jeito padrão nessa parte. O resto do seu jeito continua igual.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'mudar_meu_nome',
      description: 'Propõe MUDAR o nome pelo qual a Agente chama esta pessoa ("me chama de Ana", "meu nome agora é Beto", "mudar meu nome"). Vira cartão de confirmação com o nome entendido; só vale após o sim. Só o nome (curto, sem números nem símbolos); não muda login, e-mail nem cadastro.',
      parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING', description: 'Como a pessoa quer ser chamada (só o nome, até 3 palavras).' } }, required: ['nome'] },
    },
    async preparar(_ctx, args) {
      const nome = sanearNome(args.nome);
      if (!nome) return { erro: 'Não entendi o nome. Peça à pessoa para dizer só como quer ser chamada, por exemplo: Ana.' };
      return { cnpj: '', params: { nome }, titulo: `Chamar você de ${nome}`, descricao: [`A Agente passa a te chamar de ${nome}.`, 'Muda só o nome de tratamento; login e cadastro continuam iguais. Você muda de novo quando quiser.'], resumo: `Meu jeito: nome de tratamento ${nome}`.slice(0, 280) };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/meu-jeito/nome', { nome: params.nome });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: `Pronto, a partir de agora eu te chamo de ${params.nome}.` };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'explicar_jeito_padrao', description: 'Explica como o sistema funciona por padrão (o jeito padrão de cada módulo), a partir de um arquivo fixo e verificado, sem gastar IA. Use quando pedirem "mostra como o sistema funciona" ou "para que serve a tela X". Informe o módulo para explicar só um.', parameters: { type: 'OBJECT', properties: { modulo: { type: 'STRING', description: 'Opcional: nome da tela do menu (ex.: Balancete). Vazio = todos os módulos.' } } } },
    async executar(_ctx, args) {
      const pedido = String(args.modulo ?? '').trim();
      if (pedido) {
        const t = resolverTela(pedido);
        if (falhou(t)) return { erro: t.motivo };
        const m = MODULOS_JEITO_PADRAO.find((x) => x.id === t.id)!;
        return { modulo: m.rotulo, comoFunciona: m.resumo, observacao: 'Este é o jeito padrão do sistema; a pessoa pode ter o próprio jeito por cima (mostrar_meu_jeito).' };
      }
      return { modulos: MODULOS_JEITO_PADRAO.filter((m) => m.id !== 'meu-jeito').map((m) => ({ tela: m.rotulo, comoFunciona: m.resumo })), oQueNuncaMuda: PROTECOES_FIXAS, observacao: `${TEXTO_PROTECAO} Conte em poucas frases; não leia a lista inteira se a pessoa não pediu.` };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'apresentar_sistema', description: 'Conta o que o Murade Contábil faz, a partir do texto FIXO e conferido com o código (sem IA): módulos, o que é automático (robôs e quando rodam), o que depende do contador, integrações e o que o sistema ainda não faz. Use para "o que o sistema faz?", "o que é automático?", "para que serve a tela X?", "o que o sistema não faz?". Informe secao (modulos, automatico, depende, integracoes ou limites) ou modulo (nome da tela). Sem parâmetros devolve só o índice. A apresentação completa em blocos falados, com pausa e "me mostra onde", é iniciada pela própria tela quando a pessoa diz "me conta tudo o que o sistema faz".', parameters: { type: 'OBJECT', properties: { secao: { type: 'STRING', description: 'modulos, automatico, depende, integracoes ou limites.' }, modulo: { type: 'STRING', description: 'Opcional: nome da tela do menu (ex.: Balancete).' } } } },
    async executar(ctx, args) {
      const robos = await ctx.chamarApi('GET', '/api/robos/status').catch(() => null);
      const ehDono = Boolean(robos && ok(robos) && robos.corpo?.ehDono === true);
      const dica = 'Conte com suas palavras, curto, só o que foi pedido, sem inventar nada além dos blocos. Se a pessoa quiser ouvir tudo em blocos com pausa, diga para ela falar: me conta tudo o que o sistema faz. Para mostrar onde fica algo, use mostrar_na_tela com a tela do bloco.';
      if (String(args.modulo ?? '').trim()) {
        const t = resolverTela(args.modulo); if (falhou(t)) return { erro: t.motivo };
        return { blocos: blocosDoAssunto({ modulo: t.id }, ehDono).map((b) => ({ titulo: b.titulo, falar: b.falar, tela: b.tela })), instrucao: dica };
      }
      const secao = normalizarTexto(args.secao) as SecaoApresentacao;
      if (['modulos', 'automatico', 'depende', 'integracoes', 'limites'].includes(secao)) return { blocos: blocosDoAssunto({ secao }, ehDono).map((b) => ({ titulo: b.titulo, falar: b.falar, tela: b.tela })), instrucao: dica };
      return { indice: ['modulos (cada tela do menu)', 'automatico (os robôs e quando rodam)', 'depende (o que só acontece com o seu sim)', 'integracoes (o que chega do Fiscal e do DP e o que não é integrado)', 'limites (o que o sistema ainda não faz)'], totalDeBlocos: montarApresentacao(ehDono).length, instrucao: dica };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'perguntar_integracoes', description: 'Responde "o que é integrado?", "o que chega do Fiscal e do DP?", "como entra o pró-labore, as notas e a folha?", "com quem o Contábil NÃO é integrado?" com o texto FIXO e conferido com o código: o que chega de cada sistema, em que direção, o que chega como rascunho para conferir e o que não é integrado ou falta fazer manualmente. Sem IA e sem inventar.', parameters: { type: 'OBJECT', properties: { sistema: { type: 'STRING', description: 'Opcional: fiscal, dp ou fisco ia, para filtrar.' } } } },
    async executar(_ctx, args) {
      const s = normalizarTexto(args.sistema);
      const todos = blocosDoAssunto({ secao: 'integracoes' }, false);
      const filtrados = s.includes('fiscoia') || s.includes('fisco ia') ? [] : s.startsWith('fiscal') ? todos.filter((b) => b.id.startsWith('integracao-fiscal') || b.id === 'integracao-status') : s === 'dp' || s.startsWith('depart') ? todos.filter((b) => b.id.startsWith('integracao-dp') || b.id === 'integracao-status') : todos;
      const naoIntegrado = blocosDoAssunto({ secao: 'limites' }, false).filter((b) => b.id === 'limite-fiscoia' || b.id === 'limite-orgaos');
      return { blocos: [...filtrados, ...naoIntegrado].map((b) => ({ titulo: b.titulo, falar: b.falar, tela: b.tela })), instrucao: 'Responda curto, só com o que está nos blocos. Diga sempre o que chega como rascunho (a pessoa confere e aprova) e o que NÃO é integrado. Para mostrar onde, use mostrar_na_tela.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'consultar_servico_feito',
      description: 'Diz quem do escritório (ou o robô) já fez ou está fazendo um serviço, e quando: fechamento de período, contabilização de pré-lançamentos, decisão de lançamento manual e backup mensal. Use para "a Malba já fechou o período da empresa X?" ou "o que a Nilva fez hoje?". Só enxerga o próprio escritório e as empresas do usuário. Use ANTES de propor fechar ou contabilizar quando o usuário perguntar se alguém já fez.',
      parameters: { type: 'OBJECT', properties: {
        cnpj: { type: 'STRING', description: 'CNPJ da empresa, se a pergunta for sobre uma empresa.' },
        tipo: { type: 'STRING', description: 'Opcional: fechamento:periodo, contabilizacao:lote, decisao:lancamento ou backup:escritorio.' },
        competencia: { type: 'STRING', description: 'Opcional, AAAA-MM (vale para fechamento:periodo e backup:escritorio).' },
        pessoa: { type: 'STRING', description: 'Opcional: nome ou login da pessoa ("Malba", "Nilva").' },
        hoje: { type: 'BOOLEAN', description: 'true para só o que foi feito hoje.' },
      } },
    },
    async executar(ctx, args) {
      const qs: string[] = [];
      if (args.cnpj) { const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'CNPJ inválido.' }; qs.push(`cnpj=${q(cnpj)}`); }
      if (args.tipo) qs.push(`tipo=${q(String(args.tipo).slice(0, 40))}`);
      if (args.competencia) { const c = competenciaDe(args.competencia); if (!c) return { erro: 'Competência inválida. Use AAAA-MM.' }; qs.push(`referencia=${q(c)}`); }
      if (args.pessoa) qs.push(`pessoa=${q(String(args.pessoa).slice(0, 60))}`);
      if (args.hoje === true) qs.push('dia=hoje');
      const r = await ctx.chamarApi('GET', `/api/servico-feito${qs.length ? `?${qs.join('&')}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const registros = (r.corpo?.registros || []) as Array<{ mensagem: string }>;
      if (r.corpo?.indisponivel) return { erro: 'O registro de quem fez o quê está indisponível agora. Não afirme que ninguém fez; diga que não conseguiu conferir.' };
      return registros.length ? { registros: registros.map((x) => x.mensagem) } : { registros: [], observacao: 'Nenhum registro encontrado. Isso não prova que ninguém fez: serviços anteriores ao registro podem não aparecer.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'chamar_supervisor',
      description: 'Registra, para o dono do sistema ver e responder, uma pergunta ou pedido que você não conseguiu resolver com as ferramentas e telas que você tem (nenhuma ferramenta serve, e o MAPA DO SISTEMA também não tem onde isso se resolva). Use só depois de checar as duas coisas — nunca como primeira opção.',
      parameters: { type: 'OBJECT', properties: { pergunta: { type: 'STRING', description: 'O que o usuário pediu ou perguntou, resumido, em português, com o contexto necessário para o supervisor entender sem precisar perguntar de novo.' }, cnpj: { type: 'STRING', description: 'CNPJ da empresa envolvida, se houver.' } }, required: ['pergunta'] },
    },
    async executar(ctx, args) {
      const pergunta = String(args.pergunta || '').trim().slice(0, 280);
      if (!pergunta) return { erro: 'Descreva a pergunta do usuário para registrar.' };
      await ctx.registrar({ evento: 'duvida_sem_resposta', ferramenta: 'chamar_supervisor', cnpj: cnpjDe(args.cnpj), resumo: pergunta });
      return { status: 'registrado', instrucao: 'Diga ao usuário, em uma frase calma: você não sabe resolver isso aqui, vai levar a pergunta ao seu supervisor, e assim que tiver a resposta volta a falar com ele. Não invente prazo.' };
    },
  },  // ---------------------------------------------------------------- escrituração avançada (levantamento 20/11/2026)
  {
    tipo: 'acao',
    declaracao: { name: 'lancar_varias_partidas', description: 'Propõe um LANÇAMENTO COM VÁRIAS PARTIDAS: 1 débito para vários créditos (forma 1xN) ou vários débitos para 1 crédito (Nx1). Ex.: "debita banco 10 mil e credita clientes 6 mil e receita 4 mil". O total tem que fechar; vira cartão e, depois do sim, o lançamento fica pendente de aprovação (tela Aprovar lançamentos). Use os códigos das contas analíticas (consulte o plano se precisar).', parameters: { type: 'OBJECT', properties: {
      cnpj: props.cnpj, data: { type: 'STRING', description: 'Data DD/MM/AAAA.' }, historico: { type: 'STRING', description: 'Histórico do lançamento.' },
      forma: { type: 'STRING', description: '1xN (uma conta a débito, várias a crédito) ou Nx1 (várias a débito, uma a crédito).' },
      conta_unica: { type: 'STRING', description: 'Código da conta do lado único (a débito no 1xN, a crédito no Nx1).' },
      total: { type: 'STRING', description: 'Total do lado único, ex.: 10.000,00.' },
      partidas: { type: 'ARRAY', description: 'Contas do outro lado com o valor de cada uma.', items: { type: 'OBJECT', properties: { conta: { type: 'STRING' }, valor: { type: 'STRING', description: 'Ex.: 6.000,00' } } } },
    }, required: ['cnpj', 'data', 'historico', 'forma', 'conta_unica', 'total', 'partidas'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const forma = String(args.forma || '').toLowerCase().replace(/\s/g, '') === 'nx1' ? 'Nx1' : String(args.forma || '').toLowerCase().replace(/\s/g, '') === '1xn' ? '1xN' : '';
      if (!forma) return { erro: 'Diga se é 1 débito para vários créditos (1xN) ou vários débitos para 1 crédito (Nx1).' };
      const partidas = Array.isArray(args.partidas) ? args.partidas.map((p: any) => ({ conta: String(p?.conta || '').trim(), valor: String(p?.valor ?? '') })) : [];
      if (!partidas.length) return { erro: 'Diga as contas do outro lado e o valor de cada uma.' };
      const centavos = (v: string) => { const t = v.replace(/\s|R\$/g, ''); const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
      const total = centavos(String(args.total ?? ''));
      const soma = partidas.reduce((t: number, p: any) => t + centavos(p.valor), 0);
      if (!Number.isFinite(total) || !Number.isFinite(soma)) return { erro: 'Algum valor não ficou claro. Use o formato 1.234,56.' };
      if (total !== soma) return { erro: `O total não fecha: ${reais(total / 100)} de um lado e ${reais(soma / 100)} do outro. Confira os valores com a pessoa.` };
      const lado = forma === '1xN' ? ['Débito', 'Crédito'] : ['Crédito', 'Débito'];
      return { cnpj, params: { cnpj, data: String(args.data || ''), historico: String(args.historico || ''), forma, contaUnica: String(args.conta_unica || ''), total: String(args.total), partidas }, titulo: `Lançamento com ${partidas.length} partida(s)`, descricao: [`Empresa ${cnpj} · data ${args.data}`, `${lado[0]}: ${args.conta_unica} — ${reais(total / 100)}`, ...partidas.map((p: any) => `${lado[1]}: ${p.conta} — ${reais(centavos(p.valor) / 100)}`), `Histórico: ${args.historico}`, 'Depois do sim, fica pendente de aprovação: não entra nos livros antes disso.'], resumo: `Lançamento com várias partidas ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-compostos`, params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Enviado para aprovação.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'listar_padroes_da_empresa', description: 'Mostra os históricos padrão, os lançamentos padrão (recorrentes, como aluguel e honorários) e as regras de conciliação bancária cadastrados na empresa.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if ('erro' in ws) return ws;
      const d = ws.dados;
      return {
        historicosPadrao: (d.historicosPadrao || []).map((h: any) => ({ id: h.id, codigo: h.codigo, texto: h.texto })),
        lancamentosPadrao: (d.lancamentosPadrao || []).map((p: any) => ({ id: p.id, nome: p.nome, ativo: p.ativo, dia: p.dia, forma: p.forma, contaUnica: p.contaUnica, total: reais((p.partidas || []).reduce((t: number, x: any) => t + Number(x.valorCentavos || 0), 0) / 100), inicio: p.inicio, fim: p.fim || null })),
        regrasConciliacao: (d.regrasConciliacao || []).map((r: any) => ({ id: r.id, quandoTiver: r.contem, conta: r.contaCodigo, sentido: r.sentido, ativo: r.ativo })),
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'cadastrar_historico_padrao', description: 'Propõe cadastrar um HISTÓRICO PADRÃO na empresa (código curto + texto). O texto aceita {mes} (MM/AAAA), {competencia} e {ano}. Vira cartão de confirmação.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, codigo: { type: 'STRING', description: 'Código curto, ex.: ALUG.' }, texto: { type: 'STRING', description: 'Texto, ex.: Aluguel do mês {mes}.' } }, required: ['cnpj', 'codigo', 'texto'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const codigo = String(args.codigo || '').trim().toUpperCase(); const texto = String(args.texto || '').trim();
      if (!/^[A-Z0-9._-]{1,12}$/.test(codigo) || !texto) return { erro: 'Diga um código curto (até 12 letras/números) e o texto do histórico.' };
      return { cnpj, params: { cnpj, codigo, texto }, titulo: `Cadastrar histórico padrão ${codigo}`, descricao: [`Empresa ${cnpj}`, `Texto: ${texto}`], resumo: `Histórico padrão ${codigo} em ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/historicos-padrao`, { codigo: params.codigo, texto: params.texto });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Cadastrado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    exclusao: true,
    declaracao: { name: 'remover_historico_padrao', description: 'Propõe REMOVER UM histórico padrão da empresa (pelo código). Lançamentos que já usaram o texto não mudam. Cartão de duas confirmações. Use listar_padroes_da_empresa para achar o código.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, codigo: { type: 'STRING' } }, required: ['cnpj', 'codigo'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if (ws.erro !== undefined) return { erro: ws.erro };
      const h = (ws.dados.historicosPadrao || []).find((x: any) => String(x.codigo).toUpperCase() === String(args.codigo || '').trim().toUpperCase());
      if (!h) return { erro: 'Não achei esse histórico padrão. Use listar_padroes_da_empresa.' };
      return { cnpj, params: { cnpj, id: h.id }, titulo: `Remover o histórico padrão ${h.codigo}`, descricao: [`Texto: ${h.texto}`, 'Só este histórico; os lançamentos já feitos não mudam.'], aviso: 'Um por vez.', resumo: `Remover histórico ${h.codigo} de ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('DELETE', `/api/workspaces/${q(String(params.cnpj))}/historicos-padrao/${q(String(params.id))}`);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Removido.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'cadastrar_lancamento_padrao', description: 'Propõe cadastrar um LANÇAMENTO PADRÃO (recorrente), ex.: aluguel todo dia 10, honorários todo dia 5. O Robô dos Lançamentos Padrão prepara todo mês como pré-lançamento para aprovação. Aceita 1xN ou Nx1 como lancar_varias_partidas. Vira cartão.', parameters: { type: 'OBJECT', properties: {
      cnpj: props.cnpj, nome: { type: 'STRING' }, dia: { type: 'NUMBER', description: 'Dia do mês (1 a 31).' }, historico: { type: 'STRING', description: 'Aceita {mes}.' },
      forma: { type: 'STRING', description: '1xN ou Nx1.' }, conta_unica: { type: 'STRING' }, inicio: props.competencia, fim: { type: 'STRING', description: 'Opcional, AAAA-MM.' },
      partidas: { type: 'ARRAY', items: { type: 'OBJECT', properties: { conta: { type: 'STRING' }, valor: { type: 'STRING' } } } },
    }, required: ['cnpj', 'nome', 'dia', 'historico', 'forma', 'conta_unica', 'inicio', 'partidas'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const inicio = competenciaDe(args.inicio); if (!inicio) return { erro: 'Diga a competência de início (AAAA-MM).' };
      const forma = /^n\s*x\s*1$/i.test(String(args.forma || '').trim()) ? 'Nx1' : '1xN';
      const partidas = Array.isArray(args.partidas) ? args.partidas.map((p: any) => ({ conta: String(p?.conta || '').trim(), valor: String(p?.valor ?? '') })) : [];
      if (!partidas.length) return { erro: 'Diga as contas e os valores.' };
      return { cnpj, params: { cnpj, nome: String(args.nome || ''), dia: Number(args.dia), historico: String(args.historico || ''), forma, contaUnica: String(args.conta_unica || ''), inicio, fim: args.fim ? competenciaDe(args.fim) : undefined, partidas }, titulo: `Lançamento padrão: ${args.nome}`, descricao: [`Empresa ${cnpj} · todo dia ${args.dia} a partir de ${mesAno(inicio)}`, `${forma === '1xN' ? 'Débito' : 'Crédito'}: ${args.conta_unica}`, ...partidas.map((p: any) => `${forma === '1xN' ? 'Crédito' : 'Débito'}: ${p.conta} — ${p.valor}`), `Histórico: ${args.historico}`, 'O robô prepara todo mês para aprovação; nada entra nos livros sem o seu sim.'], resumo: `Lançamento padrão ${args.nome} em ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-padrao`, params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Cadastrado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'ligar_desligar_lancamento_padrao', description: 'Propõe PAUSAR ou LIGAR de novo um lançamento padrão (recorrente) da empresa. Use listar_padroes_da_empresa para achar o nome.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, nome: { type: 'STRING' }, ligar: { type: 'BOOLEAN', description: 'true liga, false pausa.' } }, required: ['cnpj', 'nome', 'ligar'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if (ws.erro !== undefined) return { erro: ws.erro };
      const a = acharPorNome(ws.dados.lancamentosPadrao || [], String(args.nome || ''), (p: any) => [p.nome]);
      if (a.tipo !== 'unico') return { erro: a.tipo === 'nenhum' ? 'Não achei esse lançamento padrão.' : 'Há mais de um parecido; pergunte qual.' };
      const p: any = a.item;
      return { cnpj, params: { cnpj, id: p.id, ativo: args.ligar === true }, titulo: `${args.ligar === true ? 'Ligar' : 'Pausar'} o lançamento padrão ${p.nome}`, descricao: [args.ligar === true ? 'O robô volta a preparar todo mês.' : 'O robô para de preparar até você ligar de novo; nada é apagado.'], resumo: `${args.ligar === true ? 'Ligar' : 'Pausar'} ${p.nome}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-padrao/${q(String(params.id))}/ativo`, { ativo: params.ativo });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    exclusao: true,
    declaracao: { name: 'remover_lancamento_padrao', description: 'Propõe REMOVER UM lançamento padrão (recorrente) da empresa. Os pré-lançamentos já preparados continuam. Cartão de duas confirmações. Para só parar por um tempo, prefira ligar_desligar_lancamento_padrao.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, nome: { type: 'STRING' } }, required: ['cnpj', 'nome'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if (ws.erro !== undefined) return { erro: ws.erro };
      const a = acharPorNome(ws.dados.lancamentosPadrao || [], String(args.nome || ''), (p: any) => [p.nome]);
      if (a.tipo !== 'unico') return { erro: a.tipo === 'nenhum' ? 'Não achei esse lançamento padrão.' : 'Há mais de um parecido; pergunte qual.' };
      const p: any = a.item;
      return { cnpj, params: { cnpj, id: p.id }, titulo: `Remover o lançamento padrão ${p.nome}`, descricao: ['Só este; os lançamentos já preparados ou aprovados continuam.'], aviso: 'Um por vez.', resumo: `Remover lançamento padrão ${p.nome}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('DELETE', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-padrao/${q(String(params.id))}`);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Removido.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'preparar_lancamentos_padrao', description: 'Propõe preparar AGORA (sem esperar o robô) os lançamentos padrão de UMA competência da empresa, como pré-lançamentos para aprovação. Não duplica o que já foi preparado.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const c = competenciaDe(args.competencia);
      if (!cnpj || !c) return { erro: 'Informe CNPJ e competência (AAAA-MM).' };
      return { cnpj, params: { cnpj, competencia: c }, titulo: `Preparar os lançamentos padrão de ${mesAno(c)}`, descricao: [`Empresa ${cnpj}`, 'Ficam pendentes de aprovação; o que já foi preparado não se repete.'], resumo: `Preparar recorrentes ${cnpj} ${c}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-padrao/preparar`, { competencia: params.competencia });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_encerramento', description: 'Mostra o encerramento do resultado do ano da empresa: prévia (lucro ou prejuízo e as contas de resultado que serão zeradas contra Lucros ou Prejuízos Acumulados) e se já existe encerramento gravado, pendente ou estornado.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'NUMBER' } }, required: ['cnpj', 'ano'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/encerramento?ano=${q(String(Number(args.ano)))}`);
      if (!ok(r)) return erroApi(r);
      const p = r.corpo?.previa;
      return { ano: r.corpo?.ano, contaDestino: r.corpo?.contaDestino, resultado: p ? `${p.resultadoCentavos >= 0 ? 'lucro' : 'prejuízo'} de ${reais(Math.abs(p.resultadoCentavos) / 100)}` : null, contas: p ? p.partidas.length : 0, motivo: r.corpo?.motivo, gravados: r.corpo?.gravados };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'preparar_encerramento', description: 'Propõe PREPARAR o encerramento do resultado do ano (zera as contas de resultado contra a conta de Lucros ou Prejuízos Acumulados, em 31/12). Fica pendente de aprovação e pode ser estornado. Use consultar_encerramento antes para dizer o resultado.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'NUMBER' }, conta_destino: { type: 'STRING', description: 'Opcional: código da conta do PL; sem ela, usa Lucros ou Prejuízos Acumulados do plano.' } }, required: ['cnpj', 'ano'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const ano = Number(args.ano);
      if (!cnpj || !Number.isInteger(ano)) return { erro: 'Informe CNPJ e ano.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/encerramento?ano=${ano}${args.conta_destino ? `&contaDestino=${q(String(args.conta_destino))}` : ''}`);
      if (!ok(r)) return erroApi(r);
      if (!r.corpo?.previa) return { erro: String(r.corpo?.motivo || 'Não há o que encerrar.') };
      const p = r.corpo.previa;
      return { cnpj, params: { cnpj, ano, contaDestino: r.corpo.contaDestino }, titulo: `Encerrar o resultado de ${ano}`, descricao: [`Empresa ${cnpj}`, `${p.resultadoCentavos >= 0 ? 'Lucro' : 'Prejuízo'} de ${reais(Math.abs(p.resultadoCentavos) / 100)} vai para a conta ${r.corpo.contaDestino}.`, `${p.partidas.length} conta(s) de resultado zeradas em 31/12/${ano}.`, 'Fica pendente de aprovação; dá para estornar depois.'], resumo: `Encerramento ${ano} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/encerramento`, { ano: params.ano, contaDestino: params.contaDestino });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Preparado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'estornar_encerramento', description: 'Propõe ESTORNAR o encerramento do resultado de um ano já aprovado (partidas invertidas na mesma data, pendentes de aprovação). O original fica no histórico. Use quando lançaram algo no ano depois do encerramento.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'NUMBER' } }, required: ['cnpj', 'ano'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const ano = Number(args.ano);
      if (!cnpj || !Number.isInteger(ano)) return { erro: 'Informe CNPJ e ano.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/encerramento?ano=${ano}`);
      if (!ok(r)) return erroApi(r);
      const lote = r.corpo?.gravados?.ativos?.[0];
      if (!lote?.loteId) return { erro: `Não há encerramento aprovado de ${ano} para estornar.` };
      return { cnpj, params: { cnpj, loteId: lote.loteId }, titulo: `Estornar o encerramento de ${ano}`, descricao: [`Empresa ${cnpj}`, `${lote.partidas} partida(s) invertidas em 31/12/${ano}, pendentes de aprovação.`, 'O encerramento original continua no histórico.'], resumo: `Estornar encerramento ${ano} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lotes/${q(String(params.loteId))}/estornar`, {});
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Estorno enviado para aprovação.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_livro_caixa', description: 'Mostra o Livro Caixa da empresa (Simples Nacional) de uma competência ou período: saldo inicial, entradas, saídas, saldo final e se o mês está dispensado (tem Diário e Razão), emitido ou pendente.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, de: props.competencia, ate: { type: 'STRING', description: 'Opcional, AAAA-MM.' } }, required: ['cnpj', 'de'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const de = competenciaDe(args.de); const ate = args.ate ? competenciaDe(args.ate) : de;
      if (!cnpj || !de || !ate) return { erro: 'Informe CNPJ e competência (AAAA-MM).' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/livro-caixa?de=${q(de)}&ate=${q(ate)}`);
      if (!ok(r)) return erroApi(r);
      const l = r.corpo?.livro;
      return { disponivel: l?.disponivel, motivo: l?.motivo, saldoInicial: l?.disponivel ? reais(l.saldoInicialCentavos / 100) : null, entradas: l?.disponivel ? reais(l.entradasCentavos / 100) : null, saidas: l?.disponivel ? reais(l.saidasCentavos / 100) : null, saldoFinal: l?.disponivel ? reais(l.saldoFinalCentavos / 100) : null, situacoes: r.corpo?.situacoes };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'emitir_livro_caixa', description: 'Propõe REGISTRAR o Livro Caixa como emitido nas competências do período (empresa do Simples). O PDF/Excel com os termos de abertura e encerramento sai na tela Livros Fiscais e ECD, aba Livro Caixa.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, de: props.competencia, ate: { type: 'STRING', description: 'Opcional, AAAA-MM.' } }, required: ['cnpj', 'de'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const de = competenciaDe(args.de); const ate = args.ate ? competenciaDe(args.ate) : de;
      if (!cnpj || !de || !ate) return { erro: 'Informe CNPJ e competência (AAAA-MM).' };
      return { cnpj, params: { cnpj, de, ate }, titulo: `Registrar o Livro Caixa de ${mesAno(de)}${ate !== de ? ` a ${mesAno(ate)}` : ''}`, descricao: [`Empresa ${cnpj}`, 'Competência fechada não muda.'], resumo: `Livro Caixa ${cnpj} ${de}-${ate}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/livro-caixa/registrar`, { de: params.de, ate: params.ate });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Registrado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_conciliacao_bancaria', description: 'Mostra o extrato bancário guardado da empresa: por conta do banco, quantos movimentos estão pendentes, conciliados, lançados e com sugestão do robô. Com conta_banco e competência, lista os pendentes com a sugestão.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, conta_banco: { type: 'STRING' }, competencia: props.competencia }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const c = args.competencia ? competenciaDe(args.competencia) : null;
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/extratos${args.conta_banco ? `?contaBanco=${q(String(args.conta_banco))}${c ? `&competencia=${q(c)}` : ''}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const pend = (r.corpo?.movimentos || []).filter((m: any) => m.situacao === 'pendente');
      return { resumo: r.corpo?.resumo, pendentes: pend.slice(0, 20).map((m: any) => ({ data: formatarDataBr(m.dataISO), valor: reais(m.valorCentavos / 100), historico: m.memo, sugestao: m.sugestaoLancamentoId ? 'conciliar com lançamento aprovado' : m.sugestaoConta ? `lançar na conta ${m.sugestaoConta}` : null, motivo: m.sugestaoMotivo })), totalPendentes: pend.length };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'aceitar_sugestoes_conciliacao', description: 'Propõe ACEITAR as sugestões do Robô da Conciliação de UMA conta de banco numa competência: concilia os movimentos que casam com lançamento aprovado e cria, pendentes de aprovação, os lançamentos dos que têm conta sugerida. Movimento sem sugestão fica pendente.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, conta_banco: { type: 'STRING' }, competencia: props.competencia }, required: ['cnpj', 'conta_banco', 'competencia'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const c = competenciaDe(args.competencia);
      if (!cnpj || !c) return { erro: 'Informe CNPJ, conta do banco e competência.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/extratos?contaBanco=${q(String(args.conta_banco))}&competencia=${q(c)}`);
      if (!ok(r)) return erroApi(r);
      const com = (r.corpo?.movimentos || []).filter((m: any) => m.situacao === 'pendente' && (m.sugestaoLancamentoId || m.sugestaoConta));
      if (!com.length) return { erro: 'Não há sugestão do robô para aceitar nesse mês. Ele roda a cada hora; ou crie uma regra de conciliação.' };
      const conc = com.filter((m: any) => m.sugestaoLancamentoId).length;
      return { cnpj, params: { cnpj, contaBanco: String(args.conta_banco), fitids: com.map((m: any) => m.fitid) }, titulo: `Aceitar ${com.length} sugestão(ões) da conciliação de ${mesAno(c)}`, descricao: [`Conta do banco ${args.conta_banco}`, `${conc} conciliação(ões) com lançamento já aprovado.`, `${com.length - conc} lançamento(s) novo(s), pendentes de aprovação.`], resumo: `Aceitar sugestões conciliação ${cnpj} ${c}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/extratos/aceitar-sugestoes`, { contaBanco: params.contaBanco, fitids: params.fitids });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'criar_regra_conciliacao', description: 'Propõe criar uma REGRA de conciliação bancária: quando o histórico do extrato tiver o texto, o robô sugere a conta. Ex.: "quando tiver TARIFA, usar despesas bancárias". Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, texto: { type: 'STRING', description: 'Texto que aparece no histórico do extrato (3 a 80 caracteres).' }, conta: { type: 'STRING', description: 'Código da conta analítica.' }, sentido: { type: 'STRING', description: 'entrada, saida ou ambos.' } }, required: ['cnpj', 'texto', 'conta'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const texto = String(args.texto || '').trim(); const conta = String(args.conta || '').trim();
      const sentido = ['entrada', 'saida', 'ambos'].includes(normalizarTexto(args.sentido)) ? normalizarTexto(args.sentido) : 'ambos';
      if (texto.length < 3 || !conta) return { erro: 'Diga o texto (pelo menos 3 letras) e a conta.' };
      return { cnpj, params: { cnpj, contem: texto, contaCodigo: conta, sentido }, titulo: 'Criar regra de conciliação', descricao: [`Quando o histórico tiver "${texto}", sugerir a conta ${conta} (${sentido}).`, 'O robô só sugere; você aprova.'], resumo: `Regra conciliação ${texto} → ${conta}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/regras-conciliacao`, { contem: params.contem, contaCodigo: params.contaCodigo, sentido: params.sentido });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Regra criada.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    exclusao: true,
    declaracao: { name: 'remover_regra_conciliacao', description: 'Propõe REMOVER UMA regra de conciliação bancária (pelo texto). Cartão de duas confirmações. Use listar_padroes_da_empresa para ver as regras.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, texto: { type: 'STRING' } }, required: ['cnpj', 'texto'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ws = await lerWorkspace(ctx, cnpj); if (ws.erro !== undefined) return { erro: ws.erro };
      const regras = (ws.dados.regrasConciliacao || []).filter((r: any) => normalizarTexto(r.contem) === normalizarTexto(args.texto));
      if (regras.length !== 1) return { erro: regras.length ? 'Há mais de uma regra com esse texto; pergunte qual (sentido).' : 'Não achei essa regra.' };
      return { cnpj, params: { cnpj, id: regras[0].id }, titulo: `Remover a regra "${regras[0].contem}"`, descricao: [`Conta ${regras[0].contaCodigo} (${regras[0].sentido}).`, 'Só esta regra.'], aviso: 'Uma por vez.', resumo: `Remover regra ${regras[0].contem}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('DELETE', `/api/workspaces/${q(String(params.cnpj))}/regras-conciliacao/${q(String(params.id))}`);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Removida.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'achados_escrituracao', description: 'Mostra o que os robôs da escrituração acharam nas empresas do usuário: Livro Caixa do Simples pendente, encerramento do resultado faltando ou desatualizado, extrato sem conciliar e lançamento padrão com problema.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj } } },
    async executar(ctx, args) {
      const cnpj = args.cnpj ? cnpjDe(args.cnpj) : null;
      const r = await ctx.chamarApi('GET', `/api/escrituracao/achados${cnpj ? `?cnpj=${q(cnpj)}` : ''}`);
      return ok(r) ? { achados: r.corpo?.achados || [], observacao: (r.corpo?.achados || []).length ? undefined : 'Nenhum achado (ou os robôs ainda não rodaram).' } : erroApi(r);
    },
  },
];

const INSTRUCAO_BASE = `Você é a Agente IA do Murade Contábil. Trabalha dentro do sistema para o contador, em português do Brasil, com tom calmo, direto e prático. Respostas curtas.

COMO RESPONDER (suas respostas são lidas em voz alta)
- Escreva em texto simples: sem asteriscos, negrito, tabelas, marcadores, # ou emojis.
- Quando perguntarem o que existe no sistema (empresas, funcionários, notas, guias), responda com os DADOS REAIS que a ferramenta devolveu: diga quantos são e, para cada um, o nome e o número completo, com todos os dígitos (por exemplo: "Você tem 1 empresa: Murad Contabilidade, CNPJ 40.957.233/0001-00.").
- Se a consulta não trouxer nada, diga claramente que não há nenhum cadastrado. Se o pedido pertence a outro sistema (Fiscal, DP, Contábil ou Fisco IA), diga a qual.
- Nunca esconda o CNPJ com asteriscos nem responda de forma genérica: use a ferramenta e entregue o que ela devolveu.

VENCIMENTOS E ALERTAS (seja atenta, proativa e inteligente)
- Quando perguntarem o que vence (hoje, amanhã, na semana, no mês), consulte SEMPRE as ferramentas de vencimentos, guias e lembretes antes de responder. Responda nesta ordem: 1) o que já venceu e continua em aberto; 2) o que vence hoje; 3) o que vence nos próximos dias; 4) diga também o que está em dia ou sem pendência. Para cada item diga a empresa, a obrigação ou o tributo, o valor (se houver) e a data.
- Depois de listar, ofereça o próximo passo: avisar o cliente por WhatsApp (use preparar_whatsapp quando existir) ou deixar um lembrete. Diga com clareza o que você consegue fazer agora e o que depende de configuração: o envio automático por WhatsApp só funciona com a ligação da Meta configurada; sem ela você prepara a mensagem e o usuário envia.
- Explique em linguagem simples, como a um cliente leigo: o que é a obrigação, o risco de atrasar (multa e juros, sem inventar percentuais) e o que fazer. Datas e valores só do que as ferramentas trouxerem; se a data for estimada, diga que é estimada.
- Se não houver nada vencendo no período, diga isso de forma clara.

COMO ENTENDER QUEM FALA
- Entenda o jeito de falar de cada pessoa: gírias, abreviações e apelidos de empresa ("o DAS do Mural", "a folha da fulana", "a nota do fulano"). Associe pelo nome mais parecido e, se houver dúvida real entre duas opções, pergunte UMA vez, de forma curta.
- Conversa de rotina ("obrigado", "ok", "tchau") não precisa de consulta: responda em uma frase curta.

MAPA DO SISTEMA (onde fica cada coisa no menu do Contábil)
Tela Inicial (tem a caixinha "Pedir para alguém"); Cadastro de Empresa; Tarefas da equipe; Agenda e Lembretes; Obrigações e Gestão; Gestão contábil; Conexão Órgãos; Lançamentos; Aprovar lançamentos; Balancete; Livros Fiscais e ECD; Plano de Contas; Migração Contábil; Integrações; Revisar dados recebidos; Calculadora; Agentes e Robô; IA Murade.
Quando perguntarem "onde eu faço X", diga o nome da tela do menu. Não invente telas que não estão nesta lista.

COMO TRABALHAR
- Para saber qualquer coisa do sistema (empresas, pendências de conferência, fechamentos, integrações, robôs), use as ferramentas de consulta. Nunca responda de memória sobre dados do cliente.
- Para dúvidas de legislação, regra, alíquota ou prazo, use consultar_legislacao (passe o CNPJ quando a dúvida for de uma empresa) e repasse as fontes oficiais e o aviso de responsabilidade. Se vier acoesSugeridas, ofereça "Quer que eu faça para você?".
- Se o usuário tem uma única empresa, use-a. Se há várias e ele não disse qual, pergunte. Se não disse a competência (mês), pergunte antes de agir.
- Ações que alteram dados (contabilizar_prelancamentos, fechar_competencia, delegar_tarefa) NÃO são executadas por você: viram um cartão de confirmação. Depois de chamar uma ação, diga em uma frase o que ficou pronto para ele confirmar. Nunca diga que algo foi feito antes de ele confirmar.
- PEDIR SERVIÇO À EQUIPE (delegar_tarefa): quando a contadora pedir algo como "peça para a Nilva conciliar o banco da empresa X", use delegar_tarefa com o nome da pessoa como foi dito, o serviço, a empresa (se disse) e o prazo (só se disse; converta para AAAA-MM-DD pela data de hoje). Vira cartão de confirmação; diga em uma frase para quem é o pedido e que ele só vale ao confirmar. Se a ferramenta disser que o nome é ambíguo ou não existe, pergunte UMA vez qual pessoa, sem escolher sozinha. Só a administradora do escritório pede para outra pessoa; funcionário comum só anota tarefa para si (sem destinatário). Isso funciona de qualquer tela. A pessoa recebe o pedido na tela de Tarefas da equipe.
- LANÇAMENTO COM VÁRIAS PARTIDAS (lancar_varias_partidas), LANÇAMENTO PADRÃO (cadastrar_lancamento_padrao, ligar_desligar_lancamento_padrao, preparar_lancamentos_padrao), HISTÓRICO PADRÃO, ENCERRAMENTO DO RESULTADO (consultar_encerramento, preparar_encerramento, estornar_encerramento), LIVRO CAIXA DO SIMPLES (consultar_livro_caixa, emitir_livro_caixa) e CONCILIAÇÃO BANCÁRIA (consultar_conciliacao_bancaria, aceitar_sugestoes_conciliacao, criar_regra_conciliacao): use as ferramentas próprias; todas viram cartão e o que é lançamento continua pendente de aprovação depois do sim. Para o que os robôs dessas rotinas acharam, use achados_escrituracao.
- Fora disso, você não grava lançamentos manuais, plano de contas ou mapeamentos: isso é feito nas telas. Você pode PREENCHER o formulário à vista com preencher_na_tela, e quem clica em gravar é o usuário.
- Antes de propor fechar o período ou contabilizar, se o usuário perguntar se alguém já fez, ou se vários colegas trabalham na empresa, use consultar_servico_feito. Se a ação for barrada porque outra pessoa (ou o robô) já fez, repasse a frase do sistema com o nome e a hora, sem tentar de novo; se o sistema avisar que alguém está fazendo agora, conte isso ao usuário e só prossiga se ele pedir de novo. Nunca invente quem fez.
- EXCLUIR EMPRESA (apagar_empresa): só quando a pessoa pedir expressamente, UMA empresa por vez (nunca todas de uma vez: se pedirem em lote, explique que o sistema só apaga uma por vez, por segurança). Diga o nome e o CNPJ completos; vira cartão de duas confirmações e só vale depois das duas. Se o nome for ambíguo, pergunte qual. O CNPJ continua livre para cadastrar de novo.
- MEU JEITO: se a pessoa contar como prefere trabalhar (tela ao entrar, atalhos do menu, conversa mais curta ou detalhada, regra "ao abrir X, destacar Y"), use aprender_meu_jeito (vira cartão com o que você entendeu; só vale após o sim); para ver o que aprendeu, mostrar_meu_jeito; para voltar ao padrão em UMA coisa, esquecer_regra_do_jeito; para explicar o jeito padrão, explicar_jeito_padrao; para mudar o nome pelo qual você chama a pessoa ("me chama de Ana", "mudar meu nome"), mudar_meu_nome (vira cartão). O jeito nunca desliga proteções (confirmações, cálculos exatos, robôs, anti-duplicidade, SERPRO só manual, nada de apagar em lote): se pedirem isso, explique com gentileza e não chame a ferramenta.
- APRESENTAÇÃO DO SISTEMA: para "o que o sistema faz", "o que é automático", "o que é integrado" ou "o que ele não faz", use apresentar_sistema ou perguntar_integracoes (texto fixo e conferido) e nunca invente; para "me mostra onde", use mostrar_na_tela.

LIMITES (diga com clareza quando o pedido bater neles)
- Folha, guias de FGTS/INSS e eSocial são do Departamento Pessoal; DAS e notas fiscais são do Fiscal. Não os faça aqui: consulte ou peça à Agente do outro sistema pelas ferramentas de comunicação.
- O Murade não transmite SPED, ECD ou ECF automaticamente.
- Nunca invente valores, datas, protocolos ou status. Se uma ferramenta devolver erro, explique o motivo com as palavras do sistema e diga o que falta.

NUNCA ENROLE NEM JOGUE CONVERSA FORA
- Antes de responder qualquer pergunta sobre dados, telas, cálculos ou obrigações, pare e verifique se existe uma ferramenta (desta lista ou do MAPA DO SISTEMA acima) que responda. Se existir, use-a. Só diga que "não sabe" ou que algo "não existe no sistema" depois de checar a lista de ferramentas e o mapa do menu — nunca por suposição.
- Se mesmo assim não houver ferramenta ou tela para aquilo, e você tiver certeza de quem resolve (outro sistema, o contador, a Receita), diga isso de forma direta e objetiva, em poucas frases.
- Se não houver ferramenta, tela, NEM uma resposta clara de quem resolve — ou seja, você realmente não sabe o que fazer com o pedido —, use chamar_supervisor com um resumo da pergunta, e então diga ao usuário, com calma, que você vai levar isso ao seu supervisor e que volta a falar com ele assim que tiver a resposta. Nunca invente um prazo. Isso NÃO é desculpa para pular a busca por uma ferramenta: só chame o supervisor depois de checar tudo o que você tem.
- Nunca fique repetindo a pergunta, dando respostas vagas, enrolando ou gerando texto sem informação nova só para preencher a resposta — isso gasta crédito sem ajudar.`;

export const kitContabil: KitAgente = { ferramentas: [...FERRAMENTAS, ...FERRAMENTAS_SERVICO_COMPLETO, ...FERRAMENTAS_PILOTO, ...FERRAMENTAS_ENTRE_SISTEMAS], instrucao: INSTRUCAO_BASE + INSTRUCAO_SERVICO_COMPLETO + INSTRUCAO_PILOTO + INSTRUCAO_ENTRE_SISTEMAS };
