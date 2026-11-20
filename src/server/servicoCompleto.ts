// SERVIÇO COMPLETO DA AGENTE — "a Agente vira o funcionário do contador".
//
// O contador pede ("fecha o mês da empresa X", "faz a ECD", "encerra o resultado", "monta o balancete/DRE para o cliente")
// e a Agente faz o serviço inteiro dentro do sistema, usando SÓ rotas e cálculos que já existem:
//   1. levanta tudo o que o sistema já sabe (workspace, fechamentos, extrato guardado, encerramento, Livro Caixa, ECD);
//   2. pergunta UMA vez só o que falta (empresa, quando há várias e o pedido não diz qual);
//   3. mostra o PILOTO VISÍVEL passando pelas telas, e o piloto SEMPRE para antes de aprovar, fechar ou gravar definitivo;
//   4. prepara o que dá para preparar num CARTÃO ÚNICO (preparar_servico_completo): recepção do Fiscal/DP, lançamentos padrão,
//      sugestões da conciliação e encerramento do resultado — tudo pendente de aprovação, nada definitivo;
//   5. deixa o resumo em "A conferir" (tela Aprovar lançamentos) e marca "serviço feito".
// Aprovar lançamentos, contabilizar rascunhos e fechar competência continuam SÓ no clique do contador.
// O que o sistema ainda não faz pelo servidor aparece como etapa "falta_sistema" (nunca é inventado).
import { erroApi, ok, q, type ContextoAgente, type Ferramenta } from './agenteMotor';
import type { EtapaServico, RoteiroServico } from './servicoCompletoStore';
import { alvoDoCampo } from '../data/mapaTelasContabil';
import { validarPlanoPiloto, type PassoPiloto, type PlanoPiloto } from '../utils/pilotoVisivel';
import { conferirFechamento, referenciaDepreciacao } from '../utils/fechamentoContabil';
import { totalQuotasDoMes } from '../utils/imobilizado';
import { gerarRelatoriosContabeis, moedaContabil, normalizarDataContabil } from '../utils/livrosContabeis';
import { situacaoLivroCaixaDoMes } from '../utils/livroCaixa';
import { prepararRecorrentesDoMes } from '../utils/escrituracaoAvancada';
import { resultadoDoPeriodo } from '../utils/analiseContabil';
import { conferirEcdWorkspace } from './conferidorEcd';
import { FRASE_NAO_LIBERADO, opcoesConsultorParaTeste, registrarDecisaoNoConsultor } from './consultorMurade';

// ---------------------------------------------------------------------------------------------
// Roteiros
// ---------------------------------------------------------------------------------------------
export const ROTEIROS: Record<RoteiroServico, { titulo: string; referencia: 'competencia' | 'ano'; tela: string }> = {
  fechamento_mensal: { titulo: 'Fechamento do mês', referencia: 'competencia', tela: 'gestao-contabil' },
  ecd_ano: { titulo: 'ECD do ano', referencia: 'ano', tela: 'livros' },
  encerramento_resultado: { titulo: 'Encerramento do resultado', referencia: 'ano', tela: 'livros' },
  balancete_cliente: { titulo: 'Balancete e DRE para o cliente', referencia: 'competencia', tela: 'balancete' },
};

const semAcento = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Entende o pedido falado: "fecha o mês", "faz a ECD", "encerra o resultado", "balancete pro cliente", "concilia o banco"… */
export function identificarRoteiro(texto: unknown): RoteiroServico | null {
  const t = semAcento(texto).replace(/[^a-z0-9_ ]/g, ' ');
  if (!t.trim()) return null;
  if ((Object.keys(ROTEIROS) as RoteiroServico[]).includes(t.trim() as RoteiroServico)) return t.trim() as RoteiroServico;
  if (/\becd\b|sped contabil|escrituracao contabil digital/.test(t)) return 'ecd_ano';
  if (/encerr\w* (o |do )?resultado|zerar (as )?contas de resultado|apuracao do resultado/.test(t)) return 'encerramento_resultado';
  if (/balancete|\bdre\b|demonstra\w* do resultado|relatorio\w* (pro|para o) cliente/.test(t) && !/fech/.test(t)) return 'balancete_cliente';
  if (/fech\w*|concili\w*|lanc\w* (o que veio|do fiscal|do dp)|contabiliz\w*|deprecia\w*|livro caixa|diario|razao/.test(t)) return 'fechamento_mensal';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Preparo (só rotas que já existem; tudo pendente de aprovação ou idempotente)
// ---------------------------------------------------------------------------------------------
export type ItemPreparo =
  | { tipo: 'reprocessar_recepcao'; etapa: string; descricao: string }
  | { tipo: 'lancamentos_padrao'; etapa: string; descricao: string; competencia: string }
  | { tipo: 'conciliacao'; etapa: string; descricao: string; contaBanco: string; fitids: string[] }
  | { tipo: 'encerramento'; etapa: string; descricao: string; ano: number; contaDestino?: string };

export interface Levantamento {
  roteiro: RoteiroServico;
  cnpj: string;
  nomeEmpresa: string;
  referencia: string;
  titulo: string;
  etapas: EtapaServico[];
  preparo: ItemPreparo[];
  passos: PassoPiloto[];
}

const fmtCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const mesAno = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const centavosDe = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

export function competenciaAnterior(hoje: string): string {
  const [a, m] = hoje.slice(0, 7).split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

// Passos de piloto
const pEmpresa = (cnpj: string, nome: string): PassoPiloto => ({ tipo: 'selecionar', alvo: '[data-campo=empresa-ativa]', valor: cnpj, legenda: `Escolhendo a empresa ${nome || fmtCnpj(cnpj)}` });
const pTela = (id: string, legenda: string): PassoPiloto => ({ tipo: 'navegar', alvo: `#btn-menu-${id}`, legenda });
const pAbrir = (campo: string, legenda: string): PassoPiloto => ({ tipo: 'navegar', alvo: alvoDoCampo(campo), legenda });
const pDestacarTexto = (texto: string, legenda: string): PassoPiloto => ({ tipo: 'destacar', alvo: `texto:${texto}`, legenda: legenda.slice(0, 160) });
const pDestacarCampo = (campo: string, legenda: string): PassoPiloto => ({ tipo: 'destacar', alvo: alvoDoCampo(campo), legenda: legenda.slice(0, 160) });
const pParar = (campo: string, legenda: string): PassoPiloto => ({ tipo: 'parar_no_botao', alvo: alvoDoCampo(campo), legenda: legenda.slice(0, 160) });

export function montarPlano(titulo: string, passos: PassoPiloto[]): PlanoPiloto | null {
  const v = validarPlanoPiloto({ titulo, passos: passos.slice(0, 40) });
  return v.ok ? v.plano : null;
}

// ---------------------------------------------------------------------------------------------
// Levantamentos (puros: recebem o que as rotas devolveram)
// ---------------------------------------------------------------------------------------------
export interface EntradaFechamento {
  cnpj: string; nome: string; competencia: string; dados: Record<string, any>; fechadas: Set<string>;
  /** Resumo do extrato guardado (GET /extratos) e os movimentos pendentes da competência por conta do banco. null = rota indisponível. */
  extrato: { resumo: Array<{ contaBanco: string; pendentes: number; conciliados: number; lancados: number }>; pendentesPorConta: Record<string, Array<{ fitid: string; valorCentavos: number; sugestaoConta?: string | null; sugestaoLancamentoId?: string | null }>> } | null;
}

export function levantarFechamentoMensal(e: EntradaFechamento): Levantamento {
  const { competencia: c, dados } = e;
  const contas = arr(dados.contas), lancamentos = arr(dados.lancamentos), pre = arr(dados.preLancamentos), bens = arr(dados.bensImobilizado);
  const etapas: EtapaServico[] = []; const preparo: ItemPreparo[] = []; const passos: PassoPiloto[] = [pEmpresa(e.cnpj, e.nome)];

  // 1. Receber o que veio do Fiscal e do DP
  const pend = pre.filter((p) => p?.status === 'pendente_conferencia' && p.competencia === c);
  const fiscal = pend.filter((p) => /^fiscal/i.test(String(p.origem || ''))), dp = pend.filter((p) => /^dp/i.test(String(p.origem || '')));
  const outros = pend.length - fiscal.length - dp.length;
  const totalPend = pend.reduce((t, p) => t + centavosDe(p.valor), 0);
  preparo.push({ tipo: 'reprocessar_recepcao', etapa: 'recepcao', descricao: 'Buscar de novo o que o Fiscal e o DP já mandaram e montar os rascunhos (não aprova nada).' });
  etapas.push(pend.length
    ? { id: 'recepcao', titulo: 'Receber e contabilizar o que veio do Fiscal e do DP', situacao: 'contador', tela: 'revisao-origens', detalhe: `${pend.length} rascunho(s) de ${mesAno(c)} esperando sua conferência (Fiscal: ${fiscal.length}, DP: ${dp.length}${outros ? `, outros: ${outros}` : ''}), total ${moedaContabil(totalPend)}. Vou buscar o que chegou por último; contabilizar é o seu clique em "Conferir e contabilizar elegíveis".` }
    : { id: 'recepcao', titulo: 'Receber e contabilizar o que veio do Fiscal e do DP', situacao: 'a_preparar', tela: 'revisao-origens', detalhe: `Nenhum rascunho pendente em ${mesAno(c)}. Vou buscar de novo o que o Fiscal e o DP mandaram, para não faltar nada.` });
  passos.push(pTela('revisao-origens', 'Abrindo Revisar dados recebidos: o que veio do Fiscal e do DP'));
  if (fiscal.length) passos.push(pDestacarTexto('Prévia contábil das notas', `${fiscal.length} rascunho(s) do Fiscal para você conferir`));
  if (dp.length) passos.push(pDestacarTexto('Prévia contábil da folha', `${dp.length} rascunho(s) do DP para você conferir`));

  // 2. Lançamentos padrão (recorrentes)
  const padroes = arr(dados.lancamentosPadrao);
  const ativos = padroes.filter((p) => p?.ativo);
  if (!ativos.length) etapas.push({ id: 'padrao', titulo: 'Lançamentos padrão (recorrentes)', situacao: 'nada', tela: 'lancamentos', detalhe: 'A empresa não tem lançamento padrão ativo.' });
  else {
    let n = 0;
    const plano = prepararRecorrentesDoMes({ padroes, lancamentos, contas, competencia: c, fechadas: e.fechadas, novoId: () => `previa-${(n += 1)}` });
    if (plano.novos.length) {
      preparo.push({ tipo: 'lancamentos_padrao', etapa: 'padrao', competencia: c, descricao: `Preparar ${plano.novos.length} partida(s) dos lançamentos padrão de ${mesAno(c)}, pendentes de aprovação.` });
      etapas.push({ id: 'padrao', titulo: 'Lançamentos padrão (recorrentes)', situacao: 'a_preparar', tela: 'lancamentos', detalhe: `${plano.novos.length} partida(s) ainda não preparada(s) em ${mesAno(c)}, total ${moedaContabil(plano.novos.reduce((t, l) => t + centavosDe(l.valor), 0))}.` });
    } else etapas.push({ id: 'padrao', titulo: 'Lançamentos padrão (recorrentes)', situacao: 'feito', tela: 'lancamentos', detalhe: `Os ${ativos.length} lançamento(s) padrão ativo(s) já estão preparados em ${mesAno(c)} (ou não valem neste mês).` });
    if (plano.avisos.length) etapas.push({ id: 'padrao-aviso', titulo: 'Lançamento padrão com problema', situacao: 'aviso', tela: 'lancamentos', detalhe: plano.avisos.join(' ').slice(0, 400) });
    passos.push(pTela('lancamentos', 'Abrindo Lançamentos: lançamentos padrão do mês'));
    passos.push(pDestacarTexto('Lançamentos padrão', plano.novos.length ? `${plano.novos.length} partida(s) a preparar para sua aprovação` : 'Lançamentos padrão do mês já preparados'));
  }

  // 3. Conciliação do extrato com as regras
  passos.push(pTela('gestao-contabil', 'Abrindo Gestão contábil'));
  passos.push({ tipo: 'selecionar', alvo: alvoDoCampo('gestao-periodo'), valor: c, legenda: `Escolhendo a competência ${mesAno(c)}` });
  passos.push(pAbrir('gestao-aba-extrato', 'Abrindo Extrato e conciliação'));
  if (!e.extrato) etapas.push({ id: 'conciliacao', titulo: 'Conciliação bancária', situacao: 'aviso', tela: 'gestao-contabil', detalhe: 'Não consegui ler o extrato guardado agora. Confira em Gestão contábil → Extrato e conciliação.' });
  else if (!e.extrato.resumo.length) {
    etapas.push({ id: 'conciliacao', titulo: 'Conciliação bancária', situacao: 'contador', tela: 'gestao-contabil', detalhe: 'Não há extrato guardado desta empresa. Baixe o OFX no internet banking e importe em Gestão contábil → Extrato e conciliação (o sistema não se conecta ao banco).' });
    passos.push(pDestacarCampo('extrato-conta', 'Importe aqui o extrato OFX do mês'));
  } else {
    let comSug = 0, semSug = 0, contasComMov = 0;
    for (const [conta, movs] of Object.entries(e.extrato.pendentesPorConta)) {
      if (!movs.length) continue;
      contasComMov += 1;
      const s = movs.filter((m) => m.sugestaoConta || m.sugestaoLancamentoId);
      semSug += movs.length - s.length; comSug += s.length;
      if (s.length) preparo.push({ tipo: 'conciliacao', etapa: 'conciliacao', contaBanco: conta, fitids: s.map((m) => m.fitid), descricao: `Aceitar ${s.length} sugestão(ões) do robô na conta do banco ${conta} (conciliações e lançamentos novos pendentes de aprovação).` });
    }
    if (!contasComMov) etapas.push({ id: 'conciliacao', titulo: 'Conciliação bancária', situacao: 'feito', tela: 'gestao-contabil', detalhe: `Nenhum movimento do extrato de ${mesAno(c)} sem conciliar.` });
    else etapas.push({ id: 'conciliacao', titulo: 'Conciliação bancária', situacao: comSug ? 'a_preparar' : 'contador', tela: 'gestao-contabil', detalhe: `${comSug} movimento(s) com sugestão (eu aplico no cartão)${semSug ? ` e ${semSug} sem sugestão: lance na tela ou crie uma regra ("quando tiver TARIFA, usar despesas bancárias")` : ''}.` });
    passos.push(pDestacarTexto('Regras de conciliação', `${comSug + semSug} movimento(s) do extrato a conciliar em ${mesAno(c)}`));
  }

  // 4. Depreciação
  const quotas = totalQuotasDoMes(bens, c);
  if (quotas.total <= 0) etapas.push({ id: 'depreciacao', titulo: 'Depreciação do mês', situacao: 'nada', tela: 'gestao-contabil', detalhe: 'Nenhum bem com depreciação neste mês.' });
  else if (lancamentos.some((l) => l?.documentoRef === referenciaDepreciacao(c) && l.statusManual !== 'rejeitado')) etapas.push({ id: 'depreciacao', titulo: 'Depreciação do mês', situacao: 'feito', tela: 'gestao-contabil', detalhe: `Depreciação de ${mesAno(c)} já lançada (${moedaContabil(quotas.total)}).` });
  else {
    etapas.push({ id: 'depreciacao', titulo: 'Depreciação do mês', situacao: 'contador', tela: 'gestao-contabil', detalhe: `${moedaContabil(quotas.total)} de depreciação de ${quotas.itens.length} bem(ns) ainda sem lançamento. O botão "Lançar depreciação do mês" (Gestão contábil → Ativo imobilizado) cria o lançamento pendente de aprovação; o clique é seu.` });
    etapas.push({ id: 'depreciacao-servidor', titulo: 'Depreciação pela Agente', situacao: 'falta_sistema', tela: 'gestao-contabil', detalhe: 'Ainda não existe rota no servidor para preparar a depreciação sozinha: a Agente só leva você até o botão.' });
    passos.push(pAbrir('gestao-aba-imobilizado', 'Abrindo Ativo imobilizado'));
    passos.push(pDestacarCampo('depreciacao-lancar', `Falta lançar a depreciação: ${moedaContabil(quotas.total)}. O clique é seu`));
  }

  // 5. Conferência do fechamento (itens automáticos)
  const conf = conferirFechamento({ competencia: c, contas, lancamentos, preLancamentos: pre, bens, confirmacoes: {} });
  const falhas = conf.itens.filter((i) => i.tipo === 'automatico' && !i.ok);
  etapas.push(falhas.length
    ? { id: 'conferencia', titulo: 'Conferência do fechamento', situacao: falhas.some((i) => i.bloqueia) ? 'contador' : 'aviso', tela: 'gestao-contabil', detalhe: falhas.map((i) => `${i.titulo}: ${i.detalhe}`).join(' · ').slice(0, 400) }
    : { id: 'conferencia', titulo: 'Conferência do fechamento', situacao: 'feito', tela: 'gestao-contabil', detalhe: 'Todos os itens automáticos estão em ordem.' });
  etapas.push({ id: 'confirmacoes', titulo: 'Confirmações suas', situacao: 'contador', tela: 'gestao-contabil', detalhe: 'Banco conciliado, contas a pagar e a receber, folha integrada e impostos calculados: o sistema não confere isso sozinho; você marca no Fechamento guiado depois de conferir.' });

  // 6. Livros: Diário, Razão e Livro Caixa (Simples)
  const rel = gerarRelatoriosContabeis(contas, lancamentos, c);
  etapas.push({ id: 'livros', titulo: 'Livro Diário e Razão', situacao: rel.doPeriodo.length ? 'feito' : 'contador', tela: 'livros', detalhe: rel.doPeriodo.length ? `${rel.doPeriodo.length} lançamento(s) aprovado(s) de ${mesAno(c)} já estão no Diário e no Razão (tela Livros Fiscais e ECD).` : `Ainda não há lançamento aprovado em ${mesAno(c)}: o Diário e o Razão do mês saem depois das aprovações.` });
  const caixa = situacaoLivroCaixaDoMes(dados, c);
  if (caixa.situacao !== 'nao_se_aplica') etapas.push({ id: 'livro-caixa', titulo: 'Livro Caixa (Simples Nacional)', situacao: caixa.situacao === 'dispensado' || caixa.situacao === 'emitido' ? 'feito' : 'contador', tela: 'livros', detalhe: `${caixa.detalhe}${caixa.situacao === 'pode_emitir' || caixa.situacao === 'pendente' ? ' Depois das aprovações, registre o Livro Caixa (Livros → Livro Caixa).' : ''}`.slice(0, 400) });
  passos.push(pTela('livros', 'Abrindo Livros Fiscais e ECD'));
  passos.push(pDestacarTexto('Livro Diário', `Diário de ${mesAno(c)}: ${rel.doPeriodo.length} lançamento(s) aprovado(s)`));
  passos.push(pDestacarTexto('Livro Razão', 'Razão do mês, conta por conta'));
  if (caixa.situacao !== 'nao_se_aplica') passos.push(pDestacarTexto('Livro Caixa (Simples)', `Livro Caixa: ${caixa.situacao === 'dispensado' ? 'dispensado (tem Diário e Razão)' : caixa.situacao === 'emitido' ? 'já emitido' : 'pendente'}`));

  // 7. Aprovar e fechar (só o contador)
  const manuais = lancamentos.filter((l) => l?.statusManual === 'pendente_aprovacao' && normalizarDataContabil(String(l.data || ''))?.slice(0, 7) === c).length;
  etapas.push({ id: 'aprovar-fechar', titulo: 'Aprovar e fechar a competência', situacao: 'contador', tela: 'aprovacoes', detalhe: `${manuais ? `${manuais} lançamento(s) de ${mesAno(c)} esperando sua aprovação (mais o que eu preparar agora). ` : ''}Aprovar é na tela Aprovar lançamentos; fechar é em Gestão contábil → Fechamento guiado. Só você aprova e fecha.` });
  passos.push(pTela('aprovacoes', 'Abrindo Aprovar lançamentos'));
  passos.push(pDestacarTexto('Serviços preparados pela Agente', 'Aqui fica o resumo deste serviço para você conferir'));
  if (manuais) passos.push(pParar('aprovacao-aprovar', 'Aprovar. Confira cada lançamento; só você aprova'));
  else {
    passos.push(pTela('gestao-contabil', 'Voltando à Gestão contábil'));
    passos.push({ tipo: 'selecionar', alvo: alvoDoCampo('gestao-periodo'), valor: c, legenda: `Competência ${mesAno(c)}` });
    passos.push(pAbrir('gestao-aba-fechamento', 'Abrindo o Fechamento guiado'));
    passos.push(pParar('fechamento-fechar', 'Fechar competência. Depois de conferir e marcar as confirmações, quem fecha é você'));
  }
  return { roteiro: 'fechamento_mensal', cnpj: e.cnpj, nomeEmpresa: e.nome, referencia: c, titulo: `Fechamento de ${mesAno(c)} — ${e.nome || fmtCnpj(e.cnpj)}`, etapas, preparo, passos };
}

export interface EntradaAno {
  cnpj: string; nome: string; ano: number; dados: Record<string, any>; fechadas: Set<string>; hoje: Date;
  /** GET /encerramento?ano= (null = rota indisponível). */
  encerramento: { contaDestino?: string | null; previa?: { resultadoCentavos: number; partidas: unknown[] } | null; motivo?: string | null; gravados?: { ativos?: any[]; pendentes?: any[] } } | null;
}

function etapaEncerramento(e: EntradaAno, etapas: EtapaServico[], preparo: ItemPreparo[]): { pendente: boolean } {
  const enc = e.encerramento;
  if (!enc) { etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: 'aviso', tela: 'livros', detalhe: 'Não consegui ler o encerramento agora. Confira em Livros → Encerramento do resultado.' }); return { pendente: false }; }
  const ativos = arr(enc.gravados?.ativos), pendentes = arr(enc.gravados?.pendentes);
  if (pendentes.length) { etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: 'contador', tela: 'aprovacoes', detalhe: `O encerramento de ${e.ano} já está preparado e espera sua aprovação (tela Aprovar lançamentos).` }); return { pendente: true }; }
  if (ativos.length && !enc.previa) { etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: 'feito', tela: 'livros', detalhe: `Resultado de ${e.ano} encerrado e aprovado.` }); return { pendente: false }; }
  if (ativos.length && enc.previa) { etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: 'aviso', tela: 'livros', detalhe: `Houve lançamento em ${e.ano} depois do encerramento gravado. Estorne o encerramento ("estorna o encerramento de ${e.ano}") e gere de novo; eu não estorno sozinha.` }); return { pendente: false }; }
  if (enc.previa) {
    const r = enc.previa.resultadoCentavos;
    preparo.push({ tipo: 'encerramento', etapa: 'encerramento', ano: e.ano, contaDestino: enc.contaDestino || undefined, descricao: `Preparar o encerramento do resultado de ${e.ano}: ${r >= 0 ? 'lucro' : 'prejuízo'} de ${moedaContabil(Math.abs(r))} para a conta ${enc.contaDestino || 'de Lucros ou Prejuízos Acumulados'}, em 31/12/${e.ano}, pendente de aprovação.` });
    etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: 'a_preparar', tela: 'livros', detalhe: `${r >= 0 ? 'Lucro' : 'Prejuízo'} de ${moedaContabil(Math.abs(r))}; ${arr(enc.previa.partidas).length} conta(s) de resultado zeradas contra ${enc.contaDestino || 'Lucros ou Prejuízos Acumulados'}.` });
    return { pendente: false };
  }
  etapas.push({ id: 'encerramento', titulo: 'Encerramento do resultado', situacao: /saldo|movimento/i.test(String(enc.motivo || '')) ? 'nada' : 'aviso', tela: 'livros', detalhe: String(enc.motivo || `Nada a encerrar em ${e.ano}.`).slice(0, 400) });
  return { pendente: false };
}

function etapaMesesFechados(e: EntradaAno, etapas: EtapaServico[]): void {
  const meses = Array.from({ length: 12 }, (_, i) => `${e.ano}-${String(i + 1).padStart(2, '0')}`);
  const abertos = meses.filter((m) => !e.fechadas.has(m));
  etapas.push({ id: 'meses', titulo: `Competências de ${e.ano} fechadas`, situacao: abertos.length ? 'contador' : 'feito', tela: 'gestao-contabil', detalhe: abertos.length ? `${12 - abertos.length} de 12 fechadas. Abertas: ${abertos.map((m) => m.slice(5)).join(', ')}. Feche cada mês depois de conferir (peça "fecha o mês" que eu preparo cada um).` : 'Os 12 meses estão fechados.' });
}

export function levantarEcdAno(e: EntradaAno): Levantamento {
  const etapas: EtapaServico[] = []; const preparo: ItemPreparo[] = []; const passos: PassoPiloto[] = [pEmpresa(e.cnpj, e.nome)];
  // conferirEcdWorkspace olha o ano anterior ao "agora": passamos uma data de junho do ano seguinte e refazemos o prazo com a data real.
  const ecd = conferirEcdWorkspace(e.cnpj, e.dados, new Date(Date.UTC(e.ano + 1, 0, 15)));
  if (!ecd) etapas.push({ id: 'obrigatoriedade', titulo: 'ECD obrigatória?', situacao: 'aviso', tela: 'empresa', detalhe: 'A empresa ainda não tem cadastro salvo no Contábil (regime). Complete em Cadastro de Empresa.' });
  else {
    const dias = Math.ceil((Date.parse(`${ecd.prazo}T23:59:59Z`) - e.hoje.getTime()) / 86_400_000);
    const dispensa = ecd.situacao === 'dispensada' || ecd.situacao === 'facultativa';
    etapas.push({ id: 'obrigatoriedade', titulo: 'ECD obrigatória?', situacao: dispensa ? 'nada' : 'feito', tela: 'livros', detalhe: `${ecd.titulo}. Prazo de entrega: ${ecd.prazo.split('-').reverse().join('/')}${dias >= 0 ? ` (faltam ${dias} dia(s))` : ` (venceu há ${-dias} dia(s))`}.${ecd.avisos.length ? ` ${ecd.avisos[0]}` : ''}`.slice(0, 400) });
    if (!dispensa) etapas.push({ id: 'pendencias-ecd', titulo: 'Conferência prévia da ECD', situacao: ecd.pendencias.length ? 'contador' : 'feito', tela: 'livros', detalhe: ecd.pendencias.length ? ecd.pendencias.slice(0, 6).join(' · ').slice(0, 400) : 'O arquivo da ECD sai sem pendência.' });
  }
  etapaMesesFechados(e, etapas);
  const enc = etapaEncerramento(e, etapas, preparo);
  etapas.push({ id: 'arquivo', titulo: 'Gerar, validar, assinar e transmitir', situacao: 'contador', tela: 'livros', detalhe: 'O Murade monta o arquivo (botão "Baixar arquivo ECD"). Validar, assinar e transmitir é com você, no PGE do Sped Contábil: o sistema não transmite ECD.' });
  passos.push(pTela('livros', 'Abrindo Livros Fiscais e ECD'));
  passos.push({ tipo: 'preencher', alvo: alvoDoCampo('ecd-ano'), valor: String(e.ano), legenda: `Ano-calendário da ECD: ${e.ano}` });
  passos.push(pDestacarTexto('Balanço Patrimonial', `Balanço Patrimonial de ${e.ano}`));
  passos.push(pDestacarTexto('DRE gerencial', `DRE de ${e.ano}`));
  passos.push(pDestacarTexto('Encerramento do resultado', 'Encerramento do resultado do ano'));
  passos.push(pDestacarTexto('Conferência prévia', 'O que ainda falta na ECD'));
  if (enc.pendente) { passos.push(pTela('aprovacoes', 'Abrindo Aprovar lançamentos')); passos.push(pParar('aprovacao-aprovar', 'Aprovar o encerramento do resultado. Só você aprova')); }
  else passos.push(pParar('ecd-baixar', 'Baixar arquivo ECD. Depois valide, assine e transmita no PGE'));
  return { roteiro: 'ecd_ano', cnpj: e.cnpj, nomeEmpresa: e.nome, referencia: String(e.ano), titulo: `ECD de ${e.ano} — ${e.nome || fmtCnpj(e.cnpj)}`, etapas, preparo, passos };
}

export function levantarEncerramento(e: EntradaAno): Levantamento {
  const etapas: EtapaServico[] = []; const preparo: ItemPreparo[] = []; const passos: PassoPiloto[] = [pEmpresa(e.cnpj, e.nome)];
  etapaMesesFechados(e, etapas);
  const enc = etapaEncerramento(e, etapas, preparo);
  passos.push(pTela('livros', 'Abrindo Livros Fiscais e ECD'));
  passos.push({ tipo: 'preencher', alvo: alvoDoCampo('encerramento-ano'), valor: String(e.ano), legenda: `Ano do encerramento: ${e.ano}` });
  passos.push(pDestacarTexto('Encerramento do resultado', 'Prévia do encerramento: contas de resultado zeradas contra Lucros ou Prejuízos Acumulados'));
  if (enc.pendente) { passos.push(pTela('aprovacoes', 'Abrindo Aprovar lançamentos')); passos.push(pParar('aprovacao-aprovar', 'Aprovar o encerramento. Só você aprova')); }
  else { passos.push(pTela('aprovacoes', 'Abrindo Aprovar lançamentos')); passos.push(pDestacarTexto('Serviços preparados pela Agente', 'O encerramento preparado aparece aqui para você aprovar')); }
  return { roteiro: 'encerramento_resultado', cnpj: e.cnpj, nomeEmpresa: e.nome, referencia: String(e.ano), titulo: `Encerramento do resultado de ${e.ano} — ${e.nome || fmtCnpj(e.cnpj)}`, etapas, preparo, passos };
}

export function levantarBalanceteCliente(e: { cnpj: string; nome: string; competencia: string; dados: Record<string, any>; fechadas: Set<string> }): Levantamento {
  const { competencia: c, dados } = e;
  const contas = arr(dados.contas), lancamentos = arr(dados.lancamentos), pre = arr(dados.preLancamentos);
  const etapas: EtapaServico[] = [];
  const pendPre = pre.filter((p) => p?.status === 'pendente_conferencia' && p.competencia === c).length;
  const pendMan = lancamentos.filter((l) => l?.statusManual === 'pendente_aprovacao' && normalizarDataContabil(String(l.data || ''))?.slice(0, 7) === c).length;
  etapas.push(pendPre || pendMan
    ? { id: 'pendencias', titulo: 'O que ainda não entrou', situacao: 'aviso', tela: 'aprovacoes', detalhe: `O balancete só usa lançamento aprovado: ${pendPre} rascunho(s) do Fiscal/DP e ${pendMan} lançamento(s) manual(is) de ${mesAno(c)} ainda não entraram. Aprove antes de mandar ao cliente.` }
    : { id: 'pendencias', titulo: 'O que ainda não entrou', situacao: 'feito', tela: 'aprovacoes', detalhe: `Nada pendente de aprovação em ${mesAno(c)}.` });
  etapas.push({ id: 'competencia', titulo: 'Competência fechada?', situacao: e.fechadas.has(c) ? 'feito' : 'aviso', tela: 'gestao-contabil', detalhe: e.fechadas.has(c) ? `${mesAno(c)} está fechada: os números não mudam mais.` : `${mesAno(c)} ainda está aberta: os números podem mudar até você fechar.` });
  const rel = gerarRelatoriosContabeis(contas, lancamentos, c);
  const dif = rel.totalSaldoDevedorCentavos - rel.totalSaldoCredorCentavos;
  const movimentadas = rel.balancete.filter((b) => b.debitoPeriodoCentavos || b.creditoPeriodoCentavos).length;
  etapas.push({ id: 'balancete', titulo: 'Balancete', situacao: rel.invalidos.length || dif !== 0 ? 'aviso' : 'feito', tela: 'balancete', detalhe: `${movimentadas} conta(s) movimentada(s) em ${mesAno(c)}; ${dif === 0 ? 'saldos devedores e credores fecham' : `diferença de ${moedaContabil(Math.abs(dif))} entre devedores e credores`}${rel.invalidos.length ? `; ${rel.invalidos.length} lançamento(s) inválido(s) ficaram de fora` : ''}.` });
  const r = resultadoDoPeriodo(contas, lancamentos, c);
  etapas.push({ id: 'dre', titulo: 'DRE do mês', situacao: 'feito', tela: 'livros', detalhe: `Receitas ${moedaContabil(r.receitas)}, despesas ${moedaContabil(r.despesas)}, ${r.resultado >= 0 ? 'lucro' : 'prejuízo'} de ${moedaContabil(Math.abs(r.resultado))} (gerencial, pelas contas do plano).` });
  etapas.push({ id: 'envio', titulo: 'Mandar ao cliente', situacao: 'falta_sistema', tela: 'balancete', detalhe: 'O Contábil ainda não envia o balancete nem a DRE ao cliente por e-mail ou WhatsApp. Exporte o CSV do balancete ou o PDF dos livros e envie você.' });
  const passos: PassoPiloto[] = [
    pEmpresa(e.cnpj, e.nome),
    pTela('balancete', 'Abrindo o Balancete'),
    { tipo: 'selecionar', alvo: alvoDoCampo('balancete-competencia'), valor: c, legenda: `Competência ${mesAno(c)}` },
    pDestacarTexto('Balancete local', `${movimentadas} conta(s) movimentada(s) em ${mesAno(c)}`),
    pTela('livros', 'Abrindo Livros Fiscais e ECD'),
    pDestacarTexto('DRE gerencial', `Resultado de ${mesAno(c)}: ${r.resultado >= 0 ? 'lucro' : 'prejuízo'} de ${moedaContabil(Math.abs(r.resultado))}`),
    pTela('balancete', 'Voltando ao Balancete'),
    { tipo: 'selecionar', alvo: alvoDoCampo('balancete-competencia'), valor: c, legenda: `Competência ${mesAno(c)}` },
    pParar('balancete-exportar', 'Exportar o balancete para mandar ao cliente. O clique é seu'),
  ];
  return { roteiro: 'balancete_cliente', cnpj: e.cnpj, nomeEmpresa: e.nome, referencia: c, titulo: `Balancete e DRE de ${mesAno(c)} — ${e.nome || fmtCnpj(e.cnpj)}`, etapas, preparo: [], passos };
}

// ---------------------------------------------------------------------------------------------
// Leitura pelas rotas (com a sessão do usuário)
// ---------------------------------------------------------------------------------------------
type Empresa = { cnpj: string; nome: string };
const limpa = (v: unknown) => String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

async function resolverEmpresa(ctx: ContextoAgente, args: Record<string, any>): Promise<Empresa | { erro: string; pergunta?: string }> {
  const r = await ctx.chamarApi('GET', '/api/workspaces');
  if (!ok(r)) return erroApi(r);
  const lista: Empresa[] = arr(r.corpo?.empresas).map((e: any) => ({ cnpj: limpa(e.cnpj), nome: String(e.razaoSocial || e.nomeFantasia || e.nome || '') }));
  if (!lista.length) return { erro: 'Não há nenhuma empresa liberada para este usuário.' };
  const cnpj = limpa(args.cnpj);
  if (cnpj) { const e = lista.find((x) => x.cnpj === cnpj); return e || { erro: 'Essa empresa não está entre as empresas liberadas para este usuário.' }; }
  const falado = semAcento(args.empresa).trim();
  if (falado) {
    const achadas = lista.filter((e) => semAcento(e.nome).includes(falado));
    if (achadas.length === 1) return achadas[0];
    if (achadas.length > 1) return { erro: 'Mais de uma empresa com esse nome.', pergunta: `Qual delas: ${achadas.slice(0, 6).map((e) => `${e.nome} (${fmtCnpj(e.cnpj)})`).join('; ')}?` };
  }
  if (lista.length === 1) return lista[0];
  return { erro: 'Falta saber a empresa.', pergunta: `Para qual empresa? ${lista.slice(0, 8).map((e) => `${e.nome || 'sem nome'} (${fmtCnpj(e.cnpj)})`).join('; ')}${lista.length > 8 ? '…' : ''}` };
}

async function levantar(ctx: ContextoAgente, roteiro: RoteiroServico, emp: Empresa, referencia: string, contaDestino?: string): Promise<Levantamento | { erro: string }> {
  const ws = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}`);
  if (!ok(ws)) return erroApi(ws);
  const dados = ws.corpo?.dados;
  if (!dados || typeof dados !== 'object') return { erro: 'Esta empresa ainda não tem dados contábeis salvos (plano de contas e lançamentos).' };
  const f = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}/fechamentos`);
  const fechadas = new Set<string>(ok(f) ? arr(f.corpo?.fechamentos).map((x: any) => String(x.competencia)) : []);
  if (roteiro === 'fechamento_mensal') {
    if (fechadas.has(referencia)) return { erro: `A competência ${mesAno(referencia)} já está fechada. Nada a fazer nela; se quiser, faço o balancete para o cliente.` };
    let extrato: EntradaFechamento['extrato'] = null;
    const ex = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}/extratos`);
    if (ok(ex)) {
      const resumo = arr(ex.corpo?.resumo).map((x: any) => ({ contaBanco: String(x.contaBanco), pendentes: Number(x.pendentes) || 0, conciliados: Number(x.conciliados) || 0, lancados: Number(x.lancados) || 0 }));
      const pendentesPorConta: NonNullable<EntradaFechamento['extrato']>['pendentesPorConta'] = {};
      for (const conta of resumo.filter((x) => x.pendentes > 0).slice(0, 5)) {
        const m = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}/extratos?contaBanco=${q(conta.contaBanco)}&competencia=${q(referencia)}`);
        if (ok(m)) pendentesPorConta[conta.contaBanco] = arr(m.corpo?.movimentos).filter((x: any) => x?.situacao === 'pendente' && typeof x.fitid === 'string').map((x: any) => ({ fitid: x.fitid, valorCentavos: Number(x.valorCentavos) || 0, sugestaoConta: x.sugestaoConta ?? null, sugestaoLancamentoId: x.sugestaoLancamentoId ?? null }));
      }
      extrato = { resumo, pendentesPorConta };
    }
    return levantarFechamentoMensal({ cnpj: emp.cnpj, nome: emp.nome, competencia: referencia, dados, fechadas, extrato });
  }
  if (roteiro === 'balancete_cliente') return levantarBalanceteCliente({ cnpj: emp.cnpj, nome: emp.nome, competencia: referencia, dados, fechadas });
  const ano = Number(referencia);
  const enc = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}/encerramento?ano=${ano}${contaDestino ? `&contaDestino=${q(contaDestino)}` : ''}`);
  const entrada: EntradaAno = { cnpj: emp.cnpj, nome: emp.nome, ano, dados, fechadas, hoje: new Date(`${ctx.hoje}T12:00:00Z`), encerramento: ok(enc) ? enc.corpo : null };
  return roteiro === 'ecd_ano' ? levantarEcdAno(entrada) : levantarEncerramento(entrada);
}

function referenciaDoPedido(roteiro: RoteiroServico, args: Record<string, any>, hoje: string): { referencia: string; assumida: boolean } | { erro: string } {
  if (ROTEIROS[roteiro].referencia === 'competencia') {
    if (args.competencia) { const c = String(args.competencia).trim(); return COMP.test(c) ? { referencia: c, assumida: false } : { erro: 'Competência inválida. Use AAAA-MM.' }; }
    return { referencia: competenciaAnterior(hoje), assumida: true };
  }
  if (args.ano) { const a = String(args.ano).trim(); return /^\d{4}$/.test(a) && Number(a) >= 2000 && Number(a) <= 2100 ? { referencia: a, assumida: false } : { erro: 'Ano inválido. Use AAAA.' }; }
  return { referencia: String(Number(hoje.slice(0, 4)) - 1), assumida: true };
}

// ---------------------------------------------------------------------------------------------
// Segundo plano: o preparo roda no SERVIDOR, com a sessão de quem pediu. A pessoa pode sair da tela; no fim o registro vira
// "pronto_para_conferir" e a tela avisa "Seu pedido está pronto para você conferir". Um serviço igual (mesma sessão, empresa,
// roteiro e referência) não roda duas vezes ao mesmo tempo.
// ---------------------------------------------------------------------------------------------
export const FRASE_INICIO = 'Vou fazer aqui com a tela aberta. Se quiser, pode continuar usando o sistema que eu sigo trabalhando do mesmo jeito e te entrego o pedido.';
export const FRASE_PRONTO = 'Seu pedido está pronto para você conferir.';
const trabalhos = new Map<string, Promise<void>>();
/** Para testes e para o desligamento: espera os serviços em segundo plano terminarem. */
export async function aguardarServicosEmSegundoPlano(): Promise<void> { await Promise.all([...trabalhos.values()]); }
export const servicosEmSegundoPlano = (): number => trabalhos.size;

async function concluirPreparo(ctx: ContextoAgente, l: Levantamento): Promise<{ feitos: number; total: number; falhas: string[]; registrado: boolean }> {
  const resultados = await executarPreparo(ctx, l.cnpj, l.preparo);
  const etapas = etapasDepoisDoPreparo(l.etapas, resultados);
  const registrado = await registrar(ctx, { ...l, etapas }, 'pronto_para_conferir');
  const falhas = resultados.filter((r) => !r.ok).map((r) => r.mensagem);
  try { await ctx.registrar({ evento: falhas.length === resultados.length && resultados.length ? 'falha' : 'confirmada', ferramenta: 'fazer_servico_completo', cnpj: l.cnpj, resumo: `Serviço completo: ${l.titulo}`.slice(0, 280), resultado: `${resultados.length - falhas.length} de ${resultados.length} preparo(s) feito(s) a pedido do contador.${falhas.length ? ` Falhas: ${falhas.join(' ')}` : ''}`.slice(0, 300) }); } catch { /* o histórico não trava o serviço */ }
  return { feitos: resultados.length - falhas.length, total: resultados.length, falhas, registrado };
}

function iniciarEmSegundoPlano(ctx: ContextoAgente, l: Levantamento): boolean {
  const chave = `${ctx.sessaoHash}|${l.cnpj}|${l.roteiro}|${l.referencia}`;
  if (trabalhos.has(chave)) return false;
  const t = concluirPreparo(ctx, l).then(() => undefined).catch((e) => { console.error('Falha no serviço completo em segundo plano:', e?.message || e); }).finally(() => { trabalhos.delete(chave); });
  trabalhos.set(chave, t);
  return true;
}

async function registrar(ctx: ContextoAgente, l: Levantamento, estado: 'em_andamento' | 'aguardando_preparo' | 'pronto_para_conferir'): Promise<boolean> {
  const resumo = l.etapas.filter((x) => x.situacao === 'contador' || x.situacao === 'falta_sistema' || x.situacao === 'aviso').map((x) => x.titulo).join(', ');
  try {
    const r = await ctx.chamarApi('POST', '/api/servico-completo', { cnpj: l.cnpj, roteiro: l.roteiro, referencia: l.referencia, estado, titulo: l.titulo, resumo: resumo ? `Depende de você: ${resumo}.` : 'Tudo pronto: falta só a sua conferência.', etapas: l.etapas });
    return ok(r);
  } catch { return false; }
}

const resumoEtapas = (etapas: EtapaServico[]) => etapas.map((x) => ({ etapa: x.titulo, situacao: x.situacao, detalhe: x.detalhe }));

// ---------------------------------------------------------------------------------------------
// Execução do preparo (um cartão só)
// ---------------------------------------------------------------------------------------------
export async function executarPreparo(ctx: ContextoAgente, cnpj: string, itens: ItemPreparo[]): Promise<Array<{ item: ItemPreparo; ok: boolean; mensagem: string }>> {
  const saida: Array<{ item: ItemPreparo; ok: boolean; mensagem: string }> = [];
  for (const item of itens) {
    let r: { status: number; corpo: any };
    try {
      if (item.tipo === 'reprocessar_recepcao') r = await ctx.chamarApi('POST', `/api/workspaces/${q(cnpj)}/reprocessar-recepcao`, {});
      else if (item.tipo === 'lancamentos_padrao') r = await ctx.chamarApi('POST', `/api/workspaces/${q(cnpj)}/lancamentos-padrao/preparar`, { competencia: item.competencia });
      else if (item.tipo === 'conciliacao') r = await ctx.chamarApi('POST', `/api/workspaces/${q(cnpj)}/extratos/aceitar-sugestoes`, { contaBanco: item.contaBanco, fitids: item.fitids });
      else r = await ctx.chamarApi('POST', `/api/workspaces/${q(cnpj)}/encerramento`, { ano: item.ano, contaDestino: item.contaDestino });
    } catch (e: any) { r = { status: 503, corpo: { motivo: 'Falha de comunicação.' } }; }
    saida.push(ok(r) ? { item, ok: true, mensagem: String(r.corpo?.mensagem || 'Feito.').slice(0, 300) } : { item, ok: false, mensagem: erroApi(r).erro });
  }
  return saida;
}

/** Depois do preparo: a etapa vira "preparado" (ou "aviso" com o motivo, se a rota recusou). */
export function etapasDepoisDoPreparo(etapas: EtapaServico[], resultados: Array<{ item: ItemPreparo; ok: boolean; mensagem: string }>): EtapaServico[] {
  return etapas.map((x) => {
    const r = resultados.filter((y) => y.item.etapa === x.id);
    if (!r.length) return x;
    const falhou = r.filter((y) => !y.ok);
    if (falhou.length) return { ...x, situacao: 'aviso', detalhe: `${x.detalhe} Não consegui preparar: ${falhou.map((y) => y.mensagem).join(' ')}`.slice(0, 400) };
    // Recepção com rascunhos pendentes continua dependendo do contador (contabilizar é o clique dele).
    return { ...x, situacao: x.situacao === 'contador' ? 'contador' : 'preparado', detalhe: `${x.detalhe} ${r.map((y) => y.mensagem).join(' ')}`.slice(0, 400) };
  });
}

// ---------------------------------------------------------------------------------------------
// Ferramentas da Agente
// ---------------------------------------------------------------------------------------------
const nomesRoteiros = 'fechamento_mensal (fechar o mês: receber do Fiscal e do DP, lançamentos padrão, conciliação, depreciação, conferência, livros), ecd_ano, encerramento_resultado, balancete_cliente (balancete e DRE para o cliente)';
const propsServico = {
  servico: { type: 'STRING', description: `Qual serviço: ${nomesRoteiros}. Pode ser o pedido com as palavras do contador.` },
  cnpj: { type: 'STRING', description: 'CNPJ da empresa. Se não souber, deixe vazio e use "empresa".' },
  empresa: { type: 'STRING', description: 'Nome da empresa como o contador falou (quando não tiver o CNPJ).' },
  competencia: { type: 'STRING', description: 'AAAA-MM, só se o contador disse o mês (fechamento e balancete). Sem ela, uso o mês anterior.' },
  ano: { type: 'STRING', description: 'AAAA, só se o contador disse o ano (ECD e encerramento). Sem ele, uso o ano anterior.' },
  conta_destino: { type: 'STRING', description: 'Opcional (encerramento/ECD): código da conta do PL escolhida pelo contador; sem ela, uso Lucros ou Prejuízos Acumulados do plano.' },
  decisao_do_contador: { type: 'OBJECT', description: 'Só quando o contador CONFIRMOU fazer diferente do que a norma/o sistema indica. Fica registrado no resumo e no histórico.', properties: {
    pedido: { type: 'STRING', description: 'O que o contador decidiu, curto (ex.: "encerrar contra a conta 2.3.05").' },
    orientacao_do_sistema: { type: 'STRING', description: 'O que a norma/o sistema indicava (ex.: "encerrar contra Lucros ou Prejuízos Acumulados").' },
    fonte: { type: 'STRING', description: 'A fonte oficial (ex.: "NBC TG 26", "ITG 2000", "Lei 6.404/76, art. 186").' },
    fonte_url: { type: 'STRING', description: 'Opcional: link oficial da fonte (o que o Consultor devolveu).' },
  } },
};

/**
 * Regra do dono: se o contador decide fazer diferente do que a norma/o sistema indica (outra conta, outro critério), a Agente
 * explica curto a orientação com a fonte e, se ele confirmar, FAZ do jeito dele. Fica registrado no resumo de "A conferir"
 * e no histórico da Agente. Nunca trava por isso (só o que é claramente ilegal a Agente recusa, pela instrução).
 */
export function etapaDecisaoDoContador(args: Record<string, any>): EtapaServico | null {
  const d = args?.decisao_do_contador;
  if (!d || typeof d !== 'object') return null;
  const t = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const pedido = t(d.pedido, 160), orientacao = t(d.orientacao_do_sistema, 160), fonte = t(d.fonte, 80);
  if (!pedido || !orientacao) return null;
  return { id: 'decisao-contador', titulo: 'Feito como o contador decidiu', situacao: 'aviso', detalhe: `Feito como o contador decidiu: ${pedido}. A orientação do sistema era: ${orientacao}${fonte ? ` (${fonte})` : ''}. Decisão e responsabilidade do contador.` };
}

/** Adicional pago por escritório: pergunta ao próprio servidor (sessão de quem fala). Qualquer falha = não liberado. */
export async function liberacaoDoConsultor(ctx: ContextoAgente): Promise<{ liberado: boolean; escritorio: string | null }> {
  try {
    const r = await ctx.chamarApi('GET', '/api/consultor/liberado');
    return { liberado: ok(r) && r.corpo?.liberado === true, escritorio: typeof r.corpo?.escritorio === 'string' ? r.corpo.escritorio : null };
  } catch { return { liberado: false, escritorio: null }; }
}
const NAO_LIBERADO = { status: 'adicional_nao_liberado', instrucao: `Responda exatamente, sem mais nada: "${FRASE_NAO_LIBERADO}" Não faça o serviço completo; o resto do sistema continua igual.` };

async function prepararPedido(ctx: ContextoAgente, args: Record<string, any>): Promise<{ l: Levantamento; assumida: boolean } | { erro: string; pergunta?: string }> {
  const roteiro = identificarRoteiro(args.servico);
  if (!roteiro) return { erro: 'Não entendi qual serviço.', pergunta: 'Qual serviço você quer que eu faça: fechar o mês, a ECD do ano, o encerramento do resultado ou o balancete e a DRE para o cliente?' };
  const emp = await resolverEmpresa(ctx, args);
  if ('erro' in emp) return emp;
  const ref = referenciaDoPedido(roteiro, args, ctx.hoje);
  if ('erro' in ref) return ref;
  const contaDestino = typeof args.conta_destino === 'string' && /^[0-9A-Za-z.\-]{1,30}$/.test(args.conta_destino.trim()) ? args.conta_destino.trim() : undefined;
  const l = await levantar(ctx, roteiro, emp, ref.referencia, contaDestino);
  if ('erro' in l) return l;
  const decisao = etapaDecisaoDoContador(args);
  if (decisao) l.etapas.unshift(decisao);
  return { l, assumida: ref.assumida };
}

export const FERRAMENTAS_SERVICO_COMPLETO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: {
      name: 'fazer_servico_completo',
      description: `Faz o SERVIÇO INTEIRO pedido pelo contador, como um funcionário: "fecha o mês da empresa X", "concilia o banco", "lança o que veio do Fiscal e do DP", "faz a ECD", "encerra o resultado", "monta o balancete/DRE para o cliente". Levanta tudo o que o sistema já sabe, mostra a tela passando pelas telas (para antes de aprovar/fechar) e já prepara no servidor, em segundo plano, o que dá para preparar (tudo pendente de aprovação). No fim avisa "Seu pedido está pronto para você conferir". Serviços: ${nomesRoteiros}.`,
      parameters: { type: 'OBJECT', properties: propsServico, required: ['servico'] },
    },
    async executar(ctx, args) {
      const lib = await liberacaoDoConsultor(ctx);
      if (!lib.liberado) return NAO_LIBERADO;
      const p = await prepararPedido(ctx, args);
      if ('erro' in p) return p.pergunta ? { status: 'falta_informacao', pergunta: p.pergunta, instrucao: 'Faça ao contador esta pergunta, UMA vez, em uma frase, e depois chame fazer_servico_completo de novo com a resposta.' } : { erro: p.erro };
      const { l } = p;
      const decisao = l.etapas.find((x) => x.id === 'decisao-contador');
      if (decisao) try { await ctx.registrar({ evento: 'proposta', ferramenta: 'fazer_servico_completo', cnpj: l.cnpj, resumo: decisao.detalhe.slice(0, 280) }); } catch { /* o histórico não trava o serviço */ }
      if (decisao) {
        const d = args.decisao_do_contador || {};
        // Registro de decisões do Consultor Murade (fail-open: sem consultor, fica só no resumo e no histórico daqui).
        await registrarDecisaoNoConsultor({ escritorio: lib.escritorio || undefined, usuario: ctx.login, pergunta: `Serviço completo: ${l.titulo}`, orientacao: String(d.orientacao_do_sistema || '').slice(0, 400), fonte: typeof d.fonte_url === 'string' && d.fonte_url ? { titulo: String(d.fonte || d.fonte_url).slice(0, 160), url: d.fonte_url } : undefined, escolhaDoContador: String(d.pedido || '').slice(0, 400) }, opcoesConsultorParaTeste.atual).catch(() => false);
      }
      // O pedido do contador é a autorização do serviço: o preparo (tudo pendente de aprovação, nada definitivo) começa já,
      // no servidor, e segue mesmo que ele saia da tela. Aprovar, contabilizar e fechar continuam só no clique dele.
      const estado = l.preparo.length ? 'em_andamento' : 'pronto_para_conferir';
      const registrado = await registrar(ctx, l, estado);
      const jaRodando = l.preparo.length ? !iniciarEmSegundoPlano(ctx, l) : false;
      // Sem o registro, o painel "A conferir" não aparece: o piloto não tenta destacá-lo (senão pararia no meio).
      const passos = registrado ? l.passos : l.passos.filter((x) => x.alvo !== 'texto:Serviços preparados pela Agente');
      const plano = montarPlano(`Serviço completo: ${l.titulo}`, passos);
      if (plano) plano.segundoPlanoAoInterferir = true;
      return {
        status: 'servico_levantado', servico: ROTEIROS[l.roteiro].titulo, empresa: l.nomeEmpresa, cnpj: l.cnpj, referencia: l.referencia,
        referenciaAssumida: p.assumida ? `Usei ${ROTEIROS[l.roteiro].referencia === 'competencia' ? `a competência ${mesAno(l.referencia)} (mês anterior)` : `o ano ${l.referencia} (ano anterior)`}, porque o pedido não disse. Diga isso ao contador.` : undefined,
        etapas: resumoEtapas(l.etapas),
        preparandoEmSegundoPlano: l.preparo.map((x) => x.descricao),
        jaEstavaEmAndamento: jaRodando || undefined,
        registradoEmAConferir: registrado,
        falarAgora: FRASE_INICIO,
        instrucao: [
          `Comece a resposta EXATAMENTE com: "${FRASE_INICIO}"`,
          plano ? 'A tela do contador já está mostrando o serviço, tela por tela, e para antes de aprovar ou fechar. Se ele mexer ou sair, o serviço segue no servidor.' : 'Não consegui montar a animação na tela; o serviço segue no servidor.',
          l.preparo.length ? 'O preparo já está rodando no servidor (não chame preparar_servico_completo). Quando terminar, a tela avisa "Seu pedido está pronto para você conferir", com o link para A conferir.' : 'Não havia nada a preparar: o resumo já está em "A conferir" (tela Aprovar lançamentos).',
          'Depois da frase inicial, no máximo 2 frases curtas: o que depende do contador (aprovar, contabilizar, fechar, conferir) e o que o sistema ainda não faz (situacao falta_sistema). Nunca diga que aprovou, contabilizou ou fechou.',
        ].join(' '),
        ...(plano ? { piloto: plano } : {}),
      };
    },
  },
  {
    tipo: 'acao',
    declaracao: {
      name: 'preparar_servico_completo',
      description: 'Opção MANUAL (só quando o contador pedir para confirmar antes, ou para refazer só o preparo): propõe, num CARTÃO ÚNICO, preparar de uma vez o que o serviço completo levantou: buscar de novo o que veio do Fiscal e do DP, preparar os lançamentos padrão, aceitar as sugestões da conciliação bancária e preparar o encerramento do resultado. Tudo fica pendente de aprovação; nada é aprovado nem fechado. Depois do sim, o resumo fica em "A conferir" e o serviço é marcado como feito.',
      parameters: { type: 'OBJECT', properties: propsServico, required: ['servico'] },
    },
    async preparar(ctx, args) {
      if (!(await liberacaoDoConsultor(ctx)).liberado) return { erro: FRASE_NAO_LIBERADO };
      const p = await prepararPedido(ctx, args);
      if ('erro' in p) return { erro: p.pergunta ? `${p.erro} ${p.pergunta}` : p.erro };
      const { l } = p;
      if (!l.preparo.length) return { erro: 'Não há nada a preparar neste serviço: ele já está em "A conferir" esperando o contador.' };
      return {
        cnpj: l.cnpj,
        params: { roteiro: l.roteiro, cnpj: l.cnpj, referencia: l.referencia, titulo: l.titulo, preparo: l.preparo, etapas: l.etapas },
        titulo: `Preparar: ${l.titulo}`.slice(0, 120),
        descricao: [...l.preparo.map((x) => x.descricao), ...l.etapas.filter((x) => x.id === 'decisao-contador').map((x) => x.detalhe), 'Nada é aprovado nem fechado: aprovar, contabilizar e fechar continuam no seu clique.'],
        aviso: 'Os lançamentos preparados ficam pendentes de aprovação na tela Aprovar lançamentos.',
        resumo: `Serviço completo ${l.roteiro} ${l.referencia} ${l.cnpj}${l.etapas.some((x) => x.id === 'decisao-contador') ? ` — ${l.etapas.find((x) => x.id === 'decisao-contador')!.detalhe}` : ''}`.slice(0, 400),
      };
    },
    async executar(ctx, params) {
      const l: Levantamento = { roteiro: params.roteiro, cnpj: params.cnpj, nomeEmpresa: '', referencia: params.referencia, titulo: params.titulo, etapas: Array.isArray(params.etapas) ? params.etapas : [], preparo: Array.isArray(params.preparo) ? params.preparo : [], passos: [] };
      const r = await concluirPreparo(ctx, l);
      return {
        sucesso: r.feitos > 0,
        mensagem: `${r.feitos} de ${r.total} preparo(s) feito(s).${r.falhas.length ? ` Não consegui: ${r.falhas.join(' ')}` : ''} ${r.registrado ? 'O resumo está em "A conferir", na tela Aprovar lançamentos.' : 'Não consegui registrar o resumo em "A conferir"; o que foi preparado continua valendo.'} Aprovar e fechar é com você.`.slice(0, 600),
      };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'servicos_da_agente', description: 'Mostra os serviços completos que a Agente já deixou prontos para o contador conferir (A conferir), os que estão parados (cartão de preparo sem confirmação) e os lembretes do robô. Use para "o que você deixou pronto para mim?" ou "o que falta eu conferir?".', parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'Opcional: CNPJ para filtrar.' } } } },
    async executar(ctx, args) {
      const c = limpa(args.cnpj);
      const r = await ctx.chamarApi('GET', `/api/servico-completo${c ? `?cnpj=${q(c)}` : ''}`);
      if (!ok(r)) return erroApi(r);
      if (r.corpo?.indisponivel) return { erro: 'O registro dos serviços está indisponível agora. Não afirme que não há nada; diga que não conseguiu conferir.' };
      const lista = arr(r.corpo?.servicos).filter((s: any) => s.estado !== 'conferido' && s.estado !== 'concluido');
      return { servicos: lista.slice(0, 10).map((s: any) => ({ titulo: s.titulo, estado: s.estado, resumo: s.resumo, aviso: s.aviso })), lembretes: arr(r.corpo?.lembretes).slice(0, 5), observacao: lista.length ? undefined : 'Nenhum serviço esperando conferência.' };
    },
  },
];

export const INSTRUCAO_SERVICO_COMPLETO = `

SERVIÇO COMPLETO (você é o funcionário do contador)
- Quando o contador pedir um serviço inteiro ("fecha o mês da empresa X", "concilia o banco", "lança o que veio do Fiscal e do DP", "faz a ECD", "encerra o resultado", "monta o balancete/DRE para o cliente") ou aceitar "quer que eu faça esse serviço para você?", chame fazer_servico_completo. Ela usa tudo o que o sistema já sabe; se faltar algo (a empresa, quando há várias), ela devolve UMA pergunta: faça só essa pergunta.
- Não pergunte o modo: o serviço começa com a tela aberta e o preparo (tudo pendente de aprovação) já roda no servidor, mesmo que ele saia da tela. Comece a resposta com a frase de falarAgora. No fim a tela avisa sozinha "Seu pedido está pronto para você conferir". Só use preparar_servico_completo (cartão) se ele pedir para confirmar antes. Nada é aprovado, contabilizado nem fechado por você: isso é sempre o clique do contador.
- Se o contador pedir para fazer DIFERENTE do que a norma ou o sistema indica (outra conta, outro critério): explique em uma frase "pela norma X, o certo é assim" (fonte oficial; use consultar_legislacao se não tiver certeza) e pergunte se ele confirma. Confirmou: faça do jeito dele, passando decisao_do_contador (pedido, orientacao_do_sistema, fonte) e, se for a conta do encerramento, conta_destino. Fica registrado em "A conferir" e no histórico como decisão e responsabilidade do contador. Nunca trave por isso; só recuse o que for claramente ilegal.
- Responda curto: o que ficou pronto, o que depende dele e o que o sistema ainda não faz. Para "o que você deixou pronto para mim?", use servicos_da_agente.`;
