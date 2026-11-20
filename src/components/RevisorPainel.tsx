// REVISOR antes de gravar/fechar: o painel "Está faltando / está errado … Quer que eu corrija para você?".
//  - "Corrigir para mim": aplica só as correções determinísticas (o formulário recebe os valores) e pede para a pessoa conferir e gravar.
//  - "Eu corrijo": fecha o painel e a seta (piloto) passa por cada campo, um de cada vez.
//  - "Gravar mesmo assim": só quando nada bloqueia; o aviso fica registrado com o nome de quem gravou.
//  - Pergunta (o que só a pessoa sabe) é feita UMA vez por empresa neste aparelho.
// O Revisor nunca grava, aprova nem fecha nada sozinho: quem grava continua sendo a tela, depois do clique da pessoa.
import React, { useCallback, useState } from "react";
import { enviarAoPiloto } from "./PilotoVisivel";
import { fecharRevisao, type AchadoRevisor, type AcaoRevisada, type Revisao } from "../utils/revisorContabil";

const CHAVE_PERGUNTAS = "murade-revisor-perguntas";
const perguntasFeitas = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_PERGUNTAS) || "[]")); } catch { return new Set(); } };
const marcarPerguntas = (chaves: string[]) => { try { const s = perguntasFeitas(); for (const c of chaves) s.add(c); localStorage.setItem(CHAVE_PERGUNTAS, JSON.stringify([...s].slice(-500))); } catch { /* pergunta de novo */ } };
const chavePergunta = (acao: string, cnpj: string, regra: string) => `${acao}|${cnpj}|${regra}`;

export interface ContextoRevisor { acao: AcaoRevisada; cnpj: string; competencia?: string }
export interface Handlers { aplicar?: (correcoes: Record<string, string>) => void; salvar: () => void | Promise<unknown> }

/** Conferência no servidor (fechamento). Sem rede: usa só a revisão local (nunca deixa passar sem conferir). */
export async function conferirNoServidor(acao: AcaoRevisada, cnpj: string, dados: unknown, local: Revisao): Promise<Revisao> {
  try {
    const r = await fetch("/api/revisor/conferir", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ acao, cnpj, dados }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.sucesso && d.revisao && Array.isArray(d.revisao.achados)) return d.revisao as Revisao;
  } catch { /* segue com a revisão local */ }
  return local;
}

const prefixo = (a: AchadoRevisor) => (/^(Está |A partida não fecha|Parece repetido|Saldo credor|O movimento|A competência)/.test(a.texto) ? "" : a.tipo === "falta" ? "Está faltando: " : a.tipo === "errado" ? "Está errado: " : "Atenção: ");

/** A seta passa por cada campo apontado (piloto visível: só destaca, nunca clica). */
export function seguirCampos(achados: AchadoRevisor[], titulo = "Revisor: onde corrigir"): boolean {
  const passos = achados.filter((a) => a.alvo).map((a) => ({ tipo: "destacar" as const, alvo: a.alvo!, legenda: `${prefixo(a)}${a.texto}`.slice(0, 160) }));
  if (!passos.length) return false;
  enviarAoPiloto({ titulo, passos });
  return true;
}

export function useRevisor() {
  const [aberto, setAberto] = useState<{ revisao: Revisao; ctx: ContextoRevisor; h: Handlers } | null>(null);
  const [corrigidos, setCorrigidos] = useState<string[] | null>(null);
  const conferir = useCallback((revisao: Revisao, ctx: ContextoRevisor, h: Handlers): boolean => {
    const feitas = perguntasFeitas();
    const r = fecharRevisao(revisao.acao, revisao.achados.filter((a) => !(a.pergunta && a.nivel !== "bloqueia" && feitas.has(chavePergunta(ctx.acao, ctx.cnpj, a.regra)))));
    setCorrigidos(null);
    if (r.ok) { setAberto(null); return true; }
    setAberto({ revisao: r, ctx, h });
    return false;
  }, []);
  const fechar = useCallback(() => { setAberto(null); setCorrigidos(null); }, []);
  const painel = aberto ? <RevisorPainel revisao={aberto.revisao} ctx={aberto.ctx} h={aberto.h} corrigidos={corrigidos} onCorrigidos={setCorrigidos} onFechar={fechar} /> : null;
  return { conferir, painel, fechar };
}

export function RevisorPainel({ revisao, ctx, h, corrigidos, onCorrigidos, onFechar }: { revisao: Revisao; ctx: ContextoRevisor; h: Handlers; corrigidos: string[] | null; onCorrigidos: (l: string[]) => void; onFechar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const comCorrecao = revisao.achados.filter((a) => a.correcao);
  const verbo = revisao.acao === "fechamento" ? "fechar" : "gravar";
  const corrigirParaMim = () => {
    if (!h.aplicar || !comCorrecao.length) return;
    const mapa: Record<string, string> = {};
    for (const a of comCorrecao) mapa[a.correcao!.campo] = a.correcao!.valor;
    h.aplicar(mapa);
    onCorrigidos(comCorrecao.map((a) => a.correcao!.explicacao));
  };
  const salvarMesmoAssim = async () => {
    if (revisao.bloqueia) return;
    setOcupado(true);
    marcarPerguntas(revisao.achados.filter((a) => a.pergunta).map((a) => chavePergunta(ctx.acao, ctx.cnpj, a.regra)));
    void fetch("/api/revisor/salvo-com-aviso", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: ctx.acao, cnpj: ctx.cnpj, competencia: ctx.competencia || "", achados: revisao.achados.map((a) => ({ regra: a.regra, texto: a.texto, nivel: a.nivel })) }) }).catch(() => undefined);
    try { await h.salvar(); } finally { setOcupado(false); onFechar(); }
  };
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="revisor-titulo" data-piloto-ignorar="1" className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/40 p-2 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-amber-500 bg-white p-3 text-sm text-slate-800 shadow-2xl sm:p-4" data-campo="revisor-painel">
        <p id="revisor-titulo" className="text-base font-extrabold text-slate-900"><span aria-hidden>🔎</span> Revisor: conferi antes de {verbo}</p>
        <p className="mt-0.5 text-xs text-slate-600">{revisao.resumo}{revisao.bloqueia ? " O que tem ⛔ precisa ser corrigido antes." : ""}</p>
        <ul className="mt-2 space-y-1.5">
          {revisao.achados.map((a) => (
            <li key={a.regra} className={`rounded-lg border p-2 text-xs ${a.nivel === "bloqueia" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
              <span aria-hidden>{a.nivel === "bloqueia" ? "⛔" : "⚠️"}</span> <strong>{prefixo(a)}</strong>{a.texto}
              {a.correcao && <span className="mt-0.5 block text-emerald-900">Posso corrigir: {a.correcao.explicacao}.</span>}
              {a.pergunta && <span className="mt-0.5 block font-semibold">Pergunta: {a.pergunta}</span>}
              {a.alvo && <button type="button" className="mt-1 min-h-8 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-800" onClick={() => { onFechar(); window.setTimeout(() => seguirCampos([a]), 50); }}>Me mostra onde</button>}
            </li>
          ))}
        </ul>
        {corrigidos && <p role="status" className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-950"><strong>Corrigi:</strong> {corrigidos.join("; ")}. Confira na tela e clique de novo para {verbo}.</p>}
        {!corrigidos && comCorrecao.length > 0 && h.aplicar && <p className="mt-2 text-xs font-semibold text-slate-800">Quer que eu corrija para você?</p>}
        <div className="mt-2.5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onFechar} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Voltar</button>
          {revisao.achados.some((a) => a.alvo) && <button type="button" onClick={() => { onFechar(); window.setTimeout(() => seguirCampos(revisao.achados), 50); }} className="min-h-10 rounded-lg border border-slate-400 bg-white px-3 text-xs font-bold text-slate-900">Eu corrijo</button>}
          {!corrigidos && comCorrecao.length > 0 && h.aplicar && <button type="button" onClick={corrigirParaMim} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Corrigir para mim</button>}
          {corrigidos && <button type="button" onClick={onFechar} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Conferir na tela</button>}
          {!revisao.bloqueia && !corrigidos && <button type="button" disabled={ocupado} onClick={() => void salvarMesmoAssim()} className="min-h-10 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white disabled:opacity-50">{revisao.acao === "fechamento" ? "Fechar mesmo assim" : "Gravar mesmo assim"}</button>}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">O Revisor nunca grava, aprova nem fecha nada sozinho.{revisao.bloqueia ? "" : ' "Mesmo assim" fica registrado com o seu nome.'}</p>
      </div>
    </div>
  );
}
