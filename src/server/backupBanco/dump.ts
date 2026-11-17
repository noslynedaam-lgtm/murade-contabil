// Backup completo do PostgreSQL, gerado em Node e em fluxo (uma tabela por vez, em lotes), sem pg_dump.
//
// Formato (texto, uma linha por registro, antes do gzip e da criptografia):
//   H<TAB>{cabeçalho json}             quem gerou, quando, versão
//   S<TAB>"comando SQL"                estrutura (extensões, esquemas, sequências, tabelas) e, no fim, o que vem depois dos dados
//   T<TAB>{"tabela":"s.t","colunas":[]} começa uma tabela (colunas que recebem dados)
//   D<TAB>s.t<TAB>{linha em json}      um registro, exatamente como o PostgreSQL entrega (to_jsonb), sem perder precisão
//   F<TAB>{rodapé com a contagem por tabela}
//
// A leitura usa UMA transação REPEATABLE READ somente-leitura: o backup é uma foto consistente do banco, não bloqueia
// quem está gravando e nunca altera nenhum dado do sistema.
import type { Client } from 'pg';
import { Readable } from 'node:stream';

export const FORMATO_BACKUP = 'murade-backup-banco/1';
const LOTE_LINHAS = 100;
const ESQUEMAS_USUARIO = `n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`;

export interface ResumoDump { tabelas: Record<string, number>; totalLinhas: number; avisos: string[] }

export const aspas = (s: string) => `"${s.replace(/"/g, '""')}"`;
export const nomeQualificado = (esquema: string, tabela: string) => `${aspas(esquema)}.${aspas(tabela)}`;
const linha = (tipo: string, ...partes: string[]) => Buffer.from(`${tipo}\t${partes.join('\t')}\n`, 'utf8');
const comando = (sql: string) => linha('S', JSON.stringify(sql));

export async function* gerarDump(cliente: Client, resumo: ResumoDump, opcoes: { sistema: string; agora?: Date }): AsyncGenerator<Buffer> {
  await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const versao = (await cliente.query('SHOW server_version')).rows[0]?.server_version;
    yield linha('H', JSON.stringify({ formato: FORMATO_BACKUP, sistema: opcoes.sistema, geradoEm: (opcoes.agora || new Date()).toISOString(), versaoPostgres: versao }));

    // Estrutura que vem antes dos dados.
    for (const e of (await cliente.query(`SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname <> 'plpgsql' ORDER BY 1`)).rows) {
      yield comando(`CREATE EXTENSION IF NOT EXISTS ${aspas(e.extname)} WITH SCHEMA ${aspas(e.nspname)}`);
    }
    const esquemas = (await cliente.query(`SELECT n.nspname FROM pg_namespace n WHERE ${ESQUEMAS_USUARIO} AND n.nspname <> 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=n.oid AND d.deptype='e') ORDER BY 1`)).rows;
    for (const e of esquemas) yield comando(`CREATE SCHEMA IF NOT EXISTS ${aspas(e.nspname)}`);

    const sequencias = (await cliente.query(`
      SELECT s.schemaname, s.sequencename, s.data_type::text AS tipo, s.start_value::text AS inicio, s.min_value::text AS minimo, s.max_value::text AS maximo,
             s.increment_by::text AS passo, s.cycle, s.cache_size::text AS cache, s.last_value::text AS ultimo,
             EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='i') AS identidade,
             (SELECT format('%I.%I', tn.nspname, t.relname) || '|' || a.attname FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
                JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
               WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='a' LIMIT 1) AS dona
        FROM pg_sequences s JOIN pg_namespace n ON n.nspname=s.schemaname
        JOIN pg_class c ON c.relname=s.sequencename AND c.relnamespace=n.oid
       WHERE ${ESQUEMAS_USUARIO} ORDER BY 1,2`)).rows;
    for (const s of sequencias.filter((x) => !x.identidade)) {
      yield comando(`CREATE SEQUENCE IF NOT EXISTS ${nomeQualificado(s.schemaname, s.sequencename)} AS ${s.tipo} INCREMENT BY ${s.passo} MINVALUE ${s.minimo} MAXVALUE ${s.maximo} START WITH ${s.inicio} CACHE ${s.cache}${s.cycle ? ' CYCLE' : ' NO CYCLE'}`);
    }

    const tabelas = (await cliente.query(`
      SELECT c.oid::int8::text AS oid, n.nspname AS esquema, c.relname AS tabela
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND ${ESQUEMAS_USUARIO}
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
       ORDER BY 2,3`)).rows;
    const colunasInseriveis = new Map<string, string[]>();
    for (const t of tabelas) {
      const cols = (await cliente.query(`
        SELECT a.attname AS nome, format_type(a.atttypid, a.atttypmod) AS tipo, a.attnotnull AS obrigatoria, pg_get_expr(d.adbin, d.adrelid) AS padrao,
               a.attidentity AS identidade, a.attgenerated AS gerada
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid])).rows;
      const defs = cols.map((c) => {
        let d = `${aspas(c.nome)} ${c.tipo}`;
        if (c.gerada === 's') d += ` GENERATED ALWAYS AS (${c.padrao}) STORED`;
        else {
          if (c.identidade === 'a') d += ' GENERATED ALWAYS AS IDENTITY';
          else if (c.identidade === 'd') d += ' GENERATED BY DEFAULT AS IDENTITY';
          else if (c.padrao != null) d += ` DEFAULT ${c.padrao}`;
        }
        if (c.obrigatoria) d += ' NOT NULL';
        return d;
      });
      yield comando(`CREATE TABLE ${nomeQualificado(t.esquema, t.tabela)} (\n  ${defs.join(',\n  ')}\n)`);
      colunasInseriveis.set(t.oid, cols.filter((c) => c.gerada !== 's').map((c) => c.nome));
    }

    // Dados, tabela por tabela, em lotes pequenos (a memória do servidor é limitada).
    for (const t of tabelas) {
      const nome = `${t.esquema}.${t.tabela}`;
      yield linha('T', JSON.stringify({ tabela: nome, colunas: colunasInseriveis.get(t.oid) }));
      let contagem = 0;
      await cliente.query(`DECLARE cursor_backup NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS j FROM ${nomeQualificado(t.esquema, t.tabela)} AS t`);
      try {
        for (;;) {
          const r = await cliente.query({ text: `FETCH FORWARD ${LOTE_LINHAS} FROM cursor_backup`, rowMode: 'array' });
          if (!r.rows.length) break;
          const buffers: Buffer[] = [];
          for (const [j] of r.rows) buffers.push(Buffer.from(`D\t${nome}\t${j}\n`, 'utf8'));
          contagem += r.rows.length;
          yield Buffer.concat(buffers);
        }
      } finally {
        await cliente.query('CLOSE cursor_backup').catch(() => undefined);
      }
      resumo.tabelas[nome] = contagem;
      resumo.totalLinhas += contagem;
    }

    // O que vem depois dos dados: restrições (chaves estrangeiras por último), índices, funções, gatilhos, sequências.
    const restricoes = (await cliente.query(`
      SELECT n.nspname AS esquema, t.relname AS tabela, c.conname AS nome, c.contype AS tipo, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE ${ESQUEMAS_USUARIO} AND c.contype IN ('p','u','c','x','f') AND c.conparentid=0 AND t.relkind IN ('r','p') AND NOT t.relispartition
       ORDER BY (c.contype='f'), 1,2,3`)).rows;
    for (const c of restricoes) yield comando(`ALTER TABLE ONLY ${nomeQualificado(c.esquema, c.tabela)} ADD CONSTRAINT ${aspas(c.nome)} ${c.def}`);
    const indices = (await cliente.query(`
      SELECT pg_get_indexdef(i.indexrelid) AS def
        FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE ${ESQUEMAS_USUARIO} AND t.relkind IN ('r','p') AND NOT t.relispartition AND i.indisvalid
         AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid)
       ORDER BY 1`)).rows;
    for (const i of indices) yield comando(i.def);
    const funcoes = (await cliente.query(`
      SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE ${ESQUEMAS_USUARIO} AND p.prokind='f' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY p.oid`)).rows;
    for (const f of funcoes) yield comando(f.def);
    const gatilhos = (await cliente.query(`
      SELECT pg_get_triggerdef(g.oid) AS def FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE NOT g.tgisinternal AND ${ESQUEMAS_USUARIO} ORDER BY g.oid`)).rows;
    for (const g of gatilhos) yield comando(g.def);
    for (const s of sequencias) {
      if (s.dona) { const [tab, col] = String(s.dona).split('|'); yield comando(`ALTER SEQUENCE ${nomeQualificado(s.schemaname, s.sequencename)} OWNED BY ${tab}.${aspas(col)}`); }
      if (s.ultimo != null) yield comando(`SELECT pg_catalog.setval('${nomeQualificado(s.schemaname, s.sequencename).replace(/'/g, "''")}', ${s.ultimo}, true)`);
    }

    // O que este formato ainda não carrega: avisa em vez de fingir que cobriu.
    const extras = (await cliente.query(`SELECT c.relkind AS tipo, count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${ESQUEMAS_USUARIO} AND (c.relkind IN ('v','m') OR (c.relkind='r' AND c.relispartition)) GROUP BY 1`)).rows;
    for (const x of extras) resumo.avisos.push(x.tipo === 'r' ? `${x.n} partição(ões) de tabela (os dados vêm pela tabela principal; a regra de partição não é recriada)` : `${x.n} ${x.tipo === 'v' ? 'view(s)' : 'view(s) materializada(s)'} não incluída(s) (só a estrutura; os dados das tabelas estão completos)`);
    yield linha('F', JSON.stringify({ tabelas: resumo.tabelas, totalLinhas: resumo.totalLinhas, avisos: resumo.avisos }));
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Leitura (validação e restauração)

/** Quebra um fluxo de bytes em linhas (Buffer sem o \n), aceitando linhas muito grandes. */
export async function* linhasDoFluxo(fluxo: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  let resto: Buffer = Buffer.alloc(0);
  for await (const pedaco of fluxo) {
    resto = resto.length ? Buffer.concat([resto, typeof pedaco === 'string' ? Buffer.from(pedaco) : pedaco]) : (typeof pedaco === 'string' ? Buffer.from(pedaco) : pedaco);
    let ini = 0;
    for (;;) {
      const fim = resto.indexOf(10, ini);
      if (fim < 0) break;
      yield resto.toString('utf8', ini, fim);
      ini = fim + 1;
    }
    resto = ini ? Buffer.from(resto.subarray(ini)) : resto;
  }
  if (resto.length) yield resto.toString('utf8');
}

export interface AnaliseDump {
  cabecalho: any | null; rodape: any | null; contagem: Record<string, number>; totalLinhas: number; comandos: number; problemas: string[];
}

/** Lê o backup já decifrado e descomprimido só para conferir: conta as linhas de cada tabela e compara com o rodapé. Não toca em banco algum. */
export async function analisarDump(fluxo: AsyncIterable<Buffer | string>): Promise<AnaliseDump> {
  const a: AnaliseDump = { cabecalho: null, rodape: null, contagem: {}, totalLinhas: 0, comandos: 0, problemas: [] };
  for await (const l of linhasDoFluxo(fluxo)) {
    const t = l.indexOf('\t');
    const tipo = t < 0 ? l : l.slice(0, t);
    if (tipo === 'D') {
      const t2 = l.indexOf('\t', t + 1);
      const nome = l.slice(t + 1, t2);
      a.contagem[nome] = (a.contagem[nome] || 0) + 1; a.totalLinhas += 1;
    } else if (tipo === 'S') a.comandos += 1;
    else if (tipo === 'H') { try { a.cabecalho = JSON.parse(l.slice(t + 1)); } catch { a.problemas.push('Cabeçalho do backup ilegível.'); } }
    else if (tipo === 'F') { try { a.rodape = JSON.parse(l.slice(t + 1)); } catch { a.problemas.push('Rodapé do backup ilegível.'); } }
  }
  if (!a.cabecalho) a.problemas.push('O backup não tem cabeçalho.');
  if (a.cabecalho && a.cabecalho.formato !== FORMATO_BACKUP) a.problemas.push(`Formato desconhecido: ${a.cabecalho.formato}.`);
  if (!a.rodape) a.problemas.push('O backup não tem rodapé (arquivo incompleto).');
  else {
    const esperado: Record<string, number> = a.rodape.tabelas || {};
    for (const [nome, n] of Object.entries(esperado)) if ((a.contagem[nome] || 0) !== n) a.problemas.push(`Tabela ${nome}: o rodapé diz ${n} linha(s) e o arquivo tem ${a.contagem[nome] || 0}.`);
    for (const nome of Object.keys(a.contagem)) if (!(nome in esperado)) a.problemas.push(`Tabela ${nome} tem linhas mas não consta no rodapé.`);
    if (a.rodape.totalLinhas !== a.totalLinhas) a.problemas.push(`Total de linhas: o rodapé diz ${a.rodape.totalLinhas} e o arquivo tem ${a.totalLinhas}.`);
  }
  return a;
}

/** Quantidade de objetos de usuário no banco (para saber se está vazio antes de restaurar). */
export async function contarObjetosDeUsuario(cliente: Client): Promise<number> {
  const r = await cliente.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${ESQUEMAS_USUARIO} AND c.relkind IN ('r','p','v','m','S','f')`);
  return Number(r.rows[0]?.n || 0);
}

/** Restaura num banco NOVO E VAZIO (a checagem é de quem chama). Tudo numa transação: se algo falhar, o banco continua vazio. */
export async function restaurarDump(cliente: Client, fluxo: AsyncIterable<Buffer | string>, aoProgredir?: (tabela: string, linhas: number) => void): Promise<{ tabelas: Record<string, number>; totalLinhas: number }> {
  const inseridas: Record<string, number> = {};
  let rodape: any = null;
  let atual: { nome: string; colunas: string[]; sql: string } | null = null;
  let lote: string[] = [];
  let loteTam = 0;
  const descarregar = async () => {
    if (!atual || !lote.length) return;
    await cliente.query(atual.sql, [`[${lote.join(',')}]`]);
    inseridas[atual.nome] = (inseridas[atual.nome] || 0) + lote.length;
    aoProgredir?.(atual.nome, inseridas[atual.nome]);
    lote = []; loteTam = 0;
  };
  await cliente.query('BEGIN');
  try {
    for await (const l of linhasDoFluxo(fluxo)) {
      const t = l.indexOf('\t');
      const tipo = t < 0 ? l : l.slice(0, t);
      if (tipo === 'S') { await descarregar(); await cliente.query(JSON.parse(l.slice(t + 1))); }
      else if (tipo === 'T') {
        await descarregar();
        const m = JSON.parse(l.slice(t + 1)) as { tabela: string; colunas: string[] };
        const [esq, ...resto] = m.tabela.split('.'); const nome = nomeQualificado(esq, resto.join('.'));
        const cols = m.colunas.map(aspas).join(', ');
        atual = { nome: m.tabela, colunas: m.colunas, sql: `INSERT INTO ${nome} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${cols} FROM jsonb_populate_recordset(NULL::${nome}, $1::jsonb)` };
        inseridas[m.tabela] = 0;
      } else if (tipo === 'D') {
        const t2 = l.indexOf('\t', t + 1);
        lote.push(l.slice(t2 + 1)); loteTam += l.length;
        if (lote.length >= 200 || loteTam > 4 * 1024 * 1024) await descarregar();
      } else if (tipo === 'F') { await descarregar(); rodape = JSON.parse(l.slice(t + 1)); }
    }
    await descarregar();
    if (!rodape) throw new Error('O backup não tem rodapé: o arquivo está incompleto. Nada foi restaurado.');
    for (const [nome, n] of Object.entries(rodape.tabelas as Record<string, number>)) {
      if ((inseridas[nome] || 0) !== n) throw new Error(`Tabela ${nome}: esperava ${n} linha(s) e restaurei ${inseridas[nome] || 0}. Nada foi restaurado.`);
    }
    await cliente.query('COMMIT');
    return { tabelas: inseridas, totalLinhas: Object.values(inseridas).reduce((a, b) => a + b, 0) };
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw erro;
  }
}

export function fluxoDeLinhas(linhas: string[]): Readable { return Readable.from(linhas.map((l) => Buffer.from(l + '\n'))); }
