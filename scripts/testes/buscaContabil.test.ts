import test from "node:test";
import assert from "node:assert/strict";
import { filtrarItensBusca } from "../../src/utils/filtrarBusca";

const itens = [
  { id: "m1", rotulo: "Livros Fiscais & ECD", tipo: "Módulo", palavras: "livro diario razao ecd balanco patrimonial dre" },
  { id: "a1", rotulo: "DRE (Demonstração do Resultado)", tipo: "Assunto", palavras: "dre resultado exercicio lucro prejuizo" },
  { id: "m2", rotulo: "Cadastro de Empresa", tipo: "Módulo", palavras: "empresas cnpj cadastrar certificado" },
  { id: "m3", rotulo: "Plano de Contas", tipo: "Módulo", palavras: "contas contabeis saldo inicial" },
  { id: "c1", rotulo: "1.1.01 · Caixa", tipo: "Conta" },
];

test("Busca do Contábil acha por assunto e sinônimo, sem acento", () => {
  assert.ok(filtrarItensBusca(itens, "balanço").some((i) => i.id === "m1"));
  assert.equal(filtrarItensBusca(itens, "dre")[0].id, "a1");
  assert.ok(filtrarItensBusca(itens, "saldo inicial").some((i) => i.id === "m3"));
  assert.ok(filtrarItensBusca(itens, "caixa").some((i) => i.id === "c1"));
});

test("Busca do Contábil: palavra curta não acha no meio de outra e sem texto mostra os módulos", () => {
  assert.equal(filtrarItensBusca(itens, "das").length, 0);
  assert.deepEqual(filtrarItensBusca(itens, "").map((i) => i.tipo), ["Módulo", "Módulo", "Módulo"]);
});
