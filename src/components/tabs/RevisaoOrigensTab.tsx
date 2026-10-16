import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ClipboardCheck, RefreshCw } from "lucide-react";

type DocumentoFiscal = Record<string, unknown>;
type ResumoFolha = { competencia: string; calculadoEm: string; recebidoEm: string; resumo: Record<string, number | null> };
type LoteOrigens = { documentos: DocumentoFiscal[]; folhas: ResumoFolha[] };

const competenciaAtual = () => new Date().toISOString().slice(0, 7);
const dinheiro = (value: unknown) => typeof value === "number" && Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  : value === null ? "Não apurado" : "—";
const texto = (value: unknown) => value == null || value === "" ? "—" : String(value);

export const RevisaoOrigensTab: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const [desde, setDesde] = useState(competenciaAtual);
  const [ate, setAte] = useState(competenciaAtual);
  const [dados, setDados] = useState<LoteOrigens>({ documentos: [], folhas: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const cnpjNormalizado = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const carregar = useCallback(async () => {
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpjNormalizado)) {
      setDados({ documentos: [], folhas: [] });
      setErro("Selecione ou cadastre uma empresa autorizada com CNPJ válido.");
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const query = new URLSearchParams({ cnpj: cnpjNormalizado, desde, ate });
      const response = await fetch(`/api/revisao/origens?${query}`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.sucesso !== true) throw new Error(result.motivo || "Não foi possível ler as origens persistidas.");
      setDados({ documentos: Array.isArray(result.documentos) ? result.documentos : [], folhas: Array.isArray(result.folhas) ? result.folhas : [] });
      setAtualizadoEm(new Date().toLocaleString("pt-BR"));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao consultar as origens.");
    } finally {
      setCarregando(false);
    }
  }, [cnpjNormalizado, cnpj, desde, ate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const totaisFiscal = useMemo(() => dados.documentos.reduce((acc, doc) => {
    const tipo = String(doc.tipo || "").toLowerCase();
    if (tipo.includes("entrada")) acc.entradas += 1;
    if (tipo.includes("saída") || tipo.includes("saida")) acc.saidas += 1;
    return acc;
  }, { entradas: 0, saidas: 0 }), [dados.documentos]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Dados recebidos • {cnpj || "sem empresa"}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Revisão Fiscal e Departamento Pessoal</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Consulta os registros persistidos para esta empresa. Os dados ficam aguardando conferência e mapeamento; esta tela não cria partidas nem transmite obrigações.</p>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-semibold text-slate-600">Competência inicial<input type="month" value={desde} max={ate} onChange={(event) => setDesde(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        <label className="text-xs font-semibold text-slate-600">Competência final<input type="month" value={ate} min={desde} onChange={(event) => setAte(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>
        {atualizadoEm && <span className="text-xs text-slate-500">Consultado em {atualizadoEm}</span>}
      </section>

      {erro && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Notas fiscais recebidas" value={String(dados.documentos.length)} detail={`${totaisFiscal.entradas} entradas • ${totaisFiscal.saidas} saídas`} />
        <Metric title="Resumos de folha recebidos" value={String(dados.folhas.length)} detail="Totais agregados por competência" />
        <Metric title="Lançamentos automáticos" value="0" detail="Aguardam mapeamento e aprovação" />
        <Metric title="Status da conferência" value="Pendente" detail="Revisão do contador necessária" />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ArrowDownToLine className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Documentos do Fiscal</h2></div>
        {dados.documentos.length === 0 ? <Empty text="Nenhuma nota fiscal persistida para a empresa e o período selecionados." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Emissão</th><th className="px-4 py-3">Número / chave</th><th className="px-4 py-3">Participante</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Situação</th></tr></thead>
            <tbody>{dados.documentos.map((doc, index) => <tr key={`${texto(doc.chaveAcesso || doc.id)}-${index}`} className="border-t border-slate-100">
              <td className="px-4 py-3 font-semibold">{texto(doc.tipo)}</td><td className="px-4 py-3">{texto(doc.dataEmissao || doc.emissao)}</td>
              <td className="max-w-64 truncate px-4 py-3 font-mono text-xs">{texto(doc.numero || doc.numeroNota || doc.chaveAcesso || doc.id)}</td>
              <td className="max-w-64 truncate px-4 py-3">{texto(doc.destinatario || doc.remetente || doc.participante || doc.nomeParticipante)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{dinheiro(doc.valorTotal ?? doc.valor ?? doc.total)}</td>
              <td className="px-4 py-3 text-amber-800">Aguardando conferência</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><ClipboardCheck className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Resumos agregados do DP</h2></div>
        {dados.folhas.length === 0 ? <Empty text="Nenhum resumo de folha persistido para a empresa e o período selecionados." /> : (
          <div className="divide-y divide-slate-100">{dados.folhas.map((folha) => <article key={`${folha.competencia}-${folha.calculadoEm}`} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Competência {folha.competencia}</h3><span className="text-xs text-slate-500">Recebido em {new Date(folha.recebidoEm).toLocaleString("pt-BR")}</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(folha.resumo || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{key}</div><div className="mt-1 font-bold text-slate-900">{key === "quantidadeFuncionarios" ? texto(value) : dinheiro(value)}</div></div>)}</div>
            <p className="mt-3 text-xs text-amber-800">Recebido para revisão; valores nulos continuam “não apurados” e não são contabilizados como zero.</p>
          </article>)}</div>
        )}
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">A integração preserva os dados por CNPJ. Antes de gerar partidas, é necessário revisar documento, competência, natureza, regime e contas contábeis; não há transmissão oficial nesta etapa.</div>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; detail: string }> = ({ title, value, detail }) => <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold text-slate-500">{title}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
const Empty: React.FC<{ text: string }> = ({ text }) => <p className="p-5 text-sm text-slate-500">{text}</p>;
