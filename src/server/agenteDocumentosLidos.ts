// Agente IA: documentos lidos por foto ou PDF (Lançamentos › Ler documento). A leitura em si precisa do arquivo, então é feita na tela;
// pela voz a pessoa consulta o que foi lido, grava o pré-lançamento de uma leitura (cartão de confirmação; vai para aprovação),
// descarta uma leitura (cartão) e roda o conferidor (só lê).
import { erroApi, ok, q, type Ferramenta } from './agenteMotor';

const cnpjDe = (v: unknown): string | null => { const d = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const reais = (c: number | null) => (c === null ? 'em branco' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : 'em branco');

export const INSTRUCAO_DOCUMENTOS_LIDOS = `
LER DOCUMENTO (foto ou PDF de recibo, boleto pago, nota de despesa, comprovante): a leitura é feita na tela Lançamentos › Ler documento (botões "Tirar foto" e "Escolher foto ou PDF"); se pedirem para ler um documento, diga onde clicar. Para "o que eu li", "documentos a conferir" use consultar_documentos_lidos. Para gravar o pré-lançamento de uma leitura use gravar_documento_lido (cartão; o lançamento vai para Aprovar lançamentos); se faltar data, valor ou conta, pergunte — nunca invente. Se a leitura tiver bloqueio (já está no extrato conciliado ou o arquivo já foi lançado), diga que não dá para gravar e por quê. descartar_documento_lido marca a leitura como descartada (cartão; nada é apagado). conferir_documentos_lidos_agora roda o conferidor (só lê).`;

export const FERRAMENTAS_DOCUMENTOS_LIDOS: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: { name: 'consultar_documentos_lidos', description: 'LER DOCUMENTO: lista as leituras de documentos (foto/PDF) da empresa: data, valor, favorecido, contas sugeridas, o que ficou em branco, bloqueios de duplicidade e a situação (a conferir, gravado, descartado). Só lê.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' } }, required: ['cnpj'] } },
    async executar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/documentos`);
      if (!ok(r)) return erroApi(r);
      const docs = (r.corpo?.documentos || []) as any[];
      return { cnpj, total: docs.length, documentos: docs.slice(0, 20).map((d) => ({
        id: d.id, situacao: d.situacao === 'lido' ? 'a conferir' : d.situacao === 'lancado' ? 'gravado (aguarda aprovação ou aprovado)' : 'descartado',
        tipo: d.leitura?.tipoDocumento || null, data: br(d.leitura?.data ?? null), valor: reais(d.leitura?.valorCentavos ?? null), favorecido: d.leitura?.favorecido || 'em branco',
        debitoSugerido: d.sugestao?.contaDebito?.codigo || 'em branco', creditoSugerido: d.sugestao?.contaCredito?.codigo || 'em branco', historico: d.sugestao?.historico || '',
        emBranco: d.leitura?.emBranco || [], bloqueios: d.sugestao?.bloqueios || [], parecidos: d.sugestao?.parecidos || [], lancamentoId: d.lancamentoId || null,
      })), tela: 'Lançamentos › Ler documento' };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'gravar_documento_lido', description: 'LER DOCUMENTO: propõe gravar o PRÉ-LANÇAMENTO de UMA leitura já feita (id de consultar_documentos_lidos). Usa o que foi lido e sugerido; data, valor, débito, crédito e histórico podem ser informados para completar o que ficou em branco. O lançamento vai para aprovação. Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING' }, data: { type: 'STRING', description: 'Opcional: AAAA-MM-DD.' }, valor: { type: 'STRING', description: 'Opcional: ex. 1.234,56.' }, contaDebito: { type: 'STRING', description: 'Opcional: código da conta de débito.' }, contaCredito: { type: 'STRING', description: 'Opcional: código da conta de crédito (caixa, banco ou cartão).' }, historico: { type: 'STRING' }, eOutroPagamento: { type: 'BOOLEAN', description: 'true só se a pessoa disse que é outro pagamento, quando há lançamento parecido.' } }, required: ['cnpj', 'id'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/documentos`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const d = (r.corpo?.documentos || []).find((x: any) => x.id === String(args.id));
      if (!d) return { erro: 'Não achei esta leitura. Use consultar_documentos_lidos.' };
      if (d.situacao !== 'lido') return { erro: d.situacao === 'lancado' ? 'Esta leitura já foi gravada.' : 'Esta leitura foi descartada; leia o documento de novo na tela.' };
      if ((d.sugestao?.bloqueios || []).length) return { erro: `Não dá para gravar: ${d.sugestao.bloqueios.join(' ')}` };
      const data = String(args.data || d.leitura?.data || '');
      const valor = args.valor ? String(args.valor) : d.leitura?.valorCentavos != null ? (d.leitura.valorCentavos / 100).toFixed(2).replace('.', ',') : '';
      const contaDebito = String(args.contaDebito || d.sugestao?.contaDebito?.codigo || '');
      const contaCredito = String(args.contaCredito || d.sugestao?.contaCredito?.codigo || '');
      const historico = String(args.historico || d.sugestao?.historico || '');
      const falta = [!/^\d{4}-\d{2}-\d{2}$/.test(data) && 'data', !valor && 'valor', !contaDebito && 'conta de débito', !contaCredito && 'conta de crédito', !historico && 'histórico'].filter(Boolean);
      if (falta.length) return { erro: `Falta informar: ${falta.join(', ')}. Pergunte à pessoa (não invente).` };
      if ((d.sugestao?.parecidos || []).length && args.eOutroPagamento !== true) return { erro: `${d.sugestao.parecidos.join(' ')} Pergunte se é outro pagamento antes de gravar.` };
      return { cnpj, params: { cnpj, id: d.id, data, valor, contaDebito, contaCredito, historico, confirmarParecido: args.eOutroPagamento === true }, titulo: 'Gravar o pré-lançamento do documento lido', descricao: [`${d.leitura?.favorecido || 'Documento'} — R$ ${valor} em ${br(data)}`, `Débito ${contaDebito} · Crédito ${contaCredito}`, `Histórico: ${historico}`, 'O lançamento vai para Aprovar lançamentos.'], resumo: `Gravar documento lido ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/documentos/${q(String(params.id))}/lancar`, params);
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Pré-lançamento gravado.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'acao',
    declaracao: { name: 'descartar_documento_lido', description: 'LER DOCUMENTO: propõe descartar UMA leitura ainda não gravada (fica marcada como descartada; nada é apagado nem lançado). Vira cartão.', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING' }, id: { type: 'STRING' } }, required: ['cnpj', 'id'] } },
    async preparar(ctx, args) {
      const cnpj = cnpjDe(args.cnpj); if (!cnpj) return { erro: 'Informe um CNPJ válido.' };
      const r = await ctx.chamarApi('GET', `/api/workspaces/${q(cnpj)}/documentos`);
      if (!ok(r)) return { erro: erroApi(r).erro };
      const d = (r.corpo?.documentos || []).find((x: any) => x.id === String(args.id));
      if (!d || d.situacao !== 'lido') return { erro: 'Não achei esta leitura a conferir.' };
      return { cnpj, params: { cnpj, id: d.id }, titulo: 'Descartar a leitura do documento', descricao: [`${d.leitura?.favorecido || 'Documento'} — ${reais(d.leitura?.valorCentavos ?? null)}`, 'Nada é lançado nem apagado; a leitura fica marcada como descartada.'], resumo: `Descartar documento lido ${cnpj}` };
    },
    async executar(ctx, params) {
      const r = await ctx.chamarApi('POST', `/api/workspaces/${q(String(params.cnpj))}/documentos/${q(String(params.id))}/descartar`, {});
      return ok(r) ? { sucesso: true, mensagem: String(r.corpo?.mensagem || 'Leitura descartada.') } : { sucesso: false, mensagem: erroApi(r).erro };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'conferir_documentos_lidos_agora', description: 'LER DOCUMENTO: roda agora o Robô Conferidor dos Documentos Lidos nas empresas do usuário (leitura parada, lançamento que sumiu, duplicidade). Só lê.', parameters: { type: 'OBJECT', properties: {} } },
    async executar(ctx) {
      const r = await ctx.chamarApi('POST', '/api/documentos-lidos/conferir-agora', {});
      if (!ok(r)) return erroApi(r);
      return { resumo: r.corpo?.resumo, achados: (r.corpo?.achados || []).slice(0, 15) };
    },
  },
];
