// Conversão da parte contábil de UMA empresa do backup do sistema anterior para as estruturas do Murade Contábil.
// Função pura (não grava nada): recebe as tabelas já lidas do arquivo e devolve plano de contas, históricos padrão,
// lançamentos, a conferência esperada (saldos do sistema anterior por conta e mês) e todos os blocos originais.
//
// Como o sistema anterior grava (conferido no banco restaurado):
//  - lançamentos (wcont.mvNNNNN): uma linha por lado. Valor NEGATIVO = débito na conta, POSITIVO = crédito.
//    Cada partida simples tem 2 linhas com o mesmo lote + sequência + data. Lotes de abertura têm várias linhas
//    soltas (sem contrapartida) que somam zero no lote.
//  - saldos (wcont.sdNNNNN): por conta e data; total_movimento_debito (negativo) e total_movimento_credito do dia/mês
//    e acumulados vldebito/vlcredito. Os totais do mês batem com os lançamentos.
//  - plano (wcont.contas): classificação "1-1-01-01-01", tpconta A/S, idorigem D/C (ou I: segue a conta-mãe).
import type { ContaPlano, EmpresaDados, HistoricoPadrao, LancamentoContabil } from '../../types';
import { COLUNAS_NUNCA_GUARDAR, tabelaDaEmpresa } from '../../utils/tabelasSistemaAnteriorContabil';
import type { BemImobilizado } from '../../utils/imobilizado';
import { bensDoBackup, cadastroDoBackup, cartoesDoBackup, historicoEsperado, modelosDoBackup, titulosDoBackup } from './camposSistemaAnterior';
import type { EstabelecimentoCartao, Titulo } from '../titulosCartoesStore';
import type { RegraIntegracaoLinha } from '../regrasIntegracaoFiscalStore';
import { regrasIntegracaoDoBackup } from './integracaoFiscal';

export type Linha = Record<string, any>;
/** Lê uma tabela do arquivo (null = a tabela não está no arquivo). Com `manter`, só ficam as linhas aceitas (o leitor pode ignorar o filtro). */
export type LerTabela = (nome: string, manter?: (linha: Linha) => boolean) => Promise<Linha[] | null>;

/** Acima disto (linhas de lançamento da empresa no arquivo) os lançamentos são lidos e convertidos ano a ano, sem ficar todos na memória. */
export const LINHAS_PARA_LER_EM_PARTES = 60000;

/** Empresa grande: os lançamentos não vêm em `lancamentos`; cada ano é lido e convertido quando quem grava (ou confere) pede. */
export interface PartesLancamentos {
  /** Linhas do arquivo por ano da data do lançamento ('' = sem data), em ordem. */
  linhasPorAno: Map<string, number>;
  converterAno(ano: string): Promise<{ lancamentos: LancamentoContabil[]; naoEntraram: NaoEntrou[]; originais: Linha[] }>;
}

export const ORIGEM_SISTEMA_ANTERIOR = 'Sistema anterior' as const;
export const PREFIXO_ID_MIGRACAO = 'sa-';

export interface ContaConvertida extends ContaPlano { idContaOrigem: number; codigoReduzidoOrigem: string; classificacaoOrigem: string }
export interface NaoEntrou { idmovimento: string; data: string; idconta: number | null; valorCentavos: number; motivo: string }
export interface EsperadoConferencia { codigo: string; competencia: string; debitoCentavos: number; creditoCentavos: number; /** Mês calculado pelo acumulado (o sistema anterior não gravou o total do mês). */ semTotalDoMes?: boolean }

export interface DadosContabeisEmpresa {
  cdempresa: number;
  cnpj: string;
  razaoSocial: string;
  semCadastroNoBackup: boolean;
  empresa: Partial<EmpresaDados>;
  /** Valor que uma migração anterior (versão antiga da conversão) gravava e que agora vem completo: pode ser trocado
   *  quando o Murade ainda tem exatamente esse valor antigo (ex.: bairro cortado em 15 letras). */
  substituiveis: Partial<Record<keyof EmpresaDados, string>>;
  /** idconta do sistema anterior → código da conta no Murade. */
  mapaContas: Record<string, string>;
  bensImobilizado: BemImobilizado[];
  /** Títulos a pagar/receber e informações de cartões (antiga DIRF), para as tabelas próprias do Contábil. */
  titulos: Titulo[];
  cartoes: EstabelecimentoCartao[];
  /** Modelos de lançamento (botão "Usar modelo" no lançamento manual). */
  modelos: import('../../types').LancamentoPadrao[];
  /** Regras de integração Fiscal → Contábil do sistema anterior (fornecedor/CFOP → conta; grupos de clientes e fornecedores). */
  regrasIntegracao?: RegraIntegracaoLinha[];
  /** Na remigração: o contador escolheu "Desfazer os ajustes e migrar de novo" (estorna os ajustes de migração antes). */
  desfazerAjustesMigracao?: boolean;
  idPlano: number | null;
  nomePlano: string;
  contas: ContaConvertida[];
  historicosPadrao: HistoricoPadrao[];
  lancamentos: LancamentoContabil[];
  naoEntraram: NaoEntrou[];
  /** Totais de débito e crédito por conta (código do Murade) e competência, tirados dos saldos do sistema anterior. */
  esperado: EsperadoConferencia[];
  /** Os mesmos totais tirados direto dos lançamentos originais do arquivo (cada linha lida). */
  esperadoLancamentos: EsperadoConferencia[];
  /** Saldo final por conta (devedor menos credor, em centavos), pelo último saldo acumulado do sistema anterior. */
  saldoFinalEsperado: Record<string, number>;
  semSaldosParaConferir: boolean;
  /** Todos os registros originais da empresa, por bloco, para consulta (nada fica para trás). Empresa grande: os lançamentos
   * originais vão para o registro ano a ano (blocos lancamentos_originais_AAAA), na gravação. */
  blocos: Record<string, Linha[]>;
  /** Empresa grande (lida em partes): `lancamentos` e `naoEntraram` ficam vazios aqui e saem ano a ano daqui. */
  partes?: PartesLancamentos;
  lidos: Record<string, number>;
  avisos: string[];
}

const txt = (v: unknown) => String(v ?? '').trim();
const somenteDigitos = (v: unknown) => txt(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Data do arquivo (Date em UTC ou texto) → AAAA-MM-DD. */
export function dataIso(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Valor do arquivo em centavos (os valores do sistema anterior não têm fração de centavo). */
export function centavos(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const c = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  return n < 0 ? -c : c;
}

/** "1-1-01-01-01" → "1.1.01.01.01". */
export function converterClassificacao(v: unknown): string {
  return txt(v).split('-').map((p) => p.trim()).filter(Boolean).join('.');
}

const paiDe = (codigo: string) => (codigo.includes('.') ? codigo.slice(0, codigo.lastIndexOf('.')) : '');
const normalizarNome = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Cópia de uma linha sem colunas de credencial e com datas em texto. */
/** O mesmo que limparLinha, mas na própria linha (sem cópia): para as tabelas grandes da empresa (lançamentos, saldos, lotes),
 * que antes ficavam duas vezes na memória (a lida e a cópia guardada). Mesmas colunas, na mesma ordem, e as datas em texto ISO. */
function limparLinhaNoLugar(l: Linha): Linha {
  for (const [k, v] of Object.entries(l)) {
    if (COLUNAS_NUNCA_GUARDAR.has(k.toLowerCase()) || k.toLowerCase() === 'imglogotipoempresa') delete l[k];
    else if (v instanceof Date) l[k] = v.toISOString();
  }
  return l;
}
function limparLinha(l: Linha): Linha {
  const saida: Linha = {};
  for (const [k, v] of Object.entries(l)) {
    if (COLUNAS_NUNCA_GUARDAR.has(k.toLowerCase()) || k.toLowerCase() === 'imglogotipoempresa') continue;
    saida[k] = v instanceof Date ? v.toISOString() : v;
  }
  return saida;
}

function proximoCodigoLivre(codigoOriginal: string, usados: Set<string>): string {
  const pai = paiDe(codigoOriginal);
  const ultimo = codigoOriginal.slice(pai ? pai.length + 1 : 0);
  const largura = Math.max(ultimo.length, 2);
  let maior = 0;
  for (const c of usados) {
    if (paiDe(c) !== pai) continue;
    const n = parseInt(c.slice(pai ? pai.length + 1 : 0), 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  for (let n = maior + 1; ; n++) {
    const candidato = `${pai ? `${pai}.` : ''}${String(n).padStart(largura, '0')}`;
    if (!usados.has(candidato)) return candidato;
  }
}

/** Lista de empresas do backup que têm parte contábil (para a pessoa escolher). */
export interface EmpresaDoBackup { cdempresa: number; nome: string; cnpj: string; ativa: boolean | null; semCadastro: boolean; temPlano: boolean; temLancamentos: boolean }

export function listarEmpresasContabeis(empresas: Linha[], empcont: Linha[], tabelasNoArquivo: string[]): EmpresaDoBackup[] {
  const comTabela = new Map<number, Set<string>>();
  for (const nome of tabelasNoArquivo) {
    const m = /^(wcont|wativo)\.(mv|sd|lt|be)(\d{5})$/.exec(nome.toLowerCase());
    if (!m) continue;
    const cd = Number(m[3]);
    if (!comTabela.has(cd)) comTabela.set(cd, new Set());
    comTabela.get(cd)!.add(m[2]);
  }
  const comPlano = new Set(empcont.map((e) => Number(e.idempresa)));
  const cadastro = new Map(empresas.map((e) => [Number(e.cdempresa), e]));
  const codigos = new Set<number>([...comTabela.keys(), ...comPlano]);
  const lista: EmpresaDoBackup[] = [];
  for (const cd of codigos) {
    if (!Number.isInteger(cd) || cd <= 0 || cd >= 99990) continue; // 99997–99999: empresas-modelo do programa
    const e = cadastro.get(cd);
    const tabelas = comTabela.get(cd) || new Set<string>();
    lista.push({
      cdempresa: cd,
      nome: e ? txt(e.nmempresa || e.nmfantasia) : `Empresa código ${cd}`,
      cnpj: e ? somenteDigitos(e.nrcgc) : '',
      ativa: e ? (e.stativa == null ? null : e.stativa === true || ['S', '1', 't', 'T', 'A', 'true'].includes(txt(e.stativa))) : null,
      semCadastro: !e,
      temPlano: comPlano.has(cd),
      temLancamentos: tabelas.has('mv'),
    });
  }
  return lista.sort((a, b) => Number(a.semCadastro) - Number(b.semCadastro) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const mesesEntre = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
/**
 * Sentido da marca "empresa ativa" (wphd.empresa.stativa) NESTE backup. No backup real conferido ela vinha AO CONTRÁRIO (o DP achou
 * pela folha e o Fiscal pelas notas: empresas com movimento em 2026 marcadas "não"; paradas há anos marcadas "sim"). Aqui a prova é o
 * movimento contábil: teve lançamento nos 12 meses antes do lançamento mais recente do backup = ativa. Se na maioria das empresas com
 * marca e movimento a marca diz o contrário, ela é lida ao contrário em TODAS (a escrituração contábil costuma atrasar, então o
 * movimento só decide o sentido, não a empresa). Empate ou sem prova: lida como está.
 */
export function sentidoDaMarcaAtiva(lista: Array<{ marca: boolean | null; ultimoMes: string }>): 'direto' | 'invertido' {
  const meses = lista.map((e) => e.ultimoMes).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
  const referencia = meses[meses.length - 1];
  if (!referencia) return 'direto';
  let iguais = 0; let contrarias = 0;
  for (const e of lista) {
    if (e.marca == null || !/^\d{4}-\d{2}$/.test(e.ultimoMes)) continue;
    if (e.marca === mesesEntre(e.ultimoMes, referencia) <= 12) iguais++; else contrarias++;
  }
  return contrarias > iguais ? 'invertido' : 'direto';
}
/** Lista com a marca já no sentido certo (o que aparece como "ativa/inativa" na tela). */
export function aplicarSentidoAtiva(lista: EmpresaDoBackup[], sentido: 'direto' | 'invertido'): EmpresaDoBackup[] {
  return lista.map((e) => ({ ...e, ativa: e.ativa == null ? null : sentido === 'invertido' ? !e.ativa : e.ativa }));
}
/** Último mês com lançamento de cada empresa (tabelas de lançamentos wcont.mv#####). */
export async function ultimoMesComLancamento(ler: LerTabela, cds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (const cd of cds) {
    let ult = '';
    // Passada leve (nenhuma linha fica na memória); o leitor que não filtra devolve as linhas e elas são vistas aqui.
    const ver = (m: Linha) => { const d = dataIso(m.dtlancamento).slice(0, 7); if (d > ult) ult = d; return false; };
    for (const m of (await ler(tabelaDaEmpresa('wcont', 'mv', cd), ver)) || []) ver(m);
    if (ult) out.set(cd, ult);
  }
  return out;
}

/** Monta tudo de uma empresa. `cnpjInformado` vale para empresa sem cadastro no backup (a pessoa digita o CNPJ). */
export async function montarDadosEmpresa(ler: LerTabela, cdempresa: number, opcoes: { cnpjInformado?: string; sentidoMarcaAtiva?: 'direto' | 'invertido' } = {}): Promise<DadosContabeisEmpresa> {
  const avisos: string[] = [];
  const lidos: Record<string, number> = {};
  const blocos: Record<string, Linha[]> = {};
  const guardar = (bloco: string, linhas: Linha[]) => { if (linhas.length) blocos[bloco] = [...(blocos[bloco] || []), ...linhas.map(limparLinha)]; };
  /** Tabelas grandes da empresa: guardadas sem cópia (a linha lida já vira a guardada). Depois disto só se usam colunas que não mudam
   * (códigos, valores, textos) e a data do lançamento pelo dataIso, que dá o mesmo dia com a data ou com o texto ISO. */
  const guardarSemCopia = (bloco: string, linhas: Linha[]) => {
    if (!linhas.length) return;
    if (blocos[bloco]) { guardar(bloco, linhas); return; }
    for (const l of linhas) limparLinhaNoLugar(l);
    blocos[bloco] = linhas;
  };
  const tabela = async (nome: string) => (await ler(nome)) || [];

  const empresas = await tabela('wphd.empresa');
  const cadastro = empresas.find((e) => Number(e.cdempresa) === cdempresa);
  const cnpj = somenteDigitos(cadastro?.nrcgc) || somenteDigitos(opcoes.cnpjInformado);
  const empcont = (await tabela('wcont.empcont')).find((e) => Number(e.idempresa) === cdempresa);
  const nomeMv = tabelaDaEmpresa('wcont', 'mv', cdempresa);
  // Passada leve pelos lançamentos: quantas linhas, de que anos e quais contas (nenhuma linha fica na memória). Empresa grande
  // (acima de LINHAS_PARA_LER_EM_PARTES) é convertida ano a ano; as demais, como sempre (a tabela inteira de uma vez).
  let linhasMv = 0;
  const linhasPorAno = new Map<string, number>();
  const usoPorIdConta = new Map<number, number>();
  const leve = (m: Linha) => {
    linhasMv++;
    const ano = dataIso(m.dtlancamento).slice(0, 4);
    linhasPorAno.set(ano, (linhasPorAno.get(ano) || 0) + 1);
    const id = Number(m.idconta); usoPorIdConta.set(id, (usoPorIdConta.get(id) || 0) + 1);
    return false;
  };
  const primeira = await ler(nomeMv, leve);
  const emPartes = linhasMv > LINHAS_PARA_LER_EM_PARTES && Array.isArray(primeira) && primeira.length === 0;
  // Leitor que não filtra já devolveu a tabela inteira; o que filtra lê de novo (empresa pequena) ou fica só com a contagem (grande).
  const mv: Linha[] = emPartes ? [] : (Array.isArray(primeira) && primeira.length ? primeira : (linhasMv ? (await tabela(nomeMv)) : []));
  if (!emPartes) { usoPorIdConta.clear(); for (const m of mv) { const id = Number(m.idconta); usoPorIdConta.set(id, (usoPorIdConta.get(id) || 0) + 1); } }
  const sd = await tabela(tabelaDaEmpresa('wcont', 'sd', cdempresa));
  const lt = await tabela(tabelaDaEmpresa('wcont', 'lt', cdempresa));
  lidos.lancamentosOrigem = emPartes ? linhasMv : mv.length; lidos.saldos = sd.length; lidos.lotes = lt.length;

  const todasContas = await tabela('wcont.contas');
  const contaPorId = new Map(todasContas.map((c) => [Number(c.idconta), c]));
  // Plano da empresa: o do cadastro contábil; sem ele, o mais usado nos lançamentos.
  let idPlano: number | null = empcont?.idplanodecontas != null ? Number(empcont.idplanodecontas) : null;
  if (idPlano == null) {
    const uso = new Map<number, number>();
    for (const [idc, n] of usoPorIdConta) { const c = contaPorId.get(idc); if (c) uso.set(Number(c.idplanodecontas), (uso.get(Number(c.idplanodecontas)) || 0) + n); }
    idPlano = [...uso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  const pcont = (await tabela('wcont.pcont')).find((p) => Number(p.idplanodecontas) === idPlano);
  if (empcont) guardar('empresa_contabil', [empcont]);
  if (pcont) guardar('plano_cadastro', [pcont]);

  // ---- plano de contas -------------------------------------------------------------------------------------------
  const doPlano = idPlano == null ? [] : todasContas.filter((c) => Number(c.idplanodecontas) === idPlano).sort((a, b) => Number(a.idconta) - Number(b.idconta));
  const idsUsados = new Set<number>([...usoPorIdConta.keys(), ...sd.map((s) => Number(s.idconta))]);
  const estrangeiras = [...idsUsados].map((id) => contaPorId.get(id)).filter((c): c is Linha => Boolean(c) && Number(c!.idplanodecontas) !== idPlano);
  // Contas-mãe (por classificação, no plano de origem) das contas de outro plano que a empresa usou.
  const maesEstrangeiras: Linha[] = [];
  for (const c of estrangeiras) {
    let cod = converterClassificacao(c.cdclassinterna);
    while ((cod = paiDe(cod))) {
      const mae = todasContas.find((x) => Number(x.idplanodecontas) === Number(c.idplanodecontas) && converterClassificacao(x.cdclassinterna) === cod);
      if (mae && !maesEstrangeiras.includes(mae)) maesEstrangeiras.push(mae);
    }
  }
  const contas: ContaConvertida[] = [];
  const codigoPorId = new Map<number, string>();
  const porCodigo = new Map<string, ContaConvertida>();
  const codigosOcupados = new Set<string>();
  const naturezaPorCodigo = new Map<string, 'D' | 'C'>();
  const adicionar = (c: Linha, origemEstrangeira: boolean) => {
    const original = converterClassificacao(c.cdclassinterna);
    if (!original) { avisos.push(`Conta ${txt(c.cdchamada) || c.idconta} sem classificação no sistema anterior: guardada só no registro do sistema anterior.`); return; }
    const descricao = txt(c.nmconta) || `Conta ${txt(c.cdchamada) || c.idconta}`;
    const tipo: ContaPlano['tipo'] = txt(c.tpconta).toUpperCase() === 'S' ? 'sintetica' : 'analitica';
    const existente = porCodigo.get(original);
    if (existente && origemEstrangeira && normalizarNome(existente.descricao) === normalizarNome(descricao) && existente.tipo === tipo) {
      codigoPorId.set(Number(c.idconta), original); // mesma conta, gravada em outro plano que a empresa usou antes
      return;
    }
    let codigo = original;
    if (existente || codigosOcupados.has(codigo)) {
      codigo = proximoCodigoLivre(original, codigosOcupados);
      avisos.push(`A conta "${descricao}" (código ${original} no sistema anterior) recebeu o código ${codigo}, porque o código ${original} já era de outra conta${origemEstrangeira ? ' (ela veio de outro plano de contas que a empresa usou antes)' : ' (código repetido no sistema anterior)'}.`);
    }
    const origemNat = txt(c.idorigem).toUpperCase();
    let natureza: 'D' | 'C' | undefined = origemNat === 'D' || origemNat === 'C' ? origemNat : undefined;
    for (let p = paiDe(codigo); !natureza && p; p = paiDe(p)) natureza = naturezaPorCodigo.get(p);
    if (!natureza) natureza = /^1(\.|$)/.test(codigo) || /^[45](\.|$)/.test(codigo) ? 'D' : 'C';
    const partes = codigo.split('.').length;
    if (partes > 5) avisos.push(`A conta ${codigo} tem mais de 5 níveis; ficou como nível 5.`);
    const conta: ContaConvertida = {
      codigo, descricao, tipo, natureza,
      nivel: Math.min(5, Math.max(1, partes)) as ContaPlano['nivel'],
      idContaOrigem: Number(c.idconta), codigoReduzidoOrigem: txt(c.cdchamada), classificacaoOrigem: txt(c.cdclassinterna),
    };
    if (txt(c.cdchamada)) conta.codigoReduzido = txt(c.cdchamada).slice(0, 40);
    contas.push(conta); porCodigo.set(codigo, conta); codigosOcupados.add(codigo); naturezaPorCodigo.set(codigo, natureza);
    codigoPorId.set(Number(c.idconta), codigo);
  };
  for (const c of doPlano) adicionar(c, false);
  for (const c of [...maesEstrangeiras, ...estrangeiras].sort((a, b) => converterClassificacao(a.cdclassinterna).length - converterClassificacao(b.cdclassinterna).length)) {
    if (!codigoPorId.has(Number(c.idconta))) adicionar(c, true);
  }
  guardar('plano_contas', [...doPlano, ...maesEstrangeiras.filter((c) => !doPlano.includes(c)), ...estrangeiras.filter((c) => !maesEstrangeiras.includes(c))]);
  lidos.contas = doPlano.length + [...new Set([...maesEstrangeiras, ...estrangeiras])].length;

  // ---- históricos padrão (cadastro único do sistema anterior, vale para todas as empresas) --------------------------
  const hist = await tabela('wcont.hist');
  lidos.historicosPadrao = hist.length;
  const histPorId = new Map(hist.map((h) => [txt(h.idhistoricopadrao), h]));
  const historicosPadrao: HistoricoPadrao[] = [];
  const codigosHist = new Set<string>();
  for (const h of hist) {
    const texto = txt(h.dshistoricopadrao);
    let codigo = (txt(h.cdchamada) || txt(h.idhistoricopadrao)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12);
    if (!texto || !codigo) { avisos.push(`Histórico padrão ${txt(h.cdchamada) || txt(h.idhistoricopadrao)} sem texto ou sem código: guardado só no registro do sistema anterior.`); continue; }
    if (codigosHist.has(codigo.toUpperCase())) { avisos.push(`Histórico padrão com código repetido (${codigo}) no sistema anterior: o segundo ficou só no registro do sistema anterior.`); continue; }
    codigosHist.add(codigo.toUpperCase());
    if (texto.length > 240) avisos.push(`O histórico padrão ${codigo} tem ${texto.length} letras; no Murad ficaram as 240 primeiras (o texto inteiro está no registro do sistema anterior).`);
    const hp: HistoricoPadrao = { id: `${PREFIXO_ID_MIGRACAO}hist-${txt(h.idhistoricopadrao).slice(0, 40)}`, codigo, texto: texto.slice(0, 240) };
    if (txt(h.stcomplemento).toUpperCase() === 'S') hp.exigeComplemento = true;
    historicosPadrao.push(hp);
  }
  guardar('historicos_padrao', hist);

  // ---- lançamentos ---------------------------------------------------------------------------------------------------
  const lotePorId = new Map(lt.map((l) => [txt(l.idlote), l]));
  guardarSemCopia('lotes', lt);
  type Perna = { linha: Linha; data: string; codigo: string; centavos: number };
  const nomeConta = (codigo: string) => porCodigo.get(codigo)!.descricao;
  const historicoDe = (p: Perna, outra?: Perna) => historicoEsperado(p.linha, outra?.linha, histPorId);
  const referencia = (p: Perna) => {
    const lote = lotePorId.get(txt(p.linha.idlote));
    const doc = txt(p.linha.dsdocumento);
    return [lote ? `Lote ${txt(lote.cdchamada) || txt(lote.idlote)}` : '', doc ? `Doc ${doc}` : ''].filter(Boolean).join(' · ') || undefined;
  };
  /** Linhas do arquivo → partidas do Murade (as do mesmo lote, sequência e data viram uma partida; as soltas, várias partidas). Os grupos
   * são sempre da mesma data, então converter um ano de cada vez dá exatamente as mesmas partidas. */
  const converterMovimentos = (linhasMov: Linha[]): { lancamentos: LancamentoContabil[]; naoEntraram: NaoEntrou[] } => {
    const naoEntraram: NaoEntrou[] = [];
    const pernas: Perna[] = [];
    for (const m of linhasMov) {
      const data = dataIso(m.dtlancamento);
      const c = centavos(m.vllancamento);
      const codigo = codigoPorId.get(Number(m.idconta));
      const conta = codigo ? porCodigo.get(codigo) : undefined;
      const registro = { idmovimento: txt(m.idmovimento), data, idconta: m.idconta == null ? null : Number(m.idconta), valorCentavos: c };
      if (!data) { naoEntraram.push({ ...registro, motivo: 'sem data' }); continue; }
      if (!c) { naoEntraram.push({ ...registro, motivo: 'valor zero' }); continue; }
      if (!conta) { naoEntraram.push({ ...registro, motivo: 'a conta não existe em nenhum plano de contas do backup' }); continue; }
      if (conta.tipo !== 'analitica') { naoEntraram.push({ ...registro, motivo: `a conta ${conta.codigo} é sintética` }); continue; }
      pernas.push({ linha: m, data, codigo: conta.codigo, centavos: c });
    }
    const lancamentos: LancamentoContabil[] = [];
    const criar = (id: string, deb: Perna, cred: Perna, valor: number, loteId?: string) => {
      const l: LancamentoContabil = {
        id, data: deb.data, competencia: deb.data.slice(0, 7),
        contaDebitoCodigo: deb.codigo, contaDebitoNome: nomeConta(deb.codigo),
        contaCreditoCodigo: cred.codigo, contaCreditoNome: nomeConta(cred.codigo),
        valor: valor / 100, historico: historicoDe(deb, cred), origem: ORIGEM_SISTEMA_ANTERIOR as LancamentoContabil['origem'],
      };
      const ref = referencia(deb) || referencia(cred);
      if (ref) l.documentoRef = ref;
      if (loteId) l.loteId = loteId;
      if (deb.linha.stencerramento === true || cred.linha.stencerramento === true) l.tipoEspecial = 'encerramento';
      const lote = lotePorId.get(txt(deb.linha.idlote));
      if (lote && txt(lote.dslote)) l.loteDescricao = txt(lote.dslote).slice(0, 200);
      const seq = Number(deb.linha.identificador_sequencial);
      if (Number.isInteger(seq) && seq > 0) l.numeroSequencial = seq;
      lancamentos.push(l);
    };
    const grupos = new Map<string, Perna[]>();
    for (const p of pernas) {
      const k = `${txt(p.linha.idlote)}|${txt(p.linha.idlotelancamento)}|${p.data}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(p);
    }
    const soltas = new Map<string, Perna[]>();
    for (const g of grupos.values()) {
      const d = g.filter((p) => p.centavos < 0); const c = g.filter((p) => p.centavos > 0);
      if (g.length === 2 && d.length === 1 && c.length === 1 && -d[0].centavos === c[0].centavos && d[0].codigo !== c[0].codigo) {
        criar(`${PREFIXO_ID_MIGRACAO}${cdempresa}-${txt(d[0].linha.idmovimento)}`, d[0], c[0], c[0].centavos);
        continue;
      }
      for (const p of g) { const k = `${txt(p.linha.idlote)}|${p.data}`; if (!soltas.has(k)) soltas.set(k, []); soltas.get(k)!.push(p); }
    }
    // Partidas com várias contas (abertura, por exemplo): débitos x créditos do mesmo lote e data, como lançamento de várias partidas.
    for (const [k, g] of soltas) {
      const deb = g.filter((p) => p.centavos < 0).map((p) => ({ p, resto: -p.centavos }));
      const cre = g.filter((p) => p.centavos > 0).map((p) => ({ p, resto: p.centavos }));
      const loteId = `sa:${cdempresa}:${k}`.slice(0, 160);
      let n = 0;
      for (const d of deb) {
        while (d.resto > 0) {
          const c = cre.find((x) => x.resto > 0 && x.p.codigo !== d.p.codigo);
          if (!c) break;
          const v = Math.min(d.resto, c.resto);
          criar(`${PREFIXO_ID_MIGRACAO}${cdempresa}-${txt(d.p.linha.idmovimento)}-${++n}`, d.p, c.p, v, loteId);
          d.resto -= v; c.resto -= v;
        }
      }
      for (const x of [...deb, ...cre]) {
        if (x.resto <= 0) continue;
        const total = x.p.centavos;
        naoEntraram.push({ idmovimento: txt(x.p.linha.idmovimento), data: x.p.data, idconta: Number(x.p.linha.idconta), valorCentavos: total < 0 ? -x.resto : x.resto,
          motivo: 'no sistema anterior este lote não fecha débito com crédito nesta data (ou só tem a mesma conta dos dois lados)' });
      }
    }
    lancamentos.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
    return { lancamentos, naoEntraram };
  };
  let lancamentos: LancamentoContabil[] = [];
  let naoEntraram: NaoEntrou[] = [];
  let partes: PartesLancamentos | undefined;
  if (!emPartes) {
    guardarSemCopia('lancamentos_originais', mv);
    ({ lancamentos, naoEntraram } = converterMovimentos(mv));
  } else {
    partes = {
      linhasPorAno: new Map([...linhasPorAno].sort((a, b) => a[0].localeCompare(b[0]))),
      async converterAno(ano: string) {
        const linhas = (await ler(nomeMv, (m) => dataIso(m.dtlancamento).slice(0, 4) === ano)) || [];
        const r = converterMovimentos(linhas);
        for (const l of linhas) limparLinhaNoLugar(l);
        return { ...r, originais: linhas };
      },
    };
  }

  // ---- conferência esperada (saldos do sistema anterior) -------------------------------------------------------------
  // Os saldos são ACUMULADOS (vlcredito só cresce, vldebito só fica mais negativo). O movimento do mês de cada conta é a
  // diferença entre o acumulado no fim do mês e o do fim do mês anterior — vale também para saldos antigos, gravados
  // sem a coluna de total do mês.
  const esperadoMapa = new Map<string, EsperadoConferencia>();
  const somar = (mapa: Map<string, EsperadoConferencia>, codigo: string, comp: string, deb: number, cred: number, semTotal = false) => {
    const k = `${codigo}|${comp}`;
    const e = mapa.get(k) || { codigo, competencia: comp, debitoCentavos: 0, creditoCentavos: 0 };
    e.debitoCentavos += deb; e.creditoCentavos += cred;
    if (semTotal) e.semTotalDoMes = true;
    mapa.set(k, e);
  };
  const porConta = new Map<number, Map<string, { cred: number; deb: number; totCred: number; totDeb: number; semTotal: boolean }>>();
  for (const s of sd) {
    const id = Number(s.idconta);
    const comp = dataIso(s.dtsaldo).slice(0, 7);
    if (!codigoPorId.has(id)) { avisos.push(`Há saldo no sistema anterior para uma conta que não existe no plano (código interno ${id}); ficou no registro do sistema anterior.`); continue; }
    if (!comp) continue;
    if (!porConta.has(id)) porConta.set(id, new Map());
    const meses = porConta.get(id)!;
    const atual = meses.get(comp) || { cred: 0, deb: 0, totCred: 0, totDeb: 0, semTotal: false };
    atual.cred = Math.max(atual.cred, centavos(s.vlcredito));
    atual.deb = Math.min(atual.deb, centavos(s.vldebito));
    // Total do mês gravado pelo sistema anterior (quando existe, é o número mais confiável: bate com os lançamentos).
    if (s.total_movimento_credito == null && s.total_movimento_debito == null) atual.semTotal = true;
    else { atual.totCred += centavos(s.total_movimento_credito); atual.totDeb += -centavos(s.total_movimento_debito); }
    meses.set(comp, atual);
  }
  const saldoFinalEsperado: Record<string, number> = {};
  for (const [id, meses] of porConta) {
    const codigo = codigoPorId.get(id)!;
    let anterior = { cred: 0, deb: 0 };
    let final = 0;
    for (const comp of [...meses.keys()].sort()) {
      const m = meses.get(comp)!;
      if (m.semTotal) somar(esperadoMapa, codigo, comp, -(m.deb - anterior.deb), m.cred - anterior.cred, true);
      else somar(esperadoMapa, codigo, comp, m.totDeb, m.totCred);
      final = m.semTotal ? -(m.cred + m.deb) : final + m.totDeb - m.totCred;
      anterior = { cred: m.cred, deb: m.deb };
    }
    saldoFinalEsperado[codigo] = (saldoFinalEsperado[codigo] || 0) + final;
  }
  for (const k of Object.keys(saldoFinalEsperado)) if (!saldoFinalEsperado[k]) delete saldoFinalEsperado[k];
  // Conferência pelos lançamentos originais: cada linha lida do arquivo, por conta e mês.
  const esperadoLancMapa = new Map<string, EsperadoConferencia>();
  const somarLinhaOriginal = (m: Linha) => {
    const codigo = codigoPorId.get(Number(m.idconta)); const comp = dataIso(m.dtlancamento).slice(0, 7); const c = centavos(m.vllancamento);
    if (!codigo || !comp || !c) return false;
    somar(esperadoLancMapa, codigo, comp, c < 0 ? -c : 0, c > 0 ? c : 0);
    return false;
  };
  if (emPartes) await ler(nomeMv, somarLinhaOriginal); // passada leve
  else for (const m of mv) somarLinhaOriginal(m);
  const temTotais = sd.length > 0;
  guardarSemCopia('saldos', sd);
  if (!sd.length && (emPartes ? linhasMv : mv.length)) avisos.push('O sistema anterior não tem a tabela de saldos desta empresa: a conferência compara só os lançamentos lidos com os gravados.');

  // ---- demais blocos com dado real (só consulta) -------------------------------------------------------------------
  const daEmpresa = (linhas: Linha[], col: string) => linhas.filter((l) => Number(l[col]) === cdempresa);
  const abertos = daEmpresa(await tabela('wcont.lancamento'), 'idempresa');
  guardar('lancamentos_lote_aberto', abertos); lidos.lancamentosLoteAberto = abertos.length;
  if (abertos.length) avisos.push(`${abertos.length} lançamento(s) estavam em lote ABERTO no sistema anterior (não efetivados, fora do balancete de lá): ficam no registro do sistema anterior para consulta e não entram no balancete.`);
  const contasIds = new Set(doPlano.map((c) => Number(c.idconta)));
  const lcontas = (await tabela('wcont.lcontas')).filter((l) => Number(l.idplanodecontas) === idPlano);
  const idsLauto = new Set(lcontas.map((l) => txt(l.idlancautomatico)));
  guardar('lancamentos_automaticos', (await tabela('wcont.lauto')).filter((l) => idsLauto.has(txt(l.idlancautomatico))));
  guardar('lancamentos_automaticos_contas', lcontas);
  const titulos = daEmpresa(await tabela('wcont.titulos'), 'idempresa');
  const idsTitulos = new Set(titulos.map((t) => txt(t.idtitulo)));
  guardar('titulos', titulos);
  guardar('titulos_baixas', (await tabela('wcont.baixa_titulos')).filter((b) => idsTitulos.has(txt(b.idtitulo))));
  guardar('titulos_provisao', daEmpresa(await tabela('wcont.titulos_provisao'), 'idempresa'));
  const estab = daEmpresa(await tabela('wcont.estabelecimento_cartao_credito'), 'empresa_id');
  const idsEstab = new Set(estab.map((e) => txt(e.id)));
  guardar('cartao_estabelecimentos', estab);
  guardar('cartao_movimentos', (await tabela('wcont.movimento_cartao_credito')).filter((m) => idsEstab.has(txt(m.estabelecimento_cartao_credito_id))));
  if (estab.length) { const ops = new Set(estab.map((e) => String(e.operadora))); guardar('cartao_operadoras', (await tabela('wcont.operadora_cartao_de_credito')).filter((o) => ops.has(String(o.id)))); }
  guardar('identificador_sequencial', daEmpresa(await tabela('wcont.lancamento_identificador_sequencial'), 'empresa_id'));
  guardar('ecf_linhas_contas', daEmpresa(await tabela('wcont.ecf_linha_conta'), 'empresa_id'));
  guardar('ecf_configuracao_contas', (await tabela('wcont.ecf_conta_configuracao')).filter((c) => contasIds.has(Number(c.conta_id))));
  const demo = (await tabela('wcont.demonstrativo_contabil_configuracao')).filter((d) => Number(d.plano_de_contas_id) === idPlano);
  guardar('demonstracoes_configuracao', demo);
  const modelos = new Set(demo.map((d) => txt(d.demonstrativo_contabil_modelo_id)));
  guardar('demonstracoes_modelos', (await tabela('wcont.demonstrativo_contabil_modelo')).filter((m) => modelos.has(txt(m.id))));
  guardar('demonstracoes_modelos_analise', (await tabela('wcont.demonstrativo_contabil_modelo_analise')).filter((m) => modelos.has(txt(m.demonstrativo_contabil_modelo_id))));
  if (empcont?.contador_id != null) guardar('contador', (await tabela('wcont.contador')).filter((c) => Number(c.id) === Number(empcont.contador_id)));
  guardar('imobilizado_empresa', daEmpresa(await tabela('wativo.emp_ativ'), 'idempresa'));
  guardar('imobilizado_configuracao', daEmpresa(await tabela('wativo.empcfg'), 'idempresa'));
  const bens = await tabela(tabelaDaEmpresa('wativo', 'be', cdempresa));
  guardar('imobilizado_bens', bens); lidos.bensImobilizado = bens.length;

  // ---- cadastro da empresa (wphd) e quem assina (responsável e contador) ------------------------------------------
  if (cadastro) guardar('cadastro_empresa', [cadastro]);
  // Sentido da marca "empresa ativa" decidido para o backup inteiro (a conferência e a remigração leem daqui).
  if (cadastro && opcoes.sentidoMarcaAtiva && cadastro.stativa != null && txt(cadastro.stativa) !== '') {
    guardar('marca_ativa', [{ sentido: opcoes.sentidoMarcaAtiva, motivo: opcoes.sentidoMarcaAtiva === 'invertido' ? 'na maioria das empresas deste backup a marca "ativa" dizia o contrário do movimento contábil' : 'a marca "ativa" bateu com o movimento contábil' }]);
  }
  const sociosEmpresa = daEmpresa(await tabela('wphd.socemp'), 'idempresa');
  const codigosSocios = new Set(sociosEmpresa.map((x) => Number(x.cdsocio)));
  const socios = (await tabela('wphd.socios')).filter((x) => codigosSocios.has(Number(x.cdsocio)));
  guardar('socios_empresa', sociosEmpresa); guardar('socios', socios);
  const municipio = cadastro?.idmunicipio != null ? (await tabela('wphd.municipiosibge')).find((m) => Number(m.idmunicipio) === Number(cadastro.idmunicipio)) : undefined;
  if (municipio) guardar('municipio', [municipio]);
  guardar('cadastro_historico_cnae', daEmpresa(await tabela('wphd.empresahistorico'), 'cdempresa'));
  guardar('historico_nire', daEmpresa(await tabela('wphd.historico_nire'), 'empresa_id'));
  guardar('historico_retencao', daEmpresa(await tabela('wphd.historico_retencao'), 'empresa_id'));
  guardar('trava_contabil', daEmpresa(await tabela('wphd.travacontabil'), 'idempresa'));
  guardar('textos_assinatura', [...(await tabela('wcont.textoassinatura')).map((t) => ({ ...t, modelo: 'livros' })), ...(await tabela('wcont.textoassbalanco')).map((t) => ({ ...t, modelo: 'balanço' }))]);

  const mapaContas: Record<string, string> = {};
  for (const [id, codigo] of codigoPorId) mapaContas[String(id)] = codigo;
  // ---- integração Fiscal → Contábil do sistema anterior (de-para de fornecedor e CFOP para conta) ------------------------
  const integ = regrasIntegracaoDoBackup({
    idPlano, frninteg: await tabela('wfiscal.frninteg'), cadfism: await tabela('wfiscal.cadfism'), cfg: await tabela('wfiscal.cfgcodintegracao'),
    contasDoPlano: doPlano, mapaContas, tipoConta: (codigo) => porCodigo.get(codigo)?.tipo,
  });
  guardar('integracao_fornecedores', integ.blocos.fornecedores); guardar('integracao_codigos_fiscais', integ.blocos.codigosFiscais); guardar('integracao_configuracao', integ.blocos.configuracao);
  lidos.integracaoFornecedores = integ.lidos.fornecedores; lidos.integracaoCodigosFiscais = integ.lidos.codigosFiscais; lidos.integracaoCodigosFiscaisComConta = integ.lidos.codigosFiscaisComConta;
  lidos.integracaoRegras = integ.regras.length;
  avisos.push(...integ.avisos);
  if (integ.regras.length) avisos.push(`${integ.regras.filter((r) => r.conta).length} regra(s) de integração do sistema anterior (fornecedor ou CFOP → conta) vieram para o reconciliador das notas do Fiscal.`);
  const imob = bensDoBackup(cdempresa, bens, mapaContas);
  avisos.push(...imob.avisos);
  if (imob.bens.length) avisos.push(`${imob.bens.length} bem(ns) do imobilizado vieram para o módulo Imobilizado (descrição, custo, vida útil pela taxa do sistema anterior, início da depreciação, fornecedor, nota e contas).`);
  const campos = cadastroDoBackup({
    empresa: cadastro, empcont, contador: blocos.contador?.[0], sociosEmpresa, socios, municipio, pcont, mapaContas,
    historicoCnae: blocos.cadastro_historico_cnae || [], historicoNire: blocos.historico_nire || [],
    tipoConta: (codigo) => porCodigo.get(codigo)?.tipo, sentidoMarcaAtiva: blocos.marca_ativa ? opcoes.sentidoMarcaAtiva : undefined,
  });
  const empresa: Partial<EmpresaDados> = { cnpj };
  for (const c of campos) (empresa as any)[c.campo] = c.valor;
  const titulosMigrados = titulosDoBackup(cdempresa, blocos, mapaContas);
  const mod = modelosDoBackup(blocos, mapaContas, (codigo) => porCodigo.get(codigo)?.tipo, new Date().toISOString().slice(0, 7));
  avisos.push(...mod.avisos);
  if (mod.modelos.length) avisos.push(`${mod.modelos.length} modelo(s) de lançamento vieram para o lançamento manual (botão "Usar modelo").`);
  const cartoes = cartoesDoBackup(cdempresa, blocos);
  if (titulosMigrados.length) avisos.push(`${titulosMigrados.length} título(s) a pagar/receber vieram para Gestão › Títulos (as baixas e provisões que já estavam contabilizadas no sistema anterior não geram lançamento de novo).`);
  if (cartoes.length) avisos.push(`${cartoes.length} estabelecimento(s) de cartão vieram para Gestão › Cartões (antiga DIRF), com ${cartoes.reduce((s2, c) => s2 + c.movimentos.length, 0)} informação(ões) mensal(is).`);
  const substituiveis: DadosContabeisEmpresa['substituiveis'] = {};
  if (cadastro && txt(cadastro.bairro_completo) && txt(cadastro.nmbairro) && txt(cadastro.nmbairro) !== empresa.bairro) substituiveis.bairro = txt(cadastro.nmbairro);
  if (cadastro && txt(cadastro.nmempresa) && txt(cadastro.nmempresa) !== empresa.razaoSocial) substituiveis.razaoSocial = txt(cadastro.nmempresa);

  return {
    cdempresa, cnpj, razaoSocial: empresa.razaoSocial || txt(cadastro?.nmempresa) || (pcont ? txt(pcont.nmplanodecontas) : '') || `Empresa código ${cdempresa}`,
    semCadastroNoBackup: !cadastro, empresa, substituiveis, mapaContas, bensImobilizado: imob.bens, titulos: titulosMigrados, cartoes, modelos: mod.modelos, regrasIntegracao: integ.regras, idPlano, nomePlano: txt(pcont?.nmplanodecontas),
    contas: contas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })),
    historicosPadrao, lancamentos, naoEntraram, esperado: [...esperadoMapa.values()].filter((e) => e.debitoCentavos || e.creditoCentavos),
    esperadoLancamentos: [...esperadoLancMapa.values()],
    saldoFinalEsperado, semSaldosParaConferir: !temTotais, blocos, lidos, avisos, ...(partes ? { partes } : {}),
  };
}
