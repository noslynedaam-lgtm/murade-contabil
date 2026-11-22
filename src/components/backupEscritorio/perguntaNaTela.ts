// Pergunta na própria tela (sem a caixinha do navegador, que o celular às vezes bloqueia) — igual nos três sistemas Murade.
// `perguntarDuasVezes`: para tirar algo (agendamento, nuvem do backup) — duas confirmações, a segunda com o botão em
// outro lugar, para ninguém errar no celular.

export interface Pergunta { titulo: string; texto: string; sim: string; nao?: string; perigo?: boolean; inverterBotoes?: boolean }

export function perguntar(p: Pergunta): Promise<boolean> {
  return new Promise((resolver) => {
    const fundo = document.createElement('div');
    fundo.setAttribute('role', 'dialog');
    fundo.setAttribute('aria-modal', 'true');
    fundo.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    const caixa = document.createElement('div');
    caixa.style.cssText = 'background:#fff;border-radius:14px;max-width:420px;width:100%;padding:16px;font-family:system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)';
    const t = document.createElement('div'); t.textContent = p.titulo; t.style.cssText = 'font-weight:800;font-size:15px;color:#0F2B5B;margin-bottom:6px';
    const x = document.createElement('div'); x.textContent = p.texto; x.style.cssText = 'font-size:14px;color:#334155;white-space:pre-line;line-height:1.45';
    const linha = document.createElement('div'); linha.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap';
    const nao = document.createElement('button'); nao.type = 'button'; nao.textContent = p.nao || 'Cancelar';
    nao.style.cssText = 'padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;font-weight:700;font-size:13px';
    const sim = document.createElement('button'); sim.type = 'button'; sim.textContent = p.sim;
    sim.style.cssText = `padding:10px 14px;border-radius:10px;border:0;color:#fff;font-weight:700;font-size:13px;background:${p.perigo ? '#b91c1c' : '#0F2B5B'}`;
    const fechar = (v: boolean) => { document.removeEventListener('keydown', tecla); fundo.remove(); resolver(v); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(false); };
    nao.onclick = () => fechar(false); sim.onclick = () => fechar(true);
    fundo.onclick = (e) => { if (e.target === fundo) fechar(false); };
    document.addEventListener('keydown', tecla);
    if (p.inverterBotoes) linha.append(sim, nao); else linha.append(nao, sim);
    caixa.append(t, x, linha); fundo.append(caixa); document.body.append(fundo);
    nao.focus();
  });
}

export async function perguntarDuasVezes(oQue: string, consequencia: string): Promise<boolean> {
  if (!(await perguntar({ titulo: 'Confirme', texto: `${oQue}\n\n${consequencia}`, sim: 'Continuar' }))) return false;
  return perguntar({ titulo: 'Última confirmação', texto: oQue, sim: 'Sim, tirar', perigo: true, inverterBotoes: true });
}
