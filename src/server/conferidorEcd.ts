// Conferência automática da ECD por empresa: diz se a escrituração já está pronta para o contador, o que falta e o prazo.
// Só lê o cadastro e os lançamentos; nunca altera nada. Os vínculos de alta confiança com o plano referencial são
// considerados como se já estivessem aplicados (a tela os grava quando o contador abre a ECD).
import type { EmpresaDados } from '../types';
import { analisarObrigatoriedadeECD, gerarArquivoECD, montarParametrosECD, naturezasDasContas, prazoEntregaECD, type ProntidaoECD } from '../services/ecdService';
import { codPlanRefECD, regimeReferencial, sugerirMapeamento } from '../services/planoReferencialService';
import { gerarRelatoriosContabeis } from '../utils/livrosContabeis';

export type AchadoEcd = ProntidaoECD & { cnpj: string; verificadoEm: string; diasParaPrazo: number; atrasada: boolean };

export function conferirEcdWorkspace(cnpj: string, payload: Record<string, any>, agora = new Date()): AchadoEcd | null {
  const empresa = payload?.empresa as EmpresaDados | undefined;
  if (!empresa || typeof empresa !== 'object') return null;
  const ano = agora.getFullYear() - 1;
  const analise = analisarObrigatoriedadeECD({ regime: empresa.regime, presumidoLivroCaixa: empresa.presumidoLivroCaixa, presumidoDistribuiuLucroAcimaBase: empresa.presumidoDistribuiuLucroAcimaBase, simplesAporteCapital: empresa.simplesAporteCapital });
  const prazo = prazoEntregaECD(ano);
  const diasParaPrazo = Math.ceil((Date.parse(`${prazo}T23:59:59Z`) - agora.getTime()) / 86_400_000);
  const base = { cnpj, ano, situacao: analise.situacao, titulo: analise.titulo, prazo, verificadoEm: agora.toISOString(), diasParaPrazo };
  if (analise.situacao === 'dispensada' || analise.situacao === 'facultativa') {
    return { ...base, pronta: false, pendencias: [], avisos: [analise.motivo], atrasada: false };
  }
  const contas = Array.isArray(payload.contas) ? payload.contas : [];
  const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
  const pendencias: string[] = [];
  if (analise.situacao === 'depende') pendencias.push(analise.motivo);
  if (!contas.length) {
    pendencias.push('Plano de contas vazio.');
    return { ...base, pronta: false, pendencias, avisos: [], atrasada: diasParaPrazo < 0 };
  }
  const validos = gerarRelatoriosContabeis(contas, lancamentos, 'todos').validos;
  const regimeRef = regimeReferencial(empresa.regime);
  const mapa: Record<string, string> = { ...(empresa.mapeamentoReferencial || {}) };
  if (regimeRef) {
    const nat = naturezasDasContas(contas);
    for (const s of sugerirMapeamento(contas, regimeRef, nat as Map<string, string>, mapa)) if (s.confianca === 'alta' && s.candidatos[0]) mapa[s.contaCodigo] = s.candidatos[0].codigo;
  }
  const parametros = montarParametrosECD(empresa, ano, regimeRef ? { planoReferencial: { codPlanRef: codPlanRefECD(regimeRef), mapa } } : {});
  const r = gerarArquivoECD({ parametros, contas, lancamentos: validos, centrosCusto: Array.isArray(payload.centrosCusto) ? payload.centrosCusto.map((c: any) => ({ codigo: String(c.codigo), nome: String(c.nome || c.codigo) })) : [] });
  pendencias.push(...r.erros);
  return { ...base, pronta: r.ok && analise.situacao === 'obrigatoria', pendencias, avisos: r.ok ? r.avisos : [], atrasada: diasParaPrazo < 0 && pendencias.length > 0 };
}
