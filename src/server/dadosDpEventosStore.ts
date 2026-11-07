// Eventos de 13º, rescisão e férias confirmados como pagos no Murade DP (não é a folha mensal — fica numa
// tabela própria, separada de murade_folhas_dp_origem, para nunca disputar o mesmo lugar na
// geração de rascunhos: a folha mensal nunca pode falhar e não pode ser afetada por este envio).
// Nunca recebe nome, CPF ou qualquer dado que identifique o funcionário: "referencia" é o ano (13º,
// agregado da empresa) ou um hash estável e não reversível da rescisão (nunca o id do funcionário).
import { cnpjContabilValido, normalizarCnpjAcesso } from "./authContabil";
import { obterPoolDP, ErroValidacaoResumoDP, ErroConflitoResumoDP } from "./dadosDpStore";

export type TipoEventoDP = "decimo" | "rescisao" | "ferias";

const camposMonetariosPorTipo: Record<TipoEventoDP, readonly string[]> = {
  decimo: ["bruto", "descontosINSS", "inssPatronal", "descontosIRRF", "fgts"],
  rescisao: ["bruto", "descontosINSS", "inssPatronal", "descontosIRRF", "fgts", "multaFgts"],
  // Férias: bruto = férias + 1/3 + abono + 1/3 do abono; INSS e IRRF só sobre o que tem incidência; FGTS só sobre férias + 1/3.
  ferias: ["bruto", "descontosINSS", "inssPatronal", "descontosIRRF", "fgts"],
};
// INSS patronal pode não estar apurado (mesma regra do resumo mensal); os demais são obrigatórios.
const camposOpcionaisPorTipo: Record<TipoEventoDP, readonly string[]> = { decimo: ["inssPatronal"], rescisao: ["inssPatronal"], ferias: ["inssPatronal"] };

const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const canonico = (r: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))));

export function normalizarEventoDPContrato(cnpj: string, body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErroValidacaoResumoDP("Envie um objeto de evento agregado.");
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 4000) throw new ErroValidacaoResumoDP("O envio excede 4 KB; envie somente os totais.");
  const envelope = new Set(["versaoContrato", "cnpj", "tipo", "referencia", "competencia", "processamentoId", "calculadoEm", "resumo"]);
  if (Object.keys(body).some((c) => !envelope.has(c))) throw new ErroValidacaoResumoDP("O contrato não aceita dados pessoais ou campos adicionais no envelope.");
  if (body.versaoContrato !== 1) throw new ErroValidacaoResumoDP("Versão do contrato não suportada.");
  if (normalizarCnpjAcesso(body.cnpj) !== cnpj) throw new ErroValidacaoResumoDP("O CNPJ do envio não corresponde à empresa solicitada.");
  if (body.tipo !== "decimo" && body.tipo !== "rescisao" && body.tipo !== "ferias") throw new ErroValidacaoResumoDP("Tipo de evento inválido.");
  const tipo = body.tipo as TipoEventoDP;
  if (typeof body.referencia !== "string" || !/^[0-9a-f]{8,64}$/i.test(body.referencia) || /\d{11}/.test(body.referencia)) {
    throw new ErroValidacaoResumoDP("Referência do evento inválida ou contém dado que parece pessoal.");
  }
  if (typeof body.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.competencia)) throw new ErroValidacaoResumoDP("Competência inválida; use AAAA-MM.");
  if (typeof body.processamentoId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.processamentoId)) {
    throw new ErroValidacaoResumoDP("processamentoId deve ser um UUID.");
  }
  const calculadoEm = typeof body.calculadoEm === "string" ? new Date(body.calculadoEm) : null;
  if (!calculadoEm || Number.isNaN(calculadoEm.getTime())) throw new ErroValidacaoResumoDP("Informe a data ISO do cálculo.");
  const r = body.resumo;
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new ErroValidacaoResumoDP("Resumo agregado ausente.");
  const camposPermitidos = camposMonetariosPorTipo[tipo];
  const opcionais = new Set(camposOpcionaisPorTipo[tipo]);
  if (Object.keys(r).some((c) => !camposPermitidos.includes(c)) || camposPermitidos.some((c) => !Object.prototype.hasOwnProperty.call(r, c))) {
    throw new ErroValidacaoResumoDP(`O resumo de ${tipo} aceita somente: ${camposPermitidos.join(", ")}.`);
  }
  const resumo: Record<string, number | null> = {};
  for (const campo of camposPermitidos) {
    const valor = r[campo];
    if (valor === null && opcionais.has(campo)) { resumo[campo] = null; continue; }
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 999999999999) throw new ErroValidacaoResumoDP(`Valor agregado inválido: ${campo}.`);
    resumo[campo] = arred(valor);
  }
  return {
    tipo, referencia: body.referencia.trim().toLowerCase(), competencia: body.competencia as string,
    processamentoId: (body.processamentoId as string).trim(), calculadoEm: calculadoEm.toISOString(), resumo,
  };
}

let inicializacao: Promise<void> | null = null;
async function inicializar(): Promise<void> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!inicializacao) {
    inicializacao = db.query(`
      CREATE TABLE IF NOT EXISTS murade_eventos_dp_origem (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        tipo varchar(20) NOT NULL,
        referencia varchar(64) NOT NULL,
        competencia char(7) NOT NULL CHECK (competencia ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
        processamento_id varchar(128) NOT NULL,
        calculado_em timestamptz NOT NULL,
        resumo jsonb NOT NULL,
        recebido_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (cnpj, tipo, referencia)
      );
      -- A tabela nasceu só com 13º e rescisão; troca a trava para aceitar também férias (idempotente).
      ALTER TABLE murade_eventos_dp_origem DROP CONSTRAINT IF EXISTS murade_eventos_dp_origem_tipo_check;
      ALTER TABLE murade_eventos_dp_origem ADD CONSTRAINT murade_eventos_dp_origem_tipo_check CHECK (tipo IN ('decimo','rescisao','ferias'));`).then(() => undefined).catch((e) => { inicializacao = null; throw e; });
  }
  await inicializacao;
}

export async function gravarEventoDP(cnpj: string, body: any): Promise<{ novo: boolean }> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new ErroValidacaoResumoDP("CNPJ inválido.");
  const p = normalizarEventoDPContrato(cnpj, body);
  await inicializar();
  const r = await db.query(
    `INSERT INTO murade_eventos_dp_origem (cnpj, tipo, referencia, competencia, processamento_id, calculado_em, resumo)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (cnpj, tipo, referencia) DO UPDATE SET
       competencia = EXCLUDED.competencia, processamento_id = EXCLUDED.processamento_id,
       calculado_em = EXCLUDED.calculado_em, resumo = EXCLUDED.resumo, atualizado_em = now()
     WHERE murade_eventos_dp_origem.processamento_id IS DISTINCT FROM EXCLUDED.processamento_id
     RETURNING (xmax = 0) AS inserido`,
    [cnpj, p.tipo, p.referencia, p.competencia, p.processamentoId, p.calculadoEm, JSON.stringify(p.resumo)],
  );
  if (r.rowCount) return { novo: r.rows[0]?.inserido === true };
  const ex = (await db.query(`SELECT resumo, processamento_id FROM murade_eventos_dp_origem WHERE cnpj=$1 AND tipo=$2 AND referencia=$3`, [cnpj, p.tipo, p.referencia])).rows[0];
  if (!ex) throw new Error("Não foi possível confirmar o evento já recebido.");
  if (String(ex.processamento_id) === p.processamentoId && canonico(ex.resumo) === canonico(p.resumo)) return { novo: false };
  throw new ErroConflitoResumoDP("Este evento já foi recebido com outro processamentoId ou outro resumo.");
}

export type EventoDPLido = { tipo: TipoEventoDP; referencia: string; competencia: string; calculadoEm: string; resumo: Record<string, number | null>; atualizadoEm: string };

export async function lerEventosDP(cnpj: string, tipo?: TipoEventoDP, limite = 200): Promise<EventoDPLido[]> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new Error("CNPJ inválido.");
  await inicializar();
  const r = await db.query(
    `SELECT tipo, referencia, competencia, calculado_em, resumo, atualizado_em FROM murade_eventos_dp_origem
     WHERE cnpj=$1 AND ($2::text IS NULL OR tipo=$2) ORDER BY competencia DESC, atualizado_em DESC LIMIT $3`,
    [cnpj, tipo ?? null, limite],
  );
  return r.rows.map((l) => ({
    tipo: l.tipo, referencia: String(l.referencia), competencia: String(l.competencia).trim(),
    calculadoEm: new Date(l.calculado_em).toISOString(), resumo: l.resumo, atualizadoEm: new Date(l.atualizado_em).toISOString(),
  }));
}
