/**
 * Conferência do Balanço (L100) e da DRE (L300) da ECF pelo plano de contas referencial, a partir dos saldos anuais da ECD
 * e do vínculo de cada conta com a conta referencial (o mesmo vínculo gravado no I051 da ECD).
 *
 * Na ECF, o programa oficial recupera a ECD (Bloco C) e calcula o Bloco L sozinho a partir do vínculo referencial;
 * por isso este resultado serve para o contador comparar o que o programa vai apurar, não para ser importado.
 * Estrutura dos registros: manual da ECF Leiaute 12, registros L100 e L300. Tabelas: L100A e L300A (Lucro Real,
 * PJ em geral), usadas também para o Lucro Presumido na conferência.
 */
import { contasReferenciais, type ContaReferencial, type GrupoReferencial, type RegimeReferencial } from "./planoReferencialService";
import type { SaldoAnualECD } from "./ecdService";

export interface LinhaL100 { codigo: string; descricao: string; tipo: "S" | "A"; nivel: number; natureza: string; superior: string; ini: number; deb: number; cred: number; fin: number }
export interface LinhaL300 { codigo: string; descricao: string; tipo: "S" | "A"; nivel: number; superior: string; valor: number }

export interface ConferenciaBlocoL {
  l100: LinhaL100[];
  l300: LinhaL300[];
  totais: { ativoIni: number; passivoPlIni: number; ativoFin: number; passivoPlFin: number; resultadoAntesEncerramento: number };
  erros: string[];
}

function nivelDe(codigo: string, porCodigo: Map<string, ContaReferencial>): number {
  let n = 1, atual = porCodigo.get(codigo);
  while (atual && atual.superior && porCodigo.has(atual.superior)) { n++; atual = porCodigo.get(atual.superior); }
  return n;
}

export function conferirBlocoL(regime: RegimeReferencial, saldos: SaldoAnualECD[], mapa: Record<string, string>): ConferenciaBlocoL {
  const erros: string[] = [];
  const montar = (grupo: GrupoReferencial) => {
    const tabela = contasReferenciais(regime, grupo);
    return { tabela, porCodigo: new Map(tabela.map((c) => [c.codigo, c])) };
  };
  const pat = montar("patrimonial");
  const res = montar("resultado");

  const acum = (g: { porCodigo: Map<string, ContaReferencial> }, filtro: (s: SaldoAnualECD) => boolean, campos: Array<"ini" | "deb" | "cred" | "fin">) => {
    const soma = new Map<string, Record<string, number>>();
    for (const s of saldos.filter(filtro)) {
      const ref = mapa[s.codigo];
      if (!ref) { erros.push(`Conta ${s.codigo} sem vínculo com o plano referencial.`); continue; }
      let atual: ContaReferencial | undefined = g.porCodigo.get(ref);
      if (!atual) { erros.push(`Conta ${s.codigo}: conta referencial ${ref} não existe na tabela ${g === pat ? "L100A" : "L300A"}.`); continue; }
      if (atual.tipo !== "A") { erros.push(`Conta ${s.codigo}: ${ref} é sintética no plano referencial.`); continue; }
      while (atual) {
        const linha = soma.get(atual.codigo) || Object.fromEntries(campos.map((c) => [c, 0]));
        for (const c of campos) linha[c] += (s as any)[c] ?? 0;
        soma.set(atual.codigo, linha);
        atual = atual.superior ? g.porCodigo.get(atual.superior) : undefined;
      }
    }
    return soma;
  };

  const sPat = acum(pat, (s) => s.natureza === "01" || s.natureza === "02" || s.natureza === "03", ["ini", "deb", "cred", "fin"]);
  const l100: LinhaL100[] = pat.tabela.filter((c) => sPat.has(c.codigo)).map((c) => {
    const v = sPat.get(c.codigo)!;
    return { codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, nivel: nivelDe(c.codigo, pat.porCodigo), natureza: c.natureza.padStart(2, "0"), superior: c.superior, ini: v.ini, deb: v.deb, cred: v.cred, fin: v.fin };
  });
  const sRes = acum(res, (s) => s.natureza === "04", ["preEncerramento"] as any);
  const l300: LinhaL300[] = res.tabela.filter((c) => sRes.has(c.codigo)).map((c) => ({ codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, nivel: nivelDe(c.codigo, res.porCodigo), superior: c.superior, valor: sRes.get(c.codigo)!.preEncerramento }));

  const analiticas100 = l100.filter((l) => l.tipo === "A");
  const soma = (nats: string[], campo: "ini" | "fin") => analiticas100.filter((l) => nats.includes(l.natureza)).reduce((a, l) => a + l[campo], 0);
  const totais = {
    ativoIni: soma(["01"], "ini"), passivoPlIni: soma(["02", "03"], "ini"), ativoFin: soma(["01"], "fin"), passivoPlFin: soma(["02", "03"], "fin"),
    resultadoAntesEncerramento: l300.filter((l) => l.tipo === "A").reduce((a, l) => a + l.valor, 0),
  };
  if (totais.ativoFin + totais.passivoPlFin !== 0) erros.push("Saldo final do Ativo difere do Passivo + Patrimônio Líquido nas contas referenciais (REGRA_BALANCO_SALDO_FINAL).");
  if (totais.ativoIni + totais.passivoPlIni !== 0) erros.push("Saldo inicial do Ativo difere do Passivo + Patrimônio Líquido nas contas referenciais (REGRA_BALANCO_SALDO_INICIAL).");
  for (const l of analiticas100) if (l.ini + l.deb - l.cred !== l.fin) erros.push(`Conta referencial ${l.codigo}: saldo final ≠ inicial + débitos − créditos (REGRA_VALIDACAO_SALDO_FINAL_BAL).`);
  return { l100, l300, totais, erros: [...new Set(erros)] };
}

const fmt = (v: number) => (Math.abs(Math.round(v)) / 100).toFixed(2).replace(".", ",");
const dc = (v: number) => (v < 0 ? "C" : "D");
const limpa = (s: string) => s.replace(/\|/g, " ");

/** Linhas L100/L300 no formato do manual (para conferência; o programa da ECF as recalcula ao recuperar a ECD). */
export function registrosBlocoL(c: ConferenciaBlocoL): string[] {
  return [
    ...c.l100.map((l) => `|L100|${l.codigo}|${limpa(l.descricao)}|${l.tipo}|${l.nivel}|${l.natureza}|${l.superior}|${fmt(l.ini)}|${dc(l.ini)}|${fmt(l.deb)}|${fmt(l.cred)}|${fmt(l.fin)}|${dc(l.fin)}|`),
    ...c.l300.map((l) => `|L300|${l.codigo}|${limpa(l.descricao)}|${l.tipo}|${l.nivel}|04|${l.superior}|${fmt(l.valor)}|${dc(l.valor)}|`),
  ];
}
