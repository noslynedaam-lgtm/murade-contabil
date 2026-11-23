// Conferências do Robô Conferidor de Vigência no Contábil: alguma provisão nova ainda nasce de obrigação encerrada?
// Só lê. Os fins vêm da lista única (src/utils/vigenciaObrigacoes.ts).
import { tributoVigenteNaCompetencia, vigenciaDoTributoContabil } from "./prepararRascunhosContabeis";
import { itemVigencia } from "../utils/vigenciaObrigacoes";
import type { Consultar, ConferenciaVigencia, ProblemaVigencia } from "./vigenciaObrigacoesServidor";

const somaMes = (comp: string, n: number) => { const [a, m] = comp.split("-").map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
/** Os tributos que viram provisão (os mesmos aceitos da fila do Fiscal e do DP). */
export const TRIBUTOS_CONFERIDOS_VIGENCIA = ["PIS_PRESUMIDO", "COFINS_PRESUMIDO", "PIS_NAO_CUMULATIVO", "COFINS_NAO_CUMULATIVA", "PIS_NC_CREDITO", "COFINS_NC_CREDITO", "PIS_ARBITRADO", "COFINS_ARBITRADO", "COFINS_ENTIDADE", "CPRB"];

/** Gerador de provisões: no mês seguinte ao fim, PIS/Cofins e CPRB não podem virar provisão nova; no último mês, continuam. */
export function conferirGeradorProvisoesVigencia(): ProblemaVigencia[] {
  const out: ProblemaVigencia[] = [];
  for (const t of TRIBUTOS_CONFERIDOS_VIGENCIA) {
    const id = vigenciaDoTributoContabil(t); const fim = id ? itemVigencia(id)?.fim : null; if (!fim) continue;
    if (tributoVigenteNaCompetencia(t, somaMes(fim, 1))) out.push({ onde: "Provisões vindas do Fiscal e do DP", texto: `${t} de ${somaMes(fim, 1)} ainda viraria provisão, depois do fim (${fim})` });
    if (!tributoVigenteNaCompetencia(t, fim)) out.push({ onde: "Provisões vindas do Fiscal e do DP", texto: `${t} de ${fim} (último período) deixaria de virar provisão` });
  }
  return out;
}

export function conferenciasVigenciaContabil(consultar: Consultar | null): ConferenciaVigencia[] {
  const lista: ConferenciaVigencia[] = [{ nome: "Gerador de provisões", conferir: () => conferirGeradorProvisoesVigencia() }];
  if (consultar) {
    lista.push({ nome: "Apurações recebidas", conferir: async () => {
      let rows: any[] = [];
      try { rows = (await consultar("SELECT tributo, competencia, count(*)::int AS n FROM murade_apuracoes_fiscais_origem WHERE tributo = ANY($1::text[]) GROUP BY tributo, competencia", [TRIBUTOS_CONFERIDOS_VIGENCIA])).rows; } catch { return []; }
      return rows.filter((x) => !tributoVigenteNaCompetencia(String(x.tributo), String(x.competencia)))
        .map((x) => ({ onde: "Apurações recebidas do Fiscal e do DP", texto: `${x.n} apuração(ões) de ${x.tributo} de ${x.competencia} chegaram depois do fim (não viram provisão; confira quem mandou)` }));
    } });
    lista.push({ nome: "Pré-lançamentos", conferir: async () => {
      let rows: any[] = [];
      try {
        rows = (await consultar(`SELECT substring(p->>'referenciaOrigem' from ':APURACAO:([A-Z_]+):') AS tributo, substring(p->>'referenciaOrigem' from ':([0-9]{4}-[0-9]{2}):APURACAO:') AS competencia, count(*)::int AS n
          FROM contabil_company_workspaces w, jsonb_array_elements(CASE WHEN jsonb_typeof(w.payload->'preLancamentos')='array' THEN w.payload->'preLancamentos' ELSE '[]'::jsonb END) p
          WHERE p->>'referenciaOrigem' ~ ':APURACAO:(PIS|COFINS|CPRB)' GROUP BY 1, 2`)).rows;
      } catch { return []; }
      return rows.filter((x) => x.tributo && x.competencia && !tributoVigenteNaCompetencia(String(x.tributo), String(x.competencia)))
        .map((x) => ({ onde: "Pré-lançamentos", texto: `${x.n} pré-lançamento(s) de ${x.tributo} de ${x.competencia}, depois do fim` }));
    } });
  }
  return lista;
}
