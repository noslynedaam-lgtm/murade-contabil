// Agente IA (voz e chat): Apuração do Lucro Real. Ler é direto; apurar, lançar no e-Lalur/e-Lacs e confirmar são por cartão de
// confirmação. Mesmas rotas da tela Livros › Apuração do Lucro Real (mesmo controle de acesso por escritório).
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const anoDe = (v: unknown) => { const a = Number(v); return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : new Date().getFullYear(); };
const reais = (c: unknown) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const nome = (p: string) => (p === 'ANUAL' ? 'ajuste anual' : p.startsWith('T') ? `${p.slice(2)}º trimestre` : `estimativa do mês ${p.slice(1)}`);

export const INSTRUCAO_LUCRO_REAL = `
LUCRO REAL (Livros › Apuração do Lucro Real): o robô calcula o IRPJ e a CSLL pela contabilidade, trimestral ou estimativa mensal (pela receita bruta ou pelo balancete de suspensão/redução — fica o menor), com e-Lalur/e-Lacs e compensação de prejuízo até 30% (Lei 9.065/95). Use consultar_lucro_real para "quanto dá o IRPJ do trimestre", apurar_lucro_real para calcular na hora, lancar_lalur para adição/exclusão/retenção (sempre com o código da tabela M300A/M350A e de onde vem) e confirmar_lucro_real para confirmar um período (a provisão vai para os pré-lançamentos); registrar_pagamento_darf_lucro_real registra a data e o valor pago do DARF (baixa o imposto a recolher). Mês ainda não fechado na contabilidade sai como prévia e não confirma. O DARF é documento para conferência (códigos da Agenda Tributária: estimativa 2362/5993 e 2484, trimestral 0220/3373 e 6012; ajuste anual 2430/2456 e 6773, até o último dia útil de março); nada é pago nem transmitido. JCP: IRRF de 17,5% desde 2026 (LC 224/2025), DARF 5706. MIT da DCTFWeb: o Murad Fiscal usa o IRPJ/CSLL CONFIRMADOS aqui (e os pagamentos registrados) para montar o arquivo do MIT do mês (Declarações / DCTFWeb no Fiscal); período não confirmado deixa o MIT pendente lá.`;

export const FERRAMENTAS_LUCRO_REAL: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_lucro_real', description: 'Mostra a apuração do Lucro Real (IRPJ e CSLL) de uma empresa no ano: cada período (trimestre, estimativa mensal ou ajuste anual), valores, se está pronto, em prévia ou para revisar, DARF com código e vencimento e os saldos de prejuízo fiscal e base negativa (Parte B). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, ano: { type: 'STRING', description: 'Ano com 4 dígitos (padrão: o atual).' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ano = anoDe(args.ano);
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/lucro-real?ano=${ano}`); if (!ok(r)) return erroApi(r);
      const c = r.corpo;
      return {
        ano, configurado: !!c.config, forma: c.config?.forma, obrigadaAoLucroReal: c.config?.obrigada,
        periodos: (c.periodos || []).map((p: any) => ({ periodo: nome(p.periodo), situacao: p.status, irpj: reais(p.irpjCentavos), csll: reais(p.csllCentavos), modo: p.resultado?.modo === 'B' ? 'balancete de suspensão/redução' : p.resultado?.modo === 'E' ? 'receita bruta' : undefined, darfs: (p.resultado?.darfs || []).map((d: any) => ({ tributo: d.tributo, codigo: d.codigo || 'a informar', vencimento: d.vencimento, valor: reais(d.valorCentavos) })), paraRevisar: p.revisar?.length ? p.revisar : undefined })),
        parteB: (c.parteB || []).map((x: any) => ({ periodo: nome(x.periodo), prejuizoFiscalFinal: reais(x.prejuizoFiscal.final), baseNegativaFinal: reais(x.baseNegativa.final) })),
        parteBOutrasContas: (c.parteBContas || []).map((x: any) => ({ id: x.conta.id, codigo: x.conta.codigo, descricao: x.conta.descricao, natureza: x.conta.natureza === 'a_excluir' ? 'adicionado, a excluir no futuro' : 'excluído, a adicionar no futuro', saldoInicioAno: reais(x.saldoInicialAnoCentavos), formado: reais(x.formadoCentavos), realizado: reais(x.realizadoCentavos), saldoFinal: reais(x.saldoFinalCentavos) })),
        lancamentosParteA: (c.lancamentos || []).length,
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'apurar_lucro_real', description: 'Propõe APURAR agora o IRPJ e a CSLL do Lucro Real de uma empresa no ano, pela contabilidade e pelo e-Lalur/e-Lacs. Não confirma, não paga e não transmite.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, ano: { type: 'STRING', description: 'Ano.' } }, required: ['cnpj'] } },
    async preparar(_ctx, args) { const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' }; const ano = anoDe(args.ano); return { cnpj, params: { cnpj, ano }, titulo: 'Apurar o Lucro Real agora', descricao: [`Empresa ${cnpj}`, `Ano ${ano}`, 'Calcula pela contabilidade; você confere e confirma cada período depois.'], resumo: `Apurar Lucro Real ${cnpj} ${ano}` }; },
    async executar(ctx, p) { const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(p.cnpj))}/lucro-real/apurar`, { ano: p.ano }); if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro }; return { sucesso: true, mensagem: r.corpo?.avisos?.length ? r.corpo.avisos.join(' ') : 'Apuração feita. Use consultar_lucro_real para ver os valores.' }; },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'lancar_lalur', description: 'Propõe LANÇAR no e-Lalur/e-Lacs (Parte A) uma adição, exclusão, IRRF retido, CSLL retida ou devolução de venda (estimativa pela receita), com o código da tabela M300A/M350A da ECF e de onde vem o valor. Se o valor volta em ano seguinte (provisão não dedutível etc.), informe contaParteB (id da conta da Parte B em consultar_lucro_real).', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ.' }, contaParteB: { type: 'STRING', description: 'Opcional: id da conta da Parte B (parteBOutrasContas em consultar_lucro_real).' }, ano: { type: 'STRING', description: 'Ano.' }, mes: { type: 'STRING', description: 'Mês (1 a 12).' }, tipo: { type: 'STRING', description: 'adicao, exclusao, irrf_retido, csll_retida ou deducao_receita_bruta.' }, tributo: { type: 'STRING', description: 'irpj, csll ou ambos.' }, codigo: { type: 'STRING', description: 'Código da tabela M300A/M350A (adição/exclusão).' }, descricao: { type: 'STRING', description: 'Descrição.' }, valor: { type: 'STRING', description: 'Valor em reais.' }, justificativa: { type: 'STRING', description: 'De onde vem o valor.' } }, required: ['cnpj', 'mes', 'tipo', 'valor', 'justificativa'] } },
    async preparar(_ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const params = { cnpj, ano: anoDe(a.ano), mes: Number(a.mes), tipo: String(a.tipo || ''), tributo: String(a.tributo || 'ambos'), codigo: String(a.codigo || ''), descricao: String(a.descricao || ''), valor: String(a.valor || ''), justificativa: String(a.justificativa || ''), ...(a.contaParteB ? { contaParteB: String(a.contaParteB) } : {}) };
      if ((params.tipo === 'adicao' || params.tipo === 'exclusao') && !params.codigo) return { erro: 'Diga o código da tabela M300A/M350A da ECF (por exemplo 8.60 para multas por infrações fiscais).' };
      return { cnpj, params, titulo: 'Lançar no e-Lalur/e-Lacs', descricao: [`Empresa ${cnpj}`, `${String(params.mes).padStart(2, '0')}/${params.ano} · ${params.tipo} ${params.codigo} · ${params.tributo}`, `${params.descricao} — R$ ${params.valor}`, `De onde vem: ${params.justificativa}`], aviso: 'Adição ou exclusão errada muda o imposto: confira o documento antes.', resumo: `Lalur ${cnpj} ${params.tipo} ${params.valor}` };
    },
    async executar(ctx, p) { const { cnpj, ...corpo } = p as any; const r = await ctx.chamarApi('POST', `/api/workspaces/${q(cnpj)}/lucro-real/lancamentos`, corpo); if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro }; return { sucesso: true, mensagem: 'Lançado. Peça para apurar de novo.' }; },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'confirmar_lucro_real', description: 'Propõe CONFIRMAR um período do Lucro Real já calculado (T01 a T04, A01 a A12 ou ANUAL). A provisão de IRPJ/CSLL vai para os pré-lançamentos para aprovação. Prévia (mês não fechado) e item para revisar não confirmam.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ.' }, ano: { type: 'STRING', description: 'Ano.' }, periodo: { type: 'STRING', description: 'T01..T04, A01..A12 ou ANUAL.' } }, required: ['cnpj', 'periodo'] } },
    async preparar(ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ano = anoDe(a.ano); const periodo = String(a.periodo || '').toUpperCase();
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/lucro-real?ano=${ano}`); if (!ok(r)) return erroApi(r);
      const p = (r.corpo.periodos || []).find((x: any) => x.periodo === periodo);
      if (!p) return { erro: 'Período não apurado. Use apurar_lucro_real antes.' };
      if (p.status !== 'calculado') return { erro: p.status === 'confirmado' ? 'Já confirmado.' : `Não dá para confirmar: ${(p.revisar || []).join(' ') || p.status}` };
      return { cnpj, params: { cnpj, ano, periodo }, titulo: `Confirmar ${nome(periodo)} de ${ano}`, descricao: [`Empresa ${cnpj}`, `IRPJ ${reais(p.irpjCentavos)} · CSLL ${reais(p.csllCentavos)}`, 'A provisão vai para os pré-lançamentos para aprovação.'], aviso: 'Confirme só depois de conferir o balancete e o e-Lalur/e-Lacs.', resumo: `Confirmar Lucro Real ${cnpj} ${ano} ${periodo}` };
    },
    async executar(ctx, p) { const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(p.cnpj))}/lucro-real/confirmar`, { ano: p.ano, periodo: p.periodo }); if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro }; return { sucesso: true, mensagem: 'Período confirmado; a provisão foi para os pré-lançamentos.' }; },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'registrar_pagamento_darf_lucro_real', description: 'Propõe registrar o PAGAMENTO de um DARF do Lucro Real (IRPJ ou CSLL) de um período confirmado: data e valor pago (com multa e juros, se houver). Vira pré-lançamento que baixa o imposto a recolher contra o banco; multa e juros vão para a conta própria. Não paga nada no banco.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ.' }, ano: { type: 'STRING', description: 'Ano.' }, periodo: { type: 'STRING', description: 'T01..T04, A01..A12 ou ANUAL.' }, tributo: { type: 'STRING', description: 'irpj ou csll.' }, dataPagamento: { type: 'STRING', description: 'AAAA-MM-DD.' }, valorPago: { type: 'NUMBER', description: 'Valor pago em reais.' } }, required: ['cnpj', 'periodo', 'tributo', 'dataPagamento', 'valorPago'] } },
    async preparar(ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const ano = anoDe(a.ano); const periodo = String(a.periodo || '').toUpperCase(); const tributo = String(a.tributo || '').toLowerCase();
      const valor = Number(a.valorPago); const data = String(a.dataPagamento || '');
      if (!['irpj', 'csll'].includes(tributo)) return { erro: 'Diga se é o DARF do IRPJ ou da CSLL.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: 'Informe a data do pagamento (AAAA-MM-DD).' };
      if (!(valor > 0)) return { erro: 'Informe o valor pago.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/lucro-real?ano=${ano}`); if (!ok(r)) return erroApi(r);
      const p = (r.corpo.periodos || []).find((x: any) => x.periodo === periodo);
      const d = p?.resultado?.darfs?.find((x: any) => x.tributo === tributo);
      if (!p || p.status !== 'confirmado' || !d) return { erro: 'Período não confirmado ou sem DARF deste tributo.' };
      if ((r.corpo.pagamentos || []).some((g: any) => g.periodo === periodo && g.tributo === tributo)) return { erro: 'O pagamento deste DARF já foi registrado.' };
      const vc = Math.round(valor * 100);
      return { cnpj, params: { cnpj, ano, periodo, tributo, dataPagamento: data, valorPago: valor }, titulo: `Pagamento do DARF ${tributo.toUpperCase()} — ${nome(periodo)} de ${ano}`, descricao: [`DARF ${d.codigo || ''} de ${reais(d.valorCentavos)}; pago em ${data.split('-').reverse().join('/')}: ${reais(vc)}.`, vc > d.valorCentavos ? `Multa e juros: ${reais(vc - d.valorCentavos)} (conta própria).` : 'Sem multa e juros.'], aviso: 'O pré-lançamento baixa o imposto a recolher contra o banco; aprove em Revisão.', resumo: `Pagamento DARF Lucro Real ${cnpj} ${ano} ${periodo} ${tributo}` };
    },
    async executar(ctx, p) { const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(p.cnpj))}/lucro-real/pagamento`, p); if (!ok(r)) return { sucesso: false, mensagem: erroApi(r).erro }; return { sucesso: true, mensagem: 'Pagamento registrado; o pré-lançamento foi para a Revisão.' }; },
  },
];
