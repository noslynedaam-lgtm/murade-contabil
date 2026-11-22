// Marca MURAD (igual nos três sistemas): "M" estilizado (pernas brancas e o "V" do meio em dourado) num quadrado
// azul-marinho, com uma faixinha na cor do módulo; ao lado, "MURAD" em dourado e o nome do módulo em branco/cinza claro.
// O mesmo desenho gera o favicon e os ícones do app instalável (public/logo-murad.svg).
import React, { useId } from 'react';

export type ModuloMurad = 'dp' | 'fiscal' | 'contabil';
const COR_MODULO: Record<ModuloMurad, string> = { dp: '#10B981', fiscal: '#38BDF8', contabil: '#A78BFA' };
const NOME_MODULO: Record<ModuloMurad, string> = { dp: 'Departamento Pessoal', fiscal: 'Fiscal', contabil: 'Contábil' };
const SIGLA_MODULO: Record<ModuloMurad, string> = { dp: 'DP', fiscal: 'Fiscal', contabil: 'Contábil' };

/** Dourado do nome MURAD (#C9A227 com leve gradiente para #E6C65C). */
export const ESTILO_OURO: React.CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, #E6C65C 0%, #C9A227 100%)',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: '#C9A227', WebkitTextFillColor: 'transparent',
};

export const LogoMurad: React.FC<{ modulo: ModuloMurad; tamanho?: number; className?: string; titulo?: string }> = ({ modulo, tamanho = 28, className = '', titulo }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" className={`shrink-0 ${className}`} role="img" aria-label={titulo || `Murad ${NOME_MODULO[modulo]}`}>
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#13306B" /><stop offset="1" stopColor="#0B1E3F" /></linearGradient>
        <linearGradient id={`o${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E6C65C" /><stop offset="1" stopColor="#C9A227" /></linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill={`url(#f${id})`} />
      <rect x="3" y="3" width="94" height="94" rx="19" fill="none" stroke={`url(#o${id})`} strokeWidth="2" opacity="0.55" />
      <path d="M25 74 V29" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M75 74 V29" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M25 29 L50 57 L75 29" stroke={`url(#o${id})`} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="34" y="82" width="32" height="5" rx="2.5" fill={COR_MODULO[modulo]} />
    </svg>
  );
};

/** Logo + "MURAD" dourado + módulo. `fundo="escuro"` (azul-marinho) ou `"claro"` (fundo branco/cinza). */
export const MarcaMurad: React.FC<{ modulo: ModuloMurad; tamanho?: number; fundo?: 'escuro' | 'claro'; nomeCompleto?: boolean; className?: string }> = ({ modulo, tamanho = 28, fundo = 'escuro', nomeCompleto = false, className = '' }) => (
  <span className={`inline-flex items-center gap-2 select-none ${className}`}>
    <LogoMurad modulo={modulo} tamanho={tamanho} />
    <span className="flex items-baseline gap-1.5 leading-none whitespace-nowrap">
      <span className="font-black tracking-wider" style={{ ...ESTILO_OURO, fontSize: Math.round(tamanho * 0.55), ...(fundo === 'claro' ? { filter: 'drop-shadow(0 0 0.5px #7A5C00)' } : {}) }}>MURAD</span>
      <span className={`font-semibold ${fundo === 'escuro' ? 'text-slate-100' : 'text-slate-600'}`} style={{ fontSize: Math.round(tamanho * 0.46) }}>
        {nomeCompleto ? NOME_MODULO[modulo] : SIGLA_MODULO[modulo]}
      </span>
    </span>
  </span>
);
