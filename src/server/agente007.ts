// "Agente 007 — conferidor do backup" (pedido do dono, 27/11/2026). MESMO ARQUIVO no Murad DP, no Murad Fiscal e no Murad Contábil:
// cada sistema só entrega as etapas dele (o que conferir/organizar em UMA empresa), a assinatura do que foi gravado e o cofre.
//
// O que o 007 é: um ORQUESTRADOR que trabalha por trás dos panos depois de cada migração pelo backup do sistema anterior.
//  • Fica "esperto" desde o INÍCIO da importação: cada empresa que termina de gravar entra na fila dele (enfileirar), e ele confere
//    aquela empresa ~90 s depois, sem esperar a migração inteira acabar. Várias gravações seguidas da mesma empresa viram uma rodada só.
//  • Não disputa com a gravação: um alvo por vez; as etapas PESADAS (robôs que varrem o sistema) só rodam quando a fila esvazia E não
//    há migração gravando (senão, tenta de novo em 1 minuto). Toda escrita é linha a linha (sem transação longa); o esquema passa pelo
//    ddlProtegido do pool de cada sistema (lock_timeout curto; nunca trava a subida).
//  • Só onde algo mudou: guarda, por escritório + empresa + sistema, a ASSINATURA do que já conferiu (e a versão do mapa do backup).
//    Mesma assinatura = não roda de novo (não gasta recurso). "Rodar agora" força.
//  • Cofre do backup: dado que veio no backup e ainda não tem campo no Murad não se perde — fica cifrado em murad_007_cofre (tabela,
//    coluna e registro de origem), isolado por escritório. O dono vê o painel agregado (sem dado pessoal). Quando o campo entra no MAPA
//    DO BACKUP (a versão do mapa muda) e o sistema tem o "implantador" daquela coluna, o 007 implanta sozinho, só onde está vazio,
//    com a fonte "007: do backup (tabela.coluna)", e marca como implantado.
//
// NUNCA: envia nada a órgão (eSocial, SEFAZ, Receita), consulta SERPRO pago, fecha folha, exclui, transmite, ou grava em escritório que
// não é o dele (toda leitura/gravação aqui leva o tenant). Log só com contagens (sem nome, CPF, salário). O nome do sistema anterior não
// aparece em texto nenhum ("sistema anterior").
import crypto from 'node:crypto';

export type Sistema007 = 'dp' | 'fiscal' | 'contabil';
export const ID_ROBO_007 = 'agente_007';
export const NOME_ROBO_007 = 'Agente 007 — conferidor do backup';
export const ATRASO_APOS_GRAVAR_MS = 90_000;
export const UM_DIA_MS = 24 * 60 * 60_000;

export type Consultar007 = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export interface Alvo007 { tenantId: string; cnpj: string; motivo: string }
/** Um achado que o 007 não corrige sozinho: vira pendência em "Corrigir pendências" (ou já virou Pergunta da Murad). */
export interface Achado007 {
  chave: string; cnpj: string; tipo: 'pendencia' | 'pergunta';
  texto: string; comoCorrigir?: string;
  /** Tela de destino do botão "Corrigir" (id de rota do sistema) e, quando existe, o campo/funcionário. */
  tela: string; campo?: string | null; funcionarioId?: string | null;
  /** Rastro: de onde o 007 tirou a informação (nunca dado pessoal). */
  fonte?: string;
}
export interface ResultadoEtapa007 {
  /** Registros organizados (preenchidos só onde estava vazio). */
  organizados?: number;
  /** Rótulo do que foi organizado ("fichas", "empresas", "notas"...), para o resumo curto. */
  rotulo?: string;
  perguntas?: number;
  achados?: Achado007[];
  /** Itens guardados no cofre do backup nesta rodada. */
  cofre?: number;
  implantados?: number;
  nota?: string;
}
export interface Etapa007 {
  id: string; nome: string;
  /** Pesada = varre o sistema (robôs já existentes): roda só com a fila vazia e sem migração gravando. */
  pesada?: boolean;
  rodar: (alvo: Alvo007) => Promise<ResultadoEtapa007>;
}
export interface Contagem007 { organizados: number; perguntas: number; pendencias: number; cofre: number; implantados: number }
export interface Resumo007 {
  contagem: Contagem007;
  porRotulo: Record<string, number>;
  etapas: Array<{ id: string; nome: string; ok: boolean; nota?: string }>;
  achados: Achado007[];
  motivo: string;
  texto: string;
}
export interface Rodada007 { tenantId: string; cnpj: string; sistema: Sistema007; assinatura: string; versaoMapa: string; resumo: Resumo007; quando: string }

export const assinaturaDe = (partes: unknown): string => crypto.createHash('sha256').update(JSON.stringify(partes ?? null)).digest('hex').slice(0, 32);

/** "007 organizou 62 fichas, 3 perguntas para você" — curto, para a lista de robôs e a voz da Murad. */
export function textoResumo007(c: Contagem007, porRotulo: Record<string, number> = {}): string {
  const partes: string[] = [];
  const rot = Object.entries(porRotulo).filter(([, n]) => n > 0);
  if (rot.length) partes.push(`organizou ${rot.map(([r, n]) => `${n} ${r}`).join(', ')}`);
  else if (c.organizados) partes.push(`organizou ${c.organizados} registro(s)`);
  if (c.implantados) partes.push(`implantou ${c.implantados} dado(s) do cofre do backup`);
  if (c.cofre) partes.push(`guardou ${c.cofre} dado(s) sem campo no cofre do backup`);
  if (c.perguntas) partes.push(`${c.perguntas} pergunta(s) para você`);
  if (c.pendencias) partes.push(`${c.pendencias} pendência(s) para conferir`);
  return partes.length ? `007 ${partes.join(', ')}.` : '007 conferiu o backup: tudo no lugar.';
}

export function precisaRodar(anterior: Rodada007 | null, assinatura: string, versaoMapa: string, forcar = false): boolean {
  if (forcar || !anterior) return true;
  return anterior.assinatura !== assinatura || anterior.versaoMapa !== versaoMapa;
}

// ------------------------------------------------------------------------------------------------------------------ armazenamento
export interface ItemCofre007 { tenantId: string; cnpj: string; sistema: Sistema007; tabela: string; coluna: string; registro: string; valor: string }
export interface LinhaCofre007 { tenantId: string; cnpj: string; tabela: string; coluna: string; registro: string; formato: string; implantado: boolean }
export interface Repo007 {
  lerRodada(tenantId: string, cnpj: string, sistema: Sistema007): Promise<Rodada007 | null>;
  gravarRodada(r: Rodada007): Promise<void>;
  /** Últimas rodadas do escritório (só dele). */
  rodadasDoTenant(tenantId: string, sistema: Sistema007, limite?: number): Promise<Rodada007[]>;
  /** Empresas com migração já conferida pelo 007 (para a rodada diária). */
  alvosConhecidos(sistema: Sistema007): Promise<Array<{ tenantId: string; cnpj: string }>>;
  guardarCofre(itens: ItemCofre007[]): Promise<number>;
  linhasCofre(sistema: Sistema007): Promise<LinhaCofre007[]>;
  /** Valores (já decifrados) ainda não implantados de uma coluna, por empresa. */
  pendentesDaColuna(sistema: Sistema007, tabela: string, coluna: string): Promise<Array<{ tenantId: string; cnpj: string; registro: string; valor: string }>>;
  marcarImplantado(sistema: Sistema007, tenantId: string, cnpj: string, tabela: string, coluna: string, registros: string[], versao: string): Promise<void>;
  versaoMapaVista(sistema: Sistema007): Promise<string | null>;
  gravarVersaoMapa(sistema: Sistema007, versao: string): Promise<void>;
  apagarEmpresa(cnpj: string): Promise<number>;
  apagarTenant(tenantId: string): Promise<number>;
}

/** Formato do valor SEM o dado: dígito vira 9, letra vira A, o resto fica; no máximo 24 caracteres. */
export function formatoSemDado(valor: string): string {
  const s = String(valor ?? '').replace(/\\[rntbfv]/g, ' ').trim();
  const f = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'A').replace(/\s+/g, ' ');
  return f.length > 24 ? `${f.slice(0, 24)}…` : f;
}

export interface Cifra007 {
  cifrar: (cnpj: string, id: string, valor: unknown) => { ciphertext: Buffer; iv: Buffer; tag: Buffer };
  decifrar: (cnpj: string, id: string, ciphertext: Buffer, iv: Buffer, tag: Buffer) => unknown;
}
const idCofre = (sistema: string, tabela: string, coluna: string, registro: string) => `007-cofre:${sistema}:${tabela}.${coluna}:${registro}`;

export const SQL_TABELAS_007 = [
  `CREATE TABLE IF NOT EXISTS murad_007_rodadas (tenant_id text NOT NULL, cnpj text NOT NULL, sistema text NOT NULL, assinatura text NOT NULL,
    versao_mapa text NOT NULL DEFAULT '', resumo jsonb NOT NULL, quando timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, cnpj, sistema))`,
  `CREATE TABLE IF NOT EXISTS murad_007_cofre (tenant_id text NOT NULL, cnpj text NOT NULL, sistema text NOT NULL, tabela text NOT NULL, coluna text NOT NULL,
    registro text NOT NULL, formato text NOT NULL DEFAULT '', valor_ciphertext bytea NOT NULL, valor_iv bytea NOT NULL, valor_tag bytea NOT NULL,
    guardado_em timestamptz NOT NULL DEFAULT now(), implantado_em timestamptz, implantado_versao text, PRIMARY KEY (tenant_id, cnpj, sistema, tabela, coluna, registro))`,
  `CREATE TABLE IF NOT EXISTS murad_007_estado (sistema text PRIMARY KEY, versao_mapa text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now())`,
];

/** `cifra` é obrigatória para o cofre (o DP cifra como a folha do sistema anterior); sem ela, o cofre não grava (o Fiscal e o Contábil já
 *  guardam o que não tem lugar próprio no registro "só para consulta" da migração deles). */
export function repo007Postgres(consultar: Consultar007, cifra: Cifra007 | null = null): Repo007 {
  let pronto: Promise<void> | null = null;
  const ok = () => (pronto ||= (async () => { for (const s of SQL_TABELAS_007) await consultar(s); })().catch((e) => { pronto = null; throw e; }));
  const existe = async () => (await consultar(`SELECT to_regclass('public.murad_007_rodadas') IS NOT NULL AS ok`).catch(() => ({ rows: [{ ok: false }] }))).rows[0]?.ok === true;
  const linha = (r: any): Rodada007 => ({ tenantId: String(r.tenant_id), cnpj: String(r.cnpj), sistema: r.sistema, assinatura: String(r.assinatura), versaoMapa: String(r.versao_mapa || ''), resumo: typeof r.resumo === 'string' ? JSON.parse(r.resumo) : r.resumo, quando: new Date(r.quando).toISOString() });
  return {
    async lerRodada(t, c, s) { await ok(); const r = await consultar('SELECT * FROM murad_007_rodadas WHERE tenant_id=$1 AND cnpj=$2 AND sistema=$3', [t, c, s]); return r.rows[0] ? linha(r.rows[0]) : null; },
    async gravarRodada(x) {
      await ok();
      await consultar(`INSERT INTO murad_007_rodadas (tenant_id, cnpj, sistema, assinatura, versao_mapa, resumo, quando) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
        ON CONFLICT (tenant_id, cnpj, sistema) DO UPDATE SET assinatura=EXCLUDED.assinatura, versao_mapa=EXCLUDED.versao_mapa, resumo=EXCLUDED.resumo, quando=EXCLUDED.quando`,
      [x.tenantId, x.cnpj, x.sistema, x.assinatura, x.versaoMapa, JSON.stringify(x.resumo), x.quando]);
    },
    async rodadasDoTenant(t, s, limite = 200) { await ok(); return (await consultar('SELECT * FROM murad_007_rodadas WHERE tenant_id=$1 AND sistema=$2 ORDER BY quando DESC LIMIT $3', [t, s, limite])).rows.map(linha); },
    async alvosConhecidos(s) { await ok(); return (await consultar('SELECT tenant_id, cnpj FROM murad_007_rodadas WHERE sistema=$1', [s])).rows.map((r: any) => ({ tenantId: String(r.tenant_id), cnpj: String(r.cnpj) })); },
    async guardarCofre(itens) {
      if (!itens.length) return 0;
      if (!cifra) throw new Error('Cofre do backup sem cifra configurada: nada foi gravado.');
      await ok(); let n = 0;
      for (const i of itens) {
        const e = cifra.cifrar(i.cnpj, idCofre(i.sistema, i.tabela, i.coluna, i.registro), i.valor);
        // Já guardado e ainda não implantado: atualiza o valor (o backup novo vale); implantado não volta a pendente.
        const r = await consultar(`INSERT INTO murad_007_cofre (tenant_id, cnpj, sistema, tabela, coluna, registro, formato, valor_ciphertext, valor_iv, valor_tag)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id, cnpj, sistema, tabela, coluna, registro) DO UPDATE SET formato=EXCLUDED.formato,
          valor_ciphertext=EXCLUDED.valor_ciphertext, valor_iv=EXCLUDED.valor_iv, valor_tag=EXCLUDED.valor_tag, guardado_em=now() WHERE murad_007_cofre.implantado_em IS NULL`,
        [i.tenantId, i.cnpj, i.sistema, i.tabela.slice(0, 80), i.coluna.slice(0, 80), i.registro.slice(0, 160), formatoSemDado(i.valor), e.ciphertext, e.iv, e.tag]);
        n += Number(r.rowCount ?? 1);
      }
      return n;
    },
    async linhasCofre(s) {
      await ok();
      return (await consultar('SELECT tenant_id, cnpj, tabela, coluna, registro, formato, implantado_em IS NOT NULL AS implantado FROM murad_007_cofre WHERE sistema=$1', [s])).rows
        .map((r: any) => ({ tenantId: String(r.tenant_id), cnpj: String(r.cnpj), tabela: String(r.tabela), coluna: String(r.coluna), registro: String(r.registro), formato: String(r.formato || ''), implantado: r.implantado === true }));
    },
    async pendentesDaColuna(s, tabela, coluna) {
      await ok();
      const r = await consultar('SELECT * FROM murad_007_cofre WHERE sistema=$1 AND tabela=$2 AND coluna=$3 AND implantado_em IS NULL ORDER BY tenant_id, cnpj', [s, tabela, coluna]);
      const out: Array<{ tenantId: string; cnpj: string; registro: string; valor: string }> = [];
      for (const x of r.rows) {
        try { if (!cifra) break; out.push({ tenantId: String(x.tenant_id), cnpj: String(x.cnpj), registro: String(x.registro), valor: String(cifra.decifrar(String(x.cnpj), idCofre(s, tabela, coluna, String(x.registro)), x.valor_ciphertext, x.valor_iv, x.valor_tag) ?? '') }); }
        catch { /* chave trocada ou linha estragada: fica no cofre, não implanta */ }
      }
      return out;
    },
    async marcarImplantado(s, t, c, tabela, coluna, registros, versao) {
      if (!registros.length) return;
      await ok();
      await consultar('UPDATE murad_007_cofre SET implantado_em=now(), implantado_versao=$7 WHERE sistema=$1 AND tenant_id=$2 AND cnpj=$3 AND tabela=$4 AND coluna=$5 AND registro = ANY($6::text[])', [s, t, c, tabela, coluna, registros, versao]);
    },
    async versaoMapaVista(s) { await ok(); return (await consultar('SELECT versao_mapa FROM murad_007_estado WHERE sistema=$1', [s])).rows[0]?.versao_mapa ?? null; },
    async gravarVersaoMapa(s, v) { await ok(); await consultar('INSERT INTO murad_007_estado (sistema, versao_mapa, atualizado_em) VALUES ($1,$2,now()) ON CONFLICT (sistema) DO UPDATE SET versao_mapa=EXCLUDED.versao_mapa, atualizado_em=now()', [s, v]); },
    // Exclusão: nunca cria a tabela só para apagar; não deixa lista de CNPJ excluído (dá para cadastrar e migrar de novo).
    async apagarEmpresa(c) { if (!(await existe())) return 0; let n = 0; for (const t of ['murad_007_rodadas', 'murad_007_cofre']) n += Number((await consultar(`DELETE FROM ${t} WHERE cnpj=$1`, [c])).rowCount ?? 0); return n; },
    async apagarTenant(t) { if (!(await existe())) return 0; let n = 0; for (const x of ['murad_007_rodadas', 'murad_007_cofre']) n += Number((await consultar(`DELETE FROM ${x} WHERE tenant_id=$1`, [t])).rowCount ?? 0); return n; },
  };
}

/** Repositório em memória (testes). Mesmo contrato do Postgres, inclusive o isolamento por escritório. */
export function repo007EmMemoria(): Repo007 & { cofreCru: () => Array<ItemCofre007 & { implantado: boolean }> } {
  const rodadas = new Map<string, Rodada007>(); const cofre = new Map<string, ItemCofre007 & { implantado: boolean; versao?: string }>(); const versoes = new Map<string, string>();
  const kr = (t: string, c: string, s: string) => `${t}|${c}|${s}`;
  const kc = (i: { tenantId: string; cnpj: string; sistema: string; tabela: string; coluna: string; registro: string }) => `${i.tenantId}|${i.cnpj}|${i.sistema}|${i.tabela}|${i.coluna}|${i.registro}`;
  const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    async lerRodada(t, c, s) { const r = rodadas.get(kr(t, c, s)); return r ? copia(r) : null; },
    async gravarRodada(r) { rodadas.set(kr(r.tenantId, r.cnpj, r.sistema), copia(r)); },
    async rodadasDoTenant(t, s, limite = 200) { return copia([...rodadas.values()].filter((r) => r.tenantId === t && r.sistema === s).sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, limite)); },
    async alvosConhecidos(s) { return [...rodadas.values()].filter((r) => r.sistema === s).map((r) => ({ tenantId: r.tenantId, cnpj: r.cnpj })); },
    async guardarCofre(itens) { let n = 0; for (const i of itens) { const k = kc(i); const a = cofre.get(k); if (a?.implantado) continue; cofre.set(k, { ...i, implantado: false }); n++; } return n; },
    async linhasCofre(s) { return [...cofre.values()].filter((i) => i.sistema === s).map((i) => ({ tenantId: i.tenantId, cnpj: i.cnpj, tabela: i.tabela, coluna: i.coluna, registro: i.registro, formato: formatoSemDado(i.valor), implantado: i.implantado })); },
    async pendentesDaColuna(s, tabela, coluna) { return [...cofre.values()].filter((i) => i.sistema === s && i.tabela === tabela && i.coluna === coluna && !i.implantado).map((i) => ({ tenantId: i.tenantId, cnpj: i.cnpj, registro: i.registro, valor: i.valor })); },
    async marcarImplantado(s, t, c, tabela, coluna, registros, versao) { for (const r of registros) { const x = cofre.get(kc({ tenantId: t, cnpj: c, sistema: s, tabela, coluna, registro: r })); if (x) { x.implantado = true; x.versao = versao; } } },
    async versaoMapaVista(s) { return versoes.get(s) ?? null; },
    async gravarVersaoMapa(s, v) { versoes.set(s, v); },
    async apagarEmpresa(c) { let n = 0; for (const [k, r] of rodadas) if (r.cnpj === c) { rodadas.delete(k); n++; } for (const [k, i] of cofre) if (i.cnpj === c) { cofre.delete(k); n++; } return n; },
    async apagarTenant(t) { let n = 0; for (const [k, r] of rodadas) if (r.tenantId === t) { rodadas.delete(k); n++; } for (const [k, i] of cofre) if (i.tenantId === t) { cofre.delete(k); n++; } return n; },
    cofreCru: () => copia([...cofre.values()]),
  };
}

// ------------------------------------------------------------------------------------------------------------------ uma empresa
export interface Deps007 {
  sistema: Sistema007;
  repo: Repo007;
  /** Etapas na ORDEM do fluxo (Fiscal → DP → Contábil): leves por empresa; as pesadas rodam depois, com a fila vazia. */
  etapas: Etapa007[];
  /** Assinatura do que está gravado da empresa (contagens + última gravação). Sem dado pessoal. */
  assinatura: (alvo: Alvo007) => Promise<string>;
  /** Versão do mapa do backup deste sistema (muda quando o mapa ganha/perde coluna ou destino). */
  versaoMapa: string;
  /** Há migração gravando agora neste servidor? (as etapas pesadas esperam). */
  migracaoGravando?: () => boolean | Promise<boolean>;
  agora?: () => Date;
  log?: (linha: string) => void;
}

/** Confere e organiza UMA empresa (só as etapas leves). Devolve null quando não havia nada novo (mesma assinatura). */
export async function rodarEmpresa007(d: Deps007, alvo: Alvo007, o: { forcar?: boolean } = {}): Promise<Rodada007 | null> {
  const antes = await d.assinatura(alvo);
  const anterior = await d.repo.lerRodada(alvo.tenantId, alvo.cnpj, d.sistema);
  if (!precisaRodar(anterior, antes, d.versaoMapa, o.forcar)) return null;
  const contagem: Contagem007 = { organizados: 0, perguntas: 0, pendencias: 0, cofre: 0, implantados: 0 };
  const porRotulo: Record<string, number> = {}; const etapas: Resumo007['etapas'] = []; const achados: Achado007[] = [];
  for (const e of d.etapas.filter((x) => !x.pesada)) {
    try {
      const r = await e.rodar(alvo);
      contagem.organizados += r.organizados || 0; contagem.perguntas += r.perguntas || 0; contagem.cofre += r.cofre || 0; contagem.implantados += r.implantados || 0;
      if (r.organizados && r.rotulo) porRotulo[r.rotulo] = (porRotulo[r.rotulo] || 0) + r.organizados;
      for (const a of r.achados || []) if (a.cnpj === alvo.cnpj && !achados.some((x) => x.chave === a.chave)) achados.push(a);
      etapas.push({ id: e.id, nome: e.nome, ok: true, ...(r.nota ? { nota: r.nota.slice(0, 300) } : {}) });
    } catch (erro: any) {
      etapas.push({ id: e.id, nome: e.nome, ok: false, nota: 'não terminou; tenta de novo na próxima rodada' });
      d.log?.(`[007:${d.sistema}] etapa ${e.id} falhou numa empresa: ${String(erro?.message || erro).replace(/\d{11,14}/g, '…').slice(0, 160)}`);
    }
  }
  contagem.pendencias = achados.filter((a) => a.tipo === 'pendencia').length;
  // A assinatura gravada é a de DEPOIS (o que o próprio 007 preencheu não dispara outra rodada). Etapa que falhou: grava a de antes
  // trocada, para a próxima rodada tentar de novo.
  const falhou = etapas.some((e) => !e.ok);
  const depois = falhou ? `${antes}:refazer` : await d.assinatura(alvo).catch(() => antes);
  const resumo: Resumo007 = { contagem, porRotulo, etapas, achados: achados.slice(0, 200), motivo: alvo.motivo.slice(0, 120), texto: textoResumo007(contagem, porRotulo) };
  const rodada: Rodada007 = { tenantId: alvo.tenantId, cnpj: alvo.cnpj, sistema: d.sistema, assinatura: depois, versaoMapa: d.versaoMapa, resumo, quando: (d.agora?.() ?? new Date()).toISOString() };
  await d.repo.gravarRodada(rodada);
  return rodada;
}

/** Etapas pesadas (robôs que já existem, na ordem certa). Uma vez por lote de empresas, não por empresa. */
export async function rodarEtapasPesadas007(d: Deps007, motivo: string): Promise<Array<{ id: string; ok: boolean; nota?: string }>> {
  const out: Array<{ id: string; ok: boolean; nota?: string }> = [];
  for (const e of d.etapas.filter((x) => x.pesada)) {
    try { const r = await e.rodar({ tenantId: '*', cnpj: '*', motivo }); out.push({ id: e.id, ok: true, ...(r.nota ? { nota: r.nota.slice(0, 300) } : {}) }); }
    catch (erro: any) { out.push({ id: e.id, ok: false, nota: 'não terminou' }); d.log?.(`[007:${d.sistema}] etapa pesada ${e.id} falhou: ${String(erro?.message || erro).slice(0, 160)}`); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ fila
export interface Fila007 {
  /** Põe a empresa na fila (repetir a mesma empresa antes da vez só adia). */
  enfileirar(alvo: Alvo007, atrasoMs?: number): void;
  /** Roda agora (Rodar agora do escritório): todas as empresas dele, forçando; não espera a migração. */
  rodarTenant(tenantId: string, cnpjs: string[]): Promise<Rodada007[]>;
  /** Rodada diária: todas as empresas que o 007 já conhece (só roda onde a assinatura mudou). */
  rodadaDiaria(): Promise<{ empresas: number; rodadas: number }>;
  aguardando(): number;
  /** Para os testes: espera a fila esvaziar. */
  ocioso(): Promise<void>;
  ultimoResumoGeral(): string;
}

export function criarFila007(d: Deps007, op: { aoTerminarLote?: (rodadas: Rodada007[], pesadas: Array<{ id: string; ok: boolean; nota?: string }>) => void; esperaMigracaoMs?: number; temporizador?: (fn: () => void, ms: number) => { cancelar(): void } } = {}): Fila007 {
  const timer = op.temporizador ?? ((fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return { cancelar: () => clearTimeout(t) }; });
  const agendados = new Map<string, { alvo: Alvo007; t: { cancelar(): void } }>();
  const prontos: Alvo007[] = [];
  let trabalhando = false; let lote: Rodada007[] = []; let pesadasPendentes = false; let ultimo = '';
  const esperas: Array<() => void> = [];
  const chave = (a: Alvo007) => `${a.tenantId}|${a.cnpj}`;
  const avisarOcioso = () => { if (!trabalhando && !prontos.length && !agendados.size && !pesadasPendentes) while (esperas.length) esperas.shift()!(); };
  const pesadas = async () => {
    if (!pesadasPendentes) return;
    if (await Promise.resolve(d.migracaoGravando?.() ?? false)) { timer(() => { void ciclo(); }, op.esperaMigracaoMs ?? 60_000); return; }
    pesadasPendentes = false;
    const r = await rodarEtapasPesadas007(d, 'depois das empresas conferidas');
    const feitas = lote; lote = [];
    const c = feitas.reduce((s, x) => ({ organizados: s.organizados + x.resumo.contagem.organizados, perguntas: s.perguntas + x.resumo.contagem.perguntas, pendencias: s.pendencias + x.resumo.contagem.pendencias, cofre: s.cofre + x.resumo.contagem.cofre, implantados: s.implantados + x.resumo.contagem.implantados }), { organizados: 0, perguntas: 0, pendencias: 0, cofre: 0, implantados: 0 });
    ultimo = `${feitas.length} empresa(s) conferida(s); ${textoResumo007(c)}${r.some((x) => !x.ok) ? ' (um robô encadeado não terminou; tenta de novo)' : ''}`;
    d.log?.(`[007:${d.sistema}] ${ultimo}`);
    op.aoTerminarLote?.(feitas, r);
  };
  const ciclo = async () => {
    if (trabalhando) return;
    trabalhando = true;
    try {
      while (prontos.length) {
        const alvo = prontos.shift()!;
        try { const r = await rodarEmpresa007(d, alvo); if (r) { lote.push(r); pesadasPendentes = true; } }
        catch (e: any) { d.log?.(`[007:${d.sistema}] falha numa empresa: ${String(e?.message || e).slice(0, 160)}`); }
      }
      if (!agendados.size) await pesadas();
    } finally { trabalhando = false; if (prontos.length) void ciclo(); avisarOcioso(); }
  };
  return {
    enfileirar(alvo, atrasoMs = ATRASO_APOS_GRAVAR_MS) {
      if (!alvo?.tenantId || !alvo?.cnpj) return;
      const k = chave(alvo); agendados.get(k)?.t.cancelar();
      const t = timer(() => { agendados.delete(k); if (!prontos.some((p) => chave(p) === k)) prontos.push(alvo); void ciclo(); }, atrasoMs);
      agendados.set(k, { alvo, t });
    },
    async rodarTenant(tenantId, cnpjs) {
      const out: Rodada007[] = [];
      for (const cnpj of [...new Set(cnpjs)]) { const r = await rodarEmpresa007(d, { tenantId, cnpj, motivo: 'Rodar agora' }, { forcar: true }); if (r) out.push(r); }
      if (out.length) { lote.push(...out); pesadasPendentes = true; void ciclo(); }
      return out;
    },
    async rodadaDiaria() {
      const alvos = await d.repo.alvosConhecidos(d.sistema);
      let rodadas = 0;
      for (const a of alvos) { const r = await rodarEmpresa007(d, { ...a, motivo: 'conferência diária' }).catch(() => null); if (r) { rodadas++; lote.push(r); pesadasPendentes = true; } }
      if (rodadas) void ciclo();
      return { empresas: alvos.length, rodadas };
    },
    aguardando: () => prontos.length + agendados.size,
    ocioso: () => new Promise<void>((ok) => { esperas.push(ok); avisarOcioso(); }),
    ultimoResumoGeral: () => ultimo,
  };
}

// ------------------------------------------------------------------------------------------------------------------ cofre + mapa
/** Coluna do backup que o sistema sabe implantar (o campo já existe no Murad e está no mapa). `aplicar` só preenche o vazio. */
export interface Implantador007 {
  tabela: string; coluna: string; campo: string;
  aplicar: (tenantId: string, cnpj: string, itens: Array<{ registro: string; valor: string }>, fonte: string) => Promise<{ implantados: string[] }>;
}
export const fonteDoCofre = (tabela: string, coluna: string) => `007: do backup (${tabela}.${coluna})`;

/** Quando o mapa do backup mudou (ou a cada rodada diária), implanta do cofre o que agora tem campo. Só vazio; marca o que foi. */
export async function implantarDoCofre007(d: Pick<Deps007, 'sistema' | 'repo' | 'versaoMapa' | 'log'>, implantadores: Implantador007[], o: { forcar?: boolean } = {}): Promise<{ implantados: number; colunas: number; mapaMudou: boolean }> {
  const vista = await d.repo.versaoMapaVista(d.sistema);
  const mapaMudou = vista !== d.versaoMapa;
  if (!mapaMudou && !o.forcar) return { implantados: 0, colunas: 0, mapaMudou };
  let implantados = 0; let colunas = 0;
  for (const imp of implantadores) {
    const pend = await d.repo.pendentesDaColuna(d.sistema, imp.tabela, imp.coluna);
    if (!pend.length) continue;
    colunas++;
    const porEmpresa = new Map<string, { tenantId: string; cnpj: string; itens: Array<{ registro: string; valor: string }> }>();
    for (const p of pend) { const k = `${p.tenantId}|${p.cnpj}`; const x = porEmpresa.get(k) || { tenantId: p.tenantId, cnpj: p.cnpj, itens: [] }; x.itens.push({ registro: p.registro, valor: p.valor }); porEmpresa.set(k, x); }
    for (const e of porEmpresa.values()) {
      try {
        const r = await imp.aplicar(e.tenantId, e.cnpj, e.itens, fonteDoCofre(imp.tabela, imp.coluna));
        await d.repo.marcarImplantado(d.sistema, e.tenantId, e.cnpj, imp.tabela, imp.coluna, r.implantados, d.versaoMapa);
        implantados += r.implantados.length;
      } catch (erro: any) { d.log?.(`[007:${d.sistema}] implantar ${imp.tabela}.${imp.coluna} falhou numa empresa: ${String(erro?.message || erro).slice(0, 160)}`); }
    }
  }
  await d.repo.gravarVersaoMapa(d.sistema, d.versaoMapa);
  if (implantados) d.log?.(`[007:${d.sistema}] mapa do backup na versão ${d.versaoMapa.slice(0, 8)}: ${implantados} dado(s) implantado(s) do cofre em ${colunas} coluna(s).`);
  return { implantados, colunas, mapaMudou };
}

export interface LinhaPainelCofre {
  tabela: string; coluna: string; registros: number; empresas: number; escritorios: number; formato: string;
  situacao: 'sem_lugar' | 'campo_no_mapa_sem_implantador' | 'implantado';
  sugestao: string; implantados: number;
}
/** Painel do DONO ("Campos do backup sem lugar no Murad"): agregado, sem CNPJ, sem nome, sem valor — só o formato. */
export function painelCofre007(linhas: LinhaCofre007[], o: { temImplantador: (tabela: string, coluna: string) => boolean; noMapaComCampo: (tabela: string, coluna: string) => boolean; sugestao: (tabela: string, coluna: string) => string }): LinhaPainelCofre[] {
  const m = new Map<string, { tabela: string; coluna: string; registros: number; implantados: number; empresas: Set<string>; escritorios: Set<string>; formatos: Map<string, number> }>();
  for (const l of linhas) {
    const k = `${l.tabela}.${l.coluna}`;
    const x = m.get(k) || { tabela: l.tabela, coluna: l.coluna, registros: 0, implantados: 0, empresas: new Set<string>(), escritorios: new Set<string>(), formatos: new Map<string, number>() };
    if (l.implantado) x.implantados++; else { x.registros++; x.empresas.add(`${l.tenantId}|${l.cnpj}`); x.escritorios.add(l.tenantId); x.formatos.set(l.formato, (x.formatos.get(l.formato) || 0) + 1); }
    m.set(k, x);
  }
  return [...m.values()].map((x) => {
    const situacao: LinhaPainelCofre['situacao'] = !x.registros ? 'implantado' : o.temImplantador(x.tabela, x.coluna) ? 'implantado' : o.noMapaComCampo(x.tabela, x.coluna) ? 'campo_no_mapa_sem_implantador' : 'sem_lugar';
    const formato = [...x.formatos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return { tabela: x.tabela, coluna: x.coluna, registros: x.registros, empresas: x.empresas.size, escritorios: x.escritorios.size, formato, situacao, sugestao: o.sugestao(x.tabela, x.coluna), implantados: x.implantados };
  }).sort((a, b) => (a.situacao === 'implantado' ? 1 : 0) - (b.situacao === 'implantado' ? 1 : 0) || b.escritorios - a.escritorios || b.registros - a.registros || `${a.tabela}.${a.coluna}`.localeCompare(`${b.tabela}.${b.coluna}`));
}

/** Pergunta curta para a voz: "Murad, o que o 007 fez?" / "o 007 conferiu meu backup?". */
export const PERGUNTA_007 = /\b(007|zero\s*zero\s*sete)\b.*\b(fez|feito|faz|confer|organiz|backup|resum|relat)|\b(confer|organiz)\w*\b.*\b(007|zero\s*zero\s*sete)\b/i;
export function ehPerguntaSobre007(texto: string): boolean { return PERGUNTA_007.test(String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')); }

/** Resposta curta da Murad a partir das últimas rodadas do escritório. */
export function respostaMurad007(rodadas: Rodada007[]): string {
  if (!rodadas.length) return 'O Agente 007 ainda não conferiu nenhum backup deste escritório. Ele começa sozinho quando uma migração pelo backup grava a primeira empresa.';
  const c = rodadas.reduce((s, x) => ({ organizados: s.organizados + x.resumo.contagem.organizados, perguntas: s.perguntas + x.resumo.contagem.perguntas, pendencias: s.pendencias + x.resumo.contagem.pendencias, cofre: s.cofre + x.resumo.contagem.cofre, implantados: s.implantados + x.resumo.contagem.implantados }), { organizados: 0, perguntas: 0, pendencias: 0, cofre: 0, implantados: 0 });
  const porRotulo: Record<string, number> = {};
  for (const r of rodadas) for (const [k, v] of Object.entries(r.resumo.porRotulo || {})) porRotulo[k] = (porRotulo[k] || 0) + v;
  const ultima = rodadas.map((r) => r.quando).sort().pop()!;
  const dt = new Date(ultima); const quando = `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  return `Sim. Na última conferência (${quando}), em ${rodadas.length} empresa(s): ${textoResumo007(c, porRotulo).replace(/^007 /, 'o 007 ')} Abro o relatório na tela de Robôs.`;
}
