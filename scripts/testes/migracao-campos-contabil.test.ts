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
    if (s.startsWith('DELETE FROM contabil_sistema_anterior')) { t.registro = t.registro.filter((r) => r.cnpj !== p[0]); return { rows: [] }; }
    if (s.startsWith('INSERT INTO contabil_sistema_anterior')) { t.registro.push({ cnpj: p[0], bloco: p[1], linhas: JSON.parse(String(p[2])), quantidade: p[3], migrado_em: new Date() }); return { rows: [] }; }
    if (s.startsWith('SELECT bloco, quantidade, migrado_em')) return { rows: t.registro.filter((r) => r.cnpj === p[0]).map((r) => ({ ...r, resumo: r.bloco === p[1] ? r.linhas : null })) };
    if (s.startsWith('SELECT bloco, linhas FROM contabil_sistema_anterior')) return { rows: t.registro.filter((r) => r.cnpj === p[0] && (p[1] as string[]).includes(r.bloco)) };
    if (s.startsWith('SELECT cnpj FROM contabil_sistema_anterior')) return { rows: [...new Set(t.registro.filter((r) => r.bloco === p[0]).map((r) => r.cnpj))].map((cnpj) => ({ cnpj })) };
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
  // A equipe (ou algo) apagou o NIRE no Murade: o robô avisa.
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
