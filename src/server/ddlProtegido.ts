// DDL de subida que nunca trava o sistema (pedido do dono, 27/11/2026: o deploy falhou porque um CREATE INDEX / ALTER TABLE da
// subida ficou esperando o lock de uma transação longa da migração, e atrás dele ficaram presas até as consultas do login).
//
// Como funciona (vale para TODA criação/alteração de esquema que passa pelo pool, na subida ou depois):
//  1. Antes de rodar, confere no catálogo se o objeto já existe (índice, tabela, colunas do ADD COLUMN IF NOT EXISTS). Se já
//     existe, nem executa: não pede lock nenhum. É o caso de quase toda subida.
//  2. O que precisa rodar roda numa conexão própria com `lock_timeout` (3 s) e `statement_timeout` (60 s). Se não conseguir o
//     lock a tempo, desiste na hora (sem enfileirar ninguém atrás dele), registra no log e agenda nova tentativa.
//  3. CREATE/ALTER/COMMENT "pulados" devolvem resultado vazio (o servidor segue e abre a porta); DROP nunca é pulado: devolve o erro.
// Nunca muda o que o comando faz: só quando e com quanto tempo de espera ele roda.
import type { Pool, PoolClient } from 'pg';

export interface OpcoesDdl { lockMs?: number; statementMs?: number; repetirMs?: number; log?: (texto: string) => void }
interface Pendente { sql: string; valores?: unknown[]; tentativas: number; proximaEm: number; motivo: string; statementMs: number; nome: string; pool: Pool; consultar: Consulta; opcoes: OpcoesDdl }

const numeroEnv = (n: string, padrao: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : padrao; };
const LOCK_PADRAO = () => numeroEnv('MURADE_DDL_LOCK_TIMEOUT_MS', 3000);
const STATEMENT_PADRAO = () => numeroEnv('MURADE_DDL_STATEMENT_TIMEOUT_MS', 60_000);
/** Erros de "não consegui o lock a tempo" (55P03) e "passou do tempo" (57014). */
export const ehTempoEsgotado = (e: any) => e?.code === '55P03' || e?.code === '57014';

const pendentes = new Map<string, Pendente>();
let relogio: NodeJS.Timeout | null = null;
let ultimoAplicado: { sql: string; em: string } | null = null;

/** Remove comentários do começo e devolve o comando em maiúsculas para classificar. */
function inicio(sql: string): string { return sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/g, '').slice(0, 400).toUpperCase(); }
export function ehDdl(sql: unknown): boolean { return typeof sql === 'string' && /^(CREATE|ALTER|DROP|COMMENT\s+ON)\b/.test(inicio(sql)); }
/** Pode ser pulado e tentado de novo depois (criação/alteração idempotente de esquema). DROP nunca. */
export function ehPulavel(sql: string): boolean { return /^(CREATE|ALTER|COMMENT\s+ON)\b/.test(inicio(sql)); }

/** Separa os comandos de um texto SQL (respeita aspas, aspas duplas, $$…$$ e comentários). */
export function separarComandos(sql: string): string[] {
  const out: string[] = []; let atual = ''; let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') { const fim = sql.indexOf(c, i + 1); const j = fim === -1 ? sql.length : fim + 1; atual += sql.slice(i, j); i = j; continue; }
    if (c === '-' && sql[i + 1] === '-') { const fim = sql.indexOf('\n', i); const j = fim === -1 ? sql.length : fim; atual += sql.slice(i, j); i = j; continue; }
    if (c === '/' && sql[i + 1] === '*') { const fim = sql.indexOf('*/', i + 2); const j = fim === -1 ? sql.length : fim + 2; atual += sql.slice(i, j); i = j; continue; }
    if (c === '$') { const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i)); if (m) { const fim = sql.indexOf(m[0], i + m[0].length); const j = fim === -1 ? sql.length : fim + m[0].length; atual += sql.slice(i, j); i = j; continue; } }
    if (c === ';') { if (atual.trim()) out.push(atual.trim()); atual = ''; i++; continue; }
    atual += c; i++;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}
/** Divide por vírgulas de primeiro nível (fora de parênteses e aspas). */
function porVirgula(s: string): string[] {
  const out: string[] = []; let nivel = 0; let atual = ''; let aspa = '';
  for (const c of s) {
    if (aspa) { atual += c; if (c === aspa) aspa = ''; continue; }
    if (c === "'" || c === '"') { aspa = c; atual += c; continue; }
    if (c === '(') nivel++; else if (c === ')') nivel--;
    if (c === ',' && nivel === 0) { out.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}
const IDENT = '(?:[a-z_][a-z0-9_$]*\\.)?[a-z_][a-z0-9_$]*';

type Consulta = (sql: string, valores?: unknown[]) => Promise<{ rows: any[] }>;
/** Confere no catálogo (sem lock nas tabelas) se este comando já está aplicado. Na dúvida, devolve false (roda com proteção). */
export async function jaAplicado(cmd: string, consultar: Consulta): Promise<boolean> {
  const limpo = cmd.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/g, '');
  const existe = async (nome: string) => (await consultar('SELECT to_regclass($1) IS NOT NULL AS ok', [nome])).rows[0]?.ok === true;
  let m = new RegExp(`^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?IF\\s+NOT\\s+EXISTS\\s+(${IDENT})\\s+ON\\s+(?:ONLY\\s+)?(${IDENT})`, 'i').exec(limpo);
  if (m) {
    // Índice sem esquema fica no esquema da tabela: confere com o mesmo esquema dela.
    const esquema = m[2].includes('.') ? `${m[2].split('.')[0]}.` : '';
    return existe(m[1].includes('.') ? m[1] : `${esquema}${m[1]}`);
  }
  m = new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+(${IDENT})\\s*\\(`, 'i').exec(limpo);
  if (m) return existe(m[1]);
  m = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${IDENT})\\s+([\\s\\S]+)$`, 'i').exec(limpo);
  if (m) {
    const clausulas = porVirgula(m[2]);
    const colunas: string[] = [];
    for (const c of clausulas) {
      const a = /^ADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_$]*)\s/i.exec(`${c} `);
      if (!a) return false; // outra alteração (tipo, restrição, padrão): roda com proteção
      colunas.push(a[1].toLowerCase());
    }
    const [esq, tab] = m[1].includes('.') ? m[1].toLowerCase().split('.') : [null, m[1].toLowerCase()];
    const r = await consultar(`SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relname=$1 AND ${esq ? 'n.nspname=$2' : 'n.nspname = ANY(current_schemas(false))'} AND a.attnum>0 AND NOT a.attisdropped`, esq ? [tab, esq] : [tab]);
    const tem = new Set(r.rows.map((x: any) => String(x.attname)));
    return colunas.every((c) => tem.has(c));
  }
  return false;
}

const vazio = (command: string) => ({ command, rowCount: 0, rows: [], fields: [], oid: 0 } as any);

/** Roda um DDL com lock_timeout/statement_timeout numa conexão própria do pool e devolve as configurações ao normal depois. */
async function rodarComLimites(pool: Pool, sql: string, valores: unknown[] | undefined, lockMs: number, statementMs: number): Promise<any> {
  const cliente: PoolClient = await pool.connect();
  let estragou = false;
  try {
    await cliente.query(`SET lock_timeout = ${Math.round(lockMs)}; SET statement_timeout = ${Math.round(statementMs)}`);
    return valores && valores.length ? await cliente.query(sql, valores as any[]) : await cliente.query(sql);
  } finally {
    try { await cliente.query('RESET lock_timeout; RESET statement_timeout'); } catch { estragou = true; }
    cliente.release(estragou ? true : undefined);
  }
}

/** Executa um DDL protegido: pula o que já existe, roda o resto com tempo limite; se o lock não vier, pula e agenda. */
export async function executarDdlProtegido(pool: Pool, consultarSemProtecao: Consulta, sql: string, valores: unknown[] | undefined, nome: string, opcoes: OpcoesDdl = {}): Promise<any> {
  const log = opcoes.log ?? ((t: string) => console.warn(t));
  const comandos = valores && valores.length ? [sql] : separarComandos(sql);
  const faltam: string[] = [];
  for (const c of comandos) {
    let pronto = false;
    if (ehDdl(c)) { try { pronto = await jaAplicado(c, consultarSemProtecao); } catch { pronto = false; } }
    if (!pronto) faltam.push(c);
  }
  if (!faltam.length) return vazio('SKIP');
  const texto = comandos.length === faltam.length ? sql : faltam.join(';\n');
  const statementMs = opcoes.statementMs ?? STATEMENT_PADRAO();
  try {
    const r = await rodarComLimites(pool, texto, valores, opcoes.lockMs ?? LOCK_PADRAO(), statementMs);
    return r;
  } catch (e: any) {
    if (!ehTempoEsgotado(e) || !ehPulavel(sql)) throw e;
    const chave = `${nome}::${texto}`;
    const motivo = e.code === '55P03' ? 'lock ocupado por outra transação' : 'passou do tempo limite';
    if (!pendentes.has(chave)) pendentes.set(chave, { sql: texto, valores, tentativas: 0, proximaEm: Date.now() + (opcoes.repetirMs ?? 60_000), motivo, statementMs, nome, pool, consultar: consultarSemProtecao, opcoes });
    log(`[esquema ${nome}] alteração de esquema adiada (${motivo}); o servidor segue e tenta de novo em 1 minuto: ${resumoSql(texto)}`);
    agendar();
    return vazio('ADIADO');
  }
}

export const resumoSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 140);

function agendar() {
  if (relogio) return;
  relogio = setInterval(() => { void tentarPendentes(); }, 30_000);
  relogio.unref?.();
}

/** Tenta de novo os comandos adiados que já venceram (o relógio chama sozinho a cada 30 s; os testes chamam direto). */
export async function tentarPendentes(agora = Date.now(), nome?: string): Promise<{ aplicados: number; faltam: number }> {
  let aplicados = 0;
  for (const [chave, p] of [...pendentes]) {
    if ((nome && p.nome !== nome) || p.proximaEm > agora) continue;
    const log = p.opcoes.log ?? ((t: string) => console.warn(t));
    try {
      if (!(await jaAplicadoTudo(p.sql, p.consultar))) await rodarComLimites(p.pool, p.sql, p.valores, p.opcoes.lockMs ?? LOCK_PADRAO(), p.statementMs);
      pendentes.delete(chave); aplicados++; ultimoAplicado = { sql: resumoSql(p.sql), em: new Date().toISOString() };
      log(`[esquema ${p.nome}] alteração de esquema adiada foi aplicada agora: ${resumoSql(p.sql)}`);
    } catch (e: any) {
      p.tentativas++;
      // Lock ocupado: tenta a cada minuto. Tempo estourado (comando pesado): espaça e dá mais tempo, sem segurar a tabela a cada minuto.
      const espera = e?.code === '57014' ? Math.min(30 * 60_000, 5 * 60_000 * p.tentativas) : (p.opcoes.repetirMs ?? 60_000);
      if (e?.code === '57014') p.statementMs = Math.min(10 * 60_000, p.statementMs * 2);
      p.proximaEm = agora + espera; p.motivo = ehTempoEsgotado(e) ? (e.code === '55P03' ? 'lock ocupado por outra transação' : 'passou do tempo limite') : String(e?.message || e).slice(0, 120);
      if (p.tentativas % 10 === 1) log(`[esquema ${p.nome}] alteração de esquema ainda adiada (${p.tentativas} tentativa(s), ${p.motivo}): ${resumoSql(p.sql)}`);
    }
  }
  if (!pendentes.size && relogio) { clearInterval(relogio); relogio = null; }
  return { aplicados, faltam: [...pendentes.values()].filter((p) => !nome || p.nome === nome).length };
}
async function jaAplicadoTudo(sql: string, consultar: Consulta): Promise<boolean> {
  const cs = separarComandos(sql);
  for (const c of cs) if (!ehDdl(c) || !(await jaAplicado(c, consultar).catch(() => false))) return false;
  return cs.length > 0;
}

/** Situação para a rotina de publicar e para a manutenção: quantas alterações de esquema estão adiadas. */
export function estadoDdlProtegido(): { adiados: number; exemplos: Array<{ sql: string; tentativas: number; motivo: string }>; ultimoAplicado: { sql: string; em: string } | null } {
  return { adiados: pendentes.size, exemplos: [...pendentes.values()].slice(0, 5).map((p) => ({ sql: resumoSql(p.sql), tentativas: p.tentativas, motivo: p.motivo })), ultimoAplicado };
}
/** Só para testes. */
export function limparPendentesDdl(): void { pendentes.clear(); if (relogio) { clearInterval(relogio); relogio = null; } }

/**
 * Liga a proteção no pool: todo `pool.query(texto)` que for CREATE/ALTER/DROP/COMMENT passa por executarDdlProtegido. Consultas
 * normais (SELECT/INSERT/UPDATE…) e transações (pool.connect) seguem exatamente como antes.
 */
export function protegerDdlNoPool<P extends Pool>(pool: P, nome: string, opcoes: OpcoesDdl = {}): P {
  const p = pool as any;
  if (!p || p.__ddlProtegido) return pool;
  const original = p.query.bind(pool);
  const consultarSemProtecao: Consulta = (sql, valores) => original(sql, valores);
  p.query = function (texto: any, valores?: any, cb?: any) {
    if (typeof valores === 'function' || typeof cb === 'function') return original(texto, valores, cb);
    const sql = typeof texto === 'string' ? texto : texto?.text;
    if (!ehDdl(sql)) return original(texto, valores);
    return executarDdlProtegido(pool, consultarSemProtecao, sql, typeof texto === 'string' ? valores : texto?.values, nome, opcoes);
  };
  p.__ddlProtegido = true;
  return pool;
}
