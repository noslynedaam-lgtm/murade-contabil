import React, { useEffect, useState } from 'react';
import { estadoPasta, liberarPasta, sincronizarPasta } from './pastaBackup';

/**
 * Fica montado no sistema inteiro (não ocupa espaço quando não tem nada a dizer):
 *  - aviso ao ENTRAR "último backup há X dias" (se o escritório ligou o aviso para este usuário), uma vez por sessão;
 *  - gravação automática do backup novo na pasta do computador escolhida (Chrome/Edge), com o aviso "salvo na sua pasta";
 *  - quando o navegador pede de novo a permissão da pasta, um botão pequeno "Liberar a pasta do backup".
 * Tudo numa linha só, dentro do conteúdo (não fica preso por cima da tela) e com X para fechar — no celular nada de faixa grande.
 * Igual nos três sistemas Murade.
 */
/** Texto curto (uma linha) do aviso de entrada: "Último backup há 19 dias." */
export function textoCurtoBackup(dias: unknown, texto?: unknown): string {
  const n = Number(dias);
  if (dias === null || dias === undefined || dias === '') return String(texto || '').startsWith('Este escritório ainda não tem') ? 'Ainda não há nenhum backup do escritório.' : 'Faça um backup do escritório.';
  if (!Number.isFinite(n)) return 'Faça um backup do escritório.';
  return n <= 0 ? 'Último backup hoje.' : `Último backup há ${n} dia${n === 1 ? '' : 's'}.`;
}

export function AvisosBackupEscritorio({ api, sistema, aoAbrirBackup }: { api: string; sistema: string; aoAbrirBackup?: () => void }) {
  const [textoCompleto, setTextoCompleto] = useState('');
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
        if (r.ok && d?.sucesso && d.mostrar) { setAviso(textoCurtoBackup(d.dias, d.texto)); setTextoCompleto(String(d.texto || '')); }
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
  const linha = 'flex min-h-8 items-center gap-2 border-b px-2 py-1 text-xs print:hidden';
  const fechar = (aoFechar: () => void, rotulo: string) => (
    <button type="button" onClick={aoFechar} aria-label={rotulo} title={rotulo} className="ml-auto shrink-0 rounded px-1.5 text-base leading-none opacity-70 hover:bg-black/5 hover:opacity-100">×</button>
  );
  return (
    <div data-campo="aviso-backup">
      {aviso && (
        <div role="status" className={`${linha} border-amber-200 bg-amber-50 text-amber-950`} title={textoCompleto || aviso}>
          <span className="min-w-0 truncate font-semibold">💾 {aviso}</span>
          <button type="button" className="shrink-0 rounded bg-[#0F2B5B] px-2 py-0.5 font-bold text-white disabled:opacity-50" disabled={fazendo} onClick={() => void fazerAgora()}>{fazendo ? 'Iniciando…' : 'Fazer backup'}</button>
          {aoAbrirBackup && <button type="button" className="hidden shrink-0 font-bold underline sm:inline" onClick={() => { setAviso(null); aoAbrirBackup(); }}>Abrir Backup</button>}
          {fechar(() => setAviso(null), 'Fechar o aviso do backup')}
        </div>
      )}
      {pedirPermissao && !aviso && (
        <div className={`${linha} border-slate-200 bg-white text-slate-700`}>
          <button type="button" className="min-w-0 truncate font-bold underline" onClick={async () => { if (await liberarPasta(sistema)) { setPedirPermissao(false); const g = await sincronizarPasta(api, sistema).catch(() => []); if (g.length) { setToast(`${g.length} backup(s) salvo(s) na sua pasta.`); window.setTimeout(() => setToast(null), 8000); } } }}>
            Liberar a pasta do backup
          </button>
          {fechar(() => setPedirPermissao(false), 'Fechar')}
        </div>
      )}
      {toast && (
        <div role="status" className={`${linha} border-emerald-200 bg-emerald-50 font-semibold text-emerald-900`}>
          <span className="min-w-0 truncate">{toast}</span>
          {fechar(() => setToast(null), 'Fechar')}
        </div>
      )}
    </div>
  );
}
