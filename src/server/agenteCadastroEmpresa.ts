// Murad, cadastra essa empresa (foto/PDF/XML anexado) / "cadastra o CNPJ 12.345.678/0001-90 como MEI" (pedido do dono em 27/11/2026).
// Igual no DP, no Fiscal e no Contábil; cada sistema só diz como achar e como salvar a empresa lá.
//  1. A Agente lê o anexo (a própria IA multimodal) e passa à ferramenta SÓ o que está escrito; o CNPJ é obrigatório.
//  2. O servidor monta a ficha (POST /api/empresas/ler-documento-cadastro): confere CNPJ e formatos e completa/confere pela
//     consulta pública gratuita da Receita (nunca Serpro). Campos com dúvida ficam "(conferir)".
//  3. O cartão de OK mostra a ficha inteira; só salva com o OK. Empresa que já existe: só preenche o que está vazio.
//  4. Depois de salvar, a sincronia leva o cadastro aos outros dois sistemas do mesmo escritório.
import { type ContextoAgente, type Ferramenta, erroApi, ok } from './agenteMotor';
import { linhasDaFicha, cnpjValidoCadastro, normalizarCnpjCadastro, formatarCnpjCadastro, type FichaEmpresa } from './cadastroPorDocumento';

export type SistemaCadastro = 'dp' | 'fiscal' | 'contabil';
export interface OpcoesCadastroEmpresa {
  sistema: SistemaCadastro;
  /** A empresa já está neste sistema para esta sessão? (devolve o cadastro atual) */
  buscarExistente: (ctx: ContextoAgente, cnpj: string) => Promise<Record<string, any> | null>;
  /** Grava (nova) ou completa só o vazio (existente). Usa as rotas do próprio sistema, com a sessão da pessoa. */
  salvar: (ctx: ContextoAgente, ficha: FichaEmpresa, existente: Record<string, any> | null) => Promise<{ sucesso: boolean; mensagem: string }>;
}

const OUTROS: Record<SistemaCadastro, string> = { dp: 'o Fiscal e o Contábil', fiscal: 'o DP e o Contábil', contabil: 'o Fiscal e o DP' };
const CAMPOS_LIDOS = ['razaoSocial', 'nomeFantasia', 'cnae', 'inscricaoEstadual', 'inscricaoMunicipal', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'email', 'telefone', 'titular', 'naturezaJuridica', 'regime'] as const;
const S = (description: string) => ({ type: 'STRING', description });

/** Transforma os argumentos da Agente no formato "lidos" da ficha (só texto; sócios "Nome (qualificação); Nome"). */
export function lidosDosArgumentos(args: Record<string, any>): Record<string, any> {
  const lidos: Record<string, any> = { tipoDocumento: ['cartao_cnpj', 'inscricao_estadual', 'inscricao_municipal', 'contrato_social', 'ccmei', 'nota_fiscal', 'nota_fiscal_xml'].includes(args.tipoDocumento) ? args.tipoDocumento : 'pedido_por_texto' };
  for (const k of CAMPOS_LIDOS) if (typeof args[k] === 'string' && args[k].trim()) lidos[k] = args[k].trim().slice(0, 200);
  if (typeof args.socios === 'string' && args.socios.trim()) lidos.socios = args.socios.split(/;|\n/).map((s: string) => s.trim()).filter(Boolean).slice(0, 20).map((s: string) => { const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s); return m ? { nome: m[1], qualificacao: m[2] } : { nome: s, qualificacao: '' }; });
  if (typeof args.duvidas === 'string') lidos.duvidas = args.duvidas.split(/[,;\s]+/).filter(Boolean);
  if (args.mei === true) lidos.mei = true;
  if (args.tipoDocumento === 'nota_fiscal_xml') lidos.origem = 'xml';
  return lidos;
}

export const INSTRUCAO_CADASTRO_EMPRESA = `

CADASTRAR EMPRESA ("Murad, cadastra essa empresa" com foto/PDF/print do cartão CNPJ, inscrição estadual/municipal, contrato social, CCMEI ou XML de nota; ou "cadastra o CNPJ 12.345.678/0001-90 como MEI"): use cadastrar_empresa. Leia o documento anexado e passe SÓ o que está escrito nele (nunca invente nem complete de cabeça); o que estiver borrado ou cortado vai em "duvidas". Nota fiscal com emitente e destinatário: pergunte qual dos dois cadastrar antes de chamar. Sem CNPJ no pedido nem no anexo, peça o CNPJ ou a foto. O sistema confere na Receita (consulta pública gratuita, nunca Serpro), mostra a ficha com os campos "(conferir)" e só salva com o OK do cartão; empresa que já existe só tem os campos vazios completados. Diga em uma frase quantos campos ficaram para conferir.`;

export function criarFerramentasCadastroEmpresa(o: OpcoesCadastroEmpresa): Ferramenta[] {
  return [{
    tipo: 'acao',
    declaracao: {
      name: 'cadastrar_empresa',
      description: 'Cadastra UMA empresa (inclusive MEI) a partir do documento anexado (foto/PDF/print do cartão CNPJ, comprovante de inscrição estadual ou municipal, contrato social, CCMEI, XML ou DANFE de nota) ou só do CNPJ dito pela pessoa. O sistema confere o CNPJ, completa pela consulta pública gratuita da Receita e mostra a ficha com os campos para conferir; só grava com o OK do cartão. Empresa que já existe: só completa campos vazios (nunca troca o que foi digitado).',
      parameters: { type: 'OBJECT', properties: {
        cnpj: S('CNPJ da empresa (14 caracteres), como está no documento ou como a pessoa disse.'),
        mei: { type: 'BOOLEAN', description: 'true quando a pessoa disse que é MEI ou o documento é CCMEI.' },
        tipoDocumento: S('cartao_cnpj, inscricao_estadual, inscricao_municipal, contrato_social, ccmei, nota_fiscal, nota_fiscal_xml ou vazio (pedido por texto).'),
        razaoSocial: S('Razão social escrita no documento.'), nomeFantasia: S('Nome fantasia/título do estabelecimento.'), cnae: S('CNAE principal (código).'),
        inscricaoEstadual: S('Inscrição estadual (ou ISENTO).'), inscricaoMunicipal: S('Inscrição municipal.'), regime: S('Regime escrito no documento (Simples Nacional, MEI, Lucro Presumido, Lucro Real), se houver.'),
        logradouro: S('Rua/avenida.'), numero: S('Número.'), complemento: S('Complemento.'), bairro: S('Bairro.'), cidade: S('Município.'), uf: S('UF (2 letras).'), cep: S('CEP.'),
        email: S('E-mail da empresa.'), telefone: S('Telefone com DDD.'), titular: S('Titular (MEI) ou responsável/sócio-administrador.'),
        socios: S('Sócios separados por ";" no formato "Nome (qualificação)". Sem CPF.'), duvidas: S('Nomes dos campos lidos com dificuldade, separados por vírgula (ex.: inscricaoEstadual, cep).'),
      }, required: ['cnpj'] },
    },
    async preparar(ctx, args) {
      const cnpj = normalizarCnpjCadastro(args.cnpj);
      if (!cnpj) return { erro: 'Preciso do CNPJ da empresa (ou de uma foto/PDF/XML em que ele apareça).' };
      if (!cnpjValidoCadastro(cnpj)) return { erro: `O CNPJ ${formatarCnpjCadastro(cnpj)} não é válido (os dígitos verificadores não fecham). Confira o número com a pessoa.` };
      const r = await ctx.chamarApi('POST', '/api/empresas/ler-documento-cadastro', { cnpj, lidos: lidosDosArgumentos(args), mei: args.mei === true });
      if (!ok(r) || !r.corpo?.ficha) return erroApi(r);
      const ficha = r.corpo.ficha as FichaEmpresa;
      if (!ficha.pronta) return { erro: `Ainda não dá para cadastrar: ${ficha.avisos.join(' ') || 'falta a razão social'}` };
      const existente = await o.buscarExistente(ctx, cnpj).catch(() => null);
      const nome = ficha.campos.razaoSocial.valor;
      // Nunca duplicar: o CNPJ já está neste escritório (aqui ou nos outros sistemas)? Então é a ficha dessa empresa, nunca outra.
      const ja = r.corpo?.jaCadastrada as { mensagem?: string | null; outros?: Array<{ sistema: string }> } | undefined;
      const descricao = [...(ja?.mensagem ? [ja.mensagem] : []), ...linhasDaFicha(ficha), ...ficha.avisos.map((a) => `Atenção: ${a}`),
        ficha.receita.conferida ? `Conferido na consulta pública da Receita (${ficha.receita.fonte}).` : 'Não foi conferido na Receita agora.',
        existente ? 'A empresa já está cadastrada aqui: só os campos VAZIOS serão preenchidos (nada do que já foi digitado é trocado).' : 'Empresa nova neste sistema.',
        `Depois de salvar, o cadastro vai sozinho para ${OUTROS[o.sistema]} do mesmo escritório (lá só preenche o que estiver vazio).`];
      return {
        params: { cnpj, ficha, existia: Boolean(existente) },
        titulo: existente ? `Já cadastrada: completar o cadastro de ${nome}` : ja?.outros?.length ? `Já cadastrada em outro sistema: trazer ${nome} para cá` : `Cadastrar ${nome}${ficha.mei ? ' (MEI)' : ''}`,
        descricao,
        ...(ficha.paraConferir ? { aviso: `${ficha.paraConferir} campo(s) marcado(s) "(conferir)": confira antes do OK. Dá para corrigir depois na tela de Cadastro de empresa.` } : {}),
        cnpj,
        resumo: `${existente ? 'Completar' : 'Cadastrar'} empresa ${formatarCnpjCadastro(cnpj)} (${ficha.paraConferir} campo(s) para conferir)`,
      };
    },
    async executar(ctx, params) {
      const ficha = params?.ficha as FichaEmpresa | undefined;
      if (!ficha || !cnpjValidoCadastro(ficha.cnpj)) return { sucesso: false, mensagem: 'Ficha inválida. Peça para eu preparar de novo.' };
      const existente = await o.buscarExistente(ctx, ficha.cnpj).catch(() => null);
      return o.salvar(ctx, ficha, existente);
    },
  }];
}

/** Só os campos vazios do cadastro atual recebem o valor da ficha (regra comum dos três sistemas). */
export function soVazios<T extends Record<string, any>>(atual: T | null, novos: Record<string, any>): Record<string, any> {
  if (!atual) return novos;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(novos)) {
    const a = atual[k];
    const vazioAqui = a === undefined || a === null || (typeof a === 'string' && (!a.trim() || /^(n[aã]o informad[oa]|validação pendente)$/i.test(a.trim())));
    if (vazioAqui && v !== '' && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** Anexo do pedido à Agente (foto/PDF vão à IA; XML vira texto). Mesmas regras do anexo do DP. */
export function lerAnexoDoPedidoAgente(bruto: any): { ok: true; anexo?: { mimeType: string; dadosBase64: string }; textoXml: string } | { ok: false; status: number; erro: string } {
  if (!bruto || typeof bruto !== 'object') return { ok: true, textoXml: '' };
  const mimeType = String(bruto.mimeType || '').toLowerCase();
  const dadosBase64 = String(bruto.dadosBase64 || '').replace(/^data:[^,]*,/, '');
  const ehXml = mimeType === 'text/xml' || mimeType === 'application/xml' || /\.xml$/i.test(String(bruto.nomeArquivo || bruto.nome || ''));
  if (!ehXml && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) return { ok: false, status: 415, erro: 'Anexo em formato não aceito. Envie foto (JPG, PNG, WEBP, HEIC), PDF ou XML.' };
  if (!dadosBase64 || dadosBase64.length > 7_000_000) return { ok: false, status: 413, erro: 'Anexo muito grande ou vazio (limite de ~5 MB).' };
  if (!ehXml) return { ok: true, anexo: { mimeType, dadosBase64 }, textoXml: '' };
  const xml = Buffer.from(dadosBase64, 'base64').toString('utf8').replace(/^﻿/, '');
  if (!/^\s*<\?xml|^\s*</.test(xml) || xml.length > 300_000) return { ok: false, status: 413, erro: 'XML inválido ou muito grande (limite de ~300 KB).' };
  return { ok: true, textoXml: `\n\n[CONTEÚDO DO ARQUIVO XML ANEXADO PELO USUÁRIO — dados oficiais, leia com atenção; use só o que estiver escrito nele]\n${xml}` };
}
