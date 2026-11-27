// Tour guiado e oferta de aula no Murad Contábil: paradas do mapa e do menu, destinos válidos, aulas por tela e ligação nas telas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { aulaDaTela, conferirAulasNasTelas, conferirParadasTour, TOUR_FALA_MAX } from '../../src/data/tourMurad';
import { FALAS_TOUR_CONTABIL, FORA_DO_TOUR_CONTABIL, ORDEM_MENU_CONTABIL, PARADAS_TOUR_CONTABIL, ROTAS_VALIDAS_CONTABIL } from '../../src/data/tourParadasContabil';
import { AULA_PRINCIPAL_DA_TELA, aulasComTela } from '../../src/data/tourAulasContabil';
import { buscarAula } from '../../src/data/escolaConteudo';
import { conferirMapaPiloto } from '../../src/server/conferidorPiloto';

const raiz = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');

test('a ordem do tour é a do menu lateral e passa por todas as telas do menu (menos a Escola e o atalho da IA)', () => {
  const doMenu = [...ler('src/components/Sidebar.tsx').matchAll(/id: "([a-z-]+)" as TabId/g)].map((m) => m[1]);
  assert.deepEqual(doMenu, ORDEM_MENU_CONTABIL);
  assert.deepEqual(PARADAS_TOUR_CONTABIL.map((p) => p.rota), doMenu.filter((id) => !FORA_DO_TOUR_CONTABIL.includes(id)));
  assert.deepEqual(conferirParadasTour(PARADAS_TOUR_CONTABIL, ROTAS_VALIDAS_CONTABIL), []);
  for (const p of PARADAS_TOUR_CONTABIL) { assert.ok(FALAS_TOUR_CONTABIL[p.rota], `tela ${p.rota} sem frase própria`); assert.ok(p.fala.length <= TOUR_FALA_MAX); }
  // Toda rota válida existe no tipo TabId e é exibida pelo App.
  const tipos = ler('src/types.ts'); const app = ler('src/App.tsx');
  for (const r of ROTAS_VALIDAS_CONTABIL) { assert.match(tipos, new RegExp(`\\|\\s*"${r}"`), r); assert.ok(app.includes(`tabAtiva === "${r}"`), r); }
  assert.ok(!/alter\s*data/i.test(JSON.stringify(PARADAS_TOUR_CONTABIL)));
});

test('toda aula abre uma tela que existe; cada tela oferece a aula dela; a Murad acha as aulas novas pelo assunto', () => {
  assert.deepEqual(conferirAulasNasTelas(aulasComTela(), ROTAS_VALIDAS_CONTABIL), []);
  for (const [tela, id] of Object.entries(AULA_PRINCIPAL_DA_TELA)) assert.equal(aulaDaTela(aulasComTela(), tela)?.id, id);
  for (const [assunto, id] of [['importação que pausa e continua', 'migracao-pausa-continua'], ['migração que pausa', 'migracao-pausa-continua'], ['empresa do topo', 'empresa-do-topo']] as const)
    assert.equal(buscarAula(assunto)?.id, id, assunto);
});

test('o robô conferidor do piloto também confere o tour e as aulas', () => {
  const r = conferirMapaPiloto((c) => { try { return ler(c); } catch { return null; } });
  assert.deepEqual(r.problemas, []);
  assert.match(ler('src/server/conferidorPiloto.ts'), /conferirParadasTour\(PARADAS_TOUR_CONTABIL/);
});

test('ligações: App monta o tour e a oferta, a Murad entende o pedido, a Escola tem "Fazer tour" e o servidor manda a data do escritório', () => {
  const app = ler('src/App.tsx');
  assert.match(app, /<TourMurad paradas=\{PARADAS_TOUR_CONTABIL\}/);
  assert.match(app, /<OfertaAulaTela tela=\{String\(tabAtiva\)\}/);
  assert.match(app, /id="conteudo-principal-contabil"/);
  assert.match(ler('src/components/IAMuradModal.tsx'), /tratarFraseDoTour\(texto\)/);
  const escola = ler('src/components/escola/TelaEscolaMurade.tsx');
  assert.match(escola, /id="escola-fazer-tour"/); assert.match(escola, /consumirAulaPendente\(\)/);
  assert.match(ler('src/server/escolaRotas.ts'), /camposPrimeiraSemana\(q\.tenantId, q\.userId, d\.criadoEmDoEscritorio\)/);
  assert.match(ler('server.ts'), /criadoEmDoEscritorio: async \(tenantId\) => \{ const r = await consultaBancoContabil\(sqlCriadoEmDoEscritorio\('contabil_auth_users'\)/);
  assert.ok(!/escolaConteudo|tourAulasContabil/.test(ler('src/data/tourParadasContabil.ts')));
});
