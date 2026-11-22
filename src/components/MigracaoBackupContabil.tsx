import React, { useEffect, useMemo, useRef, useState } from "react";
import { ehBackupCustom, extrairTabelasContabeis, leitoresDoNavegador } from "../utils/leitorBackupCustom";
import { confirmarNaTela } from "../utils/dialogoNaTela";

// Tela "Trazer tudo do sistema anterior (pelo backup)" do Contábil — mesmo jeito do Murade DP:
// escolhe o arquivo .bcir/.backup → o navegador separa só a parte contábil e envia → lista as empresas →
// "Transportar tudo" ou "Não, quero escolher" → prévia (nada gravado) → confirmar → o arquivo é apagado do servidor.

type EmpresaLista = { cdempresa: number; nome: string; cnpj: string; ativa: boolean | null; semCadastro: boolean; temPlano: boolean; temLancamentos: boolean };
type Previa = {
  cdempresa: number; nome: string; cnpj: string; semCadastroNoBackup: boolean; podeGravar: boolean; motivo?: string; excluidaAntes: boolean; jaExisteNoMurade: boolean;
  lidos: Record<string, number>; contas: number; contasNovas: number; contasAtualizadas: number; contasDoModeloRetiradas: number; historicos: number; historicosNovos: number;
  lancamentos: number; lancamentosSubstituidos: number; lancamentosDaEquipe: number; naoEntraram: number; blocos: Array<{ bloco: string; quantidade: number }>;
  periodo: string; conferencia: string; bate: boolean; totalAvisos: number; avisos: string[]; ajustesMigracaoLancados?: number; desfazerAjustes?: boolean;
};
type Resultado = { cdempresa: number; cnpj: string; gravado: boolean; motivo?: string; lancamentos: number; contas: number; conferencia?: string; bate?: boolean };

const LOTE = 10;
const formatarCnpj = (c: string) => /^\d{14}$/.test(c) ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c;

async function chamar(url: string, corpo: unknown): Promise<any> {
  const r = await fetch(url, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.sucesso === false) throw new Error(j?.motivo || "Não foi possível concluir esta etapa.");
  return j;
}

async function converterBackupNoNavegador(arquivo: File, aoAvancar: (texto: string) => void): Promise<File | null> {
  const inicio = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
  if (!ehBackupCustom(inicio)) return null;
  const { ler, descompactar } = leitoresDoNavegador(arquivo);
  aoAvancar("Abrindo o backup neste aparelho (nada sai daqui ainda)…");
  const r = await extrairTabelasContabeis(ler, arquivo.size, descompactar, (feito, total) => aoAvancar(`Separando a parte contábil… ${Math.min(100, Math.round((feito / Math.max(1, total)) * 100))}%`));
  return new File(r.partes as BlobPart[], "backup_contabil_sistema_anterior.sql", { type: "text/plain" });
}

async function prepararCorpo(arquivo: File): Promise<{ corpo: Blob; compactado: boolean }> {
  const CS: any = (globalThis as any).CompressionStream;
  if (CS && arquivo.size < 300 * 1024 * 1024) {
    try { return { corpo: await new Response(arquivo.stream().pipeThrough(new CS("gzip"))).blob(), compactado: true }; } catch { /* envia sem compactar */ }
  }
  return { corpo: arquivo, compactado: false };
}

export const MigracaoBackupContabil: React.FC<{ aoTerminar?: () => void }> = ({ aoTerminar }) => {
  const [etapa, setEtapa] = useState<"inicio" | "enviado" | "previa" | "pronto">("inicio");
  const [token, setToken] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaLista[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [cnpjs, setCnpjs] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [previas, setPrevias] = useState<Previa[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [umaAUma, setUmaAUma] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  const comCnpj = empresas.filter((e) => !e.semCadastro);
  const semCnpj = empresas.filter((e) => e.semCadastro);

  const enviar = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro(""); setOcupado("Preparando o arquivo…");
    try {
      const convertido = await converterBackupNoNavegador(arquivo, setOcupado);
      setOcupado("Enviando só a parte contábil…");
      const { corpo, compactado } = await prepararCorpo(convertido || arquivo);
      const r = await fetch(`/api/migracao-sistema-anterior/arquivo${compactado ? "?compactado=gzip" : ""}`, { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/octet-stream" }, body: corpo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.sucesso) throw new Error(j?.motivo || "Não foi possível enviar o arquivo.");
      setToken(j.token);
      setOcupado("Lendo as empresas do arquivo…");
      const l = await chamar("/api/migracao-sistema-anterior/empresas", { token: j.token });
      setEmpresas(l.empresas || []); setMarcadas(new Set()); setCnpjs({}); setEtapa("enviado");
    } catch (e: any) { setErro(e?.message || "Falha ao enviar."); }
    finally { setOcupado(""); if (seletor.current) seletor.current.value = ""; }
  };

  const gerarPrevia = async (todas: boolean) => {
    setErro("");
    const cds = todas ? comCnpj.map((e) => e.cdempresa) : [...marcadas];
    if (!cds.length) { setErro("Marque ao menos uma empresa."); return; }
    const faltaCnpj = cds.filter((cd) => semCnpj.some((e) => e.cdempresa === cd) && !String(cnpjs[cd] || "").replace(/\D/g, ""));
    if (faltaCnpj.length) { setErro("Digite o CNPJ das empresas marcadas que não têm cadastro no sistema anterior."); return; }
    setUmaAUma(!todas);
    setOcupado("Conferindo os dados (nada é gravado ainda)…");
    try {
      const todos: Previa[] = [];
      for (let i = 0; i < cds.length; i += LOTE) {
        setOcupado(`Conferindo os dados (nada é gravado ainda)… ${Math.min(cds.length, i + LOTE)} de ${cds.length}`);
        const r = await chamar("/api/migracao-sistema-anterior/previa", { token, cdempresas: cds.slice(i, i + LOTE), cnpjs, desfazerAjustes: [...desfazer] });
        todos.push(...(r.empresas || []));
      }
      setPrevias(todos); setEtapa("previa");
    } catch (e: any) { setErro(e?.message || "Falha ao conferir."); }
    finally { setOcupado(""); }
  };

  // Remigração com ajuste de migração lançado: o contador escolhe desfazer (estorno) e migrar de novo, ou cancelar.
  const [desfazer, setDesfazer] = useState<Set<number>>(new Set());
  const desfazerEMigrar = async (cd: number, n: number) => {
    if (!(await confirmarNaTela(`Desfazer os ${n} ajuste(s) de migração desta empresa (vou lançar o estorno de cada um; os originais continuam no Diário) e migrar de novo? Depois de gravar, a análise do que veio é refeita.`))) return;
    const lista = new Set(desfazer); lista.add(cd); setDesfazer(lista);
    setOcupado("Conferindo de novo esta empresa (nada é gravado ainda)…");
    try {
      const r = await chamar("/api/migracao-sistema-anterior/previa", { token, cdempresas: [cd], cnpjs, desfazerAjustes: [...lista] });
      const nova = (r.empresas || [])[0];
      if (nova) setPrevias((ps) => ps.map((x) => (x.cdempresa === cd ? nova : x)));
    } catch (e: any) { setErro(e?.message || "Falha ao conferir."); } finally { setOcupado(""); }
  };
  const cancelarEmpresa = (cd: number) => { setPrevias((ps) => ps.filter((x) => x.cdempresa !== cd)); setMarcadas((m) => { const n = new Set(m); n.delete(cd); return n; }); };
  const gravaveis = previas.filter((p) => p.podeGravar && (umaAUma || !p.excluidaAntes));
  const gravar = async () => {
    setErro("");
    try {
      const cds = gravaveis.map((p) => p.cdempresa);
      const todos: Resultado[] = [];
      for (let i = 0; i < cds.length; i += LOTE) {
        setOcupado(`Gravando as empresas… ${Math.min(cds.length, i + LOTE)} de ${cds.length}. Não feche esta tela.`);
        const r = await chamar("/api/migracao-sistema-anterior/gravar", { token, cdempresas: cds.slice(i, i + LOTE), escolhidasUmaAUma: umaAUma });
        todos.push(...(r.resultados || []));
      }
      setResultados(todos); setEtapa("pronto");
    } catch (e: any) { setErro(e?.message || "Falha ao gravar."); }
    finally { setOcupado(""); }
  };

  const recomecar = async () => {
    if (token) await chamar("/api/migracao-sistema-anterior/descartar", { token }).catch(() => undefined);
    setToken(""); setEmpresas([]); setPrevias([]); setResultados([]); setEscolhendo(false); setErro(""); setEtapa("inicio");
  };

  const totais = useMemo(() => gravaveis.reduce((t, p) => ({ l: t.l + p.lancamentos, c: t.c + p.contas }), { l: 0, c: 0 }), [gravaveis]);
  const gravadas = resultados.filter((r) => r.gravado);

  return (
    <section data-campo="migracao-backup-sistema-anterior" className="space-y-4 rounded-xl border-2 border-blue-600 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-sm font-black text-slate-900">Trazer tudo do sistema anterior (pelo backup)</h2>
        <p className="mt-1 text-xs text-slate-600">Traz de uma vez, de todas as empresas: plano de contas, históricos padrão, todos os lançamentos (com lote e documento) e confere o balancete com os saldos do sistema anterior. O resto (lotes abertos, títulos, cartões, bens, configurações) fica guardado para consulta. Nada é gravado antes de você conferir.</p>
      </div>

      {erro && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{erro}</div>}
      {ocupado && <div role="status" className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">{ocupado}</div>}

      {etapa === "inicio" && (
        <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-slate-800">
          <div className="text-sm font-bold">Escolha o arquivo de backup do sistema anterior</div>
          <p>É o arquivo que termina em <b>.bcir</b> ou <b>.backup</b> (o maior e mais novo da pasta de backups). Toque no botão verde <b>“Escolher o arquivo de backup”</b> e escolha o arquivo: este aparelho separa só a parte contábil e envia. Não pede senha nem instala nada.</p>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700">
            Escolher o arquivo de backup
            <input ref={seletor} type="file" accept=".bcir,.backup,.sql,.gz,.txt" className="hidden" disabled={!!ocupado} onChange={(e) => void enviar(e.target.files?.[0])} />
          </label>
          <p className="text-slate-500">Leva de segundos a poucos minutos. O arquivo enviado é apagado do servidor assim que a migração termina (ou em até 2 horas). Use o Chrome ou o Edge atualizados.</p>
        </div>
      )}

      {etapa === "enviado" && (
        <div className="space-y-3 text-xs text-slate-800">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
            Arquivo lido: <b>{empresas.length}</b> empresa(s) com parte contábil — <b>{comCnpj.length}</b> com CNPJ{semCnpj.length ? <> e <b>{semCnpj.length}</b> que não têm mais cadastro no sistema anterior (só entram se você digitar o CNPJ)</> : null}.
          </div>
          {!escolhendo ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!ocupado || !comCnpj.length} onClick={() => void gerarPrevia(true)} className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Transportar tudo: todas as {comCnpj.length} empresas com CNPJ</button>
              <button type="button" disabled={!!ocupado} onClick={() => setEscolhendo(true)} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-100">Não, quero escolher</button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-bold">Marque as empresas (caixinha à esquerda do nome):</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setMarcadas(new Set(comCnpj.map((e) => e.cdempresa)))} className="min-h-[40px] rounded border border-slate-300 bg-white px-3 font-semibold">Marcar todas com CNPJ</button>
                <button type="button" onClick={() => setMarcadas(new Set())} className="min-h-[40px] rounded border border-slate-300 bg-white px-3 font-semibold">Desmarcar todas</button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded border border-slate-200 bg-white">
                {empresas.map((e) => (
                  <div key={e.cdempresa} className="border-b border-slate-100 px-2 py-1">
                    <label className="flex min-h-[40px] items-center gap-2">
                      <input type="checkbox" checked={marcadas.has(e.cdempresa)} onChange={(ev) => setMarcadas((m) => { const n = new Set(m); if (ev.target.checked) n.add(e.cdempresa); else n.delete(e.cdempresa); return n; })} />
                      <span className="flex-1">{e.nome}{e.cnpj ? <span className="text-slate-500"> — {formatarCnpj(e.cnpj)}</span> : null}</span>
                      <span className="text-slate-500">{e.semCadastro ? "sem cadastro lá" : e.ativa === false ? "inativa" : "ativa"}{e.temLancamentos ? "" : " • só plano"}</span>
                    </label>
                    {e.semCadastro && marcadas.has(e.cdempresa) && (
                      <label className="ml-6 flex flex-wrap items-center gap-2 pb-1">
                        <span>CNPJ desta empresa:</span>
                        <input inputMode="numeric" value={cnpjs[e.cdempresa] || ""} onChange={(ev) => setCnpjs((c) => ({ ...c, [e.cdempresa]: ev.target.value }))} placeholder="00.000.000/0000-00" className="min-h-[40px] w-48 rounded border border-slate-300 px-2" />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!!ocupado || !marcadas.size} onClick={() => void gerarPrevia(false)} className="min-h-[44px] rounded-lg bg-[#0F2B5B] px-4 py-2 font-bold text-white hover:bg-blue-900 disabled:opacity-50">Conferir o que vai ser trazido ({marcadas.size})</button>
                <button type="button" onClick={() => setEscolhendo(false)} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-100">Voltar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {etapa === "previa" && (
        <div className="space-y-3 text-xs text-slate-800">
          <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-blue-900">
            Conferido, <b>nada foi gravado ainda</b>. Vai ser trazido: <b>{gravaveis.length}</b> empresa(s), <b>{totais.c}</b> contas e <b>{totais.l}</b> lançamentos. Os lançamentos entram já valendo no balancete (eram definitivos no sistema anterior) e ficam marcados como “Sistema anterior”; os lançamentos feitos no Murad não mudam.
          </div>
          <div className="max-h-[28rem] overflow-y-auto rounded border border-slate-200">
            {previas.map((p) => {
              const fora = !p.podeGravar || (!umaAUma && p.excluidaAntes);
              return (
                <div key={p.cdempresa} className={`border-b border-slate-100 px-3 py-2 ${fora ? "bg-amber-50" : ""}`}>
                  <div className="font-bold">{p.nome} <span className="font-normal text-slate-500">{formatarCnpj(p.cnpj)}</span>{p.jaExisteNoMurade ? <span className="ml-1 rounded bg-slate-200 px-1 font-normal">já existe no Murad: junta sem apagar nada da equipe</span> : null}</div>
                  {fora ? (
                    <>
                      <div className="text-amber-900">Não entra agora: {!p.podeGravar ? p.motivo : 'esta empresa foi excluída antes. Para trazer de volta, use "Não, quero escolher" e marque ela uma por uma.'}</div>
                      {!p.podeGravar && (p.ajustesMigracaoLancados || 0) > 0 && (
                        <div data-campo="remigrar-ajustes" className="mt-1 flex flex-wrap gap-2">
                          <button type="button" disabled={!!ocupado} onClick={() => void desfazerEMigrar(p.cdempresa, p.ajustesMigracaoLancados || 0)} className="min-h-[40px] rounded border border-amber-500 bg-white px-3 font-bold text-amber-900 disabled:opacity-50">Desfazer os ajustes e migrar de novo</button>
                          <button type="button" disabled={!!ocupado} onClick={() => cancelarEmpresa(p.cdempresa)} className="min-h-[40px] rounded border border-slate-300 bg-white px-3 disabled:opacity-50">Cancelar</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-slate-700">{p.contas} contas ({p.contasNovas} novas{p.contasAtualizadas ? `, ${p.contasAtualizadas} ajustadas` : ""}{p.contasDoModeloRetiradas ? `, ${p.contasDoModeloRetiradas} do modelo sem uso trocadas pelo plano real` : ""}) • {p.historicos} históricos padrão ({p.historicosNovos} novos) • <b>{p.lancamentos}</b> lançamentos{p.periodo ? ` de ${p.periodo}` : ""}{p.lancamentosSubstituidos ? ` (substituem ${p.lancamentosSubstituidos} de uma migração anterior)` : ""}{p.lancamentosDaEquipe ? ` • ${p.lancamentosDaEquipe} lançamento(s) da equipe ficam como estão` : ""}</div>
                      {p.desfazerAjustes && (p.ajustesMigracaoLancados || 0) > 0 && <div className="text-amber-900">Os {p.ajustesMigracaoLancados} ajuste(s) de migração desta empresa vão ser estornados antes de gravar; depois a análise é refeita.</div>}
                      <div className={p.bate ? "text-emerald-800" : "text-red-700"}>Conferência: {p.conferencia}</div>
                      {p.naoEntraram > 0 && <div className="text-red-700">{p.naoEntraram} linha(s) do arquivo não viram lançamento (ficam guardadas com o motivo).</div>}
                      <div className="text-slate-500">Guardado para consulta: {p.blocos.map((b) => `${b.bloco.replace(/_/g, " ")} (${b.quantidade})`).join(" • ")}</div>
                      {p.avisos.length > 0 && <details className="text-slate-600"><summary className="cursor-pointer">{p.totalAvisos} aviso(s)</summary><ul className="list-disc pl-5">{p.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!ocupado || !gravaveis.length} onClick={() => void gravar()} className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Confirmar e gravar agora ({gravaveis.length})</button>
            <button type="button" disabled={!!ocupado} onClick={() => setEtapa("enviado")} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-100">Voltar</button>
          </div>
        </div>
      )}

      {etapa === "pronto" && (
        <div className="space-y-3 text-xs text-slate-800">
          <div className={`rounded-lg border px-3 py-2 ${gravadas.length === resultados.length ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            {gravadas.length} de {resultados.length} empresa(s) gravada(s), com {gravadas.reduce((s, r) => s + r.lancamentos, 0)} lançamentos. {token ? "" : "O arquivo enviado já foi apagado do servidor."}
          </div>
          <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
            {resultados.map((r) => (
              <div key={r.cdempresa} className="border-b border-slate-100 px-3 py-2">
                <span className="font-bold">{previas.find((p) => p.cdempresa === r.cdempresa)?.nome || `Empresa ${r.cdempresa}`}</span> — {r.gravado ? `gravada (${r.contas} contas, ${r.lancamentos} lançamentos)` : `NÃO gravada: ${r.motivo || "motivo não informado"}`}
                {r.gravado && r.conferencia && <div className={r.bate ? "text-emerald-800" : "text-red-700"}>Conferência depois de gravar: {r.conferencia}</div>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { aoTerminar?.(); }} className="min-h-[44px] rounded-lg bg-[#0F2B5B] px-4 py-2 font-bold text-white hover:bg-blue-900">Atualizar e abrir as empresas</button>
            <button type="button" onClick={() => void recomecar()} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold text-slate-800 hover:bg-slate-100">Fazer outra migração</button>
          </div>
        </div>
      )}

      {etapa !== "inicio" && etapa !== "pronto" && (
        <button type="button" onClick={() => void recomecar()} className="text-xs text-slate-500 underline">Cancelar e apagar o arquivo enviado</button>
      )}
    </section>
  );
};

type PendenciaCampo = { grupo: string; item: string; rotulo: string; origem: string; noSistemaAnterior: string; noMurade: string; tipo: "faltou" | "diferente" };
type RegistroResposta = {
  resumo: any | null; blocos: Array<{ bloco: string; quantidade: number }>; conferencia: { resumo: string; bate: boolean; diferencas: any[] } | null;
  campos?: { resumo: string; totalPendencias: number; pendencias: PendenciaCampo[] } | null;
  analise?: { resumo: string; achados: Achado[] } | null;
};
type Achado = {
  id: string; tipo: "corrigido" | "conferir" | "verificar" | "ajuste"; situacao: string; titulo: string; veio: string; certo: string; base: string;
  alvo?: { tipo: string; campo: string; codigo?: string; quantidade?: number }; ajuste?: { contaDebito: string; contaCredito: string; valorCentavos: number; historico: string; data: string };
};
const SITUACAO: Record<string, string> = { corrigido: "corrigido", desfeito: "desfeito (como veio)", alterado: "alterado pela equipe", pendente: "esperando o contador", aceito: "aceito", mantido: "mantido como veio", lancado: "ajuste lançado" };

/** Análise do que veio errado: corrigidos (Desfazer / Corrigir agora), para conferir (Aceitar / Manter) e ajustes (Sim, lançar / Desfazer). Um por vez. */
const AnaliseMigracao: React.FC<{ cnpj: string; analise: { resumo: string; achados: Achado[] }; aoMudar: () => void }> = ({ cnpj, analise, aoMudar }) => {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState("");
  const agir = async (a: Achado | null, acao: string, pergunta: string) => {
    if (ocupado || !(await confirmarNaTela(pergunta))) return;
    setOcupado(a?.id || acao); setMsg("");
    try {
      const r = await fetch(`/api/migracao-sistema-anterior/registro/${encodeURIComponent(cnpj)}/achado`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a?.id || "", acao }) });
      const j = await r.json().catch(() => ({}));
      setMsg(j?.sucesso ? String(j.mensagem || "Feito.") : String(j?.motivo || "Não foi possível."));
      if (j?.sucesso) { aoMudar(); window.dispatchEvent(new CustomEvent("murade-workspace-alterado", { detail: { cnpj } })); }
    } catch { setMsg("Sem conexão; nada foi alterado."); } finally { setOcupado(""); }
  };
  const desfeitos = analise.achados.filter((a) => a.tipo === "corrigido" && a.situacao === "desfeito").length;
  const pendentes = analise.achados.filter((a) => a.situacao === "pendente").length;
  return (
    <div data-campo="analise-migracao-sistema-anterior" className="space-y-1">
      <p className={pendentes ? "text-amber-800" : "text-emerald-800"}>{analise.resumo}</p>
      {analise.achados.length > 0 && <button type="button" onClick={() => setAberto((v) => !v)} className="min-h-[40px] rounded border border-amber-300 bg-amber-50 px-3 text-amber-900">{aberto ? "Fechar a análise" : `Ver a análise (${analise.achados.length} item(ns))`}</button>}
      {msg && <p role="status" className="text-slate-700">{msg}</p>}
      {aberto && (
        <div className="space-y-2">
          {desfeitos > 0 && <button type="button" disabled={!!ocupado} onClick={() => void agir(null, "corrigir_todos", `Corrigir agora as ${desfeitos} correção(ões) automática(s) desfeita(s)? Só muda formatação (espaços nas pontas, zero do CPF, bairro completo); valores não mudam.`)} className="min-h-[40px] rounded border border-blue-400 bg-blue-50 px-3 text-blue-900 disabled:opacity-40">Corrigir agora</button>}
          <ul className="max-h-96 space-y-2 overflow-auto">
            {analise.achados.map((a) => (
              <li key={a.id} className="rounded border border-slate-200 p-2">
                <div className="font-bold text-slate-900">{a.tipo === "corrigido" ? "Corrigido sozinho" : a.tipo === "ajuste" ? "Ajuste do balancete" : a.tipo === "verificar" ? "Verificar" : "Para o contador conferir"} · {a.titulo} <span className="font-normal text-slate-500">({SITUACAO[a.situacao] || a.situacao})</span></div>
                <div><span className="text-slate-500">O backup veio assim:</span> <span className="break-words">{a.veio}</span></div>
                <div><span className="text-slate-500">{a.tipo === "corrigido" ? "Corrigido para:" : a.tipo === "verificar" ? "O que ver:" : "O certo:"}</span> <span className="break-words">{a.certo}</span></div>
                <div className="text-[11px] text-slate-500">Base: {a.base}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {a.tipo === "corrigido" && a.situacao === "corrigido" && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "desfazer", `Desfazer esta correção e deixar como veio do sistema anterior?\n${a.titulo}: ${a.veio}`)} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Desfazer</button>}
                  {a.tipo === "corrigido" && a.situacao !== "corrigido" && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "corrigir", `Corrigir agora?\n${a.titulo}: ${a.certo}`)} className="min-h-[40px] rounded border border-blue-400 px-3 disabled:opacity-40">Corrigir agora</button>}
                  {(a.tipo === "conferir" || a.tipo === "verificar") && a.situacao === "pendente" && a.alvo && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "aceitar", `Aceitar a sugestão e corrigir?\n${a.titulo}: ${a.certo}\nBase: ${a.base}`)} className="min-h-[40px] rounded border border-blue-400 px-3 disabled:opacity-40">Aceitar e corrigir</button>}
                  {(a.tipo === "conferir" || a.tipo === "verificar") && a.situacao === "pendente" && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "manter", `Manter como veio do sistema anterior (marcar como conferido por você)?\n${a.titulo}`)} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Manter como veio</button>}
                  {a.tipo === "ajuste" && a.situacao === "pendente" && a.ajuste && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "lancar_ajuste", `Quer que eu ajuste?\nVou lançar: D ${a.ajuste!.contaDebito} / C ${a.ajuste!.contaCredito} — ${(a.ajuste!.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${a.ajuste!.data.split("-").reverse().join("/")}\nHistórico: ${a.ajuste!.historico}`)} className="min-h-[40px] rounded border border-emerald-500 bg-emerald-50 px-3 text-emerald-900 disabled:opacity-40">Sim, lançar o ajuste</button>}
                  {a.tipo === "ajuste" && a.situacao === "pendente" && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "manter", `Deixar sem ajuste por enquanto?\n${a.titulo}`)} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Não ajustar</button>}
                  {a.tipo === "ajuste" && a.situacao === "lancado" && <button type="button" disabled={!!ocupado} onClick={() => void agir(a, "desfazer_ajuste", `Desfazer o ajuste? Vou lançar o estorno (o lançamento continua no Diário, com a partida invertida).`)} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Desfazer (estorno)</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const NOMES: Record<string, string> = {
  plano_contas: "Plano de contas original", historicos_padrao: "Históricos padrão", lotes: "Lotes", lancamentos_originais: "Lançamentos originais (linha a linha)",
  saldos: "Saldos por conta e data", lancamentos_lote_aberto: "Lançamentos em lote aberto (não efetivados lá)", lancamentos_automaticos: "Lançamentos automáticos",
  lancamentos_automaticos_contas: "Contas dos lançamentos automáticos", titulos: "Títulos", titulos_baixas: "Baixas de títulos", titulos_provisao: "Provisões de títulos",
  cartao_estabelecimentos: "Cartão de crédito — estabelecimentos", cartao_movimentos: "Cartão de crédito — movimentos", identificador_sequencial: "Numeração dos lançamentos",
  ecf_linhas_contas: "ECF — contas por linha", ecf_configuracao_contas: "ECF — configuração das contas", demonstracoes_configuracao: "Demonstrações — configuração",
  demonstracoes_modelos: "Demonstrações — modelos", demonstracoes_modelos_analise: "Demonstrações — grupos", contador: "Contador", empresa_contabil: "Configuração contábil da empresa",
  plano_cadastro: "Cadastro do plano", imobilizado_empresa: "Imobilizado — configuração", imobilizado_configuracao: "Imobilizado — método por ano", imobilizado_bens: "Imobilizado — bens",
  cadastro_empresa: "Cadastro da empresa", socios_empresa: "Sócios da empresa", socios: "Cadastro dos sócios", municipio: "Município (IBGE)",
  cadastro_historico_cnae: "Histórico de CNAE", historico_nire: "Histórico de NIRE", historico_retencao: "Retenção do IR dos sócios", trava_contabil: "Data de trava",
  textos_assinatura: "Modelos de assinatura", cartao_operadoras: "Cartão — operadoras",
};

/** Consulta do que veio do sistema anterior para a empresa aberta (só leitura). */
export const RegistroSistemaAnterior: React.FC<{ cnpj: string }> = ({ cnpj }) => {
  const c = String(cnpj || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [dados, setDados] = useState<RegistroResposta | null>(null);
  const [aberto, setAberto] = useState<{ bloco: string; desde: number; total: number; linhas: any[] } | null>(null);
  const [erro, setErro] = useState("");
  const [verCampos, setVerCampos] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  useEffect(() => {
    let vivo = true; if (!recarregar) { setDados(null); setVerCampos(false); } setAberto(null); setErro("");
    if (c.length !== 14) return;
    fetch(`/api/migracao-sistema-anterior/registro/${encodeURIComponent(c)}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (vivo && j?.sucesso) setDados(j); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [c, recarregar]);
  const abrir = async (bloco: string, desde = 0) => {
    setErro("");
    try {
      const r = await fetch(`/api/migracao-sistema-anterior/registro/${encodeURIComponent(c)}/bloco/${encodeURIComponent(bloco)}?desde=${desde}&limite=50`, { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.sucesso) throw new Error(j?.motivo || "Não foi possível abrir.");
      setAberto({ bloco, desde, total: j.total, linhas: j.linhas || [] });
    } catch (e: any) { setErro(e?.message || "Não foi possível abrir."); }
  };
  if (!dados?.resumo) return null;
  const colunas = aberto?.linhas.length ? Object.keys(aberto.linhas[0]).slice(0, 14) : [];
  return (
    <section data-campo="registro-sistema-anterior" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-800 shadow-sm">
      <h3 className="text-sm font-black text-slate-900">O que veio do sistema anterior para esta empresa</h3>
      <p>Migrada em {new Date(dados.resumo.migradoEm).toLocaleString("pt-BR")} por {dados.resumo.migradoPor}: {dados.resumo.lancamentosGravados} lançamento(s) no balancete.</p>
      {dados.conferencia && <p className={dados.conferencia.bate ? "text-emerald-800" : "text-red-700"}>Conferência de agora: {dados.conferencia.resumo}</p>}
      {dados.analise && <AnaliseMigracao cnpj={c} analise={dados.analise} aoMudar={() => setRecarregar((n) => n + 1)} />}
      {dados.campos && (
        <div data-campo="conferencia-campos-sistema-anterior" className="space-y-1">
          <p className={dados.campos.totalPendencias ? "text-red-700" : "text-emerald-800"}>{dados.campos.resumo}</p>
          {dados.campos.totalPendencias > 0 && <button type="button" onClick={() => setVerCampos((v) => !v)} className="min-h-[40px] rounded border border-red-300 bg-red-50 px-3 text-red-800">{verCampos ? "Fechar a lista de campos" : `Ver os ${dados.campos.totalPendencias} campo(s) que faltam ou estão diferentes`}</button>}
          {verCampos && (
            <div className="max-h-80 overflow-auto rounded border border-slate-200">
              <table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-1">Onde</th><th className="p-1">Campo</th><th className="p-1">No sistema anterior</th><th className="p-1">No Murad</th></tr></thead>
                <tbody>{dados.campos.pendencias.map((x, i) => <tr key={i} className="border-t border-slate-100 align-top"><td className="p-1">{x.item}</td><td className="p-1">{x.rotulo}{x.tipo === "faltou" ? " (vazio)" : " (diferente)"}</td><td className="max-w-[14rem] break-words p-1">{x.noSistemaAnterior}</td><td className="max-w-[14rem] break-words p-1">{x.noMurade || "—"}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {dados.blocos.map((b) => <button key={b.bloco} type="button" onClick={() => void abrir(b.bloco)} className={`min-h-[40px] rounded border px-3 ${aberto?.bloco === b.bloco ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"}`}>{NOMES[b.bloco] || b.bloco} ({b.quantidade})</button>)}
      </div>
      {erro && <div role="alert" className="text-red-700">{erro}</div>}
      {aberto && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-left text-[11px]"><thead className="bg-slate-100"><tr>{colunas.map((k) => <th key={k} className="p-1">{k}</th>)}</tr></thead>
              <tbody>{aberto.linhas.map((l, i) => <tr key={i} className="border-t border-slate-100">{colunas.map((k) => <td key={k} className="max-w-[16rem] truncate p-1">{l[k] === null || l[k] === undefined ? "" : String(l[k])}</td>)}</tr>)}</tbody></table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Linhas {aberto.desde + 1} a {Math.min(aberto.total, aberto.desde + aberto.linhas.length)} de {aberto.total}</span>
            <button type="button" disabled={aberto.desde === 0} onClick={() => void abrir(aberto.bloco, Math.max(0, aberto.desde - 50))} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Anteriores</button>
            <button type="button" disabled={aberto.desde + 50 >= aberto.total} onClick={() => void abrir(aberto.bloco, aberto.desde + 50)} className="min-h-[40px] rounded border border-slate-300 px-3 disabled:opacity-40">Próximas</button>
            <button type="button" onClick={() => setAberto(null)} className="min-h-[40px] rounded border border-slate-300 px-3">Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
};
