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
  /** Quotas de depreciação ajustadas manualmente (competência AAAA-MM → centavos). O cálculo automático não as sobrescreve. */
  ajustesQuota?: Record<string, number>;
  /** Dados de controle do bem (opcionais). */
  codigo?: string;
  fornecedor?: string;
  notaFiscal?: string;
  numeroSerie?: string;
  dataCompra?: string; // AAAA-MM-DD
  contaBemCodigo?: string;
  contaDepreciacaoCodigo?: string;
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
  if (b.ajustesQuota) {
    for (const [c, v] of Object.entries(b.ajustesQuota)) {
      if (!MES.test(c) || !Number.isSafeInteger(v) || v < 0) { erros.push("Ajuste manual de quota inválido."); break; }
    }
  }
  return erros;
}

const temAjustes = (b: BemImobilizado) => !!b.ajustesQuota && Object.keys(b.ajustesQuota).length > 0;

// Quota automática (fórmula linear), ignorando qualquer ajuste manual.
export function quotaAutomatica(b: BemImobilizado, competencia: string): number {
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

// Percurso mês a mês quando há ajuste manual: o ajuste vale no mês dele, nunca deixa a acumulada passar de custo − residual
// e a última quota da vida útil fecha o que sobrar (assim o bem termina totalmente depreciado).
function percorrer(b: BemImobilizado, ate: string): { quota: number; total: number } {
  const ini = idx(b.inicioDepreciacao), n = b.vidaUtilMeses, base = b.custoCentavos - b.residualCentavos;
  const mensal = Math.floor(base / n), alvo = idx(ate);
  const fim = Math.min(alvo, ini + n - 1, b.baixa ? idx(b.baixa.competencia) - 1 : alvo);
  let total = 0, quota = 0;
  for (let i = ini; i <= fim; i++) {
    const aj = b.ajustesQuota?.[deIdx(i)];
    const desejada = aj !== undefined ? aj : i === ini + n - 1 ? base - total : mensal;
    quota = Math.max(0, Math.min(desejada, base - total));
    total += quota;
  }
  return { quota: fim === alvo ? quota : 0, total };
}

export function quotaDoMes(b: BemImobilizado, competencia: string): number {
  if (!temAjustes(b)) return quotaAutomatica(b, competencia);
  if (!b.depreciavel || validarBem(b).length || !MES.test(competencia)) return 0;
  if (idx(competencia) < idx(b.inicioDepreciacao)) return 0;
  return percorrer(b, competencia).quota;
}

export function depreciacaoAcumulada(b: BemImobilizado, ate: string): number {
  if (!b.depreciavel || validarBem(b).length || !MES.test(ate)) return 0;
  if (temAjustes(b)) return idx(ate) < idx(b.inicioDepreciacao) ? 0 : percorrer(b, ate).total;
  let total = 0;
  const fim = Math.min(idx(ate), b.baixa ? idx(b.baixa.competencia) - 1 : idx(ate));
  for (let i = idx(b.inicioDepreciacao); i <= fim; i++) total += quotaAutomatica(b, deIdx(i));
  return total;
}

export const quotaFoiAjustada = (b: BemImobilizado, competencia: string) => b.ajustesQuota?.[competencia] !== undefined;

// Define a quota de um mês à mão (centavos). Recusa o que passaria do valor depreciável ou cai fora da vida útil.
export function definirAjusteQuota(b: BemImobilizado, competencia: string, centavos: number): { bem?: BemImobilizado; erro?: string } {
  if (!b.depreciavel) return { erro: "Terreno não deprecia." };
  if (!MES.test(competencia)) return { erro: "Competência inválida." };
  if (!Number.isSafeInteger(centavos) || centavos < 0) return { erro: "Informe um valor de quota válido (zero ou mais)." };
  const ini = idx(b.inicioDepreciacao), i = idx(competencia);
  if (i < ini || i > ini + b.vidaUtilMeses - 1) return { erro: "Este mês está fora da vida útil do bem." };
  if (b.baixa && i >= idx(b.baixa.competencia)) return { erro: "O bem já estava baixado neste mês." };
  const base = b.custoCentavos - b.residualCentavos;
  const antes = i === ini ? 0 : percorrer({ ...b, ajustesQuota: b.ajustesQuota }, deIdx(i - 1)).total;
  if (antes + centavos > base) return { erro: `A quota passa do valor depreciável: restam ${(base - antes) / 100} reais a depreciar até este mês.` };
  const novo = { ...b, ajustesQuota: { ...(b.ajustesQuota || {}), [competencia]: centavos } };
  const erros = validarBem(novo);
  return erros.length ? { erro: erros[0] } : { bem: novo };
}

export function removerAjusteQuota(b: BemImobilizado, competencia: string): BemImobilizado {
  if (!b.ajustesQuota || b.ajustesQuota[competencia] === undefined) return b;
  const { [competencia]: _descartado, ...resto } = b.ajustesQuota;
  const { ajustesQuota: _antigo, ...semAjustes } = b;
  return Object.keys(resto).length ? { ...semAjustes, ajustesQuota: resto } : semAjustes;
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
