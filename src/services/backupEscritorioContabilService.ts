// Backup mensal, criptografado e isolado por escritório, do Contábil.
//
// Mesma lógica já em produção no Murade Fiscal (src/services/backupEscritorioFiscalService.ts, commit 84ee69f),
// adaptada aos dados reais do Contábil:
// - Armazenamento: bytea no próprio Postgres do Render (murade_contabil_backups) — mesma razão do Fiscal: este
//   serviço não tem disco persistente nem SDK de nuvem configurado, então o Postgres é o único armazenamento
//   durável já disponível. Se um dia houver object storage, trocar só `INSERT`/`SELECT` abaixo.
// - Isolamento: cada escritório (tenant_id = id do usuário administrador dono do escritório, igual ao resto do
//   Contábil — ver authContabil.ts) só lê/baixa os próprios backups porque toda consulta de leitura filtra por
//   tenant_id no próprio SQL (não só na rota). Cada backup contém só os CNPJs vinculados àquele escritório
//   (contabil_auth_company_access.user_id = tenantId, igual à sessão).
// - Criptografia: AES-256-GCM com chave derivada por escritório — HMAC-SHA256(MURADE_BACKUP_MASTER_KEY,
//   "murade-contabil-backup-v1:"+tenantId). A chave nunca é persistida: é recalculada sempre que preciso. AAD
//   amarra o texto cifrado ao escritório e ao período, então um arquivo cifrado não pode ser reaproveitado para
//   outro escritório/mês mesmo que alguém troque os bytes de lugar.
// - Disfarce do arquivo: nome aleatório (sem "backup"/"dump"/"sql"/"bak") com extensão própria .mcbx.
// - Conteúdo: cadastro de empresas (contabil_empresas_compartilhadas), o workspace contábil completo de cada
//   empresa — plano de contas, lançamentos, pré-lançamentos, bens do imobilizado, centros de custo, livros e os
//   dados/status de ECD e ECF já gerados (contabil_company_workspaces.payload) —, fechamentos de competência,
//   aprovações e auditoria de lançamentos manuais/saldo inicial (demonstrativos e rastro de alterações) e a
//   equipe/acessos do próprio escritório. NÃO inclui o certificado digital A1 nem a senha dele: o cadastro é só
//   informativo (ver CertificadoDigitalModal.tsx, que nunca persiste a senha) e, por segurança extra, os campos
//   "certificado*" são removidos do cadastro da empresa antes de empacotar. Este módulo só LÊ essas tabelas
//   (nenhum INSERT/UPDATE/DELETE nelas) — nunca mexe em lançamento, cadastro de empresa nem nota fiscal.
// - Retenção: mantém os últimos 12 períodos (meses) por escritório; mais antigo que isso é apagado automaticamente
//   depois de cada geração.
import JSZip from 'jszip';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { prepararAuthContabil } from '../server/authContabil';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

const FORMATO_BACKUP = 'murade-contabil-backup-escritorio';
const VERSAO_BACKUP = 1;
export const RETENCAO_MESES = 12;
/** Extensão própria e sem relação óbvia com "backup"/"dump"/"sql"/"bak". */
export const EXTENSAO_BACKUP = '.mcbx';

export interface RegistroBackup {
  id: string;
  periodo: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  checksumSha256: string;
  tabelas: Record<string, number>;
  status: 'ok' | 'falha';
  verificado: boolean;
  erro: string | null;
  criadoEm: string;
}

export interface ResultadoGeracao {
  criado: boolean;
  motivo: 'gerado' | 'ja_existe' | 'sem_empresas';
  registro?: RegistroBackup;
}

// ===== Chave mestra e derivação por escritório =====

/** Aceita a chave em hexadecimal (64 caracteres = 32 bytes) ou em base64 (32 bytes) — mesmo padrão do Fiscal. */
function obterChaveMestraBackup(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const valor = env.MURADE_BACKUP_MASTER_KEY?.trim();
  if (!valor) return null;
  if (/^[a-f0-9]{64}$/i.test(valor)) return Buffer.from(valor, 'hex');
  try {
    const chave = Buffer.from(valor, 'base64');
    return chave.length === 32 && chave.toString('base64') === valor ? chave : null;
  } catch {
    return null;
  }
}

export const backupMasterKeyConfigurada = (env: NodeJS.ProcessEnv = process.env): boolean => Boolean(obterChaveMestraBackup(env));

/** Chave AES-256 de um escritório: HMAC-SHA256(chave mestra do servidor, id do escritório). Nunca é guardada; é
 * recalculada sempre que preciso cifrar ou decifrar o backup daquele escritório. */
function chaveDoEscritorio(tenantId: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const mestra = obterChaveMestraBackup(env);
  if (!mestra) throw new Error('Configure MURADE_BACKUP_MASTER_KEY (segredo de 32 bytes, em hexadecimal ou base64) no Render para ativar os backups criptografados.');
  return createHmac('sha256', mestra).update(`murade-contabil-backup-v1:${tenantId}`).digest();
}

function aad(tenantId: string, periodo: string): Buffer {
  return Buffer.from(`murade-contabil-backup-v1:${tenantId}:${periodo}`, 'utf8');
}

function cifrar(conteudo: Buffer, tenantId: string, periodo: string, env: NodeJS.ProcessEnv): { iv: Buffer; tag: Buffer; cifrado: Buffer } {
  const chave = chaveDoEscritorio(tenantId, env);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);
  cipher.setAAD(aad(tenantId, periodo));
  const cifrado = Buffer.concat([cipher.update(conteudo), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), cifrado };
}

function decifrar(cifrado: Buffer, iv: Buffer, tag: Buffer, tenantId: string, periodo: string, env: NodeJS.ProcessEnv): Buffer {
  const chave = chaveDoEscritorio(tenantId, env);
  const decipher = createDecipheriv('aes-256-gcm', chave, iv);
  decipher.setAAD(aad(tenantId, periodo));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]);
}

/** Nome de exibição/download do arquivo: hexadecimal aleatório + extensão própria. Sem nenhuma palavra que
 * identifique "backup", "banco" ou similar. */
export function nomeArquivoBackup(): string {
  return `${randomBytes(8).toString('hex')}${EXTENSAO_BACKUP}`;
}

export function periodoDe(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ===== Esquema (só a tabela própria do backup; as tabelas de origem já são garantidas por prepararAuthContabil) =====

let tabelaPronta: Promise<void> | null = null;
export function garantirTabelaBackups(consultar: Consultar): Promise<void> {
  tabelaPronta ??= consultar(`
    CREATE TABLE IF NOT EXISTS murade_contabil_backups (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      periodo char(7) NOT NULL,
      nome_arquivo text NOT NULL,
      iv text NOT NULL,
      tag text NOT NULL,
      conteudo_cifrado bytea NOT NULL,
      tamanho_bytes integer NOT NULL,
      checksum_sha256 char(64) NOT NULL,
      tabelas jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'ok',
      verificado boolean NOT NULL DEFAULT false,
      erro text,
      criado_em timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, periodo)
    )
  `).then(() => undefined).catch((e) => { tabelaPronta = null; throw e; });
  return tabelaPronta;
}

/** Somente para testes: cada teste cria seu próprio banco de mentira, então a promessa cacheada de outro banco
 * precisa ser limpa antes de usar um novo. */
export function limparCacheBackupsParaTeste(): void {
  tabelaPronta = null;
}

// ===== Leitura dos dados do escritório (sempre filtrada por CNPJ ou tenant_id — nunca lê outro escritório) =====

function clausulaIn(coluna: string, valores: string[]): { sql: string; valores: string[] } {
  if (!valores.length) return { sql: '(1=0)', valores: [] };
  return { sql: `${coluna} IN (${valores.map((_, i) => `$${i + 1}`).join(',')})`, valores };
}

async function obterCnpjsDoEscritorio(consultar: Consultar, tenantId: string): Promise<string[]> {
  const r = await consultar('SELECT DISTINCT cnpj FROM contabil_auth_company_access WHERE user_id = $1 ORDER BY cnpj', [tenantId]);
  return r.rows.map((x: any) => String(x.cnpj).trim());
}

async function tabelaPorCnpj(consultar: Consultar, sqlBase: string, coluna: string, cnpjs: string[]): Promise<any[]> {
  if (!cnpjs.length) return [];
  const { sql, valores } = clausulaIn(coluna, cnpjs);
  const r = await consultar(`${sqlBase} WHERE ${sql}`, valores);
  return r.rows;
}

/** Remove do cadastro da empresa qualquer campo "certificado*" (cadastro informativo do certificado A1 — nunca
 * guarda senha, mas por segurança extra nem o metadado entra no backup). Nunca altera o workspace de verdade:
 * trabalha só numa cópia em memória. */
export function removerCamposCertificado(valor: any): any {
  if (Array.isArray(valor)) return valor.map(removerCamposCertificado);
  if (valor && typeof valor === 'object') {
    const copia: Record<string, any> = {};
    for (const [chave, item] of Object.entries(valor)) {
      if (/^certificado/i.test(chave)) continue;
      copia[chave] = removerCamposCertificado(item);
    }
    return copia;
  }
  return valor;
}

async function coletarDadosDoEscritorio(consultar: Consultar, tenantId: string, cnpjs: string[]): Promise<Record<string, any[]>> {
  const tenantParam = [tenantId];

  const [
    empresas, workspacesBrutos, fechamentosPeriodo, aprovacoesLancamentos,
    auditoriaLancamentosManuais, eventosLancamentosManuais, auditoriaSaldoInicial,
    equipe, acessosEmpresas,
  ] = await Promise.all([
    tabelaPorCnpj(consultar, 'SELECT cnpj, dados, updated_at FROM contabil_empresas_compartilhadas', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT cnpj, payload, version, updated_at FROM contabil_company_workspaces', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT cnpj, competencia, login, fechado_em, quantidade_lancamentos, total_debitos FROM contabil_period_closures', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT cnpj, referencia, login, valor, conta_debito, conta_credito, aprovado_em FROM contabil_accounting_approval_audit', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT cnpj, lancamento_id, evento, login, lancamento, registrado_em FROM contabil_manual_journal_audit', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT evento_id, cnpj, lancamento_id, evento, login, lancamento, motivo, registrado_em FROM contabil_manual_journal_events', 'cnpj', cnpjs),
    tabelaPorCnpj(consultar, 'SELECT cnpj, conta_codigo, evento, saldo_anterior, saldo_novo, competencia, login, registrado_em FROM contabil_opening_balance_audit', 'cnpj', cnpjs),
    consultar('SELECT id, login, disabled, global_admin, created_at, max_usuarios FROM contabil_auth_users WHERE tenant_id = $1 ORDER BY login', tenantParam).then((r) => r.rows),
    consultar('SELECT cnpj, role FROM contabil_auth_company_access WHERE user_id = $1 ORDER BY cnpj', tenantParam).then((r) => r.rows),
  ]);

  // Plano de contas, lançamentos, pré-lançamentos, bens do imobilizado, livros e status/dados de ECD e ECF já
  // gerados vêm todos dentro do próprio workspace (payload jsonb) de cada empresa; aqui só se tira o cadastro
  // informativo do certificado A1 antes de empacotar.
  const workspaces = workspacesBrutos.map((w: any) => ({
    cnpj: w.cnpj, payload: removerCamposCertificado(w.payload || {}), version: w.version, atualizadoEm: w.updated_at,
  }));
  const empresasSemCertificado = empresas.map((e: any) => ({ cnpj: e.cnpj, dados: removerCamposCertificado(e.dados || {}), atualizadoEm: e.updated_at }));

  return {
    empresas: empresasSemCertificado,
    workspaces_contabeis: workspaces,
    fechamentos_periodo: fechamentosPeriodo,
    aprovacoes_lancamentos: aprovacoesLancamentos,
    auditoria_lancamentos_manuais: auditoriaLancamentosManuais,
    eventos_lancamentos_manuais: eventosLancamentosManuais,
    auditoria_saldo_inicial: auditoriaSaldoInicial,
    equipe, acessos_empresas: acessosEmpresas,
  };
}

// ===== Empacotamento (zip) =====

async function montarZip(tenantId: string, periodo: string, geradoEm: string, tabelas: Record<string, any[]>): Promise<Buffer> {
  const zip = new JSZip();
  const contagens: Record<string, number> = {};
  for (const [nome, linhas] of Object.entries(tabelas)) {
    contagens[nome] = linhas.length;
    zip.file(`dados/${nome}.json`, JSON.stringify(linhas, null, 0));
  }
  const manifesto = { formato: FORMATO_BACKUP, versao: VERSAO_BACKUP, tenantId, periodo, geradoEm, tabelas: contagens };
  zip.file('manifesto.json', JSON.stringify(manifesto, null, 2));
  zip.file('LEIA-ME.txt', [
    'Backup mensal do Murade Contábil — dados deste escritório, só dele.',
    `Período: ${periodo}. Gerado em: ${geradoEm}.`,
    'Este arquivo está cifrado (AES-256-GCM) com uma chave ligada à conta deste escritório; abrir fora do sistema Murade não é possível.',
    'Não contém o certificado digital A1 nem senha dele.',
    'Para restaurar ou consultar o conteúdo, use a tela "Backups" dentro do Murade Contábil.',
  ].join('\n'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ===== Geração, verificação e gravação =====

async function gerarENaoGravarSeJaExiste(
  consultar: Consultar, tenantId: string, periodo: string,
): Promise<RegistroBackup | null> {
  const r = await consultar(
    `SELECT id, periodo, nome_arquivo, tamanho_bytes, checksum_sha256, tabelas, status, verificado, erro, criado_em
     FROM murade_contabil_backups WHERE tenant_id = $1 AND periodo = $2 AND status = 'ok' AND verificado = true`,
    [tenantId, periodo],
  );
  const linha = r.rows[0];
  return linha ? linhaParaRegistro(linha) : null;
}

function linhaParaRegistro(linha: any): RegistroBackup {
  return {
    id: String(linha.id), periodo: String(linha.periodo), nomeArquivo: String(linha.nome_arquivo),
    tamanhoBytes: Number(linha.tamanho_bytes), checksumSha256: String(linha.checksum_sha256),
    tabelas: linha.tabelas && typeof linha.tabelas === 'object' ? linha.tabelas : JSON.parse(linha.tabelas || '{}'),
    status: linha.status === 'falha' ? 'falha' : 'ok', verificado: linha.verificado === true,
    erro: linha.erro ?? null, criadoEm: new Date(linha.criado_em).toISOString(),
  };
}

/**
 * Gera (se ainda não existir, verificado, para este período) o backup mensal de um escritório: lê os dados próprios
 * dele, empacota, cifra, grava e confere lendo e decifrando de volta antes de considerar "pronto". Se a geração ou a
 * conferência falhar, nada fica gravado como se tivesse dado certo — quem chamar (robô ou rota manual) deve tentar
 * de novo depois; o robô conferidor faz isso sozinho na próxima rodada.
 */
export async function gerarBackupEscritorio(
  consultar: Consultar, tenantId: string, periodo: string, agora: Date = new Date(), env: NodeJS.ProcessEnv = process.env,
): Promise<ResultadoGeracao> {
  await garantirTabelaBackups(consultar);
  const existente = await gerarENaoGravarSeJaExiste(consultar, tenantId, periodo);
  if (existente) return { criado: false, motivo: 'ja_existe', registro: existente };

  await prepararAuthContabil();
  const cnpjs = await obterCnpjsDoEscritorio(consultar, tenantId);
  if (!cnpjs.length) return { criado: false, motivo: 'sem_empresas' };

  const tabelas = await coletarDadosDoEscritorio(consultar, tenantId, cnpjs);
  const geradoEm = agora.toISOString();
  const zipBuffer = await montarZip(tenantId, periodo, geradoEm, tabelas);
  const checksum = createHash('sha256').update(zipBuffer).digest('hex');
  const { iv, tag, cifrado } = cifrar(zipBuffer, tenantId, periodo, env);
  const id = randomUUID();
  const nomeArquivo = nomeArquivoBackup();
  const contagens = Object.fromEntries(Object.entries(tabelas).map(([nome, linhas]) => [nome, linhas.length]));

  await consultar(
    `INSERT INTO murade_contabil_backups (id, tenant_id, periodo, nome_arquivo, iv, tag, conteudo_cifrado, tamanho_bytes, checksum_sha256, tabelas, status, verificado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ok',false)`,
    [id, tenantId, periodo, nomeArquivo, iv.toString('hex'), tag.toString('hex'), cifrado, cifrado.length, checksum, JSON.stringify(contagens)],
  );

  try {
    await conferirIntegridadeBackup(consultar, tenantId, id, periodo, env);
    await consultar('UPDATE murade_contabil_backups SET verificado = true WHERE id = $1', [id]);
    await prunarBackupsAntigos(consultar, tenantId);
    return {
      criado: true, motivo: 'gerado',
      registro: { id, periodo, nomeArquivo, tamanhoBytes: cifrado.length, checksumSha256: checksum, tabelas: contagens, status: 'ok', verificado: true, erro: null, criadoEm: geradoEm },
    };
  } catch (erro: any) {
    const mensagem = String(erro?.message || 'Falha ao conferir o backup gerado.').slice(0, 300);
    // Não deixa um backup quebrado parecendo pronto: marca falha explicitamente e remove o conteúdo cifrado
    // (mantém só o registro da tentativa, para o histórico/robô saberem que falhou e tentarem de novo).
    await consultar(
      `UPDATE murade_contabil_backups SET status='falha', verificado=false, erro=$2, conteudo_cifrado=$3, tamanho_bytes=0 WHERE id = $1`,
      [id, mensagem, Buffer.alloc(0)],
    );
    throw new Error(`Backup de ${periodo} gerado, mas a conferência falhou: ${mensagem}`);
  }
}

/** Lê de volta o backup recém-gravado, decifra e reabre o zip, conferindo que o checksum e a lista de tabelas
 * batem com o que foi gerado. É a "conferência de verdade" exigida antes de considerar o backup pronto. */
async function conferirIntegridadeBackup(consultar: Consultar, tenantId: string, id: string, periodo: string, env: NodeJS.ProcessEnv): Promise<void> {
  const r = await consultar('SELECT iv, tag, conteudo_cifrado, checksum_sha256 FROM murade_contabil_backups WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  const linha = r.rows[0];
  if (!linha) throw new Error('Registro do backup não encontrado após a gravação.');
  const cifrado = Buffer.isBuffer(linha.conteudo_cifrado) ? linha.conteudo_cifrado : Buffer.from(linha.conteudo_cifrado);
  const plano = decifrar(cifrado, Buffer.from(String(linha.iv), 'hex'), Buffer.from(String(linha.tag), 'hex'), tenantId, periodo, env);
  const checksumConferido = createHash('sha256').update(plano).digest('hex');
  if (checksumConferido !== String(linha.checksum_sha256)) throw new Error('O checksum do conteúdo decifrado não bate com o checksum gravado.');
  const zip = await JSZip.loadAsync(plano);
  if (!zip.files['manifesto.json']) throw new Error('O manifesto não foi encontrado dentro do backup decifrado.');
  const manifesto = JSON.parse(await zip.files['manifesto.json'].async('string'));
  if (manifesto.formato !== FORMATO_BACKUP || manifesto.tenantId !== tenantId || manifesto.periodo !== periodo) {
    throw new Error('O manifesto do backup decifrado não corresponde ao escritório/período esperado.');
  }
}

/** Mantém só os últimos RETENCAO_MESES períodos de cada escritório; o resto é apagado. */
export async function prunarBackupsAntigos(consultar: Consultar, tenantId: string): Promise<number> {
  const r = await consultar(
    `DELETE FROM murade_contabil_backups WHERE tenant_id = $1 AND id NOT IN (
       SELECT id FROM murade_contabil_backups WHERE tenant_id = $1 ORDER BY periodo DESC LIMIT $2
     )`,
    [tenantId, RETENCAO_MESES],
  );
  return r.rowCount ?? 0;
}

// ===== Leitura para a tela "Backups" (nunca devolve o conteúdo cifrado na listagem) =====

export async function listarBackupsEscritorio(consultar: Consultar, tenantId: string): Promise<RegistroBackup[]> {
  await garantirTabelaBackups(consultar);
  const r = await consultar(
    `SELECT id, periodo, nome_arquivo, tamanho_bytes, checksum_sha256, tabelas, status, verificado, erro, criado_em
     FROM murade_contabil_backups WHERE tenant_id = $1 ORDER BY periodo DESC`,
    [tenantId],
  );
  return r.rows.map(linhaParaRegistro);
}

/** Só devolve o arquivo se ele pertencer ao escritório informado — o filtro por tenant_id está no próprio SQL,
 * então nem um erro na rota conseguiria devolver o backup de outro escritório. */
export async function baixarBackupEscritorio(consultar: Consultar, tenantId: string, id: string): Promise<{ nomeArquivo: string; conteudo: Buffer } | null> {
  await garantirTabelaBackups(consultar);
  const r = await consultar(
    `SELECT nome_arquivo, conteudo_cifrado FROM murade_contabil_backups WHERE id = $1 AND tenant_id = $2 AND status = 'ok' AND verificado = true`,
    [id, tenantId],
  );
  const linha = r.rows[0];
  if (!linha) return null;
  const conteudo = Buffer.isBuffer(linha.conteudo_cifrado) ? linha.conteudo_cifrado : Buffer.from(linha.conteudo_cifrado);
  return { nomeArquivo: String(linha.nome_arquivo), conteudo };
}
