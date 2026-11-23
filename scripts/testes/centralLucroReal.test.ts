// Central do Lucro Real — contas feitas à mão, contra a lei:
//  - adicional do IRPJ: 10% sobre o que passar de R$ 20.000 × meses (Lei 9.249/1995, art. 3º, § 1º; P&R PJ 2025, cap. XV, perg. 018);
//  - estimativa pela receita: comércio 8% (IRPJ) e 12% (CSLL) (Lei 9.430/1996, art. 2º; Lei 9.249/1995, arts. 15 e 20);
//  - compensação de prejuízo até 30% (Lei 9.065/1995, art. 15);
//  - multa de mora 0,33% ao dia até 20% e juros Selic + 1% no mês do pagamento (Lei 9.430/1996, art. 61).
import test from "node:test";
import assert from "node:assert/strict";
import { calcularLucroRealAnual } from "../../src/services/ecfRealService";
import { calcularEstimativaMensal } from "../../src/services/ecfRealPeriodosService";
import { alertasDasObrigacoes, bloqueiosDoAno, conferirCruzado, irpjCsllPeloSegundoCaminho, montarObrigacoes, notasDeSaidaPorMes, vencimentoDctfWeb, vencimentoEcd, vencimentoEcf, vencimentoEfdContribuicoes, vencimentoPisCofinsNC, type Obrigacao } from "../../src/server/centralLucroReal";
import { CONFIG_LR_PADRAO } from "../../src/server/lucroRealApuracao";

const entradaBase = { anoCalendario: 2026, irpjContabilizado: 0, csllContabilizada: 0, adicoesIrpj: [], exclusoesIrpj: [], adicoesCsll: [], exclusoesCsll: [], saldoPrejuizoFiscal: 0, saldoBaseNegativaCsll: 0, indAliquotaCsll: "1", meses: 3 };
const linhaTri = (r: ReturnType<typeof calcularLucroRealAnual>, saldoP = 0) => ({ periodo: "T01", irpjCentavos: Math.round(r.irpjAPagar * 100), csllCentavos: Math.round(r.csllAPagar * 100), resultado: { forma: "trimestral", meses: [1, 2, 3], saldoPrejuizoInicialCentavos: saldoP, saldoBaseNegativaInicialCentavos: 0, detalhe: r } }) as any;

test("trimestre: lucro de R$ 100.000 → IRPJ 15.000 + adicional (100.000 − 60.000) × 10% = 4.000 → R$ 19.000; CSLL 9% = R$ 9.000; o segundo caminho bate", () => {
  const r = calcularLucroRealAnual({ ...entradaBase, resultadoContabil: 100000 });
  assert.equal(r.irpjAPagar, 19000); assert.equal(r.csllAPagar, 9000);
  const c = irpjCsllPeloSegundoCaminho(linhaTri(r), "1");
  assert.equal(c.ok, true, c.diferencas.join(" ")); assert.equal(c.irpjCentavos, 1_900_000); assert.equal(c.csllCentavos, 900_000);
});

test("compensação até 30%: lucro 100.000 com prejuízo de 50.000 → compensa 30.000, base 70.000 → IRPJ 10.500 + 1.000 = R$ 11.500", () => {
  const r = calcularLucroRealAnual({ ...entradaBase, resultadoContabil: 100000, saldoPrejuizoFiscal: 50000 });
  assert.equal(r.compensacaoPrejuizo, 30000); assert.equal(r.irpjAPagar, 11500);
  assert.equal(irpjCsllPeloSegundoCaminho(linhaTri(r, 5_000_000), "1").ok, true);
});

test("estimativa pela receita: comércio R$ 1.000.000 → base 80.000 → IRPJ 12.000 + (80.000 − 20.000) × 10% = 6.000 → R$ 18.000; CSLL 120.000 × 9% = R$ 10.800", () => {
  const [m] = calcularEstimativaMensal({ anoCalendario: 2026, indAliquotaCsll: "1" }, [{ mes: 1, modo: "E", receita: { irpj: { p16: 0, p8: 1_000_000, p16b: 0, p32: 0, p384: 0 }, csll: { p12: 1_000_000, p32: 0, p384: 0 }, acrescimos: 0 } as any }]);
  assert.equal(m.irpjDevido, 18000); assert.equal(m.csllDevida, 10800);
  const l = { periodo: "A01", irpjCentavos: 1_800_000, csllCentavos: 1_080_000, resultado: { forma: "estimativa", meses: [1], detalhe: m } } as any;
  assert.equal(irpjCsllPeloSegundoCaminho(l, "1").ok, true);
});

test("dois caminhos: um centavo a mais na apuração gravada vira diferença", () => {
  const r = calcularLucroRealAnual({ ...entradaBase, resultadoContabil: 100000 });
  const l = linhaTri(r); l.irpjCentavos += 1;
  const c = irpjCsllPeloSegundoCaminho(l, "1");
  assert.equal(c.ok, false); assert.match(c.diferencas.join(" "), /IRPJ do período/);
});

test("vencimentos oficiais (dia útil; feriado nacional antecipa ou empurra)", () => {
  assert.equal(vencimentoPisCofinsNC("2025-10"), "2025-11-25"); // Agenda Tributária: PIS/COFINS de out/2025 em 25/11/2025
  assert.equal(vencimentoPisCofinsNC("2026-09"), "2026-10-23"); // 25/10/2026 é domingo: antecipa para sexta
  assert.equal(vencimentoDctfWeb("2026-10"), "2026-11-30");
  assert.equal(vencimentoEfdContribuicoes("2026-09"), "2026-11-16"); // 10º dia útil de nov/2026 (02/11 é Finados)
  assert.equal(vencimentoEcd(2025), "2026-06-30"); assert.equal(vencimentoEcf(2025), "2026-07-31");
});

const ob = (o: Partial<Obrigacao>): Obrigacao => ({ id: "irpj:2026:A09", tipo: "irpj", periodo: "2026 A09", descricao: "IRPJ", vencimento: "2026-10-30", valorCentavos: 1_000_000, codigoDarf: "2362", estado: "confirmada", oQueFalta: "", fonte: "", guia: true, bloqueada: false, motivoBloqueio: null, ...o });
test("avisos insistem: 10, 5, 3, 1 dia, no dia e todo dia de atraso; sem confirmação, todo dia; baixada, nunca", () => {
  const com = (hoje: string, o: Partial<Obrigacao> = {}) => alertasDasObrigacoes([ob(o)], hoje, {});
  assert.equal(com("2026-10-20").length, 1, "10 dias antes"); assert.equal(com("2026-10-22").length, 0, "8 dias antes: sem aviso");
  for (const d of ["2026-10-25", "2026-10-27", "2026-10-29", "2026-10-30"]) assert.equal(com(d).length, 1, d);
  assert.match(com("2026-10-30")[0].titulo, /HOJE/);
  assert.equal(com("2026-10-22", { estado: "conferir" }).length, 1, "sem confirmação avisa todo dia");
  assert.equal(com("2026-11-10", { estado: "baixada" }).length, 0);
  // 5 dias de atraso, pagando em novembro: multa 5 × 0,33% = 1,65% = R$ 165,00; juros só o 1% do mês do pagamento = R$ 100,00
  const a = com("2026-11-04")[0];
  assert.equal(a.multaCentavos, 16_500); assert.equal(a.jurosCentavos, 10_000); assert.equal(a.totalCentavos, 1_026_500); assert.equal(a.nivel, "vermelho");
  // 3 meses depois: multa no teto de 20%; juros = Selic de nov + dez + 1%
  const b = alertasDasObrigacoes([ob({})], "2027-01-15", { "2026-11": 0.79, "2026-12": 0.84 })[0];
  assert.equal(b.multaCentavos, 200_000); assert.equal(b.jurosCentavos, 26_300);
  // sem a Selic de um mês, não chuta os juros
  const s = alertasDasObrigacoes([ob({})], "2027-01-15", { "2026-11": 0.79 })[0];
  assert.equal(s.jurosCentavos, null); assert.match(String(s.estimativa), /Falta a taxa Selic/);
});

test("conferidor cruzado: receita × notas, folha × contabilizado e PIS/COFINS sem confirmar no Fiscal; bloqueia só o período", () => {
  const notas = notasDeSaidaPorMes([
    { competencia: "2026-01", tipo: "Saída", documento: { valorTotal: 1100, valorIpi: 100 } },
    { competencia: "2026-01", tipo: "Saída", documento: { valorTotal: 500, statusSefaz: "Cancelada" } },
    { competencia: "2026-02", tipo: "Saída", documento: { valorTotal: 2000 } },
  ]);
  assert.deepEqual(notas.get("2026-01"), { valorCentavos: 100_000, notas: 1, semValor: 0 });
  const d = conferirCruzado({ ano: 2026, ultimoMes: 2, receitaContabil: new Map([["2026-01", 100_000], ["2026-02", 150_000]]), notasSaida: notas,
    folhaDp: new Map([["2026-01", 500_000]]), folhaContabilizada: new Map([["2026-01", 500_000]]), pisCofinsConfirmado: new Set(["2026-01"]) });
  assert.deepEqual(d.map((x) => x.id), ["2026-02:notas_x_receita", "2026-02:pis_cofins_fiscal"]);
  assert.match(d[0].explicacao, /Diferença -R\$\s?500,00/);
  const aps = [{ periodo: "A01", resultado: { meses: [1] } }, { periodo: "A02", resultado: { meses: [2] } }] as any;
  const b = bloqueiosDoAno(2026, aps, d.map((x) => ({ ...x, estado: "aberta" })));
  assert.equal(b.has("irpj:2026:A01"), false); assert.equal(b.has("irpj:2026:A02"), true); assert.equal(b.has("csll:2026:A02"), true);
  assert.equal(bloqueiosDoAno(2026, aps, d.map((x) => ({ ...x, estado: "aceita" }))).size, 0, "decidida pelo contador: libera");
});

test("obrigações do ano: IRPJ/CSLL pelo estado da apuração, PIS/COFINS do Fiscal, DCTFWeb, EFD-Contribuições só até 12/2026, ECD/ECF", () => {
  const cfg = { ...CONFIG_LR_PADRAO, forma: "estimativa" as const };
  const lista = montarObrigacoes(2026, { hoje: "2026-03-10", config: cfg, apuracoes: [{ periodo: "A01", status: "confirmado", irpjCentavos: 1000, csllCentavos: 0, resultado: { darfs: [{ tributo: "irpj", codigo: "2362", vencimento: "2026-02-27" }] } } as any],
    pagamentos: [], pisCofinsFiscal: [{ tributo: "PIS_NAO_CUMULATIVO", competencia: "2026-01", valorCentavos: 500 }], competenciasComSaida: new Set(["2026-01", "2026-02"]), entregasSped: { "ECD-2025": { entregueEm: "x" } }, baixas: new Set(["dctfweb:2026-01"]), bloqueios: new Map() });
  const est = (id: string) => lista.find((o) => o.id === id)?.estado;
  assert.equal(est("irpj:2026:A01"), "confirmada"); assert.equal(est("csll:2026:A01"), "baixada", "valor zero: nada a pagar");
  assert.equal(est("irpj:2026:A02"), "aguardando_apuracao");
  assert.equal(est("pis_nc:2026-01"), "confirmada"); assert.equal(est("pis_nc:2026-02"), "aguardando_apuracao"); assert.equal(est("cofins_nc:2026-01"), "aguardando_apuracao");
  assert.equal(est("dctfweb:2026-01"), "baixada"); assert.equal(est("efd_contribuicoes:2026-02"), "confirmada");
  assert.equal(est("ecd:2025"), "baixada"); assert.equal(est("ecf:2025"), "confirmada");
  const em2027 = montarObrigacoes(2027, { hoje: "2027-03-10", config: null, apuracoes: [], pagamentos: [], pisCofinsFiscal: [], competenciasComSaida: new Set(), entregasSped: {}, baixas: new Set(), bloqueios: new Map() });
  assert.equal(em2027.some((o) => o.tipo === "efd_contribuicoes"), false, "EFD-Contribuições regular acaba em 12/2026 (NT 013/2026)");
});
