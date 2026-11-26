// Integração Fiscal → Contábil do sistema anterior (de-para fornecedor/CFOP → conta) trazida pelo backup e usada pelo reconciliador.
// Linhas no formato real do backup (fornecedor com máscara, conta pela "chamada"), com CNPJs inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { tabelaContabilInteressa } from "../../src/utils/tabelasSistemaAnteriorContabil";
import { regrasIntegracaoDoBackup, compararRegras } from "../../src/server/migracaoSistemaAnterior/integracaoFiscal";
import { contasDoRascunhoConferem, contasDoRascunhoFiscal, contasPelasRegras, type RegrasIntegracaoContas } from "../../src/utils/contasRascunhoFiscal";

const CONTAS_PLANO = [
  { idconta: "10", idplanodecontas: "6", cdchamada: "799", cdclassinterna: "2-1-03-01-05", nmconta: "Ciplan", tpconta: "A" },
  { idconta: "11", idplanodecontas: "6", cdchamada: "125", cdclassinterna: "1-1-05-01-01", nmconta: "Fornecedor A", tpconta: "A" },
  { idconta: "12", idplanodecontas: "6", cdchamada: "50", cdclassinterna: "2-1-03-01", nmconta: "Fornecedores", tpconta: "S" },
  { idconta: "13", idplanodecontas: "6", cdchamada: "60", cdclassinterna: "1-1-04-01", nmconta: "Clientes", tpconta: "S" },
  { idconta: "14", idplanodecontas: "6", cdchamada: "4", cdclassinterna: "3-1-01-01-01", nmconta: "Venda de mercadorias", tpconta: "A" },
];
const MAPA = { "10": "2.1.03.01.05", "11": "1.1.05.01.01", "12": "2.1.03.01", "13": "1.1.04.01", "14": "3.1.01.01.01" };
const TIPOS: Record<string, string> = { "2.1.03.01.05": "analitica", "1.1.05.01.01": "analitica", "2.1.03.01": "sintetica", "1.1.04.01": "sintetica", "3.1.01.01.01": "analitica" };

test("o navegador leva ao Contábil as três tabelas da integração", () => {
  for (const t of ["frninteg", "cadfism", "cfgcodintegracao"]) assert.equal(tabelaContabilInteressa("wfiscal", t), true, t);
  assert.equal(tabelaContabilInteressa("wfiscal", "m00006"), false);
});

test("regras do backup: fornecedor pela chamada da conta no plano da empresa, CFOP com conta, grupos; sem conta não vira regra", () => {
  const r = regrasIntegracaoDoBackup({
    idPlano: 6, contasDoPlano: CONTAS_PLANO, mapaContas: MAPA, tipoConta: (c) => TIPOS[c],
    frninteg: [
      { codfornecedor: "00057240/0007-18", idplanodecontas: "6", cdchamadaconta: "799", nmconta: "Ciplan" },
      { codfornecedor: "02444585000164", idplanodecontas: "6", cdchamadaconta: "125", nmconta: "Fornecedor A" },
      { codfornecedor: "11111111000191", idplanodecontas: "6", cdchamadaconta: "", nmconta: "" },
      { codfornecedor: "22222222000191", idplanodecontas: "6", cdchamadaconta: "9999", nmconta: "não existe" },
      { codfornecedor: "33333333000191", idplanodecontas: "2", cdchamadaconta: "799", nmconta: "outro plano" },
    ],
    cadfism: [
      { idcodigo: "5102", nmnome: "VENDA", sttipo: "S", cdcontavicontabil: "4", cdcontaviicm: null, cdcontaviicmst: null, cdcontaviipi: null },
      { idcodigo: "1102", nmnome: "COMPRA", sttipo: "E", cdcontavicontabil: "0", cdcontaviicm: null, cdcontaviicmst: null, cdcontaviipi: null },
      { idcodigo: "112", nmnome: "COMPRAS (formato antigo)", sttipo: "E", cdcontavicontabil: "1", cdcontaviicm: "2", cdcontaviicmst: null, cdcontaviipi: "3" },
    ],
    cfg: [{ idplanodecontas: "6", dsclasssinteticocli: "1-1-04-01", dsclasssinteticofor: "2-1-03-01", descricao: "EMPRESA" }],
  });
  assert.deepEqual(r.regras.map((x) => [x.tipo, x.chave, x.conta]), [
    ["fornecedor", "00057240000718", "2.1.03.01.05"], ["fornecedor", "02444585000164", "1.1.05.01.01"],
    ["cfop_saida", "5102", "3.1.01.01.01"], ["grupo_clientes", "clientes", "1.1.04.01"], ["grupo_fornecedores", "fornecedores", "2.1.03.01"],
  ]);
  assert.deepEqual(r.lidos, { fornecedores: 4, fornecedoresComConta: 3, codigosFiscais: 3, codigosFiscaisComConta: 2, configuracoes: 1 });
  assert.ok(r.avisos.some((a) => a.includes("22222222000191")), "conta que não está no plano vira aviso");
  assert.ok(r.avisos.some((a) => a.includes("Código fiscal 112")));
  assert.deepEqual(compararRegras(r.regras, r.regras), []);
  assert.equal(compararRegras(r.regras, r.regras.slice(1)).length, 1);
});

test("reconciliador: entrada do fornecedor com regra vai a crédito na conta dele; sem regra, nada muda; quem grava confere pela mesma regra", () => {
  const contas = [
    { codigo: "1.1.04.01.01", tipo: "analitica" }, { codigo: "2.1.01.01.01", tipo: "analitica" }, { codigo: "2.1.03.01.05", tipo: "analitica" },
    { codigo: "3.1.01.01.01", tipo: "analitica" }, { codigo: "3.1.01.01.09", tipo: "analitica" }, { codigo: "2.1.03.01", tipo: "sintetica" }, { codigo: "1.1.01.01.01", tipo: "analitica", nome: "Caixa" },
  ];
  const regras: RegrasIntegracaoContas = { fornecedores: { "00057240000718": "2.1.03.01.05", "99999999000100": "2.1.03.01" }, cfopEntrada: {}, cfopSaida: { "5102": "3.1.01.01.09" } };
  const entrada = { contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "2.1.01.01.01" };
  const refE = "FISCAL:11222333000181:2026-03:Entrada:52260300057240000718550010000000011000000010";
  const par = contasDoRascunhoFiscal(refE, entrada, contas, contasPelasRegras(regras, "Entrada", { cnpjEmitente: "00.057.240/0007-18", cfop: "1102" }, contas));
  assert.deepEqual(par, { debito: "1.1.04.01.01", credito: "2.1.03.01.05" });
  assert.equal(contasDoRascunhoConferem({ referenciaOrigem: refE, contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "2.1.03.01.05" }, entrada, contas, regras), true);
  assert.equal(contasDoRascunhoConferem({ referenciaOrigem: refE, contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "2.1.03.01.05" }, entrada, contas, null), false, "sem as regras, só o mapeamento vale");
  assert.equal(contasDoRascunhoConferem({ referenciaOrigem: refE, contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "3.1.01.01.01" }, entrada, contas, regras), false, "conta que nenhuma regra manda é recusada");
  assert.deepEqual(contasDoRascunhoFiscal(refE, entrada, contas, contasPelasRegras(regras, "Entrada", { cnpjEmitente: "99999999000100", cfop: "1102" }, contas)), { debito: "1.1.04.01.01", credito: "2.1.01.01.01" }, "regra com conta sintética não vale");
  assert.deepEqual(contasDoRascunhoFiscal(refE, entrada, contas, contasPelasRegras(null, "Entrada", { cnpjEmitente: "00057240000718" }, contas)), { debito: "1.1.04.01.01", credito: "2.1.01.01.01" });
  const saida = { contaDebitoCodigo: "1.1.04.01.01", contaCreditoCodigo: "3.1.01.01.01" };
  const refS = "FISCAL:11222333000181:2026-03:Saida:52260311222333000181550010000000011000000010";
  assert.deepEqual(contasDoRascunhoFiscal(refS, saida, contas, contasPelasRegras(regras, "Saida", { cfop: "5102" }, contas)), { debito: "1.1.04.01.01", credito: "3.1.01.01.09" });
  assert.deepEqual(contasDoRascunhoFiscal("FISCAL:11222333000181:2026-03:Saida:nfse-1", saida, contas, { credito: "3.1.01.01.09" }), null, "NFS-e segue a regra própria (sem conta de serviços, sem rascunho)");
});
