// 24/11/2026 — correções pedidas pelo dono depois do teste (Contábil):
// (4) "Ativar avisos neste aparelho" ativa no PRÓPRIO Contábil (antes o botão abria a página do Murad Fiscal): service worker com
//     push, chaves VAPID, aparelhos por pessoa, envio do alerta urgente primeiro pelos aparelhos daqui e, para quem não recebeu aqui,
//     pelo Fiscal sem aviso em dobro; cada etapa com o motivo e o que fazer; ativou = "Avisos ativados neste aparelho";
// (5) aviso do backup em uma linha, dentro do conteúdo, com X.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import webpush from 'web-push';
import { ativarAvisosNoAparelho, chaveParaBytes, chaveValida, comoLiberar, type AmbienteAvisos, type ApiAvisos, type AssinaturaLike } from '../../src/utils/ativarAvisosAparelho';
import { linhaFalhaAvisoAparelho } from '../../src/server/falhaAvisoAparelho';
import { textoCurtoBackup } from '../../src/components/backupEscritorio/AvisosBackupEscritorio';
import { chavePublicaContabil, pushConfiguradoContabil } from '../../src/server/avisoAparelhoContabil';
import { resumoTexto } from '../../src/server/alertaUrgenteContabilRotas';

// ------------------------------------------------------------------ (4) ativar avisos no aparelho
const { publicKey } = webpush.generateVAPIDKeys();
function assinatura(chave?: Uint8Array, nome = 'sub'): AssinaturaLike & { cancelada: boolean } {
  const s = { cancelada: false, nome, options: chave ? { applicationServerKey: chave.buffer.slice(0) as ArrayBuffer } : undefined, toJSON: () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${nome}`, keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: async () => { s.cancelada = true; return true; } };
  return s as any;
}
function ambiente(p: Partial<AmbienteAvisos> & { existente?: AssinaturaLike | null; falharAssinar?: Error[] } = {}) {
  const chamadas: string[] = [];
  let atual: AssinaturaLike | null = p.existente ?? null;
  const falhas = [...(p.falharAssinar ?? [])];
  const reg = { pushManager: {
    getSubscription: async () => atual,
    subscribe: async (o: any) => { chamadas.push('subscribe'); const f = falhas.shift(); if (f) throw f; assert.ok(chaveValida(o.applicationServerKey)); atual = assinatura(o.applicationServerKey, 'nova'); return atual; },
  } };
  const amb: AmbienteAvisos = { temServiceWorker: true, temPush: true, temNotificacao: true, ios: false, android: true, samsung: false, instalado: false,
    permissaoAtual: () => 'default', pedirPermissao: async () => { chamadas.push('permissao'); return 'granted'; }, registro: async () => reg, ...p } as any;
  return { amb, chamadas, atual: () => atual };
}
function api(p: Partial<ApiAvisos> = {}) {
  const log: Array<[string, unknown]> = [];
  const a: ApiAvisos = { chave: async () => ({ ativo: true, chave: publicKey }), assinar: async (x) => { log.push(['assinar', x]); }, falha: async (e, d) => { log.push(['falha', `${e}|${d}`]); }, ...p };
  return { a, log };
}

test('ativar avisos: caminho feliz — permissão, aplicativo do navegador, assinatura com a chave do servidor e gravação no servidor', async () => {
  const { amb, chamadas } = ambiente(); const { a, log } = api();
  const r = await ativarAvisosNoAparelho(amb, a);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(chamadas, ['permissao', 'subscribe']);
  assert.equal(log[0][0], 'assinar'); assert.match(JSON.stringify(log[0][1]), /fcm\.googleapis\.com/);
  assert.equal(chaveValida(chaveParaBytes(publicKey)), true, 'chave VAPID real: 65 bytes começando por 4');
  assert.equal(chaveValida(chaveParaBytes('abc')), false);
});

test('ativar avisos: Samsung Internet com notificação bloqueada (o caso do Android de 24/11) — explica onde liberar e registra a etapa no servidor', async () => {
  const { amb, chamadas } = ambiente({ samsung: true, permissaoAtual: () => 'denied' }); const { a, log } = api();
  const r = await ativarAvisosNoAparelho(amb, a);
  assert.equal(r.ok, false); assert.equal(r.etapa, 'permissao_negada');
  assert.match(String(r.mensagem), /Samsung Internet: toque no cadeado/);
  assert.deepEqual(chamadas, [], 'bloqueado antes: nem pergunta de novo');
  assert.ok(log.some(([t, d]) => t === 'falha' && String(d).startsWith('permissao_negada|')));
  // Pergunta fechada sem resposta: pede para tocar de novo e escolher Permitir.
  const fechada = await ativarAvisosNoAparelho(ambiente({ pedirPermissao: async () => 'default' }).amb, api().a);
  assert.equal(fechada.etapa, 'permissao_fechada'); assert.match(String(fechada.mensagem), /escolha "Permitir"/);
  assert.match(comoLiberar({ ios: false, android: false, samsung: false }), /No computador/);
});

test('ativar avisos: iPhone sem instalar na Tela de Início, servidor sem chave, aplicativo do navegador que não fica pronto e servidor que não grava', async () => {
  const ios = await ativarAvisosNoAparelho(ambiente({ ios: true, android: false, temPush: false }).amb, api().a);
  assert.equal(ios.etapa, 'iphone_sem_instalar'); assert.match(String(ios.mensagem), /Adicionar à Tela de Início/);
  const semChave = await ativarAvisosNoAparelho(ambiente().amb, api({ chave: async () => ({ ativo: false, chave: '' }) }).a);
  assert.equal(semChave.etapa, 'servidor_sem_chave');
  const chaveErrada = await ativarAvisosNoAparelho(ambiente().amb, api({ chave: async () => ({ ativo: true, chave: 'AAAA' }) }).a);
  assert.equal(chaveErrada.etapa, 'chave_invalida');
  const semSw = await ativarAvisosNoAparelho(ambiente({ registro: async () => null }).amb, api().a);
  assert.equal(semSw.etapa, 'service_worker'); assert.match(String(semSw.mensagem), /Recarregue a página/);
  const naoGravou = await ativarAvisosNoAparelho(ambiente().amb, api({ assinar: async () => { throw new Error('HTTP 503'); } }).a);
  assert.equal(naoGravou.etapa, 'gravacao'); assert.equal(naoGravou.detalhe, 'Error: HTTP 503');
});

test('ativar avisos: assinatura antiga feita com outra chave é trocada; assinatura presa (InvalidStateError) é desfeita e refeita uma vez', async () => {
  const outra = chaveParaBytes(webpush.generateVAPIDKeys().publicKey)!;
  const velha = assinatura(outra, 'velha');
  const e1 = ambiente({ existente: velha });
  assert.equal((await ativarAvisosNoAparelho(e1.amb, api().a)).ok, true);
  assert.equal(velha.cancelada, true); assert.deepEqual(e1.chamadas, ['permissao', 'subscribe']);
  const presa = assinatura(undefined, 'presa');
  const erro = Object.assign(new Error('A subscription with a different applicationServerKey already exists'), { name: 'InvalidStateError' });
  const e2 = ambiente({ falharAssinar: [erro] });
  // getSubscription devolve a presa só depois da primeira tentativa falhar
  let primeira = true; const orig = (await e2.amb.registro())!.pushManager;
  const reg = { pushManager: { getSubscription: async () => { if (primeira) { primeira = false; return null; } return presa; }, subscribe: orig.subscribe } };
  const r2 = await ativarAvisosNoAparelho({ ...e2.amb, registro: async () => reg }, api().a);
  assert.equal(r2.ok, true); assert.equal(presa.cancelada, true); assert.deepEqual(e2.chamadas, ['permissao', 'subscribe', 'subscribe']);
  // Falha que não é de assinatura presa: explica e registra.
  const r3 = await ativarAvisosNoAparelho(ambiente({ falharAssinar: [Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' })] }).amb, api().a);
  assert.equal(r3.etapa, 'assinatura'); assert.match(String(r3.detalhe), /AbortError: Registration failed/);
});


test('Contábil: a faixa ativa no próprio Contábil (sem link para o Fiscal) e o service worker do Contábil mostra o aviso e abre o Contábil', () => {
  const f = fs.readFileSync('src/components/AtivarAvisosContabil.tsx', 'utf8');
  assert.doesNotMatch(f, /murade-fiscal|#ativar-avisos`|href=/, 'não manda mais para a página do Fiscal');
  assert.match(f, /const BASE = "\/api\/avisos-aparelho";/);
  assert.match(f, /ativarAvisosNoAparelho\(ambienteDoNavegador\(\), apiDoSistema\(BASE\)\)/);
  assert.match(f, /✓ Avisos ativados neste aparelho/); assert.match(f, /Agora não/); assert.doesNotMatch(f, /sticky|fixed/);
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  assert.match(sw, /self\.addEventListener\('push'/); assert.match(sw, /self\.addEventListener\('notificationclick'/);
  assert.match(sw, /requireInteraction: true/);
  const server = fs.readFileSync('server.ts', 'utf8');
  for (const r of ['app.get("/api/avisos-aparelho/chave", exigirSessaoContabil', 'app.post("/api/avisos-aparelho/assinar", exigirOrigemNavegador, exigirSessaoContabil', 'app.post("/api/avisos-aparelho/cancelar", exigirOrigemNavegador, exigirSessaoContabil', 'app.post("/api/avisos-aparelho/testar", exigirOrigemNavegador, exigirSessaoContabil', 'app.post("/api/avisos-aparelho/falha", exigirOrigemNavegador, exigirSessaoContabil'])
    assert.ok(server.includes(r), `falta ${r}`);
  assert.match(server, /enviar: \(\) => enviarUrgenteContabilEFiscal\(consultaBancoContabil, enviarUrgentePeloFiscal\(\)\)/);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['web-push'], 'web-push nas dependências');
  assert.equal(pushConfiguradoContabil({}), false); assert.equal(pushConfiguradoContabil({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' }), true);
  assert.equal(chavePublicaContabil({ VAPID_PUBLIC_KEY: ' k ' }), 'k');
  assert.match(resumoTexto({ itens: 0, avisosNovos: 0, entregues: 0, semAparelho: 0, silenciados: 0, jaEnviados: 0, falhasFiscal: 0, erros: [] }, { semEnvio: [], semAparelho: [], semChave: true }), /^ATENÇÃO: .*sem as chaves de aviso/);
  assert.equal(linhaFalhaAvisoAparelho({ etapa: 'permissao_negada' }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'), 'não ativou: etapa=permissao_negada navegador=Safari (iPhone)');
});

const BIN = '/usr/lib/postgresql/16/bin';
const temPg = existsSync(`${BIN}/initdb`) && spawnSync('id', ['postgres']).status === 0;
test('Contábil: alerta urgente vai aos aparelhos ativados aqui (só a equipe do escritório da empresa), o Fiscal não repete para quem já recebeu, e o aparelho que sumiu é apagado', { skip: !temPg && 'sem Postgres local' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pgct-')); chmodSync(dir, 0o777);
  const porta = String(59000 + Math.floor(Math.random() * 900));
  const comoPg = (cmd: string) => execFileSync('su', ['postgres', '-s', '/bin/sh', '-c', cmd], { stdio: 'pipe' });
  comoPg(`${BIN}/initdb -D ${dir}/data -A trust -U postgres >/dev/null && ${BIN}/pg_ctl -D ${dir}/data -o '-p ${porta} -k ${dir}' -l ${dir}/log -w start >/dev/null`);
  const { Pool } = await import('pg');
  const pool = new Pool({ host: dir, port: Number(porta), user: 'postgres', database: 'postgres' });
  try {
    const q: any = (sql: string, p: unknown[] = []) => pool.query(sql, p as any[]);
    await q(`CREATE TABLE contabil_auth_users (id uuid PRIMARY KEY, login text NOT NULL, disabled boolean NOT NULL DEFAULT false, global_admin boolean NOT NULL DEFAULT false, office_owner uuid)`);
    await q(`CREATE TABLE contabil_auth_company_access (user_id uuid NOT NULL, cnpj text NOT NULL, role text NOT NULL)`);
    const DONO = '00000000-0000-0000-0000-0000000000d0', NILVA = '00000000-0000-0000-0000-0000000000a1', LEITOR = '00000000-0000-0000-0000-0000000000b2', OUTRO = '00000000-0000-0000-0000-0000000000c3';
    await q(`INSERT INTO contabil_auth_users (id, login, global_admin, office_owner) VALUES ($1,'dona@esc1',true,NULL),($2,'nilva@esc1',false,$1),($3,'leitor@esc1',false,NULL),($4,'caio@esc2',true,NULL)`, [DONO, NILVA, LEITOR, OUTRO]);
    await q(`INSERT INTO contabil_auth_company_access (user_id, cnpj, role) VALUES ($1,'11222333000181','admin'),($2,'11222333000181','viewer'),($3,'99888777000166','admin')`, [DONO, LEITOR, OUTRO]);
    const M = await import('../../src/server/avisoAparelhoContabil');
    M.limparCacheAvisoAparelhoParaTeste();
    await assert.rejects(() => M.assinarAparelho(q, NILVA, { endpoint: 'http://inseguro', keys: { p256dh: 'p', auth: 'a' } }), /inválida/);
    await M.assinarAparelho(q, NILVA, { endpoint: 'https://fcm.googleapis.com/fcm/send/nilva', keys: { p256dh: 'p', auth: 'a' } });
    await M.assinarAparelho(q, OUTRO, { endpoint: 'https://fcm.googleapis.com/fcm/send/caio', keys: { p256dh: 'p', auth: 'a' } });
    await M.assinarAparelho(q, DONO, { endpoint: 'https://fcm.googleapis.com/fcm/send/dona-velho', keys: { p256dh: 'p', auth: 'a' } });
    assert.equal(await M.aparelhosDoUsuario(q, NILVA), 1);
    const dest = (await M.destinatariosDaEmpresa(q, '11222333000181')).map((d) => d.login).sort();
    assert.deepEqual(dest, ['dona@esc1', 'nilva@esc1'], 'equipe do escritório dono entra; leitor e outro escritório não');
    const enviados: string[] = [];
    const enviar = async (s: any, carga: string) => { if (s.endpoint.endsWith('dona-velho')) { throw Object.assign(new Error('Gone'), { statusCode: 410 }); } enviados.push(`${s.endpoint}|${JSON.parse(carga).titulo}`); };
    let pedidoAoFiscal: any = null;
    const viaFiscal = async (_cnpj: string, avisos: any[]) => { pedidoAoFiscal = avisos; return { destinatarios: 2, enviados: 1, semAparelho: 0, silenciados: 0, adiados: 0, falhas: 0 }; };
    const transporte = M.enviarUrgenteContabilEFiscal(q, viaFiscal as any, enviar);
    const r = await transporte('11222333000181', [{ chave: 'urgente|ecd:2025|dia', titulo: 'URGENTE — vence hoje: ECD — Empresa', corpo: 'x', tipo: 'CONTABIL_ECD', silenciadosPor: [] }]);
    assert.deepEqual(enviados, ['https://fcm.googleapis.com/fcm/send/nilva|URGENTE — vence hoje: ECD — Empresa'], 'só a Nilva tinha aparelho válido aqui; caio@esc2 (outro escritório) não recebe');
    assert.deepEqual(pedidoAoFiscal[0].entreguesNoContabil, ['nilva@esc1'], 'o Fiscal não repete para quem recebeu aqui');
    assert.equal(r.enviados, 2, '1 aqui + 1 pelo Fiscal');
    assert.equal(await M.aparelhosDoUsuario(q, DONO), 0, 'aparelho que sumiu (410) é apagado');
    // Quem desligou o tipo não recebe aqui; Fiscal fora do ar com alguém avisado aqui: conta como feito (não repete na próxima rodada).
    const r2 = await M.enviarUrgenteContabilEFiscal(q, (async () => { throw new Error('O Fiscal respondeu HTTP 503.'); }) as any, enviar)('11222333000181', [{ chave: 'urgente|ecd:2025|d1', titulo: 'T', corpo: 'x', tipo: 'CONTABIL_ECD', silenciadosPor: [] }]);
    assert.equal(r2.enviados, 1);
    await assert.rejects(() => M.enviarUrgenteContabilEFiscal(q, (async () => { throw new Error('O Fiscal respondeu HTTP 503.'); }) as any, enviar)('11222333000181', [{ chave: 'urgente|ecd:2025|d3', titulo: 'T', corpo: 'x', tipo: 'CONTABIL_ECD', silenciadosPor: ['NILVA@esc1'] }]), /503/, 'ninguém recebeu e o Fiscal falhou: tenta de novo');
  } finally {
    await pool.end().catch(() => undefined);
    try { comoPg(`${BIN}/pg_ctl -D ${dir}/data -m immediate stop >/dev/null`); } catch { /* */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ (5) aviso do backup
test('aviso do backup: uma linha curta, dentro do conteúdo (sem fixed), com X para fechar', () => {
  assert.equal(textoCurtoBackup(19, 'Seu último backup foi há 19 dia(s) (05/11/2026 10:00). Faça um agora na tela Backup.'), 'Último backup há 19 dias.');
  assert.equal(textoCurtoBackup(1), 'Último backup há 1 dia.');
  assert.equal(textoCurtoBackup(0), 'Último backup hoje.');
  assert.equal(textoCurtoBackup(null, 'Este escritório ainda não tem nenhum backup. Faça um agora na tela Backup.'), 'Ainda não há nenhum backup do escritório.');
  const c = fs.readFileSync('src/components/backupEscritorio/AvisosBackupEscritorio.tsx', 'utf8');
  assert.doesNotMatch(c, /\bfixed\b|sticky/);
  assert.match(c, /aria-label=\{rotulo\}/); assert.match(c, /'Fechar o aviso do backup'/);
  assert.match(c, /min-w-0 truncate font-semibold/);
});

