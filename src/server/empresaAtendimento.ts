// Empresa "Disponível — ainda não atendida neste sistema" (decisão do coordenador, 28/11/2026; vale para todos os escritórios).
//
// Nem todo cliente do Fiscal é cliente de DP ou de Contábil. A empresa que CHEGA por cópia automática de outro sistema (Robô de
// Empresas do Fiscal, sincronia do cadastro) entra aqui como "disponível": aparece só no bloco recolhido "Empresas do escritório
// ainda não ativadas aqui", não conta em painel/pendências/avisos e NENHUM robô de transmissão, obrigação, cálculo ou cobrança
// age nela. A pessoa ativa com 1 clique ("Ativar aqui") ou a ativação é automática quando ela cadastra/edita a empresa na tela,
// cadastra funcionário, lança folha ou lançamento, ou quando a empresa já tem dados próprios.
//
// Regras de segurança:
//  - Sem marca = ATIVA (todo o comportamento antigo continua valendo para o que já existe e para o que a pessoa cadastra).
//  - Nada é apagado e nenhum CNPJ é bloqueado: a marca é só uma linha nesta tabela, reversível com 1 clique.
//  - Cada mudança fica no histórico com o estado anterior (para poder voltar).
//  - O mesmo arquivo serve ao DP (prefixo "dp") e ao Contábil (prefixo "contabil").
export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type Situacao = 'disponivel' | 'ativa';

/** Lote da conversão do estado atual (o "Desfazer conversão" volta só o que este lote marcou). */
export const LOTE_CONVERSAO = 'conversao-2026-11-28';
export const TITULO_BLOCO = 'Empresas do escritório ainda não ativadas aqui';

const cnpjLimpo = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const prefixoValido = (p: string) => { if (!/^[a-z_]{2,20}$/.test(p)) throw new Error('Prefixo inválido.'); return p; };
const tab = (p: string) => `${prefixoValido(p)}_empresa_atendimento`;
const hist = (p: string) => `${prefixoValido(p)}_empresa_atendimento_hist`;
const barr = (p: string) => `${prefixoValido(p)}_empresa_atendimento_barradas`;

const preparos = new Map<string, Promise<void>>();
export function prepararTabelasAtendimento(consultar: Consultar, p: string): Promise<void> {
  let pr = preparos.get(p);
  if (!pr) {
    pr = (async () => {
      await consultar(`CREATE TABLE IF NOT EXISTS ${tab(p)} (
        cnpj text PRIMARY KEY, situacao text NOT NULL CHECK (situacao IN ('disponivel','ativa')), origem text NOT NULL DEFAULT '', motivo text NOT NULL DEFAULT '',
        por text NOT NULL DEFAULT '', lote text, desde timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now())`);
      await consultar(`CREATE TABLE IF NOT EXISTS ${hist(p)} (
        id bigserial PRIMARY KEY, cnpj text NOT NULL, de text NOT NULL, para text NOT NULL, motivo text NOT NULL DEFAULT '', por text NOT NULL DEFAULT '',
        lote text, estado_anterior jsonb, em timestamptz NOT NULL DEFAULT now())`);
      await consultar(`CREATE INDEX IF NOT EXISTS ${hist(p)}_lote ON ${hist(p)} (lote)`);
      await consultar(`CREATE TABLE IF NOT EXISTS ${barr(p)} (
        id bigserial PRIMARY KEY, cnpj text NOT NULL, robo text NOT NULL, acao text NOT NULL DEFAULT '', em timestamptz NOT NULL DEFAULT now())`);
      await consultar(`CREATE INDEX IF NOT EXISTS ${barr(p)}_em ON ${barr(p)} (em DESC)`);
    })();
    pr.catch(() => preparos.delete(p));
    preparos.set(p, pr);
  }
  return pr;
}
/** Testes: esquece o preparo (banco falso novo). */
export function esquecerPreparoAtendimento(): void { preparos.clear(); caches.clear(); }

// ------------------------------------------------------------------ cache para os robôs (lido 1x por minuto)
const caches = new Map<string, { em: number; conjunto: Set<string> }>();
export function invalidarCacheAtendimento(p?: string): void { if (p) caches.delete(p); else caches.clear(); }

/** CNPJs disponíveis (não ativados aqui). Se o banco falhar, devolve vazio: o sistema se comporta como antes desta marca. */
export async function cnpjsDisponiveis(consultar: Consultar, p: string, validadeMs = 60_000): Promise<Set<string>> {
  const c = caches.get(p);
  if (c && Date.now() - c.em < validadeMs) return c.conjunto;
  try {
    // Só leitura (os robôs "só leem"): a tabela é criada na subida do servidor; sem ela, ninguém está disponível.
    const r = await consultar(`SELECT cnpj, situacao FROM ${tab(p)} WHERE situacao='disponivel'`);
    const conjunto = new Set(r.rows.filter((x) => x?.situacao === 'disponivel').map((x) => cnpjLimpo(x.cnpj)));
    caches.set(p, { em: Date.now(), conjunto });
    return conjunto;
  } catch {
    // Tabela ainda não criada ou banco fora: os robôs seguem como antes desta marca.
    return c?.conjunto ?? new Set();
  }
}
export async function empresaDisponivel(consultar: Consultar, p: string, cnpj: string): Promise<boolean> {
  return (await cnpjsDisponiveis(consultar, p)).has(cnpjLimpo(cnpj));
}
/** Tira da lista as empresas não ativadas aqui (robôs, painéis, pendências e avisos). */
export async function soAtivas<T>(consultar: Consultar, p: string, itens: T[], cnpjDe: (t: T) => unknown = (t: any) => t?.cnpj ?? t): Promise<T[]> {
  if (!itens.length) return itens;
  const disp = await cnpjsDisponiveis(consultar, p);
  return disp.size ? itens.filter((t) => !disp.has(cnpjLimpo(cnpjDe(t)))) : itens;
}
/** Registra que um robô quis agir numa empresa não ativada e foi segurado (o conferidor mostra o total). */
export async function registrarBarrada(consultar: Consultar, p: string, cnpj: string, robo: string, acao = ''): Promise<void> {
  await prepararTabelasAtendimento(consultar, p).catch(() => undefined);
  await consultar(`INSERT INTO ${barr(p)} (cnpj, robo, acao) VALUES ($1,$2,$3)`, [cnpjLimpo(cnpj), String(robo).slice(0, 80), String(acao).slice(0, 120)]).catch(() => undefined);
}

// ------------------------------------------------------------------ leitura e mudanças (uma empresa por vez)
export interface MarcaAtendimento { cnpj: string; situacao: Situacao; origem: string; motivo: string; por: string; lote: string | null; desde: string }
const deLinha = (r: any): MarcaAtendimento => ({ cnpj: cnpjLimpo(r.cnpj), situacao: r.situacao === 'disponivel' ? 'disponivel' : 'ativa', origem: String(r.origem || ''), motivo: String(r.motivo || ''),
  por: String(r.por || ''), lote: r.lote ? String(r.lote) : null, desde: r.desde ? new Date(r.desde).toISOString() : '' });

export async function lerMarca(consultar: Consultar, p: string, cnpj: string): Promise<MarcaAtendimento | null> {
  await prepararTabelasAtendimento(consultar, p);
  const r = await consultar(`SELECT * FROM ${tab(p)} WHERE cnpj=$1`, [cnpjLimpo(cnpj)]);
  return r.rows[0] ? deLinha(r.rows[0]) : null;
}
export async function marcasDe(consultar: Consultar, p: string, cnpjs: string[]): Promise<Map<string, MarcaAtendimento>> {
  const lista = [...new Set(cnpjs.map(cnpjLimpo).filter(Boolean))];
  if (!lista.length) return new Map();
  await prepararTabelasAtendimento(consultar, p);
  const r = await consultar(`SELECT * FROM ${tab(p)} WHERE cnpj = ANY($1::text[])`, [lista]);
  return new Map(r.rows.map((x) => { const m = deLinha(x); return [m.cnpj, m]; }));
}

async function gravar(consultar: Consultar, p: string, cnpj: string, para: Situacao, info: { origem?: string; motivo: string; por: string; lote?: string | null }): Promise<{ antes: MarcaAtendimento | null }> {
  const c = cnpjLimpo(cnpj);
  const antes = await lerMarca(consultar, p, c);
  await consultar(`INSERT INTO ${tab(p)} (cnpj, situacao, origem, motivo, por, lote, desde, atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,now(),now())
    ON CONFLICT (cnpj) DO UPDATE SET situacao=EXCLUDED.situacao, motivo=EXCLUDED.motivo, por=EXCLUDED.por, lote=EXCLUDED.lote,
      origem=CASE WHEN EXCLUDED.origem<>'' THEN EXCLUDED.origem ELSE ${tab(p)}.origem END,
      desde=CASE WHEN ${tab(p)}.situacao=EXCLUDED.situacao THEN ${tab(p)}.desde ELSE now() END, atualizado_em=now()`,
  [c, para, String(info.origem || '').slice(0, 60), info.motivo.slice(0, 300), info.por.slice(0, 120), info.lote ?? null]);
  await consultar(`INSERT INTO ${hist(p)} (cnpj, de, para, motivo, por, lote, estado_anterior) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [c, antes?.situacao ?? 'ativa (sem marca)', para, info.motivo.slice(0, 300), info.por.slice(0, 120), info.lote ?? null, JSON.stringify(antes ?? { situacao: 'ativa', marca: false })]);
  invalidarCacheAtendimento(p);
  return { antes };
}

/** Empresa que ACABOU de ser criada por cópia automática: entra disponível. Nunca mexe em empresa que já tem marca. */
export async function marcarDisponivelNaChegada(consultar: Consultar, p: string, cnpj: string, origem: string): Promise<boolean> {
  await prepararTabelasAtendimento(consultar, p);
  const c = cnpjLimpo(cnpj);
  if ((await consultar(`SELECT 1 FROM ${tab(p)} WHERE cnpj=$1`, [c])).rows.length) return false;
  const r = await consultar(`INSERT INTO ${tab(p)} (cnpj, situacao, origem, motivo, por) VALUES ($1,'disponivel',$2,$3,'robô') ON CONFLICT (cnpj) DO NOTHING RETURNING cnpj`,
    [c, String(origem).slice(0, 60), 'Chegou por cópia automática de outro sistema (não foi cadastrada aqui pela pessoa).']);
  if (!r.rowCount) return false;
  await consultar(`INSERT INTO ${hist(p)} (cnpj, de, para, motivo, por, estado_anterior) VALUES ($1,'nova','disponivel',$2,'robô',NULL)`, [c, `Chegou por cópia automática (${origem}).`]);
  invalidarCacheAtendimento(p);
  return true;
}

/** Ativa a empresa neste sistema (1 clique, Murad, ou uso: funcionário, folha, lançamento, cadastro na tela). Idempotente. */
export async function ativarEmpresa(consultar: Consultar, p: string, cnpj: string, info: { motivo: string; por: string }): Promise<{ ativou: boolean; jaEstavaAtiva: boolean }> {
  await prepararTabelasAtendimento(consultar, p);
  const antes = await lerMarca(consultar, p, cnpj);
  if (antes?.situacao === 'ativa') return { ativou: false, jaEstavaAtiva: true };
  await gravar(consultar, p, cnpj, 'ativa', { motivo: info.motivo, por: info.por, lote: null });
  return { ativou: antes?.situacao === 'disponivel', jaEstavaAtiva: !antes };
}
/** Atalho para os ganchos de uso (nunca atrapalha quem chamou: erro vira só log). Só grava quando estava disponível. */
export async function ativarPorUso(consultar: Consultar, p: string, cnpj: string, motivo: string, por = 'automático'): Promise<boolean> {
  try {
    if (!(await empresaDisponivel(consultar, p, cnpj))) {
      // O cache pode estar velho (1 min): confere no banco só se a marca existir.
      const m = await lerMarca(consultar, p, cnpj);
      if (m?.situacao !== 'disponivel') return false;
    }
    return (await ativarEmpresa(consultar, p, cnpj, { motivo, por })).ativou;
  } catch (e) { console.error('[empresa disponível] falha ao ativar pelo uso:', (e as Error)?.message || e); return false; }
}
/** Volta a empresa para "disponível" (a pessoa decidiu que este escritório não faz este serviço dela). Nada é apagado. */
export async function deixarDisponivel(consultar: Consultar, p: string, cnpj: string, info: { motivo: string; por: string; lote?: string | null }): Promise<void> {
  await prepararTabelasAtendimento(consultar, p);
  await gravar(consultar, p, cnpj, 'disponivel', info);
}

// ------------------------------------------------------------------ conversão do estado atual (robô em lotes, idempotente)
export interface CandidataConversao { cnpj: string; veioPorCopia: boolean }
export interface DepsConversao {
  consultar: Consultar;
  prefixo: string;
  /** Empresas que ainda NÃO têm marca (ordem estável), até `limite`. */
  candidatasSemMarca: (limite: number) => Promise<CandidataConversao[]>;
  /** Por que a empresa tem dados próprios aqui (vazio = não tem nada próprio). */
  dadosProprios: (cnpj: string) => Promise<string[]>;
  lote?: number;
}
export interface ResultadoConversao { avaliadas: number; viraramDisponiveis: number; ficaramAtivas: number; reativadasPorUso: number; faltam: boolean; resumo: string }

export async function converterEstadoAtual(d: DepsConversao): Promise<ResultadoConversao> {
  const { consultar, prefixo: p } = d;
  await prepararTabelasAtendimento(consultar, p);
  const limite = Math.max(1, Math.min(500, d.lote ?? 200));
  const candidatas = await d.candidatasSemMarca(limite);
  let viraramDisponiveis = 0, ficaramAtivas = 0, reativadasPorUso = 0;
  for (const c of candidatas) {
    const cnpj = cnpjLimpo(c.cnpj);
    if (!cnpj) continue;
    if (!c.veioPorCopia) { await gravar(consultar, p, cnpj, 'ativa', { motivo: 'Conversão: cadastrada neste sistema pela pessoa.', por: 'robô da conversão', lote: LOTE_CONVERSAO }); ficaramAtivas++; continue; }
    const dados = await d.dadosProprios(cnpj).catch(() => ['não consegui conferir os dados (fica ativa por segurança)']);
    if (dados.length) { await gravar(consultar, p, cnpj, 'ativa', { motivo: `Conversão: tem dados próprios aqui (${dados.slice(0, 4).join(', ')}).`, por: 'robô da conversão', lote: LOTE_CONVERSAO }); ficaramAtivas++; continue; }
    await gravar(consultar, p, cnpj, 'disponivel', { origem: 'cópia automática', motivo: 'Conversão: veio por cópia de outro sistema e não tem nenhum dado próprio aqui.', por: 'robô da conversão', lote: LOTE_CONVERSAO });
    viraramDisponiveis++;
  }
  // Conferência de segurança: disponível que ganhou dados próprios (por qualquer caminho) é ativada sozinha.
  const disp = await consultar(`SELECT cnpj FROM ${tab(p)} WHERE situacao='disponivel' ORDER BY atualizado_em LIMIT $1`, [limite]);
  for (const r of disp.rows) {
    const dados = await d.dadosProprios(cnpjLimpo(r.cnpj)).catch(() => [] as string[]);
    if (dados.length) { await gravar(consultar, p, r.cnpj, 'ativa', { motivo: `Ativada sozinha: ganhou dados próprios (${dados.slice(0, 4).join(', ')}).`, por: 'robô da conversão', lote: null }); reativadasPorUso++; }
  }
  const faltam = candidatas.length >= limite;
  const resumo = `${candidatas.length} empresa(s) conferida(s) neste lote: ${viraramDisponiveis} passaram a "disponível" (vieram por cópia, sem nenhum dado próprio), ${ficaramAtivas} continuam ativas; ${reativadasPorUso} disponível(is) ganharam dados e foram ativadas.${faltam ? ' Ainda há empresas para conferir no próximo lote.' : ''} Nada foi apagado.`;
  return { avaliadas: candidatas.length, viraramDisponiveis, ficaramAtivas, reativadasPorUso, faltam, resumo };
}

/** Desfaz a conversão: toda empresa que o lote da conversão deixou "disponível" (e continua assim) volta a ativa. */
export async function desfazerConversao(consultar: Consultar, p: string, por: string): Promise<{ voltaram: number }> {
  await prepararTabelasAtendimento(consultar, p);
  const r = await consultar(`SELECT cnpj FROM ${tab(p)} WHERE situacao='disponivel' AND lote=$1`, [LOTE_CONVERSAO]);
  for (const x of r.rows) await gravar(consultar, p, x.cnpj, 'ativa', { motivo: 'Conversão desfeita (volta ao estado anterior: ativa).', por, lote: null });
  return { voltaram: r.rows.length };
}

export interface ResumoAtendimento { disponiveis: number; ativasMarcadas: number; daConversao: number; barradas24h: number; ultimasBarradas: Array<{ robo: string; acao: string; n: number }> }
export async function resumoAtendimento(consultar: Consultar, p: string): Promise<ResumoAtendimento> {
  await prepararTabelasAtendimento(consultar, p);
  const a = (await consultar(`SELECT COALESCE(SUM(CASE WHEN situacao='disponivel' THEN 1 ELSE 0 END),0)::int AS d, COALESCE(SUM(CASE WHEN situacao='ativa' THEN 1 ELSE 0 END),0)::int AS a,
    COALESCE(SUM(CASE WHEN situacao='disponivel' AND lote=$1 THEN 1 ELSE 0 END),0)::int AS c FROM ${tab(p)}`, [LOTE_CONVERSAO])).rows[0] || {};
  const b = (await consultar(`SELECT robo, acao, count(*)::int AS n FROM ${barr(p)} WHERE em > now() - interval '24 hours' GROUP BY robo, acao ORDER BY n DESC LIMIT 10`)).rows;
  return { disponiveis: Number(a.d || 0), ativasMarcadas: Number(a.a || 0), daConversao: Number(a.c || 0), barradas24h: b.reduce((s, x) => s + Number(x.n || 0), 0),
    ultimasBarradas: b.map((x) => ({ robo: String(x.robo), acao: String(x.acao), n: Number(x.n) })) };
}

// ------------------------------------------------------------------ conferidor: robô agindo em empresa não ativada
export interface AlvoConferencia { tabela: string; robo: string; /** Filtro extra (SQL fixo, sem dado de fora), ex.: "t.modo <> 'desligado'". */ filtro?: string }
export interface AchadoConferidor { robo: string; tabela: string; cnpj: string; registros: number }
const COLUNAS_TEMPO = ['created_at', 'criado_em', 'atualizado_em', 'updated_at', 'gerado_em', 'enviado_em', 'em'];

/** Procura, nas tabelas onde os robôs gravam o que fizeram, registro NOVO (depois de a empresa ficar disponível) de empresa não ativada. Só leitura. */
export async function conferirRobosEmDisponiveis(consultar: Consultar, p: string, alvos: AlvoConferencia[]): Promise<{ achados: AchadoConferidor[]; conferidas: number; tabelas: number }> {
  await prepararTabelasAtendimento(consultar, p);
  const disp = (await consultar(`SELECT count(*)::int AS n FROM ${tab(p)} WHERE situacao='disponivel'`)).rows[0]?.n || 0;
  const achados: AchadoConferidor[] = [];
  let tabelas = 0;
  if (!disp) return { achados, conferidas: 0, tabelas };
  for (const alvo of alvos) {
    if (!/^[a-z0-9_]+$/.test(alvo.tabela)) continue;
    try {
      const cols = (await consultar(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name=$1`, [alvo.tabela])).rows.map((x) => String(x.column_name));
      if (!cols.includes('cnpj')) continue;
      const tempo = COLUNAS_TEMPO.find((c) => cols.includes(c));
      if (!tempo) continue;
      tabelas++;
      const r = await consultar(`SELECT t.cnpj, count(*)::int AS n FROM ${alvo.tabela} t JOIN ${tab(p)} a ON a.cnpj=t.cnpj AND a.situacao='disponivel'
        WHERE t.${tempo} > a.desde${alvo.filtro ? ` AND (${alvo.filtro})` : ''} GROUP BY t.cnpj ORDER BY t.cnpj LIMIT 50`);
      for (const x of r.rows) achados.push({ robo: alvo.robo, tabela: alvo.tabela, cnpj: cnpjLimpo(x.cnpj), registros: Number(x.n || 0) });
    } catch { /* tabela de outro módulo ainda não criada: pula */ }
  }
  return { achados, conferidas: Number(disp), tabelas };
}

/** Texto curto para a Murad e para o painel (sem nome de empresa: o painel dos robôs é visto por todos). */
export function textoConferidor(achados: AchadoConferidor[]): string {
  if (!achados.length) return 'Nenhum robô agiu em empresa não ativada.';
  const porRobo = new Map<string, number>();
  for (const a of achados) porRobo.set(a.robo, (porRobo.get(a.robo) || 0) + 1);
  return `Atenção: ${[...porRobo.entries()].map(([r, n]) => `${r} agiu em ${n} empresa(s) não ativada(s)`).join('; ')}.`;
}
