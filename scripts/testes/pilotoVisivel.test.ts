import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_FINAIS, MS_POR_CARACTERE, MSG_INTERFERENCIA, MSG_SO_TELA, PilotoExecutor, aplicarIntencaoAoPiloto, analisarAlvo, intencaoDoTexto,
  registrarPilotoAtivo, transicaoPiloto, validarPlanoPiloto,
  type AmbientePiloto, type EstadoPiloto, type EventoPiloto, type ModoCampo, type PassoPiloto, type PlanoPiloto, MSG_SEGUNDO_PLANO,
} from '../../src/utils/pilotoVisivel';

// ---- ambiente falso: registra tudo que o piloto faz na "tela"
type El = { alvo: string; modo?: ModoCampo; sensivel?: boolean; desabilitado?: boolean; final?: 'salvar' | 'irreversivel'; abre?: boolean; opcoes?: string[]; editavel?: boolean };
class Falso implements AmbientePiloto {
  log: string[] = []; valores: Record<string, string> = {}; esperas: number[] = [];
  tela = 'inicio'; empresa = ''; pronta = true; cliquesFinais = 0;
  aoEsperar: ((n: number, ms: number) => void) | null = null;
  apiResultado: { ok: boolean; motivo?: string } = { ok: false };
  constructor(public els: Record<string, El>) {}
  resolver(alvo: string) { return this.els[alvo] ?? null; }
  async aguardar(alvo: string) { this.log.push(`aguardar:${alvo}`); await Promise.resolve(); return this.els[alvo] ?? null; }
  ehSensivel(e: any) { return !!e.sensivel; }
  ehDesabilitado(e: any) { return !!e.desabilitado; }
  modoDoCampo(e: any): ModoCampo { return e.modo ?? 'digitar'; }
  temOpcao(e: any, v: string) { return !e.opcoes || e.opcoes.includes(v); }
  ehCampoEditavel(e: any) { return e.editavel !== false; }
  podeClicarParaAbrir(e: any) { return !!e.abre && !e.final; }
  tipoDeBotaoFinal(e: any) { return e.final ?? null; }
  rolarAte(e: any) { this.log.push(`rolar:${e.alvo}`); }
  destacar(e: any, _l: string, final: boolean) { this.log.push(`destacar:${e.alvo}${final ? ':final' : ''}`); }
  limparDestaque() { this.log.push('limpar'); }
  definirValor(e: any, t: string) { this.valores[e.alvo] = t; this.log.push(`valor:${e.alvo}=${t}`); }
  focar() { /* sem foco */ }
  clicar(e: any) { this.log.push(`clicar:${e.alvo}`); if (e.final) this.cliquesFinais += 1; }
  aoClicarUmaVez(e: any, cb: () => void) { this.log.push(`ouvir:${e.alvo}`); this.cliqueReal = cb; return () => { this.cliqueReal = null; }; }
  cliqueReal: (() => void) | null = null;
  navegarPara(t: string) { this.log.push(`navegar:${t}`); this.tela = t; return true; }
  selecionarEmpresa(c: string) { this.log.push(`empresa:${c}`); this.empresa = c; return true; }
  telaAtual() { return this.tela; }
  empresaAtual() { return this.empresa; }
  empresaPronta() { return this.pronta; }
  async executarApi(p: PassoPiloto) { this.log.push(`api:${p.api?.ferramenta}`); return this.apiResultado; }
  async esperar(ms: number) { this.esperas.push(ms); this.aoEsperar?.(this.esperas.length, ms); await Promise.resolve(); }
  toques() { return this.log.filter((l) => /^(navegar|empresa|clicar|valor|rolar|destacar|aguardar)/.test(l)).length; }
}
const campo = (alvo: string, extra: Partial<El> = {}): [string, El] => [alvo, { alvo, ...extra }];
const telaLancamento = () => new Falso(Object.fromEntries([
  campo('#btn-novo-lancamento', { abre: true }), campo('[data-campo=lancamento-data]'), campo('[data-campo=lancamento-valor]', { modo: 'numero' }),
  campo('[data-campo=lancamento-debito-codigo]'), campo('[data-campo=lancamento-gravar]', { final: 'salvar' }),
]));
const PLANO: PlanoPiloto = {
  titulo: 'Preencher lançamento',
  passos: [
    { tipo: 'selecionar', alvo: '[data-campo=empresa-ativa]', valor: '12345678000190', legenda: 'Escolhendo a empresa' },
    { tipo: 'navegar', alvo: '#btn-menu-lancamentos', legenda: 'Abrindo Lançamentos' },
    { tipo: 'navegar', alvo: '#btn-novo-lancamento', legenda: 'Abrindo o formulário' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-data]', valor: '05/11/2026', legenda: 'Data' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-valor]', valor: '1500.50', legenda: 'Valor' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-debito-codigo]', valor: '1.1.01', legenda: 'Estou preenchendo a conta de débito: 1.1.01' },
    { tipo: 'parar_no_botao', alvo: '[data-campo=lancamento-gravar]', legenda: 'Gravar Lançamento' },
  ],
};
const ocioso = async (n = 40) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

test('sem como apertar (ambiente sem clique animado): executa a sequência, digita no ritmo e PARA no botão esperando a pessoa', async () => {
  const amb = telaLancamento();
  const falas: string[] = [];
  const exec = new PilotoExecutor(PLANO, amb, { ritmo: 'normal', aoFalar: (t) => falas.push(t) });
  const r = await Promise.race([exec.iniciar(), ocioso(200).then(() => null)]);
  assert.equal(r, null, 'ainda aguardando confirmação: não terminou sozinho');
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.deepEqual(amb.log.filter((l) => /^(empresa|navegar|clicar)/.test(l)), ['empresa:12345678000190', 'navegar:lancamentos', 'clicar:#btn-novo-lancamento']);
  const digitado = amb.log.filter((l) => l.startsWith('valor:[data-campo=lancamento-debito-codigo]=')).map((l) => l.split(']=')[1]);
  assert.deepEqual(digitado, ['', '1', '1.', '1.1', '1.1.', '1.1.0', '1.1.01']);
  // campo numérico não recebe "1500." como valor parcial
  const num = amb.log.filter((l) => l.startsWith('valor:[data-campo=lancamento-valor]=')).map((l) => l.split(']=')[1]);
  assert.ok(!num.includes('1500.'), num.join('|'));
  assert.equal(num[num.length - 1], '1500.50');
  assert.ok(amb.esperas.includes(MS_POR_CARACTERE.normal) && MS_POR_CARACTERE.normal >= 25 && MS_POR_CARACTERE.normal <= 40); // ligeiro (pedido do dono, 27/11/2026)
  assert.equal(amb.cliquesFinais, 0, 'parar_no_botao nunca clica');
  assert.ok(!amb.log.some((l) => l === 'clicar:[data-campo=lancamento-gravar]'));
  assert.ok(amb.log.includes('destacar:[data-campo=lancamento-gravar]:final'));
  assert.match(falas[falas.length - 1], /Sua vez: aperte/);
  // o clique real do contador conclui
  amb.cliqueReal?.();
  assert.equal(exec.getEstado(), 'concluido');
  assert.equal((await exec.terminou).estado, 'concluido');
});

test('interferência pausa, fala a mensagem fixa, não executa mais nada e "continuar" retoma do campo em que parou', async () => {
  const amb = telaLancamento();
  const falas: string[] = [];
  const exec = new PilotoExecutor(PLANO, amb, { aoFalar: (t) => falas.push(t) });
  let parou = false;
  amb.aoEsperar = () => { if (!parou && amb.log.filter((l) => l.startsWith('valor:[data-campo=lancamento-data]=')).length >= 4) { parou = true; exec.interferir('teclado'); } };
  void exec.iniciar();
  await ocioso();
  assert.equal(exec.getEstado(), 'pausado');
  assert.equal(falas[0], MSG_INTERFERENCIA);
  assert.equal(MSG_INTERFERENCIA, 'Você interferiu, vou pausar. Quando quiser que eu continue, é só me avisar.');
  const antes = amb.log.length;
  await ocioso();
  assert.equal(amb.log.length, antes, 'pausado não executa passo nenhum');
  exec.retomar();
  await ocioso(200);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(amb.valores['[data-campo=lancamento-data]'], '05/11/2026');
  assert.equal(amb.valores['[data-campo=lancamento-debito-codigo]'], '1.1.01');
  assert.equal(exec.resultado().interferencias, 1);
});

test('interferir não registra o que foi digitado: a API só recebe a origem genérica', async () => {
  const exec = new PilotoExecutor(PLANO, telaLancamento());
  assert.equal(exec.interferir.length, 1);
  const instantaneo = JSON.stringify(exec.instantaneo()) + JSON.stringify(exec.resultado());
  assert.doesNotMatch(instantaneo, /05\/11\/2026|1500|1\.1\.01/, 'nem o instantâneo nem o resultado carregam valores digitados');
});

test('cancelar para tudo, limpa o destaque e o que já foi preenchido não é desfeito', async () => {
  const amb = telaLancamento();
  const exec = new PilotoExecutor(PLANO, amb);
  amb.aoEsperar = () => { if (amb.log.filter((l) => l.startsWith('valor:[data-campo=lancamento-data]=')).length === 3) exec.cancelar(); };
  void exec.iniciar();
  const r = await exec.terminou;
  await ocioso();
  assert.equal(r.estado, 'cancelado');
  assert.ok(amb.log.includes('limpar'));
  assert.ok(!amb.log.some((l) => l.includes('lancamento-valor')), 'nada depois do cancelamento');
});

test('se o contador trocou de tela durante a pausa, retomar reposiciona (refaz sem animar) e termina', async () => {
  const amb = telaLancamento();
  const exec = new PilotoExecutor(PLANO, amb);
  amb.aoEsperar = () => { if (amb.log.filter((l) => l.startsWith('valor:[data-campo=lancamento-valor]=')).length === 3) { amb.aoEsperar = null; exec.interferir('rota'); } };
  void exec.iniciar();
  await ocioso();
  assert.equal(exec.getEstado(), 'pausado');
  amb.tela = 'balancete'; // o contador foi para outra tela
  exec.retomar();
  await ocioso(300);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(amb.log.filter((l) => l === 'navegar:lancamentos').length, 2, 'voltou para a tela do plano');
  assert.equal(amb.valores['[data-campo=lancamento-valor]'], '1500.50');
  assert.equal(amb.cliquesFinais, 0);
});

test('telaMudou: mudança feita pelo próprio piloto não é interferência; mudança do contador é', async () => {
  const amb = telaLancamento();
  const exec = new PilotoExecutor(PLANO, amb);
  const navegarOriginal = amb.navegarPara.bind(amb);
  amb.navegarPara = (t: string) => { const r = navegarOriginal(t); queueMicrotask(() => exec.telaMudou(t)); return r; }; // o efeito do React avisa depois de navegar
  void exec.iniciar();
  await ocioso(200);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(exec.resultado().interferencias, 0);
  exec.telaMudou('balancete');
  assert.equal(exec.getEstado(), 'aguardando_confirmacao', 'depois de parar no botão, trocar de tela não reinicia nada');
});

test('"pode confirmar" por voz só vale para botão de salvar; ação irreversível exige o clique do contador', async () => {
  const salvar = telaLancamento();
  const e1 = new PilotoExecutor(PLANO, salvar);
  void e1.iniciar(); await ocioso(200);
  assert.equal(e1.confirmarPorVoz(), 'confirmado');
  assert.equal(salvar.cliquesFinais, 1, 'o contador autorizou em voz alta');
  assert.equal(e1.getEstado(), 'concluido');

  const irrev = telaLancamento(); irrev.els['[data-campo=lancamento-gravar]'].final = 'irreversivel';
  const e2 = new PilotoExecutor(PLANO, irrev);
  void e2.iniciar(); await ocioso(200);
  assert.equal(e2.confirmarPorVoz(), 'so_clique');
  assert.equal(irrev.cliquesFinais, 0);
  assert.equal(e2.getEstado(), 'aguardando_confirmacao');
  // sem estar parado no botão, confirmar não faz nada
  const e3 = new PilotoExecutor(PLANO, telaLancamento());
  assert.equal(e3.confirmarPorVoz(), 'nada');
});

test('campo de senha/token/dado bancário é recusado: nada é digitado e o piloto segue', async () => {
  const amb = telaLancamento();
  amb.els['[data-campo=lancamento-data]'].sensivel = true;
  const exec = new PilotoExecutor(PLANO, amb);
  void exec.iniciar(); await ocioso(200);
  assert.ok(!amb.log.some((l) => l.startsWith('valor:[data-campo=lancamento-data]')), 'não digitou no campo sigiloso');
  assert.equal(exec.resultado().recusados, 1);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(amb.valores['[data-campo=lancamento-valor]'], '1500.50');
});

test('campo travado (preenchido pelo sistema) e item que não é campo não são digitados', async () => {
  const amb = telaLancamento();
  amb.els['[data-campo=lancamento-valor]'].desabilitado = true;
  const exec = new PilotoExecutor(PLANO, amb);
  void exec.iniciar(); await ocioso(200);
  assert.ok(!amb.log.some((l) => l.startsWith('valor:[data-campo=lancamento-valor]')));
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  const amb2 = telaLancamento(); amb2.els['[data-campo=lancamento-data]'].editavel = false;
  const e2 = new PilotoExecutor(PLANO, amb2);
  void e2.iniciar(); const r = await e2.terminou;
  assert.equal(r.estado, 'erro');
});

test('navegar nunca clica em botão que não seja de abrir (nem em botão final)', async () => {
  const amb = telaLancamento();
  const plano: PlanoPiloto = { titulo: 'x', passos: [{ tipo: 'navegar', alvo: '[data-campo=lancamento-gravar]', legenda: 'Abrindo' }] };
  const exec = new PilotoExecutor(plano, amb);
  void exec.iniciar();
  const r = await exec.terminou;
  assert.equal(r.estado, 'erro');
  assert.equal(amb.cliquesFinais, 0);
  assert.ok(!amb.log.some((l) => l.startsWith('clicar')));
});

test('elemento não encontrado vira aviso em texto e o piloto termina (nunca trava nem fica em silêncio)', async () => {
  const amb = new Falso({});
  const falas: string[] = [];
  const exec = new PilotoExecutor({ titulo: 'x', passos: [{ tipo: 'destacar', alvo: '[data-campo=nao-existe]', legenda: 'Aqui' }] }, amb, { aoFalar: (t) => falas.push(t) });
  void exec.iniciar();
  const r = await exec.terminou;
  assert.equal(r.estado, 'concluido');
  assert.ok(exec.instantaneo().avisos.some((a) => /Não achei o campo nao-existe/.test(a)));
  assert.ok(falas.some((f) => /Avisos: Não achei/.test(f)), 'avisa em texto/voz o que faltou');
});

// ---- ambiente que também aperta (como o do navegador): botões com texto e clique animado
class FalsoQueAperta extends Falso {
  apertados: string[] = [];
  textos: Record<string, string> = {};
  descrever(e: any) { return e.alvo in this.textos ? { texto: this.textos[e.alvo] } : null; }
  async clicarAnimado(e: any, animar: boolean) { this.apertados.push(`${e.alvo}${animar ? '' : ' (sem animação)'}`); return true; }
  async clicarMenu(t: string) { this.log.push(`menu:${t}`); this.tela = t; return true; }
  async esperarPessoaParar() { this.log.push('esperou-a-pessoa'); }
}
const telaQueAperta = () => {
  const f = new FalsoQueAperta(Object.fromEntries([
    campo('#btn-novo-lancamento', { abre: true }), campo('[data-campo=lancamento-data]'), campo('[data-campo=lancamento-valor]', { modo: 'numero' }),
    campo('[data-campo=lancamento-debito-codigo]'), campo('[data-campo=lancamento-gravar]', { final: 'salvar' }), campo('#btn-serpro'), campo('#btn-lote'),
  ]));
  f.textos = { '#btn-novo-lancamento': 'Novo lançamento', '[data-campo=lancamento-gravar]': 'Gravar Lançamento', '#btn-serpro': 'Consultar no Serpro', '#btn-lote': 'Excluir todos os lançamentos' };
  return f;
};

test('a Agente FAZ: abre pelo menu, aperta o de abrir, preenche e só aperta Gravar depois do OK no cartão', async () => {
  const amb = telaQueAperta();
  const exec = new PilotoExecutor(PLANO, amb, { ritmo: 'rapido' });
  void exec.iniciar();
  for (let i = 0; i < 400 && exec.getEstado() !== 'aguardando_confirmacao'; i += 1) await ocioso(2);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(exec.instantaneo().pedeOk, true, 'cartão "Confira e dê o OK"');
  assert.equal(exec.instantaneo().rotuloBotao, 'Gravar Lançamento');
  assert.ok(amb.log.includes('menu:lancamentos'), 'foi clicando no menu');
  assert.deepEqual(amb.apertados, ['#btn-novo-lancamento'], 'Gravar só depois do OK');
  assert.equal(await exec.confirmarPeloCartao(), true);
  assert.deepEqual(amb.apertados, ['#btn-novo-lancamento', '[data-campo=lancamento-gravar]']);
  assert.equal((await exec.terminou).estado, 'concluido');
});

test('Serpro fica para a pessoa; apagar em lote nunca é apertado; cancelar no cartão não grava', async () => {
  const amb = telaQueAperta();
  const exec = new PilotoExecutor({ titulo: 'x', passos: [
    { tipo: 'destacar', alvo: '#btn-lote', legenda: 'apagar' },
    { tipo: 'destacar', alvo: '#btn-serpro', legenda: 'consultar' },
    { tipo: 'parar_no_botao', alvo: '[data-campo=lancamento-gravar]', legenda: 'Gravar' },
  ] }, amb);
  void exec.iniciar();
  for (let i = 0; i < 200 && exec.getEstado() !== 'aguardando_confirmacao'; i += 1) await ocioso(2);
  assert.equal(exec.instantaneo().pedeOk, false, 'consulta paga: só a pessoa aperta');
  assert.deepEqual(amb.apertados, []);
  assert.ok(exec.instantaneo().avisos.some((a) => /lote/.test(a)));
  assert.equal(await exec.confirmarPeloCartao(), false, 'o cartão não aperta consulta paga');
  amb.cliqueReal?.(); // a PESSOA apertou a consulta
  for (let i = 0; i < 200 && !exec.instantaneo().pedeOk; i += 1) await ocioso(2);
  assert.equal(exec.instantaneo().pedeOk, true);
  exec.cancelar();
  assert.equal((await exec.terminou).estado, 'cancelado');
  assert.ok(!amb.apertados.includes('[data-campo=lancamento-gravar]'));
});

// ---------------------------------------------------------------------------------------------
test('máquina de estados: interferência→pausado, continuar→rodando, segundo plano→bg, cancelar→cancelado', () => {
  const t = transicaoPiloto;
  assert.equal(t('rodando', 'interferencia'), 'pausado');
  assert.equal(t('rodando', 'rota_fora_do_plano'), 'pausado');
  assert.equal(t('pausado', 'continuar'), 'rodando');
  assert.equal(t('pausado', 'segundo_plano'), 'segundo_plano');
  assert.equal(t('rodando', 'segundo_plano'), 'segundo_plano');
  assert.equal(t('pausado', 'cancelar'), 'cancelado');
  assert.equal(t('rodando', 'cancelar'), 'cancelado');
  assert.equal(t('segundo_plano', 'cancelar'), 'cancelado');
  assert.equal(t('segundo_plano', 'interferencia'), 'segundo_plano', 'em segundo plano o contador pode usar outra tela');
  assert.equal(t('segundo_plano', 'rota_fora_do_plano'), 'segundo_plano');
  assert.equal(t('segundo_plano', 'precisa_tela'), 'pausado');
  assert.equal(t('segundo_plano', 'parou_no_botao'), 'aguardando_confirmacao');
  assert.equal(t('segundo_plano', 'terminou'), 'concluido');
  assert.equal(t('rodando', 'parou_no_botao'), 'aguardando_confirmacao');
  assert.equal(t('aguardando_confirmacao', 'confirmado'), 'concluido');
  assert.equal(t('pausado', 'interferencia'), 'pausado');
  assert.equal(t('pausado', 'terminou'), 'pausado', 'pausado não conclui sozinho');
  // estados finais não mudam
  const todos: EventoPiloto[] = ['interferencia', 'rota_fora_do_plano', 'continuar', 'segundo_plano', 'cancelar', 'parou_no_botao', 'terminou', 'falhou', 'confirmado', 'precisa_tela'];
  for (const f of ESTADOS_FINAIS) for (const e of todos) assert.equal(transicaoPiloto(f as EstadoPiloto, e), f);
});

const PLANO_BG: PlanoPiloto = {
  titulo: 'Fazer em segundo plano',
  passos: [
    { tipo: 'destacar', alvo: '[data-campo=lancamento-data]', legenda: 'Aqui' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-data]', valor: '05/11/2026', legenda: 'Data' },
    { tipo: 'parar_no_botao', alvo: '[data-campo=lancamento-gravar]', legenda: 'Gravar Lançamento' },
  ],
};

test('segundo plano executa DE VERDADE: sem animação, volta à tela, preenche, aperta o de abrir e o que grava pede o OK', async () => {
  const amb = telaQueAperta();
  const falas: string[] = [];
  const exec = new PilotoExecutor(PLANO, amb, { aoFalar: (t) => falas.push(t) });
  void exec.iniciar();
  exec.interferir('toque'); // pausa antes de qualquer passo tocar a tela
  await ocioso();
  assert.equal(exec.getEstado(), 'pausado');
  amb.tela = 'balancete'; // a pessoa foi usar outra tela
  const esperasAntes = amb.esperas.filter((ms) => ms === MS_POR_CARACTERE.normal).length;
  exec.segundoPlano();
  for (let i = 0; i < 400 && exec.getEstado() !== 'aguardando_confirmacao'; i += 1) await ocioso(2);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(exec.instantaneo().pedeOk, true, 'o que grava pede o OK também em segundo plano');
  assert.ok(amb.log.includes('esperou-a-pessoa'), 'esperou a pessoa parar de digitar antes de trocar de tela');
  assert.ok(amb.log.includes('menu:lancamentos'));
  assert.equal(amb.valores['[data-campo=lancamento-debito-codigo]'], '1.1.01');
  assert.equal(amb.esperas.filter((ms) => ms === MS_POR_CARACTERE.normal).length, esperasAntes, 'sem digitação animada');
  assert.deepEqual(amb.apertados, ['#btn-novo-lancamento (sem animação)']);
  assert.ok(falas.includes(MSG_SEGUNDO_PLANO));
  await exec.confirmarPeloCartao();
  const r = await exec.terminou;
  assert.equal(r.estado, 'concluido'); assert.equal(r.usouSegundoPlano, true);
  assert.ok(falas.some((f) => /Pronto, terminei/.test(f)), 'avisa quando termina');
  assert.match(MSG_SO_TELA, /só dá para fazer na tela/);
});

test('segundo plano: passos com caminho de API rodam pelo servidor; se o servidor recusa, faz pela tela e avisa', async () => {
  const amb = telaLancamento(); amb.apiResultado = { ok: true };
  const plano: PlanoPiloto = { titulo: 'Preparar', passos: [
    { tipo: 'rolar', alvo: '[data-campo=lancamento-data]', legenda: 'Visual' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-data]', valor: '05/11/2026', legenda: 'Data', via: 'api', api: { ferramenta: 'preparar_lancamento', args: { n: 1 } } },
  ] };
  const exec = new PilotoExecutor(plano, amb);
  void exec.iniciar(); exec.interferir('toque'); await ocioso();
  exec.segundoPlano();
  assert.equal((await exec.terminou).estado, 'concluido');
  assert.deepEqual(amb.log.filter((l) => l.startsWith('api:')), ['api:preparar_lancamento']);
  assert.equal(amb.valores['[data-campo=lancamento-data]'], undefined, 'o servidor fez: a tela não foi tocada');
  const amb2 = telaLancamento(); amb2.apiResultado = { ok: false, motivo: 'servidor recusou' };
  const e2 = new PilotoExecutor({ titulo: 'x', passos: [plano.passos[1]] }, amb2);
  void e2.iniciar(); e2.interferir('toque'); await ocioso(); e2.segundoPlano();
  assert.equal((await e2.terminou).estado, 'concluido');
  assert.equal(amb2.valores['[data-campo=lancamento-data]'], '05/11/2026');
  assert.ok(e2.instantaneo().avisos.some((a) => /servidor recusou/.test(a)));
});

test('segundo plano: interferência é ignorada e o cancelar funciona', async () => {
  const e2 = new PilotoExecutor(PLANO_BG, telaLancamento());
  void e2.iniciar(); e2.interferir('toque'); await ocioso(); e2.segundoPlano();
  e2.interferir('toque'); e2.interferir('teclado');
  assert.notEqual(e2.getEstado(), 'cancelado');
  assert.equal(e2.resultado().interferencias, 1, 'toques durante o segundo plano não contam como interferência');
  e2.cancelar();
  assert.equal((await e2.terminou).estado, 'cancelado');
});

test('contador interferiu e disse "em segundo plano" por voz: o piloto ativo recebe o comando', async () => {
  const exec = new PilotoExecutor(PLANO_BG, telaLancamento());
  registrarPilotoAtivo(exec);
  void exec.iniciar(); exec.interferir('toque'); await ocioso();
  assert.equal(exec.getEstado(), 'pausado');
  assert.deepEqual(aplicarIntencaoAoPiloto('segundo_plano'), { tratado: true, falado: true });
  assert.equal(exec.getEstado() === 'segundo_plano' || exec.getEstado() === 'pausado' || exec.getEstado() === 'aguardando_confirmacao', true);
  exec.cancelar(); registrarPilotoAtivo(null);
  assert.equal(aplicarIntencaoAoPiloto('continuar').tratado, false, 'sem piloto ativo a frase segue para a IA');
});

// ---------------------------------------------------------------------------------------------
test('frases de ativação em português (voz e chat)', () => {
  const casos: Array<[string, string | null]> = [
    ['continua', 'continuar'], ['Pode continuar', 'continuar'], ['segue', 'continuar'], ['pode continuar de onde parou', 'continuar'], ['Contábil, pode continuar', 'continuar'], ['sim, continua por favor', 'continuar'],
    ['pode continuar em segundo plano', 'segundo_plano'], ['faz por trás enquanto eu uso outra tela', 'segundo_plano'], ['termina em segundo plano', 'segundo_plano'], ['continua por trás', 'segundo_plano'],
    ['cancela', 'cancelar'], ['para', 'cancelar'], ['pode cancelar', 'cancelar'], ['chega', 'cancelar'],
    ['pode confirmar', 'confirmar'], ['confirma', 'confirmar'],
    ['qual é o saldo do caixa', null], ['continua o balancete da empresa X e me diga o total', null], ['não faça em segundo plano', null], ['', null],
  ];
  for (const [t, esperado] of casos) assert.equal(intencaoDoTexto(t), esperado, t);
});

// ---------------------------------------------------------------------------------------------
test('contrato: validarPlanoPiloto aceita o plano certo e recusa alvo perigoso, passo depois do botão e valor ausente', () => {
  assert.equal(validarPlanoPiloto(PLANO).ok, true);
  const ruim = (p: any) => validarPlanoPiloto({ titulo: 't', passos: [p] });
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=x] , body', valor: '1', legenda: 'l' }).ok, false, 'seletor arbitrário');
  assert.equal(ruim({ tipo: 'preencher', alvo: 'div > input', valor: '1', legenda: 'l' }).ok, false);
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=senha-certificado]', valor: '1', legenda: 'l' }).ok, false, 'campo de senha/certificado');
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=token-acesso]', valor: '1', legenda: 'l' }).ok, false);
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=dados-bancarios]', valor: '1', legenda: 'l' }).ok, false);
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=x]', legenda: 'l' }).ok, false, 'sem valor');
  assert.equal(ruim({ tipo: 'preencher', alvo: '[data-campo=x]', valor: '1' }).ok, false, 'sem legenda');
  assert.equal(ruim({ tipo: 'clicar', alvo: '[data-campo=x]', legenda: 'l' }).ok, false, 'tipo fora do contrato');
  assert.equal(ruim({ tipo: 'navegar', alvo: 'texto:Salvar', legenda: 'l' }).ok, false);
  assert.equal(validarPlanoPiloto({ titulo: 't', passos: [{ tipo: 'parar_no_botao', alvo: '#a', legenda: 'l' }, { tipo: 'destacar', alvo: '#b', legenda: 'l' }] }).ok, false);
  assert.equal(validarPlanoPiloto({ titulo: 't', passos: Array.from({ length: 41 }, () => ({ tipo: 'destacar', alvo: '#a', legenda: 'l' })) }).ok, false);
  assert.equal(validarPlanoPiloto({ titulo: '', passos: [] }).ok, false);
  assert.equal(validarPlanoPiloto(null).ok, false);
  assert.equal(validarPlanoPiloto({ titulo: 't', passos: [{ tipo: 'preencher', alvo: '[data-campo=x]', valor: '1', legenda: 'l', via: 'api', api: { ferramenta: 'Ruim Nome' } }] }).ok, false);
  assert.deepEqual(analisarAlvo('#btn-menu-balancete'), { tipo: 'menu', tela: 'balancete' });
  assert.deepEqual(analisarAlvo('[data-campo="lancamento-valor"]'), { tipo: 'campo', campo: 'lancamento-valor' });
  assert.deepEqual(analisarAlvo('texto:Livro Diário'), { tipo: 'texto', texto: 'Livro Diário' });
  assert.equal(analisarAlvo('javascript:alert(1)'), null);
});
