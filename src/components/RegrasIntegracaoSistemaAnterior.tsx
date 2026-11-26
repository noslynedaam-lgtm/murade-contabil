import React, { useEffect, useState } from "react";

// Regras de integração das notas do Fiscal que vieram do sistema anterior (fornecedor CNPJ/CPF → conta; CFOP → conta do valor contábil;
// grupos de clientes e fornecedores). Só leitura: o reconciliador usa estas contas ao montar o pré-lançamento da nota; sem regra, vale o
// mapeamento da origem. Só aparece quando a empresa tem regras.

const TIPOS: Record<string, string> = { fornecedor: "Fornecedor", cfop_entrada: "CFOP de entrada", cfop_saida: "CFOP de saída", grupo_clientes: "Grupo de clientes", grupo_fornecedores: "Grupo de fornecedores" };
const SITUACAO: Record<string, string> = { ok: "", nao_existe: "conta não existe mais no plano", sintetica: "conta sintética (não lança)", sem_conta: "sem conta no sistema anterior" };
const docBr = (d: string) => (/^\d{14}$/.test(d) ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : /^\d{11}$/.test(d) ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d);

export const RegrasIntegracaoSistemaAnterior: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const c = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [dados, setDados] = useState<any>(null);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    setDados(null); if (c.length !== 14) return;
    fetch(`/api/migracao-sistema-anterior/integracao-fiscal/${c}`, { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((j) => setDados(j?.sucesso ? j : null)).catch(() => setDados(null));
  }, [c]);
  if (!dados?.total) return null;
  const b = busca.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const regras = (dados.regras || []).filter((x: any) => !b || String(x.chave).includes(b) || (busca.trim() !== "" && String(x.conta).includes(busca.trim())));
  const conf = dados.conferencia;
  return (
    <details className={`mt-4 rounded-xl border p-3 text-sm ${conf && !conf.bate ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <summary className="cursor-pointer font-bold">Regras de integração do sistema anterior — {dados.total.toLocaleString("pt-BR")} regra(s){conf ? (conf.bate ? " • batem com o backup" : " • conferir") : ""}</summary>
      <p className="mt-2 text-xs text-slate-600">Vieram do backup do sistema anterior. Nas notas do Fiscal, a entrada de um fornecedor daqui vai a crédito na conta dele e o CFOP com conta vai na conta do valor contábil; o resto segue o mapeamento acima. Só consulta.</p>
      {conf && <p className={`mt-1 text-xs ${conf.bate ? "text-emerald-700" : "text-amber-800"}`}>{conf.resumo}</p>}
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar CNPJ/CPF do fornecedor ou CFOP" className="mt-2 min-h-[40px] w-full rounded border border-slate-300 px-2 sm:w-80" />
      <div className="mt-2 max-h-96 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th className="p-1">Tipo</th><th className="p-1">Fornecedor / CFOP</th><th className="p-1">Descrição</th><th className="p-1">Conta no Murad</th></tr></thead>
          <tbody>{regras.slice(0, 300).map((x: any) => (
            <tr key={`${x.tipo}-${x.chave}`} className="border-t border-slate-100">
              <td className="p-1">{TIPOS[x.tipo] || x.tipo}</td><td className="p-1">{x.tipo === "fornecedor" ? docBr(x.chave) : x.tipo.startsWith("grupo_") ? "—" : x.chave}</td><td className="p-1">{x.descricao}</td>
              <td className="p-1">{x.conta ? `${x.conta}${x.contaNome ? ` — ${x.contaNome}` : ""}` : "—"}{SITUACAO[x.contaNoPlano] && !x.tipo.startsWith("grupo_") ? <span className="ml-1 text-amber-700">({SITUACAO[x.contaNoPlano]})</span> : null}{x.foraDoGrupo ? <span className="ml-1 text-amber-700">(fora do grupo de fornecedores: confira)</span> : null}</td>
            </tr>))}</tbody>
        </table>
        {regras.length > 300 && <p className="mt-1 text-xs text-slate-600">Mostrando 300 de {regras.length}. Use a busca.</p>}
      </div>
    </details>
  );
};
