// Cifra EM REPOUSO do registro do sistema anterior no Contábil (pedido do dono, 27/11/2026): contabil_sistema_anterior (cada bloco do que
// veio do backup, inclusive o resumo da migração) passa a ficar cifrado no banco, como a folha do sistema anterior no DP.
//
//  • Cifra: AES-256-GCM, IV de 12 bytes por linha, AAD = "cnpj:contabil-registro:bloco" (um bloco não pode ser trocado por outro).
//  • Chave: a MESMA chave mestra que o Contábil já usa para dados sensíveis — MURADE_BACKUP_MASTER_KEY (backups dos escritórios, arquivo
//    morto e código de segurança de 2 etapas). Nada novo para o dono configurar. A chave de uso é derivada (HMAC-SHA256 com rótulo próprio).
//  • Fica aberto só o bloco das decisões do contador (__decisoes: é do Murad, não do backup) e as colunas de controle (bloco, quantidade,
//    data da migração).
//  • Sem chave (ou com as colunas ainda não criadas porque o ddlProtegido adiou o esquema): grava aberto, como antes.
//  • Leitura COMPATÍVEL (aberto ou cifrado) até o robô terminar de cifrar o que já estava gravado (migrarCifraSistemaAnteriorContabil).
import crypto from 'node:crypto';
import { lerChaveMestra } from '../segurancaLogin';

export type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface CifraRegistro {
  cifrar: (cnpj: string, id: string, valor: unknown) => { ciphertext: Buffer; iv: Buffer; tag: Buffer };
  decifrar: (cnpj: string, id: string, ciphertext: Buffer, iv: Buffer, tag: Buffer) => unknown;
}
export class ErroCifraRegistro extends Error {}

export const TABELA_REGISTRO = 'contabil_sistema_anterior';
/** Blocos que ficam abertos: decisões do contador sobre a análise (dado do Murad, não do backup). */
export const BLOCOS_ABERTOS = new Set(['__decisoes']);
const ROTULO = 'murad-contabil:sistema-anterior:v1';
export const idRegistro = (bloco: string) => `contabil-registro:${bloco}`;

export function criarCifraRegistro(chave: Buffer): CifraRegistro {
  const aad = (cnpj: string, id: string) => Buffer.from(`${String(cnpj).trim()}:${id}`, 'utf8');
  return {
    cifrar(cnpj, id, valor) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
      c.setAAD(aad(cnpj, id));
      const ciphertext = Buffer.concat([c.update(JSON.stringify(valor ?? null), 'utf8'), c.final()]);
      return { ciphertext, iv, tag: c.getAuthTag() };
    },
    decifrar(cnpj, id, ciphertext, iv, tag) {
      const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
      d.setAAD(aad(cnpj, id));
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(ciphertext), d.final()]).toString('utf8'));
    },
  };
}

/** Chave de uso derivada da chave mestra que o Contábil já tem (null = sem chave: grava aberto, como antes). */
export function chaveDoRegistro(env: Record<string, string | undefined> = process.env): Buffer | null {
  const mestra = lerChaveMestra(env.MURADE_BACKUP_MASTER_KEY);
  return mestra ? crypto.createHmac('sha256', mestra).update(ROTULO).digest() : null;
}

let substituta: CifraRegistro | null | undefined;
let emCache: { base: string; cifra: CifraRegistro | null } | null = null;
const colunasOk = new Set<string>();
const ultimaConsulta = new Map<string, number>();
/** Testes: troca a cifra (null = sem chave; undefined = volta a ler do ambiente). */
export function definirCifraRegistroParaTeste(c: CifraRegistro | null | undefined): void { substituta = c; emCache = null; colunasOk.clear(); ultimaConsulta.clear(); }
export function cifraRegistro(): CifraRegistro | null {
  if (substituta !== undefined) return substituta;
  const base = process.env.MURADE_BACKUP_MASTER_KEY ?? '';
  if (emCache?.base !== base) { const k = chaveDoRegistro(); emCache = { base, cifra: k ? criarCifraRegistro(k) : null }; }
  return emCache.cifra;
}

/** Colunas novas (ADD COLUMN sem padrão: só metadado). Passa pelo ddlProtegido do pool; se adiado, a gravação segue aberta. */
export const SQL_COLUNAS_CIFRA = `ALTER TABLE ${TABELA_REGISTRO} ADD COLUMN IF NOT EXISTS cifra bytea, ADD COLUMN IF NOT EXISTS cifra_iv bytea, ADD COLUMN IF NOT EXISTS cifra_tag bytea`;
export async function colunasCifraProntas(q: Q): Promise<boolean> {
  if (colunasOk.has(TABELA_REGISTRO)) return true;
  const agora = Date.now();
  if (ultimaConsulta.has(TABELA_REGISTRO) && ultimaConsulta.get(TABELA_REGISTRO)! > agora - 30_000) return false;
  ultimaConsulta.set(TABELA_REGISTRO, agora);
  try {
    const r = await q(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name=$1 AND column_name = ANY($2::text[])`, [TABELA_REGISTRO, ['cifra', 'cifra_iv', 'cifra_tag']]);
    if (Number(r.rows[0]?.n) === 3) { colunasOk.add(TABELA_REGISTRO); return true; }
  } catch { /* banco de teste sem catálogo: segue aberto */ }
  return false;
}
export async function cifraParaGravar(q: Q): Promise<CifraRegistro | null> {
  const c = cifraRegistro();
  return c && (await colunasCifraProntas(q)) ? c : null;
}

const comoBuffer = (v: any) => (Buffer.isBuffer(v) ? v : Buffer.from(v));
/** Linhas de uma linha de contabil_sistema_anterior (precisa de cnpj, bloco, linhas e, se houver, as colunas da cifra). */
export function linhasDoRegistro(row: any): any {
  if (row && row.cifra !== null && row.cifra !== undefined) {
    const c = cifraRegistro();
    if (!c) throw new ErroCifraRegistro('O registro do sistema anterior está cifrado e o servidor está sem a chave mestra (MURADE_BACKUP_MASTER_KEY). Avise o dono do sistema.');
    try { return c.decifrar(String(row.cnpj).trim(), idRegistro(String(row.bloco)), comoBuffer(row.cifra), comoBuffer(row.cifra_iv), comoBuffer(row.cifra_tag)); }
    catch { throw new ErroCifraRegistro('Não foi possível abrir o registro cifrado do sistema anterior (a chave mestra mudou?). Nada foi alterado.'); }
  }
  return typeof row?.linhas === 'string' ? JSON.parse(row.linhas) : row?.linhas ?? null;
}
/** Blocos de uma empresa, já abertos (SELECT *: as colunas da cifra podem ainda não existir). */
export async function lerBlocos(q: Q, cnpj: string, blocos: string[]): Promise<Record<string, any>> {
  const r = await q(`SELECT * FROM ${TABELA_REGISTRO} WHERE cnpj=$1 AND bloco = ANY($2::text[])`, [cnpj, blocos]);
  const out: Record<string, any> = {};
  for (const x of r.rows) out[String(x.bloco)] = linhasDoRegistro(x);
  return out;
}
/** Grava um bloco (cifrado quando há chave e colunas, menos os blocos abertos; aberto senão). */
export async function inserirBloco(q: Q, c: CifraRegistro | null, l: { cnpj: string; bloco: string; linhas: unknown; quantidade: number; por: string }): Promise<void> {
  if (!c || BLOCOS_ABERTOS.has(l.bloco)) { await q(`INSERT INTO ${TABELA_REGISTRO}(cnpj,bloco,linhas,quantidade,migrado_por) VALUES($1,$2,$3::jsonb,$4,$5)`, [l.cnpj, l.bloco, JSON.stringify(l.linhas), l.quantidade, l.por]); return; }
  const e = c.cifrar(l.cnpj, idRegistro(l.bloco), l.linhas);
  await q(`INSERT INTO ${TABELA_REGISTRO}(cnpj,bloco,linhas,quantidade,migrado_por,cifra,cifra_iv,cifra_tag) VALUES($1,$2,'null'::jsonb,$3,$4,$5,$6,$7)`, [l.cnpj, l.bloco, l.quantidade, l.por, e.ciphertext, e.iv, e.tag]);
}

// ---------------------------------------------------------------------------------------------------- robô: cifrar o que já estava aberto
export interface DepsCifrarAntigos {
  consultar: Q;
  transacao: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
  migracaoGravando: () => boolean | Promise<boolean>;
  cifra?: CifraRegistro | null; lote?: number; tempoMaxMs?: number; agora?: () => number;
}
export interface ResultadoCifrarAntigos { situacao: 'sem_chave' | 'esquema_adiado' | 'migracao_gravando' | 'tempo' | 'terminou'; blocos: number; pulados: number; faltam: number }

/** Cifra os blocos antigos (abertos), UM por transação curta: lock_timeout curto, trava da empresa (a mesma da gravação e do Completar)
 *  sem esperar, ida e volta conferida antes de apagar o aberto, para se a migração começar. Nunca muda o conteúdo. */
export async function migrarCifraSistemaAnteriorContabil(d: DepsCifrarAntigos): Promise<ResultadoCifrarAntigos> {
  const c = d.cifra === undefined ? cifraRegistro() : d.cifra;
  const out: ResultadoCifrarAntigos = { situacao: 'terminou', blocos: 0, pulados: 0, faltam: 0 };
  const abertos = [...BLOCOS_ABERTOS];
  const faltam = async () => { out.faltam = Number((await d.consultar(`SELECT count(*)::int AS n FROM ${TABELA_REGISTRO} WHERE cifra IS NULL AND NOT (bloco = ANY($1::text[]))`, [abertos]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0); };
  if (!c) { out.situacao = 'sem_chave'; return out; }
  if (!(await colunasCifraProntas(d.consultar))) { out.situacao = 'esquema_adiado'; return out; }
  const agora = d.agora ?? Date.now; const ate = agora() + (d.tempoMaxMs ?? 4 * 60_000);
  let ult: [string, string] = ['', ''];
  for (;;) {
    if (await Promise.resolve(d.migracaoGravando())) { out.situacao = 'migracao_gravando'; await faltam(); return out; }
    if (agora() > ate) { out.situacao = 'tempo'; await faltam(); return out; }
    const chaves = (await d.consultar(`SELECT cnpj, bloco FROM ${TABELA_REGISTRO} WHERE cifra IS NULL AND NOT (bloco = ANY($3::text[])) AND (cnpj, bloco) > ($1, $2) ORDER BY cnpj, bloco LIMIT $4`, [ult[0], ult[1], abertos, d.lote ?? 10])).rows;
    if (!chaves.length) break;
    for (const k of chaves) {
      ult = [String(k.cnpj), String(k.bloco)];
      if (await Promise.resolve(d.migracaoGravando())) { out.situacao = 'migracao_gravando'; await faltam(); return out; }
      try {
        const feito = await d.transacao(async (q) => {
          await q(`SET LOCAL lock_timeout = '2s'`); await q(`SET LOCAL statement_timeout = '60s'`);
          if ((await q('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [String(k.cnpj)])).rows[0]?.ok !== true) return false;
          const r = (await q(`SELECT linhas FROM ${TABELA_REGISTRO} WHERE cnpj=$1 AND bloco=$2 AND cifra IS NULL FOR UPDATE`, [k.cnpj, k.bloco])).rows[0];
          if (!r) return true;
          const id = idRegistro(String(k.bloco)); const e = c.cifrar(String(k.cnpj), id, r.linhas);
          if (JSON.stringify(c.decifrar(String(k.cnpj), id, e.ciphertext, e.iv, e.tag)) !== JSON.stringify(r.linhas)) throw new Error('ida e volta da cifra não bateu');
          await q(`UPDATE ${TABELA_REGISTRO} SET linhas='null'::jsonb, cifra=$3, cifra_iv=$4, cifra_tag=$5 WHERE cnpj=$1 AND bloco=$2 AND cifra IS NULL`, [k.cnpj, k.bloco, e.ciphertext, e.iv, e.tag]);
          return true;
        });
        if (feito) out.blocos++; else out.pulados++;
      } catch { out.pulados++; }
    }
  }
  await faltam();
  out.situacao = out.faltam ? 'tempo' : 'terminou';
  return out;
}
export function textoCifrarAntigos(r: ResultadoCifrarAntigos): string {
  if (r.situacao === 'sem_chave') return 'Sem a chave mestra no servidor: o registro do sistema anterior continua gravado como antes (aberto). Nada mudou.';
  if (r.situacao === 'esquema_adiado') return 'As colunas da cifra ainda não foram criadas (alteração de esquema adiada para não travar o sistema); tenta de novo na próxima rodada.';
  return `${r.blocos} bloco(s) do registro do sistema anterior cifrado(s) agora${r.faltam ? `; faltam ${r.faltam}` : '; tudo o que veio do sistema anterior está cifrado'}${r.pulados ? ` (${r.pulados} pulado(s) por empresa em uso; tenta de novo)` : ''}${r.situacao === 'migracao_gravando' ? ' (parou: há migração gravando; continua depois)' : ''}.`;
}
