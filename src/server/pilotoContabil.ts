// PILOTO VISÍVEL no Murade Contábil — lado do servidor.
// Monta o campo `piloto` da resposta da Agente: { titulo, passos: [{ tipo, alvo, valor?, legenda }] }. O servidor só descreve
// o que mostrar e preencher; quem executa é o front (src/utils/pilotoVisivel.ts). Nada aqui grava, salva nem confirma:
// todo plano de preenchimento termina em `parar_no_botao`, e quem clica é o contador.
//
// Regras: escopo por empresa da sessão (só empresas que a rota /api/workspaces devolve), nunca credencial, nunca consulta paga,
// nunca calcula valor (o valor sai exatamente como o contador/Agente informou, só validado e com vírgula trocada por ponto).
import { erroApi, ok, q, type ContextoAgente, type Ferramenta } from './agenteMotor';
import { CAMPOS_CONTABIL, IDS_DE_TELAS_CONTABIL, SECOES_CONTABIL, TELAS_CONTABIL, alvoDoCampo, campoDoMapa, type SecaoMapa, type TelaMapa } from '../data/mapaTelasContabil';
import { MARCA_SO_MOSTRAR, validarPlanoPiloto, type PassoPiloto, type PlanoPiloto } from '../utils/pilotoVisivel';
import { FUNCOES_QUE_FALTAM } from '../data/funcoesQueFaltam';
import { OFERTA_LEVAR, respostaDoQueFalta, acharPorApelidos, assuntoDoPedidoDeLugar, ehPedidoDeLevar, ehPerguntaDeLocal, ehPerguntaSeTem, ehSimParaLevar, ofereceuLevar, respostaTemSim, semAcentoAgil } from '../data/agenteAgil';
import { calcularProximoCodigoSequencial } from '../utils/planoContasUtils';

const limpaCnpj = (v: unknown): string | null => { const d = String(v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(); return /^[A-Z0-9]{12}\d{2}$/.test(d) ? d : null; };
const fmtCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const competenciaValida = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.trim()) ? v.trim() : null);
const txt = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** "1500,5" ou "1500.50" → "1500.5"/"1500.50". Só troca a vírgula pelo ponto; não arredonda nem calcula. Milhar ("1.500,00") é recusado. */
export function valorParaTela(v: unknown): { ok: true; valor: string } | { ok: false } {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (/^\d{1,12}(\.\d{1,2})?$/.test(s)) return /^0+(\.0+)?$/.test(s) ? { ok: false } : { ok: true, valor: s };
  if (/^\d{1,12}(,\d{1,2})?$/.test(s)) return /^0+(,0+)?$/.test(s) ? { ok: false } : { ok: true, valor: s.replace(',', '.') };
  return { ok: false };
}
/** Só para a legenda: 1500.5 → "1.500,50" sem usar ponto flutuante. */
export function valorParaLegenda(v: string): string {
  const [i, d = ''] = v.split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(d + '00').slice(0, 2)}`;
}
export function dataParaTela(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let d: number, m: number, a: number;
  let r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (r) { d = +r[1]; m = +r[2]; a = +r[3]; } else if ((r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { a = +r[1]; m = +r[2]; d = +r[3]; } else return null;
  const t = new Date(Date.UTC(a, m - 1, d));
  if (a < 1990 || a > 2100 || t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

type EmpresaLida = { cnpj: string; nome: string };
async function empresasDoUsuario(ctx: ContextoAgente): Promise<EmpresaLida[] | { erro: string }> {
  const r = await ctx.chamarApi('GET', '/api/workspaces');
  if (!ok(r)) return erroApi(r);
  return (r.corpo?.empresas || []).map((e: any) => ({ cnpj: String(e.cnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase(), nome: String(e.razaoSocial || e.nomeFantasia || e.nome || '') }));
}
async function acharEmpresa(ctx: ContextoAgente, cnpjArg: unknown): Promise<EmpresaLida | { erro: string }> {
  const cnpj = limpaCnpj(cnpjArg);
  if (!cnpj) return { erro: 'Informe o CNPJ da empresa (use listar_empresas).' };
  const lista = await empresasDoUsuario(ctx);
  if ('erro' in lista) return lista;
  const e = lista.find((x) => x.cnpj === cnpj);
  return e || { erro: 'Essa empresa não está entre as empresas liberadas para este usuário.' };
}

function plano(titulo: string, passos: PassoPiloto[]): { piloto: PlanoPiloto } | { erro: string } {
  const v = validarPlanoPiloto({ titulo, passos });
  if ('plano' in v) return { piloto: v.plano };
  return { erro: `Não consegui montar o roteiro na tela: ${v.motivo}` };
}
const passoEmpresa = (e: EmpresaLida): PassoPiloto => ({ tipo: 'selecionar', alvo: '[data-campo=empresa-ativa]', valor: e.cnpj, legenda: `Escolhendo a empresa ${e.nome || fmtCnpj(e.cnpj)}` });
const passoTela = (id: string, rotulo: string): PassoPiloto => ({ tipo: 'navegar', alvo: `#btn-menu-${id}`, legenda: `Abrindo a tela ${rotulo}` });

const INSTRUCAO_RESULTADO = 'O roteiro foi enviado para a tela do usuário: ela vai mudar sozinha. Diga em UMA frase curta o que ele vai ver (sem repetir os dados) e que pode interromper a qualquer momento. Se terminou num botão de gravar, diga que quem confirma é ele.';

// ---------------------------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------------------------
const telasTexto = TELAS_CONTABIL.map((t) => `${t.id} (${t.rotulo})`).join(', ');
const camposTexto = [...CAMPOS_CONTABIL.filter((c) => c.abre || c.tela === 'empresa' || TELAS_CONTABIL.some((t) => t.periodo === c.chave)).filter((c) => !c.final).map((c) => c.chave), ...SECOES_CONTABIL.map((s) => s.chave)].join(', ');

export const FERRAMENTAS_PILOTO: Ferramenta[] = [
  {
    tipo: 'leitura',
    declaracao: {
      name: 'mostrar_na_tela',
      description: `Muda a tela do usuário sozinha para MOSTRAR algo: navega até a tela, escolhe a empresa e a competência, rola e destaca com anel e seta o ponto exato. Use quando pedirem "mostre onde está o problema", "abre o balancete da empresa X", "me leva lá". Só mostra: não preenche nem grava. Telas: ${telasTexto}.`,
      parameters: { type: 'OBJECT', properties: {
        tela: { type: 'STRING', description: 'Identificador da tela (um dos ids da lista).' },
        cnpj: { type: 'STRING', description: 'Opcional. CNPJ da empresa a deixar ativa antes de abrir a tela.' },
        competencia: { type: 'STRING', description: 'Opcional. Competência AAAA-MM, só para telas que têm seletor de competência (balancete, gestao-contabil).' },
        destaque: { type: 'STRING', description: `Opcional. O que destacar na tela. Um destes: ${camposTexto}.` },
        motivo: { type: 'STRING', description: 'Opcional. Frase curta que aparece como legenda do destaque, por exemplo "Aqui estão os 3 pré-lançamentos pendentes".' },
      }, required: ['tela'] },
    },
    async executar(ctx, args) {
      const tela = TELAS_CONTABIL.find((t) => t.id === String(args.tela || '').trim());
      if (!tela || !IDS_DE_TELAS_CONTABIL.has(tela.id)) return { erro: `Tela desconhecida. Use uma destas: ${telasTexto}.` };
      const passos: PassoPiloto[] = [];
      let empresa: EmpresaLida | null = null;
      if (args.cnpj) { const e = await acharEmpresa(ctx, args.cnpj); if ('erro' in e) return e; empresa = e; passos.push(passoEmpresa(e)); }
      const motivo = txt(args.motivo, 140);
      passos.push({ ...passoTela(tela.id, tela.rotulo), ...(motivo && !args.destaque && !args.competencia ? { legenda: motivo } : {}) });
      if (args.competencia) {
        const c = competenciaValida(args.competencia);
        if (!c) return { erro: 'Competência inválida. Use AAAA-MM.' };
        if (!tela.periodo) return { erro: `A tela ${tela.rotulo} não tem seletor de competência.` };
        passos.push({ tipo: 'selecionar', alvo: alvoDoCampo(tela.periodo), valor: c, legenda: `Escolhendo a competência ${c.slice(5)}/${c.slice(0, 4)}` });
      }
      if (args.destaque) {
        const chave = String(args.destaque).trim();
        const sec = SECOES_CONTABIL.find((s) => s.chave === chave && s.tela === tela.id);
        const visiveis = CAMPOS_CONTABIL.filter((c) => c.tela === tela.id && !c.final && (c.abre || c.tela === 'empresa' || c.chave === tela.periodo)); // campos de formulário em janela só aparecem depois de abrir
        const campo = visiveis.find((c) => c.chave === chave);
        if (sec) passos.push({ tipo: 'destacar', alvo: `texto:${sec.texto}`, legenda: motivo || `Aqui: ${sec.texto}` });
        else if (campo) passos.push({ tipo: 'destacar', alvo: alvoDoCampo(campo.chave), legenda: motivo || `Aqui: ${campo.rotulo}` });
        else return { erro: `Não conheço esse ponto da tela ${tela.rotulo}. Pontos conhecidos: ${[...SECOES_CONTABIL.filter((s) => s.tela === tela.id).map((s) => s.chave), ...visiveis.map((c) => c.chave)].join(', ') || 'nenhum (mostre só a tela)'}.` };
      }
      const p = plano(`Mostrar ${tela.rotulo}${empresa ? ` — ${empresa.nome || fmtCnpj(empresa.cnpj)}` : ''}`, passos);
      if ('erro' in p) return p;
      return { status: 'piloto_preparado', instrucao: INSTRUCAO_RESULTADO, ...p };
    },
  },
  {
    tipo: 'leitura',
    declaracao: {
      name: 'preencher_na_tela',
      description: 'Preenche à vista, campo por campo, um formulário principal para o contador aprender como se faz, e PARA no botão de gravar (quem clica é o contador). Formulários: "lancamento" (lançamento contábil manual de uma empresa), "conta" (nova conta no plano de contas de uma empresa) e "empresa" (cadastro de empresa). Só preenche os valores que o usuário informou: nunca invente nem calcule valor, conta, data ou CNPJ. Se faltar algum dado, pergunte antes.',
      parameters: { type: 'OBJECT', properties: {
        formulario: { type: 'STRING', description: 'lancamento, conta ou empresa.' },
        cnpj: { type: 'STRING', description: 'Obrigatório para lancamento e conta: CNPJ da empresa em que o formulário será preenchido.' },
        data: { type: 'STRING', description: 'lancamento: data DD/MM/AAAA ou AAAA-MM-DD.' },
        valor: { type: 'STRING', description: 'lancamento: valor em reais, como 1500.50 ou 1500,50 (sem separador de milhar).' },
        conta_debito: { type: 'STRING', description: 'lancamento: código da conta analítica a débito, por exemplo 1.1.01.' },
        conta_credito: { type: 'STRING', description: 'lancamento: código da conta analítica a crédito.' },
        historico: { type: 'STRING', description: 'lancamento: histórico da operação.' },
        conta_pai: { type: 'STRING', description: 'conta: código da conta sintética pai, por exemplo 1.1.' },
        descricao: { type: 'STRING', description: 'conta: nome da nova conta.' },
        tipo: { type: 'STRING', description: 'conta: analitica ou sintetica (opcional).' },
        natureza: { type: 'STRING', description: 'conta: D (devedora) ou C (credora) (opcional).' },
        cnpj_empresa: { type: 'STRING', description: 'empresa: CNPJ da empresa que está sendo cadastrada.' },
        razao_social: { type: 'STRING' }, nome_fantasia: { type: 'STRING' },
        regime: { type: 'STRING', description: 'empresa: Simples Nacional, Lucro Presumido, Lucro Real ou MEI.' },
        inscricao_estadual: { type: 'STRING' }, inscricao_municipal: { type: 'STRING' }, cep: { type: 'STRING' }, cidade_uf: { type: 'STRING' },
        endereco: { type: 'STRING' }, telefone: { type: 'STRING' }, email: { type: 'STRING' }, responsavel: { type: 'STRING' },
      }, required: ['formulario'] },
    },
    async executar(ctx, args) {
      const f = String(args.formulario || '').trim().toLowerCase();
      if (f === 'lancamento') return montarLancamento(ctx, args);
      if (f === 'conta') return montarConta(ctx, args);
      if (f === 'empresa') return montarEmpresa(args);
      return { erro: 'Formulário desconhecido. Use lancamento, conta ou empresa.' };
    },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'continuar_piloto', description: 'O contador pediu para CONTINUAR o que você estava mostrando ou preenchendo na tela ("pode continuar", "continua", "segue"). Retoma do passo em que parou.', parameters: { type: 'OBJECT', properties: {} } },
    async executar() { return { status: 'comando_enviado', instrucao: 'Diga em poucas palavras que está continuando de onde parou.', piloto: { comando: 'continuar' } }; },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'piloto_segundo_plano', description: 'O contador pediu para terminar EM SEGUNDO PLANO ("pode continuar em segundo plano", "faz por trás enquanto eu uso outra tela"). O piloto termina de verdade, sem animação (abre a tela, preenche, aperta o que só abre), mostra o andamento num chip pequeno e avisa quando acaba ou se algo falhar; o que grava continua pedindo o OK.', parameters: { type: 'OBJECT', properties: {} } },
    async executar() { return { status: 'comando_enviado', instrucao: 'Diga em uma frase que vai terminar em segundo plano, mostrando o andamento, e avisar quando acabar; o que grava continua pedindo o OK dele.', piloto: { comando: 'segundo_plano' } }; },
  },
  {
    tipo: 'leitura',
    declaracao: { name: 'cancelar_piloto', description: 'O contador pediu para CANCELAR/PARAR o que você estava mostrando ou preenchendo na tela ("cancela", "para"). O que já foi preenchido continua na tela.', parameters: { type: 'OBJECT', properties: {} } },
    async executar() { return { status: 'comando_enviado', instrucao: 'Confirme em uma frase que cancelou e que o que já foi preenchido continua na tela.', piloto: { comando: 'cancelar' } }; },
  },
];

// ---------------------------------------------------------------------------------------------
// Montagem dos formulários
// ---------------------------------------------------------------------------------------------
async function montarLancamento(ctx: ContextoAgente, args: Record<string, any>): Promise<Record<string, unknown>> {
  const emp = await acharEmpresa(ctx, args.cnpj); if ('erro' in emp) return emp;
  const data = dataParaTela(args.data);
  if (!data) return { erro: 'Data inválida. Pergunte ao usuário a data real do lançamento (DD/MM/AAAA).' };
  const valor = valorParaTela(args.valor);
  if (!valor.ok) return { erro: 'Valor inválido. Pergunte o valor em reais, maior que zero, como 1500.50 (sem separador de milhar). Não calcule nem arredonde por conta própria.' };
  const historico = txt(args.historico, 200);
  if (historico.length < 3) return { erro: 'Falta o histórico do lançamento. Pergunte ao usuário.' };
  const ws = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}`);
  if (!ok(ws)) return erroApi(ws);
  const contas: any[] = Array.isArray(ws.corpo?.dados?.contas) ? ws.corpo.dados.contas : [];
  if (!contas.length) return { erro: 'Esta empresa ainda não tem plano de contas salvo.' };
  const cod = (v: unknown) => String(v ?? '').trim();
  const deb = contas.find((c) => c?.codigo === cod(args.conta_debito));
  const cre = contas.find((c) => c?.codigo === cod(args.conta_credito));
  if (!deb || deb.tipo !== 'analitica') return { erro: `A conta a débito "${cod(args.conta_debito)}" não existe como conta analítica no plano desta empresa. Pergunte ao usuário qual conta usar; não escolha por conta própria.` };
  if (!cre || cre.tipo !== 'analitica') return { erro: `A conta a crédito "${cod(args.conta_credito)}" não existe como conta analítica no plano desta empresa. Pergunte ao usuário qual conta usar; não escolha por conta própria.` };
  if (deb.codigo === cre.codigo) return { erro: 'A conta a débito e a conta a crédito precisam ser diferentes.' };
  const competencia = `${data.slice(6)}-${data.slice(3, 5)}`;
  const fech = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}/fechamentos`);
  if (ok(fech) && (fech.corpo?.fechamentos || []).some((x: any) => x.competencia === competencia)) return { erro: `A competência ${competencia.slice(5)}/${competencia.slice(0, 4)} já está fechada: o sistema não aceita lançamento nela.` };
  const nome = (c: any) => `${c.codigo}${c.descricao ? ` — ${String(c.descricao).slice(0, 40)}` : ''}`;
  const p = plano(`Preencher lançamento manual — ${emp.nome || fmtCnpj(emp.cnpj)}`, [
    passoEmpresa(emp),
    passoTela('lancamentos', 'Lançamentos'),
    { tipo: 'navegar', alvo: alvoDoCampo('btn-novo-lancamento'), legenda: 'Abrindo o formulário "+ Lançamento Manual"' },
    { tipo: 'preencher', alvo: alvoDoCampo('lancamento-data'), valor: data, legenda: `Estou preenchendo a data do lançamento: ${data}` },
    { tipo: 'preencher', alvo: alvoDoCampo('lancamento-valor'), valor: valor.valor, legenda: `Estou preenchendo o valor: R$ ${valorParaLegenda(valor.valor)}` },
    { tipo: 'preencher', alvo: alvoDoCampo('lancamento-debito-codigo'), valor: deb.codigo, legenda: `Estou preenchendo a conta de débito: ${nome(deb)}` },
    { tipo: 'preencher', alvo: alvoDoCampo('lancamento-credito-codigo'), valor: cre.codigo, legenda: `Estou preenchendo a conta de crédito: ${nome(cre)}` },
    { tipo: 'preencher', alvo: alvoDoCampo('lancamento-historico'), valor: historico, legenda: 'Estou preenchendo o histórico da operação' },
    { tipo: 'parar_no_botao', alvo: alvoDoCampo('lancamento-gravar'), legenda: 'Gravar Lançamento. Confira os dados; o lançamento só é gravado quando você clicar' },
  ]);
  if ('erro' in p) return p;
  return { status: 'piloto_preparado', instrucao: INSTRUCAO_RESULTADO, ...p };
}

async function montarConta(ctx: ContextoAgente, args: Record<string, any>): Promise<Record<string, unknown>> {
  const emp = await acharEmpresa(ctx, args.cnpj); if ('erro' in emp) return emp;
  const descricao = txt(args.descricao, 120);
  if (descricao.length < 3) return { erro: 'Falta o nome da nova conta. Pergunte ao usuário.' };
  const ws = await ctx.chamarApi('GET', `/api/workspaces/${q(emp.cnpj)}`);
  if (!ok(ws)) return erroApi(ws);
  const contas: any[] = Array.isArray(ws.corpo?.dados?.contas) ? ws.corpo.dados.contas : [];
  const paiCod = String(args.conta_pai ?? '').trim();
  const pai = contas.find((c) => c?.codigo === paiCod);
  if (!pai || pai.tipo !== 'sintetica') return { erro: `A conta pai "${paiCod}" não existe como conta sintética no plano desta empresa. Pergunte ao usuário em qual grupo a conta entra.` };
  const tipo = args.tipo ? String(args.tipo).trim().toLowerCase() : '';
  if (tipo && !['analitica', 'sintetica'].includes(tipo)) return { erro: 'Tipo inválido. Use analitica ou sintetica.' };
  const nat = args.natureza ? String(args.natureza).trim().toUpperCase() : '';
  if (nat && !['D', 'C'].includes(nat)) return { erro: 'Natureza inválida. Use D (devedora) ou C (credora).' };
  let proximo = '';
  try { proximo = calcularProximoCodigoSequencial(contas, pai.codigo).proximoCodigo; } catch { /* a legenda segue sem o código */ }
  const passos: PassoPiloto[] = [
    passoEmpresa(emp),
    passoTela('plano-contas', 'Plano de Contas'),
    { tipo: 'navegar', alvo: alvoDoCampo('btn-nova-conta'), legenda: 'Abrindo o formulário "+ Nova Conta na Sequência"' },
    { tipo: 'selecionar', alvo: alvoDoCampo('conta-pai'), valor: pai.codigo, legenda: `Escolhendo o grupo da conta: ${pai.codigo}${pai.descricao ? ` — ${String(pai.descricao).slice(0, 40)}` : ''}` },
    { tipo: 'destacar', alvo: alvoDoCampo('conta-codigo'), legenda: proximo ? `O código sai sozinho, na sequência do grupo: ${proximo}` : 'O código sai sozinho, na sequência do grupo' },
    { tipo: 'preencher', alvo: alvoDoCampo('conta-descricao'), valor: descricao, legenda: 'Estou preenchendo o nome da conta' },
  ];
  if (tipo) passos.push({ tipo: 'selecionar', alvo: alvoDoCampo('conta-tipo'), valor: tipo, legenda: `Escolhendo o tipo: ${tipo === 'analitica' ? 'analítica (recebe lançamentos)' : 'sintética (totalizadora)'}` });
  if (nat) passos.push({ tipo: 'selecionar', alvo: alvoDoCampo('conta-natureza'), valor: nat, legenda: `Escolhendo a natureza: ${nat === 'D' ? 'devedora' : 'credora'}` });
  passos.push({ tipo: 'parar_no_botao', alvo: alvoDoCampo('conta-gravar'), legenda: 'Gravar Conta na Sequência. Confira; a conta só é criada quando você clicar' });
  const p = plano(`Preencher nova conta do plano — ${emp.nome || fmtCnpj(emp.cnpj)}`, passos);
  if ('erro' in p) return p;
  return { status: 'piloto_preparado', instrucao: INSTRUCAO_RESULTADO, ...p };
}

const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'];
async function montarEmpresa(args: Record<string, any>): Promise<Record<string, unknown>> {
  const passos: PassoPiloto[] = [passoTela('empresa', 'Cadastro de Empresa')];
  const add = (chave: string, valor: unknown, legenda: string, max = 120) => { const v = txt(valor, max); if (v) passos.push({ tipo: 'preencher', alvo: alvoDoCampo(chave), valor: v, legenda }); };
  if (args.cnpj_empresa) { const c = limpaCnpj(args.cnpj_empresa); if (!c) return { erro: 'CNPJ da empresa inválido.' }; passos.push({ tipo: 'preencher', alvo: alvoDoCampo('empresa-cnpj'), valor: fmtCnpj(c), legenda: `Estou preenchendo o CNPJ: ${fmtCnpj(c)}` }); }
  add('empresa-razao-social', args.razao_social, 'Estou preenchendo a razão social');
  add('empresa-nome-fantasia', args.nome_fantasia, 'Estou preenchendo o nome fantasia');
  if (args.regime) {
    const r = REGIMES.find((x) => x.toLowerCase() === String(args.regime).trim().toLowerCase());
    if (!r) return { erro: `Regime inválido. Use: ${REGIMES.join(', ')}.` };
    passos.push({ tipo: 'selecionar', alvo: alvoDoCampo('empresa-regime'), valor: r, legenda: `Escolhendo o regime tributário: ${r}` });
  }
  add('empresa-ie', args.inscricao_estadual, 'Estou preenchendo a inscrição estadual', 30);
  add('empresa-im', args.inscricao_municipal, 'Estou preenchendo a inscrição municipal', 30);
  add('empresa-cep', args.cep, 'Estou preenchendo o CEP', 12);
  add('empresa-cidade-uf', args.cidade_uf, 'Estou preenchendo a cidade e a UF', 80);
  add('empresa-endereco', args.endereco, 'Estou preenchendo o endereço', 160);
  add('empresa-telefone', args.telefone, 'Estou preenchendo o telefone', 30);
  add('empresa-email', args.email, 'Estou preenchendo o e-mail de contato', 120);
  add('empresa-responsavel', args.responsavel, 'Estou preenchendo o responsável legal', 120);
  if (passos.length === 1) return { erro: 'Não recebi nenhum dado para preencher. Pergunte ao usuário o que cadastrar.' };
  passos.push({ tipo: 'parar_no_botao', alvo: alvoDoCampo('empresa-salvar'), legenda: 'Salvar Empresa. Confira; a empresa só é gravada quando você clicar' });
  const p = plano('Preencher cadastro de empresa', passos);
  if ('erro' in p) return p;
  return { status: 'piloto_preparado', instrucao: `${INSTRUCAO_RESULTADO} Avise que, se o formulário já estiver com outra empresa em edição, os campos serão sobrescritos só na tela, e nada é salvo até ele clicar.`, ...p };
}

export const INSTRUCAO_PILOTO = `

PILOTO VISÍVEL (a tela muda sozinha)
- Quando o pedido envolve uma tela ("mostre onde está o problema", "abre o balancete da empresa X", "me leva lá"), use mostrar_na_tela: a tela do usuário navega, escolhe a empresa e a competência e destaca o ponto exato. Depois de consultar o problema, mostre a tela onde ele se resolve.
- Quando pedirem para preencher ("preenche esse lançamento", "cadastra essa conta", "cadastra essa empresa"), use preencher_na_tela. Ele FAZ à vista: abre pelo menu, aperta os botões de abrir e preenche campo por campo; no botão de gravar mostra o cartão "Confira e dê o OK" e só aperta depois do OK do contador. Use só os dados que o usuário disse; se faltar data, valor, conta ou histórico, pergunte ANTES. Nunca invente nem calcule valores, contas ou datas.
- Depois de chamar, diga em UMA frase o que ele vai ver e que pode interromper. Nunca diga que gravou: só grava depois do OK dele.
- O piloto nunca mexe em senha, token, certificado nem dados bancários; salvar, fechar período, enviar, pagar ou excluir só depois do OK no cartão; consulta paga ao Serpro só no clique do contador; nada em lote.
- Se o contador interferir, o piloto pausa sozinho. "Pode continuar", "continua", "segue" → continuar_piloto. "Em segundo plano", "faz por trás enquanto eu uso outra tela" → piloto_segundo_plano (termina de verdade, sem animação, mostrando o andamento, e avisa no fim; o que grava continua pedindo o OK). "Cancela", "para" → cancelar_piloto.`;

// ---------------------------------------------------------------------------------------------
// "Me leva lá" SEM IA (resposta instantânea): pedido explícito leva na hora; pergunta de "onde fica / como faço" responde em uma
// frase e oferece levar ("Quer que eu te leve?" + botão Me leva lá); o "sim" seguinte leva sem chamar o modelo.
// O plano só LEVA (clica no item do menu) e destaca a seção (so_mostrar): nunca aperta botão de gravar, enviar ou excluir.
// "O sistema tem X?" só responde "Tem sim" quando a tela ou a seção existe no mapa (regra de honestidade).
// ---------------------------------------------------------------------------------------------
/** Jeitos de falar de cada tela (só o que a tela tem de verdade; as seções vêm de SECOES_CONTABIL, conferidas contra o código). */
export const APELIDOS_TELAS_CONTABIL: Record<string, string[]> = {
  'inicio': ['inicio', 'tela inicial', 'painel', 'home'],
  'empresa': ['empresa', 'empresas', 'cadastro de empresa', 'dados da empresa', 'excluir empresa', 'apagar empresa'],
  'agenda': ['agenda', 'lembretes', 'agenda e lembretes'],
  'fluxo-previtico': ['fluxo de caixa previsto', 'fluxo previsto', 'previsao de caixa'],
  'modulos-finais': ['obrigacoes', 'obrigacoes e gestao'],
  'gestao-contabil': ['gestao contabil', 'conciliacao bancaria', 'extrato', 'extrato bancario', 'regras de conciliacao'],
  'conexoes': ['conexao orgaos', 'conexoes', 'orgaos'],
  'lancamentos': ['lancamentos', 'lancamento', 'lancamentos contabeis', 'partidas', 'lancamentos padrao'],
  'aprovacoes': ['aprovar lancamentos', 'aprovacoes', 'aprovacao', 'pre lancamentos', 'servicos preparados'],
  'balancete': ['balancete'],
  'livros': ['livros', 'livros fiscais', 'ecd', 'livro diario', 'livro razao', 'diario', 'razao', 'livro caixa', 'encerramento do resultado'],
  'demonstracoes': ['demonstracoes', 'relatorios', 'demonstracoes contabeis', 'dre', 'dva', 'dfc', 'dmpl', 'notas explicativas', 'relatorio para o cliente'],
  'plano-contas': ['plano de contas', 'contas', 'saldos iniciais'],
  'migracao': ['migracao', 'migracao contabil', 'backup do sistema anterior', 'trazer do sistema anterior', 'importar ecd'],
  'integracao': ['integracoes', 'integracao', 'fiscal para contabil', 'dp para contabil'],
  'revisao-origens': ['revisar dados recebidos', 'dados recebidos', 'conciliacao fiscal dp', 'previa da folha', 'previa das notas', 'trilha de auditoria'],
  'vigencia-obrigacoes': ['vigencia', 'vigencia das obrigacoes'],
  'calculadora': ['calculadora'],
  'agente': ['robos', 'saude dos robos'],
  'tarefas-equipe': ['tarefas', 'tarefas da equipe'],
  'backups': ['backups', 'backup'],
  'meu-jeito': ['meu jeito'],
  'revisor': ['revisor', 'revisao', 'corrigir'],
};
type DestinoContabil = { tela: TelaMapa; secao?: SecaoMapa };
function indiceDeLugares(): Array<{ item: DestinoContabil; nomes: string[]; chave: string }> {
  return [
    ...TELAS_CONTABIL.map((t) => ({ item: { tela: t }, nomes: [t.rotulo, ...(APELIDOS_TELAS_CONTABIL[t.id] || [])], chave: t.id })),
    ...SECOES_CONTABIL.flatMap((s) => { const t = TELAS_CONTABIL.find((x) => x.id === s.tela); return t ? [{ item: { tela: t, secao: s }, nomes: [s.texto], chave: `${t.id}#${s.chave}` }] : []; }),
  ];
}
export function destinoDoPedido(texto: string): DestinoContabil | null { return acharPorApelidos(assuntoDoPedidoDeLugar(texto), indiceDeLugares()); }
export function planoParaLevarContabil(d: DestinoContabil): PlanoPiloto | null {
  const passos: PassoPiloto[] = [passoTela(d.tela.id, d.tela.rotulo)];
  if (d.secao) passos.push({ tipo: 'destacar', alvo: `texto:${d.secao.texto}`, valor: MARCA_SO_MOSTRAR, legenda: `Aqui, ó: ${d.secao.texto}.` });
  const v = validarPlanoPiloto({ titulo: `Levando até ${d.tela.rotulo}`, passos });
  return v.ok ? v.plano : null;
}
export interface RespostaLevarContabil { resposta: string; piloto: PlanoPiloto | null; levarAgora: boolean }
const RE_NAO_E_LUGAR_C = /\b(quanto|quantos|quantas|quando|valor|aliquota|lei|artigo|porque|por que|status|situacao|vence|venceu|prazo|regra de|percentual)\b/;
export function respostaLevarContabil(mensagem: string, historico: Array<{ papel: string; texto: string }> = []): RespostaLevarContabil | null {
  const t = semAcentoAgil(mensagem);
  if (!t || t.split(' ').length > 16) return null;
  const levar = (d: DestinoContabil, agora: boolean, tem = false): RespostaLevarContabil | null => {
    const piloto = planoParaLevarContabil(d);
    if (!piloto) return null;
    const lugar = d.secao ? `${d.tela.rotulo}, em "${d.secao.texto}"` : d.tela.rotulo;
    return { piloto, levarAgora: agora, resposta: tem ? respostaTemSim(lugar) : agora ? `Abrindo ${d.tela.rotulo}.` : `Fica em ${lugar}. ${OFERTA_LEVAR}` };
  };
  if (ehSimParaLevar(mensagem)) {
    const i = historico.map((h) => h.papel).lastIndexOf('ia');
    if (i < 0 || !ofereceuLevar(historico[i].texto)) return null;
    const pergunta = [...historico.slice(0, i)].reverse().find((h) => h.papel === 'usuario');
    const d = pergunta ? destinoDoPedido(pergunta.texto) : null;
    return d ? levar(d, true) : null;
  }
  if (RE_NAO_E_LUGAR_C.test(t)) return null;
  if (ehPerguntaSeTem(mensagem)) {
    // Primeiro o que ainda NÃO tem (ou tem em parte): nunca dizer "tem sim" para isso.
    const falta = respostaDoQueFalta(mensagem, FUNCOES_QUE_FALTAM);
    if (falta) return { resposta: falta, piloto: null, levarAgora: false };
    const d = destinoDoPedido(mensagem); return d ? levar(d, false, true) : null;
  }
  if (ehPedidoDeLevar(mensagem)) { const d = destinoDoPedido(mensagem); return d ? levar(d, true) : null; }
  if (ehPerguntaDeLocal(mensagem)) { const d = destinoDoPedido(mensagem); return d ? levar(d, false) : null; }
  return null;
}
