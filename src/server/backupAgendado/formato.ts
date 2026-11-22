// Formato próprio do arquivo de backup do escritório: ".murade" (igual nos três sistemas Murade).
//
// Decisão do dono (22/11/2026): o backup é um arquivo em formato PRÓPRIO e CIFRADO, que só o Murade restaura — não é
// dump nem JSON legível por outro programa. A saída "aberta" dos dados continua sendo só pelos arquivos oficiais
// (SPED/ECD/EFD/eSocial/XML das notas), que são obrigação legal.
//
// Estrutura (tudo num arquivo só, para poder ser guardado no computador ou na nuvem e restaurado depois):
//
//   "MURADEBK" (8 bytes) | versão do formato (1 byte) | tamanho do cabeçalho (4 bytes, big-endian)
//   | cabeçalho (JSON, sem nenhum dado do escritório: sistema, id, tipo, datas, checksum)
//   | IV (12 bytes) | etiqueta GCM (16 bytes) | conteúdo cifrado
//
// - O conteúdo é um zip (compactado, DEFLATE) com o manifesto e as tabelas do escritório, cifrado com AES-256-GCM.
// - A chave é DO ESCRITÓRIO: HMAC-SHA256(segredo do servidor MURADE_BACKUP_MASTER_KEY, sistema + id do escritório).
//   Nunca é guardada; é recalculada quando precisa. Um arquivo de um escritório não abre na conta de outro.
// - O cabeçalho inteiro entra como dado autenticado (AAD) junto com o id do escritório: mexer em qualquer byte do
//   cabeçalho ou do conteúdo faz a abertura falhar.
// - O cabeçalho leva o SHA-256 do zip original (checksum conferido depois de decifrar) e uma "impressão" do escritório
//   (hash curto do id), para dizer "este arquivo é de outro escritório" sem precisar tentar decifrar.
import { createCipheriv, createDecipheriv, createHash, createHmac } from 'crypto';
import { randomBytes } from 'crypto';

export const MAGIA = Buffer.from('MURADEBK', 'ascii');
export const VERSAO_FORMATO = 1;
export const EXTENSAO = '.murade';
export const FORMATO_CONTEUDO = 'murade-backup-escritorio';

export type SistemaMurade = 'dp' | 'fiscal' | 'contabil';

export interface CabecalhoBackup {
  formato: typeof FORMATO_CONTEUDO;
  versao: number;
  sistema: SistemaMurade;
  id: string;
  tipo: 'completo' | 'alteracoes';
  /** Backup completo em que este "só alterações" se baseia (precisa dele para restaurar). */
  baseId: string | null;
  criadoEm: string;
  /** Impressão do escritório (16 hex do SHA-256 do id) — não identifica ninguém, só confere a conta. */
  escritorio: string;
  sha256Conteudo: string;
  tamanhoConteudo: number;
}

export function chaveMestra(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const valor = env.MURADE_BACKUP_MASTER_KEY?.trim();
  if (!valor) return null;
  if (/^[a-f0-9]{64}$/i.test(valor)) return Buffer.from(valor, 'hex');
  try {
    const chave = Buffer.from(valor, 'base64');
    return chave.length === 32 && chave.toString('base64') === valor ? chave : null;
  } catch { return null; }
}

export const chaveMestraConfigurada = (env: NodeJS.ProcessEnv = process.env): boolean => Boolean(chaveMestra(env));

/** Chave de um uso específico ("arquivo" ou "nuvem") de um escritório num sistema. */
export function chaveDoEscritorio(sistema: SistemaMurade, uso: 'arquivo' | 'nuvem', tenantId: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const mestra = chaveMestra(env);
  if (!mestra) throw new Error('Configure MURADE_BACKUP_MASTER_KEY (segredo de 32 bytes, em hexadecimal ou base64) no Render para ativar os backups cifrados.');
  return createHmac('sha256', mestra).update(`murade-${sistema}-backup-agendado-v1:${uso}:${tenantId}`).digest();
}

export const impressaoEscritorio = (tenantId: string): string => createHash('sha256').update(`murade-escritorio:${tenantId}`).digest('hex').slice(0, 16);

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

function aad(cabecalhoBytes: Buffer, tenantId: string): Buffer {
  return Buffer.concat([MAGIA, Buffer.from([VERSAO_FORMATO]), cabecalhoBytes, Buffer.from(`:${tenantId}`, 'utf8')]);
}

/** Monta o arquivo .murade a partir do zip já pronto. */
export function selarArquivo(
  conteudo: Buffer, dados: Omit<CabecalhoBackup, 'formato' | 'versao' | 'escritorio' | 'sha256Conteudo' | 'tamanhoConteudo'>, tenantId: string, env: NodeJS.ProcessEnv = process.env,
): { arquivo: Buffer; cabecalho: CabecalhoBackup } {
  const cabecalho: CabecalhoBackup = { formato: FORMATO_CONTEUDO, versao: VERSAO_FORMATO, ...dados, escritorio: impressaoEscritorio(tenantId), sha256Conteudo: sha256(conteudo), tamanhoConteudo: conteudo.length };
  const cabecalhoBytes = Buffer.from(JSON.stringify(cabecalho), 'utf8');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDoEscritorio(dados.sistema, 'arquivo', tenantId, env), iv);
  c.setAAD(aad(cabecalhoBytes, tenantId));
  const cifrado = Buffer.concat([c.update(conteudo), c.final()]);
  const tam = Buffer.alloc(4); tam.writeUInt32BE(cabecalhoBytes.length);
  return { arquivo: Buffer.concat([MAGIA, Buffer.from([VERSAO_FORMATO]), tam, cabecalhoBytes, iv, c.getAuthTag(), cifrado]), cabecalho };
}

export class ErroArquivoBackup extends Error {
  constructor(mensagem: string, readonly codigo: 'nao_e_murade' | 'outra_versao' | 'outro_sistema' | 'outro_escritorio' | 'corrompido') { super(mensagem); this.name = 'ErroArquivoBackup'; }
}

/** Lê só o cabeçalho (não decifra). Serve para conferir sistema/escritório antes de abrir. */
export function lerCabecalho(arquivo: Buffer): CabecalhoBackup {
  if (arquivo.length < 13 || !arquivo.subarray(0, 8).equals(MAGIA)) throw new ErroArquivoBackup('Este arquivo não é um backup do Murad (.murade).', 'nao_e_murade');
  if (arquivo[8] !== VERSAO_FORMATO) throw new ErroArquivoBackup(`Este backup é de uma versão do formato que este sistema não conhece (${arquivo[8]}).`, 'outra_versao');
  const tam = arquivo.readUInt32BE(9);
  if (tam < 2 || tam > 64 * 1024 || 13 + tam + 28 > arquivo.length) throw new ErroArquivoBackup('O arquivo de backup está incompleto ou corrompido.', 'corrompido');
  try {
    const cab = JSON.parse(arquivo.subarray(13, 13 + tam).toString('utf8'));
    if (cab?.formato !== FORMATO_CONTEUDO) throw new Error('formato');
    return cab as CabecalhoBackup;
  } catch { throw new ErroArquivoBackup('O cabeçalho do arquivo de backup está corrompido.', 'corrompido'); }
}

/** Abre o arquivo: confere sistema e escritório, decifra (a etiqueta GCM detecta qualquer alteração) e confere o checksum. */
export function abrirArquivo(arquivo: Buffer, sistema: SistemaMurade, tenantId: string, env: NodeJS.ProcessEnv = process.env): { cabecalho: CabecalhoBackup; conteudo: Buffer } {
  const cabecalho = lerCabecalho(arquivo);
  const nomes: Record<string, string> = { dp: 'Murad DP', fiscal: 'Murad Fiscal', contabil: 'Murad Contábil' };
  if (cabecalho.sistema !== sistema) throw new ErroArquivoBackup(`Este backup é do ${nomes[cabecalho.sistema] || 'outro sistema'}; restaure-o lá.`, 'outro_sistema');
  if (cabecalho.escritorio !== impressaoEscritorio(tenantId)) throw new ErroArquivoBackup('Este backup é de outro escritório e não pode ser aberto nesta conta.', 'outro_escritorio');
  const tam = arquivo.readUInt32BE(9);
  const cabecalhoBytes = arquivo.subarray(13, 13 + tam);
  const iv = arquivo.subarray(13 + tam, 13 + tam + 12);
  const tag = arquivo.subarray(13 + tam + 12, 13 + tam + 28);
  const cifrado = arquivo.subarray(13 + tam + 28);
  let conteudo: Buffer;
  try {
    const d = createDecipheriv('aes-256-gcm', chaveDoEscritorio(sistema, 'arquivo', tenantId, env), iv);
    d.setAAD(aad(cabecalhoBytes, tenantId));
    d.setAuthTag(tag);
    conteudo = Buffer.concat([d.update(cifrado), d.final()]);
  } catch { throw new ErroArquivoBackup('O arquivo de backup foi alterado ou está corrompido (a conferência da criptografia falhou).', 'corrompido'); }
  if (sha256(conteudo) !== cabecalho.sha256Conteudo || conteudo.length !== cabecalho.tamanhoConteudo) throw new ErroArquivoBackup('O checksum do backup não confere.', 'corrompido');
  return { cabecalho, conteudo };
}

/** Nome do arquivo: sistema, data/hora de Brasília, tipo e um pedaço do id. Sem a palavra "backup" (dificulta vírus que procuram backups pelo nome). */
export function nomeArquivo(sistema: SistemaMurade, tipo: 'completo' | 'alteracoes', criadoEm: Date, id: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(criadoEm);
  const v: Record<string, string> = {};
  for (const x of p) v[x.type] = x.value;
  return `murade-${sistema}-${v.year}${v.month}${v.day}-${v.hour}${v.minute}-${tipo}-${id.replace(/-/g, '').slice(0, 8)}${EXTENSAO}`;
}

// ===== Cofre das chaves da nuvem do cliente (cifradas com a chave do escritório; nunca voltam para a tela) =====

export function cifrarSegredo(sistema: SistemaMurade, tenantId: string, valor: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDoEscritorio(sistema, 'nuvem', tenantId, env), iv);
  c.setAAD(Buffer.from(`nuvem:${tenantId}`));
  const cifrado = Buffer.concat([c.update(Buffer.from(JSON.stringify(valor), 'utf8')), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${cifrado.toString('base64')}`;
}

export function decifrarSegredo<T = any>(sistema: SistemaMurade, tenantId: string, texto: string, env: NodeJS.ProcessEnv = process.env): T {
  const [v, iv, tag, dados] = String(texto || '').split('.');
  if (v !== 'v1' || !iv || !tag || !dados) throw new Error('Chaves da nuvem gravadas em formato desconhecido.');
  const d = createDecipheriv('aes-256-gcm', chaveDoEscritorio(sistema, 'nuvem', tenantId, env), Buffer.from(iv, 'base64'));
  d.setAAD(Buffer.from(`nuvem:${tenantId}`));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8')) as T;
}
