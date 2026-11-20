// REVISOR do Contábil (regras puras, sem banco e sem DOM): confere o serviço ANTES de gravar e aponta, em português simples, o que
// está faltando ou errado. Serve ao navegador (lançamento, conciliação, fechamento) e ao servidor (revisão geral do mês e robô semanal).
//
// Regras de ouro:
//  - Só afirma o que dá para provar com os dados do sistema: partida que não fecha, conta que não existe ou é sintética, data inválida
//    ou em mês fechado, lançamento repetido, Caixa com saldo credor, extrato sem conciliação, folha do DP sem partida.
//  - "Corrigir para mim" só quando a correção é DETERMINÍSTICA com dado que o sistema já tem (formato da data, código da conta pelo
//    plano de contas, total pela soma das partidas, nome da conta pelo plano). Nunca inventa valor, conta ou data.
//  - Mês fechado não é mexido: a correção de dado já salvo só vale para lançamento pendente de aprovação em mês aberto.
import type { ContaPlano, LancamentoContabil, PreLancamentoContabil } from "../types";
import { conferirFechamento } from "./fechamentoContabil";
import { converterCentavos, gerarRelatoriosContabeis, moedaContabil, normalizarDataContabil } from "./livrosContabeis";
import { grupoDemonstracao } from "./analiseContabil";
import type { BemImobilizado } from "./imobilizado";

export type NivelRevisor = "bloqueia" | "atencao";
export type AcaoRevisada = "lancamento" | "lancamento_multipartida" | "conciliacao_lancar" | "fechamento";
export const ACOES_REVISADAS: readonly AcaoRevisada[] = ["lancamento", "lancamento_multipartida", "conciliacao_lancar", "fechamento"];

export interface CorrecaoRevisor { campo: string; valor: string; explicacao: string }
export interface AchadoRevisor {
  regra: string; nivel: NivelRevisor; tipo: "falta" | "errado" | "risco"; texto: string;
  /** data-campo do campo na tela, para a seta do "Eu corrijo". */
  alvo?: string;
  correcao?: CorrecaoRevisor;
  pergunta?: string;
  fonte?: string;
}
export interface Revisao { acao: AcaoRevisada; achados: AchadoRevisor[]; bloqueia: boolean; ok: boolean; resumo: string }

export function fecharRevisao(acao: AcaoRevisada, achados: AchadoRevisor[]): Revisao {
  const vistos = new Set<string>();
  const unicos = achados.filter((a) => (vistos.has(a.regra) ? false : (vistos.add(a.regra), true)));
  unicos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "bloqueia" ? -1 : 1));
  const nB = unicos.filter((a) => a.nivel === "bloqueia").length; const nA = unicos.length - nB;
  return {
    acao, achados: unicos, bloqueia: nB > 0, ok: unicos.length === 0,
    resumo: unicos.length === 0 ? "Conferi e está tudo certo." : `Conferi e achei ${[nB ? `${nB} erro(s) que impedem gravar` : "", nA ? `${nA} ponto(s) de atenção` : ""].filter(Boolean).join(" e ")}.`,
  };
}

export function aplicarCorrecoes<T extends Record<string, any>>(dados: T, achados: AchadoRevisor[]): { dados: T; trocados: string[] } {
  const novo: Record<string, any> = { ...dados }; const trocados: string[] = [];
  for (const x of achados) if (x.correcao && Object.prototype.hasOwnProperty.call(novo, x.correcao.campo) && novo[x.correcao.campo] !== x.correcao.valor) { novo[x.correcao.campo] = x.correcao.valor; trocados.push(x.correcao.explicacao); }
  return { dados: novo as T, trocados };
}

export function parecerEmTexto(conferidos: string[], achados: Array<Pick<AchadoRevisor, "texto">>): string {
  const ok = conferidos.length ? `✅ Conferi: ${conferidos.join("; ")}.` : "";
  const at = achados.length ? `⚠️ Atenção: ${achados.map((a) => a.texto).join(" ")}` : "⚠️ Atenção: nada a apontar.";
  return [ok, at].filter(Boolean).join(" ");
}

const campo = (c: string) => `[data-campo=${c}]`;
const soAlfanum = (v: unknown) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const semAcento = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Data digitada em formato diferente, mas sem ambiguidade (5/10/2026, 05-10-2026, 05.10.2026, 05102026): devolve DD/MM/AAAA ou null. */
export function normalizarDataDigitada(v: unknown): string | null {
  const t = String(v ?? "").trim();
  let m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(t);
  if (!m) { const d = /^(\d{2})(\d{2})(\d{4})$/.exec(t); if (d) m = d; }
  if (!m) return null;
  const br = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  return normalizarDataContabil(br) ? br : null;
}

/** Conta do plano pelo que a pessoa digitou: código exato, código sem pontuação ou descrição exata. Só devolve se houver UMA. */
export function acharConta(contas: ContaPlano[], digitado: unknown): { exata: ContaPlano | null; sugestao: ContaPlano | null } {
  const t = String(digitado ?? "").trim();
  if (!t) return { exata: null, sugestao: null };
  const exata = contas.find((c) => c.codigo === t) ?? null;
  if (exata) return { exata, sugestao: null };
  const analiticas = contas.filter((c) => c.tipo === "analitica");
  const porCodigo = analiticas.filter((c) => soAlfanum(c.codigo) === soAlfanum(t));
  if (porCodigo.length === 1) return { exata: null, sugestao: porCodigo[0] };
  const porNome = analiticas.filter((c) => semAcento(c.descricao) === semAcento(t));
  return { exata: null, sugestao: porNome.length === 1 ? porNome[0] : null };
}

export interface ContextoLancamento { contas: ContaPlano[]; lancamentos: LancamentoContabil[]; fechadas: string[]; hoje: string }

function revisarData(dataTxt: string, ctx: ContextoLancamento, a: AchadoRevisor[]): string | null {
  const iso = normalizarDataContabil(dataTxt);
  if (!String(dataTxt || "").trim()) { a.push({ regra: "data_vazia", nivel: "bloqueia", tipo: "falta", texto: "Está faltando a data do lançamento.", alvo: campo("lancamento-data") }); return null; }
  if (!iso) {
    const certo = normalizarDataDigitada(dataTxt);
    a.push({ regra: "data_formato", nivel: "bloqueia", tipo: "errado", texto: `Está errado: "${dataTxt}" não é uma data no formato DD/MM/AAAA.`, alvo: campo("lancamento-data"), ...(certo ? { correcao: { campo: "data", valor: certo, explicacao: `data no formato certo: ${certo}` } } : {}) });
    return null;
  }
  const comp = iso.slice(0, 7);
  if (ctx.fechadas.includes(comp)) a.push({ regra: "mes_fechado", nivel: "bloqueia", tipo: "errado", texto: `A competência ${comp.slice(5)}/${comp.slice(0, 4)} está fechada: lançamento nela só depois que o contador reabrir.`, alvo: campo("lancamento-data") });
  if (iso > ctx.hoje) a.push({ regra: "data_futura", nivel: "atencao", tipo: "risco", texto: `A data ${iso.split("-").reverse().join("/")} é no futuro.`, alvo: campo("lancamento-data") });
  const anos = Number(ctx.hoje.slice(0, 4)) - Number(iso.slice(0, 4));
  if (anos >= 5) a.push({ regra: "data_antiga", nivel: "atencao", tipo: "risco", texto: `A data é de ${iso.slice(0, 4)}, ${anos} anos atrás: confira o ano.`, alvo: campo("lancamento-data") });
  return iso;
}

function revisarConta(lado: "debito" | "credito", digitado: string, ctx: ContextoLancamento, a: AchadoRevisor[], alvo: string): ContaPlano | null {
  const nome = lado === "debito" ? "a débito" : "a crédito";
  if (!String(digitado || "").trim()) { a.push({ regra: `conta_${lado}_vazia`, nivel: "bloqueia", tipo: "falta", texto: `Está faltando a conta ${nome}.`, alvo }); return null; }
  const { exata, sugestao } = acharConta(ctx.contas, digitado);
  if (!exata) {
    a.push({ regra: `conta_${lado}_inexistente`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a conta ${nome} "${digitado}" não existe no plano de contas.`, alvo, ...(sugestao ? { correcao: { campo: lado, valor: sugestao.codigo, explicacao: `conta ${nome} ${sugestao.codigo} — ${sugestao.descricao} (do plano de contas)` } } : {}) });
    return null;
  }
  if (exata.tipo !== "analitica") { a.push({ regra: `conta_${lado}_sintetica`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a conta ${nome} ${exata.codigo} (${exata.descricao}) é sintética (de grupo); lançamento só em conta analítica.`, alvo, pergunta: `Qual conta analítica do grupo ${exata.descricao} recebe este valor?` }); return null; }
  return exata;
}

/** Lançamento simples (1 débito x 1 crédito) antes de gravar. `valor` como digitado (número ou texto). */
export function revisarLancamento(d: { data: string; valor: string | number; debito: string; credito: string; historico: string }, ctx: ContextoLancamento): Revisao {
  const a: AchadoRevisor[] = [];
  const iso = revisarData(d.data, ctx, a);
  const v = typeof d.valor === "number" ? d.valor : Number(String(d.valor).replace(",", "."));
  const centavos = Number.isFinite(v) ? converterCentavos(v) : null;
  if (String(d.valor ?? "").trim() === "") a.push({ regra: "valor_vazio", nivel: "bloqueia", tipo: "falta", texto: "Está faltando o valor.", alvo: campo("lancamento-valor") });
  else if (centavos === null || centavos <= 0) a.push({ regra: "valor_invalido", nivel: "bloqueia", tipo: "errado", texto: "Está errado: o valor precisa ser maior que zero.", alvo: campo("lancamento-valor") });
  else if (Math.abs(v * 100 - centavos) > 1e-6) a.push({ regra: "valor_casas", nivel: "bloqueia", tipo: "errado", texto: `Está errado: o valor ${String(d.valor)} tem mais de 2 casas decimais (centavos).`, alvo: campo("lancamento-valor") });
  const deb = revisarConta("debito", d.debito, ctx, a, campo("lancamento-debito-codigo"));
  const cre = revisarConta("credito", d.credito, ctx, a, campo("lancamento-credito-codigo"));
  if (deb && cre && deb.codigo === cre.codigo) a.push({ regra: "mesma_conta", nivel: "bloqueia", tipo: "errado", texto: "Está errado: a conta a débito e a crédito são a mesma; a partida não muda nada.", alvo: campo("lancamento-credito-codigo") });
  const h = String(d.historico ?? "");
  if (!h.trim()) a.push({ regra: "historico_vazio", nivel: "bloqueia", tipo: "falta", texto: "Está faltando o histórico (o que foi a operação).", alvo: campo("lancamento-historico") });
  else if (h !== h.replace(/\s+/g, " ").trim()) a.push({ regra: "historico_espacos", nivel: "atencao", tipo: "errado", texto: "O histórico tem espaços ou quebras de linha sobrando.", alvo: campo("lancamento-historico"), correcao: { campo: "historico", valor: h.replace(/\s+/g, " ").trim(), explicacao: "histórico sem espaços sobrando" } });
  if (iso && deb && cre && centavos && centavos > 0) {
    const igual = ctx.lancamentos.find((l) => l.statusManual !== "rejeitado" && !l.estornoDe && normalizarDataContabil(l.data) === iso && l.contaDebitoCodigo === deb.codigo && l.contaCreditoCodigo === cre.codigo && converterCentavos(l.valor) === centavos);
    if (igual) a.push({ regra: "duplicado", nivel: "atencao", tipo: "risco", texto: `Parece repetido: já existe um lançamento de ${moedaContabil(centavos)} em ${iso.split("-").reverse().join("/")} de ${deb.codigo} para ${cre.codigo} ("${String(igual.historico).slice(0, 60)}").` });
  }
  return fecharRevisao("lancamento", a);
}

/** Lançamento com várias partidas (1 x N ou N x 1). Valores em texto como digitados ("1.234,56"). */
export function revisarMultipartida(d: { data: string; historico: string; forma: "1xN" | "Nx1"; contaUnica: string; total: string; partidas: Array<{ conta: string; valor: string }> }, ctx: ContextoLancamento, paraCentavos: (v: unknown) => number | null): Revisao {
  const a: AchadoRevisor[] = [];
  revisarData(d.data, ctx, a);
  const unica = revisarConta(d.forma === "1xN" ? "debito" : "credito", d.contaUnica, ctx, a, campo("lancamento-debito-codigo"));
  let soma = 0; let somaOk = true;
  d.partidas.forEach((p, i) => {
    const c = paraCentavos(p.valor);
    if (c === null || c <= 0) { somaOk = false; a.push({ regra: `partida_${i}_valor`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: o valor da partida ${i + 1} ("${p.valor}") não é um valor maior que zero (ex.: 1.234,56).` }); }
    else soma += c;
    const { exata, sugestao } = acharConta(ctx.contas, p.conta);
    if (!exata) a.push({ regra: `partida_${i}_conta`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a conta da partida ${i + 1} ("${p.conta}") não existe no plano.${sugestao ? ` Será ${sugestao.codigo} — ${sugestao.descricao}?` : ""}` });
    else if (exata.tipo !== "analitica") a.push({ regra: `partida_${i}_sintetica`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a conta da partida ${i + 1} (${exata.codigo}) é sintética.` });
    else if (unica && exata.codigo === unica.codigo) a.push({ regra: `partida_${i}_mesma`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a partida ${i + 1} usa a mesma conta do lado único.` });
  });
  const total = paraCentavos(d.total);
  if (String(d.total || "").trim() === "" && somaOk && soma > 0) a.push({ regra: "total_vazio", nivel: "bloqueia", tipo: "falta", texto: `Está faltando o total do lado único. A soma das partidas é ${moedaContabil(soma)}.`, alvo: campo("lancamento-valor"), correcao: { campo: "total", valor: (soma / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), explicacao: `total pela soma das partidas: ${moedaContabil(soma)}` } });
  else if (total === null || total <= 0) a.push({ regra: "total_invalido", nivel: "bloqueia", tipo: "errado", texto: "Está errado: o total precisa ser um valor maior que zero (ex.: 10.000,00).", alvo: campo("lancamento-valor") });
  else if (somaOk && total !== soma) a.push({ regra: "partida_nao_fecha", nivel: "bloqueia", tipo: "errado", texto: `A partida não fecha: ${moedaContabil(total)} de um lado e ${moedaContabil(soma)} nas partidas (diferença ${moedaContabil(total - soma)}). Confira qual valor está errado.`, alvo: campo("lancamento-valor") });
  if (!String(d.historico || "").trim()) a.push({ regra: "historico_vazio", nivel: "bloqueia", tipo: "falta", texto: "Está faltando o histórico (o que foi a operação).", alvo: campo("lancamento-historico") });
  return fecharRevisao("lancamento_multipartida", a);
}

/** "Lançar os marcados" da conciliação bancária. */
export function revisarConciliacaoLancar(itens: Array<{ fitid: string; dataISO: string; valorCentavos: number; memo?: string; contrapartida: string }>, ctx: { contas: ContaPlano[]; contaBanco: string; lancamentos: LancamentoContabil[]; fechadas: string[]; contrapartidaUnica: boolean }, casa: (l: LancamentoContabil, mov: { valorCentavos: number }, contaBanco: string) => boolean): Revisao {
  const a: AchadoRevisor[] = [];
  if (!ctx.contaBanco) a.push({ regra: "banco_vazio", nivel: "bloqueia", tipo: "falta", texto: "Está faltando escolher a conta do banco no plano.", alvo: campo("extrato-conta") });
  const entradas = itens.some((i) => i.valorCentavos > 0); const saidas = itens.some((i) => i.valorCentavos < 0);
  if (ctx.contrapartidaUnica && entradas && saidas) a.push({ regra: "contrapartida_mista", nivel: "atencao", tipo: "risco", texto: "A mesma contrapartida vai para entradas e saídas do banco ao mesmo tempo. Confira se é isso mesmo." });
  for (const i of itens) {
    const conta = ctx.contas.find((c) => c.codigo === i.contrapartida);
    const quem = `${i.dataISO.split("-").reverse().join("/")} ${moedaContabil(Math.abs(i.valorCentavos))}${i.memo ? ` (${i.memo.slice(0, 40)})` : ""}`;
    if (!i.contrapartida) a.push({ regra: `contra_vazia_${i.fitid}`, nivel: "bloqueia", tipo: "falta", texto: `Está faltando a contrapartida do movimento ${quem}.` });
    else if (!conta) a.push({ regra: `contra_inexistente_${i.fitid}`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a contrapartida ${i.contrapartida} do movimento ${quem} não existe no plano.` });
    else if (conta.tipo !== "analitica") a.push({ regra: `contra_sintetica_${i.fitid}`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a contrapartida ${conta.codigo} do movimento ${quem} é sintética.` });
    else if (conta.codigo === ctx.contaBanco) a.push({ regra: `contra_banco_${i.fitid}`, nivel: "bloqueia", tipo: "errado", texto: `Está errado: a contrapartida do movimento ${quem} é a própria conta do banco.` });
    if (ctx.fechadas.includes(i.dataISO.slice(0, 7))) a.push({ regra: `mes_fechado_${i.fitid}`, nivel: "bloqueia", tipo: "errado", texto: `O movimento ${quem} é de competência fechada: só depois que o contador reabrir.` });
    const ja = ctx.lancamentos.find((l) => casa(l, i, ctx.contaBanco) && normalizarDataContabil(l.data) === i.dataISO);
    if (ja) a.push({ regra: `ja_lancado_${i.fitid}`, nivel: "atencao", tipo: "risco", texto: `O movimento ${quem} parece já ter lançamento aprovado no mesmo dia e valor ("${String(ja.historico).slice(0, 50)}"): lançar de novo duplica. Prefira conciliar com ele.` });
  }
  return fecharRevisao("conciliacao_lancar", a);
}

// ------------------------------------------------------------------------------------------------
// Fechamento e revisão geral do mês (a partir do workspace salvo)
// ------------------------------------------------------------------------------------------------
export interface ExtrasMes {
  /** Movimentos do extrato do mês sem conciliação (null = não conferido). */
  extratoPendentes?: number | null;
  /** Folhas do DP que não viraram partida (vindas do conferidor de folha). */
  folhasDP?: Array<{ id: string; titulo: string; detalhe: string }> | null;
}
export interface RevisaoMes { certo: string[]; risco: AchadoRevisor[]; falta: AchadoRevisor[] }

/** Pendentes (não aprovados) em mês aberto com dado de cadastro desatualizado ou formato errado: o que o "Corrigir para mim" pode arrumar. */
export function correcoesDeLancamentosPendentes(contas: ContaPlano[], lancamentos: LancamentoContabil[], fechadas: Set<string>): Array<{ id: string; motivo: string; campos: Partial<LancamentoContabil> }> {
  const plano = new Map(contas.map((c) => [c.codigo, c]));
  const saida: Array<{ id: string; motivo: string; campos: Partial<LancamentoContabil> }> = [];
  for (const l of lancamentos) {
    if (l.statusManual !== "pendente_aprovacao") continue;
    const iso = normalizarDataContabil(l.data); if (!iso || fechadas.has(iso.slice(0, 7))) continue;
    const campos: Partial<LancamentoContabil> = {}; const motivos: string[] = [];
    const d = plano.get(l.contaDebitoCodigo); const c = plano.get(l.contaCreditoCodigo);
    if (d && l.contaDebitoNome !== d.descricao) { campos.contaDebitoNome = d.descricao; motivos.push(`nome da conta a débito pelo plano (${d.descricao})`); }
    if (c && l.contaCreditoNome !== c.descricao) { campos.contaCreditoNome = c.descricao; motivos.push(`nome da conta a crédito pelo plano (${c.descricao})`); }
    const h = String(l.historico ?? ""); const hLimpo = h.replace(/\s+/g, " ").trim();
    if (hLimpo && h !== hLimpo) { campos.historico = hLimpo; motivos.push("histórico sem espaços sobrando"); }
    if (l.competencia && l.competencia !== iso.slice(0, 7) && !l.saldoInicialContaCodigo) { campos.competencia = iso.slice(0, 7); motivos.push(`competência pela data (${iso.slice(0, 7)})`); }
    if (motivos.length) saida.push({ id: l.id, motivo: motivos.join("; "), campos });
  }
  return saida;
}

export function revisarMes(payload: Record<string, any>, competencia: string, fechadas: Set<string>, extras: ExtrasMes = {}): RevisaoMes {
  const contas: ContaPlano[] = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos: LancamentoContabil[] = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  const pre: PreLancamentoContabil[] = Array.isArray(payload?.preLancamentos) ? payload.preLancamentos : [];
  const bens: BemImobilizado[] = Array.isArray(payload?.bensImobilizado) ? payload.bensImobilizado : [];
  const certo: string[] = []; const risco: AchadoRevisor[] = []; const falta: AchadoRevisor[] = [];
  const fechada = fechadas.has(competencia);
  if (fechada) certo.push(`Competência ${competencia.slice(5)}/${competencia.slice(0, 4)} fechada`);
  if (!contas.length) { falta.push({ regra: "sem_plano", nivel: "bloqueia", tipo: "falta", texto: "A empresa não tem plano de contas." }); return { certo, risco, falta }; }
  const r = conferirFechamento({ competencia, contas, lancamentos, preLancamentos: pre, bens, confirmacoes: {} });
  for (const i of r.itens) {
    if (i.tipo !== "automatico") continue;
    if (i.ok) { certo.push(i.titulo); continue; }
    if (i.id === "movimento") { risco.push({ regra: "fech_movimento", nivel: "atencao", tipo: "falta", texto: `Sem lançamento válido em ${competencia.slice(5)}/${competencia.slice(0, 4)}.` }); continue; }
    (i.bloqueia && !fechada ? falta : risco).push({ regra: `fech_${i.id}`, nivel: i.bloqueia ? "bloqueia" : "atencao", tipo: i.id === "partidas" || i.id === "invalidos" ? "errado" : "falta", texto: `${i.titulo}: ${i.detalhe}` });
  }
  // Lançamentos aprovados repetidos no mês (mesma data, contas e valor).
  const vistos = new Map<string, LancamentoContabil>(); let repetidos = 0;
  for (const l of lancamentos) {
    if (l.statusManual === "pendente_aprovacao" || l.statusManual === "rejeitado" || l.estornoDe || l.loteId) continue;
    const iso = normalizarDataContabil(l.data); if (!iso || iso.slice(0, 7) !== competencia) continue;
    const chave = `${iso}|${l.contaDebitoCodigo}|${l.contaCreditoCodigo}|${converterCentavos(l.valor)}|${semAcento(l.historico)}`;
    if (vistos.has(chave)) repetidos += 1; else vistos.set(chave, l);
  }
  if (repetidos) risco.push({ regra: "lancamentos_repetidos", nivel: "atencao", tipo: "risco", texto: `${repetidos} lançamento(s) do mês igual(is) a outro (mesma data, contas, valor e histórico). Confira se não foi lançado duas vezes.` });
  else certo.push("Nenhum lançamento repetido no mês");
  // Caixa com saldo credor ("estouro de caixa"): o caixa não pode ficar negativo.
  try {
    const rel = gerarRelatoriosContabeis(contas, lancamentos, competencia);
    const estouro = rel.balancete.filter((b) => b.conta.tipo === "analitica" && /\bcaixa\b/i.test(b.conta.descricao) && !/banco|aplica/i.test(b.conta.descricao) && grupoDemonstracao(b.conta, contas) === "ativo" && b.saldoCredorCentavos > 0);
    if (estouro.length) risco.push({ regra: "caixa_credor", nivel: "atencao", tipo: "errado", texto: `Saldo credor no Caixa (estouro de caixa): ${estouro.map((b) => `${b.conta.codigo} ${moedaContabil(b.saldoCredorCentavos)}`).join(", ")}. Falta lançar entrada ou a saída está errada.` });
  } catch { /* relatório opcional */ }
  if (typeof extras.extratoPendentes === "number") {
    if (extras.extratoPendentes > 0) risco.push({ regra: "extrato_pendente", nivel: "atencao", tipo: "falta", texto: `${extras.extratoPendentes} movimento(s) do extrato do mês sem conciliação nem lançamento.` });
    else certo.push("Extrato do mês conciliado (ou sem extrato guardado)");
  }
  for (const f of extras.folhasDP ?? []) risco.push({ regra: `folha_dp_${f.id}`.slice(0, 80), nivel: "atencao", tipo: "falta", texto: `${f.titulo}: ${f.detalhe}` });
  const corrigiveis = correcoesDeLancamentosPendentes(contas, lancamentos.filter((l) => normalizarDataContabil(l.data)?.slice(0, 7) === competencia), fechadas);
  if (corrigiveis.length) risco.push({ regra: "pendentes_desatualizados", nivel: "atencao", tipo: "errado", texto: `${corrigiveis.length} lançamento(s) pendente(s) de aprovação com dado desatualizado ou fora do formato (${corrigiveis.slice(0, 2).map((x) => x.motivo).join("; ")}${corrigiveis.length > 2 ? "…" : ""}).`, correcao: { campo: "lancamentos_pendentes", valor: corrigiveis.map((x) => x.id).join(","), explicacao: `acertar ${corrigiveis.length} lançamento(s) pendente(s) pelo plano de contas e pela data` } });
  return { certo, risco, falta };
}

/** Antes de fechar o mês: tudo o que a revisão do mês acha; o que bloqueia o fechamento guiado continua bloqueando. */
export function revisarFechamento(payload: Record<string, any>, competencia: string, fechadas: Set<string>, extras: ExtrasMes = {}): Revisao {
  const m = revisarMes(payload, competencia, fechadas, extras);
  const alvo = campo("fechamento-fechar");
  return fecharRevisao("fechamento", [...m.falta, ...m.risco].map((x) => ({ ...x, alvo: x.alvo ?? alvo, correcao: undefined })));
}
