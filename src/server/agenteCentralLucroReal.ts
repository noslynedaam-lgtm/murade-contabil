// Agente IA (voz e chat): Central do Lucro Real. Ler é direto; aceitar uma diferença entre os sistemas e dar baixa de uma declaração
// são por cartão de confirmação. Mesmas rotas da tela (Livros › Apuração do Lucro Real › Central do Lucro Real).
import { erroApi, ok, q, type Ferramenta } from "./agenteMotor";

const cnpjDe = (v: unknown) => { const d = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const INSTRUCAO_CENTRAL_LUCRO_REAL = `
CENTRAL DO LUCRO REAL: a multa é pesada, então nada pode faltar. Quando a pessoa começar a conversa ou perguntar "o que tenho para hoje", use avisos_lucro_real e fale PRIMEIRO os avisos vermelhos (sem confirmar, vencendo, vencidos com multa e juros estimados, diferença entre Fiscal, DP e Contábil que bloqueia a guia). Os avisos só param com a confirmação E a baixa (pagamento registrado ou declaração entregue). Para uma empresa, use central_lucro_real. Aceitar uma diferença (aceitar_diferenca_lucro_real) e dar baixa de DCTFWeb/EFD-Contribuições (baixa_obrigacao_lucro_real) só com o cartão. Nunca diga que está pago ou entregue sem a baixa registrada.`;

export const FERRAMENTAS_CENTRAL_LUCRO_REAL: Ferramenta[] = [
  {
    tipo: "leitura",
    declaracao: { name: "avisos_lucro_real", description: "Avisos do Lucro Real de TODAS as empresas do seu acesso: o que falta confirmar, o que vence em 10, 5, 3, 1 dia ou hoje, o que está atrasado (com multa e juros estimados) e as diferenças entre os sistemas que bloqueiam a guia.", parameters: { type: "OBJECT", properties: {} } },
    async executar(ctx) { const r = await ctx.chamarApi("GET", "/api/lucro-real/avisos"); if (!ok(r)) return erroApi(r); const av = r.corpo.avisos || []; return { total: av.length, vermelhos: av.filter((a: any) => a.nivel === "vermelho").length, avisos: av.slice(0, 30) }; },
  },
  {
    tipo: "leitura",
    declaracao: { name: "central_lucro_real", description: "Central do Lucro Real de uma empresa: todas as obrigações do ano com vencimento, valor, código do DARF, situação (aguardando apuração, conferir, confirmada, baixada), as diferenças entre Fiscal, DP e Contábil e as pendências conhecidas.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, ano: { type: "NUMBER" } }, required: ["cnpj"] } },
    async executar(ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." };
      const r = await ctx.chamarApi("GET", `/api/workspaces/${q(cnpj)}/lucro-real/central${a.ano ? `?ano=${Number(a.ano)}` : ""}`); if (!ok(r)) return erroApi(r);
      return { obrigacoes: (r.corpo.obrigacoes || []).map((o: any) => ({ id: o.id, descricao: o.descricao, vencimento: o.vencimento, valorCentavos: o.valorCentavos, darf: o.codigoDarf, situacao: o.estado, falta: o.oQueFalta, bloqueada: o.bloqueada ? o.motivoBloqueio : null })), diferencas: (r.corpo.divergencias || []).filter((d: any) => d.estado === "aberta"), pendenciasConhecidas: r.corpo.pendenciasConhecidas };
    },
  },
  {
    tipo: "acao",
    declaracao: { name: "aceitar_diferenca_lucro_real", description: "Propõe ACEITAR uma diferença entre os sistemas (ex.: receita do balancete × notas do Fiscal) com a explicação do contador. Libera a guia bloqueada do período. Fica registrado com o nome de quem aceitou.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, id: { type: "STRING", description: "id da diferença (ex.: 2026-05:notas_x_receita)" }, motivo: { type: "STRING", description: "Por que a diferença está certa." } }, required: ["cnpj", "id", "motivo"] } },
    async preparar(_ctx, a) { const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." }; if (String(a.motivo || "").trim().length < 10) return { erro: "Explique por que a diferença está certa." }; return { cnpj, params: { cnpj, id: String(a.id), motivo: String(a.motivo) }, titulo: `Aceitar a diferença ${a.id}`, descricao: [`Motivo: ${a.motivo}`], aviso: "A guia do período deixa de ficar bloqueada por esta diferença.", resumo: `Aceitar diferença ${a.id}` }; },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", `/api/workspaces/${q(String(p.cnpj))}/lucro-real/divergencias/decidir`, { id: p.id, motivo: p.motivo }); return ok(r) ? { sucesso: true, mensagem: "Diferença aceita e registrada." } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
  {
    tipo: "acao",
    declaracao: { name: "baixa_obrigacao_lucro_real", description: "Propõe dar BAIXA (entregue) na DCTFWeb ou na EFD-Contribuições de um mês, com o número do recibo. Guia de imposto se baixa registrando o pagamento; ECD/ECF em Demonstrações.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, obrigacaoId: { type: "STRING", description: "dctfweb:AAAA-MM ou efd_contribuicoes:AAAA-MM" }, recibo: { type: "STRING" } }, required: ["cnpj", "obrigacaoId"] } },
    async preparar(_ctx, a) { const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." }; return { cnpj, params: { cnpj, obrigacaoId: String(a.obrigacaoId), recibo: String(a.recibo || "") }, titulo: `Dar baixa: ${a.obrigacaoId}`, descricao: [a.recibo ? `Recibo ${a.recibo}` : "Sem número de recibo."], aviso: "Só dê baixa se a declaração foi mesmo transmitida.", resumo: `Baixa ${a.obrigacaoId}` }; },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", `/api/workspaces/${q(String(p.cnpj))}/lucro-real/baixa`, { obrigacaoId: p.obrigacaoId, recibo: p.recibo }); return ok(r) ? { sucesso: true, mensagem: "Baixa registrada." } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
];
