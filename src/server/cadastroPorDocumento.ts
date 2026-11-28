// Cadastro de empresa por foto/arquivo (igual no DP, no Fiscal e no Contábil; pedido do dono em 27/11/2026).
//
// Entra: foto (celular/câmera), PDF ou print do cartão CNPJ, comprovante de inscrição estadual/municipal, contrato social,
// CCMEI, ou o XML de uma nota (emitente ou destinatário). Sai: uma FICHA para a pessoa conferir — nada é gravado aqui.
//  1. XML de nota: lido aqui mesmo, sem IA (os dados estão escritos nas tags; é exato).
//  2. Foto/PDF/print: a IA do sistema (Gemini) só TRANSCREVE o que está escrito, em JSON; o servidor confere CNPJ (dígito
//     verificador), CEP, UF, CNAE, e-mail e telefone, e marca "conferir" o que não passou ou o que a IA disse que leu com dúvida.
//  3. Depois SEMPRE completa/confere pela consulta pública gratuita do CNPJ (a mesma do botão "Buscar CNPJ na Receita").
//     Nunca usa consulta paga (Serpro). O que a Receita mostra vence o que foi lido; se o documento diz outra coisa, o campo fica
//     marcado "conferir" com os dois valores. Inscrição estadual/municipal e sócios só existem no documento.
//  4. MEI: regime MEI quando a consulta pública mostra a opção pelo SIMEI. Documento de MEI (CCMEI, CRT 4 na nota) sem a opção
//     na consulta vira "conferir" (pode ter sido desenquadrado) — nunca chuta.
// Sem nenhuma importação: é o mesmo arquivo nos três sistemas.

export type TipoDocumentoCadastro = 'cartao_cnpj' | 'inscricao_estadual' | 'inscricao_municipal' | 'contrato_social' | 'ccmei' | 'nota_fiscal_xml' | 'nota_fiscal' | 'pedido_por_texto' | 'outro';
export type OrigemCampo = 'documento' | 'xml' | 'receita' | '';

export const CAMPOS_FICHA = ['cnpj', 'razaoSocial', 'nomeFantasia', 'cnae', 'cnaeDescricao', 'inscricaoEstadual', 'inscricaoMunicipal', 'regime',
  'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'email', 'telefone', 'naturezaJuridica', 'dataAbertura', 'situacaoCadastral', 'titular'] as const;
export type CampoDaFicha = typeof CAMPOS_FICHA[number];

/** Nome do campo como a pessoa lê na tela (para os avisos "conferir"). */
export const ROTULO_CAMPO: Record<CampoDaFicha, string> = {
  cnpj: 'CNPJ', razaoSocial: 'Razão social', nomeFantasia: 'Nome fantasia', cnae: 'CNAE principal', cnaeDescricao: 'Descrição do CNAE', inscricaoEstadual: 'Inscrição estadual',
  inscricaoMunicipal: 'Inscrição municipal', regime: 'Regime tributário', logradouro: 'Endereço (rua)', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro', cidade: 'Município',
  uf: 'UF', cep: 'CEP', email: 'E-mail', telefone: 'Telefone', naturezaJuridica: 'Natureza jurídica', dataAbertura: 'Data de abertura', situacaoCadastral: 'Situação cadastral', titular: 'Titular / responsável',
};

export interface CampoFicha { valor: string; origem: OrigemCampo; conferir: boolean; motivo?: string }
export interface SocioFicha { nome: string; qualificacao: string }

/** O que foi lido do documento (pela IA, pelo XML ou dito pela pessoa à Agente). Tudo texto; vazio = não lido. */
export interface DadosLidos {
  tipoDocumento: TipoDocumentoCadastro;
  campos: Partial<Record<CampoDaFicha, string>>;
  socios: SocioFicha[];
  /** Campos que a IA disse ter lido com dificuldade (foto borrada, cortada). */
  duvidas: CampoDaFicha[];
  /** O documento diz que é MEI (CCMEI, "SIMEI: sim", CRT 4). */
  mei: boolean;
  /** O documento diz Simples Nacional (CRT 1/2, "Simples: sim"). */
  simples: boolean;
  /** CRT da nota (1, 2, 3 ou 4), quando veio de nota. */
  crt?: string;
  /** Quem leu: 'xml' (exato) ou 'documento' (IA/pessoa). */
  origem: 'xml' | 'documento';
}

/** Formato da consulta pública (igual ao DadosCnpjFormulario de consultaCnpjPublica.ts). */
export interface DadosReceitaCadastro {
  cnpj: string; razao_social: string; nome_fantasia: string; cnae_fiscal: string; cnae_fiscal_descricao: string; uf: string; municipio: string;
  bairro: string; descricao_tipo_de_logradouro: string; logradouro: string; numero: string; cep: string; descricao_situacao_cadastral: string;
  data_inicio_atividade: string; ddd_telefone_1: string; email: string; opcao_pelo_mei: boolean; opcao_pelo_simples: boolean; fonte: string;
}

export interface FichaEmpresa {
  cnpj: string;
  tipoDocumento: TipoDocumentoCadastro;
  campos: Record<CampoDaFicha, CampoFicha>;
  socios: SocioFicha[];
  avisos: string[];
  receita: { conferida: boolean; fonte: string; motivo?: string };
  mei: boolean;
  /** CNPJ válido e razão social: dá para salvar (depois do OK da pessoa). */
  pronta: boolean;
  /** Quantos campos estão marcados "conferir". */
  paraConferir: number;
}

// ------------------------------------------------------------------------------------------------
// Conferências de formato
// ------------------------------------------------------------------------------------------------
const UFS = new Set(['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']);
const txt = (v: unknown, max = 200): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export function normalizarCnpjCadastro(v: unknown): string { return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function dv(base: string, pesos: number[]): number {
  const soma = [...base].reduce((t, c, i) => t + (c.charCodeAt(0) - 48) * pesos[i], 0);
  const r = soma % 11; return r < 2 ? 0 : 11 - r;
}
/** CNPJ numérico ou alfanumérico (regra oficial: código ASCII − 48), com os dois dígitos verificadores. */
export function cnpjValidoCadastro(v: unknown): boolean {
  const c = normalizarCnpjCadastro(v);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(c) || /^([A-Z0-9])\1{13}$/.test(c)) return false;
  const p = dv(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = dv(`${c.slice(0, 12)}${p}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${p}${s}`);
}
export function formatarCnpjCadastro(v: unknown): string {
  const c = normalizarCnpjCadastro(v);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
}
/** CNAE de 7 dígitos no formato oficial 0000-0/00. Outro tamanho volta vazio (fica "conferir"). */
export function formatarCnae(v: unknown): string {
  const d = so(v);
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : '';
}
export function formatarCep(v: unknown): string { const d = so(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : ''; }
export function formatarTelefone(v: unknown): string {
  const d = so(v).replace(/^0+/, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return '';
}
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
/** Inscrição estadual: só números (2 a 14) ou ISENTO. */
export function inscricaoEstadualOk(v: string): boolean { return /^ISENTO$/i.test(v) || /^\d{2,14}$/.test(so(v)) && so(v).length === v.replace(/[.\-/\s]/g, '').length; }
const dataIso = (v: unknown): string => {
  const t = txt(v, 30); const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
};
/** Compara sem acento, pontuação, caixa e espaços (para não marcar "conferir" só por causa de vírgula). */
export function mesmoTexto(a: unknown, b: unknown): boolean {
  const n = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n(a) === n(b);
}

// ------------------------------------------------------------------------------------------------
// XML de nota (NF-e, NFC-e, CT-e, NFS-e nacional): emitente/prestador e destinatário/tomador, sem IA.
// ------------------------------------------------------------------------------------------------
function decodificarXml(v: string): string {
  return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
}
/** Primeiro bloco <tag ...>…</tag> (com ou sem prefixo de namespace). */
function bloco(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tag}>`).exec(xml);
  return m ? m[1] : null;
}
function valorTag(xml: string | null, tag: string): string { const b = xml === null ? null : bloco(xml, tag); return b === null ? '' : txt(decodificarXml(b.replace(/<[^>]+>/g, ' ')), 200); }

function lidoDoBloco(b: string, tagEndereco: string[]): DadosLidos {
  // O endereço pode estar em enderEmit/enderDest (NF-e), enderPrest/enderToma, end/endNac (NFS-e nacional).
  let end: string | null = null;
  for (const t of tagEndereco) { end = bloco(b, t); if (end !== null) break; }
  const endNac = end !== null ? bloco(end, 'endNac') : null;
  const ondeEnd = end ?? b;
  const crt = valorTag(b, 'CRT');
  const ie = valorTag(b, 'IE');
  const campos: Partial<Record<CampoDaFicha, string>> = {
    cnpj: normalizarCnpjCadastro(valorTag(b, 'CNPJ')),
    razaoSocial: valorTag(b, 'xNome'), nomeFantasia: valorTag(b, 'xFant'),
    inscricaoEstadual: /^isento$/i.test(ie) ? 'ISENTO' : so(ie), inscricaoMunicipal: valorTag(b, 'IM'),
    cnae: formatarCnae(valorTag(b, 'CNAE')),
    logradouro: valorTag(ondeEnd, 'xLgr'), numero: valorTag(ondeEnd, 'nro'), complemento: valorTag(ondeEnd, 'xCpl'), bairro: valorTag(ondeEnd, 'xBairro'),
    cidade: valorTag(ondeEnd, 'xMun'), uf: valorTag(ondeEnd, 'UF').toUpperCase(), cep: formatarCep(valorTag(endNac ?? ondeEnd, 'CEP')),
    telefone: formatarTelefone(valorTag(ondeEnd, 'fone') || valorTag(b, 'fone')), email: valorTag(b, 'email').toLowerCase(),
  };
  for (const k of Object.keys(campos) as CampoDaFicha[]) if (!campos[k]) delete campos[k];
  return { tipoDocumento: 'nota_fiscal_xml', campos, socios: [], duvidas: [], mei: crt === '4', simples: crt === '1' || crt === '2', ...(crt ? { crt } : {}), origem: 'xml' };
}

export interface LeituraXml { emitente: DadosLidos | null; destinatario: DadosLidos | null }
/** Lê emitente (emit/prest) e destinatário (dest/toma) de uma nota. Lado sem CNPJ (ex.: consumidor com CPF) fica de fora. */
export function lerXmlParaCadastro(xml: string): LeituraXml {
  const x = String(xml || '').replace(/^﻿/, '');
  const emit = bloco(x, 'emit') ?? bloco(x, 'prest');
  const dest = bloco(x, 'dest') ?? bloco(x, 'toma');
  const lado = (b: string | null, ends: string[]) => {
    if (b === null) return null;
    const l = lidoDoBloco(b, ends);
    return l.campos.cnpj && cnpjValidoCadastro(l.campos.cnpj) ? l : null;
  };
  return { emitente: lado(emit, ['enderEmit', 'enderPrest', 'end']), destinatario: lado(dest, ['enderDest', 'enderToma', 'end']) };
}
export function pareceXml(texto: string): boolean { return /^\s*(<\?xml|<)/.test(String(texto || '').replace(/^﻿/, '')); }

// ------------------------------------------------------------------------------------------------
// Leitura por IA (foto, PDF, print): instrução e conferência da resposta.
// ------------------------------------------------------------------------------------------------
export const INSTRUCAO_LEITURA_CADASTRO = `Você lê documentos de cadastro de empresa brasileira: cartão CNPJ (comprovante de inscrição e de situação cadastral), comprovante de inscrição estadual (SEFAZ/Sintegra), comprovante de inscrição municipal (prefeitura), contrato social ou alteração contratual, CCMEI (Certificado da Condição de Microempreendedor Individual) ou nota fiscal (DANFE/DANFSE).
Regras:
- Transcreva SOMENTE o que está escrito no documento. Não deduza, não complete, não corrija e não invente nada.
- Campo ausente, cortado ou ilegível: "" (texto vazio).
- Não copie CPF de ninguém.
- Em "duvidas", liste o nome de cada campo que você leu com dificuldade (foto borrada, tremida, cortada, letra miúda, número que pode ser outro).
- Em nota fiscal, os dados da empresa são os do EMITENTE (ou prestador); se houver destinatário/tomador com CNPJ, ponha os dados dele em "destinatario".
- "mei": true só se o documento disser que é MEI (CCMEI, "Optante pelo SIMEI: Sim", "Microempreendedor Individual"). "simples": true só se disser "Optante pelo Simples: Sim" ou "Simples Nacional".
- "tipoDocumento": cartao_cnpj, inscricao_estadual, inscricao_municipal, contrato_social, ccmei, nota_fiscal ou outro.
Responda SOMENTE com JSON neste formato:
{"tipoDocumento":"","cnpj":"","razaoSocial":"","nomeFantasia":"","cnae":"","cnaeDescricao":"","inscricaoEstadual":"","inscricaoMunicipal":"","naturezaJuridica":"","dataAbertura":"","situacaoCadastral":"","logradouro":"","numero":"","complemento":"","bairro":"","cidade":"","uf":"","cep":"","email":"","telefone":"","titular":"","mei":false,"simples":false,"socios":[{"nome":"","qualificacao":""}],"duvidas":[],"destinatario":null}`;

const TIPOS: TipoDocumentoCadastro[] = ['cartao_cnpj', 'inscricao_estadual', 'inscricao_municipal', 'contrato_social', 'ccmei', 'nota_fiscal', 'nota_fiscal_xml', 'pedido_por_texto', 'outro'];

/** Limpa o que a IA (ou a Agente, ou a tela) mandou: só texto curto nos campos conhecidos. Não confere com a Receita (isso é montarFicha). */
export function dadosLidosDe(bruto: any, origem: 'documento' | 'xml' = 'documento', tipoPadrao: TipoDocumentoCadastro = 'outro'): DadosLidos {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const campos: Partial<Record<CampoDaFicha, string>> = {};
  for (const k of CAMPOS_FICHA) { const v = txt(b[k], k === 'razaoSocial' || k === 'nomeFantasia' || k === 'cnaeDescricao' ? 200 : 120); if (v) campos[k] = v; }
  if (campos.cnpj) campos.cnpj = normalizarCnpjCadastro(campos.cnpj);
  const socios = (Array.isArray(b.socios) ? b.socios : []).map((s: any) => ({ nome: txt(s?.nome, 150), qualificacao: txt(s?.qualificacao, 80) })).filter((s: SocioFicha) => s.nome).slice(0, 30);
  const duvidas = (Array.isArray(b.duvidas) ? b.duvidas : []).map((d: any) => String(d)).filter((d: string): d is CampoDaFicha => (CAMPOS_FICHA as readonly string[]).includes(d));
  const tipo = TIPOS.includes(b.tipoDocumento) ? b.tipoDocumento : tipoPadrao;
  const crt = /^[1-4]$/.test(String(b.crt ?? '')) ? String(b.crt) : undefined;
  return { tipoDocumento: tipo, campos, socios, duvidas, mei: b.mei === true || tipo === 'ccmei' || crt === '4', simples: b.simples === true || crt === '1' || crt === '2', ...(crt ? { crt } : {}), origem };
}

/** Lê a resposta JSON da IA (aceita com ou sem cercas de código). Devolve o lado da empresa e, se houver, o destinatário. */
export function interpretarRespostaIA(texto: string): { principal: DadosLidos; destinatario: DadosLidos | null } {
  const limpo = String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let j: any;
  try { j = JSON.parse(limpo); } catch {
    const ini = limpo.indexOf('{'); const fim = limpo.lastIndexOf('}');
    if (ini < 0 || fim <= ini) throw new Error('A leitura não devolveu os dados num formato válido. Tente outra foto, mais de perto e com boa luz.');
    j = JSON.parse(limpo.slice(ini, fim + 1));
  }
  const principal = dadosLidosDe(j);
  const d = j?.destinatario && typeof j.destinatario === 'object' ? dadosLidosDe({ ...j.destinatario, tipoDocumento: 'nota_fiscal' }) : null;
  return { principal, destinatario: d && d.campos.cnpj && cnpjValidoCadastro(d.campos.cnpj) ? d : null };
}

// ------------------------------------------------------------------------------------------------
// Ficha: o que foi lido + a consulta pública da Receita.
// ------------------------------------------------------------------------------------------------
function campoVazio(): CampoFicha { return { valor: '', origem: '', conferir: false }; }

/** Monta a ficha para a pessoa conferir. `receita` nulo = a consulta não respondeu (aí tudo que veio do documento fica "conferir"). */
export function montarFicha(lidos: DadosLidos | null, receita: DadosReceitaCadastro | null, motivoSemReceita?: string): FichaEmpresa {
  const l: DadosLidos = lidos ?? { tipoDocumento: 'pedido_por_texto', campos: {}, socios: [], duvidas: [], mei: false, simples: false, origem: 'documento' };
  const campos = Object.fromEntries(CAMPOS_FICHA.map((k) => [k, campoVazio()])) as Record<CampoDaFicha, CampoFicha>;
  const avisos: string[] = [];
  const origemDoc: OrigemCampo = l.origem === 'xml' ? 'xml' : 'documento';
  const nomeDoc = l.origem === 'xml' ? 'na nota' : 'no documento';

  // 1. O que foi lido, conferindo o formato.
  for (const k of CAMPOS_FICHA) {
    const bruto = String(l.campos[k] ?? '').trim();
    if (!bruto) continue;
    let valor = bruto; let conferir = l.duvidas.includes(k); let motivo = conferir ? 'Foi lido com dificuldade: confira no documento.' : undefined;
    const ruim = (m: string) => { conferir = true; motivo = m; };
    if (k === 'cnpj') { valor = normalizarCnpjCadastro(bruto); if (!cnpjValidoCadastro(valor)) ruim('Os dígitos do CNPJ não fecham (dígito verificador): confira o número.'); }
    else if (k === 'cep') { const f = formatarCep(bruto); if (f) valor = f; else ruim('O CEP lido não tem 8 números.'); }
    else if (k === 'uf') { valor = bruto.toUpperCase(); if (!UFS.has(valor)) ruim('A UF lida não existe.'); }
    else if (k === 'cnae') { const f = formatarCnae(bruto); if (f) valor = f; else ruim('O CNAE lido não tem 7 números.'); }
    else if (k === 'email') { valor = bruto.toLowerCase(); if (!emailOk(valor)) ruim('O e-mail lido não parece completo.'); }
    else if (k === 'telefone') { const f = formatarTelefone(bruto); if (f) valor = f; else ruim('O telefone lido não tem DDD e número completos.'); }
    else if (k === 'inscricaoEstadual') { valor = /^isento$/i.test(bruto) ? 'ISENTO' : bruto; if (!inscricaoEstadualOk(valor)) ruim('A inscrição estadual lida tem caracteres estranhos: confira.'); else if (valor !== 'ISENTO') valor = so(valor); }
    else if (k === 'dataAbertura') { const d = dataIso(bruto); if (d) valor = d; else ruim('A data de abertura lida não está completa.'); }
    campos[k] = { valor, origem: origemDoc, conferir, ...(motivo ? { motivo } : {}) };
  }
  if (!campos.titular.valor && l.socios.length) campos.titular = { valor: l.socios[0].nome, origem: origemDoc, conferir: false };

  // 2. A consulta pública da Receita completa e vence; divergência vira "conferir" com os dois valores.
  const cnpj = campos.cnpj.valor;
  const r = receita && normalizarCnpjCadastro(receita.cnpj) === cnpj ? receita : null;
  const daReceita = (k: CampoDaFicha, valorReceita: string, comparar = true) => {
    const v = String(valorReceita || '').trim();
    if (!v) return;
    const atual = campos[k];
    if (atual.valor && comparar && !mesmoTexto(atual.valor, v)) {
      campos[k] = { valor: v, origem: 'receita', conferir: true, motivo: `${nomeDoc === 'na nota' ? 'Na nota' : 'No documento'} está "${atual.valor}"; na consulta da Receita está "${v}". Ficou o da Receita: confira qual é o atual.` };
    } else campos[k] = { valor: v, origem: 'receita', conferir: false };
  };
  if (r) {
    daReceita('razaoSocial', r.razao_social);
    daReceita('nomeFantasia', r.nome_fantasia);
    const cnaeR = formatarCnae(r.cnae_fiscal);
    if (cnaeR) { daReceita('cnae', cnaeR); daReceita('cnaeDescricao', r.cnae_fiscal_descricao, false); }
    const tipo = String(r.descricao_tipo_de_logradouro || '').trim();
    const lgr = String(r.logradouro || '').trim();
    daReceita('logradouro', tipo && lgr && !mesmoTexto(lgr.split(' ')[0], tipo) ? `${tipo} ${lgr}` : lgr, false);
    daReceita('numero', r.numero); daReceita('bairro', r.bairro); daReceita('cidade', r.municipio); daReceita('uf', String(r.uf || '').toUpperCase());
    daReceita('cep', formatarCep(r.cep));
    // Endereço: o documento pode ser mais novo que a base da Receita. Rua com grafia diferente não vira aviso; CEP/cidade/UF diferentes sim.
    if (l.campos.logradouro && lgr && !mesmoTexto(l.campos.logradouro, campos.logradouro.valor) && !mesmoTexto(l.campos.logradouro, lgr)) {
      campos.logradouro = { ...campos.logradouro, conferir: true, motivo: `${nomeDoc === 'na nota' ? 'Na nota' : 'No documento'} o endereço é "${l.campos.logradouro}"; na Receita é "${campos.logradouro.valor}". Ficou o da Receita: confira se a empresa mudou de endereço.` };
    }
    daReceita('email', String(r.email || '').toLowerCase());
    daReceita('telefone', formatarTelefone(r.ddd_telefone_1), true);
    daReceita('situacaoCadastral', r.descricao_situacao_cadastral, false);
    daReceita('dataAbertura', dataIso(r.data_inicio_atividade));
    if (r.descricao_situacao_cadastral && !/^ativa$/i.test(r.descricao_situacao_cadastral.trim())) avisos.push(`Na Receita a situação cadastral está "${r.descricao_situacao_cadastral}". Confira antes de cadastrar.`);
  } else if (cnpj && cnpjValidoCadastro(cnpj)) {
    avisos.push(`Não deu para conferir na Receita agora${motivoSemReceita ? ` (${motivoSemReceita.slice(0, 160)})` : ''}. Os dados vieram só ${nomeDoc}: confira tudo antes de salvar. Depois dá para clicar em "Buscar CNPJ na Receita" de novo.`);
    for (const k of CAMPOS_FICHA) if (campos[k].valor && k !== 'cnpj' && campos[k].origem === 'documento' && !campos[k].conferir) campos[k] = { ...campos[k], conferir: true, motivo: 'Não foi conferido na Receita.' };
  }

  // 3. Regime (MEI só com a opção pelo SIMEI; sem certeza, fica vazio e "conferir").
  const docMei = l.mei || l.tipoDocumento === 'ccmei' || l.crt === '4';
  const docSimples = l.simples || l.crt === '1' || l.crt === '2';
  const regimeLido = /mei|microempreendedor/i.test(l.campos.regime || '') ? 'MEI' : /simples/i.test(l.campos.regime || '') ? 'Simples Nacional' : /presumido/i.test(l.campos.regime || '') ? 'Lucro Presumido' : /real/i.test(l.campos.regime || '') ? 'Lucro Real' : '';
  if (r) {
    if (r.opcao_pelo_mei) campos.regime = { valor: 'MEI', origem: 'receita', conferir: false };
    else if (r.opcao_pelo_simples) campos.regime = docMei
      ? { valor: 'Simples Nacional', origem: 'receita', conferir: true, motivo: 'O documento é de MEI, mas a consulta da Receita mostra Simples Nacional sem o SIMEI: a empresa pode ter sido desenquadrada do MEI. Confira.' }
      : { valor: 'Simples Nacional', origem: 'receita', conferir: false };
    else if (docMei) campos.regime = { valor: '', origem: '', conferir: true, motivo: 'O documento é de MEI, mas a consulta da Receita não mostra a opção pelo SIMEI hoje. Confira no Portal do Simples Nacional e escolha o regime.' };
    else if (regimeLido === 'Lucro Presumido' || regimeLido === 'Lucro Real') campos.regime = { valor: regimeLido, origem: 'documento', conferir: true, motivo: 'A consulta pública não diz se é Lucro Presumido ou Lucro Real: ficou o que estava no documento. Confira.' };
    else campos.regime = { valor: '', origem: '', conferir: true, motivo: l.crt === '3' ? 'A nota é de regime normal (CRT 3): escolha Lucro Presumido ou Lucro Real.' : 'A consulta pública não diz se é Lucro Presumido ou Lucro Real: escolha o regime.' };
  } else {
    if (docMei) campos.regime = { valor: 'MEI', origem: origemDoc, conferir: true, motivo: 'Lido do documento; não foi conferido na Receita.' };
    else if (docSimples || regimeLido === 'Simples Nacional') campos.regime = { valor: 'Simples Nacional', origem: origemDoc, conferir: true, motivo: 'Lido do documento; não foi conferido na Receita.' };
    else if (regimeLido) campos.regime = { valor: regimeLido, origem: origemDoc, conferir: true, motivo: 'Lido do documento; não foi conferido na Receita.' };
    else campos.regime = { valor: '', origem: '', conferir: true, motivo: 'Escolha o regime tributário.' };
  }
  const mei = campos.regime.valor === 'MEI';
  if (mei && !campos.titular.valor && campos.razaoSocial.valor) {
    // MEI: a razão social é o nome do empresário seguido do CPF ("NOME DO EMPRESÁRIO 12345678900"); o titular é o nome sem os números.
    const nome = campos.razaoSocial.valor.replace(/\s*\d{11}\s*$/, '').trim();
    if (nome && nome !== campos.razaoSocial.valor) campos.titular = { valor: nome, origem: campos.razaoSocial.origem, conferir: false };
  }

  if (!cnpj) avisos.unshift('Não encontrei o CNPJ no documento. Digite o CNPJ ou mande outra foto em que ele apareça.');
  else if (!cnpjValidoCadastro(cnpj)) avisos.unshift('O CNPJ lido não é válido (os dígitos verificadores não fecham). Confira o número antes de seguir.');
  if (!campos.razaoSocial.valor) avisos.push('Falta a razão social.');
  const paraConferir = CAMPOS_FICHA.filter((k) => campos[k].conferir).length;
  return {
    cnpj, tipoDocumento: l.tipoDocumento, campos, socios: l.socios, avisos,
    receita: r ? { conferida: true, fonte: r.fonte || 'consulta pública do CNPJ' } : { conferida: false, fonte: '', ...(motivoSemReceita ? { motivo: motivoSemReceita.slice(0, 200) } : {}) },
    mei, pronta: Boolean(cnpj && cnpjValidoCadastro(cnpj) && campos.razaoSocial.valor), paraConferir,
  };
}

/** Texto curto da ficha (cartão de OK da Murad e resposta por voz): cada campo preenchido numa linha, "(conferir)" onde precisa. */
export function linhasDaFicha(f: FichaEmpresa): string[] {
  const ordem: CampoDaFicha[] = ['cnpj', 'razaoSocial', 'nomeFantasia', 'regime', 'cnae', 'inscricaoEstadual', 'inscricaoMunicipal', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'email', 'telefone', 'titular', 'situacaoCadastral'];
  const linhas = ordem.filter((k) => f.campos[k].valor || f.campos[k].conferir).map((k) => {
    const c = f.campos[k]; const v = k === 'cnpj' ? formatarCnpjCadastro(c.valor) : k === 'cnae' && f.campos.cnaeDescricao.valor ? `${c.valor} — ${f.campos.cnaeDescricao.valor}` : c.valor;
    return `${ROTULO_CAMPO[k]}: ${v || '(em branco)'}${c.conferir ? ` (conferir${c.motivo ? `: ${c.motivo}` : ''})` : ''}`;
  });
  if (f.socios.length) linhas.push(`Sócios: ${f.socios.map((s) => s.qualificacao ? `${s.nome} (${s.qualificacao})` : s.nome).join('; ')}`);
  return linhas;
}

// ------------------------------------------------------------------------------------------------
// Orquestração (a rota de cada sistema chama esta função)
// ------------------------------------------------------------------------------------------------
export interface ArquivoCadastro { nome?: string; mimeType: string; dadosBase64: string }
export const MIME_CADASTRO = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/xml', 'application/xml']);
export const LIMITE_BASE64_CADASTRO = 7_000_000; // ~5 MB de arquivo

export function validarArquivoCadastro(a: any): { ok: true; arquivo: ArquivoCadastro } | { ok: false; erro: string } {
  if (!a || typeof a !== 'object') return { ok: false, erro: 'Mande a foto, o PDF ou o XML da empresa.' };
  let mimeType = String(a.mimeType || '').toLowerCase().trim();
  const nome = txt(a.nome, 120);
  if ((!mimeType || mimeType === 'application/octet-stream') && /\.xml$/i.test(nome)) mimeType = 'text/xml';
  const dadosBase64 = String(a.dadosBase64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!MIME_CADASTRO.has(mimeType)) return { ok: false, erro: 'Formato não aceito. Mande foto (JPG, PNG, WEBP, HEIC), PDF ou o XML da nota.' };
  if (!dadosBase64 || !/^[A-Za-z0-9+/]+=*$/.test(dadosBase64)) return { ok: false, erro: 'O arquivo chegou vazio. Tente de novo.' };
  if (dadosBase64.length > LIMITE_BASE64_CADASTRO) return { ok: false, erro: 'Arquivo grande demais (limite de uns 5 MB). Tire a foto de novo ou mande o PDF de uma página.' };
  return { ok: true, arquivo: { nome, mimeType, dadosBase64 } };
}

export interface ResultadoConsultaReceita { ok: boolean; dados?: DadosReceitaCadastro; mensagem?: string }
export interface DepsPrepararFicha {
  /** Lê foto/PDF com a IA do sistema e devolve o texto JSON. Sem IA configurada: lança erro com mensagem para a pessoa. */
  lerComIA?: (arquivo: ArquivoCadastro, instrucao: string) => Promise<string>;
  /** Consulta pública gratuita do CNPJ (nunca Serpro). */
  consultarReceita: (cnpj: string) => Promise<ResultadoConsultaReceita>;
}
export interface EntradaFicha { arquivo?: unknown; cnpj?: unknown; lidos?: unknown; lado?: unknown; mei?: unknown }
export interface ResumoLado { lado: 'emitente' | 'destinatario'; cnpj: string; nome: string; lidos: DadosLidos }
export type ResultadoFicha =
  | { ok: true; ficha: FichaEmpresa }
  | { ok: true; escolherLado: ResumoLado[] }
  | { ok: false; status: number; erro: string };

async function receitaDe(deps: DepsPrepararFicha, cnpj: string): Promise<{ dados: DadosReceitaCadastro | null; motivo?: string }> {
  if (!/^\d{14}$/.test(cnpj)) return { dados: null, motivo: 'a consulta automática ainda não aceita CNPJ com letras' };
  try { const r = await deps.consultarReceita(cnpj); return r.ok && r.dados ? { dados: r.dados } : { dados: null, motivo: r.mensagem || 'a consulta não respondeu' }; }
  catch (e: any) { return { dados: null, motivo: e?.message || 'a consulta não respondeu' }; }
}

/** Monta a ficha a partir de: arquivo (foto/PDF/XML), ou CNPJ + dados já lidos (Agente/tela). Nunca grava nada. */
export async function prepararFicha(deps: DepsPrepararFicha, e: EntradaFicha): Promise<ResultadoFicha> {
  let lidos: DadosLidos | null = null;
  const ladoPedido = e.lado === 'destinatario' ? 'destinatario' : e.lado === 'emitente' ? 'emitente' : null;
  if (e.arquivo) {
    const v = validarArquivoCadastro(e.arquivo);
    if (v.ok === false) return { ok: false, status: 400, erro: v.erro };
    const a = v.arquivo;
    if (a.mimeType === 'text/xml' || a.mimeType === 'application/xml') {
      const xml = Buffer.from(a.dadosBase64, 'base64').toString('utf8');
      if (!pareceXml(xml)) return { ok: false, status: 400, erro: 'O arquivo não é um XML de nota.' };
      const x = lerXmlParaCadastro(xml);
      const lados: ResumoLado[] = [];
      if (x.emitente) lados.push({ lado: 'emitente', cnpj: String(x.emitente.campos.cnpj), nome: String(x.emitente.campos.razaoSocial || ''), lidos: x.emitente });
      if (x.destinatario && x.destinatario.campos.cnpj !== x.emitente?.campos.cnpj) lados.push({ lado: 'destinatario', cnpj: String(x.destinatario.campos.cnpj), nome: String(x.destinatario.campos.razaoSocial || ''), lidos: x.destinatario });
      if (!lados.length) return { ok: false, status: 422, erro: 'Não achei CNPJ de emitente nem de destinatário neste XML.' };
      const escolhido = ladoPedido ? lados.find((l) => l.lado === ladoPedido) : lados.length === 1 ? lados[0] : null;
      if (!escolhido) return { ok: true, escolherLado: lados };
      lidos = escolhido.lidos;
    } else {
      if (!deps.lerComIA) return { ok: false, status: 503, erro: 'A leitura automática de foto/PDF não está ligada neste sistema. Digite o CNPJ e clique em "Buscar CNPJ na Receita".' };
      let texto: string;
      try { texto = await deps.lerComIA(a, INSTRUCAO_LEITURA_CADASTRO); }
      catch (err: any) { return { ok: false, status: 502, erro: err?.message || 'A leitura da foto não respondeu agora. Tente de novo em instantes.' }; }
      let lido: ReturnType<typeof interpretarRespostaIA>;
      try { lido = interpretarRespostaIA(texto); } catch (err: any) { return { ok: false, status: 422, erro: err?.message || 'Não consegui ler o documento.' }; }
      if (lido.destinatario && !ladoPedido && lido.principal.campos.cnpj) {
        return { ok: true, escolherLado: [
          { lado: 'emitente', cnpj: String(lido.principal.campos.cnpj), nome: String(lido.principal.campos.razaoSocial || ''), lidos: lido.principal },
          { lado: 'destinatario', cnpj: String(lido.destinatario.campos.cnpj), nome: String(lido.destinatario.campos.razaoSocial || ''), lidos: lido.destinatario },
        ] };
      }
      lidos = ladoPedido === 'destinatario' && lido.destinatario ? lido.destinatario : lido.principal;
    }
  } else {
    const origem = (e.lidos as any)?.origem === 'xml' ? 'xml' : 'documento';
    lidos = dadosLidosDe(e.lidos && typeof e.lidos === 'object' ? { ...(e.lidos as any).campos, ...(e.lidos as any), socios: (e.lidos as any).socios, duvidas: (e.lidos as any).duvidas } : {}, origem, 'pedido_por_texto');
    if (e.cnpj) lidos.campos.cnpj = normalizarCnpjCadastro(e.cnpj);
    if (e.mei === true) lidos.mei = true;
    if (!lidos.campos.cnpj) return { ok: false, status: 400, erro: 'Informe o CNPJ da empresa.' };
  }
  const cnpj = normalizarCnpjCadastro(lidos.campos.cnpj);
  const rec = cnpj && cnpjValidoCadastro(cnpj) ? await receitaDe(deps, cnpj) : { dados: null };
  return { ok: true, ficha: montarFicha(lidos, rec.dados, (rec as any).motivo) };
}

/** Pedido por texto/voz: acha o CNPJ ("cadastra o CNPJ 12.345.678/0001-90 como MEI"). */
export function cnpjDoTexto(texto: string): string | null {
  const m = String(texto || '').toUpperCase().match(/\b[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2}\b/);
  return m ? normalizarCnpjCadastro(m[0]) : null;
}
