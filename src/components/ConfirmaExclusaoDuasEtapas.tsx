import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ROTULO_CANCELAR, ROTULO_CONTINUAR, ROTULO_VOLTAR_ETAPA2,
  cancelarExclusao, confirmarExclusao, continuarExclusao, iniciarExclusao,
  rotuloFinal, tituloEtapa1, tituloEtapa2, ATRASO_ETAPA2_MS,
  type EstadoExclusao, type OpcoesExclusao,
} from '../utils/exclusaoDuasEtapas';

// Exclusão em DUAS ETAPAS, para ninguém apagar nada por engano (principalmente no celular).
// Uso (em qualquer tela):
//   const { pedir, dialogo } = useExclusaoDuasEtapas();
//   if (!await pedir({ titulo: 'Excluir empresa?', oQue: `a empresa ${nome} (CNPJ ${cnpj})`, consequencias: [...] })) return;
//   ...só aqui faz a exclusão de verdade...
//   return (<>{...tela}{dialogo}</>);
// Etapa 1: diz O QUE será excluído e as consequências; botões Cancelar (em destaque) e Continuar.
// Etapa 2: "Última confirmação"; botão vermelho "Sim, excluir" em OUTRO lugar, sem foco automático.
// Esc e clique fora cancelam em qualquer etapa. Botões grandes e nada para digitar.

const BOTAO = 'min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold sm:w-auto sm:min-w-36';

/** Só o desenho (sem efeitos), para poder ser testado sem navegador. */
export function CorpoConfirmaExclusao({ opcoes, estado, bloqueado, idTitulo, idDescricao, aoContinuar, aoConfirmar, aoCancelar }: {
  opcoes: OpcoesExclusao; estado: EstadoExclusao; bloqueado: boolean; idTitulo: string; idDescricao: string;
  aoContinuar: () => void; aoConfirmar: () => void; aoCancelar: () => void;
}) {
  const etapa2 = estado.etapa === 2;
  return (
    <div data-exclusao-etapa={etapa2 ? '2' : '1'} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{etapa2 ? 'Etapa 2 de 2' : 'Etapa 1 de 2'}</p>
      <h2 id={idTitulo} className={`mt-1 text-lg font-bold ${etapa2 ? 'text-red-700' : 'text-slate-900'}`}>{etapa2 ? tituloEtapa2(opcoes) : tituloEtapa1(opcoes)}</h2>
      <div id={idDescricao} className="mt-3 text-sm leading-relaxed">
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3">{etapa2 ? 'Vai ser excluído agora: ' : 'Será excluído: '}<strong className="break-words">{opcoes.oQue}</strong></p>
        {!etapa2 && !!opcoes.consequencias?.length && (
          <ul className="mt-3 list-disc space-y-1 pl-5">{opcoes.consequencias.map((c, i) => <li key={i}>{c}</li>)}</ul>
        )}
        {etapa2 && opcoes.irreversivel === false && !!opcoes.comoVoltar && <p className="mt-3">{opcoes.comoVoltar}</p>}
        {etapa2 && <p className="mt-3 font-semibold">Se não tiver certeza, toque em “{ROTULO_VOLTAR_ETAPA2}”.</p>}
      </div>
      {etapa2 ? (
        // Etapa 2: o botão vermelho vem PRIMEIRO (em cima no celular, à esquerda no computador), e o Continuar da etapa 1 vinha por último.
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-start">
          <button type="button" disabled={bloqueado} onClick={aoConfirmar} data-exclusao="confirmar" className={`${BOTAO} bg-red-700 text-white disabled:opacity-50`}>{rotuloFinal(opcoes)}</button>
          <button type="button" onClick={aoCancelar} data-exclusao="cancelar" className={`${BOTAO} border-2 border-slate-400 bg-white text-slate-800`}>{ROTULO_VOLTAR_ETAPA2}</button>
        </div>
      ) : (
        // Etapa 1: Cancelar em destaque (primeiro, em cima no celular); Continuar por último e discreto.
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={aoCancelar} data-exclusao="cancelar" className={`${BOTAO} bg-slate-900 text-white`}>{ROTULO_CANCELAR}</button>
          <button type="button" onClick={aoContinuar} data-exclusao="continuar" className={`${BOTAO} border-2 border-slate-300 bg-white text-slate-700`}>{ROTULO_CONTINUAR}</button>
        </div>
      )}
    </div>
  );
}

/** Janela das duas etapas. Chama aoResolver(true) só depois da etapa 2; qualquer outra saída chama aoResolver(false). */
export function ConfirmaExclusaoDuasEtapas({ opcoes, aoResolver }: { opcoes: OpcoesExclusao; aoResolver: (confirmou: boolean) => void }) {
  const id = useId();
  const [estado, setEstado] = useState<EstadoExclusao>(iniciarExclusao);
  const [bloqueado, setBloqueado] = useState(true);
  const caixa = useRef<HTMLDivElement>(null);
  const anterior = useRef<Element | null>(null);
  const resolvido = useRef(false);
  const resolver = useCallback((ok: boolean) => { if (resolvido.current) return; resolvido.current = true; aoResolver(ok); }, [aoResolver]);
  const estadoRef = useRef(estado); estadoRef.current = estado;

  const aplicar = useCallback((novo: EstadoExclusao) => { setEstado(novo); estadoRef.current = novo; if (novo.etapa === 'fim') resolver(novo.resultado === true); }, [resolver]);
  const cancelar = useCallback(() => aplicar(cancelarExclusao(estadoRef.current)), [aplicar]);

  useEffect(() => {
    anterior.current = document.activeElement;
    caixa.current?.focus(); // foco na janela, nunca no botão vermelho
    const teclas = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelar(); } };
    document.addEventListener('keydown', teclas, true);
    return () => {
      document.removeEventListener('keydown', teclas, true);
      if (anterior.current instanceof HTMLElement) anterior.current.focus();
    };
  }, [cancelar]);

  useEffect(() => {
    if (estado.etapa !== 2) return;
    setBloqueado(true);
    caixa.current?.focus();
    const t = window.setTimeout(() => setBloqueado(false), ATRASO_ETAPA2_MS);
    return () => window.clearTimeout(t);
  }, [estado.etapa]);

  const idTitulo = `${id}-titulo`; const idDescricao = `${id}-descricao`;
  return createPortal(
    <div className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) cancelar(); }}>
      <div ref={caixa} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={idTitulo} aria-describedby={idDescricao} className="outline-none">
        <CorpoConfirmaExclusao
          opcoes={opcoes} estado={estado} bloqueado={bloqueado} idTitulo={idTitulo} idDescricao={idDescricao}
          aoContinuar={() => aplicar(continuarExclusao(estadoRef.current, Date.now()))}
          aoConfirmar={() => aplicar(confirmarExclusao(estadoRef.current, Date.now()))}
          aoCancelar={cancelar}
        />
      </div>
    </div>,
    document.body,
  );
}

/** Hook: `pedir(opcoes)` abre as duas etapas e devolve true só se a pessoa confirmou nas duas. Renderize `dialogo` na tela. */
export function useExclusaoDuasEtapas() {
  const [pedido, setPedido] = useState<{ opcoes: OpcoesExclusao; chave: number } | null>(null);
  const resolvedor = useRef<((ok: boolean) => void) | null>(null);
  const contador = useRef(0);
  const pedir = useCallback((opcoes: OpcoesExclusao) => new Promise<boolean>((resolve) => {
    resolvedor.current?.(false); // um pedido novo cancela o anterior
    resolvedor.current = resolve;
    contador.current += 1;
    setPedido({ opcoes, chave: contador.current });
  }), []);
  const aoResolver = useCallback((ok: boolean) => { const r = resolvedor.current; resolvedor.current = null; setPedido(null); r?.(ok); }, []);
  useEffect(() => () => { resolvedor.current?.(false); resolvedor.current = null; }, []);
  const dialogo = pedido ? <React.Fragment key={pedido.chave}><ConfirmaExclusaoDuasEtapas opcoes={pedido.opcoes} aoResolver={aoResolver} /></React.Fragment> : null;
  return { pedir, dialogo };
}
