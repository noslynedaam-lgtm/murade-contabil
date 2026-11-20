// Itens 3 e 4 do levantamento de 20/11/2026: lançamento com várias partidas, histórico e lançamento padrão (recorrente),
// encerramento do resultado gravado (com estorno) e o uso pela ECD sem duplicar o lançamento tipo "E".
import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorLote, aplicarHistoricoPadrao, calcularEncerramento, contaApuracaoPadrao, dataDoPadrao, ehErro, encerramentoGravadoConfere,
  encerramentosDoAno, montarEstornoLote, montarLoteEncerramento, montarLoteMultipartida, prepararRecorrentesDoMes, semEncerramento,
  textoParaCentavos, validarLancamentoPadrao,
} from "../../src/utils/escrituracaoAvancada";
import { gerarArquivoECD, naturezasDasContas, type ParametrosECD } from "../../src/services/ecdService";
import { gerarRelatoriosContabeis } from "../../src/utils/livrosContabeis";
import { resultadoDoPeriodo } from "../../src/utils/analiseContabil";
import { gerarDlpa } from "../../src/utils/demonstracoesExtras";
import { camposEscrituracaoValidos, workspaceValido } from "../../src/server/authContabil";
import { planejarEncerramento, planejarRecorrentes } from "../../src/server/escrituracaoRotas";
import type { ContaPlano, LancamentoContabil, LancamentoPadrao } from "../../src/types";

const contas: ContaPlano[] = [
  { codigo: "1", descricao: "Ativo", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1.01", descricao: "Caixa", nivel: 2, tipo: "analitica", natureza: "D", saldoInicial: 1000, saldoInicialCompetencia: "2026-01" },
  { codigo: "1.1.02", descricao: "Clientes", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "1.1.03", descricao: "Banco Itaú", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "2", descricao: "Passivo", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1", descricao: "Patrimônio Líquido", nivel: 2, tipo: "sintetica", natureza: "C" },
  { codigo: "2.1.01", descricao: "Capital Social", nivel: 3, tipo: "analitica", natureza: "C", saldoInicial: 1000, saldoInicialCompetencia: "2026-01" },
  { codigo: "2.1.02", descricao: "Lucros ou Prejuízos Acumulados", nivel: 3, tipo: "analitica", natureza: "C" },
  { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "3.1.01", descricao: "Receita de serviços", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "4", descricao: "Despesas", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "4.1.01", descricao: "Despesa com aluguel", nivel: 2, tipo: "analitica", natureza: "D" },
  { codigo: "4.1.02", descricao: "Despesa com honorários", nivel: 2, tipo: "analitica", natureza: "D" },
];
let seq = 0;
const novoId = () => `id-${++seq}`;
const lcto = (id: string, data: string, d: string, c: string, valor: number, extra: Partial<LancamentoContabil> = {}): LancamentoContabil => ({
  id, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico: `h ${id}`, origem: "Manual", documentoRef: id, ...extra,
});
const aprovar = (l: LancamentoContabil[]) => l.map((x) => ({ ...x, statusManual: "aprovado" as const }));

// ------------------------------------------------------------------ várias partidas
test("1 débito x N créditos: pares balanceados, mesmo lote, total tem que fechar exatamente", () => {
  const r = montarLoteMultipartida({ data: "15/03/2026", historico: "Recebimento misto", forma: "1xN", contaUnica: "1.1.03", totalCentavos: 1000000, partidas: [{ conta: "1.1.02", valorCentavos: 600000 }, { conta: "3.1.01", valorCentavos: 400000 }] }, contas, { loteId: "L1", novoId, documentoRef: "MAN-L1" });
  assert.ok(!ehErro(r));
  const pares = r as LancamentoContabil[];
  assert.equal(pares.length, 2);
  assert.ok(pares.every((p) => p.loteId === "L1" && p.contaDebitoCodigo === "1.1.03" && p.statusManual === "pendente_aprovacao" && p.data === "2026-03-15" && p.origem === "Manual"));
  assert.deepEqual(pares.map((p) => [p.contaCreditoCodigo, p.valor]), [["1.1.02", 6000], ["3.1.01", 4000]]);
  const naoFecha = montarLoteMultipartida({ data: "15/03/2026", historico: "x", forma: "1xN", contaUnica: "1.1.03", totalCentavos: 1000001, partidas: [{ conta: "1.1.02", valorCentavos: 600000 }, { conta: "3.1.01", valorCentavos: 400000 }] }, contas, { loteId: "L", novoId, documentoRef: "x" });
  assert.ok(ehErro(naoFecha) && /não fecha/.test(naoFecha.erro) && /0,01/.test(naoFecha.erro));
});
test("N débitos x 1 crédito e recusas (conta sintética, mesma conta, valor zero)", () => {
  const r = montarLoteMultipartida({ data: "2026-04-05", historico: "Pagamentos", forma: "Nx1", contaUnica: "1.1.03", partidas: [{ conta: "4.1.01", valorCentavos: 150000 }, { conta: "4.1.02", valorCentavos: 50000 }] }, contas, { loteId: "L2", novoId, documentoRef: "d" }) as LancamentoContabil[];
  assert.deepEqual(r.map((p) => [p.contaDebitoCodigo, p.contaCreditoCodigo]), [["4.1.01", "1.1.03"], ["4.1.02", "1.1.03"]]);
  const base = { data: "2026-04-05", historico: "x", forma: "Nx1" as const, contaUnica: "1.1.03" };
  assert.ok(ehErro(montarLoteMultipartida({ ...base, partidas: [{ conta: "4", valorCentavos: 1 }] }, contas, { loteId: "L", novoId, documentoRef: "d" })));
  assert.ok(ehErro(montarLoteMultipartida({ ...base, partidas: [{ conta: "1.1.03", valorCentavos: 1 }] }, contas, { loteId: "L", novoId, documentoRef: "d" })));
  assert.ok(ehErro(montarLoteMultipartida({ ...base, partidas: [{ conta: "4.1.01", valorCentavos: 0 }] }, contas, { loteId: "L", novoId, documentoRef: "d" })));
  // uma partida só = lançamento simples (sem lote)
  const um = montarLoteMultipartida({ ...base, partidas: [{ conta: "4.1.01", valorCentavos: 100 }] }, contas, { loteId: "L", novoId, documentoRef: "d" }) as LancamentoContabil[];
  assert.equal(um[0].loteId, undefined);
});
test("valores: textoParaCentavos é exato e recusa mais de 2 casas", () => {
  assert.equal(textoParaCentavos("1.234,56"), 123456);
  assert.equal(textoParaCentavos("R$ 0,10"), 10);
  assert.equal(textoParaCentavos("10.075"), null);
  assert.equal(textoParaCentavos("abc"), null);
});
test("ECD: o lote vira UM I200 com as partidas I250; lançamento simples continua igual", () => {
  const param: ParametrosECD = { ano: 2026, nomeEmpresarial: "EMPRESA TESTE LTDA", cnpj: "11.222.333/0001-81", uf: "MG", possuiNire: true, nire: "31123456789", dataArquivamentoAtos: "2015-01-01", municipio: "BELO HORIZONTE", numeroLivro: 1, naturezaLivro: "DIARIO GERAL",
    signatarios: [{ nome: "FULANO", documento: "529.982.247-25", qualificacao: "Administrador", codigo: "205", responsavelLegal: true }, { nome: "BELTRANO", documento: "111.444.777-35", qualificacao: "Contador", codigo: "900", crc: "MG-12345", email: "a@b.com", fone: "31999999999", ufCrc: "MG", certidaoCrc: "MG/2026/1", dataCrc: "2026-01-02", responsavelLegal: false }] };
  const lote = aprovar(montarLoteMultipartida({ data: "15/03/2026", historico: "Recebimento misto", forma: "1xN", contaUnica: "1.1.03", partidas: [{ conta: "1.1.02", valorCentavos: 600000 }, { conta: "3.1.01", valorCentavos: 400000 }] }, contas, { loteId: "LX", novoId, documentoRef: "MAN-LX" }) as LancamentoContabil[]);
  const simples = aprovar([lcto("s1", "2026-02-01", "1.1.02", "3.1.01", 100)]);
  const r = gerarArquivoECD({ parametros: param, contas, lancamentos: gerarRelatoriosContabeis(contas, [...simples, ...lote], "todos").validos });
  assert.deepEqual(r.erros, []);
  const linhas = r.conteudo!.split("\r\n");
  const i200 = linhas.filter((l) => l.startsWith("|I200|") && l.includes("|N|"));
  assert.equal(i200.length, 2, "um I200 para o simples e um para o lote");
  const idx = linhas.findIndex((l) => l.startsWith("|I200|2|15032026|10000,00|N|"));
  assert.ok(idx > 0, linhas.filter((l) => l.startsWith("|I200|")).join("\n"));
  const partidas = linhas.slice(idx + 1, idx + 4);
  assert.deepEqual(partidas.map((l) => l.split("|").slice(2, 6).join("|")), ["1.1.03||10000,00|D", "1.1.02||6000,00|C", "3.1.01||4000,00|C"]);
  assert.ok(linhas[idx + 4].startsWith("|I200|") || !linhas[idx + 4].startsWith("|I250|"));
});
test("agruparPorLote mantém a ordem e separa os simples", () => {
  const g = agruparPorLote([{ id: "a" }, { id: "b", loteId: "L" }, { id: "c" }, { id: "d", loteId: "L" }]);
  assert.deepEqual(g.map((x) => x.map((y) => y.id)), [["a"], ["b", "d"], ["c"]]);
});

// ------------------------------------------------------------------ histórico e lançamento padrão
test("histórico padrão: {mes}, {competencia} e {ano}", () => {
  assert.equal(aplicarHistoricoPadrao("Aluguel de {mes} ({competencia}/{ano})", "2026-11"), "Aluguel de 11/2026 (2026-11/2026)");
});
const padrao = (extra: Partial<LancamentoPadrao> = {}): LancamentoPadrao => ({ id: "p1", nome: "Aluguel", ativo: true, dia: 31, historico: "Aluguel de {mes}", forma: "Nx1", contaUnica: "1.1.03", partidas: [{ conta: "4.1.01", valorCentavos: 250000 }], inicio: "2026-01", criadoEm: "2026-01-01T00:00:00Z", ...extra });
test("lançamento padrão: dia 31 vira último dia do mês, prepara pendente e nunca repete a competência", () => {
  assert.equal(dataDoPadrao(31, "2026-02"), "2026-02-28");
  assert.equal(dataDoPadrao(31, "2028-02"), "2028-02-29");
  const r1 = prepararRecorrentesDoMes({ padroes: [padrao()], lancamentos: [], contas, competencia: "2026-02", novoId });
  assert.equal(r1.novos.length, 1);
  assert.deepEqual([r1.novos[0].data, r1.novos[0].valor, r1.novos[0].historico, r1.novos[0].statusManual, r1.novos[0].recorrenteDe, r1.novos[0].documentoRef], ["2026-02-28", 2500, "Aluguel de 02/2026", "pendente_aprovacao", "p1", "REC:p1:2026-02"]);
  // já preparado (mesmo rejeitado): não repete
  const r2 = prepararRecorrentesDoMes({ padroes: [padrao()], lancamentos: r1.novos.map((x) => ({ ...x, statusManual: "rejeitado" as const })), contas, competencia: "2026-02", novoId });
  assert.equal(r2.novos.length, 0);
  // fechada, pausado, antes do início ou depois do fim: nada
  assert.equal(prepararRecorrentesDoMes({ padroes: [padrao()], lancamentos: [], contas, competencia: "2026-02", fechadas: new Set(["2026-02"]), novoId }).novos.length, 0);
  assert.equal(prepararRecorrentesDoMes({ padroes: [padrao({ ativo: false })], lancamentos: [], contas, competencia: "2026-02", novoId }).novos.length, 0);
  assert.equal(prepararRecorrentesDoMes({ padroes: [padrao({ inicio: "2026-03" })], lancamentos: [], contas, competencia: "2026-02", novoId }).novos.length, 0);
  assert.equal(prepararRecorrentesDoMes({ padroes: [padrao({ fim: "2026-01" })], lancamentos: [], contas, competencia: "2026-02", novoId }).novos.length, 0);
  // conta que sumiu do plano: avisa e não prepara
  const r3 = prepararRecorrentesDoMes({ padroes: [padrao({ contaUnica: "9.9.9" })], lancamentos: [], contas, competencia: "2026-02", novoId });
  assert.equal(r3.novos.length, 0); assert.match(r3.avisos[0], /Aluguel/);
});
test("robô dos lançamentos padrão: planejarRecorrentes vale para cada empresa com o próprio workspace", () => {
  const ws = { contas, lancamentos: [], lancamentosPadrao: [padrao({ forma: "1xN", contaUnica: "4.1.02", partidas: [{ conta: "1.1.03", valorCentavos: 80000 }, { conta: "1.1.01", valorCentavos: 20000 }] })] };
  const p = planejarRecorrentes(ws, "2026-05", new Set());
  assert.equal(p.novos.length, 2);
  assert.ok(p.novos.every((x) => x.loteId === "REC:p1:2026-05"));
  assert.equal(planejarRecorrentes({ contas, lancamentos: [] }, "2026-05", new Set()).novos.length, 0);
});
test("validação do workspace: históricos, lançamentos padrão, regras e marcas novas dos lançamentos", () => {
  const ok = { contas, centrosCusto: [], lancamentos: [lcto("a", "2026-01-01", "1.1.01", "3.1.01", 1, { loteId: "L", tipoEspecial: "encerramento", recorrenteDe: "p1" })], livros: [], lembretes: [],
    historicosPadrao: [{ id: "h1", codigo: "ALUG", texto: "Aluguel de {mes}" }], lancamentosPadrao: [padrao()], regrasConciliacao: [{ id: "r1", contem: "TARIFA", contaCodigo: "4.1.02", sentido: "saida", ativo: true }] };
  assert.equal(workspaceValido(ok), true);
  assert.equal(camposEscrituracaoValidos({ ...ok, historicosPadrao: [{ id: "h1", codigo: "ALUG", texto: "" }] }), false);
  assert.equal(camposEscrituracaoValidos({ ...ok, historicosPadrao: [{ id: "h1", codigo: "A", texto: "x" }, { id: "h2", codigo: "a", texto: "y" }] }), false, "código repetido");
  assert.equal(camposEscrituracaoValidos({ ...ok, lancamentosPadrao: [padrao({ dia: 0 })] }), false);
  assert.equal(camposEscrituracaoValidos({ ...ok, regrasConciliacao: [{ id: "r", contem: "ab", contaCodigo: "1", sentido: "saida", ativo: true }] }), false);
  assert.equal(camposEscrituracaoValidos({ ...ok, lancamentos: [lcto("a", "2026-01-01", "1.1.01", "3.1.01", 1, { tipoEspecial: "outro" as any })] }), false);
  assert.equal(validarLancamentoPadrao(padrao({ partidas: [{ conta: "1.1.03", valorCentavos: 1 }] })), false, "partida na mesma conta do lado único");
});

// ------------------------------------------------------------------ encerramento
const doAno = aprovar([
  lcto("r1", "2026-03-10", "1.1.01", "3.1.01", 10000),
  lcto("r2", "2026-07-10", "1.1.02", "3.1.01", 2500.55),
  lcto("d1", "2026-04-10", "4.1.01", "1.1.01", 3000),
  lcto("d2", "2026-09-10", "4.1.02", "1.1.01", 1200.1),
]);
const nat = naturezasDasContas(contas);
test("encerramento: zera cada conta de resultado contra Lucros Acumulados, centavo a centavo", () => {
  assert.equal(contaApuracaoPadrao(contas)?.codigo, "2.1.02");
  const calc = calcularEncerramento({ contas, lancamentos: doAno, ano: 2026, contaDestino: "2.1.02", naturezaEcd: nat });
  assert.ok(!ehErro(calc));
  if (ehErro(calc)) return;
  assert.equal(calc.resultadoCentavos, 1250055 - 300000 - 120010); // 8.300,45 de lucro
  const lote = montarLoteEncerramento(calc, 2026, { loteId: "ENC", novoId });
  assert.equal(lote.length, 3);
  assert.ok(lote.every((l) => l.data === "2026-12-31" && l.tipoEspecial === "encerramento" && l.statusManual === "pendente_aprovacao" && l.loteId === "ENC"));
  const receita = lote.find((l) => l.contaDebitoCodigo === "3.1.01")!;
  assert.deepEqual([receita.contaCreditoCodigo, receita.valor], ["2.1.02", 12500.55]);
  const aluguel = lote.find((l) => l.contaCreditoCodigo === "4.1.01")!;
  assert.deepEqual([aluguel.contaDebitoCodigo, aluguel.valor], ["2.1.02", 3000]);
  // depois de aprovado: balancete com resultado zerado e lucro no PL; DRE (resultadoDoPeriodo) sem o encerramento
  const todos = [...doAno, ...aprovar(lote)];
  const bal = gerarRelatoriosContabeis(contas, todos, "todos").balancete;
  const saldo = (c: string) => { const b = bal.find((x) => x.conta.codigo === c)!; return b.saldoDevedorCentavos - b.saldoCredorCentavos; };
  assert.equal(saldo("3.1.01"), 0); assert.equal(saldo("4.1.01"), 0); assert.equal(saldo("4.1.02"), 0);
  assert.equal(saldo("2.1.02"), -830045);
  let resultadoAno = 0; for (let m = 1; m <= 12; m++) resultadoAno += resultadoDoPeriodo(contas, todos, `2026-${String(m).padStart(2, "0")}`).resultado;
  assert.equal(resultadoAno, 830045, "a DRE continua mostrando o resultado do ano");
  const dlpa = gerarDlpa(contas, todos, 2026);
  assert.equal(dlpa.resultadoExercicio, 830045);
  assert.equal(dlpa.totalOutros, 0, "o encerramento não entra duas vezes na DLPA");
  assert.equal(semEncerramento(todos).length, doAno.length);
  // o gravado confere; lançamento depois dele não confere
  const ex = encerramentosDoAno(todos, 2026);
  assert.equal(ex.ativos.length, 1);
  assert.equal(encerramentoGravadoConfere(calc, ex.ativos), true);
  const depois = [...todos, ...aprovar([lcto("d3", "2026-12-20", "4.1.01", "1.1.01", 10)])];
  const calc2 = calcularEncerramento({ contas, lancamentos: depois, ano: 2026, contaDestino: "2.1.02", naturezaEcd: nat });
  assert.ok(!ehErro(calc2) && !encerramentoGravadoConfere(calc2, encerramentosDoAno(depois, 2026).ativos));
});
test("encerramento: recusa com pendência no ano, destino de resultado ou sem saldo", () => {
  assert.ok(ehErro(calcularEncerramento({ contas, lancamentos: [...doAno, lcto("p", "2026-05-01", "4.1.01", "1.1.01", 1, { statusManual: "pendente_aprovacao" })], ano: 2026, contaDestino: "2.1.02", naturezaEcd: nat })));
  assert.ok(ehErro(calcularEncerramento({ contas, lancamentos: doAno, ano: 2026, contaDestino: "3.1.01", naturezaEcd: nat })));
  assert.ok(ehErro(calcularEncerramento({ contas, lancamentos: doAno, ano: 2025, contaDestino: "2.1.02", naturezaEcd: nat })));
});
test("estorno do lote: pares invertidos na mesma data, novo lote, pendentes; anula o encerramento quando aprovado", () => {
  const calc = calcularEncerramento({ contas, lancamentos: doAno, ano: 2026, contaDestino: "2.1.02", naturezaEcd: nat });
  if (ehErro(calc)) throw new Error(calc.erro);
  const lote = aprovar(montarLoteEncerramento(calc, 2026, { loteId: "ENC2", novoId }));
  assert.ok(ehErro(montarEstornoLote(montarLoteEncerramento(calc, 2026, { loteId: "P", novoId }), { loteId: "E", novoId })), "pendente não se estorna");
  const est = montarEstornoLote(lote, { loteId: "EST", novoId }) as LancamentoContabil[];
  assert.ok(est.every((e, i) => e.data === "2026-12-31" && e.estornoDe === lote[i].id && e.contaDebitoCodigo === lote[i].contaCreditoCodigo && e.loteId === "EST" && e.tipoEspecial === "encerramento" && e.statusManual === "pendente_aprovacao"));
  const todos = [...doAno, ...lote, ...aprovar(est)];
  const ex = encerramentosDoAno(todos, 2026);
  assert.deepEqual([ex.ativos.length, ex.estornados.length], [0, 1]);
  const bal = gerarRelatoriosContabeis(contas, todos, "todos").balancete;
  assert.equal(bal.find((x) => x.conta.codigo === "2.1.02")!.saldoCredorCentavos, 0);
});
test("ECD: com o encerramento gravado o arquivo é o mesmo (um só I200 tipo E) e avisa que conferiu; desatualizado vira erro", () => {
  const param: ParametrosECD = { ano: 2026, nomeEmpresarial: "EMPRESA TESTE LTDA", cnpj: "11.222.333/0001-81", uf: "MG", possuiNire: true, nire: "31123456789", dataArquivamentoAtos: "2015-01-01", municipio: "BELO HORIZONTE", numeroLivro: 1, naturezaLivro: "DIARIO GERAL", contaResultadoCodigo: "2.1.02",
    signatarios: [{ nome: "FULANO", documento: "529.982.247-25", qualificacao: "Administrador", codigo: "205", responsavelLegal: true }, { nome: "BELTRANO", documento: "111.444.777-35", qualificacao: "Contador", codigo: "900", crc: "MG-12345", email: "a@b.com", fone: "31999999999", ufCrc: "MG", certidaoCrc: "MG/2026/1", dataCrc: "2026-01-02", responsavelLegal: false }] };
  const sem = gerarArquivoECD({ parametros: param, contas, lancamentos: gerarRelatoriosContabeis(contas, doAno, "todos").validos });
  assert.deepEqual(sem.erros, []);
  const calc = calcularEncerramento({ contas, lancamentos: doAno, ano: 2026, contaDestino: "2.1.02", naturezaEcd: nat });
  if (ehErro(calc)) throw new Error(calc.erro);
  const enc = aprovar(montarLoteEncerramento(calc, 2026, { loteId: "ENC3", novoId }));
  const com = gerarArquivoECD({ parametros: param, contas, lancamentos: gerarRelatoriosContabeis(contas, [...doAno, ...enc], "todos").validos });
  assert.deepEqual(com.erros, []);
  assert.equal(com.conteudo, sem.conteudo, "mesmo arquivo: o encerramento gravado não vira lançamento N nem duplica o E");
  assert.equal(com.conteudo!.split("\r\n").filter((l) => /^\|I200\|\d+\|31122026\|[^|]+\|E\|/.test(l)).length, 1);
  assert.ok(com.avisos.some((a) => /confere com o lançamento de encerramento/.test(a)));
  const desatualizado = gerarArquivoECD({ parametros: param, contas, lancamentos: gerarRelatoriosContabeis(contas, [...doAno, ...enc, ...aprovar([lcto("x", "2026-12-30", "4.1.01", "1.1.01", 5)])], "todos").validos });
  assert.ok(desatualizado.erros.some((e) => /não bate com os saldos atuais/.test(e)));
});
test("robô do encerramento: avisa, prepara só com jan–nov fechados e dezembro aberto, e confere o gravado", () => {
  const ws = { contas, lancamentos: doAno };
  assert.equal(planejarEncerramento(ws, 2026, new Set()).acao, "avisar");
  const fechadas = new Set(Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
  const p = planejarEncerramento(ws, 2026, fechadas);
  assert.equal(p.acao, "preparar"); assert.equal(p.lote!.length, 3);
  assert.equal(planejarEncerramento(ws, 2026, new Set([...fechadas, "2026-12"])).acao, "avisar");
  const comGravado = { contas, lancamentos: [...doAno, ...aprovar(p.lote!)] };
  assert.equal(planejarEncerramento(comGravado, 2026, fechadas).acao, "nada");
  assert.equal(planejarEncerramento({ contas, lancamentos: [...comGravado.lancamentos, ...aprovar([lcto("y", "2026-12-15", "1.1.01", "3.1.01", 1)])] }, 2026, new Set()).acao, "avisar");
  assert.equal(planejarEncerramento({ contas, lancamentos: [] }, 2026, new Set()).acao, "nada");
});
