import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  cobertoPeloUrgente, conferirAlertasUrgentes, enviarAlertasUrgentes, etapaInsistente, itensUrgentes, marcarResolvido, multaSeNaoResolverHoje, obrigacoesEcdEcfGerais,
  textoAlertaUrgenteContabil, tipoUrgenteDaObrigacao, limparCacheAlertaUrgenteParaTeste,
} from "../../src/server/alertaUrgenteContabil";
import { ecdEcfNaJanela } from "../../src/server/alertaUrgenteContabilRotas";
import type { Obrigacao } from "../../src/server/centralLucroReal";

const ob = (o: Partial<Obrigacao>): Obrigacao => ({ id: "irpj:2026:A10", tipo: "irpj", periodo: "2026 A10", descricao: "IRPJ Lucro Real — estimativa de 10/2026", vencimento: "2026-11-30", valorCentavos: 1_000_000, codigoDarf: "2362", estado: "confirmada", oQueFalta: "Confirmada: emita a guia no Sicalc.", fonte: "Lei 9.430/1996", guia: true, bloqueada: false, motivoBloqueio: null, ...o });

test("insistência igual ao Fiscal e ao DP: nada antes das 7h; no dia às 7h, 12h e 16h30; vencido todo dia até 30 dias", () => {
  assert.equal(etapaInsistente(0, 6 * 60 + 59, "2026-11-30"), null);
  assert.equal(etapaInsistente(0, 7 * 60, "2026-11-30"), "dia");
  assert.equal(etapaInsistente(0, 12 * 60, "2026-11-30"), "dia_12h");
  assert.equal(etapaInsistente(0, 16 * 60 + 29, "2026-11-30"), "dia_12h");
  assert.equal(etapaInsistente(0, 16 * 60 + 30, "2026-11-30"), "dia_17h");
  assert.equal(etapaInsistente(1, 600, "2026-11-29"), "d1");
  assert.equal(etapaInsistente(3, 600, "2026-11-27"), "d3");
  assert.equal(etapaInsistente(7, 600, "2026-11-23"), "d7");
  assert.equal(etapaInsistente(8, 600, "2026-11-22"), null);
  assert.equal(etapaInsistente(-2, 600, "2026-12-02"), "atrasado_2026-12-02");
  assert.equal(etapaInsistente(-31, 600, "2026-12-31"), null, "depois de 30 dias fica com o aviso diário da Central");
});

test("só os vencimentos do Contábil entram (ECD, ECF, IRPJ/CSLL, JCP); PIS/COFINS, DCTFWeb e retenções não", () => {
  assert.equal(tipoUrgenteDaObrigacao("irpj"), "CONTABIL_IRPJ_CSLL"); assert.equal(tipoUrgenteDaObrigacao("csll"), "CONTABIL_IRPJ_CSLL");
  assert.equal(tipoUrgenteDaObrigacao("irrf_jcp"), "CONTABIL_JCP"); assert.equal(tipoUrgenteDaObrigacao("ecd"), "CONTABIL_ECD"); assert.equal(tipoUrgenteDaObrigacao("ecf"), "CONTABIL_ECF");
  for (const t of ["pis_nc", "cofins_nc", "dctfweb", "efd_contribuicoes", "irrf_tomador", "csrf_tomador"]) assert.equal(tipoUrgenteDaObrigacao(t), null, t);
  const itens = itensUrgentes("11222333000181", "Empresa", [ob({}), ob({ id: "pis_nc:2026-10", tipo: "pis_nc", codigoDarf: "6912" }), ob({ id: "csll:2026:A10", tipo: "csll", estado: "baixada" }), ob({ id: "irpj:2026:A09", vencimento: "2026-12-31" })], "2026-11-30", {}, {}, new Set());
  assert.deepEqual(itens.map((i) => i.obrigacaoId), ["irpj:2026:A10"], "baixada e fora da janela de 7 dias não entram");
  assert.equal(itensUrgentes("1", "E", [ob({})], "2026-11-30", {}, {}, new Set(["irpj:2026:A10"])).length, 0, "Resolvido para os avisos");
});

test("multa se não resolver hoje: guia com valor pela Lei 9.430/96 art. 61 (pagando amanhã); sem Selic diz o motivo; antes do vencimento só a regra", () => {
  const venceHoje = ob({});
  const t = multaSeNaoResolverHoje(venceHoje, "2026-11-30", { "2026-12": 1 } as any);
  assert.match(String(t), /pagando amanhã: multa R\$\s?33,00 \(0,33%\)/);
  assert.match(String(multaSeNaoResolverHoje(ob({ vencimento: "2026-12-07" }), "2026-11-30", {})), /Se passar do vencimento: multa de mora de 0,33%/);
  assert.match(String(multaSeNaoResolverHoje(ob({ valorCentavos: null }), "2026-11-30", {})), /0,33% por dia/);
  const ecd = multaSeNaoResolverHoje(ob({ id: "ecd:2025", tipo: "ecd", guia: false, valorCentavos: null, vencimento: "2026-06-30", periodo: "2025" }), "2026-06-30", {}, {});
  assert.ok(ecd && ecd.length > 10, "ECD vencendo hoje tem a regra da multa por atraso");
});

test("texto do aviso: urgente, sem valor no título, com motivo, passo a passo e multa", () => {
  const [i] = itensUrgentes("11222333000181", "Empresa Teste Ltda", [ob({})], "2026-11-30", { "2026-12": 1 } as any, {}, new Set());
  const t = textoAlertaUrgenteContabil(i, "dia");
  assert.match(t.titulo, /^URGENTE — vence hoje: IRPJ Lucro Real \(DARF 2362\) — Empresa Teste Ltda$/);
  assert.doesNotMatch(t.titulo, /R\$/);
  assert.match(t.corpo, /Motivo: ainda não foi dado como pago\. Se não resolver hoje: pagando amanhã: multa .* O que fazer agora: 1\) Emita o DARF 2362 no Sicalc/);
  assert.ok(t.corpo.length <= 500);
});

test("ECD/ECF das empresas fora do Lucro Real: ECD obrigatória e ECF pelo regime, prazo oficial; entregue não entra", () => {
  const presumido = { empresa: { regime: "Lucro Presumido", entregasSped: {} } };
  const o = obrigacoesEcdEcfGerais(presumido, "2026-06-25");
  assert.ok(o.some((x) => x.id === "ecf:2025" && x.vencimento === "2026-07-31"), "ECF do Presumido (último dia útil de julho)");
  const entregue = obrigacoesEcdEcfGerais({ empresa: { regime: "Lucro Presumido", entregasSped: { "ECF-2025": { recibo: "1" } } } }, "2026-06-25");
  assert.equal(entregue.find((x) => x.id === "ecf:2025")?.estado, "baixada");
  assert.equal(obrigacoesEcdEcfGerais({ empresa: { regime: "Simples Nacional" } }, "2026-06-25").filter((x) => x.tipo === "ecf").length, 0, "Simples não tem ECF");
  assert.equal(ecdEcfNaJanela("2026-11-23"), false, "em novembro, ECD/ECF fora da janela: nem lê o cadastro das empresas fora do Lucro Real");
  assert.equal(ecdEcfNaJanela("2026-06-25"), true);
});

test("aviso diário da Central não repete o que está no alerta urgente (nunca duplicado)", () => {
  assert.equal(cobertoPeloUrgente("irpj:2026:A10", 0), true);
  assert.equal(cobertoPeloUrgente("irrf_jcp:jcp-20261110-abc", -5), true);
  assert.equal(cobertoPeloUrgente("irpj:2026:A10", 10), false, "10 dias antes fica no aviso diário");
  assert.equal(cobertoPeloUrgente("irpj:2026:A10", -31), false);
  assert.equal(cobertoPeloUrgente("dctfweb:2026-10", 0), false, "DCTFWeb segue no aviso diário");
  assert.equal(cobertoPeloUrgente("divergencia:2026-10:notas_x_receita", 0), false);
});

function bancoFalso() {
  const envios = new Map<string, any>(); const resolvidos = new Set<string>(); const prefs = new Map<string, string[]>(); const hist: any[] = [];
  const q = async (sql: string, p: any[] = []) => {
    const s = sql.trim();
    if (/^CREATE/.test(s)) return { rows: [] };
    if (/FROM contabil_alerta_prefs$/.test(s)) return { rows: [...prefs].map(([login, t]) => ({ login, silenciar_tipos: t })) };
    if (/^SELECT 1 FROM contabil_urgente_envios/.test(s)) return { rows: envios.has(`${p[0]}|${p[1]}`) ? [{}] : [] };
    if (/^SELECT destinatarios/.test(s)) { const e = envios.get(`${p[0]}|${p[1]}`); return { rows: e ? [e] : [] }; }
    if (/^INSERT INTO contabil_urgente_envios/.test(s)) { envios.set(`${p[0]}|${p[1]}`, { destinatarios: p[4], enviados: p[5], sem_aparelho: p[6], silenciados: p[7] }); return { rows: [] }; }
    if (/^INSERT INTO contabil_urgente_resolvidos_hist/.test(s)) { hist.push(p); return { rows: [] }; }
    if (/^INSERT INTO contabil_urgente_resolvidos/.test(s)) { resolvidos.add(`${p[0]}|${p[1]}`); return { rows: [] }; }
    if (/^DELETE FROM contabil_urgente_resolvidos/.test(s)) { resolvidos.delete(`${p[0]}|${p[1]}`); return { rows: [] }; }
    return { rows: [] };
  };
  return { q: q as any, envios, resolvidos, prefs, hist };
}

test("envio pelo Fiscal: uma vez por etapa (7h, 12h, 16h30), com o tipo e quem desligou; Fiscal fora do ar não marca e o conferidor acusa", async () => {
  limparCacheAlertaUrgenteParaTeste();
  const b = bancoFalso(); b.prefs.set("ana@escritorio.com", ["CONTABIL_IRPJ_CSLL"]);
  const itens = itensUrgentes("11222333000181", "Empresa", [ob({})], "2026-11-30", {}, {}, new Set());
  const cargas: any[] = []; const ok = async (_c: string, a: any[]) => { cargas.push(...a); return { destinatarios: 3, enviados: 2, semAparelho: 0, silenciados: 1, adiados: 0, falhas: 0 }; };
  assert.equal((await enviarAlertasUrgentes(b.q, itens, ok, "2026-11-30", 6 * 60)).avisosNovos, 0, "antes das 7h não sai");
  const r1 = await enviarAlertasUrgentes(b.q, itens, ok, "2026-11-30", 7 * 60 + 5);
  assert.equal(r1.avisosNovos, 1); assert.equal(cargas[0].chave, "urgente|irpj:2026:A10|dia"); assert.equal(cargas[0].tipo, "CONTABIL_IRPJ_CSLL"); assert.deepEqual(cargas[0].silenciadosPor, ["ana@escritorio.com"]);
  assert.equal((await enviarAlertasUrgentes(b.q, itens, ok, "2026-11-30", 9 * 60)).jaEnviados, 1, "não repete a etapa da manhã");
  assert.equal((await enviarAlertasUrgentes(b.q, itens, ok, "2026-11-30", 12 * 60 + 1)).avisosNovos, 1, "meio-dia insiste");
  assert.equal((await enviarAlertasUrgentes(b.q, itens, ok, "2026-11-30", 16 * 60 + 31)).avisosNovos, 1, "16h30 insiste");
  assert.deepEqual((await conferirAlertasUrgentes(b.q, itens, "2026-11-30", 16 * 60 + 40)).semEnvio, []);
  const atrasado = itensUrgentes("11222333000181", "Empresa", [ob({})], "2026-12-02", {}, {}, new Set());
  const rf = await enviarAlertasUrgentes(b.q, atrasado, async () => { throw new Error("HTTP 502"); }, "2026-12-02", 8 * 60);
  assert.equal(rf.falhasFiscal, 1);
  assert.equal((await conferirAlertasUrgentes(b.q, atrasado, "2026-12-02", 8 * 60)).semEnvio.length, 1, "conferidor: vencido sem aviso aceito");
});

test('"Resolvido": registra com o nome (histórico), aceita desfazer e só para obrigações do Contábil', async () => {
  limparCacheAlertaUrgenteParaTeste();
  const b = bancoFalso();
  assert.deepEqual(await marcarResolvido(b.q, "11222333000181", "irpj:2026:A10", "ana", false), { ok: true });
  assert.ok(b.resolvidos.has("11222333000181|irpj:2026:A10"));
  assert.deepEqual(await marcarResolvido(b.q, "11222333000181", "irpj:2026:A10", "ana", true), { ok: true });
  assert.ok(!b.resolvidos.has("11222333000181|irpj:2026:A10")); assert.equal(b.hist.length, 2);
  assert.ok("erro" in (await marcarResolvido(b.q, "11222333000181", "dctfweb:2026-10", "ana", false)), "DCTFWeb não é do alerta urgente do Contábil");
  assert.ok("erro" in (await marcarResolvido(b.q, "11222333000181", "ecd:2025;drop", "ana", false)));
});

test("tela: faixa no Início e na Central do Lucro Real, convite de ativar no Início, liga/desliga por tipo; robô de 30 em 30 minutos; Agente", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8"); const central = fs.readFileSync("src/components/CentralLucroRealPainel.tsx", "utf8"); const server = fs.readFileSync("server.ts", "utf8");
  assert.ok(app.includes('{tabAtiva === "inicio" && <div className="-mx-2"><FaixaUrgenteContabil onAbrirCentral={() => setTabAtiva("livros" as TabId)} /><AtivarAvisosContabil /><MeusAlertasCelularContabil /></div>}'));
  assert.match(central, /<FaixaUrgenteContabil cnpj=\{limpo\} \/>/); assert.match(central, /<MeusAlertasCelularContabil \/>/);
  assert.match(server, /registrarRobo\(\{ id: "alerta_urgente_contabil"[^]*intervaloMs: 30 \* 60_000/);
  assert.match(server, /registrarRotinaManual\("alerta_urgente_contabil"/);
  const faixa = fs.readFileSync("src/components/FaixaUrgenteContabil.tsx", "utf8");
  assert.doesNotMatch(faixa, /sticky|fixed/, "não é fixa no topo (economiza tela no celular)");
  assert.match(faixa, /window\.innerWidth >= 768/, "começa recolhida no celular");
  const agente = fs.readFileSync("src/server/agenteCentralLucroReal.ts", "utf8");
  assert.match(agente, /name: "vencimentos_urgentes_contabil"/); assert.match(agente, /name: "avisar_equipe_vencimentos_contabil"/);
  assert.doesNotMatch(fs.readFileSync("src/server/alertaUrgenteContabil.ts", "utf8"), /consultarSerpro|integra-contador/i);
});
