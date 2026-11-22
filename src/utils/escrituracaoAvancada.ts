// Escrituração avançada do Murade Contábil (puro, sem servidor): lançamento com várias partidas, histórico padrão,
// lançamento padrão (recorrente) e encerramento do resultado gravado no sistema.
//
// Formato dos lançamentos: cada registro continua sendo UM par débito/crédito (o formato antigo não muda). Um lançamento
// com várias partidas (1 débito x N créditos, ou N débitos x 1 crédito) vira N pares com o mesmo `loteId`; como cada par
// é balanceado, o lote inteiro sempre fecha. A ECD junta o lote num único I200 com as partidas I250.
import type { ContaPlano, HistoricoPadrao, LancamentoContabil, LancamentoPadrao } from "../types";
import { converterCentavos, gerarRelatoriosContabeis, normalizarDataContabil } from "./livrosContabeis";
import { grupoDemonstracao } from "./analiseContabil";

const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
type Erro = { erro: string };
const eErro = (x: unknown): x is Erro => Boolean(x && typeof x === "object" && "erro" in (x as object));
export { eErro as ehErro };

// ------------------------------------------------------------------ lançamento com várias partidas
export type FormaMultipartida = "1xN" | "Nx1";
export interface PedidoMultipartida {
  data: string; // DD/MM/AAAA ou AAAA-MM-DD
  historico: string;
  forma: FormaMultipartida;
  contaUnica: string;
  partidas: Array<{ conta: string; valorCentavos: number; historico?: string }>;
  /** Total informado pela pessoa (centavos). Se vier, a soma das partidas tem que ser exatamente igual. */
  totalCentavos?: number;
  centroCustoCodigo?: string;
}

/**
 * Monta os pares de um lançamento com várias partidas, pendentes de aprovação. Recusa (sem montar nada) se a soma
 * das partidas não bater com o total, se alguma conta não for analítica, se repetir a conta única ou se valor ≤ 0.
 */
export function montarLoteMultipartida(pedido: PedidoMultipartida, contas: ContaPlano[], ids: { loteId: string; novoId: () => string; documentoRef: string }, extras: Partial<LancamentoContabil> = {}): LancamentoContabil[] | Erro {
  const dataISO = normalizarDataContabil(String(pedido.data || ""));
  if (!dataISO) return { erro: "Informe uma data real (DD/MM/AAAA)." };
  const historico = String(pedido.historico || "").trim();
  if (!historico) return { erro: "Informe o histórico do lançamento." };
  if (historico.length > 240) return { erro: "O histórico pode ter no máximo 240 caracteres." };
  if (pedido.forma !== "1xN" && pedido.forma !== "Nx1") return { erro: "Escolha a forma: 1 débito para vários créditos (1xN) ou vários débitos para 1 crédito (Nx1)." };
  const analitica = (codigo: string) => contas.find((c) => c.codigo === codigo && c.tipo === "analitica");
  const unica = analitica(String(pedido.contaUnica || ""));
  if (!unica) return { erro: `A conta ${pedido.forma === "1xN" ? "a débito" : "a crédito"} precisa ser uma conta analítica do plano.` };
  const partidas = Array.isArray(pedido.partidas) ? pedido.partidas : [];
  if (partidas.length < 1 || partidas.length > 50) return { erro: "Informe de 1 a 50 partidas do outro lado." };
  let soma = 0;
  const pares: LancamentoContabil[] = [];
  for (const [i, p] of partidas.entries()) {
    const conta = analitica(String(p?.conta || ""));
    if (!conta) return { erro: `Partida ${i + 1}: escolha uma conta analítica do plano.` };
    if (conta.codigo === unica.codigo) return { erro: `Partida ${i + 1}: a conta não pode ser a mesma do outro lado.` };
    if (!Number.isSafeInteger(p.valorCentavos) || p.valorCentavos <= 0) return { erro: `Partida ${i + 1}: informe um valor maior que zero.` };
    soma += p.valorCentavos;
    const debito = pedido.forma === "1xN" ? unica : conta;
    const credito = pedido.forma === "1xN" ? conta : unica;
    const hist = String(p.historico || "").trim() || historico;
    pares.push({
      id: ids.novoId(), data: dataISO, competencia: dataISO.slice(0, 7),
      contaDebitoCodigo: debito.codigo, contaDebitoNome: debito.descricao, contaCreditoCodigo: credito.codigo, contaCreditoNome: credito.descricao,
      valor: p.valorCentavos / 100, historico: hist.slice(0, 240), origem: "Manual", documentoRef: ids.documentoRef,
      statusManual: "pendente_aprovacao", ...(partidas.length > 1 ? { loteId: ids.loteId } : {}),
      ...(pedido.centroCustoCodigo ? { centroCustoCodigo: pedido.centroCustoCodigo } : {}),
      ...extras,
    });
  }
  if (pedido.totalCentavos !== undefined && pedido.totalCentavos !== soma) {
    const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return { erro: `O total não fecha: ${pedido.forma === "1xN" ? "débito" : "crédito"} de ${fmt(pedido.totalCentavos)} e partidas somando ${fmt(soma)} (diferença ${fmt(pedido.totalCentavos - soma)}).` };
  }
  return pares;
}

/** Agrupa os lançamentos por lote (lançamentos sem loteId ficam sozinhos), na ordem em que aparecem. */
export function agruparPorLote<T extends Pick<LancamentoContabil, "id" | "loteId">>(lancamentos: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  for (const l of lancamentos) {
    const chave = l.loteId ? `L:${l.loteId}` : `S:${l.id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(l);
  }
  return [...grupos.values()];
}

// ------------------------------------------------------------------ histórico padrão
export function aplicarHistoricoPadrao(texto: string, competencia: string): string {
  const c = COMP.test(competencia) ? competencia : "";
  return String(texto || "")
    .replace(/\{mes\}/gi, c ? `${c.slice(5)}/${c.slice(0, 4)}` : "")
    .replace(/\{competencia\}/gi, c)
    .replace(/\{ano\}/gi, c.slice(0, 4))
    .trim();
}

export function validarHistoricoPadrao(h: unknown): h is HistoricoPadrao {
  if (!h || typeof h !== "object" || Array.isArray(h)) return false;
  const x = h as Record<string, unknown>;
  if (Object.keys(x).some((k) => !["id", "codigo", "texto", "exigeComplemento"].includes(k))) return false;
  if (x.exigeComplemento !== undefined && typeof x.exigeComplemento !== "boolean") return false;
  return typeof x.id === "string" && x.id.length > 0 && x.id.length <= 64
    && typeof x.codigo === "string" && /^[A-Za-z0-9._-]{1,12}$/.test(x.codigo)
    && typeof x.texto === "string" && x.texto.trim().length > 0 && x.texto.length <= 240;
}

// ------------------------------------------------------------------ lançamento padrão (recorrente)
export function validarLancamentoPadrao(p: unknown, contasAnaliticas?: Set<string>): p is LancamentoPadrao {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const x = p as Record<string, any>;
  const campos = ["id", "nome", "ativo", "dia", "historico", "forma", "contaUnica", "partidas", "inicio", "fim", "criadoEm", "uso", "codigo", "historicoPadraoCodigo", "pedeComplemento"];
  if (x.uso !== undefined && x.uso !== "recorrente" && x.uso !== "modelo") return false;
  const modelo = x.uso === "modelo";
  if (modelo && x.ativo !== false) return false; // modelo nunca é preparado pelo robô
  if (x.codigo !== undefined && (typeof x.codigo !== "string" || x.codigo.length > 20)) return false;
  if (x.historicoPadraoCodigo !== undefined && (typeof x.historicoPadraoCodigo !== "string" || x.historicoPadraoCodigo.length > 20)) return false;
  if (x.pedeComplemento !== undefined && typeof x.pedeComplemento !== "boolean") return false;
  if (Object.keys(x).some((k) => !campos.includes(k))) return false;
  if (typeof x.id !== "string" || !x.id || x.id.length > 64) return false;
  if (typeof x.nome !== "string" || !x.nome.trim() || x.nome.length > 80) return false;
  if (typeof x.ativo !== "boolean" || !Number.isInteger(x.dia) || x.dia < 1 || x.dia > 31) return false;
  if (typeof x.historico !== "string" || !x.historico.trim() || x.historico.length > 240) return false;
  if (x.forma !== "1xN" && x.forma !== "Nx1") return false;
  if (typeof x.contaUnica !== "string" || !x.contaUnica || (contasAnaliticas && !contasAnaliticas.has(x.contaUnica))) return false;
  if (!Array.isArray(x.partidas) || x.partidas.length < 1 || x.partidas.length > 50) return false;
  for (const it of x.partidas) {
    if (!it || typeof it !== "object" || Object.keys(it).some((k) => !["conta", "valorCentavos"].includes(k))) return false;
    if (typeof it.conta !== "string" || it.conta === x.contaUnica || (contasAnaliticas && !contasAnaliticas.has(it.conta))) return false;
    if (!Number.isSafeInteger(it.valorCentavos) || it.valorCentavos < 0 || (!modelo && it.valorCentavos === 0)) return false;
  }
  if (typeof x.inicio !== "string" || !COMP.test(x.inicio)) return false;
  if (x.fim !== undefined && (typeof x.fim !== "string" || !COMP.test(x.fim) || x.fim < x.inicio)) return false;
  if (typeof x.criadoEm !== "string" || !Number.isFinite(Date.parse(x.criadoEm))) return false;
  return true;
}

export const referenciaRecorrente = (padraoId: string, competencia: string) => `REC:${padraoId}:${competencia}`;

/** Data do lançamento padrão na competência: o dia escolhido, ou o último dia do mês quando o mês é mais curto. */
export function dataDoPadrao(dia: number, competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${competencia}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/**
 * Prepara, para UMA competência, os pré-lançamentos (lançamentos manuais pendentes de aprovação) dos lançamentos
 * padrão ativos. Idempotente: se a referência REC:<padrão>:<competência> já existe (pendente, aprovada OU rejeitada),
 * não prepara de novo. Competência fechada nunca recebe nada.
 */
export function prepararRecorrentesDoMes(entrada: { padroes: LancamentoPadrao[]; lancamentos: LancamentoContabil[]; contas: ContaPlano[]; competencia: string; fechadas?: Set<string>; novoId: () => string }): { novos: LancamentoContabil[]; avisos: string[] } {
  const avisos: string[] = [];
  const novos: LancamentoContabil[] = [];
  if (!COMP.test(entrada.competencia) || entrada.fechadas?.has(entrada.competencia)) return { novos, avisos };
  const refs = new Set(entrada.lancamentos.map((l) => String(l.documentoRef || "")));
  for (const p of entrada.padroes) {
    if (!p?.ativo || p.uso === "modelo" || entrada.competencia < p.inicio || (p.fim && entrada.competencia > p.fim)) continue;
    const ref = referenciaRecorrente(p.id, entrada.competencia);
    if (refs.has(ref)) continue;
    const lote = montarLoteMultipartida(
      { data: dataDoPadrao(p.dia, entrada.competencia), historico: aplicarHistoricoPadrao(p.historico, entrada.competencia), forma: p.forma, contaUnica: p.contaUnica, partidas: p.partidas },
      entrada.contas, { loteId: `${ref}`, novoId: entrada.novoId, documentoRef: ref }, { recorrenteDe: p.id },
    );
    if (eErro(lote)) { avisos.push(`Lançamento padrão "${p.nome}": ${lote.erro}`); continue; }
    novos.push(...lote);
  }
  return { novos, avisos };
}

// ------------------------------------------------------------------ encerramento do resultado
export const ehEncerramento = (l: Pick<LancamentoContabil, "tipoEspecial"> | null | undefined): boolean => l?.tipoEspecial === "encerramento";
/** Para DRE, ECF e qualquer cálculo de resultado: o encerramento zera as contas de resultado e não é receita nem despesa do período. */
export const semEncerramento = <T extends Pick<LancamentoContabil, "tipoEspecial">>(lancamentos: T[]): T[] => lancamentos.filter((l) => !ehEncerramento(l));

const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Contas de resultado: pela natureza da ECD (código 04) quando ela é conhecida, senão pela descrição do grupo (receita, despesa, custo). */
export function contasDeResultado(contas: ContaPlano[], naturezaEcd?: Map<string, string>): ContaPlano[] {
  return contas.filter((c) => {
    if (c.tipo !== "analitica") return false;
    const nat = naturezaEcd?.get(c.codigo);
    if (nat) return nat === "04";
    const g = grupoDemonstracao(c, contas);
    return g === "receita" || g === "despesa";
  });
}

/** Conta do PL que recebe o resultado (Lucros ou Prejuízos Acumulados), pelo mesmo critério da ECD. */
export function contaApuracaoPadrao(contas: ContaPlano[]): ContaPlano | null {
  const pl = contas.filter((c) => c.tipo === "analitica" && /(lucros?|prejuizos?)\s*(\/|ou|e)?\s*(lucros?|prejuizos?)?\s*acumulad|resultado\s+(do\s+)?exercicio|apuracao\s+(do\s+)?resultado/.test(semAcento(c.descricao)));
  return pl.find((c) => /acumulad/.test(semAcento(c.descricao))) || pl[0] || null;
}

export type PartidaEncerramento = { conta: ContaPlano; saldoCentavos: number }; // saldo = débito − crédito antes do encerramento

/** Lotes de encerramento já gravados no ano (aprovados ou pendentes), separando os que foram estornados. */
export function encerramentosDoAno(lancamentos: LancamentoContabil[], ano: number): { ativos: LancamentoContabil[][]; pendentes: LancamentoContabil[][]; estornados: LancamentoContabil[][] } {
  const doAno = lancamentos.filter((l) => ehEncerramento(l) && !l.estornoDe && String(normalizarDataContabil(l.data) || "").startsWith(`${ano}-`) && l.statusManual !== "rejeitado");
  const estornosAprovados = new Set(lancamentos.filter((l) => l.estornoDe && l.statusManual !== "rejeitado" && l.statusManual !== "pendente_aprovacao").map((l) => String(l.estornoDe)));
  const ativos: LancamentoContabil[][] = [], pendentes: LancamentoContabil[][] = [], estornados: LancamentoContabil[][] = [];
  for (const lote of agruparPorLote(doAno)) {
    if (lote.every((l) => estornosAprovados.has(l.id))) estornados.push(lote);
    else if (lote.some((l) => l.statusManual === "pendente_aprovacao")) pendentes.push(lote);
    else ativos.push(lote);
  }
  return { ativos, pendentes, estornados };
}

/**
 * Calcula o encerramento do ano: o saldo de cada conta de resultado no ano (só lançamentos aprovados, sem encerramentos)
 * vai para a conta de apuração/lucros. Cada conta vira um par (receita: D receita / C apuração; despesa: D apuração / C despesa).
 */
export function calcularEncerramento(entrada: { contas: ContaPlano[]; lancamentos: LancamentoContabil[]; ano: number; contaDestino: string; naturezaEcd?: Map<string, string> }): { partidas: PartidaEncerramento[]; resultadoCentavos: number; destino: ContaPlano } | Erro {
  const destino = entrada.contas.find((c) => c.codigo === entrada.contaDestino && c.tipo === "analitica");
  if (!destino) return { erro: "Escolha a conta analítica do Patrimônio Líquido (Lucros ou Prejuízos Acumulados / Apuração do Resultado) que recebe o resultado." };
  const resultado = contasDeResultado(entrada.contas, entrada.naturezaEcd);
  if (resultado.some((c) => c.codigo === destino.codigo)) return { erro: "A conta que recebe o resultado não pode ser uma conta de resultado." };
  if (!resultado.length) return { erro: "Não achei contas de resultado no plano (defina a natureza 04 ou use descrições Receita/Despesa/Custo)." };
  const pendentesAno = entrada.lancamentos.filter((l) => l.statusManual === "pendente_aprovacao" && !ehEncerramento(l) && String(normalizarDataContabil(l.data) || "").startsWith(`${entrada.ano}-`));
  if (pendentesAno.length) return { erro: `Há ${pendentesAno.length} lançamento(s) de ${entrada.ano} aguardando aprovação. Aprove ou rejeite antes de encerrar o resultado.` };
  const rel = gerarRelatoriosContabeis(entrada.contas, semEncerramento(entrada.lancamentos), "todos");
  const codigos = new Set(resultado.map((c) => c.codigo));
  const saldo = new Map<string, number>();
  for (const l of rel.validos) {
    if (l.dataISO.slice(0, 4) !== String(entrada.ano)) continue;
    if (codigos.has(l.debito.codigo)) saldo.set(l.debito.codigo, (saldo.get(l.debito.codigo) || 0) + l.valorCentavos);
    if (codigos.has(l.credito.codigo)) saldo.set(l.credito.codigo, (saldo.get(l.credito.codigo) || 0) - l.valorCentavos);
  }
  const partidas = resultado.map((conta) => ({ conta, saldoCentavos: saldo.get(conta.codigo) || 0 })).filter((p) => p.saldoCentavos !== 0);
  if (!partidas.length) return { erro: `As contas de resultado não têm saldo em ${entrada.ano}; não há o que encerrar.` };
  const resultadoCentavos = -partidas.reduce((t, p) => t + p.saldoCentavos, 0); // positivo = lucro
  return { partidas, resultadoCentavos, destino };
}

/** Pares do encerramento, pendentes de aprovação, datados de 31/12 do ano. */
export function montarLoteEncerramento(calc: { partidas: PartidaEncerramento[]; destino: ContaPlano }, ano: number, ids: { loteId: string; novoId: () => string }): LancamentoContabil[] {
  const data = `${ano}-12-31`;
  const ref = `ENCERRAMENTO:${ano}:${ids.loteId}`;
  return calc.partidas.map((p) => {
    const credora = p.saldoCentavos < 0; // receita (saldo credor) é debitada; despesa (saldo devedor) é creditada
    const debito = credora ? p.conta : calc.destino;
    const credito = credora ? calc.destino : p.conta;
    return {
      id: ids.novoId(), data, competencia: `${ano}-12`,
      contaDebitoCodigo: debito.codigo, contaDebitoNome: debito.descricao, contaCreditoCodigo: credito.codigo, contaCreditoNome: credito.descricao,
      valor: Math.abs(p.saldoCentavos) / 100, historico: `Encerramento das contas de resultado do exercício de ${ano}`,
      origem: "Manual", documentoRef: ref, statusManual: "pendente_aprovacao", loteId: ids.loteId, tipoEspecial: "encerramento",
    } as LancamentoContabil;
  });
}

/** Estorno de um lote inteiro (pares invertidos, mesma data do original, pendentes de aprovação, num lote novo). */
export function montarEstornoLote(lote: LancamentoContabil[], ids: { loteId: string; novoId: () => string }, dataEstorno?: string): LancamentoContabil[] | Erro {
  if (!lote.length) return { erro: "Lote não encontrado." };
  if (lote.some((l) => l.statusManual === "pendente_aprovacao" || l.statusManual === "rejeitado")) return { erro: "Só dá para estornar um lançamento já aprovado. Pendente pode ser rejeitado." };
  return lote.map((o) => {
    const data = dataEstorno || normalizarDataContabil(o.data) || o.data;
    const ref = o.documentoRef || o.id;
    return {
      ...o, id: ids.novoId(), data, competencia: String(data).slice(0, 7),
      contaDebitoCodigo: o.contaCreditoCodigo, contaDebitoNome: o.contaCreditoNome, contaCreditoCodigo: o.contaDebitoCodigo, contaCreditoNome: o.contaDebitoNome,
      historico: `Estorno do lançamento ${ref} — ${o.historico}`.slice(0, 240), documentoRef: `ESTORNO-${ref}-${ids.loteId}`,
      estornoDe: o.id, statusManual: "pendente_aprovacao", loteId: ids.loteId,
    } as LancamentoContabil;
  });
}

/** Centavos exatos de um texto "1.234,56" / "1234.56" (sem arredondar casas a mais: mais de 2 casas é recusado). */
export function textoParaCentavos(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? converterCentavos(v) : null;
  let t = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return converterCentavos(Number(t));
}

/** O encerramento gravado (lotes ativos) ainda zera exatamente as contas de resultado do ano? */
export function encerramentoGravadoConfere(calc: { partidas: PartidaEncerramento[] }, ativos: LancamentoContabil[][]): boolean {
  const pares = ativos.flat();
  if (!pares.length) return false;
  // A conta de destino (lucros/apuração) aparece em todos os pares; as outras são contas de resultado.
  const destino = [pares[0].contaDebitoCodigo, pares[0].contaCreditoCodigo].find((c) => pares.every((l) => l.contaDebitoCodigo === c || l.contaCreditoCodigo === c)) || "";
  const efeito = new Map<string, number>(); // débito − crédito do encerramento gravado, por conta de resultado
  for (const l of pares) {
    const c = converterCentavos(l.valor) || 0;
    if (l.contaDebitoCodigo !== destino) efeito.set(l.contaDebitoCodigo, (efeito.get(l.contaDebitoCodigo) || 0) + c);
    if (l.contaCreditoCodigo !== destino) efeito.set(l.contaCreditoCodigo, (efeito.get(l.contaCreditoCodigo) || 0) - c);
  }
  const saldos = new Map(calc.partidas.map((p) => [p.conta.codigo, p.saldoCentavos]));
  for (const codigo of new Set([...saldos.keys(), ...efeito.keys()])) if ((saldos.get(codigo) || 0) + (efeito.get(codigo) || 0) !== 0) return false;
  return true;
}
