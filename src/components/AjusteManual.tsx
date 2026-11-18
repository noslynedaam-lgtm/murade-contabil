import React from "react";
import { confirmarNaTela } from "../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { centavosParaTexto, contarAjustes, estaAjustado, paraCentavos, valorEfetivoCentavos } from "../utils/ajusteManual";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Campo que mostra o valor automático (da contabilidade) e deixa corrigir à mão. O ajuste fica marcado e só sai com confirmação. */
export const CampoAjustavel: React.FC<{
  automaticoCentavos: number;
  ajuste: string | undefined;
  onChange: (valor: string | undefined) => void;
  rotulo?: string;
  largura?: string;
}> = ({ automaticoCentavos, ajuste, onChange, rotulo, largura = "w-28" }) => {
  const ajustado = estaAjustado(ajuste);
  const invalido = ajuste !== undefined && ajuste.trim() !== "" && paraCentavos(ajuste) === null;
  return (
    <span className="inline-flex flex-col gap-0.5 align-top">
      <input
        aria-label={rotulo ? `${rotulo} (automático ${brl(automaticoCentavos)})` : "Valor ajustável"}
        inputMode="decimal"
        className={`${largura} rounded border px-1 py-0.5 ${ajustado ? "border-violet-500 bg-violet-50" : invalido ? "border-red-500" : "border-amber-300 bg-white"}`}
        value={ajuste ?? centavosParaTexto(automaticoCentavos)}
        onChange={(e) => { const v = e.target.value; onChange(v === centavosParaTexto(automaticoCentavos) || v.trim() === "" ? undefined : v); }}
      />
      {invalido && <span className="text-[10px] text-red-700">Valor inválido: usando o automático.</span>}
      {ajustado && (
        <span className="text-[10px] text-violet-800">
          Ajustado manualmente (automático: {brl(automaticoCentavos)}){" "}
          <button type="button" className="font-bold underline" onClick={async () => { if (await confirmarNaTela(`Voltar este valor ao automático (${brl(automaticoCentavos)})? O valor digitado por você será descartado.`)) onChange(undefined); }}>voltar ao automático</button>
        </span>
      )}
    </span>
  );
};

/** Botão "Recalcular": os valores automáticos já são refeitos ao vivo; aqui só se descartam os ajustes manuais, com confirmação. */
export const BotaoRecalcular: React.FC<{ ajustes: Record<string, string> | undefined; onDescartar: () => void; texto?: string }> = ({ ajustes, onDescartar, texto = "Recalcular tudo pela contabilidade" }) => {
  const [msg, setMsg] = React.useState("");
  const { pedir: pedirExclusao, dialogo: dialogoExclusao } = useExclusaoDuasEtapas();
  const n = contarAjustes(ajustes);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="rounded border border-violet-400 bg-white px-2 py-1 font-semibold" onClick={async () => {
        if (n === 0) { setMsg("Recalculado: nenhum valor estava ajustado à mão, tudo já segue a contabilidade."); return; }
        if (await pedirExclusao({ titulo: "Descartar os valores digitados?", oQue: `${n} valor(es) que você digitou à mão nesta tela`, consequencias: ["Todos voltam ao valor automático da contabilidade.", "O que você digitou será descartado."], rotuloFinal: "Sim, descartar e recalcular" })) { onDescartar(); setMsg("Recalculado: todos os valores voltaram ao automático."); }
      }}>{texto}</button>
      {n > 0 && <span className="text-[11px] text-violet-800">{n} valor(es) ajustado(s) manualmente</span>}
      {msg && <span role="status" className="text-[11px]">{msg}</span>}
      {dialogoExclusao}
    </span>
  );
};

export { valorEfetivoCentavos };
