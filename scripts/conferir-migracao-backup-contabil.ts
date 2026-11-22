// Uso: npx tsx scripts/conferir-migracao-backup-contabil.ts <backup .backup/.bcir> [--banco <nome do banco restaurado>] [--detalhe]
// Confere, SEM GRAVAR NADA em banco nenhum, se a migração contábil leva tudo de cada empresa do backup:
//  1. linhas de lançamento lidas = partidas montadas (+ as que não entram, com motivo), validação do workspace e
//     balancete do Murade x saldos do sistema anterior;
//  2. campo a campo (conferidor do robô e da Agente): o que estava preenchido e tem campo no Contábil chegou igual;
//  3. com --banco: lê o banco restaurado localmente (psql como usuário postgres, fonte independente do leitor do
//     arquivo) e, por tabela, lista as colunas preenchidas e para onde vai cada uma (campo do Contábil / registro do
//     sistema anterior / não vem); confere por SQL próprio o valor de cada campo (cadastro, contas, históricos,
//     lançamentos, bens) e, para o que fica só para consulta, que cada valor preenchido está guardado igual no registro.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extrairArquivo } from './extrair-backup-contabil';
import { indexarDump, carregarTabelaDump } from '../src/server/migracaoSistemaAnterior/leitorDump';
import { centavos, listarEmpresasContabeis, montarDadosEmpresa, type DadosContabeisEmpresa } from '../src/server/migracaoSistemaAnterior/conversor';
import { mesclarMigracao } from '../src/server/migracaoSistemaAnterior/mesclagem';
import { conferirMigracao } from '../src/server/migracaoSistemaAnterior/conferencia';
import { conferirCamposMigrados, destinoDaColuna, DESTINO_COLUNAS, TABELAS_FORA } from '../src/server/migracaoSistemaAnterior/camposSistemaAnterior';
import { workspaceValido } from '../src/server/authContabil';
import { planoContasModelo } from '../src/data/planoContasModelo';

function psql(banco: string, sql: string): string {
  return execFileSync('su', ['postgres', '-c', `psql -d ${banco} -At -F'|' -c "${sql.replace(/"/g, '\\"')}"`], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }).trim();
}
const json = (banco: string, sql: string): any[] => JSON.parse(psql(banco, `select coalesce(json_agg(x), '[]') from (${sql}) x`) || '[]');
const linhasDb = (banco: string, tabela: string, filtro: string): any[] => {
  const existe = psql(banco, `select to_regclass('${tabela}')`);
  if (!existe) return [];
  return JSON.parse(psql(banco, `select coalesce(json_agg(to_jsonb(t) - 'imglogotipoempresa'), '[]') from ${tabela} t where ${filtro}`) || '[]');
};

/** Valor "preenchido": não nulo, não vazio, não zero/falso (quando zero não significa nada). */
const preenchido = (v: unknown) => !(v === null || v === undefined || v === false || v === 0 || (typeof v === 'string' && v.trim() === ''));
/** Normalização simétrica para comparar o banco (jsonb) com o registro guardado (texto do arquivo). */
function norm(v: unknown): string {
  if (typeof v === 'boolean') return `b:${v}`;
  if (typeof v === 'number') return `n:${v}`;
  const s = String(v);
  const d = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/.exec(s);
  if (d && /^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?Z?$/.test(s)) return `d:${d[1]}T${d[2] || '00:00:00'}`;
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return `n:${Number(s)}`;
  return `s:${s}`;
}

interface Coluna { tabela: string; coluna: string; linhas: number; destino: string; tipo: 'campo' | 'consulta' | 'nao_vem' }
const resumoPorTabela = new Map<string, Map<string, Coluna>>();
const linhasVistas = new Map<string, Set<string>>();
function registrarColunas(tabela: string, linhas: any[]) {
  const chave = tabela.replace(/(\.(mv|sd|lt|be))\d{5}$/, '$1');
  if (!resumoPorTabela.has(chave)) resumoPorTabela.set(chave, new Map());
  const m = resumoPorTabela.get(chave)!;
  if (!linhasVistas.has(tabela)) linhasVistas.set(tabela, new Set());
  const vistas = linhasVistas.get(tabela)!;
  for (const l of linhas) {
    const assinatura = JSON.stringify(l);
    if (vistas.has(assinatura)) continue; // tabela comum a várias empresas (ex.: históricos padrão): conta a linha uma vez só
    vistas.add(assinatura);
    for (const [k, v] of Object.entries(l)) {
    if (!preenchido(v)) continue;
    const d = destinoDaColuna(tabela, k);
    const atual = m.get(k) || { tabela: chave, coluna: k, linhas: 0, tipo: d.tipo, destino: d.tipo === 'campo' ? d.para : d.motivo };
    atual.linhas++; m.set(k, atual);
    }
  }
}

/** Para o que fica só para consulta: cada valor preenchido no banco está no bloco guardado, igual (multiconjunto por coluna). */
function conferirBloco(tabela: string, db: any[], bloco: any[] | undefined, erros: string[]) {
  for (const col of new Set(db.flatMap((l) => Object.keys(l)))) {
    const d = destinoDaColuna(tabela, col);
    if (d.tipo === 'nao_vem') continue;
    const doBanco = db.map((l) => l[col]).filter(preenchido).map(norm).sort();
    if (!doBanco.length) continue;
    const doBloco = (bloco || []).map((l) => l[col]).filter(preenchido).map(norm).sort();
    const faltam = doBanco.filter((v, i) => v !== doBloco[i]);
    if (doBanco.length !== doBloco.length || faltam.length) erros.push(`${tabela}.${col}: ${doBanco.length} valor(es) no banco, ${doBloco.length} no registro guardado${faltam.length ? ` (ex.: ${faltam[0].slice(2, 80)})` : ''}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arquivo = args[0];
  const banco = args.includes('--banco') ? args[args.indexOf('--banco') + 1] : '';
  const detalhe = args.includes('--detalhe');
  if (!arquivo || !fs.existsSync(arquivo)) { console.error('Informe o arquivo de backup.'); process.exit(2); }
  const saida = path.join(os.tmpdir(), `murade-conferir-contabil-${process.pid}.sql`);
  let falhas = 0;
  let totalValores = 0; let totalPendencias = 0;
  try {
    const ex = await extrairArquivo(arquivo, saida);
    console.log(`Parte contábil separada: ${(ex.tamanho / 1e6).toFixed(1)} MB, ${ex.tabelas} tabelas, ${ex.segundos.toFixed(1)} s.`);
    const idx = await indexarDump(saida);
    const cache = new Map<string, any>();
    const ler = async (n: string) => { if (!cache.has(n)) cache.set(n, await carregarTabelaDump(idx, n)); return cache.get(n); };
    const comDados = [...idx.tabelas.values()].filter((t) => t.fim > t.inicio).map((t) => t.nome);
    const empresas = listarEmpresasContabeis((await ler('wphd.empresa')) || [], (await ler('wcont.empcont')) || [], comDados);
    for (const e of empresas) {
      const d = await montarDadosEmpresa(ler, e.cdempresa, { cnpjInformado: e.semCadastro ? '00000000000191' : '' });
      const sufixo = String(e.cdempresa).padStart(5, '0');
      const mv = ((await ler(`wcont.mv${sufixo}`)) || []) as any[];
      const debitosLidos = mv.filter((m) => m.vllancamento < 0).reduce((s, m) => s - centavos(m.vllancamento), 0);
      const debitosGravados = d.lancamentos.reduce((s, l) => s + Math.round(l.valor * 100), 0) + d.naoEntraram.filter((x) => x.valorCentavos < 0).reduce((s, x) => s - x.valorCentavos, 0);
      const linhas: string[] = [];
      const erros: string[] = [];
      let ok = debitosLidos === debitosGravados && (d.blocos.lancamentos_originais?.length || 0) === mv.length;
      const m = mesclarMigracao(null, d, { modelo: planoContasModelo, competenciaAtual: new Date().toISOString().slice(0, 7) });
      const payload: any = m.payload;
      let conferencia = '';
      if (!payload || !workspaceValido(payload)) { ok = false; conferencia = `NÃO GRAVARIA: ${m.bloqueio || 'workspace inválido'}`; }
      else {
        const c = conferirMigracao(payload.contas as any, payload.lancamentos as any[], { esperado: d.esperado, esperadoLancamentos: d.esperadoLancamentos, saldoFinalEsperado: d.saldoFinalEsperado, lancamentosGravados: d.lancamentos.length, semSaldosParaConferir: d.semSaldosParaConferir, linhasQueNaoEntraram: d.naoEntraram.length });
        if (!e.semCadastro || d.naoEntraram.length === 0) ok = ok && c.bate;
        conferencia = c.resumo;
        // Campo a campo pelo mesmo conferidor do robô e da Agente IA (a partir do registro guardado).
        const f = conferirCamposMigrados({ cdempresa: d.cdempresa, blocos: JSON.parse(JSON.stringify(d.blocos)), mapaContas: d.mapaContas, payload });
        totalPendencias += f.pendencias.length;
        if (f.pendencias.length) { ok = false; erros.push(...f.pendencias.slice(0, 10).map((p) => `conferidor: ${p.item} › ${p.rotulo} (${p.tipo}): "${p.noSistemaAnterior}" x "${p.noMurade}"`)); }
        linhas.push(f.resumo);
        if (banco) {
          const r = conferirNoBanco(banco, e.cdempresa, d, payload);
          totalValores += r.valores; erros.push(...r.erros);
          linhas.push(`banco restaurado: ${r.valores} valor(es) de campo conferidos por SQL, ${r.consulta} valor(es) só para consulta conferidos no registro, ${r.erros.length} divergência(s)`);
          if (r.erros.length) ok = false;
        }
      }
      if (banco) {
        const existe = psql(banco, `select to_regclass('wcont.mv${sufixo}')`);
        const [n, deb] = existe ? psql(banco, `select count(*), coalesce(round(-sum(case when vllancamento<0 then vllancamento else 0 end)::numeric*100),0) from wcont.mv${sufixo}`).split('|').map(Number) : [0, 0];
        const okBanco = n === mv.length && deb === debitosLidos;
        ok = ok && okBanco;
        linhas.push(`lançamentos no banco: ${n} linhas, débitos ${deb} centavos ${okBanco ? '= arquivo' : '≠ ARQUIVO'}`);
      }
      if (!ok) falhas++;
      console.log(`${ok ? 'OK ' : 'ERRO'} ${e.cdempresa} ${e.cnpj || '(sem CNPJ no backup)'} ${e.nome}: ${mv.length} linhas lidas -> ${d.lancamentos.length} partidas, ${d.naoEntraram.length} não entraram; ${d.contas.length} contas; ${Object.keys(d.blocos).length} blocos guardados. ${conferencia}${linhas.length ? ` | ${linhas.join(' | ')}` : ''}`);
      for (const x of erros.slice(0, detalhe ? 200 : 15)) console.log(`     - ${x}`);
    }
  } finally { fs.rmSync(saida, { force: true }); }
  if (banco) {
    console.log('\n=== Por tabela: colunas preenchidas no backup (empresas contábeis) e para onde vai cada uma ===');
    for (const [tabela, cols] of [...resumoPorTabela].sort((a, b) => a[0].localeCompare(b[0]))) {
      const lista = [...cols.values()].sort((a, b) => a.coluna.localeCompare(b.coluna));
      const campos = lista.filter((c) => c.tipo === 'campo'); const cons = lista.filter((c) => c.tipo === 'consulta'); const nao = lista.filter((c) => c.tipo === 'nao_vem');
      console.log(`\n${tabela}: ${lista.length} coluna(s) preenchida(s) → ${campos.length} em campo do Contábil, ${cons.length} só no registro do sistema anterior, ${nao.length} não vêm`);
      for (const c of lista) console.log(`   ${c.tipo === 'campo' ? '[campo]   ' : c.tipo === 'consulta' ? '[consulta]' : '[não vem] '} ${c.coluna} (${c.linhas} linha(s)): ${c.destino}`);
    }
    console.log('\nTabelas fora de propósito (não são dado das empresas):');
    for (const t of TABELAS_FORA) console.log(`   ${t.tabelas}: ${t.motivo}`);
    console.log(`\nValores de campo conferidos por SQL: ${totalValores}. Pendências do conferidor campo a campo: ${totalPendencias}.`);
  }
  console.log(falhas ? `${falhas} empresa(s) com problema.` : 'Tudo conferido.');
  process.exit(falhas ? 1 : 0);
}

/** Lê do banco restaurado e confere, por SQL próprio, cada campo que tem destino no Contábil e cada valor guardado. */
function conferirNoBanco(banco: string, cd: number, d: DadosContabeisEmpresa, payload: any): { valores: number; consulta: number; erros: string[] } {
  const erros: string[] = []; let valores = 0; let consulta = 0;
  const igual = (rotulo: string, esperado: unknown, atual: unknown) => { valores++; if (String(esperado ?? '') !== String(atual ?? '')) erros.push(`${rotulo}: banco "${esperado}" x Murade "${atual ?? ''}"`); };
  const emp = payload.empresa || {};
  const sfx = String(cd).padStart(5, '0');
  // ---- cadastro (SQL próprio, sem passar pelo leitor nem pela conversão)
  const [c] = json(banco, `select regexp_replace(e.nmempresa, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nmempresa, regexp_replace(e.nmnomecompleto, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nmnomecompleto, regexp_replace(ec.stutilizanmcompleto, '^[[:space:]]+|[[:space:]]+\$', '', 'g') usa, regexp_replace(e.nmfantasia, '^[[:space:]]+|[[:space:]]+\$', '', 'g') fantasia, regexp_replace(e.cdnaturezajuridica, '^[[:space:]]+|[[:space:]]+\$', '', 'g') natureza,
    regexp_replace(e.cdcnae, '^[[:space:]]+|[[:space:]]+\$', '', 'g') cnae, regexp_replace(e.nrinscrestadual, '^[[:space:]]+|[[:space:]]+\$', '', 'g') ie, regexp_replace(e.nrinscrmunicipal, '^[[:space:]]+|[[:space:]]+\$', '', 'g') im, regexp_replace(e.cdnire, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nire, to_char(e.dtinicioatividade,'DD/MM/YYYY') abertura, e.vlcapital capital,
    regexp_replace(e.dsendereco, '^[[:space:]]+|[[:space:]]+\$', '', 'g') endereco, regexp_replace(e.endereco_complemento, '^[[:space:]]+|[[:space:]]+\$', '', 'g') complemento, coalesce(nullif(regexp_replace(e.bairro_completo, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), regexp_replace(e.nmbairro, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) bairro, regexp_replace(e.nrcep, '^[[:space:]]+|[[:space:]]+\$', '', 'g') cep,
    regexp_replace(e.nmcidade, '^[[:space:]]+|[[:space:]]+\$', '', 'g') cidade, upper(regexp_replace(e.cduf, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) uf, m.codmunicipio ibge, regexp_replace(e.nrtelefone, '^[[:space:]]+|[[:space:]]+\$', '', 'g') fone, regexp_replace(e.nmemail, '^[[:space:]]+|[[:space:]]+\$', '', 'g') email
    from wphd.empresa e left join wcont.empcont ec on ec.idempresa=e.cdempresa left join wphd.municipiosibge m on m.idmunicipio=e.idmunicipio where e.cdempresa=${cd}`);
  if (c) {
    const vale = (v: unknown) => v !== null && v !== undefined && String(v) !== '';
    const razao = c.usa === 'S' && vale(c.nmnomecompleto) ? c.nmnomecompleto : c.nmempresa;
    const pares: Array<[string, unknown, string]> = [['razão social', razao, 'razaoSocial'], ['fantasia', c.fantasia, 'nomeFantasia'], ['natureza jurídica', c.natureza, 'naturezaJuridica'], ['CNAE', c.cnae, 'cnae'],
      ['IE', c.ie, 'inscricaoEstadual'], ['IM', c.im, 'inscricaoMunicipal'], ['NIRE', c.nire, 'nire'], ['abertura', c.abertura, 'dataAbertura'], ['endereço', c.endereco, 'endereco'],
      ['complemento', c.complemento, 'complemento'], ['bairro', c.bairro, 'bairro'], ['CEP', c.cep, 'cep'], ['cidade', c.cidade, 'municipio'], ['UF', c.uf, 'uf'], ['IBGE', c.ibge, 'ecdCodigoMunicipioIbge'],
      ['telefone', c.fone, 'telefone'], ['e-mail', c.email, 'email']];
    for (const [rot, v, k] of pares) if (vale(v)) igual(`cadastro ${rot}`, v, emp[k]);
    const [x] = json(banco, `select e.cdempresa::text cod, regexp_replace(e.dsatividade, '^[[:space:]]+|[[:space:]]+\$', '', 'g') ativ, regexp_replace(e.nrfax, '^[[:space:]]+|[[:space:]]+\$', '', 'g') fax, to_char(coalesce(e.dtregjuntacomercial, e.dtexpedicaonire),'DD/MM/YYYY') junta, to_char(e.dtnascimento,'DD/MM/YYYY') nasc,
      to_char(coalesce(e.dtiniservcont, e.escritorio_data_entrada),'DD/MM/YYYY') inicio, e.stativa ativa, regexp_replace(e.obs, '^[[:space:]]+|[[:space:]]+\$', '', 'g') obs from wphd.empresa e where e.cdempresa=${cd}`);
    for (const [rot, v, k] of [['código no sistema anterior', x.cod, 'codigoSistemaAnterior'], ['atividade', x.ativ, 'descricaoAtividade'], ['fax', x.fax, 'fax'], ['data da Junta', x.junta, 'juntaComercialData'],
      ['nascimento do responsável', x.nasc, 'responsavelNascimento'], ['início do serviço contábil', x.inicio, 'inicioServicoContabil'], ['observações', x.obs, 'observacoes']] as Array<[string, unknown, string]>) if (vale(v)) igual(`cadastro ${rot}`, v, emp[k]);
    if (x.ativa !== null) igual('cliente ativo no escritório', x.ativa, emp.ativaNoEscritorio);
    if (Number(c.capital) > 0) { igual('capital (centavos)', Math.round(Number(c.capital) * 100), Math.round(Number(emp.capitalSocial) * 100)); }
    if (vale(c.cidade) && vale(c.uf)) igual('cidade / UF', `${c.cidade} / ${c.uf}`, emp.cidadeUf);
    const [r] = json(banco, `select coalesce(nullif(regexp_replace(s.nome_completo, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), regexp_replace(s.nmsocio, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) nome, regexp_replace(s.nrcpf, '^[[:space:]]+|[[:space:]]+\$', '', 'g') cpf, coalesce(nullif(regexp_replace(se.stqualificacaosped, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), se.ecf_ecd_qualificacao_codigo::text) qual
      from wphd.socemp se join wphd.socios s on s.cdsocio=se.cdsocio where se.idempresa=${cd} and se.stresponsavelcgc and se.dtdemissao is null order by se.cdsocio limit 1`);
    if (r) { igual('responsável', r.nome, emp.responsavelNome); if (r.cpf) igual('CPF do responsável', r.cpf, emp.responsavelCpf); if (r.qual) igual('qualificação do responsável', r.qual, emp.responsavelQualificacao); }
    const qsa = json(banco, `select coalesce(nullif(regexp_replace(s.nome_completo, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), regexp_replace(s.nmsocio, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) nome from wphd.socemp se join wphd.socios s on s.cdsocio=se.cdsocio where se.idempresa=${cd} and se.dtdemissao is null order by se.cdsocio`);
    igual('quadro de sócios', qsa.map((x) => x.nome).join('; '), (emp.qsa || []).map((x: any) => x.nome).join('; '));
  }
  const [ct] = json(banco, `select regexp_replace(c.nome, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nome, regexp_replace(c.crc, '^[[:space:]]+|[[:space:]]+\$', '', 'g') crc, upper(regexp_replace(c.uf_crc, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) uf, lpad(c.cpf::text, 11, '0') cpf, regexp_replace(c.rg, '^[[:space:]]+|[[:space:]]+\$', '', 'g') rg, regexp_replace(c.orgao_expedidor_rg, '^[[:space:]]+|[[:space:]]+\$', '', 'g') orgao, to_char(c.data_emissao_rg,'DD/MM/YYYY') rgdata, case c.qualificacao when 'C' then 'Contador' when 'T' then 'Técnico em contabilidade' end cat, regexp_replace(c.email, '^[[:space:]]+|[[:space:]]+\$', '', 'g') email, regexp_replace(c.telefone, '^[[:space:]]+|[[:space:]]+\$', '', 'g') fone, regexp_replace(ec.nmcontador, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nmc, regexp_replace(ec.nrcrc, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nrcrc, regexp_replace(ec.nrcpf, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nrcpf, ec.nrlivrodiario livro
    from wcont.empcont ec left join wcont.contador c on c.id=ec.contador_id where ec.idempresa=${cd}`);
  if (ct) {
    const pares: Array<[string, unknown, string]> = ct.nome != null ? [['contador', ct.nome, 'contadorNome'], ['CRC', ct.crc, 'contadorCrc'], ['UF do CRC', ct.uf, 'contadorUfCrc'], ['CPF do contador', ct.cpf, 'contadorCpf'], ['e-mail do contador', ct.email, 'contadorEmail'], ['telefone do contador', ct.fone, 'contadorFone'], ['RG do contador', ct.rg, 'contadorRg'], ['órgão do RG', ct.orgao, 'contadorRgOrgao'], ['emissão do RG', ct.rgdata, 'contadorRgData'], ['categoria do contador', ct.cat, 'contadorCategoria']]
      : [['contador', ct.nmc, 'contadorNome'], ['CRC', ct.nrcrc, 'contadorCrc'], ['CPF do contador', ct.nrcpf, 'contadorCpf']];
    for (const [rot, v, k] of pares) if (v !== null && v !== undefined && v !== '') igual(rot, v, emp[k]);
    if (Number(ct.livro) > 0) igual('número do livro Diário', ct.livro, emp.ecdNumeroLivro);
  }
  // ---- plano de contas: código (máscara com '.'), descrição, tipo, natureza
  const porCodigo = new Map((payload.contas || []).map((x: any) => [x.codigo, x]));
  if (d.idPlano != null) {
    const contas = json(banco, `select idconta, replace(regexp_replace(cdclassinterna, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),'-','.') codigo, regexp_replace(nmconta, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nome, tpconta, idorigem, regexp_replace(cdchamada, '^[[:space:]]+|[[:space:]]+\$', '', 'g') reduzido from wcont.contas where idplanodecontas=${d.idPlano} and regexp_replace(coalesce(cdclassinterna,''), '^[[:space:]]+|[[:space:]]+\$', '', 'g')<>''`);
    for (const x of contas) {
      const codigo = d.mapaContas[String(x.idconta)];
      if (codigo !== x.codigo && !d.avisos.some((a) => a.includes(`(código ${x.codigo} no sistema anterior) recebeu o código ${codigo}`))) erros.push(`conta ${x.codigo}: código no Murade ${codigo || 'nenhum'} sem aviso`);
      const mur: any = porCodigo.get(codigo || x.codigo);
      if (!mur) { erros.push(`conta ${x.codigo} ${x.nome}: não está no plano do Murade`); continue; }
      igual(`conta ${x.codigo} descrição`, x.nome, mur.descricao);
      igual(`conta ${x.codigo} tipo`, x.tpconta === 'S' ? 'sintetica' : 'analitica', mur.tipo);
      if (x.idorigem === 'D' || x.idorigem === 'C') igual(`conta ${x.codigo} natureza`, x.idorigem, mur.natureza);
      if (x.reduzido) igual(`conta ${x.codigo} código reduzido`, x.reduzido, mur.codigoReduzido);
    }
    const [ab] = json(banco, `select c.idconta, replace(c.cdclassinterna,'-','.') codigo, c.tpconta from wcont.pcont p join wcont.contas c on c.idconta=p.idcontaaberturaimplantacao where p.idplanodecontas=${d.idPlano}`);
    if (ab && ab.tpconta === 'A') igual('contrapartida da abertura', d.mapaContas[String(ab.idconta)], emp.contaContrapartidaAberturaCodigo);
  }
  // ---- históricos padrão
  const hist = new Map((payload.historicosPadrao || []).map((h: any) => [String(h.codigo), h]));
  for (const h of json(banco, `select regexp_replace(cdchamada, '^[[:space:]]+|[[:space:]]+\$', '', 'g') codigo, regexp_replace(dshistoricopadrao, '^[[:space:]]+|[[:space:]]+\$', '', 'g') texto, stcomplemento comp from wcont.hist where regexp_replace(coalesce(dshistoricopadrao,''), '^[[:space:]]+|[[:space:]]+\$', '', 'g')<>''`)) { igual(`histórico ${h.codigo}`, h.texto, (hist.get(h.codigo) as any)?.texto); if (h.comp === 'S') igual(`histórico ${h.codigo} pede complemento`, true, (hist.get(h.codigo) as any)?.exigeComplemento); }
  // ---- lançamentos: cada partida simples (2 linhas) contra o banco
  if (psql(banco, `select to_regclass('wcont.mv${sfx}')`)) {
    const lanc = new Map((payload.lancamentos || []).map((l: any) => [l.id, l]));
    const pares = json(banco, `select d.idmovimento id, d.dtlancamento::date::text data, round((-d.vllancamento)::numeric*100)::bigint valor, coalesce(nullif(regexp_replace(d.dshistorico, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), nullif(regexp_replace(c.dshistorico, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), regexp_replace(h.dshistoricopadrao, '^[[:space:]]+|[[:space:]]+\$', '', 'g'), 'Lançamento do sistema anterior') hist,
      regexp_replace(d.dsdocumento, '^[[:space:]]+|[[:space:]]+\$', '', 'g') doc, regexp_replace(lt.cdchamada, '^[[:space:]]+|[[:space:]]+\$', '', 'g') lote, d.stencerramento enc, regexp_replace(lt.dslote, '^[[:space:]]+|[[:space:]]+\$', '', 'g') dslote, (to_jsonb(d)->>'identificador_sequencial') seq
      from wcont.mv${sfx} d join wcont.mv${sfx} c on c.idlote=d.idlote and c.idlotelancamento=d.idlotelancamento and c.dtlancamento=d.dtlancamento and c.idmovimento<>d.idmovimento and c.vllancamento=-d.vllancamento and c.idconta<>d.idconta
      left join wcont.hist h on h.idhistoricopadrao=d.idhistoricopadrao left join wcont.lt${sfx} lt on lt.idlote=d.idlote
      where d.vllancamento<0 and (select count(*) from wcont.mv${sfx} x where x.idlote=d.idlote and x.idlotelancamento=d.idlotelancamento and x.dtlancamento=d.dtlancamento)=2`);
    const naoEntraram = new Set(d.naoEntraram.map((x) => x.idmovimento));
    for (const p of pares) {
      if (naoEntraram.has(p.id)) continue; // linha que não pôde entrar (sem plano de contas): está no registro, com o motivo
      const l: any = lanc.get(`sa-${cd}-${p.id}`);
      if (!l) { erros.push(`lançamento ${p.id} de ${p.data}: não está no Murade`); continue; }
      igual(`lançamento ${p.data} data`, p.data, l.data);
      igual(`lançamento ${p.data} valor (centavos)`, Number(p.valor), Math.round(Number((l.valor * 100).toPrecision(15))));
      igual(`lançamento ${p.data} histórico`, p.hist, l.historico);
      const ref = [p.lote ? `Lote ${p.lote}` : '', p.doc ? `Doc ${p.doc}` : ''].filter(Boolean).join(' · ');
      igual(`lançamento ${p.data} documento`, ref, l.documentoRef);
      if (p.enc) igual(`lançamento ${p.data} encerramento`, 'encerramento', l.tipoEspecial);
      if (p.dslote) igual(`lançamento ${p.data} descrição do lote`, p.dslote, l.loteDescricao);
      if (Number(p.seq) > 0) igual(`lançamento ${p.data} número sequencial`, Number(p.seq), l.numeroSequencial);
    }
  }
  // ---- imobilizado
  if (psql(banco, `select to_regclass('wativo.be${sfx}')`)) {
    const bens = new Map((payload.bensImobilizado || []).map((b: any) => [b.id, b]));
    for (const b of json(banco, `select idbem, regexp_replace(dsbem, '^[[:space:]]+|[[:space:]]+\$', '', 'g') ds, round(coalesce(nullif(vloriginalmoeda,0), vlcompra)::numeric*100)::bigint custo, round(1200/nullif(txdepreciacao,0))::int vida, to_char(coalesce(dtinidepreciacao, dtaquisicao),'YYYY-MM') ini from wativo.be${sfx}`)) {
      const m: any = bens.get(`sa-bem-${cd}-${b.idbem}`);
      if (!m) { erros.push(`bem ${b.ds}: não está no Imobilizado`); continue; }
      igual(`bem ${b.ds} descrição`, b.ds, m.descricao); igual(`bem ${b.ds} custo`, Number(b.custo), m.custoCentavos);
      igual(`bem ${b.ds} vida útil`, b.vida, m.vidaUtilMeses); igual(`bem ${b.ds} início`, b.ini, m.inicioDepreciacao);
    }
  }
  // ---- títulos a pagar/receber (com baixas) e cartões (antiga DIRF): SQL próprio x estrutura do Contábil
  const titulos = new Map(d.titulos.map((t) => [t.origemId, t]));
  for (const x of json(banco, `select t.idtitulo id, case when t.tipodocumento='S' then 'receber' else 'pagar' end tipo, regexp_replace(t.nrdocumento, '^[[:space:]]+|[[:space:]]+\$', '', 'g') numero, nullif(regexp_replace(t.nmserienf, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),'') serie, nullif(regexp_replace(t.idmoddocfiscal, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),'') modelo,
      coalesce(nullif(regexp_replace(t.cnpj_cpf, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), nullif(regexp_replace(t.cdforcli, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),'')) doc, regexp_replace(t.nmfornecedor, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nome, t.dtcontabil::text data, round(t.vltitulo::numeric*100)::bigint valor,
      (select coalesce(json_agg(json_build_array(b.dtbaixa::date::text, round(b.vlbaixa::numeric*100)::bigint, nullif(regexp_replace(b.nrdocbaixa, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), nullif(regexp_replace(b.historico_padrao_descricao, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),'')) order by b.dtbaixa), '[]') from wcont.baixa_titulos b where b.idtitulo=t.idtitulo) baixas
      from wcont.titulos t where t.idempresa=${cd}`)) {
    const m: any = titulos.get(x.id);
    if (!m) { erros.push(`título ${x.numero}: não veio`); continue; }
    igual(`título ${x.numero} tipo`, x.tipo, m.tipo); igual(`título ${x.numero} número`, x.numero, m.numero); igual(`título ${x.numero} série`, x.serie ?? '', m.serie ?? '');
    igual(`título ${x.numero} modelo`, x.modelo ?? '', m.modelo ?? ''); igual(`título ${x.numero} documento`, x.doc ?? '', m.participanteDocumento ?? ''); igual(`título ${x.numero} nome`, x.nome, m.participanteNome);
    igual(`título ${x.numero} data`, x.data, m.dataEmissao); igual(`título ${x.numero} valor`, Number(x.valor), m.valorCentavos);
    igual(`título ${x.numero} baixas`, JSON.stringify(x.baixas), JSON.stringify(m.baixas.map((b: any) => [b.data, b.valorCentavos, b.documento ?? null, b.historico ?? null])));
  }
  const cartoes = new Map(d.cartoes.map((c) => [c.origemId, c]));
  for (const x of json(banco, `select e.id::text id, o.nome operadora, regexp_replace(e.codigo_estabelecimento, '^[[:space:]]+|[[:space:]]+\$', '', 'g') cod, (select coalesce(json_agg(json_build_array(m.referencia::text, round(m.valor_rendimento::numeric*100)::bigint, round(m.valor_ir::numeric*100)::bigint) order by m.referencia, m.id), '[]') from wcont.movimento_cartao_credito m where m.estabelecimento_cartao_credito_id=e.id) movs
      from wcont.estabelecimento_cartao_credito e left join wcont.operadora_cartao_de_credito o on o.id=e.operadora where e.empresa_id=${cd}`)) {
    const m: any = cartoes.get(x.id);
    if (!m) { erros.push(`cartão ${x.cod}: não veio`); continue; }
    igual(`cartão ${x.cod} operadora`, x.operadora, m.operadora); igual(`cartão ${x.cod} estabelecimento`, x.cod, m.codigoEstabelecimento);
    igual(`cartão ${x.cod} movimentos`, JSON.stringify(x.movs), JSON.stringify(m.movimentos.map((v: any) => [v.referencia, v.rendimentoCentavos, v.irCentavos])));
    if (JSON.stringify(m).includes('"senha"')) erros.push(`cartão ${x.cod}: senha não pode vir`);
  }
  // ---- modelos de lançamento (lauto + lcontas do plano da empresa) x modelos do lançamento manual
  if (d.idPlano != null) {
    const mods = new Map((payload.lancamentosPadrao || []).map((m: any) => [m.id, m]));
    for (const x of json(banco, `select distinct on (l.idlancautomatico) l.idlancautomatico id, regexp_replace(l.dslancautomatico, '^[[:space:]]+|[[:space:]]+\$', '', 'g') nome, regexp_replace(l.cdchamada, '^[[:space:]]+|[[:space:]]+\$', '', 'g') codigo, c.idcontadevedora deb, c.idcontacredora cred, coalesce(nullif(regexp_replace(h.dshistoricopadrao, '^[[:space:]]+|[[:space:]]+\$', '', 'g'),''), regexp_replace(l.dslancautomatico, '^[[:space:]]+|[[:space:]]+\$', '', 'g')) hist
        from wcont.lauto l join wcont.lcontas c on c.idlancautomatico=l.idlancautomatico left join wcont.hist h on h.idhistoricopadrao=c.idhistoricopadrao
        where c.idplanodecontas=${d.idPlano} order by l.idlancautomatico, c.idregistro`)) {
      const m: any = mods.get(`sa-lauto-${x.id}`.slice(0, 64));
      const deb = d.mapaContas[String(x.deb)]; const cred = d.mapaContas[String(x.cred)];
      if (!m) { if (deb && cred && deb !== cred && (porCodigo.get(deb) as any)?.tipo === 'analitica' && (porCodigo.get(cred) as any)?.tipo === 'analitica') erros.push(`modelo ${x.codigo} ${x.nome}: não veio`); continue; }
      igual(`modelo ${x.codigo} nome`, x.nome, m.nome); igual(`modelo ${x.codigo} código`, x.codigo, m.codigo); igual(`modelo ${x.codigo} débito`, deb, m.contaUnica);
      igual(`modelo ${x.codigo} crédito`, cred, m.partidas[0].conta); igual(`modelo ${x.codigo} histórico`, x.hist, m.historico);
    }
  }
  // ---- por tabela: colunas preenchidas e o que fica no registro (cada valor igual ao banco)
  const ec = json(banco, `select contador_id from wcont.empcont where idempresa=${cd}`)[0];
  const usados = new Set([...(d.blocos.lancamentos_originais || []), ...(d.blocos.saldos || [])].map((x: any) => Number(x.idconta)));
  const fontes: Array<[string, string, string?, ((l: any) => boolean)?]> = [
    ['wphd.empresa', `cdempresa=${cd}`],
    ['wcont.empcont', `idempresa=${cd}`],
    ['wcont.contador', ec?.contador_id != null ? `id=${ec.contador_id}` : 'false'],
    ['wphd.socemp', `idempresa=${cd}`, 'socios_empresa'],
    ['wphd.socios', `cdsocio in (select cdsocio from wphd.socemp where idempresa=${cd})`],
    ['wphd.municipiosibge', `idmunicipio=(select idmunicipio from wphd.empresa where cdempresa=${cd})`],
    ['wphd.empresahistorico', `cdempresa=${cd}`], ['wphd.historico_nire', `empresa_id=${cd}`], ['wphd.historico_retencao', `empresa_id=${cd}`], ['wphd.travacontabil', `idempresa=${cd}`],
    ['wcont.pcont', d.idPlano != null ? `idplanodecontas=${d.idPlano}` : 'false'],
    ['wcont.contas', d.idPlano != null ? `idplanodecontas=${d.idPlano}${usados.size ? ` or idconta in (${[...usados].join(',')})` : ''}` : (usados.size ? `idconta in (${[...usados].join(',')})` : 'false')],
    ['wcont.hist', 'true'],
    [`wcont.mv${sfx}`, 'true'], [`wcont.sd${sfx}`, 'true'], [`wcont.lt${sfx}`, 'true'], [`wativo.be${sfx}`, 'true'],
    ['wcont.lancamento', `idempresa=${cd}`],
    ['wcont.lcontas', d.idPlano != null ? `idplanodecontas=${d.idPlano}` : 'false'],
    ['wcont.lauto', d.idPlano != null ? `idlancautomatico in (select idlancautomatico from wcont.lcontas where idplanodecontas=${d.idPlano})` : 'false'],
    ['wcont.titulos', `idempresa=${cd}`], ['wcont.baixa_titulos', `idtitulo in (select idtitulo from wcont.titulos where idempresa=${cd})`], ['wcont.titulos_provisao', `idempresa=${cd}`],
    ['wcont.estabelecimento_cartao_credito', `empresa_id=${cd}`], ['wcont.operadora_cartao_de_credito', `id in (select operadora from wcont.estabelecimento_cartao_credito where empresa_id=${cd})`], ['wcont.movimento_cartao_credito', `estabelecimento_cartao_credito_id in (select id from wcont.estabelecimento_cartao_credito where empresa_id=${cd})`],
    ['wcont.lancamento_identificador_sequencial', `empresa_id=${cd}`], ['wcont.ecf_linha_conta', `empresa_id=${cd}`],
    ['wcont.ecf_conta_configuracao', d.idPlano != null ? `conta_id in (select idconta from wcont.contas where idplanodecontas=${d.idPlano})` : 'false'],
    ['wcont.demonstrativo_contabil_configuracao', d.idPlano != null ? `plano_de_contas_id=${d.idPlano}` : 'false'],
    ['wcont.textoassinatura', 'true', undefined, (l) => l.modelo === 'livros'], ['wcont.textoassbalanco', 'true', undefined, (l) => l.modelo === 'balanço'],
    ['wativo.emp_ativ', `idempresa=${cd}`], ['wativo.empcfg', `idempresa=${cd}`],
  ];
  for (const [tabela, filtro, blocoForcado, filtroBloco] of fontes) {
    const db = linhasDb(banco, tabela, filtro);
    if (!db.length) continue;
    registrarColunas(tabela, db);
    const chave = tabela.replace(/(\.(mv|sd|lt|be))\d{5}$/, '$1');
    const bloco = blocoForcado || DESTINO_COLUNAS[chave]?.bloco;
    if (!bloco) continue;
    let guardado = d.blocos[bloco] || [];
    if (filtroBloco) guardado = guardado.filter(filtroBloco);
    // wcont.contas: o bloco tem também as contas-mãe de outro plano; compara só as linhas que o banco trouxe.
    if (tabela === 'wcont.contas') { const ids = new Set(db.map((x) => Number(x.idconta))); guardado = guardado.filter((x: any) => ids.has(Number(x.idconta))); }
    const antes = erros.length;
    conferirBloco(tabela, db, JSON.parse(JSON.stringify(guardado)), erros);
    if (erros.length === antes) consulta += db.reduce((s, l) => s + Object.values(l).filter(preenchido).length, 0);
  }
  return { valores, consulta, erros };
}

main().catch((e) => { console.error(e); process.exit(1); });
