// Empresa "disponível — ainda não atendida no Contábil" (28/11/2026). Dados fictícios (CNPJs de teste, banco em memória).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ativarEmpresa, ativarPorUso, cnpjsDisponiveis, converterEstadoAtual, desfazerConversao, esquecerPreparoAtendimento, lerMarca, marcarDisponivelNaChegada, soAtivas } from '../../src/server/empresaAtendimento';
import { criarCandidatasContabil, criarDadosPropriosContabil, temPlanoProprio } from '../../src/server/empresaAtendimentoContabil';
import { montarWorkspaceInicialContabil, empresaInicialDoCadastro } from '../../src/utils/workspaceInicial';

const fonte = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const COPIA_SEM_DADOS = '11222333000181';
const COPIA_COM_LANC = '11444777000161';
const CADASTRADA_AQUI = '12345678000195';

// Banco falso em memória (o Contábil não tem pg-mem): entende só as consultas da marca de atendimento e as leituras do Contábil usadas aqui.
async function banco() {
  esquecerPreparoAtendimento();
  const marcas = new Map<string, any>(); const hist: any[] = []; const workspaces = new Map<string, any>();
  const acessos = [COPIA_SEM_DADOS, COPIA_COM_LANC, CADASTRADA_AQUI]; const copias = new Set([COPIA_SEM_DADOS, COPIA_COM_LANC]);
  for (const c of copias) {
    const ws: any = montarWorkspaceInicialContabil(empresaInicialDoCadastro(c, { razaoSocial: `Empresa Teste ${c.slice(-4)}`, regime: 'Simples Nacional' }));
    if (c === COPIA_COM_LANC) ws.lancamentos = [{ id: 'L-TESTE-1', historico: 'lançamento fictício' }];
    workspaces.set(c, ws);
  }
  const q = async (bruto: string, p: any[] = []): Promise<any> => {
    const sql = bruto.replace(/\s+/g, ' ').trim();
    if (/^CREATE (TABLE|INDEX)/.test(sql)) return { rows: [] };
    if (/^SELECT cnpj, situacao FROM contabil_empresa_atendimento WHERE situacao='disponivel'/.test(sql)) return { rows: [...marcas.values()].filter((m) => m.situacao === 'disponivel') };
    if (/^SELECT \* FROM contabil_empresa_atendimento WHERE cnpj=\$1/.test(sql)) return { rows: marcas.has(p[0]) ? [marcas.get(p[0])] : [] };
    if (/^SELECT 1 FROM contabil_empresa_atendimento WHERE cnpj=\$1/.test(sql)) return { rows: marcas.has(p[0]) ? [{}] : [] };
    if (/^INSERT INTO contabil_empresa_atendimento \(cnpj, situacao, origem, motivo, por\) VALUES \(\$1,'disponivel'/.test(sql)) { if (marcas.has(p[0])) return { rows: [], rowCount: 0 }; marcas.set(p[0], { cnpj: p[0], situacao: 'disponivel', origem: p[1], motivo: p[2], lote: null, desde: new Date() }); return { rows: [{ cnpj: p[0] }], rowCount: 1 }; }
    if (/^INSERT INTO contabil_empresa_atendimento \(cnpj, situacao, origem, motivo, por, lote/.test(sql)) { marcas.set(p[0], { ...(marcas.get(p[0]) || {}), cnpj: p[0], situacao: p[1], motivo: p[3], por: p[4], lote: p[5], desde: new Date() }); return { rows: [], rowCount: 1 }; }
    if (/^INSERT INTO contabil_empresa_atendimento_hist/.test(sql)) { hist.push(p); return { rows: [], rowCount: 1 }; }
    if (/^SELECT cnpj FROM contabil_empresa_atendimento WHERE situacao='disponivel' AND lote=\$1/.test(sql)) return { rows: [...marcas.values()].filter((m) => m.situacao === 'disponivel' && m.lote === p[0]) };
    if (/^SELECT cnpj FROM contabil_empresa_atendimento WHERE situacao='disponivel' ORDER BY/.test(sql)) return { rows: [...marcas.values()].filter((m) => m.situacao === 'disponivel') };
    if (/^SELECT x\.cnpj, c\.cnpj AS copia FROM/.test(sql)) return { rows: acessos.filter((c) => !marcas.has(c)).map((c) => ({ cnpj: c, copia: copias.has(c) ? c : null })) };
    if (/^SELECT payload FROM contabil_company_workspaces WHERE cnpj=\$1/.test(sql)) return { rows: workspaces.has(p[0]) ? [{ payload: workspaces.get(p[0]) }] : [] };
    if (/^SELECT 1 FROM contabil_(period_closures|manual_journal_events|opening_balance_audit)/.test(sql)) return { rows: [] };
    throw new Error(`Consulta não esperada: ${sql.slice(0, 120)}`);
  };
  return Object.assign(q, { workspaces });
}

test('conversão no Contábil: cópia sem dados vira disponível; com lançamento e cadastrada aqui ficam ativas; desfazer volta', async () => {
  const q = await banco();
  const deps = { consultar: q, prefixo: 'contabil', candidatasSemMarca: criarCandidatasContabil(q), dadosProprios: criarDadosPropriosContabil(q), lote: 200 };
  const r = await converterEstadoAtual(deps);
  assert.equal(r.viraramDisponiveis, 1); assert.equal(r.ficaramAtivas, 2);
  assert.equal((await lerMarca(q, 'contabil', COPIA_SEM_DADOS))?.situacao, 'disponivel');
  assert.equal((await lerMarca(q, 'contabil', COPIA_COM_LANC))?.situacao, 'ativa', 'com lançamento fica ATIVA');
  assert.equal((await lerMarca(q, 'contabil', CADASTRADA_AQUI))?.situacao, 'ativa');
  assert.equal((await converterEstadoAtual(deps)).avaliadas, 0, 'idempotente');
  assert.equal(q.workspaces.size, 2, 'nada apagado');
  assert.deepEqual(await desfazerConversao(q, 'contabil', 'dono-teste'), { voltaram: 1 });
  assert.equal((await lerMarca(q, 'contabil', COPIA_SEM_DADOS))?.situacao, 'ativa');
});

test('cópia entra disponível, robôs (reconciliador, conferidores) pulam; ativar por clique e por lançamento', async () => {
  const q = await banco();
  await marcarDisponivelNaChegada(q, 'contabil', COPIA_SEM_DADOS, 'Murad Fiscal');
  assert.ok((await cnpjsDisponiveis(q, 'contabil', 0)).has(COPIA_SEM_DADOS));
  assert.deepEqual(await soAtivas(q, 'contabil', [COPIA_SEM_DADOS, CADASTRADA_AQUI]), [CADASTRADA_AQUI]);
  assert.deepEqual(await ativarEmpresa(q, 'contabil', COPIA_SEM_DADOS, { motivo: 'botão Ativar aqui', por: 'contadora-teste' }), { ativou: true, jaEstavaAtiva: false });
  await marcarDisponivelNaChegada(q, 'contabil', COPIA_COM_LANC, 'Murad Fiscal');
  assert.equal(await ativarPorUso(q, 'contabil', COPIA_COM_LANC, 'Lançamento contábil feito no Contábil.'), true);
  const auth = fonte('src/server/authContabil.ts');
  assert.match(auth, /marcarDisponivelNaChegada\(consultaAtendimento, 'contabil', cnpj, 'Murad Fiscal'\)/, 'Robô de Empresas do Fiscal e sincronia marcam na chegada');
  assert.match(auth, /return soAtivas\(consultaAtendimento, 'contabil', result\.rows/, 'Reconciliador só nas ativas');
  assert.match(auth, /faltando\.rows = await soAtivas/, 'não cria workspace da não ativada');
  for (const f of ['src/server/conferidorContabil.ts', 'src/server/demonstracoesServidor.ts', 'src/server/dvaServidor.ts', 'src/server/conferidorEmpresasParadas.ts']) assert.match(fonte(f), /soAtivas\(consultar as any, 'contabil'/, f);
  const srv = fonte('server.ts');
  assert.match(srv, /ativarPorUso\(consultaAtendimentoContabil, PREFIXO_ATENDIMENTO_CONTABIL, cnpj, "Lançamento contábil feito no Contábil\."/);
  assert.match(srv, /registrarRobo\(\{ id: "empresas_disponiveis"/);
  assert.match(fonte('src/components/EmpresasNaoAtivadasContabil.tsx'), /Sim, ativar no Contábil/, 'ativar tem confirmação (2º clique)');
});

test('plano de contas próprio conta como dado próprio; o padrão não', () => {
  const ws = montarWorkspaceInicialContabil({ cnpj: COPIA_SEM_DADOS, regime: 'Simples Nacional' });
  assert.equal(temPlanoProprio(ws.contas, 'Simples Nacional'), false);
  assert.equal(temPlanoProprio([...ws.contas, { codigo: '9.9.9.99', nome: 'Conta criada pela pessoa' }], 'Simples Nacional'), true);
});
