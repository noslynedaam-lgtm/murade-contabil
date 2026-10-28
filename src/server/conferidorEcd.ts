// Conferência automática da ECD por empresa: diz se a escrituração já está pronta para o contador, o que falta e o prazo.
// Só lê o cadastro e os lançamentos; nunca altera nada. Os vínculos de alta confiança com o plano referencial são
// considerados como se já estivessem aplicados (a tela os grava quando o contador abre a ECD).
import type { EmpresaDados } from '../types';
import { analisarObrigatoriedadeECD, gerarArquivoECD, montarParametrosECD, naturezasDasContas, prazoEntregaECD, type ProntidaoECD } from '../services/ecdService';
import { codPlanRefECD, regimeReferencial, sugerirMapeamento } from '../services/planoReferencialService';
import { conferirBlocoL } from '../services/ecfBlocoLService';
import { gerarArquivoEcf } from '../services/ecfArquivoService';
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
  if (r.ok && regimeRef && r.saldosAnuais) pendencias.push(...conferirBlocoL(regimeRef, r.saldosAnuais, mapa).erros.map((e) => `ECF (Bloco L): ${e}`));
  // DLPA/DMPL: confere, no arquivo pronto, J215 (soma) = J210 (saldo final) = I155 de dezembro, e saldo inicial = I155 de janeiro.
  if (r.ok && r.conteudo) {
    const L = r.conteudo.split('\r\n');
    const n = (v: string, dc: string) => Math.round(Number(v.replace(',', '.')) * 100) * (dc === 'D' ? -1 : 1);
    const jan = new Map<string, number>(), dez = new Map<string, number>();
    let per = '';
    for (const x of L) {
      const f = x.split('|');
      if (f[1] === 'I150') per = f[2].slice(2, 4);
      if (f[1] === 'I155' && per === '01') jan.set(f[2], n(f[4], f[5]) * -1);
      if (f[1] === 'I155' && per === '12') dez.set(f[2], n(f[8], f[9]) * -1);
    }
    for (let i = 0; i < L.length; i++) {
      const f = L[i].split('|');
      if (f[1] !== 'J210') continue;
      const cod = f[3].replace(/^AG\./, '');
      let soma = 0, primeiro: number | null = null;
      for (let k = i + 1; L[k]?.startsWith('|J215|'); k++) { const g = L[k].split('|'); const v = n(g[4], g[5]) * -1; soma += v; if (primeiro === null) primeiro = v; }
      const ini = n(f[5], f[6]) * -1, fin = n(f[7], f[8]) * -1;
      if (primeiro !== ini || soma !== fin) pendencias.push(`DLPA/DMPL (J210 ${cod}): os fatos contábeis (J215) não fecham com o saldo inicial/final da conta.`);
      if ((jan.get(cod) ?? 0) !== ini) pendencias.push(`DLPA/DMPL (J210 ${cod}): saldo inicial difere do saldo de janeiro nos saldos mensais (I155).`);
      if ((dez.get(cod) ?? 0) !== fin) pendencias.push(`DLPA/DMPL (J210 ${cod}): saldo final difere do saldo de dezembro nos saldos mensais (I155).`);
    }
  }
  const avisosEcf: string[] = [];
  // ECF: cadastro (0030) e signatários (0930) exigidos pelo arquivo da ECF; as declarações S/N do 0020 o contador confirma na tela.
  if (/real|presumido/i.test(String(empresa.regime || ''))) {
    const ecf = gerarArquivoEcf({
      ano, cnpj: String(empresa.cnpj || cnpj), nome: String(empresa.razaoSocial || ''), formaTrib: /real/i.test(String(empresa.regime)) ? '1' : '5', formaApur: /real/i.test(String(empresa.regime)) ? 'A' : 'T',
      tipEscPre: 'C', mesBalRed: 'EEEEEEEEEEEE', aliqCsll: '1', flags: {}, flagsConfirmados: true,
      cadastro: { naturezaJuridica: empresa.naturezaJuridica || '', cnae: empresa.cnae || '', endereco: empresa.logradouro || empresa.endereco || '', numero: empresa.numero || '', complemento: empresa.complemento, bairro: empresa.bairro || '', uf: empresa.uf || '', codigoMunicipio: empresa.ecdCodigoMunicipioIbge || '', cep: empresa.cep || '', telefone: empresa.telefone, email: empresa.email || '' },
      signatarios: [
        { nome: empresa.responsavelNome || '', documento: empresa.responsavelCpf || '', qualificacao: empresa.responsavelQualificacao || '205', email: empresa.email || '', fone: String(empresa.telefone || empresa.whatsapp || '').replace(/\D/g, '') },
        { nome: empresa.contadorNome || '', documento: empresa.contadorCpf || '', qualificacao: '900', crc: empresa.contadorCrc, email: empresa.contadorEmail || '', fone: String(empresa.contadorFone || '').replace(/\D/g, '') },
      ],
    });
    for (const e of ecf.erros.filter((x) => /^(0030|0930|CNPJ|Razão)/.test(x))) if (!pendencias.some((p) => p.includes(e))) avisosEcf.push(`ECF (arquivo): ${e}`);
  }
  return { ...base, pronta: r.ok && analise.situacao === 'obrigatoria', pendencias, avisos: [...(r.ok ? r.avisos : []), ...avisosEcf], atrasada: diasParaPrazo < 0 && pendencias.length > 0 };
}
