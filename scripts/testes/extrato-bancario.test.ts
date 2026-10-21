import test from 'node:test';
import assert from 'node:assert/strict';
import { lerOFX, conciliar, sugerirContraPartida, lancamentoDoMovimento } from '../../src/utils/extratoBancario';
const OFX = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105120000[-3:BRT]<TRNAMT>-150.00<FITID>A1<MEMO>PAG ENERGIA ELETRICA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>1.250,50<FITID>A2<MEMO>RECEBIMENTO CLIENTE SILVA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110<TRNAMT>-80.00<FITID>A1<MEMO>REPETIDO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026<TRNAMT>-80.00<FITID>A4<MEMO>DATA RUIM</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const l = (o: any) => ({ id: 'x', data: '2026-01-05', contaDebitoCodigo: '3.1', contaDebitoNome: '', contaCreditoCodigo: '1.1.1', contaCreditoNome: '', valor: 150, historico: 'Energia elétrica dezembro', origem: 'Manual', ...o });
test('lê OFX, trata vírgula decimal, repetidos e inválidos', () => {
  const r = lerOFX(OFX);
  assert.equal(r.movimentos.length, 2);
  assert.deepEqual(r.movimentos.map((m) => [m.fitid, m.dataISO, m.valorCentavos]), [['A1', '2026-01-05', -15000], ['A2', '2026-01-07', 125050]]);
  assert.equal(r.erros.length, 2); assert.equal(r.banco, '001');
});
test('arquivo não OFX', () => assert.equal(lerOFX('abc').movimentos.length, 0));
test('conciliação exata, provável e sem lançamento', () => {
  const movs = lerOFX(OFX).movimentos;
  const lancs: any[] = [l({ id: 'a' }), l({ id: 'b', contaDebitoCodigo: '1.1.1', contaCreditoCodigo: '4.1', valor: 1250.5, data: '2026-01-09' }), l({ id: 'c', valor: 999 })];
  const r = conciliar(movs, lancs, '1.1.1', '2026-01');
  assert.deepEqual(r.conciliados.map((c) => [c.movimento.fitid, c.lancamentoId, c.certeza]), [['A1', 'a', 'exata'], ['A2', 'b', 'provavel']]);
  assert.equal(r.semLancamento.length, 0); assert.deepEqual(r.lancamentosSemExtrato.map((x) => x.id), ['c']);
});
test('um lançamento não casa com dois movimentos', () => {
  const mov = (id: string) => ({ fitid: id, dataISO: '2026-01-05', valorCentavos: -15000, memo: 'x' });
  const r = conciliar([mov('1'), mov('2')], [l({ id: 'a' }) as any], '1.1.1', '2026-01');
  assert.equal(r.conciliados.length, 1); assert.equal(r.semLancamento.length, 1);
});
test('sugestão pelo histórico e sentido', () => {
  const m = { fitid: 'z', dataISO: '2026-02-05', valorCentavos: -17000, memo: 'PAG ENERGIA ELETRICA' };
  assert.equal(sugerirContraPartida(m, '1.1.1', [l({}) as any])?.codigo, '3.1');
  assert.equal(sugerirContraPartida({ ...m, valorCentavos: 17000 }, '1.1.1', [l({}) as any]), null);
  assert.equal(sugerirContraPartida({ ...m, memo: 'PIX 123' }, '1.1.1', [l({}) as any]), null);
});
test('lançamento do movimento', () => {
  const banco: any = { codigo: '1.1.1', descricao: 'Banco' }, desp: any = { codigo: '3.1', descricao: 'Energia' };
  const s = lancamentoDoMovimento({ fitid: 'A1', dataISO: '2026-01-05', valorCentavos: -15000, memo: 'ENERGIA' }, banco, desp);
  assert.equal(s.contaDebitoCodigo, '3.1'); assert.equal(s.contaCreditoCodigo, '1.1.1'); assert.equal(s.valor, 150); assert.equal(s.statusManual, 'pendente_aprovacao'); assert.equal(s.origem, 'Manual');
  const e = lancamentoDoMovimento({ fitid: 'A2', dataISO: '2026-01-07', valorCentavos: 5000, memo: '' }, banco, desp);
  assert.equal(e.contaDebitoCodigo, '1.1.1');
});
