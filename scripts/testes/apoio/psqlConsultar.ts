// Postgres DE VERDADE para testes sem o pacote "pg": sobe um banco temporário com o initdb do sistema e consulta pelo psql.
// Sem os binários do Postgres, quem usa pula o teste. Usado pelos testes dos chamados para o supervisor (mesmo arquivo nos 3 sistemas).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BIN = '/usr/lib/postgresql/16/bin';
export const temPostgresLocal = existsSync(`${BIN}/initdb`) && existsSync('/usr/bin/psql') && spawnSync('id', ['postgres']).status === 0;

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('número inválido'); return String(v); }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function subirPostgres(): { consultar: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>; parar: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pgchamados-')); chmodSync(dir, 0o777);
  const porta = String(57000 + Math.floor(Math.random() * 1000));
  const comoPg = (cmd: string) => execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', cmd], { stdio: 'pipe' });
  comoPg(`${BIN}/initdb -D ${dir}/data -A trust -U postgres >/dev/null && ${BIN}/pg_ctl -D ${dir}/data -o '-p ${porta} -k ${dir} -c listen_addresses=' -l ${dir}/log -w start >/dev/null`);
  const psql = (sql: string) => execFileSync('psql', ['-h', dir, '-p', porta, '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const consultar = async (sql: string, params: unknown[] = []) => {
    let texto = sql;
    for (let i = params.length; i >= 1; i -= 1) texto = texto.split(`$${i}`).join(literal(params[i - 1]));
    if (!/^\s*(select|insert|update|delete|with)\b/i.test(texto)) { psql(texto); return { rows: [], rowCount: 0 }; }
    const saida = psql(`WITH t AS (${texto}) SELECT coalesce(json_agg(t), '[]'::json) FROM t`).trim();
    const rows = JSON.parse(saida || '[]');
    return { rows, rowCount: rows.length };
  };
  const parar = () => { try { comoPg(`${BIN}/pg_ctl -D ${dir}/data -m immediate stop >/dev/null`); } catch { /* já parado */ } rmSync(dir, { recursive: true, force: true }); };
  return { consultar, parar };
}
