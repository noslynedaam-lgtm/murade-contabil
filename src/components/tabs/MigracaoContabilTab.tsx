import React, { useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Database, FileText, FolderOpen, RefreshCw, UploadCloud } from "lucide-react";
import type { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil } from "../../types";
import {
  baixarPacoteMigracaoContabil,
  criarPacoteMigracaoContabil,
  lerArquivosContabeis,
  validarLancamentosContraPlano,
  type LeituraMigracaoContabil,
  type OrigemMigracaoContabil,
} from "../../services/migracaoContabilService";

interface Props {
  empresa: EmpresaDados;
  contas: ContaPlano[];
  centrosCusto: CentroCustoContabil[];
  lancamentos: LancamentoContabil[];
  onImportar: (dados: { contas: ContaPlano[]; centrosCusto: CentroCustoContabil[]; lancamentos: LancamentoContabil[] }) => void;
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
  const [resultado, setResultado] = useState<{ contas: number; centros: number; lancamentos: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const codigos = useMemo(() => new Set([...contas, ...(leitura?.contas || [])].map((item) => item.codigo)), [contas, leitura?.contas]);
  const errosContasLancamento = useMemo(() => leitura ? validarLancamentosContraPlano(leitura.lancamentos, contas, leitura.contas) : [], [leitura, contas]);
  const lancamentosValidos = useMemo(() => leitura?.lancamentos.filter((item) => codigos.has(item.contaDebitoCodigo) && codigos.has(item.contaCreditoCodigo)) || [], [leitura, codigos]);
  const totalImportavel = (leitura?.contas.length || 0) + (leitura?.centrosCusto.length || 0) + lancamentosValidos.length;
  const cnpjAtivo = String(empresa.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  const cnpjPacote = String(leitura?.empresa?.cnpj || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  const pacoteDeOutraEmpresa = Boolean(cnpjPacote && cnpjAtivo && cnpjPacote !== cnpjAtivo);

  const handleLerArquivos = async () => {
    if (!arquivos.length) return;
    setLendo(true);
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

  const handleImportar = () => {
    if (!leitura || !totalImportavel) return;
    if (pacoteDeOutraEmpresa) { onNotificar("Este arquivo pertence a outro CNPJ. Ative a empresa correspondente antes de importar."); return; }
    const centrosPorCodigo = new Map<string, CentroCustoContabil>(leitura.centrosCusto.map((centro) => [centro.codigo, centro]));
    onImportar({
      contas: leitura.contas,
      centrosCusto: leitura.centrosCusto,
      lancamentos: lancamentosValidos.map((item) => {
        const centro = item.centroCustoCodigo ? centrosPorCodigo.get(item.centroCustoCodigo) : undefined;
        return centro ? { ...item, centroCustoNome: centro.nome } : item;
      }),
    });
    setResultado({ contas: leitura.contas.length, centros: leitura.centrosCusto.length, lancamentos: lancamentosValidos.length });
    setEtapa(4);
    onNotificar(`${totalImportavel} registro(s) contábeis enviados para o cadastro desta empresa.`);
  };

  const reiniciar = () => { setEtapa(1); setArquivos([]); setLeitura(null); setResultado(null); };
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
        <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">2. Arquivos e Leitura</h2><p className="mt-1 text-xs text-slate-500">Selecione um ou mais arquivos. CSV/TXT pode ser separado por ponto e vírgula, vírgula, tabulação ou barra vertical. Também aceitamos o pacote JSON exportado pelo Murade Contábil.</p></div>
        <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-6 text-center">
          <UploadCloud className="mx-auto text-blue-700" size={30} />
          <p className="mt-2 text-sm font-bold text-slate-800">Arquivos do {origens.find((item) => item.id === origem)?.nome}</p>
          <p className="mt-1 text-xs text-slate-500">Use arquivos de plano de contas, centro de custo e diário/livro razão. Para outros sistemas, exporte CSV/TXT delimitado com cabeçalho reconhecível.</p>
          <input ref={inputRef} type="file" multiple accept=".csv,.txt,.json,text/csv,text/plain,application/json" className="hidden" onChange={(event) => setArquivos(Array.from(event.target.files || []))} />
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 rounded-lg border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">Escolher arquivos</button>
        </div>
        {arquivos.length > 0 && <div className="space-y-2 rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold text-slate-700">Selecionados ({arquivos.length})</h3>{arquivos.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 text-xs text-slate-600"><FileText size={14} /> {file.name} <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span></div>)}</div>}
        {!empresaPronta && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertCircle size={16} className="shrink-0" /> Cadastre e selecione a empresa antes da importação, para os lançamentos ficarem vinculados à empresa correta.</div>}
        <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setEtapa(1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"><ArrowLeft size={15} /> Voltar</button><button type="button" disabled={!arquivos.length || !empresaPronta || lendo} onClick={() => void handleLerArquivos()} className="inline-flex items-center gap-2 rounded-lg bg-[#0F2B5B] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{lendo ? <><RefreshCw size={15} className="animate-spin" /> Lendo arquivos...</> : <>Ler e validar <ArrowRight size={15} /></>}</button></div>
      </section>}

      {etapa === 3 && leitura && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">3. Validação e Relatório</h2><p className="mt-1 text-xs text-slate-500">Confira a amostra antes de gravar. Lançamentos com contas ausentes no plano são ignorados.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{leitura.arquivosLidos.length} arquivo(s) lido(s)</span></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><Database size={17} className="text-blue-700" /><strong className="mt-2 block text-xl text-blue-900">{leitura.contas.length}</strong><span className="text-xs text-blue-800">Contas no plano</span></div><div className="rounded-lg border border-purple-100 bg-purple-50 p-3"><Database size={17} className="text-purple-700" /><strong className="mt-2 block text-xl text-purple-900">{leitura.centrosCusto.length}</strong><span className="text-xs text-purple-800">Centros de custo</span></div><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"><Database size={17} className="text-emerald-700" /><strong className="mt-2 block text-xl text-emerald-900">{lancamentosValidos.length}</strong><span className="text-xs text-emerald-800">Lançamentos válidos</span></div></div>
        {leitura.contas.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-100"><tr><th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Nível</th><th className="p-2">Tipo</th><th className="p-2">Natureza</th></tr></thead><tbody>{leitura.contas.slice(0, 6).map((item) => <tr key={item.codigo} className="border-t border-slate-100"><td className="p-2 font-mono">{item.codigo}</td><td className="p-2">{item.descricao}</td><td className="p-2">{item.nivel}</td><td className="p-2">{item.tipo}</td><td className="p-2">{item.natureza}</td></tr>)}</tbody></table></div>}
        {pacoteDeOutraEmpresa && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">Este pacote foi exportado para CNPJ {leitura.empresa?.cnpj}; a empresa ativa é {empresa.cnpj}. Selecione a empresa do pacote antes de importar para evitar misturar dados.</div>}
        {leitura.centrosCusto.length > 0 && <p className="text-xs text-slate-600">Centros de custo: {leitura.centrosCusto.slice(0, 8).map((item) => `${item.codigo} — ${item.nome}`).join(" · ")}</p>}
        {leitura.lancamentos.length > 0 && <p className="text-xs text-slate-600">Amostra de lançamento: {leitura.lancamentos[0].data} · débito {leitura.lancamentos[0].contaDebitoCodigo} · crédito {leitura.lancamentos[0].contaCreditoCodigo} · R$ {leitura.lancamentos[0].valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
        {(leitura.erros.length > 0 || errosContasLancamento.length > 0) && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><div className="flex items-center gap-2 font-bold"><AlertCircle size={15} /> {leitura.erros.length + errosContasLancamento.length} aviso(s) de leitura/validação</div><ul className="max-h-36 list-disc space-y-1 overflow-auto pl-5">{[...leitura.erros, ...errosContasLancamento].slice(0, 30).map((item, index) => <li key={`${item.arquivo}-${item.linha}-${index}`}>{item.arquivo}{item.linha ? `, linha ${item.linha}` : ""}: {item.motivo}</li>)}</ul></div>}
        {leitura.avisos.length > 0 && <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">{leitura.avisos.map((aviso) => <p key={aviso}>• {aviso}</p>)}</div>}
        {totalImportavel === 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">Nenhum registro válido para importar. Corrija o cabeçalho/dados e selecione os arquivos novamente.</div>}
        <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setEtapa(2)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"><ArrowLeft size={15} /> Voltar aos arquivos</button><button type="button" disabled={!totalImportavel || pacoteDeOutraEmpresa} onClick={handleImportar} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Importar {totalImportavel} registro(s) <ArrowRight size={15} /></button></div>
      </section>}

      {etapa === 4 && resultado && <section className="space-y-4 rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm"><CheckCircle2 size={44} className="mx-auto text-emerald-600" /><h2 className="text-lg font-black text-emerald-900">Importação concluída</h2><p className="text-sm text-slate-600">Os dados foram incorporados ao Contábil de {empresa.razaoSocial}.</p><div className="mx-auto grid max-w-xl grid-cols-3 gap-3 text-left"><div className="rounded-lg bg-blue-50 p-3"><strong className="block text-xl text-blue-900">{resultado.contas}</strong><span className="text-xs text-blue-800">Contas</span></div><div className="rounded-lg bg-purple-50 p-3"><strong className="block text-xl text-purple-900">{resultado.centros}</strong><span className="text-xs text-purple-800">Centros</span></div><div className="rounded-lg bg-emerald-50 p-3"><strong className="block text-xl text-emerald-900">{resultado.lancamentos}</strong><span className="text-xs text-emerald-800">Lançamentos</span></div></div><div className="flex justify-center gap-2"><button type="button" onClick={reiniciar} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">Nova migração</button><button type="button" onClick={() => setEtapa(1)} className="rounded-lg bg-[#0F2B5B] px-4 py-2 text-xs font-bold text-white">Voltar ao início</button></div></section>}
    </div>
  );
};
