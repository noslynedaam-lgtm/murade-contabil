import React, { useMemo } from "react";
import { AlertTriangle, BookOpen, Calculator, CheckCircle2, Clock3, FileText, Users } from "lucide-react";
import { EmpresaDados, LancamentoContabil } from "../../types";

interface ModulosFinaisTabProps {
  empresa: EmpresaDados;
  lancamentos: LancamentoContabil[];
}

const origemFiscal = (origem: LancamentoContabil["origem"]) => origem.startsWith("Fiscal");
const origemDP = (origem: LancamentoContabil["origem"]) => origem.startsWith("DP");

export const ModulosFinaisTab: React.FC<ModulosFinaisTabProps> = ({ empresa, lancamentos }) => {
  const resumo = useMemo(() => {
    const fiscal = lancamentos.filter((item) => origemFiscal(item.origem));
    const dp = lancamentos.filter((item) => origemDP(item.origem));
    const invalidos = lancamentos.filter((item) => !Number.isFinite(item.valor) || item.valor <= 0 || !item.contaDebitoCodigo || !item.contaCreditoCodigo);
    return {
      fiscalCount: fiscal.length,
      fiscalTotal: fiscal.reduce((sum, item) => sum + (Number(item.valor) || 0), 0),
      dpCount: dp.length,
      dpTotal: dp.reduce((sum, item) => sum + (Number(item.valor) || 0), 0),
      invalidos: invalidos.length,
      total: lancamentos.length,
    };
  }, [lancamentos]);

  const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen className="h-5 w-5 text-blue-700" /> Processamento contábil da empresa</h2>
        <p className="mt-1 text-sm text-slate-600">{empresa.razaoSocial || "Empresa não cadastrada"}{empresa.cnpj ? ` · CNPJ ${empresa.cnpj}` : ""} · competência {empresa.competencia || "não definida"}</p>
        <p className="mt-2 text-xs text-slate-500">Este painel resume registros que já existem no Contábil. Integrações ainda não importam dados automaticamente nem geram/transmitem obrigações oficiais.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<Calculator className="h-4 w-4" />} title="Lançamentos locais" value={String(resumo.total)} detail="Contabilização mantida neste sistema" />
        <Metric icon={<FileText className="h-4 w-4" />} title="Origem Fiscal" value={String(resumo.fiscalCount)} detail={resumo.fiscalCount ? `${moeda(resumo.fiscalTotal)} em movimentos registrados` : "Nenhum lançamento Fiscal recebido"} />
        <Metric icon={<Users className="h-4 w-4" />} title="Origem Departamento Pessoal" value={String(resumo.dpCount)} detail={resumo.dpCount ? `${moeda(resumo.dpTotal)} em movimentos registrados` : "Nenhum lançamento do DP recebido"} />
        <Metric icon={resumo.invalidos ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} title="Conferência básica" value={resumo.invalidos ? `${resumo.invalidos} pendência(s)` : resumo.total ? "Sem erro básico" : "Sem dados"} detail="Verifica valor e contas preenchidos; não valida regras fiscais" />
      </section>

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <h3 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" /> Integrações e obrigações</h3>
        <p className="mt-1">Fiscal e Departamento Pessoal ainda não entregam dados ao Contábil por uma conexão ativa. Os botões de integração informam essa indisponibilidade e não criam lançamentos fictícios.</p>
        <p className="mt-1">O balancete local é calculado na aba própria a partir dos lançamentos e do plano de contas. Livro Diário/Razão, DRE, balanço patrimonial e arquivos oficiais precisam de dados completos, regras de classificação e validação do responsável; nenhuma transmissão à Receita, SEFAZ ou eSocial está configurada.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <WorkCard title="Departamento Pessoal" status={resumo.dpCount ? "Há lançamentos locais" : "Aguardando integração"} text="Folha, encargos, provisões e obrigações devem ser calculados e fechados no DP. O Contábil só contabiliza valores após receber dados estruturados e conferidos." />
        <WorkCard title="Fiscal" status={resumo.fiscalCount ? "Há lançamentos locais" : "Aguardando integração"} text="Notas e apurações fiscais precisam ser capturadas/validadas na origem. O Contábil ainda não recebe automaticamente livros, impostos ou lançamentos do Fiscal." />
        <WorkCard title="Contábil" status={resumo.total ? "Processamento local disponível" : "Aguardando dados"} text="Lançamentos e balancete local estão disponíveis. Fechamento e demonstrações finais dependem de plano de contas mapeado, dados completos, conferência e rotinas ainda não implementadas." />
      </section>

      <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /> Nenhum robô está executando folha, apuração fiscal, fechamento contábil ou envio oficial em segundo plano. O estado exibido acima reflete apenas os registros carregados nesta instalação.</p>
    </div>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; title: string; value: string; detail: string }> = ({ icon, title, value, detail }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">{icon}{title}</div>
    <div className="mt-2 text-xl font-black text-slate-900">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{detail}</div>
  </div>
);

const WorkCard: React.FC<{ title: string; status: string; text: string }> = ({ title, status, text }) => (
  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
    <div className="font-bold text-slate-900">{title}</div>
    <div className="mt-1 text-xs font-semibold text-amber-800">{status}</div>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">{text}</p>
  </article>
);
