// Agente 007 no Murad Contábil (núcleo em agente007.ts, igual nos três sistemas). O Contábil é o último do fluxo (Fiscal → DP → Contábil e
// Fiscal → Contábil): primeiro organiza a empresa migrada; depois encadeia o Aproveitamento do Backup pelo Fiscal, o Reconciliador (o que
// veio do Fiscal e do DP vira pré-lançamento para conferir) e o Conferidor da Migração.
//
// Etapas LEVES (por empresa, ~90 s depois de ela terminar de gravar na migração, também na retomada):
//  1. completar — completa os campos vazios pelo registro guardado do sistema anterior (completarEmpresaMigrada: transação curta por
//     empresa, nunca sobrescreve, não mexe em competência fechada, passa pela validação do workspace).
//  2. balancete — conferência da migração (conferirEmpresaMigrada): o que não bate vira ponto para conferir.
//  3. campo_a_campo — o que estava preenchido no backup e faltou/veio diferente (conferirCamposEmpresaMigrada).
//  4. cofre — o dado do registro do sistema anterior (contabil_sistema_anterior, cifrado em repouso) que não tem campo no Contábil (destino
//     "consulta" no catálogo, ou coluna fora do catálogo) vai, coluna por coluna, para o cofre do backup (murad_007_cofre, cifrado, isolado
//     por escritório, com tabela/coluna e registro de origem). O painel do dono lê dele, e o 007 implanta quando a coluna entra em
//     IMPLANTAVEIS_CONTABIL (só no cadastro da empresa, só onde está vazio, nunca em competência).
// Nunca: transmissão (ECD/ECF), exclusão, aprovação de lançamento, Serpro. Log só com contagens.
import type { Achado007, Etapa007, Implantador007, ItemCofre007, LinhaCofre007, LinhaPainelCofre } from './agente007';
import { painelCofre007 } from './agente007';
import { completarEmpresaMigrada, conferirEmpresaMigrada, conferirCamposEmpresaMigrada, TABELA_SISTEMA_ANTERIOR } from './migracaoSistemaAnterior/banco';
import { lerBlocos } from './migracaoSistemaAnterior/cifraRegistro';
import { DESTINO_COLUNAS, type DestinoTabela } from './migracaoSistemaAnterior/camposSistemaAnterior';
import { colunasSoConsulta, IMPLANTAVEIS_CONTABIL, type ImplantavelContabil } from '../data/mapaBackupContabil';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Banco = Parameters<typeof completarEmpresaMigrada>[0];
const TELA = 'migracao';

export function achadosBalancete007(cnpj: string, c: { bate: boolean; resumo: string } | null): Achado007[] {
  return c && !c.bate ? [{ chave: `balancete|${cnpj}`, cnpj, tipo: 'pendencia', tela: TELA, fonte: 'conferência do backup x gravado',
    texto: `Backup x gravado (Contábil): ${String(c.resumo).slice(0, 300)}`, comoCorrigir: 'Empresa › Migração › "O que veio do sistema anterior para esta empresa".' }] : [];
}
export function achadosCampos007(cnpj: string, pend: Array<{ tipo: string; item: string; rotulo: string }> | null | undefined): Achado007[] {
  const p = pend || []; if (!p.length) return [];
  const faltou = p.filter((x) => x.tipo === 'faltou').length; const dif = p.length - faltou;
  return [{ chave: `campos|${cnpj}`, cnpj, tipo: 'pendencia', tela: TELA, fonte: 'conferidor campo a campo da migração',
    texto: `Campo a campo: ${faltou ? `${faltou} campo(s) do backup não chegaram` : ''}${faltou && dif ? ' e ' : ''}${dif ? `${dif} vieram diferentes` : ''} (ex.: ${p[0].item} › ${p[0].rotulo}).`,
    comoCorrigir: 'Empresa › Migração › "O que veio do sistema anterior para esta empresa".' }];
}

export async function assinatura007Contabil(q: Q, cnpj: string): Promise<string> {
  const [w, r] = await Promise.all([
    q('SELECT version, updated_at::text AS u FROM contabil_company_workspaces WHERE cnpj=$1', [cnpj]).catch(() => ({ rows: [] as any[] })),
    q(`SELECT count(*)::int AS n, max(migrado_em)::text AS m FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1`, [cnpj]).catch(() => ({ rows: [] as any[] })),
  ]);
  return JSON.stringify([w.rows[0]?.version ?? '', w.rows[0]?.u ?? '', r.rows[0]?.n ?? 0, r.rows[0]?.m ?? '']);
}

export interface DepsAgente007Contabil {
  consultar: Q; banco: () => Banco; workspaceValido: (p: unknown) => boolean; pesadas: Array<{ id: string; nome: string; rodar: () => Promise<string | void> }>;
  /** Grava no cofre do backup (murad_007_cofre, cifrado). Sem ele (servidor sem chave mestra), a etapa do cofre não guarda nada. */
  guardarCofre?: (itens: ItemCofre007[]) => Promise<number>;
}

export function etapas007Contabil(d: DepsAgente007Contabil): Etapa007[] {
  const completar: Etapa007 = { id: 'completar', nome: 'Completar pelo registro do sistema anterior',
    rodar: async (alvo) => { const f = await completarEmpresaMigrada(d.banco(), alvo.cnpj, (p) => d.workspaceValido(p)); return f.length ? { organizados: f.length, rotulo: 'campos' } : {}; } };
  const balancete: Etapa007 = { id: 'balancete', nome: 'Backup x gravado (balancete)',
    rodar: async (alvo) => ({ achados: achadosBalancete007(alvo.cnpj, await conferirEmpresaMigrada(d.consultar as any, alvo.cnpj)) }) };
  const campos: Etapa007 = { id: 'campo_a_campo', nome: 'Campo a campo',
    rodar: async (alvo) => ({ achados: achadosCampos007(alvo.cnpj, (await conferirCamposEmpresaMigrada(d.consultar as any, alvo.cnpj))?.pendencias as any) }) };
  const cofre: Etapa007 = { id: 'cofre', nome: 'Cofre do backup (dado sem campo no Contábil)',
    rodar: async (alvo) => {
      if (!d.guardarCofre) return { nota: 'sem a chave mestra no servidor: o cofre não guardou nada (o registro da migração continua guardado)' };
      const itens = await itensCofreContabil(d.consultar, alvo.cnpj);
      const n = itens.length ? await d.guardarCofre(itens.map((i) => ({ ...i, tenantId: alvo.tenantId, cnpj: alvo.cnpj, sistema: 'contabil' as const }))) : 0;
      return n ? { cofre: n } : {};
    } };
  const pesadas: Etapa007[] = d.pesadas.map((p) => ({ id: p.id, nome: p.nome, pesada: true, rodar: async () => { const n = await p.rodar(); return n ? { nota: n } : {}; } }));
  return [completar, balancete, campos, cofre, ...pesadas];
}

// ------------------------------------------------------------------------------------------------------------------ cofre do backup
export const MAX_ITENS_COFRE_CONTABIL = 5000;
export const MAX_POR_COLUNA_COFRE_CONTABIL = 500;
/** Valor com dado (mesma regra do DP): não vazio, não nulo e diferente de zero/não. */
export function valorComDado(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'object') return false;
  const s = String(v).replace(/\\[rntbfv]/g, ' ').trim();
  return s !== '' && s !== '\\N' && !/^(0|0\.0+|f|false|N|F)$/.test(s);
}
/** Tabela do catálogo de um bloco guardado (lancamentos_originais_2024 → o mesmo da tabela de lançamentos). */
export function tabelaDoBloco(bloco: string): { tabela: string; destino: DestinoTabela | null } {
  const b = String(bloco).replace(/^(lancamentos_originais)_(\d{4}|sem_data)$/, '$1');
  const e = Object.entries(DESTINO_COLUNAS).find(([t, x]) => x.bloco === b || t === b);
  return e ? { tabela: e[0], destino: e[1] } : { tabela: b, destino: null };
}
const COLUNAS_ID = ['id', 'idconta', 'cdchamada', 'cdcodigo', 'idlancamento', 'idlote', 'cdhistorico', 'idbem', 'idtitulo', 'nrsequencia', 'dtinicial'];
/** Itens do cofre de UMA empresa, tirados do registro guardado (aberto ou cifrado): só colunas sem campo no Contábil. O registro de origem
 *  leva só identificadores da linha (nunca nome). Limite por coluna e por empresa (igual ao DP). */
export async function itensCofreContabil(q: Q, cnpj: string): Promise<Array<{ tabela: string; coluna: string; registro: string; valor: string }>> {
  const nomes = (await q(`SELECT bloco FROM ${TABELA_SISTEMA_ANTERIOR} WHERE cnpj=$1 AND bloco NOT LIKE '\\_\\_%' ORDER BY bloco`, [cnpj]).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => String(r.bloco));
  const out: Array<{ tabela: string; coluna: string; registro: string; valor: string }> = []; const porColuna = new Map<string, number>();
  for (const bloco of nomes) {
    if (out.length >= MAX_ITENS_COFRE_CONTABIL) break;
    const { tabela, destino } = tabelaDoBloco(bloco);
    const linhas = (await lerBlocos(q, cnpj, [bloco]))[bloco]; // um bloco por vez (blocos de lançamentos podem ser grandes)
    if (!Array.isArray(linhas)) continue;
    linhas.forEach((l: Record<string, unknown>, i: number) => {
      if (!l || typeof l !== 'object') return;
      const ids = COLUNAS_ID.filter((c) => valorComDado(l[c])).map((c) => `${c}=${String(l[c]).slice(0, 40)}`);
      const registro = `${bloco};${ids.length ? ids.join(';') : `linha=${i + 1}`}`.slice(0, 160);
      for (const [coluna, v] of Object.entries(l)) {
        if (out.length >= MAX_ITENS_COFRE_CONTABIL) return;
        const dest = destino ? (destino.colunas[coluna.toLowerCase()] || destino.padrao) : null;
        if ((dest && dest.tipo !== 'consulta') || !valorComDado(v)) continue; // tem campo ou não vem de propósito
        const kc = `${tabela}.${coluna}`; const n = porColuna.get(kc) ?? 0; if (n >= MAX_POR_COLUNA_COFRE_CONTABIL) continue;
        porColuna.set(kc, n + 1);
        out.push({ tabela, coluna, registro, valor: String(v).slice(0, 2000) });
      }
    });
  }
  return out;
}

const CAMINHOS_PROIBIDOS = /^(lancamentos|saldos|balancete|fechamento|competencia|historicoArquivado|fontes007|cnpj$)/i;
const ler = (o: any, caminho: string) => caminho.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
function gravar(o: any, caminho: string, v: unknown) { const ks = caminho.split('.'); let x = o; for (const k of ks.slice(0, -1)) { if (!x[k] || typeof x[k] !== 'object') x[k] = {}; x = x[k]; } x[ks[ks.length - 1]] = v; }
/** Implantadores das colunas que ganharam campo (IMPLANTAVEIS_CONTABIL): só no cadastro da empresa (payload.empresa do workspace, fora de
 *  qualquer competência; `campo` é o caminho DENTRO de empresa), só onde está vazio, só do escritório dono, numa transação curta com a
 *  mesma trava da gravação e do Completar, passando pela validação do workspace. A fonte fica em empresa.fontes007. Nunca envia a órgão. */
export function implantadores007Contabil(banco: () => Banco, validar: (p: unknown) => boolean, escritorioDaEmpresa: (cnpj: string) => Promise<string>, lista: ImplantavelContabil[] = IMPLANTAVEIS_CONTABIL): Implantador007[] {
  return lista.map((i) => ({
    tabela: i.tabela, coluna: i.coluna, campo: i.campo,
    aplicar: async (tenantId, cnpj, itens, fonte) => {
      if (CAMINHOS_PROIBIDOS.test(i.campo)) return { implantados: [] }; // nunca mexe em lançamento, saldo ou competência
      if ((await escritorioDaEmpresa(cnpj)) !== tenantId) return { implantados: [] };
      const valor = String(itens.find((x) => valorComDado(x.valor))?.valor ?? '').replace(/\\[rntbfv]/g, ' ').trim();
      if (!valor) return { implantados: [] };
      const feito = await banco().transacao(async (q) => {
        await q('SELECT pg_advisory_xact_lock(hashtext($1))', [cnpj]);
        const ws = (await q('SELECT payload FROM contabil_company_workspaces WHERE cnpj=$1 FOR UPDATE', [cnpj])).rows[0];
        if (!ws) return false; // empresa ainda sem workspace: fica no cofre para a próxima
        const p = JSON.parse(JSON.stringify(ws.payload || {}));
        const emp = p.empresa && typeof p.empresa === 'object' && !Array.isArray(p.empresa) ? p.empresa : (p.empresa = {});
        const atual = ler(emp, i.campo);
        if (atual !== undefined && atual !== null && String(atual).trim() !== '') return true; // já preenchido: não sobrescreve
        gravar(emp, i.campo, valor); emp.fontes007 = { ...(emp.fontes007 && typeof emp.fontes007 === 'object' ? emp.fontes007 : {}), [i.campo]: fonte };
        if (!validar(p)) return false;
        await q('UPDATE contabil_company_workspaces SET payload=$2::jsonb,version=version+1,updated_at=now() WHERE cnpj=$1', [cnpj, JSON.stringify(p)]);
        return true;
      });
      return { implantados: feito ? itens.map((x) => x.registro) : [] };
    },
  }));
}
export const temImplantadorContabil = (tabela: string, coluna: string, lista: ImplantavelContabil[] = IMPLANTAVEIS_CONTABIL) => lista.some((i) => i.tabela === tabela && i.coluna === coluna);
export const noMapaComCampoContabil = (tabela: string, coluna: string) => { const d = tabelaDoBloco(tabela).destino; return !!d && (d.colunas[coluna.toLowerCase()] || d.padrao).tipo === 'campo'; };
export function sugestaoCampoContabil(tabela: string, coluna: string): string {
  const d = tabelaDoBloco(tabela).destino; const x = d ? (d.colunas[coluna.toLowerCase()] || d.padrao) : null;
  if (x?.tipo === 'campo') return `Já tem campo no Contábil (${x.para}): falta o implantador em IMPLANTAVEIS_CONTABIL.`;
  const motivo = x && x.tipo === 'consulta' ? ` (${x.motivo})` : ' (coluna fora do catálogo)';
  return `Criar no Contábil o campo para "${coluna}"${motivo} e pôr a coluna em IMPLANTAVEIS_CONTABIL (src/data/mapaBackupContabil.ts): o 007 implanta sozinho onde estiver vazio.`.slice(0, 300);
}
/** Painel do DONO ("Campos do backup sem lugar no Murad"), lido do cofre por coluna — agregado, sem CNPJ, sem nome, sem valor (só o formato). */
export function painelCofre007ContabilDoCofre(linhas: LinhaCofre007[]): LinhaPainelCofre[] {
  return painelCofre007(linhas, { temImplantador: (t, c) => temImplantadorContabil(t, c), noMapaComCampo: noMapaComCampoContabil, sugestao: sugestaoCampoContabil });
}

/** Antes do cofre por coluna: blocos do registro guardado, agregados (sem CNPJ, sem valor). Usado só enquanto o cofre está vazio. */
export async function painelCofre007Contabil(q: Q): Promise<LinhaPainelCofre[]> {
  const r = await q(`SELECT s.bloco, sum(s.quantidade)::int AS linhas, count(DISTINCT s.cnpj)::int AS empresas,
      count(DISTINCT (SELECT COALESCE(u.tenant_id, u.id)::text FROM contabil_auth_company_access a JOIN contabil_auth_users u ON u.id=a.user_id WHERE a.cnpj=s.cnpj ORDER BY (a.role='admin') DESC LIMIT 1))::int AS escritorios
    FROM ${TABELA_SISTEMA_ANTERIOR} s WHERE s.bloco NOT LIKE '\\_%' GROUP BY s.bloco ORDER BY 2 DESC LIMIT 300`).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((x: any) => {
    const cols = colunasSoConsulta(String(x.bloco));
    return { tabela: String(x.bloco), coluna: cols.length ? cols.slice(0, 6).map((c) => c.coluna).join(', ') : '(linha inteira)', registros: Number(x.linhas), empresas: Number(x.empresas), escritorios: Number(x.escritorios), formato: '',
      situacao: 'sem_lugar' as const, sugestao: 'Guardado no registro do sistema anterior (só consulta). Se tiver uso no Contábil, criar o campo e pôr em IMPLANTAVEIS_CONTABIL.', implantados: 0 };
  });
}
