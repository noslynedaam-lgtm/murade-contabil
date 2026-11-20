import type { ContaPlano, LancamentoContabil } from "../types";
import { converterCentavos, normalizarDataContabil } from "./livrosContabeis";

// Importação de extrato OFX (SGML 1.x ou XML 2.x) e conciliação com lançamentos contábeis.
// CNAB não é lido aqui: o leiaute varia por banco e exige o manual do banco para cada arquivo.
export type MovimentoExtrato = { fitid: string; dataISO: string; valorCentavos: number; memo: string; tipo?: string };

const tag = (bloco: string, nome: string): string => {
  const m = new RegExp(`<${nome}>\\s*([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : "";
};
function paraCentavos(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  return converterCentavos(Number(t));
}

export function lerOFX(conteudo: string): { movimentos: MovimentoExtrato[]; erros: string[]; banco?: string; conta?: string } {
  const erros: string[] = [];
  const movimentos: MovimentoExtrato[] = [];
  const texto = String(conteudo || "");
  if (!/<OFX>/i.test(texto) && !/<STMTTRN>/i.test(texto)) return { movimentos, erros: ["O arquivo não parece ser um OFX (não há bloco <OFX> nem transações)."] };
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  blocos.forEach((brutoCompleto, i) => {
    const bloco = brutoCompleto.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0];
    const dt = tag(bloco, "DTPOSTED").slice(0, 8);
    const dataISO = /^\d{8}$/.test(dt) ? normalizarDataContabil(`${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`) : null;
    const valor = paraCentavos(tag(bloco, "TRNAMT"));
    const fitid = tag(bloco, "FITID");
    if (!dataISO || valor === null || valor === 0 || !fitid) { erros.push(`Transação ${i + 1} ignorada: data, valor ou identificador (FITID) ausente ou inválido.`); return; }
    movimentos.push({ fitid, dataISO, valorCentavos: valor, memo: tag(bloco, "MEMO") || tag(bloco, "NAME"), tipo: tag(bloco, "TRNTYPE") || undefined });
  });
  const vistos = new Set<string>();
  const unicos = movimentos.filter((m) => { if (vistos.has(m.fitid)) { erros.push(`FITID repetido ignorado: ${m.fitid}.`); return false; } vistos.add(m.fitid); return true; });
  return { movimentos: unicos, erros, banco: tag(texto, "BANKID") || undefined, conta: tag(texto, "ACCTID") || undefined };
}

const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const palavras = (s: string) => normaliza(s).split(" ").filter((p) => p.length >= 4 && !/^\d+$/.test(p));

// Sugere a contrapartida pelo histórico do próprio escritório: conta mais usada em lançamentos com a mesma palavra-chave e mesmo sentido.
export function sugerirContraPartida(mov: MovimentoExtrato, contaBancoCodigo: string, lancamentos: LancamentoContabil[]): { codigo: string; motivo: string } | null {
  const entrada = mov.valorCentavos > 0;
  const chaves = new Set(palavras(mov.memo));
  if (!chaves.size) return null;
  const cont = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.statusManual === "rejeitado") continue;
    const ehBancoDebito = l.contaDebitoCodigo === contaBancoCodigo, ehBancoCredito = l.contaCreditoCodigo === contaBancoCodigo;
    if (entrada ? !ehBancoDebito : !ehBancoCredito) continue;
    const contra = entrada ? l.contaCreditoCodigo : l.contaDebitoCodigo;
    if (palavras(l.historico).some((p) => chaves.has(p))) cont.set(contra, (cont.get(contra) ?? 0) + 1);
  }
  const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0];
  return melhor ? { codigo: melhor[0], motivo: `Usada em ${melhor[1]} lançamento(s) anterior(es) com histórico parecido.` } : null;
}

export type ResultadoConciliacao = {
  conciliados: Array<{ movimento: MovimentoExtrato; lancamentoId: string; certeza: "exata" | "provavel" }>;
  semLancamento: MovimentoExtrato[];
  lancamentosSemExtrato: LancamentoContabil[];
};
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// Casa por sentido (débito no banco = entrada), valor idêntico e data: mesma data = "exata"; até `toleranciaDias` = "provável" (o usuário confirma).
export function conciliar(movs: MovimentoExtrato[], lancamentos: LancamentoContabil[], contaBancoCodigo: string, periodo: string, toleranciaDias = 3): ResultadoConciliacao {
  const candidatos = lancamentos.filter((l) => l.statusManual !== "rejeitado" && l.statusManual !== "pendente_aprovacao" && (l.contaDebitoCodigo === contaBancoCodigo || l.contaCreditoCodigo === contaBancoCodigo))
    .map((l) => ({ l, dataISO: normalizarDataContabil(l.data), cent: converterCentavos(l.valor) }))
    .filter((x) => x.dataISO && x.cent && x.dataISO.slice(0, 7) === periodo);
  const usados = new Set<string>();
  const conciliados: ResultadoConciliacao["conciliados"] = [];
  const semLancamento: MovimentoExtrato[] = [];
  const doMes = movs.filter((m) => m.dataISO.slice(0, 7) === periodo);
  const achar = (m: MovimentoExtrato, exata: boolean) => candidatos.find((c) => !usados.has(c.l.id)
    && (m.valorCentavos > 0 ? c.l.contaDebitoCodigo === contaBancoCodigo : c.l.contaCreditoCodigo === contaBancoCodigo)
    && c.cent === Math.abs(m.valorCentavos)
    && (exata ? c.dataISO === m.dataISO : diasEntre(c.dataISO!, m.dataISO) <= toleranciaDias));
  const pendentes: MovimentoExtrato[] = [];
  for (const m of doMes) { const c = achar(m, true); if (c) { usados.add(c.l.id); conciliados.push({ movimento: m, lancamentoId: c.l.id, certeza: "exata" }); } else pendentes.push(m); }
  for (const m of pendentes) { const c = achar(m, false); if (c) { usados.add(c.l.id); conciliados.push({ movimento: m, lancamentoId: c.l.id, certeza: "provavel" }); } else semLancamento.push(m); }
  return { conciliados, semLancamento, lancamentosSemExtrato: candidatos.filter((c) => !usados.has(c.l.id)).map((c) => c.l) };
}

// Rascunho de lançamento para um movimento sem correspondência. Fica pendente de aprovação e usa o FITID como referência (evita duplicar).
export function lancamentoDoMovimento(mov: MovimentoExtrato, contaBanco: ContaPlano, contra: ContaPlano): LancamentoContabil {
  const entrada = mov.valorCentavos > 0;
  const d = entrada ? contaBanco : contra, c = entrada ? contra : contaBanco;
  return {
    id: `OFX-${mov.fitid}`, data: mov.dataISO, contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: c.codigo, contaCreditoNome: c.descricao,
    valor: Math.abs(mov.valorCentavos) / 100, historico: (mov.memo || "Movimento bancário").slice(0, 240), origem: "Manual", documentoRef: `OFX:${mov.fitid}`,
    competencia: mov.dataISO.slice(0, 7), statusManual: "pendente_aprovacao",
  };
}

// ------------------------------------------------------------------ CSV / Excel (XLSX e planilha HTML que alguns bancos chamam de .xls)
// O extrato em planilha não tem identificador do banco (FITID): o identificador é montado com data, valor, histórico e a
// ordem da repetição no arquivo, então importar o mesmo arquivo de novo não duplica.
function hash32(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const semAcentoMin = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function dataDaCelula(v: string): string | null {
  const t = String(v || "").trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(t);
  if (m) { const ano = m[3].length === 2 ? `20${m[3]}` : m[3]; return normalizarDataContabil(`${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`); }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return normalizarDataContabil(`${m[1]}-${m[2]}-${m[3]}`);
  if (/^\d{5}(\.\d+)?$/.test(t)) { // número de série do Excel (dias desde 30/12/1899)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000);
    return normalizarDataContabil(d.toISOString().slice(0, 10));
  }
  return null;
}
/** "1.234,56", "-1.234,56", "1.234,56 D", "(1.234,56)", "R$ 10,00 C" → centavos com sinal (D/negativo = saída). */
export function valorDaCelula(v: string): number | null {
  let t = String(v ?? "").trim().toUpperCase().replace(/R\$|\s/g, "");
  if (!t) return null;
  let sinal = 1;
  if (/^\(.*\)$/.test(t)) { sinal = -1; t = t.slice(1, -1); }
  if (t.endsWith("D") || (t.endsWith("-") && !t.startsWith("-"))) { sinal = -sinal; t = t.slice(0, -1); }
  else if (t.endsWith("C")) t = t.slice(0, -1);
  if (t.startsWith("-")) { sinal = -sinal; t = t.slice(1); } else if (t.startsWith("+")) t = t.slice(1);
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = converterCentavos(Number(t));
  return c === null ? null : sinal * c;
}

/** Lê linhas de planilha (já separadas em células) e acha as colunas pelo cabeçalho: data, histórico e valor (ou crédito/débito). */
export function lerTabelaExtrato(linhas: string[][], origem = "CSV"): { movimentos: MovimentoExtrato[]; erros: string[] } {
  const erros: string[] = [];
  const cab = linhas.findIndex((l) => l.some((c) => /^data/.test(semAcentoMin(c))) && l.some((c) => /valor|credito|debito|entrada|saida/.test(semAcentoMin(c))));
  if (cab < 0) return { movimentos: [], erros: ["Não achei o cabeçalho do extrato (precisa ter as colunas Data e Valor, ou Data, Crédito e Débito)."] };
  const h = linhas[cab].map(semAcentoMin);
  const col = (re: RegExp, exceto?: RegExp) => h.findIndex((c) => re.test(c) && !(exceto && exceto.test(c)));
  const iData = col(/^data/);
  const iHist = col(/historico|descricao|lancamento|memo|detalhe/);
  const iDoc = col(/documento|^doc|n[º°o]?\s*doc/);
  const iValor = col(/^valor|valor\s*\(r\$\)|^montante/, /saldo/);
  const iCred = col(/credito|entrada/);
  const iDeb = col(/debito|saida/);
  if (iData < 0 || (iValor < 0 && iCred < 0 && iDeb < 0)) return { movimentos: [], erros: ["O cabeçalho precisa ter Data e Valor (ou Crédito e Débito)."] };
  const movimentos: MovimentoExtrato[] = [];
  const repeticoes = new Map<string, number>();
  for (let i = cab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l || l.every((c) => !String(c || "").trim())) continue;
    const memo = iHist >= 0 ? String(l[iHist] || "").trim() : "";
    if (/^saldo/i.test(semAcentoMin(memo))) continue; // linhas de saldo do dia/anterior não são movimento
    const dataISO = dataDaCelula(l[iData] || "");
    let valor: number | null = null;
    if (iValor >= 0 && String(l[iValor] || "").trim()) valor = valorDaCelula(l[iValor]);
    else {
      const cr = iCred >= 0 && String(l[iCred] || "").trim() ? valorDaCelula(l[iCred]) : null;
      const db = iDeb >= 0 && String(l[iDeb] || "").trim() ? valorDaCelula(l[iDeb]) : null;
      if (cr !== null && cr !== 0) valor = Math.abs(cr);
      else if (db !== null && db !== 0) valor = -Math.abs(db);
    }
    if (!dataISO || valor === null || valor === 0) { if (dataISO || valor !== null) erros.push(`Linha ${i + 1} ignorada: data ou valor inválido.`); continue; }
    const doc = iDoc >= 0 ? String(l[iDoc] || "").trim() : "";
    const base = `${dataISO}|${valor}|${semAcentoMin(memo)}|${doc}`;
    const n = (repeticoes.get(base) || 0) + 1; repeticoes.set(base, n);
    movimentos.push({ fitid: `${origem}-${dataISO.replace(/-/g, "")}-${hash32(`${base}|${n}`)}`, dataISO, valorCentavos: valor, memo: (memo || doc || "Movimento bancário").slice(0, 240) });
  }
  if (!movimentos.length && !erros.length) erros.push("Nenhum movimento encontrado abaixo do cabeçalho.");
  return { movimentos, erros };
}

/** CSV com ; ou , (aspas respeitadas). */
export function lerCSVExtrato(conteudo: string): { movimentos: MovimentoExtrato[]; erros: string[] } {
  const texto = String(conteudo || "").replace(/^﻿/, "");
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) || "";
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : primeira.includes("\t") ? "\t" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [], celula = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { celula += '"'; i++; } else aspas = false; } else celula += ch; continue; }
    if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(celula); celula = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texto[i + 1] === "\n") i++; linha.push(celula); linhas.push(linha); linha = []; celula = ""; }
    else celula += ch;
  }
  if (celula || linha.length) { linha.push(celula); linhas.push(linha); }
  return lerTabelaExtrato(linhas, "CSV");
}

/** Planilha HTML (muitos bancos exportam assim com extensão .xls). */
export function lerHtmlExtrato(conteudo: string): { movimentos: MovimentoExtrato[]; erros: string[] } {
  const linhas: string[][] = [];
  const decodificar = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
  for (const tr of String(conteudo || "").match(/<tr[\s\S]*?<\/tr>/gi) || []) linhas.push((tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(decodificar));
  if (!linhas.length) return { movimentos: [], erros: ["O arquivo não tem tabela legível. Salve o extrato como CSV ou XLSX e importe de novo."] };
  return lerTabelaExtrato(linhas, "XLS");
}

/** Células da primeira planilha de um XLSX, a partir do XML da planilha e das strings compartilhadas (o zip é aberto por quem chama). */
export function lerXlsxExtrato(sheetXml: string, sharedStringsXml = ""): { movimentos: MovimentoExtrato[]; erros: string[] } {
  const desc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = (sharedStringsXml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => desc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const colunaIdx = (ref: string) => { const letras = (/^[A-Z]+/.exec(ref) || ["A"])[0]; let n = 0; for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const linhas: string[][] = [];
  for (const row of sheetXml.match(/<row[\s\S]*?<\/row>/g) || []) {
    const l: string[] = [];
    for (const c of row.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) || []) {
      const ref = (/\br="([A-Z]+\d+)"/.exec(c) || [])[1] || "";
      const tipo = (/\bt="(\w+)"/.exec(c) || [])[1] || "";
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      const inline = (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c) || [])[1];
      const valor = tipo === "s" && v !== undefined ? shared[Number(v)] ?? "" : inline !== undefined ? desc(inline) : v !== undefined ? desc(v) : "";
      l[ref ? colunaIdx(ref) : l.length] = valor;
    }
    linhas.push(Array.from(l, (x) => x ?? ""));
  }
  return lerTabelaExtrato(linhas, "XLSX");
}

// ------------------------------------------------------------------ regras "quando o histórico tiver X, usar a conta Y"
export type RegraConciliacaoExtrato = { id: string; contem: string; contaCodigo: string; sentido: "entrada" | "saida" | "ambos"; ativo: boolean };

export function validarRegraConciliacao(r: unknown): r is RegraConciliacaoExtrato {
  if (!r || typeof r !== "object" || Array.isArray(r)) return false;
  const x = r as Record<string, unknown>;
  if (Object.keys(x).some((k) => !["id", "contem", "contaCodigo", "sentido", "ativo"].includes(k))) return false;
  return typeof x.id === "string" && x.id.length > 0 && x.id.length <= 64
    && typeof x.contem === "string" && x.contem.trim().length >= 3 && x.contem.length <= 80
    && typeof x.contaCodigo === "string" && x.contaCodigo.length > 0 && x.contaCodigo.length <= 64
    && (x.sentido === "entrada" || x.sentido === "saida" || x.sentido === "ambos") && typeof x.ativo === "boolean";
}

/** Primeira regra ativa (a mais específica: texto mais longo) cujo texto aparece no histórico e cujo sentido bate. */
export function regraQueSeAplica(mov: Pick<MovimentoExtrato, "memo" | "valorCentavos">, regras: RegraConciliacaoExtrato[], contaBanco: string, contasAnaliticas: Set<string>): RegraConciliacaoExtrato | null {
  const memo = semAcentoMin(mov.memo);
  const sentido = mov.valorCentavos > 0 ? "entrada" : "saida";
  return [...regras].filter((r) => r.ativo && (r.sentido === "ambos" || r.sentido === sentido) && r.contaCodigo !== contaBanco && contasAnaliticas.has(r.contaCodigo) && memo.includes(semAcentoMin(r.contem)))
    .sort((a, b) => b.contem.length - a.contem.length)[0] || null;
}

export type SugestaoExtrato = { fitid: string; lancamentoId?: string; contaCodigo?: string; motivo: string };

/**
 * Sugestões para os movimentos ainda pendentes (o robô grava, a pessoa aprova): primeiro um lançamento aprovado
 * com mesmo sentido e valor (data igual ou até 3 dias), senão a conta da regra, senão a conta mais usada no histórico.
 */
export function sugerirParaPendentes(pendentes: MovimentoExtrato[], entrada: { lancamentos: LancamentoContabil[]; contaBanco: string; regras: RegraConciliacaoExtrato[]; contasAnaliticas: Set<string>; lancamentosJaConciliados: Set<string> }): SugestaoExtrato[] {
  const saida: SugestaoExtrato[] = [];
  const usados = new Set(entrada.lancamentosJaConciliados);
  const porMes = new Map<string, MovimentoExtrato[]>();
  for (const m of pendentes) { const k = m.dataISO.slice(0, 7); if (!porMes.has(k)) porMes.set(k, []); porMes.get(k)!.push(m); }
  const disponiveis = entrada.lancamentos.filter((l) => !usados.has(l.id));
  const casados = new Map<string, { id: string; certeza: string }>();
  for (const [mes, movs] of porMes) {
    const r = conciliar(movs, disponiveis.filter((l) => !usados.has(l.id)), entrada.contaBanco, mes);
    for (const c of r.conciliados) { casados.set(c.movimento.fitid, { id: c.lancamentoId, certeza: c.certeza }); usados.add(c.lancamentoId); }
  }
  for (const m of pendentes) {
    const c = casados.get(m.fitid);
    if (c) { saida.push({ fitid: m.fitid, lancamentoId: c.id, motivo: c.certeza === "exata" ? "Lançamento aprovado com mesma data e valor." : "Lançamento aprovado com mesmo valor e data próxima (confira)." }); continue; }
    const regra = regraQueSeAplica(m, entrada.regras, entrada.contaBanco, entrada.contasAnaliticas);
    if (regra) { saida.push({ fitid: m.fitid, contaCodigo: regra.contaCodigo, motivo: `Regra: o histórico tem "${regra.contem}".` }); continue; }
    const s = sugerirContraPartida(m, entrada.contaBanco, entrada.lancamentos);
    if (s && entrada.contasAnaliticas.has(s.codigo) && s.codigo !== entrada.contaBanco) saida.push({ fitid: m.fitid, contaCodigo: s.codigo, motivo: s.motivo });
  }
  return saida;
}

/** Confere se o lançamento pode ser conciliado com o movimento: aprovado, mexe na conta do banco no mesmo sentido e com o mesmo valor. */
export function lancamentoCasaComMovimento(l: LancamentoContabil | undefined, mov: Pick<MovimentoExtrato, "valorCentavos">, contaBanco: string): boolean {
  if (!l || l.statusManual === "pendente_aprovacao" || l.statusManual === "rejeitado") return false;
  const entrada = mov.valorCentavos > 0;
  if (entrada ? l.contaDebitoCodigo !== contaBanco : l.contaCreditoCodigo !== contaBanco) return false;
  return converterCentavos(l.valor) === Math.abs(mov.valorCentavos);
}
