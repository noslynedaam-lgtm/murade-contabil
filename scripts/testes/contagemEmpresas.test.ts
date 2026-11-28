// Contagem de empresas igual em todas as telas e na Murad (pedido do Beny, 28/11/2026): 20 empresas no escritório, 7 vieram do
// Fiscal e ainda não foram ativadas no Contábil. Antes: o seletor mostrava 13, a Murad dizia 20. Agora as duas falam
// "20 empresas — 13 atendidas no Contábil, 7 ainda não ativadas aqui (só no Fiscal)", com a mesma função. Dados fictícios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contarEmpresas, contagemDe, seloContagemEmpresas, textoAtalhoAtivar, textoContagemEmpresas, HASH_ATIVAR_EMPRESAS } from '../../src/utils/contagemEmpresas';
import { ArmazemAcoesPendentes, conversar, type ContextoAgente, type ModeloIA } from '../../src/server/agenteMotor';

const escritorio = Array.from({ length: 20 }, (_, i) => ({
  cnpj: `${String(11222333000100 + i).padStart(14, '0')}`, razaoSocial: `Empresa Fictícia ${i + 1}`, atendimentoContabil: i < 13 ? 'ativa' : 'disponivel',
}));

test('contagem: total do escritório E a divisão, com a frase pedida', () => {
  const c = contarEmpresas(escritorio, (e) => e.atendimentoContabil === 'disponivel');
  assert.deepEqual(c, { total: 20, atendidas: 13, naoAtivadas: 7 });
  assert.equal(textoContagemEmpresas(c, 'Contábil'), '20 empresas — 13 atendidas no Contábil, 7 ainda não ativadas aqui (só no Fiscal)');
  assert.equal(seloContagemEmpresas(c), '13 de 20');
  assert.equal(textoAtalhoAtivar(c), 'Ver e ativar as 7 que faltam');
  assert.equal(HASH_ATIVAR_EMPRESAS, 'empresas-nao-ativadas');
});

test('contagem: todas ativas, uma só, nenhuma, singular e CNPJ repetido', () => {
  assert.equal(textoContagemEmpresas(contagemDe(13, 0), 'Contábil'), '13 empresas — todas atendidas no Contábil');
  assert.equal(textoContagemEmpresas(contagemDe(1, 0), 'Contábil'), '1 empresa — atendida no Contábil');
  assert.equal(textoContagemEmpresas(contagemDe(0, 0), 'Contábil'), 'Nenhuma empresa cadastrada');
  assert.equal(textoContagemEmpresas(contagemDe(1, 1), 'Contábil'), '2 empresas — 1 atendida no Contábil, 1 ainda não ativada aqui (só no Fiscal)');
  assert.equal(seloContagemEmpresas(contagemDe(13, 0)), '13');
  assert.equal(textoAtalhoAtivar(contagemDe(13, 0)), '');
  assert.equal(textoAtalhoAtivar(contagemDe(3, 1)), 'Ver e ativar a que falta');
  // A mesma empresa duas vezes (formatada e sem pontuação) conta uma vez; vale "atendida" se qualquer uma estiver ativa.
  const rep = contarEmpresas([{ cnpj: '11.222.333/0001-81', d: true }, { cnpj: '11222333000181', d: false }, { cnpj: '44555666000172', d: true }], (e) => e.d);
  assert.deepEqual(rep, { total: 2, atendidas: 1, naoAtivadas: 1 });
});

test('Murad: "quantas empresas eu tenho?" responde com os MESMOS números da tela (nunca esconde as não ativadas)', async () => {
  // Ferramenta igual à listar_empresas do Contábil (mesma função de contagem).
  const listar = { tipo: 'leitura', declaracao: { name: 'listar_empresas', description: '', parameters: { type: 'OBJECT', properties: {} } },
    async executar() { const contagem = contarEmpresas(escritorio, (e) => e.atendimentoContabil === 'disponivel'); return { resumo: textoContagemEmpresas(contagem, 'Contábil'), contagem, empresas: escritorio.map((e) => ({ cnpj: e.cnpj, razaoSocial: e.razaoSocial, atendidaNoContabil: e.atendimentoContabil !== 'disponivel' })) }; } };
  const ctx: ContextoAgente = { sessaoHash: 'h', login: 'contadora@escritorio.test', hoje: '2026-11-28', chamarApi: async () => ({ status: 200, corpo: {} }), registrar: () => undefined, pendentes: new ArmazemAcoesPendentes(), kit: { ferramentas: [listar as any], instrucao: '' } };
  const modelo: ModeloIA = async () => { throw new Error('não deveria chamar a IA para esta pergunta'); };
  const r = await conversar(ctx, modelo, 'quantas empresas eu tenho?');
  assert.match(r.resposta, /^Você tem 20 empresas — 13 atendidas no Contábil, 7 ainda não ativadas aqui \(só no Fiscal\)\./);
  assert.match(r.resposta, /ainda não ativadas aqui/);
  assert.match(r.resposta, /ativa a empresa tal/);
  // As atendidas vêm primeiro na lista falada.
  assert.match(r.resposta, /A primeira é Empresa Fictícia 1,/);
});
