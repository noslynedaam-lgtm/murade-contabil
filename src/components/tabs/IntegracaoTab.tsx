import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw } from "lucide-react";
import { EmpresaDados } from "../../types";

type EstadoOrigem = { disponivel: boolean; documentosRecebidos?: number; folhasRecebidas?: number; ultimoRecebimento: string | null };
type EstadoIntegracao = {
  sucesso: true;
  escopo: string;
  armazenamento: string;
  tokenServicoConfigurado: boolean;
  fiscal: EstadoOrigem;
  departamentoPessoal: EstadoOrigem;
  rascunhosAguardamConferencia: true;
  transmissaoAutomaticaHabilitada: false;
  reconciliacaoRascunhos: { iniciouEm: string | null; concluiuEm: string | null; empresas: number; criados: number; atualizados: number; falhas: number; emCurso: boolean };
  consultadoEm: string;
};

interface IntegracaoTabProps {
  empresa?: EmpresaDados;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
}

export const IntegracaoTab: React.FC<IntegracaoTabProps> = ({ empresa }) => {
  const [estado, setEstado] = useState<EstadoIntegracao | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/integracao/status", { credentials: "include", cache: "no-store" });
      const resultado = await response.json().catch(() => ({}));
      if (!response.ok || resultado.sucesso !== true) throw new Error(resultado.motivo || "Não foi possível ler o estado das integrações.");
      setEstado(resultado as EstadoIntegracao);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao consultar as integrações.");
      setEstado(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void atualizar();
    const intervalo = window.setInterval(() => void atualizar(), 60_000);
    return () => window.clearInterval(intervalo);
  }, [atualizar]);

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Database className="h-5 w-5 text-blue-700" /> Integrações do Murade Contábil</h2>
        <p className="mt-1 text-sm text-slate-600">Estado consultado no servidor e limitado às empresas autorizadas da sua sessão.</p>
      </div>
      <button type="button" onClick={() => void atualizar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar estado</button>
    </header>

    {erro && <div role="alert" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</div>}
    {!estado && !erro && <p role="status" className="text-sm text-slate-500">Consultando o estado real do servidor…</p>}

    {estado && <>
      <div className="grid gap-3 md:grid-cols-3">
        <Metric titulo="Banco de dados" valor={estado.armazenamento === "postgresql" ? "PostgreSQL" : "Indisponível"} detalhe="Persistência consultada no servidor" ok={estado.armazenamento === "postgresql"} />
        <Metric titulo="Token de serviço" valor={estado.tokenServicoConfigurado ? "Configurado" : "Pendente"} detalhe="O segredo não é exibido no navegador" ok={estado.tokenServicoConfigurado} />
        <Metric titulo="Envio automático" valor="Desativado" detalhe="Rascunhos exigem revisão antes de contabilizar" ok={false} />
      </div>

      <div className={`rounded-lg border p-4 text-sm ${estado.reconciliacaoRascunhos.falhas ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>Preparação automática de rascunhos</strong>
          <span className="text-xs font-semibold">{estado.reconciliacaoRascunhos.emCurso ? "Executando agora" : estado.reconciliacaoRascunhos.concluiuEm ? "Último ciclo concluído" : "Aguardando primeiro ciclo"}</span>
        </div>
        <p className="mt-1 text-xs">Último ciclo: {estado.reconciliacaoRascunhos.concluiuEm ? new Date(estado.reconciliacaoRascunhos.concluiuEm).toLocaleString("pt-BR") : "ainda não registrado nesta execução do servidor"}. Empresas com mapeamento processadas: {estado.reconciliacaoRascunhos.empresas}; rascunhos novos: {estado.reconciliacaoRascunhos.criados}; atualizados: {estado.reconciliacaoRascunhos.atualizados}; falhas: {estado.reconciliacaoRascunhos.falhas}.</p>
        <p className="mt-1 text-xs">Isso apenas prepara ou atualiza propostas com dados recebidos do Fiscal e do DP. Não aprova lançamentos, não fecha competência e não transmite obrigações.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Origem titulo="Murade Fiscal" item={estado.fiscal} total={estado.fiscal.documentosRecebidos || 0} substantivo="documentos fiscais" />
        <Origem titulo="Murade Departamento Pessoal" item={estado.departamentoPessoal} total={estado.departamentoPessoal.folhasRecebidas || 0} substantivo="resumos agregados de folha" />
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
        <strong>Como os dados chegam:</strong> os serviços de origem mantêm filas persistentes e enviam dados ao Contábil por APIs autenticadas quando o destino e o token estão configurados. O Fiscal tenta novamente as pendências a cada minuto; o DP tenta a cada 30 segundos e também após formar um resumo mensal completo. O Fiscal só transmite documentos já armazenados nele; isso não busca notas na SEFAZ. O DP transmite apenas resumos agregados por competência, sem dados pessoais. Se o envio falhar, o item continua pendente para nova tentativa. O Contábil reconcilia os dados recebidos e mapeados a cada minuto, preparando rascunhos. Eles aguardam sua revisão e aprovação; nenhum lançamento definitivo ou transmissão oficial acontece sozinho.
      </div>
      {empresa?.cnpj && <p className="text-xs text-slate-500">Empresa selecionada: {empresa.razaoSocial || "Sem razão social"} · CNPJ {empresa.cnpj}. O estado acima soma somente empresas autorizadas para este usuário.</p>}
      <p className="flex items-center gap-1 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Consultado em {new Date(estado.consultadoEm).toLocaleString("pt-BR")}</p>
    </>}
  </section>;
};

const Metric: React.FC<{ titulo: string; valor: string; detalhe: string; ok: boolean }> = ({ titulo, valor, detalhe, ok }) => <article className="rounded-lg border border-slate-200 p-4">
  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}{titulo}</div>
  <strong className="mt-2 block text-lg text-slate-900">{valor}</strong><p className="mt-1 text-xs text-slate-500">{detalhe}</p>
</article>;

const Origem: React.FC<{ titulo: string; item: EstadoOrigem; total: number; substantivo: string }> = ({ titulo, item, total, substantivo }) => <article className="rounded-lg border border-slate-200 p-4">
  <h3 className="font-bold text-slate-900">{titulo}</h3>
  <p className={`mt-2 text-sm font-semibold ${item.disponivel ? "text-emerald-700" : "text-amber-800"}`}>{item.disponivel ? "Recebimento persistente disponível" : "Banco de origem indisponível"}</p>
  <p className="mt-1 text-xs text-slate-600">{total} {substantivo} recebidos nas empresas autorizadas.</p>
  <p className="mt-1 text-xs text-slate-500">Último recebimento: {item.ultimoRecebimento ? new Date(item.ultimoRecebimento).toLocaleString("pt-BR") : "nenhum registro recebido"}</p>
</article>;
