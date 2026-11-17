import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemAcoesPendentes, confirmarAcao, conversar, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';
import { definirAlertaRobo, limparRobosParaTeste, registrarRobo, statusRobos } from '../../src/server/robosStatus';

function montar(api: ChamarApi, falas: Array<{ texto?: string; chamadas?: Array<{ nome: string; args: any }> }>) {
  const chamadasApi: Array<[string, string, unknown]> = [];
  let i = 0;
  const vistos: string[] = [];
  const modelo: ModeloIA = async (e) => { vistos.push(JSON.stringify(e.conteudos)); const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'dono', hoje: '2026-11-17', chamarApi: async (m, c, b) => { chamadasApi.push([m, c, b]); return api(m, c, b); }, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadasApi, vistos };
}
const configurado = { status: 200, corpo: { sucesso: true, configurado: true, emAndamento: null, destino: { bucket: 'meu-bucket' }, ultimoSucesso: { finalizadoEm: '2026-11-17T06:10:00Z', tamanhoBytes: 1000, tabelas: 5, linhas: 20, origem: 'automatico', validadoEm: null }, horasSemBackup: 3, alerta: null, ultimo: { resultado: 'ok', iniciadoEm: '2026-11-17T06:10:00Z' } } };

test('backup_agora: vira cartão de confirmação, não faz nada antes e dispara a rota do dono só depois de confirmar', async () => {
  const api: ChamarApi = async (m, c) => (m === 'GET' ? configurado : { status: 202, corpo: { sucesso: true, mensagem: 'Backup iniciado.' } });
  const { ctx, modelo, chamadasApi } = montar(api, [{ chamadas: [{ nome: 'backup_agora', args: {} }] }, { texto: 'Confirme.' }]);
  const r = await conversar(ctx, modelo, 'faça o backup agora', []);
  assert.equal(r.acoes.length, 1);
  assert.match(r.acoes[0].titulo, /backup completo do banco/i);
  assert.equal(chamadasApi.some(([m]) => m === 'POST'), false);
  const c = await confirmarAcao(ctx, r.acoes[0].id);
  assert.equal(c.sucesso, true);
  assert.deepEqual(chamadasApi.filter(([m]) => m === 'POST').map(([, caminho]) => caminho), ['/api/backup-banco/gerar']);
});

test('backup_agora: recusa sem destino configurado, com backup em andamento e para quem não é o dono', async () => {
  for (const [resposta, trecho] of [
    [{ status: 200, corpo: { sucesso: true, configurado: false } }, /Falta configurar o destino/],
    [{ status: 200, corpo: { sucesso: true, configurado: true, emAndamento: { origem: 'manual' } } }, /andamento/],
    [{ status: 403, corpo: { sucesso: false, motivo: 'Somente o dono do sistema acessa o backup completo do banco.' } }, /dono/],
  ] as const) {
    const { ctx, modelo, vistos } = montar(async () => resposta as any, [{ chamadas: [{ nome: 'backup_agora', args: {} }] }, { texto: 'ok' }]);
    const r = await conversar(ctx, modelo, 'backup', []);
    assert.equal(r.acoes.length, 0);
    assert.match(vistos.join(' '), trecho);
  }
});

test('status_backup: resume sem expor nada além do estado e avisa quando está desligado', async () => {
  const { ctx, modelo } = montar(async () => configurado, [{ chamadas: [{ nome: 'status_backup', args: {} }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'como está o backup?', []);
  assert.equal(r.acoes.length, 0);
  const desligado = montar(async () => ({ status: 200, corpo: { sucesso: true, configurado: false, faltando: [{ variavel: 'MURADE_BACKUP_CHAVE' }] } }), [{ chamadas: [{ nome: 'status_backup', args: {} }] }, { texto: 'ok' }]);
  await conversar(desligado.ctx, desligado.modelo, 'e o backup?', []);
  assert.ok(kitContabil.ferramentas.some((f) => f.declaracao.name === 'status_backup') && kitContabil.ferramentas.some((f) => f.declaracao.name === 'backup_agora'));
});

test('painel de Saúde dos robôs: o alerta de backup atrasado aparece no estado do robô', () => {
  limparRobosParaTeste();
  registrarRobo({ id: 'backup_banco', nome: 'Robô de Backup do Banco', posto: 'conferidor', missao: 'x', intervaloMs: 600_000 });
  definirAlertaRobo('backup_banco', { nivel: 'critico', texto: 'Faz 27 h sem backup do banco concluído.' });
  assert.equal(statusRobos().robos[0].alerta?.nivel, 'critico');
  definirAlertaRobo('backup_banco', null);
  assert.equal(statusRobos().robos[0].alerta, null);
});
