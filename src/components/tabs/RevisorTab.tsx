// Tela "Revisor": revisão geral do mês por empresa (✅ certo / ⚠️ risco / ⛔ falta) e a lista "Corrigir", que o robô semanal enche
// com o que achou. "Corrigir para mim" só aparece no que é determinístico (lançamento PENDENTE de aprovação em mês aberto: nome da conta
// pelo plano, competência pela data, histórico sem espaços); o resto tem "Me leva lá" e "Deixar assim". Nada é aprovado nem fechado.
import React, { useCallback, useEffect, useState } from "react";
import { confirmarNaTela } from "../../utils/dialogoNaTela";
import { CampoMes } from '../CampoData';

interface Achado { regra: string; nivel: "bloqueia" | "atencao"; texto: string; tela: string; corrigivel: boolean }
interface EmpresaRevisada { cnpj: string; nome: string; regime: string; competencia: string; certo: string[]; risco: Achado[]; falta: Achado[] }
interface ItemCorrigir { id: string; cnpj: string; empresa: string; competencia: string; nivel: string; texto: string; tela: string; correcao: { explicacao: string } | null; pergunta: string | null }

const competenciaBR = (c: string) => c.replace(/(\d{4})-(\d{2})/g, "$2/$1");
const mesAnterior = () => { const d = new Date(); const a = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); const m = d.getMonth() === 0 ? 12 : d.getMonth(); return `${a}-${String(m).padStart(2, "0")}`; };
const botao = "min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50";
const botaoClaro = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-50";

async function chamar(caminho: string, metodo: "GET" | "POST" = "GET"): Promise<any> {
  try {
    const r = await fetch(`/api/revisor${caminho}`, { method: metodo, credentials: "include", cache: "no-store", headers: { Accept: "application/json", ...(metodo === "POST" ? { "Content-Type": "application/json" } : {}) }, ...(metodo === "POST" ? { body: "{}" } : {}) });
    return await r.json().catch(() => ({ sucesso: false, motivo: "Resposta inesperada do servidor." }));
  } catch { return { sucesso: false, motivo: "Sem conexão com o servidor." }; }
}

export const RevisorTab: React.FC<{ onNavegar: (tela: string, cnpj: string) => void; onDadosAtualizados: (cnpj: string, dados: Record<string, any>, versao: number | null) => void }> = ({ onNavegar, onDadosAtualizados }) => {
  const [competencia, setCompetencia] = useState(mesAnterior());
  const [empresas, setEmpresas] = useState<EmpresaRevisada[] | null>(null);
  const [itens, setItens] = useState<ItemCorrigir[]>([]);
  const [ultima, setUltima] = useState<{ em: string; resumo: string } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);

  const carregarCorrigir = useCallback(async () => {
    const r = await chamar("/corrigir");
    if (r.sucesso) { setItens(r.itens || []); setUltima(r.ultimaRodada || null); }
  }, []);
  useEffect(() => { void carregarCorrigir(); }, [carregarCorrigir]);

  const revisar = async () => {
    setOcupado("geral"); setMsg(null);
    const r = await chamar(`/geral?competencia=${encodeURIComponent(competencia)}`);
    setOcupado("");
    if (!r.sucesso) { setMsg({ erro: true, texto: r.motivo || "Não foi possível revisar agora." }); return; }
    setEmpresas(r.empresas || []);
  };
  const corrigir = async (i: ItemCorrigir) => {
    setOcupado(i.id); setMsg(null);
    const r = await chamar(`/achados/${encodeURIComponent(i.id)}/corrigir`, "POST");
    setOcupado("");
    setMsg({ erro: !r.sucesso, texto: r.sucesso ? r.mensagem : (r.motivo || "Não foi possível corrigir.") });
    if (r.sucesso && r.dados && r.cnpj) onDadosAtualizados(String(r.cnpj), r.dados, Number.isSafeInteger(Number(r.versao)) ? Number(r.versao) : null);
    void carregarCorrigir();
  };
  const deixarAssim = async (i: ItemCorrigir) => {
    if (!(await confirmarNaTela(`Deixar assim "${i.texto.slice(0, 160)}"?\n\nO Revisor não volta a avisar este item desta empresa neste mês. Nada é alterado.`))) return;
    setOcupado(i.id);
    const r = await chamar(`/achados/${encodeURIComponent(i.id)}/ignorar`, "POST");
    setOcupado("");
    setMsg({ erro: !r.sucesso, texto: r.sucesso ? "Combinado: fica assim e eu não aviso de novo." : (r.motivo || "Não foi possível.") });
    void carregarCorrigir();
  };
  const rodarAgora = async () => {
    setOcupado("rodar"); setMsg(null);
    const r = await chamar("/rodar-agora", "POST");
    setOcupado("");
    setMsg({ erro: !r.sucesso, texto: r.sucesso ? r.mensagem : (r.motivo || "Não foi possível rodar agora.") });
    if (r.sucesso) window.setTimeout(() => void carregarCorrigir(), 20_000);
  };

  const Lista = ({ titulo, lista, cor, icone, cnpj }: { titulo: string; lista: Achado[]; cor: string; icone: string; cnpj: string }) => (lista.length ? (
    <div>
      <p className="text-xs font-bold">{icone} {titulo} ({lista.length})</p>
      <ul className="mt-0.5 space-y-1">{lista.map((a) => <li key={a.regra} className={`rounded border px-2 py-1 text-xs ${cor}`}>{a.texto} <button type="button" className="ml-1 font-semibold underline" onClick={() => onNavegar(a.tela, cnpj)}>Me leva lá</button></li>)}</ul>
    </div>) : null);

  return (
    <section data-campo="revisor-tela" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xs sm:p-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">Revisor</h2>
        <p className="text-xs text-slate-600">Eu confiro o serviço antes de gravar ou fechar e reviso cada empresa no mês. Só corrijo sozinho o que tem uma resposta certa com os dados do sistema, e só em lançamento pendente de aprovação de mês aberto; o que só você sabe eu pergunto. Nunca aprovo, fecho nem transmito nada.</p>
      </div>
      {msg && <div role={msg.erro ? "alert" : "status"} className={`rounded-lg border p-2 text-xs ${msg.erro ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{msg.texto}</div>}

      <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-2.5" data-campo="revisor-corrigir">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Corrigir ({itens.length})</p>
          <button type="button" className={botaoClaro} data-campo="revisor-rodar-agora" disabled={ocupado === "rodar"} onClick={() => void rodarAgora()}>{ocupado === "rodar" ? "Começando…" : "Rodar agora"}</button>
        </div>
        <p className="text-[11px] text-slate-600">O robô do Revisor faz a revisão geral uma vez por semana e põe aqui o que achou.{ultima ? ` Última revisão: ${new Date(ultima.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. ${ultima.resumo}` : " Ainda não rodou para o seu escritório."}</p>
        {!itens.length && <p className="mt-1 text-xs text-slate-600">Nada para corrigir agora.</p>}
        <ul className="mt-1.5 space-y-1.5">
          {itens.map((i) => (
            <li key={i.id} className={`rounded-lg border p-2 text-xs ${i.nivel === "bloqueia" ? "border-rose-300 bg-rose-50 text-rose-950" : "border-amber-300 bg-white text-amber-950"}`}>
              <p><span aria-hidden>{i.nivel === "bloqueia" ? "⛔" : "⚠️"}</span> <strong>{i.empresa || i.cnpj}</strong>{i.competencia ? ` · ${competenciaBR(i.competencia)}` : ""}: {i.texto}</p>
              {i.correcao && <p className="mt-0.5 text-emerald-900">Posso corrigir: {i.correcao.explicacao}.</p>}
              {i.pergunta && <p className="mt-0.5 font-semibold">Pergunta: {i.pergunta}</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {i.correcao && <button type="button" className={botao} disabled={ocupado === i.id} onClick={() => void corrigir(i)}>{ocupado === i.id ? "Corrigindo…" : "Corrigir para mim"}</button>}
                <button type="button" className={botaoClaro} onClick={() => onNavegar(i.tela, i.cnpj)}>Me leva lá</button>
                <button type="button" className={botaoClaro} disabled={ocupado === i.id} onClick={() => void deixarAssim(i)}>Deixar assim</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 p-2.5" data-campo="revisor-geral">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-[11px] font-semibold text-slate-600">Competência da revisão
            <CampoMes data-campo="revisor-competencia" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
          <button type="button" className={botao} data-campo="revisor-revisar" disabled={ocupado === "geral" || !/^\d{4}-\d{2}$/.test(competencia)} onClick={() => void revisar()}>{ocupado === "geral" ? "Revisando…" : "Revisar todas as empresas"}</button>
        </div>
        {empresas && !empresas.length && <p className="mt-2 text-xs text-slate-600">Nenhuma empresa no seu acesso.</p>}
        {empresas && <ul className="mt-2 space-y-2">{empresas.map((e) => (
          <li key={e.cnpj} className={`rounded-lg border p-2 ${e.falta.length ? "border-rose-300" : e.risco.length ? "border-amber-300" : "border-emerald-300"}`}>
            <p className="text-sm font-bold text-slate-900">{e.nome} <span className="text-xs font-normal text-slate-600">· {e.regime} · {competenciaBR(e.competencia)}</span></p>
            <p className="text-[11px] text-slate-600">{e.falta.length ? `${e.falta.length} falta(m)` : "Nada faltando"} · {e.risco.length ? `${e.risco.length} risco(s)` : "sem risco"} · {e.certo.length} item(ns) certo(s)</p>
            <div className="mt-1 space-y-1.5">
              <Lista titulo="Falta" lista={e.falta} cor="border-rose-200 bg-rose-50 text-rose-950" icone="⛔" cnpj={e.cnpj} />
              <Lista titulo="Risco" lista={e.risco} cor="border-amber-200 bg-amber-50 text-amber-950" icone="⚠️" cnpj={e.cnpj} />
              {e.certo.length > 0 && <details><summary className="cursor-pointer text-xs font-bold text-emerald-900">✅ Certo ({e.certo.length})</summary><ul className="ml-4 list-disc text-xs text-emerald-900">{e.certo.map((c) => <li key={c}>{c}</li>)}</ul></details>}
            </div>
          </li>
        ))}</ul>}
      </div>
    </section>
  );
};
