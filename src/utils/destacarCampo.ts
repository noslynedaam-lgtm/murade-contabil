// Depois de abrir a tela, procura o texto na página, rola até ele e pisca em amarelo.
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Depois de abrir a tela, procura o campo pelo texto do rótulo, rola até ele e pisca em amarelo.
export function destacarCampo(texto: string): void {
  const alvoTxt = semAcento(texto);
  let tentativas = 0;
  const timer = window.setInterval(() => {
    tentativas += 1;
    const candidatos = Array.from(document.querySelectorAll<HTMLElement>('label, span, p, h2, h3, h4'));
    const achou = candidatos.find((el) => el.children.length <= 2 && semAcento(el.textContent || '').includes(alvoTxt) && (el.textContent || '').length < 140);
    if (achou) {
      window.clearInterval(timer);
      const caixa = (achou.closest('label') as HTMLElement | null) || achou;
      caixa.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const antes = caixa.style.cssText;
      caixa.style.cssText += ';outline:3px solid #f59e0b;outline-offset:3px;background:#fef3c7;transition:all .3s;';
      window.setTimeout(() => { caixa.style.cssText = antes; }, 4500);
    } else if (tentativas > 25) window.clearInterval(timer);
  }, 200);
}
