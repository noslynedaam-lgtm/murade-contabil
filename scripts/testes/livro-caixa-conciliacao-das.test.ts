// Itens 2, 5 e 6 do levantamento de 20/11/2026: Livro Caixa do Simples, extrato bancário (CSV/Excel, regras, sugestões)
// e DAS do Simples recebido do Fiscal como pré-lançamento (provisão e pagamento).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gerarLivroCaixa, situacaoLivroCaixaDoMes, termosLivroCaixa, competenciasEntre, idLivroCaixa } from "../../src/utils/livroCaixa";
import { lerCSVExtrato, lerHtmlExtrato, lerXlsxExtrato, valorDaCelula, regraQueSeAplica, sugerirParaPendentes, lancamentoCasaComMovimento, validarRegraConciliacao } from "../../src/utils/extratoBancario";
import { validarMovimentosRecebidos, ErroExtrato } from "../../src/server/extratoBancarioStore";
import { origemDaReferencia, ORIGEM_POR_TRIBUTO } from "../../src/utils/origensContabeis";
import { gerarRascunhosApuracoes, dataDaApuracao, partesDoPagamentoDas } from "../../src/server/prepararRascunhosContabeis";
import { workspaceValido } from "../../src/server/authContabil";
import type { ContaPlano, LancamentoContabil } from "../../src/types";

const contas: ContaPlano[] = [
  { codigo: "1.1.01", descricao: "Caixa", nivel: 2, tipo: "analitica", natureza: "D", saldoInicial: 500, saldoInicialCompetencia: "2026-01" },
  { codigo: "1.1.02", descricao: "Banco Itaú", nivel: 2, tipo: "analitica", natureza: "D", saldoInicial: 1000.1, saldoInicialCompetencia: "2026-01" },
  { codigo: "2.1.08", descricao: "Simples Nacional a recolher", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "3.1.01", descricao: "Receita de vendas", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "3.2.01", descricao: "Simples Nacional sobre faturamento", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.1.01", descricao: "Despesas bancárias", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.1.02", descricao: "Multas e juros", nivel: 2, tipo: "analitica", natureza: "D" },
];
const lcto = (id: string, data: string, d: string, c: string, valor: number, extra: Partial<LancamentoContabil> = {}): LancamentoContabil => ({
  id, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico: `h ${id}`, origem: "Manual", documentoRef: id, statusManual: "aprovado", ...extra,
});
const lancs = [lcto("a", "2026-01-10", "1.1.01", "3.1.01", 300), lcto("b", "2026-02-05", "4.1.01", "1.1.02", 12.35), lcto("c", "2026-02-20", "1.1.02", "3.1.01", 99.99)];

// ------------------------------------------------------------------ Livro Caixa
test("Livro Caixa: saldo levado de um mês para o outro, centavo a centavo, com as contas marcadas", () => {
  const l = gerarLivroCaixa({ contas, lancamentos: lancs, codigosCaixa: ["1.1.01", "1.1.02"], de: "2026-01", ate: "2026-03" });
  assert.equal(l.disponivel, true, l.motivo);
  assert.deepEqual(l.meses.map((m) => [m.competencia, m.saldoInicialCentavos, m.entradasCentavos, m.saidasCentavos, m.saldoFinalCentavos]), [
    ["2026-01", 150010, 30000, 0, 180010], ["2026-02", 180010, 9999, 1235, 188774], ["2026-03", 188774, 0, 0, 188774],
  ]);
  assert.deepEqual([l.saldoInicialCentavos, l.entradasCentavos, l.saidasCentavos, l.saldoFinalCentavos], [150010, 39999, 1235, 188774]);
  const t = termosLivroCaixa({ razaoSocial: "Loja X", cnpj: "11.222.333/0001-81", municipio: "Goiânia", uf: "GO", responsavelNome: "Fulano", contadorNome: "Beltrana", contadorCrc: "GO-1" }, l);
  assert.match(t.abertura, /TERMO DE ABERTURA.*Loja X.*Goiânia\/GO.*01\/2026 a 03\/2026.*art\. 63, inciso I e § 7º/);
  assert.match(t.encerramento, /saldo final de R\$\s?1\.887,74/);
  assert.match(t.assinaturas[1], /Beltrana — CRC GO-1/);
  assert.equal(gerarLivroCaixa({ contas, lancamentos: lancs, codigosCaixa: [], de: "2026-01", ate: "2026-01" }).disponivel, false);
  assert.equal(gerarLivroCaixa({ contas, lancamentos: lancs, codigosCaixa: ["1.1.01"], de: "2026-03", ate: "2026-01" }).disponivel, false);
  assert.deepEqual(competenciasEntre("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});
test("conferidor do Livro Caixa (Simples): Diário/Razão dispensa, emitido, pode emitir sem movimento, pendente e não se aplica", () => {
  const empresa = { regime: "Simples Nacional", contasDisponibilidadesCodigo: ["1.1.01", "1.1.02"] };
  assert.equal(situacaoLivroCaixaDoMes({ empresa, contas, lancamentos: lancs }, "2026-02").situacao, "dispensado");
  const s = situacaoLivroCaixaDoMes({ empresa, contas, lancamentos: lancs }, "2026-03");
  assert.equal(s.situacao, "pode_emitir");
  if (s.situacao === "pode_emitir") assert.deepEqual([s.registro.id, s.registro.competencia, s.registro.status], [idLivroCaixa("2026-03"), "2026-03", "pronto"]);
  assert.equal(situacaoLivroCaixaDoMes({ empresa, contas, lancamentos: lancs, livros: [{ id: "livro-caixa-2026-03" }] }, "2026-03").situacao, "emitido");
  const pend = situacaoLivroCaixaDoMes({ empresa: { regime: "Simples Nacional" }, contas, lancamentos: lancs }, "2026-03");
  assert.equal(pend.situacao, "pendente"); assert.match(pend.detalhe, /sem Diário\/Razão e sem Livro Caixa/);
  assert.equal(situacaoLivroCaixaDoMes({ empresa: { regime: "Lucro Presumido" }, contas, lancamentos: lancs }, "2026-03").situacao, "nao_se_aplica");
  assert.equal(situacaoLivroCaixaDoMes({ empresa: { ...empresa, simplesAporteCapital: true }, contas, lancamentos: lancs }, "2026-03").situacao, "nao_se_aplica");
  assert.equal(situacaoLivroCaixaDoMes({ empresa: { regime: "MEI" }, contas, lancamentos: [] }, "2026-03").situacao, "nao_se_aplica");
});
test("Livros: o fluxo de caixa interno da tela passou a usar o mesmo cálculo do Livro Caixa", () => {
  const t = readFileSync("src/components/tabs/LivrosTab.tsx", "utf8");
  assert.match(t, /calcularFluxoCaixaInterno\(contasDisponibilidades, relatorios\.validos, periodo\)/);
});

// ------------------------------------------------------------------ extrato CSV/Excel e regras
test("valores de extrato: formatos de banco brasileiros", () => {
  assert.equal(valorDaCelula("1.234,56"), 123456);
  assert.equal(valorDaCelula("-1.234,56"), -123456);
  assert.equal(valorDaCelula("1.234,56 D"), -123456);
  assert.equal(valorDaCelula("1.234,56 C"), 123456);
  assert.equal(valorDaCelula("1.234,56-"), -123456);
  assert.equal(valorDaCelula("(50,00)"), -5000);
  assert.equal(valorDaCelula("R$ 10,05"), 1005);
  assert.equal(valorDaCelula("1,234.56"), 123456);
  assert.equal(valorDaCelula("abc"), null);
});
test("CSV com ; (valor único) e com crédito/débito; ignora saldo; identificador estável (reimportar não duplica)", () => {
  const csv = "Extrato conta 123\nData;Histórico;Documento;Valor\n01/02/2026;SALDO ANTERIOR;;1.000,00\n05/02/2026;TARIFA PACOTE;;-12,35\n05/02/2026;TARIFA PACOTE;;-12,35\n20/02/2026;\"PIX RECEBIDO; CLIENTE\";123;99,99\n";
  const a = lerCSVExtrato(csv), b = lerCSVExtrato(csv);
  assert.deepEqual(a.movimentos.map((m) => [m.dataISO, m.valorCentavos, m.memo]), [["2026-02-05", -1235, "TARIFA PACOTE"], ["2026-02-05", -1235, "TARIFA PACOTE"], ["2026-02-20", 9999, "PIX RECEBIDO; CLIENTE"]]);
  assert.notEqual(a.movimentos[0].fitid, a.movimentos[1].fitid, "duas tarifas iguais no mesmo dia continuam sendo duas");
  assert.deepEqual(a.movimentos.map((m) => m.fitid), b.movimentos.map((m) => m.fitid));
  const cd = lerCSVExtrato("Data,Descrição,Crédito,Débito\n2026-03-01,Depósito,500.00,\n2026-03-02,Boleto,,120.50\n");
  assert.deepEqual(cd.movimentos.map((m) => m.valorCentavos), [50000, -12050]);
  assert.match(lerCSVExtrato("a;b\n1;2").erros[0], /cabeçalho/);
});
test("XLSX (strings compartilhadas e número de série de data) e planilha HTML", () => {
  const shared = "<sst><si><t>Data</t></si><si><t>Histórico</t></si><si><t>Valor</t></si><si><t>TED RECEBIDA</t></si></sst>";
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2"><v>46054</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>1500.5</v></c></row></sheetData></worksheet>';
  const x = lerXlsxExtrato(sheet, shared);
  assert.deepEqual(x.movimentos.map((m) => [m.dataISO, m.valorCentavos, m.memo]), [["2026-02-01", 150050, "TED RECEBIDA"]]);
  const h = lerHtmlExtrato("<table><tr><th>Data</th><th>Lançamento</th><th>Valor (R$)</th></tr><tr><td>03/02/2026</td><td>PAG BOLETO &amp; CIA</td><td>-80,00</td></tr></table>");
  assert.deepEqual(h.movimentos.map((m) => [m.valorCentavos, m.memo]), [[-8000, "PAG BOLETO & CIA"]]);
});
test("regras: a mais específica vale, respeita o sentido e só conta analítica; sugestões e conferência do casamento", () => {
  const analiticas = new Set(contas.map((c) => c.codigo));
  const regras = [
    { id: "1", contem: "TARIFA", contaCodigo: "4.1.01", sentido: "saida" as const, ativo: true },
    { id: "2", contem: "TARIFA PIX", contaCodigo: "4.1.02", sentido: "ambos" as const, ativo: true },
    { id: "3", contem: "PIX", contaCodigo: "3.1.01", sentido: "entrada" as const, ativo: true },
    { id: "4", contem: "DESLIGADA", contaCodigo: "3.1.01", sentido: "ambos" as const, ativo: false },
  ];
  assert.equal(regraQueSeAplica({ memo: "Tarifa Pix enviado", valorCentavos: -100 }, regras, "1.1.02", analiticas)?.id, "2");
  assert.equal(regraQueSeAplica({ memo: "TARIFA MENSAL", valorCentavos: -100 }, regras, "1.1.02", analiticas)?.id, "1");
  assert.equal(regraQueSeAplica({ memo: "TARIFA MENSAL", valorCentavos: 100 }, regras, "1.1.02", analiticas), null, "sentido errado");
  assert.equal(regraQueSeAplica({ memo: "desligada", valorCentavos: 1 }, regras, "1.1.02", analiticas), null);
  assert.equal(validarRegraConciliacao(regras[0]), true);
  assert.equal(validarRegraConciliacao({ ...regras[0], contem: "ab" }), false);
  const pend = [
    { fitid: "f1", dataISO: "2026-02-05", valorCentavos: -1235, memo: "TARIFA PACOTE" },
    { fitid: "f2", dataISO: "2026-02-21", valorCentavos: 9999, memo: "PIX RECEBIDO" },
    { fitid: "f3", dataISO: "2026-02-22", valorCentavos: 777, memo: "ALGO NOVO" },
  ];
  const s = sugerirParaPendentes(pend, { lancamentos: lancs, contaBanco: "1.1.02", regras, contasAnaliticas: analiticas, lancamentosJaConciliados: new Set() });
  assert.deepEqual(s.map((x) => [x.fitid, x.lancamentoId || x.contaCodigo]), [["f1", "b"], ["f2", "c"]]);
  assert.match(s[1].motivo, /data próxima/);
  assert.equal(sugerirParaPendentes(pend.slice(0, 1), { lancamentos: lancs, contaBanco: "1.1.02", regras, contasAnaliticas: analiticas, lancamentosJaConciliados: new Set(["b"]) })[0].contaCodigo, "4.1.01", "lançamento já usado não casa de novo; cai na regra");
  assert.equal(lancamentoCasaComMovimento(lancs[1], { valorCentavos: -1235 }, "1.1.02"), true);
  assert.equal(lancamentoCasaComMovimento(lancs[1], { valorCentavos: 1235 }, "1.1.02"), false, "sentido");
  assert.equal(lancamentoCasaComMovimento({ ...lancs[1], statusManual: "pendente_aprovacao" }, { valorCentavos: -1235 }, "1.1.02"), false);
});
test("extrato recebido pelo servidor: lote validado inteiro", () => {
  assert.equal(validarMovimentosRecebidos([{ fitid: "x", dataISO: "2026-02-01", valorCentavos: -5, memo: "a" }]).length, 1);
  assert.throws(() => validarMovimentosRecebidos([]), ErroExtrato);
  assert.throws(() => validarMovimentosRecebidos([{ fitid: "x", dataISO: "2026-02-30", valorCentavos: 1 }]), ErroExtrato);
  assert.throws(() => validarMovimentosRecebidos([{ fitid: "x", dataISO: "2026-02-01", valorCentavos: 1.5 }]), ErroExtrato);
  assert.throws(() => validarMovimentosRecebidos([{ fitid: "x", dataISO: "2026-02-01", valorCentavos: 1 }, { fitid: "x", dataISO: "2026-02-01", valorCentavos: 2 }]), ErroExtrato);
});

// ------------------------------------------------------------------ DAS do Simples vindo do Fiscal
const cnpj = "11222333000181";
const mapa = (origem: string, d: string, c: string) => ({ origem, contaDebitoCodigo: d, contaCreditoCodigo: c, revisadoEm: "2026-11-20T00:00:00Z" });
const mapeamentos = [mapa("fiscal_das_simples", "3.2.01", "2.1.08"), mapa("fiscal_das_simples_pago", "2.1.08", "1.1.02"), mapa("fiscal_das_simples_encargos", "4.1.02", "1.1.02")];
const ap = (x: Record<string, unknown>) => ({ cnpj, situacao: "confirmado", baseCentavos: null, recebidoEm: "", atualizadoEm: "", ...x }) as any;
test("DAS: os dois tributos do contrato do Fiscal são aceitos e têm origem própria", () => {
  const store = readFileSync("src/server/apuracoesFiscaisStore.ts", "utf8");
  assert.match(store, /"DAS_SIMPLES", "DAS_SIMPLES_PAGO"/);
  assert.deepEqual([ORIGEM_POR_TRIBUTO.DAS_SIMPLES, ORIGEM_POR_TRIBUTO.DAS_SIMPLES_PAGO], ["fiscal_das_simples", "fiscal_das_simples_pago"]);
  assert.equal(origemDaReferencia(`FISCAL:${cnpj}:2026-10:APURACAO:DAS_SIMPLES:DAS:apuracao:2026-10`)?.id, "fiscal_das_simples");
  assert.equal(origemDaReferencia(`FISCAL:${cnpj}:2026-11:APURACAO:DAS_SIMPLES_PAGO:DAS:pagamento:2026-10`)?.id, "fiscal_das_simples_pago");
  assert.equal(origemDaReferencia(`FISCAL:${cnpj}:2026-11:APURACAO:DAS_SIMPLES_PAGO:DAS:pagamento:2026-10:ENCARGOS`)?.id, "fiscal_das_simples_encargos");
});
test("DAS: provisão no último dia do período; pagamento na data paga; multa/juros separados quando o Fiscal manda o principal", () => {
  assert.equal(dataDaApuracao({ tributo: "DAS_SIMPLES", competencia: "2026-02", versaoOrigem: "decl:1" }), "2026-02-28");
  assert.equal(dataDaApuracao({ tributo: "DAS_SIMPLES_PAGO", competencia: "2026-11", versaoOrigem: "pago:2026-11-19:123456" }), "2026-11-19");
  assert.equal(dataDaApuracao({ tributo: "DAS_SIMPLES_PAGO", competencia: "2026-11", versaoOrigem: "pago:2026-10-19:1" }), "2026-11-01", "data fora do mês não vale");
  // provisão do Presumido e do PIS/COFINS não cumulativos: último dia do mês (o IRPJ/CSLL vem com a competência do último mês do trimestre)
  assert.equal(dataDaApuracao({ tributo: "PIS_PRESUMIDO", competencia: "2026-11", versaoOrigem: "x" }), "2026-11-30");
  assert.equal(dataDaApuracao({ tributo: "IRPJ_PRESUMIDO", competencia: "2026-09", versaoOrigem: "x" }), "2026-09-30");
  assert.equal(dataDaApuracao({ tributo: "COFINS_NAO_CUMULATIVA", competencia: "2026-02", versaoOrigem: "x" }), "2026-02-28");
  assert.equal(dataDaApuracao({ tributo: "ICMS_DIFAL_CONSUMO", competencia: "2026-11", versaoOrigem: "x" }), "2026-11-01", "DIFAL não muda");
  assert.deepEqual(partesDoPagamentoDas(130000, 123456), [{ parte: "principal", centavos: 123456 }, { parte: "encargos", centavos: 6544 }]);
  assert.deepEqual(partesDoPagamentoDas(123456, null), [{ parte: "principal", centavos: 123456 }]);
  const r = gerarRascunhosApuracoes(cnpj, [
    ap({ tributo: "DAS_SIMPLES", competencia: "2026-10", referencia: "DAS:apuracao:2026-10", valorCentavos: 123456, baseCentavos: 2000000, versaoOrigem: "decl:7" }),
    ap({ tributo: "DAS_SIMPLES_PAGO", competencia: "2026-11", referencia: "DAS:pagamento:2026-10", valorCentavos: 130000, baseCentavos: 123456, versaoOrigem: "pago:2026-11-25:130000" }),
    ap({ tributo: "DAS_SIMPLES", competencia: "2026-09", referencia: "DAS:apuracao:2026-09", valorCentavos: 0, versaoOrigem: "decl:6" }),
  ], contas, mapeamentos, "2026-11-26T00:00:00Z");
  assert.deepEqual(r.map((x) => [x.origem, x.data, x.contaDebitoCodigo, x.contaCreditoCodigo, x.valor]), [
    ["Fiscal — DAS Simples (provisão)", "2026-10-31", "3.2.01", "2.1.08", 1234.56],
    ["Fiscal — DAS Simples (pagamento)", "2026-11-25", "2.1.08", "1.1.02", 1234.56],
    ["Fiscal — DAS Simples (multa e juros)", "2026-11-25", "4.1.02", "1.1.02", 65.44],
  ]);
  // provisão − pagamento zera o "Simples a recolher"
  const recolher = r.reduce((t, x) => t + (x.contaCreditoCodigo === "2.1.08" ? x.valor : 0) - (x.contaDebitoCodigo === "2.1.08" ? x.valor : 0), 0);
  assert.equal(Math.round(recolher * 100), 0);
  // os rascunhos passam na validação do workspace (referência, origem, data dentro da competência)
  const ws = { contas, centrosCusto: [], lancamentos: [], livros: [], lembretes: [], mapeamentosOrigem: mapeamentos, preLancamentos: r.map((x) => ({ ...x, status: "pendente_conferencia", geradoAutomaticamente: true })) };
  assert.equal(workspaceValido(ws), true);
  // com multa/juros e sem conta de encargos mapeada, o pagamento não sai pela metade
  const semEnc = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "DAS_SIMPLES_PAGO", competencia: "2026-11", referencia: "DAS:pagamento:2026-10", valorCentavos: 130000, baseCentavos: 123456, versaoOrigem: "pago:2026-11-25:130000" })], contas, mapeamentos.slice(0, 2), "x");
  assert.equal(semEnc.length, 0);
  // sem o principal: vai o valor pago inteiro, avisando no histórico
  const semBase = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "DAS_SIMPLES_PAGO", competencia: "2026-11", referencia: "DAS:pagamento:2026-10", valorCentavos: 130000, versaoOrigem: "pago:2026-11-25:130000" })], contas, mapeamentos.slice(0, 2), "x");
  assert.deepEqual([semBase.length, semBase[0].valor], [1, 1300]);
  assert.match(semBase[0].historico, /não informou o principal/);
});

test("DARF pago no Fiscal (Presumido e Lucro Real): principal baixa o a recolher na data paga; multa e juros na origem própria", () => {
  for (const [t, o] of [["IRPJ_PRESUMIDO_PAGO", "fiscal_irpj_presumido_pago"], ["CSLL_PRESUMIDO_PAGO", "fiscal_csll_presumido_pago"], ["PIS_PRESUMIDO_PAGO", "fiscal_pis_presumido_pago"], ["COFINS_PRESUMIDO_PAGO", "fiscal_cofins_presumido_pago"], ["PIS_NC_PAGO", "fiscal_pis_nc_pago"], ["COFINS_NC_PAGO", "fiscal_cofins_nc_pago"]]) {
    assert.equal(ORIGEM_POR_TRIBUTO[t], o, t);
    assert.match(readFileSync("src/server/apuracoesFiscaisStore.ts", "utf8"), new RegExp(`"${t}"`));
  }
  assert.equal(origemDaReferencia(`FISCAL:${cnpj}:2026-10:APURACAO:IRPJ_PRESUMIDO_PAGO:DARF:pagamento:x:ENCARGOS`)?.id, "fiscal_darf_encargos");
  assert.equal(dataDaApuracao({ tributo: "PIS_NC_PAGO", competencia: "2026-10", versaoOrigem: "pago:2026-10-23:100" }), "2026-10-23");
  const maps = [mapa("fiscal_irpj_presumido_pago", "2.1.08", "1.1.02"), mapa("fiscal_darf_encargos", "4.1.02", "1.1.02")];
  // IRPJ de R$ 3.600,00 pago com R$ 61,20 de multa e juros (R$ 3.661,20): principal 3.600,00 e encargos 61,20
  const r = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "IRPJ_PRESUMIDO_PAGO", competencia: "2026-11", referencia: "DARF:pagamento:irpj:2026-T3", valorCentavos: 366120, baseCentavos: 360000, versaoOrigem: "pago:2026-11-05:366120" })], contas, maps, "x");
  assert.deepEqual(r.map((x) => [x.data, x.contaDebitoCodigo, x.contaCreditoCodigo, x.valor]), [["2026-11-05", "2.1.08", "1.1.02", 3600], ["2026-11-05", "4.1.02", "1.1.02", 61.2]]);
  // com encargos e sem conta de encargos mapeada: não lança pela metade
  assert.equal(gerarRascunhosApuracoes(cnpj, [ap({ tributo: "IRPJ_PRESUMIDO_PAGO", competencia: "2026-11", referencia: "DARF:pagamento:irpj:2026-T3", valorCentavos: 366120, baseCentavos: 360000, versaoOrigem: "pago:2026-11-05:366120" })], contas, maps.slice(0, 1), "x").length, 0);
});

test("DARF do Lucro Real pago (nasce no Contábil): mesmo tratamento — principal baixa o IRPJ/CSLL a recolher, multa e juros à parte", () => {
  for (const [t, o] of [["IRPJ_REAL_PAGO", "contabil_irpj_real_pago"], ["CSLL_REAL_PAGO", "contabil_csll_real_pago"]]) {
    assert.equal(ORIGEM_POR_TRIBUTO[t], o, t);
    assert.match(readFileSync("src/server/apuracoesFiscaisStore.ts", "utf8"), new RegExp(`"${t}"`));
  }
  assert.equal(origemDaReferencia(`FISCAL:${cnpj}:2027-01:APURACAO:CSLL_REAL_PAGO:LR:CSLL_REAL_PAGO:2026-T04:ENCARGOS`)?.id, "fiscal_darf_encargos");
  const maps = [mapa("contabil_csll_real_pago", "2.1.08", "1.1.02"), mapa("fiscal_darf_encargos", "4.1.02", "1.1.02")];
  // CSLL de R$ 12.780,00 paga em 29/01/2027 com R$ 0,00 de acréscimo, e outra com R$ 127,80 de multa e juros
  const sem = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "CSLL_REAL_PAGO", competencia: "2027-01", referencia: "LR:CSLL_REAL_PAGO:2026-T04", valorCentavos: 1278000, baseCentavos: 1278000, versaoOrigem: "pago:2027-01-29:1278000" })], contas, maps, "x");
  assert.deepEqual(sem.map((x) => [x.data, x.contaDebitoCodigo, x.contaCreditoCodigo, x.valor]), [["2027-01-29", "2.1.08", "1.1.02", 12780]]);
  const com = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "CSLL_REAL_PAGO", competencia: "2027-02", referencia: "LR:CSLL_REAL_PAGO:2026-T04", valorCentavos: 1290780, baseCentavos: 1278000, versaoOrigem: "pago:2027-02-10:1290780" })], contas, maps, "x");
  assert.deepEqual(com.map((x) => x.valor), [12780, 127.8]);
});

test("CPRB do DP: provisão no último dia do mês com a origem dp_cprb", () => {
  assert.match(readFileSync("src/server/apuracoesFiscaisStore.ts", "utf8"), /"CPRB"/);
  assert.equal(dataDaApuracao({ tributo: "CPRB", competencia: "2026-02", versaoOrigem: "x" }), "2026-02-28");
  const r = gerarRascunhosApuracoes(cnpj, [ap({ tributo: "CPRB", competencia: "2026-02", referencia: "DP:CPRB:2026-02", valorCentavos: 513000, baseCentavos: 19000000, versaoOrigem: "v1" })], contas, [mapa("dp_cprb", "3.2.01", "2.1.08")], "x");
  assert.deepEqual(r.map((x) => [x.data, x.contaDebitoCodigo, x.contaCreditoCodigo, x.valor]), [["2026-02-28", "3.2.01", "2.1.08", 5130]]);
});
