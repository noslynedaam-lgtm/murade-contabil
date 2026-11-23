// DARF do Lucro Real pelo Serpro (via Murad Fiscal): só código com extensão oficial, só período confirmado e não bloqueado, CNPJ do
// escritório obrigatório (isolamento), nada de credencial no Contábil, 5706 no Sicalc Web, cartão na tela e na Agente, conferidor.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CODIGOS_SERPRO_LUCRO_REAL, conferirDarfsSerpro, darfProntoParaSerpro, gerarDarfSerproLucroReal, pedirDarfAoFiscal, referenciaDoPeriodo, type DepsDarfSerpro } from '../../src/server/darfSerproLucroReal';
import { FERRAMENTAS_LUCRO_REAL } from '../../src/server/agenteLucroReal';
import { CODIGOS_SERPRO_LR } from '../../src/components/DarfSerproLucroReal';

const C = '11222333000181';
const DARF = { tributo: 'irpj', codigo: '2362', periodoApuracao: '2026-10-31', vencimento: '2026-11-30', valorCentavos: 123456 };

test('referência do período e códigos: só os 9 com extensão oficial; 5993, 0220 e 5706 ficam no Sicalc Web', () => {
  assert.equal(referenciaDoPeriodo(2026, 'T03'), '2026-T3'); assert.equal(referenciaDoPeriodo(2026, 'A10'), '2026-10'); assert.equal(referenciaDoPeriodo(2025, 'ANUAL'), '2025-ANUAL'); assert.equal(referenciaDoPeriodo(2026, 'X'), null);
  assert.deepEqual([...CODIGOS_SERPRO_LUCRO_REAL].sort(), ['2030', '2319', '2362', '2430', '2456', '2484', '3373', '6012', '6773']);
  assert.deepEqual([...CODIGOS_SERPRO_LR].sort(), [...CODIGOS_SERPRO_LUCRO_REAL].sort(), 'tela e servidor com a mesma lista');
  const conf = { status: 'confirmado' };
  assert.equal(darfProntoParaSerpro(conf, DARF, false).ok, true);
  for (const codigo of ['5993', '0220', '5706']) assert.match((darfProntoParaSerpro(conf, { ...DARF, codigo }, false) as any).motivo, /Sicalc Web/, codigo);
  assert.match((darfProntoParaSerpro({ status: 'calculado' }, DARF, false) as any).motivo, /Confirme/);
  assert.match((darfProntoParaSerpro(conf, DARF, true) as any).motivo, /já foi registrado/);
  assert.match((darfProntoParaSerpro(conf, { ...DARF, valorCentavos: 999 }, false) as any).motivo, /R\$ 10,00/);
  assert.match((darfProntoParaSerpro(conf, { ...DARF, codigo: null }, false) as any).motivo, /obrigada ou optante/);
});

function deps(extra: Partial<DepsDarfSerpro> = {}) {
  const linhas: any[] = []; const pedidos: any[] = [];
  const consultar = async (sql: string, p: unknown[] = []) => {
    if (/^INSERT INTO contabil_lr_darf_serpro/.test(sql.trim())) { linhas.push({ cnpj: p[0], ano: p[1], periodo: p[2], tributo: p[3], codigo: p[4], estado: p[5], linha_digitavel: p[6], codigo44: p[7], tem_pdf: !!p[8], receita_sem_codbarras: p[10], avisos: JSON.parse(String(p[11])), consultas: p[12], municipio: p[13], gerado_por: p[14], gerado_em: new Date() }); return { rows: [] }; }
    if (/SELECT gerado_em, gerado_por/.test(sql)) return { rows: linhas.filter((l) => l.periodo === p[2] && l.tributo === p[3]) };
    if (/FROM contabil_lr_darf_serpro WHERE cnpj=\$1 AND ano=\$2 ORDER BY/.test(sql)) return { rows: linhas };
    return { rows: [] };
  };
  const d: DepsDarfSerpro = {
    consultar,
    periodo: async () => ({ linha: { status: 'confirmado', resultado: { darfs: [DARF] } }, tributosPagos: [] }),
    bloqueio: async () => null,
    escritorioCnpj: async () => '37010000000100',
    pedir: async (corpo) => { pedidos.push(corpo); return { ok: true, status: 200, corpo: { sucesso: true, estado: 'gerado', consultas: 2, codigoBarras: { codigo44: '8'.repeat(44), linhaDigitavel: '858000000108 000003852203 723221621000 100003710005' }, pdfBase64: 'JVBERi0=', avisos: [], municipioEnviado: 'GO 9373' } }; },
    ...extra,
  };
  return { d, pedidos, linhas };
}

test('gerar: manda ao Fiscal o CNPJ do escritório, o código, a referência e quem clicou; guarda código de barras e PDF', async () => {
  const { d, pedidos } = deps();
  const r = await gerarDarfSerproLucroReal(d, { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', tenantId: 't1', login: 'contadora', gerarDeNovo: false });
  assert.equal(r.ok, true);
  assert.deepEqual(pedidos[0], { confirmado: true, cnpj: C, escritorioCnpj: '37010000000100', codigoReceita: '2362', periodoApuracao: '2026-10-31', referencia: '2026-10', vencimento: '2026-11-30', valorCentavos: 123456, por: 'contadora' });
  if (r.ok) { assert.match(String(r.darf.linhaDigitavel), /^858000000108/); assert.equal(r.darf.temPdf, true); assert.equal(r.darf.municipio, 'GO 9373'); }
  // já gerado: não gasta de novo sem pedir "gerar de novo"
  const de = await gerarDarfSerproLucroReal(d, { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', tenantId: 't1', login: 'contadora', gerarDeNovo: false });
  assert.equal(de.ok, false); assert.match((de as any).motivo, /já foi gerado/); assert.equal(pedidos.length, 1);
});

test('nada vai ao Fiscal: sem CNPJ do escritório, período bloqueado, tributo pago ou código sem extensão', async () => {
  for (const extra of [
    { escritorioCnpj: async () => null },
    { bloqueio: async () => 'diferença aberta na Central.' },
    { periodo: async () => ({ linha: { status: 'confirmado', resultado: { darfs: [DARF] } }, tributosPagos: ['irpj'] }) },
    { periodo: async () => ({ linha: { status: 'confirmado', resultado: { darfs: [{ ...DARF, codigo: '5993' }] } }, tributosPagos: [] }) },
  ] as Array<Partial<DepsDarfSerpro>>) {
    const { d, pedidos } = deps(extra);
    const r = await gerarDarfSerproLucroReal(d, { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', tenantId: 't1', login: 'x', gerarDeNovo: false });
    assert.equal(r.ok, false); assert.equal(pedidos.length, 0);
  }
  // pagamento da CSLL registrado não impede o DARF do IRPJ
  const { d } = deps({ periodo: async () => ({ linha: { status: 'confirmado', resultado: { darfs: [DARF] } }, tributosPagos: ['csll'] }) });
  assert.equal((await gerarDarfSerproLucroReal(d, { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', tenantId: 't1', login: 'x', gerarDeNovo: false })).ok, true);
  // recusa do Fiscal (outro escritório): o motivo aparece e nada é guardado
  const outro = deps({ pedir: async () => ({ ok: false, status: 403, corpo: { sucesso: false, motivo: 'Esta empresa pertence a outro escritório no Murad Fiscal.' } }) });
  const ro = await gerarDarfSerproLucroReal(outro.d, { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', tenantId: 't1', login: 'x', gerarDeNovo: false });
  assert.equal(ro.ok, false); assert.match((ro as any).motivo, /outro escritório/); assert.equal(outro.linhas.length, 0);
});

test('transporte: só o endereço permitido do Fiscal, com o Bearer de integração; sem token não sai', async () => {
  await assert.rejects(pedirDarfAoFiscal({})({}), /MURADE_INTEGRATION_TOKEN/);
  await assert.rejects(pedirDarfAoFiscal({ MURADE_INTEGRATION_TOKEN: 't', MURADE_FISCAL_URL: 'https://outro.exemplo.com' })({}), /fora da lista/);
  let visto: any = null;
  const f = (async (u: URL, o: any) => { visto = { u: String(u), o }; return { ok: true, status: 200, json: async () => ({ sucesso: true }) }; }) as any;
  const r = await pedirDarfAoFiscal({ MURADE_INTEGRATION_TOKEN: 't' }, f)({ a: 1 });
  assert.equal(r.ok, true); assert.equal(visto.u, 'https://murade-fiscal-1.onrender.com/api/integracao/contabil/darf-serpro'); assert.equal(visto.o.headers.Authorization, 'Bearer t');
});

test('nenhuma credencial do Serpro no Contábil e nenhum robô chama a geração', () => {
  const m = readFileSync('src/server/darfSerproLucroReal.ts', 'utf8');
  assert.ok(!/SERPRO_CONSUMER|SERPRO_CERT|consumer_secret|pfx/i.test(m));
  const s = readFileSync('server.ts', 'utf8');
  assert.match(s, /registrarRotasDarfSerproLucroReal\(app/);
  const robo = s.slice(s.indexOf('registrarRobo({ id: "conferidor_darf_serpro_lr"'), s.indexOf('registrarRotinaManual("conferidor_darf_serpro_lr"'));
  assert.ok(robo.includes('conferirDarfsSerpro') && !robo.includes('gerarDarfSerproLucroReal') && !robo.includes('pedirDarfAoFiscal'));
  const tela = readFileSync('src/components/DarfSerproLucroReal.tsx', 'utf8');
  assert.match(tela, /São 2 CONSULTAS PAGAS/); assert.match(tela, /Copiar/); assert.match(tela, /Baixar DARF do Serpro \(PDF\)/); assert.match(tela, /confirmado: true/);
  assert.match(readFileSync('src/components/ApuracaoLucroRealPainel.tsx', 'utf8'), /5706 não tem extensão vigente confirmada/);
});

test('Agente: gerar_darf_serpro_lucro_real é ação com cartão das 2 consultas pagas; recusa 5706/código sem extensão', async () => {
  const f: any = FERRAMENTAS_LUCRO_REAL.find((x) => x.declaracao.name === 'gerar_darf_serpro_lucro_real');
  assert.ok(f); assert.equal(f.tipo, 'acao');
  const chamadas: string[] = [];
  const ctx = (codigo: string): any => ({ chamarApi: async (m: string, u: string) => { chamadas.push(`${m} ${u}`); if (u.includes('/darf-serpro')) return { status: 200, corpo: { sucesso: true, codigos: CODIGOS_SERPRO_LUCRO_REAL, darfs: [] } }; return { status: 200, corpo: { sucesso: true, periodos: [{ periodo: 'T03', status: 'confirmado', resultado: { darfs: [{ ...DARF, codigo, tributo: 'csll' }] } }], pagamentos: [] } }; } });
  const cartao = await f.preparar(ctx('6012'), { cnpj: C, ano: '2026', periodo: 'T03', tributo: 'csll' });
  assert.match(cartao.aviso, /2 CONSULTAS PAGAS/); assert.ok(chamadas.every((c) => c.startsWith('GET ')));
  assert.match((await f.preparar(ctx('5993'), { cnpj: C, ano: '2026', periodo: 'T03', tributo: 'csll' })).erro, /Sicalc Web/);
  await f.executar(ctx('6012'), cartao.params);
  assert.ok(chamadas.includes(`POST /api/workspaces/${C}/lucro-real/darf-serpro`));
});

test('Robô Conferidor: DARF gerado que não bate mais com a apuração vira alerta; vencido sem pagamento é avisado', async () => {
  const q = async (sql: string) => {
    if (/FROM contabil_lr_darf_serpro s/.test(sql)) return { rows: [
      { cnpj: C, ano: 2026, periodo: 'A10', tributo: 'irpj', codigo: '2362', valor_centavos: 123456, status: 'confirmado', resultado: { darfs: [{ ...DARF, valorCentavos: 999999 }] }, pago: false },
      { cnpj: C, ano: 2026, periodo: 'A01', tributo: 'irpj', codigo: '2362', valor_centavos: 123456, status: 'confirmado', resultado: { darfs: [{ ...DARF, vencimento: '2026-02-27' }] }, pago: false },
    ] };
    return { rows: [] };
  };
  const r = await conferirDarfsSerpro(q as any);
  assert.equal(r.divergentes.length, 1); assert.equal(r.vencidosSemPagamento.length, 1); assert.equal(r.alerta, true); assert.match(r.resumo, /Não pague esse código de barras/);
});
