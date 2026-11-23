// CENTRAL DO LUCRO REAL — nada pode faltar (a multa é pesada). Para cada empresa do Lucro Real, por escritório (só as empresas da
// sessão), junta TODAS as obrigações com cálculo, guia e vencimento, avisa com insistência até a confirmação e a baixa, confere o
// Lucro Real contra o Fiscal (notas), o DP (folha) e a própria contabilidade, e refaz o IRPJ/CSLL por um segundo caminho.
//
// FONTES OFICIAIS (planalto.gov.br e gov.br/receitafederal, conferidas em 23/11/2026):
//  - IRPJ/CSLL: Lei 9.430/1996, arts. 1º, 2º, 5º e 6º (trimestral ou estimativa mensal com ajuste anual); Lei 9.249/1995, art. 3º,
//    § 1º (adicional de 10% acima de R$ 20.000 × meses; Perguntas e Respostas PJ 2025, cap. XV, perg. 018: o adicional não admite
//    dedução); Lei 8.981/1995, art. 35 (balancete de suspensão/redução); Lei 9.065/1995, arts. 15 e 16 (compensação até 30%).
//    Vencimento: último dia útil do mês seguinte ao período; ajuste anual até o último dia útil de março (Agenda Tributária RFB).
//  - PIS/COFINS não cumulativos: Lei 10.637/2002, art. 10, e Lei 10.833/2003, art. 11 (dia 25 do mês seguinte, antecipado se não for
//    dia útil). Apurados no Fiscal (DARF 6912/5856) e recebidos aqui.
//  - ECD: último dia útil de junho do ano seguinte (IN RFB 2.003/2021, art. 5º). ECF com e-Lalur/e-Lacs: último dia útil de julho
//    (IN RFB 2.004/2021, art. 3º). DCTFWeb (com o MIT dos tributos): último dia útil do mês seguinte (IN RFB 2.237/2024, art. 6º).
//    EFD-Contribuições: 10º dia útil do 2º mês seguinte (IN RFB 1.252/2012, art. 7º), só até a competência 12/2026 (NT
//    EFD-Contribuições nº 013/2026: a apuração regular do PIS/COFINS termina em 31/12/2026).
//  - Multa e juros de mora: Lei 9.430/1996, art. 61 (0,33% ao dia até 20%; Selic do mês seguinte ao vencimento até o anterior ao
//    pagamento + 1% no mês do pagamento) — src/utils/acrescimosFederais.ts; Selic mensal: Banco Central, SGS série 4390.
//
// O que NÃO está aqui (pendência visível na tela, nunca escondida): IRRF sobre JCP (o cálculo existe, mas o pagamento do JCP não é
// registrado em lugar nenhum para virar obrigação), retenções na fonte feitas pela empresa como tomadora (códigos 1708/5952) e
// notificação "push" no celular (o Contábil não tem push: o aviso aparece na faixa da tela, também no aplicativo instalado no celular,
// e na Agente IA).
import { calcularAcrescimosFederais, lerSerieSelicBcb, FONTE_ACRESCIMOS_FEDERAIS, type TabelaSelic } from "../utils/acrescimosFederais";
import { ehDiaUtil, diaUtilDepois, ultimoDiaUtilDoMes } from "../utils/prazosFederaisContabil";
import { lerConfigLucroReal, listarApuracoesReal, listarPagamentosReal, mesesDaContabilidade, prepararLucroReal, type Consultar, type LinhaApuracaoReal, type ConfigLucroReal } from "./lucroRealApuracao";

const dois = (n: number) => String(n).padStart(2, "0");
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const proxMes = (a: number, m: number) => (m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 });
export const DIAS_AVISO = [10, 5, 3, 1] as const;
export const ULTIMA_EFD_CONTRIBUICOES = "2026-12";

// ---------------------------------------------------------------------------------------------
// Vencimentos
// ---------------------------------------------------------------------------------------------
/** Dia 25 do mês seguinte; se não for dia útil, antecipa (Lei 10.637, art. 10; Lei 10.833, art. 11). */
export function vencimentoPisCofinsNC(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number); const s = proxMes(a, m);
  const d = new Date(Date.UTC(s.a, s.m - 1, 25)); while (!ehDiaUtil(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export const vencimentoDctfWeb = (competencia: string) => { const [a, m] = competencia.split("-").map(Number); const s = proxMes(a, m); return ultimoDiaUtilDoMes(s.a, s.m); };
/** 10º dia útil do 2º mês seguinte. */
export function vencimentoEfdContribuicoes(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number); const s1 = proxMes(a, m); const s2 = proxMes(s1.a, s1.m);
  const ultimoDoAnterior = new Date(Date.UTC(s2.a, s2.m - 1, 0)).toISOString().slice(0, 10);
  return diaUtilDepois(ultimoDoAnterior, 10);
}
export const vencimentoEcd = (anoCalendario: number) => ultimoDiaUtilDoMes(anoCalendario + 1, 6);
export const vencimentoEcf = (anoCalendario: number) => ultimoDiaUtilDoMes(anoCalendario + 1, 7);

// ---------------------------------------------------------------------------------------------
// Obrigações
// ---------------------------------------------------------------------------------------------
export type TipoObrigacao = "irpj" | "csll" | "pis_nc" | "cofins_nc" | "dctfweb" | "efd_contribuicoes" | "ecd" | "ecf";
export type EstadoObrigacao = "aguardando_apuracao" | "conferir" | "confirmada" | "baixada";
export interface Obrigacao {
  id: string; tipo: TipoObrigacao; periodo: string; descricao: string; vencimento: string; valorCentavos: number | null; codigoDarf: string | null;
  estado: EstadoObrigacao; oQueFalta: string; fonte: string; guia: boolean; bloqueada: boolean; motivoBloqueio: string | null;
}
export interface EntradaObrigacoes {
  hoje: string; config: ConfigLucroReal | null; apuracoes: LinhaApuracaoReal[]; pagamentos: Array<{ ano: number; periodo: string; tributo: string }>;
  /** Do Fiscal (murade_apuracoes_fiscais_origem): débitos de PIS/COFINS NC e pagamentos (PIS_NC_PAGO/COFINS_NC_PAGO) por competência. */
  pisCofinsFiscal: Array<{ tributo: string; competencia: string; valorCentavos: number }>;
  /** Competências com nota de saída recebida do Fiscal (para cobrar a apuração do PIS/COFINS que não chegou). */
  competenciasComSaida: Set<string>;
  entregasSped: Record<string, unknown>; baixas: Set<string>;
  bloqueios: Map<string, string>; // id da obrigação → motivo
}
const FONTE_IRPJ = "Lei 9.430/1996, arts. 1º, 2º, 5º e 6º; Lei 9.249/1995, art. 3º, § 1º; Agenda Tributária da Receita Federal";
const FONTE_PISCOFINS = "Lei 10.637/2002, art. 10; Lei 10.833/2003, art. 11 (DARF 6912/5856)";

/** Lista as obrigações do ano-calendário `ano` (e as declarações anuais do ano anterior) com o estado de cada uma. */
export function montarObrigacoes(ano: number, e: EntradaObrigacoes): Obrigacao[] {
  const out: Obrigacao[] = []; const hoje = e.hoje;
  const anoHoje = Number(hoje.slice(0, 4)); const mesHoje = Number(hoje.slice(5, 7));
  const ultimoMesTerminado = ano < anoHoje ? 12 : ano === anoHoje ? mesHoje - 1 : 0;
  const bloq = (id: string) => ({ bloqueada: e.bloqueios.has(id), motivoBloqueio: e.bloqueios.get(id) ?? null });
  // IRPJ / CSLL
  if (e.config) {
    const periodos: Array<{ periodo: string; meses: number[] }> = e.config.forma === "trimestral"
      ? [1, 2, 3, 4].filter((q) => q * 3 <= ultimoMesTerminado).map((q) => ({ periodo: `T0${q}`, meses: [q * 3 - 2, q * 3 - 1, q * 3] }))
      : [...Array.from({ length: ultimoMesTerminado }, (_, i) => ({ periodo: `A${dois(i + 1)}`, meses: [i + 1] })), ...(ultimoMesTerminado === 12 ? [{ periodo: "ANUAL", meses: Array.from({ length: 12 }, (_, i) => i + 1) }] : [])];
    for (const p of periodos) {
      const ap = e.apuracoes.find((x) => x.periodo === p.periodo);
      const ultimo = p.meses[p.meses.length - 1]; const s = proxMes(ano, ultimo);
      const vencPadrao = p.periodo === "ANUAL" ? ultimoDiaUtilDoMes(ano + 1, 3) : ultimoDiaUtilDoMes(s.a, s.m);
      for (const tributo of ["irpj", "csll"] as const) {
        const id = `${tributo}:${ano}:${p.periodo}`;
        const darf = ap?.resultado?.darfs?.find((d: any) => d.tributo === tributo);
        const valor = ap ? (tributo === "irpj" ? ap.irpjCentavos : ap.csllCentavos) : null;
        const pago = e.pagamentos.some((x) => x.ano === ano && x.periodo === p.periodo && x.tributo === tributo);
        let estado: EstadoObrigacao; let falta: string;
        if (!ap) { estado = "aguardando_apuracao"; falta = "O robô ainda não apurou este período: confira se a competência foi fechada e clique em \"Apurar agora\"."; }
        else if (ap.status !== "confirmado") { estado = "conferir"; falta = ap.status === "previa" ? "Prévia: feche a competência na contabilidade e confirme a apuração." : ap.status === "revisar" ? `Revisar: ${(ap.revisar || [])[0] || "veja a apuração"}` : "O robô apurou: confira e clique em \"Confirmar\"."; }
        else if (pago || (valor !== null && valor <= 0)) { estado = "baixada"; falta = valor !== null && valor <= 0 ? "Sem valor a pagar no período." : "Pago (pagamento registrado)."; }
        else { estado = "confirmada"; falta = "Confirmada: emita a guia no Sicalc, pague e registre o pagamento (data e valor) para dar baixa."; }
        out.push({ id, tipo: tributo, periodo: `${ano} ${p.periodo}`, descricao: `${tributo === "irpj" ? "IRPJ" : "CSLL"} Lucro Real — ${p.periodo === "ANUAL" ? "ajuste anual" : e.config.forma === "trimestral" ? `${p.periodo.slice(2)}º trimestre` : `estimativa de ${dois(p.meses[0])}/${ano}`}`, vencimento: darf?.vencimento || vencPadrao, valorCentavos: valor, codigoDarf: darf?.codigo ?? null, estado, oQueFalta: falta, fonte: darf?.fonte || FONTE_IRPJ, guia: true, ...bloq(id) });
      }
    }
  }
  // PIS/COFINS não cumulativos (Fiscal), DCTFWeb e EFD-Contribuições — mês a mês
  for (let m = 1; m <= ultimoMesTerminado; m += 1) {
    const c = `${ano}-${dois(m)}`;
    for (const [tipo, deb, pag, nome] of [["pis_nc", "PIS_NAO_CUMULATIVO", "PIS_NC_PAGO", "PIS"], ["cofins_nc", "COFINS_NAO_CUMULATIVA", "COFINS_NC_PAGO", "COFINS"]] as const) {
      const id = `${tipo}:${c}`;
      const debito = e.pisCofinsFiscal.find((x) => x.tributo === deb && x.competencia === c);
      const pago = e.pisCofinsFiscal.some((x) => x.tributo === pag && x.competencia === c);
      if (!debito && !e.competenciasComSaida.has(c) && !pago) continue; // mês sem nota e sem apuração: nada a cobrar
      const estado: EstadoObrigacao = pago ? "baixada" : debito ? "confirmada" : "aguardando_apuracao";
      out.push({ id, tipo, periodo: c, descricao: `${nome} não cumulativo de ${dois(m)}/${ano}`, vencimento: vencimentoPisCofinsNC(c), valorCentavos: null, codigoDarf: tipo === "pis_nc" ? "6912" : "5856", estado,
        oQueFalta: pago ? "Pago (registrado no Fiscal)." : debito ? `Confirmado no Fiscal (débito de ${reais(debito.valorCentavos)}; o valor a pagar, com créditos e saldo, está em Fiscal › Apuração e Guias). Registre o pagamento no Fiscal para dar baixa.` : "Há nota de saída do mês, mas o Fiscal ainda não confirmou a apuração do PIS/COFINS: confirme em Fiscal › Apuração e Guias.",
        fonte: FONTE_PISCOFINS, guia: true, ...bloq(id) });
    }
    const idD = `dctfweb:${c}`;
    out.push({ id: idD, tipo: "dctfweb", periodo: c, descricao: `DCTFWeb de ${dois(m)}/${ano} (IRPJ/CSLL/PIS/COFINS no MIT e a folha)`, vencimento: vencimentoDctfWeb(c), valorCentavos: null, codigoDarf: null,
      estado: e.baixas.has(idD) ? "baixada" : "confirmada", oQueFalta: e.baixas.has(idD) ? "Entregue (baixa registrada)." : "Transmita a DCTFWeb (com o MIT) e dê baixa com o recibo.", fonte: "IN RFB 2.237/2024, art. 6º", guia: false, ...bloq(idD) });
    if (c <= ULTIMA_EFD_CONTRIBUICOES) {
      const idE = `efd_contribuicoes:${c}`;
      out.push({ id: idE, tipo: "efd_contribuicoes", periodo: c, descricao: `EFD-Contribuições de ${dois(m)}/${ano}`, vencimento: vencimentoEfdContribuicoes(c), valorCentavos: null, codigoDarf: null,
        estado: e.baixas.has(idE) ? "baixada" : "confirmada", oQueFalta: e.baixas.has(idE) ? "Entregue (baixa registrada)." : "Transmita a EFD-Contribuições e dê baixa com o recibo.", fonte: "IN RFB 1.252/2012, art. 7º; NT EFD-Contribuições 013/2026", guia: false, ...bloq(idE) });
    }
  }
  // ECD e ECF do ano anterior (entregues no ano corrente)
  const anoDecl = ano - 1;
  for (const [tipo, nome, venc, fonte] of [["ecd", "ECD", vencimentoEcd(anoDecl), "IN RFB 2.003/2021, art. 5º"], ["ecf", "ECF (com e-Lalur e e-Lacs)", vencimentoEcf(anoDecl), "IN RFB 2.004/2021, art. 3º"]] as const) {
    const id = `${tipo}:${anoDecl}`; const ent = e.entregasSped[`${tipo.toUpperCase()}-${anoDecl}`];
    out.push({ id, tipo, periodo: String(anoDecl), descricao: `${nome} do ano-calendário ${anoDecl}`, vencimento: venc, valorCentavos: null, codigoDarf: null, estado: ent ? "baixada" : "confirmada", oQueFalta: ent ? "Entregue (marcada em Demonstrações)." : `Transmita a ${tipo.toUpperCase()} e marque "entregue" em Demonstrações (com o recibo).`, fonte, guia: false, ...bloq(id) });
  }
  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------------
// Alertas que insistem
// ---------------------------------------------------------------------------------------------
export type NivelAlerta = "vermelho" | "amarelo";
export interface AlertaLR { obrigacaoId: string; nivel: NivelAlerta; titulo: string; texto: string; vencimento: string; dias: number; multaCentavos: number | null; jurosCentavos: number | null; totalCentavos: number | null; estimativa: string | null }
/**
 * Regra (decisão do Beny, 23/11/2026): sem confirmação, avisa todo dia; confirmada e sem baixa, avisa aos 10, 5, 3 e 1 dia antes, no
 * dia e todo dia de atraso (com multa e juros estimados quando há valor). Só para com a confirmação E a baixa. Bloqueio = vermelho.
 */
export function alertasDasObrigacoes(obrigacoes: Obrigacao[], hoje: string, selic: TabelaSelic): AlertaLR[] {
  const out: AlertaLR[] = [];
  for (const o of obrigacoes) {
    if (o.estado === "baixada") continue;
    const dias = diasEntre(hoje, o.vencimento);
    const semConfirmar = o.estado === "conferir" || o.estado === "aguardando_apuracao";
    const marco = (DIAS_AVISO as readonly number[]).includes(dias) || dias <= 0;
    if (!semConfirmar && !marco && !o.bloqueada) continue;
    let multa: number | null = null, juros: number | null = null, total: number | null = null, estimativa: string | null = null;
    if (dias < 0 && o.guia && o.valorCentavos && o.valorCentavos > 0) {
      const r = calcularAcrescimosFederais({ principalCentavos: o.valorCentavos, vencimento: o.vencimento, pagamento: hoje, selic });
      if (r.ok && !r.emDia) { multa = r.multaCentavos; juros = r.jurosCentavos; total = r.totalCentavos; estimativa = `Pagando hoje: multa ${reais(r.multaCentavos)} (${r.multaPercentual.toLocaleString("pt-BR")}%) e juros ${reais(r.jurosCentavos)} (${r.jurosPercentual.toLocaleString("pt-BR")}%), total ${reais(r.totalCentavos)}. Estimativa (${FONTE_ACRESCIMOS_FEDERAIS}); o valor oficial sai no Sicalc.`; }
      else if (r.ok === false) estimativa = `Multa de 0,33% ao dia até 20% e juros Selic (Lei 9.430/1996, art. 61). ${r.motivo}`;
    } else if (dias < 0 && o.guia) estimativa = "Em atraso: multa de 0,33% ao dia (até 20%) e juros Selic (Lei 9.430/1996, art. 61). O valor a pagar está no sistema de origem (Fiscal) e o atualizado sai no Sicalc.";
    else if (dias < 0) estimativa = "Declaração em atraso: há multa por atraso na entrega; transmita o quanto antes.";
    const quando = dias > 0 ? `vence em ${dias} dia(s) (${dataBR(o.vencimento)})` : dias === 0 ? `vence HOJE (${dataBR(o.vencimento)})` : `ATRASADA há ${-dias} dia(s) (venceu em ${dataBR(o.vencimento)})`;
    const nivel: NivelAlerta = o.bloqueada || dias <= 3 || semConfirmar && dias <= 10 ? "vermelho" : "amarelo";
    out.push({ obrigacaoId: o.id, nivel, titulo: `${o.descricao}: ${quando}`, texto: o.bloqueada ? `GUIA BLOQUEADA até você decidir: ${o.motivoBloqueio}` : o.oQueFalta, vencimento: o.vencimento, dias, multaCentavos: multa, jurosCentavos: juros, totalCentavos: total, estimativa });
  }
  return out.sort((a, b) => (a.nivel === b.nivel ? a.dias - b.dias : a.nivel === "vermelho" ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// Segundo caminho (checagem cruzada do IRPJ/CSLL, em centavos inteiros, sem usar o motor da apuração)
// ---------------------------------------------------------------------------------------------
const c = (reaisValor: unknown) => Math.round(Number(reaisValor || 0) * 100);
/** percentual inteiro (15 = 15%) × centavos, arredondado meio-para-cima. */
const pct = (centavos: number, p: number) => (centavos <= 0 ? 0 : Number((BigInt(centavos) * BigInt(p) * 2n + 100n) / 200n));
const ALIQ_CSLL: Record<string, number> = { "1": 9, "4": 15, "3": 20 };
export interface ChecagemDoisCaminhos { ok: boolean; irpjCentavos: number; csllCentavos: number; diferencas: string[] }

export function irpjCsllPeloSegundoCaminho(l: Pick<LinhaApuracaoReal, "periodo" | "irpjCentavos" | "csllCentavos" | "resultado">, indAliquotaCsll: string): ChecagemDoisCaminhos {
  const res = l.resultado || {}; const d = res.detalhe || {}; const dif: string[] = [];
  const aliq = ALIQ_CSLL[indAliquotaCsll]; if (!aliq) return { ok: false, irpjCentavos: 0, csllCentavos: 0, diferencas: ["Alíquota da CSLL da configuração não é 9%, 15% nem 20%."] };
  const confere = (nome: string, um: number, outro: number) => { if (um !== outro) dif.push(`${nome}: apuração ${reais(um)} × segundo caminho ${reais(outro)} (diferença ${reais(um - outro)}).`); };
  let irpj: number, csll: number;
  if (res.forma === "estimativa") {
    const meses = d.modo === "B" ? Number(d.mes) : 1;
    const base = c(d.baseIrpj); const n620 = Array.isArray(d.n620) ? d.n620 : []; const n660 = Array.isArray(d.n660) ? d.n660 : [];
    const imp15 = pct(base, 15); const adic = base > 2_000_000 * meses ? pct(base - 2_000_000 * meses, 10) : 0;
    confere("IRPJ a 15% (N620, linha 3)", c(n620.find((x: any) => x.codigo === "3")?.valor), imp15);
    confere("Adicional (N620, linha 4)", c(n620.find((x: any) => x.codigo === "4")?.valor), adic);
    const dedIr = n620.filter((x: any) => !["1", "3", "4", "20.01", "26"].includes(String(x.codigo))).reduce((s: number, x: any) => s + c(x.valor), 0);
    irpj = Math.max(0, imp15 + adic - dedIr);
    const baseCs = c(d.baseCsll); const csAp = pct(baseCs, aliq);
    confere("CSLL apurada (N660, linha 3)", c(n660.find((x: any) => x.codigo === "3")?.valor), csAp);
    const dedCs = n660.filter((x: any) => !["2", "3", "12.01", "18"].includes(String(x.codigo))).reduce((s: number, x: any) => s + c(x.valor), 0);
    csll = Math.max(0, csAp - dedCs);
  } else {
    const meses = Array.isArray(res.meses) ? res.meses.length : 12;
    const somaTipo = (lista: any[], t: string) => (Array.isArray(lista) ? lista : []).filter((x) => x.tipo === t).reduce((s, x) => s + c(x.valor), 0);
    // e-Lalur: lucro antes do IRPJ + adições − exclusões; compensação ≤ 30% (Lei 9.065/95, art. 15)
    const lrac = c(d.lucroAntesIrpj) + somaTipo(d.m300, "A") - somaTipo(d.m300, "E");
    confere("Lucro real antes da compensação", c(d.lucroRealAntesCompensacao), lrac);
    const saldoP = Math.max(0, Number(res.saldoPrejuizoInicialCentavos || 0));
    const comp = lrac > 0 ? Math.min(saldoP, pct(lrac, 30)) : 0;
    confere("Compensação de prejuízo fiscal (até 30%)", c(d.compensacaoPrejuizo), comp);
    const base = lrac > 0 ? lrac - comp : lrac;
    confere("Base do IRPJ", c(d.baseIrpj), base);
    const imp15 = pct(base, 15); const adic = base > 2_000_000 * meses ? pct(base - 2_000_000 * meses, 10) : 0;
    const n630 = Array.isArray(d.n630) ? d.n630 : [];
    const dedIr = n630.filter((x: any) => ["19", "20", "21", "22", "23", "24", "25"].includes(String(x.codigo))).reduce((s: number, x: any) => s + c(x.valor), 0);
    irpj = imp15 + adic - c(d.incentivosDeduzidos) - dedIr;
    // e-Lacs
    const bneg = c(d.lucroAntesCsll) + somaTipo(d.m350, "A") - somaTipo(d.m350, "E");
    confere("Base da CSLL antes da compensação", c(d.baseNegativaCsllAntesCompensacao), bneg);
    const saldoB = Math.max(0, Number(res.saldoBaseNegativaInicialCentavos || 0));
    const compB = bneg > 0 ? Math.min(saldoB, pct(bneg, 30)) : 0;
    const baseCs = bneg > 0 ? bneg - compB : bneg;
    confere("Base da CSLL", c(d.baseCsll), baseCs);
    const n670 = Array.isArray(d.n670) ? d.n670 : [];
    const dedCs = n670.filter((x: any) => ["14", "15", "16", "17", "18", "19", "20"].includes(String(x.codigo))).reduce((s: number, x: any) => s + c(x.valor), 0);
    csll = pct(baseCs, aliq) - dedCs;
  }
  confere("IRPJ do período", l.irpjCentavos, irpj); confere("CSLL do período", l.csllCentavos, csll);
  return { ok: dif.length === 0, irpjCentavos: irpj, csllCentavos: csll, diferencas: dif };
}

// ---------------------------------------------------------------------------------------------
// Conferidor cruzado: Lucro Real × Fiscal (notas) × DP (folha) × Contábil (balancete)
// ---------------------------------------------------------------------------------------------
export type TipoDivergencia = "notas_x_receita" | "folha_x_contabil" | "pis_cofins_fiscal" | "dois_caminhos";
export interface Divergencia { id: string; competencia: string; tipo: TipoDivergencia; contabilCentavos: number | null; outroCentavos: number | null; explicacao: string }
export interface DadosConferencia {
  ano: number; ultimoMes: number;
  /** Receita bruta do balancete por mês (contas de receita bruta, credor positivo). */
  receitaContabil: Map<string, number>;
  /** Notas de saída do Fiscal (autorizadas, não canceladas): valor sem IPI e sem ICMS-ST, por mês. */
  notasSaida: Map<string, { valorCentavos: number; notas: number; semValor: number }>;
  /** Folha do DP (bruto da última folha recebida) e o que foi contabilizado como "DP — Folha", por mês. */
  folhaDp: Map<string, number>; folhaContabilizada: Map<string, number>;
  /** PIS/COFINS NC confirmados no Fiscal por mês. */
  pisCofinsConfirmado: Set<string>;
}
export function conferirCruzado(d: DadosConferencia): Divergencia[] {
  const out: Divergencia[] = [];
  for (let m = 1; m <= d.ultimoMes; m += 1) {
    const comp = `${d.ano}-${dois(m)}`;
    const rec = d.receitaContabil.get(comp) ?? 0; const nt = d.notasSaida.get(comp);
    if ((nt && (nt.valorCentavos !== rec || nt.semValor > 0)) || (!nt && rec !== 0)) {
      const v = nt?.valorCentavos ?? 0;
      out.push({ id: `${comp}:notas_x_receita`, competencia: comp, tipo: "notas_x_receita", contabilCentavos: rec, outroCentavos: v,
        explicacao: `Receita bruta no balancete ${reais(rec)}; notas de saída do Fiscal ${reais(v)} (${nt?.notas ?? 0} nota(s), sem IPI e ICMS-ST)${nt?.semValor ? `; ${nt.semValor} nota(s) sem valor` : ""}. Diferença ${reais(rec - v)}. De onde costuma vir: nota não contabilizada ou contabilizada em outro mês, receita lançada sem nota (serviço, aluguel, financeira na conta errada), nota cancelada que ficou no balancete, devolução de venda, ou frete/seguro/outras despesas na nota.` });
    }
    const fd = d.folhaDp.get(comp); const fc = d.folhaContabilizada.get(comp) ?? 0;
    if (fd !== undefined && fd !== fc) out.push({ id: `${comp}:folha_x_contabil`, competencia: comp, tipo: "folha_x_contabil", contabilCentavos: fc, outroCentavos: fd,
      explicacao: `Folha bruta do DP ${reais(fd)}; contabilizado como "DP — Folha" ${reais(fc)}. Diferença ${reais(fd - fc)}. De onde costuma vir: pré-lançamento da folha ainda não aprovado, folha recalculada no DP depois de contabilizada, ou lançamento manual da folha fora do pré-lançamento.` });
    if (nt && nt.notas > 0 && !d.pisCofinsConfirmado.has(comp)) out.push({ id: `${comp}:pis_cofins_fiscal`, competencia: comp, tipo: "pis_cofins_fiscal", contabilCentavos: null, outroCentavos: null,
      explicacao: `Há ${nt.notas} nota(s) de saída em ${dois(m)}/${d.ano}, mas o PIS/COFINS não cumulativos do mês não foi confirmado no Fiscal (Apuração e Guias): sem ele a provisão não chega e o DARF 6912/5856 pode ficar sem pagar.` });
  }
  return out;
}

/** Notas de saída do Fiscal por mês: valor total menos IPI e ICMS-ST; cancelada/denegada fica de fora. */
export function notasDeSaidaPorMes(docs: Array<{ competencia: string; tipo: string; documento: Record<string, any> }>): Map<string, { valorCentavos: number; notas: number; semValor: number }> {
  const out = new Map<string, { valorCentavos: number; notas: number; semValor: number }>();
  for (const x of docs) {
    if (x.tipo !== "Saída") continue;
    const n = x.documento || {};
    if (/cancelad|denegad|substitu/i.test(String(n.statusSefaz || n.situacao || ""))) continue;
    const a = out.get(x.competencia) ?? { valorCentavos: 0, notas: 0, semValor: 0 };
    const tot = Number(n.valorTotal);
    if (!Number.isFinite(tot)) { a.semValor += 1; out.set(x.competencia, a); continue; }
    a.valorCentavos += c(tot) - c(n.valorIpi) - c(n.valorIcmsSt ?? n.valorST ?? 0); a.notas += 1;
    out.set(x.competencia, a);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------------------------
let pronta: Promise<void> | null = null;
export function prepararCentralLucroReal(q: Consultar): Promise<void> {
  pronta ??= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS contabil_lr_baixas (cnpj text NOT NULL, obrigacao_id text NOT NULL, recibo text, por text NOT NULL, em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, obrigacao_id))`);
    await q(`CREATE TABLE IF NOT EXISTS contabil_lr_divergencias (cnpj text NOT NULL, id text NOT NULL, competencia text NOT NULL, tipo text NOT NULL, contabil_centavos bigint, outro_centavos bigint, explicacao text NOT NULL,
      estado text NOT NULL DEFAULT 'aberta', decisao_motivo text, decidido_por text, decidido_em timestamptz, visto_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, id))`);
    await q(`CREATE TABLE IF NOT EXISTS contabil_selic_mensal (competencia text PRIMARY KEY, taxa numeric(9,6) NOT NULL, fonte text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`);
  })().catch((e) => { pronta = null; throw e; });
  return pronta;
}
export function limparCacheCentralParaTeste(): void { pronta = null; }

export async function tabelaSelicContabil(q: Consultar): Promise<TabelaSelic> {
  await prepararCentralLucroReal(q); const t: TabelaSelic = {};
  for (const l of (await q(`SELECT competencia, taxa FROM contabil_selic_mensal`, [])).rows) t[String(l.competencia)] = Number(l.taxa);
  return t;
}
export const URL_SELIC_BCB = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados";
/** Selic oficial (Banco Central, SGS 4390), uma vez por dia pelo robô. Falha do BCB: a tabela anterior continua e o aviso diz que falta o mês. */
export async function atualizarSelicContabil(q: Consultar, buscar: (url: string) => Promise<unknown>, agora = new Date()): Promise<number> {
  await prepararCentralLucroReal(q);
  const f = (d: Date) => `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const linhas = lerSerieSelicBcb(await buscar(`${URL_SELIC_BCB}?formato=json&dataInicial=${f(new Date(Date.UTC(agora.getUTCFullYear() - 6, 0, 1)))}&dataFinal=${f(agora)}`));
  for (const l of linhas) await q(`INSERT INTO contabil_selic_mensal (competencia, taxa, fonte) VALUES ($1,$2,'Banco Central do Brasil — SGS 4390') ON CONFLICT (competencia) DO UPDATE SET taxa=EXCLUDED.taxa, atualizado_em=now()`, [l.competencia, l.taxa.toFixed(6)]);
  return linhas.length;
}

/** Grava as divergências achadas agora: nova ou com valor diferente → "aberta"; a que sumiu sai; a aceita com o mesmo valor fica aceita. */
export async function gravarDivergencias(q: Consultar, cnpj: string, ano: number, achadas: Divergencia[]): Promise<void> {
  await prepararCentralLucroReal(q);
  const atuais = new Map((await q(`SELECT * FROM contabil_lr_divergencias WHERE cnpj=$1 AND competencia LIKE $2`, [cnpj, `${ano}-%`])).rows.map((x) => [String(x.id), x]));
  for (const d of achadas) {
    const a = atuais.get(d.id);
    const mesmo = a && Number(a.contabil_centavos ?? NaN) === Number(d.contabilCentavos ?? NaN) && Number(a.outro_centavos ?? NaN) === Number(d.outroCentavos ?? NaN);
    if (a && mesmo) { await q(`UPDATE contabil_lr_divergencias SET explicacao=$3, visto_em=now() WHERE cnpj=$1 AND id=$2`, [cnpj, d.id, d.explicacao]); continue; }
    await q(`INSERT INTO contabil_lr_divergencias (cnpj, id, competencia, tipo, contabil_centavos, outro_centavos, explicacao, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'aberta')
      ON CONFLICT (cnpj, id) DO UPDATE SET contabil_centavos=$5, outro_centavos=$6, explicacao=$7, estado='aberta', decisao_motivo=NULL, decidido_por=NULL, decidido_em=NULL, visto_em=now()`, [cnpj, d.id, d.competencia, d.tipo, d.contabilCentavos, d.outroCentavos, d.explicacao]);
  }
  const ids = new Set(achadas.map((d) => d.id));
  for (const id of atuais.keys()) if (!ids.has(id)) await q(`DELETE FROM contabil_lr_divergencias WHERE cnpj=$1 AND id=$2`, [cnpj, id]);
}
export async function listarDivergencias(q: Consultar, cnpj: string, ano: number): Promise<Array<Divergencia & { estado: string; decisaoMotivo: string | null; decididoPor: string | null }>> {
  await prepararCentralLucroReal(q);
  return (await q(`SELECT * FROM contabil_lr_divergencias WHERE cnpj=$1 AND competencia LIKE $2 ORDER BY competencia, tipo`, [cnpj, `${ano}-%`])).rows.map((x) => ({ id: String(x.id), competencia: String(x.competencia), tipo: x.tipo, contabilCentavos: x.contabil_centavos === null ? null : Number(x.contabil_centavos), outroCentavos: x.outro_centavos === null ? null : Number(x.outro_centavos), explicacao: String(x.explicacao), estado: String(x.estado), decisaoMotivo: x.decisao_motivo ?? null, decididoPor: x.decidido_por ?? null }));
}
export async function decidirDivergencia(q: Consultar, cnpj: string, id: string, motivo: string, por: string): Promise<{ ok: true } | { erro: string }> {
  await prepararCentralLucroReal(q);
  if (String(motivo || "").trim().length < 10) return { erro: "Explique por que a diferença está certa (pelo menos 10 letras): isso fica registrado com o seu nome." };
  const r = await q(`UPDATE contabil_lr_divergencias SET estado='aceita', decisao_motivo=$3, decidido_por=$4, decidido_em=now() WHERE cnpj=$1 AND id=$2 AND estado='aberta'`, [cnpj, id, String(motivo).trim().slice(0, 500), por.slice(0, 120)]);
  return Number(r.rowCount ?? 0) ? { ok: true } : { erro: "Divergência não encontrada ou já decidida." };
}
export async function darBaixa(q: Consultar, cnpj: string, obrigacaoId: string, recibo: string, por: string, desfazer: boolean): Promise<{ ok: true } | { erro: string }> {
  await prepararCentralLucroReal(q);
  if (!/^(dctfweb|efd_contribuicoes):\d{4}-\d{2}$/.test(obrigacaoId)) return { erro: "Baixa aqui só para DCTFWeb e EFD-Contribuições. Guia: registre o pagamento; ECD/ECF: marque entregue em Demonstrações." };
  if (desfazer) { await q(`DELETE FROM contabil_lr_baixas WHERE cnpj=$1 AND obrigacao_id=$2`, [cnpj, obrigacaoId]); return { ok: true }; }
  await q(`INSERT INTO contabil_lr_baixas (cnpj, obrigacao_id, recibo, por) VALUES ($1,$2,$3,$4) ON CONFLICT (cnpj, obrigacao_id) DO UPDATE SET recibo=$3, por=$4, em=now()`, [cnpj, obrigacaoId, String(recibo || "").replace(/[^\w.\-/ ]/g, "").slice(0, 60) || null, por.slice(0, 120)]);
  return { ok: true };
}

/** Bloqueios por obrigação de IRPJ/CSLL: divergência aberta em algum mês do período, ou o segundo caminho não bateu. */
export function bloqueiosDoAno(ano: number, apuracoes: LinhaApuracaoReal[], divergencias: Array<{ competencia: string; estado: string; tipo: string; explicacao: string }>): Map<string, string> {
  const out = new Map<string, string>();
  const abertas = divergencias.filter((d) => d.estado === "aberta");
  for (const ap of apuracoes) {
    const meses: number[] = Array.isArray(ap.resultado?.meses) ? ap.resultado.meses : [];
    const comps = new Set(meses.map((m) => `${ano}-${dois(m)}`)); // meses do próprio período (estimativa: o mês; trimestre: os 3; ajuste: o ano)
    const doPeriodo = abertas.filter((d) => comps.has(d.competencia) || (d.tipo === "dois_caminhos" && d.competencia === `${ano}-${ap.periodo}`));
    if (!doPeriodo.length) continue;
    const motivo = `${doPeriodo.length} diferença(s) entre os sistemas no período (${[...new Set(doPeriodo.map((d) => d.competencia))].join(", ")}). Veja a Central do Lucro Real e decida cada uma.`;
    out.set(`irpj:${ano}:${ap.periodo}`, motivo); out.set(`csll:${ano}:${ap.periodo}`, motivo);
  }
  return out;
}
export async function periodoBloqueado(q: Consultar, cnpj: string, ano: number, periodo: string): Promise<string | null> {
  const aps = await listarApuracoesReal(q, cnpj, ano);
  return bloqueiosDoAno(ano, aps, await listarDivergencias(q, cnpj, ano)).get(`irpj:${ano}:${periodo}`) ?? null;
}

export interface DepsCentral {
  consultar: Consultar; hoje: () => string;
  lerWorkspace: (cnpj: string) => Promise<Record<string, any> | null>;
}
/** Dados que a conferência usa (tudo do próprio banco do Contábil: o que o Fiscal e o DP mandaram e o balancete). */
export async function dadosDaConferencia(deps: DepsCentral, cnpj: string, ano: number, payload: Record<string, any>): Promise<DadosConferencia> {
  const q = deps.consultar; const hoje = deps.hoje();
  const ultimoMes = ano < Number(hoje.slice(0, 4)) ? 12 : ano === Number(hoje.slice(0, 4)) ? Number(hoje.slice(5, 7)) - 1 : 0;
  const receitaContabil = new Map<string, number>();
  for (const m of mesesDaContabilidade(payload, ano)) receitaContabil.set(`${ano}-${dois(m.mes)}`, m.receitaBrutaCentavos);
  const existe = async (t: string) => Boolean((await q(`SELECT to_regclass($1) AS t`, [t])).rows[0]?.t);
  const docs = (await existe("murade_documentos_fiscais_origem")) ? (await q(`SELECT competencia, tipo, documento FROM murade_documentos_fiscais_origem WHERE cnpj=$1 AND competencia LIKE $2`, [cnpj, `${ano}-%`])).rows.map((x) => ({ competencia: String(x.competencia), tipo: String(x.tipo), documento: x.documento })) : [];
  const folhaDp = new Map<string, number>();
  if (await existe("murade_folhas_dp_origem")) for (const x of (await q(`SELECT DISTINCT ON (competencia) competencia, resumo FROM murade_folhas_dp_origem WHERE cnpj=$1 AND competencia LIKE $2 ORDER BY competencia, calculado_em DESC`, [cnpj, `${ano}-%`])).rows) {
    const b = Number(x.resumo?.folhaBruta); if (Number.isFinite(b)) folhaDp.set(String(x.competencia), c(b));
  }
  const folhaContabilizada = new Map<string, number>();
  for (const p of Array.isArray(payload?.preLancamentos) ? payload.preLancamentos : []) {
    if (p?.origem !== "DP — Folha" || p?.status !== "contabilizado" || !String(p?.competencia || "").startsWith(`${ano}-`)) continue;
    folhaContabilizada.set(p.competencia, (folhaContabilizada.get(p.competencia) ?? 0) + c(p.valor));
  }
  const pisCofinsConfirmado = new Set<string>();
  if (await existe("murade_apuracoes_fiscais_origem")) for (const x of (await q(`SELECT DISTINCT competencia FROM murade_apuracoes_fiscais_origem WHERE cnpj=$1 AND tributo IN ('PIS_NAO_CUMULATIVO','COFINS_NAO_CUMULATIVA') AND competencia LIKE $2`, [cnpj, `${ano}-%`])).rows) pisCofinsConfirmado.add(String(x.competencia));
  return { ano, ultimoMes, receitaContabil, notasSaida: notasDeSaidaPorMes(docs), folhaDp, folhaContabilizada, pisCofinsConfirmado };
}

/** Conferência de uma empresa e um ano: cruzada + segundo caminho. Grava as divergências e devolve o que achou. */
export async function conferirEmpresaLucroReal(deps: DepsCentral, cnpj: string, ano: number): Promise<{ divergencias: Divergencia[]; doisCaminhos: Array<{ periodo: string } & ChecagemDoisCaminhos> }> {
  const q = deps.consultar; await prepararLucroReal(q); await prepararCentralLucroReal(q);
  const cfg = await lerConfigLucroReal(q, cnpj); const payload = await deps.lerWorkspace(cnpj);
  if (!cfg || !payload) return { divergencias: [], doisCaminhos: [] };
  const achadas = conferirCruzado(await dadosDaConferencia(deps, cnpj, ano, payload));
  const doisCaminhos: Array<{ periodo: string } & ChecagemDoisCaminhos> = [];
  for (const ap of await listarApuracoesReal(q, cnpj, ano)) {
    const r = irpjCsllPeloSegundoCaminho(ap, cfg.indAliquotaCsll); doisCaminhos.push({ periodo: ap.periodo, ...r });
    if (!r.ok) achadas.push({ id: `${ano}-${ap.periodo}:dois_caminhos`, competencia: `${ano}-${ap.periodo}`, tipo: "dois_caminhos", contabilCentavos: ap.irpjCentavos + ap.csllCentavos, outroCentavos: r.irpjCentavos + r.csllCentavos,
      explicacao: `O IRPJ/CSLL de ${ap.periodo} calculado por dois caminhos não deu igual ao centavo: ${r.diferencas.join(" ")} Não pague antes de conferir: avise o suporte com esta mensagem.` });
  }
  await gravarDivergencias(q, cnpj, ano, achadas);
  return { divergencias: achadas, doisCaminhos };
}

/** Tudo da Central para uma empresa e um ano (tela, Agente e faixa). */
export async function painelCentral(deps: DepsCentral, cnpj: string, ano: number): Promise<{ obrigacoes: Obrigacao[]; alertas: AlertaLR[]; divergencias: Awaited<ReturnType<typeof listarDivergencias>>; pendenciasConhecidas: string[] }> {
  const q = deps.consultar; await prepararLucroReal(q); await prepararCentralLucroReal(q);
  const hoje = deps.hoje(); const config = await lerConfigLucroReal(q, cnpj);
  const apuracoes = await listarApuracoesReal(q, cnpj, ano);
  const pagamentos = (await listarPagamentosReal(q, cnpj, ano)).map((p) => ({ ano: p.ano, periodo: p.periodo, tributo: p.tributo }));
  const existe = async (t: string) => Boolean((await q(`SELECT to_regclass($1) AS t`, [t])).rows[0]?.t);
  const pisCofinsFiscal = (await existe("murade_apuracoes_fiscais_origem")) ? (await q(`SELECT tributo, competencia, sum(valor_centavos)::bigint AS v FROM murade_apuracoes_fiscais_origem WHERE cnpj=$1 AND competencia LIKE $2 AND tributo IN ('PIS_NAO_CUMULATIVO','COFINS_NAO_CUMULATIVA','PIS_NC_PAGO','COFINS_NC_PAGO') GROUP BY tributo, competencia`, [cnpj, `${ano}-%`])).rows.map((x) => ({ tributo: String(x.tributo), competencia: String(x.competencia), valorCentavos: Number(x.v) })) : [];
  const competenciasComSaida = new Set<string>((await existe("murade_documentos_fiscais_origem")) ? (await q(`SELECT DISTINCT competencia FROM murade_documentos_fiscais_origem WHERE cnpj=$1 AND tipo='Saída' AND competencia LIKE $2`, [cnpj, `${ano}-%`])).rows.map((x) => String(x.competencia)) : []);
  const payload = await deps.lerWorkspace(cnpj);
  const baixas = new Set((await q(`SELECT obrigacao_id FROM contabil_lr_baixas WHERE cnpj=$1`, [cnpj])).rows.map((x) => String(x.obrigacao_id)));
  const divergencias = await listarDivergencias(q, cnpj, ano);
  const bloqueios = bloqueiosDoAno(ano, apuracoes, divergencias);
  const obrigacoes = montarObrigacoes(ano, { hoje, config, apuracoes, pagamentos, pisCofinsFiscal, competenciasComSaida, entregasSped: payload?.empresa?.entregasSped || {}, baixas, bloqueios });
  const alertas = alertasDasObrigacoes(obrigacoes, hoje, await tabelaSelicContabil(q));
  for (const d of divergencias.filter((x) => x.estado === "aberta")) alertas.unshift({ obrigacaoId: `divergencia:${d.id}`, nivel: "vermelho", titulo: `Diferença entre os sistemas em ${d.competencia}`, texto: d.explicacao, vencimento: "", dias: 0, multaCentavos: null, jurosCentavos: null, totalCentavos: null, estimativa: null });
  if (!config) alertas.unshift({ obrigacaoId: "config", nivel: "vermelho", titulo: "Lucro Real sem configuração", texto: "Configure a apuração (forma trimestral ou estimativa, obrigada ou optante, saldos de prejuízo) em Livros › Apuração do Lucro Real: sem isso o robô não apura o IRPJ/CSLL.", vencimento: "", dias: 0, multaCentavos: null, jurosCentavos: null, totalCentavos: null, estimativa: null });
  const pendenciasConhecidas = [
    "IRRF sobre JCP (código 5706): o cálculo está em Livros › Apuração do Lucro Real › JCP, mas o pagamento do JCP não é registrado como obrigação: lance o DARF à parte.",
    "Retenções feitas pela empresa como tomadora (IRRF 1708, CSRF 5952): ficam no Fiscal (Retenções) e na EFD-Reinf; não entram nesta lista.",
    "EFD-Contribuições não cumulativa: o Fiscal não gera o arquivo do Lucro Real (C191/C195 e 1100 sem Nota Técnica oficial com o passo a passo); gere no PVA.",
    "Celular: o Contábil não tem notificação push; o aviso aparece na faixa vermelha da tela (também no aplicativo instalado) e na Agente IA.",
  ];
  return { obrigacoes, alertas, divergencias, pendenciasConhecidas };
}

/** Robô da Central: confere todas as empresas do Lucro Real (todos os escritórios, cada um com as suas). Só lê e grava divergências. */
export async function rodarCentralLucroReal(deps: DepsCentral, empresas: () => Promise<string[]>): Promise<{ empresas: number; divergencias: number; doisCaminhos: number; alertasVermelhos: number; resumo: string }> {
  const ano = Number(deps.hoje().slice(0, 4)); let div = 0, dc = 0, verm = 0; const lista = await empresas();
  for (const cnpj of lista) {
    try {
      for (const a of [ano - 1, ano]) { const r = await conferirEmpresaLucroReal(deps, cnpj, a); div += r.divergencias.filter((d) => d.tipo !== "dois_caminhos").length; dc += r.doisCaminhos.filter((x) => !x.ok).length; }
      verm += (await painelCentral(deps, cnpj, ano)).alertas.filter((x) => x.nivel === "vermelho").length;
    } catch (e: any) { console.error("[central lucro real]", cnpj, e?.message || e); }
  }
  return { empresas: lista.length, divergencias: div, doisCaminhos: dc, alertasVermelhos: verm, resumo: `${lista.length} empresa(s) do Lucro Real conferida(s): ${div} diferença(s) entre Fiscal, DP e Contábil; ${dc} período(s) em que o segundo caminho do IRPJ/CSLL não bateu; ${verm} aviso(s) vermelho(s) para o contador (vencendo, vencido, sem confirmar ou guia bloqueada).` };
}
