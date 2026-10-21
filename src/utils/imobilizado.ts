// Ativo imobilizado: depreciação linear mensal em centavos.
// Regras (Receita Federal, Perguntas e Respostas ECF, cap. VIII; IN RFB 1.700/2017, art. 124; Lei 4.506/1964, art. 57):
// - a depreciação só começa no mês em que o bem é instalado/posto em condições de produzir;
// - a depreciação acumulada não pode passar do custo de aquisição;
// - terrenos nunca são depreciados.
// A vida útil/taxa é informada pelo usuário (as taxas fiscais por bem estão no Anexo III da IN RFB 1.700/2017).
export type BemImobilizado = {
  id: string;
  descricao: string;
  filial?: string;
  custoCentavos: number;
  residualCentavos: number;
  vidaUtilMeses: number;
  inicioDepreciacao: string; // YYYY-MM (mês em que entrou em uso)
  depreciavel: boolean; // false para terreno
  baixa?: { competencia: string; valorVendaCentavos: number; motivo: "venda" | "baixa" };
  transferencias?: Array<{ competencia: string; de?: string; para: string }>;
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const idx = (p: string) => { const [a, m] = p.split("-").map(Number); return a * 12 + (m - 1); };
const deIdx = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

export function validarBem(b: BemImobilizado): string[] {
  const erros: string[] = [];
  if (!b.descricao?.trim()) erros.push("Informe a descrição do bem.");
  if (!Number.isSafeInteger(b.custoCentavos) || b.custoCentavos <= 0) erros.push("O custo deve ser maior que zero.");
  if (!Number.isSafeInteger(b.residualCentavos) || b.residualCentavos < 0 || b.residualCentavos >= b.custoCentavos) erros.push("O valor residual deve ser menor que o custo.");
  if (b.depreciavel && (!Number.isInteger(b.vidaUtilMeses) || b.vidaUtilMeses < 1)) erros.push("Informe a vida útil em meses (mínimo 1).");
  if (!MES.test(b.inicioDepreciacao)) erros.push("Informe o mês em que o bem entrou em uso (AAAA-MM).");
  if (b.baixa && !MES.test(b.baixa.competencia)) erros.push("Competência da baixa inválida.");
  if (b.baixa && MES.test(b.inicioDepreciacao) && MES.test(b.baixa.competencia) && idx(b.baixa.competencia) < idx(b.inicioDepreciacao)) erros.push("A baixa não pode ser anterior ao início de uso.");
  return erros;
}

// Quota do mês (centavos). Mês da baixa: o bem é depreciado até o mês anterior à baixa.
export function quotaDoMes(b: BemImobilizado, competencia: string): number {
  if (!b.depreciavel || validarBem(b).length || !MES.test(competencia)) return 0;
  const i = idx(competencia), ini = idx(b.inicioDepreciacao);
  if (i < ini) return 0;
  if (b.baixa && i >= idx(b.baixa.competencia)) return 0;
  const base = b.custoCentavos - b.residualCentavos;
  const n = b.vidaUtilMeses;
  const mensal = Math.floor(base / n);
  const k = i - ini; // 0-based
  if (k >= n) return 0;
  return k === n - 1 ? base - mensal * (n - 1) : mensal; // última quota fecha a diferença de arredondamento
}

export function depreciacaoAcumulada(b: BemImobilizado, ate: string): number {
  if (!b.depreciavel || validarBem(b).length || !MES.test(ate)) return 0;
  let total = 0;
  const fim = Math.min(idx(ate), b.baixa ? idx(b.baixa.competencia) - 1 : idx(ate));
  for (let i = idx(b.inicioDepreciacao); i <= fim; i++) total += quotaDoMes(b, deIdx(i));
  return total;
}

export function valorContabilLiquido(b: BemImobilizado, ate: string): number {
  return b.custoCentavos - depreciacaoAcumulada(b, ate);
}

// Ganho (+) ou perda (−) na baixa: valor de venda − valor contábil líquido na data da baixa.
export function resultadoDaBaixa(b: BemImobilizado): number | null {
  if (!b.baixa || validarBem(b).length) return null;
  const vcl = b.custoCentavos - depreciacaoAcumulada(b, deIdx(idx(b.baixa.competencia) - 1));
  return (b.baixa.motivo === "venda" ? b.baixa.valorVendaCentavos : 0) - vcl;
}

export function filialAtual(b: BemImobilizado, ate: string): string | undefined {
  const ts = (b.transferencias ?? []).filter((t) => MES.test(t.competencia) && t.competencia <= ate).sort((x, y) => x.competencia.localeCompare(y.competencia));
  return ts.length ? ts[ts.length - 1].para : b.filial;
}

export function totalQuotasDoMes(bens: BemImobilizado[], competencia: string) {
  const itens = bens.map((b) => ({ bem: b, quota: quotaDoMes(b, competencia) })).filter((x) => x.quota > 0);
  return { itens, total: itens.reduce((t, x) => t + x.quota, 0) };
}
