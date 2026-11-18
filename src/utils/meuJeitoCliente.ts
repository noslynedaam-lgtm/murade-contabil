// "Meu jeito" no navegador: guarda o jeito efetivo (padrão do sistema, do escritório e da pessoa), ordena o menu e traduz
// as regras ensinadas em efeitos na tela. Nada aqui decide proteção: confirmações e travas continuam no servidor e nas telas.
import { useSyncExternalStore } from 'react';
import { ASSUNTOS_AGENTE, SECOES_DESTACAVEIS } from '../data/jeitoPadraoContabil';

export type RegraAtiva = { id: string; gatilho: { tipo: 'entrar_no_sistema' } | { tipo: 'abrir_tela'; tela: string }; acoes: Array<{ tipo: string; tela?: string; secao?: string; assunto?: string }> };
export type VisaoJeito = {
  sessoes: number; podeEditarEscritorio: boolean;
  efetivo: Record<string, any>; origem: Record<string, 'voce' | 'escritorio' | 'padrao'>;
  preferencias: Array<{ chave: string; rotulo: string; descricao: string; valor: any; valorTexto: string; origem: 'voce' | 'escritorio' | 'padrao'; escopoEscritorio: boolean; opcoes: Array<{ valor: string; rotulo: string }> | null; maxLista: number | null; valorEscritorio: any }>;
  receitas: Array<{ id: string; descricao: string; gatilho: any; acoes: any[]; origem: string; obsoleta: boolean; motivoObsoleta: string | null }>;
  receitasAtivas: RegraAtiva[];
  sugestoes: Array<{ id: string; texto: string; vezes: number }>;
  catalogo: { telas: Array<{ id: string; rotulo: string }>; secoes: Array<{ id: string; tela: string; rotulo: string }>; assuntos: Array<{ id: string; rotulo: string; frase: string }>; maxAcoes: number };
};

let visao: VisaoJeito | null = null;
const ouvintes = new Set<() => void>();
export const jeitoAtual = (): VisaoJeito | null => visao;
export function definirJeito(v: VisaoJeito | null): void { visao = v; ouvintes.forEach((f) => f()); }
export const useJeito = (): VisaoJeito | null => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => visao, () => null);

export async function chamarJeito<T = any>(url: string, metodo: 'GET' | 'POST' = 'GET', corpo?: object): Promise<T> {
  const r = await fetch(url, { method: metodo, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.sucesso !== true) throw new Error(d.motivo || 'Não foi possível concluir. Tente de novo.');
  return d as T;
}
export async function carregarJeito(): Promise<VisaoJeito | null> {
  try { const d = await chamarJeito<{ jeito: VisaoJeito }>('/api/meu-jeito'); definirJeito(d.jeito); return d.jeito; } catch { return visao; }
}

/** Favoritos primeiro, na ordem escolhida; o resto na ordem de sempre. Ids que não existem no menu são ignorados. */
export function ordenarMenu<T extends { id: string }>(itens: T[], favoritos: unknown): T[] {
  const lista = Array.isArray(favoritos) ? favoritos.filter((x): x is string => typeof x === 'string') : [];
  const primeiros = lista.map((id) => itens.find((i) => i.id === id)).filter((x): x is T => Boolean(x)).filter((x, i, a) => a.indexOf(x) === i);
  return [...primeiros, ...itens.filter((i) => !primeiros.includes(i))];
}

export const idDoGatilho = (g: { tipo: string; tela?: string }): string => (g.tipo === 'entrar_no_sistema' ? 'entrar' : `abrir:${g.tela}`);
export function regraDoGatilho(regras: RegraAtiva[] | undefined, g: { tipo: string; tela?: string }): RegraAtiva | null {
  return (regras || []).find((r) => r.id === idDoGatilho(g)) ?? null;
}

export type EfeitoRegra = { tipo: 'atalho'; tela: string } | { tipo: 'destacar'; texto: string } | { tipo: 'perguntar'; frase: string };
/** Traduz os passos de uma regra, NA ORDEM, em efeitos. Passo que não existe mais no catálogo é ignorado. */
export function efeitosDaRegra(r: RegraAtiva | null): EfeitoRegra[] {
  const out: EfeitoRegra[] = [];
  for (const a of r?.acoes || []) {
    if (a.tipo === 'mostrar_atalho' && a.tela) out.push({ tipo: 'atalho', tela: a.tela });
    else if (a.tipo === 'destacar_secao') { const s = SECOES_DESTACAVEIS.find((x) => x.id === a.secao); if (s) out.push({ tipo: 'destacar', texto: s.texto }); }
    else if (a.tipo === 'perguntar_agente') { const s = ASSUNTOS_AGENTE.find((x) => x.id === a.assunto); if (s) out.push({ tipo: 'perguntar', frase: s.frase }); }
  }
  return out;
}

/** Junta as navegações de tela em pares (de -> para) e entrega em lotes; só ids de telas, nunca conteúdo. */
export class BufferObservacao {
  private pares: Array<{ de: string; para: string }> = [];
  constructor(private valido: (id: string) => boolean = () => true) {}
  registrar(de: string | null, para: string): void { if (de && de !== para && this.valido(de) && this.valido(para)) this.pares.push({ de, para }); }
  tamanho(): number { return this.pares.length; }
  esvaziar(): Array<{ de: string; para: string }> { const p = this.pares.slice(0, 50); this.pares = this.pares.slice(50); return p; }
}

/** O piloto visível guarda o ritmo em localStorage; a preferência da pessoa vira o ritmo inicial (só se ela definiu; senão não mexe). */
export function aplicarRitmoDoPiloto(v: VisaoJeito | null, gravar: (ritmo: string) => void): void {
  if (!v || v.origem.velocidadePiloto === 'padrao') return;
  const r = v.efetivo.velocidadePiloto;
  if (r === 'devagar' || r === 'normal' || r === 'rapido') gravar(r);
}
