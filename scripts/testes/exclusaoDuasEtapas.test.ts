// Exclusão em DUAS ETAPAS em todo o sistema (regra do dono): ninguém apaga nada por engano, principalmente no celular.
// Cobre: as regras do componente, o desenho das duas etapas, a Agente IA por voz e uma VARREDURA do src que falha
// quando surgir exclusão por clique sem o componente (com lista de exceções justificadas, que também é conferida).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ATRASO_ETAPA2_MS, ROTULO_CANCELAR, ROTULO_CONTINUAR, ROTULO_FINAL_PADRAO, TITULO_ETAPA2,
  cancelarExclusao, confirmarExclusao, continuarExclusao, iniciarExclusao, tituloEtapa2,
} from '../../src/utils/exclusaoDuasEtapas';
import { CorpoConfirmaExclusao } from '../../src/components/ConfirmaExclusaoDuasEtapas';
import { ArmazemAcoesPendentes, avancarAcao, confirmarAcao, conversar, MENSAGEM_FALTA_ETAPA_1, type ChamarApi, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';
import { kitContabil } from '../../src/server/agenteContabil';

// ------------------------------------------------------------------ regras (sem tela)
test('duas etapas: só confirma depois de Continuar e do atraso; cancelar vale em qualquer etapa', () => {
  const t0 = 1_000_000;
  let e = iniciarExclusao();
  assert.equal(confirmarExclusao(e, t0 + 5000).etapa, 1, 'na etapa 1 não existe confirmação final');
  e = continuarExclusao(e, t0); assert.equal(e.etapa, 2);
  assert.equal(confirmarExclusao(e, t0 + ATRASO_ETAPA2_MS - 1).etapa, 2, 'toque duplo no mesmo lugar não confirma');
  const fim = confirmarExclusao(e, t0 + ATRASO_ETAPA2_MS); assert.equal(fim.etapa, 'fim'); assert.equal(fim.resultado, true);
  assert.equal(cancelarExclusao(iniciarExclusao()).resultado, false);
  assert.equal(cancelarExclusao(e).resultado, false);
  assert.equal(cancelarExclusao(fim).resultado, true, 'depois de confirmado, cancelar não desfaz a decisão já tomada');
  assert.equal(continuarExclusao(e, t0 + 9999), e, 'Continuar repetido na etapa 2 não reinicia o atraso');
});

// ------------------------------------------------------------------ desenho das etapas
const opcoes = { titulo: 'Excluir esta empresa?', oQue: 'a empresa ACME LTDA (CNPJ 12.345.678/0001-90)', consequencias: ['A empresa sai da lista.', 'O CNPJ não fica bloqueado.'] };
const desenhar = (estado: ReturnType<typeof iniciarExclusao>, o = opcoes, bloqueado = false) => renderToStaticMarkup(React.createElement(CorpoConfirmaExclusao, { opcoes: o, estado, bloqueado, idTitulo: 't', idDescricao: 'd', aoContinuar: () => {}, aoConfirmar: () => {}, aoCancelar: () => {} }));

test('etapa 1: diz o que será excluído e as consequências; Cancelar vem antes e em destaque; não há botão final', () => {
  const h = desenhar(iniciarExclusao());
  assert.match(h, /ACME LTDA \(CNPJ 12\.345\.678\/0001-90\)/); assert.match(h, /A empresa sai da lista\./); assert.match(h, /O CNPJ não fica bloqueado\./);
  assert.ok(h.indexOf(ROTULO_CANCELAR) < h.indexOf(ROTULO_CONTINUAR), 'Cancelar antes de Continuar');
  assert.ok(!h.includes(ROTULO_FINAL_PADRAO), 'a etapa 1 não tem "Sim, excluir"');
  assert.match(h, /bg-slate-900 text-white[^>]*>Cancelar/); assert.doesNotMatch(h, /autofocus/i);
});
test('etapa 2: "Última confirmação", botão vermelho em outra posição que o Continuar, sem foco automático, com saída clara', () => {
  const h = desenhar(continuarExclusao(iniciarExclusao(), 0));
  assert.ok(h.includes(TITULO_ETAPA2) && TITULO_ETAPA2 === 'Última confirmação — isso não pode ser desfeito');
  assert.match(h, /ACME LTDA/); assert.ok(!h.includes(ROTULO_CONTINUAR));
  const final = h.indexOf(ROTULO_FINAL_PADRAO), sair = h.lastIndexOf('Não, cancelar');
  assert.ok(final > 0 && sair > final, 'o vermelho vem primeiro (em cima no celular); na etapa 1 o Continuar vinha por último');
  assert.match(h, /bg-red-700[^>]*>Sim, excluir/); assert.doesNotMatch(h, /autofocus/i);
  assert.match(desenhar(continuarExclusao(iniciarExclusao(), 0), opcoes, true), /disabled=""[^>]*>Sim, excluir|>Sim, excluir<\/button>/);
  assert.match(h, /min-h-12/, 'botões grandes para o celular');
});
test('exclusão que dá para refazer não afirma "não pode ser desfeito" e explica como voltar; rótulo próprio do botão', () => {
  const o = { ...opcoes, irreversivel: false, comoVoltar: 'Para voltar, convide de novo.', rotuloFinal: 'Sim, tirar da equipe' };
  assert.ok(!tituloEtapa2(o).includes('não pode ser desfeito'));
  const h = desenhar(continuarExclusao(iniciarExclusao(), 0), o);
  assert.match(h, /Para voltar, convide de novo\./); assert.match(h, /Sim, tirar da equipe/);
});

// ------------------------------------------------------------------ Agente IA por voz
function montar(falas: Array<{ chamadas?: Array<{ nome: string; args: any }>; texto?: string }>) {
  const chamadas: Array<[string, string, unknown]> = [];
  const jeito = { podeEditarEscritorio: false, sessoes: 2, preferencias: [], receitas: [{ id: 'abrir:balancete', descricao: 'Ao abrir Balancete: destacar "Livro Diário"', obsoleta: false }], sugestoes: [] };
  const api: ChamarApi = async (m, c, b) => { chamadas.push([m, c, b]); if (m === 'GET') return { status: 200, corpo: { sucesso: true, jeito } }; return { status: 200, corpo: { sucesso: true } }; };
  let i = 0;
  const modelo: ModeloIA = async () => { const f = falas[i++] || { texto: 'fim' }; return { texto: f.texto || '', chamadas: f.chamadas || [], turnoModelo: { role: 'model', parts: [{ text: f.texto || '' }] } }; };
  const ctx: ContextoAgente = { sessaoHash: 's1', login: 'a@b.c', hoje: '2026-11-18', chamarApi: api, registrar: () => {}, pendentes: new ArmazemAcoesPendentes(), kit: kitContabil };
  return { ctx, modelo, chamadas };
}
const remocoes = (c: Array<[string, string, unknown]>) => c.filter(([m]) => m === 'POST');
test('Agente por voz: exclusão exige Continuar e depois confirmar; pular a etapa 1 é recusado sem gastar o cartão', async () => {
  const { ctx, modelo, chamadas } = montar([{ chamadas: [{ nome: 'esquecer_regra_do_jeito', args: { tipo: 'regra', quando: 'abrir_tela', tela_quando: 'balancete' } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'esquece a regra', []);
  assert.equal(r.acoes.length, 1); assert.equal(r.acoes[0].duasEtapas, true);
  const pulou = await confirmarAcao(ctx, r.acoes[0].id);
  assert.deepEqual([pulou.sucesso, pulou.mensagem], [false, MENSAGEM_FALTA_ETAPA_1]); assert.equal(remocoes(chamadas).length, 0);
  assert.equal((await avancarAcao({ ...ctx, sessaoHash: 'outra-sessao' }, r.acoes[0].id)).sucesso, false, 'outra sessão não avança o cartão');
  assert.equal((await avancarAcao(ctx, r.acoes[0].id)).sucesso, true); assert.equal(remocoes(chamadas).length, 0, 'continuar não exclui');
  const fim = await confirmarAcao(ctx, r.acoes[0].id); assert.equal(fim.sucesso, true); assert.equal(remocoes(chamadas).length, 1);
  assert.equal((await confirmarAcao(ctx, r.acoes[0].id)).sucesso, false, 'uso único');
});
test('Agente por voz: ação que não exclui continua com uma confirmação só, e não aceita "continuar"', async () => {
  const { ctx, modelo } = montar([{ chamadas: [{ nome: 'mudar_meu_nome', args: { nome: 'Ana' } }] }, { texto: 'ok' }]);
  const r = await conversar(ctx, modelo, 'me chama de Ana', []); assert.equal(r.acoes.length, 1); assert.equal(r.acoes[0].duasEtapas, false);
  assert.equal((await avancarAcao(ctx, r.acoes[0].id)).sucesso, false);
});
test('Agente por voz: toda ferramenta que remove/exclui/apaga está marcada como exclusão (duas etapas)', () => {
  const texto = readFileSync('src/server/agenteContabil.ts', 'utf8');
  const partes = texto.split(/\n  \{\n    tipo: '/).slice(1);
  let acoes = 0;
  for (const p of partes) {
    if (!p.startsWith("acao'")) continue; acoes += 1;
    const nome = /name: '([a-z_]+)'/.exec(p)?.[1] || '?';
    const apaga = /\/(remover|excluir|apagar|deletar)\b|'DELETE'/.test(p);
    assert.equal(/\n    exclusao: true,/.test(p), apaga, `${nome}: ${apaga ? 'remove algo e precisa de exclusao: true' : 'não remove nada mas está marcada como exclusão'}`);
  }
  assert.ok(acoes >= 8, 'a varredura achou as ferramentas de ação');
  assert.ok(kitContabil.ferramentas.some((f) => f.tipo === 'acao' && f.exclusao === true && f.declaracao.name === 'esquecer_regra_do_jeito'));
});

// ------------------------------------------------------------------ varredura do src
interface Arquivo { caminho: string; texto: string }
interface Violacao { regra: string; caminho: string; linha: number; trecho: string }
interface Excecao { regra: string; caminho: string; contem: string; motivo: string }

/** Cada exceção diz o que NÃO passa pelo componente e por quê. Exceção sem uso (código mudou) falha o teste. */
export const EXCECOES: Excecao[] = [
  { regra: 'API', caminho: 'src/App.tsx', contem: 'method: "DELETE"', motivo: 'Chamada de onRemoverEmpresa; a pergunta em duas etapas é feita em EmpresaTab antes de chamar (conferido em outro teste).' },
  { regra: 'ARQ', caminho: 'src/App.tsx', contem: 'localStorage.removeItem', motivo: 'Limpeza automática de dados de teste ao abrir o sistema; ninguém clica.' },
  { regra: 'ARQ', caminho: 'src/utils/tamanhoLetra.ts', contem: 'localStorage.removeItem', motivo: 'Volta o tamanho da letra ao padrão (A-/A+): é só preferência de tela, não apaga dado nenhum.' },
  { regra: 'FUNC', caminho: 'src/components/tabs/EmpresaTab.tsx', contem: 'excluirEmpresaConfirmada', motivo: 'Só é chamada por handleExcluirEmpresa depois das duas etapas (conferido em outro teste).' },
  { regra: 'FUNC', caminho: 'src/components/tabs/InicioTab.tsx', contem: 'handleExcluirLembrete', motivo: 'Só é chamada pelo ExcluirModal (duas etapas) ao confirmar.' },
  { regra: 'FUNC', caminho: 'src/components/tabs/AgendaTab.tsx', contem: 'confirmarExclusao', motivo: 'Só é chamada pelo ExcluirModal (duas etapas) ao confirmar.' },
  { regra: 'FUNC', caminho: 'src/components/tabs/GestaoContabilTab.tsx', contem: 'descartar', motivo: 'Só é chamada pelo BotaoRecalcular depois das duas etapas.' },
  { regra: 'FUNC', caminho: 'src/services/backupEscritorioContabilService.ts', contem: 'removerCamposCertificado', motivo: 'Função pura que tira os campos de certificado do backup antes de gravar; não é clique de ninguém.' },
  { regra: 'FUNC', caminho: 'src/utils/imobilizado.ts', contem: 'removerAjusteQuota', motivo: 'Função pura de cálculo (devolve o bem sem o ajuste); não é clique.' },
  { regra: 'API', caminho: 'src/types.ts', contem: 'export type MetodoRota', motivo: 'Só o tipo dos métodos das rotas da escrituração; quem chama a exclusão é a tela, sempre depois do pedir() das duas etapas.' },
  { regra: 'CONFIRMAR', caminho: 'src/components/AjusteManual.tsx', contem: 'Voltar este valor ao automático', motivo: 'Reverte UM valor digitado ao valor automático, que continua na tela; nada do sistema é apagado.' },
  { regra: 'CONFIRMAR', caminho: 'src/components/tabs/GestaoContabilTab.tsx', contem: 'ao cálculo automático (', motivo: 'Reverte UMA quota digitada ao cálculo automático, que continua na tela; nada do sistema é apagado.' },
  { regra: 'CONFIRMAR', caminho: 'src/components/tabs/GestaoContabilTab.tsx', contem: 'não são apagados', motivo: 'O texto só avisa que nenhum lançamento é apagado ao salvar o bem.' },
  { regra: 'FUNC', caminho: 'src/components/IAMuradModal.tsx', contem: 'continuarExclusao', motivo: 'Primeira confirmação do cartão da Agente: só avisa o servidor, que recusa a exclusão sem ela; nada é excluído aqui.' },
];

const USA_COMPONENTE = /useExclusaoDuasEtapas|ConfirmaExclusaoDuasEtapas|\bExcluirModal\b/;
const PEDE = /\bpedir(?:Exclusao)?\(|<ConfirmaExclusaoDuasEtapas/;

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const c = join(dir, n); return statSync(c).isDirectory() ? listar(c) : /\.(ts|tsx)$/.test(n) ? [c] : []; });
}
const lerSrc = (): Arquivo[] => listar('src').map((c) => ({ caminho: relative('.', c).split('\\').join('/'), texto: readFileSync(c, 'utf8') }));
/** Telas (cliente). O servidor, o componente em si e a caixa genérica da página ficam de fora. */
const ehTela = (c: string) => !c.startsWith('src/server/') && c !== 'src/utils/dialogoNaTela.ts' && c !== 'src/utils/exclusaoDuasEtapas.ts' && c !== 'src/components/ConfirmaExclusaoDuasEtapas.tsx';

function chamadaCompleta(texto: string, ini: number): string {
  let n = 0; let i = texto.indexOf('(', ini);
  for (let j = i; j < texto.length; j += 1) { if (texto[j] === '(') n += 1; else if (texto[j] === ')') { n -= 1; if (n === 0) return texto.slice(ini, j + 1); } }
  return texto.slice(ini, ini + 400);
}

export function varrer(arquivos: Arquivo[]): Violacao[] {
  const v: Violacao[] = [];
  for (const a of arquivos.filter((x) => ehTela(x.caminho))) {
    const linhas = a.texto.split('\n');
    const usa = USA_COMPONENTE.test(a.texto);
    const util = (r: string, linha: number, trecho: string) => v.push({ regra: r, caminho: a.caminho, linha: linha + 1, trecho: trecho.trim().slice(0, 160) });
    linhas.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      // 1) caixa de confirmação do navegador não serve para exclusão (e pode ser bloqueada)
      if (/(^|[^\w.])(window\.)?confirm\s*\(/.test(l)) util('CONFIRM_NAVEGADOR', i, l);
      // 2) exclusão por chamada de API: precisa de pedir(...) logo antes
      if (/['"`]DELETE['"`]|\/(excluir|remover|apagar|deletar)\b/.test(l)) {
        const antes = linhas.slice(Math.max(0, i - 40), i + 1).join('\n');
        if (!usa || !PEDE.test(antes)) util('API', i, l);
      }
      // 3) função de exclusão definida na tela: precisa pedir dentro dela
      const f = /\b(?:const\s+\w*(?:[Ee]xclu(?:ir|s[aã]o)|[Rr]emover|[Aa]pagar|[Zz]erar|[Rr]evogar|[Dd]escartar|CancelarConvite)\w*\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|\w+\s*=>|function)|function\s+\w*(?:[Ee]xclu(?:ir|s[aã]o)|[Rr]emover|[Aa]pagar|[Zz]erar|[Rr]evogar|[Dd]escartar)\w*)/.exec(l);
      if (f) { const corpo = linhas.slice(i, i + 12).join('\n'); if (!PEDE.test(corpo)) util('FUNC', i, l); }
      // 4) lixeira ou remoção de dado salvo no aparelho: o arquivo precisa usar o componente
      if (/<Trash2\b|localStorage\.removeItem\(/.test(l) && !usa) util('ARQ', i, l);
    });
    // 5) confirmarNaTela (um passo só) com texto de exclusão
    for (const m of a.texto.matchAll(/confirmarNaTela\(/g)) {
      const chamada = chamadaCompleta(a.texto, m.index!);
      if (/\b(exclu\w*|apag\w*|remov\w*|zerar|revog\w*|tirar|deletar|descart\w*|cancelar o convite)/i.test(chamada)) util('CONFIRMAR', a.texto.slice(0, m.index).split('\n').length - 1, chamada);
    }
  }
  return v;
}

const cobre = (e: Excecao, x: Violacao, arquivos: Arquivo[]): boolean => {
  if (e.regra !== x.regra || e.caminho !== x.caminho) return false;
  const linhas = arquivos.find((a) => a.caminho === x.caminho)!.texto.split('\n');
  return x.trecho.includes(e.contem) || linhas.slice(Math.max(0, x.linha - 1), x.linha + 12).join('\n').includes(e.contem);
};
test('varredura: nenhuma exclusão por clique no src escapa do componente de duas etapas', () => {
  const arquivos = lerSrc();
  assert.ok(arquivos.length > 100);
  const restantes = varrer(arquivos).filter((x) => !EXCECOES.some((e) => cobre(e, x, arquivos)));
  assert.deepEqual(restantes, [], `Exclusão sem as duas etapas. Use useExclusaoDuasEtapas (src/components/ConfirmaExclusaoDuasEtapas.tsx):\n${restantes.map((x) => `${x.caminho}:${x.linha} [${x.regra}] ${x.trecho}`).join('\n')}`);
});
test('varredura: toda exceção ainda é necessária e tem motivo (sem exceção velha)', () => {
  const arquivos = lerSrc(); const brutas = varrer(arquivos);
  for (const e of EXCECOES) {
    assert.ok(e.motivo.length > 25, `${e.caminho}: motivo curto demais`);
    assert.ok(arquivos.some((x) => x.caminho === e.caminho), `${e.caminho} não existe mais`);
    assert.ok(brutas.some((x) => cobre(e, x, arquivos)), `exceção sem uso, apague-a: ${e.regra} ${e.caminho} "${e.contem}"`);
  }
});
test('varredura: percebe exclusão nova sem o componente (e aceita a que usa o componente)', () => {
  const ruim = (texto: string, caminho = 'src/components/Nova.tsx') => varrer([{ caminho, texto }]);
  assert.equal(ruim(`const x = () => fetch('/api/x/1', { method: 'DELETE' });`).length, 1, 'DELETE solto');
  assert.ok(ruim(`const excluirAlgo = () => { setLista([]); };`).some((x) => x.regra === 'FUNC'), 'função de excluir sem pedir');
  assert.ok(ruim(`if (!window.confirm('Apagar?')) return;`).some((x) => x.regra === 'CONFIRM_NAVEGADOR'));
  assert.ok(ruim(`if (!confirm("Excluir?")) return;`).some((x) => x.regra === 'CONFIRM_NAVEGADOR'));
  assert.ok(ruim(`if (!await confirmarNaTela(\`EXCLUIR a conta \${c}?\`)) return;`).some((x) => x.regra === 'CONFIRMAR'), 'um passo só com texto de exclusão');
  assert.ok(ruim(`<button><Trash2 /></button>`).some((x) => x.regra === 'ARQ'), 'lixeira sem componente');
  assert.ok(ruim(`await fetch(\`/api/auth/x/\${id}/excluir\`, { method: 'POST' });`).length >= 1, 'rota /excluir sem pedir');
  const bom = `import { useExclusaoDuasEtapas } from './ConfirmaExclusaoDuasEtapas';
const T = () => { const { pedir, dialogo } = useExclusaoDuasEtapas();
  const excluirAlgo = async () => { if (!await pedir({ oQue: 'x' })) return; await fetch('/api/x/1', { method: 'DELETE' }); };
  return <><button><Trash2 /></button>{dialogo}</>; };`;
  assert.deepEqual(ruim(bom), []);
  assert.deepEqual(varrer([{ caminho: 'src/server/x.ts', texto: `app.delete('/x'); confirm('a')` }]), [], 'o servidor fica de fora');
});

test('empresa: a exclusão só roda depois das duas etapas e não bloqueia CNPJ nem e-mail', () => {
  const emp = readFileSync('src/components/tabs/EmpresaTab.tsx', 'utf8');
  assert.match(emp, /const confirmou = await pedirExclusao\([\s\S]*?\);\s*if \(confirmou\) await excluirEmpresaConfirmada\(/);
  assert.equal(emp.split('excluirEmpresaConfirmada').length - 1, 2, 'definida uma vez e chamada uma vez');
  assert.equal(emp.split('onRemoverEmpresa(').length - 1, 1, 'onRemoverEmpresa só é chamada dentro da exclusão confirmada');
  const ini = emp.indexOf('const excluirEmpresaConfirmada'); assert.ok(emp.indexOf('onRemoverEmpresa(') > ini);
  assert.doesNotMatch(emp, /bloquearCnpj|cnpjBloqueado|listaNegra/i);
});
test('lembretes: o ExcluirModal é o componente de duas etapas', () => {
  const m = readFileSync('src/components/modals/ObrigacoesModals.tsx', 'utf8');
  const corpo = m.slice(m.indexOf('export const ExcluirModal'), m.indexOf('// Ícone auxiliar'));
  assert.match(corpo, /<ConfirmaExclusaoDuasEtapas/); assert.match(corpo, /confirmou \? onConfirmar\(\) : onClose\(\)/);
});
test('Usuários e licenças: tirar da equipe, cancelar convite, excluir conta, excluir escritório e revogar acesso usam as duas etapas; nada apaga tudo de uma vez', () => {
  const eq = readFileSync('src/components/PainelEquipe.tsx', 'utf8'); const es = readFileSync('src/components/PainelEscritorios.tsx', 'utf8'); const ac = readFileSync('src/components/ContabilAccessGate.tsx', 'utf8');
  assert.equal((eq.match(/await pedir\(/g) || []).length, 3, 'tirar da equipe, cancelar convite, excluir usuário');
  assert.equal((es.match(/await pedir\(/g) || []).length, 2, 'excluir conta e excluir escritório');
  assert.match(ac, /await pedir\(\{ titulo: 'Revogar o acesso\?'/);
  assert.doesNotMatch(es, /window\.prompt\(`Para confirmar, digite/, 'sem digitar no celular');
  for (const a of lerSrc().filter((x) => ehTela(x.caminho))) assert.doesNotMatch(a.texto, /excluirTodas|apagarTudo|removerTodas|setHistoricoPorEmpresa\(\{\}\)/, `${a.caminho}: botão que apaga tudo de uma vez`);
});
