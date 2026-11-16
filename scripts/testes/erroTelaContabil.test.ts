import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (c: string) => readFileSync(new URL(`../../${c}`, import.meta.url), 'utf8');

test('o Contábil protege as abas: erro em uma aba mostra aviso em vez de tela em branco', () => {
  const app = ler('src/App.tsx');
  assert.match(app, /<ErroTela chave=\{String\(tabAtiva\)\}>/);
  assert.match(app, /<\/ErroTela>/);
  const aviso = ler('src/components/ErroTela.tsx');
  assert.match(aviso, /getDerivedStateFromError/);
  assert.match(aviso, /componentDidUpdate/, 'o aviso precisa sumir ao trocar de aba');
});
