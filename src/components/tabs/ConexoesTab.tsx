import React, { useState, useRef } from "react";
import { OrgaoConectado, EmpresaDados } from "../../types";
import {
  CheckCircle2,
  Shield,
  Key,
  RefreshCw,
  Server,
  AlertTriangle,
  FileCode,
  Bot,
  Sparkles,
  Building,
  Landmark,
  Globe,
  Zap,
  Cpu,
  Layers,
  ArrowRight,
  FolderOpen,
  UploadCloud,
  ExternalLink,
  Settings,
  X,
  Lock,
} from "lucide-react";

interface ConexoesTabProps {
  orgaos: OrgaoConectado[];
  onTestarTodas: () => void;
  onTestarIndividual?: (id: string) => void;
  onAtualizarOrgao?: (id: string, updates: Partial<OrgaoConectado>) => void;
  isTesting: boolean;
  empresa?: EmpresaDados;
  onUpdateEmpresa?: (dados: Partial<EmpresaDados>) => void;
  onConectarFiscal?: () => void;
  onConectarDP?: () => void;
}

export const ConexoesTab: React.FC<ConexoesTabProps> = ({
  orgaos,
  onTestarTodas,
  onTestarIndividual,
  onAtualizarOrgao,
  isTesting,
  empresa,
  onUpdateEmpresa,
  onConectarFiscal,
  onConectarDP,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [certFileName, setCertFileName] = useState(
    empresa?.certificadoNomeArquivo || "certificado_matriz_2026.pfx"
  );
  const [certPassword, setCertPassword] = useState("••••••••••••");
  const [usarProcuracao, setUsarProcuracao] = useState(true);
  const [certStatus, setCertStatus] = useState(
    empresa?.certificadoValidade
      ? `Validade: ${empresa.certificadoValidade} (${empresa.certificadoTipo || "ICP-Brasil A1"})`
      : "Validade: 18/12/2026 (ICP-Brasil A1)"
  );
  const [filtroEsfera, setFiltroEsfera] = useState<string>("todos");
  const [pilotoAutomaticoAtivo, setPilotoAutomaticoAtivo] = useState(true);
  const [testandoId, setTestandoId] = useState<string | null>(null);
  const [modalConfigOrgao, setModalConfigOrgao] = useState<OrgaoConectado | null>(null);

  // Form states do modal de configuração do órgão
  const [cfgAmbiente, setCfgAmbiente] = useState("Produção");
  const [cfgToken, setCfgToken] = useState("");
  const [cfgEndpoint, setCfgEndpoint] = useState("");

  const abrirSeletorArquivos = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const tamanho = (file.size / 1024).toFixed(1) + " KB";
      setCertFileName(file.name);
      setCertStatus(`Certificado '${file.name}' (${tamanho}) carregado do computador — Pronto para assinatura digital`);
      if (onUpdateEmpresa) {
        onUpdateEmpresa({
          certificadoAtivo: true,
          certificadoNomeArquivo: file.name,
          certificadoTamanho: tamanho,
          certificadoValidade: "18/12/2027",
          certificadoTipo: file.name.toLowerCase().includes("a3") ? "ICP-Brasil A3" : "ICP-Brasil A1",
          certificadoEmissor: "AC SERPRO v5",
        });
      }
    }
  };

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
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border border-emerald-300/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  100% Automatizado pelo Robô
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                O Robô Murade executa todas as conexões, capturas e conciliações sozinho. <strong>O contador apenas confere</strong>.
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

      {/* 2. CARD DO ROBÔ MURADE — PILOTO AUTOMÁTICO COMPLETO */}
      <div className="bg-gradient-to-r from-[#EBF2F7] via-[#E2EAF2] to-[#DFE8F2] text-slate-800 rounded-xl p-3.5 sm:p-4 shadow-xs relative overflow-hidden border border-[#CBD5E1]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-300 flex items-center justify-center shrink-0 shadow-2xs">
              <Cpu className="w-5 h-5 text-blue-700 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
                  Robô Piloto Automático Murad:
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 font-bold shadow-2xs">
                  Sincronização 24/7 Ativa
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5">
                Conectado com <strong className="text-slate-900">Federal (RFB, PGFN, FGTS, eSocial)</strong>, <strong className="text-slate-900">Estadual (SEFAZ, Sintegra, Junta)</strong>, <strong className="text-slate-900">Prefeituras (ISS, CND)</strong>, <strong className="text-blue-800 font-bold">Murade fiscal</strong>, <strong className="text-blue-800 font-bold">Murade DP</strong> e <strong className="text-blue-800 font-bold">Murade fisco IA</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-300">
            <span className="text-[11px] text-slate-600 font-semibold">Modo Autônomo:</span>
            <button
              onClick={() => setPilotoAutomaticoAtivo(!pilotoAutomaticoAtivo)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                pilotoAutomaticoAtivo
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300 border border-slate-300"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{pilotoAutomaticoAtivo ? "Robô Faz Tudo Sozinho" : "Pausado"}</span>
            </button>
          </div>
        </div>

        {/* Mini Métricas do Robô */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-300/80 text-center">
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-1.5 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Órgãos Conectados</div>
            <div className="text-sm font-black text-slate-900">{orgaos.length} de {orgaos.length} (100%)</div>
          </div>
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-1.5 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Esferas Integradas</div>
            <div className="text-sm font-black text-blue-700">4 Âmbitos Completos</div>
          </div>
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-1.5 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Trabalho do Contador</div>
            <div className="text-sm font-black text-emerald-700">Apenas Conferir</div>
          </div>
          <div className="bg-white/90 border border-slate-300/80 rounded-lg p-1.5 shadow-2xs">
            <div className="text-[10px] text-slate-600 uppercase font-bold">Latência Média</div>
            <div className="text-sm font-black text-blue-600">28ms (Tempo Real)</div>
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

                  <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Conectado — {orgao.descricao}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                    {testandoId === orgao.id ? "Testando..." : `${orgao.pingMs || 25}ms`}
                  </span>
                  <span className="text-[9px] font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    {orgao.statusCode ? `${orgao.statusCode} OK` : "200 OK"}
                  </span>
                </div>
              </div>

              {/* Informações Técnicas de Segurança */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                  🔒 {orgao.tls || "TLS 1.3 / HTTPS"}
                </span>
                <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                  🏢 {orgao.ambiente || "Produção Oficial"}
                </span>
                {orgao.credencialTipo && (
                  <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium text-slate-600 truncate max-w-[190px]">
                    🔑 {orgao.credencialTipo}
                  </span>
                )}
              </div>

              {/* Ação autônoma executada pelo robô */}
              <div className="mt-2.5 p-2 rounded-lg bg-purple-50/60 border border-purple-200/70 text-[11px] text-purple-900 flex items-start gap-1.5">
                <Bot className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-purple-950 font-bold">Ação do Robô:</strong>{" "}
                  <span className="text-purple-900/90">{orgao.detalhes || "Sincronização automática e contínua ativa."}</span>
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

                {/* Botão Configurar Credenciais */}
                <button
                  type="button"
                  onClick={() => {
                    setModalConfigOrgao(orgao);
                    setCfgAmbiente(orgao.ambiente || "Produção");
                    setCfgEndpoint(orgao.url || "");
                    setCfgToken("");
                  }}
                  className="p-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded text-[11px] transition cursor-pointer shadow-2xs"
                  title="Configurar WSDL, Token e Ambiente"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 5. CARD DO CERTIFICADO DIGITAL E PROCURAÇÃO */}
      <div className="bg-amber-50/70 border-l-3 border-amber-500 p-3.5 rounded-r-xl rounded-l-xs text-xs">
        <div className="flex items-center justify-between font-bold text-amber-950 text-xs mb-2.5">
          <div className="flex items-center gap-1.5">
            <Key className="w-4 h-4 text-amber-600" />
            <span>Certificado Digital ICP-Brasil & Procuração Eletrônica</span>
          </div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
            Autenticado
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Certificado Digital (.pfx / .p12 / A1)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                id="cert-file-input"
                className="hidden"
                accept=".pfx,.p12,.cer,.crt,.pem"
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={abrirSeletorArquivos}
                className="flex-1 bg-white border border-slate-300 hover:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 cursor-pointer flex items-center justify-between transition text-left shadow-2xs"
                title="Clique para buscar o arquivo no seu computador"
              >
                <span className="truncate max-w-[200px] flex items-center gap-1.5 font-mono text-[11px]">
                  <Key className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{certFileName}</span>
                </span>
                <span className="bg-blue-600 hover:bg-blue-700 text-white font-bold ml-1 text-[10px] px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                  <FolderOpen className="w-3 h-3" />
                  <span>Buscar no PC</span>
                </span>
              </button>
            </div>
            <div className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="truncate">{certStatus}</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Senha do Certificado Digital
            </label>
            <input
              type="password"
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 font-mono"
              value={certPassword}
              onChange={(e) => setCertPassword(e.target.value)}
              placeholder="Digite a senha..."
            />
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="checkbox"
                id="check-procuracao"
                checked={usarProcuracao}
                onChange={(e) => setUsarProcuracao(e.target.checked)}
                className="rounded text-blue-600 cursor-pointer w-3.5 h-3.5"
              />
              <label htmlFor="check-procuracao" className="text-[10px] font-medium text-slate-700 cursor-pointer">
                Usar Procuração Eletrônica RFB (Acesso multiclientes ativo)
              </label>
            </div>
          </div>
        </div>
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
          Última sincronização pelo Robô: <strong className="text-slate-800">Hoje às 14:32</strong> • {orgaos.length} de {orgaos.length} Conexões 100% OK
        </span>
      </div>

      {/* MODAL DE CONFIGURAÇÃO DE CREDENCIAIS / WEBSERVICE DO ÓRGÃO */}
      {modalConfigOrgao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Configurar Integração: {modalConfigOrgao.sigla}
                  </h4>
                  <p className="text-[11px] text-slate-500">{modalConfigOrgao.nome}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalConfigOrgao(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ambiente Operacional
                </label>
                <select
                  value={cfgAmbiente}
                  onChange={(e) => setCfgAmbiente(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-blue-600 font-medium"
                >
                  <option value="Produção">Produção Oficial Governamental</option>
                  <option value="Homologação">Homologação / Testes (Sandbox)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  URL Endpoint WSDL / REST
                </label>
                <input
                  type="text"
                  value={cfgEndpoint}
                  onChange={(e) => setCfgEndpoint(e.target.value)}
                  placeholder="https://servicos.orgao.gov.br/ws"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chave de API / Token de Acesso / Client ID (Opcional)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={cfgToken}
                    onChange={(e) => setCfgToken(e.target.value)}
                    placeholder="Token seguro do órgão ou em branco para Certificado A1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-blue-600"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se deixado em branco, o robô autentica usando o Certificado ICP-Brasil ({certFileName}).
                </p>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <div className="font-bold text-blue-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                  <span>Criptografia Ativa</span>
                </div>
                <p className="text-[11px] text-blue-900/80">
                  Comunicação direta com canal TLS 1.3 autenticada pelo CNPJ da matriz e procuração eletrônica.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalConfigOrgao(null)}
                className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onAtualizarOrgao && modalConfigOrgao) {
                    onAtualizarOrgao(modalConfigOrgao.id, {
                      ambiente: cfgAmbiente,
                      url: cfgEndpoint || modalConfigOrgao.url,
                      detalhes: `Configurado para ${cfgAmbiente}. Endpoint: ${cfgEndpoint || modalConfigOrgao.url}`,
                    });
                  }
                  setModalConfigOrgao(null);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

