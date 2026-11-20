import test from "node:test";
import assert from "node:assert/strict";
import { gerarArquivoECD, type ParametrosECD } from "../../src/services/ecdService";
import { centavosEcd, ehArquivoEcd, lerArquivoEcd } from "../../src/services/ecdImportService";
import { lerArquivosContabeis } from "../../src/services/migracaoContabilService";
import { gerarRelatoriosContabeis } from "../../src/utils/livrosContabeis";
import type { ContaPlano, LancamentoContabil } from "../../src/types";

const contas: ContaPlano[] = [
  { codigo: "1", descricao: "Ativo", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1", descricao: "Circulante", nivel: 2, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1.01", descricao: "Caixa", nivel: 3, tipo: "analitica", natureza: "D", saldoInicial: 1000, saldoInicialCompetencia: "2026-01" },
  { codigo: "1.1.02", descricao: "Clientes", nivel: 3, tipo: "analitica", natureza: "D" },
  { codigo: "2", descricao: "Passivo", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1", descricao: "Patrimônio Líquido", nivel: 2, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1.01", descricao: "Capital Social", nivel: 3, tipo: "analitica", natureza: "C", saldoInicial: 1000, saldoInicialCompetencia: "2026-01" },
  { codigo: "2.1.02", descricao: "Lucros ou Prejuízos Acumulados", nivel: 3, tipo: "analitica", natureza: "C" },
  { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "3.1.01", descricao: "Receita de serviços", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "4", descricao: "Despesas", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "4.1.01", descricao: "Despesas gerais", nivel: 2, tipo: "analitica", natureza: "D" },
];
const lcto = (id: string, data: string, d: string, c: string, valor: number, historico: string, extra: Partial<LancamentoContabil> = {}): LancamentoContabil => ({
  id, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico, origem: "Manual", documentoRef: id, ...extra,
});
const lancs = [
  lcto("a", "2026-01-10", "1.1.02", "3.1.01", 1500.5, "Venda NF 1"),
  lcto("b", "2026-03-05", "1.1.01", "1.1.02", 700.25, "Recebimento"),
  // lote 1 x N: despesa paga em parte no caixa e parte a prazo com o cliente (exemplo de várias partidas)
  lcto("c1", "2026-04-02", "4.1.01", "1.1.01", 300, "Despesa rateada", { loteId: "L1" }),
  lcto("c2", "2026-04-02", "4.1.01", "1.1.02", 200, "Despesa rateada", { loteId: "L1" }),
];
const param: ParametrosECD = {
  ano: 2026, nomeEmpresarial: "EMPRESA TESTE LTDA", cnpj: "11.222.333/0001-81", uf: "MG", possuiNire: true, nire: "31123456789",
  dataArquivamentoAtos: "2015-01-01", municipio: "BELO HORIZONTE", numeroLivro: 1, naturezaLivro: "DIARIO GERAL",
  signatarios: [
    { nome: "FULANO", documento: "529.982.247-25", qualificacao: "Administrador", codigo: "205", responsavelLegal: true },
    { nome: "BELTRANO", documento: "111.444.777-35", qualificacao: "Contador", codigo: "900", crc: "MG-12345", email: "a@b.com", fone: "31999999999", ufCrc: "MG", certidaoCrc: "MG/2026/1", dataCrc: "2026-01-02", responsavelLegal: false },
  ],
};

const gerar = () => {
  const r = gerarArquivoECD({ parametros: param, contas, lancamentos: gerarRelatoriosContabeis(contas, lancs, "todos").validos });
  assert.deepEqual(r.erros, []);
  return r.conteudo!;
};

test("valores no formato da ECD", () => {
  assert.equal(centavosEcd("1500,50"), 150050); assert.equal(centavosEcd("0,5"), 50); assert.equal(centavosEcd("12"), 1200); assert.equal(centavosEcd("abc"), null);
});

test("lê de volta uma ECD gerada: plano, saldos de abertura, lançamentos e saldos finais iguais", () => {
  const txt = gerar();
  assert.equal(ehArquivoEcd(txt), true);
  const r = lerArquivoEcd(txt, "11222333000181");
  assert.deepEqual(r.erros, []);
  assert.equal(r.resumo!.ano, 2026);
  assert.equal(r.contas.length, contas.length);
  const caixa = r.contas.find((c) => c.codigo === "1.1.01")!;
  assert.equal(caixa.saldoInicial, 1000); assert.equal(caixa.saldoInicialCompetencia, "2026-01"); assert.equal(caixa.natureza, "D");
  assert.equal(r.contas.find((c) => c.codigo === "2.1.01")!.saldoInicial, 1000);
  assert.equal(r.contas.find((c) => c.codigo === "3.1.01")!.natureza, "C");
  assert.equal(r.contas.find((c) => c.codigo === "4.1.01")!.natureza, "D");
  // saldos finais (sem o encerramento) iguais aos de origem
  const semEnc = (ls: LancamentoContabil[]) => ls.filter((l) => l.tipoEspecial !== "encerramento");
  const saldo = (cs: ContaPlano[], ls: LancamentoContabil[]) => new Map(gerarRelatoriosContabeis(cs, ls, "2026-12").balancete.filter((b) => b.conta.tipo === "analitica").map((b) => [b.conta.codigo, b.saldoDevedorCentavos - b.saldoCredorCentavos]));
  assert.deepEqual(saldo(r.contas, semEnc(r.lancamentos)), saldo(contas, lancs));
  // o lote de 1 débito x 2 créditos volta como 2 partidas com o mesmo loteId; o encerramento vem marcado
  const lote = r.lancamentos.filter((l) => l.loteId && l.tipoEspecial !== "encerramento");
  assert.equal(lote.length, 2); assert.equal(new Set(lote.map((l) => l.loteId)).size, 1);
  assert.ok(r.lancamentos.some((l) => l.tipoEspecial === "encerramento"));
  assert.equal(r.resumo!.encerramentos, 1);
  // ids e referências fixos: ler duas vezes dá o mesmo resultado (não duplica)
  assert.deepEqual(lerArquivoEcd(txt, "11222333000181").lancamentos.map((l) => l.id), r.lancamentos.map((l) => l.id));
  assert.equal(new Set(r.lancamentos.map((l) => l.id)).size, r.lancamentos.length);
});

test("recusa ECD de outro CNPJ e lançamento que não fecha", () => {
  const txt = gerar();
  assert.match(lerArquivoEcd(txt, "99888777000166").erros[0], /outro|diferente/);
  const quebrado = txt.replace(/\|I250\|1\.1\.01\|\|700,25\|D\|/, "|I250|1.1.01||700,24|D|");
  const r = lerArquivoEcd(quebrado, "11222333000181");
  assert.ok(r.erros.some((e) => /não fecham/.test(e)));
  assert.equal(r.resumo!.recusados, 1);
  assert.equal(lerArquivoEcd("|0000|LECF|", "").ok, false);
});

test("a migração reconhece o TXT da ECD em qualquer origem escolhida", async () => {
  const txt = gerar();
  const arquivo = new File([txt], "ecd-2026.txt", { type: "text/plain" });
  const r = await lerArquivosContabeis([arquivo], "DOMINIO", "11222333000181");
  assert.deepEqual(r.erros, []);
  assert.equal(r.ecd!.cnpj, "11222333000181");
  assert.equal(r.contas.length, contas.length);
  assert.ok(r.lancamentos.length >= 4);
});
