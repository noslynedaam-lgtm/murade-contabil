// Robô Conferidor de Acessos: confere, de tempos em tempos, se as contas excluídas ou bloqueadas não deixaram
// nada para trás (acessos a empresas, sessões abertas) e conta as contas soltas que seguram um e-mail.
// Só corrige o que é seguro e não precisa de ninguém: acesso e sessão de conta já excluída ou bloqueada.
// Nunca apaga conta, empresa, nota nem dado contábil, fiscal ou de folha.
export type TabelasAcessos = { usuarios: string; acesso: string; sessoes: string; colunaEscritorio: 'global_admin' | 'office_admin' };
export type RelatorioAcessos = { verificadoEm: string; acessosRemovidosDeContasExcluidas: number; sessoesEncerradasDeContasInativas: number; contasSoltas: number };
type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

let ultimo: RelatorioAcessos | null = null;
export const ultimoRelatorioAcessos = (): RelatorioAcessos | null => ultimo;

export async function rodarConferidorAcessos(consultar: Consultar, t: TabelasAcessos, agora = new Date()): Promise<RelatorioAcessos> {
  // Conta excluída (anonimizada por causa do histórico) nunca pode manter acesso a empresa.
  const acessos = await consultar(`DELETE FROM ${t.acesso} WHERE user_id IN (SELECT id FROM ${t.usuarios} WHERE login LIKE '%#removido-%') RETURNING user_id`);
  // Conta bloqueada ou excluída não pode ter sessão aberta.
  const sessoes = await consultar(`DELETE FROM ${t.sessoes} WHERE user_id IN (SELECT id FROM ${t.usuarios} WHERE disabled=true) RETURNING user_id`);
  // Conta solta: sem escritório, sem acesso a empresa e que não é de escritório. Só é contada; é liberada quando o e-mail receber novo convite.
  const soltas = await consultar(`SELECT count(*)::int AS n FROM ${t.usuarios} u WHERE u.${t.colunaEscritorio}=false AND u.office_owner IS NULL AND u.login NOT LIKE '%#removido-%' AND NOT EXISTS (SELECT 1 FROM ${t.acesso} a WHERE a.user_id=u.id)`);
  ultimo = { verificadoEm: agora.toISOString(), acessosRemovidosDeContasExcluidas: acessos.rows.length, sessoesEncerradasDeContasInativas: sessoes.rows.length, contasSoltas: Number(soltas.rows[0]?.n || 0) };
  return ultimo;
}

export const resumoRelatorioAcessos = (r: RelatorioAcessos): string =>
  `Acessos conferidos: ${r.acessosRemovidosDeContasExcluidas} acesso(s) de conta excluída removido(s), ${r.sessoesEncerradasDeContasInativas} sessão(ões) de conta inativa encerrada(s), ${r.contasSoltas} conta(s) solta(s) aguardando.`;
