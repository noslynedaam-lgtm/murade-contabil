// Painel "Conferência Fiscal × DP × Contábil" da empresa aberta (dentro de Revisão das origens).
// Mostra o que o Robô Conferidor das Origens achou: notas do Fiscal × Contábil por mês (quantidade e total ao centavo), o motivo de cada
// nota de fora, a folha do DP item a item e, em vermelho, nota cancelada/substituída já lançada com o estorno sugerido.
// "Rodar agora" confere esta empresa na hora, com barra de andamento. Nada aqui aprova, lança nem estorna.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { confirmarNaTela } from "../utils/dialogoNaTela";

type CV = { qtd: number; centavos: number };
type Linha = { competencia: string; tipo: string; fiscal: CV | null; copia: CV; lancadas: CV; aConferir: CV; pendentes: CV & { motivos: Record<string, number> }; semExplicacao: CV; situacao: "ok" | "aviso" | "erro"; avisos: string[] };
type Folha = { competencia: string; dp: CV; contabil: CV; situacao: "ok" | "aviso" | "erro"; aviso: string };
type Resultado = { cnpj: string; nome: string; conferidoEm: string; fiscalRespondeu: boolean; notas: Linha[]; folhas: Folha[]; correcoes: string[]; avisos: string[]; totais: { fiscal: CV | null; copia: CV; contabil: CV; pendentes: CV; semExplicacao: number }; situacao: "ok" | "aviso" | "erro" };
type Alerta = { cnpj: string; referencia: string; rotulo: string; numero: string; motivo: string; valor: number; competencia: string; contaDebito: string; contaCredito: string; estornoSugerido: { data: string; contaDebito: string; contaCredito: string; valor: number; historico: string; competenciaFechada: boolean } };
type Andamento = { executando: boolean; total: number; feitas: number; resumo: string | null };

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mes = (c: string) => c.replace(/(\d{4})-(\d{2})/, "$2/$1");
const dataBR = (d: string) => d.replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");
const MOTIVOS: Record<string, string> = {
  nao_confirmada: "sem confirmação na SEFAZ", antes_do_periodo: "anterior a 09/2026 sem confirmação", sem_dados_tributarios: "Fiscal ainda sem o XML completo",
  entrada_nao_compra: "entrada para classificar (devolução, remessa, uso)", servico_tomado: "serviço tomado para classificar", sem_mapeamento: "falta mapear a conta",
  sem_conta_servicos: "falta conta de receita de serviços", imposto_fora_do_simples: "imposto destacado fora do Simples", sem_data_ou_valor: "sem data ou valor",
  migrada: "já lançada pela migração", cancelada: "cancelada", tipo: "tipo desconhecido", outra_empresa: "outro CNPJ",
};
const cor = { ok: "border-emerald-300 bg-emerald-50 text-emerald-900", aviso: "border-amber-300 bg-amber-50 text-amber-950", erro: "border-rose-300 bg-rose-50 text-rose-950" } as const;

async function chamar(caminho: string, corpo?: unknown): Promise<any> {
  try {
    const r = await fetch(`/api/conferencia-origens${caminho}`, { method: corpo ? "POST" : "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    return await r.json().catch(() => ({ sucesso: false, motivo: "Resposta inesperada do servidor." }));
  } catch { return { sucesso: false, motivo: "Sem conexão com o servidor." }; }
}

export const ConferenciaOrigensPainel: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const timer = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    if (!cnpj) return;
    const r = await chamar(`?cnpj=${encodeURIComponent(cnpj)}`);
    if (!r.sucesso) { setMsg({ erro: true, texto: r.motivo || "Não foi possível ler a conferência." }); return; }
    setResultado((r.resultados || [])[0] ?? null); setAlertas(r.alertas || []); setAndamento(r.andamento || null);
  }, [cnpj]);
  useEffect(() => { setResultado(null); setAlertas([]); void carregar(); }, [carregar]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const acompanhar = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      const r = await chamar("/andamento");
      if (r.sucesso) setAndamento(r.andamento);
      if (!r.sucesso || !r.andamento?.executando) { if (timer.current) window.clearInterval(timer.current); timer.current = null; void carregar(); }
    }, 1500);
  };
  const rodarAgora = async () => {
    setMsg(null); setOcupado("rodar");
    const r = await chamar("/rodar-agora", { cnpj });
    setOcupado("");
    if (!r.sucesso) { setMsg({ erro: true, texto: r.motivo || "Não foi possível rodar agora." }); return; }
    setAndamento({ executando: true, total: r.total || 1, feitas: 0, resumo: null });
    acompanhar();
  };
  const resolver = async (a: Alerta) => {
    if (!(await confirmarNaTela(`Marcar como resolvido o alerta da ${a.rotulo}${a.numero ? ` nº ${a.numero}` : ""}?\n\nUse só se o estorno já foi feito. Nada é lançado aqui.`))) return;
    setOcupado(a.referencia);
    const r = await chamar("/alertas/resolver", { cnpj: a.cnpj, referencia: a.referencia });
    setOcupado("");
    setMsg({ erro: !r.sucesso, texto: r.sucesso ? "Alerta marcado como resolvido." : (r.motivo || "Não foi possível.") });
    void carregar();
  };
  const completarPlano = async () => {
    if (!(await confirmarNaTela("Completar o plano de contas desta empresa com o plano padrão?\n\nSó acrescenta as contas que faltam e cabem no plano. As contas que já existem continuam iguais."))) return;
    setOcupado("plano");
    const r = await chamar("/completar-plano", { cnpj });
    setOcupado("");
    setMsg({ erro: !r.sucesso, texto: r.sucesso ? `${r.mensagem}${(r.gruposForaDoPadrao || []).length ? ` Ficaram como estão: ${r.gruposForaDoPadrao.join(", ")}.` : ""} Recarregue a empresa para ver as contas novas.` : (r.motivo || "Não foi possível.") });
  };

  const rodando = andamento?.executando === true;
  const pct = rodando && andamento && andamento.total ? Math.round((andamento.feitas / andamento.total) * 100) : 0;
  const daEmpresa = alertas.filter((a) => a.cnpj === cnpj);
  const t = resultado?.totais;

  return (
    <section data-campo="conferencia-origens" className="rounded-xl border border-slate-200 bg-white p-3 text-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">Conferência Fiscal × DP × Contábil</h2>
          <p className="text-xs text-slate-600">O robô confere de hora em hora, mês a mês e ao centavo, e corrige sozinho só o seguro.{resultado ? ` Última conferência: ${new Date(resultado.conferidoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.` : " Ainda não conferida."}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" data-campo="conferencia-origens-rodar-agora" disabled={rodando || ocupado === "rodar" || !cnpj} onClick={() => void rodarAgora()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${rodando ? "animate-spin" : ""}`} />{rodando ? "Conferindo…" : "Rodar agora"}</button>
          <button type="button" data-campo="conferencia-origens-completar-plano" disabled={ocupado === "plano" || !cnpj} onClick={() => void completarPlano()} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-50">Completar plano com o padrão</button>
        </div>
      </div>

      {rodando && (
        <div className="mt-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Andamento da conferência">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-2 rounded-full bg-blue-700 transition-all" style={{ width: `${Math.max(5, pct)}%` }} /></div>
          <p className="mt-0.5 text-[11px] text-slate-600">{andamento?.feitas ?? 0} de {andamento?.total ?? 0} empresa(s) conferida(s)…</p>
        </div>
      )}
      {msg && <div role={msg.erro ? "alert" : "status"} className={`mt-2 rounded-lg border p-2 text-xs ${msg.erro ? cor.erro : cor.ok}`}>{msg.texto}</div>}

      {daEmpresa.length > 0 && (
        <div role="alert" data-campo="conferencia-origens-alertas" className="mt-2 space-y-1.5 rounded-lg border-2 border-rose-500 bg-rose-50 p-2 text-xs text-rose-950">
          <p className="flex items-center gap-1 font-bold"><AlertTriangle className="h-4 w-4" /> {daEmpresa.length} nota(s) cancelada(s) ou substituída(s) já contabilizada(s) — faça o estorno</p>
          {daEmpresa.map((a) => (
            <div key={a.referencia} className="rounded border border-rose-300 bg-white p-1.5">
              <p><strong>{a.rotulo}{a.numero ? ` nº ${a.numero}` : ""}</strong> ({mes(a.competencia)}) — {a.motivo}, {reais(Math.round(a.valor * 100))}.</p>
              <p>Estorno sugerido: <strong>D {a.estornoSugerido.contaDebito} / C {a.estornoSugerido.contaCredito}</strong>, {reais(Math.round(a.estornoSugerido.valor * 100))}, em {dataBR(a.estornoSugerido.data)}{a.estornoSugerido.competenciaFechada ? " (o mês da nota está fechado)" : ""}. Histórico: “{a.estornoSugerido.historico}”.</p>
              <button type="button" disabled={ocupado === a.referencia} onClick={() => void resolver(a)} className="mt-1 min-h-9 rounded border border-rose-400 px-2 font-semibold disabled:opacity-50">Já estornei</button>
            </div>
          ))}
        </div>
      )}

      {resultado && t && (
        <div className={`mt-2 rounded-lg border p-2 text-xs ${cor[resultado.situacao]}`}>
          <p className="flex items-center gap-1 font-semibold">{resultado.situacao === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            Notas que valem — Fiscal: {t.fiscal ? `${t.fiscal.qtd} (${reais(t.fiscal.centavos)})` : "não respondeu"} · Contábil: {t.contabil.qtd} ({reais(t.contabil.centavos)}) · Pendentes com motivo: {t.pendentes.qtd} ({reais(t.pendentes.centavos)}){t.semExplicacao ? ` · Sem motivo: ${t.semExplicacao}` : ""}</p>
          {resultado.correcoes.length > 0 && <ul className="mt-1 list-disc pl-4">{resultado.correcoes.map((c) => <li key={c}>Corrigido: {c}</li>)}</ul>}
          {resultado.avisos.length > 0 && <ul className="mt-1 list-disc pl-4">{resultado.avisos.map((c) => <li key={c}>{c}</li>)}</ul>}
          <button type="button" data-campo="conferencia-origens-detalhe" onClick={() => setAberto((v) => !v)} className="mt-1 font-semibold underline">{aberto ? "Esconder mês a mês" : "Ver mês a mês"}</button>
        </div>
      )}

      {resultado && aberto && (
        <div className="mt-2 space-y-1.5">
          {resultado.notas.map((l) => (
            <div key={`${l.competencia}-${l.tipo}`} className={`rounded border p-1.5 text-xs ${cor[l.situacao]}`}>
              <p className="font-semibold">{mes(l.competencia)} · {l.tipo === "Saída" ? "Saídas" : "Entradas"}</p>
              <p>Fiscal {l.fiscal ? `${l.fiscal.qtd} (${reais(l.fiscal.centavos)})` : "—"} · lançadas {l.lancadas.qtd} · a conferir {l.aConferir.qtd} ({reais(l.aConferir.centavos + l.lancadas.centavos)}) · pendentes {l.pendentes.qtd} ({reais(l.pendentes.centavos)})</p>
              {Object.keys(l.pendentes.motivos).length > 0 && <p className="text-slate-700">Por quê: {Object.entries(l.pendentes.motivos).map(([m, n]) => `${n} ${MOTIVOS[m] || m}`).join("; ")}</p>}
              {l.avisos.length > 0 && <p>{l.avisos.join("; ")}</p>}
            </div>
          ))}
          {resultado.folhas.map((f) => (
            <div key={`folha-${f.competencia}`} className={`rounded border p-1.5 text-xs ${cor[f.situacao]}`}>
              <p className="font-semibold">Folha {mes(f.competencia)} — DP {reais(f.dp.centavos)} · Contábil {reais(f.contabil.centavos)}</p>
              {f.aviso && <p>{f.aviso}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
