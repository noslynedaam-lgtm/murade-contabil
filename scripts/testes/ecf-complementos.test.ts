import test from "node:test";
import assert from "node:assert/strict";
import { aplicarComplementosEcf, complementosValidos, saldosParteB, type ComplementosEcf } from "../../src/services/ecfComplementosService";
import { comPeriodoAnual, gerarArquivoEcf } from "../../src/services/ecfArquivoService";

const CNPJ = "11222333000181";
const base = comPeriodoAnual(2026, ["|M300|93.01|Compensação de prejuízo|P|4|300,00||", "|M350|94.01|Compensação de base negativa|P|4|300,00||", "|N500|1|x|1000,00|"]);
const comp = (extra: Partial<ComplementosEcf[string]> = {}, anterior?: ComplementosEcf[string]): ComplementosEcf => ({
  ...(anterior ? { "2025": anterior } : {}),
  "2026": {
    y600: [{ dtAlt: "2020-01-10", pais: "105", indQualif: "PF", cpfCnpj: "529.982.247-25", nome: "Fulano de Tal", qualif: "05", percCapTot: 100, percCapVot: 100, remTrabCentavos: 1200000, lucDivCentavos: 500000 }],
    y540: [{ cnpjEstab: CNPJ, receitaCentavos: 10000000, cnae: "4744001" }],
    parteB: [{ codigo: "PF01", descricao: "Prejuízo fiscal a compensar", dtAp: "2024-12-31", codPbRfb: "1", tributo: "I", saldoInicialCentavos: 100000, indSaldoInicial: "D", vinculos: [{ registro: "M300", codigo: "93.01", valorCentavos: 30000, indicador: "C" }], lancamentos: [] }],
    ...extra,
  },
});

test("Y540 e Y600 no formato do leiaute", () => {
  const r = aplicarComplementosEcf(base, comp({ parteB: [] }), 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "A" });
  assert.deepEqual(r.erros, []);
  assert.ok(r.registros.includes(`|Y540|${CNPJ}|100000,00|4744001|`));
  assert.ok(r.registros.includes("|Y600|10012020||105|PF|52998224725|Fulano de Tal|05|100,0000|100,0000|||12000,00|5000,00||||"));
  assert.ok(r.registros.indexOf(r.registros.find((l) => l.startsWith("|Y540|"))!) < r.registros.indexOf(r.registros.find((l) => l.startsWith("|Y600|"))!));
});

test("Y600/Y540 com dado errado ficam como pendência e nada é encaixado", () => {
  const r = aplicarComplementosEcf(base, comp({ y600: [{ dtAlt: "2020-01-10", pais: "105", indQualif: "PF", cpfCnpj: "111.111.111-11", nome: "X", qualif: "5", percCapTot: 100, percCapVot: 100 }], y540: [{ cnpjEstab: "99888777000166", receitaCentavos: 1, cnae: "123" }], parteB: [] }), 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "A" });
  assert.ok(r.erros.some((e) => /Y540/.test(e)));
  assert.ok(r.erros.some((e) => /Y600.*CPF/.test(e)));
  assert.deepEqual(r.registros, base);
});

test("Parte B: M010 antes do M030, M305 depois do M300 com relação 1, M500 com saldo final", () => {
  const r = aplicarComplementosEcf(base, comp(), 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "A" });
  assert.deepEqual(r.erros, []);
  const L = r.registros;
  const i = (p: string) => L.findIndex((l) => l.startsWith(p));
  assert.ok(i("|M010|") < i("|M030|"));
  assert.equal(L[i("|M300|")], "|M300|93.01|Compensação de prejuízo|P|1|300,00||");
  assert.equal(L[i("|M300|") + 1], "|M305|PF01|300,00|C|");
  assert.equal(L[i("|M010|")], "|M010|PF01|Prejuízo fiscal a compensar|31122024|1||I|1000,00|D||");
  // saldo: −1000 (D) + 300 (C) = −700 (D)
  assert.equal(L[i("|M500|")], "|M500|PF01|I|1000,00|D|300,00|C|0,00|C|700,00|D|");
  assert.ok(i("|M500|") < i("|N030|"));
  // o arquivo completo continua montando
  const arq = gerarArquivoEcf({ ano: 2026, cnpj: CNPJ, nome: "X", formaTrib: "1", formaApur: "A", mesBalRed: "EEEEEEEEEEEE", aliqCsll: "1", flags: {}, flagsConfirmados: true, cadastro: { naturezaJuridica: "2062", cnae: "4744001", endereco: "Rua", numero: "1", bairro: "B", uf: "GO", codigoMunicipio: "5208707", cep: "74000000", email: "a@b.com" }, signatarios: [{ nome: "A", documento: "52998224725", qualificacao: "205", email: "a@b.com", fone: "62999999999" }, { nome: "B", documento: "11144477735", qualificacao: "900", crc: "GO1", email: "b@b.com", fone: "62999999999" }], registros: L });
  assert.equal(arq.ok, true, arq.erros.join(";"));
  assert.match(arq.conteudo, /\|Y001\|0\|/);
  assert.match(arq.conteudo, /\|9900\|M500\|1\|/);
});

test("controle de saldos entre anos: o saldo final de 2025 vira o inicial de 2026", () => {
  const ant = { y600: [], y540: [], parteB: [{ codigo: "PF01", descricao: "Prejuízo fiscal a compensar", dtAp: "2024-12-31", codPbRfb: "1", tributo: "I" as const, saldoInicialCentavos: 150000, indSaldoInicial: "D" as const, vinculos: [{ registro: "M300" as const, codigo: "93.01", valorCentavos: 50000, indicador: "C" as const }], lancamentos: [] }] };
  const todos = comp({}, ant);
  const s25 = saldosParteB(todos, 2025)[0];
  assert.equal(s25.final, -100000);
  const s26 = saldosParteB(todos, 2026)[0];
  assert.equal(s26.origemInicial, "ano_anterior");
  assert.equal(s26.inicial, -100000);
  assert.equal(s26.final, -70000);
  // conta criada no próprio ano: saldo inicial zero, mesmo se declarado
  const nova = comp({ parteB: [{ codigo: "X1", descricao: "Nova", dtAp: "2026-06-30", codPbRfb: "2", tributo: "C", saldoInicialCentavos: 999, indSaldoInicial: "C", vinculos: [], lancamentos: [{ valorCentavos: 100, indicador: "CR", historico: "Ajuste", realizacaoAnterior: "N" }] }] });
  assert.equal(saldosParteB(nova, 2026)[0].inicial, 0);
  assert.equal(saldosParteB(nova, 2026)[0].final, 100);
});

test("Parte B: recusa presumido, trimestral, tributo trocado e vínculo sem M300", () => {
  assert.ok(aplicarComplementosEcf(base, comp(), 2026, { cnpj: CNPJ, formaTrib: "5", formaApur: "T" }).erros.some((e) => /Lucro Real/.test(e)));
  assert.ok(aplicarComplementosEcf(base, comp(), 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "T" }).erros.some((e) => /trimestral/.test(e)));
  const trocado = comp({ parteB: [{ codigo: "C1", descricao: "Base negativa", dtAp: "2024-12-31", codPbRfb: "1", tributo: "C", saldoInicialCentavos: 0, indSaldoInicial: "D", vinculos: [{ registro: "M300", codigo: "93.01", valorCentavos: 100, indicador: "C" }], lancamentos: [] }] });
  assert.ok(aplicarComplementosEcf(base, trocado, 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "A" }).erros.some((e) => /CSLL/.test(e)));
  const semM300 = comp({ parteB: [{ codigo: "PF01", descricao: "P", dtAp: "2024-12-31", codPbRfb: "1", tributo: "I", saldoInicialCentavos: 0, indSaldoInicial: "D", vinculos: [{ registro: "M300", codigo: "99.99", valorCentavos: 100, indicador: "C" }], lancamentos: [] }] });
  assert.ok(aplicarComplementosEcf(base, semM300, 2026, { cnpj: CNPJ, formaTrib: "1", formaApur: "A" }).erros.some((e) => /99\.99/.test(e)));
  assert.equal(complementosValidos(comp()), true);
  assert.equal(complementosValidos({ abc: {} }), false);
});
