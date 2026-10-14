import type { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil } from "../types";

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

export interface LeituraMigracaoContabil {
  contas: ContaPlano[];
  centrosCusto: CentroCustoContabil[];
  lancamentos: LancamentoContabil[];
  erros: ErroLinhaMigracao[];
  avisos: string[];
  arquivosLidos: string[];
  empresa?: { cnpj: string; razaoSocial: string };
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
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
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
  const inferredLevel = Math.min(4, Math.max(1, depth > 1 ? depth : compactLength <= 1 ? 1 : compactLength <= 4 ? 2 : compactLength <= 7 ? 3 : 4)) as 1 | 2 | 3 | 4;
  const explicitLevel = Number(buscar(row, aliases.nivel));
  const nivel = Number.isInteger(explicitLevel) && explicitLevel >= 1 && explicitLevel <= 4 ? explicitLevel as 1 | 2 | 3 | 4 : inferredLevel;
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
  return value?.formato === "murade-contabil-migration" && value?.versao === 1 &&
    typeof value?.empresa?.cnpj === "string" && typeof value?.empresa?.razaoSocial === "string" &&
    Array.isArray(value.planoContas) && value.planoContas.every((item: any) => typeof item?.codigo === "string" && typeof item?.descricao === "string" && ["D", "C"].includes(item?.natureza)) &&
    Array.isArray(value.centrosCusto) && value.centrosCusto.every((item: any) => typeof item?.codigo === "string" && typeof item?.nome === "string") &&
    Array.isArray(value.lancamentos) && value.lancamentos.every((item: any) => typeof item?.id === "string" && typeof item?.data === "string" && typeof item?.contaDebitoCodigo === "string" && typeof item?.contaCreditoCodigo === "string" && Number.isFinite(item?.valor) && typeof item?.historico === "string");
}

export async function lerArquivosContabeis(files: File[], origem: OrigemMigracaoContabil, cnpjAtivo = ""): Promise<LeituraMigracaoContabil> {
  const result: LeituraMigracaoContabil = { contas: [], centrosCusto: [], lancamentos: [], erros: [], avisos: [], arquivosLidos: [] };
  for (const file of files) {
    if (file.size > 30 * 1024 * 1024) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "Arquivo acima do limite de 30 MB." }); continue; }
    const bytes = await file.arrayBuffer();
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
    result.arquivosLidos.push(file.name);
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
          result.empresa = parsed.empresa;
          result.contas.push(...parsed.planoContas);
          result.centrosCusto.push(...parsed.centrosCusto);
          result.lancamentos.push(...parsed.lancamentos);
        } else result.erros.push({ arquivo: file.name, linha: 0, motivo: "JSON não é um pacote Murade Contábil compatível (versão 1)." });
      } catch { result.erros.push({ arquivo: file.name, linha: 0, motivo: "JSON inválido." }); }
      continue;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) { result.erros.push({ arquivo: file.name, linha: 0, motivo: "Formato não suportado. Use CSV, TXT delimitado ou pacote JSON Murade." }); continue; }
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
      if (ignoradas > 0) result.avisos.push(`${file.name}: ${ignoradas} linha(s) de outro CNPJ ou sem CNPJ foram excluídas da importação.`);
      if (!correspondentes.length) {
        result.erros.push({ arquivo: file.name, linha: 0, motivo: `Nenhuma linha corresponde ao CNPJ ativo ${cnpjAtivo}.` });
        continue;
      }
      rows.splice(0, rows.length, ...correspondentes);
    }
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
    if (seenAccounts.has(item.codigo)) { result.avisos.push(`Conta duplicada ${item.codigo} no arquivo; mantida a primeira ocorrência.`); return false; }
    seenAccounts.add(item.codigo); return true;
  });
  const seenCenters = new Set<string>();
  result.centrosCusto = result.centrosCusto.filter((item) => {
    if (seenCenters.has(item.codigo)) { result.avisos.push(`Centro de custo duplicado ${item.codigo}; mantida a primeira ocorrência.`); return false; }
    seenCenters.add(item.codigo); return true;
  });
  const seenEntries = new Set<string>();
  result.lancamentos = result.lancamentos.filter((item) => {
    if (seenEntries.has(item.id)) { result.avisos.push(`Lançamento duplicado (${item.id}) no arquivo; mantida a primeira ocorrência.`); return false; }
    seenEntries.add(item.id); return true;
  });
  if (origem !== "CSV") result.avisos.push(`Origem selecionada: ${origem}. A leitura usa nomes de colunas reconhecidos; layouts proprietários precisam ser exportados como CSV/TXT com cabeçalho.`);
  return result;
}

export function validarLancamentosContraPlano(lancamentos: LancamentoContabil[], contasAtuais: ContaPlano[], contasImportadas: ContaPlano[]): ErroLinhaMigracao[] {
  const validCodes = new Set([...contasAtuais, ...contasImportadas].map((conta) => conta.codigo));
  return lancamentos.flatMap((lancamento, index) => {
    const faltantes = [lancamento.contaDebitoCodigo, lancamento.contaCreditoCodigo].filter((codigo) => !validCodes.has(codigo));
    return faltantes.length ? [{ arquivo: "Lançamentos", linha: index + 1, motivo: `Conta não encontrada no plano importado ou atual: ${faltantes.join(", ")}.` }] : [];
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
