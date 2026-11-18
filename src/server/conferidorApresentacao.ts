// Confere, só em leitura, se a apresentação falada (src/data/apresentacaoSistema.ts) ainda bate com o código:
// todo robô registrado, toda rota de integração e toda tela do menu precisa ter bloco, e todo bloco precisa citar algo que existe.
// Usado pelo teste (falha na compilação) e pelo Robô Conferidor da Apresentação (avisa o dono do sistema se algo novo não tem bloco).
import { INTEGRACOES_APRESENTACAO, ROBOS_APRESENTACAO, SISTEMAS_QUE_CONVERSAM, montarApresentacao } from '../data/apresentacaoSistema';
import { MODULOS_JEITO_PADRAO } from '../data/jeitoPadraoContabil';
import { TELAS_CONTABIL } from '../data/mapaTelasContabil';
import { SISTEMAS } from './agentesEntreSistemas';

export type ProblemaApresentacao = { tipo: 'robo_sem_bloco' | 'bloco_de_robo_inexistente' | 'robo_diferente' | 'rota_sem_bloco' | 'rota_inexistente' | 'tela_sem_bloco' | 'bloco_de_tela_inexistente' | 'sistema_sem_bloco' | 'bloco_repetido' | 'codigo_ilegivel'; chave: string; detalhe: string };
export type RelatorioApresentacao = { verificados: number; problemas: ProblemaApresentacao[] };

const calcularIntervalo = (expr: string): number | null => (/^[0-9_ *]+$/.test(expr.trim()) ? Number(Function(`"use strict";return (${expr.replace(/_/g, '')})`)()) : null);

/** Lê (id, nome, intervalo) de cada registrarRobo({...}) do server.ts. */
export function robosDoServidor(codigo: string): Array<{ id: string; nome: string; intervaloMs: number | null }> {
  const saida: Array<{ id: string; nome: string; intervaloMs: number | null }> = [];
  const re = /registrarRobo\(\{\s*id:\s*"([a-z_]+)",\s*nome:\s*"([^"]+)"([^]*?)\}\)/g;
  for (const m of codigo.matchAll(re)) {
    const i = /intervaloMs:\s*([0-9_ *]+?)\s*[,}]/.exec(`${m[3]} }`);
    saida.push({ id: m[1], nome: m[2], intervaloMs: i ? calcularIntervalo(i[1]) : null });
  }
  return saida;
}
export const rotasDeIntegracaoDoServidor = (codigo: string): string[] => [...codigo.matchAll(/app\.(get|post|put|delete)\("(\/api\/integracao\/[^"]+)"/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);

export function conferirApresentacao(ler: (caminho: string) => string | null): RelatorioApresentacao {
  const problemas: ProblemaApresentacao[] = []; let verificados = 0;
  const codigo = ler('server.ts');
  if (!codigo) return { verificados: 0, problemas: [{ tipo: 'codigo_ilegivel', chave: 'server.ts', detalhe: 'Não consegui ler o server.ts.' }] };
  // robôs
  const servidor = robosDoServidor(codigo); const dados = new Map(ROBOS_APRESENTACAO.map((r) => [r.id, r]));
  for (const r of servidor) {
    verificados += 1; const d = dados.get(r.id);
    if (!d) { problemas.push({ tipo: 'robo_sem_bloco', chave: r.id, detalhe: `O robô "${r.nome}" existe no servidor e não tem bloco na apresentação.` }); continue; }
    if (d.nome !== r.nome || d.intervaloMs !== r.intervaloMs) problemas.push({ tipo: 'robo_diferente', chave: r.id, detalhe: `O bloco de "${r.nome}" diz nome/intervalo diferentes do servidor (${d.nome}, ${d.intervaloMs}; servidor: ${r.nome}, ${r.intervaloMs}).` });
  }
  for (const id of dados.keys()) if (!servidor.some((r) => r.id === id)) problemas.push({ tipo: 'bloco_de_robo_inexistente', chave: id, detalhe: `A apresentação fala do robô "${id}", que não está registrado no servidor.` });
  // rotas de integração
  const rotasReais = rotasDeIntegracaoDoServidor(codigo); const rotasListadas = INTEGRACOES_APRESENTACAO.flatMap((i) => i.rotas);
  for (const r of rotasReais) { verificados += 1; if (!rotasListadas.includes(r)) problemas.push({ tipo: 'rota_sem_bloco', chave: r, detalhe: `A rota de integração ${r} existe e não está em nenhum bloco da apresentação.` }); }
  for (const r of rotasListadas) if (!rotasReais.includes(r)) problemas.push({ tipo: 'rota_inexistente', chave: r, detalhe: `A apresentação cita a rota ${r}, que não existe no servidor.` });
  // telas
  const ids = new Set(MODULOS_JEITO_PADRAO.map((m) => m.id));
  for (const t of TELAS_CONTABIL) { verificados += 1; if (!ids.has(t.id)) problemas.push({ tipo: 'tela_sem_bloco', chave: t.id, detalhe: `A tela "${t.rotulo}" existe no menu e não tem bloco na apresentação.` }); }
  for (const id of ids) if (!TELAS_CONTABIL.some((t) => t.id === id)) problemas.push({ tipo: 'bloco_de_tela_inexistente', chave: id, detalhe: `A apresentação fala da tela "${id}", que não existe no menu.` });
  // sistemas que conversam
  for (const s of SISTEMAS.filter((x) => x !== 'contabil')) { verificados += 1; if (!SISTEMAS_QUE_CONVERSAM.includes(s)) problemas.push({ tipo: 'sistema_sem_bloco', chave: s, detalhe: `A Agente conversa com o sistema "${s}" e a apresentação não o cita.` }); }
  for (const s of SISTEMAS_QUE_CONVERSAM) if (!(SISTEMAS as string[]).includes(s)) problemas.push({ tipo: 'bloco_de_tela_inexistente', chave: s, detalhe: `A apresentação cita o sistema "${s}", que não existe.` });
  // blocos
  const blocos = montarApresentacao(true); const vistos = new Set<string>();
  for (const b of blocos) { if (vistos.has(b.id)) problemas.push({ tipo: 'bloco_repetido', chave: b.id, detalhe: `Bloco repetido: ${b.id}.` }); vistos.add(b.id); if (b.tela && !ids.has(b.tela)) problemas.push({ tipo: 'bloco_de_tela_inexistente', chave: b.id, detalhe: `O bloco ${b.id} aponta para a tela "${b.tela}", que não existe.` }); }
  return { verificados, problemas };
}
export const resumoRelatorioApresentacao = (r: RelatorioApresentacao): string => (r.problemas.length ? `${r.problemas.length} problema(s) na apresentação: ${r.problemas.slice(0, 4).map((p) => p.detalhe).join(' | ')}` : `Apresentação em dia com o código (${r.verificados} itens conferidos).`);
