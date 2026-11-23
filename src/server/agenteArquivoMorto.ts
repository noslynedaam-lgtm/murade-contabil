// Agente IA (voz e chat): documentos guardados de empresa excluída (arquivo morto). Consultar é direto; recuperar é por cartão de
// confirmação e só funciona para o administrador do escritório, depois de a empresa ser cadastrada de novo (mesma rota da tela).
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const INSTRUCAO_ARQUIVO_MORTO = `
DOCUMENTOS GUARDADOS (empresa excluída): ao excluir uma empresa, o que a lei manda guardar (escrituração, fechamentos, e-Lalur, documentos do Fiscal e do DP) fica num arquivo escondido e cifrado do escritório, até o fim do prazo legal (CTN, arts. 173, 174 e 195; Lei 8.212/91, art. 32, § 11). Só o administrador recupera, depois de cadastrar a empresa de novo: use consultar_documentos_guardados e recuperar_documentos_guardados (cartão de confirmação). Nunca diga o conteúdo do arquivo.`;

export const FERRAMENTAS_ARQUIVO_MORTO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_documentos_guardados', description: 'Diz se há documentos guardados (arquivo morto) de uma empresa excluída e já cadastrada de novo, quantos registros e até quando ficam guardados. Só para o administrador do escritório. Não mostra o conteúdo.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ.' } }, required: ['cnpj'] } },
    async executar(ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/arquivo-morto/${q(cnpj)}`); if (!ok(r)) return erroApi(r);
      return { cnpj, registrosGuardados: r.corpo.itens, guardadoAte: r.corpo.guardarAte, marcadoParaManter: r.corpo.manter };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'recuperar_documentos_guardados', description: 'Propõe RECUPERAR os documentos guardados de uma empresa excluída que já foi cadastrada de novo: a escrituração, os fechamentos e os documentos voltam para a empresa (sem sobrescrever o que já existe). Só o administrador do escritório.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ.' } }, required: ['cnpj'] } },
    async preparar(ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/arquivo-morto/${q(cnpj)}`); if (!ok(r)) return erroApi(r);
      if (!r.corpo.itens) return { erro: 'Não há documentos guardados desta empresa no seu escritório.' };
      return { cnpj, params: { cnpj }, titulo: `Recuperar documentos guardados de ${cnpj}`, descricao: [`${r.corpo.itens} registro(s) guardado(s) até ${String(r.corpo.guardarAte || '').split('-').reverse().join('/')}.`, 'Voltam para a empresa; o que já existe não é sobrescrito.'], aviso: 'Se a empresa já tem lançamentos novos, a escrituração guardada não é misturada (fica guardada e o sistema avisa).', resumo: `Recuperar arquivo morto ${cnpj}` };
    },
    async executar(ctx, p) { const r = await ctx.chamarApi('POST', `/api/arquivo-morto/${q(String(p.cnpj))}/recuperar`, { confirmar: true }); if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro }; return { sucesso: true, mensagem: `Recuperados ${r.corpo.recuperados} registro(s).${(r.corpo.pendencias || []).length ? ' Pendências: ' + r.corpo.pendencias.join(' ') : ''}` }; },
  },
];
