// Ferramentas da Agente IA (voz ou texto) para o Robô Conferidor das Origens (Fiscal × DP × Contábil).
//  - conferir_fiscal_dp_contabil (leitura): resultado por empresa e mês (contagem e total ao centavo), pendências com motivo e
//    os alertas vermelhos de nota cancelada/substituída já lançada, com o estorno sugerido.
//  - rodar_conferencia_origens (ação, com cartão): roda agora e corrige o que é seguro.
//  - completar_plano_padrao (ação, com cartão): acrescenta ao plano da empresa as contas do padrão que cabem nele.
//  - marcar_alerta_nota_resolvido (ação, com cartão): o contador diz que já estornou a nota cancelada.
// Nenhuma delas aprova, lança, estorna ou apaga lançamento.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mes = (c: string) => c.replace(/(\d{4})-(\d{2})/, '$2/$1');

async function acharCnpj(ctx: any, args: Record<string, unknown>): Promise<{ cnpj: string | null; erro?: string }> {
  if (String(args.cnpj ?? '').trim()) { const c = cnpjDe(args.cnpj); return c ? { cnpj: c } : { cnpj: null, erro: 'CNPJ inválido.' }; }
  const nome = String(args.nome ?? '').trim().toLowerCase();
  if (!nome) return { cnpj: null };
  const r = await ctx.chamarApi('GET', '/api/conferencia-origens');
  if (!ok(r)) return { cnpj: null, erro: erroApi(r).erro };
  const achadas = ((r.corpo.resultados || []) as any[]).filter((e) => String(e.nome || '').toLowerCase().includes(nome));
  if (achadas.length === 1) return { cnpj: achadas[0].cnpj };
  return { cnpj: null, erro: achadas.length ? `Achei ${achadas.length} empresas com "${nome}": ${achadas.slice(0, 5).map((e) => e.nome).join(', ')}. Qual delas?` : `Não achei empresa com "${nome}" na conferência. Diga o CNPJ.` };
}

export const FERRAMENTAS_CONFERIDOR_ORIGENS: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: {
      name: 'conferir_fiscal_dp_contabil',
      description: 'CONFERIDOR DAS ORIGENS: mostra, por empresa e por mês, se as notas que valem no Fiscal chegaram ao Contábil e viraram pré-lançamento ou lançamento (quantidade e total ao centavo), por que cada nota de fora ficou de fora, se a folha do DP bate item a item com as partidas, e os ALERTAS VERMELHOS de nota cancelada ou substituída que já foi lançada (com o estorno sugerido). Use para "as notas da empresa X chegaram todas?", "o Contábil bateu com o Fiscal?", "a folha entrou certa?", "tem nota cancelada lançada?". Só lê.',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Opcional: parte do nome da empresa.' } } },
    },
    async executar(ctx, args) {
      const alvo = await acharCnpj(ctx, args);
      if (alvo.erro) return { erro: alvo.erro };
      const r = await ctx.chamarApi('GET', `/api/conferencia-origens${alvo.cnpj ? `?cnpj=${q(alvo.cnpj)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const resultados = (r.corpo.resultados || []) as any[];
      const alertas = (r.corpo.alertas || []) as any[];
      if (!resultados.length) return { mensagem: 'A conferência ainda não rodou para estas empresas. Posso rodar agora (rodar_conferencia_origens).', alertas: alertas.length };
      const detalhe = resultados.length <= 2;
      return {
        empresas: resultados.slice(0, 40).map((e) => ({
          empresa: e.nome, cnpj: e.cnpj, situacao: e.situacao === 'ok' ? 'tudo certo' : e.situacao === 'aviso' ? 'pendência explicada' : 'diferença',
          conferidoEm: e.conferidoEm,
          notas: { noFiscal: e.totais?.fiscal ? `${e.totais.fiscal.qtd} (${reais(e.totais.fiscal.centavos)})` : 'Fiscal não respondeu', noContabil: `${e.totais.contabil.qtd} (${reais(e.totais.contabil.centavos)})`, pendentesComMotivo: e.totais.pendentes.qtd, semMotivo: e.totais.semExplicacao },
          correcoesFeitasSozinho: e.correcoes, avisos: e.avisos,
          ...(detalhe ? {
            meses: (e.notas || []).filter((l: any) => l.situacao !== 'ok').slice(0, 12).map((l: any) => ({ mes: mes(l.competencia), tipo: l.tipo, avisos: l.avisos, motivos: l.pendentes.motivos })),
            folhas: (e.folhas || []).slice(0, 6).map((f: any) => ({ mes: mes(f.competencia), dp: reais(f.dp.centavos), contabil: reais(f.contabil.centavos), situacao: f.situacao, aviso: f.aviso })),
          } : {}),
        })),
        alertasNotaCanceladaLancada: alertas.slice(0, 20).map((a) => ({ empresa: a.cnpj, nota: `${a.rotulo}${a.numero ? ` nº ${a.numero}` : ''}`, motivo: a.motivo, valor: reais(Math.round(a.valor * 100)), estornoSugerido: `D ${a.estornoSugerido.contaDebito} / C ${a.estornoSugerido.contaCredito}, ${reais(Math.round(a.estornoSugerido.valor * 100))}, em ${a.estornoSugerido.data}`, referencia: a.referencia })),
        observacao: 'Fale primeiro os ALERTAS VERMELHOS (nota cancelada já lançada: o contador faz o estorno sugerido; eu nunca estorno sozinha), depois as diferenças e por último o que está certo. Pendência com motivo não é erro: diga o motivo.',
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'rodar_conferencia_origens',
      description: 'CONFERIDOR DAS ORIGENS: propõe RODAR AGORA a conferência Fiscal × DP × Contábil (de uma empresa ou de todas do escritório) e corrigir sozinho só o que é seguro: pedir de novo ao Fiscal a nota que faltou ou ficou desatualizada, pedir de novo ao DP a folha que não chegou, preparar o pré-lançamento que faltou, tirar o pré-lançamento pendente de nota cancelada e completar o plano provisório só acrescentando contas. Vira cartão de confirmação. Nunca aprova, lança nem estorna. Use para "confere agora as notas da empresa X" ou "roda a conferência".',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Opcional: parte do nome da empresa.' } } },
    },
    async preparar(ctx, args) {
      const alvo = await acharCnpj(ctx, args);
      if (alvo.erro) return { erro: alvo.erro };
      return {
        cnpj: alvo.cnpj ?? '', params: { cnpj: alvo.cnpj ?? '' },
        titulo: alvo.cnpj ? 'Conferir agora a empresa (Fiscal × DP × Contábil)' : 'Conferir agora todas as empresas do escritório',
        descricao: ['Compara, mês a mês e ao centavo, as notas do Fiscal e a folha do DP com o Contábil.', 'Corrige sozinho só o seguro (reenvio da nota/folha que não chegou, pré-lançamento que faltou, pré-lançamento de nota cancelada sai).'],
        aviso: 'Nada é aprovado, lançado nem estornado. Nota cancelada já lançada vira alerta para você estornar.',
        resumo: 'Conferência Fiscal × DP × Contábil agora',
      };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/conferencia-origens/rodar-agora', params?.cnpj ? { cnpj: String(params.cnpj) } : {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: `${r.corpo.mensagem} Quando terminar, a tela Revisão das origens mostra o resultado; pode continuar usando o sistema.` };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'completar_plano_padrao',
      description: 'CONFERIDOR DAS ORIGENS: propõe COMPLETAR o plano de contas de UMA empresa com as contas do plano padrão do Murad que cabem nele — só acrescenta, nunca troca, renomeia nem apaga conta. Grupos com outro significado que o padrão (ex.: o "3" ser Patrimônio Líquido na empresa e Receita no padrão) ficam como estão. Vira cartão de confirmação. Use para "completa o plano de contas da empresa X".',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Ou parte do nome da empresa.' } } },
    },
    async preparar(ctx, args) {
      const alvo = await acharCnpj(ctx, args);
      if (alvo.erro) return { erro: alvo.erro };
      if (!alvo.cnpj) return { erro: 'Diga de qual empresa (CNPJ ou nome).' };
      return {
        cnpj: alvo.cnpj, params: { cnpj: alvo.cnpj },
        titulo: 'Completar o plano de contas com o padrão',
        descricao: ['Acrescenta só as contas do padrão que ainda não existem e cabem no plano da empresa.', 'Nenhuma conta existente é trocada, renomeada ou apagada.'],
        aviso: 'Os mapeamentos já feitos continuam iguais.',
        resumo: 'Completar plano de contas (só acrescentar)',
      };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/conferencia-origens/completar-plano', { cnpj: String(params?.cnpj || '') });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: `${r.corpo.mensagem}${(r.corpo.gruposForaDoPadrao || []).length ? ` Ficaram como estão os grupos ${(r.corpo.gruposForaDoPadrao as string[]).join(', ')} (outro significado que o padrão).` : ''}` };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'marcar_alerta_nota_resolvido',
      description: 'CONFERIDOR DAS ORIGENS: propõe marcar como RESOLVIDO o alerta vermelho de uma nota cancelada ou substituída que já estava lançada, quando o contador diz que já fez o estorno (com outro histórico). O alerta também some sozinho quando o estorno sugerido aparece nos lançamentos. Vira cartão de confirmação; nada é lançado. Use a referência que conferir_fiscal_dp_contabil mostrou.',
      parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, referencia: { type: 'STRING', description: 'Referência do alerta (começa com FISCAL:).' } }, required: ['cnpj', 'referencia'] },
    },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj);
      const referencia = String(args.referencia ?? '').trim();
      if (!cnpj || !referencia.startsWith(`FISCAL:${cnpj}:`)) return { erro: 'Informe o CNPJ e a referência do alerta (de conferir_fiscal_dp_contabil).' };
      return { cnpj, params: { cnpj, referencia }, titulo: 'Marcar alerta de nota cancelada como resolvido', descricao: [`Nota: ${referencia.split(':').slice(4).join(':')}`, 'Use só se o estorno já foi feito.'], aviso: 'Nada é lançado nem estornado por mim.', resumo: 'Alerta de nota cancelada resolvido' };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/conferencia-origens/alertas/resolver', { cnpj: String(params?.cnpj || ''), referencia: String(params?.referencia || '') });
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      return { sucesso: true, mensagem: 'Pronto: alerta marcado como resolvido.' };
    },
  },
];

export const INSTRUCAO_CONFERIDOR_ORIGENS = `
- CONFERIDOR DAS ORIGENS (Fiscal × DP × Contábil, "nenhuma nota pode se perder"): para "as notas chegaram todas?", "bateu com o Fiscal?", "a folha entrou?" ou "tem nota cancelada lançada?", use conferir_fiscal_dp_contabil e fale primeiro os ALERTAS VERMELHOS (nota cancelada/substituída já lançada: o contador faz o estorno sugerido — você nunca estorna), depois as diferenças, e explique o motivo de cada pendência (ex.: entrada de devolução para classificar, nota anterior a 09/2026 sem confirmação). Para "confere agora", use rodar_conferencia_origens (cartão). Para "completa o plano de contas", use completar_plano_padrao (cartão; só acrescenta). Se o contador disser que já estornou, use marcar_alerta_nota_resolvido (cartão). Nota cancelada, substituída (Resolução CGNFS-e 3/2023, art. 7º e 8º, para a NFS-e), denegada ou inutilizada nunca entra em lançamento, balancete ou DRE.`;
