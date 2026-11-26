// Junção da migração com o HISTÓRICO GUARDADO (empresa grande, com anos de movimento).
//
// Empresa que cabe inteira no documento (até 20.000 lançamentos e 3,9 MB, como sempre foi): nada muda — a junção é a de
// mesclagem.ts, sem histórico. Empresa maior: os exercícios antigos (até o fim do ano anterior aos exercícios em aberto) vão
// para a tabela do histórico (historicoLancamentosStore.ts), mês a mês, e o documento fica com os exercícios em aberto e o
// saldo transportado (utils/historicoContabil.ts). Tudo: nenhum lançamento fica para trás, nada é presumido.
//  - Empresa lida em partes (conversor: PartesLancamentos) é convertida ano a ano: cada ano antigo é convertido, gravado e
//    solto da memória antes do próximo.
//  - A conferência (balancete por conta e mês x backup) soma o documento e o histórico, lançamento a lançamento.
//  - O que a equipe já tinha guardado no histórico volta para a junção (remigrar não perde o trabalho da equipe).
// Quem grava passa `saida`; a prévia não passa (nada é gravado).
import type { LancamentoContabil } from '../../types';
import { AcumuladorHistorico, bytesDoLancamento, ehTransporteHistorico, escolherCorte, LIMITES_DOCUMENTO, partidasDeTransporte, type MarcadorHistorico } from '../../utils/historicoContabil';
import type { MesHistorico } from '../historicoLancamentosStore';
import { AcumuladorConferencia, ehLancamentoDoSistemaAnterior, type ResultadoConferencia } from './conferencia';
import type { DadosContabeisEmpresa, Linha, NaoEntrou } from './conversor';
import { mesclarMigracao, type ResultadoMesclagem } from './mesclagem';

export interface SaidaHistorico {
  gravarMes(mes: MesHistorico): Promise<void>;
  /** Linhas originais do arquivo de um ano (empresa lida em partes): vão para o registro do sistema anterior. */
  gravarOriginais(ano: string, linhas: Linha[]): Promise<void>;
}

export interface ResultadoJuncao extends ResultadoMesclagem {
  conferencia: ResultadoConferencia | null;
  /** Lançamentos que vieram do arquivo (documento + histórico). */
  lancamentosGravados: number;
  naoEntraram: NaoEntrou[];
  periodo: string;
  /** Até onde vai o histórico guardado (null = empresa inteira no documento). */
  historico: { ateCompetencia: string; lancamentos: number; doSistemaAnterior: number; daEquipe: number } | null;
}

export interface OpcoesJuncao {
  modelo: import('../../types').ContaPlano[];
  cadastroCompartilhado?: Record<string, any> | null;
  competenciaAtual: string;
  fechadas?: Set<string>;
  /** O que a equipe guardou no histórico antes (remigração). */
  historicoEscritorio?: { lancamentos: any[]; preLancamentos: any[] };
  agora?: Date;
}

const BYTES_POR_LANCAMENTO_ESTIMADO = 380;
const mes = (l: any) => String(l?.data || '').slice(0, 7);
const brData = (d: string) => d.split('-').reverse().join('/');

function referenciaConferencia(dados: DadosContabeisEmpresa, gravados: number, naoEntraram: number) {
  return { esperado: dados.esperado, esperadoLancamentos: dados.esperadoLancamentos, saldoFinalEsperado: dados.saldoFinalEsperado, lancamentosGravados: gravados, semSaldosParaConferir: dados.semSaldosParaConferir, linhasQueNaoEntraram: naoEntraram };
}

/** Agrupa por mês (e origem) para gravar no histórico. */
function porMes(lista: any[], origem: MesHistorico['origem'], pres: Map<string, any[]> = new Map()): MesHistorico[] {
  const m = new Map<string, any[]>();
  for (const l of lista) { const c = mes(l); if (!m.has(c)) m.set(c, []); m.get(c)!.push(l); }
  for (const c of pres.keys()) if (!m.has(c)) m.set(c, []);
  return [...m.keys()].sort().map((c) => ({ competencia: c, origem, lancamentos: m.get(c)!, preLancamentos: pres.get(c) || [] }));
}

export async function juntarComHistorico(atual: Record<string, any> | null, dados: DadosContabeisEmpresa, opcoes: OpcoesJuncao, saida?: SaidaHistorico): Promise<ResultadoJuncao> {
  const anoAtual = Number(opcoes.competenciaAtual.slice(0, 4));
  const fechadas = opcoes.fechadas || new Set<string>();
  // Documento de hoje sem o transporte (é refeito) e com o que a equipe tinha guardado no histórico (volta para a junção).
  const hist = opcoes.historicoEscritorio || { lancamentos: [], preLancamentos: [] };
  const base: Record<string, any> | null = atual ? (() => {
    const b: Record<string, any> = { ...atual };
    delete b.historicoArquivado;
    b.lancamentos = [...hist.lancamentos, ...(Array.isArray(atual.lancamentos) ? atual.lancamentos.filter((l: any) => !ehTransporteHistorico(l)) : [])];
    b.preLancamentos = [...hist.preLancamentos, ...(Array.isArray(atual.preLancamentos) ? atual.preLancamentos : [])];
    return b;
  })() : null;
  const vazio = (bloqueio: string): ResultadoJuncao => ({ payload: null, bloqueio, avisos: [], contasNovas: 0, contasAtualizadas: 0, contasDoModeloRetiradas: 0, historicosNovos: 0, lancamentosSubstituidos: 0, lancamentosDaEquipe: 0, conferencia: null, lancamentosGravados: 0, naoEntraram: [], periodo: '', historico: null });
  const comConferencia = (m: ResultadoMesclagem, lancs: LancamentoContabil[], naoEntr: NaoEntrou[]): ResultadoJuncao => {
    const conferencia = m.payload ? (() => { const a = new AcumuladorConferencia(m.payload!.contas); a.adicionarTodos(m.payload!.lancamentos); return a.resultado(referenciaConferencia(dados, lancs.length, naoEntr.length)); })() : null;
    return { ...m, conferencia, lancamentosGravados: lancs.length, naoEntraram: naoEntr, periodo: lancs.length ? `${brData(lancs[0].data)} a ${brData(lancs[lancs.length - 1].data)}` : '', historico: null };
  };
  const opcoesMesclar = { modelo: opcoes.modelo, cadastroCompartilhado: opcoes.cadastroCompartilhado, competenciaAtual: opcoes.competenciaAtual, fechadas };

  // Empresa que cabe inteira no documento como sempre coube (até 20.000 lançamentos e 3,9 MB): a junção de sempre, sem histórico.
  let inteira: ResultadoMesclagem | null = null;
  if (!dados.partes) {
    inteira = mesclarMigracao(base, dados, { ...opcoesMesclar, semLimiteDeTamanho: true });
    if (!inteira.payload) return { ...vazio(inteira.bloqueio || ''), ...inteira, conferencia: null, lancamentosGravados: 0, naoEntraram: dados.naoEntraram, periodo: '', historico: null };
    if (inteira.payload.lancamentos.length <= LIMITES_DOCUMENTO.lancamentosSemHistorico && Buffer.byteLength(JSON.stringify(inteira.payload), 'utf8') <= LIMITES_DOCUMENTO.bytesSemHistorico) {
      return comConferencia(inteira, dados.lancamentos, dados.naoEntraram);
    }
  }
  const daEquipeBase: any[] = Array.isArray(base?.lancamentos) ? base!.lancamentos.filter((l: any) => !ehLancamentoDoSistemaAnterior(l)) : [];
  const presBase: any[] = Array.isArray(base?.preLancamentos) ? base!.preLancamentos : [];

  // ---- tamanho por ano (o que iria para o documento) ----
  const porAno = new Map<number, { quantidade: number; bytes: number }>();
  const somarAno = (ano: number, q: number, b: number) => { const x = porAno.get(ano) ?? { quantidade: 0, bytes: 0 }; x.quantidade += q; x.bytes += b; porAno.set(ano, x); };
  if (dados.partes) for (const [ano, linhas] of dados.partes.linhasPorAno) { const q = Math.ceil(linhas / 2); somarAno(Number(ano) || 0, q, q * BYTES_POR_LANCAMENTO_ESTIMADO); }
  else for (const l of dados.lancamentos) somarAno(Number(mes(l).slice(0, 4)) || 0, 1, bytesDoLancamento(l));
  for (const l of daEquipeBase) somarAno(Number(mes(l).slice(0, 4)) || 0, 1, bytesDoLancamento(l));
  const resto = { ...(base || {}), lancamentos: [], preLancamentos: [] };
  const extra = { quantidade: 0, bytes: Buffer.byteLength(JSON.stringify(resto)) + presBase.reduce((s, p) => s + bytesDoLancamento(p), 0) + Buffer.byteLength(JSON.stringify(dados.contas)) };
  const escolha = escolherCorte(porAno, anoAtual, extra);
  if (escolha && 'erro' in escolha) return vazio(`${escolha.erro} Nada foi gravado.`);
  const corte = escolha && 'corte' in escolha ? escolha.corte : null;
  // Os exercícios em aberto já são todos os anos da empresa: fica inteira no documento (até o teto do documento).
  if (!corte && inteira) {
    const lim = mesclarMigracao(base, dados, opcoesMesclar);
    return comConferencia(lim, dados.lancamentos, dados.naoEntraram);
  }

  // ---- lançamentos do arquivo que ficam no documento ----
  const naoEntraram: NaoEntrou[] = [...dados.naoEntraram];
  let docMig: LancamentoContabil[];
  const anosArquivoAntigos: string[] = [];
  if (!dados.partes) docMig = corte ? dados.lancamentos.filter((l) => mes(l) > corte) : dados.lancamentos;
  else {
    docMig = [];
    for (const ano of dados.partes.linhasPorAno.keys()) {
      if (corte && ano && `${ano}-12` <= corte) { anosArquivoAntigos.push(ano); continue; }
      const r = await dados.partes.converterAno(ano);
      for (const l of r.lancamentos) docMig.push(l);
      naoEntraram.push(...r.naoEntraram);
      if (saida) await saida.gravarOriginais(ano, r.originais);
    }
  }
  if (!corte) return comConferencia(mesclarMigracao(base, { ...dados, lancamentos: docMig }, opcoesMesclar), docMig, naoEntraram);

  // ---- com histórico: junta o documento (exercícios em aberto) ----
  const migAntigos = dados.partes ? [] : dados.lancamentos.filter((l) => mes(l) <= corte);
  const fechadaAntiga = migAntigos.find((l) => fechadas.has(mes(l)));
  if (fechadaAntiga) return vazio(`A competência ${mes(fechadaAntiga)} está fechada no Murad e tem lançamentos do sistema anterior. Reabra a competência (ou deixe como está) antes de migrar esta empresa.`);
  const m = mesclarMigracao(base, { ...dados, lancamentos: docMig }, { ...opcoesMesclar, semLimiteDeTamanho: true });
  if (!m.payload) return { ...vazio(m.bloqueio || ''), ...m, conferencia: null, lancamentosGravados: 0, naoEntraram, periodo: '', historico: null };
  const payload = m.payload;
  const contas = payload.contas;
  // Lançamentos da equipe de exercícios antigos também vão para o histórico (menos os que ainda aguardam aprovação).
  const equipeAntigos: any[] = []; const doc: any[] = [];
  for (const l of payload.lancamentos as any[]) {
    if (mes(l) <= corte && !ehLancamentoDoSistemaAnterior(l)) {
      if (l?.statusManual === 'pendente_aprovacao') return vazio(`Há lançamento manual aguardando aprovação em ${mes(l)} (${l.historico || l.id}). Aprove ou rejeite antes de migrar: os exercícios até ${corte.slice(0, 4)} vão para o histórico guardado.`);
      equipeAntigos.push(l);
    } else doc.push(l);
  }
  const presAntigos = new Map<string, any[]>(); const presDoc: any[] = [];
  for (const p of Array.isArray(payload.preLancamentos) ? payload.preLancamentos : []) {
    const c = String(p?.competencia || '');
    if (c && c <= corte) { if (!presAntigos.has(c)) presAntigos.set(c, []); presAntigos.get(c)!.push(p); } else presDoc.push(p);
  }

  // ---- histórico: grava mês a mês, soma o transporte e confere ----
  const acc = new AcumuladorHistorico(contas, corte);
  const conf = new AcumuladorConferencia(contas);
  let migradosNoHistorico = 0;
  let primeiraData = ''; let ultimaData = '';
  const guardar = async (lista: any[], origem: MesHistorico['origem'], pres?: Map<string, any[]>) => {
    for (const x of porMes(lista, origem, pres)) {
      for (const l of x.lancamentos) {
        acc.adicionar(l); conf.adicionar(l);
        if (origem === 'migracao' && /^\d{4}-\d{2}-\d{2}$/.test(String(l.data))) { if (!primeiraData || l.data < primeiraData) primeiraData = l.data; if (l.data > ultimaData) ultimaData = l.data; }
      }
      if (saida) await saida.gravarMes(x);
    }
  };
  if (!dados.partes) { await guardar(migAntigos, 'migracao'); migradosNoHistorico = migAntigos.length; }
  else {
    for (const ano of anosArquivoAntigos) {
      const r = await dados.partes.converterAno(ano);
      const fechada = r.lancamentos.find((l) => fechadas.has(mes(l)));
      if (fechada) return vazio(`A competência ${mes(fechada)} está fechada no Murad e tem lançamentos do sistema anterior. Reabra a competência (ou deixe como está) antes de migrar esta empresa.`);
      naoEntraram.push(...r.naoEntraram);
      // O nome da conta como ficou no plano final (igual à junção do documento).
      const nomes = new Map(contas.map((c: any) => [String(c.codigo), String(c.descricao)]));
      const lancs = r.lancamentos.map((l) => { const nd = nomes.get(l.contaDebitoCodigo) || l.contaDebitoNome; const nc = nomes.get(l.contaCreditoCodigo) || l.contaCreditoNome; return nd === l.contaDebitoNome && nc === l.contaCreditoNome ? l : { ...l, contaDebitoNome: nd, contaCreditoNome: nc }; });
      await guardar(lancs, 'migracao');
      migradosNoHistorico += lancs.length;
      if (saida) await saida.gravarOriginais(ano, r.originais);
      await new Promise<void>((ok) => setImmediate(ok)); // cede a vez ao servidor entre um ano e outro
    }
  }
  await guardar(equipeAntigos, 'escritorio', presAntigos);
  let transporte: LancamentoContabil[];
  try { transporte = partidasDeTransporte(acc, contas, corte); } catch (e: any) { return vazio(`${String(e?.message || e)} Nada foi gravado.`); }
  const marcador: MarcadorHistorico = {
    ateCompetencia: corte, desdeCompetencia: acc.desde || corte, quantidade: acc.quantidade, debitosCentavos: acc.debitosCentavos,
    transportes: transporte.length, atualizadoEm: (opcoes.agora || new Date()).toISOString(), motivo: 'migracao',
  };
  payload.lancamentos = [...transporte, ...doc];
  payload.preLancamentos = presDoc;
  payload.historicoArquivado = marcador;
  for (const l of doc) conf.adicionar(l);
  const gravados = docMig.length + migradosNoHistorico;
  const conferencia = conf.resultado(referenciaConferencia(dados, gravados, naoEntraram.length));
  // Teto do documento (exercícios em aberto).
  if (payload.lancamentos.length > LIMITES_DOCUMENTO.lancamentos) return vazio(`Os exercícios em aberto ficariam com ${payload.lancamentos.length} lançamentos e o documento da empresa guarda até ${LIMITES_DOCUMENTO.lancamentos}. Nada foi gravado.`);
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > LIMITES_DOCUMENTO.bytes) return vazio(`Os exercícios em aberto ficariam com ${(bytes / 1e6).toFixed(1)} MB e o documento da empresa guarda até ${LIMITES_DOCUMENTO.bytes / 1e6} MB. Nada foi gravado.`);
  const avisos = [...m.avisos, `Empresa grande: os exercícios até ${corte.slice(0, 4)} (${acc.quantidade} lançamento(s)) ficaram no histórico guardado do Contábil, com o saldo transportado para ${Number(corte.slice(0, 4)) + 1}. Os relatórios desses anos são consultados em "Exercício consultado".`];
  // Período do que veio do arquivo (o primeiro mês pode estar no histórico).
  const primeiro = primeiraData ? brData(primeiraData) : (docMig[0] ? brData(docMig[0].data) : '');
  const ultimo = docMig.length ? brData(docMig[docMig.length - 1].data) : (ultimaData ? brData(ultimaData) : '');
  return {
    ...m, payload, avisos, conferencia, lancamentosGravados: gravados, naoEntraram, periodo: primeiro && ultimo ? `${primeiro} a ${ultimo}` : '',
    historico: { ateCompetencia: corte, lancamentos: acc.quantidade, doSistemaAnterior: migradosNoHistorico, daEquipe: equipeAntigos.length },
  };
}
