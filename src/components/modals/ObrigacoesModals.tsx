import React, { useState } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  DollarSign,
  Download,
  Copy,
  Check,
  Printer,
  ShieldCheck,
  Send,
  Trash2,
  Building2,
  Clock,
  ArrowRight,
  QrCode,
  CreditCard,
  CheckCheck,
} from "lucide-react";
import { LembreteItem, EmpresaDados } from "../../types";

// ==========================================================
// 1. MODAL VISUALIZAR OBRIGAÇÃO (Ação "Ver")
// ==========================================================
interface VisualizarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onApurar?: () => void;
  onGerarGuia?: () => void;
  onPagar?: () => void;
  onTransmitir?: () => void;
  onExcluir?: () => void;
}

export const VisualizarModal: React.FC<VisualizarModalProps> = ({
  item,
  empresa,
  onClose,
  onApurar,
  onGerarGuia,
  onPagar,
  onTransmitir,
  onExcluir,
}) => {
  const [copiado, setCopiado] = useState(false);

  const copiarLinha = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const getStatusBadge = () => {
    const temStatusLocalNaoVerificado = Boolean(item.statusExecucao && item.statusExecucao !== "pendente");
    const classificacaoLocal: Record<string, string> = {
      vencido: "Data cadastrada como vencida",
      hoje: "Data cadastrada para hoje",
      proximo: "Data cadastrada como próxima",
      futuro: "Lembrete cadastrado",
    };
    const rotulo = temStatusLocalNaoVerificado
      ? "Situação não confirmada por fonte oficial"
      : classificacaoLocal[item.tipo] || "Lembrete cadastrado";
    return <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
      <AlertCircle className="w-3.5 h-3.5" /> {rotulo}
    </span>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-slate-100 font-mono">
                {item.origem}
              </span>
              {getStatusBadge()}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {item.nome}
            </h3>
            <p className="text-xs text-slate-300">
              Competência: <strong>{item.competencia || "não informada"}</strong> • Vencimento: <strong>{item.dataVencimento}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Card da Empresa */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
            <div>
              <span className="text-slate-500 font-medium block">Contribuinte / Empresa:</span>
              <strong className="text-slate-900">{empresa.razaoSocial}</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">CNPJ:</span>
              <span className="font-mono text-slate-900 font-semibold">{empresa.cnpj}</span>
            </div>
          </div>

          {/* Dados Fiscais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Valor anotado</span>
              <div className="text-lg font-black text-slate-900">
                {item.valor && item.valor > 0
                  ? `R$ ${item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "Declaratório"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Código de Receita</span>
              <div className="text-sm font-bold text-blue-800 font-mono">
                {item.codigoReceita || "não informado"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 block mb-1">Consulta cadastral</span>
              <div className="text-sm font-bold text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Não consultada
              </div>
            </div>
          </div>

          {/* Detalhes e Observações */}
          <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 text-xs text-slate-700 leading-relaxed space-y-1">
            <strong className="text-blue-900 block font-bold">Informações Operacionais:</strong>
            <p>{item.detalhes || "Nenhuma consulta oficial foi confirmada para este lembrete."}</p>
            {item.chaveAcesso && (
              <p className="font-mono text-[11px] text-slate-600 pt-1">
                Identificador Único: <strong>{item.chaveAcesso}</strong>
              </p>
            )}
            {item.protocolo && (
              <p className="font-mono text-[11px] text-emerald-700 font-bold pt-1">
                Protocolo informado (não confirmado): {item.protocolo}
              </p>
            )}
          </div>

          {/* Linha Digitável se existir */}
          {item.linhaDigitavel && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Linha digitável informada (não validada):</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value="Não verificada; código oculto para evitar pagamento incorreto"
                  className="w-full font-mono text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none"
                />
                <button
                  disabled
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-not-allowed border border-slate-300 opacity-50"
                >
                  {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiado ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Ação Interativos */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {onExcluir && (
            <button
              onClick={onExcluir}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-3 py-2 rounded-lg transition flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir Lembrete</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              Fechar
            </button>

            {onApurar && (
              <button
                onClick={onApurar}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>📊 Apurar Imposto</span>
              </button>
            )}

            {onGerarGuia && (
              <button
                onClick={onGerarGuia}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileText className="w-4 h-4" />
                <span>Gerar Guia / DARF</span>
              </button>
            )}

            {onPagar && (
              <button
                onClick={onPagar}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pagar Agora</span>
              </button>
            )}

            {onTransmitir && (
              <button
                onClick={onTransmitir}
                className="px-4 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>Transmitir / Enviar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 2. MODAL APURAR TRIBUTO (prévia matemática manual)
// ==========================================================
interface ApurarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;

}

export const ApurarModal: React.FC<ApurarModalProps> = ({ item, empresa, onClose }) => {
  const [faturamento, setFaturamento] = useState(0);
  const [aliquota, setAliquota] = useState(0);
  const [creditos, setCreditos] = useState(0);
  const [calculado, setCalculado] = useState(false);
  const debito = faturamento * aliquota / 100;
  const resultado = Math.max(0, debito - creditos);

  return <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
      <div className="bg-amber-800 text-white p-5 flex items-center justify-between">
        <div><span className="text-xs font-semibold">Prévia matemática manual</span><h3 className="text-lg font-bold mt-1">{item.nome}</h3>
          <p className="text-xs text-amber-100">Competência: {item.competencia || "não informada"} · Regime cadastrado: {empresa.regime || "não informado"}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 space-y-4 text-xs">
        <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
          Esta conta usa apenas os números digitados. Não consulta notas, regras fiscais nem créditos oficiais, não apura tributo e não libera guia.
        </div>
        <label className="block font-bold text-slate-700">Base informada (R$)
          <input type="number" min="0" value={faturamento} onChange={e => { setFaturamento(Number(e.target.value) || 0); setCalculado(false); }} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-bold text-slate-700">Alíquota informada (%)
            <input type="number" min="0" value={aliquota} onChange={e => { setAliquota(Number(e.target.value) || 0); setCalculado(false); }} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono" />
          </label>
          <label className="block font-bold text-slate-700">Créditos informados (R$)
            <input type="number" min="0" value={creditos} onChange={e => { setCreditos(Number(e.target.value) || 0); setCalculado(false); }} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono" />
          </label>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex justify-between"><span>Resultado matemático</span><strong>R$ {resultado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div>
          {calculado && <p className="mt-2 font-semibold text-amber-900">Prévia calculada; não é apuração validada e não altera os registros.</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-700">Fechar</button>
        <button type="button" onClick={() => setCalculado(true)} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white">Calcular prévia</button>
      </div>
    </div>
  </div>;
};

// ==========================================================
// 3. MODAL RESUMO DE OBRIGAÇÃO (não gera guia oficial)
// ==========================================================
interface GerarGuiaModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onPagar?: () => void;
}

export const GerarGuiaModal: React.FC<GerarGuiaModalProps> = ({ item, empresa, onClose }) => {
  const valorValido = Number.isFinite(item.valor) && item.valor > 0;
  return <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-blue-900 p-5 text-white">
        <div><h3 className="text-base font-bold">Resumo do lembrete — não é guia oficial</h3><p className="text-xs text-blue-200">{item.nome}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-4 p-6 text-xs">
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <strong>Não use esta tela para pagar tributos.</strong> A emissão de DARF/GPS, linha digitável, código de barras e PIX não está integrada nem validada por órgão oficial.
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div><dt className="text-slate-500">Empresa</dt><dd className="font-bold">{empresa.razaoSocial || "não informada"}</dd></div>
          <div><dt className="text-slate-500">CNPJ</dt><dd className="font-mono">{empresa.cnpj || "não informado"}</dd></div>
          <div><dt className="text-slate-500">Competência anotada</dt><dd>{item.competencia || "não informada"}</dd></div>
          <div><dt className="text-slate-500">Vencimento anotado</dt><dd>{item.dataVencimento || "não informado"}</dd></div>
          <div><dt className="text-slate-500">Código de receita anotado</dt><dd>{item.codigoReceita || "não informado"}</dd></div>
          <div><dt className="text-slate-500">Valor anotado</dt><dd>{valorValido ? "R$ " + item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "não calculado"}</dd></div>
        </dl>
        {item.linhaDigitavel && <p className="rounded-lg border border-slate-200 p-3 text-slate-700">Há uma linha digitável anotada no cadastro, mas ela não foi validada. Por segurança, não será apresentada como código de pagamento.</p>}
      </div>
      <div className="flex justify-end border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Fechar</button></div>
    </div>
  </div>;
};

// ==========================================================
// 4. MODAL PREPARAR OBRIGAÇÃO (ECD / SPED indisponível)
// ==========================================================
interface PrepararModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirPreparacao: () => void;
}

export const PrepararModal: React.FC<PrepararModalProps> = ({ item, empresa, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-indigo-900 p-5 text-white">
        <div><h3 className="text-base font-bold">Preparação SPED indisponível</h3><p className="text-xs text-indigo-200">{item.nome} · {empresa.razaoSocial || "empresa não informada"}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><strong>Nenhum arquivo ou validação foi produzido.</strong><p className="mt-2">A geração de ECD/SPED e a validação pelo PVA não estão integradas. Não há blocos, hash ou arquivo pronto para transmissão.</p></div>
        <p className="text-xs text-slate-600">Competência: {item.competencia || "não informada"}. A integração depende de dados contábeis persistidos, leiaute oficial e execução/validação no PVA.</p>
      </div>
      <div className="flex justify-end border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Fechar</button></div>
    </div>
  </div>
);

// ==========================================================
// 5. MODAL TRANSMITIR / ENVIAR (integração oficial indisponível)
// ==========================================================
interface TransmitirModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirTransmissao: (protocolo: string) => void;
}

export const TransmitirModal: React.FC<TransmitirModalProps> = ({ item, empresa, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-blue-900 p-5 text-white">
        <div><h3 className="text-base font-bold">Transmissão oficial indisponível</h3><p className="text-xs text-blue-200">{item.nome}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><strong>Nenhum evento foi assinado ou enviado.</strong><p className="mt-2">A integração com o órgão, uso do certificado e obtenção de recibo oficial não estão configurados. Nenhum protocolo foi criado.</p></div>
        <p className="text-xs text-slate-600">Empresa: {empresa.razaoSocial || "não informada"} · CNPJ: {empresa.cnpj || "não informado"} · Competência: {item.competencia || "não informada"}</p>
      </div>
      <div className="flex justify-end border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Fechar</button></div>
    </div>
  </div>
);

// ==========================================================
// 6. MODAL PAGAR GUIA (pagamento bancário indisponível)
// ==========================================================
interface PagarModalProps {
  item: LembreteItem;
  empresa: EmpresaDados;
  onClose: () => void;
  onConcluirPagamento: () => void;
}

export const PagarModal: React.FC<PagarModalProps> = ({ item, empresa, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-emerald-900 p-5 text-white">
        <div><h3 className="text-base font-bold">Pagamento indisponível</h3><p className="text-xs text-emerald-200">{item.nome}</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><strong>Nenhum pagamento foi iniciado ou confirmado.</strong><p className="mt-2">O sistema não tem integração bancária nem consulta de confirmação de pagamentos. Não há autenticação bancária ou status de quitação.</p></div>
        <p className="text-xs text-slate-600">Empresa: {empresa.razaoSocial || "não informada"} · Valor anotado: {Number.isFinite(item.valor) && item.valor > 0 ? "R$ " + item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "não calculado"}</p>
      </div>
      <div className="flex justify-end border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white">Fechar</button></div>
    </div>
  </div>
);

// ==========================================================
// 7. MODAL CONFIRMAR EXCLUSÃO (Lixeira)
// ==========================================================
interface ExcluirModalProps {
  item: LembreteItem;
  onClose: () => void;
  onConfirmar: () => void;
}

export const ExcluirModal: React.FC<ExcluirModalProps> = ({
  item,
  onClose,
  onConfirmar,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 p-6 text-xs space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-slate-900">Excluir Lembrete Fiscal?</h3>
          <p className="text-slate-600">
            Tem certeza que deseja remover este lembrete da sua agenda de obrigações?
          </p>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-900 font-medium">
          <strong>{item.nome}</strong>
          <div className="text-[11px] text-rose-700 mt-0.5">{item.data}</div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sim, Excluir</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Ícone auxiliar
function CpuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" />
      <path d="M15 20v2" />
      <path d="M2 15h2" />
      <path d="M2 9h2" />
      <path d="M20 15h2" />
      <path d="M20 9h2" />
      <path d="M9 2v2" />
      <path d="M9 20v2" />
    </svg>
  );
}
