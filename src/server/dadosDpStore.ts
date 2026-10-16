import { Pool } from "pg";

let pool: Pool | null | undefined;
let inicializacao: Promise<void> | null = null;

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

export function dpStoreConfigurado(): boolean {
  return Boolean(obterPool());
}

export class ErroValidacaoResumoDP extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroValidacaoResumoDP";
  }
}

const camposMonetarios = [
  "folhaBruta",
  "outrosProventos",
  "descontosINSS",
  "descontosIRRF",
  "descontosOutros",
  "liquidoFolha",
  "fgts",
  "inssPatronal",
  "provisaoFerias",
  "provisao13",
  "encargosOutros",
] as const;

const camposResumoPermitidos = new Set(["quantidadeFuncionarios", ...camposMonetarios]);
const camposAindaNaoApurados = new Set(["provisaoFerias", "provisao13", "encargosOutros"]);

function arredondarCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function normalizarResumoDPContrato(cnpj: string, body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ErroValidacaoResumoDP("Envie um objeto de folha agregada.");
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 16000) {
    throw new ErroValidacaoResumoDP("O lote agregado excede 16 KB; envie somente os totais contábeis permitidos.");
  }
  const camposEnvelopePermitidos = new Set(["versaoContrato", "cnpj", "competencia", "processamentoId", "calculadoEm", "resumo"]);
  if (Object.keys(body).some((campo) => !camposEnvelopePermitidos.has(campo))) {
    throw new ErroValidacaoResumoDP("O contrato não aceita dados pessoais ou campos adicionais no envelope.");
  }
  if (body.versaoContrato !== 1) throw new ErroValidacaoResumoDP("Versão do contrato DP não suportada.");
  if (String(body.cnpj || "").replace(/\D/g, "") !== cnpj) {
    throw new ErroValidacaoResumoDP("O CNPJ do lote não corresponde à empresa solicitada.");
  }
  if (typeof body.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.competencia)) {
    throw new ErroValidacaoResumoDP("Competência inválida; use AAAA-MM.");
  }
  if (typeof body.processamentoId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.processamentoId)) {
    throw new ErroValidacaoResumoDP("processamentoId deve ser um UUID, sem nome ou dado pessoal.");
  }
  const calculadoEm = typeof body.calculadoEm === "string" ? new Date(body.calculadoEm) : null;
  if (!calculadoEm || Number.isNaN(calculadoEm.getTime())) {
    throw new ErroValidacaoResumoDP("Informe a data ISO do cálculo.");
  }
  if (!body.resumo || typeof body.resumo !== "object" || Array.isArray(body.resumo)) {
    throw new ErroValidacaoResumoDP("Resumo contábil agregado ausente.");
  }
  const camposRecebidos = Object.keys(body.resumo);
  if (camposRecebidos.some((campo) => !camposResumoPermitidos.has(campo))) {
    throw new ErroValidacaoResumoDP("O resumo aceita apenas totais agregados; remova nomes, CPF, dados bancários ou outros dados pessoais.");
  }
  if ([...camposResumoPermitidos].some((campo) => !Object.prototype.hasOwnProperty.call(body.resumo, campo))) {
    throw new ErroValidacaoResumoDP("O resumo precisa informar todos os totais do contrato; campos ainda não apurados devem ser null, não zero.");
  }
  if (typeof body.resumo.quantidadeFuncionarios !== "number" || !Number.isInteger(body.resumo.quantidadeFuncionarios) || body.resumo.quantidadeFuncionarios < 0 || body.resumo.quantidadeFuncionarios > 100000) {
    throw new ErroValidacaoResumoDP("Quantidade de funcionários inválida.");
  }

  const resumo: Record<string, number | null> = { quantidadeFuncionarios: body.resumo.quantidadeFuncionarios };
  for (const campo of camposMonetarios) {
    const valor = body.resumo[campo];
    if (valor === null && camposAindaNaoApurados.has(campo)) {
      resumo[campo] = null;
      continue;
    }
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 999999999999) {
      throw new ErroValidacaoResumoDP(`Valor agregado inválido: ${campo}.`);
    }
    resumo[campo] = arredondarCentavos(valor);
  }

  return {
    competencia: body.competencia,
    processamentoId: body.processamentoId.trim(),
    calculadoEm: calculadoEm.toISOString(),
    resumo,
  };
}

async function inicializar(): Promise<void> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!inicializacao) {
    inicializacao = db.query(`
      CREATE TABLE IF NOT EXISTS murade_folhas_dp_origem (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
        competencia char(7) NOT NULL CHECK (competencia ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
        processamento_id varchar(128) NOT NULL,
        calculado_em timestamptz NOT NULL,
        resumo jsonb NOT NULL,
        origem varchar(40) NOT NULL DEFAULT 'Murade Departamento Pessoal',
        recebido_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (cnpj, competencia, processamento_id)
      )
    `).then(() => db.query(`
      CREATE INDEX IF NOT EXISTS murade_folhas_dp_origem_competencia_idx
      ON murade_folhas_dp_origem (cnpj, competencia)
    `)).then(() => undefined).catch((error) => {
      inicializacao = null;
      throw error;
    });
  }
  await inicializacao;
}

export async function verificarEstadoStoreDP(): Promise<{
  disponivel: boolean;
  folhasRecebidas: number;
  ultimoRecebimento: string | null;
}> {
  const db = obterPool();
  if (!db) return { disponivel: false, folhasRecebidas: 0, ultimoRecebimento: null };
  await inicializar();
  const resultado = await db.query(`
    SELECT COUNT(*)::int AS total, MAX(atualizado_em) AS ultimo_recebimento
    FROM murade_folhas_dp_origem
  `);
  return {
    disponivel: true,
    folhasRecebidas: Number(resultado.rows[0]?.total) || 0,
    ultimoRecebimento: resultado.rows[0]?.ultimo_recebimento
      ? new Date(resultado.rows[0].ultimo_recebimento).toISOString()
      : null,
  };
}

export async function gravarResumoDP(cnpj: string, body: any): Promise<{ novo: boolean; registro: Record<string, unknown> }> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!/^\d{14}$/.test(cnpj)) throw new ErroValidacaoResumoDP("CNPJ inválido.");
  const preparado = normalizarResumoDPContrato(cnpj, body);
  await inicializar();
  const resultado = await db.query(`
    INSERT INTO murade_folhas_dp_origem
      (cnpj, competencia, processamento_id, calculado_em, resumo)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (cnpj, competencia, processamento_id) DO UPDATE SET
      calculado_em = EXCLUDED.calculado_em,
      resumo = EXCLUDED.resumo,
      atualizado_em = now()
    RETURNING (xmax = 0) AS inserido, recebido_em, atualizado_em
  `, [cnpj, preparado.competencia, preparado.processamentoId, preparado.calculadoEm, JSON.stringify(preparado.resumo)]);
  return {
    novo: resultado.rows[0]?.inserido === true,
    registro: {
      cnpj,
      competencia: preparado.competencia,
      processamentoId: preparado.processamentoId,
      calculadoEm: preparado.calculadoEm,
      resumo: preparado.resumo,
      recebidoEm: new Date(resultado.rows[0].recebido_em).toISOString(),
      atualizadoEm: new Date(resultado.rows[0].atualizado_em).toISOString(),
    },
  };
}

export async function lerResumosDP(cnpj: string, desde: string, ate: string, limite: number): Promise<Record<string, unknown>[]> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!/^\d{14}$/.test(cnpj)) throw new Error("CNPJ inválido.");
  await inicializar();
  const resultado = await db.query(`
    SELECT competencia, processamento_id, calculado_em, resumo, recebido_em, atualizado_em
    FROM murade_folhas_dp_origem
    WHERE cnpj = $1
      AND ($2 = '' OR competencia >= $2)
      AND ($3 = '' OR competencia <= $3)
    ORDER BY competencia DESC, atualizado_em DESC
    LIMIT $4
  `, [cnpj, desde, ate, limite]);
  return resultado.rows.map((row) => ({
    cnpj,
    competencia: row.competencia,
    processamentoId: row.processamento_id,
    calculadoEm: new Date(row.calculado_em).toISOString(),
    resumo: row.resumo,
    recebidoEm: new Date(row.recebido_em).toISOString(),
    atualizadoEm: new Date(row.atualizado_em).toISOString(),
  }));
}
