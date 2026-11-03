import test from "node:test";
import assert from "node:assert/strict";
import { sugerirMapeamentosPadrao } from "../../src/utils/sugestoesContas";
import { gerarRascunhosFiscal } from "../../src/server/prepararRascunhosContabeis";

const planoModelo = [
  { codigo: "1.1.5", descricao: "Clientes e Duplicatas a Receber", tipo: "analitica" }, { codigo: "1.2.1", descricao: "Estoques de Mercadorias e Produtos", tipo: "analitica" },
  { codigo: "2.1.1", descricao: "Fornecedores e Contas a Pagar", tipo: "analitica" }, { codigo: "2.1.2", descricao: "Salários e Encargos Trabalhistas a Pagar", tipo: "analitica" },
  { codigo: "2.1.3", descricao: "Obrigações Fiscais e Tributos a Recolher (IBS/CBS/ICMS)", tipo: "analitica" }, { codigo: "2.2.1", descricao: "INSS e Previdência Social a Recolher", tipo: "analitica" },
  { codigo: "2.2.2", descricao: "FGTS a Recolher (FGTS Digital)", tipo: "analitica" }, { codigo: "4.1.1", descricao: "Receita de Venda de Mercadorias", tipo: "analitica" },
  { codigo: "5.2.1", descricao: "Despesas com Pessoal e Encargos", tipo: "analitica" },
];

test("Plano padrão: sugere as 7 origens, com débito e crédito diferentes", () => {
  const s = sugerirMapeamentosPadrao(planoModelo, [], "2026-11-03T00:00:00.000Z");
  assert.equal(s.length, 7);
  const saida = s.find((x) => x.origem === "fiscal_saida")!;
  assert.deepEqual([saida.contaDebitoCodigo, saida.contaCreditoCodigo], ["1.1.5", "4.1.1"]);
  for (const x of s) assert.notEqual(x.contaDebitoCodigo, x.contaCreditoCodigo);
});

test("Não adivinha: plano diferente (outros códigos) não recebe sugestão; mapeamento existente nunca é alterado", () => {
  const outroPlano = [{ codigo: "1.1.01.01.01", descricao: "Caixa", tipo: "analitica" }, { codigo: "4.1.03.01.01", descricao: "Salários e ordenados", tipo: "analitica" }];
  assert.equal(sugerirMapeamentosPadrao(outroPlano, [], "x").length, 0);
  const existente = [{ origem: "fiscal_saida", contaDebitoCodigo: "9.9", contaCreditoCodigo: "8.8", revisadoEm: "x" }];
  const s = sugerirMapeamentosPadrao(planoModelo, existente, "x");
  assert.equal(s.length, 6); assert.ok(!s.some((x) => x.origem === "fiscal_saida"));
  assert.equal(sugerirMapeamentosPadrao(planoModelo.map((c) => c.codigo === "1.1.5" ? { ...c, tipo: "sintetica" } : c), [], "x").some((x) => x.origem === "fiscal_saida"), false);
});

test("Ponta a ponta: nota de saída confirmada na SEFAZ vira pré-lançamento; pendente continua de fora", () => {
  const map = sugerirMapeamentosPadrao(planoModelo, [], "2026-11-03T00:00:00.000Z");
  const doc = (chave: string, verificado: boolean) => ({ cnpjEmpresa: "11497078000180", tipo: "Saída", chaveAcesso: chave, dataEmissao: "28/10/2026", valorTotal: 150.5, statusSefaz: verificado ? "Autorizada" : "Pendente", statusVerificadoSefaz: verificado, dadosTributariosDisponiveis: true, valorIcms: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0 });
  const r = gerarRascunhosFiscal("11497078000180", [doc("1".repeat(44), true), doc("2".repeat(44), false)], planoModelo, map, "2026-11-03T00:00:00.000Z", true);
  assert.equal(r.length, 1);
  assert.equal(r[0].contaDebitoCodigo, "1.1.5"); assert.equal(r[0].contaCreditoCodigo, "4.1.1"); assert.equal(r[0].valor, 150.5); assert.equal(r[0].competencia, "2026-10");
});
