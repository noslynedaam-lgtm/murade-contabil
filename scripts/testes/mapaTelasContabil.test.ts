import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CAMPOS_CONTABIL, SECOES_CONTABIL, TELAS_CONTABIL, alvoDoCampo } from '../../src/data/mapaTelasContabil';
import { conferirMapaPiloto, resumoRelatorioPiloto } from '../../src/server/conferidorPiloto';
import { analisarAlvo, validarPlanoPiloto } from '../../src/utils/pilotoVisivel';

const ler = (c: string): string | null => { try { return readFileSync(c, 'utf8'); } catch { return null; } };

test('o mapa de telas bate com o código: toda tela, campo, botão e seção existe', () => {
  const r = conferirMapaPiloto(ler);
  assert.deepEqual(r.problemas, [], resumoRelatorioPiloto(r));
  assert.ok(r.verificados >= TELAS_CONTABIL.length + CAMPOS_CONTABIL.length + SECOES_CONTABIL.length);
});

test('o robô conferidor percebe renomeação: campo, botão final, botão de abrir, tela, seção e montagem', () => {
  const trocar = (arquivo: string, de: string, para: string) => (c: string) => { const t = ler(c); return c === arquivo && t ? t.replaceAll(de, para) : t; };
  const tipos = (f: (c: string) => string | null) => conferirMapaPiloto(f).problemas.map((p) => `${p.tipo}:${p.chave}`);
  assert.deepEqual(tipos(trocar('src/components/tabs/LancamentosTab.tsx', 'data-campo="lancamento-valor"', 'data-campo="valor-lanc"')), ['campo:lancamento-valor']);
  assert.deepEqual(tipos(trocar('src/components/tabs/LancamentosTab.tsx', 'data-piloto-final="salvar"', '')), ['botao_final:lancamento-gravar']);
  assert.deepEqual(tipos(trocar('src/components/tabs/PlanoContasTab.tsx', 'data-piloto-abrir=""', '')), ['botao_abrir:btn-nova-conta']);
  assert.deepEqual(tipos(trocar('src/components/tabs/PlanoContasTab.tsx', 'id="btn-nova-conta"', 'id="x"')), ['campo:btn-nova-conta']);
  assert.ok(tipos(trocar('src/App.tsx', 'tabAtiva === "balancete"', 'tabAtiva === "balancete2"')).includes('tela:balancete'));
  assert.ok(tipos(trocar('src/components/Sidebar.tsx', 'id: "backups" as TabId', 'id: "backups2" as TabId')).includes('menu:backups'));
  assert.ok(tipos(trocar('src/components/Sidebar.tsx', 'id={`btn-menu-${item.id}`}', 'id={`menu-${item.id}`}')).includes('menu:btn-menu-*'));
  assert.ok(tipos((c) => { const t = ler(c); return c === 'src/components/tabs/LivrosTab.tsx' && t ? t.replace(/livro raz[aã]o/gi, 'Razão') : t; }).includes('secao:livro-razao'));
  assert.ok(tipos(trocar('src/App.tsx', '<PilotoVisivel', '<Outro')).includes('montagem:PilotoVisivel'));
  const semArquivo = conferirMapaPiloto((c) => (c === 'src/components/tabs/EmpresaTab.tsx' ? null : ler(c)));
  assert.ok(semArquivo.problemas.some((p) => p.tipo === 'arquivo'));
  assert.match(resumoRelatorioPiloto(semArquivo), /ATENÇÃO/);
});

test('mapa bem formado: chaves únicas, alvos válidos, botões finais só salvar/irreversível, sem credencial', () => {
  const chaves = CAMPOS_CONTABIL.map((c) => c.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.equal(new Set(TELAS_CONTABIL.map((t) => t.id)).size, TELAS_CONTABIL.length);
  for (const c of CAMPOS_CONTABIL) {
    assert.ok(analisarAlvo(alvoDoCampo(c.chave)), c.chave);
    assert.ok(TELAS_CONTABIL.some((t) => t.id === c.tela), `${c.chave}: tela`);
    assert.doesNotMatch(c.chave, /senha|token|certificad|banc|pix|cartao/i);
    if (c.final) assert.equal(c.tipo, 'botao');
  }
  for (const s of SECOES_CONTABIL) assert.ok(TELAS_CONTABIL.some((t) => t.id === s.tela), s.chave);
  // todo alvo gerado pelo mapa passa na validação de contrato
  const passos = CAMPOS_CONTABIL.map((c) => ({ tipo: 'destacar', alvo: alvoDoCampo(c.chave), legenda: c.rotulo }));
  for (let i = 0; i < passos.length; i += 30) assert.equal(validarPlanoPiloto({ titulo: 't', passos: passos.slice(i, i + 30) }).ok, true);
});

test('só os botões de gravar do mapa têm data-piloto-final no código (nenhum botão de excluir/estornar/enviar é marcado)', () => {
  const dir = 'src/components';
  const arquivos: string[] = [];
  const andar = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const c = `${d}/${e.name}`; if (e.isDirectory()) andar(c); else if (/\.tsx$/.test(e.name)) arquivos.push(c); } };
  andar(dir);
  const marcados = arquivos.flatMap((a) => (readFileSync(a, 'utf8').match(/data-piloto-final="[a-z]+"/g) || []).map(() => a));
  assert.equal(marcados.length, CAMPOS_CONTABIL.filter((c) => c.final).length);
  assert.ok(CAMPOS_CONTABIL.filter((c) => c.final).every((c) => c.final === 'salvar' && /Gravar|Salvar/.test(c.rotulo)));
});
