import type { Express, NextFunction, Request, Response } from 'express';

// Tarefas da equipe do escritório: a administradora delega serviço a alguém da equipe (por tela, chat ou voz da Agente IA)
// e a pessoa recebe o pedido pronto, com aviso na tela. Quem pediu vê quando foi visto e quando foi concluído.
// Tudo é isolado por escritório (tenant): nenhuma consulta sai sem o tenant da sessão.
// A tarefa é gravada ANTES de qualquer aviso; falhar ao avisar nunca perde a tarefa (o robô refaz o aviso).

export type SessaoTarefas = { userId: string; login: string; tenantId?: string; escritorioDe?: string; administrador: boolean; cnpjs: string[] };
export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
export type Pessoa = { id: string; login: string; nome: string | null };
export type EmpresaRef = { cnpj: string; nome: string };

export const TABELA_TAREFAS = 'contabil_tarefas_equipe';
export const TABELA_AVISOS = 'contabil_tarefas_equipe_avisos';
export const HORAS_UTEIS_SEM_VER = 2;

// ---------------------------------------------------------------------------------------------
// Texto e nomes (puro, testável)
// ---------------------------------------------------------------------------------------------
export const normalizarTexto = (v: unknown): string => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@. ]+/g, ' ').replace(/\s+/g, ' ').trim();
const palavras = (v: string): string[] => v.split(/[^a-z0-9]+/).filter(Boolean);
export const nomeDaPessoa = (p: Pessoa): string => (p.nome && p.nome.trim()) || p.login;
export const cnpjLimpo = (v: unknown): string | null => { const d = String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
export const formatarCnpj = (c: string): string => (/^\d{14}$/.test(c) ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
export const formatarDataBr = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

export type Achado<T> = { tipo: 'unico'; item: T } | { tipo: 'ambiguo'; itens: T[] } | { tipo: 'nenhum' };

/**
 * Acha UM item pelo texto dito/digitado (sem acento, maiúscula ou ordem das palavras). Em ordem de rigor:
 * texto igual a um dos nomes; todas as palavras iguais a palavras do nome; palavras iniciando palavras do nome (3+ letras);
 * texto contido no nome (3+ letras). Usa o primeiro nível que achar alguém: se achar mais de um, devolve "ambíguo".
 * Nunca escolhe entre dois.
 */
export function acharPorNome<T>(itens: T[], texto: string, chaves: (t: T) => string[]): Achado<T> {
  const q = normalizarTexto(texto);
  if (!q) return { tipo: 'nenhum' };
  const qp = palavras(q);
  const prep = itens.map((item) => { const ks = chaves(item).map(normalizarTexto).filter(Boolean); return { item, ks, ps: new Set(ks.flatMap(palavras)) }; });
  const niveis: Array<(x: (typeof prep)[number]) => boolean> = [
    (x) => x.ks.includes(q),
    (x) => qp.length > 0 && qp.every((p) => x.ps.has(p)),
    (x) => q.length >= 3 && qp.every((p) => [...x.ps].some((w) => w.startsWith(p))),
    (x) => q.length >= 3 && x.ks.some((k) => k.includes(q)),
  ];
  for (const nivel of niveis) {
    const achados = prep.filter(nivel).map((x) => x.item);
    if (achados.length === 1) return { tipo: 'unico', item: achados[0] };
    if (achados.length > 1) return { tipo: 'ambiguo', itens: achados };
  }
  return { tipo: 'nenhum' };
}

const chavesPessoa = (p: Pessoa): string[] => [p.nome || '', p.login, p.login.split('@')[0].replace(/[._-]+/g, ' ')];
export const acharPessoa = (pessoas: Pessoa[], texto: string): Achado<Pessoa> => {
  const login = String(texto ?? '').trim().toLowerCase();
  const exato = pessoas.filter((p) => p.login.toLowerCase() === login);
  if (exato.length === 1) return { tipo: 'unico', item: exato[0] };
  return acharPorNome(pessoas, texto, chavesPessoa);
};
export function acharEmpresa(empresas: EmpresaRef[], texto: string): Achado<EmpresaRef> {
  const c = cnpjLimpo(texto);
  if (c) { const e = empresas.find((x) => x.cnpj === c); return e ? { tipo: 'unico', item: e } : { tipo: 'nenhum' }; }
  return acharPorNome(empresas, texto, (e) => [e.nome]);
}

/** Mensagem pronta que a pessoa recebe: "Nilva, a contadora Malba pediu para você: conciliar o banco — empresa X — prazo 20/11/2026". */
export function montarMensagemPedido(d: { destinatario: string; pedinte: string; servico: string; empresa?: string | null; prazo?: string | null }): string {
  return `${d.destinatario}, a contadora ${d.pedinte} pediu para você: ${d.servico}${d.empresa ? ` — empresa ${d.empresa}` : ''}${d.prazo ? ` — prazo ${formatarDataBr(d.prazo)}` : ''}`;
}

// Horas úteis: segunda a sexta, das 8h às 18h, horário de Brasília (UTC-3, sem horário de verão desde 2019).
const JANELA_INICIO_H = 8; const JANELA_FIM_H = 18; const DESLOC_BRASILIA_MS = 3 * 3_600_000; const DIA_MS = 86_400_000;
export function horasUteisEntre(inicio: Date | number, fim: Date | number): number {
  const a = new Date(inicio).getTime() - DESLOC_BRASILIA_MS; const b = new Date(fim).getTime() - DESLOC_BRASILIA_MS;
  if (!(b > a)) return 0;
  let total = 0;
  for (let dia = Math.floor(a / DIA_MS) * DIA_MS; dia <= b; dia += DIA_MS) {
    const semana = new Date(dia).getUTCDay();
    if (semana === 0 || semana === 6) continue;
    const ini = Math.max(a, dia + JANELA_INICIO_H * 3_600_000); const f = Math.min(b, dia + JANELA_FIM_H * 3_600_000);
    if (f > ini) total += f - ini;
  }
  return total / 3_600_000;
}
export const hojeBrasilia = (agora: Date): string => new Date(agora.getTime() - DESLOC_BRASILIA_MS).toISOString().slice(0, 10);
export function prazoValido(v: unknown): string | null {
  const t = String(v ?? '').trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t); const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : t;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

// ---------------------------------------------------------------------------------------------
// Serviço (banco)
// ---------------------------------------------------------------------------------------------
export class ErroTarefa extends Error { constructor(public status: number, mensagem: string, public candidatos?: string[]) { super(mensagem); } }

export type EntradaTarefa = { titulo: unknown; destinatario?: unknown; destinatarioLogin?: unknown; cnpj?: unknown; prazo?: unknown };
type Linha = Record<string, any>;
const iso = (v: unknown): string | null => (v ? new Date(v as any).toISOString() : null);

export function tarefaParaTela(r: Linha, agora = new Date()) {
  const prazo = r.prazo ? String(r.prazo).slice(0, 10) : null;
  return {
    id: String(r.id), titulo: String(r.titulo), empresaCnpj: r.empresa_cnpj ? String(r.empresa_cnpj) : null, empresaNome: r.empresa_nome ? String(r.empresa_nome) : null, prazo,
    criadaPor: { login: String(r.criada_por_login), nome: String(r.criada_por_nome) }, destinatario: { login: String(r.destinatario_login), nome: String(r.destinatario_nome) },
    origem: String(r.origem) as 'delegada' | 'propria', mensagem: String(r.mensagem), vistoEm: iso(r.visto_em), concluidaEm: iso(r.concluida_em), criadaEm: iso(r.criada_em),
    vencida: Boolean(prazo && !r.concluida_em && prazo < hojeBrasilia(agora)),
  };
}

export function criarServicoTarefas(consultar: Consultar, agora: () => Date = () => new Date()) {
  let pronta: Promise<void> | null = null;
  const garantirTabelas = (): Promise<void> => {
    pronta ??= consultar(`
      CREATE TABLE IF NOT EXISTS ${TABELA_TAREFAS} (
        id bigserial PRIMARY KEY, tenant_id text NOT NULL, titulo text NOT NULL, empresa_cnpj text, empresa_nome text, prazo date,
        criada_por_id text NOT NULL, criada_por_login text NOT NULL, criada_por_nome text NOT NULL,
        destinatario_id text NOT NULL, destinatario_login text NOT NULL, destinatario_nome text NOT NULL,
        origem text NOT NULL CHECK (origem IN ('delegada','propria')), mensagem text NOT NULL,
        visto_em timestamptz, concluida_em timestamptz, criada_em timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ${TABELA_TAREFAS}_dest_idx ON ${TABELA_TAREFAS}(tenant_id, destinatario_id, concluida_em);
      CREATE INDEX IF NOT EXISTS ${TABELA_TAREFAS}_pedinte_idx ON ${TABELA_TAREFAS}(tenant_id, criada_por_id);
      CREATE TABLE IF NOT EXISTS ${TABELA_AVISOS} (
        id bigserial PRIMARY KEY, tenant_id text NOT NULL, tarefa_id bigint NOT NULL, user_id text NOT NULL,
        tipo text NOT NULL, texto text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(), lido_em timestamptz
      );
      CREATE INDEX IF NOT EXISTS ${TABELA_AVISOS}_user_idx ON ${TABELA_AVISOS}(tenant_id, user_id, lido_em);
    `).then(() => undefined).catch((e) => { pronta = null; throw e; });
    return pronta;
  };
  const tenantDe = (s: SessaoTarefas): string => String(s.tenantId || s.escritorioDe || s.userId);

  /** Usuários ativos do MESMO escritório (o responsável e a equipe). */
  async function listarEquipe(tenant: string): Promise<Pessoa[]> {
    const r = await consultar(`SELECT id::text AS id, login, nome_tratamento FROM contabil_auth_users WHERE tenant_id::text=$1 AND disabled=false ORDER BY login`, [tenant]);
    return r.rows.map((x) => ({ id: String(x.id), login: String(x.login), nome: x.nome_tratamento ? String(x.nome_tratamento) : null }));
  }
  async function nomeDaEmpresa(cnpj: string): Promise<string | null> {
    const a = await consultar(`SELECT payload->'empresa'->>'razaoSocial' AS nome FROM contabil_company_workspaces WHERE cnpj=$1`, [cnpj]);
    if (a.rows[0]?.nome) return String(a.rows[0].nome);
    const b = await consultar(`SELECT dados->>'razaoSocial' AS nome FROM contabil_empresas_compartilhadas WHERE cnpj=$1`, [cnpj]);
    return b.rows[0]?.nome ? String(b.rows[0].nome) : null;
  }
  async function avisar(tenant: string, tarefaId: string, userId: string, tipo: string, texto: string): Promise<boolean> {
    try { await consultar(`INSERT INTO ${TABELA_AVISOS}(tenant_id,tarefa_id,user_id,tipo,texto) VALUES($1,$2,$3,$4,$5)`, [tenant, tarefaId, userId, tipo, texto.slice(0, 500)]); return true; }
    catch (e) { console.error('Aviso de tarefa da equipe não gravado (a tarefa foi mantida):', e instanceof Error ? e.message : e); return false; }
  }

  async function criar(sessao: SessaoTarefas, entrada: EntradaTarefa) {
    await garantirTabelas();
    const tenant = tenantDe(sessao);
    const titulo = String(entrada.titulo ?? '').replace(/\s+/g, ' ').trim();
    if (titulo.length < 3 || titulo.length > 200) throw new ErroTarefa(400, 'Diga qual é o serviço (de 3 a 200 letras).');
    const equipe = await listarEquipe(tenant);
    const eu = equipe.find((p) => p.id === sessao.userId);
    if (!eu) throw new ErroTarefa(403, 'Seu usuário não está ativo neste escritório.');
    let alvo: Pessoa = eu;
    const pedido = String(entrada.destinatarioLogin ?? entrada.destinatario ?? '').trim();
    if (pedido) {
      const a = acharPessoa(equipe, pedido);
      if (a.tipo === 'nenhum') throw new ErroTarefa(404, `Não encontrei "${pedido}" na equipe deste escritório.`);
      if (a.tipo === 'ambiguo') throw new ErroTarefa(409, `Há mais de uma pessoa parecida com "${pedido}": ${a.itens.map((p) => `${nomeDaPessoa(p)} (${p.login})`).join('; ')}. Diga qual delas.`, a.itens.map((p) => p.login));
      alvo = a.item;
    }
    if (alvo.id !== eu.id && !sessao.administrador) throw new ErroTarefa(403, 'Somente a administradora do escritório pede serviço para outra pessoa. Você pode criar tarefa só para você.');
    let empresaCnpj: string | null = null; let empresaNome: string | null = null;
    if (entrada.cnpj !== undefined && entrada.cnpj !== null && String(entrada.cnpj).trim() !== '') {
      empresaCnpj = cnpjLimpo(entrada.cnpj);
      if (!empresaCnpj) throw new ErroTarefa(400, 'CNPJ da empresa inválido.');
      if (!sessao.cnpjs.includes(empresaCnpj)) throw new ErroTarefa(403, 'Esta empresa não pertence ao seu escritório.');
      empresaNome = await nomeDaEmpresa(empresaCnpj).catch(() => null);
    }
    let prazo: string | null = null;
    if (entrada.prazo !== undefined && entrada.prazo !== null && String(entrada.prazo).trim() !== '') {
      prazo = prazoValido(entrada.prazo);
      if (!prazo) throw new ErroTarefa(400, 'Prazo inválido. Use o dia no formato dd/mm/aaaa.');
      if (prazo < hojeBrasilia(agora())) throw new ErroTarefa(400, 'O prazo já passou. Escolha hoje ou um dia futuro.');
    }
    const origem = alvo.id === eu.id ? 'propria' : 'delegada';
    const rotuloEmpresa = empresaCnpj ? (empresaNome || formatarCnpj(empresaCnpj)) : null;
    const mensagem = origem === 'delegada'
      ? montarMensagemPedido({ destinatario: nomeDaPessoa(alvo), pedinte: nomeDaPessoa(eu), servico: titulo, empresa: rotuloEmpresa, prazo })
      : `Tarefa sua: ${titulo}${rotuloEmpresa ? ` — empresa ${rotuloEmpresa}` : ''}${prazo ? ` — prazo ${formatarDataBr(prazo)}` : ''}`;
    const r = await consultar(
      `INSERT INTO ${TABELA_TAREFAS}(tenant_id,titulo,empresa_cnpj,empresa_nome,prazo,criada_por_id,criada_por_login,criada_por_nome,destinatario_id,destinatario_login,destinatario_nome,origem,mensagem)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tenant, titulo, empresaCnpj, empresaNome, prazo, eu.id, eu.login, nomeDaPessoa(eu), alvo.id, alvo.login, nomeDaPessoa(alvo), origem, mensagem],
    );
    const linha = r.rows[0];
    const avisado = origem === 'delegada' ? await avisar(tenant, String(linha.id), alvo.id, 'nova', mensagem) : true;
    return { tarefa: tarefaParaTela(linha, agora()), avisado };
  }

  async function listar(sessao: SessaoTarefas, visao: 'para-mim' | 'que-pedi') {
    await garantirTabelas();
    const tenant = tenantDe(sessao);
    const filtro = visao === 'para-mim' ? 'destinatario_id=$2' : `criada_por_id=$2 AND destinatario_id<>$2`;
    const r = await consultar(
      `SELECT *, prazo::text AS prazo FROM ${TABELA_TAREFAS} WHERE tenant_id=$1 AND ${filtro}
       ORDER BY (concluida_em IS NOT NULL), COALESCE(prazo,'9999-12-31'::date), id DESC LIMIT 200`, [tenant, sessao.userId]);
    return r.rows.map((x) => tarefaParaTela(x, agora()));
  }

  async function carregar(sessao: SessaoTarefas, id: string): Promise<Linha> {
    const r = await consultar(`SELECT *, prazo::text AS prazo FROM ${TABELA_TAREFAS} WHERE id=$1 AND tenant_id=$2`, [id, tenantDe(sessao)]);
    if (!r.rows[0]) throw new ErroTarefa(404, 'Tarefa não encontrada.');
    return r.rows[0];
  }

  async function marcarVista(sessao: SessaoTarefas, id: string) {
    await garantirTabelas();
    const t = await carregar(sessao, id);
    if (String(t.destinatario_id) !== sessao.userId) throw new ErroTarefa(403, 'Só quem recebeu o pedido marca como visto.');
    if (t.visto_em) return tarefaParaTela(t, agora());
    const r = await consultar(`UPDATE ${TABELA_TAREFAS} SET visto_em=now() WHERE id=$1 AND tenant_id=$2 AND visto_em IS NULL RETURNING *, prazo::text AS prazo`, [id, tenantDe(sessao)]);
    const nova = r.rows[0] ?? t;
    if (r.rows[0] && nova.origem === 'delegada') await avisar(tenantDe(sessao), String(nova.id), String(nova.criada_por_id), 'vista', `${nova.destinatario_nome} viu o seu pedido: ${nova.titulo}`);
    return tarefaParaTela(nova, agora());
  }

  async function concluir(sessao: SessaoTarefas, id: string) {
    await garantirTabelas();
    const t = await carregar(sessao, id);
    if (String(t.destinatario_id) !== sessao.userId) throw new ErroTarefa(403, 'Só quem recebeu o pedido marca como feito.');
    if (t.concluida_em) return tarefaParaTela(t, agora());
    const r = await consultar(`UPDATE ${TABELA_TAREFAS} SET concluida_em=now(), visto_em=COALESCE(visto_em, now()) WHERE id=$1 AND tenant_id=$2 AND concluida_em IS NULL RETURNING *, prazo::text AS prazo`, [id, tenantDe(sessao)]);
    const nova = r.rows[0] ?? t;
    if (r.rows[0] && nova.origem === 'delegada') {
      if (!t.visto_em) await avisar(tenantDe(sessao), String(nova.id), String(nova.criada_por_id), 'vista', `${nova.destinatario_nome} viu o seu pedido: ${nova.titulo}`);
      await avisar(tenantDe(sessao), String(nova.id), String(nova.criada_por_id), 'concluida', `${nova.destinatario_nome} concluiu: ${nova.titulo}`);
    }
    return tarefaParaTela(nova, agora());
  }

  /** Exclui UMA tarefa. Quem pediu (ou a administradora do escritório) exclui; quem só recebeu exclui apenas tarefa própria. */
  async function excluir(sessao: SessaoTarefas, id: string): Promise<void> {
    await garantirTabelas();
    const t = await carregar(sessao, id);
    const pode = String(t.criada_por_id) === sessao.userId || sessao.administrador;
    if (!pode) throw new ErroTarefa(403, 'Só quem pediu o serviço (ou a administradora) exclui esta tarefa.');
    await consultar(`DELETE FROM ${TABELA_AVISOS} WHERE tarefa_id=$1 AND tenant_id=$2`, [id, tenantDe(sessao)]);
    await consultar(`DELETE FROM ${TABELA_TAREFAS} WHERE id=$1 AND tenant_id=$2`, [id, tenantDe(sessao)]);
  }

  async function avisosPendentes(sessao: SessaoTarefas) {
    await garantirTabelas();
    const r = await consultar(`SELECT id, tarefa_id, tipo, texto, criado_em FROM ${TABELA_AVISOS} WHERE tenant_id=$1 AND user_id=$2 AND lido_em IS NULL ORDER BY id DESC LIMIT 20`, [tenantDe(sessao), sessao.userId]);
    return r.rows.map((x) => ({ id: String(x.id), tarefaId: String(x.tarefa_id), tipo: String(x.tipo), texto: String(x.texto), criadoEm: iso(x.criado_em)! }));
  }
  async function marcarAvisoLido(sessao: SessaoTarefas, id: string): Promise<void> {
    await garantirTabelas();
    await consultar(`UPDATE ${TABELA_AVISOS} SET lido_em=now() WHERE id=$1 AND tenant_id=$2 AND user_id=$3 AND lido_em IS NULL`, [id, tenantDe(sessao), sessao.userId]);
  }

  /** Robô conferidor: refaz avisos que faltaram, lembra de pedidos não vistos há 2 h úteis e avisa de prazo vencido. Nunca altera nem apaga tarefa. */
  async function conferir() {
    await garantirTabelas();
    const agoraD = agora(); const hoje = hojeBrasilia(agoraD);
    const abertas = (await consultar(`SELECT *, prazo::text AS prazo FROM ${TABELA_TAREFAS} WHERE concluida_em IS NULL ORDER BY id LIMIT 5000`)).rows;
    let refeitos = 0; let naoVistas = 0; let vencidas = 0; let gerados = 0; let falhas = 0;
    const ja = async (t: Linha, user: string, tipo: string, janelaHoras: number | null) => (await consultar(
      `SELECT 1 FROM ${TABELA_AVISOS} WHERE tarefa_id=$1 AND tenant_id=$2 AND user_id=$3 AND tipo=$4 ${janelaHoras ? `AND criado_em > now() - interval '${janelaHoras} hours'` : ''} LIMIT 1`, [t.id, t.tenant_id, user, tipo])).rows.length > 0;
    for (const t of abertas) {
      const tarefaId = String(t.id); const tenant = String(t.tenant_id);
      const gravar = async (user: string, tipo: string, texto: string, janela: number | null) => {
        try {
          if (await ja(t, user, tipo, janela)) return false;
          if (await avisar(tenant, tarefaId, user, tipo, texto)) return true;
        } catch (e) { console.error('Robô de tarefas da equipe: falha ao conferir aviso:', e instanceof Error ? e.message : e); }
        falhas += 1; return false;
      };
      if (t.origem === 'delegada' && await gravar(String(t.destinatario_id), 'nova', String(t.mensagem), null)) refeitos += 1;
      const venc = Boolean(t.prazo && String(t.prazo) < hoje);
      if (venc) vencidas += 1;
      const semVer = t.origem === 'delegada' && !t.visto_em && horasUteisEntre(new Date(t.criada_em), agoraD) > HORAS_UTEIS_SEM_VER;
      if (semVer) naoVistas += 1;
      if (semVer) {
        if (await gravar(String(t.destinatario_id), 'lembrete', `Lembrete: ${t.criada_por_nome} pediu e você ainda não abriu: ${t.titulo}`, 24)) gerados += 1;
        if (await gravar(String(t.criada_por_id), 'alerta', `${t.destinatario_nome} ainda não viu o seu pedido (há mais de ${HORAS_UTEIS_SEM_VER} h úteis): ${t.titulo}`, 24)) gerados += 1;
      }
      if (venc) {
        if (await gravar(String(t.destinatario_id), 'vencida', `Prazo vencido (${formatarDataBr(String(t.prazo))}): ${t.titulo}`, 24)) gerados += 1;
        if (t.origem === 'delegada' && await gravar(String(t.criada_por_id), 'vencida', `Prazo vencido (${formatarDataBr(String(t.prazo))}) — ${t.destinatario_nome} ainda não concluiu: ${t.titulo}`, 24)) gerados += 1;
      }
    }
    const resumo = abertas.length === 0 ? 'Nenhuma tarefa da equipe em aberto.'
      : `${abertas.length} tarefa(s) em aberto; ${naoVistas} sem ser vista(s) há mais de ${HORAS_UTEIS_SEM_VER} h úteis; ${vencidas} com prazo vencido; ${gerados + refeitos} aviso(s) gerado(s)${refeitos ? ` (${refeitos} refeito(s) por falha anterior)` : ''}${falhas ? `; ${falhas} aviso(s) não gravado(s), nova tentativa na próxima rodada` : ''}.`;
    return { abertas: abertas.length, naoVistas, vencidas, avisosGerados: gerados + refeitos, falhas, resumo };
  }

  return { garantirTabelas, listarEquipe, criar, listar, marcarVista, concluir, excluir, avisosPendentes, marcarAvisoLido, conferir };
}

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------
export type DepsRotasTarefas = {
  servico: ReturnType<typeof criarServicoTarefas>;
  exigirSessao: (req: Request, res: Response, next: NextFunction) => unknown;
  exigirOrigem: (req: Request, res: Response, next: NextFunction) => unknown;
  sessao: (req: Request) => SessaoTarefas | undefined;
};

export function registrarRotasTarefasEquipe(app: Express, d: DepsRotasTarefas): void {
  const base = '/api/tarefas-equipe';
  const idValido = (v: unknown): string | null => (/^\d{1,15}$/.test(String(v ?? '')) ? String(v) : null);
  const tratar = (fn: (s: SessaoTarefas, req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = d.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    try { await fn(s, req, res); }
    catch (e) {
      if (e instanceof ErroTarefa) { res.status(e.status).json({ sucesso: false, motivo: e.message, candidatos: e.candidatos }); return; }
      console.error('Tarefas da equipe:', e instanceof Error ? e.message : e);
      res.status(503).json({ sucesso: false, motivo: 'Não foi possível concluir agora. Tente de novo.' });
    }
  };
  const comId = (fn: (s: SessaoTarefas, id: string, res: Response) => Promise<unknown>) => tratar(async (s, req, res) => {
    const id = idValido(req.params.id); if (!id) throw new ErroTarefa(400, 'Tarefa inválida.');
    await fn(s, id, res);
  });

  app.get(`${base}/equipe`, d.exigirSessao, tratar(async (s, _req, res) => {
    const equipe = await d.servico.listarEquipe(String(s.tenantId || s.escritorioDe || s.userId));
    res.json({ sucesso: true, podeDelegar: s.administrador, eu: s.userId, equipe: equipe.map((p) => ({ id: p.id, login: p.login, nome: nomeDaPessoa(p) })) });
  }));
  app.get(`${base}/avisos`, d.exigirSessao, tratar(async (s, _req, res) => { res.json({ sucesso: true, avisos: await d.servico.avisosPendentes(s) }); }));
  app.post(`${base}/avisos/:id/lido`, d.exigirOrigem, d.exigirSessao, comId(async (s, id, res) => { await d.servico.marcarAvisoLido(s, id); res.json({ sucesso: true }); }));
  app.get(base, d.exigirSessao, tratar(async (s, req, res) => {
    const visao = req.query.visao === 'que-pedi' ? 'que-pedi' : 'para-mim';
    res.json({ sucesso: true, tarefas: await d.servico.listar(s, visao) });
  }));
  app.post(base, d.exigirOrigem, d.exigirSessao, tratar(async (s, req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const r = await d.servico.criar(s, { titulo: b.titulo, destinatario: b.destinatario, destinatarioLogin: b.destinatarioLogin, cnpj: b.cnpj, prazo: b.prazo });
    res.status(201).json({ sucesso: true, ...r });
  }));
  app.post(`${base}/:id/vista`, d.exigirOrigem, d.exigirSessao, comId(async (s, id, res) => { res.json({ sucesso: true, tarefa: await d.servico.marcarVista(s, id) }); }));
  app.post(`${base}/:id/concluir`, d.exigirOrigem, d.exigirSessao, comId(async (s, id, res) => { res.json({ sucesso: true, tarefa: await d.servico.concluir(s, id) }); }));
  app.delete(`${base}/:id`, d.exigirOrigem, d.exigirSessao, comId(async (s, id, res) => { await d.servico.excluir(s, id); res.json({ sucesso: true }); }));
}
