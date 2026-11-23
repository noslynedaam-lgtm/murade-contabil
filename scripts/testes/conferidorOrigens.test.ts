import test from "node:test";
import assert from "node:assert/strict";
import { montarWorkspaceInicialContabil } from "../../src/utils/workspaceInicial";
import { fiscalAutorizado, gerarRascunhosFiscal, notaSemValor, notasSemValorDoCnpj, referenciaDaNotaFiscal } from "../../src/server/prepararRascunhosContabeis";
import { contasDoRascunhoConferem } from "../../src/utils/contasRascunhoFiscal";
import { chavesParaReenviar, mesesSemDas, conferirEmpresaOrigens, rodarConferenciaOrigens, andamentoOrigens, tabelaFolhas, tabelaNotas, type DepsConferidorOrigens } from "../../src/server/conferidorOrigens";
import { contasParaCompletarPlano, mesmoGrupo, podeCompletarSozinho } from "../../src/utils/completarPlanoPadrao";
import { estornoJaFeito } from "../../src/server/authContabil";
import { cnpjsValidosDoFiscal } from "../../src/server/empresasDoFiscal";

const MURAD = "15267243000168";
const MORAIS = "67201565000108";
const SOUSA = "30660649000108";
const FERRAGISTA = "11497078000180";
const nfse = (cnpj: string, chave: string, numero: string, valor: number, status: string, extra: Record<string, unknown> = {}) => ({
  cnpjEmpresa: cnpj, tipo: "Saída", modelo: "NFS-e Municipal", chaveAcesso: chave, id: `nfse-${numero}`, numero, dataEmissao: "05/11/2026", valorTotal: valor,
  statusSefaz: status, statusVerificadoSefaz: true, dadosTributariosDisponiveis: true, ...extra,
});
// Casos reais: Murad NFS-e nº 1 (R$ 9.695,51) substituída pela nº 2; Morais NFS-e nº 3 (R$ 14.601,23) substituída pela nº 4.
const MURAD_1 = nfse(MURAD, "52087072215267243000168000000000000126116651646911", "1", 9695.51, "Cancelada", { substituidaPor: "52087072215267243000168000000000000226113395966672" });
const MURAD_2 = nfse(MURAD, "52087072215267243000168000000000000226113395966672", "2", 9695.51, "Autorizada", { substituiNfse: "52087072215267243000168000000000000126116651646911" });
const MORAIS_3 = nfse(MORAIS, "52087072267201565000108000000000000326113268242441", "3", 14601.23, "Cancelada");

test("nota sem valor: cancelada, substituída, denegada e inutilizada saem; a substituta e a autorizada valem", () => {
  assert.equal(notaSemValor(MURAD_1), true);
  assert.equal(notaSemValor(MURAD_2), false);
  assert.equal(notaSemValor(MORAIS_3), true);
  assert.equal(notaSemValor({ statusSefaz: "Denegada" }), true);
  assert.equal(notaSemValor({ statusSefaz: "Inutilizada" }), true);
  assert.equal(fiscalAutorizado(MURAD_1), false);
  assert.equal(fiscalAutorizado(MURAD_2), true);
  const lista = notasSemValorDoCnpj(MURAD, [MURAD_1, MURAD_2]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].referencia, `FISCAL:${MURAD}:2026-11:Saida:${MURAD_1.chaveAcesso}`);
  assert.equal(lista[0].valor, 9695.51);
  assert.equal(lista[0].motivo, "substituída por outra NFS-e");
  assert.equal(notasSemValorDoCnpj(MORAIS, [MORAIS_3])[0].valor, 14601.23);
});

test("NFS-e do ambiente nacional 'Autorizada' conferida entra na receita de serviços; a NFC-e com Caixa e a NFS-e passam na gravação", () => {
  const ws = montarWorkspaceInicialContabil({ cnpj: SOUSA, regime: "Simples Nacional" }) as any;
  const r = gerarRascunhosFiscal(SOUSA, [nfse(SOUSA, "52087072230660649000108000000000000126112825748647", "1", 5450, "Autorizada")], ws.contas, ws.mapeamentosOrigem, "2026-11-23T00:00:00Z", true);
  assert.equal(r.length, 1);
  assert.equal(r[0].contaCreditoCodigo, "3.1.02.01.01");
  assert.equal(r[0].valor, 5450);
  const mapa = ws.mapeamentosOrigem.find((m: any) => m.origem === "fiscal_saida");
  assert.equal(contasDoRascunhoConferem(r[0], mapa, ws.contas), true, "a gravação e a aprovação aceitam a NFS-e na receita de serviços");
  // Plano curto da Ferragista: NFC-e debita o Caixa 1.1.1 (antes a gravação descartava em silêncio — 50 NFC-e de 10/2026).
  const contas = [{ codigo: "1.1.1", descricao: "Caixa e Equivalentes de Caixa", tipo: "analitica" }, { codigo: "1.1.5", descricao: "Clientes", tipo: "analitica" }, { codigo: "4.1.1", descricao: "Receita de Venda de Mercadorias", tipo: "analitica" }];
  const maps = [{ origem: "fiscal_saida", contaDebitoCodigo: "1.1.5", contaCreditoCodigo: "4.1.1" }];
  const nfce = { cnpjEmpresa: FERRAGISTA, tipo: "Saída", modelo: "65 - NFC-e", chaveAcesso: "52261011497078000180650010000000011000000019", dataEmissao: "05/10/2026", valorTotal: 37.9, statusSefaz: "Autorizada", statusVerificadoSefaz: true, dadosTributariosDisponiveis: true };
  const n = gerarRascunhosFiscal(FERRAGISTA, [nfce], contas, maps, "2026-11-23T00:00:00Z", true);
  assert.equal(n[0].contaDebitoCodigo, "1.1.1");
  assert.equal(contasDoRascunhoConferem(n[0], maps[0], contas), true);
});

test("tabela de notas: Fiscal × cópia × Contábil ao centavo; nota sem valor fora; pendência sempre com motivo", () => {
  const ws = montarWorkspaceInicialContabil({ cnpj: MURAD, regime: "Simples Nacional" }) as any;
  const refLancada = referenciaDaNotaFiscal(MURAD, MURAD_1)!;
  ws.lancamentos = [{ id: refLancada, documentoRef: refLancada, contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "3.1.02.01.01", valor: 9695.51, competencia: "2026-11", data: "2026-11-05", historico: "x" }];
  const ref2 = referenciaDaNotaFiscal(MURAD, MURAD_2)!;
  ws.preLancamentos = [{ referenciaOrigem: ref2, status: "pendente_conferencia", valor: 9695.51 }];
  const entradaDevolucao = { cnpjEmpresa: MURAD, tipo: "Entrada", modelo: "55 - NF-e", chaveAcesso: "5".repeat(44), dataEmissao: "10/11/2026", valorTotal: 100.1, statusSefaz: "Autorizada", statusVerificadoSefaz: true, dadosTributariosDisponiveis: true, cfop: "1202" };
  const fiscal = [
    { competencia: "2026-11", tipo: "Saída", validas: { qtd: 1, centavos: 969551 }, semValor: { qtd: 1, centavos: 969551 } },
    { competencia: "2026-11", tipo: "Entrada", validas: { qtd: 1, centavos: 10010 }, semValor: { qtd: 0, centavos: 0 } },
  ];
  const t = tabelaNotas(MURAD, [MURAD_1, MURAD_2, entradaDevolucao], ws, fiscal);
  const saida = t.find((l) => l.tipo === "Saída")!;
  assert.deepEqual(saida.copia, { qtd: 1, centavos: 969551 });
  assert.deepEqual(saida.aConferir, { qtd: 1, centavos: 969551 });
  assert.deepEqual(saida.semValorLancadas, { qtd: 1, centavos: 969551 }, "a nº 1 substituída já lançada vira erro (estorno)");
  assert.equal(saida.situacao, "erro");
  const entrada = t.find((l) => l.tipo === "Entrada")!;
  assert.deepEqual(entrada.pendentes.motivos, { entrada_nao_compra: 1 });
  assert.equal(entrada.situacao, "aviso");
  assert.equal(entrada.semExplicacao.qtd, 0);
  // Nota antiga (antes de 09/2026) sem confirmação: motivo próprio, não erro.
  const antiga = { ...entradaDevolucao, chaveAcesso: "6".repeat(44), tipo: "Saída", dataEmissao: "03/07/2025", statusSefaz: "Pendente", statusVerificadoSefaz: false };
  const t2 = tabelaNotas(MURAD, [antiga], ws, null);
  assert.deepEqual(t2[0].pendentes.motivos, { antes_do_periodo: 1 });
  assert.equal(t2[0].fiscal, null);
});

test("reenvio: só as notas que faltam ou mudaram de situação/valor na cópia", () => {
  const copia = [{ chaveAcesso: "A", valorTotal: 10, statusSefaz: "Autorizada" }, { chaveAcesso: "B", valorTotal: 20, statusSefaz: "Documento recebido" }];
  const doFiscal = [
    { chave: "A", competencia: "2026-11", tipo: "Saída", centavos: 1000, semValor: false, situacao: "Autorizada" },
    { chave: "B", competencia: "2026-11", tipo: "Saída", centavos: 2000, semValor: true, situacao: "Cancelada" },
    { chave: "C", competencia: "2026-11", tipo: "Saída", centavos: 3000, semValor: false, situacao: "Autorizada" },
  ];
  assert.deepEqual(chavesParaReenviar(doFiscal, copia), ["B", "C"]);
});

test("folha: DP × cópia × partidas item a item; folha que não chegou é erro", () => {
  const cnpj = "40957233000100";
  const resumo = { folhaBruta: 1800, descontosINSS: 137.69, fgts: 144, descontosIRRF: 0 };
  const ws = { preLancamentos: [
    { referenciaOrigem: `DP:${cnpj}:2026-11:folhaBruta`, valor: 1800 }, { referenciaOrigem: `DP:${cnpj}:2026-11:descontosINSS`, valor: 137.69 }, { referenciaOrigem: `DP:${cnpj}:2026-11:fgts`, valor: 144 },
  ], lancamentos: [] };
  const f = tabelaFolhas(cnpj, [{ competencia: "2026-11", status: "delivered", resumo }, { competencia: "2026-12", status: "delivered", resumo }], [{ competencia: "2026-11", resumo }], ws);
  const nov = f.find((x) => x.competencia === "2026-11")!;
  assert.deepEqual(nov.dp, { qtd: 3, centavos: 208169 });
  assert.deepEqual(nov.contabil, { qtd: 3, centavos: 208169 });
  assert.equal(nov.situacao, "ok");
  assert.equal(f.find((x) => x.competencia === "2026-12")!.situacao, "erro");
});

test("plano: completa só acrescentando e só nos grupos de mesmo significado (caso da Ferragista)", () => {
  const ferr = [
    ["1", "ATIVO", "sintetica"], ["1.1", "Ativo Circulante", "sintetica"], ["1.1.1", "Caixa e Equivalentes de Caixa", "analitica"],
    ["2", "PASSIVO", "sintetica"], ["2.1", "Passivo Circulante", "sintetica"], ["3", "PATRIMÔNIO LÍQUIDO", "sintetica"], ["4", "RECEITAS", "sintetica"], ["5", "CUSTOS E DESPESAS OPERACIONAIS", "sintetica"],
  ].map(([codigo, descricao, tipo]) => ({ codigo, descricao, tipo }));
  const r = contasParaCompletarPlano(ferr);
  const codigos = new Set(r.acrescentar.map((c) => c.codigo));
  assert.ok(codigos.has("1.1.01.01.01"), "Caixa do padrão entra no Ativo");
  assert.ok(codigos.has("2.1.05.01.09"), "Simples Nacional a Recolher entra no Passivo");
  assert.ok(![...codigos].some((c) => /^[345](\.|$)/.test(c)), "nada nos grupos 3, 4 e 5 (outro significado)");
  assert.ok(![...codigos].some((c) => c.startsWith("2.3")), "não cria um segundo Patrimônio Líquido");
  assert.ok(![...codigos].some((c) => ferr.some((f) => f.codigo === c)), "nenhuma conta existente é repetida");
  assert.deepEqual(r.gruposForaDoPadrao, ["3 PATRIMÔNIO LÍQUIDO", "4 RECEITAS", "5 CUSTOS E DESPESAS OPERACIONAIS"]);
  assert.equal(mesmoGrupo("ATIVO", "Ativo"), true);
  assert.equal(mesmoGrupo("RECEITAS", "Despesas"), false);
  assert.equal(podeCompletarSozinho(36, 0), true);
  assert.equal(podeCompletarSozinho(36, 1), false);
  assert.equal(podeCompletarSozinho(575, 0), false);
  assert.equal(contasParaCompletarPlano(montarWorkspaceInicialContabil({ cnpj: SOUSA }).contas as any).acrescentar.length, 0, "plano padrão já completo");
});

test("estorno já feito: referência ESTORNO: ou contas invertidas com o documento no histórico", () => {
  const ref = `FISCAL:${MORAIS}:2026-11:Saida:${MORAIS_3.chaveAcesso}`;
  const orig = { contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "3.1.02.01.01", valor: 14601.23, referencia: ref };
  assert.equal(estornoJaFeito(orig, []), false);
  assert.equal(estornoJaFeito(orig, [{ documentoRef: `ESTORNO:${ref}` }]), true);
  assert.equal(estornoJaFeito(orig, [{ contaDebitoCodigo: "3.1.02.01.01", contaCreditoCodigo: "1.1.04.01.01", valor: 14601.23, historico: `Estorno NFS-e ${MORAIS_3.chaveAcesso}` }]), true);
  assert.equal(estornoJaFeito(orig, [{ contaDebitoCodigo: "3.1.02.01.01", contaCreditoCodigo: "1.1.04.01.01", valor: 14601.22, historico: `Estorno ${MORAIS_3.chaveAcesso}` }]), false, "um centavo de diferença não é estorno");
});

test("regime do Fiscal chega ao Contábil, inclusive MEI", () => {
  const r = cnpjsValidosDoFiscal([{ cnpj: SOUSA, regime: "Simples Nacional" }, { cnpj: "44167822000137", regime: "MEI" }], () => true);
  assert.deepEqual(r.map((x) => x.dados.regime), ["Simples Nacional", "MEI"]);
});

function depsFalsos(extra: Partial<DepsConferidorOrigens> = {}) {
  const ws = montarWorkspaceInicialContabil({ cnpj: SOUSA, regime: "Simples Nacional", razaoSocial: "SOUSA E FROTA" }) as any;
  const copia = [nfse(SOUSA, "C1", "1", 5450, "Documento recebido", { statusVerificadoSefaz: false })];
  const chamadas = { reenvio: [] as string[][], preparar: 0 };
  const deps: DepsConferidorOrigens = {
    consultar: async () => ({ rows: [], rowCount: 0 }),
    lerWorkspace: async () => ws,
    lerDocumentos: async () => copia,
    resumoFiscal: async (_c, comp) => comp
      ? { ok: true, notas: [{ chave: "C1", competencia: "2026-11", tipo: "Saída", centavos: 545000, semValor: false, situacao: "Autorizada" }, { chave: "C2", competencia: "2026-11", tipo: "Saída", centavos: 520000, semValor: false, situacao: "Autorizada" }] }
      : { ok: true, meses: [{ competencia: "2026-11", tipo: "Saída", validas: { qtd: 2, centavos: 1065000 }, semValor: { qtd: 0, centavos: 0 } }] },
    reenviarFiscal: async (_c, chaves) => { chamadas.reenvio.push(chaves); return { ok: true, reabertas: chaves.length }; },
    preparar: async () => { chamadas.preparar += 1; return { criados: 1, atualizados: 0, retirados: 0, alertasEstorno: 0 }; },
    completarPlano: async () => ({ acrescentadas: 0, gruposForaDoPadrao: [] }),
    ...extra,
  };
  return { deps, chamadas };
}

test("conferir empresa: pede ao Fiscal só a nota que faltou (sem duplicar) e prepara o que faltou", async () => {
  const { deps, chamadas } = depsFalsos();
  const r = await conferirEmpresaOrigens(deps, SOUSA);
  assert.deepEqual(chamadas.reenvio, [["C2"]]);
  assert.equal(chamadas.preparar, 1);
  assert.equal(r.nome, "SOUSA E FROTA");
  assert.ok(r.correcoes.some((c) => c.includes("pedidas de novo ao Fiscal")));
  assert.equal(r.situacao, "erro", "enquanto a nota não chega, a diferença continua aparecendo");
  assert.equal(r.totais.fiscal!.qtd, 2);
});

test("Fiscal fora do ar: confere a parte do Contábil e avisa, sem quebrar", async () => {
  const { deps } = depsFalsos({ resumoFiscal: async () => ({ ok: false, motivo: "o Fiscal não respondeu a tempo" }) });
  const r = await conferirEmpresaOrigens(deps, SOUSA);
  assert.equal(r.fiscalRespondeu, false);
  assert.equal(r.totais.fiscal, null);
  assert.ok(r.avisos.some((a) => a.includes("resumo do Fiscal")));
});

test("rodada: barra de andamento conta as empresas e não deixa rodar duas vezes ao mesmo tempo", async () => {
  const { deps } = depsFalsos();
  const p = rodarConferenciaOrigens(deps, [SOUSA, MURAD, MORAIS], "esc:teste");
  assert.equal(andamentoOrigens("esc:teste").executando, true);
  await assert.rejects(rodarConferenciaOrigens(deps, [SOUSA], "esc:teste"), /já está rodando/);
  const placar = await p;
  assert.equal(placar.empresas, 3);
  const a = andamentoOrigens("esc:teste");
  assert.equal(a.executando, false);
  assert.equal(a.feitas, 3);
  assert.equal(andamentoOrigens("esc:outro").total, 0, "cada escritório tem o próprio andamento");
});

test("DAS: avisa mês encerrado com faturamento e sem DAS confirmado no Fiscal; nunca o mês corrente nem antes de 10/2026", () => {
  const linha = (competencia: string, qtd: number) => ({ competencia, tipo: "Saída", copia: { qtd, centavos: qtd * 100 } }) as any;
  const notas = [linha("2026-09", 3), linha("2026-10", 5), linha("2026-11", 2)];
  assert.deepEqual(mesesSemDas(notas, [], true, "2026-11"), ["2026-10"]);
  assert.deepEqual(mesesSemDas(notas, ["2026-10"], true, "2026-11"), []);
  assert.deepEqual(mesesSemDas(notas, [], false, "2026-11"), [], "fora do Simples não há DAS");
  assert.deepEqual(mesesSemDas([linha("2026-10", 0)], [], true, "2026-11"), [], "mês sem faturamento não cobra DAS aqui");
});
