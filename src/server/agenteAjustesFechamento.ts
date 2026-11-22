// Agente IA: "Quer que eu ajuste?" no fechamento. Lê as propostas do robô conferidor do fechamento e, por cartão de
// confirmação (um item por vez), faz, desfaz (estorno) ou mantém. Mesmas rotas da tela Fechamento.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const comp = (v: unknown) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : '');

export const INSTRUCAO_AJUSTES_FECHAMENTO = `
AJUSTES DO FECHAMENTO: quando Diário, Razão, balancete ou Balanço/DRE não fecham, use ajustes_fechamento para ler o que o robô achou e diga para a pessoa, item por item: a causa, o ajuste pronto ("Quer que eu ajuste? ... Vou lançar: D ... / C ...") e a base. Fazer, desfazer (estorno) ou manter é sempre por decidir_ajuste_fechamento (cartão de confirmação), um item por vez; nunca lance ajuste sem o "Sim". Item "verificar" pede escolha da pessoa: explique onde corrigir na tela.`;

export const FERRAMENTAS_AJUSTES_FECHAMENTO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'ajustes_fechamento', description: 'FECHAMENTO: o que não fecha na empresa (saldos iniciais sem contrapartida, lançamento fora do Diário por conta sintética, competência ou fração de centavo, conta de resultado que não zerou no encerramento, balancete com diferença, contas fora do Balanço/DRE), com a causa, o ajuste pronto e a base. Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, competencia: { type: 'STRING', description: 'Opcional, AAAA-MM. Sem ela, todos os meses.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const c = comp(args.competencia);
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/ajustes-fechamento${c ? `?competencia=${c}` : ''}`);
      if (!ok(r)) return erroApi(r);
      return { cnpj, competencia: c || 'todos os meses', resumo: r.corpo.resumo, itens: (r.corpo.propostas || []).slice(0, 20).map((p: any) => ({ id: p.id, tipo: p.tipo, situacao: p.situacao, titulo: p.titulo, causa: p.causa, pergunta: p.pergunta, base: p.base })), tela: 'Gestão › Fechamento › "Quer que eu ajuste?"' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'decidir_ajuste_fechamento', description: 'FECHAMENTO: propõe decidir UM item de ajustes_fechamento: "executar" (faz o ajuste pronto e confere de novo), "desfazer" (estorno ou volta o valor anterior) ou "manter" (marca como conferido). Vira cartão; só faz depois do Sim.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING' }, acao: { type: 'STRING', description: 'executar, desfazer ou manter.' }, competencia: { type: 'STRING', description: 'A mesma usada em ajustes_fechamento (opcional).' } }, required: ['cnpj', 'id', 'acao'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const id = String(args.id || '').trim(); const acao = String(args.acao || '').trim(); const c = comp(args.competencia);
      if (!cnpj || !id || !['executar', 'desfazer', 'manter'].includes(acao)) return { erro: 'Informe o CNPJ, o item e a ação (executar, desfazer ou manter).' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/ajustes-fechamento${c ? `?competencia=${c}` : ''}`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const p = (r.corpo.propostas || []).find((x: any) => x.id === id);
      if (!p) return { erro: 'Não achei este item (pode já ter sido resolvido).' };
      if (acao === 'executar' && (p.tipo === 'verificar' || p.situacao !== 'pendente')) return { erro: p.tipo === 'verificar' ? 'Este item pede escolha da pessoa; não dá para ajustar sozinho.' : 'Este item já foi decidido.' };
      if (acao === 'desfazer' && p.situacao !== 'feito') return { erro: 'Este item ainda não foi ajustado.' };
      const titulo = acao === 'executar' ? 'Quer que eu ajuste?' : acao === 'desfazer' ? 'Desfazer o ajuste' : 'Manter como está';
      return { cnpj, params: { cnpj, id, acao, competencia: c || undefined }, titulo, descricao: [p.titulo, `Causa: ${p.causa}`, acao === 'executar' ? p.pergunta : acao === 'desfazer' ? (p.tipo === 'lancamento' ? 'Lanço o estorno; o original continua no Diário.' : 'Volta o valor anterior.') : 'Fica como está, marcado como conferido.', `Base: ${p.base}`], resumo: `${titulo} ${cnpj} ${id}`.slice(0, 160) };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/ajustes-fechamento`, { id: params.id, acao: params.acao, competencia: params.competencia });
      return ok(r) ? { sucesso: true, mensagem: `${String(r.corpo?.mensagem || 'Feito.')} ${r.corpo?.resumo || ''}`.trim() } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
];
