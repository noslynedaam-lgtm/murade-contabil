// Robô Conferidor do Contábil: confere, por conta própria, as empresas do servidor e guarda os achados em memória
// para a tela e para a Agente IA. Só lê e conta: nunca cria lançamento, nunca fecha competência.
import type { ContaPlano, LancamentoContabil, PreLancamentoContabil } from '../types';
import { conferirFechamento } from '../utils/fechamentoContabil';
import type { BemImobilizado } from '../utils/imobilizado';
import { conferirEcdWorkspace, type AchadoEcd } from './conferidorEcd';

export type PendenciaConferidor = { id: string; titulo: string; detalhe: string };
export type AchadoEmpresa = {
  cnpj: string; competencia: string; verificadoEm: string; pendencias: PendenciaConferidor[];
  preLancamentosPendentesPorOrigem: Record<string, number>; lancamentosAguardandoAprovacao: number;
};

export const competenciaAnterior = (hoje: Date): string => {
  const a = hoje.getFullYear(), m = hoje.getMonth(); // m 0-based = mês anterior em 1-based
  return m === 0 ? `${a - 1}-12` : `${a}-${String(m).padStart(2, '0')}`;
};

// Confere um workspace: itens automáticos do fechamento guiado + pendências vindas do DP e do Fiscal por origem.
export function conferirWorkspace(cnpj: string, payload: Record<string, any>, competencia: string, agora = new Date()): AchadoEmpresa | null {
  const contas: ContaPlano[] = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos: LancamentoContabil[] = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  if (!contas.length || !lancamentos.length) return null; // empresa sem movimento: nada a conferir
  const pre: PreLancamentoContabil[] = Array.isArray(payload?.preLancamentos) ? payload.preLancamentos : [];
  const bens: BemImobilizado[] = Array.isArray(payload?.bensImobilizado) ? payload.bensImobilizado : [];
  const r = conferirFechamento({ competencia, contas, lancamentos, preLancamentos: pre, bens, confirmacoes: {} });
  const pendencias = r.itens.filter((i) => i.tipo === 'automatico' && i.bloqueia && !i.ok && i.id !== 'movimento').map((i) => ({ id: i.id, titulo: i.titulo, detalhe: i.detalhe }));
  const porOrigem: Record<string, number> = {};
  for (const p of pre) if (p?.status === 'pendente_conferencia' && p.competencia === competencia) porOrigem[p.origem] = (porOrigem[p.origem] || 0) + 1;
  const aprov = lancamentos.filter((l) => l?.statusManual === 'pendente_aprovacao' && String(l.data || '').slice(0, 7) === competencia).length;
  return { cnpj, competencia, verificadoEm: agora.toISOString(), pendencias, preLancamentosPendentesPorOrigem: porOrigem, lancamentosAguardandoAprovacao: aprov };
}

const achados = new Map<string, AchadoEmpresa>();
export const achadosDoConferidor = (cnpjs?: string[]): AchadoEmpresa[] => [...achados.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj)).sort((a, b) => a.cnpj.localeCompare(b.cnpj));
const achadosEcd = new Map<string, AchadoEcd>();
export const achadosEcdDoConferidor = (cnpjs?: string[]): AchadoEcd[] => [...achadosEcd.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj)).sort((a, b) => a.cnpj.localeCompare(b.cnpj));
export const limparAchadosParaTeste = () => { achados.clear(); achadosEcd.clear(); };

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export async function rodarConferidorContabil(consultar: Consultar, agora = new Date()): Promise<{ empresas: number; comPendencia: number }> {
  const competencia = competenciaAnterior(agora);
  const fechadas = await consultar('SELECT cnpj, competencia FROM contabil_period_closures WHERE competencia=$1', [competencia]);
  const fechadasSet = new Set(fechadas.rows.map((r) => String(r.cnpj)));
  let empresas = 0, comPendencia = 0, deslocamento = 0;
  const vistos = new Set<string>();
  for (;;) {
    const lote = await consultar('SELECT cnpj, payload FROM contabil_company_workspaces ORDER BY cnpj LIMIT 25 OFFSET $1', [deslocamento]);
    if (!lote.rows.length) break;
    for (const row of lote.rows) {
      const cnpj = String(row.cnpj); vistos.add(cnpj);
      try { const e = conferirEcdWorkspace(cnpj, row.payload || {}, agora); if (e) achadosEcd.set(cnpj, e); else achadosEcd.delete(cnpj); } catch (erro: any) { console.error(`Conferidor da ECD falhou para ${cnpj}:`, erro?.message || erro); }
      if (fechadasSet.has(cnpj)) { achados.delete(cnpj); continue; }
      const a = conferirWorkspace(cnpj, row.payload || {}, competencia, agora);
      if (!a) { achados.delete(cnpj); continue; }
      achados.set(cnpj, a); empresas += 1;
      if (a.pendencias.length || Object.keys(a.preLancamentosPendentesPorOrigem).length) comPendencia += 1;
    }
    deslocamento += lote.rows.length;
    if (lote.rows.length < 25) break;
  }
  for (const cnpj of [...achados.keys()]) if (!vistos.has(cnpj)) achados.delete(cnpj);
  for (const cnpj of [...achadosEcd.keys()]) if (!vistos.has(cnpj)) achadosEcd.delete(cnpj);
  return { empresas, comPendencia };
}
