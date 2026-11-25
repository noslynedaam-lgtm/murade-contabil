// Comparação de regimes (estimativa) e recolhimento a maior por empresa: rota da tela (Gestão contábil › Regimes e pago a maior),
// "Rodar agora" do conferidor e o robô (só lê). Junta o que o Contábil já tem: receita e resultado da contabilidade, folha e pró-labore do DP
// e as apurações/pagamentos recebidos do Fiscal. A simulação do Simples fica no Murad Fiscal (Tabela Tributária), sem duplicar as tabelas.
import type express from "express";
import { lerWorkspaceInternoContabil, normalizarCnpjAcesso, sessaoDaRequisicaoContabil } from "./authContabil";
import { acessoEmpresa } from "./escrituracaoRotas";
import { apuracoesStoreConfigurado, lerApuracoesFiscais } from "./apuracoesFiscaisStore";
import { dpStoreConfigurado, lerResumosDP } from "./dadosDpStore";
import { lerResumosProLaboreDP } from "./dadosProLaboreStore";
import { mesesDaContabilidade } from "./lucroRealApuracao";
import { urlDoSistema } from "./agentesEntreSistemas";
import { compararRegimes, janela12Meses, pagoAMaior, PRESUNCAO_COMPARACAO, reaisTexto, type AtividadeComparacao, type ApuracaoComparacao, type MesComparacao, type PagoAMaior, type ResultadoComparacao } from "../utils/comparacaoRegimes";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Mw = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;

export const hojeBrasilia = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
const paraCentavos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0);

async function apuracoesDa(cnpj: string): Promise<ApuracaoComparacao[]> {
  if (!apuracoesStoreConfigurado()) return [];
  return (await lerApuracoesFiscais(cnpj, "", "", 500).catch(() => [])).filter((a) => a.situacao === "confirmado")
    .map((a) => ({ tributo: a.tributo, competencia: a.competencia, referencia: a.referencia, valorCentavos: a.valorCentavos, baseCentavos: a.baseCentavos, versaoOrigem: a.versaoOrigem }));
}

/** Salários (folha bruta) e pró-labore dos 12 meses, em centavos; null quando o DP não mandou nenhum mês da janela. */
async function folhaDoDp(cnpj: string, comps: string[]): Promise<number | null> {
  if (!dpStoreConfigurado()) return null;
  const [folhas, pro] = await Promise.all([lerResumosDP(cnpj, comps[0], comps[11], 200).catch(() => []), lerResumosProLaboreDP(cnpj, 200).catch(() => [])]);
  const porMes = new Map<string, number>();
  for (const f of folhas as any[]) { const c = String(f.competencia).trim(); if (!porMes.has(c) && comps.includes(c)) porMes.set(c, paraCentavos(f.resumo?.folhaBruta)); }
  const pl = new Map<string, number>();
  for (const p of pro) if (comps.includes(p.competencia) && !pl.has(p.competencia)) pl.set(p.competencia, paraCentavos(p.resumo?.proLabore));
  if (!porMes.size && !pl.size) return null;
  return [...porMes.values(), ...pl.values()].reduce((s, x) => s + x, 0);
}

export async function montarComparacao(cnpj: string, atividade: AtividadeComparacao | null, hoje = hojeBrasilia()): Promise<ResultadoComparacao | null> {
  const payload = (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null;
  if (!payload) return null;
  const comps = janela12Meses(hoje);
  const anos = [...new Set(comps.map((c) => Number(c.slice(0, 4))))];
  const meses: MesComparacao[] = [];
  for (const ano of anos) for (const m of mesesDaContabilidade(payload, ano)) {
    const competencia = `${ano}-${String(m.mes).padStart(2, "0")}`;
    if (comps.includes(competencia)) meses.push({ competencia, receitaBrutaCentavos: m.receitaBrutaCentavos, resultadoCentavos: m.resultadoCentavos, irpjCentavos: m.irpjCentavos, csllCentavos: m.csllCentavos });
  }
  return compararRegimes({ hoje, regimeAtual: String(payload.empresa?.regime || ""), meses, folhaCentavos: await folhaDoDp(cnpj, comps), atividade, apuracoes: await apuracoesDa(cnpj) });
}

// ------------------------------------------------------------------ conferidor do recolhimento a maior (só lê)
export interface AchadoPagoAMaior extends PagoAMaior { cnpj: string }
export async function conferirPagoAMaior(consultar: Consultar, cnpjs: string[] | null, hoje = hojeBrasilia()): Promise<{ empresas: number; achados: AchadoPagoAMaior[] }> {
  if (!apuracoesStoreConfigurado()) return { empresas: 0, achados: [] };
  const lista = cnpjs ?? (await consultar("SELECT DISTINCT cnpj FROM murade_apuracoes_fiscais_origem WHERE tributo LIKE '%\\_PAGO'").catch(() => ({ rows: [] as any[] }))).rows.map((x: any) => String(x.cnpj).trim());
  const achados: AchadoPagoAMaior[] = []; let empresas = 0;
  for (const cnpj of lista) {
    const ap = await apuracoesDa(cnpj);
    if (!ap.some((a) => /_PAGO$/.test(a.tributo))) continue;
    empresas += 1;
    achados.push(...pagoAMaior(ap, hoje).map((x) => ({ ...x, cnpj })));
  }
  return { empresas, achados };
}
export function resumoPagoAMaior(r: { empresas: number; achados: AchadoPagoAMaior[] }): string {
  if (!r.empresas) return "Nenhuma empresa com pagamento de DAS ou DARF recebido do Fiscal ainda.";
  const exatos = r.achados.filter((a) => !a.aConferir && !a.foraDoPrazo);
  const conferir = r.achados.filter((a) => a.aConferir && !a.foraDoPrazo);
  if (!exatos.length && !conferir.length) return `Recolhimento a maior: nada encontrado nos pagamentos de ${r.empresas} empresa(s).`;
  const total = exatos.reduce((s, a) => s + a.aMaiorCentavos, 0);
  return `${exatos.length ? "ATENÇÃO: " : ""}${exatos.length} recolhimento(s) a maior (${reaisTexto(total)}) e ${conferir.length} pagamento(s) a conferir em ${new Set([...exatos, ...conferir].map((a) => a.cnpj)).size} empresa(s). Veja em Gestão contábil › Regimes e pago a maior.`;
}

// ------------------------------------------------------------------ rotas
export function registrarRotasComparacaoRegimes(app: express.Express, deps: { exigirOrigemNavegador: Mw; exigirSessaoContabil: Mw; consultar: Consultar }): void {
  app.get("/api/workspaces/:cnpj/comparacao-regimes", deps.exigirSessaoContabil, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    const at = String(req.query.atividade || "");
    const atividade = (Object.prototype.hasOwnProperty.call(PRESUNCAO_COMPARACAO, at) ? at : null) as AtividadeComparacao | null;
    try {
      const r = await montarComparacao(a.cnpj, atividade);
      if (!r) return res.status(404).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados no Contábil." });
      return res.json({ sucesso: true, ...r, atividades: Object.entries(PRESUNCAO_COMPARACAO).map(([id, p]) => ({ id, rotulo: p.rotulo })), simularSimplesNoFiscal: `${urlDoSistema("fiscal")}/tabela-tributaria/`, aviso: "Estimativa para apoio à decisão: não é apuração, guia nem parecer. Quem decide o regime é o contador responsável." });
    } catch (e: any) { console.error("Comparação de regimes:", e?.message || e); return res.status(503).json({ sucesso: false, motivo: "Não foi possível montar a comparação agora." }); }
  });
  app.post("/api/comparacao-regimes/conferir-agora", deps.exigirOrigemNavegador, deps.exigirSessaoContabil, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req); if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    try { const r = await conferirPagoAMaior(deps.consultar, s.cnpjs.map(normalizarCnpjAcesso)); return res.json({ sucesso: true, ...r, resumo: resumoPagoAMaior(r), conferidoEm: new Date().toISOString() }); }
    catch { return res.status(503).json({ sucesso: false, motivo: "Não foi possível conferir agora." }); }
  });
}
