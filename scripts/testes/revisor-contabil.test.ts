// REVISOR do Contábil: regras puras (lançamento, várias partidas, conciliação, fechamento e revisão do mês), lista "Corrigir" do robô
// semanal, "Corrigir para mim" (só pendente de aprovação em mês aberto), isolamento por escritório, rotas e ferramentas da Agente.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import type { ContaPlano, LancamentoContabil } from "../../src/types";
import {
  acharConta, aplicarCorrecoes, correcoesDeLancamentosPendentes, normalizarDataDigitada, parecerEmTexto, revisarConciliacaoLancar, revisarFechamento,
  revisarLancamento, revisarMes, revisarMultipartida,
} from "../../src/utils/revisorContabil";
import { textoParaCentavos } from "../../src/utils/escrituracaoAvancada";
import { lancamentoCasaComMovimento } from "../../src/utils/extratoBancario";
import { criarRevisorContabil, registrarRotasRevisor, competenciaAnterior, telaDaRegra } from "../../src/server/revisorContabil";
import { kitContabil } from "../../src/server/agenteContabil";
import { ArmazemAcoesPendentes, type ChamarApi, type ContextoAgente } from "../../src/server/agenteMotor";
import { TELAS_CONTABIL, CAMPOS_CONTABIL } from "../../src/data/mapaTelasContabil";
import { ROBOS_APRESENTACAO } from "../../src/data/apresentacaoSistema";
import { validarPlanoPiloto } from "../../src/utils/pilotoVisivel";

const raiz = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "../..");
const A = "11222333000181"; const B = "11444777000161"; const OUTRO = "44555666000199";
const conta = (codigo: string, descricao: string, tipo: "sintetica" | "analitica", natureza: "D" | "C" = "D"): ContaPlano => ({ codigo, descricao, nivel: (codigo.split(".").length as any), tipo, natureza });
const PLANO: ContaPlano[] = [
  conta("1", "Ativo", "sintetica"), conta("1.1", "Ativo Circulante", "sintetica"), conta("1.1.1", "Disponível", "sintetica"),
  conta("1.1.1.01", "Caixa Geral", "analitica"), conta("1.1.1.02", "Banco Conta Movimento", "analitica"),
  conta("2", "Passivo", "sintetica", "C"), conta("2.1", "Fornecedores", "sintetica", "C"), conta("2.1.1.01", "Fornecedores Nacionais", "analitica", "C"),
  conta("3", "Receitas", "sintetica", "C"), conta("3.1.1.01", "Receita de Vendas", "analitica", "C"),
  conta("4", "Despesas", "sintetica"), conta("4.1.1.01", "Despesa com Aluguel", "analitica"),
];
const lan = (x: Partial<LancamentoContabil>): LancamentoContabil => ({ id: `l-${Math.random()}`, data: "2026-10-05", contaDebitoCodigo: "1.1.1.02", contaDebitoNome: "Banco Conta Movimento", contaCreditoCodigo: "3.1.1.01", contaCreditoNome: "Receita de Vendas", valor: 100, historico: "Venda", origem: "Manual", statusManual: "aprovado", ...x });
const CTX = (x: Partial<{ lancamentos: LancamentoContabil[]; fechadas: string[] }> = {}) => ({ contas: PLANO, lancamentos: x.lancamentos ?? [], fechadas: x.fechadas ?? [], hoje: "2026-11-20" });

// ------------------------------------------------------------------ regras puras
test("lançamento: data em outro formato tem correção; mês fechado, conta sintética e mesma conta bloqueiam", () => {
  assert.equal(normalizarDataDigitada("5/10/2026"), "05/10/2026"); assert.equal(normalizarDataDigitada("05102026"), "05/10/2026"); assert.equal(normalizarDataDigitada("31/02/2026"), null);
  const r = revisarLancamento({ data: "5-10-2026", valor: "100", debito: "1.1.1.02", credito: "3.1.1.01", historico: "Venda  à vista " }, CTX());
  assert.equal(r.bloqueia, true);
  assert.equal(r.achados.find((a) => a.regra === "data_formato")!.correcao!.valor, "05/10/2026");
  assert.equal(r.achados.find((a) => a.regra === "historico_espacos")!.correcao!.valor, "Venda à vista");
  const { dados } = aplicarCorrecoes({ data: "5-10-2026", historico: "Venda  à vista " }, r.achados);
  assert.deepEqual(dados, { data: "05/10/2026", historico: "Venda à vista" });
  assert.ok(revisarLancamento({ data: "05/10/2026", valor: 10, debito: "1.1.1.02", credito: "3.1.1.01", historico: "x" }, CTX({ fechadas: ["2026-10"] })).achados.some((a) => a.regra === "mes_fechado" && a.nivel === "bloqueia"));
  assert.ok(revisarLancamento({ data: "05/10/2026", valor: 10, debito: "1.1.1", credito: "3.1.1.01", historico: "x" }, CTX()).achados.some((a) => a.regra === "conta_debito_sintetica" && a.pergunta));
  assert.ok(revisarLancamento({ data: "05/10/2026", valor: 10, debito: "1.1.1.02", credito: "1.1.1.02", historico: "x" }, CTX()).achados.some((a) => a.regra === "mesma_conta"));
  assert.equal(revisarLancamento({ data: "05/10/2026", valor: 10.005, debito: "1.1.1.02", credito: "3.1.1.01", historico: "x" }, CTX()).bloqueia, true, "mais de 2 casas");
  assert.equal(revisarLancamento({ data: "05/10/2026", valor: "100", debito: "1.1.1.02", credito: "3.1.1.01", historico: "Venda" }, CTX()).ok, true);
});

test("lançamento: conta pelo plano (código sem ponto ou nome exato) e aviso de repetido", () => {
  assert.equal(acharConta(PLANO, "11102").sugestao?.codigo, "1.1.1.02");
  assert.equal(acharConta(PLANO, "despesa com aluguel").sugestao?.codigo, "4.1.1.01");
  assert.equal(acharConta(PLANO, "999").sugestao, null);
  const r = revisarLancamento({ data: "05/10/2026", valor: "100", debito: "11102", credito: "Receita de Vendas", historico: "Venda" }, CTX({ lancamentos: [lan({})] }));
  assert.equal(r.achados.find((a) => a.regra === "conta_debito_inexistente")!.correcao!.valor, "1.1.1.02");
  assert.equal(r.achados.find((a) => a.regra === "conta_credito_inexistente")!.correcao!.valor, "3.1.1.01");
  const rep = revisarLancamento({ data: "05/10/2026", valor: "100", debito: "1.1.1.02", credito: "3.1.1.01", historico: "Outra" }, CTX({ lancamentos: [lan({})] }));
  assert.ok(rep.achados.some((a) => a.regra === "duplicado" && a.nivel === "atencao")); assert.equal(rep.bloqueia, false);
  assert.ok(!revisarLancamento({ data: "05/10/2026", valor: "100", debito: "1.1.1.02", credito: "3.1.1.01", historico: "x" }, CTX({ lancamentos: [lan({ statusManual: "rejeitado" })] })).achados.some((a) => a.regra === "duplicado"), "rejeitado não conta");
});

test("várias partidas: partida que não fecha bloqueia; total vazio vem da soma", () => {
  const base = { data: "05/10/2026", historico: "Rateio", forma: "1xN" as const, contaUnica: "4.1.1.01", partidas: [{ conta: "1.1.1.01", valor: "600,00" }, { conta: "1.1.1.02", valor: "400,00" }] };
  assert.equal(revisarMultipartida({ ...base, total: "1.000,00" }, CTX(), textoParaCentavos).ok, true);
  const nf = revisarMultipartida({ ...base, total: "1.000,01" }, CTX(), textoParaCentavos);
  assert.ok(nf.achados.some((a) => a.regra === "partida_nao_fecha" && a.nivel === "bloqueia"));
  const vazio = revisarMultipartida({ ...base, total: "" }, CTX(), textoParaCentavos);
  assert.equal(vazio.achados.find((a) => a.regra === "total_vazio")!.correcao!.valor, "1.000,00");
  assert.ok(revisarMultipartida({ ...base, total: "1.000,00", partidas: [{ conta: "4.1.1.01", valor: "1.000,00" }] }, CTX(), textoParaCentavos).achados.some((a) => a.regra === "partida_0_mesma"));
});

test("conciliação: contrapartida igual ao banco bloqueia; movimento já lançado avisa que duplica", () => {
  const ja = lan({ data: "2026-10-05", contaDebitoCodigo: "1.1.1.02", valor: 250 });
  const r = revisarConciliacaoLancar([
    { fitid: "f1", dataISO: "2026-10-05", valorCentavos: 25000, contrapartida: "3.1.1.01" },
    { fitid: "f2", dataISO: "2026-10-06", valorCentavos: -1000, contrapartida: "1.1.1.02" },
  ], { contas: PLANO, contaBanco: "1.1.1.02", lancamentos: [ja], fechadas: [], contrapartidaUnica: false }, lancamentoCasaComMovimento);
  assert.ok(r.achados.some((a) => a.regra === "ja_lancado_f1" && a.nivel === "atencao"));
  assert.ok(r.achados.some((a) => a.regra === "contra_banco_f2" && a.nivel === "bloqueia"));
  const mista = revisarConciliacaoLancar([{ fitid: "a", dataISO: "2026-10-05", valorCentavos: 100, contrapartida: "4.1.1.01" }, { fitid: "b", dataISO: "2026-10-05", valorCentavos: -100, contrapartida: "4.1.1.01" }], { contas: PLANO, contaBanco: "1.1.1.02", lancamentos: [], fechadas: ["2026-10"], contrapartidaUnica: true }, lancamentoCasaComMovimento);
  assert.ok(mista.achados.some((a) => a.regra === "contrapartida_mista")); assert.ok(mista.achados.some((a) => a.regra === "mes_fechado_a"));
});

test("revisão do mês: repetido, Caixa com saldo credor, extrato, folha do DP e pendentes corrigíveis (só mês aberto)", () => {
  const payload = {
    contas: PLANO,
    lancamentos: [
      lan({ id: "a1" }), lan({ id: "a2" }), // repetidos
      lan({ id: "cx", contaDebitoCodigo: "4.1.1.01", contaDebitoNome: "Despesa com Aluguel", contaCreditoCodigo: "1.1.1.01", contaCreditoNome: "Caixa Geral", valor: 50, historico: "Aluguel" }),
      lan({ id: "p1", statusManual: "pendente_aprovacao", contaDebitoNome: "Banco antigo", historico: " Venda   x ", competencia: "2026-09" }),
    ],
  };
  const m = revisarMes(payload, "2026-10", new Set(), { extratoPendentes: 3, folhasDP: [{ id: "f", titulo: "Folha 10/2026", detalhe: "sem conta" }] });
  const regras = [...m.falta, ...m.risco].map((x) => x.regra);
  for (const r of ["lancamentos_repetidos", "caixa_credor", "extrato_pendente", "folha_dp_f", "pendentes_desatualizados", "fech_aprovacao"]) assert.ok(regras.includes(r), `${r} em ${regras}`);
  const pend = m.risco.find((x) => x.regra === "pendentes_desatualizados")!;
  assert.equal(pend.correcao!.valor, "p1");
  const c = correcoesDeLancamentosPendentes(PLANO, payload.lancamentos, new Set());
  assert.deepEqual(c[0].campos, { contaDebitoNome: "Banco Conta Movimento", historico: "Venda x", competencia: "2026-10" });
  assert.equal(correcoesDeLancamentosPendentes(PLANO, payload.lancamentos, new Set(["2026-10"])).length, 0, "mês fechado não é mexido");
  const f = revisarFechamento(payload, "2026-10", new Set());
  assert.equal(f.bloqueia, true, "pendente de aprovação bloqueia o fechamento"); assert.ok(f.achados.every((a) => !a.correcao && a.alvo));
  assert.match(parecerEmTexto(["Débitos e créditos fecham"], []), /✅ Conferi: Débitos e créditos fecham\. ⚠️ Atenção: nada a apontar\./);
});

test("alvos do Revisor passam na validação do piloto (a seta chega em cada campo)", () => {
  const r = revisarLancamento({ data: "", valor: "", debito: "", credito: "", historico: "" }, CTX());
  const passos = r.achados.filter((a) => a.alvo).map((a) => ({ tipo: "destacar", alvo: a.alvo, legenda: a.texto.slice(0, 160) }));
  assert.equal(validarPlanoPiloto({ titulo: "Revisor", passos }).ok, true);
  assert.equal(validarPlanoPiloto({ titulo: "Revisor", passos: [{ tipo: "destacar", alvo: "[data-campo=fechamento-fechar]", legenda: "x" }] }).ok, true);
});

// ------------------------------------------------------------------ servidor (banco simulado)
/** Banco simulado só com as consultas do Revisor (o Contábil não usa pg-mem). */
function bancoFalso() {
  const achados: any[] = []; const rodadas = new Map<string, any>(); const fechamentos: Array<{ cnpj: string; competencia: string }> = [];
  const consultar = async (sql: string, p: any[] = []): Promise<{ rows: any[]; rowCount?: number }> => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("CREATE")) return { rows: [] };
    if (q.startsWith("SELECT competencia FROM contabil_period_closures")) return { rows: fechamentos.filter((f) => f.cnpj === p[0]) };
    if (q.startsWith("INSERT INTO contabil_period_closures")) { fechamentos.push({ cnpj: p[0], competencia: "2026-10" }); return { rows: [] }; }
    if (q.startsWith("DELETE FROM contabil_period_closures")) { for (let i = fechamentos.length - 1; i >= 0; i--) if (fechamentos[i].cnpj === p[0]) fechamentos.splice(i, 1); return { rows: [] }; }
    if (q.startsWith("SELECT id, estado FROM contabil_revisor_achados")) return { rows: achados.filter((a) => a.tenant_id === p[0] && a.cnpj === p[1] && a.competencia === p[2] && a.regra === p[3] && a.origem === "robo") };
    if (q.startsWith("UPDATE contabil_revisor_achados SET nivel=")) { const a = achados.find((x) => x.id === p[0]); Object.assign(a, { nivel: p[1], tipo: p[2], texto: p[3], tela: p[4], correcao: p[5], pergunta: p[6], empresa: p[7], estado: "aberto", atualizado_em: p[8] }); return { rows: [] }; }
    if (q.startsWith("INSERT INTO contabil_revisor_achados") && q.includes("'robo','aberto'")) { achados.push({ id: p[0], tenant_id: p[1], cnpj: p[2], empresa: p[3], competencia: p[4], regra: p[5], nivel: p[6], tipo: p[7], texto: p[8], tela: p[9], correcao: p[10], pergunta: p[11], origem: "robo", estado: "aberto", criado_em: p[12], atualizado_em: p[12] }); return { rows: [] }; }
    if (q.startsWith("INSERT INTO contabil_revisor_achados") && q.includes("'salvar','salvo_com_aviso'")) { achados.push({ id: p[0], tenant_id: p[1], cnpj: p[2], competencia: p[3], regra: p[4], texto: p[5], origem: "salvar", estado: "salvo_com_aviso", criado_em: p[8], atualizado_em: p[8] }); return { rows: [] }; }
    if (q.startsWith("UPDATE contabil_revisor_achados SET estado='resolvido'")) { const fechou = achados.filter((a) => a.tenant_id === p[0] && a.cnpj === p[1] && a.competencia === p[2] && a.origem === "robo" && ["aberto", "corrigido"].includes(a.estado) && !p[4].includes(a.regra)); for (const a of fechou) { a.estado = "resolvido"; a.atualizado_em = p[3]; } return { rows: fechou.map((a) => ({ id: a.id })) }; }
    if (q.startsWith("SELECT ultima_em FROM contabil_revisor_rodadas") || q.startsWith("SELECT ultima_em, resumo FROM contabil_revisor_rodadas")) { const r = rodadas.get(p[0]); return { rows: r ? [r] : [] }; }
    if (q.startsWith("INSERT INTO contabil_revisor_rodadas")) { rodadas.set(p[0], { ultima_em: p[1], resumo: p[2] }); return { rows: [] }; }
    if (q.startsWith("SELECT * FROM contabil_revisor_achados WHERE tenant_id=$1 AND origem='robo' AND estado='aberto'")) return { rows: achados.filter((a) => a.tenant_id === p[0] && a.origem === "robo" && a.estado === "aberto") };
    if (q.startsWith("SELECT * FROM contabil_revisor_achados WHERE id=$1 AND tenant_id=$2")) return { rows: achados.filter((a) => a.id === p[0] && a.tenant_id === p[1]) };
    if (q.startsWith("UPDATE contabil_revisor_achados SET estado=$2")) { const a = achados.find((x) => x.id === p[0]); if (a) Object.assign(a, { estado: p[1], por: p[2], atualizado_em: p[3] }); return { rows: [] }; }
    if (q.startsWith("UPDATE contabil_revisor_achados SET estado='ignorado'")) { const a = achados.find((x) => x.id === p[0]); if (a) Object.assign(a, { estado: "ignorado", por: p[1], atualizado_em: p[2] }); return { rows: [] }; }
    throw new Error(`consulta não simulada: ${q.slice(0, 120)}`);
  };
  return consultar;
}

async function montar() {
  const consultar = bancoFalso();
  const workspaces = new Map<string, Record<string, any>>();
  workspaces.set(A, { empresa: { razaoSocial: "Alfa Comércio", regime: "Lucro Presumido" }, contas: PLANO, lancamentos: [lan({ id: "a1" }), lan({ id: "a2" }), lan({ id: "p1", statusManual: "pendente_aprovacao", contaDebitoNome: "Banco antigo" })] });
  workspaces.set(B, { empresa: { razaoSocial: "Beta Serviços" }, contas: PLANO, lancamentos: [lan({ id: "b1", data: "2026-10-10" })] });
  workspaces.set(OUTRO, { empresa: { razaoSocial: "De Outro Escritório" }, contas: PLANO, lancamentos: [lan({ id: "o1" }), lan({ id: "o2" })] });
  let versao = 1; const gravacoes: string[] = [];
  const revisor = criarRevisorContabil({
    consultar, agora: () => new Date("2026-11-20T15:00:00Z"), log: () => undefined,
    lerWorkspace: async (c) => (workspaces.has(c) ? JSON.parse(JSON.stringify(workspaces.get(c))) : null),
    alterarWorkspace: async (c, alterar) => {
      const fechadas = new Set((await consultar("SELECT competencia FROM contabil_period_closures WHERE cnpj=$1", [c])).rows.map((r) => String(r.competencia)));
      const { payload, resultado } = alterar(JSON.parse(JSON.stringify(workspaces.get(c))), { fechadas });
      if (!payload) return { resultado, dados: null, versao, atualizadoEm: null };
      workspaces.set(c, payload); versao += 1; gravacoes.push(c);
      return { resultado, dados: payload, versao, atualizadoEm: new Date().toISOString() };
    },
    extratoPendentes: async (c) => (c === A ? 2 : 0),
    folhasDP: async () => [],
  });
  return { consultar, revisor, workspaces, gravacoes };
}
const sessao = (x: Partial<{ tenantId: string; cnpjs: string[]; leitura: string[] }> = {}) => ({ userId: "u1", login: "ana", tenantId: x.tenantId ?? "T1", cnpjs: x.cnpjs ?? [A, B], podeEscrever: (c: string) => !(x.leitura ?? []).includes(c) });

test("revisão geral e parecer: certo / risco / falta pelo workspace salvo", async () => {
  const { revisor } = await montar();
  const r = await revisor.revisarEmpresa(A, "2026-10");
  assert.equal(r.nome, "Alfa Comércio");
  const regras = [...r.falta, ...r.risco].map((x) => x.regra);
  for (const e of ["lancamentos_repetidos", "extrato_pendente", "pendentes_desatualizados", "fech_aprovacao"]) assert.ok(regras.includes(e), `${e} em ${regras}`);
  assert.equal(r.risco.find((x) => x.regra === "pendentes_desatualizados")!.corrigivel, true);
  assert.equal(r.falta.find((x) => x.regra === "fech_aprovacao")!.tela, "aprovacoes");
  const b = await revisor.revisarEmpresa(B, "2026-10");
  assert.ok(b.certo.includes("Débitos e créditos fecham") && b.certo.some((c) => /Extrato do mês conciliado/.test(c)));
  const p = await revisor.parecer(A, "2026-10"); assert.match(p.texto, /^✅ Conferi: .*⚠️ Atenção: /);
  assert.equal(competenciaAnterior("2026-01-10"), "2025-12"); assert.equal(telaDaRegra("extrato_pendente"), "gestao-contabil");
  const f = await revisor.conferirAntes("fechamento", A, { competencia: "2026-10" });
  assert.equal(f.bloqueia, true); assert.ok(f.achados.some((x) => x.regra === "extrato_pendente"));
});

test("robô semanal: Corrigir sem duplicar, respeita a semana, isola escritório e \"Deixar assim\" não volta", async () => {
  const { revisor } = await montar();
  const escritorios = async () => [{ id: "T1", cnpjs: [A, B] }, { id: "T2", cnpjs: [OUTRO] }];
  const r1 = await revisor.rodarRobo({ escritorios });
  assert.equal(r1.revisados, 2); assert.ok(r1.novos > 0);
  assert.equal((await revisor.rodarRobo({ escritorios })).revisados, 0, "antes de uma semana não revisa de novo");
  assert.equal((await revisor.rodarRobo({ escritorios, forcar: true })).novos, 0, "Rodar agora não duplica");
  const t1 = await revisor.listarCorrigir("T1", [A, B]);
  assert.ok(t1.length && t1.every((i) => [A, B].includes(i.cnpj)));
  assert.ok((await revisor.listarCorrigir("T2", [OUTRO])).every((i) => i.cnpj === OUTRO));
  assert.equal((await revisor.listarCorrigir("T1", [B])).every((i) => i.cnpj === B), true);
  const rep = t1.find((i) => i.regra === "lancamentos_repetidos")!;
  assert.equal((await revisor.ignorar(sessao(), rep.id)).ok, true);
  await revisor.rodarRobo({ escritorios, forcar: true });
  assert.equal((await revisor.listarCorrigir("T1", [A, B])).some((i) => i.regra === "lancamentos_repetidos"), false);
});

test("\"Corrigir para mim\": só pendente em mês aberto, pelo caminho que respeita o mês fechado; somente leitura não corrige", async () => {
  const { revisor, workspaces, consultar, gravacoes } = await montar();
  await revisor.rodarRobo({ escritorios: async () => [{ id: "T1", cnpjs: [A, B] }], forcar: true });
  const item = (await revisor.listarCorrigir("T1", [A, B])).find((i) => i.regra === "pendentes_desatualizados")!;
  assert.equal(((await revisor.corrigir(sessao({ leitura: [A] }), item.id)) as any).status, 403);
  assert.equal(((await revisor.corrigir(sessao({ tenantId: "T2", cnpjs: [OUTRO] }), item.id)) as any).status, 404, "outro escritório não acha o item");
  const semCorrecao = (await revisor.listarCorrigir("T1", [A, B])).find((i) => i.regra === "extrato_pendente")!;
  assert.equal(((await revisor.corrigir(sessao(), semCorrecao.id)) as any).status, 422);
  // Mês fechado entre a revisão e o clique: nada é gravado.
  await consultar("INSERT INTO contabil_period_closures (cnpj, competencia) VALUES ($1, '2026-10')", [A]);
  const fechado = await revisor.corrigir(sessao(), item.id);
  assert.equal(fechado.ok, false); assert.equal(gravacoes.length, 0);
  // Reabre e corrige de novo (o robô reabre o item na próxima rodada).
  await consultar("DELETE FROM contabil_period_closures WHERE cnpj=$1", [A]);
  await revisor.rodarRobo({ escritorios: async () => [{ id: "T1", cnpjs: [A, B] }], forcar: true });
  const de_novo = (await revisor.listarCorrigir("T1", [A, B])).find((i) => i.regra === "pendentes_desatualizados")!;
  const r = await revisor.corrigir(sessao(), de_novo.id);
  assert.equal(r.ok, true, JSON.stringify(r));
  const p1 = workspaces.get(A)!.lancamentos.find((l: any) => l.id === "p1");
  assert.equal(p1.contaDebitoNome, "Banco Conta Movimento"); assert.equal(p1.statusManual, "pendente_aprovacao", "continua esperando aprovação");
  assert.ok(workspaces.get(A)!.lancamentos.filter((l: any) => l.statusManual === "aprovado").every((l: any) => l.contaDebitoNome === "Banco Conta Movimento"), "aprovado não é mexido");
  assert.equal(((await revisor.corrigir(sessao(), de_novo.id)) as any).status, 409, "item já tratado");
  assert.equal(await revisor.registrarSalvoComAviso(sessao(), { acao: "lancamento", cnpj: A, competencia: "2026-10", achados: [{ regra: "duplicado", texto: "x", nivel: "atencao" }, { regra: "mesma_conta", texto: "y", nivel: "bloqueia" }] }), 1);
});

test("rotas do Revisor: sessão, empresas do acesso, busca por nome e Rodar agora", async () => {
  const { revisor } = await montar();
  let s: any = sessao(); let rodou = 0;
  const app = express(); app.use(express.json());
  const passa = (_req: any, _res: any, next: any) => next();
  registrarRotasRevisor(app, { exigirSessao: passa, exigirOrigem: passa }, {
    revisor, sessao: () => s, agora: () => new Date("2026-11-20T15:00:00Z"),
    nomesDasEmpresas: async () => [{ cnpj: A, nome: "Alfa Comércio" }, { cnpj: B, nome: "Beta Serviços" }, { cnpj: OUTRO, nome: "De Outro Escritório" }],
    rodarAgora: () => { rodou += 1; return { ok: true }; },
  });
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const get = async (u: string) => { const r = await fetch(base + u); return { status: r.status, corpo: await r.json() }; };
  const post = async (u: string, b: unknown) => { const r = await fetch(base + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, corpo: await r.json() }; };
  try {
    const g = await get("/api/revisor/geral?competencia=2026-10");
    assert.equal(g.status, 200); assert.deepEqual(g.corpo.empresas.map((e: any) => e.cnpj).sort(), [A, B].sort());
    assert.deepEqual((await get("/api/revisor/geral?nome=comercio")).corpo.empresas.map((e: any) => e.cnpj), [A]);
    assert.equal((await get("/api/revisor/geral?nome=outro")).status, 404, "empresa de outro escritório não aparece pelo nome");
    assert.equal((await get(`/api/revisor/geral?cnpj=${OUTRO}`)).status, 403);
    assert.equal((await get(`/api/revisor/parecer?cnpj=${OUTRO}`)).status, 403);
    assert.equal((await post("/api/revisor/conferir", { acao: "fechamento", cnpj: OUTRO, dados: { competencia: "2026-10" } })).status, 403);
    const c = await post("/api/revisor/conferir", { acao: "fechamento", cnpj: A, dados: { competencia: "2026-10" } });
    assert.equal(c.status, 200); assert.equal(c.corpo.revisao.bloqueia, true);
    assert.equal((await post("/api/revisor/rodar-agora", {})).status, 200); assert.equal(rodou, 1);
    s = undefined; assert.equal((await get("/api/revisor/corrigir")).status, 401);
  } finally { srv.close(); }
});

// ------------------------------------------------------------------ Agente, telas, robô
test("Agente: revisar_empresa, ver_lista_corrigir e corrigir_para_mim (cartão, só o determinístico)", async () => {
  const f = (n: string) => kitContabil.ferramentas.find((x) => x.declaracao.name === n) as any;
  assert.equal(f("revisar_empresa").tipo, "leitura"); assert.equal(f("ver_lista_corrigir").tipo, "leitura"); assert.equal(f("corrigir_para_mim").tipo, "acao");
  assert.match(kitContabil.instrucao, /REVISOR/);
  const chamadas: string[] = [];
  const api: ChamarApi = async (m, u) => {
    chamadas.push(`${m} ${u}`);
    if (u.startsWith("/api/revisor/geral")) return { status: 200, corpo: { sucesso: true, competencia: "2026-10", empresas: [{ cnpj: A, nome: "Alfa", regime: "LP", certo: ["ok"], risco: [{ texto: "r", corrigivel: true }], falta: [{ texto: "f", corrigivel: false }] }] } };
    if (u.startsWith("/api/revisor/corrigir")) return { status: 200, corpo: { sucesso: true, itens: [{ id: "aaa111", cnpj: A, empresa: "Alfa", texto: "pendentes", nivel: "atencao", correcao: { explicacao: "acertar 1 lançamento(s)" } }, { id: "bbb222", cnpj: A, empresa: "Alfa", texto: "extrato", nivel: "atencao", correcao: null }], ultimaRodada: null } };
    if (u.startsWith("/api/revisor/achados/")) return { status: 200, corpo: { sucesso: true, mensagem: "Corrigi 1 lançamento(s)." } };
    return { status: 404, corpo: {} };
  };
  const ctx = { sessaoHash: "s", login: "ana", hoje: "2026-11-20", chamarApi: api, registrar: () => undefined, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil } as unknown as ContextoAgente;
  const rev = await f("revisar_empresa").executar(ctx, { nome: "alfa", competencia: "10/2026" });
  assert.deepEqual(rev.empresas[0].falta, ["f"]); assert.ok(chamadas[0].includes("competencia=2026-10"));
  const prop = await f("corrigir_para_mim").preparar(ctx, {});
  assert.deepEqual(prop.params, { ids: ["aaa111"] });
  assert.equal((await f("corrigir_para_mim").executar(ctx, prop.params)).sucesso, true);
  assert.ok(!chamadas.some((c) => /aprovar|fechamentos|decisao/.test(c)), "nunca aprova nem fecha");
});

test("tela Revisor no menu, no mapa do piloto e o robô na apresentação; formulários ligados ao Revisor", () => {
  assert.ok(TELAS_CONTABIL.some((t) => t.id === "revisor" && t.periodo === "revisor-competencia"));
  assert.ok(CAMPOS_CONTABIL.some((c) => c.chave === "revisor-revisar"));
  const ler = (f: string) => fs.readFileSync(path.join(raiz, f), "utf8");
  assert.match(ler("src/components/Sidebar.tsx"), /id: "revisor" as TabId/);
  assert.match(ler("src/types.ts"), /\| "revisor"/);
  assert.ok(ROBOS_APRESENTACAO.some((r) => r.id === "revisor" && r.intervaloMs === 6 * 60 * 60_000));
  const server = ler("server.ts");
  assert.match(server, /registrarRobo\(\{ id: "revisor"/); assert.match(server, /registrarRotinaManual\("revisor"/);
  assert.match(ler("src/components/tabs/LancamentosTab.tsx"), /revisor\.conferir\(/);
  assert.match(ler("src/components/ConciliacaoBancariaPainel.tsx"), /revisarConciliacaoLancar/);
  assert.match(ler("src/App.tsx"), /conferirNoServidor\("fechamento"/);
  assert.match(ler("src/components/CartaoOkContador.tsx"), /\/api\/revisor\/parecer/);
});
