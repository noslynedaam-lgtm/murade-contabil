// Extrato bancário guardado no banco (antes ficava só na tela): cada movimento importado (OFX, CSV ou Excel) e o que foi
// conciliado ou lançado. Separado por empresa (CNPJ) e conta do banco no plano; quem chama confere o acesso da sessão.
// O robô da conciliação só grava SUGESTÕES aqui; conciliar e lançar é sempre uma pessoa (ou a Agente com confirmação).
import type { MovimentoExtrato } from "../utils/extratoBancario";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export type SituacaoMovimento = "pendente" | "conciliado" | "lancado";
export interface MovimentoGuardado extends MovimentoExtrato {
  contaBanco: string;
  situacao: SituacaoMovimento;
  lancamentoId: string | null;
  sugestaoConta: string | null;
  sugestaoLancamentoId: string | null;
  sugestaoMotivo: string | null;
  importadoEm: string;
  importadoPor: string | null;
  conciliadoEm: string | null;
  conciliadoPor: string | null;
  arquivo: string | null;
}

let preparado: Promise<void> | null = null;
export function prepararTabelaExtrato(consultar: Consultar): Promise<void> {
  if (!preparado) {
    preparado = consultar(`
      CREATE TABLE IF NOT EXISTS contabil_extrato_movimentos (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        conta_banco varchar(64) NOT NULL,
        fitid varchar(160) NOT NULL,
        data date NOT NULL,
        valor_centavos bigint NOT NULL CHECK (valor_centavos <> 0),
        memo varchar(240) NOT NULL DEFAULT '',
        arquivo varchar(160),
        importado_em timestamptz NOT NULL DEFAULT now(),
        importado_por text,
        situacao varchar(12) NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','conciliado','lancado')),
        lancamento_id text,
        sugestao_conta varchar(64),
        sugestao_lancamento_id text,
        sugestao_motivo varchar(240),
        conciliado_em timestamptz,
        conciliado_por text,
        PRIMARY KEY (cnpj, conta_banco, fitid)
      )
    `).then(() => consultar("CREATE INDEX IF NOT EXISTS contabil_extrato_movimentos_mes_idx ON contabil_extrato_movimentos (cnpj, conta_banco, data)"))
      .then(() => undefined).catch((erro) => { preparado = null; throw erro; });
  }
  return preparado;
}
/** Só para testes. */
export const reiniciarPreparoExtratoParaTeste = () => { preparado = null; };

const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
export class ErroExtrato extends Error { constructor(public status: number, m: string) { super(m); this.name = "ErroExtrato"; } }

/** Valida o lote vindo da tela (o arquivo é lido no navegador). Recusa o lote inteiro se algo vier errado. */
export function validarMovimentosRecebidos(movimentos: unknown): MovimentoExtrato[] {
  if (!Array.isArray(movimentos) || movimentos.length < 1 || movimentos.length > 5000) throw new ErroExtrato(400, "Envie de 1 a 5.000 movimentos do extrato.");
  const vistos = new Set<string>();
  return movimentos.map((m: any, i) => {
    const fitid = String(m?.fitid || "").trim();
    const dataISO = String(m?.dataISO || "");
    const valor = Number(m?.valorCentavos);
    if (!fitid || fitid.length > 160) throw new ErroExtrato(422, `Movimento ${i + 1}: identificador inválido.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO) || !Number.isFinite(Date.parse(`${dataISO}T00:00:00Z`)) || new Date(`${dataISO}T00:00:00Z`).toISOString().slice(0, 10) !== dataISO) throw new ErroExtrato(422, `Movimento ${i + 1}: data inválida.`);
    if (!Number.isSafeInteger(valor) || valor === 0) throw new ErroExtrato(422, `Movimento ${i + 1}: valor inválido.`);
    if (vistos.has(fitid)) throw new ErroExtrato(422, `Movimento ${i + 1}: identificador repetido no lote.`);
    vistos.add(fitid);
    return { fitid, dataISO, valorCentavos: valor, memo: String(m?.memo || "").slice(0, 240) };
  });
}

export async function gravarMovimentosExtrato(consultar: Consultar, cnpj: string, contaBanco: string, movimentos: MovimentoExtrato[], quem: string, arquivo?: string): Promise<{ recebidos: number; novos: number; jaExistiam: number }> {
  await prepararTabelaExtrato(consultar);
  let novos = 0;
  for (const m of movimentos) {
    const r = await consultar(`
      INSERT INTO contabil_extrato_movimentos (cnpj, conta_banco, fitid, data, valor_centavos, memo, arquivo, importado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (cnpj, conta_banco, fitid) DO NOTHING RETURNING fitid
    `, [cnpj, contaBanco, m.fitid, m.dataISO, m.valorCentavos, m.memo, (arquivo || "").slice(0, 160) || null, quem]);
    if (r.rows.length) novos += 1;
  }
  return { recebidos: movimentos.length, novos, jaExistiam: movimentos.length - novos };
}

const linhaParaMovimento = (r: any): MovimentoGuardado => ({
  fitid: String(r.fitid), dataISO: String(r.data_iso || r.data || "").slice(0, 10), valorCentavos: Number(r.valor_centavos), memo: String(r.memo || ""),
  contaBanco: String(r.conta_banco), situacao: r.situacao, lancamentoId: r.lancamento_id || null,
  sugestaoConta: r.sugestao_conta || null, sugestaoLancamentoId: r.sugestao_lancamento_id || null, sugestaoMotivo: r.sugestao_motivo || null,
  importadoEm: new Date(r.importado_em).toISOString(), importadoPor: r.importado_por || null,
  conciliadoEm: r.conciliado_em ? new Date(r.conciliado_em).toISOString() : null, conciliadoPor: r.conciliado_por || null, arquivo: r.arquivo || null,
});

export async function lerMovimentosExtrato(consultar: Consultar, cnpj: string, filtro: { contaBanco?: string; competencia?: string; situacao?: SituacaoMovimento; limite?: number } = {}): Promise<MovimentoGuardado[]> {
  await prepararTabelaExtrato(consultar);
  if (filtro.competencia && !COMP.test(filtro.competencia)) throw new ErroExtrato(400, "Competência inválida; use AAAA-MM.");
  const de = filtro.competencia ? `${filtro.competencia}-01` : null;
  const r = await consultar(`
    SELECT *, to_char(data,'YYYY-MM-DD') AS data_iso FROM contabil_extrato_movimentos
    WHERE cnpj=$1 AND ($2::text IS NULL OR conta_banco=$2) AND ($3::date IS NULL OR (data >= $3::date AND data < ($3::date + interval '1 month')))
      AND ($4::text IS NULL OR situacao=$4)
    ORDER BY data, fitid LIMIT $5
  `, [cnpj, filtro.contaBanco || null, de, filtro.situacao || null, Math.min(Math.max(filtro.limite || 2000, 1), 5000)]);
  return r.rows.map(linhaParaMovimento);
}

export async function marcarConciliados(consultar: Consultar, cnpj: string, contaBanco: string, itens: Array<{ fitid: string; lancamentoId: string; situacao: "conciliado" | "lancado" }>, quem: string): Promise<number> {
  await prepararTabelaExtrato(consultar);
  let n = 0;
  for (const it of itens) {
    const r = await consultar(`
      UPDATE contabil_extrato_movimentos SET situacao=$4, lancamento_id=$5, conciliado_em=now(), conciliado_por=$6, sugestao_conta=NULL, sugestao_lancamento_id=NULL, sugestao_motivo=NULL
      WHERE cnpj=$1 AND conta_banco=$2 AND fitid=$3 AND situacao='pendente' RETURNING fitid
    `, [cnpj, contaBanco, it.fitid, it.situacao, it.lancamentoId, quem]);
    if (r.rows.length) n += 1;
  }
  return n;
}

/** Desfaz a conciliação (volta para pendente). Não mexe em lançamento: o lançamento criado continua e se corrige por estorno. */
export async function desfazerConciliacao(consultar: Consultar, cnpj: string, contaBanco: string, fitids: string[]): Promise<number> {
  await prepararTabelaExtrato(consultar);
  let n = 0;
  for (const fitid of fitids) {
    const r = await consultar(`UPDATE contabil_extrato_movimentos SET situacao='pendente', lancamento_id=NULL, conciliado_em=NULL, conciliado_por=NULL WHERE cnpj=$1 AND conta_banco=$2 AND fitid=$3 AND situacao<>'pendente' RETURNING fitid`, [cnpj, contaBanco, fitid]);
    if (r.rows.length) n += 1;
  }
  return n;
}

export async function gravarSugestoes(consultar: Consultar, cnpj: string, contaBanco: string, sugestoes: Array<{ fitid: string; contaCodigo?: string; lancamentoId?: string; motivo: string }>): Promise<number> {
  let n = 0;
  for (const s of sugestoes) {
    const r = await consultar(`
      UPDATE contabil_extrato_movimentos SET sugestao_conta=$4, sugestao_lancamento_id=$5, sugestao_motivo=$6
      WHERE cnpj=$1 AND conta_banco=$2 AND fitid=$3 AND situacao='pendente'
        AND (sugestao_conta IS DISTINCT FROM $4 OR sugestao_lancamento_id IS DISTINCT FROM $5) RETURNING fitid
    `, [cnpj, contaBanco, s.fitid, s.contaCodigo || null, s.lancamentoId || null, s.motivo.slice(0, 240)]);
    if (r.rows.length) n += 1;
  }
  return n;
}

/** Empresas e contas com movimento pendente (para o robô). */
export async function contasComPendentes(consultar: Consultar): Promise<Array<{ cnpj: string; contaBanco: string; pendentes: number }>> {
  await prepararTabelaExtrato(consultar);
  const r = await consultar("SELECT cnpj, conta_banco, count(*)::int AS n FROM contabil_extrato_movimentos WHERE situacao='pendente' GROUP BY cnpj, conta_banco ORDER BY cnpj, conta_banco");
  return r.rows.map((x) => ({ cnpj: String(x.cnpj), contaBanco: String(x.conta_banco), pendentes: Number(x.n) }));
}

export async function resumoExtratoEmpresa(consultar: Consultar, cnpj: string): Promise<Array<{ contaBanco: string; pendentes: number; conciliados: number; lancados: number; comSugestao: number; ultimoMovimento: string | null }>> {
  await prepararTabelaExtrato(consultar);
  const r = await consultar(`
    SELECT conta_banco,
      count(*) FILTER (WHERE situacao='pendente')::int AS pendentes,
      count(*) FILTER (WHERE situacao='conciliado')::int AS conciliados,
      count(*) FILTER (WHERE situacao='lancado')::int AS lancados,
      count(*) FILTER (WHERE situacao='pendente' AND (sugestao_conta IS NOT NULL OR sugestao_lancamento_id IS NOT NULL))::int AS com_sugestao,
      to_char(max(data),'YYYY-MM-DD') AS ultimo
    FROM contabil_extrato_movimentos WHERE cnpj=$1 GROUP BY conta_banco ORDER BY conta_banco
  `, [cnpj]);
  return r.rows.map((x) => ({ contaBanco: String(x.conta_banco), pendentes: Number(x.pendentes), conciliados: Number(x.conciliados), lancados: Number(x.lancados), comSugestao: Number(x.com_sugestao), ultimoMovimento: x.ultimo ? String(x.ultimo) : null }));
}
