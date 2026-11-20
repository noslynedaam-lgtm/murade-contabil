import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { conferirDemonstracoesWorkspace, linhaDoPainel, registrarRotasDemonstracoes, resumoDemonstracoes, rodarRoboDemonstracoes, achadosDemonstracoes, limparAchadosDemonstracoesParaTeste } from "../../src/server/demonstracoesServidor";
import { kitContabil } from "../../src/server/agenteContabil";

const contas: any[] = [
  { codigo: "1", descricao: "Ativo", nivel: 1, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1", descricao: "Ativo Circulante", nivel: 2, tipo: "sintetica", natureza: "D" },
  { codigo: "1.1.1", descricao: "Caixa", nivel: 3, tipo: "analitica", natureza: "D" },
  { codigo: "2", descricao: "Passivo", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "2.3", descricao: "Patrimônio Líquido", nivel: 2, tipo: "sintetica", natureza: "C" },
  { codigo: "2.3.1", descricao: "Capital Social", nivel: 3, tipo: "analitica", natureza: "C" },
  { codigo: "3", descricao: "Receitas", nivel: 1, tipo: "sintetica", natureza: "C" },
  { codigo: "3.1", descricao: "Receita bruta de serviços", nivel: 2, tipo: "analitica", natureza: "C" },
  { codigo: "9", descricao: "Conta estranha", nivel: 1, tipo: "analitica", natureza: "D" },
];
const L = (id: string, data: string, d: string, c: string, valor: number) => ({ id, data, contaDebitoCodigo: d, contaDebitoNome: "", contaCreditoCodigo: c, contaCreditoNome: "", valor, historico: "h", origem: "Manual" });
const payload = (extra: any = {}) => ({ empresa: { cnpj: "11222333000181", razaoSocial: "Alfa Ltda", regime: "Lucro Presumido", presumidoLivroCaixa: false, presumidoDistribuiuLucroAcimaBase: false, ...extra }, contas, lancamentos: [L("a", "2025-01-02", "1.1.1", "2.3.1", 1000), L("b", "2025-03-10", "1.1.1", "3.1", 500), L("c", "2025-04-10", "9", "1.1.1", 50)], livros: [], lembretes: [], centrosCusto: [] });
const agora = new Date("2026-03-15T12:00:00Z");

test("robô: aponta conta sem classificação e notas faltando; não aponta DFC errada quando fecha", () => {
  const a = conferirDemonstracoesWorkspace("11222333000181", payload(), agora)!;
  assert.ok(a.itens.some((i) => i.id === "contas_sem_classificacao"));
  assert.ok(a.itens.some((i) => i.id === "notas_faltando"));
  assert.ok(!a.itens.some((i) => i.id === "dfc_nao_confere"));
  const comNotas = conferirDemonstracoesWorkspace("11222333000181", payload({ classificacaoDemonstracoes: { "9": "despesa" }, notasExplicativas: { "2025": { ano: 2025, norma: "NBC TG 1002", secoes: [{ id: "x", titulo: "Contexto", texto: "Tudo certo.", base: "" }], atualizadoEm: "" } } }), agora)!;
  assert.deepEqual(comNotas.itens, []);
});

test("robô: controle da Parte B entre anos", () => {
  const conta = { codigo: "PF01", descricao: "Prejuízo", dtAp: "2023-12-31", codPbRfb: "1", tributo: "I", saldoInicialCentavos: 1000, indSaldoInicial: "D", vinculos: [], lancamentos: [] };
  const a = conferirDemonstracoesWorkspace("11222333000181", payload({ ecfComplementos: { "2024": { y600: [], y540: [], parteB: [conta] }, "2025": { y600: [], y540: [], parteB: [] } } }), agora)!;
  assert.ok(a.itens.some((i) => /PF01.*não foi levada para 2025/.test(i.texto)));
});

test("painel: mês fechado, pendências, ECD/ECF com prazos e entregue", () => {
  const p = payload({ entregasSped: { "ECF-2025": { entregueEm: "2026-07-01", recibo: "123" } } });
  const aberto = linhaDoPainel("11222333000181", p, "2026-02", new Set(), agora);
  assert.equal(aberto.mesFechado, false);
  assert.equal(aberto.ecd.ano, 2025); assert.equal(aberto.ecd.situacao, "obrigatoria"); assert.equal(aberto.ecd.prazo, "2026-06-30"); assert.equal(aberto.ecd.entregue, false);
  assert.equal(aberto.ecf.prazo, "2026-07-31"); assert.equal(aberto.ecf.entregue, true); assert.equal(aberto.ecf.recibo, "123");
  const fechado = linhaDoPainel("11222333000181", p, "2026-02", new Set(["2026-02"]), agora);
  assert.equal(fechado.mesFechado, true); assert.deepEqual(fechado.pendencias, []);
  const simples = linhaDoPainel("11222333000181", payload({ regime: "Simples Nacional" }), "2026-02", new Set(), agora);
  assert.equal(simples.ecf.seAplica, "nao"); assert.equal(simples.ecd.situacao, "dispensada");
});

test("resumo para a Agente", () => {
  const r = resumoDemonstracoes(payload(), "2025-12");
  assert.equal(r.indices.length, 6); assert.equal(r.serie12Meses.length, 12); assert.equal(typeof r.dfc.confere, "boolean");
});

test("rotas: escopo por CNPJ, leitura só, entrega e modelo de notas sem sobrescrever", async () => {
  limparAchadosDemonstracoesParaTeste();
  const banco = new Map<string, any>([["11222333000181", payload()]]);
  const consultar = async (sql: string) => {
    if (/contabil_company_workspaces/.test(sql)) return { rows: [...banco].map(([cnpj, p]) => ({ cnpj, payload: p })) };
    return { rows: [] };
  };
  let somenteLeitura = false;
  const app = express(); app.use(express.json());
  const passa: express.RequestHandler = (_q, _r, n) => n();
  let disparos = 0;
  registrarRotasDemonstracoes(app, { exigirSessao: passa, exigirOrigem: passa }, {
    consultar, bancoConfigurado: () => true,
    sessao: () => ({ userId: "u", login: "ana@x", cnpjs: ["11222333000181"], podeEscrever: () => !somenteLeitura }),
    normalizarCnpj: (v) => String(v ?? "").replace(/\W/g, "").toUpperCase(),
    lerWorkspace: async (c) => banco.get(c) ?? null,
    alterarWorkspace: async (c, alterar) => { const r = alterar(JSON.parse(JSON.stringify(banco.get(c))), { fechadas: new Set() }); if (r.payload) banco.set(c, r.payload); return { resultado: r.resultado, dados: r.payload, versao: 2 }; },
    dispararRobo: () => { disparos++; return { ok: true }; },
  });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const get = async (u: string) => { const r = await fetch(base + u); return { status: r.status, corpo: await r.json() }; };
  const post = async (u: string, b: unknown) => { const r = await fetch(base + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, corpo: await r.json() }; };
  try {
    const painel = await get("/api/painel-escritorio?competencia=2026-02");
    assert.equal(painel.corpo.empresas.length, 1);
    assert.equal((await get("/api/demonstracoes/99888777000166/resumo?competencia=2025-12")).status, 403);
    assert.equal((await get("/api/demonstracoes/11222333000181/resumo?competencia=2025-12")).corpo.indices.length, 6);
    const e = await post("/api/painel-escritorio/entrega", { cnpj: "11222333000181", obrigacao: "ECD", ano: 2025, recibo: "ABC-1" });
    assert.equal(e.corpo.sucesso, true);
    assert.equal(banco.get("11222333000181").empresa.entregasSped["ECD-2025"].recibo, "ABC-1");
    assert.equal((await post("/api/painel-escritorio/entrega", { cnpj: "11222333000181", obrigacao: "XYZ", ano: 2025 })).status, 400);
    const n1 = await post("/api/demonstracoes/11222333000181/notas-modelo", { ano: 2025 });
    assert.equal(n1.corpo.sucesso, true);
    const notas = banco.get("11222333000181").empresa.notasExplicativas["2025"];
    assert.equal(notas.norma, "NBC TG 1002");
    banco.get("11222333000181").empresa.notasExplicativas["2025"].secoes[0].texto = "Texto da contadora";
    const n2 = await post("/api/demonstracoes/11222333000181/notas-modelo", { ano: 2025 });
    assert.match(n2.corpo.mensagem, /já existem/);
    assert.equal(banco.get("11222333000181").empresa.notasExplicativas["2025"].secoes[0].texto, "Texto da contadora");
    somenteLeitura = true;
    assert.equal((await post("/api/painel-escritorio/entrega", { cnpj: "11222333000181", obrigacao: "ECF", ano: 2025 })).status, 403);
    assert.equal((await post("/api/demonstracoes/conferir-agora", {})).corpo.sucesso, true);
    assert.equal((await post("/api/demonstracoes/conferir-agora", {})).status, 429);
    assert.equal(disparos, 1);
  } finally { srv.close(); }
  // o robô passa por todas as empresas e guarda os achados
  const resumo = await rodarRoboDemonstracoes(consultar, agora);
  assert.match(resumo, /1 empresa/);
  assert.equal(achadosDemonstracoes(["11222333000181"]).length, 1);
});

test("Agente: as ferramentas das demonstrações estão no kit e as ações viram cartão", async () => {
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ["consultar_demonstracoes", "painel_do_escritorio", "preparar_notas_explicativas", "marcar_entrega_sped", "conferir_demonstracoes_agora"]) assert.ok(nomes.includes(n), n);
  const f = kitContabil.ferramentas.find((x) => x.declaracao.name === "marcar_entrega_sped")! as any;
  assert.equal(f.tipo, "acao");
  const p = await f.preparar({}, { cnpj: "11.222.333/0001-81", obrigacao: "ecf", ano: 2025, recibo: "9" });
  assert.equal(p.params.obrigacao, "ECF"); assert.match(p.titulo, /entregue/);
  assert.ok((await f.preparar({}, { cnpj: "x", obrigacao: "ECF", ano: 2025 })).erro);
  assert.match(kitContabil.instrucao, /DEMONSTRAÇÕES E RELATÓRIOS/);
});
