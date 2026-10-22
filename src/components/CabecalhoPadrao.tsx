import React, { useEffect, useRef, useState } from 'react';
import { Building2, KeyRound, LogOut, UserCircle } from 'lucide-react';

// Bloco padrão do canto superior direito, igual nos 5 sistemas Murade:
// Usuário | Empresa | Licença | Sair. Nunca inventa dado: sem licença cadastrada, avisa.
export type LicencaEmpresa =
  | { cadastrada: false }
  | { cadastrada: true; plano: string; vencimento: string; ativa: boolean; situacao: 'ativa' | 'vencida' | 'inativa'; diasRestantes: number };

interface Props {
  usuario: string | null;
  empresaNome: string | null;
  empresaCnpj: string | null;
  buscarLicenca: (cnpj: string) => Promise<LicencaEmpresa | null>;
  onSair: () => void;
  onClicarEmpresa?: () => void;
  /** Fora do DP: abre o DP, onde a licença é cadastrada e gerenciada. */
  urlGerenciarLicenca?: string;
  /** Só no DP: permite cadastrar/alterar a licença da empresa. */
  salvarLicenca?: (cnpj: string, dados: { plano: string; vencimento: string; ativa: boolean }) => Promise<string | null>;
}

const rotuloPlano: Record<string, string> = { P50: 'Plano 50', P100: 'Plano 100', P500: 'Plano 500' };

function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export const CabecalhoPadrao: React.FC<Props> = ({ usuario, empresaNome, empresaCnpj, buscarLicenca, onSair, salvarLicenca, onClicarEmpresa, urlGerenciarLicenca }) => {
  const [licenca, setLicenca] = useState<LicencaEmpresa | null | undefined>(undefined);
  const [aberto, setAberto] = useState(false);
  const [plano, setPlano] = useState('P50');
  const [vencimento, setVencimento] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [msg, setMsg] = useState('');
  const raiz = useRef<HTMLDivElement>(null);

  const carregar = () => {
    if (!empresaCnpj) { setLicenca(undefined); return; }
    setLicenca(undefined);
    buscarLicenca(empresaCnpj).then(setLicenca).catch(() => setLicenca(null));
  };
  useEffect(carregar, [empresaCnpj]);
  useEffect(() => {
    const fechar = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  let texto = 'Selecione uma empresa';
  let cor = 'bg-white/10 text-slate-100 border-white/20';
  if (empresaCnpj) {
    if (licenca === undefined) texto = 'Consultando licença…';
    else if (licenca === null) { texto = 'Licença indisponível'; cor = 'bg-amber-500/20 text-amber-100 border-amber-300/40'; }
    else if (!licenca.cadastrada) { texto = 'Sem licença cadastrada'; cor = 'bg-amber-500/20 text-amber-100 border-amber-300/40'; }
    else if (licenca.situacao === 'ativa') { texto = `${rotuloPlano[licenca.plano] || licenca.plano} · até ${formatarData(licenca.vencimento)}`; cor = 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40'; }
    else if (licenca.situacao === 'vencida') { texto = `Licença vencida em ${formatarData(licenca.vencimento)}`; cor = 'bg-red-500/25 text-red-100 border-red-300/40'; }
    else { texto = 'Licença inativa'; cor = 'bg-red-500/25 text-red-100 border-red-300/40'; }
  }

  const abrir = () => {
    if (!salvarLicenca && urlGerenciarLicenca) { window.open(urlGerenciarLicenca, '_blank', 'noopener,noreferrer'); return; }
    if (!salvarLicenca || !empresaCnpj) return;
    if (licenca && licenca.cadastrada) { setPlano(licenca.plano); setVencimento(licenca.vencimento); setAtiva(licenca.ativa); }
    setMsg('');
    setAberto((v) => !v);
  };

  const salvar = async () => {
    if (!salvarLicenca || !empresaCnpj) return;
    const erro = await salvarLicenca(empresaCnpj, { plano, vencimento, ativa });
    if (erro) { setMsg(erro); return; }
    setAberto(false);
    carregar();
  };

  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-100" ref={raiz}>
      <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 max-w-[150px]" title="Usuário">
        <UserCircle size={13} className="shrink-0" />
        <span className="truncate">{usuario || '—'}</span>
      </span>
      <span onClick={onClicarEmpresa} className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 max-w-[200px] ${onClicarEmpresa ? 'cursor-pointer hover:bg-white/20' : ''}`} title={empresaCnpj ? `CNPJ ${empresaCnpj} — dados e certificado da empresa` : 'Empresa'}>
        <Building2 size={13} className="shrink-0" />
        <span className="truncate">{empresaNome || 'Nenhuma empresa'}</span>
      </span>
      <div className="relative hidden" aria-hidden="true">
        <button
          type="button"
          onClick={abrir}
          className={`flex items-center gap-1 px-2 py-0.5 rounded border ${cor} ${(salvarLicenca && empresaCnpj) || urlGerenciarLicenca ? 'cursor-pointer' : 'cursor-default'}`}
          title={salvarLicenca ? 'Licença da empresa (cadastrada e gerenciada pelo DP) — clique para editar' : urlGerenciarLicenca ? 'Licença da empresa — clique para abrir o Murade DP, onde ela é cadastrada' : 'Licença da empresa (gerenciada pelo Departamento Pessoal)'}
        >
          <KeyRound size={13} className="shrink-0" />
          <span className="truncate max-w-[210px]">{texto}</span>
        </button>
        {aberto && salvarLicenca && (
          <div className="absolute right-0 mt-1 w-64 bg-white text-slate-800 rounded-lg shadow-lg border border-slate-200 p-3 z-50 space-y-2">
            <div className="font-semibold text-xs">Licença desta empresa</div>
            <label className="block text-[11px]">Plano
              <select value={plano} onChange={(e) => setPlano(e.target.value)} className="w-full border rounded px-1 py-0.5">
                <option value="P50">Plano 50</option><option value="P100">Plano 100</option><option value="P500">Plano 500</option>
              </select>
            </label>
            <label className="block text-[11px]">Vencimento
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="w-full border rounded px-1 py-0.5" />
            </label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Ativa</label>
            {msg && <div className="text-[11px] text-red-600">{msg}</div>}
            <button type="button" onClick={salvar} className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded py-1 text-xs font-semibold">Salvar licença</button>
          </div>
        )}
      </div>
      <button type="button" onClick={onSair} className="flex items-center gap-1 px-2 py-1 text-white/90 hover:text-white hover:bg-white/10 rounded transition cursor-pointer" title="Sair">
        <LogOut size={13} />
        <span>Sair</span>
      </button>
    </div>
  );
};
