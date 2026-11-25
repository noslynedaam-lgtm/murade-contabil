// 25/11/2026 — "Ativar avisos neste aparelho" ficava em "Ativando…" para sempre no celular Samsung (nenhum passo tinha tempo máximo:
// os logs mostram só a busca da chave, sem falha nem gravação). Agora cada passo tem tempo máximo e, se passar, a faixa diz o
// motivo e o que fazer, e a falha vai para os logs "[Avisos no aparelho]". A faixa fica em 1 ou 2 linhas no celular.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createECDH } from 'node:crypto';
import { ativarAvisosNoAparelho, comTempo, TempoEsgotado, type AmbienteAvisos, type ApiAvisos } from '../../src/utils/ativarAvisosAparelho';

const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const chavePublica = ecdh.getPublicKey().toString('base64url');
const nunca = <T,>() => new Promise<T>(() => undefined);
const TEMPOS = { servidor: 30, permissao: 30, preparo: 30, assinatura: 30 };

function cenario(p: { amb?: Partial<AmbienteAvisos>; reg?: any; api?: Partial<ApiAvisos> } = {}) {
  const log: string[] = [];
  const reg = p.reg ?? { pushManager: { getSubscription: async () => null, subscribe: async () => ({ toJSON: () => ({ endpoint: 'x' }), unsubscribe: async () => true }) } };
  const amb: AmbienteAvisos = { temServiceWorker: true, temPush: true, temNotificacao: true, ios: false, android: true, samsung: true, instalado: true,
    permissaoAtual: () => 'default', pedirPermissao: async () => 'granted', registro: async () => reg, ...p.amb } as AmbienteAvisos;
  const api: ApiAvisos = { chave: async () => ({ ativo: true, chave: chavePublica }), assinar: async () => { log.push('assinar'); }, falha: (e, d) => { log.push(`falha:${e}:${d}`); }, ...p.api };
  return { amb, api, log };
}

test('comTempo: devolve o valor a tempo e desiste com TempoEsgotado quando a promessa nunca responde', async () => {
  assert.equal(await comTempo(Promise.resolve(7), 50, 'x'), 7);
  await assert.rejects(comTempo(nunca(), 20, 'permissão'), (e: any) => e instanceof TempoEsgotado && /permissão/.test(e.message));
});

test('ativar avisos: nenhum passo prende o botão — permissão, preparo, assinatura e servidor que nunca respondem viram motivo + registro no log', async () => {
  const casos: Array<[string, ReturnType<typeof cenario>, string]> = [
    ['chave', cenario({ api: { chave: () => nunca() } }), 'sem_sessao'],
    ['permissão', cenario({ amb: { pedirPermissao: () => nunca() } }), 'permissao_fechada'],
    ['preparo', cenario({ amb: { registro: () => nunca() } }), 'service_worker'],
    ['assinatura existente', cenario({ reg: { pushManager: { getSubscription: () => nunca(), subscribe: () => nunca() } } }), 'assinatura'],
    ['assinatura', cenario({ reg: { pushManager: { getSubscription: async () => null, subscribe: () => nunca() } } }), 'assinatura'],
    ['gravação', cenario({ api: { assinar: () => nunca() } }), 'gravacao'],
  ];
  for (const [nome, c, etapa] of casos) {
    const inicio = Date.now();
    const r = await ativarAvisosNoAparelho(c.amb, c.api, TEMPOS);
    assert.equal(r.ok, false, nome); assert.equal(r.etapa, etapa, nome);
    assert.ok((r.mensagem || '').length > 20, `${nome}: mensagem com o que fazer`);
    assert.ok(Date.now() - inicio < 1000, `${nome}: respondeu rápido`);
    assert.ok(c.log.some((l) => l.startsWith(`falha:${etapa}:`) && /tempo esgotado/.test(l)), `${nome}: falha registrada no log`);
  }
});

test('ativar avisos: a pergunta de permissão não respondeu, mas o celular já tinha permitido — segue e ativa', async () => {
  let pediu = false;
  const c = cenario({ amb: { pedirPermissao: () => { pediu = true; return nunca(); }, permissaoAtual: () => (pediu ? 'granted' : 'default') } });
  const r = await ativarAvisosNoAparelho(c.amb, c.api, TEMPOS);
  assert.equal(r.ok, true); assert.deepEqual(c.log, ['assinar']);
});

test('faixa do Início: último cinto de segurança no botão e no máximo 2 linhas no celular', () => {
  const arq = ['src/components/AtivarAvisosCelular.tsx', 'src/components/AtivarAvisosContabil.tsx'].find((f) => fs.existsSync(f))!;
  const f = fs.readFileSync(arq, 'utf8');
  assert.match(f, /comTempo\(ativarAvisosNoAparelho\(ambienteDoNavegador\(\), apiDoSistema\(BASE\)\), 150_000/);
  assert.match(f, /finally \{ setOcupado\(false\); \}/);
  assert.match(f, /basis-full truncate sm:basis-auto sm:flex-1/);
  assert.match(f, /whitespace-nowrap rounded bg-slate-900/);
  const u = fs.readFileSync('src/utils/ativarAvisosAparelho.ts', 'utf8');
  assert.match(u, /getRegistration\(win\.location\?\.href\)/);
});
