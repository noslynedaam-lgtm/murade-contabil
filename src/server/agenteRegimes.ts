// Agente IA: comparação de regimes (estimativa) e recolhimento a maior. Só lê: as mesmas rotas da tela Gestão contábil › Regimes e pago a maior.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const reais = (c: number | null | undefined) => (c === null || c === undefined ? 'sem valor' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const ATIVIDADES = ['comercio', 'industria', 'combustiveis', 'transporte_carga', 'servicos_hospitalares', 'transporte_passageiros', 'servicos'];

export const INSTRUCAO_REGIMES = `
REGIMES E PAGO A MAIOR: para "qual regime compensa", "quanto pagaria no Presumido/Real", "pagou imposto a mais?" use comparar_regimes (só lê). Para o Presumido é preciso a atividade (comércio, indústria, serviços etc.): se não souber, pergunte. Diga sempre que é ESTIMATIVA com a base legal, que a simulação do Simples é feita no Murad Fiscal (Tabela Tributária) e que quem decide o regime é o contador. Pago a maior "a conferir" pode ser multa e juros: não chame de indevido. Para restituir: DAS em "Minhas Restituições de DAS"; DARF no PER/DCOMP Web (IN RFB nº 2.055/2021, prazo de 5 anos — CTN, art. 168, I). conferir_pago_a_maior_agora roda o conferidor nas empresas do usuário.`;

export const FERRAMENTAS_REGIMES: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'comparar_regimes', description: 'REGIMES: últimos 12 meses da empresa — apurado e pago no regime atual, estimativa do Lucro Presumido e do Lucro Real com os números da contabilidade (com base legal) e recolhimento a maior de DAS/DARF com a orientação de restituição. Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, atividade: { type: 'STRING', description: `Opcional, para o Presumido: ${ATIVIDADES.join(', ')}.` } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const at = ATIVIDADES.includes(String(args.atividade || '')) ? String(args.atividade) : '';
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/comparacao-regimes${at ? `?atividade=${q(at)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const d = r.corpo;
      return {
        cnpj, periodo: d.periodo, regimeAtual: d.regimeAtual, receita12: reais(d.receita12Centavos), folha12: d.folha12Centavos === null ? 'sem dados do DP' : reais(d.folha12Centavos),
        atual: (d.atualApuradoPago || []).map((l: any) => ({ tributo: l.tributo, apurado: reais(l.apuradoCentavos), pago: reais(l.pagoCentavos) })),
        estimativas: (d.estimativas || []).map((e: any) => ({ regime: e.regime, atual: e.atual, podeOptar: e.podeOptar, motivo: e.motivo, total: reais(e.totalCentavos), linhas: (e.linhas || []).map((l: any) => `${l.nome}: ${reais(l.centavos)}${l.base ? ` (${l.base})` : ''}`), observacoes: e.observacoes })),
        pagoAMaior: (d.pagoAMaior || []).map((p: any) => ({ tributo: p.tributo, periodo: p.periodo, valor: reais(p.aMaiorCentavos), aConferir: p.aConferir, foraDoPrazo: p.foraDoPrazo, motivo: p.motivo, orientacao: p.orientacao })),
        totalAMaior: reais(d.totalAMaiorCentavos), avisos: d.avisos, aviso: d.aviso, simularSimplesNoFiscal: d.simularSimplesNoFiscal, tela: 'Gestão contábil › Regimes e pago a maior',
      };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'conferir_pago_a_maior_agora', description: 'REGIMES: roda agora o Robô Conferidor do Recolhimento a Maior nas empresas do usuário (DAS com principal pago acima do apurado, guia paga mais de uma vez). Só lê.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/comparacao-regimes/conferir-agora', {});
      if (!ok(r)) return erroApi(r);
      return { resumo: r.corpo?.resumo, achados: (r.corpo?.achados || []).slice(0, 15).map((a: any) => ({ cnpj: a.cnpj, tributo: a.tributo, periodo: a.periodo, valor: reais(a.aMaiorCentavos), aConferir: a.aConferir })) };
    },
  },
];
