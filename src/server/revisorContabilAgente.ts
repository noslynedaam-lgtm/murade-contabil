// Ferramentas da Agente IA (voz ou texto) para o REVISOR do Contábil.
//  - revisar_empresa (leitura): "revisa a empresa X" → revisão geral do mês (certo / risco / falta), da empresa ou de todas.
//  - ver_lista_corrigir (leitura): o que o robô semanal do Revisor deixou em Corrigir.
//  - corrigir_para_mim (ação, com cartão): só lançamento PENDENTE de aprovação em mês ABERTO e só o determinístico (nome da conta pelo
//    plano, competência pela data, histórico sem espaços). Nunca aprova, nunca fecha e nunca transmite nada.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const competenciaDe = (v: unknown): string | null => { const t = String(v ?? '').trim(); let m = /^(\d{4})-(\d{2})$/.exec(t); if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? t : null; m = /^(\d{2})\/(\d{4})$/.exec(t); return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1]}` : null; };

export const FERRAMENTAS_REVISOR: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: {
      name: 'revisar_empresa',
      description: 'REVISOR: faz a revisão geral do mês de UMA empresa (por CNPJ ou parte do nome) ou de todas do escritório e responde, por empresa, o que está CERTO, o que é RISCO e o que FALTA: fechamento guiado (partidas que não fecham, lançamentos inválidos, aprovações e rascunhos pendentes, saldos iniciais, depreciação), lançamento repetido, Caixa com saldo credor, extrato sem conciliação e folha do DP sem partida. Use para "revisa a empresa X", "confere o mês da empresa X", "o que está faltando nas empresas?". Só lê.',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Opcional: parte do nome da empresa.' }, competencia: { type: 'STRING', description: 'Opcional: AAAA-MM (padrão: o mês anterior).' } } },
    },
    async executar(ctx, args) {
      const cnpj = String(args.cnpj ?? '').trim() ? cnpjDe(args.cnpj) : null;
      if (String(args.cnpj ?? '').trim() && !cnpj) return { erro: 'CNPJ inválido.' };
      const comp = String(args.competencia ?? '').trim() ? competenciaDe(args.competencia) : null;
      if (String(args.competencia ?? '').trim() && !comp) return { erro: 'Competência inválida: use AAAA-MM.' };
      const nome = !cnpj && String(args.nome ?? '').trim() ? String(args.nome).trim().slice(0, 80) : '';
      const r = await ctx.chamarApi('GET', `/api/revisor/geral?${[cnpj ? `cnpj=${q(cnpj)}` : '', nome ? `nome=${q(nome)}` : '', comp ? `competencia=${q(comp)}` : ''].filter(Boolean).join('&')}`);
      if (!ok(r)) return erroApi(r);
      const empresas = (r.corpo.empresas || []) as any[];
      const detalhe = empresas.length <= 3;
      return {
        competencia: r.corpo.competencia,
        empresas: empresas.slice(0, 40).map((e) => ({
          cnpj: e.cnpj, empresa: e.nome, regime: e.regime,
          ...(detalhe ? { certo: e.certo, risco: e.risco.map((x: any) => x.texto), falta: e.falta.map((x: any) => x.texto), daParaCorrigirSozinho: [...e.falta, ...e.risco].filter((x: any) => x.corrigivel).map((x: any) => x.texto) }
            : { faltas: e.falta.length, riscos: e.risco.length, certos: e.certo.length, principal: (e.falta[0] || e.risco[0])?.texto ?? 'tudo certo' }),
        })),
        observacao: 'Fale primeiro o que FALTA, depois os RISCOS e por último o que está certo. O que é correção automática (lançamento pendente com dado desatualizado) use corrigir_para_mim; o resto, pergunte ou leve a pessoa à tela. Aprovar e fechar é sempre clique dela.',
      };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'ver_lista_corrigir',
      description: 'REVISOR: mostra a lista "Corrigir" que o robô semanal do Revisor preencheu (o que está faltando ou errado em cada empresa), quais itens dá para corrigir sozinho e quando foi a última revisão. Use para "o que eu tenho para corrigir?" e "o Revisor achou alguma coisa?". Só lê.',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ de uma empresa.' } } },
    },
    async executar(ctx, args) {
      const cnpj = String(args.cnpj ?? '').trim() ? cnpjDe(args.cnpj) : null;
      if (String(args.cnpj ?? '').trim() && !cnpj) return { erro: 'CNPJ inválido.' };
      const r = await ctx.chamarApi('GET', `/api/revisor/corrigir${cnpj ? `?cnpj=${q(cnpj)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const itens = (r.corpo.itens || []) as any[];
      return { ultimaRevisao: r.corpo.ultimaRodada, total: itens.length, itens: itens.slice(0, 30).map((i) => ({ id: i.id, empresa: i.empresa || i.cnpj, cnpj: i.cnpj, competencia: i.competencia, gravidade: i.nivel === 'bloqueia' ? 'erro' : 'atenção', texto: i.texto, corrigeSozinho: i.correcao ? i.correcao.explicacao : null, pergunta: i.pergunta, tela: i.tela })) };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'corrigir_para_mim',
      description: 'REVISOR: propõe CORRIGIR SOZINHO os itens da lista "Corrigir" que têm correção determinística: lançamento PENDENTE de aprovação em mês ABERTO com nome de conta desatualizado (pega do plano), competência diferente da data (recalcula pela data) ou histórico com espaços sobrando. Vira cartão de confirmação; nada é gravado antes do sim. Os lançamentos continuam esperando aprovação. Nunca aprova, fecha ou transmite. Use para "corrige para mim" ou "arruma o que dá da empresa X".',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ de uma empresa.' }, id: { type: 'STRING', description: 'Opcional: id de UM item (de ver_lista_corrigir).' } } },
    },
    async preparar(ctx, args) {
      const cnpj = String(args.cnpj ?? '').trim() ? cnpjDe(args.cnpj) : null;
      if (String(args.cnpj ?? '').trim() && !cnpj) return { erro: 'CNPJ inválido.' };
      const r = await ctx.chamarApi('GET', `/api/revisor/corrigir${cnpj ? `?cnpj=${q(cnpj)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const id = String(args.id ?? '').trim();
      const itens = ((r.corpo.itens || []) as any[]).filter((i) => i.correcao && (!id || i.id === id)).slice(0, 15);
      if (!itens.length) return { erro: 'Não há nada que eu possa corrigir sozinho agora: o que está na lista Corrigir depende de decisão de vocês (aprovar, conciliar, informar dado) ou a revisão ainda não rodou (botão Rodar agora na tela Revisor).' };
      return {
        cnpj: cnpj ?? '', params: { ids: itens.map((i) => i.id) },
        titulo: `Corrigir ${itens.length} item(ns) pelo Revisor`,
        descricao: itens.map((i) => `${i.empresa || i.cnpj}${i.competencia ? ` (${i.competencia})` : ''}: ${i.correcao.explicacao}`),
        aviso: 'Só lançamento pendente de aprovação em mês aberto. Eu confiro de novo antes de gravar; os lançamentos continuam esperando a sua aprovação.',
        resumo: `Revisor: corrigir ${itens.length} item(ns)`,
      };
    },
    async executar(ctx, params) {
      const ids: string[] = Array.isArray(params?.ids) ? params.ids.slice(0, 15).map(String) : [];
      const feitos: string[] = []; const falhas: string[] = [];
      for (const id of ids) {
        const r = await ctx.chamarApi('POST', `/api/revisor/achados/${q(id)}/corrigir`, {});
        if (ok(r)) feitos.push(String(r.corpo?.mensagem || 'Corrigido.')); else falhas.push(erroApi(r).erro);
      }
      return { sucesso: feitos.length > 0, mensagem: [feitos.length ? `Corrigi ${feitos.length}: ${feitos.join(' ')}` : '', falhas.length ? `Não corrigi ${falhas.length}: ${falhas.join(' ')}` : ''].filter(Boolean).join(' ') || 'Nada a corrigir.' };
    },
  },
];

export const INSTRUCAO_REVISOR = `
- REVISOR ("não pode passar nada"): para "revisa a empresa X", "confere o mês da empresa X" ou "o que está faltando nas empresas?", use revisar_empresa e fale primeiro o que FALTA, depois os RISCOS e por último o que está CERTO. Para "o que eu tenho para corrigir?", use ver_lista_corrigir. Para "corrige para mim", use corrigir_para_mim (cartão de confirmação): só corrige lançamento pendente de aprovação em mês aberto e só o que é determinístico; o que só a pessoa sabe (qual conta analítica usar, conciliar ou lançar, valor certo) você PERGUNTA, uma vez, e não inventa. O Revisor também confere sozinho, antes de gravar, o lançamento manual (data, valor, contas, histórico, partida que fecha, repetido), o lançar da conciliação bancária e o fechamento do mês, e mostra o parecer no cartão "Confira e dê o OK". Ele nunca aprova, fecha nem transmite nada e não mexe em mês fechado sem o contador reabrir.`;
