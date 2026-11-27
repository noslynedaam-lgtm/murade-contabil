// Agente 007 — conferidor do backup: NÚCLEO (mesmo arquivo e mesmo teste no DP, no Fiscal e no Contábil). Dados FICTÍCIOS que reproduzem os casos achados no
// backup de um escritório de teste: empresa gravada no meio da importação, ficha com campo vazio que a migração guardou, empresa sem
// regime/RAT, funcionário que faltou na contagem e coluna do backup sem campo no Murad (cofre + implantação quando o mapa ganha o campo).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  criarFila007, rodarEmpresa007, repo007EmMemoria, implantarDoCofre007, painelCofre007, textoResumo007, formatoSemDado, ehPerguntaSobre007,
  respostaMurad007, precisaRodar, type Deps007, type Etapa007, type Alvo007,
} from '../../src/server/agente007';

const T1 = 'escritorio-a'; const T2 = 'escritorio-b';
const C1 = '11222333000181'; const C2 = '22333444000172';

/** Temporizador de mentira: guarda os agendamentos e roda quando o teste manda. */
function relogio() {
  const fila: Array<{ fn: () => void; ms: number; vivo: boolean }> = [];
  return {
    temporizador: (fn: () => void, ms: number) => { const x = { fn, ms, vivo: true }; fila.push(x); return { cancelar: () => { x.vivo = false; } }; },
    disparar: () => { const xs = fila.splice(0).filter((x) => x.vivo); xs.forEach((x) => x.fn()); return xs.length; },
    pendentes: () => fila.filter((x) => x.vivo).length,
  };
}

function depsFalsas(estado: { assinaturas: Map<string, string>; gravando: boolean; ordem: string[] }, repo = repo007EmMemoria()): Deps007 {
  const leve: Etapa007 = { id: 'leve', nome: 'Leve', rodar: async (a) => { estado.ordem.push(`leve:${a.cnpj}`); return { organizados: 2, rotulo: 'fichas', achados: [{ chave: `x|${a.cnpj}`, cnpj: a.cnpj, tipo: 'pendencia', texto: 'Falta o regime.', tela: 'cad-emp' }] }; } };
  const pesada: Etapa007 = { id: 'pesada', nome: 'Robôs', pesada: true, rodar: async () => { estado.ordem.push('pesada'); return {}; } };
  return { sistema: 'dp', repo, etapas: [leve, pesada], versaoMapa: 'v1', assinatura: async (a: Alvo007) => estado.assinaturas.get(a.cnpj) || '0', migracaoGravando: () => estado.gravando };
}

test('acompanha DURANTE a importação: cada empresa gravada entra na fila e é conferida sem esperar o fim; as pesadas esperam a migração', async () => {
  const r = relogio(); const estado = { assinaturas: new Map([[C1, 'a'], [C2, 'b']]), gravando: true, ordem: [] as string[] };
  const lotes: number[] = [];
  const fila = criarFila007(depsFalsas(estado), { temporizador: r.temporizador, aoTerminarLote: (rs) => lotes.push(rs.length) });
  fila.enfileirar({ tenantId: T1, cnpj: C1, motivo: 'empresa gravada' });
  fila.enfileirar({ tenantId: T1, cnpj: C1, motivo: 'gravada de novo' }); // repetida antes da vez: vira uma rodada só
  assert.equal(fila.aguardando(), 1);
  r.disparar(); // os ~90 s passaram: a 1ª empresa é conferida enquanto a migração ainda grava a próxima
  await new Promise((ok) => setTimeout(ok, 20));
  assert.deepEqual(estado.ordem, [`leve:${C1}`]);
  assert.equal(lotes.length, 0, 'migração gravando: os robôs pesados não rodam ainda');
  fila.enfileirar({ tenantId: T1, cnpj: C2, motivo: 'empresa gravada' });
  estado.gravando = false;
  r.disparar(); await fila.ocioso();
  assert.deepEqual(estado.ordem, [`leve:${C1}`, `leve:${C2}`, 'pesada']);
  assert.deepEqual(lotes, [2]);
});

test('só onde mudou: mesma assinatura e mesma versão do mapa não roda de novo; "Rodar agora" força', async () => {
  const estado = { assinaturas: new Map([[C1, 'a']]), gravando: false, ordem: [] as string[] };
  const d = depsFalsas(estado);
  assert.ok(await rodarEmpresa007(d, { tenantId: T1, cnpj: C1, motivo: 'm' }));
  assert.equal(await rodarEmpresa007(d, { tenantId: T1, cnpj: C1, motivo: 'm' }), null);
  estado.assinaturas.set(C1, 'mudou');
  assert.ok(await rodarEmpresa007(d, { tenantId: T1, cnpj: C1, motivo: 'm' }));
  assert.ok(await rodarEmpresa007(d, { tenantId: T1, cnpj: C1, motivo: 'm' }, { forcar: true }));
  assert.equal(precisaRodar({ assinatura: 'x', versaoMapa: 'v1' } as any, 'x', 'v2'), true, 'mapa novo: confere de novo');
});

test('isolado por escritório: o relatório de um escritório não aparece no outro', async () => {
  const repo = repo007EmMemoria(); const estado = { assinaturas: new Map([[C1, 'a'], [C2, 'b']]), gravando: false, ordem: [] as string[] };
  const d = depsFalsas(estado, repo);
  await rodarEmpresa007(d, { tenantId: T1, cnpj: C1, motivo: 'm' });
  await rodarEmpresa007(d, { tenantId: T2, cnpj: C2, motivo: 'm' });
  assert.deepEqual((await repo.rodadasDoTenant(T1, 'dp')).map((x) => x.cnpj), [C1]);
  assert.deepEqual((await repo.rodadasDoTenant(T2, 'dp')).map((x) => x.cnpj), [C2]);
  assert.equal(await repo.apagarEmpresa(C1), 1);
  assert.deepEqual(await repo.rodadasDoTenant(T1, 'dp'), []);
  assert.equal((await repo.rodadasDoTenant(T2, 'dp')).length, 1, 'excluir a empresa de um não mexe no outro');
});

test('resumo curto e voz da Murad', () => {
  assert.equal(textoResumo007({ organizados: 62, perguntas: 3, pendencias: 0, cofre: 0, implantados: 0 }, { fichas: 62 }), '007 organizou 62 fichas, 3 pergunta(s) para você.');
  assert.equal(textoResumo007({ organizados: 0, perguntas: 0, pendencias: 0, cofre: 0, implantados: 0 }), '007 conferiu o backup: tudo no lugar.');
  for (const f of ['Murad, o que o 007 fez?', 'o 007 conferiu meu backup?', 'zero zero sete fez o quê', 'conferiu tudo, 007?']) assert.ok(ehPerguntaSobre007(f), f);
  for (const f of ['confere as 7 empresas', 'o que o robô fez', 'folha de 2007']) assert.ok(!ehPerguntaSobre007(f), f);
  assert.match(respostaMurad007([]), /ainda não conferiu/);
  const r = respostaMurad007([{ tenantId: T1, cnpj: C1, sistema: 'dp', assinatura: 'a', versaoMapa: 'v', quando: '2026-11-27T15:00:00.000Z', resumo: { contagem: { organizados: 62, perguntas: 3, pendencias: 1, cofre: 0, implantados: 0 }, porRotulo: { fichas: 62 }, etapas: [], achados: [], motivo: '', texto: '' } }]);
  assert.match(r, /62 fichas/); assert.match(r, /3 pergunta/); assert.match(r, /Robôs/);
  assert.ok(!/alterdata/i.test(r));
});

test('cofre do backup: guarda cifrável por escritório, painel do dono sem dado pessoal e implantação quando o mapa ganha o campo', async () => {
  const repo = repo007EmMemoria();
  await repo.guardarCofre([
    { tenantId: T1, cnpj: C1, sistema: 'dp', tabela: 'wphd.empresa', coluna: 'nrsuframa', registro: 'empresa', valor: '200123456' },
    { tenantId: T2, cnpj: C2, sistema: 'dp', tabela: 'wphd.empresa', coluna: 'nrsuframa', registro: 'empresa', valor: '200999888' },
    { tenantId: T1, cnpj: C1, sistema: 'dp', tabela: 'wdp.d#####', coluna: 'chave_pix', registro: 'iddependente=7', valor: 'fulano@exemplo.com' },
  ]);
  // Painel do dono: agregado (2 escritórios na coluna da SUFRAMA), formato sem o dado.
  const painel = painelCofre007(await repo.linhasCofre('dp'), { temImplantador: () => false, noMapaComCampo: () => false, sugestao: (_t, c) => `Criar campo para "${c}"` });
  const sf = painel.find((l) => l.coluna === 'nrsuframa')!;
  assert.equal(sf.registros, 2); assert.equal(sf.escritorios, 2); assert.equal(sf.formato, '999999999'); assert.equal(sf.situacao, 'sem_lugar');
  assert.match(sf.sugestao, /Criar campo/);
  const pix = painel.find((l) => l.coluna === 'chave_pix')!;
  assert.equal(pix.formato, 'AAAAAA@AAAAAAA.AAA');
  assert.ok(!JSON.stringify(painel).includes('fulano') && !JSON.stringify(painel).includes(C1), 'painel sem dado pessoal nem CNPJ');
  // O mapa ganhou o campo da SUFRAMA (versão nova): o 007 implanta sozinho nos dois escritórios, só onde está vazio.
  const cadastro = new Map<string, Record<string, any>>([[C1, {}], [C2, { suframa: 'digitado pelo escritório' }]]);
  const implantador = { tabela: 'wphd.empresa', coluna: 'nrsuframa', campo: 'suframa', aplicar: async (_t: string, cnpj: string, itens: Array<{ registro: string; valor: string }>, fonte: string) => {
    const e = cadastro.get(cnpj)!; if (!e.suframa) { e.suframa = itens[0].valor; e.fontes007 = { suframa: fonte }; } return { implantados: itens.map((i) => i.registro) };
  } };
  const d = { sistema: 'dp' as const, repo, versaoMapa: 'mapa-v1' };
  await repo.gravarVersaoMapa('dp', 'mapa-v1');
  assert.equal((await implantarDoCofre007(d, [implantador])).implantados, 0, 'mapa igual: não implanta');
  const r = await implantarDoCofre007({ ...d, versaoMapa: 'mapa-v2' }, [implantador]);
  assert.equal(r.mapaMudou, true); assert.equal(r.implantados, 2);
  assert.equal(cadastro.get(C1)!.suframa, '200123456'); assert.equal(cadastro.get(C1)!.fontes007.suframa, '007: do backup (wphd.empresa.nrsuframa)');
  assert.equal(cadastro.get(C2)!.suframa, 'digitado pelo escritório', 'nunca sobrescreve o que o escritório digitou');
  const depois = painelCofre007(await repo.linhasCofre('dp'), { temImplantador: (t, c) => c === 'nrsuframa', noMapaComCampo: () => true, sugestao: () => '' });
  assert.equal(depois.find((l) => l.coluna === 'nrsuframa')!.situacao, 'implantado');
  assert.equal(depois.find((l) => l.coluna === 'chave_pix')!.situacao, 'campo_no_mapa_sem_implantador');
  // O backup novo da mesma empresa não volta a pendente o que já foi implantado.
  assert.equal(await repo.guardarCofre([{ tenantId: T1, cnpj: C1, sistema: 'dp', tabela: 'wphd.empresa', coluna: 'nrsuframa', registro: 'empresa', valor: '1' }]), 0);
  assert.equal(await repo.apagarTenant(T1), 2);
  assert.equal(repo.cofreCru().length, 1);
  assert.equal(formatoSemDado('João da Silva 12'), 'AAAA AA AAAAA 99');
});

