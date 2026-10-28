import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { ContaPlano, EmpresaDados } from "../types";
import { LancamentoValidado } from "../utils/livrosContabeis";
import { codPlanRefECD, contasReferenciais, existeContaReferencialAnalitica, FONTE_PLANO_REFERENCIAL, regimeReferencial, sugerirMapeamento } from "../services/planoReferencialService";
import { analisarObrigatoriedadeECD, naturezasDasContas, CodigoNaturezaConta, ecdParaLatin1, gerarArquivoECD, montarParametrosECD, ParametrosECD, prazoEntregaECD } from "../services/ecdService";

interface Props {
  empresa: EmpresaDados;
  ano: string;
  contas: ContaPlano[];
  lancamentos: LancamentoValidado[];
  onMapeamentoReferencial?: (mapa: Record<string, string>) => void;
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
  numeroLivro: string; naturezaLivro: string; dataAtos: string; municipio: string; ibge: string; contaResultado: string;
}

function isoDeBR(v?: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? (v as string) : "";
}

export const EcdGeradorPainel: React.FC<Props> = ({ empresa, ano, contas, lancamentos, onMapeamentoReferencial }) => {
  const chave = `murade_ecd_form_${String(empresa.cnpj || "").replace(/\W/g, "")}`;
  const inicial = (): Form => ({
    numeroLivro: String(empresa.ecdNumeroLivro || 1), naturezaLivro: empresa.ecdNaturezaLivro || "DIARIO GERAL", dataAtos: isoDeBR(empresa.dataAbertura), municipio: empresa.municipio || "", ibge: empresa.ecdCodigoMunicipioIbge || "", contaResultado: "",
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

  const regimeRef = regimeReferencial(empresa.regime);
  const mapaRef = useMemo(() => empresa.mapeamentoReferencial || {}, [empresa.mapeamentoReferencial]);
  const naturezasContas = useMemo(() => naturezasDasContas(contas, naturezas), [contas, naturezas]);
  const sugestoes = useMemo(
    () => (regimeRef ? sugerirMapeamento(contas, regimeRef, naturezasContas as Map<string, string>, mapaRef) : []),
    [contas, regimeRef, naturezasContas, mapaRef],
  );
  const [autoAplicados, setAutoAplicados] = useState(0);
  // Automático: vínculos de alta confiança são aplicados sozinhos; o contador só revisa o restante.
  useEffect(() => {
    if (!regimeRef || !onMapeamentoReferencial) return;
    const altas = sugestoes.filter((x) => x.confianca === "alta");
    if (!altas.length) return;
    const novo = { ...mapaRef };
    for (const a of altas) novo[a.contaCodigo] = a.candidatos[0].codigo;
    setAutoAplicados((n) => n + altas.length);
    onMapeamentoReferencial(novo);
  }, [sugestoes, regimeRef, onMapeamentoReferencial, mapaRef]);
  const definirVinculo = (conta: string, ref: string) => {
    if (!onMapeamentoReferencial) return;
    const novo = { ...mapaRef };
    if (ref) novo[conta] = ref; else delete novo[conta];
    onMapeamentoReferencial(novo);
  };
  const analiticasRef = contas.filter((c) => c.tipo === "analitica");
  const vinculadas = analiticasRef.filter((c) => mapaRef[c.codigo]).length;
  const pendentesRef = analiticasRef.filter((c) => !mapaRef[c.codigo]);

  const parametros = useMemo((): ParametrosECD => {
    const nire = String(empresa.nire || "").replace(/\D/g, "");
    return montarParametrosECD(empresa, Number(ano), {
      codigoMunicipioIbge: f.ibge || undefined, municipio: f.municipio,
      possuiNire: Boolean(nire), nire: nire || undefined, dataArquivamentoAtos: f.dataAtos || undefined,
      numeroLivro: Number(f.numeroLivro), naturezaLivro: f.naturezaLivro, naturezaPorGrupo: naturezas, contaResultadoCodigo: f.contaResultado || undefined,
      planoReferencial: regimeRef && vinculadas > 0 ? { codPlanRef: codPlanRefECD(regimeRef), mapa: mapaRef } : undefined,
    });
  }, [f, ano, empresa, naturezas, regimeRef, vinculadas, mapaRef]);

  const analise = useMemo(() => analisarObrigatoriedadeECD({ regime: empresa.regime, presumidoLivroCaixa: empresa.presumidoLivroCaixa, presumidoDistribuiuLucroAcimaBase: empresa.presumidoDistribuiuLucroAcimaBase, simplesAporteCapital: empresa.simplesAporteCapital }), [empresa]);
  const prazo = prazoEntregaECD(Number(ano) || new Date().getFullYear());
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
      <div role="status" className={`mt-2 rounded border p-2 ${analise.situacao === "obrigatoria" ? "border-red-200 bg-red-50 text-red-900" : analise.situacao === "depende" ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
        <strong>{analise.titulo} — {empresa.regime || "regime não informado"}.</strong> {analise.motivo}
        <div className="mt-1">Prazo de entrega do ano-calendário {ano}: {prazo.split("-").reverse().join("/")} (último dia útil de junho; confira feriados).{analise.planoReferencial ? ` Plano referencial do regime: ${analise.planoReferencial} – ${analise.descricaoPlanoReferencial} (mapeamento I051 ainda não incluído).` : ""}</div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label>Nº de ordem do livro<input className={campo} type="number" min="1" value={f.numeroLivro} onChange={set("numeroLivro")} /></label>
        <label>Natureza do livro<input className={campo} value={f.naturezaLivro} onChange={set("naturezaLivro")} /></label>
        <label>Município<input className={campo} value={f.municipio} onChange={set("municipio")} /></label>
        <label>Código IBGE do município (opcional)<input className={campo} inputMode="numeric" value={f.ibge} onChange={set("ibge")} /></label>
        <label>Arquivamento dos atos (ou abertura)<input className={campo} type="date" value={f.dataAtos} onChange={set("dataAtos")} /></label>
      </div>
      <p className="mt-2 text-[11px]">Assinatura e identificação vêm do cadastro da empresa (CRC, CPF, e-mail, certidão e NIRE). Preencha uma vez em Empresa → Contador e valerá para todas as ECDs.</p>
      {regimeRef && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="font-bold">Plano referencial da Receita ({regimeRef === "real" ? "Lucro Real – PJ em geral" : "Lucro Presumido – PJ em geral"}): {vinculadas} de {analiticasRef.length} contas vinculadas</p>
          <p className="text-[11px]">{autoAplicados > 0 ? `${autoAplicados} vínculo(s) aplicado(s) automaticamente pela semelhança da descrição. ` : ""}Revise as contas abaixo. Fonte: {FONTE_PLANO_REFERENCIAL}.</p>
          {pendentesRef.length > 0 && (
            <div className="mt-2 max-h-64 overflow-auto">
              {pendentesRef.slice(0, 60).map((c) => {
                const sug = sugestoes.find((x) => x.contaCodigo === c.codigo);
                const grupo = naturezasContas.get(c.codigo) === "04" ? "resultado" : "patrimonial";
                return (
                  <div key={c.codigo} className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="min-w-[10rem] font-semibold">{c.codigo} — {c.descricao}</span>
                    <select className="max-w-full rounded border border-amber-300 bg-white px-2 py-1" value="" onChange={(e) => definirVinculo(c.codigo, e.target.value)}>
                      <option value="">{sug?.candidatos.length ? "Escolher sugestão…" : "Sem sugestão automática — escolher…"}</option>
                      {(sug?.candidatos.length ? sug.candidatos : contasReferenciais(regimeRef, grupo).filter((r) => r.tipo === "A").slice(0, 40)).map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} — {r.descricao}</option>)}
                    </select>
                    <input className="w-44 rounded border border-amber-300 px-2 py-1" placeholder="ou digite o código" onBlur={(e) => { const v = e.target.value.trim(); if (v && existeContaReferencialAnalitica(regimeRef, v)) definirVinculo(c.codigo, v); e.target.value = ""; }} />
                  </div>
                );
              })}
              {pendentesRef.length > 60 && <p className="mt-1 text-[11px]">E mais {pendentesRef.length - 60} conta(s); resolva estas primeiro.</p>}
            </div>
          )}
        </div>
      )}
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
      {resultado.erros.some((e) => e.startsWith("Escolha a conta do Patrimônio Líquido")) && resultado.contasPL && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="font-bold">Conta do Patrimônio Líquido que recebe o resultado do exercício (encerramento automático):</p>
          <select className="mt-1 rounded border border-amber-300 bg-white px-2 py-1" value={f.contaResultado} onChange={(e) => setF((a) => ({ ...a, contaResultado: e.target.value }))}>
            <option value="">Escolher…</option>{resultado.contasPL.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}
          </select>
        </div>
      )}
      {resultado.erros.length > 0 && (
        <div role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-red-900">
          <p className="font-bold">Falta para a ECD ficar pronta: {resultado.erros.length} pendência(s) para o contador</p>
          <ul className="mt-1 list-disc space-y-1 pl-6">{resultado.erros.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {resultado.ok && <p role="status" className="mt-3 rounded bg-emerald-100 p-2 text-emerald-950">Pronto: {resultado.resumo.linhas} linhas, {resultado.resumo.contas} contas, {resultado.resumo.lancamentos} lançamentos (incluindo o encerramento do resultado), {resultado.resumo.meses} mês(es) com saldos. Balanço e DRE incluídos.</p>}
      {resultado.ok && resultado.avisos.map((a, i) => <p key={i} className="mt-1 text-[11px]">• {a}</p>)}
      <button type="button" onClick={baixar} disabled={!resultado.ok} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar arquivo ECD (.txt, Latin-1)</button>
      {msg && <p role="status" className="mt-2 text-[11px]">{msg}</p>}
    </div>
  );
};
