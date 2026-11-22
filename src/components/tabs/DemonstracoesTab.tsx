// Tela "Demonstrações e relatórios": DFC (indireta e direta), DMPL, notas explicativas, índices e gráficos, relatório para o
// cliente, classificação das contas, ECF (Bloco Y e Parte B) e o painel do escritório. Tudo calculado dos lançamentos aprovados.
// Opção manual de cada coisa aqui; o Robô Conferidor das Demonstrações confere sozinho (botão "Rodar agora") e a Agente faz por voz.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Printer, RefreshCw, Share2 } from "lucide-react";
import type { ContaPlano, EmpresaDados, LancamentoContabil } from "../../types";
import {
  CATEGORIAS_PATRIMONIAIS, CATEGORIAS_RESULTADO, COLUNAS_DMPL, ROTULO_CATEGORIA, calcularDfc, calcularDmpl, calcularIndices, mapaCategorias,
  modeloNotasExplicativas, normaSugerida, pendenciasDasNotas, saldosNoFimDe, serie12Meses, sugerirCategoria,
  type CategoriaDemonstracao, type NormaPequenas, type NotasExplicativas, type SecaoDfc,
} from "../../utils/demonstracoesAvancadas";
import { gerarWorkbookExcel, moedaContabil } from "../../utils/livrosContabeis";
import { escaparHtml, htmlRelatorioCliente, svgEvolucao, valorIndice } from "../../utils/relatorioCliente";
import { saldosParteB, type ComplementosEcfAno, type ContaParteB, type EstabY540, type SocioY600 } from "../../services/ecfComplementosService";
import { confirmarNaTela, perguntarNaTela } from "../../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "../ConfirmaExclusaoDuasEtapas";
import { CampoData, CampoMes } from '../CampoData';

type Aba = "dfc" | "dmpl" | "notas" | "indices" | "cliente" | "classificacao" | "ecf" | "painel";
const ABAS: Array<[Aba, string]> = [["dfc", "DFC"], ["dmpl", "DMPL"], ["notas", "Notas explicativas"], ["indices", "Índices e gráficos"], ["cliente", "Relatório para o cliente"], ["classificacao", "Classificação das contas"], ["ecf", "ECF: Bloco Y e Parte B"], ["painel", "Painel do escritório"]];
const SECAO_ROTULO: Record<SecaoDfc, string> = { operacional: "Atividades operacionais", investimento: "Atividades de investimento", financiamento: "Atividades de financiamento", nao_classificada: "Contas sem classificação (classifique para fechar a DFC)" };
const hoje = () => new Date().toISOString().slice(0, 7);
const mesAnoBR = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const botao = "inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50";
const botaoClaro = "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-50";
const campo = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob(["﻿", conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function imprimir(titulo: string, corpo: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title><style>body{font:12px Arial,sans-serif;margin:24px;color:#0f172a}h1{font-size:16px}h2{font-size:13px;margin-top:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}.v{text-align:right;white-space:nowrap}.forte td{font-weight:bold;background:#f1f5f9}p{white-space:pre-wrap}</style></head><body>${corpo}<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
}

interface Props {
  empresa: EmpresaDados;
  contas: ContaPlano[];
  lancamentos: LancamentoContabil[];
  workspaceCarregado: boolean;
  workspacePersistido: boolean;
  onAtualizarEmpresa: (parcial: Partial<EmpresaDados>) => void;
  onNavegar: (tela: string, cnpj?: string) => void;
  onDadosAtualizados: (cnpj: string, dados: Record<string, any>, versao: number | null) => void;
}

export const DemonstracoesTab: React.FC<Props> = ({ empresa, contas, lancamentos, workspaceCarregado, workspacePersistido, onAtualizarEmpresa, onNavegar, onDadosAtualizados }) => {
  const [aba, setAba] = useState<Aba>("dfc");
  const compEmpresa = /^\d{4}-\d{2}$/.test(empresa.competencia || "") ? empresa.competencia : hoje();
  const [competencia, setCompetencia] = useState(compEmpresa);
  const [de, setDe] = useState(`${compEmpresa.slice(0, 4)}-01`);
  const [metodo, setMetodo] = useState<"indireto" | "direto">("indireto");
  const [ano, setAno] = useState(Number(compEmpresa.slice(0, 4)) - (Number(compEmpresa.slice(5)) <= 6 ? 1 : 0));
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const ajustes = empresa.classificacaoDemonstracoes;
  const lancs = workspaceCarregado ? lancamentos : [];
  const cnpj = String(empresa.cnpj || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

  // Achados do robô para esta empresa (só leitura)
  const [achados, setAchados] = useState<Array<{ id: string; nivel: string; texto: string }>>([]);
  const carregarAchados = useCallback(async () => {
    if (cnpj.length !== 14) return;
    try { const r = await fetch(`/api/demonstracoes/${encodeURIComponent(cnpj)}/resumo?competencia=${encodeURIComponent(competencia)}`, { credentials: "include", cache: "no-store" }); const j = await r.json(); setAchados(j?.sucesso ? j.achados || [] : []); } catch { setAchados([]); }
  }, [cnpj, competencia]);
  useEffect(() => { void carregarAchados(); }, [carregarAchados]);
  const rodarAgora = async () => {
    setMsg(null);
    try { const r = await fetch("/api/demonstracoes/conferir-agora", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" }); const j = await r.json().catch(() => ({})); setMsg({ erro: !j.sucesso, texto: j.mensagem || j.motivo || "Não foi possível rodar agora." }); if (j.sucesso) window.setTimeout(() => void carregarAchados(), 15_000); } catch { setMsg({ erro: true, texto: "Sem conexão com o servidor." }); }
  };

  const dfc = useMemo(() => (aba === "dfc" ? calcularDfc(contas, lancs, de, competencia, ajustes) : null), [aba, contas, lancs, de, competencia, ajustes]);
  const dmpl = useMemo(() => (aba === "dmpl" ? calcularDmpl(contas, lancs, ano, ajustes) : null), [aba, contas, lancs, ano, ajustes]);
  const ind = useMemo(() => (aba === "indices" || aba === "cliente" ? calcularIndices(contas, lancs, competencia, ajustes) : null), [aba, contas, lancs, competencia, ajustes]);
  const serie = useMemo(() => (aba === "indices" || aba === "cliente" ? serie12Meses(contas, lancs, competencia, ajustes) : []), [aba, contas, lancs, competencia, ajustes]);
  const cab = `<h1>${escaparHtml(empresa.razaoSocial || "")}</h1><p>CNPJ ${escaparHtml(empresa.cnpj)}</p>`;

  // ---------------- DFC ----------------
  const linhasDfc = dfc ? (metodo === "indireto" ? dfc.indireto.linhas : dfc.direto.linhas) : [];
  const totaisDfc = dfc ? (metodo === "indireto" ? dfc.indireto.totais : dfc.direto.totais) : null;
  const secoesDfc: SecaoDfc[] = ["operacional", "investimento", "financiamento", "nao_classificada"];
  const exportarDfc = (tipo: "excel" | "pdf") => {
    if (!dfc || !totaisDfc) return;
    const titulo = `Demonstração dos Fluxos de Caixa — método ${metodo} — ${mesAnoBR(de)} a ${mesAnoBR(competencia)}`;
    if (tipo === "excel") {
      const linhas: (string | number)[][] = [[titulo], [empresa.razaoSocial || "", `CNPJ ${empresa.cnpj}`], ["Atividade", "Descrição", "Valor (R$)"]];
      for (const s of secoesDfc) { const ls = linhasDfc.filter((l) => l.secao === s); if (!ls.length) continue; for (const l of ls) linhas.push([SECAO_ROTULO[s], l.rotulo, l.centavos / 100]); linhas.push([SECAO_ROTULO[s], "Caixa líquido da atividade", totaisDfc[s] / 100]); }
      linhas.push(["", "Variação do caixa", dfc.variacaoCaixa / 100], ["", "Caixa no início", dfc.caixaInicial / 100], ["", "Caixa no fim", dfc.caixaFinal / 100], ["", dfc.confere ? "Confere com a variação do caixa" : `Diferença: ${moedaContabil(dfc.diferenca)}`], ["NBC TG 03 (R3) / NBC TG 1001, seção 7 — relatório gerado dos lançamentos aprovados; revise antes de publicar."]);
      baixar(`DFC-${cnpj}-${de}-a-${competencia}.xls`, gerarWorkbookExcel([{ nome: "DFC", linhas }]), "application/vnd.ms-excel;charset=utf-8");
    } else {
      const corpo = secoesDfc.map((s) => { const ls = linhasDfc.filter((l) => l.secao === s); if (!ls.length) return ""; return `<h2>${SECAO_ROTULO[s]}</h2><table>${ls.map((l) => `<tr><td>${escaparHtml(l.rotulo)}</td><td class="v">${moedaContabil(l.centavos)}</td></tr>`).join("")}<tr class="forte"><td>Caixa líquido da atividade</td><td class="v">${moedaContabil(totaisDfc[s])}</td></tr></table>`; }).join("");
      imprimir(titulo, `${cab}<h1>${escaparHtml(titulo)}</h1>${corpo}<table><tr class="forte"><td>Aumento / (redução) do caixa</td><td class="v">${moedaContabil(dfc.variacaoCaixa)}</td></tr><tr><td>Caixa e equivalentes no início</td><td class="v">${moedaContabil(dfc.caixaInicial)}</td></tr><tr><td>Caixa e equivalentes no fim</td><td class="v">${moedaContabil(dfc.caixaFinal)}</td></tr></table>`);
    }
  };

  // ---------------- DMPL ----------------
  const exportarDmpl = (tipo: "excel" | "pdf") => {
    if (!dmpl) return;
    const linhas = [dmpl.saldoInicial, ...dmpl.linhas, dmpl.saldoFinal];
    const titulo = `${dmpl.soDlpa ? "Demonstração dos Lucros ou Prejuízos Acumulados" : "Demonstração das Mutações do Patrimônio Líquido"} — ${dmpl.ano}`;
    if (tipo === "excel") baixar(`DMPL-${cnpj}-${dmpl.ano}.xls`, gerarWorkbookExcel([{ nome: "DMPL", linhas: [[titulo], [empresa.razaoSocial || "", `CNPJ ${empresa.cnpj}`], ["Descrição", ...COLUNAS_DMPL.map((c) => c.rotulo), "Total"], ...linhas.map((l) => [l.rotulo, ...COLUNAS_DMPL.map((c) => l.valores[c.id] / 100), l.total / 100])] }]), "application/vnd.ms-excel;charset=utf-8");
    else imprimir(titulo, `${cab}<h1>${escaparHtml(titulo)}</h1><table><tr><th>Descrição</th>${COLUNAS_DMPL.map((c) => `<th class="v">${c.rotulo}</th>`).join("")}<th class="v">Total</th></tr>${linhas.map((l, i) => `<tr${i === 0 || i === linhas.length - 1 ? ' class="forte"' : ""}><td>${escaparHtml(l.rotulo)}</td>${COLUNAS_DMPL.map((c) => `<td class="v">${moedaContabil(l.valores[c.id])}</td>`).join("")}<td class="v">${moedaContabil(l.total)}</td></tr>`).join("")}</table>`);
  };

  // ---------------- Notas ----------------
  const notasGravadas = empresa.notasExplicativas?.[String(ano)];
  const [rascunhoNotas, setRascunhoNotas] = useState<NotasExplicativas | null>(null);
  useEffect(() => setRascunhoNotas(notasGravadas ? JSON.parse(JSON.stringify(notasGravadas)) : null), [notasGravadas, ano, cnpj]);
  const receitaAno = useMemo(() => (aba === "notas" ? calcularIndices(contas, lancs, `${ano}-12`, ajustes).dre.receitaBruta : 0), [aba, contas, lancs, ano, ajustes]);
  const [normaEscolhida, setNormaEscolhida] = useState<NormaPequenas | "">("");
  const normaAtual: NormaPequenas = (normaEscolhida || notasGravadas?.norma || normaSugerida(receitaAno)) as NormaPequenas;
  const gerarModelo = () => {
    const cats = mapaCategorias(contas, ajustes);
    const s = saldosNoFimDe(contas, lancs, `${ano}-12`);
    let capital = 0; for (const [c, cat] of cats) if (cat === "capital") capital -= s.get(c) ?? 0;
    const usa = (cat: CategoriaDemonstracao) => [...cats.values()].includes(cat);
    setRascunhoNotas(modeloNotasExplicativas(empresa, ano, normaAtual, { capitalSocialCentavos: capital > 0 ? capital : undefined, estoques: usa("estoque"), imobilizado: usa("imobilizado"), emprestimos: usa("emprestimo_cp") || usa("emprestimo_lp") }));
  };
  const salvarNotas = () => {
    if (!rascunhoNotas) return;
    onAtualizarEmpresa({ notasExplicativas: { ...(empresa.notasExplicativas || {}), [String(ano)]: { ...rascunhoNotas, norma: normaAtual, atualizadoEm: new Date().toISOString() } } });
    setMsg({ erro: false, texto: `Notas explicativas de ${ano} salvas. ${pendenciasDasNotas(rascunhoNotas).length ? `Ainda há texto entre colchetes em: ${pendenciasDasNotas(rascunhoNotas).join(", ")}.` : "Sem texto pendente."}` });
  };

  // ---------------- Classificação ----------------
  const [soPendentes, setSoPendentes] = useState(false);
  const [rascunhoClass, setRascunhoClass] = useState<Record<string, string>>({});
  useEffect(() => setRascunhoClass({ ...(ajustes || {}) }), [ajustes, cnpj]);
  const contasComMovimento = useMemo(() => {
    if (aba !== "classificacao") return [];
    const usadas = new Set(lancs.flatMap((l) => [l.contaDebitoCodigo, l.contaCreditoCodigo]));
    return contas.filter((c) => c.tipo === "analitica" && (usadas.has(c.codigo) || Number(c.saldoInicial || 0) !== 0));
  }, [aba, contas, lancs]);
  const salvarClassificacao = () => {
    const limpo = Object.fromEntries(Object.entries(rascunhoClass).filter(([cod, cat]) => cat && contas.some((c) => c.codigo === cod) && cat !== sugerirCategoria(contas.find((c) => c.codigo === cod)!, contas)));
    onAtualizarEmpresa({ classificacaoDemonstracoes: limpo });
    setMsg({ erro: false, texto: `Classificação salva (${Object.keys(limpo).length} conta(s) com escolha sua; as outras seguem a sugestão do sistema).` });
  };

  // ---------------- ECF Y / Parte B ----------------
  const compAno: ComplementosEcfAno = empresa.ecfComplementos?.[String(ano)] || { y600: [], y540: [], parteB: [] };
  const [rascunhoEcf, setRascunhoEcf] = useState<ComplementosEcfAno>(compAno);
  useEffect(() => setRascunhoEcf(JSON.parse(JSON.stringify(empresa.ecfComplementos?.[String(ano)] || { y600: [], y540: [], parteB: [] }))), [empresa.ecfComplementos, ano, cnpj]);
  const saldosPB = useMemo(() => saldosParteB({ ...(empresa.ecfComplementos || {}), [String(ano)]: rascunhoEcf }, ano), [empresa.ecfComplementos, rascunhoEcf, ano]);
  const salvarEcf = () => {
    onAtualizarEmpresa({ ecfComplementos: { ...(empresa.ecfComplementos || {}), [String(ano)]: rascunhoEcf } });
    setMsg({ erro: false, texto: `Bloco Y e Parte B de ${ano} salvos. Eles entram no arquivo da ECF (tela Livros Fiscais & ECD) e são conferidos lá.` });
  };
  const reais = (c?: number) => (c ? (c / 100).toFixed(2) : "");
  const centavos = (v: string) => Math.round(Number(String(v).replace(/\./g, "").replace(",", ".")) * 100) || 0;
  const setSocio = (i: number, p: Partial<SocioY600>) => setRascunhoEcf((r) => ({ ...r, y600: r.y600.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const setEstab = (i: number, p: Partial<EstabY540>) => setRascunhoEcf((r) => ({ ...r, y540: r.y540.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const setContaB = (i: number, p: Partial<ContaParteB>) => setRascunhoEcf((r) => ({ ...r, parteB: r.parteB.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const trazerSocios = () => {
    const qsa = empresa.qsa || [];
    if (!qsa.length) { setMsg({ erro: true, texto: "O cadastro da empresa não tem o quadro de sócios (QSA). Inclua os sócios à mão." }); return; }
    setRascunhoEcf((r) => ({ ...r, y600: [...r.y600, ...qsa.filter((q) => !r.y600.some((s) => s.nome === q.nome)).map((q) => ({ dtAlt: "", pais: "105", indQualif: "PF" as const, cpfCnpj: "", nome: q.nome, qualif: "", percCapTot: 0, percCapVot: 0 }))] }));
    setMsg({ erro: false, texto: "Sócios do cadastro trazidos. Complete CPF, data da última alteração, qualificação (código da tabela do programa da ECF) e percentuais." });
  };
  const { pedir: pedirExclusao, dialogo: dialogoExclusao } = useExclusaoDuasEtapas();
  const remover = async <T,>(lista: T[], i: number, oque: string, aplicar: (nova: T[]) => void) => {
    if (!(await pedirExclusao({ titulo: "Tirar da lista?", oQue: oque, consequencias: ["Sai só desta tela; o que está gravado só muda quando você clicar em Salvar."], irreversivel: false, comoVoltar: "Antes de salvar, é só sair da tela sem salvar." }))) return;
    aplicar(lista.filter((_x, k) => k !== i));
  };

  // ---------------- Painel do escritório ----------------
  const [painel, setPainel] = useState<any[] | null>(null);
  const [carregandoPainel, setCarregandoPainel] = useState(false);
  const carregarPainel = useCallback(async () => {
    setCarregandoPainel(true);
    try { const r = await fetch(`/api/painel-escritorio?competencia=${encodeURIComponent(competencia)}`, { credentials: "include", cache: "no-store" }); const j = await r.json(); if (j.sucesso) setPainel(j.empresas || []); else setMsg({ erro: true, texto: j.motivo || "Não consegui montar o painel." }); } catch { setMsg({ erro: true, texto: "Sem conexão com o servidor." }); }
    setCarregandoPainel(false);
  }, [competencia]);
  useEffect(() => { if (aba === "painel") void carregarPainel(); }, [aba, carregarPainel]);
  const marcarEntrega = async (linha: any, obrigacao: "ECD" | "ECF", desfazer: boolean) => {
    const anoObr = obrigacao === "ECD" ? linha.ecd.ano : linha.ecf.ano;
    let recibo = "";
    if (!desfazer) { const r = await perguntarNaTela(`Marcar a ${obrigacao} ${anoObr} de ${linha.nome} como ENTREGUE?\n\nSe quiser, digite o número do recibo (pode deixar em branco).`); if (r === null) return; recibo = r; }
    else if (!(await confirmarNaTela(`Voltar a ${obrigacao} ${anoObr} de ${linha.nome} para "a entregar"?`))) return;
    try {
      const r = await fetch("/api/painel-escritorio/entrega", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: linha.cnpj, obrigacao, ano: anoObr, recibo, desfazer }) });
      const j = await r.json().catch(() => ({}));
      setMsg({ erro: !j.sucesso, texto: j.mensagem || j.motivo || "Não foi possível." });
      if (j.sucesso && j.dados) onDadosAtualizados(linha.cnpj, j.dados, Number.isSafeInteger(Number(j.versao)) ? Number(j.versao) : null);
      if (j.sucesso) void carregarPainel();
    } catch { setMsg({ erro: true, texto: "Sem conexão com o servidor." }); }
  };

  // ---------------- Relatório para o cliente ----------------
  const [observacao, setObservacao] = useState("");
  const gerarRelatorioCliente = () => {
    if (!ind) return;
    const html = htmlRelatorioCliente({ empresa, competencia, balanco: ind.balanco, dre: ind.dre, indices: ind.indices, serie, observacao });
    const w = window.open("", "_blank");
    if (!w) { baixar(`relatorio-${cnpj}-${competencia}.html`, html, "text/html;charset=utf-8"); setMsg({ erro: false, texto: "O navegador bloqueou a janela; baixei o relatório (.html). Abra e use Imprimir → Salvar como PDF." }); return; }
    w.document.write(html); w.document.close();
  };
  const compartilhar = async () => {
    if (!ind) return;
    const html = htmlRelatorioCliente({ empresa, competencia, balanco: ind.balanco, dre: ind.dre, indices: ind.indices, serie, observacao }).replace(/<script>[\s\S]*?<\/script>/, "");
    const arquivo = new File([html], `relatorio-${cnpj}-${competencia}.html`, { type: "text/html" });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.share && nav.canShare?.({ files: [arquivo] })) { try { await nav.share({ files: [arquivo], title: `Relatório contábil ${mesAnoBR(competencia)}` }); return; } catch { /* cancelado */ } }
    baixar(arquivo.name, html, "text/html;charset=utf-8");
    setMsg({ erro: false, texto: "Este aparelho não compartilha arquivo direto; baixei o relatório (.html) para você enviar." });
  };

  const bloqueado = !workspaceCarregado;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xs sm:p-5" data-campo="demonstracoes-tela">
      <header className="flex flex-col gap-2 border-b border-slate-100 pb-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BarChart3 className="h-5 w-5 text-blue-700" /> Demonstrações e relatórios</h2>
          <p className="text-xs text-slate-600">{empresa.razaoSocial || "Empresa"} · calculado dos lançamentos aprovados. Relatórios gerenciais: revise antes de assinar ou publicar.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">Competência (até)
            <CampoMes data-campo="demonstracoes-competencia" className={campo} value={competencia} onChange={(e) => e.target.value && setCompetencia(e.target.value)} />
          </label>
          <button type="button" className={botaoClaro} data-campo="demonstracoes-rodar-agora" onClick={() => void rodarAgora()}><RefreshCw className="h-3.5 w-3.5" /> Rodar agora (conferência)</button>
        </div>
      </header>
      {msg && <div role={msg.erro ? "alert" : "status"} className={`rounded-lg border p-2 text-xs ${msg.erro ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{msg.texto}</div>}
      {bloqueado && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Carregando os dados da empresa…</div>}
      {!workspacePersistido && workspaceCarregado && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">Há alterações aguardando gravação no banco; o que você salvar aqui entra na mesma fila.</div>}
      {achados.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-xs" data-campo="demonstracoes-achados"><p className="font-bold">O Robô Conferidor das Demonstrações achou:</p><ul className="mt-0.5 list-disc pl-4">{achados.map((a) => <li key={a.id}>{a.nivel === "falta" ? "⛔" : "⚠️"} {a.texto}</li>)}</ul></div>}

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Demonstrações">
        {ABAS.map(([id, nome]) => <button key={id} type="button" role="tab" aria-selected={aba === id} data-campo={`demonstracoes-aba-${id}`} onClick={() => setAba(id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${aba === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{nome}</button>)}
      </div>

      {aba === "dfc" && dfc && totaisDfc && <div className="space-y-2">
        <h3 className="text-sm font-bold">Demonstração dos Fluxos de Caixa (DFC)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">De<CampoMes className={campo} value={de} max={competencia} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
          <label className="text-[11px] font-semibold text-slate-600">Método<select data-campo="dfc-metodo" className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value as "indireto" | "direto")}><option value="indireto">Indireto (parte do resultado)</option><option value="direto">Direto (entradas e saídas do caixa)</option></select></label>
          <button type="button" className={botao} data-campo="dfc-pdf" onClick={() => exportarDfc("pdf")}><Printer className="h-3.5 w-3.5" /> PDF</button>
          <button type="button" className={botaoClaro} data-campo="dfc-excel" onClick={() => exportarDfc("excel")}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[520px] text-xs"><tbody>
          {secoesDfc.map((s) => { const ls = linhasDfc.filter((l) => l.secao === s); if (!ls.length) return null; return <React.Fragment key={s}>
            <tr className="bg-slate-100"><td colSpan={2} className="px-2 py-1.5 font-bold">{SECAO_ROTULO[s]}</td></tr>
            {ls.map((l, i) => <tr key={`${s}-${i}`} className="border-t border-slate-100"><td className="px-2 py-1">{l.rotulo}</td><td className="px-2 py-1 text-right tabular-nums">{moedaContabil(l.centavos)}</td></tr>)}
            <tr className="border-t border-slate-300 font-bold"><td className="px-2 py-1">Caixa líquido da atividade</td><td className="px-2 py-1 text-right tabular-nums">{moedaContabil(totaisDfc[s])}</td></tr>
          </React.Fragment>; })}
          <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold"><td className="px-2 py-1.5">Aumento / (redução) do caixa</td><td className="px-2 py-1.5 text-right">{moedaContabil(dfc.variacaoCaixa)}</td></tr>
          <tr><td className="px-2 py-1">Caixa e equivalentes no início ({mesAnoBR(de)})</td><td className="px-2 py-1 text-right">{moedaContabil(dfc.caixaInicial)}</td></tr>
          <tr><td className="px-2 py-1">Caixa e equivalentes no fim ({mesAnoBR(competencia)})</td><td className="px-2 py-1 text-right">{moedaContabil(dfc.caixaFinal)}</td></tr>
        </tbody></table></div>
        <p role="status" className={`rounded-md border p-2 text-xs font-semibold ${dfc.confere ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>{dfc.confere ? "Confere: a soma das atividades é igual à variação do caixa (pelos dois métodos)." : `Não fecha: diferença de ${moedaContabil(dfc.diferenca)}.`}</p>
        {dfc.avisos.map((a) => <p key={a} className="text-xs text-amber-900">• {a}</p>)}
        <p className="text-[11px] text-slate-500">Base: NBC TG 03 (R3) e NBC TG 1001, seção 7 — operacionais, investimento e financiamento; juros e dividendos pagos em financiamento e recebidos em investimento (7.9); IRPJ/CSLL nas operacionais (7.10). Para microentidades (NBC TG 1002) a DFC não faz parte do conjunto obrigatório. A classificação de cada conta pode ser ajustada na aba “Classificação das contas”.</p>
      </div>}

      {aba === "dmpl" && dmpl && <div className="space-y-2">
        <h3 className="text-sm font-bold">{dmpl.soDlpa ? "Demonstração dos Lucros ou Prejuízos Acumulados (DLPA)" : "Demonstração das Mutações do Patrimônio Líquido (DMPL)"}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">Ano<input data-campo="dmpl-ano" type="number" min={2000} max={2100} className={campo} value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} /></label>
          <button type="button" className={botao} data-campo="dmpl-pdf" onClick={() => exportarDmpl("pdf")}><Printer className="h-3.5 w-3.5" /> PDF</button>
          <button type="button" className={botaoClaro} onClick={() => exportarDmpl("excel")}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[720px] text-xs">
          <thead className="bg-slate-100"><tr><th className="px-2 py-1.5 text-left">Descrição</th>{COLUNAS_DMPL.map((c) => <th key={c.id} className="px-2 py-1.5 text-right">{c.rotulo}</th>)}<th className="px-2 py-1.5 text-right">Total</th></tr></thead>
          <tbody>{[dmpl.saldoInicial, ...dmpl.linhas, dmpl.saldoFinal].map((l, i, arr) => <tr key={`${l.rotulo}-${i}`} className={`border-t border-slate-100 ${i === 0 || i === arr.length - 1 ? "bg-slate-50 font-bold" : ""}`}><td className="px-2 py-1">{l.rotulo}</td>{COLUNAS_DMPL.map((c) => <td key={c.id} className="px-2 py-1 text-right tabular-nums">{moedaContabil(l.valores[c.id])}</td>)}<td className="px-2 py-1 text-right tabular-nums">{moedaContabil(l.total)}</td></tr>)}</tbody>
        </table></div>
        <p role="status" className={`rounded-md border p-2 text-xs font-semibold ${dmpl.confereComBalanco ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>{dmpl.confereComBalanco ? "Confere com o patrimônio líquido do balanço em 31/12." : `Diferença com o balanço: ${moedaContabil(dmpl.diferenca)}.`}</p>
        {dmpl.avisos.map((a) => <p key={a} className="text-xs text-amber-900">• {a}</p>)}
        <p className="text-[11px] text-slate-500">Base: NBC TG 26 (R5) e NBC TG 1001, seção 6 (saldos iniciais, resultado, dividendos, aumentos/reduções de capital, saldos finais). Quando só há movimento em lucros acumulados, a norma permite apresentar só a DLPA (6.2); para microentidades a DLPA faz parte do conjunto (NBC TG 1002, 3.6). A ECD continua montando a DLPA/DMPL própria dela (J210/J215) na tela Livros Fiscais & ECD.</p>
      </div>}

      {aba === "notas" && <div className="space-y-2">
        <h3 className="text-sm font-bold">Notas explicativas (modelo simples ME/EPP)</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">Ano<input data-campo="notas-ano" type="number" min={2000} max={2100} className={campo} value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} /></label>
          <label className="text-[11px] font-semibold text-slate-600">Norma<select data-campo="notas-norma" className={campo} value={normaAtual} onChange={(e) => setNormaEscolhida(e.target.value as NormaPequenas)}><option value="NBC TG 1002">NBC TG 1002 — Microentidades (receita até R$ 4,8 mi)</option><option value="NBC TG 1001">NBC TG 1001 — Pequenas empresas (até R$ 78 mi)</option><option value="NBC TG 1000">NBC TG 1000 — Pequenas e médias empresas</option></select></label>
          <button type="button" className={botaoClaro} data-campo="notas-gerar-modelo" onClick={async () => { if (rascunhoNotas && !(await confirmarNaTela("Trocar o texto da tela pelo modelo? O que está salvo só muda se você clicar em Salvar."))) return; gerarModelo(); }}>Gerar modelo</button>
          <button type="button" className={botao} data-campo="notas-salvar" disabled={!rascunhoNotas} onClick={salvarNotas}>Salvar notas</button>
          <button type="button" className={botaoClaro} disabled={!rascunhoNotas} onClick={() => rascunhoNotas && imprimir(`Notas explicativas ${ano}`, `${cab}<h1>Notas explicativas às demonstrações contábeis de ${ano}</h1>${rascunhoNotas.secoes.map((s, i) => `<h2>${i + 1}. ${escaparHtml(s.titulo)}</h2><p>${escaparHtml(s.texto)}</p>`).join("")}`)}><Printer className="h-3.5 w-3.5" /> PDF</button>
        </div>
        <p className="text-[11px] text-slate-600">Receita bruta de {ano} na contabilidade: {moedaContabil(receitaAno)} → norma sugerida {normaSugerida(receitaAno)}. NBC TG 1002: notas não obrigatórias, mas incentivadas (3.7); declarar a conformidade e a atividade (3.2), incertezas de continuidade (3.3) e a adoção da norma (35.5). NBC TG 1001: notas fazem parte do conjunto completo (3.5), com base de elaboração, políticas e estimativas (8.4). O que está entre colchetes é o que só a empresa sabe: complete antes de assinar.</p>
        {!rascunhoNotas && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">Ainda não há notas de {ano}. Clique em “Gerar modelo” — ele usa só os dados do cadastro e da contabilidade.</p>}
        {rascunhoNotas && rascunhoNotas.secoes.map((s, i) => <div key={s.id} className="rounded-lg border border-slate-200 p-2">
          <input aria-label={`Título da nota ${i + 1}`} className="w-full rounded border border-transparent px-1 text-sm font-bold hover:border-slate-200" value={s.titulo} onChange={(e) => setRascunhoNotas((n) => n && ({ ...n, secoes: n.secoes.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)) }))} />
          <p className="px-1 text-[10px] text-slate-500">{s.base}</p>
          <textarea aria-label={`Texto da nota ${s.titulo}`} rows={Math.min(10, Math.max(3, s.texto.split("\n").length + 1))} className={`${campo} ${/\[[^\]]+\]/.test(s.texto) ? "border-amber-400 bg-amber-50/40" : ""}`} value={s.texto} onChange={(e) => setRascunhoNotas((n) => n && ({ ...n, secoes: n.secoes.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) }))} />
        </div>)}
        {rascunhoNotas && <button type="button" className={botaoClaro} onClick={() => setRascunhoNotas((n) => n && ({ ...n, secoes: [...n.secoes, { id: `extra-${Date.now()}`, titulo: "Nova nota", texto: "", base: "Incluída pela contadora" }] }))}>+ Incluir nota</button>}
      </div>}

      {aba === "indices" && ind && <div className="space-y-3">
        <h3 className="text-sm font-bold">Índices e gráficos — {mesAnoBR(competencia)}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-campo="indices-cartoes">
          {ind.indices.map((i) => <div key={i.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-700">{i.nome}</p>
            <p className="text-2xl font-black text-[#0F2B5B]">{valorIndice(i)}</p>
            <p className="text-[11px] text-slate-600">{i.explicacao}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-800">{i.leitura}</p>
            <p className="mt-1 text-[10px] text-slate-500">Fórmula: {i.formula}</p>
          </div>)}
        </div>
        <div className="rounded-lg border border-slate-200 p-2"><p className="text-xs font-bold">Receita líquida e resultado — últimos 12 meses</p><div dangerouslySetInnerHTML={{ __html: svgEvolucao(serie) }} /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-xs"><thead className="bg-slate-100"><tr><th className="px-2 py-1 text-left">Mês</th><th className="px-2 py-1 text-right">Receita líquida</th><th className="px-2 py-1 text-right">Resultado</th></tr></thead><tbody>{serie.map((p) => <tr key={p.competencia} className="border-t border-slate-100"><td className="px-2 py-1">{mesAnoBR(p.competencia)}</td><td className="px-2 py-1 text-right">{moedaContabil(p.receitaLiquida)}</td><td className={`px-2 py-1 text-right ${p.lucroLiquido < 0 ? "text-rose-700" : ""}`}>{moedaContabil(p.lucroLiquido)}</td></tr>)}</tbody></table></div>
        {ind.balanco.naoClassificado !== 0 && <p className="text-xs text-amber-900">• Há saldo em conta sem classificação ({moedaContabil(ind.balanco.naoClassificado)}): os índices podem ficar incompletos. Classifique na aba “Classificação das contas”.</p>}
        <p className="text-[11px] text-slate-500">Os índices são fórmulas usuais de análise das demonstrações (não são norma). Margens: de janeiro até o mês. Balanço: posição no fim do mês, com o resultado ainda não encerrado somado ao patrimônio líquido.</p>
      </div>}

      {aba === "cliente" && ind && <div className="space-y-2">
        <h3 className="text-sm font-bold">Relatório para o cliente — {mesAnoBR(competencia)}</h3>
        <p className="text-xs text-slate-600">Resumo do resultado do ano até o mês, situação patrimonial, os 6 índices com explicação simples e o gráfico dos 12 meses, num PDF bonito para mandar ao cliente. O Contábil ainda não tem caminho para o app do cliente do Fiscal: gere o PDF (Imprimir → Salvar como PDF) ou compartilhe o arquivo.</p>
        <div className="grid gap-2 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border p-2"><span className="text-slate-500">Receita líquida (ano)</span><strong className="block text-base">{moedaContabil(ind.dre.receitaLiquida)}</strong></div>
          <div className="rounded-lg border p-2"><span className="text-slate-500">{ind.dre.lucroLiquido >= 0 ? "Lucro (ano)" : "Prejuízo (ano)"}</span><strong className="block text-base">{moedaContabil(ind.dre.lucroLiquido)}</strong></div>
          <div className="rounded-lg border p-2"><span className="text-slate-500">Caixa e bancos</span><strong className="block text-base">{moedaContabil(ind.balanco.disponivel)}</strong></div>
          <div className="rounded-lg border p-2"><span className="text-slate-500">Patrimônio líquido</span><strong className="block text-base">{moedaContabil(ind.balanco.patrimonioLiquido)}</strong></div>
        </div>
        <label className="block text-[11px] font-semibold text-slate-600">Observações do contador (opcional, vai no relatório)<textarea data-campo="cliente-observacao" rows={3} className={campo} value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, 2000))} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} data-campo="cliente-gerar-pdf" disabled={!ind.dre.receitaBruta && !ind.balanco.ativoTotal} onClick={gerarRelatorioCliente}><Printer className="h-3.5 w-3.5" /> Gerar PDF para o cliente</button>
          <button type="button" className={botaoClaro} onClick={() => void compartilhar()}><Share2 className="h-3.5 w-3.5" /> Compartilhar arquivo</button>
        </div>
      </div>}

      {aba === "classificacao" && <div className="space-y-2">
        <h3 className="text-sm font-bold">Classificação das contas para DFC, DMPL e índices</h3>
        <p className="text-xs text-slate-600">O sistema sugere pela descrição da conta e dos grupos. Onde ele não souber (ou você discordar), escolha a categoria. Só as contas com movimento ou saldo aparecem.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> Só as sem classificação</label>
          <button type="button" className={botao} data-campo="classificacao-salvar" onClick={salvarClassificacao}>Salvar classificação</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[640px] text-xs"><thead className="bg-slate-100"><tr><th className="px-2 py-1 text-left">Conta</th><th className="px-2 py-1 text-left">Descrição</th><th className="px-2 py-1 text-left">Categoria</th></tr></thead><tbody>
          {contasComMovimento.map((c) => { const sug = sugerirCategoria(c, contas); const atual = rascunhoClass[c.codigo] || sug; if (soPendentes && atual !== "nao_classificada") return null; return <tr key={c.codigo} className={`border-t border-slate-100 ${atual === "nao_classificada" ? "bg-amber-50" : ""}`}>
            <td className="px-2 py-1 font-mono">{c.codigo}</td><td className="px-2 py-1">{c.descricao}</td>
            <td className="px-2 py-1"><select aria-label={`Categoria da conta ${c.codigo}`} className="w-full rounded border border-slate-300 bg-white p-1" value={atual} onChange={(e) => setRascunhoClass((r) => ({ ...r, [c.codigo]: e.target.value }))}>
              <option value="nao_classificada">— escolha —</option>
              <optgroup label="Balanço">{CATEGORIAS_PATRIMONIAIS.map((k) => <option key={k} value={k}>{ROTULO_CATEGORIA[k]}{k === sug ? " (sugestão)" : ""}</option>)}</optgroup>
              <optgroup label="Resultado">{CATEGORIAS_RESULTADO.map((k) => <option key={k} value={k}>{ROTULO_CATEGORIA[k]}{k === sug ? " (sugestão)" : ""}</option>)}</optgroup>
              <option value="ignorar">{ROTULO_CATEGORIA.ignorar}{sug === "ignorar" ? " (sugestão)" : ""}</option>
            </select></td></tr>; })}
          {!contasComMovimento.length && <tr><td colSpan={3} className="p-4 text-center text-slate-500">Nenhuma conta com movimento.</td></tr>}
        </tbody></table></div>
      </div>}

      {aba === "ecf" && <div className="space-y-3">
        <h3 className="text-sm font-bold">ECF — Bloco Y (Y600 sócios, Y540 receita por estabelecimento) e Parte B do e-Lalur/e-Lacs</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">Ano-calendário<input data-campo="ecf-y-ano" type="number" min={2014} max={2100} className={campo} value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} /></label>
          <button type="button" className={botao} data-campo="ecf-y-salvar" onClick={salvarEcf}>Salvar Bloco Y e Parte B</button>
          <button type="button" className={botaoClaro} onClick={() => onNavegar("livros")}><Download className="h-3.5 w-3.5" /> Ir para o arquivo da ECF</button>
        </div>
        <p className="text-[11px] text-slate-600">Campos pelo Manual de Orientação do Leiaute da ECF (Receita Federal). Os códigos de tabela — qualificação do sócio (Y600) e código padrão da Parte B (COD_PB_RFB do M010) — você copia da tabela do programa da ECF; o sistema não inventa códigos. Valide sempre no programa oficial.</p>

        <div className="rounded-lg border border-slate-200 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">Y600 — Sócios, titulares e dirigentes ({rascunhoEcf.y600.length})</p><div className="flex gap-1.5"><button type="button" className={botaoClaro} onClick={trazerSocios}>Trazer do cadastro (QSA)</button><button type="button" className={botaoClaro} onClick={() => setRascunhoEcf((r) => ({ ...r, y600: [...r.y600, { dtAlt: "", pais: "105", indQualif: "PF", cpfCnpj: "", nome: "", qualif: "", percCapTot: 0, percCapVot: 0 }] }))}>+ Sócio</button></div></div>
          {rascunhoEcf.y600.map((s, i) => <div key={i} className="mt-2 grid gap-1.5 rounded border border-slate-100 p-2 sm:grid-cols-4 text-[11px]">
            <label className="sm:col-span-2">Nome<input className={campo} value={s.nome} onChange={(e) => setSocio(i, { nome: e.target.value })} /></label>
            <label>PF / PJ / Fundo<select className={campo} value={s.indQualif} onChange={(e) => setSocio(i, { indQualif: e.target.value as SocioY600["indQualif"] })}><option value="PF">PF</option><option value="PJ">PJ</option><option value="FI">FI</option></select></label>
            <label>CPF/CNPJ<input className={campo} value={s.cpfCnpj} onChange={(e) => setSocio(i, { cpfCnpj: e.target.value })} /></label>
            <label>País (Brasil = 105)<input className={campo} value={s.pais} onChange={(e) => setSocio(i, { pais: e.target.value })} /></label>
            <label>Qualificação (código)<input className={campo} maxLength={2} value={s.qualif} onChange={(e) => setSocio(i, { qualif: e.target.value.replace(/\D/g, "") })} /></label>
            <label>Última alteração no quadro<CampoData className={campo} value={s.dtAlt} onChange={(e) => setSocio(i, { dtAlt: e.target.value })} /></label>
            <label>Saída (só se no ano)<CampoData className={campo} value={s.dtFim || ""} onChange={(e) => setSocio(i, { dtFim: e.target.value || undefined })} /></label>
            <label>% capital total<input type="number" step="0.0001" className={campo} value={s.percCapTot} onChange={(e) => setSocio(i, { percCapTot: Number(e.target.value) })} /></label>
            <label>% capital votante<input type="number" step="0.0001" className={campo} value={s.percCapVot} onChange={(e) => setSocio(i, { percCapVot: Number(e.target.value) })} /></label>
            <label>Pró-labore/aluguel (R$)<input inputMode="decimal" className={campo} value={reais(s.remTrabCentavos)} onChange={(e) => setSocio(i, { remTrabCentavos: centavos(e.target.value) })} /></label>
            <label>Lucros/dividendos (R$)<input inputMode="decimal" className={campo} value={reais(s.lucDivCentavos)} onChange={(e) => setSocio(i, { lucDivCentavos: centavos(e.target.value) })} /></label>
            <label>Juros s/ capital (R$)<input inputMode="decimal" className={campo} value={reais(s.jurCapCentavos)} onChange={(e) => setSocio(i, { jurCapCentavos: centavos(e.target.value) })} /></label>
            <label>Demais rendimentos (R$)<input inputMode="decimal" className={campo} value={reais(s.demRendCentavos)} onChange={(e) => setSocio(i, { demRendCentavos: centavos(e.target.value) })} /></label>
            <label>IR retido (R$)<input inputMode="decimal" className={campo} value={reais(s.irRetCentavos)} onChange={(e) => setSocio(i, { irRetCentavos: centavos(e.target.value) })} /></label>
            <div className="flex items-end"><button type="button" className={botaoClaro} onClick={() => void remover(rascunhoEcf.y600, i, `o sócio ${s.nome || i + 1}`, (n) => setRascunhoEcf((r) => ({ ...r, y600: n })))}>Tirar</button></div>
          </div>)}
        </div>

        <div className="rounded-lg border border-slate-200 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">Y540 — Receita de vendas por estabelecimento e CNAE (quando for o caso) ({rascunhoEcf.y540.length})</p><button type="button" className={botaoClaro} onClick={() => setRascunhoEcf((r) => ({ ...r, y540: [...r.y540, { cnpjEstab: empresa.cnpj || "", receitaCentavos: 0, cnae: String(empresa.cnae || "").replace(/\D/g, "") }] }))}>+ Estabelecimento</button></div>
          {rascunhoEcf.y540.map((e, i) => <div key={i} className="mt-2 grid gap-1.5 sm:grid-cols-4 text-[11px]">
            <label>CNPJ do estabelecimento<input className={campo} value={e.cnpjEstab} onChange={(ev) => setEstab(i, { cnpjEstab: ev.target.value })} /></label>
            <label>Receita de vendas (R$)<input inputMode="decimal" className={campo} value={reais(e.receitaCentavos)} onChange={(ev) => setEstab(i, { receitaCentavos: centavos(ev.target.value) })} /></label>
            <label>CNAE (7 dígitos)<input className={campo} value={e.cnae} onChange={(ev) => setEstab(i, { cnae: ev.target.value.replace(/\D/g, "").slice(0, 7) })} /></label>
            <div className="flex items-end"><button type="button" className={botaoClaro} onClick={() => void remover(rascunhoEcf.y540, i, "o estabelecimento", (n) => setRascunhoEcf((r) => ({ ...r, y540: n })))}>Tirar</button></div>
          </div>)}
        </div>

        <div className="rounded-lg border border-slate-200 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">Parte B do e-Lalur/e-Lacs — só Lucro Real anual ({rascunhoEcf.parteB.length})</p><button type="button" className={botaoClaro} onClick={() => setRascunhoEcf((r) => ({ ...r, parteB: [...r.parteB, { codigo: "", descricao: "", dtAp: `${ano}-12-31`, codPbRfb: "", tributo: "I", saldoInicialCentavos: 0, indSaldoInicial: "D", vinculos: [], lancamentos: [] }] }))}>+ Conta da Parte B</button></div>
          {rascunhoEcf.parteB.map((c, i) => { const sd = saldosPB.find((x) => x.codigo === c.codigo && x.tributo === c.tributo); return <div key={i} className="mt-2 space-y-1.5 rounded border border-slate-100 p-2 text-[11px]">
            <div className="grid gap-1.5 sm:grid-cols-4">
              <label>Código da conta<input className={campo} value={c.codigo} onChange={(e) => setContaB(i, { codigo: e.target.value })} /></label>
              <label className="sm:col-span-2">Descrição<input className={campo} value={c.descricao} onChange={(e) => setContaB(i, { descricao: e.target.value })} /></label>
              <label>Tributo<select className={campo} value={c.tributo} onChange={(e) => setContaB(i, { tributo: e.target.value as "I" | "C" })}><option value="I">IRPJ (e-Lalur)</option><option value="C">CSLL (e-Lacs)</option></select></label>
              <label>Criada em<CampoData className={campo} value={c.dtAp} onChange={(e) => setContaB(i, { dtAp: e.target.value })} /></label>
              <label>Código padrão (COD_PB_RFB)<input className={campo} maxLength={6} value={c.codPbRfb} onChange={(e) => setContaB(i, { codPbRfb: e.target.value })} /></label>
              <label>Saldo inicial declarado (R$)<input inputMode="decimal" className={campo} value={reais(c.saldoInicialCentavos)} onChange={(e) => setContaB(i, { saldoInicialCentavos: centavos(e.target.value) })} /></label>
              <label>D/C do saldo inicial<select className={campo} value={c.indSaldoInicial} onChange={(e) => setContaB(i, { indSaldoInicial: e.target.value as "D" | "C" })}><option value="D">D</option><option value="C">C</option></select></label>
            </div>
            {sd && <p className="rounded bg-slate-50 p-1.5">Saldo inicial usado: <strong>{moedaContabil(Math.abs(sd.inicial))} {sd.inicial < 0 ? "D" : "C"}</strong> ({sd.origemInicial === "ano_anterior" ? `veio do saldo final de ${ano - 1}` : sd.origemInicial === "zero_criada_no_ano" ? "zero: conta criada neste ano" : "declarado"}) · Parte A {moedaContabil(Math.abs(sd.parteA))} {sd.parteA < 0 ? "D" : "C"} · Parte B {moedaContabil(Math.abs(sd.parteB))} {sd.parteB < 0 ? "D" : "C"} · <strong>Saldo final {moedaContabil(Math.abs(sd.final))} {sd.final < 0 ? "D" : "C"}</strong> (vai para {ano + 1})</p>}
            <p className="font-semibold">Vínculos com a Parte A (M300/M350 calculados na ECF)</p>
            {c.vinculos.map((v, k) => <div key={k} className="grid gap-1.5 sm:grid-cols-5">
              <select aria-label="Registro" className={campo} value={v.registro} onChange={(e) => setContaB(i, { vinculos: c.vinculos.map((x, j) => (j === k ? { ...x, registro: e.target.value as "M300" | "M350" } : x)) })}><option value="M300">M300 (IRPJ)</option><option value="M350">M350 (CSLL)</option></select>
              <input aria-label="Código da tabela dinâmica" placeholder="código (ex.: 93.01)" className={campo} value={v.codigo} onChange={(e) => setContaB(i, { vinculos: c.vinculos.map((x, j) => (j === k ? { ...x, codigo: e.target.value } : x)) })} />
              <input aria-label="Valor" inputMode="decimal" placeholder="valor" className={campo} value={reais(v.valorCentavos)} onChange={(e) => setContaB(i, { vinculos: c.vinculos.map((x, j) => (j === k ? { ...x, valorCentavos: centavos(e.target.value) } : x)) })} />
              <select aria-label="D/C" className={campo} value={v.indicador} onChange={(e) => setContaB(i, { vinculos: c.vinculos.map((x, j) => (j === k ? { ...x, indicador: e.target.value as "D" | "C" } : x)) })}><option value="D">D</option><option value="C">C</option></select>
              <button type="button" className={botaoClaro} onClick={() => setContaB(i, { vinculos: c.vinculos.filter((_x, j) => j !== k) })}>Tirar</button>
            </div>)}
            <button type="button" className={botaoClaro} onClick={() => setContaB(i, { vinculos: [...c.vinculos, { registro: c.tributo === "C" ? "M350" : "M300", codigo: "", valorCentavos: 0, indicador: "C" }] })}>+ Vínculo com a Parte A</button>
            <p className="font-semibold">Lançamentos só na Parte B (M410)</p>
            {c.lancamentos.map((l, k) => <div key={k} className="grid gap-1.5 sm:grid-cols-6">
              <input aria-label="Valor" inputMode="decimal" placeholder="valor" className={campo} value={reais(l.valorCentavos)} onChange={(e) => setContaB(i, { lancamentos: c.lancamentos.map((x, j) => (j === k ? { ...x, valorCentavos: centavos(e.target.value) } : x)) })} />
              <select aria-label="Crédito ou débito" className={campo} value={l.indicador} onChange={(e) => setContaB(i, { lancamentos: c.lancamentos.map((x, j) => (j === k ? { ...x, indicador: e.target.value as "CR" | "DB" } : x)) })}><option value="CR">Crédito</option><option value="DB">Débito</option></select>
              <input aria-label="Contrapartida" placeholder="conta contrapartida" className={campo} value={l.contrapartida || ""} onChange={(e) => setContaB(i, { lancamentos: c.lancamentos.map((x, j) => (j === k ? { ...x, contrapartida: e.target.value || undefined } : x)) })} />
              <input aria-label="Histórico" placeholder="histórico" className={`${campo} sm:col-span-2`} value={l.historico} onChange={(e) => setContaB(i, { lancamentos: c.lancamentos.map((x, j) => (j === k ? { ...x, historico: e.target.value } : x)) })} />
              <button type="button" className={botaoClaro} onClick={() => setContaB(i, { lancamentos: c.lancamentos.filter((_x, j) => j !== k) })}>Tirar</button>
            </div>)}
            <div className="flex flex-wrap gap-1.5"><button type="button" className={botaoClaro} onClick={() => setContaB(i, { lancamentos: [...c.lancamentos, { valorCentavos: 0, indicador: "CR", historico: "", realizacaoAnterior: "N" }] })}>+ Lançamento na Parte B</button><button type="button" className={botaoClaro} onClick={() => void remover(rascunhoEcf.parteB, i, `a conta ${c.codigo || i + 1}`, (n) => setRascunhoEcf((r) => ({ ...r, parteB: n })))}>Tirar conta</button></div>
          </div>; })}
          {ano > 2014 && (empresa.ecfComplementos?.[String(ano - 1)]?.parteB || []).length > 0 && <button type="button" className={`${botaoClaro} mt-2`} onClick={() => setRascunhoEcf((r) => ({ ...r, parteB: [...r.parteB, ...(empresa.ecfComplementos?.[String(ano - 1)]?.parteB || []).filter((a) => !r.parteB.some((b) => b.codigo === a.codigo && b.tributo === a.tributo)).map((a) => ({ ...a, vinculos: [], lancamentos: [] }))] }))}>Trazer as contas de {ano - 1} (com o saldo final de lá)</button>}
        </div>
      </div>}

      {aba === "painel" && <div className="space-y-2" data-campo="painel-escritorio">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Painel do escritório — {mesAnoBR(competencia)}</h3><button type="button" className={botaoClaro} disabled={carregandoPainel} onClick={() => void carregarPainel()}><RefreshCw className="h-3.5 w-3.5" /> {carregandoPainel ? "Carregando…" : "Atualizar"}</button></div>
        <p className="text-xs text-slate-600">Quem fechou o mês, quem tem pendência e quem tem ECD/ECF a entregar. ECD: último dia útil de junho (IN RFB 2.003/2021, art. 5º); ECF: último dia útil de julho (IN RFB 2.004/2021, art. 3º) — feriados não são considerados. Entregou? Marque aqui (com o recibo, se quiser).</p>
        {painel && <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2">Fecharam {mesAnoBR(competencia)}: <strong>{painel.filter((e) => e.mesFechado).length}</strong> de {painel.length}</div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2">Com pendência: <strong>{painel.filter((e) => e.pendencias.length || e.demonstracoes.length).length}</strong></div>
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-2">ECD/ECF a entregar: <strong>{painel.filter((e) => (e.ecd.situacao === "obrigatoria" && !e.ecd.entregue) || (e.ecf.seAplica === "sim" && !e.ecf.entregue)).length}</strong></div>
        </div>}
        {painel && <ul className="space-y-2">{painel.map((e) => <li key={e.cnpj} className={`rounded-lg border p-2 text-xs ${e.pendencias.length ? "border-amber-300" : e.mesFechado ? "border-emerald-300" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center justify-between gap-1"><p className="font-bold text-slate-900">{e.nome} <span className="font-normal text-slate-500">· {e.regime || "regime não informado"}</span></p><button type="button" className="font-semibold underline" onClick={() => onNavegar("demonstracoes", e.cnpj)}>Abrir empresa</button></div>
          <p>{e.mesFechado ? "✅ Mês fechado" : e.pendencias.length ? `⛔ Mês aberto — ${e.pendencias.join("; ")}` : "⚠️ Mês aberto, sem pendência automática: falta fechar"}</p>
          <p>ECD {e.ecd.ano}: {e.ecd.situacao === "obrigatoria" ? (e.ecd.entregue ? `✅ entregue${e.ecd.recibo ? ` (recibo ${e.ecd.recibo})` : ""}` : `${e.ecd.diasParaPrazo < 0 ? "⛔ ATRASADA" : "a entregar"} até ${e.ecd.prazo.split("-").reverse().join("/")}`) : e.ecd.situacao === "depende" ? "confirme a obrigatoriedade no cadastro" : "dispensada"}
            {e.ecd.situacao !== "dispensada" && <button type="button" className="ml-2 font-semibold underline" onClick={() => void marcarEntrega(e, "ECD", e.ecd.entregue)}>{e.ecd.entregue ? "Desfazer" : "Marcar entregue"}</button>}</p>
          <p>ECF {e.ecf.ano}: {e.ecf.seAplica === "nao" ? "dispensada (Simples Nacional)" : e.ecf.entregue ? `✅ entregue${e.ecf.recibo ? ` (recibo ${e.ecf.recibo})` : ""}` : `${e.ecf.diasParaPrazo < 0 ? "⛔ ATRASADA" : "a entregar"} até ${e.ecf.prazo.split("-").reverse().join("/")}${e.ecf.seAplica === "depende" ? " (confirme o regime)" : ""}`}
            {e.ecf.seAplica !== "nao" && <button type="button" className="ml-2 font-semibold underline" onClick={() => void marcarEntrega(e, "ECF", e.ecf.entregue)}>{e.ecf.entregue ? "Desfazer" : "Marcar entregue"}</button>}</p>
          {e.demonstracoes.length > 0 && <details><summary className="cursor-pointer font-semibold">Demonstrações ({e.demonstracoes.length})</summary><ul className="ml-4 list-disc">{e.demonstracoes.map((d: any) => <li key={d.id}>{d.texto}</li>)}</ul></details>}
        </li>)}</ul>}
        {painel && !painel.length && <p className="text-xs text-slate-600">Nenhuma empresa com dados salvos no seu acesso.</p>}
      </div>}
      {dialogoExclusao}
    </section>
  );
};
