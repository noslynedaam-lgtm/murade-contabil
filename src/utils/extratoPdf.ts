// Leitor GENÉRICO de extrato bancário em PDF (com texto). Não depende do leiaute de um banco: em cada linha procura a data
// no começo, o histórico no meio e o valor no fim (com o saldo do dia ao lado, quando o banco mostra). Serve para os extratos
// dos principais bancos (Itaú, Bradesco, Banco do Brasil, Caixa, Santander, Sicoob, Sicredi, Nubank, Inter), que seguem
// esse desenho de colunas.
//
// Regra de segurança (nada entra sem conferir): o extrato só é aceito se SALDO INICIAL + ENTRADAS − SAÍDAS = SALDO FINAL,
// e se cada saldo do dia mostrado pelo banco bate com a soma até ali. Se não bater, NENHUM movimento entra e o motivo volta
// para a tela. PDF escaneado (imagem, sem texto) não é lido: a pessoa baixa o OFX no internet banking.
//
// O texto do PDF é extraído no servidor (src/server/extratoPdfServidor.ts); aqui é só texto → movimentos (testável).
import type { MovimentoExtrato } from "./extratoBancario";

export type ConferenciaExtratoPdf = {
  saldoInicialCentavos: number | null;
  saldoFinalCentavos: number | null;
  entradasCentavos: number;
  saidasCentavos: number;
  /** saldo inicial + entradas − saídas */
  calculadoCentavos: number | null;
  bate: boolean;
  /** Saldos do dia (ou da linha) que o banco mostrou e foram conferidos com a soma. */
  saldosConferidos: number;
  /** true quando o banco não mostra "saldo anterior" e o inicial saiu do primeiro saldo do dia (conferido pelos dias seguintes). */
  saldoInicialCalculado?: boolean;
};
export type ResultadoExtratoPdf = {
  movimentos: MovimentoExtrato[];
  erros: string[];
  banco: string | null;
  periodo: { de: string; ate: string } | null;
  conferencia: ConferenciaExtratoPdf;
  /** true quando o PDF não tem texto (escaneado). */
  semTexto: boolean;
  /** Motivo de o extrato não entrar (vazio quando entra). */
  motivo: string;
};

export const MENSAGEM_PDF_ESCANEADO = "Este PDF é uma imagem (escaneado ou foto), sem texto para ler. Baixe o extrato em OFX no internet banking do banco (procure \"Exportar\" ou \"Salvar como OFX/Money\") e importe o arquivo .ofx aqui.";

const BANCOS: Array<[RegExp, string]> = [
  [/\bitau\b|itau unibanco/, "Itaú"],
  [/\bbradesco\b/, "Bradesco"],
  [/banco do brasil|\bbb\.com\.br\b/, "Banco do Brasil"],
  [/caixa economica|\bcaixa\b/, "Caixa"],
  [/\bsantander\b/, "Santander"],
  [/\bsicoob\b/, "Sicoob"],
  [/\bsicredi\b/, "Sicredi"],
  [/\bnubank\b|nu pagamentos/, "Nubank"],
  [/banco inter\b|\binter\b.*\bs\.?a\b/, "Inter"],
];
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function hash32(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const dataValida = (a: number, m: number, d: number): string | null => {
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};

/** Valor monetário (com o marcador de sinal, se houver) no FIM do texto. */
const VALOR_NO_FIM = /(?:^|\s)((?:[-+]\s*)?(?:R\$\s*)?[-+]?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?(?:\s?[CD](?![A-Za-z0-9]))?-?)\s*$/;
type Valor = { centavos: number; sinal: 1 | -1 | 0; marcador: "menos" | "cd" | null };
function lerValor(token: string): Valor | null {
  let t = token.toUpperCase().replace(/R\$/g, "").replace(/\s/g, "");
  let sinal: 1 | -1 | 0 = 0; let marcador: Valor["marcador"] = null;
  if (/^\(.*\)/.test(t)) { sinal = -1; marcador = "menos"; t = t.replace(/[()]/g, ""); }
  if (t.endsWith("D")) { sinal = -1; marcador = "cd"; t = t.slice(0, -1); } else if (t.endsWith("C")) { sinal = 1; marcador = "cd"; t = t.slice(0, -1); }
  if (t.endsWith("-")) { sinal = -1; marcador = "menos"; t = t.slice(0, -1); }
  if (t.startsWith("-")) { sinal = -1; marcador = "menos"; t = t.slice(1); } else if (t.startsWith("+")) { sinal = 1; marcador = "menos"; t = t.slice(1); }
  t = t.replace(/[()]/g, "");
  if (!/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t)) return null;
  const [inteiro, dec] = t.replace(/\./g, "").split(",");
  return { centavos: Number(inteiro) * 100 + Number(dec), sinal, marcador };
}
/** Tira até 3 valores do fim da linha (da direita para a esquerda). */
function valoresDoFim(texto: string): { resto: string; valores: Valor[] } {
  let resto = texto.trimEnd(); const valores: Valor[] = [];
  for (let i = 0; i < 3; i++) {
    const m = VALOR_NO_FIM.exec(resto); if (!m) break;
    const v = lerValor(m[1]); if (!v) break;
    valores.unshift(v); resto = resto.slice(0, m.index).trimEnd();
  }
  return { resto, valores };
}

/** Data no começo da linha: 01/10/2026, 01/10/26, 01/10, 01-10-2026, "01 OUT 2026", "1 de outubro de 2026", "01/out". */
function dataNoComeco(linha: string, anoRef: number | null, ultimoMes: { ano: number; mes: number } | null): { iso: string; resto: string } | null {
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/])\s*(.*)$/.exec(linha);
  if (m) { const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); const iso = dataValida(a, Number(m[2]), Number(m[1])); return iso ? { iso, resto: m[4] } : null; }
  const anoDo = (mes: number) => {
    if (ultimoMes) return mes < ultimoMes.mes - 6 ? ultimoMes.ano + 1 : mes > ultimoMes.mes + 6 ? ultimoMes.ano - 1 : ultimoMes.ano;
    return anoRef;
  };
  m = /^(\d{1,2})[/.-](\d{1,2})(?![\d/,])\s+(.*)$/.exec(linha);
  if (m) { const mes = Number(m[2]); const a = anoDo(mes); const iso = a ? dataValida(a, mes, Number(m[1])) : null; return iso ? { iso, resto: m[3] } : null; }
  const s = sem(linha);
  m = /^(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?(?:\s+|$)/.exec(s);
  if (!m) m = /^(\d{1,2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*(?:\/(\d{4}))?(?:\s+|$)/.exec(s);
  if (m) {
    const mes = MESES[m[2]]; const a = m[3] ? Number(m[3]) : anoDo(mes); const iso = a ? dataValida(a, mes, Number(m[1])) : null;
    return iso ? { iso, resto: linha.slice(m[0].length).trim() } : null;
  }
  return null;
}

/**
 * Lê o texto de um extrato (como sai do PDF, uma linha por linha do papel) e devolve os movimentos com sinal,
 * conferidos contra o saldo. Se a conferência não fechar, `movimentos` vem VAZIO e `motivo` explica.
 */
export function lerTextoExtratoPdf(texto: string): ResultadoExtratoPdf {
  const vazio = (motivo: string, semTexto = false): ResultadoExtratoPdf => ({ movimentos: [], erros: [motivo], banco: null, periodo: null, semTexto, motivo,
    conferencia: { saldoInicialCentavos: null, saldoFinalCentavos: null, entradasCentavos: 0, saidasCentavos: 0, calculadoCentavos: null, bate: false, saldosConferidos: 0 } });
  const bruto = String(texto || "");
  if (bruto.replace(/\s|--\s*\d+\s*of\s*\d+\s*--/g, "").length < 20 || !/\d/.test(bruto)) return vazio(MENSAGEM_PDF_ESCANEADO, true);

  const linhas = bruto.split(/\r?\n/).map((l) => l.replace(/[\t ]+/g, " ").trim()).filter((l) => l && !/^--\s*\d+\s*of\s*\d+\s*--$/.test(l));
  const tudo = sem(bruto);
  const banco = BANCOS.find(([re]) => re.test(tudo))?.[1] ?? null;
  // Ano de referência para datas sem ano (01/10): a primeira data completa do extrato, senão "outubro/2026", senão o primeiro ano escrito.
  const primeiraData = /(\d{2})\/(\d{2})\/(\d{4})/.exec(bruto) || /\b\d{1,2} de [a-zç]+ de (\d{4})/i.exec(bruto)
    || /(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:\/|de)?\s*((?:19|20)\d{2})\b/.exec(tudo) || /\b((?:19|20)\d{2})\b/.exec(bruto);
  const anoRef = primeiraData ? Number(primeiraData[primeiraData.length - 1]) : null;

  type Mov = { linha: number; dataISO: string; memo: string; valor: Valor; saldo: Valor | null; contexto: 1 | -1 | 0 };
  const movs: Mov[] = [];
  // Saldo do dia (ou "saldo em DD/MM"): vale para o FIM daquele dia, esteja a linha antes (Inter) ou depois (Itaú, BB) dos movimentos.
  const checkpoints: Array<{ linha: number; depoisDe: number; data: string | null; centavos: number; rotulo: string }> = [];
  let saldoInicial: number | null = null, saldoFinalExplicito: number | null = null;
  let dataAtual: string | null = null; let ultimoMes: { ano: number; mes: number } | null = null;
  let contexto: 1 | -1 | 0 = 0; // Nubank e outros: "Total de entradas" / "Total de saídas" valem para as linhas abaixo
  let ultimaFoiMov = false;
  const valorAssinado = (v: Valor) => (v.sinal === -1 ? -v.centavos : v.centavos);

  linhas.forEach((original, idx) => {
    const n = idx + 1;
    const d = dataNoComeco(original, anoRef, ultimoMes);
    if (d) { dataAtual = d.iso; ultimoMes = { ano: Number(d.iso.slice(0, 4)), mes: Number(d.iso.slice(5, 7)) }; }
    const corpo = d ? d.resto : original;
    const s = sem(corpo);
    const { resto, valores } = valoresDoFim(corpo);
    if (/total de (entradas|creditos|recebimentos)/.test(s)) { contexto = 1; ultimaFoiMov = false; return; }
    if (/total de (saidas|debitos|pagamentos|gastos)/.test(s)) { contexto = -1; ultimaFoiMov = false; return; }
    if (/\blimite\b|bloquead|a liberar|rendimento.*bruto|^total\b|^resumo\b/.test(s) && !/^saldo/.test(s)) { ultimaFoiMov = false; return; }
    if (/^s\s?a\s?l\s?d\s?o\b|\bsaldo\s+(anterior|inicial|final|atual|do dia|em|disponivel|em conta|total)\b/.test(s)) {
      ultimaFoiMov = false;
      if (!valores.length || /bloquead|limite|aplica|invest|poupanca|cheque especial|a liberar|provisori/.test(s)) return;
      const v = valorAssinado(valores[valores.length - 1]);
      if (/saldo\s+(anterior|inicial)/.test(s)) { if (saldoInicial === null && !movs.length) saldoInicial = v; return; }
      if (/saldo\s+(final|atual)/.test(s)) { saldoFinalExplicito = v; return; }
      const dataSaldo = /saldo\s+em\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s);
      if (dataSaldo && !movs.length && saldoInicial === null) { saldoInicial = v; return; } // "Saldo em 30/09" antes dos movimentos
      if (!movs.length && !d) return; // resumo do topo ("saldo disponível", "saldo total"): não é ponto de conferência
      checkpoints.push({ linha: n, depoisDe: movs.length, data: dataAtual, centavos: v, rotulo: corpo.slice(0, 40) });
      return;
    }
    if (!valores.length) {
      // continuação do histórico da linha de cima (sem data e sem valor)
      if (!d && ultimaFoiMov && resto.length <= 80 && /[a-z]/i.test(resto)) { const u = movs[movs.length - 1]; u.memo = `${u.memo} ${resto}`.slice(0, 240); }
      return;
    }
    const memo = resto.replace(/^[-–:|]\s*/, "").trim();
    if (!dataAtual || !memo || !/[a-z]/i.test(memo)) { ultimaFoiMov = false; return; }
    const valor = valores.length >= 2 ? valores[valores.length - 2] : valores[0];
    const saldo = valores.length >= 2 ? valores[valores.length - 1] : null;
    if (valor.centavos === 0) { ultimaFoiMov = false; return; }
    movs.push({ linha: n, dataISO: dataAtual, memo: memo.slice(0, 240), valor, saldo, contexto });
    ultimaFoiMov = true;
  });

  if (!movs.length) {
    const r = vazio("Não achei movimentos no PDF (data no começo da linha, histórico e valor no fim). Se o extrato é deste banco mesmo, baixe em OFX no internet banking e importe o OFX.");
    return { ...r, banco };
  }
  // Posição de cada saldo do dia: depois do último movimento daquele dia.
  for (const c of checkpoints) if (c.data) { let p = 0; movs.forEach((m, i) => { if (m.dataISO <= c.data!) p = i + 1; }); c.depoisDe = Math.max(c.depoisDe, p); }

  // Sem linha de saldo inicial (alguns bancos só mostram o saldo de cada dia): calcula pelo primeiro saldo do dia, desde que haja
  // outro saldo depois para conferir (senão seria conferir a conta com ela mesma).
  const erros: string[] = [];
  // Convenção do extrato: quando o banco marca as saídas com "−" (Itaú, Bradesco, Santander, Sicredi, Inter) e não usa C/D, o valor sem
  // sinal é entrada. Quem usa C/D (BB, Caixa, Sicoob) marca os dois lados. Errar aqui não passa: o saldo final confere tudo.
  const usaMenos = movs.some((m) => m.valor.marcador === "menos" && m.valor.sinal === -1);
  const usaCD = movs.some((m) => m.valor.marcador === "cd");
  const sinalProprio = (m: Mov): 1 | -1 | 0 => m.valor.sinal || m.contexto || (usaMenos && !usaCD ? 1 : 0);
  let saldoInicialCalculado = false;
  if (saldoInicial === null && checkpoints.length) {
    const c = [...checkpoints].sort((a, b) => a.depoisDe - b.depoisDe)[0];
    const antes = movs.slice(0, c.depoisDe);
    const outros = checkpoints.filter((x) => x !== c && x.depoisDe > c.depoisDe).length + (saldoFinalExplicito !== null ? 1 : 0);
    if (outros > 0 && antes.every((m) => sinalProprio(m))) { saldoInicial = c.centavos - antes.reduce((a, m) => a + sinalProprio(m) * m.valor.centavos, 0); saldoInicialCalculado = true; }
  }

  // Sinal de cada movimento: marcador do próprio valor (−, D, C, parênteses) → saldo da linha → "Total de entradas/saídas".
  let corrente: number | null = saldoInicial; let saldosConferidos = 0;
  const assinados: number[] = [];
  const cpPorPosicao = new Map<number, typeof checkpoints>();
  for (const c of checkpoints) { const l = cpPorPosicao.get(c.depoisDe) || []; l.push(c); cpPorPosicao.set(c.depoisDe, l); }
  const conferirCheckpoints = (pos: number) => {
    for (const c of cpPorPosicao.get(pos) || []) {
      if (corrente === null) { corrente = c.centavos; continue; }
      if (c.centavos !== corrente) erros.push(`Linha ${c.linha} ("${c.rotulo}"): o banco mostra ${reais(c.centavos)}, mas o saldo anterior mais os movimentos até ali dá ${reais(corrente)}.`);
      else saldosConferidos += 1;
      corrente = c.centavos;
    }
  };
  conferirCheckpoints(0);
  movs.forEach((m, i) => {
    let sinal: 1 | -1 | 0 = m.valor.sinal;
    if (!sinal && m.saldo && corrente !== null) {
      const sv = valorAssinado(m.saldo);
      if (sv - corrente === m.valor.centavos) sinal = 1; else if (corrente - sv === m.valor.centavos) sinal = -1;
    }
    if (!sinal) sinal = sinalProprio(m);
    if (!sinal) { erros.push(`Linha ${m.linha} (${m.dataISO.split("-").reverse().join("/")} ${m.memo.slice(0, 40)}): não dá para saber se ${reais(m.valor.centavos)} é entrada ou saída (sem sinal, sem C/D e sem saldo na linha).`); assinados.push(0); }
    else assinados.push(sinal * m.valor.centavos);
    if (corrente !== null) corrente += assinados[i];
    if (m.saldo) {
      const sv = valorAssinado(m.saldo);
      if (corrente !== null && sinal) { if (sv !== corrente) erros.push(`Linha ${m.linha}: o saldo da linha (${reais(sv)}) não bate com o saldo anterior mais o movimento (${reais(corrente)}).`); else saldosConferidos += 1; }
      corrente = sv;
    }
    conferirCheckpoints(i + 1);
  });

  const ultimoCp = [...checkpoints].sort((a, b) => a.depoisDe - b.depoisDe || a.linha - b.linha).pop();
  const saldoFinal: number | null = saldoFinalExplicito ?? (ultimoCp && ultimoCp.depoisDe === movs.length ? ultimoCp.centavos : null) ?? (movs[movs.length - 1].saldo ? valorAssinado(movs[movs.length - 1].saldo!) : null);
  const entradas = assinados.filter((v) => v > 0).reduce((a, v) => a + v, 0);
  const saidas = -assinados.filter((v) => v < 0).reduce((a, v) => a + v, 0);
  const calculado = saldoInicial === null ? null : saldoInicial + entradas - saidas;
  if (saldoInicial === null) erros.push("Não achei o saldo inicial (linha \"Saldo anterior\" ou \"Saldo inicial\"). Sem ele não dá para conferir o extrato.");
  if (saldoFinal === null) erros.push("Não achei o saldo final (linha \"Saldo final\", \"Saldo atual\" ou o saldo do último dia). Sem ele não dá para conferir o extrato.");
  if (calculado !== null && saldoFinal !== null && calculado !== saldoFinal) erros.push(`Saldo inicial ${reais(saldoInicial!)} + entradas ${reais(entradas)} − saídas ${reais(saidas)} = ${reais(calculado)}, mas o extrato termina com ${reais(saldoFinal)} (diferença de ${reais(saldoFinal - calculado)}). Falta ou sobra algum movimento na leitura.`);
  const bate = erros.length === 0 && calculado !== null && saldoFinal !== null && calculado === saldoFinal;
  const conferencia: ConferenciaExtratoPdf = { saldoInicialCentavos: saldoInicial, saldoFinalCentavos: saldoFinal, entradasCentavos: entradas, saidasCentavos: saidas, calculadoCentavos: calculado, bate, saldosConferidos, saldoInicialCalculado };
  const datas = movs.map((m) => m.dataISO).sort();
  const periodo = { de: datas[0], ate: datas[datas.length - 1] };
  if (!bate) return { movimentos: [], erros, banco, periodo, conferencia, semTexto: false, motivo: `O extrato NÃO entrou: a conferência do saldo não fechou. ${erros[0]}` };

  const repeticoes = new Map<string, number>();
  const movimentos: MovimentoExtrato[] = movs.map((m, i) => {
    const base = `${m.dataISO}|${assinados[i]}|${sem(m.memo)}`;
    const k = (repeticoes.get(base) || 0) + 1; repeticoes.set(base, k);
    return { fitid: `PDF-${m.dataISO.replace(/-/g, "")}-${hash32(`${base}|${k}`)}`, dataISO: m.dataISO, valorCentavos: assinados[i], memo: m.memo };
  });
  return { movimentos, erros: [], banco, periodo, conferencia, semTexto: false, motivo: "" };
}
