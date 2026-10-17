import type { OrigemMapeadaContabil } from "../types";
import { lerDocumentosFiscais, fiscalStoreConfigurado } from "./documentosFiscaisStore";
import { lerResumosDP, dpStoreConfigurado } from "./dadosDpStore";
import { lerWorkspaceInternoContabil, mesclarRascunhosAutomaticosContabil, type RascunhoAutomaticoContabil } from "./authContabil";

type Registro = Record<string, any>;
type ResumoFolha = { competencia: string; calculadoEm?: string; atualizadoEm?: string; recebidoEm?: string; resumo?: Record<string, unknown> };

const mapeamentosOrigem = {
  "Fiscal — Entrada": "fiscal_entrada",
  "Fiscal — Saída": "fiscal_saida",
  "DP — Folha": "dp_folha_bruta",
  "DP — INSS": "dp_descontos_inss",
  "DP — IRRF": "dp_descontos_irrf",
  "DP — FGTS": "dp_fgts",
} satisfies Record<string, OrigemMapeadaContabil>;

const valorNumerico = (valor: unknown): number | null => typeof valor === "number" && Number.isFinite(valor) ? valor : null;

function dataCompetencia(valor: unknown): { data: string; competencia: string } | null {
  const texto = String(valor || "").trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const ano = br?.[3] || iso?.[1] || "";
  const mes = br?.[2] || iso?.[2] || "";
  const dia = br?.[1] || iso?.[3] || "01";
  const competencia = ano && mes ? `${ano}-${mes}` : "";
  const data = ano && mes ? `${ano}-${mes}-${dia}` : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(data)) return null;
  const dataObjeto = new Date(`${data}T00:00:00Z`);
  const valida = Number.isFinite(dataObjeto.getTime()) && dataObjeto.toISOString().slice(0, 10) === data;
  return valida && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) ? { data, competencia } : null;
}

function fiscalAutorizado(documento: Registro): boolean {
  const cancelado = /cancelad/i.test(String(documento.statusSefaz || ""))
    || (Array.isArray(documento.eventosSefaz) && documento.eventosSefaz.some((evento: Registro) =>
      evento?.confirmado === true && (/(cancelamento|cancelada)/i.test(String(evento.descricao || ""))
        || ["110111", "110112"].includes(String(evento.tipoEvento || ""))
      ),
    ));
  return !cancelado && documento.statusVerificadoSefaz === true && /autorizad/i.test(String(documento.statusSefaz || ""));
}

function gerarRascunhosFiscal(cnpj: string, documentos: Registro[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const candidatos: RascunhoAutomaticoContabil[] = [];
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const tributarios = ["valorIcms", "valorIpi", "valorPis", "valorCofins", "valorIss"];
  for (const documento of documentos) {
    if (!documento || documento.cnpjEmpresa?.toUpperCase().replace(/[^A-Z0-9]/g, "") !== cnpj || !fiscalAutorizado(documento)) continue;
    if (documento.tipo !== "Entrada" && documento.tipo !== "Saída") continue;
    const referenciaDocumento = String(documento.chaveAcesso || documento.id || "").trim();
    const periodo = dataCompetencia(documento.dataEmissao || documento.emissao);
    const valor = valorNumerico(documento.valorTotal);
    if (!referenciaDocumento || referenciaDocumento.length > 128 || !periodo || valor === null || valor <= 0
      || documento.dadosTributariosDisponiveis !== true
      || tributarios.some((campo) => valorNumerico(documento[campo]) !== 0)) continue;

    const origem = (documento.tipo === "Entrada" ? "Fiscal — Entrada" : "Fiscal — Saída") as keyof typeof mapeamentosOrigem;
    const mapping = mapeamentos.find((item) => item.origem === mapeamentosOrigem[origem]);
    if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
      || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) continue;

    const tipoReferencia = documento.tipo === "Entrada" ? "Entrada" : "Saida";
    const referencia = `FISCAL:${cnpj}:${periodo.competencia}:${tipoReferencia}:${referenciaDocumento}`;
    candidatos.push({
      id: referencia,
      referenciaOrigem: referencia,
      competencia: periodo.competencia,
      data: periodo.data,
      origem,
      contaDebitoCodigo: String(mapping.contaDebitoCodigo),
      contaCreditoCodigo: String(mapping.contaCreditoCodigo),
      valor: Math.round((valor + Number.EPSILON) * 100) / 100,
      historico: `${origem} NF-e ${referenciaDocumento} — valor bruto, pré-lançamento para conferência`,
      criadoEm: agora,
    });
  }
  return candidatos;
}

function gerarRascunhosFolha(cnpj: string, folhas: ResumoFolha[], contas: Registro[], mapeamentos: Registro[], agora: string): RascunhoAutomaticoContabil[] {
  const contasAnaliticas = new Set(contas.filter((conta) => conta?.tipo === "analitica").map((conta) => conta.codigo));
  const porCompetencia = new Map<string, ResumoFolha>();
  for (const folha of [...folhas].sort((a, b) => String(b.atualizadoEm || b.calculadoEm || b.recebidoEm || "").localeCompare(String(a.atualizadoEm || a.calculadoEm || a.recebidoEm || "")))) {
    if (!porCompetencia.has(folha.competencia)) porCompetencia.set(folha.competencia, folha);
  }

  const candidatos: RascunhoAutomaticoContabil[] = [];
  const origens = [
    { campo: "folhaBruta", origem: "DP — Folha", titulo: "Folha bruta" },
    { campo: "descontosINSS", origem: "DP — INSS", titulo: "INSS descontado do empregado" },
    { campo: "descontosIRRF", origem: "DP — IRRF", titulo: "IRRF descontado" },
    { campo: "fgts", origem: "DP — FGTS", titulo: "FGTS informado pelo DP" },
  ] as const;
  const obrigatorios = ["folhaBruta", "descontosINSS", "descontosIRRF", "descontosOutros", "liquidoFolha", "fgts"];

  for (const folha of porCompetencia.values()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(folha.competencia) || !folha.resumo) continue;
    const valores = folha.resumo;
    if (obrigatorios.some((campo) => valorNumerico(valores[campo]) === null)) continue;
    const folhaBruta = valorNumerico(valores.folhaBruta)!;
    const inss = valorNumerico(valores.descontosINSS)!;
    const irrf = valorNumerico(valores.descontosIRRF)!;
    const outros = valorNumerico(valores.descontosOutros)!;
    const liquido = valorNumerico(valores.liquidoFolha)!;
    if (outros !== 0 || Math.abs(Math.round((folhaBruta - inss - irrf + Number.EPSILON) * 100) / 100 - liquido) > 0.01) continue;

    const lote: RascunhoAutomaticoContabil[] = [];
    let completo = true;
    for (const item of origens) {
      const valor = valorNumerico(valores[item.campo]);
      if (valor === null || valor < 0) { completo = false; break; }
      if (valor === 0) continue;
      const mappingKey = mapeamentosOrigem[item.origem];
      const mapping = mapeamentos.find((candidate) => candidate.origem === mappingKey);
      if (!mapping || !contasAnaliticas.has(mapping.contaDebitoCodigo) || !contasAnaliticas.has(mapping.contaCreditoCodigo)
        || mapping.contaDebitoCodigo === mapping.contaCreditoCodigo) { completo = false; break; }
      const referencia = `DP:${cnpj}:${folha.competencia}:${item.campo}`;
      lote.push({
        id: referencia,
        referenciaOrigem: referencia,
        competencia: folha.competencia,
        data: `${folha.competencia}-01`,
        origem: item.origem,
        contaDebitoCodigo: String(mapping.contaDebitoCodigo),
        contaCreditoCodigo: String(mapping.contaCreditoCodigo),
        valor: Math.round((valor + Number.EPSILON) * 100) / 100,
        historico: `${item.titulo} — pré-lançamento para conferência`,
        criadoEm: agora,
      });
    }
    if (completo) candidatos.push(...lote);
  }
  return candidatos;
}

/** Prepares and saves drafts after an authenticated source update; never posts definitive entries. */
export async function gerarCandidatosRascunhosAutomaticos(cnpj: string, workspaceOverride?: Record<string, unknown>): Promise<RascunhoAutomaticoContabil[]> {
  if (!fiscalStoreConfigurado() || !dpStoreConfigurado()) return [];
  const workspace = workspaceOverride || await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return [];
  const contas = Array.isArray(workspace.contas) ? workspace.contas as Registro[] : [];
  const mapeamentos = Array.isArray(workspace.mapeamentosOrigem) ? workspace.mapeamentosOrigem as Registro[] : [];
  if (!mapeamentos.length) return [];

  const [documentos, folhas] = await Promise.all([
    lerDocumentosFiscais(cnpj, "", "", 500),
    lerResumosDP(cnpj, "", "", 200) as Promise<ResumoFolha[]>,
  ]);
  const agora = new Date().toISOString();
  const candidatos = [
    ...gerarRascunhosFiscal(cnpj, documentos as Registro[], contas, mapeamentos, agora),
    ...gerarRascunhosFolha(cnpj, folhas, contas, mapeamentos, agora),
  ];
  return candidatos;
}

export function mesclarRascunhosNoWorkspace(
  cnpj: string,
  workspace: Record<string, unknown>,
  candidatos: RascunhoAutomaticoContabil[],
): { workspace: Record<string, unknown>; criados: number; atualizados: number } {
  const normalizado = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const mapeamentos = Array.isArray(workspace.mapeamentosOrigem) ? workspace.mapeamentosOrigem as Registro[] : [];
  const lancamentos = Array.isArray(workspace.lancamentos) ? workspace.lancamentos as Registro[] : [];
  const preLancamentos = Array.isArray(workspace.preLancamentos) ? workspace.preLancamentos as Registro[] : [];
  const mesclados = [...preLancamentos];
  let criados = 0;
  let atualizados = 0;
  for (const candidato of candidatos) {
    const referencia = candidato.referenciaOrigem;
    if (!referencia.startsWith(`DP:${normalizado}:`) && !referencia.startsWith(`FISCAL:${normalizado}:`)) continue;
    if (lancamentos.some((item) => item.documentoRef === referencia || item.id === referencia)) continue;
    const mappingKey = mapeamentosOrigem[candidato.origem as keyof typeof mapeamentosOrigem];
    const mapping = mapeamentos.find((item) => item.origem === mappingKey);
    if (!mapping || mapping.contaDebitoCodigo !== candidato.contaDebitoCodigo || mapping.contaCreditoCodigo !== candidato.contaCreditoCodigo) continue;
    const indice = mesclados.findIndex((item) => item.referenciaOrigem === referencia);
    const existente = indice < 0 ? undefined : mesclados[indice];
    if (existente?.status === "contabilizado") continue;
    const proximo = {
      ...candidato,
      criadoEm: typeof existente?.criadoEm === "string" ? existente.criadoEm : candidato.criadoEm,
      status: "pendente_conferencia" as const,
      geradoAutomaticamente: true as const,
    };
    if (existente && existente.data === proximo.data && existente.competencia === proximo.competencia
      && existente.origem === proximo.origem && existente.contaDebitoCodigo === proximo.contaDebitoCodigo
      && existente.contaCreditoCodigo === proximo.contaCreditoCodigo && existente.valor === proximo.valor
      && existente.historico === proximo.historico) continue;
    if (indice < 0) { mesclados.push(proximo); criados += 1; }
    else { mesclados[indice] = proximo; atualizados += 1; }
  }
  return { workspace: criados || atualizados ? { ...workspace, preLancamentos: mesclados } : workspace, criados, atualizados };
}

export async function prepararRascunhosContabeisAutomaticos(cnpj: string): Promise<{ criados: number; atualizados: number }> {
  const workspace = await lerWorkspaceInternoContabil(cnpj);
  if (!workspace) return { criados: 0, atualizados: 0 };
  const candidatos = await gerarCandidatosRascunhosAutomaticos(cnpj, workspace);
  return mesclarRascunhosAutomaticosContabil(cnpj, candidatos);
}
