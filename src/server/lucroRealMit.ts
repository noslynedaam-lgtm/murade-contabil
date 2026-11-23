// MIT da DCTFWeb (lado do Contábil): o Fiscal monta o arquivo de importação do MIT e pede aqui o IRPJ/CSLL do Lucro Real do mês.
// Só sai o que está CONFIRMADO na Apuração do Lucro Real (o mesmo valor do DARF, já com as deduções). Somente leitura.
//  - Estimativa mensal: o período do mês é "A<MM>" e informa se o mês usou balancete de suspensão/redução (modo "B"), que o leiaute
//    do MIT pede no campo BalancoLucroReal (Lucro Real anual).
//  - Trimestral: só no último mês do trimestre ("T0<n>"), que é quando o débito trimestral entra no MIT.
//  - De janeiro a março também devolve o ajuste anual do ano anterior (o Fiscal só mostra; o leiaute deixa declarar em jan, fev ou mar).
import { lerConfigLucroReal, listarApuracoesReal, listarPagamentosReal, type Consultar } from "./lucroRealApuracao";

export interface LucroRealParaMit {
  configurado: boolean; forma: "trimestral" | "estimativa" | null; obrigada: boolean | null; periodoEsperado: string | null;
  periodo: { id: string; status: string; irpjCentavos: number; csllCentavos: number; modo: "E" | "B" | null } | null;
  ajusteAnualAnterior: { ano: number; status: string; irpjCentavos: number; csllCentavos: number } | null;
  pagamentos: Array<{ periodo: string; tributo: "irpj" | "csll"; principalCentavos: number; valorPagoCentavos: number; dataPagamento: string }>;
}

export async function lucroRealParaMit(consultar: Consultar, cnpj: string, competencia: string): Promise<LucroRealParaMit> {
  const ano = Number(competencia.slice(0, 4)); const mes = Number(competencia.slice(5, 7));
  const cfg = await lerConfigLucroReal(consultar, cnpj);
  const vazio: LucroRealParaMit = { configurado: false, forma: null, obrigada: null, periodoEsperado: null, periodo: null, ajusteAnualAnterior: null, pagamentos: [] };
  if (!cfg) return vazio;
  const periodoEsperado = cfg.forma === "estimativa" ? `A${String(mes).padStart(2, "0")}` : mes % 3 === 0 ? `T0${mes / 3}` : null;
  const lista = await listarApuracoesReal(consultar, cnpj, ano);
  const l = periodoEsperado ? lista.find((a) => a.periodo === periodoEsperado) : undefined;
  let ajusteAnualAnterior: LucroRealParaMit["ajusteAnualAnterior"] = null;
  if (mes <= 3) {
    const anual = (await listarApuracoesReal(consultar, cnpj, ano - 1)).find((a) => a.periodo === "ANUAL");
    if (anual) ajusteAnualAnterior = { ano: ano - 1, status: anual.status, irpjCentavos: Math.max(0, anual.irpjCentavos), csllCentavos: Math.max(0, anual.csllCentavos) };
  }
  const pagamentos = periodoEsperado ? (await listarPagamentosReal(consultar, cnpj, ano)).filter((p) => p.periodo === periodoEsperado)
    .map((p) => ({ periodo: p.periodo, tributo: p.tributo, principalCentavos: p.principalCentavos, valorPagoCentavos: p.valorPagoCentavos, dataPagamento: p.dataPagamento })) : [];
  const modo = l?.resultado?.modo === "B" ? "B" : l?.resultado?.modo === "E" ? "E" : null;
  return {
    configurado: true, forma: cfg.forma, obrigada: cfg.obrigada, periodoEsperado,
    periodo: l ? { id: l.periodo, status: l.status, irpjCentavos: Math.max(0, l.irpjCentavos), csllCentavos: Math.max(0, l.csllCentavos), modo } : null,
    ajusteAnualAnterior, pagamentos,
  };
}
