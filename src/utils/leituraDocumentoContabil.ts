// Leitura de documento (recibo, boleto pago, nota de despesa, comprovante de pagamento) para virar PRÉ-LANÇAMENTO.
// A IA só TRANSCREVE o que está escrito (mesma regra da leitura de documentos do DP). Este módulo confere o que veio
// (data possível, valor positivo e igual nas leituras, CNPJ/CPF pelo dígito verificador) e o que não der para confiar fica EM BRANCO,
// para a pessoa preencher. Depois sugere débito e crédito pelas regras que o escritório já tem (regras da conciliação do extrato,
// histórico padrão e o que a empresa já lançou) e procura duplicidade com o extrato já conciliado e com lançamentos parecidos.
// Nada aqui grava: quem grava é a rota, só depois que a pessoa confirma (e o lançamento ainda vai para aprovação).
import type { ContaPlano, HistoricoPadrao, LancamentoContabil, RegraConciliacao } from "../types";
import { regraQueSeAplica } from "./extratoBancario";
import { converterCentavos, normalizarDataContabil } from "./livrosContabeis";
import { cnpjValido, cpfValido } from "../services/ecdService";

export const MIME_DOCUMENTO_CONTABIL = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);
export const MAX_ARQUIVOS_DOCUMENTO = 3;
export const MAX_BASE64_DOCUMENTO = 3_000_000; // ~2,2 MB cada (foto de celular reduzida no navegador)

export interface ArquivoDocumentoContabil { mimeType: string; dadosBase64: string; nome?: string }

export function validarArquivosDocumento(arquivos: unknown): { ok: true; arquivos: ArquivoDocumentoContabil[] } | { ok: false; status: number; erro: string } {
  if (!Array.isArray(arquivos) || arquivos.length === 0) return { ok: false, status: 400, erro: "Escolha a foto ou o PDF do documento." };
  if (arquivos.length > MAX_ARQUIVOS_DOCUMENTO) return { ok: false, status: 400, erro: `Envie no máximo ${MAX_ARQUIVOS_DOCUMENTO} arquivos (páginas) do MESMO documento.` };
  const lista: ArquivoDocumentoContabil[] = [];
  for (const a of arquivos as any[]) {
    const mimeType = String(a?.mimeType || "");
    const dadosBase64 = String(a?.dadosBase64 || "");
    if (!MIME_DOCUMENTO_CONTABIL.has(mimeType)) return { ok: false, status: 415, erro: "Formato não aceito. Envie PDF, JPG, PNG ou WEBP." };
    if (!dadosBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(dadosBase64)) return { ok: false, status: 400, erro: "Arquivo vazio ou corrompido." };
    if (dadosBase64.length > MAX_BASE64_DOCUMENTO) return { ok: false, status: 413, erro: "Arquivo muito grande (limite de ~2 MB cada). Tire a foto de novo mais leve." };
    lista.push({ mimeType, dadosBase64, nome: typeof a?.nome === "string" ? a.nome.slice(0, 80) : undefined });
  }
  return { ok: true, arquivos: lista };
}

export type FormaPagamento = "pix" | "boleto" | "transferencia" | "dinheiro" | "cartao_debito" | "cartao_credito" | "cheque" | "debito_automatico";
export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: "PIX", boleto: "Boleto", transferencia: "Transferência (TED/DOC)", dinheiro: "Dinheiro", cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito", cheque: "Cheque", debito_automatico: "Débito automático",
};

export interface LeituraDocumento {
  tipoDocumento: string | null;
  data: string | null;          // AAAA-MM-DD (data do pagamento; sem ela, a de emissão)
  valorCentavos: number | null; // sempre positivo
  favorecido: string | null;
  documentoFavorecido: string | null; // CNPJ (14) ou CPF (11), só se passar no dígito verificador
  historico: string | null;
  formaPagamento: FormaPagamento | null;
  numeroDocumento: string | null;
  avisos: string[];
  emBranco: string[]; // campos que ficaram para a pessoa preencher
}

const limpa = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "1.234,56", "1234.56", "R$ 1.234,56" ou número → centavos (> 0). Texto ambíguo → null. */
export function valorLidoParaCentavos(v: unknown): number | null {
  if (typeof v === "number") { const c = converterCentavos(v); return c !== null && c > 0 ? c : null; }
  let t = limpa(v).replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(t) || /^\d+,\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(t)) t = t.replace(/,/g, "");
  else if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = converterCentavos(Number(t));
  return c !== null && c > 0 ? c : null;
}

const FORMAS: Array<[RegExp, FormaPagamento]> = [
  [/\bpix\b/, "pix"], [/boleto|codigo de barras|titulo bancario/, "boleto"], [/\bted\b|\bdoc\b|transferencia/, "transferencia"],
  [/dinheiro|especie/, "dinheiro"], [/cartao de credito|credito a vista|\bcredito\b/, "cartao_credito"], [/cartao de debito|\bdebito\b/, "cartao_debito"],
  [/cheque/, "cheque"], [/debito automatico|debito em conta/, "debito_automatico"],
];
export function formaDePagamento(v: unknown): FormaPagamento | null {
  const t = semAcento(limpa(v)).replace(/_/g, " ");
  if (!t) return null;
  if (/debito automatico|debito em conta/.test(t)) return "debito_automatico";
  if (/cartao de debito/.test(t)) return "cartao_debito";
  for (const [re, f] of FORMAS) if (re.test(t)) return f;
  return null;
}

/**
 * Confere o que a IA transcreveu. Valor sem prova (data impossível, valores diferentes entre as leituras, CNPJ/CPF com dígito errado)
 * NÃO vira proposta: fica em branco com o motivo. `hoje` serve para recusar data no futuro (documento pago ainda não aconteceu).
 */
export function normalizarLeituraDocumento(bruto: unknown, hoje: string): LeituraDocumento {
  const e = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const c = (e.campos && typeof e.campos === "object" && !Array.isArray(e.campos) ? e.campos : e) as Record<string, unknown>;
  const avisos: string[] = [];
  const emBranco: string[] = [];

  // Data: a do pagamento vale; sem ela, a de emissão (com aviso).
  let data: string | null = null;
  for (const [campo, rotulo] of [["dataPagamento", "pagamento"], ["dataEmissao", "emissão"]] as const) {
    const txt = limpa(c[campo]);
    if (!txt) continue;
    const d = normalizarDataContabil(txt);
    if (!d) { avisos.push(`A data de ${rotulo} lida ("${txt.slice(0, 20)}") não é uma data possível; ficou em branco.`); continue; }
    if (d > hoje) { avisos.push(`A data de ${rotulo} lida (${d.split("-").reverse().join("/")}) é depois de hoje; confira no documento.`); continue; }
    data = d;
    if (campo === "dataEmissao") avisos.push("O documento não mostra a data do pagamento: usei a data de emissão. Confira se foi paga nesse dia.");
    break;
  }
  if (!data) emBranco.push("Data");

  // Valor: o total pago. Se a IA viu valores diferentes no mesmo documento (total x outra leitura), fica em branco.
  const principal = valorLidoParaCentavos(c.valorPago ?? c.valor);
  const outras = (Array.isArray(c.valorOutrasLeituras) ? c.valorOutrasLeituras : []).map(valorLidoParaCentavos).filter((x): x is number => x !== null);
  let valorCentavos: number | null = principal;
  if (principal === null && limpa(c.valorPago ?? c.valor)) avisos.push("O valor lido não ficou claro; preencha o valor.");
  if (principal !== null && outras.some((o) => o !== principal)) { valorCentavos = null; avisos.push("O documento mostra valores diferentes (por exemplo, valor do documento e valor pago com juros). Preencha o valor que saiu do caixa ou do banco."); }
  if (valorCentavos === null) emBranco.push("Valor");

  const favorecido = limpa(c.favorecido).slice(0, 120) || null;
  if (!favorecido) emBranco.push("Favorecido");
  let documentoFavorecido: string | null = null;
  const docLido = limpa(c.cnpjCpfFavorecido ?? c.cnpjFavorecido ?? c.cpfFavorecido).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (docLido) {
    if (docLido.length === 14 && cnpjValido(docLido)) documentoFavorecido = docLido;
    else if (docLido.length === 11 && cpfValido(docLido)) documentoFavorecido = docLido;
    else avisos.push("O CNPJ/CPF do favorecido lido não confere no dígito verificador; ficou em branco.");
  }
  const historico = limpa(c.descricao ?? c.historico).slice(0, 200) || null;
  if (!historico) emBranco.push("Histórico");
  const formaPagamento = formaDePagamento(c.formaPagamento);
  if (!formaPagamento) emBranco.push("Forma de pagamento");
  const numeroDocumento = limpa(c.numeroDocumento).replace(/[^0-9A-Za-z./-]/g, "").slice(0, 40) || null;
  const tipoDocumento = limpa(e.tipoDocumento ?? c.tipoDocumento).slice(0, 60) || null;
  return { tipoDocumento, data, valorCentavos, favorecido, documentoFavorecido, historico, formaPagamento, numeroDocumento, avisos, emBranco };
}

export const INSTRUCAO_LEITURA_DOCUMENTO_CONTABIL = `Você transcreve documentos de pagamento brasileiros (recibo, boleto pago com autenticação, comprovante de PIX/TED/transferência, comprovante de pagamento de conta, nota fiscal ou cupom de despesa) para um lançamento contábil.
REGRAS:
- Transcreva SOMENTE o que está escrito e legível. Nunca invente, complete, calcule ou "corrija" nenhum dado.
- Campo ausente, borrado ou duvidoso: deixe nulo. É melhor faltar do que errar.
- "dataPagamento": a data em que o valor foi pago (data do pagamento/autenticação/transação), no formato AAAA-MM-DD. "dataEmissao": a data de emissão do documento, se houver.
- "valorPago": o valor TOTAL efetivamente pago, como aparece (ex.: "1.234,56"). Se o documento mostrar outro valor diferente (valor do documento, desconto, juros, multa, valor cobrado), coloque esses outros valores em "valorOutrasLeituras" (lista). Não some nem subtraia nada.
- "favorecido": quem RECEBEU o pagamento (beneficiário, cedente, loja, prestador). Não é o pagador.
- "cnpjCpfFavorecido": CNPJ ou CPF de quem recebeu, só os números/letras, lido dígito por dígito. Se ilegível, nulo.
- "descricao": o que foi pago, curto (ex.: "Conta de energia 10/2026", "Aluguel do mês 11/2026", "Material de escritório").
- "formaPagamento": uma destas palavras, se estiver escrito ou for evidente pelo tipo do comprovante: pix, boleto, transferencia, dinheiro, cartao_debito, cartao_credito, cheque, debito_automatico.
- "numeroDocumento": número do recibo, da nota ou do documento, se houver.
Responda apenas com JSON no formato {"tipoDocumento":"Recibo","campos":{"dataPagamento":"AAAA-MM-DD","dataEmissao":null,"valorPago":"0,00","valorOutrasLeituras":[],"favorecido":"...","cnpjCpfFavorecido":"...","descricao":"...","formaPagamento":"pix","numeroDocumento":"..."}}. Em "tipoDocumento" coloque só o tipo curto (Recibo, Boleto pago, Comprovante de PIX, Nota fiscal, Cupom fiscal, Comprovante de pagamento).`;

export function interpretarJsonLeitura(texto: string): Record<string, unknown> | null {
  const limpo = String(texto || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const tenta = (t: string) => { try { const j = JSON.parse(t); return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null; } catch { return null; } };
  return tenta(limpo) ?? (limpo.includes("{") ? tenta(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1)) : null);
}

/** Junta as leituras de várias páginas do MESMO documento: o primeiro valor de cada campo vale; valores diferentes viram "outras leituras". */
export function juntarLeituras(jsons: Array<Record<string, unknown>>): Record<string, unknown> {
  const campos: Record<string, unknown> = {}; const outrosValores: unknown[] = []; let tipo: unknown = null;
  for (const j of jsons) {
    const c = (j.campos && typeof j.campos === "object" && !Array.isArray(j.campos) ? j.campos : j) as Record<string, unknown>;
    tipo = tipo || j.tipoDocumento;
    for (const [k, v] of Object.entries(c)) {
      if (v === null || v === undefined || limpa(v) === "") continue;
      if (k === "valorOutrasLeituras" && Array.isArray(v)) { outrosValores.push(...v); continue; }
      if (k === "valorPago" || k === "valor") { if (campos.valorPago === undefined) campos.valorPago = v; else outrosValores.push(v); continue; }
      if (campos[k] === undefined) campos[k] = v;
    }
  }
  return { tipoDocumento: tipo, campos: { ...campos, valorOutrasLeituras: outrosValores } };
}

// ------------------------------------------------------------------ sugestão de débito e crédito
export interface MovimentoParaDuplicidade { fitid: string; contaBanco: string; dataISO: string; valorCentavos: number; memo: string; situacao: "pendente" | "conciliado" | "lancado"; lancamentoId: string | null }
export interface DocumentoJaLancado { id: string; hash: string; lancamentoId: string | null; criadoEm: string }
export interface SugestaoDocumento {
  contaDebito: { codigo: string; motivo: string } | null;
  contaCredito: { codigo: string; motivo: string } | null;
  historico: string;
  /** Impedem gravar (o pagamento já está na contabilidade por outro caminho). */
  bloqueios: string[];
  /** Pedem a confirmação "é outro pagamento" para gravar. */
  parecidos: string[];
  /** Movimento do extrato ainda pendente que é este pagamento: depois de aprovado, o Robô da Conciliação casa os dois. */
  extratoPendente: { fitid: string; contaBanco: string; dataISO: string } | null;
}

const ehDisponibilidade = (c: Pick<ContaPlano, "descricao">) => /\b(caixa|banco|bancos|conta movimento|aplicac|c\/c|conta corrente)\b/.test(semAcento(c.descricao));
const ehCaixa = (c: Pick<ContaPlano, "descricao">) => /\bcaixa\b/.test(semAcento(c.descricao)) && !/banco|economica|caixa economica/.test(semAcento(c.descricao));
const ehBanco = (c: Pick<ContaPlano, "descricao">) => /\bbanco|bancos|conta movimento|conta corrente|c\/c|\bsicoob|\bsicredi|\bnubank|\binter\b|\bitau|\bbradesco|\bsantander|caixa economica/.test(semAcento(c.descricao));
const ehCartaoCredito = (c: Pick<ContaPlano, "descricao">) => /cartao(es)? de credito|cartoes a pagar|cartao a pagar/.test(semAcento(c.descricao));
const palavrasChave = (s: string) => semAcento(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !["ltda", "eireli", "servicos", "comercio", "pagamento", "referente", "valor"].includes(p));
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const valorLancCentavos = (l: LancamentoContabil) => converterCentavos(l.valor) ?? 0;

/**
 * Sugere débito (a despesa/o que foi pago) e crédito (caixa, banco ou cartão) e procura duplicidade.
 * Ordem do crédito: movimento do extrato com o mesmo valor (saída, até 3 dias) → forma de pagamento (dinheiro = caixa; cartão de crédito =
 * cartão a pagar; demais = o único banco do plano). Ordem do débito: regra da conciliação do escritório → conta mais usada nos lançamentos
 * da empresa para o mesmo favorecido. O que não der para sugerir com segurança fica em branco.
 */
export function sugerirLancamentoDocumento(p: {
  leitura: LeituraDocumento; contas: ContaPlano[]; lancamentos: LancamentoContabil[]; regras: RegraConciliacao[]; historicosPadrao: HistoricoPadrao[];
  movimentosExtrato: MovimentoParaDuplicidade[]; jaLancados: DocumentoJaLancado[]; hash: string;
}): SugestaoDocumento {
  const { leitura } = p;
  const analiticas = p.contas.filter((c) => c.tipo === "analitica");
  const analiticasSet = new Set(analiticas.map((c) => c.codigo));
  const bloqueios: string[] = []; const parecidos: string[] = [];
  let extratoPendente: SugestaoDocumento["extratoPendente"] = null;

  const repetido = p.jaLancados.find((d) => d.hash === p.hash && d.lancamentoId);
  if (repetido) bloqueios.push(`Este mesmo arquivo já foi lançado em ${repetido.criadoEm.slice(0, 10).split("-").reverse().join("/")} (lançamento ${repetido.lancamentoId}).`);

  // Crédito
  let contaCredito: SugestaoDocumento["contaCredito"] = null;
  if (leitura.valorCentavos !== null && leitura.data) {
    const casam = p.movimentosExtrato.filter((m) => m.valorCentavos === -leitura.valorCentavos! && diasEntre(m.dataISO, leitura.data!) <= 3);
    const conciliado = casam.find((m) => m.situacao !== "pendente");
    if (conciliado) bloqueios.push(`O extrato do banco ${conciliado.contaBanco} já tem esta saída de ${(leitura.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${conciliado.dataISO.split("-").reverse().join("/")} conciliada com o lançamento ${conciliado.lancamentoId || "(sem número)"}. Lançar de novo duplicaria.`);
    const pendente = casam.find((m) => m.situacao === "pendente");
    if (pendente && analiticasSet.has(pendente.contaBanco)) {
      contaCredito = { codigo: pendente.contaBanco, motivo: `O extrato desta conta tem a saída do mesmo valor em ${pendente.dataISO.split("-").reverse().join("/")} ("${pendente.memo.slice(0, 40)}").` };
      extratoPendente = { fitid: pendente.fitid, contaBanco: pendente.contaBanco, dataISO: pendente.dataISO };
    }
  }
  if (!contaCredito && leitura.formaPagamento) {
    const pega = (f: (c: ContaPlano) => boolean) => { const l = analiticas.filter(f); return l.length === 1 ? l[0] : null; };
    const conta = leitura.formaPagamento === "dinheiro" ? pega(ehCaixa) : leitura.formaPagamento === "cartao_credito" ? pega(ehCartaoCredito) : pega(ehBanco);
    if (conta) contaCredito = { codigo: conta.codigo, motivo: leitura.formaPagamento === "dinheiro" ? "Pago em dinheiro: conta Caixa do plano." : leitura.formaPagamento === "cartao_credito" ? "Pago no cartão de crédito: conta do cartão a pagar." : `Pago por ${ROTULO_FORMA[leitura.formaPagamento]}: a única conta de banco do plano.` };
  }

  // Débito
  let contaDebito: SugestaoDocumento["contaDebito"] = null;
  const memo = [leitura.favorecido, leitura.historico].filter(Boolean).join(" ");
  if (memo && leitura.valorCentavos !== null) {
    const r = regraQueSeAplica({ memo, valorCentavos: -leitura.valorCentavos }, p.regras.filter((x) => x.ativo !== false) as any, contaCredito?.codigo || "", analiticasSet);
    if (r) contaDebito = { codigo: r.contaCodigo, motivo: `Regra da conciliação do escritório: o texto tem "${r.contem}".` };
  }
  const aprovadosOuPendentes = p.lancamentos.filter((l) => l.statusManual !== "rejeitado" && !l.estornoDe);
  if (!contaDebito && (leitura.favorecido || leitura.documentoFavorecido)) {
    const chaves = new Set(palavrasChave(leitura.favorecido || ""));
    const cont = new Map<string, number>();
    for (const l of aprovadosOuPendentes) {
      const credDisp = analiticas.find((c) => c.codigo === l.contaCreditoCodigo && ehDisponibilidade(c));
      if (!credDisp || !analiticasSet.has(l.contaDebitoCodigo)) continue;
      const h = l.historico || "";
      const casa = (leitura.documentoFavorecido && h.replace(/[^0-9A-Z]/gi, "").toUpperCase().includes(leitura.documentoFavorecido)) || palavrasChave(h).some((w) => chaves.has(w));
      if (casa) cont.set(l.contaDebitoCodigo, (cont.get(l.contaDebitoCodigo) ?? 0) + 1);
    }
    const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (melhor) contaDebito = { codigo: melhor[0], motivo: `A empresa já lançou ${melhor[1]} pagamento(s) a este favorecido nesta conta.` };
  }

  // Histórico: histórico padrão do escritório com a mesma palavra-chave, senão o texto lido.
  const chavesHist = new Set(palavrasChave([leitura.historico, leitura.tipoDocumento].filter(Boolean).join(" ")));
  const padrao = p.historicosPadrao.map((h) => ({ h, n: palavrasChave(h.texto).filter((w) => chavesHist.has(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0]?.h;
  const complemento = [leitura.favorecido, leitura.numeroDocumento ? `doc. ${leitura.numeroDocumento}` : null].filter(Boolean).join(" — ");
  const base = padrao ? padrao.texto : leitura.historico ? `Pagamento: ${leitura.historico}` : "";
  const historico = [base, complemento].filter(Boolean).join(" — ").slice(0, 240);

  // Lançamento parecido já existente (mesmo valor, até 3 dias e mesma conta de débito ou o favorecido no histórico).
  if (leitura.valorCentavos !== null && leitura.data) {
    const chavesFav = new Set(palavrasChave(leitura.favorecido || ""));
    const parecido = aprovadosOuPendentes.find((l) => {
      const d = normalizarDataContabil(l.data);
      if (!d || valorLancCentavos(l) !== leitura.valorCentavos || diasEntre(d, leitura.data!) > 3) return false;
      return (contaDebito && l.contaDebitoCodigo === contaDebito.codigo) || palavrasChave(l.historico || "").some((w) => chavesFav.has(w));
    });
    if (parecido) parecidos.push(`Já existe um lançamento de ${(leitura.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${String(normalizarDataContabil(parecido.data)).split("-").reverse().join("/")} ("${(parecido.historico || "").slice(0, 60)}"). Só grave se for outro pagamento.`);
  }
  return { contaDebito, contaCredito, historico, bloqueios, parecidos, extratoPendente };
}

/** Confere os campos que a pessoa confirmou antes de gravar. Devolve o motivo do erro, ou null quando está tudo certo. */
export function conferirConfirmacaoDocumento(c: { data: string; valorCentavos: number | null; contaDebito: string; contaCredito: string; historico: string }, contas: ContaPlano[]): string | null {
  const analiticas = new Set(contas.filter((x) => x.tipo === "analitica").map((x) => x.codigo));
  if (!normalizarDataContabil(c.data)) return "Preencha a data (dd/mm/aaaa).";
  if (c.valorCentavos === null || !Number.isSafeInteger(c.valorCentavos) || c.valorCentavos <= 0) return "Preencha o valor (ex.: 1.234,56).";
  if (!analiticas.has(c.contaDebito)) return "Escolha a conta de débito (conta analítica do plano).";
  if (!analiticas.has(c.contaCredito)) return "Escolha a conta de crédito (caixa, banco ou cartão; conta analítica do plano).";
  if (c.contaDebito === c.contaCredito) return "Débito e crédito não podem ser a mesma conta.";
  if (!c.historico.trim() || c.historico.length > 240) return "Preencha o histórico (até 240 caracteres).";
  return null;
}
