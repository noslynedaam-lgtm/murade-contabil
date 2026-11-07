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

test("Plano padrão: sugere as 9 origens (as 7 de sempre + salário-família e faltas), com débito e crédito diferentes", () => {
  const s = sugerirMapeamentosPadrao(planoModelo, [], "2026-11-03T00:00:00.000Z");
  assert.equal(s.length, 9);
  const sf = s.find((x) => x.origem === "dp_salario_familia")!;
  assert.deepEqual([sf.contaDebitoCodigo, sf.contaCreditoCodigo], ["2.2.1", "2.1.2"]);
  const faltas = s.find((x) => x.origem === "dp_desconto_faltas")!;
  assert.deepEqual([faltas.contaDebitoCodigo, faltas.contaCreditoCodigo], ["2.1.2", "5.2.1"]);
  // VT, pensão e adiantamento dependem da empresa: nunca se chuta conta.
  for (const o of ["dp_desconto_vt", "dp_desconto_pensao", "dp_desconto_adiantamento"]) assert.ok(!s.some((x) => x.origem === o));
  const saida = s.find((x) => x.origem === "fiscal_saida")!;
  assert.deepEqual([saida.contaDebitoCodigo, saida.contaCreditoCodigo], ["1.1.5", "4.1.1"]);
  for (const x of s) assert.notEqual(x.contaDebitoCodigo, x.contaCreditoCodigo);
});

test("Não adivinha: plano diferente (outros códigos) não recebe sugestão; mapeamento existente nunca é alterado", () => {
  const outroPlano = [{ codigo: "1.1.01.01.01", descricao: "Caixa", tipo: "analitica" }, { codigo: "4.1.03.01.01", descricao: "Salários e ordenados", tipo: "analitica" }];
  assert.equal(sugerirMapeamentosPadrao(outroPlano, [], "x").length, 0);
  const existente = [{ origem: "fiscal_saida", contaDebitoCodigo: "9.9", contaCreditoCodigo: "8.8", revisadoEm: "x" }];
  const s = sugerirMapeamentosPadrao(planoModelo, existente, "x");
  assert.equal(s.length, 8); assert.ok(!s.some((x) => x.origem === "fiscal_saida"));
  assert.equal(sugerirMapeamentosPadrao(planoModelo.map((c) => c.codigo === "1.1.5" ? { ...c, tipo: "sintetica" } : c), [], "x").some((x) => x.origem === "fiscal_saida"), false);
});

const planoPadraoComercio572 = [
  { codigo: "1.1.08.01.07", descricao: "Produtos para Mercadorias e Venda", natureza: "D", tipo: "analitica" },
  { codigo: "2.1.03.01.01", descricao: "Fornecedores de Bens", natureza: "C", tipo: "analitica" },
  { codigo: "1.1.04.01.01", descricao: "Duplicatas a receber", natureza: "D", tipo: "analitica" },
  { codigo: "3.1.01.01.02", descricao: "Revenda de Mercadorias", natureza: "C", tipo: "analitica" },
  { codigo: "4.3.01.02.01", descricao: "Salários e Ordenados", natureza: "D", tipo: "analitica" },
  { codigo: "2.1.06.01.01", descricao: "Salários a Pagar", natureza: "C", tipo: "analitica" },
  { codigo: "2.1.05.01.05", descricao: "Contribuições Previdenciárias", natureza: "C", tipo: "analitica" },
  { codigo: "4.3.01.04.01", descricao: "Previdência Social", natureza: "D", tipo: "analitica" },
  { codigo: "2.1.05.02.01", descricao: "Imposto de Renda Retido na Fonte - de Funcionários", natureza: "C", tipo: "analitica" },
  { codigo: "4.3.01.04.02", descricao: "FGTS", natureza: "D", tipo: "analitica" },
  { codigo: "2.1.05.01.06", descricao: "FGTS a Recolher", natureza: "C", tipo: "analitica" },
  // Contas "parecidas" que não devem ser confundidas com as corretas acima.
  { codigo: "1.1.07.01.01", descricao: "Imposto de Renda Retido na Fonte - IRRF", natureza: "D", tipo: "analitica" },
  { codigo: "2.1.05.02.02", descricao: "Imposto de Renda Retido na Fonte - de Terceiros", natureza: "C", tipo: "analitica" },
];

test("Plano padrão de comércio (572 contas, 5 níveis): sugere as 9 origens a partir das contas reais do escritório", () => {
  const s = sugerirMapeamentosPadrao(planoPadraoComercio572, [], "2026-11-03T00:00:00.000Z");
  assert.equal(s.length, 9);
  const esperado: Record<string, [string, string]> = {
    fiscal_entrada: ["1.1.08.01.07", "2.1.03.01.01"],
    fiscal_saida: ["1.1.04.01.01", "3.1.01.01.02"],
    dp_folha_bruta: ["4.3.01.02.01", "2.1.06.01.01"],
    dp_descontos_inss: ["2.1.06.01.01", "2.1.05.01.05"],
    dp_inss_patronal: ["4.3.01.04.01", "2.1.05.01.05"],
    dp_descontos_irrf: ["2.1.06.01.01", "2.1.05.02.01"],
    dp_fgts: ["4.3.01.04.02", "2.1.05.01.06"],
    dp_salario_familia: ["2.1.05.01.05", "2.1.06.01.01"],
    dp_desconto_faltas: ["2.1.06.01.01", "4.3.01.02.01"],
  };
  for (const origem of Object.keys(esperado)) {
    const item = s.find((x) => x.origem === origem);
    assert.ok(item, `esperava sugestão para ${origem}`);
    assert.deepEqual([item!.contaDebitoCodigo, item!.contaCreditoCodigo], esperado[origem], `origem ${origem}`);
  }
});

test("Plano padrão de comércio: empresa sem o plano padrão carregado (plano simples) continua usando as regras do plano simples", () => {
  const s = sugerirMapeamentosPadrao(planoModelo, [], "x");
  assert.equal(s.length, 9);
  assert.deepEqual([s.find((x) => x.origem === "dp_fgts")!.contaDebitoCodigo, s.find((x) => x.origem === "dp_fgts")!.contaCreditoCodigo], ["5.2.1", "2.2.2"]);
});

test("Ponta a ponta: nota de saída confirmada na SEFAZ vira pré-lançamento; pendente continua de fora", () => {
  const map = sugerirMapeamentosPadrao(planoModelo, [], "2026-11-03T00:00:00.000Z");
  const doc = (chave: string, verificado: boolean) => ({ cnpjEmpresa: "11497078000180", tipo: "Saída", chaveAcesso: chave, dataEmissao: "28/10/2026", valorTotal: 150.5, statusSefaz: verificado ? "Autorizada" : "Pendente", statusVerificadoSefaz: verificado, dadosTributariosDisponiveis: true, valorIcms: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0 });
  const r = gerarRascunhosFiscal("11497078000180", [doc("1".repeat(44), true), doc("2".repeat(44), false)], planoModelo, map, "2026-11-03T00:00:00.000Z", true);
  assert.equal(r.length, 1);
  assert.equal(r[0].contaDebitoCodigo, "1.1.5"); assert.equal(r[0].contaCreditoCodigo, "4.1.1"); assert.equal(r[0].valor, 150.5); assert.equal(r[0].competencia, "2026-10");
});
