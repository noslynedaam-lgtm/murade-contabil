import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AULAS, GLOSSARIO, TRILHAS, DOMINIOS_OFICIAIS, buscarAula, buscarGlossario, corrigirQuestionario } from '../../src/data/escolaConteudo';
import { PRATICAS, avaliarAcaoGuiada, corrigirProva, nivelDaNota, nivelGeral, passosDaPratica, valoresIguais, numeroBR, type AcaoAluno, type PraticaSim, type CenarioSim } from '../../src/data/escolaPratica';
import { exemploEscola, IDS_EXEMPLOS, resultadoDoCenario, simularPratica } from '../../src/server/escolaExemplos';
import { alunosParados, conferirConteudoEscola, consultarLiberacaoEscola, limparCacheLiberacao, ondeMaisErra, MSG_NAO_LIBERADA, type ProgressoAluno } from '../../src/server/escola';
import { ehGestorEscola, liberacaoDaSessao, registrarRotasEscola } from '../../src/server/escolaRotas';
import { pilotoDoMeMostra, pilotoAbrirAula } from '../../src/utils/escolaMeMostra';
import { TELAS_CONTABIL } from '../../src/data/mapaTelasContabil';
import { conferirMapaPiloto } from '../../src/server/conferidorPiloto';
import { quotaDoMes } from '../../src/utils/imobilizado';
import { prazoEntregaECD } from '../../src/services/ecdService';
import { FERRAMENTAS_ESCOLA } from '../../src/server/agenteEscola';
import { kitContabil } from '../../src/server/agenteContabil';

const RAIZ = process.cwd();
const ler = (c: string) => { try { return fs.readFileSync(path.join(RAIZ, c), 'utf8'); } catch { return null; } };

// ---------------------------------------------------------------- conteúdo
test('Escola (Contábil): as 9 trilhas pedidas existem, cada uma com aulas', () => {
  assert.deepEqual(TRILHAS.map((t) => t.titulo), ['Primeiros passos no Murade Contábil', 'Plano de contas e partidas dobradas', 'Lançamentos', 'Conciliação bancária', 'Fechamento do mês', 'Balancete, DRE e Balanço', 'Livro Caixa do Simples', 'ECD e ECF', 'Encerramento do exercício']);
  for (const t of TRILHAS) assert.ok(AULAS.some((a) => a.trilha === t.id), `trilha sem aula: ${t.id}`);
  assert.ok(AULAS.length >= 18, `${AULAS.length} aulas`);
});

test('Escola (Contábil): o Robô Conferidor não acha problema no conteúdo (fonte oficial, data, perguntas, exemplo, me-mostra, prática)', () => {
  assert.deepEqual(conferirConteudoEscola(IDS_EXEMPLOS, '2026-11-20'), []);
});

test('Escola (Contábil): toda regra tem fonte oficial; "sistema" sozinho só nos primeiros passos; 3 a 5 perguntas', () => {
  for (const a of AULAS) {
    assert.ok(a.fontes.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.conferidoEm), a.id);
    for (const f of a.fontes) if (f.tipo !== 'sistema') assert.ok(DOMINIOS_OFICIAIS.includes(new URL(f.url).hostname), `${a.id}: ${f.url}`);
    if (a.trilha !== 'primeiros-passos') {
      assert.ok(a.fontes.some((f) => f.tipo !== 'sistema'), `${a.id} sem fonte oficial`);
      assert.ok(a.regras.some((r) => /(art\.|Lei|LC nº|Decreto|IN RFB|ITG|Código Civil|CFC)/.test(r)), `${a.id}: regra sem norma`);
    }
    assert.ok(a.regras.length > 0 && a.perguntas.length >= 3 && a.perguntas.length <= 5, a.id);
    for (const p of a.perguntas) assert.ok(p.certa >= 0 && p.certa < p.opcoes.length && p.explicacao.length > 5, `${a.id}: ${p.pergunta}`);
  }
  for (const g of GLOSSARIO) if (g.fonte.tipo !== 'sistema') assert.ok(DOMINIOS_OFICIAIS.includes(new URL(g.fonte.url).hostname), g.termo);
});

test('Escola (Contábil): nenhum número de exemplo escrito à mão (sem R$ nas aulas)', () => {
  for (const a of AULAS) assert.doesNotMatch(`${a.oQueE} ${a.porQue} ${a.regras.join(' ')}`, /R\$\s?\d/, a.id);
});

test('Escola (Contábil): o robô acusa fonte que não é oficial, conteúdo velho e "Me mostra" para tela inexistente', () => {
  const a = AULAS.find((x) => x.trilha === 'conciliacao')!;
  const original = a.fontes; const data = a.conferidoEm; const mm = a.meMostra;
  try {
    (a as any).fontes = [{ nome: 'blog', url: 'https://blog.exemplo.com/conciliacao', tipo: 'lei' }];
    assert.ok(conferirConteudoEscola(IDS_EXEMPLOS).some((x) => /fora dos sites oficiais/.test(x.problema)));
    (a as any).fontes = original; (a as any).conferidoEm = '2024-01-01';
    assert.ok(conferirConteudoEscola(IDS_EXEMPLOS, '2026-11-20').some((x) => /reconferir/.test(x.problema)));
    (a as any).conferidoEm = data; (a as any).meMostra = { tela: 'nao-existe', legenda: 'x' };
    assert.ok(conferirConteudoEscola(IDS_EXEMPLOS, '2026-11-20').some((x) => /não existe no mapa/.test(x.problema)));
  } finally { (a as any).fontes = original; (a as any).conferidoEm = data; (a as any).meMostra = mm; }
});

test('Escola (Contábil): questionário corrige e devolve a explicação de quem errou', () => {
  const a = AULAS.find((x) => x.id === 'dre')!;
  const certas = a.perguntas.map((p) => p.certa);
  assert.equal(corrigirQuestionario(a, certas).nota, 10);
  const r = corrigirQuestionario(a, certas.map((c, i) => (i === 1 ? (c + 1) % a.perguntas[1].opcoes.length : c)));
  assert.equal(r.erradas.length, 1); assert.match(r.erradas[0].explicacao, /art\. 187/);
});

// ---------------------------------------------------------------- exemplos pelo motor real
test('Escola (Contábil): todo exemplo das aulas é calculado pelo motor do sistema (nenhum falha)', () => {
  for (const id of IDS_EXEMPLOS) { const e = exemploEscola(id)!; assert.ok(e.linhas.length > 0 && e.motor, id); }
  for (const a of AULAS) if (a.exemplo) assert.ok(IDS_EXEMPLOS.includes(a.exemplo), a.id);
});

test('Escola (Contábil): exemplos batem com o motor (balancete fecha, depreciação, conciliação, ECD)', () => {
  const bal = exemploEscola('balancete-mes')!;
  assert.equal(bal.linhas.at(-1)!.valor, bal.linhas.at(-2)!.valor, 'saldos devedores = credores');
  const b = { id: 'x', descricao: 'x', custoCentavos: 1_200_000, residualCentavos: 0, vidaUtilMeses: 120, inicioDepreciacao: '2026-01', depreciavel: true };
  assert.equal(exemploEscola('depreciacao')!.linhas[0].valor, `R$ ${(quotaDoMes(b, '2026-10') / 100).toFixed(2).replace('.', ',')}`);
  assert.ok(exemploEscola('conciliacao')!.linhas.some((l) => /TARIFA/.test(l.rotulo) && /falta lançar/.test(l.valor)));
  assert.equal(exemploEscola('ecd-obrigatoriedade')!.linhas.at(-1)!.valor, prazoEntregaECD(2026).split('-').reverse().join('/'));
  assert.ok(exemploEscola('fechamento')!.linhas.some((l) => l.rotulo === 'Pode fechar o mês?' && l.valor === 'Ainda não'));
});

test('Escola (Contábil): simulador — todo cenário (demonstração, guiada e provas) calcula no motor real', () => {
  for (const p of PRATICAS) for (const c of [p.demo, p.guiada, ...p.provas]) assert.ok(resultadoDoCenario(p.id, c.valores), `${p.id}/${c.id}`);
  for (const p of PRATICAS) assert.ok(TELAS_CONTABIL.some((t) => t.id === p.telaReal), p.telaReal);
  assert.throws(() => simularPratica('lancamento', { data: '05/10/2026', valor: '100', debito: '1.1.01', credito: '3.1.01.01.02', historico: 'x' }), /analítica/);
  assert.throws(() => simularPratica('lancamento', { data: '05/10/2026', valor: '100', debito: '1.1.01.01.01', credito: '1.1.01.01.01', historico: 'x' }), /mesma conta/);
  assert.equal((simularPratica('lancamento', { data: '05/10/2026', valor: '1.500,00', debito: '11010101', credito: '3.1.01.01.02', historico: 'Venda' }) as any).partidasFecham, 'Sim');
});

// ---------------------------------------------------------------- me mostra
test('Escola (Contábil): "Me mostra no sistema" vira roteiro válido do Piloto que só abre e destaca', () => {
  for (const a of AULAS) {
    const p = pilotoDoMeMostra(a.meMostra, a.titulo);
    assert.ok(p, a.id);
    assert.equal(p!.passos[0].tipo, 'navegar', a.id);
    assert.ok(p!.passos.every((x) => x.tipo === 'navegar' || x.tipo === 'destacar'), a.id);
  }
  assert.deepEqual(pilotoAbrirAula('dre', 'DRE', 'Aqui.')!.passos.map((x) => x.alvo), ['#escola-aula-dre']);
});

test('Escola (Contábil): aba no menu, no tipo TabId, no App e no mapa do piloto (o robô do piloto não acha problema da Escola)', () => {
  assert.doesNotMatch(ler('src/components/Sidebar.tsx')!, /id: "escola" as TabId/, 'a Escola não fica no menu (só por link #escola)');
  assert.match(ler('src/App.tsx')!, /#&\]\)escola/, 'o link #escola abre a Escola');
  assert.match(ler('src/types.ts')!, /\| "escola"/);
  assert.match(ler('src/App.tsx')!, /tabAtiva === "escola" && <TelaEscolaMurade/);
  const r = conferirMapaPiloto(ler);
  assert.deepEqual(r.problemas.filter((p) => /escola/i.test(`${p.chave} ${p.detalhe}`)), []);
  const tela = ler('src/components/escola/TelaEscolaMurade.tsx')!;
  assert.match(tela, /id=\{`escola-aula-\$\{a\.id\}`\}/, 'a tela tem o id que o piloto destaca');
});

// ---------------------------------------------------------------- glossário
test('Escola (Contábil): glossário — "me explica X" acha o termo certo', () => {
  assert.equal(buscarGlossario('me explica o que é partidas dobradas')[0].termo, 'Partidas dobradas');
  assert.equal(buscarGlossario('o que significa DRE')[0].termo, 'DRE');
  assert.equal(buscarGlossario('ecd')[0].termo, 'ECD');
  assert.equal(buscarGlossario('conciliacao bancaria')[0].termo, 'Conciliação bancária');
  assert.equal(buscarGlossario('xyzw').length, 0);
  assert.equal(buscarAula('quero estudar conciliação')?.id, 'conciliacao');
  assert.equal(buscarAula('depreciação')?.id, 'depreciacao');
});

// ---------------------------------------------------------------- fase 2
const lanc = PRATICAS.find((p) => p.id === 'lancamento')!;
test('Escola (Contábil): prática guiada — campo errado avisa e aponta o certo; valor errado diz o certo', () => {
  const r = avaliarAcaoGuiada(lanc, lanc.guiada, 0, { tipo: 'foco', alvo: 'debito' });
  assert.equal(r.certo, false); assert.equal(r.alvoCerto, 'data');
  assert.match(r.mensagem, /^Não, aí está errado\. Confere direito: o certo agora é o campo "Data do lançamento"/);
  const errado = avaliarAcaoGuiada(lanc, lanc.guiada, 2, { tipo: 'preencher', alvo: 'debito', valor: '1.1.01.02.01' });
  assert.equal(errado.certo, false); assert.match(errado.mensagem, /o certo é 4\.3\.03\.01\.01/);
  assert.equal(avaliarAcaoGuiada(lanc, lanc.guiada, 2, { tipo: 'preencher', alvo: 'debito', valor: '4.3.03.01.01' }).avancar, true);
  assert.equal(avaliarAcaoGuiada(lanc, lanc.guiada, 1, { tipo: 'preencher', alvo: 'valor', valor: '2.000,00' }).avancar, true);
  assert.equal(avaliarAcaoGuiada(lanc, lanc.guiada, 4, { tipo: 'preencher', alvo: 'historico', valor: 'pagamento do  ALUGUEL' }).avancar, true);
  const cedo = avaliarAcaoGuiada(lanc, lanc.guiada, 3, { tipo: 'clicar', alvo: 'gravar' });
  assert.equal(cedo.certo, false); assert.match(cedo.mensagem, /falta preencher o campo "Conta a crédito/);
  assert.equal(avaliarAcaoGuiada(lanc, lanc.guiada, passosDaPratica(lanc).length - 1, { tipo: 'clicar', alvo: 'gravar' }).avancar, true);
});

// ---------------------------------------------------------------- fase 3
function provaPerfeita(p: PraticaSim, c: CenarioSim): { acoes: AcaoAluno[]; valores: Record<string, string> } {
  const acoes: AcaoAluno[] = [];
  for (const campo of p.campos) { acoes.push({ tipo: 'foco', alvo: campo.id }); acoes.push({ tipo: 'preencher', alvo: campo.id, valor: c.valores[campo.id] }); }
  acoes.push({ tipo: 'clicar', alvo: p.botao.id });
  return { acoes, valores: { ...c.valores } };
}
const corrigirComMotor = (p: PraticaSim, c: CenarioSim, acoes: AcaoAluno[], valores: Record<string, string>) => {
  let obtido: Record<string, unknown> | null = null; try { obtido = simularPratica(p.id, valores); } catch { obtido = null; }
  return corrigirProva(p, c, acoes, valores, { esperado: resultadoDoCenario(p.id, c.valores), obtido });
};
test('Escola (Contábil): prova perfeita em toda prática (motor real) vale 10 e nível Autônomo', () => {
  for (const p of PRATICAS) for (const c of p.provas) {
    const { acoes, valores } = provaPerfeita(p, c);
    const r = corrigirComMotor(p, c, acoes, valores);
    assert.equal(r.nota, 10, `${p.id}/${c.id}: ${r.erros.join('|')}`); assert.equal(r.nivel, 'Autônomo'); assert.equal(r.resultadoConfere, true);
  }
});
test('Escola (Contábil): prova — conta trocada tira ponto, aparece no fim e o resultado do motor não confere; ordem e clique contam', () => {
  const c = lanc.provas[0];
  const { acoes, valores } = provaPerfeita(lanc, c);
  const trocado = { ...valores, debito: valores.credito, credito: valores.debito };
  const r = corrigirComMotor(lanc, c, acoes, trocado);
  assert.ok(r.nota < 10); assert.equal(r.resultadoConfere, false);
  assert.ok(r.erros.some((e) => /Conta a débito/.test(e) && /1\.1\.01\.02\.01/.test(e)));
  const r2 = corrigirComMotor(lanc, c, acoes.filter((a) => a.tipo !== 'clicar'), valores);
  assert.equal(r2.calculou, false); assert.ok(r2.erros.some((e) => /Faltou clicar/.test(e)));
  const r3 = corrigirComMotor(lanc, c, [...acoes.slice(2, 4), ...acoes.slice(0, 2), ...acoes.slice(4)], valores);
  assert.equal(r3.ordemCerta, false);
  assert.equal(corrigirComMotor(lanc, c, [], {}).nota, 0);
});
test('Escola (Contábil): nível pela nota e pelo histórico', () => {
  assert.deepEqual([4.9, 5, 8, 9.5].map(nivelDaNota), ['Iniciante', 'Em formação', 'Pronto para fazer com conferência', 'Autônomo']);
  assert.equal(nivelGeral([{ pratica: 'lancamento', nota: 10, em: '1' }, { pratica: 'depreciacao', nota: 10, em: '1' }, { pratica: 'resultado', nota: 9.6, em: '1' }]), 'Autônomo');
  assert.equal(nivelGeral([{ pratica: 'lancamento', nota: 10, em: '1' }]), 'Pronto para fazer com conferência');
  assert.ok(valoresIguais(lanc.campos[2], '1.1.01.01.01', '11010101')); assert.ok(Number.isNaN(numeroBR('')));
});

// ---------------------------------------------------------------- liberação (adicional pago)
const CNPJ = '11222333000181';
test('Escola (Contábil): liberação — sem variável, sem CNPJ, fora do ar ou "não" = não liberado; "sim" fica 10 minutos em cache', async () => {
  limparCacheLiberacao();
  let chamadas = 0;
  const fetchSim = async (url: string, init: any) => { chamadas += 1; assert.match(url, /\/api\/consultor\/liberado\?escritorio=11222333000181&produto=escola$/); assert.equal(init.headers['x-murade-consultor-token'], 'tok'); return { ok: true, status: 200, json: async () => ({ liberado: true }) }; };
  assert.equal((await consultarLiberacaoEscola(CNPJ, { env: {}, fetch: fetchSim })).liberado, false);
  assert.equal((await consultarLiberacaoEscola(null, { env: { MURADE_CONSULTOR_TOKEN: 'tok' }, fetch: fetchSim })).liberado, false);
  let agora = 1_000_000;
  const deps = { env: { MURADE_CONSULTOR_TOKEN: 'tok' }, fetch: fetchSim, agora: () => agora };
  assert.equal((await consultarLiberacaoEscola(CNPJ, deps)).liberado, true);
  assert.equal((await consultarLiberacaoEscola(CNPJ, deps)).liberado, true);
  assert.equal(chamadas, 1, 'segunda consulta veio do cache');
  agora += 10 * 60_000 + 1; await consultarLiberacaoEscola(CNPJ, deps); assert.equal(chamadas, 2);
  limparCacheLiberacao();
  assert.deepEqual(await consultarLiberacaoEscola(CNPJ, { env: { MURADE_CONSULTOR_TOKEN: 'tok' }, fetch: async () => { throw new Error('fora do ar'); } }), { liberado: false, motivo: MSG_NAO_LIBERADA });
  limparCacheLiberacao();
  assert.equal((await consultarLiberacaoEscola(CNPJ, { env: { MURADE_CONSULTOR_TOKEN: 'tok' }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ liberado: 'sim' }) }) })).liberado, false);
});
test('Escola (Contábil): liberação — dono do sistema e o escritório dele usam sempre; gestor é só o administrador', async () => {
  limparCacheLiberacao();
  const nunca = { env: {}, fetch: async () => { throw new Error('não deveria consultar'); } };
  const d = (dono: boolean, cnpj: string | null) => ({ liberacao: nunca, escritorioDoDono: async () => dono, cnpjDoEscritorio: async () => cnpj });
  assert.equal((await liberacaoDaSessao({ userId: 'a', login: 'dono', donoSistema: true }, d(false, null))).liberado, true);
  assert.equal((await liberacaoDaSessao({ userId: 'b', login: 'equipe', tenantId: 'a' }, d(true, null))).liberado, true);
  assert.equal((await liberacaoDaSessao({ userId: 'c', login: 'cliente', tenantId: 'c', administrador: true }, d(false, CNPJ))).liberado, false);
  assert.equal(ehGestorEscola({ userId: 'c', login: 'x', administrador: true }), true);
  assert.equal(ehGestorEscola({ userId: 'd', login: 'y', tenantId: 'c' }), false);
});

// ---------------------------------------------------------------- rotas
function appFalso() {
  const rotas = new Map<string, Function[]>();
  const reg = (m: string) => (caminho: string, ...h: Function[]) => { rotas.set(`${m} ${caminho}`, h); };
  return { app: { get: reg('GET'), post: reg('POST') } as any, rotas };
}
async function chamar(rotas: Map<string, Function[]>, chave: string, req: any) {
  const res: any = { codigo: 200, corpo: null, setHeader() {}, status(c: number) { this.codigo = c; return this; }, json(b: unknown) { this.corpo = b; return this; } };
  const h = rotas.get(chave)!; await h[h.length - 1](req, res); return res;
}
test('Escola (Contábil): rotas — não liberado vê só a apresentação; nada toca o banco; liberado corrige a prova no servidor e avisa o gestor', async () => {
  limparCacheLiberacao();
  const a1 = appFalso(); const sql1: string[] = [];
  registrarRotasEscola({ app: a1.app, exigirSessao: (_q, _s, n) => n(), sessao: () => ({ userId: 'u1', login: 'ana', tenantId: 't1', administrador: true }),
    consultar: async (s) => { sql1.push(s); return { rows: [] }; }, bancoConfigurado: () => true, liberacao: { env: {}, fetch: async () => ({ ok: true, status: 200, json: async () => ({ liberado: true }) }) },
    cnpjDoEscritorio: async () => CNPJ, escritorioDoDono: async () => false });
  assert.equal((await chamar(a1.rotas, 'GET /api/escola/estado', {})).corpo.motivo, MSG_NAO_LIBERADA);
  for (const ch of ['GET /api/escola/conteudo', 'POST /api/escola/simular', 'POST /api/escola/prova', 'GET /api/escola/gestor']) assert.equal((await chamar(a1.rotas, ch, { body: {} })).codigo, 402, ch);
  assert.equal(sql1.length, 0);

  limparCacheLiberacao();
  const a2 = appFalso(); const sql2: Array<{ s: string; p: unknown[] }> = [];
  registrarRotasEscola({ app: a2.app, exigirSessao: (_q, _s, n) => n(), sessao: () => ({ userId: 'u2', login: 'bia', tenantId: 't1' }),
    consultar: async (s, p = []) => { sql2.push({ s, p }); return { rows: [], rowCount: 1 }; }, bancoConfigurado: () => true,
    liberacao: { env: { MURADE_CONSULTOR_TOKEN: 'tok' }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ liberado: true }) }) },
    cnpjDoEscritorio: async () => CNPJ, escritorioDoDono: async () => false });
  const antes = sql2.length;
  const sim = await chamar(a2.rotas, 'POST /api/escola/simular', { body: { praticaId: 'lancamento', valores: lanc.demo.valores } });
  assert.equal(sim.corpo.treino, true); assert.ok(sql2.slice(antes).every((x) => !/INSERT|UPDATE|DELETE/.test(x.s)));
  assert.equal((await chamar(a2.rotas, 'GET /api/escola/gestor', {})).codigo, 403);
  const c = lanc.provas[1]; const { acoes, valores } = provaPerfeita(lanc, c);
  const pv = await chamar(a2.rotas, 'POST /api/escola/prova', { body: { praticaId: 'lancamento', cenarioId: c.id, acoes, valores, duracaoMs: 60000, nota: 0 } });
  assert.equal(pv.corpo.resultado.nota, 10);
  assert.ok(sql2.some((x) => /INSERT INTO contabil_escola_provas/.test(x.s)));
  const aviso = sql2.find((x) => /INSERT INTO contabil_escola_avisos/.test(x.s));
  assert.ok(aviso && aviso.p[1] === 't1' && /bia terminou a prova/.test(String(aviso.p[3])));
});

test('Escola (Contábil): só grava nas tabelas contabil_escola_* (nunca em lançamento, plano, livro, ECD ou ECF)', () => {
  for (const arq of ['src/server/escola.ts', 'src/server/escolaRotas.ts', 'src/server/escolaExemplos.ts']) {
    const src = ler(arq)!;
    for (const m of src.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+([a-z_]+)/g)) assert.ok(m[2].startsWith('contabil_escola_'), `${arq}: ${m[0]}`);
    assert.doesNotMatch(src, /salvarWorkspace|alterarWorkspace|fecharCompetencia|contabilizar|transmitir/i);
  }
});

// ---------------------------------------------------------------- robô
const aluno = (o: Partial<ProgressoAluno>): ProgressoAluno => ({ userId: 'u', login: 'ana', aulas: [], provas: [], atribuicoes: [], nivel: 'Iniciante', ultimaAtividade: null, ...o });
test('Escola (Contábil): robô — aluno parado há 7 dias avisa o gestor; quem estuda ou terminou, não', () => {
  const agora = Date.parse('2026-11-20T12:00:00Z');
  const at = (dias: number) => [{ trilhaId: 'conciliacao', atribuidoEm: new Date(agora - dias * 86400000).toISOString(), atribuidoPor: 'gestor' }];
  assert.equal(alunosParados([aluno({ atribuicoes: at(8) })], agora).length, 1);
  assert.equal(alunosParados([aluno({ atribuicoes: at(3) })], agora).length, 0);
  const todas = AULAS.filter((a) => a.trilha === 'conciliacao').map((a) => ({ aulaId: a.id, quizNota: 10, tentativas: 1, concluida: true, atualizadoEm: '2026-10-01T00:00:00Z' }));
  assert.equal(alunosParados([aluno({ atribuicoes: at(30), aulas: todas })], agora).length, 0);
  assert.ok(ondeMaisErra(aluno({ aulas: [{ aulaId: 'dre', quizNota: 3.3, tentativas: 1, concluida: false, atualizadoEm: '' }] }))[0].includes('DRE'));
});

test('Escola (Contábil): server.ts registra robô, "Rodar agora" e rotas; a apresentação e o jeito padrão falam da Escola', () => {
  const src = ler('server.ts')!;
  assert.match(src, /registrarRobo\(\{ id: "conferidor_escola", nome: "Robô Conferidor da Escola Murade"/);
  assert.match(src, /registrarRotinaManual\("conferidor_escola"/);
  assert.match(src, /registrarRotasEscola\(/);
  assert.match(ler('src/data/apresentacaoSistema.ts')!, /id: 'conferidor_escola', nome: 'Robô Conferidor da Escola Murade', intervaloMs: 6 \* 60 \* 60_000/);
  assert.doesNotMatch(ler('src/data/jeitoPadraoContabil.ts')!, /id: 'escola', rotulo: '🎓 Escola Murade'/, 'a Escola não é item do menu (só por link)');
});

// ---------------------------------------------------------------- Agente
test('Escola (Contábil): Agente — ferramentas no kit, "me explica X" usa o glossário e "abre a aula" monta o roteiro', async () => {
  const nomes = kitContabil.ferramentas.map((f) => f.declaracao.name);
  for (const n of ['abrir_aula_escola', 'explicar_termo', 'progresso_aluno_escola', 'atribuir_trilha_escola']) assert.ok(nomes.includes(n), n);
  assert.equal(new Set(nomes).size, nomes.length, 'nenhum nome de ferramenta repetido');
  const ctx = (liberado: boolean, gestor = false) => ({ chamarApi: async () => ({ status: 200, corpo: { liberado, gestor, motivo: MSG_NAO_LIBERADA } }) }) as any;
  const explicar = FERRAMENTAS_ESCOLA.find((f) => f.declaracao.name === 'explicar_termo')! as any;
  const r = await explicar.executar(ctx(true), { termo: 'DRE' });
  assert.equal(r.termo, 'DRE'); assert.match(r.fonte, /6\.404/);
  assert.equal((await explicar.executar(ctx(false), { termo: 'DRE' })).mensagem, MSG_NAO_LIBERADA);
  const abrir = FERRAMENTAS_ESCOLA.find((f) => f.declaracao.name === 'abrir_aula_escola')! as any;
  const a = await abrir.executar(ctx(true), { assunto: 'conciliação bancária' });
  assert.match(a.piloto.passos[0].alvo, /^#escola-aula-/);
  const atribuir = FERRAMENTAS_ESCOLA.find((f) => f.declaracao.name === 'atribuir_trilha_escola')! as any;
  assert.equal(atribuir.tipo, 'acao');
  assert.match((await atribuir.preparar(ctx(true, false), { aluno: 'x', trilha: 'lancamentos' })).erro, /administrador/);
});
