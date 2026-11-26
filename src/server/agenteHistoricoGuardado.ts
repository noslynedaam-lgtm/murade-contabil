// Ferramentas da Agente IA (voz ou texto) para o histórico guardado (empresa grande: exercícios antigos fora do documento).
//  - conferir_historico_guardado (leitura): o saldo transportado bate com a soma do histórico? e, se veio do sistema anterior, o
//    balancete por conta e mês (documento + histórico) bate com o backup?
//  - exercicios_guardados (leitura): quais anos estão no histórico e quantos lançamentos.
//  - guardar_exercicios_no_historico / trazer_exercicio_de_volta (ação): viram cartão; só executam depois do Sim.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const INSTRUCAO_HISTORICO_GUARDADO = `
HISTÓRICO GUARDADO (empresa grande): empresa com muitos anos de movimento fica com os exercícios em aberto no documento da empresa e os exercícios antigos guardados no histórico do Contábil, com o saldo transportado (os relatórios dos exercícios em aberto dão os mesmos números). Para ver relatórios de um ano guardado, a pessoa escolhe o ano em "Exercício consultado" (no topo do Balancete, dos Livros e das Demonstrações). Para conferir, use conferir_historico_guardado; para saber os anos, exercicios_guardados. Guardar exercícios antigos ou trazer o último de volta é por guardar_exercicios_no_historico / trazer_exercicio_de_volta (cartão; só depois do Sim). Nunca diga que algo foi apagado: nada é apagado, só muda de lugar.`;

export const FERRAMENTAS_HISTORICO_GUARDADO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'conferir_historico_guardado', description: 'De UMA empresa com exercícios guardados no histórico: se o saldo transportado para os exercícios em aberto é exatamente a soma do histórico (conta por conta) e, se veio do sistema anterior, se o balancete por conta e mês (documento + histórico) bate com o backup. Use para "o histórico da empresa X confere?", "os saldos de abertura batem?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres). Obtenha em listar_empresas.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/historico/conferencia`);
      if (!ok(r)) return erroApi(r);
      const h = r.corpo.historico || {}; const m = r.corpo.migracao;
      return { cnpj, temHistorico: h.temHistorico, historicoConfere: h.bate, resumoHistorico: h.resumo, guardadoAte: h.ateCompetencia, lancamentosNoHistorico: h.lancamentos, primeirasDiferencasTransporte: (h.diferencasTransporte || []).slice(0, 5),
        migracao: m ? { bate: m.bate, resumo: m.resumo, contasConferidas: m.contasConferidas, competenciasConferidas: m.competenciasConferidas, primeirasDiferencas: (m.diferencas || []).slice(0, 5) } : null };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'exercicios_guardados', description: 'Quais exercícios (anos) de UMA empresa estão guardados no histórico e quantos lançamentos cada um tem. Use para "que anos estão guardados?", "onde estão os lançamentos de 2018?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/historico`);
      if (!ok(r)) return erroApi(r);
      return { cnpj, guardadoAte: r.corpo.marcador?.ateCompetencia || null, quantidade: r.corpo.quantidade, anos: (r.corpo.anos || []).map((a: any) => ({ ano: a.ano, lancamentos: a.quantidade, meses: a.meses })), ondeVer: 'Balancete, Livros ou Demonstrações › "Exercício consultado" › escolha o ano.' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'guardar_exercicios_no_historico', description: 'Propõe guardar no histórico os exercícios de UMA empresa até um ano (inclusive), para o documento da empresa ficar só com os exercícios em aberto. Nada é apagado; o saldo é transportado. Só exercício anterior ao ano atual. Vira cartão; só executa depois do Sim.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, ateAno: { type: 'NUMBER', description: 'Último ano a guardar (ex.: 2023).' } }, required: ['cnpj', 'ateAno'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const ateAno = Number(args.ateAno);
      if (!cnpj || !Number.isInteger(ateAno)) return { erro: 'Informe o CNPJ e o ano.' };
      return { cnpj, params: { cnpj, ateAno }, titulo: `Guardar os exercícios até ${ateAno} no histórico`, descricao: [`Os lançamentos até 31/12/${ateAno} saem do documento da empresa e ficam no histórico guardado (nada é apagado).`, `O saldo de cada conta é transportado para ${ateAno + 1}: os relatórios dos exercícios em aberto dão os mesmos números.`, `Os anos guardados ficam em "Exercício consultado" e podem voltar com "Trazer de volta".`], resumo: `Guardar até ${ateAno} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/historico/guardar`, { ateAno: params.ateAno, confirmado: true });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'trazer_exercicio_de_volta', description: 'Propõe trazer o ÚLTIMO exercício guardado no histórico de UMA empresa de volta para o documento (para poder alterar). Só se couber. Vira cartão; só executa depois do Sim.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/historico`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const ate = String(r.corpo.marcador?.ateCompetencia || ''); if (!ate) return { erro: 'Esta empresa não tem exercício guardado no histórico.' };
      return { cnpj, params: { cnpj }, titulo: `Trazer o exercício de ${ate.slice(0, 4)} de volta`, descricao: [`Os lançamentos de ${ate.slice(0, 4)} voltam do histórico para o documento da empresa (nada é apagado).`, 'O saldo transportado é refeito com os anos que continuam guardados.'], resumo: `Trazer ${ate.slice(0, 4)} de volta ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/historico/trazer-de-volta`, { confirmado: true });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
];
