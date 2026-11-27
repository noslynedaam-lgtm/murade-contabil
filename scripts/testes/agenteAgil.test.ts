// Agente ágil (arquivo de teste igual no DP, Fiscal e Contábil): estilo curto, voz só do resumo, pedaços da voz, raciocínio
// baixo nas perguntas simples, prompt só com o que importa, regra de permissão, nome "Murad" e palavra de chamada.
// Nenhum teste chama a API real do Gemini.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISO_RESTO_NA_TELA, DECLARACAO_MAIS_FERRAMENTAS, ESTILO_AGIL, FRASES_PRONTAS, MAX_FALA_RESUMO, NOME_DA_AGENTE, NOME_MAIS_FERRAMENTAS, OFERTA_LEVAR,
  PedidoAgil, REGRA_PERMISSAO, aceitaTemperatura, chamouMurad, configDoPerfil, dicaDeChamada, ehOrdemDeTirar, ehOrdemExplicita, ehPedidoDeLevar,
  ehPerguntaDeLocal, ehSimParaLevar, escolherFerramentas, fraseDeApresentacao, janelaEmUso, linhaDeTempo, ofereceuLevar, pedacosParaVoz, pedidoDaPessoa,
  perfilDoPedido, podePrepararAcao, podarInstrucao, resumoParaFala, semPalavraDeChamada, soPerguntouComoFazer,
  assuntoDaPerguntaSeTem, ehPerguntaSeTem, respostaTemSim, COOKIE_JANELA, valorCookieJanela, souAJanelaMaisRecente, dominioPai,
} from '../../src/data/agenteAgil';
import { fraseDeSaudacao } from '../../src/server/agenteSaudacao';

test('estilo: instrução firme de responder direto, curto, sem saudação nem "posso ajudar em mais alguma coisa", e fazer já', () => {
  assert.match(ESTILO_AGIL, /Comece pela resposta ou pela ação/);
  assert.match(ESTILO_AGIL, /1 a 3 frases curtas/);
  assert.match(ESTILO_AGIL, /Sem saudação/);
  assert.match(ESTILO_AGIL, /sem repetir a pergunta/);
  assert.match(ESTILO_AGIL, /posso ajudar em mais alguma coisa/);
  assert.match(ESTILO_AGIL, /Não liste opções que ninguém pediu/);
  assert.match(ESTILO_AGIL, /explica melhor/);
  assert.match(ESTILO_AGIL, /faça já na primeira resposta/);
});

test('voz: fala só o resumo (1 a 2 frases, até ~250 caracteres); o resto fica na tela', () => {
  const longo = 'A folha de outubro da Morais está pronta para conferir. São 12 funcionários e o líquido total é R$ 23.456,78. O FGTS vence dia 20. O INSS vence dia 20 também. Quer que eu prepare as guias?';
  const r = resumoParaFala(longo);
  assert.ok(r.startsWith('A folha de outubro da Morais está pronta para conferir. São 12 funcionários e o líquido total é R$ 23.456,78.'), r);
  assert.ok(r.endsWith(AVISO_RESTO_NA_TELA));
  assert.ok(r.length <= MAX_FALA_RESUMO + AVISO_RESTO_NA_TELA.length + 1);
  // Curto: fala tudo, sem aviso.
  assert.equal(resumoParaFala('Feito.'), 'Feito.');
  assert.equal(resumoParaFala('Fica em Férias. Quer que eu te leve?'), 'Fica em Férias. Quer que eu te leve?');
  // Uma frase enorme é cortada numa vírgula/espaço, sem quebrar palavra.
  const enorme = `Você tem ${'empresa com pendência, '.repeat(30)}fim.`;
  const c = resumoParaFala(enorme);
  assert.ok(c.length <= MAX_FALA_RESUMO + AVISO_RESTO_NA_TELA.length + 2, String(c.length));
  assert.ok(!/\bempre$/.test(c.replace(` ${AVISO_RESTO_NA_TELA}`, '').replace(/\.$/, '')));
  // Links, marcadores e markdown não são falados.
  assert.doesNotMatch(resumoParaFala('**Pronto.** Veja em https://exemplo.gov.br/x'), /https|\*\*/);
  assert.equal(resumoParaFala(''), '');
});

test('voz: divide por frases, primeiro pedaço curto para começar a tocar logo; frase pronta vai sozinha (cache)', () => {
  const p = pedacosParaVoz('Pronto, achei. A folha de outubro da Morais está pronta para conferir, com doze funcionários e nenhum erro no cálculo. O resto está na tela.');
  assert.equal(p[0], 'Pronto, achei.');
  assert.ok(p.every((x) => x.length <= 200), JSON.stringify(p));
  assert.equal(p.at(-1), AVISO_RESTO_NA_TELA);
  assert.ok(FRASES_PRONTAS.includes(OFERTA_LEVAR) && FRASES_PRONTAS.includes('Feito.'));
  const so = pedacosParaVoz('Uma frase bem comprida que passa de noventa caracteres para ver se o primeiro pedaço é cortado direitinho na vírgula, sem perder nada.');
  assert.ok(so[0].length <= 91, so[0]);
  assert.equal(so.join(' ').replace(/\s+/g, ' '), 'Uma frase bem comprida que passa de noventa caracteres para ver se o primeiro pedaço é cortado direitinho na vírgula, sem perder nada.');
});

test('raciocínio: mínimo nas perguntas simples (no modelo que aceita), baixo em ação/cálculo, médio só com documento', () => {
  assert.equal(perfilDoPedido('o que vence hoje?'), 'simples');
  assert.equal(perfilDoPedido('quantas empresas eu tenho?'), 'simples');
  assert.equal(perfilDoPedido('como excluo um funcionário?'), 'simples');
  assert.equal(perfilDoPedido('calcula a rescisão do João'), 'calculo');
  assert.equal(perfilDoPedido('pode enviar a admissão da Maria'), 'acao');
  assert.equal(perfilDoPedido('cadastra esse funcionário', { anexo: true }), 'documento');
  assert.equal(configDoPerfil('gemini-3.1-flash-lite', 'simples').thinkingLevel, 'MINIMAL');
  assert.equal(configDoPerfil('gemini-3.5-flash-lite', 'simples').thinkingLevel, 'MINIMAL');
  // gemini-3.8-flash não tem "minimal" (vai de low para cima, conforme a documentação oficial): usa LOW.
  assert.equal(configDoPerfil('gemini-3.8-flash', 'simples').thinkingLevel, 'LOW');
  assert.equal(configDoPerfil('gemini-3.1-flash-lite', 'acao').thinkingLevel, 'LOW');
  assert.equal(configDoPerfil('gemini-3.1-flash-lite', 'documento').thinkingLevel, 'MEDIUM');
  assert.ok(configDoPerfil('x', 'simples').maxOutputTokens <= 2048);
  assert.ok(configDoPerfil('x', 'simples').tempoRapidoMs < configDoPerfil('x', 'documento').tempoRapidoMs);
  assert.equal(aceitaTemperatura('gemini-3.8-flash'), false);
  assert.equal(aceitaTemperatura('gemini-2.5-flash'), true);
});

const DECL = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `ferramenta_generica_${i}`, description: `Faz a coisa ${i} sobre assunto qualquer.`, parameters: { type: 'OBJECT', properties: {} } }));
test('prompt menor: só as ferramentas do assunto + as que sempre vão; linhas de ferramentas que ficaram de fora saem do prompt', () => {
  const decls = [
    ...DECL(60),
    { name: 'consultar_ferias_vencidas', description: 'Lista as férias vencidas e a vencer dos funcionários.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'calcular_rescisao_trabalhador', description: 'Calcula a rescisão (TRCT) de um funcionário.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'onde_fica', description: 'Onde fica cada tela.', parameters: { type: 'OBJECT', properties: {} } },
  ];
  const instrucao = 'Regra geral sem ferramenta.\n- Para férias use consultar_ferias_vencidas.\n- Para rescisão use calcular_rescisao_trabalhador.\n- Nunca grave nada sem o cartão.';
  const e = escolherFerramentas(decls, instrucao, 'quais férias estão vencidas?');
  assert.equal(e.completo, false);
  const nomes = e.declaracoes.map((d) => d.name);
  assert.ok(nomes.includes('consultar_ferias_vencidas'));
  assert.ok(nomes.includes('onde_fica'), 'onde_fica sempre vai');
  assert.ok(!nomes.includes('calcular_rescisao_trabalhador'));
  assert.ok(e.declaracoes.length < decls.length / 2);
  assert.match(e.instrucao, /consultar_ferias_vencidas/);
  assert.doesNotMatch(e.instrucao, /calcular_rescisao_trabalhador/);
  assert.match(e.instrucao, /Regra geral sem ferramenta/);
  assert.match(e.instrucao, /Nunca grave nada sem o cartão/);
  // Sem pista nenhuma no pedido: vai tudo (nunca deixa o modelo sem a ferramenta certa).
  assert.equal(escolherFerramentas(decls, instrucao, 'sim').completo, true);
  assert.equal(podarInstrucao('a\n- use xyz_abc aqui', ['xyz_abc'], new Set()), 'a');
});

test('motor ágil: histórico curto conta na escolha, mais_ferramentas devolve a lista completa e a linha de tempo não tem dado pessoal', () => {
  const decls = [...DECL(60), { name: 'consultar_ferias_vencidas', description: 'Lista as férias vencidas.', parameters: { type: 'OBJECT', properties: {} } }];
  const p = new PedidoAgil({ sistema: 'dp', declaracoes: decls, instrucaoKit: 'x', mensagem: 'e da outra empresa?', historico: [{ papel: 'usuario', texto: 'quais férias estão vencidas na Morais?' }, { papel: 'ia', texto: 'Na Morais, nenhuma.' }] });
  assert.ok(p.declaracoes.some((d) => d.name === 'consultar_ferias_vencidas'));
  assert.ok(p.declaracoes.some((d) => d.name === NOME_MAIS_FERRAMENTAS));
  assert.equal(p.perfil, 'simples');
  p.liberarTudo();
  assert.equal(p.declaracoes.length, decls.length);
  assert.ok(!p.declaracoes.includes(DECLARACAO_MAIS_FERRAMENTAS as any));
  const linha = linhaDeTempo({ ...p.medicao('Resposta curta.'), modeloMs: [1200, 800], rodadas: 2 });
  assert.match(linha, /^\[Agente tempo\] sistema=dp perfil=simples preparo=\d+ms prompt=\d+ms modelo=2000ms\(1200\+800\) ferramentas=\d+ms rodadas=2 promptChars=\d+ tokens~\d+ resposta=15 escolhidas=\d+\/61$/);
  assert.doesNotMatch(linha, /Morais|férias/);
  assert.equal(pedidoDaPessoa('[Dica interna do sistema, não repita: x]\ncomo excluo?'), 'como excluo?');
});

test('intenção: "me leva", "abre", "vai para" é pedido de ir; "onde fica", "como faço/excluo" é pergunta; "sim" aceita a oferta', () => {
  for (const f of ['me leva até a folha', 'Me leve para férias', 'abre a tela de rescisão', 'vai para o eSocial', 'quero ir em Funcionários', 'Abrir o 13º']) assert.ok(ehPedidoDeLevar(f), f);
  for (const f of ['onde fica a folha?', 'como excluo um funcionário?', 'Como faço a rescisão?', 'em qual tela eu envio a admissão?', 'como envio o S-1299?']) assert.ok(ehPerguntaDeLocal(f), f);
  for (const f of ['sim', 'Sim, pode', 'leva', 'pode levar', 'quero', 'bora', 'isso mesmo']) assert.ok(ehSimParaLevar(f), f);
  for (const f of ['sim, mas antes calcula a folha de outubro de todas as empresas do escritório', 'não']) assert.ok(!ehSimParaLevar(f), f);
  assert.ok(ofereceuLevar(`Fica em Férias. ${OFERTA_LEVAR}`));
  assert.ok(!ofereceuLevar('Fica em Férias.'));
});

test('permissão: pergunta "como excluo" nunca vira ação; exclusão só com ordem explícita; "você pode excluir?" não é ordem', () => {
  assert.ok(soPerguntouComoFazer('como excluo um funcionário?'));
  assert.ok(soPerguntouComoFazer('onde eu envio a admissão?'));
  assert.equal(podePrepararAcao('como excluo o João?', true).pode, false);
  assert.equal(podePrepararAcao('como faço para calcular a folha?', false).pode, false);
  assert.equal(podePrepararAcao('pode excluir o João', true).pode, true);
  assert.equal(podePrepararAcao('exclui a empresa Teste', true).pode, true);
  assert.equal(podePrepararAcao('quero excluir o funcionário João', true).pode, true);
  assert.equal(podePrepararAcao('você pode excluir funcionário?', true).pode, false);
  assert.equal(podePrepararAcao('o João saiu da empresa', true).pode, false, 'sem ordem de excluir');
  // "Sim" logo depois de a Agente perguntar se pode excluir vale como ordem.
  assert.equal(podePrepararAcao('sim', true, 'Quer que eu prepare a exclusão do João?').pode, true);
  assert.equal(podePrepararAcao('sim', true, 'Quer que eu te leve?').pode, false);
  assert.equal(podePrepararAcao('calcula a folha da Morais', false).pode, true);
  assert.ok(ehOrdemExplicita('pode enviar a admissão'));
  assert.ok(ehOrdemExplicita('fecha a folha de outubro'));
  assert.ok(!ehOrdemExplicita('como envio a admissão?'));
  assert.ok(!ehOrdemDeTirar('como excluo?'));
  assert.match(REGRA_PERMISSAO, /Levar até a tela é livre/);
  assert.match(REGRA_PERMISSAO, /PEDIR com todas as letras/);
});

test('nome "Murad": apresentação do primeiro contato e saudação curta depois', () => {
  assert.equal(NOME_DA_AGENTE, 'Murad');
  assert.equal(fraseDeApresentacao('Ana'), 'Prazer, Ana! Meu nome é Murad. Qualquer coisa, é só me chamar pelo nome: "Murad, me ajuda com..." ou "Murad, faz tal coisa", que eu já te respondo.');
  assert.equal(fraseDeSaudacao('Ana'), 'Oi, Ana.');
});

test('palavra de chamada: "Murad" e variações (Murade, Muradi, Mourad, Murat); sem ela nada dispara', () => {
  for (const f of ['Murad, me leva até a folha', 'murade abre férias', 'Muradi', 'Mourad, quanto vence hoje?', 'Murat faz a folha', 'ô Murad', 'Mu rad, oi']) assert.ok(chamouMurad(f), f);
  for (const f of ['me leva até a folha', 'muralha', 'murada da casa', 'amurado', 'DP, abre a folha']) assert.ok(!chamouMurad(f), f);
  assert.equal(semPalavraDeChamada('Murad, me leva até a folha'), 'me leva até a folha');
  assert.equal(semPalavraDeChamada('Murat: abre férias'), 'abre férias');
});

test('janela em uso: só a que tem foco responde; escondida nunca; sem foco nenhuma, só a da interação MAIS recente (nunca duas)', () => {
  assert.equal(janelaEmUso({ temFoco: true, visivel: true, souAMaisRecente: null }), true);
  assert.equal(janelaEmUso({ temFoco: true, visivel: false, souAMaisRecente: true }), false);
  assert.equal(janelaEmUso({ temFoco: false, visivel: true, souAMaisRecente: true }), true);
  assert.equal(janelaEmUso({ temFoco: false, visivel: true, souAMaisRecente: false }), false);
  assert.equal(janelaEmUso({ temFoco: false, visivel: true, souAMaisRecente: null }), false, 'sem lugar comum: sem foco não responde');
  // Duas janelas sem foco e um só cookie comum: exatamente uma responde.
  const cookie = `x=1; ${COOKIE_JANELA}=${valorCookieJanela('fiscal-abc', 1000)}`;
  const respondem = ['dp-123', 'fiscal-abc', 'contabil-9'].filter((id) => janelaEmUso({ temFoco: false, visivel: true, souAMaisRecente: souAJanelaMaisRecente(cookie, id) }));
  assert.deepEqual(respondem, ['fiscal-abc']);
  assert.equal(souAJanelaMaisRecente('x=1', 'dp'), null);
  assert.equal(dominioPai('dp.murad.com.br'), 'murad.com.br');
  assert.equal(dominioPai('fiscal.murad.app'), 'murad.app');
  assert.equal(dominioPai('murade-dp.onrender.com'), null, 'onrender.com é sufixo público: cada sistema é um site separado');
  assert.equal(dominioPai('localhost'), null);
  assert.match(dicaDeChamada(true), /Diga "Murad"/);
  assert.match(dicaDeChamada(false), /Toque no microfone/);
});

test('honestidade: "o sistema tem X?" é reconhecido; a regra manda responder só pelo que existe e nunca dizer que tem o que não achou', () => {
  assert.ok(ehPerguntaSeTem('o sistema tem exclusão guiada?'));
  assert.ok(ehPerguntaSeTem('Murad, tem como emitir boleto?'));
  assert.ok(ehPerguntaSeTem('faz a rescisão?'));
  assert.ok(!ehPerguntaSeTem('tem'));
  assert.ok(!ehPerguntaSeTem('me leva até a folha'));
  assert.equal(assuntoDaPerguntaSeTem('o sistema tem a exclusão guiada no sistema?'), 'exclusao guiada');
  assert.equal(respostaTemSim('Férias', 'Calcular férias.'), `Tem sim: fica em Férias. Calcular férias. ${OFERTA_LEVAR}`);
  assert.match(ESTILO_AGIL, /HONESTIDADE/);
  assert.match(ESTILO_AGIL, /Nunca diga que tem uma função que você não achou/);
  assert.match(ESTILO_AGIL, /Ainda não tem/);
});

test('dica de ajuda por inatividade: só na primeira semana, parado 20 s, 1 vez por tela por dia, e dá para desligar', async () => {
  const { AJUDA_PARADO_MS, FRASE_AJUDA, deveOferecerAjuda } = await import('../../src/data/agenteAgil');
  const agora = 10 * 24 * 60 * 60_000;
  const base = { primeiroUsoMs: agora - 2 * 24 * 60 * 60_000, ofertas: {}, desligada: false };
  assert.equal(FRASE_AJUDA, 'Precisa de ajuda? É só dizer "Murad".');
  assert.equal(deveOferecerAjuda(base, 'folha', agora, agora - AJUDA_PARADO_MS, '2026-11-27'), true);
  assert.equal(deveOferecerAjuda(base, 'folha', agora, agora - 5000, '2026-11-27'), false, 'mexeu há pouco');
  assert.equal(deveOferecerAjuda({ ...base, ofertas: { folha: '2026-11-27' } }, 'folha', agora, 0, '2026-11-27'), false, 'já ofereceu hoje nesta tela');
  assert.equal(deveOferecerAjuda({ ...base, ofertas: { folha: '2026-11-26' } }, 'folha', agora, 0, '2026-11-27'), true);
  assert.equal(deveOferecerAjuda({ ...base, desligada: true }, 'folha', agora, 0, '2026-11-27'), false);
  assert.equal(deveOferecerAjuda({ ...base, primeiroUsoMs: 0 }, 'folha', agora, 0, '2026-11-27'), false, 'depois da primeira semana');
});

test('depois de corrigir, confere de novo sozinha e diz "Pronto, agora está certo." (espera o salvamento; tenta de novo se ainda faltar)', async () => {
  const { reconferirAposCorrigir, cnpjDoPlano } = await import('../../src/utils/reconferirAposCorrigir');
  const { TITULO_CORRECAO, fraseDaReconferencia } = await import('../../src/data/agenteAgil');
  assert.equal(cnpjDoPlano([{ alvo: 'empresa:11222333000181' }]), '11222333000181');
  assert.equal(cnpjDoPlano([{ alvo: '[data-campo="empresa-editar-11222333000181"]' }]), '11222333000181');
  assert.equal(cnpjDoPlano([{ alvo: '[data-campo=empresa-ativa]', valor: '11222333000181' }]), '11222333000181');
  const plano = { titulo: `${TITULO_CORRECAO} TESTE`, passos: [{ alvo: 'empresa:11222333000181' }] };
  const falou: string[] = []; const esperas: number[] = [];
  const respostas = [fraseDaReconferencia(['o RAT está 1%']), fraseDaReconferencia([])];
  let i = 0;
  const buscar = async (url: string, init: any) => { assert.equal(url, '/api/ai/agente/reconferir'); assert.equal(JSON.parse(init.body).cnpj, '11222333000181'); const frase = respostas[Math.min(i++, 1)]; return { ok: true, json: async () => ({ frase }) }; };
  const f = await reconferirAposCorrigir(plano, (t) => falou.push(t), { buscar, esperar: async (ms) => { esperas.push(ms); } });
  assert.equal(f, 'Pronto, agora está certo.');
  assert.deepEqual(falou, ['Pronto, agora está certo.']);
  assert.deepEqual(esperas, [2500, 3000]);
  // Plano que não é de correção: não confere nada.
  assert.equal(await reconferirAposCorrigir({ titulo: 'Levando até Férias', passos: [] }, () => assert.fail('não devia falar'), { buscar, esperar: async () => undefined }), null);
});
