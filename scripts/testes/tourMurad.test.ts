// Tour guiado da Murad e oferta de aula na primeira semana: parte PURA, igual no DP, Fiscal e Contábil.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FRASE_FIM_TOUR, FRASE_INICIO_TOUR, OFERTA_AULA_DIAS, SITUACAO_INICIAL, TOUR_MS_MAX, TOUR_MS_MIN, TOUR_RETOMAR_MS,
  aulaDaTela, comandoDoTour, conferirAulasNasTelas, conferirParadasTour, deveOferecerAula, dentroDaPrimeiraSemana, ehPedidoDeTour,
  falaCurta, lerEstadoOfertaAula, montarParadas, registrarRespostaOfertaAula, tempoDaParada, tourPodeRetomar, transicaoTour, type SituacaoTour,
} from '../../src/data/tourMurad';
import { tourAtivo, tratarFraseDoTour, definirTourAtivo } from '../../src/utils/tourMuradBarramento';
import { camposPrimeiraSemana, sqlCriadoEmDoEscritorio } from '../../src/server/primeiraSemanaEscritorio';

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

test('"Murad, me mostra o sistema" e variações pedem o tour; "o que o sistema faz" e "me mostra onde" não', () => {
  for (const f of ['Murad, me mostra o sistema', 'me mostra o sistema', 'Mostra o sistema todo', 'me apresenta o sistema', 'Murad me apresenta o sistema inteiro',
    'mostra o sistema pra mim', 'me mostra todas as telas', 'faz um tour', 'quero fazer um tour pelo sistema', 'tour', 'quero conhecer o sistema', 'Murade, mostra o sistema por favor'])
    assert.equal(ehPedidoDeTour(f), true, f);
  for (const f of ['me mostra o que o sistema faz', 'o que o sistema faz?', 'me mostra onde fica a folha', 'me mostra a folha', 'como funciona o sistema',
    'me conta tudo o que o sistema faz', 'me mostra o funcionário João', 'mostra o sistema de notas da empresa X que deu erro ontem à noite no envio'])
    assert.equal(ehPedidoDeTour(f), false, f);
});

test('comandos do tour: próxima, volta, pausa, continua e sair', () => {
  assert.equal(comandoDoTour('próxima'), 'proxima');
  assert.equal(comandoDoTour('Murad, próxima tela'), 'proxima');
  assert.equal(comandoDoTour('pula'), 'proxima');
  assert.equal(comandoDoTour('volta'), 'anterior');
  assert.equal(comandoDoTour('pausa o tour'), 'pausar');
  assert.equal(comandoDoTour('continua o tour'), 'continuar');
  assert.equal(comandoDoTour('sair do tour'), 'sair');
  assert.equal(comandoDoTour('sair'), 'sair');
  assert.equal(comandoDoTour('qual é a próxima guia a vencer?'), null);
});

test('máquina do tour: anda, pausa quando a pessoa mexe, volta sozinha, próxima, anterior, fim e sair', () => {
  let s: SituacaoTour = transicaoTour(SITUACAO_INICIAL, 'iniciar', 3);
  assert.deepEqual([s.estado, s.indice, s.total], ['andando', 0, 3]);
  s = transicaoTour(s, 'tempo'); assert.equal(s.indice, 1);
  s = transicaoTour(s, 'mexeu'); assert.deepEqual([s.estado, s.pausaPorMexer], ['pausado', true]);
  s = transicaoTour(s, 'tempo'); assert.equal(s.indice, 1, 'pausado não avança');
  assert.equal(tourPodeRetomar(s, TOUR_RETOMAR_MS - 1, false), false);
  assert.equal(tourPodeRetomar(s, TOUR_RETOMAR_MS, true), false, 'digitando num campo não volta sozinho');
  assert.equal(tourPodeRetomar(s, TOUR_RETOMAR_MS, false), true);
  s = transicaoTour(s, 'retomar_sozinho'); assert.equal(s.estado, 'andando');
  s = transicaoTour(s, 'pausar'); assert.deepEqual([s.estado, s.pausaPorMexer], ['pausado', false]);
  assert.equal(tourPodeRetomar(s, 60_000, false), false, 'pausa pelo botão só volta com Continuar');
  s = transicaoTour(s, 'continuar'); assert.equal(s.estado, 'andando');
  s = transicaoTour(s, 'anterior'); assert.equal(s.indice, 0);
  s = transicaoTour(s, 'anterior'); assert.equal(s.indice, 0);
  s = transicaoTour(s, 'proxima'); s = transicaoTour(s, 'proxima'); assert.equal(s.indice, 2);
  s = transicaoTour(s, 'tempo'); assert.equal(s.estado, 'fim');
  s = transicaoTour(s, 'sair'); assert.equal(s.estado, 'inativo');
  assert.equal(transicaoTour(SITUACAO_INICIAL, 'iniciar', 0).estado, 'inativo', 'sem paradas não começa');
});

test('cada tela fica de 4 a 6 segundos e a frase é curta', () => {
  assert.equal(tempoDaParada(''), TOUR_MS_MIN);
  assert.equal(tempoDaParada('x'.repeat(400)), TOUR_MS_MAX);
  const f = falaCurta('Visão geral da empresa ativa, prazos, alertas de vencimento e tarefas, busca no topo e abas rápidas (Folha, Férias, 13º e muito mais coisas). Segunda frase.');
  assert.ok(f.length <= 121 && f.endsWith('.'), f);
  assert.equal(falaCurta('Uma frase. Outra.'), 'Uma frase.');
  assert.match(FRASE_FIM_TOUR, /Quer uma aula de alguma tela\? É só pedir\./);
  assert.match(FRASE_INICIO_TOUR, /Sair do tour/);
});

test('paradas: na ordem, sem repetir, sem as de fora; conferência acusa destino que não existe', () => {
  const p = montarParadas([{ rota: 'a', nome: 'A', texto: 'Tela A.' }, { rota: 'b', nome: 'B', texto: 'Tela B.' }, { rota: 'a', nome: 'A2', texto: 'x' }, { rota: 'escola', nome: 'Escola', texto: 'x' }], ['escola']);
  assert.deepEqual(p.map((x) => x.rota), ['a', 'b']);
  assert.deepEqual(conferirParadasTour(p, ['a', 'b']), []);
  assert.equal(conferirParadasTour(p, ['a']).length, 1);
  assert.equal(conferirAulasNasTelas([{ id: 'x', meMostra: { tela: 'zz' } }], ['a']).length, 1);
});

test('oferta de aula: só nos 7 primeiros dias do escritório, uma vez por tela, e "Não perguntar mais" desliga', () => {
  const criado = '2026-11-20T12:00:00.000Z';
  const dia = 24 * 60 * 60_000;
  const t0 = Date.parse(criado);
  assert.equal(dentroDaPrimeiraSemana(criado, t0 + 3 * dia), true);
  assert.equal(dentroDaPrimeiraSemana(criado, t0 + (OFERTA_AULA_DIAS + 1) * dia), false);
  assert.equal(dentroDaPrimeiraSemana(null, t0), false, 'sem a data do escritório não oferece');
  let e = lerEstadoOfertaAula('{lixo');
  const base = { criadoEm: criado, agoraMs: t0 + dia, tela: 'folha', temAula: true, ocupado: false };
  assert.equal(deveOferecerAula({ ...base, estado: e }), true);
  assert.equal(deveOferecerAula({ ...base, estado: e, temAula: false }), false);
  assert.equal(deveOferecerAula({ ...base, estado: e, ocupado: true }), false, 'com o tour andando ou a Murad falando não oferece');
  e = registrarRespostaOfertaAula(e, 'folha', 'mostrada');
  assert.equal(deveOferecerAula({ ...base, estado: e }), false, 'uma vez por tela');
  assert.equal(deveOferecerAula({ ...base, estado: e, tela: 'ferias' }), true);
  e = registrarRespostaOfertaAula(e, 'ferias', 'nunca');
  assert.equal(deveOferecerAula({ ...base, estado: e, tela: 'rescisao' }), false, 'Não perguntar mais vale para todas as telas');
  assert.deepEqual(lerEstadoOfertaAula(JSON.stringify(e)), e);
  assert.equal(aulaDaTela([{ id: 'x', meMostra: { tela: 'a' } }, { id: 'y', meMostra: { tela: 'b' } }], 'b')?.id, 'y');
});

test('chat e voz: o pedido começa o tour e os comandos só valem com ele ligado', () => {
  definirTourAtivo(false);
  assert.equal(tratarFraseDoTour('próxima'), null);
  assert.equal(tratarFraseDoTour('Murad, me mostra o sistema'), FRASE_INICIO_TOUR);
  definirTourAtivo(true);
  assert.equal(tourAtivo(), true);
  assert.match(String(tratarFraseDoTour('próxima')), /Próxima/);
  definirTourAtivo(false);
});

test('primeira semana: o servidor manda a data do escritório e só códigos curtos (sem identificador cru)', async () => {
  const c = await camposPrimeiraSemana('tenant-123', 'user-9', async () => '2026-11-25T10:00:00Z');
  assert.equal(c.escritorioCriadoEm, '2026-11-25T10:00:00.000Z');
  assert.match(c.escritorioChave, /^[0-9a-f]{16}$/);
  assert.ok(!c.escritorioChave.includes('tenant') && c.usuarioChave !== c.escritorioChave);
  assert.equal((await camposPrimeiraSemana('t', 'u', async () => { throw new Error('sem banco'); })).escritorioCriadoEm, null);
  assert.match(sqlCriadoEmDoEscritorio('tabela_x'), /FROM tabela_x WHERE id::text=\$1 OR tenant_id::text=\$1/);
});

test('o tour SÓ navega e destaca: o componente nunca clica em nada da tela', () => {
  const fonte = ler('src/components/TourMurad.tsx');
  assert.ok(!/\.click\(/.test(fonte), 'o tour não pode chamar .click()');
  assert.ok(!/clicarComCursor|clicarMenu|dispatchEvent\(new MouseEvent/.test(fonte), 'o tour não pode apertar botão');
  assert.match(fonte, /navegarRef\.current\(p\.rota\)/);
  assert.match(fonte, /Pausar/); assert.match(fonte, /Próxima/); assert.match(fonte, /Sair do tour/);
  // Barra pequena embaixo (no celular não é faixa grande no topo).
  assert.match(fonte, /fixed bottom-2/);
  assert.ok(!/fixed top-0/.test(fonte));
  const oferta = ler('src/components/OfertaAulaTela.tsx');
  assert.match(oferta, /Sim/); assert.match(oferta, /Agora não/); assert.match(oferta, /Não perguntar mais/);
  assert.ok(!/fixed inset-0/.test(oferta), 'a oferta não é janela que cobre a tela');
});
