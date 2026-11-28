// Cadastro de empresa por foto/arquivo (igual no DP, no Fiscal e no Contábil; pedido do dono em 27/11/2026).
// Botão de câmera (celular) e de arquivo (foto, PDF, print ou XML de nota). O servidor lê o documento, confere na consulta pública
// gratuita da Receita e devolve a FICHA; a pessoa confere (campos "conferir" em amarelo) e clica em "Conferi, preencher o cadastro".
// Nada é gravado aqui: o formulário é preenchido e a pessoa salva no botão Salvar de sempre (o OK dela).
import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileUp, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import type { FichaEmpresa, CampoDaFicha } from '../server/cadastroPorDocumento';

const ROTULOS: Array<[CampoDaFicha, string]> = [
  ['cnpj', 'CNPJ'], ['razaoSocial', 'Razão social'], ['nomeFantasia', 'Nome fantasia'], ['regime', 'Regime'], ['cnae', 'CNAE principal'], ['inscricaoEstadual', 'Inscrição estadual'],
  ['inscricaoMunicipal', 'Inscrição municipal'], ['logradouro', 'Endereço'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Município'], ['uf', 'UF'],
  ['cep', 'CEP'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['titular', 'Titular / responsável'], ['situacaoCadastral', 'Situação na Receita'],
];
const ORIGEM: Record<string, string> = { receita: 'Receita', documento: 'documento', xml: 'nota (XML)', '': '' };
const fmtCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

interface Lado { lado: 'emitente' | 'destinatario'; cnpj: string; nome: string; lidos: unknown }

/** Foto grande do celular vira JPEG de até 2000 px (cabe no limite e a leitura fica igual). PDF/XML vão como estão. */
async function arquivoParaEnvio(f: File): Promise<{ nome: string; mimeType: string; dadosBase64: string }> {
  const lerBase64 = (b: Blob) => new Promise<string>((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => erro(new Error('Não consegui ler o arquivo.')); r.readAsDataURL(b); });
  const tipo = f.type || (/\.xml$/i.test(f.name) ? 'text/xml' : /\.pdf$/i.test(f.name) ? 'application/pdf' : '');
  if (/^image\/(jpeg|png|webp)$/.test(tipo) && f.size > 900_000) {
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('imagem')); i.src = url; });
      const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
      if (blob) return { nome: f.name, mimeType: 'image/jpeg', dadosBase64: await lerBase64(blob) };
    } catch { /* manda a original */ }
  }
  return { nome: f.name, mimeType: tipo, dadosBase64: await lerBase64(f) };
}

export interface CadastroPorDocumentoProps {
  /** A pessoa conferiu a ficha: preencher o formulário com ela (quem salva é o botão Salvar da tela). */
  onAplicar: (ficha: FichaEmpresa) => void;
  /** Rota do servidor (padrão: /api/empresas/ler-documento-cadastro). */
  endpoint?: string;
  className?: string;
}

export const CadastroPorDocumento: React.FC<CadastroPorDocumentoProps> = ({ onAplicar, endpoint = '/api/empresas/ler-documento-cadastro', className = '' }) => {
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState('');
  const [ficha, setFicha] = useState<FichaEmpresa | null>(null);
  const [lados, setLados] = useState<Lado[] | null>(null);
  const [jaCadastrada, setJaCadastrada] = useState<string | null>(null);

  const pedir = async (corpo: Record<string, unknown>) => {
    setLendo(true); setErro(''); setFicha(null); setLados(null); setJaCadastrada(null);
    try {
      const r = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.sucesso !== true) throw new Error(j.motivo || j.error || 'Não consegui ler o documento agora.');
      if (Array.isArray(j.escolherLado)) setLados(j.escolherLado);
      else if (j.ficha) { setFicha(j.ficha); setJaCadastrada(j.jaCadastrada?.mensagem || null); }
    } catch (e: any) { setErro(e?.message || 'Não consegui ler o documento agora.'); }
    finally { setLendo(false); }
  };
  const escolheuArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { await pedir({ arquivo: await arquivoParaEnvio(f) }); } catch (err: any) { setErro(err?.message || 'Não consegui ler o arquivo.'); }
  };
  const aplicar = () => { if (ficha) { onAplicar(ficha); setFicha(null); } };

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 ${className}`} data-campo="cadastro-por-documento">
      <p className="text-xs font-bold text-indigo-900">Cadastrar por foto ou arquivo</p>
      <p className="text-[11px] text-indigo-800 mb-2">Cartão CNPJ, inscrição estadual ou municipal, contrato social, CCMEI ou o XML de uma nota. Eu leio, confiro na Receita (consulta gratuita) e mostro para você conferir.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-campo="cadastro-foto" disabled={lendo} onClick={() => camera.current?.click()} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
          <Camera className="w-4 h-4" /> Tirar foto
        </button>
        <button type="button" data-campo="cadastro-arquivo" disabled={lendo} onClick={() => arquivo.current?.click()} className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-60">
          <FileUp className="w-4 h-4" /> Foto, PDF ou XML
        </button>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolheuArquivo} />
        <input ref={arquivo} type="file" accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml" className="hidden" onChange={escolheuArquivo} />
      </div>
      {lendo && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-800"><Loader2 className="w-4 h-4 animate-spin" /> Lendo o documento e conferindo na Receita…</p>}
      {erro && <p className="mt-2 text-xs font-semibold text-rose-700">{erro}</p>}
      {lados && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-semibold text-slate-800">A nota tem duas empresas. Qual você quer cadastrar?</p>
          {lados.map((l) => (
            <button key={l.lado} type="button" onClick={() => void pedir({ lidos: l.lidos })} className="w-full text-left rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs hover:bg-slate-50">
              <b>{l.lado === 'emitente' ? 'Emitente' : 'Destinatário'}:</b> {l.nome || 'sem nome'} — {fmtCnpj(l.cnpj)}
            </button>
          ))}
        </div>
      )}
      {ficha && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5" data-campo="ficha-cadastro">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-900">Confira a ficha {ficha.mei ? '(MEI)' : ''}</p>
            <button type="button" aria-label="Fechar" onClick={() => setFicha(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] text-slate-600 mb-1.5">{ficha.receita.conferida ? `Conferido na Receita (${ficha.receita.fonte}).` : 'Não deu para conferir na Receita agora.'} {ficha.paraConferir ? `${ficha.paraConferir} campo(s) em amarelo para conferir.` : 'Nada para conferir.'}</p>
          {jaCadastrada && <p className="mb-1.5 rounded bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200" data-campo="ficha-ja-cadastrada">{jaCadastrada} A ficha abaixo já traz o que está lá; o documento só completa o que estava vazio.</p>}
          {ficha.avisos.map((a, i) => <p key={i} className="mb-1 flex gap-1 text-[11px] font-semibold text-amber-800"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{a}</p>)}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {ROTULOS.filter(([k]) => ficha.campos[k].valor || ficha.campos[k].conferir).map(([k, rotulo]) => {
              const c = ficha.campos[k];
              const valor = k === 'cnpj' ? fmtCnpj(c.valor) : k === 'cnae' && ficha.campos.cnaeDescricao.valor ? `${c.valor} — ${ficha.campos.cnaeDescricao.valor}` : c.valor;
              return (
                <div key={k} className={`rounded px-1.5 py-1 ${c.conferir ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500">{rotulo}{c.origem ? ` · ${ORIGEM[c.origem]}` : ''}{c.conferir ? ' · conferir' : ''}</dt>
                  <dd className="text-xs font-semibold text-slate-900 break-words">{valor || '(em branco)'}</dd>
                  {c.conferir && c.motivo && <dd className="text-[10px] text-amber-800">{c.motivo}</dd>}
                </div>
              );
            })}
          </dl>
          {ficha.socios.length > 0 && <p className="mt-1 text-[11px] text-slate-700"><b>Sócios:</b> {ficha.socios.map((s) => (s.qualificacao ? `${s.nome} (${s.qualificacao})` : s.nome)).join('; ')}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" data-campo="ficha-aplicar" disabled={!ficha.pronta} onClick={aplicar} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" /> Conferi, preencher o cadastro
            </button>
            <button type="button" onClick={() => setFicha(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Depois de preencher, confira os campos e clique em Salvar. Só então a empresa é gravada (e vai sozinha para os outros sistemas do escritório).</p>
        </div>
      )}
    </div>
  );
};

/** Avisos "conferir" da sincronia: campo diferente entre os sistemas (nada foi trocado). "Já conferi" tira o aviso. */
export const AvisosSincroniaCadastro: React.FC<{ cnpj: string; endpoint?: string }> = ({ cnpj, endpoint = '/api/empresas/divergencias-cadastro' }) => {
  const [avisos, setAvisos] = useState<Array<{ campo: string; texto: string }>>([]);
  const limpo = String(cnpj || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  useEffect(() => {
    if (limpo.length !== 14) { setAvisos([]); return; }
    let ativo = true;
    fetch(`${endpoint}?cnpj=${limpo}`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).then((j) => { if (ativo && j?.sucesso && Array.isArray(j.avisos)) setAvisos(j.avisos); }).catch(() => undefined);
    return () => { ativo = false; };
  }, [limpo, endpoint]);
  if (!avisos.length) return null;
  const dispensar = async (campo: string) => {
    await fetch(`${endpoint}/dispensar`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj: limpo, campo }) }).catch(() => undefined);
    setAvisos((a) => a.filter((x) => x.campo !== campo));
  };
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 space-y-1" data-campo="avisos-sincronia-cadastro">
      <p className="text-xs font-bold text-amber-900">Conferir: este cadastro está diferente em outro sistema do escritório</p>
      {avisos.map((a) => (
        <div key={a.campo} className="flex items-start justify-between gap-2 text-[11px] text-amber-900">
          <span>{a.texto}</span>
          <button type="button" onClick={() => void dispensar(a.campo)} className="shrink-0 rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold">Já conferi</button>
        </div>
      ))}
    </div>
  );
};

/** Nunca duplicar empresa: antes de gravar um cadastro NOVO, pergunta se o CNPJ já está no escritório (aqui ou nos outros sistemas). */
export async function conferirEmpresaJaCadastrada(cnpj: string): Promise<{ local: boolean; outros: Array<{ sistema: string; nome: string; dados: Record<string, string> }>; mensagem: string | null } | null> {
  const limpo = String(cnpj || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== 14) return null;
  try {
    const r = await fetch(`/api/empresas/ja-cadastrada?cnpj=${limpo}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    return r.ok && j?.sucesso ? { local: j.local === true, outros: Array.isArray(j.outros) ? j.outros : [], mensagem: j.mensagem || null } : null;
  } catch { return null; } // fora do ar: não bloqueia (a sincronia junta depois pelo CNPJ)
}
