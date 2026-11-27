// Desligamento organizado do servidor (publicação/deploy). No Render, numa publicação sem disco, o servidor NOVO sobe e recebe o
// tráfego; 60 s depois o ANTIGO recebe SIGTERM e, passado o prazo de desligamento (maxShutdownDelaySeconds, padrão 30 s, máximo
// 300 s), SIGKILL. Aqui cada parte que tem trabalho longo (ex.: gravação da migração pelo backup) se inscreve com aoDesligar() e
// tem o prazo para terminar ou desfazer o que estava fazendo e marcar "pausado para atualização"; o servidor novo retoma sozinho.
// Sem nada inscrito (ou com tudo parado), o processo sai na hora, como antes.

type Tarefa = { nome: string; fn: (prazoMs: number) => Promise<void> };
const tarefas: Tarefa[] = [];
let desligando = false;
let instalado = false;

export const estaDesligando = (): boolean => desligando;
export function aoDesligar(nome: string, fn: (prazoMs: number) => Promise<void>): void {
  if (!tarefas.some((t) => t.nome === nome)) tarefas.push({ nome, fn });
}

/** Prazo que este processo usa para desligar: o do Render (MURADE_PRAZO_DESLIGAR_S, padrão 30 s) menos 5 s de folga. */
export function prazoDesligamentoMs(env: NodeJS.ProcessEnv = process.env): number {
  const s = Number(env.MURADE_PRAZO_DESLIGAR_S);
  const segundos = Number.isFinite(s) && s >= 10 && s <= 300 ? s : 30;
  return (segundos - 5) * 1000;
}

/** Roda as tarefas inscritas (todas juntas) até o prazo. Devolve as que não terminaram a tempo. */
export async function desligar(motivo: string, opcoes: { prazoMs?: number; log?: (t: string) => void } = {}): Promise<string[]> {
  const log = opcoes.log ?? ((t: string) => console.log(t));
  if (desligando) return [];
  desligando = true;
  const prazo = opcoes.prazoMs ?? prazoDesligamentoMs();
  log(`[desligamento] ${motivo} recebido: ${tarefas.length ? `encerrando ${tarefas.map((t) => t.nome).join(', ')} (até ${Math.round(prazo / 1000)} s)` : 'nada em andamento'}.`);
  const atrasadas = new Set(tarefas.map((t) => t.nome));
  await Promise.race([
    Promise.allSettled(tarefas.map(async (t) => {
      try { await t.fn(prazo); } catch (e) { log(`[desligamento] ${t.nome} falhou ao encerrar: ${(e as Error)?.message || e}`); }
      atrasadas.delete(t.nome);
    })),
    new Promise<void>((ok) => { const r = setTimeout(ok, prazo); r.unref?.(); }),
  ]);
  if (atrasadas.size) log(`[desligamento] não terminaram a tempo: ${[...atrasadas].join(', ')} (o banco desfaz o que estava aberto; o servidor novo retoma).`);
  return [...atrasadas];
}

/** Liga o tratamento de SIGTERM/SIGINT (uma vez). Depois das tarefas, sai com código 0. */
export function instalarDesligamento(opcoes: { sair?: (codigo: number) => void; log?: (t: string) => void } = {}): void {
  if (instalado) return;
  instalado = true;
  const sair = opcoes.sair ?? ((c: number) => process.exit(c));
  // Depois das tarefas, 1 s para as respostas que elas deram (ex.: lote "pausado") chegarem à tela antes de sair.
  const tratar = (sinal: string) => { void desligar(sinal, { log: opcoes.log }).then(() => new Promise((ok) => setTimeout(ok, 1000))).finally(() => sair(0)); };
  process.once('SIGTERM', () => tratar('SIGTERM'));
  process.once('SIGINT', () => tratar('SIGINT'));
}

/** Só para testes. */
export function reiniciarDesligamentoParaTeste(): void { desligando = false; tarefas.length = 0; }
