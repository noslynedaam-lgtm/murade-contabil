import React, { useEffect, useState } from 'react';
import { estadoPasta, liberarPasta, sincronizarPasta } from './pastaBackup';

/**
 * Fica montado no sistema inteiro (não ocupa espaço quando não tem nada a dizer):
 *  - aviso ao ENTRAR "seu último backup foi há X dias" (se o escritório ligou o aviso para este usuário), uma vez por sessão;
 *  - gravação automática do backup novo na pasta do computador escolhida (Chrome/Edge), com o aviso "salvo na sua pasta";
 *  - quando o navegador pede de novo a permissão da pasta, um botão pequeno "Liberar a pasta do backup".
 * Igual nos três sistemas Murade.
 */
export function AvisosBackupEscritorio({ api, sistema, aoAbrirBackup }: { api: string; sistema: string; aoAbrirBackup?: () => void }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pedirPermissao, setPedirPermissao] = useState(false);
  const [fazendo, setFazendo] = useState(false);

  useEffect(() => {
    const chave = `murade-${sistema}-aviso-backup-visto`;
    if (sessionStorage.getItem(chave)) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`${api}/aviso?momento=entrar`, { credentials: 'include', cache: 'no-store' });
        const d = await r.json();
        sessionStorage.setItem(chave, '1');
        if (r.ok && d?.sucesso && d.mostrar) setAviso(String(d.texto || 'Faça um backup do escritório.'));
      } catch { /* sem aviso se não der para consultar */ }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [api, sistema]);

  useEffect(() => {
    let parado = false;
    const rodar = async () => {
      try {
        const est = await estadoPasta(sistema);
        if (!est.nome) { setPedirPermissao(false); return; }
        if (est.permissao !== 'granted') { setPedirPermissao(true); return; }
        setPedirPermissao(false);
        const gravados = await sincronizarPasta(api, sistema);
        if (!parado && gravados.length) { setToast(gravados.length === 1 ? `Backup salvo na sua pasta: ${gravados[0]}` : `${gravados.length} backups salvos na sua pasta.`); window.setTimeout(() => setToast(null), 8000); }
      } catch { /* tenta na próxima */ }
    };
    const t = window.setTimeout(rodar, 15000);
    const i = window.setInterval(rodar, 10 * 60_000);
    return () => { parado = true; window.clearTimeout(t); window.clearInterval(i); };
  }, [api, sistema]);

  const fazerAgora = async () => {
    setFazendo(true);
    try {
      const r = await fetch(`${api}/executar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'completo' }) });
      const d = await r.json().catch(() => ({}));
      setAviso(null);
      setToast(r.ok && d?.sucesso ? 'Backup iniciado. O resultado aparece na tela Backup.' : String(d?.motivo || 'Não foi possível iniciar o backup agora.'));
      window.setTimeout(() => setToast(null), 8000);
    } finally { setFazendo(false); }
  };

  if (!aviso && !toast && !pedirPermissao) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 right-3 z-[60] flex flex-col items-start gap-2 sm:right-auto sm:max-w-sm print:hidden">
      {aviso && (
        <div role="status" className="pointer-events-auto w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg">
          <p className="font-semibold">{aviso}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="rounded-lg bg-[#0F2B5B] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" disabled={fazendo} onClick={() => void fazerAgora()}>{fazendo ? 'Iniciando…' : 'Fazer backup agora'}</button>
            {aoAbrirBackup && <button className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => { setAviso(null); aoAbrirBackup(); }}>Abrir Backup</button>}
            <button className="rounded-lg px-3 py-1.5 text-xs font-bold text-amber-900" onClick={() => setAviso(null)}>Fechar</button>
          </div>
        </div>
      )}
      {pedirPermissao && !aviso && (
        <button className="pointer-events-auto rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow" onClick={async () => { if (await liberarPasta(sistema)) { setPedirPermissao(false); const g = await sincronizarPasta(api, sistema).catch(() => []); if (g.length) { setToast(`${g.length} backup(s) salvo(s) na sua pasta.`); window.setTimeout(() => setToast(null), 8000); } } }}>
          Liberar a pasta do backup
        </button>
      )}
      {toast && <div role="status" className="pointer-events-auto rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-lg">{toast}</div>}
    </div>
  );
}
