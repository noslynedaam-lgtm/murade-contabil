// Agente IA: títulos a pagar/receber e informações de cartões (antiga DIRF). Ler é direto; baixar e gerar provisão são
// por cartão de confirmação (o lançamento vai para aprovação). Mesmas rotas da tela Gestão › Títulos.
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';
import { textoParaCentavos } from '../utils/escrituracaoAvancada';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const INSTRUCAO_TITULOS_CARTOES = `
MODELOS DE LANÇAMENTO: para "lança pelo modelo X, valor Y" use lancar_pelo_modelo (cartão; o lançamento vai para aprovação). Se houver mais de um modelo parecido, pergunte qual.
TÍTULOS A PAGAR E RECEBER (Gestão › Títulos): use listar_titulos para "o que tenho a pagar/receber", "o que venceu". Baixar (pagamento/recebimento) é baixar_titulo e gerar a provisão é gerar_provisao_titulo, sempre por cartão; o lançamento vai para aprovação. Títulos que vieram do sistema anterior já estavam contabilizados lá. CARTÕES: informacoes_cartoes mostra as informações de cartões que vieram do sistema anterior (antiga DIRF); diga que a DIRF foi extinta para fatos a partir de 01/01/2025 (IN RFB nº 2.181/2024) e que pagamentos e retenções passaram para a EFD-Reinf e o eSocial.`;

export const FERRAMENTAS_TITULOS_CARTOES: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'listar_titulos', description: 'TÍTULOS: os títulos a pagar e a receber da empresa (em aberto, vencidos, baixados), com valor, vencimento e quanto falta. Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, situacao: { type: 'STRING', description: 'Opcional: abertos (padrão), vencidos ou todos.' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/titulos`);
      if (!ok(r)) return erroApi(r);
      const filtro = String(args.situacao || 'abertos');
      const lista = (r.corpo.titulos || []).filter((t: any) => filtro === 'todos' || (filtro === 'vencidos' ? t.situacao === 'vencido' : t.situacao !== 'baixado'));
      return { cnpj, resumo: r.corpo.resumo, titulos: lista.slice(0, 30).map((t: any) => ({ id: t.id, tipo: t.tipo === 'pagar' ? 'a pagar' : 'a receber', participante: t.participanteNome, numero: t.numero, emissao: t.dataEmissao, vencimento: t.vencimento || null, valor: reais(t.valorCentavos), falta: reais(t.valorCentavos - t.baixadoCentavos), situacao: t.situacao, veioDoSistemaAnterior: t.origem === 'sistema_anterior' })), tela: 'Gestão › Títulos a pagar e receber' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'baixar_titulo', description: 'TÍTULOS: propõe registrar a baixa (pagamento ou recebimento) de UM título: data, valor e a conta do caixa/banco. O lançamento vai para aprovação. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING', description: 'id do título (de listar_titulos).' }, data: { type: 'STRING', description: 'AAAA-MM-DD.' }, valor: { type: 'STRING', description: 'Opcional, ex.: 1.234,56. Sem ele, o que falta.' }, contaDisponibilidade: { type: 'STRING', description: 'Código da conta do caixa ou banco.' } }, required: ['cnpj', 'id', 'data', 'contaDisponibilidade'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/titulos`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const t = (r.corpo.titulos || []).find((x: any) => x.id === String(args.id));
      if (!t) return { erro: 'Não achei este título.' };
      const falta = t.valorCentavos - t.baixadoCentavos;
      const valor = args.valor ? textoParaCentavos(args.valor) : falta;
      if (!valor || valor <= 0 || valor > falta) return { erro: `Informe um valor até ${reais(falta)}.` };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.data || ''))) return { erro: 'Informe a data (AAAA-MM-DD).' };
      return { cnpj, params: { cnpj, id: t.id, data: String(args.data), valorCentavos: valor, contaDisponibilidade: String(args.contaDisponibilidade || '') }, titulo: `Baixar ${t.tipo === 'pagar' ? 'pagamento' : 'recebimento'} do título ${t.numero}`, descricao: [`${t.participanteNome}`, `Valor: ${reais(valor)} em ${String(args.data).split('-').reverse().join('/')}`, `Caixa/banco: ${args.contaDisponibilidade}`, 'O lançamento vai para aprovação.'], resumo: `Baixa título ${t.numero} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/titulos/${q(String(params.id))}/baixa`, params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Baixa registrada.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'gerar_provisao_titulo', description: 'TÍTULOS: propõe gerar a provisão (reconhecimento da despesa/receita) de UM título que já tem as duas contas. O lançamento vai para aprovação. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING' } }, required: ['cnpj', 'id'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/titulos`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const t = (r.corpo.titulos || []).find((x: any) => x.id === String(args.id));
      if (!t) return { erro: 'Não achei este título.' };
      if ((t.provisoes || []).length) return { erro: 'Este título já tem provisão.' };
      return { cnpj, params: { cnpj, id: t.id }, titulo: `Gerar a provisão do título ${t.numero}`, descricao: [`${t.participanteNome} — ${reais(t.valorCentavos)}`, `Contas: ${t.contaTitulo || '?'} e ${t.contaContrapartida || '?'}`, 'O lançamento vai para aprovação.'], resumo: `Provisão título ${t.numero} ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/titulos/${q(String(params.id))}/provisao`, {});
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Provisão gerada.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'informacoes_cartoes', description: 'CARTÕES: as informações de cartões que vieram do sistema anterior (antiga DIRF): operadora, estabelecimento e, por ano, rendimento e IR informados. Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/cartoes`);
      if (!ok(r)) return erroApi(r);
      return { cnpj, aviso: r.corpo.aviso, estabelecimentos: (r.corpo.estabelecimentos || []).map((e: any) => {
        const anos: Record<string, { rendimento: number; ir: number }> = {};
        for (const m of e.movimentos || []) { const a = String(m.referencia).slice(0, 4); anos[a] = anos[a] || { rendimento: 0, ir: 0 }; anos[a].rendimento += m.rendimentoCentavos; anos[a].ir += m.irCentavos; }
        return { operadora: e.operadora, estabelecimento: e.codigoEstabelecimento, porAno: Object.fromEntries(Object.entries(anos).map(([a, x]) => [a, { rendimento: reais(x.rendimento), ir: reais(x.ir) }])) };
      }), tela: 'Gestão › Cartões (antiga DIRF)' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'lancar_pelo_modelo', description: 'LANÇAMENTOS: propõe um lançamento manual a partir de um MODELO de lançamento da empresa (pelo nome ou código, ex.: "Venda de Mercadoria à Vista" ou "00047"), com o valor, a data e um complemento opcional do histórico. O lançamento vai para aprovação. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, modelo: { type: 'STRING', description: 'Nome ou código do modelo.' }, valor: { type: 'STRING', description: 'Ex.: 1.234,56. Sem ele, vale o valor fixo do modelo.' }, data: { type: 'STRING', description: 'AAAA-MM-DD (padrão: hoje).' }, complemento: { type: 'STRING', description: 'Opcional: texto que completa o histórico (ex.: número da nota).' } }, required: ['cnpj', 'modelo'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const semAc = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const busca = semAc(String(args.modelo || ''));
      const modelos: any[] = (r.corpo?.dados?.lancamentosPadrao || []).filter((p: any) => p.uso === 'modelo');
      const achados = modelos.filter((m) => semAc(String(m.codigo || '')) === busca || semAc(m.nome) === busca);
      const lista = achados.length ? achados : modelos.filter((m) => semAc(m.nome).includes(busca));
      if (!lista.length) return { erro: `Não achei o modelo "${args.modelo}". Modelos desta empresa: ${modelos.slice(0, 8).map((m) => `${m.codigo || ''} ${m.nome}`.trim()).join('; ') || 'nenhum'}.` };
      if (lista.length > 1) return { erro: `Há ${lista.length} modelos parecidos: ${lista.slice(0, 6).map((m) => `${m.codigo || ''} ${m.nome}`.trim()).join('; ')}. Diga qual.` };
      const m = lista[0];
      const fixo = (m.partidas || []).reduce((t: number, x: any) => t + Number(x.valorCentavos || 0), 0);
      const valor = args.valor ? textoParaCentavos(args.valor) : fixo;
      if (!valor || valor <= 0) return { erro: 'Diga o valor do lançamento (o modelo não tem valor fixo).' };
      if ((m.partidas || []).length !== 1 && !args.valor) return { erro: 'Este modelo tem várias partidas: lance pela tela.' };
      const data = /^\d{4}-\d{2}-\d{2}$/.test(String(args.data || '')) ? String(args.data) : new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
      const historico = `${m.historico}${args.complemento ? ` ${String(args.complemento).trim()}` : ''}`.slice(0, 240);
      const partidas = (m.partidas || []).length === 1 ? [{ conta: m.partidas[0].conta, valorCentavos: valor }] : m.partidas;
      return { cnpj, params: { cnpj, data, historico, forma: m.forma, contaUnica: m.contaUnica, partidas, totalCentavos: valor }, titulo: `Lançar pelo modelo ${m.codigo ? `${m.codigo} — ` : ''}${m.nome}`,
        descricao: [`${m.forma === '1xN' ? 'D' : 'C'} ${m.contaUnica} / ${m.forma === '1xN' ? 'C' : 'D'} ${partidas.map((x: any) => x.conta).join(', ')}`, `Valor: ${reais(valor)} em ${data.split('-').reverse().join('/')}`, `Histórico: ${historico}`, 'O lançamento vai para aprovação.'], resumo: `Lançamento pelo modelo ${m.nome} ${cnpj}`.slice(0, 160) };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/lancamentos-compostos`, params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Lançamento enviado para aprovação.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
];
