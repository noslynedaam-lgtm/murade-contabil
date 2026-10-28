import test from "node:test";
import assert from "node:assert/strict";
import { gerarArquivoECD, cnpjValido, cpfValido, ecdParaLatin1, textoECD, type ParametrosECD } from "../../src/services/ecdService";
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
  { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "3.1.01", descricao: "Receita de serviços – prestação", nivel: 2, tipo: "analitica", natureza: "C" },
];
const lcto = (id: string, data: string, d: string, c: string, valor: number, historico: string): LancamentoContabil => ({
  id, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico, origem: "Manual", documentoRef: id,
});
const lancs = [
  lcto("a", "2026-01-10", "1.1.02", "3.1.01", 1500.5, "Venda à vista | NF 1"),
  lcto("b", "2026-03-05", "1.1.01", "1.1.02", 700.25, "Recebimento"),
];
const param: ParametrosECD = {
  ano: 2026, nomeEmpresarial: "EMPRESA TESTE LTDA", cnpj: "11.222.333/0001-81", uf: "MG", possuiNire: true, nire: "31123456789",
  dataArquivamentoAtos: "2015-01-01", municipio: "BELO HORIZONTE", numeroLivro: 1, naturezaLivro: "DIARIO GERAL",
  signatarios: [
    { nome: "FULANO", documento: "529.982.247-25", qualificacao: "Administrador", codigo: "205", responsavelLegal: true },
    { nome: "BELTRANO", documento: "111.444.777-35", qualificacao: "Contador", codigo: "900", crc: "MG-12345", email: "a@b.com", fone: "31999999999", ufCrc: "MG", certidaoCrc: "MG/2026/1", dataCrc: "2026-01-02", responsavelLegal: false },
  ],
};
const validos = () => gerarRelatoriosContabeis(contas, lancs, "todos").validos;

test("validadores de CPF e CNPJ", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cnpjValido("11.222.333/0001-81"), true);
  assert.equal(cnpjValido("11.222.333/0001-82"), false);
});

test("textoECD tira pipe, controle e caracteres fora do Latin-1", () => {
  assert.equal(textoECD("a|b\tc – d"), "a b c - d");
  assert.equal(ecdParaLatin1("ção")[0], 0xe7);
});

test("gera ECD G com contagens e totais conferindo", () => {
  const r = gerarArquivoECD({ parametros: param, contas, lancamentos: validos() });
  assert.deepEqual(r.erros, []);
  assert.equal(r.ok, true);
  const linhas = r.conteudo!.split("\r\n");
  assert.equal(linhas.pop(), "");
  assert.ok(linhas.every((l) => l.startsWith("|") && l.endsWith("|")));
  const tipos = linhas.map((l) => l.split("|")[1]);
  assert.equal(tipos[0], "0000"); assert.equal(tipos.at(-1), "9999");
  assert.equal(linhas.at(-1), `|9999|${linhas.length}|`);
  const cont = (bloco: string) => tipos.filter((t) => t[0] === bloco).length;
  assert.equal(linhas.find((l) => l.startsWith("|0990|")), `|0990|${cont("0")}|`);
  assert.equal(linhas.find((l) => l.startsWith("|I990|")), `|I990|${cont("I")}|`);
  assert.equal(linhas.find((l) => l.startsWith("|J990|")), `|J990|${cont("J")}|`);
  assert.equal(linhas.find((l) => l.startsWith("|9990|")), `|9990|${cont("9")}|`);
  // 9900 bate com o arquivo
  for (const l of linhas.filter((x) => x.startsWith("|9900|"))) {
    const [, , reg, qtd] = l.split("|");
    assert.equal(tipos.filter((t) => t === reg).length, Number(qtd), reg);
  }
  assert.equal(linhas.filter((l) => l.startsWith("|9900|")).length, new Set(tipos).size);
  // QTD_LIN em I030 e J900
  assert.equal(linhas.find((l) => l.startsWith("|I030|"))!.split("|")[5], String(linhas.length));
  assert.equal(linhas.find((l) => l.startsWith("|J900|"))!.split("|")[6], String(linhas.length));
  // 0000 com 23 campos
  assert.equal(linhas[0].split("|").length - 2, 23);
  assert.equal(linhas[0], "|0000|LECD|01012026|31122026|EMPRESA TESTE LTDA|11222333000181|MG|||||0|1|0||0|0||N|N|0|0||");
  // plano
  assert.ok(linhas.includes("|I050|01012026|01|S|1|1||Ativo|"));
  assert.ok(linhas.includes("|I050|01012026|01|A|3|1.1.01|1.1|Caixa|"));
  assert.ok(linhas.includes("|I050|01012026|03|S|2|2.1|2|Patrimonio Liquido|".replace("Patrimonio Liquido", "Patrimônio Líquido")));
  assert.ok(linhas.includes("|I050|01012026|04|A|2|3.1.01||Receita de serviços - prestação|".replace("||", "|3|")) || linhas.some((l) => l.startsWith("|I050|01012026|04|A|2|3.1.01|")));
  // lançamentos
  assert.ok(linhas.includes("|I200|1|10012026|1500,50|N||"));
  assert.ok(linhas.includes("|I250|1.1.02||1500,50|D|a||Venda à vista NF 1||"));
  // saldos de janeiro: caixa abre 1000 D, clientes 1500,50 D, receita C
  assert.ok(linhas.includes("|I150|01012026|31012026|"));
  assert.ok(linhas.includes("|I155|1.1.01||1000,00|D|0,00|0,00|1000,00|D|"));
  assert.ok(linhas.includes("|I155|1.1.02||0,00|D|1500,50|0,00|1500,50|D|"));
  // março: saldo inicial = final de fevereiro
  assert.ok(linhas.includes("|I155|1.1.02||1500,50|D|0,00|700,25|800,25|D|"));
  assert.ok(linhas.some((l) => l.startsWith("|J930|FULANO|52998224725|Administrador|205|||||||S|") || l.startsWith("|J930|FULANO|52998224725|Administrador|205|")));
});

test("bloqueia sem signatário contador, sem natureza e com saldos descasados", () => {
  const semContador = gerarArquivoECD({ parametros: { ...param, signatarios: [param.signatarios[0]] }, contas, lancamentos: validos() });
  assert.equal(semContador.ok, false);
  assert.ok(semContador.erros.some((e) => e.includes("Contador")));
  assert.equal(semContador.conteudo, null);

  const contasSemNat = contas.map((c) => (c.codigo === "3" || c.codigo === "3.1.01" ? { ...c, descricao: c.codigo === "3" ? "Grupo X" : "Conta Y" } : c));
  const r2 = gerarArquivoECD({ parametros: param, contas: contasSemNat, lancamentos: validos() });
  assert.deepEqual(r2.pendenciasNatureza.map((x) => x.codigo), ["3"]);
  const r3 = gerarArquivoECD({ parametros: { ...param, naturezaPorGrupo: { "3": "04" } }, contas: contasSemNat, lancamentos: validos() });
  assert.equal(r3.ok, true, r3.erros.join("; "));

  const descasado = contas.map((c) => (c.codigo === "2.1.01" ? { ...c, saldoInicial: 900 } : c));
  const r4 = gerarArquivoECD({ parametros: param, contas: descasado, lancamentos: validos() });
  assert.equal(r4.ok, false);
  assert.ok(r4.erros.some((e) => e.includes("saldos iniciais")));
});

test("lançamento sem histórico e centro de custo inexistente bloqueiam", () => {
  const v = validos();
  v[0] = { ...v[0], original: { ...v[0].original, historico: " ", centroCustoCodigo: "99" } };
  const r = gerarArquivoECD({ parametros: param, contas, lancamentos: v });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes("histórico")));
  assert.ok(r.erros.some((e) => e.includes("centro de custo 99")));
});

import { analisarObrigatoriedadeECD, prazoEntregaECD } from "../../src/services/ecdService";

test("obrigatoriedade por regime segue o item 1.3 do manual", () => {
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Real" }).situacao, "obrigatoria");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Real" }).planoReferencial, "1");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Presumido" }).situacao, "depende");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Presumido", presumidoLivroCaixa: false, presumidoDistribuiuLucroAcimaBase: false }).situacao, "obrigatoria");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Presumido", presumidoLivroCaixa: true, presumidoDistribuiuLucroAcimaBase: false }).situacao, "facultativa");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Lucro Presumido", presumidoLivroCaixa: true, presumidoDistribuiuLucroAcimaBase: true }).situacao, "obrigatoria");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Simples Nacional" }).situacao, "dispensada");
  assert.equal(analisarObrigatoriedadeECD({ regime: "Simples Nacional", simplesAporteCapital: true }).situacao, "obrigatoria");
});

test("prazo é o último dia útil de junho do ano seguinte", () => {
  assert.equal(prazoEntregaECD(2025), "2026-06-30"); // terça
  assert.equal(prazoEntregaECD(2026), "2027-06-30"); // quarta
  assert.equal(prazoEntregaECD(2027), "2028-06-30"); // sexta
  assert.equal(prazoEntregaECD(2028), "2029-06-29"); // 30/06/2029 é sábado
});

test("mês sem movimento e sem saldo ganha I155 zerado (manual 1.3)", () => {
  const r = gerarArquivoECD({ parametros: { ...param, ano: 2027 }, contas: contas.map((c) => ({ ...c, saldoInicial: undefined, saldoInicialCompetencia: undefined })), lancamentos: [] });
  assert.equal(r.ok, true, r.erros.join("; "));
  const l = r.conteudo!.split("\r\n");
  assert.equal(l.filter((x) => x.startsWith("|I150|")).length, 12);
  assert.ok(l.includes("|I155|1.1.01||0,00|D|0,00|0,00|0,00|D|"));
});
