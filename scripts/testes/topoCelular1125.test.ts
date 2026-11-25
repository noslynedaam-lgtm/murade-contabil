// 25/11/2026 — barra de cima igual à do DP (sem a faixa preta "Conta"; menu da conta com e-mail, letra, usuários, segurança e
// Sair), topo visível no celular instalado, botão "Menu" flutuante e título "Murad Contábil" sem repetição.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ler = (f: string) => fs.readFileSync(f, 'utf8');

test('topo igual ao DP: uma linha no computador, conta no menu, sem a faixa preta', () => {
  const h = ler('src/components/Header.tsx');
  assert.match(h, /topo-seguro bg-\[#082B66\]/);
  assert.match(h, /flex-wrap lg:flex-nowrap/);
  for (const t of ['aria-label="Assistente IA"', '<BotaoRobosCabecalho />', 'aria-label="Calculadora"', 'Puxar do Fiscal', 'semLetra']) assert.ok(h.includes(t), t);
  assert.equal((h.match(/<MenuContaContabil onAbrirMeuJeito=\{onAbrirMeuJeito\} \/>/g) || []).length, 2);
  const m = ler('src/components/MenuContaContabil.tsx');
  for (const t of ['Tamanho da letra', 'Usuários e licenças', 'Meu jeito', 'Segurança', 'Sair']) assert.ok(m.includes(t), t);
  assert.match(m, /auth\.administrador && <button/);
  const g = ler('src/components/ContabilAccessGate.tsx');
  assert.doesNotMatch(g, /bg-slate-950 px-3 py-0\.5/);
  assert.match(g, /abrirUsuarios: \(\) => setPainelUsuarios\(true\), abrirSeguranca: \(\) => setMostrarSeguranca\(true\)/);
});

test('celular: topo visível, página sem rolagem, botão Menu flutuante e título sem repetição', () => {
  const html = ler('index.html');
  assert.match(html, /viewport-fit=cover/); assert.match(html, /<title>Murad Contábil<\/title>/);
  assert.match(ler('src/index.css'), /html\.tela-app-fixa, html\.tela-app-fixa body/);
  const app = ler('src/App.tsx');
  assert.match(app, /useTelaFixa\(\);/); assert.match(app, /id="btn-menu-flutuante"/);
  assert.match(app, /onAbrirIA=\{\(\) => assistenteRef\.current\?\.abrir\(\)\}/);
});
