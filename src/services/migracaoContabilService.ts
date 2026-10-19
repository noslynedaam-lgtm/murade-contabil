import type { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil } from "../types";
import { getTextContent, parseXml, type XmlElement } from "@f-o-t/xml";

export type OrigemMigracaoContabil = "ALTERDATA" | "DOMINIO" | "ATRON" | "CSV";

export interface PacoteMigracaoContabil {
  formato: "murade-contabil-migration";
  versao: 1;
  exportadoEm: string;
  empresa: { cnpj: string; razaoSocial: string };
  planoContas: ContaPlano[];
  centrosCusto: CentroCustoContabil[];
  lancamentos: LancamentoContabil[];
}

export interface ErroLinhaMigracao {
  arquivo: string;
  linha: number;
  motivo: string;
}

export interface DocumentoXmlContabilPreview {
  arquivo: string;
  modelo: string;
  chaveAcesso: string;
  dataEmissao: string;
  cnpjEmitente: string;
  cnpjDestinatario: string;
  emitente: string;
  valorTotal: string;
  valorProdutos: string;
  valorBaseIcms: string;
  valorIcms: string;
  valorIcmsDesonerado: string;
  valorIcmsSt: string;
  valorBaseIcmsSt: string;
  valorFcp: string;
  valorFcpSt: string;
  valorFcpStRetido: string;
  valorDifalDestino: string;
  valorFcpDestino: string;
  valorDifalOrigem: string;
  valorPisSt: string;
  valorCofinsSt: string;
  valorIi: string;
  valorIpi: string;
  valorIpiDevolvido: string;
  valorPis: string;
  valorCofins: string;
  valorTributosTotais: string;
  itens: number;
}

export interface LeituraMigracaoContabil {
  contas: ContaPlano[];
  centrosCusto: CentroCustoContabil[];
  lancamentos: LancamentoContabil[];
  erros: ErroLinhaMigracao[];
  avisos: string[];
  arquivosLidos: string[];
  empresa?: { cnpj: string; razaoSocial: string };
  documentosXml: DocumentoXmlContabilPreview[];
}

function descendentesXml(elemento: XmlElement, nome: string): XmlElement[] {
  const encontrados: XmlElement[] = [];
  for (const filho of elemento.children) {
    if (filho.type !== "element") continue;
    if (filho.localName === nome) encontrados.push(filho);
    encontrados.push(...descendentesXml(filho, nome));
  }
  return encontrados;
}

function textoXml(elemento: XmlElement, nome: string): string {
  return descendentesXml(elemento, nome).map(getTextContent).find((valor) => valor.trim())?.trim() || "";
}

function resumirXmlNfe(arquivo: string, xml: string): DocumentoXmlContabilPreview {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com DTD/entidades não é aceito na prévia por segurança.");
  const root = parseXml(xml, { preserveComments: false, preserveProcessingInstructions: false }).root;
  if (!root || !["nfeProc", "NFe"].includes(root.localName)) throw new Error("O XML não é uma NF-e reconhecida (raiz nfeProc/NFe). Nenhum dado foi preparado.");
  const infNfe = descendentesXml(root, "infNFe")[0];
  if (!infNfe) throw new Error("NF-e sem grupo infNFe; não é possível montar a prévia.");
  const ide = descendentesXml(infNfe, "ide")[0];
  const emit = descendentesXml(infNfe, "emit")[0];
  const dest = descendentesXml(infNfe, "dest")[0];
  const total = descendentesXml(infNfe, "ICMSTot")[0];
  const itens = descendentesXml(infNfe, "det").length;
  const id = (infNfe.attributes || []).find((attribute) => attribute.name === "Id" || attribute.localName === "Id")?.value || "";
  const chaveAcesso = id.replace(/^NFe/i, "");
  return {
    arquivo,
    modelo: textoXml(ide || infNfe, "mod") || "NF-e",
    chaveAcesso,
    dataEmissao: textoXml(ide || infNfe, "dhEmi") || textoXml(ide || infNfe, "dEmi"),
    cnpjEmitente: textoXml(emit || infNfe, "CNPJ").replace(/[^0-9A-Za-z]/g, "").toUpperCase(),
    cnpjDestinatario: (textoXml(dest || infNfe, "CNPJ") || textoXml(dest || infNfe, "CPF")).replace(/[^0-9A-Za-z]/g, "").toUpperCase(),
    emitente: textoXml(emit || infNfe, "xNome"),
    valorTotal: textoXml(total || infNfe, "vNF"),
    valorProdutos: textoXml(total || infNfe, "vProd"),
    valorBaseIcms: textoXml(total || infNfe, "vBC"),
    valorIcms: textoXml(total || infNfe, "vICMS"),
    valorIcmsDesonerado: textoXml(total || infNfe, "vICMSDeson"),
    valorIcmsSt: textoXml(total || infNfe, "vST"),
    valorBaseIcmsSt: textoXml(total || infNfe, "vBCST"),
    valorFcp: textoXml(total || infNfe, "vFCP"),
    valorFcpSt: textoXml(total || infNfe, "vFCPST"),
    valorFcpStRetido: textoXml(total || infNfe, "vFCPSTRet"),
    valorDifalDestino: textoXml(total || infNfe, "vICMSUFDest"),
    valorFcpDestino: textoXml(total || infNfe, "vFCPUFDest"),
    valorDifalOrigem: textoXml(total || infNfe, "vICMSUFRemet"),
    valorPisSt: textoXml(total || infNfe, "vPISST"),
    valorCofinsSt: textoXml(total || infNfe, "vCOFINSST"),
    valorIi: textoXml(total || infNfe, "vII"),
    valorIpi: textoXml(total || infNfe, "vIPI"),
    valorIpiDevolvido: textoXml(total || infNfe, "vIPIDevol"),
    valorPis: textoXml(total || infNfe, "vPIS"),
    valorCofins: textoXml(total || infNfe, "vCOFINS"),
    valorTributosTotais: textoXml(total || infNfe, "vTotTrib"),
    itens,
  };
}

/** Creates a migration proposal only when XML tax totals are explicit zero and the user chose both accounts. */
export function criarPropostaContabilXml(
  documento: DocumentoXmlContabilPreview,
  cnpjAtivo: string,
  contaDebito: ContaPlano | undefined,
  contaCredito: ContaPlano | undefined,
): LancamentoContabil | null {
  const normalizar = (value: string) => value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const cnpj = normalizar(cnpjAtivo);
  const emitente = normalizar(documento.cnpjEmitente);
  const destinatario = normalizar(documento.cnpjDestinatario);
  const tributos = [documento.valorIcms, documento.valorIcmsDesonerado, documento.valorIcmsSt, documento.valorBaseIcmsSt,
    documento.valorFcp, documento.valorFcpSt, documento.valorFcpStRetido, documento.valorDifalDestino, documento.valorFcpDestino,
    documento.valorDifalOrigem, documento.valorPisSt, documento.valorCofinsSt, documento.valorIi, documento.valorIpi,
    documento.valorIpiDevolvido, documento.valorPis, documento.valorCofins];
  const total = Number(documento.valorTotal);
  const data = /^\d{4}-\d{2}-\d{2}/.exec(documento.dataEmissao)?.[0] || parseDate(documento.dataEmissao);
  const dataValida = Boolean(data && parseDate(data));
  const direction = emitente === cnpj ? "Fiscal — NFe Saída" : destinatario === cnpj ? "Fiscal — NFe Entrada" : null;
  if (!cnpj || !direction || !/^\d{44}$/.test(documento.chaveAcesso) || !dataValida || !Number.isFinite(total) || total <= 0
    || tributos.some((value) => value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) !== 0)
    || !contaDebito || !contaCredito || contaDebito.tipo !== "analitica" || contaCredito.tipo !== "analitica" || contaDebito.codigo === contaCredito.codigo) return null;
  const chave = documento.chaveAcesso;
  return {
    id: `mig-nfe-${chave}`,
    data,
    contaDebitoCodigo: contaDebito.codigo,
    contaDebitoNome: contaDebito.descricao,
    contaCreditoCodigo: contaCredito.codigo,
    contaCreditoNome: contaCredito.descricao,
    valor: Math.round((total + Number.EPSILON) * 100) / 100,
    historico: `NF-e importada — ${documento.emitente || "emitente não informado"} — proposta para conferência`,
    origem: direction,
    documentoRef: `XML-NFE:${chave}`,
    competencia: data.slice(0, 7),
  };
}

const normalizarChave = (valor: unknown) => String(valor ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const aliases = {
  codigoConta: ["codigo", "codigoconta", "codconta", "conta", "codigoreduzido", "codreduzido", "classificacao", "accountcode", "account"],
  descricaoConta: ["descricao", "descricaoconta", "nomeconta", "contacontabil", "accountname", "name"],
  nivel: ["nivel", "grau", "level", "grauconta"],
  tipoConta: ["tipoconta", "tipo", "sinteticaouanalitica", "naturezaconta"],
  natureza: ["natureza", "naturezasaldo", "saldonatureza", "debitooucredito", "dc", "naturezanormal"],
  saldo: ["saldoinicial", "saldoanterior", "saldoabertura", "saldo"],
  codigoCentro: ["codigocentrodecusto", "codcentrocusto", "codigocentrocusto", "codcentro", "codigo"],
  nomeCentro: ["centrodecusto", "nomecentrodecusto", "centrocusto", "nomecentro", "departamento", "unidade", "nome", "descricao"],
  paiCentro: ["centropai", "codigocentropai", "centrodecustopai"],
  data: ["data", "dat a", "datadolancamento", "dataescrituracao", "date"],
  debito: ["contadebito", "codigodebito", "debito", "codcontadebito", "contadevedora", "debitoaccount"],
  debitoNome: ["descricaodebito", "nomecontadebito", "contadebitonome"],
  credito: ["contacredito", "codigocredito", "credito", "codcontacredito", "contacredora", "creditaccount"],
  creditoNome: ["descricaocredito", "nomecontacredito", "contacreditonome"],
  valor: ["valor", "valororiginal", "valorlancamento", "montante", "amount"],
  historico: ["historico", "complemento", "descricao", "historicolancamento", "memo"],
  documento: ["documento", "documentoref", "numerodocumento", "referencia", "numero"],
  origem: ["origem", "sistemaorigem", "tipoorigem"],
  competencia: ["competencia", "mesano", "periodo"],
  codigoCentroLancamento: ["codigocentrodecusto", "codcentrocusto", "centrocusto", "centrodecusto"],
  centroDebito: ["centrocustodebito", "codigocentrocustodebito", "codcentrodebitocusto"],
  centroCredito: ["centrocustocredito", "codigocentrocustocredito"],
};

function buscar(row: Record<string, string>, keys: string[]): string {
  const indexed = new Map(Object.entries(row).map(([key, value]) => [normalizarChave(key), String(value ?? "").trim()]));
  for (const key of keys) {
    const value = indexed.get(normalizarChave(key));
    if (value) return value;
  }
  return "";
}

function parseDelimited(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiters = [";", "\t", ",", "|"];
  const delimiter = delimiters.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim()); cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some((part) => part !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((part) => part !== "")) rows.push(row);
  return rows;
}

function asObjects(text: string): Array<Record<string, string>> {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseMoney(input: string): number | null {
  const normalized = input.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const value = Number(normalized);
  return normalized && Number.isFinite(value) ? value : null;
}

function parseDate(input: string): string {
  const value = input.trim();
  const br = value.match(/^(\d{2})[/. -](\d{2})[/. -](\d{4})$/);
  if (br) {
    const normalized = `${br[3]}-${br[2]}-${br[1]}`;
    return Number.isNaN(Date.parse(`${normalized}T00:00:00Z`)) || new Date(`${normalized}T00:00:00Z`).toISOString().slice(0, 10) !== normalized ? "" : normalized;
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const normalized = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return Number.isNaN(Date.parse(`${normalized}T00:00:00Z`)) || new Date(`${normalized}T00:00:00Z`).toISOString().slice(0, 10) !== normalized ? "" : normalized;
  }
  return "";
}

function inferCategory(fileName: string, row: Record<string, string>): "conta" | "centro" | "lancamento" | null {
  const file = normalizarChave(fileName);
  const fields = new Set(Object.keys(row).map(normalizarChave));
  if (file.includes("centro") || file.includes("custo")) return "centro";
  if (file.includes("lanc") || file.includes("diario") || file.includes("movimento")) return "lancamento";
  if (file.includes("plano") || file.includes("conta")) return "conta";
  const hasDebit = aliases.debito.some((item) => fields.has(normalizarChave(item)));
  const hasCredit = aliases.credito.some((item) => fields.has(normalizarChave(item)));
  if (hasDebit && hasCredit) return "lancamento";
  const hasCode = aliases.codigoConta.some((item) => fields.has(normalizarChave(item)));
  const hasDescription = aliases.descricaoConta.some((item) => fields.has(normalizarChave(item)));
  if (hasCode && hasDescription) return "conta";
  const hasCenter = aliases.nomeCentro.some((item) => fields.has(normalizarChave(item)));
  if (hasCenter && fields.has("codigo") && !hasDescription) return "centro";
  return null;
}

function parseAccount(row: Record<string, string>, index: number, fileName: string, allRows: Array<Record<string, string>>, errors: ErroLinhaMigracao[]): ContaPlano | null {
  const codigo = buscar(row, aliases.codigoConta).replace(/\s/g, "");
  const descricao = buscar(row, aliases.descricaoConta);
  const naturezaRaw = normalizarChave(buscar(row, aliases.natureza));
  const natureza = ["c", "credora", "credito", "credit", "passivo", "patrimonio", "receita"].includes(naturezaRaw) ? "C" : ["d", "devedora", "debito", "debit", "ativo", "despesa", "custo"].includes(naturezaRaw) ? "D" : null;
  if (!codigo || !descricao || !natureza) {
    errors.push({ arquivo: fileName, linha: index + 2, motivo: "Plano de contas exige código, descrição e natureza D/C reconhecíveis." });
    return null;
  }
  const depth = codigo.split(/[./-]/).filter(Boolean).length;
  const compactLength = codigo.replace(/\D/g, "").length;
  const inferredLevel = Math.min(5, Math.max(1, depth > 1 ? depth : compactLength <= 1 ? 1 : compactLength <= 4 ? 2 : compactLength <= 7 ? 3 : compactLength <= 10 ? 4 : 5)) as 1 | 2 | 3 | 4 | 5;
  const explicitLevel = Number(buscar(row, aliases.nivel));
  const nivel = Number.isInteger(explicitLevel) && explicitLevel >= 1 && explicitLevel <= 5 ? explicitLevel as 1 | 2 | 3 | 4 | 5 : inferredLevel;
  const typeRaw = normalizarChave(buscar(row, aliases.tipoConta));
  const hasChild = allRows.some((other) => {
    const otherCode = buscar(other, aliases.codigoConta).replace(/\s/g, "");
    return otherCode !== codigo && otherCode.startsWith(codigo) && otherCode.length > codigo.length;
  });
  const tipo = typeRaw.includes("sint") || typeRaw === "s" ? "sintetica" : typeRaw.includes("anal") || typeRaw === "a" ? "analitica" : hasChild ? "sintetica" : "analitica";
  const saldoRaw = buscar(row, aliases.saldo);
  const saldoInicial = saldoRaw ? parseMoney(saldoRaw) ?? undefined : undefined;
  return { codigo, descricao, natureza, nivel, tipo, saldoInicial };
}

function parseCenter(row: Record<string, string>, index: number, fileName: string, errors: ErroLinhaMigracao[]): CentroCustoContabil | null {
  const nome = buscar(row, aliases.nomeCentro);
  const codigo = buscar(row, aliases.codigoCentro).replace(/\s/g, "") || `IMPORT-${index + 1}`;
  if (!nome) { errors.push({ arquivo: fileName, linha: index + 2, motivo: "Centro de custo sem nome/descrição." }); return null; }
  return { id: `cc-${codigo}`, codigo, nome, descricao: buscar(row, ["descricao", "observacao", "detalhe"]), centroPaiCodigo: buscar(row, aliases.paiCentro) || undefined };
}

function parseEntry(row: Record<string, string>, index: number, fileName: string, errors: ErroLinhaMigracao[]): LancamentoContabil | null {
  const data = parseDate(buscar(row, aliases.data));
  const contaDebitoCodigo = buscar(row, aliases.debito).replace(/\s/g, "");
  const contaCreditoCodigo = buscar(row, aliases.credito).replace(/\s/g, "");
  const valor = parseMoney(buscar(row, aliases.valor));
  const historico = buscar(row, aliases.historico);
  if (!data || !contaDebitoCodigo || !contaCreditoCodigo || valor === null || valor <= 0 || !historico) {
    errors.push({ arquivo: fileName, linha: index + 2, motivo: "Lançamento exige data, contas de débito/crédito, valor positivo e histórico." });
    return null;
  }
  const documentoRef = buscar(row, aliases.documento);
  const codigoCentro = buscar(row, aliases.codigoCentroLancamento);
  const codigoCentroDebito = buscar(row, aliases.centroDebito);
  const codigoCentroCredito = buscar(row, aliases.centroCredito);
  const unique = [data, documentoRef, contaDebitoCodigo, contaCreditoCodigo, valor.toFixed(2), historico].join("|");
  const id = `mig-${Array.from(unique).reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 7).toString(36)}`;
  const origemRaw = normalizarChave(buscar(row, aliases.origem));
  const origem: LancamentoContabil["origem"] = origemRaw.includes("fiscal") ? "Fiscal — NFe Entrada" : origemRaw === "dp" || origemRaw.includes("folha") ? "DP — Folha" : origemRaw.includes("finance") || origemRaw.includes("banco") ? "Financeiro / Bancos" : "Manual";
  const competencia = buscar(row, aliases.competencia);
  return {
    id, data, contaDebitoCodigo, contaDebitoNome: buscar(row, aliases.debitoNome) || contaDebitoCodigo,
    contaCreditoCodigo, contaCreditoNome: buscar(row, aliases.creditoNome) || contaCreditoCodigo,
    valor, historico, origem, documentoRef: documentoRef || undefined, competencia: competencia || undefined,
    centroCustoCodigo: codigoCentro || undefined,
    centroCustoDebitoCodigo: codigoCentroDebito || undefined,
    centroCustoCreditoCodigo: codigoCentroCredito || undefined,
  };
}

// Layout oficial Alterdata Específico Modelo 1 (9 colunas) e Modelo 2 (10 colunas).
function parseAlterdataTextoContabil(rows: string[][], fileName: string, errors: ErroLinhaMigracao[]): LancamentoContabil[] | null {
  const primeira = rows.find((row) => row.some((cell) => cell.trim()));
  if (!primeira || primeira.length < 9 || !parseDate(primeira[3] || "") || parseMoney(primeira[4] || "") === null) return null;
  const modelo = primeira.length >= 10 ? 2 : 1;
  const saida: LancamentoContabil[] = [];
  rows.forEach((row, index) => {
    if (!row.some((cell) => cell.trim())) return;
    const [codigoAuto, debito, credito, dataRaw, valorRaw] = row;
    const data = parseDate(dataRaw || "");
    const valor = parseMoney(valorRaw || "");
    const centroDebito = (row[5] || "").trim();
    const centroCredito = modelo === 2 ? (row[6] || "").trim() : centroDebito;
    const historico = (row[modelo === 2 ? 8 : 7] || "").trim() || (codigoAuto || "").trim();
    const documentoRef = (row[modelo === 2 ? 9 : 8] || "").trim();
    if (!data || !debito?.trim() || !credito?.trim() || valor === null || valor <= 0 || !historico) {
      errors.push({ arquivo: fileName, linha: index + 1, motivo: `Registro incompatível com o Modelo ${modelo} do TXT Contábil Alterdata.` });
      return;
    }
    const chave = [data, documentoRef, debito.trim(), credito.trim(), valor.toFixed(2), historico].join("|");
    const id = `mig-${Array.from(chave).reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 7).toString(36)}`;
    saida.push({
      id, data, contaDebitoCodigo: debito.trim(), contaDebitoNome: debito.trim(),
      contaCreditoCodigo: credito.trim(), contaCreditoNome: credito.trim(), valor, historico,
      origem: "Manual", documentoRef: documentoRef || undefined,
      centroCustoCodigo: modelo === 1 ? centroDebito || undefined : undefined,
      centroCustoDebitoCodigo: modelo === 2 ? centroDebito || undefined : undefined,
      centroCustoCreditoCodigo: modelo === 2 ? centroCredito || undefined : undefined,
    });
  });
  return saida;
}

function isPackage(value: any): value is PacoteMigracaoContabil {
  const origensPermitidas = new Set(["Cadastro", "Fiscal — NFe Entrada", "Fiscal — NFe Saída", "Fiscal — Apuração ICMS", "DP — Folha", "DP — INSS", "DP — INSS patronal", "DP — IRRF", "DP — FGTS", "Financeiro / Bancos", "Manual"]);
  const chavesPermitidas = (item: any, permitidas: string[]) => item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).every((key) => permitidas.includes(key));
  const camposConta = ["codigo", "descricao", "nivel", "tipo", "natureza", "saldoInicial", "saldoInicialCompetencia", "saldoInicialConvertidoEm"];
  const camposCentro = ["id", "codigo", "nome", "descricao", "centroPaiCodigo"];
  const camposLancamento = ["id", "data", "contaDebitoCodigo", "contaDebitoNome", "contaCreditoCodigo", "contaCreditoNome", "valor", "historico", "origem", "documentoRef", "competencia", "centroCustoCodigo", "centroCustoNome", "centroCustoDebitoCodigo", "centroCustoCreditoCodigo", "estornoDe", "statusManual", "saldoInicialContaCodigo", "sistemaMigracao", "classificacaoDeclaradaArquivo"];
  return chavesPermitidas(value, ["formato", "versao", "exportadoEm", "empresa", "planoContas", "centrosCusto", "lancamentos"]) && value.formato === "murade-contabil-migration" && value.versao === 1 && typeof value.exportadoEm === "string" && Number.isFinite(Date.parse(value.exportadoEm)) &&
    chavesPermitidas(value.empresa, ["cnpj", "razaoSocial"]) && typeof value.empresa.cnpj === "string" && /^[A-Z0-9]{12}[0-9]{2}$/.test(value.empresa.cnpj.replace(/[^0-9a-z]/gi, "").toUpperCase()) && typeof value.empresa.razaoSocial === "string" && value.empresa.razaoSocial.trim().length > 0 && value.empresa.razaoSocial.length <= 240 &&
    Array.isArray(value.planoContas) && value.planoContas.length <= 20000 && value.planoContas.every((item: any) => chavesPermitidas(item, camposConta) && typeof item.codigo === "string" && item.codigo.trim().length > 0 && item.codigo.length <= 64 && typeof item.descricao === "string" && item.descricao.length <= 240 && Number.isInteger(item.nivel) && item.nivel >= 1 && item.nivel <= 5 && ["sintetica", "analitica"].includes(item.tipo) && ["D", "C"].includes(item.natureza) && (item.saldoInicial == null || (Number.isFinite(item.saldoInicial) && Math.abs(item.saldoInicial) <= 999999999999)) && (item.saldoInicialCompetencia == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(item.saldoInicialCompetencia)) && (item.saldoInicialConvertidoEm == null || typeof item.saldoInicialConvertidoEm === "string")) &&
    Array.isArray(value.centrosCusto) && value.centrosCusto.length <= 20000 && value.centrosCusto.every((item: any) => chavesPermitidas(item, camposCentro) && typeof item.codigo === "string" && item.codigo.trim().length > 0 && item.codigo.length <= 64 && typeof item.nome === "string" && item.nome.trim().length > 0 && item.nome.length <= 240 && (item.descricao == null || typeof item.descricao === "string") && (item.centroPaiCodigo == null || typeof item.centroPaiCodigo === "string")) &&
    Array.isArray(value.lancamentos) && value.lancamentos.length <= 20000 && value.lancamentos.every((item: any) => chavesPermitidas(item, camposLancamento) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200 && typeof item.data === "string" && Boolean(parseDate(item.data)) && typeof item.contaDebitoCodigo === "string" && item.contaDebitoCodigo.length > 0 && item.contaDebitoCodigo.length <= 64 && typeof item.contaCreditoCodigo === "string" && item.contaCreditoCodigo.length > 0 && item.contaCreditoCodigo.length <= 64 && Number.isFinite(item.valor) && item.valor > 0 && item.valor <= 999999999999 && typeof item.historico === "string" && item.historico.trim().length > 0 && item.historico.length <= 240 && origensPermitidas.has(item.origem) && (item.competencia == null || /^\d{4}-(0[1-9]|1[0-2])$/.test(item.competencia)) && ["pendente_aprovacao", "aprovado", "rejeitado", undefined, null].includes(item.statusManual) && (item.documentoRef == null || (typeof item.documentoRef === "string" && item.documentoRef.length <= 200)));
}

export async function lerArquivosContabeis(files: File[], origem: OrigemMigracaoContabil, cnpjAtivo = ""): Promise<LeituraMigracaoContabil> {
  const result: LeituraMigracaoContabil = { contas: [], centrosCusto: [], lancamentos: [], erros: [], avisos: [], arquivosLidos: [], documentosXml: [] };
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "Arquivo acima do limite de 30 MB." }); continue; }
    const bytes = await file.arrayBuffer();
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
    result.arquivosLidos.push(file.name);
    if (/\.xml$/i.test(file.name)) {
      if (bytes.byteLength > 2_000_000) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "XML acima do limite de 2 MB para prévia." }); continue; }
      try {
        const documento = resumirXmlNfe(file.name, text);
        const cnpjNormalizado = cnpjAtivo.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
        const emitenteAtivo = documento.cnpjEmitente && documento.cnpjEmitente === cnpjNormalizado;
        const destinatarioAtivo = documento.cnpjDestinatario && documento.cnpjDestinatario === cnpjNormalizado;
        if (cnpjAtivo && !emitenteAtivo && !destinatarioAtivo) {
          result.erros.push({ arquivo: file.name, linha: 0, motivo: "CNPJ da empresa ativa não corresponde ao emitente nem ao destinatário deste XML. Prévia bloqueada para evitar misturar empresas." });
          continue;
        }
        result.documentosXml.push(documento);
        result.avisos.push(`${file.name}: NF-e lida para prévia; nenhum lançamento contábil foi criado. A conversão depende de mapeamento e aprovação do contador.`);
      } catch (error) {
        result.erros.push({ arquivo: file.name, linha: 0, motivo: error instanceof Error ? error.message : "XML inválido ou não reconhecido." });
      }
      continue;
    }
    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        if (isPackage(parsed)) {
          const pacoteCnpj = parsed.empresa.cnpj.replace(/[^0-9a-z]/gi, "").toUpperCase();
          const atualCnpj = cnpjAtivo.replace(/[^0-9a-z]/gi, "").toUpperCase();
          if (pacoteCnpj && atualCnpj && pacoteCnpj !== atualCnpj) {
            result.erros.push({ arquivo: file.name, linha: 0, motivo: `Pacote pertence ao CNPJ ${parsed.empresa.cnpj}, diferente da empresa ativa.` });
            continue;
          }
          result.empresa = { cnpj: pacoteCnpj, razaoSocial: parsed.empresa.razaoSocial.trim() };
          result.contas.push(...parsed.planoContas.map((item: any) => ({
            codigo: item.codigo.trim(), descricao: item.descricao.trim(), nivel: item.nivel, tipo: item.tipo, natureza: item.natureza,
            ...(Number.isFinite(item.saldoInicial) ? { saldoInicial: item.saldoInicial } : {}),
            ...(typeof item.saldoInicialCompetencia === "string" ? { saldoInicialCompetencia: item.saldoInicialCompetencia } : {}),
          })));
          result.centrosCusto.push(...parsed.centrosCusto.map((item: any) => ({
            id: typeof item.id === "string" ? item.id.slice(0, 128) : `cc-${item.codigo.trim()}`,
            codigo: item.codigo.trim(), nome: item.nome.trim(),
            ...(typeof item.descricao === "string" ? { descricao: item.descricao.slice(0, 500) } : {}),
            ...(typeof item.centroPaiCodigo === "string" ? { centroPaiCodigo: item.centroPaiCodigo.slice(0, 64) } : {}),
          })));
          result.lancamentos.push(...parsed.lancamentos.map((item: any) => ({
            id: item.id,
            data: parseDate(item.data),
            contaDebitoCodigo: item.contaDebitoCodigo,
            contaDebitoNome: typeof item.contaDebitoNome === "string" ? item.contaDebitoNome.slice(0, 240) : item.contaDebitoCodigo,
            contaCreditoCodigo: item.contaCreditoCodigo,
            contaCreditoNome: typeof item.contaCreditoNome === "string" ? item.contaCreditoNome.slice(0, 240) : item.contaCreditoCodigo,
            valor: item.valor,
            historico: item.historico.trim(),
            origem: item.origem,
            ...(typeof item.documentoRef === "string" ? { documentoRef: item.documentoRef.slice(0, 200) } : {}),
            ...(typeof item.competencia === "string" ? { competencia: item.competencia } : {}),
            ...(typeof item.centroCustoCodigo === "string" ? { centroCustoCodigo: item.centroCustoCodigo.slice(0, 64) } : {}),
            ...(typeof item.centroCustoNome === "string" ? { centroCustoNome: item.centroCustoNome.slice(0, 240) } : {}),
            ...(typeof item.centroCustoDebitoCodigo === "string" ? { centroCustoDebitoCodigo: item.centroCustoDebitoCodigo.slice(0, 64) } : {}),
            ...(typeof item.centroCustoCreditoCodigo === "string" ? { centroCustoCreditoCodigo: item.centroCustoCreditoCodigo.slice(0, 64) } : {}),
          })));
        } else result.erros.push({ arquivo: file.name, linha: 0, motivo: "JSON não é um pacote Murade Contábil compatível (versão 1)." });
      } catch { result.erros.push({ arquivo: file.name, linha: 0, motivo: "JSON inválido." }); }
      continue;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "Formato não suportado. Use CSV, TXT delimitado, XML de NF-e ou pacote JSON Murade." }); continue; }
    if (origem === "ALTERDATA") {
      const alterdataEntries = parseAlterdataTextoContabil(parseDelimited(text), file.name, result.erros);
      if (alterdataEntries) {
        result.lancamentos.push(...alterdataEntries);
        result.avisos.push(`${file.name}: reconhecido como TXT Contábil Alterdata, Modelo ${parseDelimited(text)[0]?.length >= 10 ? 2 : 1}.`);
        continue;
      }
    }
    const rows = asObjects(text);
    if (!rows.length) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "Arquivo sem cabeçalho e linhas de dados." }); continue; }
    const cnpjField = Object.keys(rows[0]).find((key) => ["cnpj", "cnpjempresa", "documentoempresa"].includes(normalizarChave(key)));
    if (cnpjField && cnpjAtivo) {
      const atualCnpj = cnpjAtivo.replace(/[^0-9a-z]/gi, "").toUpperCase();
      const correspondentes = rows.filter((row) => String(row[cnpjField] || "").replace(/[^0-9a-z]/gi, "").toUpperCase() === atualCnpj);
      const ignoradas = rows.length - correspondentes.length;
      if (ignoradas > 0) result.erros.push({ arquivo: file.name, linha: 0, motivo: `${ignoradas} linha(s) estão sem CNPJ ou pertencem a outro CNPJ. A importação inteira deste arquivo foi bloqueada; separe os dados por empresa e corrija as linhas antes de tentar novamente.` });
      if (!correspondentes.length) {
        result.erros.push({ arquivo: file.name, linha: 0, motivo: `Nenhuma linha corresponde ao CNPJ ativo ${cnpjAtivo}.` });
        continue;
      }
      rows.splice(0, rows.length, ...correspondentes);
    } else if (!cnpjField && cnpjAtivo) result.avisos.push(`${file.name}: o arquivo não informa CNPJ. Confira se todo o conteúdo pertence à empresa ativa antes de importar.`);
    const category = inferCategory(file.name, rows[0]);
    if (!category) { result.erros.push({ arquivo: file.name, linha: 1, motivo: "Não identifiquei se o arquivo contém plano de contas, centros de custo ou lançamentos. Ajuste o nome ou cabeçalho do CSV." }); continue; }
    if (origem === "CSV") result.avisos.push(`Arquivo ${file.name} lido com correspondência genérica pelo cabeçalho.`);
    rows.forEach((row, index) => {
      if (category === "conta") { const item = parseAccount(row, index, file.name, rows, result.erros); if (item) result.contas.push(item); }
      else if (category === "centro") { const item = parseCenter(row, index, file.name, result.erros); if (item) result.centrosCusto.push(item); }
      else { const item = parseEntry(row, index, file.name, result.erros); if (item) result.lancamentos.push(item); }
    });
  }
  const seenAccounts = new Set<string>();
  result.contas = result.contas.filter((item) => {
    if (seenAccounts.has(item.codigo)) { result.erros.push({ arquivo: "Plano de contas", linha: 0, motivo: `Código de conta duplicado (${item.codigo}) nos arquivos. A importação foi bloqueada para evitar descartar uma definição; resolva a duplicidade na origem.` }); return false; }
    seenAccounts.add(item.codigo); return true;
  });
  const seenCenters = new Set<string>();
  result.centrosCusto = result.centrosCusto.filter((item) => {
    if (seenCenters.has(item.codigo)) { result.erros.push({ arquivo: "Centros de custo", linha: 0, motivo: `Código de centro de custo duplicado (${item.codigo}) nos arquivos. A importação foi bloqueada para evitar descartar uma definição; resolva a duplicidade na origem.` }); return false; }
    seenCenters.add(item.codigo); return true;
  });
  const seenEntries = new Set<string>();
  result.lancamentos = result.lancamentos.filter((item) => {
    if (seenEntries.has(item.id)) { result.erros.push({ arquivo: "Lançamentos", linha: 0, motivo: `Há linhas de lançamento duplicadas ou indistinguíveis (${item.id}). A importação foi bloqueada para evitar descartar movimento; diferencie as referências no arquivo de origem e tente novamente.` }); return false; }
    seenEntries.add(item.id); return true;
  });
  const seenXmlKeys = new Set<string>();
  result.documentosXml = result.documentosXml.filter((item) => {
    if (!item.chaveAcesso || seenXmlKeys.has(item.chaveAcesso)) {
      result.erros.push({ arquivo: item.arquivo, linha: 0, motivo: "Chave de acesso da NF-e ausente ou repetida entre os arquivos. Corrija a seleção para evitar importação duplicada." });
      return false;
    }
    seenXmlKeys.add(item.chaveAcesso);
    return true;
  });
  if (origem !== "CSV") result.avisos.push(`Origem selecionada: ${origem}. A leitura usa nomes de colunas reconhecidos; layouts proprietários precisam ser exportados como CSV/TXT com cabeçalho.`);
  return result;
}

export function validarLancamentosContraPlano(lancamentos: LancamentoContabil[], contasAtuais: ContaPlano[], contasImportadas: ContaPlano[]): ErroLinhaMigracao[] {
  const contasPorCodigo = new Map([...contasAtuais, ...contasImportadas].map((conta) => [conta.codigo, conta]));
  return lancamentos.flatMap((lancamento, index) => {
    const invalidas = [lancamento.contaDebitoCodigo, lancamento.contaCreditoCodigo].flatMap((codigo) => {
      const conta = contasPorCodigo.get(codigo);
      if (!conta) return [`${codigo} (não encontrada)`];
      if (conta.tipo !== "analitica") return [`${codigo} (conta sintética; use uma conta analítica)`];
      return [];
    });
    return invalidas.length ? [{ arquivo: "Lançamentos", linha: index + 1, motivo: `Conta(s) incompatível(is): ${invalidas.join(", ")}.` }] : [];
  });
}

export function criarPacoteMigracaoContabil(empresa: EmpresaDados, planoContas: ContaPlano[], centrosCusto: CentroCustoContabil[], lancamentos: LancamentoContabil[]): PacoteMigracaoContabil {
  return { formato: "murade-contabil-migration", versao: 1, exportadoEm: new Date().toISOString(), empresa: { cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial }, planoContas, centrosCusto, lancamentos };
}

export function baixarPacoteMigracaoContabil(pacote: PacoteMigracaoContabil): void {
  const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `murade-contabil-${pacote.empresa.cnpj.replace(/\W/g, "") || "empresa"}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
