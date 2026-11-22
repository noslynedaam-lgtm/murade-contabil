// Agenda do backup do escritório (igual nos três sistemas Murade: DP, Fiscal e Contábil).
//
// Cada escritório tem uma configuração com vários "perfis" de agendamento (ex.: todo dia às 18h só as alterações +
// toda sexta às 19h o completo). Este módulo é só regra pura (sem banco, sem rede), para dar para testar tudo:
//  - normalizar e validar a configuração que vem da tela ou da Agente IA;
//  - calcular a última ocorrência de cada perfil (horário de Brasília) e dizer quais estão devidos agora;
//  - quando dois ou mais perfis caem na mesma rodada, vale o COMPLETO (um backup só cobre todos).
import { randomBytes } from 'crypto';

export type TipoBackup = 'completo' | 'alteracoes';
export type Frequencia = 'diario' | 'semanal' | 'mensal';

export interface PerfilBackup {
  id: string;
  nome: string;
  tipo: TipoBackup;
  frequencia: Frequencia;
  /** 0 = domingo ... 6 = sábado (só no semanal). */
  diaSemana?: number;
  /** 1 a 31 (só no mensal). Mês com menos dias: vale o último dia do mês. */
  diaMes?: number;
  /** HH:MM, horário de Brasília. */
  hora: string;
  ativo: boolean;
  criadoEm: string;
}

export interface ConfigNuvemPublica {
  tipo: 's3';
  /** Endereço do serviço (ex.: https://s3.us-west-004.backblazeb2.com ou https://<conta>.r2.cloudflarestorage.com). */
  endpoint: string;
  bucket: string;
  regiao: string;
  /** Pasta dentro do bucket onde o Murade grava (só mexe dentro dela). */
  pasta: string;
  /** Só o começo da chave de acesso, para a pessoa reconhecer qual está gravada. A chave secreta nunca volta para a tela. */
  chaveAcessoMascarada: string;
  ativo: boolean;
}

export interface ConfigBackup {
  perfis: PerfilBackup[];
  /** Quantos backups COMPLETOS guardar (os mais novos). Padrão 3. */
  retencaoCompletos: number;
  /** Os backups "só alterações" ficam em rodízio pelos últimos N dias (padrão 7: a semana). */
  diasAlteracoes: number;
  /** Conferir cada backup logo depois de gerar (abrir, decifrar, checksum e contagens). Ligado por padrão. */
  validar: boolean;
  avisos: { aoEntrar: boolean; aoSair: boolean; diasSemBackup: number; usuarios: 'todos' | string[] };
  email: { aoConcluir: boolean; aoErrar: boolean; para: string[]; cc: string[] };
  /** Guardar no computador: o navegador grava sozinho na pasta escolhida quando o sistema está aberto. */
  pastaComputador: boolean;
  nuvem: ConfigNuvemPublica | null;
}

export const LIMITES = { perfis: 10, retencaoMin: 1, retencaoMax: 10, diasMin: 1, diasMax: 31, emails: 10 } as const;

export function configPadrao(): ConfigBackup {
  return {
    perfis: [],
    retencaoCompletos: 3,
    diasAlteracoes: 7,
    validar: true,
    avisos: { aoEntrar: true, aoSair: false, diasSemBackup: 7, usuarios: 'todos' },
    email: { aoConcluir: false, aoErrar: true, para: [], cc: [] },
    pastaComputador: false,
    nuvem: null,
  };
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EMAIL = /^[^\s@<>,;"']{1,64}@[^\s@<>,;"']{1,190}\.[a-z]{2,24}$/i;

export const emailValido = (e: string): boolean => EMAIL.test(String(e || '').trim());
export const novoIdPerfil = (): string => `p_${randomBytes(6).toString('hex')}`;

const inteiro = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
};

function listaEmails(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v : String(v ?? '').split(/[;,\s]+/);
  const saida: string[] = [];
  for (const item of bruto) {
    const e = String(item || '').trim().toLowerCase();
    if (e && emailValido(e) && !saida.includes(e)) saida.push(e);
  }
  return saida.slice(0, LIMITES.emails);
}

/** Valida UM perfil. Devolve o perfil limpo ou o motivo em português (para a tela e para a Agente repetirem). */
export function validarPerfil(entrada: any, agora: Date = new Date()): { ok: true; perfil: PerfilBackup } | { ok: false; motivo: string } {
  const tipo: TipoBackup = entrada?.tipo === 'alteracoes' ? 'alteracoes' : 'completo';
  const frequencia = entrada?.frequencia;
  if (frequencia !== 'diario' && frequencia !== 'semanal' && frequencia !== 'mensal') return { ok: false, motivo: 'Escolha a frequência: todo dia, toda semana ou todo mês.' };
  const hora = String(entrada?.hora ?? '').trim();
  if (!HORA.test(hora)) return { ok: false, motivo: 'Informe o horário no formato HH:MM (ex.: 18:00).' };
  const perfil: PerfilBackup = {
    id: typeof entrada?.id === 'string' && /^p_[a-f0-9]{12}$/.test(entrada.id) ? entrada.id : novoIdPerfil(),
    nome: String(entrada?.nome ?? '').trim().slice(0, 60),
    tipo, frequencia, hora,
    ativo: entrada?.ativo !== false,
    criadoEm: typeof entrada?.criadoEm === 'string' && !Number.isNaN(Date.parse(entrada.criadoEm)) ? new Date(entrada.criadoEm).toISOString() : agora.toISOString(),
  };
  if (frequencia === 'semanal') {
    const d = Number(entrada?.diaSemana);
    if (!Number.isInteger(d) || d < 0 || d > 6) return { ok: false, motivo: 'Escolha o dia da semana do backup semanal.' };
    perfil.diaSemana = d;
  }
  if (frequencia === 'mensal') {
    const d = Number(entrada?.diaMes);
    if (!Number.isInteger(d) || d < 1 || d > 31) return { ok: false, motivo: 'Escolha o dia do mês (1 a 31) do backup mensal.' };
    perfil.diaMes = d;
  }
  if (!perfil.nome) perfil.nome = descreverPerfil(perfil);
  return { ok: true, perfil };
}

/** Normaliza a configuração inteira. Perfis inválidos voltam como erro (nada é gravado pela metade). */
export function normalizarConfig(entrada: any, anterior: ConfigBackup = configPadrao(), agora: Date = new Date()): { ok: true; config: ConfigBackup } | { ok: false; motivo: string } {
  const base = { ...configPadrao(), ...anterior };
  const perfisEntrada = Array.isArray(entrada?.perfis) ? entrada.perfis : base.perfis;
  if (perfisEntrada.length > LIMITES.perfis) return { ok: false, motivo: `No máximo ${LIMITES.perfis} agendamentos por escritório.` };
  const perfis: PerfilBackup[] = [];
  for (const p of perfisEntrada) {
    const v = validarPerfil(p, agora);
    if (v.ok === false) return { ok: false, motivo: v.motivo };
    if (perfis.some((x) => x.id === v.perfil.id)) v.perfil.id = novoIdPerfil();
    perfis.push(v.perfil);
  }
  const av = entrada?.avisos ?? base.avisos;
  const em = entrada?.email ?? base.email;
  const usuarios = Array.isArray(av?.usuarios)
    ? [...new Set(av.usuarios.map((u: unknown) => String(u || '').trim().toLowerCase()).filter(Boolean))].slice(0, 200) as string[]
    : 'todos';
  return {
    ok: true,
    config: {
      perfis,
      retencaoCompletos: inteiro(entrada?.retencaoCompletos ?? base.retencaoCompletos, LIMITES.retencaoMin, LIMITES.retencaoMax, 3),
      diasAlteracoes: inteiro(entrada?.diasAlteracoes ?? base.diasAlteracoes, LIMITES.diasMin, LIMITES.diasMax, 7),
      validar: (entrada?.validar ?? base.validar) !== false,
      avisos: {
        aoEntrar: (av?.aoEntrar ?? true) === true,
        aoSair: (av?.aoSair ?? false) === true,
        diasSemBackup: inteiro(av?.diasSemBackup ?? 7, 1, 90, 7),
        usuarios,
      },
      email: { aoConcluir: em?.aoConcluir === true, aoErrar: (em?.aoErrar ?? true) !== false, para: listaEmails(em?.para), cc: listaEmails(em?.cc) },
      pastaComputador: (entrada?.pastaComputador ?? base.pastaComputador) === true,
      nuvem: base.nuvem, // a nuvem muda só pela rota própria (com as chaves cifradas)
    },
  };
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export function descreverPerfil(p: Pick<PerfilBackup, 'tipo' | 'frequencia' | 'diaSemana' | 'diaMes' | 'hora'>): string {
  const tipo = p.tipo === 'completo' ? 'Completo' : 'Só alterações';
  if (p.frequencia === 'diario') return `${tipo} todo dia às ${p.hora}`;
  if (p.frequencia === 'semanal') return `${tipo} toda ${DIAS[p.diaSemana ?? 0]} às ${p.hora}`;
  return `${tipo} todo dia ${p.diaMes} do mês às ${p.hora}`;
}

// ===== Horário de Brasília =====

const FUSO = 'America/Sao_Paulo';
function partesLocais(instante: Date): { ano: number; mes: number; dia: number; hora: number; minuto: number; diaSemana: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(instante)) p[x.type] = x.value;
  const semana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) % 24, minuto: Number(p.minute), diaSemana: semana };
}

/** Instante (UTC) de uma data/hora de Brasília. Calcula o deslocamento do fuso pela própria data (sem supor -3 fixo). */
export function instanteDeBrasilia(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora + 3, minuto);
  const p = partesLocais(new Date(palpite));
  const diferencaMin = (Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - Date.UTC(ano, mes - 1, dia, hora, minuto)) / 60_000;
  return new Date(palpite - diferencaMin * 60_000);
}

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Última ocorrência do perfil que já chegou (<= agora). */
export function ultimaOcorrencia(p: PerfilBackup, agora: Date): Date {
  const [h, m] = p.hora.split(':').map(Number);
  const hoje = partesLocais(agora);
  if (p.frequencia === 'mensal') {
    for (let volta = 0; volta < 3; volta++) {
      let ano = hoje.ano; let mes = hoje.mes - volta;
      while (mes < 1) { mes += 12; ano -= 1; }
      const dia = Math.min(p.diaMes ?? 1, diasNoMes(ano, mes));
      const t = instanteDeBrasilia(ano, mes, dia, h, m);
      if (t.getTime() <= agora.getTime()) return t;
    }
  }
  for (let volta = 0; volta < 15; volta++) {
    const d = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia - volta));
    if (p.frequencia === 'semanal' && d.getUTCDay() !== (p.diaSemana ?? 0)) continue;
    const t = instanteDeBrasilia(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m);
    if (t.getTime() <= agora.getTime()) return t;
  }
  return instanteDeBrasilia(hoje.ano, hoje.mes, hoje.dia, h, m);
}

/** Próxima ocorrência (> agora), para mostrar "próximo backup" na tela. */
export function proximaOcorrencia(p: PerfilBackup, agora: Date): Date {
  const [h, m] = p.hora.split(':').map(Number);
  const hoje = partesLocais(agora);
  if (p.frequencia === 'mensal') {
    for (let avanco = 0; avanco < 3; avanco++) {
      let ano = hoje.ano; let mes = hoje.mes + avanco;
      while (mes > 12) { mes -= 12; ano += 1; }
      const t = instanteDeBrasilia(ano, mes, Math.min(p.diaMes ?? 1, diasNoMes(ano, mes)), h, m);
      if (t.getTime() > agora.getTime()) return t;
    }
  }
  for (let avanco = 0; avanco < 15; avanco++) {
    const d = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + avanco));
    if (p.frequencia === 'semanal' && d.getUTCDay() !== (p.diaSemana ?? 0)) continue;
    const t = instanteDeBrasilia(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m);
    if (t.getTime() > agora.getTime()) return t;
  }
  return new Date(agora.getTime() + 86_400_000);
}

export interface ExecucaoAnterior { perfilIds: string[]; agendadoPara: string | null; status: 'executando' | 'ok' | 'falha' }

export const MAX_TENTATIVAS_POR_OCORRENCIA = 3;

/**
 * Quais perfis estão devidos agora. Um perfil está devido quando a última ocorrência dele já passou, é depois de o
 * perfil ser criado e ainda não há backup que a cubra (um "ok", algum em andamento, ou 3 falhas seguidas para a mesma
 * ocorrência — aí para de insistir e o robô conferidor avisa). Ocorrência perdida (sistema fora do ar) roda uma vez só,
 * assim que der; ocorrências mais antigas que a última não se acumulam.
 */
export function perfisDevidos(config: Pick<ConfigBackup, 'perfis'>, execucoes: ExecucaoAnterior[], agora: Date): Array<{ perfil: PerfilBackup; ocorrencia: Date }> {
  const devidos: Array<{ perfil: PerfilBackup; ocorrencia: Date }> = [];
  for (const perfil of config.perfis) {
    if (!perfil.ativo) continue;
    const ocorrencia = ultimaOcorrencia(perfil, agora);
    if (ocorrencia.getTime() < Date.parse(perfil.criadoEm)) continue;
    const cobrem = execucoes.filter((e) => e.perfilIds.includes(perfil.id) && e.agendadoPara && Date.parse(e.agendadoPara) >= ocorrencia.getTime());
    if (cobrem.some((e) => e.status === 'ok' || e.status === 'executando')) continue;
    if (cobrem.filter((e) => e.status === 'falha').length >= MAX_TENTATIVAS_POR_OCORRENCIA) continue;
    devidos.push({ perfil, ocorrencia });
  }
  return devidos;
}

/** Junta os perfis devidos numa rodada só: se qualquer um for completo, o backup é completo (vale o completo). */
export function escolherExecucao(devidos: Array<{ perfil: PerfilBackup; ocorrencia: Date }>): { tipo: TipoBackup; perfilIds: string[]; agendadoPara: Date } | null {
  if (!devidos.length) return null;
  const tipo: TipoBackup = devidos.some((d) => d.perfil.tipo === 'completo') ? 'completo' : 'alteracoes';
  const agendadoPara = new Date(Math.max(...devidos.map((d) => d.ocorrencia.getTime())));
  return { tipo, perfilIds: devidos.map((d) => d.perfil.id), agendadoPara };
}

/** A data/hora de Brasília para textos (e-mail, Agente). */
export function dataHoraBrasilia(iso: string | Date): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
