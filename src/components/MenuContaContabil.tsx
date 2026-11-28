import React, { useEffect, useState } from "react";
import { ChevronDown, LogOut, ShieldCheck, Sparkles, UserCircle, UserPlus } from "lucide-react";
import { BotoesTamanhoLetra } from "./BotoesTamanhoLetra";
import { useContabilAuth } from "./ContabilAccessGate";
import { useContagemEmpresasContabil } from "./ContagemEmpresasContabil";
import { textoContagemEmpresas } from "../utils/contagemEmpresas";

// Menu da conta, igual ao do Murad DP e do Murad Fiscal (25/11/2026): clicar no e-mail (na barra azul de cima) abre
// "Tamanho da letra A- A+", "Usuários e licenças" (só administrador, como antes), "Meu jeito", "Segurança" e "Sair".
// Substitui a faixa preta "Conta" que ficava em cima da barra azul. No celular o botão mostra só "Conta".
// O menu usa posição fixa para não ser cortado pela barra azul.
export const MenuContaContabil: React.FC<{ onAbrirMeuJeito?: () => void }> = ({ onAbrirMeuJeito }) => {
  const auth = useContabilAuth();
  // Mesma conta da tela e da Murad: total do escritório E a divisão (28/11/2026). Antes de carregar, o número da sessão.
  const contagem = useContagemEmpresasContabil();
  const textoEmpresas = contagem && contagem.total > 0 ? textoContagemEmpresas(contagem, "Contábil") : `${auth.cnpjs.length} empresa(s) autorizada(s)`;
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 48, right: 8 });
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent | KeyboardEvent | TouchEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement)?.closest?.("[data-menu-conta]")) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("touchstart", fechar);
    document.addEventListener("keydown", fechar);
    return () => { document.removeEventListener("mousedown", fechar); document.removeEventListener("touchstart", fechar); document.removeEventListener("keydown", fechar); };
  }, [aberto]);
  const item = "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 cursor-pointer";
  const fecharE = (fn?: () => void) => () => { setAberto(false); fn?.(); };
  return (
    <div className="relative" data-menu-conta>
      <button
        type="button"
        data-campo="menu-conta"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); setAberto((v) => !v); }}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex h-7 items-center gap-1 px-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-semibold text-white cursor-pointer max-w-[190px]"
        title={`Conta: ${auth.usuario} · ${textoEmpresas} — tamanho da letra, usuários, meu jeito, segurança e sair`}
      >
        <UserCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate hidden lg:inline">{auth.usuario}</span>
        <span className="lg:hidden">Conta</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {aberto && (
        <div role="menu" className="fixed z-[120] w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 text-slate-900 shadow-xl" style={{ top: pos.top, right: pos.right }}>
          <div className="mb-1 border-b border-slate-100 px-2 pb-2 text-xs text-slate-600">
            Conta: <strong className="text-slate-900 break-all">{auth.usuario}</strong><br />{textoEmpresas}
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-800" data-campo="tamanho-letra"><span>Tamanho da letra</span><BotoesTamanhoLetra escuro={false} /></div>
          {auth.administrador && <button type="button" role="menuitem" onClick={fecharE(auth.abrirUsuarios)} className={item}><UserPlus className="h-4 w-4" /> Usuários e licenças</button>}
          {onAbrirMeuJeito && <button type="button" role="menuitem" onClick={fecharE(onAbrirMeuJeito)} className={item} aria-label="Meu jeito de trabalhar"><Sparkles className="h-4 w-4" /> Meu jeito</button>}
          <button type="button" role="menuitem" onClick={fecharE(auth.abrirSeguranca)} className={item} aria-label="Segurança da conta"><ShieldCheck className="h-4 w-4" /> Segurança</button>
          <button type="button" role="menuitem" onClick={fecharE(() => void auth.sair())} className={`${item} border-t border-slate-100 font-semibold`}><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      )}
    </div>
  );
};
