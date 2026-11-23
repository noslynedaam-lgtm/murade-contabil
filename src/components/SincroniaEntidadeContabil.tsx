import React, { useCallback, useEffect, useState } from "react";

// Cadastro de Empresa: marca de entidade imune/isenta entre o Fiscal, o DP e o Contábil. Mostra o que está diferente (nada é
// sobrescrito sozinho) e tem o botão "Sincronizar agora" (o mesmo trabalho do Robô de Sincronia de Entidades, só desta empresa).
interface Divergencia { cnpj: string; motivo: string; desde: string }
export interface MarcaAtualContabil { regime: string; entidadeCertificada: boolean; entidadeCertificacaoValidade: string; entidadeSincronizada: unknown }
async function chamar(caminho: string, metodo = "GET", corpo?: unknown): Promise<any> {
  try {
    const r = await fetch(caminho, { method: metodo, credentials: "include", cache: "no-store", headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
    return await r.json().catch(() => ({ sucesso: false, motivo: "Resposta inesperada do servidor." }));
  } catch { return { sucesso: false, motivo: "Sem conexão com o servidor." }; }
}

export const SincroniaEntidadeContabil: React.FC<{ cnpj: string; ehEntidade: boolean; aoAtualizar?: (m: MarcaAtualContabil) => void }> = ({ cnpj, ehEntidade, aoAtualizar }) => {
  const limpo = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [div, setDiv] = useState<Divergencia[]>([]); const [msg, setMsg] = useState("");
  const [andamento, setAndamento] = useState<{ etapa: number; texto: string } | null>(null);
  const carregar = useCallback(async () => {
    if (limpo.length !== 14) return;
    const r = await chamar(`/api/entidades/sincronia?cnpj=${encodeURIComponent(limpo)}`);
    if (r.sucesso) setDiv(r.divergencias || []);
  }, [limpo]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (limpo.length !== 14 || (!ehEntidade && !div.length)) return null;
  const sincronizar = async () => {
    setMsg(""); setAndamento({ etapa: 1, texto: "Lendo a marca no Fiscal e no DP…" });
    const r = await chamar("/api/entidades/sincronizar", "POST", { cnpj: limpo });
    setAndamento({ etapa: 2, texto: "Comparando com o Contábil (só o que está em branco é preenchido)…" }); await new Promise((ok) => setTimeout(ok, 800));
    setAndamento({ etapa: 3, texto: "Pronto." }); await new Promise((ok) => setTimeout(ok, 400)); setAndamento(null);
    setMsg(r.sucesso ? (r.mensagem || "Sincronizado.") : (r.motivo || "Não foi possível sincronizar agora."));
    if (r.sucesso) { setDiv(r.divergencias || []); if ((r.aplicadas || []).length && r.marcaAtual) aoAtualizar?.(r.marcaAtual); }
  };
  const pct = andamento ? Math.round((andamento.etapa / 3) * 100) : 0;
  return (
    <div data-campo="sincronia-entidade" className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>Marca de entidade no Fiscal e no DP</b>
        <button type="button" data-campo="sincronia-entidade-rodar" disabled={andamento !== null} onClick={sincronizar} className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">Sincronizar agora</button>
      </div>
      {andamento && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={andamento.texto}>
          <div className="h-2 w-full overflow-hidden rounded bg-slate-200"><div className="h-2 bg-blue-700 transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-slate-600">{andamento.texto}</p>
        </div>
      )}
      {div.length > 0 ? (
        <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
          {div.map((d) => <li key={d.motivo}><b>Diferente:</b> {d.motivo}. Nada foi alterado: confira qual está certo e corrija no sistema errado.</li>)}
        </ul>
      ) : <p className="text-slate-600">O robô confere de hora em hora: se o Fiscal ou o DP marcar a entidade, o Contábil recebe onde estiver em branco; o que você marcou aqui vai para os outros dois.</p>}
      {msg && <p role="status" className="font-semibold">{msg}</p>}
    </div>
  );
};
