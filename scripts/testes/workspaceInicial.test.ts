import test from "node:test";
import assert from "node:assert/strict";
import { montarWorkspaceInicialContabil, empresaInicialDoCadastro, planoContasInicialContabil } from "../../src/utils/workspaceInicial";
import { workspaceValido } from "../../src/server/authContabil";
import { gerarRascunhosFiscal } from "../../src/server/prepararRascunhosContabeis";
import { empresasParadas, textoAvisoParadas } from "../../src/server/conferidorEmpresasParadas";
import { contasDasParaCompletar, contasDasSimples, sugerirMapeamentosPadrao } from "../../src/utils/sugestoesContas";
import { gerarRascunhosApuracoes } from "../../src/server/prepararRascunhosContabeis";

const CNPJ = "46570348000115";

test("Workspace inicial: plano padrão do Murad (575 contas, com as do DAS) + 10 mapeamentos padrão, vazio de lançamentos e válido para gravar", () => {
  const ws = montarWorkspaceInicialContabil(empresaInicialDoCadastro(CNPJ, { razaoSocial: "NOITE BELA STORE LTDA", regime: "Simples Nacional", uf: "GO", municipio: "GOIANIA", nomeFantasia: "" }), "2026-11-22T00:00:00.000Z");
  assert.equal(ws.contas.length, planoContasInicialContabil().length);
  assert.equal(ws.contas.length, 575);
  assert.equal(ws.mapeamentosOrigem.length, 10);
  const das = ws.mapeamentosOrigem.find((m) => m.origem === "fiscal_das_simples")!;
  assert.deepEqual([das.contaDebitoCodigo, das.contaCreditoCodigo], ["4.3.06.01.01", "2.1.05.01.09"]);
  // Sem conta de caixa/banco já mapeada, pagamento e multa/juros do DAS ficam para a pessoa escolher (nunca chuta o banco).
  assert.ok(!ws.mapeamentosOrigem.some((m) => m.origem === "fiscal_das_simples_pago" || m.origem === "fiscal_das_simples_encargos"));
  assert.equal(ws.lancamentos.length, 0);
  assert.equal(ws.preLancamentos.length, 0);
  assert.ok(workspaceValido(ws), "o servidor precisa aceitar o workspace inicial");
});

test("Cadastro do Fiscal → empresa do workspace: só leva campos preenchidos (não apaga o que a pessoa digitou na tela)", () => {
  const e = empresaInicialDoCadastro(CNPJ, { razaoSocial: " NOITE BELA ", nomeFantasia: "", regime: "Simples Nacional", senha: "x" } as any);
  assert.deepEqual(e, { cnpj: CNPJ, razaoSocial: "NOITE BELA", regime: "Simples Nacional", certificadoAtivo: false });
  assert.deepEqual(empresaInicialDoCadastro(CNPJ, null), { cnpj: CNPJ, certificadoAtivo: false });
});

test("Com o workspace inicial, uma nota autorizada do Fiscal já vira pré-lançamento (pendente de conferência)", () => {
  const ws = montarWorkspaceInicialContabil({ cnpj: CNPJ, regime: "Simples Nacional" });
  const nota = { cnpjEmpresa: CNPJ, tipo: "Saída", chaveAcesso: "52261146570348000115550010000001231000001234", dataEmissao: "2026-10-15", valorTotal: 150.5,
    statusSefaz: "Autorizada", statusVerificadoSefaz: true, dadosTributariosDisponiveis: true, valorIcms: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, cfop: "5102" };
  const r = gerarRascunhosFiscal(CNPJ, [nota], ws.contas as any, ws.mapeamentosOrigem as any, "2026-11-22T00:00:00.000Z", true);
  assert.equal(r.length, 1);
  assert.equal(r[0].valor, 150.5);
});

test("Conferidor de empresa parada: sem workspace, sem mapeamento ou com notas e nenhum pré-lançamento", () => {
  const p = empresasParadas([
    { cnpj: "1", temWorkspace: false, temMapeamento: false, notasProntas: 119, folhasRecebidas: 0, preLancamentos: 0 },
    { cnpj: "2", temWorkspace: true, temMapeamento: true, notasProntas: 10, folhasRecebidas: 1, preLancamentos: 0 },
    { cnpj: "3", temWorkspace: true, temMapeamento: true, notasProntas: 10, folhasRecebidas: 0, preLancamentos: 8 },
    { cnpj: "4", temWorkspace: true, temMapeamento: true, notasProntas: 0, folhasRecebidas: 0, preLancamentos: 0 },
    { cnpj: "5", temWorkspace: true, temMapeamento: false, notasProntas: 3, folhasRecebidas: 0, preLancamentos: 0 },
  ]);
  assert.deepEqual(p.map((x) => x.cnpj), ["1", "2", "5"]);
  assert.match(p[0].motivo, /sem workspace.*119 nota/);
  assert.match(textoAvisoParadas(p), /1 empresa\(s\) sem workspace.*2 empresa\(s\) com dados do Fiscal/);
});

const planoAntigo572 = () => planoContasInicialContabil().filter((c) => !["2.1.05.01.09", "4.3.06.01", "4.3.06.01.01"].includes(c.codigo));

test("DAS em plano antigo (572): só ACRESCENTA as 3 contas que faltam, nos grupos certos", () => {
  const antigo = planoAntigo572();
  assert.equal(antigo.length, 572);
  const novas = contasDasParaCompletar(antigo);
  assert.deepEqual(novas.map((c) => c.codigo), ["2.1.05.01.09", "4.3.06.01", "4.3.06.01.01"]);
  assert.deepEqual(novas.map((c) => c.natureza), ["C", "D", "D"]);
  // Plano que já tem as contas (padrão novo): nada a acrescentar.
  assert.equal(contasDasParaCompletar(planoContasInicialContabil()).length, 0);
});

test("DAS: conta de Simples Nacional já criada pela equipe (outro código) é usada e nada é criado", () => {
  const plano = [...planoAntigo572(), { codigo: "2.1.05.01.20", descricao: "Simples Nacional a Pagar", nivel: 5, tipo: "analitica", natureza: "C" } as any, { codigo: "3.2.01.01.09", descricao: "Simples Nacional sobre vendas", nivel: 5, tipo: "analitica", natureza: "D" } as any];
  assert.equal(contasDasParaCompletar(plano).length, 0);
  const s = sugerirMapeamentosPadrao(plano, [], "x").find((m) => m.origem === "fiscal_das_simples")!;
  assert.deepEqual([s.contaDebitoCodigo, s.contaCreditoCodigo], ["3.2.01.01.09", "2.1.05.01.20"]);
});

test("DAS: código ocupado por outra conta ou duas candidatas → não cria nem mapeia (nunca adivinha)", () => {
  const ocupado = [...planoAntigo572(), { codigo: "2.1.05.01.09", descricao: "ICMS ST a Recolher", nivel: 5, tipo: "analitica", natureza: "C" } as any];
  assert.ok(!contasDasParaCompletar(ocupado).some((c) => c.codigo === "2.1.05.01.09"));
  const duas = [...planoContasInicialContabil(), { codigo: "2.1.05.01.30", descricao: "Simples Nacional a Recolher - Parcelamento", nivel: 5, tipo: "analitica", natureza: "C" } as any];
  assert.equal(contasDasSimples(duas).aRecolher, null);
  assert.ok(!sugerirMapeamentosPadrao(duas, [], "x").some((m) => m.origem === "fiscal_das_simples"));
});

test("DAS: mapeamento existente nunca é alterado; pagamento usa a conta de banco que a empresa já mapeou", () => {
  const plano = planoContasInicialContabil();
  const existentes = [{ origem: "fiscal_das_simples", contaDebitoCodigo: "4.3.06.01.01", contaCreditoCodigo: "2.1.05.01.08" }, { origem: "outra", contaDebitoCodigo: "1.1.01.02.01", contaCreditoCodigo: "1.1.04.01.01" }];
  const s = sugerirMapeamentosPadrao(plano, existentes, "x");
  assert.ok(!s.some((m) => m.origem === "fiscal_das_simples"));
  const pago = s.find((m) => m.origem === "fiscal_das_simples_pago")!;
  assert.deepEqual([pago.contaDebitoCodigo, pago.contaCreditoCodigo], ["2.1.05.01.08", "1.1.01.02.01"]);
  const enc = s.find((m) => m.origem === "fiscal_das_simples_encargos")!;
  assert.deepEqual([enc.contaDebitoCodigo, enc.contaCreditoCodigo], ["4.5.04.01.01", "1.1.01.02.01"]);
});

test("DAS confirmado no Fiscal vira pré-lançamento D despesa do Simples / C Simples a recolher, no último dia da competência", () => {
  const ws = montarWorkspaceInicialContabil({ cnpj: "44167822000137", regime: "Simples Nacional" });
  const r = gerarRascunhosApuracoes("44167822000137", [{ cnpj: "44167822000137", tributo: "DAS_SIMPLES", competencia: "2026-10", situacao: "confirmado", valorCentavos: 450000, baseCentavos: 10000000, referencia: "DAS:apuracao:2026-10", versaoOrigem: "decl:1", origem: "Murad Fiscal" } as any], ws.contas as any, ws.mapeamentosOrigem as any, "x");
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].contaDebitoCodigo, r[0].contaCreditoCodigo, r[0].data], ["4.3.06.01.01", "2.1.05.01.09", "2026-10-31"]);
});

test("Conferidor: DAS recebido sem mapeamento do DAS aparece como parado", () => {
  const p = empresasParadas([{ cnpj: "9", temWorkspace: true, temMapeamento: true, notasProntas: 0, folhasRecebidas: 0, preLancamentos: 0, dasRecebidos: 1, temMapeamentoDas: false }]);
  assert.match(p[0].motivo, /DAS/);
});
