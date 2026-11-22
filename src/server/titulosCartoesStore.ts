// Títulos a pagar e a receber (com baixas e provisões) e informações de cartões (antiga DIRF), guardados no banco do
// Contábil por empresa (CNPJ), fora do workspace (a tela regrava o workspace inteiro). Integração com a escrituração:
// a baixa e a provisão viram lançamento PENDENTE DE APROVAÇÃO no workspace (nada é aprovado sozinho).
//
// DIRF: extinta para fatos a partir de 01/01/2025 (IN RFB nº 2.181/2024); pagamentos e retenções passaram a ser informados
// na EFD-Reinf e no eSocial (Receita Federal). O que veio do sistema anterior fica guardado como "informações de cartões
// (antiga DIRF)", só para consulta e conferência.
import type { LancamentoContabil, LembreteItem } from "../types";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export const AVISO_DIRF = "A DIRF foi extinta para fatos a partir de 01/01/2025 (IN RFB nº 2.181/2024): pagamentos e retenções passaram a ser informados na EFD-Reinf e no eSocial. Estas são as informações de cartões que vieram do sistema anterior (antiga DIRF), para consulta e conferência.";

export interface BaixaTitulo {
  id: string;
  data: string;              // AAAA-MM-DD
  valorCentavos: number;
  documento?: string;
  historico?: string;
  contaDisponibilidade?: string;
  /** Lançamento gerado no Murade (pendente de aprovação). */
  lancamentoId?: string;
  /** Baixa que já estava contabilizada no sistema anterior (lançamentos migrados). */
  lancamentosSistemaAnterior?: string[];
  tipo?: string;
  situacao?: string;
  origem: "murade" | "sistema_anterior";
  origemId?: string;
  registradoPor?: string;
}
export interface ProvisaoTitulo { documento?: string; lancamentoId?: string; lancamentosSistemaAnterior?: string[]; origem: "murade" | "sistema_anterior"; origemId?: string }
export interface Titulo {
  id: string;
  tipo: "pagar" | "receber";
  numero: string;
  serie?: string;
  modelo?: string;
  participanteDocumento?: string;
  participanteNome: string;
  dataEmissao: string;        // AAAA-MM-DD (data contábil)
  vencimento?: string;        // AAAA-MM-DD
  valorCentavos: number;
  historico?: string;
  /** Conta do fornecedor/cliente e conta da despesa/receita (para a provisão e a baixa). */
  contaTitulo?: string;
  contaContrapartida?: string;
  situacaoOrigem?: string;
  baixas: BaixaTitulo[];
  provisoes: ProvisaoTitulo[];
  origem: "murade" | "sistema_anterior";
  origemId?: string;
  criadoEm?: string;
  criadoPor?: string;
}
export interface MovimentoCartao { referencia: string; beneficiarioDocumento?: string; beneficiarioNome?: string; rendimentoCentavos: number; irCentavos: number; importadoEm?: string }
export interface EstabelecimentoCartao {
  id: string;
  operadora: string;
  operadoraCodigo?: string;
  codigoEstabelecimento: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  inativo?: boolean;
  dataInatividade?: string;
  movimentos: MovimentoCartao[];
  origem: "murade" | "sistema_anterior";
  origemId?: string;
}

export class ErroTitulos extends Error { constructor(public status: number, m: string) { super(m); this.name = "ErroTitulos"; } }

let preparado: Promise<void> | null = null;
export function prepararTabelasTitulosCartoes(consultar: Consultar): Promise<void> {
  if (!preparado) {
    preparado = consultar(`CREATE TABLE IF NOT EXISTS contabil_titulos (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), id varchar(80) NOT NULL, dados jsonb NOT NULL,
        origem varchar(20) NOT NULL DEFAULT 'murade', atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, id))`)
      .then(() => consultar(`CREATE TABLE IF NOT EXISTS contabil_cartoes (
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), id varchar(80) NOT NULL, dados jsonb NOT NULL,
        origem varchar(20) NOT NULL DEFAULT 'murade', atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, id))`))
      .then(() => undefined).catch((e) => { preparado = null; throw e; });
  }
  return preparado;
}
export const reiniciarPreparoTitulosParaTeste = () => { preparado = null; };

// ------------------------------------------------------------------------------------------------ regras (puras)
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const totalBaixado = (t: Titulo) => t.baixas.reduce((s, b) => s + b.valorCentavos, 0);
export type SituacaoTitulo = "aberto" | "parcial" | "baixado" | "vencido";
export function situacaoTitulo(t: Titulo, hoje: string): SituacaoTitulo {
  const pago = totalBaixado(t);
  if (pago >= t.valorCentavos) return "baixado";
  if (t.vencimento && t.vencimento < hoje) return "vencido";
  return pago > 0 ? "parcial" : "aberto";
}

export function validarTitulo(x: any): Titulo {
  const erros: string[] = [];
  const t: Titulo = {
    id: String(x?.id || "").slice(0, 80), tipo: x?.tipo === "receber" ? "receber" : "pagar", numero: String(x?.numero ?? "").trim().slice(0, 60),
    serie: x?.serie ? String(x.serie).slice(0, 20) : undefined, modelo: x?.modelo ? String(x.modelo).slice(0, 10) : undefined,
    participanteDocumento: x?.participanteDocumento ? String(x.participanteDocumento).trim().slice(0, 20) : undefined,
    participanteNome: String(x?.participanteNome ?? "").trim().slice(0, 150), dataEmissao: String(x?.dataEmissao || ""),
    vencimento: x?.vencimento ? String(x.vencimento) : undefined, valorCentavos: Number(x?.valorCentavos),
    historico: x?.historico ? String(x.historico).slice(0, 240) : undefined, contaTitulo: x?.contaTitulo ? String(x.contaTitulo).slice(0, 64) : undefined,
    contaContrapartida: x?.contaContrapartida ? String(x.contaContrapartida).slice(0, 64) : undefined, situacaoOrigem: x?.situacaoOrigem ? String(x.situacaoOrigem).slice(0, 10) : undefined,
    baixas: Array.isArray(x?.baixas) ? x.baixas : [], provisoes: Array.isArray(x?.provisoes) ? x.provisoes : [],
    origem: x?.origem === "sistema_anterior" ? "sistema_anterior" : "murade", origemId: x?.origemId ? String(x.origemId).slice(0, 80) : undefined,
    criadoEm: x?.criadoEm, criadoPor: x?.criadoPor,
  };
  if (!t.id) erros.push("identificação do título");
  if (!x?.tipo || !["pagar", "receber"].includes(x.tipo)) erros.push("tipo (a pagar ou a receber)");
  if (!t.participanteNome) erros.push("fornecedor ou cliente");
  if (!DATA.test(t.dataEmissao)) erros.push("data (AAAA-MM-DD)");
  if (t.vencimento && !DATA.test(t.vencimento)) erros.push("vencimento (AAAA-MM-DD)");
  if (!Number.isSafeInteger(t.valorCentavos) || t.valorCentavos <= 0) erros.push("valor maior que zero");
  for (const b of t.baixas) if (!DATA.test(String(b?.data)) || !Number.isSafeInteger(b?.valorCentavos) || b.valorCentavos <= 0) { erros.push("baixa com data ou valor inválido"); break; }
  if (erros.length) throw new ErroTitulos(422, `Confira: ${erros.join(", ")}.`);
  for (const k of Object.keys(t) as Array<keyof Titulo>) if (t[k] === undefined) delete t[k];
  return t;
}

const nomeConta = (payload: Record<string, any>, c: string) => (Array.isArray(payload.contas) ? payload.contas : []).find((x: any) => x.codigo === c);
function exigirAnalitica(payload: Record<string, any>, c: string | undefined, rotulo: string): any {
  const conta = c ? nomeConta(payload, c) : undefined;
  if (!conta || conta.tipo !== "analitica") throw new ErroTitulos(422, `Escolha a ${rotulo} (conta analítica do plano).`);
  return conta;
}

/** Lançamento da baixa (pagar: D fornecedor / C caixa-banco; receber: D caixa-banco / C cliente), pendente de aprovação. */
export function lancamentoDaBaixa(payload: Record<string, any>, t: Titulo, b: BaixaTitulo): LancamentoContabil {
  const conta = exigirAnalitica(payload, t.contaTitulo, `conta do ${t.tipo === "pagar" ? "fornecedor" : "cliente"} no título`);
  const disp = exigirAnalitica(payload, b.contaDisponibilidade, "conta do caixa ou banco da baixa");
  if (conta.codigo === disp.codigo) throw new ErroTitulos(422, "A conta do título e a do caixa/banco precisam ser diferentes.");
  const [d, c] = t.tipo === "pagar" ? [conta, disp] : [disp, conta];
  return {
    id: `TIT-BX-${t.id}-${b.id}`.slice(0, 64), data: b.data, competencia: b.data.slice(0, 7), contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: c.codigo, contaCreditoNome: c.descricao,
    valor: b.valorCentavos / 100, historico: (b.historico || `${t.tipo === "pagar" ? "Pagamento" : "Recebimento"} do título ${t.numero}${t.serie ? `/${t.serie}` : ""} — ${t.participanteNome}`).slice(0, 240),
    origem: "Manual", documentoRef: `TITULO:${t.id}:BAIXA:${b.id}`.slice(0, 160), statusManual: "pendente_aprovacao",
  };
}
/** Lançamento da provisão (pagar: D despesa/estoque / C fornecedor; receber: D cliente / C receita), pendente de aprovação. */
export function lancamentoDaProvisao(payload: Record<string, any>, t: Titulo): LancamentoContabil {
  const conta = exigirAnalitica(payload, t.contaTitulo, `conta do ${t.tipo === "pagar" ? "fornecedor" : "cliente"} no título`);
  const cp = exigirAnalitica(payload, t.contaContrapartida, `conta da ${t.tipo === "pagar" ? "despesa ou estoque" : "receita"} no título`);
  if (conta.codigo === cp.codigo) throw new ErroTitulos(422, "As duas contas do título precisam ser diferentes.");
  const [d, c] = t.tipo === "pagar" ? [cp, conta] : [conta, cp];
  return {
    id: `TIT-PRV-${t.id}`.slice(0, 64), data: t.dataEmissao, competencia: t.dataEmissao.slice(0, 7), contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: c.codigo, contaCreditoNome: c.descricao,
    valor: t.valorCentavos / 100, historico: (t.historico || `${t.tipo === "pagar" ? "Compra/despesa" : "Venda/receita"} conforme título ${t.numero}${t.serie ? `/${t.serie}` : ""} — ${t.participanteNome}`).slice(0, 240),
    origem: "Manual", documentoRef: `TITULO:${t.id}:PROVISAO`.slice(0, 160), statusManual: "pendente_aprovacao",
  };
}
export const temProvisao = (t: Titulo) => t.provisoes.length > 0;

/** Lembrete de vencimento do título (para a Agenda), com id estável. */
export function lembreteDoTitulo(t: Titulo, hoje: string): LembreteItem | null {
  if (!t.vencimento || situacaoTitulo(t, hoje) === "baixado") return null;
  const dias = Math.round((Date.parse(`${t.vencimento}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  const tipo: LembreteItem["tipo"] = dias < 0 ? "vencido" : dias === 0 ? "hoje" : dias <= 7 ? "proximo" : "futuro";
  const restante = t.valorCentavos - totalBaixado(t);
  return {
    id: `TITULO:${t.id}`, nome: `${t.tipo === "pagar" ? "Pagar" : "Receber"}: ${t.participanteNome} — título ${t.numero}`, data: hoje, dataVencimento: t.vencimento.split("-").reverse().join("/"),
    diaDoMes: Number(t.vencimento.slice(8, 10)), tipo, statusTexto: tipo === "vencido" ? `Vencido há ${-dias} dia(s)` : tipo === "hoje" ? "Vence hoje" : `Vence em ${dias} dia(s)`,
    origem: "Títulos", corTag: tipo === "vencido" ? "red" : tipo === "hoje" ? "amber" : "blue", acaoTexto1: "Ver", acaoTexto2: t.tipo === "pagar" ? "Baixar pagamento" : "Baixar recebimento",
    valor: restante / 100, competencia: t.vencimento.slice(0, 7),
  };
}

// ------------------------------------------------------------------------------------------------ banco
export async function listarTitulos(consultar: Consultar, cnpj: string): Promise<Titulo[]> {
  await prepararTabelasTitulosCartoes(consultar);
  const r = await consultar("SELECT dados FROM contabil_titulos WHERE cnpj=$1 ORDER BY (dados->>'dataEmissao'), id", [cnpj]);
  return r.rows.map((x) => x.dados as Titulo);
}
export async function lerTitulo(consultar: Consultar, cnpj: string, id: string): Promise<Titulo | null> {
  await prepararTabelasTitulosCartoes(consultar);
  const r = await consultar("SELECT dados FROM contabil_titulos WHERE cnpj=$1 AND id=$2", [cnpj, id]);
  return r.rows[0]?.dados ?? null;
}
export async function gravarTitulo(consultar: Consultar, cnpj: string, t: Titulo): Promise<void> {
  await prepararTabelasTitulosCartoes(consultar);
  await consultar(`INSERT INTO contabil_titulos(cnpj,id,dados,origem,atualizado_em) VALUES($1,$2,$3::jsonb,$4,now())
    ON CONFLICT (cnpj,id) DO UPDATE SET dados=EXCLUDED.dados, origem=EXCLUDED.origem, atualizado_em=now()`, [cnpj, t.id, JSON.stringify(t), t.origem]);
}
export async function excluirTitulo(consultar: Consultar, cnpj: string, id: string): Promise<number> {
  await prepararTabelasTitulosCartoes(consultar);
  return Number((await consultar("DELETE FROM contabil_titulos WHERE cnpj=$1 AND id=$2", [cnpj, id])).rowCount ?? 0);
}
export async function listarCartoes(consultar: Consultar, cnpj: string): Promise<EstabelecimentoCartao[]> {
  await prepararTabelasTitulosCartoes(consultar);
  const r = await consultar("SELECT dados FROM contabil_cartoes WHERE cnpj=$1 ORDER BY id", [cnpj]);
  return r.rows.map((x) => x.dados as EstabelecimentoCartao);
}
/** Migração: troca só o que veio do sistema anterior (o que a equipe cadastrou no Murade fica). Dentro da transação da migração. */
export async function gravarTitulosECartoesMigrados(q: Consultar, cnpj: string, titulos: Titulo[], cartoes: EstabelecimentoCartao[]): Promise<void> {
  await q(`CREATE TABLE IF NOT EXISTS contabil_titulos (cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), id varchar(80) NOT NULL, dados jsonb NOT NULL, origem varchar(20) NOT NULL DEFAULT 'murade', atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, id))`);
  await q(`CREATE TABLE IF NOT EXISTS contabil_cartoes (cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), id varchar(80) NOT NULL, dados jsonb NOT NULL, origem varchar(20) NOT NULL DEFAULT 'murade', atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (cnpj, id))`);
  // Título migrado em que a equipe já registrou baixa no Murade: fica (com o que a equipe fez); os demais são trocados.
  const atuais = (await q("SELECT id, dados FROM contabil_titulos WHERE cnpj=$1 AND origem='sistema_anterior'", [cnpj])).rows;
  const daEquipe = new Set(atuais.filter((r) => (r.dados?.baixas || []).some((b: any) => b.origem === "murade") || (r.dados?.provisoes || []).some((p: any) => p.origem === "murade")).map((r) => String(r.id)));
  await q("DELETE FROM contabil_titulos WHERE cnpj=$1 AND origem='sistema_anterior' AND NOT (id = ANY($2::text[]))", [cnpj, [...daEquipe]]);
  for (const t of titulos) if (!daEquipe.has(t.id)) await q("INSERT INTO contabil_titulos(cnpj,id,dados,origem) VALUES($1,$2,$3::jsonb,'sistema_anterior') ON CONFLICT (cnpj,id) DO NOTHING", [cnpj, t.id, JSON.stringify(t)]);
  await q("DELETE FROM contabil_cartoes WHERE cnpj=$1 AND origem='sistema_anterior'", [cnpj]);
  for (const c of cartoes) await q("INSERT INTO contabil_cartoes(cnpj,id,dados,origem) VALUES($1,$2,$3::jsonb,'sistema_anterior') ON CONFLICT (cnpj,id) DO NOTHING", [cnpj, c.id, JSON.stringify(c)]);
}
/** Para o robô: todas as empresas com títulos. */
export async function empresasComTitulos(consultar: Consultar): Promise<string[]> {
  const existe = await consultar("SELECT to_regclass('contabil_titulos') AS t", []);
  if (!existe.rows[0]?.t) return [];
  return (await consultar("SELECT DISTINCT cnpj FROM contabil_titulos ORDER BY cnpj", [])).rows.map((r) => String(r.cnpj));
}
