import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { ContaPlano, EmpresaDados } from "../types";
import { confirmarNaTela } from "../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "./ConfirmaExclusaoDuasEtapas";
import { LancamentoValidado } from "../utils/livrosContabeis";
import { codPlanRefECD, contasReferenciais, existeContaReferencialAnalitica, FONTE_PLANO_REFERENCIAL, regimeReferencial, sugerirMapeamento } from "../services/planoReferencialService";
import { conferirBlocoL, registrosBlocoL } from "../services/ecfBlocoLService";
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
  numeroLivro: string; naturezaLivro: string; dataAtos: string; municipio: string; ibge: string; contaResultado: string; demonstracaoPL: "dlpa" | "dmpl" | "nenhuma";
}

function isoDeBR(v?: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? (v as string) : "";
}

export const EcdGeradorPainel: React.FC<Props> = ({ empresa, ano, contas, lancamentos, onMapeamentoReferencial }) => {
  const chave = `murade_ecd_form_${String(empresa.cnpj || "").replace(/\W/g, "")}`;
  const inicial = (): Form => ({
    numeroLivro: String(empresa.ecdNumeroLivro || 1), naturezaLivro: empresa.ecdNaturezaLivro || "DIARIO GERAL", dataAtos: isoDeBR(empresa.dataAbertura), municipio: empresa.municipio || "", ibge: empresa.ecdCodigoMunicipioIbge || "", contaResultado: "", demonstracaoPL: "dlpa",
  });
  const [f, setF] = useState<Form>(inicial);
  const [naturezas, setNaturezas] = useState<Record<string, CodigoNaturezaConta>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave);
      setF(salvo ? { ...inicial(), ...JSON.parse(salvo) } : inicial());
    } catch { setF(inicial()); }
    try { const n = JSON.parse(localStorage.getItem(`${chave}_naturezas`) || "{}"); setNaturezas(n && typeof n === "object" && !Array.isArray(n) ? n : {}); } catch { setNaturezas({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { try { localStorage.setItem(`${chave}_naturezas`, JSON.stringify(naturezas)); } catch { /* opcional */ } }, [chave, naturezas]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* opcional */ } }, [chave, f]);

  const regimeRef = regimeReferencial(empresa.regime);
  const mapaRef = useMemo(() => empresa.mapeamentoReferencial || {}, [empresa.mapeamentoReferencial]);
  const naturezasContas = useMemo(() => naturezasDasContas(contas, naturezas), [contas, naturezas]);
  const sugestoes = useMemo(
    () => (regimeRef ? sugerirMapeamento(contas, regimeRef, naturezasContas as Map<string, string>, mapaRef) : []),
    [contas, regimeRef, naturezasContas, mapaRef],
  );
  const [autoAplicados, setAutoAplicados] = useState(0);
  // Contas cujo vínculo foi escolhido/alterado/removido à mão: o automático nunca mexe nelas sem confirmação.
  const chaveManual = `murade_ecd_vinculos_manuais_${String(empresa.cnpj || "").replace(/\W/g, "")}`;
  const [manuais, setManuais] = useState<string[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(chaveManual) || "[]"); setManuais(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { setManuais([]); }
  }, [chaveManual]);
  const marcarManual = (conta: string) => setManuais((a) => {
    if (a.includes(conta)) return a;
    const n = [...a, conta];
    try { localStorage.setItem(chaveManual, JSON.stringify(n)); } catch { /* opcional */ }
    return n;
  });
  // Automático: vínculos de alta confiança são aplicados sozinhos às contas sem vínculo e sem ajuste manual; o contador só revisa o restante.
  useEffect(() => {
    if (!regimeRef || !onMapeamentoReferencial) return;
    const altas = sugestoes.filter((x) => x.confianca === "alta" && !manuais.includes(x.contaCodigo));
    if (!altas.length) return;
    const novo = { ...mapaRef };
    for (const a of altas) novo[a.contaCodigo] = a.candidatos[0].codigo;
    setAutoAplicados((n) => n + altas.length);
    onMapeamentoReferencial(novo);
  }, [sugestoes, regimeRef, onMapeamentoReferencial, mapaRef, manuais]);
  const definirVinculo = (conta: string, ref: string) => {
    if (!onMapeamentoReferencial) return;
    const novo = { ...mapaRef };
    if (ref) novo[conta] = ref; else delete novo[conta];
    marcarManual(conta);
    onMapeamentoReferencial(novo);
  };
  // Sugestão automática para todas as contas (inclusive as já vinculadas), usada para mostrar opções e para "Refazer".
  const sugestoesTodas = useMemo(
    () => (regimeRef ? sugerirMapeamento(contas, regimeRef, naturezasContas as Map<string, string>, {}) : []),
    [contas, regimeRef, naturezasContas],
  );
  const { pedir: pedirExclusao, dialogo: dialogoExclusao } = useExclusaoDuasEtapas();
  const refazerAutomatico = async () => {
    if (!onMapeamentoReferencial) return;
    const alvo = sugestoesTodas.filter((x) => x.confianca === "alta" && !manuais.includes(x.contaCodigo) && mapaRef[x.contaCodigo] !== x.candidatos[0].codigo);
    const trocas = alvo.filter((x) => mapaRef[x.contaCodigo]).length;
    if (!alvo.length) { setMsg("Refeito: os vínculos automáticos já estão iguais à sugestão atual. Contas ajustadas à mão não foram mexidas."); return; }
    if (!(await confirmarNaTela(`Refazer os vínculos automáticos com o plano referencial?\n\n${alvo.length} conta(s) serão vinculadas pela sugestão atual (${trocas} delas já tinham outro vínculo, que será trocado).\nContas que você ajustou à mão (${manuais.length}) não serão alteradas.`))) return;
    const novo = { ...mapaRef };
    for (const a of alvo) novo[a.contaCodigo] = a.candidatos[0].codigo;
    onMapeamentoReferencial(novo);
    setMsg(`Refeito: ${alvo.length} vínculo(s) automático(s) atualizado(s).`);
  };
  const analiticasRef = contas.filter((c) => c.tipo === "analitica");
  const vinculadas = analiticasRef.filter((c) => mapaRef[c.codigo]).length;
  const pendentesRef = analiticasRef.filter((c) => !mapaRef[c.codigo]);

  const parametros = useMemo((): ParametrosECD => {
    const nire = String(empresa.nire || "").replace(/\D/g, "");
    return montarParametrosECD(empresa, Number(ano), {
      codigoMunicipioIbge: f.ibge || undefined, municipio: f.municipio,
      possuiNire: Boolean(nire), nire: nire || undefined, dataArquivamentoAtos: f.dataAtos || undefined,
      numeroLivro: Number(f.numeroLivro), naturezaLivro: f.naturezaLivro, naturezaPorGrupo: naturezas, contaResultadoCodigo: f.contaResultado || undefined, demonstracaoPL: f.demonstracaoPL || "dlpa",
      planoReferencial: regimeRef && vinculadas > 0 ? { codPlanRef: codPlanRefECD(regimeRef), mapa: mapaRef } : undefined,
    });
  }, [f, ano, empresa, naturezas, regimeRef, vinculadas, mapaRef]);

  const baixarBlocoL = () => {
    if (!blocoL) return;
    const url = URL.createObjectURL(new Blob([registrosBlocoL(blocoL).join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `ECF-conferencia-bloco-L-${String(empresa.cnpj || "").replace(/\W/g, "")}-${ano}.txt`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const analise = useMemo(() => analisarObrigatoriedadeECD({ regime: empresa.regime, presumidoLivroCaixa: empresa.presumidoLivroCaixa, presumidoDistribuiuLucroAcimaBase: empresa.presumidoDistribuiuLucroAcimaBase, simplesAporteCapital: empresa.simplesAporteCapital }), [empresa]);
  const prazo = prazoEntregaECD(Number(ano) || new Date().getFullYear());
  const resultado = useMemo(() => gerarArquivoECD({ parametros, contas, lancamentos }), [parametros, contas, lancamentos]);
  const blocoL = useMemo(() => (resultado.ok && resultado.saldosAnuais && regimeRef && vinculadas > 0 ? conferirBlocoL(regimeRef, resultado.saldosAnuais, mapaRef) : null), [resultado, regimeRef, vinculadas, mapaRef]);
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refazerAutomatico()} className="rounded border border-amber-400 bg-white px-2 py-1 font-semibold">Refazer vínculos automáticos</button>
            <span className="text-[11px]">{manuais.length} conta(s) com vínculo ajustado manualmente (o automático não mexe nelas).</span>
          </div>
          {vinculadas > 0 && (
            <details className="mt-2 rounded border border-amber-200 bg-white p-2">
              <summary className="cursor-pointer font-bold">Revisar ou trocar vínculos já feitos ({vinculadas})</summary>
              <div className="mt-2 max-h-72 overflow-auto">
                {analiticasRef.filter((c) => mapaRef[c.codigo]).slice(0, 80).map((c) => {
                  const sug = sugestoesTodas.find((x) => x.contaCodigo === c.codigo);
                  const grupo = naturezasContas.get(c.codigo) === "04" ? "resultado" : "patrimonial";
                  const manual = manuais.includes(c.codigo);
                  return (
                    <div key={c.codigo} className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="min-w-[10rem] font-semibold">{c.codigo} — {c.descricao}</span>
                      <span className="rounded bg-slate-100 px-1">{mapaRef[c.codigo]}</span>
                      <span className={`rounded px-1 text-[10px] font-bold ${manual ? "bg-violet-100 text-violet-900" : "bg-emerald-100 text-emerald-900"}`}>{manual ? "ajustado manualmente" : "automático"}</span>
                      <select className="max-w-full rounded border border-amber-300 bg-white px-2 py-1" value="" onChange={(e) => { if (e.target.value) definirVinculo(c.codigo, e.target.value); }}>
                        <option value="">Trocar por…</option>
                        {(sug?.candidatos.length ? sug.candidatos : contasReferenciais(regimeRef, grupo).filter((r) => r.tipo === "A").slice(0, 40)).map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} — {r.descricao}</option>)}
                      </select>
                      <input className="w-40 rounded border border-amber-300 px-2 py-1" placeholder="ou digite o código" onBlur={(e) => { const v = e.target.value.trim(); if (v && existeContaReferencialAnalitica(regimeRef, v)) definirVinculo(c.codigo, v); e.target.value = ""; }} />
                      <button type="button" className="rounded border border-amber-300 px-2 py-0.5" onClick={async () => { if (await pedirExclusao({ titulo: "Tirar o vínculo referencial?", oQue: `o vínculo referencial da conta ${c.codigo}`, consequencias: ["Só o vínculo sai: a conta e os lançamentos ficam como estão.", "A conta passa a aparecer como pendente e o automático não a vincula de novo sozinho."], rotuloFinal: "Sim, tirar o vínculo", irreversivel: false, comoVoltar: "Para ter o vínculo de novo, escolha o plano referencial dessa conta outra vez." })) definirVinculo(c.codigo, ""); }}>Tirar vínculo</button>
                    </div>
                  );
                })}
                {vinculadas > 80 && <p className="mt-1 text-[11px]">Mostrando as 80 primeiras; use “Refazer vínculos automáticos” ou ajuste pelas pendentes.</p>}
              </div>
            </details>
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
      <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
        <summary className="cursor-pointer font-bold">Revisar a natureza detectada das contas (Ativo, Passivo, PL, Resultado…)</summary>
        <p className="mt-1 text-[11px]">O sistema detecta a natureza pelo nome do grupo. Se estiver errada, escolha a correta: fica “ajustado manualmente” e vale para todo o grupo.</p>
        {contas.filter((c) => c.tipo === "sintetica" && c.nivel === 1).map((c) => {
          const detectada = naturezasDasContas(contas, {}).get(c.codigo);
          const manual = naturezas[c.codigo];
          return (
            <div key={c.codigo} className="mt-1 flex flex-wrap items-center gap-2">
              <span className="min-w-[10rem] font-semibold">{c.codigo} — {c.descricao}</span>
              <span className="text-[11px]">Automático: {detectada ? NATUREZAS.find((n) => n.v === detectada)?.t : "não detectada"}</span>
              <select className="rounded border border-slate-300 bg-white px-2 py-1" value={manual || ""} onChange={(e) => setNaturezas((a) => { const n = { ...a }; if (e.target.value) n[c.codigo] = e.target.value as CodigoNaturezaConta; else delete n[c.codigo]; return n; })}>
                <option value="">{manual ? "Voltar ao automático" : "Usar o automático"}</option>{NATUREZAS.map((n) => <option key={n.v} value={n.v}>{n.v} — {n.t}</option>)}
              </select>
              {manual && <span className="rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-900">ajustado manualmente</span>}
            </div>
          );
        })}
      </details>
      {resultado.erros.some((e) => e.startsWith("Escolha a conta do Patrimônio Líquido")) && resultado.contasPL && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="font-bold">Conta do Patrimônio Líquido que recebe o resultado do exercício (encerramento automático):</p>
          <select className="mt-1 rounded border border-amber-300 bg-white px-2 py-1" value={f.contaResultado} onChange={(e) => setF((a) => ({ ...a, contaResultado: e.target.value }))}>
            <option value="">Escolher…</option>{resultado.contasPL.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>)}
          </select>
        </div>
      )}
      <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
        <label className="font-bold">Demonstração do Patrimônio Líquido no arquivo (J210/J215):{" "}
          <select className="mt-1 rounded border border-slate-300 bg-white px-2 py-1 font-normal" value={f.demonstracaoPL || "dlpa"} onChange={(e) => setF((a) => ({ ...a, demonstracaoPL: e.target.value as Form["demonstracaoPL"] }))}>
            <option value="dlpa">DLPA – Lucros ou Prejuízos Acumulados (padrão)</option>
            <option value="dmpl">DMPL – Mutações de todas as contas do Patrimônio Líquido</option>
            <option value="nenhuma">Não gerar</option>
          </select>
        </label>
      </div>
      {resultado.erros.length > 0 && (
        <div role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-red-900">
          <p className="font-bold">Falta para a ECD ficar pronta: {resultado.erros.length} pendência(s) para o contador</p>
          <ul className="mt-1 list-disc space-y-1 pl-6">{resultado.erros.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {resultado.ok && <p role="status" className="mt-3 rounded bg-emerald-100 p-2 text-emerald-950">Pronto: {resultado.resumo.linhas} linhas, {resultado.resumo.contas} contas, {resultado.resumo.lancamentos} lançamentos (incluindo o encerramento do resultado), {resultado.resumo.meses} mês(es) com saldos. Balanço e DRE incluídos.</p>}
      {resultado.ok && resultado.avisos.map((a, i) => <p key={i} className="mt-1 text-[11px]">• {a}</p>)}
      {blocoL && (
        <div className="mt-3 rounded border border-amber-300 bg-white p-2">
          <p className="font-bold">Conferência da ECF — Balanço e DRE pelo plano referencial (Bloco L)</p>
          <p className="text-[11px]">Ativo {(blocoL.totais.ativoFin / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} × Passivo + PL {(-blocoL.totais.passivoPlFin / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · resultado antes do encerramento {(-blocoL.totais.resultadoAntesEncerramento / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Na ECF, importe esta ECD com “Recuperar ECD”; o programa calcula o Bloco L sozinho a partir do vínculo referencial. Use este quadro só para comparar.</p>
          {blocoL.erros.length > 0 ? <ul role="alert" className="mt-1 list-disc pl-5 text-red-900">{blocoL.erros.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="mt-1 rounded bg-emerald-100 p-1 text-emerald-950">Balanço fecha e todas as contas estão vinculadas.</p>}
          <button type="button" onClick={baixarBlocoL} className="mt-1 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-2 py-1 font-semibold"><Download className="h-3.5 w-3.5" /> Baixar conferência L100/L300 (.txt)</button>
        </div>
      )}
      <button type="button" data-campo="ecd-baixar" onClick={baixar} disabled={!resultado.ok} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Baixar arquivo ECD (.txt, Latin-1)</button>
      {msg && <p role="status" className="mt-2 text-[11px]">{msg}</p>}
      {dialogoExclusao}
    </div>
  );
};
