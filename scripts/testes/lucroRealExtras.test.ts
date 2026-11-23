// Central do Lucro Real — JCP, retenções como tomadora, bloqueio do PIS/COFINS do Fiscal e aviso no celular (contas feitas à mão).
import test from "node:test";
import assert from "node:assert/strict";
import { aliquotaJcpDecimos, irrfJcp, vencimentoIrrfJcp, vencimentoSegundoDecendioMesSeguinte, obrigacoesExtras, motivoBloqueioPisCofins, lerRetencoesDoFiscal } from "../../src/server/lucroRealObrigacoesExtras";
import { montarAvisoCelular, enviarAvisosCelular } from "../../src/server/avisoCelularLucroReal";
import { bloqueiosDoAno } from "../../src/server/centralLucroReal";

test("JCP: 17,5% desde 1º/01/2026 (LC 224/2025), 15% antes; arredondamento ao centavo", () => {
  assert.equal(aliquotaJcpDecimos("2026-01-01"), 175);
  assert.equal(aliquotaJcpDecimos("2025-12-31"), 150);
  assert.equal(irrfJcp(1_000_000, "2026-03-10"), 175_000); // R$ 10.000,00 × 17,5% = R$ 1.750,00
  assert.equal(irrfJcp(1_000_000, "2025-12-31"), 150_000);
  assert.equal(irrfJcp(3, "2026-02-01"), 1); // 0,525 centavo → 1
  assert.equal(irrfJcp(2, "2026-02-01"), 0); // 0,35 → 0
});

test("JCP: vence no 3º dia útil depois do decêndio (Lei 11.196/2005, art. 70, I, b)", () => {
  assert.equal(vencimentoIrrfJcp("2026-01-15"), "2026-01-23"); // decêndio até 20/01 (terça): 21, 22, 23
  assert.equal(vencimentoIrrfJcp("2026-04-05"), "2026-04-15"); // até 10/04 (sexta): 13, 14, 15
  assert.equal(vencimentoIrrfJcp("2026-11-25"), "2026-12-03"); // até 30/11 (segunda): 1º, 2, 3 de dezembro
});

test("Retenções como tomadora: último dia útil do 2º decêndio do mês seguinte (Lei 10.833/2003, art. 35)", () => {
  assert.equal(vencimentoSegundoDecendioMesSeguinte("2026-05"), "2026-06-19"); // 20/06/2026 é sábado
  assert.equal(vencimentoSegundoDecendioMesSeguinte("2026-10"), "2026-11-19"); // 20/11 é feriado nacional (Lei 14.759/2023)
  assert.equal(vencimentoSegundoDecendioMesSeguinte("2026-12"), "2027-01-20"); // quarta-feira
});

test("Obrigações extras: IRRF do JCP (5706), IRRF e CSRF (5952) da tomadora; baixa encerra", () => {
  const jcp = [{ id: "jcp-20260115-a", dataPagamento: "2026-01-15", valorCentavos: 1_000_000, aliquotaPercentual: 17.5, irrfCentavos: 175_000, vencimento: "2026-01-23", beneficiarios: "Sócio A", por: "ana" }];
  const ret = [{ competencia: "2026-05", irCentavos: 1_500, csllCentavos: 1_000, pisCentavos: 650, cofinsCentavos: 3_000, prestadores: 1, pendencias: 0 }];
  const o = obrigacoesExtras(2026, jcp, ret, new Set(["csrf_tomador:2026-05"]));
  assert.equal(o.length, 3);
  const j = o.find((x) => x.tipo === "irrf_jcp")!;
  assert.equal(j.codigoDarf, "5706"); assert.equal(j.valorCentavos, 175_000); assert.equal(j.estado, "confirmada");
  assert.doesNotMatch(j.descricao, /R\$/, "o título não leva valor (vai para o celular)");
  const ir = o.find((x) => x.tipo === "irrf_tomador")!; assert.equal(ir.valorCentavos, 1_500); assert.equal(ir.vencimento, "2026-06-19");
  const cs = o.find((x) => x.tipo === "csrf_tomador")!; assert.equal(cs.valorCentavos, 4_650); assert.equal(cs.codigoDarf, "5952"); assert.equal(cs.estado, "baixada");
  assert.equal(obrigacoesExtras(2027, jcp, ret, new Set()).length, 0, "outro ano fica de fora");
});

test("Resposta do Fiscal com linha inválida é ignorada", () => {
  const r = lerRetencoesDoFiscal({ meses: [{ competencia: "2026-03", irCentavos: 100 }, { competencia: "2026-13", irCentavos: 5 }, { competencia: "2025-03", irCentavos: 5 }, { competencia: "2026-04", irCentavos: -3 }] }, 2026);
  assert.deepEqual(r.map((x) => [x.competencia, x.irCentavos]), [["2026-03", 100], ["2026-04", 0]]);
});

test("Bloqueio do PIS/COFINS do Fiscal: não conferido, sem contabilidade, diferença de receita; 'Fiscal não confirmou' não bloqueia (seria círculo)", () => {
  assert.match(String(motivoBloqueioPisCofins("2026-05", [], { conferidoEm: null, motivo: null })), /ainda não conferiu/);
  assert.match(String(motivoBloqueioPisCofins("2026-05", [], { conferidoEm: "2026-11-23T10:00:00Z", motivo: "sem contabilidade" })), /não conferido/);
  assert.equal(motivoBloqueioPisCofins("2026-05", [{ id: "2026-05:pis_cofins_fiscal", competencia: "2026-05", tipo: "pis_cofins_fiscal" }], { conferidoEm: "x", motivo: null }), null);
  assert.match(String(motivoBloqueioPisCofins("2026-05", [{ id: "2026-05:notas_x_receita", competencia: "2026-05", tipo: "notas_x_receita" }], { conferidoEm: "x", motivo: null })), /1 diferença/);
  assert.equal(motivoBloqueioPisCofins("2026-06", [{ id: "2026-05:notas_x_receita", competencia: "2026-05", tipo: "notas_x_receita" }], { conferidoEm: "x", motivo: null }), null, "outro mês não bloqueia");
  const b = bloqueiosDoAno(2026, [], [{ competencia: "2026-05", estado: "aberta", tipo: "notas_x_receita", explicacao: "" }, { competencia: "2026-06", estado: "aceita", tipo: "notas_x_receita", explicacao: "" }]);
  assert.ok(b.has("pis_nc:2026-05") && b.has("cofins_nc:2026-05")); assert.ok(!b.has("pis_nc:2026-06"), "aceita libera");
});

const alerta = (id: string, nivel: "vermelho" | "amarelo", titulo: string, texto = "") => ({ obrigacaoId: id, nivel, titulo, texto, vencimento: "", dias: 0, multaCentavos: null, jurosCentavos: null, totalCentavos: null, estimativa: null });
test("Aviso no celular: um por empresa por dia, sem valores, o mais urgente primeiro", () => {
  const a = montarAvisoCelular({ cnpj: "11222333000181", razaoSocial: "Empresa Teste Ltda", alertas: [alerta("divergencia:2026-05:notas_x_receita", "vermelho", "Diferença entre os sistemas em 2026-05", "Receita R$ 1.000,00"), alerta("irpj:2026:A05", "vermelho", "IRPJ Lucro Real — estimativa de 05/2026: vence HOJE (30/06/2026)"), alerta("dctfweb:2026-05", "amarelo", "DCTFWeb de 05/2026: vence em 5 dia(s) (30/06/2026)")] }, "2026-06-30")!;
  assert.equal(a.chave, "central|2026-06-30");
  // O IRPJ que vence hoje sai pelo alerta urgente (com a insistência do dia): o aviso diário não repete.
  assert.match(a.titulo, /Empresa Teste Ltda: 2 aviso\(s\), 1 urgente\(s\)/);
  assert.doesNotMatch(a.corpo, /IRPJ/);
  assert.doesNotMatch(a.corpo, /R\$/); assert.match(a.corpo, /guia bloqueada até você decidir/); assert.match(a.corpo, /Central do Lucro Real/);
  assert.equal(montarAvisoCelular({ cnpj: "1", razaoSocial: "", alertas: [] }, "2026-06-30"), null);
});

test("Aviso no celular: antes das 8h não sai; manda uma vez por dia; Fiscal fora do ar não marca como enviado", async () => {
  const gravados = new Set<string>();
  const q = async (sql: string, p: unknown[] = []) => {
    if (/^CREATE/.test(sql.trim())) return { rows: [] };
    if (/^SELECT 1/.test(sql.trim())) return { rows: gravados.has(`${p[0]}|${p[1]}`) ? [{}] : [] };
    if (/^INSERT/.test(sql.trim())) { gravados.add(`${p[0]}|${p[1]}`); return { rows: [], rowCount: 1 }; }
    return { rows: [] };
  };
  const itens = [{ cnpj: "11222333000181", razaoSocial: "A", alertas: [alerta("dctfweb:2026-05", "vermelho", "DCTFWeb: vence HOJE")] }];
  let chamadas = 0; const ok = async () => { chamadas += 1; return { destinatarios: 2, enviados: 2, semAparelho: 0, silenciados: 0, adiados: 0, falhas: 0 }; };
  assert.equal((await enviarAvisosCelular(q as any, itens, ok, "2026-06-30", 7)).comAviso, 0, "7h: espera");
  const r1 = await enviarAvisosCelular(q as any, itens, ok, "2026-06-30", 9); assert.equal(r1.entregues, 2);
  const r2 = await enviarAvisosCelular(q as any, itens, ok, "2026-06-30", 11); assert.equal(r2.jaEnviados, 1); assert.equal(chamadas, 1);
  const r3 = await enviarAvisosCelular(q as any, itens, async () => { throw new Error("HTTP 502"); }, "2026-07-01", 9); assert.equal(r3.falhasFiscal, 1);
  assert.ok(!gravados.has("11222333000181|central|2026-07-01"), "falha não fica marcada: tenta de novo");
  const r4 = await enviarAvisosCelular(q as any, itens, ok, "2026-06-30", 14, true); assert.equal(r4.entregues, 2, "manual manda de novo (uma vez por hora)");
});
