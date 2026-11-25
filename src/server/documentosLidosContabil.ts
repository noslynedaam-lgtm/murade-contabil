// Ler foto ou PDF de documento (recibo, boleto pago, nota de despesa, comprovante) e gerar o PRÉ-LANÇAMENTO para conferir.
//  - POST /api/workspaces/:cnpj/documentos/ler      → a IA transcreve; o servidor confere, sugere débito/crédito e procura duplicidade.
//                                                     Guarda só a LEITURA (para a Agente e o robô); nenhum lançamento é criado.
//  - POST /api/workspaces/:cnpj/documentos/:id/lancar → a pessoa confirmou: confere de novo e grava o lançamento PENDENTE DE APROVAÇÃO.
//  - POST /api/workspaces/:cnpj/documentos/:id/descartar → a leitura fica marcada como descartada (nada é apagado).
//  - GET  /api/workspaces/:cnpj/documentos           → leituras recentes da empresa.
//  - POST /api/documentos-lidos/conferir-agora       → "Rodar agora" do Robô Conferidor dos Documentos Lidos (só as empresas da sessão).
// Tudo por empresa (CNPJ) e com a sessão do usuário: cada escritório só vê e só grava nas empresas dele.
import crypto from "node:crypto";
import type express from "express";
import type { ContaPlano, HistoricoPadrao, LancamentoContabil, RegraConciliacao } from "../types";
import { alterarWorkspaceNoServidorContabil, ErroAlteracaoWorkspace, lerWorkspaceInternoContabil, normalizarCnpjAcesso, sessaoDaRequisicaoContabil } from "./authContabil";
import { acessoEmpresa, erroHttp, respostaAlteracao } from "./escrituracaoRotas";
import { lerMovimentosExtrato } from "./extratoBancarioStore";
import {
  conferirConfirmacaoDocumento, INSTRUCAO_LEITURA_DOCUMENTO_CONTABIL, interpretarJsonLeitura, juntarLeituras, normalizarLeituraDocumento,
  sugerirLancamentoDocumento, validarArquivosDocumento, valorLidoParaCentavos, type ArquivoDocumentoContabil, type DocumentoJaLancado, type LeituraDocumento,
  type MovimentoParaDuplicidade, type SugestaoDocumento,
} from "../utils/leituraDocumentoContabil";
import { converterCentavos, normalizarDataContabil } from "../utils/livrosContabeis";

type Consultar = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
type Mw = (req: express.Request, res: express.Response, next: express.NextFunction) => unknown;
/** Lê UM arquivo com a IA e devolve o texto (JSON) da resposta. */
export type LerComIA = (instrucao: string, arquivo: ArquivoDocumentoContabil) => Promise<string>;

export type SituacaoDocumentoLido = "lido" | "lancado" | "descartado";
export interface DocumentoLido {
  id: string; cnpj: string; hash: string; situacao: SituacaoDocumentoLido; nomeArquivo: string | null;
  leitura: LeituraDocumento; sugestao: SugestaoDocumento; lancamentoId: string | null;
  criadoPor: string | null; criadoEm: string; atualizadoEm: string;
}

let preparado: Promise<void> | null = null;
export function prepararTabelaDocumentosLidos(consultar: Consultar): Promise<void> {
  if (!preparado) {
    preparado = consultar(`
      CREATE TABLE IF NOT EXISTS contabil_documentos_lidos (
        id varchar(64) PRIMARY KEY,
        cnpj char(14) NOT NULL CHECK (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
        hash char(64) NOT NULL,
        situacao varchar(12) NOT NULL DEFAULT 'lido' CHECK (situacao IN ('lido','lancado','descartado')),
        nome_arquivo varchar(80),
        leitura jsonb NOT NULL,
        sugestao jsonb NOT NULL,
        lancamento_id text,
        criado_por text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => consultar("CREATE INDEX IF NOT EXISTS contabil_documentos_lidos_empresa_idx ON contabil_documentos_lidos (cnpj, criado_em DESC)"))
      .then(() => consultar("CREATE INDEX IF NOT EXISTS contabil_documentos_lidos_hash_idx ON contabil_documentos_lidos (cnpj, hash)"))
      .then(() => undefined).catch((e) => { preparado = null; throw e; });
  }
  return preparado;
}
export const reiniciarPreparoDocumentosParaTeste = () => { preparado = null; };

const linhaParaDocumento = (r: any): DocumentoLido => ({
  id: String(r.id), cnpj: String(r.cnpj).trim(), hash: String(r.hash).trim(), situacao: r.situacao, nomeArquivo: r.nome_arquivo ?? null,
  leitura: r.leitura, sugestao: r.sugestao, lancamentoId: r.lancamento_id ?? null, criadoPor: r.criado_por ?? null,
  criadoEm: new Date(r.criado_em).toISOString(), atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

export async function listarDocumentosLidos(consultar: Consultar, cnpj: string, limite = 50): Promise<DocumentoLido[]> {
  await prepararTabelaDocumentosLidos(consultar);
  const r = await consultar("SELECT * FROM contabil_documentos_lidos WHERE cnpj=$1 ORDER BY criado_em DESC LIMIT $2", [cnpj, Math.min(Math.max(limite, 1), 500)]);
  return r.rows.map(linhaParaDocumento);
}
async function documentoPorId(consultar: Consultar, cnpj: string, id: string): Promise<DocumentoLido | null> {
  await prepararTabelaDocumentosLidos(consultar);
  const r = await consultar("SELECT * FROM contabil_documentos_lidos WHERE cnpj=$1 AND id=$2", [cnpj, id]);
  return r.rows[0] ? linhaParaDocumento(r.rows[0]) : null;
}

const hoje = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
const contasDe = (p: Record<string, any>): ContaPlano[] => (Array.isArray(p.contas) ? p.contas : []);
const lancamentosDe = (p: Record<string, any>): LancamentoContabil[] => (Array.isArray(p.lancamentos) ? p.lancamentos : []);
const regrasDe = (p: Record<string, any>): RegraConciliacao[] => (Array.isArray(p.regrasConciliacao) ? p.regrasConciliacao : []);
const historicosDe = (p: Record<string, any>): HistoricoPadrao[] => (Array.isArray(p.historicosPadrao) ? p.historicosPadrao : []);

/** Movimentos do extrato perto da data (saídas), para achar o pagamento e a duplicidade. */
async function movimentosPerto(consultar: Consultar, cnpj: string, data: string | null): Promise<MovimentoParaDuplicidade[]> {
  if (!data) return [];
  const comps = new Set<string>();
  for (const delta of [-3, 0, 3]) { const d = new Date(Date.parse(`${data}T00:00:00Z`) + delta * 86_400_000); comps.add(d.toISOString().slice(0, 7)); }
  const lista: MovimentoParaDuplicidade[] = [];
  for (const competencia of comps) {
    const movs = await lerMovimentosExtrato(consultar, cnpj, { competencia, limite: 5000 }).catch(() => []);
    for (const m of movs) lista.push({ fitid: m.fitid, contaBanco: m.contaBanco, dataISO: m.dataISO, valorCentavos: m.valorCentavos, memo: m.memo, situacao: m.situacao, lancamentoId: m.lancamentoId });
  }
  return lista;
}
async function jaLancadosDaEmpresa(consultar: Consultar, cnpj: string): Promise<DocumentoJaLancado[]> {
  await prepararTabelaDocumentosLidos(consultar);
  const r = await consultar("SELECT id, hash, lancamento_id, criado_em FROM contabil_documentos_lidos WHERE cnpj=$1 AND situacao='lancado'", [cnpj]);
  return r.rows.map((x: any) => ({ id: String(x.id), hash: String(x.hash).trim(), lancamentoId: x.lancamento_id ?? null, criadoEm: new Date(x.criado_em).toISOString() }));
}

/** Monta a proposta (leitura conferida + sugestão + duplicidades) com o que a empresa já tem. */
export async function montarProposta(consultar: Consultar, cnpj: string, payload: Record<string, any>, leitura: LeituraDocumento, hash: string): Promise<SugestaoDocumento> {
  return sugerirLancamentoDocumento({
    leitura, contas: contasDe(payload), lancamentos: lancamentosDe(payload), regras: regrasDe(payload), historicosPadrao: historicosDe(payload),
    movimentosExtrato: await movimentosPerto(consultar, cnpj, leitura.data), jaLancados: await jaLancadosDaEmpresa(consultar, cnpj), hash,
  });
}

/** Lê cada página separadamente e junta. Sem nenhuma resposta válida, erro (a pessoa tenta outra foto ou preenche à mão). */
export async function lerDocumentoComIA(ler: LerComIA, arquivos: ArquivoDocumentoContabil[], dia = hoje()): Promise<LeituraDocumento> {
  const respostas = await Promise.allSettled(arquivos.map((a) => ler(INSTRUCAO_LEITURA_DOCUMENTO_CONTABIL, a)));
  const jsons = respostas.map((r) => (r.status === "fulfilled" ? interpretarJsonLeitura(r.value) : null)).filter((x): x is Record<string, unknown> => Boolean(x));
  if (!jsons.length) throw new ErroAlteracaoWorkspace(502, "A IA não devolveu uma leitura válida. Tente de novo com uma foto mais nítida, ou preencha à mão.");
  return normalizarLeituraDocumento(juntarLeituras(jsons), dia);
}

// ------------------------------------------------------------------ robô conferidor (só lê)
export interface AchadoDocumentoLido { cnpj: string; nivel: "aviso" | "info"; texto: string }
/**
 * Confere as leituras de UMA empresa: leitura parada (nem lançada nem descartada) há mais de 3 dias; documento lançado cujo lançamento sumiu
 * ou foi rejeitado; dois documentos lançados com o mesmo arquivo; lançamento de documento com o mesmo valor e data de outro lançamento.
 */
export function conferirDocumentosDaEmpresa(cnpj: string, docs: DocumentoLido[], lancamentos: LancamentoContabil[], agora = new Date()): AchadoDocumentoLido[] {
  const achados: AchadoDocumentoLido[] = [];
  const porId = new Map(lancamentos.map((l) => [l.id, l]));
  const parados = docs.filter((d) => d.situacao === "lido" && agora.getTime() - Date.parse(d.criadoEm) > 3 * 86_400_000);
  if (parados.length) achados.push({ cnpj, nivel: "info", texto: `${parados.length} documento(s) lido(s) há mais de 3 dias esperando conferir e gravar (Lançamentos › Ler documento).` });
  const hashes = new Map<string, number>();
  for (const d of docs.filter((x) => x.situacao === "lancado")) {
    hashes.set(d.hash, (hashes.get(d.hash) ?? 0) + 1);
    const l = d.lancamentoId ? porId.get(d.lancamentoId) : undefined;
    if (!l) { achados.push({ cnpj, nivel: "aviso", texto: `O documento "${d.leitura?.favorecido || d.nomeArquivo || d.id}" foi lançado, mas o lançamento ${d.lancamentoId || "?"} não existe mais.` }); continue; }
    if (l.statusManual === "rejeitado") { achados.push({ cnpj, nivel: "info", texto: `O lançamento do documento "${d.leitura?.favorecido || d.nomeArquivo || d.id}" foi rejeitado na aprovação; leia de novo se precisar.` }); continue; }
    const valor = converterCentavos(l.valor);
    const data = normalizarDataContabil(l.data);
    const igual = lancamentos.find((x) => x.id !== l.id && x.statusManual !== "rejeitado" && !x.estornoDe && converterCentavos(x.valor) === valor && normalizarDataContabil(x.data) === data && x.contaDebitoCodigo === l.contaDebitoCodigo && x.contaCreditoCodigo === l.contaCreditoCodigo);
    if (igual) achados.push({ cnpj, nivel: "aviso", texto: `Possível duplicidade: o lançamento do documento "${d.leitura?.favorecido || d.id}" (R$ ${(Number(valor) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em ${String(data).split("-").reverse().join("/")}) tem outro igual (${igual.id}) com as mesmas contas.` });
  }
  for (const [, n] of hashes) if (n > 1) achados.push({ cnpj, nivel: "aviso", texto: `O mesmo arquivo de documento foi lançado ${n} vezes.` });
  return achados;
}

export async function conferirDocumentosLidos(consultar: Consultar, cnpjs: string[] | null, agora = new Date()): Promise<{ empresas: number; achados: AchadoDocumentoLido[] }> {
  await prepararTabelaDocumentosLidos(consultar);
  const lista = cnpjs ?? (await consultar("SELECT DISTINCT cnpj FROM contabil_documentos_lidos")).rows.map((x: any) => String(x.cnpj).trim());
  const achados: AchadoDocumentoLido[] = []; let empresas = 0;
  for (const cnpj of lista) {
    const docs = await listarDocumentosLidos(consultar, cnpj, 500);
    if (!docs.length) continue;
    empresas += 1;
    const payload = (await lerWorkspaceInternoContabil(cnpj)) as Record<string, any> | null;
    achados.push(...conferirDocumentosDaEmpresa(cnpj, docs, payload ? lancamentosDe(payload) : [], agora));
  }
  return { empresas, achados };
}
export const resumoConferidorDocumentos = (r: { empresas: number; achados: AchadoDocumentoLido[] }): string => {
  const avisos = r.achados.filter((a) => a.nivel === "aviso");
  if (!r.empresas) return "Nenhuma empresa leu documento por foto ou PDF ainda.";
  if (!r.achados.length) return `Documentos lidos em dia: ${r.empresas} empresa(s) conferida(s), sem duplicidade nem leitura parada.`;
  return `${avisos.length ? "ATENÇÃO: " : ""}${r.achados.length} ponto(s) nos documentos lidos de ${r.empresas} empresa(s): ${r.achados.slice(0, 3).map((a) => a.texto).join(" | ")}`;
};

// ------------------------------------------------------------------ rotas
interface Deps { exigirOrigemNavegador: Mw; exigirSessaoContabil: Mw; consultar: Consultar; lerComIA: () => LerComIA | null }

export function registrarRotasDocumentosLidos(app: express.Express, deps: Deps): void {
  const { exigirOrigemNavegador: origem, exigirSessaoContabil: sessaoMw, consultar } = deps;
  const uso = new Map<string, number[]>();

  app.get("/api/workspaces/:cnpj/documentos", sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, false); if (!a) return;
    try { return res.json({ sucesso: true, documentos: await listarDocumentosLidos(consultar, a.cnpj, 50) }); }
    catch (e) { return erroHttp(res, e, "Não foi possível ler os documentos guardados."); }
  });

  app.post("/api/workspaces/:cnpj/documentos/ler", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const v = validarArquivosDocumento(req.body?.arquivos);
    if (v.ok === false) return res.status(v.status).json({ sucesso: false, motivo: v.erro });
    const ler = deps.lerComIA();
    if (!ler) return res.status(503).json({ sucesso: false, motivo: "Leitura automática indisponível (falta a chave da IA no servidor). Faça o lançamento à mão em Lançamentos." });
    const chave = a.sessao.userId; const agora = Date.now();
    const recentes = (uso.get(chave) || []).filter((t) => agora - t < 10 * 60_000);
    if (recentes.length >= 20) return res.status(429).json({ sucesso: false, motivo: "Muitas leituras em pouco tempo. Aguarde alguns minutos ou lance à mão." });
    recentes.push(agora); uso.set(chave, recentes);
    try {
      const payload = (await lerWorkspaceInternoContabil(a.cnpj)) as Record<string, any> | null;
      if (!payload || !contasDe(payload).length) return res.status(409).json({ sucesso: false, motivo: "Esta empresa ainda não tem plano de contas no Contábil." });
      const hash = crypto.createHash("sha256").update(v.arquivos.map((x) => x.dadosBase64.replace(/\s/g, "")).join("|")).digest("hex");
      const leitura = await lerDocumentoComIA(ler, v.arquivos);
      const sugestao = await montarProposta(consultar, a.cnpj, payload, leitura, hash);
      const id = `doc-${crypto.randomUUID()}`;
      await prepararTabelaDocumentosLidos(consultar);
      await consultar("INSERT INTO contabil_documentos_lidos (id, cnpj, hash, situacao, nome_arquivo, leitura, sugestao, criado_por) VALUES ($1,$2,$3,'lido',$4,$5::jsonb,$6::jsonb,$7)",
        [id, a.cnpj, hash, v.arquivos[0].nome ?? null, JSON.stringify(leitura), JSON.stringify(sugestao), a.sessao.login]);
      console.log("Leitura de documento (Contábil):", JSON.stringify({ arquivos: v.arquivos.length, emBranco: leitura.emBranco.length, bloqueios: sugestao.bloqueios.length })); // só contagens
      return res.json({ sucesso: true, id, leitura, sugestao, mensagem: sugestao.bloqueios.length ? "Leitura feita, mas este pagamento já está na contabilidade (veja o motivo)." : "Leitura feita. Confira o pré-lançamento e clique em Gravar." });
    } catch (e) { return erroHttp(res, e, "Não foi possível ler o documento agora."); }
  });

  app.post("/api/workspaces/:cnpj/documentos/:id/lancar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || "").slice(0, 64);
    try {
      const doc = await documentoPorId(consultar, a.cnpj, id);
      if (!doc) return res.status(404).json({ sucesso: false, motivo: "Leitura não encontrada." });
      if (doc.situacao === "lancado") return res.status(409).json({ sucesso: false, motivo: `Este documento já foi lançado (lançamento ${doc.lancamentoId}).` });
      if (doc.situacao === "descartado") return res.status(409).json({ sucesso: false, motivo: "Esta leitura foi descartada. Leia o documento de novo." });
      const b = req.body || {};
      const valorCentavos = Number.isSafeInteger(b.valorCentavos) ? b.valorCentavos : valorLidoParaCentavos(b.valor);
      const conf = { data: String(normalizarDataContabil(String(b.data || "")) || ""), valorCentavos, contaDebito: String(b.contaDebito || "").trim(), contaCredito: String(b.contaCredito || "").trim(), historico: String(b.historico || "").trim() };
      const payloadAtual = (await lerWorkspaceInternoContabil(a.cnpj)) as Record<string, any> | null;
      if (!payloadAtual) return res.status(409).json({ sucesso: false, motivo: "Esta empresa ainda não tem dados no Contábil." });
      const erro = conferirConfirmacaoDocumento(conf, contasDe(payloadAtual));
      if (erro) return res.status(400).json({ sucesso: false, motivo: erro });
      // Confere a duplicidade de novo, com os valores confirmados (a pessoa pode ter mudado data ou valor).
      const nova = await montarProposta(consultar, a.cnpj, payloadAtual, { ...doc.leitura, data: conf.data, valorCentavos: conf.valorCentavos }, doc.hash);
      if (nova.bloqueios.length) return res.status(409).json({ sucesso: false, motivo: nova.bloqueios.join(" "), bloqueios: nova.bloqueios });
      if (nova.parecidos.length && b.confirmarParecido !== true) return res.status(409).json({ sucesso: false, motivo: nova.parecidos.join(" "), parecidos: nova.parecidos, precisaConfirmar: true });
      const lancId = `lan-doc-${crypto.randomUUID()}`;
      const r = await alterarWorkspaceNoServidorContabil(a.cnpj, (payload, { fechadas }) => {
        const contas = contasDe(payload);
        const d = contas.find((c) => c.codigo === conf.contaDebito), c = contas.find((x) => x.codigo === conf.contaCredito);
        if (!d || !c || d.tipo !== "analitica" || c.tipo !== "analitica") throw new ErroAlteracaoWorkspace(400, "Escolha contas analíticas do plano.");
        const competencia = conf.data.slice(0, 7);
        if (fechadas.has(competencia)) throw new ErroAlteracaoWorkspace(409, `A competência ${competencia} está fechada.`);
        const novo: LancamentoContabil = {
          id: lancId, data: conf.data, contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: c.codigo, contaCreditoNome: c.descricao,
          valor: conf.valorCentavos! / 100, historico: conf.historico.slice(0, 240), origem: "Manual", documentoRef: `DOC:${id}`, competencia, statusManual: "pendente_aprovacao",
        };
        return { payload: { ...payload, lancamentos: [...lancamentosDe(payload), novo] }, resultado: { lancamentoId: lancId } };
      }, { userId: a.sessao.userId, login: a.sessao.login });
      await consultar("UPDATE contabil_documentos_lidos SET situacao='lancado', lancamento_id=$3, sugestao=$4::jsonb, atualizado_em=now() WHERE cnpj=$1 AND id=$2", [a.cnpj, id, lancId, JSON.stringify(nova)]);
      return res.json(respostaAlteracao(r, { lancamentoId: lancId, mensagem: `Pré-lançamento gravado e enviado para aprovação (Aprovar lançamentos).${nova.extratoPendente ? " O extrato tem esta saída pendente: depois de aprovado, o Robô da Conciliação casa os dois." : ""}` }));
    } catch (e) { return erroHttp(res, e, "Não foi possível gravar o pré-lançamento do documento."); }
  });

  app.post("/api/workspaces/:cnpj/documentos/:id/descartar", origem, sessaoMw, async (req, res) => {
    const a = acessoEmpresa(req, res, true); if (!a) return;
    const id = String(req.params.id || "").slice(0, 64);
    try {
      await prepararTabelaDocumentosLidos(consultar);
      const r = await consultar("UPDATE contabil_documentos_lidos SET situacao='descartado', atualizado_em=now() WHERE cnpj=$1 AND id=$2 AND situacao='lido'", [a.cnpj, id]);
      if (!r.rowCount) return res.status(404).json({ sucesso: false, motivo: "Leitura não encontrada ou já lançada." });
      return res.json({ sucesso: true, mensagem: "Leitura descartada. Nada foi lançado." });
    } catch (e) { return erroHttp(res, e, "Não foi possível descartar a leitura."); }
  });

  // "Rodar agora" do conferidor, só com as empresas da sessão. Só lê.
  app.post("/api/documentos-lidos/conferir-agora", origem, sessaoMw, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const s = sessaoDaRequisicaoContabil(req);
    if (!s) return res.status(401).json({ sucesso: false, motivo: "Entre no sistema." });
    try {
      const r = await conferirDocumentosLidos(consultar, s.cnpjs.map(normalizarCnpjAcesso));
      return res.json({ sucesso: true, ...r, resumo: resumoConferidorDocumentos(r), conferidoEm: new Date().toISOString() });
    } catch (e) { return erroHttp(res, e, "Não foi possível conferir os documentos agora."); }
  });
}
