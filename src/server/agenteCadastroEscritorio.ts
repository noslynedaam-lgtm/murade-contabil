// Agente do Contábil: situação do cadastro do escritório (só leitura). O cadastro único é feito no DP; aqui a Agente diz o que falta
// e entrega o link do DP. Nunca pede certificado ou senha pelo chat.
import { erroApi, ok, type Ferramenta } from './agenteMotor';

export const FERRAMENTAS_CADASTRO_ESCRITORIO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'situacao_cadastro_escritorio', description: 'Mostra a situação do CADASTRO DO ESCRITÓRIO (feito uma vez no DP, vale para todos os sistemas): CNPJ do escritório aqui no Contábil e no DP, o que falta (dados, certificado A1 e-CNPJ do escritório) e a validade do certificado (aviso em 30, 15 e 7 dias). Use para "qual a situação do cadastro do escritório", "cadastra meu escritório" ou perguntas sobre procurações: o cadastro, o certificado e as caixinhas das procurações ficam no DP; devolva o link.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('GET', '/api/escritorio/cadastro-situacao');
      if (!ok(r)) return erroApi(r);
      const c = r.corpo || {};
      return {
        cnpjNoContabil: c.cnpjNoContabil || null, origem: c.origemNoContabil === 'manual' ? 'digitado no Contábil' : c.origemNoContabil ? `preenchido pelo ${c.origemNoContabil === 'dp' ? 'DP' : 'Fisco IA'}` : null,
        ligadoAoDP: c.ligadoAoDP === true, cadastroNoDP: c.dp ? { cnpj: c.dp.cnpj, completo: c.dp.completo, falta: c.dp.faltando, certificadoValidoAte: c.dp.certificado?.validoAte || null, diasParaVencer: c.dp.certificado?.dias ?? null } : null,
        avisos: c.avisos || [], ondeFazer: { texto: 'Cadastro do escritório no Murad DP (Configurações > Cadastro do escritório), com a lista "Você tem procuração?".', link: c.linkDP },
        observacao: 'Não peça certificado nem senha pelo chat. Se não houver ligação com o DP (outro login ou outro banco), o CNPJ do escritório pode ser informado aqui no campo manual.',
      };
    },
  },
];
export const INSTRUCAO_CADASTRO_ESCRITORIO = `
- Cadastro do escritório (dados, certificado A1 e-CNPJ e procurações das empresas): é feito uma vez no DP e vale para todos os sistemas. Use situacao_cadastro_escritorio para dizer o que já chegou e o que falta, e entregue o link do DP. Nunca peça certificado ou senha pelo chat.`;
