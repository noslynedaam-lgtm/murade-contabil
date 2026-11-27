// Agente ágil no Contábil: levar até a tela sem IA ("me leva", "onde fica" + "Quer que eu te leve?", "sim"), plano que só mostra
// (nunca aperta), cobertura de TODO o mapa de telas, honestidade ("tem X?"), regra de permissão no motor e prompt menor com o kit
// real do Contábil. Nenhum teste chama a API real do Gemini.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SECOES_CONTABIL, TELAS_CONTABIL } from '../../src/data/mapaTelasContabil';
import { APELIDOS_TELAS_CONTABIL, planoParaLevarContabil, respostaLevarContabil } from '../../src/server/pilotoContabil';
import { MARCA_SO_MOSTRAR, PilotoExecutor, type AmbientePiloto, type ModoCampo, type PassoPiloto } from '../../src/utils/pilotoVisivel';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ContextoAgente, type Ferramenta, type ModeloIA, type RespostaModelo } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { NOME_MAIS_FERRAMENTAS, OFERTA_LEVAR } from '../../src/data/agenteAgil';

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
class FalsoQueAperta extends Falso {
  apertados: string[] = [];
  textos: Record<string, string> = {};
  descrever(e: any) { return e.alvo in this.textos ? { texto: this.textos[e.alvo] } : null; }
  async clicarAnimado(e: any, animar: boolean) { this.apertados.push(`${e.alvo}${animar ? '' : ' (sem animação)'}`); return true; }
  async clicarMenu(t: string) { this.log.push(`menu:${t}`); this.tela = t; return true; }
  async esperarPessoaParar() { this.log.push('esperou-a-pessoa'); }
}
const ocioso = async (n = 40) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

test('"me leva até o balancete" leva na hora; "onde fica a DRE?" oferece; "sim" leva sem IA; seção mais exata vence a tela', () => {
  const ir = respostaLevarContabil('me leva até o balancete');
  assert.ok(ir && ir.levarAgora && ir.piloto.passos[0].alvo === '#btn-menu-balancete');
  const onde = respostaLevarContabil('onde fica a DRE?');
  assert.ok(onde && !onde.levarAgora && onde.resposta.endsWith(OFERTA_LEVAR) && onde.piloto.passos[0].alvo === '#btn-menu-demonstracoes');
  const sim = respostaLevarContabil('sim', [{ papel: 'usuario', texto: 'onde fica a DRE?' }, { papel: 'ia', texto: onde!.resposta }]);
  assert.ok(sim && sim.levarAgora && sim.piloto.passos[0].alvo === '#btn-menu-demonstracoes');
  const diario = respostaLevarContabil('onde fica o livro diário?');
  assert.ok(diario && diario.piloto.passos[1]?.alvo === 'texto:Livro Diário' && diario.piloto.passos[1].valor === MARCA_SO_MOSTRAR);
  assert.equal(respostaLevarContabil('quanto deu o lucro de outubro?'), null);
  assert.equal(respostaLevarContabil('sim', [{ papel: 'ia', texto: 'Feito.' }]), null);
  // "Como excluo uma empresa?" só leva (oferece), não prepara exclusão.
  const excluir = respostaLevarContabil('como excluo uma empresa?');
  assert.ok(excluir && !excluir.levarAgora && excluir.piloto.passos[0].alvo === '#btn-menu-empresa');
  // Funções desta semana: extrato e conciliação na Gestão contábil; prévia da folha em Revisar dados recebidos; DVA nas Demonstrações.
  assert.equal(respostaLevarContabil('onde vejo o extrato?')?.piloto.passos[0].alvo, '#btn-menu-gestao-contabil');
  assert.equal(respostaLevarContabil('onde vejo a prévia da folha?')?.piloto.passos[0].alvo, '#btn-menu-revisao-origens');
  assert.equal(respostaLevarContabil('me leva até a DVA')?.piloto.passos[0].alvo, '#btn-menu-demonstracoes');
});

test('TODO o mapa do Contábil tem destino navegável: toda tela e toda seção viram plano válido que abre pelo menu real', () => {
  const fontes = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8') + fs.readdirSync(path.join(process.cwd(), 'src/components')).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(process.cwd(), 'src/components', f), 'utf8')).join('\n');
  const falhas: string[] = [];
  for (const t of TELAS_CONTABIL) {
    if (!APELIDOS_TELAS_CONTABIL[t.id]) falhas.push(`${t.id}: sem jeitos de falar`);
    const p = planoParaLevarContabil({ tela: t });
    if (!p || p.passos[0].tipo !== 'navegar' || p.passos[0].alvo !== `#btn-menu-${t.id}`) falhas.push(`${t.id}: sem navegar`);
  }
  for (const s of SECOES_CONTABIL) {
    const t = TELAS_CONTABIL.find((x) => x.id === s.tela)!;
    const p = planoParaLevarContabil({ tela: t, secao: s });
    if (!p || p.passos.some((x) => x.tipo === 'destacar' && x.valor !== MARCA_SO_MOSTRAR)) falhas.push(`seção ${s.chave}`);
  }
  assert.ok(/btn-menu-\$\{|btn-menu-/.test(fontes), 'o menu usa ids btn-menu-<tela>');
  assert.deepEqual(falhas, []);
  assert.deepEqual(Object.keys(APELIDOS_TELAS_CONTABIL).filter((id) => !TELAS_CONTABIL.some((t) => t.id === id)), [], 'apelido de tela que não existe');
});

test('plano "me leva lá": destaca e NUNCA aperta, mesmo que o alvo seja um botão de gravar/excluir', async () => {
  const amb = new FalsoQueAperta({ '#btn-menu-empresa': { alvo: '#btn-menu-empresa', abre: true }, 'texto:Excluir empresa': { alvo: 'texto:Excluir empresa', final: 'irreversivel' } });
  amb.textos = { 'texto:Excluir empresa': 'Excluir empresa' };
  const exec = new PilotoExecutor({ titulo: 't', passos: [
    { tipo: 'navegar', alvo: '#btn-menu-empresa', legenda: 'Abrindo.' },
    { tipo: 'destacar', alvo: 'texto:Excluir empresa', valor: MARCA_SO_MOSTRAR, legenda: 'Aqui, ó.' },
  ] }, amb, { ritmo: 'rapido' });
  void exec.iniciar();
  for (let i = 0; i < 400 && exec.getEstado() !== 'concluido'; i += 1) await ocioso(2);
  assert.equal(exec.getEstado(), 'concluido');
  assert.deepEqual(amb.apertados, []);
  assert.equal(amb.cliquesFinais, 0);
});

test('honestidade no Contábil: "tem X?" só diz "Tem sim" quando a tela/seção existe; função inexistente nunca recebe "tem sim"', () => {
  assert.match(respostaLevarContabil('o sistema tem DVA?')!.resposta, /^Tem sim: fica em Demonstrações e relatórios/);
  for (const f of ['tem controle de estoque?', 'o sistema faz emissão de nota fiscal?', 'tem folha de pagamento?']) {
    const r = respostaLevarContabil(f);
    assert.ok(!r || !/^Tem sim/.test(r.resposta), `${f} => ${r?.resposta}`);
  }
});

const CNPJ = '11222333000181';
function ctxTeste(executadas: string[]): ContextoAgente {
  const acao = (name: string, exclusao: boolean): Ferramenta => ({
    tipo: 'acao', ...(exclusao ? { exclusao: true } : {}), declaracao: { name, description: `Ação ${name}.`, parameters: { type: 'OBJECT', properties: {} } },
    async preparar() { return { params: {}, titulo: name, descricao: ['x'], cnpj: CNPJ, resumo: name }; },
    async executar() { executadas.push(name); return { sucesso: true, mensagem: 'feito' }; },
  } as any);
  return { sessaoHash: 's1', login: 'ana', hoje: '2026-11-27', chamarApi: async () => ({ status: 200, corpo: {} }), registrar: () => undefined, pendentes: new ArmazemAcoesPendentes(), kit: { ferramentas: [acao('excluir_lancamento_teste', true), acao('fechar_mes_teste', false)], instrucao: 'Teste.' } } as ContextoAgente;
}
const chama = (nome: string): ModeloIA => { let i = 0; return async () => (i++ === 0 ? { texto: '', chamadas: [{ nome, args: {} }] } : { texto: 'Ok.', chamadas: [] }); };

test('permissão no motor do Contábil: "como excluo" não gera exclusão; "pode excluir" gera só o cartão; nada executa sem as duas etapas', async () => {
  const exec: string[] = [];
  assert.deepEqual((await conversar(ctxTeste(exec), chama('excluir_lancamento_teste'), 'como excluo um lançamento?')).acoes, []);
  assert.deepEqual((await conversar(ctxTeste(exec), chama('fechar_mes_teste'), 'como fecho o mês?')).acoes, []);
  const ctx = ctxTeste(exec);
  const r = await conversar(ctx, chama('excluir_lancamento_teste'), 'pode excluir o lançamento 123');
  assert.equal(r.acoes.length, 1);
  assert.equal(r.acoes[0].duasEtapas, true);
  assert.deepEqual(exec, []);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, false);
  assert.deepEqual(exec, []);
});

test('kit real do Contábil: pergunta simples vai com bem menos ferramentas e perfil simples; mais_ferramentas libera tudo', async () => {
  const vistos: Array<{ n: number; perfil?: string }> = [];
  const respostas: RespostaModelo[] = [{ texto: '', chamadas: [{ nome: NOME_MAIS_FERRAMENTAS, args: {} }] }, { texto: 'Nada pendente.', chamadas: [] }];
  let i = 0;
  const modelo: ModeloIA = async (e) => { vistos.push({ n: e.declaracoes.length, perfil: e.perfil }); return respostas[Math.min(i++, 1)]; };
  const ctx = { sessaoHash: 's', login: 'a', hoje: '2026-11-27', chamarApi: async () => ({ status: 200, corpo: {} }), registrar: () => undefined, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil } as ContextoAgente;
  await conversar(ctx, modelo, 'quais lançamentos estão pendentes de aprovação?');
  assert.ok(vistos[0].n < kitContabil.ferramentas.length / 2, `${vistos[0].n} de ${kitContabil.ferramentas.length}`);
  assert.equal(vistos[0].perfil, 'simples');
  assert.equal(vistos[1].n, kitContabil.ferramentas.length);
});

test('honestidade no Contábil: o que ainda não tem (ou tem em parte) responde a verdade, nunca "tem sim"', () => {
  assert.match(respostaLevarContabil('o sistema tem LCDPR?')!.resposta, /^Ainda não tem o LCDPR.*Já está na lista de melhorias\.$/);
  assert.match(respostaLevarContabil('tem carnê-leão?')!.resposta, /^Ainda não tem/);
  assert.match(respostaLevarContabil('tem reavaliação do patrimônio?')!.resposta, /^Tem em parte/);
  assert.match(respostaLevarContabil('tem balancete?')!.resposta, /^Tem sim: fica em Balancete/);
});

// ------------------------------------------------------------------ Fase 2: "Murad, confere a empresa"
import { CONFERIDORES_CADASTRO, conferirCadastro, resumoDaConferenciaCadastro } from '../../src/data/conferenciaCadastroBasico';
import { FERRAMENTAS_CONFERE } from '../../src/server/agenteConfere';

test('confere o cadastro: sem erro diz "Está tudo certo"; com erro aponta (sem chutar valor) e só lê', async () => {
  const boa = { cnpj: '11222333000181', razaoSocial: 'EMPRESA TESTE LTDA', cnae: '4120-4/00', cep: '74000-000', uf: 'GO' };
  assert.deepEqual(conferirCadastro(boa), []);
  assert.equal(resumoDaConferenciaCadastro('EMPRESA TESTE', []), 'Está tudo certo no cadastro da EMPRESA TESTE.');
  const ruim = conferirCadastro({ cnpj: '11222333000199', razaoSocial: '', cnae: '41', cep: '7400', uf: 'XX' });
  assert.deepEqual(ruim.map((a) => a.conferidor).sort(), ['cep_formato', 'cnae_formato', 'cnpj_digito', 'razao_social', 'uf_formato']);
  assert.ok(ruim.every((a) => a.correcao === 'orientacao'));
  assert.match(resumoDaConferenciaCadastro('X', ruim), /^Achei 5 erros no cadastro da X: o CNPJ não confere/);
  // Campo que o cadastro não tem não vira erro.
  assert.deepEqual(conferirCadastro({ cnpj: '11222333000181' }), []);
  assert.ok(CONFERIDORES_CADASTRO.every((c) => c.oQueConfere && c.campo));
  const chamadas: string[] = [];
  const ctx: any = { chamarApi: async (m: string, c: string) => { chamadas.push(`${m} ${c}`); return { status: 200, corpo: { empresas: [{ ...boa, cnpj: '11222333000199' }] } }; } };
  const r: any = await (FERRAMENTAS_CONFERE[0] as any).executar(ctx, { cnpj: '11222333000199' });
  assert.equal(r.tudoCerto, false);
  assert.deepEqual(chamadas, ['GET /api/workspaces']);
  assert.ok(FERRAMENTAS_CONFERE.every((f) => f.tipo === 'leitura'));
});
