// Uso: npx tsx scripts/conferir-migracao-backup-contabil.ts <backup .backup/.bcir> [--banco <nome do banco restaurado>]
// Confere, SEM GRAVAR NADA em banco nenhum, se a migração contábil leva tudo de cada empresa do backup:
// linhas de lançamento lidas = partidas montadas (+ as que não entram, com motivo), blocos guardados, validação do
// workspace e balancete do Murade x saldos do sistema anterior. Com --banco, compara também com o banco restaurado
// localmente (lido com psql como usuário postgres), que é uma fonte independente do leitor do arquivo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extrairArquivo } from './extrair-backup-contabil';
import { indexarDump, carregarTabelaDump } from '../src/server/migracaoSistemaAnterior/leitorDump';
import { centavos, listarEmpresasContabeis, montarDadosEmpresa } from '../src/server/migracaoSistemaAnterior/conversor';
import { mesclarMigracao } from '../src/server/migracaoSistemaAnterior/mesclagem';
import { conferirMigracao } from '../src/server/migracaoSistemaAnterior/conferencia';
import { workspaceValido } from '../src/server/authContabil';
import { planoContasModelo } from '../src/data/planoContasModelo';

function psql(banco: string, sql: string): string {
  return execFileSync('su', ['postgres', '-c', `psql -d ${banco} -At -F'|' -c "${sql.replace(/"/g, '\\"')}"`], { encoding: 'utf8' }).trim();
}

async function main() {
  const args = process.argv.slice(2);
  const arquivo = args[0];
  const banco = args.includes('--banco') ? args[args.indexOf('--banco') + 1] : '';
  if (!arquivo || !fs.existsSync(arquivo)) { console.error('Informe o arquivo de backup.'); process.exit(2); }
  const saida = path.join(os.tmpdir(), `murade-conferir-contabil-${process.pid}.sql`);
  let falhas = 0;
  try {
    const ex = await extrairArquivo(arquivo, saida);
    console.log(`Parte contábil separada: ${(ex.tamanho / 1e6).toFixed(1)} MB, ${ex.tabelas} tabelas, ${ex.segundos.toFixed(1)} s.`);
    const idx = await indexarDump(saida);
    const cache = new Map<string, any>();
    const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
    const comDados = [...idx.tabelas.values()].filter((t) => t.fim > t.inicio).map((t) => t.nome);
    const empresas = listarEmpresasContabeis((await ler('wphd.empresa')) || [], (await ler('wcont.empcont')) || [], comDados);
    for (const e of empresas) {
      const d = await montarDadosEmpresa(ler, e.cdempresa);
      const sufixo = String(e.cdempresa).padStart(5, '0');
      const mv = ((await ler(`wcont.mv${sufixo}`)) || []) as any[];
      const debitosLidos = mv.filter((m) => m.vllancamento < 0).reduce((s, m) => s - centavos(m.vllancamento), 0);
      const debitosGravados = d.lancamentos.reduce((s, l) => s + Math.round(l.valor * 100), 0) + d.naoEntraram.filter((x) => x.valorCentavos < 0).reduce((s, x) => s - x.valorCentavos, 0);
      const linhas: string[] = [];
      let ok = debitosLidos === debitosGravados && (d.blocos.lancamentos_originais?.length || 0) === mv.length;
      if (banco) {
        const existe = psql(banco, `select to_regclass('wcont.mv${sufixo}')`);
        const [n, deb] = existe ? psql(banco, `select count(*), coalesce(round(-sum(case when vllancamento<0 then vllancamento else 0 end)::numeric*100),0) from wcont.mv${sufixo}`).split('|').map(Number) : [0, 0];
        const okBanco = n === mv.length && deb === debitosLidos;
        ok = ok && okBanco;
        linhas.push(`banco restaurado: ${n} linhas, débitos ${deb} centavos ${okBanco ? '= arquivo' : '≠ ARQUIVO'}`);
      }
      let conferencia = 'sem CNPJ: só entra se a pessoa digitar o CNPJ';
      if (!e.semCadastro) {
        const m = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: new Date().toISOString().slice(0, 7) });
        const payload: any = m.payload;
        if (!payload || !workspaceValido(payload)) { ok = false; conferencia = `NÃO GRAVARIA: ${m.bloqueio || 'workspace inválido'}`; }
        else {
          const c = conferirMigracao(payload.contas as any, payload.lancamentos as any[], { esperado: d.esperado, esperadoLancamentos: d.esperadoLancamentos, saldoFinalEsperado: d.saldoFinalEsperado, lancamentosGravados: d.lancamentos.length, semSaldosParaConferir: d.semSaldosParaConferir, linhasQueNaoEntraram: d.naoEntraram.length });
          ok = ok && c.bate; conferencia = c.resumo;
        }
      }
      if (!ok) falhas++;
      console.log(`${ok ? 'OK ' : 'ERRO'} ${e.cdempresa} ${e.cnpj || '(sem CNPJ)'} ${e.nome}: ${mv.length} linhas lidas -> ${d.lancamentos.length} partidas, ${d.naoEntraram.length} não entraram; ${d.contas.length} contas; ${Object.keys(d.blocos).length} blocos guardados. ${conferencia}${linhas.length ? ` | ${linhas.join(' | ')}` : ''}`);
    }
  } finally { fs.rmSync(saida, { force: true }); }
  console.log(falhas ? `${falhas} empresa(s) com problema.` : 'Tudo conferido.');
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
