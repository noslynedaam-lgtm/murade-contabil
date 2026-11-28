// Contábil: o que é "veio por cópia", o que é "dado próprio do Contábil" e onde os robôs deixam rastro (para o conferidor).
// A regra geral (tabela, ativar, conversão, conferidor) está em empresaAtendimento.ts, igual no DP.
import { type AlvoConferencia, type CandidataConversao, type Consultar } from './empresaAtendimento';
import { planoContasInicialContabil } from '../utils/workspaceInicial';

export const PREFIXO_ATENDIMENTO_CONTABIL = 'contabil';

/** Campos do "empresa" do workspace que a cópia do Fiscal põe sozinha (o resto foi a pessoa que digitou aqui). */
const CAMPOS_DA_COPIA = new Set(['cnpj', 'razaoSocial', 'nomeFantasia', 'regime', 'municipio', 'uf', 'cnae', 'certificadoAtivo', 'regimeOrigem', 'regimeAtualizadoEm', 'regimeAnterior']);
/** Listas do workspace que só têm item quando alguém trabalhou a empresa aqui (pré-lançamento automático não conta). */
const LISTAS_PROPRIAS: Array<[string, string]> = [['lancamentos', 'lançamento contábil'], ['centrosCusto', 'centro de custo'], ['bensImobilizado', 'imobilizado'], ['livros', 'livro'],
  ['lembretes', 'lembrete'], ['historicosPadrao', 'histórico padrão'], ['lancamentosPadrao', 'lançamento padrão'], ['regrasConciliacao', 'regra de conciliação']];
const TABELAS_PROPRIAS: Array<[string, string]> = [['contabil_period_closures', 'competência fechada'], ['contabil_manual_journal_events', 'lançamento manual'], ['contabil_opening_balance_audit', 'saldo inicial']];

let codigosPadrao: Set<string> | null = null;
function codigosDoPlanoPadrao(): Set<string> {
  if (!codigosPadrao) { try { codigosPadrao = new Set((planoContasInicialContabil() as Array<{ codigo?: string }>).map((c) => String(c?.codigo || ''))); } catch { codigosPadrao = new Set(); } }
  return codigosPadrao;
}
/** Plano de contas próprio: tem conta que o plano padrão do Murad não tem (o de entidade adapta o padrão: só conta se tiver código novo e não for entidade). */
export function temPlanoProprio(contas: unknown, regime: unknown): boolean {
  if (!Array.isArray(contas) || !contas.length) return false;
  if (/entidade/i.test(String(regime || ''))) return false; // plano de entidade é derivado do padrão pelo próprio sistema
  const padrao = codigosDoPlanoPadrao();
  if (!padrao.size) return true; // sem conseguir comparar: por segurança, conta como próprio
  return contas.some((c: any) => !padrao.has(String(c?.codigo || '')));
}

/** Motivos pelos quais a empresa tem dado próprio no Contábil (vazio = nada próprio). Só leitura. */
export function criarDadosPropriosContabil(consultar: Consultar) {
  return async (cnpj: string): Promise<string[]> => {
    const motivos: string[] = [];
    const ws = (await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]).catch(() => ({ rows: [] as any[] }))).rows[0]?.payload || null;
    if (ws) {
      for (const [campo, rotulo] of LISTAS_PROPRIAS) if (Array.isArray(ws[campo]) && ws[campo].length) motivos.push(rotulo);
      if (ws.historicoArquivado) motivos.push('histórico guardado');
      if (ws.migracaoSistemaAnterior || ws.migracao) motivos.push('migração do sistema anterior');
      if (temPlanoProprio(ws.contas, ws.empresa?.regime)) motivos.push('plano de contas próprio');
      const empresa = ws.empresa && typeof ws.empresa === 'object' ? ws.empresa : {};
      if (Object.entries(empresa).some(([k, v]) => !CAMPOS_DA_COPIA.has(k) && v !== '' && v !== null && v !== undefined && v !== false && !(Array.isArray(v) && !v.length))) motivos.push('cadastro digitado no Contábil');
    }
    for (const [tabela, rotulo] of TABELAS_PROPRIAS) {
      const r = await consultar(`SELECT 1 FROM ${tabela} WHERE cnpj=$1 LIMIT 1`, [cnpj]).catch(() => ({ rows: [] as any[] }));
      if (r.rows.length) motivos.push(rotulo);
    }
    return motivos;
  };
}

/** Empresas do Contábil sem marca. "Veio por cópia" = tem o cadastro básico guardado pela cópia do Fiscal (contabil_empresas_compartilhadas). */
export function criarCandidatasContabil(consultar: Consultar) {
  return async (limite: number): Promise<CandidataConversao[]> => {
    const r = await consultar(`SELECT x.cnpj, c.cnpj AS copia FROM (SELECT DISTINCT cnpj FROM contabil_auth_company_access) x
      LEFT JOIN contabil_empresas_compartilhadas c ON c.cnpj=x.cnpj
      LEFT JOIN contabil_empresa_atendimento a ON a.cnpj=x.cnpj WHERE a.cnpj IS NULL ORDER BY x.cnpj LIMIT $1`, [limite]);
    return r.rows.map((x) => ({ cnpj: String(x.cnpj), veioPorCopia: Boolean(x.copia) }));
  };
}

export const ALVOS_CONFERIDOR_CONTABIL: AlvoConferencia[] = [
  { tabela: 'contabil_period_closures', robo: 'Fechamento da competência' },
  { tabela: 'contabil_accounting_approval_audit', robo: 'Robô Contabilizador' },
  { tabela: 'contabil_alertas_nota_sem_valor', robo: 'Robô Conferidor (notas sem valor)' },
  { tabela: 'contabil_urgente_envios', robo: 'Robô do Alerta Urgente de Vencimento do Contábil' },
  { tabela: 'contabil_lucro_real_apuracoes', robo: 'Robô do Lucro Real' },
];
