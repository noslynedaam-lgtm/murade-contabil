import React, { useState } from "react";
import { LivroContabil } from "../../types";
import { AlertTriangle, BookOpen, Download, FileText, Send } from "lucide-react";
import { baixarArquivoTexto } from "../../utils/downloadText";

interface LivrosTabProps {
  livros: LivroContabil[];
  onTransmitirTodos: () => void;
  isTransmitting: boolean;
}

export const LivrosTab: React.FC<LivrosTabProps> = ({ livros, onTransmitirTodos, isTransmitting }) => {
  const [aviso, setAviso] = useState<string | null>(null);

  const baixarRascunho = (livro: LivroContabil) => {
    const conteudo = [
      "RASCUNHO LOCAL — NÃO É LIVRO OU OBRIGAÇÃO OFICIAL",
      `Documento: ${livro.titulo}`,
      `Descrição: ${livro.descricao}`,
      `Competência: ${livro.competencia}`,
      `Órgão pretendido: ${livro.orgaoDestino}`,
      `Situação registrada no aplicativo: ${livro.status}`,
      "",
      "Este arquivo não comprova assinatura, validação, protocolo ou transmissão oficial.",
    ].join("\n");
    baixarArquivoTexto(`${livro.titulo.replace(/[^\p{L}\p{N}]+/gu, "_")}_${livro.competencia.replace("/", "-")}.txt`, conteudo);
    setAviso("Rascunho local baixado. Ele não é documento oficial nem foi transmitido.");
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><BookOpen className="h-5 w-5 text-blue-700" /> Livros e obrigações contábeis</h2>
          <p className="mt-1 text-xs text-slate-600">Exibe somente itens existentes no Contábil. Geração oficial, assinatura digital e transmissão ainda não estão conectadas.</p>
        </div>
        <button type="button" onClick={onTransmitirTodos} disabled={isTransmitting} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> {isTransmitting ? "Verificando configuração…" : "Verificar disponibilidade de envio"}
        </button>
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>O balancete local é calculado na aba Balancete. Este módulo não gera ECD, ECF, EFD, DCTFWeb ou recibos oficiais. A rotina de preparação e a transmissão dependem de leiautes, dados fiscais/folha integrados, certificado/procuração e validação nos programas oficiais.</p>
      </div>

      {aviso && <p role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">{aviso}</p>}

      {livros.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" />
          <h3 className="mt-2 text-sm font-bold text-slate-800">Nenhum livro preparado</h3>
          <p className="mt-1 text-xs text-slate-600">Ainda não há dados contábeis consolidados para montar livros. Importe e confira lançamentos e plano de contas primeiro.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {livros.map((livro) => (
            <article key={livro.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{livro.titulo}</h3>
                <p className="mt-1 text-xs text-slate-600">{livro.descricao}</p>
                <p className="mt-1 text-[11px] text-slate-500">Competência: {livro.competencia} · Destino pretendido: {livro.orgaoDestino} · Estado local: {livro.status}{livro.hashTransmissao ? ` · Referência informada: ${livro.hashTransmissao}` : ""}</p>
                <p className="mt-1 text-[11px] font-semibold text-amber-800">O estado acima não foi confirmado por um serviço oficial.</p>
              </div>
              <button type="button" onClick={() => baixarRascunho(livro)} className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                <Download className="h-3.5 w-3.5" /> Baixar rascunho
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
