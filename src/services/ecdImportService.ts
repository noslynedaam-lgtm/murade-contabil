/**
 * Leitura do arquivo TXT oficial da ECD (Sped Contábil) gerado por outro sistema (Alterdata, Domínio etc.) para trazer
 * plano de contas, centros de custo, saldos de abertura e lançamentos do ano. SÓ LEITURA do arquivo: nada é transmitido.
 *
 * Registros lidos (Manual de Orientação da ECD — leiaute 9, jan/2026, publicado no portal do Sped):
 *  0000 (|0000|LECD|DT_INI|DT_FIN|NOME|CNPJ|...), I050 (|I050|DT_ALT|COD_NAT|IND_CTA|NIVEL|COD_CTA|COD_CTA_SUP|CTA|),
 *  I075 (|I075|COD_HIST|DESCR_HIST|), I100 (|I100|DT_ALT|COD_CCUS|CCUS|), I150 (|I150|DT_INI|DT_FIN|),
 *  I155 (|I155|COD_CTA|COD_CCUS|VL_SLD_INI|IND_DC_INI|VL_DEB|VL_CRED|VL_SLD_FIN|IND_DC_FIN|),
 *  I200 (|I200|NUM_LANC|DT_LCTO|VL_LCTO|IND_LCTO|DT_LCTO_EXT|) e I250 (|I250|COD_CTA|COD_CCUS|VL_DC|IND_DC|NUM_ARQ|COD_HIST_PAD|HIST|COD_PART|).
 * São as mesmas posições que o gerador de ECD do Murade escreve (src/services/ecdService.ts), e o teste lê de volta um arquivo gerado por ele.
 *
 * Regras:
 *  - O CNPJ do 0000 tem de ser o da empresa aberta (não mistura empresas).
 *  - Saldos de abertura: VL_SLD_INI do I155 do PRIMEIRO período (I150) vira o saldo inicial da conta, com a competência do 1º mês.
 *  - Lançamentos: cada I200 vira um ou mais pares débito × crédito (o Murade guarda partidas aos pares; um I200 com várias
 *    partidas vira um lote com o mesmo loteId). A soma dos débitos tem de ser igual à dos créditos, senão o lançamento é recusado.
 *  - I200 do tipo "E" (encerramento do exercício) entra marcado como encerramento (fica fora da DRE, igual ao do Murade).
 *  - O id e a referência são fixos (ECD:<ano>:<número do lançamento>): importar o mesmo arquivo de novo não duplica nada.
 */
import type { CentroCustoContabil, ContaPlano, LancamentoContabil } from "../types";

export type ResumoImportacaoEcd = {
  cnpj: string; nome: string; dtIni: string; dtFin: string; ano: number;
  contas: number; analiticas: number; saldosAbertura: number; centros: number;
  lancamentosEcd: number; partidasGeradas: number; encerramentos: number; recusados: number;
  competenciaAbertura: string;
};
export type LeituraEcd = {
  ok: boolean; erros: string[]; avisos: string[];
  contas: ContaPlano[]; centrosCusto: CentroCustoContabil[]; lancamentos: LancamentoContabil[];
  resumo: ResumoImportacaoEcd | null;
};

const dataIso = (ddmmaaaa: string): string | null => {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(String(ddmmaaaa || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** "1.234,56" ou "1234,56" → centavos. */
export const centavosEcd = (v: string): number | null => {
  const t = String(v || "").trim().replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const [i, f = ""] = t.replace("-", "").split(".");
  const c = Number(i) * 100 + Number((f + "00").slice(0, 2));
  return t.startsWith("-") ? -c : c;
};
const sem = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ehArquivoEcd = (texto: string): boolean => /^﻿?\|0000\|LECD\|/.test(String(texto || "").trimStart());

export function lerArquivoEcd(texto: string, cnpjAtivo: string): LeituraEcd {
  const erros: string[] = [], avisos: string[] = [];
  const falha = (msg: string): LeituraEcd => ({ ok: false, erros: [msg], avisos, contas: [], centrosCusto: [], lancamentos: [], resumo: null });
  const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.startsWith("|"));
  if (!linhas.length || !linhas[0].startsWith("|0000|LECD|")) return falha("O arquivo não é uma ECD (o primeiro registro tem de ser |0000|LECD|).");
  const f0 = linhas[0].split("|");
  const dtIni = dataIso(f0[3]), dtFin = dataIso(f0[4]);
  const nome = f0[5] || "";
  const cnpj = String(f0[6] || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const ativo = String(cnpjAtivo || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!dtIni || !dtFin) return falha("Registro 0000: datas inicial/final inválidas.");
  if (cnpj.length !== 14) return falha("Registro 0000: CNPJ ausente ou inválido.");
  if (ativo && cnpj !== ativo) return falha(`Esta ECD é do CNPJ ${cnpj}, diferente da empresa aberta (${ativo}). Abra a empresa certa antes de importar.`);
  const ano = Number(dtIni.slice(0, 4));

  // Plano, históricos padronizados e centros
  const contasEcd: Array<{ cod: string; nat: string; ind: string; nivel: number; sup: string; desc: string }> = [];
  const historicos = new Map<string, string>();
  const centros = new Map<string, string>();
  for (const l of linhas) {
    const f = l.split("|");
    if (f[1] === "I050") contasEcd.push({ nat: f[3], ind: f[4], nivel: Number(f[5]), cod: f[6], sup: f[7], desc: f[8] || "" });
    else if (f[1] === "I075") historicos.set(f[2], f[3] || "");
    else if (f[1] === "I100") centros.set(f[3], f[4] || f[3]);
  }
  if (!contasEcd.length) return falha("O arquivo não tem plano de contas (registro I050).");
  const vistos = new Set<string>();
  const contas: ContaPlano[] = [];
  const naturezaCod = new Map<string, "D" | "C">();
  const descPorCod = new Map(contasEcd.map((c) => [c.cod, c.desc]));
  for (const c of contasEcd) {
    if (!c.cod || vistos.has(c.cod)) { if (c.cod) avisos.push(`Conta ${c.cod} repetida no I050: ficou a primeira.`); continue; }
    vistos.add(c.cod);
    if (!["A", "S"].includes(c.ind)) { erros.push(`I050 ${c.cod}: indicador de conta inválido (${c.ind}).`); continue; }
    let nivel = Number.isInteger(c.nivel) && c.nivel >= 1 ? c.nivel : 1;
    if (nivel > 5) { avisos.push(`Conta ${c.cod}: nível ${nivel} da ECD guardado como 5 (o Murad usa até 5 níveis; a hierarquia continua pelo código).`); nivel = 5; }
    // Natureza (D/C): 01 ativo = D; 02 passivo e 03 PL = C; 04 resultado: receita = C, despesa/custo = D; 05/09 = D.
    let natureza: "D" | "C" = "D";
    if (c.nat === "02" || c.nat === "03") natureza = "C";
    else if (c.nat === "04") {
      const caminho = sem([c.desc, descPorCod.get(c.sup) || ""].join(" "));
      natureza = /receita|faturamento|venda|rendimento|ganho/.test(caminho) && !/custo|despesa|deduc|devoluc/.test(sem(c.desc)) ? "C" : "D";
    }
    naturezaCod.set(c.cod, natureza);
    contas.push({ codigo: c.cod, descricao: c.desc.slice(0, 240), nivel: nivel as ContaPlano["nivel"], tipo: c.ind === "A" ? "analitica" : "sintetica", natureza });
  }
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));

  // Saldos de abertura: I155 do primeiro I150
  let periodo = 0, competenciaAbertura = "";
  let saldosAbertura = 0;
  const saldoPorConta = new Map<string, number>(); // assinado: D positivo
  for (const l of linhas) {
    const f = l.split("|");
    if (f[1] === "I150") { periodo++; if (periodo === 1) { const d = dataIso(f[2]); competenciaAbertura = d ? d.slice(0, 7) : ""; } continue; }
    if (f[1] !== "I155" || periodo !== 1) continue;
    const v = centavosEcd(f[4]);
    if (v === null) { erros.push(`I155 ${f[2]}: saldo inicial inválido (${f[4]}).`); continue; }
    if (!v) continue;
    const assinado = (f[5] === "C" ? -1 : 1) * v;
    saldoPorConta.set(f[2], (saldoPorConta.get(f[2]) ?? 0) + assinado); // soma centros de custo da mesma conta
  }
  for (const [cod, assinado] of saldoPorConta) {
    const conta = porCodigo.get(cod);
    if (!conta) { erros.push(`I155: conta ${cod} não existe no I050.`); continue; }
    if (!assinado) continue;
    conta.saldoInicial = (conta.natureza === "D" ? assinado : -assinado) / 100;
    conta.saldoInicialCompetencia = competenciaAbertura;
    saldosAbertura++;
  }
  const somaAbertura = [...saldoPorConta.values()].reduce((t, v) => t + v, 0);
  if (somaAbertura !== 0) avisos.push(`Os saldos de abertura não fecham (devedores − credores = ${(somaAbertura / 100).toFixed(2)}). Confira no Plano de Contas antes de aprovar.`);

  // Lançamentos
  const lancamentos: LancamentoContabil[] = [];
  let lancamentosEcd = 0, encerramentos = 0, recusados = 0;
  type Partida = { cod: string; cc: string; v: number; dc: string; hist: string; doc: string };
  const fechar = (cab: string[] | null, partidas: Partida[]) => {
    if (!cab) return;
    lancamentosEcd++;
    const num = cab[2], data = dataIso(cab[3]), tipo = cab[5];
    const rotulo = `I200 nº ${num}`;
    if (!data) { erros.push(`${rotulo}: data inválida.`); recusados++; return; }
    const deb = partidas.filter((p) => p.dc === "D").map((p) => ({ ...p })), cre = partidas.filter((p) => p.dc === "C").map((p) => ({ ...p }));
    const td = deb.reduce((t, p) => t + p.v, 0), tc = cre.reduce((t, p) => t + p.v, 0);
    if (!deb.length || !cre.length || td !== tc) { erros.push(`${rotulo} de ${data.split("-").reverse().join("/")}: débitos (${(td / 100).toFixed(2)}) e créditos (${(tc / 100).toFixed(2)}) não fecham; não entrou.`); recusados++; return; }
    const desconhecida = partidas.find((p) => !porCodigo.get(p.cod) || porCodigo.get(p.cod)!.tipo !== "analitica");
    if (desconhecida) { erros.push(`${rotulo}: conta ${desconhecida.cod} não existe ou não é analítica no I050; não entrou.`); recusados++; return; }
    if (tipo === "E") encerramentos++;
    const pares: Array<{ d: Partida; c: Partida; v: number }> = [];
    let i = 0, j = 0;
    while (i < deb.length && j < cre.length) {
      const v = Math.min(deb[i].v, cre[j].v);
      if (v > 0) pares.push({ d: deb[i], c: cre[j], v });
      deb[i].v -= v; cre[j].v -= v;
      if (deb[i].v === 0) i++;
      if (cre[j].v === 0) j++;
    }
    const lote = pares.length > 1 ? `ECD-${ano}-${num}` : undefined;
    pares.forEach((p, k) => {
      const hist = (p.d.hist || p.c.hist || "").trim() || `Lançamento ${num} da ECD ${ano}`;
      lancamentos.push({
        id: `ecd-${cnpj}-${ano}-${num}-${k + 1}`,
        data,
        contaDebitoCodigo: p.d.cod, contaDebitoNome: porCodigo.get(p.d.cod)!.descricao,
        contaCreditoCodigo: p.c.cod, contaCreditoNome: porCodigo.get(p.c.cod)!.descricao,
        valor: p.v / 100,
        historico: hist.slice(0, 240),
        origem: "Manual",
        documentoRef: `ECD:${ano}:${num}${pares.length > 1 ? `:${k + 1}` : ""}`,
        competencia: data.slice(0, 7),
        ...(p.d.cc && p.c.cc ? { centroCustoDebitoCodigo: p.d.cc, centroCustoCreditoCodigo: p.c.cc } : p.d.cc || p.c.cc ? { centroCustoCodigo: p.d.cc || p.c.cc } : {}),
        ...(lote ? { loteId: lote } : {}),
        ...(tipo === "E" ? { tipoEspecial: "encerramento" as const } : {}),
      });
    });
  };
  let cab: string[] | null = null;
  let partidas: Partida[] = [];
  for (const l of linhas) {
    const f = l.split("|");
    if (f[1] === "I200") { fechar(cab, partidas); cab = f; partidas = []; continue; }
    if (f[1] === "I250" && cab) {
      const v = centavosEcd(f[4]);
      if (v === null || v <= 0 || !["D", "C"].includes(f[5])) { erros.push(`I250 do lançamento ${cab[2]}: valor ou indicador D/C inválido.`); partidas.push({ cod: f[2], cc: f[3] || "", v: 0, dc: "X", hist: "", doc: "" }); continue; }
      const hist = (f[8] || "").trim() || historicos.get(f[7] || "") || "";
      partidas.push({ cod: f[2], cc: f[3] || "", v, dc: f[5], hist, doc: f[6] || "" });
      continue;
    }
    if (cab && !f[1].startsWith("I25")) { fechar(cab, partidas); cab = null; partidas = []; }
  }
  fechar(cab, partidas);
  if (lancamentos.length > 20000) erros.push(`A ECD gerou ${lancamentos.length} partidas; o limite por empresa é 20.000. Importe um ano por vez ou fale com o suporte.`);
  const centrosCusto: CentroCustoContabil[] = [...centros].map(([codigo, nomeCc]) => ({ id: `cc-${codigo}`, codigo, nome: (nomeCc || codigo).slice(0, 240) }));
  const resumo: ResumoImportacaoEcd = { cnpj, nome, dtIni, dtFin, ano, contas: contas.length, analiticas: contas.filter((c) => c.tipo === "analitica").length, saldosAbertura, centros: centrosCusto.length, lancamentosEcd, partidasGeradas: lancamentos.length, encerramentos, recusados, competenciaAbertura };
  avisos.push(`ECD de ${nome || cnpj}, ${dtIni.split("-").reverse().join("/")} a ${dtFin.split("-").reverse().join("/")}: ${contas.length} contas, ${saldosAbertura} saldo(s) de abertura em ${competenciaAbertura.split("-").reverse().join("/")}, ${lancamentosEcd} lançamento(s) da ECD → ${lancamentos.length} partida(s) no Murad${encerramentos ? ` (${encerramentos} de encerramento)` : ""}.`);
  return { ok: erros.length === 0, erros, avisos, contas, centrosCusto, lancamentos, resumo };
}
