// DVA (CPC 09 (R1), Modelo I; Lei 6.404/1976, art. 176, V, e art. 188, II): exemplo calculado à mão, conta pendente que impede fechar,
// escolha da contadora, vínculo com o plano referencial (L300A) e a conferência "distribuído = gerado".
import test from "node:test";
import assert from "node:assert/strict";
import { calcularDva, ehCompanhiaAberta, linhaPeloReferencial, linhasDaDva, resumoDva } from "../../src/utils/dva";
import { conferirDvaWorkspace } from "../../src/server/dvaServidor";

const C = (codigo: string, descricao: string, tipo: "analitica" | "sintetica" = "analitica", natureza: "D" | "C" = "D") => ({ codigo, descricao, nivel: codigo.split(".").length, tipo, natureza });
const contas: any[] = [
  C("1", "Ativo", "sintetica"), C("1.1", "Ativo Circulante", "sintetica"), C("1.1.1", "Bancos conta movimento"), C("1.1.2", "Clientes"),
  C("1.1.3", "Estoques de mercadorias"), C("1.1.4", "ICMS a recuperar"), C("1.2", "Ativo Não Circulante", "sintetica"), C("1.2.1", "Imobilizado", "sintetica"),
  C("1.2.1.1", "Máquinas"), C("1.2.1.2", "(-) Depreciação acumulada", "analitica", "C"),
  C("2", "Passivo", "sintetica", "C"), C("2.1", "Passivo Circulante", "sintetica", "C"), C("2.1.1", "Fornecedores", "analitica", "C"), C("2.1.2", "ICMS a recolher", "analitica", "C"),
  C("2.1.3", "Salários e encargos a pagar", "analitica", "C"), C("2.1.4", "Lucros a distribuir", "analitica", "C"),
  C("2.3", "Patrimônio Líquido", "sintetica", "C"), C("2.3.1", "Capital Social", "analitica", "C"), C("2.3.3", "Lucros ou prejuízos acumulados", "analitica", "C"),
  C("3", "Receitas", "sintetica", "C"), C("3.1", "Receita bruta de vendas", "analitica", "C"), C("3.2", "Deduções da receita - ICMS sobre vendas"), C("3.3", "Receitas financeiras", "analitica", "C"),
  C("4", "Despesas", "sintetica"), C("4.1", "Custo das mercadorias vendidas"), C("4.2", "Salários e ordenados"), C("4.3", "FGTS"), C("4.4", "INSS patronal"),
  C("4.5", "Energia elétrica"), C("4.6", "Aluguel do imóvel"), C("4.7", "Despesa de depreciação"), C("4.8", "Juros sobre empréstimos"), C("4.9", "IRPJ e CSLL"),
  C("4.10", "Vale-transporte"), C("4.11", "Impostos e taxas diversas"),
];
let n = 0;
const L = (data: string, d: string, c: string, valor: number) => ({ id: `l${++n}`, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico: "h", origem: "Manual" });
const base: any[] = [
  L("2025-12-31", "1.1.1", "2.3.1", 100000),
  L("2026-01-05", "1.1.3", "2.1.1", 8200), L("2026-01-05", "1.1.4", "2.1.1", 1800), // compra: ICMS de R$ 1.800,00 recuperável
  L("2026-01-10", "1.1.2", "3.1", 20000), L("2026-01-10", "3.2", "2.1.2", 3600), L("2026-01-10", "4.1", "1.1.3", 8200),
  L("2026-01-31", "2.1.2", "1.1.4", 1800), // apuração do ICMS (não é crédito novo)
  L("2026-01-31", "4.2", "2.1.3", 3000), L("2026-01-31", "4.3", "2.1.3", 240), L("2026-01-31", "4.4", "2.1.3", 600), L("2026-01-31", "4.10", "1.1.1", 150),
  L("2026-02-10", "4.5", "1.1.1", 400), L("2026-02-10", "4.6", "1.1.1", 1000),
  L("2026-03-01", "1.2.1.1", "1.1.1", 6000), L("2026-12-31", "4.7", "1.2.1.2", 500),
  L("2026-04-10", "4.8", "1.1.1", 100), L("2026-04-11", "1.1.1", "3.3", 50), L("2026-04-30", "4.9", "1.1.1", 300),
  L("2026-12-31", "2.3.3", "2.1.4", 1000), // dividendos do ano
];

test("DVA calculada à mão: valor a distribuir R$ 9.150,00 = distribuído R$ 9.150,00", () => {
  const d = calcularDva({ contas, lancamentos: base, de: "2026-01", ate: "2026-12" });
  assert.deepEqual(d.pendentes, []);
  assert.equal(d.linhas["1.1"], 2_000_000);
  assert.equal(d.tributosRecuperaveis.centavos, 180_000);
  assert.equal(d.linhas["2.1"], 1_000_000); // CMV 8.200 + ICMS recuperável 1.800 (CPC 09 (R1), item 14)
  assert.equal(d.linhas["2.2"], 40_000);
  assert.equal(d.valorAdicionadoBruto, 960_000);
  assert.equal(d.depreciacao, 50_000);
  assert.equal(d.transferencias, 5_000);
  assert.equal(d.totalADistribuir, 915_000);
  assert.equal(d.pessoal, 339_000); // salários 3.000 + vale-transporte 150 + FGTS 240
  assert.equal(d.linhas["8.2.1"], 90_000); // INSS patronal 600 + IRPJ/CSLL 300
  assert.equal(d.linhas["8.2.2"], 180_000); // ICMS das vendas 3.600 − recuperável 1.800 (item 35)
  assert.equal(d.capitaisTerceiros, 110_000);
  assert.equal(d.lucroLiquidoDre, 196_000);
  assert.equal(d.dividendos, 100_000); assert.equal(d.lucrosRetidos, 96_000);
  assert.equal(d.totalDistribuido, 915_000);
  assert.equal(d.diferenca, 0); assert.equal(d.fecha, true); assert.equal(d.completa, true);
  assert.match(resumoDva(d), /DVA fecha/);
  const ls = linhasDaDva(d);
  assert.equal(ls.find((l) => l.codigo === "7")!.centavos, ls.find((l) => l.codigo === "8")!.centavos);
});

test("conta sem linha da DVA: fica pendente e a DVA não fecha; com a escolha da contadora, fecha", () => {
  const lancs = [...base, L("2026-06-30", "4.11", "1.1.1", 200)];
  const d = calcularDva({ contas, lancamentos: lancs, de: "2026-01", ate: "2026-12" });
  assert.equal(d.pendentes.map((c) => c.codigo).join(), "4.11");
  assert.equal(d.fecha, false); assert.equal(d.completa, false);
  assert.equal(d.diferenca, -20_000);
  assert.match(d.avisos[0], /sem linha da DVA/);
  const ok = calcularDva({ contas, lancamentos: lancs, de: "2026-01", ate: "2026-12", classificacao: { "4.11": "8.2.3" } });
  assert.equal(ok.completa, true); assert.equal(ok.linhas["8.2.3"], 20_000); assert.equal(ok.totalADistribuir, ok.totalDistribuido);
  // Sem os tributos recuperáveis o total não muda (só a composição).
  const sem = calcularDva({ contas, lancamentos: lancs, de: "2026-01", ate: "2026-12", classificacao: { "4.11": "8.2.3" }, incluirRecuperaveis: false });
  assert.equal(sem.totalADistribuir, ok.totalADistribuir + 180_000); assert.equal(sem.fecha, true);
});

test("plano referencial (L300A): o vínculo da ECD manda na linha; 'Demais impostos' fica pendente", () => {
  assert.equal(linhaPeloReferencial("3.01.01.01.02.03"), "8.2.2");
  assert.equal(linhaPeloReferencial("3.01.01.01.02.01"), "1.1");
  assert.equal(linhaPeloReferencial("3.02.01.01.01.02"), "8.2.1");
  assert.equal(linhaPeloReferencial("3.01.01.05.01.35"), "6.2");
  assert.equal(linhaPeloReferencial("3.01.01.05.01.38"), "1.2");
  assert.equal(linhaPeloReferencial("3.01.01.07.01.06"), "8.1.3");
  assert.equal(linhaPeloReferencial("3.01.01.07.01.16"), null);
  assert.equal(linhaPeloReferencial("3.11.01.03.01.02"), "2.1");
  assert.equal(linhaPeloReferencial("1.01.01.01.01"), undefined);
  const empresa: any = { regime: "Lucro Presumido", mapeamentoReferencial: { "4.5": "3.01.01.07.01.36", "4.6": "3.01.01.07.01.16" } };
  const d = calcularDva({ contas, lancamentos: base, de: "2026-01", ate: "2026-12", empresa });
  assert.equal(d.contas.find((c) => c.codigo === "4.5")!.origem, "referencial");
  assert.equal(d.contas.find((c) => c.codigo === "4.6")!.linha, null); // o referencial não diz o ente: pendente
  assert.equal(d.fecha, false);
});

test("companhia aberta (204-6): a DVA é obrigatória e o conferidor aponta quando não fecha", () => {
  assert.equal(ehCompanhiaAberta({ naturezaJuridica: "204-6 - Sociedade Anônima Aberta" }), true);
  assert.equal(ehCompanhiaAberta({ naturezaJuridica: "206-2 - Sociedade Empresária Limitada" }), false);
  const payload = { contas, lancamentos: [...base, L("2026-06-30", "4.11", "1.1.1", 200)], empresa: { naturezaJuridica: "204-6 - Sociedade Anônima Aberta" } };
  const a = conferirDvaWorkspace("11222333000181", payload, 2026);
  assert.equal(a?.fecha, false); assert.equal(a?.nivel, "falta"); assert.match(a!.texto, /não fecha/);
  const b = conferirDvaWorkspace("11222333000181", { ...payload, empresa: { ...payload.empresa, classificacaoDva: { "4.11": "8.2.3" } } }, 2026);
  assert.equal(b?.fecha, true);
  assert.equal(conferirDvaWorkspace("11222333000181", { contas, lancamentos: [] }, 2026), null);
});
