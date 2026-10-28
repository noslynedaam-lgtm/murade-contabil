import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import type { EmpresaDados } from "../types";
import { CAMPOS_0020, DESCRICAO_0020, comPeriodoAnual, gerarArquivoEcf, type Campo0020, type SN } from "../services/ecfArquivoService";
import { ecdParaLatin1 } from "../services/ecdService";

interface Props {
  empresa: EmpresaDados;
  ano: number;
  presumido: string[];
  realAnual: string[];
  estimativaMensal: string[];
  realTrimestral: string[];
}

const rotulo = (k: Campo0020) => (DESCRICAO_0020 as Record<string, string>)[k === "IND_E-COM_TI" ? "IND_E_COM_TI" : k] || k;
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export const EcfArquivoPainel: React.FC<Props> = ({ empresa, ano, presumido, realAnual, estimativaMensal, realTrimestral }) => {
  const cnpj = String(empresa.cnpj || "");
  const chave = `murade_ecf_arquivo_${cnpj.replace(/\W/g, "")}_${ano}`;
  const ehReal = /real/i.test(empresa.regime || "");
  const ehPresumido = /presumido/i.test(empresa.regime || "");
  const vazio = () => ({
    apuracao: "A" as "A" | "T", escrituracao: "C" as "C" | "L", aliq: "1",
    flags: {} as Record<string, SN>, confirmado: false,
    natJur: "", cnae: "", codMun: "", cep: "", numero: "",
  });
  const [f, setF] = useState(vazio);
  useEffect(() => {
    try { const s = localStorage.getItem(chave); setF(s ? { ...vazio(), ...JSON.parse(s) } : vazio()); } catch { setF(vazio()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const resultado = useMemo(() => {
    if (!ehReal && !ehPresumido) return null;
    const qual = empresa.responsavelQualificacao || "205";
    const registros = ehPresumido ? presumido
      : f.apuracao === "T" ? realTrimestral
      : [...estimativaMensal, ...comPeriodoAnual(ano, realAnual)];
    return gerarArquivoEcf({
      ano, cnpj, nome: empresa.razaoSocial,
      formaTrib: ehReal ? "1" : "5", formaApur: ehReal ? f.apuracao : "T", tipEscPre: ehPresumido ? f.escrituracao : undefined,
      mesBalRed: ehReal && f.apuracao === "A" ? "EEEEEEEEEEEE" : undefined,
      aliqCsll: f.aliq as "1" | "3" | "4",
      flags: f.flags as Partial<Record<Campo0020, SN>>, flagsConfirmados: f.confirmado,
      cebas: undefined,
      cadastro: {
        naturezaJuridica: f.natJur || empresa.naturezaJuridica || "", cnae: f.cnae || empresa.cnae || "",
        endereco: empresa.logradouro || empresa.endereco || "", numero: f.numero || empresa.numero || "", complemento: empresa.complemento,
        bairro: empresa.bairro || "", uf: empresa.uf || "", codigoMunicipio: f.codMun || empresa.ecdCodigoMunicipioIbge || "",
        cep: f.cep || empresa.cep || "", telefone: empresa.telefone, email: empresa.email || "",
      },
      signatarios: [
        { nome: empresa.responsavelNome || "", documento: empresa.responsavelCpf || "", qualificacao: qual, email: empresa.email || "", fone: soDigitos(empresa.telefone || empresa.whatsapp) },
        { nome: empresa.contadorNome || "", documento: empresa.contadorCpf || "", qualificacao: "900", crc: empresa.contadorCrc, email: empresa.contadorEmail || "", fone: soDigitos(empresa.contadorFone) },
      ],
      registros,
    });
  }, [empresa, ano, cnpj, ehReal, ehPresumido, f, presumido, realAnual, estimativaMensal, realTrimestral]);

  const baixar = () => {
    if (!resultado?.ok) return;
    const url = URL.createObjectURL(new Blob([ecdParaLatin1(resultado.conteudo).buffer as ArrayBuffer], { type: "text/plain;charset=iso-8859-1" }));
    const a = document.createElement("a"); a.href = url; a.download = `ECF-${cnpj.replace(/\W/g, "")}-${ano}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const campo = "mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1";
  if (!ehReal && !ehPresumido) return null;

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-white/80 p-3 text-xs">
      <h4 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4" /> ECF — arquivo completo para importar no programa da ECF ({ano})</h4>
      <p className="mt-1 text-[11px]">Monta o Bloco 0 (identificação, parâmetros, cadastro e signatários), os blocos M/N ou P calculados acima, os blocos vazios que o leiaute exige e o Bloco 9 com as contagens. Os blocos C, J, K e L o programa da ECF recupera da ECD. Valide sempre no programa oficial antes de transmitir.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {ehReal ? (
          <label>Apuração do Lucro Real<select className={campo} value={f.apuracao} onChange={(e) => setF((a) => ({ ...a, apuracao: e.target.value as "A" | "T" }))}><option value="A">Anual (com estimativa mensal)</option><option value="T">Trimestral</option></select></label>
        ) : (
          <label>Escrituração<select className={campo} value={f.escrituracao} onChange={(e) => setF((a) => ({ ...a, escrituracao: e.target.value as "C" | "L" }))}><option value="C">Contábil (recupera a ECD)</option><option value="L">Livro caixa</option></select></label>
        )}
        <label>Alíquota da CSLL<select className={campo} value={f.aliq} onChange={(e) => setF((a) => ({ ...a, aliq: e.target.value }))}><option value="1">9%</option><option value="4">15%</option><option value="3">20%</option></select></label>
        <label>Natureza jurídica (4 dígitos)<input className={campo} placeholder={empresa.naturezaJuridica || "ex.: 2062"} value={f.natJur} onChange={(e) => setF((a) => ({ ...a, natJur: e.target.value }))} /></label>
        <label>CNAE (7 dígitos)<input className={campo} placeholder={empresa.cnae || ""} value={f.cnae} onChange={(e) => setF((a) => ({ ...a, cnae: e.target.value }))} /></label>
        <label>Código IBGE do município<input className={campo} placeholder={empresa.ecdCodigoMunicipioIbge || "7 dígitos"} value={f.codMun} onChange={(e) => setF((a) => ({ ...a, codMun: e.target.value }))} /></label>
        <label>CEP<input className={campo} placeholder={empresa.cep || ""} value={f.cep} onChange={(e) => setF((a) => ({ ...a, cep: e.target.value }))} /></label>
      </div>
      <details className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
        <summary className="cursor-pointer font-bold">Declarações do registro 0020 (todas começam em “Não”; revise com o contador)</summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {CAMPOS_0020.map((k) => (
            <label key={k} className="flex items-start gap-2"><input type="checkbox" checked={f.flags[k] === "S"} onChange={(e) => setF((a) => ({ ...a, flags: { ...a.flags, [k]: e.target.checked ? "S" : "N" } }))} /> <span>{rotulo(k)}</span></label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={f.confirmado} onChange={(e) => setF((a) => ({ ...a, confirmado: e.target.checked }))} /> Revisei estas declarações com o contador responsável</label>
      </details>
      {resultado && !resultado.ok && (
        <div role="alert" className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-900">
          <p className="font-bold">Falta para a ECF ficar pronta: {resultado.erros.length} pendência(s)</p>
          <ul className="mt-1 list-disc pl-4">{resultado.erros.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {resultado?.avisos.map((a) => <p key={a} className="mt-1 text-[11px]">• {a}</p>)}
      <button type="button" onClick={baixar} disabled={!resultado?.ok} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar arquivo da ECF (.txt, Latin-1)</button>
    </div>
  );
};
