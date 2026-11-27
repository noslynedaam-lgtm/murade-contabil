// Agente 007 no Murad Contábil (núcleo em agente007.ts, igual nos três sistemas). O Contábil é o último do fluxo (Fiscal → DP → Contábil e
// Fiscal → Contábil): primeiro organiza a empresa migrada; depois encadeia o Aproveitamento do Backup pelo Fiscal, o Reconciliador (o que
// veio do Fiscal e do DP vira pré-lançamento para conferir) e o Conferidor da Migração.
//
// Etapas LEVES (por empresa, ~90 s depois de ela terminar de gravar na migração, também na retomada):
//  1. completar — completa os campos vazios pelo registro guardado do sistema anterior (completarEmpresaMigrada: transação curta por
//     empresa, nunca sobrescreve, não mexe em competência fechada, passa pela validação do workspace).
//  2. balancete — conferência da migração (conferirEmpresaMigrada): o que não bate vira ponto para conferir.
//  3. campo_a_campo — o que estava preenchido no backup e faltou/veio diferente (conferirCamposEmpresaMigrada).
// Nunca: transmissão (ECD/ECF), exclusão, aprovação de lançamento, Serpro. Log só com contagens.
import type { Achado007, Etapa007, LinhaPainelCofre } from './agente007';
import { completarEmpresaMigrada, conferirEmpresaMigrada, conferirCamposEmpresaMigrada, TABELA_SISTEMA_ANTERIOR } from './migracaoSistemaAnterior/banco';
import { colunasSoConsulta } from '../data/mapaBackupContabil';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Banco = Parameters<typeof completarEmpresaMigrada>[0];
const TELA = 'migracao';

export function achadosBalancete007(cnpj: string, c: { bate: boolean; resumo: string } | null): Achado007[] {
  return c && !c.bate ? [{ chave: `balancete|${cnpj}`, cnpj, tipo: 'pendencia', tela: TELA, fonte: 'conferência do backup x gravado',
    texto: `Backup x gravado (Contábil): ${String(c.resumo).slice(0, 300)}`, comoCorrigir: 'Empresa › Migração › "O que veio do sistema anterior para esta empresa".' }] : [];
}
export function achadosCampos007(cnpj: string, pend: Array<{ tipo: string; item: string; rotulo: string }> | null | undefined): Achado007[] {
  const p = pend || []; if (!p.length) return [];
  const faltou = p.filter((x) => x.tipo === 'faltou').length; const dif = p.length - faltou;
  return [{ chave: `campos|${cnpj}`, cnpj, tipo: 'pendencia', tela: TELA, fonte: 'conferidor campo a campo da migração',
    texto: `Campo a campo: ${faltou ? `${faltou} campo(s) do backup não chegaram` : ''}${faltou && dif ? ' e ' : ''}${dif ? `${dif} vieram diferentes` : ''} (ex.: ${p[0].item} › ${p[0].rotulo}).`,
    comoCorrigir: 'Empresa › Migração › "O que veio do sistema anterior para esta empresa".' }];
}

export async function assinatura007Contabil(q: Q, cnpj: string): Promise<string> {
  const [w, r] = await Promise.all([
    q('SELECT version, updated_at::text AS u FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]).catch(() => ({ rows: [] as any[] })),
    q(`SELECT count(*)::int AS n, max(migrado_em)::text AS m FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1`, [cnpj]).catch(() => ({ rows: [] as any[] })),
  ]);
  return JSON.stringify([w.rows[0]?.version ?? '', w.rows[0]?.u ?? '', r.rows[0]?.n ?? 0, r.rows[0]?.m ?? '']);
}

export interface DepsAgente007Contabil { consultar: Q; banco: () => Banco; workspaceValido: (p: unknown) => boolean; pesadas: Array<{ id: string; nome: string; rodar: () => Promise<string | void> }> }

export function etapas007Contabil(d: DepsAgente007Contabil): Etapa007[] {
  const completar: Etapa007 = { id: 'completar', nome: 'Completar pelo registro do sistema anterior',
    rodar: async (alvo) => { const f = await completarEmpresaMigrada(d.banco(), alvo.cnpj, (p) => d.workspaceValido(p)); return f.length ? { organizados: f.length, rotulo: 'campos' } : {}; } };
  const balancete: Etapa007 = { id: 'balancete', nome: 'Backup x gravado (balancete)',
    rodar: async (alvo) => ({ achados: achadosBalancete007(alvo.cnpj, await conferirEmpresaMigrada(d.consultar as any, alvo.cnpj)) }) };
  const campos: Etapa007 = { id: 'campo_a_campo', nome: 'Campo a campo',
    rodar: async (alvo) => ({ achados: achadosCampos007(alvo.cnpj, (await conferirCamposEmpresaMigrada(d.consultar as any, alvo.cnpj))?.pendencias as any) }) };
  const pesadas: Etapa007[] = d.pesadas.map((p) => ({ id: p.id, nome: p.nome, pesada: true, rodar: async () => { const n = await p.rodar(); return n ? { nota: n } : {}; } }));
  return [completar, balancete, campos, ...pesadas];
}

/** Painel do DONO: blocos do registro guardado (dado sem campo no Contábil), agregados — sem CNPJ, sem valor. */
export async function painelCofre007Contabil(q: Q): Promise<LinhaPainelCofre[]> {
  const r = await q(`SELECT s.bloco, sum(s.quantidade)::int AS linhas, count(DISTINCT s.cnpj)::int AS empresas,
      count(DISTINCT (SELECT COALESCE(u.tenant_id, u.id)::text FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=s.cnpj ORDER BY (a.role='admin') DESC LIMIT 1))::int AS escritorios
    FROM ${TABELA_SISTEMA_ANTERIOR} s WHERE s.bloco NOT LIKE '\\_%' GROUP BY s.bloco ORDER BY 2 DESC LIMIT 300`).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((x: any) => {
    const cols = colunasSoConsulta(String(x.bloco));
    return { tabela: String(x.bloco), coluna: cols.length ? cols.slice(0, 6).map((c) => c.coluna).join(', ') : '(linha inteira)', registros: Number(x.linhas), empresas: Number(x.empresas), escritorios: Number(x.escritorios), formato: '',
      situacao: 'sem_lugar' as const, sugestao: 'Guardado no registro do sistema anterior (só consulta). Se tiver uso no Contábil, criar o campo e pôr em IMPLANTAVEIS_CONTABIL.', implantados: 0 };
  });
}
