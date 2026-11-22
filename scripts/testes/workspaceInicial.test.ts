import test from "node:test";
import assert from "node:assert/strict";
import { montarWorkspaceInicialContabil, empresaInicialDoCadastro, planoContasInicialContabil } from "../../src/utils/workspaceInicial";
import { workspaceValido } from "../../src/server/authContabil";
import { gerarRascunhosFiscal } from "../../src/server/prepararRascunhosContabeis";
import { empresasParadas, textoAvisoParadas } from "../../src/server/conferidorEmpresasParadas";

const CNPJ = "46570348000115";

test("Workspace inicial: plano padrão do Murade (572 contas) + 9 mapeamentos padrão, vazio de lançamentos e válido para gravar", () => {
  const ws = montarWorkspaceInicialContabil(empresaInicialDoCadastro(CNPJ, { razaoSocial: "NOITE BELA STORE LTDA", regime: "Simples Nacional", uf: "GO", municipio: "GOIANIA", nomeFantasia: "" }), "2026-11-22T00:00:00.000Z");
  assert.equal(ws.contas.length, planoContasInicialContabil().length);
  assert.equal(ws.contas.length, 572);
  assert.equal(ws.mapeamentosOrigem.length, 9);
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
  assert.match(textoAvisoParadas(p), /1 empresa\(s\) sem workspace.*2 empresa\(s\) com notas/);
});
