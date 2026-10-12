import React, { useState } from "react";
import { LivroContabil } from "../../types";
import { BookOpen, CheckCircle2, Send, FileText, Download, Clock, AlertCircle } from "lucide-react";
import { baixarArquivoTexto } from "../modals/DemonstrativosModals";

interface LivrosTabProps {
  livros: LivroContabil[];
  onTransmitirTodos: () => void;
  isTransmitting: boolean;
}

export const LivrosTab: React.FC<LivrosTabProps> = ({
  livros,
  onTransmitirTodos,
  isTransmitting,
}) => {
  const [activeModal, setActiveModal] = useState<LivroContabil | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleBaixarPDF = (livro: LivroContabil) => {
    const conteudo = `LIVRO CONTÁBIL OFICIAL — MURADE CONTÁBIL 2026\nDocumento: ${livro.titulo}\nDescrição: ${livro.descricao}\nCompetência: ${livro.competencia}\nDestino: ${livro.orgaoDestino}\nStatus: Pronto e Assinado via ICP-Brasil.\n\nHash SHA-256: 8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b`;
    baixarArquivoTexto(`${livro.titulo.replace(/\s+/g, "_")}_${livro.competencia.replace("/", "-")}.txt`, conteudo);
    setSuccessToast(`📥 ${livro.titulo} baixado com sucesso!`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleTransmitirIndividual = (livro: LivroContabil) => {
    setSuccessToast(`Transmissão iniciada para ${livro.titulo} junto à ${livro.orgaoDestino}...`);
    setTimeout(() => {
      setSuccessToast(`✅ ${livro.titulo} transmitido com sucesso! Recibo gerado.`);
      setTimeout(() => setSuccessToast(null), 3500);
    }, 1200);
  };

  return (
    <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>📖 LIVROS — Fechamento Automático & Transmissão!</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            O Agente gera, fecha e transmite SOZINHO todos os livros contábeis e obrigações fiscais!
          </p>
        </div>

        <button
          id="btn-fechar-transmitir-todos"
          onClick={onTransmitirTodos}
          disabled={isTransmitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
        >
          <Send className={`w-3.5 h-3.5 ${isTransmitting ? "animate-spin" : ""}`} />
          <span>{isTransmitting ? "Assinando e Transmitindo..." : "✅ FECHAR E TRANSMITIR TODOS SOZINHO"}</span>
        </button>
      </div>

      {successToast && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Lista de Livros Principais */}
      <div className="space-y-3 mb-6">
        {livros.slice(0, 5).map((livro) => (
          <div
            key={livro.id}
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
              livro.status === "pronto"
                ? "bg-slate-50 border-slate-200 border-l-4 border-l-blue-600"
                : "bg-amber-50/50 border-amber-200 border-l-4 border-l-amber-500"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs sm:text-sm">{livro.titulo}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    livro.status === "pronto"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {livro.status === "pronto" ? "PRONTO PARA SPED" : "AGUARDANDO CONTAGEM"}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{livro.descricao}</div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                Destino: {livro.orgaoDestino} • Competência: {livro.competencia}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <button
                onClick={() => setActiveModal(livro)}
                className="px-2.5 py-1.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Visualizar
              </button>
              <button
                onClick={() => handleBaixarPDF(livro)}
                className="px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => handleTransmitirIndividual(livro)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <Send className="w-3 h-3" />
                <span>Transmitir</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Obrigações Acessórias Transmitidas */}
      <div className="pt-4 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
          📤 Obrigações Acessórias — Transmissão Direta com Recibo
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
            <div className="font-bold text-emerald-950">✅ EFD ICMS/IPI</div>
            <div className="text-[11px] text-emerald-800 mt-1">Transmitido à SEFAZ-GO</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">REC: GO-2026-SPED</div>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
            <div className="font-bold text-emerald-950">✅ DCTFWeb</div>
            <div className="text-[11px] text-emerald-800 mt-1">Transmitido à Receita</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">REC: RFB-DCTF-991</div>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
            <div className="font-bold text-emerald-950">✅ eSocial (S-1299)</div>
            <div className="text-[11px] text-emerald-800 mt-1">Folha 10/2026 Fechada</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">REC: ESOC-2026-BR</div>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
            <div className="font-bold text-emerald-950">✅ SPED ECD</div>
            <div className="text-[11px] text-emerald-800 mt-1">Escrituração Contábil Digital</div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">REC: SPED-ECD-551</div>
          </div>
        </div>
      </div>

      {/* Modal de Pré-Visualização de Livro */}
      {activeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>{activeModal.titulo}</span>
              </h4>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono">
                <div>[TERMO DE ABERTURA - LIVRO OFICIAL REGISTRADO]</div>
                <div>EMPRESA: EMPRESA EXEMPLO LTDA — CNPJ: 00.000.000/0001-00</div>
                <div>COMPETÊNCIA: {activeModal.competencia} | REGIME: LUCRO PRESUMIDO</div>
                <div>AUTORIDADE RECEPTORA: {activeModal.orgaoDestino}</div>
                <div>STATUS: {activeModal.hashTransmissao || "Assinado com Carimbo do Tempo ICP-Brasil"}</div>
              </div>

              <p className="leading-relaxed">
                Este livro foi gerado automaticamente pelo Agente Murade consolidando as operações contábeis com estrita observância aos Princípios Fundamentais de Contabilidade e às Normas Brasileiras de Contabilidade (NBC TG).
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  handleBaixarPDF(activeModal);
                  setActiveModal(null);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Exportar Arquivo SPED (.txt)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
