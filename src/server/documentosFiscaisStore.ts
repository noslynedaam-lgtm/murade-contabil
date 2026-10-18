import { Pool } from "pg";
import { cnpjContabilValido, normalizarCnpjAcesso } from "./authContabil";

let pool: Pool | null | undefined;

function obterPool(): Pool | null {
  if (pool !== undefined) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  pool = connectionString
    ? new Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
        max: 5,
      })
    : null;
  return pool;
}

let inicializacao: Promise<void> | null = null;

export function fiscalStoreConfigurado(): boolean {
  return Boolean(obterPool());
}

export async function verificarEstadoStoreFiscal(cnpjsAutorizados?: string[]): Promise<{ disponivel: boolean; documentosRecebidos: number; ultimoRecebimento: string | null }> {
  const db = obterPool();
  if (!db) return { disponivel: false, documentosRecebidos: 0, ultimoRecebimento: null };
  await inicializar();
  const resultado = await db.query(`
    SELECT COUNT(*)::int AS total, MAX(atualizado_em) AS ultimo_recebimento
    FROM murade_documentos_fiscais_origem
    WHERE $1::text[] IS NULL OR cnpj = ANY($1::text[])
  `, [cnpjsAutorizados ?? null]);
  return {
    disponivel: true,
    documentosRecebidos: Number(resultado.rows[0]?.total) || 0,
    ultimoRecebimento: resultado.rows[0]?.ultimo_recebimento ? new Date(resultado.rows[0].ultimo_recebimento).toISOString() : null,
  };
}

async function inicializar(): Promise<void> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!inicializacao) {
    inicializacao = db.query(`
      CREATE TABLE IF NOT EXISTS murade_documentos_fiscais_origem (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        chave_documento varchar(128) NOT NULL,
        competencia char(7) NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
        tipo varchar(16) NOT NULL CHECK (tipo IN ('Entrada', 'Saída')),
        documento jsonb NOT NULL,
        origem varchar(40) NOT NULL DEFAULT 'Murade Fiscal',
        recebido_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (cnpj, chave_documento)
      )
    `).then(() => db.query(`
      ALTER TABLE murade_documentos_fiscais_origem DROP CONSTRAINT IF EXISTS murade_documentos_fiscais_origem_cnpj_check;
      ALTER TABLE murade_documentos_fiscais_origem DROP CONSTRAINT IF EXISTS murade_documentos_fiscais_origem_cnpj_format_check;
      ALTER TABLE murade_documentos_fiscais_origem ADD CONSTRAINT murade_documentos_fiscais_origem_cnpj_format_check CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');
    `)).then(() => db.query(`
      CREATE INDEX IF NOT EXISTS murade_documentos_fiscais_origem_competencia_idx
      ON murade_documentos_fiscais_origem (cnpj, competencia, tipo)
    `)).then(() => db.query(`
      CREATE TABLE IF NOT EXISTS murade_documentos_fiscais_versoes (
        versao_id bigserial PRIMARY KEY,
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        chave_documento varchar(128) NOT NULL,
        competencia char(7) NOT NULL,
        tipo varchar(16) NOT NULL,
        documento jsonb NOT NULL,
        recebido_em timestamptz NOT NULL,
        arquivado_em timestamptz NOT NULL DEFAULT now()
      )
    `)).then(() => db.query(`
      CREATE INDEX IF NOT EXISTS murade_documentos_fiscais_versoes_empresa_chave_idx
      ON murade_documentos_fiscais_versoes (cnpj, chave_documento, arquivado_em)
    `)).then(() => undefined).catch((error) => {
      inicializacao = null;
      throw error;
    });
  }
  await inicializacao;
}

function obterChave(documento: any): string {
  return String(documento?.chaveAcesso || documento?.id || "").trim();
}

function obterCompetencia(documento: any): string {
  const valor = String(documento?.dataEmissao || "").trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(valor);
  const ano = br?.[3] || iso?.[1];
  const mes = br?.[2] || iso?.[2];
  const dia = br?.[1] || iso?.[3];
  if (!ano || !mes || !dia || Number(mes) < 1 || Number(mes) > 12) return "";
  const dataIso = `${ano}-${mes}-${dia}`;
  const data = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataIso) return "";
  if (iso && valor.includes("T") && Number.isNaN(Date.parse(valor))) return "";
  return `${ano}-${mes}`;
}

export interface ResultadoGravacaoFiscal {
  recebidos: number;
  novos: number;
  atualizados: number;
  inalterados: number;
  entradas: number;
  saidas: number;
}

export class ErroValidacaoDocumentoFiscal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroValidacaoDocumentoFiscal";
  }
}

/** Persists source fiscal documents; it deliberately does not create accounting entries. */
export async function gravarDocumentosFiscais(
  cnpj: string,
  documentos: any[],
): Promise<ResultadoGravacaoFiscal> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new ErroValidacaoDocumentoFiscal("CNPJ inválido.");
  if (!Array.isArray(documentos) || documentos.length < 1 || documentos.length > 200) {
    throw new ErroValidacaoDocumentoFiscal("O lote precisa conter de 1 a 200 documentos.");
  }

  const preparados = documentos.map((documento) => {
    if (!documento || typeof documento !== "object" || Array.isArray(documento)) {
      throw new ErroValidacaoDocumentoFiscal("Documento fiscal inválido; nenhum registro foi gravado.");
    }
    if (normalizarCnpjAcesso(documento.cnpjEmpresa) !== cnpj) {
      throw new ErroValidacaoDocumentoFiscal("O CNPJ do documento não corresponde à empresa do lote; nenhum registro foi gravado.");
    }
    if (documento.tipo !== "Entrada" && documento.tipo !== "Saída") {
      throw new ErroValidacaoDocumentoFiscal("Tipo fiscal inválido; informe Entrada ou Saída.");
    }
    const chave = obterChave(documento);
    const competencia = obterCompetencia(documento);
    if (!chave || chave.length > 128 || !competencia) {
      throw new ErroValidacaoDocumentoFiscal("Documento sem chave/identificador ou competência válida; nenhum registro foi gravado.");
    }
    const serializado = JSON.stringify(documento);
    if (Buffer.byteLength(serializado, "utf8") > 2_000_000) {
      throw new ErroValidacaoDocumentoFiscal("Documento excede o limite de 2 MB.");
    }
    return { chave, competencia, tipo: documento.tipo as "Entrada" | "Saída", serializado };
  });

  if (new Set(preparados.map((item) => item.chave)).size !== preparados.length) {
    throw new ErroValidacaoDocumentoFiscal("O lote contém identificadores duplicados; envie uma única versão de cada documento.");
  }

  await inicializar();
  const client = await db.connect();
  // Keep row-lock order stable across concurrent batches to reduce deadlocks.
  const documentosOrdenados = [...preparados].sort((a, b) => a.chave.localeCompare(b.chave));
  let novos = 0;
  let atualizados = 0;
  let inalterados = 0;
  try {
    await client.query("BEGIN");
    for (const item of documentosOrdenados) {
      let existente = await client.query(`
        SELECT competencia, tipo, documento, recebido_em
        FROM murade_documentos_fiscais_origem
        WHERE cnpj = $1 AND chave_documento = $2
        FOR UPDATE
      `, [cnpj, item.chave]);
      if (!existente.rowCount) {
        const insercao = await client.query(`
          INSERT INTO murade_documentos_fiscais_origem
            (cnpj, chave_documento, competencia, tipo, documento)
          VALUES ($1, $2, $3, $4, $5::jsonb)
          ON CONFLICT (cnpj, chave_documento) DO NOTHING
          RETURNING chave_documento
        `, [cnpj, item.chave, item.competencia, item.tipo, item.serializado]);
        if (insercao.rowCount) {
          novos += 1;
          continue;
        }
        // Another request may have inserted the key while this transaction waited.
        existente = await client.query(`
          SELECT competencia, tipo, documento, recebido_em
          FROM murade_documentos_fiscais_origem
          WHERE cnpj = $1 AND chave_documento = $2
          FOR UPDATE
        `, [cnpj, item.chave]);
      }
      const row = existente.rows[0];
      if (!row) throw new Error("Não foi possível reler o documento fiscal concorrente.");
      const igualdade = await client.query(`
        SELECT $1::jsonb = $2::jsonb AS documento_igual
      `, [JSON.stringify(row.documento), item.serializado]);
      const semAlteracao = igualdade.rows[0]?.documento_igual === true && row.competencia === item.competencia && row.tipo === item.tipo;
      if (semAlteracao) {
        inalterados += 1;
        continue;
      }
      await client.query(`
        INSERT INTO murade_documentos_fiscais_versoes
          (cnpj, chave_documento, competencia, tipo, documento, recebido_em)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `, [cnpj, item.chave, row.competencia, row.tipo, JSON.stringify(row.documento), row.recebido_em]);
      await client.query(`
        UPDATE murade_documentos_fiscais_origem
        SET competencia = $3, tipo = $4, documento = $5::jsonb, atualizado_em = now()
        WHERE cnpj = $1 AND chave_documento = $2
      `, [cnpj, item.chave, item.competencia, item.tipo, item.serializado]);
      atualizados += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return {
    recebidos: preparados.length,
    novos,
    atualizados,
    inalterados,
    entradas: preparados.filter((item) => item.tipo === "Entrada").length,
    saidas: preparados.filter((item) => item.tipo === "Saída").length,
  };
}

export async function lerDocumentosFiscais(
  cnpj: string,
  desde: string,
  ate: string,
  limite: number,
): Promise<any[]> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new Error("CNPJ inválido.");
  await inicializar();
  const resultado = await db.query(`
    SELECT documento
    FROM murade_documentos_fiscais_origem
    WHERE cnpj = $1
      AND ($2 = '' OR competencia >= $2)
      AND ($3 = '' OR competencia <= $3)
    ORDER BY competencia DESC, chave_documento DESC
    LIMIT $4
  `, [cnpj, desde, ate, limite]);
  return resultado.rows.map((linha: { documento: unknown }) => linha.documento);
}

export async function lerVersoesDocumentoFiscal(cnpj: string, chave: string, limite: number): Promise<Record<string, unknown>[]> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new Error("CNPJ inválido.");
  if (!chave.trim() || chave.length > 128 || !Number.isInteger(limite) || limite < 1 || limite > 10) throw new Error("Chave ou limite de versões inválido.");
  await inicializar();
  const resultado = await db.query(`
    SELECT versao_id, competencia, tipo, documento, recebido_em, arquivado_em
    FROM murade_documentos_fiscais_versoes
    WHERE cnpj = $1 AND chave_documento = $2
    ORDER BY versao_id DESC
    LIMIT $3
  `, [cnpj, chave, limite]);
  return resultado.rows.map((row) => ({
    versaoId: String(row.versao_id),
    competencia: row.competencia,
    tipo: row.tipo,
    documento: row.documento,
    recebidoEm: new Date(row.recebido_em).toISOString(),
    arquivadoEm: new Date(row.arquivado_em).toISOString(),
  }));
}
