// "Ativar avisos neste aparelho" — passo a passo, com o motivo exato quando não dá certo.
// Antes, qualquer falha (permissão negada, aplicativo do navegador não preparado, chave do servidor) virava uma frase miúda e a
// faixa continuava igual: a pessoa tocava de novo e nada acontecia. Agora cada etapa tem a sua explicação e o que fazer.
// O mesmo arquivo existe no Fiscal, no DP e no Contábil (cada um com o próprio endereço do servidor).

export type EtapaAvisos =
  | 'sem_suporte' | 'iphone_sem_instalar' | 'sem_sessao' | 'servidor_sem_chave' | 'chave_invalida'
  | 'permissao_negada' | 'permissao_fechada' | 'service_worker' | 'assinatura' | 'gravacao';

export interface ResultadoAtivacao { ok: boolean; etapa?: EtapaAvisos; mensagem?: string; detalhe?: string }

export interface AssinaturaLike { toJSON(): any; unsubscribe(): Promise<boolean>; options?: { applicationServerKey?: ArrayBuffer | null } }
export interface RegistroLike {
  pushManager: {
    getSubscription(): Promise<AssinaturaLike | null>;
    subscribe(o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<AssinaturaLike>;
  };
}
export interface AmbienteAvisos {
  temServiceWorker: boolean; temPush: boolean; temNotificacao: boolean;
  ios: boolean; android: boolean; samsung: boolean; instalado: boolean;
  permissaoAtual(): string;
  pedirPermissao(): Promise<string>;
  /** Registro do aplicativo do navegador (service worker): usa o que já existe ou registra /sw.js; null se não ficar pronto. */
  registro(): Promise<RegistroLike | null>;
}
export interface ApiAvisos {
  chave(): Promise<{ ativo: boolean; chave: string }>;
  assinar(assinatura: unknown): Promise<void>;
  /** Registra a falha no servidor (aparece nos logs) — nunca atrapalha a tela. */
  falha?(etapa: EtapaAvisos, detalhe: string): Promise<void> | void;
}

/** Chave pública VAPID (base64url) → bytes. Vazia ou mal formada → null. */
export function chaveParaBytes(b64: string): Uint8Array | null {
  const limpa = String(b64 || '').trim();
  if (!limpa || /[^A-Za-z0-9\-_=+/]/.test(limpa)) return null;
  try {
    const p = '='.repeat((4 - (limpa.length % 4)) % 4);
    const bin = atob((limpa + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)));
  } catch { return null; }
}
/** A chave pública do aviso é um ponto P-256 não comprimido: 65 bytes começando por 0x04. */
export const chaveValida = (b: Uint8Array | null): boolean => Boolean(b && b.length === 65 && b[0] === 4);

/** A assinatura que já existe neste aparelho foi feita com a mesma chave do servidor? (sem a informação, considera que sim) */
export function mesmaChave(sub: AssinaturaLike, chave: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  return a.length === chave.length && a.every((v, i) => v === chave[i]);
}

/** O que fazer quando o navegador bloqueou os avisos deste site, no jeito de cada aparelho. */
export function comoLiberar(amb: Pick<AmbienteAvisos, 'ios' | 'android' | 'samsung'>): string {
  if (amb.ios) return 'No iPhone: abra Ajustes › Notificações › Murad e ligue "Permitir Notificações". Depois volte aqui e toque de novo em "Ativar".';
  if (amb.samsung) return 'No Samsung Internet: toque no cadeado ao lado do endereço › Permissões › Notificações › Permitir (ou menu ≡ › Configurações › Sites e downloads › Notificações). Confira também em Configurações do celular › Aplicativos › Samsung Internet › Notificações. Depois toque de novo em "Ativar".';
  if (amb.android) return 'No Android: toque no cadeado ao lado do endereço › Permissões › Notificações › Permitir. Confira também em Configurações do celular › Aplicativos › Chrome › Notificações. Depois toque de novo em "Ativar".';
  return 'No computador: clique no cadeado ao lado do endereço › Notificações › Permitir. Depois clique de novo em "Ativar".';
}

/** Tempo máximo de cada passo (ms). Nenhum passo pode deixar o botão preso em "Ativando…" (caso do Samsung de 25/11). */
export interface TemposAvisos { servidor: number; permissao: number; preparo: number; assinatura: number }
export const TEMPOS_AVISOS: TemposAvisos = { servidor: 15_000, permissao: 45_000, preparo: 15_000, assinatura: 20_000 };

/** Erro de "passou do tempo" (para distinguir de uma recusa de verdade). */
export class TempoEsgotado extends Error { constructor(public passo: string, public ms: number) { super(`tempo esgotado em ${passo} (${Math.round(ms / 1000)} s)`); this.name = 'TempoEsgotado'; } }

/** Espera a promessa no máximo `ms`; depois disso desiste com TempoEsgotado (a promessa antiga é ignorada). */
export function comTempo<T>(promessa: Promise<T>, ms: number, passo: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TempoEsgotado(passo, ms)), ms);
    promessa.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const INSTALAR_IPHONE = 'No iPhone o aviso só funciona com o Murad instalado: abra no Safari, toque em Compartilhar › "Adicionar à Tela de Início", abra o Murad pelo ícone novo e toque de novo em "Ativar".';
const texto = (e: unknown) => String((e as any)?.name ? `${(e as any).name}: ${(e as any).message || ''}` : (e as any)?.message || e || 'erro').slice(0, 200);

export async function ativarAvisosNoAparelho(amb: AmbienteAvisos, api: ApiAvisos, tempos: TemposAvisos = TEMPOS_AVISOS): Promise<ResultadoAtivacao> {
  const falhar = (etapa: EtapaAvisos, mensagem: string, detalhe = ''): ResultadoAtivacao => {
    try { void Promise.resolve(api.falha?.(etapa, detalhe || mensagem)).catch(() => undefined); } catch { /* nunca atrapalha */ }
    return { ok: false, etapa, mensagem, ...(detalhe ? { detalhe } : {}) };
  };
  // 1) O navegador aceita aviso?
  if (!amb.temServiceWorker || !amb.temPush || !amb.temNotificacao) {
    if (amb.ios && !amb.instalado) return falhar('iphone_sem_instalar', INSTALAR_IPHONE);
    return falhar('sem_suporte', amb.ios ? INSTALAR_IPHONE : 'Este navegador não aceita avisos. Use o Chrome, o Edge ou o Samsung Internet atualizados (no iPhone, o Murad instalado na Tela de Início).');
  }
  // 2) Chave do servidor.
  let c: { ativo: boolean; chave: string };
  try { c = await comTempo(api.chave(), tempos.servidor, 'chave do servidor'); } catch (e) { return falhar('sem_sessao', 'Não consegui falar com o servidor agora (ou a sua entrada expirou). Confira a internet, entre de novo e toque em "Ativar".', texto(e)); }
  if (!c?.ativo || !c?.chave) return falhar('servidor_sem_chave', 'O servidor ainda não está pronto para mandar avisos. Já avisamos o suporte; tente mais tarde.');
  const chave = chaveParaBytes(c.chave);
  if (!chaveValida(chave)) return falhar('chave_invalida', 'A chave de aviso do servidor está errada. Já avisamos o suporte; tente mais tarde.', `tamanho ${(chave as Uint8Array | null)?.length ?? 0}`);
  // 3) Permissão do navegador (bloqueada antes não mostra pergunta: tem que liberar nas configurações).
  if (amb.permissaoAtual() === 'denied') return falhar('permissao_negada', `O navegador está bloqueando os avisos do Murad. ${comoLiberar(amb)}`);
  let p: string;
  try { p = await comTempo(amb.pedirPermissao(), tempos.permissao, 'permissão'); }
  catch (e) {
    // A pergunta do navegador não respondeu (alguns celulares não mostram a pergunta no aplicativo instalado): confere a permissão de novo.
    p = amb.permissaoAtual();
    if (p !== 'granted' && p !== 'denied') return falhar('permissao_fechada', `A pergunta "Permitir avisos?" não apareceu ou não respondeu. ${comoLiberar(amb)}`, texto(e));
  }
  if (p === 'denied') return falhar('permissao_negada', `Os avisos foram bloqueados neste aparelho. ${comoLiberar(amb)}`);
  if (p !== 'granted') return falhar('permissao_fechada', 'A pergunta do navegador fechou sem resposta. Toque de novo em "Ativar" e escolha "Permitir".');
  // 4) Aplicativo do navegador (service worker) pronto.
  let reg: RegistroLike | null = null;
  try { reg = await comTempo(amb.registro(), tempos.preparo, 'preparo do aplicativo'); } catch (e) { return falhar('service_worker', 'O Murad não conseguiu se preparar neste aparelho. Recarregue a página e toque de novo em "Ativar".', texto(e)); }
  if (!reg) return falhar('service_worker', 'O Murad não conseguiu se preparar neste aparelho. Recarregue a página e toque de novo em "Ativar".', 'registro não ficou pronto');
  // 5) Assinatura do aviso (troca a antiga feita com outra chave).
  let sub: AssinaturaLike | null = null;
  try {
    const pm = reg.pushManager; const ms = tempos.assinatura;
    sub = await comTempo(pm.getSubscription(), ms, 'assinatura existente');
    if (sub && !mesmaChave(sub, chave!)) { await comTempo(sub.unsubscribe(), ms, 'troca da assinatura').catch(() => false); sub = null; }
    if (!sub) {
      try { sub = await comTempo(pm.subscribe({ userVisibleOnly: true, applicationServerKey: chave! }), ms, 'assinatura'); }
      catch (e: any) {
        if (e instanceof TempoEsgotado) throw e;
        // Assinatura antiga presa com outra chave: desfaz e tenta uma vez de novo.
        const velha = await comTempo(pm.getSubscription(), ms, 'assinatura existente').catch(() => null);
        if (!velha) throw e;
        await comTempo(velha.unsubscribe(), ms, 'troca da assinatura').catch(() => false);
        sub = await comTempo(pm.subscribe({ userVisibleOnly: true, applicationServerKey: chave! }), ms, 'assinatura');
      }
    }
  } catch (e) {
    if (e instanceof TempoEsgotado) return falhar('assinatura', `O serviço de avisos do celular não respondeu a tempo. Confira a internet, feche e abra o Murad de novo e toque em "Ativar". Se continuar: ${comoLiberar(amb)}`, texto(e));
    return falhar('assinatura', `O navegador não aceitou ligar o aviso agora. Confira a internet e tente de novo. Se continuar: ${comoLiberar(amb)}`, texto(e));
  }
  // 6) Grava no servidor.
  try { await comTempo(api.assinar(sub!.toJSON()), tempos.servidor, 'gravação no servidor'); }
  catch (e) { return falhar('gravacao', 'O aviso foi ligado no aparelho, mas o servidor não confirmou. Toque de novo em "Ativar".', texto(e)); }
  return { ok: true };
}

/** O aparelho já está ativo? (assinatura existente + permissão dada). Não pede nada à pessoa. */
export async function aparelhoJaAtivo(amb: AmbienteAvisos): Promise<AssinaturaLike | null> {
  if (!amb.temServiceWorker || !amb.temPush || !amb.temNotificacao || amb.permissaoAtual() !== 'granted') return null;
  const reg = await comTempo(amb.registro(), TEMPOS_AVISOS.preparo, 'preparo do aplicativo').catch(() => null);
  if (!reg) return null;
  return comTempo<AssinaturaLike | null>(reg.pushManager.getSubscription(), TEMPOS_AVISOS.assinatura, 'assinatura existente').catch(() => null);
}

/** Ambiente real do navegador (a tela usa este; os testes usam um falso). */
export function ambienteDoNavegador(swUrl = '/sw.js', esperaMs = 10_000): AmbienteAvisos {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const win: any = typeof window !== 'undefined' ? window : {};
  const ua = String(nav.userAgent || '');
  const N: any = win.Notification;
  return {
    temServiceWorker: 'serviceWorker' in nav, temPush: 'PushManager' in win, temNotificacao: typeof N !== 'undefined',
    ios: /iphone|ipad|ipod/i.test(ua), android: /android/i.test(ua), samsung: /SamsungBrowser/i.test(ua),
    instalado: Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true),
    permissaoAtual: () => (N ? String(N.permission) : 'indisponivel'),
    pedirPermissao: () => new Promise<string>((resolve) => {
      // Navegadores antigos respondem por "callback"; os novos, por promessa.
      try { const r = N.requestPermission((x: string) => resolve(String(x))); if (r && typeof r.then === 'function') r.then((x: string) => resolve(String(x)), () => resolve('default')); }
      catch { resolve('default'); }
    }),
    registro: async () => {
      const sw = nav.serviceWorker;
      const espera = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), esperaMs))]);
      // O registro que vale para ESTA página (/dp/, /fiscal/ ou /): o /sw.js tem escopo "/", que cobre as pastas.
      let reg: any = await espera(sw.getRegistration(win.location?.href).catch(() => undefined));
      if (!reg) reg = await espera(sw.register(swUrl, { scope: '/' }).catch(() => null));
      if (reg?.active) return reg as RegistroLike;
      const pronto = await espera(sw.ready);
      return (pronto as RegistroLike | null) || (reg?.active ? reg : null);
    },
  };
}

/** Chamadas ao servidor do próprio sistema (base: '/api/anti-multa/push' no Fiscal e no DP, '/api/avisos-aparelho' no Contábil). */
export function apiDoSistema(base: string): ApiAvisos {
  const chamar = async (url: string, method = 'GET', corpo?: unknown) => {
    const r = await fetch(url, { method, credentials: 'include', cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.sucesso === false) throw new Error(d?.motivo || `HTTP ${r.status}`);
    return d;
  };
  return {
    chave: async () => { const d = await chamar(`${base}/chave`); return { ativo: d.ativo === true, chave: String(d.chave || '') }; },
    assinar: async (assinatura) => { await chamar(`${base}/assinar`, 'POST', { assinatura }); },
    falha: async (etapa, detalhe) => { await chamar(`${base}/falha`, 'POST', { etapa, detalhe: String(detalhe).slice(0, 200) }).catch(() => undefined); },
  };
}
