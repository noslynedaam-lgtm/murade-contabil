// Comparação de regimes (estimativa) e recolhimento a maior, por empresa, nos últimos 12 meses completos.
// - Regime atual: o que foi APURADO e o que foi PAGO, pelas apurações e pagamentos que o Fiscal (e a Apuração do Lucro Real) já mandaram.
// - Lucro Presumido e Lucro Real: ESTIMATIVA com os números da contabilidade (receita bruta e resultado do Contábil) e a folha do DP.
// - Simples Nacional: a simulação com as tabelas da LC 123/2006 já existe no Murad Fiscal (Tabela Tributária e Calculadora › Comparativo);
//   aqui ela NÃO é refeita (para não haver duas tabelas do Simples): a tela leva os números e abre a simulação do Fiscal. Se a empresa já é
//   do Simples, o valor do Simples é o DAS realmente apurado e pago.
// - Recolhimento a maior: DAS com principal pago acima do apurado no mesmo período e DARF pago mais de uma vez; o que pode ser multa e
//   juros fica "a conferir" (não entra no total). Orientação de restituição/compensação com a base legal.
// Tudo em centavos (inteiros), com arredondamento só no valor de cada tributo do período. É estimativa: não é apuração nem parecer.

export type AtividadeComparacao = "comercio" | "industria" | "combustiveis" | "transporte_carga" | "servicos_hospitalares" | "transporte_passageiros" | "servicos";
/** Percentuais de presunção em centésimos de ponto (Lei 9.249/1995, art. 15, caput e § 1º, e art. 20). */
export const PRESUNCAO_COMPARACAO: Record<AtividadeComparacao, { irpjBp: number; csllBp: number; rotulo: string }> = {
  comercio: { irpjBp: 800, csllBp: 1200, rotulo: "Comércio (IRPJ 8% / CSLL 12%)" },
  industria: { irpjBp: 800, csllBp: 1200, rotulo: "Indústria (IRPJ 8% / CSLL 12%)" },
  combustiveis: { irpjBp: 160, csllBp: 1200, rotulo: "Revenda de combustível (IRPJ 1,6% / CSLL 12%)" },
  transporte_carga: { irpjBp: 800, csllBp: 1200, rotulo: "Transporte de cargas (IRPJ 8% / CSLL 12%)" },
  servicos_hospitalares: { irpjBp: 800, csllBp: 1200, rotulo: "Serviços hospitalares (IRPJ 8% / CSLL 12%)" },
  transporte_passageiros: { irpjBp: 1600, csllBp: 1200, rotulo: "Transporte de passageiros (IRPJ 16% / CSLL 12%)" },
  servicos: { irpjBp: 3200, csllBp: 3200, rotulo: "Serviços em geral (IRPJ 32% / CSLL 32%)" },
};
export const LIMITE_SIMPLES_CENTAVOS = 480_000_000; // R$ 4.800.000,00 (LC 123/2006, art. 3º, II)
export const LIMITE_PRESUMIDO_CENTAVOS = 7_800_000_000; // R$ 78.000.000,00 (Lei 9.718/1998, art. 13)
const ADICIONAL_LIMITE_MES = 2_000_000; // R$ 20.000,00 por mês do período (Lei 9.249/1995, art. 3º, § 1º)

export interface MesComparacao { competencia: string; receitaBrutaCentavos: number; resultadoCentavos: number; irpjCentavos: number; csllCentavos: number }
export interface ApuracaoComparacao { tributo: string; competencia: string; referencia: string; valorCentavos: number; baseCentavos: number | null; versaoOrigem: string }
export interface EntradaComparacao {
  hoje: string; regimeAtual: string; meses: MesComparacao[]; folhaCentavos: number | null; atividade: AtividadeComparacao | null; apuracoes: ApuracaoComparacao[];
}
export interface LinhaValor { nome: string; centavos: number; base?: string }
export interface EstimativaRegime { regime: "Simples Nacional" | "Lucro Presumido" | "Lucro Real"; podeOptar: boolean; motivo?: string; totalCentavos: number | null; linhas: LinhaValor[]; observacoes: string[]; atual: boolean }
export interface PagoAMaior { tipo: "DAS" | "DARF"; periodo: string; tributo: string; apuradoCentavos: number | null; pagoCentavos: number; aMaiorCentavos: number; aConferir: boolean; motivo: string; pagoEm: string[]; foraDoPrazo: boolean; orientacao: string }
export interface ResultadoComparacao {
  periodo: { de: string; ate: string; competencias: string[] };
  receita12Centavos: number; folha12Centavos: number | null; resultado12Centavos: number;
  regimeAtual: string;
  atualApuradoPago: Array<{ tributo: string; apuradoCentavos: number; pagoCentavos: number }>;
  estimativas: EstimativaRegime[];
  pagoAMaior: PagoAMaior[]; totalAMaiorCentavos: number;
  avisos: string[]; baseLegal: string[];
}

const round = (n: number) => Math.round(n);
const pct = (c: number, bp: number) => round((c * bp) / 10_000);
const somar = (l: number[]) => l.reduce((s, x) => s + x, 0);
const add = (comp: string, n: number) => { const [a, m] = comp.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export const reaisTexto = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** As 12 competências completas antes do mês de hoje. */
export function janela12Meses(hoje: string): string[] { const atual = hoje.slice(0, 7); return Array.from({ length: 12 }, (_, i) => add(atual, i - 12)); }

export function regimeNormalizado(r: string): "Simples Nacional" | "Lucro Presumido" | "Lucro Real" | "MEI" | "outro" {
  const s = String(r || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/^\s*mei\b|microempreendedor/.test(s)) return "MEI";
  if (/simples/.test(s)) return "Simples Nacional";
  if (/presumido/.test(s)) return "Lucro Presumido";
  if (/lucro\s+real/.test(s)) return "Lucro Real";
  return "outro";
}

const ROTULO_TRIBUTO: Record<string, string> = {
  DAS_SIMPLES: "DAS do Simples Nacional", IRPJ_PRESUMIDO: "IRPJ (Presumido)", CSLL_PRESUMIDO: "CSLL (Presumido)", PIS_PRESUMIDO: "PIS (cumulativo)", COFINS_PRESUMIDO: "COFINS (cumulativa)",
  IRPJ_REAL: "IRPJ (Lucro Real)", CSLL_REAL: "CSLL (Lucro Real)", PIS_NAO_CUMULATIVO: "PIS não cumulativo (débito)", COFINS_NAO_CUMULATIVA: "COFINS não cumulativa (débito)",
  PIS_NC_CREDITO: "PIS não cumulativo (créditos)", COFINS_NC_CREDITO: "COFINS não cumulativa (créditos)",
};
const PAGO_PARA_APURADO: Record<string, string> = {
  DAS_SIMPLES_PAGO: "DAS_SIMPLES", IRPJ_PRESUMIDO_PAGO: "IRPJ_PRESUMIDO", CSLL_PRESUMIDO_PAGO: "CSLL_PRESUMIDO", PIS_PRESUMIDO_PAGO: "PIS_PRESUMIDO", COFINS_PRESUMIDO_PAGO: "COFINS_PRESUMIDO",
  IRPJ_REAL_PAGO: "IRPJ_REAL", CSLL_REAL_PAGO: "CSLL_REAL", PIS_NC_PAGO: "PIS_NAO_CUMULATIVO", COFINS_NC_PAGO: "COFINS_NAO_CUMULATIVA",
};
const dataPago = (a: ApuracaoComparacao) => /^pago:(\d{4}-\d{2}-\d{2}):/.exec(a.versaoOrigem || "")?.[1] ?? `${a.competencia}-01`;
const cincoAnosAntes = (hoje: string) => `${Number(hoje.slice(0, 4)) - 5}${hoje.slice(4)}`;

export const ORIENTACAO_DAS = "DAS pago a maior: peça a restituição no serviço \"Minhas Restituições de DAS\" (gov.br, conta Prata ou Ouro) com o comprovante; a parte do ICMS e do ISS é pedida ao Estado ou ao Município. Base: IN RFB nº 2.055/2021; prazo de 5 anos contados do pagamento (CTN, art. 168, I).";
export const ORIENTACAO_DARF = "DARF pago a maior ou em duplicidade: confira se o DARF não está vinculado a outro débito declarado (DCTFWeb/DCTF) e retifique a declaração se for o caso; depois faça o pedido de restituição ou a declaração de compensação no PER/DCOMP Web (e-CAC). Base: IN RFB nº 2.055/2021; prazo de 5 anos contados do pagamento (CTN, art. 168, I).";

/** Recolhimento a maior identificado com o que já está no Contábil (apurações e pagamentos recebidos). */
export function pagoAMaior(apuracoes: ApuracaoComparacao[], hoje: string): PagoAMaior[] {
  const saida: PagoAMaior[] = [];
  const limite = cincoAnosAntes(hoje);
  // DAS: principal pago (baseCentavos; sem ele, o valor pago) somado por período de apuração × DAS apurado do mesmo período.
  const pagosDas = new Map<string, ApuracaoComparacao[]>();
  for (const a of apuracoes) {
    const pa = /^DAS:pagamento:(\d{4}-\d{2})$/.exec(a.referencia)?.[1];
    if (a.tributo === "DAS_SIMPLES_PAGO" && pa) pagosDas.set(pa, [...(pagosDas.get(pa) || []), a]);
  }
  for (const [pa, pagos] of pagosDas) {
    const apurado = apuracoes.find((x) => x.tributo === "DAS_SIMPLES" && x.competencia === pa);
    if (!apurado) continue;
    const principal = somar(pagos.map((p) => p.baseCentavos ?? p.valorCentavos));
    const datas = pagos.map(dataPago).sort();
    if (principal > apurado.valorCentavos) {
      const exato = !pagos.some((p) => p.baseCentavos === null);
      saida.push({ tipo: "DAS", periodo: pa, tributo: "DAS do Simples Nacional", apuradoCentavos: apurado.valorCentavos, pagoCentavos: principal, aMaiorCentavos: principal - apurado.valorCentavos,
        aConferir: !exato, motivo: pagos.length > 1 ? `${pagos.length} pagamentos para o mesmo período (${pa.split("-").reverse().join("/")}).` : exato ? "O principal pago é maior que o DAS apurado do período." : "O valor pago passa do DAS apurado e o Fiscal não informou o principal: a diferença pode ser multa e juros.",
        pagoEm: datas, foraDoPrazo: datas[0] < limite, orientacao: ORIENTACAO_DAS });
    }
  }
  // DARF: a mesma guia paga mais de uma vez (tudo depois do primeiro pagamento é a maior); valor acima da guia fica "a conferir".
  const pagosDarf = new Map<string, ApuracaoComparacao[]>();
  for (const a of apuracoes) if (/^DARF:pagamento:/.test(a.referencia)) pagosDarf.set(`${a.tributo}|${a.referencia}`, [...(pagosDarf.get(`${a.tributo}|${a.referencia}`) || []), a]);
  for (const [, pagos] of pagosDarf) {
    const ord = [...pagos].sort((x, y) => dataPago(x).localeCompare(dataPago(y)));
    const periodo = ord[0].referencia.split(":").slice(3).join(":");
    const nome = ROTULO_TRIBUTO[PAGO_PARA_APURADO[ord[0].tributo]] || ord[0].tributo;
    const datas = ord.map(dataPago);
    if (ord.length > 1) {
      const total = somar(ord.map((p) => p.valorCentavos));
      saida.push({ tipo: "DARF", periodo, tributo: nome, apuradoCentavos: ord[0].baseCentavos, pagoCentavos: total, aMaiorCentavos: total - ord[0].valorCentavos, aConferir: false,
        motivo: `A mesma guia foi registrada como paga ${ord.length} vezes; tudo depois do primeiro pagamento é a maior.`, pagoEm: datas, foraDoPrazo: datas[1] < limite, orientacao: ORIENTACAO_DARF });
    } else if (ord[0].baseCentavos !== null && ord[0].valorCentavos > ord[0].baseCentavos) {
      saida.push({ tipo: "DARF", periodo, tributo: nome, apuradoCentavos: ord[0].baseCentavos, pagoCentavos: ord[0].valorCentavos, aMaiorCentavos: ord[0].valorCentavos - ord[0].baseCentavos, aConferir: true,
        motivo: "Pago acima do valor da guia. O Fiscal registrou a diferença como multa e juros; se o pagamento foi no prazo, a diferença é recolhimento a maior.", pagoEm: datas, foraDoPrazo: datas[0] < limite, orientacao: ORIENTACAO_DARF });
    }
  }
  return saida.sort((a, b) => b.periodo.localeCompare(a.periodo));
}

export const BASE_LEGAL_COMPARACAO = [
  "Simples Nacional: LC 123/2006 (limite de R$ 4,8 milhões, art. 3º, II; Anexos I a V) — simulação no Murad Fiscal (Tabela Tributária).",
  "Lucro Presumido: Lei 9.249/1995, arts. 15 e 20 (presunção) e art. 3º, § 1º (adicional de 10% acima de R$ 20.000 por mês); Lei 9.430/1996, arts. 1º e 25 (apuração trimestral); CSLL 9% (Lei 7.689/1988, art. 3º, III); PIS 0,65% e COFINS 3% cumulativos (Lei 9.715/1998, art. 8º, I; Lei 9.718/1998, art. 8º); limite de R$ 78 milhões (Lei 9.718/1998, art. 13).",
  "Lucro Real: IRPJ 15% + adicional de 10% (Lei 9.249/1995, art. 3º); CSLL 9%; PIS 1,65% e COFINS 7,6% não cumulativos (Lei 10.637/2002, art. 2º; Lei 10.833/2003, art. 2º).",
  "Contribuição patronal (CPP) de 20% sobre salários e pró-labore fora do Simples (Lei 8.212/1991, art. 22, I e III).",
  "Restituição e compensação: IN RFB nº 2.055/2021; prazo de 5 anos (CTN, art. 168, I).",
];

export function compararRegimes(e: EntradaComparacao): ResultadoComparacao {
  const comps = janela12Meses(e.hoje);
  const na = (c: string) => comps.includes(c);
  const meses = comps.map((c) => e.meses.find((m) => m.competencia === c) ?? { competencia: c, receitaBrutaCentavos: 0, resultadoCentavos: 0, irpjCentavos: 0, csllCentavos: 0 });
  const receita = somar(meses.map((m) => m.receitaBrutaCentavos));
  const resultado = somar(meses.map((m) => m.resultadoCentavos));
  const atual = regimeNormalizado(e.regimeAtual);
  const avisos: string[] = [];
  if (meses.some((m) => m.receitaBrutaCentavos === 0)) avisos.push(`Há mês sem receita bruta na contabilidade (${meses.filter((m) => m.receitaBrutaCentavos === 0).map((m) => m.competencia.split("-").reverse().join("/")).join(", ")}): confira se os lançamentos do mês já estão no Contábil.`);
  if (e.folhaCentavos === null) avisos.push("Sem a folha do DP nos 12 meses: a contribuição patronal (CPP) não entrou nas estimativas do Presumido e do Real.");

  // Regime atual: apurado e pago no período (pagamento pelo mês em que foi pago; apuração pelo período).
  const porTributo = new Map<string, { apuradoCentavos: number; pagoCentavos: number }>();
  for (const a of e.apuracoes) {
    if (ROTULO_TRIBUTO[a.tributo] && na(a.competencia)) { const x = porTributo.get(a.tributo) || { apuradoCentavos: 0, pagoCentavos: 0 }; x.apuradoCentavos += a.valorCentavos; porTributo.set(a.tributo, x); }
    const ap = PAGO_PARA_APURADO[a.tributo];
    if (ap && na(a.competencia)) { const x = porTributo.get(ap) || { apuradoCentavos: 0, pagoCentavos: 0 }; x.pagoCentavos += a.baseCentavos ?? a.valorCentavos; porTributo.set(ap, x); }
  }
  const atualApuradoPago = [...porTributo.entries()].map(([t, v]) => ({ tributo: ROTULO_TRIBUTO[t] || t, ...v }));
  const creditoPis = porTributo.get("PIS_NC_CREDITO")?.apuradoCentavos ?? 0;
  const creditoCofins = porTributo.get("COFINS_NC_CREDITO")?.apuradoCentavos ?? 0;
  const liquidoAtual = somar([...porTributo.entries()].map(([t, v]) => (/_CREDITO$/.test(t) ? -v.apuradoCentavos : v.apuradoCentavos)));
  const cpp = e.folhaCentavos === null ? null : pct(e.folhaCentavos, 2000);

  // Simples: só o regime atual (a simulação para quem não é do Simples fica no Fiscal).
  const simples: EstimativaRegime = atual === "Simples Nacional" || atual === "MEI"
    ? { regime: "Simples Nacional", atual: true, podeOptar: true, totalCentavos: porTributo.get("DAS_SIMPLES")?.apuradoCentavos ?? null, linhas: porTributo.get("DAS_SIMPLES") ? [{ nome: "DAS apurado nos 12 meses (inclui a CPP, menos no Anexo IV)", centavos: porTributo.get("DAS_SIMPLES")!.apuradoCentavos, base: "Apurações do Fiscal" }] : [], observacoes: porTributo.get("DAS_SIMPLES") ? [] : ["O Fiscal ainda não mandou o DAS apurado destes meses."] }
    : { regime: "Simples Nacional", atual: false, podeOptar: receita <= LIMITE_SIMPLES_CENTAVOS, motivo: receita > LIMITE_SIMPLES_CENTAVOS ? "Receita dos 12 meses acima de R$ 4,8 milhões (LC 123/2006, art. 3º, II)." : undefined, totalCentavos: null, linhas: [],
      observacoes: ["A simulação do Simples (anexo, faixa, Fator R e vedações por atividade) é feita no Murad Fiscal — Tabela Tributária —, com a receita e a folha abaixo. Não é refeita aqui para não haver duas tabelas do Simples."] };

  // Lucro Presumido (estimativa).
  let presumido: EstimativaRegime;
  if (!e.atividade) presumido = { regime: "Lucro Presumido", atual: atual === "Lucro Presumido", podeOptar: receita <= LIMITE_PRESUMIDO_CENTAVOS, totalCentavos: null, linhas: [], observacoes: ["Escolha a atividade (percentual de presunção) para estimar o Presumido."] };
  else {
    const p = PRESUNCAO_COMPARACAO[e.atividade];
    const trimestres = new Map<string, MesComparacao[]>();
    for (const m of meses) { const [a, mm] = m.competencia.split("-").map(Number); const k = `${a}-T${Math.ceil(mm / 3)}`; trimestres.set(k, [...(trimestres.get(k) || []), m]); }
    let irpj = 0, csll = 0; const obs: string[] = [];
    for (const [k, ms] of trimestres) {
      const r = somar(ms.map((m) => m.receitaBrutaCentavos));
      const baseI = pct(r, p.irpjBp), baseC = pct(r, p.csllBp);
      irpj += pct(baseI, 1500) + Math.max(0, pct(baseI - ADICIONAL_LIMITE_MES * ms.length, 1000));
      csll += pct(baseC, 900);
      if (Number(k.slice(0, 4)) >= 2026 && r > 125_000_000) obs.push(`${k}: receita acima de R$ 1,25 milhão no trimestre — a estimativa não inclui o acréscimo da presunção da LC 224/2025 (a apuração em Livros › ECF Presumido inclui).`);
      if (ms.length < 3) obs.push(`${k}: só ${ms.length} mês(es) do trimestre estão na janela de 12 meses; o adicional do IRPJ foi calculado proporcional (R$ 20.000 por mês).`);
    }
    const pis = somar(meses.map((m) => pct(m.receitaBrutaCentavos, 65))), cofins = somar(meses.map((m) => pct(m.receitaBrutaCentavos, 300)));
    const linhas: LinhaValor[] = [
      { nome: `IRPJ (presunção ${(p.irpjBp / 100).toLocaleString("pt-BR")}%, 15% + adicional 10%)`, centavos: irpj, base: "Lei 9.249/1995, arts. 3º e 15" },
      { nome: `CSLL (presunção ${(p.csllBp / 100).toLocaleString("pt-BR")}%, 9%)`, centavos: csll, base: "Lei 9.249/1995, art. 20" },
      { nome: "PIS cumulativo 0,65%", centavos: pis, base: "Lei 9.715/1998, art. 8º, I" },
      { nome: "COFINS cumulativa 3%", centavos: cofins, base: "Lei 9.718/1998, art. 8º" },
      ...(cpp !== null ? [{ nome: "CPP 20% sobre salários e pró-labore", centavos: cpp, base: "Lei 8.212/1991, art. 22, I e III" }] : []),
    ];
    obs.push("Não inclui ICMS, ISS, IPI, RAT/terceiros, receitas financeiras nem retenções; IRPJ/CSLL agrupados pelos trimestres do calendário.");
    presumido = { regime: "Lucro Presumido", atual: atual === "Lucro Presumido", podeOptar: receita <= LIMITE_PRESUMIDO_CENTAVOS, motivo: receita > LIMITE_PRESUMIDO_CENTAVOS ? "Receita acima de R$ 78 milhões: Lucro Real obrigatório (Lei 9.718/1998, art. 13)." : undefined, totalCentavos: somar(linhas.map((l) => l.centavos)), linhas, observacoes: obs };
  }

  // Lucro Real (estimativa): lucro contábil antes do IRPJ/CSLL, trocando os tributos sobre a receita do regime atual pelo PIS/COFINS não cumulativos.
  const pisNc = Math.max(0, somar(meses.map((m) => pct(m.receitaBrutaCentavos, 165))) - creditoPis);
  const cofinsNc = Math.max(0, somar(meses.map((m) => pct(m.receitaBrutaCentavos, 760))) - creditoCofins);
  const tributosReceitaAtual = atual === "Lucro Real" ? 0 : somar(["DAS_SIMPLES", "PIS_PRESUMIDO", "COFINS_PRESUMIDO"].map((t) => porTributo.get(t)?.apuradoCentavos ?? 0));
  const lucroAntes = resultado + somar(meses.map((m) => m.irpjCentavos + m.csllCentavos)) + (atual === "Lucro Real" ? 0 : tributosReceitaAtual - pisNc - cofinsNc - ((atual === "Simples Nacional" || atual === "MEI") && cpp !== null ? cpp : 0));
  const irpjReal = lucroAntes > 0 ? pct(lucroAntes, 1500) + Math.max(0, pct(lucroAntes - ADICIONAL_LIMITE_MES * 12, 1000)) : 0;
  const csllReal = lucroAntes > 0 ? pct(lucroAntes, 900) : 0;
  const linhasReal: LinhaValor[] = [
    { nome: `IRPJ sobre lucro estimado de ${reaisTexto(lucroAntes)} (15% + adicional 10%)`, centavos: irpjReal, base: "Lei 9.249/1995, art. 3º" },
    { nome: "CSLL 9% sobre o lucro", centavos: csllReal, base: "Lei 7.689/1988" },
    { nome: `PIS não cumulativo 1,65%${creditoPis ? " (menos os créditos apurados no Fiscal)" : ""}`, centavos: pisNc, base: "Lei 10.637/2002, art. 2º" },
    { nome: `COFINS não cumulativa 7,6%${creditoCofins ? " (menos os créditos apurados no Fiscal)" : ""}`, centavos: cofinsNc, base: "Lei 10.833/2003, art. 2º" },
    ...(cpp !== null ? [{ nome: "CPP 20% sobre salários e pró-labore", centavos: cpp, base: "Lei 8.212/1991, art. 22, I e III" }] : []),
  ];
  const obsReal = ["Parte do resultado da contabilidade dos 12 meses, sem adições, exclusões nem compensação de prejuízo (o valor final sai da Apuração do Lucro Real).", "Não inclui ICMS, ISS, IPI nem RAT/terceiros."];
  if (!creditoPis && !creditoCofins && atual !== "Lucro Real") obsReal.push("Sem créditos de PIS/COFINS: compras para revenda, insumos, energia, aluguel e depreciação geram crédito no não cumulativo, então o valor real tende a ser menor.");
  if (atual !== "Lucro Real") obsReal.push("Os tributos sobre a receita do regime atual (DAS ou PIS/COFINS cumulativos) foram devolvidos ao lucro e trocados pelo PIS/COFINS não cumulativos" + ((atual === "Simples Nacional" || atual === "MEI") && cpp !== null ? " e pela CPP." : "."));
  const real: EstimativaRegime = { regime: "Lucro Real", atual: atual === "Lucro Real", podeOptar: true, totalCentavos: somar(linhasReal.map((l) => l.centavos)), linhas: linhasReal, observacoes: obsReal };

  // O regime atual mostra o que foi de fato apurado (se o Fiscal mandou); a estimativa fica como referência.
  for (const est of [presumido, real]) if (est.atual && liquidoAtual > 0) est.observacoes.unshift(`Regime atual: apurado de fato nos 12 meses ${reaisTexto(liquidoAtual)} (apurações recebidas do Fiscal e da Apuração do Lucro Real).`);
  const lista = pagoAMaior(e.apuracoes, e.hoje);
  return {
    periodo: { de: comps[0], ate: comps[11], competencias: comps }, receita12Centavos: receita, folha12Centavos: e.folhaCentavos, resultado12Centavos: resultado, regimeAtual: atual,
    atualApuradoPago, estimativas: [simples, presumido, real], pagoAMaior: lista, totalAMaiorCentavos: somar(lista.filter((x) => !x.aConferir && !x.foraDoPrazo).map((x) => x.aMaiorCentavos)), avisos, baseLegal: BASE_LEGAL_COMPARACAO,
  };
}
