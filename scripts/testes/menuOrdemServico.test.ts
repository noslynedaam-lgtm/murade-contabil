// Menu lateral na ORDEM DO SERVIÇO (27/11/2026, pedido do Natan via dono): começa pelo que se faz primeiro e segue a sequência
// natural da contabilidade, por etapa; a Escola fica por último; ids e telas não mudam; tour, mapa, jeito padrão e piloto seguem a mesma ordem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ETAPAS_MENU_CONTABIL, conferirOrdemDoMenuContabil, itensDoMenuNoSidebar } from '../../src/data/mapaTelasContabil';
import { ORDEM_MENU_CONTABIL, PARADAS_TOUR_CONTABIL, FORA_DO_TOUR_CONTABIL } from '../../src/data/tourParadasContabil';
import { MODULOS_JEITO_PADRAO } from '../../src/data/jeitoPadraoContabil';
import { conferirMapaPiloto } from '../../src/server/conferidorPiloto';

const ler = (c: string) => { try { return readFileSync(c, 'utf8'); } catch { return null; } };
const sidebar = ler('src/components/Sidebar.tsx')!;
const itens = itensDoMenuNoSidebar(sidebar);
const pos = (id: string) => itens.findIndex((i) => i.id === id);

test('todo item do menu tem etapa; etapas na ordem do serviço; Início primeiro e Escola por último', () => {
  assert.equal(itens.length, [...sidebar.matchAll(/id: "([a-z-]+)" as TabId/g)].length, 'item do menu sem grupo');
  assert.deepEqual(conferirOrdemDoMenuContabil(sidebar), []);
  assert.deepEqual(itens.map((i) => i.grupo).filter((g, k, a) => g && g !== a[k - 1]), ETAPAS_MENU_CONTABIL);
});

test('a sequência do trabalho: Empresa → Plano de contas → lançamentos → fechamento → obrigações → relatórios → robôs → ferramentas → configurações → Escola', () => {
  const seq = ['inicio', 'empresa', 'plano-contas', 'integracao', 'revisao-origens', 'lancamentos', 'aprovacoes', 'gestao-contabil', 'balancete', 'livros', 'modulos-finais', 'demonstracoes', 'agente', 'calculadora', 'conexoes', 'escola'];
  for (let i = 1; i < seq.length; i++) assert.ok(pos(seq[i - 1]) < pos(seq[i]), `${seq[i - 1]} tem que vir antes de ${seq[i]}`);
  assert.equal(itens.find((i) => i.id === 'calculadora')!.grupo, 'Ferramentas');
});

test('o conferidor acusa etapa fora da ordem', () => {
  assert.ok(conferirOrdemDoMenuContabil(sidebar.replace('grupo: "Cadastros"', 'grupo: "Ferramentas"')).length > 0);
});

test('título discreto da etapa no menu (e "Favoritos" para os atalhos do Meu jeito), com o id dos botões intacto', () => {
  assert.match(sidebar, /data-testid="titulo-etapa-menu"/);
  assert.match(sidebar, /text-\[10px\] font-bold uppercase/);
  assert.match(sidebar, /"Favoritos"/);
  assert.match(sidebar, /id=\{`btn-menu-\$\{item\.id\}`\}/);
});

test('tour, jeito padrão (apresentação) e piloto seguem a ordem do menu', () => {
  assert.deepEqual(ORDEM_MENU_CONTABIL, itens.map((i) => i.id));
  assert.deepEqual(PARADAS_TOUR_CONTABIL.map((p) => p.rota), itens.map((i) => i.id).filter((id) => !FORA_DO_TOUR_CONTABIL.includes(id)));
  assert.deepEqual(MODULOS_JEITO_PADRAO.map((m) => m.id), itens.map((i) => i.id).filter((id) => MODULOS_JEITO_PADRAO.some((m) => m.id === id)));
  assert.deepEqual(conferirMapaPiloto(ler).problemas, []);
});
