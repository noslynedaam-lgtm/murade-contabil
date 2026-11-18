import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_FINAIS, MS_POR_CARACTERE, MSG_INTERFERENCIA, MSG_SO_TELA, PilotoExecutor, aplicarIntencaoAoPiloto, analisarAlvo, intencaoDoTexto,
  registrarPilotoAtivo, transicaoPiloto, validarPlanoPiloto,
  type AmbientePiloto, type EstadoPiloto, type EventoPiloto, type ModoCampo, type PassoPiloto, type PlanoPiloto,
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

test('executa a sequência, digita um caractere por vez no ritmo e PARA no botão sem clicar', async () => {
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
  assert.ok(amb.esperas.includes(MS_POR_CARACTERE.normal) && MS_POR_CARACTERE.normal >= 40 && MS_POR_CARACTERE.normal <= 60);
  assert.equal(amb.cliquesFinais, 0, 'parar_no_botao nunca clica');
  assert.ok(!amb.log.some((l) => l === 'clicar:[data-campo=lancamento-gravar]'));
  assert.ok(amb.log.includes('destacar:[data-campo=lancamento-gravar]:final'));
  assert.match(falas[falas.length - 1], /Confira e clique você/);
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

test('elemento não encontrado vira erro com mensagem, nunca silêncio', async () => {
  const amb = new Falso({});
  const exec = new PilotoExecutor({ titulo: 'x', passos: [{ tipo: 'destacar', alvo: '[data-campo=nao-existe]', legenda: 'Aqui' }] }, amb);
  void exec.iniciar();
  const r = await exec.terminou;
  assert.equal(r.estado, 'erro');
  assert.match(exec.instantaneo().legenda, /Não encontrei/);
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

test('segundo plano: nunca navega nem toca a tela; etapa que só existe na tela pausa e avisa', async () => {
  const amb = telaLancamento();
  const falas: string[] = [];
  const exec = new PilotoExecutor(PLANO, amb, { aoFalar: (t) => falas.push(t) });
  void exec.iniciar();
  exec.interferir('toque'); // pausa antes de qualquer passo tocar a tela
  await ocioso();
  assert.equal(exec.getEstado(), 'pausado');
  const toquesAntes = amb.toques();
  exec.segundoPlano();
  await ocioso(100);
  assert.equal(amb.toques(), toquesAntes, 'em segundo plano nenhum resolver/navegar/rolar/destacar/digitar/clicar');
  assert.ok(!amb.log.slice(-5).some((l) => l.startsWith('navegar')));
  assert.equal(exec.getEstado(), 'pausado', 'etapa só de tela: pausa');
  assert.ok(falas.includes(MSG_SO_TELA));
  assert.equal(MSG_SO_TELA, 'Esta etapa só dá para fazer na tela; me chame quando quiser que eu continue aqui.');
  assert.equal(exec.resultado().usouSegundoPlano, true);
});

test('segundo plano: passos com caminho de API rodam sem tela; no botão final avisa "Falta só você confirmar" e "Ir ao botão" leva à tela', async () => {
  const amb = telaLancamento();
  amb.apiResultado = { ok: true };
  const falas: string[] = [];
  const plano: PlanoPiloto = { titulo: 'Preparar', passos: [
    { tipo: 'rolar', alvo: '[data-campo=lancamento-data]', legenda: 'Visual' },
    { tipo: 'preencher', alvo: '[data-campo=lancamento-data]', valor: '05/11/2026', legenda: 'Data', via: 'api', api: { ferramenta: 'preparar_lancamento', args: { n: 1 } } },
    { tipo: 'parar_no_botao', alvo: '[data-campo=lancamento-gravar]', legenda: 'Gravar Lançamento' },
  ] };
  const exec = new PilotoExecutor(plano, amb, { aoFalar: (t) => falas.push(t) });
  void exec.iniciar(); exec.interferir('toque');
  await ocioso();
  exec.segundoPlano();
  await ocioso(100);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.deepEqual(amb.log.filter((l) => l.startsWith('api:')), ['api:preparar_lancamento']);
  assert.equal(amb.toques() <= 0 || !amb.log.some((l) => l.startsWith('clicar')), true);
  assert.match(falas[falas.length - 1], /Falta só você confirmar: Gravar Lançamento/);
  assert.equal(exec.instantaneo().botaoForaDaTela, true);
  assert.equal(amb.cliquesFinais, 0, 'segundo plano nunca clica em salvar');
  assert.equal(exec.confirmarPorVoz(), 'levado_ao_botao');
  await ocioso(200);
  assert.equal(exec.getEstado(), 'aguardando_confirmacao');
  assert.equal(exec.instantaneo().botaoForaDaTela, false);
  assert.ok(amb.log.includes('destacar:[data-campo=lancamento-gravar]:final'));
  assert.equal(amb.cliquesFinais, 0);
});

test('segundo plano: interferência é ignorada e o cancelar funciona; erro da API vira aviso (pausa), nunca silêncio', async () => {
  const amb = telaLancamento(); amb.apiResultado = { ok: false, motivo: 'servidor recusou' };
  const exec = new PilotoExecutor({ titulo: 'x', passos: [{ tipo: 'preencher', alvo: '[data-campo=lancamento-data]', valor: '1', legenda: 'Data', via: 'api', api: { ferramenta: 'preparar_lancamento' } }] }, amb);
  void exec.iniciar(); exec.interferir('toque'); await ocioso();
  exec.segundoPlano(); await ocioso(60);
  assert.equal(exec.getEstado(), 'pausado');
  assert.equal(exec.resultado().ultimoErro, 'servidor recusou');
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
