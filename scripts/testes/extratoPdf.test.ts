// Extrato bancário em PDF: PDFs de exemplo gerados aqui (texto de verdade, fonte Helvetica), um leiaute por banco, lidos pelo mesmo
// caminho do servidor (pdf-parse → leitor genérico). Confere saldo inicial + movimentos = saldo final, a recusa quando não bate,
// o PDF escaneado (sem texto) e o conferidor (movimento sumido, extrato faltando entre meses).
import test from "node:test";
import assert from "node:assert/strict";
import { lerTextoExtratoPdf, MENSAGEM_PDF_ESCANEADO } from "../../src/utils/extratoPdf";
import { conferirExtratosPdf, gravarConferenciaPdf, lerExtratoPdf, pdfDoCorpo, reiniciarPreparoPdfParaTeste } from "../../src/server/extratoPdfServidor";

type Item = { x: number; t: string };
/** PDF 1.4 mínimo com texto (Helvetica, WinAnsi). Cada linha é uma lista de pedaços com a posição X (colunas). */
function gerarPdf(paginas: Item[][][], comImagemSoh = false): Buffer {
  const objs: string[] = []; const add = (s: string) => { objs.push(s); return objs.length; };
  const fonte = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const idxPaginas = objs.length + 1; objs.push("");
  const kids: number[] = [];
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  for (const p of paginas) {
    const corpo = comImagemSoh ? "q 100 0 0 100 50 700 cm 0.5 g 0 0 1 1 re f Q" : p.map((linha, i) => linha.map((it) => `BT /F1 9 Tf ${it.x} ${800 - i * 14} Td (${esc(it.t)}) Tj ET`).join("\n")).join("\n");
    const c = add(`<< /Length ${Buffer.byteLength(corpo, "latin1")} >>\nstream\n${corpo}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${idxPaginas} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fonte} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[idxPaginas - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const cat = add(`<< /Type /Catalog /Pages ${idxPaginas} 0 R >>`);
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const L = (...cols: Array<[number, string]>) => cols.map(([x, t]) => ({ x, t }));

// Movimentos iguais em todos: +250,50 (PIX recebido), −35,00 (tarifa), −1.200,00 (boleto), +3.000,00 (TED) → saldo 1.000,00 → 3.015,50
const LEIAUTES: Record<string, Item[][]> = {
  Itaú: [
    L([40, "Itaú Unibanco S.A. - Extrato de conta corrente"]), L([40, "Período: 01/10/2026 a 31/10/2026"]),
    L([40, "data"], [100, "lançamentos"], [380, "valor (R$)"], [470, "saldo (R$)"]),
    L([40, "30/09"], [100, "SALDO ANTERIOR"], [470, "1.000,00"]),
    L([40, "02/10"], [100, "PIX TRANSF FULANO 02/10"], [380, "250,50"]),
    L([40, "02/10"], [100, "TAR PACOTE ITAU"], [380, "-35,00"]),
    L([100, "SALDO DO DIA"], [470, "1.215,50"]),
    L([40, "10/10"], [100, "BOLETO PAGO FORNECEDOR"], [380, "-1.200,00"]),
    L([40, "15/10"], [100, "TED RECEBIDA CLIENTE"], [380, "3.000,00"]),
    L([100, "SALDO DO DIA"], [470, "3.015,50"]),
  ],
  Bradesco: [
    L([40, "Bradesco - Extrato Mensal / Por Período"]), L([40, "Data"], [90, "Lançamento"], [300, "Dcto."], [360, "Crédito (R$)"], [430, "Débito (R$)"], [500, "Saldo (R$)"]),
    L([40, "30/09/2026"], [90, "SALDO ANTERIOR"], [500, "1.000,00"]),
    L([40, "02/10/2026"], [90, "PIX RECEBIDO FULANO"], [300, "123456"], [360, "250,50"], [500, "1.250,50"]),
    L([40, "02/10/2026"], [90, "TARIFA BANCARIA CESTA"], [300, "000001"], [430, "-35,00"], [500, "1.215,50"]),
    L([40, "10/10/2026"], [90, "PAGTO ELETRON COBRANCA"], [300, "4455"], [430, "-1.200,00"], [500, "15,50"]),
    L([40, "15/10/2026"], [90, "TED-TRANSF ELET DISPON"], [300, "7788"], [360, "3.000,00"], [500, "3.015,50"]),
    L([90, "Total"], [360, "3.250,50"], [430, "-1.235,00"], [500, "3.015,50"]),
  ],
  "Banco do Brasil": [
    L([40, "Banco do Brasil S.A. - Consultas - Extrato de conta corrente"]),
    L([40, "Dia"], [90, "Histórico"], [380, "Valor"], [460, "Saldo"]),
    L([40, "30/09/2026"], [90, "Saldo Anterior"], [460, "1.000,00 C"]),
    L([40, "02/10/2026"], [90, "Pix - Recebido 02/10 10:22 FULANO"], [380, "250,50 C"]),
    L([40, "02/10/2026"], [90, "Tarifa Pacote de Serviços"], [380, "35,00 D"]),
    L([40, "10/10/2026"], [90, "Pagamento de Boleto FORNECEDOR"], [380, "1.200,00 D"]),
    L([40, "15/10/2026"], [90, "TED-Crédito em Conta"], [380, "3.000,00 C"]),
    L([40, "31/10/2026"], [90, "S A L D O"], [460, "3.015,50 C"]),
  ],
  Caixa: [
    L([40, "CAIXA ECONOMICA FEDERAL - Extrato por período"]),
    L([40, "Data Mov."], [100, "Nr. Doc."], [160, "Histórico"], [380, "Valor"], [460, "Saldo"]),
    L([40, "30/09/2026"], [100, "000000"], [160, "SALDO ANTERIOR"], [460, "1.000,00 C"]),
    L([40, "02/10/2026"], [100, "021022"], [160, "PIX RECEB FULANO"], [380, "250,50 C"], [460, "1.250,50 C"]),
    L([40, "02/10/2026"], [100, "000001"], [160, "TARIFA CESTA"], [380, "35,00 D"], [460, "1.215,50 C"]),
    L([40, "10/10/2026"], [100, "101010"], [160, "PAG BOLETO"], [380, "1.200,00 D"], [460, "15,50 C"]),
    L([40, "15/10/2026"], [100, "151515"], [160, "TED RECEBIDA"], [380, "3.000,00 C"], [460, "3.015,50 C"]),
  ],
  Santander: [
    L([40, "Santander - Extrato Consolidado Inteligente - outubro/2026"]),
    L([40, "Data"], [90, "Descrição"], [300, "Nº Documento"], [380, "Movimento (R$)"], [470, "Saldo (R$)"]),
    L([40, "30/09"], [90, "SALDO ANTERIOR"], [470, "1.000,00"]),
    L([40, "02/10"], [90, "PIX RECEBIDO FULANO"], [300, "000000"], [380, "250,50"]),
    L([40, "02/10"], [90, "TARIFA MENSALIDADE PACOTE"], [380, "35,00-"]),
    L([40, "10/10"], [90, "PAGAMENTO DE BOLETO"], [380, "1.200,00-"]),
    L([40, "15/10"], [90, "TED RECEBIDA"], [380, "3.000,00"], [470, "3.015,50"]),
    L([90, "SALDO EM 31/10"], [470, "3.015,50"]),
  ],
  Sicoob: [
    L([40, "SICOOB - Sistema de Cooperativas de Crédito do Brasil"]), L([40, "EXTRATO CONTA CORRENTE - PERÍODO: 01/10/2026 - 31/10/2026"]),
    L([40, "DATA"], [100, "HISTÓRICO"], [400, "VALOR"]),
    L([40, "30/09/2026"], [100, "SALDO ANTERIOR"], [400, "1.000,00C"]),
    L([40, "02/10/2026"], [100, "PIX RECEBIDO - OUTRA IF"], [400, "250,50C"]),
    L([100, "Recebimento Pix FULANO DE TAL"]),
    L([40, "02/10/2026"], [100, "DÉB.TARIFA PACOTE"], [400, "35,00D"]),
    L([40, "10/10/2026"], [100, "DÉB.TÍTULO COBRANÇA"], [400, "1.200,00D"]),
    L([40, "15/10/2026"], [100, "CRÉD.TED"], [400, "3.000,00C"]),
    L([100, "SALDO BLOQUEADO"], [400, "0,00"]),
    L([40, "31/10/2026"], [100, "SALDO DO DIA"], [400, "3.015,50C"]),
  ],
  Sicredi: [
    L([40, "Sicredi - Extrato de Conta Corrente"]), L([40, "Data"], [90, "Descrição"], [300, "Documento"], [380, "Valor (R$)"], [470, "Saldo (R$)"]),
    L([40, "30/09/2026"], [90, "Saldo anterior"], [470, "1.000,00"]),
    L([40, "02/10/2026"], [90, "RECEBIMENTO PIX FULANO"], [300, "PIX"], [380, "250,50"], [470, "1.250,50"]),
    L([40, "02/10/2026"], [90, "TARIFA CESTA RELACIONAMENTO"], [300, "TAR"], [380, "-35,00"], [470, "1.215,50"]),
    L([40, "10/10/2026"], [90, "LIQUIDACAO BOLETO FORNECEDOR"], [300, "BOL"], [380, "-1.200,00"], [470, "15,50"]),
    L([40, "15/10/2026"], [90, "TED RECEBIDA"], [300, "TED"], [380, "3.000,00"], [470, "3.015,50"]),
  ],
  Nubank: [
    L([40, "Nu Pagamentos S.A. - Instituição de Pagamento"]), L([40, "01 DE OUTUBRO DE 2026 a 31 DE OUTUBRO DE 2026"]),
    L([40, "Saldo final do período"], [460, "R$ 3.015,50"]),
    L([40, "Saldo inicial"], [460, "R$ 1.000,00"]),
    L([40, "02 OUT 2026"], [140, "Total de entradas"], [460, "+ 250,50"]),
    L([140, "Transferência recebida pelo Pix FULANO - •••.123.456-•• - BCO"], [460, "250,50"]),
    L([140, "Total de saídas"], [460, "- 35,00"]),
    L([140, "Tarifa avulsa"], [460, "35,00"]),
    L([40, "10 OUT 2026"], [140, "Total de saídas"], [460, "- 1.200,00"]),
    L([140, "Pagamento de boleto efetuado FORNECEDOR"], [460, "1.200,00"]),
    L([40, "15 OUT 2026"], [140, "Total de entradas"], [460, "+ 3.000,00"]),
    L([140, "Transferência Recebida CLIENTE"], [460, "3.000,00"]),
  ],
  Inter: [
    L([40, "Banco Inter S.A. - Extrato"]), L([40, "Período: 01/10/2026 a 31/10/2026"]),
    L([40, "Saldo total"], [460, "R$ 3.015,50"]),
    L([40, "2 de Outubro de 2026"], [300, "Saldo do dia:"], [460, "R$ 1.215,50"]),
    L([40, "Pix recebido: \"Cp :00000000-FULANO\""], [380, "R$ 250,50"], [460, "R$ 1.250,50"]),
    L([40, "Tarifa: \"Pacote\""], [380, "-R$ 35,00"], [460, "R$ 1.215,50"]),
    L([40, "10 de Outubro de 2026"], [300, "Saldo do dia:"], [460, "R$ 15,50"]),
    L([40, "Pagamento efetuado: \"Boleto FORNECEDOR\""], [380, "-R$ 1.200,00"], [460, "R$ 15,50"]),
    L([40, "15 de Outubro de 2026"], [300, "Saldo do dia:"], [460, "R$ 3.015,50"]),
    L([40, "TED recebida: \"CLIENTE\""], [380, "R$ 3.000,00"], [460, "R$ 3.015,50"]),
  ],
};

for (const [banco, linhas] of Object.entries(LEIAUTES)) {
  test(`PDF de exemplo ${banco}: lê data, histórico e valor com sinal e confere o saldo`, async () => {
    const r = await lerExtratoPdf(gerarPdf([linhas]));
    assert.equal(r.motivo, "", `${banco}: ${r.motivo} ${r.erros.join(" | ")}`);
    assert.equal(r.banco, banco);
    assert.deepEqual(r.movimentos.map((m) => [m.dataISO, m.valorCentavos]), [["2026-10-02", 25050], ["2026-10-02", -3500], ["2026-10-10", -120000], ["2026-10-15", 300000]]);
    assert.equal(r.conferencia.bate, true);
    assert.equal(r.conferencia.saldoInicialCentavos, 100000);
    assert.equal(r.conferencia.saldoFinalCentavos, 301550);
    assert.equal(r.conferencia.entradasCentavos, 325050);
    assert.equal(r.conferencia.saidasCentavos, 123500);
    assert.ok(r.movimentos.every((m) => /^PDF-\d{8}-[a-z0-9]+$/.test(m.fitid)));
    assert.equal(new Set(r.movimentos.map((m) => m.fitid)).size, 4);
  });
}

test("Sicoob: a linha de baixo sem data e sem valor completa o histórico", async () => {
  const r = await lerExtratoPdf(gerarPdf([LEIAUTES.Sicoob]));
  assert.match(r.movimentos[0].memo, /PIX RECEBIDO - OUTRA IF Recebimento Pix FULANO DE TAL/);
});

test("extrato em duas páginas continua a soma", async () => {
  const l = LEIAUTES.Bradesco;
  const r = await lerExtratoPdf(gerarPdf([l.slice(0, 4), l.slice(4)]));
  assert.equal(r.conferencia.bate, true); assert.equal(r.movimentos.length, 4);
});

test("saldo final que não bate: NENHUM movimento entra e o motivo diz a diferença", async () => {
  const l = LEIAUTES["Banco do Brasil"].map((x) => x.map((i) => ({ ...i, t: i.t === "3.015,50 C" ? "3.115,50 C" : i.t })));
  const r = await lerExtratoPdf(gerarPdf([l]));
  assert.equal(r.movimentos.length, 0);
  assert.equal(r.conferencia.bate, false);
  assert.match(r.motivo, /NÃO entrou/);
  assert.match(r.motivo, /3\.115,50/); assert.match(r.motivo, /3\.015,50/);
});

test("linha faltando (saldo do dia não fecha): não entra e aponta a linha", async () => {
  const l = LEIAUTES["Itaú"].filter((x) => !x.some((i) => i.t === "TAR PACOTE ITAU"));
  const r = await lerExtratoPdf(gerarPdf([l]));
  assert.equal(r.movimentos.length, 0);
  assert.match(r.motivo, /SALDO DO DIA/);
});

test("sem saldo anterior: não entra (não dá para conferir)", () => {
  const r = lerTextoExtratoPdf("Extrato Bradesco\n02/10/2026 PIX RECEBIDO 250,50\n03/10/2026 TARIFA -35,00\n");
  assert.equal(r.movimentos.length, 0);
  assert.match(r.motivo, /saldo inicial/);
});

test("valor sem sinal e sem saldo na linha: não chuta entrada/saída", () => {
  const r = lerTextoExtratoPdf("Extrato\n30/09/2026 SALDO ANTERIOR 1.000,00\n02/10/2026 PIX FULANO 250,50\n31/10/2026 SALDO FINAL 1.250,50\n");
  assert.equal(r.movimentos.length, 0);
  assert.match(r.erros.join(" "), /não dá para saber se/);
});

test("PDF escaneado (só imagem, sem texto): pede o OFX", async () => {
  const r = await lerExtratoPdf(gerarPdf([[]], true));
  assert.equal(r.semTexto, true); assert.equal(r.movimentos.length, 0);
  assert.equal(r.motivo, MENSAGEM_PDF_ESCANEADO);
  assert.match(r.motivo, /OFX/);
});

test("arquivo que não é PDF e base64 inválido", async () => {
  assert.match((await lerExtratoPdf(Buffer.from("isto não é pdf"))).motivo, /não é um PDF/);
  assert.equal(pdfDoCorpo("@@@"), null);
  assert.ok(pdfDoCorpo(`data:application/pdf;base64,${gerarPdf([LEIAUTES.Caixa]).toString("base64")}`));
});

test("mesmo PDF lido duas vezes dá os mesmos identificadores (importar de novo não duplica)", async () => {
  const a = await lerExtratoPdf(gerarPdf([LEIAUTES.Sicredi])); const b = await lerExtratoPdf(gerarPdf([LEIAUTES.Sicredi]));
  assert.deepEqual(a.movimentos.map((m) => m.fitid), b.movimentos.map((m) => m.fitid));
  assert.equal(a.hash, b.hash);
});

// ------------------------------------------------------------------ conferidor (banco em memória)
function bancoFalso() {
  const conf: any[] = []; const movs: any[] = [];
  const consultar = async (sql: string, p: any[] = []) => {
    if (/^CREATE/.test(sql.trim())) return { rows: [] };
    if (/INSERT INTO contabil_extrato_pdf_conferencias/.test(sql)) { if (!conf.some((c) => c.cnpj === p[0] && c.conta_banco === p[1] && c.hash === p[2])) conf.push({ cnpj: p[0], conta_banco: p[1], hash: p[2], arquivo: p[3], periodo_de: p[5], periodo_ate: p[6], saldo_inicial_centavos: p[7], saldo_final_centavos: p[8], fitids: JSON.parse(p[11]) }); return { rows: [] }; }
    if (/FROM contabil_extrato_pdf_conferencias/.test(sql)) return { rows: conf.filter((c) => p[0].includes(c.cnpj)).sort((a, b) => a.periodo_de.localeCompare(b.periodo_de)) };
    if (/FROM contabil_extrato_movimentos/.test(sql)) return { rows: movs.filter((m) => m.cnpj === p[0] && m.conta_banco === p[1] && p[2].includes(m.fitid)) };
    throw new Error(sql);
  };
  return { consultar, conf, movs };
}
test("conferidor: tudo certo, movimento sumido e extrato faltando entre dois meses", async () => {
  reiniciarPreparoPdfParaTeste();
  const b = bancoFalso(); const cnpj = "12345678000199";
  const out = await lerExtratoPdf(gerarPdf([LEIAUTES.Caixa]));
  await gravarConferenciaPdf(b.consultar, cnpj, "1.1.1.02", out, "outubro.pdf", "ana");
  for (const m of out.movimentos) b.movs.push({ cnpj, conta_banco: "1.1.1.02", fitid: m.fitid, valor_centavos: m.valorCentavos });
  let r = await conferirExtratosPdf(b.consultar, [cnpj]);
  assert.equal(r.conferidos, 1); assert.deepEqual(r.achados, []);
  // dezembro começando com saldo diferente do fim de outubro: falta o extrato de novembro
  const dez = lerTextoExtratoPdf("Caixa\n30/11/2026 SALDO ANTERIOR 5.000,00 C\n02/12/2026 PIX RECEB 100,00 C 5.100,00 C\n");
  await gravarConferenciaPdf(b.consultar, cnpj, "1.1.1.02", { ...dez, hash: "h".repeat(64), paginas: 1 }, "dezembro.pdf", "ana");
  for (const m of dez.movimentos) b.movs.push({ cnpj, conta_banco: "1.1.1.02", fitid: m.fitid, valor_centavos: m.valorCentavos });
  b.movs.splice(0, 1); // um movimento de outubro sumiu
  r = await conferirExtratosPdf(b.consultar, [cnpj]);
  assert.equal(r.achados.length, 2);
  assert.match(r.achados[0].texto, /outubro\.pdf.*1 movimento/);
  assert.match(r.achados[1].texto, /Falta extrato entre/);
  // outro escritório não vê
  assert.equal((await conferirExtratosPdf(b.consultar, ["99999999000199"])).conferidos, 0);
});
