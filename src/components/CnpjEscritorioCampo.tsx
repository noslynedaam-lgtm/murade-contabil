// CNPJ do PRÓPRIO escritório: identifica o escritório no Consultor Murade (adicional pago liberado por escritório).
// Só o administrador do escritório grava; cada escritório vê só o seu.
import React, { useEffect, useState } from "react";

export function CnpjEscritorioCampo() {
  const [cnpj, setCnpj] = useState("");
  const [podeEditar, setPodeEditar] = useState(false);
  const [msg, setMsg] = useState("");
  const [liberado, setLiberado] = useState<boolean | null>(null);
  const conferir = () => fetch("/api/consultor/liberado", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => setLiberado(j?.liberado === true)).catch(() => setLiberado(false));
  useEffect(() => {
    fetch("/api/escritorio/cnpj", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.sucesso) { setCnpj(j.cnpj || ""); setPodeEditar(j.podeEditar === true); } }).catch(() => undefined);
    void conferir();
  }, []);
  const gravar = async () => {
    setMsg("");
    const r = await fetch("/api/escritorio/cnpj", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setMsg(j?.mensagem || j?.motivo || "Não consegui gravar agora.");
    if (r?.ok) { setCnpj(j.cnpj); void conferir(); }
  };
  return (
    <div className="mb-3 rounded-lg border border-slate-200 p-3 text-sm">
      <label className="block font-semibold" htmlFor="cnpj-escritorio">CNPJ do escritório</label>
      <p className="mb-1 text-xs text-slate-600">Identifica o seu escritório no Consultor Murade. {liberado === null ? "" : liberado ? "Consultor Murade completo: liberado." : "Consultor Murade completo (faz o serviço inteiro para você): adicional não liberado. Fale com o seu fornecedor."}</p>
      <div className="flex flex-wrap gap-2">
        <input id="cnpj-escritorio" inputMode="numeric" value={cnpj} disabled={!podeEditar} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="min-w-0 flex-1 rounded-lg border p-2" />
        {podeEditar && <button type="button" onClick={() => void gravar()} className="min-h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white">Gravar</button>}
      </div>
      {msg && <p className="mt-1 text-xs text-slate-700">{msg}</p>}
    </div>
  );
}
