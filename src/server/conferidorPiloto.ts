// Robô Conferidor do Piloto Visível: varre, só em leitura, o código das telas e confere se todo alvo do mapa
// (src/data/mapaTelasContabil.ts) ainda existe. Se alguém renomear um campo, botão, tela ou seção, o piloto deixaria
// de achar o ponto na tela: este robô avisa o dono do sistema antes de o contador perceber.
// Nunca altera arquivo nem dado: só lê.
import { CAMPOS_CONTABIL, SECOES_CONTABIL, TELAS_CONTABIL, type CampoMapa } from '../data/mapaTelasContabil';
import { conferirAulasNasTelas, conferirParadasTour } from '../data/tourMurad';
import { AREA_PRINCIPAL_CONTABIL, PARADAS_TOUR_CONTABIL, ROTAS_VALIDAS_CONTABIL } from '../data/tourParadasContabil';
import { aulasComTela } from '../data/tourAulasContabil';

export type ProblemaPiloto = { tipo: 'tela' | 'menu' | 'campo' | 'botao_final' | 'botao_abrir' | 'secao' | 'periodo' | 'montagem' | 'arquivo' | 'tour'; chave: string; detalhe: string };
export type RelatorioPiloto = { verificadoEm: string; verificados: number; problemas: ProblemaPiloto[] };
export type LerArquivo = (caminho: string) => string | null;

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Confere o mapa contra o código. `ler` devolve o texto do arquivo (caminho relativo à raiz do projeto) ou null se não existir. */
export function conferirMapaPiloto(ler: LerArquivo, agora = new Date()): RelatorioPiloto {
  const problemas: ProblemaPiloto[] = [];
  let verificados = 0;
  const cache = new Map<string, string | null>();
  const arq = (c: string) => { if (!cache.has(c)) cache.set(c, ler(c)); return cache.get(c) ?? null; };
  const tipos = arq('src/types.ts'), side = arq('src/components/Sidebar.tsx'), app = arq('src/App.tsx');
  for (const [nome, v] of [['src/types.ts', tipos], ['src/components/Sidebar.tsx', side], ['src/App.tsx', app]] as const) if (v === null) problemas.push({ tipo: 'arquivo', chave: nome, detalhe: 'Arquivo não encontrado.' });

  verificados += 1;
  if (side !== null && !side.includes('id={`btn-menu-${item.id}`}')) problemas.push({ tipo: 'menu', chave: 'btn-menu-*', detalhe: 'O botão do menu lateral não usa mais o id btn-menu-<tela>; o piloto não consegue abrir telas pelo menu.' });
  verificados += 1;
  if (app !== null && !app.includes('<PilotoVisivel')) problemas.push({ tipo: 'montagem', chave: 'PilotoVisivel', detalhe: 'O componente PilotoVisivel não está montado no App.' });

  for (const t of TELAS_CONTABIL) {
    verificados += 1;
    if (tipos !== null && !new RegExp(`\\|\\s*"${t.id}"`).test(tipos)) problemas.push({ tipo: 'tela', chave: t.id, detalhe: `A tela "${t.rotulo}" não está mais no tipo TabId.` });
    if (side !== null && !side.includes(`id: "${t.id}" as TabId`)) problemas.push({ tipo: 'menu', chave: t.id, detalhe: `A tela "${t.rotulo}" não está mais no menu lateral.` });
    if (app !== null && !app.includes(`tabAtiva === "${t.id}"`)) problemas.push({ tipo: 'tela', chave: t.id, detalhe: `A tela "${t.rotulo}" não é mais exibida pelo App.` });
    if (t.periodo && !CAMPOS_CONTABIL.some((c) => c.chave === t.periodo && c.tela === t.id)) problemas.push({ tipo: 'periodo', chave: t.periodo, detalhe: `O campo de competência de "${t.rotulo}" não está no mapa de campos.` });
  }

  const marcador = (c: CampoMapa) => (c.porId ? `id="${c.chave}"` : `data-campo="${c.chave}"`);
  for (const c of CAMPOS_CONTABIL) {
    verificados += 1;
    const txt = arq(c.arquivo);
    if (txt === null) { problemas.push({ tipo: 'arquivo', chave: c.chave, detalhe: `Arquivo ${c.arquivo} não encontrado.` }); continue; }
    const i = txt.indexOf(marcador(c));
    if (i < 0) { problemas.push({ tipo: 'campo', chave: c.chave, detalhe: `${c.rotulo}: não achei ${marcador(c)} em ${c.arquivo}.` }); continue; }
    // O atributo de segurança precisa estar no MESMO elemento (até o fechamento da tag de abertura).
    const fim = txt.indexOf('>', i);
    const tag = txt.slice(Math.max(0, txt.lastIndexOf('<', i)), fim < 0 ? i + 400 : fim + 1);
    if (c.final && !tag.includes(`data-piloto-final="${c.final}"`)) problemas.push({ tipo: 'botao_final', chave: c.chave, detalhe: `${c.rotulo}: o botão perdeu data-piloto-final="${c.final}" (o piloto trataria como botão comum).` });
    if (c.abre && !tag.includes('data-piloto-abrir')) problemas.push({ tipo: 'botao_abrir', chave: c.chave, detalhe: `${c.rotulo}: o botão perdeu data-piloto-abrir (o piloto não poderia abrir o formulário).` });
  }
  for (const s of SECOES_CONTABIL) {
    verificados += 1;
    const txt = arq(s.arquivo);
    if (txt === null) { problemas.push({ tipo: 'arquivo', chave: s.chave, detalhe: `Arquivo ${s.arquivo} não encontrado.` }); continue; }
    if (!semAcento(txt).includes(semAcento(s.texto))) problemas.push({ tipo: 'secao', chave: s.chave, detalhe: `O título "${s.texto}" não aparece mais em ${s.arquivo}.` });
  }
  // Tour guiado e aulas da Escola: toda parada e todo "Me mostra" apontam para tela que existe; cada parada está no menu; a área
  // destacada, o tour no App e o botão "Fazer tour" da Escola continuam no código.
  for (const m of [...conferirParadasTour(PARADAS_TOUR_CONTABIL, ROTAS_VALIDAS_CONTABIL), ...conferirAulasNasTelas(aulasComTela(), ROTAS_VALIDAS_CONTABIL)]) problemas.push({ tipo: 'tour', chave: 'tour', detalhe: m });
  for (const p of PARADAS_TOUR_CONTABIL) {
    verificados += 1;
    if (side !== null && !side.includes(`id: "${p.rota}" as TabId`)) problemas.push({ tipo: 'tour', chave: p.rota, detalhe: `Tour: a tela "${p.nome}" não está mais no menu lateral.` });
  }
  verificados += aulasComTela().length + 3;
  if (app !== null && !app.includes(`id="${AREA_PRINCIPAL_CONTABIL.slice(1)}"`)) problemas.push({ tipo: 'tour', chave: AREA_PRINCIPAL_CONTABIL, detalhe: 'Tour: a área principal que o tour destaca não existe mais no App.' });
  if (app !== null && !app.includes('<TourMurad')) problemas.push({ tipo: 'montagem', chave: 'TourMurad', detalhe: 'O tour guiado não está montado no App.' });
  const escola = arq('src/components/escola/TelaEscolaMurade.tsx');
  if (escola !== null && !escola.includes('id="escola-fazer-tour"')) problemas.push({ tipo: 'tour', chave: 'escola-fazer-tour', detalhe: 'Tour: o botão "Fazer tour" sumiu da Escola.' });
  return { verificadoEm: agora.toISOString(), verificados, problemas };
}

export const resumoRelatorioPiloto = (r: RelatorioPiloto): string =>
  r.problemas.length
    ? `ATENÇÃO: ${r.problemas.length} ponto(s) do Piloto Visível não existem mais na tela: ${r.problemas.slice(0, 5).map((p) => p.chave).join(', ')}${r.problemas.length > 5 ? '…' : ''}. A Agente não vai conseguir mostrar/preencher isso até o mapa ser atualizado.`
    : `Piloto Visível conferido: ${r.verificados} pontos do mapa existem no código.`;
