import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { ContaPlano, EmpresaDados } from "../types";
import { LancamentoValidado } from "../utils/livrosContabeis";
import { CodigoNaturezaConta, ecdParaLatin1, gerarArquivoECD, ParametrosECD, SignatarioECD } from "../services/ecdService";

interface Props {
  empresa: EmpresaDados;
  ano: string;
  contas: ContaPlano[];
  lancamentos: LancamentoValidado[];
}

const NATUREZAS: Array<{ v: CodigoNaturezaConta; t: string }> = [
  { v: "01", t: "Ativo" }, { v: "02", t: "Passivo" }, { v: "03", t: "Patrimônio líquido" },
  { v: "04", t: "Resultado" }, { v: "05", t: "Compensação" }, { v: "09", t: "Outras" },
];
const QUALIFICACOES: Array<{ c: string; t: string }> = [
  { c: "203", t: "Diretor" }, { c: "205", t: "Administrador" }, { c: "401", t: "Empresário" },
  { c: "309", t: "Procurador" }, { c: "940", t: "Outros" },
];

interface Form {
  numeroLivro: string; naturezaLivro: string; possuiNire: boolean; nire: string; dataAtos: string; municipio: string; ibge: string;
  respNome: string; respCpf: string; respCod: string;
  contNome: string; contCpf: string; contCrc: string; contUf: string; contEmail: string; contFone: string; contCert: string; contDataCrc: string;
}

function isoDeBR(v?: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? (v as string) : "";
}

export const EcdGeradorPainel: React.FC<Props> = ({ empresa, ano, contas, lancamentos }) => {
  const chave = `murade_ecd_form_${String(empresa.cnpj || "").replace(/\W/g, "")}`;
  const inicial = (): Form => ({
    numeroLivro: "1", naturezaLivro: "DIARIO GERAL", possuiNire: false, nire: "", dataAtos: isoDeBR(empresa.dataAbertura), municipio: empresa.municipio || "", ibge: "",
    respNome: empresa.responsavelNome || "", respCpf: empresa.responsavelCpf || "", respCod: "205",
    contNome: empresa.contadorNome || "", contCpf: "", contCrc: empresa.contadorCrc || "", contUf: empresa.uf || "", contEmail: "", contFone: "", contCert: "", contDataCrc: "",
  });
  const [f, setF] = useState<Form>(inicial);
  const [naturezas, setNaturezas] = useState<Record<string, CodigoNaturezaConta>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave);
      setF(salvo ? { ...inicial(), ...JSON.parse(salvo) } : inicial());
    } catch { setF(inicial()); }
    setNaturezas({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const parametros = useMemo((): ParametrosECD => {
    const signatarios: SignatarioECD[] = [
      { nome: f.respNome, documento: f.respCpf, qualificacao: QUALIFICACOES.find((q) => q.c === f.respCod)?.t || "Outros", codigo: f.respCod, responsavelLegal: true },
      { nome: f.contNome, documento: f.contCpf, qualificacao: "Contador/Contabilista", codigo: "900", crc: f.contCrc, email: f.contEmail, fone: f.contFone.replace(/\D/g, ""), ufCrc: f.contUf, certidaoCrc: f.contCert, dataCrc: f.contDataCrc, responsavelLegal: false },
    ];
    return {
      ano: Number(ano), nomeEmpresarial: empresa.razaoSocial, cnpj: empresa.cnpj, uf: empresa.uf, codigoMunicipioIbge: f.ibge || undefined,
      inscricaoEstadual: empresa.inscricaoEstadual, inscricaoMunicipal: empresa.inscricaoMunicipal, municipio: f.municipio,
      possuiNire: f.possuiNire, nire: f.possuiNire ? f.nire : undefined, dataArquivamentoAtos: f.dataAtos || undefined,
      numeroLivro: Number(f.numeroLivro), naturezaLivro: f.naturezaLivro, signatarios, naturezaPorGrupo: naturezas,
    };
  }, [f, ano, empresa, naturezas]);

  const resultado = useMemo(() => gerarArquivoECD({ parametros, contas, lancamentos }), [parametros, contas, lancamentos]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((a) => ({ ...a, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const campo = "mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1";

  const baixar = () => {
    if (!resultado.conteudo) return;
    const url = URL.createObjectURL(new Blob([ecdParaLatin1(resultado.conteudo).buffer as ArrayBuffer], { type: "text/plain;charset=iso-8859-1" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ECD-${String(empresa.cnpj).replace(/\W/g, "")}-${ano}.txt`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Arquivo gerado. Importe no PGE do Sped Contábil, corrija o que ele apontar, assine e transmita por lá.");
  };

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-white/80 p-3">
      <h4 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4" /> Gerar arquivo ECD (Leiaute 9) — {ano}</h4>
      <p className="mt-1 text-[11px]">Gera o TXT do Livro Diário (forma G) com plano de contas, saldos mensais, lançamentos, termos e signatários. Ainda não inclui Balanço/DRE (J100/J150) nem plano referencial (I051/I052). Valide sempre no PGE do Sped Contábil antes de assinar.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label>Nº de ordem do livro<input className={campo} type="number" min="1" value={f.numeroLivro} onChange={set("numeroLivro")} /></label>
        <label>Natureza do livro<input className={campo} value={f.naturezaLivro} onChange={set("naturezaLivro")} /></label>
        <label>Município<input className={campo} value={f.municipio} onChange={set("municipio")} /></label>
        <label>Código IBGE do município (opcional)<input className={campo} inputMode="numeric" value={f.ibge} onChange={set("ibge")} /></label>
        <label>Arquivamento dos atos (ou abertura)<input className={campo} type="date" value={f.dataAtos} onChange={set("dataAtos")} /></label>
        <label className="flex items-end gap-2"><input type="checkbox" checked={f.possuiNire} onChange={set("possuiNire")} /> Empresa possui NIRE</label>
        {f.possuiNire && <label>NIRE (11 dígitos)<input className={campo} inputMode="numeric" value={f.nire} onChange={set("nire")} /></label>}
      </div>
      <h5 className="mt-3 font-bold">Responsável legal (assina pela empresa)</h5>
      <div className="grid gap-2 sm:grid-cols-3">
        <label>Nome<input className={campo} value={f.respNome} onChange={set("respNome")} /></label>
        <label>CPF<input className={campo} value={f.respCpf} onChange={set("respCpf")} /></label>
        <label>Qualificação<select className={campo} value={f.respCod} onChange={set("respCod")}>{QUALIFICACOES.map((q) => <option key={q.c} value={q.c}>{q.c} — {q.t}</option>)}</select></label>
      </div>
      <h5 className="mt-3 font-bold">Contador</h5>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label>Nome<input className={campo} value={f.contNome} onChange={set("contNome")} /></label>
        <label>CPF<input className={campo} value={f.contCpf} onChange={set("contCpf")} /></label>
        <label>CRC<input className={campo} value={f.contCrc} onChange={set("contCrc")} /></label>
        <label>UF do CRC<input className={campo} maxLength={2} value={f.contUf} onChange={set("contUf")} /></label>
        <label>E-mail<input className={campo} type="email" value={f.contEmail} onChange={set("contEmail")} /></label>
        <label>Telefone<input className={campo} value={f.contFone} onChange={set("contFone")} /></label>
        <label>Certidão de regularidade (UF/ano/nº)<input className={campo} value={f.contCert} onChange={set("contCert")} /></label>
        <label>Data da certidão<input className={campo} type="date" value={f.contDataCrc} onChange={set("contDataCrc")} /></label>
      </div>
      {resultado.pendenciasNatureza.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="font-bold">Natureza das contas (exigida pelo leiaute) — escolha para os grupos abaixo:</p>
          {resultado.pendenciasNatureza.map((p) => (
            <label key={p.codigo} className="mt-1 flex items-center gap-2">{p.codigo} — {p.descricao}
              <select className="rounded border border-amber-300 bg-white px-2 py-1" value={naturezas[p.codigo] || ""} onChange={(e) => setNaturezas((a) => ({ ...a, [p.codigo]: e.target.value as CodigoNaturezaConta }))}>
                <option value="">Escolher…</option>{NATUREZAS.map((n) => <option key={n.v} value={n.v}>{n.v} — {n.t}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {resultado.erros.length > 0 && <ul role="alert" className="mt-3 list-disc space-y-1 rounded border border-red-200 bg-red-50 p-2 pl-6 text-red-900">{resultado.erros.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {resultado.ok && <p role="status" className="mt-3 rounded bg-emerald-100 p-2 text-emerald-950">Pronto: {resultado.resumo.linhas} linhas, {resultado.resumo.contas} contas, {resultado.resumo.lancamentos} lançamentos, {resultado.resumo.meses} mês(es) com saldos.</p>}
      {resultado.ok && resultado.avisos.map((a, i) => <p key={i} className="mt-1 text-[11px]">• {a}</p>)}
      <button type="button" onClick={baixar} disabled={!resultado.ok} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar arquivo ECD (.txt, Latin-1)</button>
      {msg && <p role="status" className="mt-2 text-[11px]">{msg}</p>}
    </div>
  );
};
