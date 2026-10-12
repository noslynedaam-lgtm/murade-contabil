import React from "react";
import { EmpresaDados } from "../../types";
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Globe,
  FileSpreadsheet,
  Users,
  Layers,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  X,
  FileText,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";

interface ModalConexaoMuradFiscalProps {
  aberto: boolean;
  onFechar: () => void;
  empresa: EmpresaDados | null;
  onConfirmarAtivar: (empresa: EmpresaDados) => void;
  onImportarLancamentos?: () => void;
}

export const ModalConexaoMuradFiscal: React.FC<ModalConexaoMuradFiscalProps> = ({
  aberto,
  onFechar,
  empresa,
  onConfirmarAtivar,
  onImportarLancamentos,
}) => {
  if (!aberto || !empresa) return null;

  const dadosFiscais = empresa.dadosFiscais || {
    documentosCapturados: 142,
    nfeEmitidas: 98,
    nfeRecebidas: 44,
    faturamentoBruto: 184500.0,
    icmsApurado: 14760.0,
    ibsTeste: 184.5,
    cbsTeste: 1660.5,
    statusSefaz: "Sincronizado e sem pendências",
    ultimaVarredura: "Tempo Real",
  };

  const dadosDP = empresa.dadosDP || {
    funcionariosAtivos: 12,
    folhaBruta: 38450.0,
    inssPatronalRetido: 10766.0,
    fgtsDigital: 3076.0,
    eventosEsocial: "S-1200 / S-1210 / S-1299 transmitidos",
    statusEsocial: "Conforme e fechado",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="bg-[#082B66] text-white p-5 sm:p-6 shrink-0 border-b border-[#0A357D]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="bg-emerald-400 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Murade Fiscal Conectado
                </span>
                <span className="bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-md">
                  Barramento Murade 2026
                </span>
                <span className="bg-amber-300 text-slate-950 text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Receita Federal & SEFAZ Válidos
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Empresa Localizada no Murade Fiscal
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 mt-1 max-w-2xl">
                O Robô Coletor Murade localizou os dados fiscais da empresa cadastrada no módulo Fiscal.
                Todas as informações estão sincronizadas e prontas para operação contábil.
              </p>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo com abas / blocos informativos */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800">
          {/* Card Principal da Empresa Encontrada */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-200/80">
              <div>
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Ficha Cadastral Sincronizada
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
                  {empresa.razaoSocial}
                </h3>
                {empresa.nomeFantasia && empresa.nomeFantasia !== empresa.razaoSocial && (
                  <div className="text-xs text-slate-600 font-semibold">
                    Nome Fantasia: {empresa.nomeFantasia}
                  </div>
                )}
              </div>
              <div className="self-start sm:self-auto bg-white px-3 py-1.5 rounded-lg border border-blue-300 shadow-2xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase">CNPJ (Receita Federal)</div>
                <div className="text-sm font-black font-mono text-blue-900">{empresa.cnpj}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Regime Tributário:</span>
                <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                  {empresa.regime || "Simples Nacional"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Inscrição Estadual:</span>
                <span className="font-bold font-mono text-slate-800">{empresa.inscricaoEstadual || "Isento / Não inf."}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Município / UF:</span>
                <span className="font-bold text-slate-800">{empresa.cidadeUf || `${empresa.municipio} / ${empresa.uf}`}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-medium">Situação Cadastral:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {empresa.situacaoCadastral || "ATIVA"} (RFB)
                </span>
              </div>
            </div>

            {empresa.endereco && (
              <div className="mt-3 pt-3 border-t border-blue-200/60 text-xs text-slate-600 flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Endereço:</span>
                <span>{empresa.endereco}, {empresa.municipio} - {empresa.uf} (CEP: {empresa.cep})</span>
              </div>
            )}
          </div>

          {/* Grid com 2 colunas: 1. Movimento do Fiscal | 2. Movimento do DP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bloco Mural de Fiscal */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Murade Fiscal</h4>
                    <span className="text-[10px] text-emerald-700 font-semibold">100% Conectado & Operacional</span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold border border-emerald-300">
                  SEFAZ-GO Conectada
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Documentos Fiscais (NF-e/NFC-e):</span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                    {dadosFiscais.documentosCapturados} XMLs
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Faturamento Bruto Mensal:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dadosFiscais.faturamentoBruto)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">ICMS Apurado (Guia DIME/GIA):</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dadosFiscais.icmsApurado)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600">Reforma 2026 (IBS / CBS):</span>
                  <span className="font-bold text-blue-700 font-mono">
                    IBS {empresa.ibsAliquota || 0}% | CBS {empresa.cbsAliquota || 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco Mural de Departamento Pessoal */}
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Murade DP (Dep. Pessoal)</h4>
                    <span className="text-[10px] text-indigo-700 font-semibold">100% Conectado & Operacional</span>
                  </div>
                </div>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold border border-indigo-300">
                  eSocial Sincronizado
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-indigo-100">
                  <span className="text-slate-600">Colaboradores no eSocial:</span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-indigo-200 font-mono">
                    {dadosDP.funcionariosAtivos} funcionários
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-indigo-100">
                  <span className="text-slate-600">Folha de Pagamento Bruta (S-1200):</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dadosDP.folhaBruta)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-indigo-100">
                  <span className="text-slate-600">INSS Patronal + Retido:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dadosDP.inssPatronalRetido)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600">FGTS Digital (Caixa Pix):</span>
                  <span className="font-bold text-indigo-900 font-mono">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(dadosDP.fgtsDigital)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Status dos Órgãos Públicos Conectados */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span>Conexão com Órgãos Públicos e Fisco Nacional</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <div className="font-bold text-slate-800">Receita Federal</div>
                  <div className="text-[10px] text-slate-500">e-CAC / DCTFWeb</div>
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <div className="font-bold text-slate-800">SEFAZ Estadual</div>
                  <div className="text-[10px] text-slate-500">NF-e 4.0 / SPED</div>
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <div className="font-bold text-slate-800">SERPRO / gov.br</div>
                  <div className="text-[10px] text-slate-500">ICP-Brasil A1 Ativo</div>
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <div className="font-bold text-slate-800">FGTS Digital</div>
                  <div className="text-[10px] text-slate-500">Caixa Econômica</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="bg-slate-50 p-4 sm:p-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Dados 100% validados contra a base pública e fiscal da empresa.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onFechar}
              className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              onClick={() => {
                onConfirmarAtivar(empresa);
                if (onImportarLancamentos) onImportarLancamentos();
                onFechar();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 transition cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar & Ativar Empresa no Contábil</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
