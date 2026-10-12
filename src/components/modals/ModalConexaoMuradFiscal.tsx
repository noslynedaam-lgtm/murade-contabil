import React from "react";
import { AlertCircle, Building2, CheckCircle2, FileSpreadsheet, Users, X } from "lucide-react";
import { EmpresaDados } from "../../types";

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
}) => {
  if (!aberto || !empresa) return null;

  const dadosFiscais = empresa.dadosFiscais;
  const dadosDP = empresa.dadosDP;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70">
      <section role="dialog" aria-modal="true" aria-labelledby="empresa-recebida-titulo" className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-slate-900 p-5 text-white">
          <div className="flex gap-3">
            <Building2 className="mt-1 h-6 w-6 shrink-0" />
            <div>
              <h2 id="empresa-recebida-titulo" className="text-lg font-bold">Dados da empresa recebidos</h2>
              <p className="mt-1 text-sm text-slate-200">Confira os dados antes de ativar no Contábil.</p>
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-bold text-slate-900">{empresa.razaoSocial || "Razão social não informada"}</div>
            <div className="mt-1 font-mono text-sm text-slate-700">CNPJ: {empresa.cnpj || "Não informado"}</div>
            {empresa.fonteDados && <div className="mt-2 text-xs text-slate-500">Fonte informada: {empresa.fonteDados}</div>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                <FileSpreadsheet className="h-4 w-4" /> Murade Fiscal
              </div>
              {dadosFiscais ? (
                <p className="text-sm text-slate-600">
                  {typeof dadosFiscais.documentosCapturados === "number"
                    ? `${dadosFiscais.documentosCapturados} documento(s) informados pela integração.`
                    : "Dados fiscais recebidos; valide a origem antes de usar."}
                </p>
              ) : (
                <p className="text-sm text-amber-800">Nenhum documento ou apuração fiscal foi recebido.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                <Users className="h-4 w-4" /> Departamento Pessoal
              </div>
              {dadosDP ? (
                <p className="text-sm text-slate-600">
                  {typeof dadosDP.funcionariosAtivos === "number"
                    ? `${dadosDP.funcionariosAtivos} colaborador(es) informados pela integração.`
                    : "Dados de DP recebidos; valide a origem antes de usar."}
                </p>
              ) : (
                <p className="text-sm text-amber-800">Nenhum dado de folha ou colaborador foi recebido.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>Receber o cadastro não comprova conexão com Receita Federal, SEFAZ, eSocial ou certificado digital.</span>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="button" onClick={onFechar} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Cancelar</button>
          <button
            type="button"
            onClick={() => { onConfirmarAtivar(empresa); onFechar(); }}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <CheckCircle2 className="h-4 w-4" /> Ativar cadastro
          </button>
        </footer>
      </section>
    </div>
  );
};
