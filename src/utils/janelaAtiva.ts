// Qual janela responde ao "Murad" (igual nos sistemas Murade). Com foco: esta. Sem foco nenhuma: só a da interação MAIS recente,
// marcada num cookie do domínio pai comum aos sistemas (quando existe). Sem domínio comum, janela sem foco não responde — nunca duas.
// O cookie guarda só um código aleatório da janela e a hora; nada da pessoa.
import { COOKIE_JANELA, dominioPai, janelaEmUso, souAJanelaMaisRecente, valorCookieJanela } from '../data/agenteAgil';

const ID_JANELA = `j${Math.random().toString(36).slice(2, 10)}`;
let ultimaGravacao = 0;
function marcarInteracao(): void {
  if (typeof document === 'undefined' || typeof location === 'undefined') return;
  const agora = Date.now();
  if (agora - ultimaGravacao < 1000) return;
  ultimaGravacao = agora;
  const pai = dominioPai(location.hostname);
  if (!pai) return;
  try { document.cookie = `${COOKIE_JANELA}=${encodeURIComponent(valorCookieJanela(ID_JANELA, agora))}; domain=.${pai}; path=/; max-age=86400; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch { /* sem cookie: vale só o foco */ }
}
if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, marcarInteracao, { capture: true, passive: true }));
  window.addEventListener('focus', marcarInteracao);
}
export function estaJanelaEmUso(): boolean {
  if (typeof document === 'undefined') return false;
  return janelaEmUso({ temFoco: document.hasFocus(), visivel: document.visibilityState === 'visible', souAMaisRecente: souAJanelaMaisRecente(document.cookie, ID_JANELA) });
}
