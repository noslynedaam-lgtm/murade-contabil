// Livro Caixa do Simples Nacional e fluxo de caixa interno (mesmo cálculo da aba "Fluxo de caixa interno" dos Livros).
//
// Fonte legal (Normas RFB, Resolução CGSN nº 140/2018, art. 63):
//  - inciso I: a ME/EPP optante pelo Simples Nacional adota o Livro Caixa, "no qual deverá estar escriturada toda a sua
//    movimentação financeira e bancária";
//  - § 3º: a apresentação da escrituração contábil, em especial do Livro Diário e do Livro Razão, dispensa o Livro Caixa;
//  - § 4º: quem recebeu aporte de capital (LC 123/2006, arts. 61-A a 61-D) mantém ECD e fica dispensado do Livro Caixa;
//  - § 7º: o Livro Caixa tem termos de abertura e de encerramento, assinados pelo representante legal e pelo
//    contabilista legalmente habilitado (se houver no local), e é escriturado por estabelecimento.
// Nada aqui estima saldo: sem as contas de Caixa/Bancos marcadas e o saldo inicial confirmado, o livro fica pendente.
import type { ContaPlano, EmpresaDados, LancamentoContabil, LivroContabil } from "../types";
import { converterCentavos, gerarRelatoriosContabeis, moedaContabil, type LancamentoValidado } from "./livrosContabeis";

export type LinhaCaixa = { dataISO: string; conta: string; contraparte: string; historico: string; referencia: string; entrada: number; saida: number };
export type FluxoCaixaInterno = { disponivel: boolean; motivo: string; saldoInicialCentavos: number; entradasCentavos: number; saidasCentavos: number; saldoFinalCentavos: number; linhas: LinhaCaixa[] };

const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Contas de disponibilidades marcadas pela empresa (analíticas e devedoras), na ordem do plano. */
export function contasDisponibilidadesDaEmpresa(contas: ContaPlano[], codigos: string[] | undefined): ContaPlano[] {
  const marcadas = new Set(codigos || []);
  return contas.filter((conta) => conta.tipo === "analitica" && conta.natureza === "D" && marcadas.has(conta.codigo));
}

/**
 * Fluxo de caixa interno de UMA competência (AAAA-MM), a partir dos lançamentos definitivos validados.
 * É o mesmo cálculo que a aba "Fluxo de caixa interno" fazia dentro da tela (extraído para ser reaproveitado pelo Livro Caixa e pelo robô).
 */
export function calcularFluxoCaixaInterno(contasDisponibilidades: ContaPlano[], validos: LancamentoValidado[], periodo: string): FluxoCaixaInterno {
  const indisponivel = (motivo: string): FluxoCaixaInterno => ({ disponivel: false, motivo, saldoInicialCentavos: 0, entradasCentavos: 0, saidasCentavos: 0, saldoFinalCentavos: 0, linhas: [] });
  if (periodo === "todos" || !COMP.test(periodo)) return indisponivel("Selecione uma competência específica para conferir o fluxo de caixa.");
  if (!contasDisponibilidades.length) return indisponivel("Marque as contas analíticas de Caixa e Bancos usadas por esta empresa.");
  const codigos = new Set(contasDisponibilidades.map((conta) => conta.codigo));
  const semAbertura = contasDisponibilidades.filter((conta) => {
    const saldo = converterCentavos(conta.saldoInicial ?? NaN);
    return saldo === null || !COMP.test(String(conta.saldoInicialCompetencia || "")) || String(conta.saldoInicialCompetencia) > periodo;
  });
  if (semAbertura.length) return indisponivel(`Informe e confirme o saldo inicial e a competência-base de: ${semAbertura.map((conta) => `${conta.codigo} ${conta.descricao}`).join(", ")}.`);
  const lancamentosAberturaAusentes = contasDisponibilidades.filter((conta) => conta.saldoInicialConvertidoEm
    && !validos.some((item) => item.original.saldoInicialContaCodigo === conta.codigo));
  if (lancamentosAberturaAusentes.length) return indisponivel(`Abertura marcada como convertida sem lançamento aprovado para: ${lancamentosAberturaAusentes.map((conta) => conta.codigo).join(", ")}.`);
  let saldoInicialCentavos = 0;
  for (const conta of contasDisponibilidades) {
    const saldo = converterCentavos(conta.saldoInicial ?? 0) || 0;
    if (!conta.saldoInicialConvertidoEm) saldoInicialCentavos += saldo;
  }
  const linhas: LinhaCaixa[] = [];
  const processar = (item: LancamentoValidado, codigoCaixa: string, debitoCaixa: boolean) => {
    const competencia = item.dataISO.slice(0, 7);
    const contaCaixa = contasDisponibilidades.find((conta) => conta.codigo === codigoCaixa)!;
    const competenciaBase = String(contaCaixa.saldoInicialCompetencia || "");
    if (competencia < competenciaBase || competencia > periodo) return;
    const delta = debitoCaixa ? item.valorCentavos : -item.valorCentavos;
    if (item.original.saldoInicialContaCodigo) { saldoInicialCentavos += delta; return; }
    if (competencia < periodo) { saldoInicialCentavos += delta; return; }
    const contraparte = debitoCaixa ? item.credito : item.debito;
    linhas.push({ dataISO: item.dataISO, conta: codigoCaixa, contraparte: `${contraparte.codigo} — ${contraparte.descricao}`, historico: item.original.historico, referencia: String(item.original.documentoRef || item.original.id), entrada: Math.max(0, delta), saida: Math.max(0, -delta) });
  };
  for (const item of validos) {
    if (codigos.has(item.debito.codigo)) processar(item, item.debito.codigo, true);
    if (codigos.has(item.credito.codigo)) processar(item, item.credito.codigo, false);
  }
  linhas.sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.referencia.localeCompare(b.referencia));
  const entradasCentavos = linhas.reduce((soma, item) => soma + item.entrada, 0);
  const saidasCentavos = linhas.reduce((soma, item) => soma + item.saida, 0);
  return { disponivel: true, motivo: "Valores derivados de lançamentos definitivos e contas de disponibilidades explicitamente selecionadas.", saldoInicialCentavos, entradasCentavos, saidasCentavos, saldoFinalCentavos: saldoInicialCentavos + entradasCentavos - saidasCentavos, linhas };
}

export function competenciasEntre(de: string, ate: string): string[] {
  if (!COMP.test(de) || !COMP.test(ate) || de > ate) return [];
  const saida: string[] = [];
  let [a, m] = de.split("-").map(Number);
  for (let i = 0; i < 240; i++) {
    const c = `${a}-${String(m).padStart(2, "0")}`;
    if (c > ate) break;
    saida.push(c);
    m += 1; if (m > 12) { m = 1; a += 1; }
  }
  return saida;
}

export type MesLivroCaixa = { competencia: string } & Omit<FluxoCaixaInterno, "disponivel" | "motivo">;
export type LivroCaixa = {
  disponivel: boolean; motivo: string; de: string; ate: string;
  meses: MesLivroCaixa[];
  saldoInicialCentavos: number; entradasCentavos: number; saidasCentavos: number; saldoFinalCentavos: number;
  contas: Array<{ codigo: string; descricao: string }>;
};

/** Livro Caixa de um intervalo de competências (AAAA-MM a AAAA-MM): um bloco por mês, com saldo levado de um mês para o outro. */
export function gerarLivroCaixa(entrada: { contas: ContaPlano[]; lancamentos: LancamentoContabil[]; codigosCaixa: string[] | undefined; de: string; ate: string }): LivroCaixa {
  const contasCaixa = contasDisponibilidadesDaEmpresa(entrada.contas, entrada.codigosCaixa);
  const base = { de: entrada.de, ate: entrada.ate, meses: [] as MesLivroCaixa[], saldoInicialCentavos: 0, entradasCentavos: 0, saidasCentavos: 0, saldoFinalCentavos: 0, contas: contasCaixa.map((c) => ({ codigo: c.codigo, descricao: c.descricao })) };
  const competencias = competenciasEntre(entrada.de, entrada.ate);
  if (!competencias.length) return { ...base, disponivel: false, motivo: "Informe o período (de/até) no formato AAAA-MM, com o início antes do fim." };
  if (competencias.length > 24) return { ...base, disponivel: false, motivo: "Gere o Livro Caixa de no máximo 24 meses por vez." };
  const rel = gerarRelatoriosContabeis(entrada.contas, entrada.lancamentos, "todos");
  if (rel.invalidos.length) return { ...base, disponivel: false, motivo: `${rel.invalidos.length} lançamento(s) definitivo(s) com dado inválido; corrija antes de emitir o Livro Caixa.` };
  const meses: MesLivroCaixa[] = [];
  for (const c of competencias) {
    const f = calcularFluxoCaixaInterno(contasCaixa, rel.validos, c);
    if (!f.disponivel) return { ...base, disponivel: false, motivo: f.motivo };
    meses.push({ competencia: c, saldoInicialCentavos: f.saldoInicialCentavos, entradasCentavos: f.entradasCentavos, saidasCentavos: f.saidasCentavos, saldoFinalCentavos: f.saldoFinalCentavos, linhas: f.linhas });
  }
  const entradas = meses.reduce((t, m) => t + m.entradasCentavos, 0);
  const saidas = meses.reduce((t, m) => t + m.saidasCentavos, 0);
  return { ...base, disponivel: true, motivo: "Livro Caixa montado com lançamentos aprovados e as contas de Caixa/Bancos marcadas.", meses, saldoInicialCentavos: meses[0].saldoInicialCentavos, entradasCentavos: entradas, saidasCentavos: saidas, saldoFinalCentavos: meses[meses.length - 1].saldoFinalCentavos };
}

const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

/** Termos de abertura e de encerramento (Res. CGSN 140/2018, art. 63, § 7º). Texto simples para impressão e assinatura. */
export function termosLivroCaixa(empresa: Pick<EmpresaDados, "razaoSocial" | "cnpj" | "endereco" | "cidadeUf" | "municipio" | "uf" | "responsavelNome" | "contadorNome" | "contadorCrc">, livro: Pick<LivroCaixa, "de" | "ate" | "meses" | "entradasCentavos" | "saidasCentavos" | "saldoFinalCentavos">): { abertura: string; encerramento: string; assinaturas: string[] } {
  const nome = String(empresa.razaoSocial || "Empresa sem razão social").trim();
  const local = String(empresa.endereco || "").trim() || [empresa.municipio, empresa.uf].filter(Boolean).join("/") || String(empresa.cidadeUf || "").trim() || "endereço não informado";
  const periodo = livro.de === livro.ate ? `a competência ${mesAno(livro.de)}` : `o período de ${mesAno(livro.de)} a ${mesAno(livro.ate)}`;
  const abertura = `TERMO DE ABERTURA — Este Livro Caixa, com as folhas numeradas em sequência que se seguem, destina-se à escrituração de toda a movimentação financeira e bancária do estabelecimento de ${nome}, CNPJ ${empresa.cnpj || "não informado"}, situado em ${local}, optante pelo Simples Nacional, e compreende ${periodo} (Resolução CGSN nº 140/2018, art. 63, inciso I e § 7º).`;
  const encerramento = `TERMO DE ENCERRAMENTO — Encerra-se este Livro Caixa de ${nome}, CNPJ ${empresa.cnpj || "não informado"}, referente a ${periodo}, com ${livro.meses.length} mês(es) escriturado(s), entradas de ${moedaContabil(livro.entradasCentavos)}, saídas de ${moedaContabil(livro.saidasCentavos)} e saldo final de ${moedaContabil(livro.saldoFinalCentavos)}.`;
  const assinaturas = [
    `Representante legal: ${String(empresa.responsavelNome || "").trim() || "________________________________"}`,
    `Contabilista: ${String(empresa.contadorNome || "").trim() || "________________________________"}${empresa.contadorCrc ? ` — CRC ${empresa.contadorCrc}` : ""}`,
  ];
  return { abertura, encerramento, assinaturas };
}

export const idLivroCaixa = (competencia: string) => `livro-caixa-${competencia}`;

/** Registro do Livro Caixa emitido para a competência (fica na lista de livros da empresa). */
export function registroLivroCaixa(mes: MesLivroCaixa): LivroContabil {
  return {
    id: idLivroCaixa(mes.competencia),
    titulo: "Livro Caixa (Simples Nacional)",
    descricao: `Saldo inicial ${moedaContabil(mes.saldoInicialCentavos)}; entradas ${moedaContabil(mes.entradasCentavos)}; saídas ${moedaContabil(mes.saidasCentavos)}; saldo final ${moedaContabil(mes.saldoFinalCentavos)}; ${mes.linhas.length} movimento(s).`,
    status: "pronto",
    tipo: "contabil",
    orgaoDestino: "Guarda na empresa (Res. CGSN 140/2018, art. 63, I)",
    competencia: mes.competencia,
  };
}

export function ehSimplesNacional(regime: unknown): boolean {
  return /^\s*simples\s+nacional/i.test(String(regime || ""));
}

export type SituacaoLivroCaixa =
  | { situacao: "nao_se_aplica"; detalhe: string }
  | { situacao: "dispensado"; detalhe: string }
  | { situacao: "emitido"; detalhe: string }
  | { situacao: "pode_emitir"; detalhe: string; registro: LivroContabil }
  | { situacao: "pendente"; detalhe: string };

/**
 * Conferência do Livro Caixa de UMA competência para empresa do Simples Nacional:
 * escrituração contábil no mês (Diário/Razão) dispensa o Livro Caixa (art. 63, § 3º); senão o Livro Caixa do mês
 * precisa estar emitido. Quando dá para montar (contas de caixa marcadas e saldo inicial confirmado), devolve o registro pronto.
 */
export function situacaoLivroCaixaDoMes(payload: Record<string, any>, competencia: string): SituacaoLivroCaixa {
  const empresa = payload?.empresa || {};
  if (!ehSimplesNacional(empresa.regime)) return { situacao: "nao_se_aplica", detalhe: "A empresa não está no Simples Nacional." };
  if (empresa.simplesAporteCapital === true) return { situacao: "nao_se_aplica", detalhe: "Empresa com aporte de capital (LC 123, arts. 61-A a 61-D): mantém ECD e fica dispensada do Livro Caixa (Res. CGSN 140/2018, art. 63, § 4º)." };
  const contas: ContaPlano[] = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos: LancamentoContabil[] = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  const livros: LivroContabil[] = Array.isArray(payload?.livros) ? payload.livros : [];
  const rel = gerarRelatoriosContabeis(contas, lancamentos, competencia);
  if (rel.doPeriodo.length) return { situacao: "dispensado", detalhe: `${rel.doPeriodo.length} lançamento(s) aprovado(s) em ${mesAno(competencia)}: a escrituração contábil (Diário e Razão) dispensa o Livro Caixa (Res. CGSN 140/2018, art. 63, § 3º).` };
  if (livros.some((l) => l?.id === idLivroCaixa(competencia))) return { situacao: "emitido", detalhe: `Livro Caixa de ${mesAno(competencia)} já emitido.` };
  const livro = gerarLivroCaixa({ contas, lancamentos, codigosCaixa: empresa.contasDisponibilidadesCodigo, de: competencia, ate: competencia });
  if (!livro.disponivel) return { situacao: "pendente", detalhe: `Empresa do Simples sem Diário/Razão e sem Livro Caixa em ${mesAno(competencia)}. Para o Livro Caixa sair: ${livro.motivo}` };
  return { situacao: "pode_emitir", detalhe: `Livro Caixa de ${mesAno(competencia)} pode ser emitido (sem lançamentos no mês, saldo ${moedaContabil(livro.saldoFinalCentavos)}).`, registro: registroLivroCaixa(livro.meses[0]) };
}
