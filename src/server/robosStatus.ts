// Registro de funcionamento dos robôs do servidor do DP.
//
// Os robôs de verdade são as rotinas agendadas em server.ts. Este módulo só (1) impede que a mesma
// rotina rode duas vezes ao mesmo tempo e (2) guarda quando cada uma rodou pela última vez, para a
// IA e a tela mostrarem o estado real. Nada aqui inventa atividade: robô sem rotina agendada
// aparece como "aguardando configuração".

export type EstadoRobo = 'ativo' | 'parado' | 'aguardando_configuracao';

export interface DefinicaoRoboDP {
  id: string;
  nome: string;
  posto: 'coletor' | 'calculador' | 'conferidor' | 'integrador';
  missao: string;
  /** Intervalo da rotina, em ms. Ausente quando não há rotina agendada. */
  intervaloMs?: number;
  /** Explica por que o robô não tem rotina agendada. */
  motivoSemRotina?: string;
}

interface RegistroRobo extends DefinicaoRoboDP {
  executando: boolean;
  execucoes: number;
  falhas: number;
  puladasPorSobreposicao: number;
  ultimaExecucao: string | null;
  ultimaDuracaoMs: number | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
  /** Resumo, em uma frase, do que a última rodada encontrou ou corrigiu. */
  ultimoResultado: string | null;
  /** Alerta que o painel de Saúde dos robôs mostra em destaque (ex.: backup do banco há mais de 26 h sem rodar). */
  alerta: { nivel: 'aviso' | 'critico'; texto: string } | null;
}

const iniciadoEm = new Date();
const robos = new Map<string, RegistroRobo>();

export function registrarRobo(definicao: DefinicaoRoboDP): void {
  const existente = robos.get(definicao.id);
  if (existente) {
    Object.assign(existente, definicao);
    return;
  }
  robos.set(definicao.id, {
    ...definicao,
    executando: false,
    execucoes: 0,
    falhas: 0,
    puladasPorSobreposicao: 0,
    ultimaExecucao: null,
    ultimaDuracaoMs: null,
    ultimoErro: null,
    ultimoErroEm: null,
    ultimoResultado: null,
    alerta: null,
  });
}

/** Define (ou limpa, com null) o alerta em destaque de um robô no painel de Saúde dos robôs. */
export function definirAlertaRobo(id: string, alerta: { nivel: 'aviso' | 'critico'; texto: string } | null): void {
  const robo = robos.get(id);
  if (robo) robo.alerta = alerta ? { nivel: alerta.nivel, texto: alerta.texto.slice(0, 400) } : null;
}

/** Guarda o resumo da última rodada para a tela e a Agente IA mostrarem o que o robô fez de verdade. */
export function registrarResultadoRobo(id: string, resumo: string): void {
  const robo = robos.get(id);
  if (robo) robo.ultimoResultado = resumo.slice(0, 300);
}

/**
 * Executa a rotina do robô sem sobreposição. Se a rodada anterior ainda não terminou, esta é
 * pulada e contada. Erros ficam registrados e não derrubam o processo.
 */
export async function executarRobo<T>(id: string, rotina: () => Promise<T>): Promise<T | undefined> {
  const robo = robos.get(id);
  if (!robo) return rotina();
  if (robo.executando) {
    robo.puladasPorSobreposicao += 1;
    return undefined;
  }
  robo.executando = true;
  const inicio = Date.now();
  try {
    const resultado = await rotina();
    robo.execucoes += 1;
    return resultado;
  } catch (erro: any) {
    robo.falhas += 1;
    robo.ultimoErro = String(erro?.message || 'Falha sem mensagem.').slice(0, 300);
    robo.ultimoErroEm = new Date().toISOString();
    throw erro;
  } finally {
    robo.ultimaDuracaoMs = Date.now() - inicio;
    robo.ultimaExecucao = new Date().toISOString();
    robo.executando = false;
  }
}

// Rodada manual ("Rodar agora"): cada robô que pode ser disparado na hora registra aqui a mesma rotina que o
// agendador usa. Disparar não muda o agendamento; a trava de sobreposição de executarRobo continua valendo.
const rotinasManuais = new Map<string, () => unknown>();

/** Registra a rotina que o botão "Rodar agora" (e a Agente IA) dispara para o robô. Só robôs já registrados. */
export function registrarRotinaManual(id: string, rotina: () => unknown): void {
  if (robos.has(id)) rotinasManuais.set(id, rotina);
}

export type ResultadoRodarAgora = { ok: true } | { ok: false; codigo: 'desconhecido' | 'sem_rotina_manual' | 'ja_rodando'; motivo: string };

/** Dispara a rodada do robô agora, sem esperar o próximo horário. Não espera o fim da rodada (o resultado aparece no painel). */
export function dispararRoboAgora(id: string): ResultadoRodarAgora {
  const robo = robos.get(id);
  if (!robo) return { ok: false, codigo: 'desconhecido', motivo: 'Robô não encontrado.' };
  const rotina = rotinasManuais.get(id);
  if (!rotina) return { ok: false, codigo: 'sem_rotina_manual', motivo: `${robo.nome} não pode ser disparado manualmente (ele não tem rotina automática ou depende de aprovação de uma pessoa).` };
  if (robo.executando) return { ok: false, codigo: 'ja_rodando', motivo: `${robo.nome} já está rodando agora; aguarde terminar.` };
  try { void Promise.resolve(rotina()).catch(() => undefined); } catch { /* a rotina registra o próprio erro */ }
  return { ok: true };
}

function estadoDe(robo: RegistroRobo, agora: number): EstadoRobo {
  if (!robo.intervaloMs) return 'aguardando_configuracao';
  if (robo.executando) return 'ativo';
  if (!robo.ultimaExecucao) {
    // Recém-iniciado: dá tempo de três intervalos antes de considerar parado.
    return agora - iniciadoEm.getTime() <= robo.intervaloMs * 3 ? 'ativo' : 'parado';
  }
  return agora - Date.parse(robo.ultimaExecucao) <= robo.intervaloMs * 3 ? 'ativo' : 'parado';
}

export function statusRobos(agora = Date.now()) {
  return {
    servidor: {
      iniciadoEm: iniciadoEm.toISOString(),
      // Valor baixo indica que o serviço acabou de (re)iniciar, por exemplo ao acordar do plano gratuito.
      tempoLigadoSegundos: Math.floor((agora - iniciadoEm.getTime()) / 1000),
    },
    robos: [...robos.values()].map((robo) => ({
      id: robo.id,
      nome: robo.nome,
      posto: robo.posto,
      missao: robo.missao,
      estado: estadoDe(robo, agora),
      executando: robo.executando,
      podeRodarAgora: rotinasManuais.has(robo.id),
      intervaloSegundos: robo.intervaloMs ? Math.round(robo.intervaloMs / 1000) : null,
      ultimaExecucao: robo.ultimaExecucao,
      ultimaDuracaoMs: robo.ultimaDuracaoMs,
      execucoes: robo.execucoes,
      falhas: robo.falhas,
      puladasPorSobreposicao: robo.puladasPorSobreposicao,
      ultimoErro: robo.ultimoErro,
      ultimoErroEm: robo.ultimoErroEm,
      ultimoResultado: robo.ultimoResultado,
      alerta: robo.alerta,
      motivoSemRotina: robo.intervaloMs ? null : (robo.motivoSemRotina || null),
    })),
  };
}

/** Somente para testes. */
export function limparRobosParaTeste(): void {
  robos.clear();
  rotinasManuais.clear();
}

/** Espera o robô terminar a rodada em andamento (o Agente 007 encadeia os robôs um depois do outro). true = terminou; false = passou do prazo. */
export async function esperarRoboLivre(id: string, prazoMs = 20 * 60_000, passoMs = 500): Promise<boolean> {
  const fim = Date.now() + prazoMs;
  while (robos.get(id)?.executando) {
    if (Date.now() > fim) return false;
    await new Promise((r) => setTimeout(r, passoMs));
  }
  return true;
}
/** Resumo da última rodada de um robô (para o 007 contar no relatório dele). */
export const ultimoResultadoRobo = (id: string): string | null => robos.get(id)?.ultimoResultado ?? null;
