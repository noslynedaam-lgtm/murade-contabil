// Sincronia do cadastro da empresa entre DP, Fiscal e Contábil do MESMO escritório (pedido do dono em 27/11/2026).
// Igual nos três sistemas. O Fiscal é o ponto de encontro (Fiscal → DP → Contábil): empresa cadastrada ou alterada no DP vai ao
// Fiscal e de lá ao Contábil; no Fiscal vai ao DP e ao Contábil; no Contábil vai ao Fiscal e de lá ao DP.
// Regras (as mesmas nos três):
//  - Chave = CNPJ + escritório. Nunca cria a empresa de novo se já existe (não duplica) e nunca toma empresa de outro escritório.
//  - Só PREENCHE campo vazio no destino. O que lá foi digitado nunca é sobrescrito; se for diferente, vira aviso "conferir"
//    (tabela <prefixo>_cadastro_divergencias), que some sozinho quando os dois ficarem iguais.
//  - Nunca bloqueia CNPJ; nunca leva certificado, senha nem dado de funcionário/nota.
// Sem importações: é o mesmo arquivo nos três sistemas.

/** Campos do cadastro que andam entre os sistemas (nomes comuns; cada sistema traduz para os seus). */
export const CAMPOS_COMPARTILHADOS = ['razaoSocial', 'nomeFantasia', 'inscricaoEstadual', 'inscricaoMunicipal', 'cnae', 'regimeTributario', 'uf', 'cidade', 'endereco', 'bairro', 'cep', 'telefone', 'email'] as const;
export type CampoCompartilhado = typeof CAMPOS_COMPARTILHADOS[number];
export type CadastroCompartilhado = Partial<Record<CampoCompartilhado, string>>;

export const ROTULO_COMPARTILHADO: Record<CampoCompartilhado, string> = {
  razaoSocial: 'Razão social', nomeFantasia: 'Nome fantasia', inscricaoEstadual: 'Inscrição estadual', inscricaoMunicipal: 'Inscrição municipal', cnae: 'CNAE',
  regimeTributario: 'Regime tributário', uf: 'UF', cidade: 'Município', endereco: 'Endereço', bairro: 'Bairro', cep: 'CEP', telefone: 'Telefone', email: 'E-mail',
};
/** Escrita livre demais para comparar (rua com/sem número, abreviações): só preenche quando vazio, não vira aviso. */
const SO_PREENCHER = new Set<CampoCompartilhado>(['endereco', 'bairro', 'nomeFantasia']);
const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'];

const txt = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** Valor "vazio" de verdade (inclui os marcadores que os sistemas põem quando não sabem). */
export function vazio(campo: CampoCompartilhado, v: unknown): boolean {
  const t = txt(v);
  if (!t) return true;
  if (campo === 'regimeTributario') return !REGIMES.includes(t);
  return /^(n[aã]o informad[oa]|validação pendente|-+)$/i.test(t);
}
const semAcento = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** Mesma informação escrita de jeito diferente (pontuação, acento, "código — descrição" do CNAE) não é divergência. */
export function mesmoValor(campo: CampoCompartilhado, a: unknown, b: unknown): boolean {
  if (campo === 'cnae') return digitos(a).slice(0, 7) === digitos(b).slice(0, 7);
  if (campo === 'cep' || campo === 'telefone') return digitos(a) === digitos(b);
  if (campo === 'inscricaoEstadual' || campo === 'inscricaoMunicipal') return semAcento(a).replace(/^0+/, '') === semAcento(b).replace(/^0+/, '');
  if (campo === 'email') return txt(a).toLowerCase() === txt(b).toLowerCase();
  return semAcento(a) === semAcento(b);
}

/** Limpa o que chegou de outro sistema: só os campos conhecidos, texto curto, regime só dos válidos. */
export function limparCadastroCompartilhado(bruto: unknown): CadastroCompartilhado {
  const b: any = bruto && typeof bruto === 'object' ? bruto : {};
  const out: CadastroCompartilhado = {};
  for (const c of CAMPOS_COMPARTILHADOS) {
    const v = txt(b[c] ?? (c === 'regimeTributario' ? b.regime : undefined), c === 'razaoSocial' || c === 'nomeFantasia' || c === 'endereco' ? 200 : 120);
    if (!vazio(c, v)) out[c] = c === 'uf' ? v.toUpperCase().slice(0, 2) : v;
  }
  return out;
}

export interface Divergencia { campo: CampoCompartilhado; aqui: string; la: string }
/** Regra pura: o que preencher (só onde está vazio aqui) e o que está diferente (vira aviso "conferir"). Campos iguais também voltam (para limpar aviso antigo). */
export function completarSoVazios(atual: CadastroCompartilhado, recebido: CadastroCompartilhado): { preencher: CadastroCompartilhado; divergencias: Divergencia[]; iguais: CampoCompartilhado[] } {
  const preencher: CadastroCompartilhado = {}; const divergencias: Divergencia[] = []; const iguais: CampoCompartilhado[] = [];
  for (const c of CAMPOS_COMPARTILHADOS) {
    const novo = recebido[c];
    if (vazio(c, novo)) continue;
    const aqui = atual[c];
    if (vazio(c, aqui)) { preencher[c] = String(novo); iguais.push(c); continue; }
    if (mesmoValor(c, aqui, novo)) { iguais.push(c); continue; }
    if (!SO_PREENCHER.has(c)) divergencias.push({ campo: c, aqui: txt(aqui), la: txt(novo) });
  }
  return { preencher, divergencias, iguais };
}

/** Assinatura do cadastro compartilhado (o conferidor só reenvia quando muda). */
export function assinaturaCadastro(c: CadastroCompartilhado): string {
  return CAMPOS_COMPARTILHADOS.map((k) => `${k}=${semAcento(c[k] ?? '')}`).join('|');
}

// ------------------------------------------------------------------------------------------------
// Avisos "conferir" (divergências) — uma tabela por sistema: <prefixo>_cadastro_divergencias
// ------------------------------------------------------------------------------------------------
export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
const tabelasProntas = new Map<string, Promise<unknown>>();
function nomeTabela(prefixo: string): string {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(prefixo)) throw new Error('Prefixo de tabela inválido.');
  return `${prefixo}_cadastro_divergencias`;
}
export function prepararDivergencias(consultar: Consultar, prefixo: string): Promise<unknown> {
  const t = nomeTabela(prefixo);
  let p = tabelasProntas.get(t);
  if (!p) {
    p = consultar(`CREATE TABLE IF NOT EXISTS ${t} (cnpj text NOT NULL, campo text NOT NULL, aqui text NOT NULL DEFAULT '', la text NOT NULL DEFAULT '',
      origem text NOT NULL DEFAULT '', criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, campo))`)
      .catch((e) => { tabelasProntas.delete(t); throw e; });
    tabelasProntas.set(t, p);
  }
  return p;
}
/** Grava os avisos novos e apaga os dos campos que agora estão iguais. */
export async function gravarDivergencias(consultar: Consultar, prefixo: string, cnpj: string, origem: string, divergencias: Divergencia[], iguais: CampoCompartilhado[]): Promise<void> {
  if (!divergencias.length && !iguais.length) return;
  await prepararDivergencias(consultar, prefixo);
  const t = nomeTabela(prefixo);
  for (const d of divergencias) {
    await consultar(`INSERT INTO ${t}(cnpj,campo,aqui,la,origem) VALUES($1,$2,$3,$4,$5) ON CONFLICT (cnpj,campo) DO UPDATE SET aqui=EXCLUDED.aqui, la=EXCLUDED.la, origem=EXCLUDED.origem, atualizado_em=now()`,
      [cnpj, d.campo, d.aqui.slice(0, 200), d.la.slice(0, 200), origem.slice(0, 20)]);
  }
  if (iguais.length) await consultar(`DELETE FROM ${t} WHERE cnpj=$1 AND campo = ANY($2::text[])`, [cnpj, iguais]);
}
export interface AvisoDivergencia { cnpj: string; campo: CampoCompartilhado; rotulo: string; aqui: string; la: string; origem: string; desde: string; texto: string }
const NOME_SISTEMA: Record<string, string> = { dp: 'DP', fiscal: 'Fiscal', contabil: 'Contábil' };
export function textoDivergencia(campo: CampoCompartilhado, aqui: string, la: string, origem: string): string {
  return `Conferir ${ROTULO_COMPARTILHADO[campo] || campo}: aqui está "${aqui}" e no ${NOME_SISTEMA[origem] || origem || 'outro sistema'} está "${la}". Nada foi trocado; corrija no sistema que estiver errado.`;
}
export async function listarDivergencias(consultar: Consultar, prefixo: string, cnpjs?: string[]): Promise<AvisoDivergencia[]> {
  await prepararDivergencias(consultar, prefixo);
  const t = nomeTabela(prefixo);
  const r = cnpjs ? await consultar(`SELECT * FROM ${t} WHERE cnpj = ANY($1::text[]) ORDER BY cnpj, campo`, [cnpjs]) : await consultar(`SELECT * FROM ${t} ORDER BY cnpj, campo LIMIT 2000`);
  return r.rows.map((x: any) => ({ cnpj: String(x.cnpj), campo: x.campo, rotulo: ROTULO_COMPARTILHADO[x.campo as CampoCompartilhado] || String(x.campo), aqui: String(x.aqui), la: String(x.la), origem: String(x.origem),
    desde: x.criado_em instanceof Date ? x.criado_em.toISOString() : String(x.criado_em || ''), texto: textoDivergencia(x.campo, String(x.aqui), String(x.la), String(x.origem)) }));
}
/** A pessoa conferiu e quer tirar o aviso (os valores continuam como estão). */
export async function dispensarDivergencia(consultar: Consultar, prefixo: string, cnpj: string, campo: string): Promise<boolean> {
  await prepararDivergencias(consultar, prefixo);
  const r = await consultar(`DELETE FROM ${nomeTabela(prefixo)} WHERE cnpj=$1 AND campo=$2`, [cnpj, campo]);
  return (r.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------------------------------------
// Fila de envio (cada sistema guarda o que não chegou; o robô reenvia). Tabela <prefixo>_sincronia_empresas_fila
// ------------------------------------------------------------------------------------------------
const filasProntas = new Map<string, Promise<unknown>>();
function nomeFila(prefixo: string): string { if (!/^[a-z][a-z0-9_]{1,30}$/.test(prefixo)) throw new Error('Prefixo de tabela inválido.'); return `${prefixo}_sincronia_empresas_fila`; }
export function prepararFilaSincronia(consultar: Consultar, prefixo: string): Promise<unknown> {
  const t = nomeFila(prefixo);
  let p = filasProntas.get(t);
  if (!p) {
    p = consultar(`CREATE TABLE IF NOT EXISTS ${t} (cnpj text NOT NULL, destino text NOT NULL, escritorio text NOT NULL DEFAULT '', origem text NOT NULL DEFAULT '',
      dono_sistema boolean NOT NULL DEFAULT false, tentativas int NOT NULL DEFAULT 0, ultimo_erro text NOT NULL DEFAULT '', entregue_assinatura text NOT NULL DEFAULT '',
      entregue_em timestamptz, pendente boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, destino))`)
      .catch((e) => { filasProntas.delete(t); throw e; });
    filasProntas.set(t, p);
  }
  return p;
}
export async function enfileirarSincronia(consultar: Consultar, prefixo: string, item: { cnpj: string; destino: string; escritorio: string; origem: string; donoSistema?: boolean }): Promise<void> {
  await prepararFilaSincronia(consultar, prefixo);
  await consultar(`INSERT INTO ${nomeFila(prefixo)}(cnpj,destino,escritorio,origem,dono_sistema,pendente,atualizado_em) VALUES($1,$2,$3,$4,$5,true,now())
    ON CONFLICT (cnpj,destino) DO UPDATE SET escritorio=CASE WHEN EXCLUDED.escritorio<>'' THEN EXCLUDED.escritorio ELSE ${nomeFila(prefixo)}.escritorio END,
      origem=EXCLUDED.origem, dono_sistema=EXCLUDED.dono_sistema, pendente=true, atualizado_em=now()`,
  [item.cnpj, item.destino, item.escritorio.trim().toLowerCase(), item.origem, item.donoSistema === true]);
}
export interface ItemFila { cnpj: string; destino: string; escritorio: string; origem: string; donoSistema: boolean; tentativas: number; ultimoErro: string; entregueAssinatura: string; desde: string }
export async function listarPendentesSincronia(consultar: Consultar, prefixo: string, limite = 200): Promise<ItemFila[]> {
  await prepararFilaSincronia(consultar, prefixo);
  const r = await consultar(`SELECT * FROM ${nomeFila(prefixo)} WHERE pendente=true ORDER BY atualizado_em LIMIT $1`, [limite]);
  return r.rows.map((x: any) => ({ cnpj: String(x.cnpj), destino: String(x.destino), escritorio: String(x.escritorio), origem: String(x.origem), donoSistema: x.dono_sistema === true,
    tentativas: Number(x.tentativas) || 0, ultimoErro: String(x.ultimo_erro || ''), entregueAssinatura: String(x.entregue_assinatura || ''), desde: x.criado_em instanceof Date ? x.criado_em.toISOString() : String(x.criado_em || '') }));
}
export async function marcarEntregue(consultar: Consultar, prefixo: string, cnpj: string, destino: string, assinatura: string): Promise<void> {
  await consultar(`UPDATE ${nomeFila(prefixo)} SET pendente=false, tentativas=0, ultimo_erro='', entregue_assinatura=$3, entregue_em=now(), atualizado_em=now() WHERE cnpj=$1 AND destino=$2`, [cnpj, destino, assinatura]);
}
/** Falha: passageira fica pendente; recusa definitiva sai da fila marcada "recusado:<assinatura>" (o conferidor só tenta de novo quando o cadastro mudar). */
export async function marcarFalha(consultar: Consultar, prefixo: string, cnpj: string, destino: string, erro: string, desistir: boolean, assinatura = ''): Promise<void> {
  await consultar(`UPDATE ${nomeFila(prefixo)} SET tentativas=tentativas+1, ultimo_erro=$3, pendente=$4, entregue_assinatura=CASE WHEN $4 THEN entregue_assinatura ELSE $5 END, atualizado_em=now() WHERE cnpj=$1 AND destino=$2`,
    [cnpj, destino, erro.slice(0, 300), !desistir, `recusado:${assinatura}`]);
}
/** O conferidor não precisa reenviar: já entregue (ou recusado de vez) com este mesmo cadastro, ou ainda na fila. */
export function jaResolvido(registro: string | undefined, assinatura: string): boolean {
  return registro === '__pendente__' || registro === assinatura || registro === `recusado:${assinatura}`;
}
export async function assinaturasEntregues(consultar: Consultar, prefixo: string): Promise<Map<string, string>> {
  await prepararFilaSincronia(consultar, prefixo);
  const r = await consultar(`SELECT cnpj, destino, entregue_assinatura, pendente FROM ${nomeFila(prefixo)}`);
  return new Map(r.rows.map((x: any) => [`${x.cnpj}|${x.destino}`, x.pendente ? '__pendente__' : String(x.entregue_assinatura || '')]));
}
export async function apagarDaFila(consultar: Consultar, prefixo: string, cnpj: string): Promise<void> {
  await prepararFilaSincronia(consultar, prefixo);
  await consultar(`DELETE FROM ${nomeFila(prefixo)} WHERE cnpj=$1`, [cnpj]);
}

/** Resposta de outro sistema ao "receber": ok, recusa definitiva (não adianta repetir) ou falha passageira. */
export interface RespostaEnvio { ok: boolean; definitivo?: boolean; motivo: string }
export type EnviarCadastro = (item: ItemFila) => Promise<RespostaEnvio>;
export interface ResultadoRodada { entregues: number; falharam: Array<{ cnpj: string; destino: string; motivo: string }>; desistidos: Array<{ cnpj: string; destino: string; motivo: string }>; resumo: string }
/** Robô: manda o que está na fila. Falha passageira fica para a próxima rodada; recusa definitiva sai da fila (fica o motivo). */
export async function rodarFilaSincronia(consultar: Consultar, prefixo: string, assinaturaDe: (cnpj: string) => Promise<string | null>, enviar: EnviarCadastro, nomeDestino: (d: string) => string = (d) => NOME_SISTEMA[d] || d): Promise<ResultadoRodada> {
  const out: ResultadoRodada = { entregues: 0, falharam: [], desistidos: [], resumo: '' };
  for (const item of await listarPendentesSincronia(consultar, prefixo)) {
    const assinatura = await assinaturaDe(item.cnpj).catch(() => null);
    if (assinatura === null) { await apagarDaFila(consultar, prefixo, item.cnpj); out.desistidos.push({ cnpj: item.cnpj, destino: item.destino, motivo: 'a empresa não existe mais aqui (excluída): não é enviada' }); continue; }
    let r: RespostaEnvio;
    try { r = await enviar(item); } catch (e: any) { r = { ok: false, motivo: `sem resposta: ${e?.message || e}` }; }
    if (r.ok) { await marcarEntregue(consultar, prefixo, item.cnpj, item.destino, assinatura); out.entregues++; continue; }
    await marcarFalha(consultar, prefixo, item.cnpj, item.destino, r.motivo, r.definitivo === true, assinatura);
    (r.definitivo ? out.desistidos : out.falharam).push({ cnpj: item.cnpj, destino: item.destino, motivo: r.motivo });
  }
  const p: string[] = [];
  if (out.entregues) p.push(`${out.entregues} cadastro(s) de empresa entregue(s)`);
  if (out.falharam.length) p.push(`${out.falharam.length} ainda não chegou(aram) (${nomeDestino(out.falharam[0].destino)}: ${out.falharam[0].motivo.slice(0, 90)}); tento de novo na próxima rodada`);
  if (out.desistidos.length) p.push(`${out.desistidos.length} não foi(ram) enviado(s): ${out.desistidos.slice(0, 2).map((d) => d.motivo.slice(0, 90)).join('; ')}`);
  out.resumo = p.join('; ') || 'Nenhum cadastro de empresa esperando envio.';
  return out;
}
