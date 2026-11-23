// Agente IA (voz e chat): Central do Lucro Real. Ler é direto; aceitar uma diferença entre os sistemas e dar baixa de uma declaração
// são por cartão de confirmação. Mesmas rotas da tela (Livros › Apuração do Lucro Real › Central do Lucro Real).
import { erroApi, ok, q, type Ferramenta } from "./agenteMotor";

const cnpjDe = (v: unknown) => { const d = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };

export const INSTRUCAO_CENTRAL_LUCRO_REAL = `
CENTRAL DO LUCRO REAL: a multa é pesada, então nada pode faltar. Quando a pessoa começar a conversa ou perguntar "o que tenho para hoje", use avisos_lucro_real e fale PRIMEIRO os avisos vermelhos (sem confirmar, vencendo, vencidos com multa e juros estimados, diferença entre Fiscal, DP e Contábil que bloqueia a guia). Os avisos só param com a confirmação E a baixa (pagamento registrado ou declaração entregue). Para uma empresa, use central_lucro_real. Aceitar uma diferença (aceitar_diferenca_lucro_real) e dar baixa de DCTFWeb/EFD-Contribuições (baixa_obrigacao_lucro_real) só com o cartão. Nunca diga que está pago ou entregue sem a baixa registrada.
JCP: quando a pessoa disser que pagou ou creditou juros sobre capital próprio, use registrar_jcp_lucro_real (com o cartão): o IRRF de 17,5% (desde 2026; 15% antes) vira obrigação do DARF 5706, vencendo no 3º dia útil depois do decêndio do pagamento. Retenções como tomadora (IRRF e CSRF 5952) vêm sozinhas do rascunho da EFD-Reinf do Fiscal; para buscar agora, use atualizar_retencoes_lucro_real.
AVISO NO CELULAR: o aviso da Central chega pelo aplicativo do Murad Fiscal (Central Anti-Multa). Para saber se saiu hoje, use aviso_celular_lucro_real; para mandar agora, enviar_aviso_celular_lucro_real (com o cartão). Se ninguém recebe, oriente: Murad Fiscal › Federal & Simples › Central Anti-Multa › "Abrir" › "Ativar avisos neste aparelho" (no iPhone, com o aplicativo instalado na Tela de Início).`;

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
    declaracao: { name: "baixa_obrigacao_lucro_real", description: "Propõe dar BAIXA numa obrigação da Central: DCTFWeb ou EFD-Contribuições entregue (com o recibo), ou DARF pago do IRRF sobre JCP e das retenções como tomadora (IRRF e CSRF). IRPJ/CSLL se baixa registrando o pagamento; PIS/COFINS no Fiscal; ECD/ECF em Demonstrações.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, obrigacaoId: { type: "STRING", description: "dctfweb:AAAA-MM, efd_contribuicoes:AAAA-MM, irrf_tomador:AAAA-MM, csrf_tomador:AAAA-MM ou irrf_jcp:<id> (id da obrigação na central_lucro_real)" }, recibo: { type: "STRING", description: "Recibo da declaração ou número/autenticação do DARF pago." } }, required: ["cnpj", "obrigacaoId"] } },
    async preparar(_ctx, a) { const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." }; return { cnpj, params: { cnpj, obrigacaoId: String(a.obrigacaoId), recibo: String(a.recibo || "") }, titulo: `Dar baixa: ${a.obrigacaoId}`, descricao: [a.recibo ? `Recibo ${a.recibo}` : "Sem número de recibo."], aviso: "Só dê baixa se a declaração foi mesmo transmitida ou o DARF foi mesmo pago.", resumo: `Baixa ${a.obrigacaoId}` }; },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", `/api/workspaces/${q(String(p.cnpj))}/lucro-real/baixa`, { obrigacaoId: p.obrigacaoId, recibo: p.recibo }); return ok(r) ? { sucesso: true, mensagem: "Baixa registrada." } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
  {
    tipo: "acao",
    declaracao: { name: "registrar_jcp_lucro_real", description: "Propõe REGISTRAR um pagamento ou crédito de juros sobre capital próprio (JCP) da empresa. O IRRF (17,5% desde 1º/01/2026, LC 224/2025; 15% antes) vira obrigação do DARF 5706 na Central do Lucro Real, com vencimento no 3º dia útil depois do decêndio (Lei 11.196/2005, art. 70, I, b).", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, dataPagamento: { type: "STRING", description: "Data do pagamento ou crédito, AAAA-MM-DD." }, valor: { type: "STRING", description: "Valor BRUTO do JCP em reais (ex.: 10.000,00)." }, beneficiarios: { type: "STRING", description: "Opcional: sócios/acionistas." } }, required: ["cnpj", "dataPagamento", "valor"] } },
    async preparar(_ctx, a) {
      const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." };
      const data = String(a.dataPagamento || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data do pagamento ou crédito (AAAA-MM-DD)." };
      const aliq = data >= "2026-01-01" ? "17,5%" : "15%";
      return { cnpj, params: { cnpj, dataPagamento: data, valor: String(a.valor || ""), beneficiarios: String(a.beneficiarios || "") }, titulo: `Registrar JCP de ${data.split("-").reverse().join("/")}`, descricao: [`Valor bruto: R$ ${a.valor}`, `IRRF de ${aliq} — DARF 5706`, a.beneficiarios ? `Beneficiários: ${a.beneficiarios}` : "Beneficiários não informados."], aviso: "O IRRF passa a ser cobrado na Central do Lucro Real até a baixa do DARF.", resumo: `Registrar JCP ${data}` };
    },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", `/api/workspaces/${q(String(p.cnpj))}/lucro-real/jcp-pagamentos`, { dataPagamento: p.dataPagamento, valor: p.valor, beneficiarios: p.beneficiarios }); return ok(r) ? { sucesso: true, mensagem: `JCP registrado: IRRF ${((r.corpo.jcp?.irrfCentavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, vence ${String(r.corpo.jcp?.vencimento || "").split("-").reverse().join("/")} (DARF 5706).` } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
  {
    tipo: "acao", exclusao: true,
    declaracao: { name: "excluir_jcp_lucro_real", description: "Propõe APAGAR UM registro de JCP lançado errado (um por vez; a obrigação do IRRF dele sai da Central).", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, id: { type: "STRING", description: "id do JCP (ex.: jcp-20260115-abc)" } }, required: ["cnpj", "id"] } },
    async preparar(_ctx, a) { const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." }; return { cnpj, params: { cnpj, id: String(a.id) }, titulo: `Apagar o JCP ${a.id}`, descricao: ["Apaga só este registro de JCP e a obrigação do IRRF dele."], aviso: "Não dá para desfazer: para voltar, registre o JCP de novo.", irreversivel: true, resumo: `Apagar JCP ${a.id}` }; },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", `/api/workspaces/${q(String(p.cnpj))}/lucro-real/jcp-pagamentos/excluir`, { id: p.id }); return ok(r) ? { sucesso: true, mensagem: "Registro de JCP apagado." } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
  {
    tipo: "leitura",
    declaracao: { name: "atualizar_retencoes_lucro_real", description: "Busca AGORA no Murad Fiscal as retenções feitas pela empresa como tomadora (IRRF e CSLL/COFINS/PIS das NFS-e tomadas) e atualiza as obrigações na Central do Lucro Real.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING" }, ano: { type: "NUMBER" } }, required: ["cnpj"] } },
    async executar(ctx, a) { const cnpj = cnpjDe(a.cnpj); if (!cnpj) return { erro: "Informe um CNPJ válido." }; const r = await ctx.chamarApi("POST", `/api/workspaces/${q(cnpj)}/lucro-real/retencoes/atualizar`, a.ano ? { ano: Number(a.ano) } : {}); if (!ok(r)) return erroApi(r); return { meses: r.corpo.meses, retencoes: (r.corpo.obrigacoes || []).filter((o: any) => o.tipo === "irrf_tomador" || o.tipo === "csrf_tomador").map((o: any) => ({ id: o.id, descricao: o.descricao, vencimento: o.vencimento, valorCentavos: o.valorCentavos, darf: o.codigoDarf, situacao: o.estado })) }; },
  },
  {
    tipo: "leitura",
    declaracao: { name: "aviso_celular_lucro_real", description: "Diz se o aviso do Lucro Real já foi para o celular hoje, empresa por empresa (quantos aparelhos receberam, quem está sem aparelho ativado, silenciado ou adiado pelo horário silencioso).", parameters: { type: "OBJECT", properties: {} } },
    async executar(ctx) { const r = await ctx.chamarApi("GET", "/api/lucro-real/aviso-celular"); if (!ok(r)) return erroApi(r); return { empresasDoLucroReal: r.corpo.empresas, enviadosHoje: r.corpo.hoje, comoAtivar: "Murad Fiscal › Federal & Simples › Central Anti-Multa › Abrir › Ativar avisos neste aparelho." }; },
  },
  {
    tipo: "acao",
    declaracao: { name: "enviar_aviso_celular_lucro_real", description: "Propõe mandar AGORA para o celular os avisos da Central do Lucro Real (de uma empresa ou de todas do seu acesso). No máximo uma vez por hora; sem valores na tela bloqueada.", parameters: { type: "OBJECT", properties: { cnpj: { type: "STRING", description: "Opcional: só esta empresa." } } } },
    async preparar(_ctx, a) { const cnpj = a.cnpj ? cnpjDe(a.cnpj) : null; if (a.cnpj && !cnpj) return { erro: "Informe um CNPJ válido." }; return { cnpj: cnpj || "", params: cnpj ? { cnpj } : {}, titulo: "Mandar os avisos do Lucro Real para o celular agora", descricao: [cnpj ? `Empresa ${cnpj}` : "Todas as empresas do Lucro Real do seu acesso."], aviso: "Chega em quem ativou o aviso no aplicativo do Murad Fiscal.", resumo: "Aviso no celular agora" }; },
    async executar(ctx, p) { const r = await ctx.chamarApi("POST", "/api/lucro-real/aviso-celular/enviar", p.cnpj ? { cnpj: p.cnpj } : {}); return ok(r) ? { sucesso: true, mensagem: `${r.corpo.comAviso} empresa(s) com aviso; ${r.corpo.entregues} aviso(s) entregue(s) no celular${r.corpo.falhasFiscal ? `; ${r.corpo.falhasFiscal} sem resposta do Fiscal (tenta de novo sozinho)` : ""}.` } : { sucesso: false, mensagem: erroApi(r).erro }; },
  },
];
