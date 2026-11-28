// Contábil na sincronia do cadastro da empresa (ver sincroniaCadastroEmpresas.ts; o Fiscal é o ponto de encontro).
//  - Recebe do Fiscal (POST /api/integracao/empresas/receber): cria se faltar (importarCnpjsCompartilhados, a mesma regra do Robô de
//    Empresas do Fiscal, que já alinha o regime pelo Fiscal) e completa só os campos VAZIOS; diferença vira aviso "conferir".
//  - Manda ao Fiscal quando a pessoa salva o cadastro no Contábil (fila contabil_sincronia_empresas_fila; Robô de Reenvio de 10 em
//    10 min e Robô Conferidor Contábil × Fiscal de 2 em 2 h). Do Fiscal, o cadastro segue para o DP.
import { urlDoSistema } from "./agentesEntreSistemas";
import {
  type CadastroCompartilhado, type Consultar, type ItemFila, type RespostaEnvio, assinaturaCadastro, assinaturasEntregues, completarSoVazios, enfileirarSincronia,
  gravarDivergencias, jaResolvido, limparCadastroCompartilhado, rodarFilaSincronia,
} from "./sincroniaCadastroEmpresas";
import type { FichaEmpresa } from "./cadastroPorDocumento";

export const PREFIXO_CONTABIL = "contabil";

/** Cadastro do Contábil (workspace.empresa ou contabil_empresas_compartilhadas.dados) → nomes comuns. */
export function contabilParaComum(e: any): CadastroCompartilhado {
  const municipio = String(e?.municipio || "").trim() || String(e?.cidadeUf || "").split("/")[0]?.trim();
  const uf = String(e?.uf || "").trim() || String(e?.cidadeUf || "").split("/")[1]?.trim();
  return limparCadastroCompartilhado({
    razaoSocial: e?.razaoSocial, nomeFantasia: e?.nomeFantasia, inscricaoEstadual: e?.inscricaoEstadual, inscricaoMunicipal: e?.inscricaoMunicipal, cnae: e?.cnae,
    regimeTributario: e?.regime, uf, cidade: municipio, endereco: e?.endereco, bairro: e?.bairro, cep: e?.cep, telefone: e?.telefone, email: e?.email,
  });
}
/** Nomes comuns → campos do Contábil (cidade = municipio; cidadeUf montado quando estiver vazio). */
export function comumParaContabil(c: CadastroCompartilhado, atual: any = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) if (v) out[k === "regimeTributario" ? "regime" : k === "cidade" ? "municipio" : k] = v;
  const mun = out.municipio || atual?.municipio; const uf = out.uf || atual?.uf;
  if ((out.municipio || out.uf) && !String(atual?.cidadeUf || "").trim() && mun && uf) out.cidadeUf = `${mun} / ${uf}`;
  return out;
}
/** Ficha conferida (cadastro por foto/arquivo) → campos do formulário de Cadastro de Empresa do Contábil. */
export function fichaParaContabil(f: FichaEmpresa): Record<string, any> {
  const v = (k: keyof FichaEmpresa["campos"]) => f.campos[k]?.valor || "";
  const rua = [v("logradouro"), v("numero")].filter(Boolean).join(", ");
  const endereco = [[rua, v("complemento")].filter(Boolean).join(" - "), v("bairro")].filter(Boolean).join(", ");
  const out: Record<string, any> = {
    cnpj: f.cnpj, razaoSocial: v("razaoSocial"), nomeFantasia: v("nomeFantasia") || v("razaoSocial"), regime: ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI"].includes(v("regime")) ? v("regime") : "",
    inscricaoEstadual: v("inscricaoEstadual"), inscricaoMunicipal: v("inscricaoMunicipal"), naturezaJuridica: v("naturezaJuridica"),
    cnae: v("cnae") ? `${v("cnae")}${v("cnaeDescricao") ? ` - ${v("cnaeDescricao")}` : ""}` : "", endereco, cep: v("cep"), municipio: v("cidade"), uf: v("uf"),
    cidadeUf: v("cidade") && v("uf") ? `${v("cidade")} / ${v("uf")}` : "", telefone: v("telefone"), email: v("email"), responsavelNome: v("titular"),
    situacaoCadastral: v("situacaoCadastral"), dataAbertura: v("dataAbertura") ? v("dataAbertura").split("-").reverse().join("/") : "",
    qsa: f.socios.map((s) => ({ nome: s.nome, qualificacao: s.qualificacao || "Sócio", faixaEtaria: "" })),
  };
  for (const k of Object.keys(out)) if (out[k] === "" || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}

export interface DepsReceberContabil {
  consultar: Consultar;
  /** Dono do escritório por login (global_admin; login de equipe vira o do dono). */
  donoPorLogin: (login: string) => Promise<string | null>;
  importar: (itens: Array<{ cnpj: string; escritorio: string; donoSistema: boolean; dados?: Record<string, unknown> }>) => Promise<{ criadas: string[]; jaExistiam: number; semEscritorio: string[] }>;
  /** Altera o campo "empresa" do workspace (se a empresa já tem workspace); devolve a empresa atual. */
  alterarEmpresaDoWorkspace: (cnpj: string, alterar: (empresa: Record<string, any>) => Record<string, any> | null) => Promise<Record<string, any> | null>;
}
export async function receberCadastroNoContabil(d: DepsReceberContabil, e: { cnpj: string; escritorio: string; donoSistema: boolean; origem: string; dados: unknown }) {
  const recebido = limparCadastroCompartilhado(e.dados);
  const donoId = await d.donoPorLogin(e.escritorio);
  const acessos = (await d.consultar("SELECT a.user_id::text AS uid, u.office_owner::text AS dono FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=$1", [e.cnpj])).rows;
  if (acessos.length && donoId && !acessos.some((a: any) => a.uid === donoId || a.dono === donoId)) return { sucesso: true as const, vinculada: false, criada: false, preenchidos: [] as string[], divergencias: 0, motivo: "Este CNPJ está no Contábil em outro escritório: nada foi mexido." };
  // Cria se faltar e alinha regime/razão/fantasia/município/UF pela regra que já existia (Fiscal é a fonte do regime).
  const r = await d.importar([{ cnpj: e.cnpj, escritorio: e.escritorio, donoSistema: e.donoSistema, dados: { cnpj: e.cnpj, razaoSocial: recebido.razaoSocial || "", nomeFantasia: recebido.nomeFantasia || "", regime: recebido.regimeTributario || "", municipio: recebido.cidade || "", uf: recebido.uf || "" } }]);
  const criada = r.criadas.includes(e.cnpj);
  if (!acessos.length && !criada) return { sucesso: true as const, vinculada: false, criada: false, preenchidos: [] as string[], divergencias: 0, motivo: "O escritório ainda não tem no Contábil um administrador com o mesmo login (ou chegou ao limite do teste grátis)." };
  if (!donoId && !e.donoSistema && !criada) return { sucesso: true as const, vinculada: false, criada: false, preenchidos: [] as string[], divergencias: 0, motivo: "O escritório ainda não tem no Contábil um administrador com o mesmo login." };
  let preenchidos: string[] = []; let divergencias = 0;
  const semRegime: CadastroCompartilhado = { ...recebido }; delete semRegime.regimeTributario; // regime: regra do Fiscal como fonte (já aplicada acima)
  const aplicar = (empresa: Record<string, any>) => {
    const c = completarSoVazios(contabilParaComum(empresa), semRegime);
    preenchidos = Object.keys(c.preencher); divergencias = c.divergencias.length;
    void gravarDivergencias(d.consultar, PREFIXO_CONTABIL, e.cnpj, "fiscal", c.divergencias, c.iguais).catch(() => undefined);
    return preenchidos.length ? { ...empresa, ...comumParaContabil(c.preencher, empresa) } : null;
  };
  await d.alterarEmpresaDoWorkspace(e.cnpj, aplicar).catch(() => null);
  const comp = (await d.consultar("SELECT dados FROM contabil_empresas_compartilhadas WHERE cnpj=$1", [e.cnpj]).catch(() => ({ rows: [] as any[] }))).rows[0]?.dados;
  if (comp) {
    const c = completarSoVazios(contabilParaComum(comp), semRegime);
    if (Object.keys(c.preencher).length) await d.consultar("UPDATE contabil_empresas_compartilhadas SET dados = dados || $2::jsonb, updated_at=now() WHERE cnpj=$1", [e.cnpj, JSON.stringify(comumParaContabil(c.preencher, comp))]);
    if (!preenchidos.length) preenchidos = Object.keys(c.preencher);
  }
  return { sucesso: true as const, vinculada: true, criada, preenchidos, divergencias };
}

/** Envia ao Fiscal (POST /api/integracao/fiscal/empresas com origem "contabil": lá só completa o vazio e repassa ao DP). */
export function criarEnvioContabilParaFiscal(lerCadastro: (cnpj: string) => Promise<Record<string, any> | null>, env: Record<string, string | undefined> = process.env, buscar: typeof fetch = fetch) {
  return async (item: ItemFila): Promise<RespostaEnvio> => {
    const token = env.MURADE_INTEGRATION_TOKEN?.trim();
    if (!token) return { ok: false, motivo: "MURADE_INTEGRATION_TOKEN não configurado no Contábil" };
    const e = await lerCadastro(item.cnpj);
    if (!e) return { ok: false, definitivo: true, motivo: "a empresa não existe mais no Contábil" };
    const dados = contabilParaComum(e);
    if (!dados.razaoSocial) return { ok: false, definitivo: true, motivo: "sem razão social no Contábil" };
    try {
      const r = await buscar(`${urlDoSistema("fiscal", env)}/api/integracao/fiscal/empresas`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ cnpj: item.cnpj, escritorio: item.escritorio, dados, cadastroManual: false, origem: "contabil" }), signal: AbortSignal.timeout(20_000),
      });
      const corpo: any = await r.json().catch(() => null);
      if (!r.ok) return { ok: false, definitivo: r.status === 400 || r.status === 401, motivo: `o Fiscal respondeu ${r.status}${corpo?.motivo ? `: ${corpo.motivo}` : ""}` };
      if (corpo?.sucesso !== true) return { ok: false, motivo: corpo?.motivo || "o Fiscal não confirmou" };
      if (corpo.vinculada === false) return { ok: false, definitivo: true, motivo: corpo.motivo || "o Fiscal não aceitou (outro escritório ou empresa excluída)" };
      return { ok: true, motivo: corpo.criada ? "criada no Fiscal" : "completada no Fiscal" };
    } catch (err: any) { return { ok: false, motivo: err?.name === "TimeoutError" ? "o Fiscal não respondeu a tempo" : `sem resposta do Fiscal: ${err?.message || err}` }; }
  };
}

export interface DepsFilaContabil { consultar: Consultar; lerCadastro: (cnpj: string) => Promise<Record<string, any> | null>; enviar: (item: ItemFila) => Promise<RespostaEnvio> }
export async function rodarEnvioCadastroContabil(d: DepsFilaContabil) {
  return rodarFilaSincronia(d.consultar, PREFIXO_CONTABIL, async (cnpj) => { const e = await d.lerCadastro(cnpj); return e ? assinaturaCadastro(contabilParaComum(e)) : null; }, d.enviar);
}
export async function enfileirarCadastroContabil(consultar: Consultar, cnpj: string, escritorio: string, origem = "contabil"): Promise<void> {
  await enfileirarSincronia(consultar, PREFIXO_CONTABIL, { cnpj, destino: "fiscal", escritorio, origem });
}
export function cadastroMudou(antes: unknown, depois: unknown): boolean { return assinaturaCadastro(contabilParaComum(antes)) !== assinaturaCadastro(contabilParaComum(depois)); }

/** Conferidor Contábil × Fiscal: o Fiscal recebeu o cadastro ATUAL de cada empresa do Contábil? O que não recebeu vai para a fila e é enviado. */
export async function conferirCadastroContabilFiscal(d: DepsFilaContabil & { empresasComEscritorio: () => Promise<Array<{ cnpj: string; escritorio: string }>> }) {
  const entregues = await assinaturasEntregues(d.consultar, PREFIXO_CONTABIL);
  let conferidas = 0; let enfileiradas = 0;
  for (const e of await d.empresasComEscritorio()) {
    const cad = await d.lerCadastro(e.cnpj).catch(() => null);
    if (!cad || !String(cad.razaoSocial || "").trim()) continue;
    conferidas++;
    if (jaResolvido(entregues.get(`${e.cnpj}|fiscal`), assinaturaCadastro(contabilParaComum(cad)))) continue;
    await enfileirarCadastroContabil(d.consultar, e.cnpj, e.escritorio, "conferidor"); enfileiradas++;
  }
  const envio = enfileiradas ? await rodarEnvioCadastroContabil(d) : null;
  const resumo = `${conferidas} empresa(s) do Contábil conferida(s) com o Fiscal; ${enfileiradas ? `${enfileiradas} cadastro(s) que o Fiscal não tinha (ou estava antigo) foram enviados: ${envio?.resumo}` : "todas já estavam com o cadastro atual no Fiscal"}.`;
  return { conferidas, enfileiradas, alerta: Boolean(envio?.falharam.length), resumo };
}

/** Só os campos vazios do cadastro atual recebem o valor novo (quadro de sócios só quando não há nenhum). */
export function soVaziosContabil(atual: Record<string, any> | null | undefined, novos: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(novos)) {
    const a = atual?.[k];
    const vazioAqui = a === undefined || a === null || (typeof a === "string" && (!a.trim() || /^(n[aã]o informad[oa])$/i.test(a.trim()))) || (Array.isArray(a) && !a.length);
    if (vazioAqui && v !== "" && v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) out[k] = v;
  }
  return out;
}
