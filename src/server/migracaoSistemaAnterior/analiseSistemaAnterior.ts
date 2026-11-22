// Análise do que veio ERRADO do sistema anterior (o programa antigo deixa erros). Função pura, só lê.
// Três tipos de achado:
//  - "corrigido": o sistema corrigiu sozinho porque a regra é certa e não pede escolha (espaço/quebra de linha nas
//    pontas do campo, CPF sem o zero da frente, bairro cortado). Mostra "veio X, corrigido para Y, base" e tem
//    "Desfazer" (e "Corrigir agora" para refazer). O estado vem do próprio workspace: não precisa guardar nada.
//  - "conferir": depende de julgamento do contador (ex.: natureza diferente do grupo, saldo credor de caixa, histórico
//    vazio, linha que não pôde entrar). Mostra o que veio, o que diz a regra e a base; o contador aceita a sugestão
//    (quando há uma) ou mantém como veio. Uma por vez.
//  - "ajuste": o balancete do Murade não bate com o arquivo numa conta/mês. Mostra a causa e o lançamento de ajuste
//    pronto; só é lançado depois do "Sim" do contador, com "Desfazer" (estorno). Nunca mexe em valor sozinho.
// Regra sem fonte oficial certa vira "verificar" (sem afirmar o que é o certo).
import type { ResultadoConferencia } from './conferencia';
import { cadastroDoBackup, dataIsoSA, txt, type Linha } from './camposSistemaAnterior';

export const PREFIXO_AJUSTE = 'AJUSTE-MIGRACAO:';

export type TipoAchado = 'corrigido' | 'conferir' | 'verificar' | 'ajuste';
export type SituacaoAchado = 'corrigido' | 'desfeito' | 'alterado' | 'pendente' | 'aceito' | 'mantido' | 'lancado';
export interface Alvo { tipo: 'empresa' | 'conta' | 'historico' | 'lancamentos'; campo: string; codigo?: string; ids?: string[] }
export interface AchadoMigracao {
  id: string;
  tipo: TipoAchado;
  situacao: SituacaoAchado;
  titulo: string;
  veio: string;
  certo: string;
  base: string;
  /** Para corrigir/desfazer/aceitar: onde e quais valores. */
  alvo?: Alvo;
  valorVeio?: unknown;
  valorCerto?: unknown;
  /** Lançamento de ajuste proposto (tipo "ajuste"). */
  ajuste?: { data: string; contaDebito: string; contaCredito: string; valorCentavos: number; historico: string; competencia: string };
}

const BASE_FORMATACAO = 'Formatação: espaço, tabulação ou quebra de linha nas pontas do campo é sobra do campo de tamanho fixo do programa antigo e não faz parte do dado (o texto do meio fica idêntico).';
const BASE_CPF = 'Receita Federal: o CPF tem 11 dígitos, os dois últimos são dígitos verificadores; o programa antigo guardou como número e perdeu o zero da frente.';
const BASE_DV_CPF = 'Receita Federal: os dois últimos dígitos do CPF são verificadores (cálculo módulo 11); este número não confere.';
const BASE_ITG_HISTORICO = 'ITG 2000 (R1) — Escrituração Contábil (CFC): o lançamento tem de ter histórico que descreva o fato.';
const BASE_ECD_ANALITICA = 'Leiaute da ECD (Receita Federal): o lançamento (registro I250) só pode usar conta analítica.';
const BASE_PARTIDA = 'Método das partidas dobradas (ITG 2000 (R1) e Leiaute da ECD, registros I200/I250): em cada lançamento o total a débito é igual ao total a crédito.';
const BASE_CAIXA = 'RIR/2018 (Decreto 9.580/2018), art. 293, I: saldo credor de caixa na escrituração caracteriza omissão de receita (presunção legal).';
const BASE_NATUREZA = 'Lei 6.404/1976, art. 178, e ITG 2000 (R1): contas do Ativo têm saldo devedor e do Passivo/PL saldo credor, exceto as redutoras (ex.: "(-) Depreciação acumulada").';

export function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAno = (comp: string) => `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;
const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ehCaixa = (nome: string) => /^caixa\b/.test(semAcento(nome)) && !/econom|federal|cef\b/.test(semAcento(nome));
const ehRedutora = (nome: string) => /^\s*\(-\)|deprecia|amortiza|exaust|provis|redutor|ajuste|perda|devoluc|desconto|abatimento|\(-\)/.test(semAcento(nome));
const mostrar = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? JSON.stringify(v) : String(v));

export interface EntradaAnalise {
  cdempresa: number;
  blocos: Record<string, Linha[]>;
  mapaContas: Record<string, string>;
  payload: Record<string, any>;
  naoEntraram: Array<{ idmovimento: string; data: string; idconta: number | null; valorCentavos: number; motivo: string }>;
  conferencia: ResultadoConferencia | null;
  /** Decisões do contador já registradas (id → "aceito" | "mantido"). */
  decisoes: Record<string, { decisao: 'aceito' | 'mantido'; por?: string; em?: string }>;
  hoje?: string;
}

export function analisarMigracao(ent: EntradaAnalise): AchadoMigracao[] {
  const out: AchadoMigracao[] = [];
  const b = ent.blocos;
  const empresa = ent.payload?.empresa || {};
  const contas: any[] = Array.isArray(ent.payload?.contas) ? ent.payload.contas : [];
  const porCodigo = new Map(contas.map((c) => [String(c.codigo), c]));
  const lancs: any[] = Array.isArray(ent.payload?.lancamentos) ? ent.payload.lancamentos : [];
  const decidido = (id: string) => ent.decisoes[id]?.decisao;
  const situacaoCorrecao = (atual: unknown, veio: unknown, certo: unknown): SituacaoAchado =>
    JSON.stringify(atual) === JSON.stringify(certo) ? 'corrigido' : JSON.stringify(atual) === JSON.stringify(veio) ? 'desfeito' : 'alterado';

  // ---- 1. correções automáticas (formatação) no cadastro -------------------------------------------------------------
  const linhaDe: Record<string, Linha | undefined> = { 'wphd.empresa': b.cadastro_empresa?.[0], 'wcont.contador': b.contador?.[0], 'wcont.empcont': b.empresa_contabil?.[0] };
  const cadastro = cadastroDoBackup({
    empresa: b.cadastro_empresa?.[0], empcont: b.empresa_contabil?.[0], contador: b.contador?.[0], sociosEmpresa: b.socios_empresa || [], socios: b.socios || [], municipio: b.municipio?.[0],
    pcont: b.plano_cadastro?.[0], mapaContas: ent.mapaContas, historicoCnae: b.cadastro_historico_cnae || [], historicoNire: b.historico_nire || [],
  });
  for (const c of cadastro) {
    const m = /^(w\w+\.\w+)\.(\w+)$/.exec(c.origem);
    if (!m || typeof c.valor !== 'string') continue;
    const bruto = linhaDe[m[1]]?.[m[2]];
    if (bruto === undefined || bruto === null) continue;
    const textoBruto = String(bruto);
    if (c.campo === 'contadorCpf' && /^\d{1,10}$/.test(textoBruto) && c.valor === textoBruto.padStart(11, '0')) {
      out.push({ id: `corr:empresa:${c.campo}`, tipo: 'corrigido', situacao: situacaoCorrecao(empresa[c.campo], textoBruto, c.valor), titulo: `Empresa › ${c.rotulo}`, veio: textoBruto, certo: c.valor, base: BASE_CPF, alvo: { tipo: 'empresa', campo: c.campo }, valorVeio: textoBruto, valorCerto: c.valor });
      continue;
    }
    if (textoBruto !== c.valor && textoBruto.trim() === c.valor) {
      out.push({ id: `corr:empresa:${c.campo}`, tipo: 'corrigido', situacao: situacaoCorrecao(empresa[c.campo], textoBruto, c.valor), titulo: `Empresa › ${c.rotulo}`, veio: mostrar(textoBruto), certo: mostrar(c.valor), base: BASE_FORMATACAO, alvo: { tipo: 'empresa', campo: c.campo }, valorVeio: textoBruto, valorCerto: c.valor });
    }
  }
  const e0 = b.cadastro_empresa?.[0];
  if (e0 && txt(e0.bairro_completo) && txt(e0.nmbairro) && txt(e0.nmbairro) !== txt(e0.bairro_completo)) {
    out.push({ id: 'corr:empresa:bairro-cortado', tipo: 'corrigido', situacao: situacaoCorrecao(empresa.bairro, txt(e0.nmbairro), txt(e0.bairro_completo)), titulo: 'Empresa › bairro',
      veio: `"${txt(e0.nmbairro)}" (campo curto, cortado em ${txt(e0.nmbairro).length} letras)`, certo: `"${txt(e0.bairro_completo)}"`, base: 'O próprio backup tem o bairro completo (bairro_completo); o campo curto do programa antigo corta o nome.',
      alvo: { tipo: 'empresa', campo: 'bairro' }, valorVeio: txt(e0.nmbairro), valorCerto: txt(e0.bairro_completo) });
  }
  // contas e históricos com espaço nas pontas
  for (const c of b.plano_contas || []) {
    const codigo = ent.mapaContas[String(Number(c.idconta))];
    const bruto = c.nmconta == null ? '' : String(c.nmconta);
    if (!codigo || bruto === bruto.trim() || !bruto.trim()) continue;
    const atual = porCodigo.get(codigo)?.descricao;
    out.push({ id: `corr:conta:${codigo}`, tipo: 'corrigido', situacao: situacaoCorrecao(atual, bruto, bruto.trim()), titulo: `Conta ${codigo} › descrição`, veio: mostrar(bruto), certo: mostrar(bruto.trim()), base: BASE_FORMATACAO, alvo: { tipo: 'conta', campo: 'descricao', codigo }, valorVeio: bruto, valorCerto: bruto.trim() });
  }
  const hist: any[] = Array.isArray(ent.payload?.historicosPadrao) ? ent.payload.historicosPadrao : [];
  for (const h of b.historicos_padrao || []) {
    const bruto = h.dshistoricopadrao == null ? '' : String(h.dshistoricopadrao);
    const codigo = (txt(h.cdchamada) || txt(h.idhistoricopadrao)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 12);
    if (!codigo || bruto === bruto.trim() || !bruto.trim() || bruto.trim().length > 240) continue;
    const atual = hist.find((x) => String(x.codigo).toUpperCase() === codigo.toUpperCase())?.texto;
    out.push({ id: `corr:historico:${codigo}`, tipo: 'corrigido', situacao: situacaoCorrecao(atual, bruto, bruto.trim()), titulo: `Histórico padrão ${codigo}`, veio: mostrar(bruto), certo: mostrar(bruto.trim()), base: BASE_FORMATACAO, alvo: { tipo: 'historico', campo: 'texto', codigo }, valorVeio: bruto, valorCerto: bruto.trim() });
  }
  // históricos de lançamento com espaço/quebra de linha nas pontas: um achado só, para todos
  const mv = b.lancamentos_originais || [];
  const linhaPorId = new Map(mv.map((m) => [txt(m.idmovimento), m]));
  const prefixo = `sa-${ent.cdempresa}-`;
  const comSobra: Array<{ id: string; bruto: string; certo: string; atual: string }> = [];
  for (const l of lancs) {
    if (!String(l?.id || '').startsWith(prefixo) || l.origem !== 'Sistema anterior') continue;
    const resto = String(l.id).slice(prefixo.length);
    const linha = linhaPorId.get(resto) || linhaPorId.get(resto.replace(/-\d+$/, ''));
    const bruto = linha?.dshistorico == null ? '' : String(linha.dshistorico);
    if (!bruto.trim() || bruto === bruto.trim()) continue;
    if (l.historico !== bruto.trim() && l.historico !== bruto) continue; // histórico veio da outra linha da partida
    comSobra.push({ id: String(l.id), bruto, certo: bruto.trim(), atual: String(l.historico) });
  }
  if (comSobra.length) {
    const corrigidos = comSobra.filter((x) => x.atual === x.certo).length; const desfeitos = comSobra.filter((x) => x.atual === x.bruto).length;
    out.push({ id: 'corr:lancamentos:historico-pontas', tipo: 'corrigido', situacao: corrigidos === comSobra.length ? 'corrigido' : desfeitos === comSobra.length ? 'desfeito' : 'alterado',
      titulo: `Histórico de ${comSobra.length} lançamento(s)`, veio: `ex.: ${mostrar(comSobra[0].bruto)}`, certo: `ex.: ${mostrar(comSobra[0].certo)}`, base: BASE_FORMATACAO,
      alvo: { tipo: 'lancamentos', campo: 'historico', ids: comSobra.map((x) => x.id) }, valorVeio: Object.fromEntries(comSobra.map((x) => [x.id, x.bruto])), valorCerto: Object.fromEntries(comSobra.map((x) => [x.id, x.certo])) });
  }

  // ---- 2. para o contador conferir -------------------------------------------------------------------------------------
  const conferir = (a: Omit<AchadoMigracao, 'situacao'>, resolvido?: boolean) => {
    const d = decidido(a.id);
    out.push({ ...a, situacao: resolvido ? 'aceito' : d === 'aceito' ? 'aceito' : d === 'mantido' ? 'mantido' : 'pendente' });
  };
  const cpfs: Array<[string, string, string]> = [['responsavelCpf', 'CPF do responsável', String(empresa.responsavelCpf || '')], ['contadorCpf', 'CPF do contador', String(empresa.contadorCpf || '')]];
  for (const s of (Array.isArray(empresa.qsa) ? empresa.qsa : [])) if (s?.cpf) cpfs.push([`qsa:${s.nome}`, `CPF do sócio ${s.nome}`, String(s.cpf)]);
  for (const [k, rot, v] of cpfs) {
    const dig = v.replace(/\D/g, '');
    if (dig.length === 11 && !cpfValido(dig)) conferir({ id: `dv:${k}`, tipo: 'conferir', titulo: `Empresa › ${rot}`, veio: v, certo: 'confira o número no documento da pessoa (o dígito verificador não bate)', base: BASE_DV_CPF });
  }
  // natureza diferente do grupo (sem ser conta redutora): julgamento do contador; a sugestão é a natureza do grupo.
  for (const c of contas) {
    if (c.tipo !== 'analitica' && c.tipo !== 'sintetica') continue;
    const g = String(c.codigo).split('.')[0];
    const esperada = g === '1' ? 'D' : g === '2' ? 'C' : '';
    if (!esperada || c.natureza === esperada || ehRedutora(String(c.descricao || ''))) continue;
    const id = `natureza:${c.codigo}`;
    const aceita = decidido(id) === 'aceito';
    conferir({ id, tipo: 'conferir', titulo: `Conta ${c.codigo} ${c.descricao} › natureza`, veio: c.natureza === 'D' ? 'devedora' : 'credora', certo: esperada === 'D' ? 'devedora (grupo do Ativo)' : 'credora (grupo do Passivo/PL)', base: BASE_NATUREZA,
      alvo: { tipo: 'conta', campo: 'natureza', codigo: String(c.codigo) }, valorVeio: c.natureza, valorCerto: esperada }, aceita && c.natureza === esperada);
  }
  // histórico vazio no arquivo
  const semHistorico = lancs.filter((l) => String(l?.id || '').startsWith(prefixo) && l.historico === 'Lançamento do sistema anterior');
  if (semHistorico.length) conferir({ id: 'historico-vazio', tipo: 'conferir', titulo: `${semHistorico.length} lançamento(s) sem histórico no arquivo`, veio: 'sem texto (ficou "Lançamento do sistema anterior")', certo: 'histórico que descreva o fato (ex.: "Pagamento NF 123 - fornecedor")', base: BASE_ITG_HISTORICO });
  // linhas que não puderam entrar
  const porMotivo = new Map<string, number>();
  for (const n of ent.naoEntraram || []) porMotivo.set(n.motivo, (porMotivo.get(n.motivo) || 0) + 1);
  for (const [motivo, n] of porMotivo) {
    const base = /sintética/.test(motivo) ? BASE_ECD_ANALITICA : /fecha/.test(motivo) ? BASE_PARTIDA : 'Sem conta no plano de contas do backup, a linha não tem onde ser lançada.';
    conferir({ id: `nao-entrou:${motivo}`, tipo: 'conferir', titulo: `${n} linha(s) de lançamento não entraram`, veio: motivo, certo: 'lançar no Murade com conta analítica e débito = crédito (as linhas estão em Migração › "Lançamentos originais")', base });
  }
  // saldo credor de caixa (fim de mês) e saldo invertido (verificar)
  const saldo = new Map<string, number>(); const porMes = new Map<string, Map<string, number>>();
  const doBalancete = lancs.filter((l) => l && l.statusManual !== 'pendente_aprovacao' && l.statusManual !== 'rejeitado').sort((a, b2) => String(a.data).localeCompare(String(b2.data)));
  for (const l of doBalancete) {
    const v = Math.round(Number((Number(l.valor) * 100).toPrecision(15)));
    const comp = String(l.data).slice(0, 7);
    for (const [cod, s] of [[l.contaDebitoCodigo, v], [l.contaCreditoCodigo, -v]] as Array<[string, number]>) {
      saldo.set(cod, (saldo.get(cod) || 0) + s);
      if (!porMes.has(cod)) porMes.set(cod, new Map());
      porMes.get(cod)!.set(comp, saldo.get(cod)!);
    }
  }
  for (const c of contas) {
    if (c.tipo !== 'analitica' || !ehCaixa(String(c.descricao || ''))) continue;
    const meses = [...(porMes.get(String(c.codigo)) || new Map()).entries()].filter(([, s]) => s < 0);
    if (meses.length) conferir({ id: `caixa-credor:${c.codigo}`, tipo: 'conferir', titulo: `Conta ${c.codigo} ${c.descricao} › saldo credor`, veio: `saldo credor em ${meses.length} mês(es) (ex.: ${mesAno(meses[0][0])}: ${reais(-meses[0][1])} credor)`, certo: 'caixa nunca fica credor: falta lançamento de entrada ou há saída lançada a mais', base: BASE_CAIXA });
  }
  for (const c of contas) {
    if (c.tipo !== 'analitica' || ehCaixa(String(c.descricao || '')) || ehRedutora(String(c.descricao || ''))) continue;
    const g = String(c.codigo).split('.')[0]; const s = saldo.get(String(c.codigo)) || 0;
    if ((g === '1' && s < 0) || (g === '2' && s > 0)) {
      const id = `saldo-invertido:${c.codigo}`;
      out.push({ id, tipo: 'verificar', situacao: decidido(id) === 'mantido' ? 'mantido' : 'pendente', titulo: `Conta ${c.codigo} ${c.descricao} › saldo final`, veio: `${reais(Math.abs(s))} ${s < 0 ? 'credor' : 'devedor'}`, certo: 'verificar: pode ser adiantamento ou lançamento na conta errada', base: 'Sem regra oficial que dê o certo sozinha; é conferência do contador.' });
    }
  }
  // data no futuro ou antes da abertura da empresa (verificar)
  const hoje = ent.hoje || new Date().toISOString().slice(0, 10);
  const abertura = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(empresa.dataAbertura || ''));
  const aberturaIso = abertura ? `${abertura[3]}-${abertura[2]}-${abertura[1]}` : '';
  const foraFuturo = lancs.filter((l) => String(l?.id || '').startsWith(prefixo) && String(l.data) > hoje);
  const foraAntes = aberturaIso ? lancs.filter((l) => String(l?.id || '').startsWith(prefixo) && String(l.data) < aberturaIso && l.tipoEspecial !== 'encerramento') : [];
  if (foraFuturo.length) out.push({ id: 'data-futura', tipo: 'verificar', situacao: decidido('data-futura') === 'mantido' ? 'mantido' : 'pendente', titulo: `${foraFuturo.length} lançamento(s) com data no futuro`, veio: `ex.: ${foraFuturo[0].data.split('-').reverse().join('/')}`, certo: 'verificar a data do fato', base: 'ITG 2000 (R1): o lançamento leva a data da ocorrência do fato.' });
  if (foraAntes.length) out.push({ id: 'data-antes-abertura', tipo: 'verificar', situacao: decidido('data-antes-abertura') === 'mantido' ? 'mantido' : 'pendente', titulo: `${foraAntes.length} lançamento(s) antes da data de abertura (${empresa.dataAbertura})`, veio: `ex.: ${foraAntes[0].data.split('-').reverse().join('/')}`, certo: 'verificar a data do fato ou a data de abertura do cadastro', base: 'ITG 2000 (R1): o lançamento leva a data da ocorrência do fato.' });
  if ((b.lancamentos_lote_aberto || []).length) out.push({ id: 'lote-aberto', tipo: 'verificar', situacao: decidido('lote-aberto') === 'mantido' ? 'mantido' : 'pendente', titulo: `${b.lancamentos_lote_aberto.length} lançamento(s) em lote aberto no sistema anterior`, veio: 'não efetivados lá (fora do balancete)', certo: 'verificar se deviam ter sido lançados', base: 'No programa antigo o lote aberto não entra no balancete; o Murade seguiu o mesmo.' });

  // ---- 3. ajuste proposto quando o balancete não bate -------------------------------------------------------------------
  const contrapartida = contas.find((c) => c.tipo === 'analitica' && /ajustes? de exercicios anteriores/.test(semAcento(String(c.descricao || ''))))?.codigo
    || (empresa.contaContrapartidaAberturaCodigo && porCodigo.get(empresa.contaContrapartidaAberturaCodigo)?.tipo === 'analitica' ? empresa.contaContrapartidaAberturaCodigo : '');
  const lancado = (id: string) => {
    const l = lancs.find((x) => String(x?.documentoRef || '') === `${PREFIXO_AJUSTE}${id}`);
    return Boolean(l && !lancs.some((x) => x?.estornoDe === l.id));
  };
  for (const d of ent.conferencia?.diferencasLancamentosOriginais || []) {
    const net = (d.debitoAnterior - d.debitoMurade) - (d.creditoAnterior - d.creditoMurade);
    if (!net) continue;
    const id = `ajuste:${d.codigo}:${d.competencia}`;
    const conta = porCodigo.get(d.codigo);
    const causas = (ent.naoEntraram || []).filter((n) => n.data.slice(0, 7) === d.competencia && ent.mapaContas[String(n.idconta)] === d.codigo);
    const causa = causas.length ? `${causas.length} linha(s) do arquivo que não entraram (${causas[0].motivo})` : Math.abs(net) <= 2 ? 'diferença de arredondamento de centavos' : 'lançamento do arquivo diferente do que está no Murade';
    const valor = Math.abs(net);
    const cp = contrapartida && contrapartida !== d.codigo ? String(contrapartida) : '';
    const hist = `Ajuste de migração: diferença de ${reais(valor)} na conta ${d.codigo} em ${mesAno(d.competencia)} (${causa})`.slice(0, 240);
    const ajuste = cp ? { data: ultimoDia(d.competencia), contaDebito: net > 0 ? d.codigo : cp, contaCredito: net > 0 ? cp : d.codigo, valorCentavos: valor, historico: hist, competencia: d.competencia } : undefined;
    const feito = lancado(id);
    out.push({ id, tipo: 'ajuste', situacao: feito ? 'lancado' : decidido(id) === 'mantido' ? 'mantido' : 'pendente', titulo: `Conta ${d.codigo}${conta ? ` ${conta.descricao}` : ''} em ${mesAno(d.competencia)}`,
      veio: `no arquivo: débito ${reais(d.debitoAnterior)} / crédito ${reais(d.creditoAnterior)}; no Murade: débito ${reais(d.debitoMurade)} / crédito ${reais(d.creditoMurade)}`,
      certo: ajuste ? `lançar D ${ajuste.contaDebito} / C ${ajuste.contaCredito} ${reais(valor)} — "${hist}"` : 'escolha a conta de contrapartida (crie a conta "Ajustes de exercícios anteriores" no PL ou defina a contrapartida da abertura) para o ajuste ficar pronto',
      base: `Causa: ${causa}. Lei 6.404/1976, art. 186, § 1º: ajustes de exercícios anteriores vão para lucros ou prejuízos acumulados.`, ajuste });
  }
  // Ajustes já lançados (o balancete passou a bater e a diferença sumiu): continuam na lista, com "Desfazer".
  for (const l of lancs) {
    const ref = String(l?.documentoRef || '');
    if (!ref.startsWith(PREFIXO_AJUSTE) || ref.endsWith(':ESTORNO') || lancs.some((x) => x?.estornoDe === l.id)) continue;
    const id = ref.slice(PREFIXO_AJUSTE.length);
    if (out.some((a) => a.id === id)) continue;
    out.push({ id, tipo: 'ajuste', situacao: 'lancado', titulo: `Ajuste lançado em ${String(l.data).split('-').reverse().join('/')}`, veio: 'diferença entre o balancete do Murade e o arquivo',
      certo: `D ${l.contaDebitoCodigo} / C ${l.contaCreditoCodigo} ${reais(Math.round(Number(l.valor) * 100))} — "${l.historico}"`, base: 'Ajuste confirmado pelo contador.',
      ajuste: { data: String(l.data), contaDebito: l.contaDebitoCodigo, contaCredito: l.contaCreditoCodigo, valorCentavos: Math.round(Number(l.valor) * 100), historico: String(l.historico), competencia: String(l.data).slice(0, 7) } });
  }
  void dataIsoSA;
  return out;
}

/** Aplica UMA ação num workspace (cópia). Lança Error com o motivo em português quando não dá. */
export function aplicarAcaoAchado(payload: Record<string, any>, achado: AchadoMigracao, acao: 'corrigir' | 'desfazer' | 'aceitar' | 'lancar_ajuste' | 'desfazer_ajuste', quem: string, agora = new Date()): Record<string, any> {
  const p = JSON.parse(JSON.stringify(payload));
  const valor = acao === 'desfazer' ? achado.valorVeio : achado.valorCerto;
  const a = achado.alvo;
  if (acao === 'corrigir' || acao === 'desfazer' || acao === 'aceitar') {
    if (!a) throw new Error('Este achado não tem correção para aplicar.');
    if (acao === 'aceitar' && achado.tipo === 'corrigido') throw new Error('Use Corrigir ou Desfazer.');
    if (acao !== 'aceitar' && achado.tipo !== 'corrigido') throw new Error('Este achado é para o contador decidir: use Aceitar ou Manter como veio.');
    if (a.tipo === 'empresa') { p.empresa = { ...(p.empresa || {}), [a.campo]: valor }; }
    else if (a.tipo === 'conta') { const c = (p.contas || []).find((x: any) => String(x.codigo) === a.codigo); if (!c) throw new Error(`A conta ${a.codigo} não está mais no plano.`); c[a.campo] = valor; }
    else if (a.tipo === 'historico') { const h = (p.historicosPadrao || []).find((x: any) => String(x.codigo).toUpperCase() === String(a.codigo).toUpperCase()); if (!h) throw new Error(`O histórico ${a.codigo} não está mais cadastrado.`); h[a.campo] = valor; }
    else if (a.tipo === 'lancamentos') { const mapa = (valor || {}) as Record<string, string>; for (const l of p.lancamentos || []) if (mapa[l.id] !== undefined) l[a.campo] = mapa[l.id]; }
    return p;
  }
  if (acao === 'lancar_ajuste') {
    const aj = achado.ajuste;
    if (achado.tipo !== 'ajuste' || !aj) throw new Error('Este ajuste ainda não tem conta de contrapartida.');
    if (achado.situacao === 'lancado') throw new Error('Este ajuste já foi lançado.');
    const nome = (c: string) => (p.contas || []).find((x: any) => x.codigo === c)?.descricao || c;
    p.lancamentos = [...(p.lancamentos || []), {
      id: `AJMIG-${aj.competencia}-${aj.contaDebito}-${aj.contaCredito}-${agora.getTime()}`.slice(0, 64), data: aj.data, competencia: aj.competencia,
      contaDebitoCodigo: aj.contaDebito, contaDebitoNome: nome(aj.contaDebito), contaCreditoCodigo: aj.contaCredito, contaCreditoNome: nome(aj.contaCredito),
      valor: aj.valorCentavos / 100, historico: `${aj.historico} — confirmado por ${quem}`.slice(0, 240), origem: 'Manual', documentoRef: `${PREFIXO_AJUSTE}${achado.id}`, statusManual: 'aprovado',
    }];
    return p;
  }
  // desfazer ajuste = estorno (partida invertida), nunca apaga
  const l = (p.lancamentos || []).find((x: any) => String(x?.documentoRef || '') === `${PREFIXO_AJUSTE}${achado.id}` && !(p.lancamentos || []).some((y: any) => y?.estornoDe === x.id));
  if (!l) throw new Error('Não há ajuste lançado para desfazer.');
  p.lancamentos.push({ ...l, id: `EST-${l.id}`.slice(0, 64), contaDebitoCodigo: l.contaCreditoCodigo, contaDebitoNome: l.contaCreditoNome, contaCreditoCodigo: l.contaDebitoCodigo, contaCreditoNome: l.contaDebitoNome,
    historico: `Estorno: ${l.historico}`.slice(0, 240), estornoDe: l.id, documentoRef: `${PREFIXO_AJUSTE}${achado.id}:ESTORNO` });
  return p;
}

export function resumoAnalise(achados: AchadoMigracao[]): string {
  const n = (f: (a: AchadoMigracao) => boolean) => achados.filter(f).length;
  const corr = n((a) => a.tipo === 'corrigido' && a.situacao === 'corrigido');
  const desf = n((a) => a.tipo === 'corrigido' && a.situacao !== 'corrigido');
  const conf = n((a) => (a.tipo === 'conferir' || a.tipo === 'verificar') && a.situacao === 'pendente');
  const aj = n((a) => a.tipo === 'ajuste' && a.situacao === 'pendente');
  if (!achados.length) return 'Análise do que veio: nenhum erro encontrado pelas regras.';
  return `Análise do que veio: ${corr} correção(ões) automática(s) feita(s)${desf ? `, ${desf} desfeita(s)` : ''}; ${conf} item(ns) para o contador conferir; ${aj} ajuste(s) de balancete esperando o "Sim".`;
}
