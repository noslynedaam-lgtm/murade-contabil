/// <reference lib="webworker" />
// Abre o backup do sistema anterior FORA da tela (Web Worker), para a aba não travar com arquivo de vários GB.
import { ehBackupCustom, extrairTabelasContabeis, leitoresDoNavegador } from './leitorBackupCustom';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ultimo = 0;
const avisar = (feito: number, total: number) => {
  const agora = Date.now();
  if (agora - ultimo < 300 && feito < total) return;
  ultimo = agora;
  ctx.postMessage({ tipo: 'andamento', feito, total });
};

ctx.onmessage = async (ev: MessageEvent<{ arquivo: File }>) => {
  const { arquivo } = ev.data;
  try {
    const inicio = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
    if (!ehBackupCustom(inicio)) { ctx.postMessage({ tipo: 'fim', naoEhBackup: true }); return; }
    const { ler, descompactar } = leitoresDoNavegador(arquivo);
    const r = await extrairTabelasContabeis(ler, arquivo.size, descompactar, avisar);
    ctx.postMessage({ tipo: 'fim', blob: new Blob(r.partes as BlobPart[], { type: 'text/plain' }) });
  } catch (e: any) {
    ctx.postMessage({ tipo: 'erro', motivo: e?.message || 'Não foi possível abrir o backup neste aparelho.' });
  }
};
