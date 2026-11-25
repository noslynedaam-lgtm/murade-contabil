import { Pool } from "pg";
import { cnpjContabilValido, normalizarCnpjAcesso } from "./authContabil";

// Apurações de tributo (DIFAL, IRPJ/CSLL, PIS/COFINS do Lucro Presumido) já confirmadas pela
// contadora no Fiscal. Mecanismo de recepção separado de documentosFiscaisStore.ts (que guarda as
// notas em si): aqui não há XML nem nota para reler, só o valor apurado. Gravar aqui nunca cria
// lançamento contábil — isso fica para prepararRascunhosContabeis.ts, só depois que o mapeamento de
// contas desta origem existir no workspace da empresa (ver RevisaoOrigensTab.tsx).

const TRIBUTOS_ACEITOS = new Set([
  "ICMS_DIFAL_ATIVO", "ICMS_DIFAL_CONSUMO", "IRPJ_PRESUMIDO", "CSLL_PRESUMIDO", "PIS_PRESUMIDO", "COFINS_PRESUMIDO",
  // DAS do Simples Nacional (contrato do Fiscal em src/server/dasContabil.ts de lá): provisão e pagamento.
  "DAS_SIMPLES", "DAS_SIMPLES_PAGO",
  // Lucro Real — PIS/COFINS não cumulativos do mês (Lei 10.637/2002 e Lei 10.833/2003): débito sobre a receita e créditos do mês.
  "PIS_NAO_CUMULATIVO", "COFINS_NAO_CUMULATIVA", "PIS_NC_CREDITO", "COFINS_NC_CREDITO",
  // Lucro Real — IRPJ/CSLL apurados no próprio Contábil (lucroRealApuracao.ts) e confirmados pela contadora: provisão do período.
  "IRPJ_REAL", "CSLL_REAL",
  // Pagamento do DARF do Lucro Real (nasce no próprio Contábil, Livros → Apuração do Lucro Real): mesmo tratamento dos DARF do Fiscal.
  "IRPJ_REAL_PAGO", "CSLL_REAL_PAGO",
  // CPRB do mês (desoneração da folha, Lei 12.546/2011, art. 9º-A), calculada no DP com a receita do mês: provisão do tributo.
  "CPRB",
  // Lucro Arbitrado (trimestre marcado no Fiscal: IRPJ/CSLL e PIS/COFINS cumulativos dos meses) e COFINS de 3% da entidade imune/isenta
  // sobre receita que não é da atividade própria (MP 2.158-35/2001, art. 14, X): provisões.
  "IRPJ_ARBITRADO", "CSLL_ARBITRADO", "PIS_ARBITRADO", "COFINS_ARBITRADO", "COFINS_ENTIDADE",
  // ISS municipal apurado no Fiscal pelas NFS-e (src/server/issMunicipal.ts de lá), mês encerrado: provisão do ISS próprio a recolher e do
  // ISS que a empresa reteve como tomadora (LC 116/2003, art. 6º). Referência ISS:<proprio|retido>:<IBGE>:<AAAA-MM>.
  "ISS_PROPRIO", "ISS_RETIDO_TOMADOR",
  // IPI a recolher (apuração do industrial no Fiscal, mês encerrado e sem pendência) e ICMS-ST de outros estados (empresa de Goiás): ST devida
  // na entrada (provisão) e ST a recuperar (ressarcimento/restituição confirmados). Referências IPI:<AAAA-MM> e ICMSST:<entrada|recuperar>:<AAAA-MM>.
  "IPI_A_RECOLHER", "ICMS_ST_ENTRADA", "ICMS_ST_RESSARCIR",
  // Pagamento dos DARF (registrado no Fiscal), como o DAS_SIMPLES_PAGO: principal baixa o "a recolher"; multa e juros à parte.
  "IRPJ_PRESUMIDO_PAGO", "CSLL_PRESUMIDO_PAGO", "PIS_PRESUMIDO_PAGO", "COFINS_PRESUMIDO_PAGO", "PIS_NC_PAGO", "COFINS_NC_PAGO",
  // Parcelamentos cadastrados no Fiscal (Simples, federal ordinário, PERT, transação, ICMS-GO): a consolidação (débitos que saem do
  // "a recolher" e vão para "parcelamentos a pagar") e cada parcela paga (amortização do principal; juros/encargos à parte).
  // Referências PARC:<id>:adesao e PARC:<id>:parcela:<n>; a data vem na versão de origem ("adesao:AAAA-MM-DD:..." / "pago:AAAA-MM-DD:...").
  "PARCELAMENTO_ADESAO", "PARCELAMENTO_PARCELA_PAGA",
]);

// Do Fisco IA (rota própria POST /api/integracao/fiscoia/apuracoes): o que a pessoa consultou POR CLIQUE no Integra Contador e o Fisco IA
// leu da resposta oficial — guia do DAS do MEI (principal e multa/juros), débito em dívida ativa e parcelamentos (consolidação e parcelas
// pagas pelo demonstrativo da Receita). Referências FIA:...; a data vem na versão de origem ("data:AAAA-MM-DD:..."). O Fisco IA nunca manda
// tributo do Fiscal, e o Fiscal nunca manda FIA_*.
export const TRIBUTOS_FISCOIA = new Set(["FIA_DEBITO", "FIA_MULTA_JUROS", "FIA_DIVIDA_ATIVA", "FIA_PARC_CONSOLIDACAO", "FIA_PARC_PARCELA_PAGA"]);

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

export function apuracoesStoreConfigurado(): boolean {
  return Boolean(obterPool());
}

let inicializacao: Promise<void> | null = null;
async function inicializar(): Promise<void> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murad Contábil.");
  if (!inicializacao) {
    inicializacao = db.query(`
      CREATE TABLE IF NOT EXISTS murade_apuracoes_fiscais_origem (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        tributo varchar(32) NOT NULL,
        competencia char(7) NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
        referencia_origem varchar(160) NOT NULL,
        valor_centavos bigint NOT NULL,
        base_centavos bigint,
        situacao varchar(16) NOT NULL,
        versao_origem varchar(64) NOT NULL,
        origem varchar(40) NOT NULL DEFAULT 'Murad Fiscal',
        recebido_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (cnpj, tributo, competencia, referencia_origem)
      )
    `).then(() => db.query(`
      CREATE INDEX IF NOT EXISTS murade_apuracoes_fiscais_origem_competencia_idx
      ON murade_apuracoes_fiscais_origem (cnpj, competencia, tributo)
    `)).then(() => undefined).catch((error) => {
      inicializacao = null;
      throw error;
    });
  }
  await inicializacao;
}

export class ErroValidacaoApuracaoFiscal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroValidacaoApuracaoFiscal";
  }
}

export interface ResultadoGravacaoApuracoes {
  recebidos: number;
  novos: number;
  atualizados: number;
  inalterados: number;
}

/** Persists tax assessments already confirmed by the accountant in Fiscal; never creates journal entries. */
export async function gravarApuracoesFiscais(cnpj: string, apuracoes: any[], sistema: "fiscal" | "fiscoia" = "fiscal"): Promise<ResultadoGravacaoApuracoes> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murad Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new ErroValidacaoApuracaoFiscal("CNPJ inválido.");
  if (!Array.isArray(apuracoes) || apuracoes.length < 1 || apuracoes.length > 200) {
    throw new ErroValidacaoApuracaoFiscal("O lote precisa conter de 1 a 200 apurações.");
  }

  const preparados = apuracoes.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ErroValidacaoApuracaoFiscal("Apuração inválida; nenhum registro foi gravado.");
    }
    const tributo = String(item.tributo || "").trim().toUpperCase();
    if (!(sistema === "fiscoia" ? TRIBUTOS_FISCOIA : TRIBUTOS_ACEITOS).has(tributo)) throw new ErroValidacaoApuracaoFiscal("Tributo não suportado; nenhum registro foi gravado.");
    const competencia = String(item.competencia || "").trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new ErroValidacaoApuracaoFiscal("Competência inválida; use AAAA-MM.");
    const referencia = String(item.referencia || "").trim();
    if (!referencia || referencia.length > 160) throw new ErroValidacaoApuracaoFiscal("Apuração sem referência de origem válida; nenhum registro foi gravado.");
    // Só aceita o que a contadora já confirmou no Fiscal — nunca um cálculo ainda em revisão ou pendente.
    const situacao = String(item.situacao || "").trim().toLowerCase();
    if (situacao !== "confirmado") throw new ErroValidacaoApuracaoFiscal("Só é aceita apuração já confirmada pela contadora no Fiscal.");
    const valorCentavos = Number(item.valorCentavos);
    if (!Number.isInteger(valorCentavos) || valorCentavos < 0) throw new ErroValidacaoApuracaoFiscal("Valor da apuração inválido.");
    const baseCentavos = item.baseCentavos == null ? null : Number(item.baseCentavos);
    if (baseCentavos !== null && (!Number.isInteger(baseCentavos) || baseCentavos < 0)) throw new ErroValidacaoApuracaoFiscal("Base da apuração inválida.");
    const versaoOrigem = String(item.versaoOrigem || "").trim();
    if (!versaoOrigem || versaoOrigem.length > 64) throw new ErroValidacaoApuracaoFiscal("Apuração sem versão de origem válida; nenhum registro foi gravado.");
    return { tributo, competencia, referencia, situacao, valorCentavos, baseCentavos, versaoOrigem };
  });

  if (new Set(preparados.map((item) => `${item.tributo}:${item.competencia}:${item.referencia}`)).size !== preparados.length) {
    throw new ErroValidacaoApuracaoFiscal("O lote contém referências duplicadas; envie uma única versão de cada apuração.");
  }

  await inicializar();
  const client = await db.connect();
  const ordenados = [...preparados].sort((a, b) => `${a.tributo}${a.competencia}${a.referencia}`.localeCompare(`${b.tributo}${b.competencia}${b.referencia}`));
  let novos = 0, atualizados = 0, inalterados = 0;
  try {
    await client.query("BEGIN");
    for (const item of ordenados) {
      const r = await client.query(`
        INSERT INTO murade_apuracoes_fiscais_origem (cnpj, tributo, competencia, referencia_origem, valor_centavos, base_centavos, situacao, versao_origem, origem)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (cnpj, tributo, competencia, referencia_origem) DO UPDATE SET
          valor_centavos=$5, base_centavos=$6, situacao=$7, versao_origem=$8, atualizado_em=now()
        WHERE murade_apuracoes_fiscais_origem.versao_origem <> $8
        RETURNING (xmax = 0) AS inserido
      `, [cnpj, item.tributo, item.competencia, item.referencia, item.valorCentavos, item.baseCentavos, item.situacao, item.versaoOrigem, sistema === "fiscoia" ? "Murad Fisco IA" : "Murad Fiscal"]);
      if (r.rowCount) { if (r.rows[0]?.inserido) novos += 1; else atualizados += 1; }
      else inalterados += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return { recebidos: preparados.length, novos, atualizados, inalterados };
}

export interface ApuracaoFiscalArmazenada {
  cnpj: string;
  tributo: string;
  competencia: string;
  referencia: string;
  valorCentavos: number;
  baseCentavos: number | null;
  situacao: string;
  versaoOrigem: string;
  recebidoEm: string;
  atualizadoEm: string;
}

export async function lerApuracoesFiscais(cnpj: string, desde: string, ate: string, limite: number): Promise<ApuracaoFiscalArmazenada[]> {
  const db = obterPool();
  if (!db) throw new Error("DATABASE_URL não configurada no Murad Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new Error("CNPJ inválido.");
  await inicializar();
  const resultado = await db.query(`
    SELECT cnpj, tributo, competencia, referencia_origem, valor_centavos, base_centavos, situacao, versao_origem, recebido_em, atualizado_em
    FROM murade_apuracoes_fiscais_origem
    WHERE cnpj = $1 AND ($2 = '' OR competencia >= $2) AND ($3 = '' OR competencia <= $3)
    ORDER BY competencia DESC, tributo, referencia_origem
    LIMIT $4
  `, [cnpj, desde, ate, limite]);
  return resultado.rows.map((row) => ({
    cnpj: normalizarCnpjAcesso(row.cnpj), tributo: row.tributo, competencia: row.competencia, referencia: row.referencia_origem,
    valorCentavos: Number(row.valor_centavos), baseCentavos: row.base_centavos === null ? null : Number(row.base_centavos),
    situacao: row.situacao, versaoOrigem: row.versao_origem,
    recebidoEm: new Date(row.recebido_em).toISOString(), atualizadoEm: new Date(row.atualizado_em).toISOString(),
  }));
}

export async function verificarEstadoStoreApuracoes(cnpjsAutorizados?: string[]): Promise<{ disponivel: boolean; apuracoesRecebidas: number; ultimoRecebimento: string | null }> {
  const db = obterPool();
  if (!db) return { disponivel: false, apuracoesRecebidas: 0, ultimoRecebimento: null };
  await inicializar();
  const resultado = await db.query(`
    SELECT COUNT(*)::int AS total, MAX(atualizado_em) AS ultimo_recebimento
    FROM murade_apuracoes_fiscais_origem
    WHERE $1::text[] IS NULL OR cnpj = ANY($1::text[])
  `, [cnpjsAutorizados ?? null]);
  return {
    disponivel: true,
    apuracoesRecebidas: Number(resultado.rows[0]?.total) || 0,
    ultimoRecebimento: resultado.rows[0]?.ultimo_recebimento ? new Date(resultado.rows[0].ultimo_recebimento).toISOString() : null,
  };
}
