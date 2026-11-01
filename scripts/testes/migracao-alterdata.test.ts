import test from "node:test";
import assert from "node:assert/strict";
import { lerArquivosContabeis } from "../../src/services/migracaoContabilService";

const arquivo = (nome: string, texto: string, latin1 = false) =>
  new File([latin1 ? Buffer.from(texto, "latin1") : texto], nome, { type: "text/plain" });

test("TXT contábil Alterdata Modelo 1 (9 colunas): datas, valores e histórico", async () => {
  const txt = [
    "1;1.1.01;3.1.01;05/10/2026;1.500,50;;;Venda à vista;NF 123",
    "2;4.1.01;1.1.01;06/10/2026;400,5;;;Pagamento de aluguel;REC 9",
  ].join("\n");
  const r = await lerArquivosContabeis([arquivo("lancamentos.txt", txt)], "ALTERDATA");
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  assert.deepEqual(r.lancamentos.map((l) => [l.data, l.valor, l.contaDebitoCodigo, l.contaCreditoCodigo]), [
    ["2026-10-05", 1500.5, "1.1.01", "3.1.01"],
    ["2026-10-06", 400.5, "4.1.01", "1.1.01"],
  ]);
  assert.equal(r.lancamentos[0].documentoRef, "NF 123");
});

test("TXT contábil Alterdata Modelo 2 (10 colunas) com acentos em Windows-1252", async () => {
  const txt = "1;1.1.01;3.1.01;05/10/2026;2.000,00;10;20;;Receita de serviços prestados;NF 7";
  const r = await lerArquivosContabeis([arquivo("lancamentos.txt", txt, true)], "ALTERDATA");
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  assert.equal(r.lancamentos[0].historico, "Receita de serviços prestados");
  assert.equal(r.lancamentos[0].centroCustoDebitoCodigo, "10");
  assert.equal(r.lancamentos[0].centroCustoCreditoCodigo, "20");
});

test("linhas inválidas (data impossível, valor zero) viram erro e não entram", async () => {
  const txt = [
    "1;1.1.01;3.1.01;31/02/2026;100,00;;;Histórico;",
    "2;1.1.01;3.1.01;05/10/2026;0,00;;;Histórico;",
    "3;1.1.01;3.1.01;05/10/2026;10,00;;;Válido;",
  ].join("\n");
  const r = await lerArquivosContabeis([arquivo("lancamentos.txt", txt)], "ALTERDATA");
  assert.equal(r.lancamentos.length, 1);
  assert.equal(r.erros.length, 2);
});

test("formato desconhecido é recusado, não aceito em silêncio", async () => {
  const r = await lerArquivosContabeis([arquivo("planilha.xlsx", "x")], "ALTERDATA");
  assert.equal(r.lancamentos.length, 0);
  assert.match(r.erros[0].motivo, /Formato não suportado/);
});

test("Exportação delimitada do Alterdata Pack (separador '.,' e cabeçalho CdClassInterna/NmConta/IdOrigem)", async () => {
  const cab = "CdClassInterna.,CdClassExterna.,CdChamada.,TpConta.,NmConta.,IdOrigem.,IdPeriodicidade.,TaxaDeprec.,Fim4";
  const l1 = "1.,.,5.,S.,Ativo.,D.,I.,0,00.,4";
  const l2 = "1-1.,.,10.,S.,Circulante.,D.,I.,0,00.,4";
  const l3 = "1-1-01.,.,15.,A.,Caixa.,D.,I.,0,00.,4";
  const r = await lerArquivosContabeis([arquivo("ExpPContas.txt", [cab, l1, l2, l3].join("\r\n"), true)], "ALTERDATA");
  assert.equal(r.erros.length, 0, JSON.stringify(r.erros));
  assert.deepEqual(r.contas.map((c) => [c.codigo, c.descricao, c.natureza, c.tipo]), [
    ["1", "Ativo", "D", "sintetica"],
    ["1-1", "Circulante", "D", "sintetica"],
    ["1-1-01", "Caixa", "D", "analitica"],
  ]);
});
