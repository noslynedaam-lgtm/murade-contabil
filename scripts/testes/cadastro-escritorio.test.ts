import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirCadastrosDosEscritorios, etapaCertificado, lerCadastroDoEscritorio } from '../../src/server/cadastroEscritorioContabil';
import { montarApresentacao } from '../../src/data/apresentacaoSistema';
import { kitContabil } from '../../src/server/agenteContabil';

const AGORA = new Date('2026-11-20T12:00:00Z');
function banco(o: { aqui?: { cnpj: string; origem: string } | null; dp?: any[] | null; cert?: string | null }) {
  return async (sql: string) => {
    if (/FROM contabil_escritorio_cnpj/.test(sql)) return { rows: o.aqui ? [o.aqui] : [] };
    if (/SELECT login FROM contabil_auth_users/.test(sql)) return { rows: [{ login: 'Dono@X.com' }] };
    if (/FROM contabil_auth_users u WHERE/.test(sql)) return { rows: [{ tenant: 't1' }] };
    if (/FROM dp_auth_users/.test(sql)) { if (o.dp === null) throw new Error('relation "dp_auth_users" does not exist'); return { rows: o.dp ?? [] }; }
    if (/FROM dp_esocial_certificates/.test(sql)) return { rows: o.cert ? [{ certificate_valid_until: o.cert }] : [] };
    return { rows: [] };
  };
}
const COMPLETO = { cnpj_escritorio: '11222333000181', nome: 'Esc', responsavel: 'Fulano', email: 'a@b.com', telefone: '6233334444', whatsapp: '', endereco: 'Rua 1' };

test('certificado: etapas 30/15/7 e vencido', () => {
  assert.equal(etapaCertificado('2026-12-15T13:00:00Z', AGORA).etapa, 30);
  assert.equal(etapaCertificado('2026-11-24T13:00:00Z', AGORA).etapa, 7);
  assert.equal(etapaCertificado('2026-11-01T00:00:00Z', AGORA).etapa, 'vencido');
});

test('lê o cadastro feito no DP: completo, falta e CNPJ diferente do digitado aqui', async () => {
  const ok = await lerCadastroDoEscritorio(banco({ aqui: { cnpj: '11222333000181', origem: 'dp' }, dp: [COMPLETO], cert: '2027-06-01T00:00:00Z' }), 't1', AGORA);
  assert.equal(ok.ligadoAoDP, true); assert.equal(ok.dp?.completo, true); assert.deepEqual(ok.avisos, []);
  const falta = await lerCadastroDoEscritorio(banco({ dp: [{ ...COMPLETO, endereco: '', cnpj_escritorio: null }] }), 't1', AGORA);
  assert.deepEqual(falta.dp?.faltando, ['CNPJ do escritório', 'endereço', 'certificado digital A1 do escritório']);
  const div = await lerCadastroDoEscritorio(banco({ aqui: { cnpj: '99888777000166', origem: 'manual' }, dp: [COMPLETO], cert: '2026-12-01T13:00:00Z' }), 't1', AGORA);
  assert.ok(div.avisos.some((a) => /vence em 11 dias/.test(a)) && div.avisos.some((a) => /digitado à mão/.test(a)));
});

test('sem DP no banco ou sem a mesma conta: sem ligação, sem erro', async () => {
  assert.equal((await lerCadastroDoEscritorio(banco({ dp: null }), 't1', AGORA)).ligadoAoDP, false);
  assert.equal((await lerCadastroDoEscritorio(banco({ dp: [] }), 't1', AGORA)).ligadoAoDP, false);
});

test('robô conta incompletos, vencendo e divergentes', async () => {
  const r = await conferirCadastrosDosEscritorios(banco({ aqui: { cnpj: '99888777000166', origem: 'manual' }, dp: [COMPLETO], cert: '2026-12-01T13:00:00Z' }), AGORA);
  assert.deepEqual([r.ligados, r.incompletos, r.vencendo, r.vencidos, r.divergentes], [1, 0, 1, 0, 1]);
  assert.match(r.texto, /Cadastro do escritório/);
});

test('Agente tem a ferramenta e a apresentação termina com o lembrete das procurações', () => {
  assert.ok(kitContabil.ferramentas.some((f) => f.declaracao.name === 'situacao_cadastro_escritorio'));
  const b = montarApresentacao();
  const i = b.findIndex((x) => x.id === 'lembrete-procuracoes');
  assert.equal(i, b.length - 2); assert.equal(b[b.length - 1].id, 'fim');
  assert.match(b[i].falar, /e-CAC, eSocial e FGTS Digital/); assert.ok(b[i].falar.length <= 260);
});
