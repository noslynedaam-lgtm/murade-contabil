import { useEffect, useState } from "react";
import { contagemDe, type ContagemEmpresas } from "../utils/contagemEmpresas";

// Total de empresas do escritório E a divisão no Contábil (28/11/2026) — a mesma conta da Murad (utils/contagemEmpresas).
// O App calcula uma vez (lista do escritório x marcadas "ainda não ativadas aqui") e publica; o menu da conta e o seletor leem daqui.

const EVENTO = "murad:contagem-empresas";
let atual: ContagemEmpresas | null = null;

export function publicarContagemEmpresas(c: ContagemEmpresas): void {
  if (atual && atual.total === c.total && atual.atendidas === c.atendidas && atual.naoAtivadas === c.naoAtivadas) return;
  atual = c;
  try { window.dispatchEvent(new window.CustomEvent(EVENTO, { detail: c })); } catch { /* sem eventos: quem lê pega no próximo render */ }
}

export function useContagemEmpresasContabil(): ContagemEmpresas | null {
  const [c, setC] = useState<ContagemEmpresas | null>(atual);
  useEffect(() => {
    const ouvir = (e: Event) => setC((e as CustomEvent).detail as ContagemEmpresas);
    window.addEventListener(EVENTO, ouvir);
    if (atual) setC(atual);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
  return c;
}

/** Atalho "Ver e ativar as que faltam": o bloco "Empresas do escritório ainda não ativadas aqui" abre sozinho na tela Empresa. */
export const EVENTO_ABRIR_BLOCO_NAO_ATIVADAS = "murad:abrir-bloco-nao-ativadas";
const CHAVE_ABRIR = "murad_abrir_nao_ativadas";
export function pedirAbrirBlocoNaoAtivadas(): void {
  try { sessionStorage.setItem(CHAVE_ABRIR, "1"); } catch { /* sem sessionStorage: o evento abaixo basta se a tela já estiver aberta */ }
  try { window.dispatchEvent(new window.Event(EVENTO_ABRIR_BLOCO_NAO_ATIVADAS)); } catch { /* idem */ }
}
/** O bloco consulta (e apaga) o pedido ao montar. */
export function consumirPedidoAbrirBloco(): boolean {
  try { const v = sessionStorage.getItem(CHAVE_ABRIR) === "1"; sessionStorage.removeItem(CHAVE_ABRIR); return v; } catch { return false; }
}

export const contagemVazia = contagemDe(0, 0);
