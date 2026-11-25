// Agente IA (voz ou texto): baixa das guias do aplicativo do cliente (Fiscal) pelo extrato importado aqui. Só lê.
// Mesma rota da tela Gestão contábil › Extrato e conciliação (/api/workspaces/:cnpj/extratos/baixa-guias), com o mesmo controle de acesso.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const INSTRUCAO_BAIXA_GUIAS = `
BAIXA DAS GUIAS PELO EXTRATO: o extrato bancário importado aqui vai sozinho ao Murad Fiscal, que dá como paga a guia do aplicativo do cliente quando o débito tem o mesmo valor e a mesma data (ou o código da guia no histórico) e o honorário quando o crédito cai no banco do escritório. Para "quantas guias o extrato baixou?" use baixa_das_guias_pelo_extrato. Confirmar ou recusar o "Já paguei" do cliente é no Fiscal (Atendimento ao cliente › Pagamentos informados).`;

export const FERRAMENTAS_BAIXA_GUIAS: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'baixa_das_guias_pelo_extrato', description: 'EXTRATO × GUIAS: quantos movimentos do extrato da empresa já foram conferidos com as guias do aplicativo do cliente no Fiscal e quantas guias foram baixadas como pagas pelo extrato (por tipo). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/extratos/baixa-guias`);
      if (!ok(r)) return erroApi(r);
      return { cnpj, movimentosConferidos: r.corpo.enviados, guiasBaixadas: r.corpo.guiasBaixadas, porTipo: r.corpo.porTipo, ultimoEnvio: r.corpo.ultimoEnvio, observacao: 'A baixa é feita no Fiscal só quando o movimento casa com uma guia só. Os pagamentos informados pelo cliente ("Já paguei") são confirmados no Fiscal.' };
    },
  },
];
