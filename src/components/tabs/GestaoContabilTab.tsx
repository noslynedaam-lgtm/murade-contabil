import React, { useMemo, useState } from "react";
import { CentroCustoContabil, ContaPlano, EmpresaDados, LancamentoContabil, PreLancamentoContabil } from "../../types";
import { compararPeriodos, explicarVariacoes, resultadoPorCentroCusto } from "../../utils/analiseContabil";
import { BemImobilizado, depreciacaoAcumulada, filialAtual, quotaDoMes, resultadoDaBaixa, totalQuotasDoMes, validarBem, valorContabilLiquido } from "../../utils/imobilizado";
import { conciliar, lancamentoDoMovimento, lerOFX, MovimentoExtrato, sugerirContraPartida } from "../../utils/extratoBancario";
import { CONFIRMACOES_MANUAIS, conferirFechamento, referenciaDepreciacao } from "../../utils/fechamentoContabil";
import { moedaContabil } from "../../utils/livrosContabeis";

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
}

type Secao = "comparativo" | "centros" | "imobilizado" | "extrato" | "fechamento";
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
          {aba("comparativo", "Comparativo e explicações")}{aba("centros", "Centros de custo")}{aba("imobilizado", "Ativo imobilizado")}{aba("extrato", "Extrato e conciliação")}{aba("fechamento", "Fechamento guiado")}
          <label className="ml-auto text-xs font-bold text-slate-700">Competência
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm font-medium" />
          </label>
        </div>
      </header>
      {!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">Escolha uma competência válida.</p> : (
        <>
          {secao === "comparativo" && <Comparativo {...p} periodo={periodo} />}
          {secao === "centros" && <Centros {...p} periodo={periodo} />}
          {secao === "imobilizado" && <Imobilizado {...p} periodo={periodo} analiticas={analiticas} />}
          {secao === "extrato" && <Extrato {...p} analiticas={analiticas} periodo={periodo} />}
          {secao === "fechamento" && <Fechamento {...p} periodo={periodo} />}
        </>
      )}
    </div>
  );
};

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

const Imobilizado: React.FC<Props & { periodo: string; analiticas: ContaPlano[] }> = ({ bens, onBens, periodo, analiticas, lancamentos, onAdicionarLancamento, workspacePersistido }) => {
  const [f, setF] = useState({ descricao: "", filial: "", custo: "", residual: "0", vida: "60", inicio: periodo, depreciavel: true });
  const [erros, setErros] = useState<string[]>([]);
  const [despesa, setDespesa] = useState(""); const [acumulada, setAcumulada] = useState(""); const [msg, setMsg] = useState("");
  const quotas = totalQuotasDoMes(bens, periodo);
  const jaLancada = lancamentos.some((l) => l.documentoRef === referenciaDepreciacao(periodo) && l.statusManual !== "rejeitado");
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
              <tr key={b.id}><td>{b.descricao}</td><td>{filialAtual(b, periodo) ?? "—"}</td><td>{moedaContabil(b.custoCentavos)}</td><td>{moedaContabil(quotaDoMes(b, periodo))}</td><td>{moedaContabil(depreciacaoAcumulada(b, periodo))}</td><td>{moedaContabil(valorContabilLiquido(b, periodo))}</td>
                <td>{b.baixa ? `${b.baixa.motivo === "venda" ? "Vendido" : "Baixado"} em ${b.baixa.competencia} · ${(resultadoDaBaixa(b) ?? 0) >= 0 ? "ganho" : "perda"} de ${moedaContabil(Math.abs(resultadoDaBaixa(b) ?? 0))}` : "Em uso"}</td>
                <td>{!b.baixa && <span className="flex gap-1"><button type="button" className="rounded border px-2 py-0.5" onClick={() => registrarBaixa(b, "venda")}>Vender</button><button type="button" className="rounded border px-2 py-0.5" onClick={() => registrarBaixa(b, "baixa")}>Baixar</button><button type="button" className="rounded border px-2 py-0.5" onClick={() => transferir(b)}>Transferir</button></span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mt-2 font-semibold">Depreciação do mês: {moedaContabil(quotas.total)} {jaLancada && "(já lançada)"}</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1">Conta de despesa de depreciação<select value={despesa} onChange={(e) => setDespesa(e.target.value)} className="rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <label className="grid gap-1">Conta de depreciação acumulada<select value={acumulada} onChange={(e) => setAcumulada(e.target.value)} className="rounded border px-2 py-1"><option value="">Escolha…</option>{analiticas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.descricao}</option>)}</select></label>
          <button type="button" onClick={lancar} disabled={!quotas.total || jaLancada} className="rounded-md bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">Lançar depreciação do mês</button>
        </div>
        {msg && <p className="mt-1 text-slate-800">{msg}</p>}
        <p className="mt-1 text-slate-600">Na baixa, a depreciação para no mês anterior ao da baixa. O ganho ou a perda é o valor da venda menos o valor contábil líquido.</p>
      </Cartao>
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
      <button type="button" disabled={!r.podeFechar || fechada || !workspacePersistido} onClick={async () => { if (window.confirm(`Fechar a competência ${periodo}? O servidor vai bloquear alterações nesse mês.`)) await onFecharMes(periodo); }} className="mt-3 rounded-md bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50">{fechada ? "Competência já fechada" : r.podeFechar ? "Fechar competência" : "Resolva os itens para fechar"}</button>
      <p className="mt-2 text-slate-600">Os itens automáticos vêm dos dados deste Contábil. Os itens "confirmação sua" o sistema não consegue verificar sozinho (banco, contas a pagar/receber, folha e impostos): você confirma depois de conferir. O servidor ainda aplica suas próprias validações no fechamento.</p>
    </Cartao>
  );
};
