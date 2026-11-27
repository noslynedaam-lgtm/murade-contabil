// "Murad, confere a empresa X" (Contábil): roda os conferidores do cadastro (src/data/conferenciaCadastroBasico.ts) e responde em 1 a 3
// frases. Só lê. Os erros daqui são de orientação (sem fonte do valor certo, a Murad não preenche): ela aponta e leva até a tela.
import { cnpjDe, erroApi, ok, type ContextoAgente, type Ferramenta } from './agenteMotor';
import { conferirCadastro, resumoDaConferenciaCadastro } from '../data/conferenciaCadastroBasico';
import { planoDeCorrecaoContabil } from './pilotoContabil';
import { fraseDaReconferencia } from '../data/agenteAgil';

async function empresa(ctx: ContextoAgente, cnpjArg: unknown, nomeArg: unknown): Promise<{ erro: string } | { empresa: any }> {
  const r = await ctx.chamarApi('GET', '/api/workspaces');
  if (!ok(r)) return erroApi(r);
  const lista: any[] = Array.isArray(r.corpo?.empresas) ? r.corpo.empresas : [];
  const cnpj = cnpjDe(cnpjArg);
  if (cnpj) { const e = lista.find((x) => cnpjDe(x?.cnpj) === cnpj); return e ? { empresa: e } : { erro: 'Essa empresa não está entre as do seu acesso.' }; }
  const nome = String(nomeArg || '').trim().toLowerCase();
  if (!nome) return lista.length === 1 ? { empresa: lista[0] } : { erro: 'Qual empresa? Diga o nome ou o CNPJ.' };
  const achadas = lista.filter((x) => `${x?.razaoSocial || ''} ${x?.nomeFantasia || ''}`.toLowerCase().includes(nome));
  return achadas.length === 1 ? { empresa: achadas[0] } : { erro: achadas.length ? `Há ${achadas.length} empresas com esse nome; diga qual (ou o CNPJ).` : 'Não achei essa empresa entre as suas.' };
}

const FERRAMENTA_CONFERIR: Ferramenta = {
  tipo: 'leitura',
  declaracao: {
    name: 'conferir_cadastro_empresa',
    description: 'Confere AGORA o cadastro da empresa ("Murad, confere a empresa X", "isso está errado"): dígitos do CNPJ, razão social, CNAE de 7 dígitos, CEP e UF. Só lê. Responda com a frase `resumo`. Para levar até o cadastro use mostrar_na_tela (tela empresa). Nunca preencha valor sem fonte.',
    parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Nome da empresa, se a pessoa disse o nome.' } } },
  },
  async executar(ctx, args) {
    const r = await empresa(ctx, args.cnpj, args.nome);
    if ('erro' in r) return r;
    const nome = String(r.empresa?.razaoSocial || r.empresa?.nomeFantasia || 'empresa').slice(0, 80);
    const achados = conferirCadastro(r.empresa);
    return { empresa: nome, tudoCerto: !achados.length, achados: achados.map((a) => ({ campo: a.rotulo, erro: a.texto, valorCerto: a.valorCerto ?? null })), resumo: resumoDaConferenciaCadastro(nome, achados), instrucao: 'Diga a frase `resumo` e nada mais. Com "sim/corrige" use corrigir_cadastro_empresa.' };
  },
};
const FERRAMENTA_CORRIGIR: Ferramenta = {
  tipo: 'leitura',
  declaracao: {
    name: 'corrigir_cadastro_empresa',
    description: 'Depois de conferir_cadastro_empresa, com "sim", "corrige", "faz certo": o piloto escolhe a empresa, abre o Cadastro de Empresa, preenche à vista só o que tem valor certo garantido (CEP no formato 00000-000, razão social sem espaços sobrando) e PARA no Salvar Empresa com o cartão de OK. O resto ele só aponta. Nunca grava sem o OK.',
    parameters: { type: 'OBJECT', properties: { cnpj: { type: 'STRING', description: 'CNPJ da empresa.' }, nome: { type: 'STRING', description: 'Nome da empresa.' } } },
  },
  async executar(ctx, args) {
    const r = await empresa(ctx, args.cnpj, args.nome);
    if ('erro' in r) return r;
    const nome = String(r.empresa?.razaoSocial || r.empresa?.nomeFantasia || 'empresa').slice(0, 80);
    const achados = conferirCadastro(r.empresa);
    const piloto = planoDeCorrecaoContabil({ cnpj: String(cnpjDe(r.empresa?.cnpj) || ''), nome }, achados);
    const soApontar = achados.filter((a) => a.correcao !== 'com_ok').map((a) => a.texto);
    if (!piloto) return { resumo: soApontar.length ? `Esses eu só aponto (não tenho a fonte do valor certo): ${soApontar.slice(0, 2).join('; ')}.` : fraseDaReconferencia([]), instrucao: 'Diga a frase `resumo`.' };
    return { piloto, resumo: 'Vou abrir o cadastro e preencher; você confere e dá o OK no Salvar.', instrucao: 'Diga a frase `resumo`. Nada foi gravado.' };
  },
};
export const FERRAMENTAS_CONFERE: Ferramenta[] = [FERRAMENTA_CONFERIR, FERRAMENTA_CORRIGIR];
export const INSTRUCAO_CONFERE = `
CONFERIR ("Murad, confere a empresa X", "isso está errado"): use conferir_cadastro_empresa e responda com a frase pronta. Com "sim/corrige/faz certo" use corrigir_cadastro_empresa: o piloto preenche à vista e para no Salvar com o cartão de OK. Erro sem fonte do valor certo você só aponta e leva até a tela; nunca invente valor.`;
