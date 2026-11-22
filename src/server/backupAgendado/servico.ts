// Backup agendado do escritório — serviço comum aos três sistemas Murade (DP, Fiscal e Contábil).
//
// O que faz (cada escritório só enxerga e mexe no que é dele; toda consulta filtra por tenant_id no próprio SQL):
//  - guarda a agenda (vários perfis: todo dia / toda semana / todo mês, completo ou só alterações, horário) e as
//    opções (retenção, conferência, avisos, e-mail, pasta do computador, nuvem do cliente compatível com S3);
//  - gera o backup no formato próprio .murade (cifrado com a chave do escritório), confere logo depois (abre, decifra,
//    checksum, contagens) e guarda o arquivo no próprio banco do Murade pelo tempo da retenção;
//  - envia a cópia para a nuvem do cliente (Backblaze B2, Cloudflare R2, AWS S3, Wasabi...) e confere o tamanho lá;
//  - avisa por e-mail (sucesso e/ou erro, com Para e Cc) e na entrada/saída do sistema ("seu último backup foi há X dias");
//  - restaura um backup (do histórico, da nuvem ou de um arquivo .murade do computador) com prévia do que muda,
//    cópia de segurança automática antes e duas confirmações — só o administrador do escritório.
// Nunca envia dado de um escritório para outro: o arquivo só abre com a chave daquele escritório.
import { randomBytes, randomUUID } from 'crypto';
import JSZip from 'jszip';
import {
  configPadrao, normalizarConfig, perfisDevidos, escolherExecucao, ultimaOcorrencia, proximaOcorrencia, descreverPerfil,
  validarPerfil, dataHoraBrasilia, MAX_TENTATIVAS_POR_OCORRENCIA, type ConfigBackup, type ConfigNuvemPublica, type TipoBackup,
} from './agenda';
import {
  abrirArquivo, cifrarSegredo, decifrarSegredo, lerCabecalho, nomeArquivo, selarArquivo, sha256, chaveMestraConfigurada,
  ErroArquivoBackup, type SistemaMurade,
} from './formato';
import { lerConteudo, montarConteudo, reconstruir, type ConteudoLido, type Indice, type TabelasEscritorio } from './conteudo';
import { idsParaRemover, LIMITE_SERVIDOR, type ItemRetencao } from './retencao';
import { ClienteS3 } from './s3';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export interface TabelaRestauracao { nome: string; titulo: string; modo: 'sobrescrever' | 'so_faltantes' }
export interface ItemPrevia {
  nome: string; titulo: string; modo: 'sobrescrever' | 'so_faltantes';
  noBackup: number; iguais: number; alterar: number; recriar: number;
  /** Registros que existem hoje e não estavam no backup: ficam como estão (o Murade não apaga na restauração). */
  ficamComoEstao: number;
  /** Empresas do backup que não estão mais no escritório (não são restauradas). */
  foraDoEscritorio?: number;
  observacao?: string;
}
export interface AdaptadorRestauracao {
  tabelas: TabelaRestauracao[];
  /** O que o backup tem mas a restauração NÃO devolve, e por quê (aparece na prévia). */
  naoRestauradas: Array<{ nome: string; titulo: string; motivo: string }>;
  /** Compara (aplicar=false) ou grava (aplicar=true). Só mexe nos CNPJs do escritório informados. */
  executar(tenantId: string, cnpjs: string[], tabelas: Record<string, any[]>, aplicar: boolean): Promise<ItemPrevia[]>;
}

export interface ClienteNuvem {
  enviar(chave: string, corpo: Buffer, tipo?: string): Promise<void>;
  tamanho(chave: string): Promise<number | null>;
  apagar(chave: string): Promise<void>;
  lerBuffer(chave: string): Promise<Buffer>;
}
export interface CredenciaisNuvem { endpoint: string; bucket: string; regiao: string; pasta: string; chaveAcesso: string; chaveSecreta: string }

export interface AdaptadorSistema {
  sistema: SistemaMurade;
  nomeSistema: string;
  /** Prefixo das tabelas (ex.: "murade_dp" → murade_dp_bkp_agenda, murade_dp_bkp_execucoes, murade_dp_bkp_restauracoes). */
  prefixo: string;
  consultar: Consultar;
  cnpjsDoEscritorio(tenantId: string): Promise<string[]>;
  coletar(tenantId: string, cnpjs: string[]): Promise<TabelasEscritorio>;
  escritorios(): Promise<Array<{ id: string; login: string }>>;
  usuarios(tenantId: string): Promise<Array<{ login: string; administrador: boolean }>>;
  /** O backup mensal que já existia (continua igual): último feito e leitura do zip para restaurar. */
  mensal?: {
    listar(tenantId: string): Promise<Array<{ id: string; periodo: string; criadoEm: string; tamanhoBytes: number; ok: boolean }>>;
    lerZip(tenantId: string, id: string): Promise<Buffer | null>;
  };
  restauracao: AdaptadorRestauracao;
  email?: { configurado(): boolean; enviar(para: string, assunto: string, texto: string, cc?: string[]): Promise<void> };
  /** Testes trocam o cliente da nuvem por um de mentira. */
  criarClienteNuvem?: (c: CredenciaisNuvem) => ClienteNuvem;
  env?: NodeJS.ProcessEnv;
  agora?: () => Date;
}

export interface RegistroExecucao {
  id: string; tipo: TipoBackup; baseId: string | null; origem: string; perfilIds: string[]; usuario: string | null;
  agendadoPara: string | null; iniciadoEm: string; concluidoEm: string | null; status: 'executando' | 'ok' | 'falha';
  validado: boolean; validacao: string | null; tamanhoBytes: number; sha256Arquivo: string | null; contagens: Record<string, number>;
  nomeArquivo: string | null; temArquivo: boolean; removidoEm: string | null;
  nuvem: { status: string; chave: string | null; erro: string | null; enviadoEm: string | null; tentativas: number; removidoEm: string | null };
  salvoNaPastaEm: string | null; emailStatus: string | null; erro: string | null; observacao: string | null;
}

const MIN_EXECUTANDO_PRESO = 45;
const TTL_PREVIA_MS = 15 * 60_000;

function clienteS3Padrao(c: CredenciaisNuvem): ClienteNuvem {
  const s3 = new ClienteS3({ endpoint: c.endpoint, bucket: c.bucket, accessKey: c.chaveAcesso, secretKey: c.chaveSecreta, region: c.regiao || 'us-east-1' });
  return {
    enviar: (chave, corpo, tipo) => s3.enviar(chave, corpo, tipo),
    tamanho: (chave) => s3.tamanho(chave),
    apagar: (chave) => s3.apagar(chave),
    async lerBuffer(chave) {
      const { fluxo } = await s3.ler(chave);
      const partes: Buffer[] = [];
      for await (const p of fluxo) partes.push(Buffer.from(p));
      return Buffer.concat(partes);
    },
  };
}

const pastaSegura = (p: unknown): string => String(p ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.\.+/g, '').replace(/[^A-Za-z0-9/_\-. ]/g, '').slice(0, 120) || 'murade-backup';
const mascarar = (s: string): string => (s.length <= 4 ? '****' : `${s.slice(0, 4)}…${'*'.repeat(4)}`);

function linhaParaRegistro(l: any): RegistroExecucao {
  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  return {
    id: String(l.id), tipo: l.tipo === 'alteracoes' ? 'alteracoes' : 'completo', baseId: l.base_id ? String(l.base_id) : null, origem: String(l.origem),
    perfilIds: Array.isArray(l.perfil_ids) ? l.perfil_ids.map(String) : [], usuario: l.usuario ?? null, agendadoPara: iso(l.agendado_para),
    iniciadoEm: iso(l.iniciado_em)!, concluidoEm: iso(l.concluido_em), status: l.status, validado: l.validado === true, validacao: l.validacao ?? null,
    tamanhoBytes: Number(l.tamanho_bytes || 0), sha256Arquivo: l.sha256_arquivo ? String(l.sha256_arquivo) : null,
    contagens: l.contagens && typeof l.contagens === 'object' ? l.contagens : {}, nomeArquivo: l.nome_arquivo ?? null,
    temArquivo: l.tem_arquivo === true, removidoEm: iso(l.removido_em),
    nuvem: { status: String(l.nuvem_status || 'nao_configurada'), chave: l.nuvem_chave ?? null, erro: l.nuvem_erro ?? null, enviadoEm: iso(l.nuvem_enviado_em), tentativas: Number(l.nuvem_tentativas || 0), removidoEm: iso(l.nuvem_removido_em) },
    salvoNaPastaEm: iso(l.salvo_pasta_em), emailStatus: l.email_status ?? null, erro: l.erro ?? null, observacao: l.observacao ?? null,
  };
}

const COLUNAS = `id, tipo, base_id, origem, perfil_ids, usuario, agendado_para, iniciado_em, concluido_em, status, validado, validacao,
  tamanho_bytes, sha256_arquivo, contagens, nome_arquivo, (conteudo IS NOT NULL) AS tem_arquivo, removido_em, nuvem_status, nuvem_chave,
  nuvem_erro, nuvem_enviado_em, nuvem_tentativas, nuvem_removido_em, salvo_pasta_em, email_status, erro, observacao`;

export function criarServicoBackupAgendado(a: AdaptadorSistema) {
  const t = { agenda: `${a.prefixo}_bkp_agenda`, exec: `${a.prefixo}_bkp_execucoes`, rest: `${a.prefixo}_bkp_restauracoes` };
  const agora = () => (a.agora ? a.agora() : new Date());
  const env = a.env ?? process.env;
  const criarNuvem = a.criarClienteNuvem ?? clienteS3Padrao;
  const emAndamento = new Set<string>();
  const previas = new Map<string, { tenantId: string; login: string; origem: string; backupId: string | null; tabelas: Record<string, any[]>; criadoEm: number; cabecalho: { tipo: string; criadoEm: string } }>();

  let pronto: Promise<void> | null = null;
  const preparar = (): Promise<void> => {
    pronto ??= (async () => {
      await a.consultar(`CREATE TABLE IF NOT EXISTS ${t.agenda} (
        tenant_id text PRIMARY KEY, config jsonb NOT NULL, nuvem_cifrada text, atualizado_em timestamptz NOT NULL DEFAULT now(), atualizado_por text)`);
      await a.consultar(`CREATE TABLE IF NOT EXISTS ${t.exec} (
        id uuid PRIMARY KEY, tenant_id text NOT NULL, tipo text NOT NULL, base_id uuid, origem text NOT NULL, perfil_ids text[] NOT NULL DEFAULT '{}',
        usuario text, agendado_para timestamptz, iniciado_em timestamptz NOT NULL DEFAULT now(), concluido_em timestamptz,
        status text NOT NULL DEFAULT 'executando', validado boolean NOT NULL DEFAULT false, validacao text, tamanho_bytes bigint NOT NULL DEFAULT 0,
        sha256_arquivo char(64), contagens jsonb NOT NULL DEFAULT '{}'::jsonb, nome_arquivo text, conteudo bytea, removido_em timestamptz,
        nuvem_status text NOT NULL DEFAULT 'nao_configurada', nuvem_chave text, nuvem_erro text, nuvem_enviado_em timestamptz,
        nuvem_tentativas integer NOT NULL DEFAULT 0, nuvem_tentativa_em timestamptz, nuvem_removido_em timestamptz, salvo_pasta_em timestamptz,
        email_status text, erro text, observacao text)`);
      await a.consultar(`CREATE INDEX IF NOT EXISTS ${t.exec}_tenant_idx ON ${t.exec} (tenant_id, iniciado_em DESC)`);
      await a.consultar(`CREATE TABLE IF NOT EXISTS ${t.rest} (
        id uuid PRIMARY KEY, tenant_id text NOT NULL, origem text NOT NULL, backup_id text, backup_criado_em timestamptz, usuario text NOT NULL,
        copia_seguranca_id uuid, em timestamptz NOT NULL DEFAULT now(), resultado jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL, erro text)`);
    })().catch((e) => { pronto = null; throw e; });
    return pronto;
  };

  // ===== Configuração =====

  async function lerLinhaAgenda(tenantId: string): Promise<{ config: ConfigBackup; nuvemCifrada: string | null; atualizadoEm: string | null; atualizadoPor: string | null }> {
    await preparar();
    const r = await a.consultar(`SELECT config, nuvem_cifrada, atualizado_em, atualizado_por FROM ${t.agenda} WHERE tenant_id = $1`, [tenantId]);
    const l = r.rows[0];
    if (!l) return { config: configPadrao(), nuvemCifrada: null, atualizadoEm: null, atualizadoPor: null };
    const v = normalizarConfig(l.config, { ...configPadrao(), nuvem: l.config?.nuvem ?? null });
    return { config: v.ok ? v.config : configPadrao(), nuvemCifrada: l.nuvem_cifrada ?? null, atualizadoEm: l.atualizado_em ? new Date(l.atualizado_em).toISOString() : null, atualizadoPor: l.atualizado_por ?? null };
  }

  async function gravarAgenda(tenantId: string, config: ConfigBackup, nuvemCifrada: string | null | undefined, login: string): Promise<void> {
    await preparar();
    await a.consultar(
      `INSERT INTO ${t.agenda} (tenant_id, config, nuvem_cifrada, atualizado_em, atualizado_por) VALUES ($1, $2::jsonb, $3, now(), $4)
       ON CONFLICT (tenant_id) DO UPDATE SET config = EXCLUDED.config, nuvem_cifrada = ${nuvemCifrada === undefined ? `${t.agenda}.nuvem_cifrada` : 'EXCLUDED.nuvem_cifrada'}, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
      [tenantId, JSON.stringify(config), nuvemCifrada ?? null, login],
    );
  }

  async function salvarConfig(tenantId: string, entrada: any, login: string): Promise<{ ok: true; config: ConfigBackup } | { ok: false; motivo: string }> {
    const atual = await lerLinhaAgenda(tenantId);
    const v = normalizarConfig(entrada, atual.config, agora());
    if (v.ok === false) return v;
    await gravarAgenda(tenantId, v.config, undefined, login);
    return v;
  }

  async function adicionarPerfil(tenantId: string, entrada: any, login: string): Promise<{ ok: true; config: ConfigBackup; perfil: any } | { ok: false; motivo: string }> {
    const v = validarPerfil(entrada, agora());
    if (v.ok === false) return v;
    const atual = await lerLinhaAgenda(tenantId);
    const r = await salvarConfig(tenantId, { ...atual.config, perfis: [...atual.config.perfis, v.perfil] }, login);
    if (r.ok === false) return r;
    return { ok: true, config: r.config, perfil: v.perfil };
  }

  function credenciais(tenantId: string, nuvemCifrada: string | null, publica: ConfigNuvemPublica | null): CredenciaisNuvem | null {
    if (!publica || !nuvemCifrada) return null;
    const s = decifrarSegredo<{ chaveAcesso: string; chaveSecreta: string }>(a.sistema, tenantId, nuvemCifrada, env);
    return { endpoint: publica.endpoint, bucket: publica.bucket, regiao: publica.regiao, pasta: publica.pasta, chaveAcesso: s.chaveAcesso, chaveSecreta: s.chaveSecreta };
  }

  function validarNuvem(e: any, anterior: { publica: ConfigNuvemPublica | null; segredo: { chaveAcesso: string; chaveSecreta: string } | null }): { ok: true; publica: ConfigNuvemPublica; segredo: { chaveAcesso: string; chaveSecreta: string } } | { ok: false; motivo: string } {
    const endpoint = String(e?.endpoint ?? anterior.publica?.endpoint ?? '').trim();
    const bucket = String(e?.bucket ?? anterior.publica?.bucket ?? '').trim();
    const regiao = String(e?.regiao ?? anterior.publica?.regiao ?? '').trim() || 'us-east-1';
    const chaveAcesso = String(e?.chaveAcesso || '').trim() || anterior.segredo?.chaveAcesso || '';
    const chaveSecreta = String(e?.chaveSecreta || '').trim() || anterior.segredo?.chaveSecreta || '';
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~/-]*)?$/i.test(endpoint)) return { ok: false, motivo: 'Informe o endereço do serviço começando com https:// (ex.: https://s3.us-west-004.backblazeb2.com).' };
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return { ok: false, motivo: 'Informe o nome do bucket (só letras minúsculas, números, ponto e traço).' };
    if (!/^[a-z0-9-]{2,40}$/.test(regiao)) return { ok: false, motivo: 'Região inválida (ex.: us-east-1, us-west-004 ou auto no Cloudflare R2).' };
    if (chaveAcesso.length < 4 || chaveAcesso.length > 200) return { ok: false, motivo: 'Informe a chave de acesso (Key ID / Access Key).' };
    if (chaveSecreta.length < 8 || chaveSecreta.length > 300) return { ok: false, motivo: 'Informe a chave secreta (Application Key / Secret Key).' };
    return { ok: true, publica: { tipo: 's3', endpoint, bucket, regiao, pasta: pastaSegura(e?.pasta ?? anterior.publica?.pasta), chaveAcessoMascarada: mascarar(chaveAcesso), ativo: e?.ativo !== false }, segredo: { chaveAcesso, chaveSecreta } };
  }

  async function segredoAtual(tenantId: string, nuvemCifrada: string | null) {
    if (!nuvemCifrada) return null;
    try { return decifrarSegredo<{ chaveAcesso: string; chaveSecreta: string }>(a.sistema, tenantId, nuvemCifrada, env); } catch { return null; }
  }

  async function testarConexao(c: CredenciaisNuvem): Promise<{ ok: boolean; mensagem: string }> {
    const cliente = criarNuvem(c);
    const chave = `${c.pasta}/.murade-teste-${randomBytes(6).toString('hex')}`;
    try {
      const corpo = Buffer.from(`Teste de conexão do ${a.nomeSistema} em ${new Date().toISOString()}. Pode apagar.`);
      await cliente.enviar(chave, corpo, 'text/plain');
      const tam = await cliente.tamanho(chave);
      if (tam !== corpo.length) throw new Error('O arquivo de teste não apareceu com o tamanho certo no destino.');
      await cliente.apagar(chave);
      return { ok: true, mensagem: `Conexão funcionando: gravei, conferi e apaguei um arquivo de teste em ${c.bucket}/${c.pasta}.` };
    } catch (e: any) {
      return { ok: false, mensagem: String(e?.message || 'Não consegui falar com a nuvem.').slice(0, 300) };
    }
  }

  async function salvarNuvem(tenantId: string, entrada: any, login: string): Promise<{ ok: boolean; mensagem: string; nuvem?: ConfigNuvemPublica | null }> {
    if (!chaveMestraConfigurada(env)) return { ok: false, mensagem: 'O backup cifrado ainda não foi ativado neste servidor (falta a chave mestra). Avise o suporte do Murad.' };
    const atual = await lerLinhaAgenda(tenantId);
    if (entrada?.remover === true) {
      await gravarAgenda(tenantId, { ...atual.config, nuvem: null }, null, login);
      return { ok: true, mensagem: 'Nuvem removida. Os backups continuam no Murad e podem ser baixados para o computador.', nuvem: null };
    }
    const v = validarNuvem(entrada, { publica: atual.config.nuvem, segredo: await segredoAtual(tenantId, atual.nuvemCifrada) });
    if (v.ok === false) return { ok: false, mensagem: v.motivo };
    const teste = await testarConexao({ ...v.publica, ...v.segredo });
    if (!teste.ok) return { ok: false, mensagem: `Não gravei: o teste de conexão falhou. ${teste.mensagem}` };
    await gravarAgenda(tenantId, { ...atual.config, nuvem: v.publica }, cifrarSegredo(a.sistema, tenantId, v.segredo, env), login);
    return { ok: true, mensagem: `${teste.mensagem} Nuvem gravada: os próximos backups vão para lá sozinhos.`, nuvem: v.publica };
  }

  async function testarNuvem(tenantId: string, entrada: any): Promise<{ ok: boolean; mensagem: string }> {
    const atual = await lerLinhaAgenda(tenantId);
    const v = validarNuvem(entrada || {}, { publica: atual.config.nuvem, segredo: await segredoAtual(tenantId, atual.nuvemCifrada) });
    if (v.ok === false) return { ok: false, mensagem: v.motivo };
    return testarConexao({ ...v.publica, ...v.segredo });
  }

  // ===== Execuções =====

  async function listarExecucoes(tenantId: string, limite = 200): Promise<RegistroExecucao[]> {
    await preparar();
    const r = await a.consultar(`SELECT ${COLUNAS} FROM ${t.exec} WHERE tenant_id = $1 ORDER BY iniciado_em DESC LIMIT $2`, [tenantId, Math.min(Math.max(limite, 1), 1000)]);
    return r.rows.map(linhaParaRegistro);
  }

  async function obterExecucao(tenantId: string, id: string): Promise<RegistroExecucao | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    await preparar();
    const r = await a.consultar(`SELECT ${COLUNAS} FROM ${t.exec} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return r.rows[0] ? linhaParaRegistro(r.rows[0]) : null;
  }

  /** O arquivo .murade de um backup: do banco do Murade ou, se já saiu de lá pela retenção, da nuvem do escritório. */
  async function arquivoDe(tenantId: string, id: string): Promise<Buffer | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    await preparar();
    const r = await a.consultar(`SELECT conteudo, status, nuvem_status, nuvem_chave, nuvem_removido_em FROM ${t.exec} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    const l = r.rows[0];
    if (!l || l.status !== 'ok') return null;
    if (l.conteudo) return Buffer.isBuffer(l.conteudo) ? l.conteudo : Buffer.from(l.conteudo);
    if (l.nuvem_status === 'enviado' && l.nuvem_chave && !l.nuvem_removido_em) {
      const ag = await lerLinhaAgenda(tenantId);
      const c = credenciais(tenantId, ag.nuvemCifrada, ag.config.nuvem);
      if (c) return criarNuvem(c).lerBuffer(String(l.nuvem_chave));
    }
    return null;
  }

  async function lerIndiceDoCompleto(tenantId: string, id: string): Promise<Indice | null> {
    const arquivo = await arquivoDe(tenantId, id);
    if (!arquivo) return null;
    const { conteudo } = abrirArquivo(arquivo, a.sistema, tenantId, env);
    const zip = await JSZip.loadAsync(conteudo);
    const f = zip.file('indice.json');
    return f ? JSON.parse(await f.async('string')) as Indice : null;
  }

  async function marcarPresos(): Promise<number> {
    await preparar();
    const r = await a.consultar(
      `UPDATE ${t.exec} SET status = 'falha', concluido_em = now(), erro = 'Interrompido no meio (o sistema reiniciou ou foi atualizado). O robô tenta de novo sozinho.'
       WHERE status = 'executando' AND iniciado_em < now() - ($1 || ' minutes')::interval`, [String(MIN_EXECUTANDO_PRESO)],
    );
    return r.rowCount ?? 0;
  }

  async function enviarEmailResultado(tenantId: string, config: ConfigBackup, reg: { status: 'ok' | 'falha'; tipo: TipoBackup; iniciadoEm: string; tamanhoBytes?: number; erro?: string | null; validado?: boolean; nuvem?: string }): Promise<string | null> {
    if (!a.email?.configurado()) return null;
    const quer = reg.status === 'ok' ? config.email.aoConcluir : config.email.aoErrar;
    if (!quer) return null;
    let para = config.email.para;
    if (!para.length) {
      const dono = (await a.escritorios()).find((e) => e.id === tenantId);
      if (dono && /@/.test(dono.login)) para = [dono.login.toLowerCase()];
    }
    if (!para.length) return 'sem destinatario';
    const tipo = reg.tipo === 'completo' ? 'completo' : 'só alterações';
    const assunto = reg.status === 'ok' ? `${a.nomeSistema}: backup ${tipo} concluído` : `${a.nomeSistema}: o backup ${tipo} FALHOU`;
    const linhas = reg.status === 'ok'
      ? [`O backup ${tipo} do seu escritório no ${a.nomeSistema} foi feito em ${dataHoraBrasilia(reg.iniciadoEm)}${reg.tamanhoBytes ? ` (${(reg.tamanhoBytes / 1024 / 1024).toFixed(1)} MB)` : ''}.`,
        reg.validado ? 'Conferência: o arquivo foi aberto, decifrado e as contagens bateram.' : 'Conferência depois do backup está desligada nas opções.',
        reg.nuvem ? `Nuvem: ${reg.nuvem}.` : '']
      : [`O backup ${tipo} do seu escritório no ${a.nomeSistema} não deu certo em ${dataHoraBrasilia(reg.iniciadoEm)}.`, `Motivo: ${reg.erro || 'não informado'}.`, 'O robô tenta de novo sozinho. Se continuar, abra a tela Backup no sistema e clique em "Fazer backup agora".'];
    const texto = [...linhas.filter(Boolean), '', 'Para ver todos os backups, baixar ou restaurar, entre no sistema e abra a tela Backup.', 'Este é um aviso automático; não é preciso responder.'].join('\n');
    try {
      const [primeiro, ...resto] = para;
      await a.email.enviar(primeiro, assunto, texto, [...resto, ...config.email.cc]);
      return 'enviado';
    } catch (e: any) { return `falha: ${String(e?.message || e).slice(0, 120)}`; }
  }

  async function enviarParaNuvem(tenantId: string, id: string, arquivo: Buffer, nome: string, iniciadoEm: string): Promise<string> {
    const ag = await lerLinhaAgenda(tenantId);
    if (!ag.config.nuvem || !ag.config.nuvem.ativo) {
      await a.consultar(`UPDATE ${t.exec} SET nuvem_status = 'nao_configurada' WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      return '';
    }
    const ano = iniciadoEm.slice(0, 4); const mes = iniciadoEm.slice(5, 7);
    const chave = `${ag.config.nuvem.pasta}/${a.sistema}/${ano}/${mes}/${nome}`;
    try {
      const c = credenciais(tenantId, ag.nuvemCifrada, ag.config.nuvem);
      if (!c) throw new Error('As chaves da nuvem não estão gravadas.');
      const cliente = criarNuvem(c);
      await cliente.enviar(chave, arquivo);
      const tam = await cliente.tamanho(chave);
      if (tam !== arquivo.length) throw new Error(`O arquivo chegou na nuvem com tamanho diferente (${tam ?? 0} de ${arquivo.length} bytes).`);
      await a.consultar(`UPDATE ${t.exec} SET nuvem_status = 'enviado', nuvem_chave = $3, nuvem_erro = NULL, nuvem_enviado_em = now(), nuvem_tentativas = nuvem_tentativas + 1, nuvem_tentativa_em = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId, chave]);
      return `enviado e conferido em ${ag.config.nuvem.bucket}`;
    } catch (e: any) {
      const msg = String(e?.message || 'falha ao enviar').slice(0, 300);
      await a.consultar(`UPDATE ${t.exec} SET nuvem_status = 'falha', nuvem_chave = $3, nuvem_erro = $4, nuvem_tentativas = nuvem_tentativas + 1, nuvem_tentativa_em = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId, chave, msg]);
      return `falhou (${msg}); o robô tenta de novo`;
    }
  }

  async function aplicarRetencao(tenantId: string, config: ConfigBackup): Promise<{ removidosServidor: number; removidosNuvem: number }> {
    const r = await a.consultar(`SELECT id, tipo, status, iniciado_em, base_id, origem, (conteudo IS NOT NULL) AS tem, nuvem_status, nuvem_chave, nuvem_removido_em FROM ${t.exec} WHERE tenant_id = $1`, [tenantId]);
    const itens: Array<ItemRetencao & { tem: boolean; nuvem: boolean; chave: string | null }> = r.rows.map((l: any) => ({
      id: String(l.id), tipo: l.tipo, status: l.status, iniciadoEm: new Date(l.iniciado_em).toISOString(), baseId: l.base_id ? String(l.base_id) : null, origem: String(l.origem),
      tem: l.tem === true, nuvem: l.nuvem_status === 'enviado' && !l.nuvem_removido_em, chave: l.nuvem_chave ?? null,
    }));
    const n = agora();
    const servidor = new Set(idsParaRemover(itens, Math.min(config.retencaoCompletos, LIMITE_SERVIDOR), config.diasAlteracoes, n));
    let removidosServidor = 0;
    for (const i of itens) {
      if (!servidor.has(i.id) || !i.tem) continue;
      await a.consultar(`UPDATE ${t.exec} SET conteudo = NULL, removido_em = now() WHERE id = $1 AND tenant_id = $2`, [i.id, tenantId]);
      removidosServidor += 1;
    }
    let removidosNuvem = 0;
    const nuvem = new Set(idsParaRemover(itens, config.retencaoCompletos, config.diasAlteracoes, n));
    const naNuvem = itens.filter((i) => i.nuvem && i.chave && nuvem.has(i.id));
    if (naNuvem.length) {
      const ag = await lerLinhaAgenda(tenantId);
      const c = credenciais(tenantId, ag.nuvemCifrada, ag.config.nuvem);
      if (c) {
        const cliente = criarNuvem(c);
        for (const i of naNuvem) {
          // Só apaga arquivo que o próprio Murade gravou (a chave está registrada aqui); nunca lista e apaga outros.
          try { await cliente.apagar(i.chave!); await a.consultar(`UPDATE ${t.exec} SET nuvem_removido_em = now() WHERE id = $1 AND tenant_id = $2`, [i.id, tenantId]); removidosNuvem += 1; } catch { /* tenta na próxima */ }
        }
      }
    }
    // Registro (sem arquivo) fica 2 anos no relatório.
    await a.consultar(`DELETE FROM ${t.exec} WHERE tenant_id = $1 AND conteudo IS NULL AND iniciado_em < now() - interval '730 days'`, [tenantId]);
    return { removidosServidor, removidosNuvem };
  }

  async function ultimoCompletoComArquivo(tenantId: string): Promise<{ id: string } | null> {
    const r = await a.consultar(
      `SELECT id FROM ${t.exec} WHERE tenant_id = $1 AND tipo = 'completo' AND status = 'ok' AND (conteudo IS NOT NULL OR (nuvem_status = 'enviado' AND nuvem_removido_em IS NULL))
       ORDER BY iniciado_em DESC LIMIT 1`, [tenantId]);
    return r.rows[0] ? { id: String(r.rows[0].id) } : null;
  }

  /**
   * Faz um backup agora (o robô agendado, o botão "Fazer backup agora" e a Agente IA chamam isto).
   * Devolve o registro final. Erro de um escritório nunca afeta outro.
   */
  async function executar(tenantId: string, opcoes: { tipo: TipoBackup; origem: 'agendado' | 'manual' | 'agente' | 'antes_restaurar' | 'conferidor'; usuario?: string | null; perfilIds?: string[]; agendadoPara?: Date | null }): Promise<{ ok: true; registro: RegistroExecucao } | { ok: false; codigo: 'ja_rodando' | 'sem_empresas' | 'sem_chave' | 'falha'; motivo: string; registro?: RegistroExecucao }> {
    if (!chaveMestraConfigurada(env)) return { ok: false, codigo: 'sem_chave', motivo: 'O backup cifrado ainda não foi ativado neste servidor (falta a chave mestra MURADE_BACKUP_MASTER_KEY no Render).' };
    await preparar();
    if (emAndamento.has(tenantId)) return { ok: false, codigo: 'ja_rodando', motivo: 'Já existe um backup deste escritório em andamento. Aguarde terminar.' };
    emAndamento.add(tenantId);
    let id: string | null = null;
    let config = configPadrao();
    const iniciado = agora();
    try {
      const rodando = await a.consultar(`SELECT 1 FROM ${t.exec} WHERE tenant_id = $1 AND status = 'executando' AND iniciado_em >= now() - ($2 || ' minutes')::interval LIMIT 1`, [tenantId, String(MIN_EXECUTANDO_PRESO)]);
      if (rodando.rows.length) return { ok: false, codigo: 'ja_rodando', motivo: 'Já existe um backup deste escritório em andamento. Aguarde terminar.' };
      const cnpjs = await a.cnpjsDoEscritorio(tenantId);
      if (!cnpjs.length) return { ok: false, codigo: 'sem_empresas', motivo: 'Cadastre ao menos uma empresa antes de fazer o backup.' };
      config = (await lerLinhaAgenda(tenantId)).config;
      id = randomUUID();
      await a.consultar(
        `INSERT INTO ${t.exec} (id, tenant_id, tipo, origem, perfil_ids, usuario, agendado_para, iniciado_em, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'executando')`,
        [id, tenantId, opcoes.tipo, opcoes.origem, opcoes.perfilIds ?? [], opcoes.usuario ?? null, opcoes.agendadoPara ?? null, iniciado],
      );
      let tipo: TipoBackup = opcoes.tipo;
      let base: { id: string; indice: Indice } | null = null;
      let observacao: string | null = null;
      if (tipo === 'alteracoes') {
        const ult = await ultimoCompletoComArquivo(tenantId);
        const indice = ult ? await lerIndiceDoCompleto(tenantId, ult.id).catch(() => null) : null;
        if (ult && indice) base = { id: ult.id, indice };
        else { tipo = 'completo'; observacao = 'Pedido como "só alterações", mas ainda não havia backup completo para comparar: foi feito o completo.'; }
      }
      const tabelas = await a.coletar(tenantId, cnpjs);
      const geradoEm = iniciado.toISOString();
      const { zip, manifesto } = await montarConteudo(tabelas, { sistema: a.sistema, id, geradoEm, base });
      const { arquivo } = selarArquivo(zip, { sistema: a.sistema, id, tipo, baseId: base?.id ?? null, criadoEm: geradoEm }, tenantId, env);
      const nome = nomeArquivo(a.sistema, tipo, iniciado, id);
      let validado = false; let validacao = 'Conferência depois do backup desligada nas opções.';
      if (config.validar) {
        const aberto = abrirArquivo(arquivo, a.sistema, tenantId, env);
        const lido = await lerConteudo(aberto.conteudo, { sistema: a.sistema, id });
        if (JSON.stringify(lido.manifesto.tabelas) !== JSON.stringify(manifesto.tabelas)) throw new Error('A conferência falhou: as contagens do arquivo não batem com o que foi lido do banco.');
        const total = Object.values(manifesto.tabelas).reduce((s, n) => s + n, 0);
        validado = true;
        validacao = `Arquivo aberto e decifrado, checksum SHA-256 conferido e ${Object.keys(manifesto.tabelas).length} tabela(s) com ${total} registro(s) batendo${tipo === 'alteracoes' ? ' (estado = completo base + alterações)' : ''}.`;
      }
      await a.consultar(
        `UPDATE ${t.exec} SET status = 'ok', tipo = $3, base_id = $4, concluido_em = now(), validado = $5, validacao = $6, tamanho_bytes = $7, sha256_arquivo = $8,
         contagens = $9::jsonb, nome_arquivo = $10, conteudo = $11, observacao = $12 WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, tipo, base?.id ?? null, validado, validacao, arquivo.length, sha256(arquivo), JSON.stringify(manifesto.tabelas), nome, arquivo, observacao],
      );
      const textoNuvem = await enviarParaNuvem(tenantId, id, arquivo, nome, geradoEm);
      await aplicarRetencao(tenantId, config).catch((e) => console.error(`[Backup ${a.sistema}] retenção falhou:`, String(e?.message || e).slice(0, 200)));
      if (opcoes.origem !== 'antes_restaurar') {
        const st = await enviarEmailResultado(tenantId, config, { status: 'ok', tipo, iniciadoEm: geradoEm, tamanhoBytes: arquivo.length, validado, nuvem: textoNuvem || undefined });
        if (st) await a.consultar(`UPDATE ${t.exec} SET email_status = $3 WHERE id = $1 AND tenant_id = $2`, [id, tenantId, st]);
      }
      return { ok: true, registro: (await obterExecucao(tenantId, id))! };
    } catch (erro: any) {
      const motivo = erro instanceof ErroArquivoBackup ? `A conferência falhou: ${erro.message}` : String(erro?.message || 'Falha ao gerar o backup.').slice(0, 300);
      if (id) {
        await a.consultar(`UPDATE ${t.exec} SET status = 'falha', concluido_em = now(), erro = $3, conteudo = NULL, validado = false WHERE id = $1 AND tenant_id = $2`, [id, tenantId, motivo]).catch(() => undefined);
        if (opcoes.origem !== 'antes_restaurar') {
          const st = await enviarEmailResultado(tenantId, config, { status: 'falha', tipo: opcoes.tipo, iniciadoEm: iniciado.toISOString(), erro: motivo }).catch(() => null);
          if (st) await a.consultar(`UPDATE ${t.exec} SET email_status = $3 WHERE id = $1 AND tenant_id = $2`, [id, tenantId, st]).catch(() => undefined);
        }
      }
      return { ok: false, codigo: 'falha', motivo, registro: id ? (await obterExecucao(tenantId, id).catch(() => null)) ?? undefined : undefined };
    } finally {
      emAndamento.delete(tenantId);
    }
  }

  /** Começa o backup sem esperar terminar (para a tela e a Agente). */
  function iniciar(tenantId: string, opcoes: Parameters<typeof executar>[1]): { ok: true } | { ok: false; motivo: string } {
    if (emAndamento.has(tenantId)) return { ok: false, motivo: 'Já existe um backup deste escritório em andamento. Aguarde terminar.' };
    void executar(tenantId, opcoes).then((r) => { if (r.ok === false && r.codigo !== 'ja_rodando') console.warn(`[Backup ${a.sistema}] ${r.motivo}`); })
      .catch((e) => console.error(`[Backup ${a.sistema}] falha:`, String(e?.message || e).slice(0, 200)));
    return { ok: true };
  }

  // ===== Resumo, aviso e relatório =====

  async function ultimoBackupOk(tenantId: string): Promise<{ em: string; origem: string; tipo: string } | null> {
    await preparar();
    const r = await a.consultar(`SELECT iniciado_em, origem, tipo FROM ${t.exec} WHERE tenant_id = $1 AND status = 'ok' ORDER BY iniciado_em DESC LIMIT 1`, [tenantId]);
    let melhor = r.rows[0] ? { em: new Date(r.rows[0].iniciado_em).toISOString(), origem: String(r.rows[0].origem), tipo: String(r.rows[0].tipo) } : null;
    if (a.mensal) {
      const m = (await a.mensal.listar(tenantId).catch(() => [])).filter((x) => x.ok).sort((x, y) => Date.parse(y.criadoEm) - Date.parse(x.criadoEm))[0];
      if (m && (!melhor || Date.parse(m.criadoEm) > Date.parse(melhor.em))) melhor = { em: m.criadoEm, origem: 'mensal', tipo: 'completo' };
    }
    return melhor;
  }

  async function resumo(tenantId: string) {
    const ag = await lerLinhaAgenda(tenantId);
    const n = agora();
    const ultimo = await ultimoBackupOk(tenantId);
    const rodando = await a.consultar(`SELECT id, iniciado_em, tipo FROM ${t.exec} WHERE tenant_id = $1 AND status = 'executando' AND iniciado_em >= now() - ($2 || ' minutes')::interval ORDER BY iniciado_em DESC LIMIT 1`, [tenantId, String(MIN_EXECUTANDO_PRESO)]);
    const perfis = ag.config.perfis.map((p) => ({ ...p, descricao: descreverPerfil(p), proximo: p.ativo ? proximaOcorrencia(p, n).toISOString() : null }));
    const proximo = perfis.filter((p) => p.proximo).sort((x, y) => Date.parse(x.proximo!) - Date.parse(y.proximo!))[0] ?? null;
    return {
      chaveConfigurada: chaveMestraConfigurada(env), config: ag.config, perfis, atualizadoEm: ag.atualizadoEm, atualizadoPor: ag.atualizadoPor,
      ultimo, diasDesdeUltimo: ultimo ? Math.floor((n.getTime() - Date.parse(ultimo.em)) / 86_400_000) : null,
      emAndamento: rodando.rows[0] ? { id: String(rodando.rows[0].id), desde: new Date(rodando.rows[0].iniciado_em).toISOString(), tipo: String(rodando.rows[0].tipo) } : null,
      proximo: proximo ? { quando: proximo.proximo, descricao: proximo.descricao } : null,
      nuvemDisponivel: { s3: true, googleDrive: false, oneDrive: false },
    };
  }

  async function aviso(tenantId: string, login: string, momento: 'entrar' | 'sair') {
    const ag = await lerLinhaAgenda(tenantId);
    const av = ag.config.avisos;
    const ligado = momento === 'entrar' ? av.aoEntrar : av.aoSair;
    const paraEste = av.usuarios === 'todos' || av.usuarios.includes(String(login || '').toLowerCase());
    if (!ligado || !paraEste) return { mostrar: false as const };
    const ultimo = await ultimoBackupOk(tenantId);
    const dias = ultimo ? Math.floor((agora().getTime() - Date.parse(ultimo.em)) / 86_400_000) : null;
    if (dias !== null && dias < av.diasSemBackup) return { mostrar: false as const, dias };
    return {
      mostrar: true as const, dias, ultimoEm: ultimo?.em ?? null,
      texto: dias === null ? 'Este escritório ainda não tem nenhum backup. Faça um agora na tela Backup.' : `Seu último backup foi há ${dias} dia(s) (${dataHoraBrasilia(ultimo!.em)}). Faça um agora na tela Backup.`,
    };
  }

  async function relatorio(tenantId: string, de: string, ate: string) {
    await preparar();
    const ini = /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : new Date(agora().getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const fim = /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : agora().toISOString().slice(0, 10);
    const r = await a.consultar(
      `SELECT ${COLUNAS} FROM ${t.exec} WHERE tenant_id = $1 AND iniciado_em >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND iniciado_em < (($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') ORDER BY iniciado_em DESC LIMIT 2000`, [tenantId, ini, fim]);
    const rr = await a.consultar(
      `SELECT id, origem, backup_id, backup_criado_em, usuario, copia_seguranca_id, em, status, erro FROM ${t.rest} WHERE tenant_id = $1 AND em >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
       AND em < (($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') ORDER BY em DESC LIMIT 500`, [tenantId, ini, fim]);
    const execucoes = r.rows.map(linhaParaRegistro);
    return {
      de: ini, ate: fim, execucoes,
      restauracoes: rr.rows.map((l: any) => ({ id: String(l.id), origem: l.origem, backupId: l.backup_id, backupCriadoEm: l.backup_criado_em ? new Date(l.backup_criado_em).toISOString() : null, usuario: l.usuario, copiaSegurancaId: l.copia_seguranca_id, em: new Date(l.em).toISOString(), status: l.status, erro: l.erro })),
      totais: { feitos: execucoes.filter((e) => e.status === 'ok').length, falhas: execucoes.filter((e) => e.status === 'falha').length, validados: execucoes.filter((e) => e.validado).length, bytes: execucoes.reduce((s, e) => s + (e.status === 'ok' ? e.tamanhoBytes : 0), 0) },
    };
  }

  async function marcarSalvoNaPasta(tenantId: string, id: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
    await preparar();
    const r = await a.consultar(`UPDATE ${t.exec} SET salvo_pasta_em = COALESCE(salvo_pasta_em, now()) WHERE id = $1 AND tenant_id = $2 AND status = 'ok'`, [id, tenantId]);
    return (r.rowCount ?? 0) > 0;
  }

  // ===== Restauração =====

  function limparPrevias() {
    const n = Date.now();
    for (const [k, v] of previas) if (n - v.criadoEm > TTL_PREVIA_MS) previas.delete(k);
    while (previas.size > 6) previas.delete(previas.keys().next().value as string);
  }

  async function tabelasDoArquivo(tenantId: string, arquivo: Buffer): Promise<{ tabelas: Record<string, any[]>; tipo: string; criadoEm: string; id: string }> {
    const { cabecalho, conteudo } = abrirArquivo(arquivo, a.sistema, tenantId, env);
    const lido = await lerConteudo(conteudo, { sistema: a.sistema, id: cabecalho.id });
    if (cabecalho.tipo === 'completo') return { tabelas: lido.tabelas, tipo: 'completo', criadoEm: cabecalho.criadoEm, id: cabecalho.id };
    const baseArq = cabecalho.baseId ? await arquivoDe(tenantId, cabecalho.baseId) : null;
    if (!baseArq) throw new Error('Este backup é "só alterações" e o backup completo em que ele se baseia não está mais guardado. Restaure um backup completo.');
    const base = abrirArquivo(baseArq, a.sistema, tenantId, env);
    const baseLida: ConteudoLido = await lerConteudo(base.conteudo, { sistema: a.sistema, id: base.cabecalho.id });
    return { tabelas: reconstruir(baseLida, lido), tipo: 'alteracoes', criadoEm: cabecalho.criadoEm, id: cabecalho.id };
  }

  async function tabelasDoMensal(tenantId: string, idMensal: string): Promise<{ tabelas: Record<string, any[]>; criadoEm: string }> {
    if (!a.mensal) throw new Error('Backup mensal não disponível.');
    const zipBuf = await a.mensal.lerZip(tenantId, idMensal);
    if (!zipBuf) throw new Error('Backup mensal não encontrado para o seu escritório.');
    const zip = await JSZip.loadAsync(zipBuf);
    const m = zip.file('manifesto.json');
    if (!m) throw new Error('O backup mensal está sem manifesto.');
    const manifesto = JSON.parse(await m.async('string'));
    if (String(manifesto.tenantId) !== String(tenantId)) throw new Error('Este backup mensal é de outro escritório.');
    const tabelas: Record<string, any[]> = {};
    for (const nome of Object.keys(manifesto.tabelas || {})) {
      const f = zip.file(`dados/${nome}.json`);
      if (!f) throw new Error(`A tabela ${nome} não está no backup mensal.`);
      tabelas[nome] = JSON.parse(await f.async('string'));
      if (tabelas[nome].length !== Number(manifesto.tabelas[nome])) throw new Error(`A contagem da tabela ${nome} do backup mensal não confere.`);
    }
    return { tabelas, criadoEm: String(manifesto.geradoEm || '') };
  }

  async function previaRestauracao(tenantId: string, login: string, fonte: { id?: string; mensalId?: string; arquivo?: Buffer }) {
    await preparar();
    let tabelas: Record<string, any[]>; let criadoEm: string; let tipo = 'completo'; let origem: string; let backupId: string | null = null;
    if (fonte.arquivo) {
      const r = await tabelasDoArquivo(tenantId, fonte.arquivo);
      tabelas = r.tabelas; criadoEm = r.criadoEm; tipo = r.tipo; origem = 'arquivo'; backupId = r.id;
    } else if (fonte.mensalId) {
      const r = await tabelasDoMensal(tenantId, fonte.mensalId);
      tabelas = r.tabelas; criadoEm = r.criadoEm; origem = 'mensal'; backupId = fonte.mensalId;
    } else {
      const arq = fonte.id ? await arquivoDe(tenantId, fonte.id) : null;
      if (!arq) throw new Error('Backup não encontrado para o seu escritório (ou o arquivo já saiu pela retenção).');
      const r = await tabelasDoArquivo(tenantId, arq);
      tabelas = r.tabelas; criadoEm = r.criadoEm; tipo = r.tipo; origem = 'historico'; backupId = fonte.id!;
    }
    const cnpjs = await a.cnpjsDoEscritorio(tenantId);
    const itens = await a.restauracao.executar(tenantId, cnpjs, tabelas, false);
    limparPrevias();
    const token = randomBytes(24).toString('hex');
    previas.set(token, { tenantId, login, origem, backupId, tabelas, criadoEm: Date.now(), cabecalho: { tipo, criadoEm } });
    const presentes = new Set(Object.keys(tabelas));
    return {
      token, expiraEmMin: TTL_PREVIA_MS / 60_000, backup: { origem, id: backupId, tipo, criadoEm }, itens,
      naoRestauradas: a.restauracao.naoRestauradas.filter((x) => presentes.has(x.nome)),
      totalMudancas: itens.reduce((s, i) => s + i.alterar + i.recriar, 0),
    };
  }

  async function confirmarRestauracao(tenantId: string, login: string, token: string, confirmacao: string) {
    limparPrevias();
    const p = previas.get(String(token || ''));
    if (!p || p.tenantId !== tenantId || p.login !== login) return { ok: false as const, motivo: 'A prévia venceu ou não é sua. Clique de novo em "Ver o que vai mudar".' };
    if (String(confirmacao || '').trim().toUpperCase() !== 'RESTAURAR') return { ok: false as const, motivo: 'Para restaurar, digite RESTAURAR na segunda confirmação.' };
    previas.delete(token);
    await preparar();
    const idRest = randomUUID();
    const copia = await executar(tenantId, { tipo: 'completo', origem: 'antes_restaurar', usuario: login });
    if (copia.ok === false) {
      await a.consultar(`INSERT INTO ${t.rest} (id, tenant_id, origem, backup_id, backup_criado_em, usuario, status, erro) VALUES ($1,$2,$3,$4,$5,$6,'cancelada',$7)`,
        [idRest, tenantId, p.origem, p.backupId, p.cabecalho.criadoEm || null, login, `Cópia de segurança antes de restaurar falhou: ${copia.motivo}`]);
      return { ok: false as const, motivo: `Não restaurei nada: a cópia de segurança de antes da restauração não deu certo (${copia.motivo}).` };
    }
    if (!copia.registro.validado) {
      // A cópia de antes de restaurar é conferida sempre, mesmo se a conferência estiver desligada nas opções.
      try { const arq = await arquivoDe(tenantId, copia.registro.id); const ab = abrirArquivo(arq!, a.sistema, tenantId, env); await lerConteudo(ab.conteudo, { sistema: a.sistema, id: ab.cabecalho.id }); }
      catch (e: any) { return { ok: false as const, motivo: `Não restaurei nada: a cópia de segurança não passou na conferência (${String(e?.message || e).slice(0, 160)}).` }; }
    }
    emAndamento.add(tenantId);
    try {
      const cnpjs = await a.cnpjsDoEscritorio(tenantId);
      const itens = await a.restauracao.executar(tenantId, cnpjs, p.tabelas, true);
      await a.consultar(`INSERT INTO ${t.rest} (id, tenant_id, origem, backup_id, backup_criado_em, usuario, copia_seguranca_id, resultado, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'ok')`,
        [idRest, tenantId, p.origem, p.backupId, p.cabecalho.criadoEm || null, login, copia.registro.id, JSON.stringify(itens)]);
      return { ok: true as const, itens, copiaSegurancaId: copia.registro.id, mensagem: `Restauração concluída. Antes, o Murad guardou uma cópia de segurança de como estava (${dataHoraBrasilia(copia.registro.iniciadoEm)}); se precisar, restaure essa cópia para voltar.` };
    } catch (e: any) {
      const motivo = String(e?.message || 'Falha ao restaurar.').slice(0, 300);
      await a.consultar(`INSERT INTO ${t.rest} (id, tenant_id, origem, backup_id, backup_criado_em, usuario, copia_seguranca_id, status, erro) VALUES ($1,$2,$3,$4,$5,$6,$7,'falha',$8)`,
        [idRest, tenantId, p.origem, p.backupId, p.cabecalho.criadoEm || null, login, copia.registro.id, motivo]).catch(() => undefined);
      return { ok: false as const, motivo: `A restauração parou com erro: ${motivo}. A cópia de segurança de antes está guardada no histórico.` };
    } finally { emAndamento.delete(tenantId); }
  }

  // ===== Robôs =====

  async function configsComAgenda(): Promise<Array<{ tenantId: string; config: ConfigBackup }>> {
    await preparar();
    const r = await a.consultar(`SELECT tenant_id, config FROM ${t.agenda}`);
    const saida: Array<{ tenantId: string; config: ConfigBackup }> = [];
    for (const l of r.rows) {
      const v = normalizarConfig(l.config, { ...configPadrao(), nuvem: l.config?.nuvem ?? null });
      if (v.ok) saida.push({ tenantId: String(l.tenant_id), config: v.config });
    }
    return saida;
  }

  async function execucoesRecentes(tenantId: string) {
    const r = await a.consultar(`SELECT perfil_ids, agendado_para, status FROM ${t.exec} WHERE tenant_id = $1 AND agendado_para >= now() - interval '40 days'`, [tenantId]);
    return r.rows.map((l: any) => ({ perfilIds: (l.perfil_ids || []).map(String), agendadoPara: l.agendado_para ? new Date(l.agendado_para).toISOString() : null, status: l.status }));
  }

  /** Robô de Backup Agendado (a cada 5 min): faz os backups devidos, reenvia o que falhou para a nuvem e libera os presos. */
  async function rodadaExecutor(): Promise<{ feitos: number; falhas: number; reenviados: number; presos: number; resumo: string }> {
    const presos = await marcarPresos();
    const n = agora();
    let feitos = 0; let falhas = 0; let reenviados = 0;
    const escritoriosValidos = new Set((await a.escritorios()).map((e) => e.id));
    for (const { tenantId, config } of await configsComAgenda()) {
      if (!escritoriosValidos.has(tenantId)) continue;
      try {
        const escolha = escolherExecucao(perfisDevidos(config, await execucoesRecentes(tenantId), n));
        if (escolha) {
          const r = await executar(tenantId, { tipo: escolha.tipo, origem: 'agendado', perfilIds: escolha.perfilIds, agendadoPara: escolha.agendadoPara });
          if (r.ok === true) feitos += 1; else if (r.codigo === 'falha') falhas += 1;
        }
        reenviados += await reenviarNuvemPendente(tenantId, config);
      } catch (e: any) { falhas += 1; console.error(`[Backup ${a.sistema}] rodada do escritório falhou:`, String(e?.message || e).slice(0, 200)); }
    }
    const partes = [`${feitos} backup(s) agendado(s) feito(s)`];
    if (falhas) partes.push(`${falhas} falha(s) (nova tentativa sozinho)`);
    if (reenviados) partes.push(`${reenviados} reenviado(s) à nuvem do escritório`);
    if (presos) partes.push(`${presos} interrompido(s) por reinício liberado(s)`);
    return { feitos, falhas, reenviados, presos, resumo: `${partes.join('; ')}.` };
  }

  async function reenviarNuvemPendente(tenantId: string, config: ConfigBackup): Promise<number> {
    if (!config.nuvem?.ativo) return 0;
    const r = await a.consultar(
      `SELECT id, nome_arquivo, iniciado_em FROM ${t.exec} WHERE tenant_id = $1 AND status = 'ok' AND conteudo IS NOT NULL AND nuvem_status IN ('falha','pendente','nao_configurada')
       AND nuvem_tentativas < 8 AND (nuvem_tentativa_em IS NULL OR nuvem_tentativa_em < now() - (nuvem_tentativas * 20 || ' minutes')::interval) ORDER BY iniciado_em DESC LIMIT 3`, [tenantId]);
    let n = 0;
    for (const l of r.rows) {
      const arq = await arquivoDe(tenantId, String(l.id));
      if (!arq) continue;
      const res = await enviarParaNuvem(tenantId, String(l.id), arq, String(l.nome_arquivo), new Date(l.iniciado_em).toISOString());
      if (res.startsWith('enviado')) n += 1;
    }
    return n;
  }

  /**
   * Robô Conferidor do Backup Agendado (de 2 em 2 horas): para cada escritório e cada agendamento, confere se o backup do
   * último horário foi feito, se foi conferido e se chegou na nuvem (quando há nuvem). O que dá para corrigir sozinho ele
   * corrige: refaz backup que ficou para trás, confere arquivo não conferido e reenvia à nuvem. Só conta, sem nomes.
   */
  async function rodadaConferidor(): Promise<{ escritorios: number; emDia: number; corrigidos: number; problemas: number; resumo: string; alerta: { nivel: 'aviso' | 'critico'; texto: string } | null }> {
    const n = agora();
    let escritorios = 0; let emDia = 0; let corrigidos = 0; let problemas = 0;
    const validos = new Set((await a.escritorios()).map((e) => e.id));
    for (const { tenantId, config } of await configsComAgenda()) {
      const ativos = config.perfis.filter((p) => p.ativo);
      if (!ativos.length || !validos.has(tenantId)) continue;
      escritorios += 1;
      let ok = true;
      try {
        for (const p of ativos) {
          const oc = ultimaOcorrencia(p, n);
          if (oc.getTime() < Date.parse(p.criadoEm) || n.getTime() - oc.getTime() < 60 * 60_000) continue;
          const r = await a.consultar(`SELECT ${COLUNAS} FROM ${t.exec} WHERE tenant_id = $1 AND $2 = ANY(perfil_ids) AND agendado_para >= $3 ORDER BY iniciado_em DESC`, [tenantId, p.id, oc]);
          const regs = r.rows.map(linhaParaRegistro);
          const bom = regs.find((x) => x.status === 'ok');
          if (!bom) {
            if (regs.some((x) => x.status === 'executando')) continue;
            ok = false;
            if (regs.filter((x) => x.status === 'falha').length >= MAX_TENTATIVAS_POR_OCORRENCIA) {
              const nova = await executar(tenantId, { tipo: p.tipo, origem: 'conferidor', perfilIds: [p.id], agendadoPara: oc });
              if (nova.ok) { corrigidos += 1; ok = true; } else problemas += 1;
            } else problemas += 1;
            continue;
          }
          if (config.validar && !bom.validado && bom.temArquivo) {
            try {
              const arq = await arquivoDe(tenantId, bom.id);
              const ab = abrirArquivo(arq!, a.sistema, tenantId, env);
              await lerConteudo(ab.conteudo, { sistema: a.sistema, id: bom.id });
              await a.consultar(`UPDATE ${t.exec} SET validado = true, validacao = 'Conferido depois pelo robô conferidor: abriu, decifrou e as contagens bateram.' WHERE id = $1 AND tenant_id = $2`, [bom.id, tenantId]);
              corrigidos += 1;
            } catch { ok = false; problemas += 1; }
          }
          if (config.nuvem?.ativo && bom.nuvem.status !== 'enviado' && !bom.nuvem.removidoEm) {
            const arq = bom.temArquivo ? await arquivoDe(tenantId, bom.id) : null;
            const res = arq ? await enviarParaNuvem(tenantId, bom.id, arq, bom.nomeArquivo || `${bom.id}.murade`, bom.iniciadoEm) : '';
            if (res.startsWith('enviado')) corrigidos += 1; else { ok = false; problemas += 1; }
          }
        }
      } catch (e: any) { ok = false; problemas += 1; console.error(`[Backup ${a.sistema}] conferência falhou:`, String(e?.message || e).slice(0, 200)); }
      if (ok) emDia += 1;
    }
    const resumo = escritorios === 0
      ? 'Nenhum escritório com backup agendado ainda (o backup mensal automático continua valendo para todos).'
      : `${escritorios} escritório(s) com agenda: ${emDia} em dia${corrigidos ? `, ${corrigidos} correção(ões) feita(s) sozinho (backup refeito, conferido ou reenviado à nuvem)` : ''}${problemas ? `, ${problemas} pendência(s) que o robô não conseguiu resolver (aparece para o escritório na tela Backup)` : ''}.`;
    return { escritorios, emDia, corrigidos, problemas, resumo, alerta: problemas ? { nivel: 'aviso', texto: `Backup agendado: ${problemas} pendência(s) em ${escritorios - emDia} escritório(s).` } : null };
  }

  async function usuarios(tenantId: string) { return a.usuarios(tenantId); }

  return {
    preparar, lerConfig: async (tenantId: string) => (await lerLinhaAgenda(tenantId)).config, salvarConfig, adicionarPerfil, salvarNuvem, testarNuvem,
    executar, iniciar, listarExecucoes, obterExecucao, arquivoDe, resumo, aviso, relatorio, marcarSalvoNaPasta,
    previaRestauracao, confirmarRestauracao, rodadaExecutor, rodadaConferidor, usuarios, lerCabecalho,
    listarMensais: (tenantId: string) => (a.mensal ? a.mensal.listar(tenantId) : Promise.resolve([])),
    sistema: a.sistema, nomeSistema: a.nomeSistema,
  };
}

export type ServicoBackupAgendado = ReturnType<typeof criarServicoBackupAgendado>;
