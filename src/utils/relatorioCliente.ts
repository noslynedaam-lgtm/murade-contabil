// Gráficos (SVG puro, sem biblioteca) e o "Relatório para o cliente" em HTML pronto para imprimir/salvar em PDF.
// Só mostra o que a contabilidade calculou (balanço, DRE, índices e série de 12 meses); nenhum número é estimado aqui.
import type { EmpresaDados } from "../types";
import type { BalancoResumido, DreResumida, Indice, PontoSerie } from "./demonstracoesAvancadas";
import { ehRegimeEntidade } from "./planoEntidade";

export const escaparHtml = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const moeda = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = (c: number) => { const v = c / 100; const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi` : a >= 1e3 ? `${(v / 1e3).toFixed(0)} mil` : v.toFixed(0); };
const mesCurto = (c: string) => `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(c.slice(5)) - 1]}/${c.slice(2, 4)}`;
export const valorIndice = (i: Indice) => (i.valor === null ? "—" : i.formato === "percentual" ? `${(i.valor * 100).toFixed(1).replace(".", ",")}%` : i.valor.toFixed(2).replace(".", ","));

/** Barras (receita líquida) com a linha do resultado por cima. Cores fixas legíveis no claro e na impressão. */
/** `entidade`: entidade sem finalidade de lucros — "lucro ou prejuízo" vira "superávit ou déficit" (ITG 2002 (R1), item 23). */
export function svgEvolucao(serie: PontoSerie[], largura = 640, altura = 240, entidade = false): string {
  const m = { e: 56, d: 12, t: 16, b: 34 };
  const w = largura - m.e - m.d, h = altura - m.t - m.b;
  const valores = serie.flatMap((p) => [p.receitaLiquida, p.lucroLiquido]);
  const max = Math.max(1, ...valores), min = Math.min(0, ...valores);
  const y = (v: number) => m.t + h - ((v - min) / (max - min)) * h;
  const passo = w / Math.max(1, serie.length);
  const barras = serie.map((p, i) => {
    const x = m.e + i * passo + passo * 0.18, bw = passo * 0.64;
    const y0 = y(0), y1 = y(p.receitaLiquida);
    return `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(y1 - y0).toFixed(1)}" fill="#3b6fb6" rx="2"><title>${mesCurto(p.competencia)}: receita ${moeda(p.receitaLiquida)}</title></rect>`;
  }).join("");
  const pontos = serie.map((p, i) => `${(m.e + i * passo + passo / 2).toFixed(1)},${y(p.lucroLiquido).toFixed(1)}`);
  const linha = `<polyline points="${pontos.join(" ")}" fill="none" stroke="#c2410c" stroke-width="2.5"/>` + serie.map((p, i) => `<circle cx="${(m.e + i * passo + passo / 2).toFixed(1)}" cy="${y(p.lucroLiquido).toFixed(1)}" r="3.5" fill="#c2410c"><title>${mesCurto(p.competencia)}: resultado ${moeda(p.lucroLiquido)}</title></circle>`).join("");
  const grades = [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = min + (max - min) * f; return `<line x1="${m.e}" x2="${m.e + w}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e2e8f0"/><text x="${m.e - 6}" y="${(y(v) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="#475569">${moedaCurta(v)}</text>`; }).join("");
  const eixoX = serie.map((p, i) => `<text x="${(m.e + i * passo + passo / 2).toFixed(1)}" y="${altura - 14}" font-size="10" text-anchor="middle" fill="#475569">${mesCurto(p.competencia)}</text>`).join("");
  const zero = `<line x1="${m.e}" x2="${m.e + w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#94a3b8"/>`;
  const legenda = `<rect x="${m.e}" y="${altura - 9}" width="10" height="8" fill="#3b6fb6"/><text x="${m.e + 14}" y="${altura - 2}" font-size="10" fill="#334155">Receita líquida</text><line x1="${m.e + 110}" x2="${m.e + 128}" y1="${altura - 5}" y2="${altura - 5}" stroke="#c2410c" stroke-width="2.5"/><text x="${m.e + 132}" y="${altura - 2}" font-size="10" fill="#334155">Resultado (${entidade ? "superávit ou déficit" : "lucro ou prejuízo"})</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="100%" role="img" aria-label="Receita líquida e resultado dos últimos 12 meses">${grades}${zero}${barras}${linha}${eixoX}${legenda}</svg>`;
}

export function htmlRelatorioCliente(entrada: { empresa: EmpresaDados; competencia: string; balanco: BalancoResumido; dre: DreResumida; indices: Indice[]; serie: PontoSerie[]; escritorio?: string; observacao?: string }): string {
  const { empresa, competencia, balanco: b, dre: d, indices, serie } = entrada;
  // Entidade sem finalidade de lucros: "lucro ou prejuízo" vira "superávit ou déficit" (ITG 2002 (R1), item 23 — Resolução CFC 1.409/2012).
  const ent = ehRegimeEntidade(empresa.regime);
  const mes = `${competencia.slice(5)}/${competencia.slice(0, 4)}`;
  const l = (r: string, v: number, forte = false) => `<tr${forte ? ' class="forte"' : ""}><td>${escaparHtml(r)}</td><td class="v">${moeda(v)}</td></tr>`;
  const cards = indices.map((i) => `<div class="card"><div class="ind">${escaparHtml(i.nome)}</div><div class="val">${valorIndice(i)}</div><div class="exp">${escaparHtml(i.explicacao)}</div><div class="lei">${escaparHtml(i.leitura)}</div><div class="for">${escaparHtml(i.formula)}</div></div>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório contábil ${escaparHtml(empresa.razaoSocial)} ${mes}</title>
<style>body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;max-width:860px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 8px;color:#0f2b5b;border-bottom:2px solid #0f2b5b;padding-bottom:3px}.sub{color:#475569;margin-top:2px}table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #e2e8f0}.v{text-align:right;white-space:nowrap}.forte td{font-weight:bold;background:#f1f5f9}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{border:1px solid #cbd5e1;border-radius:10px;padding:10px}.ind{font-weight:bold}.val{font-size:22px;font-weight:bold;color:#0f2b5b}.exp{font-size:11px;color:#334155}.lei{font-size:11px;margin-top:4px}.for{font-size:10px;color:#64748b;margin-top:4px}.nota{font-size:10.5px;color:#475569;margin-top:18px}@media(max-width:640px){.grid,.cards{grid-template-columns:1fr}}@media print{body{margin:12mm}.quebra{page-break-before:always}}</style></head><body>
<h1>${escaparHtml(empresa.razaoSocial || "Empresa")}</h1><div class="sub">CNPJ ${escaparHtml(empresa.cnpj)} · Relatório contábil de ${mes}${entrada.escritorio ? ` · ${escaparHtml(entrada.escritorio)}` : ""}</div>
<h2>${ent ? "Demonstração do Superávit ou Déficit" : "Resultado do ano"} (janeiro a ${mes})</h2><table>
${l("Receita bruta", d.receitaBruta)}${l("(−) Deduções da receita", -d.deducoes)}${l("Receita líquida", d.receitaLiquida, true)}${l("(−) Custos", -d.custos)}${l(ent ? "Resultado bruto" : "Lucro bruto", d.lucroBruto, true)}${l("(−) Despesas operacionais", -d.despesas)}${d.depreciacao ? l("(−) Depreciação e amortização", -d.depreciacao) : ""}${l("Resultado financeiro", d.resultadoFinanceiro)}${d.outrasReceitas ? l("Outras receitas", d.outrasReceitas) : ""}${l("Resultado antes do IR e CSLL", d.resultadoAntesTributos, true)}${d.tributosLucro ? l("(−) IRPJ e CSLL", -d.tributosLucro) : ""}${l(ent ? (d.lucroLiquido >= 0 ? "Superávit do período" : "Déficit do período") : d.lucroLiquido >= 0 ? "Lucro líquido" : "Prejuízo", d.lucroLiquido, true)}
</table>
<h2>Evolução dos últimos 12 meses</h2>${svgEvolucao(serie, 640, 240, ent)}
<h2>Situação patrimonial em ${mes}</h2><div class="grid"><table>${l("Ativo circulante", b.ativoCirculante)}${l("  Caixa e bancos", b.disponivel)}${l("  Estoques", b.estoques)}${l("Ativo não circulante", b.ativoNaoCirculante)}${l("Total do ativo", b.ativoTotal, true)}</table><table>${l("Passivo circulante", b.passivoCirculante)}${l("Passivo não circulante", b.passivoNaoCirculante)}${l("Patrimônio líquido", b.patrimonioLiquido)}${l("Total do passivo + PL", b.passivoMaisPl, true)}</table></div>
<h2 class="quebra">Indicadores</h2><div class="cards">${cards}</div>
${entrada.observacao ? `<h2>Observações do contador</h2><p>${escaparHtml(entrada.observacao).replace(/\n/g, "<br>")}</p>` : ""}
<p class="nota">Relatório gerencial elaborado a partir da escrituração contábil (lançamentos aprovados) até ${mes}. Não substitui as demonstrações contábeis do encerramento do exercício. Os indicadores são fórmulas usuais de análise e a leitura de cada um é uma orientação geral. Gerado pelo Murad Contábil em ${new Date().toLocaleString("pt-BR")}.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}
