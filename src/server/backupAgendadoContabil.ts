// Ligação do backup agendado (src/server/backupAgendado/, comum aos três sistemas) com os dados do Murade Contábil.
//
// Coleta: a MESMA leitura do backup mensal do escritório (backupEscritorioContabilService.coletarDadosDoEscritorio) —
// cadastro e o "workspace" contábil de cada empresa (plano de contas, lançamentos, pré-lançamentos, bens, livros, ECD/ECF),
// sem os campos do certificado A1.
//
// Restauração (só o administrador do escritório; prévia, cópia de segurança antes e duas confirmações na tela):
//  - cadastro das empresas e escrituração (workspace) voltam como estavam no backup; os campos do certificado de hoje
//    são mantidos (o backup não leva certificado);
//  - empresa com PERÍODO FECHADO depois do backup não é restaurada (o fechamento é preservado): reabra o período antes;
//  - a gravação do workspace usa a versão (version + 1) para não passar por cima de alguém salvando ao mesmo tempo, e o
//    mesmo validador do sistema (workspaceValido);
//  - nada é apagado; empresa que saiu do escritório não é recriada; fechamentos, auditorias e logins ficam como estão.
import { prepararTabelaHistorico } from './historicoLancamentosStore';
import { bancoTransacionalContabil, consultaBancoContabil, prepararAuthContabil, workspaceValido } from './authContabil';
import {
  coletarDadosDoEscritorio, listarBackupsEscritorio, lerZipBackupEscritorio, obterCnpjsDoEscritorio, removerCamposCertificado,
} from '../services/backupEscritorioContabilService';
import { emailConfigurado, enviarEmail } from './emailMurade';
import { criarServicoBackupAgendado, type AdaptadorRestauracao, type ItemPrevia, type Consultar } from './backupAgendado/servico';
import { jsonEstavel } from './backupAgendado/conteudo';

const consultar: Consultar = (sql, params) => consultaBancoContabil(sql, params as unknown[]) as any;
const igual = (a: unknown, b: unknown) => jsonEstavel(a) === jsonEstavel(b);

/** Põe de volta, no dado vindo do backup, os campos "certificado*" que existem hoje (o backup não leva certificado). */
export function reporCamposCertificado(doBackup: any, atual: any): any {
  if (!doBackup || typeof doBackup !== 'object' || Array.isArray(doBackup) || !atual || typeof atual !== 'object' || Array.isArray(atual)) return doBackup;
  const saida: Record<string, any> = { ...doBackup };
  for (const [k, v] of Object.entries(atual)) {
    if (/^certificado/i.test(k)) saida[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && saida[k] && typeof saida[k] === 'object' && !Array.isArray(saida[k])) saida[k] = reporCamposCertificado(saida[k], v);
  }
  return saida;
}

export const restauracaoContabil: AdaptadorRestauracao = {
  tabelas: [
    { nome: 'empresas', titulo: 'Cadastro das empresas', modo: 'sobrescrever' },
    { nome: 'workspaces_contabeis', titulo: 'Escrituração (plano de contas, lançamentos, bens, livros)', modo: 'sobrescrever' },
  ],
  // lancamentos_historico (exercícios guardados no histórico) volta junto com a escrituração de cada empresa, na mesma restauração.
  naoRestauradas: [
    { nome: 'fechamentos_periodo', titulo: 'Fechamentos de período', motivo: 'O fechamento nunca é desfeito pela restauração. Empresa com período fechado depois do backup não é restaurada.' },
    { nome: 'aprovacoes_lancamentos', titulo: 'Aprovações de lançamentos', motivo: 'É um registro de auditoria; fica como está.' },
    { nome: 'auditoria_lancamentos_manuais', titulo: 'Auditoria dos lançamentos manuais', motivo: 'É um registro de auditoria; fica como está.' },
    { nome: 'eventos_lancamentos_manuais', titulo: 'Eventos dos lançamentos manuais', motivo: 'É um registro de auditoria; fica como está.' },
    { nome: 'auditoria_saldo_inicial', titulo: 'Auditoria do saldo inicial', motivo: 'É um registro de auditoria; fica como está.' },
    { nome: 'equipe', titulo: 'Equipe e logins', motivo: 'Por segurança, logins, senhas e acessos nunca são trocados por uma restauração.' },
    { nome: 'acessos_empresas', titulo: 'Acessos às empresas', motivo: 'Por segurança, acessos nunca são trocados por uma restauração.' },
  ],
  async executar(_tenantId, cnpjs, tabelas, aplicar) {
    await prepararAuthContabil();
    const doEscritorio = new Set(cnpjs);
    const cnpjDe = (l: any) => String(l?.cnpj ?? '').trim();
    const itens: ItemPrevia[] = [];

    // Períodos fechados hoje que não estavam fechados no backup → aquela empresa não é restaurada.
    const fechadosNoBackup = new Set((tabelas.fechamentos_periodo || []).map((f: any) => `${cnpjDe(f)}|${f.competencia}`));
    const fechadosHoje = cnpjs.length ? (await consultar('SELECT cnpj, competencia FROM contabil_period_closures WHERE cnpj = ANY($1::text[])', [cnpjs])).rows : [];
    const bloqueadas = new Map<string, string[]>();
    for (const f of fechadosHoje) {
      if (fechadosNoBackup.has(`${cnpjDe(f)}|${f.competencia}`)) continue;
      if (!bloqueadas.has(cnpjDe(f))) bloqueadas.set(cnpjDe(f), []);
      bloqueadas.get(cnpjDe(f))!.push(String(f.competencia));
    }

    // Empresas
    {
      const linhas = (tabelas.empresas || []).filter((l: any) => cnpjDe(l));
      const item: ItemPrevia = { nome: 'empresas', titulo: 'Cadastro das empresas', modo: 'sobrescrever', noBackup: linhas.length, iguais: 0, alterar: 0, recriar: 0, ficamComoEstao: 0, foraDoEscritorio: 0 };
      const atuais = cnpjs.length ? (await consultar('SELECT cnpj, dados FROM contabil_empresas_compartilhadas WHERE cnpj = ANY($1::text[])', [cnpjs])).rows : [];
      const mapa = new Map(atuais.map((r: any) => [cnpjDe(r), r.dados]));
      const vistos = new Set<string>();
      for (const l of linhas) {
        const cnpj = cnpjDe(l);
        if (!doEscritorio.has(cnpj)) { item.foraDoEscritorio! += 1; continue; }
        vistos.add(cnpj);
        const atual = mapa.get(cnpj);
        if (atual !== undefined && igual(removerCamposCertificado(atual), l.dados)) { item.iguais += 1; continue; }
        if (atual === undefined) item.recriar += 1; else item.alterar += 1;
        if (aplicar) {
          await consultar(`INSERT INTO contabil_empresas_compartilhadas (cnpj, dados, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (cnpj) DO UPDATE SET dados = EXCLUDED.dados, updated_at = now()`,
            [cnpj, JSON.stringify(reporCamposCertificado(l.dados, atual))]);
        }
      }
      item.ficamComoEstao = [...mapa.keys()].filter((c) => !vistos.has(c)).length;
      if (item.foraDoEscritorio) item.observacao = `${item.foraDoEscritorio} empresa(s) do backup não estão mais no escritório e não serão recriadas.`;
      itens.push(item);
    }

    // Escrituração (workspace)
    {
      const linhas = (tabelas.workspaces_contabeis || []).filter((l: any) => cnpjDe(l) && l.payload);
      const item: ItemPrevia = { nome: 'workspaces_contabeis', titulo: 'Escrituração (plano de contas, lançamentos, bens, livros)', modo: 'sobrescrever', noBackup: linhas.length, iguais: 0, alterar: 0, recriar: 0, ficamComoEstao: 0, foraDoEscritorio: 0 };
      const atuais = cnpjs.length ? (await consultar('SELECT cnpj, payload, version FROM contabil_company_workspaces WHERE cnpj = ANY($1::text[])', [cnpjs])).rows : [];
      const mapa = new Map(atuais.map((r: any) => [cnpjDe(r), r]));
      const vistos = new Set<string>();
      const travadas: string[] = [];
      for (const l of linhas) {
        const cnpj = cnpjDe(l);
        if (!doEscritorio.has(cnpj)) { item.foraDoEscritorio! += 1; continue; }
        vistos.add(cnpj);
        const atual = mapa.get(cnpj);
        if (atual && igual(removerCamposCertificado(atual.payload), l.payload)) { item.iguais += 1; continue; }
        if (bloqueadas.has(cnpj)) { travadas.push(`${cnpj} (${bloqueadas.get(cnpj)!.sort().join(', ')})`); continue; }
        const novo = reporCamposCertificado(l.payload, atual?.payload);
        if (!workspaceValido(novo)) { travadas.push(`${cnpj} (escrituração do backup não passou no validador)`); continue; }
        // Histórico guardado (exercícios antigos fora do documento): volta junto com o documento, do mesmo backup.
        const historicoDoBackup = (tabelas.lancamentos_historico || []).filter((h: any) => cnpjDe(h) === cnpj);
        if (novo.historicoArquivado && !historicoDoBackup.length) { travadas.push(`${cnpj} (o backup não tem os exercícios guardados no histórico desta empresa)`); continue; }
        if (atual) item.alterar += 1; else item.recriar += 1;
        if (aplicar) {
          const gravar = async (q: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>) => {
            if (atual) {
              const r = await q('UPDATE contabil_company_workspaces SET payload = $2::jsonb, version = version + 1, updated_at = now() WHERE cnpj = $1 AND version = $3', [cnpj, JSON.stringify(novo), atual.version]);
              if (!(r.rowCount ?? 0)) throw new Error(`A escrituração da empresa ${cnpj} foi salva por outra pessoa agora há pouco. Nada mais foi restaurado dela; veja a prévia de novo.`);
            } else {
              await q('INSERT INTO contabil_company_workspaces (cnpj, payload, version, updated_at) VALUES ($1, $2::jsonb, 1, now()) ON CONFLICT (cnpj) DO NOTHING', [cnpj, JSON.stringify(novo)]);
            }
          };
          const temHistoricoHoje = Boolean((await consultar("SELECT to_regclass('contabil_lancamentos_historico') AS t")).rows[0]?.t);
          if (!historicoDoBackup.length && !temHistoricoHoje) await gravar(consultar);
          else {
            // Histórico guardado: o documento e o histórico voltam juntos, numa transação (o do backup substitui o de hoje).
            await prepararTabelaHistorico(consultar);
            await bancoTransacionalContabil().transacao(async (q) => {
              await gravar(q);
              await q('DELETE FROM contabil_lancamentos_historico WHERE cnpj = $1', [cnpj]);
              for (const h of historicoDoBackup) {
                await q('INSERT INTO contabil_lancamentos_historico (cnpj, competencia, origem, parte, lancamentos, pre_lancamentos, quantidade, guardado_em, guardado_por) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,COALESCE($8::timestamptz, now()),$9)',
                  [cnpj, h.competencia, h.origem, h.parte, JSON.stringify(h.lancamentos || []), JSON.stringify(h.pre_lancamentos || []), h.quantidade, h.guardado_em ?? null, h.guardado_por ?? null]);
              }
            });
          }
        }
      }
      item.ficamComoEstao = [...mapa.keys()].filter((c) => !vistos.has(c)).length + travadas.length;
      const obs: string[] = [];
      if (travadas.length) obs.push(`Não restauradas (ficam como estão): ${travadas.join('; ')}. Período fechado depois do backup: reabra o período no Contábil antes, se quiser mesmo voltar.`);
      if (item.foraDoEscritorio) obs.push(`${item.foraDoEscritorio} empresa(s) do backup não estão mais no escritório.`);
      if (obs.length) item.observacao = obs.join(' ');
      itens.push(item);
    }
    return itens;
  },
};

export const servicoBackupAgendadoContabil = criarServicoBackupAgendado({
  sistema: 'contabil', nomeSistema: 'Murad Contábil', prefixo: 'murade_contabil', consultar,
  async cnpjsDoEscritorio(tenantId) { await prepararAuthContabil(); return obterCnpjsDoEscritorio(consultar, tenantId); },
  async coletar(tenantId, cnpjs) { await prepararAuthContabil(); return coletarDadosDoEscritorio(consultar, tenantId, cnpjs); },
  async escritorios() {
    await prepararAuthContabil();
    const r = await consultar('SELECT id, login FROM contabil_auth_users WHERE global_admin = true AND disabled = false');
    return r.rows.map((u: any) => ({ id: String(u.id), login: String(u.login) }));
  },
  async usuarios(tenantId) {
    const r = await consultar('SELECT id, login, global_admin FROM contabil_auth_users WHERE (tenant_id::text = $1 OR id::text = $1) AND disabled = false ORDER BY login', [tenantId]);
    return r.rows.map((u: any) => ({ login: String(u.login), administrador: u.global_admin === true && String(u.id) === tenantId }));
  },
  mensal: {
    async listar(tenantId) { return (await listarBackupsEscritorio(consultar, tenantId)).map((b) => ({ id: b.id, periodo: b.periodo, criadoEm: b.criadoEm, tamanhoBytes: b.tamanhoBytes, ok: b.status === 'ok' && b.verificado })); },
    lerZip: (tenantId, id) => lerZipBackupEscritorio(consultar, tenantId, id),
  },
  restauracao: restauracaoContabil,
  email: { configurado: emailConfigurado, enviar: (para, assunto, texto, cc) => enviarEmail(para, assunto, texto, cc) },
});
