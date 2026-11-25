import React, { useEffect, useState } from "react";

// "Meus alertas de vencimento no celular" do Contábil (igual ao do Fiscal e do DP): cada pessoa liga/desliga, por tipo, os PRÓPRIOS
// alertas urgentes do Contábil. Desligar não apaga nada: a faixa vermelha e a Central do Lucro Real continuam. Padrão: tudo ligado.
type Tipo = { tipo: string; nome: string };
export function MeusAlertasCelularContabil() {
  const [tipos, setTipos] = useState<Tipo[]>([]); const [desligados, setDesligados] = useState<string[] | null>(null); const [msg, setMsg] = useState("");
  useEffect(() => { void fetch("/api/alerta-urgente/preferencias", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.sucesso) { setTipos(d.tipos || []); setDesligados(d.preferencias?.silenciarTipos || []); } }).catch(() => undefined); }, []);
  const salvar = async (lista: string[]) => {
    try {
      const r = await fetch("/api/alerta-urgente/preferencias", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ silenciarTipos: lista }) });
      const d = await r.json(); if (!r.ok || d?.sucesso === false) throw new Error(d?.motivo || "Não foi possível salvar.");
      setDesligados(d.preferencias.silenciarTipos); setMsg("Salvo.");
    } catch (e: any) { setMsg(e.message); }
  };
  if (!desligados) return null;
  return (
    <details className="mx-2 mt-2 rounded-lg border border-slate-200 bg-white p-2 text-sm" data-campo="meus-alertas-celular-contabil">
      <summary className="cursor-pointer font-bold text-slate-900">🔔 Meus alertas de vencimento no celular</summary>
      <p className="mt-1 text-xs text-slate-600">Vale só para você. Desligar não apaga nada: a faixa vermelha e a Central do Lucro Real continuam. O aviso chega neste aparelho depois de tocar em “Ativar avisos neste aparelho” no Início; quem ainda não ativou aqui recebe pelo aplicativo do Murad Fiscal (com o horário silencioso de lá).</p>
      <ul className="mt-1 space-y-1 pl-5 text-xs">{tipos.map((t) => (
        <li key={t.tipo}><label className="flex items-center gap-2"><input type="checkbox" checked={!desligados.includes(t.tipo)} onChange={(e) => void salvar(e.target.checked ? desligados.filter((x) => x !== t.tipo) : [...desligados, t.tipo])} /> {t.nome}</label></li>
      ))}</ul>
      {msg && <p role="status" className="mt-1 text-xs text-slate-600">{msg}</p>}
    </details>
  );
}
