// Integração Fiscal → Contábil que o sistema anterior usava, convertida para as regras do reconciliador do Contábil (função pura):
//  - wfiscal.frninteg ........ fornecedor (CNPJ/CPF) → conta do plano (pelo código reduzido/"chamada" da conta, no plano da empresa)
//  - wfiscal.cadfism ......... código fiscal (CFOP; os de 3 dígitos são do formato antigo) → conta do valor contábil (e ICMS, ICMS-ST, IPI)
//  - wfiscal.cfgcodintegracao  grupos sintéticos de clientes e de fornecedores do plano (ex.: 1-1-04-01 e 2-1-03-01)
// Só vira regra a conta que existe no plano migrado da empresa; o que não tem conta ou não acha a conta fica só no registro guardado do
// sistema anterior (com aviso), nunca inventa conta.
import type { RegraIntegracaoLinha } from '../regrasIntegracaoFiscalStore';
import { converterClassificacao, type Linha } from './conversor';

const txt = (v: unknown) => String(v ?? '').trim();
const doc = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const chamada = (v: unknown) => { const t = txt(v); return t && t !== '0' ? t : ''; };

export interface LidosIntegracao { fornecedores: number; fornecedoresComConta: number; codigosFiscais: number; codigosFiscaisComConta: number; configuracoes: number }
export interface ResultadoIntegracao { regras: RegraIntegracaoLinha[]; lidos: LidosIntegracao; avisos: string[]; blocos: { fornecedores: Linha[]; codigosFiscais: Linha[]; configuracao: Linha[] } }

export function regrasIntegracaoDoBackup(ent: {
  idPlano: number | null; frninteg: Linha[]; cadfism: Linha[]; cfg: Linha[];
  /** Contas do plano da empresa no backup (wcont.contas) e o código que cada uma recebeu no Murad. */
  contasDoPlano: Linha[]; mapaContas: Record<string, string>;
  /** Contas como ficaram no Murad (código → tipo), para usar só analítica. */
  tipoConta: (codigo: string) => string | undefined;
}): ResultadoIntegracao {
  const avisos: string[] = [];
  const doPlano = (l: Linha) => ent.idPlano !== null && Number(l.idplanodecontas) === ent.idPlano;
  const porChamada = new Map<string, string>(); const porClassificacao = new Map<string, string>();
  for (const c of ent.contasDoPlano) {
    const codigo = ent.mapaContas[String(Number(c.idconta))]; if (!codigo) continue;
    const ch = txt(c.cdchamada); if (ch && !porChamada.has(ch)) porChamada.set(ch, codigo);
    const cl = converterClassificacao(c.cdclassinterna); if (cl && !porClassificacao.has(cl)) porClassificacao.set(cl, codigo);
  }
  const contaDaChamada = (v: unknown) => { const ch = chamada(v); return ch ? porChamada.get(ch) ?? '' : ''; };
  const regras: RegraIntegracaoLinha[] = [];

  // Fornecedores do plano da empresa.
  const fornecedores = ent.frninteg.filter(doPlano);
  const vistos = new Map<string, string>();
  let fornecedoresComConta = 0;
  for (const f of fornecedores) {
    const chave = doc(f.codfornecedor); const ch = chamada(f.cdchamadaconta);
    if (!chave) continue;
    if (ch) fornecedoresComConta++;
    const conta = contaDaChamada(f.cdchamadaconta);
    if (ch && !conta) avisos.push(`Fornecedor ${txt(f.codfornecedor)}: a conta ${ch} (${txt(f.nmconta)}) não está no plano da empresa; a nota dele usa a conta do mapeamento.`);
    if (conta && ent.tipoConta(conta) !== 'analitica') avisos.push(`Fornecedor ${txt(f.codfornecedor)}: a conta ${conta} não é analítica; a nota dele usa a conta do mapeamento.`);
    const ja = vistos.get(chave);
    if (ja !== undefined) { if (ja !== conta) avisos.push(`Fornecedor ${txt(f.codfornecedor)} aparece com duas contas no sistema anterior (${ja || 'sem conta'} e ${conta || 'sem conta'}); ficou a primeira.`); continue; }
    vistos.set(chave, conta);
    if (!conta) continue;
    regras.push({ tipo: 'fornecedor', chave, conta, descricao: txt(f.nmconta) || txt(f.codfornecedor), dados: { fornecedor: txt(f.codfornecedor), contaChamada: ch, plano: txt(f.nmplanodecontas) } });
  }

  // Códigos fiscais (tabela única do sistema anterior; as contas são as do plano de cada empresa).
  let codigosFiscaisComConta = 0; const codigosGuardados: Linha[] = [];
  for (const c of ent.cadfism) {
    const ch = { valor: chamada(c.cdcontavicontabil), icms: chamada(c.cdcontaviicm), icmsSt: chamada(c.cdcontaviicmst), ipi: chamada(c.cdcontaviipi) };
    if (!ch.valor && !ch.icms && !ch.icmsSt && !ch.ipi) continue;
    codigosFiscaisComConta++; codigosGuardados.push(c);
    const codigo = txt(c.idcodigo).replace(/\D/g, ''); if (!codigo) continue;
    const tp = txt(c.sttipo).toUpperCase();
    const entrada = tp === 'E' || (tp !== 'S' && /^[123]/.test(codigo));
    const conta = contaDaChamada(c.cdcontavicontabil);
    if (ch.valor && !conta) avisos.push(`Código fiscal ${codigo} (${txt(c.nmnome)}): a conta ${ch.valor} não está no plano da empresa.`);
    if (!conta) continue;
    regras.push({ tipo: entrada ? 'cfop_entrada' : 'cfop_saida', chave: codigo, conta, descricao: txt(c.nmnome),
      dados: { contaIcms: contaDaChamada(c.cdcontaviicm), contaIcmsSt: contaDaChamada(c.cdcontaviicmst), contaIpi: contaDaChamada(c.cdcontaviipi), chamadas: ch, formatoAntigo: codigo.length !== 4 } });
  }

  // Grupos sintéticos de clientes e fornecedores do plano.
  const cfg = ent.cfg.filter(doPlano);
  for (const g of cfg.slice(0, 1)) {
    for (const [tipo, col, nome] of [['grupo_clientes', 'dsclasssinteticocli', 'Clientes'], ['grupo_fornecedores', 'dsclasssinteticofor', 'Fornecedores']] as const) {
      const cl = converterClassificacao(g[col]); if (!cl) continue;
      const conta = porClassificacao.get(cl) ?? '';
      if (!conta) { avisos.push(`Grupo de ${nome.toLowerCase()} ${txt(g[col])}: a conta não está no plano da empresa.`); continue; }
      regras.push({ tipo, chave: nome.toLowerCase(), conta, descricao: `${nome} (${txt(g[col])})`, dados: { classificacao: txt(g[col]), configuracao: txt(g.descricao) } });
    }
  }
  if (cfg.length > 1) avisos.push(`O plano tem ${cfg.length} configurações de integração no sistema anterior; valeu a primeira.`);
  return {
    regras, avisos: avisos.slice(0, 50),
    lidos: { fornecedores: fornecedores.length, fornecedoresComConta, codigosFiscais: ent.cadfism.length, codigosFiscaisComConta, configuracoes: cfg.length },
    blocos: { fornecedores, codigosFiscais: codigosGuardados, configuracao: cfg },
  };
}

/** Para a conferência: as regras que o registro guardado do sistema anterior manda ter hoje (mesma conversão). */
export function compararRegras(esperadas: RegraIntegracaoLinha[], gravadas: Array<{ tipo: string; chave: string; conta: string }>): string[] {
  const g = new Map(gravadas.map((x) => [`${x.tipo}|${x.chave}`, x.conta]));
  const dif: string[] = [];
  for (const e of esperadas) {
    const k = `${e.tipo}|${e.chave}`;
    if (!g.has(k)) dif.push(`${e.tipo} ${e.chave}: faltou (no sistema anterior, conta ${e.conta || 'sem conta'})`);
    else if (g.get(k) !== e.conta) dif.push(`${e.tipo} ${e.chave}: conta ${g.get(k) || 'vazia'} no Murad, ${e.conta || 'vazia'} no sistema anterior`);
    g.delete(k);
  }
  return dif;
}
