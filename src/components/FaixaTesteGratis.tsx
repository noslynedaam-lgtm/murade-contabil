import React, { useEffect, useState } from 'react';

// Faixa discreta do TESTE GRÁTIS (uma linha, não fica presa no topo e no celular ocupa o mínimo):
// "Teste grátis: faltam X dias · 1 de 2 empresas" ou, quando acaba, o aviso de teste encerrado (só leitura, nada apagado).
// Escritório que não está em teste (todos os clientes de hoje) não vê nada.
type Situacao = { emTeste: boolean; situacao?: string; diasRestantes?: number; limiteEmpresas?: number; empresasUsadas?: number; mensagem?: string };

export function FaixaTesteGratis() {
  const [s, setS] = useState<Situacao | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = () => fetch('/api/teste-gratis/minha-situacao', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (vivo && d && d.emTeste) setS(d); else if (vivo) setS(null); }).catch(() => undefined);
    void carregar();
    const t = window.setInterval(carregar, 30 * 60_000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  if (!s?.emTeste) return null;
  if (s.situacao === 'encerrado') {
    return (
      <div role="status" className="mx-3 mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-900 sm:mx-6 sm:text-xs">
        <strong>Teste grátis encerrado.</strong> Seus dados estão guardados: dá para ver e baixar tudo. Para cadastrar ou transmitir, fale com a gente para contratar.
      </div>
    );
  }
  return (
    <div role="status" className="mx-3 mt-2 flex items-center gap-2 truncate rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900 sm:mx-6 sm:text-xs">
      <strong className="shrink-0">{s.mensagem}</strong>
      <span className="truncate text-emerald-800">· {s.empresasUsadas ?? 0} de {s.limiteEmpresas} empresas</span>
    </div>
  );
}
