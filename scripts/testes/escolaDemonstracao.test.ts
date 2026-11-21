// "▶ Demonstração completa com a IA" da Escola Murade (Escola (Contábil)): ordem do roteiro, nomes iguais às telas reais, motor real,
// a demonstração nunca chama salvar/emitir/transmitir, controles (pausar/continuar/pular/parar), "sua vez" e registro no painel do gestor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ETAPAS_DEMO, IDS_ETAPAS_DEMO, PASSOS_QUE_CLICAM, EVENTO_AGENTE_PARAR, EVENTO_DEMO_COMANDO, avaliarCliqueSuaVez, botaoPodeSerClicadoPelaDemo, botoesSuaVez,
  conferirRoteiroDemo, etapaDoCalculo, etapasSuaVez, intencaoDemo, passosDaEtapa, registroDemoValido, tempoDeFalaDemo, transicaoDemo, valoresParaMotor, type EstadoDemo,
} from '../../src/data/escolaDemonstracao';
import { praticaPorId } from '../../src/data/escolaPratica';
import { simularPratica, IDS_EXEMPLOS } from '../../src/server/escolaExemplos';
import { conferirConteudoEscola, limparCacheLiberacao } from '../../src/server/escola';
import { registrarRotasEscola } from '../../src/server/escolaRotas';
import { FERRAMENTAS_ESCOLA } from '../../src/server/agenteEscola';
import { TELAS_CONTABIL } from '../../src/data/mapaTelasContabil';
import { kitContabil } from '../../src/server/agenteContabil';

const RAIZ = process.cwd();
const ler = (arq: string) => fs.readFileSync(path.join(RAIZ, arq), 'utf8');
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%º]+/g, '');

test('Escola (Contábil): roteiro na ordem pedida (lançamentos → conciliação → fechamento → balancete/DRE → ECD)', () => {
  assert.deepEqual(IDS_ETAPAS_DEMO, ['lancamentos', 'conciliacao', 'fechamento', 'balancete', 'ecd']);
  assert.deepEqual(conferirRoteiroDemo(), []);
  assert.deepEqual(conferirConteudoEscola(IDS_EXEMPLOS, '2026-11-20'), [], 'o Robô Conferidor da Escola também confere o roteiro');
});

test('Escola (Contábil): fiel às telas reais — menu do mapa de telas; campos e botões com o mesmo texto do código da tela', () => {
  for (const e of ETAPAS_DEMO) {
    const tela = TELAS_CONTABIL.find((t) => t.id === e.tela);
    assert.ok(tela, `${e.id}: tela ${e.tela} no mapa`);
    assert.equal(tela!.rotulo, e.menu, `${e.id}: o menu real se chama "${tela!.rotulo}"`);
    const codigo = e.arquivos.map(ler).join('\n');
    for (const b of [...(e.abrir ? [e.abrir] : []), ...e.sim, ...e.nao]) {
      const abrirComNome = /^Abrir (.+)$/.exec(b.rotulo);
      assert.ok(codigo.includes(b.rotulo) || (abrirComNome && codigo.includes('>Abrir {nome}<') && codigo.includes(abrirComNome[1])), `${e.id}: botão "${b.rotulo}" existe na tela real`);
    }
    const daPratica = e.praticaId ? praticaPorId(e.praticaId)!.campos.map((c) => c.rotulo) : [];
    for (const c of e.campos) assert.ok(norm(codigo).includes(norm(c.rotulo)) || daPratica.includes(c.rotulo), `${e.id}: campo "${c.rotulo}" com o nome da tela real (ou do simulador já existente)`);
  }
});

test('Escola (Contábil): NUNCA chama salvar/emitir/transmitir/gerar — só clica em menu e em abrir aba/formulário; o resto é só apontado', () => {
  for (const e of ETAPAS_DEMO) {
    const passos = passosDaEtapa(e);
    for (const p of passos.filter((x) => x.tipo === 'abrir')) assert.ok(botaoPodeSerClicadoPelaDemo(p.alvo), `${e.id}: ${p.alvo}`);
    for (const b of [...e.sim, ...e.nao]) assert.ok(!passos.some((p) => PASSOS_QUE_CLICAM.includes(p.tipo) && p.alvo === b.rotulo), `${e.id}: "${b.rotulo}" nunca é clicado`);
    for (const b of e.sim) assert.ok(passos.some((p) => p.tipo === 'mostrar_sim' && p.alvo === b.rotulo));
  }
  for (const r of ['Gravar Lançamento', 'Aceitar sugestões dos marcados', 'Desfazer conciliação', 'Lançar depreciação do mês', 'Fechar competência', 'Baixar arquivo ECD', 'Cadastrar lançamento padrão', 'Guardar extrato']) assert.equal(botaoPodeSerClicadoPelaDemo(r), false, r);
  assert.throws(() => passosDaEtapa({ ...ETAPAS_DEMO[0], abrir: { rotulo: ['Gravar Lançamento', 'Aceitar sugestões dos marcados', 'Desfazer conciliação', 'Lançar depreciação do mês', 'Fechar competência', 'Baixar arquivo ECD', 'Cadastrar lançamento padrão', 'Guardar extrato'][0], porque: 'x' } }), /não pode clicar/);
});

test('Escola (Contábil): a tela da demonstração só fala com o cálculo de treino e o registro da Escola; "aqui SIM" nunca clica', () => {
  const src = ler('src/components/escola/DemonstracaoCompleta.tsx');
  const urls = [...src.matchAll(/fetch\(\s*['`]([^'`]+)['`]/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(urls)].sort(), ['/api/escola/demonstracao', '/api/escola/simular']);
  const blocoSim = src.slice(src.indexOf("case 'mostrar_sim'"), src.indexOf("case 'concluir'"));
  assert.match(blocoSim, /moverCursor\([^)]*, false, ger\)/);
  assert.doesNotMatch(blocoSim, /fetch|onClick|\.click\(/);
  assert.doesNotMatch(src, /\.click\(\)|dispatchEvent\(new (Mouse)?Event\('click/);
  assert.match(src, /key === 'Escape'/); assert.match(src, /EVENTO_DEMO_COMANDO/); assert.match(src, /EVENTO_AGENTE_PARAR/); assert.ok(src.includes('addEventListener(EVENTO_AGENTE_PAROU'), 'para junto com o PARAR da Agente');
  assert.equal(EVENTO_DEMO_COMANDO, 'murade:escola-demo'); assert.equal(EVENTO_AGENTE_PARAR, 'murade:agente-parar');
  const tela = ler('src/components/escola/TelaEscolaMurade.tsx');
  assert.match(tela, /id="escola-demo-completa"/);
  for (const parte of ['AulaEscolaView', 'PainelGestorEscola', "aba === 'glossario'", 'conteudo.trilhas.map']) assert.ok(tela.includes(parte), `não tirou: ${parte}`);
  assert.match(ler('src/components/escola/escolaAdaptador.tsx'), /export function useVozDaEscola/);
});

test('Escola (Contábil): resultado pelo motor real (etapas com prática) e etapas seguintes reaproveitam o cálculo anterior', () => {
  for (const e of ETAPAS_DEMO) {
    const origem = etapaDoCalculo(e);
    if (!e.resultado.itens.length) continue;
    assert.ok(origem && origem.praticaId, e.id);
    const r = simularPratica(origem!.praticaId!, valoresParaMotor(origem!)!) as Record<string, unknown>;
    for (const i of e.resultado.itens) assert.ok(r[i.chave] !== undefined, `${e.id}: ${i.chave}`);
  }
});

test('Escola (Contábil): controles pausar/continuar/pular/parar; velocidade; comandos de voz', () => {
  let s: EstadoDemo = 'pronto';
  s = transicaoDemo(s, 'iniciar'); assert.equal(s, 'rodando');
  s = transicaoDemo(s, 'pausar'); assert.equal(s, 'pausado');
  s = transicaoDemo(s, 'continuar'); assert.equal(s, 'rodando');
  s = transicaoDemo(s, 'parar'); assert.equal(s, 'parado');
  assert.equal(transicaoDemo(s, 'continuar'), 'parado');
  assert.equal(transicaoDemo(s, 'iniciar'), 'rodando');
  assert.ok(tempoDeFalaDemo('frase de teste', 'lenta') > tempoDeFalaDemo('frase de teste', 'rapida'));
  assert.equal(intencaoDemo('pare'), 'parar'); assert.equal(intencaoDemo('pausa'), 'pausar'); assert.equal(intencaoDemo('continua'), 'continuar'); assert.equal(intencaoDemo('pula essa etapa'), 'pular');
  assert.equal(intencaoDemo('qual o prazo da DCTFWeb de outubro?'), null);
});

test('Escola (Contábil): "Agora é a sua vez" — mesmas etapas, mesma ordem; erro avisado na hora e acerto elogiado', () => {
  const vez = etapasSuaVez();
  assert.deepEqual(vez.map((x) => x.etapa.id), IDS_ETAPAS_DEMO);
  for (const x of vez.filter((y) => y.modo === 'botao')) {
    const e = x.etapa;
    assert.match(avaliarCliqueSuaVez(e, e.suaVez!.certo).mensagem, /^Isso mesmo!/);
    const errado = botoesSuaVez(e).find((r) => r !== e.suaVez!.certo);
    if (errado) assert.match(avaliarCliqueSuaVez(e, errado).mensagem, /^Não, aí está errado\. Confere direito\./);
  }
  const sim = ler('src/components/escola/SimuladorEscola.tsx');
  assert.match(sim, /faseInicial === 'guiada'/); assert.match(sim, /onGuiadaConcluida\?\.\(\)/);
});

function appFalso() {
  const rotas = new Map<string, Function[]>();
  const reg = (m: string) => (caminho: string, ...h: Function[]) => { rotas.set(`${m} ${caminho}`, h); };
  return { app: { get: reg('GET'), post: reg('POST') } as any, rotas };
}
async function chamar(rotas: Map<string, Function[]>, chave: string, req: any) {
  const res: any = { codigo: 200, corpo: null, setHeader() {}, status(c: number) { this.codigo = c; return this; }, json(b: unknown) { this.corpo = b; return this; } };
  const h = rotas.get(chave)!; await h[h.length - 1](req, res); return res;
}

test('Escola (Contábil): registro no painel do gestor (etapa, sua vez, "assistiu a demonstração completa"; aviso ao gestor só na 1ª vez)', async () => {
  limparCacheLiberacao();
  assert.equal(registroDemoValido('etapa', IDS_ETAPAS_DEMO[0])?.etapa, IDS_ETAPAS_DEMO[0]);
  assert.equal(registroDemoValido('etapa', 'inventada'), null);
  const { app, rotas } = appFalso();
  const sql: Array<{ s: string; p: unknown[] }> = [];
  let vezes = 0;
  registrarRotasEscola({ app, exigirSessao: (_q: any, _s: any, n: any) => n(), sessao: () => ({ userId: 'u9', login: 'carla', tenantId: 't1' }),
    consultar: async (s: string, p: unknown[] = []) => { sql.push({ s, p }); if (/RETURNING vezes/.test(s)) { vezes += 1; return { rows: [{ vezes }], rowCount: 1 }; } return { rows: [], rowCount: 1 }; },
    bancoConfigurado: () => true, liberacao: { env: {}, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) },
    cnpjDoEscritorio: async () => null, escritorioDoDono: async () => true } as any);
  const r1 = await chamar(rotas, 'POST /api/escola/demonstracao', { body: { evento: 'etapa', etapa: IDS_ETAPAS_DEMO[0] } });
  assert.equal(r1.corpo.sucesso, true, JSON.stringify(r1.corpo));
  assert.ok(sql.some((x) => /UPDATE contabil_escola_demonstracoes SET etapas=/.test(x.s) && x.p[2] === IDS_ETAPAS_DEMO[0]));
  assert.equal((await chamar(rotas, 'POST /api/escola/demonstracao', { body: { evento: 'etapa', etapa: 'nao-existe' } })).codigo, 400);
  await chamar(rotas, 'POST /api/escola/demonstracao', { body: { evento: 'completa' } });
  await chamar(rotas, 'POST /api/escola/demonstracao', { body: { evento: 'completa' } });
  const avisos = sql.filter((x) => /INSERT INTO contabil_escola_avisos/.test(x.s));
  assert.equal(avisos.length, 1);
  assert.match(String(avisos[0].p[3]), /carla assistiu a demonstração completa/);
  for (const x of sql) for (const m of x.s.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+([a-z_]+)/g)) assert.ok(m[2].startsWith('contabil_escola_'), m[0]);
  assert.match(ler('src/components/escola/PainelGestorEscola.tsx'), /demonstração completa: /);
});

test('Escola (Contábil): Agente — "me mostra tudo" abre a Escola e a seta mostra o botão da demonstração (só mostra)', async () => {
  assert.ok(kitContabil.ferramentas.some((f) => f.declaracao.name === 'abrir_demonstracao_escola' && f.tipo === 'leitura'));
  assert.match(kitContabil.instrucao, /abrir_demonstracao_escola/);
  const f = FERRAMENTAS_ESCOLA.find((x) => x.declaracao.name === 'abrir_demonstracao_escola')! as any;
  const r = await f.executar({ chamarApi: async () => ({ status: 200, corpo: { liberado: true } }) } as any, {});
  assert.ok(r.piloto, 'piloto montado');
  assert.ok(r.piloto.passos.every((p: any) => p.tipo === 'navegar' || p.tipo === 'destacar'));
  assert.equal(r.piloto.passos[r.piloto.passos.length - 1].alvo, '#escola-demo-completa');
  assert.equal((await f.executar({ chamarApi: async () => ({ status: 200, corpo: { liberado: false, motivo: 'x' } }) } as any, {})).liberado, false);
});
