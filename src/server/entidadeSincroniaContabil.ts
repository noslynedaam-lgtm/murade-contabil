// Marca de entidade imune/isenta (tipo, certificação de entidade beneficente e validade) entre os três sistemas Murad — lado do Contábil.
// Mesmo caminho das empresas: o Contábil lê /api/integracao/fiscal/empresas (campo `entidadeMarcas`, com a marca do Fiscal e a que o DP
// mandou) e manda as marcas feitas à mão aqui para /api/integracao/fiscal/entidade. O Fiscal é o ponto de encontro.
// Regra (a mesma nos três): quem está em branco recebe; o que foi marcado à mão NUNCA é sobrescrito — se for diferente, vira aviso.
// Só mexe no cadastro (workspace.empresa) da empresa que já existe aqui; nunca cria empresa e nunca mexe em lançamento.
import { urlDoSistema } from "./agentesEntreSistemas";

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type Origem = "fiscal" | "dp" | "contabil";
export interface MarcaEntidade { tipo: "imune" | "isenta"; certificada: boolean; certificacaoValidade: string | null; origem: Origem }
export interface MarcaLocal { tipo: "imune" | "isenta" | null; outroRegime: string | null; certificada: boolean; certificacaoValidade: string | null }
export interface DecisaoSincronia { aplicar: { tipo?: "imune" | "isenta"; certificada?: boolean; certificacaoValidade?: string | null; origem: Origem } | null; divergencias: string[] }

const EU: Origem = "contabil";
const soAlfanum = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const data = (v: unknown) => { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
export const nomeSistema = (o: Origem) => (o === "fiscal" ? "Murad Fiscal" : o === "contabil" ? "Murad Contábil" : "Murad DP");
const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem data");
const textoCert = (m: { certificada: boolean; certificacaoValidade: string | null }) => (m.certificada ? `certificada até ${br(m.certificacaoValidade)}` : "sem certificação");

/** Marcas que vieram do Fiscal para um CNPJ (a do próprio Contábil é ignorada). A do Fiscal vem primeiro. */
export function marcasRecebidas(empresa: any, eu: Origem = EU): MarcaEntidade[] {
  const brutas: any[] = Array.isArray(empresa?.entidadeMarcas) ? empresa.entidadeMarcas : empresa?.entidade ? [empresa.entidade] : [];
  const out: MarcaEntidade[] = []; const vistas = new Set<string>();
  for (const m of brutas) {
    const origem: Origem | null = m?.origem === "fiscal" || m?.origem === "dp" || m?.origem === "contabil" ? m.origem : null;
    if (!origem || origem === eu || vistas.has(origem) || (m?.tipo !== "imune" && m?.tipo !== "isenta")) continue;
    vistas.add(origem);
    const certificada = m?.certificada === true;
    out.push({ tipo: m.tipo, certificada, certificacaoValidade: certificada ? data(m?.certificacaoValidade) : null, origem });
  }
  return out.sort((a, b) => Number(b.origem === "fiscal") - Number(a.origem === "fiscal"));
}

/** Compara a marca daqui com as dos outros sistemas. Só aplica o que está em branco aqui; o resto vira divergência. */
export function decidirSincronia(local: MarcaLocal, marcas: MarcaEntidade[]): DecisaoSincronia {
  const div: string[] = [];
  if (!marcas.length) return { aplicar: null, divergencias: div };
  const tipos = [...new Set(marcas.map((m) => m.tipo))];
  if (tipos.length > 1) div.push(`os outros sistemas não concordam: ${marcas.map((m) => `no ${nomeSistema(m.origem)} está como entidade ${m.tipo}`).join(" e ")}`);
  if (!local.tipo) {
    if (local.outroRegime) { for (const m of marcas) div.push(`aqui está como ${local.outroRegime} e no ${nomeSistema(m.origem)} como entidade ${m.tipo}`); return { aplicar: null, divergencias: div }; }
    if (tipos.length > 1) return { aplicar: null, divergencias: div };
    const pref = marcas[0]; const certs = marcas.filter((m) => m.certificada);
    const certIguais = certs.every((m) => m.certificacaoValidade === certs[0]?.certificacaoValidade);
    if (certs.length && !certIguais) div.push(`certificação diferente entre os outros sistemas: ${certs.map((m) => `${nomeSistema(m.origem)} ${textoCert(m)}`).join("; ")}`);
    return { aplicar: { tipo: pref.tipo, ...(certs.length && certIguais ? { certificada: true, certificacaoValidade: certs[0].certificacaoValidade } : {}), origem: pref.origem }, divergencias: div };
  }
  for (const m of marcas) if (m.tipo !== local.tipo) div.push(`aqui está como entidade ${local.tipo} e no ${nomeSistema(m.origem)} como entidade ${m.tipo}`);
  const mesmas = marcas.filter((m) => m.tipo === local.tipo && m.certificada);
  const localEmBranco = !local.certificada && !local.certificacaoValidade;
  if (!mesmas.length) return { aplicar: null, divergencias: div };
  if (localEmBranco) {
    const iguais = mesmas.every((m) => m.certificacaoValidade === mesmas[0].certificacaoValidade);
    if (iguais) return { aplicar: { certificada: true, certificacaoValidade: mesmas[0].certificacaoValidade, origem: mesmas[0].origem }, divergencias: div };
    div.push(`certificação diferente entre os outros sistemas: ${mesmas.map((m) => `${nomeSistema(m.origem)} ${textoCert(m)}`).join("; ")}`);
    return { aplicar: null, divergencias: div };
  }
  for (const m of mesmas) if ((m.certificacaoValidade || null) !== (local.certificacaoValidade || null) || !local.certificada) div.push(`certificação diferente: aqui ${textoCert(local)}; no ${nomeSistema(m.origem)} ${textoCert(m)}`);
  return { aplicar: null, divergencias: div };
}

// ------------------------------------------------------------------------------------------------------------------------------
// Cadastro do Contábil (contabil_company_workspaces.payload.empresa: regime, entidadeCertificada, entidadeCertificacaoValidade)
// ------------------------------------------------------------------------------------------------------------------------------
const REGIME: Record<"imune" | "isenta", string> = { imune: "Entidade imune", isenta: "Entidade isenta" };
const BRANCO = new Set(["", "não informado", "nao informado"]);
export function marcaLocalDoContabil(e: any): MarcaLocal {
  const regime = String(e?.regime ?? "").trim();
  const tipo = regime === "Entidade imune" ? "imune" : regime === "Entidade isenta" ? "isenta" : null;
  const certificada = tipo ? e?.entidadeCertificada === true : false;
  return { tipo, outroRegime: tipo || BRANCO.has(regime.toLowerCase()) ? null : regime, certificada, certificacaoValidade: certificada ? data(e?.entidadeCertificacaoValidade) : null };
}
/** Marca feita à mão aqui (para mandar ao Fiscal): entidade marcada e diferente do que a sincronia gravou por último. */
export function marcaFeitaAqui(e: any): boolean {
  const l = marcaLocalDoContabil(e); if (!l.tipo) return false;
  const s = e?.entidadeSincronizada;
  return !(s && s.tipo === l.tipo && (s.certificada === true) === l.certificada && (s.certificacaoValidade ?? null) === (l.certificacaoValidade ?? null));
}

let prontas = new WeakMap<Consultar, Promise<void>>();
export function prepararSincroniaEntidadeContabil(consultar: Consultar): Promise<void> {
  let p = prontas.get(consultar);
  if (!p) {
    p = consultar(`CREATE TABLE IF NOT EXISTS contabil_entidade_divergencias (cnpj text NOT NULL, motivo text NOT NULL, desde timestamptz NOT NULL DEFAULT now(), visto_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, motivo))`)
      .then(() => undefined).catch((e) => { prontas.delete(consultar); throw e; });
    prontas.set(consultar, p);
  }
  return p;
}
export function limparCacheSincroniaEntidadeContabilParaTeste(): void { prontas = new WeakMap(); }

export interface ResultadoSincroniaContabil { ok: boolean; motivo: string; conferidas: number; aplicadas: string[]; divergentes: number; enviadas: number; retiradas: number; atencao: boolean }
export interface OpcoesSincroniaContabil {
  buscarFiscal: () => Promise<{ ok: boolean; motivo?: string; empresas: any[] }>;
  enviarFiscal: (corpo: { origem: "contabil"; marcas: unknown[]; retirar: string[] }) => Promise<{ ok: boolean; motivo?: string }>;
  /** Só estes CNPJs (botão "Sincronizar agora" de um escritório). Sem isto: todos. */
  cnpjs?: string[];
}

/** Robô de Sincronia de Entidades (Contábil): aplica o que está em branco, guarda as divergências e manda ao Fiscal as marcas feitas aqui. */
export async function sincronizarEntidadesContabil(consultar: Consultar, o: OpcoesSincroniaContabil): Promise<ResultadoSincroniaContabil> {
  await prepararSincroniaEntidadeContabil(consultar);
  const r: ResultadoSincroniaContabil = { ok: false, motivo: "", conferidas: 0, aplicadas: [], divergentes: 0, enviadas: 0, retiradas: 0, atencao: false };
  const f = await o.buscarFiscal();
  if (!f.ok) { r.motivo = f.motivo || "O Murad Fiscal não respondeu."; r.atencao = true; return r; }
  const filtro = o.cnpjs ? new Set(o.cnpjs.map(soAlfanum)) : null;
  const doFiscal = new Map<string, MarcaEntidade[]>();
  for (const e of f.empresas || []) { const c = soAlfanum(e?.cnpj); if (c.length === 14 && (!filtro || filtro.has(c))) doFiscal.set(c, marcasRecebidas(e)); }
  if (!doFiscal.size) { r.ok = true; r.motivo = "Nenhuma empresa do Fiscal para conferir."; return r; }
  const linhas = (await consultar("SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj = ANY($1::text[])", [[...doFiscal.keys()]])).rows;
  const marcasAqui: unknown[] = []; const retirar: string[] = [];
  for (const l of linhas) {
    const cnpj = soAlfanum(l.cnpj); const payload = l.payload || {}; let empresa = payload.empresa && typeof payload.empresa === "object" ? payload.empresa : {};
    const local = marcaLocalDoContabil(empresa);
    r.conferidas += 1;
    const d = decidirSincronia(local, doFiscal.get(cnpj) ?? []);
    if (d.aplicar) {
      const novo = { ...local, ...(d.aplicar.tipo ? { tipo: d.aplicar.tipo } : {}), ...(d.aplicar.certificada !== undefined ? { certificada: d.aplicar.certificada, certificacaoValidade: d.aplicar.certificacaoValidade ?? null } : {}) };
      const novaEmpresa = { ...empresa, regime: REGIME[novo.tipo as "imune" | "isenta"], entidadeCertificada: novo.certificada, entidadeCertificacaoValidade: novo.certificacaoValidade || "",
        entidadeSincronizada: { tipo: novo.tipo, certificada: novo.certificada, certificacaoValidade: novo.certificacaoValidade || null, origem: d.aplicar.origem, em: new Date().toISOString() } };
      // Versão do workspace como trava: se alguém salvou no meio, não grava (a próxima rodada confere de novo).
      const g = await consultar("UPDATE contabil_company_workspaces SET payload = $2::jsonb, version = version + 1, updated_at = now() WHERE cnpj = $1 AND version = $3",
        [l.cnpj, JSON.stringify({ ...payload, empresa: novaEmpresa }), Number(l.version)]);
      if (Number(g.rowCount) > 0) { r.aplicadas.push(cnpj); empresa = novaEmpresa; }
    }
    await consultar("DELETE FROM contabil_entidade_divergencias WHERE cnpj = $1 AND NOT (motivo = ANY($2::text[]))", [cnpj, d.divergencias]);
    for (const m of d.divergencias) await consultar("INSERT INTO contabil_entidade_divergencias(cnpj, motivo) VALUES($1,$2) ON CONFLICT (cnpj, motivo) DO UPDATE SET visto_em = now()", [cnpj, m.slice(0, 500)]);
    if (d.divergencias.length) r.divergentes += 1;
    const atual = marcaLocalDoContabil(empresa);
    if (atual.tipo && marcaFeitaAqui(empresa)) marcasAqui.push({ cnpj, tipo: atual.tipo, certificada: atual.certificada, certificacaoValidade: atual.certificacaoValidade });
    else if (!atual.tipo) retirar.push(cnpj);
  }
  if (marcasAqui.length || retirar.length) {
    const env = await o.enviarFiscal({ origem: "contabil", marcas: marcasAqui, retirar });
    if (!env.ok) { r.motivo = `Marcas conferidas, mas o envio ao Fiscal falhou (${env.motivo || "sem resposta"}); tento de novo na próxima rodada.`; r.atencao = true; }
    else { r.enviadas = marcasAqui.length; r.retiradas = retirar.length; }
  }
  r.ok = true;
  r.atencao ||= r.divergentes > 0;
  if (!r.motivo) r.motivo = `${r.conferidas} empresa(s) conferida(s) com o Fiscal e o DP; ${r.aplicadas.length} marca(s) de entidade recebida(s) onde estava em branco; ${r.divergentes} com marca diferente (aviso, nada sobrescrito); ${r.enviadas} marca(s) feita(s) aqui enviada(s).`;
  return r;
}

/** Divergências guardadas (para a tela Cadastro de Empresa, o conferidor e a Agente), só dos CNPJs pedidos. */
export async function divergenciasEntidadeContabil(consultar: Consultar, cnpjs: string[]): Promise<Array<{ cnpj: string; motivo: string; desde: string }>> {
  const lista = [...new Set(cnpjs.map(soAlfanum).filter((c) => c.length === 14))]; if (!lista.length) return [];
  await prepararSincroniaEntidadeContabil(consultar);
  return (await consultar("SELECT cnpj, motivo, desde FROM contabil_entidade_divergencias WHERE cnpj = ANY($1::text[]) ORDER BY cnpj, motivo", [lista])).rows
    .map((x: any) => ({ cnpj: soAlfanum(x.cnpj), motivo: String(x.motivo), desde: new Date(x.desde).toISOString() }));
}

export interface ResultadoConferidorSincroniaContabil { divergentes: number; antigas: number; semResposta: boolean; resumo: string; atencao: boolean }
/** Conferidor da sincronia: rodou com sucesso nas últimas 3 horas? há marca diferente entre os sistemas (e há quanto tempo)? Só lê. */
export async function conferirSincroniaEntidadesContabil(consultar: Consultar, ultimaSincronia: { em: string | null; ok: boolean }, agora = new Date()): Promise<ResultadoConferidorSincroniaContabil> {
  await prepararSincroniaEntidadeContabil(consultar);
  const linhas = (await consultar("SELECT cnpj, desde FROM contabil_entidade_divergencias")).rows;
  const cnpjs = new Set(linhas.map((x: any) => soAlfanum(x.cnpj)));
  const antigas = new Set(linhas.filter((x: any) => agora.getTime() - new Date(x.desde).getTime() > 3 * 86400_000).map((x: any) => soAlfanum(x.cnpj))).size;
  const semResposta = !ultimaSincronia.ok || !ultimaSincronia.em || agora.getTime() - Date.parse(ultimaSincronia.em) > 3 * 60 * 60_000;
  const atencao = semResposta || cnpjs.size > 0;
  const resumo = `${semResposta ? "A sincronia de entidades com o Fiscal não rodou com sucesso nas últimas 3 horas. " : ""}${cnpjs.size} empresa(s) com marca de entidade diferente entre os sistemas${antigas ? ` (${antigas} há mais de 3 dias)` : ""}. Confira em Cadastro de Empresa (aviso amarelo) e corrija no sistema errado; nada é sobrescrito sozinho.`;
  return { divergentes: cnpjs.size, antigas, semResposta, resumo, atencao };
}

type Buscar = typeof fetch;
export function criarLigacaoFiscalEntidade(env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Pick<OpcoesSincroniaContabil, "buscarFiscal" | "enviarFiscal"> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  return {
    async buscarFiscal() {
      if (!token) return { ok: false, motivo: "Token de integração (MURADE_INTEGRATION_TOKEN) não configurado neste sistema.", empresas: [] };
      try {
        const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/empresas`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) return { ok: false, motivo: `O Murad Fiscal respondeu com erro (${r.status}).`, empresas: [] };
        const corpo: any = await r.json().catch(() => null);
        return { ok: true, empresas: Array.isArray(corpo?.empresas) ? corpo.empresas : [] };
      } catch { return { ok: false, motivo: "O Murad Fiscal não respondeu a tempo.", empresas: [] }; }
    },
    async enviarFiscal(corpo) {
      if (!token) return { ok: false, motivo: "Token de integração não configurado." };
      try {
        const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/entidade`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(30000) });
        return r.ok ? { ok: true } : { ok: false, motivo: `HTTP ${r.status}` };
      } catch { return { ok: false, motivo: "O Murad Fiscal não respondeu a tempo." }; }
    },
  };
}
