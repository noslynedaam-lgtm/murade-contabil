// Ponto de OK do contador e CNPJ do escritório preenchido pelos outros sistemas Murade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { levantarFechamentoMensal, pontoDeOk } from '../../src/server/servicoCompleto';
import { avaliarRoteiro, registrarRotasServicoCompleto, type StoreServicoCompleto } from '../../src/server/servicoCompletoStore';
import { FRASE_ESPERANDO_OK, LEMBRETE_SEGUINTE_MS, PRIMEIRO_LEMBRETE_MS, horaDeLembrar, pedidoDeContinuar } from '../../src/utils/servicoCompletoCliente';
import { identificarRoteiro } from '../../src/server/servicoCompleto';
import { descobrirCnpjDoEscritorio, preencherCnpjsDosEscritorios, type StoreEscritorio } from '../../src/server/escritorioConsultor';

test('ponto de OK: passo que só o contador faz para o serviço em "aguardando_ok" com o resumo; sem passo do contador, só conferir', () => {
  assert.equal(pontoDeOk([{ id: 'a', titulo: 'Lançamentos padrão', situacao: 'preparado', detalhe: '' }]), null);
  assert.match(pontoDeOk([{ id: 'x', titulo: 'Aprovar e fechar a competência', situacao: 'contador', detalhe: '' }, { id: 'y', titulo: 'Confirmações suas', situacao: 'contador', detalhe: '' }])!, /Aprovar e fechar a competência; Confirmações suas.*Conferi, pode seguir/);
});

test('lembretes do OK: ~2 minutos com a tela aberta e depois a cada 15 minutos', () => {
  assert.equal(horaDeLembrar(PRIMEIRO_LEMBRETE_MS - 10_000, 0), false);
  assert.equal(horaDeLembrar(PRIMEIRO_LEMBRETE_MS, 0), true);
  assert.equal(horaDeLembrar(PRIMEIRO_LEMBRETE_MS + 60_000, 1), false);
  assert.equal(horaDeLembrar(PRIMEIRO_LEMBRETE_MS + LEMBRETE_SEGUINTE_MS, 1), true);
  assert.equal(FRASE_ESPERANDO_OK, 'Estou esperando você conferir e dar o OK para eu continuar.');
  const p = pedidoDeContinuar({ roteiro: 'fechamento_mensal', cnpj: '11222333000181', referencia: '2026-10' }, true);
  assert.match(p, /^Conferi e dei o OK, pode seguir\. Continue o serviço completo: fecha o mês da empresa de CNPJ 11222333000181, competência 2026-10\.$/);
  assert.equal(identificarRoteiro(p), 'fechamento_mensal', 'a Agente entende o "continuar"');
});

test('depois do OK continua de onde parou: sem nada pendente no mês, a Agente registra sozinha o Livro Caixa', () => {
  const contas = [{ codigo: '1.1.01', descricao: 'Caixa', tipo: 'analitica', natureza: 'D', saldoInicial: 0, saldoInicialCompetencia: '2026-01' }, { codigo: '3.1.01', descricao: 'Receita', tipo: 'analitica', natureza: 'C' }];
  const dados = { empresa: { regime: 'Simples Nacional', contasDisponibilidadesCodigo: ['1.1.01'] }, contas, lancamentos: [], preLancamentos: [], bensImobilizado: [] };
  const l = levantarFechamentoMensal({ cnpj: '11222333000181', nome: 'A', competencia: '2026-10', dados, fechadas: new Set(), extrato: { resumo: [], pendentesPorConta: {} } });
  assert.equal(l.etapas.find((e) => e.id === 'livro-caixa')!.situacao, 'a_preparar');
  assert.deepEqual(l.preparo.find((p) => p.tipo === 'livro_caixa'), { tipo: 'livro_caixa', etapa: 'livro-caixa', competencia: '2026-10', descricao: 'Registrar o Livro Caixa de 10/2026 (nada pendente no mês).' });
  // com rascunho pendente no mês, não registra (espera o OK)
  const l2 = levantarFechamentoMensal({ cnpj: '11222333000181', nome: 'A', competencia: '2026-10', dados: { ...dados, preLancamentos: [{ status: 'pendente_conferencia', competencia: '2026-10', origem: 'Fiscal — NFe Saída', valor: 10 }] }, fechadas: new Set(), extrato: { resumo: [], pendentesPorConta: {} } });
  assert.ok(!l2.preparo.some((p) => p.tipo === 'livro_caixa'));
});

test('robô: esperando o OK há dias vira lembrete; OK dado sem continuar vira parado', () => {
  const agora = new Date('2026-11-20T12:00:00Z');
  const base = { roteiro: 'ecd_ano' as const, referencia: '2025', titulo: 'ECD' };
  assert.equal(avaliarRoteiro({ ...base, estado: 'aguardando_ok', atualizadoEm: '2026-11-10T00:00:00Z' }, false, agora).acao, 'lembrar');
  assert.equal(avaliarRoteiro({ ...base, estado: 'aguardando_ok', atualizadoEm: '2026-11-20T11:00:00Z' }, false, agora).acao, 'nada');
  assert.equal(avaliarRoteiro({ ...base, estado: 'ok_dado', atualizadoEm: '2026-11-20T11:00:00Z' }, false, agora).acao, 'parado');
});

test('rota do OK: só o próprio escritório, só quem pode escrever, e só quando está esperando o OK', async () => {
  const rotas = new Map<string, Function>();
  const app: any = { get: (p: string, ...h: Function[]) => rotas.set(`GET ${p}`, h[h.length - 1]), post: (p: string, ...h: Function[]) => rotas.set(`POST ${p}`, h[h.length - 1]) };
  const oks: any[] = [];
  const store = { darOk: async (c: any, login: string) => { oks.push({ ...c, login }); return c.referencia === '2026-10' ? 1 : 0; } } as unknown as StoreServicoCompleto;
  const sessoes: Record<string, any> = { a: { userId: 'u1', login: 'ana', cnpjs: ['11222333000181'], tenantId: 'A', podeEscrever: () => true }, leitura: { userId: 'u2', login: 'leo', cnpjs: ['11222333000181'], tenantId: 'A', podeEscrever: () => false } };
  registrarRotasServicoCompleto(app, { exigirSessao: ((_q: any, _s: any, n: any) => n()) as any, exigirOrigem: ((_q: any, _s: any, n: any) => n()) as any }, { store, sessao: (req: any) => sessoes[req.quem], normalizarCnpj: (v) => String(v ?? '').replace(/\D/g, '') });
  const chamar = async (req: any) => { let status = 200; const res: any = { setHeader: () => undefined, status: (x: number) => { status = x; return res; }, json: () => undefined }; await rotas.get('POST /api/servico-completo/ok')!({ query: {}, ...req }, res); return status; };
  const corpo = { cnpj: '11222333000181', roteiro: 'fechamento_mensal', referencia: '2026-10' };
  assert.equal(await chamar({ quem: 'a', body: corpo }), 200);
  assert.deepEqual(oks[0], { tenantId: 'A', cnpj: '11222333000181', roteiro: 'fechamento_mensal', referencia: '2026-10', login: 'ana' });
  assert.equal(await chamar({ quem: 'a', body: { ...corpo, referencia: '2026-09' } }), 409, 'não estava esperando o OK');
  assert.equal(await chamar({ quem: 'leitura', body: corpo }), 403);
  assert.equal(await chamar({ quem: 'a', body: { ...corpo, cnpj: '44555666000172' } }), 403, 'empresa de outro escritório');
});

// ------------------------------------------------------------------ CNPJ do escritório pelos outros sistemas
function banco(op: { dono?: string | null; dp?: Array<{ cnpj: string | null }> | 'sem_tabela'; fi?: Array<{ cnpj: string | null }> | 'sem_tabela' }) {
  const sqls: string[] = [];
  const consultar = async (sql: string, params: unknown[] = []) => {
    sqls.push(sql);
    if (/FROM contabil_auth_users WHERE id::text=\$1/.test(sql)) return { rows: op.dono ? [{ login: op.dono }] : [] };
    if (/FROM dp_auth_users/.test(sql)) { if (op.dp === 'sem_tabela') throw new Error('relation does not exist'); assert.equal(params[0], String(op.dono).toLowerCase()); return { rows: op.dp || [] }; }
    if (/FROM fiscoia.users/.test(sql)) { if (op.fi === 'sem_tabela' || op.fi === undefined) throw new Error('permission denied'); return { rows: op.fi }; }
    return { rows: [] };
  };
  return { consultar, sqls };
}

test('CNPJ do escritório: vem do DP ou do Fisco IA quando o dono é o mesmo (mesmo login); conflito ou sem ligação = só manual', async () => {
  assert.deepEqual((await descobrirCnpjDoEscritorio(banco({ dono: 'Dono@Escritorio.com', dp: [{ cnpj: '11.444.777/0001-61' }] }).consultar, 't1')).cnpj, '11444777000161');
  const fi = await descobrirCnpjDoEscritorio(banco({ dono: 'dono@x.com', dp: 'sem_tabela', fi: [{ cnpj: '11444777000161' }] }).consultar, 't1');
  assert.equal(fi.cnpj, '11444777000161'); assert.equal(fi.origem, 'fiscoia');
  assert.equal((await descobrirCnpjDoEscritorio(banco({ dono: 'dono@x.com', dp: [{ cnpj: '11444777000161' }], fi: [{ cnpj: '15267243000168' }] }).consultar, 't1')).cnpj, null, 'DP e Fisco IA discordam');
  assert.equal((await descobrirCnpjDoEscritorio(banco({ dono: 'dono@x.com', dp: [{ cnpj: '11444777000161' }, { cnpj: '15267243000168' }] }).consultar, 't1')).cnpj, null, 'mais de um escritório com esse login no DP');
  assert.equal((await descobrirCnpjDoEscritorio(banco({ dono: 'dono@x.com', dp: [{ cnpj: '11444777000162' }] }).consultar, 't1')).cnpj, null, 'CNPJ com dígito errado');
  assert.equal((await descobrirCnpjDoEscritorio(banco({ dono: null }).consultar, 't1')).cnpj, null, 'sem dono do escritório no Contábil');
  assert.equal((await descobrirCnpjDoEscritorio(banco({ dono: 'dono@x.com', dp: 'sem_tabela', fi: 'sem_tabela' }).consultar, 't1')).cnpj, null, 'outro banco: sem ligação, sem erro');
});

test('robô preenche só o CNPJ vazio, como origem automática, e nunca sobrescreve o manual', async () => {
  const gravados: any[] = [];
  const store = { gravar: async (t: string, c: string, o: string) => { gravados.push([t, c, o]); } } as unknown as StoreEscritorio;
  const consultar = async (sql: string) => {
    if (/NOT EXISTS \(SELECT 1 FROM contabil_escritorio_cnpj/.test(sql)) return { rows: [{ tenant: 't1' }, { tenant: 't2' }] };
    if (/FROM contabil_auth_users WHERE id::text=\$1/.test(sql)) return { rows: [{ login: 'dono@x.com' }] };
    if (/FROM dp_auth_users/.test(sql)) return { rows: [{ cnpj: '11444777000161' }] };
    throw new Error('sem tabela');
  };
  const r = await preencherCnpjsDosEscritorios(consultar, store);
  assert.deepEqual(r, { semCnpj: 2, preenchidos: 2 });
  assert.deepEqual(gravados[0], ['t1', '11444777000161', 'dp']);
});
