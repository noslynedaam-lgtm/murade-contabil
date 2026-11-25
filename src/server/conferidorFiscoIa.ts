// Robô Conferidor do Fisco IA → Contábil (só lê). Para cada empresa que recebeu itens do Fisco IA (guias, dívida ativa e parcelamentos
// consultados por clique no Integra Contador), confere se cada item virou pré-lançamento, se está esperando o mapeamento de contas
// ou se ficou de fora porque o Fiscal já tinha mandado o mesmo (sem lançar em dobro). Não consulta o Serpro, não grava nem aprova.
import { lerApuracoesFiscais, apuracoesStoreConfigurado, type ApuracaoFiscalArmazenada } from "./apuracoesFiscaisStore";
import { lerWorkspaceInternoContabil } from "./authContabil";
import { dataDaApuracao, motivoDuplicadoFiscoIa } from "./prepararRascunhosContabeis";
import { ORIGEM_POR_TRIBUTO, ID_PARA_ROTULO } from "../utils/origensContabeis";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Registro = Record<string, any>;

export type SituacaoItemFiscoIa = "pre_lancamento" | "contabilizado" | "aguardando_mapeamento" | "duplicado_do_fiscal";
export interface ItemFiscoIaConferido {
  cnpj: string; tributo: string; origem: string; competencia: string; data: string; valorCentavos: number; referencia: string;
  situacao: SituacaoItemFiscoIa; detalhe: string;
}

/** Situação de cada item do Fisco IA desta empresa (puro: recebe as apurações e o workspace). */
export function conferirItensFiscoIa(cnpj: string, apuracoes: ApuracaoFiscalArmazenada[], workspace: Registro | null): ItemFiscoIaConferido[] {
  const itens = apuracoes.filter((a) => /^FIA_/.test(a.tributo) && a.situacao === "confirmado");
  const pre: Registro[] = Array.isArray(workspace?.preLancamentos) ? workspace!.preLancamentos : [];
  const lanc: Registro[] = Array.isArray(workspace?.lancamentos) ? workspace!.lancamentos : [];
  const maps: Registro[] = Array.isArray(workspace?.mapeamentosOrigem) ? workspace!.mapeamentosOrigem : [];
  return itens.map((a) => {
    const id = ORIGEM_POR_TRIBUTO[a.tributo];
    const ref = `FISCAL:${cnpj}:${a.competencia}:APURACAO:${a.tributo}:${a.referencia}`;
    const base = { cnpj, tributo: a.tributo, origem: id ? ID_PARA_ROTULO[id] : a.tributo, competencia: a.competencia, data: dataDaApuracao(a), valorCentavos: a.valorCentavos, referencia: a.referencia };
    const dup = motivoDuplicadoFiscoIa(a, apuracoes);
    if (dup) return { ...base, situacao: "duplicado_do_fiscal" as const, detalhe: `Não entra: ${dup}.` };
    const p = pre.find((x) => x.referenciaOrigem === ref);
    if (p?.status === "contabilizado" || lanc.some((l) => l.documentoRef === ref || l.id === ref)) return { ...base, situacao: "contabilizado" as const, detalhe: "Já contabilizado." };
    if (p) return { ...base, situacao: "pre_lancamento" as const, detalhe: "Pré-lançamento esperando a sua conferência (Revisão das origens)." };
    const temMapa = maps.some((m) => m.origem === id);
    return { ...base, situacao: "aguardando_mapeamento" as const, detalhe: temMapa ? "O mapeamento desta origem tem conta que não é analítica ou repetida: revise as contas em Revisão das origens." : `Falta mapear as contas da origem "${base.origem}" em Revisão das origens.` };
  });
}

export async function conferirFiscoIaContabil(consultar: Consultar, cnpjs: string[] | null): Promise<{ empresas: number; itens: ItemFiscoIaConferido[] }> {
  if (!apuracoesStoreConfigurado()) return { empresas: 0, itens: [] };
  const lista = cnpjs ?? (await consultar("SELECT DISTINCT cnpj FROM murade_apuracoes_fiscais_origem WHERE tributo LIKE 'FIA\\_%'").catch(() => ({ rows: [] as any[] }))).rows.map((x: any) => String(x.cnpj).trim());
  const itens: ItemFiscoIaConferido[] = []; let empresas = 0;
  for (const cnpj of lista) {
    const apuracoes = await lerApuracoesFiscais(cnpj, "", "", 500).catch(() => [] as ApuracaoFiscalArmazenada[]);
    if (!apuracoes.some((a) => /^FIA_/.test(a.tributo))) continue;
    empresas += 1;
    itens.push(...conferirItensFiscoIa(cnpj, apuracoes, (await lerWorkspaceInternoContabil(cnpj)) as Registro | null));
  }
  return { empresas, itens };
}

export function resumoConferidorFiscoIa(r: { empresas: number; itens: ItemFiscoIaConferido[] }): string {
  if (!r.empresas) return "Nenhuma empresa recebeu guia, dívida ativa ou parcelamento do Fisco IA ainda.";
  const conta = (s: SituacaoItemFiscoIa) => r.itens.filter((i) => i.situacao === s).length;
  const semMapa = conta("aguardando_mapeamento");
  const texto = `${r.itens.length} item(ns) do Fisco IA em ${r.empresas} empresa(s): ${conta("pre_lancamento")} pré-lançamento(s) para conferir, ${conta("contabilizado")} contabilizado(s), ${conta("duplicado_do_fiscal")} que o Fiscal já tinha mandado (não entram de novo) e ${semMapa} esperando o mapeamento de contas.`;
  return semMapa ? `ATENÇÃO: ${texto}` : texto;
}
