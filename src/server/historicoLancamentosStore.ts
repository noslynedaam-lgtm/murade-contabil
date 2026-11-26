// Histórico guardado da escrituração: exercícios antigos de cada empresa numa tabela própria, por mês (e em partes de até
// 2.000 lançamentos), fora do documento da empresa. Mesmo isolamento do resto do Contábil: cada linha é de UM CNPJ, e só
// quem tem acesso à empresa lê (as rotas conferem a sessão antes). O documento da empresa guarda o marcador (até onde vai o
// histórico) e o saldo transportado (utils/historicoContabil.ts). Migração da tabela: só CREATE ... IF NOT EXISTS (aditiva).
import type { ContaPlano, LancamentoContabil } from '../types';
import { AcumuladorHistorico, partidasDeTransporte } from '../utils/historicoContabil';
import type { ConsultaSql } from './exclusaoEmpresaCascata';

export const TABELA_HISTORICO = 'contabil_lancamentos_historico';
/** Lançamentos por linha da tabela (cada linha fica pequena para ler e gravar sem pesar a memória). */
export const POR_PARTE = 2000;

const SQL = `CREATE TABLE IF NOT EXISTS ${TABELA_HISTORICO} (
  cnpj text NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  competencia text NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  origem text NOT NULL CHECK (origem IN ('migracao','escritorio')),
  parte integer NOT NULL CHECK (parte >= 0),
  lancamentos jsonb NOT NULL,
  pre_lancamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantidade integer NOT NULL CHECK (quantidade >= 0),
  guardado_em timestamptz NOT NULL DEFAULT now(),
  guardado_por text,
  PRIMARY KEY (cnpj, competencia, origem, parte)
)`;

export async function prepararTabelaHistorico(q: ConsultaSql): Promise<void> { await q(SQL, []); }

async function existe(q: ConsultaSql): Promise<boolean> {
  return Boolean((await q(`SELECT to_regclass('${TABELA_HISTORICO}') AS t`, [])).rows[0]?.t);
}

export interface MesHistorico { competencia: string; origem: 'migracao' | 'escritorio'; lancamentos: any[]; preLancamentos?: any[] }

/** Grava um mês (em partes). Quem chama apaga antes o que vai substituir (na mesma transação). */
export async function gravarMesHistorico(q: ConsultaSql, cnpj: string, mes: MesHistorico, quem: string): Promise<number> {
  const lancs = mes.lancamentos || []; const pres = mes.preLancamentos || [];
  let parte = 0; let gravados = 0;
  for (let i = 0; i < Math.max(lancs.length, 1); i += POR_PARTE) {
    const pedaco = lancs.slice(i, i + POR_PARTE);
    const p = parte === 0 ? pres : [];
    if (!pedaco.length && !p.length) break;
    await q(`INSERT INTO ${TABELA_HISTORICO}(cnpj,competencia,origem,parte,lancamentos,pre_lancamentos,quantidade,guardado_por) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
      [cnpj, mes.competencia, mes.origem, parte, JSON.stringify(pedaco), JSON.stringify(p), pedaco.length, quem]);
    gravados += pedaco.length; parte++;
  }
  return gravados;
}

export async function apagarHistorico(q: ConsultaSql, cnpj: string, origem?: 'migracao' | 'escritorio'): Promise<number> {
  if (!(await existe(q))) return 0;
  const r = origem ? await q(`DELETE FROM ${TABELA_HISTORICO} WHERE cnpj=$1 AND origem=$2`, [cnpj, origem]) : await q(`DELETE FROM ${TABELA_HISTORICO} WHERE cnpj=$1`, [cnpj]);
  return Number(r.rowCount ?? 0);
}

export interface ResumoHistorico { quantidade: number; desde: string; ate: string; anos: Array<{ ano: number; quantidade: number; meses: number; migracao: number; escritorio: number }> }

/** Anos guardados (só contagens; não lê os lançamentos). */
export async function resumoHistorico(q: ConsultaSql, cnpj: string): Promise<ResumoHistorico> {
  if (!(await existe(q))) return { quantidade: 0, desde: '', ate: '', anos: [] };
  const r = await q(`SELECT substr(competencia,1,4)::int AS ano, origem, count(DISTINCT competencia)::int AS meses, COALESCE(sum(quantidade),0)::int AS n, min(competencia) AS de, max(competencia) AS ate FROM ${TABELA_HISTORICO} WHERE cnpj=$1 GROUP BY 1,2 ORDER BY 1`, [cnpj]);
  const anos = new Map<number, ResumoHistorico['anos'][number]>();
  let desde = ''; let ate = ''; let quantidade = 0;
  for (const x of r.rows) {
    const a = anos.get(Number(x.ano)) ?? { ano: Number(x.ano), quantidade: 0, meses: 0, migracao: 0, escritorio: 0 };
    a.quantidade += Number(x.n); a.meses = Math.max(a.meses, Number(x.meses)); a[x.origem === 'migracao' ? 'migracao' : 'escritorio'] += Number(x.n);
    anos.set(a.ano, a); quantidade += Number(x.n);
    if (!desde || String(x.de) < desde) desde = String(x.de); if (String(x.ate) > ate) ate = String(x.ate);
  }
  return { quantidade, desde, ate, anos: [...anos.values()] };
}

/** Percorre o histórico mês a mês, em ordem (cada parte é lida sozinha: memória baixa mesmo com centenas de milhares de lançamentos). */
export async function percorrerHistorico(q: ConsultaSql, cnpj: string, fn: (competencia: string, lancamentos: any[], preLancamentos: any[], origem: string) => void | Promise<void>, filtro: { desde?: string; ate?: string; origem?: 'migracao' | 'escritorio' } = {}): Promise<void> {
  if (!(await existe(q))) return;
  const chaves = (await q(`SELECT competencia, origem, parte FROM ${TABELA_HISTORICO} WHERE cnpj=$1 AND ($2::text IS NULL OR competencia >= $2) AND ($3::text IS NULL OR competencia <= $3) AND ($4::text IS NULL OR origem = $4) ORDER BY competencia, origem, parte`,
    [cnpj, filtro.desde ?? null, filtro.ate ?? null, filtro.origem ?? null])).rows;
  for (const k of chaves) {
    const r = await q(`SELECT lancamentos, pre_lancamentos FROM ${TABELA_HISTORICO} WHERE cnpj=$1 AND competencia=$2 AND origem=$3 AND parte=$4`, [cnpj, k.competencia, k.origem, k.parte]);
    const row = r.rows[0]; if (!row) continue;
    await fn(String(k.competencia), Array.isArray(row.lancamentos) ? row.lancamentos : [], Array.isArray(row.pre_lancamentos) ? row.pre_lancamentos : [], String(k.origem));
  }
}

/** O que o escritório guardou no histórico (não veio da migração): volta para a junção na remigração. Só lê. */
export async function lerHistoricoDoEscritorio(q: ConsultaSql, cnpj: string): Promise<{ lancamentos: any[]; preLancamentos: any[] }> {
  const lancamentos: any[] = []; const preLancamentos: any[] = [];
  await percorrerHistorico(q, cnpj, (_c, l, p) => { lancamentos.push(...l); preLancamentos.push(...p); }, { origem: 'escritorio' });
  return { lancamentos, preLancamentos };
}

/** Saldo transportado até o fim do ano anterior a `ano` (para consultar um exercício guardado) e os lançamentos do ano. */
export async function lerExercicioDoHistorico(q: ConsultaSql, cnpj: string, ano: number, contas: ContaPlano[]): Promise<{ lancamentos: LancamentoContabil[]; preLancamentos: any[]; transportes: number; doAno: number }> {
  const corte = `${ano - 1}-12`;
  const acc = new AcumuladorHistorico(contas, corte);
  await percorrerHistorico(q, cnpj, (_c, l) => { for (const x of l) acc.adicionar(x); }, { ate: corte });
  const transporte = acc.quantidade ? partidasDeTransporte(acc, contas, corte) : [];
  const doAno: LancamentoContabil[] = []; const pres: any[] = [];
  await percorrerHistorico(q, cnpj, (_c, l, p) => { doAno.push(...l); pres.push(...p); }, { desde: `${ano}-01`, ate: `${ano}-12` });
  doAno.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)));
  return { lancamentos: [...transporte, ...doAno], preLancamentos: pres, transportes: transporte.length, doAno: doAno.length };
}

/**
 * Documento da empresa para conferir um exercício (robôs da ECD, das demonstrações e da DVA): quando o ano está no histórico guardado,
 * os lançamentos são os daquele ano + o saldo transportado até o ano anterior (os mesmos números de quando tudo estava no documento).
 */
export async function visaoDoExercicio(q: ConsultaSql, cnpj: string, payload: Record<string, any>, ano: number): Promise<Record<string, any>> {
  const ate = String(payload?.historicoArquivado?.ateCompetencia || '');
  if (!ate || `${ano}-01` > ate) return payload;
  const r = await lerExercicioDoHistorico(q, cnpj, ano, Array.isArray(payload.contas) ? payload.contas : []);
  return { ...payload, lancamentos: r.lancamentos, preLancamentos: r.preLancamentos };
}
