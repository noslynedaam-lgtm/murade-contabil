import React, { useCallback, useEffect, useRef, useState } from 'react';

// Backup COMPLETO do banco de dados para fora do Render. Só o dono do sistema vê (escritórios clientes não veem nada aqui).
// Automático (todo dia, 3h de Brasília) e manual ("Fazer backup agora") lado a lado. Lê /api/backup-banco/*.
interface Execucao { id: number; origem: string; resultado: 'ok' | 'falha' | 'andamento'; iniciadoEm: string; finalizadoEm: string | null; objeto: string | null; tamanhoBytes: number | null; tabelas: number | null; linhas: number | null; duracaoMs: number | null; erro: string | null; validadoEm: string | null; validacaoOk: boolean | null; validacaoMensagem: string | null }
interface Estado {
  nomeSistema: string; configurado: boolean; faltando: { variavel: string; para: string }[]; avisosConfiguracao: string[]; passoAPasso: string[];
  destino: { bucket: string; servidor: string; pasta: string } | null; horarioRobo: string; retencao: { diarios: number; semanais: number; mensais: number };
  emAndamento: { origem: string; desde: string } | null; conferindo: boolean; ultimaConferencia: { ok: boolean; mensagem: string; em: string } | null;
  ultimo: Execucao | null; ultimoSucesso: Execucao | null; historico: Execucao[]; horasSemBackup: number | null;
  alerta: { nivel: 'aviso' | 'critico'; texto: string } | null; erroLeitura?: string;
  backupMensalEscritorios: { estado: string; ultimaExecucao: string | null; resultado: string | null } | null;
}
interface Item { chave: string; tamanhoBytes: number; criadoEm: string }

const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const tamanho = (b: number | null | undefined) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const PainelBackupBanco: React.FC = () => {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [lista, setLista] = useState<Item[] | null>(null);
  const [erroLista, setErroLista] = useState('');
  const ativo = useRef(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/backup-banco/status', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) { if (ativo.current) setEstado(null); return; } // 401/403: não é o dono, o painel some
      const d = await r.json();
      if (ativo.current && d?.sucesso) setEstado(d);
    } catch { /* sem painel se não conseguir ler */ }
  }, []);
  useEffect(() => { ativo.current = true; void carregar(); return () => { ativo.current = false; }; }, [carregar]);
  const rapido = !!(estado?.emAndamento || estado?.conferindo);
  useEffect(() => { const t = setInterval(carregar, rapido ? 3000 : 60_000); return () => clearInterval(t); }, [carregar, rapido]);

  const carregarLista = useCallback(async () => {
    setErroLista('');
    try {
      const r = await fetch('/api/backup-banco/lista', { credentials: 'include', cache: 'no-store' }); const d = await r.json();
      if (!r.ok || !d?.sucesso) throw new Error(d?.motivo || 'Não consegui listar agora.');
      setLista(d.backups);
    } catch (e: any) { setErroLista(e?.message || 'Não consegui listar agora.'); }
  }, []);
  useEffect(() => { if (aberto && estado?.configurado && lista === null) void carregarLista(); }, [aberto, estado?.configurado, lista, carregarLista]);
  useEffect(() => { if (estado?.ultimoSucesso?.id) setLista(null); }, [estado?.ultimoSucesso?.id]);

  const chamar = async (caminho: string, corpo: unknown = {}) => {
    setOcupado(true); setAviso('');
    try {
      const r = await fetch(caminho, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const d = await r.json().catch(() => ({}));
      setAviso(d?.mensagem || d?.motivo || (r.ok ? 'Pronto.' : 'Não consegui agora. Tente de novo.'));
    } catch { setAviso('Não consegui falar com o servidor. Tente de novo.'); }
    finally { setOcupado(false); void carregar(); }
  };

  if (!estado) return null;
  const critico = estado.alerta?.nivel === 'critico';
  const selo = !estado.configurado ? { t: 'Desligado: falta configurar o destino', c: 'bg-amber-100 text-amber-900' }
    : critico ? { t: 'Atenção: backup atrasado', c: 'bg-red-100 text-red-800' }
    : estado.emAndamento ? { t: 'Fazendo backup…', c: 'bg-sky-100 text-sky-900' }
    : { t: 'Funcionando', c: 'bg-emerald-100 text-emerald-800' };
  const u = estado.ultimoSucesso;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <span className="text-sm font-bold text-slate-800">Backup completo do banco (só o dono do sistema vê)</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${selo.c}`}>{selo.t}</span>
      </button>
      <p className="mt-1 text-xs text-slate-500">Cópia cifrada de todo o banco do {estado.nomeSistema} guardada fora do Render. Se o Render deixar de existir, os dados continuam seus. Automática todos os dias às {estado.horarioRobo}; o botão faz a mesma coisa na hora.</p>
      {estado.alerta && <div role="alert" className={`mt-2 rounded-lg p-2 text-xs font-semibold ${critico ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}>{estado.alerta.texto}</div>}
      {aviso && <div role="status" className="mt-2 rounded-lg bg-sky-50 p-2 text-xs font-semibold text-sky-900">{aviso}</div>}
      {aberto && (
        <div className="mt-3 space-y-3 text-sm">
          {!estado.configurado ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <strong>Falta configurar o destino.</strong> Enquanto isso nada sai do servidor e nenhum backup é feito.
              {estado.avisosConfiguracao.map((a) => <p key={a} className="mt-1 font-semibold">{a}</p>)}
              <p className="mt-2 font-bold">O que ainda falta no Render (variáveis de ambiente):</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{estado.faltando.map((f) => <li key={f.variavel}><code className="font-bold">{f.variavel}</code>: {f.para}</li>)}</ul>
              <p className="mt-3 font-bold">Passo a passo (feito uma vez só):</p>
              <ol className="mt-1 list-decimal space-y-1.5 pl-5">{estado.passoAPasso.map((p) => <li key={p}>{p}</li>)}</ol>
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <b className="text-xs text-slate-600">Último backup concluído</b>
                  {u ? (<>
                    <p className="mt-1 font-semibold text-slate-900">{dataHora(u.finalizadoEm)} ({estado.horasSemBackup != null ? `há ${estado.horasSemBackup < 1 ? 'menos de 1' : Math.floor(estado.horasSemBackup)} h` : ''})</p>
                    <p className="text-xs text-slate-600">{tamanho(u.tamanhoBytes)} cifrados · {u.tabelas} tabelas · {u.linhas?.toLocaleString('pt-BR')} linhas · {u.origem === 'manual' ? 'feito pelo botão' : 'feito pelo robô'}</p>
                    {u.validadoEm && <p className={`text-xs font-semibold ${u.validacaoOk ? 'text-emerald-700' : 'text-red-700'}`}>Conferido em {dataHora(u.validadoEm)}: {u.validacaoOk ? 'íntegro' : 'com problema'}</p>}
                  </>) : <p className="mt-1 text-slate-600">Ainda não há backup concluído.</p>}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <b className="text-xs text-slate-600">Resultado da última tentativa</b>
                  {estado.ultimo ? <p className={`mt-1 font-semibold ${estado.ultimo.resultado === 'falha' ? 'text-red-700' : estado.ultimo.resultado === 'ok' ? 'text-emerald-700' : 'text-sky-800'}`}>{estado.ultimo.resultado === 'ok' ? 'Deu certo' : estado.ultimo.resultado === 'falha' ? 'Falhou' : 'Em andamento'} · {dataHora(estado.ultimo.iniciadoEm)}</p> : <p className="mt-1 text-slate-600">Nenhuma ainda.</p>}
                  {estado.ultimo?.erro && <p className="text-xs font-semibold text-red-700">{estado.ultimo.erro}</p>}
                  {estado.destino && <p className="mt-1 text-xs text-slate-500">Guardado em {estado.destino.servidor}, bucket {estado.destino.bucket}, pasta {estado.destino.pasta}. Guardo {estado.retencao.diarios} diários, {estado.retencao.semanais} semanais e {estado.retencao.mensais} mensais; só apago os meus backups antigos.</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-[#0F2B5B] bg-white px-3 py-2 text-xs font-bold text-[#0F2B5B] disabled:opacity-50" disabled={ocupado || !!estado.emAndamento} onClick={() => void chamar('/api/backup-banco/gerar')}>{estado.emAndamento ? 'Fazendo backup…' : 'Fazer backup agora'}</button>
                <button type="button" className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50" disabled={ocupado || estado.conferindo || !u} onClick={() => void chamar('/api/backup-banco/validar', {})}>{estado.conferindo ? 'Conferindo…' : 'Conferir o último backup'}</button>
              </div>
              <p className="text-xs text-slate-500">"Conferir" baixa o backup, decifra com a chave e confere linha por linha, sem mexer no banco do sistema.</p>
              {estado.ultimaConferencia && <div className={`rounded-lg p-2 text-xs font-semibold ${estado.ultimaConferencia.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>Conferência de {dataHora(estado.ultimaConferencia.em)}: {estado.ultimaConferencia.mensagem}</div>}
              <div>
                <b className="text-xs text-slate-600">Backups guardados no destino</b>
                {erroLista && <p className="text-xs font-semibold text-red-700">{erroLista}</p>}
                {lista && !lista.length && <p className="text-xs text-slate-500">Nenhum ainda.</p>}
                <ul className="mt-1 space-y-1">{(lista || []).slice(0, 20).map((b) => <li key={b.chave} className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 px-2 py-1 text-xs"><span>{dataHora(b.criadoEm)}</span><span className="text-slate-500">{tamanho(b.tamanhoBytes)}</span></li>)}</ul>
              </div>
            </>
          )}
          {estado.backupMensalEscritorios && <p className="text-xs text-slate-500">Backup mensal por escritório (continua como era): {estado.backupMensalEscritorios.resultado || 'sem rodada ainda'}</p>}
          <p className="text-xs text-slate-500">Para trazer tudo de volta num banco novo (por exemplo, se o Render acabar), use o comando <code>npx tsx scripts/restaurar-backup.ts</code> no seu computador; ele só restaura em banco vazio e pede confirmação.</p>
        </div>
      )}
    </section>
  );
};
