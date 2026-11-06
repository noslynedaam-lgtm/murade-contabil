import test from "node:test";
import assert from "node:assert/strict";
import { gerarRascunhosFiscal, regimeSimplesNacional } from "../../src/server/prepararRascunhosContabeis";

const cnpj = "11497078000180";
const contas = [
  { codigo: "1.2.1", tipo: "analitica" }, { codigo: "2.1.1", tipo: "analitica" },
  { codigo: "1.1.5", tipo: "analitica" }, { codigo: "4.1.1", tipo: "analitica" },
];
const mapeamentos = [
  { origem: "fiscal_entrada", contaDebitoCodigo: "1.2.1", contaCreditoCodigo: "2.1.1" },
  { origem: "fiscal_saida", contaDebitoCodigo: "1.1.5", contaCreditoCodigo: "4.1.1" },
];
const nota = (extra: Record<string, unknown> = {}) => ({
  cnpjEmpresa: cnpj, tipo: "Entrada", cfop: "1102", chaveAcesso: "52261061064838002420550010003081441050382396",
  dataEmissao: "16/10/2026", valorTotal: 2658.37, statusSefaz: "Autorizada", statusVerificadoSefaz: true,
  dadosTributariosDisponiveis: true, valorIcms: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, ...extra,
});
const agora = "2026-10-20T12:00:00.000Z";

test("reconhece o regime Simples Nacional do cadastro", () => {
  assert.equal(regimeSimplesNacional("Simples Nacional (opção cadastral informada pela fonte)"), true);
  assert.equal(regimeSimplesNacional("Lucro Presumido"), false);
  assert.equal(regimeSimplesNacional(""), false);
  assert.equal(regimeSimplesNacional(undefined), false);
});

test("nota com impostos destacados continua ignorada fora do Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ valorIcms: 100 })], contas, mapeamentos, agora, false).length, 0);
});

test("no Simples Nacional a nota com impostos destacados vira rascunho pelo valor bruto", () => {
  const r = gerarRascunhosFiscal(cnpj, [nota({ valorIcms: 100, valorPis: 10, valorCofins: 46 })], contas, mapeamentos, agora, true);
  assert.equal(r.length, 1);
  assert.equal(r[0].valor, 2658.37);
  assert.equal(r[0].contaDebitoCodigo, "1.2.1");
  assert.equal(r[0].contaCreditoCodigo, "2.1.1");
});

test("resumo sem dados tributários nunca vira rascunho, nem no Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ dadosTributariosDisponiveis: false })], contas, mapeamentos, agora, true).length, 0);
});

test("nota não verificada ou cancelada nunca vira rascunho, nem no Simples Nacional", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ statusVerificadoSefaz: false })], contas, mapeamentos, agora, true).length, 0);
  assert.equal(gerarRascunhosFiscal(cnpj, [nota({ statusSefaz: "Cancelada" })], contas, mapeamentos, agora, true).length, 0);
});

test("sem mapeamento de contas não há rascunho", () => {
  assert.equal(gerarRascunhosFiscal(cnpj, [nota()], contas, [], agora, true).length, 0);
});

import { entradaEhCompraParaEstoque, ehNfce } from "../../src/server/prepararRascunhosContabeis";
test("CFOP: compra vira estoque; devolução, remessa e vazio não", () => {
  for (const c of ["1102", "1.102", "5102", "6405", "2403", "5101"]) assert.equal(entradaEhCompraParaEstoque(c), true, c);
  for (const c of ["1202", "5949", "1949", "5411", "", undefined, "5551"]) assert.equal(entradaEhCompraParaEstoque(c), false, String(c));
});
test("NFC-e é identificada pelo modelo 65 na chave", () => {
  assert.equal(ehNfce("52261061064838002420650010003081441050382396"), true);
  assert.equal(ehNfce("52261061064838002420550010003081441050382396"), false);
});

import { gerarRascunhosApuracoes } from "../../src/server/prepararRascunhosContabeis";
import type { ApuracaoFiscalArmazenada } from "../../src/server/apuracoesFiscaisStore";

const apuracao = (extra: Partial<ApuracaoFiscalArmazenada> = {}): ApuracaoFiscalArmazenada => ({
  cnpj, tributo: "ICMS_DIFAL_ATIVO", competencia: "2026-09", referencia: "DIFAL:nota1",
  valorCentavos: 7317, baseCentavos: 7000, situacao: "confirmado", versaoOrigem: "2026-09-10T00:00:00.000Z",
  recebidoEm: agora, atualizadoEm: agora, ...extra,
});
const contasApuracao = [
  { codigo: "1.2.3", tipo: "analitica" }, { codigo: "2.1.9", tipo: "analitica" },
];
const mapeamentosApuracao = [
  { origem: "fiscal_difal_ativo", contaDebitoCodigo: "1.2.3", contaCreditoCodigo: "2.1.9" },
];

test("apuração confirmada com mapeamento vira pré-lançamento pelo valor em reais", () => {
  const r = gerarRascunhosApuracoes(cnpj, [apuracao()], contasApuracao, mapeamentosApuracao, agora);
  assert.equal(r.length, 1);
  assert.equal(r[0].valor, 73.17);
  assert.equal(r[0].contaDebitoCodigo, "1.2.3");
  assert.equal(r[0].contaCreditoCodigo, "2.1.9");
  assert.equal(r[0].competencia, "2026-09");
  assert.match(r[0].referenciaOrigem, /^FISCAL:11497078000180:2026-09:APURACAO:ICMS_DIFAL_ATIVO:DIFAL:nota1$/);
});

test("apuração ainda não confirmada nunca vira rascunho (defesa extra, mesmo que o store já filtre)", () => {
  assert.equal(gerarRascunhosApuracoes(cnpj, [apuracao({ situacao: "calculado" })], contasApuracao, mapeamentosApuracao, agora).length, 0);
});

test("sem mapeamento da origem (tributo) não há rascunho", () => {
  assert.equal(gerarRascunhosApuracoes(cnpj, [apuracao()], contasApuracao, [], agora).length, 0);
});

test("tributo desconhecido (fora do contrato) é ignorado, não derruba o lote", () => {
  const r = gerarRascunhosApuracoes(cnpj, [apuracao({ tributo: "ALGO_NOVO" as any }), apuracao()], contasApuracao, mapeamentosApuracao, agora);
  assert.equal(r.length, 1);
});

test("IRPJ e DIFAL geram referências e contas independentes mesmo na mesma competência", () => {
  const mapeamentos2 = [...mapeamentosApuracao, { origem: "fiscal_irpj_presumido", contaDebitoCodigo: "1.2.3", contaCreditoCodigo: "2.1.9" }];
  const r = gerarRascunhosApuracoes(cnpj, [
    apuracao({ tributo: "ICMS_DIFAL_ATIVO", referencia: "DIFAL:nota1" }),
    apuracao({ tributo: "IRPJ_PRESUMIDO", referencia: "LP:irpj:2026-T3", valorCentavos: 50000 }),
  ], contasApuracao, mapeamentos2, agora);
  assert.equal(r.length, 2);
  assert.notEqual(r[0].referenciaOrigem, r[1].referenciaOrigem);
});
