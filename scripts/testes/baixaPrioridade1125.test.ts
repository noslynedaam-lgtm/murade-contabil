// Pendências de baixa prioridade (25/11/2026): ler documento → pré-lançamento; Fisco IA → Contábil; comparação de regimes e pago a maior.
// Valores conferidos à mão (comentários ao lado de cada conta).
import assert from "node:assert/strict";
import test from "node:test";
import { normalizarLeituraDocumento, sugerirLancamentoDocumento, valorLidoParaCentavos, formaDePagamento, conferirConfirmacaoDocumento, validarArquivosDocumento, juntarLeituras } from "../../src/utils/leituraDocumentoContabil";
import { conferirDocumentosDaEmpresa, lerDocumentoComIA, type DocumentoLido } from "../../src/server/documentosLidosContabil";
import { dataDaApuracao, gerarRascunhosApuracoes, mesclarRascunhosNoWorkspace, motivoDuplicadoFiscoIa } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";
import { ORIGEM_POR_TRIBUTO, origemDaReferencia } from "../../src/utils/origensContabeis";
import { conferirItensFiscoIa, resumoConferidorFiscoIa } from "../../src/server/conferidorFiscoIa";
import { compararRegimes, janela12Meses, pagoAMaior, type ApuracaoComparacao } from "../../src/utils/comparacaoRegimes";
import { resumoPagoAMaior } from "../../src/server/comparacaoRegimesServidor";
import type { ContaPlano, LancamentoContabil } from "../../src/types";

const contas: ContaPlano[] = [
  { codigo: "1.1.1.01", descricao: "Caixa Geral", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "1.1.2.01", descricao: "Banco Sicoob conta movimento", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "3.2.1.05", descricao: "Energia elétrica", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "3.2.1.07", descricao: "Aluguel", nivel: 4, tipo: "analitica", natureza: "D" },
  { codigo: "3.2", descricao: "Despesas", nivel: 2, tipo: "sintetica", natureza: "D" },
];
const lanc = (id: string, data: string, d: string, c: string, valor: number, historico: string, extra: Partial<LancamentoContabil> = {}): LancamentoContabil =>
  ({ id, data, contaDebitoCodigo: d, contaDebitoNome: d, contaCreditoCodigo: c, contaCreditoNome: c, valor, historico, origem: "Manual", ...extra });
const leituraBase = (over: Record<string, unknown> = {}) => normalizarLeituraDocumento({ tipoDocumento: "Comprovante de PIX", campos: { dataPagamento: "2026-11-10", valorPago: "1.234,56", favorecido: "Equatorial Energia Goiás", cnpjCpfFavorecido: "01.543.032/0001-04", descricao: "Conta de energia 10/2026", formaPagamento: "pix", ...over } }, "2026-11-25");

test("leitura: valor, data, CNPJ e forma conferidos; o que não dá para confiar fica em branco", () => {
  assert.equal(valorLidoParaCentavos("1.234,56"), 123456);
  assert.equal(valorLidoParaCentavos("R$ 89,90"), 8990);
  assert.equal(valorLidoParaCentavos("1,234.56"), 123456);
  assert.equal(valorLidoParaCentavos(150.1), 15010);
  assert.equal(valorLidoParaCentavos("12.34.5"), null);
  assert.equal(valorLidoParaCentavos("0,00"), null);
  assert.equal(formaDePagamento("Cartão de Débito"), "cartao_debito");
  assert.equal(formaDePagamento("PIX"), "pix");
  assert.equal(formaDePagamento("débito automático"), "debito_automatico");
  const l = leituraBase();
  assert.equal(l.data, "2026-11-10"); assert.equal(l.valorCentavos, 123456); assert.equal(l.formaPagamento, "pix"); assert.equal(l.emBranco.length, 0);
  // CNPJ com dígito errado: em branco com aviso (não inventa)
  const errado = leituraBase({ cnpjCpfFavorecido: "01.543.032/0001-05" });
  assert.equal(errado.documentoFavorecido, null); assert.match(errado.avisos.join(" "), /dígito verificador/);
  // data no futuro e data impossível
  assert.equal(leituraBase({ dataPagamento: "2026-12-01" }).data, null);
  assert.equal(leituraBase({ dataPagamento: "2026-02-30" }).data, null);
  // sem data de pagamento: usa a emissão com aviso
  const emissao = leituraBase({ dataPagamento: null, dataEmissao: "2026-11-03" });
  assert.equal(emissao.data, "2026-11-03"); assert.match(emissao.avisos.join(" "), /emissão/);
  // valores diferentes no mesmo documento: valor em branco
  const dois = leituraBase({ valorOutrasLeituras: ["1.200,00"] });
  assert.equal(dois.valorCentavos, null); assert.ok(dois.emBranco.includes("Valor"));
  // mesmo valor repetido não atrapalha
  assert.equal(leituraBase({ valorOutrasLeituras: ["1.234,56"] }).valorCentavos, 123456);
});

test("páginas do mesmo documento: valores diferentes viram 'outras leituras' e o valor fica em branco", async () => {
  const j = juntarLeituras([{ tipoDocumento: "Boleto pago", campos: { valorPago: "500,00", favorecido: "Imobiliária X" } }, { campos: { valorPago: "520,00", dataPagamento: "2026-11-05" } }]);
  const l = normalizarLeituraDocumento(j, "2026-11-25");
  assert.equal(l.valorCentavos, null); assert.equal(l.favorecido, "Imobiliária X"); assert.equal(l.data, "2026-11-05");
  // IA de mentira: uma página falha, a outra lê
  const ia = async (_i: string, a: { dadosBase64: string }) => (a.dadosBase64 === "QQ==" ? "isto não é json" : JSON.stringify({ tipoDocumento: "Recibo", campos: { valorPago: "80,00", dataPagamento: "2026-11-20", favorecido: "João" } }));
  const r = await lerDocumentoComIA(ia, [{ mimeType: "image/jpeg", dadosBase64: "QQ==" }, { mimeType: "image/png", dadosBase64: "Qg==" }], "2026-11-25");
  assert.equal(r.valorCentavos, 8000); assert.equal(r.data, "2026-11-20");
  await assert.rejects(lerDocumentoComIA(async () => "nada", [{ mimeType: "image/jpeg", dadosBase64: "QQ==" }]), /leitura válida/);
  assert.equal(validarArquivosDocumento([{ mimeType: "text/plain", dadosBase64: "QQ==" }]).ok, false);
  assert.equal(validarArquivosDocumento([{ mimeType: "application/pdf", dadosBase64: "QQ==" }]).ok, true);
});

test("sugestão: regra da conciliação, banco pelo extrato, histórico padrão e bloqueio de duplicidade", () => {
  const leitura = leituraBase();
  const regras = [{ id: "r1", contem: "EQUATORIAL", contaCodigo: "3.2.1.05", sentido: "saida" as const, ativo: true }];
  const hp = [{ id: "h1", codigo: "ENERG", texto: "Pagamento de energia elétrica" }];
  // extrato com a saída pendente: crédito = banco, e aviso para o robô casar depois
  const pend = sugerirLancamentoDocumento({ leitura, contas, lancamentos: [], regras, historicosPadrao: hp, jaLancados: [], hash: "h",
    movimentosExtrato: [{ fitid: "F1", contaBanco: "1.1.2.01", dataISO: "2026-11-11", valorCentavos: -123456, memo: "PIX EQUATORIAL", situacao: "pendente", lancamentoId: null }] });
  assert.equal(pend.contaDebito?.codigo, "3.2.1.05"); assert.equal(pend.contaCredito?.codigo, "1.1.2.01");
  assert.ok(pend.extratoPendente); assert.equal(pend.bloqueios.length, 0);
  assert.match(pend.historico, /^Pagamento de energia elétrica — Equatorial/);
  // extrato já conciliado: não deixa lançar de novo
  const conc = sugerirLancamentoDocumento({ leitura, contas, lancamentos: [], regras, historicosPadrao: [], jaLancados: [], hash: "h",
    movimentosExtrato: [{ fitid: "F1", contaBanco: "1.1.2.01", dataISO: "2026-11-12", valorCentavos: -123456, memo: "PIX", situacao: "conciliado", lancamentoId: "lan-9" }] });
  assert.equal(conc.bloqueios.length, 1); assert.match(conc.bloqueios[0], /lan-9/);
  // fora de 3 dias não casa
  const longe = sugerirLancamentoDocumento({ leitura, contas, lancamentos: [], regras: [], historicosPadrao: [], jaLancados: [], hash: "h",
    movimentosExtrato: [{ fitid: "F1", contaBanco: "1.1.2.01", dataISO: "2026-11-20", valorCentavos: -123456, memo: "PIX", situacao: "conciliado", lancamentoId: "lan-9" }] });
  assert.equal(longe.bloqueios.length, 0);
  // sem extrato: PIX → o único banco do plano; débito pelo que a empresa já lançou para o favorecido
  const hist = sugerirLancamentoDocumento({ leitura, contas, regras: [], historicosPadrao: [], jaLancados: [], hash: "h", movimentosExtrato: [],
    lancamentos: [lanc("l1", "2026-09-10", "3.2.1.05", "1.1.2.01", 900, "Energia Equatorial setembro")] });
  assert.equal(hist.contaCredito?.codigo, "1.1.2.01"); assert.equal(hist.contaDebito?.codigo, "3.2.1.05");
  // dinheiro → caixa
  const din = sugerirLancamentoDocumento({ leitura: { ...leitura, formaPagamento: "dinheiro" }, contas, lancamentos: [], regras: [], historicosPadrao: [], jaLancados: [], hash: "h", movimentosExtrato: [] });
  assert.equal(din.contaCredito?.codigo, "1.1.1.01"); assert.equal(din.contaDebito, null);
  // mesmo arquivo já lançado: bloqueia
  const rep = sugerirLancamentoDocumento({ leitura, contas, lancamentos: [], regras: [], historicosPadrao: [], movimentosExtrato: [], hash: "abc", jaLancados: [{ id: "doc-1", hash: "abc", lancamentoId: "lan-doc-1", criadoEm: "2026-11-11T10:00:00.000Z" }] });
  assert.match(rep.bloqueios[0], /mesmo arquivo/);
  // lançamento parecido (mesmo valor, 2 dias, favorecido no histórico): pede confirmação
  const par = sugerirLancamentoDocumento({ leitura, contas, regras: [], historicosPadrao: [], jaLancados: [], hash: "h", movimentosExtrato: [],
    lancamentos: [lanc("l2", "2026-11-12", "3.2.1.05", "1.1.2.01", 1234.56, "Equatorial outubro")] });
  assert.equal(par.parecidos.length, 1);
  // confirmação
  assert.equal(conferirConfirmacaoDocumento({ data: "2026-11-10", valorCentavos: 123456, contaDebito: "3.2.1.05", contaCredito: "1.1.2.01", historico: "x" }, contas), null);
  assert.match(String(conferirConfirmacaoDocumento({ data: "2026-11-10", valorCentavos: 123456, contaDebito: "3.2", contaCredito: "1.1.2.01", historico: "x" }, contas)), /débito/);
  assert.match(String(conferirConfirmacaoDocumento({ data: "", valorCentavos: 1, contaDebito: "3.2.1.05", contaCredito: "1.1.2.01", historico: "x" }, contas)), /data/);
});

test("conferidor dos documentos lidos: parado, sumido, rejeitado e duplicidade", () => {
  const doc = (id: string, situacao: DocumentoLido["situacao"], hash: string, lancamentoId: string | null, criadoEm = "2026-11-24T10:00:00.000Z"): DocumentoLido =>
    ({ id, cnpj: "11497078000180", hash, situacao, nomeArquivo: null, leitura: leituraBase(), sugestao: { contaDebito: null, contaCredito: null, historico: "", bloqueios: [], parecidos: [], extratoPendente: null }, lancamentoId, criadoPor: null, criadoEm, atualizadoEm: criadoEm });
  const agora = new Date("2026-11-25T12:00:00Z");
  assert.deepEqual(conferirDocumentosDaEmpresa("X", [doc("d1", "lido", "a", null)], [], agora), []);
  const achados = conferirDocumentosDaEmpresa("X", [
    doc("d0", "lido", "z", null, "2026-11-20T10:00:00.000Z"),
    doc("d1", "lancado", "a", "lan-1"), doc("d2", "lancado", "a", "lan-2"), doc("d3", "lancado", "b", "lan-x"),
  ], [
    lanc("lan-1", "2026-11-10", "3.2.1.05", "1.1.2.01", 1234.56, "Energia", { statusManual: "pendente_aprovacao" }),
    lanc("lan-2", "2026-11-10", "3.2.1.05", "1.1.2.01", 1234.56, "Energia", { statusManual: "pendente_aprovacao" }),
  ], agora);
  const t = achados.map((a) => a.texto).join(" | ");
  assert.match(t, /há mais de 3 dias/); assert.match(t, /não existe mais/); assert.match(t, /Possível duplicidade/); assert.match(t, /lançado 2 vezes/);
});

// ------------------------------------------------------------------ Fisco IA → Contábil
const cnpj = "11497078000180"; const agora = "2026-11-25T12:00:00.000Z";
const ap = (tributo: string, competencia: string, referencia: string, valorCentavos: number, versaoOrigem: string, baseCentavos: number | null = null): ApuracaoFiscalArmazenada =>
  ({ cnpj, tributo, competencia, referencia, valorCentavos, baseCentavos, situacao: "confirmado", versaoOrigem, recebidoEm: agora, atualizadoEm: agora });
const contasFia = ["2.1.5", "2.1.9", "2.1.8", "1.1.1", "3.4.1", "3.4.2"].map((codigo) => ({ codigo, tipo: "analitica" }));
const mapsFia = [
  { origem: "fiscoia_debito", contaDebitoCodigo: "3.4.2", contaCreditoCodigo: "2.1.5" },
  { origem: "fiscoia_multa_juros", contaDebitoCodigo: "3.4.1", contaCreditoCodigo: "2.1.5" },
  { origem: "fiscoia_divida_ativa", contaDebitoCodigo: "3.4.2", contaCreditoCodigo: "2.1.8" },
  { origem: "fiscoia_parc_consolidacao", contaDebitoCodigo: "2.1.5", contaCreditoCodigo: "2.1.9" },
  { origem: "fiscoia_parc_parcela", contaDebitoCodigo: "2.1.9", contaCreditoCodigo: "1.1.1" },
];

test("Fisco IA: itens viram pré-lançamento na data certa, sem duplicar o que o Fiscal já mandou", () => {
  assert.equal(ORIGEM_POR_TRIBUTO.FIA_PARC_CONSOLIDACAO, "fiscoia_parc_consolidacao");
  const itens = [
    ap("FIA_DEBITO", "2026-09", "FIA:DAS-MEI:2026-09", 8_160, "data:2026-09-30:8160"),
    ap("FIA_MULTA_JUROS", "2026-11", "FIA:DAS-MEI:2026-09:ENC", 412, "data:2026-11-20:412"),
    ap("FIA_PARC_CONSOLIDACAO", "2026-08", "FIA:PARC:PARCSN:123:consolidacao", 1_200_000, "data:2026-08-14:1200000"),
    ap("FIA_PARC_PARCELA_PAGA", "2026-10", "FIA:PARC:PARCSN:123:pago:2026-10", 20_350, "data:2026-10-30:20350"),
    ap("FIA_DIVIDA_ATIVA", "2026-09", "FIA:DA:MEI:2026-09:INSS", 7_500, "data:2026-11-20:7500"),
  ];
  const r = gerarRascunhosApuracoes(cnpj, itens, contasFia, mapsFia, agora);
  // dívida ativa do mesmo mês da guia provisionada não entra; os outros 4 entram
  assert.equal(r.length, 4);
  const por = (t: string) => r.find((x) => x.referenciaOrigem.includes(`:APURACAO:${t}:`))!;
  assert.equal(por("FIA_DEBITO").data, "2026-09-30"); assert.equal(por("FIA_DEBITO").valor, 81.6);
  assert.equal(por("FIA_MULTA_JUROS").data, "2026-11-20"); assert.equal(por("FIA_MULTA_JUROS").valor, 4.12);
  assert.equal(por("FIA_PARC_CONSOLIDACAO").data, "2026-08-14"); assert.equal(por("FIA_PARC_CONSOLIDACAO").contaCreditoCodigo, "2.1.9");
  assert.equal(por("FIA_PARC_PARCELA_PAGA").valor, 203.5);
  assert.equal(origemDaReferencia(por("FIA_PARC_PARCELA_PAGA").referenciaOrigem)?.id, "fiscoia_parc_parcela");
  // data fora do mês da competência: provisão no último dia do mês
  assert.equal(dataDaApuracao({ tributo: "FIA_DEBITO", competencia: "2026-02", versaoOrigem: "data:2026-03-01:1" }), "2026-02-28");
  // o Fiscal já mandou o mesmo parcelamento (mesmo mês e valor) e a mesma parcela (mesma data e valor): não entram
  const fiscal = [ap("PARCELAMENTO_ADESAO", "2026-08", "PARC:p1:adesao", 1_200_000, "adesao:2026-08-14:1200000"), ap("PARCELAMENTO_PARCELA_PAGA", "2026-10", "PARC:p1:parcela:1", 20_350, "pago:2026-10-30:20350", 20_000)];
  const r2 = gerarRascunhosApuracoes(cnpj, [...itens, ...fiscal], contasFia, mapsFia, agora).filter((x) => /APURACAO:FIA_/.test(x.referenciaOrigem));
  assert.equal(r2.length, 2);
  assert.match(String(motivoDuplicadoFiscoIa(itens[2], [...itens, ...fiscal])), /parcelamento/);
  // valor diferente do Fiscal: entra, com aviso no histórico
  const fiscalOutro = [ap("PARCELAMENTO_ADESAO", "2026-08", "PARC:p2:adesao", 1_100_000, "adesao:2026-08-02:1100000")];
  const r3 = gerarRascunhosApuracoes(cnpj, [...itens, ...fiscalOutro], contasFia, mapsFia, agora).find((x) => x.referenciaOrigem.includes("FIA_PARC_CONSOLIDACAO"))!;
  assert.match(r3.historico, /confira se não é o mesmo/);
  // guia do mesmo período emitida de novo no mês seguinte: só a multa e os juros mais novos entram
  const nova = ap("FIA_MULTA_JUROS", "2026-12", "FIA:DAS-MEI:2026-09:ENC", 530, "data:2026-12-05:530");
  assert.match(String(motivoDuplicadoFiscoIa(itens[1], [...itens, nova])), /mais nova/);
  assert.equal(motivoDuplicadoFiscoIa(nova, [...itens, nova]), null);
  // mesclar duas vezes não duplica
  const m1 = mesclarRascunhosNoWorkspace(cnpj, { mapeamentosOrigem: mapsFia, contas: contasFia, lancamentos: [], preLancamentos: [] }, r);
  assert.equal(m1.criados, 4);
  assert.equal(mesclarRascunhosNoWorkspace(cnpj, m1.workspace, r).criados, 0);
  // conferidor: situação de cada item
  const conf = conferirItensFiscoIa(cnpj, itens, { ...m1.workspace, mapeamentosOrigem: mapsFia });
  assert.equal(conf.filter((i) => i.situacao === "pre_lancamento").length, 4);
  assert.equal(conf.filter((i) => i.situacao === "duplicado_do_fiscal").length, 1);
  const semMapa = conferirItensFiscoIa(cnpj, itens, { mapeamentosOrigem: [], preLancamentos: [], lancamentos: [] });
  assert.equal(semMapa.filter((i) => i.situacao === "aguardando_mapeamento").length, 4);
  assert.match(resumoConferidorFiscoIa({ empresas: 1, itens: semMapa }), /^ATENÇÃO: .*4 esperando o mapeamento/);
});

// ------------------------------------------------------------------ comparação de regimes e pago a maior
test("janela de 12 meses completos", () => {
  const j = janela12Meses("2026-11-25");
  assert.equal(j[0], "2025-11"); assert.equal(j[11], "2026-10"); assert.equal(j.length, 12);
  assert.equal(janela12Meses("2026-01-10")[11], "2025-12");
});

test("estimativa do Presumido e do Real conferida à mão (comércio, R$ 100.000/mês, folha R$ 20.000/mês)", () => {
  const meses = janela12Meses("2026-11-25").map((competencia) => ({ competencia, receitaBrutaCentavos: 10_000_000, resultadoCentavos: 2_500_000, irpjCentavos: 0, csllCentavos: 0 }));
  const apuracoes: ApuracaoComparacao[] = [
    { tributo: "PIS_PRESUMIDO", competencia: "2026-05", referencia: "x", valorCentavos: 780_000, baseCentavos: null, versaoOrigem: "v" },
    { tributo: "COFINS_PRESUMIDO", competencia: "2026-05", referencia: "y", valorCentavos: 3_600_000, baseCentavos: null, versaoOrigem: "v" },
  ];
  const r = compararRegimes({ hoje: "2026-11-25", regimeAtual: "Lucro Presumido", meses, folhaCentavos: 24_000_000, atividade: "comercio", apuracoes });
  assert.equal(r.receita12Centavos, 120_000_000);
  const pres = r.estimativas.find((e) => e.regime === "Lucro Presumido")!;
  const v = (e: typeof pres, ini: string) => e.linhas.find((l) => l.nome.startsWith(ini))!.centavos;
  // IRPJ: 8% × 1.200.000 = 96.000 × 15% = 14.400 (sem adicional: base por trimestre abaixo de R$ 20.000/mês)
  assert.equal(v(pres, "IRPJ"), 1_440_000);
  // CSLL: 12% × 1.200.000 = 144.000 × 9% = 12.960
  assert.equal(v(pres, "CSLL"), 1_296_000);
  assert.equal(v(pres, "PIS"), 780_000);      // 0,65% × 1.200.000 = 7.800
  assert.equal(v(pres, "COFINS"), 3_600_000); // 3% × 1.200.000 = 36.000
  assert.equal(v(pres, "CPP"), 4_800_000);    // 20% × 240.000 = 48.000
  assert.equal(pres.totalCentavos, 11_916_000); // 119.160,00
  assert.ok(pres.atual);
  const real = r.estimativas.find((e) => e.regime === "Lucro Real")!;
  // lucro = 300.000 + 43.800 (PIS/COFINS cumulativos devolvidos) − 19.800 (PIS 1,65%) − 91.200 (COFINS 7,6%) = 232.800
  assert.equal(v(real, "PIS"), 1_980_000); assert.equal(v(real, "COFINS"), 9_120_000);
  assert.equal(v(real, "IRPJ"), 3_492_000); // 15% × 232.800 = 34.920 (abaixo de R$ 240.000/ano: sem adicional)
  assert.equal(v(real, "CSLL"), 2_095_200); // 9% × 232.800 = 20.952
  assert.equal(real.totalCentavos, 21_487_200); // 214.872,00
  const simples = r.estimativas.find((e) => e.regime === "Simples Nacional")!;
  assert.equal(simples.totalCentavos, null); assert.equal(simples.podeOptar, true); assert.match(simples.observacoes[0], /Tabela Tributária/);
  assert.equal(r.atualApuradoPago.length, 2);
  // sem atividade: o Presumido pede a escolha
  assert.equal(compararRegimes({ hoje: "2026-11-25", regimeAtual: "Lucro Presumido", meses, folhaCentavos: null, atividade: null, apuracoes: [] }).estimativas[1].totalCentavos, null);
});

test("adicional do IRPJ do Presumido por trimestre, proporcional aos meses da janela (serviços, R$ 300.000/mês)", () => {
  const meses = janela12Meses("2026-11-25").map((competencia) => ({ competencia, receitaBrutaCentavos: 30_000_000, resultadoCentavos: 0, irpjCentavos: 0, csllCentavos: 0 }));
  const r = compararRegimes({ hoje: "2026-11-25", regimeAtual: "Simples Nacional", meses, folhaCentavos: null, atividade: "servicos", apuracoes: [] });
  const irpj = r.estimativas[1].linhas[0].centavos;
  // base 32% × 300.000 = 96.000/mês. Trimestre cheio: base 288.000 → 15% 43.200 + 10% × (288.000 − 60.000) 22.800 = 66.000 (× 3 trimestres = 198.000)
  // 2025-T4 (2 meses): base 192.000 → 28.800 + 10% × (192.000 − 40.000) 15.200 = 44.000; 2026-T4 (1 mês): 96.000 → 14.400 + 7.600 = 22.000
  assert.equal(irpj, 26_400_000); // 198.000 + 44.000 + 22.000 = 264.000,00
  assert.equal(r.estimativas[0].atual, true);
  // Simples acima de R$ 4,8 milhões não pode
  const grande = janela12Meses("2026-11-25").map((competencia) => ({ competencia, receitaBrutaCentavos: 50_000_000, resultadoCentavos: 0, irpjCentavos: 0, csllCentavos: 0 }));
  assert.equal(compararRegimes({ hoje: "2026-11-25", regimeAtual: "Lucro Presumido", meses: grande, folhaCentavos: null, atividade: "servicos", apuracoes: [] }).estimativas[0].podeOptar, false);
});

test("pago a maior: DAS pago duas vezes, DARF em duplicidade e DARF acima da guia (a conferir)", () => {
  const a = (tributo: string, competencia: string, referencia: string, valorCentavos: number, baseCentavos: number | null, versaoOrigem: string): ApuracaoComparacao => ({ tributo, competencia, referencia, valorCentavos, baseCentavos, versaoOrigem });
  const lista = pagoAMaior([
    a("DAS_SIMPLES", "2026-03", "DAS:apuracao:2026-03", 100_000, null, "decl:1"),
    a("DAS_SIMPLES_PAGO", "2026-04", "DAS:pagamento:2026-03", 100_000, 100_000, "pago:2026-04-20:100000"),
    a("DAS_SIMPLES_PAGO", "2026-05", "DAS:pagamento:2026-03", 100_000, 100_000, "pago:2026-05-10:100000"),
    a("DAS_SIMPLES", "2026-04", "DAS:apuracao:2026-04", 50_000, null, "decl:2"),
    a("DAS_SIMPLES_PAGO", "2026-05", "DAS:pagamento:2026-04", 50_000, 50_000, "pago:2026-05-20:50000"),
    a("PIS_PRESUMIDO_PAGO", "2026-06", "DARF:pagamento:pis:2026-05", 78_000, 78_000, "pago:2026-06-25:78000"),
    a("PIS_PRESUMIDO_PAGO", "2026-07", "DARF:pagamento:pis:2026-05", 79_000, 78_000, "pago:2026-07-02:79000"),
    a("COFINS_PRESUMIDO_PAGO", "2026-06", "DARF:pagamento:cofins:2026-05", 361_000, 360_000, "pago:2026-06-25:361000"),
  ], "2026-11-25");
  const das = lista.find((x) => x.tipo === "DAS")!;
  assert.equal(das.aMaiorCentavos, 100_000); assert.equal(das.aConferir, false); assert.deepEqual(das.pagoEm, ["2026-04-20", "2026-05-10"]);
  assert.equal(lista.filter((x) => x.tipo === "DAS").length, 1); // abril pago certo
  const dup = lista.find((x) => x.tipo === "DARF" && !x.aConferir)!;
  assert.equal(dup.aMaiorCentavos, 79_000); assert.match(dup.orientacao, /PER\/DCOMP/);
  const conf = lista.find((x) => x.tipo === "DARF" && x.aConferir)!;
  assert.equal(conf.aMaiorCentavos, 1_000);
  const r = compararRegimes({ hoje: "2026-11-25", regimeAtual: "Simples", meses: [], folhaCentavos: null, atividade: null, apuracoes: [
    a("DAS_SIMPLES", "2026-03", "DAS:apuracao:2026-03", 100_000, null, "decl:1"),
    a("DAS_SIMPLES_PAGO", "2026-04", "DAS:pagamento:2026-03", 100_000, 100_000, "pago:2026-04-20:100000"),
    a("DAS_SIMPLES_PAGO", "2026-05", "DAS:pagamento:2026-03", 100_000, 100_000, "pago:2026-05-10:100000"),
  ] });
  assert.equal(r.totalAMaiorCentavos, 100_000);
  assert.equal(r.estimativas[0].totalCentavos, 100_000); // Simples atual: DAS apurado
  // pagamento sem o principal e acima do apurado: a conferir (pode ser multa e juros), fora do total
  const semBase = pagoAMaior([a("DAS_SIMPLES", "2026-03", "DAS:apuracao:2026-03", 100_000, null, "d"), a("DAS_SIMPLES_PAGO", "2026-05", "DAS:pagamento:2026-03", 103_000, null, "pago:2026-05-10:103000")], "2026-11-25");
  assert.equal(semBase[0].aConferir, true);
  // mais de 5 anos: fora do prazo
  assert.equal(pagoAMaior([a("DAS_SIMPLES", "2020-03", "DAS:apuracao:2020-03", 100, null, "d"), a("DAS_SIMPLES_PAGO", "2020-04", "DAS:pagamento:2020-03", 100, 100, "pago:2020-04-20:100"), a("DAS_SIMPLES_PAGO", "2020-05", "DAS:pagamento:2020-03", 100, 100, "pago:2020-05-20:100")], "2026-11-25")[0].foraDoPrazo, true);
  assert.match(resumoPagoAMaior({ empresas: 1, achados: lista.map((x) => ({ ...x, cnpj })) }), /^ATENÇÃO: 2 recolhimento\(s\) a maior \(R\$\s1\.790,00\)/);
});
