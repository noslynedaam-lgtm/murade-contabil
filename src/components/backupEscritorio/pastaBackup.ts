// Guardar o backup "no meu computador" sem instalar programa: no Chrome/Edge (computador), a pessoa escolhe UMA vez a
// pasta (ex.: Documentos\Backup Murade). O navegador guarda essa autorização (IndexedDB) e, enquanto o sistema estiver
// aberto, grava lá sozinho cada backup novo e avisa "salvo na sua pasta". Sem o sistema aberto (ou em navegador sem
// esse recurso, como Safari/Firefox e celulares), o backup fica na lista para baixar. Igual nos três sistemas Murade.
import { perguntar } from './perguntaNaTela';

const BANCO = 'murade-backup-pasta';
const LOJA = 'kv';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(LOJA); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function ler<T>(chave: string): Promise<T | undefined> {
  const db = await abrir();
  return new Promise((ok, erro) => { const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave); r.onsuccess = () => ok(r.result as T); r.onerror = () => erro(r.error); });
}
async function gravar(chave: string, valor: unknown): Promise<void> {
  const db = await abrir();
  return new Promise((ok, erro) => { const tx = db.transaction(LOJA, 'readwrite'); tx.objectStore(LOJA).put(valor, chave); tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); });
}
async function tirarChave(chave: string): Promise<void> {
  const db = await abrir();
  return new Promise((ok, erro) => { const tx = db.transaction(LOJA, 'readwrite'); tx.objectStore(LOJA).delete(chave); tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); });
}

export const pastaSuportada = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof indexedDB !== 'undefined';

export interface EstadoPasta { suportado: boolean; nome: string | null; permissao: 'granted' | 'prompt' | 'denied' | null; desde: string | null }

export async function estadoPasta(sistema: string): Promise<EstadoPasta> {
  if (!pastaSuportada()) return { suportado: false, nome: null, permissao: null, desde: null };
  try {
    const h = await ler<any>(`${sistema}:pasta`);
    if (!h) return { suportado: true, nome: null, permissao: null, desde: null };
    const permissao = typeof h.queryPermission === 'function' ? await h.queryPermission({ mode: 'readwrite' }) : 'prompt';
    return { suportado: true, nome: String(h.name || ''), permissao, desde: (await ler<string>(`${sistema}:desde`)) ?? null };
  } catch { return { suportado: true, nome: null, permissao: null, desde: null }; }
}

/** Abre a janela do Windows/Mac para escolher a pasta. Precisa ser chamado pelo clique da pessoa. */
export async function escolherPasta(sistema: string): Promise<EstadoPasta> {
  const h = await (window as any).showDirectoryPicker({ id: `murade-${sistema}-backup`, mode: 'readwrite', startIn: 'documents' });
  await gravar(`${sistema}:pasta`, h);
  if (!(await ler<string>(`${sistema}:desde`))) await gravar(`${sistema}:desde`, new Date(Date.now() - 24 * 3600_000).toISOString());
  return estadoPasta(sistema);
}

export async function esquecerPasta(sistema: string): Promise<void> {
  await tirarChave(`${sistema}:pasta`); await tirarChave(`${sistema}:desde`); await tirarChave(`${sistema}:salvos`);
}

/** Pede de novo a permissão (o navegador pede um clique depois de fechado e aberto). */
export async function liberarPasta(sistema: string): Promise<boolean> {
  const h = await ler<any>(`${sistema}:pasta`);
  if (!h || typeof h.requestPermission !== 'function') return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Grava na pasta os backups novos que ainda não foram gravados por este navegador. Devolve os nomes gravados. */
export async function sincronizarPasta(api: string, sistema: string): Promise<string[]> {
  const est = await estadoPasta(sistema);
  if (!est.nome || est.permissao !== 'granted') return [];
  const h = await ler<any>(`${sistema}:pasta`);
  const salvos = new Set((await ler<string[]>(`${sistema}:salvos`)) ?? []);
  const r = await fetch(`${api}/lista`, { credentials: 'include', cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d?.sucesso) return [];
  const desde = Date.parse(est.desde || '1970-01-01');
  const novos = (d.execucoes || []).filter((e: any) => e.status === 'ok' && e.temArquivo && !salvos.has(e.id) && Date.parse(e.iniciadoEm) >= desde).slice(0, 5);
  const gravados: string[] = [];
  for (const e of novos) {
    const arq = await fetch(`${api}/${e.id}/arquivo`, { credentials: 'include', cache: 'no-store' });
    if (!arq.ok) continue;
    const dados = await arq.blob();
    const nome = String(e.nomeArquivo || `${e.id}.murade`).replace(/[^A-Za-z0-9._-]/g, '');
    const f = await h.getFileHandle(nome, { create: true });
    const w = await f.createWritable();
    await w.write(dados); await w.close();
    salvos.add(e.id); gravados.push(nome);
    await gravar(`${sistema}:salvos`, [...salvos].slice(-500));
    await fetch(`${api}/${e.id}/salvo-na-pasta`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
  }
  return gravados;
}

/** Antes de sair do sistema: se o escritório ligou o aviso e o último backup é antigo, pergunta. true = pode sair. */
export async function confirmarSaidaComBackup(api: string): Promise<boolean> {
  try {
    const r = await fetch(`${api}/aviso?momento=sair`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    if (!r.ok || !d?.sucesso || !d.mostrar) return true;
    return perguntar({ titulo: 'Backup do escritório', texto: `${d.texto}\n\nNa tela Backup tem o botão "Fazer backup agora".`, sim: 'Sair mesmo assim', nao: 'Continuar no sistema' });
  } catch { return true; }
}
