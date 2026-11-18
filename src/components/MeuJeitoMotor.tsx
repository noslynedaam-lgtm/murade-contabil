// "Meu jeito" em ação (sem tela própria): ao entrar, abre a tela que a pessoa escolheu, conta a abertura no servidor (boas-vindas e
// oferta da apresentação, sem IA), executa as regras que ela ensinou, anota (só nomes de telas) para SUGERIR atalhos e mostra um
// atalho pequeno quando uma regra pede. Nada aqui confirma, lança ou envia por ninguém.
import React, { useEffect, useRef, useState } from 'react';
import { PERGUNTA_APRESENTACAO } from '../data/apresentacaoSistema';
import { IDS_TELAS_JEITO, PERGUNTA_NOME, rotuloDaTela } from '../data/jeitoPadraoContabil';
import { pedirApresentacao } from '../utils/apresentacaoCliente';
import { BufferObservacao, aplicarRitmoDoPiloto, carregarJeito, chamarJeito, efeitosDaRegra, jeitoAtual, regraDoGatilho, type EfeitoRegra } from '../utils/meuJeitoCliente';
import { destacarCampo } from '../utils/destacarCampo';
import { EVENTO_NOME, definirPerguntaDoNomeAberta } from '../utils/nomeCliente';
import type { AssistenteHandle } from '../types/assistenteHandle';

type Props = { tabAtiva: string; onNavegar: (tela: string) => void; assistenteRef: React.MutableRefObject<AssistenteHandle | null>; onEhDono: (v: boolean) => void };
const ATRASO_ABERTURA_MS = 6000;

export const MeuJeitoMotor: React.FC<Props> = ({ tabAtiva, onNavegar, assistenteRef, onEhDono }) => {
  const [atalho, setAtalho] = useState<string | null>(null);
  // Pergunta do nome (primeira entrada): cartão pequeno com campo. As boas-vindas ficam guardadas até a resposta.
  const [perguntaNome, setPerguntaNome] = useState(false);
  const [campoNome, setCampoNome] = useState('');
  const [erroNome, setErroNome] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const avisosDepoisDoNome = useRef<string[]>([]);
  const anterior = useRef<string | null>(null);
  const usuarioNavegou = useRef(false);
  const pronto = useRef(false);
  const buffer = useRef(new BufferObservacao((id) => IDS_TELAS_JEITO.includes(id) && id !== 'meu-jeito'));
  const ultimaRodada = useRef(new Map<string, number>());

  const executar = (efeitos: EfeitoRegra[], atrasoBase = 600) => {
    efeitos.forEach((e, n) => {
      window.setTimeout(() => {
        if (e.tipo === 'atalho') { setAtalho(e.tela); window.setTimeout(() => setAtalho((a) => (a === e.tela ? null : a)), 25_000); }
        else if (e.tipo === 'destacar') destacarCampo(e.texto);
        else assistenteRef.current?.perguntar(e.frase);
      }, atrasoBase + n * 1800);
    });
  };
  const rodarRegra = (g: { tipo: string; tela?: string }) => {
    const r = regraDoGatilho(jeitoAtual()?.receitasAtivas, g); if (!r) return;
    const agora = Date.now(); if (agora - (ultimaRodada.current.get(r.id) ?? 0) < 20_000) return; // evita repetir ao trocar de tela depressa
    ultimaRodada.current.set(r.id, agora);
    executar(efeitosDaRegra(r));
  };

  // Entrada: carrega o jeito, aplica a tela inicial e o ritmo do piloto, roda as regras "ao entrar" e conta a abertura.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const v = await carregarJeito(); if (cancelado) return;
      aplicarRitmoDoPiloto(v, (r) => { try { localStorage.setItem('murade_piloto_ritmo', r); } catch { /* sem armazenamento: o piloto usa o normal */ } });
      const tela = v?.efetivo?.telaInicial;
      if (!usuarioNavegou.current && typeof tela === 'string' && tela !== 'inicio' && IDS_TELAS_JEITO.includes(tela)) onNavegar(tela);
      pronto.current = true; rodarRegra({ tipo: 'entrar_no_sistema' });
    })();
    const t = window.setTimeout(async () => {
      for (let tentativa = 0; tentativa < 8 && !cancelado; tentativa += 1) {
        if (!assistenteRef.current?.ocupado()) break;
        await new Promise((r) => window.setTimeout(r, 2000));
      }
      if (cancelado) return;
      try {
        const d = await chamarJeito<any>('/api/meu-jeito/abrir', 'POST', {});
        onEhDono(d.ehDono === true);
        if (d.perguntarNome) {
          // Primeiro a pergunta (texto fixo, em voz e no cartão); as boas-vindas, a oferta e os avisos saem logo depois da resposta.
          avisosDepoisDoNome.current = (d.avisos || []).map((a: unknown) => String(a));
          definirPerguntaDoNomeAberta(true); setPerguntaNome(true);
          assistenteRef.current?.falar(d.perguntaNome || PERGUNTA_NOME);
          void carregarJeito();
          return;
        }
        const partes: string[] = [];
        if (d.boasVindas) partes.push(d.boasVindas);
        for (const a of d.avisos || []) partes.push(String(a));
        if (!d.boasVindas && d.sugestao?.texto) partes.push(`${d.sugestao.texto} Se quiser, diga: sim, aceito a sugestão do atalho; ou veja em Meu jeito.`);
        if (d.oferecerApresentacao) partes.push(PERGUNTA_APRESENTACAO);
        if (partes.length) assistenteRef.current?.falar(partes.join(' '));
        if (d.oferecerApresentacao) pedirApresentacao({ acao: 'oferta' });
        void carregarJeito();
      } catch { /* sem a abertura contada, tudo o mais funciona igual */ }
    }, ATRASO_ABERTURA_MS);
    return () => { cancelado = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const concluirNome = (r: { frase?: string; boasVindas?: string | null; oferecerApresentacao?: boolean }, falarFrase: boolean) => {
    definirPerguntaDoNomeAberta(false); setPerguntaNome(false); setCampoNome(''); setErroNome('');
    const partes: string[] = [];
    if (falarFrase && r.frase) partes.push(r.frase); else if (r.boasVindas) partes.push(r.boasVindas);
    partes.push(...avisosDepoisDoNome.current); avisosDepoisDoNome.current = [];
    if (r.oferecerApresentacao) partes.push(PERGUNTA_APRESENTACAO);
    if (partes.length) assistenteRef.current?.falar(partes.join(' '));
    if (r.oferecerApresentacao) pedirApresentacao({ acao: 'oferta' });
    void carregarJeito();
  };
  const enviarNome = async (texto: string) => {
    if (salvandoNome) return;
    setSalvandoNome(true); setErroNome('');
    try { concluirNome(await chamarJeito('/api/meu-jeito/nome', 'POST', { nome: texto }), true); }
    catch (e) { const m = e instanceof Error ? e.message : 'Não consegui guardar o nome agora. Tente de novo.'; setErroNome(m); assistenteRef.current?.falar(m); }
    finally { setSalvandoNome(false); }
  };
  const agoraNaoNome = async () => {
    if (salvandoNome) return;
    setSalvandoNome(true);
    try { concluirNome(await chamarJeito('/api/meu-jeito/nome/dispensar', 'POST', {}), false); }
    catch { definirPerguntaDoNomeAberta(false); setPerguntaNome(false); } // sem resposta do servidor: fecha; o resto funciona igual
    finally { setSalvandoNome(false); }
  };
  const enviarNomeRef = useRef(enviarNome); enviarNomeRef.current = enviarNome;
  // A resposta dita ou digitada na conversa chega aqui (nomeCliente.tratarRespostaDoNome), sem IA.
  useEffect(() => {
    const ouvir = (e: Event) => { const n = (e as CustomEvent<{ nome: string }>).detail?.nome; if (n) void enviarNomeRef.current(n); };
    window.addEventListener(EVENTO_NOME, ouvir);
    return () => { window.removeEventListener(EVENTO_NOME, ouvir); definirPerguntaDoNomeAberta(false); };
  }, []);

  // Cada troca de tela: observação (só nomes de telas) e regras "ao abrir esta tela".
  useEffect(() => {
    const de = anterior.current; anterior.current = tabAtiva;
    if (de === null) return;
    usuarioNavegou.current = true;
    if (jeitoAtual()?.efetivo?.observarUso !== false) buffer.current.registrar(de, tabAtiva);
    if (pronto.current) rodarRegra({ tipo: 'abrir_tela', tela: tabAtiva });
    setAtalho((a) => (a === tabAtiva ? null : a));
  }, [tabAtiva]);

  // Entrega as navegações em lotes (a cada minuto e ao sair da página). Servidor ignora se a pessoa desligou a observação.
  useEffect(() => {
    const enviar = () => {
      const pares = buffer.current.esvaziar(); if (!pares.length) return;
      void fetch('/api/meu-jeito/observar', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pares }) }).catch(() => undefined);
    };
    const t = window.setInterval(enviar, 60_000);
    const aoSair = () => { if (document.visibilityState === 'hidden') enviar(); };
    document.addEventListener('visibilitychange', aoSair);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', aoSair); };
  }, []);

  if (perguntaNome) return (
    <div role="dialog" aria-label="Como posso te chamar?" className="fixed bottom-[9rem] left-3 z-[106] w-[min(92vw,360px)] rounded-xl border border-blue-300 bg-white p-3 shadow-2xl">
      <p className="text-sm font-semibold text-slate-900">{PERGUNTA_NOME}</p>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void enviarNome(campoNome); }}>
        <input value={campoNome} onChange={(e) => setCampoNome(e.target.value.slice(0, 60))} aria-label="Seu nome" placeholder="Seu nome" maxLength={60} autoComplete="given-name" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900" />
        <button type="submit" disabled={salvandoNome || !campoNome.trim()} className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Salvar</button>
      </form>
      {erroNome && <p role="alert" className="mt-1 text-xs text-red-700">{erroNome}</p>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Você também pode responder falando.</p>
        <button type="button" onClick={() => void agoraNaoNome()} disabled={salvandoNome} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Agora não</button>
      </div>
    </div>
  );
  if (!atalho || atalho === tabAtiva) return null;
  return (
    <div className="fixed bottom-[5.5rem] left-3 z-[104] flex max-w-[80vw] items-center gap-1 rounded-full border border-blue-300 bg-white py-1 pl-3 pr-1 shadow-xl">
      <button type="button" onClick={() => { const t = atalho; setAtalho(null); onNavegar(t); }} className="text-sm font-bold text-blue-900">Ir para {rotuloDaTela(atalho)}</button>
      <button type="button" onClick={() => setAtalho(null)} aria-label="Dispensar o atalho" className="h-8 w-8 rounded-full text-sm font-bold text-slate-500">×</button>
    </div>
  );
};
