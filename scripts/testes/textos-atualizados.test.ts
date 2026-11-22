// Textos da tela não podem dizer que o sistema "ainda não faz" o que ele já faz (levantamento de 20/11/2026).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (c: string) => readFileSync(c, "utf8");

test("Lançamentos: não diz mais que as integrações não geram partidas nem mostra botões falsos de indisponível", () => {
  const t = ler("src/components/tabs/LancamentosTab.tsx");
  assert.doesNotMatch(t, /ainda não geram partidas/);
  assert.doesNotMatch(t, /importação contábil indisponível|folha ainda não disponível|Automação contábil não habilitada/);
  assert.match(t, /Robô Reconciliador prepara sozinho os pré-lançamentos/);
  const app = ler("src/App.tsx");
  assert.doesNotMatch(app, /Integração com o módulo Fiscal não configurada/);
  assert.doesNotMatch(app, /Integração com Departamento Pessoal não configurada/);
});

test("Livros: a conferência da ECD reconhece que o gerador monta J900/J930 e o TXT", () => {
  const t = ler("src/components/tabs/LivrosTab.tsx");
  assert.doesNotMatch(t, /os registros e termos próprios do leiaute ECD ainda não são montados/);
  assert.doesNotMatch(t, /O Murad ainda não gera esse TXT/);
  assert.match(t, /termo de encerramento \(J900\)/);
  assert.match(t, /signatários \(J930\)/);
});

test("Preparar obrigação: não diz mais que a ECD não é gerada", () => {
  const t = ler("src/components/modals/ObrigacoesModals.tsx");
  assert.doesNotMatch(t, /Preparação SPED indisponível/);
  assert.doesNotMatch(t, /geração de ECD\/SPED e a validação pelo PVA não estão integradas/);
  assert.match(t, /O arquivo da ECD é gerado na tela Livros Fiscais/);
});

test("ecdService: o comentário do escopo não diz mais que o J210 fica de fora", () => {
  const t = ler("src/services/ecdService.ts").split("\n").slice(0, 10).join("\n");
  assert.doesNotMatch(t, /NÃO gera: DLPA\/DMPL \(J210\)/);
  assert.match(t, /J210\/J215/);
});
