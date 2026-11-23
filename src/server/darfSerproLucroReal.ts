// DARF do Lucro Real (IRPJ e CSLL) com código de barras e PDF pelo Serpro (Integra Contador, SICALC). O Contábil NÃO guarda credencial
// do Serpro nem procuração: pede ao Murad Fiscal pela integração que já existe entre os sistemas (Bearer MURADE_INTEGRATION_TOKEN,
// mesma lista de endereços permitidos), e o Fiscal só gera se o escritório que pediu for o dono da empresa lá (procuração dele).
//
// REGRAS (as mesmas do botão do Fiscal):
// - CONSOME CRÉDITO: só por clique da pessoa, depois do cartão que avisa as 2 consultas pagas (código de barras e PDF). Nenhum robô
//   chama este arquivo.
// - Só período CONFIRMADO, sem bloqueio da Central do Lucro Real, sem pagamento registrado e com valor de pelo menos R$ 10,00.
// - Só códigos com extensão oficial conferida (tabela de códigos/extensões da DCTF, Receita Federal, páginas IRPJ e CSLL, lidas em
//   23/11/2026): 2362, 2319, 3373, 2430, 2456, 2484, 6012, 2030 e 6773, todos /01. Os outros (5993 e 0220, sem extensão na tabela
//   lida, e o 5706 do JCP, que só tem 5706/02 válida até 12/2023) continuam pelo Sicalc Web.
// - O código de barras (com Copiar) e o PDF (para baixar) ficam guardados por empresa, ano, período e tributo.
import type express from "express";

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export const CODIGOS_SERPRO_LUCRO_REAL: readonly string[] = ["2362", "2319", "3373", "2430", "2456", "2484", "6012", "2030", "6773"];
export const MOTIVO_JCP_SICALC = "O IRRF do JCP (DARF 5706) não tem extensão vigente confirmada na tabela oficial da Receita: emita pelo Sicalc Web.";
const VALOR_MINIMO = 1000;

/** Período do Contábil ("T03", "A10", "ANUAL") → referência que o Fiscal entende ("2026-T3", "2026-10", "2025-ANUAL"). */
export function referenciaDoPeriodo(ano: number, periodo: string): string | null {
  if (/^T0[1-4]$/.test(periodo)) return `${ano}-T${periodo.slice(2)}`;
  if (/^A(0[1-9]|1[0-2])$/.test(periodo)) return `${ano}-${periodo.slice(1)}`;
  if (periodo === "ANUAL") return `${ano}-ANUAL`;
  return null;
}

export interface DarfDoPeriodo { tributo: string; codigo: string | null; periodoApuracao: string; vencimento: string; valorCentavos: number }
/** Pode ir ao Serpro? Só confere; não chama ninguém. */
export function darfProntoParaSerpro(l: { status: string } | undefined, d: DarfDoPeriodo | undefined, pago: boolean): { ok: true } | { ok: false; motivo: string } {
  if (!l || !d) return { ok: false, motivo: "DARF não encontrado neste período." };
  if (l.status !== "confirmado") return { ok: false, motivo: "Confirme o período antes de gerar o DARF pelo Serpro." };
  if (pago) return { ok: false, motivo: "O pagamento deste DARF já foi registrado." };
  if (!d.codigo) return { ok: false, motivo: "Informe se a empresa é obrigada ou optante pelo Lucro Real: sem isso o código do IRPJ não é conhecido." };
  if (!CODIGOS_SERPRO_LUCRO_REAL.includes(d.codigo)) return { ok: false, motivo: `O código ${d.codigo} não tem extensão oficial conferida para o Serpro: emita pelo Sicalc Web.` };
  if (!(d.valorCentavos >= VALOR_MINIMO)) return { ok: false, motivo: "Valor abaixo de R$ 10,00: não se emite DARF (Lei 9.430/1996, art. 68, § 1º)." };
  return { ok: true };
}

let pronta: Promise<unknown> | null = null;
export function prepararDarfSerpro(q: Consultar): Promise<unknown> {
  pronta ??= q(`CREATE TABLE IF NOT EXISTS contabil_lr_darf_serpro (
    cnpj text NOT NULL, ano int NOT NULL, periodo text NOT NULL, tributo text NOT NULL,
    codigo text NOT NULL, estado text NOT NULL, linha_digitavel text, codigo44 text, pdf_base64 text, numero_documento text,
    receita_sem_codbarras text, avisos jsonb NOT NULL DEFAULT '[]'::jsonb, consultas int NOT NULL DEFAULT 0, municipio text, valor_centavos bigint,
    gerado_por text NOT NULL, gerado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, ano, periodo, tributo))`).catch((e) => { pronta = null; throw e; });
  return pronta;
}
export interface DarfSerproGuardado { ano: number; periodo: string; tributo: string; codigo: string; estado: string; linhaDigitavel: string | null; codigo44: string | null; temPdf: boolean; receitaSemCodigoBarras: string | null; avisos: string[]; consultas: number; municipio: string | null; geradoPor: string; geradoEm: string }
const linha = (r: any): DarfSerproGuardado => ({ ano: Number(r.ano), periodo: r.periodo, tributo: r.tributo, codigo: r.codigo, estado: r.estado, linhaDigitavel: r.linha_digitavel ?? null, codigo44: r.codigo44 ?? null, temPdf: !!r.tem_pdf, receitaSemCodigoBarras: r.receita_sem_codbarras ?? null, avisos: Array.isArray(r.avisos) ? r.avisos : [], consultas: Number(r.consultas) || 0, municipio: r.municipio ?? null, geradoPor: r.gerado_por, geradoEm: new Date(r.gerado_em).toISOString() });
export async function listarDarfSerpro(q: Consultar, cnpj: string, ano: number): Promise<DarfSerproGuardado[]> {
  await prepararDarfSerpro(q);
  return (await q(`SELECT cnpj, ano, periodo, tributo, codigo, estado, linha_digitavel, codigo44, (pdf_base64 IS NOT NULL) AS tem_pdf, receita_sem_codbarras, avisos, consultas, municipio, gerado_por, gerado_em FROM contabil_lr_darf_serpro WHERE cnpj=$1 AND ano=$2 ORDER BY periodo, tributo`, [cnpj, ano])).rows.map(linha);
}

export type PedirAoFiscal = (corpo: Record<string, unknown>) => Promise<{ ok: boolean; status: number; corpo: any }>;
/** Transporte real: POST no Fiscal, mesmo token e mesma lista de endereços permitidos das outras chamadas ao Fiscal. */
export function pedirDarfAoFiscal(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): PedirAoFiscal {
  return async (corpo) => {
    const token = env.MURADE_INTEGRATION_TOKEN?.trim(); if (!token) throw new Error("MURADE_INTEGRATION_TOKEN não configurado no Contábil.");
    const destino = new URL("/api/integracao/contabil/darf-serpro", (env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim());
    if (destino.protocol !== "https:" || destino.hostname !== "murade-fiscal-1.onrender.com" || destino.username || destino.password) throw new Error("Endereço do Fiscal fora da lista permitida.");
    const r = await fetcher(destino, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000) });
    const j: any = await r.json().catch(() => ({}));
    return { ok: r.ok && j?.sucesso === true, status: r.status, corpo: j };
  };
}

export interface DepsDarfSerpro {
  consultar: Consultar;
  /** Apuração do período (com os DARF) e se o pagamento já foi registrado. */
  periodo: (cnpj: string, ano: number, periodo: string) => Promise<{ linha: { status: string; resultado?: any } | undefined; tributosPagos: string[] }>;
  bloqueio: (cnpj: string, ano: number, periodo: string) => Promise<string | null>;
  /** CNPJ do escritório (cadastro único feito no DP) do escritório da sessão. */
  escritorioCnpj: (tenantId: string) => Promise<string | null>;
  pedir: PedirAoFiscal;
}

/** Gera (só depois do clique e do cartão). Devolve o guardado ou o motivo. */
export async function gerarDarfSerproLucroReal(d: DepsDarfSerpro, p: { cnpj: string; ano: number; periodo: string; tributo: string; tenantId: string; login: string; gerarDeNovo: boolean }): Promise<{ ok: true; darf: DarfSerproGuardado } | { ok: false; status: number; motivo: string }> {
  const ref = referenciaDoPeriodo(p.ano, p.periodo);
  if (!ref || !["irpj", "csll"].includes(p.tributo)) return { ok: false, status: 400, motivo: "Informe o ano, o período e o tributo (IRPJ ou CSLL)." };
  const { linha: l, tributosPagos } = await d.periodo(p.cnpj, p.ano, p.periodo);
  const pago = tributosPagos.includes(p.tributo);
  const darf = (l?.resultado?.darfs || []).find((x: any) => x.tributo === p.tributo) as DarfDoPeriodo | undefined;
  const pronto = darfProntoParaSerpro(l, darf, pago);
  if (pronto.ok === false) return { ok: false, status: 409, motivo: `${pronto.motivo} Nada foi enviado ao Serpro.` };
  const bloq = await d.bloqueio(p.cnpj, p.ano, p.periodo);
  if (bloq) return { ok: false, status: 409, motivo: `Guia bloqueada: ${bloq} Nada foi enviado ao Serpro.` };
  await prepararDarfSerpro(d.consultar);
  const ja = (await d.consultar(`SELECT gerado_em, gerado_por FROM contabil_lr_darf_serpro WHERE cnpj=$1 AND ano=$2 AND periodo=$3 AND tributo=$4`, [p.cnpj, p.ano, p.periodo, p.tributo])).rows[0];
  if (ja && !p.gerarDeNovo) return { ok: false, status: 409, motivo: `Este DARF já foi gerado pelo Serpro em ${new Date(ja.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por ${ja.gerado_por}. Copie o código ou baixe o PDF; só gere de novo se for pagar em outra data (são mais 2 consultas pagas).` };
  const escritorio = (await d.escritorioCnpj(p.tenantId))?.replace(/\D/g, "") || "";
  if (escritorio.length !== 14) return { ok: false, status: 409, motivo: "O CNPJ do seu escritório ainda não está cadastrado (cadastro único do escritório, no Murad DP). Sem ele não dá para saber qual procuração usar. Nada foi enviado nem cobrado." };
  const r = await d.pedir({ confirmado: true, cnpj: p.cnpj, escritorioCnpj: escritorio, codigoReceita: darf!.codigo, periodoApuracao: darf!.periodoApuracao, referencia: ref, vencimento: darf!.vencimento, valorCentavos: darf!.valorCentavos, por: p.login });
  const c = r.corpo || {};
  if (!r.ok) return { ok: false, status: r.status >= 400 && r.status < 500 ? 409 : 503, motivo: String(c.motivo || `O Fiscal respondeu HTTP ${r.status}.`).slice(0, 400) };
  const linhaDig = c.codigoBarras?.linhaDigitavel ? String(c.codigoBarras.linhaDigitavel) : null;
  const cod44 = c.codigoBarras?.codigo44 ? String(c.codigoBarras.codigo44) : null;
  const pdf = typeof c.pdfBase64 === "string" && c.pdfBase64 ? c.pdfBase64 : null;
  await d.consultar(`INSERT INTO contabil_lr_darf_serpro (cnpj, ano, periodo, tributo, codigo, estado, linha_digitavel, codigo44, pdf_base64, numero_documento, receita_sem_codbarras, avisos, consultas, municipio, gerado_por, gerado_em, valor_centavos)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,now(),$16)
    ON CONFLICT (cnpj, ano, periodo, tributo) DO UPDATE SET codigo=$5, estado=$6, linha_digitavel=$7, codigo44=$8, pdf_base64=$9, numero_documento=$10, receita_sem_codbarras=$11, avisos=$12::jsonb, consultas=contabil_lr_darf_serpro.consultas+$13, municipio=$14, gerado_por=$15, gerado_em=now(), valor_centavos=$16`,
    [p.cnpj, p.ano, p.periodo, p.tributo, darf!.codigo, String(c.estado || "gerado"), linhaDig, cod44, pdf, c.numeroDocumento ?? null, c.receitaSemCodigoBarras ?? null, JSON.stringify(Array.isArray(c.avisos) ? c.avisos : []), Number(c.consultas) || 0, c.municipioEnviado ?? null, p.login, darf!.valorCentavos]);
  const salvo = (await listarDarfSerpro(d.consultar, p.cnpj, p.ano)).find((x) => x.periodo === p.periodo && x.tributo === p.tributo)!;
  return { ok: true, darf: salvo };
}

/**
 * Robô Conferidor do DARF pelo Serpro (Lucro Real): de 2 em 2 horas confere se cada DARF já gerado pelo Serpro ainda bate com a
 * apuração (período reaberto, valor ou código mudou = o código de barras guardado está velho) e se algum vencido continua sem o
 * pagamento registrado. Só lê e avisa; NUNCA gera DARF nem consulta o Serpro (consulta paga é só por clique).
 */
export async function conferirDarfsSerpro(q: Consultar): Promise<{ guardados: number; divergentes: string[]; vencidosSemPagamento: string[]; resumo: string; alerta: boolean }> {
  await prepararDarfSerpro(q);
  const r = await q(`SELECT s.cnpj, s.ano, s.periodo, s.tributo, s.codigo, s.valor_centavos, a.status, a.resultado,
      EXISTS (SELECT 1 FROM contabil_lucro_real_pagamentos g WHERE g.cnpj=s.cnpj AND g.ano=s.ano AND g.periodo=s.periodo AND g.tributo=s.tributo) AS pago
    FROM contabil_lr_darf_serpro s LEFT JOIN contabil_lucro_real_apuracoes a ON a.cnpj=s.cnpj AND a.ano=s.ano AND a.periodo=s.periodo`).catch(() => ({ rows: [] as any[] }));
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const divergentes: string[] = []; const vencidos: string[] = [];
  for (const x of r.rows) {
    const nome = `${String(x.cnpj).trim()} ${x.ano} ${x.periodo} ${String(x.tributo).toUpperCase()}`;
    const res = typeof x.resultado === "string" ? JSON.parse(x.resultado) : x.resultado;
    const atual = (res?.darfs || []).find((d: any) => d.tributo === x.tributo);
    if (x.status !== "confirmado" || !atual || atual.codigo !== x.codigo || (x.valor_centavos !== null && Number(atual.valorCentavos) !== Number(x.valor_centavos))) { divergentes.push(nome); continue; }
    if (!x.pago && atual.vencimento && String(atual.vencimento) < hoje) vencidos.push(nome);
  }
  const partes: string[] = [];
  if (divergentes.length) partes.push(`ATENÇÃO: ${divergentes.length} DARF gerado(s) pelo Serpro não bate(m) mais com a apuração (período reaberto ou valor mudou): ${divergentes.slice(0, 3).join("; ")}. Não pague esse código de barras; gere de novo depois de confirmar.`);
  if (vencidos.length) partes.push(`${vencidos.length} DARF gerado(s) pelo Serpro já vencido(s) e sem pagamento registrado: ${vencidos.slice(0, 3).join("; ")}. Se já pagou, registre o pagamento; se não, gere de novo com multa e juros.`);
  const resumo = partes.length ? partes.join(" ") : r.rows.length ? `${r.rows.length} DARF gerado(s) pelo Serpro conferido(s): todos batem com a apuração.` : "Nenhum DARF do Lucro Real gerado pelo Serpro ainda.";
  return { guardados: r.rows.length, divergentes, vencidosSemPagamento: vencidos, resumo, alerta: divergentes.length > 0 };
}

type Mw = express.RequestHandler;
type Acesso = (req: express.Request, res: express.Response, escrever: boolean) => { sessao: { login: string; tenantId?: string; escritorioDe?: string; userId: string }; cnpj: string } | null;
export function registrarRotasDarfSerproLucroReal(app: express.Express, mw: { exigirSessao: Mw; exigirOrigem: Mw }, acesso: Acesso, d: DepsDarfSerpro): void {
  const anoDe = (v: unknown) => { const a = Number(v); return Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : null; };
  app.get("/api/workspaces/:cnpj/lucro-real/darf-serpro", mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, false); if (!a) return;
    const ano = anoDe(req.query.ano); if (!ano) return res.status(400).json({ sucesso: false, motivo: "Informe o ano." });
    try { return res.json({ sucesso: true, consultasPagas: 2, codigos: CODIGOS_SERPRO_LUCRO_REAL, jcp: MOTIVO_JCP_SICALC, darfs: await listarDarfSerpro(d.consultar, a.cnpj, ano) }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler os DARF do Serpro agora." }); }
  });
  // CONSOME CRÉDITO: só por clique, depois do cartão (corpo com confirmado: true). Nenhum robô chama esta rota.
  app.post("/api/workspaces/:cnpj/lucro-real/darf-serpro", mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, true); if (!a) return;
    const b = req.body || {};
    if (b.confirmado !== true) return res.status(400).json({ sucesso: false, motivo: "Confirme no cartão: gerar o DARF pelo Serpro consome crédito (2 consultas pagas)." });
    const ano = anoDe(b.ano); if (!ano) return res.status(400).json({ sucesso: false, motivo: "Informe o ano." });
    try {
      const r = await gerarDarfSerproLucroReal(d, { cnpj: a.cnpj, ano, periodo: String(b.periodo || ""), tributo: String(b.tributo || "").toLowerCase(), tenantId: String(a.sessao.tenantId || a.sessao.escritorioDe || a.sessao.userId), login: a.sessao.login, gerarDeNovo: b.gerarDeNovo === true });
      if (r.ok === false) return res.status(r.status).json({ sucesso: false, motivo: r.motivo });
      return res.json({ sucesso: true, darf: r.darf });
    } catch (e: any) { console.error("[lucro-real darf-serpro]", e?.message || e); return res.status(503).json({ sucesso: false, motivo: String(e?.message || "Não foi possível gerar agora.").slice(0, 200) }); }
  });
  app.get("/api/workspaces/:cnpj/lucro-real/darf-serpro/:ano/:periodo/:tributo.pdf", mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, false); if (!a) return;
    try {
      await prepararDarfSerpro(d.consultar);
      const x = (await d.consultar(`SELECT pdf_base64, codigo FROM contabil_lr_darf_serpro WHERE cnpj=$1 AND ano=$2 AND periodo=$3 AND tributo=$4`, [a.cnpj, anoDe(req.params.ano), String(req.params.periodo), String(req.params.tributo)])).rows[0];
      if (!x?.pdf_base64) return res.status(404).json({ sucesso: false, motivo: "Este DARF ainda não foi gerado pelo Serpro." });
      res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="DARF-${a.cnpj}-${req.params.ano}-${req.params.periodo}-${String(req.params.tributo).toUpperCase()}.pdf"`);
      return res.send(Buffer.from(String(x.pdf_base64), "base64"));
    } catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível ler o DARF agora." }); }
  });
}
