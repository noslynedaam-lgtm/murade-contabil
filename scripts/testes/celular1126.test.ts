// 26/11/2026 — celular do dono (Android instalado, ~400 px): (1) "Ativar avisos neste aparelho" ficava "pensando" e a faixa não
// sumia; (2) a página não pode ir para o lado; (3) botão "Menu" no mesmo lugar do DP; (4) aplicativo instalado preso na versão
// velha quando o servidor demorava mais de 4 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { motivoCurto, ESPERA_TELA_MS } from '../../src/components/AtivarAvisosContabil';
const ler = (f: string) => fs.readFileSync(f, 'utf8');

test('aviso no aparelho: ao tocar o convite some na hora, a tela espera no máximo 8 s e a frase do motivo é curta', () => {
  assert.equal(ESPERA_TELA_MS, 8000);
  const f = ler('src/components/AtivarAvisosContabil.tsx');
  assert.match(f, /setEstado\("ativando"\); \/\/ o convite some na hora/);
  assert.match(f, /Promise\.race\(\[ativacao, new Promise<"tempo">/);
  assert.match(f, /Agora não/);
  for (const etapa of ['permissao_negada', 'iphone_sem_instalar', 'sem_suporte', 'sem_sessao', 'assinatura'] as const) {
    const m = motivoCurto({ ok: false, etapa }); assert.ok(m.length > 20 && m.length <= 160, `${etapa}: ${m}`);
  }
  assert.match(motivoCurto('tempo'), /amanhã/);
});

test('página só rola para baixo no celular; campos compridos encolhem; computador igual', () => {
  const css = ler('src/index.css');
  assert.match(css, /@media \(max-width: 767px\) \{\n  html, body, #root \{ overflow-x: hidden; max-width: 100%; \}\n  \.rolagem-principal \{ overflow-x: hidden; \}/);
  assert.match(css, /\.rolagem-principal select, \.rolagem-principal textarea/);
  assert.match(ler('src/App.tsx'), /<div className="rolagem-principal flex-1 overflow-y-auto overscroll-contain content-scroll">/);
  assert.match(ler('src/hooks/useTelaFixa.ts'), /if \(el\.scrollLeft\) el\.scrollLeft = 0;/);
});

test('botão "Menu" flutuante igual ao do DP (mesmo lugar e acima dos outros botões do canto)', () => {
  const a = ler('src/App.tsx');
  assert.match(a, /id="btn-menu-flutuante"/);
  assert.match(a, /lg:hidden fixed left-3 z-\[60\]/);
  assert.match(a, /bottom: "calc\(4\.25rem \+ env\(safe-area-inset-bottom, 0px\)\)"/);
});

test('aplicativo instalado: rede demorou = abre a guardada e continua buscando a nova (não cancela); casca nova v6', () => {
  const sw = ler('public/sw.js');
  assert.match(sw, /const VERSAO = 'murade-casca-v6';/);
  assert.match(sw, /return guardada \? await esperaAte\(daRede, 4000\) : await daRede;/);
  assert.doesNotMatch(sw, /comTempo\(req, 4000\)/);
});
