// Campo a campo da migração contábil do sistema anterior: o que cada coluna preenchida do backup vira no Murade Contábil.
// Um só lugar para (1) a conversão (conversor.ts), (2) o conferidor campo a campo (robô e Agente IA) e (3) o script de
// conferência contra o banco restaurado. Funções puras, não gravam nada.
//
// Regras de texto (pedido do dono: "se tiver um ponto, tem que vir esse ponto"): o texto vem idêntico ao backup —
// acentos, pontuação, vírgulas, espaços do meio, zeros à esquerda e máscaras. Só os espaços/tabulações nas PONTAS do
// campo (sobra de preenchimento do banco antigo, ex.: "Pagamento de energia ", "\t4728051") são tirados.
import type { ContaPlano, EmpresaDados } from '../../types';
import type { BemImobilizado } from '../../utils/imobilizado';
import { validarBem } from '../../utils/imobilizado';
import type { EstabelecimentoCartao, Titulo } from '../titulosCartoesStore';

export type Linha = Record<string, any>;

export const txt = (v: unknown): string => String(v ?? '').trim();
const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && !Number.isFinite(v));

/** Data do arquivo (Date em UTC ou texto) → AAAA-MM-DD. */
export function dataIsoSA(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
const dataBR = (v: unknown) => { const d = dataIsoSA(v); return d && d > '1900-01-01' ? d.split('-').reverse().join('/') : ''; };
const centavosAbs = (v: unknown) => Math.round(Number((Math.abs(Number(v) || 0) * 100).toPrecision(15)));
const sim = (v: unknown) => v === true || ['S', 's', 't', 'T', 'true', '1'].includes(txt(v));

/** Fontes do cadastro de UMA empresa, já filtradas (linhas como vieram do arquivo). */
export interface FontesCadastro {
  empresa?: Linha;           // wphd.empresa
  empcont?: Linha;           // wcont.empcont
  contador?: Linha;          // wcont.contador (ligado por empcont.contador_id)
  sociosEmpresa: Linha[];    // wphd.socemp da empresa
  socios: Linha[];           // wphd.socios desses sócios
  municipio?: Linha;         // wphd.municipiosibge do município da empresa
  pcont?: Linha;             // wcont.pcont (plano da empresa)
  historicoCnae?: Linha[];   // wphd.empresahistorico
  historicoNire?: Linha[];   // wphd.historico_nire
  /** idconta do sistema anterior → código da conta no Murade (só as que entraram no plano). */
  mapaContas: Record<string, string>;
  /** Tipo de cada conta do Murade (para só usar conta analítica como contrapartida de abertura). */
  tipoConta?: (codigo: string) => ContaPlano['tipo'] | undefined;
}

export interface CampoDoCadastro {
  campo: keyof EmpresaDados;
  rotulo: string;
  /** Tabela e coluna do backup de onde veio. */
  origem: string;
  valor: any;
}

/** Natureza jurídica de titular único (empresário individual, EIRELI): no quadro de sócios a pessoa é titular. */
const CATEGORIA_CONTADOR: Record<string, string> = { C: 'Contador', T: 'Técnico em contabilidade' };
const NATUREZA_TITULAR = new Set(['2135', '2305', '2313', '2321', '2330']);
const ehCpfOuCnpj = (v: string) => /^\d{11}$|^\d{14}$/.test(v.replace(/\D/g, ''));

/** "R QUINTINO BOCAIUVA, 387" → logradouro "R QUINTINO BOCAIUVA" e número "387" (só quando a parte final é claramente o número). */
export function separarNumero(endereco: string): { logradouro: string; numero: string } | null {
  const m = /^(.*\S)\s*,\s*(\d{1,6}[A-Za-z]?|S\/?N)$/i.exec(endereco);
  return m ? { logradouro: m[1], numero: m[2] } : null;
}

/** Sócios que continuam na empresa (sem data de saída), com o cadastro da pessoa. */
export function sociosAtuais(f: Pick<FontesCadastro, 'sociosEmpresa' | 'socios'>): Array<{ se: Linha; pessoa?: Linha }> {
  const porCodigo = new Map(f.socios.map((s) => [Number(s.cdsocio), s]));
  return f.sociosEmpresa
    .filter((se) => !dataIsoSA(se.dtdemissao))
    .sort((a, b) => Number(a.cdsocio) - Number(b.cdsocio))
    .map((se) => ({ se, pessoa: porCodigo.get(Number(se.cdsocio)) }));
}
const nomePessoa = (p?: Linha) => txt(p?.nome_completo) || txt(p?.nmsocio);

/** Todos os campos do cadastro da empresa no Contábil que o backup preenche (só os que têm valor). */
export function cadastroDoBackup(f: FontesCadastro): CampoDoCadastro[] {
  const saida: CampoDoCadastro[] = [];
  const por = (campo: keyof EmpresaDados, rotulo: string, origem: string, valor: any) => { if (!vazio(valor)) saida.push({ campo, rotulo, origem, valor }); };
  const e = f.empresa;
  if (e) {
    const usaNomeCompleto = txt(f.empcont?.stutilizanmcompleto).toUpperCase() === 'S' && txt(e.nmnomecompleto);
    por('razaoSocial', 'razão social', usaNomeCompleto ? 'wphd.empresa.nmnomecompleto' : 'wphd.empresa.nmempresa', usaNomeCompleto ? txt(e.nmnomecompleto) : txt(e.nmempresa));
    por('nomeFantasia', 'nome fantasia', 'wphd.empresa.nmfantasia', txt(e.nmfantasia));
    por('naturezaJuridica', 'natureza jurídica', 'wphd.empresa.cdnaturezajuridica', txt(e.cdnaturezajuridica));
    por('cnae', 'CNAE principal', 'wphd.empresa.cdcnae', txt(e.cdcnae));
    por('inscricaoEstadual', 'inscrição estadual', 'wphd.empresa.nrinscrestadual', txt(e.nrinscrestadual));
    por('inscricaoMunicipal', 'inscrição municipal', 'wphd.empresa.nrinscrmunicipal', txt(e.nrinscrmunicipal));
    por('nire', 'NIRE', 'wphd.empresa.cdnire', txt(e.cdnire));
    por('dataAbertura', 'data de abertura', 'wphd.empresa.dtinicioatividade', dataBR(e.dtinicioatividade));
    const capital = Number(e.vlcapital);
    if (Number.isFinite(capital) && capital > 0) {
      const c = Math.round(Number((capital * 100).toPrecision(15))) / 100;
      por('capitalSocial', 'capital social', 'wphd.empresa.vlcapital', c);
      por('capitalSocialFormatado', 'capital social (tela)', 'wphd.empresa.vlcapital', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c));
    }
    const endereco = txt(e.dsendereco);
    por('endereco', 'endereço', 'wphd.empresa.dsendereco', endereco);
    const partes = separarNumero(endereco);
    if (partes) { por('logradouro', 'logradouro', 'wphd.empresa.dsendereco', partes.logradouro); por('numero', 'número', 'wphd.empresa.dsendereco', partes.numero); }
    por('complemento', 'complemento', 'wphd.empresa.endereco_complemento', txt(e.endereco_complemento));
    // O bairro curto do sistema anterior é cortado em 15 letras; o completo fica em bairro_completo.
    por('bairro', 'bairro', txt(e.bairro_completo) ? 'wphd.empresa.bairro_completo' : 'wphd.empresa.nmbairro', txt(e.bairro_completo) || txt(e.nmbairro));
    por('cep', 'CEP', 'wphd.empresa.nrcep', txt(e.nrcep));
    const municipio = txt(e.nmcidade) || txt(f.municipio?.nmmunicipio);
    const uf = (txt(e.cduf) || txt(f.municipio?.sguf)).toUpperCase();
    por('municipio', 'município', txt(e.nmcidade) ? 'wphd.empresa.nmcidade' : 'wphd.municipiosibge.nmmunicipio', municipio);
    por('uf', 'UF', 'wphd.empresa.cduf', uf);
    if (municipio && uf) por('cidadeUf', 'cidade / UF (tela)', 'wphd.empresa.nmcidade + cduf', `${municipio} / ${uf}`);
    const ibge = /^\d{7}$/.test(txt(e.cdmunicipio)) ? txt(e.cdmunicipio) : txt(f.municipio?.codmunicipio);
    if (/^\d{7}$/.test(ibge)) por('ecdCodigoMunicipioIbge', 'código IBGE do município', /^\d{7}$/.test(txt(e.cdmunicipio)) ? 'wphd.empresa.cdmunicipio' : 'wphd.empresa.idmunicipio → wphd.municipiosibge.codmunicipio', ibge);
    por('telefone', 'telefone', 'wphd.empresa.nrtelefone', txt(e.nrtelefone));
    por('email', 'e-mail', 'wphd.empresa.nmemail', txt(e.nmemail));
    por('codigoSistemaAnterior', 'código da empresa no sistema anterior', 'wphd.empresa.cdempresa', txt(e.cdempresa));
    por('descricaoAtividade', 'descrição da atividade', 'wphd.empresa.dsatividade', txt(e.dsatividade));
    por('fax', 'fax', 'wphd.empresa.nrfax', txt(e.nrfax));
    por('juntaComercialData', 'data do registro na Junta', dataBR(e.dtregjuntacomercial) ? 'wphd.empresa.dtregjuntacomercial' : 'wphd.empresa.dtexpedicaonire', dataBR(e.dtregjuntacomercial) || dataBR(e.dtexpedicaonire));
    por('responsavelNascimento', 'nascimento do responsável', 'wphd.empresa.dtnascimento', dataBR(e.dtnascimento));
    por('inicioServicoContabil', 'início do serviço contábil no escritório', dataBR(e.dtiniservcont) ? 'wphd.empresa.dtiniservcont' : 'wphd.empresa.escritorio_data_entrada', dataBR(e.dtiniservcont) || dataBR(e.escritorio_data_entrada));
    if (e.stativa !== null && e.stativa !== undefined && txt(e.stativa) !== '') por('ativaNoEscritorio', 'cliente ativo no escritório', 'wphd.empresa.stativa', sim(e.stativa));
    por('observacoes', 'observações', 'wphd.empresa.obs', txt(e.obs));
  }
  const hc = (f.historicoCnae || []).filter((x) => txt(x.cdcnae)).sort((a, b) => dataIsoSA(a.dtinicial).localeCompare(dataIsoSA(b.dtinicial)))
    .map((x) => ({ data: dataBR(x.dtinicial), cnae: txt(x.cdcnae) }));
  por('historicoCnae', 'histórico de CNAE', 'wphd.empresahistorico', hc);
  const hn = (f.historicoNire || []).filter((x) => txt(x.numero)).sort((a, b) => Number(a.id) - Number(b.id)).map((x) => ({ data: dataBR(x.data), numero: txt(x.numero) }));
  por('historicoNire', 'histórico de NIRE', 'wphd.historico_nire', hn);
  // Responsável legal (assina a ECD e os termos) e quadro de sócios.
  const atuais = sociosAtuais(f);
  const resp = atuais.find((s) => s.se.stresponsavelcgc === true || sim(s.se.stresponsavelcgc));
  if (resp) {
    por('responsavelNome', 'responsável legal', txt(resp.pessoa?.nome_completo) ? 'wphd.socios.nome_completo' : 'wphd.socios.nmsocio', nomePessoa(resp.pessoa));
    if (ehCpfOuCnpj(txt(resp.pessoa?.nrcpf))) por('responsavelCpf', 'CPF do responsável', 'wphd.socios.nrcpf', txt(resp.pessoa?.nrcpf));
    const q = txt(resp.se.stqualificacaosped) || txt(resp.se.ecf_ecd_qualificacao_codigo);
    if (/^\d{3}$/.test(q)) por('responsavelQualificacao', 'qualificação do responsável (ECD)', txt(resp.se.stqualificacaosped) ? 'wphd.socemp.stqualificacaosped' : 'wphd.socemp.ecf_ecd_qualificacao_codigo', q);
  }
  const titular = NATUREZA_TITULAR.has(txt(e?.cdnaturezajuridica));
  const qsa = atuais.filter((s) => nomePessoa(s.pessoa)).map((s) => {
    const item: NonNullable<EmpresaDados['qsa']>[number] = { nome: nomePessoa(s.pessoa), qualificacao: titular ? 'Titular' : (s.se.stgerente === true || sim(s.se.stgerente)) ? 'Sócio-Administrador' : 'Sócio' };
    const cpf = txt(s.pessoa?.nrcpf); if (cpf) item.cpf = cpf;
    const pct = Number(s.se.alcapital); if (Number.isFinite(pct) && pct > 0) item.participacaoPercentual = pct;
    const cap = Number(s.se.vlcapital); if (Number.isFinite(cap) && cap > 0) item.capitalCentavos = Math.round(Number((cap * 100).toPrecision(15)));
    const ent = dataBR(s.se.dtadmissao); if (ent) item.dataEntrada = ent;
    return item;
  });
  por('qsa', 'quadro de sócios', 'wphd.socemp + wphd.socios', qsa);
  // Contador (assina a ECD e os termos): o cadastro de contador ligado à empresa; sem ele, o que está na própria empresa.
  const c = f.contador;
  if (c) {
    por('contadorNome', 'contador', 'wcont.contador.nome', txt(c.nome));
    por('contadorCrc', 'CRC do contador', 'wcont.contador.crc', txt(c.crc));
    por('contadorUfCrc', 'UF do CRC', 'wcont.contador.uf_crc', txt(c.uf_crc).toUpperCase());
    const cpf = txt(c.cpf).replace(/\D/g, '');
    if (cpf && cpf.length <= 11) por('contadorCpf', 'CPF do contador', 'wcont.contador.cpf', cpf.padStart(11, '0')); // o sistema anterior guarda o CPF como número (perde o zero da frente)
    por('contadorEmail', 'e-mail do contador', 'wcont.contador.email', txt(c.email));
    por('contadorFone', 'telefone do contador', 'wcont.contador.telefone', txt(c.telefone));
    por('contadorRg', 'RG do contador', 'wcont.contador.rg', txt(c.rg));
    por('contadorRgOrgao', 'órgão do RG do contador', 'wcont.contador.orgao_expedidor_rg', txt(c.orgao_expedidor_rg));
    por('contadorRgData', 'emissão do RG do contador', 'wcont.contador.data_emissao_rg', dataBR(c.data_emissao_rg));
    por('contadorCategoria', 'categoria do contador', 'wcont.contador.qualificacao', CATEGORIA_CONTADOR[txt(c.qualificacao).toUpperCase()] || '');
  } else if (f.empcont) {
    por('contadorNome', 'contador', 'wcont.empcont.nmcontador', txt(f.empcont.nmcontador));
    por('contadorCrc', 'CRC do contador', 'wcont.empcont.nrcrc', txt(f.empcont.nrcrc));
    por('contadorCpf', 'CPF do contador', 'wcont.empcont.nrcpf', txt(f.empcont.nrcpf));
    por('contadorRg', 'RG do contador', 'wcont.empcont.nrrgcontador', txt(f.empcont.nrrgcontador));
    por('contadorRgOrgao', 'órgão do RG do contador', 'wcont.empcont.nmorgaoexpcontador', txt(f.empcont.nmorgaoexpcontador));
    por('contadorRgData', 'emissão do RG do contador', 'wcont.empcont.dtemissaorgcontador', dataBR(f.empcont.dtemissaorgcontador));
    por('contadorCategoria', 'categoria do contador', 'wcont.empcont.tpcontador', CATEGORIA_CONTADOR[txt(f.empcont.tpcontador).toUpperCase()] || '');
  }
  const livro = Number(f.empcont?.nrlivrodiario);
  if (Number.isInteger(livro) && livro > 0) por('ecdNumeroLivro', 'número do livro Diário', 'wcont.empcont.nrlivrodiario', livro);
  const pos = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined; };
  if (f.empcont) {
    const nl: NonNullable<EmpresaDados['livrosNumeracao']> = {};
    if (pos(f.empcont.nrpaginadiario)) nl.diarioPagina = pos(f.empcont.nrpaginadiario);
    for (const [k, l, pg] of [['razao', 'nrlivrorazao', 'nrpaginarazao'], ['caixa', 'nrlivrocaixa', 'nrpaginacaixa']] as const) {
      const x: { livro?: number; pagina?: number } = {};
      if (pos(f.empcont[l])) x.livro = pos(f.empcont[l]);
      if (pos(f.empcont[pg])) x.pagina = pos(f.empcont[pg]);
      if (Object.keys(x).length) nl[k] = x;
    }
    if (Object.keys(nl).length) por('livrosNumeracao', 'numeração dos livros', 'wcont.empcont.nrpagina*/nrlivro*', nl);
  }
  por('planoMascara', 'máscara do código das contas', 'wcont.pcont.dsmascaraclassinterna', txt(f.pcont?.dsmascaraclassinterna));
  for (const [campoConta, col, rot] of [['contaApuracaoResultadoCodigo', 'idcontadeapuracaoderesultado', 'conta de apuração do resultado'], ['contaLucroCodigo', 'idcontalucro', 'conta de lucro'], ['contaPrejuizoCodigo', 'idcontaprejuizo', 'conta de prejuízo']] as const) {
    const id = f.pcont?.[col];
    const codigo = id != null ? f.mapaContas[String(Number(id))] : undefined;
    if (codigo) por(campoConta, rot, `wcont.pcont.${col}`, codigo);
  }
  const abertura = f.pcont?.idcontaaberturaimplantacao;
  if (abertura != null) {
    const codigo = f.mapaContas[String(Number(abertura))];
    if (codigo && (!f.tipoConta || f.tipoConta(codigo) === 'analitica')) por('contaContrapartidaAberturaCodigo', 'contrapartida da abertura', 'wcont.pcont.idcontaaberturaimplantacao', codigo);
  }
  return saida;
}

/** Bens do imobilizado do sistema anterior no formato do módulo Imobilizado do Contábil (só os que passam na validação). */
export function bensDoBackup(cdempresa: number, bens: Linha[], mapaContas: Record<string, string> = {}): { bens: BemImobilizado[]; avisos: string[] } {
  const saida: BemImobilizado[] = []; const avisos: string[] = [];
  for (const b of bens) {
    const custo = Math.round(Number((Number(b.vloriginalmoeda || b.vlcompra || 0) * 100).toPrecision(15)));
    const taxa = Number(b.txdepreciacao || 0);
    const inicio = (dataIsoSA(b.dtinidepreciacao) || dataIsoSA(b.dtaquisicao) || dataIsoSA(b.dtcompra)).slice(0, 7);
    const vida = taxa > 0 ? 1200 / taxa : 0;
    const bem: BemImobilizado = {
      id: `sa-bem-${cdempresa}-${txt(b.idbem)}`.slice(0, 64), descricao: txt(b.dsbem).slice(0, 240), custoCentavos: custo, residualCentavos: 0,
      vidaUtilMeses: Math.round(vida), inicioDepreciacao: inicio, depreciavel: taxa > 0,
    };
    const extra: Array<[keyof BemImobilizado, string]> = [['codigo', txt(b.cdchamada)], ['fornecedor', txt(b.nmfornecedor)], ['notaFiscal', txt(b.nrdocumento)], ['numeroSerie', txt(b.numerodeserie)],
      ['dataCompra', dataIsoSA(b.dtcompra)], ['contaBemCodigo', b.idconta != null ? mapaContas[String(Number(b.idconta))] || '' : ''], ['contaDepreciacaoCodigo', b.idcontadepreciacao != null ? mapaContas[String(Number(b.idcontadepreciacao))] || '' : '']];
    for (const [k, v] of extra) if (v) (bem as any)[k] = v.slice(0, 160);
    const baixa = dataIsoSA(b.dtbaixa);
    if (baixa) bem.baixa = { competencia: baixa.slice(0, 7), valorVendaCentavos: Math.max(0, Math.round(Number((Number(b.vlbaixa || 0) * 100).toPrecision(15)))), motivo: 'baixa' };
    const erros = validarBem(bem);
    if (erros.length) { avisos.push(`Bem ${txt(b.cdchamada) || txt(b.idbem)} (${txt(b.dsbem)}) ficou só no registro do sistema anterior: ${erros.join(' ')}`); continue; }
    if (vida !== Math.round(vida)) avisos.push(`Bem ${txt(b.cdchamada)} (${bem.descricao}): taxa de ${taxa}% ao ano dá ${vida.toFixed(2)} meses; no Murade ficou ${bem.vidaUtilMeses} meses.`);
    saida.push(bem);
  }
  return { bens: saida, avisos };
}

// ---------------------------------------------------------------------------------------------------------------------
// Para onde vai cada coluna do backup. "campo" = campo/estrutura própria do Contábil; "consulta" = só no registro
// guardado do sistema anterior (bloco); "nao_vem" = não é dado da empresa ou não tem uso. Colunas não listadas seguem o
// padrão da tabela.
export type Destino = { tipo: 'campo'; para: string } | { tipo: 'consulta'; motivo: string } | { tipo: 'nao_vem'; motivo: string };
export interface DestinoTabela { bloco?: string; padrao: Destino; colunas: Record<string, Destino> }

const campo = (para: string): Destino => ({ tipo: 'campo', para });
const consulta = (motivo: string): Destino => ({ tipo: 'consulta', motivo });
const naoVem = (motivo: string): Destino => ({ tipo: 'nao_vem', motivo });
const SEM_CAMPO = consulta('o Contábil não tem campo para isto; fica no registro do sistema anterior');

export const DESTINO_COLUNAS: Record<string, DestinoTabela> = {
  'wphd.empresa': {
    bloco: 'cadastro_empresa', padrao: SEM_CAMPO, colunas: {
      cdempresa: campo('Empresa › Mais dados › Código no sistema anterior'),
      dsatividade: campo('Empresa › Mais dados › Descrição da atividade'), nrfax: campo('Empresa › Mais dados › Fax'),
      dtregjuntacomercial: campo('Empresa › Mais dados › Data do registro na Junta'), dtexpedicaonire: campo('Empresa › Mais dados › Data do registro na Junta (é a mesma data do NIRE)'),
      nrregjuntacomercial: consulta('é o mesmo número do NIRE (sem o dígito), que já vem no campo NIRE'),
      dtnascimento: campo('Empresa › Mais dados › Nascimento do responsável'), dtiniservcont: campo('Empresa › Mais dados › Início do serviço contábil'),
      escritorio_data_entrada: campo('Empresa › Mais dados › Início do serviço contábil (mesma informação)'), stativa: campo('Empresa › Mais dados › Cliente ativo no escritório'),
      obs: campo('Empresa › Mais dados › Observações'),
      tpcalculoir: consulta('código interno do programa antigo sem significado documentado; não vai para campo para não pôr informação incerta'),
      lancautomatico: consulta('opção de funcionamento do programa antigo'), centrocusto: consulta('opção de funcionamento do programa antigo'),
      nmempresa: campo('Empresa › Razão social'), nmnomecompleto: campo('Empresa › Razão social (quando o sistema anterior usa o nome completo nos relatórios)'),
      nmfantasia: campo('Empresa › Nome fantasia'), nrcgc: campo('Empresa › CNPJ'), cdnaturezajuridica: campo('Empresa › Natureza jurídica'), cdcnae: campo('Empresa › CNAE principal'),
      nrinscrestadual: campo('Empresa › Inscrição estadual'), nrinscrmunicipal: campo('Empresa › Inscrição municipal'), cdnire: campo('Empresa › NIRE'),
      dtinicioatividade: campo('Empresa › Data de abertura (também data dos atos na ECD)'), vlcapital: campo('Empresa › Capital social'),
      dsendereco: campo('Empresa › Endereço (e logradouro/número da ECF)'), endereco_complemento: campo('Empresa › Complemento'),
      nmbairro: campo('Empresa › Bairro (quando não há o bairro completo)'), bairro_completo: campo('Empresa › Bairro'), nrcep: campo('Empresa › CEP'),
      nmcidade: campo('Empresa › Cidade / UF'), cduf: campo('Empresa › Cidade / UF'), idmunicipio: campo('ECD/ECF › Código IBGE do município'), cdmunicipio: campo('ECD/ECF › Código IBGE do município'),
      nrtelefone: campo('Empresa › Telefone'), nmemail: campo('Empresa › E-mail'),
      imglogotipoempresa: naoVem('imagem do logotipo (arquivo binário); vazio neste backup'), stformatologomarca: naoVem('formato da imagem do logotipo, que não veio'),
      certificado_id: consulta('ligação com o certificado digital do sistema anterior; o certificado é enviado de novo no Murade'),
    },
  },
  'wcont.empcont': {
    bloco: 'empresa_contabil', padrao: consulta('opção de funcionamento do programa antigo (mês em processamento, período de lotes, impressão)'), colunas: {
      idplanodecontas: campo('Plano de contas da empresa'), nrlivrodiario: campo('ECD › Número do livro Diário'),
      nmcontador: campo('Empresa › Contador (se não houver contador ligado)'), nrcrc: campo('Empresa › CRC (se não houver contador ligado)'), nrcpf: campo('Empresa › CPF do contador (se não houver contador ligado)'),
      contador_id: campo('Empresa › dados do contador'), stutilizanmcompleto: campo('decide qual nome vai na razão social'),
      nrpaginadiario: campo('Empresa › Mais dados › Página do Diário'), nrlivrorazao: campo('Empresa › Mais dados › Livro Razão'), nrpaginarazao: campo('Empresa › Mais dados › Página do Razão'),
      nrlivrocaixa: campo('Empresa › Mais dados › Livro Caixa'), nrpaginacaixa: campo('Empresa › Mais dados › Página do Caixa'),
      nrrgcontador: campo('Empresa › Mais dados › RG do contador'), nmorgaoexpcontador: campo('Empresa › Mais dados › Órgão do RG do contador'), dtemissaorgcontador: campo('Empresa › Mais dados › Emissão do RG do contador'),
      tpcontador: campo('Empresa › Mais dados › Categoria do contador'),
    },
  },
  'wcont.contador': {
    bloco: 'contador', padrao: SEM_CAMPO, colunas: {
      id: consulta('código interno'), nome: campo('Empresa › Contador'), crc: campo('Empresa › CRC'), uf_crc: campo('Empresa › UF do CRC'), cpf: campo('Empresa › CPF do contador'),
      email: campo('Empresa › E-mail do contador'), telefone: campo('Empresa › Telefone do contador'),
      rg: campo('Empresa › Mais dados › RG do contador'), orgao_expedidor_rg: campo('Empresa › Mais dados › Órgão do RG do contador'), data_emissao_rg: campo('Empresa › Mais dados › Emissão do RG do contador'),
      qualificacao: campo('Empresa › Mais dados › Categoria do contador (C = Contador, T = Técnico)'),
    },
  },
  'wphd.socemp': {
    bloco: 'socios_empresa', padrao: consulta('dado do sócio para a folha (pró-labore, RAIS, IRRF, CBO): é do Murade DP'), colunas: {
      alcapital: campo('Empresa › Quadro de sócios › Participação (%)'), vlcapital: campo('Empresa › Quadro de sócios › Capital'), dtadmissao: campo('Empresa › Quadro de sócios › Entrada'),
      stresponsavelcgc: campo('Empresa › Responsável legal'), stqualificacaosped: campo('ECD › Qualificação do responsável'), ecf_ecd_qualificacao_codigo: campo('ECD › Qualificação do responsável'),
      stgerente: campo('Empresa › Quadro de sócios (qualificação)'), cdsocio: campo('Empresa › Quadro de sócios'), dtdemissao: campo('sócio que saiu não entra no quadro'),
    },
  },
  'wphd.socios': {
    bloco: 'socios', padrao: consulta('dado pessoal do sócio (documentos, endereço, família): fica com o Murade DP, que cuida do pró-labore'), colunas: {
      nmsocio: campo('Empresa › Responsável legal / Quadro de sócios'), nome_completo: campo('Empresa › Responsável legal / Quadro de sócios'), nrcpf: campo('Empresa › CPF do responsável e Quadro de sócios › CPF'),
    },
  },
  'wphd.municipiosibge': { bloco: 'municipio', padrao: consulta('tabela de municípios'), colunas: { codmunicipio: campo('ECD/ECF › Código IBGE do município') } },
  'wphd.empresahistorico': { bloco: 'cadastro_historico_cnae', padrao: campo('Empresa › Mais dados › Histórico de CNAE'), colunas: { cdempresa: consulta('código interno') } },
  'wphd.historico_nire': { bloco: 'historico_nire', padrao: campo('Empresa › Mais dados › Histórico de NIRE'), colunas: { id: consulta('código interno'), empresa_id: consulta('código interno') } },
  'wphd.historico_retencao': { bloco: 'historico_retencao', padrao: consulta('código de retenção do IR do pró-labore dos sócios: é do Murade DP'), colunas: {} },
  'wphd.travacontabil': { bloco: 'trava_contabil', padrao: consulta('trava interna do programa antigo; no Murade quem fecha a competência é a equipe (Fechamento)'), colunas: {} },
  'wcont.pcont': {
    bloco: 'plano_cadastro', padrao: consulta('configuração do plano no sistema anterior (níveis, máscara, contas de lucro/prejuízo); o Murade acha a conta de apuração pelo nome'), colunas: {
      idcontaaberturaimplantacao: campo('Plano de Contas › Contrapartida da abertura'), nmplanodecontas: campo('razão social só quando a empresa não tem cadastro'),
      dsmascaraclassinterna: campo('Empresa › Mais dados › Máscara do código das contas (cada nível mantém os mesmos dígitos: 9-9-99-99-99 → 1.1.01.01.01)'),
      idcontadeapuracaoderesultado: campo('Empresa › Mais dados › Conta de apuração do resultado'), idcontalucro: campo('Empresa › Mais dados › Conta de lucro'), idcontaprejuizo: campo('Empresa › Mais dados › Conta de prejuízo'),
    },
  },
  'wcont.contas': {
    bloco: 'plano_contas', padrao: consulta('opção de funcionamento do programa antigo para a conta (periodicidade, conta externa/orçamentária, conciliação)'), colunas: {
      idconta: campo('liga lançamentos e saldos à conta'), idplanodecontas: campo('escolhe as contas do plano da empresa'), cdclassinterna: campo('Plano de Contas › Código'), nmconta: campo('Plano de Contas › Descrição'),
      tpconta: campo('Plano de Contas › Tipo (sintética/analítica)'), idorigem: campo('Plano de Contas › Natureza (D/C)'),
      cdchamada: campo('Plano de Contas › Código reduzido'),
      dtcad: consulta('data em que a conta foi criada no programa antigo (controle técnico)'), dtalt: consulta('data de alteração no programa antigo (controle técnico)'),
      cdagencia: naoVem('sempre 0 neste backup'), nrcontabanco: naoVem('sempre 0 neste backup'), conta_referenciada_id: naoVem('sempre -1 (sem conta referenciada) neste backup'),
    },
  },
  'wcont.hist': { bloco: 'historicos_padrao', padrao: SEM_CAMPO, colunas: { cdchamada: campo('Históricos padrão › Código'), dshistoricopadrao: campo('Históricos padrão › Texto'), idhistoricopadrao: campo('completa o histórico do lançamento que veio sem texto'), stcomplemento: campo('Históricos padrão › Pede complemento') } },
  'wcont.mv': {
    bloco: 'lancamentos_originais', padrao: consulta('controle técnico do programa antigo (usuário e hora de gravação, rotina de origem, identificadores internos)'), colunas: {
      idmovimento: campo('identificação do lançamento no Murade'), dtlancamento: campo('Lançamentos › Data e competência'), idconta: campo('Lançamentos › Conta débito/crédito'),
      vllancamento: campo('Lançamentos › Valor (negativo = débito, positivo = crédito)'), dshistorico: campo('Lançamentos › Histórico'), dsdocumento: campo('Lançamentos › Documento'),
      idlote: campo('Lançamentos › Documento (número do lote)'), idlotelancamento: campo('junta as duas linhas da partida'), idhistoricopadrao: campo('Lançamentos › Histórico (quando a linha não tem texto)'),
      stencerramento: campo('Lançamentos › Encerramento do exercício'), idcontrapartida: consulta('a contrapartida já sai da outra linha da partida'),
      identificador_sequencial: campo('Lançamentos › Número sequencial'),
      lancamento_extemporaneo_data: naoVem('data zerada do sistema anterior (30/12/1899 = sem data)'),
    },
  },
  'wcont.sd': { bloco: 'saldos', padrao: consulta('usados para conferir o balancete do Murade com o do sistema anterior'), colunas: {} },
  'wcont.lt': { bloco: 'lotes', padrao: consulta('controle do lote no programa antigo (totais, situação, versão, usuário)'), colunas: { cdchamada: campo('Lançamentos › Documento ("Lote 00001")'), idlote: campo('liga o lançamento ao lote'), dslote: campo('Lançamentos › Descrição do lote') } },
  'wcont.lancamento': { bloco: 'lancamentos_lote_aberto', padrao: consulta('lançamento em lote ABERTO, não efetivado no sistema anterior: não entra no balancete'), colunas: {} },
  'wcont.lauto': { bloco: 'lancamentos_automaticos', padrao: consulta('modelos de integração por tipo de documento; os lançamentos padrão do Murade têm outro formato (mensais, com valor)'), colunas: {} },
  'wcont.lcontas': { bloco: 'lancamentos_automaticos_contas', padrao: consulta('contas dos modelos de integração'), colunas: {} },
  'wcont.titulos': { bloco: 'titulos', padrao: campo('Gestão › Títulos a pagar e receber'), colunas: {
    idempresa: consulta('código interno'), idempresafiscal: consulta('código interno do módulo fiscal do programa antigo'), stnotapendente: consulta('controle do programa antigo'),
    codigo_ecf: consulta('código interno do programa antigo'), servico_codigo: consulta('código de serviço do programa antigo'), aliquota_iss: consulta('alíquota de ISS do programa antigo'),
    cdforcli: campo('Títulos › Documento do fornecedor/cliente (quando não há CNPJ/CPF)') } },
  'wcont.baixa_titulos': { bloco: 'titulos_baixas', padrao: campo('Títulos › Baixas'), colunas: { idtitulo: campo('liga a baixa ao título'), idlancautomatico: consulta('modelo de integração usado na baixa'), idcontrolebaixa: consulta('controle interno do programa antigo'), historico_padrao_id: consulta('código interno do histórico (o texto vem)') } },
  'wcont.titulos_provisao': { bloco: 'titulos_provisao', padrao: campo('Títulos › Provisão'), colunas: { idempresa: consulta('código interno'), idtitulo: campo('liga a provisão ao título') } },
  'wcont.operadora_cartao_de_credito': { bloco: 'cartao_operadoras', padrao: campo('Cartões › Nome da operadora'), colunas: {} },
  'wcont.estabelecimento_cartao_credito': { bloco: 'cartao_estabelecimentos', padrao: campo('Gestão › Cartões (antiga DIRF) › Estabelecimento'), colunas: { empresa_id: consulta('código interno'), dirfcartoes_web_id: consulta('código do serviço web da antiga DIRF de cartões'), dirfcartoes_web_mensagem: consulta('mensagem do serviço web da antiga DIRF'), dirfcartoes_web_tipo_mensagem: consulta('tipo da mensagem do serviço web'), senha: naoVem('senha da operadora: nunca é guardada'), usuario: naoVem('usuário da operadora: nunca é guardado'), codigo_acesso_operadora: naoVem('código de acesso da operadora: nunca é guardado') } },
  'wcont.movimento_cartao_credito': { bloco: 'cartao_movimentos', padrao: campo('Gestão › Cartões (antiga DIRF) › Informações por mês'), colunas: { id: consulta('código interno'), estabelecimento_cartao_credito_id: campo('liga ao estabelecimento') } },
  'wcont.lancamento_identificador_sequencial': { bloco: 'identificador_sequencial', padrao: consulta('numeração interna dos lançamentos'), colunas: {} },
  'wcont.ecf_linha_conta': { bloco: 'ecf_linhas_contas', padrao: consulta('ligação conta x linha do e-Lalur (M300/M350) de anos antigos'), colunas: {} },
  'wcont.ecf_conta_configuracao': { bloco: 'ecf_configuracao_contas', padrao: consulta('configuração da conta para a ECF'), colunas: {} },
  'wcont.demonstrativo_contabil_configuracao': { bloco: 'demonstracoes_configuracao', padrao: consulta('agrupamento próprio do sistema anterior para os demonstrativos; o Murade classifica pela estrutura do plano'), colunas: {} },
  'wcont.demonstrativo_contabil_modelo': { bloco: 'demonstracoes_modelos', padrao: consulta('modelo de demonstrativo do sistema anterior'), colunas: {} },
  'wcont.demonstrativo_contabil_modelo_analise': { bloco: 'demonstracoes_modelos_analise', padrao: consulta('grupos do modelo de demonstrativo'), colunas: {} },
  'wcont.textoassbalanco': { bloco: 'textos_assinatura', padrao: consulta('modelo de assinatura do balanço; o Murade monta a assinatura com o responsável e o contador'), colunas: {} },
  'wcont.textoassinatura': { bloco: 'textos_assinatura', padrao: consulta('modelo de assinatura dos livros; o Murade monta a assinatura com o responsável e o contador'), colunas: {} },
  'wativo.emp_ativ': { bloco: 'imobilizado_empresa', padrao: consulta('configuração do imobilizado no sistema anterior'), colunas: {} },
  'wativo.empcfg': { bloco: 'imobilizado_configuracao', padrao: consulta('método de depreciação por ano'), colunas: {} },
  'wativo.be': {
    bloco: 'imobilizado_bens', padrao: consulta('dado do bem sem campo no Imobilizado do Contábil (fornecedor, nota, contas, valores corrigidos)'), colunas: {
      idbem: campo('Imobilizado › identificação do bem'), dsbem: campo('Imobilizado › Descrição'), vloriginalmoeda: campo('Imobilizado › Custo'), vlcompra: campo('Imobilizado › Custo (quando não há valor original)'),
      txdepreciacao: campo('Imobilizado › Vida útil (1200 ÷ taxa anual)'), dtinidepreciacao: campo('Imobilizado › Início da depreciação'), dtaquisicao: campo('Imobilizado › Início (quando não há início da depreciação)'),
      dtbaixa: campo('Imobilizado › Baixa'), vlbaixa: campo('Imobilizado › Valor da baixa'),
      cdchamada: campo('Imobilizado › Código do bem'), nmfornecedor: campo('Imobilizado › Fornecedor'), nrdocumento: campo('Imobilizado › Nota fiscal'), numerodeserie: campo('Imobilizado › Número de série'),
      dtcompra: campo('Imobilizado › Data da compra'), idconta: campo('Imobilizado › Conta do bem'), idcontadepreciacao: campo('Imobilizado › Conta da depreciação'),
      dsbemdep: consulta('nome da conta da depreciação (já vem pela conta)'),
    },
  },
};


// ---------------------------------------------------------------------------------------------------------------------
// Títulos a pagar/receber e informações de cartões (antiga DIRF): do backup para as estruturas do Contábil.
const centavosSA = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n)) return 0; const c = Math.round(Number((Math.abs(n) * 100).toPrecision(15))); return n < 0 ? -c : c; };

export function titulosDoBackup(cdempresa: number, b: Record<string, Linha[]>, mapaContas: Record<string, string>): Titulo[] {
  const mvPorId = new Map((b.lancamentos_originais || []).map((m) => [txt(m.idmovimento), m]));
  const contaDoMv = (id: unknown) => { const m = mvPorId.get(txt(id)); return m ? mapaContas[String(Number(m.idconta))] : undefined; };
  const baixas = new Map<string, Linha[]>(); for (const x of b.titulos_baixas || []) { const k = txt(x.idtitulo); baixas.set(k, [...(baixas.get(k) || []), x]); }
  const provs = new Map<string, Linha[]>(); for (const x of b.titulos_provisao || []) { const k = txt(x.idtitulo); provs.set(k, [...(provs.get(k) || []), x]); }
  const saida: Titulo[] = [];
  for (const t of b.titulos || []) {
    const id = txt(t.idtitulo);
    const pagar = txt(t.tipodocumento).toUpperCase() !== 'S';
    const bx = (baixas.get(id) || []).sort((x, y) => dataIsoSA(x.dtbaixa).localeCompare(dataIsoSA(y.dtbaixa)));
    const pv = provs.get(id) || [];
    // Contas pelo lançamento que o próprio sistema anterior fez (baixa: D fornecedor / C caixa; provisão: D despesa / C fornecedor).
    const contaTitulo = (pagar ? contaDoMv(bx[0]?.idlanccontdeb) || contaDoMv(pv[0]?.idlanccontcred) : contaDoMv(bx[0]?.idlanccontcred) || contaDoMv(pv[0]?.idlanccontdeb));
    const contaContrapartida = pagar ? contaDoMv(pv[0]?.idlanccontdeb) : contaDoMv(pv[0]?.idlanccontcred);
    const titulo: Titulo = {
      id: `sa-tit-${cdempresa}-${id}`.slice(0, 80), tipo: pagar ? 'pagar' : 'receber', numero: txt(t.nrdocumento), participanteNome: txt(t.nmfornecedor) || '(sem nome no sistema anterior)',
      dataEmissao: dataIsoSA(t.dtcontabil), valorCentavos: centavosSA(t.vltitulo), baixas: [], provisoes: [], origem: 'sistema_anterior', origemId: id,
    };
    if (txt(t.nmserienf)) titulo.serie = txt(t.nmserienf);
    if (txt(t.idmoddocfiscal)) titulo.modelo = txt(t.idmoddocfiscal);
    if (txt(t.cnpj_cpf) || txt(t.cdforcli)) titulo.participanteDocumento = txt(t.cnpj_cpf) || txt(t.cdforcli);
    if (txt(t.dsstatus)) titulo.situacaoOrigem = txt(t.dsstatus);
    if (contaTitulo) titulo.contaTitulo = contaTitulo;
    if (contaContrapartida) titulo.contaContrapartida = contaContrapartida;
    for (const x of bx) {
      const disp = pagar ? contaDoMv(x.idlanccontcred) : contaDoMv(x.idlanccontdeb);
      const baixa: Titulo['baixas'][number] = { id: `sa-bx-${txt(x.idbaixa_titulos)}`.slice(0, 80), data: dataIsoSA(x.dtbaixa), valorCentavos: centavosSA(x.vlbaixa), origem: 'sistema_anterior', origemId: txt(x.idbaixa_titulos) };
      if (txt(x.nrdocbaixa)) baixa.documento = txt(x.nrdocbaixa);
      if (txt(x.historico_padrao_descricao)) baixa.historico = txt(x.historico_padrao_descricao);
      if (txt(x.tpbaixa)) baixa.tipo = txt(x.tpbaixa);
      if (txt(x.stbaixa)) baixa.situacao = txt(x.stbaixa);
      if (disp) baixa.contaDisponibilidade = disp;
      const lanc = [txt(x.idlanccontdeb), txt(x.idlanccontcred)].filter(Boolean);
      if (lanc.length) baixa.lancamentosSistemaAnterior = lanc;
      titulo.baixas.push(baixa);
    }
    for (const x of pv) {
      const p: Titulo['provisoes'][number] = { origem: 'sistema_anterior', origemId: txt(x.idtitulo_provisao) };
      if (txt(x.idnota)) p.documento = txt(x.idnota);
      const lanc = [txt(x.idlanccontdeb), txt(x.idlanccontcred)].filter(Boolean);
      if (lanc.length) p.lancamentosSistemaAnterior = lanc;
      titulo.provisoes.push(p);
    }
    if (titulo.dataEmissao && titulo.valorCentavos > 0) saida.push(titulo);
  }
  return saida;
}

export function cartoesDoBackup(cdempresa: number, b: Record<string, Linha[]>): EstabelecimentoCartao[] {
  const operadoras = new Map((b.cartao_operadoras || []).map((o) => [String(o.id), txt(o.nome)]));
  const movs = new Map<string, Linha[]>(); for (const m of b.cartao_movimentos || []) { const k = String(m.estabelecimento_cartao_credito_id); movs.set(k, [...(movs.get(k) || []), m]); }
  return (b.cartao_estabelecimentos || []).map((e) => {
    const c: EstabelecimentoCartao = {
      id: `sa-cartao-${cdempresa}-${e.id}`.slice(0, 80), operadora: operadoras.get(String(e.operadora)) || `Operadora ${txt(e.operadora)}`, codigoEstabelecimento: txt(e.codigo_estabelecimento),
      movimentos: (movs.get(String(e.id)) || []).sort((x, y) => dataIsoSA(x.referencia).localeCompare(dataIsoSA(y.referencia)) || Number(x.id) - Number(y.id)).map((m) => {
        const mv: EstabelecimentoCartao['movimentos'][number] = { referencia: dataIsoSA(m.referencia), rendimentoCentavos: centavosSA(m.valor_rendimento), irCentavos: centavosSA(m.valor_ir) };
        if (txt(m.beneficiario_cnpj)) mv.beneficiarioDocumento = txt(m.beneficiario_cnpj);
        if (txt(m.beneficiario_nome)) mv.beneficiarioNome = txt(m.beneficiario_nome);
        if (m.data_importacao) mv.importadoEm = String(m.data_importacao instanceof Date ? m.data_importacao.toISOString() : m.data_importacao);
        return mv;
      }),
      origem: 'sistema_anterior', origemId: String(e.id),
    };
    if (e.operadora !== null && e.operadora !== undefined) c.operadoraCodigo = String(e.operadora);
    for (const [k, col] of [['banco', 'banco'], ['agencia', 'agencia'], ['conta', 'conta']] as const) if (txt(e[col])) c[k] = txt(e[col]);
    if (e.inativo === true) c.inativo = true;
    if (dataIsoSA(e.data_inatividade)) c.dataInatividade = dataIsoSA(e.data_inatividade);
    return c;
  });
}

/** Tabela do catálogo para um nome do backup (wcont.mv00023 → wcont.mv). */
export function destinoDaTabela(nome: string): { chave: string; destino: DestinoTabela } | null {
  const n = nome.toLowerCase();
  const chave = /^(wcont|wativo)\.(mv|sd|lt|be)\d{5}$/.test(n) ? n.replace(/\d{5}$/, '') : n;
  const destino = DESTINO_COLUNAS[chave];
  return destino ? { chave, destino } : null;
}
export function destinoDaColuna(tabela: string, coluna: string): Destino {
  const t = destinoDaTabela(tabela);
  if (!t) return naoVem('tabela que não é dado das empresas (configuração ou registro interno do programa)');
  return t.destino.colunas[coluna.toLowerCase()] || t.destino.padrao;
}

/** Tabelas do backup que ficam de fora de propósito (não são dado das empresas), com o motivo — para o relatório. */
export const TABELAS_FORA: Array<{ tabelas: string; motivo: string }> = [
  { tabelas: 'wcont.plano_ref, wcont.ecf_linha, wcont.parte_b_codigos, wcont.parte_b_codigos_linha_ficha, wcont.ibge_*', motivo: 'catálogos oficiais da Receita/IBGE que o Murade já tem' },
  { tabelas: 'wcont.bureau, wcont.dremaster, wcont.smi, wcont.rtm, wcont.codigo, wcont.amdconfig, wcont.modulo_*, wcont.patch*, wcont.processadora_*, wcont.recursos_controle*, wcont.operadora_cartao_de_credito', motivo: 'configuração do próprio programa (modelos de relatório, rotinas, atualizações)' },
  { tabelas: 'wcont.alterdatalock, wcont.logevt, wcont.acesso_lote, wcont.logatualizacaodesaldo, wcont.estabelecimento_cartao_credito_integracao, wcont.ava_guia_*', motivo: 'travas, registros de acesso e de processamento do programa' },
  { tabelas: 'wcont.configlautobaixa', motivo: 'regra do programa para baixa automática de títulos (sem dado da empresa)' },
  { tabelas: 'wlalur.*', motivo: 'só configuração do programa (nenhuma linha de empresa neste backup)' },
  { tabelas: 'wbank.*', motivo: 'só modelos de arquivo dos bancos (nenhuma linha de empresa)' },
  { tabelas: 'wguias.*', motivo: 'guias de impostos e encargos: parte do Fiscal e do DP, não da escrituração contábil' },
  { tabelas: 'wphd.empresa_integracao_contabil', motivo: 'só a ligação interna empresa x módulo contábil (código)' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Conferidor campo a campo: o que estava preenchido no backup e tem destino no Contábil tem de estar lá, igual.

export interface PendenciaCampo {
  grupo: 'cadastro' | 'plano_contas' | 'historicos_padrao' | 'lancamentos' | 'imobilizado' | 'titulos' | 'cartoes';
  item: string;
  rotulo: string;
  origem: string;
  noSistemaAnterior: string;
  noMurade: string;
  tipo: 'faltou' | 'diferente';
}
export interface ResultadoCampos {
  conferidos: { camposCadastro: number; contas: number; historicos: number; lancamentos: number; bens: number; titulos?: number; cartoes?: number };
  pendencias: PendenciaCampo[];
  semCadastroNoRegistro: boolean;
  resumo: string;
}

const mostrar = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
function igual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return txt(a) === txt(b);
}

export interface EntradaConferenciaCampos {
  cdempresa: number;
  /** Blocos guardados do sistema anterior (as linhas originais). */
  blocos: Record<string, Linha[]>;
  mapaContas: Record<string, string>;
  /** Workspace da empresa no Murade hoje. */
  payload: Record<string, any>;
  /** Migração gravada antes desta conferência (o registro não tem o cadastro da empresa). */
  registroAntigo?: boolean;
  /** Títulos e cartões gravados nas tabelas próprias (sem eles, não confere esta parte). */
  titulos?: Titulo[];
  cartoes?: EstabelecimentoCartao[];
}

/** Histórico que o lançamento migrado deve ter (mesma regra da conversão). */
export function historicoEsperado(linha: Linha, outra: Linha | undefined, hist: Map<string, Linha>): string {
  return txt(linha.dshistorico) || (outra ? txt(outra.dshistorico) : '') || txt(hist.get(txt(linha.idhistoricopadrao))?.dshistoricopadrao) || 'Lançamento do sistema anterior';
}

export function conferirCamposMigrados(ent: EntradaConferenciaCampos): ResultadoCampos {
  const p: PendenciaCampo[] = [];
  const b = ent.blocos;
  const empresa = ent.payload?.empresa || {};
  const add = (x: Omit<PendenciaCampo, 'tipo' | 'noMurade'>, atual: unknown) => p.push({ ...x, noMurade: mostrar(atual), tipo: vazio(atual) ? 'faltou' : 'diferente' });

  // Cadastro da empresa
  const empcont = b.empresa_contabil?.[0];
  const pcont = b.plano_cadastro?.[0];
  const contas: any[] = Array.isArray(ent.payload?.contas) ? ent.payload.contas : [];
  const porCodigo = new Map(contas.map((c) => [String(c.codigo), c]));
  const cadastro = cadastroDoBackup({
    empresa: b.cadastro_empresa?.[0], empcont, contador: b.contador?.[0], sociosEmpresa: b.socios_empresa || [], socios: b.socios || [], municipio: b.municipio?.[0], pcont,
    historicoCnae: b.cadastro_historico_cnae || [], historicoNire: b.historico_nire || [],
    mapaContas: ent.mapaContas, tipoConta: (c) => porCodigo.get(c)?.tipo,
  });
  for (const c of cadastro) {
    const atual = empresa[c.campo];
    if (!igual(c.valor, atual)) add({ grupo: 'cadastro', item: 'Empresa', rotulo: c.rotulo, origem: c.origem, noSistemaAnterior: mostrar(c.valor) }, atual);
  }

  // Plano de contas: cada conta do plano da empresa no backup, pelo código que recebeu no Murade.
  let nContas = 0;
  for (const c of b.plano_contas || []) {
    const codigo = ent.mapaContas[String(Number(c.idconta))];
    if (!codigo) continue; // sem classificação no backup (aviso da migração)
    nContas++;
    const m = porCodigo.get(codigo);
    const item = `Conta ${codigo}`;
    if (!m) { p.push({ grupo: 'plano_contas', item, rotulo: 'conta', origem: 'wcont.contas', noSistemaAnterior: `${txt(c.cdclassinterna)} ${txt(c.nmconta)}`, noMurade: '', tipo: 'faltou' }); continue; }
    if (!igual(txt(c.nmconta), m.descricao) && txt(c.nmconta)) add({ grupo: 'plano_contas', item, rotulo: 'descrição', origem: 'wcont.contas.nmconta', noSistemaAnterior: txt(c.nmconta) }, m.descricao);
    const tipo = txt(c.tpconta).toUpperCase() === 'S' ? 'sintetica' : 'analitica';
    if (m.tipo !== tipo) add({ grupo: 'plano_contas', item, rotulo: 'tipo', origem: 'wcont.contas.tpconta', noSistemaAnterior: tipo }, m.tipo);
    if (txt(c.cdchamada) && m.codigoReduzido !== txt(c.cdchamada)) add({ grupo: 'plano_contas', item, rotulo: 'código reduzido', origem: 'wcont.contas.cdchamada', noSistemaAnterior: txt(c.cdchamada) }, m.codigoReduzido);
    const nat = txt(c.idorigem).toUpperCase();
    if ((nat === 'D' || nat === 'C') && m.natureza !== nat) add({ grupo: 'plano_contas', item, rotulo: 'natureza', origem: 'wcont.contas.idorigem', noSistemaAnterior: nat }, m.natureza);
  }

  // Históricos padrão: código (com os zeros) e texto.
  const hist: any[] = Array.isArray(ent.payload?.historicosPadrao) ? ent.payload.historicosPadrao : [];
  const histPorCodigo = new Map(hist.map((h) => [String(h.codigo).toUpperCase(), h]));
  const vistos = new Set<string>();
  let nHist = 0;
  for (const h of b.historicos_padrao || []) {
    const codigo = (txt(h.cdchamada) || txt(h.idhistoricopadrao)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12);
    const texto = txt(h.dshistoricopadrao);
    if (!codigo || !texto) continue;
    nHist++;
    const repetido = vistos.has(codigo.toUpperCase()); vistos.add(codigo.toUpperCase());
    const m = histPorCodigo.get(codigo.toUpperCase());
    const item = `Histórico ${codigo}${repetido ? ' (código repetido no sistema anterior)' : ''}`;
    if (!m) { p.push({ grupo: 'historicos_padrao', item, rotulo: 'histórico padrão', origem: 'wcont.hist', noSistemaAnterior: texto, noMurade: '', tipo: 'faltou' }); continue; }
    if (repetido) { if (m.texto !== texto) p.push({ grupo: 'historicos_padrao', item, rotulo: 'texto', origem: 'wcont.hist.dshistoricopadrao', noSistemaAnterior: texto, noMurade: String(m.texto), tipo: 'diferente' }); continue; }
    if (m.texto !== texto) add({ grupo: 'historicos_padrao', item, rotulo: 'texto', origem: 'wcont.hist.dshistoricopadrao', noSistemaAnterior: texto }, m.texto);
    if (txt(h.stcomplemento).toUpperCase() === 'S' && m.exigeComplemento !== true) add({ grupo: 'historicos_padrao', item, rotulo: 'pede complemento', origem: 'wcont.hist.stcomplemento', noSistemaAnterior: 'sim' }, m.exigeComplemento);
  }

  // Lançamentos: cada partida migrada contra a linha original (data, conta, valor, histórico, documento, lote, encerramento).
  const histPorId = new Map((b.historicos_padrao || []).map((h) => [txt(h.idhistoricopadrao), h]));
  const lotePorId = new Map((b.lotes || []).map((l) => [txt(l.idlote), l]));
  const mv = b.lancamentos_originais || [];
  const linhaPorId = new Map(mv.map((m) => [txt(m.idmovimento), m]));
  const parceira = new Map<string, Linha>();
  const grupos = new Map<string, Linha[]>();
  for (const m of mv) { const k = `${txt(m.idlote)}|${txt(m.idlotelancamento)}|${dataIsoSA(m.dtlancamento)}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(m); }
  for (const g of grupos.values()) if (g.length === 2) { parceira.set(txt(g[0].idmovimento), g[1]); parceira.set(txt(g[1].idmovimento), g[0]); }
  const prefixo = `sa-${ent.cdempresa}-`;
  let nLanc = 0;
  for (const l of Array.isArray(ent.payload?.lancamentos) ? ent.payload.lancamentos : []) {
    if (l?.origem !== 'Sistema anterior' || !String(l.id || '').startsWith(prefixo)) continue;
    const resto = String(l.id).slice(prefixo.length);
    const multipla = !linhaPorId.has(resto) && /-\d+$/.test(resto);
    const linha = linhaPorId.get(multipla ? resto.replace(/-\d+$/, '') : resto);
    if (!linha) continue; // o balancete por conta e mês já aponta lançamento que não corresponde ao arquivo
    nLanc++;
    const item = `Lançamento de ${dataIsoSA(linha.dtlancamento).split('-').reverse().join('/')} (${txt(linha.dsdocumento) || txt(linha.idmovimento).slice(0, 8)})`;
    const outra = multipla ? undefined : parceira.get(txt(linha.idmovimento));
    const dif = (rotulo: string, origem: string, esperado: unknown, atual: unknown) => { if (!igual(esperado, atual)) add({ grupo: 'lancamentos', item, rotulo, origem, noSistemaAnterior: mostrar(esperado) }, atual); };
    dif('data', 'wcont.mv.dtlancamento', dataIsoSA(linha.dtlancamento), l.data);
    dif('conta débito', 'wcont.mv.idconta', ent.mapaContas[String(Number(linha.idconta))], l.contaDebitoCodigo);
    if (!multipla && outra) {
      dif('conta crédito', 'wcont.mv.idconta', ent.mapaContas[String(Number(outra.idconta))], l.contaCreditoCodigo);
      dif('valor (centavos)', 'wcont.mv.vllancamento', centavosAbs(linha.vllancamento), Math.round(Number((Number(l.valor) * 100).toPrecision(15))));
    }
    if (multipla) { const h = txt(linha.dshistorico); if (h && !igual(h, l.historico)) add({ grupo: 'lancamentos', item, rotulo: 'histórico', origem: 'wcont.mv.dshistorico', noSistemaAnterior: h }, l.historico); }
    else dif('histórico', 'wcont.mv.dshistorico', historicoEsperado(linha, outra, histPorId), l.historico);
    const doc = txt(linha.dsdocumento);
    const lote = lotePorId.get(txt(linha.idlote));
    const ref = String(l.documentoRef || '');
    const partesRef = ref.split(' · ');
    if (doc && !partesRef.includes(`Doc ${doc}`)) add({ grupo: 'lancamentos', item, rotulo: 'documento', origem: 'wcont.mv.dsdocumento', noSistemaAnterior: doc }, ref);
    if (lote && (txt(lote.cdchamada) || txt(lote.idlote)) && !partesRef.includes(`Lote ${txt(lote.cdchamada) || txt(lote.idlote)}`)) add({ grupo: 'lancamentos', item, rotulo: 'lote', origem: 'wcont.lt.cdchamada', noSistemaAnterior: txt(lote.cdchamada) }, ref);
    if (lote && txt(lote.dslote) && l.loteDescricao !== txt(lote.dslote)) add({ grupo: 'lancamentos', item, rotulo: 'descrição do lote', origem: 'wcont.lt.dslote', noSistemaAnterior: txt(lote.dslote) }, l.loteDescricao);
    const seq = Number(linha.identificador_sequencial);
    if (Number.isInteger(seq) && seq > 0 && l.numeroSequencial !== seq) add({ grupo: 'lancamentos', item, rotulo: 'número sequencial', origem: 'wcont.mv.identificador_sequencial', noSistemaAnterior: String(seq) }, l.numeroSequencial);
    if (linha.stencerramento === true && l.tipoEspecial !== 'encerramento') add({ grupo: 'lancamentos', item, rotulo: 'encerramento do exercício', origem: 'wcont.mv.stencerramento', noSistemaAnterior: 'sim' }, l.tipoEspecial);
  }

  // Imobilizado: cada bem que passa na validação tem de estar no módulo Imobilizado.
  const bensMurade: any[] = Array.isArray(ent.payload?.bensImobilizado) ? ent.payload.bensImobilizado : [];
  const esperados = bensDoBackup(ent.cdempresa, b.imobilizado_bens || [], ent.mapaContas).bens;
  for (const e of esperados) {
    const m = bensMurade.find((x) => x.id === e.id) || bensMurade.find((x) => txt(x.descricao) === e.descricao);
    const item = `Bem ${e.descricao}`;
    if (!m) { p.push({ grupo: 'imobilizado', item, rotulo: 'bem', origem: 'wativo.be', noSistemaAnterior: `${e.descricao} — custo ${(e.custoCentavos / 100).toFixed(2)}`, noMurade: '', tipo: 'faltou' }); continue; }
    for (const [k, rot] of [['custoCentavos', 'custo (centavos)'], ['vidaUtilMeses', 'vida útil (meses)'], ['inicioDepreciacao', 'início da depreciação'], ['depreciavel', 'depreciável'],
      ['codigo', 'código do bem'], ['fornecedor', 'fornecedor'], ['notaFiscal', 'nota fiscal'], ['numeroSerie', 'número de série'], ['dataCompra', 'data da compra'], ['contaBemCodigo', 'conta do bem'], ['contaDepreciacaoCodigo', 'conta da depreciação']] as const) {
      if ((e as any)[k] === undefined) continue;
      if (mostrar((e as any)[k]) !== mostrar(m[k])) add({ grupo: 'imobilizado', item, rotulo: rot, origem: 'wativo.be', noSistemaAnterior: mostrar((e as any)[k]) }, m[k]);
    }
  }

  // Títulos a pagar/receber e cartões (antiga DIRF): cada campo que veio do backup tem de estar na tabela própria.
  let nTit = 0; let nCart = 0;
  if (ent.titulos) {
    const guardados = new Map(ent.titulos.map((t) => [t.id, t]));
    for (const e of titulosDoBackup(ent.cdempresa, b, ent.mapaContas)) {
      nTit++;
      const m: any = guardados.get(e.id);
      const item = `Título ${e.numero}${e.serie ? `/${e.serie}` : ''} (${e.participanteNome})`;
      if (!m) { p.push({ grupo: 'titulos', item, rotulo: 'título', origem: 'wcont.titulos', noSistemaAnterior: `${e.numero} — ${(e.valorCentavos / 100).toFixed(2)}`, noMurade: '', tipo: 'faltou' }); continue; }
      for (const k of ['tipo', 'numero', 'serie', 'modelo', 'participanteDocumento', 'participanteNome', 'dataEmissao', 'valorCentavos', 'contaTitulo', 'contaContrapartida', 'situacaoOrigem'] as const) {
        if ((e as any)[k] !== undefined && mostrar((e as any)[k]) !== mostrar(m[k])) add({ grupo: 'titulos', item, rotulo: k, origem: 'wcont.titulos', noSistemaAnterior: mostrar((e as any)[k]) }, m[k]);
      }
      for (const bx of e.baixas) {
        const mb = (m.baixas || []).find((x: any) => x.id === bx.id);
        if (!mb) { p.push({ grupo: 'titulos', item, rotulo: 'baixa', origem: 'wcont.baixa_titulos', noSistemaAnterior: `${bx.data} ${(bx.valorCentavos / 100).toFixed(2)}`, noMurade: '', tipo: 'faltou' }); continue; }
        for (const k of ['data', 'valorCentavos', 'documento', 'historico', 'contaDisponibilidade', 'tipo', 'situacao'] as const) if ((bx as any)[k] !== undefined && mostrar((bx as any)[k]) !== mostrar(mb[k])) add({ grupo: 'titulos', item, rotulo: `baixa › ${k}`, origem: 'wcont.baixa_titulos', noSistemaAnterior: mostrar((bx as any)[k]) }, mb[k]);
      }
      if (e.provisoes.length && (m.provisoes || []).length < e.provisoes.length) add({ grupo: 'titulos', item, rotulo: 'provisão', origem: 'wcont.titulos_provisao', noSistemaAnterior: String(e.provisoes.length) }, (m.provisoes || []).length || '');
    }
  }
  if (ent.cartoes) {
    const guardados = new Map(ent.cartoes.map((c) => [c.id, c]));
    for (const e of cartoesDoBackup(ent.cdempresa, b)) {
      nCart++;
      const m: any = guardados.get(e.id);
      const item = `Cartão ${e.operadora} ${e.codigoEstabelecimento}`;
      if (!m) { p.push({ grupo: 'cartoes', item, rotulo: 'estabelecimento', origem: 'wcont.estabelecimento_cartao_credito', noSistemaAnterior: e.codigoEstabelecimento, noMurade: '', tipo: 'faltou' }); continue; }
      for (const k of ['operadora', 'codigoEstabelecimento', 'banco', 'agencia', 'conta', 'inativo', 'dataInatividade'] as const) if ((e as any)[k] !== undefined && mostrar((e as any)[k]) !== mostrar(m[k])) add({ grupo: 'cartoes', item, rotulo: k, origem: 'wcont.estabelecimento_cartao_credito', noSistemaAnterior: mostrar((e as any)[k]) }, m[k]);
      if (JSON.stringify(e.movimentos) !== JSON.stringify(m.movimentos || [])) add({ grupo: 'cartoes', item, rotulo: 'informações mensais', origem: 'wcont.movimento_cartao_credito', noSistemaAnterior: `${e.movimentos.length} mês(es)` }, `${(m.movimentos || []).length} mês(es)${(m.movimentos || []).length === e.movimentos.length ? ' com valor diferente' : ''}`);
    }
  }

  const semCadastro = Boolean(ent.registroAntigo) && !b.cadastro_empresa?.length;
  const faltou = p.filter((x) => x.tipo === 'faltou').length; const dif = p.length - faltou;
  const conferidos = { camposCadastro: cadastro.length, contas: nContas, historicos: nHist, lancamentos: nLanc, bens: esperados.length, titulos: nTit, cartoes: nCart };
  const base = `${cadastro.length} campo(s) do cadastro, ${nContas} conta(s), ${nHist} histórico(s) padrão, ${nLanc} lançamento(s)${esperados.length ? `, ${esperados.length} bem(ns)` : ''}${nTit ? `, ${nTit} título(s)` : ''}${nCart ? `, ${nCart} estabelecimento(s) de cartão` : ''}`;
  const resumo = p.length
    ? `Campo a campo: ${p.length} pendência(s) — ${faltou} campo(s) preenchido(s) no sistema anterior que estão vazios no Murade e ${dif} diferente(s). Conferidos ${base}.${ent.registroAntigo ? ' Esta empresa foi migrada antes da conferência campo a campo: migre de novo pela tela Migração para completar (só preenche o que está vazio; o que a equipe fez fica).' : ''}`
    : `Campo a campo: tudo igual ao sistema anterior (${base}).${semCadastro ? ' O cadastro da empresa não estava no registro desta migração: migre de novo para conferir também o cadastro.' : ''}`;
  return { conferidos, pendencias: p, semCadastroNoRegistro: semCadastro, resumo };
}
