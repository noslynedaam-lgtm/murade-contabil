// Bloco recolhido "Empresas do escritório ainda não ativadas aqui (N)" — tela de Empresa do Contábil (28/11/2026).
// Vieram por cópia do Fiscal e o escritório ainda não disse que faz o Contábil delas: não contam no painel nem nos avisos,
// o Robô Reconciliador não prepara pré-lançamento e nenhum robô age nelas. Com o bloco aberto, aparecem no seletor do topo.
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";

interface Disponivel { cnpj: string; razaoSocial: string; regime?: string; uf?: string }
const cnpjParaLer = (c: string) => { const d = String(c || "").replace(/[^0-9A-Z]/gi, ""); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c; };
/** Avisa o App (seletor do topo). Nunca quebra a tela se o navegador/teste não tiver CustomEvent. */
const avisarApp = (nome: string, detail?: boolean) => { try { window.dispatchEvent(detail === undefined ? new window.Event(nome) : new window.CustomEvent(nome, { detail })); } catch { /* sem eventos: o seletor fica como está */ } };
export const TEXTO_BOTAO_ATIVAR_CONTABIL = "Ativar aqui (este escritório faz o Contábil desta empresa)";

export const EmpresasNaoAtivadasContabil: React.FC = () => {
  const [lista, setLista] = useState<Disponivel[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  // Confirmação na própria tela (2º clique), sem a caixa do navegador.
  const [confirmando, setConfirmando] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const carregar = async () => {
    try { const r = await fetch("/api/empresas/atendimento/disponiveis", { credentials: "include", cache: "no-store" }); const j = await r.json().catch(() => ({})); if (r.ok && Array.isArray(j.empresas)) setLista(j.empresas); } catch { /* sem rede: o bloco some */ }
  };
  useEffect(() => { void carregar(); return () => { avisarApp("murad:exibir-disponiveis", false); }; }, []);
  if (!lista.length && !mensagem) return null;
  const alternar = () => { const novo = !aberto; setAberto(novo); avisarApp("murad:exibir-disponiveis", novo); };
  const ativar = async (e: Disponivel) => {
    setConfirmando(""); setOcupado(e.cnpj); setMensagem(null);
    try {
      const r = await fetch("/api/empresas/atendimento/ativar", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ cnpj: e.cnpj }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.sucesso !== true) throw new Error(j.motivo || "Não foi possível ativar agora.");
      setMensagem({ tipo: "ok", texto: String(j.mensagem || "Empresa ativada no Contábil.") });
      setLista((l) => l.filter((x) => x.cnpj !== e.cnpj));
      avisarApp("murad:empresas-mudaram");
    } catch (erro) { setMensagem({ tipo: "erro", texto: erro instanceof Error ? erro.message : "Não foi possível ativar agora." }); }
    finally { setOcupado(""); }
  };
  return (
    <div id="bloco-empresas-nao-ativadas" className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
      {mensagem && <div role="status" className={`text-xs rounded-lg px-3 py-2 ${mensagem.tipo === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>{mensagem.texto}</div>}
      {lista.length > 0 && (
        <button type="button" data-campo="empresas-nao-ativadas" onClick={alternar} aria-expanded={aberto} className="w-full flex items-center justify-between gap-2 text-left cursor-pointer">
          <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}Empresas do escritório ainda não ativadas aqui ({lista.length})</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">{aberto ? "Fechar" : "Abrir"}</span>
        </button>
      )}
      {aberto && lista.length > 0 && (
        <>
          <p className="text-[11px] text-slate-600 leading-snug">Vieram do Murad Fiscal e o escritório ainda não disse que faz o Contábil delas: não contam no painel nem nos avisos, e nenhum robô age nelas (as notas do Fiscal ficam guardadas). Se este escritório faz a contabilidade de alguma, clique em <b>"{TEXTO_BOTAO_ATIVAR_CONTABIL}"</b>. Fazer um lançamento nela também ativa.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {lista.map((e) => (
              <div key={e.cnpj} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
                <div className="text-xs font-bold text-slate-800 truncate" title={e.razaoSocial}>{e.razaoSocial}</div>
                <div className="text-[11px] text-slate-500 font-mono">{cnpjParaLer(e.cnpj)}{e.regime ? ` · ${e.regime}` : ""}{e.uf ? ` · ${e.uf}` : ""}</div>
                {confirmando === e.cnpj ? (
                  <div className="space-y-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-2">
                    <p className="text-[11px] text-emerald-900">Confirma? Este escritório passa a fazer a contabilidade desta empresa: ela entra na lista e no painel, o Robô Reconciliador prepara as notas já recebidas do Fiscal e os robôs passam a cuidar dela. Nada é apagado.</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => void ativar(e)} className="px-2.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold cursor-pointer">Sim, ativar no Contábil</button>
                      <button type="button" onClick={() => setConfirmando("")} className="px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" data-campo="ativar-empresa-aqui" disabled={ocupado === e.cnpj} onClick={() => setConfirmando(e.cnpj)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[11px] font-bold cursor-pointer">
                    <CheckCircle2 size={13} /> {ocupado === e.cnpj ? "Ativando…" : TEXTO_BOTAO_ATIVAR_CONTABIL}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
