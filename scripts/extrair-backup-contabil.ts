// Uso: npx tsx scripts/extrair-backup-contabil.ts <arquivo .backup/.bcir> <saida.sql>
// Faz no Node exatamente o que a tela faz no navegador: separa só a parte contábil do backup do sistema anterior.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { extrairTabelasContabeis, juntar } from '../src/utils/leitorBackupCustom';

export async function extrairArquivo(arquivo: string, saida: string): Promise<{ tamanho: number; tabelas: number; segundos: number }> {
  const t0 = Date.now();
  const fd = fs.openSync(arquivo, 'r');
  const total = fs.fstatSync(fd).size;
  const ler = async (inicio: number, fim: number) => { const b = Buffer.alloc(fim - inicio); fs.readSync(fd, b, 0, b.length, inicio); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
  const descompactar = async (partes: Uint8Array[]) => new Uint8Array(zlib.inflateSync(juntar(partes)));
  try {
    const r = await extrairTabelasContabeis(ler, total, descompactar);
    fs.writeFileSync(saida, juntar(r.partes));
    return { tamanho: r.tamanho, tabelas: r.tabelas, segundos: (Date.now() - t0) / 1000 };
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && /extrair-backup-contabil/.test(process.argv[1])) {
  const [arquivo, saida] = process.argv.slice(2);
  extrairArquivo(arquivo, saida).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
