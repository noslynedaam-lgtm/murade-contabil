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
