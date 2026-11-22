// "Quer que eu ajuste?" no fechamento normal (Diário, Razão, balancete, Balanço/DRE). Função pura, só lê.
// Acha o que não fecha, diz a causa e deixa a correção pronta; nada muda sem o "Sim" do contador (uma por vez), e tudo
// tem "Desfazer" (lançamento: estorno; alteração de cadastro ou de um campo do lançamento: volta o valor anterior).
//  - saldos iniciais que não fecham (soma devedora ≠ credora): falta a contrapartida da abertura;
//  - lançamento fora do Diário/Razão por erro (conta sintética com uma só analítica abaixo, competência diferente da data,
//    valor com fração de centavo); o que pede escolha de conta ou histórico fica "verificar";
//  - conta de resultado que não zerou no encerramento gravado do ano: partida complementar de encerramento;
//  - balancete que não fecha por outro motivo e contas fora do Balanço/DRE: "verificar".
// Regras com fonte: ITG 2000 (R1) — Escrituração Contábil (CFC); Leiaute da ECD (Receita Federal, registros I200/I250);
// Lei 6.404/1976, arts. 186 e 187.
import type { ContaPlano, LancamentoContabil } from "../types";
import { converterCentavos, gerarRelatoriosContabeis, normalizarDataContabil } from "./livrosContabeis";
import { calcularEncerramento, contasDeResultado, ehEncerramento, encerramentosDoAno } from "./escrituracaoAvancada";
import { grupoDemonstracao } from "./analiseContabil";
import { ajusteLancado, estornarAjuste, lancarAjuste, perguntaAjuste, type LancamentoProposto } from "./ajustesPropostos";

export const PREFIXO_AJUSTE_FECHAMENTO = "AJUSTE-FECHAMENTO:";

export type TipoProposta = "lancamento" | "saldo_inicial" | "alterar_lancamento" | "verificar";
export interface PropostaFechamento {
  id: string;
  tipo: TipoProposta;
  situacao: "pendente" | "feito" | "mantido";
  titulo: string;
  causa: string;
  base: string;
  competencia: string;
  diferencaCentavos: number;
  /** Texto pronto: "Quer que eu ajuste? ... Vou lançar: ..." (tela e Agente IA). */
  pergunta: string;
  lancamento?: LancamentoProposto;
  saldoInicial?: { conta: string; valorCentavos: number; competencia: string };
  alteracao?: { lancamentoId: string; campo: "contaDebitoCodigo" | "contaCreditoCodigo" | "competencia" | "valor"; de: unknown; para: unknown };
}
type Marca = { id: string; antes: unknown; por: string; em: string; campo?: string; titulo?: string };

const BASE_PARTIDAS = "Partidas dobradas — ITG 2000 (R1) (CFC): a soma dos saldos devedores é igual à soma dos saldos credores.";
const BASE_ANALITICA = "Leiaute da ECD (Receita Federal), registro I250: o lançamento só pode usar conta analítica.";
const BASE_DATA = "ITG 2000 (R1): o lançamento é registrado na data do fato; a competência acompanha a data.";
const BASE_CENTAVO = "Leiaute da ECD (Receita Federal): valores com duas casas decimais; a fração de centavo não existe na escrituração.";
const BASE_ENCERRAMENTO = "Lei 6.404/1976, arts. 186 e 187, e Leiaute da ECD (registro I200, indicador E): no encerramento as contas de resultado ficam zeradas contra lucros ou prejuízos acumulados.";
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ultimoDia = (comp: string) => { const [a, m] = comp.split("-").map(Number); return `${comp}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };

export interface EntradaFechamento {
  contas: ContaPlano[];
  lancamentos: LancamentoContabil[];
  empresa?: Record<string, any>;
  /** Competência analisada (AAAA-MM); sem ela, olha todos os meses. */
  competencia?: string;
  fechadas?: Set<string>;
}

export function analisarFechamento(e: EntradaFechamento): PropostaFechamento[] {
  const out: PropostaFechamento[] = [];
  const contas = Array.isArray(e.contas) ? e.contas : [];
  const lancs = Array.isArray(e.lancamentos) ? e.lancamentos : [];
  const empresa = e.empresa || {};
  const decisoes: Record<string, { decisao: string }> = empresa.decisoesAjustes || {};
  const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
  const situacao = (id: string, feito: boolean): PropostaFechamento["situacao"] => (feito ? "feito" : decisoes[id]?.decisao === "mantido" ? "mantido" : "pendente");
  const noMes = (data: string) => !e.competencia || String(normalizarDataContabil(data) || "").slice(0, 7) === e.competencia;

  // 1. saldos iniciais que não fecham
  const comSaldo = contas.filter((c) => c.tipo === "analitica" && !c.saldoInicialConvertidoEm && (converterCentavos(c.saldoInicial ?? 0) || 0) !== 0);
  const bases = new Set(comSaldo.map((c) => String(c.saldoInicialCompetencia || "")));
  const marcaSaldo = contas.find((c: any) => c.ajusteFechamento?.id?.startsWith("saldo-inicial:")) as any;
  if (comSaldo.length && bases.size === 1 && /^\d{4}-\d{2}$/.test([...bases][0])) {
    const base = [...bases][0];
    const soma = comSaldo.reduce((t, c) => t + (converterCentavos(c.saldoInicial) || 0) * (c.natureza === "D" ? 1 : -1), 0);
    const id = `saldo-inicial:${base}`;
    if (soma !== 0 || marcaSaldo?.ajusteFechamento?.id === id) {
      const cp = porCodigo.get(String(empresa.contaContrapartidaAberturaCodigo || ""));
      const precisa = cp ? -soma * (cp.natureza === "D" ? 1 : -1) : 0; // saldo que a contrapartida precisa ter, na natureza dela
      const feito = marcaSaldo?.ajusteFechamento?.id === id;
      const causa = `os saldos iniciais (competência-base ${base}) somam ${reais(Math.abs(soma))} a mais ${soma > 0 ? "devedor" : "credor"}: falta a contrapartida da abertura`;
      if (feito || (cp && cp.tipo === "analitica" && !(converterCentavos(cp.saldoInicial ?? 0) || 0) && precisa > 0)) {
        const conta = feito ? marcaSaldo.codigo : cp!.codigo;
        const valor = feito ? converterCentavos(marcaSaldo.saldoInicial) || 0 : precisa;
        out.push({ id, tipo: "saldo_inicial", situacao: situacao(id, feito), titulo: "Saldos iniciais não fecham", causa, base: BASE_PARTIDAS, competencia: base, diferencaCentavos: Math.abs(soma) || valor,
          pergunta: `Quer que eu ajuste? Diferença de ${reais(Math.abs(soma) || valor)} nos saldos iniciais de ${base.slice(5)}/${base.slice(0, 4)}, causa: ${causa}. Vou registrar o saldo inicial de ${reais(valor)} na conta ${conta} (contrapartida da abertura).`,
          saldoInicial: { conta, valorCentavos: valor, competencia: base } });
      } else {
        out.push({ id, tipo: "verificar", situacao: situacao(id, false), titulo: "Saldos iniciais não fecham", causa, base: BASE_PARTIDAS, competencia: base, diferencaCentavos: Math.abs(soma),
          pergunta: `Diferença de ${reais(Math.abs(soma))} nos saldos iniciais. Escolha em Plano de Contas a "Contrapartida da abertura" (conta analítica sem saldo, de natureza ${soma > 0 ? "credora" : "devedora"}) para o ajuste ficar pronto.` });
      }
    }
  } else if (bases.size > 1) {
    out.push({ id: "saldo-inicial:bases", tipo: "verificar", situacao: situacao("saldo-inicial:bases", false), titulo: "Saldos iniciais em mais de uma competência-base", causa: `há saldos iniciais em ${bases.size} competências diferentes (${[...bases].join(", ")})`, base: BASE_PARTIDAS, competencia: [...bases].sort()[0], diferencaCentavos: 0,
      pergunta: "Deixe todos os saldos iniciais na mesma competência-base (Plano de Contas) para o balancete poder fechar." });
  }

  // 2. lançamento fora do Diário/Razão por erro corrigível
  const rel = gerarRelatoriosContabeis(contas, lancs, "todos");
  const filhasAnaliticas = (codigo: string) => contas.filter((c) => c.tipo === "analitica" && c.codigo.startsWith(`${codigo}.`));
  for (const l of rel.invalidos) {
    if (!noMes(l.data)) continue;
    const data = normalizarDataContabil(l.data);
    const comp = (data || String(l.competencia || "")).slice(0, 7);
    for (const lado of ["contaDebitoCodigo", "contaCreditoCodigo"] as const) {
      const c = porCodigo.get(l[lado]);
      if (!c || c.tipo !== "sintetica") continue;
      const filhas = filhasAnaliticas(c.codigo);
      const id = `sintetica:${l.id}:${lado}`;
      const valor = converterCentavos(l.valor) || 0;
      if (filhas.length === 1) {
        out.push({ id, tipo: "alterar_lancamento", situacao: situacao(id, false), titulo: `Lançamento de ${String(data || l.data).split("-").reverse().join("/")} na conta sintética ${c.codigo}`, causa: `a conta ${c.codigo} (${c.descricao}) é sintética e só tem uma analítica abaixo: ${filhas[0].codigo} (${filhas[0].descricao}); o lançamento ficou fora do Diário e do Razão`, base: BASE_ANALITICA, competencia: comp, diferencaCentavos: valor,
          pergunta: `Quer que eu ajuste? O lançamento "${l.historico}" de ${reais(valor)} está na conta sintética ${c.codigo}; vou trocar para a analítica ${filhas[0].codigo} (${filhas[0].descricao}).`, alteracao: { lancamentoId: l.id, campo: lado, de: c.codigo, para: filhas[0].codigo } });
      } else {
        out.push({ id, tipo: "verificar", situacao: situacao(id, false), titulo: `Lançamento de ${String(data || l.data).split("-").reverse().join("/")} na conta sintética ${c.codigo}`, causa: `a conta ${c.codigo} é sintética e tem ${filhas.length} analíticas abaixo; o lançamento ficou fora do Diário e do Razão`, base: BASE_ANALITICA, competencia: comp, diferencaCentavos: valor,
          pergunta: `Escolha a conta analítica certa para o lançamento "${l.historico}" (${reais(valor)}) em Lançamentos.` });
      }
    }
    if (data && l.competencia && l.competencia !== data.slice(0, 7)) {
      const id = `competencia:${l.id}`;
      out.push({ id, tipo: "alterar_lancamento", situacao: situacao(id, false), titulo: `Lançamento de ${data.split("-").reverse().join("/")} com competência ${l.competencia}`, causa: "a competência do lançamento é diferente do mês da data; ele ficou fora do Diário e do Razão", base: BASE_DATA, competencia: data.slice(0, 7), diferencaCentavos: converterCentavos(l.valor) || 0,
        pergunta: `Quer que eu ajuste? O lançamento "${l.historico}" tem data ${data.split("-").reverse().join("/")} e competência ${l.competencia}; vou deixar a competência ${data.slice(0, 7)} (a da data).`, alteracao: { lancamentoId: l.id, campo: "competencia", de: l.competencia, para: data.slice(0, 7) } });
    }
    const motivos: string[] = [];
    if (!data) motivos.push("data inválida");
    if (!String(l.historico || "").trim()) motivos.push("sem histórico");
    if (!porCodigo.has(l.contaDebitoCodigo) || !porCodigo.has(l.contaCreditoCodigo)) motivos.push("conta que não existe no plano");
    if (l.contaDebitoCodigo === l.contaCreditoCodigo) motivos.push("a mesma conta a débito e a crédito");
    if (!((converterCentavos(l.valor) || 0) > 0)) motivos.push("valor zero ou negativo");
    if (motivos.length) {
      const id = `invalido:${l.id}`;
      out.push({ id, tipo: "verificar", situacao: situacao(id, false), titulo: `Lançamento fora do Diário e do Razão (${l.historico || l.id})`, causa: motivos.join(", "), base: "ITG 2000 (R1): o lançamento tem data, conta devedora, conta credora, histórico e valor.", competencia: comp, diferencaCentavos: converterCentavos(l.valor) || 0,
        pergunta: `Corrija em Lançamentos: ${motivos.join(", ")}. Isso pede escolha da pessoa, então não ajusto sozinho.` });
    }
  }
  for (const v of rel.validos) {
    const bruto = Number(v.original.valor);
    if (!noMes(v.original.data) || !Number.isFinite(bruto) || Math.abs(bruto * 100 - Math.round(bruto * 100)) < 1e-6) continue;
    const id = `centavo:${v.original.id}`;
    out.push({ id, tipo: "alterar_lancamento", situacao: situacao(id, false), titulo: `Lançamento de ${v.dataISO.split("-").reverse().join("/")} com fração de centavo`, causa: `o valor ${String(v.original.valor)} tem mais de duas casas; o balancete usa ${reais(v.valorCentavos)} (arredondamento)`, base: BASE_CENTAVO, competencia: v.dataISO.slice(0, 7), diferencaCentavos: 0,
      pergunta: `Quer que eu ajuste? O lançamento "${v.original.historico}" tem valor ${String(v.original.valor)}; vou gravar ${reais(v.valorCentavos)}, que é o que já entra no balancete.`, alteracao: { lancamentoId: v.original.id, campo: "valor", de: v.original.valor, para: v.valorCentavos / 100 } });
  }

  // 3. conta de resultado que não zerou no encerramento gravado
  const anos = [...new Set(lancs.filter(ehEncerramento).map((l) => String(normalizarDataContabil(l.data) || "").slice(0, 4)).filter(Boolean))].map(Number);
  for (const ano of anos) {
    if (e.competencia && !e.competencia.startsWith(`${ano}-`)) continue;
    const ex = encerramentosDoAno(lancs, ano);
    if (!ex.ativos.length) continue;
    const pares = ex.ativos.flat();
    const destino = [pares[0].contaDebitoCodigo, pares[0].contaCreditoCodigo].find((c) => pares.every((l) => l.contaDebitoCodigo === c || l.contaCreditoCodigo === c)) || "";
    const calc = calcularEncerramento({ contas, lancamentos: lancs, ano, contaDestino: destino });
    if ("erro" in calc && !/não têm saldo/.test(calc.erro)) continue; // ex.: lançamento do ano aguardando aprovação: confere depois
    const saldoAntes = new Map<string, number>("erro" in calc ? [] : calc.partidas.map((p) => [p.conta.codigo, p.saldoCentavos]));
    const efeito = new Map<string, number>();
    for (const l of lancs.filter((x) => ehEncerramento(x) && String(normalizarDataContabil(x.data) || "").startsWith(`${ano}-`) && x.statusManual !== "pendente_aprovacao" && x.statusManual !== "rejeitado")) {
      const c = converterCentavos(l.valor) || 0;
      efeito.set(l.contaDebitoCodigo, (efeito.get(l.contaDebitoCodigo) || 0) + c);
      efeito.set(l.contaCreditoCodigo, (efeito.get(l.contaCreditoCodigo) || 0) - c);
    }
    for (const conta of contasDeResultado(contas)) {
      const resto = (saldoAntes.get(conta.codigo) || 0) + (efeito.get(conta.codigo) || 0);
      const id = `encerramento:${ano}:${conta.codigo}`;
      const ref = `${PREFIXO_AJUSTE_FECHAMENTO}${id}`;
      const feito = ajusteLancado(lancs, ref);
      if (!resto && !feito) continue;
      const valor = feito ? converterCentavos(feito.valor) || 0 : Math.abs(resto);
      const causa = `a conta de resultado ${conta.codigo} (${conta.descricao}) ficou com saldo ${resto > 0 ? "devedor" : "credor"} de ${reais(Math.abs(resto))} depois do encerramento de ${ano} (houve lançamento depois dele ou o encerramento ficou incompleto)`;
      const prop: LancamentoProposto = feito
        ? { data: String(feito.data), competencia: `${ano}-12`, contaDebito: feito.contaDebitoCodigo, contaCredito: feito.contaCreditoCodigo, valorCentavos: valor, historico: String(feito.historico), encerramento: true }
        : { data: `${ano}-12-31`, competencia: `${ano}-12`, contaDebito: resto < 0 ? conta.codigo : destino, contaCredito: resto < 0 ? destino : conta.codigo, valorCentavos: valor, historico: `Complemento do encerramento do exercício de ${ano} — conta ${conta.codigo}`, encerramento: true };
      out.push({ id, tipo: destino ? "lancamento" : "verificar", situacao: situacao(id, Boolean(feito)), titulo: `Encerramento de ${ano}: conta ${conta.codigo} não zerou`, causa: feito ? "ajuste lançado" : causa, base: BASE_ENCERRAMENTO, competencia: `${ano}-12`, diferencaCentavos: valor,
        pergunta: perguntaAjuste(prop, causa), lancamento: destino ? prop : undefined });
    }
  }

  // 4. balancete que não fecha por outro motivo e contas fora do Balanço/DRE
  const relMes = gerarRelatoriosContabeis(contas, lancs, e.competencia || "todos");
  const dif = relMes.totalSaldoDevedorCentavos - relMes.totalSaldoCredorCentavos;
  if (dif !== 0 && !out.some((p) => p.id.startsWith("saldo-inicial:"))) {
    out.push({ id: `balancete:${e.competencia || "todos"}`, tipo: "verificar", situacao: situacao(`balancete:${e.competencia || "todos"}`, false), titulo: "Balancete não fecha", causa: `diferença de ${reais(Math.abs(dif))} entre saldos devedores e credores`, base: BASE_PARTIDAS, competencia: e.competencia || "", diferencaCentavos: Math.abs(dif),
      pergunta: "Confira os saldos iniciais e os lançamentos fora do Diário listados acima." });
  }
  const fora = relMes.balancete.filter((b) => b.conta.tipo === "analitica" && grupoDemonstracao(b.conta, contas) === null && (b.saldoDevedorCentavos || b.saldoCredorCentavos));
  if (fora.length) {
    const id = `classificacao:${e.competencia || "todos"}`;
    out.push({ id, tipo: "verificar", situacao: situacao(id, false), titulo: `${fora.length} conta(s) com saldo fora do Balanço/DRE`, causa: `contas sem grupo nas demonstrações: ${fora.slice(0, 5).map((b) => b.conta.codigo).join(", ")}${fora.length > 5 ? "…" : ""}`, base: "Lei 6.404/1976, arts. 178 e 187: toda conta com saldo entra no Balanço ou na DRE.", competencia: e.competencia || "", diferencaCentavos: 0,
      pergunta: "Classifique essas contas em Demonstrações › Classificação para o Balanço e a DRE fecharem." });
  }

  // alterações de lançamento já feitas (ficam marcadas no lançamento): aparecem como feitas, com "Desfazer"
  for (const l of lancs as any[]) for (const m of (Array.isArray(l?.ajustesFechamento) ? l.ajustesFechamento : []) as Marca[]) {
    if (out.some((p) => p.id === m.id) || !m.campo) continue;
    out.push({ id: m.id, tipo: "alterar_lancamento", situacao: "feito", titulo: m.titulo || `Lançamento ${l.id} ajustado`, causa: "ajuste feito", base: "Ajuste confirmado pelo contador.", competencia: String(normalizarDataContabil(l.data) || "").slice(0, 7), diferencaCentavos: converterCentavos(l.valor) || 0,
      pergunta: `${m.campo}: era ${JSON.stringify(m.antes)}, ficou ${JSON.stringify(l[m.campo])} (por ${m.por}).`, alteracao: { lancamentoId: l.id, campo: m.campo as any, de: m.antes, para: l[m.campo] } });
  }
  // saldo inicial que foi ajustado e depois mudou de base também aparece como feito
  if (marcaSaldo && !out.some((p) => p.id === marcaSaldo.ajusteFechamento.id)) {
    const id = String(marcaSaldo.ajusteFechamento.id);
    out.push({ id, tipo: "saldo_inicial", situacao: "feito", titulo: "Saldos iniciais (ajuste registrado)", causa: "ajuste registrado", base: BASE_PARTIDAS, competencia: String(marcaSaldo.saldoInicialCompetencia || ""), diferencaCentavos: converterCentavos(marcaSaldo.saldoInicial) || 0,
      pergunta: `Saldo inicial de ${reais(converterCentavos(marcaSaldo.saldoInicial) || 0)} registrado na conta ${marcaSaldo.codigo}.`, saldoInicial: { conta: marcaSaldo.codigo, valorCentavos: converterCentavos(marcaSaldo.saldoInicial) || 0, competencia: String(marcaSaldo.saldoInicialCompetencia || "") } });
  }
  return out;
}

/** Executa ("Sim") ou desfaz UMA proposta numa cópia do workspace. Lança Error com o motivo em português. */
export function aplicarPropostaFechamento(payload: Record<string, any>, proposta: PropostaFechamento, acao: "executar" | "desfazer" | "manter", quem: string, agora = new Date()): Record<string, any> {
  const p = JSON.parse(JSON.stringify(payload));
  const marca: Marca = { id: proposta.id, antes: undefined, por: quem, em: agora.toISOString() };
  if (acao === "manter") {
    p.empresa = { ...(p.empresa || {}), decisoesAjustes: { ...(p.empresa?.decisoesAjustes || {}), [proposta.id]: { decisao: "mantido", por: quem, em: marca.em } } };
    return p;
  }
  if (proposta.tipo === "verificar") throw new Error("Este item pede escolha da pessoa; corrija na tela indicada.");
  if (proposta.tipo === "lancamento") {
    const ref = `${PREFIXO_AJUSTE_FECHAMENTO}${proposta.id}`;
    if (acao === "desfazer") return estornarAjuste(p, ref);
    if (proposta.situacao === "feito") throw new Error("Este ajuste já foi lançado.");
    return lancarAjuste(p, ref, proposta.lancamento!, quem, agora);
  }
  if (proposta.tipo === "saldo_inicial") {
    const s = proposta.saldoInicial!;
    const c = (p.contas || []).find((x: any) => x.codigo === s.conta);
    if (!c) throw new Error(`A conta ${s.conta} não está mais no plano.`);
    if (acao === "desfazer") {
      if (c.ajusteFechamento?.id !== proposta.id) throw new Error("Não há ajuste registrado para desfazer.");
      const antes = c.ajusteFechamento.antes || {};
      delete c.ajusteFechamento; c.saldoInicial = antes.saldoInicial; c.saldoInicialCompetencia = antes.saldoInicialCompetencia;
      if (c.saldoInicial === undefined) delete c.saldoInicial; if (c.saldoInicialCompetencia === undefined) delete c.saldoInicialCompetencia;
      return p;
    }
    if (proposta.situacao === "feito") throw new Error("Este ajuste já foi registrado.");
    c.ajusteFechamento = { ...marca, antes: { saldoInicial: c.saldoInicial, saldoInicialCompetencia: c.saldoInicialCompetencia } };
    c.saldoInicial = s.valorCentavos / 100; c.saldoInicialCompetencia = s.competencia;
    return p;
  }
  const a = proposta.alteracao!;
  const l = (p.lancamentos || []).find((x: any) => x.id === a.lancamentoId);
  if (!l) throw new Error("O lançamento não existe mais.");
  if (acao === "desfazer") {
    const m = (l.ajustesFechamento || []).find((x: Marca) => x.id === proposta.id);
    if (!m) throw new Error("Não há ajuste registrado para desfazer.");
    l[a.campo] = m.antes; l.ajustesFechamento = l.ajustesFechamento.filter((x: Marca) => x.id !== proposta.id);
    if (!l.ajustesFechamento.length) delete l.ajustesFechamento;
    if (a.campo === "contaDebitoCodigo" || a.campo === "contaCreditoCodigo") l[a.campo === "contaDebitoCodigo" ? "contaDebitoNome" : "contaCreditoNome"] = (p.contas || []).find((x: any) => x.codigo === m.antes)?.descricao || l[a.campo === "contaDebitoCodigo" ? "contaDebitoNome" : "contaCreditoNome"];
    return p;
  }
  if (JSON.stringify(l[a.campo]) !== JSON.stringify(a.de)) throw new Error("O lançamento mudou depois da análise; abra de novo.");
  l.ajustesFechamento = [...(l.ajustesFechamento || []), { ...marca, antes: l[a.campo], campo: a.campo, titulo: proposta.titulo }];
  l[a.campo] = a.para;
  if (a.campo === "contaDebitoCodigo" || a.campo === "contaCreditoCodigo") l[a.campo === "contaDebitoCodigo" ? "contaDebitoNome" : "contaCreditoNome"] = (p.contas || []).find((x: any) => x.codigo === a.para)?.descricao || "";
  return p;
}

/** Propostas já feitas que podem ser desfeitas (alteração de lançamento fica marcada no próprio lançamento). */
export function alteracoesFeitas(lancamentos: LancamentoContabil[]): Array<{ id: string; lancamentoId: string; antes: unknown }> {
  return lancamentos.flatMap((l: any) => (Array.isArray(l?.ajustesFechamento) ? l.ajustesFechamento.map((m: Marca) => ({ id: m.id, lancamentoId: l.id, antes: m.antes })) : []));
}
