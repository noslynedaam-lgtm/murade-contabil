// Backup agendado do escritório — núcleo comum aos três sistemas Murade (mesmo arquivo de teste no DP, Fiscal e Contábil).
// As regras puras (agenda, formato .murade, diferencial, retenção) rodam sempre. O serviço completo (gravar, conferir,
// nuvem, retenção, restauração, isolamento, robôs) roda contra um Postgres de teste em TEST_DATABASE_URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  configPadrao, escolherExecucao, instanteDeBrasilia, normalizarConfig, perfisDevidos, proximaOcorrencia, ultimaOcorrencia, validarPerfil, type PerfilBackup,
} from '../../src/server/backupAgendado/agenda';
import { abrirArquivo, cifrarSegredo, decifrarSegredo, lerCabecalho, nomeArquivo, selarArquivo, MAGIA, EXTENSAO } from '../../src/server/backupAgendado/formato';
import { hashLinha, lerConteudo, montarConteudo, reconstruir } from '../../src/server/backupAgendado/conteudo';
import { idsParaRemover } from '../../src/server/backupAgendado/retencao';
import { criarServicoBackupAgendado, type ClienteNuvem } from '../../src/server/backupAgendado/servico';
import { ferramentasBackupEscritorio } from '../../src/server/backupAgendado/agente';

const env = { MURADE_BACKUP_MASTER_KEY: 'b'.repeat(64) } as NodeJS.ProcessEnv;
const perfil = (p: Partial<PerfilBackup>): PerfilBackup => ({ id: 'p_aaaaaaaaaaaa', nome: 'x', tipo: 'completo', frequencia: 'diario', hora: '18:00', ativo: true, criadoEm: '2026-01-01T00:00:00.000Z', ...p });

// ===== Agenda =====

test('agenda: horário de Brasília vira o instante certo (UTC-3)', () => {
  assert.equal(instanteDeBrasilia(2026, 11, 20, 18, 0).toISOString(), '2026-11-20T21:00:00.000Z');
});

test('agenda: diário, semanal e mensal — última e próxima ocorrência', () => {
  const agora = new Date('2026-11-20T22:00:00Z'); // sexta 20/11 19h de Brasília
  assert.equal(ultimaOcorrencia(perfil({ hora: '18:00' }), agora).toISOString(), '2026-11-20T21:00:00.000Z');
  assert.equal(ultimaOcorrencia(perfil({ hora: '20:00' }), agora).toISOString(), '2026-11-19T23:00:00.000Z');
  assert.equal(proximaOcorrencia(perfil({ hora: '20:00' }), agora).toISOString(), '2026-11-20T23:00:00.000Z');
  // semanal: segunda (1) às 08:00 → última foi 16/11; próxima 23/11
  const seg = perfil({ frequencia: 'semanal', diaSemana: 1, hora: '08:00' });
  assert.equal(ultimaOcorrencia(seg, agora).toISOString(), '2026-11-16T11:00:00.000Z');
  assert.equal(proximaOcorrencia(seg, agora).toISOString(), '2026-11-23T11:00:00.000Z');
  // mensal dia 31: em novembro (30 dias) vale o dia 30
  const m31 = perfil({ frequencia: 'mensal', diaMes: 31, hora: '07:00' });
  assert.equal(ultimaOcorrencia(m31, agora).toISOString(), '2026-10-31T10:00:00.000Z');
  assert.equal(proximaOcorrencia(m31, agora).toISOString(), '2026-11-30T10:00:00.000Z');
});

test('agenda: devido só depois do horário, uma vez por ocorrência, e para após 3 falhas', () => {
  const p = perfil({ hora: '18:00' });
  const cfg = { perfis: [p] };
  assert.equal(perfisDevidos(cfg, [], new Date('2026-11-20T20:59:00Z')).length, 1); // ainda vale a de ontem
  const oc = '2026-11-20T21:00:00.000Z';
  const agora = new Date('2026-11-20T21:03:00Z');
  assert.equal(perfisDevidos(cfg, [{ perfilIds: [p.id], agendadoPara: '2026-11-19T21:00:00.000Z', status: 'ok' }], agora).length, 1);
  assert.equal(perfisDevidos(cfg, [{ perfilIds: [p.id], agendadoPara: oc, status: 'ok' }], agora).length, 0);
  assert.equal(perfisDevidos(cfg, [{ perfilIds: [p.id], agendadoPara: oc, status: 'executando' }], agora).length, 0);
  const falhas = Array.from({ length: 3 }, () => ({ perfilIds: [p.id], agendadoPara: oc, status: 'falha' as const }));
  assert.equal(perfisDevidos(cfg, falhas.slice(0, 2), agora).length, 1);
  assert.equal(perfisDevidos(cfg, falhas, agora).length, 0);
  // perfil criado depois da ocorrência não roda a ocorrência antiga
  assert.equal(perfisDevidos({ perfis: [perfil({ criadoEm: '2026-11-20T21:01:00Z' })] }, [], agora).length, 0);
  // pausado não roda
  assert.equal(perfisDevidos({ perfis: [perfil({ ativo: false })] }, [], agora).length, 0);
});

test('agenda: quando dois coincidem, vale o completo e um backup cobre os dois', () => {
  const a = perfil({ id: 'p_111111111111', tipo: 'alteracoes', hora: '18:00' });
  const b = perfil({ id: 'p_222222222222', tipo: 'completo', frequencia: 'semanal', diaSemana: 5, hora: '18:00' });
  const e = escolherExecucao(perfisDevidos({ perfis: [a, b] }, [], new Date('2026-11-20T21:05:00Z')))!;
  assert.equal(e.tipo, 'completo');
  assert.deepEqual(e.perfilIds.sort(), [a.id, b.id]);
  assert.equal(escolherExecucao(perfisDevidos({ perfis: [a] }, [], new Date('2026-11-20T21:05:00Z')))!.tipo, 'alteracoes');
  assert.equal(escolherExecucao([]), null);
});

test('agenda: validação de perfil e configuração', () => {
  assert.equal(validarPerfil({ frequencia: 'semanal', hora: '18:00' }).ok, false);
  assert.equal(validarPerfil({ frequencia: 'mensal', hora: '18:00', diaMes: 32 }).ok, false);
  assert.equal(validarPerfil({ frequencia: 'diario', hora: '25:00' }).ok, false);
  const v = validarPerfil({ frequencia: 'semanal', diaSemana: 5, hora: '19:00', tipo: 'completo' });
  assert.ok(v.ok && v.perfil.nome === 'Completo toda sexta-feira às 19:00' && /^p_[a-f0-9]{12}$/.test(v.perfil.id));
  const c = normalizarConfig({ retencaoCompletos: 99, email: { para: 'a@b.com.br; invalido; a@b.com.br', cc: ['c@d.com'] }, avisos: { usuarios: ['Ana@X.com'] } });
  assert.ok(c.ok);
  if (c.ok) {
    assert.equal(c.config.retencaoCompletos, 3); // fora da faixa → padrão
    assert.deepEqual(c.config.email.para, ['a@b.com.br']);
    assert.deepEqual(c.config.avisos.usuarios, ['ana@x.com']);
    assert.equal(c.config.validar, true);
  }
  assert.equal(normalizarConfig({ perfis: Array.from({ length: 11 }, () => ({ frequencia: 'diario', hora: '10:00' })) }).ok, false);
  assert.equal(configPadrao().validar, true);
});

// ===== Formato .murade =====

test('formato: arquivo próprio cifrado — abre só no mesmo sistema e escritório, e detecta alteração', () => {
  const conteudo = Buffer.from('conteudo de teste do zip');
  const { arquivo, cabecalho } = selarArquivo(conteudo, { sistema: 'dp', id: randomUUID(), tipo: 'completo', baseId: null, criadoEm: new Date().toISOString() }, 'esc-A', env);
  assert.ok(arquivo.subarray(0, 8).equals(MAGIA));
  assert.equal(arquivo.includes(conteudo), false, 'o conteúdo não aparece aberto no arquivo');
  assert.equal(lerCabecalho(arquivo).id, cabecalho.id);
  assert.deepEqual(abrirArquivo(arquivo, 'dp', 'esc-A', env).conteudo, conteudo);
  assert.throws(() => abrirArquivo(arquivo, 'dp', 'esc-B', env), /outro escritório/);
  assert.throws(() => abrirArquivo(arquivo, 'fiscal', 'esc-A', env), /Murade DP/);
  const alterado = Buffer.from(arquivo); alterado[alterado.length - 3] ^= 1;
  assert.throws(() => abrirArquivo(alterado, 'dp', 'esc-A', env), /alterado ou está corrompido/);
  const cab = Buffer.from(arquivo); cab[20] = cab[20] === 0x61 ? 0x62 : 0x61;
  assert.throws(() => abrirArquivo(cab, 'dp', 'esc-A', env));
  assert.throws(() => lerCabecalho(Buffer.from('PK\u0003\u0004qualquer zip')), /não é um backup do Murade/);
  assert.throws(() => abrirArquivo(arquivo, 'dp', 'esc-A', { MURADE_BACKUP_MASTER_KEY: 'c'.repeat(64) } as any), /corrompido/);
  assert.ok(nomeArquivo('dp', 'completo', new Date('2026-11-20T21:00:00Z'), 'abcdef12-0000').endsWith(EXTENSAO));
  assert.match(nomeArquivo('dp', 'completo', new Date('2026-11-20T21:00:00Z'), 'abcdef12-0000'), /^murade-dp-20261120-1800-completo-abcdef12\.murade$/);
});

test('formato: chaves da nuvem cifradas por escritório', () => {
  const s = cifrarSegredo('fiscal', 'esc-A', { chaveAcesso: 'AKIA', chaveSecreta: 'segredo-super' }, env);
  assert.equal(s.includes('segredo-super'), false);
  assert.deepEqual(decifrarSegredo('fiscal', 'esc-A', s, env), { chaveAcesso: 'AKIA', chaveSecreta: 'segredo-super' });
  assert.throws(() => decifrarSegredo('fiscal', 'esc-B', s, env));
});

// ===== Conteúdo e diferencial =====

test('conteúdo: completo + só alterações reconstroem exatamente o estado (inclui removidos e repetidos)', async () => {
  const base = { empresas: [{ cnpj: '1', nome: 'A' }, { cnpj: '2', nome: 'B' }, { cnpj: '2', nome: 'B' }], notas: [{ chave: 'x', valor: 10, em: new Date('2026-01-01T00:00:00Z') }] };
  const c = await montarConteudo(base, { sistema: 'dp', id: 'c1', geradoEm: 'g', base: null });
  const lidoC = await lerConteudo(c.zip, { sistema: 'dp', id: 'c1' });
  assert.deepEqual(lidoC.manifesto.tabelas, { empresas: 3, notas: 1 });
  const atual = { empresas: [{ cnpj: '1', nome: 'A alterada' }, { cnpj: '2', nome: 'B' }], notas: (async function* () { yield { chave: 'x', valor: 10, em: '2026-01-01T00:00:00.000Z' }; yield { chave: 'y', valor: 5 }; })() };
  const d = await montarConteudo(atual, { sistema: 'dp', id: 'd1', geradoEm: 'g', base: { id: 'c1', indice: c.indice } });
  const lidoD = await lerConteudo(d.zip, { sistema: 'dp', id: 'd1' });
  assert.deepEqual(lidoD.manifesto.alteracoes, { empresas: { incluidas: 1, removidas: 2 }, notas: { incluidas: 1, removidas: 0 } });
  assert.ok(d.zip.length < c.zip.length + 400);
  const r = reconstruir(lidoC, lidoD);
  const ordena = (l: any[]) => l.map((x) => hashLinha(x)).sort();
  assert.deepEqual(ordena(r.empresas), ordena([{ cnpj: '1', nome: 'A alterada' }, { cnpj: '2', nome: 'B' }]));
  assert.deepEqual(ordena(r.notas), ordena([{ chave: 'x', valor: 10, em: '2026-01-01T00:00:00.000Z' }, { chave: 'y', valor: 5 }]));
  assert.throws(() => reconstruir(lidoD, lidoD));
});

test('conteúdo: contagem adulterada é recusada na conferência', async () => {
  const c = await montarConteudo({ t: [{ a: 1 }] }, { sistema: 'dp', id: 'c1', geradoEm: 'g', base: null });
  const JSZip = (await import('jszip')).default;
  const z = await JSZip.loadAsync(c.zip);
  const m = JSON.parse(await z.file('manifesto.json')!.async('string')); m.tabelas.t = 2;
  z.file('manifesto.json', JSON.stringify(m));
  await assert.rejects(lerConteudo(await z.generateAsync({ type: 'nodebuffer' })), /não confere/);
});

// ===== Retenção =====

test('retenção: N completos + alterações da semana com base guardada + cópia de antes de restaurar', () => {
  const agora = new Date('2026-11-20T12:00:00Z');
  const dia = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();
  const itens = [
    { id: 'c0', tipo: 'completo' as const, status: 'ok' as const, iniciadoEm: dia(0.5), baseId: null, origem: 'agendado' },
    { id: 'c1', tipo: 'completo' as const, status: 'ok' as const, iniciadoEm: dia(7), baseId: null, origem: 'agendado' },
    { id: 'c2', tipo: 'completo' as const, status: 'ok' as const, iniciadoEm: dia(14), baseId: null, origem: 'agendado' },
    { id: 'c3', tipo: 'completo' as const, status: 'ok' as const, iniciadoEm: dia(21), baseId: null, origem: 'agendado' },
    { id: 'r1', tipo: 'completo' as const, status: 'ok' as const, iniciadoEm: dia(2), baseId: null, origem: 'antes_restaurar' },
    { id: 'a1', tipo: 'alteracoes' as const, status: 'ok' as const, iniciadoEm: dia(1), baseId: 'c1', origem: 'agendado' },
    { id: 'a2', tipo: 'alteracoes' as const, status: 'ok' as const, iniciadoEm: dia(9), baseId: 'c2', origem: 'agendado' },
    { id: 'a3', tipo: 'alteracoes' as const, status: 'ok' as const, iniciadoEm: dia(3), baseId: 'c3', origem: 'agendado' },
    { id: 'f1', tipo: 'completo' as const, status: 'falha' as const, iniciadoEm: dia(1), baseId: null, origem: 'agendado' },
    { id: 'x1', tipo: 'completo' as const, status: 'executando' as const, iniciadoEm: dia(0), baseId: null, origem: 'agendado' },
  ];
  assert.deepEqual(idsParaRemover(itens, 3, 7, agora).sort(), ['a2', 'a3', 'c3', 'f1']);
  assert.deepEqual(idsParaRemover(itens, 1, 7, agora).sort(), ['a1', 'a2', 'a3', 'c1', 'c2', 'c3', 'f1']);
});

// ===== Ferramentas da Agente =====

test('agente: agendar vira cartão com o texto certo e só grava depois de confirmar; só administrador', async () => {
  const [, agora, agendar] = ferramentasBackupEscritorio('/api/x/backup-agendado', 'Murade X') as any[];
  const chamadas: Array<[string, string, any]> = [];
  const ctx: any = { chamarApi: async (m: string, c: string, b: any) => { chamadas.push([m, c, b]); return { status: 200, corpo: { sucesso: true, voce: { administrador: true }, chaveConfigurada: true, perfil: { nome: 'Completo todo dia às 18:00' } } }; } };
  const p = await agendar.preparar(ctx, { frequencia: 'todo dia', hora: '18h' });
  assert.equal(p.titulo, 'Agendar backup completo todo dia às 18:00');
  assert.deepEqual(p.params, { frequencia: 'diario', hora: '18:00', diaSemana: undefined, diaMes: undefined, tipo: 'completo' });
  assert.equal(chamadas.some(([m]) => m === 'POST'), false);
  const s = await agendar.preparar(ctx, { frequencia: 'semanal', hora: '19:00', diaSemana: 'sexta', tipo: 'completo' });
  assert.match(s.titulo, /toda sexta às 19:00/);
  assert.match((await agendar.preparar(ctx, { frequencia: 'semanal', hora: '19:00' })).erro, /dia da semana/);
  const r = await agendar.executar(ctx, p.params);
  assert.equal(r.sucesso, true);
  assert.deepEqual(chamadas.filter(([m]) => m === 'POST').map(([, c]) => c), ['/api/x/backup-agendado/perfis']);
  const naoAdmin: any = { chamarApi: async () => ({ status: 200, corpo: { sucesso: true, voce: { administrador: false } } }) };
  assert.match((await agendar.preparar(naoAdmin, { frequencia: 'diario', hora: '18:00' })).erro, /administrador/);
  const pa = await agora.preparar(ctx, {});
  assert.match(pa.titulo, /completo agora/);
  const emAndamento: any = { chamarApi: async () => ({ status: 200, corpo: { sucesso: true, emAndamento: { desde: 'x' } } }) };
  assert.match((await agora.preparar(emAndamento, {})).erro, /andamento/);
});

// ===== Serviço completo (Postgres de teste) =====

const urlBanco = process.env.TEST_DATABASE_URL;

async function montarServico(opcoes: { agora?: () => Date; nuvem?: Map<string, Buffer>; nuvemFalha?: { v: boolean } } = {}) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: urlBanco });
  const consultar = (sql: string, params: unknown[] = []) => pool.query(sql, params) as any;
  const prefixo = `bkpteste_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  await consultar(`CREATE TABLE ${prefixo}_dados (tenant text NOT NULL, id text NOT NULL, valor text NOT NULL, PRIMARY KEY (tenant, id))`);
  const escritorios = [{ id: 'esc-A', login: 'a@a.com' }, { id: 'esc-B', login: 'b@b.com' }];
  const emails: Array<{ para: string; assunto: string; cc: string[] }> = [];
  const nuvem = opcoes.nuvem ?? new Map<string, Buffer>();
  const cliente = (): ClienteNuvem => ({
    async enviar(chave, corpo) { if (opcoes.nuvemFalha?.v) throw new Error('rede caiu'); nuvem.set(chave, Buffer.from(corpo)); },
    async tamanho(chave) { return nuvem.get(chave)?.length ?? null; },
    async apagar(chave) { nuvem.delete(chave); },
    async lerBuffer(chave) { const b = nuvem.get(chave); if (!b) throw new Error('não achei'); return b; },
  });
  const servico = criarServicoBackupAgendado({
    sistema: 'dp', nomeSistema: 'Murade Teste', prefixo, consultar, env, agora: opcoes.agora,
    async cnpjsDoEscritorio(t) { return t === 'esc-sem' ? [] : ['11111111000111']; },
    async coletar(t) { return { dados: (await consultar(`SELECT id, valor FROM ${prefixo}_dados WHERE tenant = $1 ORDER BY id`, [t])).rows }; },
    async escritorios() { return escritorios; },
    async usuarios() { return [{ login: 'a@a.com', administrador: true }]; },
    restauracao: {
      tabelas: [{ nome: 'dados', titulo: 'Dados', modo: 'sobrescrever' }],
      naoRestauradas: [],
      async executar(t, _c, tabelas, aplicar) {
        const atuais = new Map((await consultar(`SELECT id, valor FROM ${prefixo}_dados WHERE tenant = $1`, [t])).rows.map((r: any) => [r.id, r.valor]));
        const item = { nome: 'dados', titulo: 'Dados', modo: 'sobrescrever' as const, noBackup: tabelas.dados.length, iguais: 0, alterar: 0, recriar: 0, ficamComoEstao: 0 };
        for (const l of tabelas.dados) {
          const a = atuais.get(l.id);
          if (a === l.valor) { item.iguais++; continue; }
          if (a === undefined) item.recriar++; else item.alterar++;
          if (aplicar) await consultar(`INSERT INTO ${prefixo}_dados (tenant, id, valor) VALUES ($1,$2,$3) ON CONFLICT (tenant, id) DO UPDATE SET valor = EXCLUDED.valor`, [t, l.id, l.valor]);
        }
        item.ficamComoEstao = [...atuais.keys()].filter((k) => !tabelas.dados.some((l: any) => l.id === k)).length;
        return [item];
      },
    },
    email: { configurado: () => true, enviar: async (para, assunto, _t, cc) => { emails.push({ para, assunto, cc: cc || [] }); } },
    criarClienteNuvem: cliente,
  });
  const fim = async () => { for (const s of ['dados', 'bkp_agenda', 'bkp_execucoes', 'bkp_restauracoes']) await consultar(`DROP TABLE IF EXISTS ${prefixo}_${s}`); await pool.end(); };
  return { servico, consultar, prefixo, emails, nuvem, fim };
}

test('serviço: completo + só alterações, conferidos, isolados por escritório, com e-mail e nuvem', { skip: !urlBanco }, async () => {
  const s = await montarServico();
  try {
    await s.consultar(`INSERT INTO ${s.prefixo}_dados VALUES ('esc-A','1','um'),('esc-A','2','dois'),('esc-B','9','segredo-do-B')`);
    const cfg = await s.servico.salvarConfig('esc-A', { email: { aoConcluir: true, aoErrar: true, para: ['x@x.com', 'y@y.com'], cc: ['z@z.com'] } }, 'a@a.com');
    assert.ok(cfg.ok);
    const ok1 = await s.servico.salvarNuvem('esc-A', { endpoint: 'https://s3.exemplo.com', bucket: 'meu-bucket', regiao: 'us-east-1', pasta: 'murade', chaveAcesso: 'AKIA1234', chaveSecreta: 'segredo1234' }, 'a@a.com');
    assert.equal(ok1.ok, true, ok1.mensagem);
    assert.equal(ok1.nuvem!.chaveAcessoMascarada.includes('1234'), false);
    const r1 = await s.servico.executar('esc-A', { tipo: 'completo', origem: 'manual', usuario: 'a@a.com' });
    assert.ok(r1.ok);
    if (!r1.ok) return;
    assert.equal(r1.registro.validado, true);
    assert.equal(r1.registro.nuvem.status, 'enviado');
    assert.match(r1.registro.nomeArquivo!, /\.murade$/);
    assert.deepEqual(r1.registro.contagens, { dados: 2 });
    assert.equal(s.emails[0].para, 'x@x.com'); assert.deepEqual(s.emails[0].cc, ['y@y.com', 'z@z.com']);
    const arq = (await s.servico.arquivoDe('esc-A', r1.registro.id))!;
    assert.equal(arq.includes(Buffer.from('dois')), false);
    assert.equal(arq.includes(Buffer.from('segredo-do-B')), false);
    assert.equal(await s.servico.arquivoDe('esc-B', r1.registro.id), null, 'outro escritório não acha o arquivo');
    assert.equal((await s.servico.listarExecucoes('esc-B')).length, 0);
    assert.deepEqual([...s.nuvem.values()][0], arq);

    await s.consultar(`UPDATE ${s.prefixo}_dados SET valor = 'DOIS' WHERE tenant = 'esc-A' AND id = '2'`);
    await s.consultar(`INSERT INTO ${s.prefixo}_dados VALUES ('esc-A','3','tres')`);
    const r2 = await s.servico.executar('esc-A', { tipo: 'alteracoes', origem: 'agendado' });
    assert.ok(r2.ok && r2.registro.tipo === 'alteracoes' && r2.registro.baseId === r1.registro.id && r2.registro.validado);

    // Restaurar o "só alterações": prévia mostra o que muda; a confirmação exige o texto; antes guarda a cópia de segurança.
    await s.consultar(`UPDATE ${s.prefixo}_dados SET valor = 'estragado' WHERE tenant = 'esc-A'`);
    const pv = await s.servico.previaRestauracao('esc-A', 'a@a.com', { id: (r2 as any).registro.id });
    assert.deepEqual({ alterar: pv.itens[0].alterar, recriar: pv.itens[0].recriar }, { alterar: 3, recriar: 0 });
    assert.equal((await s.servico.confirmarRestauracao('esc-A', 'a@a.com', pv.token, 'sim')).ok, false);
    assert.equal((await s.servico.confirmarRestauracao('esc-B', 'b@b.com', pv.token, 'RESTAURAR')).ok, false, 'prévia de outro escritório não serve');
    const fim = await s.servico.confirmarRestauracao('esc-A', 'a@a.com', pv.token, 'RESTAURAR');
    assert.equal(fim.ok, true, (fim as any).motivo);
    const dados = (await s.consultar(`SELECT id, valor FROM ${s.prefixo}_dados WHERE tenant = 'esc-A' ORDER BY id`)).rows;
    assert.deepEqual(dados.map((d: any) => d.valor), ['um', 'DOIS', 'tres']);
    assert.equal((await s.consultar(`SELECT valor FROM ${s.prefixo}_dados WHERE tenant = 'esc-B'`)).rows[0].valor, 'segredo-do-B');
    const copia = (await s.servico.listarExecucoes('esc-A')).find((e) => e.origem === 'antes_restaurar');
    assert.ok(copia && copia.status === 'ok');
    // A prévia é de uso único.
    assert.equal((await s.servico.confirmarRestauracao('esc-A', 'a@a.com', pv.token, 'RESTAURAR')).ok, false);

    // Restaurar de um arquivo .murade do computador; arquivo de outro escritório é recusado.
    const pv2 = await s.servico.previaRestauracao('esc-A', 'a@a.com', { arquivo: arq });
    assert.equal(pv2.backup.origem, 'arquivo');
    await assert.rejects(s.servico.previaRestauracao('esc-B', 'b@b.com', { arquivo: arq }), /outro escritório/);

    const rel = await s.servico.relatorio('esc-A', '2000-01-01', '2999-12-31');
    assert.ok(rel.totais.feitos >= 3 && rel.restauracoes.length === 1);
    const resumo = await s.servico.resumo('esc-A');
    assert.equal(resumo.diasDesdeUltimo, 0);
  } finally { await s.fim(); }
});

test('serviço: robô agendado faz o devido, completo vence, falha de nuvem é reenviada, retenção e conferidor', { skip: !urlBanco }, async () => {
  let agora = new Date('2026-11-20T21:10:00Z'); // sexta 18:10 de Brasília
  const falha = { v: true };
  const s = await montarServico({ agora: () => agora, nuvemFalha: falha });
  try {
    await s.consultar(`INSERT INTO ${s.prefixo}_dados VALUES ('esc-A','1','um')`);
    const criado = '2026-11-01T00:00:00.000Z';
    await s.servico.salvarConfig('esc-A', { retencaoCompletos: 1, perfis: [
      { id: 'p_aaaaaaaaaaa1', tipo: 'alteracoes', frequencia: 'diario', hora: '18:00', criadoEm: criado },
      { id: 'p_aaaaaaaaaaa2', tipo: 'completo', frequencia: 'semanal', diaSemana: 5, hora: '18:00', criadoEm: criado },
    ] }, 'a@a.com');
    falha.v = false;
    await s.servico.salvarNuvem('esc-A', { endpoint: 'https://s3.exemplo.com', bucket: 'meu-bucket', regiao: 'us-east-1', chaveAcesso: 'AKIA1234', chaveSecreta: 'segredo1234' }, 'a@a.com');
    falha.v = true;
    const r = await s.servico.rodadaExecutor();
    assert.equal(r.feitos, 1);
    let lista = await s.servico.listarExecucoes('esc-A');
    assert.equal(lista[0].tipo, 'completo');
    assert.deepEqual(lista[0].perfilIds.sort(), ['p_aaaaaaaaaaa1', 'p_aaaaaaaaaaa2']);
    assert.equal(lista[0].nuvem.status, 'falha');
    assert.equal((await s.servico.rodadaExecutor()).feitos, 0, 'não repete a mesma ocorrência');
    // Conferidor: nuvem voltou → reenvia sozinho.
    falha.v = false;
    agora = new Date('2026-11-20T22:30:00Z');
    const c = await s.servico.rodadaConferidor();
    assert.equal(c.problemas, 0, c.resumo);
    lista = await s.servico.listarExecucoes('esc-A');
    assert.equal(lista[0].nuvem.status, 'enviado');
    // Dia seguinte: só alterações (com base). Retenção 1 completo: depois de outro completo, o antigo sai (servidor e nuvem).
    agora = new Date('2026-11-21T21:05:00Z');
    await s.servico.rodadaExecutor();
    lista = await s.servico.listarExecucoes('esc-A');
    assert.equal(lista[0].tipo, 'alteracoes');
    agora = new Date('2026-11-27T21:05:00Z');
    await s.servico.rodadaExecutor();
    lista = await s.servico.listarExecucoes('esc-A');
    const completos = lista.filter((e) => e.tipo === 'completo' && e.temArquivo);
    assert.equal(completos.length, 1);
    assert.equal(lista.find((e) => e.id === lista[lista.length - 1].id)!.temArquivo, false);
    assert.ok(lista.every((e) => e.tipo !== 'alteracoes' || !e.temArquivo || e.baseId === completos[0].id));
    // Aviso de entrar: com backup de hoje não mostra; sem backup há 10 dias, mostra.
    assert.equal((await s.servico.aviso('esc-A', 'a@a.com', 'entrar')).mostrar, false);
    agora = new Date('2026-12-08T12:00:00Z');
    const av = await s.servico.aviso('esc-A', 'a@a.com', 'entrar');
    assert.equal(av.mostrar, true);
    assert.match((av as any).texto, /há 10 dia/);
    assert.equal((await s.servico.aviso('esc-A', 'a@a.com', 'sair')).mostrar, false, 'aviso ao sair vem desligado por padrão');
    // Escritório sem empresa não gera backup.
    assert.equal((await s.servico.executar('esc-sem', { tipo: 'completo', origem: 'manual' })).ok, false);
  } finally { await s.fim(); }
});

test('serviço: sem a chave mestra não gera e diz o motivo', { skip: !urlBanco }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: urlBanco });
  try {
    const servico = criarServicoBackupAgendado({ sistema: 'dp', nomeSistema: 'X', prefixo: `bkpteste_${randomUUID().replace(/-/g, '').slice(0, 10)}`, consultar: (q, p) => pool.query(q, p as any[]) as any, env: {} as any,
      cnpjsDoEscritorio: async () => ['1'], coletar: async () => ({}), escritorios: async () => [], usuarios: async () => [], restauracao: { tabelas: [], naoRestauradas: [], executar: async () => [] } });
    const r = await servico.executar('esc', { tipo: 'completo', origem: 'manual' });
    assert.equal(r.ok, false);
    assert.match((r as any).motivo, /MURADE_BACKUP_MASTER_KEY/);
  } finally { await pool.end(); }
});
