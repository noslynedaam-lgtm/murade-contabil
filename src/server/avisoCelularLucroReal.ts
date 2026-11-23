// AVISO NO CELULAR da Central do Lucro Real. O Contábil NÃO tem estrutura própria de notificação: usa a do Murad Fiscal (Central
// Anti-Multa — mesmas assinaturas de aparelho, mesmo histórico, mesmas preferências de silêncio e horário silencioso), pela integração
// servidor a servidor que já existe (Bearer MURADE_INTEGRATION_TOKEN), como o DP já faz com o aviso do ponto.
//
// - Um aviso por empresa por dia (a partir das 8h de Brasília), com o que é mais urgente primeiro, enquanto houver aviso na Central
//   (sem confirmar, vencendo em 10, 5, 3 e 1 dia, no dia, atrasado, diferença que bloqueia a guia). Os avisos só param com a
//   confirmação e a baixa, como na tela.
// - Sem valores na tela bloqueada (mesma regra do Fiscal): só a obrigação, a empresa e o prazo.
// - Vai para os usuários do escritório que têm acesso à empresa no Fiscal (cada escritório só recebe as suas) e ativaram o aviso no
//   aparelho em Murad Fiscal › Federal & Simples › Central Anti-Multa › "Ativar avisos neste aparelho". Ao tocar, abre o Contábil.
// - Fiscal fora do ar: nada é marcado como enviado; o robô tenta de novo na rodada seguinte (2 em 2 horas) e o conferidor avisa.
import type { Consultar } from "./lucroRealApuracao";
import type { AlertaLR } from "./centralLucroReal";
import { cobertoPeloUrgente } from "./alertaUrgenteContabil";

export interface ResultadoEnvio { destinatarios: number; enviados: number; semAparelho: number; silenciados: number; adiados: number; falhas: number }
export interface ItemAviso { cnpj: string; razaoSocial: string; alertas: AlertaLR[] }
export interface CargaAviso { chave: string; titulo: string; corpo: string }

const curto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);

/** Texto do aviso do dia da empresa (sem valores). Nulo quando não há aviso. */
export function montarAvisoCelular(item: ItemAviso, hoje: string, sufixo = ""): CargaAviso | null {
  // IRPJ/CSLL, IRRF do JCP, ECD e ECF de 7 dias antes até 30 dias de atraso saem pelo alerta urgente (alertaUrgenteContabil.ts), com a
  // insistência do dia: aqui não repetem (nunca aviso duplicado).
  const al = item.alertas.filter((a) => (a.nivel === "vermelho" || a.nivel === "amarelo") && !cobertoPeloUrgente(a.obrigacaoId, a.dias));
  if (!al.length) return null;
  const verm = al.filter((a) => a.nivel === "vermelho").length;
  const nome = curto(item.razaoSocial || item.cnpj, 40);
  const titulo = curto(`Lucro Real — ${nome}: ${al.length} aviso(s)${verm ? `, ${verm} urgente(s)` : ""}`, 90);
  // Títulos da Central não têm valor em reais (só a obrigação e o prazo); o texto da diferença é trocado por uma frase sem números.
  const linhas = al.slice(0, 3).map((a) => (a.obrigacaoId.startsWith("divergencia:") ? `${a.titulo}: guia bloqueada até você decidir` : a.titulo.replace(/R\$\s?[\d.,]+/g, "").trim()));
  const corpo = curto(`${linhas.join(" · ")}${al.length > 3 ? ` · +${al.length - 3}` : ""}. Abra Murad Contábil › Livros › Apuração do Lucro Real › Central do Lucro Real. Os avisos param com a confirmação e a baixa.`, 400);
  return { chave: `central|${hoje}${sufixo}`, titulo, corpo };
}

export type Enviar = (cnpj: string, avisos: CargaAviso[]) => Promise<ResultadoEnvio>;

let pronta: Promise<void> | null = null;
export function prepararAvisoCelular(q: Consultar): Promise<void> {
  pronta ??= q(`CREATE TABLE IF NOT EXISTS contabil_lr_aviso_celular (cnpj text NOT NULL, chave text NOT NULL, titulo text NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(),
    destinatarios int NOT NULL DEFAULT 0, enviados int NOT NULL DEFAULT 0, sem_aparelho int NOT NULL DEFAULT 0, silenciados int NOT NULL DEFAULT 0, adiados int NOT NULL DEFAULT 0, falhas int NOT NULL DEFAULT 0, PRIMARY KEY (cnpj, chave))`)
    .then(() => undefined).catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheAvisoCelularParaTeste(): void { pronta = null; }

export interface ResumoAviso { empresas: number; comAviso: number; entregues: number; jaEnviados: number; falhasFiscal: number; semAparelho: number; erros: string[] }
/**
 * Robô: manda o aviso do dia de cada empresa (uma vez por dia; `manual` manda de novo, no máximo uma vez por hora). Grava só o que o
 * Fiscal aceitou. `itens` = empresas do Lucro Real com os alertas da Central (já filtradas por escritório quando vem da tela).
 */
export async function enviarAvisosCelular(q: Consultar, itens: ItemAviso[], enviar: Enviar, hoje: string, horaSP: number, manual = false): Promise<ResumoAviso> {
  await prepararAvisoCelular(q);
  const r: ResumoAviso = { empresas: itens.length, comAviso: 0, entregues: 0, jaEnviados: 0, falhasFiscal: 0, semAparelho: 0, erros: [] };
  if (!manual && horaSP < 8) return r;
  for (const it of itens) {
    const carga = montarAvisoCelular(it, hoje, manual ? `|manual|${String(horaSP).padStart(2, "0")}` : "");
    if (!carga) continue;
    r.comAviso += 1;
    if ((await q(`SELECT 1 FROM contabil_lr_aviso_celular WHERE cnpj=$1 AND chave=$2`, [it.cnpj, carga.chave])).rows.length) { r.jaEnviados += 1; continue; }
    try {
      const e = await enviar(it.cnpj, [carga]);
      await q(`INSERT INTO contabil_lr_aviso_celular (cnpj, chave, titulo, destinatarios, enviados, sem_aparelho, silenciados, adiados, falhas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (cnpj, chave) DO NOTHING`,
        [it.cnpj, carga.chave, carga.titulo, e.destinatarios, e.enviados, e.semAparelho, e.silenciados, e.adiados, e.falhas]);
      r.entregues += e.enviados; if (e.destinatarios > 0 && e.enviados === 0 && e.semAparelho >= e.destinatarios) r.semAparelho += 1;
    } catch (err: any) { r.falhasFiscal += 1; if (r.erros.length < 3) r.erros.push(String(err?.message || err).slice(0, 120)); }
  }
  return r;
}

/** Conferidor: depois das 10h, empresa com aviso vermelho e sem aviso aceito pelo Fiscal hoje = falha (o robô parou ou o Fiscal não respondeu). */
export async function conferirAvisosCelular(q: Consultar, itens: ItemAviso[], hoje: string, horaSP: number): Promise<{ semEnvio: string[]; semAparelho: string[] }> {
  await prepararAvisoCelular(q);
  const semEnvio: string[] = []; const semAparelho: string[] = [];
  if (horaSP < 10) return { semEnvio, semAparelho };
  for (const it of itens) {
    if (!it.alertas.some((a) => a.nivel === "vermelho")) continue;
    const l = (await q(`SELECT destinatarios, enviados, sem_aparelho FROM contabil_lr_aviso_celular WHERE cnpj=$1 AND chave LIKE $2 ORDER BY enviado_em DESC LIMIT 1`, [it.cnpj, `central|${hoje}%`])).rows[0];
    if (!l) semEnvio.push(it.razaoSocial || it.cnpj);
    else if (Number(l.destinatarios) === 0 || Number(l.sem_aparelho) >= Number(l.destinatarios)) semAparelho.push(it.razaoSocial || it.cnpj);
  }
  return { semEnvio, semAparelho };
}

export async function situacaoAvisosCelular(q: Consultar, cnpjs: string[], hoje: string): Promise<Array<{ cnpj: string; chave: string; titulo: string; enviadoEm: string; destinatarios: number; enviados: number; semAparelho: number; silenciados: number; adiados: number }>> {
  await prepararAvisoCelular(q);
  if (!cnpjs.length) return [];
  const r = await q(`SELECT * FROM contabil_lr_aviso_celular WHERE cnpj = ANY($1::text[]) AND chave LIKE $2 ORDER BY enviado_em DESC LIMIT 300`, [cnpjs, `central|${hoje}%`]);
  return r.rows.map((x) => ({ cnpj: String(x.cnpj), chave: String(x.chave), titulo: String(x.titulo), enviadoEm: new Date(x.enviado_em).toISOString(), destinatarios: Number(x.destinatarios), enviados: Number(x.enviados), semAparelho: Number(x.sem_aparelho), silenciados: Number(x.silenciados), adiados: Number(x.adiados) }));
}

/** Transporte real: POST no Fiscal (mesmo token e mesma lista de endereços permitidos das outras chamadas ao Fiscal). */
export function enviarPeloFiscal(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Enviar {
  return async (cnpj, avisos) => {
    const token = env.MURADE_INTEGRATION_TOKEN?.trim(); if (!token) throw new Error("MURADE_INTEGRATION_TOKEN não configurado no Contábil.");
    const destino = new URL("/api/integracao/contabil/aviso-lucro-real", (env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim());
    if (destino.protocol !== "https:" || destino.hostname !== "murade-fiscal-1.onrender.com" || destino.username || destino.password) throw new Error("Endereço do Fiscal fora da lista permitida.");
    const r = await fetcher(destino, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ cnpj, avisos }), signal: AbortSignal.timeout(60_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.sucesso !== true) throw new Error(j?.motivo || `O Fiscal respondeu HTTP ${r.status}.`);
    const n = (k: string) => (Number.isFinite(Number(j[k])) ? Number(j[k]) : 0);
    return { destinatarios: n("destinatarios"), enviados: n("enviados"), semAparelho: n("semAparelho"), silenciados: n("silenciados"), adiados: n("adiados"), falhas: n("falhas") };
  };
}
