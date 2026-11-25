import type { EscritorioPresenca, PapelPresenca } from './presencaDono';

// Consultas do online/offline do dono do sistema no banco do Contábil (usuários em contabil_auth_users).
// Papel: dono do escritório (global_admin), equipe (office_owner) ou cliente de empresa (o resto do mesmo escritório).
const PAPEL = `CASE WHEN u.global_admin THEN 'dono' WHEN u.office_owner IS NOT NULL THEN 'equipe' ELSE 'cliente' END`;

/** $1 = dias. JOIN com os usuários: usuário excluído some sozinho do painel. */
export const SQL_SINAIS_CONTABIL = `SELECT o.login AS escritorio, u.login, ${PAPEL} AS papel, p.tela, p.ultima_em
  FROM contabil_presenca_dono p
  JOIN contabil_auth_users u ON u.id::text = p.user_id
  JOIN contabil_auth_users o ON o.id::text = p.tenant_id AND o.global_admin = true AND (o.tenant_id = o.id OR o.tenant_id IS NULL)
  WHERE p.ultima_em > now() - ($1::int * interval '1 day')`;

export const SQL_ESCRITORIOS_CONTABIL = `SELECT o.login AS escritorio, u.login, ${PAPEL} AS papel
  FROM contabil_auth_users o LEFT JOIN contabil_auth_users u ON (u.tenant_id = o.id OR u.id = o.id) AND u.disabled = false
  WHERE o.global_admin = true AND o.tenant_id = o.id ORDER BY o.login, u.login`;

export const SQL_ORFAOS_CONTABIL = `DELETE FROM contabil_presenca_dono p WHERE NOT EXISTS (SELECT 1 FROM contabil_auth_users u WHERE u.id::text = p.user_id)`;

export function agruparEscritorios(linhas: Array<{ escritorio: unknown; login: unknown; papel: unknown }>): EscritorioPresenca[] {
  const mapa = new Map<string, EscritorioPresenca>();
  for (const row of linhas) {
    const chave = String(row.escritorio);
    const e = mapa.get(chave) || { login: chave, usuarios: [] };
    if (row.login && !e.usuarios.some((u) => u.login === String(row.login))) e.usuarios.push({ login: String(row.login), papel: (row.papel === 'dono' || row.papel === 'equipe' ? row.papel : 'cliente') as PapelPresenca });
    mapa.set(chave, e);
  }
  return [...mapa.values()];
}
