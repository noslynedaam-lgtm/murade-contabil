// ALERTA URGENTE DE VENCIMENTO do Murad Contábil — mesmo padrão do Fiscal e do DP, para os vencimentos que são do Contábil:
// ECD, ECF, IRPJ/CSLL do Lucro Real (trimestral, estimativa mensal — DARF 2362/2484 — e ajuste anual) e IRRF sobre JCP (DARF 5706).
//
// - De onde vêm os prazos: a Central do Lucro Real (centralLucroReal.ts, mesmas obrigações, vencimentos e fontes) e, para as empresas
//   fora do Lucro Real, a ECD obrigatória e a ECF pelos mesmos prazos oficiais (IN RFB 2.003/2021, art. 5º; IN RFB 2.004/2021, art. 3º).
// - Quando avisa: 7, 3 e 1 dia antes; no dia do vencimento às 7h, ao meio-dia e às 16h30 (Brasília); e todo dia enquanto estiver
//   vencido (até 30 dias; depois disso o aviso diário da Central do Lucro Real continua). Nunca antes das 7h.
// - Para quem: a equipe inteira do escritório, pelo aviso no celular do Murad Fiscal (mesmos aparelhos e horário silencioso) — o
//   Contábil não tem aviso próprio. Cada pessoa pode desligar por tipo em Configurações (Meus alertas de vencimento no celular).
// - Multa se não resolver hoje: os cálculos que já existem (Lei 9.430/1996, art. 61, para a guia; MAED da ECD/ECF pela regra oficial
//   em multaAtrasoDeclaracao.ts). Sem base para calcular, diz a regra, sem número inventado.
// - Botão "Resolvido": para os avisos urgentes daquela obrigação (fica registrado com nome e hora; dá para desfazer). Não paga, não
//   transmite e não dá baixa no livro: a baixa do IRPJ/CSLL continua sendo o pagamento registrado na Central do Lucro Real.
// - Nunca faz consulta paga ao Serpro.
import { calcularAcrescimosFederais, type TabelaSelic } from "../utils/acrescimosFederais";
import { ecfSeAplica } from "../utils/demonstracoesAvancadas";
import { analisarObrigatoriedadeECD } from "../services/ecdService";
import { estimativaMultaDeclaracaoLR, vencimentoEcd, vencimentoEcf, type BasesMultaDeclaracao, type Obrigacao, type TipoObrigacao } from "./centralLucroReal";
import { mesesDaContabilidade, type Consultar } from "./lucroRealApuracao";

export type TipoUrgenteContabil = "CONTABIL_ECD" | "CONTABIL_ECF" | "CONTABIL_IRPJ_CSLL" | "CONTABIL_JCP";
export const TIPOS_URGENTE_CONTABIL: Array<{ tipo: TipoUrgenteContabil; nome: string }> = [
  { tipo: "CONTABIL_ECD", nome: "ECD (Escrituração Contábil Digital)" },
  { tipo: "CONTABIL_ECF", nome: "ECF (com e-Lalur e e-Lacs)" },
  { tipo: "CONTABIL_IRPJ_CSLL", nome: "IRPJ e CSLL do Lucro Real (DARF 2362, 2484, trimestrais e ajuste anual)" },
  { tipo: "CONTABIL_JCP", nome: "IRRF sobre JCP (DARF 5706)" },
];
const TIPO_DA_OBRIGACAO: Partial<Record<TipoObrigacao, TipoUrgenteContabil>> = { irpj: "CONTABIL_IRPJ_CSLL", csll: "CONTABIL_IRPJ_CSLL", irrf_jcp: "CONTABIL_JCP", ecd: "CONTABIL_ECD", ecf: "CONTABIL_ECF" };
export const tipoUrgenteDaObrigacao = (t: string): TipoUrgenteContabil | null => TIPO_DA_OBRIGACAO[t as TipoObrigacao] ?? null;

export const MINUTO_INICIO_AVISOS = 7 * 60;
export const MINUTO_MEIO_DIA = 12 * 60;
export const MINUTO_FIM_DA_TARDE = 16 * 60 + 30;
export const DIAS_ATRASO_NO_URGENTE = 30;

const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
export const diaSeguinte = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const fmtCnpj = (c: string) => c.replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Etapa do aviso agora (null = não avisa agora). Mesma regra do Fiscal e do DP. */
export function etapaInsistente(dias: number, minutosSP: number, hoje: string): string | null {
  if (minutosSP < MINUTO_INICIO_AVISOS) return null;
  if (dias < -DIAS_ATRASO_NO_URGENTE) return null;
  if (dias < 0) return `atrasado_${hoje}`;
  if (dias === 0) return minutosSP < MINUTO_MEIO_DIA ? "dia" : minutosSP < MINUTO_FIM_DA_TARDE ? "dia_12h" : "dia_17h";
  if (dias === 1) return "d1";
  if (dias <= 3) return "d3";
  if (dias <= 7) return "d7";
  return null;
}

export interface ItemUrgenteContabil {
  chave: string; cnpj: string; razaoSocial: string; tipo: TipoUrgenteContabil; obrigacaoId: string; descricao: string; categoria: "guia" | "declaracao";
  periodo: string; vencimento: string; dias: number; codigoDarf: string | null; valorCentavos: number | null;
  motivo: string; passos: string[]; multaSeAtrasar: string | null; fonte: string;
}

/** Multa se não resolver hoje (estimativa para amanhã), pelos cálculos que já existem. Sem base, diz a regra. */
export function multaSeNaoResolverHoje(o: Pick<Obrigacao, "tipo" | "periodo" | "vencimento" | "valorCentavos" | "guia">, hoje: string, selic: TabelaSelic, bases: BasesMultaDeclaracao = {}): string | null {
  const amanha = diaSeguinte(hoje > o.vencimento ? hoje : o.vencimento);
  const dias = diasEntre(hoje, o.vencimento);
  if (o.guia) {
    if (dias > 0) return "Se passar do vencimento: multa de mora de 0,33% por dia de atraso (até 20%) e juros Selic (Lei 9.430/1996, art. 61).";
    if (o.valorCentavos && o.valorCentavos > 0) {
      const r = calcularAcrescimosFederais({ principalCentavos: o.valorCentavos, vencimento: o.vencimento, pagamento: amanha, selic });
      if (r.ok && !r.emDia) return `pagando amanhã: multa ${reais(r.multaCentavos)} (${r.multaPercentual.toLocaleString("pt-BR")}%) e juros ${reais(r.jurosCentavos)} (${r.jurosPercentual.toLocaleString("pt-BR")}%), total ${reais(r.totalCentavos)} sobre ${reais(o.valorCentavos)}. Estimativa pela Lei 9.430/1996, art. 61; o valor oficial sai no Sicalc.`;
      if (r.ok === false) return `multa de 0,33% por dia (até 20%) e juros Selic (Lei 9.430/1996, art. 61). ${r.motivo}`;
    }
    return "multa de 0,33% por dia (até 20%) e juros Selic (Lei 9.430/1996, art. 61); o valor atualizado sai no Sicalc.";
  }
  if (dias > 0) return "Se passar do prazo: multa por atraso na entrega (MAED), pela regra oficial da declaração.";
  return estimativaMultaDeclaracaoLR(o, amanha, bases) || "multa por atraso na entrega (MAED), pela regra oficial da declaração.";
}

function passosDe(o: Obrigacao, tipo: TipoUrgenteContabil): string[] {
  const parar = 'Se já foi resolvido fora do sistema, toque em "Resolvido" na faixa vermelha para parar os avisos urgentes.';
  if (tipo === "CONTABIL_ECD") return ["Abra Livros › ECD, gere o arquivo e valide no PGE/PVA do SPED Contábil.", "Assine e transmita a ECD.", 'Em Demonstrações, marque "entregue" com o recibo.', parar];
  if (tipo === "CONTABIL_ECF") return ["Abra Livros › ECF, gere o arquivo (com e-Lalur e e-Lacs no Lucro Real) e valide no programa da ECF.", "Assine e transmita a ECF.", 'Em Demonstrações, marque "entregue" com o recibo.', parar];
  if (tipo === "CONTABIL_JCP") return [`Emita o DARF 5706 no Sicalc (IRRF sobre JCP${o.valorCentavos ? ` de ${reais(o.valorCentavos)}` : ""}).`, "Envie ao cliente e confirme o pagamento até o fim do dia.", "Na Central do Lucro Real, dê baixa do IRRF do JCP.", parar];
  return [
    o.estado === "confirmada" ? `Emita o DARF ${o.codigoDarf ?? ""} no Sicalc${o.valorCentavos ? ` (${reais(o.valorCentavos)})` : ""}.`.replace("DARF  no", "DARF no") : "Abra Livros › Apuração do Lucro Real, confira e confirme a apuração do período.",
    "Envie ao cliente e confirme o pagamento até o fim do dia.", "Na Central do Lucro Real, registre o pagamento (data e valor) para dar baixa.", parar,
  ];
}

/** Itens do alerta urgente de uma empresa, a partir das obrigações (Central do Lucro Real e ECD/ECF gerais). */
export function itensUrgentes(cnpj: string, razaoSocial: string, obrigacoes: Obrigacao[], hoje: string, selic: TabelaSelic, bases: BasesMultaDeclaracao, resolvidos: Set<string>): ItemUrgenteContabil[] {
  const out: ItemUrgenteContabil[] = []; const vistos = new Set<string>();
  for (const o of obrigacoes) {
    const tipo = tipoUrgenteDaObrigacao(o.tipo);
    if (!tipo || o.estado === "baixada" || vistos.has(o.id) || resolvidos.has(o.id)) continue;
    const dias = diasEntre(hoje, o.vencimento);
    if (dias > 7 || dias < -DIAS_ATRASO_NO_URGENTE) continue;
    vistos.add(o.id);
    const categoria = o.guia ? "guia" : "declaracao";
    out.push({
      chave: `${cnpj}|${o.id}`, cnpj, razaoSocial, tipo, obrigacaoId: o.id, descricao: o.descricao, categoria, periodo: o.periodo, vencimento: o.vencimento, dias,
      codigoDarf: o.codigoDarf, valorCentavos: o.valorCentavos, fonte: o.fonte,
      motivo: o.bloqueada ? `guia bloqueada pela Central do Lucro Real até você decidir: ${o.motivoBloqueio}` : o.estado === "confirmada" ? `ainda não foi dado como ${categoria === "guia" ? "pago" : "entregue"}` : `a apuração ainda não foi confirmada (${o.oQueFalta})`,
      passos: passosDe(o, tipo), multaSeAtrasar: multaSeNaoResolverHoje(o, hoje, selic, bases),
    });
  }
  return out.sort((a, b) => a.dias - b.dias || a.razaoSocial.localeCompare(b.razaoSocial));
}

/** ECD obrigatória e ECF da empresa (qualquer regime), ano-calendário anterior, pelos prazos oficiais da Central. */
export function obrigacoesEcdEcfGerais(payload: Record<string, any> | null, hoje: string): Obrigacao[] {
  const empresa = (payload?.empresa || {}) as Record<string, any>;
  const ano = Number(hoje.slice(0, 4)) - 1; const ent = empresa.entregasSped || {};
  const out: Obrigacao[] = [];
  const analise = analisarObrigatoriedadeECD({ regime: empresa.regime, presumidoLivroCaixa: empresa.presumidoLivroCaixa, presumidoDistribuiuLucroAcimaBase: empresa.presumidoDistribuiuLucroAcimaBase, simplesAporteCapital: empresa.simplesAporteCapital } as any);
  if (analise.situacao === "obrigatoria") out.push({ id: `ecd:${ano}`, tipo: "ecd", periodo: String(ano), descricao: `ECD do ano-calendário ${ano}`, vencimento: vencimentoEcd(ano), valorCentavos: null, codigoDarf: null, estado: ent[`ECD-${ano}`] ? "baixada" : "confirmada", oQueFalta: 'Transmita a ECD e marque "entregue" em Demonstrações (com o recibo).', fonte: "IN RFB 2.003/2021, art. 5º", guia: false, bloqueada: false, motivoBloqueio: null });
  if (ecfSeAplica(empresa.regime) === "sim") out.push({ id: `ecf:${ano}`, tipo: "ecf", periodo: String(ano), descricao: `ECF do ano-calendário ${ano}`, vencimento: vencimentoEcf(ano), valorCentavos: null, codigoDarf: null, estado: ent[`ECF-${ano}`] ? "baixada" : "confirmada", oQueFalta: 'Transmita a ECF e marque "entregue" em Demonstrações (com o recibo).', fonte: "IN RFB 2.004/2021, art. 3º", guia: false, bloqueada: false, motivoBloqueio: null });
  return out;
}

/** Bases da multa da ECD (receita bruta) e da ECF (lucro antes do IRPJ/CSLL) pela própria contabilidade (mesma conta da Central). */
export function basesDaMulta(payload: Record<string, any> | null, hoje: string): BasesMultaDeclaracao {
  const bases: BasesMultaDeclaracao = { receitaBrutaPorAno: {}, lucroAntesIrpjCsllPorAno: {} };
  if (!payload) return bases;
  const ano = Number(hoje.slice(0, 4));
  for (const a of [ano - 2, ano - 1]) {
    const ms = mesesDaContabilidade(payload, a);
    const rb = ms.reduce((t, m) => t + m.receitaBrutaCentavos, 0);
    if (rb > 0) { bases.receitaBrutaPorAno![String(a)] = rb; bases.lucroAntesIrpjCsllPorAno![String(a)] = ms.reduce((t, m) => t + m.resultadoCentavos + m.irpjCentavos + m.csllCentavos, 0); }
  }
  return bases;
}

export function textoAlertaUrgenteContabil(i: ItemUrgenteContabil, etapa: string): { titulo: string; corpo: string } {
  const d = i.dias;
  const quando = d < 0 ? `VENCIDO há ${-d} dia(s)` : d === 0 ? "URGENTE — vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias`;
  const curto = i.tipo === "CONTABIL_ECD" ? "ECD" : i.tipo === "CONTABIL_ECF" ? "ECF" : i.tipo === "CONTABIL_JCP" ? "IRRF sobre JCP (DARF 5706)" : i.descricao.split(" — ")[0] + (i.codigoDarf ? ` (DARF ${i.codigoDarf})` : "");
  // Tela bloqueada: sem valores no título; o corpo segue o mesmo padrão do Fiscal e do DP.
  const passos = i.passos.map((p, n) => `${n + 1}) ${p}`).join(" ");
  const multa = i.multaSeAtrasar ? ` ${d < 0 ? "Multa e juros" : "Se não resolver hoje"}: ${i.multaSeAtrasar.replace(/\.$/, "")}.` : "";
  void etapa;
  return {
    titulo: `${quando}: ${curto} — ${i.razaoSocial}`.slice(0, 160),
    // A multa vem antes do passo a passo: o Fiscal guarda até 500 letras e o que mais importa não pode ser cortado.
    corpo: `${i.razaoSocial} (CNPJ ${fmtCnpj(i.cnpj)}) · ${i.descricao} · vencimento ${dataBR(i.vencimento)}. Motivo: ${i.motivo}.${multa} O que fazer agora: ${passos}`.slice(0, 500),
  };
}

// ---------------------------------------------------------------------------------------------
// Banco: "Resolvido", envios aceitos pelo Fiscal e preferências por pessoa
// ---------------------------------------------------------------------------------------------
let pronta: Promise<void> | null = null;
export function prepararAlertaUrgenteContabil(q: Consultar): Promise<void> {
  pronta ??= q(`CREATE TABLE IF NOT EXISTS contabil_urgente_resolvidos (cnpj text NOT NULL, obrigacao_id text NOT NULL, por text NOT NULL, em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, obrigacao_id));
    CREATE TABLE IF NOT EXISTS contabil_urgente_resolvidos_hist (id bigserial PRIMARY KEY, cnpj text NOT NULL, obrigacao_id text NOT NULL, acao text NOT NULL, por text NOT NULL, em timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS contabil_urgente_envios (cnpj text NOT NULL, chave text NOT NULL, tipo text NOT NULL, titulo text NOT NULL, em timestamptz NOT NULL DEFAULT now(),
      destinatarios int NOT NULL DEFAULT 0, enviados int NOT NULL DEFAULT 0, sem_aparelho int NOT NULL DEFAULT 0, silenciados int NOT NULL DEFAULT 0, adiados int NOT NULL DEFAULT 0, falhas int NOT NULL DEFAULT 0, PRIMARY KEY (cnpj, chave));
    CREATE TABLE IF NOT EXISTS contabil_alerta_prefs (login text PRIMARY KEY, silenciar_tipos jsonb NOT NULL DEFAULT '[]'::jsonb, atualizado_em timestamptz NOT NULL DEFAULT now());`)
    .then(() => undefined).catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheAlertaUrgenteParaTeste(): void { pronta = null; }

export async function resolvidosDe(q: Consultar, cnpjs: string[]): Promise<Map<string, Set<string>>> {
  await prepararAlertaUrgenteContabil(q);
  const m = new Map<string, Set<string>>();
  if (!cnpjs.length) return m;
  for (const r of (await q(`SELECT cnpj, obrigacao_id FROM contabil_urgente_resolvidos WHERE cnpj = ANY($1::text[])`, [cnpjs])).rows) {
    const c = String(r.cnpj); const s = m.get(c) ?? new Set<string>(); s.add(String(r.obrigacao_id)); m.set(c, s);
  }
  return m;
}
const ID_VALIDO = /^(irpj|csll):\d{4}:(T0[1-4]|A(0[1-9]|1[0-2])|ANUAL)$|^(ecd|ecf):\d{4}$|^irrf_jcp:jcp-\d{8}-[a-z0-9]{1,16}$/;
/** "Resolvido" (ou desfazer): só para os avisos urgentes; não paga, não transmite e não dá baixa no livro. */
export async function marcarResolvido(q: Consultar, cnpj: string, obrigacaoId: string, por: string, desfazer: boolean): Promise<{ ok: true } | { erro: string }> {
  await prepararAlertaUrgenteContabil(q);
  if (!ID_VALIDO.test(obrigacaoId)) return { erro: "Obrigação desconhecida para o alerta urgente do Contábil." };
  if (desfazer) await q(`DELETE FROM contabil_urgente_resolvidos WHERE cnpj=$1 AND obrigacao_id=$2`, [cnpj, obrigacaoId]);
  else await q(`INSERT INTO contabil_urgente_resolvidos (cnpj, obrigacao_id, por) VALUES ($1,$2,$3) ON CONFLICT (cnpj, obrigacao_id) DO UPDATE SET por=$3, em=now()`, [cnpj, obrigacaoId, por.slice(0, 120)]);
  await q(`INSERT INTO contabil_urgente_resolvidos_hist (cnpj, obrigacao_id, acao, por) VALUES ($1,$2,$3,$4)`, [cnpj, obrigacaoId, desfazer ? "desfeito" : "resolvido", por.slice(0, 120)]);
  return { ok: true };
}

export async function lerPrefsAlerta(q: Consultar, login: string): Promise<{ silenciarTipos: TipoUrgenteContabil[] }> {
  await prepararAlertaUrgenteContabil(q);
  const r = (await q(`SELECT silenciar_tipos FROM contabil_alerta_prefs WHERE login=$1`, [String(login).trim().toLowerCase()])).rows[0];
  return { silenciarTipos: normalizarTipos(r?.silenciar_tipos) };
}
const normalizarTipos = (v: unknown): TipoUrgenteContabil[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((t) => TIPOS_URGENTE_CONTABIL.some((x) => x.tipo === t)))] as TipoUrgenteContabil[] : []);
export async function salvarPrefsAlerta(q: Consultar, login: string, bruto: unknown): Promise<{ silenciarTipos: TipoUrgenteContabil[] }> {
  await prepararAlertaUrgenteContabil(q);
  const silenciarTipos = normalizarTipos((bruto as any)?.silenciarTipos);
  await q(`INSERT INTO contabil_alerta_prefs (login, silenciar_tipos) VALUES ($1,$2::jsonb) ON CONFLICT (login) DO UPDATE SET silenciar_tipos=EXCLUDED.silenciar_tipos, atualizado_em=now()`, [String(login).trim().toLowerCase(), JSON.stringify(silenciarTipos)]);
  return { silenciarTipos };
}
/** Logins que desligaram cada tipo (vai junto com o aviso para o Fiscal não mandar para eles). */
export async function quemDesligou(q: Consultar): Promise<Map<string, string[]>> {
  await prepararAlertaUrgenteContabil(q);
  const m = new Map<string, string[]>();
  for (const r of (await q(`SELECT login, silenciar_tipos FROM contabil_alerta_prefs`)).rows) for (const t of normalizarTipos(r.silenciar_tipos)) m.set(t, [...(m.get(t) ?? []), String(r.login)]);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Envio (pelo Fiscal) e conferidor
// ---------------------------------------------------------------------------------------------
export interface CargaUrgente { chave: string; titulo: string; corpo: string; tipo: TipoUrgenteContabil; silenciadosPor: string[]; /** Quem já recebeu no aparelho ativado no próprio Contábil (o Fiscal não repete). */ entreguesNoContabil?: string[] }
export interface ResultadoEnvioFiscal { destinatarios: number; enviados: number; semAparelho: number; silenciados: number; adiados: number; falhas: number }
export type EnviarUrgente = (cnpj: string, avisos: CargaUrgente[]) => Promise<ResultadoEnvioFiscal>;
export interface ResumoUrgente { itens: number; avisosNovos: number; entregues: number; semAparelho: number; silenciados: number; jaEnviados: number; falhasFiscal: number; erros: string[] }

export async function enviarAlertasUrgentes(q: Consultar, itens: ItemUrgenteContabil[], enviar: EnviarUrgente, hoje: string, minutosSP: number, aoProgresso?: (feito: number, total: number) => void): Promise<ResumoUrgente> {
  await prepararAlertaUrgenteContabil(q);
  const r: ResumoUrgente = { itens: itens.length, avisosNovos: 0, entregues: 0, semAparelho: 0, silenciados: 0, jaEnviados: 0, falhasFiscal: 0, erros: [] };
  const desligou = await quemDesligou(q);
  let feito = 0;
  for (const i of itens) {
    aoProgresso?.(feito, itens.length); feito += 1;
    const etapa = etapaInsistente(i.dias, minutosSP, hoje); if (!etapa) continue;
    const chave = `urgente|${i.obrigacaoId}|${etapa}`;
    if ((await q(`SELECT 1 FROM contabil_urgente_envios WHERE cnpj=$1 AND chave=$2`, [i.cnpj, chave])).rows.length) { r.jaEnviados += 1; continue; }
    const t = textoAlertaUrgenteContabil(i, etapa);
    try {
      const e = await enviar(i.cnpj, [{ chave, titulo: t.titulo, corpo: t.corpo, tipo: i.tipo, silenciadosPor: desligou.get(i.tipo) ?? [] }]);
      await q(`INSERT INTO contabil_urgente_envios (cnpj, chave, tipo, titulo, destinatarios, enviados, sem_aparelho, silenciados, adiados, falhas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (cnpj, chave) DO NOTHING`,
        [i.cnpj, chave, i.tipo, t.titulo, e.destinatarios, e.enviados, e.semAparelho, e.silenciados, e.adiados, e.falhas]);
      r.avisosNovos += 1; r.entregues += e.enviados; r.semAparelho += e.semAparelho; r.silenciados += e.silenciados;
    } catch (err: any) { r.falhasFiscal += 1; if (r.erros.length < 3) r.erros.push(String(err?.message || err).slice(0, 120)); }
  }
  aoProgresso?.(itens.length, itens.length);
  return r;
}

/** Conferidor: item que já devia ter sido avisado agora e não tem envio aceito pelo Fiscal = falha; aceito sem ninguém com aparelho = atenção. */
export async function conferirAlertasUrgentes(q: Consultar, itens: ItemUrgenteContabil[], hoje: string, minutosSP: number): Promise<{ semEnvio: string[]; semAparelho: string[] }> {
  await prepararAlertaUrgenteContabil(q);
  const semEnvio: string[] = []; const semAparelho: string[] = [];
  for (const i of itens) {
    const etapa = etapaInsistente(i.dias, minutosSP, hoje); if (!etapa) continue;
    const l = (await q(`SELECT destinatarios, enviados, sem_aparelho, silenciados FROM contabil_urgente_envios WHERE cnpj=$1 AND chave=$2`, [i.cnpj, `urgente|${i.obrigacaoId}|${etapa}`])).rows[0];
    const nome = `${i.razaoSocial}: ${i.descricao}`;
    if (!l) semEnvio.push(nome);
    else if (Number(l.destinatarios) === 0 || Number(l.sem_aparelho) + Number(l.silenciados) >= Number(l.destinatarios)) semAparelho.push(nome);
  }
  return { semEnvio, semAparelho };
}

/** Transporte real: o mesmo POST do aviso da Central do Lucro Real no Fiscal, com o tipo e quem desligou. */
export function enviarUrgentePeloFiscal(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): EnviarUrgente {
  return async (cnpj, avisos) => {
    const token = env.MURADE_INTEGRATION_TOKEN?.trim(); if (!token) throw new Error("MURADE_INTEGRATION_TOKEN não configurado no Contábil.");
    const destino = new URL("/api/integracao/contabil/aviso-lucro-real", (env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim());
    if (destino.protocol !== "https:" || destino.hostname !== "murade-fiscal-1.onrender.com" || destino.username || destino.password) throw new Error("Endereço do Fiscal fora da lista permitida.");
    const r = await fetcher(destino, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ cnpj, avisos }), signal: AbortSignal.timeout(60_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.sucesso !== true) throw new Error(j?.motivo || `O Fiscal respondeu HTTP ${r.status}.`);
    const n = (k: string) => (Number.isFinite(Number(j[k])) ? Number(j[k]) : 0);
    return { destinatarios: n("destinatarios"), enviados: n("enviados"), semAparelho: n("semAparelho"), silenciados: n("silenciados"), adiados: n("adiados"), falhas: n("falhas") };
  };
}

/** Tipos que saem pelo alerta urgente: o aviso diário da Central do Lucro Real não repete esses itens enquanto estiverem no urgente. */
export function cobertoPeloUrgente(obrigacaoId: string, dias: number): boolean {
  const tipo = tipoUrgenteDaObrigacao(obrigacaoId.split(":")[0]);
  return Boolean(tipo) && dias <= 7 && dias >= -DIAS_ATRASO_NO_URGENTE;
}

/** Quantos aparelhos a pessoa (pelo login) ativou no aviso do Murad Fiscal — para o convite "Ativar avisos" só aparecer a quem falta. */
export async function aparelhosNoFiscal(login: string, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<{ temConta: boolean; aparelhos: number } | null> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim(); if (!token || !login) return null;
  try {
    const destino = new URL("/api/integracao/contabil/aviso-aparelhos", (env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim());
    if (destino.protocol !== "https:" || destino.hostname !== "murade-fiscal-1.onrender.com" || destino.username || destino.password) return null;
    const r = await fetcher(destino, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ login }), signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.sucesso !== true) return null;
    return { temConta: j.temConta === true, aparelhos: Number.isFinite(Number(j.aparelhos)) ? Number(j.aparelhos) : 0 };
  } catch { return null; }
}
/** Endereço do Murad Fiscal para o convite (só o endereço permitido). */
export const urlDoFiscal = (env: Record<string, string | undefined> = process.env) => {
  try { const u = new URL((env.MURADE_FISCAL_URL || "https://murade-fiscal-1.onrender.com").trim()); return u.protocol === "https:" && u.hostname === "murade-fiscal-1.onrender.com" ? `${u.origin}/` : "https://murade-fiscal-1.onrender.com/"; }
  catch { return "https://murade-fiscal-1.onrender.com/"; }
};
