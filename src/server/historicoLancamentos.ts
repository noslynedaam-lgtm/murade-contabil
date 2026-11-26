// Histórico guardado no dia a dia (empresa que foi crescendo no Murade): guardar exercícios antigos, trazer o último de volta,
// conferir e o robô. Cada operação é UMA transação por empresa (trava por CNPJ); nada é apagado: o que sai do documento vai para
// a tabela do histórico e o que volta sai dela na mesma transação.
//  - Guardar: só exercício anterior ao ano atual, sem lançamento manual aguardando aprovação e sem rascunho do Fiscal/DP para
//    conferir naquele período. O saldo transportado é refeito somando o histórico inteiro (a mesma regra dos relatórios).
//  - Trazer de volta: o último exercício guardado volta para o documento (se couber).
//  - Conferir (Robô Conferidor do Histórico e Agente IA): histórico x marcador x saldo transportado, conta por conta; e o balancete
//    da migração (conta e mês) somando documento + histórico. Quando o histórico está certo e só o transporte/marcador ficou
//    diferente (ex.: restauração de backup), o robô refaz o transporte sozinho — é conta, não presunção.
import type { ContaPlano } from '../types';
import { AcumuladorHistorico, ehTransporteHistorico, LIMITES_DOCUMENTO, mapasIguais, partidasDeTransporte, saldosDoTransporte, type MarcadorHistorico } from '../utils/historicoContabil';
import type { BancoTransacional, ConsultaSql } from './exclusaoEmpresaCascata';
import { apagarHistorico, gravarMesHistorico, percorrerHistorico, prepararTabelaHistorico, resumoHistorico, TABELA_HISTORICO, type MesHistorico } from './historicoLancamentosStore';
import { ehLancamentoDoSistemaAnterior } from './migracaoSistemaAnterior/conferencia';

export class ErroHistorico extends Error { constructor(msg: string, readonly status = 409) { super(msg); } }

const mes = (l: any) => String(l?.data || '').slice(0, 7);

async function lerParaAlterar(q: ConsultaSql, cnpj: string) {
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
  const ws = await q('SELECT payload,version FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj]);
  if (!ws.rows.length) throw new ErroHistorico('A empresa não tem escrituração no Contábil.', 404);
  return ws.rows[0].payload as Record<string, any>;
}

/** Refaz o saldo transportado e o marcador somando o histórico inteiro (até o corte). */
async function transporteDoHistorico(q: ConsultaSql, cnpj: string, contas: ContaPlano[], corte: string, extra: any[] = []) {
  const acc = new AcumuladorHistorico(contas, corte);
  await percorrerHistorico(q, cnpj, (_c, l) => { for (const x of l) acc.adicionar(x); }, { ate: corte });
  for (const x of extra) acc.adicionar(x);
  return { acc, transporte: partidasDeTransporte(acc, contas, corte) };
}

function gravarPayload(q: ConsultaSql, cnpj: string, payload: Record<string, any>) {
  return q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1 RETURNING version,updated_at', [cnpj, JSON.stringify(payload)]);
}

/** Guarda no histórico os exercícios até `ateAno` (inclusive). */
export async function guardarExerciciosNoHistorico(banco: BancoTransacional, cnpj: string, ateAno: number, quem: string, validar: (p: Record<string, unknown>) => boolean, agora = new Date()): Promise<{ mensagem: string; guardados: number; ateCompetencia: string; versao: number }> {
  const anoAtual = Number(new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 4));
  if (!Number.isInteger(ateAno) || ateAno >= anoAtual || ateAno < 1990) throw new ErroHistorico(`Só dá para guardar exercícios anteriores a ${anoAtual}.`, 400);
  await prepararTabelaHistorico(banco.consultar);
  return banco.transacao(async (q) => {
    const payload = await lerParaAlterar(q, cnpj);
    const corteAntes = String(payload.historicoArquivado?.ateCompetencia || '');
    const corte = `${ateAno}-12`;
    if (corteAntes && corte <= corteAntes) throw new ErroHistorico(`Os exercícios até ${corteAntes.slice(0, 4)} já estão no histórico guardado.`, 400);
    const lancs: any[] = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
    const vao = lancs.filter((l) => !ehTransporteHistorico(l) && mes(l) && mes(l) <= corte);
    const ficam = lancs.filter((l) => !ehTransporteHistorico(l) && !(mes(l) && mes(l) <= corte));
    if (!vao.length) throw new ErroHistorico(`Não há lançamento até ${ateAno} no documento da empresa para guardar.`, 400);
    const pendente = vao.find((l) => l?.statusManual === 'pendente_aprovacao');
    if (pendente) throw new ErroHistorico(`Há lançamento manual aguardando aprovação em ${mes(pendente)} (${String(pendente.historico || pendente.id).slice(0, 80)}). Aprove ou rejeite antes de guardar o exercício.`);
    const pres: any[] = Array.isArray(payload.preLancamentos) ? payload.preLancamentos : [];
    const presVao = pres.filter((p) => String(p?.competencia || '') <= corte);
    const presPendente = presVao.find((p) => p?.status === 'pendente_conferencia');
    if (presPendente) throw new ErroHistorico(`Há rascunho do Fiscal/DP esperando conferência em ${presPendente.competencia}. Confira (ou descarte) antes de guardar o exercício.`);
    const contas: ContaPlano[] = Array.isArray(payload.contas) ? payload.contas : [];
    // Grava mês a mês (os do sistema anterior separados dos da equipe, para a remigração trocar só os seus).
    const meses = new Map<string, { migracao: any[]; escritorio: any[]; pres: any[] }>();
    const de = (c: string) => { if (!meses.has(c)) meses.set(c, { migracao: [], escritorio: [], pres: [] }); return meses.get(c)!; };
    for (const l of vao) de(mes(l))[ehLancamentoDoSistemaAnterior(l) ? 'migracao' : 'escritorio'].push(l);
    for (const p of presVao) de(String(p.competencia)).pres.push(p);
    let t: Awaited<ReturnType<typeof transporteDoHistorico>>;
    try { t = await transporteDoHistorico(q, cnpj, contas, corte, vao); } catch (e: any) { throw new ErroHistorico(String(e?.message || e)); }
    for (const [c, x] of [...meses].sort((a, b) => a[0].localeCompare(b[0]))) {
      const lista: MesHistorico[] = [];
      if (x.migracao.length) lista.push({ competencia: c, origem: 'migracao', lancamentos: x.migracao });
      if (x.escritorio.length || x.pres.length) lista.push({ competencia: c, origem: 'escritorio', lancamentos: x.escritorio, preLancamentos: x.pres });
      for (const m of lista) {
        const ja = await q(`SELECT 1 FROM ${TABELA_HISTORICO} WHERE cnpj=$1 AND competencia=$2 AND origem=$3 LIMIT 1`, [cnpj, m.competencia, m.origem]);
        if (ja.rows.length) throw new ErroHistorico(`O mês ${m.competencia} já tem lançamentos no histórico guardado; nada foi alterado. Fale com o suporte.`);
        await gravarMesHistorico(q, cnpj, m, quem);
      }
    }
    const marcador: MarcadorHistorico = {
      ateCompetencia: corte, desdeCompetencia: t.acc.desde || corte, quantidade: t.acc.quantidade, debitosCentavos: t.acc.debitosCentavos,
      transportes: t.transporte.length, atualizadoEm: agora.toISOString(), motivo: payload.historicoArquivado?.motivo === 'migracao' ? 'migracao' : 'exercicio',
    };
    const novo = { ...payload, lancamentos: [...t.transporte, ...ficam], preLancamentos: pres.filter((p) => !presVao.includes(p)), historicoArquivado: marcador };
    if (!validar(novo)) throw new ErroHistorico('O documento da empresa não passou na validação depois de guardar; nada foi alterado.');
    const r = await gravarPayload(q, cnpj, novo);
    return { mensagem: `Exercícios até ${ateAno} guardados no histórico (${vao.length} lançamento(s) saíram do documento; o saldo foi transportado para ${ateAno + 1}). Os relatórios desses anos ficam em "Exercício consultado".`, guardados: vao.length, ateCompetencia: corte, versao: Number(r.rows[0]?.version) };
  });
}

/** Traz o último exercício guardado de volta para o documento (se couber). */
export async function trazerExercicioDeVolta(banco: BancoTransacional, cnpj: string, quem: string, validar: (p: Record<string, unknown>) => boolean, agora = new Date()): Promise<{ mensagem: string; voltaram: number; versao: number }> {
  await prepararTabelaHistorico(banco.consultar);
  return banco.transacao(async (q) => {
    const payload = await lerParaAlterar(q, cnpj);
    const corte = String(payload.historicoArquivado?.ateCompetencia || '');
    if (!corte) throw new ErroHistorico('Esta empresa não tem exercício guardado no histórico.', 400);
    const ano = corte.slice(0, 4);
    const voltam: any[] = []; const presVoltam: any[] = [];
    await percorrerHistorico(q, cnpj, (_c, l, p) => { voltam.push(...l); presVoltam.push(...p); }, { desde: `${ano}-01`, ate: corte });
    const lancs: any[] = (Array.isArray(payload.lancamentos) ? payload.lancamentos : []).filter((l: any) => !ehTransporteHistorico(l));
    if (lancs.length + voltam.length > LIMITES_DOCUMENTO.lancamentos) throw new ErroHistorico(`O exercício de ${ano} tem ${voltam.length} lançamento(s) e não cabe de volta no documento da empresa (até ${LIMITES_DOCUMENTO.lancamentos}). Ele continua no histórico e pode ser consultado em "Exercício consultado".`);
    await q(`DELETE FROM ${TABELA_HISTORICO} WHERE cnpj=$1 AND competencia >= $2 AND competencia <= $3`, [cnpj, `${ano}-01`, corte]);
    const restante = await resumoHistorico(q, cnpj);
    const contas: ContaPlano[] = Array.isArray(payload.contas) ? payload.contas : [];
    const novoCorte = `${Number(ano) - 1}-12`;
    let novo: Record<string, any>;
    voltam.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)));
    if (restante.quantidade || restante.anos.length) {
      let t: Awaited<ReturnType<typeof transporteDoHistorico>>;
      try { t = await transporteDoHistorico(q, cnpj, contas, novoCorte); } catch (e: any) { throw new ErroHistorico(String(e?.message || e)); }
      const marcador: MarcadorHistorico = { ...payload.historicoArquivado, ateCompetencia: novoCorte, desdeCompetencia: t.acc.desde || novoCorte, quantidade: t.acc.quantidade, debitosCentavos: t.acc.debitosCentavos, transportes: t.transporte.length, atualizadoEm: agora.toISOString() };
      novo = { ...payload, lancamentos: [...t.transporte, ...voltam, ...lancs], preLancamentos: [...presVoltam, ...(payload.preLancamentos || [])], historicoArquivado: marcador };
    } else {
      novo = { ...payload, lancamentos: [...voltam, ...lancs], preLancamentos: [...presVoltam, ...(payload.preLancamentos || [])] };
      delete novo.historicoArquivado;
    }
    if (!validar(novo)) throw new ErroHistorico(`O exercício de ${ano} não cabe de volta no documento da empresa (tamanho). Ele continua no histórico.`);
    const r = await gravarPayload(q, cnpj, novo);
    return { mensagem: `O exercício de ${ano} voltou para o documento da empresa (${voltam.length} lançamento(s)); pode ser alterado de novo.`, voltaram: voltam.length, versao: Number(r.rows[0]?.version) };
  });
}

export interface ConferenciaHistorico {
  cnpj: string; temHistorico: boolean; bate: boolean; ateCompetencia: string; lancamentos: number; meses: number;
  transporteBate: boolean; marcadorBate: boolean; foraDoCorte: number; diferencasTransporte: Array<{ conta: string; esperado: number; atual: number }>;
  /** Refazer o transporte resolve (o histórico está inteiro e o documento não tem nada no período guardado). */
  refazivel: boolean; resumo: string;
}

/** Confere o histórico guardado de UMA empresa: o marcador e o saldo transportado têm de ser a soma exata do histórico. Só lê. */
export async function conferirHistoricoEmpresa(consultar: ConsultaSql, cnpj: string, payloadLido?: Record<string, any>): Promise<ConferenciaHistorico> {
  const payload = payloadLido || (await consultar('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj])).rows[0]?.payload || {};
  const res = await resumoHistorico(consultar, cnpj);
  const marcador = payload.historicoArquivado as MarcadorHistorico | undefined;
  const base: ConferenciaHistorico = { cnpj, temHistorico: Boolean(marcador || res.quantidade || res.anos.length), bate: true, ateCompetencia: marcador?.ateCompetencia || '', lancamentos: res.quantidade, meses: 0, transporteBate: true, marcadorBate: true, foraDoCorte: 0, diferencasTransporte: [], refazivel: false, resumo: '' };
  if (!base.temHistorico) return { ...base, resumo: 'Esta empresa não tem exercício guardado no histórico (está inteira no documento).' };
  const lancsDoc: any[] = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
  const corte = marcador?.ateCompetencia || (res.ate ? `${res.ate.slice(0, 4)}-12` : '');
  const contas: ContaPlano[] = Array.isArray(payload.contas) ? payload.contas : [];
  const acc = new AcumuladorHistorico(contas, corte);
  let foraDoCorte = 0; const meses = new Set<string>();
  await percorrerHistorico(consultar, cnpj, (c, l) => { meses.add(c); if (c > corte) foraDoCorte += l.length; for (const x of l) acc.adicionar(x); });
  const tr = saldosDoTransporte(lancsDoc);
  const difs = [...mapasIguais(acc.normal, tr.normal), ...mapasIguais(acc.encerramento, tr.encerramento).map((d) => ({ ...d, conta: `${d.conta} (encerramento)` }))];
  const transporteBate = difs.length === 0 && acc.ladosForaDaAbertura.length === 0;
  const marcadorBate = Boolean(marcador) && marcador!.quantidade === acc.quantidade && marcador!.debitosCentavos === acc.debitosCentavos && marcador!.transportes === lancsDoc.filter((l) => ehTransporteHistorico(l)).length;
  const docNoPeriodo = lancsDoc.filter((l) => !ehTransporteHistorico(l) && mes(l) && mes(l) <= corte).length;
  const bate = transporteBate && marcadorBate && foraDoCorte === 0 && docNoPeriodo === 0;
  const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let resumo: string;
  if (bate) resumo = `Histórico guardado confere: ${acc.quantidade} lançamento(s) de ${acc.desde.split('-').reverse().join('/')} a ${corte.split('-').reverse().join('/')} em ${meses.size} mês(es); o saldo transportado é exatamente a soma do histórico em todas as contas.`;
  else {
    const p: string[] = [];
    if (!marcador) p.push('o documento não tem a marca do histórico');
    else if (!marcadorBate) p.push(`a marca do documento diz ${marcador.quantidade} lançamento(s) e o histórico tem ${acc.quantidade}`);
    if (difs.length) p.push(`${difs.length} conta(s) com saldo transportado diferente do histórico (ex.: ${difs[0].conta}: histórico ${reais(difs[0].esperado)}, transporte ${reais(difs[0].atual)})`);
    if (acc.ladosForaDaAbertura.length) p.push(`a conta ${acc.ladosForaDaAbertura[0].conta} tem saldo inicial depois de lançamento guardado`);
    if (foraDoCorte) p.push(`${foraDoCorte} lançamento(s) do histórico estão depois do corte`);
    if (docNoPeriodo) p.push(`${docNoPeriodo} lançamento(s) do documento caem no período guardado`);
    resumo = `Histórico guardado NÃO confere: ${p.join('; ')}.`;
  }
  const refazivel = !bate && foraDoCorte === 0 && docNoPeriodo === 0 && acc.ladosForaDaAbertura.length === 0 && /^\d{4}-12$/.test(corte);
  return { ...base, bate, ateCompetencia: corte, lancamentos: acc.quantidade, meses: meses.size, transporteBate, marcadorBate, foraDoCorte, diferencasTransporte: difs.slice(0, 50), refazivel, resumo };
}

/** Refaz o saldo transportado e o marcador a partir do histórico (quando a conferência diz que é refazível). */
export async function refazerTransporte(banco: BancoTransacional, cnpj: string, validar: (p: Record<string, unknown>) => boolean, agora = new Date()): Promise<boolean> {
  return banco.transacao(async (q) => {
    const payload = await lerParaAlterar(q, cnpj);
    const c = await conferirHistoricoEmpresa(q, cnpj, payload);
    if (c.bate || !c.refazivel) return false;
    const contas: ContaPlano[] = Array.isArray(payload.contas) ? payload.contas : [];
    const t = await transporteDoHistorico(q, cnpj, contas, c.ateCompetencia);
    const marcador: MarcadorHistorico = { ateCompetencia: c.ateCompetencia, desdeCompetencia: t.acc.desde || c.ateCompetencia, quantidade: t.acc.quantidade, debitosCentavos: t.acc.debitosCentavos, transportes: t.transporte.length, atualizadoEm: agora.toISOString(), motivo: payload.historicoArquivado?.motivo === 'exercicio' ? 'exercicio' : 'migracao' };
    const novo = { ...payload, lancamentos: [...t.transporte, ...(payload.lancamentos || []).filter((l: any) => !ehTransporteHistorico(l))], historicoArquivado: marcador };
    if (!validar(novo)) return false;
    await gravarPayload(q, cnpj, novo);
    return true;
  });
}

/** Empresas com histórico guardado ou com o marcador (para o robô). */
export async function empresasComHistorico(consultar: ConsultaSql): Promise<string[]> {
  await prepararTabelaHistorico(consultar);
  const r = await consultar(`SELECT DISTINCT cnpj FROM ${TABELA_HISTORICO} UNION SELECT cnpj FROM contabil_company_workspaces WHERE payload ? 'historicoArquivado' ORDER BY 1`, []);
  return r.rows.map((x) => String(x.cnpj));
}

/** Empresas cujo documento passou de 85% do teto (o robô guarda sozinho os exercícios de até dois anos atrás). */
export async function empresasPertoDoTeto(consultar: ConsultaSql): Promise<Array<{ cnpj: string; lancamentos: number; bytes: number }>> {
  // Só mede o texto de quem já é grande no banco (o tamanho guardado é comprimido; a conta exata vem depois).
  const r = await consultar(`SELECT cnpj, n, t FROM (SELECT cnpj, jsonb_array_length(COALESCE(payload->'lancamentos','[]'::jsonb))::int AS n, octet_length(payload::text)::bigint AS t FROM contabil_company_workspaces WHERE pg_column_size(payload) > 500000) x WHERE n > $1 OR t > $2`, [Math.floor(LIMITES_DOCUMENTO.lancamentos * 0.85), Math.floor(LIMITES_DOCUMENTO.bytes * 0.85)]);
  return r.rows.map((x) => ({ cnpj: String(x.cnpj), lancamentos: Number(x.n), bytes: Number(x.t) }));
}

export interface DepsRoboHistorico {
  banco: () => BancoTransacional; consultar: ConsultaSql; validar: (p: Record<string, unknown>) => boolean; bancoConfigurado: () => boolean;
  robos: { executarRobo: (id: string, fn: () => Promise<void>) => Promise<unknown>; registrarResultadoRobo: (id: string, texto: string) => void; definirAlertaRobo: (id: string, alerta: { nivel: 'aviso' | 'critico'; texto: string } | null) => void };
  agora?: () => Date;
}
export const ID_ROBO_HISTORICO = 'conferidor_historico_guardado';

/** Robô Conferidor do Histórico Guardado (rotina e "Rodar agora"). */
export function rotinaRoboHistorico(dep: DepsRoboHistorico): () => Promise<unknown> | undefined {
  return () => dep.bancoConfigurado() ? dep.robos.executarRobo(ID_ROBO_HISTORICO, async () => {
    const agora = dep.agora?.() || new Date();
    const anoAtual = Number(new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 4));
    // 1) Documento perto do teto: guarda sozinho os exercícios de até dois anos atrás (o ano anterior fica aberto para ECD/ECF).
    const guardadas: string[] = []; const naoGuardou: string[] = [];
    for (const e of await empresasPertoDoTeto(dep.consultar).catch(() => [])) {
      try { const r = await guardarExerciciosNoHistorico(dep.banco(), e.cnpj, anoAtual - 2, 'Robô do Histórico Guardado', dep.validar, agora); guardadas.push(`${e.cnpj}: ${r.guardados} lançamento(s) até ${anoAtual - 2}`); }
      catch (err: any) { if (!/já estão no histórico|Não há lançamento/.test(String(err?.message))) naoGuardou.push(`${e.cnpj}: ${String(err?.message || err).slice(0, 160)}`); }
    }
    // 2) Confere cada empresa com histórico; refaz o transporte quando o histórico está inteiro e só o documento ficou diferente.
    const cnpjs = await empresasComHistorico(dep.consultar);
    const problemas: string[] = []; const refeitas: string[] = []; let lancamentos = 0;
    for (const cnpj of cnpjs) {
      let c = await conferirHistoricoEmpresa(dep.consultar, cnpj).catch((err) => { problemas.push(`${cnpj}: ${String((err as Error)?.message || err).slice(0, 120)}`); return null; });
      if (!c) continue;
      if (!c.bate && c.refazivel && await refazerTransporte(dep.banco(), cnpj, dep.validar, agora).catch(() => false)) {
        refeitas.push(cnpj); c = await conferirHistoricoEmpresa(dep.consultar, cnpj);
      }
      lancamentos += c.lancamentos;
      if (!c.bate) problemas.push(`${cnpj}: ${c.resumo}`);
    }
    let texto = !cnpjs.length ? 'Nenhuma empresa com exercício guardado no histórico (todas cabem inteiras no documento).'
      : problemas.length ? `${problemas.length} de ${cnpjs.length} empresa(s) com histórico guardado NÃO conferem. ${problemas.slice(0, 3).join(' | ')}`
        : `${cnpjs.length} empresa(s) com histórico guardado conferida(s) (${lancamentos} lançamento(s)): o saldo transportado é exatamente a soma do histórico em todas.`;
    if (refeitas.length) texto += ` Refiz sozinho o saldo transportado de ${refeitas.length} empresa(s) a partir do histórico (${refeitas.slice(0, 5).join(', ')}).`;
    if (guardadas.length) texto += ` Documento perto do limite: guardei no histórico ${guardadas.join('; ')}.`;
    if (naoGuardou.length) texto += ` Não consegui guardar (precisa do escritório): ${naoGuardou.slice(0, 3).join(' | ')}.`;
    dep.robos.registrarResultadoRobo(ID_ROBO_HISTORICO, texto);
    dep.robos.definirAlertaRobo(ID_ROBO_HISTORICO, problemas.length || naoGuardou.length ? { nivel: 'aviso', texto } : null);
  }).catch((e) => console.error('Falha no Robô Conferidor do Histórico Guardado:', (e as Error)?.message || e)) : undefined;
}

export { apagarHistorico };
