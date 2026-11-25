// CURSOR ANIMADO DA AGENTE (mesmo arquivo nos sistemas Murade).
// A Agente "faz mostrando": uma setinha desliza até o botão/campo, dá o clique (com um círculo que pulsa) e o botão
// é apertado de verdade. Este arquivo só desenha a seta e aperta o elemento; QUEM decide se pode clicar é o executor do
// piloto (botão que grava, envia ou exclui passa antes pelo cartão de confirmação; consulta paga é só no clique da pessoa).

const ID = 'murade-cursor-agente';
let posicao = { x: -60, y: -60 };
const dorme = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reduzido = () => { try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; } };

function elementoCursor(): HTMLDivElement {
  let el = document.getElementById(ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement('div');
  el.id = ID;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-piloto-ui', '1');
  el.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483600;pointer-events:none;transition:transform 0.45s cubic-bezier(.4,.0,.2,1),opacity .2s;opacity:0;will-change:transform';
  el.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"><path d="M4 2 L4 20 L9 15.5 L12.5 22.5 L15.5 21 L12 14 L19 14 Z" fill="#fbbf24" stroke="#1e293b" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(el);
  return el;
}

/** O elemento está dentro da tela visível (não escondido numa gaveta fechada). */
export function naTela(alvo: Element): boolean {
  const r = alvo.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 4 && r.left < window.innerWidth - 4 && r.bottom > 4 && r.top < window.innerHeight - 4;
}

/** Leva a seta até o meio do elemento (espera a animação terminar). */
export async function moverCursorAte(alvo: Element, animar = true): Promise<void> {
  if (typeof document === 'undefined') return;
  const c = elementoCursor();
  const r = alvo.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 40));
  const y = Math.round(r.top + Math.min(r.height / 2, 18));
  const distancia = Math.hypot(x - posicao.x, y - posicao.y);
  const ms = !animar || reduzido() ? 0 : Math.max(250, Math.min(700, distancia * 0.9));
  c.style.transition = `transform ${ms}ms cubic-bezier(.4,.0,.2,1), opacity .2s`;
  c.style.opacity = '1';
  c.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
  posicao = { x, y };
  if (ms) await dorme(ms + 40);
}

function pulsar(): void {
  const p = document.createElement('div');
  p.setAttribute('aria-hidden', 'true');
  p.setAttribute('data-piloto-ui', '1');
  p.style.cssText = `position:fixed;left:${posicao.x - 18}px;top:${posicao.y - 18}px;width:36px;height:36px;border-radius:999px;border:3px solid #f59e0b;z-index:2147483599;pointer-events:none;opacity:.9;transform:scale(.4);transition:transform .45s ease-out,opacity .45s ease-out`;
  document.body.appendChild(p);
  requestAnimationFrame(() => { p.style.transform = 'scale(1.4)'; p.style.opacity = '0'; });
  setTimeout(() => p.remove(), 520);
}

/**
 * Aperta o elemento de verdade, como a pessoa apertaria: a seta vai até ele, pulsa e o clique acontece.
 * `abrirGaveta` é chamado quando o botão está numa gaveta fechada (menu do celular) para ela abrir antes.
 */
export async function clicarComCursor(alvo: HTMLElement, opcoes: { animar?: boolean; abrirGaveta?: () => void } = {}): Promise<boolean> {
  const animar = opcoes.animar !== false;
  if (!document.contains(alvo)) return false;
  if (animar && !naTela(alvo) && alvo.closest('aside, nav') && opcoes.abrirGaveta) { opcoes.abrirGaveta(); await dorme(380); }
  if (animar) {
    // Rolagem instantânea antes de medir: com a rolagem suave a seta chegava antes do botão terminar de subir.
    if (!naTela(alvo)) { try { alvo.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch { /* sem rolagem */ } }
    // Espera a rolagem (suave) parar: a seta vai até onde o botão FICOU.
    let antes = alvo.getBoundingClientRect().top;
    for (let i = 0; i < 12; i += 1) { await dorme(80); const agora = alvo.getBoundingClientRect().top; if (Math.abs(agora - antes) < 1) break; antes = agora; }
    if (naTela(alvo)) { await moverCursorAte(alvo); pulsar(); await dorme(160); }
  }
  if (!document.contains(alvo)) return false;
  try { alvo.focus?.({ preventScroll: true }); } catch { /* sem foco */ }
  alvo.click();
  return true;
}

export function esconderCursor(): void {
  const c = typeof document !== 'undefined' ? document.getElementById(ID) : null;
  if (c) c.style.opacity = '0';
}
