// Online / offline para o DONO DO SISTEMA (Acesso Admin › Usuários e licenças › lista de escritórios).
//
// O que é guardado (só o necessário): usuário (id e login), escritório, sistema, nome da tela atual e horário do último sinal.
// Uma linha por usuário em cada sistema (é sempre sobrescrita; não vira histórico). Nada de empresa, tela gravada, teclas ou IP.
// O sinal vem do batimento de presença que o navegador já manda (POST /api/auth/presenca) e vale para todos que entram:
// dono do escritório, equipe e cliente de empresa. Só o dono do sistema vê; escritórios clientes nunca veem.
//
// Os três sistemas (DP, Fiscal e Contábil) guardam cada um o seu e se mostram uns aos outros por
// GET /api/integracao/presenca-dono (token de integração), para o painel do dono mostrar em qual sistema a pessoa está.
//
// Este arquivo é igual nos três sistemas (muda só a configuração passada em criarPresencaDono).

export type SistemaMurad = 'DP' | 'Fiscal' | 'Contábil';
export type EstadoOnline = 'online' | 'ativo' | 'offline';
export type PapelPresenca = 'dono' | 'equipe' | 'cliente';

/** Verde: sinal nos últimos 2 minutos. */
export const ONLINE_ATE_SEG = 120;
/** Amarela: sinal há até 15 minutos. Depois disso: cinza (offline). */
export const ATIVO_ATE_SEG = 15 * 60;
/** Linhas sem sinal há mais que isto são apagadas pelo robô conferidor. */
export const RETENCAO_DIAS = 90;
/** Grava no máximo um sinal a cada 20 s por usuário (a menos que a tela tenha mudado). */
export const INTERVALO_MINIMO_MS = 20_000;
const FUSO = 'America/Sao_Paulo';

function doisDigitos(n: number) { return String(n).padStart(2, '0'); }
/** DD/MM HH:MM no horário de Brasília. */
export function dataHoraBrasilia(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Bolinha e texto: "Online agora" (até 2 min), "Ativo há X min" (até 15 min) ou "Offline — visto por último em DD/MM HH:MM". */
export function situacaoPresenca(ultimaEm: Date | string | null | undefined, agora: Date): { estado: EstadoOnline; texto: string } {
  if (!ultimaEm) return { estado: 'offline', texto: 'Offline — ainda não entrou' };
  const quando = new Date(ultimaEm);
  if (Number.isNaN(quando.getTime())) return { estado: 'offline', texto: 'Offline — ainda não entrou' };
  const seg = Math.max(0, (agora.getTime() - quando.getTime()) / 1000);
  if (seg <= ONLINE_ATE_SEG) return { estado: 'online', texto: 'Online agora' };
  if (seg <= ATIVO_ATE_SEG) return { estado: 'ativo', texto: `Ativo há ${Math.max(2, Math.floor(seg / 60))} min` };
  return { estado: 'offline', texto: `Offline — visto por último em ${dataHoraBrasilia(quando)}` };
}

/** Nome da tela que o navegador mandou: só texto simples e curto (nada de HTML ou dado digitado). */
export function limparTela(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.normalize('NFC').replace(/[^\p{L}\p{N} .,:;()/º°ª&+\-–—]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t || null;
}

const loginNorm = (x: unknown) => String(x ?? '').trim().toLowerCase();

/** Um sinal de um sistema (local ou vindo de outro sistema pela integração). */
export type SinalPresenca = { escritorio: string; login: string; papel: PapelPresenca; sistema: SistemaMurad; tela: string | null; ultimaEm: string };
export type EscritorioPresenca = { login: string; usuarios: Array<{ login: string; papel: PapelPresenca }> };
export type UsuarioNoPainel = {
  login: string; papel: PapelPresenca; estado: EstadoOnline; texto: string; ultimaEm: string | null;
  sistemas: Array<{ sistema: SistemaMurad; tela: string | null; estado: EstadoOnline; texto: string; ultimaEm: string }>;
};
export type EscritorioNoPainel = { login: string; estado: EstadoOnline; texto: string; online: number; ativos: number; totalUsuarios: number; usuarios: UsuarioNoPainel[] };

const ORDEM_ESTADO: Record<EstadoOnline, number> = { online: 0, ativo: 1, offline: 2 };
const ORDEM_PAPEL: Record<PapelPresenca, number> = { dono: 0, equipe: 1, cliente: 2 };
const ORDEM_SISTEMA: Record<string, number> = { DP: 0, Fiscal: 1, 'Contábil': 2 };

/**
 * Junta a lista de escritórios (com os usuários cadastrados neste sistema) com os sinais dos três sistemas.
 * Usuário que só existe em outro sistema entra também, desde que o sinal seja do mesmo escritório (mesmo login do dono do escritório).
 */
export function montarPainelPresenca(escritorios: EscritorioPresenca[], sinais: SinalPresenca[], agora: Date): Record<string, EscritorioNoPainel> {
  const porEscritorio = new Map<string, Map<string, SinalPresenca[]>>();
  for (const s of sinais) {
    const e = loginNorm(s.escritorio); const u = loginNorm(s.login);
    if (!e || !u) continue;
    const m = porEscritorio.get(e) || new Map<string, SinalPresenca[]>();
    const l = m.get(u) || []; l.push(s); m.set(u, l); porEscritorio.set(e, m);
  }
  const resultado: Record<string, EscritorioNoPainel> = {};
  for (const esc of escritorios) {
    const chave = loginNorm(esc.login);
    const sinaisDoEsc = porEscritorio.get(chave) || new Map<string, SinalPresenca[]>();
    const papeis = new Map<string, PapelPresenca>();
    papeis.set(chave, 'dono');
    for (const u of esc.usuarios) papeis.set(loginNorm(u.login), loginNorm(u.login) === chave ? 'dono' : u.papel);
    for (const [u, l] of sinaisDoEsc) if (!papeis.has(u)) papeis.set(u, l[0].papel);
    const usuarios: UsuarioNoPainel[] = [...papeis.entries()].map(([login, papel]) => {
      // Último sinal de cada sistema (se vier repetido, vale o mais novo).
      const ultimoPorSistema = new Map<string, SinalPresenca>();
      for (const s of sinaisDoEsc.get(login) || []) {
        const atual = ultimoPorSistema.get(s.sistema);
        if (!atual || new Date(s.ultimaEm).getTime() > new Date(atual.ultimaEm).getTime()) ultimoPorSistema.set(s.sistema, s);
      }
      const sistemas = [...ultimoPorSistema.values()]
        .map((s) => ({ sistema: s.sistema, tela: s.tela, ultimaEm: new Date(s.ultimaEm).toISOString(), ...situacaoPresenca(s.ultimaEm, agora) }))
        .sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] || (ORDEM_SISTEMA[a.sistema] ?? 9) - (ORDEM_SISTEMA[b.sistema] ?? 9));
      const maisRecente = sistemas.reduce<string | null>((acc, s) => (!acc || s.ultimaEm > acc ? s.ultimaEm : acc), null);
      return { login, papel, ultimaEm: maisRecente, ...situacaoPresenca(maisRecente, agora), sistemas };
    }).sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado] || ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel] || a.login.localeCompare(b.login));
    const online = usuarios.filter((u) => u.estado === 'online').length;
    const ativos = usuarios.filter((u) => u.estado === 'ativo').length;
    const ultimo = usuarios.reduce<string | null>((acc, u) => (u.ultimaEm && (!acc || u.ultimaEm > acc) ? u.ultimaEm : acc), null);
    const geral = situacaoPresenca(ultimo, agora);
    const texto = online ? `${online} online agora` : geral.texto;
    resultado[chave] = { login: chave, estado: geral.estado, texto, online, ativos, totalUsuarios: usuarios.length, usuarios };
  }
  return resultado;
}

/** Confere a resposta de outro sistema antes de usar (nunca confia no formato). */
export function sinaisValidos(corpo: unknown, sistemaEsperado: SistemaMurad): SinalPresenca[] {
  const lista = corpo && typeof corpo === 'object' && Array.isArray((corpo as any).sinais) ? (corpo as any).sinais as unknown[] : [];
  const saida: SinalPresenca[] = [];
  for (const x of lista.slice(0, 20_000)) {
    if (!x || typeof x !== 'object') continue;
    const s = x as Record<string, unknown>;
    const escritorio = loginNorm(s.escritorio); const login = loginNorm(s.login);
    const quando = new Date(String(s.ultimaEm || ''));
    if (!escritorio || !login || escritorio.length > 200 || login.length > 200 || Number.isNaN(quando.getTime())) continue;
    const papel: PapelPresenca = s.papel === 'dono' || s.papel === 'equipe' ? s.papel : 'cliente';
    saida.push({ escritorio, login, papel, sistema: sistemaEsperado, tela: limparTela(s.tela), ultimaEm: quando.toISOString() });
  }
  return saida;
}

export type ConsultaPresenca = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type SessaoSinal = { userId: string; tenantId: string; login: string };
export type OutroSistema = { sistema: SistemaMurad; url: string };

export type DependenciasPresencaDono = {
  sistema: SistemaMurad;
  consultar: ConsultaPresenca;
  tabela: string;
  /**
   * SELECT que devolve os sinais locais já com o escritório e o papel: colunas escritorio, login, papel, tela, ultima_em.
   * Recebe $1 = limite de dias. Faz JOIN com os usuários do sistema: usuário excluído some sozinho do painel.
   */
  sqlSinais: string;
  /** Escritórios clientes e os usuários de cada um neste sistema (o que o dono do sistema já vê na lista). */
  listarEscritorios: () => Promise<EscritorioPresenca[]>;
  /** SQL que apaga sinais de usuários que não existem mais (rodado pelo robô). Opcional. */
  sqlOrfaos?: string;
  outros: OutroSistema[];
  token: () => string | undefined;
  agora?: () => Date;
  buscar?: typeof fetch;
};

export function criarPresencaDono(deps: DependenciasPresencaDono) {
  const agora = deps.agora || (() => new Date());
  const buscar = deps.buscar || fetch;
  const tabela = deps.tabela;
  let pronta: Promise<void> | null = null;
  const garantirTabela = () => {
    pronta ??= deps.consultar(`
      CREATE TABLE IF NOT EXISTS ${tabela} (
        user_id text PRIMARY KEY, tenant_id text NOT NULL, login text NOT NULL, tela text, ultima_em timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ${tabela}_tenant_idx ON ${tabela}(tenant_id);
    `).then(() => undefined).catch((erro) => { pronta = null; throw erro; });
    return pronta;
  };

  const ultimoGravado = new Map<string, { em: number; tela: string | null }>();
  /** Grava o último sinal do usuário (uma linha por usuário). Nunca lança erro: falhar aqui não atrapalha ninguém. */
  async function registrarSinal(sessao: SessaoSinal | undefined, telaBruta: unknown): Promise<boolean> {
    try {
      if (!sessao?.userId || !sessao.tenantId) return false;
      const t = agora(); const tela = limparTela(telaBruta);
      const ant = ultimoGravado.get(sessao.userId);
      if (ant && t.getTime() - ant.em < INTERVALO_MINIMO_MS && (ant.tela === tela || !tela)) return false;
      ultimoGravado.set(sessao.userId, { em: t.getTime(), tela: tela ?? ant?.tela ?? null });
      if (ultimoGravado.size > 5000) for (const [k, v] of ultimoGravado) if (t.getTime() - v.em > 600_000) ultimoGravado.delete(k);
      await garantirTabela();
      await deps.consultar(
        `INSERT INTO ${tabela} (user_id, tenant_id, login, tela, ultima_em) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id, login=EXCLUDED.login, tela=COALESCE(EXCLUDED.tela, ${tabela}.tela), ultima_em=GREATEST(${tabela}.ultima_em, EXCLUDED.ultima_em)`,
        [String(sessao.userId), String(sessao.tenantId), loginNorm(sessao.login), tela, t.toISOString()]);
      return true;
    } catch (erro) {
      console.error('Sinal de presença (dono do sistema) não gravado:', erro instanceof Error ? erro.message : erro);
      return false;
    }
  }

  /** Sinais deste sistema (últimos `dias`). */
  async function sinaisLocais(dias = RETENCAO_DIAS): Promise<SinalPresenca[]> {
    await garantirTabela();
    const r = await deps.consultar(deps.sqlSinais, [dias]);
    return r.rows.map((row) => ({
      escritorio: loginNorm(row.escritorio), login: loginNorm(row.login),
      papel: (row.papel === 'dono' || row.papel === 'equipe' ? row.papel : 'cliente') as PapelPresenca,
      sistema: deps.sistema, tela: row.tela ? String(row.tela) : null, ultimaEm: new Date(row.ultima_em).toISOString(),
    })).filter((s) => s.escritorio && s.login);
  }

  // Sinais dos outros sistemas: cache curto para o painel (que atualiza a cada 30 s) não sobrecarregar ninguém.
  const cacheOutros = new Map<string, { em: number; sinais: SinalPresenca[] }>();
  async function sinaisDosOutros(): Promise<{ sinais: SinalPresenca[]; sistemas: Array<{ sistema: SistemaMurad; ok: boolean; motivo?: string }> }> {
    const token = deps.token()?.trim();
    const sinais: SinalPresenca[] = []; const sistemas: Array<{ sistema: SistemaMurad; ok: boolean; motivo?: string }> = [];
    await Promise.all(deps.outros.map(async (o) => {
      const c = cacheOutros.get(o.sistema);
      if (c && agora().getTime() - c.em < 20_000) { sinais.push(...c.sinais); sistemas.push({ sistema: o.sistema, ok: true }); return; }
      if (!token) { sistemas.push({ sistema: o.sistema, ok: false, motivo: 'integração não configurada' }); return; }
      try {
        const r = await buscar(new URL('/api/integracao/presenca-dono', o.url), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
        if (!r.ok) { sistemas.push({ sistema: o.sistema, ok: false, motivo: r.status === 404 ? 'ainda sem esta função publicada' : `resposta ${r.status}` }); return; }
        const lista = sinaisValidos(await r.json().catch(() => null), o.sistema);
        cacheOutros.set(o.sistema, { em: agora().getTime(), sinais: lista });
        sinais.push(...lista); sistemas.push({ sistema: o.sistema, ok: true });
      } catch { sistemas.push({ sistema: o.sistema, ok: false, motivo: 'não respondeu (pode estar acordando)' }); }
    }));
    return { sinais, sistemas };
  }

  /** Painel do dono do sistema: escritórios com a bolinha de cada um e de cada usuário. */
  async function painel() {
    const [escritorios, locais, outros] = await Promise.all([deps.listarEscritorios(), sinaisLocais(), sinaisDosOutros()]);
    const t = agora();
    return {
      geradoEm: t.toISOString(),
      regras: { onlineAteMin: ONLINE_ATE_SEG / 60, ativoAteMin: ATIVO_ATE_SEG / 60 },
      sistemas: [{ sistema: deps.sistema, ok: true }, ...outros.sistemas],
      escritorios: montarPainelPresenca(escritorios, [...locais, ...outros.sinais], t),
    };
  }

  /** Robô conferidor: apaga sinais antigos e de usuários excluídos; conta quem está online neste sistema. */
  async function conferir() {
    await garantirTabela();
    const t = agora();
    const apagados = (await deps.consultar(`DELETE FROM ${tabela} WHERE ultima_em < $1::timestamptz`, [new Date(t.getTime() - RETENCAO_DIAS * 86_400_000).toISOString()])).rowCount || 0;
    const orfaos = deps.sqlOrfaos ? ((await deps.consultar(deps.sqlOrfaos)).rowCount || 0) : 0;
    const online = Number((await deps.consultar(`SELECT count(*)::int AS n FROM ${tabela} WHERE ultima_em >= $1::timestamptz`, [new Date(t.getTime() - ONLINE_ATE_SEG * 1000).toISOString()])).rows[0]?.n || 0);
    const ativos = Number((await deps.consultar(`SELECT count(*)::int AS n FROM ${tabela} WHERE ultima_em >= $1::timestamptz`, [new Date(t.getTime() - ATIVO_ATE_SEG * 1000).toISOString()])).rows[0]?.n || 0);
    return { online, ativos, apagados, orfaos };
  }

  return { garantirTabela, registrarSinal, sinaisLocais, sinaisDosOutros, painel, conferir };
}
