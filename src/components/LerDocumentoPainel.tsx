// Lançamentos › Ler documento: foto ou PDF de recibo, boleto pago, nota de despesa ou comprovante vira PRÉ-LANÇAMENTO para conferir.
// A leitura é no servidor (a IA só transcreve; o servidor confere). O que não foi lido com segurança vem EM BRANCO.
// Nada é gravado até a pessoa clicar em "Gravar pré-lançamento", e o lançamento ainda vai para Aprovar lançamentos.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContaPlano, RotaEscrituracao } from "../types";
import { ordenarContasPorSequenciaNumerica } from "../utils/planoContasUtils";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";

type Leitura = { tipoDocumento: string | null; data: string | null; valorCentavos: number | null; favorecido: string | null; documentoFavorecido: string | null; historico: string | null; formaPagamento: string | null; numeroDocumento: string | null; avisos: string[]; emBranco: string[] };
type Sugestao = { contaDebito: { codigo: string; motivo: string } | null; contaCredito: { codigo: string; motivo: string } | null; historico: string; bloqueios: string[]; parecidos: string[]; extratoPendente: { fitid: string; contaBanco: string; dataISO: string } | null };
type Doc = { id: string; situacao: "lido" | "lancado" | "descartado"; nomeArquivo: string | null; leitura: Leitura; sugestao: Sugestao; lancamentoId: string | null; criadoEm: string };

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const centavosParaTexto = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."));
const FORMAS: Record<string, string> = { pix: "PIX", boleto: "Boleto", transferencia: "Transferência", dinheiro: "Dinheiro", cartao_debito: "Cartão de débito", cartao_credito: "Cartão de crédito", cheque: "Cheque", debito_automatico: "Débito automático" };

/** Foto grande do celular é reduzida no navegador (até 2000 px, JPEG) para caber no limite e ler mais rápido. */
async function arquivoParaEnvio(f: File): Promise<{ mimeType: string; dadosBase64: string; nome: string }> {
  const lerBase64 = (b: Blob) => new Promise<string>((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result || "").replace(/^data:[^,]*,/, "")); r.onerror = () => falha(r.error); r.readAsDataURL(b); });
  if (f.type === "application/pdf" || !f.type.startsWith("image/") || f.type === "image/heic") return { mimeType: f.type || "application/pdf", dadosBase64: await lerBase64(f), nome: f.name };
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bmp.width * escala); canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob) return { mimeType: "image/jpeg", dadosBase64: await lerBase64(blob), nome: f.name };
  } catch { /* navegador sem createImageBitmap: manda o original */ }
  return { mimeType: f.type, dadosBase64: await lerBase64(f), nome: f.name };
}

export const LerDocumentoPainel: React.FC<{ contas: ContaPlano[]; onRota: RotaEscrituracao; podeGravar: boolean }> = ({ contas, onRota, podeGravar }) => {
  const { pedir, dialogo } = useExclusaoDuasEtapas();
  const analiticas = useMemo(() => ordenarContasPorSequenciaNumerica(contas.filter((c) => c.tipo === "analitica")), [contas]);
  const nome = (codigo: string) => { const c = contas.find((x) => x.codigo === codigo); return c ? `${c.codigo} ${c.descricao}` : codigo; };
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [msg, setMsg] = useState("");
  const [atual, setAtual] = useState<{ id: string; leitura: Leitura; sugestao: Sugestao } | null>(null);
  const [form, setForm] = useState({ data: "", valor: "", contaDebito: "", contaCredito: "", historico: "" });
  const [parecidoConfirmado, setParecidoConfirmado] = useState(false);
  const [recentes, setRecentes] = useState<Doc[]>([]);
  const [conferencia, setConferencia] = useState<string>("");
  const fotoRef = useRef<HTMLInputElement>(null); const arqRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => { const r = await onRota("GET", "documentos"); if (r.ok) setRecentes(r.corpo?.documentos || []); }, [onRota]);
  useEffect(() => { if (aberto) void carregar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirProposta = (id: string, leitura: Leitura, sugestao: Sugestao) => {
    setAtual({ id, leitura, sugestao }); setParecidoConfirmado(false);
    setForm({ data: dataBr(leitura.data), valor: centavosParaTexto(leitura.valorCentavos), contaDebito: sugestao.contaDebito?.codigo || "", contaCredito: sugestao.contaCredito?.codigo || "", historico: sugestao.historico || "" });
  };
  const ler = async (lista: FileList | null) => {
    if (!lista?.length) return;
    if (lista.length > 3) { setMsg("Envie no máximo 3 páginas do mesmo documento."); return; }
    setLendo(true); setMsg("Lendo o documento…"); setAtual(null);
    try {
      const arquivos = await Promise.all([...lista].map(arquivoParaEnvio));
      const r = await onRota("POST", "documentos/ler", { arquivos });
      if (!r.ok) { setMsg(String(r.corpo?.motivo || "Não consegui ler agora. Lance à mão em Novo lançamento.")); return; }
      abrirProposta(r.corpo.id, r.corpo.leitura, r.corpo.sugestao); setMsg(String(r.corpo.mensagem || "")); void carregar();
    } catch { setMsg("Não consegui preparar o arquivo. Tente outra foto ou o PDF."); }
    finally { setLendo(false); if (fotoRef.current) fotoRef.current.value = ""; if (arqRef.current) arqRef.current.value = ""; }
  };
  const gravar = async () => {
    if (!atual) return;
    const r = await onRota("POST", `documentos/${encodeURIComponent(atual.id)}/lancar`, { ...form, confirmarParecido: parecidoConfirmado });
    if (r.ok) { setMsg(String(r.corpo?.mensagem || "Pré-lançamento gravado.")); setAtual(null); void carregar(); return; }
    if (r.corpo?.precisaConfirmar) setAtual({ ...atual, sugestao: { ...atual.sugestao, parecidos: r.corpo.parecidos || [] } });
    setMsg(String(r.corpo?.motivo || "Não gravou."));
  };
  const descartar = async (id: string) => {
    if (!await pedir({ titulo: "Descartar esta leitura?", oQue: "a leitura deste documento (nada foi lançado)", consequencias: ["A leitura fica marcada como descartada; nada é apagado nem lançado.", "Para lançar depois, leia o documento de novo."], rotuloFinal: "Sim, descartar" })) return;
    const r = await onRota("POST", `documentos/${encodeURIComponent(id)}/descartar`, {});
    setMsg(String(r.corpo?.mensagem || r.corpo?.motivo || "")); if (r.ok) { if (atual?.id === id) setAtual(null); void carregar(); }
  };
  const conferirAgora = async () => {
    setConferencia("Conferindo…");
    try {
      const r = await fetch("/api/documentos-lidos/conferir-agora", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
      const c = await r.json().catch(() => ({}));
      setConferencia(String(c.resumo || c.motivo || "Não consegui conferir agora."));
    } catch { setConferencia("Não consegui falar com o servidor agora."); }
  };
  const bloqueado = Boolean(atual?.sugestao.bloqueios.length);
  const precisaConfirmarParecido = Boolean(atual?.sugestao.parecidos.length) && !parecidoConfirmado;
  const campo = "w-full rounded-lg border border-slate-300 px-2 py-2 text-sm";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm" data-painel="ler-documento">
      {dialogo}
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between text-left" data-campo="abrir-ler-documento">
        <span className="text-sm font-bold text-slate-900">Ler documento (foto ou PDF) → pré-lançamento</span>
        <span className="text-xs font-semibold text-blue-700">{aberto ? "Fechar" : "Abrir"}</span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-xs text-slate-600">Recibo, boleto pago, nota de despesa ou comprovante. Eu leio data, valor, favorecido, histórico e forma de pagamento; o que não der para ler com segurança fica em branco para você preencher. Só grava quando você confirma, e o lançamento ainda vai para <strong>Aprovar lançamentos</strong>.</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void ler(e.target.files)} />
            <input ref={arqRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void ler(e.target.files)} />
            <button type="button" disabled={!podeGravar || lendo} onClick={() => fotoRef.current?.click()} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40" data-campo="tirar-foto-documento">Tirar foto</button>
            <button type="button" disabled={!podeGravar || lendo} onClick={() => arqRef.current?.click()} className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-40" data-campo="escolher-arquivo-documento">Escolher foto ou PDF</button>
          </div>
          {msg && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700" role="status">{msg}</p>}

          {atual && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3" data-painel="pre-lancamento-documento">
              <p className="text-xs font-bold uppercase text-amber-800">Pré-lançamento — confira antes de gravar{atual.leitura.tipoDocumento ? ` (${atual.leitura.tipoDocumento})` : ""}</p>
              {atual.sugestao.bloqueios.map((b, i) => <p key={`b${i}`} className="rounded bg-rose-100 p-2 text-xs font-semibold text-rose-800">Não dá para gravar: {b}</p>)}
              {atual.leitura.avisos.map((a, i) => <p key={`a${i}`} className="text-xs text-amber-900">• {a}</p>)}
              {atual.leitura.emBranco.length > 0 && <p className="text-xs text-amber-900">Ficou em branco para você preencher: {atual.leitura.emBranco.join(", ")}.</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold">Data do pagamento<input data-campo="doc-data" inputMode="numeric" placeholder="dd/mm/aaaa" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={campo} /></label>
                <label className="grid gap-1 text-xs font-semibold">Valor (R$)<input data-campo="doc-valor" inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={campo} /></label>
                <label className="grid gap-1 text-xs font-semibold">Débito (o que foi pago)
                  <select data-campo="doc-debito" value={form.contaDebito} onChange={(e) => setForm({ ...form, contaDebito: e.target.value })} className={campo}><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select>
                  {atual.sugestao.contaDebito && <span className="font-normal text-slate-600">Sugestão: {atual.sugestao.contaDebito.motivo}</span>}
                </label>
                <label className="grid gap-1 text-xs font-semibold">Crédito (caixa, banco ou cartão)
                  <select data-campo="doc-credito" value={form.contaCredito} onChange={(e) => setForm({ ...form, contaCredito: e.target.value })} className={campo}><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select>
                  {atual.sugestao.contaCredito && <span className="font-normal text-slate-600">Sugestão: {atual.sugestao.contaCredito.motivo}</span>}
                </label>
              </div>
              <label className="grid gap-1 text-xs font-semibold">Histórico<input data-campo="doc-historico" maxLength={240} value={form.historico} onChange={(e) => setForm({ ...form, historico: e.target.value })} className={campo} /></label>
              <p className="text-xs text-slate-600">Lido: {atual.leitura.favorecido || "favorecido em branco"}{atual.leitura.documentoFavorecido ? ` (${atual.leitura.documentoFavorecido})` : ""}{atual.leitura.formaPagamento ? ` · ${FORMAS[atual.leitura.formaPagamento] || atual.leitura.formaPagamento}` : ""}{atual.leitura.numeroDocumento ? ` · doc. ${atual.leitura.numeroDocumento}` : ""}</p>
              {atual.sugestao.extratoPendente && <p className="text-xs text-emerald-800">O extrato da conta {nome(atual.sugestao.extratoPendente.contaBanco)} tem esta saída ainda sem conciliar: depois de aprovado, o Robô da Conciliação casa os dois.</p>}
              {atual.sugestao.parecidos.length > 0 && (
                <label className="flex items-start gap-2 rounded bg-amber-100 p-2 text-xs text-amber-900"><input type="checkbox" checked={parecidoConfirmado} onChange={(e) => setParecidoConfirmado(e.target.checked)} className="mt-0.5" /><span>{atual.sugestao.parecidos.join(" ")} Marque se é outro pagamento.</span></label>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" data-campo="gravar-pre-lancamento-documento" disabled={!podeGravar || bloqueado || precisaConfirmarParecido} onClick={() => void gravar()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Gravar pré-lançamento</button>
                <button type="button" onClick={() => void descartar(atual.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Descartar leitura</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">Documentos lidos ({recentes.length})</p>
              <button type="button" onClick={() => void conferirAgora()} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700" data-campo="conferir-documentos-agora">Rodar agora (conferidor)</button>
            </div>
            {conferencia && <p className="mt-1 text-xs text-slate-700">{conferencia}</p>}
            <ul className="mt-1 divide-y divide-slate-100">
              {recentes.slice(0, 15).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{dataBr(d.leitura?.data) || "sem data"} · {d.leitura?.favorecido || d.nomeArquivo || "documento"} · {d.leitura?.valorCentavos != null ? `R$ ${centavosParaTexto(d.leitura.valorCentavos)}` : "valor em branco"}</span>
                  <span className={d.situacao === "lancado" ? "font-semibold text-emerald-700" : d.situacao === "descartado" ? "text-slate-500" : "font-semibold text-amber-700"}>{d.situacao === "lancado" ? "gravado" : d.situacao === "descartado" ? "descartado" : "a conferir"}</span>
                  {d.situacao === "lido" && <button type="button" onClick={() => abrirProposta(d.id, d.leitura, d.sugestao)} className="rounded border border-blue-300 px-2 py-0.5 font-semibold text-blue-800">Conferir</button>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
};
