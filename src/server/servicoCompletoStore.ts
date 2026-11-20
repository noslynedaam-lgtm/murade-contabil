// SERVIÇO COMPLETO DA AGENTE — registro dos roteiros ("a Agente vira o funcionário do contador").
//
// Quando o contador pede "fecha o mês da empresa X", "faz a ECD", "encerra o resultado" ou "monta o balancete para o cliente",
// a Agente levanta tudo (src/server/servicoCompleto.ts), prepara o que dá para preparar (sempre pendente de aprovação) e deixa
// aqui o RESUMO do serviço para o contador conferir na tela Aprovar lançamentos ("A conferir"). Este módulo só guarda esse
// resumo (metadados: etapas, situação, quem pediu e quando). Nunca aprova, fecha, lança nem apaga lançamento.
//
// Regras:
//  - Isolado por escritório (tenant) e só para as empresas do acesso de quem chama.
//  - aguardando_ok: o roteiro chegou num passo que só o contador faz (aprovar, fechar, gerar definitivo): a tela mostra
//    "Confira e dê o OK" e a Agente lembra; ok_dado: ele tocou "Conferi, pode seguir" e a Agente continua de onde parou.
//  - Estados: em_andamento (a Agente está preparando no servidor, em segundo plano) · aguardando_preparo (a Agente mostrou o cartão de preparo e falta o sim) → pronto_para_conferir (tudo preparado;
//    falta o contador conferir/aprovar/fechar) → conferido (o contador marcou "Já conferi") ou concluido (o robô viu a
//    competência fechada). "parado": o cartão de preparo não foi confirmado a tempo (o robô marca e avisa).
//  - FAIL-OPEN: falha no registro nunca impede o serviço em si (a Agente segue e só avisa que não conseguiu registrar).
import type { Express, Request, RequestHandler, Response } from 'express';

export type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export const ROTEIROS_SERVICO = ['fechamento_mensal', 'ecd_ano', 'encerramento_resultado', 'balancete_cliente'] as const;
export type RoteiroServico = (typeof ROTEIROS_SERVICO)[number];
export const ESTADOS_SERVICO = ['em_andamento', 'aguardando_preparo', 'aguardando_ok', 'ok_dado', 'pronto_para_conferir', 'parado', 'conferido', 'concluido'] as const;
export type EstadoServicoCompleto = (typeof ESTADOS_SERVICO)[number];
/** feito: já está em dia · a_preparar: a Agente prepara no cartão · preparado: preparado (pendente de aprovação) · contador: depende do clique/conferência do contador · nada: não se aplica · falta_sistema: o sistema ainda não faz · aviso: algo a olhar. */
export type SituacaoEtapa = 'feito' | 'a_preparar' | 'preparado' | 'contador' | 'nada' | 'falta_sistema' | 'aviso';
export interface EtapaServico { id: string; titulo: string; situacao: SituacaoEtapa; detalhe: string; tela?: string }

export interface RegistroServicoCompleto {
  tenantId: string; cnpj: string; roteiro: RoteiroServico; referencia: string; estado: EstadoServicoCompleto;
  titulo: string; resumo: string; etapas: EtapaServico[]; porLogin: string | null; porNome: string | null;
  criadoEm: string; atualizadoEm: string; aviso: string | null;
  /** O que o contador precisa conferir/fazer antes do OK (estado aguardando_ok). */
  pontoOk?: string | null; okEm?: string | null; okPor?: string | null;
}

export const TABELA_SERVICO_COMPLETO = 'contabil_servico_completo';
/** Cartão de preparo vale 15 min no motor da Agente; passado o dobro sem o sim, o roteiro é dado como parado. */
export const MINUTOS_PARA_PARADO = 30;
/** Pronto para conferir há mais que isto: o robô lembra o contador. */
export const DIAS_PARA_LEMBRETE = 3;
/** Conferido/concluído há mais que isto: o registro é apagado (só o resumo; nada de lançamento). */
export const DIAS_GUARDA = 120;

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const ANO = /^\d{4}$/;
export function referenciaValida(roteiro: RoteiroServico, referencia: unknown): string | null {
  const r = String(referencia ?? '').trim();
  if (roteiro === 'fechamento_mensal' || roteiro === 'balancete_cliente') return COMPETENCIA.test(r) ? r : null;
  return ANO.test(r) && Number(r) >= 2000 && Number(r) <= 2100 ? r : null;
}
const txt = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const SITUACOES: SituacaoEtapa[] = ['feito', 'a_preparar', 'preparado', 'contador', 'nada', 'falta_sistema', 'aviso'];
export function sanearEtapas(lista: unknown): EtapaServico[] {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 20).map((e: any, i) => ({
    id: txt(e?.id, 40) || `etapa-${i + 1}`,
    titulo: txt(e?.titulo, 120),
    situacao: SITUACOES.includes(e?.situacao) ? e.situacao : 'aviso',
    detalhe: txt(e?.detalhe, 400),
    ...(typeof e?.tela === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(e.tela) ? { tela: e.tela } : {}),
  })).filter((e) => e.titulo);
}

const deLinha = (l: any): RegistroServicoCompleto => ({
  tenantId: String(l.tenant_id), cnpj: String(l.cnpj), roteiro: l.roteiro, referencia: String(l.referencia), estado: l.estado,
  titulo: String(l.titulo || ''), resumo: String(l.resumo || ''), etapas: sanearEtapas(typeof l.etapas === 'string' ? JSON.parse(l.etapas) : l.etapas),
  porLogin: l.por_login ?? null, porNome: l.por_nome ?? null,
  criadoEm: new Date(l.criado_em).toISOString(), atualizadoEm: new Date(l.atualizado_em).toISOString(), aviso: l.aviso ?? null,
  pontoOk: l.ponto_ok ?? null, okEm: l.ok_em ? new Date(l.ok_em).toISOString() : null, okPor: l.ok_por ?? null,
});

export function criarStoreServicoCompleto(consultar: Consultar, opcoes: { agora?: () => Date } = {}) {
  const agora = opcoes.agora ?? (() => new Date());
  let pronta: Promise<void> | null = null;
  const garantirTabela = () => {
    pronta ??= consultar(`CREATE TABLE IF NOT EXISTS ${TABELA_SERVICO_COMPLETO} (
      tenant_id text NOT NULL, cnpj text NOT NULL, roteiro text NOT NULL, referencia text NOT NULL, estado text NOT NULL,
      titulo text NOT NULL DEFAULT '', resumo text NOT NULL DEFAULT '', etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
      por_login text, por_nome text, criado_em timestamptz NOT NULL, atualizado_em timestamptz NOT NULL, aviso text,
      PRIMARY KEY (tenant_id, cnpj, roteiro, referencia))`)
      .then(() => consultar(`ALTER TABLE ${TABELA_SERVICO_COMPLETO} ADD COLUMN IF NOT EXISTS ponto_ok text, ADD COLUMN IF NOT EXISTS ok_em timestamptz, ADD COLUMN IF NOT EXISTS ok_por text`))
      .then(() => undefined).catch((e) => { pronta = null; throw e; });
    return pronta;
  };

  async function gravar(r: Omit<RegistroServicoCompleto, 'criadoEm' | 'atualizadoEm' | 'aviso' | 'okEm' | 'okPor'>): Promise<void> {
    await garantirTabela();
    const t = agora();
    await consultar(
      `INSERT INTO ${TABELA_SERVICO_COMPLETO}(tenant_id,cnpj,roteiro,referencia,estado,titulo,resumo,etapas,por_login,por_nome,criado_em,atualizado_em,aviso,ponto_ok)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11,NULL,$12)
       ON CONFLICT (tenant_id,cnpj,roteiro,referencia) DO UPDATE SET estado=EXCLUDED.estado, titulo=EXCLUDED.titulo, resumo=EXCLUDED.resumo,
         etapas=EXCLUDED.etapas, por_login=EXCLUDED.por_login, por_nome=EXCLUDED.por_nome, atualizado_em=EXCLUDED.atualizado_em, aviso=NULL, ponto_ok=EXCLUDED.ponto_ok`,
      [r.tenantId, r.cnpj, r.roteiro, r.referencia, r.estado, txt(r.titulo, 160), txt(r.resumo, 600), JSON.stringify(sanearEtapas(r.etapas)), r.porLogin, r.porNome, t, r.estado === 'aguardando_ok' ? txt(r.pontoOk, 600) || null : null],
    );
  }

  async function mudarEstado(chave: { tenantId?: string; cnpj: string; roteiro: string; referencia: string }, estado: EstadoServicoCompleto, aviso: string | null): Promise<number> {
    await garantirTabela();
    const params: unknown[] = [estado, aviso, agora(), chave.cnpj, chave.roteiro, chave.referencia];
    let sql = `UPDATE ${TABELA_SERVICO_COMPLETO} SET estado=$1, aviso=$2, atualizado_em=$3 WHERE cnpj=$4 AND roteiro=$5 AND referencia=$6`;
    if (chave.tenantId) { params.push(chave.tenantId); sql += ` AND tenant_id=$7`; }
    const r = await consultar(sql, params);
    return Number(r.rowCount || 0);
  }

  async function listar(tenantId: string, cnpjs: string[], limite = 30): Promise<RegistroServicoCompleto[]> {
    if (!cnpjs.length) return [];
    await garantirTabela();
    const r = await consultar(
      `SELECT * FROM ${TABELA_SERVICO_COMPLETO} WHERE tenant_id=$1 AND cnpj = ANY($2::text[]) ORDER BY (estado IN ('conferido','concluido')), atualizado_em DESC LIMIT $3`,
      [tenantId, cnpjs, Math.min(Math.max(limite, 1), 100)],
    );
    return r.rows.map(deLinha);
  }

  /** Para o robô: todos os roteiros ainda abertos, de todos os escritórios. */
  async function abertos(): Promise<RegistroServicoCompleto[]> {
    await garantirTabela();
    const r = await consultar(`SELECT * FROM ${TABELA_SERVICO_COMPLETO} WHERE estado IN ('em_andamento','aguardando_preparo','aguardando_ok','ok_dado','pronto_para_conferir','parado') ORDER BY atualizado_em LIMIT 2000`);
    return r.rows.map(deLinha);
  }

  async function apagarAntigos(): Promise<number> {
    await garantirTabela();
    const limite = new Date(agora().getTime() - DIAS_GUARDA * 86_400_000);
    const r = await consultar(`DELETE FROM ${TABELA_SERVICO_COMPLETO} WHERE estado IN ('conferido','concluido') AND atualizado_em < $1`, [limite]);
    return Number(r.rowCount || 0);
  }

  /** "Conferi, pode seguir": só vale para quem está esperando o OK. Devolve quantos registros mudaram (0 = não estava esperando). */
  async function darOk(chave: { tenantId: string; cnpj: string; roteiro: string; referencia: string }, login: string): Promise<number> {
    await garantirTabela();
    const r = await consultar(`UPDATE ${TABELA_SERVICO_COMPLETO} SET estado='ok_dado', ok_em=$1, ok_por=$2, atualizado_em=$1, aviso=NULL WHERE tenant_id=$3 AND cnpj=$4 AND roteiro=$5 AND referencia=$6 AND estado='aguardando_ok'`, [agora(), login, chave.tenantId, chave.cnpj, chave.roteiro, chave.referencia]);
    return Number(r.rowCount || 0);
  }

  return { garantirTabela, gravar, mudarEstado, listar, abertos, apagarAntigos, darOk, agora };
}
export type StoreServicoCompleto = ReturnType<typeof criarStoreServicoCompleto>;

// ---------------------------------------------------------------------------------------------
// Robô Conferidor dos Serviços da Agente (lógica pura + rodada)
// ---------------------------------------------------------------------------------------------
export type AvaliacaoRoteiro = { acao: 'nada' } | { acao: 'parado'; aviso: string } | { acao: 'concluido'; aviso: string } | { acao: 'lembrar'; aviso: string };

/** O que fazer com UM roteiro aberto. `fechada`: a competência do fechamento mensal já foi fechada pelo contador. */
export function avaliarRoteiro(r: Pick<RegistroServicoCompleto, 'roteiro' | 'referencia' | 'estado' | 'atualizadoEm' | 'titulo'>, fechada: boolean, agora: Date): AvaliacaoRoteiro {
  const idadeMs = agora.getTime() - Date.parse(r.atualizadoEm);
  if (r.roteiro === 'fechamento_mensal' && fechada && r.estado !== 'parado') return { acao: 'concluido', aviso: `Competência ${r.referencia.slice(5)}/${r.referencia.slice(0, 4)} fechada pelo contador.` };
  if (r.estado === 'em_andamento' && idadeMs > MINUTOS_PARA_PARADO * 60_000) {
    return { acao: 'parado', aviso: 'O serviço parou no meio (o servidor pode ter reiniciado). O que já foi preparado continua pendente de aprovação. Toque em "Fazer de novo": nada é duplicado.' };
  }
  if (r.estado === 'aguardando_preparo' && idadeMs > MINUTOS_PARA_PARADO * 60_000) {
    return { acao: 'parado', aviso: 'O cartão de preparo não foi confirmado e expirou. Nada foi alterado. Peça de novo à Agente ("faz o serviço de novo") ou toque em "Fazer de novo".' };
  }
  if (r.estado === 'ok_dado' && idadeMs > MINUTOS_PARA_PARADO * 60_000) {
    return { acao: 'parado', aviso: 'Você deu o OK, mas eu não consegui continuar (a conversa foi interrompida). Toque em "Fazer de novo" que eu sigo de onde parei.' };
  }
  if (r.estado === 'aguardando_ok' && idadeMs > DIAS_PARA_LEMBRETE * 86_400_000) {
    return { acao: 'lembrar', aviso: `${r.titulo} está esperando você conferir e dar o OK há mais de ${DIAS_PARA_LEMBRETE} dias.` };
  }
  if (r.estado === 'pronto_para_conferir' && idadeMs > DIAS_PARA_LEMBRETE * 86_400_000) {
    return { acao: 'lembrar', aviso: `${r.titulo} está pronto para você conferir há mais de ${DIAS_PARA_LEMBRETE} dias.` };
  }
  return { acao: 'nada' };
}

export interface ResultadoRodadaServicos { verificados: number; parados: number; concluidos: number; lembretes: number; apagados: number; achados: Array<{ cnpj: string; tenantId: string; titulo: string; aviso: string }> }

/** Rodada do robô: só mexe no próprio registro de roteiros (estado e aviso). Nunca em lançamento, empresa ou competência. */
export async function rodarConferidorServicos(store: StoreServicoCompleto, consultar: Consultar): Promise<ResultadoRodadaServicos> {
  const agora = store.agora();
  const lista = await store.abertos();
  const fechamentos = lista.filter((r) => r.roteiro === 'fechamento_mensal');
  const fechadas = new Set<string>();
  if (fechamentos.length) {
    const cnpjs = [...new Set(fechamentos.map((r) => r.cnpj))];
    const res = await consultar('SELECT cnpj, competencia FROM contabil_period_closures WHERE cnpj = ANY($1::text[])', [cnpjs]);
    for (const l of res.rows) fechadas.add(`${l.cnpj}|${l.competencia}`);
  }
  const saida: ResultadoRodadaServicos = { verificados: lista.length, parados: 0, concluidos: 0, lembretes: 0, apagados: 0, achados: [] };
  for (const r of lista) {
    const a = avaliarRoteiro(r, fechadas.has(`${r.cnpj}|${r.referencia}`), agora);
    if (a.acao === 'nada') continue;
    if (a.acao === 'lembrar') { saida.lembretes += 1; saida.achados.push({ cnpj: r.cnpj, tenantId: r.tenantId, titulo: r.titulo, aviso: a.aviso }); continue; }
    await store.mudarEstado({ tenantId: r.tenantId, cnpj: r.cnpj, roteiro: r.roteiro, referencia: r.referencia }, a.acao, a.aviso);
    if (a.acao === 'parado') { saida.parados += 1; saida.achados.push({ cnpj: r.cnpj, tenantId: r.tenantId, titulo: r.titulo, aviso: a.aviso }); } else saida.concluidos += 1;
  }
  saida.apagados = await store.apagarAntigos();
  return saida;
}

export const resumoRodadaServicos = (r: ResultadoRodadaServicos): string =>
  `${r.verificados} serviço(s) da Agente em aberto conferido(s): ${r.parados} parado(s) (parou no meio ou cartão de preparo sem confirmação), ${r.lembretes} esperando conferência há mais de ${DIAS_PARA_LEMBRETE} dias, ${r.concluidos} concluído(s) com a competência fechada; ${r.apagados} registro(s) antigo(s) apagado(s).`;

// ---------------------------------------------------------------------------------------------
// Rotas (tela "A conferir" e Agente IA)
// ---------------------------------------------------------------------------------------------
export interface SessaoServicoCompleto { userId: string; login: string; cnpjs: string[]; tenantId?: string; escritorioDe?: string; podeEscrever: (cnpj: string) => boolean }
export interface DepsRotasServicoCompleto {
  store: StoreServicoCompleto;
  sessao: (req: Request) => SessaoServicoCompleto | undefined;
  normalizarCnpj: (v: unknown) => string;
  /** Marca "serviço feito" (anti-retrabalho) quando o roteiro fica pronto para conferir. Fail-open. */
  marcarServicoFeito?: (s: SessaoServicoCompleto, r: { cnpj: string; roteiro: RoteiroServico; referencia: string; titulo: string }) => Promise<void>;
  nomeDe?: (userId: string) => Promise<string | null>;
  /** Achados do robô (lembretes e parados) para mostrar junto da lista. */
  achados?: () => ResultadoRodadaServicos['achados'];
}

export const tenantServico = (s: Pick<SessaoServicoCompleto, 'tenantId' | 'escritorioDe' | 'userId'>): string => s.tenantId || s.escritorioDe || s.userId;

const paraJson = (r: RegistroServicoCompleto) => ({
  cnpj: r.cnpj, roteiro: r.roteiro, referencia: r.referencia, estado: r.estado, titulo: r.titulo, resumo: r.resumo, etapas: r.etapas,
  porLogin: r.porLogin, porNome: r.porNome, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm, aviso: r.aviso,
  pontoOk: r.pontoOk ?? null, okEm: r.okEm ?? null, okPor: r.okPor ?? null,
});

export function registrarRotasServicoCompleto(app: Express, mw: { exigirSessao: RequestHandler; exigirOrigem: RequestHandler }, deps: DepsRotasServicoCompleto): void {
  const acesso = (req: Request, res: Response, cnpjBruto: unknown, escrever: boolean): { s: SessaoServicoCompleto; cnpj: string } | null => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return null; }
    const cnpj = deps.normalizarCnpj(cnpjBruto);
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || !s.cnpjs.includes(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Esta empresa não está no seu acesso.' }); return null; }
    if (escrever && !s.podeEscrever(cnpj)) { res.status(403).json({ sucesso: false, motivo: 'Seu acesso a esta empresa é somente leitura.' }); return null; }
    return { s, cnpj };
  };

  app.get('/api/servico-completo', mw.exigirSessao, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const s = deps.sessao(req);
    if (!s) { res.status(401).json({ sucesso: false, motivo: 'Entre no sistema.' }); return; }
    const filtro = req.query.cnpj ? deps.normalizarCnpj(req.query.cnpj) : '';
    if (filtro && !s.cnpjs.includes(filtro)) { res.status(403).json({ sucesso: false, motivo: 'Esta empresa não está no seu acesso.' }); return; }
    try {
      const tenant = tenantServico(s);
      const cnpjs = filtro ? [filtro] : s.cnpjs;
      const lista = await deps.store.listar(tenant, cnpjs, Number(req.query.limite) || 30);
      const achados = (deps.achados?.() || []).filter((a) => a.tenantId === tenant && cnpjs.includes(a.cnpj)).map(({ tenantId: _t, ...resto }) => resto);
      res.json({ sucesso: true, servicos: lista.map(paraJson), lembretes: achados });
    } catch (erro: any) {
      console.error('Falha ao listar os serviços da Agente:', erro?.message || erro);
      res.json({ sucesso: true, servicos: [], lembretes: [], indisponivel: true }); // a consulta nunca derruba a tela
    }
  });

  app.post('/api/servico-completo', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, req.body?.cnpj, true); if (!a) return;
    const roteiro = String(req.body?.roteiro || '') as RoteiroServico;
    if (!ROTEIROS_SERVICO.includes(roteiro)) { res.status(400).json({ sucesso: false, motivo: 'Roteiro desconhecido.' }); return; }
    const referencia = referenciaValida(roteiro, req.body?.referencia);
    if (!referencia) { res.status(400).json({ sucesso: false, motivo: 'Referência inválida (competência AAAA-MM ou ano AAAA).' }); return; }
    const estado = String(req.body?.estado || '') as EstadoServicoCompleto;
    if (!['em_andamento', 'aguardando_preparo', 'aguardando_ok', 'pronto_para_conferir'].includes(estado)) { res.status(400).json({ sucesso: false, motivo: 'Estado inválido.' }); return; }
    const titulo = txt(req.body?.titulo, 160);
    if (!titulo) { res.status(400).json({ sucesso: false, motivo: 'Falta o título do serviço.' }); return; }
    try {
      const nome = deps.nomeDe ? await deps.nomeDe(a.s.userId).catch(() => null) : null;
      await deps.store.gravar({ tenantId: tenantServico(a.s), cnpj: a.cnpj, roteiro, referencia, estado, titulo, resumo: txt(req.body?.resumo, 600), etapas: sanearEtapas(req.body?.etapas), porLogin: a.s.login, porNome: nome, pontoOk: txt(req.body?.pontoOk, 600) || null });
      if ((estado === 'pronto_para_conferir' || estado === 'aguardando_ok') && deps.marcarServicoFeito) await deps.marcarServicoFeito(a.s, { cnpj: a.cnpj, roteiro, referencia, titulo }).catch(() => undefined);
      res.json({ sucesso: true, mensagem: estado === 'aguardando_ok' ? 'Serviço esperando você conferir e dar o OK (A conferir).' : estado === 'pronto_para_conferir' ? 'Serviço registrado em "A conferir" (tela Aprovar lançamentos).' : estado === 'em_andamento' ? 'Serviço em andamento.' : 'Serviço registrado; falta confirmar o preparo.' });
    } catch (erro: any) {
      console.error('Falha ao registrar o serviço da Agente:', erro?.message || erro);
      res.status(503).json({ sucesso: false, motivo: 'Não consegui registrar o resumo do serviço agora. O que foi preparado continua valendo.' });
    }
  });

  // "Conferi, pode seguir": o contador conferiu e fez a parte dele (aprovar/fechar continua no clique dele, na tela própria).
  app.post('/api/servico-completo/ok', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, req.body?.cnpj, true); if (!a) return;
    const roteiro = String(req.body?.roteiro || '') as RoteiroServico;
    const referencia = ROTEIROS_SERVICO.includes(roteiro) ? referenciaValida(roteiro, req.body?.referencia) : null;
    if (!referencia) { res.status(400).json({ sucesso: false, motivo: 'Serviço inválido.' }); return; }
    try {
      const n = await deps.store.darOk({ tenantId: tenantServico(a.s), cnpj: a.cnpj, roteiro, referencia }, a.s.login);
      if (!n) { res.status(409).json({ sucesso: false, motivo: 'Este serviço não está esperando o seu OK (talvez já tenha sido dado).' }); return; }
      res.json({ sucesso: true, mensagem: 'OK recebido. A Agente continua de onde parou.' });
    } catch (erro: any) {
      console.error('Falha ao registrar o OK do contador:', erro?.message || erro);
      res.status(503).json({ sucesso: false, motivo: 'Não consegui registrar o OK agora. Tente de novo.' });
    }
  });

  app.post('/api/servico-completo/conferido', mw.exigirOrigem, mw.exigirSessao, async (req, res) => {
    const a = acesso(req, res, req.body?.cnpj, true); if (!a) return;
    const roteiro = String(req.body?.roteiro || '') as RoteiroServico;
    const referencia = ROTEIROS_SERVICO.includes(roteiro) ? referenciaValida(roteiro, req.body?.referencia) : null;
    if (!referencia) { res.status(400).json({ sucesso: false, motivo: 'Serviço inválido.' }); return; }
    try {
      const n = await deps.store.mudarEstado({ tenantId: tenantServico(a.s), cnpj: a.cnpj, roteiro, referencia }, 'conferido', `Conferido por ${a.s.login}.`);
      if (!n) { res.status(404).json({ sucesso: false, motivo: 'Serviço não encontrado.' }); return; }
      res.json({ sucesso: true, mensagem: 'Marcado como conferido.' });
    } catch (erro: any) {
      console.error('Falha ao marcar serviço conferido:', erro?.message || erro);
      res.status(503).json({ sucesso: false, motivo: 'Não consegui marcar agora. Tente de novo.' });
    }
  });
}
