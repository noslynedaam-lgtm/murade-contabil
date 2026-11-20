// Ligação do Murade Contábil com o CONSULTOR MURADE (serviço Agente IA; contrato em agente-ia/docs/CONSULTOR.md).
// A ferramenta consultar_legislacao pergunta primeiro ao Consultor (resposta + fontes oficiais + aviso de responsabilidade +
// ações sugeridas + divergência). Sem MURADE_CONSULTOR_TOKEN, fora do ar, erro ou demora (~45 s): devolve null e a Agente cai
// na consulta de sempre (/api/ai/chat), sem erro para o contador. O Consultor não executa nada: quem executa é o Contábil,
// pelas ferramentas da Agente, com as mesmas regras (pendente de aprovação, aprovar/fechar só no clique do contador).
export const CONSULTOR_URL_PADRAO = 'https://murade-agente-ia.onrender.com';
export const TIMEOUT_CONSULTOR_MS = 45_000;

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<any> }>;
export interface OpcoesConsultor { fetch?: Fetch; env?: Record<string, string | undefined>; timeoutMs?: number }

export interface ContextoEmpresaConsultor {
  cnpj?: string; razaoSocial?: string; regime?: 'simples' | 'presumido' | 'real' | 'mei'; cnaePrincipal?: string; uf?: string; municipio?: string; pendencias?: string[];
}
export interface PerguntaConsultor {
  pergunta: string; contextoEmpresa?: ContextoEmpresaConsultor; historico?: Array<{ papel: 'usuario' | 'consultor'; texto: string }>;
  ferramentasDisponiveis?: Array<{ nome: string; descricao: string }>; usuario?: string; escritorio?: string;
}
export interface RespostaConsultor {
  resposta: string; area?: string; fontes: Array<{ titulo: string; url: string }>; confianca?: string; encaminharContador?: boolean; motivoEncaminhamento?: string;
  acoesSugeridas: Array<{ ferramenta: string; descricao: string; argumentos: Record<string, unknown> }>; avisoResponsabilidade?: string;
  divergencia?: { orientacao: string; fonte?: { titulo: string; url: string }; escolhaDoContador: string }; recusado?: boolean;
}

const config = (o: OpcoesConsultor) => {
  const env = o.env ?? process.env;
  const token = String(env.MURADE_CONSULTOR_TOKEN || '').trim();
  const url = String(env.MURADE_CONSULTOR_URL || CONSULTOR_URL_PADRAO).trim().replace(/\/+$/, '');
  return token && /^https?:\/\//.test(url) ? { token, url } : null;
};
export const consultorConfigurado = (o: OpcoesConsultor = {}): boolean => config(o) !== null;

async function postar(caminho: string, corpo: unknown, o: OpcoesConsultor): Promise<{ status: number; json: any } | null> {
  const c = config(o); if (!c) return null;
  const f: Fetch = o.fetch ?? ((url, init) => fetch(url, init) as any);
  try {
    const r = await f(`${c.url}${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-murade-consultor-token': c.token }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(o.timeoutMs ?? TIMEOUT_CONSULTOR_MS) });
    let json: any = {}; try { json = await r.json(); } catch { /* sem corpo */ }
    return { status: r.status, json };
  } catch (e: any) { console.error('Consultor Murade indisponível:', e?.message || e); return null; }
}

/** Pergunta ao Consultor. null = use a consulta de sempre (sem token, fora do ar, erro, demora ou resposta sem texto). */
export async function perguntarAoConsultor(p: PerguntaConsultor, o: OpcoesConsultor = {}): Promise<RespostaConsultor | null> {
  const pergunta = String(p.pergunta || '').trim().slice(0, 30_000);
  if (!pergunta) return null;
  const r = await postar('/api/consultor/perguntar', {
    pergunta, sistema: 'contabil', contextoEmpresa: p.contextoEmpresa, historico: (p.historico || []).slice(-8),
    ferramentasDisponiveis: (p.ferramentasDisponiveis || []).slice(0, 80).map((x) => ({ nome: x.nome, descricao: String(x.descricao || '').slice(0, 300) })),
    usuario: p.usuario, escritorio: p.escritorio,
  }, o);
  if (!r || r.status !== 200 || typeof r.json?.resposta !== 'string' || !r.json.resposta.trim()) return null;
  const j = r.json;
  const nomes = new Set((p.ferramentasDisponiveis || []).map((x) => x.nome));
  return {
    resposta: j.resposta, area: j.area, confianca: j.confianca, encaminharContador: j.encaminharContador === true, motivoEncaminhamento: j.motivoEncaminhamento,
    fontes: (Array.isArray(j.fontes) ? j.fontes : []).filter((f: any) => f && typeof f.url === 'string').map((f: any) => ({ titulo: String(f.titulo || f.url), url: f.url })),
    // Defesa extra: só ação de ferramenta que este sistema tem (o Consultor já filtra).
    acoesSugeridas: j.recusado ? [] : (Array.isArray(j.acoesSugeridas) ? j.acoesSugeridas : []).filter((a: any) => a && nomes.has(a.ferramenta)).map((a: any) => ({ ferramenta: a.ferramenta, descricao: String(a.descricao || ''), argumentos: a.argumentos && typeof a.argumentos === 'object' ? a.argumentos : {} })),
    avisoResponsabilidade: j.avisoResponsabilidade,
    divergencia: !j.recusado && j.divergencia && typeof j.divergencia.orientacao === 'string' ? j.divergencia : undefined,
    recusado: j.recusado === true || undefined,
  };
}

/** Registra no Consultor a decisão final do contador (fazer diferente da orientação). Fail-open: devolve false se não deu. */
export async function registrarDecisaoNoConsultor(d: { escritorio?: string; usuario?: string; pergunta: string; orientacao: string; fonte?: { titulo: string; url: string }; escolhaDoContador: string }, o: OpcoesConsultor = {}): Promise<boolean> {
  if (!d.orientacao || !d.escolhaDoContador) return false;
  const r = await postar('/api/consultor/registrar-decisao', { ...d, sistema: 'contabil', fonte: d.fonte?.url ? d.fonte : undefined, data: new Date().toISOString() }, o);
  return Boolean(r && r.status >= 200 && r.status < 300);
}

/** Regime do cadastro → regime do contrato do Consultor. */
export function regimeParaConsultor(regime: unknown): ContextoEmpresaConsultor['regime'] {
  const t = String(regime || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/\bmei\b|microempreendedor/.test(t)) return 'mei';
  if (/simples/.test(t)) return 'simples';
  if (/presumido/.test(t)) return 'presumido';
  if (/real/.test(t)) return 'real';
  return undefined;
}

/** Opções do teste (fetch simulado e variáveis). Em produção fica vazio. */
export const opcoesConsultorParaTeste: { atual: OpcoesConsultor } = { atual: {} };

// ---------------------------------------------------------------------------------------------
// Adicional pago: o Consultor Murade completo (Consultor + serviço completo) é liberado por escritório (CNPJ do escritório).
// GET {URL}/api/consultor/liberado?escritorio=<cnpj>, mesmo token, cache de 10 minutos. Sem variável, sem CNPJ do escritório,
// fora do ar ou resposta estranha = NÃO liberado (a Agente segue como sempre, sem erro).
// ---------------------------------------------------------------------------------------------
export const CACHE_LIBERACAO_MS = 10 * 60_000;
export const FRASE_NAO_LIBERADO = 'O Consultor Murade completo, que faz o serviço inteiro para você, é um adicional. Fale com o seu fornecedor para liberar.';
const cacheLiberacao = new Map<string, { liberado: boolean; ate: number }>();
export const limparCacheLiberacaoParaTeste = () => cacheLiberacao.clear();

export async function consultorLiberado(cnpjEscritorio: string | null | undefined, o: OpcoesConsultor = {}, agora = Date.now()): Promise<boolean> {
  const cnpj = String(cnpjEscritorio || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  const c = config(o); if (!c) return false;
  const guardado = cacheLiberacao.get(`${c.url}|${cnpj}`);
  if (guardado && guardado.ate > agora) return guardado.liberado;
  let liberado = false;
  try {
    const f: Fetch = o.fetch ?? ((url, init) => fetch(url, init) as any);
    const r = await f(`${c.url}/api/consultor/liberado?escritorio=${cnpj}`, { method: 'GET', headers: { Accept: 'application/json', 'x-murade-consultor-token': c.token }, signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) });
    let j: any = {}; try { j = await r.json(); } catch { /* sem corpo */ }
    liberado = r.status === 200 && j?.liberado === true;
  } catch (e: any) { console.error('Consultor Murade: não consegui conferir a liberação:', e?.message || e); }
  if (cacheLiberacao.size > 1000) cacheLiberacao.clear();
  cacheLiberacao.set(`${c.url}|${cnpj}`, { liberado, ate: agora + CACHE_LIBERACAO_MS });
  return liberado;
}
