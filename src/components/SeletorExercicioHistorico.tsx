// "Exercício consultado": empresa grande fica com os exercícios em aberto no documento e os antigos no histórico guardado.
// Aqui a pessoa escolhe o ano para os relatórios (Balancete, Livros, Demonstrações): um ano guardado vem do servidor só para
// consulta (lançamentos do ano + saldo transportado até o ano anterior). Também guarda exercícios antigos e traz o último de
// volta — cada um com segunda confirmação. Faixa pequena (não fixa), para não ocupar a tela do celular.
import React, { useEffect, useState } from "react";
import type { LancamentoContabil } from "../types";

export interface ConsultaHistorico { ano: number; lancamentos: LancamentoContabil[]; doAno: number }
interface Props {
  cnpj: string;
  /** Marca do histórico no documento (null = empresa inteira no documento). */
  ateCompetencia: string | null;
  consulta: ConsultaHistorico | null;
  onConsulta: (c: ConsultaHistorico | null) => void;
  podeAlterar: boolean;
  aviso: (texto: string) => void;
}

export function SeletorExercicioHistorico({ cnpj, ateCompetencia, consulta, onConsulta, podeAlterar, aviso }: Props) {
  const [anos, setAnos] = useState<Array<{ ano: number; quantidade: number }>>([]);
  const [carregando, setCarregando] = useState(false);
  const [confirmar, setConfirmar] = useState<null | { tipo: "guardar"; ateAno: number } | { tipo: "voltar" }>(null);
  const [ocupado, setOcupado] = useState(false);
  const anoAtual = Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 4));
  const [ateAno, setAteAno] = useState(anoAtual - 2);

  useEffect(() => {
    if (!cnpj || !ateCompetencia) { setAnos([]); return; }
    let ativo = true;
    fetch(`/api/workspaces/${encodeURIComponent(cnpj)}/historico`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (ativo && j?.sucesso) setAnos((j.anos || []).map((a: any) => ({ ano: Number(a.ano), quantidade: Number(a.quantidade) }))); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [cnpj, ateCompetencia]);

  const escolher = async (valor: string) => {
    if (!valor) { onConsulta(null); return; }
    setCarregando(true);
    try {
      const r = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}/historico/ano/${encodeURIComponent(valor)}`, { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.sucesso) { aviso(j.motivo || "Não foi possível abrir este exercício agora."); return; }
      onConsulta({ ano: Number(valor), lancamentos: j.lancamentos || [], doAno: Number(j.doAno || 0) });
    } finally { setCarregando(false); }
  };

  const executar = async () => {
    if (!confirmar) return;
    setOcupado(true);
    try {
      const url = confirmar.tipo === "guardar" ? "guardar" : "trazer-de-volta";
      const r = await fetch(`/api/workspaces/${encodeURIComponent(cnpj)}/historico/${url}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(confirmar.tipo === "guardar" ? { ateAno: confirmar.ateAno, confirmado: true } : { confirmado: true }),
      });
      const j = await r.json().catch(() => ({}));
      aviso(j.mensagem || j.motivo || (r.ok ? "Feito." : "Não foi possível agora; nada foi alterado."));
      if (r.ok && j.sucesso) { onConsulta(null); window.dispatchEvent(new Event("murade-workspace-alterado")); }
    } finally { setOcupado(false); setConfirmar(null); }
  };

  const corteAno = ateCompetencia ? Number(ateCompetencia.slice(0, 4)) : null;
  const anosGuardados = anos.length ? anos : [];
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700" data-ajuda="exercicio-consultado">
      <div className="flex flex-wrap items-center gap-2">
        {corteAno !== null && (
          <label className="flex items-center gap-1">
            <span className="font-semibold">Exercício consultado:</span>
            <select className="rounded border border-slate-300 px-1 py-0.5" value={consulta ? String(consulta.ano) : ""} disabled={carregando} onChange={(e) => void escolher(e.target.value)} aria-label="Exercício consultado">
              <option value="">Exercícios em aberto ({corteAno + 1} em diante)</option>
              {[...anosGuardados].sort((a, b) => b.ano - a.ano).map((a) => <option key={a.ano} value={a.ano}>{a.ano} — guardado ({a.quantidade} lanç.)</option>)}
            </select>
          </label>
        )}
        {carregando && <span>Abrindo o exercício…</span>}
        {podeAlterar && !consulta && (
          <span className="flex flex-wrap items-center gap-1">
            <label className="flex items-center gap-1">Guardar até
              <select className="rounded border border-slate-300 px-1 py-0.5" value={ateAno} onChange={(e) => setAteAno(Number(e.target.value))} aria-label="Guardar exercícios até o ano">
                {Array.from({ length: 12 }, (_, i) => anoAtual - 1 - i).filter((a) => corteAno === null || a > corteAno).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <button type="button" className="rounded bg-slate-100 px-2 py-0.5 font-semibold hover:bg-slate-200" onClick={() => setConfirmar({ tipo: "guardar", ateAno })}>Guardar no histórico</button>
            {corteAno !== null && <button type="button" className="rounded bg-slate-100 px-2 py-0.5 font-semibold hover:bg-slate-200" onClick={() => setConfirmar({ tipo: "voltar" })}>Trazer {corteAno} de volta</button>}
          </span>
        )}
      </div>
      {consulta && <p className="mt-1 text-[11px] text-amber-900">Consulta do exercício de {consulta.ano}, guardado no histórico (só leitura): {consulta.doAno} lançamento(s) do ano, com o saldo transportado até 31/12/{consulta.ano - 1}. Para alterar, traga o exercício de volta.</p>}
      {confirmar && (
        <div role="alertdialog" className="mt-1 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="font-semibold">{confirmar.tipo === "guardar" ? `Guardar no histórico os exercícios até ${confirmar.ateAno}?` : `Trazer o exercício de ${corteAno} de volta para o documento da empresa?`}</p>
          <p className="text-[11px]">{confirmar.tipo === "guardar" ? `Nada é apagado: os lançamentos até 31/12/${confirmar.ateAno} vão para o histórico guardado e o saldo de cada conta é transportado para ${confirmar.ateAno + 1}. Os relatórios dos exercícios em aberto dão os mesmos números.` : "Nada é apagado: os lançamentos daquele ano voltam para o documento (se couberem) e o saldo transportado é refeito."}</p>
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={ocupado} className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white" onClick={() => void executar()}>{ocupado ? "Aguarde…" : "Sim, confirmar"}</button>
            <button type="button" disabled={ocupado} className="rounded bg-white px-2 py-0.5 font-semibold ring-1 ring-slate-300" onClick={() => setConfirmar(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
