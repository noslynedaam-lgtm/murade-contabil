// Conteúdo (o zip dentro do arquivo .murade) do backup do escritório — igual nos três sistemas Murade.
//
// Backup COMPLETO: todas as linhas de cada tabela do escritório + um índice (hash de cada linha).
// Backup SÓ ALTERAÇÕES (diferencial): só o que mudou desde o último COMPLETO — linhas novas ou alteradas, e o hash das
// linhas que saíram. Para restaurar um "só alterações" basta ele + o completo em que se baseia (nunca uma cadeia longa).
// É viável aqui porque o índice de hashes do completo permite comparar linha a linha, inclusive o que foi apagado,
// sem depender de cada tabela ter coluna de "alterado em".
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { FORMATO_CONTEUDO, VERSAO_FORMATO, type SistemaMurade } from './formato';

export type Linhas = any[] | AsyncIterable<any>;
export type TabelasEscritorio = Record<string, Linhas>;
export type Indice = Record<string, string[]>;

export interface Manifesto {
  formato: typeof FORMATO_CONTEUDO;
  versao: number;
  sistema: SistemaMurade;
  id: string;
  tipo: 'completo' | 'alteracoes';
  baseId: string | null;
  geradoEm: string;
  /** Quantas linhas cada tabela tem no estado que este backup representa (no "só alterações": base + alterações). */
  tabelas: Record<string, number>;
  /** Só no "só alterações": linhas incluídas/alteradas e removidas por tabela. */
  alteracoes?: Record<string, { incluidas: number; removidas: number }>;
}

/** JSON com as chaves em ordem (o mesmo dado gera sempre o mesmo texto e, portanto, o mesmo hash). */
export function jsonEstavel(valor: unknown): string {
  if (Buffer.isBuffer(valor)) return JSON.stringify(valor.toString('base64'));
  if (valor && typeof (valor as any).toJSON === 'function') return jsonEstavel((valor as any).toJSON());
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? 'null' : jsonEstavel(v))).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const chaves = Object.keys(valor as object).filter((k) => (valor as any)[k] !== undefined).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonEstavel((valor as any)[k])}`).join(',')}}`;
  }
  if (typeof valor === 'number' && !Number.isFinite(valor)) return 'null';
  if (typeof valor === 'bigint') return JSON.stringify(valor.toString());
  return JSON.stringify(valor ?? null);
}

export const hashLinha = (linha: unknown): string => createHash('sha256').update(jsonEstavel(linha)).digest('hex').slice(0, 32);

async function* emLinhas(l: Linhas): AsyncGenerator<any> {
  if (Array.isArray(l)) { for (const x of l) yield x; return; }
  for await (const x of l) yield x;
}

function contar(hashes: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of hashes) m.set(h, (m.get(h) || 0) + 1);
  return m;
}

/**
 * Monta o zip. Sem `indiceBase` faz o COMPLETO; com ele faz o SÓ ALTERAÇÕES em relação àquele completo.
 * As linhas vão para o zip como texto JSON (estável), uma tabela por arquivo, compactado (DEFLATE).
 */
export async function montarConteudo(
  tabelas: TabelasEscritorio,
  meta: { sistema: SistemaMurade; id: string; geradoEm: string; base: { id: string; indice: Indice } | null },
): Promise<{ zip: Buffer; manifesto: Manifesto; indice: Indice }> {
  const zip = new JSZip();
  const indice: Indice = {};
  const contagens: Record<string, number> = {};
  const alteracoes: Record<string, { incluidas: number; removidas: number }> = {};
  const removidas: Indice = {};
  const nomes = Object.keys(tabelas).sort();
  for (const nome of nomes) {
    if (!/^[a-z0-9_]{1,60}$/.test(nome)) throw new Error(`Nome de tabela inválido no backup: ${nome}`);
    const partes: string[] = [];
    const hashes: string[] = [];
    const restantesBase = meta.base ? contar(meta.base.indice[nome] || []) : null;
    let incluidas = 0;
    for await (const linha of emLinhas(tabelas[nome])) {
      const texto = jsonEstavel(linha);
      const h = createHash('sha256').update(texto).digest('hex').slice(0, 32);
      hashes.push(h);
      if (restantesBase) {
        const n = restantesBase.get(h) || 0;
        if (n > 0) { restantesBase.set(h, n - 1); continue; }
        incluidas += 1;
      }
      partes.push(texto);
    }
    indice[nome] = hashes;
    contagens[nome] = hashes.length;
    zip.file(`dados/${nome}.json`, `[${partes.join(',')}]`);
    if (restantesBase) {
      const fora: string[] = [];
      for (const [h, n] of restantesBase) for (let i = 0; i < n; i++) fora.push(h);
      removidas[nome] = fora;
      alteracoes[nome] = { incluidas, removidas: fora.length };
    }
  }
  if (meta.base) {
    // Tabela que existia no completo e não existe mais na coleta: tudo dela foi removido.
    for (const nome of Object.keys(meta.base.indice)) {
      if (nome in tabelas) continue;
      removidas[nome] = [...meta.base.indice[nome]];
      alteracoes[nome] = { incluidas: 0, removidas: removidas[nome].length };
      contagens[nome] = 0;
      zip.file(`dados/${nome}.json`, '[]');
    }
    zip.file('removidas.json', JSON.stringify(removidas));
  } else {
    zip.file('indice.json', JSON.stringify(indice));
  }
  const manifesto: Manifesto = {
    formato: FORMATO_CONTEUDO, versao: VERSAO_FORMATO, sistema: meta.sistema, id: meta.id,
    tipo: meta.base ? 'alteracoes' : 'completo', baseId: meta.base?.id ?? null, geradoEm: meta.geradoEm, tabelas: contagens,
    ...(meta.base ? { alteracoes } : {}),
  };
  zip.file('manifesto.json', JSON.stringify(manifesto, null, 2));
  zip.file('LEIA-ME.txt', [
    'Backup do escritório no Murade — só os dados deste escritório.',
    'Formato próprio do Murade, cifrado com a chave deste escritório: só abre e só é restaurado dentro do Murade,',
    'pelo administrador do escritório (tela Backup > Restaurar). Não contém certificado digital nem senha de ninguém.',
  ].join('\n'));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { zip: buffer, manifesto, indice };
}

export interface ConteudoLido { manifesto: Manifesto; tabelas: Record<string, any[]>; indice: Indice | null; removidas: Indice | null }

/** Reabre o zip e confere: manifesto do formato certo, todas as tabelas presentes e contagens batendo. */
export async function lerConteudo(zipBuffer: Buffer, esperado?: { sistema?: SistemaMurade; id?: string }): Promise<ConteudoLido> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const m = zip.file('manifesto.json');
  if (!m) throw new Error('O manifesto não foi encontrado dentro do backup.');
  const manifesto = JSON.parse(await m.async('string')) as Manifesto;
  if (manifesto.formato !== FORMATO_CONTEUDO) throw new Error('O conteúdo do backup não é do formato do Murade.');
  if (esperado?.sistema && manifesto.sistema !== esperado.sistema) throw new Error('O conteúdo do backup é de outro sistema.');
  if (esperado?.id && manifesto.id !== esperado.id) throw new Error('O manifesto não corresponde a este backup.');
  const tabelas: Record<string, any[]> = {};
  for (const nome of Object.keys(manifesto.tabelas)) {
    const f = zip.file(`dados/${nome}.json`);
    if (!f) throw new Error(`A tabela ${nome} não está dentro do backup.`);
    const linhas = JSON.parse(await f.async('string'));
    if (!Array.isArray(linhas)) throw new Error(`A tabela ${nome} do backup está corrompida.`);
    tabelas[nome] = linhas;
  }
  const i = zip.file('indice.json');
  const r = zip.file('removidas.json');
  const indice = i ? JSON.parse(await i.async('string')) as Indice : null;
  const removidas = r ? JSON.parse(await r.async('string')) as Indice : null;
  if (manifesto.tipo === 'completo') {
    if (!indice) throw new Error('O índice do backup completo não foi encontrado.');
    for (const [nome, linhas] of Object.entries(tabelas)) {
      if (linhas.length !== manifesto.tabelas[nome]) throw new Error(`A contagem da tabela ${nome} não confere (${linhas.length} de ${manifesto.tabelas[nome]}).`);
      if ((indice[nome] || []).length !== linhas.length) throw new Error(`O índice da tabela ${nome} não confere.`);
    }
  } else {
    if (!removidas || !manifesto.alteracoes || !manifesto.baseId) throw new Error('O backup de alterações está incompleto (sem a lista do que saiu ou sem a base).');
    for (const [nome, a] of Object.entries(manifesto.alteracoes)) {
      if ((tabelas[nome] || []).length !== a.incluidas) throw new Error(`As alterações da tabela ${nome} não conferem.`);
      if ((removidas[nome] || []).length !== a.removidas) throw new Error(`As remoções da tabela ${nome} não conferem.`);
    }
  }
  return { manifesto, tabelas, indice, removidas };
}

/** Estado completo representado por um "só alterações": linhas do completo menos as removidas, mais as incluídas. */
export function reconstruir(base: ConteudoLido, alteracoes: ConteudoLido): Record<string, any[]> {
  if (base.manifesto.tipo !== 'completo' || alteracoes.manifesto.baseId !== base.manifesto.id) throw new Error('O backup completo informado não é a base deste backup de alterações.');
  const saida: Record<string, any[]> = {};
  const nomes = new Set([...Object.keys(base.tabelas), ...Object.keys(alteracoes.tabelas)]);
  for (const nome of nomes) {
    const fora = contar(alteracoes.removidas?.[nome] || []);
    const linhas: any[] = [];
    const indiceBase = base.indice?.[nome] || [];
    (base.tabelas[nome] || []).forEach((linha, i) => {
      const h = indiceBase[i] ?? hashLinha(linha);
      const n = fora.get(h) || 0;
      if (n > 0) { fora.set(h, n - 1); return; }
      linhas.push(linha);
    });
    for (const [, n] of fora) if (n > 0) throw new Error(`O backup de alterações remove linhas da tabela ${nome} que não existem no completo.`);
    linhas.push(...(alteracoes.tabelas[nome] || []));
    const esperado = alteracoes.manifesto.tabelas[nome];
    if (esperado !== undefined && linhas.length !== esperado) throw new Error(`A tabela ${nome} reconstruída não confere (${linhas.length} de ${esperado}).`);
    saida[nome] = linhas;
  }
  return saida;
}
