/**
 * ECF — Bloco Y (Y540 e Y600) e Parte B do e-Lalur/e-Lacs (M010, M305/M355, M410 e M500) com controle de saldos entre anos.
 *
 * Fonte: Manual de Orientação do Leiaute da ECF (Receita Federal, portal do Sped). Os campos e a ordem seguem o manual:
 *  Y540: REG, CNPJ_ESTAB, VL_REC_ESTAB, CNAE ("quando for o caso"; receita de vendas por estabelecimento e atividade).
 *  Y600: REG, DT_ALT_SOC, DT_FIM_SOC, PAIS, IND_QUALIF (PF/PJ/FI), CPF_CNPJ, NOM_EMP, QUALIF, PERC_CAP_TOT, PERC_CAP_VOT,
 *        CPF_REP_LEG, QUALIF_REP_LEG, VL_REM_TRAB, VL_LUC_DIV, VL_JUR_CAP, VL_DEM_REND, VL_IR_RET.
 *  M010: REG, COD_CTA_B, DESC_CTA_LAL, DT_AP_LAL, COD_PB_RFB, DT_LIM_LAL, COD_TRIBUTO (I/C), VL_SALDO_INI, IND_VL_SALDO_INI, CNPJ_SIT_ESP
 *        (saldo inicial zero quando a conta foi criada no próprio período; o saldo final do último período vai para a ECF seguinte).
 *  M300/M350 IND_RELACAO: 1 = com conta da Parte B (filhos M305/M355: REG, COD_CTA_B, VL_CTA, IND_VL_CTA), 4 = sem relacionamento.
 *  M410: REG, COD_CTA_B, COD_TRIBUTO, VAL_LAN_LALB_PB, IND_VAL_LAN_LALB_PB (CR/DB/PF/BC), COD_CTA_B_CTP, HIST_LAN_LALB, IND_LAN_ANT (S/N).
 *  M500: REG, COD_CTA_B, COD_TRIBUTO, SD_INI_LAL, IND_SD_INI_LAL, VL_LCTO_PARTE_A, IND_VL_LCTO_PARTE_A, VL_LCTO_PARTE_B,
 *        IND_VL_LCTO_PARTE_B, SD_FIM_LAL, IND_SD_FIM_LAL.
 * Neste ambiente o PDF do manual no portal do Sped não pôde ser aberto; a ordem dos campos foi conferida com a reprodução do
 * manual publicada por fornecedor de ERP (documentacao.senior.com.br, blocos Y e M). As tabelas de códigos (QUALIF do Y600 e
 * COD_PB_RFB do M010) NÃO são inventadas aqui: a contadora informa o código da tabela do programa da ECF. Valide sempre no PGE.
 * Só apuração ANUAL do Lucro Real recebe M410/M500 neste gerador (período A00); no trimestral, lance a Parte B no programa da ECF.
 * Lançamentos M410 dos tipos PF/BC (prejuízo/base negativa do período) não são gerados aqui: o programa da ECF os trata.
 */
import { textoECD } from "./ecdService";

export type DC = "D" | "C";
export interface SocioY600 {
  dtAlt: string; dtFim?: string; pais: string; indQualif: "PF" | "PJ" | "FI"; cpfCnpj: string; nome: string; qualif: string;
  percCapTot: number; percCapVot: number; cpfRepLeg?: string; qualifRepLeg?: string;
  remTrabCentavos?: number; lucDivCentavos?: number; jurCapCentavos?: number; demRendCentavos?: number; irRetCentavos?: number;
}
export interface EstabY540 { cnpjEstab: string; receitaCentavos: number; cnae: string }
export interface VinculoParteA { registro: "M300" | "M350"; codigo: string; valorCentavos: number; indicador: DC }
export interface LancParteB { valorCentavos: number; indicador: "CR" | "DB"; contrapartida?: string; historico: string; realizacaoAnterior: "S" | "N" }
export interface ContaParteB {
  codigo: string; descricao: string; dtAp: string; codPbRfb: string; dtLim?: string; tributo: "I" | "C";
  /** Saldo inicial declarado (usado só no primeiro ano em que a conta aparece; nos seguintes vem do saldo final do ano anterior). */
  saldoInicialCentavos: number; indSaldoInicial: DC; cnpjSitEsp?: string;
  vinculos: VinculoParteA[]; lancamentos: LancParteB[];
}
export interface ComplementosEcfAno { y600: SocioY600[]; y540: EstabY540[]; parteB: ContaParteB[] }
export type ComplementosEcf = Record<string, ComplementosEcfAno>;

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const dataBR = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}${m[2]}${m[1]}` : ""; };
const valor = (c: number) => (Math.abs(Math.round(c)) / 100).toFixed(2).replace(".", ",");
const perc = (p: number) => (Math.round(p * 10000) / 10000).toFixed(4).replace(".", ",");
const assinado = (v: number, ind: DC) => (ind === "C" ? v : -v); // credor positivo
const indDe = (v: number): DC => (v < 0 ? "D" : "C");

function cpfOk(c: string) { if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false; for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); if (((s * 10) % 11) % 10 !== Number(c[n])) return false; } return true; }
function cnpjOk(c: string) { if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false; const calc = (n: number) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === Number(c[12]) && calc(13) === Number(c[13]); }

export type SaldoParteB = { codigo: string; tributo: "I" | "C"; inicial: number; parteA: number; parteB: number; final: number; origemInicial: "declarado" | "ano_anterior" | "zero_criada_no_ano" };

/** Controle de saldos entre anos: o saldo inicial de um ano é o saldo final do ano anterior (se a conta existia nele). */
export function saldosParteB(todos: ComplementosEcf, ano: number): SaldoParteB[] {
  const doAno = todos[String(ano)]?.parteB || [];
  const anterior = todos[String(ano - 1)] ? saldosParteB(todos, ano - 1) : [];
  return doAno.map((c) => {
    const ant = anterior.find((a) => a.codigo === c.codigo && a.tributo === c.tributo);
    const criadaNoAno = String(c.dtAp || "").startsWith(`${ano}-`);
    const inicial = ant ? ant.final : criadaNoAno ? 0 : assinado(Math.abs(c.saldoInicialCentavos || 0), c.indSaldoInicial);
    const parteA = c.vinculos.reduce((t, v) => t + assinado(Math.abs(v.valorCentavos), v.indicador), 0);
    let parteB = c.lancamentos.reduce((t, l) => t + (l.indicador === "CR" ? 1 : -1) * Math.abs(l.valorCentavos), 0);
    // lançamentos de outras contas que têm ESTA como contrapartida: efeito inverso
    for (const outra of doAno) if (outra.codigo !== c.codigo) for (const l of outra.lancamentos) if (l.contrapartida === c.codigo) parteB += (l.indicador === "CR" ? -1 : 1) * Math.abs(l.valorCentavos);
    return { codigo: c.codigo, tributo: c.tributo, inicial, parteA, parteB, final: inicial + parteA + parteB, origemInicial: ant ? "ano_anterior" : criadaNoAno ? "zero_criada_no_ano" : "declarado" };
  });
}

export type ResultadoComplementos = { erros: string[]; avisos: string[]; registros: string[]; saldos: SaldoParteB[] };

/** Valida e encaixa Y540/Y600 e a Parte B nos registros já calculados (M/N ou P). Não altera nada além do que foi informado. */
export function aplicarComplementosEcf(registros: string[], todos: ComplementosEcf | undefined, ano: number, opcoes: { cnpj: string; formaTrib: "1" | "5"; formaApur: "A" | "T" }): ResultadoComplementos {
  const erros: string[] = [], avisos: string[] = [];
  const c = todos?.[String(ano)];
  if (!c) return { erros, avisos, registros, saldos: [] };
  const raiz = dig(opcoes.cnpj).slice(0, 8);
  const y: string[] = [];
  // Y540
  for (const e of c.y540 || []) {
    const cn = dig(e.cnpjEstab);
    if (cn.length !== 14 || !cnpjOk(cn)) { erros.push(`Y540: CNPJ do estabelecimento ${e.cnpjEstab} inválido.`); continue; }
    if (cn.slice(0, 8) !== raiz) { erros.push(`Y540: o estabelecimento ${cn} não é da mesma empresa (os 8 primeiros dígitos têm de ser iguais aos do CNPJ).`); continue; }
    if (dig(e.cnae).length !== 7) { erros.push(`Y540: CNAE do estabelecimento ${cn} precisa ter 7 dígitos.`); continue; }
    if (!(e.receitaCentavos >= 0)) { erros.push(`Y540: receita do estabelecimento ${cn} inválida.`); continue; }
    y.push(`|Y540|${cn}|${valor(e.receitaCentavos)}|${dig(e.cnae)}|`);
  }
  // Y600
  const s = c.y600 || [];
  if (s.length > 999) erros.push("Y600: no máximo 999 sócios/titulares/dirigentes.");
  let somaAtivos = 0;
  for (const p of s) {
    const nome = textoECD(p.nome, 150);
    const doc = String(p.cpfCnpj || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (!nome) { erros.push("Y600: sócio sem nome."); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dtAlt || "")) { erros.push(`Y600 (${nome}): data da última alteração no quadro societário obrigatória.`); continue; }
    if (p.dtFim && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dtFim) || !p.dtFim.startsWith(`${ano}-`))) { erros.push(`Y600 (${nome}): a data de saída só é informada se a saída foi em ${ano}.`); continue; }
    if (!/^\d{3}$/.test(dig(p.pais))) { erros.push(`Y600 (${nome}): país com 3 dígitos (Brasil = 105).`); continue; }
    if (!["PF", "PJ", "FI"].includes(p.indQualif)) { erros.push(`Y600 (${nome}): indicador PF, PJ ou FI.`); continue; }
    if (dig(p.pais) === "105") {
      if (p.indQualif === "PF" ? !cpfOk(dig(doc)) : !cnpjOk(dig(doc))) { erros.push(`Y600 (${nome}): ${p.indQualif === "PF" ? "CPF" : "CNPJ"} inválido (obrigatório para residente no Brasil).`); continue; }
    }
    if (!/^\d{2}$/.test(String(p.qualif || ""))) { erros.push(`Y600 (${nome}): informe a qualificação (código de 2 dígitos da tabela do programa da ECF).`); continue; }
    if (!(p.percCapTot >= 0 && p.percCapTot <= 100 && p.percCapVot >= 0 && p.percCapVot <= 100)) { erros.push(`Y600 (${nome}): percentuais do capital entre 0 e 100.`); continue; }
    if (p.cpfRepLeg && (!cpfOk(dig(p.cpfRepLeg)) || !/^\d{2}$/.test(String(p.qualifRepLeg || "")))) { erros.push(`Y600 (${nome}): CPF do representante legal inválido ou sem a qualificação dele.`); continue; }
    if (!p.dtFim) somaAtivos += p.percCapTot;
    const v = (x?: number) => (x ? valor(x) : "");
    y.push(`|Y600|${dataBR(p.dtAlt)}|${p.dtFim ? dataBR(p.dtFim) : ""}|${dig(p.pais)}|${p.indQualif}|${dig(p.pais) === "105" ? dig(doc) : doc}|${nome}|${p.qualif}|${perc(p.percCapTot)}|${perc(p.percCapVot)}|${p.cpfRepLeg ? dig(p.cpfRepLeg) : ""}|${p.cpfRepLeg ? p.qualifRepLeg : ""}|${v(p.remTrabCentavos)}|${v(p.lucDivCentavos)}|${v(p.jurCapCentavos)}|${v(p.demRendCentavos)}|${v(p.irRetCentavos)}|`);
  }
  if (s.length && Math.abs(somaAtivos - 100) > 0.0001 && somaAtivos > 0) avisos.push(`Y600: a soma do percentual do capital dos sócios que continuam no quadro é ${perc(somaAtivos)}%; confira (dirigentes não sócios entram com 0%).`);

  // Parte B
  const contas = c.parteB || [];
  const saldos = saldosParteB(todos!, ano);
  let saida = [...registros];
  if (contas.length) {
    if (opcoes.formaTrib !== "1") erros.push("Parte B (M010/M410/M500) só existe no Lucro Real.");
    else if (opcoes.formaApur !== "A") erros.push("Parte B neste gerador só na apuração anual; no Lucro Real trimestral lance a Parte B no programa da ECF.");
    else {
      const codigos = new Set<string>();
      const m010: string[] = [], m410: string[] = [], m500: string[] = [];
      for (const ct of contas) {
        const chave = `${ct.codigo}|${ct.tributo}`;
        if (!ct.codigo.trim() || codigos.has(chave)) { erros.push(`M010: código da conta da Parte B vazio ou repetido (${ct.codigo}).`); continue; }
        codigos.add(chave);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ct.dtAp || "") || ct.dtAp > `${ano}-12-31`) { erros.push(`M010 ${ct.codigo}: data de criação da conta inválida.`); continue; }
        if (!String(ct.codPbRfb || "").trim() || String(ct.codPbRfb).length > 6) { erros.push(`M010 ${ct.codigo}: informe o código da tabela padrão da Parte B (COD_PB_RFB, até 6 caracteres) do programa da ECF.`); continue; }
        if (!["I", "C"].includes(ct.tributo)) { erros.push(`M010 ${ct.codigo}: tributo I (IRPJ) ou C (CSLL).`); continue; }
        const sd = saldos.find((x) => x.codigo === ct.codigo && x.tributo === ct.tributo)!;
        m010.push(`|M010|${textoECD(ct.codigo, 60)}|${textoECD(ct.descricao, 255)}|${dataBR(ct.dtAp)}|${textoECD(ct.codPbRfb, 6)}|${ct.dtLim ? dataBR(ct.dtLim) : ""}|${ct.tributo}|${valor(sd.inicial)}|${indDe(sd.inicial)}|${ct.cnpjSitEsp ? dig(ct.cnpjSitEsp) : ""}|`);
        for (const l of ct.lancamentos) {
          if (!(l.valorCentavos > 0) || !textoECD(l.historico)) { erros.push(`M410 ${ct.codigo}: lançamento sem valor ou sem histórico.`); continue; }
          if (l.contrapartida && !contas.some((o) => o.codigo === l.contrapartida)) { erros.push(`M410 ${ct.codigo}: contrapartida ${l.contrapartida} não está cadastrada na Parte B.`); continue; }
          m410.push(`|M410|${textoECD(ct.codigo, 60)}|${ct.tributo}|${valor(l.valorCentavos)}|${l.indicador}|${l.contrapartida ? textoECD(l.contrapartida, 60) : ""}|${textoECD(l.historico, 255)}|${l.realizacaoAnterior}|`);
        }
        m500.push(`|M500|${textoECD(ct.codigo, 60)}|${ct.tributo}|${valor(sd.inicial)}|${indDe(sd.inicial)}|${valor(sd.parteA)}|${indDe(sd.parteA)}|${valor(sd.parteB)}|${indDe(sd.parteB)}|${valor(sd.final)}|${indDe(sd.final)}|`);
      }
      // Vínculos com o M300/M350: muda o IND_RELACAO de 4 para 1 e põe o M305/M355 logo depois da linha
      const vinculos = contas.flatMap((ct) => ct.vinculos.map((v) => ({ ...v, conta: ct.codigo, tributo: ct.tributo })));
      for (const v of vinculos) {
        if (v.registro === "M300" && v.tributo !== "I") erros.push(`M305: a conta ${v.conta} é de CSLL; vínculo com M300 (IRPJ) não confere.`);
        if (v.registro === "M350" && v.tributo !== "C") erros.push(`M355: a conta ${v.conta} é de IRPJ; vínculo com M350 (CSLL) não confere.`);
      }
      const novo: string[] = [];
      for (const linha of saida) {
        const f = linha.split("|");
        const reg = f[1];
        if ((reg === "M300" || reg === "M350")) {
          const meus = vinculos.filter((v) => v.registro === reg && v.codigo === f[2]);
          if (meus.length) {
            const total = meus.reduce((t, v) => t + Math.abs(v.valorCentavos), 0);
            const valorLinha = Math.round(Number(String(f[6] || "0").replace(",", ".")) * 100);
            if (total > valorLinha) erros.push(`${reg} ${f[2]}: os vínculos com a Parte B somam ${valor(total)}, mais que o valor do lançamento (${valor(valorLinha)}).`);
            f[5] = f[5] === "2" ? "3" : "1";
            novo.push(f.join("|"));
            for (const v of meus) novo.push(`|${reg === "M300" ? "M305" : "M355"}|${textoECD(v.conta, 60)}|${valor(v.valorCentavos)}|${v.indicador}|`);
            continue;
          }
        }
        novo.push(linha);
      }
      for (const v of vinculos) if (!saida.some((l) => l.startsWith(`|${v.registro}|${v.codigo}|`))) erros.push(`${v.registro} ${v.codigo}: não há esse lançamento na Parte A calculada; o vínculo da conta ${v.conta} não entra.`);
      // Ordem do bloco M: M010 antes do primeiro M030; M410 e M500 no fim do período A00 (antes do N030)
      const iM030 = novo.findIndex((l) => l.startsWith("|M030|"));
      if (iM030 < 0) erros.push("Parte B: calcule antes o e-Lalur/e-Lacs (M300/M350) do Lucro Real anual.");
      else {
        novo.splice(iM030, 0, ...m010);
        let fimM = -1;
        novo.forEach((l, i) => { if (l.startsWith("|M")) fimM = i; });
        novo.splice(fimM + 1, 0, ...m410, ...m500);
      }
      saida = novo;
    }
  }
  if (y.length) {
    // Bloco Y vai depois de tudo (a montagem do arquivo separa por bloco); ordem Y540 → Y600.
    saida = [...saida, ...y.filter((l) => l.startsWith("|Y540|")), ...y.filter((l) => l.startsWith("|Y600|"))];
  }
  return { erros, avisos, registros: erros.length ? registros : saida, saldos };
}

export function complementosValidos(v: unknown): v is ComplementosEcf {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, any>).every(([k, a]) => /^\d{4}$/.test(k) && a && Array.isArray(a.y600) && Array.isArray(a.y540) && Array.isArray(a.parteB) && a.y600.length <= 999 && a.y540.length <= 2000 && a.parteB.length <= 500);
}
