// Robô Conferidor das Origens (Fiscal × DP × Contábil) — pedido do dono em 23/11/2026: o Contábil tem que gerar serviço para TODAS
// as empresas cadastradas, de todos os escritórios, e ninguém pode perder nota.
//
// Por empresa e por mês, ao centavo:
//  - NOTAS: quantas valem e quanto somam no Fiscal × na cópia guardada aqui × no Contábil (pré-lançamento a conferir + lançado),
//    e por que cada nota que vale e ainda não entrou está de fora (motivo da regra de quem gera — diagnosticarNotaFiscal);
//  - nota CANCELADA, SUBSTITUÍDA, DENEGADA ou INUTILIZADA nunca entra: pré-lançamento pendente sai sozinho; lançada vira alerta vermelho
//    com estorno sugerido (nunca estorna sozinho);
//  - FOLHA do DP: o que o DP mandou (fila do DP) × a cópia recebida × as partidas do Contábil, item a item.
// Corrige sozinho só o seguro: pede de novo ao Fiscal a nota que faltou ou ficou desatualizada (gravação por chave, nunca duplica),
// recoloca na fila do DP a folha que não chegou, prepara os pré-lançamentos que faltaram e completa o plano provisório só acrescentando.
// Nada aqui aprova, lança em definitivo, estorna nem apaga lançamento.
import { historicoRegimeGuardado, simplesNaCompetencia, type PeriodoRegime } from "./dadosBackupDoFiscalContabil";
import { diagnosticarNotaFiscal, notaSemValor, notasSemLancamentoEmDobro, referenciaDaNotaFiscal, regimeSimplesNacional, TEXTO_MOTIVO, type MotivoSemRascunho } from "./prepararRascunhosContabeis";
import { ITENS_FOLHA_DP } from "../utils/origensContabeis";

type Registro = Record<string, any>;
type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export type ContagemValor = { qtd: number; centavos: number };
export type MesFiscal = { competencia: string; tipo: string; validas: ContagemValor; semValor: ContagemValor };
export type NotaFiscalResumo = { chave: string; competencia: string; tipo: string; centavos: number; semValor: boolean; situacao: string };

export type LinhaNotas = {
  competencia: string; tipo: string;
  fiscal: ContagemValor | null; fiscalSemValor: ContagemValor | null;
  copia: ContagemValor; copiaSemValor: ContagemValor;
  lancadas: ContagemValor; aConferir: ContagemValor;
  pendentes: ContagemValor & { motivos: Record<string, number> };
  semExplicacao: ContagemValor; valorDiferente: number;
  semValorLancadas: ContagemValor; semValorPendentes: ContagemValor;
  situacao: "ok" | "aviso" | "erro"; avisos: string[];
};
export type LinhaFolha = { competencia: string; situacaoDP: string; dp: ContagemValor; copia: ContagemValor | null; contabil: ContagemValor; faltam: string[]; situacao: "ok" | "aviso" | "erro"; aviso: string };
export type ResultadoEmpresaOrigens = {
  cnpj: string; nome: string; conferidoEm: string; fiscalRespondeu: boolean;
  notas: LinhaNotas[]; folhas: LinhaFolha[]; correcoes: string[]; avisos: string[];
  totais: { fiscal: ContagemValor | null; copia: ContagemValor; contabil: ContagemValor; pendentes: ContagemValor; semExplicacao: number; semValorLancadas: number; alertasEstorno: number };
  situacao: "ok" | "aviso" | "erro";
};

const zero = (): ContagemValor => ({ qtd: 0, centavos: 0 });
const soma = (c: ContagemValor, centavos: number) => { c.qtd += 1; c.centavos += centavos; };
const centavos = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0; };
export const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Início do trabalho do Fiscal (decisão do dono em 03/11/2026: só notas de setembro de 2026 em diante são conferidas na SEFAZ). */
export const INICIO_PERIODO_FISCAL = "2026-09";

/** Primeiro mês do PGDAS-D feito pelo Fiscal (decisão do dono em 16/11/2026: 08 e 09/2026 foram declarados fora do sistema). */
export const INICIO_DAS_FISCAL = "2026-10";

/**
 * Regra pura: meses já encerrados, a partir do INICIO_DAS_FISCAL, com saídas que valem e sem DAS do Simples confirmado vindo do Fiscal.
 * Só avisa: o valor do DAS é o que o Fiscal apurou e a contadora confirmou; nunca é inventado aqui.
 */
/** `historico`: períodos do regime que vieram do backup do sistema anterior pelo Fiscal; com ele, só cobra DAS dos meses em que a empresa
 *  estava no Simples (antes de entrar ou num intervalo fora do Simples, não cobra). Sem ele, vale o regime do cadastro de hoje. */
export function mesesSemDas(notas: LinhaNotas[], dasRecebidos: string[], simples: boolean, mesAtual: string, historico?: PeriodoRegime[] | null): string[] {
  if (!simples && !(historico && historico.length)) return [];
  const comDas = new Set(dasRecebidos);
  return [...new Set(notas.filter((l) => l.tipo === "Saída" && l.copia.qtd > 0 && l.competencia >= INICIO_DAS_FISCAL && l.competencia < mesAtual).map((l) => l.competencia))]
    .filter((c) => !comDas.has(c) && simplesNaCompetencia(historico, c, simples)).sort();
}

export const TEXTO_MOTIVO_CONFERIDOR: Record<string, string> = {
  ...TEXTO_MOTIVO,
  antes_do_periodo: "nota anterior a 09/2026 sem confirmação na SEFAZ: fora do período que o Fiscal confere (decisão de 03/11/2026)",
  migrada: "mês já lançado pela migração do sistema anterior (não lança em dobro)",
};

/**
 * Regra pura: tabela de notas por competência e tipo. `fiscal` = resumo do próprio Fiscal (null quando ele não respondeu).
 * Toda nota que vale está em exatamente um lugar: lançada, a conferir ou pendente com motivo; o que sobrar é "sem explicação" (erro).
 */
export function tabelaNotas(cnpj: string, documentos: Registro[], workspace: Registro, fiscal: MesFiscal[] | null, agora = new Date().toISOString()): LinhaNotas[] {
  const contas = Array.isArray(workspace?.contas) ? workspace.contas : [];
  const mapeamentos = Array.isArray(workspace?.mapeamentosOrigem) ? workspace.mapeamentosOrigem : [];
  const pre = new Map<string, Registro>((Array.isArray(workspace?.preLancamentos) ? workspace.preLancamentos : []).map((p: Registro) => [String(p?.referenciaOrigem), p]));
  const lanc = new Map<string, Registro>();
  for (const l of Array.isArray(workspace?.lancamentos) ? workspace.lancamentos : []) { if (l?.documentoRef) lanc.set(String(l.documentoRef), l); if (l?.id) lanc.set(String(l.id), l); }
  const simples = regimeSimplesNacional(workspace?.empresa?.regime);
  const naoMigradas = new Set(notasSemLancamentoEmDobro(documentos, workspace));
  const linhas = new Map<string, LinhaNotas>();
  const linha = (competencia: string, tipo: string): LinhaNotas => {
    const k = `${competencia}|${tipo}`;
    let l = linhas.get(k);
    if (!l) {
      l = { competencia, tipo, fiscal: fiscal ? zero() : null, fiscalSemValor: fiscal ? zero() : null, copia: zero(), copiaSemValor: zero(), lancadas: zero(), aConferir: zero(),
        pendentes: { ...zero(), motivos: {} }, semExplicacao: zero(), valorDiferente: 0, semValorLancadas: zero(), semValorPendentes: zero(), situacao: "ok", avisos: [] };
      linhas.set(k, l);
    }
    return l;
  };
  for (const m of fiscal ?? []) {
    if (m.tipo !== "Entrada" && m.tipo !== "Saída") continue;
    const l = linha(m.competencia, m.tipo);
    l.fiscal = { ...m.validas }; l.fiscalSemValor = { ...m.semValor };
  }
  for (const d of documentos) {
    if (!d || (d.tipo !== "Entrada" && d.tipo !== "Saída")) continue;
    const ref = referenciaDaNotaFiscal(cnpj, d);
    const competencia = ref ? ref.split(":")[2] : "sem-data";
    const l = linha(competencia, d.tipo);
    const valor = centavos(d.valorTotal);
    const p = ref ? pre.get(ref) : undefined;
    const lc = ref ? lanc.get(ref) : undefined;
    if (notaSemValor(d)) {
      soma(l.copiaSemValor, valor);
      if (lc || p?.status === "contabilizado") soma(l.semValorLancadas, valor);
      else if (p) soma(l.semValorPendentes, valor);
      continue;
    }
    soma(l.copia, valor);
    if (lc || p?.status === "contabilizado") { soma(l.lancadas, valor); if (centavos((lc ?? p)?.valor) !== valor) l.valorDiferente += 1; continue; }
    if (p) { soma(l.aConferir, valor); if (centavos(p.valor) !== valor) l.valorDiferente += 1; continue; }
    let motivo: string | null;
    if (!naoMigradas.has(d)) motivo = "migrada";
    else {
      motivo = diagnosticarNotaFiscal(cnpj, d, contas, mapeamentos, agora, simples).motivo as MotivoSemRascunho | null;
      if (motivo === "nao_confirmada" && competencia < INICIO_PERIODO_FISCAL) motivo = "antes_do_periodo";
    }
    if (motivo) { soma(l.pendentes, valor); l.pendentes.motivos[motivo] = (l.pendentes.motivos[motivo] || 0) + 1; }
    else soma(l.semExplicacao, valor);
  }
  for (const l of linhas.values()) {
    if (l.fiscal && (l.fiscal.qtd !== l.copia.qtd || l.fiscal.centavos !== l.copia.centavos)) l.avisos.push(`Fiscal tem ${l.fiscal.qtd} nota(s) (${reais(l.fiscal.centavos)}) e a cópia do Contábil ${l.copia.qtd} (${reais(l.copia.centavos)})`);
    if (l.fiscalSemValor && l.fiscalSemValor.qtd !== l.copiaSemValor.qtd) l.avisos.push(`canceladas/substituídas: ${l.fiscalSemValor.qtd} no Fiscal e ${l.copiaSemValor.qtd} na cópia do Contábil`);
    if (l.semExplicacao.qtd) l.avisos.push(`${l.semExplicacao.qtd} nota(s) que valem (${reais(l.semExplicacao.centavos)}) sem pré-lançamento e sem motivo`);
    if (l.semValorLancadas.qtd) l.avisos.push(`${l.semValorLancadas.qtd} nota(s) sem valor ainda lançada(s) (${reais(l.semValorLancadas.centavos)}): faça o estorno sugerido`);
    if (l.semValorPendentes.qtd) l.avisos.push(`${l.semValorPendentes.qtd} pré-lançamento(s) de nota sem valor ainda a sair`);
    if (l.valorDiferente) l.avisos.push(`${l.valorDiferente} lançamento(s) com valor diferente da nota`);
    const conferem = l.copia.qtd === l.lancadas.qtd + l.aConferir.qtd + l.pendentes.qtd + l.semExplicacao.qtd
      && l.copia.centavos === l.lancadas.centavos + l.aConferir.centavos + l.pendentes.centavos + l.semExplicacao.centavos;
    if (!conferem) l.avisos.push("a soma das partes não fecha com o total da cópia");
    const erro = !conferem || l.semExplicacao.qtd > 0 || l.semValorLancadas.qtd > 0 || l.valorDiferente > 0
      || (l.fiscal !== null && (l.fiscal.qtd !== l.copia.qtd || l.fiscal.centavos !== l.copia.centavos)) || (l.fiscalSemValor !== null && l.fiscalSemValor.qtd !== l.copiaSemValor.qtd);
    l.situacao = erro ? "erro" : (l.pendentes.qtd > 0 || l.semValorPendentes.qtd > 0 ? "aviso" : "ok");
  }
  return [...linhas.values()].sort((a, b) => b.competencia.localeCompare(a.competencia) || a.tipo.localeCompare(b.tipo));
}

/** Chaves que o Contábil precisa pedir de novo ao Fiscal: faltam na cópia ou a situação (vale / sem valor) está diferente. */
export function chavesParaReenviar(notasFiscal: NotaFiscalResumo[], documentos: Registro[]): string[] {
  const copia = new Map<string, Registro>();
  for (const d of documentos) for (const k of [d?.chaveAcesso, d?.chave, d?.id]) if (k) copia.set(String(k).trim(), d);
  return notasFiscal.filter((n) => { const d = copia.get(n.chave); return !d || notaSemValor(d) !== n.semValor || centavos(d.valorTotal) !== n.centavos; }).map((n) => n.chave);
}

/** Regra pura da folha: o que o DP mandou (fila do DP) × cópia recebida × partidas do Contábil, item por item, ao centavo. */
export function tabelaFolhas(cnpj: string, envios: Array<{ competencia: string; status: string; resumo: Registro; erro?: string }>, copias: Array<{ competencia: string; resumo: Registro }>, workspace: Registro): LinhaFolha[] {
  const pre = new Map<string, Registro>((Array.isArray(workspace?.preLancamentos) ? workspace.preLancamentos : []).map((p: Registro) => [String(p?.referenciaOrigem), p]));
  const lanc = new Map<string, Registro>();
  for (const l of Array.isArray(workspace?.lancamentos) ? workspace.lancamentos : []) { if (l?.documentoRef) lanc.set(String(l.documentoRef), l); }
  const copiaPorComp = new Map(copias.map((c) => [c.competencia, c.resumo]));
  const comps = [...new Set([...envios.map((e) => e.competencia), ...copias.map((c) => c.competencia)])].sort().reverse();
  return comps.map((competencia) => {
    const envio = envios.find((e) => e.competencia === competencia);
    const resumoDP = envio?.resumo ?? copiaPorComp.get(competencia) ?? {};
    const copia = copiaPorComp.get(competencia);
    const dp = zero(), cc = copia ? zero() : null, contabil = zero();
    const faltam: string[] = [];
    const semContaOpcional: string[] = [];
    let valorDiferente = 0;
    for (const item of ITENS_FOLHA_DP) {
      const v = centavos(resumoDP[item.campo]);
      if (v <= 0) continue;
      soma(dp, v);
      if (cc) soma(cc, centavos(copia?.[item.campo]));
      const ref = `DP:${cnpj}:${competencia}:${item.campo}`;
      const partida = lanc.get(ref) ?? pre.get(ref);
      if (partida) { soma(contabil, centavos(partida.valor)); if (centavos(partida.valor) !== v) valorDiferente += 1; }
      else if (("opcional" in item && item.opcional) || ("classificado" in item && item.classificado)) semContaOpcional.push(item.titulo);
      else faltam.push(item.titulo);
    }
    const situacaoDP = envio?.status ?? "recebida";
    const avisos: string[] = [];
    if (envio && envio.status === "failed") avisos.push(`o DP não conseguiu entregar${envio.erro ? `: ${envio.erro}` : ""}`);
    if (envio && (envio.status === "pending" || envio.status === "processing")) avisos.push("o DP ainda está entregando");
    if (!copia) avisos.push("a folha não chegou ao Contábil");
    else if (cc && (cc.centavos !== dp.centavos)) avisos.push(`a cópia recebida (${reais(cc.centavos)}) difere do DP (${reais(dp.centavos)})`);
    if (faltam.length) avisos.push(`sem partida (falta mapear a conta em Revisão das origens): ${faltam.join("; ")}`);
    if (semContaOpcional.length) avisos.push(`sem conta mapeada (item que só entra se mapeado): ${semContaOpcional.join("; ")}`);
    if (valorDiferente) avisos.push(`${valorDiferente} partida(s) com valor diferente do DP`);
    const erro = !copia || (cc !== null && cc.centavos !== dp.centavos) || valorDiferente > 0 || envio?.status === "failed";
    const aviso = faltam.length > 0 || semContaOpcional.length > 0 || (!!envio && envio.status !== "delivered");
    return { competencia, situacaoDP, dp, copia: cc, contabil, faltam, situacao: erro ? "erro" : (aviso ? "aviso" : "ok"), aviso: avisos.join("; ") };
  });
}

export type DepsConferidorOrigens = {
  consultar: Consultar;
  lerWorkspace: (cnpj: string) => Promise<Registro | null>;
  lerDocumentos: (cnpj: string) => Promise<Registro[]>;
  resumoFiscal: (cnpj: string, competencia?: string) => Promise<{ ok: boolean; meses?: MesFiscal[]; notas?: NotaFiscalResumo[]; motivo?: string }>;
  reenviarFiscal: (cnpj: string, chaves: string[]) => Promise<{ ok: boolean; reabertas?: number; motivo?: string }>;
  preparar: (cnpj: string) => Promise<{ criados: number; atualizados: number; retirados?: number; alertasEstorno?: number }>;
  completarPlano: (cnpj: string, automatico: boolean) => Promise<{ acrescentadas: number; gruposForaDoPadrao: string[] }>;
  agora?: () => Date;
};

const existeTabela = async (consultar: Consultar, t: string) => Boolean((await consultar("SELECT to_regclass($1) AS t", [t])).rows[0]?.t);

/** Confere UMA empresa, corrige o que é seguro e devolve o resultado (que o robô guarda). */
export async function conferirEmpresaOrigens(deps: DepsConferidorOrigens, cnpj: string): Promise<ResultadoEmpresaOrigens> {
  const agora = (deps.agora ?? (() => new Date()))();
  const correcoes: string[] = [];
  const avisos: string[] = [];
  let workspace = await deps.lerWorkspace(cnpj);
  const base = { cnpj, conferidoEm: agora.toISOString() };
  if (!workspace) {
    return { ...base, nome: cnpj, fiscalRespondeu: false, notas: [], folhas: [], correcoes, avisos: ["a empresa ainda não foi aberta no Contábil (o Robô Reconciliador abre sozinho no próximo minuto)"],
      totais: { fiscal: null, copia: zero(), contabil: zero(), pendentes: zero(), semExplicacao: 0, semValorLancadas: 0, alertasEstorno: 0 }, situacao: "erro" };
  }

  // 1) Plano provisório (pequeno e sem lançamento): completa só acrescentando.
  try {
    const plano = await deps.completarPlano(cnpj, true);
    if (plano.acrescentadas) correcoes.push(`plano de contas completado com ${plano.acrescentadas} conta(s) do padrão (nenhuma conta existente foi mudada)`);
    if (plano.gruposForaDoPadrao.length) avisos.push(`grupos do plano com outro significado que o padrão (${plano.gruposForaDoPadrao.join(", ")}): continuam como estão; a contadora decide se quer acrescentar as contas de receita e despesa do padrão`);
  } catch (e: any) { avisos.push(`não consegui completar o plano agora (${String(e?.message || e).slice(0, 120)})`); }

  // 2) Fiscal × cópia guardada aqui: o que faltou ou ficou desatualizado volta a ser pedido.
  let documentos = await deps.lerDocumentos(cnpj);
  const fiscal = await deps.resumoFiscal(cnpj).catch(() => ({ ok: false, motivo: "o Fiscal não respondeu" } as { ok: boolean; meses?: MesFiscal[]; motivo?: string }));
  const fiscalMeses = fiscal.ok ? (fiscal.meses ?? []) : null;
  if (!fiscal.ok) avisos.push(`não consegui ler o resumo do Fiscal agora (${fiscal.motivo || "sem resposta"}); confiro a parte do Contábil e tento o Fiscal na próxima rodada`);
  if (fiscalMeses) {
    const previa = tabelaNotas(cnpj, documentos, workspace, fiscalMeses, agora.toISOString());
    const divergentes = previa.filter((l) => l.fiscal && l.fiscalSemValor && (l.fiscal.qtd !== l.copia.qtd || l.fiscal.centavos !== l.copia.centavos || l.fiscalSemValor.qtd !== l.copiaSemValor.qtd)).slice(0, 12);
    const chaves: string[] = [];
    for (const l of divergentes) {
      const det = await deps.resumoFiscal(cnpj, l.competencia).catch(() => ({ ok: false } as { ok: boolean; notas?: NotaFiscalResumo[] }));
      if (det.ok) chaves.push(...chavesParaReenviar((det.notas ?? []).filter((n) => n.tipo === l.tipo), documentos));
    }
    if (chaves.length) {
      const r = await deps.reenviarFiscal(cnpj, [...new Set(chaves)].slice(0, 5000)).catch(() => ({ ok: false } as { ok: boolean; reabertas?: number; motivo?: string }));
      if (r.ok) correcoes.push(`${chaves.length} nota(s) que faltavam ou estavam desatualizadas aqui foram pedidas de novo ao Fiscal (chegam no próximo minuto; a gravação é por chave e não duplica)`);
      else avisos.push(`${chaves.length} nota(s) diferentes do Fiscal; não consegui pedir de novo agora (${r.motivo || "sem resposta"})`);
    }
  }

  // 3) Prepara o que faltou (e tira o pré-lançamento pendente de nota que deixou de valer) — mesma rotina do Reconciliador.
  let alertasEstorno = 0;
  try {
    const p = await deps.preparar(cnpj);
    if (p.criados) correcoes.push(`${p.criados} pré-lançamento(s) que faltavam foram preparados para conferência`);
    if (p.atualizados) correcoes.push(`${p.atualizados} pré-lançamento(s) atualizados com o dado novo da origem`);
    if (p.retirados) correcoes.push(`${p.retirados} pré-lançamento(s) de nota cancelada/substituída retirados (não serão contabilizados)`);
    alertasEstorno = p.alertasEstorno ?? 0;
    if (p.criados || p.atualizados || p.retirados) workspace = (await deps.lerWorkspace(cnpj)) ?? workspace;
  } catch (e: any) { avisos.push(`não consegui preparar os pré-lançamentos agora (${String(e?.message || e).slice(0, 120)})`); }
  if (alertasEstorno) avisos.push(`${alertasEstorno} nota(s) cancelada(s)/substituída(s) já contabilizada(s): alerta vermelho com o estorno sugerido em Revisão das origens`);

  documentos = await deps.lerDocumentos(cnpj);
  const notas = tabelaNotas(cnpj, documentos, workspace, fiscalMeses, agora.toISOString());

  // DAS do Simples: mês encerrado com faturamento e sem DAS confirmado no Fiscal fica sem provisão — avisa (nunca inventa o valor).
  try {
    if (await existeTabela(deps.consultar, "murade_apuracoes_fiscais_origem")) {
      const das = (await deps.consultar("SELECT DISTINCT competencia FROM murade_apuracoes_fiscais_origem WHERE cnpj=$1 AND tributo='DAS_SIMPLES' AND situacao='confirmado'", [cnpj])).rows.map((x: any) => String(x.competencia).trim());
      const faltam = mesesSemDas(notas, das, regimeSimplesNacional(workspace?.empresa?.regime), agora.toISOString().slice(0, 7), await historicoRegimeGuardado(deps.consultar, cnpj));
      if (faltam.length) avisos.push(`sem provisão do DAS do Simples de ${faltam.map((c) => c.replace(/(\d{4})-(\d{2})/, "$2/$1")).join(", ")}: o Fiscal ainda não tem DAS confirmado desse(s) mês(es) (se foi declarado fora do sistema, lance a provisão em Lançamentos)`);
    }
  } catch { /* a tabela de apurações pode não existir num banco novo */ }

  // 4) Folha: fila do DP × cópia recebida × partidas. A fila do DP fica no mesmo banco (DP e Contábil).
  let folhas: LinhaFolha[] = [];
  try {
    const temFila = await existeTabela(deps.consultar, "dp_accounting_outbox");
    const temCopia = await existeTabela(deps.consultar, "murade_folhas_dp_origem");
    const envios = temFila ? (await deps.consultar(`SELECT DISTINCT ON (competence) id, competence, status, payload, last_error FROM dp_accounting_outbox WHERE cnpj=$1 ORDER BY competence DESC, updated_at DESC LIMIT 24`, [cnpj])).rows : [];
    const copias = temCopia ? (await deps.consultar(`SELECT DISTINCT ON (competencia) competencia, resumo FROM murade_folhas_dp_origem WHERE cnpj=$1 ORDER BY competencia DESC, atualizado_em DESC LIMIT 24`, [cnpj])).rows : [];
    const env = envios.map((e: any) => ({ id: e.id, competencia: String(e.competence).trim(), status: String(e.status), resumo: (e.payload?.resumo ?? e.payload ?? {}) as Registro, erro: e.last_error ? String(e.last_error).slice(0, 160) : undefined }));
    folhas = tabelaFolhas(cnpj, env, copias.map((c: any) => ({ competencia: String(c.competencia).trim(), resumo: c.resumo || {} })), workspace);
    // Correção segura: folha entregue pelo DP que não está aqui (ou chegou diferente) volta para a fila do DP; o Contábil grava por processamento.
    const reenviar = env.filter((e) => e.status === "delivered" && folhas.some((f) => f.competencia === e.competencia && (f.copia === null || f.copia.centavos !== f.dp.centavos)));
    for (const e of reenviar) {
      const r = await deps.consultar("UPDATE dp_accounting_outbox SET status='pending', next_attempt_at=now(), last_error=NULL, updated_at=now() WHERE id=$1 AND status='delivered'", [e.id]);
      if (r.rowCount) correcoes.push(`folha ${e.competencia.replace(/(\d{4})-(\d{2})/, "$2/$1")} pedida de novo ao DP (não estava igual aqui)`);
    }
  } catch (e: any) { avisos.push(`não consegui conferir a folha agora (${String(e?.message || e).slice(0, 120)})`); }

  const totais = {
    fiscal: fiscalMeses ? notas.reduce((t, l) => ({ qtd: t.qtd + (l.fiscal?.qtd ?? 0), centavos: t.centavos + (l.fiscal?.centavos ?? 0) }), zero()) : null,
    copia: notas.reduce((t, l) => ({ qtd: t.qtd + l.copia.qtd, centavos: t.centavos + l.copia.centavos }), zero()),
    contabil: notas.reduce((t, l) => ({ qtd: t.qtd + l.lancadas.qtd + l.aConferir.qtd, centavos: t.centavos + l.lancadas.centavos + l.aConferir.centavos }), zero()),
    pendentes: notas.reduce((t, l) => ({ qtd: t.qtd + l.pendentes.qtd, centavos: t.centavos + l.pendentes.centavos }), zero()),
    semExplicacao: notas.reduce((t, l) => t + l.semExplicacao.qtd, 0),
    semValorLancadas: notas.reduce((t, l) => t + l.semValorLancadas.qtd, 0),
    alertasEstorno,
  };
  const situacoes = [...notas.map((l) => l.situacao), ...folhas.map((f) => f.situacao)];
  const situacao = situacoes.includes("erro") || alertasEstorno > 0 ? "erro" : (situacoes.includes("aviso") || avisos.length || !fiscal.ok ? "aviso" : "ok");
  return { ...base, nome: String(workspace?.empresa?.razaoSocial || workspace?.empresa?.nomeFantasia || cnpj), fiscalRespondeu: fiscal.ok, notas, folhas, correcoes, avisos, totais, situacao };
}

// ===== Guarda do resultado e andamento da rodada =====

export async function prepararTabelaConferenciaOrigens(consultar: Consultar): Promise<void> {
  await consultar(`CREATE TABLE IF NOT EXISTS contabil_conferencia_origens (cnpj text PRIMARY KEY, resultado jsonb NOT NULL, situacao text NOT NULL, conferido_em timestamptz NOT NULL DEFAULT now())`);
}

export async function guardarResultadoOrigens(consultar: Consultar, r: ResultadoEmpresaOrigens): Promise<void> {
  await consultar(`INSERT INTO contabil_conferencia_origens (cnpj, resultado, situacao, conferido_em) VALUES ($1, $2::jsonb, $3, $4)
    ON CONFLICT (cnpj) DO UPDATE SET resultado=EXCLUDED.resultado, situacao=EXCLUDED.situacao, conferido_em=EXCLUDED.conferido_em`, [r.cnpj, JSON.stringify(r), r.situacao, r.conferidoEm]);
}

/** Resultados guardados só das empresas pedidas (a rota passa as da sessão: um escritório nunca vê o de outro). */
export async function lerResultadosOrigens(consultar: Consultar, cnpjs: string[]): Promise<ResultadoEmpresaOrigens[]> {
  if (!cnpjs.length) return [];
  await prepararTabelaConferenciaOrigens(consultar);
  const r = await consultar("SELECT resultado FROM contabil_conferencia_origens WHERE cnpj = ANY($1::text[]) ORDER BY situacao='ok', cnpj", [cnpjs]);
  return r.rows.map((x) => x.resultado as ResultadoEmpresaOrigens);
}

export type Andamento = { executando: boolean; total: number; feitas: number; inicio: string | null; fim: string | null; resumo: string | null };
const andamentos = new Map<string, Andamento>();
/** Andamento por escopo ("todas" = robô; "esc:<escritório>" = Rodar agora do escritório). Só números, nunca nome de empresa. */
export const andamentoOrigens = (escopo: string): Andamento => andamentos.get(escopo) ?? { executando: false, total: 0, feitas: 0, inicio: null, fim: null, resumo: null };

/** Roda a conferência em várias empresas (2 por vez), guardando cada resultado e o andamento para a barra da tela. */
export async function rodarConferenciaOrigens(deps: DepsConferidorOrigens, cnpjs: string[], escopo: string): Promise<{ empresas: number; erro: number; aviso: number; ok: number; correcoes: number; alertasEstorno: number; semExplicacao: number }> {
  const atual = andamentoOrigens(escopo);
  if (atual.executando) throw Object.assign(new Error("A conferência já está rodando; acompanhe a barra de andamento."), { status: 409 });
  const a: Andamento = { executando: true, total: cnpjs.length, feitas: 0, inicio: new Date().toISOString(), fim: null, resumo: null };
  andamentos.set(escopo, a);
  const placar = { empresas: cnpjs.length, erro: 0, aviso: 0, ok: 0, correcoes: 0, alertasEstorno: 0, semExplicacao: 0 };
  try {
    await prepararTabelaConferenciaOrigens(deps.consultar);
    const fila = [...cnpjs];
    const trabalhador = async () => {
      for (let cnpj = fila.shift(); cnpj; cnpj = fila.shift()) {
        try {
          const r = await conferirEmpresaOrigens(deps, cnpj);
          await guardarResultadoOrigens(deps.consultar, r);
          placar[r.situacao] += 1; placar.correcoes += r.correcoes.length; placar.alertasEstorno += r.totais.alertasEstorno; placar.semExplicacao += r.totais.semExplicacao;
        } catch (e: any) {
          placar.erro += 1;
          console.error(`[Conferidor das Origens] Falha numa empresa: ${String(e?.message || e).slice(0, 200)}`);
        } finally { a.feitas += 1; }
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    return placar;
  } finally {
    a.executando = false; a.fim = new Date().toISOString();
    a.resumo = `${placar.empresas} empresa(s): ${placar.ok} certa(s), ${placar.aviso} com aviso, ${placar.erro} com diferença; ${placar.correcoes} correção(ões) feitas sozinhas.`;
  }
}

/** Texto do resumo do robô (só números: o painel do robô não mostra nome de empresa de outro escritório). */
export function textoRoboOrigens(p: { empresas: number; erro: number; aviso: number; ok: number; correcoes: number; alertasEstorno: number; semExplicacao: number }): string {
  return `${p.empresas} empresa(s) conferidas (Fiscal × DP × Contábil, por mês e ao centavo): ${p.ok} certa(s), ${p.aviso} com pendência explicada, ${p.erro} com diferença; ${p.correcoes} correção(ões) feitas sozinhas${p.alertasEstorno ? `; ${p.alertasEstorno} nota(s) cancelada(s) já lançada(s) esperando estorno` : ""}${p.semExplicacao ? `; ${p.semExplicacao} nota(s) sem pré-lançamento e sem motivo` : ""}.`;
}
