// Banco simulado para os testes do histórico guardado: o que a gravação da migração, o histórico e os robôs usam.
// As linhas do histórico ficam em arquivos numa pasta temporária (como no Postgres, fora da memória do Node), para a medida de
// memória do teste valer. O registro do sistema anterior guarda só bloco e quantidade (menos o resumo da migração, que a conferência lê).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BancoTransacional, ConsultaSql } from '../../../src/server/exclusaoEmpresaCascata';

export interface EstadoFalso { workspaces: Map<string, { payload: string; version: number }>; acesso: any[]; registro: Array<{ cnpj: string; bloco: string; quantidade: number; linhas?: any }>; historico: Map<string, { cnpj: string; competencia: string; origem: string; parte: number; quantidade: number; arquivo: string }>; regras: any[]; pasta: string; tabelaHistorico: boolean; fechadas: Array<{ cnpj: string; competencia: string }> }

export function bancoHistoricoFalso(opcoes: { guardarLinhasDoRegistro?: boolean } = {}) {
  const t: EstadoFalso = { workspaces: new Map(), acesso: [], registro: [], historico: new Map(), regras: [], pasta: fs.mkdtempSync(path.join(os.tmpdir(), 'murade-hist-falso-')), tabelaHistorico: false, fechadas: [] };
  let n = 0;
  const chave = (c: string, comp: string, o: string, p: number) => `${c}|${comp}|${o}|${p}`;
  const linhasDe = (cnpj: string) => [...t.historico.values()].filter((h) => h.cnpj === cnpj).sort((a, b) => a.competencia.localeCompare(b.competencia) || a.origem.localeCompare(b.origem) || a.parte - b.parte);
  const apagar = (filtro: (h: any) => boolean) => { let k = 0; for (const [id, h] of [...t.historico]) if (filtro(h)) { fs.rmSync(h.arquivo, { force: true }); t.historico.delete(id); k++; } return { rows: [], rowCount: k }; };
  const consultar: ConsultaSql = async (sql, p = []) => {
    const s = sql.trim();
    if (s.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (s.startsWith('CREATE TABLE IF NOT EXISTS contabil_lancamentos_historico')) { t.tabelaHistorico = true; return { rows: [] }; }
    if (/^CREATE TABLE/i.test(s)) return { rows: [] };
    if (s.includes("to_regclass('contabil_lancamentos_historico')")) return { rows: [{ t: t.tabelaHistorico ? 'contabil_lancamentos_historico' : null }] };
    if (s.includes("to_regclass('contabil_sistema_anterior')")) return { rows: [{ t: 'contabil_sistema_anterior' }] };
    // ---- histórico guardado
    if (s.startsWith('INSERT INTO contabil_lancamentos_historico')) {
      const arquivo = path.join(t.pasta, `${++n}.json`);
      fs.writeFileSync(arquivo, JSON.stringify({ l: JSON.parse(String(p[4])), p: JSON.parse(String(p[5])) }));
      const k = chave(String(p[0]), String(p[1]), String(p[2]), Number(p[3]));
      if (t.historico.has(k)) throw new Error('chave repetida no histórico');
      t.historico.set(k, { cnpj: String(p[0]), competencia: String(p[1]), origem: String(p[2]), parte: Number(p[3]), quantidade: Number(p[6]), arquivo });
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('DELETE FROM contabil_lancamentos_historico WHERE cnpj=$1 AND origem=$2')) return apagar((h) => h.cnpj === p[0] && h.origem === p[1]);
    if (s.startsWith('DELETE FROM contabil_lancamentos_historico WHERE cnpj=$1 AND competencia >= $2 AND competencia <= $3')) return apagar((h) => h.cnpj === p[0] && h.competencia >= String(p[1]) && h.competencia <= String(p[2]));
    if (/^DELETE FROM contabil_lancamentos_historico WHERE cnpj ?= ?\$1$/.test(s)) return apagar((h) => h.cnpj === p[0]);
    if (s.startsWith('SELECT substr(competencia,1,4)::int AS ano, origem')) {
      const g = new Map<string, { ano: number; origem: string; meses: Set<string>; n: number; de: string; ate: string }>();
      for (const h of linhasDe(String(p[0]))) { const k = `${h.competencia.slice(0, 4)}|${h.origem}`; const x = g.get(k) ?? { ano: Number(h.competencia.slice(0, 4)), origem: h.origem, meses: new Set(), n: 0, de: h.competencia, ate: h.competencia }; x.meses.add(h.competencia); x.n += h.quantidade; if (h.competencia < x.de) x.de = h.competencia; if (h.competencia > x.ate) x.ate = h.competencia; g.set(k, x); }
      return { rows: [...g.values()].sort((a, b) => a.ano - b.ano).map((x) => ({ ano: x.ano, origem: x.origem, meses: x.meses.size, n: x.n, de: x.de, ate: x.ate })) };
    }
    if (s.startsWith('SELECT competencia, origem, parte FROM contabil_lancamentos_historico')) {
      return { rows: linhasDe(String(p[0])).filter((h) => (p[1] == null || h.competencia >= String(p[1])) && (p[2] == null || h.competencia <= String(p[2])) && (p[3] == null || h.origem === p[3])).map((h) => ({ competencia: h.competencia, origem: h.origem, parte: h.parte })) };
    }
    if (s.startsWith('SELECT lancamentos, pre_lancamentos FROM contabil_lancamentos_historico')) {
      const h = t.historico.get(chave(String(p[0]), String(p[1]), String(p[2]), Number(p[3])));
      if (!h) return { rows: [] };
      const x = JSON.parse(fs.readFileSync(h.arquivo, 'utf8'));
      return { rows: [{ lancamentos: x.l, pre_lancamentos: x.p }] };
    }
    if (s.startsWith('SELECT 1 FROM contabil_lancamentos_historico WHERE cnpj=$1 AND competencia=$2 AND origem=$3')) return { rows: linhasDe(String(p[0])).filter((h) => h.competencia === p[1] && h.origem === p[2]).slice(0, 1).map(() => ({ '?column?': 1 })) };
    if (s.startsWith('SELECT DISTINCT cnpj FROM contabil_lancamentos_historico UNION')) {
      const c = new Set<string>([...t.historico.values()].map((h) => h.cnpj));
      for (const [k, w] of t.workspaces) if (JSON.parse(w.payload).historicoArquivado) c.add(k);
      return { rows: [...c].sort().map((cnpj) => ({ cnpj })) };
    }
    // ---- documento da empresa, acesso, cadastro, fechamentos
    if (s.includes('FROM contabil_auth_company_access a JOIN contabil_auth_users u')) return { rows: [] };
    if (s.startsWith('SELECT payload,version FROM contabil_company_workspaces') || s.startsWith('SELECT payload FROM contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0])); return { rows: w ? [{ payload: JSON.parse(w.payload), version: w.version }] : [] }; }
    if (s.startsWith('SELECT competencia FROM contabil_period_closures')) return { rows: t.fechadas.filter((f) => f.cnpj === p[0]).map((f) => ({ competencia: f.competencia })) };
    if (s.startsWith('SELECT dados FROM contabil_empresas_compartilhadas')) return { rows: [] };
    if (s.startsWith('UPDATE contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0]))!; w.payload = String(p[1]); w.version++; return { rows: [{ version: w.version, updated_at: new Date() }], rowCount: 1 }; }
    if (s.startsWith('INSERT INTO contabil_company_workspaces')) { t.workspaces.set(String(p[0]), { payload: String(p[1]), version: 1 }); return { rows: [{ version: 1 }] }; }
    if (s.startsWith('INSERT INTO contabil_auth_company_access')) { t.acesso.push({ user_id: p[0], cnpj: p[1] }); return { rows: [] }; }
    // ---- registro do sistema anterior
    if (s.startsWith('DELETE FROM contabil_sistema_anterior')) { t.registro = t.registro.filter((r) => r.cnpj !== p[0] || (p[1] !== undefined && r.bloco === p[1] && s.includes('bloco<>'))); return { rows: [] }; }
    if (s.startsWith('INSERT INTO contabil_sistema_anterior')) { t.registro.push({ cnpj: String(p[0]), bloco: String(p[1]), quantidade: Number(p[3]), ...(opcoes.guardarLinhasDoRegistro || String(p[1]).startsWith('__') ? { linhas: JSON.parse(String(p[2])) } : {}) }); return { rows: [] }; }
    if (s.startsWith('SELECT bloco, quantidade, migrado_em, CASE WHEN bloco=$2 THEN linhas END AS resumo FROM contabil_sistema_anterior')) {
      return { rows: t.registro.filter((r) => r.cnpj === p[0]).map((r) => ({ bloco: r.bloco, quantidade: r.quantidade, migrado_em: new Date(), resumo: r.bloco === p[1] ? r.linhas : null })) };
    }
    // ---- regras de integração (de-para do sistema anterior)
    if (s.includes('contabil_regras_integracao_fiscal')) {
      if (s.startsWith('DELETE')) { t.regras = t.regras.filter((r) => r.cnpj !== p[0]); return { rows: [] }; }
      if (s.startsWith('INSERT')) { for (const x of JSON.parse(String(p[1]))) t.regras.push({ cnpj: p[0], ...x }); return { rows: [] }; }
      if (s.startsWith('SELECT count(*)::int AS n')) return { rows: [{ n: t.regras.filter((r) => r.cnpj === p[0]).length }] };
      return { rows: [] };
    }
    throw new Error(`SQL não previsto no banco falso: ${s.slice(0, 100)}`);
  };
  const banco: BancoTransacional = { consultar, async transacao(fn) { return fn(consultar); } };
  const limpar = () => fs.rmSync(t.pasta, { recursive: true, force: true });
  return { banco, consultar, t, limpar };
}
