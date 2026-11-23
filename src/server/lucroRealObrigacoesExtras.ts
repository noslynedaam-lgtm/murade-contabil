// CENTRAL DO LUCRO REAL — o que faltava (23/11/2026): IRRF sobre JCP, retenções feitas pela empresa como TOMADORA de serviço e o
// bloqueio do DARF de PIS/COFINS não cumulativos do Fiscal. Tudo por escritório (só as empresas da sessão) e com fonte oficial.
//
// FONTES OFICIAIS (planalto.gov.br, conferidas em 23/11/2026):
//  - JCP: Lei 9.249/1995, art. 9º, § 2º, na redação da LC 224/2025 (art. 8º; efeitos desde 1º/01/2026, art. 14, III): IRRF de 17,5%
//    "na data do pagamento ou do crédito ao beneficiário" (antes de 2026: 15%). Código DARF 5706.
//    Vencimento: Lei 11.196/2005, art. 70, I, "b", item 1 — até o 3º dia útil subsequente ao decêndio de ocorrência do fato gerador.
//  - Retenções como tomadora: IRRF sobre serviços de PJ — Lei 11.196/2005, art. 70, I, "e" (incluída pela LC 150/2015): até o último
//    dia útil do 2º decêndio do mês subsequente; CSLL, COFINS e PIS retidos (Lei 10.833/2003, arts. 30 e 31: 4,65%) — art. 35, na
//    redação da Lei 13.137/2015: até o último dia útil do 2º decêndio do mês subsequente ao mês do PAGAMENTO. Código 5952 (CSRF).
//    Os valores vêm do rascunho da EFD-Reinf do Fiscal (R-4020, pelo que as NFS-e tomadas informam), agrupados pela data de EMISSÃO
//    da nota: a contadora confirma o mês do pagamento (é ele que conta para o vencimento) — dito na tela.
import { ehDiaUtil, diaUtilDepois } from "../utils/prazosFederaisContabil";
import type { Consultar } from "./lucroRealApuracao";

const dois = (n: number) => String(n).padStart(2, "0");
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const proxMes = (a: number, m: number) => (m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 });

export const FONTE_JCP = "Lei 9.249/1995, art. 9º, § 2º (redação da LC 224/2025, art. 8º: 17,5% desde 1º/01/2026); Lei 11.196/2005, art. 70, I, \"b\", item 1 (3º dia útil após o decêndio)";
export const FONTE_IRRF_TOMADOR = "Lei 11.196/2005, art. 70, I, \"e\" (último dia útil do 2º decêndio do mês seguinte)";
export const FONTE_CSRF_TOMADOR = "Lei 10.833/2003, arts. 30, 31 e 35 (redação da Lei 13.137/2015): último dia útil do 2º decêndio do mês seguinte ao do pagamento";

/** Alíquota do IRRF sobre JCP pela data do pagamento/crédito (17,5% desde 1º/01/2026). Em décimos de ponto: 175 = 17,5%. */
export const aliquotaJcpDecimos = (data: string) => (data >= "2026-01-01" ? 175 : 150);
/** IRRF do JCP em centavos (meio para cima, inteiros). */
export const irrfJcp = (valorCentavos: number, data: string) => Math.floor((valorCentavos * aliquotaJcpDecimos(data) * 2 + 1000) / 2000);
/** 3º dia útil depois do fim do decêndio da data (dias 1–10, 11–20, 21–fim). */
export function vencimentoIrrfJcp(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const fim = d <= 10 ? 10 : d <= 20 ? 20 : new Date(Date.UTC(a, m, 0)).getUTCDate();
  return diaUtilDepois(`${a}-${dois(m)}-${dois(fim)}`, 3);
}
/** Último dia útil do 2º decêndio (até o dia 20) do mês seguinte. */
export function vencimentoSegundoDecendioMesSeguinte(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number); const s = proxMes(a, m);
  const d = new Date(Date.UTC(s.a, s.m - 1, 20)); while (!ehDiaUtil(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------
let pronta: Promise<void> | null = null;
export function prepararExtrasLucroReal(q: Consultar): Promise<void> {
  pronta ??= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS contabil_lr_jcp (id text PRIMARY KEY, cnpj text NOT NULL, data_pagamento date NOT NULL, valor_centavos bigint NOT NULL, aliquota_decimos int NOT NULL, irrf_centavos bigint NOT NULL,
      vencimento date NOT NULL, beneficiarios text NOT NULL DEFAULT '', por text NOT NULL, em timestamptz NOT NULL DEFAULT now())`);
    await q(`CREATE INDEX IF NOT EXISTS contabil_lr_jcp_cnpj ON contabil_lr_jcp (cnpj, data_pagamento)`);
    await q(`CREATE TABLE IF NOT EXISTS contabil_lr_retencoes (cnpj text NOT NULL, competencia text NOT NULL, ir_centavos bigint NOT NULL DEFAULT 0, csll_centavos bigint NOT NULL DEFAULT 0, pis_centavos bigint NOT NULL DEFAULT 0,
      cofins_centavos bigint NOT NULL DEFAULT 0, prestadores int NOT NULL DEFAULT 0, pendencias int NOT NULL DEFAULT 0, atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, competencia))`);
    await q(`CREATE TABLE IF NOT EXISTS contabil_lr_conferencias (cnpj text NOT NULL, ano int NOT NULL, conferido_em timestamptz NOT NULL DEFAULT now(), motivo text, PRIMARY KEY (cnpj, ano))`);
  })().catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheExtrasParaTeste(): void { pronta = null; }

// ---------------------------------------------------------------------------------------------
// JCP
// ---------------------------------------------------------------------------------------------
export interface JcpRegistrado { id: string; dataPagamento: string; valorCentavos: number; aliquotaPercentual: number; irrfCentavos: number; vencimento: string; beneficiarios: string; por: string }
const dataIso = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
export async function listarJcp(q: Consultar, cnpj: string, ano?: number): Promise<JcpRegistrado[]> {
  await prepararExtrasLucroReal(q);
  const r = await q(`SELECT * FROM contabil_lr_jcp WHERE cnpj=$1${ano ? " AND extract(year FROM data_pagamento)=$2" : ""} ORDER BY data_pagamento, id`, ano ? [cnpj, ano] : [cnpj]);
  return r.rows.map((x) => ({ id: String(x.id), dataPagamento: dataIso(x.data_pagamento), valorCentavos: Number(x.valor_centavos), aliquotaPercentual: Number(x.aliquota_decimos) / 10, irrfCentavos: Number(x.irrf_centavos), vencimento: dataIso(x.vencimento), beneficiarios: String(x.beneficiarios || ""), por: String(x.por) }));
}
export async function registrarJcp(q: Consultar, cnpj: string, e: { dataPagamento: string; valorCentavos: number; beneficiarios?: string }, por: string): Promise<{ ok: true; jcp: JcpRegistrado } | { erro: string }> {
  await prepararExtrasLucroReal(q);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(e.dataPagamento) || new Date(`${e.dataPagamento}T00:00:00Z`).toISOString().slice(0, 10) !== e.dataPagamento) return { erro: "Informe a data do pagamento ou do crédito dos juros (dia/mês/ano)." };
  if (!Number.isSafeInteger(e.valorCentavos) || e.valorCentavos <= 0) return { erro: "Informe o valor bruto dos juros sobre capital próprio (maior que zero)." };
  const aliq = aliquotaJcpDecimos(e.dataPagamento); const irrf = irrfJcp(e.valorCentavos, e.dataPagamento); const venc = vencimentoIrrfJcp(e.dataPagamento);
  const id = `jcp-${e.dataPagamento.replace(/-/g, "")}-${Date.now().toString(36)}`;
  await q(`INSERT INTO contabil_lr_jcp (id, cnpj, data_pagamento, valor_centavos, aliquota_decimos, irrf_centavos, vencimento, beneficiarios, por) VALUES ($1,$2,$3::date,$4,$5,$6,$7::date,$8,$9)`,
    [id, cnpj, e.dataPagamento, e.valorCentavos, aliq, irrf, venc, String(e.beneficiarios || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300), por.slice(0, 120)]);
  return { ok: true, jcp: { id, dataPagamento: e.dataPagamento, valorCentavos: e.valorCentavos, aliquotaPercentual: aliq / 10, irrfCentavos: irrf, vencimento: venc, beneficiarios: String(e.beneficiarios || ""), por } };
}
/** Apaga UM registro de JCP lançado errado (um por vez). A baixa dele sai junto. */
export async function excluirJcp(q: Consultar, cnpj: string, id: string): Promise<{ ok: true } | { erro: string }> {
  await prepararExtrasLucroReal(q);
  const r = await q(`DELETE FROM contabil_lr_jcp WHERE cnpj=$1 AND id=$2`, [cnpj, id]);
  if (!Number(r.rowCount ?? 0)) return { erro: "Registro de JCP não encontrado." };
  await q(`DELETE FROM contabil_lr_baixas WHERE cnpj=$1 AND obrigacao_id=$2`, [cnpj, `irrf_jcp:${id}`]).catch(() => undefined);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Retenções como tomadora (vindas do Fiscal)
// ---------------------------------------------------------------------------------------------
export interface RetencaoMes { competencia: string; irCentavos: number; csllCentavos: number; pisCentavos: number; cofinsCentavos: number; prestadores: number; pendencias: number }
const inteiro = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
/** Lê a resposta do Fiscal (lista por mês). Ignora linha inválida; nunca lança. */
export function lerRetencoesDoFiscal(corpo: unknown, ano: number): RetencaoMes[] {
  const lista = Array.isArray((corpo as any)?.meses) ? (corpo as any).meses : [];
  return lista.filter((x: any) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(x?.competencia || "")) && String(x.competencia).startsWith(`${ano}-`))
    .map((x: any) => ({ competencia: String(x.competencia), irCentavos: inteiro(x.irCentavos), csllCentavos: inteiro(x.csllCentavos), pisCentavos: inteiro(x.pisCentavos), cofinsCentavos: inteiro(x.cofinsCentavos), prestadores: inteiro(x.prestadores), pendencias: inteiro(x.pendencias) }));
}
export async function gravarRetencoes(q: Consultar, cnpj: string, ano: number, meses: RetencaoMes[]): Promise<void> {
  await prepararExtrasLucroReal(q);
  for (const m of meses) await q(`INSERT INTO contabil_lr_retencoes (cnpj, competencia, ir_centavos, csll_centavos, pis_centavos, cofins_centavos, prestadores, pendencias, atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (cnpj, competencia) DO UPDATE SET ir_centavos=$3, csll_centavos=$4, pis_centavos=$5, cofins_centavos=$6, prestadores=$7, pendencias=$8, atualizado_em=now()`, [cnpj, m.competencia, m.irCentavos, m.csllCentavos, m.pisCentavos, m.cofinsCentavos, m.prestadores, m.pendencias]);
  const vistos = new Set(meses.map((m) => m.competencia));
  for (const x of (await q(`SELECT competencia FROM contabil_lr_retencoes WHERE cnpj=$1 AND competencia LIKE $2`, [cnpj, `${ano}-%`])).rows) if (!vistos.has(String(x.competencia))) await q(`DELETE FROM contabil_lr_retencoes WHERE cnpj=$1 AND competencia=$2`, [cnpj, String(x.competencia)]);
}
export async function listarRetencoes(q: Consultar, cnpj: string, ano: number): Promise<Array<RetencaoMes & { atualizadoEm: string }>> {
  await prepararExtrasLucroReal(q);
  return (await q(`SELECT * FROM contabil_lr_retencoes WHERE cnpj=$1 AND competencia LIKE $2 ORDER BY competencia`, [cnpj, `${ano}-%`])).rows.map((x) => ({ competencia: String(x.competencia), irCentavos: Number(x.ir_centavos), csllCentavos: Number(x.csll_centavos), pisCentavos: Number(x.pis_centavos), cofinsCentavos: Number(x.cofins_centavos), prestadores: Number(x.prestadores), pendencias: Number(x.pendencias), atualizadoEm: new Date(x.atualizado_em).toISOString() }));
}

// ---------------------------------------------------------------------------------------------
// Obrigações extras (entram na mesma lista e nos mesmos avisos da Central)
// ---------------------------------------------------------------------------------------------
export interface ObrigacaoExtra {
  id: string; tipo: "irrf_jcp" | "irrf_tomador" | "csrf_tomador"; periodo: string; descricao: string; vencimento: string; valorCentavos: number | null; codigoDarf: string | null;
  estado: "confirmada" | "baixada"; oQueFalta: string; fonte: string; guia: true; bloqueada: false; motivoBloqueio: null;
}
export function obrigacoesExtras(ano: number, jcp: JcpRegistrado[], retencoes: RetencaoMes[], baixas: Set<string>): ObrigacaoExtra[] {
  const out: ObrigacaoExtra[] = [];
  for (const j of jcp) {
    if (!j.dataPagamento.startsWith(`${ano}-`) || j.irrfCentavos <= 0) continue;
    const id = `irrf_jcp:${j.id}`; const b = baixas.has(id);
    out.push({ id, tipo: "irrf_jcp", periodo: j.dataPagamento, descricao: `IRRF sobre JCP pago/creditado em ${j.dataPagamento.split("-").reverse().join("/")} (${j.aliquotaPercentual.toLocaleString("pt-BR")}%)`, vencimento: j.vencimento, valorCentavos: j.irrfCentavos, codigoDarf: "5706",
      estado: b ? "baixada" : "confirmada", oQueFalta: b ? "Pago (baixa registrada)." : `JCP bruto ${reais(j.valorCentavos)}${j.beneficiarios ? ` (${j.beneficiarios})` : ""}. Emita o DARF 5706 no Sicalc, pague e dê baixa. Informe também na EFD-Reinf (R-4010/R-4020) e na DCTFWeb.`, fonte: FONTE_JCP, guia: true, bloqueada: false, motivoBloqueio: null });
  }
  for (const r of retencoes) {
    if (!r.competencia.startsWith(`${ano}-`)) continue;
    const mesBR = `${r.competencia.slice(5)}/${r.competencia.slice(0, 4)}`; const venc = vencimentoSegundoDecendioMesSeguinte(r.competencia);
    const aviso = `Valor das NFS-e tomadas de ${mesBR} (rascunho da EFD-Reinf do Fiscal, pela data de emissão)${r.pendencias ? `; ${r.pendencias} nota(s) com pendência no rascunho` : ""}. O vencimento conta do mês do PAGAMENTO ao prestador: se pagou em outro mês, a data muda.`;
    if (r.irCentavos > 0) { const id = `irrf_tomador:${r.competencia}`; const b = baixas.has(id);
      out.push({ id, tipo: "irrf_tomador", periodo: r.competencia, descricao: `IRRF retido de prestadores (empresa como tomadora) — ${mesBR}`, vencimento: venc, valorCentavos: r.irCentavos, codigoDarf: null,
        estado: b ? "baixada" : "confirmada", oQueFalta: b ? "Pago (baixa registrada)." : `${aviso} O código do DARF depende do serviço (ex.: serviços profissionais): confira no Sicalc, pague e dê baixa.`, fonte: FONTE_IRRF_TOMADOR, guia: true, bloqueada: false, motivoBloqueio: null }); }
    const csrf = r.csllCentavos + r.pisCentavos + r.cofinsCentavos;
    if (csrf > 0) { const id = `csrf_tomador:${r.competencia}`; const b = baixas.has(id);
      out.push({ id, tipo: "csrf_tomador", periodo: r.competencia, descricao: `CSLL/COFINS/PIS retidos de prestadores (empresa como tomadora) — ${mesBR}`, vencimento: venc, valorCentavos: csrf, codigoDarf: "5952",
        estado: b ? "baixada" : "confirmada", oQueFalta: b ? "Pago (baixa registrada)." : `${aviso} CSLL ${reais(r.csllCentavos)}, COFINS ${reais(r.cofinsCentavos)}, PIS ${reais(r.pisCentavos)}. Pague e dê baixa.`, fonte: FONTE_CSRF_TOMADOR, guia: true, bloqueada: false, motivoBloqueio: null }); }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Bloqueio do DARF de PIS/COFINS não cumulativos (pergunta do Fiscal pela integração)
// ---------------------------------------------------------------------------------------------
/** Tipos de diferença que bloqueiam o PIS/COFINS do mês. "pis_cofins_fiscal" não entra: ela só diz que o Fiscal ainda não confirmou (seria um círculo). */
export const TIPOS_QUE_BLOQUEIAM_PIS_COFINS = new Set(["notas_x_receita", "folha_x_contabil"]);
export function motivoBloqueioPisCofins(competencia: string, divergenciasAbertas: Array<{ id: string; competencia: string; tipo: string }>, conferencia: { conferidoEm: string | null; motivo: string | null }): string | null {
  if (!conferencia.conferidoEm) return `A Central do Lucro Real (Contábil) ainda não conferiu ${competencia.slice(5)}/${competencia.slice(0, 4)}: abra Murad Contábil › Livros › Apuração do Lucro Real › Central do Lucro Real e clique em "Conferir agora".`;
  if (conferencia.motivo) return `Cálculo não conferido pela Central do Lucro Real (Contábil): ${conferencia.motivo}`;
  const doMes = divergenciasAbertas.filter((d) => d.competencia === competencia && TIPOS_QUE_BLOQUEIAM_PIS_COFINS.has(d.tipo));
  if (!doMes.length) return null;
  return `${doMes.length} diferença(s) entre Fiscal, DP e Contábil em ${competencia.slice(5)}/${competencia.slice(0, 4)} na Central do Lucro Real (Contábil). Decida cada uma lá ("Conferi: a diferença está certa", com o motivo) ou corrija na origem.`;
}
export async function registrarConferencia(q: Consultar, cnpj: string, ano: number, motivo: string | null): Promise<void> {
  await prepararExtrasLucroReal(q);
  await q(`INSERT INTO contabil_lr_conferencias (cnpj, ano, conferido_em, motivo) VALUES ($1,$2,now(),$3) ON CONFLICT (cnpj, ano) DO UPDATE SET conferido_em=now(), motivo=$3`, [cnpj, ano, motivo]);
}
export async function lerConferencia(q: Consultar, cnpj: string, ano: number): Promise<{ conferidoEm: string | null; motivo: string | null }> {
  await prepararExtrasLucroReal(q);
  const x = (await q(`SELECT conferido_em, motivo FROM contabil_lr_conferencias WHERE cnpj=$1 AND ano=$2`, [cnpj, ano])).rows[0];
  return x ? { conferidoEm: new Date(x.conferido_em).toISOString(), motivo: x.motivo ?? null } : { conferidoEm: null, motivo: null };
}

/** Busca no Fiscal as retenções do ano (rascunho da EFD-Reinf, R-4020). Mesmo token e mesma lista de endereços das outras chamadas. */
export async function buscarRetencoesNoFiscal(cnpj: string, ano: number, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<RetencaoMes[]> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim(); if (!token) throw new Error("MURADE_INTEGRATION_TOKEN não configurado no Contábil.");
  const destino = new URL(`/api/integracao/fiscal/retencoes-tomador?cnpj=${encodeURIComponent(cnpj)}&ano=${ano}`, (env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim());
  if (destino.protocol !== "https:" || destino.hostname !== "murade-fiscal-1.onrender.com" || destino.username || destino.password) throw new Error("Endereço do Fiscal fora da lista permitida.");
  const r = await fetcher(destino, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.sucesso !== true) throw new Error(j?.motivo || `O Fiscal respondeu HTTP ${r.status}.`);
  return lerRetencoesDoFiscal(j, ano);
}
