// Campo de data sempre em dd/mm/aaaa (e competência em mm/aaaa) (cliente brasileiro), mesmo com o navegador em inglês.
// Troca direta do <input type="date">: recebe e devolve AAAA-MM-DD em value/onChange (e.target.value), aceita min/max,
// required, disabled, className, id, data-*, aria-*. O botão do calendário abre o seletor do próprio aparelho.
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { brParaISO, brParaISOMes, isoMesParaBR, isoParaBR, mascararDataBR, mascararMesBR } from '../utils/dataBR';

type Nativo = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'>;
export interface CampoDataProps extends Nativo {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (e: { target: { value: string; name?: string; id?: string }; currentTarget: { value: string; name?: string; id?: string } }) => void;
}

const FORMATOS = {
  data: { tam: 10, mascara: mascararDataBR, paraBR: isoParaBR, paraISO: brParaISO, dica: 'dd/mm/aaaa', nativo: 'date', largura: '8.5rem' },
  mes: { tam: 7, mascara: mascararMesBR, paraBR: isoMesParaBR, paraISO: brParaISOMes, dica: 'mm/aaaa', nativo: 'month', largura: '7rem' },
} as const;

const CampoBR = forwardRef<HTMLInputElement, CampoDataProps & { formato: keyof typeof FORMATOS }>(function CampoBR(
  { formato, value, defaultValue, onChange, min, max, name, id, className, disabled, readOnly, placeholder, style, ...resto },
  ref,
) {
  const F = FORMATOS[formato];
  const isoParaBR = F.paraBR; const brParaISO = F.paraISO; const mascararDataBR = F.mascara;
  const controlado = value !== undefined;
  const isoAtual = String((controlado ? value : defaultValue) ?? '');
  const [texto, setTexto] = useState(() => isoParaBR(isoAtual));
  const [isoInterno, setIsoInterno] = useState(isoAtual);
  const ultimoEmitido = useRef<string>(isoAtual);
  const seletor = useRef<HTMLInputElement | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  // Valor mudou por fora (carregou do banco, limpou o formulário): mostra a nova data.
  useEffect(() => {
    if (!controlado) return;
    const v = String(value ?? '');
    if (v !== ultimoEmitido.current) { ultimoEmitido.current = v; setTexto(isoParaBR(v)); }
  }, [value, controlado]);

  const emitir = (iso: string) => {
    if (iso === ultimoEmitido.current) return;
    ultimoEmitido.current = iso;
    setIsoInterno(iso);
    const alvo = { value: iso, name: name as string | undefined, id };
    onChange?.({ target: alvo, currentTarget: alvo });
  };

  const validar = (t: string, iso: string | null) => {
    const el = campo.current;
    if (!el) return;
    let msg = '';
    if (t && !iso) msg = `Data inválida: use ${F.dica}.`;
    else if (iso && min && iso < String(min)) msg = `A data não pode ser antes de ${isoParaBR(String(min))}.`;
    else if (iso && max && iso > String(max)) msg = `A data não pode ser depois de ${isoParaBR(String(max))}.`;
    el.setCustomValidity(msg);
  };

  const aoDigitar = (bruto: string) => {
    const t = mascararDataBR(bruto);
    setTexto(t);
    const iso = t.length === F.tam ? brParaISO(t) : null;
    validar(t, iso);
    emitir(iso || '');
  };

  const abrirCalendario = () => {
    const s = seletor.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!s || disabled || readOnly) return;
    try { if (s.showPicker) s.showPicker(); else s.click(); } catch { s.click(); }
  };

  // Largura, margem e posição no grid ficam na "casca" (como ficavam no <input type="date">); o resto vai no campo.
  const classes = String(className || '').split(/\s+/).filter(Boolean);
  const daCasca = (c: string) => /^([a-z0-9]+:)*(-?m[trblxy]?-|w-|min-w-|max-w-|flex-1|flex-auto|grow|shrink|basis-|col-span-|self-|justify-self-)/.test(c);
  const casca = classes.filter(daCasca).join(' ');
  const doCampo = classes.filter((c) => !daCasca(c)).join(' ');
  return (
    <span className={`relative inline-flex items-center align-middle ${casca}`} style={{ minWidth: F.largura }}>
      <input
        {...resto}
        ref={(el) => { campo.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={F.tam}
        placeholder={placeholder || F.dica}
        value={texto}
        disabled={disabled}
        readOnly={readOnly}
        className={`${doCampo} w-full pr-8`}
        style={style}
        onChange={(e) => aoDigitar(e.target.value)}
        onBlur={(e) => { if (texto && texto.length < F.tam) validar(texto, null); resto.onBlur?.(e); }}
      />
      <button type="button" tabIndex={-1} onClick={abrirCalendario} disabled={disabled || readOnly} aria-label="Abrir calendário"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-sm leading-none opacity-70 hover:opacity-100 disabled:opacity-30">📅</button>
      {/* Seletor do aparelho (escondido): escolher no calendário preenche o campo em dd/mm/aaaa. */}
      <input ref={seletor} type={F.nativo} tabIndex={-1} aria-hidden="true" min={min} max={max} value={controlado ? String(value ?? '') : isoInterno}
        onChange={(e) => { const iso = e.target.value; setTexto(isoParaBR(iso)); validar(isoParaBR(iso), iso || null); emitir(iso); }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" />
      {name && <input type="hidden" name={name} value={controlado ? String(value ?? '') : isoInterno} />}
    </span>
  );
});

/** Data dd/mm/aaaa (guarda AAAA-MM-DD). */
export const CampoData = forwardRef<HTMLInputElement, CampoDataProps>(function CampoData(props, ref) {
  return <CampoBR {...props} formato="data" ref={ref} />;
});

/** Competência mm/aaaa (guarda AAAA-MM), no lugar do <input type="month"> que mostra "November 2026" em inglês. */
export const CampoMes = forwardRef<HTMLInputElement, CampoDataProps>(function CampoMes(props, ref) {
  return <CampoBR {...props} formato="mes" ref={ref} />;
});
