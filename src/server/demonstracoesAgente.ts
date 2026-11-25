// Ferramentas da Agente IA (voz ou texto) para a tela "Demonstrações e relatórios".
//  - consultar_demonstracoes (leitura): DFC, DRE, DMPL, índices e série de 12 meses de UMA empresa.
//  - painel_do_escritorio (leitura): quem fechou o mês, quem tem pendência, quem tem ECD/ECF a entregar.
//  - preparar_notas_explicativas (ação, cartão): cria o modelo das notas do ano (nunca sobrescreve o que a contadora escreveu).
//  - marcar_entrega_sped (ação, cartão): marca ECD/ECF como entregue (com recibo) ou volta para "a entregar".
//  - conferir_demonstracoes_agora (ação, cartão): dispara o Robô Conferidor das Demonstrações.
// Nada aqui aprova, lança, fecha ou transmite.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';
import { ehLinhaDva, ROTULO_DVA } from '../utils/dva';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const competenciaDe = (v: unknown): string | null => { const t = String(v ?? '').trim(); let m = /^(\d{4})-(\d{2})$/.exec(t); if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? t : null; m = /^(\d{2})\/(\d{4})$/.exec(t); return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1]}` : null; };
const props = {
  cnpj: { type: 'STRING', description: 'CNPJ da empresa (14 caracteres). Obtenha em listar_empresas.' },
  competencia: { type: 'STRING', description: 'Competência AAAA-MM.' },
};

export const FERRAMENTAS_DEMONSTRACOES: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_demonstracoes', description: 'DEMONSTRAÇÕES: mostra, de UMA empresa, a DFC (caixa no início e no fim, operacional, investimento, financiamento e se fecha), a DRE resumida do ano até o mês, a DMPL do ano, os índices (liquidez corrente, seca e geral, endividamento, margem bruta e líquida, com a explicação de cada um) e a receita e o resultado dos últimos 12 meses. Use para "como está a empresa X?", "qual a liquidez?", "a DFC fecha?". Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, competencia: props.competencia }, required: ['cnpj', 'competencia'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj), c = competenciaDe(args.competencia);
      if (!cnpj || !c) return { erro: 'Informe CNPJ e competência (AAAA-MM).' };
      const r = await ctx.chamarApi('GET', `/api/demonstracoes/${q(cnpj)}/resumo?competencia=${q(c)}`);
      if (!ok(r)) return erroApi(r);
      const { sucesso: _s, ...resto } = r.corpo || {};
      return { ...resto, observacao: 'Explique cada índice em palavras simples (use a "leitura"). PDF, Excel e o relatório para o cliente saem na tela Demonstrações e relatórios.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'painel_do_escritorio', description: 'PAINEL DO ESCRITÓRIO: para todas as empresas do acesso, diz quem já fechou o mês, quem tem pendência (e qual), quem tem ECD e ECF a entregar (prazo, atrasada ou entregue) e o que o Robô das Demonstrações achou. Use para "quem fechou o mês?", "quem falta entregar ECD/ECF?", "como estão as empresas?". Só lê.', parameters: { type: 'OBJECT', properties: { competencia: { type: 'STRING', description: 'Opcional: AAAA-MM (padrão: mês anterior).' } } } },
    async executar(ctx, args) {
      const c = String(args.competencia ?? '').trim() ? competenciaDe(args.competencia) : null;
      if (String(args.competencia ?? '').trim() && !c) return { erro: 'Competência inválida: use AAAA-MM.' };
      const r = await ctx.chamarApi('GET', `/api/painel-escritorio${c ? `?competencia=${q(c)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      const lista = (r.corpo.empresas || []) as any[];
      return {
        competencia: r.corpo.competencia, total: lista.length,
        fecharam: lista.filter((e) => e.mesFechado).length,
        empresas: lista.slice(0, 60).map((e) => ({
          cnpj: e.cnpj, empresa: e.nome, mesFechado: e.mesFechado, pendencias: e.pendencias.slice(0, 4),
          ecd: e.ecd.situacao === 'obrigatoria' ? (e.ecd.entregue ? 'entregue' : `${e.ecd.diasParaPrazo < 0 ? 'ATRASADA' : 'a entregar'} até ${e.ecd.prazo}`) : e.ecd.situacao,
          ecf: e.ecf.seAplica === 'nao' ? 'dispensada' : e.ecf.entregue ? 'entregue' : `${e.ecf.diasParaPrazo < 0 ? 'ATRASADA' : 'a entregar'} até ${e.ecf.prazo}`,
          demonstracoes: e.demonstracoes.map((d: any) => d.texto).slice(0, 3),
        })),
        observacao: 'Fale primeiro quem tem ECD/ECF atrasada, depois quem não fechou o mês e o que falta. Prazos: ECD último dia útil de junho; ECF último dia útil de julho (sem contar feriados).',
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'preparar_notas_explicativas', description: 'DEMONSTRAÇÕES: propõe criar o MODELO das notas explicativas do ano da empresa (NBC TG 1002 microentidade, NBC TG 1001 pequena ou NBC TG 1000), só com os dados do cadastro e da contabilidade; o que só a empresa sabe fica entre colchetes para a contadora completar na tela. Se as notas do ano já existem, não mexe. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'NUMBER' }, norma: { type: 'STRING', description: 'Opcional: NBC TG 1002, NBC TG 1001 ou NBC TG 1000. Sem ela, o sistema escolhe pela receita bruta do ano.' } }, required: ['cnpj', 'ano'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const ano = Number(args.ano);
      if (!cnpj || !Number.isInteger(ano) || ano < 2000 || ano > 2100) return { erro: 'Informe o CNPJ e o ano.' };
      const norma = ['NBC TG 1002', 'NBC TG 1001', 'NBC TG 1000'].find((n) => n.replace(/\s/g, '') === String(args.norma || '').toUpperCase().replace(/\s/g, '')) || '';
      return { cnpj, params: { cnpj, ano, norma }, titulo: `Preparar o modelo das notas explicativas de ${ano}`, descricao: [`Empresa ${cnpj}`, norma ? `Norma: ${norma}` : 'Norma escolhida pela receita bruta do ano', 'Se já existem notas desse ano, nada é alterado.'], resumo: `Modelo de notas ${cnpj} ${ano}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/demonstracoes/${q(String(params.cnpj))}/notas-modelo`, { ano: params.ano, norma: params.norma || undefined });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'marcar_entrega_sped', description: 'PAINEL DO ESCRITÓRIO: propõe marcar a ECD ou a ECF de um ano como ENTREGUE (com o número do recibo, se a pessoa disser) ou, com desfazer, voltar para "a entregar". Não transmite nada: só registra o que a equipe já entregou no programa da Receita. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, obrigacao: { type: 'STRING', description: 'ECD ou ECF.' }, ano: { type: 'NUMBER', description: 'Ano-calendário da escrituração.' }, recibo: { type: 'STRING' }, desfazer: { type: 'BOOLEAN' } }, required: ['cnpj', 'obrigacao', 'ano'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const obrigacao = String(args.obrigacao || '').toUpperCase(); const ano = Number(args.ano);
      if (!cnpj || !['ECD', 'ECF'].includes(obrigacao) || !Number.isInteger(ano)) return { erro: 'Informe o CNPJ, a obrigação (ECD ou ECF) e o ano.' };
      const desfazer = args.desfazer === true; const recibo = String(args.recibo || '').slice(0, 60);
      return { cnpj, params: { cnpj, obrigacao, ano, recibo, desfazer }, titulo: desfazer ? `Voltar a ${obrigacao} ${ano} para "a entregar"` : `Marcar a ${obrigacao} ${ano} como entregue`, descricao: [`Empresa ${cnpj}`, recibo ? `Recibo: ${recibo}` : 'Sem número de recibo', 'Só registra no painel; não transmite nada.'], resumo: `${desfazer ? 'Desfazer entrega' : 'Entrega'} ${obrigacao} ${ano} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/painel-escritorio/entrega', params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Feito.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'conferir_demonstracoes_agora', description: 'DEMONSTRAÇÕES: propõe rodar AGORA o Robô Conferidor das Demonstrações (que roda sozinho a cada 6 horas): confere DFC, DMPL, classificação das contas, notas explicativas e a Parte B da ECF de todas as empresas. Só lê. Vira cartão.', parameters: { type: 'OBJECT', properties: {} } },
    async preparar() {
      return { cnpj: '', params: {}, titulo: 'Rodar agora a conferência das demonstrações', descricao: ['Confere DFC, DMPL, classificação das contas, notas e Parte B de todas as empresas.', 'Só lê; o painel do escritório atualiza em instantes.'], resumo: 'Conferir demonstrações agora' };
    },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/demonstracoes/conferir-agora', {});
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Iniciado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_dva', description: 'DVA (Demonstração do Valor Adicionado, CPC 09 (R1)): mostra, de UMA empresa e UM ano, a riqueza gerada (receitas, insumos, depreciação, transferências) e a distribuída (pessoal, impostos, juros/aluguéis, capitais próprios), se o distribuído é igual ao gerado e as contas de resultado sem linha da DVA. Obrigatória só para companhia aberta (Lei 6.404/1976, art. 176, V). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, ano: { type: 'NUMBER', description: 'Ano (AAAA).' } }, required: ['cnpj', 'ano'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const ano = Number(args.ano);
      if (!cnpj || !Number.isInteger(ano)) return { erro: 'Informe CNPJ e ano (AAAA).' };
      const r = await ctx.chamarApi('GET', `/api/demonstracoes/${q(cnpj)}/dva?ano=${ano}`);
      if (!ok(r)) return erroApi(r);
      const d = r.corpo?.dva || {};
      return { ano, resumo: d.resumo, fecha: d.completa, obrigatoria: d.obrigatoria, linhas: (d.linhasModelo || []).filter((l: any) => l.total).map((l: any) => ({ item: l.codigo, descricao: l.rotulo, valor: (l.centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) })), pendentes: (d.pendentes || []).slice(0, 20).map((c: any) => `${c.codigo} ${c.descricao}`), avisos: d.avisos, fontes: (d.fontes || []).map((f: any) => f.nome), tela: 'Demonstrações e relatórios › DVA' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'escolher_linha_dva', description: 'DVA: propõe gravar a linha da DVA de UMA conta de resultado (ex.: "Demais impostos" vai para impostos municipais). Linhas: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 4, 6.1, 6.2, 6.3, 8.1.1, 8.1.2, 8.1.3, 8.2.1, 8.2.2, 8.2.3, 8.3.1, 8.3.2, 8.3.3, 8.4.1; vazio volta à sugestão. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: props.cnpj, conta: { type: 'STRING', description: 'Código da conta analítica.' }, linha: { type: 'STRING', description: 'Linha da DVA (ex.: 8.2.3) ou vazio.' } }, required: ['cnpj', 'conta'] } },
    async preparar(_ctx, args) {
      const cnpj = cnpjDe(args.cnpj); const conta = String(args.conta || '').trim(); const linha = String(args.linha || '').trim();
      if (!cnpj || !conta) return { erro: 'Informe CNPJ e a conta.' };
      if (linha && !ehLinhaDva(linha)) return { erro: 'Linha da DVA inválida. Use, por exemplo, 8.2.1 (federais), 8.2.2 (estaduais), 8.2.3 (municipais).' };
      return { cnpj, params: { cnpj, conta, linha }, titulo: `DVA: conta ${conta}`, descricao: [linha ? `Linha ${linha} — ${ROTULO_DVA[linha as keyof typeof ROTULO_DVA]}` : 'Volta para a sugestão do sistema.', 'Só muda a DVA; não mexe em lançamento nenhum.'], resumo: `Linha DVA ${conta} ${linha || 'sugestão'}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/demonstracoes/${q(String(params.cnpj))}/dva/classificar`, { conta: params.conta, linha: params.linha });
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Gravado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'conferir_dva_agora', description: 'DVA: propõe rodar AGORA o Robô Conferidor da DVA nas empresas do usuário (o mesmo do botão "Rodar agora: conferir a DVA"): confere se o valor distribuído é igual ao valor gerado. Só lê. Vira cartão.', parameters: { type: 'OBJECT', properties: { ano: { type: 'NUMBER', description: 'Ano (AAAA). Sem ele, o ano anterior.' } } } },
    async preparar(_ctx, args) {
      const ano = Number(args.ano);
      return { cnpj: '', params: Number.isInteger(ano) ? { ano } : {}, titulo: 'Conferir agora a DVA', descricao: [`Ano ${Number.isInteger(ano) ? ano : 'anterior'}, em cada empresa sua com movimento.`, 'Confere se o valor distribuído é igual ao valor gerado e lista as contas sem linha da DVA.', 'Só lê.'], resumo: 'Conferir DVA' };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', '/api/demonstracoes/dva/conferir-agora', params || {});
      if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro };
      for (let i = 0; i < 40; i++) {
        await new Promise((fim) => setTimeout(fim, 1500));
        const g = await ctx.chamarApi('GET', '/api/demonstracoes/dva/conferir-agora');
        const p = ok(g) ? g.corpo?.progresso : null;
        if (p?.fim) return p.erro ? { sucesso: false, mensagem: `A conferência falhou: ${p.erro}` } : { sucesso: true, mensagem: String(p.resultado || 'Conferida.') };
      }
      return { sucesso: true, mensagem: 'A conferência continua rodando; o resultado aparece em Demonstrações e relatórios › DVA.' };
    },
  },
];

export const INSTRUCAO_DEMONSTRACOES = `

DEMONSTRAÇÕES E RELATÓRIOS (tela "Demonstrações e relatórios")
- Para DFC, DMPL, índices (liquidez, endividamento, margens) e a evolução de 12 meses de uma empresa, use consultar_demonstracoes e explique cada índice em palavras simples. PDF, Excel e o "Relatório para o cliente" (PDF bonito com DRE, balanço, índices e gráfico) saem na tela; ofereça mostrar_na_tela.
- Para "quem fechou o mês", "quem tem pendência", "quem falta entregar ECD/ECF", use painel_do_escritorio. Para marcar uma entrega já feita no programa da Receita, marcar_entrega_sped (cartão).
- Notas explicativas: preparar_notas_explicativas cria o modelo (cartão) e a contadora completa o que está entre colchetes na tela; nunca invente fato da empresa.
- Classificação das contas para a DFC, Bloco Y (sócios Y600, receita por estabelecimento Y540) e Parte B do e-Lalur/e-Lacs (M010, M410, M500, com o saldo passando de um ano para o outro) são preenchidos na tela; você pode preencher_na_tela, quem salva é a pessoa.
- Importar a ECD (TXT oficial) de outro sistema (o sistema anterior, Domínio...), é na tela Migração Contábil: a pessoa escolhe o arquivo; entram plano, saldos de abertura e lançamentos pendentes de aprovação, sem duplicar.
- DVA (Demonstração do Valor Adicionado, CPC 09 (R1); obrigatória para companhia aberta pela Lei 6.404/1976, art. 176, V): consultar_dva mostra a riqueza gerada e a distribuída e se fecham; para a conta pendente use escolher_linha_dva (cartão, uma conta por vez) e para conferir conferir_dva_agora (cartão). PDF e Excel saem na tela Demonstrações e relatórios › DVA.
- Para conferir tudo isso na hora, conferir_demonstracoes_agora (cartão).`;
