// Migração da parte contábil pelo backup do sistema anterior, feita pelo próprio escritório na tela do Contábil.
//
// Fluxo (igual ao do Murade DP): (1) o navegador separa só a parte contábil do backup e envia; (2) o servidor guarda o
// texto num arquivo temporário só daquele usuário e lista as empresas; (3) a pessoa escolhe "Transportar tudo" ou marca
// uma por uma e vê a prévia (nada é gravado); (4) ao confirmar, grava empresa por empresa e apaga o arquivo.
// O arquivo nunca fica guardado depois do uso e nunca é visível para outro usuário.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import type { ContaPlano } from '../../types';
import { FilaMigracao, textoDaFila } from './fila';
import { indexarDump, carregarTabelaDump, type IndiceDump } from './leitorDump';
import { aplicarSentidoAtiva, listarEmpresasContabeis, montarDadosEmpresa, sentidoDaMarcaAtiva, ultimoMesComLancamento, type DadosContabeisEmpresa, type EmpresaDoBackup, type Linha } from './conversor';
import { mesclarMigracao } from './mesclagem';
import { conferirMigracao } from './conferencia';

const PASTA = path.join(os.tmpdir(), 'murade-contabil-migracao-sistema-anterior');
const LIMITE_BYTES = 400 * 1024 * 1024;
const VALIDADE_MS = 2 * 60 * 60 * 1000;
const MAX_SESSOES = 6;
const MAX_EMPRESAS_POR_VEZ = 50;

interface Sessao {
  token: string; userId: string; arquivo: string; tamanho: number; criadoEm: number;
  indice?: IndiceDump; cache: Map<string, Linha[] | null>; empresas?: EmpresaDoBackup[];
  /** Empresas que passaram na prévia: só o que a pessoa escolheu (CNPJ digitado, desfazer ajustes). Os dados são lidos de novo do
   * arquivo na gravação (mesmo arquivo = mesmo resultado): guardar os dados de todas pesava centenas de MB no servidor de 512 MB. */
  previas: Map<number, { cnpjInformado: string; desfazerAjustes: boolean }>; ocupado: boolean;
  /** Sentido da marca "empresa ativa" neste arquivo (decidido na lista pelo movimento contábil). */
  sentidoAtiva?: 'direto' | 'invertido';
}
/** Uma leitura pesada por vez no servidor inteiro (prévia e gravação), na ordem de chegada (servidor compartilhado, 512 MB). */
export const filaMigracaoContabil = new FilaMigracao();
const sessoes = new Map<string, Sessao>();
/** Posição na fila (0 = é a vez; N = há N na frente) e o aviso para a tela. */
export function filaDaMigracaoContabil(token: string): { posicao: number | null; aviso: string } { const p = filaMigracaoContabil.posicao(String(token || '')); return { posicao: p, aviso: textoDaFila(p) }; }

const apagarArquivo = (a: string) => { try { fs.rmSync(a, { force: true }); } catch { /* já não existe */ } };

export function descartarMigracaoContabil(token: string): void {
  const s = sessoes.get(token);
  if (!s) return;
  apagarArquivo(s.arquivo); s.previas.clear(); s.cache.clear(); sessoes.delete(token);
}

export function limparMigracoesContabilVencidas(agora = Date.now()): number {
  let n = 0;
  for (const s of [...sessoes.values()]) if (!s.ocupado && agora - s.criadoEm > VALIDADE_MS) { descartarMigracaoContabil(s.token); n++; }
  return n;
}

/** Ao ligar o servidor apaga o que sobrou (disco temporário, dado de cliente) e limpa os vencidos a cada 10 minutos. */
export function iniciarLimpezaMigracaoContabil(): void {
  try { fs.mkdirSync(PASTA, { recursive: true }); for (const f of fs.readdirSync(PASTA)) apagarArquivo(path.join(PASTA, f)); } catch { /* sem disco gravável: o envio avisa */ }
  setInterval(() => { limparMigracoesContabilVencidas(); }, 10 * 60 * 1000).unref();
}

function obter(token: unknown, userId: string): Sessao {
  const s = sessoes.get(String(token || ''));
  if (!s || s.userId !== userId) throw new Error('Este envio não foi encontrado (pode ter vencido em 2 horas). Escolha o arquivo de novo.');
  // O prazo conta do ÚLTIMO uso (lista, prévia, gravação), não do envio: quem está trabalhando não perde o arquivo no meio.
  s.criadoEm = Date.now();
  return s;
}

async function comOcupado<T>(s: Sessao, fn: () => Promise<T>): Promise<T> {
  if (s.ocupado) throw new Error('Esta migração já está em andamento. Aguarde terminar.');
  s.ocupado = true;
  try { return await fn(); } finally { s.ocupado = false; }
}

function leitor(s: Sessao) {
  return async (nome: string) => {
    const n = nome.toLowerCase();
    // Tabelas comuns ficam na memória durante a sessão; as de cada empresa são lidas de novo (memória baixa).
    const porEmpresa = /\d{5}$/.test(n);
    if (!porEmpresa && s.cache.has(n)) return s.cache.get(n)!;
    const linhas = await carregarTabelaDump(s.indice!, n);
    if (!porEmpresa) s.cache.set(n, linhas);
    return linhas;
  };
}

/** Recebe o texto em fluxo direto para o disco (sem carregar na memória), com limite de tamanho. */
export async function receberArquivoContabil(req: Request, userId: string, compactado: boolean): Promise<{ token: string; tamanho: number }> {
  if (sessoes.size >= MAX_SESSOES) limparMigracoesContabilVencidas();
  if (sessoes.size >= MAX_SESSOES) throw new Error('Há muitas migrações em andamento agora. Tente de novo em alguns minutos.');
  for (const s of sessoes.values()) if (s.userId === userId && !s.ocupado) descartarMigracaoContabil(s.token); // uma por usuário
  fs.mkdirSync(PASTA, { recursive: true });
  const token = crypto.randomBytes(24).toString('hex');
  const arquivo = path.join(PASTA, `${token}.sql`);
  let bytes = 0;
  const limitador = new Transform({ transform(pedaco, _e, cb) { bytes += pedaco.length; if (bytes > LIMITE_BYTES) cb(new Error('LIMITE')); else cb(null, pedaco); } });
  try {
    const etapas: any[] = [req, limitador];
    if (compactado) etapas.push(zlib.createGunzip());
    etapas.push(fs.createWriteStream(arquivo, { mode: 0o600 }));
    await pipeline(etapas as any);
  } catch (erro: any) {
    apagarArquivo(arquivo);
    if (String(erro?.message) === 'LIMITE') throw new Error('O arquivo passou do limite de 400 MB. Escolha o arquivo de backup (.bcir ou .backup) na tela: o navegador separa só a parte contábil, que é bem menor.');
    if (/incorrect header check|unexpected end of file|invalid/i.test(String(erro?.message))) throw new Error('O arquivo chegou incompleto ou danificado. Envie de novo.');
    throw erro;
  }
  const tamanho = fs.statSync(arquivo).size;
  const cabeca = Buffer.alloc(8);
  const fd = fs.openSync(arquivo, 'r'); fs.readSync(fd, cabeca, 0, 8, 0); fs.closeSync(fd);
  if (cabeca.subarray(0, 5).toString('latin1') === 'PGDMP') {
    apagarArquivo(arquivo);
    throw new Error('Este navegador mandou o backup inteiro sem separar a parte contábil. Use o Chrome ou o Edge atualizados e escolha o arquivo de novo.');
  }
  if (tamanho < 100) { apagarArquivo(arquivo); throw new Error('O arquivo está vazio.'); }
  sessoes.set(token, { token, userId, arquivo, tamanho, criadoEm: Date.now(), cache: new Map(), previas: new Map(), ocupado: false });
  return { token, tamanho };
}

export async function listarEmpresasDoBackupContabil(token: string, userId: string): Promise<{ empresas: EmpresaDoBackup[]; tabelasLidas: number }> {
  const s = obter(token, userId);
  return comOcupado(s, async () => {
    s.indice = s.indice || await indexarDump(s.arquivo);
    const ler = leitor(s);
    const empresas = await ler('wphd.empresa');
    if (!empresas) throw new Error('Não encontrei o cadastro de empresas neste arquivo. Confira se é o backup do sistema anterior.');
    const comDados = [...s.indice.tabelas.values()].filter((t) => t.fim > t.inicio).map((t) => t.nome);
    const lista = listarEmpresasContabeis(empresas, (await ler('wcont.empcont')) || [], comDados);
    if (!lista.length) throw new Error('Este backup não tem parte contábil (plano de contas e lançamentos) de nenhuma empresa.');
    s.sentidoAtiva = await sentidoDaMarcaNoArquivo(ler, lista);
    s.empresas = aplicarSentidoAtiva(lista, s.sentidoAtiva);
    return { empresas: s.empresas, tabelasLidas: s.indice.tabelas.size };
  });
}

export interface DependenciasPrevia {
  /** Workspace atual, cadastro compartilhado e competências fechadas do CNPJ (só leitura). */
  lerAtual(cnpj: string): Promise<{ payload: Record<string, any> | null; compartilhado: Record<string, any> | null; fechadas: Set<string> }>;
  /** O CNPJ pertence a outro escritório? */
  deOutroEscritorio(cnpj: string): Promise<boolean>;
  excluidaAntes(cnpj: string): Promise<boolean>;
  cnpjValido(cnpj: string): boolean;
  validarWorkspace(payload: Record<string, unknown>): boolean;
  modelo: ContaPlano[];
  competenciaAtual: string;
}

export interface PreviaEmpresa {
  cdempresa: number; nome: string; cnpj: string; semCadastroNoBackup: boolean; podeGravar: boolean; motivo?: string; excluidaAntes: boolean;
  jaExisteNoMurade: boolean; lidos: Record<string, number>; contas: number; contasNovas: number; contasAtualizadas: number; contasDoModeloRetiradas: number;
  historicos: number; historicosNovos: number; lancamentos: number; lancamentosSubstituidos: number; lancamentosDaEquipe: number; naoEntraram: number;
  blocos: Array<{ bloco: string; quantidade: number }>; periodo: string; conferencia: string; bate: boolean; totalAvisos: number; avisos: string[];
  /** Remigração: ajustes de migração já lançados nesta empresa e se o contador escolheu desfazê-los. */
  ajustesMigracaoLancados?: number; desfazerAjustes?: boolean;
}

const normalizar = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Sentido da marca "empresa ativa" no arquivo (pelo movimento contábil de todas as empresas da lista). */
async function sentidoDaMarcaNoArquivo(ler: (n: string) => Promise<Linha[] | null>, lista: EmpresaDoBackup[]): Promise<'direto' | 'invertido'> {
  const ult = await ultimoMesComLancamento(ler, lista.filter((e) => e.temLancamentos).map((e) => e.cdempresa));
  return sentidoDaMarcaAtiva(lista.map((e) => ({ marca: e.ativa, ultimoMes: ult.get(e.cdempresa) ?? '' })));
}
async function sentidoDaSessao(s: Sessao, ler: (n: string) => Promise<Linha[] | null>): Promise<'direto' | 'invertido'> {
  if (!s.sentidoAtiva) {
    const empresas = (await ler('wphd.empresa')) || [];
    const comDados = [...(s.indice?.tabelas.values() ?? [])].filter((t) => t.fim > t.inicio).map((t) => t.nome);
    s.sentidoAtiva = await sentidoDaMarcaNoArquivo(ler, listarEmpresasContabeis(empresas, (await ler('wcont.empcont')) || [], comDados));
  }
  return s.sentidoAtiva;
}

export async function gerarPreviaContabil(token: string, userId: string, cdempresas: unknown, cnpjsInformados: unknown, dep: DependenciasPrevia, desfazerAjustes: unknown = []): Promise<PreviaEmpresa[]> {
  const comDesfazer = new Set((Array.isArray(desfazerAjustes) ? desfazerAjustes : []).map(Number));
  const s = obter(token, userId);
  const lista = [...new Set((Array.isArray(cdempresas) ? cdempresas : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100000))];
  if (!lista.length) throw new Error('Marque ao menos uma empresa.');
  if (lista.length > MAX_EMPRESAS_POR_VEZ) throw new Error(`Marque no máximo ${MAX_EMPRESAS_POR_VEZ} empresas por vez.`);
  const informados = (cnpjsInformados && typeof cnpjsInformados === 'object' ? cnpjsInformados : {}) as Record<string, unknown>;
  return comOcupado(s, () => filaMigracaoContabil.entrar(s.token, async () => {
    s.indice = s.indice || await indexarDump(s.arquivo);
    const ler = leitor(s);
    const doBackup = new Map((s.empresas || []).map((e) => [e.cdempresa, e]));
    const cnpjsDoBackup = new Set((s.empresas || []).map((e) => e.cnpj).filter(Boolean));
    const saida: PreviaEmpresa[] = [];
    for (const cd of lista) {
      const e = doBackup.get(cd);
      const base = { cdempresa: cd, nome: e?.nome || `Empresa código ${cd}`, semCadastroNoBackup: Boolean(e?.semCadastro) };
      const vazio = { excluidaAntes: false, jaExisteNoMurade: false, lidos: {}, contas: 0, contasNovas: 0, contasAtualizadas: 0, contasDoModeloRetiradas: 0, historicos: 0, historicosNovos: 0, lancamentos: 0, lancamentosSubstituidos: 0, lancamentosDaEquipe: 0, naoEntraram: 0, blocos: [], periodo: '', conferencia: '', bate: false, totalAvisos: 0, avisos: [] };
      if (!e) { saida.push({ ...base, ...vazio, cnpj: '', podeGravar: false, motivo: 'Esta empresa não está neste arquivo.' }); continue; }
      const informado = normalizar(informados[String(cd)]);
      if (e.semCadastro && !informado) { saida.push({ ...base, ...vazio, cnpj: '', podeGravar: false, motivo: 'No sistema anterior esta empresa não tem mais cadastro (nem CNPJ). Digite o CNPJ dela para trazer.' }); continue; }
      if (e.semCadastro && cnpjsDoBackup.has(informado)) { saida.push({ ...base, ...vazio, cnpj: informado, podeGravar: false, motivo: 'Este CNPJ é de outra empresa do mesmo arquivo. Confira o CNPJ digitado.' }); continue; }
      const dados = await montarDadosEmpresa(ler, cd, { cnpjInformado: informado, sentidoMarcaAtiva: await sentidoDaSessao(s, ler) });
      if (comDesfazer.has(cd)) dados.desfazerAjustesMigracao = true;
      const cnpj = normalizar(dados.cnpj);
      dados.cnpj = cnpj;
      const comum = {
        ...base, cnpj, lidos: dados.lidos, contas: dados.contas.length, historicos: dados.historicosPadrao.length, lancamentos: dados.lancamentos.length, naoEntraram: dados.naoEntraram.length,
        blocos: Object.entries(dados.blocos).map(([bloco, l]) => ({ bloco, quantidade: l.length })),
        periodo: dados.lancamentos.length ? `${dados.lancamentos[0].data.split('-').reverse().join('/')} a ${dados.lancamentos[dados.lancamentos.length - 1].data.split('-').reverse().join('/')}` : '',
      };
      if (!dep.cnpjValido(cnpj)) { saida.push({ ...vazio, ...comum, podeGravar: false, motivo: 'CNPJ inválido no sistema anterior. Corrija o cadastro lá ou fale com o suporte.' }); continue; }
      if (!dados.contas.length && !dados.lancamentos.length) { saida.push({ ...vazio, ...comum, podeGravar: false, motivo: 'Não há plano de contas nem lançamentos desta empresa no arquivo.' }); continue; }
      const outro = await dep.deOutroEscritorio(cnpj);
      const excluida = await dep.excluidaAntes(cnpj);
      const atual = await dep.lerAtual(cnpj);
      const m = mesclarMigracao(atual.payload, dados, { modelo: dep.modelo, cadastroCompartilhado: atual.compartilhado, competenciaAtual: dep.competenciaAtual, fechadas: atual.fechadas });
      const conf = m.payload ? conferirMigracao(m.payload.contas, m.payload.lancamentos, { esperado: dados.esperado, esperadoLancamentos: dados.esperadoLancamentos, saldoFinalEsperado: dados.saldoFinalEsperado, lancamentosGravados: dados.lancamentos.length, semSaldosParaConferir: dados.semSaldosParaConferir, linhasQueNaoEntraram: dados.naoEntraram.length }) : null;
      let motivo: string | undefined;
      if (outro) motivo = 'Este CNPJ já está cadastrado em outro escritório. Cada empresa pertence a um único escritório.';
      else if (!m.payload) motivo = m.bloqueio;
      else if (!dep.validarWorkspace(m.payload)) motivo = 'Os dados juntados não passaram na validação do Contábil. Fale com o suporte.';
      const avisos = [...dados.avisos, ...m.avisos];
      saida.push({
        ...comum, podeGravar: !motivo, ...(motivo ? { motivo } : {}), excluidaAntes: excluida, jaExisteNoMurade: Boolean(atual.payload),
        contasNovas: m.contasNovas, contasAtualizadas: m.contasAtualizadas, contasDoModeloRetiradas: m.contasDoModeloRetiradas, historicosNovos: m.historicosNovos,
        lancamentosSubstituidos: m.lancamentosSubstituidos, lancamentosDaEquipe: m.lancamentosDaEquipe,
        conferencia: conf?.resumo || '', bate: Boolean(conf?.bate), totalAvisos: avisos.length, avisos: avisos.slice(0, 15),
        ajustesMigracaoLancados: m.ajustesMigracaoLancados || 0, desfazerAjustes: Boolean(dados.desfazerAjustesMigracao),
      });
      if (!motivo) s.previas.set(cd, { cnpjInformado: informado, desfazerAjustes: comDesfazer.has(cd) }); else s.previas.delete(cd);
      await new Promise<void>((ok) => setImmediate(ok)); // cede a vez ao servidor entre uma empresa e outra
    }
    return saida;
  }));
}

export interface ResultadoGravacaoContabil { cdempresa: number; cnpj: string; gravado: boolean; motivo?: string; lancamentos: number; contas: number; conferencia?: string; bate?: boolean }

/** Grava as empresas já conferidas na prévia. Empresa excluída antes só volta se foi marcada uma por uma. */
export async function gravarMigracaoContabil(
  token: string, userId: string, cdempresas: unknown, escolhidasUmaAUma: boolean,
  gravar: (dados: DadosContabeisEmpresa) => Promise<{ lancamentos: number; contasNovas: number; conferencia: { resumo: string; bate: boolean } }>,
  excluidaAntes: (cnpj: string) => Promise<boolean>,
): Promise<ResultadoGravacaoContabil[]> {
  const s = obter(token, userId);
  const lista = [...new Set((Array.isArray(cdempresas) ? cdempresas : []).map(Number).filter((n) => Number.isInteger(n)))];
  if (!lista.length) throw new Error('Marque ao menos uma empresa.');
  if (lista.length > MAX_EMPRESAS_POR_VEZ) throw new Error(`Grave no máximo ${MAX_EMPRESAS_POR_VEZ} empresas por vez.`);
  const resultados = await comOcupado(s, () => filaMigracaoContabil.entrar(s.token, async () => {
    s.indice = s.indice || await indexarDump(s.arquivo);
    const ler = leitor(s);
    const r: ResultadoGravacaoContabil[] = [];
    for (const cd of lista) {
      const escolha = s.previas.get(cd);
      if (!escolha) { r.push({ cdempresa: cd, cnpj: '', gravado: false, motivo: 'Confira a prévia desta empresa antes de gravar.', lancamentos: 0, contas: 0 }); continue; }
      // Lê de novo do arquivo a empresa conferida na prévia (mesmo arquivo, mesma regra: o mesmo resultado da prévia).
      const dados = await montarDadosEmpresa(ler, cd, { cnpjInformado: escolha.cnpjInformado, sentidoMarcaAtiva: await sentidoDaSessao(s, ler) });
      if (escolha.desfazerAjustes) dados.desfazerAjustesMigracao = true;
      dados.cnpj = normalizar(dados.cnpj);
      try {
        // Sem CNPJ no backup = sempre escolhida uma por uma (a pessoa digitou o CNPJ).
        if (!escolhidasUmaAUma && !dados.semCadastroNoBackup && await excluidaAntes(dados.cnpj)) {
          r.push({ cdempresa: cd, cnpj: dados.cnpj, gravado: false, motivo: 'Esta empresa foi excluída antes. Para trazer de volta, use "Não, quero escolher" e marque ela uma por uma.', lancamentos: 0, contas: 0 });
          continue;
        }
        const g = await gravar(dados);
        r.push({ cdempresa: cd, cnpj: dados.cnpj, gravado: true, lancamentos: g.lancamentos, contas: dados.contas.length, conferencia: g.conferencia.resumo, bate: g.conferencia.bate });
        s.previas.delete(cd);
      } catch (erro: any) {
        r.push({ cdempresa: cd, cnpj: dados.cnpj, gravado: false, motivo: String(erro?.message || erro).slice(0, 400), lancamentos: 0, contas: 0 });
      }
      await new Promise<void>((ok) => setImmediate(ok));
    }
    return r;
  }));
  // Tudo que foi conferido já foi gravado: o arquivo (dado de cliente) é apagado na hora.
  if (!s.previas.size) descartarMigracaoContabil(token);
  return resultados;
}

export function situacaoMigracaoContabilDoUsuario(userId: string): { emAndamento: boolean; minutosDesdeEnvio: number; empresasNaPrevia: number; empresasNoArquivo: number } {
  const s = [...sessoes.values()].find((x) => x.userId === userId);
  return s ? { emAndamento: true, minutosDesdeEnvio: Math.round((Date.now() - s.criadoEm) / 60000), empresasNaPrevia: s.previas.size, empresasNoArquivo: s.empresas?.length || 0 } : { emAndamento: false, minutosDesdeEnvio: 0, empresasNaPrevia: 0, empresasNoArquivo: 0 };
}

export function estadoMigracoesContabil(): { emAndamento: number; maisAntigaMin: number } {
  const agora = Date.now();
  return { emAndamento: sessoes.size, maisAntigaMin: sessoes.size ? Math.round(Math.max(...[...sessoes.values()].map((s) => agora - s.criadoEm)) / 60000) : 0 };
}
