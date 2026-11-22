// Junta o que veio do sistema anterior com o que a empresa já tem no Murade Contábil (função pura, não grava nada).
//
// Regras (dono do sistema): não mexer no que a equipe já fez.
//  - Lançamentos feitos no Murade (qualquer origem que não seja "Sistema anterior") ficam como estão.
//  - Lançamentos de uma migração anterior desta mesma empresa são trocados pelos novos (remigração não duplica).
//  - Conta que a equipe já usa (lançamento, rascunho do Fiscal/DP, ligação de origem, saldo inicial, lançamento
//    padrão, regra de conciliação) não muda. Se no sistema anterior o mesmo código for de outro tipo
//    (analítica x sintética), a empresa NÃO é gravada e a tela explica o motivo.
//  - Conta do modelo padrão que ninguém usou (igual ao modelo, sem uso) dá lugar ao plano real da empresa.
//  - Contas criadas ou editadas pela equipe e sem uso continuam.
//  - Histórico padrão com o mesmo código já cadastrado fica como a equipe cadastrou.
//  - Cadastro da empresa: só preenche o que estiver em branco.
import type { ContaPlano, HistoricoPadrao } from '../../types';
import { compararCodigosContabeis } from '../../utils/planoContasUtils';
import type { DadosContabeisEmpresa } from './conversor';
import { ehLancamentoDoSistemaAnterior } from './conferencia';
import { PREFIXO_AJUSTE } from './analiseSistemaAnterior';
import { ajusteLancado, estornarAjuste } from '../../utils/ajustesPropostos';

/** Ajustes de migração já lançados (e não estornados) no workspace. */
export function ajustesDeMigracaoLancados(payload: Record<string, any> | null): string[] {
  const lancs: any[] = Array.isArray(payload?.lancamentos) ? payload!.lancamentos : [];
  const refs = [...new Set(lancs.map((l) => String(l?.documentoRef || '')).filter((r) => r.startsWith(PREFIXO_AJUSTE) && !r.endsWith(':ESTORNO')))];
  return refs.filter((r) => ajusteLancado(lancs, r));
}

export interface ResultadoMesclagem {
  payload: Record<string, any> | null;
  bloqueio?: string;
  avisos: string[];
  contasNovas: number;
  contasAtualizadas: number;
  contasDoModeloRetiradas: number;
  historicosNovos: number;
  lancamentosSubstituidos: number;
  lancamentosDaEquipe: number;
  /** Quantos ajustes de migração estavam lançados (remigração). */
  ajustesMigracaoLancados?: number;
}

const LIMITE_LANCAMENTOS = 20000;
const semValor = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const LIMITE_BYTES = 3_900_000; // o workspace aceita até 4 MB
const LIMITE_HISTORICOS = 500;

function contaLimpa(c: ContaPlano & Record<string, any>): ContaPlano {
  const { idContaOrigem: _a, codigoReduzidoOrigem: _b, classificacaoOrigem: _c, ...resto } = c;
  return resto as ContaPlano;
}

function igualAoModelo(c: Record<string, any>, modelo: Map<string, ContaPlano>): boolean {
  const m = modelo.get(String(c.codigo));
  if (!m) return false;
  const chaves = new Set([...Object.keys(c), ...Object.keys(m)]);
  for (const k of chaves) if (JSON.stringify((c as any)[k] ?? null) !== JSON.stringify((m as any)[k] ?? null)) return false;
  return true;
}

/** Códigos que a equipe já usa no workspace (não podem mudar). */
export function codigosEmUso(payload: Record<string, any>): Set<string> {
  const usados = new Set<string>();
  const add = (v: unknown) => { const s = String(v ?? '').trim(); if (s) usados.add(s); };
  for (const l of Array.isArray(payload.lancamentos) ? payload.lancamentos : []) {
    if (ehLancamentoDoSistemaAnterior(l)) continue;
    add(l?.contaDebitoCodigo); add(l?.contaCreditoCodigo); add(l?.saldoInicialContaCodigo);
  }
  for (const p of Array.isArray(payload.preLancamentos) ? payload.preLancamentos : []) { add(p?.contaDebitoCodigo); add(p?.contaCreditoCodigo); }
  for (const m of Array.isArray(payload.mapeamentosOrigem) ? payload.mapeamentosOrigem : []) { add(m?.contaDebitoCodigo); add(m?.contaCreditoCodigo); }
  for (const p of Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : []) { add(p?.contaUnica); for (const x of Array.isArray(p?.partidas) ? p.partidas : []) add(x?.conta); }
  for (const r of Array.isArray(payload.regrasConciliacao) ? payload.regrasConciliacao : []) add(r?.contaCodigo);
  for (const c of Array.isArray(payload.contas) ? payload.contas : []) if (Number(c?.saldoInicial || 0) !== 0 || c?.saldoInicialConvertidoEm) add(c?.codigo);
  const e = payload.empresa || {};
  add(e.contaContrapartidaAberturaCodigo);
  for (const c of Array.isArray(e.contasDisponibilidadesCodigo) ? e.contasDisponibilidadesCodigo : []) add(c);
  for (const c of Object.keys(e.mapeamentoReferencial || {})) add(c);
  return usados;
}

export function workspaceVazio(dados: DadosContabeisEmpresa, cadastroCompartilhado: Record<string, any> | null, competenciaAtual: string): Record<string, any> {
  const base = cadastroCompartilhado && typeof cadastroCompartilhado === 'object' ? { ...cadastroCompartilhado } : {};
  const empresa: Record<string, any> = {
    id: `emp-${dados.cnpj}`, cnpj: dados.cnpj, razaoSocial: dados.empresa.razaoSocial || dados.razaoSocial, nomeFantasia: '', regime: '',
    municipio: '', uf: '', competencia: competenciaAtual, ibsAliquota: 0, cbsAliquota: 0, cnae: '', situacaoCadastral: '',
    ...base,
  };
  for (const [k, v] of Object.entries(dados.empresa)) if (!semValor(v) && semValor(empresa[k])) empresa[k] = v;
  empresa.cnpj = dados.cnpj;
  if (!empresa.fonteDados) empresa.fonteDados = 'Sistema anterior (backup)';
  return { empresa, contas: [], centrosCusto: [], lancamentos: [], livros: [], lembretes: [], preLancamentos: [], mapeamentosOrigem: [], bensImobilizado: [], historicosPadrao: [], lancamentosPadrao: [], regrasConciliacao: [] };
}

/** Bens do imobilizado: os da equipe ficam; os de uma migração anterior são trocados; bem com a mesma descrição de um da equipe não entra de novo. */
function juntarBens(atuais: unknown, novos: DadosContabeisEmpresa['bensImobilizado']): { bens: any[]; novos: number } {
  const lista: any[] = Array.isArray(atuais) ? atuais : [];
  const daEquipe = lista.filter((b) => !String(b?.id || '').startsWith('sa-bem-'));
  const descricoes = new Set(daEquipe.map((b) => String(b?.descricao || '').trim()));
  const entram = (novos || []).filter((b) => !descricoes.has(b.descricao.trim()));
  return { bens: [...daEquipe, ...entram], novos: entram.length };
}

export function mesclarMigracao(
  atual: Record<string, any> | null,
  dados: DadosContabeisEmpresa,
  opcoes: { modelo: ContaPlano[]; cadastroCompartilhado?: Record<string, any> | null; competenciaAtual: string; fechadas?: Set<string> },
): ResultadoMesclagem {
  const avisos: string[] = [];
  const r: ResultadoMesclagem = { payload: null, avisos, contasNovas: 0, contasAtualizadas: 0, contasDoModeloRetiradas: 0, historicosNovos: 0, lancamentosSubstituidos: 0, lancamentosDaEquipe: 0 };
  let payload: Record<string, any> = atual ? JSON.parse(JSON.stringify(atual)) : workspaceVazio(dados, opcoes.cadastroCompartilhado ?? null, opcoes.competenciaAtual);
  // Ajuste de migração já lançado: nunca fica sobrando sem avisar. Só migra de novo com a escolha explícita do contador,
  // e aí cada ajuste é estornado antes (o lançamento original continua no Diário, com o estorno).
  const ajustes = ajustesDeMigracaoLancados(payload);
  if (ajustes.length && !dados.desfazerAjustesMigracao) {
    return { ...r, ajustesMigracaoLancados: ajustes.length, bloqueio: `Esta empresa tem ${ajustes.length} ajuste(s) de migração lançado(s). Escolha "Desfazer os ajustes e migrar de novo" (estorna os ajustes e depois analisa de novo) ou "Cancelar".` };
  }
  for (const ref of ajustes) payload = estornarAjuste(payload, ref);
  if (ajustes.length) avisos.push(`${ajustes.length} ajuste(s) de migração estornado(s) antes de migrar de novo; a análise é refeita depois de gravar.`);
  for (const k of ['contas', 'centrosCusto', 'lancamentos', 'livros', 'lembretes']) if (!Array.isArray(payload[k])) payload[k] = [];

  // ---- cadastro da empresa: só o que está em branco
  if (atual) {
    payload.empresa = payload.empresa && typeof payload.empresa === 'object' ? payload.empresa : { cnpj: dados.cnpj };
    for (const [k, v] of Object.entries(dados.empresa)) {
      if (k === 'cnpj' || semValor(v)) continue;
      const atualV = payload.empresa[k];
      // Vazio: completa. Igual ao valor cortado que uma migração anterior gravou (ex.: bairro em 15 letras): troca pelo completo.
      const antigo = (dados.substituiveis || {})[k as keyof typeof dados.substituiveis];
      if (semValor(atualV) || (antigo !== undefined && typeof atualV === 'string' && atualV.trim() === antigo)) payload.empresa[k] = v;
    }
  }

  // ---- lançamentos: troca só os da migração anterior
  const lancAtuais: any[] = payload.lancamentos;
  const anteriores = lancAtuais.filter(ehLancamentoDoSistemaAnterior);
  const daEquipe = lancAtuais.filter((l) => !ehLancamentoDoSistemaAnterior(l));
  const idsAnteriores = new Set(anteriores.map((l) => String(l.id)));
  if (daEquipe.some((l) => l?.estornoDe && idsAnteriores.has(String(l.estornoDe)))) {
    return { ...r, bloqueio: 'A equipe já estornou no Murade um lançamento que veio do sistema anterior. Para não desfazer esse trabalho, esta empresa não foi migrada de novo.' };
  }
  const fechadas = opcoes.fechadas || new Set<string>();
  const mexeEmFechada = [...anteriores, ...dados.lancamentos].find((l) => fechadas.has(String(l.data || '').slice(0, 7)));
  if (mexeEmFechada) return { ...r, bloqueio: `A competência ${String(mexeEmFechada.data).slice(0, 7)} está fechada no Murade e tem lançamentos do sistema anterior. Reabra a competência (ou deixe como está) antes de migrar esta empresa.` };
  r.lancamentosSubstituidos = anteriores.length;
  r.lancamentosDaEquipe = daEquipe.length;

  // ---- plano de contas
  const usados = codigosEmUso(payload);
  const modelo = new Map(opcoes.modelo.map((c) => [c.codigo, c]));
  const existentes = new Map<string, any>((payload.contas as any[]).map((c) => [String(c.codigo), c]));
  const conflitos: string[] = [];
  for (const nova of dados.contas) {
    const e = existentes.get(nova.codigo);
    const limpa = contaLimpa(nova);
    if (!e) { existentes.set(nova.codigo, limpa); r.contasNovas++; continue; }
    const igual = e.descricao === limpa.descricao && e.tipo === limpa.tipo && e.natureza === limpa.natureza && Number(e.nivel) === limpa.nivel;
    // Código reduzido: só completa se a conta do Murade ainda não tem.
    if (limpa.codigoReduzido && !e.codigoReduzido && (igual || usados.has(nova.codigo))) existentes.set(nova.codigo, { ...e, codigoReduzido: limpa.codigoReduzido });
    if (igual) continue;
    if (!usados.has(nova.codigo)) {
      existentes.set(nova.codigo, { ...limpa, ...(e.saldoInicial !== undefined ? { saldoInicial: e.saldoInicial } : {}), ...(e.saldoInicialCompetencia ? { saldoInicialCompetencia: e.saldoInicialCompetencia } : {}) });
      r.contasAtualizadas++;
      continue;
    }
    if (e.tipo !== limpa.tipo) { conflitos.push(`${nova.codigo} (no Murade "${e.descricao}", ${e.tipo}; no sistema anterior "${limpa.descricao}", ${limpa.tipo})`); continue; }
    if (e.descricao !== limpa.descricao) avisos.push(`A conta ${nova.codigo} já é usada no Murade como "${e.descricao}"; ficou com esse nome (no sistema anterior era "${limpa.descricao}").`);
  }
  if (conflitos.length) {
    return { ...r, bloqueio: `Conta(s) já usada(s) no Murade com o mesmo código, mas de outro tipo no sistema anterior: ${conflitos.slice(0, 5).join('; ')}${conflitos.length > 5 ? ` e mais ${conflitos.length - 5}` : ''}. Para não mudar o trabalho da equipe, esta empresa não foi gravada. Ajuste o código no Plano de Contas e tente de novo.` };
  }
  // Retira as contas do modelo padrão que ninguém usou, quando o plano real da empresa chegou (sem deixar conta usada sem a conta-mãe).
  const codigosNovos = new Set(dados.contas.map((c) => c.codigo));
  if (dados.contas.length) {
    const candidatas = new Set<string>();
    for (const [codigo, c] of existentes) if (!codigosNovos.has(codigo) && !usados.has(codigo) && igualAoModelo(c, modelo)) candidatas.add(codigo);
    const ficam = [...existentes.keys()].filter((c) => !candidatas.has(c));
    for (const c of ficam) for (let p = c; p.includes('.');) { p = p.slice(0, p.lastIndexOf('.')); candidatas.delete(p); }
    for (const c of candidatas) existentes.delete(c);
    r.contasDoModeloRetiradas = candidatas.size;
  }
  const contas = [...existentes.values()].sort((a, b) => compararCodigosContabeis(String(a.codigo), String(b.codigo)) || String(a.codigo).localeCompare(String(b.codigo)));
  // Conta analítica que ficou com contas-filhas por causa da junção: só avisa (o histórico continua válido).
  const codigos = new Set(contas.map((c) => String(c.codigo)));
  for (const c of contas) if (c.tipo === 'analitica' && [...codigos].some((x) => x.startsWith(`${c.codigo}.`)) && !dados.contas.some((d) => d.codigo === c.codigo)) avisos.push(`A conta analítica ${c.codigo} (${c.descricao}) do Murade ficou com contas-filhas vindas do sistema anterior; confira no Plano de Contas.`);
  payload.contas = contas;

  // ---- históricos padrão
  const hist: HistoricoPadrao[] = Array.isArray(payload.historicosPadrao) ? payload.historicosPadrao : [];
  const codigosHist = new Set(hist.map((h) => String(h.codigo).toUpperCase()));
  const idsHist = new Set(hist.map((h) => String(h.id)));
  let foraDoLimite = 0;
  for (const h of dados.historicosPadrao) {
    if (codigosHist.has(h.codigo.toUpperCase())) {
      const e = hist.find((x) => String(x.codigo).toUpperCase() === h.codigo.toUpperCase());
      if (e && e.texto !== h.texto && !idsHist.has(h.id)) avisos.push(`O histórico padrão ${h.codigo} já existe no Murade com outro texto; ficou o do Murade.`);
      continue;
    }
    if (hist.length >= LIMITE_HISTORICOS) { foraDoLimite++; continue; }
    hist.push(h); codigosHist.add(h.codigo.toUpperCase()); idsHist.add(h.id); r.historicosNovos++;
  }
  if (foraDoLimite) avisos.push(`${foraDoLimite} histórico(s) padrão não couberam (o Murade guarda até ${LIMITE_HISTORICOS} por empresa); estão no registro do sistema anterior.`);
  payload.historicosPadrao = hist;

  // ---- modelos de lançamento (os da equipe ficam; os de uma migração anterior são trocados; nome igual a um da equipe não entra)
  if ((dados.modelos || []).length || (Array.isArray(payload.lancamentosPadrao) && payload.lancamentosPadrao.some((x: any) => String(x?.id || '').startsWith('sa-lauto-')))) {
    const atuais: any[] = Array.isArray(payload.lancamentosPadrao) ? payload.lancamentosPadrao : [];
    const daEquipe = atuais.filter((x) => !String(x?.id || '').startsWith('sa-lauto-'));
    const nomes = new Set(daEquipe.map((x) => String(x?.nome || '').trim().toUpperCase()));
    const cabem = Math.max(0, 200 - daEquipe.length);
    const entram = (dados.modelos || []).filter((m) => !nomes.has(m.nome.trim().toUpperCase()));
    payload.lancamentosPadrao = [...daEquipe, ...entram.slice(0, cabem)];
    if (entram.length > cabem) avisos.push(`${entram.length - cabem} modelo(s) de lançamento não couberam (o Murade guarda até 200 por empresa); estão no registro do sistema anterior.`);
  }

  // ---- imobilizado
  if ((dados.bensImobilizado || []).length || (Array.isArray(payload.bensImobilizado) && payload.bensImobilizado.some((b: any) => String(b?.id || '').startsWith('sa-bem-')))) {
    const j = juntarBens(payload.bensImobilizado, dados.bensImobilizado);
    payload.bensImobilizado = j.bens;
    if (j.novos < (dados.bensImobilizado || []).length) avisos.push(`${(dados.bensImobilizado || []).length - j.novos} bem(ns) do sistema anterior já estavam cadastrados no Imobilizado com a mesma descrição; ficaram como a equipe cadastrou.`);
  }

  // ---- lançamentos do sistema anterior (com os nomes das contas como ficaram no plano final)
  const porCodigo = new Map(contas.map((c) => [String(c.codigo), c]));
  const novos = dados.lancamentos.map((l) => ({ ...l, contaDebitoNome: porCodigo.get(l.contaDebitoCodigo)?.descricao || l.contaDebitoNome, contaCreditoNome: porCodigo.get(l.contaCreditoCodigo)?.descricao || l.contaCreditoNome }));
  payload.lancamentos = [...daEquipe, ...novos];
  if (payload.lancamentos.length > LIMITE_LANCAMENTOS) {
    return { ...r, bloqueio: `Esta empresa ficaria com ${payload.lancamentos.length} lançamentos e o Murade guarda até ${LIMITE_LANCAMENTOS} por empresa. Nada foi gravado; o caso foi registrado para o suporte ampliar o limite.` };
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > LIMITE_BYTES) {
    return { ...r, bloqueio: `Os dados desta empresa ficariam com ${(bytes / 1e6).toFixed(1)} MB e o Murade guarda até 4 MB por empresa. Nada foi gravado; o caso foi registrado para o suporte ampliar o limite.` };
  }
  r.payload = payload;
  r.ajustesMigracaoLancados = ajustes.length;
  return r;
}
