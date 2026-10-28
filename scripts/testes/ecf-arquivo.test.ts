import test from "node:test";
import assert from "node:assert/strict";
import { gerarArquivoEcf, comPeriodoAnual, cpfValido, type ParametrosArquivoEcf } from "../../src/services/ecfArquivoService";

const base = (): ParametrosArquivoEcf => ({
  ano: 2025, cnpj: "11222333000181", nome: "EMPRESA TESTE LTDA", formaTrib: "5", formaApur: "T", tipEscPre: "C", aliqCsll: "1",
  flags: {}, flagsConfirmados: true,
  cadastro: { naturezaJuridica: "206-2 - Sociedade Empresária Limitada", cnae: "6920-6/01", endereco: "RUA A", numero: "10", bairro: "CENTRO", uf: "SP", codigoMunicipio: "3550308", cep: "01001-000", email: "a@b.com.br" },
  signatarios: [
    { nome: "SOCIO", documento: "529.982.247-25", qualificacao: "203", email: "s@b.com.br", fone: "11999998888" },
    { nome: "CONTADORA", documento: "168.995.350-09", qualificacao: "900", crc: "1SP123456", email: "c@b.com.br", fone: "1133334444" },
  ],
  registros: ["|P030|01012025|31032025|T01|", "|P200|10|X|1,00|"],
});

test("CPF: valida dígitos verificadores", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("529.982.247-24"), false);
});

test("gera o arquivo do Lucro Presumido com Bloco 0, blocos vazios e Bloco 9 coerentes", () => {
  const r = gerarArquivoEcf(base());
  assert.deepEqual(r.erros, []);
  assert.ok(r.ok);
  assert.equal(r.linhas[0], "|0000|LECF|0012|11222333000181|EMPRESA TESTE LTDA|0|0|||01012025|31122025|N||0||");
  assert.ok(r.linhas.includes("|0010||N|5|T|01|PPPP||C||||"));
  assert.ok(r.linhas.some((l) => l.startsWith("|0020|1|0|N|N|")));
  assert.equal(r.linhas.find((l) => l.startsWith("|0020|"))!.split("|").length - 2, 32); // REG + 31 campos, como no exemplo do manual
  assert.ok(r.linhas.includes("|0030|2062|6920601|RUA A|10||CENTRO|SP|3550308|01001000||a@b.com.br|"));
  assert.ok(r.linhas.includes("|P001|0|"));
  assert.ok(r.linhas.includes("|P990|4|"));
  assert.ok(r.linhas.includes("|M001|1|") && r.linhas.includes("|M990|2|"));
  // 0990 conta as linhas do Bloco 0
  const iZero = r.linhas.findIndex((l) => l.startsWith("|0990|"));
  assert.equal(Number(r.linhas[iZero].split("|")[2]), iZero + 1);
  // 9999 = total de linhas; 9990 = linhas do Bloco 9
  const ult = r.linhas[r.linhas.length - 1];
  assert.equal(ult, `|9999|${r.linhas.length}|`);
  const i9 = r.linhas.findIndex((l) => l.startsWith("|9001|"));
  const n9 = r.linhas.length - 1 - i9; // 9001 .. 9990
  assert.equal(r.linhas[r.linhas.length - 2], `|9990|${n9}|`);
  // totais de 9900 batem com o arquivo
  for (const l of r.linhas.filter((x) => x.startsWith("|9900|"))) {
    const [, , reg, q] = l.split("|");
    assert.equal(r.linhas.filter((x) => x.split("|")[1] === reg).length, Number(q), `9900 ${reg}`);
  }
  assert.ok(r.conteudo.endsWith("\r\n"));
});

test("recusa quando faltam dados: sem confirmação do 0020, contador sem CRC, município ausente", () => {
  const p = base();
  p.flagsConfirmados = false;
  p.signatarios[1].crc = "";
  p.cadastro.codigoMunicipio = "";
  const r = gerarArquivoEcf(p);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /0020/.test(e)));
  assert.ok(r.erros.some((e) => /CRC/.test(e)));
  assert.ok(r.erros.some((e) => /município/.test(e)));
  assert.equal(r.conteudo, "");
});

test("regras do 0020: operações vinculadas sem exterior; presumido com participação no exterior", () => {
  const p = base();
  p.flags = { IND_OP_VINC: "S", IND_PART_EXT: "S" };
  const r = gerarArquivoEcf(p);
  assert.ok(r.erros.some((e) => /vinculadas/.test(e)));
  assert.ok(r.erros.some((e) => /Presumido sem Refis/.test(e)));
});

test("Lucro Real anual exige a forma da estimativa mensal e leva M030/N030", () => {
  const p = base();
  p.formaTrib = "1"; p.formaApur = "A"; p.tipEscPre = undefined;
  assert.ok(gerarArquivoEcf(p).erros.some((e) => /estimativa/.test(e)));
  p.mesBalRed = "EEEEEEEEEEEE";
  p.registros = comPeriodoAnual(2025, ["|M300|8|X|A|4|1,00||", "|N500|1|Y|1,00|"]);
  const r = gerarArquivoEcf(p);
  assert.deepEqual(r.erros, []);
  assert.ok(r.linhas.includes("|0010||N|1|A|01|RRRR|EEEEEEEEEEEE|C||||"));
  assert.ok(r.linhas.includes("|M030|01012025|31122025|A00|"));
  assert.ok(r.linhas.includes("|N030|01012025|31122025|A00|"));
  assert.ok(r.linhas.includes("|M001|0|") && r.linhas.includes("|N001|0|"));
});

test("0021 só entra quando há programa especial", () => {
  const p = base();
  p.flags = { IND_PJ_HAB: "S" };
  assert.ok(gerarArquivoEcf(p).erros.some((e) => /0021/.test(e)));
  p.programas = ["S", ...Array(16).fill("N")];
  const r = gerarArquivoEcf(p);
  assert.deepEqual(r.erros, []);
  assert.ok(r.linhas.includes("|0021|S|N|N|N|N|N|N|N|N|N|N|N|N|N|N|N|N|"));
});
