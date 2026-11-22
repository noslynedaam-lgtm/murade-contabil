import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { criarCifrador, criarDecifrador } from '../../src/server/backupBanco/cripto';
import { assinarSigV4, ClienteS3 } from '../../src/server/backupBanco/s3';
import { criarServicoBackupBanco, dataDoObjeto, diaBrasilia, escolherParaApagar, lerConfigBackup, nomeDoObjeto } from '../../src/server/backupBanco/servico';
import { analisarDump, restaurarDump } from '../../src/server/backupBanco/dump';

const CHAVE = 'chave-de-teste-bem-longa-123';

async function coletar(r: Readable): Promise<Buffer> { const p: Buffer[] = []; for await (const c of r) p.push(c as Buffer); return Buffer.concat(p); }
async function cifrar(dados: Buffer, chave = CHAVE): Promise<Buffer> { return coletar(Readable.from([dados]).pipe(criarCifrador(chave))); }

test('SigV4 bate com o exemplo oficial da AWS (GET Object com Range)', () => {
  const r = assinarSigV4({
    metodo: 'GET', host: 'examplebucket.s3.amazonaws.com', caminho: '/test.txt', cabecalhos: { Range: 'bytes=0-9' },
    hashCorpo: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', agora: new Date('2013-05-24T00:00:00Z'),
  });
  assert.match(r.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(r.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/);
});

test('SigV4 bate com o exemplo oficial da AWS (listagem com parâmetros)', () => {
  const r = assinarSigV4({
    metodo: 'GET', host: 'examplebucket.s3.amazonaws.com', caminho: '/', consulta: { 'max-keys': '2', prefix: 'J' },
    hashCorpo: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', agora: new Date('2013-05-24T00:00:00Z'),
  });
  assert.match(r.authorization, /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
});

test('criptografia: ida e volta com vários blocos; chave errada, adulteração e corte são detectados', async () => {
  const original = randomBytes(2_500_000);
  const cifrado = await cifrar(original);
  assert.ok(!cifrado.includes(original.subarray(0, 64)));
  assert.deepEqual(await coletar(Readable.from([cifrado]).pipe(criarDecifrador(CHAVE))), original);
  await assert.rejects(coletar(Readable.from([cifrado]).pipe(criarDecifrador('outra-chave-bem-comprida-9'))), /chave está errada|alterado/);
  const adulterado = Buffer.from(cifrado); adulterado[adulterado.length - 40] ^= 1;
  await assert.rejects(coletar(Readable.from([adulterado]).pipe(criarDecifrador(CHAVE))), /alterado|corrompido/);
  // corta exatamente no fim de um bloco (1 MB cifrado = 4 + 1048576 + 16 bytes após o cabeçalho de 20)
  const corte = cifrado.subarray(0, 20 + 4 + 1048576 + 16);
  await assert.rejects(coletar(Readable.from([corte]).pipe(criarDecifrador(CHAVE))), /cortado|incompleto/);
  await assert.rejects(coletar(Readable.from([cifrado.subarray(0, 100)]).pipe(criarDecifrador(CHAVE))), /cortado|incompleto|corrompido/);
  // fluxo em pedaços pequenos
  const miudo = Readable.from((function* () { for (let i = 0; i < cifrado.length; i += 777) yield cifrado.subarray(i, i + 777); })());
  assert.deepEqual(await coletar(miudo.pipe(criarDecifrador(CHAVE))), original);
});

test('criptografia: arquivo vazio e chave curta', async () => {
  const c = await cifrar(Buffer.alloc(0));
  assert.equal((await coletar(Readable.from([c]).pipe(criarDecifrador(CHAVE)))).length, 0);
  assert.throws(() => criarCifrador('curta'), /ao menos 16/);
});

test('configuração: desligado por padrão, lista o que falta e nunca aceita chave curta nem http', () => {
  const vazio = lerConfigBackup({});
  assert.equal(vazio.configurado, false);
  assert.equal(vazio.faltando.length, 6);
  const completo = { MURADE_BACKUP_CHAVE: CHAVE, MURADE_BACKUP_S3_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', MURADE_BACKUP_S3_BUCKET: 'b', MURADE_BACKUP_S3_ACCESS_KEY: 'k', MURADE_BACKUP_S3_SECRET_KEY: 's', MURADE_BACKUP_S3_REGION: 'us-west-004' };
  assert.equal(lerConfigBackup(completo).configurado, true);
  assert.equal(lerConfigBackup({ ...completo, MURADE_BACKUP_CHAVE: 'curta' }).configurado, false);
  assert.equal(lerConfigBackup({ ...completo, MURADE_BACKUP_S3_ENDPOINT: 'http://exemplo.com' }).configurado, false);
  assert.equal(lerConfigBackup({ ...completo, MURADE_BACKUP_S3_SECRET_KEY: '' }).faltando[0].variavel, 'MURADE_BACKUP_S3_SECRET_KEY');
});

test('retenção: 7 diários, 4 semanais, 12 mensais, só do próprio prefixo e nunca apaga o mais novo', () => {
  const objetos: { chave: string }[] = [];
  const hoje = new Date('2026-11-17T06:00:00Z');
  for (let i = 0; i < 400; i++) objetos.push({ chave: nomeDoObjeto('dp/', new Date(hoje.getTime() - i * 86400_000)) });
  objetos.push({ chave: 'dp/outro-arquivo.txt' }, { chave: 'contabil/banco-20200101T060000Z.mbk' }, { chave: 'dp/banco-20260101T060000Z.mbk.json' });
  const apagar = escolherParaApagar('dp/', objetos);
  const mantidos = objetos.filter((o) => dataDoObjeto('dp/', o.chave) && !apagar.includes(o.chave));
  assert.ok(!apagar.includes(nomeDoObjeto('dp/', hoje)));
  assert.ok(apagar.every((c) => dataDoObjeto('dp/', c)), 'só apaga arquivos com o nome dos nossos backups');
  assert.ok(!apagar.includes('contabil/banco-20200101T060000Z.mbk') && !apagar.includes('dp/outro-arquivo.txt'));
  const dias = new Set(mantidos.map((o) => diaBrasilia(dataDoObjeto('dp/', o.chave)!)));
  for (let i = 0; i < 7; i++) assert.ok(dias.has(diaBrasilia(new Date(hoje.getTime() - i * 86400_000))), `dia ${i} mantido`);
  assert.ok(mantidos.length >= 12 && mantidos.length <= 7 + 4 + 12, `mantidos: ${mantidos.length}`);
  assert.deepEqual(escolherParaApagar('dp/', [{ chave: nomeDoObjeto('dp/', hoje) }]), []);
});

// ---- S3 falso em memória ------------------------------------------------------------------------------------------------
function servidorS3Falso(bucket = 'meu-bucket', opcoes: { falharEm?: (metodo: string, url: URL) => number | null } = {}) {
  const objetos = new Map<string, Buffer>();
  const envios = new Map<string, Map<number, Buffer>>();
  const chamadas: string[] = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const corpo = await coletar(req);
    chamadas.push(`${req.method} ${url.pathname}${url.search}`);
    const auth = String(req.headers.authorization || '');
    if (!/^AWS4-HMAC-SHA256 Credential=ACESSO\/\d{8}\/regiao\/s3\/aws4_request, SignedHeaders=.*Signature=[0-9a-f]{64}$/.test(auth)) { res.statusCode = 403; return res.end('<Error><Code>SignatureDoesNotMatch</Code><Message>assinatura</Message></Error>'); }
    if (req.headers['x-amz-content-sha256'] !== createHash('sha256').update(corpo).digest('hex')) { res.statusCode = 400; return res.end('<Error><Code>XAmzContentSHA256Mismatch</Code></Error>'); }
    const falha = opcoes.falharEm?.(String(req.method), url);
    if (falha) { res.statusCode = falha; return res.end(`<Error><Code>Falha</Code><Message>ACESSO SEGREDO-S3</Message></Error>`); }
    const prefixo = `/${bucket}/`;
    if (url.pathname === `/${bucket}/` && url.searchParams.get('list-type') === '2') {
      const p = url.searchParams.get('prefix') || '';
      const itens = [...objetos.keys()].filter((k) => k.startsWith(p)).sort();
      res.setHeader('content-type', 'application/xml');
      return res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${itens.map((k) => `<Contents><Key>${k.replace(/&/g, '&amp;')}</Key><LastModified>2026-11-17T06:00:00.000Z</LastModified><Size>${objetos.get(k)!.length}</Size></Contents>`).join('')}</ListBucketResult>`);
    }
    if (!url.pathname.startsWith(prefixo)) { res.statusCode = 404; return res.end('<Error><Code>NoSuchBucket</Code></Error>'); }
    const chave = decodeURIComponent(url.pathname.slice(prefixo.length));
    if (req.method === 'POST' && url.searchParams.has('uploads')) { const id = 'up' + envios.size; envios.set(id, new Map()); return res.end(`<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`); }
    if (req.method === 'PUT' && url.searchParams.has('uploadId')) { envios.get(url.searchParams.get('uploadId')!)!.set(Number(url.searchParams.get('partNumber')), corpo); res.setHeader('etag', `"e${url.searchParams.get('partNumber')}"`); return res.end(); }
    if (req.method === 'POST' && url.searchParams.has('uploadId')) {
      const partes = envios.get(url.searchParams.get('uploadId')!)!;
      objetos.set(chave, Buffer.concat([...partes.keys()].sort((a, b) => a - b).map((n) => partes.get(n)!)));
      envios.delete(url.searchParams.get('uploadId')!);
      return res.end('<CompleteMultipartUploadResult><Key>x</Key></CompleteMultipartUploadResult>');
    }
    if (req.method === 'DELETE' && url.searchParams.has('uploadId')) { envios.delete(url.searchParams.get('uploadId')!); res.statusCode = 204; return res.end(); }
    if (req.method === 'PUT') { objetos.set(chave, corpo); return res.end(); }
    if (req.method === 'DELETE') { objetos.delete(chave); res.statusCode = 204; return res.end(); }
    if (req.method === 'HEAD' || req.method === 'GET') {
      const o = objetos.get(chave);
      if (!o) { res.statusCode = 404; return res.end(req.method === 'GET' ? '<Error><Code>NoSuchKey</Code></Error>' : undefined); }
      res.setHeader('content-length', String(o.length));
      return res.end(req.method === 'GET' ? o : undefined);
    }
    res.statusCode = 405; res.end();
  });
  return new Promise<{ url: string; objetos: Map<string, Buffer>; envios: Map<string, Map<number, Buffer>>; chamadas: string[]; fechar: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as any).port}`, objetos, envios, chamadas, fechar: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) }));
  });
}
const envS3 = (url: string, extra: Record<string, string> = {}) => ({ MURADE_BACKUP_CHAVE: CHAVE, MURADE_BACKUP_S3_ENDPOINT: url, MURADE_BACKUP_S3_BUCKET: 'meu-bucket', MURADE_BACKUP_S3_ACCESS_KEY: 'ACESSO', MURADE_BACKUP_S3_SECRET_KEY: 'SEGREDO-S3', MURADE_BACKUP_S3_REGION: 'regiao', ...extra });

test('S3: objeto pequeno vai inteiro; grande vai em partes de 8 MB com tamanho e SHA-256 corretos; erro não vaza segredo', async () => {
  const s3f = await servidorS3Falso();
  try {
    const c = new ClienteS3({ endpoint: s3f.url, bucket: 'meu-bucket', accessKey: 'ACESSO', secretKey: 'SEGREDO-S3', region: 'regiao' });
    const pequeno = randomBytes(1000);
    const r1 = await c.enviarFluxo('dp/a b+c.mbk', Readable.from([pequeno]));
    assert.equal(r1.tamanho, 1000); assert.deepEqual(s3f.objetos.get('dp/a b+c.mbk'), pequeno);
    const grande = randomBytes(8 * 1024 * 1024 * 2 + 12345);
    const r2 = await c.enviarFluxo('dp/grande.mbk', Readable.from((function* () { for (let i = 0; i < grande.length; i += 300_000) yield grande.subarray(i, i + 300_000); })()));
    assert.equal(r2.sha256, createHash('sha256').update(grande).digest('hex'));
    assert.deepEqual(s3f.objetos.get('dp/grande.mbk'), grande);
    assert.equal(s3f.chamadas.filter((x) => x.includes('partNumber=')).length, 3);
    assert.equal(await c.tamanho('dp/grande.mbk'), grande.length);
    assert.equal(await c.tamanho('dp/nao-existe'), null);
    assert.deepEqual((await c.listar('dp/')).map((o) => o.chave).sort(), ['dp/a b+c.mbk', 'dp/grande.mbk']);
    await c.apagar('dp/grande.mbk'); assert.equal(s3f.objetos.has('dp/grande.mbk'), false);
  } finally { await s3f.fechar(); }
  const ruim = await servidorS3Falso('meu-bucket', { falharEm: () => 403 });
  try {
    const c = new ClienteS3({ endpoint: ruim.url, bucket: 'meu-bucket', accessKey: 'ACESSO', secretKey: 'SEGREDO-S3', region: 'regiao' });
    await assert.rejects(c.enviar('dp/x', Buffer.from('1')), (e: Error) => { assert.ok(!/SEGREDO-S3|ACESSO/.test(e.message), e.message); assert.match(e.message, /HTTP 403/); return true; });
  } finally { await ruim.fechar(); }
});

test('S3: erro temporário (503) tenta de novo e passa', async () => {
  let n = 0;
  const s3f = await servidorS3Falso('meu-bucket', { falharEm: (m) => (m === 'PUT' && n++ < 2 ? 503 : null) });
  try {
    const c = new ClienteS3({ endpoint: s3f.url, bucket: 'meu-bucket', accessKey: 'ACESSO', secretKey: 'SEGREDO-S3', region: 'regiao' }, fetch, () => new Date(), async () => undefined);
    await c.enviar('dp/x', Buffer.from('ok'));
    assert.equal(s3f.objetos.get('dp/x')!.toString(), 'ok'); assert.equal(n, 3);
  } finally { await s3f.fechar(); }
});

// ---- Banco de verdade (PostgreSQL) -----------------------------------------------------------------------------------------
const ADMIN = process.env.MURADE_TESTE_PG_URL;
const comPg = ADMIN ? test : test.skip;

async function criarBanco(nome: string): Promise<string> {
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${nome}`); await admin.query(`CREATE DATABASE ${nome}`); await admin.end();
  return ADMIN!.replace(/\/[^/]*$/, `/${nome}`);
}
async function fotoDoBanco(url: string): Promise<Record<string, string>> {
  const c = new pg.Client({ connectionString: url }); await c.connect();
  const tabelas = (await c.query(`SELECT schemaname||'.'||tablename AS t FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1`)).rows.map((r) => r.t);
  const out: Record<string, string> = {};
  for (const t of tabelas) { const [e, n] = t.split('.'); out[t] = createHash('sha256').update((await c.query(`SELECT coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY to_jsonb(x)::text), '') AS s FROM "${e}"."${n}" x`)).rows[0].s).digest('hex'); }
  await c.end(); return out;
}

comPg('banco real: backup cifrado, validação, restauração em banco novo idêntico e origem intacta', async () => {
  const urlOrigem = await criarBanco('mbk_origem'); const urlDestino = await criarBanco('mbk_destino');
  const o = new pg.Pool({ connectionString: urlOrigem });
  await o.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA extra;
    CREATE TABLE empresas (id SERIAL PRIMARY KEY, cnpj TEXT NOT NULL UNIQUE, nome TEXT, valor NUMERIC(20,6), criado TIMESTAMPTZ DEFAULT now(), dados JSONB, anexo BYTEA, tags TEXT[], ativo BOOLEAN DEFAULT true);
    CREATE TABLE extra.itens (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, empresa_id INT NOT NULL REFERENCES empresas(id), texto TEXT, dobro INT GENERATED ALWAYS AS (empresa_id * 2) STORED, CONSTRAINT texto_ok CHECK (length(texto) < 100000));
    CREATE INDEX itens_texto_idx ON extra.itens (texto);
    CREATE TABLE vazia (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE "Tabela Estranha" ("Coluna 1" TEXT, "tab	e'aspas" TEXT);
    CREATE FUNCTION barra() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'imutavel'; END $$;
    CREATE TABLE historico (id SERIAL PRIMARY KEY, msg TEXT);
    CREATE TRIGGER historico_imutavel BEFORE UPDATE OR DELETE ON historico FOR EACH ROW EXECUTE FUNCTION barra();
  `);
  for (let i = 1; i <= 350; i++) {
    await o.query(`INSERT INTO empresas (cnpj, nome, valor, dados, anexo, tags) VALUES ($1,$2,$3,$4,$5,$6)`, [String(i).padStart(14, '0'), i % 7 === 0 ? null : `Empresa "${i}"\n com\ttab e acentuação çãõ ✓`, `${i}.123456`, JSON.stringify({ n: i, grande: 12345678901234567890, lista: [1, 2, { a: null }] }), randomBytes(50 + (i % 40)), ['a', 'b,c', `x${i}`]]);
    await o.query(`INSERT INTO extra.itens (empresa_id, texto) VALUES ($1,$2)`, [i, `item ${i} \\ barra`]);
  }
  await o.query(`INSERT INTO "Tabela Estranha" VALUES ('a','b'), (NULL, 'c')`);
  await o.query(`INSERT INTO historico (msg) VALUES ('a'),('b')`);
  const antes = await fotoDoBanco(urlOrigem);

  const s3f = await servidorS3Falso();
  try {
    const svc = criarServicoBackupBanco({ sistema: 'dp', nomeSistema: 'Murad DP', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: envS3(s3f.url) });
    // duas execuções ao mesmo tempo: só uma roda
    const [a, b] = await Promise.all([svc.executar('manual'), svc.executar('manual')]);
    const feitas = [a, b].filter((r) => r.ok); const barradas = [a, b].filter((r) => !r.ok);
    assert.equal(feitas.length, 1, JSON.stringify([a, b])); assert.equal(barradas[0].codigo, 'ja_rodando');
    assert.equal(feitas[0].tabelas, 6); // empresas, itens, vazia, Tabela Estranha, historico e o registro de backups
    const objeto = feitas[0].objeto!;
    assert.match(objeto, /^dp\/banco-\d{8}T\d{6}Z\.mbk$/);
    assert.ok(s3f.objetos.has(objeto) && s3f.objetos.has(`${objeto}.json`));
    const bruto = s3f.objetos.get(objeto)!;
    assert.ok(!bruto.includes(Buffer.from('Empresa')) && !bruto.includes(Buffer.from('pgcrypto')), 'nada legível no arquivo enviado');
    // nenhum segredo no manifesto
    assert.ok(!s3f.objetos.get(`${objeto}.json`)!.toString().includes('SEGREDO-S3'));

    const v = await svc.validar();
    assert.equal(v.ok, true, JSON.stringify(v)); assert.equal(v.linhas, feitas[0].linhas);
    // chave errada
    const svcErrado = criarServicoBackupBanco({ sistema: 'dp', nomeSistema: 'x', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: envS3(s3f.url, { MURADE_BACKUP_CHAVE: 'uma-chave-totalmente-diferente' }) });
    assert.equal((await svcErrado.validar()).ok, false);
    // arquivo adulterado no destino
    const adulterado = Buffer.from(bruto); adulterado[adulterado.length - 30] ^= 255; s3f.objetos.set(objeto, adulterado);
    const vr = await svc.validar(objeto); assert.equal(vr.ok, false); assert.match(vr.mensagem, /problema|conferir/);
    s3f.objetos.set(objeto, bruto);

    // restauração em banco vazio
    const { fluxo } = await new ClienteS3({ endpoint: s3f.url, bucket: 'meu-bucket', accessKey: 'ACESSO', secretKey: 'SEGREDO-S3', region: 'regiao' }).ler(objeto);
    const d = new pg.Client({ connectionString: urlDestino }); await d.connect();
    const plano = fluxo.pipe(criarDecifrador(CHAVE)).pipe(createGunzip());
    const rest = await restaurarDump(d, plano);
    assert.equal(rest.totalLinhas, v.linhas);
    // sequências continuam de onde pararam; identidade também
    await d.query(`INSERT INTO empresas (cnpj) VALUES ('99999999999999')`);
    assert.equal((await d.query(`SELECT max(id)::int AS m FROM empresas`)).rows[0].m, 351);
    await d.query(`INSERT INTO extra.itens (empresa_id, texto) VALUES (1,'novo')`);
    assert.equal((await d.query(`SELECT dobro FROM extra.itens WHERE texto='novo'`)).rows[0].dobro, 2);
    await assert.rejects(d.query(`DELETE FROM historico`), /imutavel/);
    await assert.rejects(d.query(`INSERT INTO extra.itens (empresa_id, texto) VALUES (99999,'sem pai')`), /foreign key|viola/i);
    await d.query(`DELETE FROM empresas WHERE cnpj='99999999999999'`); await d.query(`DELETE FROM extra.itens WHERE texto='novo'`);
    await d.end();
    const depois = await fotoDoBanco(urlDestino);
    for (const t of Object.keys(antes)) if (t !== 'public.murade_backup_banco_log') assert.equal(depois[t], antes[t], `tabela ${t} idêntica`);
    // origem intacta: nada além do registro de backup mudou
    const apos = await fotoDoBanco(urlOrigem);
    for (const t of Object.keys(antes)) if (t !== 'public.murade_backup_banco_log') assert.equal(apos[t], antes[t], `origem ${t} intacta`);

    // painel: status e alerta
    const st: any = await svc.status();
    assert.equal(st.configurado, true); assert.equal(st.ultimoSucesso.resultado, 'ok'); assert.equal(st.alerta, null);
    assert.ok(!JSON.stringify(st).includes('SEGREDO-S3') && !JSON.stringify(st).includes(CHAVE));
    assert.equal((await svc.listar()).length, 1);
    // restauração recusa banco com algo dentro (checagem de objetos feita pelo script)
  } finally { await s3f.fechar(); await o.end(); }
});

comPg('banco real: falha no destino vira falha registrada, sem vazar segredo, e libera a trava', async () => {
  const urlOrigem = await criarBanco('mbk_falha');
  const o = new pg.Pool({ connectionString: urlOrigem });
  await o.query(`CREATE TABLE t (id int primary key)`);
  const s3f = await servidorS3Falso('meu-bucket', { falharEm: (m) => (m === 'PUT' ? 403 : null) });
  try {
    const svc = criarServicoBackupBanco({ sistema: 'contabil', nomeSistema: 'Murad Contábil', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: envS3(s3f.url) });
    const r = await svc.executar('automatico');
    assert.equal(r.ok, false); assert.equal(r.codigo, 'falha'); assert.ok(!/SEGREDO-S3|ACESSO/.test(r.motivo || ''), r.motivo);
    const st: any = await svc.status();
    assert.equal(st.ultimo.resultado, 'falha'); assert.ok(!JSON.stringify(st).includes('SEGREDO-S3'));
    // a trava foi solta: nova tentativa roda (e falha pelo mesmo motivo, não por "já rodando")
    assert.equal((await svc.executar('manual')).codigo, 'falha');
    // sem configuração: nada é enviado
    const sem = criarServicoBackupBanco({ sistema: 'contabil', nomeSistema: 'x', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: {} });
    const r2 = await sem.executar('manual'); assert.equal(r2.codigo, 'sem_configuracao');
    const rr = await sem.rodadaDoRobo(); assert.match(rr.resumo, /falta configurar o destino/); assert.equal(rr.alerta?.nivel, 'aviso');
  } finally { await s3f.fechar(); await o.end(); }
});

comPg('robô: só roda depois das 3h de Brasília, uma vez por dia, e alerta passando de 26 h', async () => {
  const urlOrigem = await criarBanco('mbk_robo');
  const o = new pg.Pool({ connectionString: urlOrigem });
  await o.query(`CREATE TABLE t (id int primary key); INSERT INTO t VALUES (1)`);
  const s3f = await servidorS3Falso();
  let agora = new Date('2026-11-17T05:00:00Z'); // 02h em Brasília
  try {
    const svc = criarServicoBackupBanco({ sistema: 'dp', nomeSistema: 'Murad DP', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: envS3(s3f.url), agora: () => agora });
    let r = await svc.rodadaDoRobo(); assert.match(r.resumo, /Aguardando o horário/); assert.equal(s3f.objetos.size, 0);
    agora = new Date('2026-11-17T06:10:00Z'); // 03h10
    r = await svc.rodadaDoRobo(); assert.match(r.resumo, /Backup do banco concluído/); assert.equal([...s3f.objetos.keys()].filter((k) => k.endsWith('.mbk')).length, 1);
    agora = new Date('2026-11-17T09:00:00Z');
    r = await svc.rodadaDoRobo(); assert.match(r.resumo, /Em dia/); assert.equal([...s3f.objetos.keys()].filter((k) => k.endsWith('.mbk')).length, 1);
    assert.equal(r.alerta, null);
    agora = new Date('2026-11-18T09:30:00Z'); // 27 h depois do backup, antes do robô rodar de novo? (já passou das 3h: ele roda)
    const st1: any = await svc.status(); assert.equal(st1.alerta.nivel, 'critico'); assert.match(st1.alerta.texto, /sem backup/);
    r = await svc.rodadaDoRobo(); assert.equal([...s3f.objetos.keys()].filter((k) => k.endsWith('.mbk')).length, 2);
    assert.equal(((await svc.status()) as any).alerta, null);
  } finally { await s3f.fechar(); await o.end(); }
});

test('analisarDump aponta contagem que não bate com o rodapé', async () => {
  const bom = ['H\t{"formato":"murade-backup-banco/1","sistema":"dp"}', 'T\t{"tabela":"public.a","colunas":["x"]}', 'D\tpublic.a\t{"x":1}', 'F\t{"tabelas":{"public.a":1},"totalLinhas":1}'];
  assert.deepEqual((await analisarDump(Readable.from([Buffer.from(bom.join('\n') + '\n')]))).problemas, []);
  const ruim = [bom[0], bom[1], bom[2], bom[2], bom[3]];
  assert.ok((await analisarDump(Readable.from([Buffer.from(ruim.join('\n') + '\n')]))).problemas.length >= 1);
  assert.ok((await analisarDump(Readable.from([Buffer.from(bom.slice(0, 3).join('\n') + '\n')]))).problemas.some((p) => /rodapé/.test(p)));
});
void pipeline;

comPg('restauração: só em banco vazio e diferente do sistema, com confirmação; falha deixa o banco vazio', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { restaurarBackup } = await import('../../src/server/backupBanco/restaurar');
  const urlOrigem = await criarBanco('mbk_r_origem');
  const o = new pg.Pool({ connectionString: urlOrigem });
  await o.query(`CREATE TABLE t (id int primary key, nome text); INSERT INTO t VALUES (1,'a'),(2,'b')`);
  const s3f = await servidorS3Falso();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbk-'));
  try {
    const svc = criarServicoBackupBanco({ sistema: 'contabil', nomeSistema: 'x', consulta: (sql, p) => o.query(sql, p as any[]), conexaoBanco: () => ({ connectionString: urlOrigem }), env: envS3(s3f.url) });
    const r = await svc.executar('manual'); assert.equal(r.ok, true);
    const arquivo = path.join(dir, 'b.mbk'); fs.writeFileSync(arquivo, s3f.objetos.get(r.objeto!)!);
    const saidas: string[] = []; const base = { chave: CHAVE, arquivo, perguntar: async () => 'mbk_r_destino', escrever: (t: string) => saidas.push(t) };
    const contar = async (url: string) => { const c = new pg.Client({ connectionString: url }); await c.connect(); const n = (await c.query(`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)).rows[0].n; await c.end(); return n; };

    // 1) mesmo banco do sistema
    assert.match((await restaurarBackup({ ...base, urlDestino: urlOrigem, urlBancoDoSistema: urlOrigem })).mensagem, /mesmo banco do sistema/);
    // 2) banco com conteúdo
    assert.match((await restaurarBackup({ ...base, urlDestino: urlOrigem })).mensagem, /NÃO está vazio/);
    // 3) confirmação errada
    const urlDestino = await criarBanco('mbk_r_destino');
    const errada = await restaurarBackup({ ...base, urlDestino, perguntar: async () => 'outro' }); assert.equal(errada.ok, false); assert.match(errada.mensagem, /Confirmação não confere/); assert.equal(await contar(urlDestino), 0);
    // 4) chave errada: nada fica no banco
    const chaveErrada = await restaurarBackup({ ...base, urlDestino, chave: 'chave-errada-bem-comprida-1' }); assert.equal(chaveErrada.ok, false); assert.equal(await contar(urlDestino), 0);
    // 5) arquivo cortado: transação desfeita, banco continua vazio
    const cortado = path.join(dir, 'c.mbk'); const bruto = fs.readFileSync(arquivo); fs.writeFileSync(cortado, bruto.subarray(0, bruto.length - 40));
    const rc = await restaurarBackup({ ...base, urlDestino, arquivo: cortado }); assert.equal(rc.ok, false); assert.equal(await contar(urlDestino), 0);
    // 6) caminho feliz, pelo S3 (ultimo backup do sistema) e com confirmação por parâmetro
    const ok = await restaurarBackup({ ...base, urlDestino, arquivo: undefined, s3: { cfg: { endpoint: s3f.url, bucket: 'meu-bucket', accessKey: 'ACESSO', secretKey: 'SEGREDO-S3', region: 'regiao' }, sistema: 'contabil' }, confirmacaoInformada: 'mbk_r_destino' });
    assert.equal(ok.ok, true, ok.mensagem);
    const d = new pg.Client({ connectionString: urlDestino }); await d.connect();
    assert.deepEqual((await d.query(`SELECT id, nome FROM t ORDER BY id`)).rows, [{ id: 1, nome: 'a' }, { id: 2, nome: 'b' }]); await d.end();
    // 7) depois de restaurado, o banco não está mais vazio: segunda restauração é recusada
    assert.match((await restaurarBackup({ ...base, urlDestino })).mensagem, /NÃO está vazio/);
    assert.ok(!saidas.join('\n').includes('SEGREDO-S3'));
  } finally { await s3f.fechar(); await o.end(); fs.rmSync(dir, { recursive: true, force: true }); }
});
