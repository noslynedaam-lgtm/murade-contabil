// Extrato bancário em PDF no servidor: tira o texto do PDF (pdf-parse, a mesma biblioteca do Murad Fiscal), lê os movimentos com o
// leitor genérico (src/utils/extratoPdf.ts) e guarda a CONFERÊNCIA de cada extrato aceito (saldo inicial, saldo final e período),
// para o Conferidor dos Extratos em PDF ver depois se falta extrato entre um mês e outro ou se algum movimento sumiu.
//
// O extrato só entra quando o saldo fecha. PDF escaneado (sem texto) não entra: a tela pede o OFX.
// Isolamento: tudo por CNPJ da empresa; quem chama confere o acesso da sessão (acessoEmpresa).
import crypto from "node:crypto";
import { lerTextoExtratoPdf, MENSAGEM_PDF_ESCANEADO, type ResultadoExtratoPdf } from "../utils/extratoPdf";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

/** Limite do PDF (base64 vem no JSON da tela): 8 MB de arquivo. */
export const LIMITE_PDF_BYTES = 8 * 1024 * 1024;

export async function textoDoPdf(pdf: Buffer): Promise<{ texto: string; paginas: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new (PDFParse as any)({ data: new Uint8Array(pdf) });
  try { const r = await parser.getText(); return { texto: String(r?.text || ""), paginas: Number(r?.total || 0) }; }
  finally { await parser.destroy?.().catch(() => undefined); }
}

export type LeituraPdf = ResultadoExtratoPdf & { hash: string; paginas: number };
/** Lê o PDF inteiro. Arquivo que não é PDF, protegido por senha ou escaneado volta com o motivo (nunca joga erro para a tela). */
export async function lerExtratoPdf(pdf: Buffer): Promise<LeituraPdf> {
  const hash = crypto.createHash("sha256").update(pdf).digest("hex");
  const falha = (motivo: string, semTexto = false): LeituraPdf => ({ movimentos: [], erros: [motivo], banco: null, periodo: null, semTexto, motivo, hash, paginas: 0,
    conferencia: { saldoInicialCentavos: null, saldoFinalCentavos: null, entradasCentavos: 0, saidasCentavos: 0, calculadoCentavos: null, bate: false, saldosConferidos: 0 } });
  if (!pdf.length || pdf.length > LIMITE_PDF_BYTES) return falha("O PDF precisa ter até 8 MB.");
  if (pdf.subarray(0, 1024).indexOf("%PDF") < 0) return falha("O arquivo não é um PDF.");
  let lido: { texto: string; paginas: number };
  try { lido = await textoDoPdf(pdf); }
  catch (e: any) {
    const m = String(e?.message || e);
    if (/password|encrypt/i.test(m)) return falha("O PDF está protegido por senha. Abra no computador, salve uma cópia sem senha (ou baixe o OFX) e importe de novo.");
    return falha("Não consegui abrir este PDF. Baixe o extrato em OFX no internet banking e importe o OFX.");
  }
  const r = lerTextoExtratoPdf(lido.texto);
  if (r.semTexto) return { ...r, motivo: MENSAGEM_PDF_ESCANEADO, erros: [MENSAGEM_PDF_ESCANEADO], hash, paginas: lido.paginas };
  return { ...r, hash, paginas: lido.paginas };
}

/** PDF em base64 vindo da tela (aceita "data:application/pdf;base64,..."). */
export function pdfDoCorpo(v: unknown): Buffer | null {
  const t = String(v ?? "").replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (!t || t.length > Math.ceil(LIMITE_PDF_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+=*$/.test(t)) return null;
  return Buffer.from(t, "base64");
}

// ------------------------------------------------------------------ conferências guardadas
let preparado: Promise<void> | null = null;
export function prepararConferenciasPdf(consultar: Consultar): Promise<void> {
  if (!preparado) {
    preparado = consultar(`CREATE TABLE IF NOT EXISTS contabil_extrato_pdf_conferencias (
        cnpj char(14) NOT NULL, conta_banco varchar(64) NOT NULL, hash char(64) NOT NULL, arquivo varchar(160), banco varchar(40),
        periodo_de date NOT NULL, periodo_ate date NOT NULL, saldo_inicial_centavos bigint NOT NULL, saldo_final_centavos bigint NOT NULL,
        entradas_centavos bigint NOT NULL, saidas_centavos bigint NOT NULL, fitids jsonb NOT NULL DEFAULT '[]'::jsonb,
        importado_por text, importado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, conta_banco, hash))`)
      .then(() => consultar("CREATE INDEX IF NOT EXISTS contabil_extrato_pdf_conf_idx ON contabil_extrato_pdf_conferencias (cnpj, conta_banco, periodo_de)"))
      .then(() => undefined).catch((e) => { preparado = null; throw e; });
  }
  return preparado;
}
export const reiniciarPreparoPdfParaTeste = () => { preparado = null; };

export async function gravarConferenciaPdf(consultar: Consultar, cnpj: string, contaBanco: string, l: LeituraPdf, arquivo: string, quem: string): Promise<void> {
  await prepararConferenciasPdf(consultar);
  if (!l.conferencia.bate || !l.periodo) return;
  await consultar(`INSERT INTO contabil_extrato_pdf_conferencias (cnpj, conta_banco, hash, arquivo, banco, periodo_de, periodo_ate, saldo_inicial_centavos, saldo_final_centavos, entradas_centavos, saidas_centavos, fitids, importado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) ON CONFLICT (cnpj, conta_banco, hash) DO NOTHING`,
  [cnpj, contaBanco, l.hash, arquivo.slice(0, 160) || null, l.banco, l.periodo.de, l.periodo.ate, l.conferencia.saldoInicialCentavos, l.conferencia.saldoFinalCentavos,
    l.conferencia.entradasCentavos, l.conferencia.saidasCentavos, JSON.stringify(l.movimentos.map((m) => m.fitid)), quem]);
}

export type AchadoExtratoPdf = { cnpj: string; contaBanco: string; nivel: "atencao" | "falta"; texto: string };
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

/**
 * Conferidor dos extratos em PDF (só lê): para cada conta de banco com extrato em PDF guardado,
 *  1) os movimentos guardados daquele extrato ainda somam saldo final − saldo inicial (nenhum sumiu);
 *  2) o saldo inicial de um extrato é igual ao saldo final do extrato anterior da mesma conta (sem extrato faltando no meio);
 *  3) dois extratos com período sobreposto e saldos que não encadeiam.
 */
export async function conferirExtratosPdf(consultar: Consultar, cnpjs: string[], aoAndar?: (feito: number, total: number) => void): Promise<{ conferidos: number; achados: AchadoExtratoPdf[] }> {
  await prepararConferenciasPdf(consultar);
  if (!cnpjs.length) return { conferidos: 0, achados: [] };
  const linhas = (await consultar(`SELECT cnpj, conta_banco, arquivo, periodo_de, periodo_ate, saldo_inicial_centavos, saldo_final_centavos, fitids
    FROM contabil_extrato_pdf_conferencias WHERE cnpj = ANY($1::text[]) ORDER BY cnpj, conta_banco, periodo_de, periodo_ate`, [cnpjs])).rows;
  const grupos = new Map<string, any[]>();
  for (const x of linhas) { const k = `${String(x.cnpj).trim()}|${x.conta_banco}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(x); }
  const achados: AchadoExtratoPdf[] = []; let feito = 0;
  for (const [k, lista] of grupos) {
    aoAndar?.(feito, grupos.size); feito += 1;
    const [cnpj, contaBanco] = k.split("|");
    const fitids = lista.flatMap((x) => (Array.isArray(x.fitids) ? x.fitids : []));
    const guardados = new Map((await consultar(`SELECT fitid, valor_centavos FROM contabil_extrato_movimentos WHERE cnpj=$1 AND conta_banco=$2 AND fitid = ANY($3::text[])`, [cnpj, contaBanco, fitids]).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => [String(r.fitid), Number(r.valor_centavos)]));
    lista.forEach((x, i) => {
      const nome = `${x.arquivo || "extrato em PDF"} (${br(iso(x.periodo_de))} a ${br(iso(x.periodo_ate))})`;
      const ids: string[] = Array.isArray(x.fitids) ? x.fitids : [];
      const faltam = ids.filter((f) => !guardados.has(f));
      const soma = ids.reduce((a, f) => a + (guardados.get(f) ?? 0), 0);
      const esperado = Number(x.saldo_final_centavos) - Number(x.saldo_inicial_centavos);
      if (faltam.length) achados.push({ cnpj, contaBanco, nivel: "falta", texto: `${nome}: ${faltam.length} movimento(s) que entraram com o extrato não estão mais guardados. Importe o PDF de novo (não duplica).` });
      else if (soma !== esperado) achados.push({ cnpj, contaBanco, nivel: "falta", texto: `${nome}: os movimentos guardados somam ${reais(soma)}, mas o extrato vai de ${reais(Number(x.saldo_inicial_centavos))} a ${reais(Number(x.saldo_final_centavos))} (${reais(esperado)}).` });
      const ant = lista[i - 1];
      if (ant) {
        const fimAnt = iso(ant.periodo_ate), iniAtual = iso(x.periodo_de);
        if (iniAtual <= fimAnt) { if (Number(ant.saldo_final_centavos) !== Number(x.saldo_final_centavos) || fimAnt !== iso(x.periodo_ate)) achados.push({ cnpj, contaBanco, nivel: "atencao", texto: `${nome} tem período junto com ${ant.arquivo || "outro extrato em PDF"} (até ${br(fimAnt)}). Confira se não é o mesmo mês importado em dois arquivos diferentes.` }); }
        else if (Number(ant.saldo_final_centavos) !== Number(x.saldo_inicial_centavos)) achados.push({ cnpj, contaBanco, nivel: "falta", texto: `Falta extrato entre ${br(fimAnt)} e ${br(iniAtual)}: o anterior termina com ${reais(Number(ant.saldo_final_centavos))} e o seguinte começa com ${reais(Number(x.saldo_inicial_centavos))}. Importe o extrato desse intervalo.` });
      }
    });
  }
  aoAndar?.(grupos.size, grupos.size);
  return { conferidos: linhas.length, achados };
}
