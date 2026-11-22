// Leitor do texto SQL (formato do pg_dump em texto, com blocos COPY) da parte contábil do backup do sistema anterior,
// sem restaurar nada em banco nenhum: uma passada cria um índice (onde começa e termina cada tabela) e só as tabelas
// usadas são carregadas, uma empresa por vez. Mesmo leitor do Murade DP (src/server/migracaoAlterdata/leitorDump.ts).
import fs from 'node:fs';

export type LinhaDump = Record<string, any>;

export interface TabelaIndexada {
  nome: string;
  colunas: string[];
  tipos: string[];
  /** Byte onde começa a primeira linha de dados e byte onde termina o bloco (linha "\." exclusiva). */
  inicio: number;
  fim: number;
}

export interface IndiceDump {
  arquivo: string;
  tamanho: number;
  codificacao: string;
  tabelas: Map<string, TabelaIndexada>;
}

const LIMITE_LINHA_DEFINICAO = 20000;

function rotuloCodificacao(valor: string): string {
  const v = valor.trim().toUpperCase();
  if (v === 'UTF8' || v === 'UTF-8') return 'utf-8';
  if (v === 'LATIN1' || v === 'ISO_8859_1' || v === 'WIN1252' || v === 'WIN1252') return 'windows-1252';
  return 'utf-8';
}

function nomeSemAspas(nome: string): string {
  return nome.replace(/"/g, '');
}

/** Tipo do Postgres -> como o driver `pg` entrega o valor (o importador foi escrito contra esse formato). */
function categoriaDoTipo(tipo: string): 'int' | 'float' | 'bool' | 'data' | 'timestamp' | 'texto' {
  const t = tipo.toLowerCase();
  if (/^(integer|int|int4|smallint|int2|serial|smallserial)\b/.test(t)) return 'int';
  if (/^(real|float4|double precision|float8|float)\b/.test(t)) return 'float';
  if (/^(boolean|bool)\b/.test(t)) return 'bool';
  if (/^date\b/.test(t)) return 'data';
  if (/^timestamp\b/.test(t)) return 'timestamp';
  return 'texto'; // bigint, numeric e demais vêm como texto, igual ao driver pg
}

/** Desfaz os escapes do formato COPY (\\, \t, \n, \r, \b, \f, \v, \NNN octal, \xHH). */
function desfazerEscapes(s: string): string {
  if (s.indexOf('\\') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i === s.length - 1) { out += c; continue; }
    const n = s[++i];
    if (n === 'n') out += '\n';
    else if (n === 't') out += '\t';
    else if (n === 'r') out += '\r';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === 'v') out += '\v';
    else if (n === 'x' && /^[0-9a-fA-F]{1,2}/.test(s.slice(i + 1, i + 3))) {
      const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 1, i + 3))!;
      out += String.fromCharCode(parseInt(m[0], 16)); i += m[0].length;
    } else if (/[0-7]/.test(n)) {
      const m = /^[0-7]{1,3}/.exec(s.slice(i, i + 3))!;
      out += String.fromCharCode(parseInt(m[0], 8)); i += m[0].length - 1;
    } else out += n;
  }
  return out;
}

function converterValor(bruto: string, categoria: ReturnType<typeof categoriaDoTipo>): any {
  if (bruto === '\\N') return null;
  const s = desfazerEscapes(bruto);
  switch (categoria) {
    case 'int': { const n = Number(s); return Number.isFinite(n) ? n : s; }
    case 'float': { const n = Number(s); return Number.isFinite(n) ? n : s; }
    case 'bool': return s === 't' || s === 'true';
    case 'data': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : s;
    }
    case 'timestamp': {
      const d = new Date(/[zZ]|[+-]\d{2}(:?\d{2})?$/.test(s) ? s.replace(' ', 'T') : s.replace(' ', 'T') + 'Z');
      return Number.isNaN(d.getTime()) ? s : d;
    }
    default: return s;
  }
}

/** Passada única pelo arquivo: acha onde está cada tabela (COPY) e quais são suas colunas/tipos. Memória baixa. */
export async function indexarDump(arquivo: string): Promise<IndiceDump> {
  const tamanho = fs.statSync(arquivo).size;
  const tabelas = new Map<string, TabelaIndexada>();
  const definicoes = new Map<string, { colunas: string[]; tipos: string[] }>();
  let codificacao = 'utf-8';

  let dentroDoCopy: { nome: string; colunas: string[]; inicio: number } | null = null;
  let definindo: { nome: string; colunas: string[]; tipos: string[] } | null = null;
  let posicao = 0;
  let sobra: Buffer = Buffer.alloc(0);
  let viuCopy = false;

  const tratarLinha = (bytes: Buffer, inicioLinha: number, fimLinhaComQuebra: number) => {
    let fimUtil = bytes.length;
    if (fimUtil > 0 && bytes[fimUtil - 1] === 0x0d) fimUtil--;
    if (dentroDoCopy) {
      if (fimUtil === 2 && bytes[0] === 0x5c && bytes[1] === 0x2e) {
        tabelas.set(dentroDoCopy.nome, { nome: dentroDoCopy.nome, colunas: dentroDoCopy.colunas, tipos: definicoes.get(dentroDoCopy.nome)?.tipos ?? dentroDoCopy.colunas.map(() => 'text'), inicio: dentroDoCopy.inicio, fim: inicioLinha });
        dentroDoCopy = null;
      }
      return;
    }
    if (fimUtil > LIMITE_LINHA_DEFINICAO) return;
    const primeiro = bytes[0];
    // Só interessam linhas que começam por C (CREATE/COPY) ou S (SET) ou espaço (colunas) ou ")" (fim do CREATE).
    if (primeiro !== 0x43 && primeiro !== 0x53 && primeiro !== 0x20 && primeiro !== 0x29) return;
    const linha = bytes.subarray(0, fimUtil).toString('latin1');
    if (primeiro === 0x53) {
      const m = /^SET client_encoding = '([^']+)'/.exec(linha);
      if (m) codificacao = rotuloCodificacao(m[1]);
      return;
    }
    if (definindo) {
      if (linha.startsWith(');')) { definicoes.set(definindo.nome, { colunas: definindo.colunas, tipos: definindo.tipos }); definindo = null; return; }
      const m = /^ {4}("?[A-Za-z0-9_$]+"?)\s+(.+?),?$/.exec(linha);
      if (m && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(m[1])) {
        definindo.colunas.push(nomeSemAspas(m[1]));
        definindo.tipos.push(m[2].replace(/\s+(NOT NULL|NULL|DEFAULT|COLLATE|GENERATED).*$/i, '').trim());
      }
      return;
    }
    if (primeiro === 0x43) {
      const c = /^CREATE TABLE ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?) \($/.exec(linha);
      if (c) { definindo = { nome: nomeSemAspas(c[1]).toLowerCase(), colunas: [], tipos: [] }; return; }
      const k = /^COPY ("?[A-Za-z0-9_$]+"?\."?[A-Za-z0-9_$]+"?) \(([^)]*)\) FROM stdin;$/.exec(linha);
      if (k) {
        viuCopy = true;
        dentroDoCopy = { nome: nomeSemAspas(k[1]).toLowerCase(), colunas: k[2].split(',').map((x) => nomeSemAspas(x.trim())), inicio: fimLinhaComQuebra };
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    const fluxo = fs.createReadStream(arquivo, { highWaterMark: 4 * 1024 * 1024 });
    let pularAteQuebra = false;
    fluxo.on('data', (pedaco: string | Buffer) => {
      const buf = sobra.length ? Buffer.concat([sobra, pedaco as Buffer]) : (pedaco as Buffer);
      sobra = Buffer.alloc(0);
      let ini = 0;
      if (pularAteQuebra) {
        const nl0 = buf.indexOf(0x0a);
        if (nl0 === -1) { posicao += buf.length; return; }
        ini = nl0 + 1; pularAteQuebra = false;
      }
      for (;;) {
        const nl = buf.indexOf(0x0a, ini);
        if (nl === -1) break;
        tratarLinha(buf.subarray(ini, nl), posicao + ini, posicao + nl + 1);
        ini = nl + 1;
      }
      const resto = buf.length - ini;
      // Linhas de dados gigantes (ex.: arquivos binários dentro do banco) não precisam ser guardadas: só interessa
      // o começo de cada linha. Acima de 1 MB a linha é pulada até a próxima quebra.
      if (resto > 1024 * 1024) { posicao += buf.length; pularAteQuebra = true; return; }
      sobra = buf.subarray(ini);
      posicao += ini;
    });
    fluxo.on('end', () => { if (sobra.length) tratarLinha(sobra, posicao, posicao + sobra.length); resolve(); });
    fluxo.on('error', reject);
  });

  if (!viuCopy) throw new Error('Este arquivo não tem tabelas do PostgreSQL em texto (blocos COPY). Escolha o arquivo de backup do sistema anterior na tela de migração.');
  return { arquivo, tamanho, codificacao, tabelas };
}

/** Carrega todas as linhas de UMA tabela do índice, já convertidas para os tipos do driver pg. */
export async function carregarTabelaDump(indice: IndiceDump, nome: string): Promise<LinhaDump[] | null> {
  const t = indice.tabelas.get(nome.toLowerCase());
  if (!t) return null;
  if (t.fim <= t.inicio) return [];
  const categorias = t.tipos.map(categoriaDoTipo);
  const decodificador = new TextDecoder(indice.codificacao);
  const linhas: LinhaDump[] = [];
  let sobra: Buffer = Buffer.alloc(0);
  const tratar = (bytes: Buffer) => {
    let fim = bytes.length;
    if (fim > 0 && bytes[fim - 1] === 0x0d) fim--;
    if (fim === 0) return;
    const campos = decodificador.decode(bytes.subarray(0, fim)).split('\t');
    const obj: LinhaDump = {};
    for (let i = 0; i < t.colunas.length; i++) obj[t.colunas[i]] = converterValor(campos[i] ?? '\\N', categorias[i] ?? 'texto');
    linhas.push(obj);
  };
  await new Promise<void>((resolve, reject) => {
    const fluxo = fs.createReadStream(indice.arquivo, { start: t.inicio, end: t.fim - 1, highWaterMark: 4 * 1024 * 1024 });
    fluxo.on('data', (pedaco: string | Buffer) => {
      const buf = sobra.length ? Buffer.concat([sobra, pedaco as Buffer]) : (pedaco as Buffer);
      let ini = 0;
      for (;;) { const nl = buf.indexOf(0x0a, ini); if (nl === -1) break; tratar(buf.subarray(ini, nl)); ini = nl + 1; }
      sobra = buf.subarray(ini);
    });
    fluxo.on('end', () => { if (sobra.length) tratar(sobra); resolve(); });
    fluxo.on('error', reject);
  });
  return linhas;
}
