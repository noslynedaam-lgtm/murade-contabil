// Resumo do pró-labore dos sócios enviado pelo Murade DP (só totais do mês; nunca nome, CPF ou valor por sócio).
// Vira pré-lançamento no Contábil pelas mesmas contas da folha: despesa com pessoal, salários a pagar, INSS e IRRF a recolher.
import { cnpjContabilValido, normalizarCnpjAcesso } from "./authContabil";
import { obterPoolDP, ErroValidacaoResumoDP, ErroConflitoResumoDP } from "./dadosDpStore";

const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const camposMonetarios = ["proLabore", "inssSocio", "irrfSocio", "liquido"] as const;
const camposResumo = new Set(["quantidadeSocios", ...camposMonetarios]);
const canonico = (r: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))));

export function normalizarResumoProLaboreContrato(cnpj: string, body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErroValidacaoResumoDP("Envie um objeto de pró-labore agregado.");
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 4000) throw new ErroValidacaoResumoDP("O envio excede 4 KB; envie somente os totais.");
  const envelope = new Set(["versaoContrato", "cnpj", "competencia", "processamentoId", "calculadoEm", "resumo"]);
  if (Object.keys(body).some((c) => !envelope.has(c))) throw new ErroValidacaoResumoDP("O contrato não aceita dados pessoais ou campos adicionais no envelope.");
  if (body.versaoContrato !== 1) throw new ErroValidacaoResumoDP("Versão do contrato não suportada.");
  if (normalizarCnpjAcesso(body.cnpj) !== cnpj) throw new ErroValidacaoResumoDP("O CNPJ do envio não corresponde à empresa solicitada.");
  if (typeof body.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.competencia)) throw new ErroValidacaoResumoDP("Competência inválida; use AAAA-MM.");
  if (typeof body.processamentoId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.processamentoId)) throw new ErroValidacaoResumoDP("processamentoId deve ser um UUID.");
  const calculadoEm = typeof body.calculadoEm === "string" ? new Date(body.calculadoEm) : null;
  if (!calculadoEm || Number.isNaN(calculadoEm.getTime())) throw new ErroValidacaoResumoDP("Informe a data ISO do cálculo.");
  const r = body.resumo;
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new ErroValidacaoResumoDP("Resumo agregado ausente.");
  if (Object.keys(r).some((c) => !camposResumo.has(c)) || [...camposResumo].some((c) => !Object.prototype.hasOwnProperty.call(r, c))) throw new ErroValidacaoResumoDP("O resumo aceita somente: quantidadeSocios, proLabore, inssSocio, irrfSocio e liquido.");
  if (!Number.isInteger(r.quantidadeSocios) || r.quantidadeSocios < 1 || r.quantidadeSocios > 100) throw new ErroValidacaoResumoDP("Quantidade de sócios inválida.");
  const resumo: Record<string, number> = { quantidadeSocios: r.quantidadeSocios };
  for (const c of camposMonetarios) {
    if (typeof r[c] !== "number" || !Number.isFinite(r[c]) || r[c] < 0 || r[c] > 999999999999) throw new ErroValidacaoResumoDP(`Valor agregado inválido: ${c}.`);
    resumo[c] = arred(r[c]);
  }
  if (Math.abs(arred(resumo.proLabore - resumo.inssSocio - resumo.irrfSocio) - resumo.liquido) > 0.01) throw new ErroValidacaoResumoDP("O líquido não confere com pró-labore menos INSS e IRRF.");
  return { competencia: body.competencia as string, processamentoId: (body.processamentoId as string).trim(), calculadoEm: calculadoEm.toISOString(), resumo };
}

let inicializacao: Promise<void> | null = null;
async function inicializar(): Promise<void> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!inicializacao) {
    inicializacao = db.query(`
      CREATE TABLE IF NOT EXISTS murade_prolabore_dp_origem (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        competencia char(7) NOT NULL CHECK (competencia ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
        processamento_id varchar(128) NOT NULL,
        calculado_em timestamptz NOT NULL,
        resumo jsonb NOT NULL,
        recebido_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (cnpj, competencia, processamento_id)
      )`).then(() => undefined).catch((e) => { inicializacao = null; throw e; });
  }
  await inicializacao;
}

export async function gravarResumoProLaboreDP(cnpj: string, body: any): Promise<{ novo: boolean }> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new ErroValidacaoResumoDP("CNPJ inválido.");
  const p = normalizarResumoProLaboreContrato(cnpj, body);
  await inicializar();
  const r = await db.query(
    `INSERT INTO murade_prolabore_dp_origem (cnpj, competencia, processamento_id, calculado_em, resumo) VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (cnpj, competencia, processamento_id) DO NOTHING RETURNING 1`, [cnpj, p.competencia, p.processamentoId, p.calculadoEm, JSON.stringify(p.resumo)]);
  if (r.rowCount) return { novo: true };
  const ex = (await db.query(`SELECT resumo FROM murade_prolabore_dp_origem WHERE cnpj=$1 AND competencia=$2 AND processamento_id=$3`, [cnpj, p.competencia, p.processamentoId])).rows[0];
  if (!ex || canonico(ex.resumo) !== canonico(p.resumo)) throw new ErroConflitoResumoDP("Este processamentoId já foi recebido com outro resumo. Gere um novo UUID.");
  return { novo: false };
}

/** Último resumo recebido de cada competência. */
export async function lerResumosProLaboreDP(cnpj: string, limite = 200): Promise<Array<{ competencia: string; calculadoEm: string; resumo: Record<string, number> }>> {
  const db = obterPoolDP();
  if (!db) throw new Error("DATABASE_URL não configurada no Murade Contábil.");
  if (!cnpjContabilValido(cnpj)) throw new Error("CNPJ inválido.");
  await inicializar();
  const r = await db.query(`SELECT competencia, calculado_em, resumo FROM murade_prolabore_dp_origem WHERE cnpj=$1 ORDER BY competencia DESC, calculado_em DESC LIMIT $2`, [cnpj, limite]);
  const vistos = new Set<string>();
  return r.rows.filter((l) => { const c = String(l.competencia).trim(); if (vistos.has(c)) return false; vistos.add(c); return true; })
    .map((l) => ({ competencia: String(l.competencia).trim(), calculadoEm: new Date(l.calculado_em).toISOString(), resumo: l.resumo }));
}
