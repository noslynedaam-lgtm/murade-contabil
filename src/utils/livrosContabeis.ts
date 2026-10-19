import { ContaPlano, LancamentoContabil } from "../types";

export type PeriodoContabil = string | "todos";

export interface LancamentoValidado {
  original: LancamentoContabil;
  dataISO: string;
  valorCentavos: number;
  debito: ContaPlano;
  credito: ContaPlano;
}

export interface LinhaRazao {
  conta: ContaPlano;
  dataISO: string;
  referencia: string;
  historico: string;
  origem: LancamentoContabil["origem"];
  contraPartidaCodigo: string;
  contraPartidaNome: string;
  debitoCentavos: number;
  creditoCentavos: number;
  saldoDevedorCentavos: number;
  saldoCredorCentavos: number;
}

export interface LinhaBalanceteContabil {
  conta: ContaPlano;
  debitoPeriodoCentavos: number;
  creditoPeriodoCentavos: number;
  saldoDevedorCentavos: number;
  saldoCredorCentavos: number;
}

export interface RelatoriosContabeis {
  validos: LancamentoValidado[];
  invalidos: LancamentoContabil[];
  doPeriodo: LancamentoValidado[];
  razao: LinhaRazao[];
  balancete: LinhaBalanceteContabil[];
  totalDebitosCentavos: number;
  totalCreditosCentavos: number;
  totalSaldoDevedorCentavos: number;
  totalSaldoCredorCentavos: number;
  saldosIniciaisPendentes: ContaPlano[];
}

export function normalizarDataContabil(data: string): string | null {
  const valor = String(data || "").trim();
  let ano: number;
  let mes: number;
  let dia: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (iso) [, ano, mes, dia] = iso.map(Number) as [string, number, number, number];
  else if (br) [, dia, mes, ano] = br.map(Number) as [string, number, number, number];
  else return null;
  const dataUTC = new Date(Date.UTC(ano, mes - 1, dia));
  if (dataUTC.getUTCFullYear() !== ano || dataUTC.getUTCMonth() !== mes - 1 || dataUTC.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function converterCentavos(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  // Meio centavo arredonda para cima (em módulo). O toPrecision remove o ruído binário
  // (ex.: 10.075 * 100 = 1007.4999999999999) antes de arredondar.
  const arredondado = Math.round(Number((Math.abs(numero) * 100).toPrecision(15)));
  const centavos = numero < 0 ? -arredondado : arredondado;
  return Number.isSafeInteger(centavos) ? (centavos === 0 ? 0 : centavos) : null;
}

function dataNoPeriodo(dataISO: string, periodo: PeriodoContabil): boolean {
  return periodo === "todos" || dataISO.slice(0, 7) === periodo;
}

function ordenarLancamentos(a: LancamentoValidado, b: LancamentoValidado): number {
  return a.dataISO.localeCompare(b.dataISO)
    || String(a.original.documentoRef || a.original.id).localeCompare(String(b.original.documentoRef || b.original.id))
    || a.original.id.localeCompare(b.original.id);
}

function aplicarLancamento(saldoDevedorMenosCredor: number, item: LancamentoValidado, codigoConta: string): number {
  if (item.debito.codigo === codigoConta) return saldoDevedorMenosCredor + item.valorCentavos;
  if (item.credito.codigo === codigoConta) return saldoDevedorMenosCredor - item.valorCentavos;
  return saldoDevedorMenosCredor;
}

function saldoInicialAplicavel(conta: ContaPlano, periodo: PeriodoContabil): number {
  if (conta.saldoInicialConvertidoEm) return 0;
  const saldo = converterCentavos(conta.saldoInicial ?? 0) ?? 0;
  const competencia = String(conta.saldoInicialCompetencia || "");
  if (!saldo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return 0;
  if (periodo !== "todos" && competencia > periodo) return 0;
  return saldo * (conta.natureza === "D" ? 1 : -1);
}

function movimentoDentroDaAbertura(conta: ContaPlano, item: LancamentoValidado, periodo: PeriodoContabil): boolean {
  const saldo = converterCentavos(conta.saldoInicial ?? 0) ?? 0;
  const competenciaBase = String(conta.saldoInicialCompetencia || "");
  if (!saldo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competenciaBase)) return true;
  // A abertura é o saldo anterior aos movimentos da competência-base. Para
  // períodos posteriores, movimentos anteriores à abertura já estão contidos
  // no saldo informado e não podem ser somados novamente.
  if (periodo === "todos") return item.dataISO.slice(0, 7) >= competenciaBase;
  if (periodo >= competenciaBase) return item.dataISO.slice(0, 7) >= competenciaBase;
  return true;
}

function competenciaBaseComum(contas: ContaPlano[]): string | null {
  const competencias = new Set(contas.flatMap((conta) => {
    const saldo = converterCentavos(conta.saldoInicial ?? 0) ?? 0;
    const competencia = String(conta.saldoInicialCompetencia || "");
    return saldo !== 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? [competencia] : [];
  }));
  return competencias.size === 1 ? [...competencias][0] : null;
}

export function gerarRelatoriosContabeis(
  contas: ContaPlano[],
  lancamentosDefinitivos: LancamentoContabil[],
  periodo: PeriodoContabil,
): RelatoriosContabeis {
  const porCodigo = new Map(contas.map((conta) => [conta.codigo, conta]));
  const validos: LancamentoValidado[] = [];
  const invalidos: LancamentoContabil[] = [];

  for (const original of lancamentosDefinitivos) {
    if (original.statusManual === "pendente_aprovacao" || original.statusManual === "rejeitado") continue;
    const dataISO = normalizarDataContabil(original.data);
    const valorCentavos = converterCentavos(original.valor);
    const debito = porCodigo.get(original.contaDebitoCodigo);
    const credito = porCodigo.get(original.contaCreditoCodigo);
    const competenciaInconsistente = Boolean(original.competencia && dataISO && original.competencia !== dataISO.slice(0, 7));
    if (!dataISO || valorCentavos === null || valorCentavos <= 0 || !String(original.historico || "").trim()
      || !debito || !credito || debito.tipo !== "analitica" || credito.tipo !== "analitica"
      || debito.codigo === credito.codigo || competenciaInconsistente) {
      invalidos.push(original);
      continue;
    }
    validos.push({ original, dataISO, valorCentavos, debito, credito });
  }

  validos.sort(ordenarLancamentos);
  const competenciasBase = new Set(contas.flatMap((conta) => {
    const saldo = converterCentavos(conta.saldoInicial ?? 0) ?? 0;
    const competencia = String(conta.saldoInicialCompetencia || "");
    return saldo !== 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? [competencia] : [];
  }));
  const saldosIniciaisPendentes = contas.filter((conta) => {
    const saldo = conta.saldoInicial == null ? 0 : converterCentavos(conta.saldoInicial);
    return saldo === null || (saldo !== 0 && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(conta.saldoInicialCompetencia || "")))
      || (competenciasBase.size > 1 && saldo !== 0);
  });
  const baseComum = competenciaBaseComum(contas);
  const doPeriodo = validos.filter((item) => dataNoPeriodo(item.dataISO, periodo)
    && (periodo !== "todos" || !baseComum || item.dataISO.slice(0, 7) >= baseComum));
  const totalDebitosCentavos = doPeriodo.reduce((soma, item) => soma + item.valorCentavos, 0);
  const totalCreditosCentavos = totalDebitosCentavos;

  const razao: LinhaRazao[] = [];
  for (const conta of contas.filter((item) => item.tipo === "analitica")) {
    let saldo = saldoInicialAplicavel(conta, periodo);
    for (const item of validos) {
      if (periodo !== "todos" && item.dataISO.slice(0, 7) < periodo && movimentoDentroDaAbertura(conta, item, periodo)) saldo = aplicarLancamento(saldo, item, conta.codigo);
    }
    const doRazao = doPeriodo.filter((item) =>
      (item.debito.codigo === conta.codigo || item.credito.codigo === conta.codigo)
      && movimentoDentroDaAbertura(conta, item, periodo));
    if (saldo !== 0) {
      razao.push({
        conta,
        dataISO: periodo === "todos" ? "" : `${periodo}-00`,
        referencia: "",
        historico: "Saldo anterior",
        origem: "Cadastro",
        contraPartidaCodigo: "",
        contraPartidaNome: "",
        debitoCentavos: Math.max(0, saldo),
        creditoCentavos: Math.max(0, -saldo),
        saldoDevedorCentavos: Math.max(0, saldo),
        saldoCredorCentavos: Math.max(0, -saldo),
      });
    }
    for (const item of doRazao) {
      saldo = aplicarLancamento(saldo, item, conta.codigo);
      const debitoNestaConta = item.debito.codigo === conta.codigo;
      const contraPartida = debitoNestaConta ? item.credito : item.debito;
      razao.push({
        conta,
        dataISO: item.dataISO,
        referencia: String(item.original.documentoRef || item.original.id),
        historico: item.original.historico,
        origem: item.original.origem,
        contraPartidaCodigo: contraPartida.codigo,
        contraPartidaNome: contraPartida.descricao,
        debitoCentavos: debitoNestaConta ? item.valorCentavos : 0,
        creditoCentavos: debitoNestaConta ? 0 : item.valorCentavos,
        saldoDevedorCentavos: Math.max(0, saldo),
        saldoCredorCentavos: Math.max(0, -saldo),
      });
    }
  }

  const movimentos = new Map<string, { debito: number; credito: number }>();
  const adicionarMovimento = (codigo: string, debito: number, credito: number) => {
    const atual = movimentos.get(codigo) || { debito: 0, credito: 0 };
    atual.debito += debito;
    atual.credito += credito;
    movimentos.set(codigo, atual);
  };
  for (const item of doPeriodo) {
    if (movimentoDentroDaAbertura(item.debito, item, periodo)) adicionarMovimento(item.debito.codigo, item.valorCentavos, 0);
    if (movimentoDentroDaAbertura(item.credito, item, periodo)) adicionarMovimento(item.credito.codigo, 0, item.valorCentavos);
  }

  const balancete = contas.map((conta): LinhaBalanceteContabil => {
    const proprio = movimentos.get(conta.codigo) || { debito: 0, credito: 0 };
    const movimentoConta = { ...proprio };
    let saldoAssinado = conta.tipo === "analitica" ? saldoInicialAplicavel(conta, periodo) : 0;

    for (const movimento of validos) {
      if (periodo !== "todos" && movimento.dataISO.slice(0, 7) > periodo) continue;
      if (!movimentoDentroDaAbertura(conta, movimento, periodo)) continue;
      if (movimento.debito.codigo === conta.codigo) saldoAssinado += movimento.valorCentavos;
      if (movimento.credito.codigo === conta.codigo) saldoAssinado -= movimento.valorCentavos;
    }

    if (conta.tipo === "sintetica") {
      saldoAssinado = 0;
      for (const filha of contas) {
        if (filha.tipo !== "analitica" || !filha.codigo.startsWith(`${conta.codigo}.`)) continue;
        saldoAssinado += saldoInicialAplicavel(filha, periodo);
        for (const movimento of validos) {
          if (periodo !== "todos" && movimento.dataISO.slice(0, 7) > periodo) continue;
          if (!movimentoDentroDaAbertura(filha, movimento, periodo)) continue;
          if (movimento.debito.codigo === filha.codigo) saldoAssinado += movimento.valorCentavos;
          if (movimento.credito.codigo === filha.codigo) saldoAssinado -= movimento.valorCentavos;
        }
        const movimentosFilha = movimentos.get(filha.codigo);
        if (movimentosFilha) {
          movimentoConta.debito += movimentosFilha.debito;
          movimentoConta.credito += movimentosFilha.credito;
        }
      }
    }

    return {
      conta,
      debitoPeriodoCentavos: movimentoConta.debito,
      creditoPeriodoCentavos: movimentoConta.credito,
      saldoDevedorCentavos: Math.max(0, saldoAssinado),
      saldoCredorCentavos: Math.max(0, -saldoAssinado),
    };
  });

  const linhasAnaliticas = balancete.filter((item) => item.conta.tipo === "analitica");
  return {
    validos,
    invalidos,
    doPeriodo,
    razao,
    balancete,
    totalDebitosCentavos,
    totalCreditosCentavos,
    totalSaldoDevedorCentavos: linhasAnaliticas.reduce((soma, item) => soma + item.saldoDevedorCentavos, 0),
    totalSaldoCredorCentavos: linhasAnaliticas.reduce((soma, item) => soma + item.saldoCredorCentavos, 0),
    saldosIniciaisPendentes,
  };
}

export function moedaContabil(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataLegivelContabil(dataISO: string): string {
  if (!dataISO || dataISO.endsWith("-00")) return "Saldo anterior";
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function escaparXml(valor: unknown): string {
  return String(valor ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export type CelulaExcel = string | number;

export function gerarWorkbookExcel(sheets: Array<{ nome: string; linhas: CelulaExcel[][] }>): string {
  const xmlRows = sheets.map(({ nome, linhas }) => {
    const rows = linhas.map((linha, index) => `<Row>${linha.map((valor, cellIndex) => {
      const numerica = typeof valor === "number" && Number.isFinite(valor);
      const estilo = index === 0 || index === 2 ? ` ss:StyleID="Cabecalho"` : cellIndex === 0 ? ` ss:StyleID="Texto"` : "";
      return `<Cell${estilo}><Data ss:Type="${numerica ? "Number" : "String"}">${escaparXml(numerica ? valor : valor)}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${escaparXml(nome.slice(0, 31))}"><Table>${rows}</Table></Worksheet>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>Livros contábeis locais</Title></DocumentProperties><Styles><Style ss:ID="Cabecalho"><Font ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style><Style ss:ID="Texto"><NumberFormat ss:Format="@"/></Style></Styles>${xmlRows}</Workbook>`;
}
