// Contábil → Fiscal: baixa automática das guias do aplicativo do cliente pelo EXTRATO BANCÁRIO importado aqui (grátis, sem API de banco).
// O Contábil manda ao Fiscal (servidor a servidor, credencial de integração) os movimentos dos últimos 60 dias de cada empresa; o Fiscal,
// dono das guias, confere e baixa só o que casa com certeza:
//  - débito com o MESMO valor e a MESMA data da guia (vencimento, dia em que o cliente informou ou data lida do comprovante), ou com o
//    código/identificador da guia no histórico;
//  - no extrato do banco do ESCRITÓRIO, o crédito do honorário (mesmo valor e data, ou o txid do Pix no histórico).
// Movimento que serve para mais de uma guia não é baixado (fica para o contador). O mesmo movimento nunca baixa duas guias.
// Nada aqui muda o extrato, a conciliação ou os lançamentos do Contábil: só lê e registra o que já mandou.
import crypto from "node:crypto";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type Buscar = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export const DIAS_EXTRATO_PARA_BAIXA = 60;
/** Movimento sem guia que case é reenviado no máximo uma vez a cada 20 horas (a guia pode ser lançada ou informada depois). */
export const HORAS_REENVIO = 20;
const HOST_FISCAL = "murade-fiscal-1.onrender.com";

let preparado: Promise<void> | null = null;
export function prepararBaixaGuias(consultar: Consultar): Promise<void> {
  preparado ??= consultar(`CREATE TABLE IF NOT EXISTS contabil_extrato_baixa_envios (
      cnpj char(14) NOT NULL, conta_banco varchar(64) NOT NULL, fitid varchar(160) NOT NULL,
      enviado_em timestamptz NOT NULL DEFAULT now(), casou boolean NOT NULL DEFAULT false, guia_tipo text NOT NULL DEFAULT '',
      PRIMARY KEY (cnpj, conta_banco, fitid))`).then(() => undefined).catch((e) => { preparado = null; throw e; });
  return preparado;
}
export const reiniciarPreparoBaixaGuiasParaTeste = () => { preparado = null; };

/** Identificador único do movimento para o Fiscal: conta + fitid (duas contas da mesma empresa podem repetir o fitid do banco). */
export function idMovimento(contaBanco: string, fitid: string): string {
  const bruto = `${contaBanco}:${fitid}`;
  return bruto.length <= 160 ? bruto : `${contaBanco.slice(0, 40)}:${crypto.createHash("sha256").update(fitid).digest("hex")}`;
}

export function destinoFiscal(env: NodeJS.ProcessEnv = process.env): URL | null {
  try {
    const u = new URL("/api/integracao/fiscal/guias/baixa-extrato", (env.MURADE_FISCAL_URL || `https://${HOST_FISCAL}`).trim());
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch { return null; }
}

export interface ResultadoBaixaGuias { configurado: boolean; empresas: number; enviados: number; guiasBaixadas: number; ambiguos: number; falhas: Array<{ cnpj: string; motivo: string }>; resumo: string; atencao: boolean }

/**
 * Manda ao Fiscal os movimentos ainda não enviados (ou sem guia, depois de 20 horas) dos últimos 60 dias. `cnpjs` limita às empresas
 * (importação de um extrato, "Rodar agora" de um escritório). Falha de uma empresa não trava as outras; o que não foi aceito volta na próxima rodada.
 */
export async function enviarExtratoParaBaixa(consultar: Consultar, opcoes: { cnpjs?: string[]; env?: NodeJS.ProcessEnv; buscar?: Buscar; hoje?: string } = {}): Promise<ResultadoBaixaGuias> {
  const env = opcoes.env ?? process.env;
  const token = env.MURADE_INTEGRATION_TOKEN?.trim(); const destino = destinoFiscal(env);
  const vazio = (resumo: string, configurado: boolean): ResultadoBaixaGuias => ({ configurado, empresas: 0, enviados: 0, guiasBaixadas: 0, ambiguos: 0, falhas: [], resumo, atencao: false });
  if (!token || !destino) return vazio("Integração com o Fiscal não configurada (MURADE_INTEGRATION_TOKEN / MURADE_FISCAL_URL): a baixa das guias pelo extrato fica parada.", false);
  await prepararBaixaGuias(consultar);
  const hoje = opcoes.hoje || new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [a, m, d] = hoje.split("-").map(Number); const desde = new Date(Date.UTC(a, m - 1, d - DIAS_EXTRATO_PARA_BAIXA)).toISOString().slice(0, 10);
  const r = await consultar(`SELECT m.cnpj, m.conta_banco, m.fitid, to_char(m.data,'YYYY-MM-DD') AS data_iso, m.valor_centavos, m.memo
    FROM contabil_extrato_movimentos m
    LEFT JOIN contabil_extrato_baixa_envios e ON e.cnpj = m.cnpj AND e.conta_banco = m.conta_banco AND e.fitid = m.fitid
    WHERE m.data >= $1::date${opcoes.cnpjs?.length ? " AND m.cnpj = ANY($2::text[])" : ""}
      AND (e.fitid IS NULL OR (e.casou = false AND e.enviado_em < now() - interval '${HORAS_REENVIO} hours'))
    ORDER BY m.cnpj, m.data LIMIT 20000`, opcoes.cnpjs?.length ? [desde, opcoes.cnpjs] : [desde]);
  const porCnpj = new Map<string, any[]>();
  for (const x of r.rows) { const c = String(x.cnpj).trim(); porCnpj.set(c, [...(porCnpj.get(c) || []), x]); }
  const out: ResultadoBaixaGuias = { configurado: true, empresas: porCnpj.size, enviados: 0, guiasBaixadas: 0, ambiguos: 0, falhas: [], resumo: "", atencao: false };
  const buscar: Buscar = opcoes.buscar ?? ((u, i) => fetch(u, i as any) as any);
  for (const [cnpj, linhas] of porCnpj) {
    try {
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500);
        const mapa = new Map(lote.map((x) => [idMovimento(String(x.conta_banco), String(x.fitid)), x]));
        const resp = await buscar(destino.toString(), {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ cnpj, movimentos: [...mapa].map(([id, x]) => ({ fitid: id, data: String(x.data_iso), valorCentavos: Number(x.valor_centavos), memo: String(x.memo || "") })) }),
        });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok || corpo?.sucesso !== true) throw new Error(String(corpo?.motivo || `O Fiscal respondeu HTTP ${resp.status}.`).slice(0, 200));
        const casados = new Map<string, string>((Array.isArray(corpo.baixadas) ? corpo.baixadas : []).map((b: any) => [String(b.fitid), String(b.tipo || "")]));
        for (const [id, x] of mapa) {
          await consultar(`INSERT INTO contabil_extrato_baixa_envios (cnpj, conta_banco, fitid, enviado_em, casou, guia_tipo) VALUES ($1,$2,$3,now(),$4,$5)
            ON CONFLICT (cnpj, conta_banco, fitid) DO UPDATE SET enviado_em = now(), casou = EXCLUDED.casou OR contabil_extrato_baixa_envios.casou, guia_tipo = CASE WHEN EXCLUDED.casou THEN EXCLUDED.guia_tipo ELSE contabil_extrato_baixa_envios.guia_tipo END`,
            [cnpj, String(x.conta_banco), String(x.fitid), casados.has(id), casados.get(id) || ""]);
        }
        out.enviados += mapa.size; out.guiasBaixadas += casados.size; out.ambiguos += Number(corpo.ambiguos || 0);
      }
    } catch (e: any) { out.falhas.push({ cnpj, motivo: String(e?.message || e).slice(0, 200) }); }
  }
  out.atencao = out.falhas.length > 0;
  out.resumo = !out.empresas ? "Nenhum movimento novo de extrato para conferir com as guias do Fiscal."
    : `${out.enviados} movimento(s) de ${out.empresas} empresa(s) conferido(s) com as guias do Fiscal: ${out.guiasBaixadas} guia(s) baixada(s) como paga(s) pelo extrato${out.ambiguos ? `; ${out.ambiguos} movimento(s) serviam para mais de uma guia e ficaram para o contador` : ""}.${out.falhas.length ? ` ATENÇÃO: ${out.falhas.length} empresa(s) não foram conferidas agora (${out.falhas[0].motivo}); repete na próxima rodada.` : ""}`;
  return out;
}

/** Situação da empresa (tela e Agente): quantos movimentos já foram ao Fiscal e quantos baixaram guia. */
export async function situacaoBaixaGuias(consultar: Consultar, cnpj: string): Promise<{ enviados: number; guiasBaixadas: number; ultimoEnvio: string | null; porTipo: Record<string, number> }> {
  await prepararBaixaGuias(consultar);
  const r = await consultar("SELECT count(*)::int AS n, count(*) FILTER (WHERE casou)::int AS c, max(enviado_em) AS u FROM contabil_extrato_baixa_envios WHERE cnpj = $1", [cnpj]);
  const t = await consultar("SELECT guia_tipo, count(*)::int AS n FROM contabil_extrato_baixa_envios WHERE cnpj = $1 AND casou GROUP BY guia_tipo", [cnpj]);
  const l = r.rows[0] || {};
  return { enviados: Number(l.n || 0), guiasBaixadas: Number(l.c || 0), ultimoEnvio: l.u ? new Date(l.u).toISOString() : null, porTipo: Object.fromEntries(t.rows.map((x) => [String(x.guia_tipo || "guia"), Number(x.n)])) };
}
