import React, { useEffect, useState } from 'react';
import { EVENTO_AVISO_SERVICO, type AvisoServico } from '../utils/servicoFeitoCliente';

// Aviso pequeno no canto direito (mesmo lugar dos avisos da Agente): nome de quem fez e a hora, com botão de fechar.
// No celular fica compacto (uma linha de título + texto curto) e some sozinho depois de alguns segundos.
export function AvisoServicoFeito() {
  const [aviso, setAviso] = useState<AvisoServico | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ouvir = (e: Event) => {
      setAviso((e as CustomEvent<AvisoServico>).detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAviso(null), 15_000);
    };
    window.addEventListener(EVENTO_AVISO_SERVICO, ouvir);
    return () => { window.removeEventListener(EVENTO_AVISO_SERVICO, ouvir); if (timer) clearTimeout(timer); };
  }, []);
  if (!aviso) return null;
  return (
    <div role="status" className={`fixed bottom-40 right-3 z-[130] w-[min(86vw,340px)] rounded-xl border bg-white py-2 pl-3 pr-9 text-xs text-slate-800 shadow-xl sm:bottom-28 ${aviso.tom === 'bloqueio' ? 'border-amber-400' : 'border-blue-300'}`}>
      <strong className="block text-[12px]">{aviso.titulo}</strong>
      <span className="block leading-snug">{aviso.texto}</span>
      <button type="button" aria-label="Fechar aviso" onClick={() => setAviso(null)} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-base text-slate-500 hover:bg-slate-100">×</button>
    </div>
  );
}

// Selo discreto: "Fechado por Malba em 17/11 às 13:37". Lê o registro real do servidor; se não houver (ou a consulta
// falhar), não mostra nada: nunca inventa quem fez.
export function SeloServicoFeito({ cnpj, tipo, referencia, rotulo = 'Feito', recarregar }: { cnpj: string; tipo: string; referencia: string; rotulo?: string; recarregar?: unknown }) {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    setTexto(null);
    const limpo = String(cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (limpo.length !== 14 || !referencia) return;
    fetch(`/api/servico-feito?tipo=${encodeURIComponent(tipo)}&cnpj=${encodeURIComponent(limpo)}&referencia=${encodeURIComponent(referencia)}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const r = ativo && d?.sucesso ? (d.registros || []).find((x: any) => x.estado === 'concluido') : null;
        if (r) setTexto(`${rotulo} por ${r.origem === 'robo' ? 'o robô' : r.feitoPor} em ${new Date(r.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ')}`);
      })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [cnpj, tipo, referencia, rotulo, recarregar]);
  if (!texto) return null;
  return <span className="inline-block text-[11px] text-slate-500" data-testid="selo-servico-feito">{texto}</span>;
}
