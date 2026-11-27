// Depois do "faz certo" (igual nos sistemas Murade): quando o piloto de correção termina (a pessoa deu o OK e salvou), a tela pede ao
// servidor para conferir de novo e a Murad diz "Pronto, agora está certo." ou o que ainda falta. Só lê; nunca grava nada.
import { ehPlanoDeCorrecao } from '../data/agenteAgil';

/** CNPJ da empresa do plano: passo "empresa:<CNPJ>", botão "empresa-editar-<CNPJ>" ou seleção da empresa ativa com o CNPJ no valor. */
export function cnpjDoPlano(passos: Array<{ alvo: string; valor?: string }>): string | null {
  for (const p of passos || []) {
    const a = String(p?.alvo || '');
    const m = /^empresa:([A-Z0-9]{14})$/i.exec(a) || /empresa-editar-([A-Z0-9]{14})/i.exec(a);
    if (m) return m[1].toUpperCase();
    if (/empresa-ativa/.test(a) && /^[A-Z0-9]{14}$/i.test(String(p?.valor || ''))) return String(p.valor).toUpperCase();
  }
  return null;
}

type Buscar = (url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<any> }>;
/** Pede a conferência de novo (espera o salvamento: 2,5 s e, se ainda faltar, mais 3 s) e fala a frase. Devolve a frase falada. */
export async function reconferirAposCorrigir(plano: { titulo: string; passos: Array<{ alvo: string; valor?: string }> }, falar: (t: string) => void, op: { buscar?: Buscar; esperar?: (ms: number) => Promise<void> } = {}): Promise<string | null> {
  if (!ehPlanoDeCorrecao(plano?.titulo)) return null;
  const cnpj = cnpjDoPlano(plano.passos);
  if (!cnpj) return null;
  const buscar: Buscar = op.buscar || ((u, i) => fetch(u, i) as any);
  const esperar = op.esperar || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let frase: string | null = null;
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    await esperar(tentativa === 0 ? 2500 : 3000);
    try {
      const r = await buscar('/api/ai/agente/reconferir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj }) });
      const d = r.ok ? await r.json() : null;
      if (typeof d?.frase === 'string' && d.frase) frase = d.frase;
    } catch { /* tenta de novo */ }
    if (frase && !frase.startsWith('Ainda falta')) break;
  }
  if (frase) falar(frase);
  return frase;
}
