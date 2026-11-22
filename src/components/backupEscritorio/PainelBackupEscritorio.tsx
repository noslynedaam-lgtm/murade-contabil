import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { perguntar, perguntarDuasVezes } from './perguntaNaTela';
import { escolherPasta, esquecerPasta, estadoPasta, liberarPasta, pastaSuportada, sincronizarPasta, type EstadoPasta } from './pastaBackup';
import { CampoData } from '../CampoData';

// Tela "Backup" do escritório — igual nos três sistemas Murade (muda só o endereço da API e o nome do sistema).
// Tudo aqui é do escritório de quem está logado; o servidor filtra pelo escritório em cada consulta.

type Tipo = 'completo' | 'alteracoes';
interface Perfil { id: string; nome: string; tipo: Tipo; frequencia: 'diario' | 'semanal' | 'mensal'; diaSemana?: number; diaMes?: number; hora: string; ativo: boolean; criadoEm: string; descricao?: string; proximo?: string | null }
interface Nuvem { tipo: 's3'; endpoint: string; bucket: string; regiao: string; pasta: string; chaveAcessoMascarada: string; ativo: boolean }
interface Config { perfis: Perfil[]; retencaoCompletos: number; diasAlteracoes: number; validar: boolean; avisos: { aoEntrar: boolean; aoSair: boolean; diasSemBackup: number; usuarios: 'todos' | string[] }; email: { aoConcluir: boolean; aoErrar: boolean; para: string[]; cc: string[] }; pastaComputador: boolean; nuvem: Nuvem | null }
interface Execucao { id: string; tipo: Tipo; origem: string; usuario: string | null; iniciadoEm: string; concluidoEm: string | null; status: 'executando' | 'ok' | 'falha'; validado: boolean; validacao: string | null; tamanhoBytes: number; nomeArquivo: string | null; temArquivo: boolean; removidoEm: string | null; nuvem: { status: string; erro: string | null; removidoEm: string | null }; salvoNaPastaEm: string | null; erro: string | null; observacao: string | null; contagens: Record<string, number> }
interface Mensal { id: string; periodo: string; criadoEm: string; tamanhoBytes: number; ok: boolean }
interface Resumo { chaveConfigurada: boolean; config: Config; perfis: Perfil[]; ultimo: { em: string; origem: string; tipo: string } | null; diasDesdeUltimo: number | null; emAndamento: { desde: string; tipo: string } | null; proximo: { quando: string; descricao: string } | null; voce: { login: string; administrador: boolean; equipe: boolean } }
interface ItemPrevia { nome: string; titulo: string; modo: string; noBackup: number; iguais: number; alterar: number; recriar: number; ficamComoEstao: number; foraDoEscritorio?: number; observacao?: string }
interface Previa { token: string; expiraEmMin: number; backup: { origem: string; tipo: string; criadoEm: string }; itens: ItemPrevia[]; naoRestauradas: Array<{ titulo: string; motivo: string }>; totalMudancas: number }

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const tamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ORIGENS: Record<string, string> = { agendado: 'Agendado (robô)', manual: 'Manual', agente: 'Agente IA', antes_restaurar: 'Cópia antes de restaurar', conferidor: 'Robô conferidor', mensal: 'Mensal automático' };
const NUVENS = [
  { id: 'b2', nome: 'Backblaze B2', endpoint: 'https://s3.us-west-004.backblazeb2.com', regiao: 'us-west-004', dica: 'No B2: Buckets > Create a Bucket (privado). Depois App Keys > Add a New Application Key com acesso a esse bucket. O endereço (Endpoint) aparece na página do bucket.' },
  { id: 'r2', nome: 'Cloudflare R2', endpoint: 'https://<ID-DA-CONTA>.r2.cloudflarestorage.com', regiao: 'auto', dica: 'No R2: Create bucket. Depois Manage R2 API Tokens > Create API token (Object Read & Write). Troque <ID-DA-CONTA> pelo ID da sua conta.' },
  { id: 'aws', nome: 'Amazon S3', endpoint: 'https://s3.sa-east-1.amazonaws.com', regiao: 'sa-east-1', dica: 'Na AWS: crie o bucket (bloqueio de acesso público ligado) e um usuário IAM só com permissão nesse bucket; use a Access Key dele.' },
  { id: 'wasabi', nome: 'Wasabi', endpoint: 'https://s3.sa-saopaulo-1.wasabisys.com', regiao: 'sa-saopaulo-1', dica: 'No Wasabi: crie o bucket e uma Access Key em Access Keys.' },
  { id: 'outro', nome: 'Outro compatível com S3', endpoint: 'https://', regiao: 'us-east-1', dica: 'Qualquer serviço compatível com S3: informe o endereço, a região, o bucket e as chaves que o serviço fornece.' },
];

async function chamar(url: string, metodo = 'GET', corpo?: unknown): Promise<any> {
  const r = await fetch(url, { method: metodo, credentials: 'include', cache: 'no-store', headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.sucesso === false) throw new Error(d?.motivo || d?.mensagem || 'Não foi possível agora. Tente de novo em instantes.');
  return d;
}

const Cartao: React.FC<{ titulo: string; children: React.ReactNode; extra?: React.ReactNode }> = ({ titulo, children, extra }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black text-[#0F2B5B]">{titulo}</h2>{extra}</div>
    {children}
  </section>
);
const Botao: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { forte?: boolean; perigo?: boolean }> = ({ forte, perigo, className, ...p }) => (
  <button {...p} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${perigo ? 'bg-red-700 text-white' : forte ? 'bg-[#0F2B5B] text-white' : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'} ${className || ''}`} />
);

/** `urlMensal`: endereço para baixar o backup mensal automático (o que já existia), quando o sistema tem. */
export function PainelBackupEscritorio({ api, sistema, nomeSistema, onVoltar, nomeVoltar, urlMensal }: { api: string; sistema: string; nomeSistema: string; onVoltar?: () => void; nomeVoltar?: string; urlMensal?: (id: string) => string }) {
  const [aba, setAba] = useState<'backups' | 'agenda' | 'destino' | 'avisos' | 'relatorio' | 'restaurar'>('backups');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [mensais, setMensais] = useState<Mensal[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [rascunho, setRascunho] = useState<Config | null>(null);
  const [restaurarDe, setRestaurarDe] = useState<{ id?: string; mensalId?: string; rotulo: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([chamar(`${api}/resumo`), chamar(`${api}/lista`)]);
      setResumo(r); setExecucoes(l.execucoes || []); setMensais(l.mensais || []); setErro('');
      setRascunho((atual) => atual ?? r.config);
    } catch (e: any) { setErro(e?.message || 'Não consegui ler o backup agora.'); }
  }, [api]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if (!resumo?.emAndamento && !execucoes.some((e) => e.status === 'executando')) return;
    const t = window.setInterval(() => void carregar(), 5000);
    return () => window.clearInterval(t);
  }, [resumo?.emAndamento, execucoes, carregar]);

  const admin = resumo?.voce.administrador === true;
  const podeFazer = admin || resumo?.voce.equipe === true;

  const fazerAgora = async (tipo: Tipo) => {
    setOcupado(true); setAviso('');
    try { const d = await chamar(`${api}/executar`, 'POST', { tipo }); setAviso(d.mensagem); await carregar(); }
    catch (e: any) { setAviso(e.message); } finally { setOcupado(false); }
  };
  const salvarConfig = async (cfg: Config) => {
    setOcupado(true); setAviso('');
    try { const d = await chamar(`${api}/config`, 'POST', cfg); setRascunho(d.config); setAviso(d.mensagem); await carregar(); }
    catch (e: any) { setAviso(e.message); } finally { setOcupado(false); }
  };

  const abas: Array<[typeof aba, string]> = [['backups', 'Backups'], ['agenda', 'Agenda'], ['destino', 'Onde guardar'], ['avisos', 'Avisos e e-mail'], ['relatorio', 'Relatório'], ['restaurar', 'Restaurar']];

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-[#0F2B5B]">Backup do escritório</h1>
          <p className="text-xs text-slate-600">Arquivo próprio do Murad (.murade), cifrado com a chave do seu escritório: só abre e só é restaurado dentro do {nomeSistema}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onVoltar && <Botao onClick={onVoltar}>{nomeVoltar || 'Voltar'}</Botao>}
          {podeFazer && <Botao forte disabled={ocupado || Boolean(resumo?.emAndamento)} onClick={() => void fazerAgora('completo')}>{resumo?.emAndamento ? 'Fazendo backup…' : 'Fazer backup agora'}</Botao>}
        </div>
      </div>

      {erro && <div className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{erro}</div>}
      {aviso && <div className="rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">{aviso}</div>}
      {resumo && !resumo.chaveConfigurada && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-900">O backup cifrado ainda não foi ativado neste servidor. Avise o suporte do Murad.</div>}

      {resumo && (
        <div className={`rounded-xl border-2 p-3 text-sm ${resumo.diasDesdeUltimo !== null && resumo.diasDesdeUltimo <= (resumo.config.avisos.diasSemBackup || 7) ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
          <b>{resumo.ultimo ? `Último backup: ${dataHora(resumo.ultimo.em)} (há ${resumo.diasDesdeUltimo} dia(s))` : 'Ainda não há backup deste escritório.'}</b>
          <div className="text-xs text-slate-700">
            {resumo.proximo ? `Próximo agendado: ${dataHora(resumo.proximo.quando)} — ${resumo.proximo.descricao}.` : 'Nenhum agendamento ainda (o backup mensal automático continua valendo). Use a aba Agenda.'}
            {resumo.emAndamento && ' Há um backup em andamento agora.'}
          </div>
        </div>
      )}

      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Partes da tela Backup">
        {abas.map(([id, nome]) => (
          <button key={id} onClick={() => setAba(id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${aba === id ? 'bg-[#0F2B5B] text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{nome}</button>
        ))}
      </nav>

      {aba === 'backups' && (
        <ListaBackups api={api} urlMensal={urlMensal} execucoes={execucoes} mensais={mensais} admin={admin} podeFazer={podeFazer} ocupado={ocupado} fazerAgora={fazerAgora}
          restaurar={(alvo) => { setRestaurarDe(alvo); setAba('restaurar'); }} />
      )}
      {aba === 'agenda' && rascunho && <Agenda cfg={rascunho} perfis={resumo?.perfis || []} admin={admin} ocupado={ocupado} salvar={salvarConfig} />}
      {aba === 'destino' && rascunho && <Destino api={api} sistema={sistema} cfg={rascunho} admin={admin} ocupado={ocupado} salvar={salvarConfig} recarregar={carregar} />}
      {aba === 'avisos' && rascunho && <Avisos api={api} cfg={rascunho} admin={admin} ocupado={ocupado} salvar={salvarConfig} />}
      {aba === 'relatorio' && <Relatorio api={api} nomeSistema={nomeSistema} />}
      {aba === 'restaurar' && <Restaurar api={api} admin={admin} alvo={restaurarDe} limparAlvo={() => setRestaurarDe(null)} execucoes={execucoes} mensais={mensais} aoTerminar={carregar} />}
    </div>
  );
}

function situacaoNuvem(e: Execucao): string | null {
  if (e.nuvem.removidoEm) return 'nuvem: saiu pela retenção';
  if (e.nuvem.status === 'enviado') return 'na nuvem (conferido)';
  if (e.nuvem.status === 'falha') return 'nuvem: falhou, o robô tenta de novo';
  if (e.nuvem.status === 'pendente') return 'nuvem: pendente';
  return null;
}

function ListaBackups({ api, urlMensal, execucoes, mensais, admin, podeFazer, ocupado, fazerAgora, restaurar }: { api: string; urlMensal?: (id: string) => string; execucoes: Execucao[]; mensais: Mensal[]; admin: boolean; podeFazer: boolean; ocupado: boolean; fazerAgora: (t: Tipo) => void; restaurar: (alvo: { id?: string; mensalId?: string; rotulo: string }) => void }) {
  return (
    <div className="space-y-3">
      <Cartao titulo="Backups feitos" extra={podeFazer ? <Botao disabled={ocupado} onClick={() => fazerAgora('alteracoes')}>Só as alterações agora</Botao> : undefined}>
        <div className="space-y-2">
          {execucoes.map((e) => (
            <article key={e.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="text-sm">{dataHora(e.iniciadoEm)}</b> <span className="text-slate-600">· {e.tipo === 'completo' ? 'Completo' : 'Só alterações'} · {ORIGENS[e.origem] || e.origem}{e.usuario ? ` (${e.usuario})` : ''}</span>
                  <div className="mt-0.5 text-slate-600">
                    {e.status === 'ok' ? `${tamanho(e.tamanhoBytes)} · ${e.validado ? 'conferido' : 'não conferido'}` : e.status === 'executando' ? 'em andamento…' : 'falhou'}
                    {situacaoNuvem(e) ? ` · ${situacaoNuvem(e)}` : ''}{e.salvoNaPastaEm ? ' · salvo na pasta do computador' : ''}{e.removidoEm && !e.temArquivo ? ' · arquivo saiu pela retenção' : ''}
                  </div>
                  {e.erro && <div className="mt-0.5 font-semibold text-red-700">{e.erro}</div>}
                  {e.observacao && <div className="mt-0.5 text-slate-500">{e.observacao}</div>}
                </div>
                {e.status === 'ok' && (e.temArquivo || e.nuvem.status === 'enviado') && (
                  <div className="flex gap-1.5">
                    <a className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold hover:bg-slate-50" href={`${api}/${e.id}/arquivo`}>Baixar</a>
                    {admin && <button className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 font-bold text-red-800" onClick={() => restaurar({ id: e.id, rotulo: `${e.tipo === 'completo' ? 'Completo' : 'Só alterações'} de ${dataHora(e.iniciadoEm)}` })}>Restaurar</button>}
                  </div>
                )}
              </div>
            </article>
          ))}
          {!execucoes.length && <p className="text-sm text-slate-600">Nenhum backup agendado ou manual ainda. Clique em "Fazer backup agora" ou crie um agendamento na aba Agenda.</p>}
        </div>
      </Cartao>
      {mensais.length > 0 && (
        <Cartao titulo="Backup mensal automático (o robô faz todo mês)">
          {mensais.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-xs first:border-0">
              <span>{m.periodo} · {dataHora(m.criadoEm)} · {tamanho(m.tamanhoBytes)} · {m.ok ? 'conferido' : 'falhou'}</span>
              <div className="flex gap-1.5">
                {m.ok && urlMensal && <a className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold hover:bg-slate-50" href={urlMensal(m.id)}>Baixar</a>}
                {m.ok && admin && <button className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 font-bold text-red-800" onClick={() => restaurar({ mensalId: m.id, rotulo: `Mensal de ${m.periodo}` })}>Restaurar</button>}
              </div>
            </div>
          ))}
        </Cartao>
      )}
    </div>
  );
}

function Agenda({ cfg, perfis, admin, ocupado, salvar }: { cfg: Config; perfis: Perfil[]; admin: boolean; ocupado: boolean; salvar: (c: Config) => void }) {
  const [novo, setNovo] = useState<{ tipo: Tipo; frequencia: Perfil['frequencia']; diaSemana: number; diaMes: number; hora: string }>({ tipo: 'completo', frequencia: 'diario', diaSemana: 5, diaMes: 1, hora: '18:00' });
  const [retencao, setRetencao] = useState(cfg.retencaoCompletos);
  const [dias, setDias] = useState(cfg.diasAlteracoes);
  const [validar, setValidar] = useState(cfg.validar);
  const proximoDe = (id: string) => perfis.find((p) => p.id === id)?.proximo;
  const incluir = () => salvar({ ...cfg, perfis: [...cfg.perfis, { id: '', nome: '', ativo: true, criadoEm: new Date().toISOString(), tipo: novo.tipo, frequencia: novo.frequencia, hora: novo.hora, ...(novo.frequencia === 'semanal' ? { diaSemana: novo.diaSemana } : {}), ...(novo.frequencia === 'mensal' ? { diaMes: novo.diaMes } : {}) } as Perfil] });
  const sel = 'rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';
  return (
    <div className="space-y-3">
      {!admin && <p className="rounded-lg bg-slate-100 p-2 text-xs">Só o administrador do escritório muda a agenda. Aqui você vê como está.</p>}
      <Cartao titulo="Agendamentos">
        <div className="space-y-2">
          {cfg.perfis.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-xs">
              <div><b className="text-sm">{p.nome}</b><div className="text-slate-600">{p.ativo ? `Próximo: ${dataHora(proximoDe(p.id))}` : 'Pausado'}</div></div>
              {admin && (
                <div className="flex gap-1.5">
                  <Botao disabled={ocupado} onClick={() => salvar({ ...cfg, perfis: cfg.perfis.map((x) => (x.id === p.id ? { ...x, ativo: !x.ativo } : x)) })}>{p.ativo ? 'Pausar' : 'Ligar'}</Botao>
                  <Botao disabled={ocupado} onClick={async () => { if (await perguntarDuasVezes(`Tirar o agendamento "${p.nome}"?`, 'Os backups já feitos continuam guardados.')) salvar({ ...cfg, perfis: cfg.perfis.filter((x) => x.id !== p.id) }); }}>Tirar</Botao>
                </div>
              )}
            </div>
          ))}
          {!cfg.perfis.length && <p className="text-sm text-slate-600">Nenhum agendamento. Sugestão: "Só alterações todo dia às 18:00" + "Completo toda sexta às 19:00".</p>}
        </div>
        {admin && (
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
            <p className="mb-2 text-xs font-bold text-slate-700">Incluir agendamento</p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
              <label className="text-xs">Tipo<br /><select className={sel} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Tipo })}><option value="completo">Completo</option><option value="alteracoes">Só alterações</option></select></label>
              <label className="text-xs">Quando<br /><select className={sel} value={novo.frequencia} onChange={(e) => setNovo({ ...novo, frequencia: e.target.value as Perfil['frequencia'] })}><option value="diario">Todo dia</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option></select></label>
              {novo.frequencia === 'semanal' && <label className="text-xs">Dia da semana<br /><select className={sel} value={novo.diaSemana} onChange={(e) => setNovo({ ...novo, diaSemana: Number(e.target.value) })}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>}
              {novo.frequencia === 'mensal' && <label className="text-xs">Dia do mês<br /><select className={sel} value={novo.diaMes} onChange={(e) => setNovo({ ...novo, diaMes: Number(e.target.value) })}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>}
              <label className="text-xs">Horário<br /><input type="time" className={sel} value={novo.hora} onChange={(e) => setNovo({ ...novo, hora: e.target.value })} /></label>
              <Botao forte disabled={ocupado} onClick={incluir}>Incluir</Botao>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Horário de Brasília. "Só alterações" guarda só o que mudou desde o último completo (arquivo menor). Se dois agendamentos caírem na mesma hora, vale o completo.</p>
          </div>
        )}
      </Cartao>
      <Cartao titulo="Quanto guardar e conferência">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label className="text-xs">Guardar os últimos backups completos<br /><input type="number" min={1} max={10} disabled={!admin} className={sel} value={retencao} onChange={(e) => setRetencao(Number(e.target.value))} /></label>
          <label className="text-xs">"Só alterações" em rodízio por (dias)<br /><input type="number" min={1} max={31} disabled={!admin} className={sel} value={dias} onChange={(e) => setDias(Number(e.target.value))} /></label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" disabled={!admin} checked={validar} onChange={(e) => setValidar(e.target.checked)} /> Conferir cada backup logo depois de fazer (abre o arquivo, confere o checksum e as contagens). Recomendado: deixe ligado.</label>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">No servidor do Murad ficam no máximo 5 completos; na sua nuvem fica a quantidade escolhida.</p>
        {admin && <Botao forte className="mt-2" disabled={ocupado} onClick={() => salvar({ ...cfg, retencaoCompletos: retencao, diasAlteracoes: dias, validar })}>Gravar</Botao>}
      </Cartao>
    </div>
  );
}

function Destino({ api, sistema, cfg, admin, ocupado, salvar, recarregar }: { api: string; sistema: string; cfg: Config; admin: boolean; ocupado: boolean; salvar: (c: Config) => void; recarregar: () => void }) {
  const [pasta, setPasta] = useState<EstadoPasta | null>(null);
  const [msgPasta, setMsgPasta] = useState('');
  const atualizarPasta = useCallback(async () => setPasta(await estadoPasta(sistema)), [sistema]);
  useEffect(() => { void atualizarPasta(); }, [atualizarPasta]);
  const servicoInicial = NUVENS.find((n) => cfg.nuvem?.endpoint && cfg.nuvem.endpoint.includes(n.endpoint.replace('https://', '').split('/')[0].replace('<ID-DA-CONTA>', ''))) || NUVENS[0];
  const [servico, setServico] = useState(cfg.nuvem ? 'outro' : servicoInicial.id);
  const [f, setF] = useState({ endpoint: cfg.nuvem?.endpoint || NUVENS[0].endpoint, regiao: cfg.nuvem?.regiao || NUVENS[0].regiao, bucket: cfg.nuvem?.bucket || '', pasta: cfg.nuvem?.pasta || 'murade-backup', chaveAcesso: '', chaveSecreta: '' });
  const [msgNuvem, setMsgNuvem] = useState('');
  const [testando, setTestando] = useState(false);
  const info = NUVENS.find((n) => n.id === servico) || NUVENS[4];
  const entrada = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';

  const nuvem = async (acao: 'testar' | 'gravar' | 'tirar') => {
    setTestando(true); setMsgNuvem('');
    try {
      const d = acao === 'tirar' ? await chamar(`${api}/nuvem`, 'POST', { remover: true }) : await chamar(acao === 'testar' ? `${api}/nuvem/testar` : `${api}/nuvem`, 'POST', f);
      setMsgNuvem(d.mensagem); if (acao !== 'testar') { setF({ ...f, chaveAcesso: '', chaveSecreta: '' }); recarregar(); }
    } catch (e: any) { setMsgNuvem(e.message); } finally { setTestando(false); }
  };

  return (
    <div className="space-y-3">
      <Cartao titulo="No meu computador">
        <p className="text-xs text-slate-700">Todo backup pode ser baixado na aba Backups (botão Baixar). Para gravar <b>sozinho</b> numa pasta do computador (ex.: Documentos\Backup Murad), escolha a pasta uma vez:</p>
        {pasta && !pasta.suportado && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Este navegador não deixa o sistema gravar numa pasta (isso funciona no Google Chrome e no Microsoft Edge do computador). Aqui, use o botão Baixar.</p>}
        {pasta?.suportado && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Botao forte onClick={async () => { try { setPasta(await escolherPasta(sistema)); setMsgPasta('Pasta escolhida. Os próximos backups são gravados lá sozinhos enquanto o sistema estiver aberto.'); if (!cfg.pastaComputador && admin) salvar({ ...cfg, pastaComputador: true }); } catch { setMsgPasta('Nenhuma pasta escolhida.'); } }}>{pasta.nome ? 'Trocar a pasta' : 'Escolher pasta do backup'}</Botao>
            {pasta.nome && <span className="text-xs">Pasta: <b>{pasta.nome}</b> {pasta.permissao === 'granted' ? '(gravando)' : '(precisa liberar)'}</span>}
            {pasta.nome && pasta.permissao !== 'granted' && <Botao onClick={async () => { await liberarPasta(sistema); await atualizarPasta(); }}>Liberar a pasta</Botao>}
            {pasta.nome && pasta.permissao === 'granted' && <Botao onClick={async () => { const g = await sincronizarPasta(api, sistema).catch(() => []); setMsgPasta(g.length ? `${g.length} backup(s) gravado(s) na pasta agora.` : 'A pasta já está em dia.'); }}>Gravar agora na pasta</Botao>}
            {pasta.nome && <Botao onClick={async () => { await esquecerPasta(sistema); await atualizarPasta(); setMsgPasta('Este navegador parou de gravar na pasta.'); }}>Parar de gravar na pasta</Botao>}
          </div>
        )}
        {msgPasta && <p className="mt-2 text-xs font-semibold text-slate-800">{msgPasta}</p>}
        <p className="mt-2 text-[11px] text-slate-500">Importante: a gravação automática só acontece com o sistema aberto neste computador. Com o sistema fechado, o backup fica guardado no Murad e é gravado na pasta na próxima vez que você abrir. A escolha da pasta vale só para este navegador.</p>
      </Cartao>

      <Cartao titulo="Na minha nuvem">
        <p className="text-xs text-slate-700">O backup vai sozinho para a nuvem do seu escritório (conta e custo do escritório). Funciona com qualquer serviço compatível com S3. As chaves ficam guardadas cifradas e nunca aparecem de novo na tela.</p>
        {cfg.nuvem && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">Gravada: <b>{cfg.nuvem.bucket}</b> / {cfg.nuvem.pasta} · chave {cfg.nuvem.chaveAcessoMascarada} · {cfg.nuvem.ativo ? 'ligada' : 'desligada'}</p>}
        {admin ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs sm:col-span-2">Serviço<br />
              <select className={entrada} value={servico} onChange={(e) => { const n = NUVENS.find((x) => x.id === e.target.value)!; setServico(n.id); setF({ ...f, endpoint: n.endpoint, regiao: n.regiao }); }}>
                {NUVENS.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-slate-500 sm:col-span-2">{info.dica}</p>
            <label className="text-xs sm:col-span-2">Endereço do serviço (Endpoint)<br /><input className={entrada} value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value.trim() })} /></label>
            <label className="text-xs">Região<br /><input className={entrada} value={f.regiao} onChange={(e) => setF({ ...f, regiao: e.target.value.trim() })} /></label>
            <label className="text-xs">Nome do bucket<br /><input className={entrada} value={f.bucket} onChange={(e) => setF({ ...f, bucket: e.target.value.trim() })} /></label>
            <label className="text-xs">Pasta dentro do bucket<br /><input className={entrada} value={f.pasta} onChange={(e) => setF({ ...f, pasta: e.target.value })} /></label>
            <label className="text-xs">Chave de acesso (Key ID / Access Key){cfg.nuvem ? ' — deixe vazio para manter' : ''}<br /><input className={entrada} autoComplete="off" value={f.chaveAcesso} onChange={(e) => setF({ ...f, chaveAcesso: e.target.value.trim() })} /></label>
            <label className="text-xs sm:col-span-2">Chave secreta (Application Key / Secret Key){cfg.nuvem ? ' — deixe vazio para manter' : ''}<br /><input className={entrada} type="password" autoComplete="new-password" value={f.chaveSecreta} onChange={(e) => setF({ ...f, chaveSecreta: e.target.value.trim() })} /></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Botao disabled={testando || ocupado} onClick={() => void nuvem('testar')}>{testando ? 'Testando…' : 'Testar'}</Botao>
              <Botao forte disabled={testando || ocupado} onClick={() => void nuvem('gravar')}>Testar e gravar</Botao>
              {cfg.nuvem && <Botao disabled={testando || ocupado} onClick={async () => { if (await perguntarDuasVezes('Tirar a nuvem do backup?', 'Os arquivos que já estão lá continuam lá; os próximos backups ficam só no Murad e no computador.')) void nuvem('tirar'); }}>Tirar a nuvem</Botao>}
            </div>
          </div>
        ) : <p className="mt-2 text-xs text-slate-600">Só o administrador do escritório configura a nuvem.</p>}
        {msgNuvem && <p className="mt-2 text-xs font-semibold text-slate-800">{msgNuvem}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-500">Google Drive — em breve</div>
          <div className="rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-500">OneDrive — em breve</div>
        </div>
      </Cartao>
      <p className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900"><b>Dica:</b> guarde uma cópia FORA do computador do escritório (na nuvem). Se o computador quebrar, for roubado ou pegar vírus, a cópia da nuvem continua salva.</p>
    </div>
  );
}

function Avisos({ api, cfg, admin, ocupado, salvar }: { api: string; cfg: Config; admin: boolean; ocupado: boolean; salvar: (c: Config) => void }) {
  const [av, setAv] = useState(cfg.avisos);
  const [em, setEm] = useState({ ...cfg.email, paraTexto: cfg.email.para.join(', '), ccTexto: cfg.email.cc.join(', ') });
  const [usuarios, setUsuarios] = useState<Array<{ login: string }>>([]);
  useEffect(() => { if (admin) void chamar(`${api}/usuarios`).then((d) => setUsuarios(d.usuarios || [])).catch(() => undefined); }, [api, admin]);
  const lista = av.usuarios === 'todos' ? [] : av.usuarios;
  const entrada = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm';
  return (
    <div className="space-y-3">
      {!admin && <p className="rounded-lg bg-slate-100 p-2 text-xs">Só o administrador do escritório muda os avisos.</p>}
      <Cartao titulo="Aviso no sistema">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!admin} checked={av.aoEntrar} onChange={(e) => setAv({ ...av, aoEntrar: e.target.checked })} /> Avisar ao ENTRAR no sistema</label>
        <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" disabled={!admin} checked={av.aoSair} onChange={(e) => setAv({ ...av, aoSair: e.target.checked })} /> Avisar ao SAIR do sistema</label>
        <label className="mt-2 block text-xs">Avisar quando o último backup tiver mais de (dias)<br /><input type="number" min={1} max={90} disabled={!admin} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={av.diasSemBackup} onChange={(e) => setAv({ ...av, diasSemBackup: Number(e.target.value) })} /></label>
        <div className="mt-2 text-xs">
          <label className="flex items-center gap-2"><input type="radio" disabled={!admin} checked={av.usuarios === 'todos'} onChange={() => setAv({ ...av, usuarios: 'todos' })} /> Avisar todos do escritório</label>
          <label className="mt-1 flex items-center gap-2"><input type="radio" disabled={!admin} checked={av.usuarios !== 'todos'} onChange={() => setAv({ ...av, usuarios: [] })} /> Só estes usuários:</label>
          {av.usuarios !== 'todos' && (
            <div className="mt-1 grid gap-1 pl-5 sm:grid-cols-2">
              {usuarios.map((u) => (
                <label key={u.login} className="flex items-center gap-2"><input type="checkbox" disabled={!admin} checked={lista.includes(u.login.toLowerCase())} onChange={(e) => setAv({ ...av, usuarios: e.target.checked ? [...lista, u.login.toLowerCase()] : lista.filter((x) => x !== u.login.toLowerCase()) })} /> {u.login}</label>
              ))}
            </div>
          )}
        </div>
      </Cartao>
      <Cartao titulo="E-mail do resultado">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!admin} checked={em.aoConcluir} onChange={(e) => setEm({ ...em, aoConcluir: e.target.checked })} /> Mandar e-mail quando o backup der certo</label>
        <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" disabled={!admin} checked={em.aoErrar} onChange={(e) => setEm({ ...em, aoErrar: e.target.checked })} /> Mandar e-mail quando o backup der erro</label>
        <label className="mt-2 block text-xs">Para (separe por vírgula; vazio = o e-mail de login do escritório)<br /><input className={entrada} disabled={!admin} value={em.paraTexto} onChange={(e) => setEm({ ...em, paraTexto: e.target.value })} /></label>
        <label className="mt-2 block text-xs">Cc (cópia)<br /><input className={entrada} disabled={!admin} value={em.ccTexto} onChange={(e) => setEm({ ...em, ccTexto: e.target.value })} /></label>
      </Cartao>
      {admin && <Botao forte disabled={ocupado} onClick={() => salvar({ ...cfg, avisos: av, email: { aoConcluir: em.aoConcluir, aoErrar: em.aoErrar, para: em.paraTexto.split(/[;,\s]+/).filter(Boolean), cc: em.ccTexto.split(/[;,\s]+/).filter(Boolean) } })}>Gravar avisos e e-mail</Botao>}
    </div>
  );
}

function Relatorio({ api, nomeSistema }: { api: string; nomeSistema: string }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje);
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');
  const ver = useCallback(async () => { try { setDados(await chamar(`${api}/relatorio?de=${de}&ate=${ate}`)); setErro(''); } catch (e: any) { setErro(e.message); } }, [api, de, ate]);
  useEffect(() => { void ver(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const csv = useMemo(() => {
    if (!dados) return '';
    const l = [['Data', 'Tipo', 'Quem', 'Resultado', 'Conferido', 'Tamanho (bytes)', 'Nuvem', 'Pasta do computador'].join(';')];
    for (const e of dados.execucoes as Execucao[]) l.push([dataHora(e.iniciadoEm), e.tipo === 'completo' ? 'Completo' : 'Só alterações', `${ORIGENS[e.origem] || e.origem}${e.usuario ? ` (${e.usuario})` : ''}`, e.status === 'ok' ? 'OK' : e.status === 'falha' ? `Falhou: ${e.erro || ''}` : 'Em andamento', e.validado ? 'Sim' : 'Não', String(e.tamanhoBytes), e.nuvem.status, e.salvoNaPastaEm ? 'Sim' : ''].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    return l.join('\r\n');
  }, [dados]);
  return (
    <Cartao titulo="Relatório dos backups" extra={dados ? <div className="flex gap-1.5 print:hidden"><a className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold" download={`relatorio-backup-${de}-${ate}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + csv)}`}>Baixar planilha</a><Botao onClick={() => window.print()}>Imprimir</Botao></div> : undefined}>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-xs">De<br /><CampoData className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="text-xs">Até<br /><CampoData className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <Botao forte onClick={() => void ver()}>Ver</Botao>
      </div>
      {erro && <p className="mt-2 text-xs font-semibold text-red-700">{erro}</p>}
      {dados && (
        <div className="mt-3">
          <p className="text-xs text-slate-700">{nomeSistema} · {dados.totais.feitos} feito(s), {dados.totais.falhas} falha(s), {dados.totais.validados} conferido(s), {tamanho(dados.totais.bytes || 0)} no total.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead><tr className="border-b text-slate-500"><th className="py-1">Data</th><th>Tipo</th><th>Quem</th><th>Resultado</th><th>Conferido</th><th>Tamanho</th><th>Nuvem</th></tr></thead>
              <tbody>
                {(dados.execucoes as Execucao[]).map((e) => (
                  <tr key={e.id} className="border-b border-slate-100"><td className="py-1">{dataHora(e.iniciadoEm)}</td><td>{e.tipo === 'completo' ? 'Completo' : 'Alterações'}</td><td>{ORIGENS[e.origem] || e.origem}{e.usuario ? ` (${e.usuario})` : ''}</td><td>{e.status === 'ok' ? 'OK' : e.status === 'falha' ? 'Falhou' : '…'}</td><td>{e.validado ? 'Sim' : 'Não'}</td><td>{e.status === 'ok' ? tamanho(e.tamanhoBytes) : '—'}</td><td>{e.nuvem.status === 'enviado' ? 'Sim' : e.nuvem.status === 'falha' ? 'Falhou' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {dados.restauracoes?.length > 0 && <p className="mt-2 text-xs text-slate-700">Restaurações no período: {dados.restauracoes.map((r: any) => `${dataHora(r.em)} por ${r.usuario} (${r.status === 'ok' ? 'concluída' : r.status})`).join('; ')}.</p>}
        </div>
      )}
    </Cartao>
  );
}

function Restaurar({ api, admin, alvo, limparAlvo, execucoes, mensais, aoTerminar }: { api: string; admin: boolean; alvo: { id?: string; mensalId?: string; rotulo: string } | null; limparAlvo: () => void; execucoes: Execucao[]; mensais: Mensal[]; aoTerminar: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [rotulo, setRotulo] = useState('');
  const [entendi, setEntendi] = useState(false);
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const verPrevia = useCallback(async (fonte: { id?: string; mensalId?: string } | File, nome: string) => {
    setOcupado(true); setMsg(''); setPrevia(null); setResultado(null); setEntendi(false); setTexto(''); setRotulo(nome);
    try {
      let d: any;
      if (fonte instanceof File) {
        const r = await fetch(`${api}/restaurar/previa-arquivo`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: fonte });
        d = await r.json().catch(() => ({}));
        if (!r.ok || !d?.sucesso) throw new Error(d?.motivo || 'Não consegui abrir o arquivo.');
      } else d = await chamar(`${api}/restaurar/previa`, 'POST', fonte);
      setPrevia(d);
    } catch (e: any) { setMsg(e.message); } finally { setOcupado(false); }
  }, [api]);

  useEffect(() => { if (alvo && admin) { void verPrevia({ id: alvo.id, mensalId: alvo.mensalId }, alvo.rotulo); limparAlvo(); } }, [alvo, admin, verPrevia, limparAlvo]);

  if (!admin) return <Cartao titulo="Restaurar"><p className="text-sm text-slate-700">Só o administrador do escritório restaura backup.</p></Cartao>;

  const confirmar = async () => {
    if (!previa) return;
    if (!(await perguntar({ titulo: 'Última confirmação', texto: `Restaurar "${rotulo}" agora? Antes, o Murad guarda uma cópia de como está hoje.`, sim: 'Sim, restaurar', perigo: true, inverterBotoes: true }))) return;
    setOcupado(true); setMsg('');
    try { const d = await chamar(`${api}/restaurar/confirmar`, 'POST', { token: previa.token, confirmacao: texto }); setResultado(d); setPrevia(null); aoTerminar(); }
    catch (e: any) { setMsg(e.message); } finally { setOcupado(false); }
  };
  const disponiveis = execucoes.filter((e) => e.status === 'ok' && (e.temArquivo || e.nuvem.status === 'enviado')).slice(0, 15);

  return (
    <div className="space-y-3">
      <Cartao titulo="1. Escolha o backup">
        <div className="flex flex-wrap items-center gap-2">
          <select className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" defaultValue="" onChange={(e) => {
            const v = e.target.value; if (!v) return;
            if (v.startsWith('m:')) { const m = mensais.find((x) => x.id === v.slice(2)); void verPrevia({ mensalId: v.slice(2) }, `Mensal de ${m?.periodo || ''}`); }
            else { const x = execucoes.find((y) => y.id === v); void verPrevia({ id: v }, `${x?.tipo === 'completo' ? 'Completo' : 'Só alterações'} de ${dataHora(x?.iniciadoEm)}`); }
          }}>
            <option value="">Escolher da lista…</option>
            {disponiveis.map((e) => <option key={e.id} value={e.id}>{dataHora(e.iniciadoEm)} · {e.tipo === 'completo' ? 'Completo' : 'Só alterações'} · {ORIGENS[e.origem] || e.origem}</option>)}
            {mensais.filter((m) => m.ok).map((m) => <option key={m.id} value={`m:${m.id}`}>Mensal automático {m.periodo}</option>)}
          </select>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold">
            Escolher arquivo .murade do computador
            <input type="file" accept=".murade" className="hidden" onChange={(e) => { const arq = e.target.files?.[0]; if (arq) void verPrevia(arq, arq.name); e.target.value = ''; }} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Restaurar volta os dados do escritório como estavam no backup. Só os dados deste escritório; nada de outro escritório entra. O que foi criado depois do backup continua (a restauração não apaga).</p>
      </Cartao>
      {ocupado && <p className="text-sm font-semibold text-slate-700">Abrindo e conferindo o backup…</p>}
      {msg && <p className="rounded-lg bg-red-50 p-2.5 text-sm font-semibold text-red-800">{msg}</p>}
      {previa && (
        <Cartao titulo={`2. O que vai mudar — ${rotulo}`}>
          <p className="text-xs text-slate-600">Backup de {dataHora(previa.backup.criadoEm)} ({previa.backup.tipo === 'completo' ? 'completo' : 'só alterações, junto com o completo dele'}).</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead><tr className="border-b text-slate-500"><th className="py-1">O quê</th><th>No backup</th><th>Iguais</th><th>Voltam como no backup</th><th>Recriados</th><th>Ficam como estão</th></tr></thead>
              <tbody>{previa.itens.map((i) => (
                <tr key={i.nome} className="border-b border-slate-100 align-top"><td className="py-1 font-semibold">{i.titulo}{i.observacao && <div className="font-normal text-amber-800">{i.observacao}</div>}</td><td>{i.noBackup}</td><td>{i.iguais}</td><td className={i.alterar ? 'font-bold text-amber-800' : ''}>{i.alterar}</td><td className={i.recriar ? 'font-bold text-amber-800' : ''}>{i.recriar}</td><td>{i.ficamComoEstao}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {previa.naoRestauradas.length > 0 && (
            <details className="mt-2 text-xs"><summary className="cursor-pointer font-bold text-slate-700">O que NÃO muda na restauração (e por quê)</summary>
              <ul className="mt-1 list-disc pl-5 text-slate-600">{previa.naoRestauradas.map((n) => <li key={n.titulo}><b>{n.titulo}:</b> {n.motivo}</li>)}</ul>
            </details>
          )}
          {previa.totalMudancas === 0 ? <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">Nada a restaurar: os dados de hoje já estão iguais aos do backup.</p> : (
            <div className="mt-3 space-y-2 rounded-lg border-2 border-red-200 bg-red-50 p-2.5">
              <p className="text-xs font-bold text-red-900">3. Confirmação</p>
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} /> Entendi: {previa.totalMudancas} registro(s) voltam a ficar como no backup. Antes, o Murad guarda sozinho uma cópia de como está hoje.</label>
              <label className="block text-xs">Para confirmar, digite RESTAURAR<br /><input className="mt-1 w-full rounded-lg border border-red-300 bg-white px-2 py-2 text-sm sm:w-60" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" /></label>
              <Botao perigo disabled={!entendi || texto.trim().toUpperCase() !== 'RESTAURAR' || ocupado} onClick={() => void confirmar()}>Restaurar este backup</Botao>
              <p className="text-[11px] text-red-900">A prévia vale por {previa.expiraEmMin} minutos.</p>
            </div>
          )}
        </Cartao>
      )}
      {resultado && (
        <Cartao titulo="Restauração concluída">
          <p className="text-sm text-emerald-900">{resultado.mensagem}</p>
          <ul className="mt-2 list-disc pl-5 text-xs">{(resultado.itens || []).map((i: ItemPrevia) => <li key={i.nome}>{i.titulo}: {i.alterar} voltaram como no backup, {i.recriar} recriado(s).</li>)}</ul>
        </Cartao>
      )}
    </div>
  );
}
