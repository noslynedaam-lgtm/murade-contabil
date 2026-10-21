import assert from 'node:assert/strict';
import { test } from 'node:test';
import { descreverAcao } from '../../src/server/atividadeEscritorio';

test('descreve ações conhecidas em português', () => {
  assert.equal(descreverAcao('POST', '/api/auth/team/invite'), 'Convidou funcionário para a equipe');
  assert.match(descreverAcao('POST', '/api/folha/calcular'), /folha/i);
  assert.match(descreverAcao('DELETE', '/api/auth/team/fulano'), /equipe/i);
});
test('rota desconhecida cai em descrição genérica sem conteúdo', () => {
  assert.match(descreverAcao('PUT', '/api/qualquer/coisa'), /^Alterou dados \(qualquer\/coisa\)$/);
});

import express from 'express';
import { criarAtividadeEscritorio } from '../../src/server/atividadeEscritorio';

test('middleware registra só alterações bem-sucedidas, sem corpo, e a lista fica isolada por escritório', async () => {
  const linhas: any[] = [];
  const consultar = async (sql: string, p: unknown[] = []) => {
    if (/^\s*INSERT/i.test(sql)) { linhas.push({ tenant_id: p[0], login: p[2], acao: p[5], cnpj: p[6], criado_em: new Date() }); return { rows: [] }; }
    if (/^\s*SELECT/i.test(sql)) return { rows: linhas.filter((l) => l.tenant_id === p[0]) };
    return { rows: [] };
  };
  const app = express(); app.use(express.json());
  const atividade = criarAtividadeEscritorio({
    consultar, tabela: 't', podeVer: (req) => (req as any).adm === true,
    sessao: (req) => (req as any).s,
  });
  app.use((req, _res, next) => { const h = String(req.headers['x-u'] || ''); if (h) { (req as any).s = { userId: h, login: h + '@x', tenantId: h.startsWith('a') ? 'T1' : 'T2' }; (req as any).adm = h === 'a1'; } next(); });
  app.use('/api', atividade.registrar);
  app.post('/api/folha/calcular', (req, res) => res.json({ ok: true }));
  app.post('/api/falha', (_req, res) => res.status(400).json({}));
  app.get('/api/atividade', atividade.listar);
  const srv = app.listen(0); const porta = (srv.address() as any).port; const base = `http://127.0.0.1:${porta}`;
  const h = (u: string) => ({ 'content-type': 'application/json', 'x-u': u });
  try {
    await fetch(`${base}/api/folha/calcular`, { method: 'POST', headers: h('a1'), body: JSON.stringify({ cnpj: '12.345.678/0001-95', salario: 9999 }) });
    await fetch(`${base}/api/falha`, { method: 'POST', headers: h('a1'), body: '{}' });
    await fetch(`${base}/api/folha/calcular`, { method: 'POST', headers: h('b1'), body: '{}' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].cnpj, '12345678000195');
    assert.ok(!JSON.stringify(linhas).includes('9999'));
    const ok = await (await fetch(`${base}/api/atividade`, { headers: h('a1') })).json();
    assert.equal(ok.atividades.length, 1);
    const negado = await fetch(`${base}/api/atividade`, { headers: h('b1') });
    assert.equal(negado.status, 403);
  } finally { srv.close(); }
});
