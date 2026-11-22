// Contrato Fiscal → Contábil do Lucro Real (PIS/COFINS não cumulativos): o Contábil tem de aceitar os tributos ANTES de o Fiscal mandar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ORIGEM_POR_TRIBUTO, IDS_ORIGEM } from "../../src/utils/origensContabeis";

const raiz = path.resolve(new URL("../..", import.meta.url).pathname);
const TRIB = ["PIS_NAO_CUMULATIVO", "COFINS_NAO_CUMULATIVA", "PIS_NC_CREDITO", "COFINS_NC_CREDITO"];

test("tributos do PIS/COFINS não cumulativos: aceitos, com origem de contas e orientação na tela", () => {
  const store = fs.readFileSync(path.join(raiz, "src/server/apuracoesFiscaisStore.ts"), "utf8");
  const tela = fs.readFileSync(path.join(raiz, "src/components/tabs/RevisaoOrigensTab.tsx"), "utf8");
  for (const t of TRIB) {
    assert.match(store, new RegExp(`"${t}"`), t);
    const origem = ORIGEM_POR_TRIBUTO[t];
    assert.ok(origem && IDS_ORIGEM.has(origem), t);
    assert.match(tela, new RegExp(`id: "${origem}"`), origem);
  }
});
