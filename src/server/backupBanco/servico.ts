// Backup completo do banco PostgreSQL para fora do Render (destino S3-compatível), automático e manual lado a lado.
//
// Variáveis (iguais nos três sistemas Murade, o prefixo no destino é que muda): MURADE_BACKUP_CHAVE e
// MURADE_BACKUP_S3_ENDPOINT / _BUCKET / _ACCESS_KEY / _SECRET_KEY / _REGION. Sem chave nada sai do servidor.
// Este módulo só LÊ o banco do sistema (uma foto consistente); a única tabela que ele grava é o próprio registro de
// backups (murade_backup_banco_log). Nenhum segredo vai para log, URL ou resposta da API.
import { Client, type ClientConfig } from 'pg';
import { createGunzip, createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { chaveBackupValida, criarCifrador, criarDecifrador, TAMANHO_MINIMO_CHAVE } from './cripto';
import { ClienteS3, type ConfigS3, type ObjetoS3 } from './s3';
import { analisarDump, gerarDump, type ResumoDump } from './dump';

export type Consulta = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
export type OrigemBackup = 'automatico' | 'manual';

export interface OpcoesServicoBackup {
  /** Identificador curto do sistema; também é o prefixo no destino ("dp/" -> "dp"). */
  sistema: string;
  /** Nome para mostrar ("Murade DP"). */
  nomeSistema: string;
  consulta: Consulta;
  /** Dados de conexão do próprio banco do sistema (a mesma URL e o mesmo SSL que o sistema já usa). */
  conexaoBanco: () => ClientConfig;
  env?: NodeJS.ProcessEnv;
  agora?: () => Date;
  /** Para testes: troca o cliente do destino. */
  criarClienteS3?: (cfg: ConfigS3) => ClienteS3;
}

export const VARIAVEIS_BACKUP: { variavel: string; para: string }[] = [
  { variavel: 'MURADE_BACKUP_CHAVE', para: `Senha que cifra o backup (mínimo ${TAMANHO_MINIMO_CHAVE} caracteres). Sem ela nada é enviado para fora. Guarde uma cópia em lugar seguro: sem ela o backup não abre.` },
  { variavel: 'MURADE_BACKUP_S3_ENDPOINT', para: 'Endereço do armazenamento, começando com https:// (no Backblaze B2: o "Endpoint" do bucket).' },
  { variavel: 'MURADE_BACKUP_S3_BUCKET', para: 'Nome do bucket (a "pasta" principal) criado no armazenamento.' },
  { variavel: 'MURADE_BACKUP_S3_ACCESS_KEY', para: 'Chave de acesso (keyID no Backblaze B2).' },
  { variavel: 'MURADE_BACKUP_S3_SECRET_KEY', para: 'Chave secreta (applicationKey no Backblaze B2).' },
  { variavel: 'MURADE_BACKUP_S3_REGION', para: 'Região do bucket (ex.: us-west-004 no Backblaze B2; "auto" no Cloudflare R2; us-east-1 na AWS).' },
];

export const PASSO_A_PASSO_BACKUP: string[] = [
  'Crie uma conta gratuita no Backblaze B2 (backblaze.com, produto "B2 Cloud Storage"). Cloudflare R2, Wasabi e AWS S3 também servem.',
  'No B2, clique em "Buckets" e depois no botão "Create a Bucket". Dê um nome (por exemplo murade-backups), deixe o bucket como "Private" e clique em "Create a Bucket". Anote o "Endpoint" que aparece nos detalhes do bucket e a região que está nele (por exemplo us-west-004).',
  'No menu "Application Keys", clique em "Add a New Application Key". Escolha o seu bucket em "Allow access to Bucket(s)" e clique em "Create New Key". Copie na hora o keyID e a applicationKey (a applicationKey só aparece uma vez).',
  'No Render, abra este serviço, entre em "Environment" e clique em "Add Environment Variable". Crie as seis variáveis da lista acima, uma a uma: MURADE_BACKUP_S3_ENDPOINT (https:// + o endpoint), MURADE_BACKUP_S3_BUCKET (nome do bucket), MURADE_BACKUP_S3_ACCESS_KEY (keyID), MURADE_BACKUP_S3_SECRET_KEY (applicationKey), MURADE_BACKUP_S3_REGION (a região) e MURADE_BACKUP_CHAVE (uma senha longa que você inventa; anote em lugar seguro).',
  'Use as MESMAS seis variáveis nos três sistemas (Fiscal, DP e Contábil); cada sistema grava na própria pasta do bucket (fiscal/, dp/, contabil/), sem se misturar.',
  'Clique em "Save, rebuild and deploy" no Render. Quando o sistema voltar, volte a este painel: o aviso "falta configurar o destino" some e o botão "Fazer backup agora" funciona. Depois faça um teste com "Conferir o último backup".',
];

export interface ConfigLida {
  configurado: boolean;
  faltando: { variavel: string; para: string }[];
  avisos: string[];
  chave?: string;
  s3?: ConfigS3;
}

export function lerConfigBackup(env: NodeJS.ProcessEnv = process.env): ConfigLida {
  const v = (n: string) => String(env[n] ?? '').trim();
  const faltando = VARIAVEIS_BACKUP.filter((x) => !v(x.variavel));
  const avisos: string[] = [];
  if (v('MURADE_BACKUP_CHAVE') && !chaveBackupValida(v('MURADE_BACKUP_CHAVE'))) {
    avisos.push(`MURADE_BACKUP_CHAVE está curta demais (mínimo ${TAMANHO_MINIMO_CHAVE} caracteres): nada será enviado até corrigir.`);
    faltando.push(VARIAVEIS_BACKUP[0]);
  }
  if (v('MURADE_BACKUP_S3_ENDPOINT')) {
    try {
      const u = new URL(/^https?:\/\//i.test(v('MURADE_BACKUP_S3_ENDPOINT')) ? v('MURADE_BACKUP_S3_ENDPOINT') : `https://${v('MURADE_BACKUP_S3_ENDPOINT')}`);
      if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('http');
    } catch {
      avisos.push('MURADE_BACKUP_S3_ENDPOINT precisa ser um endereço https:// válido.');
      faltando.push(VARIAVEIS_BACKUP[1]);
    }
  }
  const unicos = [...new Map(faltando.map((f) => [f.variavel, f])).values()];
  if (unicos.length) return { configurado: false, faltando: unicos, avisos };
  return {
    configurado: true, faltando: [], avisos,
    chave: v('MURADE_BACKUP_CHAVE'),
    s3: { endpoint: v('MURADE_BACKUP_S3_ENDPOINT'), bucket: v('MURADE_BACKUP_S3_BUCKET'), accessKey: v('MURADE_BACKUP_S3_ACCESS_KEY'), secretKey: v('MURADE_BACKUP_S3_SECRET_KEY'), region: v('MURADE_BACKUP_S3_REGION') },
  };
}

// --- Datas e retenção ---------------------------------------------------------------------------------------------------

const BRASILIA_MS = 3 * 3600_000;
/** Dia (AAAA-MM-DD) em Brasília, que não tem horário de verão desde 2019. */
export const diaBrasilia = (d: Date) => new Date(d.getTime() - BRASILIA_MS).toISOString().slice(0, 10);
export const horaBrasilia = (d: Date) => new Date(d.getTime() - BRASILIA_MS).getUTCHours();
export const HORA_DO_ROBO = 3;
export const LIMITE_ALERTA_HORAS = 26;
export const RETENCAO = { diarios: 7, semanais: 4, mensais: 12 } as const;

const pad = (n: number) => String(n).padStart(2, '0');
export function nomeDoObjeto(prefixo: string, d: Date): string {
  return `${prefixo}banco-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z.mbk`;
}
export function dataDoObjeto(prefixo: string, chave: string): Date | null {
  if (!chave.startsWith(prefixo)) return null;
  const m = chave.slice(prefixo.length).match(/^banco-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.mbk$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}
function inicioDaSemana(dia: string): string { // segunda-feira da semana do dia (AAAA-MM-DD)
  const d = new Date(`${dia}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400_000).toISOString().slice(0, 10);
}

/**
 * Retenção: guarda o backup mais novo de cada um dos 7 dias mais recentes, de cada uma das 4 semanas mais recentes e de
 * cada um dos 12 meses mais recentes; o resto (só do próprio prefixo, só arquivos com o nosso nome) pode ser apagado.
 * Nunca devolve para apagar o backup mais recente.
 */
export function escolherParaApagar(prefixo: string, objetos: { chave: string }[]): string[] {
  const dados = objetos.map((o) => ({ chave: o.chave, data: dataDoObjeto(prefixo, o.chave) })).filter((o): o is { chave: string; data: Date } => !!o.data)
    .sort((a, b) => b.data.getTime() - a.data.getTime());
  if (dados.length <= 1) return [];
  const manter = new Set<string>([dados[0].chave]);
  const porDia = new Map<string, string>(); const porSemana = new Map<string, string>(); const porMes = new Map<string, string>();
  for (const o of dados) { // do mais novo para o mais velho: o primeiro de cada grupo é o mais novo dele
    const dia = diaBrasilia(o.data);
    if (!porDia.has(dia)) porDia.set(dia, o.chave);
    const sem = inicioDaSemana(dia); if (!porSemana.has(sem)) porSemana.set(sem, o.chave);
    const mes = dia.slice(0, 7); if (!porMes.has(mes)) porMes.set(mes, o.chave);
  }
  for (const grupo of [[porDia, RETENCAO.diarios], [porSemana, RETENCAO.semanais], [porMes, RETENCAO.mensais]] as const) {
    [...grupo[0].entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, grupo[1]).forEach(([, chave]) => manter.add(chave));
  }
  return dados.filter((o) => !manter.has(o.chave)).map((o) => o.chave);
}

// --- Serviço ------------------------------------------------------------------------------------------------------------

export interface ResultadoBackup {
  ok: boolean; motivo?: string; codigo?: 'sem_configuracao' | 'ja_rodando' | 'falha';
  objeto?: string; tamanhoBytes?: number; tabelas?: number; linhas?: number; duracaoMs?: number; apagadosPorRetencao?: number;
}
export interface ResultadoValidacao { ok: boolean; mensagem: string; objeto?: string; tabelas?: number; linhas?: number; problemas?: string[]; duracaoMs?: number }

const TABELA_LOG = 'murade_backup_banco_log';

export function criarServicoBackupBanco(op: OpcoesServicoBackup) {
  const env = op.env || process.env;
  const agora = op.agora || (() => new Date());
  const prefixo = `${op.sistema}/`;
  const iniciadoEm = agora();
  const config = () => lerConfigBackup(env);
  const clienteS3 = (cfg: ConfigS3) => (op.criarClienteS3 ? op.criarClienteS3(cfg) : new ClienteS3(cfg));
  let rodando: { origem: OrigemBackup; desde: Date } | null = null;
  let validando = false;
  let ultimaValidacao: (ResultadoValidacao & { em: string }) | null = null;
  let tabelaPronta: Promise<void> | null = null;

  const garantirTabela = () => (tabelaPronta ??= op.consulta(`
    CREATE TABLE IF NOT EXISTS ${TABELA_LOG} (
      id BIGSERIAL PRIMARY KEY,
      sistema TEXT NOT NULL,
      origem TEXT NOT NULL,
      resultado TEXT NOT NULL,
      iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      finalizado_em TIMESTAMPTZ,
      objeto TEXT,
      tamanho_bytes BIGINT,
      sha256 TEXT,
      tabelas INTEGER,
      linhas BIGINT,
      duracao_ms INTEGER,
      erro TEXT,
      validado_em TIMESTAMPTZ,
      validacao_ok BOOLEAN,
      validacao_msg TEXT
    );
    CREATE INDEX IF NOT EXISTS ${TABELA_LOG}_sistema_idx ON ${TABELA_LOG} (sistema, iniciado_em DESC);
  `).then(() => undefined).catch((e) => { tabelaPronta = null; throw e; }));

  const seguro = (texto: unknown): string => {
    let t = String(texto ?? '');
    const c = config();
    for (const s of [c.chave, c.s3?.secretKey, c.s3?.accessKey, env.DATABASE_URL]) if (s && s.length >= 6) t = t.split(s).join('***');
    return t.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://***').slice(0, 400);
  };

  /** Execuções que ficaram "em andamento" por reinício/queda do servidor viram falha (nenhum processo as está rodando). */
  async function recuperarInterrompidos(): Promise<number> {
    try {
      await garantirTabela();
      const r = await op.consulta(`UPDATE ${TABELA_LOG} SET resultado='falha', finalizado_em=now(), erro='Interrompido: o servidor reiniciou durante o backup. O robô tenta de novo sozinho.' WHERE sistema=$1 AND resultado='andamento' AND iniciado_em < now() - interval '1 minute' RETURNING id`, [op.sistema]);
      return r.rows.length;
    } catch { return 0; }
  }

  async function ultimos() {
    await garantirTabela();
    const r = await op.consulta(`SELECT id, origem, resultado, iniciado_em, finalizado_em, objeto, tamanho_bytes::float8 AS tamanho_bytes, tabelas, linhas::float8 AS linhas, duracao_ms, erro, validado_em, validacao_ok, validacao_msg
      FROM ${TABELA_LOG} WHERE sistema=$1 ORDER BY iniciado_em DESC LIMIT 15`, [op.sistema]);
    return r.rows;
  }

  async function executar(origem: OrigemBackup): Promise<ResultadoBackup> {
    const cfg = config();
    if (!cfg.configurado) return { ok: false, codigo: 'sem_configuracao', motivo: 'Falta configurar o destino do backup (veja o passo a passo no painel).' };
    if (rodando) return { ok: false, codigo: 'ja_rodando', motivo: 'Já existe um backup em andamento. Aguarde terminar.' };
    rodando = { origem, desde: agora() };
    const inicio = Date.now();
    const s3 = clienteS3(cfg.s3!);
    const conexao = new Client({ ...op.conexaoBanco(), application_name: 'murade-backup-banco' });
    let idLog: number | null = null;
    let travaObtida = false;
    let conectado = false;
    let fonte: Readable | null = null;
    let gz: ReturnType<typeof createGzip> | null = null;
    const resumo: ResumoDump = { tabelas: {}, totalLinhas: 0, avisos: [] };
    const momento = agora();
    const objeto = nomeDoObjeto(prefixo, momento);
    try {
      await garantirTabela();
      const ins = await op.consulta(`INSERT INTO ${TABELA_LOG} (sistema, origem, resultado, iniciado_em, objeto) VALUES ($1,$2,'andamento',$4,$3) RETURNING id`, [op.sistema, origem, objeto, momento]);
      idLog = Number(ins.rows[0].id);
      await conexao.connect(); conectado = true;
      // Trava entre processos: nunca dois backups do mesmo sistema ao mesmo tempo, nem com duas instâncias no ar.
      const trava = await conexao.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`murade_backup_banco:${op.sistema}`]);
      travaObtida = trava.rows[0]?.ok === true;
      if (!travaObtida) {
        await op.consulta(`DELETE FROM ${TABELA_LOG} WHERE id=$1`, [idLog]); idLog = null;
        return { ok: false, codigo: 'ja_rodando', motivo: 'Outro processo já está fazendo o backup deste sistema agora.' };
      }
      fonte = Readable.from(gerarDump(conexao, resumo, { sistema: op.sistema, agora: momento }), { objectMode: false });
      gz = createGzip({ level: 6 });
      const cifrado = criarCifrador(cfg.chave!);
      const saida = fonte.pipe(gz).pipe(cifrado);
      fonte.on('error', (e) => gz!.destroy(e));
      gz.on('error', (e) => cifrado.destroy(e));
      const enviado = await s3.enviarFluxo(objeto, saida as AsyncIterable<Buffer>);
      const confere = await s3.tamanho(objeto);
      if (confere !== enviado.tamanho) throw new Error(`O destino guardou ${confere ?? 'nada'} bytes, mas enviei ${enviado.tamanho}. O backup não foi aceito.`);
      const manifesto = { formato: 'murade-backup-banco/1', sistema: op.sistema, objeto, geradoEm: momento.toISOString(), tamanhoBytes: enviado.tamanho, sha256: enviado.sha256, tabelas: resumo.tabelas, totalLinhas: resumo.totalLinhas, avisos: resumo.avisos };
      await s3.enviar(`${objeto}.json`, Buffer.from(JSON.stringify(manifesto)), 'application/json');
      const duracao = Date.now() - inicio;
      await op.consulta(`UPDATE ${TABELA_LOG} SET resultado='ok', finalizado_em=$7, tamanho_bytes=$2, sha256=$3, tabelas=$4, linhas=$5, duracao_ms=$6 WHERE id=$1`,
        [idLog, enviado.tamanho, enviado.sha256, Object.keys(resumo.tabelas).length, resumo.totalLinhas, duracao, agora()]);
      let apagados = 0; let avisoRet = '';
      try { apagados = await aplicarRetencao(s3); } catch (e: any) { avisoRet = ` (retenção não rodou: ${seguro(e?.message)})`; console.warn(`[Backup do banco ${op.sistema}] retenção falhou: ${seguro(e?.message)}`); }
      console.log(`[Backup do banco ${op.sistema}] ${origem}: ${objeto} — ${enviado.tamanho} bytes, ${Object.keys(resumo.tabelas).length} tabelas, ${resumo.totalLinhas} linhas, ${apagados} antigo(s) apagado(s)${avisoRet}`);
      return { ok: true, objeto, tamanhoBytes: enviado.tamanho, tabelas: Object.keys(resumo.tabelas).length, linhas: resumo.totalLinhas, duracaoMs: duracao, apagadosPorRetencao: apagados };
    } catch (erro: any) {
      const motivo = seguro(erro?.message || 'falha sem mensagem');
      console.error(`[Backup do banco ${op.sistema}] falhou: ${motivo}`);
      if (idLog) await op.consulta(`UPDATE ${TABELA_LOG} SET resultado='falha', finalizado_em=$4, erro=$2, duracao_ms=$3 WHERE id=$1`, [idLog, motivo, Date.now() - inicio, agora()]).catch(() => undefined);
      return { ok: false, codigo: 'falha', motivo };
    } finally {
      fonte?.destroy(); gz?.destroy();
      if (conectado) {
        if (travaObtida) await conexao.query('SELECT pg_advisory_unlock(hashtext($1))', [`murade_backup_banco:${op.sistema}`]).catch(() => undefined);
        await conexao.end().catch(() => undefined);
      }
      rodando = null;
    }
  }

  async function aplicarRetencao(s3: ClienteS3): Promise<number> {
    const todos = await s3.listar(prefixo);
    const apagar = escolherParaApagar(prefixo, todos);
    for (const chave of apagar) {
      // Só apaga o que tem exatamente o nome dos nossos backups no nosso prefixo (e o manifesto que o acompanha).
      if (!dataDoObjeto(prefixo, chave)) continue;
      await s3.apagar(chave);
      await s3.apagar(`${chave}.json`);
    }
    return apagar.length;
  }

  async function listar(): Promise<{ chave: string; tamanhoBytes: number; criadoEm: string }[]> {
    const cfg = config();
    if (!cfg.configurado) return [];
    const objetos: ObjetoS3[] = await clienteS3(cfg.s3!).listar(prefixo);
    return objetos.filter((o) => dataDoObjeto(prefixo, o.chave)).sort((a, b) => (dataDoObjeto(prefixo, b.chave)!.getTime() - dataDoObjeto(prefixo, a.chave)!.getTime()))
      .slice(0, 60).map((o) => ({ chave: o.chave, tamanhoBytes: o.tamanho, criadoEm: dataDoObjeto(prefixo, o.chave)!.toISOString() }));
  }

  /** Baixa, decifra, descomprime e confere o backup (contagem de linhas por tabela, SHA-256 e rodapé). Não escreve nada no banco do sistema. */
  async function validar(chaveObjeto?: string): Promise<ResultadoValidacao> {
    const r = await validarSemGuardar(chaveObjeto);
    ultimaValidacao = { ...r, em: agora().toISOString() };
    return r;
  }
  async function validarSemGuardar(chaveObjeto?: string): Promise<ResultadoValidacao> {
    const cfg = config();
    if (!cfg.configurado) return { ok: false, mensagem: 'Falta configurar o destino do backup (veja o passo a passo no painel).' };
    if (validando) return { ok: false, mensagem: 'Já estou conferindo um backup. Aguarde terminar.' };
    validando = true;
    const inicio = Date.now();
    try {
      const s3 = clienteS3(cfg.s3!);
      let objeto = chaveObjeto;
      if (objeto && (!objeto.startsWith(prefixo) || !dataDoObjeto(prefixo, objeto))) return { ok: false, mensagem: 'Esse arquivo não é um backup deste sistema.' };
      if (!objeto) objeto = (await listar())[0]?.chave;
      if (!objeto) return { ok: false, mensagem: 'Ainda não existe backup no destino para conferir.' };
      const texto = await s3.lerTexto(`${objeto}.json`);
      const manifesto = texto ? JSON.parse(texto) : null;
      const { fluxo } = await s3.ler(objeto);
      const hash = createHash('sha256');
      const medidor = new Transform({ transform(p: Buffer, _e, cb) { hash.update(p); cb(null, p); } });
      const decifra = criarDecifrador(cfg.chave!);
      const gunzip = createGunzip();
      let analise: Awaited<ReturnType<typeof analisarDump>> | null = null;
      const p1 = pipeline(fluxo, medidor, decifra, gunzip);
      const p2 = analisarDump(gunzip).then((a) => { analise = a; });
      await Promise.all([p1, p2]);
      const a = analise!;
      const problemas = [...a.problemas];
      const sha = hash.digest('hex');
      if (manifesto) {
        if (manifesto.sha256 && manifesto.sha256 !== sha) problemas.push('A impressão digital (SHA-256) do arquivo não bate com a registrada na hora do backup.');
        if (manifesto.totalLinhas !== undefined && manifesto.totalLinhas !== a.totalLinhas) problemas.push(`O backup tem ${a.totalLinhas} linhas e o registro diz ${manifesto.totalLinhas}.`);
      } else problemas.push('Não achei o registro (manifesto) que acompanha este backup.');
      if (a.cabecalho && a.cabecalho.sistema !== op.sistema) problemas.push(`O arquivo é de outro sistema (${a.cabecalho.sistema}).`);
      const ok = problemas.length === 0;
      const tabelas = Object.keys(a.contagem).length;
      const mensagem = ok ? `Backup conferido: decifrou, descomprimiu e as ${a.totalLinhas} linhas de ${tabelas} tabelas batem com o registro.` : `O backup tem problema: ${problemas.slice(0, 3).join(' ')}`;
      try { await garantirTabela(); await op.consulta(`UPDATE ${TABELA_LOG} SET validado_em=$5, validacao_ok=$3, validacao_msg=$4 WHERE sistema=$1 AND objeto=$2`, [op.sistema, objeto, ok, mensagem.slice(0, 400), agora()]); } catch { /* o resultado vale mesmo sem registrar */ }
      return { ok, mensagem, objeto, tabelas, linhas: a.totalLinhas, problemas, duracaoMs: Date.now() - inicio };
    } catch (erro: any) {
      return { ok: false, mensagem: `Não consegui conferir o backup: ${seguro(erro?.message)}`, duracaoMs: Date.now() - inicio };
    } finally { validando = false; }
  }

  /** Alerta do painel de Saúde dos robôs: mais de 26 h sem backup concluído (ou nunca concluído, com o sistema no ar há mais de 26 h). */
  function avaliarAlerta(cfg: ConfigLida, linhas: any[]): { nivel: 'aviso' | 'critico'; texto: string } | null {
    if (!cfg.configurado) return { nivel: 'aviso', texto: 'Backup do banco desligado: falta configurar o destino. Enquanto isso, se o Render deixar de existir, os dados deste sistema se perdem.' };
    const ultimoOk = linhas.find((l) => l.resultado === 'ok');
    const t = agora().getTime();
    if (ultimoOk) {
      const horas = (t - new Date(ultimoOk.finalizado_em || ultimoOk.iniciado_em).getTime()) / 3600_000;
      if (horas > LIMITE_ALERTA_HORAS) return { nivel: 'critico', texto: `Faz ${Math.floor(horas)} h sem backup do banco concluído (o limite é ${LIMITE_ALERTA_HORAS} h).${linhas[0]?.resultado === 'falha' && linhas[0]?.erro ? ` Último erro: ${linhas[0].erro}` : ''}` };
      return null;
    }
    const horasLigado = (t - iniciadoEm.getTime()) / 3600_000;
    if (horasLigado > LIMITE_ALERTA_HORAS) return { nivel: 'critico', texto: `Nenhum backup do banco foi concluído até agora.${linhas[0]?.erro ? ` Último erro: ${linhas[0].erro}` : ''}` };
    return { nivel: 'aviso', texto: 'Ainda não há backup do banco concluído. O robô faz o primeiro às 3h (Brasília) ou clique em "Fazer backup agora".' };
  }

  async function status() {
    const cfg = config();
    const base = {
      sistema: op.sistema, nomeSistema: op.nomeSistema, prefixo,
      configurado: cfg.configurado,
      faltando: cfg.faltando, avisosConfiguracao: cfg.avisos,
      passoAPasso: PASSO_A_PASSO_BACKUP,
      destino: cfg.configurado ? { bucket: cfg.s3!.bucket, servidor: (() => { try { return normalizarHost(cfg.s3!.endpoint); } catch { return ''; } })(), pasta: prefixo } : null,
      retencao: RETENCAO, limiteAlertaHoras: LIMITE_ALERTA_HORAS, horarioRobo: `${pad(HORA_DO_ROBO)}h (Brasília)`,
      emAndamento: rodando ? { origem: rodando.origem, desde: rodando.desde.toISOString() } : null,
      conferindo: validando,
      ultimaConferencia: ultimaValidacao,
    };
    let linhas: any[] = [];
    try { linhas = await ultimos(); } catch (e: any) { return { ...base, historico: [], ultimo: null, ultimoSucesso: null, horasSemBackup: null, alerta: avaliarAlerta(cfg, []), erroLeitura: seguro(e?.message) }; }
    const ultimoOk = linhas.find((l) => l.resultado === 'ok') || null;
    const horas = ultimoOk ? Math.round(((agora().getTime() - new Date(ultimoOk.finalizado_em || ultimoOk.iniciado_em).getTime()) / 3600_000) * 10) / 10 : null;
    const mapear = (l: any) => l && ({ id: Number(l.id), origem: l.origem, resultado: l.resultado, iniciadoEm: l.iniciado_em, finalizadoEm: l.finalizado_em, objeto: l.objeto, tamanhoBytes: l.tamanho_bytes, tabelas: l.tabelas, linhas: l.linhas, duracaoMs: l.duracao_ms, erro: l.erro, validadoEm: l.validado_em, validacaoOk: l.validacao_ok, validacaoMensagem: l.validacao_msg });
    return { ...base, ultimo: mapear(linhas[0]) || null, ultimoSucesso: mapear(ultimoOk), historico: linhas.slice(0, 10).map(mapear), horasSemBackup: horas, alerta: avaliarAlerta(cfg, linhas) };
  }

  /** Rodada do robô (a cada 10 min): dispara o backup do dia a partir das 3h (Brasília) se hoje ainda não houve backup concluído. */
  async function rodadaDoRobo(): Promise<{ resumo: string; alerta: { nivel: 'aviso' | 'critico'; texto: string } | null; falha?: string }> {
    const cfg = config();
    let linhas: any[] = [];
    try { linhas = await ultimos(); } catch (e: any) { return { resumo: `Não consegui ler o registro de backups: ${seguro(e?.message)}`, alerta: null }; }
    const alerta = avaliarAlerta(cfg, linhas);
    if (!cfg.configurado) return { resumo: 'Desligado: falta configurar o destino do backup do banco (passo a passo no painel do dono).', alerta };
    const t = agora();
    const hoje = diaBrasilia(t);
    const okHoje = linhas.some((l) => l.resultado === 'ok' && diaBrasilia(new Date(l.finalizado_em || l.iniciado_em)) === hoje);
    const falhaRecente = linhas[0]?.resultado === 'falha' && t.getTime() - new Date(linhas[0].finalizado_em || linhas[0].iniciado_em).getTime() < 3600_000;
    if (rodando) return { resumo: 'Backup do banco em andamento.', alerta };
    if (!okHoje && horaBrasilia(t) >= HORA_DO_ROBO && !falhaRecente) {
      const r = await executar('automatico');
      if (r.ok) return { resumo: `Backup do banco concluído: ${r.tabelas} tabelas, ${r.linhas} linhas, ${Math.round((r.tamanhoBytes || 0) / 1024)} KB cifrados; ${r.apagadosPorRetencao || 0} antigo(s) apagado(s) pela retenção.`, alerta: null };
      if (r.codigo === 'ja_rodando') return { resumo: 'Backup do banco em andamento (outro processo).', alerta };
      let depois: any[] = linhas;
      try { depois = await ultimos(); } catch { /* usa o que já tinha */ }
      return { resumo: `Backup do banco falhou: ${r.motivo}`, alerta: avaliarAlerta(cfg, depois), falha: `Backup do banco falhou: ${r.motivo}` };
    }
    const u = linhas.find((l) => l.resultado === 'ok');
    return { resumo: u ? `Em dia: último backup do banco em ${new Date(u.finalizado_em || u.iniciado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Próximo às ${pad(HORA_DO_ROBO)}h.` : `Aguardando o horário (${pad(HORA_DO_ROBO)}h) para o primeiro backup do banco.`, alerta };
  }

  return { config, status, executar, validar, listar, rodadaDoRobo, recuperarInterrompidos, escolherParaApagar: (o: { chave: string }[]) => escolherParaApagar(prefixo, o), prefixo };
}

function normalizarHost(endpoint: string): string {
  return new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`).host;
}

export type ServicoBackupBanco = ReturnType<typeof criarServicoBackupBanco>;
