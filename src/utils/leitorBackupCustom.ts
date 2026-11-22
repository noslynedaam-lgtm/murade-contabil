// Leitor do arquivo de backup do sistema anterior (formato "custom" do pg_dump do PostgreSQL: começa com "PGDMP"; o
// sistema anterior grava com a extensão .bcir ou .backup). Roda no NAVEGADOR (e nos testes, no Node): lê o índice do
// arquivo, pega só as tabelas da parte contábil (lista em tabelasSistemaAnteriorContabil.ts) e monta o mesmo texto SQL que o
// `pg_restore -f` produziria para elas (poucos MB em vez de ~1,1 GB). Nada é enviado ao servidor além desse texto.
// Formato seguido: src/bin/pg_dump/pg_backup_archiver.c e pg_backup_custom.c do PostgreSQL (versões de arquivo 1.10 a 1.16).
import { tabelaContabilInteressa } from './tabelasSistemaAnteriorContabil';

/** Lê um pedaço do arquivo [inicio, fim). */
export type LerFatia = (inicio: number, fim: number) => Promise<Uint8Array>;
/** Descompacta um fluxo zlib inteiro (os pedaços de dados de uma tabela, na ordem). */
export type Descompactar = (partes: Uint8Array[]) => Promise<Uint8Array>;

export interface EntradaIndice { dumpId: number; desc: string; namespace: string; tag: string; defn: string; copyStmt: string; posicao: number | null; temDados: boolean }
export interface ResultadoBackupCustom { partes: Uint8Array[]; tamanho: number; tabelas: number; versaoArquivo: string; versaoServidor: string; encoding: string }

const MAGICO = [0x50, 0x47, 0x44, 0x4d, 0x50]; // PGDMP

/** Diz se os primeiros bytes são de um backup no formato custom. */
export function ehBackupCustom(inicio: Uint8Array): boolean {
  return inicio.length >= 5 && MAGICO.every((b, i) => inicio[i] === b);
}

/** Só as tabelas da parte contábil (lista em tabelasSistemaAnteriorContabil.ts). */
export function tabelaInteressa(namespace: string, tag: string): boolean {
  return tabelaContabilInteressa(namespace, tag);
}

class Leitor {
  private buf = new Uint8Array(0);
  private base = 0; // posição no arquivo do buf[0]
  pos = 0;
  intSize = 4; offSize = 8; vmaj = 1; vmin = 0; vrev = 0;
  constructor(private ler: LerFatia, private total: number, private bloco = 1 << 20) {}
  get versao() { return (this.vmaj << 16) | (this.vmin << 8) | this.vrev; }
  private async garantir(n: number) {
    if (this.pos >= this.base && this.pos + n <= this.base + this.buf.length) return;
    if (this.pos + n > this.total) throw new Error('O arquivo de backup terminou antes do esperado (arquivo incompleto ou corrompido).');
    const fim = Math.min(this.total, this.pos + Math.max(n, this.bloco));
    this.buf = await this.ler(this.pos, fim); this.base = this.pos;
  }
  async bytes(n: number): Promise<Uint8Array> {
    if (n > this.bloco) { const b = await this.ler(this.pos, this.pos + n); if (b.length !== n) throw new Error('Leitura incompleta do backup.'); this.pos += n; return b; }
    await this.garantir(n); const i = this.pos - this.base; this.pos += n; return this.buf.subarray(i, i + n);
  }
  async byte(): Promise<number> { return (await this.bytes(1))[0]; }
  async int(): Promise<number> {
    const sinal = this.versao > 0x010000 ? await this.byte() : 0;
    const b = await this.bytes(this.intSize);
    let v = 0; for (let i = b.length - 1; i >= 0; i--) v = v * 256 + b[i];
    return sinal ? -v : v;
  }
  async str(): Promise<string | null> {
    const l = await this.int(); if (l < 0) return null; if (l === 0) return '';
    return new TextDecoder('utf-8', { fatal: false }).decode(await this.bytes(l));
  }
  /** Offset dos dados (formato custom): 1 byte de situação + offSize bytes. */
  async offset(): Promise<{ situacao: number; valor: number }> {
    const situacao = await this.byte(); const b = await this.bytes(this.offSize);
    let v = 0; for (let i = b.length - 1; i >= 0; i--) v = v * 256 + b[i];
    return { situacao, valor: v };
  }
  pular(n: number) { this.pos += n; }
}

const V = (a: number, b: number, c = 0) => (a << 16) | (b << 8) | c;

/** Lê o cabeçalho e o índice inteiro. */
export async function lerIndiceBackup(ler: LerFatia, total: number): Promise<{ leitor: Leitor; entradas: EntradaIndice[]; compressao: number; versaoArquivo: string; versaoServidor: string; encoding: string; fimIndice: number }> {
  const L = new Leitor(ler, total);
  if (!ehBackupCustom(await L.bytes(5))) throw new Error('Este arquivo não é um backup do banco no formato esperado (não começa com PGDMP).');
  L.vmaj = await L.byte(); L.vmin = await L.byte();
  if (L.vmaj > 1 || (L.vmaj === 1 && L.vmin > 0)) L.vrev = await L.byte();
  const versao = L.versao;
  if (versao < V(1, 10) || versao > V(1, 16)) throw new Error(`Versão do backup não suportada (${L.vmaj}.${L.vmin}). Mande o arquivo para o suporte.`);
  L.intSize = await L.byte();
  L.offSize = await L.byte();
  const formato = await L.byte();
  if (formato !== 1) throw new Error('O backup não está no formato "custom" do banco (formato ' + formato + ').');
  let compressao: number; // 0 nenhuma, 1 gzip, 2 lz4, 3 zstd
  if (versao >= V(1, 15)) compressao = await L.byte();
  else { const c = await L.int(); compressao = c === 0 ? 0 : 1; }
  for (let i = 0; i < 7; i++) await L.int(); // data/hora do backup
  await L.str(); // nome do banco
  const versaoServidor = (await L.str()) || '';
  await L.str(); // versão do pg_dump
  const qtd = await L.int();
  const entradas: EntradaIndice[] = [];
  let encoding = '';
  for (let i = 0; i < qtd; i++) {
    const dumpId = await L.int();
    const temDados = (await L.int()) !== 0;
    await L.str(); await L.str(); // tableoid, oid
    const tag = (await L.str()) || '';
    const desc = (await L.str()) || '';
    await L.int(); // section
    const defn = (await L.str()) || '';
    await L.str(); // drop
    const copyStmt = (await L.str()) || '';
    const namespace = (await L.str()) || '';
    await L.str(); // tablespace
    if (versao >= V(1, 14)) await L.str(); // tableam
    if (versao >= V(1, 16)) await L.int(); // relkind
    await L.str(); // owner
    await L.str(); // "with oids" (sempre lido a partir da 1.9)
    for (;;) { const d = await L.str(); if (d === null) break; } // dependências
    const off = await L.offset();
    if (desc === 'ENCODING') encoding = defn;
    entradas.push({ dumpId, desc, namespace, tag, defn, copyStmt, posicao: off.situacao === 2 ? off.valor : null, temDados });
  }
  return { leitor: L, entradas, compressao, versaoArquivo: `${L.vmaj}.${L.vmin}.${L.vrev}`, versaoServidor, encoding, fimIndice: L.pos };
}

/** Lê os pedaços de dados de um bloco, a partir da posição do leitor (já depois do tipo e do id). */
async function lerPedacos(L: Leitor, guardar: boolean): Promise<Uint8Array[]> {
  const partes: Uint8Array[] = [];
  for (;;) {
    const n = await L.int();
    if (n === 0) break;
    if (n < 0) throw new Error('Bloco de dados inválido no backup.');
    if (guardar) partes.push((await L.bytes(n)).slice()); else L.pular(n);
  }
  return partes;
}

const enc = new TextEncoder();

/** Monta o texto SQL (só as tabelas da parte contábil) a partir do arquivo de backup. */
export async function extrairTabelasContabeis(ler: LerFatia, total: number, descompactar: Descompactar, aoAvancar?: (feito: number, total: number) => void): Promise<ResultadoBackupCustom> {
  const idx = await lerIndiceBackup(ler, total);
  if (idx.compressao !== 0 && idx.compressao !== 1) throw new Error('Este backup usa uma compactação (LZ4/ZSTD) que a tela ainda não abre. Mande o arquivo para o suporte.');
  const L = idx.leitor;
  const tabelas = idx.entradas.filter((e) => e.desc === 'TABLE' && tabelaInteressa(e.namespace, e.tag));
  const dados = idx.entradas.filter((e) => e.desc === 'TABLE DATA' && tabelaInteressa(e.namespace, e.tag));
  if (!tabelas.length) throw new Error('Este backup não tem as tabelas da parte contábil do sistema anterior.');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const por = (t: string | Uint8Array) => { const b = typeof t === 'string' ? enc.encode(t) : t; partes.push(b); tamanho += b.length; };
  por('-- Gerado pelo Murade Contábil a partir do backup do sistema anterior (só as tabelas da parte contábil)\n');
  por((idx.encoding || "SET client_encoding = 'UTF8';").trim() + '\n\n');
  for (const t of tabelas) por(t.defn.trim() + '\n\n');

  // Onde está o bloco de cada tabela: pela posição gravada no índice ou, se o backup foi gravado sem posições, varrendo.
  const semPosicao = dados.some((d) => d.temDados && d.posicao === null);
  const posicoes = new Map<number, number>();
  if (semPosicao) {
    const querIds = new Set(dados.map((d) => d.dumpId));
    L.pos = idx.fimIndice;
    while (L.pos < total) {
      const inicioBloco = L.pos;
      const tipo = await L.byte();
      if (tipo !== 1 && tipo !== 2) break; // 1 = dados, 2 = objetos grandes
      const id = await L.int();
      if (tipo === 1 && querIds.has(id)) posicoes.set(id, inicioBloco);
      await lerPedacos(L, false);
      aoAvancar?.(L.pos, total);
    }
  } else {
    for (const d of dados) if (d.posicao !== null) posicoes.set(d.dumpId, d.posicao);
  }
  let feitos = 0;
  for (const d of dados) {
    feitos++;
    const p = posicoes.get(d.dumpId);
    if (!d.temDados || p === undefined) continue; // tabela vazia
    L.pos = p;
    const tipo = await L.byte(); const id = await L.int();
    if (tipo !== 1 || id !== d.dumpId) throw new Error(`O índice do backup aponta para o lugar errado na tabela ${d.namespace}.${d.tag}.`);
    const brutos = await lerPedacos(L, true);
    const conteudo = idx.compressao === 1 ? await descompactar(brutos) : juntar(brutos);
    por(d.copyStmt.trim() + '\n');
    por(conteudo);
    por('\\.\n\n');
    aoAvancar?.(feitos, dados.length);
  }
  return { partes, tamanho, tabelas: tabelas.length, versaoArquivo: idx.versaoArquivo, versaoServidor: idx.versaoServidor, encoding: idx.encoding };
}

export function juntar(partes: Uint8Array[]): Uint8Array {
  const n = partes.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(n); let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
}

/** Leitura e descompactação no navegador (File + DecompressionStream). */
export function leitoresDoNavegador(arquivo: Blob): { ler: LerFatia; descompactar: Descompactar } {
  return {
    ler: async (inicio, fim) => new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer()),
    descompactar: async (partes) => {
      const DS: any = (globalThis as any).DecompressionStream;
      if (!DS) throw new Error('Este navegador não abre o backup. Use o Chrome ou o Edge atualizados.');
      return new Uint8Array(await new Response(new Blob(partes as BlobPart[]).stream().pipeThrough(new DS('deflate'))).arrayBuffer());
    },
  };
}
