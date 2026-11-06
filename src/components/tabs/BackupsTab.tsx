import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Lock, RefreshCw, ShieldHalf } from "lucide-react";

interface Backup {
  id: string;
  periodo: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  checksumSha256: string;
  tabelas: Record<string, number>;
  status: "ok" | "falha";
  verificado: boolean;
  erro: string | null;
  criadoEm: string;
}

const mesPt = (periodo: string) => {
  const [ano, mes] = periodo.split("-");
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const n = Number(mes);
  return n >= 1 && n <= 12 ? `${nomes[n - 1]} de ${ano}` : periodo;
};
const tamanho = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Tela "Backups": cada escritório só vê e baixa os próprios backups mensais (o servidor filtra por tenant_id).
 * O arquivo baixado continua cifrado — serve para guardar fora do Murade com segurança, não para abrir direto.
 * Não é tela de administrador: qualquer pessoa do escritório logado vê o backup do próprio escritório. */
export const BackupsTab: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [periodoAtual, setPeriodoAtual] = useState("");
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/contabil/backups", { credentials: "include", cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d?.sucesso) throw new Error(d?.motivo || "Falha ao carregar.");
      setBackups(d.backups || []); setPeriodoAtual(d.periodoAtual || ""); setErro("");
    } catch (e: any) { setErro(e?.message || "Não consegui ler os backups agora. Tente de novo em instantes."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const gerarAgora = useCallback(async () => {
    setGerando(true); setAviso("");
    try {
      const r = await fetch("/api/contabil/backups/gerar", { method: "POST", credentials: "include" });
      const d = await r.json();
      if (!r.ok || !d?.sucesso) throw new Error(d?.motivo || "Não foi possível gerar agora.");
      setAviso(d.criadoAgora ? "Backup deste mês gerado e conferido agora." : "O backup deste mês já estava gerado e conferido.");
      await carregar();
    } catch (e: any) { setAviso(e?.message || "Não foi possível gerar o backup agora."); }
    finally { setGerando(false); }
  }, [carregar]);

  const temDoMesAtual = backups.some((b) => b.periodo === periodoAtual && b.status === "ok" && b.verificado);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldHalf className="h-5 w-5 text-blue-700" /> Backups</h2>
            <p className="mt-1 text-sm text-slate-600">Uma cópia cifrada por mês, só com os dados deste escritório. Gerada sozinha todo mês pelo robô conferidor (fica só a do mês corrente) e avisada por e-mail quando fica pronta.</p>
          </div>
          <button
            type="button"
            onClick={() => void gerarAgora()}
            disabled={gerando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#082B66] px-3 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-[#0A357D] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${gerando ? "animate-spin" : ""}`} /> {gerando ? "Gerando…" : "Gerar agora"}
          </button>
        </div>
      </header>

      {erro && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{erro}</div>}
      {aviso && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-800">{aviso}</div>}

      {!erro && !carregando && (
        <div className={`rounded-xl border-2 p-4 ${temDoMesAtual ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-center gap-2 font-bold text-slate-900">
            {temDoMesAtual ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <RefreshCw className="h-4 w-4 text-amber-700" />}
            {temDoMesAtual ? `Backup de ${mesPt(periodoAtual)} em dia` : `Ainda sem backup verificado de ${mesPt(periodoAtual || "")}`}
          </div>
          <div className="mt-1 text-xs text-slate-600">O robô confere isso a cada hora e gera sozinho quando falta. Clique em "Gerar agora" se quiser forçar antes disso.</div>
        </div>
      )}

      <div className="space-y-2">
        {backups.map((b) => (
          <article key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-sm capitalize text-slate-900">{mesPt(b.periodo)}</b>
                <span className="block text-xs text-slate-500">Gerado em {dataHora(b.criadoEm)} · {tamanho(b.tamanhoBytes)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${b.status === "ok" && b.verificado ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {b.status === "ok" && b.verificado ? "Conferido" : "Falhou (nova tentativa automática)"}
                </span>
                {b.status === "ok" && b.verificado && (
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    href={`/api/contabil/backups/${b.id}/download`}
                  >
                    <Download className="h-3.5 w-3.5" /> Baixar
                  </a>
                )}
              </div>
            </div>
            {b.erro && <p className="mt-1 text-xs font-semibold text-red-700">{b.erro}</p>}
          </article>
        ))}
        {!erro && !carregando && backups.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-xs">
            Nenhum backup gerado ainda. O primeiro é gerado automaticamente no próximo ciclo do robô (até 1 hora) — ou clique em "Gerar agora".
          </p>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        O arquivo baixado fica cifrado (nome e extensão propositalmente sem relação com "backup"): mesmo que alguém pegue o arquivo, não consegue abrir fora do Murade. Não contém o certificado digital A1. Guarde-o num lugar seguro fora deste computador.
      </p>
    </div>
  );
};
