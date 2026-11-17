// Restaura o backup completo do banco (gerado pelo painel "Backup completo do banco") num banco PostgreSQL NOVO E VAZIO.
//
// Como usar (no seu computador, na pasta do sistema):
//   DATABASE_URL_RESTAURAR="postgres://usuario:senha@servidor/banco_novo" MURADE_BACKUP_CHAVE="a chave do backup" \
//     npx tsx scripts/restaurar-backup.ts --arquivo caminho/do/backup.mbk
// ou direto do destino (com as mesmas variáveis MURADE_BACKUP_S3_* do Render):
//     npx tsx scripts/restaurar-backup.ts --sistema contabil --ultimo          (ou --objeto contabil/banco-AAAAMMDDTHHMMSSZ.mbk)
//
// Trava de segurança: só restaura se o banco de destino estiver vazio e diferente do DATABASE_URL do sistema, e só depois de
// você digitar o nome do banco. A restauração é uma transação única: se falhar, o banco continua vazio.
import readline from 'node:readline';
import { restaurarBackup } from '../src/server/backupBanco/restaurar';
import { lerConfigBackup } from '../src/server/backupBanco/servico';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  if (i >= 0) return process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : '';
  const com = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return com ? com.slice(nome.length + 3) : undefined;
}

async function principal(): Promise<number> {
  const chave = (process.env.MURADE_BACKUP_CHAVE || '').trim();
  if (!chave) { console.error('Falta a chave do backup: defina MURADE_BACKUP_CHAVE (a mesma configurada no Render).'); return 2; }
  const arquivo = argumento('arquivo');
  const objeto = argumento('objeto');
  const ultimo = argumento('ultimo') !== undefined;
  const sistema = argumento('sistema');
  let s3: { cfg: any; sistema: string; objeto?: string } | undefined;
  if (!arquivo) {
    const cfg = lerConfigBackup(process.env);
    if (!cfg.configurado) { console.error(`Sem --arquivo, preciso do destino S3. Faltam: ${cfg.faltando.map((f) => f.variavel).join(', ')}.`); return 2; }
    const sis = sistema || (objeto ? objeto.split('/')[0] : '');
    if (!sis || !['dp', 'contabil', 'fiscal'].includes(sis)) { console.error('Diga qual sistema: --sistema dp|contabil|fiscal (ou use --objeto com o caminho completo).'); return 2; }
    if (!objeto && !ultimo) { console.error('Diga qual backup: --ultimo ou --objeto <caminho>.'); return 2; }
    s3 = { cfg: cfg.s3!, sistema: sis, objeto: objeto || undefined };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const perguntar = (t: string) => new Promise<string>((res) => rl.question(t, res));
  const r = await restaurarBackup({
    urlDestino: process.env.DATABASE_URL_RESTAURAR || '', urlBancoDoSistema: process.env.DATABASE_URL, chave, arquivo: arquivo || undefined, s3,
    perguntar, confirmacaoInformada: argumento('confirmo-banco'), escrever: (t) => console.log(t),
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  rl.close();
  console.log(r.ok ? `OK. ${r.mensagem}` : `NÃO FOI FEITO. ${r.mensagem}`);
  return r.ok ? 0 : 1;
}
principal().then((c) => process.exit(c), (e) => { console.error('Erro inesperado:', String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://***')); process.exit(1); });
