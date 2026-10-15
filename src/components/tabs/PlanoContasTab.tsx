import React, { useState, useMemo } from "react";
import { ContaPlano } from "../../types";
import {
  ListTree,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Layers,
  ChevronRight,
  Info,
  Hash,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { IbsCbsReformaCard } from "../IbsCbsReformaCard";
import {
  compararCodigosContabeis,
  calcularProximoCodigoSequencial,
  validarSequenciaManual,
  extrairCodigoPai,
  ordenarContasPorSequenciaNumerica,
} from "../../utils/planoContasUtils";

interface PlanoContasTabProps {
  contas: ContaPlano[];
  onAdicionarConta: (conta: ContaPlano) => void;
}

export const PlanoContasTab: React.FC<PlanoContasTabProps> = ({ contas, onAdicionarConta }) => {
  const [busca, setBusca] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [modalNovaConta, setModalNovaConta] = useState(false);

  // Lista de contas sempre ordenada em estrita sequência numérica
  const contasOrdenadas = useMemo(() => {
    return ordenarContasPorSequenciaNumerica(contas);
  }, [contas]);

  // Contas sintéticas disponíveis para servirem de "Conta Pai"
  const contasSinteticas = useMemo(() => {
    return contasOrdenadas.filter((c) => c.tipo === "sintetica" && c.nivel < 5);
  }, [contasOrdenadas]);

  // Estado do formulário de nova conta manual
  const [contaPaiSelecionada, setContaPaiSelecionada] = useState<string>("1.1");
  const [travarSequencia, setTravarSequencia] = useState(true);
  const [novoCodigo, setNovoCodigo] = useState("1.1.6");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoNivel, setNovoNivel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [novoTipo, setNovoTipo] = useState<"sintetica" | "analitica">("analitica");
  const [novaNatureza, setNovaNatureza] = useState<"D" | "C">("D");
  const [erroFeedback, setErroFeedback] = useState<string | null>(null);

  // Calcular próximo código sequencial para a conta pai atual
  const infoSequencia = useMemo(() => {
    return calcularProximoCodigoSequencial(contas, contaPaiSelecionada);
  }, [contas, contaPaiSelecionada]);

  // Validação em tempo real do código digitado
  const validacao = useMemo(() => {
    return validarSequenciaManual(contas, novoCodigo, contaPaiSelecionada);
  }, [contas, novoCodigo, contaPaiSelecionada]);

  // Atualiza os campos ao mudar a conta pai
  const handleMudarContaPai = (codigoPai: string) => {
    setContaPaiSelecionada(codigoPai);
    const pai = contas.find((c) => c.codigo === codigoPai);
    const info = calcularProximoCodigoSequencial(contas, codigoPai);

    setNovoCodigo(info.proximoCodigo);
    setNovoNivel(Math.min(5, (pai?.nivel || 1) + 1) as 1 | 2 | 3 | 4 | 5);
    setNovoTipo("analitica");

    // Determina a natureza a partir do grupo raiz
    const grupoRaiz = codigoPai.split(".")[0];
    if (grupoRaiz === "1" || grupoRaiz === "5") {
      setNovaNatureza("D");
    } else {
      setNovaNatureza("C");
    }
  };

  // Abrir modal configurado diretamente para uma conta pai específica
  const handleAbrirParaContaPai = (codigoPai: string) => {
    handleMudarContaPai(codigoPai);
    setNovaDescricao("");
    setErroFeedback(null);
    setModalNovaConta(true);
  };

  const handleAbrirModalGeral = () => {
    // Escolhe 1.1 por padrão ou a primeira sintética
    handleMudarContaPai(contaPaiSelecionada || "1.1");
    setNovaDescricao("");
    setErroFeedback(null);
    setModalNovaConta(true);
  };

  const handleAplicarProximaSequencia = () => {
    if (infoSequencia.proximoCodigo) {
      setNovoCodigo(infoSequencia.proximoCodigo);
      setTravarSequencia(true);
    }
  };

  const handleSalvarConta = (e: React.FormEvent) => {
    e.preventDefault();
    setErroFeedback(null);

    if (!novoCodigo.trim()) {
      setErroFeedback("Informe o código contábil.");
      return;
    }

    if (!novaDescricao.trim()) {
      setErroFeedback("Informe a descrição ou nome da conta contábil.");
      return;
    }

    // Validação rígida de sequência numérica
    const checagem = validarSequenciaManual(contas, novoCodigo, contaPaiSelecionada);
    if (!checagem.valido && checagem.tipo === "erro") {
      setErroFeedback(checagem.mensagem);
      return;
    }

    onAdicionarConta({
      codigo: novoCodigo.trim(),
      descricao: novaDescricao.trim(),
      nivel: novoNivel,
      tipo: novoTipo,
      natureza: novaNatureza,
    });

    setModalNovaConta(false);
  };

  const contasFiltradas = contasOrdenadas.filter((c) => {
    const matchBusca =
      c.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      c.descricao.toLowerCase().includes(busca.toLowerCase());
    if (filtroGrupo === "todos") return matchBusca;
    return matchBusca && c.codigo.startsWith(filtroGrupo);
  });
  const codigosConta = new Set(contas.map((conta) => conta.codigo));
  const paisAusentes = [...new Set(contas.flatMap((conta) => {
    const partes = conta.codigo.split(".");
    if (partes.length <= 1) return [];
    return partes.slice(1).flatMap((_, index) => {
      const codigoSuperior = partes.slice(0, index + 1).join(".");
      return codigosConta.has(codigoSuperior) ? [] : [codigoSuperior];
    });
  }))].sort();

  return (
    <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
              <Hash className="w-3.5 h-3.5 text-blue-700" />
              <span>SEQUÊNCIA NUMÉRICA HIERÁRQUICA ATIVA</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Modelo padrão importado</span>
            </span>
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
            <ListTree className="w-5 h-5 text-blue-600" />
            <span>📑 PLANO DE CONTAS — MODELO DA EMPRESA</span>
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Modelo importado do arquivo fornecido, com cinco níveis. A numeração preserva a largura dos códigos por nível.
          </p>
        </div>

        <button
          onClick={handleAbrirModalGeral}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Nova Conta na Sequência</span>
        </button>
      </div>

      {paisAusentes.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <strong>Revisão da estrutura do modelo:</strong> faltam contas sintéticas superiores para os códigos {paisAusentes.join(", ")}. As contas originais foram preservadas; confirme esses grupos antes de usá-las em lançamentos.
        </div>
      )}

      {/* Banner Informativo da Regra de Sequência Numérica */}
      <div className="mb-4 p-3.5 rounded-xl bg-[#EEF4F9] border border-[#CBD5E1] text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 font-bold text-[11px]">
            #
          </div>
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>Regra de Sequência Numérica no Plano de Contas</span>
              <span className="text-[10px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                Ex: 1.1.1 → 1.1.2 → 1.1.6
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Toda nova conta manual é vinculada à sua respectiva conta sintética e recebe o <strong>próximo número consecutivo disponível</strong>, garantindo que contas irmãs fiquem agrupadas na mesma sequência numérica.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleAbrirParaContaPai("1.1")}
            className="text-[11px] font-semibold text-blue-700 bg-white border border-blue-300 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span>+ Adicionar em 1.1 (Ativo Circulante)</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            placeholder="Buscar por código numérico (ex: 1.1.2) ou descrição da conta..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div>
          <select
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600"
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo(e.target.value)}
          >
            <option value="todos">Todos os grupos</option>
            {contasOrdenadas.filter((conta) => conta.nivel === 1).map((conta) => (
              <option key={conta.codigo} value={conta.codigo}>{conta.codigo} — {conta.descricao}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Árvore do Plano de Contas com Indicação de Sequência */}
      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto divide-y divide-slate-100">
        {contasFiltradas.map((conta) => {
          const isNivel1 = conta.nivel === 1;
          const isNivel2 = conta.nivel === 2;
          const isAnalitica = conta.tipo === "analitica";

          // Próximo código se for conta sintética
          const proximoCodSintetica = !isAnalitica
            ? calcularProximoCodigoSequencial(contas, conta.codigo).proximoCodigo
            : null;

          return (
            <div
              key={conta.codigo}
              className={`flex items-center justify-between px-3 py-2 text-xs transition group ${
                isNivel1
                  ? "bg-slate-200/90 font-bold text-slate-900 sticky top-0 z-10"
                  : isNivel2
                  ? "bg-slate-50/90 font-semibold text-slate-800 pl-6 border-l-2 border-l-blue-400"
                  : "hover:bg-blue-50/40 text-slate-700 pl-10"
              }`}
              style={conta.nivel >= 3 ? { paddingLeft: `${Math.min(5, conta.nivel) * 0.8}rem` } : undefined}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-slate-900 shrink-0">{conta.codigo}</span>
                <span className="text-slate-400">—</span>
                <span className={`truncate ${isNivel1 ? "tracking-wide uppercase font-black" : ""}`}>
                  {conta.descricao}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Botão de atalho para adicionar conta filha na sequência */}
                {!isAnalitica && proximoCodSintetica && (
                  <button
                    onClick={() => handleAbrirParaContaPai(conta.codigo)}
                    className="opacity-80 group-hover:opacity-100 text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1"
                    title={`Adicionar nova conta filha na sequência numérica (${proximoCodSintetica})`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Seq. ({proximoCodSintetica})</span>
                  </button>
                )}

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm ${
                    conta.natureza === "D"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {conta.natureza === "D" ? "Devedora" : "Credora"}
                </span>

                <span className="text-[10px] text-slate-500 font-medium hidden sm:inline w-16 text-right">
                  {isAnalitica ? "Analítica" : "Sintética"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>
          Total: <strong>{contasFiltradas.length} contas</strong> em sequência numérica hierárquica contínua
        </span>
        <span className="text-slate-400 font-mono text-[11px]">
          Padrão SPED Contábil ECD • Partidas Dobradas
        </span>
      </div>

      {/* 🇧🇷 MÓDULO IBS / CBS — REFORMA TRIBUTÁRIA (Lei Complementar nº 200/2024) */}
      <IbsCbsReformaCard />

      {/* Modal Nova Conta Manual com Sequência Numérica */}
      {modalNovaConta && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-blue-600" />
                  <span>Lançamento Manual no Plano de Contas</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Garante que o código siga a sequência numérica da conta pai selecionada.
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                Sequência Numérica
              </span>
            </div>

            <form onSubmit={handleSalvarConta} className="space-y-3.5">
              {/* Seleção da Conta Pai */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  1. Selecionar Conta Pai / Grupo Sintético:
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                  value={contaPaiSelecionada}
                  onChange={(e) => handleMudarContaPai(e.target.value)}
                >
                  {contasSinteticas.map((cp) => {
                    const info = calcularProximoCodigoSequencial(contas, cp.codigo);
                    return (
                      <option key={cp.codigo} value={cp.codigo}>
                        {cp.codigo} — {cp.descricao} (Próximo sequencial: {info.proximoCodigo})
                      </option>
                    );
                  })}
                </select>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>
                    Último cadastrado neste grupo:{" "}
                    <strong>{infoSequencia.ultimoExistente || "Nenhum ainda"}</strong>
                  </span>
                  <span className="text-blue-700 font-semibold font-mono">
                    Próximo: {infoSequencia.proximoCodigo}
                  </span>
                </div>
              </div>

              {/* Código Contábil com Validador de Sequência */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    2. Código Numérico da Conta:
                  </label>
                  <button
                    type="button"
                    onClick={() => setTravarSequencia(!travarSequencia)}
                    className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {travarSequencia ? (
                      <>
                        <Lock className="w-3 h-3 text-blue-600" />
                        <span>Trava Sequencial Ativa</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3 text-amber-600" />
                        <span>Edição Livre</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={travarSequencia}
                    className={`w-full border rounded-lg p-2.5 font-mono font-bold text-xs ${
                      travarSequencia
                        ? "bg-slate-100 text-slate-900 border-slate-300 cursor-not-allowed"
                        : "bg-white text-slate-900 border-blue-400 focus:outline-none"
                    }`}
                    value={novoCodigo}
                    onChange={(e) => setNovoCodigo(e.target.value)}
                    placeholder="Ex: 1.1.6"
                  />

                  {!travarSequencia && (
                    <button
                      type="button"
                      onClick={handleAplicarProximaSequencia}
                      className="px-3 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-300 hover:bg-blue-100 rounded-lg whitespace-nowrap cursor-pointer"
                      title="Restaurar para a próxima sequência exata"
                    >
                      Usar Próximo ({infoSequencia.proximoCodigo})
                    </button>
                  )}
                </div>

                {/* Box de Validação da Sequência Numérica */}
                <div
                  className={`mt-2 p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
                    validacao.tipo === "ok"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : validacao.tipo === "aviso"
                      ? "bg-amber-50 border-amber-300 text-amber-900"
                      : "bg-rose-50 border-rose-300 text-rose-900"
                  }`}
                >
                  {validacao.tipo === "ok" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  {validacao.tipo === "aviso" && (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  {validacao.tipo === "erro" && (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1">
                    <span>{validacao.mensagem}</span>
                    {validacao.proximoRecomendado && validacao.tipo !== "ok" && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setNovoCodigo(validacao.proximoRecomendado!);
                            setTravarSequencia(true);
                          }}
                          className="font-bold underline hover:opacity-80 cursor-pointer"
                        >
                          Clique aqui para aplicar o código sequencial correto ({validacao.proximoRecomendado})
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Descrição da Conta */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  3. Descrição / Nome da Conta:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aplicações em Renda Fixa CDB / IBS a Compensar"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                />
              </div>

              {/* Tipo e Natureza */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo da Conta</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-slate-50"
                    value={novoTipo}
                    onChange={(e) => setNovoTipo(e.target.value as "sintetica" | "analitica")}
                  >
                    <option value="analitica">Analítica (Recebe Lançamentos)</option>
                    <option value="sintetica">Sintética (Totalizadora)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Natureza Contábil</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-slate-50 font-semibold"
                    value={novaNatureza}
                    onChange={(e) => setNovaNatureza(e.target.value as "D" | "C")}
                  >
                    <option value="D">Devedora (Ativo / Custos)</option>
                    <option value="C">Credora (Passivo / PL / Receitas)</option>
                  </select>
                </div>
              </div>

              {erroFeedback && (
                <div className="p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{erroFeedback}</span>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 font-mono">
                  Sequência: {novoCodigo}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalNovaConta(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer text-xs flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Gravar Conta na Sequência</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
