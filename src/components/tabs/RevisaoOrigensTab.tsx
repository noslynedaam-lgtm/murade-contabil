import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ClipboardCheck, RefreshCw, Save } from "lucide-react";
import type { ContaPlano, MapeamentoOrigemContabil, OrigemMapeadaContabil, PreLancamentoContabil } from "../../types";

type DocumentoFiscal = Record<string, unknown>;
type ResumoFolha = { competencia: string; calculadoEm: string; recebidoEm: string; resumo: Record<string, number | null> };
type LoteOrigens = { documentos: DocumentoFiscal[]; folhas: ResumoFolha[] };
type RascunhoMapeamento = { contaDebitoCodigo: string; contaCreditoCodigo: string };
type PreviaPartidaDP = { competencia: string; origem: string; contaDebitoCodigo: string; contaCreditoCodigo: string; valor: number; referencia: string };
type EstadoPreviaDP = { partidas: PreviaPartidaDP[]; pendencias: Array<{ competencia: string; motivo: string }> };

const origensMapeaveis: Array<{ id: OrigemMapeadaContabil; titulo: string; descricao: string }> = [
  { id: "fiscal_entrada", titulo: "NF-e de entrada", descricao: "A conta de estoque/despesa varia por operação e CFOP; revise a conta de débito para esta empresa." },
  { id: "fiscal_saida", titulo: "NF-e de saída", descricao: "Mapeia o valor bruto da venda; tributos destacados exigem regras próprias antes de contabilizar." },
  { id: "dp_folha_bruta", titulo: "Folha bruta do DP", descricao: "Despesa de salários contra salários a pagar." },
  { id: "dp_descontos_inss", titulo: "INSS descontado do empregado", descricao: "Reduz salários a pagar e credita INSS a recolher; não inclui INSS patronal." },
  { id: "dp_descontos_irrf", titulo: "IRRF descontado", descricao: "Reduz salários a pagar e credita IRRF a recolher." },
  { id: "dp_fgts", titulo: "FGTS informado pelo DP", descricao: "Despesa de FGTS contra FGTS a recolher. Valores só chegam após cálculo persistido no DP." },
];

const competenciaAtual = () => new Date().toISOString().slice(0, 7);
const dinheiro = (value: unknown) => typeof value === "number" && Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  : value === null ? "Não apurado" : "—";
const texto = (value: unknown) => value == null || value === "" ? "—" : String(value);

export const RevisaoOrigensTab: React.FC<{
  cnpj: string;
  contas: ContaPlano[];
  mapeamentos: MapeamentoOrigemContabil[];
  onSalvarMapeamentos: (mapeamentos: MapeamentoOrigemContabil[]) => void;
  preLancamentos: PreLancamentoContabil[];
  onSalvarPreLancamentos: (preLancamentos: PreLancamentoContabil[]) => void;
  onContabilizar: (referencias: string[]) => Promise<boolean>;
}> = ({ cnpj, contas, mapeamentos, onSalvarMapeamentos, preLancamentos, onSalvarPreLancamentos, onContabilizar }) => {
  const [desde, setDesde] = useState(competenciaAtual);
  const [ate, setAte] = useState(competenciaAtual);
  const [dados, setDados] = useState<LoteOrigens>({ documentos: [], folhas: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [mensagemPrevia, setMensagemPrevia] = useState("");
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoMapeamento>>(() => Object.fromEntries(
    mapeamentos.map((item) => [item.origem, { contaDebitoCodigo: item.contaDebitoCodigo, contaCreditoCodigo: item.contaCreditoCodigo }]),
  ));
  const cnpjNormalizado = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");

  useEffect(() => {
    setRascunhos(Object.fromEntries(mapeamentos.map((item) => [item.origem, {
      contaDebitoCodigo: item.contaDebitoCodigo,
      contaCreditoCodigo: item.contaCreditoCodigo,
    }])));
  }, [cnpjNormalizado, mapeamentos]);

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

  const contasAnaliticas = useMemo(() => contas.filter((conta) => conta.tipo === "analitica"), [contas]);
  const contaNome = (codigo: string) => contasAnaliticas.find((conta) => conta.codigo === codigo)?.descricao || "Conta não encontrada no plano atual";
  const previaContabilDP = useMemo<EstadoPreviaDP>(() => {
    const partidas: PreviaPartidaDP[] = [];
    const pendencias: EstadoPreviaDP["pendencias"] = [];
    const porOrigem = new Map<OrigemMapeadaContabil, MapeamentoOrigemContabil>(mapeamentos.map((item) => [item.origem, item]));
    const origens = [
      { campo: "folhaBruta", origem: "dp_folha_bruta" as const, titulo: "Folha bruta" },
      { campo: "descontosINSS", origem: "dp_descontos_inss" as const, titulo: "INSS descontado do empregado" },
      { campo: "descontosIRRF", origem: "dp_descontos_irrf" as const, titulo: "IRRF descontado" },
      { campo: "fgts", origem: "dp_fgts" as const, titulo: "FGTS informado pelo DP" },
    ];
    for (const folha of dados.folhas) {
      const valores = folha.resumo || {};
      const camposObrigatorios = ["folhaBruta", "descontosINSS", "descontosIRRF", "descontosOutros", "liquidoFolha", "fgts"];
      if (camposObrigatorios.some((campo) => typeof valores[campo] !== "number" || !Number.isFinite(valores[campo]))) {
        pendencias.push({ competencia: folha.competencia, motivo: "Há totais essenciais não apurados; nenhuma prévia foi montada." });
        continue;
      }
      const folhaBruta = valores.folhaBruta as number;
      const descontosINSS = valores.descontosINSS as number;
      const descontosIRRF = valores.descontosIRRF as number;
      const descontosOutros = valores.descontosOutros as number;
      const liquidoFolha = valores.liquidoFolha as number;
      const saldoLiquidoCalculado = Math.round((folhaBruta - descontosINSS - descontosIRRF - descontosOutros + Number.EPSILON) * 100) / 100;
      if (descontosOutros > 0 || Math.abs(saldoLiquidoCalculado - liquidoFolha) > 0.01) {
        pendencias.push({ competencia: folha.competencia, motivo: "Descontos ou líquido não conciliam com os mapeamentos disponíveis; classifique todos os descontos antes de preparar partidas." });
        continue;
      }
      const candidatas: PreviaPartidaDP[] = [];
      let incompleta = false;
      for (const origem of origens) {
        const valor = valores[origem.campo] as number;
        if (valor < 0) { incompleta = true; break; }
        if (valor === 0) continue;
        const mapeamento = porOrigem.get(origem.origem);
        const debitoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaDebitoCodigo));
        const creditoExiste = Boolean(mapeamento && contasAnaliticas.some((conta) => conta.codigo === mapeamento.contaCreditoCodigo));
        if (!mapeamento || !debitoExiste || !creditoExiste || mapeamento.contaDebitoCodigo === mapeamento.contaCreditoCodigo) {
          pendencias.push({ competencia: folha.competencia, motivo: `Mapeamento válido de débito e crédito pendente para ${origem.titulo}.` });
          incompleta = true;
          break;
        }
        candidatas.push({
          competencia: folha.competencia,
          origem: origem.titulo,
          contaDebitoCodigo: mapeamento.contaDebitoCodigo,
          contaCreditoCodigo: mapeamento.contaCreditoCodigo,
          valor,
          referencia: `DP:${cnpjNormalizado}:${folha.competencia}:${origem.campo}`,
        });
      }
      if (!incompleta) partidas.push(...candidatas);
    }
    return { partidas, pendencias };
  }, [dados.folhas, mapeamentos, contasAnaliticas, cnpjNormalizado]);

  const selecionarConta = (origem: OrigemMapeadaContabil, lado: keyof RascunhoMapeamento, valor: string) => {
    const salvo = mapeamentos.find((item) => item.origem === origem);
    const atual = rascunhos[origem] || {
      contaDebitoCodigo: salvo?.contaDebitoCodigo || "",
      contaCreditoCodigo: salvo?.contaCreditoCodigo || "",
    };
    const proximo = { ...atual, [lado]: valor };
    setRascunhos((prev) => ({ ...prev, [origem]: proximo }));
    if (!proximo.contaDebitoCodigo || !proximo.contaCreditoCodigo) {
      if (salvo && (!proximo.contaDebitoCodigo || !proximo.contaCreditoCodigo)) {
        onSalvarMapeamentos(mapeamentos.filter((item) => item.origem !== origem));
      }
      return;
    }
    const debito = contasAnaliticas.find((conta) => conta.codigo === proximo.contaDebitoCodigo);
    const credito = contasAnaliticas.find((conta) => conta.codigo === proximo.contaCreditoCodigo);
    if (!debito || !credito || debito.codigo === credito.codigo) {
      if (salvo) onSalvarMapeamentos(mapeamentos.filter((item) => item.origem !== origem));
      return;
    }
    const mapeamento: MapeamentoOrigemContabil = {
      origem,
      contaDebitoCodigo: debito.codigo,
      contaCreditoCodigo: credito.codigo,
      revisadoEm: new Date().toISOString(),
    };
    onSalvarMapeamentos([...mapeamentos.filter((item) => item.origem !== origem), mapeamento]);
  };

  const salvarPreviaDP = () => {
    const novos = previaContabilDP.partidas.map((partida): PreLancamentoContabil => {
      const campo = partida.referencia.split(":").at(-1);
      const origem: PreLancamentoContabil["origem"] = campo === "folhaBruta" ? "DP — Folha"
        : campo === "descontosINSS" ? "DP — INSS"
          : campo === "descontosIRRF" ? "DP — IRRF" : "DP — FGTS";
      return {
        id: partida.referencia,
        referenciaOrigem: partida.referencia,
        competencia: partida.competencia,
        data: `${partida.competencia}-01`,
        origem,
        contaDebitoCodigo: partida.contaDebitoCodigo,
        contaCreditoCodigo: partida.contaCreditoCodigo,
        valor: partida.valor,
        historico: `${partida.origem} — pré-lançamento para conferência`,
        status: "pendente_conferencia",
        criadoEm: new Date().toISOString(),
      };
    });
    const referenciasNovas = new Set(novos.map((item) => item.referenciaOrigem));
    onSalvarPreLancamentos([...preLancamentos.filter((item) => !referenciasNovas.has(item.referenciaOrigem)), ...novos]);
    setMensagemPrevia(`${novos.length} pré-lançamento(s) enviado(s) para persistência neste CNPJ. Permanecem pendentes de conferência e fora do balancete.`);
  };

  const contabilizarPendentes = async () => {
    const pendentes = preLancamentos.filter((item) => item.status === "pendente_conferencia");
    if (!pendentes.length) return;
    const confirmado = window.confirm(`Conferiu os ${pendentes.length} pré-lançamento(s) desta empresa e competência? A confirmação cria lançamentos no Contábil e altera o balancete após salvar no banco.`);
    if (!confirmado) return;
    setMensagemPrevia("Salvando os lançamentos aprovados no banco permanente…");
    const persistido = await onContabilizar(pendentes.map((item) => item.referenciaOrigem));
    setMensagemPrevia(persistido
      ? `${pendentes.length} lançamento(s) contabilizado(s) e confirmado(s) no PostgreSQL.`
      : "A gravação no PostgreSQL não foi confirmada. Os dados continuam apenas na cópia local; atualize a empresa antes de tentar novamente.");
  };

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

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3"><Save className="h-4 w-4 text-blue-700" /><h2 className="font-bold text-slate-900">Mapeamento de contas por empresa</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">Escolha contas analíticas do plano desta empresa. O mapeamento fica salvo no espaço contábil do CNPJ. Ele prepara a classificação; não cria lançamentos automaticamente nem envia valores ao governo.</p>
          {origensMapeaveis.map((origem) => {
            const salvo = mapeamentos.find((item) => item.origem === origem.id);
            const rascunho = rascunhos[origem.id];
            const debito = rascunho?.contaDebitoCodigo ?? salvo?.contaDebitoCodigo ?? "";
            const credito = rascunho?.contaCreditoCodigo ?? salvo?.contaCreditoCodigo ?? "";
            const valido = Boolean(salvo && contasAnaliticas.some((conta) => conta.codigo === salvo.contaDebitoCodigo) && contasAnaliticas.some((conta) => conta.codigo === salvo.contaCreditoCodigo) && salvo.contaDebitoCodigo !== salvo.contaCreditoCodigo);
            return <article key={origem.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(180px,1fr)_1fr_1fr] md:items-end">
              <div><h3 className="text-sm font-bold text-slate-900">{origem.titulo}</h3><p className="mt-1 text-xs text-slate-500">{origem.descricao}</p><p className={`mt-2 text-xs font-semibold ${valido ? "text-emerald-700" : "text-amber-700"}`}>{valido ? `Revisado em ${new Date(salvo!.revisadoEm).toLocaleDateString("pt-BR")}` : "Pendente de mapeamento"}</p></div>
              <label className="text-xs font-semibold text-slate-600">Débito<select value={debito} onChange={(event) => selecionarConta(origem.id, "contaDebitoCodigo", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Selecione uma conta analítica</option>{contasAnaliticas.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {contaNome(conta.codigo)}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Crédito<select value={credito} onChange={(event) => selecionarConta(origem.id, "contaCreditoCodigo", event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Selecione uma conta analítica</option>{contasAnaliticas.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {contaNome(conta.codigo)}</option>)}</select></label>
            </article>;
          })}
          <p className="text-xs text-slate-500">Contas sintéticas, contas removidas do plano e lançamentos com débito igual ao crédito não são aceitos como mapeamento válido.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white">
        <div className="flex items-center gap-2 border-b border-indigo-100 px-4 py-3"><ClipboardCheck className="h-4 w-4 text-indigo-700" /><h2 className="font-bold text-slate-900">Prévia contábil da folha</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">Sugestões calculadas a partir dos resumos persistidos e dos mapeamentos desta empresa. Esta prévia não é salva como lançamento, não altera o balancete e não substitui a conferência do contador.</p>
          {previaContabilDP.pendencias.map((item, index) => <div key={`${item.competencia}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{item.competencia}:</strong> {item.motivo}</div>)}
          {previaContabilDP.partidas.length === 0 ? <Empty text="Ainda não há partidas de folha prontas para prévia com os dados e mapeamentos disponíveis." /> : (
            <>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-indigo-800">{previaContabilDP.partidas.length} partida(s) sugerida(s); nenhuma contabilizada.</p><button type="button" onClick={salvarPreviaDP} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" /> Salvar pré-lançamentos pendentes</button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Competência</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Débito</th><th className="px-3 py-2">Crédito</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
              <tbody>{previaContabilDP.partidas.map((partida) => <tr key={partida.referencia} className="border-t border-slate-100"><td className="px-3 py-2">{partida.competencia}</td><td className="px-3 py-2">{partida.origem}</td><td className="px-3 py-2">{partida.contaDebitoCodigo} — {contaNome(partida.contaDebitoCodigo)}</td><td className="px-3 py-2">{partida.contaCreditoCodigo} — {contaNome(partida.contaCreditoCodigo)}</td><td className="px-3 py-2 text-right tabular-nums">{dinheiro(partida.valor)}</td></tr>)}</tbody>
            </table></div>
            </>
          )}
          {mensagemPrevia && <p role="status" className="text-xs text-indigo-800">{mensagemPrevia}</p>}
          {preLancamentos.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-3"><strong>{preLancamentos.filter((item) => item.status === "pendente_conferencia").length} pendente(s) e {preLancamentos.filter((item) => item.status === "contabilizado").length} contabilizado(s) no workspace desta empresa.</strong>
              {preLancamentos.some((item) => item.status === "pendente_conferencia") && <button type="button" onClick={contabilizarPendentes} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-4 w-4" /> Conferir e contabilizar pendentes</button>}
            </div>
            <p className="mt-2">A contabilização requer confirmação do contador; cada referência de origem só pode gerar um lançamento. A gravação no PostgreSQL é feita pelo autosave do workspace.</p>
          </div>}
        </div>
      </section>

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
