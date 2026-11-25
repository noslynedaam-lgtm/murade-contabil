// Agente IA: o que chegou do Fisco IA (guias, dívida ativa e parcelamentos consultados por clique no Integra Contador) e virou
// pré-lançamento no Contábil. Ler é direto; "conferir agora" prepara de novo os pré-lançamentos (cartão de confirmação). Nunca consulta o Serpro.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SITUACAO: Record<string, string> = { pre_lancamento: 'pré-lançamento para conferir', contabilizado: 'contabilizado', aguardando_mapeamento: 'esperando o mapeamento de contas', duplicado_do_fiscal: 'não entra (o Fiscal já mandou o mesmo)' };

export const INSTRUCAO_FISCOIA_CONTABIL = `
FISCO IA → CONTÁBIL: as guias (DAS do MEI: principal, multa e juros), a dívida ativa e os parcelamentos que alguém consultou POR CLIQUE no Fisco IA viram pré-lançamentos aqui (Revisão das origens, origens "Fisco IA — ..."). Para "o que veio do Fisco IA" use consultar_itens_fisco_ia. Para preparar de novo e conferir use conferir_fisco_ia_agora (cartão). Nunca diga que consultou o Serpro: consulta paga só por clique da pessoa no Fisco IA.`;

export const FERRAMENTAS_FISCOIA_CONTABIL: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_itens_fisco_ia', description: 'FISCO IA: lista os itens que chegaram do Fisco IA para a empresa (guia, multa/juros, dívida ativa, parcelamento e parcela paga), com valor, data e a situação (pré-lançamento, contabilizado, esperando mapeamento ou que não entra por já ter vindo do Fiscal). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/fiscoia-contabil/itens?cnpj=${q(cnpj)}`);
      if (!ok(r)) return erroApi(r);
      return { cnpj, resumo: r.corpo?.resumo, itens: (r.corpo?.itens || []).slice(0, 30).map((i: any) => ({ origem: i.origem, competencia: i.competencia, data: i.data, valor: reais(Number(i.valorCentavos) || 0), situacao: SITUACAO[i.situacao] || i.situacao, detalhe: i.detalhe })), tela: 'Revisão das origens' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'conferir_fisco_ia_agora', description: 'FISCO IA: propõe rodar agora o Robô Conferidor do Fisco IA → Contábil nas empresas do usuário: prepara de novo os pré-lançamentos dos itens recebidos (sem consultar o Serpro) e mostra o que espera mapeamento. Vira cartão.', parameters: { type: 'OBJECT', properties: {} } },
    async preparar() {
      return { cnpj: '', params: {}, titulo: 'Conferir agora o que veio do Fisco IA', descricao: ['Prepara de novo os pré-lançamentos das guias, da dívida ativa e dos parcelamentos recebidos do Fisco IA.', 'Não consulta o Serpro e não lança nada definitivo: tudo fica para você conferir.'], resumo: 'Conferir itens do Fisco IA' };
    },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/fiscoia-contabil/conferir-agora', {});
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.resumo || 'Conferência feita.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
];
