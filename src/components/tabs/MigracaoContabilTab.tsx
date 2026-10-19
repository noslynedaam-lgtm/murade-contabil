import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Database, FileText, FolderOpen, RefreshCw, UploadCloud } from "lucide-react";
import type { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil } from "../../types";
import {
  baixarPacoteMigracaoContabil,
  criarPacoteMigracaoContabil,
  lerArquivosContabeis,
  validarLancamentosContraPlano,
  criarPropostaContabilXml,
  type LeituraMigracaoContabil,
  type OrigemMigracaoContabil,
} from "../../services/migracaoContabilService";

interface Props {
  empresa: EmpresaDados;
  contas: ContaPlano[];
  centrosCusto: CentroCustoContabil[];
  lancamentos: LancamentoContabil[];
  onImportar: (dados: { contas: ContaPlano[]; centrosCusto: CentroCustoContabil[]; lancamentos: LancamentoContabil[] }) => Promise<boolean>;
  onNotificar: (mensagem: string) => void;
}

const origens: Array<{ id: OrigemMigracaoContabil; nome: string; detalhe: string }> = [
  { id: "ALTERDATA", nome: "Alterdata — Contábil", detalhe: "Plano de contas, centros e diário exportados em CSV/TXT" },
  { id: "DOMINIO", nome: "Domínio — Contábil", detalhe: "Plano, centros de custo e lançamentos delimitados" },
  { id: "ATRON", nome: "Atron — Contábil", detalhe: "Arquivos contábeis exportados em CSV/TXT" },
  { id: "CSV", nome: "Planilha / CSV Genérica", detalhe: "Importação por cabeçalho reconhecido ou pacote Murade JSON" },
];

const etapas = ["Sistema de Origem", "Arquivos e Leitura", "Validação e Relatório", "Importação Concluída"];

export const MigracaoContabilTab: React.FC<Props> = ({ empresa, contas, centrosCusto, lancamentos, onImportar, onNotificar }) => {
  const [etapa, setEtapa] = useState(1);
  const [origem, setOrigem] = useState<OrigemMigracaoContabil>("ALTERDATA");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [leitura, setLeitura] = useState<LeituraMigracaoContabil | null>(null);
  const [lendo, setLendo] = useState(false);
  const [persistindo, setPersistindo] = useState(false);
  const [mensagemPersistencia, setMensagemPersistencia] = useState("");
  const [resultado, setResultado] = useState<{ contas: number; centros: number; lancamentos: number } | null>(null);
  const [contasXml, setContasXml] = useState<Record<string, { debito: string; credito: string }>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const errosConflitosExistentes = useMemo(() => {
    if (!leitura) return [];
    const erros: Array<{ arquivo: string; linha: number; motivo: string }> = [];
    const contasPorCodigo = new Map<string, ContaPlano>(contas.map((item) => [item.codigo, item]));
    for (const conta of leitura.contas) {
      const atual = contasPorCodigo.get(conta.codigo);
      const saldoDivergente = atual && ((atual.saldoInicial === undefined) !== (conta.saldoInicial === undefined) || (atual.saldoInicial !== undefined && conta.saldoInicial !== undefined && atual.saldoInicial !== conta.saldoInicial));
      if (atual && (atual.descricao !== conta.descricao || atual.nivel !== conta.nivel || atual.tipo !== conta.tipo || atual.natureza !== conta.natureza || saldoDivergente || atual.saldoInicialCompetencia !== conta.saldoInicialCompetencia)) {
        erros.push({ arquivo: "Plano de contas", linha: 0, motivo: `O código ${conta.codigo} já existe com outros dados. Resolva o conflito antes de importar para não substituir o cadastro atual.` });
      }
    }
    const centrosPorCodigo = new Map<string, CentroCustoContabil>(centrosCusto.map((item) => [item.codigo, item]));
    for (const centro of leitura.centrosCusto) {
      const atual = centrosPorCodigo.get(centro.codigo);
      if (atual && (atual.nome !== centro.nome || atual.descricao !== centro.descricao || atual.centroPaiCodigo !== centro.centroPaiCodigo)) {
        erros.push({ arquivo: "Centros de custo", linha: 0, motivo: `O código ${centro.codigo} já existe com outros dados. Resolva o conflito antes de importar para não substituir o cadastro atual.` });
      }
    }
    return erros;
  }, [leitura, contas, centrosCusto]);
  const errosContasLancamento = useMemo(() => leitura ? validarLancamentosContraPlano(leitura.lancamentos, contas, leitura.contas) : [], [leitura, contas]);
  const lancamentosValidos = useMemo(() => {
    if (!leitura) return [];
    const errosPorLinha = new Set(errosContasLancamento.map((item) => item.linha));
    return leitura.lancamentos.filter((_item, index) => !errosPorLinha.has(index + 1));
  }, [leitura, errosContasLancamento]);
  const contasDisponiveis = useMemo(() => [...new Map([...contas, ...(leitura?.contas || [])].map((conta) => [conta.codigo, conta])).values()].filter((conta) => conta.tipo === "analitica"), [contas, leitura?.contas]);
  const lancamentosXml = useMemo(() => (leitura?.documentosXml || []).flatMap((documento) => {
    const selecao = contasXml[documento.chaveAcesso];
    const debito = contasDisponiveis.find((conta) => conta.codigo === selecao?.debito);
    const credito = contasDisponiveis.find((conta) => conta.codigo === selecao?.credito);
    const proposta = criarPropostaContabilXml(documento, empresa.cnpj, debito, credito);
    if (!proposta || lancamentos.some((item) => item.documentoRef === proposta.documentoRef || item.id === proposta.id)) return [];
    return [proposta];
  }), [leitura?.documentosXml, contasXml, contasDisponiveis, empresa.cnpj, lancamentos]);
  const xmlPendente = Boolean(leitura?.documentosXml.length && lancamentosXml.length !== leitura.documentosXml.length);
  const temErrosBloqueantes = Boolean(leitura && (leitura.erros.length > 0 || errosContasLancamento.length > 0 || errosConflitosExistentes.length > 0 || xmlPendente));
  const totalImportavel = (leitura?.contas.length || 0) + (leitura?.centrosCusto.length || 0) + lancamentosValidos.length + lancamentosXml.length;
  const cnpjAtivo = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  const cnpjPacote = String(leitura?.empresa?.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  const pacoteDeOutraEmpresa = Boolean(cnpjPacote && cnpjAtivo && cnpjPacote !== cnpjAtivo);

  const handleLerArquivos = async () => {
    if (!arquivos.length) return;
    setLendo(true);
    setMensagemPersistencia("");
    setContasXml({});
    try {
      const parsed = await lerArquivosContabeis(arquivos, origem, cnpjAtivo);
      setLeitura(parsed);
      setEtapa(3);
    } catch (error) {
      onNotificar(error instanceof Error ? error.message : "Não foi possível ler os arquivos.");
    } finally {
      setLendo(false);
    }
  };

  const handleImportar = async () => {
    if (!leitura || !totalImportavel || persistindo) return;
    if (pacoteDeOutraEmpresa) { onNotificar("Este arquivo pertence a outro CNPJ. Ative a empresa correspondente antes de importar."); return; }
    const centrosPorCodigo = new Map<string, CentroCustoContabil>(leitura.centrosCusto.map((centro) => [centro.codigo, centro]));
    setPersistindo(true);
    setMensagemPersistencia("Gravando os dados no PostgreSQL e aguardando confirmação do servidor…");
    try {
      const confirmado = await onImportar({
        contas: leitura.contas,
        centrosCusto: leitura.centrosCusto,
        lancamentos: [...lancamentosValidos, ...lancamentosXml].map((item) => {
          const centro = item.centroCustoCodigo ? centrosPorCodigo.get(item.centroCustoCodigo) : undefined;
          return {
            ...(centro ? { ...item, centroCustoNome: centro.nome } : item),
            origem: "Manual",
            sistemaMigracao: origem,
            classificacaoDeclaradaArquivo: item.documentoRef?.startsWith("XML-NFE:") ? `XML NF-e · ${item.origem}` : item.origem,
            statusManual: "pendente_aprovacao",
          };
        }),
      });
      if (!confirmado) {
        setMensagemPersistencia("O banco não confirmou a gravação. Os dados não foram marcados como concluídos; revise os avisos e tente novamente após corrigir a pendência.");
        return;
      }
      setResultado({ contas: leitura.contas.length, centros: leitura.centrosCusto.length, lancamentos: lancamentosValidos.length + lancamentosXml.length });
      setMensagemPersistencia("");
      setEtapa(4);
      onNotificar(`A gravação dos dados contábeis foi confirmada no PostgreSQL para esta empresa.`);
    } catch (error) {
      setMensagemPersistencia(error instanceof Error ? error.message : "O banco não confirmou a gravação. A migração permanece pendente.");
    } finally {
      setPersistindo(false);
    }
  };

  const reiniciar = () => { setEtapa(1); setArquivos([]); setLeitura(null); setContasXml({}); setResultado(null); setMensagemPersistencia(""); };
  const baixar = () => baixarPacoteMigracaoContabil(criarPacoteMigracaoContabil(empresa, contas, centrosCusto, lancamentos));
  const empresaPronta = Boolean(empresa.cnpj && empresa.razaoSocial);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black text-[#0F2B5B]">📦 MURADE CONTÁBIL — MIGRAÇÃO DE DADOS</h1>
            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">4 ETAPAS</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Transfira plano de contas, centros de custo e lançamentos para {empresa.razaoSocial || "a empresa ativa"}.</p>
        </div>
        <button type="button" onClick={baixar} disabled={!empresaPronta} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50" title={!empresaPronta ? "Cadastre uma empresa antes de exportar" : "Baixar dados contábeis em arquivo Murade JSON"}>
          <FolderOpen size={15} /> Exportar arquivo Murade
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs md:grid-cols-4">
        {etapas.map((nome, index) => {
          const atual = etapa === index + 1;
          const concluida = etapa > index + 1;
          return <div key={nome} className={`flex items-center gap-2 rounded-lg p-2 ${atual ? "border border-blue-200 bg-blue-50 font-bold text-blue-950" : concluida ? "text-emerald-700" : "text-slate-500"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${concluida ? "bg-emerald-600 text-white" : atual ? "bg-[#0F2B5B] text-white" : "bg-slate-200 text-slate-600"}`}>{concluida ? "✓" : index + 1}</span>
            <span>{index + 1}. {nome}</span>
          </div>;
        })}
      </div>

      {etapa === 1 && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">1. Sistema de Origem</h2><p className="mt-1 text-xs text-slate-500">Escolha de onde vêm os arquivos contábeis.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {origens.map((item) => <button key={item.id} type="button" onClick={() => setOrigem(item.id)} className={`min-h-32 rounded-xl border-2 p-4 text-left transition ${origem === item.id ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500/10" : "border-slate-200 hover:border-slate-300"}`}>
            <span className="text-2xl">{item.id === "ALTERDATA" ? "🏢" : item.id === "DOMINIO" ? "💼" : item.id === "ATRON" ? "📊" : "📑"}</span>
            <span className="mt-2 block text-sm font-bold text-slate-800">{item.nome}</span>
            <span className="mt-1 block text-xs text-slate-500">{item.detalhe}</span>
          </button>)}
        </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">A leitura reconhece cabeçalhos comuns de CSV/TXT. Também lê lançamentos TXT Alterdata nos modelos 1 e 2. Para plano de contas e centros de custo, exporte como arquivo delimitado com cabeçalho. Os demais layouts proprietários variam por versão e precisam ser exportados para CSV/TXT ou convertidos para pacote Murade.</div>
        <div className="flex justify-end"><button type="button" onClick={() => setEtapa(2)} className="inline-flex items-center gap-2 rounded-lg bg-[#0F2B5B] px-4 py-2 text-xs font-bold text-white hover:bg-blue-900">Continuar <ArrowRight size={15} /></button></div>
      </section>}

      {etapa === 2 && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">2. Arquivos e Leitura</h2><p className="mt-1 text-xs text-slate-500">Selecione CSV/TXT delimitado, XML de NF-e ou pacote JSON Murade. CSV/TXT aceita ponto e vírgula, vírgula, tabulação ou barra vertical. Para XML, escolha explicitamente as contas analíticas; notas com tributos destacados ou campos fiscais ausentes ficam pendentes para classificação detalhada.</p></div>
        <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-6 text-center">
          <UploadCloud className="mx-auto text-blue-700" size={30} />
          <p className="mt-2 text-sm font-bold text-slate-800">Arquivos do {origens.find((item) => item.id === origem)?.nome}</p>
          <p className="mt-1 text-xs text-slate-500">Use arquivos de plano de contas, centro de custo e diário/livro razão. Para outros sistemas, exporte CSV/TXT delimitado com cabeçalho reconhecível.</p>
          <input ref={inputRef} type="file" multiple accept=".csv,.txt,.xml,.json,text/csv,text/plain,application/xml,application/json" className="hidden" onChange={(event) => setArquivos(Array.from(event.target.files || []))} />
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 rounded-lg border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">Escolher arquivos</button>
        </div>
        {arquivos.length > 0 && <div className="space-y-2 rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold text-slate-700">Selecionados ({arquivos.length})</h3>{arquivos.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 text-xs text-slate-600"><FileText size={14} /> {file.name} <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span></div>)}</div>}
        {!empresaPronta && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertCircle size={16} className="shrink-0" /> Cadastre e selecione a empresa antes da importação, para os lançamentos ficarem vinculados à empresa correta.</div>}
        <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setEtapa(1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"><ArrowLeft size={15} /> Voltar</button><button type="button" disabled={!arquivos.length || !empresaPronta || lendo} onClick={() => void handleLerArquivos()} className="inline-flex items-center gap-2 rounded-lg bg-[#0F2B5B] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{lendo ? <><RefreshCw size={15} className="animate-spin" /> Lendo arquivos...</> : <>Ler e validar <ArrowRight size={15} /></>}</button></div>
      </section>}

      {etapa === 3 && leitura && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">3. Validação e Relatório</h2><p className="mt-1 text-xs text-slate-500">Confira os registros antes de gravar. Conta ausente ou sintética bloqueia a importação; nenhuma linha inválida é descartada silenciosamente.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{leitura.arquivosLidos.length} arquivo(s) lido(s)</span></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><Database size={17} className="text-blue-700" /><strong className="mt-2 block text-xl text-blue-900">{leitura.contas.length}</strong><span className="text-xs text-blue-800">Contas no plano</span></div><div className="rounded-lg border border-purple-100 bg-purple-50 p-3"><Database size={17} className="text-purple-700" /><strong className="mt-2 block text-xl text-purple-900">{leitura.centrosCusto.length}</strong><span className="text-xs text-purple-800">Centros de custo</span></div><div className="rounded-lg border border-amber-100 bg-amber-50 p-3"><Database size={17} className="text-amber-700" /><strong className="mt-2 block text-xl text-amber-900">{lancamentosValidos.length + lancamentosXml.length}</strong><span className="text-xs text-amber-800">Lançamentos para aprovação</span></div></div>
        {lancamentosValidos.length > 0 && <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>Importação não aprova lançamentos.</strong> Cada lançamento será salvo como proposta pendente para conferência do contador. O sistema registra que veio da migração e a classificação declarada no arquivo, mas não importa nem inventa aprovações ou auditorias históricas. Enquanto pendente, não entra nos livros nem no balancete.</div>}
        {leitura.contas.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Nível</th><th className="p-2">Tipo</th><th className="p-2">Natureza</th></tr></thead><tbody>{leitura.contas.slice(0, 6).map((item) => <tr key={item.codigo} className="border-t border-slate-100"><td className="p-2 font-mono">{item.codigo}</td><td className="p-2">{item.descricao}</td><td className="p-2">{item.nivel}</td><td className="p-2">{item.tipo}</td><td className="p-2">{item.natureza}</td></tr>)}</tbody></table></div>}
        {leitura.documentosXml.length > 0 && <div className="space-y-2">
          <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>Prévia → proposta → aprovação.</strong> XML local não comprova autorização da SEFAZ. Para importar uma proposta resumida, indique duas contas analíticas. Só é habilitada quando a chave, data, total e campos de tributos necessários estão presentes e os tributos destacados são explicitamente zero. Se houver tributos, campo ausente ou outro componente fiscal, a nota permanece pendente de classificação detalhada; não estimamos partidas. Toda proposta importada fica pendente e só entra nos livros após aprovação do contador.</div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Arquivo / emitente</th><th className="p-2">Chave e data</th><th className="p-2">CNPJ emitente / destinatário</th><th className="p-2">Produtos</th><th className="p-2">Base ICMS / ST</th><th className="p-2">ICMS / desonerado / ST</th><th className="p-2">FCP / ST / retido</th><th className="p-2">DIFAL destino / origem</th><th className="p-2">II</th><th className="p-2">IPI / devolvido</th><th className="p-2">PIS / ST</th><th className="p-2">COFINS / ST</th><th className="p-2">Total NF-e</th><th className="p-2">Itens</th><th className="p-2">Conta débito</th><th className="p-2">Conta crédito</th></tr></thead><tbody>{leitura.documentosXml.map((item) => { const moeda = (valor: string) => valor ? `R$ ${valor}` : 'Não informado'; const selecao = contasXml[item.chaveAcesso] || { debito: "", credito: "" }; const tributos = [item.valorIcms, item.valorIcmsDesonerado, item.valorIcmsSt, item.valorBaseIcmsSt, item.valorFcp, item.valorFcpSt, item.valorFcpStRetido, item.valorDifalDestino, item.valorFcpDestino, item.valorDifalOrigem, item.valorPisSt, item.valorCofinsSt, item.valorIi, item.valorIpi, item.valorIpiDevolvido, item.valorPis, item.valorCofins]; const camposCompletos = tributos.every((valor) => valor.trim() !== "" && Number.isFinite(Number(valor))); const impostosZerados = camposCompletos && tributos.every((valor) => Number(valor) === 0); const duplicado = lancamentos.some((lancamento) => lancamento.documentoRef === `XML-NFE:${item.chaveAcesso}` || lancamento.id === `mig-nfe-${item.chaveAcesso}`); const proposta = criarPropostaContabilXml(item, empresa.cnpj, contasDisponiveis.find((conta) => conta.codigo === selecao.debito), contasDisponiveis.find((conta) => conta.codigo === selecao.credito)); const situacao = duplicado ? "Já importada" : !camposCompletos ? "Pendente: tributos ausentes" : !impostosZerados ? "Pendente: classificação dos tributos" : proposta ? "Proposta resumida pronta" : "Escolha duas contas analíticas"; return <tr key={`${item.arquivo}-${item.chaveAcesso}`} className="border-t border-slate-100"><td className="p-2"><span className="block font-semibold">{item.arquivo}</span><span>{item.emitente || 'Emitente não informado'}</span></td><td className="p-2"><span className="block font-mono">{item.chaveAcesso || 'Não informada'}</span>{item.dataEmissao || 'Data não informada'}</td><td className="p-2 font-mono">{item.cnpjEmitente || '—'} / {item.cnpjDestinatario || '—'}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorProdutos)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorBaseIcms)} / {moeda(item.valorBaseIcmsSt)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorIcms)} / {moeda(item.valorIcmsDesonerado)} / {moeda(item.valorIcmsSt)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorFcp)} / {moeda(item.valorFcpSt)} / {moeda(item.valorFcpStRetido)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorDifalDestino)} / {moeda(item.valorDifalOrigem)} · FCP {moeda(item.valorFcpDestino)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorIi)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorIpi)} / {moeda(item.valorIpiDevolvido)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorPis)} / {moeda(item.valorPisSt)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorCofins)} / {moeda(item.valorCofinsSt)}</td><td className="p-2 whitespace-nowrap">{moeda(item.valorTotal)}</td><td className="p-2">{item.itens}</td><td className="p-2"><select aria-label={`Conta de débito para NF-e ${item.chaveAcesso}`} value={selecao.debito} onChange={(event) => setContasXml((prev) => ({ ...prev, [item.chaveAcesso]: { ...selecao, debito: event.target.value } }))} className="min-w-48 rounded border border-slate-300 p-1"><option value="">Selecionar conta</option>{contasDisponiveis.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {conta.descricao}</option>)}</select></td><td className="p-2"><select aria-label={`Conta de crédito para NF-e ${item.chaveAcesso}`} value={selecao.credito} onChange={(event) => setContasXml((prev) => ({ ...prev, [item.chaveAcesso]: { ...selecao, credito: event.target.value } }))} className="min-w-48 rounded border border-slate-300 p-1"><option value="">Selecionar conta</option>{contasDisponiveis.map((conta) => <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {conta.descricao}</option>)}</select><span className="mt-1 block text-[10px] font-semibold text-amber-800">{situacao}</span></td></tr>; })}</tbody></table></div>
        </div>}
        {pacoteDeOutraEmpresa && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">Este pacote foi exportado para CNPJ {leitura.empresa?.cnpj}; a empresa ativa é {empresa.cnpj}. Selecione a empresa do pacote antes de importar para evitar misturar dados.</div>}
        {leitura.centrosCusto.length > 0 && <p className="text-xs text-slate-600">Centros de custo: {leitura.centrosCusto.slice(0, 8).map((item) => `${item.codigo} — ${item.nome}`).join(" · ")}</p>}
        {(leitura.lancamentos.length > 0 || lancamentosXml.length > 0) && (() => { const item = leitura.lancamentos[0] || lancamentosXml[0]; return <p className="text-xs text-slate-600">Amostra de proposta: {item.data} · débito {item.contaDebitoCodigo} · crédito {item.contaCreditoCodigo} · R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>; })()}
        {(leitura.erros.length > 0 || errosContasLancamento.length > 0 || errosConflitosExistentes.length > 0) && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><div className="flex items-center gap-2 font-bold"><AlertCircle size={15} /> {leitura.erros.length + errosContasLancamento.length + errosConflitosExistentes.length} aviso(s) de leitura/validação</div><ul className="max-h-36 list-disc space-y-1 overflow-auto pl-5">{[...leitura.erros, ...errosContasLancamento, ...errosConflitosExistentes].slice(0, 30).map((item, index) => <li key={`${item.arquivo}-${item.linha}-${index}`}>{item.arquivo}{item.linha ? `, linha ${item.linha}` : ""}: {item.motivo}</li>)}</ul></div>}
        {temErrosBloqueantes && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">Importação bloqueada: corrija os avisos de leitura, contas e conflitos de cadastro antes de gravar. O arquivo original não é alterado.</div>}
        {xmlPendente && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">Há NF-e sem condições para gerar proposta contábil. Confira a situação indicada em cada linha: campos tributários ausentes, tributos não zerados, duplicidade ou contas ainda não selecionadas. Nenhuma dessas notas será importada parcialmente.</div>}
        {leitura.avisos.length > 0 && <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">{leitura.avisos.map((aviso) => <p key={aviso}>• {aviso}</p>)}</div>}
        {totalImportavel === 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{leitura.documentosXml.length ? 'As NF-e foram lidas, mas nenhuma proposta está pronta. Complete as contas e resolva as pendências fiscais indicadas antes de confirmar.' : 'Nenhum registro válido para importar. Corrija o cabeçalho/dados e selecione os arquivos novamente.'}</div>}
        {mensagemPersistencia && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950">{mensagemPersistencia}</div>}
        <div className="flex flex-wrap justify-between gap-2"><button type="button" disabled={persistindo} onClick={() => setEtapa(2)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><ArrowLeft size={15} /> Voltar aos arquivos</button><button type="button" disabled={!totalImportavel || pacoteDeOutraEmpresa || persistindo || temErrosBloqueantes} onClick={() => void handleImportar()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{persistindo ? <><RefreshCw size={15} className="animate-spin" /> Gravando no PostgreSQL…</> : <>Importar {totalImportavel} registro(s) <ArrowRight size={15} /></>}</button></div>
      </section>}

      {etapa === 4 && resultado && <section className="space-y-4 rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm"><CheckCircle2 size={44} className="mx-auto text-emerald-600" /><h2 className="text-lg font-black text-emerald-900">Dados gravados no banco</h2><p className="text-sm text-slate-600">O PostgreSQL confirmou a gravação para {empresa.razaoSocial}. Isso confirma a persistência, não a aprovação contábil dos lançamentos.</p><div className="mx-auto grid max-w-xl grid-cols-3 gap-3 text-left"><div className="rounded-lg bg-blue-50 p-3"><strong className="block text-xl text-blue-900">{resultado.contas}</strong><span className="text-xs text-blue-800">Contas no arquivo</span></div><div className="rounded-lg bg-purple-50 p-3"><strong className="block text-xl text-purple-900">{resultado.centros}</strong><span className="text-xs text-purple-800">Centros no arquivo</span></div><div className="rounded-lg bg-amber-50 p-3"><strong className="block text-xl text-amber-900">{resultado.lancamentos}</strong><span className="text-xs text-amber-800">Lançamentos no arquivo</span></div></div><p className="text-xs text-slate-500">Novos lançamentos importados ficam identificados como propostas pendentes; registros que já existiam são preservados. Nenhuma aprovação histórica é presumida, e propostas pendentes não entram nos livros nem no balancete.</p><div className="flex justify-center gap-2"><button type="button" onClick={reiniciar} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">Nova migração</button><button type="button" onClick={() => setEtapa(1)} className="rounded-lg bg-[#0F2B5B] px-4 py-2 text-xs font-bold text-white">Voltar ao início</button></div></section>}
    </div>
  );
};
