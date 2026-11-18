import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Anti-retrabalho do Contábil: quando duas pessoas do mesmo escritório (ou uma pessoa e o robô) fazem o mesmo
// serviço, o segundo é avisado ou barrado, com o nome de quem fez e a hora.
//
// Regras que valem em todo este módulo:
//  - Só BLOQUEIA quando o registro anterior é 'concluido' com sucesso. Falhou, expirou ou nunca existiu: libera.
//  - FAIL-OPEN: qualquer erro ao ler ou gravar o registro libera o serviço (e é logado). Este recurso nunca pode
//    impedir a entrada de notas/lançamentos nem um fechamento.
//  - Tudo isolado por escritório (tenant_id). Guarda só metadados (quem, quando, o quê), nunca o conteúdo.
//  - Recebimento do Fiscal/DP (rotas /api/integracao/*) NÃO passa por aqui: é servidor a servidor e idempotente.

export type EstadoServico = 'fazendo' | 'concluido' | 'falhou';
export type OrigemServico = 'pessoa' | 'robo';

export interface RegistroServico {
  tenantId: string;
  chave: string;
  tipo: string;
  cnpj: string | null;
  referencia: string | null;
  estado: EstadoServico;
  porUserId: string | null;
  porLogin: string | null;
  porNome: string | null;
  porOrigem: OrigemServico;
  em: Date | string;
  expiraEm: Date | string | null;
  detalhe: string | null;
  atualizadoEm: Date | string;
}

export interface UsuarioAtual { userId: string; login: string; nome?: string | null }

export type AcaoDecisao = 'liberar' | 'avisar_fazendo' | 'bloquear_ja_feito';
export interface Decisao { acao: AcaoDecisao; mensagem: string; feitoPor?: string; feitoEm?: string; origem?: OrigemServico }

export const TEMPO_FAZENDO_MS = 15 * 60_000;
export const DIAS_GUARDA_REGISTRO = 120;
const FUSO = 'America/Sao_Paulo';

/** Como cada tipo de serviço é dito nas mensagens. */
export const TIPOS_SERVICO: Record<string, { rotulo: string; feito: string; fazendo: string }> = {
  'fechamento:periodo': { rotulo: 'o fechamento do período', feito: 'fechou', fazendo: 'fechando' },
  'contabilizacao:lote': { rotulo: 'a contabilização dos pré-lançamentos', feito: 'contabilizou', fazendo: 'contabilizando' },
  'decisao:lancamento': { rotulo: 'a decisão do lançamento manual', feito: 'decidiu', fazendo: 'decidindo' },
  'backup:escritorio': { rotulo: 'o backup mensal do escritório', feito: 'gerou', fazendo: 'gerando' },
};
const verbo = (tipo: string) => TIPOS_SERVICO[tipo] ?? { rotulo: 'este serviço', feito: 'fez', fazendo: 'fazendo' };

const paraData = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "17/11 às 13:37" no horário de Brasília. */
export function dataHoraBR(valor: Date | string): string {
  const d = paraData(valor);
  if (!d) return 'data desconhecida';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}
const horaBR = (valor: Date | string): string => dataHoraBR(valor).split(' às ')[1] ?? '';

/** Nome de quem fez: nome guardado; senão o login; "o robô" para o robô. */
export function nomeDeQuemFez(r: Pick<RegistroServico, 'porNome' | 'porLogin' | 'porOrigem'>): string {
  if (r.porOrigem === 'robo') return 'o robô';
  const nome = (r.porNome || '').trim();
  return nome || (r.porLogin || '').trim() || 'outra pessoa';
}
const comArtigo = (nome: string) => (nome === 'o robô' ? 'O robô' : nome);

/**
 * Decisão pura: o que fazer, dado o último registro do serviço e quem está tentando fazer agora.
 *  - sem registro, 'falhou', ou 'fazendo' vencido: liberar;
 *  - 'fazendo' por outra pessoa/robô ainda dentro do prazo: avisar_fazendo (a pessoa pode confirmar);
 *  - 'fazendo' pela própria pessoa: liberar;
 *  - 'concluido': bloquear_ja_feito (inclusive se foi a própria pessoa: "Você já ...").
 */
export function decidir(registro: RegistroServico | null | undefined, usuarioAtual: UsuarioAtual, agora: Date = new Date()): Decisao {
  if (!registro || registro.estado === 'falhou') return { acao: 'liberar', mensagem: '' };
  const t = verbo(registro.tipo);
  const eu = registro.porOrigem === 'pessoa' && registro.porUserId != null && registro.porUserId === usuarioAtual.userId;
  const nome = nomeDeQuemFez(registro);
  if (registro.estado === 'fazendo') {
    const expira = paraData(registro.expiraEm);
    if (!expira || expira.getTime() <= agora.getTime()) return { acao: 'liberar', mensagem: '' };
    if (eu) return { acao: 'liberar', mensagem: '' };
    const desde = horaBR(registro.em);
    return {
      acao: 'avisar_fazendo',
      mensagem: registro.porOrigem === 'robo' ? `O robô está ${t.fazendo} isto agora (desde ${desde}).` : `${nome} está ${t.fazendo} isto agora (desde ${desde}).`,
      feitoPor: nome, feitoEm: paraData(registro.em)?.toISOString(), origem: registro.porOrigem,
    };
  }
  if (registro.estado === 'concluido') {
    const quando = dataHoraBR(registro.atualizadoEm || registro.em);
    const quem = registro.porOrigem === 'robo' ? 'O robô' : eu ? 'Você' : comArtigo(nome);
    const refeito = registro.porOrigem === 'robo' ? 'fez' : t.feito;
    return {
      acao: 'bloquear_ja_feito',
      mensagem: `${quem} já ${refeito} isto em ${quando}. Não precisa fazer de novo.`,
      feitoPor: nome, feitoEm: paraData(registro.atualizadoEm || registro.em)?.toISOString(), origem: registro.porOrigem,
    };
  }
  return { acao: 'liberar', mensagem: '' };
}

// ---------------------------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------------------------
export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export const TABELA_SERVICO = 'contabil_servico_registro';

export const chaveServico = (tipo: string, cnpj: string | null, referencia: string | null): string => `${tipo}|${cnpj ?? ''}|${referencia ?? ''}`;
export const resumoReferencias = (refs: string[]): string => createHash('sha256').update([...refs].sort().join('\n')).digest('hex').slice(0, 16);

const deLinha = (l: any): RegistroServico => ({
  tenantId: l.tenant_id, chave: l.chave, tipo: l.tipo, cnpj: l.cnpj ?? null, referencia: l.referencia ?? null, estado: l.estado,
  porUserId: l.por_user_id ?? null, porLogin: l.por_login ?? null, porNome: l.por_nome ?? null, porOrigem: l.por_origem === 'robo' ? 'robo' : 'pessoa',
  em: l.em, expiraEm: l.expira_em ?? null, detalhe: l.detalhe ?? null, atualizadoEm: l.atualizado_em,
});

export interface ContadoresServico { bloqueios: number; avisos: number; liberadosPorFalha: number }

export function criarServicoFeito(consultar: Consultar, opcoes: { agora?: () => Date } = {}) {
  const agora = opcoes.agora ?? (() => new Date());
  const contadores: ContadoresServico = { bloqueios: 0, avisos: 0, liberadosPorFalha: 0 };
  let pronta: Promise<void> | null = null;
  const garantirTabela = () => {
    pronta ??= consultar(`
      CREATE TABLE IF NOT EXISTS ${TABELA_SERVICO} (
        tenant_id text NOT NULL, chave text NOT NULL, tipo text NOT NULL, cnpj text, referencia text,
        estado text NOT NULL, por_user_id text, por_login text, por_nome text, por_origem text NOT NULL DEFAULT 'pessoa',
        em timestamptz NOT NULL DEFAULT now(), expira_em timestamptz, detalhe text, atualizado_em timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, chave)
      );
      CREATE INDEX IF NOT EXISTS ${TABELA_SERVICO}_recentes_idx ON ${TABELA_SERVICO}(tenant_id, atualizado_em DESC);
    `).then(() => undefined).catch((erro) => { pronta = null; throw erro; });
    return pronta;
  };
  const falhaLiberada = (onde: string, erro: unknown) => {
    contadores.liberadosPorFalha += 1;
    console.error(`Serviço feito (${onde}): registro indisponível, serviço liberado.`, erro instanceof Error ? erro.message : erro);
  };

  async function ler(tenantId: string, chave: string): Promise<RegistroServico | null> {
    await garantirTabela();
    const r = await consultar(`SELECT * FROM ${TABELA_SERVICO} WHERE tenant_id=$1 AND chave=$2`, [tenantId, chave]);
    return r.rows[0] ? deLinha(r.rows[0]) : null;
  }

  async function gravar(tenantId: string, def: { chave: string; tipo: string; cnpj?: string | null; referencia?: string | null }, estado: EstadoServico, por: { userId?: string | null; login?: string | null; nome?: string | null; origem: OrigemServico }, detalhe?: string | null): Promise<void> {
    await garantirTabela();
    const expira = estado === 'fazendo' ? new Date(agora().getTime() + TEMPO_FAZENDO_MS) : null;
    await consultar(
      `INSERT INTO ${TABELA_SERVICO}(tenant_id,chave,tipo,cnpj,referencia,estado,por_user_id,por_login,por_nome,por_origem,em,expira_em,detalhe,atualizado_em)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11)
       ON CONFLICT (tenant_id,chave) DO UPDATE SET estado=EXCLUDED.estado, por_user_id=EXCLUDED.por_user_id, por_login=EXCLUDED.por_login, por_nome=EXCLUDED.por_nome,
         por_origem=EXCLUDED.por_origem, expira_em=EXCLUDED.expira_em, detalhe=COALESCE(EXCLUDED.detalhe, ${TABELA_SERVICO}.detalhe), atualizado_em=EXCLUDED.atualizado_em,
         em=CASE WHEN EXCLUDED.estado='fazendo' THEN EXCLUDED.em ELSE ${TABELA_SERVICO}.em END`,
      [tenantId, def.chave, def.tipo, def.cnpj ?? null, def.referencia ?? null, estado, por.userId ?? null, por.login ?? null, por.nome ?? null, por.origem, agora(), expira, detalhe ? detalhe.slice(0, 300) : null],
    );
  }

  /** Para o robô: se uma PESSOA já concluiu este serviço, ele pula (e o chamador conta isso no resultado). */
  async function jaConcluidoPorPessoa(tenantId: string, chave: string): Promise<RegistroServico | null> {
    try {
      const r = await ler(tenantId, chave);
      return r && r.estado === 'concluido' && r.porOrigem === 'pessoa' ? r : null;
    } catch (erro) { falhaLiberada('robô', erro); return null; }
  }

  async function registrarSemErro(tenantId: string, def: { chave: string; tipo: string; cnpj?: string | null; referencia?: string | null }, estado: EstadoServico, por: { userId?: string | null; login?: string | null; nome?: string | null; origem: OrigemServico }, detalhe?: string | null): Promise<void> {
    try { await gravar(tenantId, def, estado, por, detalhe); } catch (erro) { falhaLiberada('gravar', erro); }
  }

  /**
   * Executa uma rotina do robô só se nenhuma pessoa já concluiu o mesmo serviço; registra 'fazendo' e depois
   * 'concluido' (por_origem='robo') ou 'falhou'. Erro do registro nunca impede a rotina (fail-open).
   */
  async function executarComoRobo<T>(tenantId: string, def: { chave: string; tipo: string; cnpj?: string | null; referencia?: string | null }, rotina: () => Promise<T>): Promise<{ pulado: true; por: string } | { pulado: false; valor: T }> {
    const feito = await jaConcluidoPorPessoa(tenantId, def.chave);
    if (feito) return { pulado: true, por: nomeDeQuemFez(feito) };
    const por = { origem: 'robo' as const, login: 'robo', nome: null };
    await registrarSemErro(tenantId, def, 'fazendo', por);
    try {
      const valor = await rotina();
      await registrarSemErro(tenantId, def, 'concluido', por);
      return { pulado: false, valor };
    } catch (erro) {
      await registrarSemErro(tenantId, def, 'falhou', por, erro instanceof Error ? erro.message : String(erro));
      throw erro;
    }
  }

  async function listar(tenantId: string, filtros: { cnpjs?: string[] | null; cnpj?: string | null; tipo?: string | null; referencia?: string | null; porLogin?: string | null; porNome?: string | null; desde?: Date | null; limite?: number } = {}): Promise<RegistroServico[]> {
    await garantirTabela();
    const where = ['tenant_id=$1', `estado <> 'falhou'`]; const p: unknown[] = [tenantId];
    const add = (cond: string, v: unknown) => { p.push(v); where.push(cond.replace('?', `$${p.length}`)); };
    if (filtros.cnpj) add('cnpj = ?', filtros.cnpj);
    if (filtros.cnpjs) add('(cnpj IS NULL OR cnpj = ANY(?::text[]))', filtros.cnpjs);
    if (filtros.tipo) add('tipo = ?', filtros.tipo);
    if (filtros.referencia) add('referencia = ?', filtros.referencia);
    if (filtros.porLogin) add('lower(por_login) = ?', filtros.porLogin.toLowerCase());
    if (filtros.porNome) add(`(lower(coalesce(por_nome,'')) LIKE ? OR lower(coalesce(por_login,'')) LIKE ?)`, `%${filtros.porNome.toLowerCase().replace(/[%_]/g, '')}%`);
    if (filtros.desde) add('atualizado_em >= ?', filtros.desde);
    const r = await consultar(`SELECT * FROM ${TABELA_SERVICO} WHERE ${where.join(' AND ')} ORDER BY atualizado_em DESC LIMIT ${Math.max(1, Math.min(100, filtros.limite ?? 30))}`, p);
    return r.rows.map(deLinha);
  }

  /** Robô conferidor: vence os 'fazendo' esquecidos e apaga registros antigos. */
  async function manter(): Promise<{ expirados: number; apagados: number }> {
    await garantirTabela();
    const exp = await consultar(`UPDATE ${TABELA_SERVICO} SET estado='falhou', detalhe='Expirou sem concluir.', expira_em=NULL, atualizado_em=$1 WHERE estado='fazendo' AND expira_em IS NOT NULL AND expira_em <= $1`, [agora()]);
    const apg = await consultar(`DELETE FROM ${TABELA_SERVICO} WHERE atualizado_em < $1`, [new Date(agora().getTime() - DIAS_GUARDA_REGISTRO * 86_400_000)]);
    return { expirados: exp.rowCount ?? 0, apagados: apg.rowCount ?? 0 };
  }

  return { garantirTabela, ler, gravar, registrarSemErro, jaConcluidoPorPessoa, executarComoRobo, listar, manter, contadores, falhaLiberada };
}
export type ServicoFeito = ReturnType<typeof criarServicoFeito>;

// ---------------------------------------------------------------------------------------------
// Guarda de rota (Express)
// ---------------------------------------------------------------------------------------------
export type SessaoServico = { userId: string; login: string; tenantId?: string; escritorioDe?: string; administrador?: boolean };

export interface DefinicaoGuarda {
  tipo: string;
  /** Devolve a chave do serviço desta requisição, ou null para não guardar (ex.: dados insuficientes). */
  chave: (req: Request) => { cnpj: string | null; referencia: string | null; chave?: string } | null;
  /** Só liga onde "refazer" faz sentido (existe reabertura/retificação de verdade). */
  permiteRefazer?: boolean;
  /** Serviço já feito antes deste recurso existir (sem registro): devolve o registro equivalente. */
  legado?: (tenantId: string, cnpj: string | null, referencia: string | null) => Promise<RegistroServico | null>;
}

export interface DepsGuarda {
  servico: ServicoFeito;
  sessao: (req: Request) => SessaoServico | undefined;
  nomeDe: (userId: string) => Promise<string | null>;
}

export const tenantDaSessao = (s: SessaoServico): string => s.tenantId || s.escritorioDe || s.userId;

export function criarGuardaServico(deps: DepsGuarda) {
  return (def: DefinicaoGuarda) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let prosseguir: (() => void) | null = null;
    try {
      const sessao = deps.sessao(req);
      const alvo = sessao ? def.chave(req) : null;
      if (!sessao || !alvo) { next(); return; }
      const tenant = tenantDaSessao(sessao);
      const chave = alvo.chave ?? chaveServico(def.tipo, alvo.cnpj, alvo.referencia);
      const nome = await deps.nomeDe(sessao.userId).catch(() => null);
      const usuario: UsuarioAtual = { userId: sessao.userId, login: sessao.login, nome };

      let registro = await deps.servico.ler(tenant, chave);
      if ((!registro || registro.estado === 'falhou') && def.legado) registro = (await def.legado(tenant, alvo.cnpj, alvo.referencia).catch(() => null)) ?? registro;
      const decisao = decidir(registro, usuario);
      const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      let detalhe: string | null = null;

      if (decisao.acao === 'bloquear_ja_feito') {
        const quer = corpo.refazer === true;
        if (quer && def.permiteRefazer) {
          const motivo = typeof corpo.motivoRefazer === 'string' ? corpo.motivoRefazer.trim() : '';
          if (!sessao.administrador) { res.status(403).json({ sucesso: false, codigo: 'refazer_so_administrador', motivo: 'Só o administrador do escritório pode refazer um serviço já concluído.' }); return; }
          if (motivo.length < 3 || motivo.length > 200) { res.status(400).json({ sucesso: false, codigo: 'refazer_exige_motivo', motivo: 'Informe o motivo (3 a 200 caracteres) para fazer de novo.' }); return; }
          detalhe = `Refeito por administrador. Motivo: ${motivo}`;
        } else {
          deps.servico.contadores.bloqueios += 1;
          res.status(409).json({ sucesso: false, codigo: 'servico_ja_feito', motivo: decisao.mensagem, feitoPor: decisao.feitoPor, feitoEm: decisao.feitoEm, origem: decisao.origem, podeRefazer: Boolean(def.permiteRefazer && sessao.administrador) });
          return;
        }
      } else if (decisao.acao === 'avisar_fazendo' && corpo.confirmarFazendo !== true) {
        deps.servico.contadores.avisos += 1;
        res.status(409).json({ sucesso: false, codigo: 'servico_em_andamento', requerConfirmacao: true, motivo: decisao.mensagem, feitoPor: decisao.feitoPor, feitoEm: decisao.feitoEm, origem: decisao.origem });
        return;
      }

      const def2 = { chave, tipo: def.tipo, cnpj: alvo.cnpj, referencia: alvo.referencia };
      const por = { userId: sessao.userId, login: sessao.login, nome, origem: 'pessoa' as const };
      await deps.servico.registrarSemErro(tenant, def2, 'fazendo', por, detalhe);
      let fechado = false;
      const encerrar = (ok: boolean) => {
        if (fechado) return; fechado = true;
        void (async () => {
          // Falha minha não pode apagar o que outra pessoa concluiu (ou está fazendo) enquanto eu falhava.
          if (!ok) {
            const atual = await deps.servico.ler(tenant, chave).catch(() => null);
            if (atual && !(atual.estado === 'fazendo' && atual.porUserId === sessao.userId)) return;
          }
          await deps.servico.registrarSemErro(tenant, def2, ok ? 'concluido' : 'falhou', por, detalhe);
        })();
      };
      res.on('finish', () => encerrar(res.statusCode >= 200 && res.statusCode < 300));
      res.on('close', () => encerrar(res.writableFinished && res.statusCode >= 200 && res.statusCode < 300));
      prosseguir = () => next();
    } catch (erro) {
      deps.servico.falhaLiberada('guarda', erro);
      if (!prosseguir) prosseguir = () => next();
    }
    prosseguir?.();
  };
}

// ---------------------------------------------------------------------------------------------
// Texto para a tela e para a Agente
// ---------------------------------------------------------------------------------------------
export function descreverRegistro(r: RegistroServico): string {
  const t = verbo(r.tipo);
  const quem = r.porOrigem === 'robo' ? 'O robô' : nomeDeQuemFez(r);
  const ref = [r.referencia && r.referencia.length <= 30 ? r.referencia : null, r.cnpj].filter(Boolean).join(' / ');
  const quando = dataHoraBR(r.atualizadoEm || r.em);
  if (r.estado === 'fazendo') return `${quem} está ${t.fazendo} ${t.rotulo}${ref ? ` (${ref})` : ''} desde ${horaBR(r.em)}.`;
  return `${quem} ${r.porOrigem === 'robo' ? 'fez' : t.feito} ${t.rotulo}${ref ? ` (${ref})` : ''} em ${quando}.`;
}
