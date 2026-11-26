// Backup INVENTADO (formato do dump do sistema anterior) de uma empresa grande: N partidas espalhadas em 10 anos (2017 a 11/2026),
// com abertura em várias partidas, encerramento do exercício todo dezembro e a tabela de saldos (com o total de cada mês).
// Nenhum dado de cliente. Usado pelo teste da empresa grande (histórico guardado).
import fs from 'node:fs';

export function gerarBackupEmpresaGrande(saida: string, N: number): { partidas: number; linhas: number; meses: number; contas: number } {
  const out = fs.openSync(saida, 'w');
  const w = (s: string) => fs.writeSync(out, s);
  function cab(nome: string, tipos: Record<string, string>) {
    const cols = Object.keys(tipos);
    w(`CREATE TABLE ${nome} (\n${cols.map((c) => `    ${c} ${tipos[c]}`).join(',\n')}\n);\n\nCOPY ${nome} (${cols.join(', ')}) FROM stdin;\n`);
    return (l: Record<string, string | null>) => w(cols.map((c) => l[c] ?? '\\N').join('\t') + '\n');
  }
  const fim = () => w('\\.\n\n');
  w("SET client_encoding = 'UTF8';\n\n");
  let e = cab('wphd.empresa', { cdempresa: 'integer', nmempresa: 'text', nrcgc: 'text' }); e({ cdempresa: '7', nmempresa: 'SUPERMERCADO INVENTADO LTDA', nrcgc: '11222333000181' }); fim();
  e = cab('wcont.empcont', { idempresa: 'integer', idplanodecontas: 'integer' }); e({ idempresa: '7', idplanodecontas: '1' }); fim();
  // Plano: 1 ATIVO (1-1 circulante: caixa, bancos 5, clientes 20, estoque), 2 PASSIVO (fornecedores 40, impostos 5, 2-3 PL: capital, lucros), 3 RECEITAS (10), 4 DESPESAS (30)
  type C = { id: number; cl: string; nome: string; tp: 'A' | 'S' };
  const contas: C[] = []; let id = 100;
  const S = (cl: string, nome: string) => contas.push({ id: id++, cl, nome, tp: 'S' });
  const A = (cl: string, nome: string) => { const c = { id: id++, cl, nome, tp: 'A' as const }; contas.push(c); return c; };
  S('1', 'ATIVO'); S('1-1', 'ATIVO CIRCULANTE'); S('1-1-01', 'DISPONIVEL');
  const caixa = A('1-1-01-01', 'CAIXA GERAL'); const bancos = [1, 2, 3, 4, 5].map((i) => A(`1-1-01-0${i + 1}`, `BANCO ${i}`));
  S('1-1-02', 'CLIENTES'); const clientes = Array.from({ length: 20 }, (_, i) => A(`1-1-02-${String(i + 1).padStart(3, '0')}`, `CLIENTE ${i + 1}`));
  S('1-1-03', 'ESTOQUES'); const estoque = A('1-1-03-01', 'MERCADORIAS');
  S('2', 'PASSIVO'); S('2-1', 'PASSIVO CIRCULANTE'); S('2-1-01', 'FORNECEDORES');
  const fornec = Array.from({ length: 40 }, (_, i) => A(`2-1-01-${String(i + 1).padStart(3, '0')}`, `FORNECEDOR ${i + 1}`));
  S('2-1-02', 'IMPOSTOS'); const impostos = [1, 2, 3, 4, 5].map((i) => A(`2-1-02-0${i}`, `IMPOSTO ${i}`));
  S('2-3', 'PATRIMONIO LIQUIDO'); const capital = A('2-3-01', 'CAPITAL SOCIAL'); const lucros = A('2-3-02', 'LUCROS ACUMULADOS');
  S('3', 'RECEITAS'); S('3-1', 'RECEITA BRUTA'); const receitas: C[] = Array.from({ length: 10 }, (_, i) => A(`3-1-${String(i + 1).padStart(2, '0')}`, `VENDAS ${i + 1}`));
  S('4', 'DESPESAS'); S('4-1', 'CUSTOS E DESPESAS'); const despesas: C[] = Array.from({ length: 30 }, (_, i) => A(`4-1-${String(i + 1).padStart(2, '0')}`, `DESPESA ${i + 1}`));
  e = cab('wcont.contas', { idconta: 'integer', idplanodecontas: 'integer', cdclassinterna: 'text', nmconta: 'text', tpconta: 'text', cdchamada: 'text' });
  for (const c of contas) e({ idconta: String(c.id), idplanodecontas: '1', cdclassinterna: c.cl, nmconta: c.nome, tpconta: c.tp, cdchamada: String(c.id) });
  fim();
  // pseudoaleatório fixo
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const meses: string[] = []; for (let a = 2017; a <= 2026; a++) for (let m = 1; m <= 12; m++) { if (a === 2026 && m > 11) break; meses.push(`${a}-${String(m).padStart(2, '0')}`); }
  const porMes = Math.floor(N / meses.length);
  const mvCols = { idmovimento: 'text', idlote: 'text', dtlancamento: 'timestamp without time zone', idlotelancamento: 'text', idconta: 'integer', vllancamento: 'double precision', dshistorico: 'text', dsdocumento: 'text', stencerramento: 'boolean' };
  const mv = cab('wcont.mv00007', mvCols);
  const saldo = new Map<string, { d: number; c: number }>(); // conta|mes -> centavos
  const somar = (conta: number, mes: string, cent: number) => { const k = `${conta}|${mes}`; const s = saldo.get(k) || { d: 0, c: 0 }; if (cent < 0) s.d += -cent; else s.c += cent; saldo.set(k, s); };
  let seq = 0; let partidas = 0;
  const linha = (lote: string, data: string, par: string, conta: C, cent: number, hist: string, enc = false) => {
    const v = (cent / 100).toFixed(2);
    mv({ idmovimento: `M${++seq}`, idlote: lote, dtlancamento: `${data} 00:00:00`, idlotelancamento: par, idconta: String(conta.id), vllancamento: v, dshistorico: hist, dsdocumento: `NF ${seq}`, stencerramento: enc ? 't' : 'f' });
    somar(conta.id, data.slice(0, 7), cent);
  };
  const partida = (lote: string, data: string, deb: C, cred: C, cent: number, hist: string, enc = false) => { const p = `P${++partidas}`; linha(lote, data, p, deb, -cent, hist, enc); linha(lote, data, p, cred, cent, hist, enc); };
  // abertura com várias partidas (1 lote, mesma data, sem par)
  const ab = 'LAB'; linha(ab, '2017-01-01', 'AB1', caixa, -5000000, 'ABERTURA'); linha(ab, '2017-01-01', 'AB2', bancos[0], -15000000, 'ABERTURA'); linha(ab, '2017-01-01', 'AB3', capital, 20000000, 'ABERTURA'); partidas += 2;
  const lotes: string[] = [];
  const resultado = new Map<number, number>(); // saldo das contas de resultado no ano (débito - crédito)
  for (const mes of meses) {
    const lote = `L${mes}`; lotes.push(lote);
    const dias = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).getUTCDate();
    for (let i = 0; i < porMes; i++) {
      const data = `${mes}-${String(1 + Math.floor(rnd() * dias)).padStart(2, '0')}`;
      const cent = 100 + Math.floor(rnd() * 500000);
      const t = rnd();
      let deb: C, cred: C;
      if (t < 0.35) { deb = pick([caixa, ...bancos, ...clientes]); cred = pick(receitas); }
      else if (t < 0.6) { deb = estoque; cred = pick(fornec); }
      else if (t < 0.8) { deb = pick(fornec); cred = pick(bancos); }
      else if (t < 0.9) { deb = pick(despesas); cred = pick([caixa, ...bancos, ...impostos]); }
      else { deb = pick(bancos); cred = pick(clientes); }
      partida(lote, data, deb, cred, cent, `HISTORICO ${mes} ${i}`);
      for (const [c, s] of [[deb, cent], [cred, -cent]] as const) if (receitas.includes(c) || despesas.includes(c)) resultado.set(c.id, (resultado.get(c.id) || 0) + s);
    }
    if (mes.endsWith('-12')) { // encerramento do exercício (contas de resultado contra lucros acumulados)
      const enc = `E${mes}`; lotes.push(enc);
      for (const c of [...receitas, ...despesas]) {
        const s = resultado.get(c.id) || 0; if (!s) continue;
        if (s > 0) partida(enc, `${mes}-31`, lucros, c, s, 'ENCERRAMENTO DO EXERCICIO', true); else partida(enc, `${mes}-31`, c, lucros, -s, 'ENCERRAMENTO DO EXERCICIO', true);
      }
      resultado.clear();
    }
  }
  fim();
  e = cab('wcont.lt00007', { idlote: 'text', cdchamada: 'text', dslote: 'text', dtcriacao: 'timestamp without time zone' });
  e({ idlote: 'LAB', cdchamada: '00000', dslote: 'ABERTURA', dtcriacao: '2017-01-01 08:00:00' });
  lotes.forEach((l, i) => e({ idlote: l, cdchamada: String(i + 1).padStart(5, '0'), dslote: `Lote ${l}`, dtcriacao: '2017-01-01 08:00:00' }));
  fim();
  // saldos acumulados por conta e mês (com total do mês)
  e = cab('wcont.sd00007', { idconta: 'integer', dtsaldo: 'timestamp without time zone', vlcredito: 'double precision', vldebito: 'double precision', total_movimento_debito: 'double precision', total_movimento_credito: 'double precision' });
  for (const c of contas.filter((x) => x.tp === 'A')) {
    let ad = 0, ac = 0;
    for (const mes of meses) {
      const s = saldo.get(`${c.id}|${mes}`); if (!s) continue;
      ad += s.d; ac += s.c;
      const ult = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0)).toISOString().slice(0, 10);
      e({ idconta: String(c.id), dtsaldo: `${ult} 00:00:00`, vlcredito: (ac / 100).toFixed(2), vldebito: (-ad / 100).toFixed(2), total_movimento_debito: (-s.d / 100).toFixed(2), total_movimento_credito: (s.c / 100).toFixed(2) });
    }
  }
  fim();
    fs.closeSync(out);
  return { partidas, linhas: seq, meses: meses.length, contas: contas.length };
}
