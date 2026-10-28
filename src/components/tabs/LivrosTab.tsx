import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Download, ExternalLink, FileSpreadsheet, Printer } from "lucide-react";
import { EcdGeradorPainel } from "../EcdGeradorPainel";
import { EcfPresumidoPainel } from "../EcfPresumidoPainel";
import { EcfRealPainel } from "../EcfRealPainel";
import { EcfRealPeriodosPainel } from "../EcfRealPeriodosPainel";
import { ContaPlano, EmpresaDados, LancamentoContabil, LivroContabil, PreLancamentoContabil } from "../../types";
import {
  dataLegivelContabil,
  converterCentavos,
  gerarRelatoriosContabeis,
  gerarWorkbookExcel,
  moedaContabil,
  PeriodoContabil,
} from "../../utils/livrosContabeis";

interface LivrosTabProps {
  empresa: EmpresaDados;
  workspaceCarregado: boolean;
  workspacePersistido: boolean;
  lancamentos: LancamentoContabil[];
  contas: ContaPlano[];
  preLancamentos: PreLancamentoContabil[];
  livros: LivroContabil[];
  onDefinirContasDisponibilidades: (codigos: string[]) => void;
  onMapeamentoReferencial?: (mapa: Record<string, string>) => void;
}

type LivroVisivel = "diario" | "razao" | "balancete" | "dre" | "balanco" | "fluxo-caixa";

function competenciaInicial(valor: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(valor || "")) return valor;
  const br = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(valor || "");
  return br ? `${br[2]}-${br[1]}` : "todos";
}

function baixarArquivo(nome: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob(["\uFEFF", conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dinheiroExcel(centavos: number): number {
  return centavos / 100;
}

type GrupoDemonstracao = "receita" | "despesa" | "ativo" | "passivo" | "patrimonio" | null;

function grupoDemonstracao(conta: ContaPlano, contas: ContaPlano[]): GrupoDemonstracao {
  const caminho = contas
    .filter((item) => item.codigo === conta.codigo || conta.codigo.startsWith(`${item.codigo}.`))
    .sort((a, b) => a.codigo.length - b.codigo.length)
    .map((item) => item.descricao || "")
    .join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/patrimonio\s+liquido|capital\s+social|reservas?\s+(de\s+)?lucros?/.test(caminho)) return "patrimonio";
  if (/receita|faturamento/.test(caminho)) return "receita";
  if (/despesa|custo/.test(caminho)) return "despesa";
  if (/ativo/.test(caminho)) return "ativo";
  if (/passivo|obrigacoes|fornecedores|impostos\s+a\s+recolher|salarios\s+a\s+pagar|emprestimos/.test(caminho)) return "passivo";
  return null;
}

function rotuloGrupoDemonstracao(conta: ContaPlano, contas: ContaPlano[]): string {
  const grupo = grupoDemonstracao(conta, contas);
  return grupo === "ativo" ? "Ativo" : grupo === "passivo" ? "Passivo" : grupo === "patrimonio" ? "Patrimônio líquido" : "Não classificado";
}

export const LivrosTab: React.FC<LivrosTabProps> = ({
  empresa,
  workspaceCarregado,
  workspacePersistido,
  lancamentos,
  contas,
  preLancamentos,
  livros,
  onDefinirContasDisponibilidades,
  onMapeamentoReferencial,
}) => {
  const [periodo, setPeriodo] = useState<PeriodoContabil>(() => competenciaInicial(empresa.competencia));
  const [livroVisivel, setLivroVisivel] = useState<LivroVisivel>("diario");
  const [aviso, setAviso] = useState<string | null>(null);
  const [anoECD, setAnoECD] = useState(String(new Date().getFullYear() - 1));

  useEffect(() => setPeriodo(competenciaInicial(empresa.competencia)), [empresa.cnpj, empresa.competencia]);

  const relatorios = useMemo(
    () => gerarRelatoriosContabeis(contas, workspaceCarregado ? lancamentos : [], periodo),
    [contas, lancamentos, periodo, workspaceCarregado],
  );
  const relatoriosECD = useMemo(
    () => gerarRelatoriosContabeis(contas, workspaceCarregado ? lancamentos : [], "todos"),
    [contas, lancamentos, workspaceCarregado],
  );
  const pendentes = preLancamentos.filter((item) => item.status === "pendente_conferencia").length;
  const saldosAberturaPendentes = relatorios.saldosIniciaisPendentes;
  const temDados = relatorios.doPeriodo.length > 0 || relatorios.razao.length > 0 || saldosAberturaPendentes.length > 0;
  const exportacaoLiberada = workspaceCarregado && workspacePersistido && Boolean(empresa.cnpj) && temDados && relatorios.invalidos.length === 0 && saldosAberturaPendentes.length === 0;
  const periodoDescricao = periodo === "todos" ? "Todos os períodos" : `Competência ${periodo.split("-").reverse().join("/")}`;
  const competenciaEmpresa = competenciaInicial(empresa.competencia);
  const competenciasDisponiveis = Array.from(new Set<string>(relatorios.validos.map((item) => item.dataISO.slice(0, 7))));
  if (competenciaEmpresa !== "todos" && !competenciasDisponiveis.includes(competenciaEmpresa)) competenciasDisponiveis.push(competenciaEmpresa);
  competenciasDisponiveis.sort((a, b) => b.localeCompare(a));

  const lancamentosAnoECD = relatoriosECD.validos.filter((item) => item.dataISO.slice(0, 4) === anoECD);
  const invalidosAnoECD = relatoriosECD.invalidos.filter((item) => {
    const data = String(item.data || "");
    return data.startsWith(`${anoECD}-`) || data.endsWith(`/${anoECD}`);
  });
  const contasAnaliticasECD = contas.filter((conta) => conta.tipo === "analitica");
  const contasSemDescricaoECD = contasAnaliticasECD.filter((conta) => !String(conta.descricao || "").trim());
  const movimentosPorContaECD = (() => {
    const porCodigo = new Map<string, { conta: ContaPlano; debitosCentavos: number; creditosCentavos: number }>();
    for (const item of lancamentosAnoECD) {
      const debito = porCodigo.get(item.debito.codigo) || { conta: item.debito, debitosCentavos: 0, creditosCentavos: 0 };
      debito.debitosCentavos += item.valorCentavos;
      porCodigo.set(item.debito.codigo, debito);
      const credito = porCodigo.get(item.credito.codigo) || { conta: item.credito, debitosCentavos: 0, creditosCentavos: 0 };
      credito.creditosCentavos += item.valorCentavos;
      porCodigo.set(item.credito.codigo, credito);
    }
    return [...porCodigo.values()].sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo, "pt-BR", { numeric: true }));
  })();
  const receitaPorTrimestreECF = [0, 1, 2, 3].map((tri) => lancamentosAnoECD
    .filter((item) => Math.floor((Number(item.dataISO.slice(5, 7)) - 1) / 3) === tri)
    .reduce((soma, item) => {
      const cred = grupoDemonstracao(item.credito, contas) === "receita" ? item.valorCentavos : 0;
      const deb = grupoDemonstracao(item.debito, contas) === "receita" ? item.valorCentavos : 0;
      return soma + cred - deb;
    }, 0));
  const receitaPorMesECF = Array.from({ length: 12 }, (_, mes) => lancamentosAnoECD
    .filter((item) => Number(item.dataISO.slice(5, 7)) - 1 === mes)
    .reduce((soma, item) => soma
      + (grupoDemonstracao(item.credito, contas) === "receita" ? item.valorCentavos : 0)
      - (grupoDemonstracao(item.debito, contas) === "receita" ? item.valorCentavos : 0), 0));
  const resultadoPorTrimestreECF = [0, 1, 2, 3].map((tri) => {
    let resultado = 0, irpj = 0, csll = 0;
    for (const item of lancamentosAnoECD) {
      if (Math.floor((Number(item.dataISO.slice(5, 7)) - 1) / 3) !== tri) continue;
      for (const [conta, sinal] of [[item.credito, 1], [item.debito, -1]] as const) {
        const g = grupoDemonstracao(conta, contas);
        if (g !== "receita" && g !== "despesa") continue;
        const v = sinal * item.valorCentavos;
        resultado += v;
        if (g === "despesa") {
          const nome = conta.descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          if (/\birpj\b|imposto\s+de\s+renda/.test(nome)) irpj -= v;
          else if (/\bcsll\b|contribuicao\s+social/.test(nome)) csll -= v;
        }
      }
    }
    return { resultado, irpj, csll };
  });
  const resultadoAnualECF = (() => {
    let resultado = 0, irpj = 0, csll = 0;
    for (const item of lancamentosAnoECD) {
      for (const [conta, sinal] of [[item.credito, 1], [item.debito, -1]] as const) {
        const g = grupoDemonstracao(conta, contas);
        if (g !== "receita" && g !== "despesa") continue;
        const v = sinal * item.valorCentavos; // crédito soma, débito subtrai
        resultado += v; // crédito soma, débito subtrai (vale para receita e despesa)
        if (g === "despesa") {
          const nome = conta.descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          if (/\birpj\b|imposto\s+de\s+renda/.test(nome)) irpj -= v;
          else if (/\bcsll\b|contribuicao\s+social/.test(nome)) csll -= v;
        }
      }
    }
    return { resultado, irpj, csll };
  })();
  const cnpjInformadoECD = String(empresa.cnpj || "").replace(/[^A-Z0-9]/gi, "").length >= 14;
  const checksECD = [
    { titulo: "Empresa identificada", detalhe: "Razão social e CNPJ cadastrados", ok: Boolean(String(empresa.razaoSocial || "").trim()) && cnpjInformadoECD },
    { titulo: "Obrigatoriedade e escopo", detalhe: "Pendente de confirmação para esta empresa e ano; o regime, sozinho, não determina todos os casos de entrega", ok: false },
    { titulo: "Identificação do livro e período", detalhe: "O cadastro atual não contém os parâmetros completos da escrituração ECD (forma, finalidade, período e termos do livro); pendente", ok: false },
    { titulo: "Contador responsável", detalhe: "Nome e CRC informados no cadastro da empresa", ok: Boolean(String(empresa.contadorNome || "").trim() && String(empresa.contadorCrc || "").trim()) },
    { titulo: "Signatários da escrituração", detalhe: "O cadastro atual não contém CPF, qualificação e demais dados dos signatários exigidos no registro próprio da ECD; pendente", ok: false },
    { titulo: "Plano de contas", detalhe: contasAnaliticasECD.length ? `${contasAnaliticasECD.length} contas analíticas; ${contasSemDescricaoECD.length} sem descrição` : "Nenhuma conta analítica cadastrada", ok: contasAnaliticasECD.length > 0 && contasSemDescricaoECD.length === 0 },
    { titulo: "Escrituração do ano", detalhe: lancamentosAnoECD.length ? `${lancamentosAnoECD.length} lançamento(s) definitivo(s) validados em ${anoECD}` : `Nenhum lançamento localizado em ${anoECD}; confirme se houve movimento e qual obrigação se aplica`, ok: lancamentosAnoECD.length > 0 },
    { titulo: "Demonstrações e termos do livro", detalhe: "Balanço/DRE locais são gerenciais; os registros e termos próprios do leiaute ECD ainda não são montados", ok: false },
    { titulo: "Integridade dos lançamentos", detalhe: invalidosAnoECD.length ? `${invalidosAnoECD.length} registro(s) inválido(s) no ano` : "Nenhum lançamento inválido identificado no ano", ok: invalidosAnoECD.length === 0 },
    { titulo: "Saldos iniciais", detalhe: relatoriosECD.saldosIniciaisPendentes.length ? `${relatoriosECD.saldosIniciaisPendentes.length} saldo(s) pendentes ou inconsistentes` : "Nenhum saldo inicial pendente identificado", ok: relatoriosECD.saldosIniciaisPendentes.length === 0 },
    { titulo: "Persistência confirmada", detalhe: workspaceCarregado && workspacePersistido ? "Workspace lido e gravado no banco" : "Aguardando confirmação de leitura e gravação no banco", ok: workspaceCarregado && workspacePersistido },
    { titulo: "Revisão de rascunhos", detalhe: pendentes ? `${pendentes} pré-lançamento(s) ainda aguardam conferência` : "Nenhum pré-lançamento pendente", ok: pendentes === 0 },
    { titulo: "Arquivo ECD e validação oficial", detalhe: "Pendente: gere o TXT no painel abaixo e valide no PGE/SPED; o Murade não recebe a validação oficial", ok: false },
  ];
  const checklistECDLiberado = checksECD.every((item) => item.ok);

  const exportarChecklistECD = () => {
    const linhas: (string | number)[][] = [
      ["CHECKLIST INTERNO DE PREPARAÇÃO — ECD (NÃO É ARQUIVO SPED)"],
      [empresa.razaoSocial || "Razão social não informada", `CNPJ: ${empresa.cnpj || "não informado"}`, `Ano-calendário: ${anoECD}`],
      ["Verificação", "Resultado local", "Detalhe"],
      ...checksECD.map((item) => [item.titulo, item.ok ? "Conferido localmente" : "Pendente", item.detalhe]),
      ["Movimento por conta (somente lançamentos definitivos validados)", "Código", "Descrição", "Natureza", "Débitos do ano (R$)", "Créditos do ano (R$)"],
      ...movimentosPorContaECD.map((item) => ["Movimento anual", item.conta.codigo, item.conta.descricao || "Descrição pendente", item.conta.natureza, (item.debitosCentavos / 100).toFixed(2), (item.creditosCentavos / 100).toFixed(2)]),
      ["Aviso", "Este checklist não confirma a obrigatoriedade, não valida o leiaute ECD e não substitui o PGE/SPED, a revisão profissional ou as regras aplicáveis à empresa."],
    ];
    baixarArquivo(`checklist-preparacao-ecd-${String(empresa.cnpj || "empresa").replace(/[^A-Z0-9]/gi, "")}-${anoECD}.csv`, linhas.map((linha) => linha.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv;charset=utf-8");
    setAviso("Checklist interno da ECD exportado. A obrigatoriedade e a validação oficial continuam pendentes; este CSV não é arquivo para transmissão ao SPED.");
  };

  // Demonstrações gerenciais são derivadas apenas dos lançamentos definitivos.
  // As classes 3 (receitas) e 4 (despesas) seguem o modelo de contas desta empresa;
  // nenhuma regra tributária ou conta ausente é inferida aqui.
  const dre = useMemo(() => {
    const porConta = new Map<string, { conta: ContaPlano; debito: number; credito: number }>();
    for (const conta of contas.filter((item) => item.tipo === "analitica" && ["receita", "despesa"].includes(grupoDemonstracao(item, contas) || ""))) {
      porConta.set(conta.codigo, { conta, debito: 0, credito: 0 });
    }
    for (const item of relatorios.doPeriodo) {
      const debito = porConta.get(item.debito.codigo);
      const credito = porConta.get(item.credito.codigo);
      if (debito) debito.debito += item.valorCentavos;
      if (credito) credito.credito += item.valorCentavos;
    }
    const receitas = [...porConta.values()].filter((item) => grupoDemonstracao(item.conta, contas) === "receita");
    const despesas = [...porConta.values()].filter((item) => grupoDemonstracao(item.conta, contas) === "despesa");
    const totalReceitas = receitas.reduce((soma, item) => soma + item.credito - item.debito, 0);
    const totalDespesas = despesas.reduce((soma, item) => soma + item.debito - item.credito, 0);
    return { receitas, despesas, totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas };
  }, [contas, relatorios.doPeriodo]);

  const contasPatrimoniais = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    && ["ativo", "passivo", "patrimonio"].includes(grupoDemonstracao(item.conta, contas) || "")
    && (item.saldoDevedorCentavos || item.saldoCredorCentavos || item.debitoPeriodoCentavos || item.creditoPeriodoCentavos));
  const contasSemClassificacaoDRE = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    && grupoDemonstracao(item.conta, contas) === null
    && (item.debitoPeriodoCentavos || item.creditoPeriodoCentavos));
  const contasSemClassificacaoBalanco = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    && grupoDemonstracao(item.conta, contas) === null
    && (item.saldoDevedorCentavos || item.saldoCredorCentavos));
  const contasResultadoNaoEncerradasBalanco = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    && ["receita", "despesa"].includes(grupoDemonstracao(item.conta, contas) || "")
    && (item.saldoDevedorCentavos || item.saldoCredorCentavos || item.debitoPeriodoCentavos || item.creditoPeriodoCentavos));
  const totalAtivo = contasPatrimoniais.filter((item) => grupoDemonstracao(item.conta, contas) === "ativo").reduce((soma, item) => soma + item.saldoDevedorCentavos - item.saldoCredorCentavos, 0);
  const totalPassivo = contasPatrimoniais.filter((item) => grupoDemonstracao(item.conta, contas) === "passivo").reduce((soma, item) => soma + item.saldoCredorCentavos - item.saldoDevedorCentavos, 0);
  const totalPatrimonio = contasPatrimoniais.filter((item) => grupoDemonstracao(item.conta, contas) === "patrimonio").reduce((soma, item) => soma + item.saldoCredorCentavos - item.saldoDevedorCentavos, 0);
  const totalPassivoPatrimonio = totalPassivo + totalPatrimonio;
  const diferencaBalancoCentavos = totalAtivo - totalPassivoPatrimonio;
  const estadoConferenciaBalanco = !contasPatrimoniais.length
    ? "Pendente: não há saldo patrimonial classificado para comparar"
    : contasSemClassificacaoBalanco.length
      ? `Parcial: ${contasSemClassificacaoBalanco.length} conta(s) com saldo estão fora da classificação; diferença provisória ${moedaContabil(diferencaBalancoCentavos)}`
      : contasResultadoNaoEncerradasBalanco.length
        ? `Parcial: ${contasResultadoNaoEncerradasBalanco.length} conta(s) de resultado não entram no Balanço até o encerramento contábil; diferença aritmética ${moedaContabil(diferencaBalancoCentavos)}`
      : diferencaBalancoCentavos === 0
        ? "Conferência aritmética interna sem diferença; requer revisão profissional"
        : `Divergência interna de ${moedaContabil(diferencaBalancoCentavos)}; revise saldos e classificações`;
  const diferencaBalanceteCentavos = relatorios.totalSaldoDevedorCentavos - relatorios.totalSaldoCredorCentavos;
  const estadoConferenciaBalancete = !relatorios.razao.length
    ? "Pendente: sem movimento ou saldo informado para conferência"
    : diferencaBalanceteCentavos === 0
      ? "Saldos devedores e credores iguais na conferência local"
      : `Divergência interna de ${moedaContabil(diferencaBalanceteCentavos)} entre saldos devedores e credores`;

  const contasDisponibilidades = useMemo(() => {
    const codigos = new Set(empresa.contasDisponibilidadesCodigo || []);
    return contas.filter((conta) => conta.tipo === "analitica" && conta.natureza === "D" && codigos.has(conta.codigo));
  }, [contas, empresa.contasDisponibilidadesCodigo]);
  const fluxoCaixa = useMemo(() => {
    type Linha = { dataISO: string; conta: string; contraparte: string; historico: string; referencia: string; entrada: number; saida: number };
    const indisponivel = (motivo: string) => ({ disponivel: false, motivo, saldoInicialCentavos: 0, entradasCentavos: 0, saidasCentavos: 0, saldoFinalCentavos: 0, linhas: [] as Linha[] });
    if (periodo === "todos") return indisponivel("Selecione uma competência específica para conferir o fluxo de caixa.");
    if (!contasDisponibilidades.length) return indisponivel("Marque as contas analíticas de Caixa e Bancos usadas por esta empresa.");
    const codigos = new Set(contasDisponibilidades.map((conta) => conta.codigo));
    const semAbertura = contasDisponibilidades.filter((conta) => {
      const saldo = converterCentavos(conta.saldoInicial ?? NaN);
      return saldo === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(conta.saldoInicialCompetencia || "")) || String(conta.saldoInicialCompetencia) > periodo;
    });
    if (semAbertura.length) return indisponivel(`Informe e confirme o saldo inicial e a competência-base de: ${semAbertura.map((conta) => `${conta.codigo} ${conta.descricao}`).join(", ")}.`);
    const lancamentosAberturaAusentes = contasDisponibilidades.filter((conta) => conta.saldoInicialConvertidoEm
      && !relatorios.validos.some((item) => item.original.saldoInicialContaCodigo === conta.codigo));
    if (lancamentosAberturaAusentes.length) return indisponivel(`Abertura marcada como convertida sem lançamento aprovado para: ${lancamentosAberturaAusentes.map((conta) => conta.codigo).join(", ")}.`);
    let saldoInicialCentavos = 0;
    for (const conta of contasDisponibilidades) {
      const saldo = converterCentavos(conta.saldoInicial ?? 0) || 0;
      if (!conta.saldoInicialConvertidoEm) saldoInicialCentavos += saldo;
    }
    const linhas: Linha[] = [];
    const processarMovimentoDisponibilidade = (item: typeof relatorios.validos[number], codigoCaixa: string, debitoCaixa: boolean) => {
      const competencia = item.dataISO.slice(0, 7);
      const contaCaixa = contasDisponibilidades.find((conta) => conta.codigo === codigoCaixa)!;
      const competenciaBase = String(contaCaixa.saldoInicialCompetencia || "");
      if (competencia < competenciaBase || competencia > periodo) return;
      const delta = debitoCaixa ? item.valorCentavos : -item.valorCentavos;
      if (item.original.saldoInicialContaCodigo) {
        saldoInicialCentavos += delta;
        return;
      }
      if (competencia < periodo) { saldoInicialCentavos += delta; return; }
      const contraparte = debitoCaixa ? item.credito : item.debito;
      linhas.push({ dataISO: item.dataISO, conta: codigoCaixa, contraparte: `${contraparte.codigo} — ${contraparte.descricao}`, historico: item.original.historico, referencia: String(item.original.documentoRef || item.original.id), entrada: Math.max(0, delta), saida: Math.max(0, -delta) });
    };
    for (const item of relatorios.validos) {
      if (codigos.has(item.debito.codigo)) processarMovimentoDisponibilidade(item, item.debito.codigo, true);
      if (codigos.has(item.credito.codigo)) processarMovimentoDisponibilidade(item, item.credito.codigo, false);
    }
    linhas.sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.referencia.localeCompare(b.referencia));
    const entradasCentavos = linhas.reduce((soma, item) => soma + item.entrada, 0);
    const saidasCentavos = linhas.reduce((soma, item) => soma + item.saida, 0);
    return { disponivel: true, motivo: "Valores derivados de lançamentos definitivos e contas de disponibilidades explicitamente selecionadas.", saldoInicialCentavos, entradasCentavos, saidasCentavos, saldoFinalCentavos: saldoInicialCentavos + entradasCentavos - saidasCentavos, linhas };
  }, [contasDisponibilidades, periodo, relatorios.validos]);
  const saldoContabilDisponibilidadesCentavos = contasDisponibilidades.reduce((total, conta) => {
    const linha = relatorios.balancete.find((item) => item.conta.codigo === conta.codigo);
    return total + (linha?.saldoDevedorCentavos || 0) - (linha?.saldoCredorCentavos || 0);
  }, 0);
  const diferencaFluxoCaixaContabilidadeCentavos = fluxoCaixa.disponivel
    ? fluxoCaixa.saldoFinalCentavos - saldoContabilDisponibilidadesCentavos
    : null;

  const exportarExcel = () => {
    if (!workspaceCarregado || !workspacePersistido || !empresa.cnpj) {
      setAviso("Aguarde a confirmação de gravação no PostgreSQL deste CNPJ antes de exportar os livros definitivos.");
      return;
    }
    if (!temDados || relatorios.invalidos.length) {
      setAviso(relatorios.invalidos.length
        ? `Exportação bloqueada: ${relatorios.invalidos.length} lançamento(s) definitivo(s) têm dados inválidos. Corrija a data, o histórico, o valor ou as contas antes de gerar os livros.`
        : "Não há lançamentos definitivos nem saldos iniciais para exportar neste período.");
      return;
    }

    const linhasDiario: (string | number)[][] = [
      ["LIVRO DIÁRIO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Nº interno", "Data", "Documento / referência", "Histórico", "Conta débito", "Descrição débito", "Conta crédito", "Descrição crédito", "Valor (R$)", "Origem"],
      ...relatorios.doPeriodo.map((item, indice) => [
        indice + 1,
        dataLegivelContabil(item.dataISO),
        String(item.original.documentoRef || item.original.id),
        item.original.historico,
        item.debito.codigo,
        item.debito.descricao,
        item.credito.codigo,
        item.credito.descricao,
        dinheiroExcel(item.valorCentavos),
        item.original.origem,
      ]),
    ];

    const linhasRazao: (string | number)[][] = [
      ["LIVRO RAZÃO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Nº interno", "Conta", "Descrição", "Data", "Documento / referência", "Histórico", "Conta contrapartida", "Descrição contrapartida", "Débito (R$)", "Crédito (R$)", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...relatorios.razao.map((item, indice) => [
        indice + 1,
        item.conta.codigo,
        item.conta.descricao,
        dataLegivelContabil(item.dataISO),
        item.referencia,
        item.historico,
        item.contraPartidaCodigo,
        item.contraPartidaNome,
        dinheiroExcel(item.debitoCentavos),
        dinheiroExcel(item.creditoCentavos),
        dinheiroExcel(item.saldoDevedorCentavos),
        dinheiroExcel(item.saldoCredorCentavos),
      ]),
    ];

    const linhasBalancete: (string | number)[][] = [
      ["BALANCETE DE VERIFICAÇÃO — RELATÓRIO INTERNO CONTÁBIL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Conta", "Descrição", "Tipo", "Movimento débito (R$)", "Movimento crédito (R$)", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...relatorios.balancete
        .filter((item) => item.conta.tipo === "analitica" && (item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos))
        .map((item) => [
          item.conta.codigo,
          item.conta.descricao,
          item.conta.tipo,
          dinheiroExcel(item.debitoPeriodoCentavos),
          dinheiroExcel(item.creditoPeriodoCentavos),
          dinheiroExcel(item.saldoDevedorCentavos),
          dinheiroExcel(item.saldoCredorCentavos),
        ]),
      ["Totais", "", "", dinheiroExcel(relatorios.totalDebitosCentavos), dinheiroExcel(relatorios.totalCreditosCentavos), dinheiroExcel(relatorios.totalSaldoDevedorCentavos), dinheiroExcel(relatorios.totalSaldoCredorCentavos)],
      ["Conferência local dos saldos", estadoConferenciaBalancete, "Diferença devedora menos credora (R$)", dinheiroExcel(diferencaBalanceteCentavos)],
    ];

    const linhasDre: (string | number)[][] = [
      ["DEMONSTRAÇÃO GERENCIAL DO RESULTADO — NÃO OFICIAL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Grupo", "Conta", "Descrição", "Créditos (R$)", "Débitos (R$)", "Saldo do grupo (R$)"],
      ...dre.receitas.map((item) => ["Receitas", item.conta.codigo, item.conta.descricao, dinheiroExcel(item.credito), dinheiroExcel(item.debito), dinheiroExcel(item.credito - item.debito)]),
      ...dre.despesas.map((item) => ["Despesas", item.conta.codigo, item.conta.descricao, dinheiroExcel(item.credito), dinheiroExcel(item.debito), dinheiroExcel(item.debito - item.credito)]),
      ["Totais", "", "Receitas", "", "", dinheiroExcel(dre.totalReceitas)],
      ["Totais", "", "Despesas", "", "", dinheiroExcel(dre.totalDespesas)],
      ["Resultado do período", "", "Receitas menos despesas", "", "", dinheiroExcel(dre.resultado)],
      ["Classificação pela descrição das contas e grupos superiores; contas sem descrição reconhecível não são inferidas."],
      ["CONTAS COM MOVIMENTO NÃO CLASSIFICADO — fora do resultado até revisão"],
      ["Conta", "Descrição", "Débitos no período (R$)", "Créditos no período (R$)"],
      ...contasSemClassificacaoDRE.map((item) => [item.conta.codigo, item.conta.descricao || "Nome não informado", dinheiroExcel(item.debitoPeriodoCentavos), dinheiroExcel(item.creditoPeriodoCentavos)]),
    ];
    const linhasBalanco: (string | number)[][] = [
      ["BALANÇO PATRIMONIAL GERENCIAL — NÃO OFICIAL"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Grupo", "Conta", "Descrição", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...contasPatrimoniais.map((item) => [rotuloGrupoDemonstracao(item.conta, contas), item.conta.codigo, item.conta.descricao, dinheiroExcel(item.saldoDevedorCentavos), dinheiroExcel(item.saldoCredorCentavos)]),
      ["Totais", "", "Ativo", dinheiroExcel(totalAtivo), 0],
      ["Totais", "", "Passivo", 0, dinheiroExcel(totalPassivo)],
      ["Totais", "", "Patrimônio líquido", 0, dinheiroExcel(totalPatrimonio)],
      ["Totais", "", "Passivo + patrimônio líquido", 0, dinheiroExcel(totalPassivoPatrimonio)],
      ["Conferência aritmética interna", estadoConferenciaBalanco, "Diferença Ativo − Passivo − Patrimônio líquido (R$)", dinheiroExcel(diferencaBalancoCentavos)],
      ["Classificação pela descrição das contas e grupos superiores; contas sem descrição reconhecível não são inferidas."],
      ["SALDOS PATRIMONIAIS NÃO CLASSIFICADOS — fora dos totais até revisão"],
      ["Conta", "Descrição", "Saldo devedor (R$)", "Saldo credor (R$)"],
      ...contasSemClassificacaoBalanco.map((item) => [item.conta.codigo, item.conta.descricao || "Nome não informado", dinheiroExcel(item.saldoDevedorCentavos), dinheiroExcel(item.saldoCredorCentavos)]),
    ];
    const linhasFluxoCaixa: (string | number)[][] = fluxoCaixa.disponivel ? [
      ["FLUXO DE CAIXA INTERNO — BASEADO EM LANÇAMENTOS DEFINITIVOS"],
      [empresa.razaoSocial || "Empresa não informada", `CNPJ: ${empresa.cnpj}`, periodoDescricao],
      ["Saldo inicial (R$)", dinheiroExcel(fluxoCaixa.saldoInicialCentavos)],
      ["Entradas (R$)", dinheiroExcel(fluxoCaixa.entradasCentavos)],
      ["Saídas (R$)", dinheiroExcel(fluxoCaixa.saidasCentavos)],
      ["Saldo final calculado (R$)", dinheiroExcel(fluxoCaixa.saldoFinalCentavos)],
      ["Data", "Conta Caixa/Banco", "Contrapartida", "Histórico", "Referência", "Entrada (R$)", "Saída (R$)"],
      ...fluxoCaixa.linhas.map((item) => [dataLegivelContabil(item.dataISO), item.conta, item.contraparte, item.historico, item.referencia, dinheiroExcel(item.entrada), dinheiroExcel(item.saida)]),
      ["Relatório interno; classifique as contas Caixa/Bancos e confira saldos e movimentos. Não é demonstração financeira oficial."],
    ] : [];

    const workbook = gerarWorkbookExcel([
      { nome: "Diário", linhas: linhasDiario },
      { nome: "Razão", linhas: linhasRazao },
      { nome: "Balancete", linhas: linhasBalancete },
      { nome: "DRE gerencial", linhas: linhasDre },
      { nome: "Balanço gerencial", linhas: linhasBalanco },
      ...(fluxoCaixa.disponivel ? [{ nome: "Fluxo de caixa", linhas: linhasFluxoCaixa }] : []),
    ]);
    baixarArquivo(`livros-contabeis-${empresa.cnpj.replace(/\D/g, "")}-${periodo === "todos" ? "todos-periodos" : periodo}.xls`, workbook, "application/vnd.ms-excel;charset=utf-8");
    setAviso(`Arquivo Excel com Diário, Razão, Balancete, DRE gerencial e Balanço gerencial${fluxoCaixa.disponivel ? ", além do Fluxo de Caixa interno" : ""} baixado. Usa somente dados definitivos desta empresa e não substitui demonstrações assinadas ou revisadas.`);
  };

  const imprimirPdf = () => {
    if (!workspaceCarregado || !workspacePersistido || !empresa.cnpj) {
      setAviso("Aguarde a confirmação de gravação no PostgreSQL deste CNPJ antes de imprimir os livros definitivos.");
      return;
    }
    if (!temDados || relatorios.invalidos.length) {
      setAviso(relatorios.invalidos.length
        ? `Impressão bloqueada: corrija ${relatorios.invalidos.length} lançamento(s) definitivo(s) inválido(s) antes de gerar os livros.`
        : "Não há lançamentos definitivos nem saldos iniciais para imprimir neste período.");
      return;
    }
    window.print();
  };

  const linhaRazao = (item: typeof relatorios.razao[number], indice: number, imprimir = false) => (
    <tr key={`${item.conta.codigo}-${item.dataISO}-${item.referencia}-${indice}`} className="border-t border-slate-100">
      <td className="px-2 py-2 text-right tabular-nums">{indice + 1}</td>
      <td className="px-2 py-2 whitespace-nowrap">{dataLegivelContabil(item.dataISO)}</td>
      <td className="px-2 py-2 font-mono">{item.conta.codigo}</td>
      <td className="px-2 py-2">{item.historico}{item.referencia ? <span className="block text-[10px] text-slate-500">{item.referencia} · {item.origem}</span> : null}</td>
      <td className="px-2 py-2">{item.contraPartidaCodigo ? `${item.contraPartidaCodigo} — ${item.contraPartidaNome}` : "—"}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.debitoCentavos)}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.creditoCentavos)}</td>
      <td className="px-2 py-2 text-right">{moedaContabil(item.saldoDevedorCentavos || item.saldoCredorCentavos)} {item.saldoDevedorCentavos ? "D" : item.saldoCredorCentavos ? "C" : "—"}</td>
      {imprimir && <td className="px-2 py-2">{item.referencia || "Saldo anterior"}</td>}
    </tr>
  );

  const balanceteVisivel = relatorios.balancete.filter((item) => item.conta.tipo === "analitica"
    ? item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos
    : item.debitoPeriodoCentavos || item.creditoPeriodoCentavos || item.saldoDevedorCentavos || item.saldoCredorCentavos);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen className="h-5 w-5 text-blue-700" /> Livros contábeis da empresa</h2>
          <p className="mt-1 text-xs text-slate-600">Diário e Razão são ordenados por data e recebem numeração sequencial interna no relatório. Isso não é número oficial do livro ou termo de abertura/encerramento. Pré-lançamentos pendentes não entram.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={imprimirPdf} disabled={!exportacaoLiberada} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimir / Salvar PDF</button>
          <button type="button" onClick={exportarExcel} disabled={!exportacaoLiberada} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</button>
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="text-xs font-bold text-slate-700">Competência
          <select value={periodo} onChange={(evento) => setPeriodo(evento.target.value as PeriodoContabil)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-medium">
            <option value="todos">Todos os períodos</option>
            {competenciasDisponiveis.map((item) => <option key={item} value={item}>{item.split("-").reverse().join("/")}</option>)}
          </select>
        </label>
        <div className="text-right text-xs text-slate-600">
          <div><strong>{empresa.razaoSocial || "Empresa sem razão social"}</strong> · CNPJ {empresa.cnpj || "não informado"}</div>
          <div>{relatorios.doPeriodo.length} lançamento(s) definitivo(s) neste período</div>
        </div>
      </div>

      {!workspaceCarregado && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Carregando os dados persistidos da empresa. A exportação fica bloqueada até confirmar a leitura do banco.</div>}
      {workspaceCarregado && !workspacePersistido && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Há alterações aguardando confirmação do PostgreSQL. Os relatórios podem ser conferidos na tela, mas a exportação só será liberada depois que a gravação permanente for confirmada.</div>}
      {pendentes > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>{pendentes} pré-lançamento(s) aguardam conferência.</strong> Eles não aparecem no Diário, Razão nem Balancete até que o contador os confira e confirme a contabilização na aba Revisão Fiscal e DP.</p></div>}
      {relatorios.invalidos.length > 0 && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"><strong>Há {relatorios.invalidos.length} lançamento(s) definitivo(s) com inconsistência.</strong> Eles não foram incluídos nos relatórios, e as exportações estão bloqueadas para evitar livros incompletos. Confira data, histórico, valor e contas analíticas.</div>}
      {saldosAberturaPendentes.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>{saldosAberturaPendentes.length} saldo(s) inicial(is) têm valor ou competência-base pendente/inconsistente.</strong> Eles ficam fora dos cálculos até a conferência no Plano de Contas; PDF e Excel permanecem bloqueados para não apresentar um livro incompleto.</div>}
      {aviso && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{aviso}</p>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Livros contábeis">
        {([ ["diario", "Livro Diário"], ["razao", "Livro Razão"], ["balancete", "Balancete"], ["dre", "DRE gerencial"], ["balanco", "Balanço gerencial"], ["fluxo-caixa", "Fluxo de caixa interno"] ] as const).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={livroVisivel === id} onClick={() => setLivroVisivel(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${livroVisivel === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{nome}</button>
        ))}
      </div>

      {(["dre", "balanco", "fluxo-caixa"] as LivroVisivel[]).includes(livroVisivel) && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        <strong className="block">Relatório gerencial interno — não é demonstração oficial assinada</strong>
        {livroVisivel === "dre" && <span className="mt-1 block">A DRE atual classifica contas pelas descrições do plano. {contasSemClassificacaoDRE.length ? `${contasSemClassificacaoDRE.length} conta(s) com movimento estão sem classificação e aparecem abaixo como pendência.` : "A classificação textual local não substitui revisão e mapeamento formal do plano."} Este relatório não possui assinatura ou validação oficial.</span>}
        {livroVisivel === "balanco" && <span className="mt-1 block">O balanço atual agrupa contas pela descrição. {contasSemClassificacaoBalanco.length ? `${contasSemClassificacaoBalanco.length} conta(s) com saldo estão sem classificação e aparecem abaixo como pendência.` : "A classificação textual local não substitui revisão e mapeamento formal do plano."} Este relatório não possui assinatura ou validação oficial.</span>}
        {livroVisivel === "fluxo-caixa" && <span className="mt-1 block">O fluxo de caixa interno considera apenas contas de caixa/bancos explicitamente selecionadas. Ele não classifica as atividades nem é uma demonstração oficial assinada ou validada.</span>}
      </div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {livroVisivel === "diario" && <table className="min-w-[900px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Nº interno</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Documento / histórico</th><th className="px-3 py-2">Conta débito</th><th className="px-3 py-2">Conta crédito</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Origem</th></tr></thead>
          <tbody>{relatorios.doPeriodo.map((item, indice) => <tr key={item.original.id} className="border-t border-slate-100"><td className="px-3 py-2 text-right tabular-nums">{indice + 1}</td><td className="px-3 py-2 whitespace-nowrap">{dataLegivelContabil(item.dataISO)}</td><td className="px-3 py-2"><strong>{item.original.documentoRef || item.original.id}</strong><span className="block">{item.original.historico}</span></td><td className="px-3 py-2">{item.debito.codigo} — {item.debito.descricao}</td><td className="px-3 py-2">{item.credito.codigo} — {item.credito.descricao}</td><td className="px-3 py-2 text-right">{moedaContabil(item.valorCentavos)}</td><td className="px-3 py-2">{item.original.origem}</td></tr>)}
          {relatorios.doPeriodo.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhum lançamento definitivo para esta competência. Rascunhos aguardando revisão ficam fora do Diário.</td></tr>}</tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold"><tr><td colSpan={5} className="px-3 py-2">Total dos lançamentos em partidas dobradas</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="px-3 py-2">Débitos e créditos equilibrados</td></tr></tfoot>
        </table>}

        {livroVisivel === "razao" && <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-2 py-2">Nº interno</th><th className="px-2 py-2">Data</th><th className="px-2 py-2">Conta</th><th className="px-2 py-2">Histórico</th><th className="px-2 py-2">Contrapartida</th><th className="px-2 py-2 text-right">Débito</th><th className="px-2 py-2 text-right">Crédito</th><th className="px-2 py-2 text-right">Saldo</th></tr></thead>
          <tbody>{relatorios.razao.map((item, indice) => linhaRazao(item, indice))}
          {relatorios.razao.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nenhuma movimentação ou saldo inicial informado.</td></tr>}</tbody>
        </table>}

        {livroVisivel === "balancete" && <table className="min-w-[760px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Mov. débito</th><th className="px-3 py-2 text-right">Mov. crédito</th><th className="px-3 py-2 text-right">Saldo devedor</th><th className="px-3 py-2 text-right">Saldo credor</th></tr></thead>
          <tbody>{balanceteVisivel.map((item) => <tr key={item.conta.codigo} className={`border-t border-slate-100 ${item.conta.tipo === "sintetica" ? "font-semibold bg-slate-50" : ""}`}><td className="px-3 py-2 font-mono">{item.conta.codigo}</td><td className="px-3 py-2" style={{ paddingLeft: `${12 + (item.conta.nivel - 1) * 16}px` }}>{item.conta.descricao || "Nome não informado"}</td><td className="px-3 py-2 text-right">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.creditoPeriodoCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}
          {balanceteVisivel.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhum movimento nem saldo inicial informado.</td></tr>}</tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold"><tr><td colSpan={2} className="px-3 py-2">Totais das contas analíticas</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalCreditosCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalSaldoDevedorCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(relatorios.totalSaldoCredorCentavos)}</td></tr><tr><td colSpan={2} className="px-3 py-2">Conferência local: {estadoConferenciaBalancete}</td><td colSpan={4} className="px-3 py-2 text-right">Diferença devedora − credora: {moedaContabil(diferencaBalanceteCentavos)}</td></tr></tfoot>
        </table>}

        {livroVisivel === "dre" && <div className="p-3">
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">DRE gerencial classifica contas pela descrição da própria conta e de seus grupos superiores (Receita, Despesa ou Custo), independentemente do código. Contas sem descrição reconhecível não são inferidas; confira o plano e a classificação antes de usar.</p>
          <table className="w-full min-w-[650px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Grupo</th><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Crédito</th><th className="px-3 py-2 text-right">Débito</th><th className="px-3 py-2 text-right">Saldo</th></tr></thead><tbody>
            {dre.receitas.map((item) => <tr key={`dre-r-${item.conta.codigo}`} className="border-t border-slate-100"><td>Receitas</td><td className="px-3 py-2 font-mono">{item.conta.codigo}</td><td className="px-3 py-2">{item.conta.descricao}</td><td className="px-3 py-2 text-right">{moedaContabil(item.credito)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.debito)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.credito - item.debito)}</td></tr>)}
            {dre.despesas.map((item) => <tr key={`dre-d-${item.conta.codigo}`} className="border-t border-slate-100"><td>Despesas</td><td className="px-3 py-2 font-mono">{item.conta.codigo}</td><td className="px-3 py-2">{item.conta.descricao}</td><td className="px-3 py-2 text-right">{moedaContabil(item.credito)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.debito)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.debito - item.credito)}</td></tr>)}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold"><td colSpan={5} className="px-3 py-2">Receitas do período</td><td className="px-3 py-2 text-right">{moedaContabil(dre.totalReceitas)}</td></tr><tr className="bg-slate-50 font-bold"><td colSpan={5} className="px-3 py-2">Despesas do período</td><td className="px-3 py-2 text-right">{moedaContabil(dre.totalDespesas)}</td></tr><tr className="bg-blue-50 font-black"><td colSpan={5} className="px-3 py-2">Resultado gerencial do período</td><td className="px-3 py-2 text-right">{moedaContabil(dre.resultado)}</td></tr>
            {!dre.receitas.length && !dre.despesas.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Sem movimentos definitivos nas classes de receita e despesa nesta competência.</td></tr>}
          </tbody></table>
          <div className="mt-3 overflow-x-auto rounded-md border border-amber-300 bg-amber-50 p-3">
            <h3 className="text-xs font-bold text-amber-950">Contas com movimento fora da DRE gerencial</h3>
            <p className="mt-1 text-[11px] text-amber-900">Esses movimentos não entram no resultado até que a classificação seja revisada. O sistema não deduz a natureza da conta.</p>
            <table className="mt-2 w-full min-w-[560px] text-left text-xs"><thead><tr><th className="py-1">Conta</th><th>Descrição</th><th className="text-right">Débito</th><th className="text-right">Crédito</th></tr></thead><tbody>{contasSemClassificacaoDRE.map((item) => <tr key={`dre-pendente-${item.conta.codigo}`} className="border-t border-amber-200"><td className="py-1 font-mono">{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="text-right">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="text-right">{moedaContabil(item.creditoPeriodoCentavos)}</td></tr>)}{!contasSemClassificacaoDRE.length && <tr><td colSpan={4} className="py-2 text-amber-900">Nenhuma conta com movimento não classificado no período.</td></tr>}</tbody></table>
          </div>
        </div>}

        {livroVisivel === "balanco" && <div className="p-3">
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Balanço gerencial classifica Ativo, Passivo e Patrimônio Líquido pelas descrições das contas e dos grupos superiores, independentemente do código. Saldos de contas sem descrição reconhecível ficam fora deste resumo. Contas de receita e despesa também não são transferidas automaticamente para o patrimônio líquido: {contasResultadoNaoEncerradasBalanco.length} conta(s) de resultado têm movimento/saldo e exigem conferência do encerramento. Nenhum encerramento ou ajuste é criado aqui.</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-3"><div className="rounded-md border bg-slate-50 p-3"><span className="text-xs text-slate-600">Ativo</span><strong className="block text-lg">{moedaContabil(totalAtivo)}</strong></div><div className="rounded-md border bg-slate-50 p-3"><span className="text-xs text-slate-600">Passivo</span><strong className="block text-lg">{moedaContabil(totalPassivo)}</strong></div><div className="rounded-md border bg-slate-50 p-3"><span className="text-xs text-slate-600">Patrimônio líquido</span><strong className="block text-lg">{moedaContabil(totalPatrimonio)}</strong></div></div>
          <table className="w-full min-w-[600px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-slate-700"><tr><th className="px-3 py-2">Grupo</th><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Saldo devedor</th><th className="px-3 py-2 text-right">Saldo credor</th></tr></thead><tbody>{contasPatrimoniais.map((item) => <tr key={`bp-${item.conta.codigo}`} className="border-t border-slate-100"><td>{rotuloGrupoDemonstracao(item.conta, contas)}</td><td className="px-3 py-2 font-mono">{item.conta.codigo}</td><td className="px-3 py-2">{item.conta.descricao}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="px-3 py-2 text-right">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}{!contasPatrimoniais.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Sem saldo patrimonial informado para este período.</td></tr>}</tbody></table>
          <p role="status" className={`mt-3 rounded-md border p-3 text-xs font-bold ${diferencaBalancoCentavos === 0 && contasPatrimoniais.length > 0 && !contasSemClassificacaoBalanco.length ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>Conferência aritmética interna: {estadoConferenciaBalanco}. Diferença Ativo − Passivo − Patrimônio líquido: {moedaContabil(diferencaBalancoCentavos)}. Nenhum saldo foi ajustado automaticamente.</p>
          <div className="mt-3 overflow-x-auto rounded-md border border-amber-300 bg-amber-50 p-3">
            <h3 className="text-xs font-bold text-amber-950">Saldos fora do balanço gerencial</h3>
            <p className="mt-1 text-[11px] text-amber-900">Saldos sem classificação reconhecida ficam fora dos totais de Ativo, Passivo e Patrimônio Líquido até a revisão do plano.</p>
            <table className="mt-2 w-full min-w-[560px] text-left text-xs"><thead><tr><th className="py-1">Conta</th><th>Descrição</th><th className="text-right">Saldo devedor</th><th className="text-right">Saldo credor</th></tr></thead><tbody>{contasSemClassificacaoBalanco.map((item) => <tr key={`bp-pendente-${item.conta.codigo}`} className="border-t border-amber-200"><td className="py-1 font-mono">{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="text-right">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="text-right">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}{!contasSemClassificacaoBalanco.length && <tr><td colSpan={4} className="py-2 text-amber-900">Nenhum saldo sem classificação reconhecida.</td></tr>}</tbody></table>
          </div>
        </div>}

        {livroVisivel === "fluxo-caixa" && <div className="space-y-3 p-3">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"><strong>Relatório interno de movimentação de caixa e bancos.</strong> Marque as contas analíticas de disponibilidades da empresa. O sistema usa somente lançamentos definitivos e saldo inicial com competência-base confirmada; não estima saldo ausente nem classifica os fluxos em operacionais, investimentos ou financiamentos.</div>
          <fieldset className="rounded-md border border-slate-200 p-3"><legend className="px-1 text-xs font-bold text-slate-700">Contas Caixa e Bancos desta empresa</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{contas.filter((conta) => conta.tipo === "analitica" && conta.natureza === "D").map((conta) => <label key={conta.codigo} className="flex items-start gap-2 rounded border border-slate-100 p-2 text-xs"><input type="checkbox" checked={(empresa.contasDisponibilidadesCodigo || []).includes(conta.codigo)} onChange={(event) => {
              const atuais = new Set(empresa.contasDisponibilidadesCodigo || []);
              if (event.target.checked) atuais.add(conta.codigo); else atuais.delete(conta.codigo);
              onDefinirContasDisponibilidades([...atuais]);
            }} /><span><strong>{conta.codigo}</strong> — {conta.descricao || "Nome não informado"}</span></label>)}</div>
            {!contas.some((conta) => conta.tipo === "analitica" && conta.natureza === "D") && <p className="text-xs text-amber-800">Não há conta analítica de natureza devedora no plano de contas.</p>}
          </fieldset>
          {!fluxoCaixa.disponivel && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Fluxo pendente: {fluxoCaixa.motivo}</p>}
          {fluxoCaixa.disponivel && <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded border p-3"><span className="text-xs text-slate-500">Saldo inicial</span><strong className="block">{moedaContabil(fluxoCaixa.saldoInicialCentavos)}</strong></div><div className="rounded border p-3"><span className="text-xs text-slate-500">Entradas no período</span><strong className="block text-emerald-700">{moedaContabil(fluxoCaixa.entradasCentavos)}</strong></div><div className="rounded border p-3"><span className="text-xs text-slate-500">Saídas no período</span><strong className="block text-rose-700">{moedaContabil(fluxoCaixa.saidasCentavos)}</strong></div><div className="rounded border p-3"><span className="text-xs text-slate-500">Saldo final calculado</span><strong className="block">{moedaContabil(fluxoCaixa.saldoFinalCentavos)}</strong></div></div>
            <p role="status" className={`rounded-md border p-3 text-xs ${diferencaFluxoCaixaContabilidadeCentavos === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}><strong>Conferência interna com o balancete:</strong> saldo das contas de caixa/bancos selecionadas {moedaContabil(saldoContabilDisponibilidadesCentavos)}; diferença entre o fluxo calculado e o saldo contábil {moedaContabil(diferencaFluxoCaixaContabilidadeCentavos || 0)}. {diferencaFluxoCaixaContabilidadeCentavos === 0 ? "Os totais internos conciliam neste período; isso não representa auditoria nem validação oficial." : "Há diferença para revisar. Nenhum valor foi ajustado automaticamente."}</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Contrapartida</th><th className="px-3 py-2">Histórico</th><th className="px-3 py-2 text-right">Entrada</th><th className="px-3 py-2 text-right">Saída</th></tr></thead><tbody>{fluxoCaixa.linhas.map((linha, indice) => <tr key={`${linha.referencia}-${linha.conta}-${indice}`} className="border-t border-slate-100"><td className="px-3 py-2">{dataLegivelContabil(linha.dataISO)}</td><td className="px-3 py-2">{linha.conta}</td><td className="px-3 py-2">{linha.contraparte}</td><td className="px-3 py-2">{linha.historico}<span className="block text-[10px] text-slate-500">{linha.referencia}</span></td><td className="px-3 py-2 text-right">{linha.entrada ? moedaContabil(linha.entrada) : "—"}</td><td className="px-3 py-2 text-right">{linha.saida ? moedaContabil(linha.saida) : "—"}</td></tr>)}{!fluxoCaixa.linhas.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nenhum movimento definitivo de caixa ou banco nesta competência.</td></tr>}</tbody></table></div>
          </>}
        </div>}
      </div>

      <p className="text-[11px] text-slate-600">Relatórios internos do Contábil, gerados com lançamentos definitivos e plano de contas desta empresa. Não são livros autenticados, demonstrações assinadas ou arquivos ECD/ECF transmitidos.</p>
      <p className="text-[11px] text-slate-600">A aba Revisão e Auditoria mantém a trilha dos lançamentos manuais e estornos, incluindo proposta, decisão, usuário e horário. Registros antigos sem autoria recuperável são identificados como históricos sem comprovação retroativa.</p>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        <h3 className="font-bold">Autenticação oficial da ECD</h3>
        <p className="mt-1">A obrigatoriedade depende do enquadramento e das exceções aplicáveis à entidade e ao ano; o sistema não presume a entrega só pelo regime tributário. O leiaute oficial publicado atualmente é o 9 (manual atualizado em janeiro de 2026). O programa validador oficial da ECD está na versão 10.4.1, válida para o ano-calendário 2025, situações especiais de 2026 e anos anteriores. O Murade ainda não gera esse TXT nem executa a validação oficial.</p>
        <div className="mt-3 rounded-md border border-amber-200 bg-white p-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h4 className="font-bold">Conferência prévia local da ECD</h4><p className="mt-1 text-[11px]">Verifica dados existentes no workspace desta empresa; não monta TXT, não confirma obrigatoriedade e não equivale à validação pelo PGE.</p></div>
            <label className="font-semibold">Ano-calendário
              <input type="number" min="1900" max="2100" value={anoECD} onChange={(event) => setAnoECD(event.target.value)} className="ml-2 w-24 rounded border border-amber-300 px-2 py-1" />
            </label>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {checksECD.map((item) => <li key={item.titulo} className={`rounded border p-2 ${item.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
              <strong>{item.ok ? "✓" : "Pendente"} · {item.titulo}</strong><span className="mt-1 block text-[11px]">{item.detalhe}</span>
            </li>)}
          </ul>
          <div className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white">
            <div className="border-b border-amber-100 px-3 py-2 font-bold">Movimento anual por conta — {anoECD}</div>
            <p className="px-3 py-2 text-[11px] text-slate-600">Soma apenas lançamentos definitivos válidos do ano selecionado. Não inclui rascunhos nem saldos iniciais e não substitui a conferência dos saldos de abertura.</p>
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-amber-50 text-[10px] uppercase text-slate-600"><tr><th className="px-3 py-2">Conta</th><th className="px-3 py-2">Natureza</th><th className="px-3 py-2 text-right">Débitos no ano</th><th className="px-3 py-2 text-right">Créditos no ano</th></tr></thead>
              <tbody>{movimentosPorContaECD.length === 0
                ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Nenhuma conta com lançamento definitivo válido em {anoECD}.</td></tr>
                : movimentosPorContaECD.map((item) => <tr key={item.conta.codigo} className="border-t border-slate-100"><td className="px-3 py-2">{item.conta.codigo} — {item.conta.descricao || <span className="font-semibold text-amber-700">Descrição pendente</span>}</td><td className="px-3 py-2">{item.conta.natureza === "D" ? "Devedora" : "Credora"}</td><td className="px-3 py-2 text-right tabular-nums">{moedaContabil(item.debitosCentavos)}</td><td className="px-3 py-2 text-right tabular-nums">{moedaContabil(item.creditosCentavos)}</td></tr>)}</tbody>
            </table>
            {invalidosAnoECD.length > 0 && <p className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">Existem {invalidosAnoECD.length} lançamento(s) inválido(s) no ano; eles não aparecem na tabela. Corrija a origem antes de usar os totais.</p>}
          </div>
          <p role="status" className={`mt-3 rounded p-2 ${checklistECDLiberado ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}>
            {checklistECDLiberado ? "Conferência local sem pendências detectadas. Ainda é necessário gerar/importar a escrituração no PGE e verificar todos os avisos e erros oficiais." : "Preparação local pendente. Confira os itens destacados no cadastro da empresa, plano de contas, lançamentos ou revisão."}
          </p>
          <button type="button" onClick={exportarChecklistECD} disabled={!workspaceCarregado || !empresa.cnpj || !/^\d{4}$/.test(anoECD)} className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Exportar checklist interno CSV</button>
        </div>
        {workspaceCarregado && /^\d{4}$/.test(anoECD) && <EcfPresumidoPainel empresaRegime={empresa.regime} cnpj={String(empresa.cnpj || "")} ano={Number(anoECD)} receitaContabilPorTrimestre={receitaPorTrimestreECF} />}
        {workspaceCarregado && /^\d{4}$/.test(anoECD) && <EcfRealPainel empresaRegime={empresa.regime} cnpj={String(empresa.cnpj || "")} ano={Number(anoECD)} resultadoContabilCentavos={resultadoAnualECF.resultado} irpjContabilizadoCentavos={resultadoAnualECF.irpj} csllContabilizadaCentavos={resultadoAnualECF.csll} />}
        {workspaceCarregado && /^\d{4}$/.test(anoECD) && <EcfRealPeriodosPainel empresaRegime={empresa.regime} cnpj={String(empresa.cnpj || "")} ano={Number(anoECD)} receitaPorMesCentavos={receitaPorMesECF} resultadoPorTrimestre={resultadoPorTrimestreECF} />}
        {workspaceCarregado && /^\d{4}$/.test(anoECD) && <EcdGeradorPainel empresa={empresa} ano={anoECD} contas={contas} lancamentos={relatoriosECD.validos} onMapeamentoReferencial={onMapeamentoReferencial} />}
        <p className="mt-2 rounded-md border border-amber-200 bg-white/70 p-2"><strong>Limite atual do Murade:</strong> esta tela exporta relatório interno em PDF para impressão e planilha XLS. O arquivo estruturado TXT da ECD (com Balanço, DRE e encerramento do resultado) é gerado no painel acima. Portanto, estes relatórios em PDF/XLS não devem ser enviados como ECD nem são autenticados por esta exportação.</p>
        <a href="https://sped.rfb.gov.br/projeto/show/273" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold text-amber-950 hover:bg-amber-100">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir página oficial da ECD no SPED
        </a>
        <a href="https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/download/sped/ecd" target="_blank" rel="noreferrer" className="ml-2 mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400 bg-white px-3 py-2 font-bold text-amber-950 hover:bg-amber-100">
          <ExternalLink className="h-3.5 w-3.5" /> Baixar/abrir o validador oficial ECD
        </a>
        <p className="mt-2 text-[11px]">A Receita Federal lista exceções à obrigatoriedade, incluindo Simples Nacional e casos específicos de lucro presumido; a análise deve ser feita para o CNPJ e o ano-calendário. Consulte as <a className="font-semibold underline" href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/ecd/ecd/" target="_blank" rel="noreferrer">perguntas frequentes oficiais da ECD</a> e o <a className="font-semibold underline" href="https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/ecd/manuais-e-documentos-tecnicos/manual_de_orientacao_da_ecd_leiaute_9_janeiro_2026.pdf" target="_blank" rel="noreferrer">Manual da ECD — Leiaute 9, atualização de janeiro de 2026</a>.</p>
      </section>

      {livros.length > 0 && <section className="rounded-lg border border-slate-200 p-3 text-xs text-slate-700"><h3 className="font-bold">Outras obrigações cadastradas</h3><ul className="mt-2 space-y-1">{livros.map((livro) => <li key={livro.id}>{livro.titulo} · {livro.competencia} · situação local: {livro.status}</li>)}</ul></section>}

      <div id="contabil-books-print" className="hidden">
        <div className="contabil-print-heading"><h1>Livros contábeis — relatório interno</h1><strong>{empresa.razaoSocial || "Empresa não informada"}</strong><div>CNPJ: {empresa.cnpj || "Não informado"} · {periodoDescricao}</div><div>Gerado em {new Date().toLocaleString("pt-BR")}</div></div>
        <section className="contabil-print-page"><h2>Livro Diário — numeração interna do relatório</h2><table><thead><tr><th>Nº</th><th>Data</th><th>Documento / histórico</th><th>Conta débito</th><th>Conta crédito</th><th>Valor</th><th>Origem</th></tr></thead><tbody>{relatorios.doPeriodo.map((item, indice) => <tr key={`pdf-diario-${item.original.id}`}><td>{indice + 1}</td><td>{dataLegivelContabil(item.dataISO)}</td><td>{item.original.documentoRef || item.original.id}<br />{item.original.historico}</td><td>{item.debito.codigo} — {item.debito.descricao}</td><td>{item.credito.codigo} — {item.credito.descricao}</td><td className="valor">{moedaContabil(item.valorCentavos)}</td><td>{item.original.origem}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>Total</td><td className="valor">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td /></tr></tfoot></table></section>
        <section className="contabil-print-page"><h2>Livro Razão — numeração interna do relatório</h2><table><thead><tr><th>Nº</th><th>Data</th><th>Conta</th><th>Histórico</th><th>Contrapartida</th><th>Débito</th><th>Crédito</th><th>Saldo</th></tr></thead><tbody>{relatorios.razao.map((item, indice) => <tr key={`pdf-razao-${item.conta.codigo}-${item.dataISO}-${item.referencia}-${indice}`}><td>{indice + 1}</td><td>{dataLegivelContabil(item.dataISO)}</td><td>{item.conta.codigo}</td><td>{item.historico}<br />{item.referencia}</td><td>{item.contraPartidaCodigo} {item.contraPartidaNome}</td><td className="valor">{moedaContabil(item.debitoCentavos)}</td><td className="valor">{moedaContabil(item.creditoCentavos)}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos || item.saldoCredorCentavos)} {item.saldoDevedorCentavos ? "D" : item.saldoCredorCentavos ? "C" : ""}</td></tr>)}</tbody></table></section>
        <section className="contabil-print-page"><h2>Balancete de Verificação</h2><table><thead><tr><th>Conta</th><th>Descrição</th><th>Mov. débito</th><th>Mov. crédito</th><th>Saldo devedor</th><th>Saldo credor</th></tr></thead><tbody>{balanceteVisivel.map((item) => <tr key={`pdf-balancete-${item.conta.codigo}`}><td>{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="valor">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="valor">{moedaContabil(item.creditoPeriodoCentavos)}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="valor">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Totais das contas analíticas</td><td className="valor">{moedaContabil(relatorios.totalDebitosCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalCreditosCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalSaldoDevedorCentavos)}</td><td className="valor">{moedaContabil(relatorios.totalSaldoCredorCentavos)}</td></tr><tr><td colSpan={6}>Conferência local: {estadoConferenciaBalancete} · diferença devedora − credora: {moedaContabil(diferencaBalanceteCentavos)}</td></tr></tfoot></table></section>
        <section className="contabil-print-page"><h2>DRE gerencial</h2><p>Classificação pelas descrições das contas e grupos superiores; contas sem descrição reconhecível não são inferidas.</p><table><thead><tr><th>Grupo</th><th>Conta</th><th>Descrição</th><th>Crédito</th><th>Débito</th><th>Saldo</th></tr></thead><tbody>{[...dre.receitas.map((item) => ({ ...item, grupo: "Receitas", saldo: item.credito - item.debito })), ...dre.despesas.map((item) => ({ ...item, grupo: "Despesas", saldo: item.debito - item.credito }))].map((item) => <tr key={`pdf-dre-${item.conta.codigo}`}><td>{item.grupo}</td><td>{item.conta.codigo}</td><td>{item.conta.descricao}</td><td className="valor">{moedaContabil(item.credito)}</td><td className="valor">{moedaContabil(item.debito)}</td><td className="valor">{moedaContabil(item.saldo)}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>Resultado gerencial</td><td className="valor">{moedaContabil(dre.resultado)}</td></tr></tfoot></table></section>
        <section className="contabil-print-page"><h2>Balanço Patrimonial gerencial</h2><p>Classificação pelas descrições das contas e grupos superiores; contas sem descrição reconhecível não são inferidas.</p><table><thead><tr><th>Grupo</th><th>Conta</th><th>Descrição</th><th>Saldo devedor</th><th>Saldo credor</th></tr></thead><tbody>{contasPatrimoniais.map((item) => <tr key={`pdf-bp-${item.conta.codigo}`}><td>{rotuloGrupoDemonstracao(item.conta, contas)}</td><td>{item.conta.codigo}</td><td>{item.conta.descricao}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="valor">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Ativo</td><td className="valor">{moedaContabil(totalAtivo)}</td><td /></tr><tr><td colSpan={3}>Passivo</td><td /><td className="valor">{moedaContabil(totalPassivo)}</td></tr><tr><td colSpan={3}>Patrimônio líquido</td><td /><td className="valor">{moedaContabil(totalPatrimonio)}</td></tr><tr><td colSpan={5}>Conferência aritmética interna: {estadoConferenciaBalanco} · diferença Ativo − Passivo − Patrimônio líquido: {moedaContabil(diferencaBalancoCentavos)}</td></tr></tfoot></table></section>
        {fluxoCaixa.disponivel && <section className="contabil-print-page"><h2>Fluxo de Caixa interno</h2><p>Baseado em contas de Caixa/Bancos explicitamente selecionadas e lançamentos definitivos. Não classifica atividades operacionais, de investimento ou financiamento.</p><p>Saldo inicial: {moedaContabil(fluxoCaixa.saldoInicialCentavos)} · Entradas: {moedaContabil(fluxoCaixa.entradasCentavos)} · Saídas: {moedaContabil(fluxoCaixa.saidasCentavos)} · Saldo final calculado: {moedaContabil(fluxoCaixa.saldoFinalCentavos)}</p><table><thead><tr><th>Data</th><th>Conta</th><th>Contrapartida</th><th>Histórico</th><th>Entrada</th><th>Saída</th></tr></thead><tbody>{fluxoCaixa.linhas.map((item, indice) => <tr key={`pdf-cash-${item.referencia}-${indice}`}><td>{dataLegivelContabil(item.dataISO)}</td><td>{item.conta}</td><td>{item.contraparte}</td><td>{item.historico}<br/>{item.referencia}</td><td className="valor">{moedaContabil(item.entrada)}</td><td className="valor">{moedaContabil(item.saida)}</td></tr>)}</tbody></table></section>}
        <section className="contabil-print-page"><h2>Pendências de classificação nas demonstrações gerenciais</h2><p>As contas abaixo foram excluídas dos totais de DRE e Balanço até que o plano seja revisado. O relatório não infere sua natureza.</p><h3>Movimentos fora da DRE</h3><table><thead><tr><th>Conta</th><th>Descrição</th><th>Débito no período</th><th>Crédito no período</th></tr></thead><tbody>{contasSemClassificacaoDRE.map((item) => <tr key={`pdf-dre-pendente-${item.conta.codigo}`}><td>{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="valor">{moedaContabil(item.debitoPeriodoCentavos)}</td><td className="valor">{moedaContabil(item.creditoPeriodoCentavos)}</td></tr>)}{!contasSemClassificacaoDRE.length && <tr><td colSpan={4}>Nenhum movimento sem classificação.</td></tr>}</tbody></table><h3>Saldos fora do Balanço</h3><table><thead><tr><th>Conta</th><th>Descrição</th><th>Saldo devedor</th><th>Saldo credor</th></tr></thead><tbody>{contasSemClassificacaoBalanco.map((item) => <tr key={`pdf-bp-pendente-${item.conta.codigo}`}><td>{item.conta.codigo}</td><td>{item.conta.descricao || "Nome não informado"}</td><td className="valor">{moedaContabil(item.saldoDevedorCentavos)}</td><td className="valor">{moedaContabil(item.saldoCredorCentavos)}</td></tr>)}{!contasSemClassificacaoBalanco.length && <tr><td colSpan={4}>Nenhum saldo sem classificação.</td></tr>}</tbody></table></section>
        <p className="contabil-print-disclaimer">Relatório interno. Não é livro autenticado, demonstração assinada nem obrigação transmitida.</p>
      </div>
    </section>
  );
};
