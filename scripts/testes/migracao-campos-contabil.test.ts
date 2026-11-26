// Migração contábil do sistema anterior, CAMPO A CAMPO: cada coluna preenchida do backup que tem campo no Contábil
// chega no campo certo, com o texto idêntico (pontuação, vírgulas, zeros à esquerda, espaços do meio), sem sobrescrever o
// que a equipe digitou; e o conferidor (robô e Agente IA) aponta o que chegou vazio ou diferente.
// Linhas reais anonimizadas: scripts/testes/fixtures/backup-contabil-anonimizado.sql (cadastro, sócios, contador e bem).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexarDump, carregarTabelaDump } from '../../src/server/migracaoSistemaAnterior/leitorDump';
import { montarDadosEmpresa } from '../../src/server/migracaoSistemaAnterior/conversor';
import { mesclarMigracao } from '../../src/server/migracaoSistemaAnterior/mesclagem';
import { conferirCamposMigrados, destinoDaColuna, separarNumero } from '../../src/server/migracaoSistemaAnterior/camposSistemaAnterior';
import { BLOCO_RESUMO, conferirCamposEmpresaMigrada, gravarEmpresaMigrada } from '../../src/server/migracaoSistemaAnterior/banco';
import { rotinaConferidorMigracao } from '../../src/server/migracaoSistemaAnterior/rotas';
import { tabelaContabilInteressa } from '../../src/utils/tabelasSistemaAnteriorContabil';
import { workspaceValido } from '../../src/server/authContabil';
import { planoContasModelo } from '../../src/data/planoContasModelo';
import { semDadosDoSistemaAnterior } from '../../src/server/exclusaoEmpresaCascata';
import { kitContabil } from '../../src/server/agenteContabil';
import type { BancoTransacional, ConsultaSql } from '../../src/server/exclusaoEmpresaCascata';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(AQUI, 'fixtures', 'backup-contabil-anonimizado.sql');

async function abrir() {
  const idx = await indexarDump(FIXTURE);
  const cache = new Map<string, any>();
  return async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
}
const novo = (d: any) => mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
const conferir = (d: any, payload: any) => conferirCamposMigrados({ cdempresa: d.cdempresa, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload });

test('o navegador separa também o cadastro da empresa, os sócios e o município', () => {
  for (const t of ['wphd.socemp', 'wphd.socios', 'wphd.municipiosibge', 'wphd.empresahistorico', 'wphd.historico_nire', 'wphd.historico_retencao', 'wphd.travacontabil']) assert.ok(tabelaContabilInteressa(t.split('.')[0], t.split('.')[1]), t);
  assert.equal(destinoDaColuna('wphd.empresa', 'cdnire').tipo, 'campo');
  assert.equal(destinoDaColuna('wcont.contas', 'cdchamada').tipo, 'campo');
  assert.equal(destinoDaColuna('wcont.mv00023', 'origemusuario').tipo, 'consulta');
  assert.equal(destinoDaColuna('wcont.mv00023', 'dshistorico').tipo, 'campo');
  assert.equal(destinoDaColuna('wcont.estabelecimento_cartao_credito', 'senha').tipo, 'nao_vem');
  assert.deepEqual(separarNumero('AV GOIAS, 12894'), { logradouro: 'AV GOIAS', numero: '12894' });
  assert.deepEqual(separarNumero('AV FONTE NOVA, SN'), { logradouro: 'AV FONTE NOVA', numero: 'SN' });
  assert.deepEqual(separarNumero('Avenida Goiás, 00'), { logradouro: 'Avenida Goiás', numero: '00' });
  assert.equal(separarNumero('RUA SEM NUMERO'), null);
});

test('cadastro: cada campo preenchido vem no campo certo e idêntico (ponto, vírgula, hífen, acento, espaços do meio)', async () => {
  const d = await montarDadosEmpresa(await abrir(), 23);
  const e = d.empresa;
  assert.equal(e.razaoSocial, 'EMPRESA TESTE 23 LTDA');
  assert.equal(e.inscricaoEstadual, '10.423.194-7', 'IE com pontos e hífen');
  assert.equal(e.inscricaoMunicipal, '2535939', 'só a tabulação da ponta sai');
  assert.equal(e.nire, '52-2-0247806-1');
  assert.equal(e.cep, '74474-310');
  assert.equal(e.naturezaJuridica, '2062');
  assert.equal(e.cnae, '4744001');
  assert.equal(e.dataAbertura, '29/01/2008');
  assert.equal(e.capitalSocial, 99800.5);
  assert.equal(e.capitalSocialFormatado, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(99800.5));
  assert.equal(e.endereco, 'AV GOIAS, 12894');
  assert.equal(e.logradouro, 'AV GOIAS'); assert.equal(e.numero, '12894');
  assert.equal(e.complemento, 'QUADRA08                  LOTE  44', 'espaços do meio ficam como estão');
  assert.equal(e.bairro, 'RESIDENCIAL RECANTO DO BOSQUE', 'bairro completo, não o cortado em 15 letras');
  assert.equal(e.municipio, 'Goiânia'); assert.equal(e.uf, 'GO'); assert.equal(e.cidadeUf, 'Goiânia / GO');
  assert.equal(e.ecdCodigoMunicipioIbge, '5208707');
  assert.equal(e.email, 'contato@empresa-teste23.com.br');
  assert.equal(e.telefone, '6232331651');
  // Responsável legal: o sócio marcado como responsável, com o nome completo e o CPF como está lá.
  assert.equal(e.responsavelNome, 'SÓCIA TESTE UM DE SOUZA');
  assert.equal(e.responsavelCpf, '123.456.789-09');
  assert.equal(e.responsavelQualificacao, '401');
  assert.deepEqual(e.qsa, [
    { nome: 'SÓCIA TESTE UM DE SOUZA', qualificacao: 'Sócio-Administrador', cpf: '123.456.789-09', participacaoPercentual: 50, capitalCentavos: 4990000, dataEntrada: '29/01/2008' },
    { nome: 'SOCIO TESTE DOIS', qualificacao: 'Sócio', cpf: '98765432100', participacaoPercentual: 50, capitalCentavos: 4990000, dataEntrada: '29/01/2008' },
  ], 'quem saiu não entra');
  // Campos criados no Contábil para o que antes ficava só para consulta.
  assert.equal(e.codigoSistemaAnterior, '23');
  assert.equal(e.descricaoAtividade, 'Comércio varejista de ferragen');
  assert.equal(e.juntaComercialData, '29/01/2008');
  assert.equal(e.responsavelNascimento, '26/09/1976');
  assert.equal(e.inicioServicoContabil, '01/04/2015');
  assert.equal(e.ativaNoEscritorio, true);
  for (const b of ['cadastro_empresa', 'socios_empresa', 'socios', 'municipio']) assert.ok(d.blocos[b]?.length, b);
  assert.ok(!('imglogotipoempresa' in d.blocos.cadastro_empresa[0]));
  assert.equal(d.blocos.cadastro_empresa[0].dsatividade, 'Comércio varejista de ferragen', 'o que não tem campo fica no registro');
});

test('contador com o zero da frente do CPF, número "SN", titular de EIRELI, livro Diário e bem do imobilizado', async () => {
  const d = await montarDadosEmpresa(await abrir(), 49);
  const e = d.empresa;
  assert.equal(e.razaoSocial, 'EMPRESA TESTE 49 LTDA', 'sem a opção de nome completo, vale o nome da empresa');
  assert.equal(e.numero, 'SN');
  assert.equal(e.inscricaoEstadual, 'isento');
  assert.equal(e.contadorNome, 'CONTADORA TESTE DE SOUZA');
  assert.equal(e.contadorCpf, '01234567890', 'o sistema anterior guarda o CPF como número; o zero da frente volta');
  assert.equal(e.contadorCrc, '99999/O-GO'); assert.equal(e.contadorUfCrc, 'GO');
  assert.equal(e.contadorEmail, 'contadora@escritorio-teste.com.br'); assert.equal(e.contadorFone, '6232331651');
  assert.equal(e.ecdNumeroLivro, 1);
  assert.equal(e.contadorRg, '1112223'); assert.equal(e.contadorRgOrgao, 'SSP'); assert.equal(e.contadorRgData, '08/11/2011'); assert.equal(e.contadorCategoria, 'Contador');
  assert.deepEqual(e.livrosNumeracao, { diarioPagina: 10, razao: { livro: 1 } });
  assert.equal(e.planoMascara, '9-9-99-99-99');
  assert.ok(d.contas.filter((c) => c.codigoReduzido).length > 600, 'código reduzido de cada conta');
  assert.deepEqual(e.qsa, [{ nome: 'SÓCIA TESTE QUARENTA E NOVE', qualificacao: 'Titular', cpf: '00609683543', participacaoPercentual: 100, capitalCentavos: 500000, dataEntrada: '28/12/2022' }]);
  assert.equal(e.responsavelCpf, '00609683543');
  assert.deepEqual(d.bensImobilizado, [{ id: 'sa-bem-49-1', descricao: 'BALCAO 235 X 200 C/3 GAVETAS', custoCentavos: 160000, residualCentavos: 0, vidaUtilMeses: 120, inicioDepreciacao: '2023-08', depreciavel: true, codigo: '0000000001', fornecedor: 'FORNECEDOR TESTE', dataCompra: '2023-07-30' }]);
  const m: any = novo(d);
  assert.ok(m.payload && workspaceValido(m.payload), m.bloqueio);
  assert.equal(m.payload.bensImobilizado.length, 1);
  // Exclusão da empresa: a cópia de segurança sai sem os bens que vieram do sistema anterior.
  assert.equal(semDadosDoSistemaAnterior(m.payload).bensImobilizado.length, 0);
});

test('conferidor campo a campo: tudo igual depois de migrar; aponta o que ficou vazio ou diferente', async () => {
  const ler = await abrir();
  for (const cd of [3, 8, 23, 49]) {
    const d = await montarDadosEmpresa(ler, cd);
    const m: any = novo(d);
    const r = conferir(d, m.payload);
    assert.deepEqual(r.pendencias, [], `${cd}: ${JSON.stringify(r.pendencias.slice(0, 3))}`);
    assert.ok(r.conferidos.lancamentos === d.lancamentos.filter((l) => !l.loteId).length + d.lancamentos.filter((l) => l.loteId).length);
  }
  const d = await montarDadosEmpresa(ler, 23);
  const p: any = JSON.parse(JSON.stringify(novo(d).payload));
  delete p.empresa.nire;
  p.empresa.complemento = 'QUADRA08 LOTE 44';
  p.contas.find((c: any) => c.tipo === 'analitica').descricao = 'Outro nome';
  p.historicosPadrao[0].texto += '.';
  const l = p.lancamentos.find((x: any) => !x.loteId);
  l.historico = `${l.historico} (alterado)`;
  l.valor = Number((l.valor + 0.01).toFixed(2));
  const r = conferir(d, p);
  const achou = (rotulo: string, tipo: string) => r.pendencias.some((x) => x.rotulo === rotulo && x.tipo === tipo);
  assert.ok(achou('NIRE', 'faltou'), 'NIRE vazio');
  assert.ok(achou('complemento', 'diferente'), 'espaços do meio contam');
  assert.ok(achou('descrição', 'diferente'));
  assert.ok(achou('texto', 'diferente'));
  assert.ok(achou('histórico', 'diferente'));
  assert.ok(achou('valor (centavos)', 'diferente'));
  assert.match(r.resumo, /pendência/);
});

test('junção: só completa o vazio; troca o bairro cortado da migração antiga; o que a equipe digitou fica', async () => {
  const d = await montarDadosEmpresa(await abrir(), 23);
  const atual = {
    empresa: { cnpj: d.cnpj, razaoSocial: 'Razão digitada pela equipe', bairro: 'RESIDENCIAL REC', telefone: '(62) 3233-1651', qsa: [], nire: '' },
    contas: [], centrosCusto: [], lancamentos: [], livros: [], lembretes: [],
  };
  const m: any = mesclarMigracao(atual, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.equal(m.payload.empresa.razaoSocial, 'Razão digitada pela equipe');
  assert.equal(m.payload.empresa.telefone, '(62) 3233-1651');
  assert.equal(m.payload.empresa.bairro, 'RESIDENCIAL RECANTO DO BOSQUE', 'o valor cortado que a migração antiga gravou dá lugar ao completo');
  assert.equal(m.payload.empresa.nire, '52-2-0247806-1', 'vazio é completado');
  assert.equal(m.payload.empresa.qsa.length, 2, 'lista vazia é completada');
  const outroBairro = mesclarMigracao({ ...atual, empresa: { ...atual.empresa, bairro: 'Bairro da equipe' } }, d, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.equal((outroBairro.payload as any).empresa.bairro, 'Bairro da equipe');
  // O conferidor mostra o que a equipe mudou como "diferente" (com os dois valores), sem alterar nada.
  const r = conferir(d, m.payload);
  assert.ok(r.pendencias.some((x) => x.rotulo === 'telefone' && x.tipo === 'diferente' && x.noSistemaAnterior === '6232331651' && x.noMurade === '(62) 3233-1651'));
  // Bem que a equipe já cadastrou com a mesma descrição não entra de novo.
  const d49 = await montarDadosEmpresa(await abrir(), 49);
  const comBem = { ...atual, empresa: { cnpj: d49.cnpj }, bensImobilizado: [{ id: 'b-equipe', descricao: 'BALCAO 235 X 200 C/3 GAVETAS', custoCentavos: 100, residualCentavos: 0, vidaUtilMeses: 10, inicioDepreciacao: '2023-01', depreciavel: true }] };
  const j: any = mesclarMigracao(comBem, d49, { modelo: planoContasModelo, competenciaAtual: '2026-11' });
  assert.deepEqual(j.payload.bensImobilizado.map((b: any) => b.id), ['b-equipe']);
});

/** Banco simulado: o que a gravação escreve e o que o conferidor e o robô leem. */
function bancoFalso() {
  const t = { workspaces: new Map<string, { payload: any; version: number }>(), registro: [] as any[] };
  const consultar: ConsultaSql = async (sql, p = []) => {
    const s = sql.trim();
    if (/^CREATE TABLE/i.test(s) || s.includes('pg_advisory_xact_lock') || s.startsWith('INSERT INTO contabil_auth_company_access')) return { rows: [] };
    if (s.includes('to_regclass')) return { rows: [{ t: 'ok' }] };
    if (s.includes('FROM contabil_auth_company_access a JOIN contabil_auth_users u')) return { rows: [] };
    if (s.startsWith('SELECT payload,version FROM contabil_company_workspaces') || s.startsWith('SELECT payload FROM contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0])); return { rows: w ? [w] : [] }; }
    if (s.startsWith('SELECT competencia FROM contabil_period_closures')) return { rows: [] };
    if (s.startsWith('SELECT dados FROM contabil_empresas_compartilhadas')) return { rows: [] };
    if (s.startsWith('INSERT INTO contabil_company_workspaces')) { t.workspaces.set(String(p[0]), { payload: JSON.parse(String(p[1])), version: 1 }); return { rows: [{ version: 1 }] }; }
    if (s.startsWith('DELETE FROM contabil_sistema_anterior')) {
      t.registro = t.registro.filter((r) => r.cnpj !== p[0] || (s.includes('bloco<>$2') && r.bloco === p[1]) || (s.includes('bloco=$2') && r.bloco !== p[1]));
      return { rows: [] };
    }
    if (s.startsWith('UPDATE contabil_company_workspaces')) { const w = t.workspaces.get(String(p[0]))!; w.payload = JSON.parse(String(p[1])); w.version++; return { rows: [{ version: w.version }] }; }
    if (s.startsWith('INSERT INTO contabil_sistema_anterior')) { t.registro.push({ cnpj: p[0], bloco: p[1], linhas: JSON.parse(String(p[2])), quantidade: p[3], migrado_em: new Date() }); return { rows: [] }; }
    if (s.startsWith('SELECT bloco, quantidade, migrado_em')) return { rows: t.registro.filter((r) => r.cnpj === p[0]).map((r) => ({ ...r, resumo: r.bloco === p[1] ? r.linhas : null })) };
    if (s.startsWith('SELECT bloco, linhas FROM contabil_sistema_anterior')) return { rows: t.registro.filter((r) => r.cnpj === p[0] && (p[1] as string[]).includes(r.bloco)) };
    if (s.startsWith('SELECT cnpj FROM contabil_sistema_anterior')) return { rows: [...new Set(t.registro.filter((r) => r.bloco === p[0]).map((r) => r.cnpj))].map((cnpj) => ({ cnpj })) };
    // Regras de integração Fiscal → Contábil (tabela própria), em memória.
    if (s.includes('contabil_regras_integracao_fiscal') || s.startsWith("SELECT payload->'contas'")) {
      const R: any[] = ((t as any).regras ??= []);
      if (s.startsWith('DELETE FROM contabil_regras_integracao_fiscal')) { (t as any).regras = R.filter((r) => r.cnpj !== p[0] || (s.includes("origem='sistema_anterior'") && r.origem !== 'sistema_anterior')); return { rows: [] }; }
      if (s.startsWith('INSERT INTO contabil_regras_integracao_fiscal')) { for (const x of JSON.parse(String(p[1]))) if (!R.some((r) => r.cnpj === p[0] && r.tipo === x.t && r.chave === x.k)) R.push({ cnpj: p[0], tipo: x.t, chave: x.k, conta: x.c, descricao: x.d, origem: 'sistema_anterior', dados: x.x }); return { rows: [] }; }
      if (s.startsWith('SELECT count(*)::int AS n FROM contabil_regras_integracao_fiscal')) return { rows: [{ n: R.filter((r) => r.cnpj === p[0] && r.origem === 'sistema_anterior').length }] };
      if (s.startsWith('SELECT tipo, chave, conta, descricao, origem, dados FROM contabil_regras_integracao_fiscal')) return { rows: R.filter((r) => r.cnpj === p[0]) };
      if (s.startsWith('SELECT tipo, chave, conta FROM contabil_regras_integracao_fiscal')) return { rows: R.filter((r) => r.cnpj === p[0] && r.conta) };
      if (s.startsWith('SELECT DISTINCT cnpj FROM contabil_regras_integracao_fiscal')) return { rows: [...new Set(R.map((r) => r.cnpj))].map((cnpj) => ({ cnpj })) };
      if (s.startsWith("SELECT payload->'contas'")) { const w = t.workspaces.get(String(p[0])); return { rows: w ? [{ contas: w.payload?.contas }] : [] }; }
    }
    throw new Error(`SQL não previsto: ${s.slice(0, 90)}`);
  };
  const banco: BancoTransacional = { consultar, async transacao(fn) { return fn(consultar); } };
  return { banco, consultar, t };
}

test('gravado: o registro guarda o mapa das contas; o robô conferidor e a Agente apontam o campo que ficou vazio', async () => {
  const d = await montarDadosEmpresa(await abrir(), 23);
  const f = bancoFalso();
  await gravarEmpresaMigrada(f.banco, d, { userId: 'u1', login: 'contadora', escritorioId: 'e1', tenantId: 'e1' }, { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' });
  assert.ok(f.t.registro.find((r) => r.bloco === BLOCO_RESUMO).linhas.mapaContas, 'mapa das contas guardado');
  const ok = await conferirCamposEmpresaMigrada(f.consultar, d.cnpj);
  assert.equal(ok!.pendencias.length, 0, JSON.stringify(ok!.pendencias.slice(0, 3)));
  // A equipe (ou algo) apagou o NIRE no Murad: o robô avisa.
  delete f.t.workspaces.get(d.cnpj)!.payload.empresa.nire;
  const r = await conferirCamposEmpresaMigrada(f.consultar, d.cnpj);
  assert.deepEqual(r!.pendencias.map((x) => [x.rotulo, x.tipo, x.noSistemaAnterior]), [['NIRE', 'faltou', '52-2-0247806-1']]);
  const avisos: any[] = []; const resultados: string[] = [];
  await rotinaConferidorMigracao({ consultar: f.consultar, preparar: async () => undefined, bancoConfigurado: () => true, robos: { executarRobo: async (_id, fn) => fn(), registrarResultadoRobo: (_id, t) => resultados.push(t), definirAlertaRobo: (_id, a) => avisos.push(a) } })();
  assert.match(resultados[0], /Campo a campo: 1 pendência/);
  assert.match(resultados[0], /NIRE/);
  assert.equal(avisos[0]?.nivel, 'aviso');
  const ferramenta = kitContabil.ferramentas.find((x) => x.declaracao.name === 'pendencias_campos_migracao_sistema_anterior');
  assert.ok(ferramenta && ferramenta.tipo === 'leitura');
  const tela = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'components', 'MigracaoBackupContabil.tsx'), 'utf8');
  assert.match(tela, /conferencia-campos-sistema-anterior/);
  assert.ok(!/alterdata/i.test(tela));
});

test('mais dados do cadastro: a tela carrega e grava os campos novos sem perder nada', async () => {
  const { maisDadosDe, maisDadosParaSalvar, CAMPOS_MAIS_DADOS } = await import('../../src/utils/maisDadosEmpresa');
  const d = await montarDadosEmpresa(await abrir(), 49);
  const f = maisDadosDe(d.empresa);
  assert.equal(f.contadorRg, '1112223'); assert.equal(f.diarioPagina, '10'); assert.equal(f.numero, 'SN');
  const volta = maisDadosParaSalvar(f);
  for (const [k] of CAMPOS_MAIS_DADOS) if ((d.empresa as any)[k] !== undefined) assert.deepEqual((volta as any)[k], (d.empresa as any)[k], k);
  assert.deepEqual(volta.livrosNumeracao, d.empresa.livrosNumeracao);
  const tela = fs.readFileSync(path.join(AQUI, '..', '..', 'src', 'components', 'tabs', 'EmpresaTab.tsx'), 'utf8');
  assert.match(tela, /<details data-campo="empresa-mais-dados"/, 'seção recolhível');
});

test('análise do que veio errado: corrige sozinho a formatação (com Desfazer), manda para o contador o que é julgamento', async () => {
  const { analisarMigracao, aplicarAcaoAchado, cpfValido } = await import('../../src/server/migracaoSistemaAnterior/analiseSistemaAnterior');
  const { conferirMigracao } = await import('../../src/server/migracaoSistemaAnterior/conferencia');
  assert.equal(cpfValido('123.456.789-09'), true); assert.equal(cpfValido('98765432100'), true); assert.equal(cpfValido('12345678901'), false);
  const d = await montarDadosEmpresa(await abrir(), 23);
  const p0: any = novo(d).payload;
  const ref = { esperado: d.esperado, esperadoLancamentos: d.esperadoLancamentos, saldoFinalEsperado: d.saldoFinalEsperado, lancamentosGravados: d.lancamentos.length, semSaldosParaConferir: d.semSaldosParaConferir, linhasQueNaoEntraram: d.naoEntraram.length };
  const analisar = (payload: any, decisoes = {}) => analisarMigracao({ cdempresa: 23, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload, naoEntraram: d.naoEntraram, conferencia: conferirMigracao(payload.contas, payload.lancamentos, ref), decisoes, hoje: '2026-11-22' });
  let a = analisar(p0);
  const im = a.find((x) => x.id === 'corr:empresa:inscricaoMunicipal')!;
  assert.equal(im.tipo, 'corrigido'); assert.equal(im.situacao, 'corrigido'); assert.equal(im.valorVeio, '\t2535939'); assert.equal(im.valorCerto, '2535939');
  assert.ok(a.some((x) => x.id === 'corr:empresa:bairro-cortado' && x.situacao === 'corrigido'));
  // Desfazer: volta como veio; "Corrigir agora" refaz.
  const p1 = aplicarAcaoAchado(p0, im, 'desfazer', 'contadora');
  assert.equal(p1.empresa.inscricaoMunicipal, '\t2535939');
  assert.equal(analisar(p1).find((x) => x.id === im.id)!.situacao, 'desfeito');
  assert.equal(aplicarAcaoAchado(p1, analisar(p1).find((x) => x.id === im.id)!, 'corrigir', 'contadora').empresa.inscricaoMunicipal, '2535939');
  assert.equal(p0.empresa.inscricaoMunicipal, '2535939', 'a ação trabalha numa cópia');
  // Natureza do Ativo como credora (sem ser redutora): é julgamento do contador; aceitar aplica, manter registra.
  const pN = JSON.parse(JSON.stringify(p0));
  const conta = pN.contas.find((c: any) => c.tipo === 'analitica' && c.codigo.startsWith('1.') && !/\(-\)|deprec/i.test(c.descricao));
  conta.natureza = 'C';
  a = analisar(pN);
  const nat = a.find((x) => x.id === `natureza:${conta.codigo}`)!;
  assert.equal(nat.tipo, 'conferir'); assert.equal(nat.situacao, 'pendente'); assert.match(nat.base, /6\.404/);
  assert.throws(() => aplicarAcaoAchado(pN, nat, 'corrigir', 'x'), /contador decidir/);
  const pAceito = aplicarAcaoAchado(pN, nat, 'aceitar', 'contadora');
  assert.equal(pAceito.contas.find((c: any) => c.codigo === conta.codigo).natureza, 'D');
  assert.equal(analisar(pN, { [nat.id]: { decisao: 'mantido' } }).find((x) => x.id === nat.id)!.situacao, 'mantido');
});

test('balancete que não bate: acha a causa, propõe o ajuste pronto, só lança no Sim, confere de novo e desfaz com estorno', async () => {
  const { analisarMigracao, aplicarAcaoAchado } = await import('../../src/server/migracaoSistemaAnterior/analiseSistemaAnterior');
  const { conferirMigracao } = await import('../../src/server/migracaoSistemaAnterior/conferencia');
  const d = await montarDadosEmpresa(await abrir(), 23);
  const ref = { esperado: d.esperado, esperadoLancamentos: d.esperadoLancamentos, saldoFinalEsperado: d.saldoFinalEsperado, lancamentosGravados: d.lancamentos.length, semSaldosParaConferir: d.semSaldosParaConferir, linhasQueNaoEntraram: d.naoEntraram.length };
  const p: any = JSON.parse(JSON.stringify(novo(d).payload));
  const analiticas = p.contas.filter((c: any) => c.tipo === 'analitica');
  p.empresa.contaContrapartidaAberturaCodigo = analiticas[analiticas.length - 1].codigo;
  const l = p.lancamentos.find((x: any) => !x.loteId && x.contaDebitoCodigo !== p.empresa.contaContrapartidaAberturaCodigo && x.contaCreditoCodigo !== p.empresa.contaContrapartidaAberturaCodigo);
  l.valor = Number((l.valor + 0.01).toFixed(2)); // um centavo a mais (como um arredondamento errado)
  const analisar = (payload: any) => analisarMigracao({ cdempresa: 23, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload, naoEntraram: d.naoEntraram, conferencia: conferirMigracao(payload.contas, payload.lancamentos, ref), decisoes: {}, hoje: '2026-11-22' });
  assert.equal(conferirMigracao(p.contas, p.lancamentos, ref).bate, false);
  const ajustes = analisar(p).filter((x) => x.tipo === 'ajuste');
  assert.equal(ajustes.length, 2, 'débito e crédito da partida');
  assert.ok(ajustes.every((x) => x.situacao === 'pendente' && x.ajuste && x.ajuste.valorCentavos === 1 && /arredondamento/.test(x.base)));
  const qtd = p.lancamentos.length;
  assert.equal(analisar(p).length >= 2, true); assert.equal(p.lancamentos.length, qtd, 'nada é lançado sem o Sim');
  let q = p;
  for (const a of ajustes) q = aplicarAcaoAchado(q, a, 'lancar_ajuste', 'contadora');
  const depois = conferirMigracao(q.contas, q.lancamentos, ref);
  assert.equal(depois.bateComLancamentosOriginais, true, depois.resumo);
  assert.ok(analisar(q).filter((x) => x.tipo === 'ajuste').every((x) => x.situacao === 'lancado'));
  assert.throws(() => aplicarAcaoAchado(q, analisar(q).find((x) => x.tipo === 'ajuste')!, 'lancar_ajuste', 'x'), /já foi lançado/);
  const primeiro = analisar(q).find((x) => x.tipo === 'ajuste')!;
  const est = aplicarAcaoAchado(q, primeiro, 'desfazer_ajuste', 'contadora');
  assert.equal(est.lancamentos.length, q.lancamentos.length + 1, 'desfazer é estorno, não apaga');
  assert.ok(est.lancamentos.some((x: any) => x.estornoDe));
  assert.equal(conferirMigracao(est.contas, est.lancamentos, ref).bate, false, 'sem o ajuste volta a não bater');
  assert.ok(analisar(est).some((x) => x.id === primeiro.id && x.situacao === 'pendente'), 'a proposta volta para o contador');
});

test('servidor: uma ação por vez numa transação; decisão guardada e mantida ao migrar de novo; robô avisa o que falta', async () => {
  const { aplicarAchadoEmpresaMigrada, analisarEmpresaMigrada } = await import('../../src/server/migracaoSistemaAnterior/banco');
  const d = await montarDadosEmpresa(await abrir(), 23);
  const f = bancoFalso();
  const quem = { userId: 'u1', login: 'contadora', escritorioId: 'e1', tenantId: 'e1' };
  const op = { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' };
  await gravarEmpresaMigrada(f.banco, d, quem, op);
  const an = await analisarEmpresaMigrada(f.consultar, d.cnpj);
  assert.ok(an!.achados.some((a) => a.id === 'corr:empresa:inscricaoMunicipal'));
  const r = await aplicarAchadoEmpresaMigrada(f.banco, d.cnpj, 'corr:empresa:inscricaoMunicipal', 'desfazer', 'contadora', workspaceValido);
  assert.match(r.mensagem, /Desfeito/);
  assert.equal(f.t.workspaces.get(d.cnpj)!.payload.empresa.inscricaoMunicipal, '\t2535939');
  await aplicarAchadoEmpresaMigrada(f.banco, d.cnpj, '', 'corrigir_todos', 'contadora', workspaceValido);
  assert.equal(f.t.workspaces.get(d.cnpj)!.payload.empresa.inscricaoMunicipal, '2535939');
  await assert.rejects(() => aplicarAchadoEmpresaMigrada(f.banco, d.cnpj, '', 'corrigir_todos', 'contadora', workspaceValido), /já estão aplicadas/);
  // "Manter como veio" num item de verificar fica guardado, inclusive depois de migrar de novo.
  const item = an!.achados.find((a) => a.situacao === 'pendente');
  assert.ok(item, JSON.stringify(an!.achados.map((a) => [a.id, a.situacao])));
  {
    await aplicarAchadoEmpresaMigrada(f.banco, d.cnpj, item.id, 'manter', 'contadora', workspaceValido);
    await gravarEmpresaMigrada(f.banco, d, quem, op);
    assert.equal((await analisarEmpresaMigrada(f.consultar, d.cnpj))!.achados.find((a) => a.id === item.id)!.situacao, 'mantido');
  }
});

test('servidor: "Decidir para todas" de um grupo (com os ids que a pessoa viu) e "Desfazer do grupo"; nada é apagado', async () => {
  const { analisarEmpresaMigrada, decidirGrupoEmpresaMigrada, desfazerGrupoEmpresaMigrada, lotesDaAnalise } = await import('../../src/server/migracaoSistemaAnterior/banco');
  const d = await montarDadosEmpresa(await abrir(), 23);
  const f = bancoFalso();
  const quem = { userId: 'u1', login: 'contadora', escritorioId: 'e1', tenantId: 'e1' };
  await gravarEmpresaMigrada(f.banco, d, quem, { modelo: planoContasModelo, validar: workspaceValido, competenciaAtual: '2026-11' });
  const an = (await analisarEmpresaMigrada(f.consultar, d.cnpj))!;
  const pend = an.achados.filter((a) => a.situacao === 'pendente' && (a.tipo === 'conferir' || a.tipo === 'verificar'));
  assert.ok(pend.length >= 1, 'há pendência para decidir');
  const ids = pend.map((a) => a.id);
  await assert.rejects(() => decidirGrupoEmpresaMigrada(f.banco, d.cnpj, [...ids, 'nao-existe'], 'manter', 'contadora', workspaceValido), /grupo mudou/);
  const r = await decidirGrupoEmpresaMigrada(f.banco, d.cnpj, ids, 'manter', 'contadora', workspaceValido);
  assert.equal(r.alteradas, ids.length);
  const depois = (await analisarEmpresaMigrada(f.consultar, d.cnpj))!.achados;
  assert.ok(ids.every((id) => depois.find((a) => a.id === id)?.situacao === 'mantido'));
  assert.equal((await lotesDaAnalise(f.consultar, d.cnpj))[0]?.quantidade, ids.length);
  const u = await desfazerGrupoEmpresaMigrada(f.banco, d.cnpj, r.lote, 'contadora', workspaceValido);
  assert.equal(u.desfeitas, ids.length);
  const volta = (await analisarEmpresaMigrada(f.consultar, d.cnpj))!.achados;
  assert.ok(ids.every((id) => volta.find((a) => a.id === id)?.situacao === 'pendente'), 'voltaram como estavam');
  assert.equal(volta.length, an.achados.length, 'nada apagado');
});
