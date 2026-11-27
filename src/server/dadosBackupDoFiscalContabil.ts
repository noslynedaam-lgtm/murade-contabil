// Contábil ← Fiscal: aproveita o que veio do BACKUP DO SISTEMA ANTERIOR e o Murad Fiscal guardou na migração (pedido do dono, 27/11/2026).
// O Fiscal expõe por CNPJ (GET /api/integracao/fiscal/dados-backup, servidor a servidor, token de integração, sem dado pessoal):
// histórico do regime tributário, receita bruta mensal e o cadastro da EMPRESA (CNAE, inscrições, endereço, abertura, natureza jurídica).
// Aqui o Contábil:
//  - PREENCHE SÓ O QUE ESTIVER VAZIO no cadastro (workspace.empresa) da empresa que já existe — nunca cria empresa, nunca troca o que
//    alguém digitou —, marcando a origem em `camposDoBackupFiscal` ("veio do backup do sistema anterior pelo Murad Fiscal — confira");
//  - guarda o histórico do regime e a receita mensal (contabil_dados_backup_fiscal) para os conferidores que já existem: o Robô
//    Conferidor das Origens só cobra DAS do Simples nos meses em que a empresa estava no Simples pelo histórico.
// Não mexe em lançamento, plano de contas, fechamento nem guia.
import { urlDoSistema } from "./agentesEntreSistemas";

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Buscar = typeof fetch;

export const ORIGEM_BACKUP_FISCAL = "veio do backup do sistema anterior pelo Murad Fiscal — confira";
const soAlfanum = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ehData = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
const ehComp = (v: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? ""));
const limpo = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export type Regime = "Simples Nacional" | "Lucro Presumido" | "Lucro Real";
export interface PeriodoRegime { regime: Regime; inicio: string; fim: string | null; origem: string }
export interface MesReceita { competencia: string; centavos: number; incompleto: boolean; fonte: string }
export interface DadosBackupFiscal { cnpj: string; temBackup: boolean; regimeHistorico: PeriodoRegime[]; receitaMensal: MesReceita[]; cadastro: Record<string, string> }
export type ResultadoBackupFiscal = { ok: true; dados: DadosBackupFiscal } | { ok: false; motivo: string; naoTem?: boolean };

const REGIMES: ReadonlySet<string> = new Set(["Simples Nacional", "Lucro Presumido", "Lucro Real"]);
const CAMPOS = ["cnae", "inscricaoEstadual", "inscricaoMunicipal", "uf", "cidade", "endereco", "bairro", "cep", "complemento", "dataAbertura", "naturezaJuridica"] as const;

export function limparDadosBackupFiscal(corpo: any, cnpj: string): ResultadoBackupFiscal {
  if (!corpo || corpo.sucesso !== true || soAlfanum(corpo.cnpj) !== cnpj || typeof corpo.temBackup !== "boolean") return { ok: false, motivo: "O Murad Fiscal respondeu fora do combinado." };
  const regimeHistorico: PeriodoRegime[] = [];
  for (const p of Array.isArray(corpo.regimeHistorico) ? corpo.regimeHistorico : []) {
    if (!REGIMES.has(p?.regime) || !ehData(p?.inicio) || !(p?.fim === null || ehData(p?.fim))) return { ok: false, motivo: "O Murad Fiscal enviou um período de regime inválido." };
    regimeHistorico.push({ regime: p.regime, inicio: p.inicio, fim: p.fim, origem: limpo(p.origem, 40) });
  }
  const receitaMensal: MesReceita[] = [];
  for (const m of Array.isArray(corpo.receitaMensal) ? corpo.receitaMensal : []) {
    if (!ehComp(m?.competencia) || !(typeof m?.centavos === "number" && Number.isSafeInteger(m.centavos) && m.centavos >= 0)) return { ok: false, motivo: "O Murad Fiscal enviou uma receita inválida." };
    receitaMensal.push({ competencia: m.competencia, centavos: m.centavos, incompleto: m.incompleto === true, fonte: limpo(m.fonte, 40) });
  }
  const cadastro: Record<string, string> = {};
  const c = corpo.cadastro && typeof corpo.cadastro === "object" ? corpo.cadastro : {};
  for (const k of CAMPOS) { const v = limpo(c[k]); if (v) cadastro[k] = v; }
  return { ok: true, dados: { cnpj, temBackup: corpo.temBackup, regimeHistorico, receitaMensal, cadastro } };
}

export async function buscarDadosBackupDoFiscal(cnpj: string, env: Record<string, string | undefined> = process.env, buscar: Buscar = fetch): Promise<ResultadoBackupFiscal> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "Token de integração (MURADE_INTEGRATION_TOKEN) não configurado neste sistema." };
  try {
    const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/dados-backup?cnpj=${encodeURIComponent(cnpj)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (r.status === 404) return { ok: false, naoTem: true, motivo: "O Murad Fiscal ainda não tem esta consulta (versão anterior)." };
    if (r.status === 401) return { ok: false, motivo: "O Murad Fiscal recusou a credencial de integração (401): confira se MURADE_INTEGRATION_TOKEN é o mesmo nos dois sistemas." };
    if (!r.ok) return { ok: false, motivo: `O Murad Fiscal respondeu com erro (${r.status}).` };
    return limparDadosBackupFiscal(await r.json().catch(() => null), cnpj);
  } catch { return { ok: false, motivo: "O Murad Fiscal não respondeu a tempo." }; }
}

export function regimeNoDia(historico: PeriodoRegime[], dia: string): Regime | null {
  const p = historico.filter((h) => h.inicio <= dia && (!h.fim || h.fim >= dia)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  return p ? p.regime : null;
}

const fimDoMes = (c: string) => { const [a, m] = c.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
/**
 * Pura. A empresa estava no Simples Nacional na competência? Pelo histórico, quando ele cobre o mês; depois do último período que o
 * histórico conhece, vale o regime do cadastro de hoje; antes do primeiro período ou num intervalo entre períodos, NÃO estava.
 * Sem histórico, vale o cadastro de hoje (como antes).
 */
export function simplesNaCompetencia(historico: PeriodoRegime[] | null | undefined, competencia: string, simplesHoje: boolean): boolean {
  if (!historico || !historico.length) return simplesHoje;
  const ini = `${competencia}-01`; const fim = fimDoMes(competencia);
  const cobre = historico.filter((h) => h.inicio <= fim && (!h.fim || h.fim >= ini)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  if (cobre) return cobre.regime === "Simples Nacional";
  const ultimoFim = historico.reduce((max, h) => { const f = h.fim ?? "9999-12-31"; return f > max ? f : max; }, "0000-00-00");
  return ini > ultimoFim ? simplesHoje : false;
}

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "" || /^n[ãa]o informado$/i.test(String(v).trim());
const dataBR = (iso: string) => (ehData(iso) ? iso.split("-").reverse().join("/") : "");
export function separarNumero(endereco: string): { logradouro: string; numero: string } | null {
  const m = /^(.*\S)\s*,\s*(\d{1,6}[A-Za-z]?|S\/?N)$/i.exec(endereco.trim());
  return m ? { logradouro: m[1], numero: m[2] } : null;
}

/** Pura. O que entra no cadastro do Contábil: SÓ campo vazio; endereço inteiro só quando não há endereço nenhum; regime só vazio e coberto. */
export function camposParaPreencherContabil(empresa: Record<string, any>, d: DadosBackupFiscal, hoje: string): Record<string, string> {
  const out: Record<string, string> = {}; const c = d.cadastro;
  for (const k of ["cnae", "inscricaoEstadual", "inscricaoMunicipal", "naturezaJuridica"] as const) if (c[k] && vazio(empresa[k])) out[k] = c[k];
  if (c.cidade && vazio(empresa.municipio)) out.municipio = c.cidade;
  if (c.uf && vazio(empresa.uf)) out.uf = c.uf.toUpperCase().slice(0, 2);
  const mun = out.municipio ?? empresa.municipio; const uf = out.uf ?? empresa.uf;
  if (vazio(empresa.cidadeUf) && !vazio(mun) && !vazio(uf)) out.cidadeUf = `${mun} / ${uf}`;
  if (c.dataAbertura && vazio(empresa.dataAbertura) && dataBR(c.dataAbertura)) out.dataAbertura = dataBR(c.dataAbertura);
  const semEndereco = ["endereco", "logradouro", "numero", "bairro", "cep", "complemento"].every((k) => vazio(empresa[k]));
  if (semEndereco && c.endereco) {
    out.endereco = c.endereco;
    const p = separarNumero(c.endereco);
    if (p) { out.logradouro = p.logradouro; out.numero = p.numero; } else out.logradouro = c.endereco;
    if (c.complemento) out.complemento = c.complemento;
    if (c.bairro) out.bairro = c.bairro;
    if (c.cep && /^\d{8}$/.test(c.cep)) out.cep = c.cep;
  }
  const regime = regimeNoDia(d.regimeHistorico, hoje);
  if (regime && vazio(empresa.regime)) out.regime = regime;
  return out;
}

let preparada = new WeakMap<Consultar, Promise<unknown>>();
export function prepararDadosBackupFiscal(consultar: Consultar): Promise<unknown> {
  let p = preparada.get(consultar);
  if (!p) {
    p = consultar(`CREATE TABLE IF NOT EXISTS contabil_dados_backup_fiscal (cnpj text PRIMARY KEY, regime_historico jsonb NOT NULL, receita_mensal jsonb NOT NULL, recebido_em timestamptz NOT NULL DEFAULT now())`)
      .catch((e) => { preparada.delete(consultar); throw e; });
    preparada.set(consultar, p);
  }
  return p;
}
export function esquecerPreparoDadosBackupFiscal(): void { preparada = new WeakMap(); }

/** Histórico do regime guardado para os conferidores (vazio quando não há). */
export async function historicoRegimeGuardado(consultar: Consultar, cnpj: string): Promise<PeriodoRegime[]> {
  try {
    const ex = (await consultar("SELECT to_regclass('contabil_dados_backup_fiscal') AS t", [])).rows[0]?.t;
    if (!ex) return [];
    const r = (await consultar("SELECT regime_historico FROM contabil_dados_backup_fiscal WHERE cnpj=$1", [soAlfanum(cnpj)])).rows[0]?.regime_historico;
    const lista = typeof r === "string" ? JSON.parse(r) : r;
    return Array.isArray(lista) ? lista.filter((p: any) => REGIMES.has(p?.regime) && ehData(p?.inicio)) : [];
  } catch { return []; }
}

export interface ResultadoAproveitamentoContabil {
  ok: boolean; empresas: number; comBackup: number; empresasCompletadas: number; camposPreenchidos: number; comRegime: number; comReceita: number; adiadas: number; semResposta: number; fiscalAntigo: boolean; atencao: boolean; resumo: string;
}

/**
 * Robô de Aproveitamento do Backup pelo Fiscal (Contábil). Só empresa com acesso de escritório (contabil_auth_company_access);
 * com `cnpjs`, só essas ("Completar agora" de um escritório). Versão do workspace como trava. Log só com contagens.
 */
export async function aproveitarBackupDoFiscalContabil(consultar: Consultar, o: { hoje: string; cnpjs?: string[]; buscar?: (cnpj: string) => Promise<ResultadoBackupFiscal> }): Promise<ResultadoAproveitamentoContabil> {
  await prepararDadosBackupFiscal(consultar);
  const buscar = o.buscar ?? ((c: string) => buscarDadosBackupDoFiscal(c));
  const r: ResultadoAproveitamentoContabil = { ok: true, empresas: 0, comBackup: 0, empresasCompletadas: 0, camposPreenchidos: 0, comRegime: 0, comReceita: 0, adiadas: 0, semResposta: 0, fiscalAntigo: false, atencao: false, resumo: "" };
  const lista = o.cnpjs
    ? [...new Set(o.cnpjs.map(soAlfanum))]
    : (await consultar("SELECT DISTINCT cnpj FROM contabil_auth_company_access", [])).rows.map((x: any) => soAlfanum(x.cnpj));
  let seguidas = 0;
  for (const cnpj of lista) {
    const w = (await consultar("SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj=$1", [cnpj])).rows[0];
    if (!w) continue;
    r.empresas += 1;
    if (r.fiscalAntigo || seguidas >= 3) { r.semResposta += 1; continue; }
    const f = await buscar(cnpj);
    if (f.ok === false) { if (f.naoTem) r.fiscalAntigo = true; r.semResposta += 1; seguidas += 1; continue; }
    seguidas = 0;
    if (!f.dados.temBackup) continue;
    r.comBackup += 1;
    if (f.dados.regimeHistorico.length) r.comRegime += 1;
    if (f.dados.receitaMensal.length) r.comReceita += 1;
    await consultar(`INSERT INTO contabil_dados_backup_fiscal (cnpj, regime_historico, receita_mensal, recebido_em) VALUES ($1, CAST($2 AS jsonb), CAST($3 AS jsonb), now())
      ON CONFLICT (cnpj) DO UPDATE SET regime_historico=EXCLUDED.regime_historico, receita_mensal=EXCLUDED.receita_mensal, recebido_em=now()`, [cnpj, JSON.stringify(f.dados.regimeHistorico), JSON.stringify(f.dados.receitaMensal)]);
    const payload = (w.payload && typeof w.payload === "object" ? w.payload : {}) as Record<string, any>;
    const empresa = (payload.empresa && typeof payload.empresa === "object" ? payload.empresa : {}) as Record<string, any>;
    const novos = camposParaPreencherContabil(empresa, f.dados, o.hoje);
    const chaves = Object.keys(novos);
    if (!chaves.length) continue;
    const em = new Date().toISOString();
    const origens = { ...(empresa.camposDoBackupFiscal && typeof empresa.camposDoBackupFiscal === "object" ? empresa.camposDoBackupFiscal : {}) } as Record<string, unknown>;
    for (const k of chaves) origens[k] = { origem: ORIGEM_BACKUP_FISCAL, em };
    const g = await consultar("UPDATE contabil_company_workspaces SET payload = CAST($2 AS jsonb), version = version + 1, updated_at = now() WHERE cnpj = $1 AND version = $3",
      [w.cnpj, JSON.stringify({ ...payload, empresa: { ...empresa, ...novos, camposDoBackupFiscal: origens } }), Number(w.version)]);
    if (Number(g.rowCount) > 0) { r.empresasCompletadas += 1; r.camposPreenchidos += chaves.length; } else r.adiadas += 1;
  }
  r.ok = !(r.semResposta > 0 && r.comBackup === 0 && r.empresas > 0 && !r.fiscalAntigo);
  r.atencao = !r.ok || r.empresasCompletadas > 0;
  const partes = [`${r.empresas} empresa(s) conferida(s); ${r.comBackup} com backup do sistema anterior no Murad Fiscal (${r.comRegime} com histórico de regime, ${r.comReceita} com receita mensal, guardados para os conferidores)`];
  partes.push(r.empresasCompletadas ? `${r.empresasCompletadas} completada(s) (${r.camposPreenchidos} campo(s) que estavam vazios; origem "${ORIGEM_BACKUP_FISCAL}")` : "nada vazio para completar");
  if (r.adiadas) partes.push(`${r.adiadas} adiada(s) porque alguém salvou a empresa agora (confere de novo na próxima rodada)`);
  if (r.fiscalAntigo) partes.push("o Murad Fiscal ainda não tem a consulta dos dados do backup (publique o Fiscal)");
  else if (r.semResposta) partes.push(`${r.semResposta} sem resposta do Murad Fiscal nesta rodada`);
  r.resumo = `${partes.join(". ")}. Só preenche o que está vazio; não mexe em lançamento, plano de contas, fechamento nem guia.`;
  return r;
}
