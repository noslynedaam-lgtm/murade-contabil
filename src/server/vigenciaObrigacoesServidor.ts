// Robô diário de vigência das obrigações, conferidor e rotas da tela "Vigência das obrigações" (com "Obrigações encerradas").
// A lista e as regras ficam em src/utils/vigenciaObrigacoes.ts (a mesma nos três sistemas). Aqui:
// - Robô de Vigência (1x por dia e "Rodar agora"): confere o estado de cada item, grava os avisos de 30 dias antes (acaba, começa,
//   muda), sem repetir, e manda ao celular de cada escritório. Nunca apaga código nem dado: só esconde e desliga por data.
// - Conferidor de Vigência: confere se alguma tela ou robô ainda gera obrigação encerrada (as conferências vêm de cada sistema).
// A lista é a lei (igual para todos os escritórios); nada de um escritório aparece para outro.
import type { Express, RequestHandler } from 'express';
import {
  FONTES_VIGENCIA, VIGENCIA_OBRIGACOES, avisosVigencia, estadoNoDia, itensDoSistema, obrigacoesEncerradas, resumoItem,
  type AvisoVigencia, type SistemaMurad,
} from '../utils/vigenciaObrigacoes';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface ProblemaVigencia { onde: string; texto: string }
/** Uma conferência do sistema: devolve o que ainda gera (ou guardou) obrigação encerrada. */
export type ConferenciaVigencia = { nome: string; conferir: (hoje: string) => Promise<ProblemaVigencia[]> | ProblemaVigencia[] };

const prontas = new WeakMap<Consultar, Promise<void>>();
export function prepararVigencia(consultar: Consultar): Promise<void> {
  let p = prontas.get(consultar);
  if (!p) {
    p = consultar(`CREATE TABLE IF NOT EXISTS murade_vigencia_avisos (
      chave text PRIMARY KEY, sistema text NOT NULL, item text NOT NULL, tipo text NOT NULL, data date NOT NULL,
      titulo text NOT NULL, texto text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(), push_em timestamptz)`).then(() => undefined)
      .catch((e) => { prontas.delete(consultar); throw e; });
    prontas.set(consultar, p);
  }
  return p;
}

export interface EtapaVigencia { etapa: number; total: number; texto: string }
export interface ResultadoRoboVigencia { hoje: string; itens: number; vigentes: number; encerradas: number; futuras: number; avisosNovos: number; avisosAtivos: AvisoVigencia[]; enviados: number; resumo: string; atencao: boolean }
export interface OpcoesRoboVigencia {
  sistema: SistemaMurad; hoje: string;
  /** Manda o aviso ao celular de todos os escritórios; devolve quantos receberam. Sem isto o aviso fica só na tela. */
  enviarAviso?: (aviso: { titulo: string; corpo: string }) => Promise<number>;
  aoAndar?: (e: EtapaVigencia) => void;
}
let ultimaRodada: (ResultadoRoboVigencia & { em: string }) | null = null;
let ultimaConferencia: (ResultadoConferidorVigencia & { em: string }) | null = null;
export const ultimaRodadaVigencia = () => ultimaRodada;
export const ultimaConferenciaVigencia = () => ultimaConferencia;

/** Robô de Vigência. Só lê a lista e grava avisos (sem repetir pela chave item|tipo|data). */
export async function rodarRoboVigencia(consultar: Consultar, o: OpcoesRoboVigencia): Promise<ResultadoRoboVigencia> {
  const andar = (etapa: number, texto: string) => o.aoAndar?.({ etapa, total: 4, texto });
  andar(1, 'Lendo a lista de vigência…');
  await prepararVigencia(consultar);
  const itens = itensDoSistema(o.sistema);
  andar(2, 'Conferindo o que começa, o que acaba e o que já encerrou…');
  const estados = itens.map((i) => estadoNoDia(i, o.hoje));
  andar(3, 'Gravando os avisos de 30 dias antes…');
  const ativos = avisosVigencia(o.sistema, o.hoje);
  const novos: AvisoVigencia[] = [];
  for (const a of ativos) {
    const r = await consultar(`INSERT INTO murade_vigencia_avisos(chave, sistema, item, tipo, data, titulo, texto) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (chave) DO NOTHING RETURNING chave`,
      [a.chave, o.sistema, a.id, a.tipo, a.data, a.titulo, a.texto]);
    if (r.rows.length) novos.push(a);
  }
  andar(4, 'Mandando os avisos novos…');
  let enviados = 0;
  // Também reenvia o que ficou sem push (ex.: celular sem assinatura na hora): no máximo uma vez por aviso.
  const semPush = (await consultar(`SELECT chave, titulo, texto FROM murade_vigencia_avisos WHERE sistema=$1 AND push_em IS NULL AND data >= $2::date ORDER BY data LIMIT 20`, [o.sistema, o.hoje])).rows;
  if (o.enviarAviso) for (const a of semPush) {
    try { enviados += await o.enviarAviso({ titulo: String(a.titulo).slice(0, 120), corpo: String(a.texto).slice(0, 200) }); await consultar('UPDATE murade_vigencia_avisos SET push_em=now() WHERE chave=$1', [a.chave]); }
    catch { /* fica na tela; tenta na próxima rodada */ }
  }
  const r: ResultadoRoboVigencia = {
    hoje: o.hoje, itens: itens.length, vigentes: estados.filter((e) => e === 'vigente').length, encerradas: estados.filter((e) => e === 'encerrada').length,
    futuras: estados.filter((e) => e === 'futura').length, avisosNovos: novos.length, avisosAtivos: ativos, enviados, atencao: ativos.length > 0, resumo: '',
  };
  r.resumo = `${r.itens} obrigação(ões) conferida(s): ${r.vigentes} vigente(s), ${r.encerradas} encerrada(s) (períodos antigos em "Obrigações encerradas"), ${r.futuras} que ainda vão começar; ${ativos.length} aviso(s) dos próximos 30 dias (${r.avisosNovos} novo(s)${o.enviarAviso ? `, ${enviados} envio(s) ao celular` : ''}). Nada é apagado: só esconde e desliga por data.`;
  ultimaRodada = { ...r, em: new Date().toISOString() };
  return r;
}

export interface ResultadoConferidorVigencia { conferencias: number; problemas: ProblemaVigencia[]; falhas: string[]; resumo: string; atencao: boolean }
/** Conferidor: alguma tela ou robô deste sistema ainda gera obrigação encerrada? Só lê. */
export async function conferirVigencia(conferencias: ConferenciaVigencia[], hoje: string): Promise<ResultadoConferidorVigencia> {
  const problemas: ProblemaVigencia[] = []; const falhas: string[] = [];
  for (const c of conferencias) {
    try { problemas.push(...(await c.conferir(hoje))); }
    catch (e: any) { falhas.push(`${c.nome}: ${String(e?.message || e).slice(0, 160)}`); }
  }
  const r: ResultadoConferidorVigencia = { conferencias: conferencias.length, problemas, falhas, atencao: problemas.length > 0 || falhas.length > 0, resumo: '' };
  r.resumo = problemas.length || falhas.length
    ? `${problemas.length} lugar(es) ainda gerando obrigação encerrada: ${problemas.slice(0, 4).map((p) => `${p.onde} — ${p.texto}`).join('; ')}${falhas.length ? `; ${falhas.length} conferência(s) não rodaram (${falhas.slice(0, 2).join('; ')})` : ''}.`
    : `${conferencias.length} conferência(s): nenhuma tela ou robô gera obrigação encerrada nos períodos novos.`;
  ultimaConferencia = { ...r, em: new Date().toISOString() };
  return r;
}

/** Dados da tela e da Agente: a lista toda (com o que é deste sistema), as encerradas, os avisos e a última rodada. */
export async function dadosVigencia(consultar: Consultar | null, sistema: SistemaMurad, hoje: string) {
  let historico: Array<{ titulo: string; texto: string; data: string; criadoEm: string }> = [];
  if (consultar) {
    try {
      await prepararVigencia(consultar);
      historico = (await consultar(`SELECT titulo, texto, data, criado_em FROM murade_vigencia_avisos WHERE sistema=$1 ORDER BY criado_em DESC LIMIT 30`, [sistema])).rows
        .map((x: any) => ({ titulo: String(x.titulo), texto: String(x.texto), data: new Date(x.data).toISOString().slice(0, 10), criadoEm: new Date(x.criado_em).toISOString() }));
    } catch { /* sem banco: só a lista */ }
  }
  return {
    hoje, sistema,
    itens: VIGENCIA_OBRIGACOES.map((i) => ({ ...resumoItem(i, hoje), desteSistema: i.sistemas.includes(sistema) })),
    encerradas: obrigacoesEncerradas(sistema, hoje), avisos: avisosVigencia(sistema, hoje), historico,
    ultimaRodada, ultimaConferencia, prazoGuarda: FONTES_VIGENCIA.ctn,
  };
}

export interface ConfigRotasVigencia {
  sistema: SistemaMurad; consultar: Consultar | null; hoje: () => string;
  /** Middlewares de sessão (leitura) e de escrita (rodar agora) do sistema. */
  exigirLeitura: RequestHandler[]; exigirEscrita: RequestHandler[];
  rodar: (aoAndar?: (e: EtapaVigencia) => void) => Promise<{ robo: ResultadoRoboVigencia; conferidor: ResultadoConferidorVigencia }>;
}
export function registrarRotasVigencia(app: Express, cfg: ConfigRotasVigencia): void {
  app.get('/api/vigencia-obrigacoes', ...cfg.exigirLeitura, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json({ sucesso: true, ...(await dadosVigencia(cfg.consultar, cfg.sistema, cfg.hoje())) }); }
    catch (e: any) { console.error('Vigência das obrigações:', e?.message || e); res.status(500).json({ sucesso: false, motivo: 'Não foi possível ler agora.' }); }
  });
  app.post('/api/vigencia-obrigacoes/rodar', ...cfg.exigirEscrita, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const etapas: EtapaVigencia[] = [];
      const r = await cfg.rodar((e) => etapas.push(e));
      res.json({ sucesso: true, etapas, robo: r.robo, conferidor: r.conferidor, mensagem: `${r.robo.resumo} ${r.conferidor.resumo}` });
    } catch (e: any) { console.error('Robô de Vigência (rodar agora):', e?.message || e); res.status(500).json({ sucesso: false, motivo: 'Não foi possível rodar agora.' }); }
  });
}

/** Texto curto para a Agente IA (ferramenta consultar_vigencia_obrigacoes). */
export function textoAgenteVigencia(d: Awaited<ReturnType<typeof dadosVigencia>>) {
  const br = (x: string | null) => (x ? x.split('-').reverse().join('/') : '—');
  return {
    acabam: d.itens.filter((i) => i.fim && i.desteSistema).map((i) => `${i.nome}: último período ${i.fim}, ${i.estado === 'vigente' ? `sai dos períodos novos em ${br(i.encerraEm)}` : i.estado === 'encerrada' ? `encerrada (períodos antigos em "Obrigações encerradas" até ${br(i.saiDeVezEm)})` : 'já saiu de vez'} — ${i.fonteFim?.nome ?? 'sem fonte'}`),
    comecam: d.itens.filter((i) => i.inicio && i.desteSistema).map((i) => `${i.nome}: começa no período ${i.inicio} — ${i.fonteInicio?.nome ?? 'sem fonte'}`),
    mudam: d.itens.filter((i) => i.mudanca && i.desteSistema).map((i) => `${i.nome}: ${i.mudanca!.texto} (${i.mudanca!.fonte.nome})`),
    semFonte: d.itens.filter((i) => i.pendencia && i.desteSistema).map((i) => `${i.nome}: ${i.pendencia}`),
    encerradas: d.encerradas.map((e) => `${e.nome}: períodos ${e.disponivelDe} a ${e.disponivelAte} ainda disponíveis para retificar, consultar e entregar em atraso, até ${br(e.saiDeVezEm)}`),
    avisos: d.avisos.map((a) => `${a.titulo} (faltam ${a.dias} dia(s))`),
    ultimaRodada: d.ultimaRodada?.resumo ?? 'o robô ainda não rodou desde a última publicação',
    conferidor: d.ultimaConferencia?.resumo ?? 'o conferidor ainda não rodou desde a última publicação',
  };
}
