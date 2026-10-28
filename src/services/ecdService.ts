/**
 * Gerador do arquivo da ECD (Escrituração Contábil Digital) — Leiaute 9 (ADE Cofis 01/2026).
 *
 * Fonte dos campos e regras: "Manual de Orientação do Leiaute 9 da ECD" (RFB, jan/2026).
 * Escopo desta versão: livro Diário completo (IND_ESC = "G") com
 *   Bloco 0 (0000, 0001, 0990), Bloco I (I001, I010, I030, I050, I100, I150, I155, I200, I250, I990),
 *   Bloco J (J001, J900, J930, J990) e Bloco 9 (9001, 9900, 9990, 9999).
 * NÃO gera: J005/J100/J150 (balanço e DRE), I051/I052 (plano referencial/aglutinação), I012/I015,
 * I350/I355 (encerramento de resultado). O arquivo gerado deve ser validado no PGE do Sped Contábil
 * antes de assinar e transmitir.
 */
import { ContaPlano } from "../types";
import { LancamentoValidado } from "../utils/livrosContabeis";
import { existeContaReferencialAnalitica } from "./planoReferencialService";

export type CodigoNaturezaConta = "01" | "02" | "03" | "04" | "05" | "09";

export interface SignatarioECD {
  nome: string;
  /** CPF (11) ou CNPJ (14). */
  documento: string;
  /** Descrição da qualificação (tabela do manual). */
  qualificacao: string;
  /** Código da qualificação: 203 Diretor, 205 Administrador, 401 Empresário, 900 Contador etc. */
  codigo: string;
  crc?: string;
  email?: string;
  fone?: string;
  ufCrc?: string;
  /** Formato UF/ano/número (certidão de regularidade profissional). */
  certidaoCrc?: string;
  dataCrc?: string; // ISO
  responsavelLegal: boolean;
}

export interface ParametrosECD {
  ano: number;
  nomeEmpresarial: string;
  cnpj: string;
  uf: string;
  codigoMunicipioIbge?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  municipio?: string;
  /** 1 = empresa possui NIRE. */
  possuiNire: boolean;
  nire?: string;
  /** Data (ISO) de arquivamento dos atos constitutivos (ou de abertura, quando não há NIRE). */
  dataArquivamentoAtos?: string;
  numeroLivro: number;
  naturezaLivro: string;
  /** Indicador de situação no início do período (tabela do campo 12 do 0000). Padrão 0. */
  situacaoInicioPeriodo?: 0 | 1 | 2 | 3;
  /** Empresa sujeita a auditoria independente (ativo > R$ 240 mi ou receita > R$ 300 mi). */
  grandePorte?: boolean;
  houveMudancaPlano?: boolean;
  signatarios: SignatarioECD[];
  /** Natureza escolhida pelo usuário por código de conta/grupo (vale para a conta e seus descendentes). */
  naturezaPorGrupo?: Record<string, CodigoNaturezaConta>;
  /** Vínculo com o plano referencial da RFB: 1 = PJ em geral – Lucro Real, 2 = PJ em geral – Lucro Presumido. */
  planoReferencial?: { codPlanRef: "1" | "2"; mapa: Record<string, string> };
}

export interface EntradaECD {
  parametros: ParametrosECD;
  contas: ContaPlano[];
  /** Lançamentos definitivos já validados (todo o histórico; o gerador filtra o ano). */
  lancamentos: LancamentoValidado[];
  centrosCusto?: Array<{ codigo: string; nome: string }>;
}

export interface ResultadoECD {
  ok: boolean;
  erros: string[];
  avisos: string[];
  /** Contas/grupos cuja natureza (COD_NAT) não pôde ser definida com segurança. */
  pendenciasNatureza: Array<{ codigo: string; descricao: string }>;
  conteudo: string | null;
  resumo: { linhas: number; contas: number; lancamentos: number; partidas: number; meses: number };
}

const UF_NIRE: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", DF: "53", CE: "23", ES: "32", GO: "52", MA: "21",
  MT: "51", MS: "54", MG: "31", PA: "15", PB: "25", PE: "26", PR: "41", PI: "22", RJ: "33", RN: "24",
  RS: "43", RR: "14", RO: "11", SC: "42", SP: "35", SE: "28", TO: "17",
};

const QUALIFICACOES_VALIDAS = new Set(["001", "203", "204", "205", "206", "207", "220", "222", "223", "226", "309", "312", "313", "315", "401", "801", "900", "940", "999"]);

export function somenteAlfanumericos(valor: string): string {
  return String(valor || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteAlfanumericos(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1+$/.test(cnpj)) return false;
  const v = (c: string) => c.charCodeAt(0) - 48;
  const digito = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, c, i) => acc + v(c) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === v(cnpj[12]) && d2 === v(cnpj[13]);
}

export function cpfValido(valor: string): boolean {
  const cpf = String(valor || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Remove "|", caracteres de controle e converte para o que cabe em ISO 8859-1. */
export function textoECD(valor: unknown, max = 255): string {
  const original = String(valor ?? "");
  const mapa: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "-", "€": "EUR", " ": " " };
  let texto = "";
  for (const ch of original) {
    if (mapa[ch] !== undefined) { texto += mapa[ch]; continue; }
    const cod = ch.codePointAt(0) as number;
    if (ch === "|") { texto += " "; continue; }
    if (cod < 32 || cod === 127) { texto += " "; continue; }
    if (cod > 255) {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      texto += base.codePointAt(0)! <= 255 && base.length === 1 ? base : "?";
      continue;
    }
    texto += ch;
  }
  return texto.replace(/\s+/g, " ").trim().slice(0, max);
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

function valorBR(centavos: number): string {
  const abs = Math.abs(Math.round(centavos));
  const inteiro = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${inteiro},${frac}`;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function naturezaPorDescricao(descricao: string): CodigoNaturezaConta | null {
  const d = semAcento(descricao);
  if (/patrimonio\s+liquido|capital\s+social|reservas?\s+de\s+(lucros?|capital)|lucros?\s+acumulados|prejuizos?\s+acumulados/.test(d)) return "03";
  if (/^\s*ativo\b/.test(d)) return "01";
  if (/^\s*passivo\b/.test(d)) return "02";
  if (/^\s*(receitas?|despesas?|custos?|resultado)\b/.test(d)) return "04";
  if (/compensa[cç]/.test(d)) return "05";
  return null;
}

function contaPai(conta: ContaPlano, sinteticas: ContaPlano[]): ContaPlano | null {
  let melhor: ContaPlano | null = null;
  for (const s of sinteticas) {
    if (s.codigo === conta.codigo || s.nivel >= conta.nivel) continue;
    if (!conta.codigo.startsWith(s.codigo)) continue;
    if (!melhor || s.nivel > melhor.nivel || (s.nivel === melhor.nivel && s.codigo.length > melhor.codigo.length)) melhor = s;
  }
  return melhor;
}

function ordenarCodigos(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

export function gerarArquivoECD(entrada: EntradaECD): ResultadoECD {
  const { parametros: p } = entrada;
  const erros: string[] = [];
  const avisos: string[] = [];
  const vazio = (): ResultadoECD => ({ ok: false, erros, avisos, pendenciasNatureza: [], conteudo: null, resumo: { linhas: 0, contas: 0, lancamentos: 0, partidas: 0, meses: 0 } });

  // ---------- Identificação ----------
  const cnpj = somenteAlfanumericos(p.cnpj);
  const uf = String(p.uf || "").toUpperCase();
  const nome = textoECD(p.nomeEmpresarial);
  const ano = p.ano;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) erros.push("Ano da escrituração inválido.");
  if (!nome) erros.push("Nome empresarial não informado.");
  if (!cnpjValido(cnpj)) erros.push("CNPJ da empresa inválido (dígitos verificadores não conferem).");
  if (!UF_NIRE[uf]) erros.push("UF da empresa inválida ou não informada (tabela de UF do registro 0000).");
  if (p.possuiNire) {
    const nire = String(p.nire || "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(nire)) erros.push("NIRE deve ter 11 dígitos quando a empresa possui registro na Junta Comercial.");
    else if (UF_NIRE[uf] && nire.slice(0, 2) !== UF_NIRE[uf]) erros.push(`Os dois primeiros dígitos do NIRE devem ser ${UF_NIRE[uf]} para a UF ${uf}.`);
  } else if (p.nire) {
    erros.push("NIRE informado, mas a empresa foi marcada como sem registro na Junta Comercial.");
  }
  if (!Number.isInteger(p.numeroLivro) || p.numeroLivro <= 0) erros.push("Número de ordem do livro deve ser maior que zero.");
  if (!textoECD(p.naturezaLivro, 80)) erros.push("Natureza do livro (ex.: Diário Geral) não informada.");
  if (p.codigoMunicipioIbge && !/^\d{7}$/.test(p.codigoMunicipioIbge)) erros.push("Código IBGE do município deve ter 7 dígitos.");
  if (!p.dataArquivamentoAtos) avisos.push("Data de arquivamento dos atos constitutivos (I030 campo 9) não informada; o PGE pode emitir advertência.");

  // ---------- Signatários ----------
  const sig = p.signatarios || [];
  const contadores = sig.filter((s) => s.codigo === "900");
  const naoContadores = sig.filter((s) => s.codigo !== "900");
  if (!contadores.length) erros.push("Informe ao menos um signatário Contador/Contabilista (código 900).");
  if (!naoContadores.length) erros.push("Informe ao menos um signatário que não seja contador (representante legal da empresa).");
  if (sig.filter((s) => s.responsavelLegal).length < 1) erros.push("Marque um signatário como responsável legal pela assinatura da ECD.");
  const chaves = new Set<string>();
  for (const s of sig) {
    const doc = somenteAlfanumericos(s.documento);
    const rotulo = textoECD(s.nome) || "(sem nome)";
    if (!textoECD(s.nome)) erros.push("Signatário sem nome.");
    if (doc.length === 11 ? !cpfValido(doc) : !cnpjValido(doc)) erros.push(`Signatário ${rotulo}: CPF/CNPJ inválido.`);
    if (!QUALIFICACOES_VALIDAS.has(s.codigo)) erros.push(`Signatário ${rotulo}: código de qualificação ${s.codigo} não consta na tabela do manual.`);
    if (!textoECD(s.qualificacao)) erros.push(`Signatário ${rotulo}: descrição da qualificação não informada.`);
    const chave = `${doc}|${s.codigo}`;
    if (chaves.has(chave)) erros.push(`Signatário ${rotulo}: repetido para o mesmo código de qualificação.`);
    chaves.add(chave);
    if (s.codigo === "900") {
      if (!textoECD(s.crc)) erros.push(`Contador ${rotulo}: número do CRC não informado.`);
      if (!textoECD(s.email)) erros.push(`Contador ${rotulo}: e-mail não informado.`);
      if (!textoECD(s.fone)) erros.push(`Contador ${rotulo}: telefone não informado.`);
      if (!UF_NIRE[String(s.ufCrc || "").toUpperCase()]) erros.push(`Contador ${rotulo}: UF do CRC inválida.`);
    }
  }

  // ---------- Plano de contas ----------
  const contas = entrada.contas.slice().sort((a, b) => ordenarCodigos(a.codigo, b.codigo));
  if (!contas.length) erros.push("Plano de contas vazio.");
  const codigos = new Set<string>();
  for (const c of contas) {
    if (!c.codigo.trim()) erros.push("Conta sem código no plano.");
    if (codigos.has(c.codigo)) erros.push(`Código de conta duplicado: ${c.codigo}.`);
    codigos.add(c.codigo);
    if (!textoECD(c.descricao)) erros.push(`Conta ${c.codigo} sem descrição.`);
    if (/\|/.test(c.codigo)) erros.push(`Conta ${c.codigo}: o código não pode conter "|".`);
  }
  const sinteticas = contas.filter((c) => c.tipo === "sintetica");
  const pais = new Map<string, ContaPlano | null>();
  for (const c of contas) {
    const pai = c.nivel > 1 ? contaPai(c, sinteticas) : null;
    if (c.nivel > 1 && !pai) erros.push(`Conta ${c.codigo} (nível ${c.nivel}) sem conta sintética superior identificável pelo código.`);
    pais.set(c.codigo, pai);
  }
  for (const c of contas) {
    if (c.tipo === "analitica" && contas.some((o) => pais.get(o.codigo) === c)) erros.push(`Conta analítica ${c.codigo} possui contas subordinadas; deve ser sintética.`);
  }
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  // Natureza (COD_NAT)
  const pendenciasNatureza: Array<{ codigo: string; descricao: string }> = [];
  const natureza = new Map<string, CodigoNaturezaConta>();
  const resolverNatureza = (c: ContaPlano): CodigoNaturezaConta | null => {
    if (natureza.has(c.codigo)) return natureza.get(c.codigo)!;
    let atual: ContaPlano | null = c;
    while (atual) {
      const declarada = p.naturezaPorGrupo?.[atual.codigo];
      const achada = declarada || naturezaPorDescricao(atual.descricao || "");
      if (achada) { natureza.set(c.codigo, achada); return achada; }
      atual = pais.get(atual.codigo) || null;
    }
    return null;
  };
  const pendentesRaiz = new Map<string, ContaPlano>();
  for (const c of contas) {
    if (!resolverNatureza(c)) {
      let topo: ContaPlano = c;
      while (pais.get(topo.codigo)) topo = pais.get(topo.codigo)!;
      pendentesRaiz.set(topo.codigo, topo);
    }
  }
  for (const t of [...pendentesRaiz.values()].sort((a, b) => ordenarCodigos(a.codigo, b.codigo))) pendenciasNatureza.push({ codigo: t.codigo, descricao: t.descricao });
  if (pendenciasNatureza.length) erros.push(`Defina a natureza (Ativo, Passivo, Patrimônio Líquido, Resultado, Compensação ou Outras) para: ${pendenciasNatureza.map((x) => x.codigo).join(", ")}.`);

  // ---------- Lançamentos do ano ----------
  const prefixoAno = String(ano);
  const doAno = entrada.lancamentos
    .filter((l) => l.dataISO.slice(0, 4) === prefixoAno)
    .slice()
    .sort((a, b) => a.dataISO.localeCompare(b.dataISO) || String(a.original.documentoRef || a.original.id).localeCompare(String(b.original.documentoRef || b.original.id)) || a.original.id.localeCompare(b.original.id));
  const centros = new Map((entrada.centrosCusto || []).map((c) => [c.codigo, c.nome]));
  const centrosUsados = new Set<string>();
  for (const l of doAno) {
    if (!porCodigo.has(l.debito.codigo) || !porCodigo.has(l.credito.codigo)) erros.push(`Lançamento ${l.original.id}: conta fora do plano.`);
    else if (porCodigo.get(l.debito.codigo)!.tipo !== "analitica" || porCodigo.get(l.credito.codigo)!.tipo !== "analitica") erros.push(`Lançamento ${l.original.id}: usa conta sintética.`);
    if (l.valorCentavos <= 0) erros.push(`Lançamento ${l.original.id}: valor deve ser maior que zero.`);
    if (!textoECD(l.original.historico)) erros.push(`Lançamento ${l.original.id}: histórico obrigatório (registro I250).`);
    const cd = l.original.centroCustoDebitoCodigo || l.original.centroCustoCodigo;
    const cc = l.original.centroCustoCreditoCodigo || l.original.centroCustoCodigo;
    for (const cod of [cd, cc]) {
      if (!cod) continue;
      if (!centros.has(cod)) erros.push(`Lançamento ${l.original.id}: centro de custo ${cod} não cadastrado.`);
      else centrosUsados.add(cod);
    }
  }
  if (!doAno.length) avisos.push(`Não há lançamentos definitivos em ${ano}. O arquivo conterá apenas saldos, se existirem.`);

  // ---------- Saldos mensais ----------
  // Mesma regra do Murade (utils/livrosContabeis): o saldo inicial cadastrado vale a partir da competência-base;
  // movimentos anteriores à competência-base já estão contidos nesse saldo.
  const analiticas = contas.filter((c) => c.tipo === "analitica");
  type Mov = { deb: number; cred: number };
  const movPorMes = new Map<string, Map<string, Mov>>(); // conta -> mes(YYYY-MM) -> mov
  const acumularMov = (cod: string, mes: string, d: number, c: number) => {
    if (!movPorMes.has(cod)) movPorMes.set(cod, new Map());
    const m = movPorMes.get(cod)!;
    const atual = m.get(mes) || { deb: 0, cred: 0 };
    atual.deb += d; atual.cred += c;
    m.set(mes, atual);
  };
  for (const l of entrada.lancamentos) {
    if (l.dataISO.slice(0, 4) > prefixoAno) continue;
    acumularMov(l.debito.codigo, l.dataISO.slice(0, 7), l.valorCentavos, 0);
    acumularMov(l.credito.codigo, l.dataISO.slice(0, 7), 0, l.valorCentavos);
  }
  const saldoAbertura = (c: ContaPlano) => {
    if (c.saldoInicialConvertidoEm) return { valor: 0, base: "" };
    const valor = Math.round(Math.abs(Number(c.saldoInicial ?? 0)) * 100) * (Number(c.saldoInicial ?? 0) < 0 ? -1 : 1);
    const base = String(c.saldoInicialCompetencia || "");
    if (!valor) return { valor: 0, base: "" };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(base)) { erros.push(`Conta ${c.codigo}: saldo inicial sem competência-base válida (AAAA-MM).`); return { valor: 0, base: "" }; }
    return { valor: valor * (c.natureza === "D" ? 1 : -1), base };
  };
  /** Saldo (débito − crédito, em centavos) ao FINAL do mês `mes` (YYYY-MM). */
  const saldoAteFim = (c: ContaPlano, mes: string, ab: { valor: number; base: string }) => {
    let s = ab.base && ab.base <= mes ? ab.valor : 0;
    const m = movPorMes.get(c.codigo);
    if (m) for (const [mm, v] of m) if (mm <= mes && (!ab.base || mes < ab.base || mm >= ab.base)) s += v.deb - v.cred;
    return s;
  };
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const aberturas = new Map(analiticas.map((c) => [c.codigo, saldoAbertura(c)]));
  const mesAnterior = (mes: string) => (mes.endsWith("-01") ? `${Number(mes.slice(0, 4)) - 1}-12` : `${mes.slice(0, 5)}${String(Number(mes.slice(5)) - 1).padStart(2, "0")}`);

  type LinhaSaldo = { cod: string; ini: number; deb: number; cred: number; fin: number };
  const saldosPorMes = new Map<string, LinhaSaldo[]>();
  for (const mes of meses) {
    const linhas: LinhaSaldo[] = [];
    let somaIni = 0, somaFin = 0, somaDeb = 0, somaCred = 0;
    for (const c of analiticas) {
      const ab = aberturas.get(c.codigo)!;
      const ini = ab.base && mes === ab.base ? ab.valor : saldoAteFim(c, mesAnterior(mes), ab);
      const mv = movPorMes.get(c.codigo)?.get(mes) || { deb: 0, cred: 0 };
      const contaMov = mv;
      const fin = saldoAteFim(c, mes, ab);
      if (ini === 0 && contaMov.deb === 0 && contaMov.cred === 0 && fin === 0) continue;
      linhas.push({ cod: c.codigo, ini, deb: contaMov.deb, cred: contaMov.cred, fin });
      somaIni += ini; somaFin += fin; somaDeb += contaMov.deb; somaCred += contaMov.cred;
    }
    if (!linhas.length && analiticas.length) {
      // Manual, item 1.3: mês sem movimento e sem saldo → ao menos uma conta com zeros.
      linhas.push({ cod: analiticas[0].codigo, ini: 0, deb: 0, cred: 0, fin: 0 });
    }
    if (linhas.length) {
      if (somaIni !== 0) erros.push(`Mês ${mes.slice(5)}/${ano}: soma dos saldos iniciais das contas não é zero (diferença ${valorBR(somaIni)}). Revise saldos de abertura/lançamentos.`);
      if (somaFin !== 0) erros.push(`Mês ${mes.slice(5)}/${ano}: soma dos saldos finais das contas não é zero (diferença ${valorBR(somaFin)}).`);
      if (somaDeb !== somaCred) erros.push(`Mês ${mes.slice(5)}/${ano}: total de débitos difere do total de créditos.`);
      saldosPorMes.set(mes, linhas);
    }
  };

  if (p.planoReferencial) {
    const regimeRef = p.planoReferencial.codPlanRef === "1" ? "real" : "presumido";
    const semVinculo = analiticas.filter((c) => !p.planoReferencial!.mapa[c.codigo]);
    if (semVinculo.length) erros.push(`Plano referencial: ${semVinculo.length} conta(s) analítica(s) sem vínculo (ex.: ${semVinculo.slice(0, 5).map((c) => c.codigo).join(", ")}). Revise o mapeamento.`);
    const invalidas = analiticas.filter((c) => p.planoReferencial!.mapa[c.codigo] && !existeContaReferencialAnalitica(regimeRef, p.planoReferencial!.mapa[c.codigo]));
    if (invalidas.length) erros.push(`Plano referencial: vínculo inválido (conta referencial inexistente ou sintética) em ${invalidas.slice(0, 5).map((c) => c.codigo).join(", ")}.`);
  }

  if (erros.length) return { ...vazio(), pendenciasNatureza };

  // ---------- Montagem das linhas ----------
  const reg = (...campos: Array<string | number>) => `|${campos.map((x) => String(x)).join("|")}|`;
  const b0: string[] = [];
  const bI: string[] = [];
  const bJ: string[] = [];
  const dtIni = `0101${ano}`;
  const dtFin = `3112${ano}`;

  b0.push(reg("0000", "LECD", dtIni, dtFin, nome, cnpj, uf, textoECD(p.inscricaoEstadual), p.codigoMunicipioIbge || "", textoECD(p.inscricaoMunicipal), "", p.situacaoInicioPeriodo ?? 0, p.possuiNire ? 1 : 0, 0, "", p.grandePorte ? 1 : 0, 0, "", "N", "N", 0, p.houveMudancaPlano ? 1 : 0, p.planoReferencial ? p.planoReferencial.codPlanRef : ""));
  b0.push(reg("0001", 0));

  bI.push(reg("I001", 0));
  bI.push(reg("I010", "G", "9.00"));
  const nireTxt = p.possuiNire ? String(p.nire).replace(/\D/g, "") : "";
  bI.push(reg("I030", "TERMO DE ABERTURA", p.numeroLivro, textoECD(p.naturezaLivro, 80), "@@QTD@@", nome, nireTxt, cnpj, dataBR(p.dataArquivamentoAtos || ""), "", textoECD(p.municipio), dtFin));
  for (const c of contas) {
    const pai = pais.get(c.codigo);
    bI.push(reg("I050", dtIni, natureza.get(c.codigo)!, c.tipo === "analitica" ? "A" : "S", c.nivel, c.codigo, pai ? pai.codigo : "", textoECD(c.descricao)));
    if (p.planoReferencial && c.tipo === "analitica") bI.push(reg("I051", "", p.planoReferencial.mapa[c.codigo]));
  }
  for (const cod of [...centrosUsados].sort(ordenarCodigos)) bI.push(reg("I100", dtIni, cod, textoECD(centros.get(cod))));
  let mesesComSaldo = 0;
  for (const mes of meses) {
    const linhas = saldosPorMes.get(mes);
    if (!linhas) continue;
    mesesComSaldo++;
    const ult = new Date(Date.UTC(ano, Number(mes.slice(5)), 0)).getUTCDate();
    bI.push(reg("I150", `01${mes.slice(5)}${ano}`, `${String(ult).padStart(2, "0")}${mes.slice(5)}${ano}`));
    for (const l of linhas.sort((a, b) => ordenarCodigos(a.cod, b.cod))) {
      bI.push(reg("I155", l.cod, "", valorBR(l.ini), l.ini < 0 ? "C" : "D", valorBR(l.deb), valorBR(l.cred), valorBR(l.fin), l.fin < 0 ? "C" : "D"));
    }
  }
  let partidas = 0;
  doAno.forEach((l, i) => {
    const num = String(i + 1);
    bI.push(reg("I200", num, dataBR(l.dataISO), valorBR(l.valorCentavos), "N", ""));
    const hist = textoECD(l.original.historico);
    const cd = l.original.centroCustoDebitoCodigo || l.original.centroCustoCodigo || "";
    const cc = l.original.centroCustoCreditoCodigo || l.original.centroCustoCodigo || "";
    bI.push(reg("I250", l.debito.codigo, cd, valorBR(l.valorCentavos), "D", textoECD(l.original.documentoRef, 255), "", hist, ""));
    bI.push(reg("I250", l.credito.codigo, cc, valorBR(l.valorCentavos), "C", textoECD(l.original.documentoRef, 255), "", hist, ""));
    partidas += 2;
  });

  bJ.push(reg("J001", 0));
  bJ.push(reg("J900", "TERMO DE ENCERRAMENTO", p.numeroLivro, textoECD(p.naturezaLivro, 80), nome, "@@QTD@@", dtIni, dtFin));
  for (const s of sig) {
    const doc = somenteAlfanumericos(s.documento);
    bJ.push(reg("J930", textoECD(s.nome), doc, textoECD(s.qualificacao), s.codigo, textoECD(s.crc), textoECD(s.email, 60), textoECD(s.fone, 14), s.ufCrc ? s.ufCrc.toUpperCase() : "", textoECD(s.certidaoCrc), dataBR(s.dataCrc || ""), s.responsavelLegal ? "S" : "N"));
  }

  const tipo = (linha: string) => linha.slice(1, linha.indexOf("|", 1));
  const contar = (linhas: string[]) => {
    const m = new Map<string, number>();
    for (const l of linhas) m.set(tipo(l), (m.get(tipo(l)) || 0) + 1);
    return m;
  };
  // Encerramentos de bloco (a contagem inclui a própria linha de encerramento)
  const l0 = b0.length + 1;
  const lI = bI.length + 1;
  const lJ = bJ.length + 1;
  const todos = [...b0, reg("0990", l0), ...bI, reg("I990", lI), ...bJ, reg("J990", lJ)];
  const cont = contar(todos);
  cont.set("9001", 1); cont.set("9900", 0); cont.set("9990", 1); cont.set("9999", 1);
  // preserva a ordem de aparição dentro do arquivo
  const aparicao = [...new Set([...todos.map(tipo), "9001", "9900", "9990", "9999"])];
  cont.set("9900", aparicao.length);
  const b9: string[] = [reg("9001", 0)];
  for (const t of aparicao) b9.push(reg("9900", t, cont.get(t)!));
  const l9 = b9.length + 2; // + 9990 + 9999
  b9.push(reg("9990", l9));
  const total = todos.length + b9.length + 1;
  b9.push(reg("9999", total));

  const finais = [...todos, ...b9].map((l) => l.replace("@@QTD@@", String(total)));
  // 0990/I990/J990 devem refletir as linhas do respectivo bloco
  const conteudo = finais.join("\r\n") + "\r\n";

  avisos.push(`Este arquivo NÃO inclui Balanço Patrimonial e DRE (registros J005/J100/J150) nem aglutinação (I052)${p.planoReferencial ? "" : " e o plano referencial (I051)"}. O PGE do Sped Contábil pode apontar esses itens como pendentes.`);
  avisos.push("O arquivo precisa ser importado, validado, assinado e transmitido pelo PGE do Sped Contábil; o Murade não transmite a ECD.");

  return {
    ok: true,
    erros,
    avisos,
    pendenciasNatureza,
    conteudo,
    resumo: { linhas: total, contas: contas.length, lancamentos: doAno.length, partidas, meses: mesesComSaldo },
  };
}

/** Converte o texto da ECD em bytes ISO 8859-1 (Latin-1), como exige o manual. */
export function ecdParaLatin1(conteudo: string): Uint8Array {
  const bytes = new Uint8Array(conteudo.length);
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo.charCodeAt(i);
    bytes[i] = c <= 255 ? c : 63;
  }
  return bytes;
}

// ---------------- Obrigatoriedade e prazo (Manual ECD, item 1.3 e 1.5; IN RFB 2.003/2021) ----------------

export interface PerfilObrigatoriedadeECD {
  regime: string;
  presumidoLivroCaixa?: boolean;
  presumidoDistribuiuLucroAcimaBase?: boolean;
  simplesAporteCapital?: boolean;
}

export interface AnaliseObrigatoriedadeECD {
  situacao: "obrigatoria" | "dispensada" | "depende" | "facultativa";
  titulo: string;
  motivo: string;
  /** Código do campo COD_PLAN_REF do registro 0000 sugerido para o regime (ou "" se não aplicável). */
  planoReferencial: string;
  descricaoPlanoReferencial: string;
}

export function analisarObrigatoriedadeECD(perfil: PerfilObrigatoriedadeECD): AnaliseObrigatoriedadeECD {
  const regime = semAcento(perfil.regime || "");
  if (/lucro\s+real/.test(regime)) {
    return { situacao: "obrigatoria", titulo: "ECD obrigatória", motivo: "Lucro Real: todas as pessoas jurídicas entregam a ECD (manual, item 1.3).", planoReferencial: "1", descricaoPlanoReferencial: "PJ em geral – Lucro Real" };
  }
  if (/lucro\s+presumido/.test(regime)) {
    if (perfil.presumidoLivroCaixa === undefined || perfil.presumidoDistribuiuLucroAcimaBase === undefined) {
      return { situacao: "depende", titulo: "ECD depende de confirmação", motivo: "Lucro Presumido: está dispensada se optou pelo livro caixa (art. 45, Lei 8.981/1995) e não distribuiu lucros acima da base de cálculo sem IRRF. Confirme as duas informações no cadastro da empresa.", planoReferencial: "2", descricaoPlanoReferencial: "PJ em geral – Lucro Presumido" };
    }
    if (perfil.presumidoDistribuiuLucroAcimaBase) {
      return { situacao: "obrigatoria", titulo: "ECD obrigatória", motivo: "Lucro Presumido que distribuiu lucros acima da base de cálculo sem IRRF entrega a ECD, mesmo com livro caixa (manual, item 1.3).", planoReferencial: "2", descricaoPlanoReferencial: "PJ em geral – Lucro Presumido" };
    }
    if (perfil.presumidoLivroCaixa) {
      return { situacao: "facultativa", titulo: "ECD dispensada (entrega facultativa)", motivo: "Lucro Presumido com livro caixa e sem distribuição acima da base: dispensada; a entrega é facultativa e sem multa.", planoReferencial: "2", descricaoPlanoReferencial: "PJ em geral – Lucro Presumido" };
    }
    return { situacao: "obrigatoria", titulo: "ECD obrigatória", motivo: "Lucro Presumido que não optou pelo livro caixa entrega a ECD (manual, item 1.3).", planoReferencial: "2", descricaoPlanoReferencial: "PJ em geral – Lucro Presumido" };
  }
  if (/simples|mei/.test(regime)) {
    if (perfil.simplesAporteCapital) {
      return { situacao: "obrigatoria", titulo: "ECD obrigatória", motivo: "Simples Nacional com aporte de capital (arts. 61-A a 61-D da LC 123/2006) não tem a dispensa (manual, item 1.3).", planoReferencial: "", descricaoPlanoReferencial: "" };
    }
    return { situacao: "dispensada", titulo: "ECD dispensada", motivo: "Optante pelo Simples Nacional está dispensada, salvo aporte de capital (manual, item 1.3). A entrega é facultativa e sem multa.", planoReferencial: "", descricaoPlanoReferencial: "" };
  }
  return { situacao: "depende", titulo: "Regime não identificado", motivo: "Cadastre o regime tributário da empresa (Lucro Real, Lucro Presumido ou Simples Nacional) para o sistema definir a obrigatoriedade. Imunes/isentas: obrigatória se a receita somar R$ 4,8 milhões ou mais.", planoReferencial: "", descricaoPlanoReferencial: "" };
}

/** Prazo: último dia útil de junho do ano seguinte (IN RFB 2.003/2021, art. 5º). Considera só sábado/domingo; confira feriados. */
export function prazoEntregaECD(ano: number): string {
  const d = new Date(Date.UTC(ano + 1, 5, 30));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Natureza (COD_NAT) de cada conta, com as mesmas regras do gerador. Contas sem natureza definida ficam fora do mapa. */
export function naturezasDasContas(contas: ContaPlano[], naturezaPorGrupo: Record<string, CodigoNaturezaConta> = {}): Map<string, CodigoNaturezaConta> {
  const sinteticas = contas.filter((c) => c.tipo === "sintetica");
  const pais = new Map<string, ContaPlano | null>();
  for (const c of contas) pais.set(c.codigo, c.nivel > 1 ? contaPai(c, sinteticas) : null);
  const mapa = new Map<string, CodigoNaturezaConta>();
  for (const c of contas) {
    let atual: ContaPlano | null = c;
    while (atual) {
      const achada = naturezaPorGrupo[atual.codigo] || naturezaPorDescricao(atual.descricao || "");
      if (achada) { mapa.set(c.codigo, achada); break; }
      atual = pais.get(atual.codigo) || null;
    }
  }
  return mapa;
}
