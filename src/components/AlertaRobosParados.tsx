import React, { useEffect, useState } from 'react';

// Faixa vermelha que só aparece quando algum robô deste sistema parou de rodar no tempo esperado.
// Lê o estado real de /api/robos/status; se a consulta falhar, não mostra nada (nunca inventa alerta).
export function AlertaRobosParados() {
  const [parados, setParados] = useState<string[]>([]);
  useEffect(() => {
    let ativo = true;
    const consultar = () => {
      fetch('/api/robos/status', { credentials: 'include', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!ativo || !d?.sucesso || !Array.isArray(d.robos)) return;
          setParados(d.robos.filter((r: any) => r?.estado === 'parado').map((r: any) => String(r.nome)));
        })
        .catch(() => undefined);
    };
    consultar();
    const timer = setInterval(consultar, 5 * 60_000);
    return () => { ativo = false; clearInterval(timer); };
  }, []);
  if (!parados.length) return null;
  return (
    <div role="alert" className="mx-2 mt-2 rounded border border-red-300 bg-red-50 p-2 text-[12px] text-red-950">
      <strong>Atenção:</strong> {parados.length === 1 ? 'o robô' : 'os robôs'} {parados.join(', ')} {parados.length === 1 ? 'parou' : 'pararam'} de rodar no tempo esperado. Se o aviso continuar depois de alguns minutos, avise o suporte.
    </div>
  );
}
