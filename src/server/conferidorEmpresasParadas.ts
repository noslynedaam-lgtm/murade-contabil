// Conferidor "empresa parada no Contábil": avisa quando uma empresa do escritório não tem workspace (o reconciliador não trabalha nela)
// ou quando já tem notas autorizadas do Fiscal / folha do DP recebidas e nenhum pré-lançamento preparado. Só lê e conta.
type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export type SituacaoEmpresaContabil = { cnpj: string; temWorkspace: boolean; temMapeamento: boolean; notasProntas: number; folhasRecebidas: number; preLancamentos: number; dasRecebidos?: number; temMapeamentoDas?: boolean };
export type EmpresaParada = SituacaoEmpresaContabil & { motivo: string };

/** Regra pura: decide quais empresas estão paradas e por quê. */
export function empresasParadas(lista: SituacaoEmpresaContabil[]): EmpresaParada[] {
  const paradas: EmpresaParada[] = [];
  for (const e of lista) {
    const chegou = e.notasProntas + e.folhasRecebidas;
    if (!e.temWorkspace) paradas.push({ ...e, motivo: chegou ? `ainda não aberta no Contábil, com ${e.notasProntas} nota(s) e ${e.folhasRecebidas} folha(s) esperando` : "ainda não aberta no Contábil" });
    else if (!e.temMapeamento && chegou) paradas.push({ ...e, motivo: "sem mapeamento de origem (o plano de contas não bate com o padrão): mapear em Revisão das origens" });
    else if ((e.dasRecebidos ?? 0) > 0 && !e.temMapeamentoDas) paradas.push({ ...e, motivo: `recebeu ${e.dasRecebidos} DAS do Simples do Fiscal e o DAS não está mapeado: mapear em Revisar dados recebidos (Fiscal — DAS Simples)` });
    else if (chegou && e.preLancamentos === 0) paradas.push({ ...e, motivo: `recebeu ${e.notasProntas} nota(s) e ${e.folhasRecebidas} folha(s) e ainda não tem pré-lançamento` });
  }
  return paradas;
}

const docsOk = `d.documento->>'statusSefaz' ILIKE '%autorizad%' AND d.documento->>'statusVerificadoSefaz'='true' AND d.documento->>'dadosTributariosDisponiveis'='true'`;

/** Lê a situação de todas as empresas com acesso no Contábil. As tabelas de recepção podem ainda não existir num banco novo. */
export async function situacaoEmpresasContabil(consultar: Consultar, cnpjs?: string[]): Promise<SituacaoEmpresaContabil[]> {
  const existe = async (t: string) => Boolean((await consultar("SELECT to_regclass($1) AS t", [t])).rows[0]?.t);
  const temDocs = await existe("murade_documentos_fiscais_origem");
  const temFolhas = await existe("murade_folhas_dp_origem");
  const temApuracoes = await existe("murade_apuracoes_fiscais_origem");
  const r = await consultar(`
    SELECT a.cnpj, (w.cnpj IS NOT NULL) AS tem_workspace,
      CASE WHEN jsonb_typeof(w.payload->'mapeamentosOrigem')='array' THEN jsonb_array_length(w.payload->'mapeamentosOrigem')>0 ELSE false END AS tem_mapeamento,
      COALESCE(CASE WHEN jsonb_typeof(w.payload->'preLancamentos')='array' THEN jsonb_array_length(w.payload->'preLancamentos') END, 0)::int AS pre,
      ${temDocs ? `(SELECT count(*) FROM murade_documentos_fiscais_origem d WHERE d.cnpj=a.cnpj AND ${docsOk})::int` : "0"} AS notas,
      ${temFolhas ? "(SELECT count(*) FROM murade_folhas_dp_origem f WHERE f.cnpj=a.cnpj)::int" : "0"} AS folhas,
      ${temApuracoes ? "(SELECT count(*) FROM murade_apuracoes_fiscais_origem x WHERE x.cnpj=a.cnpj AND x.tributo='DAS_SIMPLES' AND x.situacao='confirmado')::int" : "0"} AS das,
      CASE WHEN jsonb_typeof(w.payload->'mapeamentosOrigem')='array' THEN EXISTS (SELECT 1 FROM jsonb_array_elements(w.payload->'mapeamentosOrigem') m WHERE m->>'origem'='fiscal_das_simples') ELSE false END AS tem_map_das
    FROM (SELECT DISTINCT cnpj FROM contabil_auth_company_access WHERE $1::text[] IS NULL OR cnpj=ANY($1::text[])) a
    LEFT JOIN contabil_company_workspaces w ON w.cnpj=a.cnpj
    ORDER BY a.cnpj
  `, [cnpjs ?? null]);
  return r.rows.map((x) => ({ cnpj: String(x.cnpj), temWorkspace: x.tem_workspace === true, temMapeamento: x.tem_mapeamento === true, notasProntas: Number(x.notas) || 0, folhasRecebidas: Number(x.folhas) || 0, preLancamentos: Number(x.pre) || 0, dasRecebidos: Number(x.das) || 0, temMapeamentoDas: x.tem_map_das === true }));
}

/** Texto curto para o aviso do robô (só números: o painel do robô não mostra nome de empresa de outro escritório). */
export function textoAvisoParadas(paradas: EmpresaParada[]): string {
  const semWs = paradas.filter((p) => !p.temWorkspace).length;
  const semPre = paradas.length - semWs;
  const partes: string[] = [];
  if (semWs) partes.push(`${semWs} empresa(s) ainda não aberta(s) no Contábil (o Robô Reconciliador abre sozinho no próximo minuto)`);
  if (semPre) partes.push(`${semPre} empresa(s) com dados do Fiscal/DP parados (sem pré-lançamento ou sem mapeamento; veja Início > Prontos para conferir)`);
  return partes.join("; ");
}
