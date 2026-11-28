// Nunca duplicar empresa (regra do dono, 28/11/2026). Igual nos três sistemas.
// Antes de um cadastro NOVO (tela, Murad, foto/XML), o sistema confere se o mesmo CNPJ já está NAQUELE escritório aqui ou nos outros
// dois sistemas (cada um responde GET /api/integracao/empresas/existe com o token de integração). Se estiver, o cadastro novo é recusado
// com "Esta empresa já está cadastrada (no …). Abrindo o cadastro dela." e a ficha existente é aberta/trazida (só completa o vazio).
// Outro sistema fora do ar não bloqueia: o cadastro segue aqui e a sincronia junta depois pelo CNPJ (cada sistema guarda UMA linha
// por CNPJ — chave primária —, então dois cadastros ao mesmo tempo nunca viram duas empresas).
import { urlDoSistema } from './agentesEntreSistemas';
import { limparCadastroCompartilhado, type CadastroCompartilhado } from './sincroniaCadastroEmpresas';

export type SistemaCadastroEmpresa = 'dp' | 'fiscal' | 'contabil';
export const NOME_DO_SISTEMA: Record<SistemaCadastroEmpresa, string> = { dp: 'DP', fiscal: 'Fiscal', contabil: 'Contábil' };
export interface AchadoEmOutroSistema { sistema: SistemaCadastroEmpresa; nome: string; dados: CadastroCompartilhado }
export interface ResultadoJaCadastrada { local: boolean; nomeLocal?: string; outros: AchadoEmOutroSistema[]; foraDoAr: SistemaCadastroEmpresa[]; mensagem: string | null }

/** "Esta empresa já está cadastrada (no DP e no Fiscal). Abrindo o cadastro dela." */
export function mensagemJaCadastrada(sistemas: SistemaCadastroEmpresa[]): string | null {
  const nomes = [...new Set(sistemas)].map((s) => `no ${NOME_DO_SISTEMA[s]}`);
  if (!nomes.length) return null;
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `Esta empresa já está cadastrada (${lista}). Abrindo o cadastro dela.`;
}

/** Pergunta aos outros dois sistemas se o CNPJ está no mesmo escritório. Resposta lenta/fora do ar = não bloqueia (vai em foraDoAr). */
export async function consultarOutrosSistemas(daqui: SistemaCadastroEmpresa, cnpj: string, escritorio: string, env: Record<string, string | undefined> = process.env, buscar: typeof fetch = fetch, tempoMs = 4000): Promise<{ outros: AchadoEmOutroSistema[]; foraDoAr: SistemaCadastroEmpresa[] }> {
  const token = env.MURADE_INTEGRATION_TOKEN?.trim();
  const alvos = (['dp', 'fiscal', 'contabil'] as SistemaCadastroEmpresa[]).filter((s) => s !== daqui);
  if (!token || !escritorio) return { outros: [], foraDoAr: token ? [] : alvos };
  const respostas = await Promise.all(alvos.map(async (s) => {
    try {
      const r = await buscar(`${urlDoSistema(s, env)}/api/integracao/empresas/existe?cnpj=${encodeURIComponent(cnpj)}&escritorio=${encodeURIComponent(escritorio)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(tempoMs) });
      const j: any = await r.json().catch(() => null);
      if (!r.ok || j?.sucesso !== true) return { s, fora: true as const };
      return j.existe === true ? { s, achado: { sistema: s, nome: String(j.nome || ''), dados: limparCadastroCompartilhado(j.dados) } } : { s };
    } catch { return { s, fora: true as const }; }
  }));
  return { outros: respostas.flatMap((x: any) => (x.achado ? [x.achado] : [])), foraDoAr: respostas.filter((x: any) => x.fora).map((x) => x.s) };
}

/** Junta o que já está aqui com o que os outros sistemas têm. */
export function resultadoJaCadastrada(daqui: SistemaCadastroEmpresa, local: { existe: boolean; nome?: string }, outros: { outros: AchadoEmOutroSistema[]; foraDoAr: SistemaCadastroEmpresa[] }): ResultadoJaCadastrada {
  const onde = [...(local.existe ? [daqui] : []), ...outros.outros.map((o) => o.sistema)];
  return { local: local.existe, ...(local.nome ? { nomeLocal: local.nome } : {}), outros: outros.outros, foraDoAr: outros.foraDoAr, mensagem: mensagemJaCadastrada(onde) };
}

/** Resposta do "existe?" (rota de integração): só diz que existe se a empresa é do MESMO escritório (nunca revela de outro). */
export function respostaExiste(existe: boolean, doEscritorio: boolean, nome: string, dados: CadastroCompartilhado) {
  return existe && doEscritorio ? { sucesso: true, existe: true, nome, dados } : { sucesso: true, existe: false };
}

/** A ficha nova (foto/arquivo/CNPJ) passa a ser a ficha da empresa que JÁ existe em outro sistema: o que lá está preenchido vale;
 *  o documento e a Receita só completam o que lá está vazio. */
export function aplicarExistenteNaFicha<F extends { campos: Record<string, { valor: string; origem: string; conferir: boolean; motivo?: string }> }>(ficha: F, dados: CadastroCompartilhado, sistema: SistemaCadastroEmpresa): F {
  const mapa: Array<[keyof CadastroCompartilhado, string]> = [['razaoSocial', 'razaoSocial'], ['nomeFantasia', 'nomeFantasia'], ['inscricaoEstadual', 'inscricaoEstadual'], ['inscricaoMunicipal', 'inscricaoMunicipal'],
    ['regimeTributario', 'regime'], ['uf', 'uf'], ['cidade', 'cidade'], ['bairro', 'bairro'], ['cep', 'cep'], ['telefone', 'telefone'], ['email', 'email']];
  const campos = { ...ficha.campos };
  for (const [comum, campo] of mapa) {
    const v = String(dados[comum] || '').trim();
    if (!v || !campos[campo]) continue;
    const atual = campos[campo];
    campos[campo] = { valor: v, origem: atual.origem, conferir: Boolean(atual.valor) && atual.valor.replace(/\W/g, '').toUpperCase() !== v.replace(/\W/g, '').toUpperCase(),
      ...(atual.valor && atual.valor.replace(/\W/g, '').toUpperCase() !== v.replace(/\W/g, '').toUpperCase() ? { motivo: `Ficou o que já está no ${NOME_DO_SISTEMA[sistema]} ("${v}"); no documento/Receita está "${atual.valor}". Confira.` } : {}) };
  }
  const cnae = String(dados.cnae || '').replace(/\D/g, '').slice(0, 7);
  if (cnae.length === 7 && campos.cnae && !campos.cnae.valor) campos.cnae = { valor: `${cnae.slice(0, 4)}-${cnae.slice(4, 5)}/${cnae.slice(5)}`, origem: campos.cnae.origem, conferir: false };
  return { ...ficha, campos };
}
