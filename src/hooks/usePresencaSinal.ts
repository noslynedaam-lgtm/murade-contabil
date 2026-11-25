import { useEffect, useRef } from 'react';

// Sinal de presença para o online/offline do DONO DO SISTEMA (Acesso Admin › Usuários e licenças › escritórios).
// Manda só o nome da tela atual; o servidor grava usuário, escritório, sistema, tela e horário (uma linha por usuário).
// Nada de teclas, tela, empresa ou dado digitado. Qualquer falha é silenciosa e nunca atrapalha o sistema.
const INTERVALO_VISIVEL_MS = 45_000;
const INTERVALO_OCULTA_MS = 90_000; // aba em segundo plano: menos sinais (poupa bateria do celular)
const ROTA = '/api/auth/presenca';

export function usePresencaSinal(nomeTela: string, ligado = true): void {
  const telaRef = useRef(nomeTela);
  telaRef.current = nomeTela;
  const enviarRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ligado) return;
    let ativo = true;
    let parou = false;
    let timer: number | undefined;
    const agendar = () => {
      window.clearTimeout(timer);
      if (!ativo || parou) return;
      timer = window.setTimeout(() => { void enviar(); }, document.visibilityState === 'hidden' ? INTERVALO_OCULTA_MS : INTERVALO_VISIVEL_MS);
    };
    const enviar = async () => {
      if (!ativo || parou) return;
      try {
        if (navigator.onLine !== false) {
          const r = await fetch(ROTA, { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tela: telaRef.current || undefined }) });
          if (r.status === 401 || r.status === 404) parou = true; // sessão acabou ou servidor sem esta função: para de tentar
        }
      } catch { /* sem internet: tenta de novo no próximo sinal */ }
      agendar();
    };
    enviarRef.current = () => { window.clearTimeout(timer); void enviar(); };
    const mudouAba = () => { if (document.visibilityState === 'visible') enviarRef.current?.(); };
    document.addEventListener('visibilitychange', mudouAba);
    void enviar();
    return () => { ativo = false; window.clearTimeout(timer); enviarRef.current = null; document.removeEventListener('visibilitychange', mudouAba); };
  }, [ligado]);

  // Trocou de tela: avisa logo (o servidor ignora sinais colados na mesma tela).
  useEffect(() => {
    const t = window.setTimeout(() => enviarRef.current?.(), 1500);
    return () => window.clearTimeout(t);
  }, [nomeTela]);
}
