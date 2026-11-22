// "Mais dados do cadastro" da empresa: campos opcionais que a migração do sistema anterior preenche e que a equipe pode
// ver e editar na tela Empresa (seção recolhível). Converte entre o cadastro (EmpresaDados) e o formulário (texto).
import type { EmpresaDados } from "../types";

export const CAMPOS_MAIS_DADOS: Array<[string, string]> = [
  ["codigoSistemaAnterior", "Código da empresa no sistema anterior"],
  ["descricaoAtividade", "Descrição da atividade"],
  ["logradouro", "Logradouro (ECD/ECF)"],
  ["numero", "Número (ECD/ECF)"],
  ["complemento", "Complemento"],
  ["bairro", "Bairro"],
  ["ecdCodigoMunicipioIbge", "Código IBGE do município"],
  ["fax", "Fax"],
  ["juntaComercialData", "Data do registro na Junta (DD/MM/AAAA)"],
  ["responsavelQualificacao", "Qualificação do responsável na ECD (ex.: 205)"],
  ["responsavelNascimento", "Nascimento do responsável (DD/MM/AAAA)"],
  ["inicioServicoContabil", "Início do serviço contábil no escritório (DD/MM/AAAA)"],
  ["ativaNoEscritorio", "Cliente ativo no escritório"],
  ["contadorCategoria", "Categoria do contador (Contador / Técnico em contabilidade)"],
  ["contadorRg", "RG do contador"],
  ["contadorRgOrgao", "Órgão do RG do contador"],
  ["contadorRgData", "Emissão do RG do contador (DD/MM/AAAA)"],
  ["diarioPagina", "Página atual do Diário"],
  ["razaoLivro", "Número do livro Razão"],
  ["razaoPagina", "Página atual do Razão"],
  ["caixaLivro", "Número do livro Caixa"],
  ["caixaPagina", "Página atual do Caixa"],
  ["planoMascara", "Máscara do código das contas (ex.: 9-9-99-99-99)"],
  ["contaApuracaoResultadoCodigo", "Conta de apuração do resultado"],
  ["contaLucroCodigo", "Conta de lucro"],
  ["contaPrejuizoCodigo", "Conta de prejuízo"],
  ["observacoes", "Observações"],
];

const TEXTO = new Set(CAMPOS_MAIS_DADOS.map(([k]) => k).filter((k) => !["ativaNoEscritorio", "diarioPagina", "razaoLivro", "razaoPagina", "caixaLivro", "caixaPagina"].includes(k)));

export function maisDadosDe(emp: Partial<EmpresaDados>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of TEXTO) { const v = (emp as any)[k]; if (v !== undefined && v !== null && v !== "") r[k] = String(v); }
  if (emp.ativaNoEscritorio !== undefined) r.ativaNoEscritorio = emp.ativaNoEscritorio ? "sim" : "nao";
  const n = emp.livrosNumeracao || {};
  if (n.diarioPagina) r.diarioPagina = String(n.diarioPagina);
  if (n.razao?.livro) r.razaoLivro = String(n.razao.livro);
  if (n.razao?.pagina) r.razaoPagina = String(n.razao.pagina);
  if (n.caixa?.livro) r.caixaLivro = String(n.caixa.livro);
  if (n.caixa?.pagina) r.caixaPagina = String(n.caixa.pagina);
  return r;
}

/** Campos para gravar (vazio = sem valor). Só devolve chaves do formulário; o resto do cadastro fica como está. */
export function maisDadosParaSalvar(f: Record<string, string>): Partial<EmpresaDados> {
  const r: Record<string, unknown> = {};
  for (const k of TEXTO) { const v = String(f[k] ?? "").trim(); r[k] = v || undefined; }
  r.ativaNoEscritorio = f.ativaNoEscritorio === "sim" ? true : f.ativaNoEscritorio === "nao" ? false : undefined;
  const num = (k: string) => { const n = Number(String(f[k] ?? "").trim()); return Number.isInteger(n) && n > 0 ? n : undefined; };
  const ln: NonNullable<EmpresaDados["livrosNumeracao"]> = {};
  if (num("diarioPagina")) ln.diarioPagina = num("diarioPagina");
  const par = (l: string, p: string) => { const x: { livro?: number; pagina?: number } = {}; if (num(l)) x.livro = num(l); if (num(p)) x.pagina = num(p); return Object.keys(x).length ? x : undefined; };
  const razao = par("razaoLivro", "razaoPagina"); if (razao) ln.razao = razao;
  const caixa = par("caixaLivro", "caixaPagina"); if (caixa) ln.caixa = caixa;
  r.livrosNumeracao = Object.keys(ln).length ? ln : undefined;
  return r as Partial<EmpresaDados>;
}
