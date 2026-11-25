// AVISO NO APARELHO do próprio Murad Contábil ("Ativar avisos neste aparelho" no Contábil).
// Antes o botão do Contábil abria a página do Murad Fiscal (o aviso só chegava pelo aplicativo do Fiscal). Agora o Contábil tem o
// próprio envio: service worker (public/sw.js), chaves VAPID no Render (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) e os aparelhos de
// cada pessoa nesta tabela. O alerta urgente do Contábil vai primeiro para os aparelhos ativados aqui; quem ainda não ativou aqui
// continua recebendo pelo aplicativo do Fiscal, como antes — e quem recebeu aqui não recebe de novo por lá (sem aviso em dobro).
// Cada escritório só avisa a própria equipe: os destinatários são os mesmos que enxergam a empresa ao entrar (acesso direto ou
// equipe do escritório dono), nunca outro escritório e nunca o perfil somente leitura.
import webpush from "web-push";
import type { CargaUrgente, EnviarUrgente, ResultadoEnvioFiscal } from "./alertaUrgenteContabil";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type EnviarPushContabil = (assinatura: { endpoint: string; keys: { p256dh: string; auth: string } }, carga: string) => Promise<void>;

export const pushConfiguradoContabil = (env: Record<string, string | undefined> = process.env) => Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
export const chavePublicaContabil = (env: Record<string, string | undefined> = process.env) => env.VAPID_PUBLIC_KEY?.trim() || "";

let pronta: Promise<void> | null = null;
export function prepararAvisoAparelho(q: Consultar): Promise<void> {
  pronta ??= q(`CREATE TABLE IF NOT EXISTS contabil_push_aparelhos (endpoint text PRIMARY KEY, user_id uuid NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
      criado_em timestamptz NOT NULL DEFAULT now(), ultimo_ok timestamptz, falhas int NOT NULL DEFAULT 0, ultimo_erro text);
    CREATE INDEX IF NOT EXISTS contabil_push_aparelhos_user ON contabil_push_aparelhos (user_id);`).then(() => undefined).catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheAvisoAparelhoParaTeste(): void { pronta = null; }

export async function assinarAparelho(q: Consultar, userId: string, sub: any): Promise<void> {
  await prepararAvisoAparelho(q);
  const endpoint = String(sub?.endpoint || ""); const p256dh = String(sub?.keys?.p256dh || ""); const auth = String(sub?.keys?.auth || "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) throw new Error("Assinatura de notificação inválida.");
  await q(`INSERT INTO contabil_push_aparelhos (endpoint, user_id, p256dh, auth) VALUES ($1,$2,$3,$4)
    ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, falhas=0, ultimo_erro=NULL`, [endpoint, userId, p256dh, auth]);
}
export async function cancelarAparelho(q: Consultar, userId: string, endpoint: string): Promise<void> {
  await prepararAvisoAparelho(q);
  await q(`DELETE FROM contabil_push_aparelhos WHERE endpoint=$1 AND user_id=$2`, [endpoint, userId]);
}
export async function aparelhosDoUsuario(q: Consultar, userId: string): Promise<number> {
  await prepararAvisoAparelho(q);
  return Number((await q(`SELECT count(*)::int AS n FROM contabil_push_aparelhos WHERE user_id=$1`, [userId])).rows[0]?.n || 0);
}

let vapidPronto = false;
const enviarReal: EnviarPushContabil = async (a, carga) => {
  if (!vapidPronto) { webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:contato@murade.com.br", process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim()); vapidPronto = true; }
  await webpush.sendNotification(a as any, carga, { TTL: 12 * 60 * 60, urgency: "high" });
};

/** Manda para todos os aparelhos da pessoa; apaga o aparelho que o serviço de aviso diz que não existe mais (404/410). */
export async function enviarAoUsuario(q: Consultar, userId: string, aviso: { titulo: string; corpo: string; tag?: string; url?: string }, enviar: EnviarPushContabil = enviarReal): Promise<{ enviados: number; aparelhos: number }> {
  await prepararAvisoAparelho(q);
  if (enviar === enviarReal && !pushConfiguradoContabil()) return { enviados: 0, aparelhos: 0 };
  const subs = (await q(`SELECT endpoint, p256dh, auth FROM contabil_push_aparelhos WHERE user_id=$1`, [userId])).rows;
  let enviados = 0;
  for (const s of subs) {
    try {
      await enviar({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, tag: aviso.tag || "contabil-urgente", url: aviso.url || "/" }));
      enviados += 1;
      await q(`UPDATE contabil_push_aparelhos SET ultimo_ok=now(), falhas=0, ultimo_erro=NULL WHERE endpoint=$1`, [String(s.endpoint)]);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await q(`DELETE FROM contabil_push_aparelhos WHERE endpoint=$1`, [String(s.endpoint)]);
      else await q(`UPDATE contabil_push_aparelhos SET falhas=falhas+1, ultimo_erro=$2 WHERE endpoint=$1`, [String(s.endpoint), String(e?.message || "falha").slice(0, 200)]);
    }
  }
  return { enviados, aparelhos: subs.length };
}

/** Quem enxerga a empresa no Contábil (acesso direto que não é só leitura + a equipe do escritório dono), sem desativados. */
export async function destinatariosDaEmpresa(q: Consultar, cnpj: string): Promise<Array<{ id: string; login: string }>> {
  const diretos = `SELECT u.id, u.login FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1 AND a.role <> 'viewer' AND u.disabled=false`;
  const r = await q(`${diretos}
    UNION
    SELECT m.id, m.login FROM contabil_auth_company_access a JOIN contabil_auth_users o ON o.id=a.user_id AND o.disabled=false AND o.global_admin=true
      JOIN contabil_auth_users m ON m.office_owner=o.id AND m.global_admin=false AND m.disabled=false WHERE a.cnpj=$1`, [cnpj])
    .catch(() => q(diretos, [cnpj])); // banco sem a coluna da equipe: só quem tem acesso direto
  const vistos = new Set<string>(); const out: Array<{ id: string; login: string }> = [];
  for (const x of r.rows) { const id = String(x.id); if (!vistos.has(id)) { vistos.add(id); out.push({ id, login: String(x.login) }); } }
  return out;
}

/**
 * Transporte do alerta urgente: primeiro os aparelhos ativados no próprio Contábil; depois o Fiscal, só para quem não recebeu aqui
 * (o Fiscal recebe a lista "entreguesNoContabil" e não repete). Se o Fiscal não responder mas alguém já recebeu aqui, o envio conta
 * como feito (não manda de novo na próxima rodada); se ninguém recebeu e o Fiscal falhou, o erro sobe para tentar de novo.
 */
export function enviarUrgenteContabilEFiscal(q: Consultar, viaFiscal: EnviarUrgente, enviar: EnviarPushContabil = enviarReal): EnviarUrgente {
  return async (cnpj, avisos) => {
    const dest = await destinatariosDaEmpresa(q, cnpj).catch(() => [] as Array<{ id: string; login: string }>);
    const total: ResultadoEnvioFiscal = { destinatarios: 0, enviados: 0, semAparelho: 0, silenciados: 0, adiados: 0, falhas: 0 };
    const paraFiscal: CargaUrgente[] = [];
    let aqui = 0;
    for (const a of avisos) {
      const desligou = new Set(a.silenciadosPor.map((l) => l.trim().toLowerCase()));
      const recebeuAqui: string[] = [];
      for (const u of dest) {
        if (desligou.has(u.login.trim().toLowerCase())) continue;
        const r = await enviarAoUsuario(q, u.id, { titulo: a.titulo, corpo: a.corpo, tag: a.chave.slice(0, 60) }, enviar).catch(() => ({ enviados: 0, aparelhos: 0 }));
        if (r.enviados > 0) { recebeuAqui.push(u.login); aqui += 1; }
      }
      paraFiscal.push({ ...a, entreguesNoContabil: recebeuAqui });
    }
    try {
      const f = await viaFiscal(cnpj, paraFiscal);
      return { ...f, destinatarios: Math.max(f.destinatarios, dest.length), enviados: f.enviados + aqui };
    } catch (e) {
      if (aqui > 0) return { ...total, destinatarios: dest.length, enviados: aqui };
      throw e;
    }
  };
}
