import React, { useState } from "react";
import { OrgaoConectado } from "../../types";
import {
  RefreshCw,
  Server,
  AlertTriangle,
  Bot,
  Sparkles,
  Building,
  Landmark,
  Globe,
  Zap,
  Cpu,
  Layers,
  ExternalLink,
} from "lucide-react";

interface ConexoesTabProps {
  orgaos: OrgaoConectado[];
  onTestarTodas: () => void;
  onTestarIndividual?: (id: string) => void;
  isTesting: boolean;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
}

export const ConexoesTab: React.FC<ConexoesTabProps> = ({
  orgaos,
  onTestarTodas,
  onTestarIndividual,
  isTesting,
  onConectarFiscal,
  onConectarDP,
}) => {
  const [filtroEsfera, setFiltroEsfera] = useState<string>("todos");
  const [testandoId, setTestandoId] = useState<string | null>(null);
  const respondendo = orgaos.filter((orgao) => orgao.status === "alerta" || orgao.status === "conectado").length;
  const latencias = orgaos.map((orgao) => orgao.pingMs).filter((ping): ping is number => Number.isFinite(ping) && ping > 0);
  const latenciaMedia = latencias.length ? `${Math.round(latencias.reduce((total, ping) => total + ping, 0) / latencias.length)} ms` : "Sem medição";

  const orgaosFiltrados = orgaos.filter((org) => {
    if (filtroEsfera === "todos") return true;
    if (filtroEsfera === "Murade") {
      return org.esfera?.toLowerCase().includes("murade");
    }
    return org.esfera?.toLowerCase() === filtroEsfera.toLowerCase();
  });

  const getEsferaBadgeColor = (esfera?: string) => {
    switch (esfera) {
      case "Federal":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Estadual":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Municipal":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Murade Fiscal":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Murade DP":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Murade Fisco IA":
      case "Murade fisco IA":
        return "bg-violet-50 text-violet-700 border-violet-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 shadow-xs border border-slate-200 space-y-4">
      {/* 1. CABEÇALHO COM STATUS DO ROBÔ AUTÔNOMO */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#6A1B9A] to-[#4A148C] text-white flex items-center justify-center shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Conexões Públicas Governamentais</span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border border-amber-300/40">
                  Verificação sob demanda
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Os testes desta tela verificam resposta de rede. Eles não autenticam nos órgãos, não consultam dados fiscais e não transmitem declarações.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
          {onConectarFiscal && (
            <button
              id="btn-conectar-fiscal-conexoes"
              onClick={onConectarFiscal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Puxar Empresa do Murade Fiscal</span>
            </button>
          )}

          <button
            id="btn-testar-conexoes-top"
            onClick={onTestarTodas}
            disabled={isTesting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
            <span>{isTesting ? "Testando Handshake..." : "Testar Todos os Órgãos"}</span>
          </button>
        </div>
      </div>

      {/* 2. STATUS REAL DAS VERIFICAÇÕES */}
      <div className="bg-gradient-to-r from-[#EBF2F7] via-[#E2EAF2] to-[#DFE8F2] text-slate-800 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden border border-[#CBD5E1]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-300 flex items-center justify-center shrink-0 shadow-2xs">
              <Cpu className="w-5 h-5 text-blue-700 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">Estado das integrações</span>
                <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300 font-bold shadow-2xs">
                  Transporte não significa processamento concluído
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5">
                O status de rede/token confirma somente comunicação entre serviços. A rotina abaixo deixa claro o que cada módulo ainda precisa processar antes de considerar o fechamento pronto.
              </p>
            </div>
          </div>
        </div>

        {/* Papel e estado real de cada módulo; conexão sozinha não conclui o trabalho. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-300/80">
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-3 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Fiscal · origem dos documentos</div>
            <div className="mt-1 text-xs font-black text-slate-900">Captura e armazenamento na origem</div>
            <p className="mt-1 text-[11px] text-slate-600">Documentos novos ou atualizados podem ser enviados pelo Fiscal e persistidos por CNPJ. A integração exige token e PostgreSQL disponíveis; a classificação contábil continua pendente.</p>
          </div>
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-3 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Departamento Pessoal · origem da folha</div>
            <div className="mt-1 text-xs font-black text-amber-800">Folha e encargos não processados</div>
            <p className="mt-1 text-[11px] text-slate-600">A API de cálculo de folha ainda não está implementada; nenhum custo trabalhista deve ser lançado como concluído.</p>
          </div>
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-3 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Contábil · consolidação</div>
            <div className="mt-1 text-xs font-black text-amber-800">Lançamentos locais; sem fechamento integrado</div>
            <p className="mt-1 text-[11px] text-slate-600">Balancete usa lançamentos e plano de contas locais. Livros oficiais e obrigações ainda exigem integração, validação e conferência.</p>
          </div>
          <div className="md:col-span-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-white/70 px-3 py-2 text-[10px] text-slate-600">
            <span>Endereços que responderam: <strong className="text-slate-900">{respondendo} de {orgaos.length}</strong></span>
            <span>Autenticação oficial: <strong className="text-amber-800">não confirmada por este teste</strong></span>
            <span>Latência média: <strong className="text-blue-700">{latenciaMedia}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. FILTROS POR ESFERA GOVERNAMENTAL */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
        <button
          onClick={() => setFiltroEsfera("todos")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "todos"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>Todos ({orgaos.length})</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Federal")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Federal"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Federal (RFB / PGFN / FGTS / eSocial)</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Estadual")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Estadual"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Estadual (SEFAZ / Sintegra / Junta)</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Municipal")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Municipal"
              ? "bg-amber-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Municipal (Prefeitura / ISS / CND)</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Murade Fiscal")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Murade Fiscal"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Murade fiscal</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Murade DP")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Murade DP"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Murade DP</span>
        </button>
        <button
          onClick={() => setFiltroEsfera("Murade fisco IA")}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            filtroEsfera === "Murade fisco IA"
              ? "bg-purple-700 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Murade fisco IA</span>
        </button>
      </div>

      {/* 4. GRID DE ÓRGÃOS ORGANIZADOS E CONECTADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {orgaosFiltrados.map((orgao) => (
          <div
            key={orgao.id}
            className="p-3.5 rounded-xl border transition-all text-xs bg-slate-50/70 hover:bg-slate-50 border-slate-200 shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                    <span>{orgao.nome}</span>
                    <span className="text-[10px] font-bold text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                      {orgao.sigla}
                    </span>
                    {orgao.esfera && (
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border uppercase ${getEsferaBadgeColor(
                          orgao.esfera
                        )}`}
                      >
                        {orgao.esfera}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{orgao.statusTexto || "Não verificado"} — {orgao.descricao}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {testandoId === orgao.id ? "Testando..." : orgao.pingMs ? `${orgao.pingMs}ms` : "Sem teste"}
                  </span>
                  <span className="text-[9px] font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    {orgao.statusCode ? `HTTP ${orgao.statusCode}` : "Sem resposta"}
                  </span>
                </div>
              </div>

              {/* Informações Técnicas de Segurança */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                  🔒 {orgao.tls || "TLS não verificado"}
                </span>
                <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                  🏢 {orgao.ambiente || "Ambiente não configurado"}
                </span>
                {orgao.credencialTipo && (
                  <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium text-slate-600 truncate max-w-[190px]">
                    🔑 {orgao.credencialTipo}
                  </span>
                )}
              </div>

              {/* Situação informativa; não representa ação automática */}
              <div className="mt-2.5 p-2 rounded-lg bg-purple-50/60 border border-purple-200/70 text-[11px] text-purple-900 flex items-start gap-1.5">
                <Bot className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-purple-950 font-bold">Observação:</strong>{" "}
                  <span className="text-purple-900/90">{orgao.detalhes || "Integração ainda não configurada."}</span>
                </div>
              </div>
            </div>

            {/* Rodapé do Card do Órgão com Ações Reais */}
            <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                {orgao.ultimaVerificacao}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {/* Botão de Testar Conexão Direta */}
                <button
                  type="button"
                  onClick={() => {
                    setTestandoId(orgao.id);
                    if (onTestarIndividual) {
                      onTestarIndividual(orgao.id);
                    }
                    setTimeout(() => setTestandoId(null), 1200);
                  }}
                  disabled={testandoId === orgao.id}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 rounded text-[11px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Testar resposta de comunicação com este órgão agora"
                >
                  <RefreshCw className={`w-3 h-3 ${testandoId === orgao.id ? "animate-spin text-blue-600" : ""}`} />
                  <span>{testandoId === orgao.id ? "Testando..." : "Testar"}</span>
                </button>

                {/* Link para o Portal Oficial Real do Órgão */}
                {orgao.url && (
                  <a
                    href={orgao.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-semibold transition flex items-center gap-1 shadow-2xs"
                    title={`Abrir portal oficial (${orgao.url}) em nova aba`}
                  >
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                    <span>Portal Oficial</span>
                  </a>
                )}

              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 5. STATUS DO CERTIFICADO */}
      <div className="bg-amber-50/70 border-l-3 border-amber-500 p-3.5 rounded-r-xl rounded-l-xs text-xs text-amber-950">
        <strong>Certificado e procuração:</strong> este módulo não valida, armazena ou usa certificados digitais, nem consulta procurações da RFB. Selecionar um arquivo aqui não autenticaria a empresa; use apenas o fluxo de certificado de uma integração que confirme a validação no servidor.
      </div>

      {/* 6. RODAPÉ DE OPERAÇÃO */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-slate-500 pt-1">
        <button
          id="btn-testar-todas-conexoes"
          onClick={onTestarTodas}
          disabled={isTesting}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
        >
          <Server className="w-3.5 h-3.5" />
          <span>{isTesting ? "Verificando Comunicação..." : "Varredura Imediata em Todos os Órgãos"}</span>
        </button>

        <span className="text-[11px] text-slate-600">
          Verificação de alcance não autentica integrações. {respondendo} endereço(s) respondeu(ram) ao último teste.
        </span>
      </div>

    </div>
  );
};

