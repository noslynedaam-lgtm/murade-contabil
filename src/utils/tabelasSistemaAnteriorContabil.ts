// Tabelas da parte contábil do sistema anterior que a migração por backup leva para o Murade Contábil.
// A mesma lista vale para o navegador (que separa só estas tabelas do backup antes de enviar) e para o servidor
// (que lê o texto recebido). Conferida por teste (scripts/testes/migracao-backup-contabil.test.ts).
//
// Ficam de fora, de propósito, só tabelas que não são dado das empresas: catálogos oficiais da Receita que o Murade
// já tem (plano referencial, linhas da ECF, códigos da Parte B), modelos de relatório do próprio programa, travas,
// registros de atualização do programa e a fila interna de processamento.

/** Tabelas comuns a todas as empresas (o vínculo com a empresa está numa coluna). */
export const TABELAS_FIXAS_CONTABIL = [
  'wphd.empresa',
  'wphd.socemp',
  'wphd.socios',
  'wphd.municipiosibge',
  'wphd.empresahistorico',
  'wphd.historico_nire',
  'wphd.historico_retencao',
  'wphd.travacontabil',
  'wcont.empcont',
  'wcont.pcont',
  'wcont.contas',
  'wcont.hist',
  'wcont.lancamento',
  'wcont.lauto',
  'wcont.lcontas',
  'wcont.titulos',
  'wcont.baixa_titulos',
  'wcont.titulos_provisao',
  'wcont.estabelecimento_cartao_credito',
  'wcont.movimento_cartao_credito',
  'wcont.operadora_cartao_de_credito',
  'wcont.lancamento_identificador_sequencial',
  'wcont.ecf_linha_conta',
  'wcont.ecf_conta_configuracao',
  'wcont.demonstrativo_contabil_configuracao',
  'wcont.demonstrativo_contabil_modelo',
  'wcont.demonstrativo_contabil_modelo_analise',
  'wcont.contador',
  'wcont.textoassbalanco',
  'wcont.textoassinatura',
  'wativo.emp_ativ',
  'wativo.empcfg',
  // 26/11/2026: integração Fiscal → Contábil do sistema anterior (fornecedor → conta, código fiscal → contas, grupos de clientes e
  // fornecedores do plano), que vira as regras do reconciliador das notas do Fiscal.
  'wfiscal.frninteg',
  'wfiscal.cadfism',
  'wfiscal.cfgcodintegracao',
] as const;

/** Tabelas por empresa: esquema + prefixo + código de 5 dígitos da empresa. */
export const TABELAS_POR_EMPRESA_CONTABIL: Array<{ esquema: string; prefixo: string; nome: string }> = [
  { esquema: 'wcont', prefixo: 'mv', nome: 'lançamentos' },
  { esquema: 'wcont', prefixo: 'sd', nome: 'saldos' },
  { esquema: 'wcont', prefixo: 'lt', nome: 'lotes' },
  { esquema: 'wativo', prefixo: 'be', nome: 'bens do imobilizado' },
];

const fixas = new Set<string>(TABELAS_FIXAS_CONTABIL);
const porEmpresa = TABELAS_POR_EMPRESA_CONTABIL.map((t) => ({ esquema: t.esquema, re: new RegExp(`^${t.prefixo}\\d{5}$`) }));

/** Diz se a tabela (esquema, nome) faz parte da parte contábil levada na migração. */
export function tabelaContabilInteressa(esquema: string, tabela: string): boolean {
  const e = String(esquema || '').toLowerCase();
  const t = String(tabela || '').toLowerCase();
  return fixas.has(`${e}.${t}`) || porEmpresa.some((p) => p.esquema === e && p.re.test(t));
}

/** Nome da tabela por empresa (ex.: wcont.mv00023). */
export function tabelaDaEmpresa(esquema: string, prefixo: string, cdempresa: number): string {
  return `${esquema}.${prefixo}${String(cdempresa).padStart(5, '0')}`;
}

/** Colunas que nunca são guardadas (credenciais de operadoras de cartão gravadas pelo sistema anterior). */
export const COLUNAS_NUNCA_GUARDAR = new Set(['senha', 'usuario', 'codigo_acesso_operadora']);
