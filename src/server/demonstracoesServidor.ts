// Demonstrações e relatórios no servidor:
//  - Robô Conferidor das Demonstrações ("demonstracoes"): confere, só em leitura, cada empresa — DFC fechando com o caixa,
//    DMPL fechando com o balanço, contas com movimento sem classificação, notas explicativas do ano anterior, ECD/ECF a
//    entregar e o controle de saldos da Parte B entre anos. Guarda os achados para a tela, o painel e a Agente.
//  - Painel do escritório: quem fechou o mês, quem tem pendência e quem tem ECD/ECF a entregar (só os CNPJs do acesso).
//  - Rotas para a Agente: resumo das demonstrações, modelo das notas (não sobrescreve o que a contadora escreveu) e marcar entrega.
// Nada aqui aprova, fecha, lança ou transmite.
import type express from 'express';
import type { ContaPlano, EmpresaDados, LancamentoContabil } from '../types';
import {
  calcularDfc, calcularDmpl, calcularIndices, dreResumida, ecfSeAplica, mapaCategorias, modeloNotasExplicativas, normaSugerida,
  notasValidas, pendenciasDasNotas, prazoEntregaECF, saldosNoFimDe, serie12Meses, balancoResumido, type NormaPequenas,
} from '../utils/demonstracoesAvancadas';
import { analisarObrigatoriedadeECD, prazoEntregaECD } from '../services/ecdService';
import { saldosParteB } from '../services/ecfComplementosService';
import { conferirWorkspace, competenciaAnterior } from './conferidorContabil';

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type AchadoDemonstracoes = { cnpj: string; verificadoEm: string; itens: Array<{ id: string; nivel: 'falta' | 'atencao'; texto: string; tela: string }> };

/** Conferência só de leitura de UMA empresa (usada pelo robô, pelo painel e pelo "Rodar agora"). */
export function conferirDemonstracoesWorkspace(cnpj: string, payload: Record<string, any>, agora = new Date()): AchadoDemonstracoes | null {
  const contas: ContaPlano[] = Array.isArray(payload?.contas) ? payload.contas : [];
  const lancamentos: LancamentoContabil[] = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  const empresa = (payload?.empresa || {}) as EmpresaDados;
  if (!contas.length) return null;
  const itens: AchadoDemonstracoes['itens'] = [];
  const ano = agora.getFullYear() - 1;
  const ajustes = empresa.classificacaoDemonstracoes;
  const temMovimentoAno = lancamentos.some((l) => String(l?.data || '').startsWith(`${ano}-`) && l.statusManual !== 'pendente_aprovacao' && l.statusManual !== 'rejeitado');
  if (temMovimentoAno) {
    try {
      const dfc = calcularDfc(contas, lancamentos, `${ano}-01`, `${ano}-12`, ajustes);
      if (dfc.naoClassificadas.length) itens.push({ id: 'contas_sem_classificacao', nivel: 'atencao', tela: 'demonstracoes', texto: `${dfc.naoClassificadas.length} conta(s) com movimento em ${ano} sem classificação para DFC/índices (ex.: ${dfc.naoClassificadas.slice(0, 3).map((c) => c.codigo).join(', ')}).` });
      if (!dfc.contasCaixa.length) itens.push({ id: 'sem_caixa', nivel: 'falta', tela: 'demonstracoes', texto: 'Nenhuma conta classificada como Caixa e equivalentes: a DFC não sai.' });
      else if (!dfc.confere) itens.push({ id: 'dfc_nao_confere', nivel: 'falta', tela: 'demonstracoes', texto: `A DFC de ${ano} não fecha com a variação do caixa (diferença ${reais(dfc.diferenca)}).` });
      const dmpl = calcularDmpl(contas, lancamentos, ano, ajustes);
      if (!dmpl.confereComBalanco) itens.push({ id: 'dmpl_nao_confere', nivel: 'atencao', tela: 'demonstracoes', texto: `A DMPL de ${ano} difere do patrimônio líquido do balanço em ${reais(dmpl.diferenca)}.` });
      const notas = empresa.notasExplicativas?.[String(ano)];
      const norma = notas?.norma ?? normaSugerida(dreResumida(contas, lancamentos, `${ano}-01`, `${ano}-12`, ajustes).receitaBruta);
      if (!notas) itens.push({ id: 'notas_faltando', nivel: norma === 'NBC TG 1002' ? 'atencao' : 'falta', tela: 'demonstracoes', texto: `Notas explicativas de ${ano} ainda não foram preparadas (${norma}${norma === 'NBC TG 1002' ? ': não obrigatórias, mas incentivadas — item 3.7' : ': fazem parte do conjunto completo'}).` });
      else if (pendenciasDasNotas(notas).length) itens.push({ id: 'notas_incompletas', nivel: 'atencao', tela: 'demonstracoes', texto: `Notas explicativas de ${ano} com texto a completar: ${pendenciasDasNotas(notas).join(', ')}.` });
    } catch (e: any) { itens.push({ id: 'erro_calculo', nivel: 'atencao', tela: 'demonstracoes', texto: `Não consegui calcular as demonstrações: ${String(e?.message || e).slice(0, 120)}` }); }
  }
  // Parte B: conta com saldo no ano anterior que não foi levada para o ano seguinte (controle entre anos)
  const comp = empresa.ecfComplementos || {};
  for (const a of Object.keys(comp).map(Number).sort()) {
    if (!comp[String(a + 1)]) continue;
    for (const s of saldosParteB(comp, a)) {
      if (s.final !== 0 && !(comp[String(a + 1)].parteB || []).some((c) => c.codigo === s.codigo && c.tributo === s.tributo)) {
        itens.push({ id: `parteb_${s.codigo}_${a + 1}`, nivel: 'falta', tela: 'demonstracoes', texto: `Parte B: a conta ${s.codigo} terminou ${a} com saldo ${reais(Math.abs(s.final))} ${s.final < 0 ? 'D' : 'C'} e não foi levada para ${a + 1}.` });
      }
    }
  }
  // ECD/ECF marcada como entregue sem o recibo do programa oficial guardado: sem o recibo não há prova da entrega no sistema.
  for (const [chave, ent] of Object.entries(empresa.entregasSped || {})) {
    if (!ent || ent.arquivoRecibo || String(ent.recibo || '').trim()) continue;
    const [obr, anoEnt] = chave.split('-');
    if (obr === 'ECD' || obr === 'ECF') itens.push({ id: `recibo_${chave}`, nivel: 'atencao', tela: 'demonstracoes', texto: `${obr} ${anoEnt} marcada como entregue sem o recibo: anexe o recibo gerado pelo programa da Receita (Demonstrações > Painel do escritório > Anexar recibo).` });
  }
  return { cnpj, verificadoEm: agora.toISOString(), itens };
}

const achados = new Map<string, AchadoDemonstracoes>();
export const achadosDemonstracoes = (cnpjs?: string[]) => [...achados.values()].filter((a) => !cnpjs || cnpjs.includes(a.cnpj));
export const limparAchadosDemonstracoesParaTeste = () => achados.clear();

export async function rodarRoboDemonstracoes(consultar: Consultar, agora = new Date()): Promise<string> {
  let empresas = 0, comAchado = 0, desloc = 0;
  const vistos = new Set<string>();
  for (;;) {
    const lote = await consultar('SELECT cnpj, payload FROM contabil_company_workspaces ORDER BY cnpj LIMIT 25 OFFSET $1', [desloc]);
    if (!lote.rows.length) break;
    for (const row of lote.rows) {
      const cnpj = String(row.cnpj); vistos.add(cnpj);
      try {
        const a = conferirDemonstracoesWorkspace(cnpj, row.payload || {}, agora);
        if (a) { achados.set(cnpj, a); empresas++; if (a.itens.length) comAchado++; } else achados.delete(cnpj);
      } catch (e: any) { console.error(`Robô das Demonstrações falhou para ${cnpj}:`, e?.message || e); }
    }
    desloc += lote.rows.length;
    if (lote.rows.length < 25) break;
  }
  for (const c of [...achados.keys()]) if (!vistos.has(c)) achados.delete(c);
  return `${empresas} empresa(s) conferida(s); ${comAchado} com algo nas demonstrações (DFC, DMPL, notas ou Parte B).`;
}

// ---------------------------------------------------------------------------------------------------------------
// Painel do escritório
// ---------------------------------------------------------------------------------------------------------------
export type LinhaPainel = {
  cnpj: string; nome: string; regime: string;
  mesFechado: boolean; pendencias: string[];
  ecd: { ano: number; situacao: string; prazo: string; entregue: boolean; recibo?: string; arquivoRecibo?: string; diasParaPrazo: number };
  ecf: { ano: number; seAplica: 'sim' | 'nao' | 'depende'; prazo: string; entregue: boolean; recibo?: string; arquivoRecibo?: string; diasParaPrazo: number };
  demonstracoes: AchadoDemonstracoes['itens'];
};

export function linhaDoPainel(cnpj: string, payload: Record<string, any>, competencia: string, fechadas: Set<string>, agora = new Date(), achado?: AchadoDemonstracoes | null): LinhaPainel {
  const empresa = (payload?.empresa || {}) as EmpresaDados;
  const ano = agora.getFullYear() - 1;
  const dias = (iso: string) => Math.ceil((Date.parse(`${iso}T23:59:59Z`) - agora.getTime()) / 86_400_000);
  const mesFechado = fechadas.has(competencia);
  const pendencias: string[] = [];
  if (!mesFechado) {
    const a = conferirWorkspace(cnpj, payload || {}, competencia, agora);
    if (a) {
      pendencias.push(...a.pendencias.map((p) => p.titulo));
      const pre = Object.values(a.preLancamentosPendentesPorOrigem).reduce((t, n) => t + n, 0);
      if (pre) pendencias.push(`${pre} rascunho(s) do Fiscal/DP para conferir`);
      if (a.lancamentosAguardandoAprovacao) pendencias.push(`${a.lancamentosAguardandoAprovacao} lançamento(s) aguardando aprovação`);
    } else if (!(Array.isArray(payload?.lancamentos) && payload.lancamentos.length)) pendencias.push('Sem lançamentos');
  }
  const analise = analisarObrigatoriedadeECD({ regime: empresa.regime, presumidoLivroCaixa: empresa.presumidoLivroCaixa, presumidoDistribuiuLucroAcimaBase: empresa.presumidoDistribuiuLucroAcimaBase, simplesAporteCapital: empresa.simplesAporteCapital });
  const prazoEcd = prazoEntregaECD(ano), prazoEcf = prazoEntregaECF(ano);
  const entECD = empresa.entregasSped?.[`ECD-${ano}`], entECF = empresa.entregasSped?.[`ECF-${ano}`];
  return {
    cnpj, nome: empresa.razaoSocial || empresa.nomeFantasia || cnpj, regime: empresa.regime || '',
    mesFechado, pendencias,
    ecd: { ano, situacao: analise.situacao, prazo: prazoEcd, entregue: Boolean(entECD), recibo: entECD?.recibo, arquivoRecibo: entECD?.arquivoRecibo, diasParaPrazo: dias(prazoEcd) },
    ecf: { ano, seAplica: ecfSeAplica(empresa.regime), prazo: prazoEcf, entregue: Boolean(entECF), recibo: entECF?.recibo, arquivoRecibo: entECF?.arquivoRecibo, diasParaPrazo: dias(prazoEcf) },
    demonstracoes: (achado ?? conferirDemonstracoesWorkspace(cnpj, payload || {}, agora))?.itens || [],
  };
}

export async function montarPainelEscritorio(consultar: Consultar, cnpjs: string[], competencia: string, agora = new Date()): Promise<LinhaPainel[]> {
  if (!cnpjs.length) return [];
  const ws = await consultar('SELECT cnpj, payload FROM contabil_company_workspaces WHERE cnpj = ANY($1::text[]) ORDER BY cnpj', [cnpjs]);
  const fe = await consultar('SELECT cnpj, competencia FROM contabil_period_closures WHERE cnpj = ANY($1::text[])', [cnpjs]);
  const fechadasPor = new Map<string, Set<string>>();
  for (const r of fe.rows) { const s = fechadasPor.get(String(r.cnpj)) ?? new Set<string>(); s.add(String(r.competencia)); fechadasPor.set(String(r.cnpj), s); }
  return ws.rows.map((r) => linhaDoPainel(String(r.cnpj), r.payload || {}, competencia, fechadasPor.get(String(r.cnpj)) ?? new Set(), agora, achados.get(String(r.cnpj))))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Resumo para a Agente (só leitura): DFC e DRE do ano até a competência, DMPL do ano, índices e série de 12 meses. */
export function resumoDemonstracoes(payload: Record<string, any>, competencia: string) {
  const contas: ContaPlano[] = payload?.contas || [], lancamentos: LancamentoContabil[] = payload?.lancamentos || [];
  const ajustes = (payload?.empresa as EmpresaDados | undefined)?.classificacaoDemonstracoes;
  const ano = Number(competencia.slice(0, 4));
  const dfc = calcularDfc(contas, lancamentos, `${ano}-01`, competencia, ajustes);
  const dmpl = calcularDmpl(contas, lancamentos, ano, ajustes);
  const ind = calcularIndices(contas, lancamentos, competencia, ajustes);
  const cats = mapaCategorias(contas, ajustes);
  return {
    competencia, dfc: { caixaInicial: reais(dfc.caixaInicial), caixaFinal: reais(dfc.caixaFinal), variacao: reais(dfc.variacaoCaixa), operacional: reais(dfc.indireto.totais.operacional), investimento: reais(dfc.indireto.totais.investimento), financiamento: reais(dfc.indireto.totais.financiamento), confere: dfc.confere, avisos: dfc.avisos },
    dre: Object.fromEntries(Object.entries(ind.dre).map(([k, v]) => [k, reais(v as number)])),
    dmpl: { ano, saldoInicial: reais(dmpl.saldoInicial.total), resultado: reais(dmpl.resultado), saldoFinal: reais(dmpl.saldoFinal.total), confere: dmpl.confereComBalanco, avisos: dmpl.avisos },
    indices: ind.indices.map((i) => ({ nome: i.nome, valor: i.valor === null ? 'sem base' : i.formato === 'percentual' ? `${(i.valor * 100).toFixed(1).replace('.', ',')}%` : i.valor.toFixed(2).replace('.', ','), formula: i.formula, leitura: i.leitura })),
    serie12Meses: serie12Meses(contas, lancamentos, competencia, ajustes).map((p) => ({ competencia: p.competencia, receitaLiquida: reais(p.receitaLiquida), resultado: reais(p.lucroLiquido) })),
    contasSemClassificacao: [...cats.values()].filter((c) => c === 'nao_classificada').length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------------------------
type Sessao = { userId: string; login: string; cnpjs: string[]; podeEscrever: (cnpj: string) => boolean };
type Deps = {
  consultar: Consultar;
  bancoConfigurado: () => boolean;
  sessao: (req: express.Request) => Sessao | undefined;
  normalizarCnpj: (v: unknown) => string;
  lerWorkspace: (cnpj: string) => Promise<Record<string, any> | null>;
  alterarWorkspace: <T>(cnpj: string, alterar: (payload: Record<string, any>, ctx: { fechadas: Set<string> }) => { payload: Record<string, any> | null; resultado: T }) => Promise<{ resultado: T; dados: Record<string, any> | null; versao: number | null }>;
  dispararRobo: () => { ok: boolean; motivo?: string };
};

const erroGravacao = (res: express.Response, e: any) => {
  if (e?.name === 'ErroAlteracaoWorkspace') return res.status(Number(e.status) || 409).json({ sucesso: false, motivo: String(e.message) });
  console.error('Falha ao gravar (demonstrações):', e?.message || e);
  return res.status(503).json({ sucesso: false, motivo: 'Não consegui gravar agora. Tente de novo em instantes.' });
};

export function registrarRotasDemonstracoes(app: express.Express, mw: { exigirSessao: express.RequestHandler; exigirOrigem: express.RequestHandler }, d: Deps): void {
  const semCache = (res: express.Response) => res.setHeader('Cache-Control', 'private, no-store');
  const cnpjDoAcesso = (req: express.Request, s: Sessao, valor: unknown) => { const c = d.normalizarCnpj(valor); return c.length === 14 && s.cnpjs.includes(c) ? c : null; };

  app.get('/api/painel-escritorio', mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const competencia = COMP.test(String(req.query.competencia || '')) ? String(req.query.competencia) : competenciaAnterior(new Date());
    if (!d.bancoConfigurado()) return res.json({ sucesso: true, competencia, empresas: [] });
    try { return res.json({ sucesso: true, competencia, empresas: await montarPainelEscritorio(d.consultar, s.cnpjs, competencia) }); }
    catch (e: any) { console.error('Falha no painel do escritório:', e?.message || e); return res.status(503).json({ sucesso: false, motivo: 'Não consegui montar o painel agora.' }); }
  });

  app.post('/api/painel-escritorio/entrega', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const cnpj = cnpjDoAcesso(req, s, req.body?.cnpj);
    const obrigacao = String(req.body?.obrigacao || ''); const ano = Number(req.body?.ano);
    const desfazer = req.body?.desfazer === true; const recibo = String(req.body?.recibo || '').replace(/[^\w.\-/ ]/g, '').slice(0, 60);
    if (!cnpj) return res.status(403).json({ sucesso: false, motivo: 'Este CNPJ não está vinculado ao seu acesso.' });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: 'Seu acesso a esta empresa é só de leitura.' });
    if (!['ECD', 'ECF'].includes(obrigacao) || !Number.isInteger(ano) || ano < 2014 || ano > 2100) return res.status(400).json({ sucesso: false, motivo: 'Informe a obrigação (ECD ou ECF) e o ano.' });
    try {
      const r = await d.alterarWorkspace(cnpj, (payload) => {
        const empresa = { ...(payload.empresa || {}) };
        const entregas = { ...(empresa.entregasSped || {}) };
        const chave = `${obrigacao}-${ano}`;
        if (desfazer) delete entregas[chave]; else entregas[chave] = { entregueEm: new Date().toISOString(), ...(recibo ? { recibo } : {}), marcadoPor: s.login };
        empresa.entregasSped = entregas;
        return { payload: { ...payload, empresa }, resultado: true };
      });
      return res.json({ sucesso: true, mensagem: desfazer ? `${obrigacao} ${ano} voltou para "a entregar".` : `${obrigacao} ${ano} marcada como entregue${recibo ? ` (recibo ${recibo})` : ''}.`, dados: r.dados, versao: r.versao });
    } catch (e: any) { return erroGravacao(res, e); }
  });

  // Recibo de entrega da ECD/ECF: o governo só recebe pelo programa oficial (PGE/ReceitaNet); a contadora anexa aqui o recibo
  // que ele gera, para ficar guardado e visível no painel. Um arquivo por empresa, obrigação e ano; só CNPJs do acesso.
  app.post('/api/painel-escritorio/entrega/recibo', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const cnpj = cnpjDoAcesso(req, s, req.body?.cnpj);
    if (!cnpj) return res.status(403).json({ sucesso: false, motivo: 'Este CNPJ não está vinculado ao seu acesso.' });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: 'Seu acesso a esta empresa é só de leitura.' });
    const v = validarReciboSped(req.body);
    if ('erro' in v) return res.status(400).json({ sucesso: false, motivo: v.erro });
    try {
      await gravarReciboSped(d.consultar, { cnpj, ...v, por: s.login });
      const recibo = String(req.body?.recibo || '').replace(/[^\w.\-/ ]/g, '').slice(0, 60);
      const r = await d.alterarWorkspace(cnpj, (payload) => {
        const empresa = { ...(payload.empresa || {}) };
        const entregas = { ...(empresa.entregasSped || {}) };
        const chave = `${v.obrigacao}-${v.ano}`;
        const atual = entregas[chave] || { entregueEm: new Date().toISOString(), marcadoPor: s.login };
        entregas[chave] = { ...atual, ...(recibo ? { recibo } : {}), arquivoRecibo: v.nomeArquivo };
        empresa.entregasSped = entregas;
        return { payload: { ...payload, empresa }, resultado: true };
      });
      return res.json({ sucesso: true, mensagem: `Recibo da ${v.obrigacao} ${v.ano} guardado (${v.nomeArquivo}). A obrigação ficou marcada como entregue.`, dados: r.dados, versao: r.versao });
    } catch (e: any) { return erroGravacao(res, e); }
  });
  app.get('/api/painel-escritorio/entrega/recibo', mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const cnpj = cnpjDoAcesso(req, s, req.query?.cnpj);
    if (!cnpj) return res.status(403).json({ sucesso: false, motivo: 'Este CNPJ não está vinculado ao seu acesso.' });
    const obrigacao = String(req.query?.obrigacao || ''); const ano = Number(req.query?.ano);
    if (!['ECD', 'ECF'].includes(obrigacao) || !Number.isInteger(ano)) return res.status(400).json({ sucesso: false, motivo: 'Informe a obrigação (ECD ou ECF) e o ano.' });
    const arq = await lerReciboSped(d.consultar, cnpj, obrigacao as 'ECD' | 'ECF', ano).catch(() => null);
    if (!arq) return res.status(404).json({ sucesso: false, motivo: 'Nenhum recibo anexado para esta obrigação e ano.' });
    res.setHeader('Content-Type', arq.tipo);
    res.setHeader('Content-Disposition', `attachment; filename="${arq.nomeArquivo.replace(/"/g, '')}"`);
    return res.send(arq.conteudo);
  });

  app.get('/api/demonstracoes/:cnpj/resumo', mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const cnpj = cnpjDoAcesso(req, s, req.params.cnpj);
    if (!cnpj) return res.status(403).json({ sucesso: false, motivo: 'Este CNPJ não está vinculado ao seu acesso.' });
    const competencia = String(req.query.competencia || '');
    if (!COMP.test(competencia)) return res.status(400).json({ sucesso: false, motivo: 'Competência inválida (AAAA-MM).' });
    const payload = await d.lerWorkspace(cnpj);
    if (!payload) return res.status(404).json({ sucesso: false, motivo: 'Esta empresa ainda não tem dados contábeis salvos.' });
    return res.json({ sucesso: true, ...resumoDemonstracoes(payload, competencia), achados: achados.get(cnpj)?.itens || [] });
  });

  app.post('/api/demonstracoes/:cnpj/notas-modelo', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    semCache(res);
    const s = d.sessao(req); if (!s) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    const cnpj = cnpjDoAcesso(req, s, req.params.cnpj);
    if (!cnpj) return res.status(403).json({ sucesso: false, motivo: 'Este CNPJ não está vinculado ao seu acesso.' });
    if (!s.podeEscrever(cnpj)) return res.status(403).json({ sucesso: false, motivo: 'Seu acesso a esta empresa é só de leitura.' });
    const ano = Number(req.body?.ano);
    const normaPedida = String(req.body?.norma || '');
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ sucesso: false, motivo: 'Ano inválido.' });
    try {
      const r = await d.alterarWorkspace(cnpj, (payload) => {
        const empresa = { ...(payload.empresa || {}) } as EmpresaDados;
        if (empresa.notasExplicativas?.[String(ano)]) return { payload: null, resultado: 'existe' as const };
        const contas = payload.contas || [], lancs = payload.lancamentos || [];
        const ajustes = empresa.classificacaoDemonstracoes;
        const norma = (['NBC TG 1002', 'NBC TG 1001', 'NBC TG 1000'].includes(normaPedida) ? normaPedida : normaSugerida(dreResumida(contas, lancs, `${ano}-01`, `${ano}-12`, ajustes).receitaBruta)) as NormaPequenas;
        const cats = mapaCategorias(contas, ajustes);
        const b = balancoResumido(contas, lancs, `${ano}-12`, ajustes);
        const usa = (cat: string) => [...cats.values()].includes(cat as any);
        const capital = capitalSocialNoFim(contas, lancs, `${ano}-12`, ajustes);
        const notas = modeloNotasExplicativas(empresa, ano, norma, { capitalSocialCentavos: capital > 0 ? capital : undefined, estoques: usa('estoque') && b.estoques !== 0, imobilizado: usa('imobilizado'), emprestimos: usa('emprestimo_cp') || usa('emprestimo_lp') });
        if (!notasValidas(notas)) return { payload: null, resultado: 'invalida' as const };
        empresa.notasExplicativas = { ...(empresa.notasExplicativas || {}), [String(ano)]: notas };
        return { payload: { ...payload, empresa }, resultado: 'criada' as const };
      });
      if (r.resultado === 'existe') return res.json({ sucesso: true, mensagem: `As notas de ${ano} já existem; não mexi no que foi escrito. Abra a tela Demonstrações e relatórios para editar.` });
      if (r.resultado === 'invalida') return res.status(422).json({ sucesso: false, motivo: 'Não consegui montar o modelo das notas.' });
      return res.json({ sucesso: true, mensagem: `Modelo das notas explicativas de ${ano} preparado. Complete o que está entre colchetes na tela Demonstrações e relatórios.`, dados: r.dados, versao: r.versao });
    } catch (e: any) { return erroGravacao(res, e); }
  });

  let ultimo = 0;
  app.post('/api/demonstracoes/conferir-agora', mw.exigirOrigem, mw.exigirSessao, (req, res) => {
    semCache(res);
    if (!d.sessao(req)) return res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' });
    if (Date.now() - ultimo < 60_000) return res.status(429).json({ sucesso: false, motivo: 'A conferência acabou de rodar. Aguarde um minuto.' });
    const r = d.dispararRobo();
    if (!r.ok) return res.status(409).json({ sucesso: false, motivo: r.motivo || 'Não foi possível rodar agora.' });
    ultimo = Date.now();
    return res.json({ sucesso: true, mensagem: 'Conferência das demonstrações iniciada. O painel atualiza em instantes.' });
  });
}

/** Capital social no fim da competência (saldo credor das contas classificadas como capital). */
export function capitalSocialNoFim(contas: ContaPlano[], lancamentos: LancamentoContabil[], competencia: string, ajustes?: Record<string, string>): number {
  const codigos = [...mapaCategorias(contas, ajustes)].filter(([, c]) => c === 'capital').map(([k]) => k);
  if (!codigos.length) return 0;
  const s = saldosNoFimDe(contas, lancamentos, competencia);
  return codigos.reduce((t, c) => t - (s.get(c) ?? 0), 0);
}


// ---------------------------------------------------------------------------------------------------------------
// Recibo da ECD/ECF anexado pela contadora
// ---------------------------------------------------------------------------------------------------------------
const TIPOS_RECIBO: Record<string, string> = { pdf: 'application/pdf', rec: 'application/octet-stream', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
export const LIMITE_RECIBO_BYTES = 3 * 1024 * 1024;
/** Confere o pedido de anexo: obrigação, ano, nome e conteúdo (base64) de até 3 MB, nos formatos do recibo do PGE/ReceitaNet ou foto/print. */
export function validarReciboSped(corpo: any): { obrigacao: 'ECD' | 'ECF'; ano: number; nomeArquivo: string; tipo: string; conteudo: Buffer } | { erro: string } {
  const obrigacao = String(corpo?.obrigacao || ''); const ano = Number(corpo?.ano);
  if (!['ECD', 'ECF'].includes(obrigacao) || !Number.isInteger(ano) || ano < 2014 || ano > 2100) return { erro: 'Informe a obrigação (ECD ou ECF) e o ano.' };
  const nomeArquivo = String(corpo?.nomeArquivo || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120);
  const ext = (/\.([a-z0-9]+)$/i.exec(nomeArquivo)?.[1] || '').toLowerCase();
  if (!nomeArquivo || !TIPOS_RECIBO[ext]) return { erro: 'Anexe o recibo em PDF, .REC, .TXT ou imagem (PNG/JPG).' };
  const b64 = String(corpo?.arquivoBase64 || '').replace(/\s/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { erro: 'O arquivo do recibo não chegou inteiro. Tente de novo.' };
  const conteudo = Buffer.from(b64, 'base64');
  if (!conteudo.length || conteudo.length > LIMITE_RECIBO_BYTES) return { erro: 'O recibo deve ter conteúdo e no máximo 3 MB.' };
  return { obrigacao: obrigacao as 'ECD' | 'ECF', ano, nomeArquivo, tipo: TIPOS_RECIBO[ext], conteudo };
}
let tabelaRecibos: Promise<unknown> | null = null;
const prepararRecibos = (consultar: Consultar) => (tabelaRecibos ||= consultar(`CREATE TABLE IF NOT EXISTS contabil_recibos_sped (
  cnpj text NOT NULL, obrigacao text NOT NULL, ano integer NOT NULL, nome_arquivo text NOT NULL, tipo text NOT NULL, conteudo_base64 text NOT NULL,
  enviado_por text, enviado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, obrigacao, ano))`).catch((e) => { tabelaRecibos = null; throw e; }));
export async function gravarReciboSped(consultar: Consultar, r: { cnpj: string; obrigacao: 'ECD' | 'ECF'; ano: number; nomeArquivo: string; tipo: string; conteudo: Buffer; por: string }): Promise<void> {
  await prepararRecibos(consultar);
  await consultar(`INSERT INTO contabil_recibos_sped (cnpj,obrigacao,ano,nome_arquivo,tipo,conteudo_base64,enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (cnpj,obrigacao,ano) DO UPDATE SET nome_arquivo=EXCLUDED.nome_arquivo, tipo=EXCLUDED.tipo, conteudo_base64=EXCLUDED.conteudo_base64, enviado_por=EXCLUDED.enviado_por, enviado_em=now()`,
  [r.cnpj, r.obrigacao, r.ano, r.nomeArquivo, r.tipo, r.conteudo.toString('base64'), r.por]);
}
export async function lerReciboSped(consultar: Consultar, cnpj: string, obrigacao: 'ECD' | 'ECF', ano: number): Promise<{ nomeArquivo: string; tipo: string; conteudo: Buffer } | null> {
  await prepararRecibos(consultar);
  const r = await consultar('SELECT nome_arquivo, tipo, conteudo_base64 FROM contabil_recibos_sped WHERE cnpj=$1 AND obrigacao=$2 AND ano=$3', [cnpj, obrigacao, ano]);
  const l = r.rows[0];
  return l ? { nomeArquivo: String(l.nome_arquivo), tipo: String(l.tipo), conteudo: Buffer.from(String(l.conteudo_base64), 'base64') } : null;
}
