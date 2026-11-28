// Sincronia do cadastro da empresa (27/11/2026), lado do Contábil: recebe do Fiscal (cria só se faltar, completa só o vazio,
// nunca toma empresa de outro escritório) e manda ao Fiscal o cadastro salvo aqui (fila + conferidor). Dados fictícios.
import test from "node:test";
import assert from "node:assert/strict";
import { receberCadastroNoContabil, contabilParaComum, comumParaContabil, fichaParaContabil, soVaziosContabil, conferirCadastroContabilFiscal, cadastroMudou } from "../../src/server/sincroniaCadastroContabil";
import { montarFicha, dadosLidosDe } from "../../src/server/cadastroPorDocumento";
import { criarBancoFalso } from "./apoio/bancoFalsoSincronia";

const CNPJ = "11222333000181";
function cenario(acessos: Array<{ uid: string; dono: string | null }>, empresa: any) {
  const estado = { empresa: empresa ? { ...empresa } : null as any, importou: 0 };
  const b = criarBancoFalso([
    (sql) => (/FROM contabil_auth_company_access a JOIN contabil_auth_users u/.test(sql) ? { rows: acessos } : undefined),
    (sql) => (/FROM contabil_empresas_compartilhadas WHERE cnpj=\$1/.test(sql) ? { rows: [] } : undefined),
  ]);
  const deps = {
    consultar: b.consultar,
    donoPorLogin: async (l: string) => (l === "escritorio1" ? "u1" : null),
    importar: async () => { estado.importou++; if (!acessos.length) { acessos.push({ uid: "u1", dono: null }); estado.empresa = {}; return { criadas: [CNPJ], jaExistiam: 0, semEscritorio: [] }; } return { criadas: [], jaExistiam: 1, semEscritorio: [] }; },
    alterarEmpresaDoWorkspace: async (_c: string, alterar: (e: any) => any) => { if (!estado.empresa) throw new Error("sem workspace"); const n = alterar(estado.empresa); if (n) estado.empresa = n; return n; },
  };
  return { b, estado, deps };
}

test("Contábil: empresa antiga que não existe aqui não é criada; a NOVA é criada (uma vez) e completa o resto", async () => {
  const c = cenario([], null);
  const naoNova = await receberCadastroNoContabil(c.deps, { cnpj: CNPJ, escritorio: "escritorio1", donoSistema: false, origem: "dp", dados: { razaoSocial: "PADARIA PAO BOM LTDA" } });
  assert.equal(naoNova.vinculada, false, "empresa antiga que não existe aqui: não cria");
  assert.equal(c.estado.importou, 0);
  const r = await receberCadastroNoContabil(c.deps, { cnpj: CNPJ, escritorio: "escritorio1", donoSistema: false, origem: "dp", criar: true, dados: { razaoSocial: "PADARIA PAO BOM LTDA", inscricaoEstadual: "101234567", cidade: "GOIANIA", uf: "GO" } });
  assert.equal(r.criada, true);
  assert.equal(c.estado.empresa.inscricaoEstadual, "101234567");
  assert.equal(c.estado.empresa.cidadeUf, "GOIANIA / GO");
  const r2 = await receberCadastroNoContabil(c.deps, { cnpj: CNPJ, escritorio: "escritorio1", donoSistema: false, origem: "dp", criar: true, dados: { razaoSocial: "PADARIA PAO BOM LTDA" } });
  assert.equal(r2.criada, false, "não duplica");
});

test("Contábil: existente do mesmo escritório só completa o vazio; diferença vira aviso; outro escritório não é tocado", async () => {
  const c = cenario([{ uid: "u1", dono: null }], { razaoSocial: "PADARIA PAO BOM LTDA", inscricaoEstadual: "101234567", email: "", municipio: "Goiânia", uf: "GO" });
  const r = await receberCadastroNoContabil(c.deps, { cnpj: CNPJ, escritorio: "escritorio1", donoSistema: false, origem: "fiscal", dados: { inscricaoEstadual: "109999999", email: "contato@paobom.com.br", cidade: "GOIANIA" } });
  assert.deepEqual(r.preenchidos, ["email"]);
  assert.equal(c.estado.empresa.inscricaoEstadual, "101234567");
  assert.equal(r.divergencias, 1);
  const o = cenario([{ uid: "u9", dono: null }], { razaoSocial: "X", email: "" });
  const r3 = await receberCadastroNoContabil(o.deps, { cnpj: CNPJ, escritorio: "escritorio1", donoSistema: false, origem: "fiscal", dados: { email: "a@b.com.br" } });
  assert.equal(r3.vinculada, false);
  assert.equal(o.estado.importou, 0);
  assert.equal(o.estado.empresa.email, "");
});

test("Contábil → Fiscal: conferidor manda o que o Fiscal não tem e não repete o que já foi", async () => {
  const b = criarBancoFalso();
  let empresa: any = { razaoSocial: "PADARIA PAO BOM LTDA", municipio: "GOIANIA", uf: "GO" };
  const enviados: string[] = [];
  const deps = { consultar: b.consultar, lerCadastro: async () => empresa, enviar: async (i: any) => { enviados.push(i.escritorio); return { ok: true, motivo: "ok" }; }, empresasComEscritorio: async () => [{ cnpj: CNPJ, escritorio: "escritorio1" }] };
  assert.equal((await conferirCadastroContabilFiscal(deps)).enfileiradas, 1);
  assert.equal((await conferirCadastroContabilFiscal(deps)).enfileiradas, 0);
  empresa = { ...empresa, inscricaoMunicipal: "98765" };
  assert.equal((await conferirCadastroContabilFiscal(deps)).enfileiradas, 1);
  assert.deepEqual(enviados, ["escritorio1", "escritorio1"]);
  assert.equal(cadastroMudou({ razaoSocial: "A", lancamentos: [1] }, { razaoSocial: "A", lancamentos: [2] }), false);
});

test("ficha (cadastro por foto) → Contábil; só vazios na empresa existente; mapeamento comum", () => {
  const f = montarFicha(dadosLidosDe({ cnpj: CNPJ, razaoSocial: "PADARIA PAO BOM LTDA", cidade: "GOIANIA", uf: "GO", socios: [{ nome: "JOSE FICTICIO", qualificacao: "Sócio-Administrador" }] }), null);
  const e = fichaParaContabil(f);
  assert.equal(e.cidadeUf, "GOIANIA / GO");
  assert.equal(e.qsa[0].nome, "JOSE FICTICIO");
  assert.deepEqual(soVaziosContabil({ razaoSocial: "OUTRA", qsa: [] }, e).razaoSocial, undefined);
  assert.equal(soVaziosContabil({ razaoSocial: "OUTRA", qsa: [] }, e).qsa.length, 1);
  assert.equal(contabilParaComum({ cidadeUf: "Goiânia / GO" }).cidade, "Goiânia");
  assert.deepEqual(comumParaContabil({ regimeTributario: "MEI", cidade: "GOIANIA" }, { uf: "GO" }), { regime: "MEI", municipio: "GOIANIA", cidadeUf: "GOIANIA / GO" });
});

test("Contábil → Fiscal: conferidor nunca pede para criar; empresa nova vai com criarAqui e empresaNova", async () => {
  const { criarEnvioContabilParaFiscal, enfileirarCadastroContabil, rodarEnvioCadastroContabil } = await import("../../src/server/sincroniaCadastroContabil");
  const b = criarBancoFalso();
  const corpos: any[] = [];
  const enviar = criarEnvioContabilParaFiscal(async () => ({ razaoSocial: "X LTDA" }), { MURADE_INTEGRATION_TOKEN: "t" }, (async (_u: string, init: any) => { corpos.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ sucesso: true, vinculada: true }) }; }) as any);
  await enfileirarCadastroContabil(b.consultar, CNPJ, "escritorio1", "conferidor");
  await enfileirarCadastroContabil(b.consultar, "45723174000110", "escritorio1", "contabil", true);
  await rodarEnvioCadastroContabil({ consultar: b.consultar, lerCadastro: async () => ({ razaoSocial: "X LTDA" }), enviar });
  assert.deepEqual(corpos.map((c) => [c.cnpj, c.criarAqui, c.empresaNova === true]).sort(), [[CNPJ, false, false], ["45723174000110", true, true]].sort());
  const pulou = await rodarEnvioCadastroContabil({ consultar: b.consultar, lerCadastro: async () => ({ razaoSocial: "X" }), enviar, migracaoGravando: async () => true });
  assert.match(pulou.resumo, /pulada/);
});
