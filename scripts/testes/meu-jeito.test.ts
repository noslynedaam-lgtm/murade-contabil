// "Meu jeito" (boas-vindas, preferências, regras, sugestões, robô) e apresentação falada. A parte de banco precisa de um Postgres de teste
// em TEST_DATABASE_URL (mesma convenção dos outros testes: esquema de verdade, ids aleatórios, nunca DROP/TRUNCATE).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import { Pool } from 'pg';
import {
  CHAVES_PREFERENCIA, ID_RECEITA, PREFERENCIAS, TABELA_JEITO, TENANT_SISTEMA, USUARIO_ESCRITORIO, calcularSugestoes, criarServicoMeuJeito, descreverReceita, detectarPedidoProtegido,
  registrarRotasMeuJeito, validarPreferencia, validarReceita, type SessaoJeito,
} from '../../src/server/meuJeito';
import { ASSUNTOS_AGENTE, IDS_TELAS_JEITO, MODULOS_JEITO_PADRAO, PROTECOES_FIXAS, SECOES_DESTACAVEIS, SESSOES_COM_BOAS_VINDAS, TEXTO_PROTECAO, textoBoasVindas } from '../../src/data/jeitoPadraoContabil';
import { BufferObservacao, efeitosDaRegra, ordenarMenu, regraDoGatilho, aplicarRitmoDoPiloto } from '../../src/utils/meuJeitoCliente';
import { TocadorApresentacao, intencaoApresentacao, type Ambiente } from '../../src/utils/apresentacaoCliente';
import { blocosDoAssunto, montarApresentacao, PERGUNTA_APRESENTACAO } from '../../src/data/apresentacaoSistema';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';

const ler = (c: string) => readFileSync(c, 'utf8');

// ------------------------------------------------------------------ o jeito padrão bate com as telas reais
test('jeito padrão: cada módulo existe no menu, com o mesmo nome, na tela e no tipo TabId', () => {
  const sidebar = ler('src/components/Sidebar.tsx'); const app = ler('src/App.tsx'); const tipos = ler('src/types.ts');
  const itens = [...sidebar.matchAll(/id: "([a-z-]+)" as TabId,\s*label: "([^"]+)"/g)].map((m) => ({ id: m[1], label: m[2] }));
  const doMenu = itens.filter((i) => i.id !== 'ia-premium'); // a IA Premium só abre a Agente; não é módulo
  assert.deepEqual(MODULOS_JEITO_PADRAO.map((m) => m.id).sort(), doMenu.map((i) => i.id).sort());
  for (const m of MODULOS_JEITO_PADRAO) {
    assert.equal(itens.find((i) => i.id === m.id)?.label, m.rotulo, `rótulo de ${m.id}`);
    assert.ok(tipos.includes(`"${m.id}"`), `TabId ${m.id}`);
    assert.ok(app.includes(`tabAtiva === "${m.id}"`), `tela ${m.id} no App`);
    assert.ok(m.resumo.length > 20 && m.resumo.length < 260, `resumo de ${m.id}`);
  }
});
test('jeito padrão: cada parte destacável existe escrita na tela dela e cada consulta tem frase fixa', () => {
  for (const s of SECOES_DESTACAVEIS) {
    const m = MODULOS_JEITO_PADRAO.find((x) => x.id === s.tela)!;
    assert.ok(m?.arquivo, `tela ${s.tela}`);
    assert.ok(ler(`src/components/tabs/${m.arquivo}.tsx`).includes(s.texto), `${s.id}: "${s.texto}" não está em ${m.arquivo}`);
  }
  assert.equal(new Set(SECOES_DESTACAVEIS.map((s) => s.id)).size, SECOES_DESTACAVEIS.length);
  for (const a of ASSUNTOS_AGENTE) assert.ok(a.frase.endsWith('?'));
});
test('texto novo nunca cita o sistema concorrente', () => {
  for (const f of ['src/data/jeitoPadraoContabil.ts', 'src/data/apresentacaoSistema.ts', 'src/server/meuJeito.ts', 'src/server/conferidorApresentacao.ts', 'src/utils/meuJeitoCliente.ts', 'src/utils/apresentacaoCliente.ts', 'src/components/MeuJeitoMotor.tsx', 'src/components/ApresentacaoSistema.tsx', 'src/components/tabs/MeuJeitoTab.tsx']) assert.doesNotMatch(ler(f), /alterdata/i, f);
});

// ------------------------------------------------------------------ boas-vindas
test('boas-vindas: texto fixo nas 5 primeiras aberturas e nunca depois', () => {
  for (let n = 1; n <= SESSOES_COM_BOAS_VINDAS; n += 1) assert.ok(textoBoasVindas(n));
  assert.equal(textoBoasVindas(6), null); assert.equal(textoBoasVindas(0), null);
  assert.match(textoBoasVindas(1)!, /aprender o seu/); assert.match(textoBoasVindas(1)!, /do seu jeito/);
  assert.match(textoBoasVindas(2)!, /mostra meu jeito/);
  assert.equal(textoBoasVindas(5, true), textoBoasVindas(1)); // legado vê o texto completo, uma vez
});

// ------------------------------------------------------------------ esquema fechado e proteções
test('esquema fechado: preferência fora do catálogo é recusada; as que parecem proteção vêm com a explicação', () => {
  for (const chave of ['confirmarLancamento', 'semConfirmacao', 'apagarTudo', 'desligarRobos', 'serproAutomatico', 'calculoAproximado', 'travaDuplicidade']) {
    const r = validarPreferencia(chave, 'sim'); assert.equal(r.ok, false, chave);
    assert.equal((r as any).protegido, true, chave); assert.equal((r as any).motivo, TEXTO_PROTECAO);
  }
  const r2 = validarPreferencia('corDoMenu', 'azul'); assert.equal(r2.ok, false); assert.equal((r2 as any).protegido, undefined);
  for (const v of ['nenhuma', 'desligada', 'sem confirmar', 'automatico', 'off']) { const r = validarPreferencia('confirmacaoNaoProtegida', v); assert.equal(r.ok, false, v); assert.equal((r as any).protegido, true, v); }
  assert.equal((validarPreferencia('confirmacaoNaoProtegida', 'resumida') as any).valor, 'resumida');
  assert.equal(CHAVES_PREFERENCIA.some((c) => /confirmarIrrev|protec|duplic|serpro|robo|calculo/i.test(c)), false);
});
test('esquema fechado: regra que tenta desligar proteção ou sair do catálogo é recusada', () => {
  const g = { tipo: 'abrir_tela', tela: 'balancete' };
  for (const acoes of [[{ tipo: 'confirmar_automatico' }], [{ tipo: 'fechar_competencia' }], [{ tipo: 'perguntar_agente', assunto: 'pendencias', semConfirmar: true }], [{ tipo: 'mostrar_atalho', tela: 'lancamentos', confirmar: false }], [{ tipo: 'apagar_tudo' }]]) {
    const r = validarReceita({ gatilho: g, acoes }); assert.equal(r.ok, false, JSON.stringify(acoes));
  }
  assert.equal((validarReceita({ gatilho: g, acoes: [{ tipo: 'fechar_competencia' }] }) as any).protegido, true);
  assert.equal(validarReceita({ gatilho: { tipo: 'a_cada_minuto' }, acoes: [{ tipo: 'mostrar_atalho', tela: 'lancamentos' }] }).ok, false);
  assert.equal(validarReceita({ gatilho: g, acoes: [{ tipo: 'mostrar_atalho', tela: 'lancamentos' }], executarSemPerguntar: true }).ok, false);
  assert.equal(validarReceita({ gatilho: { tipo: 'entrar_no_sistema' }, acoes: [{ tipo: 'destacar_secao', secao: 'livro-diario' }] }).ok, false); // destacar só ao abrir tela
  assert.equal(validarReceita({ gatilho: { tipo: 'abrir_tela', tela: 'livros' }, acoes: [{ tipo: 'destacar_secao', tela: 'balancete', secao: 'balancete-verificacao' }] }).ok, false); // parte de outra tela
  assert.equal(validarReceita({ gatilho: { tipo: 'abrir_tela', tela: 'telainexistente' }, acoes: [{ tipo: 'mostrar_atalho', tela: 'lancamentos' }] }).ok, false);
  assert.equal(validarReceita({ gatilho: g, acoes: [] }).ok, false);
  assert.equal(validarReceita({ gatilho: g, acoes: Array(4).fill(0).map((_, i) => ({ tipo: 'mostrar_atalho', tela: IDS_TELAS_JEITO[i] })) }).ok, false);
  assert.equal(validarReceita({ gatilho: g, acoes: [{ tipo: 'mostrar_atalho', tela: 'balancete' }] }).ok, false); // atalho para a própria tela
});
test('regra válida: nomes de tela do jeito que se fala viram ids, e a descrição sai do catálogo (nunca do texto digitado)', () => {
  const r = validarReceita({ gatilho: { tipo: 'abrir_tela', tela: 'Balancete' }, acoes: [{ tipo: 'destacar_secao', secao: 'balancete de verificação' }, { tipo: 'mostrar_atalho', tela: 'lançamentos' }, { tipo: 'perguntar_agente', assunto: 'pendências' }] });
  assert.equal(r.ok, true); if (!r.ok) return;
  assert.equal(r.id, 'abrir:balancete'); assert.ok(ID_RECEITA.test(r.id));
  assert.deepEqual(r.acoes, [{ tipo: 'destacar_secao', tela: 'balancete', secao: 'balancete-verificacao' }, { tipo: 'mostrar_atalho', tela: 'lancamentos' }, { tipo: 'perguntar_agente', assunto: 'pendencias' }]);
  assert.equal(descreverReceita(r), 'Ao abrir Balancete: destacar "Balancete de verificação", depois mostrar um atalho para Lançamentos, depois perguntar à Agente: pendências de conferência e aprovação');
  assert.equal(validarPreferencia('telaInicial', 'Aprovar lançamentos').ok, true);
  assert.deepEqual((validarPreferencia('menuFavoritos', 'balancete, lançamentos e livros') as any).valor, ['balancete', 'lancamentos', 'livros']);
  assert.equal(validarPreferencia('menuFavoritos', IDS_TELAS_JEITO.slice(0, 7)).ok, false);
  assert.equal(validarPreferencia('telaInicial', 'tela que nao existe').ok, false);
});
test('triagem: pedido de desligar proteção é percebido; pedido normal passa', () => {
  for (const t of ['quero lançar tudo automaticamente sem confirmar', 'não precisa pedir confirmação para fechar o mês', 'apague todas as empresas de uma vez', 'deixa o robô do SERPRO consultar sozinho', 'desligue o robô conferidor', 'pode arredondar o imposto do meu jeito', 'fechar o período sozinho', 'pule a confirmação ao excluir']) assert.ok(detectarPedidoProtegido(t), t);
  for (const t of ['quero abrir sempre no balancete', 'responda mais detalhado', 'ir direto para lançamentos ao entrar', 'quando eu abrir o balancete destaque o balancete de verificação', 'me mostra o que vence hoje']) assert.equal(detectarPedidoProtegido(t), null, t);
  assert.ok(PROTECOES_FIXAS.length >= 6);
});

// ------------------------------------------------------------------ navegação, regras e sugestões (puro)
test('menu: favoritos primeiro, na ordem escolhida; id desconhecido é ignorado', () => {
  const itens = ['inicio', 'empresa', 'balancete', 'lancamentos', 'livros'].map((id) => ({ id }));
  assert.deepEqual(ordenarMenu(itens, ['livros', 'x', 'balancete', 'livros']).map((i) => i.id), ['livros', 'balancete', 'inicio', 'empresa', 'lancamentos']);
  assert.deepEqual(ordenarMenu(itens, undefined).map((i) => i.id), itens.map((i) => i.id));
});
test('regras na tela: efeitos na ordem; passo que sumiu do catálogo é ignorado; ritmo do piloto só se a pessoa definiu', () => {
  const regra = { id: 'abrir:balancete', gatilho: { tipo: 'abrir_tela' as const, tela: 'balancete' }, acoes: [{ tipo: 'destacar_secao', tela: 'balancete', secao: 'balancete-verificacao' }, { tipo: 'destacar_secao', tela: 'balancete', secao: 'nao-existe' }, { tipo: 'mostrar_atalho', tela: 'lancamentos' }, { tipo: 'perguntar_agente', assunto: 'pendencias' }] };
  assert.deepEqual(efeitosDaRegra(regra).map((e) => e.tipo), ['destacar', 'atalho', 'perguntar']);
  assert.equal(regraDoGatilho([regra], { tipo: 'abrir_tela', tela: 'balancete' })?.id, 'abrir:balancete'); assert.equal(regraDoGatilho([regra], { tipo: 'entrar_no_sistema' }), null);
  const g: string[] = [];
  aplicarRitmoDoPiloto({ origem: { velocidadePiloto: 'padrao' }, efetivo: { velocidadePiloto: 'normal' } } as any, (r) => g.push(r)); assert.deepEqual(g, []);
  aplicarRitmoDoPiloto({ origem: { velocidadePiloto: 'voce' }, efetivo: { velocidadePiloto: 'devagar' } } as any, (r) => g.push(r)); assert.deepEqual(g, ['devagar']);
});
test('observação: só pares de telas válidas; sugestão exige repetição e proporção; dispensada e já aceita não voltam', () => {
  const b = new BufferObservacao((id) => IDS_TELAS_JEITO.includes(id)); b.registrar(null, 'balancete'); b.registrar('balancete', 'balancete'); b.registrar('x', 'balancete'); b.registrar('lancamentos', 'balancete');
  assert.equal(b.tamanho(), 1);
  assert.equal(calcularSugestoes({ 'lancamentos>balancete': 4 }, {}, []).length, 0);
  const s = calcularSugestoes({ 'lancamentos>balancete': 6, 'lancamentos>livros': 1 }, {}, []); assert.equal(s.length, 1); assert.equal(s[0].id, 'atalho:lancamentos>balancete');
  assert.equal(calcularSugestoes({ 'lancamentos>balancete': 6, 'lancamentos>livros': 6 }, {}, []).length, 0); // 50%: sem preferência clara
  assert.equal(calcularSugestoes({ 'lancamentos>balancete': 6 }, {}, ['atalho:lancamentos>balancete']).length, 0);
  assert.equal(calcularSugestoes({ 'lancamentos>balancete': 6 }, { 'abrir:lancamentos': { gatilho: { tipo: 'abrir_tela', tela: 'lancamentos' }, acoes: [{ tipo: 'mostrar_atalho', tela: 'balancete' }] } }, []).length, 0);
  assert.equal(calcularSugestoes({ 'lancamentos>meu-jeito': 9, 'telafalsa>balancete': 9 }, {}, []).length, 0);
});

// ------------------------------------------------------------------ apresentação: intenções e tocador (puro)
test('apresentação: frases por voz ou texto, sem IA', () => {
  const livre = { tocando: false, ofertaPendente: false }; const tocando = { tocando: true, ofertaPendente: false }; const oferta = { tocando: false, ofertaPendente: true };
  for (const t of ['o que o sistema faz?', 'me conta o que o sistema faz', 'me conta tudo', 'fala isso para mim', 'o que o Contábil faz']) assert.equal(intencaoApresentacao(t, livre), 'iniciar', t);
  assert.equal(intencaoApresentacao('o que é integrado?', livre), 'integracoes'); assert.equal(intencaoApresentacao('o que é automático', livre), 'automatico');
  assert.equal(intencaoApresentacao('para', tocando), 'pausar'); assert.equal(intencaoApresentacao('para', livre), null);
  assert.equal(intencaoApresentacao('Continua', tocando), 'continuar'); assert.equal(intencaoApresentacao('pula esse bloco', tocando), 'pular');
  assert.equal(intencaoApresentacao('me mostra onde', tocando), 'mostrar_onde'); assert.equal(intencaoApresentacao('chega', tocando), 'parar');
  assert.equal(intencaoApresentacao('sim', oferta), 'sim'); assert.equal(intencaoApresentacao('sim', livre), null);
  assert.equal(intencaoApresentacao('agora não', oferta), 'depois'); assert.equal(intencaoApresentacao('não', oferta), 'nao');
  assert.equal(intencaoApresentacao('quero lançar a nota da empresa', livre), null);
});
function ambienteFalso(voz: boolean) {
  const fala: string[] = []; let fim: (() => void) | null = null; const timers = new Map<number, () => void>(); let n = 0; let calado = 0;
  const amb: Ambiente = { falar: (t, f) => { fala.push(t); fim = f; }, calar: () => { calado += 1; fim = null; }, agendar: (_ms, f) => { n += 1; timers.set(n, f); return n; }, cancelar: (id) => { timers.delete(id); }, vozLigada: () => voz };
  return { amb, fala, terminarFala: () => { const f = fim; fim = null; f?.(); }, disparar: () => { const [id, f] = [...timers][0] ?? []; if (id) { timers.delete(id); f?.(); } }, calado: () => calado };
}
test('tocador: avança bloco a bloco, pausa, continua, pula e para; nada fala depois de parar', () => {
  const a = ambienteFalso(true); const t = new TocadorApresentacao(a.amb);
  const blocos = blocosDoAssunto({ secao: 'depende' });
  t.iniciar(blocos); assert.equal(a.fala.length, 1); assert.equal(t.instantaneo().indice, 0);
  a.terminarFala(); assert.equal(t.instantaneo().indice, 1); assert.equal(a.fala.length, 2);
  t.pausar(); assert.equal(t.instantaneo().estado, 'pausado'); a.terminarFala(); assert.equal(t.instantaneo().indice, 1, 'fala que acabou depois da pausa não avança');
  t.continuar(); assert.equal(a.fala.length, 3); assert.equal(a.fala[2], blocos[1].falar);
  t.pular(); assert.equal(t.instantaneo().indice, 2); assert.equal(a.fala.length, 4);
  t.parar(); assert.equal(t.instantaneo().estado, 'parado'); a.terminarFala(); assert.equal(a.fala.length, 4);
  t.iniciar(blocos.slice(0, 1)); a.terminarFala(); assert.equal(t.instantaneo().estado, 'fim');
});
test('tocador: com a voz desligada mostra a legenda e avança por tempo de leitura', () => {
  const a = ambienteFalso(false); const t = new TocadorApresentacao(a.amb);
  t.iniciar(blocosDoAssunto({ secao: 'depende' })); assert.equal(a.fala.length, 0);
  a.disparar(); assert.equal(t.instantaneo().indice, 1); t.pausar(); a.disparar(); assert.equal(t.instantaneo().indice, 1);
});
test('apresentação: blocos curtos, sem duplicar, e o que é só do dono não aparece para escritório cliente', () => {
  const todos = montarApresentacao(true); const cliente = montarApresentacao(false);
  assert.equal(new Set(todos.map((b) => b.id)).size, todos.length);
  for (const b of todos) assert.ok(b.falar.length > 20 && b.falar.length <= 420, `${b.id}: ${b.falar.length}`);
  assert.ok(cliente.length < todos.length); assert.ok(!cliente.some((b) => b.id === 'robo-backup_banco' || b.id === 'robo-seguranca_login'));
  assert.ok(cliente.some((b) => b.id === 'robo-reconciliador'));
  assert.match(PERGUNTA_APRESENTACAO, /Quer que eu te conte tudo o que o Contábil faz\?/);
});

// ------------------------------------------------------------------ Agente IA (ferramentas)
function montarAgente(falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>, admin = false) {
  const chamadas: Array<[string, string, unknown]> = [];
  const jeito = { podeEditarEscritorio: admin, sessoes: 2, preferencias: [{ chave: 'telaInicial', rotulo: 'Tela ao entrar', valor: 'balancete', valorTexto: 'Balancete', origem: 'voce', valorEscritorio: null }, { chave: 'nivelConversa', rotulo: 'Conversa da Agente', valor: 'curto', valorTexto: 'curto', origem: 'padrao', valorEscritorio: null }],
    receitas: [{ id: 'abrir:balancete', descricao: 'Ao abrir Balancete: destacar "Livro Diário"', obsoleta: false }], sugestoes: [{ id: 'atalho:lancamentos>balancete', texto: 'Notei que você costuma ir de Lançamentos para Balancete.', vezes: 6 }] };
  const api: ChamarApi = async (m, c, b) => { chamadas.push([m, c, b]); if (c === '/api/meu-jeito' && m === 'GET') return { status: 200, corpo: { sucesso: true, jeito } }; if (c.startsWith('/api/meu-jeito/') && m === 'POST') return { status: 200, corpo: { sucesso: true, jeito } }; if (c === '/api/robos/status') return { status: 200, corpo: { ehDono: false, robos: [] } }; return { status: 404, corpo: {} }; };
  let i = 0;
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'malba@escritorio.com', hoje: '2026-11-18', chamarApi: api, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadas };
}
const posts = (c: Array<[string, string, unknown]>) => c.filter(([m, u]) => m === 'POST' && u.startsWith('/api/meu-jeito/'));
test('Agente: as 4 ferramentas do jeito (e as de apresentação) existem e o prompt as explica', () => {
  for (const n of ['aprender_meu_jeito', 'mostrar_meu_jeito', 'esquecer_regra_do_jeito', 'explicar_jeito_padrao', 'apresentar_sistema', 'perguntar_integracoes']) assert.ok(kitContabil.ferramentas.some((f) => f.declaracao.name === n), n);
  assert.match(kitContabil.instrucao, /MEU JEITO/); assert.match(kitContabil.instrucao, /nunca desliga proteções/);
});
test('Agente: ensinar uma preferência vira cartão com "entendi assim"; nada grava antes do sim', async () => {
  const { ctx, modelo, chamadas } = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'preferencia', chave: 'telaInicial', valor: 'Lançamentos', como_a_pessoa_pediu: 'quero abrir sempre em lançamentos' } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'x', []);
  assert.equal(r.acoes.length, 1); assert.match(r.acoes[0].titulo, /Tela ao entrar: Lançamentos/); assert.ok(r.acoes[0].descricao[0].startsWith('Entendi assim'));
  assert.equal(posts(chamadas).length, 0);
  const c = await confirmarAcao(ctx, r.acoes[0].id); assert.equal(c.sucesso, true);
  assert.deepEqual(posts(chamadas)[0].slice(1), ['/api/meu-jeito/preferencias', { chave: 'telaInicial', valor: 'lancamentos', escopo: 'usuario' }]);
});
test('Agente: ensinar uma regra mostra como entendeu e só salva depois do sim; troca a regra do mesmo momento', async () => {
  const { ctx, modelo, chamadas } = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'regra', quando: 'abrir_tela', tela_quando: 'balancete', passos: [{ acao: 'destacar_secao', tela: 'balancete', secao: 'Balancete de verificação' }, { acao: 'mostrar_atalho', tela: 'Livros' }] } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'x', []);
  assert.equal(r.acoes.length, 1); assert.ok(r.acoes[0].descricao.some((l) => l.includes('Ao abrir Balancete: destacar "Balancete de verificação", depois mostrar um atalho para Livros Fiscais & ECD')));
  assert.ok(r.acoes[0].descricao.some((l) => l.includes('troca a regra que você já tinha')));
  assert.equal(posts(chamadas).length, 0);
  await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(posts(chamadas)[0][1], '/api/meu-jeito/receitas');
});
test('Agente: pedido de desligar proteção não vira cartão e a Agente recebe a explicação', async () => {
  for (const args of [{ tipo: 'preferencia', chave: 'confirmacaoNaoProtegida', valor: 'resumida', como_a_pessoa_pediu: 'não pede mais confirmação para fechar o mês' }, { tipo: 'preferencia', chave: 'confirmarLancamento', valor: 'nao' }, { tipo: 'regra', quando: 'entrar', passos: [{ acao: 'fechar_competencia' }] }, { tipo: 'preferencia', chave: 'confirmacaoNaoProtegida', valor: 'nenhuma' }]) {
    const { ctx, modelo, chamadas } = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args }] }, { texto: 'ok' }]);
    const r = await conversar(ctx, modelo, 'x', []); assert.equal(r.acoes.length, 0, JSON.stringify(args)); assert.equal(posts(chamadas).length, 0);
  }
});
test('Agente: padrão do escritório só para administradora; preferência pessoal não vira padrão do escritório', async () => {
  const a = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'preferencia', chave: 'nivelConversa', valor: 'detalhado', escopo: 'escritorio' } }] }, { texto: 'ok' }], false);
  assert.equal((await conversar(a.ctx, a.modelo, 'x', [])).acoes.length, 0);
  const b = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'preferencia', chave: 'nivelConversa', valor: 'detalhado', escopo: 'escritorio' } }] }, { texto: 'ok' }], true);
  assert.equal((await conversar(b.ctx, b.modelo, 'x', [])).acoes.length, 1);
  const c = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'preferencia', chave: 'observarUso', valor: 'nao', escopo: 'escritorio' } }] }, { texto: 'ok' }], true);
  assert.equal((await conversar(c.ctx, c.modelo, 'x', [])).acoes.length, 0);
});
test('Agente: sugestão só vira regra com o cartão confirmado; esquecer é uma coisa por vez e nunca "tudo"', async () => {
  const a = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'sugestao', sugestao_id: 'atalho:lancamentos>balancete' } }] }, { texto: 'ok' }]);
  const r = await conversar(a.ctx, a.modelo, 'sim', []); assert.equal(r.acoes.length, 1); assert.equal(posts(a.chamadas).length, 0);
  await confirmarAcao(a.ctx, r.acoes[0].id); assert.equal(posts(a.chamadas)[0][1], '/api/meu-jeito/sugestoes/aceitar');
  const inexistente = montarAgente([{ chamadas: [{ nome: 'aprender_meu_jeito', args: { tipo: 'sugestao', sugestao_id: 'atalho:x>y' } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(inexistente.ctx, inexistente.modelo, 'x', [])).acoes.length, 0);
  const tudo = montarAgente([{ chamadas: [{ nome: 'esquecer_regra_do_jeito', args: { tipo: 'preferencia', chave: 'tudo' } }] }, { texto: 'ok' }]);
  assert.equal((await conversar(tudo.ctx, tudo.modelo, 'x', [])).acoes.length, 0);
  const um = montarAgente([{ chamadas: [{ nome: 'esquecer_regra_do_jeito', args: { tipo: 'regra', quando: 'abrir_tela', tela_quando: 'balancete' } }] }, { texto: 'ok' }]);
  const ru = await conversar(um.ctx, um.modelo, 'x', []); assert.equal(ru.acoes.length, 1); await confirmarAcao(um.ctx, ru.acoes[0].id);
  assert.deepEqual(posts(um.chamadas)[0].slice(1), ['/api/meu-jeito/receitas/remover', { id: 'abrir:balancete' }]);
  const naoTem = montarAgente([{ chamadas: [{ nome: 'esquecer_regra_do_jeito', args: { tipo: 'preferencia', chave: 'Conversa da Agente' } }] }, { texto: 'ok' }]); // já está no padrão
  assert.equal((await conversar(naoTem.ctx, naoTem.modelo, 'x', [])).acoes.length, 0);
});
test('Agente: mostrar jeito, explicar o jeito padrão e apresentar o sistema usam texto fixo', async () => {
  const f = (n: string) => kitContabil.ferramentas.find((x) => x.declaracao.name === n) as any;
  const { ctx } = montarAgente([]);
  const m = await f('mostrar_meu_jeito').executar(ctx, {}); assert.equal(m.sugestoes.length, 1); assert.equal(m.regras[0].situacao, 'valendo'); assert.equal(m.preferencias[0].origem, 'definido por você');
  assert.equal((await f('explicar_jeito_padrao').executar(ctx, { modulo: 'Balancete' })).modulo, 'Balancete');
  assert.ok((await f('explicar_jeito_padrao').executar(ctx, {})).modulos.length >= 19);
  assert.ok((await f('explicar_jeito_padrao').executar(ctx, { modulo: 'zzz' })).erro);
  const ap = await f('apresentar_sistema').executar(ctx, { secao: 'automatico' }); assert.ok(ap.blocos.length >= 9); assert.ok(!ap.blocos.some((b: any) => /Backup do Banco/.test(b.titulo)));
  assert.ok(ap.blocos.some((b: any) => /Reconciliador/.test(b.titulo)));
  const ig = await f('perguntar_integracoes').executar(ctx, { sistema: 'dp' }); assert.ok(ig.blocos.some((b: any) => /pró-labore/.test(b.titulo + b.falar))); assert.ok(ig.blocos.some((b: any) => b.id === undefined && /Fisco IA/.test(b.falar)));
  assert.ok(!ig.blocos.some((b: any) => /notas fiscais/.test(b.titulo)));
});

// ------------------------------------------------------------------ banco (integração)
const urlBanco = process.env.TEST_DATABASE_URL;
async function banco() {
  process.env.DATABASE_URL = urlBanco;
  const { prepararAuthContabil } = await import('../../src/server/authContabil');
  await prepararAuthContabil();
  const pool = new Pool({ connectionString: urlBanco });
  const consultar = (sql: string, params: unknown[] = []) => pool.query(sql, params) as any;
  return { pool, consultar };
}
async function escritorio(consultar: any, nomes: string[]) {
  const tenant = crypto.randomUUID(); const sufixo = tenant.slice(0, 8); const sessoes: SessaoJeito[] = [];
  for (let i = 0; i < nomes.length; i += 1) {
    const id = i === 0 ? tenant : crypto.randomUUID(); const login = `${nomes[i]}.${sufixo}@teste.murade`;
    await consultar(`INSERT INTO contabil_auth_users(id,login,password_salt,password_hash,global_admin,tenant_id,office_owner,nome_tratamento) VALUES($1,$2,'s','h',$3,$4,$5,$6)`, [id, login, i === 0, tenant, i === 0 ? null : tenant, nomes[i]]);
    sessoes.push({ userId: id, login, tenantId: tenant, escritorioDe: i === 0 ? undefined : tenant, administrador: i === 0 });
  }
  return { tenant, sessoes };
}
const H = () => crypto.randomUUID().slice(0, 12);

test('sessões: 5 aberturas diferentes recebem boas-vindas, a sexta não; recarregar a página não conta; ficar parado 2 h conta', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    let agora = new Date('2027-01-10T12:00:00Z'); const svc = criarServicoMeuJeito(consultar, () => agora);
    await svc.garantirTabelas(); // a marca da implantação precisa existir ANTES das contas de teste (senão elas seriam "legado")
    const { sessoes: [ana] } = await escritorio(consultar, ['ana']);
    const textos: Array<string | null> = [];
    for (let n = 1; n <= 7; n += 1) { const r = await svc.abrir(ana, H()); textos.push(r.boasVindas); assert.equal(r.sessao, n); agora = new Date(agora.getTime() + 60_000); }
    assert.deepEqual(textos.map(Boolean), [true, true, true, true, true, false, false]);
    assert.equal(textos[0], textoBoasVindas(1)); assert.equal(textos[4], textoBoasVindas(5));
    const hash = H(); const antes = (await svc.abrir(ana, hash)).sessao; const mesma = await svc.abrir(ana, hash); assert.equal(mesma.sessao, antes); assert.equal(mesma.novaSessao, false); assert.equal(mesma.boasVindas, null);
    agora = new Date(agora.getTime() + 3 * 3_600_000); assert.equal((await svc.abrir(ana, hash)).sessao, antes + 1); // mesma sessão de login, mas parada há mais de 2 h
    const v = await svc.ler(ana); assert.equal(v.sessoes, antes + 1);
  } finally { await pool.end(); }
});

test('oferta da apresentação: usuário novo vê UMA vez; "não" não repete; outro aparelho não repete', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoMeuJeito(consultar); await svc.garantirTabelas();
    const { sessoes: [bia, caio] } = await escritorio(consultar, ['bia', 'caio']);
    const a1 = await svc.abrir(bia, H()); assert.equal(a1.oferecerApresentacao, true); assert.equal(a1.legado, false); assert.ok(a1.boasVindas);
    const a2 = await svc.abrir(bia, H()); assert.equal(a2.oferecerApresentacao, false); assert.ok(a2.boasVindas, 'continua com boas-vindas até a 5ª abertura');
    await svc.responderApresentacao(bia, 'depois'); assert.equal((await svc.abrir(bia, H())).oferecerApresentacao, false);
    // "não" logo na primeira vez e entrada por outro computador/celular
    assert.equal((await svc.abrir(caio, H())).oferecerApresentacao, true); await svc.responderApresentacao(caio, 'nao');
    for (let i = 0; i < 3; i += 1) assert.equal((await svc.abrir(caio, H())).oferecerApresentacao, false);
    await assert.rejects(() => svc.responderApresentacao(caio, 'talvez'), /inválida/);
    const linha = (await consultar(`SELECT apresentacao_resposta, apresentacao_oferecida_em FROM ${TABELA_JEITO} WHERE user_id=$1`, [caio.userId])).rows[0];
    assert.equal(linha.apresentacao_resposta, 'nao'); assert.ok(linha.apresentacao_oferecida_em);
    // duas aberturas ao mesmo tempo (dois aparelhos): só uma recebe a oferta
    const { sessoes: [duda] } = await escritorio(consultar, ['duda']);
    const [x, y] = await Promise.all([svc.abrir(duda, H()), svc.abrir(duda, H())]);
    assert.equal([x, y].filter((r) => r.oferecerApresentacao).length, 1);
  } finally { await pool.end(); }
});

test('usuário legado (conta anterior à implantação): vê as boas-vindas UMA vez, com a oferta, e para', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoMeuJeito(consultar); await svc.garantirTabelas();
    const { sessoes: [lia, ivo] } = await escritorio(consultar, ['lia', 'ivo']);
    await consultar(`UPDATE contabil_auth_users SET created_at='2020-01-01' WHERE id=$1`, [lia.userId]); // conta antiga: não depende de flag manual
    const r1 = await svc.abrir(lia, H());
    assert.equal(r1.legado, true); assert.equal(r1.sessao, 5); assert.equal(r1.boasVindas, textoBoasVindas(1)); assert.equal(r1.oferecerApresentacao, true);
    for (let i = 0; i < 3; i += 1) { const r = await svc.abrir(lia, H()); assert.equal(r.boasVindas, null); assert.equal(r.oferecerApresentacao, false); }
    // conta criada depois da implantação é nova: recebe as 5
    const novo = await svc.abrir(ivo, H()); assert.equal(novo.legado, false); assert.equal(novo.sessao, 1);
    // outro aparelho do legado também não repete
    assert.equal((await svc.abrir(lia, H())).boasVindas, null);
    // legado que usou outra rota antes de abrir a Agente continua legado
    const { sessoes: [oto] } = await escritorio(consultar, ['oto']); await consultar(`UPDATE contabil_auth_users SET created_at='2020-01-01' WHERE id=$1`, [oto.userId]);
    await svc.observar(oto, [{ de: 'lancamentos', para: 'balancete' }]); assert.equal((await svc.abrir(oto, H())).legado, true);
  } finally { await pool.end(); }
});

test('escopo: cada pessoa vê só o próprio jeito; o administrador define o padrão do escritório; escritórios não se enxergam', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoMeuJeito(consultar);
    const { sessoes: [adm, func] } = await escritorio(consultar, ['adm', 'func']); const { sessoes: [outro] } = await escritorio(consultar, ['outro']);
    await svc.salvarPreferencia(func, { chave: 'telaInicial', valor: 'balancete' });
    assert.equal((await svc.ler(func)).efetivo.telaInicial, 'balancete'); assert.equal((await svc.ler(func)).origem.telaInicial, 'voce');
    assert.equal((await svc.ler(adm)).efetivo.telaInicial, 'inicio'); // a administradora não vê nem herda o da funcionária
    await assert.rejects(() => svc.salvarPreferencia(func, { chave: 'nivelConversa', valor: 'detalhado', escopo: 'escritorio' }), (e: any) => e.status === 403);
    await svc.salvarPreferencia(adm, { chave: 'nivelConversa', valor: 'detalhado', escopo: 'escritorio' });
    assert.equal((await svc.ler(func)).efetivo.nivelConversa, 'detalhado'); assert.equal((await svc.ler(func)).origem.nivelConversa, 'escritorio');
    assert.equal((await svc.ler(outro)).efetivo.nivelConversa, 'curto'); // outro escritório não é afetado
    await svc.salvarPreferencia(func, { chave: 'nivelConversa', valor: 'curto' }); assert.equal((await svc.ler(func)).efetivo.nivelConversa, 'curto'); // o pessoal vale sobre o do escritório
    await assert.rejects(() => svc.salvarPreferencia(adm, { chave: 'observarUso', valor: 'nao', escopo: 'escritorio' }), (e: any) => e.status === 400);
    // voltar ao padrão: uma coisa por vez
    await svc.removerPreferencia(func, { chave: 'nivelConversa' }); assert.equal((await svc.ler(func)).efetivo.nivelConversa, 'detalhado'); assert.equal((await svc.ler(func)).efetivo.telaInicial, 'balancete');
    await assert.rejects(() => svc.removerPreferencia(func, { chave: 'nivelConversa', escopo: 'escritorio' }), (e: any) => e.status === 403);
    await svc.removerPreferencia(adm, { chave: 'nivelConversa', escopo: 'escritorio' }); assert.equal((await svc.ler(func)).efetivo.nivelConversa, 'curto');
    // o servidor recusa o que tenta desligar proteção, mesmo chamado direto
    await assert.rejects(() => svc.salvarPreferencia(func, { chave: 'confirmacaoNaoProtegida', valor: 'nenhuma' }), (e: any) => e.status === 400 && e.protegido === true);
    await assert.rejects(() => svc.salvarPreferencia(func, { chave: 'semConfirmar', valor: 'sim' }), (e: any) => e.status === 400 && e.protegido === true);
    await assert.rejects(() => svc.salvarReceita(func, { gatilho: { tipo: 'entrar_no_sistema' }, acoes: [{ tipo: 'fechar_competencia' }] }), (e: any) => e.status === 400);
    const linhas = (await consultar(`SELECT user_id FROM ${TABELA_JEITO} WHERE tenant_id=$1`, [adm.tenantId])).rows.map((r: any) => r.user_id).sort();
    for (const l of linhas) assert.ok([adm.userId, func.userId, USUARIO_ESCRITORIO].includes(l), `linha inesperada ${l}`); // nenhuma linha de outra pessoa
    assert.ok(linhas.includes(func.userId) && linhas.includes(USUARIO_ESCRITORIO));
  } finally { await pool.end(); }
});

test('regras: uma por momento, trocar substitui, remover é uma por vez, só do próprio usuário', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoMeuJeito(consultar);
    const { sessoes: [a, b] } = await escritorio(consultar, ['a', 'b']);
    await svc.salvarReceita(a, { gatilho: { tipo: 'abrir_tela', tela: 'balancete' }, acoes: [{ tipo: 'destacar_secao', secao: 'balancete-verificacao' }] });
    await svc.salvarReceita(a, { gatilho: { tipo: 'entrar_no_sistema' }, acoes: [{ tipo: 'perguntar_agente', assunto: 'vencimentos' }] });
    let v = await svc.ler(a); assert.equal(v.receitas.length, 2); assert.equal(v.receitasAtivas.length, 2);
    await svc.salvarReceita(a, { gatilho: { tipo: 'abrir_tela', tela: 'balancete' }, acoes: [{ tipo: 'mostrar_atalho', tela: 'livros' }] });
    v = await svc.ler(a); assert.equal(v.receitas.length, 2); assert.match(v.receitas.find((r) => r.id === 'abrir:balancete')!.descricao, /atalho para Livros/);
    assert.equal((await svc.ler(b)).receitas.length, 0);
    await svc.removerReceita(b, 'abrir:balancete'); assert.equal((await svc.ler(a)).receitas.length, 2); // remover a "do outro" não faz nada
    await assert.rejects(() => svc.removerReceita(a, 'tudo'), (e: any) => e.status === 400);
    await svc.removerReceita(a, 'abrir:balancete'); v = await svc.ler(a); assert.deepEqual(v.receitas.map((r) => r.id), ['entrar']);
    // não guarda o que a pessoa escreve: só ids do catálogo
    const bruto = JSON.stringify((await consultar(`SELECT receitas, preferencias FROM ${TABELA_JEITO} WHERE user_id=$1`, [a.userId])).rows[0]);
    assert.doesNotMatch(bruto, /quero|peça|por favor/i);
  } finally { await pool.end(); }
});

test('sugestão nunca vira regra sem o sim; "agora não" some; desligar a observação apaga a contagem', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    const svc = criarServicoMeuJeito(consultar);
    const { sessoes: [p] } = await escritorio(consultar, ['p']); const { sessoes: [q] } = await escritorio(consultar, ['q']);
    const par = { de: 'lancamentos', para: 'balancete' };
    assert.deepEqual(await svc.observar(p, [par, par, par, { de: 'x', para: 'y' }, { de: 'lancamentos', para: 'lancamentos' }]), { aceitos: 3, ignorado: false });
    assert.equal((await svc.ler(p)).sugestoes.length, 0);
    await svc.observar(p, [par, par, par]);
    const antes = await svc.ler(p); assert.equal(antes.sugestoes.length, 1); assert.equal(antes.sugestoes[0].id, 'atalho:lancamentos>balancete');
    // observar, ler e abrir várias vezes não salvam nada
    for (let i = 0; i < 3; i += 1) { await svc.abrir(p, H()); await svc.observar(p, [par]); }
    let v = await svc.ler(p); assert.equal(v.receitas.length, 0); assert.deepEqual(v.meus, {}); assert.equal(v.sugestoes.length, 1);
    assert.equal((await svc.ler(q)).sugestoes.length, 0); // sugestão é só da própria pessoa
    await assert.rejects(() => svc.aceitarSugestao(q, 'atalho:lancamentos>balancete'), (e: any) => e.status === 404);
    v = await svc.aceitarSugestao(p, 'atalho:lancamentos>balancete'); assert.equal(v.receitas.length, 1); assert.equal(v.receitas[0].origem, 'sugerida'); assert.equal(v.sugestoes.length, 0);
    await assert.rejects(() => svc.aceitarSugestao(p, 'atalho:lancamentos>balancete'), (e: any) => e.status === 404);
    // "agora não"
    const { sessoes: [r] } = await escritorio(consultar, ['r']); await svc.observar(r, Array(6).fill(par)); assert.equal((await svc.ler(r)).sugestoes.length, 1);
    assert.equal((await svc.dispensarSugestao(r, 'atalho:lancamentos>balancete')).sugestoes.length, 0);
    await svc.observar(r, Array(6).fill(par)); assert.equal((await svc.ler(r)).sugestoes.length, 0, 'não insiste depois de dispensada');
    // desligar a observação apaga o que foi contado e ignora as próximas
    const { sessoes: [s] } = await escritorio(consultar, ['s']); await svc.observar(s, Array(6).fill(par));
    await svc.salvarPreferencia(s, { chave: 'observarUso', valor: 'nao' });
    assert.deepEqual((await consultar(`SELECT observacoes FROM ${TABELA_JEITO} WHERE user_id=$1`, [s.userId])).rows[0].observacoes, {});
    assert.deepEqual(await svc.observar(s, [par]), { aceitos: 0, ignorado: true }); assert.equal((await svc.ler(s)).sugestoes.length, 0);
  } finally { await pool.end(); }
});

test('regra obsoleta: o robô pausa e avisa na próxima abertura (uma vez); volta a valer sozinha; limpa o que ficou velho sem tocar no resto', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  try {
    let agora = new Date('2027-02-01T12:00:00Z'); const svc = criarServicoMeuJeito(consultar, () => agora);
    const { sessoes: [u, outro] } = await escritorio(consultar, ['u', 'o']);
    await svc.salvarReceita(u, { gatilho: { tipo: 'abrir_tela', tela: 'balancete' }, acoes: [{ tipo: 'destacar_secao', secao: 'balancete-verificacao' }] });
    await svc.salvarReceita(u, { gatilho: { tipo: 'entrar_no_sistema' }, acoes: [{ tipo: 'mostrar_atalho', tela: 'livros' }] });
    await svc.salvarPreferencia(u, { chave: 'telaInicial', valor: 'livros' });
    await svc.abrir(outro, H());
    // o sistema mudou: a parte "balancete-verificacao" deixou de existir (simulado direto no banco)
    await consultar(`UPDATE ${TABELA_JEITO} SET receitas=jsonb_set(receitas, '{abrir:balancete,acoes,0,secao}', '"parte-que-sumiu"') WHERE user_id=$1`, [u.userId]);
    assert.equal((await svc.ler(u)).receitasAtivas.length, 1, 'regra obsoleta nunca roda, mesmo antes do robô');
    // linhas de teste para a limpeza
    const fantasma = crypto.randomUUID(); await consultar(`INSERT INTO ${TABELA_JEITO}(tenant_id,user_id,sessoes) VALUES($1,$2,3)`, [u.tenantId, fantasma]);
    await consultar(`UPDATE ${TABELA_JEITO} SET observacoes='{"lancamentos>balancete":4,"telafalsa>balancete":9}', ultima_sessao_hash='velho', ultima_abertura=$2 WHERE user_id=$1`, [u.userId, new Date(agora.getTime() - 9 * 86_400_000).toISOString()]);
    const r = await svc.conferir();
    assert.ok(r.novasObsoletas >= 1); assert.ok(r.removidas >= 1); assert.equal(r.falhas, 0); assert.match(r.resumo, /obsoleta/);
    assert.equal((await consultar(`SELECT 1 FROM ${TABELA_JEITO} WHERE user_id=$1`, [fantasma])).rows.length, 0, 'jeito de quem não existe mais é apagado');
    assert.equal((await consultar(`SELECT 1 FROM ${TABELA_JEITO} WHERE tenant_id=$1`, [TENANT_SISTEMA])).rows.length, 1, 'a marca da implantação fica');
    const linha = (await consultar(`SELECT * FROM ${TABELA_JEITO} WHERE user_id=$1`, [u.userId])).rows[0];
    assert.deepEqual(linha.observacoes, { 'lancamentos>balancete': 4 }); assert.equal(linha.ultima_sessao_hash, null);
    assert.equal((await svc.ler(u)).efetivo.telaInicial, 'livros', 'preferência de quem existe nunca é apagada');
    assert.equal((await svc.ler(u)).receitas.find((x) => x.id === 'abrir:balancete')!.obsoleta, true);
    assert.equal((await svc.conferir()).novasObsoletas, 0, 'não avisa duas vezes');
    const ab = await svc.abrir(u, H()); assert.equal(ab.avisos.length, 1); assert.match(ab.avisos[0], /obsoleta.*Balancete/);
    assert.equal((await svc.abrir(u, H())).avisos.length, 0, 'o aviso é entregue uma vez');
    // a regra é restaurada (o sistema voltou a ter a parte): volta a valer
    await consultar(`UPDATE ${TABELA_JEITO} SET receitas=jsonb_set(receitas, '{abrir:balancete,acoes,0,secao}', '"balancete-verificacao"') WHERE user_id=$1`, [u.userId]);
    assert.equal((await svc.conferir()).voltaramAValer, 1); assert.equal((await svc.ler(u)).receitasAtivas.length, 2);
  } finally { await pool.end(); }
});

test('isolamento de tenant e rotas: sem sessão não entra; não existe rota que apague tudo; o servidor devolve só o jeito da sessão', { skip: !urlBanco }, async () => {
  const { pool, consultar } = await banco();
  const servidor = await new Promise<import('node:http').Server>((ok) => { const app = express(); app.use(express.json()); const svc = criarServicoMeuJeito(consultar);
    const sessao = (req: express.Request): SessaoJeito | undefined => { const u = req.header('x-teste'); return u ? JSON.parse(u) : undefined; };
    registrarRotasMeuJeito(app, { servico: svc, exigirSessao: (req, res, next) => (sessao(req) ? next() : res.status(401).json({ sucesso: false })), exigirOrigem: (_q, _r, next) => next(), sessao, hashSessao: (req) => String(req.header('x-hash') || 'h') });
    const s = app.listen(0, () => ok(s)); });
  try {
    const porta = (servidor.address() as any).port; const base = `http://127.0.0.1:${porta}/api/meu-jeito`;
    const { sessoes: [a] } = await escritorio(consultar, ['a']); const { sessoes: [b] } = await escritorio(consultar, ['b']);
    const chamar = async (s: SessaoJeito | null, caminho: string, metodo = 'GET', corpo?: object) => { const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', ...(s ? { 'x-teste': JSON.stringify(s) } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) as any }; };
    assert.equal((await chamar(null, '')).status, 401); assert.equal((await chamar(null, '/abrir', 'POST', {})).status, 401);
    assert.equal((await chamar(a, '/preferencias', 'POST', { chave: 'nivelConversa', valor: 'detalhado' })).status, 200);
    assert.equal((await chamar(a, '')).json.jeito.efetivo.nivelConversa, 'detalhado'); assert.equal((await chamar(b, '')).json.jeito.efetivo.nivelConversa, 'curto');
    // mesmo userId em outro escritório: linha própria (tenant na chave)
    const intruso: SessaoJeito = { ...b, userId: a.userId }; assert.equal((await chamar(intruso, '')).json.jeito.efetivo.nivelConversa, 'curto');
    assert.equal((await chamar(a, '/preferencias', 'POST', { chave: 'confirmarTudo', valor: 'nao' })).status, 400);
    const protegida = await chamar(a, '/preferencias', 'POST', { chave: 'confirmacaoNaoProtegida', valor: 'nenhuma' }); assert.equal(protegida.status, 400); assert.equal(protegida.json.protegido, true);
    assert.equal((await chamar(a, '/receitas', 'POST', { gatilho: { tipo: 'entrar_no_sistema' }, acoes: [{ tipo: 'excluir_empresa' }] })).status, 400);
    for (const [m, c] of [['DELETE', ''], ['DELETE', '/receitas'], ['POST', '/apagar-tudo'], ['POST', '/receitas/remover-todas'], ['POST', '/preferencias/remover-todas'], ['POST', '/limpar']] as const) assert.ok((await chamar(a, c, m, {})).status >= 400 && (await chamar(a, c, m, {})).status !== 200, `${m} ${c}`);
    assert.equal((await chamar(a, '/receitas/remover', 'POST', { id: 'tudo' })).status, 400);
    assert.equal((await chamar(a, '/abrir', 'POST', {})).json.sessao, 1);
    assert.equal((await chamar(a, '/apresentacao/resposta', 'POST', { resposta: 'nao' })).status, 200);
  } finally { servidor.close(); await pool.end(); }
});
