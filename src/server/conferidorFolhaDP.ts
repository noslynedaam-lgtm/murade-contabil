// Robô Conferidor: folha que o DP já mandou mas que não virou partida no Contábil.
// Sem isso a falha era silenciosa: a folha ficava guardada, nenhum rascunho aparecia e ninguém sabia o porquê.
// Só lê e aponta; nunca cria lançamento.
import { ITENS_FOLHA_DP, conciliarResumoFolhaDP } from "../utils/origensContabeis";
import type { PendenciaConferidor } from "./conferidorContabil";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export function pendenciasFolhasDP(cnpj: string, folhas: Array<{ competencia: string; resumo: Record<string, unknown> }>, payload: Record<string, any>): PendenciaConferidor[] {
  const contas = new Set((Array.isArray(payload?.contas) ? payload.contas : []).filter((c: any) => c?.tipo === "analitica").map((c: any) => String(c.codigo)));
  const mapeamentos: any[] = Array.isArray(payload?.mapeamentosOrigem) ? payload.mapeamentosOrigem : [];
  const saida: PendenciaConferidor[] = [];
  for (const folha of folhas) {
    const valores = folha.resumo || {};
    const conc = conciliarResumoFolhaDP(valores);
    if (conc.ok === false) { saida.push({ id: `folha-dp-${folha.competencia}`, titulo: `Folha ${folha.competencia} do DP não gerou partidas`, detalhe: conc.motivo }); continue; }
    const faltam: string[] = [];
    for (const item of ITENS_FOLHA_DP) {
      if ("opcional" in item && item.opcional) continue;
      const valor = valores[item.campo];
      if (typeof valor !== "number" || valor <= 0) continue;
      const m = mapeamentos.find((x) => x?.origem === item.origem);
      if (!m || !contas.has(String(m.contaDebitoCodigo)) || !contas.has(String(m.contaCreditoCodigo)) || m.contaDebitoCodigo === m.contaCreditoCodigo) faltam.push(item.titulo);
    }
    if (faltam.length) saida.push({ id: `folha-dp-${folha.competencia}`, titulo: `Folha ${folha.competencia} do DP aguarda mapeamento de contas`, detalhe: `Mapeie na tela Revisão das origens: ${faltam.join("; ")}. Enquanto faltar uma, a folha inteira fica sem partidas para não lançar só uma parte.` });
  }
  return saida;
}

export async function conferirFolhasDP(consultar: Consultar, cnpj: string, payload: Record<string, any>): Promise<PendenciaConferidor[]> {
  const r = await consultar(
    `SELECT DISTINCT ON (competencia) competencia, resumo FROM murade_folhas_dp_origem WHERE cnpj=$1 ORDER BY competencia DESC, atualizado_em DESC LIMIT 6`, [cnpj]);
  return pendenciasFolhasDP(cnpj, r.rows.map((x) => ({ competencia: String(x.competencia).trim(), resumo: x.resumo || {} })), payload);
}
