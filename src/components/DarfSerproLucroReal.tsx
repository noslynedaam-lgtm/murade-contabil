import React, { useState } from "react";

// Botão "Gerar DARF com código de barras (Serpro — consome crédito)" do Lucro Real. CONSOME CRÉDITO: só sai pelo clique e depois do
// cartão que avisa as 2 consultas pagas (nenhum robô faz isso). O pedido vai ao Murad Fiscal, que guarda a credencial e a procuração.
// Depois de gerado: a linha digitável com o botão Copiar e o PDF para baixar.

export const CODIGOS_SERPRO_LR = ["2362", "2319", "3373", "2430", "2456", "2484", "6012", "2030", "6773"];
type P = Record<string, any>;
const botao = "rounded-lg px-3 py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";
const copiar = (t: string) => { try { void navigator.clipboard?.writeText(t); } catch { /* sem área de transferência */ } };

export const DarfSerproLucroReal: React.FC<{ base: string; ano: number; periodo: string; darf: P; gerado: P | null; desabilitado: boolean; aoGerar: () => Promise<void> }> = ({ base, ano, periodo, darf, gerado, desabilitado, aoGerar }) => {
  const [cartao, setCartao] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const trib = String(darf.tributo).toUpperCase();
  const comExtensao = !!darf.codigo && CODIGOS_SERPRO_LR.includes(String(darf.codigo));
  const gerar = async () => {
    setGerando(true); setErro(null);
    try {
      const r = await fetch(`${base}/darf-serpro`, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano, periodo, tributo: darf.tributo, confirmado: true, gerarDeNovo: !!gerado }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.sucesso === false) setErro(j?.motivo || "Não foi possível gerar agora."); else { setCartao(false); await aoGerar(); }
    } catch { setErro("Sem conexão com o servidor."); }
    setGerando(false);
  };
  if (darf.codigo && !comExtensao) return <p className="mt-1 text-[11px] text-amber-800" data-campo="lr-darf-sem-extensao">DARF {trib} {darf.codigo}: este código não tem extensão oficial conferida para o Serpro. Emita pelo Sicalc Web.</p>;
  if (!darf.codigo) return null;
  return (
    <div className="mt-1 rounded-md border border-amber-300 bg-amber-50/40 p-2 text-[11px]" data-campo="lr-darf-serpro">
      {gerado && (
        <div className="space-y-1">
          {gerado.linhaDigitavel && <p data-campo="lr-darf-codbarras">DARF {trib} — código de barras (linha digitável): <span className="font-mono break-all">{gerado.linhaDigitavel}</span> <button type="button" className="font-bold text-[#165DFF] underline" onClick={() => { copiar(String(gerado.linhaDigitavel).replace(/\s/g, "")); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>{copiado ? "Copiado" : "Copiar"}</button></p>}
          {gerado.receitaSemCodigoBarras && <p className="font-semibold text-amber-900">{gerado.receitaSemCodigoBarras}</p>}
          {(gerado.avisos || []).map((a: string) => <p key={a} className="text-amber-800">{a}</p>)}
          <p className="text-[#4E5969]">Gerado em {new Date(gerado.geradoEm).toLocaleString("pt-BR")} por {gerado.geradoPor}{gerado.municipio ? ` · município ${gerado.municipio}` : ""}.</p>
          {gerado.temPdf && <a className={`${botao} inline-block border border-emerald-600 bg-white text-emerald-700`} href={`${base}/darf-serpro/${ano}/${periodo}/${darf.tributo}.pdf`} download>Baixar DARF do Serpro (PDF)</a>}
        </div>
      )}
      {!cartao && <button type="button" data-campo="lr-darf-serpro-botao" className={`${botao} mt-1 border border-amber-400 bg-amber-50 text-amber-900`} disabled={desabilitado || gerando} onClick={() => { setErro(null); setCartao(true); }}>{gerado ? `Gerar de novo o DARF ${trib} (Serpro — consome crédito)` : `Gerar DARF ${trib} com código de barras (Serpro — consome crédito)`}</button>}
      {cartao && (
        <div className="mt-1 rounded-lg border-2 border-amber-500 bg-white p-3 text-xs" role="dialog" aria-label="Confirmar consulta paga ao Serpro" data-campo="lr-darf-serpro-cartao">
          <p className="text-sm font-bold text-amber-900">Gerar o DARF {trib} {darf.codigo} pelo Serpro?</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li><b>São 2 CONSULTAS PAGAS ao Serpro</b> (Integra Contador, SICALC): uma para o código de barras e outra para o PDF. Saem só por este clique; nenhum robô faz isso.</li>
            <li>O DARF sai consolidado para pagar hoje (ou no próximo dia útil). Nada é pago: você paga no banco com o código de barras.</li>
            <li>O pedido vai pelo Murad Fiscal, com a procuração do seu escritório no e-CAC. Sem ela, ou sem a liberação da empresa, nada é enviado nem cobrado.</li>
            {gerado && <li>Este DARF já foi gerado antes: gerar de novo gasta mais 2 consultas.</li>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${botao} border border-[#CBD5E1] bg-white`} disabled={gerando} onClick={() => setCartao(false)}>Cancelar</button>
            <button type="button" className={`${botao} bg-amber-600 text-white`} disabled={gerando} onClick={() => void gerar()}>{gerando ? "Gerando no Serpro…" : "Sim, gerar no Serpro"}</button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1 font-semibold text-red-700" role="alert">{erro}</p>}
    </div>
  );
};
