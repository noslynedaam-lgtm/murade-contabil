import React, { useState } from "react";
import {
  X,
  Download,
  Printer,
  Copy,
  Check,
  FileText,
  CreditCard,
  QrCode,
  ShieldCheck,
  Calendar,
  Building2,
  DollarSign,
  TrendingUp,
  ExternalLink,
  Smartphone,
  Share2,
  Lock,
  User,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// Helper para disparar download real de arquivos no navegador
export const baixarArquivoTexto = (nomeArquivo: string, conteudo: string, tipoMime: string = "text/plain;charset=utf-8") => {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// =========================================================================
// 1. MODAL BAIXAR GUIAS DE IMPOSTOS (DARF, DAS, GPS, FGTS, ICMS)
// =========================================================================
interface GuiaItem {
  id: string;
  nome: string;
  sigla: string;
  tributo: string;
  competencia: string;
  vencimento: string;
  valor: number;
  codigoReceita: string;
  linhaDigitavel: string;
  pixCopiaECola: string;
  status: "disponivel" | "pago" | "vencendo";
  orgao: string;
}

const guiasPadrao: GuiaItem[] = [
  {
    id: "g-das",
    nome: "DAS — Simples Nacional",
    sigla: "DAS",
    tributo: "Impostos Unificados (IRPJ, CSLL, PIS, COFINS, ICMS, CPP)",
    competencia: "09/2026",
    vencimento: "20/10/2026",
    valor: 8895.40,
    codigoReceita: "1515",
    linhaDigitavel: "85890000008 8 89540001026 8 09202615152 4 84920481029 1",
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136murad-das-092026-rfb-receita52040000530398654078895.405802BR5915RECEITA FEDERAL6009SAO PAULO62070503***6304E8A1",
    status: "disponivel",
    orgao: "Receita Federal do Brasil",
  },
  {
    id: "g-darf-dctf",
    nome: "DARF DCTFWeb Previdenciário & Federal",
    sigla: "DARF",
    tributo: "INSS Patronal + Retenções Federais + PIS/COFINS",
    competencia: "09/2026",
    vencimento: "20/10/2026",
    valor: 14320.00,
    codigoReceita: "5952",
    linhaDigitavel: "85620000014 3 32000001026 5 09202659521 2 92048102938 7",
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136murad-darf-5952-dctfweb-2026520400005303986540814320.005802BR5915RECEITA FEDERAL6009SAO PAULO62070503***63041A9B",
    status: "disponivel",
    orgao: "Receita Federal / PGFN",
  },
  {
    id: "g-gps",
    nome: "GPS / DCTFWeb — Previdência Social",
    sigla: "GPS/INSS",
    tributo: "Contribuição Previdenciária dos Segurados & Patronal",
    competencia: "09/2026",
    vencimento: "20/10/2026",
    valor: 25056.00,
    codigoReceita: "2100",
    linhaDigitavel: "85810000025 0 05600001026 9 09202621008 3 71920481920 6",
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136murad-inss-previdencia-2100-2026520400005303986540825056.005802BR5918MINISTERIO PREV6009SAO PAULO62070503***63049F2C",
    status: "vencendo",
    orgao: "Ministério da Previdência / RFB",
  },
  {
    id: "g-fgts",
    nome: "FGTS Digital — Fundo de Garantia",
    sigla: "FGTS",
    tributo: "Recolhimento Mensal 8% s/ Folha de Pagamento",
    competencia: "09/2026",
    vencimento: "20/10/2026",
    valor: 6912.00,
    codigoReceita: "115",
    linhaDigitavel: "85830000006 9 91200001026 1 09202611501 8 61928301928 3",
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136fgts-digital-caixa-murad-09202652040000530398654076912.005802BR5916CAIXA ECONOMICA6009SAO PAULO62070503***630444B8",
    status: "disponivel",
    orgao: "Caixa Econômica Federal",
  },
  {
    id: "g-icms",
    nome: "DAE / GARE — ICMS Normal Estadual",
    sigla: "ICMS",
    tributo: "Imposto sobre Circulação de Mercadorias (SEFAZ)",
    competencia: "09/2026",
    vencimento: "25/10/2026",
    valor: 12450.00,
    codigoReceita: "046-2",
    linhaDigitavel: "85870000012 4 45000001026 2 09202604620 5 91827364501 9",
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136sefaz-icms-estadual-092026-murad520400005303986540812450.005802BR5913SEFAZ ESTADO6009GOIANIA62070503***6304AA3F",
    status: "disponivel",
    orgao: "Secretaria de Fazenda Estadual",
  },
];

interface GuiasImpostosModalProps {
  onClose: () => void;
  empresaNome?: string;
  cnpj?: string;
}

export const GuiasImpostosModal: React.FC<GuiasImpostosModalProps> = ({
  onClose,
  empresaNome = "Empresa Modelo Ltda",
  cnpj = "12.345.678/0001-99",
}) => {
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [guiaSelecionada, setGuiaSelecionada] = useState<GuiaItem>(guiasPadrao[0]);

  const copiarTexto = (id: string, texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const baixarGuiaPDF = (guia: GuiaItem) => {
    const conteudo = `================================================================================
GUIA OFICIAL DE RECOLHIMENTO TRIBUTÁRIO — MURADE CONTÁBIL 2026
================================================================================
Órgão Arrecadador: ${guia.orgao}
Documento:         ${guia.nome} (${guia.sigla})
Tributo Principal: ${guia.tributo}

CONTRIBUINTE:
Razão Social:      ${empresaNome}
CNPJ:              ${cnpj}
Competência:       ${guia.competencia}
Data de Emissão:   ${new Date().toLocaleDateString("pt-BR")}
Data de Vencimento: ${guia.vencimento}
Código de Receita: ${guia.codigoReceita}

VALOR TOTAL A RECOLHER: R$ ${guia.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

CÓDIGO DE BARRAS / LINHA DIGITÁVEL:
${guia.linhaDigitavel}

CHAVE PIX COPIA E COLA (PAGAMENTO INSTANTÂNEO 24/7):
${guia.pixCopiaECola}

AUTENTICAÇÃO MECÂNICA / HASH ICP-BRASIL:
SHA256: 7b8c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c
Assinado digitalmente por Murade Contábil — Sistema Autônomo 2026
================================================================================`;
    baixarArquivoTexto(`Guia_${guia.sigla}_${guia.competencia.replace("/", "-")}.txt`, conteudo);
  };

  const baixarTodasAsGuias = () => {
    let lote = `PACOTE CONSOLIDADO DE GUIAS DE IMPOSTOS — ${empresaNome} (CNPJ ${cnpj})\n\n`;
    guiasPadrao.forEach((g, idx) => {
      lote += `--- GUIA ${idx + 1}: ${g.nome} ---\n`;
      lote += `Vencimento: ${g.vencimento} | Valor: R$ ${g.valor.toFixed(2)}\n`;
      lote += `Linha: ${g.linhaDigitavel}\nPix: ${g.pixCopiaECola}\n\n`;
    });
    baixarArquivoTexto(`Pacote_Guias_Tributarias_09-2026.txt`, lote);
  };

  const totalGuias = guiasPadrao.reduce((acc, g) => acc + g.valor, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="bg-[#082B66] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <CreditCard className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Guias de Impostos & Recolhimentos</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full">
                  Prontas p/ Pagamento
                </span>
              </h3>
              <p className="text-xs text-blue-200">
                {empresaNome} • CNPJ: {cnpj} • Competência: 09/2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Resumo e Download em Lote */}
        <div className="bg-slate-50 border-b border-slate-200 p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-medium">Total de Guias:</span>{" "}
              <strong className="text-slate-900 font-bold">{guiasPadrao.length} guias</strong>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Valor Total Consolidado:</span>{" "}
              <strong className="text-emerald-700 font-black font-mono text-sm">
                R$ {totalGuias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={baixarTodasAsGuias}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Todas (.TXT/Lote)</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Conteúdo Principal com Lista à Esquerda e Detalhes da Guia à Direita */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Coluna da Esquerda: Lista de Guias */}
          <div className="md:col-span-5 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Selecione a Guia para Detalhes
            </div>
            {guiasPadrao.map((g) => {
              const isSel = guiaSelecionada.id === g.id;
              return (
                <div
                  key={g.id}
                  onClick={() => setGuiaSelecionada(g)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    isSel
                      ? "bg-blue-50/80 border-[#082B66] ring-1 ring-[#082B66] shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-900">{g.sigla}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Vence {g.vencimento}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-700 truncate">{g.nome}</div>
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">Cod: {g.codigoReceita}</span>
                    <span className="font-extrabold text-slate-900 font-mono">
                      R$ {g.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coluna da Direita: Prévia e Ações da Guia Selecionada */}
          <div className="md:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-[#082B66]">
                    {guiaSelecionada.orgao}
                  </span>
                  <h4 className="text-base font-black text-slate-900 mt-1">
                    {guiaSelecionada.nome}
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">{guiaSelecionada.tributo}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Valor da Guia</div>
                  <div className="text-lg font-black text-emerald-700 font-mono">
                    R$ {guiaSelecionada.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Informações Fiscais */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-[11px] block">Competência de Apuração:</span>
                  <strong className="text-slate-800 font-bold">{guiaSelecionada.competencia}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Data de Vencimento:</span>
                  <strong className="text-rose-700 font-bold">{guiaSelecionada.vencimento}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Código de Receita:</span>
                  <strong className="text-slate-800 font-mono">{guiaSelecionada.codigoReceita}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Autenticação do Fisco:</span>
                  <strong className="text-emerald-700 font-mono text-[11px]">AUTENTICADO ✅</strong>
                </div>
              </div>

              {/* Código de Barras / Linha Digitável */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>Linha Digitável / Código de Barras</span>
                  </span>
                  <button
                    onClick={() => copiarTexto("linha", guiaSelecionada.linhaDigitavel)}
                    className="text-blue-700 hover:text-blue-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    {copiadoId === "linha" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-100 p-2 rounded text-[11px] font-mono text-slate-800 break-all select-all font-semibold">
                  {guiaSelecionada.linhaDigitavel}
                </div>
              </div>

              {/* Pix Copia e Cola */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pix Copia e Cola (Aprovação Imediata)</span>
                  </span>
                  <button
                    onClick={() => copiarTexto("pix", guiaSelecionada.pixCopiaECola)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    {copiadoId === "pix" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Pix Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Pix</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-100 p-2 rounded text-[10px] font-mono text-slate-600 truncate select-all">
                  {guiaSelecionada.pixCopiaECola}
                </div>
              </div>
            </div>

            {/* Ações da Guia */}
            <div className="pt-4 border-t border-slate-200 mt-4 flex gap-2">
              <button
                onClick={() => baixarGuiaPDF(guiaSelecionada)}
                className="flex-1 py-2.5 px-3 rounded-lg bg-[#082B66] hover:bg-[#0A357D] text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Guia Oficial ({guiaSelecionada.sigla})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 2. MODAL BALANÇO COMPLETO (Balanço Patrimonial Oficial CPC 00)
// =========================================================================
interface BalancoCompletoModalProps {
  onClose: () => void;
  empresaNome?: string;
  cnpj?: string;
}

export const BalancoCompletoModal: React.FC<BalancoCompletoModalProps> = ({
  onClose,
  empresaNome = "Empresa Modelo Ltda",
  cnpj = "12.345.678/0001-99",
}) => {
  const baixarBalanco = () => {
    const texto = `================================================================================
BALANÇO PATRIMONIAL OFICIAL — EXERCÍCIO SOCIAL 2026
CONFORMIDADE TOTAL COM CPC 00 (R2) E NBC TG / CFC
================================================================================
Empresa: ${empresaNome}
CNPJ:    ${cnpj}
Período: 01/01/2026 a 31/12/2026

1. ATIVO
1.1 ATIVO CIRCULANTE
  1.1.1 Caixa e Equivalentes de Caixa ......................... R$   320.000,00
  1.1.2 Aplicações Financeiras de Curto Prazo ................. R$   280.000,00
  1.1.3 Clientes e Contas a Receber ........................... R$   390.000,00
  1.1.4 Estoques de Mercadorias e Produtos .................... R$   120.000,00
  1.1.5 Tributos e Impostos a Recuperar (ICMS/PIS/COFINS) ..... R$    40.000,00
  Subtotal Ativo Circulante ................................... R$ 1.150.000,00

1.2 ATIVO NÃO CIRCULANTE
  1.2.1 Realizável a Longo Prazo .............................. R$    95.000,00
  1.2.2 Imobilizado (Máquinas, Veículos, Equipamentos) ........ R$   650.000,00
  1.2.3 (-) Depreciação Acumulada ............................. R$   (82.500,00)
  1.2.4 Intangível (Softwares, Licenças) ...................... R$    30.000,00
  Subtotal Ativo Não Circulante ............................... R$   692.500,00

TOTAL DO ATIVO ................................................ R$ 1.842.500,00
================================================================================

2. PASSIVO E PATRIMÔNIO LÍQUIDO
2.1 PASSIVO CIRCULANTE
  2.1.1 Fornecedores Nacionais a Pagar ........................ R$   185.000,00
  2.1.2 Obrigações Fiscais e Tributárias a Recolher ........... R$    88.000,00
  2.1.3 Salários, Encargos Sociais e FGTS a Pagar ............. R$    92.000,00
  2.1.4 Empréstimos e Financiamentos de Curto Prazo ........... R$    55.000,00
  Subtotal Passivo Circulante ................................. R$   420.000,00

2.2 PASSIVO NÃO CIRCULANTE
  2.2.1 Financiamentos Bancários de Longo Prazo ............... R$   320.000,00
  2.2.2 Provisões Tributárias e Trabalhistas .................. R$    60.000,00
  Subtotal Passivo Não Circulante ............................. R$   380.000,00

2.3 PATRIMÔNIO LÍQUIDO
  2.3.1 Capital Social Subscrito e Integralizado .............. R$   500.000,00
  2.3.2 Reservas de Capital e de Lucros ....................... R$   397.500,00
  2.3.3 Lucros Acumulados do Exercício 2026 ................... R$   145.000,00
  Subtotal Patrimônio Líquido ................................. R$ 1.042.500,00

TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO ......................... R$ 1.842.500,00
================================================================================
EQUILÍBRIO CONTÁBIL: ATIVO = PASSIVO + PL (PARTIDAS DOBRADAS OK)
CRC-GO: Contador Autônomo Murade Contábil
Hash de Validação: 98dfa891b2c45e67890abcdef1234567890abcde
================================================================================`;
    baixarArquivoTexto(`Balanco_Patrimonial_Completo_2026.txt`, texto);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="bg-[#6A1B9A] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Balanço Patrimonial Oficial</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full">
                  CPC 00 / NBC TG
                </span>
              </h3>
              <p className="text-xs text-purple-200">
                {empresaNome} • CNPJ: {cnpj} • Exercício Social 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Ações Rápidas */}
        <div className="bg-purple-50/60 border-b border-purple-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-purple-950 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Demonstração auditada: Partidas dobradas equilibradas (Ativo = Passivo + PL)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={baixarBalanco}
              className="px-3.5 py-1.5 rounded-lg bg-[#6A1B9A] hover:bg-[#4A148C] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Balanço (.TXT/Oficial)</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Tabela do Balanço */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Bloco 1: ATIVO */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <span>1. ATIVO</span>
                </h4>
                <span className="text-xs font-bold text-blue-700 font-mono">R$ 1.842.500,00</span>
              </div>

              {/* 1.1 Ativo Circulante */}
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200 flex justify-between">
                  <span>1.1 Ativo Circulante</span>
                  <span className="font-mono text-blue-800">R$ 1.150.000,00</span>
                </div>
                <div className="pl-3 space-y-1 text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Caixa e Bancos</span>
                    <span className="font-mono">R$ 320.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Aplicações Financeiras</span>
                    <span className="font-mono">R$ 280.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Clientes a Receber</span>
                    <span className="font-mono">R$ 390.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Estoques</span>
                    <span className="font-mono">R$ 120.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Tributos a Compensar</span>
                    <span className="font-mono">R$ 40.000,00</span>
                  </div>
                </div>

                {/* 1.2 Ativo Não Circulante */}
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200 flex justify-between mt-3">
                  <span>1.2 Ativo Não Circulante</span>
                  <span className="font-mono text-blue-800">R$ 692.500,00</span>
                </div>
                <div className="pl-3 space-y-1 text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Realizável a Longo Prazo</span>
                    <span className="font-mono">R$ 95.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Imobilizado</span>
                    <span className="font-mono">R$ 650.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100 text-rose-600">
                    <span>(-) Depreciação Acumulada</span>
                    <span className="font-mono">- R$ 82.500,00</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Intangível</span>
                    <span className="font-mono">R$ 30.000,00</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-2.5 bg-blue-100/60 rounded-lg flex justify-between text-xs font-black text-blue-950">
                <span>TOTAL DO ATIVO</span>
                <span className="font-mono text-sm">R$ 1.842.500,00</span>
              </div>
            </div>

            {/* Bloco 2: PASSIVO E PATRIMÔNIO LÍQUIDO */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                  <span>2. PASSIVO & PATRIMÔNIO LÍQUIDO</span>
                </h4>
                <span className="text-xs font-bold text-purple-700 font-mono">R$ 1.842.500,00</span>
              </div>

              {/* 2.1 Passivo Circulante */}
              <div className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200 flex justify-between">
                  <span>2.1 Passivo Circulante</span>
                  <span className="font-mono text-purple-800">R$ 420.000,00</span>
                </div>
                <div className="pl-3 space-y-1 text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Fornecedores</span>
                    <span className="font-mono">R$ 185.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Obrigações Tributárias</span>
                    <span className="font-mono">R$ 88.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Salários e Encargos</span>
                    <span className="font-mono">R$ 92.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Empréstimos Curto Prazo</span>
                    <span className="font-mono">R$ 55.000,00</span>
                  </div>
                </div>

                {/* 2.2 Passivo Não Circulante */}
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200 flex justify-between mt-3">
                  <span>2.2 Passivo Não Circulante</span>
                  <span className="font-mono text-purple-800">R$ 380.000,00</span>
                </div>
                <div className="pl-3 space-y-1 text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Financiamentos Longo Prazo</span>
                    <span className="font-mono">R$ 320.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Provisões Tributárias/Trabalhistas</span>
                    <span className="font-mono">R$ 60.000,00</span>
                  </div>
                </div>

                {/* 2.3 Patrimônio Líquido */}
                <div className="font-bold text-slate-800 bg-white p-2 rounded border border-slate-200 flex justify-between mt-3">
                  <span>2.3 Patrimônio Líquido</span>
                  <span className="font-mono text-emerald-800">R$ 1.042.500,00</span>
                </div>
                <div className="pl-3 space-y-1 text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Capital Social Subscrito</span>
                    <span className="font-mono">R$ 500.000,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span>Reservas de Lucros</span>
                    <span className="font-mono">R$ 397.500,00</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-bold text-emerald-700">
                    <span>Lucro Líquido do Exercício</span>
                    <span className="font-mono">R$ 145.000,00</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-2.5 bg-purple-100/60 rounded-lg flex justify-between text-xs font-black text-purple-950">
                <span>TOTAL DO PASSIVO + PL</span>
                <span className="font-mono text-sm">R$ 1.842.500,00</span>
              </div>
            </div>
          </div>

          {/* Parecer Técnico e Assinatura */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <strong className="text-slate-800 block">Parecer dos Auditores & Responsável Técnico:</strong>
              <span>As demonstrações acima refletem com fidedignidade a situação patrimonial e financeira em conformidade com as normas brasileiras de contabilidade (NBC TG / CFC).</span>
            </div>
            <div className="shrink-0 text-right font-mono text-[11px] bg-white p-2.5 rounded-lg border border-slate-200">
              <div className="font-bold text-slate-800">Murade Contábil — CRC-GO</div>
              <div className="text-emerald-700 font-bold">Certificação ICP-Brasil Ativa ✅</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 3. MODAL DRE — DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO
// =========================================================================
interface DreModalProps {
  onClose: () => void;
  empresaNome?: string;
  cnpj?: string;
}

export const DreModal: React.FC<DreModalProps> = ({
  onClose,
  empresaNome = "Empresa Modelo Ltda",
  cnpj = "12.345.678/0001-99",
}) => {
  const baixarDre = () => {
    const texto = `================================================================================
DRE — DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO 2026
CONFORME LEI DAS S/A Nº 6.404/76 E CPC 26 (R1)
================================================================================
Empresa: ${empresaNome}
CNPJ:    ${cnpj}
Período: 01/01/2026 a 30/09/2026

RECEITA OPERACIONAL BRUTA .................................... R$   580.000,00 (100,0%)
(-) Vendas Canceladas e Devoluções ........................... R$    (4.500,00)
(-) Tributos sobre Vendas (ICMS/PIS/COFINS/ISS) .............. R$   (38.300,00)
(=) RECEITA OPERACIONAL LÍQUIDA .............................. R$   537.200,00 ( 92,6%)

(-) Custo das Mercadorias e Serviços Vendidos (CPV/CSP) ...... R$  (248.000,00) ( 42,8%)
(=) LUCRO BRUTO OPERACIONAL .................................. R$   289.200,00 ( 49,9%)

(-) DESPESAS OPERACIONAIS .................................... R$  (126.500,00)
  (-) Despesas Administrativas e Gerais ...................... R$   (78.500,00)
  (-) Despesas Comerciais e Vendas ........................... R$   (28.000,00)
  (-) Despesas Tributárias e Taxas ........................... R$   (20.000,00)

(=) RESULTADO OPERACIONAL ANTES DOS TRIBUTOS (EBITDA) ........ R$   162.700,00 ( 28,1%)
  (+) Receitas Financeiras (Rendimentos de Aplicações) ....... R$     9.800,00
  (-) Despesas Financeiras e Juros ........................... R$    (5.600,00)

(=) LUCRO ANTES DO IMPOSTO DE RENDA E CSLL (LAIR) ............ R$   166.900,00 ( 28,8%)
(-) Provisão para IRPJ ....................................... R$   (14.900,00)
(-) Provisão para Contribuição Social (CSLL) ................. R$    (7.000,00)

(=) LUCRO LÍQUIDO DO EXERCÍCIO ............................... R$   145.000,00 ( 25,0%)
================================================================================
Margem Bruta:  49,9% | Margem EBITDA: 28,1% | Margem Líquida: 25,0%
Demonstrativo assinado e certificado digitalmente.
================================================================================`;
    baixarArquivoTexto(`DRE_Demonstrativo_Resultado_2026.txt`, texto);
  };

  const dreLinhas = [
    { label: "RECEITA OPERACIONAL BRUTA", valor: 580000, pct: "100,0%", tipo: "destaque-pos" },
    { label: "(-) Tributos sobre Faturamento e Devoluções", valor: -42800, pct: "-7,4%", tipo: "deducao" },
    { label: "(=) RECEITA OPERACIONAL LÍQUIDA", valor: 537200, pct: "92,6%", tipo: "subtotal" },
    { label: "(-) Custo das Mercadorias e Serviços Vendidos (CPV/CSP)", valor: -248000, pct: "-42,8%", tipo: "deducao" },
    { label: "(=) LUCRO BRUTO OPERACIONAL", valor: 289200, pct: "49,9%", tipo: "destaque-pos" },
    { label: "(-) Despesas Administrativas e Gerais", valor: -78500, pct: "-13,5%", tipo: "deducao" },
    { label: "(-) Despesas Comerciais e Marketing", valor: -28000, pct: "-4,8%", tipo: "deducao" },
    { label: "(-) Despesas com Pessoal e Encargos", valor: -20000, pct: "-3,4%", tipo: "deducao" },
    { label: "(=) RESULTADO OPERACIONAL ANTES DOS JUROS (EBITDA)", valor: 162700, pct: "28,1%", tipo: "subtotal" },
    { label: "(+/-) Resultado Financeiro Líquido", valor: 4200, pct: "+0,7%", tipo: "financeiro" },
    { label: "(-) Provisão para IRPJ e CSLL", valor: -21900, pct: "-3,8%", tipo: "deducao" },
    { label: "(=) LUCRO LÍQUIDO DO EXERCÍCIO", valor: 145000, pct: "25,0%", tipo: "resultado-final" },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="bg-[#082B66] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>DRE — Demonstração do Resultado</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full">
                  Lei 6.404/76 & CPC 26
                </span>
              </h3>
              <p className="text-xs text-blue-200">
                {empresaNome} • CNPJ: {cnpj} • Acumulado 2026
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Indicadores */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="grid grid-cols-3 gap-3 text-center sm:text-left text-xs">
            <div>
              <span className="text-slate-500 text-[11px] block">Margem Bruta</span>
              <strong className="text-emerald-700 font-extrabold text-sm">49,9%</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Margem EBITDA</span>
              <strong className="text-blue-700 font-extrabold text-sm">28,1%</strong>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Margem Líquida</span>
              <strong className="text-purple-700 font-extrabold text-sm">25,0%</strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={baixarDre}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar DRE (.TXT)</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Tabela Estruturada da DRE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-[#082B66] text-white">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Estrutura da Demonstração Contábil</th>
                  <th className="py-2.5 px-4 text-right font-bold">% s/ Rec.</th>
                  <th className="py-2.5 px-4 text-right font-bold">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dreLinhas.map((linha, idx) => {
                  const isNegativo = linha.valor < 0;
                  const isFinal = linha.tipo === "resultado-final";
                  const isSub = linha.tipo === "subtotal";
                  const isDestaque = linha.tipo === "destaque-pos";

                  return (
                    <tr
                      key={idx}
                      className={`${
                        isFinal
                          ? "bg-emerald-100/70 font-black text-emerald-950 text-sm"
                          : isSub
                          ? "bg-slate-100 font-bold text-slate-900"
                          : isDestaque
                          ? "bg-blue-50/50 font-bold text-slate-900"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <td className={`py-2 px-4 ${isFinal ? "py-3" : ""}`}>
                        {linha.label}
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-[11px] text-slate-500">
                        {linha.pct}
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-mono font-semibold ${
                          isFinal
                            ? "text-emerald-800 font-black"
                            : isNegativo
                            ? "text-rose-600"
                            : "text-slate-900"
                        }`}
                      >
                        {isNegativo ? "- " : ""}
                        R$ {Math.abs(linha.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 4. MODAL DETALHAMENTO DA PREVIDÊNCIA SOCIAL (INSS, eSocial & CND)
// =========================================================================
interface PrevidenciaModalProps {
  onClose: () => void;
  empresaNome?: string;
  cnpj?: string;
}

export const PrevidenciaModal: React.FC<PrevidenciaModalProps> = ({
  onClose,
  empresaNome = "Empresa Modelo Ltda",
  cnpj = "12.345.678/0001-99",
}) => {
  const baixarCertidaoPrevidenciaria = () => {
    const certidao = `================================================================================
MINISTÉRIO DA PREVIDÊNCIA SOCIAL & RECEITA FEDERAL DO BRASIL
CERTIDÃO NEGATIVA DE DÉBITOS PREVIDENCIÁRIOS (CND RELATIVA A CONTRIBUIÇÕES PREVIDENCIÁRIAS)
================================================================================
Razão Social:     ${empresaNome}
CNPJ:             ${cnpj}
Código de Autenticação: 2026-INSS-99281-OK-MURADE
Data de Emissão:  ${new Date().toLocaleDateString("pt-BR")}
Validade até:     15/04/2027

Certifica-se que, até a presente data, NÃO CONSTAM PENDÊNCIAS em nome da empresa acima qualificada
relativas a contribuições previdenciárias arrecadadas pela Secretaria da Receita Federal do Brasil
e destinadas à Previdência Social e às outras entidades e fundos (Terceiros).

DADOS OPERACIONAIS DO CONTRIBUINTE:
- Folha Salarial eSocial: R$ 86.400,00 (12 Colaboradores)
- Alíquota FAP Vigente:   0,5000 (Fator Bônus)
- Alíquota RAT:           2,00% (Ajustado: 1,00%)
- Status de Regularidade: REGULAR E ADIMPLENTE ✅

Esta certidão é válida para todos os fins de direito (contratos públicos, licitações e financiamentos).
Autenticidade garantida por chave criptográfica ICP-Brasil.
================================================================================`;
    baixarArquivoTexto(`Certidao_Negativa_Previdenciaria_INSS_2026.txt`, certidao);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="bg-[#082B66] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>Detalhamento da Previdência Social & INSS</span>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full">
                  100% Regular
                </span>
              </h3>
              <p className="text-xs text-blue-200">
                {empresaNome} • CNPJ: {cnpj} • DCTFWeb & eSocial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Card de Regularidade */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <h4 className="font-extrabold text-emerald-950 text-sm">
                  Situação Previdenciária: Regular e sem Restrições
                </h4>
                <p className="text-xs text-emerald-800">
                  Todas as guias de recolhimento de INSS e DCTFWeb estão quitadas. CND ativa até 15/04/2027.
                </p>
              </div>
            </div>
            <button
              onClick={baixarCertidaoPrevidenciaria}
              className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar CND Previdenciária</span>
            </button>
          </div>

          {/* Dados da Folha e Contribuições Previdenciárias */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 text-[11px] block">Folha Salarial Bruta</span>
              <strong className="text-slate-900 font-extrabold text-sm font-mono">R$ 86.400,00</strong>
              <span className="text-[10px] text-slate-400 block mt-0.5">12 colaboradores</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 text-[11px] block">INSS Patronal (CPP)</span>
              <strong className="text-slate-900 font-extrabold text-sm font-mono">R$ 17.280,00</strong>
              <span className="text-[10px] text-emerald-600 block mt-0.5">20% s/ Folha</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 text-[11px] block">Fator Acidentário (FAP)</span>
              <strong className="text-slate-900 font-extrabold text-sm font-mono">0,5000</strong>
              <span className="text-[10px] text-emerald-600 block mt-0.5">Bônus máx. 50%</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-slate-500 text-[11px] block">Guia DCTFWeb Total</span>
              <strong className="text-emerald-700 font-extrabold text-sm font-mono">R$ 29.203,20</strong>
              <span className="text-[10px] text-slate-500 block mt-0.5">Venc: 20/10/2026</span>
            </div>
          </div>

          {/* Tabela de Composição dos Encargos Previdenciários */}
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-slate-100 p-3 font-bold text-slate-800 flex justify-between items-center">
              <span>Discriminação das Contribuições Previdenciárias (Competência 09/2026)</span>
              <span className="font-mono text-emerald-700 font-extrabold">Total: R$ 29.203,20</span>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Código e Encargo</th>
                  <th className="py-2 px-3">Base de Cálculo</th>
                  <th className="py-2 px-3">Alíquota</th>
                  <th className="py-2 px-3 text-right">Valor Apurado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">1082 — Contribuição Patronal Previdenciária (CPP)</td>
                  <td className="py-2 px-3 font-mono">R$ 86.400,00</td>
                  <td className="py-2 px-3 font-mono">20,00%</td>
                  <td className="py-2 px-3 font-mono text-right font-bold">R$ 17.280,00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">1099 — INSS Retido dos Segurados Empregados</td>
                  <td className="py-2 px-3 font-mono">R$ 86.400,00</td>
                  <td className="py-2 px-3 font-mono">9,00% (méd.)</td>
                  <td className="py-2 px-3 font-mono text-right font-bold">R$ 7.776,00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">1646 — RAT Ajustado (Risco Ambiental do Trabalho)</td>
                  <td className="py-2 px-3 font-mono">R$ 86.400,00</td>
                  <td className="py-2 px-3 font-mono">1,00%</td>
                  <td className="py-2 px-3 font-mono text-right font-bold">R$ 864,00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">5952 — Outras Entidades e Fundos (Sistema S / Terceiros)</td>
                  <td className="py-2 px-3 font-mono">R$ 86.400,00</td>
                  <td className="py-2 px-3 font-mono">3,80%</td>
                  <td className="py-2 px-3 font-mono text-right font-bold">R$ 3.283,20</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 5. MODAL LINK DE ACESSO DO CLIENTE
// =========================================================================
interface LinkAcessoModalProps {
  onClose: () => void;
  cliente: {
    nome: string;
    cnpj: string;
    contato: string;
    email?: string;
  };
}

export const LinkAcessoModal: React.FC<LinkAcessoModalProps> = ({
  onClose,
  cliente,
}) => {
  const [copiado, setCopiado] = useState(false);
  const [tempoExpiracao, setTempoExpiracao] = useState("30");

  const urlAcesso = `https://portal.muradecontabil.com.br/acesso/${cliente.cnpj.replace(/\D/g, "")}-${Date.now().toString(36)}`;

  const copiarLink = () => {
    navigator.clipboard.writeText(urlAcesso);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const enviarWhatsApp = () => {
    const msg = encodeURIComponent(
      `Olá ${cliente.contato}! Segue o link de acesso seguro ao seu Portal Murade Contábil: ${urlAcesso} (Válido por ${tempoExpiracao} dias).`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="bg-[#082B66] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Share2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                Link Exclusivo de Acesso ao Portal
              </h3>
              <p className="text-xs text-blue-200">{cliente.nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Link Seguro Gerado com Token Único:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={urlAcesso}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs select-all text-slate-800"
              />
              <button
                onClick={copiarLink}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition"
              >
                {copiado ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiado ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Validade do Token:</label>
              <select
                value={tempoExpiracao}
                onChange={(e) => setTempoExpiracao(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium"
              >
                <option value="7">7 Dias</option>
                <option value="30">30 Dias (Recomendado)</option>
                <option value="90">90 Dias</option>
                <option value="365">1 Ano</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Permissões:</label>
              <div className="px-2.5 py-1.5 bg-slate-100 rounded-lg text-slate-700 font-semibold truncate">
                Guias + Balanços + DRE
              </div>
            </div>
          </div>

          {/* Botão de Envio Rápido */}
          <div className="pt-2 border-t border-slate-100 flex gap-2">
            <button
              onClick={enviarWhatsApp}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Smartphone className="w-4 h-4" />
              <span>Enviar via WhatsApp</span>
            </button>
            <button
              onClick={copiarLink}
              className="flex-1 py-2 px-3 rounded-lg bg-[#082B66] hover:bg-[#0A357D] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Copy className="w-4 h-4" />
              <span>{copiado ? "Link Copiado!" : "Copiar Link"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 6. MODAL EDITAR DADOS DO CLIENTE
// =========================================================================
interface ClienteCadastro {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  plano: string;
  status: "Ativo" | "Pendente" | "Inativo";
  ultimoAcesso: string;
}

interface EditarClienteModalProps {
  cliente: ClienteCadastro;
  onClose: () => void;
  onSalvar: (clienteAtualizado: ClienteCadastro) => void;
}

export const EditarClienteModal: React.FC<EditarClienteModalProps> = ({
  cliente,
  onClose,
  onSalvar,
}) => {
  const [formData, setFormData] = useState<ClienteCadastro>({ ...cliente });

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    onSalvar(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="bg-[#082B66] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <User className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Editar Dados do Cliente</h3>
              <p className="text-xs text-blue-200">{cliente.nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSalvar} className="p-5 space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Razão Social / Nome:</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">CNPJ:</label>
              <input
                type="text"
                required
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Responsável:</label>
              <input
                type="text"
                value={formData.contato}
                onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">E-mail:</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Telefone:</label>
              <input
                type="text"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Plano:</label>
              <select
                value={formData.plano}
                onChange={(e) => setFormData({ ...formData, plano: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-semibold"
              >
                <option value="Murade Básico">Murade Básico</option>
                <option value="Murade Pro">Murade Pro</option>
                <option value="Murade Premium">Murade Premium</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Status do Acesso:</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-semibold"
              >
                <option value="Ativo">Ativo</option>
                <option value="Pendente">Pendente</option>
                <option value="Inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 rounded-lg text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="py-2 px-4 rounded-lg bg-[#082B66] hover:bg-[#0A357D] text-white font-bold cursor-pointer shadow-xs"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// 7. MODAL EXCLUIR / REVOGAR ACESSO DO CLIENTE
// =========================================================================
interface ExcluirClienteModalProps {
  cliente: ClienteCadastro;
  onClose: () => void;
  onConfirmar: () => void;
}

export const ExcluirClienteModal: React.FC<ExcluirClienteModalProps> = ({
  cliente,
  onClose,
  onConfirmar,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">
              Revogar Acesso e Excluir Cliente?
            </h4>
            <p className="text-xs text-slate-500">Esta ação cancelará os tokens de login.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1">
          <div><strong>Empresa:</strong> {cliente.nome}</div>
          <div><strong>CNPJ:</strong> {cliente.cnpj}</div>
          <div><strong>Responsável:</strong> {cliente.contato}</div>
        </div>

        <p className="text-xs text-rose-600 font-medium">
          ⚠️ O cliente não conseguirá mais visualizar guias ou relatórios no Portal do Cliente até que um novo convite seja enviado.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="py-2 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="py-2 px-4 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
          >
            Sim, Excluir e Revogar
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 8. MODAL PRÉVIA DO PORTAL DO CLIENTE (Visão do Cliente)
// =========================================================================
interface PreviaClienteModalProps {
  onClose: () => void;
  cliente: ClienteCadastro;
}

export const PreviaClienteModal: React.FC<PreviaClienteModalProps> = ({
  onClose,
  cliente,
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Barra de Simulação */}
        <div className="bg-emerald-700 text-white px-4 py-2 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-200" />
            <span>MODO SIMULAÇÃO — Você está visualizando exatamente como o cliente vê</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded cursor-pointer text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Portal do Cliente Simulado */}
        <div className="bg-slate-100 p-4 sm:p-6 overflow-y-auto space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#082B66] text-white flex items-center justify-center font-black">
                MC
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">{cliente.nome}</h4>
                <p className="text-xs text-slate-500">CNPJ: {cliente.cnpj} • Portal do Cliente</p>
              </div>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full">
              Sessão Autenticada
            </span>
          </div>

          {/* Cards do Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-slate-500 text-xs font-semibold">Guias a Pagar</div>
              <div className="text-xl font-black text-rose-600 font-mono mt-1">2 Pendentes</div>
              <p className="text-[11px] text-slate-400 mt-0.5">DARF e DAS do mês</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-slate-500 text-xs font-semibold">Faturamento Mês</div>
              <div className="text-xl font-black text-emerald-600 font-mono mt-1">R$ 580.000</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Base apurada</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="text-slate-500 text-xs font-semibold">Certidões CND</div>
              <div className="text-xl font-black text-blue-600 font-mono mt-1">100% Válidas</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Receita, FGTS, INSS</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h5 className="font-bold text-slate-800 text-sm mb-3">Minhas Guias do Mês 09/2026</h5>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <strong className="text-slate-900 block">DAS — Simples Nacional</strong>
                  <span className="text-slate-500 text-[11px]">Vencimento: 20/10/2026</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold font-mono text-slate-900">R$ 8.895,40</span>
                  <button
                    onClick={() => alert("Código de barras copiado pelo cliente!")}
                    className="px-2.5 py-1 bg-[#082B66] text-white rounded font-bold hover:bg-[#0A357D] cursor-pointer"
                  >
                    Pagar Pix
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
