// Primeira semana do escritório (igual no DP, Fiscal e Contábil): o navegador precisa saber QUANDO o escritório foi criado
// para oferecer "Quer uma aula rápida desta tela?" só nos primeiros 7 dias. Vai junto do estado da Escola (/api/escola/estado).
// Nada de identificador cru para o navegador: o escritório e o usuário vão como um código curto (resumo), só para separar a
// escolha "Não perguntar mais" de cada escritório e de cada usuário no aparelho.
import crypto from 'node:crypto';

export const chaveCurta = (valor: string): string => crypto.createHash('sha256').update(`murad-oferta:${valor}`).digest('hex').slice(0, 16);

/** SQL da data de criação do escritório: a conta do escritório (id = tenant) ou, se não houver, a conta mais antiga dele. */
export const sqlCriadoEmDoEscritorio = (tabelaUsuarios: string): string =>
  `SELECT MIN(created_at) AS criado FROM ${tabelaUsuarios} WHERE id::text=$1 OR tenant_id::text=$1`;

export interface CamposPrimeiraSemana { escritorioCriadoEm: string | null; escritorioChave: string; usuarioChave: string }
export async function camposPrimeiraSemana(tenantId: string, userId: string, criadoEm?: (tenantId: string) => Promise<string | null>): Promise<CamposPrimeiraSemana> {
  let data: string | null = null;
  if (criadoEm) {
    try {
      const v = await criadoEm(tenantId);
      const t = Date.parse(String(v || ''));
      data = Number.isFinite(t) ? new Date(t).toISOString() : null;
    } catch { data = null; } // sem a data, o navegador não oferece (não chuta)
  }
  return { escritorioCriadoEm: data, escritorioChave: chaveCurta(`t:${tenantId}`), usuarioChave: chaveCurta(`u:${userId}`) };
}
