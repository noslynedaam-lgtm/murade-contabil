// Migração pelo backup que sobrevive a uma publicação (pedido do dono, 27/11/2026: "pausar o backup, publicar e retornar sem o
// cliente ver"). Mesmo arquivo no Murad DP e no Murad Contábil (a gravação lá é por lotes pedidos pela tela).
//
// - Ao começar a gravar, a sessão (quem, quais empresas faltam, as escolhas da prévia, o resultado das já gravadas) fica no banco
//   (murade_<sistema>_migracao_sessoes) — sem dado de funcionário nem lançamento, só códigos, CNPJ e os números do resultado.
// - O arquivo enviado vai CIFRADO (AES-256-GCM do backup do banco, MURADE_BACKUP_CHAVE) para o S3 do backup (MURADE_BACKUP_S3_*),
//   em "<sistema>/migracao-em-andamento/<token>.mbk", ou fica num disco persistente (MURADE_MIGRACAO_DIR). Apagado ao terminar.
// - Publicação (SIGTERM): a gravação não começa empresa nova; a da vez termina se der tempo, senão é desfeita (Contábil: uma
//   transação por empresa) ou regravada inteira depois (DP: gravação por "upsert", repetir não duplica). As que faltaram voltam
//   à tela como "pausado", e a tela pede de novo sozinha; o servidor novo traz a sessão e o arquivo de volta e continua.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { ClienteS3 } from './backupBanco/s3';
import { criarCifrador, criarDecifrador } from './backupBanco/cripto';
import { lerConfigBackup } from './backupBanco/servico';
import { aoDesligar, estaDesligando } from './desligamento';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export interface ArquivoGuardado { tamanho: number; onde: 'disco' | 's3' | ''; chave: string; pronto: boolean }
export interface DadosSessaoGuardada {
  /** Escolhas da prévia de cada empresa que ainda falta gravar (cd → escolha). */
  previas: Record<string, unknown>;
  /** Resultado de cada empresa já gravada (cd → resultado): pedir de novo devolve o mesmo, sem gravar outra vez. */
  resultados: Record<string, unknown>;
  emAndamento: number | null;
  /** O que mais a sessão precisa (ex.: sentido da marca "ativa" do Contábil). */
  extras: Record<string, unknown>;
  arquivo: ArquivoGuardado;
}
export interface SessaoGuardada { token: string; userId: string; estado: 'gravando' | 'terminou'; dados: DadosSessaoGuardada; atualizadoEm: string }

/** Pasta do disco persistente (Render Disk) se o dono ligar MURADE_MIGRACAO_DIR; senão, null. */
export function pastaPersistente(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = String(env.MURADE_MIGRACAO_DIR ?? '').trim();
  return v && v.startsWith('/') ? v : null;
}

export interface GuardaArquivo { onde: 'disco' | 's3'; guardar(local: string, token: string): Promise<string>; trazer(chave: string, destino: string): Promise<void>; apagar(chave: string): Promise<void> }
export function guardaDoArquivo(sistema: string, env: NodeJS.ProcessEnv = process.env, leitor: typeof fetch = fetch): GuardaArquivo | null {
  if (pastaPersistente(env)) {
    return {
      onde: 'disco', guardar: async (local) => local,
      trazer: async (chave, destino) => { if (!fs.existsSync(chave)) throw new Error('O arquivo não está mais no disco.'); if (chave !== destino) fs.copyFileSync(chave, destino); },
      apagar: async (chave) => { try { fs.rmSync(chave, { force: true }); } catch { /* já não existe */ } },
    };
  }
  const cfg = lerConfigBackup(env);
  if (!cfg.configurado || !cfg.s3 || !cfg.chave) return null; // sem cifra, o arquivo do cliente nunca sai do servidor
  const s3 = new ClienteS3(cfg.s3, leitor); const chaveCifra = cfg.chave;
  const nome = (token: string) => `${sistema}/migracao-em-andamento/${token.replace(/[^a-f0-9]/gi, '')}.mbk`;
  return {
    onde: 's3',
    guardar: async (local, token) => {
      const chave = nome(token); const cifrador = criarCifrador(chaveCifra);
      const leitura = fs.createReadStream(local); leitura.on('error', (e) => cifrador.destroy(e)); leitura.pipe(cifrador);
      await s3.enviarFluxo(chave, cifrador as unknown as AsyncIterable<Buffer>);
      return chave;
    },
    trazer: async (chave, destino) => { const { fluxo } = await s3.ler(chave); await pipeline(fluxo as Readable, criarDecifrador(chaveCifra), fs.createWriteStream(destino, { mode: 0o600 })); },
    apagar: async (chave) => { await s3.apagar(chave); },
  };
}
export function descricaoGuarda(sistema: string, env: NodeJS.ProcessEnv = process.env): string {
  const g = guardaDoArquivo(sistema, env);
  if (!g) return 'nenhum: o arquivo fica só no disco temporário do servidor (numa publicação no meio, a tela pede o arquivo de novo; o que já gravou não duplica)';
  return g.onde === 'disco' ? 'disco persistente (MURADE_MIGRACAO_DIR)' : 'armazenamento S3 do backup, cifrado';
}

export interface RetomadaMigracao {
  tabela: string;
  salvar(token: string, userId: string, estado: 'gravando' | 'terminou', dados: DadosSessaoGuardada): Promise<void>;
  ler(token: string, userId: string): Promise<SessaoGuardada | null>;
  emAndamento(): Promise<SessaoGuardada[]>;
  /** Começa a guardar o arquivo fora do servidor (em segundo plano); `aoGuardar` recebe onde ficou. */
  guardarArquivo(token: string, local: string, tamanho: number, aoGuardar: (a: ArquivoGuardado) => void): void;
  /** Traz o arquivo de uma sessão guardada para `destino`. false = não há como (não foi guardado ou sumiu). */
  trazerArquivo(a: ArquivoGuardado, destino: string): Promise<boolean>;
  apagarArquivoGuardado(a: ArquivoGuardado, local: string): void;
  /** Marca uma gravação (um lote) em andamento; o SIGTERM espera os lotes terminarem. */
  comecarLote(): { pararAntesDaProxima(): boolean; desfazerAgora(): boolean; fim(): void };
  /** Pedido de pausa por publicação (para a tela e para os testes). */
  pedido(): 'nada' | 'depois' | 'agora';
  pausarParaDesligar(prazoMs: number): Promise<void>;
}

export function criarRetomadaMigracao(op: { sistema: 'dp' | 'contabil'; consultar: () => Q | null; registrarNoDesligamento?: boolean; env?: NodeJS.ProcessEnv; leitor?: typeof fetch }): RetomadaMigracao {
  const tabela = `murade_${op.sistema}_migracao_sessoes`;
  let preparada: Promise<void> | null = null;
  const q = (): Q => { const c = op.consultar(); if (!c) throw new Error('Banco não configurado.'); return c; };
  const preparar = () => (preparada ??= q()(`CREATE TABLE IF NOT EXISTS ${tabela} (token text PRIMARY KEY, user_id text NOT NULL, estado text NOT NULL, dados jsonb NOT NULL,
      criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now())`).then(() => undefined).catch((e) => { preparada = null; throw e; }));
  const linha = (r: any): SessaoGuardada => ({ token: String(r.token), userId: String(r.user_id), estado: r.estado, dados: r.dados, atualizadoEm: new Date(r.atualizado_em).toISOString() });
  let pedido: 'nada' | 'depois' | 'agora' = 'nada';
  const lotes = new Set<{ fim: () => void; acabou: Promise<void> }>();
  const env = op.env ?? process.env;
  const r: RetomadaMigracao = {
    tabela,
    async salvar(token, userId, estado, dados) {
      if (!op.consultar()) return;
      await preparar();
      await q()(`INSERT INTO ${tabela} (token, user_id, estado, dados, atualizado_em) VALUES ($1,$2,$3,$4::jsonb,now())
        ON CONFLICT (token) DO UPDATE SET estado=EXCLUDED.estado, dados=EXCLUDED.dados, atualizado_em=now() WHERE ${tabela}.user_id=EXCLUDED.user_id`, [token, userId, estado, JSON.stringify(dados)]);
      if (estado === 'terminou') await q()(`DELETE FROM ${tabela} WHERE estado='terminou' AND atualizado_em < now() - interval '2 days'`).catch(() => undefined);
    },
    async ler(token, userId) {
      if (!op.consultar() || !/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
      await preparar();
      const x = (await q()(`SELECT * FROM ${tabela} WHERE token=$1 AND user_id=$2`, [token, userId])).rows[0];
      return x ? linha(x) : null;
    },
    async emAndamento() {
      if (!op.consultar()) return [];
      await preparar();
      return (await q()(`SELECT * FROM ${tabela} WHERE estado='gravando' AND atualizado_em > now() - interval '1 day' ORDER BY criado_em`)).rows.map(linha);
    },
    guardarArquivo(token, local, tamanho, aoGuardar) {
      const g = guardaDoArquivo(op.sistema, env, op.leitor);
      if (!g) return;
      void g.guardar(local, token).then((chave) => aoGuardar({ tamanho, onde: g.onde, chave, pronto: true }))
        .catch((e) => console.error(`Migração (${op.sistema}): não consegui guardar o arquivo fora do servidor (a gravação continua):`, (e as Error)?.message || e));
    },
    async trazerArquivo(a, destino) {
      const g = guardaDoArquivo(op.sistema, env, op.leitor);
      if (fs.existsSync(destino) && fs.statSync(destino).size === a.tamanho) return true;
      if (!g || !a.pronto || a.onde !== g.onde || !a.chave) return false;
      try { fs.mkdirSync(path.dirname(destino), { recursive: true }); await g.trazer(a.chave, destino); return fs.statSync(destino).size === a.tamanho; }
      catch (e) { console.error(`Migração (${op.sistema}): não consegui trazer o arquivo guardado de volta:`, (e as Error)?.message || e); try { fs.rmSync(destino, { force: true }); } catch { /* nada */ } return false; }
    },
    apagarArquivoGuardado(a, local) {
      const g = guardaDoArquivo(op.sistema, env, op.leitor);
      if (g && a.pronto && a.chave && a.chave !== local) void g.apagar(a.chave).catch((e) => console.error(`Migração (${op.sistema}): não consegui apagar a cópia guardada do arquivo:`, (e as Error)?.message || e));
    },
    comecarLote() {
      let avisar: () => void = () => undefined;
      const item = { fim: () => avisar(), acabou: new Promise<void>((ok) => { avisar = ok; }) };
      lotes.add(item);
      return { pararAntesDaProxima: () => pedido !== 'nada' || estaDesligando(), desfazerAgora: () => pedido === 'agora', fim: () => { lotes.delete(item); item.fim(); } };
    },
    pedido: () => pedido,
    async pausarParaDesligar(prazoMs) {
      pedido = 'depois';
      const escalar = setTimeout(() => { pedido = 'agora'; }, Math.max(500, prazoMs - 6000)); escalar.unref?.();
      await Promise.all([...lotes].map((l) => l.acabou));
      clearTimeout(escalar);
    },
  };
  if (op.registrarNoDesligamento !== false) aoDesligar(`migração pelo backup (${op.sistema === 'dp' ? 'DP' : 'Contábil'})`, (prazo) => r.pausarParaDesligar(prazo));
  return r;
}

/** Motivo que volta para a tela nas empresas que ficaram para depois da publicação (a tela pede de novo sozinha). */
export const MOTIVO_PAUSADO = 'Pausado por uma atualização do sistema; continua sozinho em instantes.';
