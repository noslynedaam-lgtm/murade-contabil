// Vigência das obrigações no Contábil: mesma lista dos três sistemas; PIS/Cofins depois de dez/2026 e CPRB depois de dez/2027 não
// viram provisão nova (o último período continua); conferidor e Agente com cartão.
import test from "node:test";
import assert from "node:assert/strict";
import { ASSINATURA_VIGENCIA, avisosVigencia } from "../../src/utils/vigenciaObrigacoes";
import { tributoVigenteNaCompetencia } from "../../src/server/prepararRascunhosContabeis";
import { conferirVigencia, rodarRoboVigencia } from "../../src/server/vigenciaObrigacoesServidor";
import { conferenciasVigenciaContabil, conferirCentralLucroRealVigencia } from "../../src/server/vigenciaConferenciasContabil";
import { montarObrigacoes } from "../../src/server/centralLucroReal";
import { kitContabil } from "../../src/server/agenteContabil";

// A mesma linha está nos testes do Fiscal e do DP.
const ASSINATURA_ESPERADA = "efd_contribuicoes:-:2026-12:fiscal|pis_cofins:-:2026-12:fiscal+dp+contabil|pis_folha:-:-:dp|dirf:-:2024-12:dp+fiscal|cprb:-:2027-12:dp+contabil|ipi:-:-:fiscal|efd_icms_ipi:-:-:fiscal|icms:-:2032-12:fiscal|iss:-:2032-12:fiscal|cbs:2027-01:-:fiscal+contabil|ibs:2027-01:-:fiscal+contabil|imposto_seletivo:2027-01:-:fiscal";
test("lista única igual à do Fiscal e do DP", () => assert.equal(ASSINATURA_VIGENCIA, ASSINATURA_ESPERADA));

test("provisões: PIS/Cofins de dez/2026 e CPRB de dez/2027 continuam; os meses seguintes não; pagamento de dez/2026 em 2027 continua", () => {
  assert.equal(tributoVigenteNaCompetencia("COFINS_PRESUMIDO", "2026-12"), true);
  assert.equal(tributoVigenteNaCompetencia("COFINS_PRESUMIDO", "2027-01"), false);
  assert.equal(tributoVigenteNaCompetencia("PIS_NC_PAGO", "2026-12"), true);
  assert.equal(tributoVigenteNaCompetencia("COFINS_ENTIDADE", "2027-03"), false);
  assert.equal(tributoVigenteNaCompetencia("CPRB", "2027-12"), true);
  assert.equal(tributoVigenteNaCompetencia("CPRB", "2028-01"), false);
  assert.equal(tributoVigenteNaCompetencia("IRPJ_PRESUMIDO", "2030-03"), true);
  assert.equal(tributoVigenteNaCompetencia("DAS_SIMPLES", "2030-03"), true);
});

test("avisos do Contábil: fim do PIS/Cofins e começo da CBS e do IBS 30 dias antes", () => {
  assert.deepEqual(avisosVigencia("contabil", "2026-12-15").map((a) => a.chave).sort(), ["cbs|nova|2027-01-01", "ibs|nova|2027-01-01", "pis_cofins|acaba|2027-01-01"]);
});

test("robô sem repetir aviso; conferidor sem problema e acusa apuração recebida depois do fim; Agente com cartão", async () => {
  const avisos = new Set<string>(); let recebidas: any[] = [];
  const consultar = async (sql: string, p: any[] = []) => {
    if (/INSERT INTO murade_vigencia_avisos/.test(sql)) { if (avisos.has(p[0])) return { rows: [] }; avisos.add(p[0]); return { rows: [{ chave: p[0] }] }; }
    if (/FROM murade_apuracoes_fiscais_origem/.test(sql)) return { rows: recebidas };
    return { rows: [] };
  };
  assert.equal((await rodarRoboVigencia(consultar, { sistema: "contabil", hoje: "2026-12-15" })).avisosNovos, 3);
  assert.equal((await rodarRoboVigencia(consultar, { sistema: "contabil", hoje: "2026-12-16" })).avisosNovos, 0);
  const ok = await conferirVigencia(conferenciasVigenciaContabil(consultar), "2026-12-16");
  assert.equal(ok.problemas.length, 0, ok.resumo); assert.equal(ok.falhas.length, 0);
  recebidas = [{ tributo: "PIS_PRESUMIDO", competencia: "2027-01", n: 1 }, { tributo: "PIS_PRESUMIDO", competencia: "2026-12", n: 1 }];
  const ruim = await conferirVigencia(conferenciasVigenciaContabil(consultar), "2027-02-01");
  assert.equal(ruim.problemas.length, 1); assert.match(ruim.resumo, /PIS_PRESUMIDO de 2027-01/);
  assert.equal(kitContabil.ferramentas.find((f: any) => f.declaracao.name === "consultar_vigencia_obrigacoes")?.tipo, "acao");
});

test("Central do Lucro Real: PIS/Cofins não cumulativo de dez/2026 é cobrado; de 2027 não (nem a EFD-Contribuições)", () => {
  assert.deepEqual(conferirCentralLucroRealVigencia(), []);
  const base = { config: null, apuracoes: [], pagamentos: [], pisCofinsFiscal: [], entregasSped: {}, baixas: new Set<string>(), bloqueios: new Map<string, string>() };
  const de2026 = montarObrigacoes(2026, { ...base, hoje: "2027-01-15", competenciasComSaida: new Set(["2026-12"]) });
  assert.deepEqual(de2026.filter((o) => o.tipo === "pis_nc" || o.tipo === "cofins_nc").map((o) => o.periodo), ["2026-12", "2026-12"]);
  const de2027 = montarObrigacoes(2027, { ...base, hoje: "2027-06-15", competenciasComSaida: new Set(["2027-01", "2027-02"]) });
  assert.equal(de2027.some((o) => o.tipo === "pis_nc" || o.tipo === "cofins_nc" || o.tipo === "efd_contribuicoes"), false);
  assert.ok(de2027.some((o) => o.tipo === "dctfweb" && o.periodo === "2027-01"));
});
