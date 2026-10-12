import React, { useState } from "react";
import { Scale, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, RefreshCw, Calendar } from "lucide-react";

interface IbsCbsReformaCardProps {
  className?: string;
  defaultSimularAno?: number;
}

export const IbsCbsReformaCard: React.FC<IbsCbsReformaCardProps> = ({
  className = "",
  defaultSimularAno,
}) => {
  // Ano detectado automaticamente pelo sistema (ou simulador para o usuário testar)
  const anoReal = new Date().getFullYear();
  const [anoAtivo, setAnoAtivo] = useState<number>(defaultSimularAno || anoReal);
  const [mostrarSimulador, setMostrarSimulador] = useState(false);

  // Valores de exemplo de apuração do faturamento atual da empresa (R$ 25.000 de base)
  const baseFaturamento = 25000;
  const icmsAtual = 3800;
  const issAtual = 1200;
  const piscofinsAtual = 2450;

  // IBS e CBS estimados (Lei Complementar nº 200/2024)
  const aliquotaIBS = 17.0; // %
  const aliquotaCBS = 8.8; // %
  const creditoIBS = 850;
  const creditoCBS = 420;
  const valorIBS = (baseFaturamento * (aliquotaIBS / 100)) - creditoIBS;
  const valorCBS = (baseFaturamento * (aliquotaCBS / 100)) - creditoCBS;

  // Determinação da fase conforme o script da Lei Complementar nº 200/2024
  const isFaseAtual = anoAtivo < 2027;
  const isFaseCalculo = anoAtivo >= 2027 && anoAtivo < 2029;
  const isFaseVigenteParcial = anoAtivo >= 2029 && anoAtivo < 2033;
  const isFaseFinal = anoAtivo >= 2033;

  // A área de cálculo paralelo aparece a partir de 2027 ou quando o usuário ativar a simulação
  const mostrarAreaCalculo = !isFaseAtual;

  return (
    <div
      className={`my-5 rounded-2xl p-5 sm:p-6 shadow-xs border border-[#CBD5E1] bg-[#EEF4F9] text-slate-800 relative overflow-hidden ${className}`}
    >
      {/* CABEÇALHO DO CARD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-300">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-xl shrink-0">
            ⚖️
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <span>Reforma Tributária — IBS / CBS</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-300 px-2 py-0.5 rounded-full font-bold">
                LC nº 200/2024
              </span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Módulo automático de transição tributária integrado ao Plano de Contas e à Apuração Contábil
            </p>
          </div>
        </div>

        {/* ETIQUETA DA FASE DINÂMICA */}
        <div className="flex items-center gap-2 flex-wrap">
          {isFaseAtual && (
            <span
              id="etiquetaFase"
              className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              FASE ATUAL • ICMS/ISS/PIS/COFINS VIGENTES
            </span>
          )}

          {isFaseCalculo && (
            <span
              id="etiquetaFase"
              className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-900 border border-sky-300 flex items-center gap-1.5 shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
              TRANSIÇÃO • CÁLCULO PARALELO OBRIGATÓRIO
            </span>
          )}

          {isFaseVigenteParcial && (
            <span
              id="etiquetaFase"
              className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              VIGENTE • IBS/CBS EM SUBSTITUIÇÃO GRADUAL
            </span>
          )}

          {isFaseFinal && (
            <span
              id="etiquetaFase"
              className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              VIGENTE • SÓ IBS/CBS (100% UNIFICADO)
            </span>
          )}

          {/* Botão para testar/simular outras fases */}
          <button
            onClick={() => setMostrarSimulador(!mostrarSimulador)}
            className="text-[11px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer font-semibold shadow-2xs"
            title="Alternar ano para conferir o comportamento automático das regras"
          >
            <Calendar className="w-3 h-3 text-blue-600" />
            <span>Ano: {anoAtivo} {anoAtivo === anoReal ? "(Hoje)" : "(Simulado)"}</span>
          </button>
        </div>
      </div>

      {/* SELETOR RÁPIDO DE FASE/ANO (SIMULAÇÃO) */}
      {mostrarSimulador && (
        <div className="mb-4 p-3 rounded-xl bg-white border border-slate-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs animate-fade-in">
          <div className="flex items-center gap-1.5 text-slate-700">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Simular Linha do Tempo da Reforma:</strong> Escolha um ano para visualizar a ativação automática:
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setAnoAtivo(2026)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                anoAtivo === 2026
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              2026 (Fase Atual)
            </button>
            <button
              onClick={() => setAnoAtivo(2027)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                anoAtivo === 2027
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              2027 (Cálculo Paralelo)
            </button>
            <button
              onClick={() => setAnoAtivo(2029)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                anoAtivo === 2029
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              2029 (Início Pagamento)
            </button>
            <button
              onClick={() => setAnoAtivo(2033)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition ${
                anoAtivo >= 2033
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
              }`}
            >
              2033+ (Fase Final)
            </button>
          </div>
        </div>
      )}

      {/* AVISO DE FASE */}
      <div id="avisoFase" className="p-3.5 rounded-xl text-xs bg-amber-50 border-l-4 border-amber-500 border-y border-r border-amber-200 text-slate-800 mb-4 leading-relaxed shadow-2xs">
        {isFaseAtual && (
          <>
            📅 <strong>2026 — Fase Atual:</strong> Impostos vigentes: ICMS, ISS, PIS e COFINS.<br />
            ⏳ <strong>2027:</strong> Cálculo paralelo obrigatório de IBS/CBS — sem pagamento.<br />
            ✅ <strong>2029:</strong> IBS e CBS entram em vigor — início do pagamento.<br />
            🏁 <strong>2033:</strong> Fim total de ICMS, ISS, PIS e COFINS.
          </>
        )}

        {isFaseCalculo && (
          <>
            📅 <strong>2027 — Cálculo Paralelo Obrigatório:</strong> IBS e CBS calculados paralelamente aos impostos atuais. <strong>Ainda não são devidos — não paga!</strong><br />
            ⏳ <strong>2029:</strong> IBS e CBS entram em vigor — início do pagamento.<br />
            🏁 <strong>2033:</strong> Fim total de ICMS, ISS, PIS e COFINS.
          </>
        )}

        {isFaseVigenteParcial && (
          <>
            ✅ <strong>2029 — IBS e CBS em Vigor:</strong> Impostos novos em cobrança. ICMS/ISS em redução gradual.<br />
            🏁 <strong>2033:</strong> Fim total de ICMS, ISS, PIS e COFINS — só IBS e CBS.
          </>
        )}

        {isFaseFinal && (
          <>
            🏁 <strong>2033+ — Fase Final:</strong> ICMS, ISS, PIS e COFINS extintos. Apenas IBS e CBS vigentes.
          </>
        )}
      </div>

      {/* 📊 CÁLCULO PARALELO — APARECE A PARTIR DE 2027 OU SIMULAÇÃO */}
      {mostrarAreaCalculo ? (
        <div id="areaCalculoParalelo" className="mb-5 animate-fade-in">
          <div className="text-xs sm:text-sm text-slate-700 font-semibold mb-3 flex items-center justify-between">
            <span>📋 Cálculo Paralelo Obrigatório — Valores estimados (não pagos ainda em 2027)</span>
            <span className="text-[11px] text-sky-800 bg-sky-100 px-2 py-0.5 rounded border border-sky-300 font-bold">
              Base: R$ {baseFaturamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* BOX IBS */}
            <div className="p-4 rounded-xl border-2 border-[#0066CC] bg-white shadow-xs">
              <div className="text-sm font-extrabold text-[#0066CC] mb-1">
                📦 IBS — Imposto sobre Bens e Serviços
              </div>
              <div className="text-xs text-slate-600 mb-2">Substitui ICMS + ISS</div>
              <div id="valorIBS" className="text-2xl font-black text-[#0052A3] my-1">
                R$ {valorIBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-600">
                Alíquota: <span id="aliquotaIBS" className="text-slate-900 font-bold">{aliquotaIBS.toFixed(1)}%</span> • Crédito: <span id="creditoIBS" className="text-emerald-700 font-semibold">R$ {creditoIBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* BOX CBS */}
            <div className="p-4 rounded-xl border-2 border-[#CC3300] bg-white shadow-xs">
              <div className="text-sm font-extrabold text-[#CC3300] mb-1">
                💳 CBS — Contribuição sobre Bens e Serviços
              </div>
              <div className="text-xs text-slate-600 mb-2">Substitui PIS + COFINS</div>
              <div id="valorCBS" className="text-2xl font-black text-[#B32400] my-1">
                R$ {valorCBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-600">
                Alíquota: <span id="aliquotaCBS" className="text-slate-900 font-bold">{aliquotaCBS.toFixed(1)}%</span> • Crédito: <span id="creditoCBS" className="text-emerald-700 font-semibold">R$ {creditoCBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* COMPARATIVO IMPOSTO ATUAL × NOVO */}
          <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-slate-700 border-b border-slate-200 bg-slate-100 font-bold">
                  <th className="p-3 text-left">Imposto Atual</th>
                  <th className="p-3 text-left">Valor Atual</th>
                  <th className="p-3 text-left">Novo Imposto</th>
                  <th className="p-3 text-left">Valor Estimado</th>
                  <th className="p-3 text-left">Variação</th>
                </tr>
              </thead>
              <tbody id="corpoTabelaComparativa" className="divide-y divide-slate-200 text-slate-800">
                <tr>
                  <td className="p-3 font-semibold text-slate-900">ICMS</td>
                  <td id="valorICMS" className="p-3 text-slate-700">R$ {icmsAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td rowSpan={2} className="p-3 font-bold text-[#0066CC] bg-blue-50/80 align-middle">IBS (Substituição)</td>
                  <td rowSpan={2} id="valorIBSLinha" className="p-3 font-extrabold text-[#0052A3] bg-blue-50/80 align-middle">
                    R$ {valorIBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td rowSpan={2} id="variacaoIBS" className="p-3 text-emerald-700 font-bold bg-blue-50/80 align-middle">
                    -15.0% (Crédito Amplo)
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-slate-900">ISS</td>
                  <td id="valorISS" className="p-3 text-slate-700">R$ {issAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold text-slate-900">PIS/COFINS</td>
                  <td id="valorPISCOFINS" className="p-3 text-slate-700">R$ {piscofinsAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 font-bold text-[#CC3300] bg-red-50/80">CBS (Substituição)</td>
                  <td id="valorCBSLinha" className="p-3 font-extrabold text-[#B32400] bg-red-50/80">
                    R$ {valorCBS.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td id="variacaoCBS" className="p-3 text-emerald-700 font-bold bg-red-50/80">
                    -13.4% (Não-Cumulativo Total)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3.5 rounded-xl bg-white border border-slate-300 flex items-center justify-between text-xs text-slate-700 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <span>
              Em 2026, vigoram os tributos tradicionais. O cálculo paralelo de IBS/CBS será acionado automaticamente em <strong>01/01/2027</strong>.
            </span>
          </div>
          <button
            onClick={() => setAnoAtivo(2027)}
            className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-bold cursor-pointer transition shrink-0 ml-2 shadow-xs"
          >
            Visualizar Prévia 2027
          </button>
        </div>
      )}

      {/* 📖 CONTAS CONTÁBEIS — JÁ CRIADAS E DISPONÍVEIS NO PLANO */}
      <div className="mt-4 pt-4 border-t border-slate-300">
        <div className="text-xs sm:text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
          <span>📖</span>
          <span>Contas Contábeis — IBS / CBS (já cadastradas no Plano de Contas)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg border border-blue-300 bg-white shadow-2xs">
            <strong className="text-blue-900">2.1.3.01 — IBS a Recolher</strong>
            <div className="text-[11px] text-slate-600 mt-0.5">Passivo Circulante • Impostos a Pagar</div>
          </div>
          <div className="p-2.5 rounded-lg border border-blue-300 bg-white shadow-2xs">
            <strong className="text-blue-900">1.1.4.01 — IBS Crédito a Compensar</strong>
            <div className="text-[11px] text-slate-600 mt-0.5">Ativo Circulante • Créditos de Impostos</div>
          </div>
          <div className="p-2.5 rounded-lg border border-red-300 bg-white shadow-2xs">
            <strong className="text-red-900">2.1.3.02 — CBS a Recolher</strong>
            <div className="text-[11px] text-slate-600 mt-0.5">Passivo Circulante • Impostos a Pagar</div>
          </div>
          <div className="p-2.5 rounded-lg border border-red-300 bg-white shadow-2xs">
            <strong className="text-red-900">1.1.4.02 — CBS Crédito a Compensar</strong>
            <div className="text-[11px] text-slate-600 mt-0.5">Ativo Circulante • Créditos de Impostos</div>
          </div>
        </div>
      </div>

      {/* 🔄 ATIVAÇÃO AUTOMÁTICA */}
      <div className="mt-4 p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-700 flex items-start gap-2 shadow-2xs">
        <span className="text-sm">🔄</span>
        <div>
          <strong className="text-slate-900">Ativação Automática:</strong> O sistema detecta a data atual do calendário e ativa o cálculo paralelo em 01/01/2027 e o início dos pagamentos em 01/01/2029 — sem necessidade de intervenção manual pelo contador.
        </div>
      </div>
    </div>
  );
};
