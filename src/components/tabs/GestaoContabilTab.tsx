import type { RotaEscrituracao } from "../../types";
import { confirmarNaTela } from "../../utils/dialogoNaTela";
import { useExclusaoDuasEtapas } from "../ConfirmaExclusaoDuasEtapas";
import React, { useMemo, useState } from "react";
import { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil, PreLancamentoContabil, RegraConciliacao } from "../../types";
import { ConciliacaoBancariaPainel } from "../ConciliacaoBancariaPainel";
import { compararPeriodos, explicarVariacoes, resultadoPorCentroCusto } from "../../utils/analiseContabil";
import { BemImobilizado, definirAjusteQuota, depreciacaoAcumulada, filialAtual, quotaAutomatica, quotaDoMes, quotaFoiAjustada, removerAjusteQuota, resultadoDaBaixa, totalQuotasDoMes, validarBem, valorContabilLiquido } from "../../utils/imobilizado";
import { centavosParaTexto, liquidoLancado, montarComplemento, paraCentavos, valorEfetivoCentavos } from "../../utils/ajusteManual";
import { BotaoRecalcular, CampoAjustavel } from "../AjusteManual";
import { conciliar, lancamentoDoMovimento, lerOFX, MovimentoExtrato, sugerirContraPartida } from "../../utils/extratoBancario";
import { CONFIRMACOES_MANUAIS, conferirFechamento, referenciaDepreciacao } from "../../utils/fechamentoContabil";
import { moedaContabil } from "../../utils/livrosContabeis";
import { baseFolhaBruta, calcularProvisaoFolha, gerarDlpa } from "../../utils/demonstracoesExtras";

interface Props {
  empresa: EmpresaDados;
  contas: ContaPlano[];
  lancamentos: LancamentoContabil[];
  preLancamentos: PreLancamentoContabil[];
  centrosCusto: CentroCustoContabil[];
  onCentrosCusto: (v: CentroCustoContabil[]) => void;
  bens: BemImobilizado[];
  onBens: (v: BemImobilizado[]) => void;
  onAdicionarLancamento: (l: LancamentoContabil) => void;
  competenciasFechadas: string[];
  onFecharMes: (competencia: string) => Promise<boolean>;
  workspacePersistido: boolean;
  confirmacoes: Record<string, Record<string, boolean>>;
  onConfirmacoes: (v: Record<string, Record<string, boolean>>) => void;
  /** Rotas do servidor (extrato guardado, conciliação em lote e regras). Sem elas, a tela usa a conciliação antiga só na tela. */
  onRota?: RotaEscrituracao;
  regrasConciliacao?: RegraConciliacao[];
}

type Secao = "comparativo" | "centros" | "imobilizado" | "extrato" | "provisoes" | "dlpa" | "fechamento";
const mesAtual = () => new Date().toISOString().slice(0, 7);
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR")}%`);
const reais = (s: string) => { const n = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

export const GestaoContabilTab: React.FC<Props> = (p) => {
  const [secao, setSecao] = useState<Secao>("comparativo");
  const [periodo, setPeriodo] = useState(mesAtual());
  const analiticas = useMemo(() => p.contas.filter((c) => c.tipo === "analitica"), [p.contas]);
  const aba = (id: Secao, nome: string) => (
    <button key={id} type="button" onClick={() => setSecao(id)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${secao === id ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{nome}</button>
  );
  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">Gestão contábil</h2>
        <p className="mt-1 text-xs text-slate-600">Comparativos, centros de custo, ativo imobilizado, extrato bancário e fechamento guiado. Os números vêm dos lançamentos definitivos deste Contábil; lançamentos novos gerados aqui ficam pendentes de aprovação.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {aba("comparativo", "Comparativo e explicações")}{aba("centros", "Centros de custo")}<BotaoAba data-campo="gestao-aba-imobilizado" data-piloto-abrir="" ativo={secao === "imobilizado"} onClick={() => setSecao("imobilizado")}>Ativo imobilizado</BotaoAba>
          <BotaoAba data-campo="gestao-aba-extrato" data-piloto-abrir="" ativo={secao === "extrato"} onClick={() => setSecao("extrato")}>Extrato e conciliação</BotaoAba>
          {aba("provisoes", "Provisões")}{aba("dlpa", "Lucros acumulados (DLPA)")}
          <BotaoAba data-campo="gestao-aba-fechamento" data-piloto-abrir="" ativo={secao === "fechamento"} onClick={() => setSecao("fechamento")}>Fechamento guiado</BotaoAba>
          <label className="ml-auto text-xs font-bold text-slate-700">Competência
            <input type="month" data-campo="gestao-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm font-medium" />
          </label>
        </div>
      </header>
      {!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">Escolha uma competência válida.</p> : (
        <>
          {secao === "comparativo" && <Comparativo {...p} periodo={periodo} />}
          {secao === "centros" && <Centros {...p} periodo={periodo} />}
          {secao === "imobilizado" && <Imobilizado {...p} periodo={periodo} analiticas={analiticas} />}
          {secao === "extrato" && (p.onRota ? <ConciliacaoBancariaPainel contas={p.contas} lancamentos={p.lancamentos} regras={p.regrasConciliacao || []} periodo={periodo} podeGravar={p.workspacePersistido} onRota={p.onRota} /> : <Extrato {...p} analiticas={analiticas} periodo={periodo} />)}
          {secao === "provisoes" && <Provisoes {...p} analiticas={analiticas} periodo={periodo} />}
          {secao === "dlpa" && <Dlpa {...p} periodo={periodo} />}
          {secao === "fechamento" && <Fechamento {...p} periodo={periodo} />}
        </>
      )}
    </div>
  );
};

// Abas que o Piloto Visível abre sozinho (data-campo + data-piloto-abrir; ver src/data/mapaTelasContabil.ts).
const BotaoAba: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { ativo: boolean; "data-campo": string; "data-piloto-abrir": string }> = ({ ativo, className: _c, children, ...resto }) => (
  <button type="button" {...resto} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${ativo ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{children}</button>
);

const Cartao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xs"><h3 className="mb-2 text-sm font-bold text-slate-900">{titulo}</h3>{children}</section>
);

const Comparativo: React.FC<Props & { periodo: string }> = ({ contas, lancamentos, periodo }) => {
  const comp = useMemo(() => compararPeriodos(contas, lancamentos, periodo), [contas, lancamentos, periodo]);
  const notas = useMemo(() => explicarVariacoes(comp), [comp]);
  const linha = (nome: string, v: [number, number, number]) => (
    <tr className="font-bold"><td>{nome}</td><td>{moedaContabil(v[0])}</td><td>{moedaContabil(v[1])}</td><td>{moedaContabil(v[2])}</td><td>{pct(v[1] === 0 ? null : Math.round(((v[0] - v[1]) / Math.abs(v[1])) * 1000) / 10)}</td><td>{pct(v[2] === 0 ? null : Math.round(((v[0] - v[2]) / Math.abs(v[2])) * 1000) / 10)}</td></tr>
  );
  return (
    <>
      <Cartao titulo={`Resultado: ${periodo} × ${comp.periodoMesAnterior} × ${comp.periodoAnoAnterior}`}>
        {comp.linhas.length === 0 ? <p>Sem receitas ou despesas classificadas nos três períodos.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr><th>Conta</th><th>{periodo}</th><th>{comp.periodoMesAnterior}</th><th>{comp.periodoAnoAnterior}</th><th>Var. mês</th><th>Var. ano</th></tr></thead>
            <tbody>
              {comp.linhas.map((l) => <tr key={l.codigo}><td>{l.codigo} {l.descricao}</td><td>{moedaContabil(l.atual)}</td><td>{moedaContabil(l.mesAnterior)}</td><td>{moedaContabil(l.anoAnterior)}</td><td>{pct(l.varMes)}</td><td>{pct(l.varAno)}</td></tr>)}
              {linha("Receitas", comp.totais.receitas)}{linha("Despesas", comp.totais.despesas)}{linha("Resultado", comp.totais.resultado)}
            </tbody>
          </table></div>
        )}
        <p className="mt-2 text-slate-600">Receitas e despesas são classificadas pelas descrições das contas (a mesma regra da DRE gerencial). "—" indica que não há base de comparação (valor zero).</p>
      </Cartao>
      <Cartao titulo="O que mudou (explicação automática)">
        {notas.length ? <ul className="list-disc space-y-1 pl-5">{notas.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p>Nenhuma variação relevante (mínimo de 10% e R$ 100,00) em relação ao mês anterior.</p>}
        <p className="mt-2 text-slate-600">Os textos descrevem só a variação dos números; a causa precisa ser confirmada por você.</p>
      </Cartao>
    </>
  );
};

const Centros: React.FC<Props & { periodo: string }> = ({ contas, lancamentos, centrosCusto, onCentrosCusto, periodo }) => {
  const [codigo, setCodigo] = useState(""); const [nome, setNome] = useState(""); const [erro, setErro] = useState("");
  const linhas = useMemo(() => resultadoPorCentroCusto(contas, lancamentos, centrosCusto, periodo), [contas, lancamentos, centrosCusto, periodo]);
  const adicionar = () => {
    const c = codigo.trim().toUpperCase(), n = nome.trim();
    if (!c || !n) return setErro("Informe código e nome.");
    if (centrosCusto.some((x) => x.codigo === c)) return setErro("Já existe um centro com esse código.");
    onCentrosCusto([...centrosCusto, { id: `CC-${c}`, codigo: c, nome: n }]); setCodigo(""); setNome(""); setErro("");
  };
  return (
    <>
      <Cartao titulo="Cadastro de centros de custo, departamentos, filiais e projetos">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-28 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} className="w-56 rounded border px-2 py-1" /></label>
          <button type="button" onClick={adicionar} className="rounded-md bg-blue-700 px-3 py-1.5 font-bold text-white">Adicionar</button>
        </div>
        {erro && <p className="mt-1 text-red-700">{erro}</p>}
        <p className="mt-2">{centrosCusto.length ? centrosCusto.map((c) => `${c.codigo} — ${c.nome}`).join(" · ") : "Nenhum centro cadastrado."}</p>
      </Cartao>
      <Cartao titulo={`Resultado por centro de custo — ${periodo}`}>
        {linhas.length === 0 ? <p>Sem receitas ou despesas no mês.</p> : (
          <table className="w-full text-left"><thead><tr><th>Centro</th><th>Receitas</th><th>Despesas</th><th>Resultado</th></tr></thead>
            <tbody>{linhas.map((l) => <tr key={l.centro || "sem"}><td>{l.nome}</td><td>{moedaContabil(l.receitas)}</td><td>{moedaContabil(l.despesas)}</td><td>{moedaContabil(l.resultado)}</td></tr>)}</tbody></table>
        )}
        <p className="mt-2 text-slate-600">O centro de custo é lido de cada lançamento (importados da migração trazem o centro). Lançamentos sem centro aparecem em "Sem centro de custo".</p>
      </Cartao>
    </>
  );
};

// Quota do mês: mostra o automático e deixa ajustar à mão (marcado como "ajustado manualmente"); voltar ao automático pede confirmação.
const QuotaAjustavel: React.FC<{ bem: BemImobilizado; periodo: string; onBem: (b: BemImobilizado) => void }> = ({ bem, periodo, onBem }) => {
  const auto = quotaAutomatica(bem, periodo), atual = quotaDoMes(bem, periodo), ajustada = quotaFoiAjustada(bem, periodo);
  const [texto, setTexto] = useState(""); const [erro, setErro] = useState("");
  if (!bem.depreciavel) return <>{moedaContabil(0)}</>;
  const aplicar = () => {
    const c = paraCentavos(texto);
    if (c === null) return setErro("Digite um valor válido, por exemplo 1.250,00.");
    const r = definirAjusteQuota(bem, periodo, c);
    if (r.erro || !r.bem) return setErro(r.erro || "Não foi possível ajustar.");
    setErro(""); setTexto(""); onBem(r.bem);
  };
  return (
    <div>
      <div>{moedaContabil(atual)}{ajustada && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-900">ajustado manualmente</span>}</div>
      {ajustada && <div className="text-[10px] text-slate-600">Automático: {moedaContabil(auto)}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <input aria-label={`Ajustar quota de ${bem.descricao}`} inputMode="decimal" placeholder="ajustar (R$)" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-24 rounded border px-1 py-0.5" />
        <button type="button" className="rounded border px-1.5 py-0.5" disabled={!texto.trim()} onClick={aplicar}>Aplicar</button>
        {ajustada && <button type="button" className="rounded border px-1.5 py-0.5" onClick={async () => { if (await confirmarNaTela(`Voltar a quota de ${bem.descricao} em ${periodo} ao cálculo automático (${moedaContabil(auto)})? O valor ajustado por você será descartado.`)) onBem(removerAjusteQuota(bem, periodo)); }}>Voltar ao automático</button>}
      </div>
      {erro && <div className="text-[10px] text-red-700">{erro}</div>}
    </div>
  );
};

const Imobilizado: React.FC<Props & { periodo: string; analiticas: ContaPlano[] }> = ({ bens, onBens, periodo, analiticas, lancamentos, onAdicionarLancamento, workspacePersistido }) => {
  const [f, setF] = useState({ descricao: "", filial: "", custo: "", residual: "0", vida: "60", inicio: periodo, depreciavel: true });
  const [erros, setErros] = useState<string[]>([]);
  const [despesa, setDespesa] = useState(""); const [acumulada, setAcumulada] = useState(""); const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<{ id: string; descricao: string; filial: string; custo: string; residual: string; vida: string; inicio: string } | null>(null);
  const quotas = totalQuotasDoMes(bens, periodo);
  const refDeprec = referenciaDepreciacao(periodo);
  const jaLancada = lancamentos.some((l) => l.documentoRef === refDeprec && l.statusManual !== "rejeitado");
  const liquido = liquidoLancado(lancamentos, refDeprec);
  const diferenca = jaLancada ? quotas.total - liquido.centavos : 0;
  const ajustesNoMes = bens.filter((b) => quotaFoiAjustada(b, periodo)).length;
  const { pedir: pedirExclusao, dialogo: dialogoExclusao } = useExclusaoDuasEtapas();
  const trocarBem = (novo: BemImobilizado) => onBens(bens.map((x) => (x.id === novo.id ? novo : x)));
  const recalcularMes = async () => {
    if (!ajustesNoMes) return setMsg("Recalculado: nenhuma quota deste mês estava ajustada à mão, tudo segue o cálculo automático.");
    if (!(await pedirExclusao({ titulo: "Descartar as quotas digitadas?", oQue: `as quotas de ${periodo} ajustadas à mão em ${ajustesNoMes} bem(ns)`, consequencias: ["Todas voltam ao cálculo automático da depreciação.", "Os valores que você digitou serão descartados.", "Nenhum lançamento já feito é apagado."], rotuloFinal: "Sim, descartar e recalcular" }))) return;
    onBens(bens.map((b) => removerAjusteQuota(b, periodo)));
    setMsg("Recalculado: as quotas do mês voltaram ao cálculo automático.");
  };
  const lancarDiferenca = async () => {
    if (!liquido.base || !diferenca) return;
    if (!workspacePersistido) return setMsg("Aguarde a confirmação do banco desta empresa antes de lançar.");
    if (!(await confirmarNaTela(`O lançamento de depreciação de ${periodo} está em ${moedaContabil(liquido.centavos)} e o cálculo atual dá ${moedaContabil(quotas.total)}. Criar um lançamento de ${diferenca > 0 ? "complemento" : "redução"} de ${moedaContabil(Math.abs(diferenca))}, pendente de aprovação? O lançamento original continua preservado.`))) return;
    const n = lancamentos.filter((l) => String(l.documentoRef || "").startsWith(`${refDeprec}:AJ:`)).length + 1;
    const novo = montarComplemento(liquido.base, refDeprec, diferenca, n, periodo, "Depreciação");
    if (!novo) return;
    onAdicionarLancamento(novo);
    setMsg("Lançamento de diferença criado e enviado para aprovação na aba Lançamentos.");
  };
  const abrirEdicao = (b: BemImobilizado) => setEdit({ id: b.id, descricao: b.descricao, filial: b.filial || "", custo: centavosParaTexto(b.custoCentavos), residual: centavosParaTexto(b.residualCentavos), vida: String(b.vidaUtilMeses), inicio: b.inicioDepreciacao });
  const salvarEdicao = async () => {
    if (!edit) return;
    const b = bens.find((x) => x.id === edit.id); if (!b) return;
    const novo: BemImobilizado = { ...b, descricao: edit.descricao.trim(), filial: edit.filial.trim() || undefined, custoCentavos: paraCentavos(edit.custo) ?? NaN, residualCentavos: paraCentavos(edit.residual) ?? NaN, vidaUtilMeses: b.depreciavel ? Number(edit.vida) : 0, inicioDepreciacao: edit.inicio };
    const e = validarBem(novo); setErros(e);
    if (e.length) return;
    if (!(await confirmarNaTela(`Salvar as alterações de "${b.descricao}"? A depreciação de todos os meses será recalculada com os novos dados. Lançamentos de depreciação já feitos não são apagados: depois use "Lançar diferença" para acertar.`))) return;
    trocarBem(novo); setEdit(null); setMsg("Bem atualizado. A depreciação foi recalculada com os novos dados.");
  };
  const cadastrar = () => {
    const bem: BemImobilizado = { id: `BEM-${Date.now()}`, descricao: f.descricao.trim(), filial: f.filial.trim() || undefined, custoCentavos: reais(f.custo), residualCentavos: reais(f.residual), vidaUtilMeses: f.depreciavel ? Number(f.vida) : 0, inicioDepreciacao: f.inicio, depreciavel: f.depreciavel };
    const e = validarBem(bem); setErros(e);
    if (e.length) return;
    onBens([...bens, bem]); setF({ ...f, descricao: "", custo: "" });
  };
  const lancar = () => {
    const d = analiticas.find((c) => c.codigo === despesa), a = analiticas.find((c) => c.codigo === acumulada);
    if (!d || !a || d.codigo === a.codigo) return setMsg("Escolha duas contas diferentes: despesa de depreciação e depreciação acumulada.");
    if (!quotas.total) return setMsg("Não há depreciação neste mês.");
    if (jaLancada) return setMsg("A depreciação deste mês já foi lançada.");
    if (!workspacePersistido) return setMsg("Aguarde a confirmação do banco desta empresa antes de lançar.");
    onAdicionarLancamento({ id: `DEPREC-${periodo}`, data: `${periodo}-28`, contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: a.codigo, contaCreditoNome: a.descricao, valor: quotas.total / 100, historico: `Depreciação do mês ${periodo} (${quotas.itens.length} bem(ns))`, origem: "Manual", documentoRef: referenciaDepreciacao(periodo), competencia: periodo, statusManual: "pendente_aprovacao" });
    setMsg("Lançamento criado e enviado para aprovação na aba Lançamentos.");
  };
  const registrarBaixa = (b: BemImobilizado, motivo: "venda" | "baixa") => {
    const venda = motivo === "venda" ? reais(window.prompt("Valor da venda (R$):") || "") : 0;
    if (!Number.isFinite(venda) || venda < 0) return;
    const novo = { ...b, baixa: { competencia: periodo, valorVendaCentavos: venda, motivo } };
    const e = validarBem(novo); if (e.length) return setErros(e);
    onBens(bens.map((x) => (x.id === b.id ? novo : x)));
  };
  const transferir = (b: BemImobilizado) => {
    const para = (window.prompt("Transferir para qual filial?") || "").trim();
    if (!para) return;
    onBens(bens.map((x) => (x.id === b.id ? { ...x, transferencias: [...(x.transferencias ?? []), { competencia: periodo, de: filialAtual(x, periodo), para }] } : x)));
  };
  return (
    <>
      <Cartao titulo="Cadastrar bem">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Descrição<input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} className="w-48 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Filial<input value={f.filial} onChange={(e) => setF({ ...f, filial: e.target.value })} className="w-28 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Custo (R$)<input value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} className="w-28 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Residual (R$)<input value={f.residual} onChange={(e) => setF({ ...f, residual: e.target.value })} className="w-24 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Vida útil (meses)<input type="number" min={1} value={f.vida} disabled={!f.depreciavel} onChange={(e) => setF({ ...f, vida: e.target.value })} className="w-24 rounded border px-2 py-1" /></label>
          <label className="grid gap-1">Início de uso<input type="month" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className="rounded border px-2 py-1" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!f.depreciavel} onChange={(e) => setF({ ...f, depreciavel: !e.target.checked })} /> Terreno (não deprecia)</label>
          <button type="button" onClick={cadastrar} className="rounded-md bg-blue-700 px-3 py-1.5 font-bold text-white">Cadastrar</button>
        </div>
        {erros.length > 0 && <ul className="mt-1 text-red-700">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
        <p className="mt-2 text-slate-600">Regras da Receita Federal: a depreciação começa no mês em que o bem entra em uso, não passa do custo e terreno não deprecia. A vida útil é sua escolha; as taxas fiscais por bem estão no Anexo III da IN RFB 1.700/2017.</p>
      </Cartao>
      <Cartao titulo={`Bens e depreciação — ${periodo}`}>
        {bens.length === 0 ? <p>Nenhum bem cadastrado.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
            <thead><tr><th>Bem</th><th>Filial</th><th>Custo</th><th>Quota do mês</th><th>Acumulada</th><th>Valor líquido</th><th>Situação</th><th></th></tr></thead>
            <tbody>{bens.map((b) => (
              <tr key={b.id}><td>{b.descricao}</td><td>{filialAtual(b, periodo) ?? "—"}</td><td>{moedaContabil(b.custoCentavos)}</td><td><QuotaAjustavel bem={b} periodo={periodo} onBem={trocarBem} /></td><td>{moedaContabil(depreciacaoAcumulada(b, periodo))}</td><td>{moedaContabil(valorContabilLiquido(b, periodo))}</td>
                <td>{b.baixa ? `${b.baixa.motivo === "venda" ? "Vendido" : "Baixado"} em ${b.baixa.competencia} · ${(resultadoDaBaixa(b) ?? 0) >= 0 ? "ganho" : "perda"} de ${moedaContabil(Math.abs(resultadoDaBaixa(b) ?? 0))}` : "Em uso"}</td>
                <td>{!b.baixa && <span className="flex flex-wrap gap-1"><button type="button" className="rounded border px-2 py-0.5" onClick={() => abrirEdicao(b)}>Editar</button><button type="button" className="rounded border px-2 py-0.5" onClick={() => registrarBaixa(b, "venda")}>Vender</button><button type="button" className="rounded border px-2 py-0.5" onClick={() => registrarBaixa(b, "baixa")}>Baixar</button><button type="button" className="rounded border px-2 py-0.5" onClick={() => transferir(b)}>Transferir</button></span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {edit && (
          <div className="mt-3 rounded-lg border border-violet-300 bg-violet-50 p-3">
            <p className="font-bold">Editar bem</p>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <label className="grid gap-1">Descrição<input value={edit.descricao} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} className="w-48 rounded border px-2 py-1" /></label>
              <label className="grid gap-1">Filial<input value={edit.filial} onChange={(e) => setEdit({ ...edit, filial: e.target.value })} className="w-28 rounded border px-2 py-1" /></label>
              <label className="grid gap-1">Custo (R$)<input value={edit.custo} onChange={(e) => setEdit({ ...edit, custo: e.target.value })} className="w-28 rounded border px-2 py-1" /></label>
              <label className="grid gap-1">Residual (R$)<input value={edit.residual} onChange={(e) => setEdit({ ...edit, residual: e.target.value })} className="w-24 rounded border px-2 py-1" /></label>
              {bens.find((x) => x.id === edit.id)?.depreciavel && <label className="grid gap-1">Vida útil (meses)<input type="number" min={1} value={edit.vida} onChange={(e) => setEdit({ ...edit, vida: e.target.value })} className="w-24 rounded border px-2 py-1" /></label>}
              <label className="grid gap-1">Início de uso<input type="month" value={edit.inicio} onChange={(e) => setEdit({ ...edit, inicio: e.target.value })} className="rounded border px-2 py-1" /></label>
              <button type="button" onClick={() => void salvarEdicao()} className="rounded-md bg-violet-700 px-3 py-1.5 font-bold text-white">Salvar alterações</button>
              <button type="button" onClick={() => { setEdit(null); setErros([]); }} className="rounded-md border px-3 py-1.5 font-bold">Cancelar</button>
            </div>
            {erros.length > 0 && <ul className="mt-1 text-red-700">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        <p className="mt-2 font-semibold">Depreciação do mês: {moedaContabil(quotas.total)} {jaLancada && "(já lançada)"}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void recalcularMes()} className="rounded border border-violet-400 bg-white px-2 py-1 font-semibold">Recalcular depreciação do mês</button>
          {ajustesNoMes > 0 && <span className="text-violet-800">{ajustesNoMes} quota(s) ajustada(s) manualmente neste mês</span>}
        </div>
        {jaLancada && liquido.base && diferenca !== 0 && (
          <div role="status" className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
            O lançamento do mês soma {moedaContabil(liquido.centavos)}, mas o cálculo atual é {moedaContabil(quotas.total)} (diferença de {moedaContabil(Math.abs(diferenca))}).{" "}
            <button type="button" onClick={() => void lancarDiferenca()} disabled={!workspacePersistido} className="rounded border border-amber-500 bg-white px-2 py-0.5 font-bold disabled:opacity-50">Lançar diferença ({diferenca > 0 ? "complemento" : "redução"})</button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Conta de despesa de depreciação<select value={despesa} onChange={(e) => setDespesa(e.target.value)} className="rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Conta de depreciação acumulada<select value={acumulada} onChange={(e) => setAcumulada(e.target.value)} className="rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <button type="button" data-campo="depreciacao-lancar" onClick={lancar} disabled={!quotas.total || jaLancada} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">Lançar depreciação do mês</button>
        </div>
        {msg && <p className="mt-1 text-slate-800">{msg}</p>}
        <p className="mt-1 text-slate-600">Na baixa, a depreciação para no mês anterior ao da baixa. O ganho ou a perda é o valor da venda menos o valor contábil líquido.</p>
      </Cartao>
      {dialogoExclusao}
    </>
  );
};

const Extrato: React.FC<Props & { periodo: string; analiticas: ContaPlano[] }> = ({ contas, lancamentos, analiticas, periodo, onAdicionarLancamento, workspacePersistido }) => {
  const [movs, setMovs] = useState<MovimentoExtrato[]>([]); const [erros, setErros] = useState<string[]>([]);
  const [banco, setBanco] = useState(""); const [escolhas, setEscolhas] = useState<Record<string, string>>({}); const [msg, setMsg] = useState("");
  const carregar = async (arquivo?: File | null) => {
    if (!arquivo) return;
    const r = lerOFX(await arquivo.text()); setMovs(r.movimentos); setErros(r.erros);
    setMsg(r.movimentos.length ? `${r.movimentos.length} movimento(s) lido(s). Formato aceito: OFX. Arquivos CNAB ainda não são lidos.` : "Nenhum movimento encontrado.");
  };
  const res = useMemo(() => (banco ? conciliar(movs, lancamentos, banco, periodo) : null), [movs, lancamentos, banco, periodo]);
  const existentes = new Set(lancamentos.map((l) => l.documentoRef));
  const criar = (m: MovimentoExtrato) => {
    const b = contas.find((c) => c.codigo === banco), c = contas.find((x) => x.codigo === (escolhas[m.fitid] || sugerirContraPartida(m, banco, lancamentos)?.codigo));
    if (!b || !c) return setMsg("Escolha a conta de contrapartida.");
    if (b.codigo === c.codigo) return setMsg("A contrapartida deve ser diferente da conta do banco.");
    if (existentes.has(`OFX:${m.fitid}`)) return setMsg("Este movimento já foi lançado.");
    if (!workspacePersistido) return setMsg("Aguarde a confirmação do banco desta empresa antes de lançar.");
    onAdicionarLancamento(lancamentoDoMovimento(m, b, c)); setMsg("Lançamento criado e enviado para aprovação na aba Lançamentos.");
  };
  return (
    <>
      <Cartao titulo="Importar extrato bancário (OFX)">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Conta do banco no plano<select value={banco} onChange={(e) => setBanco(e.target.value)} className="rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Arquivo OFX<input type="file" accept=".ofx,.OFX" onChange={(e) => void carregar(e.target.files?.[0])} /></label>
        </div>
        {msg && <p className="mt-1">{msg}</p>}
        {erros.length > 0 && <ul className="mt-1 text-amber-800">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <p className="mt-2 text-slate-600">O arquivo é lido no seu navegador. O sistema não se conecta ao banco: você baixa o extrato OFX no internet banking e importa aqui.</p>
      </Cartao>
      {res && (
        <>
          <Cartao titulo={`Conciliados (${res.conciliados.length})`}>
            {res.conciliados.length === 0 ? <p>Nenhum movimento casou com lançamento.</p> : <ul className="space-y-1">{res.conciliados.map((c) => <li key={c.movimento.fitid}>{c.movimento.dataISO.split("-").reverse().join("/")} · {moedaContabil(c.movimento.valorCentavos)} · {c.movimento.memo} — {c.certeza === "exata" ? "mesma data e valor" : "valor igual, data próxima (confira)"}</li>)}</ul>}
          </Cartao>
          <Cartao titulo={`Sem lançamento (${res.semLancamento.length})`}>
            {res.semLancamento.length === 0 ? <p>Todos os movimentos do mês têm lançamento.</p> : (
              <table className="w-full text-left"><thead><tr><th>Data</th><th>Valor</th><th>Descrição</th><th>Contrapartida</th><th></th></tr></thead>
                <tbody>{res.semLancamento.map((m) => {
                  const sug = sugerirContraPartida(m, banco, lancamentos);
                  return (<tr key={m.fitid}><td>{m.dataISO.split("-").reverse().join("/")}</td><td>{moedaContabil(m.valorCentavos)}</td><td>{m.memo}</td>
                    <td><select value={escolhas[m.fitid] ?? sug?.codigo ?? ""} onChange={(e) => setEscolhas({ ...escolhas, [m.fitid]: e.target.value })} className="max-w-[240px] rounded border px-1 py-0.5"><option value="">Escolha…</option>{analiticas.filter((c) => c.codigo !== banco).map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select>{sug && !escolhas[m.fitid] && <div className="text-slate-600">Sugestão: {sug.motivo}</div>}</td>
                    <td><button type="button" onClick={() => criar(m)} disabled={existentes.has(`OFX:${m.fitid}`)} className="rounded border px-2 py-0.5 font-bold disabled:opacity-50">{existentes.has(`OFX:${m.fitid}`) ? "Já lançado" : "Criar lançamento"}</button></td></tr>);
                })}</tbody></table>
            )}
          </Cartao>
          <Cartao titulo={`Lançamentos do banco sem movimento no extrato (${res.lancamentosSemExtrato.length})`}>
            {res.lancamentosSemExtrato.length === 0 ? <p>Nenhum.</p> : <ul className="space-y-1">{res.lancamentosSemExtrato.map((l) => <li key={l.id}>{l.data} · {l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {l.historico}</li>)}</ul>}
            <p className="mt-2 text-slate-600">Lançamentos pendentes de aprovação não entram na conciliação.</p>
          </Cartao>
        </>
      )}
    </>
  );
};

const Fechamento: React.FC<Props & { periodo: string }> = ({ contas, lancamentos, preLancamentos, bens, competenciasFechadas, onFecharMes, workspacePersistido, confirmacoes: conf, onConfirmacoes: setConf, periodo }) => {
  const confirmacoes = conf[periodo] ?? {};
  const r = useMemo(() => conferirFechamento({ competencia: periodo, contas, lancamentos, preLancamentos, bens, confirmacoes }), [periodo, contas, lancamentos, preLancamentos, bens, confirmacoes]);
  const fechada = competenciasFechadas.includes(periodo);
  return (
    <Cartao titulo={`Fechamento de ${periodo}${fechada ? " — já fechada" : ""}`}>
      <ul className="space-y-1.5">
        {r.itens.map((i) => (
          <li key={i.id} className="flex items-start gap-2">
            {i.tipo === "manual" ? <input type="checkbox" checked={confirmacoes[i.id] === true} disabled={fechada} onChange={(e) => setConf({ ...conf, [periodo]: { ...confirmacoes, [i.id]: e.target.checked } })} className="mt-0.5" /> : <span className={i.ok ? "text-emerald-700" : i.bloqueia ? "text-red-700" : "text-amber-700"}>{i.ok ? "✔" : i.bloqueia ? "✖" : "⚠"}</span>}
            <span><strong>{i.titulo}</strong>{i.tipo === "manual" ? " (confirmação sua)" : ""} — {i.detalhe}</span>
          </li>
        ))}
      </ul>
      <button type="button" data-campo="fechamento-fechar" disabled={!r.podeFechar || fechada || !workspacePersistido} onClick={async () => { if (await confirmarNaTela(`Fechar a competência ${periodo}? O servidor vai bloquear alterações nesse mês.`)) await onFecharMes(periodo); }} className="mt-3 rounded-md bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{fechada ? "Competência já fechada" : r.podeFechar ? "Fechar competência" : "Resolva os itens para fechar"}</button>
      <p className="mt-2 text-slate-600">Os itens automáticos vêm dos dados deste Contábil. Os itens "confirmação sua" o sistema não consegue verificar sozinho (banco, contas a pagar/receber, folha e impostos): você confirma depois de conferir. O servidor ainda aplica suas próprias validações no fechamento.</p>
    </Cartao>
  );
};

const Provisoes: React.FC<Props & { periodo: string; analiticas: ContaPlano[] }> = ({ empresa, lancamentos, analiticas, periodo, onAdicionarLancamento, workspacePersistido }) => {
  const [enc, setEnc] = useState(8);
  const [c, setC] = useState({ despFerias: "", provFerias: "", despDecimo: "", provDecimo: "" });
  const [msg, setMsg] = useState("");
  // Ajustes manuais (base da folha e valores finais) guardados por empresa e competência; o cálculo automático não os sobrescreve.
  const chaveAj = `murade_provisao_ajustes_${String(empresa.cnpj || "").replace(/\W/g, "")}_${periodo}`;
  const [aj, setAj] = useState<Record<string, string>>({});
  React.useEffect(() => { try { const v = JSON.parse(localStorage.getItem(chaveAj) || "{}"); setAj(v && typeof v === "object" && !Array.isArray(v) ? v : {}); } catch { setAj({}); } }, [chaveAj]);
  const ajustar = (k: string) => (v: string | undefined) => setAj((a) => { const n = { ...a }; if (v === undefined) delete n[k]; else n[k] = v; try { localStorage.setItem(chaveAj, JSON.stringify(n)); } catch { /* opcional */ } return n; });
  const descartar = () => { setAj({}); try { localStorage.removeItem(chaveAj); } catch { /* opcional */ } };
  const baseAuto = useMemo(() => baseFolhaBruta(lancamentos, periodo), [lancamentos, periodo]);
  const base = valorEfetivoCentavos(baseAuto, aj.base);
  const prov = useMemo(() => calcularProvisaoFolha(base, enc), [base, enc]);
  const valorDe = (tipo: "FERIAS" | "DECIMO") => valorEfetivoCentavos(tipo === "FERIAS" ? prov.totalFerias : prov.totalDecimo, aj[tipo]);
  const refDe = (tipo: string) => `PROV:${tipo}:${periodo}`;
  const lancado = (tipo: string) => lancamentos.some((l) => l.documentoRef === refDe(tipo) && l.statusManual !== "rejeitado");
  const lancar = (tipo: "FERIAS" | "DECIMO") => {
    const d = analiticas.find((x) => x.codigo === (tipo === "FERIAS" ? c.despFerias : c.despDecimo)), a = analiticas.find((x) => x.codigo === (tipo === "FERIAS" ? c.provFerias : c.provDecimo));
    const valor = valorDe(tipo);
    if (!d || !a || d.codigo === a.codigo) return setMsg("Escolha duas contas diferentes: despesa e provisão (passivo).");
    if (valor <= 0) return setMsg("O valor a provisionar deste mês é zero: não há o que lançar.");
    if (lancado(tipo)) return setMsg("Esta provisão já foi lançada neste mês.");
    if (!workspacePersistido) return setMsg("Aguarde a confirmação do banco desta empresa antes de lançar.");
    onAdicionarLancamento({ id: `PROV-${tipo}-${periodo}`, data: `${periodo}-28`, contaDebitoCodigo: d.codigo, contaDebitoNome: d.descricao, contaCreditoCodigo: a.codigo, contaCreditoNome: a.descricao, valor: valor / 100, historico: `Provisão de ${tipo === "FERIAS" ? "férias e 1/3" : "13º salário"} com encargos de ${enc}% — ${periodo}${aj[tipo] !== undefined || aj.base !== undefined ? " (valor ajustado manualmente)" : ""}`, origem: "Manual", documentoRef: refDe(tipo), competencia: periodo, statusManual: "pendente_aprovacao" });
    setMsg("Provisão enviada para aprovação na aba Lançamentos.");
  };
  const diferencaDe = (tipo: "FERIAS" | "DECIMO") => { const l = liquidoLancado(lancamentos, refDe(tipo)); return l.base ? { l, dif: valorDe(tipo) - l.centavos } : null; };
  const lancarDiferenca = async (tipo: "FERIAS" | "DECIMO") => {
    const x = diferencaDe(tipo); if (!x || !x.l.base || !x.dif) return;
    if (!workspacePersistido) return setMsg("Aguarde a confirmação do banco desta empresa antes de lançar.");
    if (!(await confirmarNaTela(`A provisão lançada soma ${moedaContabil(x.l.centavos)} e o valor atual é ${moedaContabil(valorDe(tipo))}. Criar um lançamento de ${x.dif > 0 ? "complemento" : "redução"} de ${moedaContabil(Math.abs(x.dif))}, pendente de aprovação? O lançamento original continua preservado.`))) return;
    const n = lancamentos.filter((l) => String(l.documentoRef || "").startsWith(`${refDe(tipo)}:AJ:`)).length + 1;
    const novo = montarComplemento(x.l.base, refDe(tipo), x.dif, n, periodo, tipo === "FERIAS" ? "Provisão de férias" : "Provisão de 13º");
    if (!novo) return;
    onAdicionarLancamento(novo); setMsg("Lançamento de diferença enviado para aprovação na aba Lançamentos.");
  };
  const seletor = (rot: string, chave: keyof typeof c) => (
    <label className="grid gap-1">{rot}<select value={c[chave]} onChange={(e) => setC({ ...c, [chave]: e.target.value })} className="max-w-[260px] rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} {x.descricao}</option>)}</select></label>
  );
  const difLinha = (tipo: "FERIAS" | "DECIMO") => { const x = diferencaDe(tipo); return x && x.dif !== 0 ? (
    <p role="status" className="mt-1 rounded border border-amber-300 bg-amber-50 p-2">Já lançado: {moedaContabil(x.l.centavos)}; valor atual: {moedaContabil(valorDe(tipo))}.{" "}
      <button type="button" onClick={() => void lancarDiferenca(tipo)} disabled={!workspacePersistido} className="rounded border border-amber-500 bg-white px-2 py-0.5 font-bold disabled:opacity-50">Lançar diferença ({x.dif > 0 ? "complemento" : "redução"})</button></p>) : null; };
  return (
    <Cartao titulo={`Provisões de férias e 13º — ${periodo}`}>
      <p className="flex flex-wrap items-center gap-2">Base: folha bruta do DP contabilizada no mês (R$) = <CampoAjustavel rotulo="Base da folha" automaticoCentavos={baseAuto} ajuste={aj.base} onChange={ajustar("base")} />{baseAuto === 0 && aj.base === undefined && " (nenhum lançamento definitivo de “DP — Folha” nesta competência)"}</p>
      <label className="mt-2 flex items-center gap-2">Encargos sobre as provisões (%)<input type="number" min={0} max={100} step={0.5} value={enc} onChange={(e) => setEnc(Number(e.target.value) || 0)} className="w-20 rounded border px-2 py-1" /></label>
      <table className="mt-2 w-full max-w-md text-left"><tbody>
        <tr><td>Férias (1/12)</td><td>{moedaContabil(prov.ferias)}</td></tr><tr><td>1/3 constitucional</td><td>{moedaContabil(prov.tercoFerias)}</td></tr>
        <tr><td>13º salário (1/12)</td><td>{moedaContabil(prov.decimoTerceiro)}</td></tr><tr><td>Encargos ({enc}%)</td><td>{moedaContabil(prov.encargos)}</td></tr>
        <tr className="font-bold"><td>Total a provisionar</td><td>{moedaContabil(prov.total)}</td></tr>
        <tr><td>Valor a lançar — férias (R$)</td><td><CampoAjustavel rotulo="Valor das férias" automaticoCentavos={prov.totalFerias} ajuste={aj.FERIAS} onChange={ajustar("FERIAS")} /></td></tr>
        <tr><td>Valor a lançar — 13º (R$)</td><td><CampoAjustavel rotulo="Valor do 13º" automaticoCentavos={prov.totalDecimo} ajuste={aj.DECIMO} onChange={ajustar("DECIMO")} /></td></tr>
      </tbody></table>
      <p className="mt-1"><BotaoRecalcular ajustes={aj} onDescartar={descartar} texto="Recalcular provisões pela folha" /></p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {seletor("Despesa de férias", "despFerias")}{seletor("Provisão de férias (passivo)", "provFerias")}
        <button type="button" onClick={() => lancar("FERIAS")} disabled={lancado("FERIAS")} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">{lancado("FERIAS") ? "Férias já lançada" : `Lançar férias (${moedaContabil(valorDe("FERIAS"))})`}</button>
      </div>
      {difLinha("FERIAS")}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {seletor("Despesa de 13º", "despDecimo")}{seletor("Provisão de 13º (passivo)", "provDecimo")}
        <button type="button" onClick={() => lancar("DECIMO")} disabled={lancado("DECIMO")} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">{lancado("DECIMO") ? "13º já lançado" : `Lançar 13º (${moedaContabil(valorDe("DECIMO"))})`}</button>
      </div>
      {difLinha("DECIMO")}
      {msg && <p className="mt-2">{msg}</p>}
      <p className="mt-2 text-slate-600">Estimativa: 1/12 da folha bruta para férias, mais 1/3 constitucional (CF, art. 7º, XVII), e 1/12 para o 13º (Lei 4.749/1965). O percentual de encargos é seu (FGTS 8%; INSS patronal depende do regime da empresa). A base é a folha bruta que o DP enviou, sem separar horas extras e adicionais. Impostos a recolher entram pelos lançamentos do Fiscal e do DP. Os valores automáticos se refazem sozinhos; o que você ajustar fica marcado e só volta ao automático com confirmação.</p>
    </Cartao>
  );
};

const Dlpa: React.FC<Props & { periodo: string }> = ({ contas, lancamentos, periodo }) => {
  const ano = Number(periodo.slice(0, 4));
  const d = useMemo(() => gerarDlpa(contas, lancamentos, ano), [contas, lancamentos, ano]);
  return (
    <Cartao titulo={`Demonstração de Lucros ou Prejuízos Acumulados — ${ano} (gerencial)`}>
      {d.contasLucros.length === 0 ? <p className="text-amber-800">Não há conta analítica de “Lucros/Prejuízos Acumulados” no plano. Crie ou renomeie a conta para gerar a demonstração.</p> : (
        <table className="w-full max-w-xl text-left"><tbody>
          <tr><td>Saldo no início do exercício</td><td>{moedaContabil(d.saldoInicial)}</td></tr>
          <tr><td>(+/−) Resultado do exercício (receitas − despesas)</td><td>{moedaContabil(d.resultadoExercicio)}</td></tr>
          {d.outrosMovimentos.map((m, i) => <tr key={i}><td>{m.data.split("-").reverse().join("/")} · {m.historico} <span className="text-slate-500">({m.contaContra})</span></td><td>{moedaContabil(m.centavos)}</td></tr>)}
          <tr className="font-bold"><td>Saldo no fim do exercício</td><td>{moedaContabil(d.saldoFinal)}</td></tr>
        </tbody></table>
      )}
      {d.avisoEncerramento && <p className="mt-2 text-red-700">Atenção: há crédito vindo de conta de apuração/resultado nas contas de lucros acumulados. Se for o encerramento do exercício, o resultado já está nesse lançamento e aparece em dobro acima. Confira antes de usar.</p>}
      <p className="mt-2 text-slate-600">Demonstração prevista no art. 186 da Lei 6.404/1976. Calculada pelos lançamentos definitivos: saldo anterior ao ano, resultado das contas de receita e despesa e movimentos nas contas de lucros/prejuízos acumulados (dividendos, reservas, ajustes). É gerencial: não substitui a demonstração assinada pelo contador.</p>
    </Cartao>
  );
};
