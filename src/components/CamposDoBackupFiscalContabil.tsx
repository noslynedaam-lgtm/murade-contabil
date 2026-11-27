import React, { useState } from "react";

// Tela Empresa: campos que estavam vazios e foram completados com o que veio do backup do sistema anterior (o Murad Fiscal guardou na
// migração). Uma linha discreta (não ocupa a tela no celular), com o "Completar agora" (o mesmo trabalho do robô, só desta empresa).
const ROTULO: Record<string, string> = {
  cnae: "CNAE", inscricaoEstadual: "inscrição estadual", inscricaoMunicipal: "inscrição municipal", naturezaJuridica: "natureza jurídica", municipio: "município", uf: "UF",
  cidadeUf: "cidade / UF", dataAbertura: "data de abertura", endereco: "endereço", logradouro: "logradouro", numero: "número", complemento: "complemento", bairro: "bairro", cep: "CEP", regime: "regime tributário",
};
export const CamposDoBackupFiscalContabil: React.FC<{ cnpj: string; campos: string[] }> = ({ cnpj, campos }) => {
  const [msg, setMsg] = useState(""); const [rodando, setRodando] = useState(false);
  const limpo = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpo.length !== 14 || (!campos.length && !msg)) return null;
  const completar = async () => {
    setRodando(true); setMsg("");
    try {
      const r = await fetch("/api/dados-backup-fiscal/rodar", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: limpo }) });
      const j: any = await r.json().catch(() => ({}));
      setMsg(j?.sucesso ? `${j.mensagem || "Conferido."} Abra a empresa de novo para ver os campos completados.` : (j?.motivo || "Não foi possível completar agora."));
    } catch { setMsg("Sem conexão com o servidor."); }
    setRodando(false);
  };
  return (
    <div data-campo="campos-backup-fiscal" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950">
      {campos.length > 0 && <span><b>Completado pelo backup:</b> {campos.map((c) => ROTULO[c] || c).join(", ")} — veio do backup do sistema anterior pelo Murad Fiscal — confira.</span>}
      <button type="button" data-campo="campos-backup-fiscal-rodar" disabled={rodando} onClick={completar} className="rounded border border-sky-700 px-2 py-1 font-semibold text-sky-800 disabled:opacity-50">{rodando ? "Conferindo…" : "Completar agora"}</button>
      {msg && <span role="status" className="w-full">{msg}</span>}
    </div>
  );
};
